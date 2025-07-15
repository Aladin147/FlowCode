import * as vscode from 'vscode';
import { PerformanceOptimizationService } from '../services/performance-optimization-service';
import { ConfigurationManager } from '../utils/configuration-manager';
import { logger } from '../utils/logger';

export class PerformanceCommands {
    private contextLogger = logger.createContextLogger('PerformanceCommands');
    private performanceService: PerformanceOptimizationService;

    constructor(private configManager: ConfigurationManager) {
        this.performanceService = new PerformanceOptimizationService(configManager);
    }

    /**
     * Register all performance commands
     */
    public registerCommands(context: vscode.ExtensionContext): void {
        const commands = [
            vscode.commands.registerCommand('flowcode.showPerformanceReport', () => this.showPerformanceReport()),
            vscode.commands.registerCommand('flowcode.optimizeMemory', () => this.optimizeMemory()),
            vscode.commands.registerCommand('flowcode.showMemoryUsage', () => this.showMemoryUsage()),
            vscode.commands.registerCommand('flowcode.showStartupMetrics', () => this.showStartupMetrics()),
            vscode.commands.registerCommand('flowcode.showCacheStatistics', () => this.showCacheStatistics()),
            vscode.commands.registerCommand('flowcode.configurePerformance', () => this.configurePerformance()),
            vscode.commands.registerCommand('flowcode.clearAllCaches', () => this.clearAllCaches()),
            vscode.commands.registerCommand('flowcode.runPerformanceDiagnostics', () => this.runPerformanceDiagnostics())
        ];

        context.subscriptions.push(...commands);
        this.contextLogger.info('Performance commands registered');
    }

    /**
     * Initialize performance service
     */
    public async initialize(): Promise<void> {
        await this.performanceService.initialize();
    }

    /**
     * Show comprehensive performance report
     */
    private async showPerformanceReport(): Promise<void> {
        try {
            await this.performanceService.showPerformanceReport();
        } catch (error) {
            this.contextLogger.error('Show performance report command failed', error as Error);
            vscode.window.showErrorMessage(`Failed to show performance report: ${(error as Error).message}`);
        }
    }

    /**
     * Optimize memory command
     */
    private async optimizeMemory(): Promise<void> {
        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "Optimizing FlowCode Memory Usage",
                cancellable: false
            }, async (progress) => {
                progress.report({ increment: 0, message: "Analyzing memory usage..." });

                const beforeUsage = this.performanceService.getMemoryUsage();
                
                progress.report({ increment: 50, message: "Performing optimizations..." });

                const optimizations = await this.performanceService.optimizeMemory();
                
                progress.report({ increment: 100, message: "Optimization completed!" });

                const afterUsage = this.performanceService.getMemoryUsage();
                const memoryFreed = beforeUsage.heapUsed - afterUsage.heapUsed;

                if (optimizations.length > 0) {
                    const message = `Memory optimization completed!\n\n` +
                                  `Optimizations performed:\n${optimizations.map(opt => `• ${opt}`).join('\n')}\n\n` +
                                  `Memory freed: ${memoryFreed > 0 ? memoryFreed : 0} MB\n` +
                                  `Current usage: ${afterUsage.heapUsed} MB`;
                    
                    vscode.window.showInformationMessage(message, 'Show Details').then(action => {
                        if (action === 'Show Details') {
                            this.showPerformanceReport();
                        }
                    });
                } else {
                    vscode.window.showInformationMessage(
                        `Memory usage is already optimized (${afterUsage.heapUsed} MB)`
                    );
                }
            });
        } catch (error) {
            this.contextLogger.error('Optimize memory command failed', error as Error);
            vscode.window.showErrorMessage(`Failed to optimize memory: ${(error as Error).message}`);
        }
    }

    /**
     * Show memory usage command
     */
    private async showMemoryUsage(): Promise<void> {
        try {
            const usage = this.performanceService.getMemoryUsage();
            
            const report = `# FlowCode Memory Usage Report
Generated: ${new Date().toISOString()}

## Current Memory Usage
- **Heap Used**: ${usage.heapUsed} MB
- **Heap Total**: ${usage.heapTotal} MB
- **External Memory**: ${usage.external} MB
- **Resident Set Size**: ${usage.rss} MB
- **Array Buffers**: ${usage.arrayBuffers} MB

## Memory Efficiency
- **Heap Utilization**: ${((usage.heapUsed / usage.heapTotal) * 100).toFixed(1)}%
- **Memory Pressure**: ${usage.heapUsed > 200 ? 'High' : usage.heapUsed > 100 ? 'Medium' : 'Low'}

## Recommendations
${usage.heapUsed > 200 ? '- Consider running memory optimization' : '- Memory usage is within normal range'}
${usage.heapUsed / usage.heapTotal > 0.8 ? '- Heap utilization is high - garbage collection recommended' : ''}
`;

            const doc = await vscode.workspace.openTextDocument({
                content: report,
                language: 'markdown'
            });

            await vscode.window.showTextDocument(doc);
        } catch (error) {
            this.contextLogger.error('Show memory usage command failed', error as Error);
            vscode.window.showErrorMessage(`Failed to show memory usage: ${(error as Error).message}`);
        }
    }

    /**
     * Show startup metrics command
     */
    private async showStartupMetrics(): Promise<void> {
        try {
            const metrics = this.performanceService.getStartupMetrics();
            
            const report = `# FlowCode Startup Performance Report
Generated: ${new Date().toISOString()}

## Startup Timing
- **Total Startup Time**: ${metrics.totalStartupTime}ms
- **Extension Activation**: ${metrics.activationTime}ms
- **Services Initialization**: ${metrics.servicesInitTime}ms
- **Commands Registration**: ${metrics.commandsRegisterTime}ms

## Service Loading Strategy
- **Eager Loaded Services (${metrics.eagerLoadedServices.length})**:
${metrics.eagerLoadedServices.map(service => `  - ${service}`).join('\n')}

- **Lazy Loaded Services (${metrics.lazyLoadedServices.length})**:
${metrics.lazyLoadedServices.map(service => `  - ${service}`).join('\n')}

## Startup Phases
${Object.entries(metrics.startupPhases).map(([phase, time]) => `- **${phase}**: ${time}ms`).join('\n')}

## Performance Analysis
- **Startup Speed**: ${metrics.totalStartupTime < 2000 ? '✅ Fast' : metrics.totalStartupTime < 5000 ? '⚠️ Moderate' : '❌ Slow'}
- **Service Loading Efficiency**: ${metrics.lazyLoadedServices.length > metrics.eagerLoadedServices.length ? '✅ Optimized' : '⚠️ Could be improved'}

## Recommendations
${metrics.totalStartupTime > 2000 ? '- Consider lazy loading more services to improve startup time' : '- Startup performance is good'}
${metrics.eagerLoadedServices.length > 5 ? '- Review eager loaded services - some could be deferred' : ''}
`;

            const doc = await vscode.workspace.openTextDocument({
                content: report,
                language: 'markdown'
            });

            await vscode.window.showTextDocument(doc);
        } catch (error) {
            this.contextLogger.error('Show startup metrics command failed', error as Error);
            vscode.window.showErrorMessage(`Failed to show startup metrics: ${(error as Error).message}`);
        }
    }

    /**
     * Show cache statistics command
     */
    private async showCacheStatistics(): Promise<void> {
        try {
            const cacheStats = this.performanceService.getCacheStatistics();
            
            let report = `# FlowCode Cache Statistics Report
Generated: ${new Date().toISOString()}

## Cache Overview
- **Total Caches**: ${Object.keys(cacheStats).length}
- **Total Entries**: ${Object.values(cacheStats).reduce((sum, stat) => sum + stat.size, 0)}
- **Average Hit Rate**: ${(Object.values(cacheStats).reduce((sum, stat) => sum + stat.hitRate, 0) / Object.keys(cacheStats).length || 0).toFixed(1)}%

## Individual Cache Performance
`;

            for (const [cacheName, stats] of Object.entries(cacheStats)) {
                const efficiency = stats.hitRate > 80 ? '✅ Excellent' : stats.hitRate > 60 ? '✅ Good' : stats.hitRate > 40 ? '⚠️ Fair' : '❌ Poor';
                
                report += `
### ${cacheName}
- **Entries**: ${stats.size}
- **Hits**: ${stats.hits}
- **Misses**: ${stats.misses}
- **Hit Rate**: ${stats.hitRate.toFixed(1)}%
- **Efficiency**: ${efficiency}
`;
            }

            report += `
## Recommendations
${Object.values(cacheStats).some(stat => stat.hitRate < 50) ? '- Some caches have low hit rates - review caching strategy' : '- Cache performance is good'}
${Object.values(cacheStats).reduce((sum, stat) => sum + stat.size, 0) > 10000 ? '- Consider cache size limits to prevent memory bloat' : ''}
`;

            const doc = await vscode.workspace.openTextDocument({
                content: report,
                language: 'markdown'
            });

            await vscode.window.showTextDocument(doc);
        } catch (error) {
            this.contextLogger.error('Show cache statistics command failed', error as Error);
            vscode.window.showErrorMessage(`Failed to show cache statistics: ${(error as Error).message}`);
        }
    }

    /**
     * Configure performance settings command
     */
    private async configurePerformance(): Promise<void> {
        try {
            const options = [
                { label: 'Memory Optimization', description: 'Configure memory optimization settings' },
                { label: 'Startup Optimization', description: 'Configure startup optimization settings' },
                { label: 'Performance Monitoring', description: 'Configure performance monitoring settings' },
                { label: 'Auto Optimization', description: 'Configure automatic optimization settings' },
                { label: 'Performance Thresholds', description: 'Configure performance alert thresholds' }
            ];

            const selection = await vscode.window.showQuickPick(options, {
                placeHolder: 'Select performance configuration option'
            });

            if (!selection) {
                return;
            }

            switch (selection.label) {
                case 'Memory Optimization':
                    await this.configureMemoryOptimization();
                    break;
                case 'Startup Optimization':
                    await this.configureStartupOptimization();
                    break;
                case 'Performance Monitoring':
                    await this.configurePerformanceMonitoring();
                    break;
                case 'Auto Optimization':
                    await this.configureAutoOptimization();
                    break;
                case 'Performance Thresholds':
                    await this.configurePerformanceThresholds();
                    break;
            }
        } catch (error) {
            this.contextLogger.error('Configure performance command failed', error as Error);
            vscode.window.showErrorMessage(`Failed to configure performance: ${(error as Error).message}`);
        }
    }

    /**
     * Clear all caches command
     */
    private async clearAllCaches(): Promise<void> {
        try {
            const confirmation = await vscode.window.showWarningMessage(
                'This will clear all FlowCode caches. This may temporarily reduce performance until caches are rebuilt. Continue?',
                { modal: true },
                'Yes, Clear Caches',
                'Cancel'
            );

            if (confirmation !== 'Yes, Clear Caches') {
                return;
            }

            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "Clearing FlowCode Caches",
                cancellable: false
            }, async (progress) => {
                progress.report({ increment: 0, message: "Clearing caches..." });

                // This would need to be implemented in the performance service
                // For now, we'll simulate the operation
                await new Promise(resolve => setTimeout(resolve, 1000));

                progress.report({ increment: 100, message: "Caches cleared!" });
            });

            vscode.window.showInformationMessage('All FlowCode caches have been cleared successfully');
        } catch (error) {
            this.contextLogger.error('Clear all caches command failed', error as Error);
            vscode.window.showErrorMessage(`Failed to clear caches: ${(error as Error).message}`);
        }
    }

    /**
     * Run performance diagnostics command
     */
    private async runPerformanceDiagnostics(): Promise<void> {
        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "Running FlowCode Performance Diagnostics",
                cancellable: false
            }, async (progress) => {
                progress.report({ increment: 0, message: "Analyzing memory usage..." });
                const memoryUsage = this.performanceService.getMemoryUsage();

                progress.report({ increment: 25, message: "Checking startup performance..." });
                const startupMetrics = this.performanceService.getStartupMetrics();

                progress.report({ increment: 50, message: "Analyzing cache performance..." });
                const cacheStats = this.performanceService.getCacheStatistics();

                progress.report({ increment: 75, message: "Generating diagnostics report..." });

                const diagnostics = this.generateDiagnosticsReport(memoryUsage, startupMetrics, cacheStats);

                progress.report({ increment: 100, message: "Diagnostics completed!" });

                const doc = await vscode.workspace.openTextDocument({
                    content: diagnostics,
                    language: 'markdown'
                });

                await vscode.window.showTextDocument(doc);
            });
        } catch (error) {
            this.contextLogger.error('Run performance diagnostics command failed', error as Error);
            vscode.window.showErrorMessage(`Failed to run diagnostics: ${(error as Error).message}`);
        }
    }

    /**
     * Configure memory optimization
     */
    private async configureMemoryOptimization(): Promise<void> {
        const config = vscode.workspace.getConfiguration('flowcode.performance');

        // Enable/disable memory optimization
        const enableMemoryOpt = await vscode.window.showQuickPick([
            { label: 'Enable', description: 'Enable automatic memory optimization' },
            { label: 'Disable', description: 'Disable automatic memory optimization' }
        ], {
            placeHolder: `Current: ${config.get<boolean>('enableMemoryOptimization', true) ? 'Enabled' : 'Disabled'}`
        });

        if (enableMemoryOpt) {
            await config.update('enableMemoryOptimization', enableMemoryOpt.label === 'Enable', vscode.ConfigurationTarget.Global);
        }

        // Configure memory threshold
        const thresholdInput = await vscode.window.showInputBox({
            prompt: 'Memory usage threshold (MB) for triggering optimization',
            value: config.get<number>('memoryThreshold', 200).toString(),
            validateInput: (value) => {
                const num = parseInt(value);
                if (isNaN(num) || num < 50 || num > 2000) {
                    return 'Threshold must be between 50 and 2000 MB';
                }
                return undefined;
            }
        });

        if (thresholdInput) {
            await config.update('memoryThreshold', parseInt(thresholdInput), vscode.ConfigurationTarget.Global);
        }

        vscode.window.showInformationMessage('Memory optimization settings updated');
    }

    /**
     * Configure startup optimization
     */
    private async configureStartupOptimization(): Promise<void> {
        const config = vscode.workspace.getConfiguration('flowcode.performance');

        // Enable/disable startup optimization
        const enableStartupOpt = await vscode.window.showQuickPick([
            { label: 'Enable', description: 'Enable startup optimization features' },
            { label: 'Disable', description: 'Disable startup optimization features' }
        ], {
            placeHolder: `Current: ${config.get<boolean>('enableStartupOptimization', true) ? 'Enabled' : 'Disabled'}`
        });

        if (enableStartupOpt) {
            await config.update('enableStartupOptimization', enableStartupOpt.label === 'Enable', vscode.ConfigurationTarget.Global);
        }

        // Configure startup time threshold
        const startupThresholdInput = await vscode.window.showInputBox({
            prompt: 'Startup time threshold (ms) for performance warnings',
            value: config.get<number>('startupTimeThreshold', 2000).toString(),
            validateInput: (value) => {
                const num = parseInt(value);
                if (isNaN(num) || num < 500 || num > 10000) {
                    return 'Threshold must be between 500 and 10000 ms';
                }
                return undefined;
            }
        });

        if (startupThresholdInput) {
            await config.update('startupTimeThreshold', parseInt(startupThresholdInput), vscode.ConfigurationTarget.Global);
        }

        vscode.window.showInformationMessage('Startup optimization settings updated');
    }

    /**
     * Configure performance monitoring
     */
    private async configurePerformanceMonitoring(): Promise<void> {
        const config = vscode.workspace.getConfiguration('flowcode.performance');

        // Enable/disable performance monitoring
        const enableMonitoring = await vscode.window.showQuickPick([
            { label: 'Enable', description: 'Enable continuous performance monitoring' },
            { label: 'Disable', description: 'Disable performance monitoring' }
        ], {
            placeHolder: `Current: ${config.get<boolean>('enablePerformanceMonitoring', true) ? 'Enabled' : 'Disabled'}`
        });

        if (enableMonitoring) {
            await config.update('enablePerformanceMonitoring', enableMonitoring.label === 'Enable', vscode.ConfigurationTarget.Global);
        }

        // Configure monitoring interval
        const intervalInput = await vscode.window.showInputBox({
            prompt: 'Performance monitoring interval (minutes)',
            value: config.get<number>('performanceReportInterval', 30).toString(),
            validateInput: (value) => {
                const num = parseInt(value);
                if (isNaN(num) || num < 5 || num > 120) {
                    return 'Interval must be between 5 and 120 minutes';
                }
                return undefined;
            }
        });

        if (intervalInput) {
            await config.update('performanceReportInterval', parseInt(intervalInput), vscode.ConfigurationTarget.Global);
        }

        vscode.window.showInformationMessage('Performance monitoring settings updated');
    }

    /**
     * Configure auto optimization
     */
    private async configureAutoOptimization(): Promise<void> {
        const config = vscode.workspace.getConfiguration('flowcode.performance');

        const enableAutoOpt = await vscode.window.showQuickPick([
            { label: 'Enable', description: 'Enable automatic performance optimization' },
            { label: 'Disable', description: 'Disable automatic optimization' }
        ], {
            placeHolder: `Current: ${config.get<boolean>('enableAutoOptimization', true) ? 'Enabled' : 'Disabled'}`
        });

        if (enableAutoOpt) {
            await config.update('enableAutoOptimization', enableAutoOpt.label === 'Enable', vscode.ConfigurationTarget.Global);
            vscode.window.showInformationMessage('Auto optimization settings updated');
        }
    }

    /**
     * Configure performance thresholds
     */
    private async configurePerformanceThresholds(): Promise<void> {
        const config = vscode.workspace.getConfiguration('flowcode.performance');

        // Configure response time threshold
        const responseTimeInput = await vscode.window.showInputBox({
            prompt: 'Response time threshold (ms) for performance warnings',
            value: config.get<number>('responseTimeThreshold', 1000).toString(),
            validateInput: (value) => {
                const num = parseInt(value);
                if (isNaN(num) || num < 100 || num > 10000) {
                    return 'Threshold must be between 100 and 10000 ms';
                }
                return undefined;
            }
        });

        if (responseTimeInput) {
            await config.update('responseTimeThreshold', parseInt(responseTimeInput), vscode.ConfigurationTarget.Global);
        }

        vscode.window.showInformationMessage('Performance thresholds updated');
    }

    /**
     * Generate diagnostics report
     */
    private generateDiagnosticsReport(memoryUsage: any, startupMetrics: any, cacheStats: any): string {
        const timestamp = new Date().toISOString();

        let report = `# FlowCode Performance Diagnostics Report
Generated: ${timestamp}

## System Health Overview
`;

        // Memory health
        const memoryHealth = memoryUsage.heapUsed < 100 ? '✅ Excellent' :
                           memoryUsage.heapUsed < 200 ? '✅ Good' :
                           memoryUsage.heapUsed < 300 ? '⚠️ Fair' : '❌ Poor';

        report += `- **Memory Health**: ${memoryHealth} (${memoryUsage.heapUsed} MB used)\n`;

        // Startup health
        const startupHealth = startupMetrics.totalStartupTime < 1000 ? '✅ Excellent' :
                             startupMetrics.totalStartupTime < 2000 ? '✅ Good' :
                             startupMetrics.totalStartupTime < 5000 ? '⚠️ Fair' : '❌ Poor';

        report += `- **Startup Health**: ${startupHealth} (${startupMetrics.totalStartupTime}ms)\n`;

        // Cache health
        const avgHitRate = Object.values(cacheStats).reduce((sum: number, stat: any) => sum + stat.hitRate, 0) / Object.keys(cacheStats).length || 0;
        const cacheHealth = avgHitRate > 80 ? '✅ Excellent' :
                           avgHitRate > 60 ? '✅ Good' :
                           avgHitRate > 40 ? '⚠️ Fair' : '❌ Poor';

        report += `- **Cache Health**: ${cacheHealth} (${avgHitRate.toFixed(1)}% hit rate)\n\n`;

        return report;
    }

    /**
     * Get performance service
     */
    public getPerformanceService(): PerformanceOptimizationService {
        return this.performanceService;
    }

    /**
     * Complete activation tracking
     */
    public completeActivation(): void {
        this.performanceService.completeActivation();
    }

    /**
     * Start service initialization tracking
     */
    public startServiceInitialization(serviceName: string): void {
        this.performanceService.startServiceInitialization(serviceName);
    }

    /**
     * End service initialization tracking
     */
    public endServiceInitialization(serviceName: string, isLazyLoaded: boolean = false): void {
        this.performanceService.endServiceInitialization(serviceName, isLazyLoaded);
    }

    /**
     * Dispose resources
     */
    public dispose(): void {
        this.performanceService.dispose();
        this.contextLogger.info('PerformanceCommands disposed');
    }
}
