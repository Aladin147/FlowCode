import * as vscode from 'vscode';
import { logger } from '../utils/logger';
import { PerformanceMonitor } from '../utils/performance-monitor';
import { ConfigurationManager } from '../utils/configuration-manager';

export interface UserExperienceConfig {
    enableStatusBarIndicators: boolean;
    enableProgressNotifications: boolean;
    enableSmartNotifications: boolean;
    notificationThrottleMs: number;
    enableContextualHelp: boolean;
    enableQuickActions: boolean;
    enableAdvancedTooltips: boolean;
    statusBarUpdateInterval: number;
}

export interface NotificationOptions {
    type: 'info' | 'warning' | 'error' | 'progress';
    title: string;
    message: string;
    actions?: string[];
    timeout?: number;
    throttleKey?: string;
    showProgress?: boolean;
    cancellable?: boolean;
}

export interface StatusBarInfo {
    text: string;
    tooltip: string;
    command?: string;
    color?: vscode.ThemeColor;
    backgroundColor?: vscode.ThemeColor;
    priority: number;
}

export class UserExperienceService {
    private contextLogger = logger.createContextLogger('UserExperienceService');
    private performanceMonitor = PerformanceMonitor.getInstance();
    private config: UserExperienceConfig;
    
    // Status bar items
    private statusBarItems: Map<string, vscode.StatusBarItem> = new Map();
    private statusBarUpdateTimer: NodeJS.Timeout | null = null;
    
    // Notification management
    private notificationThrottles: Map<string, number> = new Map();
    private activeProgressNotifications: Map<string, vscode.Progress<any>> = new Map();
    
    // Quick actions
    private quickActionProvider: vscode.Disposable | null = null;
    
    // Context help
    private hoverProvider: vscode.Disposable | null = null;

    constructor(private configManager: ConfigurationManager) {
        this.config = this.getDefaultConfig();
        this.contextLogger.info('UserExperienceService initialized');
    }

    /**
     * Initialize user experience service
     */
    public async initialize(): Promise<void> {
        try {
            // Load configuration
            await this.loadConfiguration();

            // Initialize status bar indicators
            if (this.config.enableStatusBarIndicators) {
                await this.initializeStatusBar();
            }

            // Initialize quick actions
            if (this.config.enableQuickActions) {
                await this.initializeQuickActions();
            }

            // Initialize context help
            if (this.config.enableContextualHelp) {
                await this.initializeContextualHelp();
            }

            this.contextLogger.info('User experience service initialized', {
                statusBar: this.config.enableStatusBarIndicators,
                notifications: this.config.enableProgressNotifications,
                quickActions: this.config.enableQuickActions,
                contextHelp: this.config.enableContextualHelp
            });

        } catch (error) {
            this.contextLogger.error('Failed to initialize user experience service', error as Error);
            throw error;
        }
    }

    /**
     * Show smart notification with throttling and context awareness
     */
    public async showNotification(options: NotificationOptions): Promise<string | undefined> {
        try {
            // Check throttling
            if (options.throttleKey && this.isThrottled(options.throttleKey)) {
                this.contextLogger.debug(`Notification throttled: ${options.throttleKey}`);
                return undefined;
            }

            // Set throttle if specified
            if (options.throttleKey) {
                this.notificationThrottles.set(options.throttleKey, Date.now());
            }

            // Show appropriate notification type
            switch (options.type) {
                case 'info':
                    return await this.showInfoNotification(options);
                case 'warning':
                    return await this.showWarningNotification(options);
                case 'error':
                    return await this.showErrorNotification(options);
                case 'progress':
                    return await this.showProgressNotification(options);
                default:
                    return await this.showInfoNotification(options);
            }

        } catch (error) {
            this.contextLogger.error('Failed to show notification', error as Error);
            return undefined;
        }
    }

    /**
     * Update status bar item
     */
    public updateStatusBarItem(id: string, info: StatusBarInfo): void {
        try {
            let statusBarItem = this.statusBarItems.get(id);
            
            if (!statusBarItem) {
                statusBarItem = vscode.window.createStatusBarItem(
                    vscode.StatusBarAlignment.Right,
                    info.priority
                );
                this.statusBarItems.set(id, statusBarItem);
            }

            statusBarItem.text = info.text;
            statusBarItem.tooltip = info.tooltip;
            statusBarItem.command = info.command;
            
            if (info.color) {
                statusBarItem.color = info.color;
            }
            
            if (info.backgroundColor) {
                statusBarItem.backgroundColor = info.backgroundColor;
            }

            statusBarItem.show();

        } catch (error) {
            this.contextLogger.error(`Failed to update status bar item: ${id}`, error as Error);
        }
    }

    /**
     * Remove status bar item
     */
    public removeStatusBarItem(id: string): void {
        const statusBarItem = this.statusBarItems.get(id);
        if (statusBarItem) {
            statusBarItem.dispose();
            this.statusBarItems.delete(id);
        }
    }

    /**
     * Show contextual quick pick with enhanced options
     */
    public async showEnhancedQuickPick<T extends vscode.QuickPickItem>(
        items: T[],
        options: vscode.QuickPickOptions & {
            enableSearch?: boolean;
            enableMultiSelect?: boolean;
            showDescription?: boolean;
            groupBy?: (item: T) => string;
        }
    ): Promise<T | T[] | undefined> {
        try {
            const quickPick = vscode.window.createQuickPick<T>();
            
            // Configure quick pick
            quickPick.items = items;
            quickPick.placeholder = options.placeHolder;
            quickPick.canSelectMany = options.enableMultiSelect || false;
            quickPick.matchOnDescription = options.showDescription || false;
            quickPick.matchOnDetail = true;

            // Group items if groupBy function provided
            if (options.groupBy) {
                const grouped = this.groupQuickPickItems(items, options.groupBy);
                quickPick.items = grouped;
            }

            return new Promise((resolve) => {
                quickPick.onDidChangeSelection(selection => {
                    if (!options.enableMultiSelect && selection.length > 0) {
                        resolve(selection[0]);
                        quickPick.hide();
                    }
                });

                quickPick.onDidAccept(() => {
                    if (options.enableMultiSelect) {
                        resolve(quickPick.selectedItems as T[]);
                    } else {
                        resolve(quickPick.selectedItems[0]);
                    }
                    quickPick.hide();
                });

                quickPick.onDidHide(() => {
                    resolve(undefined);
                    quickPick.dispose();
                });

                quickPick.show();
            });

        } catch (error) {
            this.contextLogger.error('Failed to show enhanced quick pick', error as Error);
            return undefined;
        }
    }

    /**
     * Show contextual input box with validation and suggestions
     */
    public async showEnhancedInputBox(options: vscode.InputBoxOptions & {
        suggestions?: string[];
        validateAsync?: (value: string) => Promise<string | undefined>;
        showProgress?: boolean;
    }): Promise<string | undefined> {
        try {
            const inputBox = vscode.window.createInputBox();
            
            inputBox.placeholder = options.placeHolder;
            inputBox.prompt = options.prompt;
            inputBox.value = options.value || '';
            inputBox.password = options.password || false;

            return new Promise((resolve) => {
                let validationTimeout: NodeJS.Timeout | null = null;

                inputBox.onDidChangeValue(async (value) => {
                    // Clear previous validation timeout
                    if (validationTimeout) {
                        clearTimeout(validationTimeout);
                    }

                    // Debounced validation
                    validationTimeout = setTimeout(async () => {
                        if (options.validateInput) {
                            const error = options.validateInput(value);
                            inputBox.validationMessage = error;
                        } else if (options.validateAsync) {
                            if (options.showProgress) {
                                inputBox.busy = true;
                            }
                            const error = await options.validateAsync(value);
                            inputBox.validationMessage = error;
                            if (options.showProgress) {
                                inputBox.busy = false;
                            }
                        }
                    }, 300);
                });

                inputBox.onDidAccept(() => {
                    if (!inputBox.validationMessage) {
                        resolve(inputBox.value);
                        inputBox.hide();
                    }
                });

                inputBox.onDidHide(() => {
                    if (validationTimeout) {
                        clearTimeout(validationTimeout);
                    }
                    resolve(undefined);
                    inputBox.dispose();
                });

                inputBox.show();
            });

        } catch (error) {
            this.contextLogger.error('Failed to show enhanced input box', error as Error);
            return undefined;
        }
    }

    /**
     * Show progress notification with cancellation support
     */
    private async showProgressNotification(options: NotificationOptions): Promise<string | undefined> {
        if (!this.config.enableProgressNotifications) {
            return undefined;
        }

        return new Promise((resolve) => {
            vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: options.title,
                cancellable: options.cancellable || false
            }, async (progress, token) => {
                this.activeProgressNotifications.set(options.title, progress);

                progress.report({ increment: 0, message: options.message });

                // Handle cancellation
                if (options.cancellable) {
                    token.onCancellationRequested(() => {
                        resolve('cancelled');
                    });
                }

                // Auto-complete after timeout if specified
                if (options.timeout) {
                    setTimeout(() => {
                        progress.report({ increment: 100, message: 'Completed' });
                        resolve('completed');
                    }, options.timeout);
                }

                return new Promise<void>((progressResolve) => {
                    // This will be resolved externally when the operation completes
                    setTimeout(() => progressResolve(), options.timeout || 5000);
                });
            });
        });
    }

    /**
     * Show info notification
     */
    private async showInfoNotification(options: NotificationOptions): Promise<string | undefined> {
        const message = options.message;
        const actions = options.actions || [];

        if (actions.length === 0) {
            vscode.window.showInformationMessage(message);
            return undefined;
        } else {
            return await vscode.window.showInformationMessage(message, ...actions);
        }
    }

    /**
     * Show warning notification
     */
    private async showWarningNotification(options: NotificationOptions): Promise<string | undefined> {
        const message = options.message;
        const actions = options.actions || [];

        if (actions.length === 0) {
            vscode.window.showWarningMessage(message);
            return undefined;
        } else {
            return await vscode.window.showWarningMessage(message, ...actions);
        }
    }

    /**
     * Show error notification
     */
    private async showErrorNotification(options: NotificationOptions): Promise<string | undefined> {
        const message = options.message;
        const actions = options.actions || [];

        if (actions.length === 0) {
            vscode.window.showErrorMessage(message);
            return undefined;
        } else {
            return await vscode.window.showErrorMessage(message, ...actions);
        }
    }

    /**
     * Initialize status bar indicators
     */
    private async initializeStatusBar(): Promise<void> {
        // Create main FlowCode status indicator
        this.updateStatusBarItem('flowcode-main', {
            text: '$(rocket) FlowCode',
            tooltip: 'FlowCode Extension - Click for quick actions',
            command: 'flowcode.showQuickActions',
            priority: 100
        });

        // Start status bar update timer
        if (this.config.statusBarUpdateInterval > 0) {
            this.statusBarUpdateTimer = setInterval(() => {
                this.updateStatusBarIndicators();
            }, this.config.statusBarUpdateInterval);
        }
    }

    /**
     * Update status bar indicators with current information
     */
    private updateStatusBarIndicators(): void {
        try {
            // Update performance indicator
            const memoryUsage = process.memoryUsage();
            const heapUsedMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
            
            let performanceIcon = '🟢';
            let performanceColor: vscode.ThemeColor | undefined;
            
            if (heapUsedMB > 300) {
                performanceIcon = '🔴';
                performanceColor = new vscode.ThemeColor('statusBarItem.errorBackground');
            } else if (heapUsedMB > 200) {
                performanceIcon = '🟡';
                performanceColor = new vscode.ThemeColor('statusBarItem.warningBackground');
            }

            this.updateStatusBarItem('flowcode-performance', {
                text: `${performanceIcon} ${heapUsedMB}MB`,
                tooltip: `FlowCode Memory Usage: ${heapUsedMB}MB\nClick to optimize`,
                command: 'flowcode.optimizeMemory',
                backgroundColor: performanceColor,
                priority: 90
            });

        } catch (error) {
            this.contextLogger.error('Failed to update status bar indicators', error as Error);
        }
    }

    /**
     * Initialize quick actions
     */
    private async initializeQuickActions(): Promise<void> {
        // Register quick action command
        this.quickActionProvider = vscode.commands.registerCommand('flowcode.showQuickActions', async () => {
            const actions = [
                {
                    label: '$(rocket) Generate Code',
                    description: 'Generate code with AI assistance',
                    detail: 'Use FlowCode AI to generate code snippets',
                    command: 'flowcode.generateCode'
                },
                {
                    label: '$(search) Analyze Code',
                    description: 'Analyze current code structure',
                    detail: 'Get insights about your code architecture',
                    command: 'flowcode.analyzeCode'
                },
                {
                    label: '$(git-branch) Create Hotfix',
                    description: 'Create emergency hotfix branch',
                    detail: 'Quickly create and switch to hotfix branch',
                    command: 'flowcode.createHotfix'
                },
                {
                    label: '$(shield) Security Audit',
                    description: 'Run security vulnerability scan',
                    detail: 'Check for security issues in your code',
                    command: 'flowcode.runSecurityAudit'
                },
                {
                    label: '$(graph) Show Dependency Graph',
                    description: 'Visualize code dependencies',
                    detail: 'Interactive dependency visualization',
                    command: 'flowcode.showDependencyGraph'
                },
                {
                    label: '$(settings-gear) Configure FlowCode',
                    description: 'Open FlowCode settings',
                    detail: 'Customize FlowCode behavior',
                    command: 'flowcode.openSettings'
                }
            ];

            const selected = await this.showEnhancedQuickPick(actions, {
                placeHolder: 'Select a FlowCode action',
                showDescription: true
            });

            if (selected && 'command' in selected) {
                await vscode.commands.executeCommand(selected.command);
            }
        });
    }

    /**
     * Initialize contextual help
     */
    private async initializeContextualHelp(): Promise<void> {
        if (!this.config.enableAdvancedTooltips) {
            return;
        }

        // Register hover provider for enhanced tooltips
        this.hoverProvider = vscode.languages.registerHoverProvider(
            ['typescript', 'javascript', 'python'],
            {
                provideHover: (document, position) => {
                    return this.provideContextualHover(document, position);
                }
            }
        );
    }

    /**
     * Provide contextual hover information
     */
    private provideContextualHover(
        document: vscode.TextDocument,
        position: vscode.Position
    ): vscode.ProviderResult<vscode.Hover> {
        try {
            const range = document.getWordRangeAtPosition(position);
            if (!range) {
                return undefined;
            }

            const word = document.getText(range);
            const line = document.lineAt(position.line);

            // Provide contextual help based on word and context
            const hoverContent = this.generateContextualHelp(word, line.text, document.languageId);
            
            if (hoverContent) {
                return new vscode.Hover(hoverContent, range);
            }

            return undefined;

        } catch (error) {
            this.contextLogger.error('Failed to provide contextual hover', error as Error);
            return undefined;
        }
    }

    /**
     * Generate contextual help content
     */
    private generateContextualHelp(word: string, lineText: string, languageId: string): vscode.MarkdownString | undefined {
        // FlowCode-specific help
        const flowCodeHelp = this.getFlowCodeHelp(word);
        if (flowCodeHelp) {
            return flowCodeHelp;
        }

        // Language-specific help
        return this.getLanguageSpecificHelp(word, lineText, languageId);
    }

    /**
     * Get FlowCode-specific help
     */
    private getFlowCodeHelp(word: string): vscode.MarkdownString | undefined {
        const flowCodeTerms: { [key: string]: string } = {
            'CompanionGuard': 'FlowCode AI assistant that provides real-time code suggestions and analysis.',
            'ArchitectService': 'Service for generating architectural code patterns and structures.',
            'FinalGuard': 'Git hook system that validates code before commits and pushes.',
            'HotfixService': 'Emergency hotfix management system for critical bug fixes.',
            'GraphService': 'Code dependency visualization and analysis service.'
        };

        const help = flowCodeTerms[word];
        if (help) {
            const markdown = new vscode.MarkdownString();
            markdown.appendMarkdown(`**FlowCode: ${word}**\n\n${help}`);
            markdown.appendMarkdown('\n\n[Learn more about FlowCode](command:flowcode.openDocumentation)');
            return markdown;
        }

        return undefined;
    }

    /**
     * Get language-specific help
     */
    private getLanguageSpecificHelp(word: string, lineText: string, languageId: string): vscode.MarkdownString | undefined {
        // This would be expanded with comprehensive language-specific help
        // For now, return undefined to use default VS Code hover
        return undefined;
    }

    /**
     * Group quick pick items
     */
    private groupQuickPickItems<T extends vscode.QuickPickItem>(
        items: T[],
        groupBy: (item: T) => string
    ): T[] {
        const groups = new Map<string, T[]>();
        
        for (const item of items) {
            const group = groupBy(item);
            if (!groups.has(group)) {
                groups.set(group, []);
            }
            groups.get(group)!.push(item);
        }

        const result: T[] = [];
        for (const [groupName, groupItems] of groups) {
            // Add group separator
            result.push({
                label: `--- ${groupName} ---`,
                kind: vscode.QuickPickItemKind.Separator
            } as T);
            
            result.push(...groupItems);
        }

        return result;
    }

    /**
     * Check if notification is throttled
     */
    private isThrottled(key: string): boolean {
        const lastShown = this.notificationThrottles.get(key);
        if (!lastShown) {
            return false;
        }

        return (Date.now() - lastShown) < this.config.notificationThrottleMs;
    }

    /**
     * Load configuration
     */
    private async loadConfiguration(): Promise<void> {
        const config = vscode.workspace.getConfiguration('flowcode.userExperience');
        
        this.config = {
            enableStatusBarIndicators: config.get<boolean>('enableStatusBarIndicators', true),
            enableProgressNotifications: config.get<boolean>('enableProgressNotifications', true),
            enableSmartNotifications: config.get<boolean>('enableSmartNotifications', true),
            notificationThrottleMs: config.get<number>('notificationThrottleMs', 5000),
            enableContextualHelp: config.get<boolean>('enableContextualHelp', true),
            enableQuickActions: config.get<boolean>('enableQuickActions', true),
            enableAdvancedTooltips: config.get<boolean>('enableAdvancedTooltips', true),
            statusBarUpdateInterval: config.get<number>('statusBarUpdateInterval', 5000)
        };
    }

    /**
     * Get default configuration
     */
    private getDefaultConfig(): UserExperienceConfig {
        return {
            enableStatusBarIndicators: true,
            enableProgressNotifications: true,
            enableSmartNotifications: true,
            notificationThrottleMs: 5000,
            enableContextualHelp: true,
            enableQuickActions: true,
            enableAdvancedTooltips: true,
            statusBarUpdateInterval: 5000
        };
    }

    /**
     * Dispose resources
     */
    public dispose(): void {
        // Dispose status bar items
        for (const [, item] of this.statusBarItems) {
            item.dispose();
        }
        this.statusBarItems.clear();

        // Clear timers
        if (this.statusBarUpdateTimer) {
            clearInterval(this.statusBarUpdateTimer);
            this.statusBarUpdateTimer = null;
        }

        // Dispose providers
        if (this.quickActionProvider) {
            this.quickActionProvider.dispose();
            this.quickActionProvider = null;
        }

        if (this.hoverProvider) {
            this.hoverProvider.dispose();
            this.hoverProvider = null;
        }

        this.contextLogger.info('UserExperienceService disposed');
    }
}
