import * as vscode from 'vscode';
import { UserExperienceService } from '../services/user-experience-service';
import { EnhancedErrorHandler } from '../utils/enhanced-error-handler';
import { ConfigurationManager } from '../utils/configuration-manager';
import { logger } from '../utils/logger';

export class UserExperienceCommands {
    private contextLogger = logger.createContextLogger('UserExperienceCommands');
    private userExperienceService: UserExperienceService;
    private errorHandler: EnhancedErrorHandler;

    constructor(private configManager: ConfigurationManager) {
        this.userExperienceService = new UserExperienceService(configManager);
        this.errorHandler = new EnhancedErrorHandler();
    }

    /**
     * Register all user experience commands
     */
    public registerCommands(context: vscode.ExtensionContext): void {
        const commands = [
            vscode.commands.registerCommand('flowcode.showQuickActions', () => this.showQuickActions()),
            vscode.commands.registerCommand('flowcode.showWelcomeGuide', () => this.showWelcomeGuide()),
            vscode.commands.registerCommand('flowcode.showTutorial', () => this.showTutorial()),
            vscode.commands.registerCommand('flowcode.configureUserExperience', () => this.configureUserExperience()),
            vscode.commands.registerCommand('flowcode.showErrorReports', () => this.showErrorReports()),
            vscode.commands.registerCommand('flowcode.showKeyboardShortcuts', () => this.showKeyboardShortcuts()),
            vscode.commands.registerCommand('flowcode.showFeatureOverview', () => this.showFeatureOverview()),
            vscode.commands.registerCommand('flowcode.enableOfflineMode', () => this.enableOfflineMode()),
            vscode.commands.registerCommand('flowcode.showContextualHelp', () => this.showContextualHelp()),
            vscode.commands.registerCommand('flowcode.customizeInterface', () => this.customizeInterface())
        ];

        context.subscriptions.push(...commands);
        this.contextLogger.info('User experience commands registered');
    }

    /**
     * Initialize user experience service
     */
    public async initialize(): Promise<void> {
        await this.userExperienceService.initialize();
    }

    /**
     * Show quick actions menu
     */
    private async showQuickActions(): Promise<void> {
        try {
            const actions = [
                {
                    label: '$(rocket) Generate Code',
                    description: 'AI-powered code generation',
                    detail: 'Generate code snippets, functions, or entire modules',
                    category: 'AI Features'
                },
                {
                    label: '$(search) Analyze Code',
                    description: 'Code analysis and insights',
                    detail: 'Get architectural insights and code quality metrics',
                    category: 'Analysis'
                },
                {
                    label: '$(git-branch) Create Hotfix',
                    description: 'Emergency hotfix workflow',
                    detail: 'Quickly create and manage emergency fixes',
                    category: 'Git Operations'
                },
                {
                    label: '$(shield) Security Audit',
                    description: 'Security vulnerability scan',
                    detail: 'Comprehensive security analysis of your code',
                    category: 'Security'
                },
                {
                    label: '$(graph) Dependency Graph',
                    description: 'Visualize code dependencies',
                    detail: 'Interactive dependency and architecture visualization',
                    category: 'Visualization'
                },
                {
                    label: '$(tools) Performance Optimization',
                    description: 'Optimize extension performance',
                    detail: 'Memory optimization and performance tuning',
                    category: 'Performance'
                },
                {
                    label: '$(settings-gear) Configure FlowCode',
                    description: 'Extension settings and preferences',
                    detail: 'Customize FlowCode behavior and features',
                    category: 'Configuration'
                },
                {
                    label: '$(question) Help & Documentation',
                    description: 'Get help and learn FlowCode',
                    detail: 'Tutorials, guides, and documentation',
                    category: 'Help'
                }
            ];

            const selected = await this.userExperienceService.showEnhancedQuickPick(actions, {
                placeHolder: 'What would you like to do with FlowCode?',
                showDescription: true,
                groupBy: (item) => item.category
            });

            if (selected) {
                await this.handleQuickAction(selected);
            }

        } catch (error) {
            await this.errorHandler.handleError(error as Error, {
                operation: 'showQuickActions',
                component: 'UserExperienceCommands'
            });
        }
    }

    /**
     * Handle quick action selection
     */
    private async handleQuickAction(action: any): Promise<void> {
        const commandMap: { [key: string]: string } = {
            '$(rocket) Generate Code': 'flowcode.generateCode',
            '$(search) Analyze Code': 'flowcode.analyzeCode',
            '$(git-branch) Create Hotfix': 'flowcode.createHotfix',
            '$(shield) Security Audit': 'flowcode.runSecurityAudit',
            '$(graph) Dependency Graph': 'flowcode.showDependencyGraph',
            '$(tools) Performance Optimization': 'flowcode.showPerformanceReport',
            '$(settings-gear) Configure FlowCode': 'flowcode.openSettings',
            '$(question) Help & Documentation': 'flowcode.showWelcomeGuide'
        };

        const command = commandMap[action.label];
        if (command) {
            try {
                await vscode.commands.executeCommand(command);
            } catch (error) {
                // If command doesn't exist, show a placeholder message
                await this.userExperienceService.showNotification({
                    type: 'info',
                    title: 'Feature Coming Soon',
                    message: `${action.description} will be available in a future update.`,
                    actions: ['OK']
                });
            }
        }
    }

    /**
     * Show welcome guide for new users
     */
    private async showWelcomeGuide(): Promise<void> {
        try {
            const welcomeContent = `# Welcome to FlowCode! 🚀

Thank you for installing FlowCode, the AI-powered development companion that enhances your coding workflow.

## What is FlowCode?

FlowCode is an intelligent VS Code extension that provides:

- **🤖 AI-Powered Code Generation**: Generate code snippets, functions, and modules with natural language
- **🔍 Intelligent Code Analysis**: Get insights about your code architecture and quality
- **🛡️ Security Auditing**: Comprehensive security vulnerability scanning
- **⚡ Performance Optimization**: Memory management and startup optimization
- **🔧 Git Integration**: Enhanced git workflows with smart hooks and hotfix management
- **📊 Dependency Visualization**: Interactive code dependency graphs

## Getting Started

### 1. Configure Your API Key
FlowCode uses AI services to provide intelligent features. Configure your API key:
- Open Command Palette (\`Ctrl+Shift+P\` / \`Cmd+Shift+P\`)
- Run "FlowCode: Configure API Key"
- Enter your OpenAI or other supported AI service API key

### 2. Explore Quick Actions
Access FlowCode features quickly:
- Click the FlowCode icon in the status bar
- Or run "FlowCode: Show Quick Actions" from Command Palette
- Or use the keyboard shortcut \`Ctrl+Alt+F\` (\`Cmd+Alt+F\` on Mac)

### 3. Try Key Features

#### Generate Code
1. Select some text or place cursor where you want code
2. Run "FlowCode: Generate Code"
3. Describe what you want in natural language
4. Review and accept the generated code

#### Analyze Your Project
1. Open a project in VS Code
2. Run "FlowCode: Analyze Code"
3. Get insights about architecture, dependencies, and quality

#### Security Audit
1. Run "FlowCode: Security Audit"
2. Review security findings and recommendations
3. Fix issues with guided assistance

## Keyboard Shortcuts

- \`Ctrl+Alt+F\` (\`Cmd+Alt+F\`): Quick Actions
- \`Ctrl+Alt+G\` (\`Cmd+Alt+G\`): Generate Code
- \`Ctrl+Alt+A\` (\`Cmd+Alt+A\`): Analyze Code
- \`Ctrl+Alt+S\` (\`Cmd+Alt+S\`): Security Audit
- \`Ctrl+Alt+H\` (\`Cmd+Alt+H\`): Create Hotfix

## Configuration

Customize FlowCode to your preferences:
- Run "FlowCode: Configure FlowCode" for guided setup
- Or manually edit settings in VS Code preferences

## Need Help?

- **Documentation**: [flowcode.dev/docs](https://flowcode.dev/docs)
- **Tutorials**: Run "FlowCode: Show Tutorial"
- **Keyboard Shortcuts**: Run "FlowCode: Show Keyboard Shortcuts"
- **Support**: [flowcode.dev/support](https://flowcode.dev/support)

## What's Next?

1. **Configure your API key** to unlock AI features
2. **Try generating some code** with natural language
3. **Run a security audit** on your current project
4. **Explore the dependency graph** to understand your codebase
5. **Customize settings** to match your workflow

Happy coding with FlowCode! 🎉

---

*This guide is also available anytime via "FlowCode: Show Welcome Guide"*
`;

            const doc = await vscode.workspace.openTextDocument({
                content: welcomeContent,
                language: 'markdown'
            });

            await vscode.window.showTextDocument(doc);

            // Show welcome actions
            const action = await vscode.window.showInformationMessage(
                'Welcome to FlowCode! Would you like to get started?',
                'Configure API Key',
                'Try Quick Actions',
                'Show Tutorial',
                'Later'
            );

            switch (action) {
                case 'Configure API Key':
                    await vscode.commands.executeCommand('flowcode.configureApiKey');
                    break;
                case 'Try Quick Actions':
                    await this.showQuickActions();
                    break;
                case 'Show Tutorial':
                    await this.showTutorial();
                    break;
            }

        } catch (error) {
            await this.errorHandler.handleError(error as Error, {
                operation: 'showWelcomeGuide',
                component: 'UserExperienceCommands'
            });
        }
    }

    /**
     * Show interactive tutorial
     */
    private async showTutorial(): Promise<void> {
        try {
            const tutorialSteps = [
                {
                    label: '1. Basic Setup',
                    description: 'Configure FlowCode for your environment',
                    detail: 'API keys, workspace settings, and preferences'
                },
                {
                    label: '2. Code Generation',
                    description: 'Learn AI-powered code generation',
                    detail: 'Generate functions, classes, and modules with natural language'
                },
                {
                    label: '3. Code Analysis',
                    description: 'Understand your codebase with AI insights',
                    detail: 'Architecture analysis, quality metrics, and recommendations'
                },
                {
                    label: '4. Security Features',
                    description: 'Keep your code secure',
                    detail: 'Security audits, vulnerability scanning, and best practices'
                },
                {
                    label: '5. Git Integration',
                    description: 'Enhanced git workflows',
                    detail: 'Smart hooks, hotfix management, and automated checks'
                },
                {
                    label: '6. Advanced Features',
                    description: 'Power user features and customization',
                    detail: 'Performance optimization, dependency graphs, and automation'
                }
            ];

            const selectedStep = await this.userExperienceService.showEnhancedQuickPick(tutorialSteps, {
                placeHolder: 'Select a tutorial topic to learn about',
                showDescription: true
            });

            if (selectedStep) {
                await this.showTutorialStep(selectedStep);
            }

        } catch (error) {
            await this.errorHandler.handleError(error as Error, {
                operation: 'showTutorial',
                component: 'UserExperienceCommands'
            });
        }
    }

    /**
     * Show specific tutorial step
     */
    private async showTutorialStep(step: any): Promise<void> {
        // This would show detailed tutorial content for the selected step
        // For now, show a placeholder
        await this.userExperienceService.showNotification({
            type: 'info',
            title: `Tutorial: ${step.label}`,
            message: `${step.description}\n\n${step.detail}\n\nDetailed tutorial content coming soon!`,
            actions: ['Continue Tutorial', 'Back to Menu', 'Close']
        });
    }

    /**
     * Configure user experience settings
     */
    private async configureUserExperience(): Promise<void> {
        try {
            const options = [
                { label: 'Status Bar Indicators', description: 'Configure status bar display options' },
                { label: 'Notifications', description: 'Configure notification preferences' },
                { label: 'Quick Actions', description: 'Customize quick action menu' },
                { label: 'Keyboard Shortcuts', description: 'Configure keyboard shortcuts' },
                { label: 'Contextual Help', description: 'Configure hover help and tooltips' },
                { label: 'Interface Theme', description: 'Customize FlowCode interface elements' }
            ];

            const selection = await this.userExperienceService.showEnhancedQuickPick(options, {
                placeHolder: 'Select user experience setting to configure'
            });

            if (selection && !Array.isArray(selection)) {
                await this.handleUXConfiguration(selection.label);
            }

        } catch (error) {
            await this.errorHandler.handleError(error as Error, {
                operation: 'configureUserExperience',
                component: 'UserExperienceCommands'
            });
        }
    }

    /**
     * Handle UX configuration selection
     */
    private async handleUXConfiguration(setting: string): Promise<void> {
        const config = vscode.workspace.getConfiguration('flowcode.userExperience');

        switch (setting) {
            case 'Status Bar Indicators':
                const enableStatusBar = await vscode.window.showQuickPick([
                    { label: 'Enable', description: 'Show FlowCode status in status bar' },
                    { label: 'Disable', description: 'Hide FlowCode status indicators' }
                ], { placeHolder: 'Status bar indicators' });

                if (enableStatusBar) {
                    await config.update('enableStatusBarIndicators', enableStatusBar.label === 'Enable', vscode.ConfigurationTarget.Global);
                }
                break;

            case 'Notifications':
                const notificationLevel = await vscode.window.showQuickPick([
                    { label: 'All', description: 'Show all notifications' },
                    { label: 'Important Only', description: 'Show only important notifications' },
                    { label: 'Minimal', description: 'Show minimal notifications' },
                    { label: 'None', description: 'Disable notifications' }
                ], { placeHolder: 'Notification level' });

                if (notificationLevel) {
                    const enableNotifications = notificationLevel.label !== 'None';
                    await config.update('enableSmartNotifications', enableNotifications, vscode.ConfigurationTarget.Global);
                }
                break;

            case 'Quick Actions':
                await vscode.commands.executeCommand('workbench.action.openSettings', 'flowcode.userExperience.enableQuickActions');
                break;

            case 'Keyboard Shortcuts':
                await vscode.commands.executeCommand('workbench.action.openGlobalKeybindings', 'flowcode');
                break;

            case 'Contextual Help':
                const enableHelp = await vscode.window.showQuickPick([
                    { label: 'Enable', description: 'Show contextual help and tooltips' },
                    { label: 'Disable', description: 'Disable contextual help' }
                ], { placeHolder: 'Contextual help' });

                if (enableHelp) {
                    await config.update('enableContextualHelp', enableHelp.label === 'Enable', vscode.ConfigurationTarget.Global);
                }
                break;

            case 'Interface Theme':
                await this.customizeInterface();
                break;
        }

        vscode.window.showInformationMessage('User experience settings updated');
    }

    /**
     * Show error reports
     */
    private async showErrorReports(): Promise<void> {
        try {
            const errorReports = this.errorHandler.getAllErrorReports();
            const stats = this.errorHandler.getErrorStatistics();

            if (errorReports.length === 0) {
                await this.userExperienceService.showNotification({
                    type: 'info',
                    title: 'No Error Reports',
                    message: 'FlowCode has not encountered any errors recently. Great job!',
                    actions: ['OK']
                });
                return;
            }

            const reportContent = `# FlowCode Error Reports

## Summary
- **Total Errors**: ${stats.totalErrors}
- **Recoverable**: ${stats.recoverableErrors}
- **Reportable**: ${stats.reportableErrors}

## Errors by Category
${Object.entries(stats.errorsByCategory).map(([category, count]) => `- **${category}**: ${count}`).join('\n')}

## Errors by Severity
${Object.entries(stats.errorsBySeverity).map(([severity, count]) => `- **${severity}**: ${count}`).join('\n')}

## Recent Errors
${errorReports.slice(-10).map(report => `
### ${report.userFriendlyError.title}
- **ID**: ${report.errorId}
- **Time**: ${new Date(report.timestamp).toLocaleString()}
- **Component**: ${report.context.component}
- **Severity**: ${report.userFriendlyError.severity}
- **Message**: ${report.userFriendlyError.message}
`).join('\n')}

## Actions
- Clear error reports: Run "FlowCode: Clear Error Reports"
- Report issues: Use the report buttons in individual error dialogs
- Get help: Visit [FlowCode Support](https://flowcode.dev/support)
`;

            const doc = await vscode.workspace.openTextDocument({
                content: reportContent,
                language: 'markdown'
            });

            await vscode.window.showTextDocument(doc);

        } catch (error) {
            await this.errorHandler.handleError(error as Error, {
                operation: 'showErrorReports',
                component: 'UserExperienceCommands'
            });
        }
    }

    /**
     * Show keyboard shortcuts
     */
    private async showKeyboardShortcuts(): Promise<void> {
        const shortcutsContent = `# FlowCode Keyboard Shortcuts

## Main Actions
| Shortcut | Action | Description |
|----------|--------|-------------|
| \`Ctrl+Alt+F\` (\`Cmd+Alt+F\`) | Quick Actions | Open FlowCode quick actions menu |
| \`Ctrl+Alt+G\` (\`Cmd+Alt+G\`) | Generate Code | AI-powered code generation |
| \`Ctrl+Alt+A\` (\`Cmd+Alt+A\`) | Analyze Code | Code analysis and insights |
| \`Ctrl+Alt+S\` (\`Cmd+Alt+S\`) | Security Audit | Run security vulnerability scan |
| \`Ctrl+Alt+H\` (\`Cmd+Alt+H\`) | Create Hotfix | Create emergency hotfix branch |

## Secondary Actions
| Shortcut | Action | Description |
|----------|--------|-------------|
| \`Ctrl+Alt+D\` (\`Cmd+Alt+D\`) | Dependency Graph | Show code dependency visualization |
| \`Ctrl+Alt+P\` (\`Cmd+Alt+P\`) | Performance Report | Show performance metrics |
| \`Ctrl+Alt+C\` (\`Cmd+Alt+C\`) | Configure FlowCode | Open FlowCode settings |
| \`Ctrl+Alt+?\` (\`Cmd+Alt+?\`) | Help | Show FlowCode help and documentation |

## Git Integration
| Shortcut | Action | Description |
|----------|--------|-------------|
| \`Ctrl+Alt+B\` (\`Cmd+Alt+B\`) | Smart Branch | Create branch with AI suggestions |
| \`Ctrl+Alt+M\` (\`Cmd+Alt+M\`) | Smart Commit | Generate commit message |
| \`Ctrl+Alt+R\` (\`Cmd+Alt+R\`) | Review Changes | AI-powered code review |

## Customization
You can customize these shortcuts in VS Code:
1. Open Command Palette (\`Ctrl+Shift+P\` / \`Cmd+Shift+P\`)
2. Run "Preferences: Open Keyboard Shortcuts"
3. Search for "FlowCode" to see all available commands
4. Click the pencil icon to customize any shortcut

## Tips
- All shortcuts use \`Ctrl+Alt\` on Windows/Linux and \`Cmd+Alt\` on macOS
- You can also access all features through the Command Palette
- Click the FlowCode icon in the status bar for quick access
- Use "FlowCode: Show Quick Actions" when you forget shortcuts
`;

        const doc = await vscode.workspace.openTextDocument({
            content: shortcutsContent,
            language: 'markdown'
        });

        await vscode.window.showTextDocument(doc);
    }

    /**
     * Show feature overview
     */
    private async showFeatureOverview(): Promise<void> {
        // Implementation would show comprehensive feature overview
        await this.userExperienceService.showNotification({
            type: 'info',
            title: 'Feature Overview',
            message: 'Comprehensive feature overview coming soon! For now, try the Quick Actions menu.',
            actions: ['Show Quick Actions', 'OK']
        });
    }

    /**
     * Enable offline mode
     */
    private async enableOfflineMode(): Promise<void> {
        const config = vscode.workspace.getConfiguration('flowcode');
        await config.update('offlineMode', true, vscode.ConfigurationTarget.Global);
        
        await this.userExperienceService.showNotification({
            type: 'info',
            title: 'Offline Mode Enabled',
            message: 'FlowCode is now running in offline mode. AI features will be limited, but core functionality remains available.',
            actions: ['OK']
        });
    }

    /**
     * Show contextual help
     */
    private async showContextualHelp(): Promise<void> {
        // Implementation would show contextual help based on current context
        await this.userExperienceService.showNotification({
            type: 'info',
            title: 'Contextual Help',
            message: 'Hover over FlowCode elements to see contextual help, or check the welcome guide for detailed information.',
            actions: ['Show Welcome Guide', 'OK']
        });
    }

    /**
     * Customize interface
     */
    private async customizeInterface(): Promise<void> {
        const options = [
            { label: 'Status Bar Style', description: 'Customize status bar appearance' },
            { label: 'Notification Style', description: 'Customize notification appearance' },
            { label: 'Quick Action Layout', description: 'Customize quick actions menu' },
            { label: 'Color Theme', description: 'FlowCode color preferences' }
        ];

        const selection = await this.userExperienceService.showEnhancedQuickPick(options, {
            placeHolder: 'Select interface element to customize'
        });

        if (selection) {
            // For now, open the settings page
            await vscode.commands.executeCommand('workbench.action.openSettings', 'flowcode.userExperience');
        }
    }

    /**
     * Get user experience service
     */
    public getUserExperienceService(): UserExperienceService {
        return this.userExperienceService;
    }

    /**
     * Get error handler
     */
    public getErrorHandler(): EnhancedErrorHandler {
        return this.errorHandler;
    }

    /**
     * Dispose resources
     */
    public dispose(): void {
        this.userExperienceService.dispose();
        this.errorHandler.dispose();
        this.contextLogger.info('UserExperienceCommands disposed');
    }
}
