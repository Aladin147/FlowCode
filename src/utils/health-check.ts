import * as vscode from 'vscode';
import { logger } from './logger';
import { TelemetryService } from './telemetry';

export interface HealthCheckResult {
    status: boolean;
    timestamp: number;
    error?: string;
    metadata?: Record<string, any>;
}

export interface SystemHealth {
    overall: boolean;
    checks: Map<string, HealthCheckResult>;
    summary: {
        total: number;
        passed: number;
        failed: number;
        lastCheck: number;
    };
}

/**
 * Health check system for monitoring extension health
 */
export class HealthCheckSystem {
    private static instance: HealthCheckSystem;
    private contextLogger = logger.createContextLogger('HealthCheckSystem');
    private telemetry = TelemetryService.getInstance();
    private healthChecks: Map<string, () => Promise<HealthCheckResult>> = new Map();
    private lastHealthStatus: Map<string, HealthCheckResult> = new Map();
    private healthCheckTimer?: NodeJS.Timeout;
    private readonly CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes

    private constructor() {
        this.initializeHealthChecks();
        this.startHealthChecks();
    }

    public static getInstance(): HealthCheckSystem {
        if (!HealthCheckSystem.instance) {
            HealthCheckSystem.instance = new HealthCheckSystem();
        }
        return HealthCheckSystem.instance;
    }

    /**
     * Register a health check
     */
    public registerHealthCheck(name: string, check: () => Promise<HealthCheckResult>): void {
        this.healthChecks.set(name, check);
        this.contextLogger.info(`Health check registered: ${name}`);
    }

    /**
     * Run all health checks
     */
    public async runHealthChecks(): Promise<SystemHealth> {
        const results = new Map<string, HealthCheckResult>();
        let passed = 0;
        let failed = 0;
        
        for (const [name, check] of this.healthChecks.entries()) {
            try {
                const result = await check();
                results.set(name, result);
                this.lastHealthStatus.set(name, result);
                
                if (result.status) {
                    passed++;
                } else {
                    failed++;
                }
                
                this.telemetry.trackEvent('health_check', {
                    checkName: name,
                    status: result.status,
                    error: result.error || ''
                });
            } catch (error) {
                const result: HealthCheckResult = {
                    status: false,
                    timestamp: Date.now(),
                    error: error instanceof Error ? error.message : 'Unknown error'
                };
                results.set(name, result);
                this.lastHealthStatus.set(name, result);
                failed++;
                
                this.telemetry.trackError(error as Error, `health_check_${name}`);
            }
        }
        
        const systemHealth: SystemHealth = {
            overall: failed === 0,
            checks: results,
            summary: {
                total: results.size,
                passed,
                failed,
                lastCheck: Date.now()
            }
        };

        // Track overall system health
        this.telemetry.trackEvent('system_health', {
            overall: systemHealth.overall,
            totalChecks: systemHealth.summary.total,
            passedChecks: systemHealth.summary.passed,
            failedChecks: systemHealth.summary.failed
        });
        
        return systemHealth;
    }

    /**
     * Get last health status
     */
    public getLastHealthStatus(): SystemHealth {
        const passed = Array.from(this.lastHealthStatus.values()).filter(r => r.status).length;
        const failed = this.lastHealthStatus.size - passed;
        
        return {
            overall: failed === 0,
            checks: new Map(this.lastHealthStatus),
            summary: {
                total: this.lastHealthStatus.size,
                passed,
                failed,
                lastCheck: Math.max(...Array.from(this.lastHealthStatus.values()).map(r => r.timestamp))
            }
        };
    }

    /**
     * Run a specific health check
     */
    public async runHealthCheck(name: string): Promise<HealthCheckResult | null> {
        const check = this.healthChecks.get(name);
        if (!check) {
            return null;
        }

        try {
            const result = await check();
            this.lastHealthStatus.set(name, result);
            return result;
        } catch (error) {
            const result: HealthCheckResult = {
                status: false,
                timestamp: Date.now(),
                error: error instanceof Error ? error.message : 'Unknown error'
            };
            this.lastHealthStatus.set(name, result);
            return result;
        }
    }

    /**
     * Initialize default health checks
     */
    private initializeHealthChecks(): void {
        // Memory usage check
        this.registerHealthCheck('memory', async () => {
            const memUsage = process.memoryUsage();
            const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
            const heapTotalMB = memUsage.heapTotal / 1024 / 1024;
            const isHealthy = heapUsedMB < 500; // Less than 500MB
            
            return {
                status: isHealthy,
                timestamp: Date.now(),
                metadata: {
                    heapUsedMB: Math.round(heapUsedMB),
                    heapTotalMB: Math.round(heapTotalMB),
                    externalMB: Math.round(memUsage.external / 1024 / 1024)
                },
                error: isHealthy ? undefined : `High memory usage: ${Math.round(heapUsedMB)}MB`
            };
        });

        // API connectivity check
        this.registerHealthCheck('api_connectivity', async () => {
            try {
                const { ConfigurationManager } = await import('./configuration-manager');
                const configManager = new ConfigurationManager();
                const config = await configManager.getApiConfiguration();
                const hasApiKey = !!config.apiKey;
                
                return {
                    status: hasApiKey,
                    timestamp: Date.now(),
                    metadata: {
                        provider: config.provider,
                        hasApiKey
                    },
                    error: hasApiKey ? undefined : 'No API key configured'
                };
            } catch (error) {
                return {
                    status: false,
                    timestamp: Date.now(),
                    error: error instanceof Error ? error.message : 'API configuration error'
                };
            }
        });

        // File system access check
        this.registerHealthCheck('file_system', async () => {
            try {
                const fs = await import('fs');
                const os = await import('os');
                const path = await import('path');
                
                const testFile = path.join(os.tmpdir(), 'flowcode-health-check.tmp');
                const testContent = `FlowCode health check ${Date.now()}`;
                
                fs.writeFileSync(testFile, testContent);
                const readContent = fs.readFileSync(testFile, 'utf8');
                fs.unlinkSync(testFile);
                
                const isHealthy = readContent === testContent;
                
                return {
                    status: isHealthy,
                    timestamp: Date.now(),
                    metadata: {
                        tmpDir: os.tmpdir(),
                        testFileSize: testContent.length
                    },
                    error: isHealthy ? undefined : 'File system read/write test failed'
                };
            } catch (error) {
                return {
                    status: false,
                    timestamp: Date.now(),
                    error: error instanceof Error ? error.message : 'File system access error'
                };
            }
        });

        // VS Code API check
        this.registerHealthCheck('vscode_api', async () => {
            try {
                const hasWindow = !!vscode.window;
                const hasWorkspace = !!vscode.workspace;
                const hasCommands = !!vscode.commands;
                const hasLanguages = !!vscode.languages;
                const isHealthy = hasWindow && hasWorkspace && hasCommands && hasLanguages;
                
                return {
                    status: isHealthy,
                    timestamp: Date.now(),
                    metadata: {
                        hasWindow,
                        hasWorkspace,
                        hasCommands,
                        hasLanguages,
                        vsCodeVersion: vscode.version
                    },
                    error: isHealthy ? undefined : 'VS Code API not fully available'
                };
            } catch (error) {
                return {
                    status: false,
                    timestamp: Date.now(),
                    error: error instanceof Error ? error.message : 'VS Code API error'
                };
            }
        });

        // Extension dependencies check
        this.registerHealthCheck('dependencies', async () => {
            try {
                const { ToolManager } = await import('./tool-manager');
                const dependencyCheck = await ToolManager.checkAllDependencies();
                
                return {
                    status: dependencyCheck.allRequired,
                    timestamp: Date.now(),
                    metadata: {
                        totalChecks: dependencyCheck.missing.length + dependencyCheck.installed.length,
                        passedChecks: dependencyCheck.installed.length,
                        criticalIssues: dependencyCheck.missing.filter(t => t.isRequired).length,
                        missingTools: dependencyCheck.missing.map(t => t.name)
                    },
                    error: dependencyCheck.allRequired ? undefined : `Missing required tools: ${dependencyCheck.missing.map(t => t.name).join(', ')}`
                };
            } catch (error) {
                return {
                    status: false,
                    timestamp: Date.now(),
                    error: error instanceof Error ? error.message : 'Dependency check error'
                };
            }
        });

        // Cache system health check
        this.registerHealthCheck('cache_system', async () => {
            try {
                const { CacheManager } = await import('./performance-cache');
                const cacheStats = CacheManager.getAllStats();
                const cacheNames = Object.keys(cacheStats);
                const totalEntries = Object.values(cacheStats).reduce((sum, stats) => sum + stats.totalEntries, 0);
                const avgHitRate = Object.values(cacheStats).reduce((sum, stats) => sum + stats.hitRate, 0) / cacheNames.length;
                
                const isHealthy = cacheNames.length > 0 && avgHitRate > 0.5; // At least 50% hit rate
                
                return {
                    status: isHealthy,
                    timestamp: Date.now(),
                    metadata: {
                        cacheCount: cacheNames.length,
                        totalEntries,
                        averageHitRate: Math.round(avgHitRate * 100) / 100
                    },
                    error: isHealthy ? undefined : 'Cache system performance issues'
                };
            } catch (error) {
                return {
                    status: false,
                    timestamp: Date.now(),
                    error: error instanceof Error ? error.message : 'Cache system error'
                };
            }
        });
    }

    /**
     * Start periodic health checks
     */
    private startHealthChecks(): void {
        // Run initial health check
        this.runHealthChecks();
        
        // Schedule periodic checks
        this.healthCheckTimer = setInterval(async () => {
            await this.runHealthChecks();
        }, this.CHECK_INTERVAL);
        
        this.contextLogger.info('Health checks started', { interval: this.CHECK_INTERVAL });
    }

    /**
     * Generate health report
     */
    public generateHealthReport(): string {
        const health = this.getLastHealthStatus();
        
        let report = '# FlowCode Health Report\n\n';
        report += `**Overall Status:** ${health.overall ? '✅ Healthy' : '❌ Issues Detected'}\n`;
        report += `**Last Check:** ${new Date(health.summary.lastCheck).toISOString()}\n`;
        report += `**Summary:** ${health.summary.passed}/${health.summary.total} checks passed\n\n`;
        
        report += '## Health Checks\n\n';
        
        for (const [name, result] of health.checks.entries()) {
            const status = result.status ? '✅ PASS' : '❌ FAIL';
            report += `### ${name} ${status}\n`;
            
            if (result.error) {
                report += `**Error:** ${result.error}\n`;
            }
            
            if (result.metadata) {
                report += '**Details:**\n';
                for (const [key, value] of Object.entries(result.metadata)) {
                    report += `- ${key}: ${value}\n`;
                }
            }
            
            report += `**Last Check:** ${new Date(result.timestamp).toISOString()}\n\n`;
        }
        
        return report;
    }

    /**
     * Dispose health check system
     */
    public dispose(): void {
        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer);
            this.healthCheckTimer = undefined;
        }
        this.contextLogger.info('HealthCheckSystem disposed');
    }
}
