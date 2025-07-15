import * as vscode from 'vscode';
import { MemoryOptimizer, MemoryReport } from '../utils/memory-optimizer';
import { StartupOptimizer, StartupMetrics } from '../utils/startup-optimizer';
import { PerformanceMonitor } from '../utils/performance-monitor';
import { ConfigurationManager } from '../utils/configuration-manager';
import { logger } from '../utils/logger';

export interface PerformanceOptimizationConfig {
    enableMemoryOptimization: boolean;
    enableStartupOptimization: boolean;
    enablePerformanceMonitoring: boolean;
    performanceReportInterval: number; // in minutes
    enableAutoOptimization: boolean;
    optimizationThresholds: {
        memoryUsage: number; // MB
        startupTime: number; // ms
        responseTime: number; // ms
    };
}

export interface PerformanceReport {
    timestamp: number;
    memoryReport: MemoryReport;
    startupMetrics: StartupMetrics;
    performanceMetrics: {
        averageResponseTime: number;
        totalOperations: number;
        slowOperations: string[];
    };
    optimizationActions: string[];
    recommendations: string[];
}

export class PerformanceOptimizationService {
    private contextLogger = logger.createContextLogger('PerformanceOptimizationService');
    private memoryOptimizer: MemoryOptimizer;
    private startupOptimizer: StartupOptimizer;
    private performanceMonitor = PerformanceMonitor.getInstance();
    private config: PerformanceOptimizationConfig;
    private reportTimer: NodeJS.Timeout | null = null;
    private optimizationTimer: NodeJS.Timeout | null = null;
    private statusBarItem: vscode.StatusBarItem | null = null;

    constructor(private configManager: ConfigurationManager) {
        this.memoryOptimizer = new MemoryOptimizer();
        this.startupOptimizer = new StartupOptimizer();
        this.config = this.getDefaultConfig();
        this.contextLogger.info('PerformanceOptimizationService initialized');
    }

    /**
     * Initialize performance optimization service
     */
    public async initialize(): Promise<void> {
        try {
            // Load configuration
            await this.loadConfiguration();

            // Initialize optimizers
            if (this.config.enableMemoryOptimization) {
                await this.memoryOptimizer.initialize();
            }

            if (this.config.enableStartupOptimization) {
                await this.startupOptimizer.initialize();
            }

            // Create status bar item
            this.createStatusBarItem();

            // Start performance monitoring
            if (this.config.enablePerformanceMonitoring) {
                this.startPerformanceMonitoring();
            }

            // Start auto optimization
            if (this.config.enableAutoOptimization) {
                this.startAutoOptimization();
            }

            this.contextLogger.info('Performance optimization service initialized', {
                memoryOptimization: this.config.enableMemoryOptimization,
                startupOptimization: this.config.enableStartupOptimization,
                performanceMonitoring: this.config.enablePerformanceMonitoring,
                autoOptimization: this.config.enableAutoOptimization
            });

        } catch (error) {
            this.contextLogger.error('Failed to initialize performance optimization service', error as Error);
            throw error;
        }
    }

    /**
     * Start service initialization tracking
     */
    public startServiceInitialization(serviceName: string): void {
        if (this.config.enableStartupOptimization) {
            this.startupOptimizer.startServiceInitialization(serviceName);
        }
    }

    /**
     * End service initialization tracking
     */
    public endServiceInitialization(serviceName: string, isLazyLoaded: boolean = false): void {
        if (this.config.enableStartupOptimization) {
            this.startupOptimizer.endServiceInitialization(serviceName, isLazyLoaded);
        }
    }

    /**
     * Complete extension activation
     */
    public completeActivation(): void {
        if (this.config.enableStartupOptimization) {
            this.startupOptimizer.completeActivation();
        }
        this.updateStatusBar();
    }

    /**
     * Get cache for a specific component
     */
    public getCache<T>(name: string): Map<string, T> {
        return this.memoryOptimizer.getCache<T>(name);
    }

    /**
     * Get cached value with statistics
     */
    public getCacheValue<T>(cacheName: string, key: string): T | undefined {
        return this.memoryOptimizer.getCacheValue<T>(cacheName, key);
    }

    /**
     * Set cached value
     */
    public setCacheValue<T>(cacheName: string, key: string, value: T): void {
        this.memoryOptimizer.setCacheValue<T>(cacheName, key, value);
    }

    /**
     * Force memory optimization
     */
    public async optimizeMemory(): Promise<string[]> {
        if (!this.config.enableMemoryOptimization) {
            return [];
        }

        const optimizations = await this.memoryOptimizer.optimizeMemory();
        this.updateStatusBar();
        return optimizations;
    }

    /**
     * Generate comprehensive performance report
     */
    public async generatePerformanceReport(): Promise<PerformanceReport> {
        const memoryReport = this.memoryOptimizer.generateMemoryReport();
        const startupMetrics = this.startupOptimizer.getStartupMetrics();
        const performanceMetrics = this.getPerformanceMetrics();
        const optimizationActions: string[] = [];
        const recommendations: string[] = [];

        // Add memory recommendations
        recommendations.push(...memoryReport.recommendations);

        // Add startup recommendations
        if (startupMetrics.totalStartupTime > this.config.optimizationThresholds.startupTime) {
            recommendations.push('Consider optimizing startup time by lazy loading more services');
        }

        // Add performance recommendations
        if (performanceMetrics.averageResponseTime > this.config.optimizationThresholds.responseTime) {
            recommendations.push('Average response time is high - consider performance optimization');
        }

        return {
            timestamp: Date.now(),
            memoryReport,
            startupMetrics,
            performanceMetrics,
            optimizationActions,
            recommendations
        };
    }

    /**
     * Show performance report
     */
    public async showPerformanceReport(): Promise<void> {
        try {
            const report = await this.generatePerformanceReport();
            const reportContent = this.formatPerformanceReport(report);

            const doc = await vscode.workspace.openTextDocument({
                content: reportContent,
                language: 'markdown'
            });

            await vscode.window.showTextDocument(doc);
        } catch (error) {
            this.contextLogger.error('Failed to show performance report', error as Error);
            vscode.window.showErrorMessage('Failed to generate performance report');
        }
    }

    /**
     * Get current memory usage
     */
    public getMemoryUsage() {
        return this.memoryOptimizer.getMemoryUsage();
    }

    /**
     * Get startup metrics
     */
    public getStartupMetrics(): StartupMetrics {
        return this.startupOptimizer.getStartupMetrics();
    }

    /**
     * Get cache statistics
     */
    public getCacheStatistics() {
        return this.memoryOptimizer.getCacheStatistics();
    }

    /**
     * Start performance monitoring
     */
    private startPerformanceMonitoring(): void {
        if (this.reportTimer) {
            clearInterval(this.reportTimer);
        }

        this.reportTimer = setInterval(async () => {
            try {
                const report = await this.generatePerformanceReport();
                this.contextLogger.info('Performance monitoring report', {
                    memoryUsage: report.memoryReport.usage.heapUsed,
                    cacheHitRate: report.memoryReport.cacheStats.hitRate,
                    averageResponseTime: report.performanceMetrics.averageResponseTime
                });

                this.updateStatusBar();
            } catch (error) {
                this.contextLogger.error('Performance monitoring failed', error as Error);
            }
        }, this.config.performanceReportInterval * 60 * 1000);

        this.contextLogger.info('Performance monitoring started', {
            interval: this.config.performanceReportInterval
        });
    }

    /**
     * Start auto optimization
     */
    private startAutoOptimization(): void {
        if (this.optimizationTimer) {
            clearInterval(this.optimizationTimer);
        }

        this.optimizationTimer = setInterval(async () => {
            try {
                const memoryUsage = this.memoryOptimizer.getMemoryUsage();
                
                if (memoryUsage.heapUsed > this.config.optimizationThresholds.memoryUsage) {
                    const optimizations = await this.optimizeMemory();
                    if (optimizations.length > 0) {
                        this.contextLogger.info('Auto optimization performed', {
                            optimizations: optimizations.length,
                            memoryBefore: memoryUsage.heapUsed,
                            memoryAfter: this.memoryOptimizer.getMemoryUsage().heapUsed
                        });
                    }
                }
            } catch (error) {
                this.contextLogger.error('Auto optimization failed', error as Error);
            }
        }, 300000); // Check every 5 minutes

        this.contextLogger.info('Auto optimization started');
    }

    /**
     * Create status bar item
     */
    private createStatusBarItem(): void {
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            100
        );
        
        this.statusBarItem.command = 'flowcode.showPerformanceReport';
        this.statusBarItem.tooltip = 'FlowCode Performance Status - Click for detailed report';
        this.statusBarItem.show();
        
        this.updateStatusBar();
    }

    /**
     * Update status bar with current performance info
     */
    private updateStatusBar(): void {
        if (!this.statusBarItem) return;

        try {
            const memoryUsage = this.memoryOptimizer.getMemoryUsage();
            const cacheStats = this.memoryOptimizer.getCacheStatistics();
            
            const totalCacheEntries = Object.values(cacheStats).reduce((sum, stat) => sum + stat.size, 0);
            const avgHitRate = Object.values(cacheStats).reduce((sum, stat) => sum + stat.hitRate, 0) / Object.keys(cacheStats).length || 0;

            // Determine status icon based on memory usage
            let statusIcon = '🟢';
            if (memoryUsage.heapUsed > this.config.optimizationThresholds.memoryUsage * 1.5) {
                statusIcon = '🔴';
            } else if (memoryUsage.heapUsed > this.config.optimizationThresholds.memoryUsage) {
                statusIcon = '🟡';
            }

            this.statusBarItem.text = `${statusIcon} ${memoryUsage.heapUsed}MB | Cache: ${totalCacheEntries} (${avgHitRate.toFixed(1)}%)`;
        } catch (error) {
            this.statusBarItem.text = '❌ Performance Monitor Error';
            this.contextLogger.error('Failed to update status bar', error as Error);
        }
    }

    /**
     * Get performance metrics
     */
    private getPerformanceMetrics() {
        const metrics = this.performanceMonitor.getMetrics();
        const operations = Object.keys(metrics);
        
        let totalTime = 0;
        let totalOperations = 0;
        const slowOperations: string[] = [];

        for (const [operation, value] of Object.entries(metrics)) {
            const duration = value as number;
            totalTime += duration;
            totalOperations++;

            if (duration > this.config.optimizationThresholds.responseTime) {
                slowOperations.push(`${operation}: ${duration}ms`);
            }
        }

        return {
            averageResponseTime: totalOperations > 0 ? totalTime / totalOperations : 0,
            totalOperations,
            slowOperations
        };
    }

    /**
     * Format performance report
     */
    private formatPerformanceReport(report: PerformanceReport): string {
        const timestamp = new Date(report.timestamp).toISOString();
        
        let content = `# FlowCode Performance Report\n\n`;
        content += `Generated: ${timestamp}\n\n`;
        
        // Memory section
        content += `## Memory Usage\n`;
        content += `- **Heap Used**: ${report.memoryReport.usage.heapUsed} MB\n`;
        content += `- **Heap Total**: ${report.memoryReport.usage.heapTotal} MB\n`;
        content += `- **External**: ${report.memoryReport.usage.external} MB\n`;
        content += `- **RSS**: ${report.memoryReport.usage.rss} MB\n\n`;
        
        // Cache section
        content += `## Cache Performance\n`;
        content += `- **Total Entries**: ${report.memoryReport.cacheStats.size}\n`;
        content += `- **Hit Rate**: ${report.memoryReport.cacheStats.hitRate.toFixed(1)}%\n`;
        content += `- **Cache Count**: ${report.memoryReport.cacheStats.entries}\n\n`;
        
        // Startup section
        content += `## Startup Performance\n`;
        content += `- **Total Startup Time**: ${report.startupMetrics.totalStartupTime}ms\n`;
        content += `- **Activation Time**: ${report.startupMetrics.activationTime}ms\n`;
        content += `- **Services Init Time**: ${report.startupMetrics.servicesInitTime}ms\n`;
        content += `- **Eager Loaded Services**: ${report.startupMetrics.eagerLoadedServices.length}\n`;
        content += `- **Lazy Loaded Services**: ${report.startupMetrics.lazyLoadedServices.length}\n\n`;
        
        // Performance section
        content += `## Runtime Performance\n`;
        content += `- **Average Response Time**: ${report.performanceMetrics.averageResponseTime.toFixed(2)}ms\n`;
        content += `- **Total Operations**: ${report.performanceMetrics.totalOperations}\n`;
        
        if (report.performanceMetrics.slowOperations.length > 0) {
            content += `- **Slow Operations**:\n`;
            for (const op of report.performanceMetrics.slowOperations) {
                content += `  - ${op}\n`;
            }
        }
        content += `\n`;
        
        // Recommendations section
        if (report.recommendations.length > 0) {
            content += `## Recommendations\n`;
            for (const rec of report.recommendations) {
                content += `- ${rec}\n`;
            }
            content += `\n`;
        }
        
        return content;
    }

    /**
     * Load configuration
     */
    private async loadConfiguration(): Promise<void> {
        const config = vscode.workspace.getConfiguration('flowcode.performance');
        
        this.config = {
            enableMemoryOptimization: config.get<boolean>('enableMemoryOptimization', true),
            enableStartupOptimization: config.get<boolean>('enableStartupOptimization', true),
            enablePerformanceMonitoring: config.get<boolean>('enablePerformanceMonitoring', true),
            performanceReportInterval: config.get<number>('performanceReportInterval', 30), // 30 minutes
            enableAutoOptimization: config.get<boolean>('enableAutoOptimization', true),
            optimizationThresholds: {
                memoryUsage: config.get<number>('memoryThreshold', 200), // 200 MB
                startupTime: config.get<number>('startupTimeThreshold', 2000), // 2 seconds
                responseTime: config.get<number>('responseTimeThreshold', 1000) // 1 second
            }
        };
    }

    /**
     * Get default configuration
     */
    private getDefaultConfig(): PerformanceOptimizationConfig {
        return {
            enableMemoryOptimization: true,
            enableStartupOptimization: true,
            enablePerformanceMonitoring: true,
            performanceReportInterval: 30, // 30 minutes
            enableAutoOptimization: true,
            optimizationThresholds: {
                memoryUsage: 200, // 200 MB
                startupTime: 2000, // 2 seconds
                responseTime: 1000 // 1 second
            }
        };
    }

    /**
     * Dispose resources
     */
    public dispose(): void {
        if (this.reportTimer) {
            clearInterval(this.reportTimer);
            this.reportTimer = null;
        }

        if (this.optimizationTimer) {
            clearInterval(this.optimizationTimer);
            this.optimizationTimer = null;
        }

        if (this.statusBarItem) {
            this.statusBarItem.dispose();
            this.statusBarItem = null;
        }

        this.memoryOptimizer.dispose();
        this.startupOptimizer.dispose();
        this.contextLogger.info('PerformanceOptimizationService disposed');
    }
}
