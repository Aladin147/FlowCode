import * as vscode from 'vscode';
import { ToolDependencyManager, DependencyCheckResult, ToolStatus } from '../utils/tool-dependency-manager';
import { ConfigurationManager } from '../utils/configuration-manager';
import { logger } from '../utils/logger';

export interface DependencyServiceConfig {
    checkOnStartup: boolean;
    showNotifications: boolean;
    autoInstallOptional: boolean;
    checkInterval: number; // in minutes
}

export class DependencyService {
    private contextLogger = logger.createContextLogger('DependencyService');
    private toolManager: ToolDependencyManager;
    private lastCheckResult: DependencyCheckResult | null = null;
    private checkTimer: NodeJS.Timeout | null = null;

    constructor(private configManager: ConfigurationManager) {
        this.toolManager = new ToolDependencyManager();
        this.contextLogger.info('DependencyService initialized');
    }

    /**
     * Initialize the dependency service
     */
    public async initialize(): Promise<void> {
        try {
            const config = await this.getServiceConfiguration();

            if (config.checkOnStartup) {
                await this.performDependencyCheck(true);
            }

            if (config.checkInterval > 0) {
                this.startPeriodicCheck(config.checkInterval);
            }

            this.contextLogger.info('DependencyService initialized successfully', {
                checkOnStartup: config.checkOnStartup,
                checkInterval: config.checkInterval
            });
        } catch (error) {
            this.contextLogger.error('Failed to initialize DependencyService', error as Error);
            throw error;
        }
    }

    /**
     * Perform comprehensive dependency check
     */
    public async performDependencyCheck(showProgress: boolean = false): Promise<DependencyCheckResult> {
        if (showProgress) {
            return vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "Checking FlowCode Dependencies",
                cancellable: false
            }, async (progress) => {
                progress.report({ increment: 0, message: "Scanning system tools..." });
                
                const result = await this.toolManager.checkDependencies();
                this.lastCheckResult = result;

                progress.report({ increment: 100, message: "Dependency check completed!" });

                await this.handleCheckResult(result);
                return result;
            });
        } else {
            const result = await this.toolManager.checkDependencies();
            this.lastCheckResult = result;
            await this.handleCheckResult(result);
            return result;
        }
    }

    /**
     * Handle dependency check results
     */
    private async handleCheckResult(result: DependencyCheckResult): Promise<void> {
        const config = await this.getServiceConfiguration();

        if (!config.showNotifications) {
            return;
        }

        if (!result.allSatisfied) {
            if (result.requiredMissing.length > 0) {
                const message = `FlowCode requires ${result.requiredMissing.length} missing tools: ${result.requiredMissing.join(', ')}`;
                
                const action = await vscode.window.showErrorMessage(
                    message,
                    'Show Installation Guide',
                    'Check Again',
                    'Dismiss'
                );

                switch (action) {
                    case 'Show Installation Guide':
                        await this.showInstallationGuide(result);
                        break;
                    case 'Check Again':
                        await this.performDependencyCheck(true);
                        break;
                }
            } else if (result.incompatible.length > 0) {
                const message = `${result.incompatible.length} tools have incompatible versions`;
                
                const action = await vscode.window.showWarningMessage(
                    message,
                    'Show Details',
                    'Dismiss'
                );

                if (action === 'Show Details') {
                    await this.showInstallationGuide(result);
                }
            }
        } else if (result.optionalMissing.length > 0) {
            const message = `${result.optionalMissing.length} optional tools could enhance FlowCode functionality`;
            
            const action = await vscode.window.showInformationMessage(
                message,
                'Show Recommendations',
                'Dismiss'
            );

            if (action === 'Show Recommendations') {
                await this.showInstallationGuide(result);
            }
        }
    }

    /**
     * Show installation guide
     */
    public async showInstallationGuide(result?: DependencyCheckResult): Promise<void> {
        try {
            const checkResult = result || this.lastCheckResult || await this.toolManager.checkDependencies();
            const guide = this.toolManager.generateInstallationGuide(checkResult);

            const doc = await vscode.workspace.openTextDocument({
                content: guide,
                language: 'markdown'
            });

            await vscode.window.showTextDocument(doc);
        } catch (error) {
            this.contextLogger.error('Failed to show installation guide', error as Error);
            vscode.window.showErrorMessage('Failed to generate installation guide');
        }
    }

    /**
     * Get status of specific tool
     */
    public async getToolStatus(toolName: string): Promise<ToolStatus | null> {
        try {
            const tool = this.toolManager.getTool(toolName);
            if (!tool) {
                return null;
            }

            // Use cached result if available and recent
            if (this.lastCheckResult) {
                const cachedStatus = this.lastCheckResult.toolStatuses.find(s => s.name === toolName);
                if (cachedStatus) {
                    return cachedStatus;
                }
            }

            // Perform fresh check for this tool
            const result = await this.toolManager.checkDependencies();
            this.lastCheckResult = result;

            return result.toolStatuses.find(s => s.name === toolName) || null;
        } catch (error) {
            this.contextLogger.error(`Failed to get status for tool: ${toolName}`, error as Error);
            return null;
        }
    }

    /**
     * Get all required tools status
     */
    public async getRequiredToolsStatus(): Promise<ToolStatus[]> {
        const result = this.lastCheckResult || await this.toolManager.checkDependencies();
        const requiredTools = this.toolManager.getRequiredTools();
        
        return result.toolStatuses.filter(status => 
            requiredTools.some(tool => tool.name === status.name)
        );
    }

    /**
     * Get all optional tools status
     */
    public async getOptionalToolsStatus(): Promise<ToolStatus[]> {
        const result = this.lastCheckResult || await this.toolManager.checkDependencies();
        const optionalTools = this.toolManager.getOptionalTools();
        
        return result.toolStatuses.filter(status => 
            optionalTools.some(tool => tool.name === status.name)
        );
    }

    /**
     * Check if all required dependencies are satisfied
     */
    public async areRequiredDependenciesSatisfied(): Promise<boolean> {
        const result = this.lastCheckResult || await this.toolManager.checkDependencies();
        return result.allSatisfied;
    }

    /**
     * Get dependency summary for status bar
     */
    public async getDependencySummary(): Promise<{
        satisfied: boolean;
        requiredMissing: number;
        optionalMissing: number;
        incompatible: number;
        statusText: string;
    }> {
        const result = this.lastCheckResult || await this.toolManager.checkDependencies();
        
        const statusText = result.allSatisfied 
            ? '✅ All dependencies OK'
            : `❌ ${result.requiredMissing.length} required, ${result.incompatible.length} incompatible`;

        return {
            satisfied: result.allSatisfied,
            requiredMissing: result.requiredMissing.length,
            optionalMissing: result.optionalMissing.length,
            incompatible: result.incompatible.length,
            statusText
        };
    }

    /**
     * Start periodic dependency checking
     */
    private startPeriodicCheck(intervalMinutes: number): void {
        if (this.checkTimer) {
            clearInterval(this.checkTimer);
        }

        this.checkTimer = setInterval(async () => {
            try {
                await this.performDependencyCheck(false);
            } catch (error) {
                this.contextLogger.error('Periodic dependency check failed', error as Error);
            }
        }, intervalMinutes * 60 * 1000);

        this.contextLogger.info(`Started periodic dependency check (${intervalMinutes} minutes)`);
    }

    /**
     * Stop periodic checking
     */
    public stopPeriodicCheck(): void {
        if (this.checkTimer) {
            clearInterval(this.checkTimer);
            this.checkTimer = null;
            this.contextLogger.info('Stopped periodic dependency check');
        }
    }

    /**
     * Update service configuration
     */
    public async updateConfiguration(config: Partial<DependencyServiceConfig>): Promise<void> {
        try {
            const vscodeConfig = vscode.workspace.getConfiguration('flowcode.dependencies');
            
            if (config.checkOnStartup !== undefined) {
                await vscodeConfig.update('checkOnStartup', config.checkOnStartup, vscode.ConfigurationTarget.Global);
            }
            
            if (config.showNotifications !== undefined) {
                await vscodeConfig.update('showNotifications', config.showNotifications, vscode.ConfigurationTarget.Global);
            }
            
            if (config.autoInstallOptional !== undefined) {
                await vscodeConfig.update('autoInstallOptional', config.autoInstallOptional, vscode.ConfigurationTarget.Global);
            }
            
            if (config.checkInterval !== undefined) {
                await vscodeConfig.update('checkInterval', config.checkInterval, vscode.ConfigurationTarget.Global);
                
                // Restart periodic check with new interval
                if (config.checkInterval > 0) {
                    this.startPeriodicCheck(config.checkInterval);
                } else {
                    this.stopPeriodicCheck();
                }
            }

            this.contextLogger.info('Dependency service configuration updated', config);
        } catch (error) {
            this.contextLogger.error('Failed to update dependency service configuration', error as Error);
            throw error;
        }
    }

    /**
     * Get current service configuration
     */
    private async getServiceConfiguration(): Promise<DependencyServiceConfig> {
        const config = vscode.workspace.getConfiguration('flowcode.dependencies');

        return {
            checkOnStartup: config.get<boolean>('checkOnStartup', true),
            showNotifications: config.get<boolean>('showNotifications', true),
            autoInstallOptional: config.get<boolean>('autoInstallOptional', false),
            checkInterval: config.get<number>('checkInterval', 60) // 1 hour default
        };
    }

    /**
     * Get last check result
     */
    public getLastCheckResult(): DependencyCheckResult | null {
        return this.lastCheckResult;
    }

    /**
     * Clear cached results and force fresh check
     */
    public async refreshDependencies(): Promise<DependencyCheckResult> {
        this.lastCheckResult = null;
        return await this.performDependencyCheck(true);
    }

    /**
     * Dispose resources
     */
    public dispose(): void {
        this.stopPeriodicCheck();
        this.contextLogger.info('DependencyService disposed');
    }
}
