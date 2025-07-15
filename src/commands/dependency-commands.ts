import * as vscode from 'vscode';
import { DependencyService } from '../services/dependency-service';
import { ConfigurationManager } from '../utils/configuration-manager';
import { logger } from '../utils/logger';

export class DependencyCommands {
    private contextLogger = logger.createContextLogger('DependencyCommands');
    private dependencyService: DependencyService;

    constructor(private configManager: ConfigurationManager) {
        this.dependencyService = new DependencyService(configManager);
    }

    /**
     * Register all dependency commands
     */
    public registerCommands(context: vscode.ExtensionContext): void {
        const commands = [
            vscode.commands.registerCommand('flowcode.checkDependencies', () => this.checkDependencies()),
            vscode.commands.registerCommand('flowcode.showInstallationGuide', () => this.showInstallationGuide()),
            vscode.commands.registerCommand('flowcode.showDependencyStatus', () => this.showDependencyStatus()),
            vscode.commands.registerCommand('flowcode.configureDependencies', () => this.configureDependencies()),
            vscode.commands.registerCommand('flowcode.refreshDependencies', () => this.refreshDependencies()),
            vscode.commands.registerCommand('flowcode.showToolDetails', () => this.showToolDetails())
        ];

        context.subscriptions.push(...commands);
        this.contextLogger.info('Dependency commands registered');
    }

    /**
     * Initialize dependency service
     */
    public async initialize(): Promise<void> {
        await this.dependencyService.initialize();
    }

    /**
     * Check dependencies command
     */
    private async checkDependencies(): Promise<void> {
        try {
            const result = await this.dependencyService.performDependencyCheck(true);
            
            // Show summary notification
            if (result.allSatisfied) {
                vscode.window.showInformationMessage(
                    '✅ All FlowCode dependencies are satisfied!',
                    'Show Details'
                ).then(action => {
                    if (action === 'Show Details') {
                        this.showDependencyStatus();
                    }
                });
            } else {
                const issues = [];
                if (result.requiredMissing.length > 0) {
                    issues.push(`${result.requiredMissing.length} required missing`);
                }
                if (result.incompatible.length > 0) {
                    issues.push(`${result.incompatible.length} incompatible`);
                }
                if (result.optionalMissing.length > 0) {
                    issues.push(`${result.optionalMissing.length} optional missing`);
                }

                vscode.window.showWarningMessage(
                    `❌ Dependency issues found: ${issues.join(', ')}`,
                    'Show Installation Guide',
                    'Show Details'
                ).then(action => {
                    switch (action) {
                        case 'Show Installation Guide':
                            this.showInstallationGuide();
                            break;
                        case 'Show Details':
                            this.showDependencyStatus();
                            break;
                    }
                });
            }
        } catch (error) {
            this.contextLogger.error('Check dependencies command failed', error as Error);
            vscode.window.showErrorMessage(`Failed to check dependencies: ${(error as Error).message}`);
        }
    }

    /**
     * Show installation guide command
     */
    private async showInstallationGuide(): Promise<void> {
        try {
            await this.dependencyService.showInstallationGuide();
        } catch (error) {
            this.contextLogger.error('Show installation guide command failed', error as Error);
            vscode.window.showErrorMessage(`Failed to show installation guide: ${(error as Error).message}`);
        }
    }

    /**
     * Show dependency status command
     */
    private async showDependencyStatus(): Promise<void> {
        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "Generating Dependency Status Report",
                cancellable: false
            }, async (progress) => {
                progress.report({ increment: 0, message: "Checking tool status..." });

                const result = await this.dependencyService.performDependencyCheck(false);
                
                progress.report({ increment: 50, message: "Generating report..." });

                const statusReport = this.generateStatusReport(result);
                
                progress.report({ increment: 100, message: "Report generated!" });

                const doc = await vscode.workspace.openTextDocument({
                    content: statusReport,
                    language: 'markdown'
                });

                await vscode.window.showTextDocument(doc);
            });
        } catch (error) {
            this.contextLogger.error('Show dependency status command failed', error as Error);
            vscode.window.showErrorMessage(`Failed to show dependency status: ${(error as Error).message}`);
        }
    }

    /**
     * Configure dependencies command
     */
    private async configureDependencies(): Promise<void> {
        try {
            const options = [
                { 
                    label: 'Startup Check', 
                    description: 'Configure dependency checking on extension startup' 
                },
                { 
                    label: 'Notifications', 
                    description: 'Configure dependency notification settings' 
                },
                { 
                    label: 'Periodic Check', 
                    description: 'Configure automatic periodic dependency checking' 
                },
                { 
                    label: 'Auto Install', 
                    description: 'Configure automatic installation of optional tools' 
                }
            ];

            const selection = await vscode.window.showQuickPick(options, {
                placeHolder: 'Select dependency configuration option'
            });

            if (!selection) {
                return;
            }

            switch (selection.label) {
                case 'Startup Check':
                    await this.configureStartupCheck();
                    break;
                case 'Notifications':
                    await this.configureNotifications();
                    break;
                case 'Periodic Check':
                    await this.configurePeriodicCheck();
                    break;
                case 'Auto Install':
                    await this.configureAutoInstall();
                    break;
            }
        } catch (error) {
            this.contextLogger.error('Configure dependencies command failed', error as Error);
            vscode.window.showErrorMessage(`Failed to configure dependencies: ${(error as Error).message}`);
        }
    }

    /**
     * Refresh dependencies command
     */
    private async refreshDependencies(): Promise<void> {
        try {
            const result = await this.dependencyService.refreshDependencies();
            
            vscode.window.showInformationMessage(
                `Dependency check refreshed. Status: ${result.allSatisfied ? 'All OK' : 'Issues found'}`,
                'Show Details'
            ).then(action => {
                if (action === 'Show Details') {
                    this.showDependencyStatus();
                }
            });
        } catch (error) {
            this.contextLogger.error('Refresh dependencies command failed', error as Error);
            vscode.window.showErrorMessage(`Failed to refresh dependencies: ${(error as Error).message}`);
        }
    }

    /**
     * Show tool details command
     */
    private async showToolDetails(): Promise<void> {
        try {
            const result = this.dependencyService.getLastCheckResult();
            if (!result) {
                vscode.window.showInformationMessage('No dependency check results available. Run dependency check first.');
                return;
            }

            const toolOptions = result.toolStatuses.map(status => ({
                label: status.name,
                description: `${status.installed ? '✅' : '❌'} ${status.version || 'Not installed'}`,
                detail: status.installed ? status.path : 'Not found in PATH'
            }));

            const selectedTool = await vscode.window.showQuickPick(toolOptions, {
                placeHolder: 'Select a tool to view details'
            });

            if (!selectedTool) {
                return;
            }

            const toolStatus = result.toolStatuses.find(s => s.name === selectedTool.label);
            if (toolStatus) {
                await this.showToolDetailsReport(toolStatus);
            }
        } catch (error) {
            this.contextLogger.error('Show tool details command failed', error as Error);
            vscode.window.showErrorMessage(`Failed to show tool details: ${(error as Error).message}`);
        }
    }

    /**
     * Configure startup check
     */
    private async configureStartupCheck(): Promise<void> {
        const config = vscode.workspace.getConfiguration('flowcode.dependencies');
        const current = config.get<boolean>('checkOnStartup', true);

        const selection = await vscode.window.showQuickPick([
            { label: 'Enable', description: 'Check dependencies when FlowCode starts' },
            { label: 'Disable', description: 'Skip dependency check on startup' }
        ], {
            placeHolder: `Current setting: ${current ? 'Enabled' : 'Disabled'}`
        });

        if (selection) {
            const enable = selection.label === 'Enable';
            await this.dependencyService.updateConfiguration({ checkOnStartup: enable });
            vscode.window.showInformationMessage(`Startup dependency check ${enable ? 'enabled' : 'disabled'}`);
        }
    }

    /**
     * Configure notifications
     */
    private async configureNotifications(): Promise<void> {
        const config = vscode.workspace.getConfiguration('flowcode.dependencies');
        const current = config.get<boolean>('showNotifications', true);

        const selection = await vscode.window.showQuickPick([
            { label: 'Enable', description: 'Show notifications for dependency issues' },
            { label: 'Disable', description: 'Silent dependency checking' }
        ], {
            placeHolder: `Current setting: ${current ? 'Enabled' : 'Disabled'}`
        });

        if (selection) {
            const enable = selection.label === 'Enable';
            await this.dependencyService.updateConfiguration({ showNotifications: enable });
            vscode.window.showInformationMessage(`Dependency notifications ${enable ? 'enabled' : 'disabled'}`);
        }
    }

    /**
     * Configure periodic check
     */
    private async configurePeriodicCheck(): Promise<void> {
        const config = vscode.workspace.getConfiguration('flowcode.dependencies');
        const current = config.get<number>('checkInterval', 60);

        const intervalInput = await vscode.window.showInputBox({
            prompt: 'Check interval in minutes (0 to disable)',
            value: current.toString(),
            validateInput: (value) => {
                const num = parseInt(value);
                if (isNaN(num) || num < 0) {
                    return 'Please enter a valid number (0 or greater)';
                }
                return undefined;
            }
        });

        if (intervalInput !== undefined) {
            const interval = parseInt(intervalInput);
            await this.dependencyService.updateConfiguration({ checkInterval: interval });
            
            if (interval > 0) {
                vscode.window.showInformationMessage(`Periodic dependency check set to ${interval} minutes`);
            } else {
                vscode.window.showInformationMessage('Periodic dependency check disabled');
            }
        }
    }

    /**
     * Configure auto install
     */
    private async configureAutoInstall(): Promise<void> {
        const config = vscode.workspace.getConfiguration('flowcode.dependencies');
        const current = config.get<boolean>('autoInstallOptional', false);

        const selection = await vscode.window.showQuickPick([
            { label: 'Enable', description: 'Automatically install optional tools when possible' },
            { label: 'Disable', description: 'Manual installation only' }
        ], {
            placeHolder: `Current setting: ${current ? 'Enabled' : 'Disabled'}`
        });

        if (selection) {
            const enable = selection.label === 'Enable';
            await this.dependencyService.updateConfiguration({ autoInstallOptional: enable });
            vscode.window.showInformationMessage(`Auto-install optional tools ${enable ? 'enabled' : 'disabled'}`);
        }
    }

    /**
     * Generate status report
     */
    private generateStatusReport(result: any): string {
        const timestamp = new Date().toISOString();

        let report = `# FlowCode Dependency Status Report
Generated: ${timestamp}

## System Information
- **Platform**: ${this.getPlatformDisplayName(result.platformInfo.platform)}
- **Architecture**: ${result.platformInfo.arch}
- **Node.js Version**: ${result.platformInfo.nodeVersion}
- **npm Version**: ${result.platformInfo.npmVersion || 'Not available'}

## Overall Status
${result.allSatisfied ? '✅ **All dependencies satisfied**' : '❌ **Some dependencies need attention**'}

`;

        // Required tools
        const requiredTools = result.toolStatuses.filter((status: any) => {
            // This would need to check against tool definitions, simplified for now
            return ['node', 'npm', 'git'].includes(status.name);
        });

        if (requiredTools.length > 0) {
            report += `## Required Tools\n\n`;
            for (const status of requiredTools) {
                report += this.formatToolStatus(status);
            }
        }

        // Optional tools
        const optionalTools = result.toolStatuses.filter((status: any) => {
            return !['node', 'npm', 'git'].includes(status.name);
        });

        if (optionalTools.length > 0) {
            report += `## Optional Tools\n\n`;
            for (const status of optionalTools) {
                report += this.formatToolStatus(status);
            }
        }

        return report;
    }

    /**
     * Format tool status for report
     */
    private formatToolStatus(status: any): string {
        const statusIcon = status.installed ? (status.compatible ? '✅' : '⚠️') : '❌';
        const versionText = status.version ? ` (${status.version})` : '';
        const pathText = status.path ? `\n  - **Path**: ${status.path}` : '';

        return `### ${status.name} ${statusIcon}
- **Status**: ${status.installed ? 'Installed' : 'Not installed'}${versionText}${pathText}
- **Compatible**: ${status.compatible ? 'Yes' : 'No'}

`;
    }

    /**
     * Show tool details report
     */
    private async showToolDetailsReport(toolStatus: any): Promise<void> {
        const report = `# Tool Details: ${toolStatus.name}

## Status
- **Installed**: ${toolStatus.installed ? '✅ Yes' : '❌ No'}
- **Version**: ${toolStatus.version || 'Unknown'}
- **Path**: ${toolStatus.path || 'Not found'}
- **Compatible**: ${toolStatus.compatible ? '✅ Yes' : '❌ No'}

## Issues
${toolStatus.issues && toolStatus.issues.length > 0
    ? toolStatus.issues.map((issue: string) => `- ${issue}`).join('\n')
    : '✅ No issues detected'
}

## Recommendations
${toolStatus.recommendations && toolStatus.recommendations.length > 0
    ? toolStatus.recommendations.map((rec: string) => `- ${rec}`).join('\n')
    : '✅ No recommendations'
}
`;

        const doc = await vscode.workspace.openTextDocument({
            content: report,
            language: 'markdown'
        });

        await vscode.window.showTextDocument(doc);
    }

    /**
     * Get platform display name
     */
    private getPlatformDisplayName(platform: string): string {
        switch (platform) {
            case 'win32': return 'Windows';
            case 'darwin': return 'macOS';
            case 'linux': return 'Linux';
            default: return platform;
        }
    }

    /**
     * Get dependency service
     */
    public getDependencyService(): DependencyService {
        return this.dependencyService;
    }

    /**
     * Dispose resources
     */
    public dispose(): void {
        this.dependencyService.dispose();
        this.contextLogger.info('DependencyCommands disposed');
    }
}
