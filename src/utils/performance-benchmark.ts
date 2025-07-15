import { logger } from './logger';
import { PerformanceOptimizer } from './performance-optimizer';
import * as fs from 'fs';
import * as path from 'path';

export interface BenchmarkResult {
    operation: string;
    duration: number;
    timestamp: number;
    success: boolean;
    memoryUsage: NodeJS.MemoryUsage;
    metadata?: Record<string, any>;
}

export interface BenchmarkSuite {
    name: string;
    results: BenchmarkResult[];
    averageDuration: number;
    successRate: number;
    totalRuns: number;
    startTime: number;
    endTime: number;
}

export interface PerformanceReport {
    suites: BenchmarkSuite[];
    overallStats: {
        totalOperations: number;
        averageDuration: number;
        successRate: number;
        memoryEfficiency: number;
    };
    recommendations: string[];
    generatedAt: number;
}

export class PerformanceBenchmark {
    private static instance: PerformanceBenchmark;
    private contextLogger = logger.createContextLogger('PerformanceBenchmark');
    private benchmarkResults: Map<string, BenchmarkResult[]> = new Map();
    private performanceOptimizer = PerformanceOptimizer.getInstance();

    private constructor() {}

    public static getInstance(): PerformanceBenchmark {
        if (!PerformanceBenchmark.instance) {
            PerformanceBenchmark.instance = new PerformanceBenchmark();
        }
        return PerformanceBenchmark.instance;
    }

    public async benchmark<T>(
        operation: string,
        fn: () => Promise<T>,
        iterations: number = 10,
        metadata?: Record<string, any>
    ): Promise<{ result: T; benchmarkResult: BenchmarkResult }> {
        this.contextLogger.info(`Starting benchmark for ${operation} (${iterations} iterations)`);

        const results: BenchmarkResult[] = [];
        let lastResult: T;

        for (let i = 0; i < iterations; i++) {
            const startTime = Date.now();
            const startMemory = process.memoryUsage();
            let success = true;

            try {
                lastResult = await fn();
            } catch (error) {
                success = false;
                this.contextLogger.warn(`Benchmark iteration ${i + 1} failed for ${operation}`, error as Error);
            }

            const duration = Date.now() - startTime;
            const endMemory = process.memoryUsage();

            const result: BenchmarkResult = {
                operation,
                duration,
                timestamp: Date.now(),
                success,
                memoryUsage: {
                    rss: endMemory.rss - startMemory.rss,
                    heapTotal: endMemory.heapTotal - startMemory.heapTotal,
                    heapUsed: endMemory.heapUsed - startMemory.heapUsed,
                    external: endMemory.external - startMemory.external,
                    arrayBuffers: endMemory.arrayBuffers - startMemory.arrayBuffers
                },
                metadata
            };

            results.push(result);
        }

        // Store results
        if (!this.benchmarkResults.has(operation)) {
            this.benchmarkResults.set(operation, []);
        }
        this.benchmarkResults.get(operation)!.push(...results);

        // Calculate average result
        const successfulResults = results.filter(r => r.success);
        const averageResult = successfulResults.length > 0 ? {
            operation,
            duration: successfulResults.reduce((sum, r) => sum + r.duration, 0) / successfulResults.length,
            timestamp: Date.now(),
            success: successfulResults.length === results.length,
            memoryUsage: {
                rss: successfulResults.reduce((sum, r) => sum + r.memoryUsage.rss, 0) / successfulResults.length,
                heapTotal: successfulResults.reduce((sum, r) => sum + r.memoryUsage.heapTotal, 0) / successfulResults.length,
                heapUsed: successfulResults.reduce((sum, r) => sum + r.memoryUsage.heapUsed, 0) / successfulResults.length,
                external: successfulResults.reduce((sum, r) => sum + r.memoryUsage.external, 0) / successfulResults.length,
                arrayBuffers: successfulResults.reduce((sum, r) => sum + r.memoryUsage.arrayBuffers, 0) / successfulResults.length
            },
            metadata
        } : results[results.length - 1];

        this.contextLogger.info(`Benchmark completed for ${operation}`, {
            averageDuration: averageResult.duration,
            successRate: (successfulResults.length / results.length) * 100,
            iterations
        });

        return { result: lastResult!, benchmarkResult: averageResult };
    }

    public async benchmarkSuite(suiteName: string, operations: Array<{
        name: string;
        fn: () => Promise<any>;
        iterations?: number;
        metadata?: Record<string, any>;
    }>): Promise<BenchmarkSuite> {
        this.contextLogger.info(`Starting benchmark suite: ${suiteName}`);
        const startTime = Date.now();
        const results: BenchmarkResult[] = [];

        for (const operation of operations) {
            try {
                const { benchmarkResult } = await this.benchmark(
                    operation.name,
                    operation.fn,
                    operation.iterations || 5,
                    operation.metadata
                );
                results.push(benchmarkResult);
            } catch (error) {
                this.contextLogger.error(`Benchmark failed for ${operation.name}`, error as Error);
                results.push({
                    operation: operation.name,
                    duration: 0,
                    timestamp: Date.now(),
                    success: false,
                    memoryUsage: process.memoryUsage(),
                    metadata: operation.metadata
                });
            }
        }

        const endTime = Date.now();
        const successfulResults = results.filter(r => r.success);

        const suite: BenchmarkSuite = {
            name: suiteName,
            results,
            averageDuration: successfulResults.length > 0 
                ? successfulResults.reduce((sum, r) => sum + r.duration, 0) / successfulResults.length 
                : 0,
            successRate: (successfulResults.length / results.length) * 100,
            totalRuns: results.length,
            startTime,
            endTime
        };

        this.contextLogger.info(`Benchmark suite completed: ${suiteName}`, {
            averageDuration: suite.averageDuration,
            successRate: suite.successRate,
            totalDuration: endTime - startTime
        });

        return suite;
    }

    public generateReport(): PerformanceReport {
        const suites: BenchmarkSuite[] = [];
        let totalOperations = 0;
        let totalDuration = 0;
        let totalSuccessful = 0;
        let totalMemoryUsed = 0;

        this.benchmarkResults.forEach((results, operation) => {
            const successfulResults = results.filter(r => r.success);
            const suite: BenchmarkSuite = {
                name: operation,
                results,
                averageDuration: successfulResults.length > 0 
                    ? successfulResults.reduce((sum, r) => sum + r.duration, 0) / successfulResults.length 
                    : 0,
                successRate: (successfulResults.length / results.length) * 100,
                totalRuns: results.length,
                startTime: Math.min(...results.map(r => r.timestamp)),
                endTime: Math.max(...results.map(r => r.timestamp))
            };

            suites.push(suite);
            totalOperations += results.length;
            totalDuration += results.reduce((sum, r) => sum + r.duration, 0);
            totalSuccessful += successfulResults.length;
            totalMemoryUsed += results.reduce((sum, r) => sum + r.memoryUsage.heapUsed, 0);
        });

        const recommendations = this.generateRecommendations(suites);

        return {
            suites,
            overallStats: {
                totalOperations,
                averageDuration: totalOperations > 0 ? totalDuration / totalOperations : 0,
                successRate: totalOperations > 0 ? (totalSuccessful / totalOperations) * 100 : 0,
                memoryEfficiency: totalOperations > 0 ? totalMemoryUsed / totalOperations : 0
            },
            recommendations,
            generatedAt: Date.now()
        };
    }

    private generateRecommendations(suites: BenchmarkSuite[]): string[] {
        const recommendations: string[] = [];
        const targets = this.performanceOptimizer.getPerformanceReport();

        suites.forEach(suite => {
            const target = targets[suite.name];
            if (target && suite.averageDuration > target.maxDuration) {
                recommendations.push(
                    `${suite.name}: Average duration (${suite.averageDuration}ms) exceeds target (${target.maxDuration}ms). Consider optimization.`
                );
            }

            if (suite.successRate < 95) {
                recommendations.push(
                    `${suite.name}: Success rate (${suite.successRate.toFixed(1)}%) is below 95%. Investigate failures.`
                );
            }

            // Memory usage recommendations
            const avgMemoryUsage = suite.results.reduce((sum, r) => sum + r.memoryUsage.heapUsed, 0) / suite.results.length;
            if (avgMemoryUsage > 50 * 1024 * 1024) { // 50MB
                recommendations.push(
                    `${suite.name}: High memory usage detected (${(avgMemoryUsage / 1024 / 1024).toFixed(1)}MB). Consider memory optimization.`
                );
            }
        });

        return recommendations;
    }

    public async saveReport(filePath?: string): Promise<string> {
        const report = this.generateReport();
        const reportPath = filePath || path.join(process.cwd(), 'performance-report.json');

        try {
            fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
            this.contextLogger.info(`Performance report saved to ${reportPath}`);
            return reportPath;
        } catch (error) {
            this.contextLogger.error('Failed to save performance report', error as Error);
            throw error;
        }
    }

    public clearResults(operation?: string): void {
        if (operation) {
            this.benchmarkResults.delete(operation);
            this.contextLogger.info(`Cleared benchmark results for ${operation}`);
        } else {
            this.benchmarkResults.clear();
            this.contextLogger.info('Cleared all benchmark results');
        }
    }

    public getResults(operation?: string): BenchmarkResult[] {
        if (operation) {
            return this.benchmarkResults.get(operation) || [];
        }

        const allResults: BenchmarkResult[] = [];
        this.benchmarkResults.forEach(results => {
            allResults.push(...results);
        });
        return allResults;
    }
}

// Predefined benchmark suites for FlowCode services
export class FlowCodeBenchmarks {
    private benchmark = PerformanceBenchmark.getInstance();
    private contextLogger = logger.createContextLogger('FlowCodeBenchmarks');

    public async runCompanionGuardBenchmarks(): Promise<BenchmarkSuite> {
        return this.benchmark.benchmarkSuite('CompanionGuard Performance', [
            {
                name: 'eslint-check',
                fn: async () => {
                    // Mock ESLint check
                    await new Promise(resolve => setTimeout(resolve, Math.random() * 100 + 50));
                    return { issues: [], duration: 150 };
                },
                iterations: 20,
                metadata: { type: 'linting', language: 'typescript' }
            },
            {
                name: 'typescript-check',
                fn: async () => {
                    // Mock TypeScript check
                    await new Promise(resolve => setTimeout(resolve, Math.random() * 150 + 100));
                    return { issues: [], duration: 200 };
                },
                iterations: 15,
                metadata: { type: 'type-checking', language: 'typescript' }
            },
            {
                name: 'python-check',
                fn: async () => {
                    // Mock Python check
                    await new Promise(resolve => setTimeout(resolve, Math.random() * 120 + 80));
                    return { issues: [], duration: 180 };
                },
                iterations: 15,
                metadata: { type: 'linting', language: 'python' }
            }
        ]);
    }

    public async runFinalGuardBenchmarks(): Promise<BenchmarkSuite> {
        return this.benchmark.benchmarkSuite('FinalGuard Performance', [
            {
                name: 'final-guard',
                fn: async () => {
                    // Mock final guard checks
                    await new Promise(resolve => setTimeout(resolve, Math.random() * 800 + 1200));
                    return { passed: true, issues: [], duration: 1500 };
                },
                iterations: 10,
                metadata: { type: 'pre-push-validation' }
            }
        ]);
    }

    public async runArchitectServiceBenchmarks(): Promise<BenchmarkSuite> {
        return this.benchmark.benchmarkSuite('ArchitectService Performance', [
            {
                name: 'architect-refactor',
                fn: async () => {
                    // Mock AI refactoring
                    await new Promise(resolve => setTimeout(resolve, Math.random() * 2000 + 3000));
                    return { refactored: true, suggestions: 5 };
                },
                iterations: 5,
                metadata: { type: 'ai-refactoring' }
            }
        ]);
    }

    public async runGraphServiceBenchmarks(): Promise<BenchmarkSuite> {
        return this.benchmark.benchmarkSuite('GraphService Performance', [
            {
                name: 'graph-generation',
                fn: async () => {
                    // Mock graph generation
                    await new Promise(resolve => setTimeout(resolve, Math.random() * 500 + 500));
                    return { nodes: 50, edges: 75 };
                },
                iterations: 10,
                metadata: { type: 'graph-generation' }
            }
        ]);
    }

    public async runHotfixServiceBenchmarks(): Promise<BenchmarkSuite> {
        return this.benchmark.benchmarkSuite('HotfixService Performance', [
            {
                name: 'hotfix-creation',
                fn: async () => {
                    // Mock hotfix creation
                    await new Promise(resolve => setTimeout(resolve, Math.random() * 700 + 800));
                    return { branch: 'hotfix/test', committed: true };
                },
                iterations: 8,
                metadata: { type: 'hotfix-workflow' }
            }
        ]);
    }

    public async runFullBenchmarkSuite(): Promise<PerformanceReport> {
        this.contextLogger.info('Starting full FlowCode benchmark suite');

        try {
            await Promise.all([
                this.runCompanionGuardBenchmarks(),
                this.runFinalGuardBenchmarks(),
                this.runArchitectServiceBenchmarks(),
                this.runGraphServiceBenchmarks(),
                this.runHotfixServiceBenchmarks()
            ]);

            const report = this.benchmark.generateReport();
            await this.benchmark.saveReport();

            this.contextLogger.info('Full benchmark suite completed', {
                totalOperations: report.overallStats.totalOperations,
                averageDuration: report.overallStats.averageDuration,
                successRate: report.overallStats.successRate
            });

            return report;
        } catch (error) {
            this.contextLogger.error('Benchmark suite failed', error as Error);
            throw error;
        }
    }
}
