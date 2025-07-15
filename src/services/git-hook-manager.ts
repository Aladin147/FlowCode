import * as vscode from 'vscode';
import * as path from 'path';
import { logger } from '../utils/logger';
import { CrossPlatformGitHooks, GitHookConfig, HookInstallationResult } from '../utils/cross-platform-git-hooks';
import { ConfigurationManager } from '../utils/configuration-manager';
import { PerformanceMonitor, timed } from '../utils/performance-monitor';

export interface GitHookManagerConfig {
    enablePreCommit: boolean;
    enablePrePush: boolean;
    enableCommitMsg: boolean;
    enablePreReceive: boolean;
    hookTimeout: number;
    failOnError: boolean;
    skipOnCI: boolean;
    customHooks: { [hookName: string]: string };
}

export interface HookStatus {
    name: string;
    installed: boolean;
    enabled: boolean;
    lastModified?: Date;
    platform: string;
    executable: boolean;
    valid: boolean;
}

export class GitHookManager {
    private contextLogger = logger.createContextLogger('GitHookManager');
    private crossPlatformHooks: CrossPlatformGitHooks;
    private performanceMonitor = PerformanceMonitor.getInstance();

    constructor(private configManager: ConfigurationManager) {
        this.crossPlatformHooks = new CrossPlatformGitHooks();
        this.contextLogger.info('GitHookManager initialized', {
            platform: this.crossPlatformHooks.getPlatformInfo().platform
        });
    }

    /**
     * Install all configured git hooks
     */
    public async installHooks(workspaceRoot?: string): Promise<HookInstallationResult> {
        try {
            const workspace = workspaceRoot || await this.configManager.getWorkspaceRoot();
            const config = await this.getHookConfiguration();
            const hooks = this.buildHookConfigs(config);

            this.contextLogger.info('Installing git hooks', {
                workspace,
                hookCount: hooks.length,
                platform: this.crossPlatformHooks.getPlatformInfo().platform
            });

            const result = await this.crossPlatformHooks.installHooks(workspace, hooks);

            // Show user notification
            if (result.success) {
                vscode.window.showInformationMessage(
                    `FlowCode git hooks installed successfully (${result.installedHooks.length} hooks)`
                );
            } else {
                vscode.window.showErrorMessage(
                    `Failed to install git hooks: ${result.errors.join(', ')}`
                );
            }

            // Log performance metrics
            this.performanceMonitor.recordMetric({
                name: 'git-hook-installation',
                duration: 0,
                timestamp: Date.now(),
                metadata: { success: result.success }
            });

            return result;
        } catch (error) {
            this.contextLogger.error('Failed to install git hooks', error as Error);
            throw error;
        }
    }

    /**
     * Get status of all git hooks
     */
    public async getHookStatus(workspaceRoot?: string): Promise<HookStatus[]> {
        try {
            const workspace = workspaceRoot || await this.configManager.getWorkspaceRoot();
            const config = await this.getHookConfiguration();
            const hooksDir = path.join(workspace, '.git', 'hooks');
            const platformInfo = this.crossPlatformHooks.getPlatformInfo();

            const hookNames = ['pre-commit', 'pre-push', 'commit-msg', 'pre-receive'];
            const statuses: HookStatus[] = [];

            for (const hookName of hookNames) {
                const hookPath = path.join(hooksDir, hookName);
                let installed = false;
                let executable = false;
                let valid = false;
                let lastModified: Date | undefined;

                try {
                    const fs = await import('fs');
                    if (fs.existsSync(hookPath)) {
                        installed = true;
                        const stats = fs.statSync(hookPath);
                        lastModified = stats.mtime;

                        // Check if executable on Unix systems
                        if (platformInfo.isUnix) {
                            executable = (stats.mode & parseInt('111', 8)) !== 0;
                        } else {
                            executable = true; // Windows doesn't use execute permissions
                        }

                        // Check if it's a valid FlowCode hook
                        const content = fs.readFileSync(hookPath, 'utf8');
                        valid = content.includes('FlowCode');
                    }
                } catch (error) {
                    this.contextLogger.warn(`Failed to check hook status: ${hookName}`, error as Error);
                }

                statuses.push({
                    name: hookName,
                    installed,
                    enabled: this.isHookEnabled(hookName, config),
                    lastModified,
                    platform: platformInfo.platform,
                    executable,
                    valid
                });
            }

            return statuses;
        } catch (error) {
            this.contextLogger.error('Failed to get hook status', error as Error);
            throw error;
        }
    }

    /**
     * Test a specific git hook
     */
    public async testHook(hookName: string, workspaceRoot?: string): Promise<{
        success: boolean;
        output: string;
        error?: string;
        executionTime: number;
    }> {
        try {
            const workspace = workspaceRoot || await this.configManager.getWorkspaceRoot();
            
            this.contextLogger.info(`Testing git hook: ${hookName}`, { workspace });

            const result = await this.crossPlatformHooks.testHook(workspace, hookName);

            this.contextLogger.info(`Hook test completed: ${hookName}`, {
                success: result.success,
                executionTime: result.executionTime
            });

            return result;
        } catch (error) {
            this.contextLogger.error(`Failed to test hook: ${hookName}`, error as Error);
            throw error;
        }
    }

    /**
     * Uninstall git hooks
     */
    public async uninstallHooks(hookNames?: string[], workspaceRoot?: string): Promise<{
        success: boolean;
        uninstalledHooks: string[];
        errors: string[];
    }> {
        try {
            const workspace = workspaceRoot || await this.configManager.getWorkspaceRoot();
            const hooksToUninstall = hookNames || ['pre-commit', 'pre-push', 'commit-msg', 'pre-receive'];

            this.contextLogger.info('Uninstalling git hooks', {
                workspace,
                hooks: hooksToUninstall
            });

            const result = await this.crossPlatformHooks.uninstallHooks(workspace, hooksToUninstall);

            // Show user notification
            if (result.success) {
                vscode.window.showInformationMessage(
                    `FlowCode git hooks uninstalled successfully (${result.uninstalledHooks.length} hooks)`
                );
            } else {
                vscode.window.showWarningMessage(
                    `Some hooks could not be uninstalled: ${result.errors.join(', ')}`
                );
            }

            return result;
        } catch (error) {
            this.contextLogger.error('Failed to uninstall git hooks', error as Error);
            throw error;
        }
    }

    /**
     * Update hook configuration
     */
    public async updateHookConfiguration(config: Partial<GitHookManagerConfig>): Promise<void> {
        try {
            const currentConfig = await this.getHookConfiguration();
            const newConfig = { ...currentConfig, ...config };

            // Save to VS Code settings
            const vscodeConfig = vscode.workspace.getConfiguration('flowcode.gitHooks');
            await vscodeConfig.update('enablePreCommit', newConfig.enablePreCommit, vscode.ConfigurationTarget.Workspace);
            await vscodeConfig.update('enablePrePush', newConfig.enablePrePush, vscode.ConfigurationTarget.Workspace);
            await vscodeConfig.update('enableCommitMsg', newConfig.enableCommitMsg, vscode.ConfigurationTarget.Workspace);
            await vscodeConfig.update('enablePreReceive', newConfig.enablePreReceive, vscode.ConfigurationTarget.Workspace);
            await vscodeConfig.update('hookTimeout', newConfig.hookTimeout, vscode.ConfigurationTarget.Workspace);
            await vscodeConfig.update('failOnError', newConfig.failOnError, vscode.ConfigurationTarget.Workspace);
            await vscodeConfig.update('skipOnCI', newConfig.skipOnCI, vscode.ConfigurationTarget.Workspace);
            await vscodeConfig.update('customHooks', newConfig.customHooks, vscode.ConfigurationTarget.Workspace);

            this.contextLogger.info('Hook configuration updated', newConfig);
        } catch (error) {
            this.contextLogger.error('Failed to update hook configuration', error as Error);
            throw error;
        }
    }

    /**
     * Get current hook configuration
     */
    private async getHookConfiguration(): Promise<GitHookManagerConfig> {
        const config = vscode.workspace.getConfiguration('flowcode.gitHooks');

        return {
            enablePreCommit: config.get<boolean>('enablePreCommit', true),
            enablePrePush: config.get<boolean>('enablePrePush', true),
            enableCommitMsg: config.get<boolean>('enableCommitMsg', true),
            enablePreReceive: config.get<boolean>('enablePreReceive', false),
            hookTimeout: config.get<number>('hookTimeout', 300), // 5 minutes
            failOnError: config.get<boolean>('failOnError', true),
            skipOnCI: config.get<boolean>('skipOnCI', false),
            customHooks: config.get<{ [hookName: string]: string }>('customHooks', {})
        };
    }

    /**
     * Build hook configurations from settings
     */
    private buildHookConfigs(config: GitHookManagerConfig): GitHookConfig[] {
        const hooks: GitHookConfig[] = [];

        if (config.enablePreCommit) {
            hooks.push({
                name: 'pre-commit',
                enabled: true,
                timeout: config.hookTimeout,
                failOnError: config.failOnError,
                skipOnCI: config.skipOnCI,
                customScript: config.customHooks['pre-commit']
            });
        }

        if (config.enablePrePush) {
            hooks.push({
                name: 'pre-push',
                enabled: true,
                timeout: config.hookTimeout,
                failOnError: config.failOnError,
                skipOnCI: config.skipOnCI,
                customScript: config.customHooks['pre-push']
            });
        }

        if (config.enableCommitMsg) {
            hooks.push({
                name: 'commit-msg',
                enabled: true,
                timeout: config.hookTimeout,
                failOnError: config.failOnError,
                skipOnCI: config.skipOnCI,
                customScript: config.customHooks['commit-msg']
            });
        }

        if (config.enablePreReceive) {
            hooks.push({
                name: 'pre-receive',
                enabled: true,
                timeout: config.hookTimeout,
                failOnError: config.failOnError,
                skipOnCI: config.skipOnCI,
                customScript: config.customHooks['pre-receive']
            });
        }

        return hooks;
    }

    /**
     * Check if a specific hook is enabled
     */
    private isHookEnabled(hookName: string, config: GitHookManagerConfig): boolean {
        switch (hookName) {
            case 'pre-commit':
                return config.enablePreCommit;
            case 'pre-push':
                return config.enablePrePush;
            case 'commit-msg':
                return config.enableCommitMsg;
            case 'pre-receive':
                return config.enablePreReceive;
            default:
                return false;
        }
    }

    /**
     * Get platform information
     */
    public getPlatformInfo() {
        return this.crossPlatformHooks.getPlatformInfo();
    }

    /**
     * Dispose resources
     */
    public dispose(): void {
        this.contextLogger.info('GitHookManager disposed');
    }
}
