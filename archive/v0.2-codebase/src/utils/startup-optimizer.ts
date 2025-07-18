import * as vscode from 'vscode';
import { logger } from './logger';
import { PerformanceMonitor } from './performance-monitor';

export interface StartupMetrics {
    activationTime: number;
    servicesInitTime: number;
    commandsRegisterTime: number;
    totalStartupTime: number;
    lazyLoadedServices: string[];
    eagerLoadedServices: string[];
    startupPhases: { [phase: string]: number };
}

export interface StartupOptimizationConfig {
    enableLazyLoading: boolean;
    enablePreloading: boolean;
    preloadServices: string[];
    enableStartupMetrics: boolean;
    startupTimeThreshold: number; // in milliseconds
    enableProgressiveActivation: boolean;
}

export class StartupOptimizer {
    private contextLogger = logger.createContextLogger('StartupOptimizer');
    private performanceMonitor = PerformanceMonitor.getInstance();
    private config: StartupOptimizationConfig;
    private startupMetrics: StartupMetrics = {
        activationTime: 0,
        servicesInitTime: 0,
        commandsRegisterTime: 0,
        totalStartupTime: 0,
        lazyLoadedServices: [],
        eagerLoadedServices: [],
        startupPhases: {}
    };
    private activationStartTime: number = 0;
    private serviceInitPromises: Map<string, Promise<any>> = new Map();
    private loadedServices: Set<string> = new Set();
    private preloadedModules: Map<string, any> = new Map();
    private progressiveActivationQueue: string[] = [];
    private isActivating: boolean = false;

    constructor() {
        this.config = this.getDefaultConfig();
        this.contextLogger.info('StartupOptimizer initialized');
    }

    /**
     * Initialize startup optimization
     */
    public async initialize(): Promise<void> {
        try {
            // Load configuration
            await this.loadConfiguration();

            // Start tracking activation time
            this.activationStartTime = Date.now();
            this.performanceMonitor.startTimer('extension_activation');

            this.contextLogger.info('Startup optimization initialized', {
                lazyLoading: this.config.enableLazyLoading,
                preloading: this.config.enablePreloading,
                progressiveActivation: this.config.enableProgressiveActivation
            });

            // Preload critical modules if enabled
            if (this.config.enablePreloading) {
                await this.preloadCriticalModules();
            }

        } catch (error) {
            this.contextLogger.error('Failed to initialize startup optimization', error as Error);
            throw error;
        }
    }

    /**
     * Start tracking a service initialization
     */
    public startServiceInitialization(serviceName: string): void {
        this.performanceMonitor.startTimer(`service_init_${serviceName}`);
        this.contextLogger.debug(`Starting ${serviceName} initialization`);
    }

    /**
     * End tracking a service initialization
     */
    public endServiceInitialization(serviceName: string, isLazyLoaded: boolean = false): void {
        const duration = this.performanceMonitor.endTimer(`service_init_${serviceName}`);
        
        if (isLazyLoaded) {
            this.startupMetrics.lazyLoadedServices.push(serviceName);
        } else {
            this.startupMetrics.eagerLoadedServices.push(serviceName);
        }

        this.loadedServices.add(serviceName);
        this.contextLogger.debug(`Completed ${serviceName} initialization in ${duration}ms`);
    }

    /**
     * Register a service initialization promise for tracking
     */
    public registerServiceInitPromise(serviceName: string, promise: Promise<any>): void {
        this.serviceInitPromises.set(serviceName, promise);
    }

    /**
     * Mark extension activation as complete
     */
    public completeActivation(): void {
        const activationTime = this.performanceMonitor.endTimer('extension_activation');
        this.startupMetrics.activationTime = activationTime;
        this.startupMetrics.totalStartupTime = Date.now() - this.activationStartTime;

        // Calculate service initialization time
        let totalServiceTime = 0;
        for (const service of this.startupMetrics.eagerLoadedServices) {
            const serviceTime = this.performanceMonitor.getTimerDuration(`service_init_${service}`);
            if (serviceTime) {
                totalServiceTime += serviceTime;
            }
        }
        this.startupMetrics.servicesInitTime = totalServiceTime;

        this.contextLogger.info('Extension activation completed', {
            activationTime: this.startupMetrics.activationTime,
            servicesInitTime: this.startupMetrics.servicesInitTime,
            totalStartupTime: this.startupMetrics.totalStartupTime,
            eagerLoadedServices: this.startupMetrics.eagerLoadedServices.length,
            lazyLoadedServices: this.startupMetrics.lazyLoadedServices.length
        });

        // Show warning if startup time exceeds threshold
        if (this.startupMetrics.totalStartupTime > this.config.startupTimeThreshold) {
            this.contextLogger.warn('Startup time exceeded threshold', {
                actual: this.startupMetrics.totalStartupTime,
                threshold: this.config.startupTimeThreshold
            } as any);
        }

        // Start progressive activation if enabled
        if (this.config.enableProgressiveActivation && this.progressiveActivationQueue.length > 0) {
            this.startProgressiveActivation();
        }
    }

    /**
     * Get startup metrics
     */
    public getStartupMetrics(): StartupMetrics {
        return { ...this.startupMetrics };
    }

    /**
     * Add a service to progressive activation queue
     */
    public queueForProgressiveActivation(serviceName: string): void {
        if (this.config.enableProgressiveActivation) {
            this.progressiveActivationQueue.push(serviceName);
            this.contextLogger.debug(`Queued ${serviceName} for progressive activation`);
        }
    }

    /**
     * Start progressive activation of queued services
     */
    private async startProgressiveActivation(): Promise<void> {
        if (this.isActivating || this.progressiveActivationQueue.length === 0) {
            return;
        }

        this.isActivating = true;
        this.contextLogger.info('Starting progressive activation', {
            queuedServices: this.progressiveActivationQueue.length
        });

        try {
            // Process queue with delays to avoid blocking the UI
            while (this.progressiveActivationQueue.length > 0) {
                const serviceName = this.progressiveActivationQueue.shift();
                if (serviceName && !this.loadedServices.has(serviceName)) {
                    this.contextLogger.debug(`Progressive activation of ${serviceName}`);
                    
                    // Trigger service initialization
                    const initPromise = this.serviceInitPromises.get(serviceName);
                    if (initPromise) {
                        this.startServiceInitialization(serviceName);
                        await initPromise;
                        this.endServiceInitialization(serviceName, true);
                    }

                    // Add small delay between service activations
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }
        } catch (error) {
            this.contextLogger.error('Progressive activation failed', error as Error);
        } finally {
            this.isActivating = false;
        }
    }

    /**
     * Preload critical modules
     */
    private async preloadCriticalModules(): Promise<void> {
        this.performanceMonitor.startTimer('preload_modules');

        try {
            // Preload services specified in configuration
            for (const serviceName of this.config.preloadServices) {
                try {
                    // This is a simplified example - actual implementation would depend on your module structure
                    const modulePath = `../services/${serviceName.toLowerCase()}-service`;
                    const module = await import(modulePath);
                    this.preloadedModules.set(serviceName, module);
                    this.contextLogger.debug(`Preloaded ${serviceName}`);
                } catch (error) {
                    this.contextLogger.warn(`Failed to preload ${serviceName}`, error as Error);
                }
            }

            const preloadTime = this.performanceMonitor.endTimer('preload_modules');
            this.startupMetrics.startupPhases['preloading'] = preloadTime;
            this.contextLogger.info('Preloaded critical modules', {
                count: this.preloadedModules.size,
                time: preloadTime
            });
        } catch (error) {
            this.contextLogger.error('Module preloading failed', error as Error);
            this.performanceMonitor.endTimer('preload_modules');
        }
    }

    /**
     * Get preloaded module
     */
    public getPreloadedModule(serviceName: string): any {
        return this.preloadedModules.get(serviceName);
    }

    /**
     * Record startup phase timing
     */
    public recordStartupPhase(phaseName: string, durationMs: number): void {
        this.startupMetrics.startupPhases[phaseName] = durationMs;
    }

    /**
     * Generate startup report
     */
    public generateStartupReport(): string {
        const metrics = this.getStartupMetrics();
        
        let report = `# FlowCode Startup Performance Report\n\n`;
        report += `Generated: ${new Date().toISOString()}\n\n`;
        
        report += `## Startup Metrics\n`;
        report += `- **Total Startup Time**: ${metrics.totalStartupTime}ms\n`;
        report += `- **Activation Time**: ${metrics.activationTime}ms\n`;
        report += `- **Services Initialization**: ${metrics.servicesInitTime}ms\n`;
        report += `- **Commands Registration**: ${metrics.commandsRegisterTime}ms\n\n`;
        
        report += `## Startup Phases\n`;
        for (const [phase, time] of Object.entries(metrics.startupPhases)) {
            report += `- **${phase}**: ${time}ms\n`;
        }
        report += `\n`;
        
        report += `## Service Loading\n`;
        report += `- **Eager Loaded Services (${metrics.eagerLoadedServices.length})**: ${metrics.eagerLoadedServices.join(', ')}\n`;
        report += `- **Lazy Loaded Services (${metrics.lazyLoadedServices.length})**: ${metrics.lazyLoadedServices.join(', ')}\n\n`;
        
        report += `## Recommendations\n`;
        
        if (metrics.totalStartupTime > this.config.startupTimeThreshold) {
            report += `- ⚠️ Startup time (${metrics.totalStartupTime}ms) exceeds threshold (${this.config.startupTimeThreshold}ms)\n`;
            
            // Add specific recommendations based on metrics
            if (metrics.servicesInitTime > metrics.totalStartupTime * 0.5) {
                report += `- Consider lazy loading more services to reduce initial load time\n`;
            }
            
            if (metrics.eagerLoadedServices.length > 5) {
                report += `- Review eager loaded services - consider deferring non-critical services\n`;
            }
        } else {
            report += `- ✅ Startup time is within acceptable threshold\n`;
        }
        
        return report;
    }

    /**
     * Load configuration from VS Code settings
     */
    private async loadConfiguration(): Promise<void> {
        const config = vscode.workspace.getConfiguration('flowcode.performance');
        
        this.config = {
            enableLazyLoading: config.get<boolean>('enableLazyLoading', true),
            enablePreloading: config.get<boolean>('enablePreloading', true),
            preloadServices: config.get<string[]>('preloadServices', ['CompanionGuard', 'ConfigurationManager']),
            enableStartupMetrics: config.get<boolean>('enableStartupMetrics', true),
            startupTimeThreshold: config.get<number>('startupTimeThreshold', 2000), // 2 seconds
            enableProgressiveActivation: config.get<boolean>('enableProgressiveActivation', true)
        };
    }

    /**
     * Get default configuration
     */
    private getDefaultConfig(): StartupOptimizationConfig {
        return {
            enableLazyLoading: true,
            enablePreloading: true,
            preloadServices: ['CompanionGuard', 'ConfigurationManager'],
            enableStartupMetrics: true,
            startupTimeThreshold: 2000, // 2 seconds
            enableProgressiveActivation: true
        };
    }

    /**
     * Dispose resources
     */
    public dispose(): void {
        this.contextLogger.info('StartupOptimizer disposed');
    }
}
