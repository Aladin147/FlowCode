import { logger } from './logger';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

export interface CacheEntry<T> {
    value: T;
    timestamp: number;
    ttl: number;
    accessCount: number;
    lastAccessed: number;
    size: number;
    hash: string;
    metadata?: Record<string, any>;
}

export interface CacheStrategy {
    name: string;
    shouldEvict: (entry: CacheEntry<any>, now: number) => boolean;
    priority: (entry: CacheEntry<any>, now: number) => number;
}

export interface CacheStats {
    hits: number;
    misses: number;
    evictions: number;
    totalSize: number;
    entryCount: number;
    hitRate: number;
    averageAccessTime: number;
}

export class AdvancedCache<T> {
    private cache = new Map<string, CacheEntry<T>>();
    private stats: CacheStats = {
        hits: 0,
        misses: 0,
        evictions: 0,
        totalSize: 0,
        entryCount: 0,
        hitRate: 0,
        averageAccessTime: 0
    };
    private contextLogger = logger.createContextLogger('AdvancedCache');
    private cleanupInterval?: NodeJS.Timeout;

    constructor(
        private maxSize: number = 50 * 1024 * 1024, // 50MB
        private maxEntries: number = 1000,
        private defaultTTL: number = 30000, // 30 seconds
        private strategy: CacheStrategy = CACHE_STRATEGIES.LRU,
        private persistPath?: string
    ) {
        this.startCleanupInterval();
        if (persistPath) {
            this.loadFromDisk();
        }
    }

    public set(key: string, value: T, ttl?: number, metadata?: Record<string, any>): void {
        const now = Date.now();
        const serialized = JSON.stringify(value);
        const size = Buffer.byteLength(serialized, 'utf8');
        const hash = crypto.createHash('md5').update(serialized).digest('hex');

        // Check if we need to evict entries
        this.evictIfNeeded(size);

        const entry: CacheEntry<T> = {
            value,
            timestamp: now,
            ttl: ttl || this.defaultTTL,
            accessCount: 0,
            lastAccessed: now,
            size,
            hash,
            metadata
        };

        this.cache.set(key, entry);
        this.stats.totalSize += size;
        this.stats.entryCount++;

        this.contextLogger.debug(`Cache set: ${key}`, { size, ttl: entry.ttl });
    }

    public get(key: string): T | undefined {
        const startTime = Date.now();
        const entry = this.cache.get(key);

        if (!entry) {
            this.stats.misses++;
            this.updateStats();
            return undefined;
        }

        const now = Date.now();

        // Check if entry has expired
        if (now - entry.timestamp > entry.ttl) {
            this.delete(key);
            this.stats.misses++;
            this.updateStats();
            return undefined;
        }

        // Update access statistics
        entry.accessCount++;
        entry.lastAccessed = now;

        this.stats.hits++;
        this.stats.averageAccessTime = (this.stats.averageAccessTime + (Date.now() - startTime)) / 2;
        this.updateStats();

        this.contextLogger.debug(`Cache hit: ${key}`, { accessCount: entry.accessCount });
        return entry.value;
    }

    public has(key: string): boolean {
        const entry = this.cache.get(key);
        if (!entry) return false;

        const now = Date.now();
        if (now - entry.timestamp > entry.ttl) {
            this.delete(key);
            return false;
        }

        return true;
    }

    public delete(key: string): boolean {
        const entry = this.cache.get(key);
        if (!entry) return false;

        this.cache.delete(key);
        this.stats.totalSize -= entry.size;
        this.stats.entryCount--;

        this.contextLogger.debug(`Cache delete: ${key}`, { size: entry.size });
        return true;
    }

    public clear(): void {
        this.cache.clear();
        this.stats = {
            hits: 0,
            misses: 0,
            evictions: 0,
            totalSize: 0,
            entryCount: 0,
            hitRate: 0,
            averageAccessTime: 0
        };
        this.contextLogger.info('Cache cleared');
    }

    private evictIfNeeded(newEntrySize: number): void {
        const now = Date.now();

        // Remove expired entries first
        for (const [key, entry] of this.cache.entries()) {
            if (now - entry.timestamp > entry.ttl) {
                this.delete(key);
                this.stats.evictions++;
            }
        }

        // Check if we still need to evict based on size or count
        while (
            (this.stats.totalSize + newEntrySize > this.maxSize) ||
            (this.stats.entryCount >= this.maxEntries)
        ) {
            const entryToEvict = this.selectEntryForEviction();
            if (!entryToEvict) break;

            this.delete(entryToEvict);
            this.stats.evictions++;
        }
    }

    private selectEntryForEviction(): string | undefined {
        if (this.cache.size === 0) return undefined;

        const now = Date.now();
        let selectedKey: string | undefined;
        let lowestPriority = Infinity;

        for (const [key, entry] of this.cache.entries()) {
            if (this.strategy.shouldEvict(entry, now)) {
                const priority = this.strategy.priority(entry, now);
                if (priority < lowestPriority) {
                    lowestPriority = priority;
                    selectedKey = key;
                }
            }
        }

        return selectedKey;
    }

    private updateStats(): void {
        const total = this.stats.hits + this.stats.misses;
        this.stats.hitRate = total > 0 ? (this.stats.hits / total) * 100 : 0;
    }

    private startCleanupInterval(): void {
        this.cleanupInterval = setInterval(() => {
            this.cleanup();
        }, 60000); // Cleanup every minute
    }

    private cleanup(): void {
        const now = Date.now();
        let cleaned = 0;

        for (const [key, entry] of this.cache.entries()) {
            if (now - entry.timestamp > entry.ttl) {
                this.delete(key);
                cleaned++;
            }
        }

        if (cleaned > 0) {
            this.contextLogger.debug(`Cleanup removed ${cleaned} expired entries`);
        }
    }

    public getStats(): CacheStats {
        return { ...this.stats };
    }

    public getEntryInfo(key: string): Partial<CacheEntry<T>> | undefined {
        const entry = this.cache.get(key);
        if (!entry) return undefined;

        return {
            timestamp: entry.timestamp,
            ttl: entry.ttl,
            accessCount: entry.accessCount,
            lastAccessed: entry.lastAccessed,
            size: entry.size,
            hash: entry.hash,
            metadata: entry.metadata
        };
    }

    private async saveToDisk(): Promise<void> {
        if (!this.persistPath) return;

        try {
            const data = {
                entries: Array.from(this.cache.entries()),
                stats: this.stats,
                timestamp: Date.now()
            };

            fs.writeFileSync(this.persistPath, JSON.stringify(data, null, 2));
            this.contextLogger.debug(`Cache persisted to ${this.persistPath}`);
        } catch (error) {
            this.contextLogger.error('Failed to save cache to disk', error as Error);
        }
    }

    private loadFromDisk(): void {
        if (!this.persistPath || !fs.existsSync(this.persistPath)) return;

        try {
            const data = JSON.parse(fs.readFileSync(this.persistPath, 'utf8'));
            const now = Date.now();

            // Load entries that haven't expired
            for (const [key, entry] of data.entries) {
                if (now - entry.timestamp <= entry.ttl) {
                    this.cache.set(key, entry);
                }
            }

            this.contextLogger.debug(`Cache loaded from ${this.persistPath}`, {
                entries: this.cache.size
            });
        } catch (error) {
            this.contextLogger.error('Failed to load cache from disk', error as Error);
        }
    }

    public dispose(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }

        if (this.persistPath) {
            this.saveToDisk();
        }

        this.clear();
        this.contextLogger.info('Cache disposed');
    }
}

// Predefined caching strategies
export const CACHE_STRATEGIES = {
    // Least Recently Used
    LRU: {
        name: 'LRU',
        shouldEvict: () => true,
        priority: (entry: CacheEntry<any>, now: number) => entry.lastAccessed
    } as CacheStrategy,

    // Least Frequently Used
    LFU: {
        name: 'LFU',
        shouldEvict: () => true,
        priority: (entry: CacheEntry<any>) => entry.accessCount
    } as CacheStrategy,

    // Time-based eviction (oldest first)
    FIFO: {
        name: 'FIFO',
        shouldEvict: () => true,
        priority: (entry: CacheEntry<any>) => entry.timestamp
    } as CacheStrategy,

    // Size-based eviction (largest first)
    SIZE_BASED: {
        name: 'SIZE_BASED',
        shouldEvict: () => true,
        priority: (entry: CacheEntry<any>) => -entry.size // Negative for largest first
    } as CacheStrategy,

    // Adaptive replacement cache (combination of LRU and LFU)
    ARC: {
        name: 'ARC',
        shouldEvict: () => true,
        priority: (entry: CacheEntry<any>, now: number) => {
            const recency = now - entry.lastAccessed;
            const frequency = entry.accessCount;
            return recency / Math.max(frequency, 1); // Balance recency and frequency
        }
    } as CacheStrategy
};
