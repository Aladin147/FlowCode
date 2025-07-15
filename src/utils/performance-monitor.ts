import { logger } from './logger';

export interface PerformanceMetric {
    name: string;
    duration: number;
    timestamp: number;
    metadata?: Record<string, any>;
}

export interface PerformanceStats {
    name: string;
    count: number;
    totalDuration: number;
    averageDuration: number;
    minDuration: number;
    maxDuration: number;
    p50: number;
    p95: number;
    p99: number;
    lastExecuted: number;
}

export interface SystemMetrics {
    memoryUsage: NodeJS.MemoryUsage;
    cpuUsage: NodeJS.CpuUsage;
    timestamp: number;
}

export class PerformanceMonitor {
    private static instance: PerformanceMonitor;
    private metrics: PerformanceMetric[] = [];
    private activeTimers = new Map<string, { startTime: number; metadata?: Record<string, any> }>();
    private systemMetrics: SystemMetrics[] = [];
    private contextLogger = logger.createContextLogger('PerformanceMonitor');
    private metricsTimer?: NodeJS.Timeout;
    private readonly maxMetrics = 10000;
    private readonly maxSystemMetrics = 1000;

    private constructor() {
        // Start system metrics collection
        this.startSystemMetricsCollection();
    }

    public static getInstance(): PerformanceMonitor {
        if (!PerformanceMonitor.instance) {
            PerformanceMonitor.instance = new PerformanceMonitor();
        }
        return PerformanceMonitor.instance;
    }

    /**
     * Start timing an operation
     */
    public startTimer(name: string, metadata?: Record<string, any>): void {
        this.activeTimers.set(name, {
            startTime: performance.now(),
            metadata
        });
    }

    /**
     * End timing an operation and record metric
     */
    public endTimer(name: string, additionalMetadata?: Record<string, any>): number {
        const timer = this.activeTimers.get(name);
        if (!timer) {
            this.contextLogger.warn(`Timer '${name}' not found`);
            return 0;
        }

        const duration = performance.now() - timer.startTime;
        this.activeTimers.delete(name);

        const metric: PerformanceMetric = {
            name,
            duration,
            timestamp: Date.now(),
            metadata: { ...timer.metadata, ...additionalMetadata }
        };

        this.recordMetric(metric);
        return duration;
    }

    /**
     * Time a function execution
     */
    public async timeFunction<T>(
        name: string,
        fn: () => Promise<T>,
        metadata?: Record<string, any>
    ): Promise<T> {
        this.startTimer(name, metadata);
        try {
            const result = await fn();
            this.endTimer(name, { success: true });
            return result;
        } catch (error) {
            this.endTimer(name, { 
                success: false, 
                error: error instanceof Error ? error.message : 'Unknown error' 
            });
            throw error;
        }
    }

    /**
     * Time a synchronous function execution
     */
    public timeFunctionSync<T>(
        name: string,
        fn: () => T,
        metadata?: Record<string, any>
    ): T {
        this.startTimer(name, metadata);
        try {
            const result = fn();
            this.endTimer(name, { success: true });
            return result;
        } catch (error) {
            this.endTimer(name, { 
                success: false, 
                error: error instanceof Error ? error.message : 'Unknown error' 
            });
            throw error;
        }
    }

    /**
     * Record a metric directly
     */
    public recordMetric(metric: PerformanceMetric): void {
        this.metrics.push(metric);

        // Trim metrics if we exceed the limit
        if (this.metrics.length > this.maxMetrics) {
            this.metrics = this.metrics.slice(-this.maxMetrics);
        }

        // Log slow operations
        if (metric.duration > 1000) { // > 1 second
            this.contextLogger.warn(`Slow operation detected: ${metric.name} (${metric.duration}ms)`, {
                duration: metric.duration,
                metadata: metric.metadata
            } as any);
        }
    }

    /**
     * Get performance statistics for a specific operation
     */
    public getStats(name: string): PerformanceStats | null {
        const operationMetrics = this.metrics.filter(m => m.name === name);
        if (operationMetrics.length === 0) {
            return null;
        }

        const durations = operationMetrics.map(m => m.duration).sort((a, b) => a - b);
        const totalDuration = durations.reduce((sum, d) => sum + d, 0);

        return {
            name,
            count: operationMetrics.length,
            totalDuration,
            averageDuration: totalDuration / operationMetrics.length,
            minDuration: durations[0] ?? 0,
            maxDuration: durations[durations.length - 1] ?? 0,
            p50: this.percentile(durations, 0.5),
            p95: this.percentile(durations, 0.95),
            p99: this.percentile(durations, 0.99),
            lastExecuted: Math.max(...operationMetrics.map(m => m.timestamp))
        };
    }

    /**
     * Get all performance statistics
     */
    public getAllStats(): PerformanceStats[] {
        const operationNames = [...new Set(this.metrics.map(m => m.name))];
        return operationNames.map(name => this.getStats(name)!).filter(Boolean);
    }

    /**
     * Get recent metrics
     */
    public getRecentMetrics(minutes: number = 5): PerformanceMetric[] {
        const cutoff = Date.now() - (minutes * 60 * 1000);
        return this.metrics.filter(m => m.timestamp > cutoff);
    }

    /**
     * Get system metrics
     */
    public getSystemMetrics(): SystemMetrics[] {
        return [...this.systemMetrics];
    }

    /**
     * Get current system snapshot
     */
    public getCurrentSystemMetrics(): SystemMetrics {
        return {
            memoryUsage: process.memoryUsage(),
            cpuUsage: process.cpuUsage(),
            timestamp: Date.now()
        };
    }

    /**
     * Clear all metrics
     */
    public clearMetrics(): void {
        this.metrics = [];
        this.systemMetrics = [];
        this.contextLogger.info('Performance metrics cleared');
    }

    /**
     * Generate performance report
     */
    public generateReport(): string {
        const stats = this.getAllStats();
        const systemSnapshot = this.getCurrentSystemMetrics();
        
        let report = '# FlowCode Performance Report\n\n';
        report += `Generated: ${new Date().toISOString()}\n\n`;

        // System metrics
        report += '## System Metrics\n';
        report += `- Memory Usage: ${(systemSnapshot.memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB\n`;
        report += `- Memory Total: ${(systemSnapshot.memoryUsage.heapTotal / 1024 / 1024).toFixed(2)} MB\n`;
        report += `- External Memory: ${(systemSnapshot.memoryUsage.external / 1024 / 1024).toFixed(2)} MB\n\n`;

        // Performance statistics
        report += '## Operation Performance\n\n';
        
        if (stats.length === 0) {
            report += 'No performance data available.\n';
            return report;
        }

        // Sort by average duration (slowest first)
        stats.sort((a, b) => b.averageDuration - a.averageDuration);

        report += '| Operation | Count | Avg (ms) | Min (ms) | Max (ms) | P95 (ms) | P99 (ms) |\n';
        report += '|-----------|-------|----------|----------|----------|----------|----------|\n';

        for (const stat of stats) {
            report += `| ${stat.name} | ${stat.count} | ${stat.averageDuration.toFixed(2)} | ${stat.minDuration.toFixed(2)} | ${stat.maxDuration.toFixed(2)} | ${stat.p95.toFixed(2)} | ${stat.p99.toFixed(2)} |\n`;
        }

        // Slow operations
        const slowOps = stats.filter(s => s.averageDuration > 500);
        if (slowOps.length > 0) {
            report += '\n## Slow Operations (>500ms average)\n\n';
            for (const op of slowOps) {
                report += `- **${op.name}**: ${op.averageDuration.toFixed(2)}ms average (${op.count} executions)\n`;
            }
        }

        // Recent activity
        const recentMetrics = this.getRecentMetrics(5);
        if (recentMetrics.length > 0) {
            report += '\n## Recent Activity (Last 5 minutes)\n\n';
            const recentByOperation = recentMetrics.reduce((acc, metric) => {
                if (!acc[metric.name]) {
                    acc[metric.name] = [];
                }
                acc[metric.name]?.push(metric);
                return acc;
            }, {} as Record<string, PerformanceMetric[]>);

            for (const [operation, metrics] of Object.entries(recentByOperation)) {
                const avgDuration = metrics.reduce((sum, m) => sum + m.duration, 0) / metrics.length;
                report += `- **${operation}**: ${metrics.length} executions, ${avgDuration.toFixed(2)}ms average\n`;
            }
        }

        return report;
    }

    /**
     * Start collecting system metrics
     */
    private startSystemMetricsCollection(): void {
        this.metricsTimer = setInterval(() => {
            const metrics = this.getCurrentSystemMetrics();
            this.systemMetrics.push(metrics);

            // Trim system metrics if we exceed the limit
            if (this.systemMetrics.length > this.maxSystemMetrics) {
                this.systemMetrics = this.systemMetrics.slice(-this.maxSystemMetrics);
            }
        }, 30000); // Every 30 seconds
    }

    /**
     * Calculate percentile
     */
    private percentile(sortedArray: number[], p: number): number {
        if (sortedArray.length === 0) {return 0;}

        const index = Math.ceil(sortedArray.length * p) - 1;
        return sortedArray[Math.max(0, Math.min(index, sortedArray.length - 1))] ?? 0;
    }

    /**
     * Dispose monitor and cleanup resources
     */
    public dispose(): void {
        if (this.metricsTimer) {
            clearInterval(this.metricsTimer);
            this.metricsTimer = undefined;
        }
        
        this.clearMetrics();
        this.activeTimers.clear();
        this.contextLogger.info('Performance monitor disposed');
    }

    /**
     * Get metrics as a summary object
     */
    public getMetrics(): { [key: string]: number } {
        const summary: { [key: string]: number } = {};

        for (const metric of this.metrics) {
            const currentValue = summary[metric.name];
            if (currentValue !== undefined) {
                summary[metric.name] = currentValue + metric.duration;
            } else {
                summary[metric.name] = metric.duration;
            }
        }

        return summary;
    }

    /**
     * Get timer duration for a specific operation
     */
    public getTimerDuration(name: string): number | undefined {
        const timer = this.activeTimers.get(name);
        if (timer) {
            return Date.now() - timer.startTime;
        }

        // Look for completed metrics
        const metric = this.metrics.find(m => m.name === name);
        return metric?.duration;
    }
}

/**
 * Decorator for timing method execution
 */
export function timed(name?: string) {
    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
        const originalMethod = descriptor.value;
        const operationName = name || `${target.constructor.name}.${propertyKey}`;

        descriptor.value = async function (...args: any[]) {
            const monitor = PerformanceMonitor.getInstance();
            return await monitor.timeFunction(operationName, () => originalMethod.apply(this, args));
        };

        return descriptor;
    };
}

/**
 * Decorator for timing synchronous method execution
 */
export function timedSync(name?: string) {
    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
        const originalMethod = descriptor.value;
        const operationName = name || `${target.constructor.name}.${propertyKey}`;

        descriptor.value = function (...args: any[]) {
            const monitor = PerformanceMonitor.getInstance();
            return monitor.timeFunctionSync(operationName, () => originalMethod.apply(this, args));
        };

        return descriptor;
    };
}
