import * as vscode from 'vscode';
import { logger } from './logger';

export interface MemoryUsage {
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
    arrayBuffers: number;
}

export interface MemoryOptimizationConfig {
    enableGarbageCollection: boolean;
    gcInterval: number; // in milliseconds
    memoryThreshold: number; // in MB
    enableMemoryMonitoring: boolean;
    cacheCleanupInterval: number; // in milliseconds
    maxCacheSize: number; // in MB
}

export interface MemoryReport {
    timestamp: number;
    usage: MemoryUsage;
    optimizations: string[];
    recommendations: string[];
    cacheStats: {
        size: number;
        hitRate: number;
        entries: number;
    };
}

export class MemoryOptimizer {
    private contextLogger = logger.createContextLogger('MemoryOptimizer');
    private config: MemoryOptimizationConfig;
    private gcTimer: NodeJS.Timeout | null = null;
    private monitoringTimer: NodeJS.Timeout | null = null;
    private cacheCleanupTimer: NodeJS.Timeout | null = null;
    private memoryHistory: MemoryUsage[] = [];
    private readonly MAX_HISTORY_SIZE = 100;
    private caches = new Map<string, Map<string, any>>();
    private cacheStats = new Map<string, { hits: number; misses: number; size: number }>();

    constructor() {
        this.config = this.getDefaultConfig();
        this.contextLogger.info('MemoryOptimizer initialized');
    }

    /**
     * Initialize memory optimization
     */
    public async initialize(): Promise<void> {
        try {
            // Load configuration
            await this.loadConfiguration();

            // Start garbage collection if enabled
            if (this.config.enableGarbageCollection) {
                this.startGarbageCollection();
            }

            // Start memory monitoring if enabled
            if (this.config.enableMemoryMonitoring) {
                this.startMemoryMonitoring();
            }

            // Start cache cleanup
            this.startCacheCleanup();

            this.contextLogger.info('Memory optimization initialized', {
                gcEnabled: this.config.enableGarbageCollection,
                monitoringEnabled: this.config.enableMemoryMonitoring,
                gcInterval: this.config.gcInterval,
                memoryThreshold: this.config.memoryThreshold
            });

        } catch (error) {
            this.contextLogger.error('Failed to initialize memory optimization', error as Error);
            throw error;
        }
    }

    /**
     * Get current memory usage
     */
    public getMemoryUsage(): MemoryUsage {
        const usage = process.memoryUsage();
        return {
            heapUsed: Math.round(usage.heapUsed / 1024 / 1024), // MB
            heapTotal: Math.round(usage.heapTotal / 1024 / 1024), // MB
            external: Math.round(usage.external / 1024 / 1024), // MB
            rss: Math.round(usage.rss / 1024 / 1024), // MB
            arrayBuffers: Math.round(usage.arrayBuffers / 1024 / 1024) // MB
        };
    }

    /**
     * Force garbage collection
     */
    public forceGarbageCollection(): void {
        try {
            if (global.gc) {
                const beforeUsage = this.getMemoryUsage();
                global.gc();
                const afterUsage = this.getMemoryUsage();
                
                const freed = beforeUsage.heapUsed - afterUsage.heapUsed;
                this.contextLogger.info('Forced garbage collection completed', {
                    freedMemory: freed,
                    beforeHeap: beforeUsage.heapUsed,
                    afterHeap: afterUsage.heapUsed
                });
            } else {
                this.contextLogger.warn('Garbage collection not available (run with --expose-gc)');
            }
        } catch (error) {
            this.contextLogger.error('Failed to force garbage collection', error as Error);
        }
    }

    /**
     * Optimize memory usage
     */
    public async optimizeMemory(): Promise<string[]> {
        const optimizations: string[] = [];

        try {
            const usage = this.getMemoryUsage();
            
            // Check if memory usage is above threshold
            if (usage.heapUsed > this.config.memoryThreshold) {
                // Clear caches
                const clearedCaches = this.clearCaches();
                if (clearedCaches > 0) {
                    optimizations.push(`Cleared ${clearedCaches} cache entries`);
                }

                // Force garbage collection
                if (global.gc) {
                    this.forceGarbageCollection();
                    optimizations.push('Forced garbage collection');
                }

                // Clear memory history if it's too large
                if (this.memoryHistory.length > this.MAX_HISTORY_SIZE) {
                    this.memoryHistory = this.memoryHistory.slice(-50);
                    optimizations.push('Trimmed memory history');
                }

                this.contextLogger.info('Memory optimization completed', {
                    optimizations: optimizations.length,
                    memoryUsage: usage.heapUsed
                });
            }

        } catch (error) {
            this.contextLogger.error('Memory optimization failed', error as Error);
        }

        return optimizations;
    }

    /**
     * Create or get a cache
     */
    public getCache<T>(name: string): Map<string, T> {
        if (!this.caches.has(name)) {
            this.caches.set(name, new Map<string, T>());
            this.cacheStats.set(name, { hits: 0, misses: 0, size: 0 });
        }
        return this.caches.get(name) as Map<string, T>;
    }

    /**
     * Get from cache with statistics
     */
    public getCacheValue<T>(cacheName: string, key: string): T | undefined {
        const cache = this.getCache<T>(cacheName);
        const stats = this.cacheStats.get(cacheName)!;

        if (cache.has(key)) {
            stats.hits++;
            return cache.get(key);
        } else {
            stats.misses++;
            return undefined;
        }
    }

    /**
     * Set cache value with size tracking
     */
    public setCacheValue<T>(cacheName: string, key: string, value: T): void {
        const cache = this.getCache<T>(cacheName);
        const stats = this.cacheStats.get(cacheName)!;

        // Estimate size (rough approximation)
        const estimatedSize = this.estimateObjectSize(value);
        
        // Check if adding this would exceed cache size limit
        const currentCacheSize = this.getCacheSize(cacheName);
        if (currentCacheSize + estimatedSize > this.config.maxCacheSize * 1024 * 1024) {
            // Remove oldest entries (LRU-style)
            this.evictCacheEntries(cacheName, Math.ceil(cache.size * 0.2)); // Remove 20%
        }

        cache.set(key, value);
        stats.size = cache.size;
    }

    /**
     * Clear specific cache
     */
    public clearCache(name: string): number {
        const cache = this.caches.get(name);
        if (cache) {
            const size = cache.size;
            cache.clear();
            const stats = this.cacheStats.get(name);
            if (stats) {
                stats.size = 0;
            }
            return size;
        }
        return 0;
    }

    /**
     * Clear all caches
     */
    public clearCaches(): number {
        let totalCleared = 0;
        for (const [name] of this.caches) {
            totalCleared += this.clearCache(name);
        }
        return totalCleared;
    }

    /**
     * Get cache statistics
     */
    public getCacheStatistics(): { [cacheName: string]: { hits: number; misses: number; hitRate: number; size: number } } {
        const stats: { [cacheName: string]: { hits: number; misses: number; hitRate: number; size: number } } = {};
        
        for (const [name, stat] of this.cacheStats) {
            const total = stat.hits + stat.misses;
            stats[name] = {
                hits: stat.hits,
                misses: stat.misses,
                hitRate: total > 0 ? (stat.hits / total) * 100 : 0,
                size: stat.size
            };
        }
        
        return stats;
    }

    /**
     * Generate memory report
     */
    public generateMemoryReport(): MemoryReport {
        const usage = this.getMemoryUsage();
        const optimizations: string[] = [];
        const recommendations: string[] = [];

        // Add to history
        this.memoryHistory.push(usage);
        if (this.memoryHistory.length > this.MAX_HISTORY_SIZE) {
            this.memoryHistory.shift();
        }

        // Generate recommendations based on usage
        if (usage.heapUsed > this.config.memoryThreshold) {
            recommendations.push('Memory usage is above threshold - consider clearing caches');
        }

        if (usage.heapUsed > usage.heapTotal * 0.8) {
            recommendations.push('Heap usage is high - garbage collection recommended');
        }

        const cacheStats = this.getCacheStatistics();
        const totalCacheEntries = Object.values(cacheStats).reduce((sum, stat) => sum + stat.size, 0);
        const avgHitRate = Object.values(cacheStats).reduce((sum, stat) => sum + stat.hitRate, 0) / Object.keys(cacheStats).length || 0;

        if (avgHitRate < 50) {
            recommendations.push('Cache hit rate is low - review caching strategy');
        }

        return {
            timestamp: Date.now(),
            usage,
            optimizations,
            recommendations,
            cacheStats: {
                size: totalCacheEntries,
                hitRate: avgHitRate,
                entries: Object.keys(cacheStats).length
            }
        };
    }

    /**
     * Start automatic garbage collection
     */
    private startGarbageCollection(): void {
        if (this.gcTimer) {
            clearInterval(this.gcTimer);
        }

        this.gcTimer = setInterval(() => {
            const usage = this.getMemoryUsage();
            if (usage.heapUsed > this.config.memoryThreshold) {
                this.forceGarbageCollection();
            }
        }, this.config.gcInterval);

        this.contextLogger.info('Automatic garbage collection started', {
            interval: this.config.gcInterval,
            threshold: this.config.memoryThreshold
        });
    }

    /**
     * Start memory monitoring
     */
    private startMemoryMonitoring(): void {
        if (this.monitoringTimer) {
            clearInterval(this.monitoringTimer);
        }

        this.monitoringTimer = setInterval(() => {
            const usage = this.getMemoryUsage();
            this.memoryHistory.push(usage);
            
            if (this.memoryHistory.length > this.MAX_HISTORY_SIZE) {
                this.memoryHistory.shift();
            }

            // Log warning if memory usage is high
            if (usage.heapUsed > this.config.memoryThreshold * 1.5) {
                this.contextLogger.warn('High memory usage detected', {
                    heapUsed: usage.heapUsed,
                    threshold: this.config.memoryThreshold
                });
            }
        }, 30000); // Monitor every 30 seconds

        this.contextLogger.info('Memory monitoring started');
    }

    /**
     * Start cache cleanup
     */
    private startCacheCleanup(): void {
        if (this.cacheCleanupTimer) {
            clearInterval(this.cacheCleanupTimer);
        }

        this.cacheCleanupTimer = setInterval(() => {
            this.cleanupCaches();
        }, this.config.cacheCleanupInterval);

        this.contextLogger.info('Cache cleanup started', {
            interval: this.config.cacheCleanupInterval
        });
    }

    /**
     * Cleanup caches based on usage patterns
     */
    private cleanupCaches(): void {
        for (const [name, cache] of this.caches) {
            const stats = this.cacheStats.get(name);
            if (stats && stats.size > 1000) { // If cache has more than 1000 entries
                // Remove 10% of entries (simple cleanup strategy)
                this.evictCacheEntries(name, Math.ceil(cache.size * 0.1));
            }
        }
    }

    /**
     * Evict cache entries (LRU-style)
     */
    private evictCacheEntries(cacheName: string, count: number): void {
        const cache = this.caches.get(cacheName);
        if (!cache) return;

        const entries = Array.from(cache.keys());
        for (let i = 0; i < Math.min(count, entries.length); i++) {
            cache.delete(entries[i]);
        }

        const stats = this.cacheStats.get(cacheName);
        if (stats) {
            stats.size = cache.size;
        }
    }

    /**
     * Estimate object size (rough approximation)
     */
    private estimateObjectSize(obj: any): number {
        try {
            return JSON.stringify(obj).length * 2; // Rough estimate: 2 bytes per character
        } catch {
            return 1024; // Default estimate for non-serializable objects
        }
    }

    /**
     * Get cache size in bytes
     */
    private getCacheSize(cacheName: string): number {
        const cache = this.caches.get(cacheName);
        if (!cache) return 0;

        let totalSize = 0;
        for (const [key, value] of cache) {
            totalSize += key.length * 2; // Key size
            totalSize += this.estimateObjectSize(value); // Value size
        }
        return totalSize;
    }

    /**
     * Load configuration from VS Code settings
     */
    private async loadConfiguration(): Promise<void> {
        const config = vscode.workspace.getConfiguration('flowcode.performance');
        
        this.config = {
            enableGarbageCollection: config.get<boolean>('enableGarbageCollection', true),
            gcInterval: config.get<number>('gcInterval', 300000), // 5 minutes
            memoryThreshold: config.get<number>('memoryThreshold', 200), // 200 MB
            enableMemoryMonitoring: config.get<boolean>('enableMemoryMonitoring', true),
            cacheCleanupInterval: config.get<number>('cacheCleanupInterval', 600000), // 10 minutes
            maxCacheSize: config.get<number>('maxCacheSize', 50) // 50 MB per cache
        };
    }

    /**
     * Get default configuration
     */
    private getDefaultConfig(): MemoryOptimizationConfig {
        return {
            enableGarbageCollection: true,
            gcInterval: 300000, // 5 minutes
            memoryThreshold: 200, // 200 MB
            enableMemoryMonitoring: true,
            cacheCleanupInterval: 600000, // 10 minutes
            maxCacheSize: 50 // 50 MB per cache
        };
    }

    /**
     * Get memory history
     */
    public getMemoryHistory(): MemoryUsage[] {
        return [...this.memoryHistory];
    }

    /**
     * Dispose resources
     */
    public dispose(): void {
        if (this.gcTimer) {
            clearInterval(this.gcTimer);
            this.gcTimer = null;
        }

        if (this.monitoringTimer) {
            clearInterval(this.monitoringTimer);
            this.monitoringTimer = null;
        }

        if (this.cacheCleanupTimer) {
            clearInterval(this.cacheCleanupTimer);
            this.cacheCleanupTimer = null;
        }

        this.clearCaches();
        this.contextLogger.info('MemoryOptimizer disposed');
    }
}
