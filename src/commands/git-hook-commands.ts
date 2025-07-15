import * as vscode from 'vscode';
import { GitHookManager, HookStatus } from '../services/git-hook-manager';
import { ConfigurationManager } from '../utils/configuration-manager';
import { logger } from '../utils/logger';

export class GitHookCommands {
    private contextLogger = logger.createContextLogger('GitHookCommands');
    private gitHookManager: GitHookManager;

    constructor(private configManager: ConfigurationManager) {
        this.gitHookManager = new GitHookManager(configManager);
    }

    /**
     * Register all git hook commands
     */
    public registerCommands(context: vscode.ExtensionContext): void {
        const commands = [
            vscode.commands.registerCommand('flowcode.installGitHooks', () => this.installGitHooks()),
            vscode.commands.registerCommand('flowcode.uninstallGitHooks', () => this.uninstallGitHooks()),
            vscode.commands.registerCommand('flowcode.showHookStatus', () => this.showHookStatus()),
            vscode.commands.registerCommand('flowcode.testGitHook', () => this.testGitHook()),
            vscode.commands.registerCommand('flowcode.configureGitHooks', () => this.configureGitHooks()),
            vscode.commands.registerCommand('flowcode.reinstallGitHooks', () => this.reinstallGitHooks())
        ];

        context.subscriptions.push(...commands);
        this.contextLogger.info('Git hook commands registered');
    }

    /**
     * Install git hooks command
     */
    private async installGitHooks(): Promise<void> {
        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "Installing FlowCode Git Hooks",
                cancellable: false
            }, async (progress) => {
                progress.report({ increment: 0, message: "Detecting platform..." });
                
                const platformInfo = this.gitHookManager.getPlatformInfo();
                progress.report({ 
                    increment: 20, 
                    message: `Installing hooks for ${platformInfo.platform}...` 
                });

                const result = await this.gitHookManager.installHooks();
                
                progress.report({ increment: 80, message: "Verifying installation..." });

                if (result.success) {
                    progress.report({ increment: 100, message: "Installation completed!" });
                    
                    // Show detailed results
                    const message = `Successfully installed ${result.installedHooks.length} git hooks:\n` +
                                  `• ${result.installedHooks.join('\n• ')}\n\n` +
                                  `Platform: ${result.platform}`;
                    
                    vscode.window.showInformationMessage(message);
                } else {
                    const errorMessage = `Failed to install git hooks:\n${result.errors.join('\n')}`;
                    vscode.window.showErrorMessage(errorMessage);
                }
            });
        } catch (error) {
            this.contextLogger.error('Install git hooks command failed', error as Error);
            vscode.window.showErrorMessage(`Failed to install git hooks: ${(error as Error).message}`);
        }
    }

    /**
     * Uninstall git hooks command
     */
    private async uninstallGitHooks(): Promise<void> {
        try {
            const confirmation = await vscode.window.showWarningMessage(
                'Are you sure you want to uninstall FlowCode git hooks?',
                { modal: true },
                'Yes, Uninstall',
                'Cancel'
            );

            if (confirmation !== 'Yes, Uninstall') {
                return;
            }

            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "Uninstalling FlowCode Git Hooks",
                cancellable: false
            }, async (progress) => {
                progress.report({ increment: 0, message: "Removing hooks..." });

                const result = await this.gitHookManager.uninstallHooks();

                progress.report({ increment: 100, message: "Uninstallation completed!" });

                if (result.success) {
                    const message = `Successfully uninstalled ${result.uninstalledHooks.length} git hooks:\n` +
                                  `• ${result.uninstalledHooks.join('\n• ')}`;
                    vscode.window.showInformationMessage(message);
                } else {
                    const errorMessage = `Some hooks could not be uninstalled:\n${result.errors.join('\n')}`;
                    vscode.window.showWarningMessage(errorMessage);
                }
            });
        } catch (error) {
            this.contextLogger.error('Uninstall git hooks command failed', error as Error);
            vscode.window.showErrorMessage(`Failed to uninstall git hooks: ${(error as Error).message}`);
        }
    }

    /**
     * Show hook status command
     */
    private async showHookStatus(): Promise<void> {
        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "Checking Git Hook Status",
                cancellable: false
            }, async (progress) => {
                progress.report({ increment: 0, message: "Analyzing hooks..." });

                const statuses = await this.gitHookManager.getHookStatus();
                const platformInfo = this.gitHookManager.getPlatformInfo();

                progress.report({ increment: 100, message: "Analysis completed!" });

                // Create status report
                const statusReport = this.formatHookStatusReport(statuses, platformInfo);
                
                // Show in new document
                const doc = await vscode.workspace.openTextDocument({
                    content: statusReport,
                    language: 'markdown'
                });
                
                await vscode.window.showTextDocument(doc);
            });
        } catch (error) {
            this.contextLogger.error('Show hook status command failed', error as Error);
            vscode.window.showErrorMessage(`Failed to get hook status: ${(error as Error).message}`);
        }
    }

    /**
     * Test git hook command
     */
    private async testGitHook(): Promise<void> {
        try {
            const statuses = await this.gitHookManager.getHookStatus();
            const installedHooks = statuses.filter(s => s.installed).map(s => s.name);

            if (installedHooks.length === 0) {
                vscode.window.showWarningMessage('No git hooks are installed. Install hooks first.');
                return;
            }

            const selectedHook = await vscode.window.showQuickPick(installedHooks, {
                placeHolder: 'Select a git hook to test'
            });

            if (!selectedHook) {
                return;
            }

            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Testing Git Hook: ${selectedHook}`,
                cancellable: false
            }, async (progress) => {
                progress.report({ increment: 0, message: "Executing hook..." });

                const result = await this.gitHookManager.testHook(selectedHook);

                progress.report({ increment: 100, message: "Test completed!" });

                // Show test results
                const testReport = this.formatHookTestReport(selectedHook, result);
                
                const doc = await vscode.workspace.openTextDocument({
                    content: testReport,
                    language: 'markdown'
                });
                
                await vscode.window.showTextDocument(doc);

                // Show summary notification
                if (result.success) {
                    vscode.window.showInformationMessage(
                        `Hook '${selectedHook}' test passed (${result.executionTime}ms)`
                    );
                } else {
                    vscode.window.showErrorMessage(
                        `Hook '${selectedHook}' test failed: ${result.error || 'Unknown error'}`
                    );
                }
            });
        } catch (error) {
            this.contextLogger.error('Test git hook command failed', error as Error);
            vscode.window.showErrorMessage(`Failed to test git hook: ${(error as Error).message}`);
        }
    }

    /**
     * Configure git hooks command
     */
    private async configureGitHooks(): Promise<void> {
        try {
            const options = [
                { label: 'Enable/Disable Hooks', description: 'Configure which hooks are enabled' },
                { label: 'Hook Settings', description: 'Configure timeout, error handling, and CI behavior' },
                { label: 'Custom Scripts', description: 'Add custom scripts to hooks' },
                { label: 'Platform Settings', description: 'View platform-specific configuration' }
            ];

            const selection = await vscode.window.showQuickPick(options, {
                placeHolder: 'Select configuration option'
            });

            if (!selection) {
                return;
            }

            switch (selection.label) {
                case 'Enable/Disable Hooks':
                    await this.configureHookEnablement();
                    break;
                case 'Hook Settings':
                    await this.configureHookSettings();
                    break;
                case 'Custom Scripts':
                    await this.configureCustomScripts();
                    break;
                case 'Platform Settings':
                    await this.showPlatformSettings();
                    break;
            }
        } catch (error) {
            this.contextLogger.error('Configure git hooks command failed', error as Error);
            vscode.window.showErrorMessage(`Failed to configure git hooks: ${(error as Error).message}`);
        }
    }

    /**
     * Reinstall git hooks command
     */
    private async reinstallGitHooks(): Promise<void> {
        try {
            const confirmation = await vscode.window.showInformationMessage(
                'This will uninstall and reinstall all FlowCode git hooks. Continue?',
                'Yes, Reinstall',
                'Cancel'
            );

            if (confirmation !== 'Yes, Reinstall') {
                return;
            }

            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "Reinstalling FlowCode Git Hooks",
                cancellable: false
            }, async (progress) => {
                progress.report({ increment: 0, message: "Uninstalling existing hooks..." });
                
                await this.gitHookManager.uninstallHooks();
                
                progress.report({ increment: 50, message: "Installing fresh hooks..." });
                
                const result = await this.gitHookManager.installHooks();
                
                progress.report({ increment: 100, message: "Reinstallation completed!" });

                if (result.success) {
                    vscode.window.showInformationMessage(
                        `Successfully reinstalled ${result.installedHooks.length} git hooks`
                    );
                } else {
                    vscode.window.showErrorMessage(
                        `Reinstallation failed: ${result.errors.join(', ')}`
                    );
                }
            });
        } catch (error) {
            this.contextLogger.error('Reinstall git hooks command failed', error as Error);
            vscode.window.showErrorMessage(`Failed to reinstall git hooks: ${(error as Error).message}`);
        }
    }

    /**
     * Configure hook enablement
     */
    private async configureHookEnablement(): Promise<void> {
        const config = vscode.workspace.getConfiguration('flowcode.gitHooks');

        const hooks = [
            { name: 'pre-commit', current: config.get<boolean>('enablePreCommit', true) },
            { name: 'pre-push', current: config.get<boolean>('enablePrePush', true) },
            { name: 'commit-msg', current: config.get<boolean>('enableCommitMsg', true) },
            { name: 'pre-receive', current: config.get<boolean>('enablePreReceive', false) }
        ];

        for (const hook of hooks) {
            const action = await vscode.window.showQuickPick([
                { label: 'Enable', description: `Enable ${hook.name} hook` },
                { label: 'Disable', description: `Disable ${hook.name} hook` },
                { label: 'Skip', description: `Keep current setting (${hook.current ? 'enabled' : 'disabled'})` }
            ], {
                placeHolder: `Configure ${hook.name} hook`
            });

            if (action && action.label !== 'Skip') {
                const enable = action.label === 'Enable';
                const configKey = `enable${hook.name.split('-').map(part =>
                    part.charAt(0).toUpperCase() + part.slice(1)
                ).join('')}` as any;

                await config.update(configKey, enable, vscode.ConfigurationTarget.Workspace);
            }
        }

        vscode.window.showInformationMessage('Hook configuration updated. Reinstall hooks to apply changes.');
    }

    /**
     * Configure hook settings
     */
    private async configureHookSettings(): Promise<void> {
        const config = vscode.workspace.getConfiguration('flowcode.gitHooks');

        // Configure timeout
        const timeoutInput = await vscode.window.showInputBox({
            prompt: 'Hook timeout in seconds',
            value: config.get<number>('hookTimeout', 300).toString(),
            validateInput: (value) => {
                const num = parseInt(value);
                if (isNaN(num) || num < 1 || num > 3600) {
                    return 'Timeout must be between 1 and 3600 seconds';
                }
                return undefined;
            }
        });

        if (timeoutInput) {
            await config.update('hookTimeout', parseInt(timeoutInput), vscode.ConfigurationTarget.Workspace);
        }

        // Configure error handling
        const failOnError = await vscode.window.showQuickPick([
            { label: 'Fail on Error', description: 'Stop execution when errors occur' },
            { label: 'Continue on Error', description: 'Show warnings but continue execution' }
        ], {
            placeHolder: 'Error handling behavior'
        });

        if (failOnError) {
            await config.update('failOnError', failOnError.label === 'Fail on Error', vscode.ConfigurationTarget.Workspace);
        }

        // Configure CI behavior
        const skipOnCI = await vscode.window.showQuickPick([
            { label: 'Run in CI', description: 'Execute hooks in CI environments' },
            { label: 'Skip in CI', description: 'Skip hook execution in CI environments' }
        ], {
            placeHolder: 'CI environment behavior'
        });

        if (skipOnCI) {
            await config.update('skipOnCI', skipOnCI.label === 'Skip in CI', vscode.ConfigurationTarget.Workspace);
        }

        vscode.window.showInformationMessage('Hook settings updated. Reinstall hooks to apply changes.');
    }

    /**
     * Configure custom scripts
     */
    private async configureCustomScripts(): Promise<void> {
        const config = vscode.workspace.getConfiguration('flowcode.gitHooks');
        const customHooks = config.get<{ [hookName: string]: string }>('customHooks', {});

        const hookName = await vscode.window.showQuickPick([
            'pre-commit',
            'pre-push',
            'commit-msg',
            'pre-receive'
        ], {
            placeHolder: 'Select hook to customize'
        });

        if (!hookName) {
            return;
        }

        const currentScript = customHooks[hookName] || '';
        const action = await vscode.window.showQuickPick([
            { label: 'Edit Script', description: 'Edit custom script for this hook' },
            { label: 'Remove Script', description: 'Remove custom script and use default' },
            { label: 'View Current', description: 'View current custom script' }
        ], {
            placeHolder: `Configure custom script for ${hookName}`
        });

        if (!action) {
            return;
        }

        switch (action.label) {
            case 'Edit Script':
                const doc = await vscode.workspace.openTextDocument({
                    content: currentScript,
                    language: this.gitHookManager.getPlatformInfo().isWindows ? 'bat' : 'shellscript'
                });

                const editor = await vscode.window.showTextDocument(doc);

                vscode.window.showInformationMessage(
                    'Edit the script and save. Use "FlowCode: Save Custom Hook Script" command when done.',
                    'Save Script'
                ).then(async (selection) => {
                    if (selection === 'Save Script') {
                        const newScript = editor.document.getText();
                        const updatedCustomHooks = { ...customHooks, [hookName]: newScript };
                        await config.update('customHooks', updatedCustomHooks, vscode.ConfigurationTarget.Workspace);
                        vscode.window.showInformationMessage(`Custom script saved for ${hookName}`);
                    }
                });
                break;

            case 'Remove Script':
                const updatedCustomHooks = { ...customHooks };
                delete updatedCustomHooks[hookName];
                await config.update('customHooks', updatedCustomHooks, vscode.ConfigurationTarget.Workspace);
                vscode.window.showInformationMessage(`Custom script removed for ${hookName}`);
                break;

            case 'View Current':
                if (currentScript) {
                    const doc = await vscode.workspace.openTextDocument({
                        content: currentScript,
                        language: this.gitHookManager.getPlatformInfo().isWindows ? 'bat' : 'shellscript'
                    });
                    await vscode.window.showTextDocument(doc);
                } else {
                    vscode.window.showInformationMessage(`No custom script configured for ${hookName}`);
                }
                break;
        }
    }

    /**
     * Show platform settings
     */
    private async showPlatformSettings(): Promise<void> {
        const platformInfo = this.gitHookManager.getPlatformInfo();

        const report = `# FlowCode Git Hooks - Platform Information

## Current Platform
- **Platform**: ${platformInfo.platform}
- **Shell**: ${platformInfo.shell}
- **Path Separator**: ${platformInfo.pathSeparator}
- **Script Extension**: ${platformInfo.scriptExtension || 'none'}
- **Executable Extension**: ${platformInfo.executableExtension || 'none'}

## Platform Capabilities
- **Windows**: ${platformInfo.isWindows ? '✅' : '❌'}
- **Unix/Linux**: ${platformInfo.isUnix ? '✅' : '❌'}
- **macOS**: ${platformInfo.isMacOS ? '✅' : '❌'}
- **Linux**: ${platformInfo.isLinux ? '✅' : '❌'}

## Hook Execution
- **Command Shell**: ${platformInfo.shell}
- **Script Format**: ${platformInfo.isWindows ? 'Batch (.bat)' : 'Shell Script'}
- **Permissions**: ${platformInfo.isUnix ? 'Execute permissions required' : 'No special permissions needed'}

## Recommendations
${this.getPlatformRecommendations(platformInfo)}
`;

        const doc = await vscode.workspace.openTextDocument({
            content: report,
            language: 'markdown'
        });

        await vscode.window.showTextDocument(doc);
    }

    /**
     * Format hook status report
     */
    private formatHookStatusReport(statuses: HookStatus[], platformInfo: any): string {
        const timestamp = new Date().toISOString();

        let report = `# FlowCode Git Hooks Status Report
Generated: ${timestamp}
Platform: ${platformInfo.platform}

## Hook Status Overview
`;

        for (const status of statuses) {
            const statusIcon = status.installed ? (status.valid ? '✅' : '⚠️') : '❌';
            const enabledIcon = status.enabled ? '🟢' : '🔴';

            report += `
### ${status.name}
- **Status**: ${statusIcon} ${status.installed ? 'Installed' : 'Not Installed'}
- **Enabled**: ${enabledIcon} ${status.enabled ? 'Enabled' : 'Disabled'}
- **Valid**: ${status.valid ? '✅ Valid FlowCode hook' : '❌ Not a FlowCode hook'}
- **Executable**: ${status.executable ? '✅ Executable' : '❌ Not executable'}
- **Last Modified**: ${status.lastModified ? status.lastModified.toISOString() : 'N/A'}
`;
        }

        const installedCount = statuses.filter(s => s.installed).length;
        const validCount = statuses.filter(s => s.valid).length;
        const enabledCount = statuses.filter(s => s.enabled).length;

        report += `
## Summary
- **Total Hooks**: ${statuses.length}
- **Installed**: ${installedCount}/${statuses.length}
- **Valid**: ${validCount}/${installedCount}
- **Enabled**: ${enabledCount}/${statuses.length}

## Recommendations
${this.getStatusRecommendations(statuses)}
`;

        return report;
    }

    /**
     * Format hook test report
     */
    private formatHookTestReport(hookName: string, result: any): string {
        const timestamp = new Date().toISOString();

        return `# Git Hook Test Report: ${hookName}
Generated: ${timestamp}

## Test Results
- **Success**: ${result.success ? '✅ Passed' : '❌ Failed'}
- **Execution Time**: ${result.executionTime}ms

## Output
\`\`\`
${result.output || 'No output'}
\`\`\`

${result.error ? `## Error
\`\`\`
${result.error}
\`\`\`
` : ''}

## Next Steps
${result.success ?
    '✅ Hook is working correctly and ready for use.' :
    '❌ Hook failed. Check the error output above and fix any issues before using.'}
`;
    }

    /**
     * Get platform-specific recommendations
     */
    private getPlatformRecommendations(platformInfo: any): string {
        const recommendations = [];

        if (platformInfo.isWindows) {
            recommendations.push('- Ensure Git Bash or PowerShell is available for optimal hook execution');
            recommendations.push('- Windows Defender may interfere with hook execution - add exclusions if needed');
            recommendations.push('- Use forward slashes in paths within hook scripts for better compatibility');
        }

        if (platformInfo.isUnix) {
            recommendations.push('- Ensure hooks have execute permissions (chmod +x)');
            recommendations.push('- Use absolute paths in hook scripts when possible');
            recommendations.push('- Test hooks with different shell environments (bash, zsh, etc.)');
        }

        if (platformInfo.isMacOS) {
            recommendations.push('- Xcode Command Line Tools may be required for some operations');
            recommendations.push('- Consider using Homebrew for tool installation consistency');
        }

        return recommendations.length > 0 ? recommendations.join('\n') : '- No specific recommendations for this platform';
    }

    /**
     * Get status-based recommendations
     */
    private getStatusRecommendations(statuses: HookStatus[]): string {
        const recommendations = [];

        const notInstalled = statuses.filter(s => !s.installed && s.enabled);
        const notValid = statuses.filter(s => s.installed && !s.valid);
        const notExecutable = statuses.filter(s => s.installed && !s.executable);

        if (notInstalled.length > 0) {
            recommendations.push(`- Install missing hooks: ${notInstalled.map(s => s.name).join(', ')}`);
        }

        if (notValid.length > 0) {
            recommendations.push(`- Reinstall invalid hooks: ${notValid.map(s => s.name).join(', ')}`);
        }

        if (notExecutable.length > 0) {
            recommendations.push(`- Fix permissions for non-executable hooks: ${notExecutable.map(s => s.name).join(', ')}`);
        }

        if (recommendations.length === 0) {
            recommendations.push('- All hooks are properly configured and ready for use');
        }

        return recommendations.join('\n');
    }

    /**
     * Dispose resources
     */
    public dispose(): void {
        this.gitHookManager.dispose();
        this.contextLogger.info('GitHookCommands disposed');
    }
}
