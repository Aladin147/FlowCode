import { logger } from './logger';

export interface PerformanceTarget {
    maxDuration: number;
    warningThreshold: number;
    operation: string;
}

export interface OptimizationResult {
    originalDuration: number;
    optimizedDuration: number;
    improvement: number;
    success: boolean;
    strategy: string;
}

export class PerformanceOptimizer {
    private static instance: PerformanceOptimizer;
    private contextLogger = logger.createContextLogger('PerformanceOptimizer');
    private performanceTargets: Map<string, PerformanceTarget> = new Map();

    // Performance targets for different operations
    private readonly DEFAULT_TARGETS: Record<string, PerformanceTarget> = {
        'companion-guard': { maxDuration: 500, warningThreshold: 300, operation: 'Real-time linting' },
        'eslint-check': { maxDuration: 200, warningThreshold: 150, operation: 'ESLint validation' },
        'typescript-check': { maxDuration: 300, warningThreshold: 200, operation: 'TypeScript validation' },
        'python-check': { maxDuration: 250, warningThreshold: 180, operation: 'Python linting' },
        'final-guard': { maxDuration: 2000, warningThreshold: 1500, operation: 'Pre-push validation' },
        'architect-refactor': { maxDuration: 5000, warningThreshold: 3000, operation: 'AI refactoring' },
        'graph-generation': { maxDuration: 1000, warningThreshold: 700, operation: 'Code graph generation' },
        'hotfix-creation': { maxDuration: 1500, warningThreshold: 1000, operation: 'Hotfix creation' }
    };

    private constructor() {
        this.initializeTargets();
    }

    public static getInstance(): PerformanceOptimizer {
        if (!PerformanceOptimizer.instance) {
            PerformanceOptimizer.instance = new PerformanceOptimizer();
        }
        return PerformanceOptimizer.instance;
    }

    private initializeTargets(): void {
        Object.entries(this.DEFAULT_TARGETS).forEach(([key, target]) => {
            this.performanceTargets.set(key, target);
        });
    }

    public setTarget(operation: string, target: PerformanceTarget): void {
        this.performanceTargets.set(operation, target);
    }

    public getTarget(operation: string): PerformanceTarget | undefined {
        return this.performanceTargets.get(operation);
    }

    public async optimizeOperation<T>(
        operation: string,
        fn: () => Promise<T>,
        optimizations: OptimizationStrategy[] = []
    ): Promise<{ result: T; optimization: OptimizationResult }> {
        const target = this.performanceTargets.get(operation);
        if (!target) {
            throw new Error(`No performance target defined for operation: ${operation}`);
        }

        const startTime = Date.now();
        let result: T;
        let strategy = 'none';

        try {
            // Try optimizations in order of preference
            for (const optimization of optimizations) {
                const optimizedFn = this.applyOptimization(fn, optimization);
                const testStart = Date.now();
                result = await optimizedFn();
                const testDuration = Date.now() - testStart;

                if (testDuration <= target.maxDuration) {
                    strategy = optimization.name;
                    break;
                }
            }

            // If no optimization worked, run original function
            if (!result!) {
                result = await fn();
                strategy = 'original';
            }

            const totalDuration = Date.now() - startTime;
            const success = totalDuration <= target.maxDuration;

            if (totalDuration > target.warningThreshold) {
                this.contextLogger.warn(`Performance warning for ${operation}`, {
                    duration: totalDuration,
                    target: target.maxDuration,
                    strategy
                });
            }

            return {
                result,
                optimization: {
                    originalDuration: totalDuration,
                    optimizedDuration: totalDuration,
                    improvement: 0,
                    success,
                    strategy
                }
            };
        } catch (error) {
            this.contextLogger.error(`Performance optimization failed for ${operation}`, error as Error);
            throw error;
        }
    }

    private applyOptimization<T>(fn: () => Promise<T>, strategy: OptimizationStrategy): () => Promise<T> {
        switch (strategy.type) {
            case 'debounce':
                return this.debounce(fn, strategy.params.delay || 100);
            case 'throttle':
                return this.throttle(fn, strategy.params.interval || 100);
            case 'cache':
                return this.cache(fn, strategy.params.ttl || 30000);
            case 'batch':
                return this.batch(fn, strategy.params.batchSize || 10, strategy.params.delay || 50);
            default:
                return fn;
        }
    }

    private debounce<T>(fn: () => Promise<T>, delay: number): () => Promise<T> {
        let timeoutId: NodeJS.Timeout;
        let lastPromise: Promise<T>;

        return () => {
            if (lastPromise) {
                return lastPromise;
            }

            return new Promise((resolve, reject) => {
                clearTimeout(timeoutId);
                timeoutId = setTimeout(async () => {
                    try {
                        const result = await fn();
                        resolve(result);
                        lastPromise = null as any;
                    } catch (error) {
                        reject(error);
                        lastPromise = null as any;
                    }
                }, delay);
            });
        };
    }

    private throttle<T>(fn: () => Promise<T>, interval: number): () => Promise<T> {
        let lastCall = 0;
        let lastResult: T;

        return async () => {
            const now = Date.now();
            if (now - lastCall >= interval) {
                lastCall = now;
                lastResult = await fn();
            }
            return lastResult;
        };
    }

    private cache<T>(fn: () => Promise<T>, ttl: number): () => Promise<T> {
        let cachedResult: T;
        let cacheTime = 0;

        return async () => {
            const now = Date.now();
            if (cachedResult && (now - cacheTime) < ttl) {
                return cachedResult;
            }

            cachedResult = await fn();
            cacheTime = now;
            return cachedResult;
        };
    }

    private batch<T>(fn: () => Promise<T>, batchSize: number, delay: number): () => Promise<T> {
        const queue: Array<{ resolve: (value: T) => void; reject: (error: any) => void }> = [];
        let processing = false;

        const processBatch = async () => {
            if (processing || queue.length === 0) return;
            processing = true;

            const batch = queue.splice(0, batchSize);
            try {
                const result = await fn();
                batch.forEach(({ resolve }) => resolve(result));
            } catch (error) {
                batch.forEach(({ reject }) => reject(error));
            } finally {
                processing = false;
                if (queue.length > 0) {
                    setTimeout(processBatch, delay);
                }
            }
        };

        return () => {
            return new Promise<T>((resolve, reject) => {
                queue.push({ resolve, reject });
                setTimeout(processBatch, delay);
            });
        };
    }

    public measurePerformance<T>(operation: string, fn: () => Promise<T>): Promise<{ result: T; duration: number; success: boolean }> {
        const target = this.performanceTargets.get(operation);
        const startTime = Date.now();

        return fn().then(result => {
            const duration = Date.now() - startTime;
            const success = !target || duration <= target.maxDuration;

            if (target && duration > target.warningThreshold) {
                this.contextLogger.warn(`Performance target exceeded for ${operation}`, {
                    duration,
                    target: target.maxDuration,
                    threshold: target.warningThreshold
                });
            }

            return { result, duration, success };
        }).catch(error => {
            const duration = Date.now() - startTime;
            this.contextLogger.error(`Performance measurement failed for ${operation}`, error as Error);
            throw error;
        });
    }

    public getPerformanceReport(): Record<string, PerformanceTarget> {
        const report: Record<string, PerformanceTarget> = {};
        this.performanceTargets.forEach((target, operation) => {
            report[operation] = { ...target };
        });
        return report;
    }
}

export interface OptimizationStrategy {
    name: string;
    type: 'debounce' | 'throttle' | 'cache' | 'batch';
    params: Record<string, any>;
}

// Pre-defined optimization strategies
export const OPTIMIZATION_STRATEGIES = {
    FAST_DEBOUNCE: { name: 'fast-debounce', type: 'debounce' as const, params: { delay: 50 } },
    STANDARD_DEBOUNCE: { name: 'standard-debounce', type: 'debounce' as const, params: { delay: 200 } },
    AGGRESSIVE_CACHE: { name: 'aggressive-cache', type: 'cache' as const, params: { ttl: 60000 } },
    STANDARD_CACHE: { name: 'standard-cache', type: 'cache' as const, params: { ttl: 30000 } },
    FAST_THROTTLE: { name: 'fast-throttle', type: 'throttle' as const, params: { interval: 100 } },
    BATCH_SMALL: { name: 'batch-small', type: 'batch' as const, params: { batchSize: 5, delay: 25 } }
};
