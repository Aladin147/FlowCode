import * as crypto from 'crypto';
import { logger } from './logger';
import { AdvancedCache, CACHE_STRATEGIES } from './advanced-cache';

export interface CacheEntry<T> {
    value: T;
    timestamp: number;
    ttl: number;
    accessCount: number;
    lastAccessed: number;
    size: number;
}

export interface CacheStats {
    totalEntries: number;
    totalSize: number;
    hitRate: number;
    missRate: number;
    evictionCount: number;
    oldestEntry: number;
    newestEntry: number;
}

export interface CacheOptions {
    maxSize?: number;
    maxEntries?: number;
    defaultTTL?: number;
    cleanupInterval?: number;
    enableStats?: boolean;
}

export class PerformanceCache<T> {
    private cache = new Map<string, CacheEntry<T>>();
    private stats = {
        hits: 0,
        misses: 0,
        evictions: 0,
        totalSize: 0
    };
    
    private readonly maxSize: number;
    private readonly maxEntries: number;
    private readonly defaultTTL: number;
    private readonly enableStats: boolean;
    private cleanupTimer?: NodeJS.Timeout;
    private contextLogger = logger.createContextLogger('PerformanceCache');

    constructor(private name: string, options: CacheOptions = {}) {
        this.maxSize = options.maxSize || 50 * 1024 * 1024; // 50MB default
        this.maxEntries = options.maxEntries || 1000;
        this.defaultTTL = options.defaultTTL || 30 * 60 * 1000; // 30 minutes
        this.enableStats = options.enableStats !== false;
        
        // Start cleanup timer
        const cleanupInterval = options.cleanupInterval || 5 * 60 * 1000; // 5 minutes
        this.cleanupTimer = setInterval(() => this.cleanup(), cleanupInterval);
        
        this.contextLogger.info(`Cache '${name}' initialized`, {
            maxSize: this.maxSize,
            maxEntries: this.maxEntries,
            defaultTTL: this.defaultTTL
        });
    }

    /**
     * Get value from cache
     */
    public get(key: string): T | undefined {
        const entry = this.cache.get(key);
        
        if (!entry) {
            if (this.enableStats) this.stats.misses++;
            return undefined;
        }

        // Check if expired
        if (Date.now() - entry.timestamp > entry.ttl) {
            this.cache.delete(key);
            this.stats.totalSize -= entry.size;
            if (this.enableStats) this.stats.misses++;
            return undefined;
        }

        // Update access stats
        entry.accessCount++;
        entry.lastAccessed = Date.now();
        if (this.enableStats) this.stats.hits++;

        return entry.value;
    }

    /**
     * Set value in cache
     */
    public set(key: string, value: T, ttl?: number): void {
        const size = this.calculateSize(value);
        const now = Date.now();
        
        // Check if we need to evict entries
        this.ensureCapacity(size);

        const entry: CacheEntry<T> = {
            value,
            timestamp: now,
            ttl: ttl || this.defaultTTL,
            accessCount: 1,
            lastAccessed: now,
            size
        };

        // Remove existing entry if it exists
        const existing = this.cache.get(key);
        if (existing) {
            this.stats.totalSize -= existing.size;
        }

        this.cache.set(key, entry);
        this.stats.totalSize += size;

        this.contextLogger.debug(`Cache '${this.name}' set`, {
            key: key.substring(0, 50),
            size,
            totalEntries: this.cache.size,
            totalSize: this.stats.totalSize
        });
    }

    /**
     * Check if key exists and is not expired
     */
    public has(key: string): boolean {
        const entry = this.cache.get(key);
        if (!entry) return false;
        
        if (Date.now() - entry.timestamp > entry.ttl) {
            this.cache.delete(key);
            this.stats.totalSize -= entry.size;
            return false;
        }
        
        return true;
    }

    /**
     * Delete entry from cache
     */
    public delete(key: string): boolean {
        const entry = this.cache.get(key);
        if (entry) {
            this.stats.totalSize -= entry.size;
            return this.cache.delete(key);
        }
        return false;
    }

    /**
     * Clear all entries
     */
    public clear(): void {
        this.cache.clear();
        this.stats.totalSize = 0;
        this.contextLogger.info(`Cache '${this.name}' cleared`);
    }

    /**
     * Get or set with factory function
     */
    public async getOrSet(key: string, factory: () => Promise<T>, ttl?: number): Promise<T> {
        const cached = this.get(key);
        if (cached !== undefined) {
            return cached;
        }

        const value = await factory();
        this.set(key, value, ttl);
        return value;
    }

    /**
     * Get cache statistics
     */
    public getStats(): CacheStats {
        const entries = Array.from(this.cache.values());
        const now = Date.now();
        
        return {
            totalEntries: this.cache.size,
            totalSize: this.stats.totalSize,
            hitRate: this.stats.hits / (this.stats.hits + this.stats.misses) || 0,
            missRate: this.stats.misses / (this.stats.hits + this.stats.misses) || 0,
            evictionCount: this.stats.evictions,
            oldestEntry: entries.length > 0 ? Math.min(...entries.map(e => e.timestamp)) : now,
            newestEntry: entries.length > 0 ? Math.max(...entries.map(e => e.timestamp)) : now
        };
    }

    /**
     * Generate cache key from object
     */
    public static generateKey(obj: any): string {
        const str = typeof obj === 'string' ? obj : JSON.stringify(obj);
        return crypto.createHash('sha256').update(str).digest('hex');
    }

    /**
     * Cleanup expired entries
     */
    private cleanup(): void {
        const now = Date.now();
        let cleanedCount = 0;
        let cleanedSize = 0;

        for (const [key, entry] of this.cache.entries()) {
            if (now - entry.timestamp > entry.ttl) {
                this.cache.delete(key);
                this.stats.totalSize -= entry.size;
                cleanedCount++;
                cleanedSize += entry.size;
            }
        }

        if (cleanedCount > 0) {
            this.contextLogger.debug(`Cache '${this.name}' cleanup`, {
                cleanedEntries: cleanedCount,
                cleanedSize,
                remainingEntries: this.cache.size,
                remainingSize: this.stats.totalSize
            });
        }
    }

    /**
     * Ensure cache capacity by evicting entries if necessary
     */
    private ensureCapacity(newEntrySize: number): void {
        // Check entry count limit
        while (this.cache.size >= this.maxEntries) {
            this.evictLeastRecentlyUsed();
        }

        // Check size limit
        while (this.stats.totalSize + newEntrySize > this.maxSize) {
            this.evictLeastRecentlyUsed();
        }
    }

    /**
     * Evict least recently used entry
     */
    private evictLeastRecentlyUsed(): void {
        let oldestKey: string | undefined;
        let oldestTime = Date.now();

        for (const [key, entry] of this.cache.entries()) {
            if (entry.lastAccessed < oldestTime) {
                oldestTime = entry.lastAccessed;
                oldestKey = key;
            }
        }

        if (oldestKey) {
            const entry = this.cache.get(oldestKey)!;
            this.cache.delete(oldestKey);
            this.stats.totalSize -= entry.size;
            this.stats.evictions++;
            
            this.contextLogger.debug(`Cache '${this.name}' evicted LRU entry`, {
                key: oldestKey.substring(0, 50),
                size: entry.size,
                age: Date.now() - entry.timestamp
            });
        }
    }

    /**
     * Calculate approximate size of value
     */
    private calculateSize(value: T): number {
        try {
            if (typeof value === 'string') {
                return value.length * 2; // UTF-16 encoding
            }
            
            if (typeof value === 'number') {
                return 8; // 64-bit number
            }
            
            if (typeof value === 'boolean') {
                return 1;
            }
            
            if (value === null || value === undefined) {
                return 0;
            }
            
            // For objects, estimate based on JSON string length
            const jsonStr = JSON.stringify(value);
            return jsonStr.length * 2;
        } catch {
            return 1000; // Default estimate for complex objects
        }
    }

    /**
     * Dispose cache and cleanup resources
     */
    public dispose(): void {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = undefined;
        }
        
        this.clear();
        this.contextLogger.info(`Cache '${this.name}' disposed`);
    }
}

/**
 * Global cache manager for the extension
 */
export class CacheManager {
    private static caches = new Map<string, PerformanceCache<any>>();
    private static advancedCaches = new Map<string, AdvancedCache<any>>();
    private static contextLogger = logger.createContextLogger('CacheManager');

    /**
     * Get or create a cache instance
     */
    public static getCache<T>(name: string, options?: CacheOptions): PerformanceCache<T> {
        if (!this.caches.has(name)) {
            const cache = new PerformanceCache<T>(name, options);
            this.caches.set(name, cache);
            this.contextLogger.info(`Created cache: ${name}`);
        }
        
        return this.caches.get(name)!;
    }

    /**
     * Get or create an advanced cache instance with custom strategies
     */
    public static getAdvancedCache<T>(
        name: string,
        maxSize?: number,
        maxEntries?: number,
        defaultTTL?: number,
        strategy?: any,
        persistPath?: string
    ): AdvancedCache<T> {
        if (!this.advancedCaches.has(name)) {
            const cache = new AdvancedCache<T>(
                maxSize,
                maxEntries,
                defaultTTL,
                strategy || CACHE_STRATEGIES.ARC, // Use ARC as default for better performance
                persistPath
            );
            this.advancedCaches.set(name, cache);
            this.contextLogger.info(`Created advanced cache: ${name}`, {
                strategy: strategy?.name || 'ARC',
                maxSize,
                maxEntries
            });
        }

        return this.advancedCaches.get(name)!;
    }

    /**
     * Get all cache statistics
     */
    public static getAllStats(): Record<string, any> {
        const stats: Record<string, any> = {};

        // Regular cache stats
        for (const [name, cache] of this.caches.entries()) {
            stats[name] = {
                type: 'performance',
                ...cache.getStats()
            };
        }

        // Advanced cache stats
        for (const [name, cache] of this.advancedCaches.entries()) {
            stats[name] = {
                type: 'advanced',
                ...cache.getStats()
            };
        }

        return stats;
    }

    /**
     * Clear all caches
     */
    public static clearAll(): void {
        for (const cache of this.caches.values()) {
            cache.clear();
        }
        for (const cache of this.advancedCaches.values()) {
            cache.clear();
        }
        this.contextLogger.info('All caches cleared');
    }

    /**
     * Dispose all caches
     */
    public static disposeAll(): void {
        for (const cache of this.caches.values()) {
            cache.dispose();
        }
        for (const cache of this.advancedCaches.values()) {
            cache.dispose();
        }
        this.caches.clear();
        this.advancedCaches.clear();
        this.contextLogger.info('All caches disposed');
    }

    /**
     * Get cache performance report
     */
    public static getPerformanceReport(): {
        totalCaches: number;
        totalMemoryUsage: number;
        averageHitRate: number;
        recommendations: string[];
    } {
        const allStats = this.getAllStats();
        const cacheNames = Object.keys(allStats);

        let totalMemoryUsage = 0;
        let totalHitRate = 0;
        let validCaches = 0;
        const recommendations: string[] = [];

        for (const [name, stats] of Object.entries(allStats)) {
            if (stats.type === 'performance') {
                totalMemoryUsage += stats.totalSize || 0;
                if (stats.hitRate !== undefined) {
                    totalHitRate += stats.hitRate;
                    validCaches++;
                }

                // Generate recommendations
                if (stats.hitRate < 70) {
                    recommendations.push(`Cache '${name}' has low hit rate (${stats.hitRate.toFixed(1)}%). Consider adjusting TTL or cache size.`);
                }
                if (stats.totalSize > 10 * 1024 * 1024) { // 10MB
                    recommendations.push(`Cache '${name}' is using significant memory (${(stats.totalSize / 1024 / 1024).toFixed(1)}MB). Consider cleanup.`);
                }
            } else if (stats.type === 'advanced') {
                totalMemoryUsage += stats.totalSize || 0;
                if (stats.hitRate !== undefined) {
                    totalHitRate += stats.hitRate;
                    validCaches++;
                }

                if (stats.hitRate < 80) {
                    recommendations.push(`Advanced cache '${name}' has suboptimal hit rate (${stats.hitRate.toFixed(1)}%). Consider different strategy.`);
                }
            }
        }

        return {
            totalCaches: cacheNames.length,
            totalMemoryUsage,
            averageHitRate: validCaches > 0 ? totalHitRate / validCaches : 0,
            recommendations
        };
    }
}
