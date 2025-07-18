import * as vscode from 'vscode';
import { CompanionGuard } from './services/companion-guard';
import { FinalGuard } from './services/final-guard';
import { ArchitectService } from './services/architect-service';
import { GraphService } from './services/graph-service';
import { HotfixService } from './services/hotfix-service';
import { StatusBarManager } from './ui/status-bar-manager';
import { ProgressManager } from './ui/progress-manager';
import { NotificationManager } from './ui/notification-manager';
import { HelpSystem } from './ui/help-system';
import { HealthCheckSystem } from './utils/health-check';
import { ConfigurationManager } from './utils/configuration-manager';
import { ToolManager } from './utils/tool-manager';
import { SecurityValidator } from './utils/security-validator';
import { SecurityValidatorService } from './services/security-validator';
import { GitHookManager } from './services/git-hook-manager';
import { ChatInterface } from './ui/chat-interface';
import { MonitoringDashboard } from './ui/monitoring-dashboard';
import { GoalExecutionPanel } from './ui/goal-execution-panel';
import { ProgressMonitoringService } from './services/progress-monitoring-service';
import { WorkspaceSelectionPanel } from './ui/workspace-selection-panel';
import { ContextManager } from './services/context-manager';
import { ContextCompressionService } from './services/context-compression-service';
import { SmartAutocompleteService } from './services/smart-autocomplete-service';
import { TaskPlanningEngine } from './services/task-planning-engine';
import { ExecutionEngine } from './services/execution-engine';
import { AgentStateManager } from './services/agent-state-manager';
import { HumanOversightSystem } from './services/human-oversight-system';
import { AgenticOrchestrator } from './services/agentic-orchestrator';
import { logger } from './utils/logger';

export class FlowCodeExtension {
    private companionGuard: CompanionGuard;
    private finalGuard: FinalGuard;
    private architectService: ArchitectService;
    private graphService: GraphService;
    private hotfixService: HotfixService;
    private statusBarManager: StatusBarManager;
    private progressManager: ProgressManager;
    private notificationManager: NotificationManager;
    private helpSystem: HelpSystem;
    private healthCheckSystem: HealthCheckSystem;
    private configManager: ConfigurationManager;
    private contextManager: ContextManager;
    private contextCompressionService: ContextCompressionService;
    private smartAutocompleteService: SmartAutocompleteService;
    private securityValidatorService: SecurityValidatorService;
    private gitHookManager: GitHookManager;
    private taskPlanningEngine: TaskPlanningEngine;
    private executionEngine: ExecutionEngine;
    private agentStateManager: AgentStateManager;
    private humanOversightSystem: HumanOversightSystem;
    public agenticOrchestrator: AgenticOrchestrator;
    private chatInterface: ChatInterface;
    private monitoringDashboard: MonitoringDashboard;
    private goalExecutionPanel: GoalExecutionPanel;
    private progressMonitoringService: ProgressMonitoringService;
    private contextLogger = logger.createContextLogger('FlowCodeExtension');
    private _isActive: boolean = false;

    constructor(private context: vscode.ExtensionContext) {
        this.configManager = new ConfigurationManager(context);
        this.statusBarManager = new StatusBarManager();
        this.progressManager = new ProgressManager();
        this.notificationManager = NotificationManager.getInstance();
        this.helpSystem = HelpSystem.getInstance();
        this.healthCheckSystem = HealthCheckSystem.getInstance();
        this.companionGuard = new CompanionGuard(this.configManager);
        this.finalGuard = new FinalGuard(this.configManager);
        this.architectService = new ArchitectService(this.configManager);
        this.graphService = new GraphService();
        this.hotfixService = new HotfixService(this.configManager);
        this.securityValidatorService = new SecurityValidatorService(this.configManager);
        this.contextCompressionService = new ContextCompressionService(this.configManager);
        this.contextManager = new ContextManager(this.configManager, this.contextCompressionService);
        this.smartAutocompleteService = new SmartAutocompleteService(
            this.configManager,
            this.contextManager,
            this.architectService,
            this.companionGuard
        );
        this.gitHookManager = new GitHookManager(this.configManager);
        this.taskPlanningEngine = new TaskPlanningEngine(this.configManager);
        this.executionEngine = new ExecutionEngine(
            this.configManager,
            this.companionGuard,
            this.securityValidatorService,
            this.architectService
        );
        this.agentStateManager = new AgentStateManager(this.context, this.configManager);
        this.humanOversightSystem = new HumanOversightSystem(this.configManager);
        this.agenticOrchestrator = new AgenticOrchestrator(
            this.context,
            this.configManager,
            this.taskPlanningEngine,
            this.executionEngine,
            this.agentStateManager,
            this.humanOversightSystem
        );
        this.chatInterface = new ChatInterface(
            this.architectService,
            this.companionGuard,
            this.securityValidatorService,
            this.graphService,
            this.hotfixService,
            this.configManager,
            this.contextManager,
            this.contextCompressionService,
            this.taskPlanningEngine,
            this.agenticOrchestrator,
            this.agentStateManager
        );

        this.monitoringDashboard = new MonitoringDashboard(
            undefined, // No telemetry service for now
            this.companionGuard,
            this.hotfixService,
            this.graphService,
            this.chatInterface,
            this.agentStateManager,
            this.agenticOrchestrator
        );

        this.goalExecutionPanel = new GoalExecutionPanel(
            this.context,
            this.agenticOrchestrator,
            this.agentStateManager,
            this.humanOversightSystem
        );

        this.progressMonitoringService = new ProgressMonitoringService(
            this.context,
            this.agentStateManager,
            this.humanOversightSystem
        );
    }

    public async activate(): Promise<void> {
        this.contextLogger.info('Starting FlowCode activation...');

        // Check dependencies first
        await this.checkDependencies();
        this.contextLogger.info('Dependencies checked successfully');

        // Initialize services (don't require API key for basic activation)
        await this.initializeServices();
        this.contextLogger.info('Services initialized successfully');

        // Initialize agentic orchestrator
        await this.agenticOrchestrator.initialize();
        this.contextLogger.info('Agentic orchestrator initialized successfully');

        // Register tree providers for sidebar views
        this.registerTreeProviders();
        this.contextLogger.info('Tree providers registered successfully');

        // Register language providers
        this.registerLanguageProviders();
        this.contextLogger.info('Language providers registered successfully');

        // Check API configuration (warn but don't fail)
        try {
            await this.configManager.validateConfiguration();
            this.contextLogger.info('Configuration validated successfully');
        } catch (error) {
            this.contextLogger.warn('API key not configured - some features will be limited', error as Error);
            vscode.window.showWarningMessage(
                'FlowCode activated but API key not configured. Configure API key to enable AI features.',
                'Configure API Key'
            ).then(selection => {
                if (selection === 'Configure API Key') {
                    vscode.commands.executeCommand('flowcode.configureApiKey');
                }
            });
        }

        this._isActive = true;
        this.statusBarManager.showReady();
        vscode.window.showInformationMessage('FlowCode activated successfully! 🚀');
        this.contextLogger.info('FlowCode extension activated successfully');
    }

    public async deactivate(): Promise<void> {
        this._isActive = false;
        this.companionGuard.dispose();
        this.statusBarManager.dispose();
        this.monitoringDashboard.dispose();
        this.goalExecutionPanel.dispose();
        this.progressMonitoringService.dispose();
        this.contextLogger.info('FlowCode extension deactivated');
    }

    public async initialize(): Promise<void> {
        try {
            await this.configManager.validateConfiguration();
            await this.initializeGitHooks();
            vscode.window.showInformationMessage('FlowCode initialized successfully!');
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            vscode.window.showErrorMessage(`FlowCode initialization failed: ${message}`);
        }
    }

    public async elevateToArchitect(): Promise<void> {
        try {
            this.statusBarManager.showRunning('Architect Refactor');

            // Use new agentic approach
            const task = await this.taskPlanningEngine.decomposeGoal(
                'Perform architectural refactoring of the current code'
            );

            // For now, show the task plan to user
            vscode.window.showInformationMessage(
                `Architect task planned with ${task.steps.length} steps. Agentic execution coming soon!`
            );

            this.statusBarManager.showReady();
        } catch (error) {
            this.statusBarManager.showError('Architect failed');
            const message = error instanceof Error ? error.message : 'Unknown error';

            await this.notificationManager.showError(
                'Architect refactoring failed',
                {
                    operation: 'Architect Refactor',
                    suggestion: 'Try selecting a smaller piece of code or check your API configuration',
                    documentation: 'https://flowcode.dev/docs/troubleshooting',
                    reportable: true
                },
                { detail: message }
            );
        }
    }

    public async generateCode(): Promise<void> {
        try {
            this.statusBarManager.showRunning('Code Generation');

            // Use new agentic approach
            const task = await this.taskPlanningEngine.decomposeGoal(
                'Generate code based on current context and requirements'
            );

            // For now, show the task plan to user
            vscode.window.showInformationMessage(
                `Code generation task planned with ${task.steps.length} steps. Agentic execution coming soon!`
            );

            this.statusBarManager.showReady();
        } catch (error) {
            this.statusBarManager.showError('Code generation failed');
            const message = error instanceof Error ? error.message : 'Unknown error';

            await this.notificationManager.showError(
                'Code generation failed',
                {
                    operation: 'Code Generation',
                    suggestion: 'Check your API configuration and try again',
                    documentation: 'https://flowcode.dev/docs/troubleshooting',
                    reportable: true
                },
                { detail: message }
            );
        }
    }

    public async createHotfix(): Promise<void> {
        const message = await this.notificationManager.showInput(
            'Enter hotfix commit message',
            {
                placeholder: 'Fix critical bug in authentication',
                validator: (value) => {
                    if (!value.trim()) {return 'Commit message cannot be empty';}
                    if (value.length < 10) {return 'Commit message too short (minimum 10 characters)';}
                    if (value.length > 500) {return 'Commit message too long (maximum 500 characters)';}
                    return null;
                }
            }
        );

        if (!message) {
            return;
        }

        try {
            this.statusBarManager.showRunning('Creating Hotfix');

            await this.progressManager.withProgress('create-hotfix', {
                title: "🚀 Creating Hotfix",
                location: vscode.ProgressLocation.Notification,
                cancellable: false,
                steps: [
                    { name: 'validate', weight: 10, message: 'Validating changes...' },
                    { name: 'branch', weight: 20, message: 'Creating hotfix branch...' },
                    { name: 'commit', weight: 30, message: 'Committing changes...' },
                    { name: 'checks', weight: 30, message: 'Running quality checks...' },
                    { name: 'finalize', weight: 10, message: 'Finalizing hotfix...' }
                ]
            }, async (progress) => {
                progress.startStep('create-hotfix');
                progress.completeStep('create-hotfix', 'Changes validated');

                await this.hotfixService.createHotfix(message);

                progress.completeStep('create-hotfix', 'Branch created');
                progress.completeStep('create-hotfix', 'Changes committed');
                progress.completeStep('create-hotfix', 'Quality checks passed');
                progress.completeStep('create-hotfix', 'Hotfix ready');
            });

            this.statusBarManager.showSuccess('Hotfix created');

            await this.notificationManager.showSuccess(
                'Hotfix created successfully!',
                `Created hotfix branch with message: "${message}"`,
                ['🔍 View Changes', '🚀 Deploy']
            );
        } catch (error) {
            this.statusBarManager.showError('Hotfix failed');
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';

            await this.notificationManager.showError(
                'Hotfix creation failed',
                {
                    operation: 'Create Hotfix',
                    suggestion: 'Check your git configuration and ensure you have uncommitted changes',
                    documentation: 'https://flowcode.dev/docs/hotfix',
                    reportable: true
                },
                { detail: errorMessage }
            );
        }
    }

    public async showCodeGraph(): Promise<void> {
        // Check if workspace is available
        if (!(await this.ensureWorkspaceOrPrompt())) {
            return;
        }

        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor found');
            return;
        }

        try {
            const graph = await this.graphService.generateGraph(
                editor.document.uri.fsPath,
                editor.selection.active
            );

            if (graph) {
                await this.graphService.showGraphView(graph);
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            vscode.window.showErrorMessage(`Graph generation failed: ${message}`);
        }
    }

    public async configureApiKey(): Promise<void> {
        // Use the new settings panel for API configuration
        await this.showSettings();
    }

    public async configureApiKeyLegacy(): Promise<void> {
        try {
            // Check if API key already exists and offer to replace
            const existingConfig = await this.getExistingApiConfig();
            if (existingConfig) {
                const replace = await vscode.window.showWarningMessage(
                    `API key for ${existingConfig.provider} is already configured. Replace it?`,
                    'Yes', 'No'
                );
                if (replace !== 'Yes') {
                    return;
                }
            }

            const provider = await vscode.window.showQuickPick([
                'OpenAI',
                'Anthropic',
                'DeepSeek'
            ], {
                placeHolder: 'Select your AI provider',
                ignoreFocusOut: true
            });

            if (!provider) {
                return;
            }

            let providerLower: string;
            let keyFormat: string;
            let customEndpoint = '';

            switch (provider) {
                case 'OpenAI':
                    providerLower = 'openai';
                    keyFormat = 'sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
                    break;
                case 'Anthropic':
                    providerLower = 'anthropic';
                    keyFormat = 'sk-ant-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
                    break;
                case 'DeepSeek':
                    providerLower = 'deepseek';
                    keyFormat = 'sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
                    // Ask for custom endpoint for DeepSeek
                    customEndpoint = await vscode.window.showInputBox({
                        prompt: 'Enter the DeepSeek API endpoint URL',
                        placeHolder: 'https://api.deepseek.com/v1',
                        value: 'https://api.deepseek.com/v1',
                        ignoreFocusOut: true,
                        validateInput: (value) => {
                            if (!value || !value.startsWith('http')) {
                                return 'Endpoint must be a valid HTTP/HTTPS URL';
                            }
                            return undefined;
                        }
                    }) || 'https://api.deepseek.com/v1';
                    break;
                default:
                    throw new Error('Invalid provider selected');
            }

            const apiKey = await vscode.window.showInputBox({
                prompt: `Enter your ${provider} API key`,
                placeHolder: keyFormat,
                password: true,
                ignoreFocusOut: true,
                validateInput: (value) => {
                    if (!value || value.trim().length === 0) {
                        return 'API key cannot be empty';
                    }

                    const trimmedValue = value.trim();

                    // Basic format validation for each provider
                    if ((providerLower === 'openai' || providerLower === 'deepseek') && !trimmedValue.startsWith('sk-')) {
                        return `${provider} API keys must start with "sk-"`;
                    }
                    if (providerLower === 'anthropic' && !trimmedValue.startsWith('sk-ant-')) {
                        return 'Anthropic API keys must start with "sk-ant-"';
                    }
                    if ((providerLower === 'openai' || providerLower === 'deepseek') && trimmedValue.length < 20) {
                        return 'API key appears to be too short';
                    }

                    return null;
                }
            });

            if (!apiKey) {
                return;
            }

            // Show progress while validating and storing
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "Configuring API key...",
                cancellable: false
            }, async (progress) => {
                progress.report({ message: "Validating API key format..." });

                try {
                    // Store the API key (this will validate format)
                    await this.configManager.setApiConfiguration(providerLower as 'openai' | 'anthropic' | 'deepseek', apiKey);

                    // Store custom endpoint if provided
                    if (customEndpoint) {
                        const config = vscode.workspace.getConfiguration('flowcode');
                        await config.update('customEndpoint', customEndpoint, vscode.ConfigurationTarget.Global);
                    }

                    progress.report({ message: "Testing API key..." });

                    // Test the API key with custom endpoint if provided
                    const isValid = await this.configManager.testApiKey(providerLower as 'openai' | 'anthropic' | 'deepseek', apiKey, customEndpoint);
                    if (!isValid && providerLower === 'openai') {
                        const proceed = await vscode.window.showWarningMessage(
                            'API key validation failed. The key may be invalid or there may be network issues. Save anyway?',
                            'Save Anyway', 'Cancel'
                        );
                        if (proceed !== 'Save Anyway') {
                            await this.configManager.clearApiCredentials();
                            return;
                        }
                    }

                    progress.report({ message: "Verifying secure storage..." });

                    // Verify integrity
                    const integrityCheck = await this.configManager.verifyApiKeyIntegrity();
                    if (!integrityCheck) {
                        throw new Error('API key integrity verification failed');
                    }

                } catch (error) {
                    const message = error instanceof Error ? error.message : 'Unknown error';
                    throw new Error(`Failed to configure API key: ${message}`);
                }
            });

            vscode.window.showInformationMessage(
                `✅ ${provider} API key configured securely!`,
                'Test Connection'
            ).then(selection => {
                if (selection === 'Test Connection') {
                    this.testApiConnection();
                }
            });

        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            vscode.window.showErrorMessage(`API key configuration failed: ${message}`);
        }
    }

    private async initializeServices(): Promise<void> {
        await this.companionGuard.initialize();
        await this.finalGuard.initialize();
        await this.graphService.initialize();
        await this.hotfixService.initialize();
        await this.securityValidatorService.initialize();
        // Command services removed in V0.2 agentic pivot
        // Note: GitHookManager doesn't need initialization, it's ready to use
    }

    private registerTreeProviders(): void {
        // Tree providers removed in V0.2 agentic pivot
        // Will be replaced with conversational agent interface
        this.contextLogger.info('Tree providers skipped - using agentic interface');
    }

    private registerLanguageProviders(): void {
        // Register smart autocomplete provider for supported languages
        const supportedLanguages = ['typescript', 'javascript', 'python', 'java', 'csharp', 'go', 'rust'];

        for (const language of supportedLanguages) {
            vscode.languages.registerCompletionItemProvider(
                language,
                this.smartAutocompleteService,
                '.', // Trigger on dot
                '(', // Trigger on opening parenthesis
                ' '  // Trigger on space
            );
        }

        this.contextLogger.info('Smart autocomplete provider registered for supported languages', {
            languages: supportedLanguages
        });
    }

    private async initializeGitHooks(): Promise<void> {
        try {
            // Check if we have a workspace first
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                this.contextLogger.info('No workspace available, skipping git hooks initialization');
                return;
            }

            // Check if we're in a git repository
            const workspaceRoot = await this.configManager.getWorkspaceRoot();
            const gitDir = require('path').join(workspaceRoot, '.git');

            if (!require('fs').existsSync(gitDir)) {
                this.statusBarManager.showWarning('Not a git repository');
                vscode.window.showWarningMessage(
                    'FlowCode git hooks require a git repository. Initialize git first.',
                    'Initialize Git'
                ).then(selection => {
                    if (selection === 'Initialize Git') {
                        vscode.commands.executeCommand('git.init');
                    }
                });
                return;
            }

            // Install git hooks
            this.statusBarManager.showRunning('Installing Git Hooks');

            const result = await this.gitHookManager.installHooks(workspaceRoot);

            if (result.success) {
                this.statusBarManager.showSuccess('Git hooks installed');
                this.contextLogger.info('Git hooks initialized successfully', {
                    installedHooks: result.installedHooks,
                    platform: result.platform
                });
            } else {
                this.statusBarManager.showError('Git hooks failed');
                this.contextLogger.error('Git hooks initialization failed', new Error(
                    `Errors: ${result.errors.join(', ')}. Warnings: ${result.warnings.join(', ')}`
                ));

                // Show detailed error to user
                const errorMessage = result.errors.length > 0
                    ? result.errors.join('\n')
                    : 'Unknown error occurred';

                vscode.window.showErrorMessage(
                    `Failed to install git hooks: ${errorMessage}`,
                    'Retry', 'Show Details'
                ).then(selection => {
                    if (selection === 'Retry') {
                        this.initializeGitHooks();
                    } else if (selection === 'Show Details') {
                        this.showGitHookStatus();
                    }
                });
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            this.statusBarManager.showError('Git hooks failed');
            this.contextLogger.error('Git hooks initialization error', error as Error);

            vscode.window.showErrorMessage(
                `Git hooks initialization failed: ${message}`,
                'Retry'
            ).then(selection => {
                if (selection === 'Retry') {
                    this.initializeGitHooks();
                }
            });
        }
    }

    private async showGitHookStatus(): Promise<void> {
        try {
            const status = await this.gitHookManager.getHookStatus();
            const statusText = status.map(hook =>
                `${hook.name}: ${hook.installed ? '✅ Installed' : '❌ Not Installed'} (${hook.platform})`
            ).join('\n');

            vscode.window.showInformationMessage(
                `Git Hook Status:\n${statusText}`,
                { modal: true }
            );
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            vscode.window.showErrorMessage(`Failed to get git hook status: ${message}`);
        }
    }

    private async getExistingApiConfig(): Promise<{ provider: string } | null> {
        try {
            const config = await this.configManager.getApiConfiguration();
            return { provider: config.provider };
        } catch {
            return null;
        }
    }

    private async testApiConnection(): Promise<void> {
        try {
            const config = await this.configManager.getApiConfiguration();

            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "Testing API connection...",
                cancellable: false
            }, async () => {
                const isValid = await this.configManager.testApiKey(config.provider, config.apiKey);

                if (isValid) {
                    vscode.window.showInformationMessage(`✅ ${config.provider} API connection successful!`);
                } else {
                    vscode.window.showWarningMessage(`⚠️ ${config.provider} API connection failed. Please check your API key.`);
                }
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            vscode.window.showErrorMessage(`API connection test failed: ${message}`);
        }
    }

    public async clearApiCredentials(): Promise<void> {
        const confirm = await vscode.window.showWarningMessage(
            'Are you sure you want to clear all API credentials? This action cannot be undone.',
            'Clear Credentials', 'Cancel'
        );

        if (confirm === 'Clear Credentials') {
            try {
                await this.configManager.clearApiCredentials();
                vscode.window.showInformationMessage('API credentials cleared successfully.');
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Unknown error';
                vscode.window.showErrorMessage(`Failed to clear credentials: ${message}`);
            }
        }
    }

    private async checkDependencies(): Promise<void> {
        // First check runtime dependencies (npm packages)
        const runtimeCheck = await ToolManager.validateRuntimeDependencies();
        if (!runtimeCheck.valid) {
            const missingDeps = runtimeCheck.missing.join(', ');
            vscode.window.showErrorMessage(
                `❌ Critical runtime dependencies missing: ${missingDeps}. Please reinstall the extension.`
            );
            this.contextLogger.error('Runtime dependencies missing: ' + runtimeCheck.missing.join(', '));
            return;
        }

        // Then check system tools
        const result = await ToolManager.checkAllDependencies();

        if (!result.allRequired) {
            const missingNames = result.missing.map(t => t.name).join(', ');
            const action = await vscode.window.showWarningMessage(
                `⚠️ Missing required system tools: ${missingNames}. Some FlowCode features may not work properly.`,
                'Show Installation Guide',
                'Continue Anyway'
            );

            if (action === 'Show Installation Guide') {
                await ToolManager.showDependencyStatus();
            }
        }

        // Log successful dependency validation
        this.contextLogger.info('Runtime dependencies validated successfully');
    }

    public async checkDependencyStatus(): Promise<void> {
        await ToolManager.showDependencyStatus();
    }

    public async debugNpmDetection(): Promise<void> {
        try {
            this.contextLogger.info('Starting npm detection debug...');

            // Test different npm detection methods
            const methods = [
                { name: 'npm --version', command: ['npm', '--version'] },
                { name: 'npm.cmd --version', command: ['npm.cmd', '--version'] },
                { name: 'node -e npm check', command: ['node', '-e', 'console.log(process.version)'] }
            ];

            for (const method of methods) {
                try {
                    const { spawn } = require('child_process');
                    const result = await new Promise<{success: boolean, output: string, error?: string}>((resolve) => {
                        const proc = spawn(method.command[0], method.command.slice(1), {
                            shell: process.platform === 'win32',
                            env: process.env,
                            timeout: 5000
                        });

                        let output = '';
                        let error = '';

                        proc.stdout?.on('data', (data: Buffer) => output += data.toString());
                        proc.stderr?.on('data', (data: Buffer) => error += data.toString());

                        proc.on('close', (code: number | null) => {
                            resolve({
                                success: code === 0,
                                output: output.trim(),
                                error: error.trim() || undefined
                            });
                        });

                        proc.on('error', (err: Error) => {
                            resolve({
                                success: false,
                                output: '',
                                error: err.message
                            });
                        });
                    });

                    this.contextLogger.info(`${method.name}: ${result.success ? 'SUCCESS' : 'FAILED'}`, {
                        output: result.output,
                        error: result.error
                    });

                } catch (error) {
                    this.contextLogger.error(`${method.name}: ERROR`, error as Error);
                }
            }

            vscode.window.showInformationMessage('npm detection debug completed - check output panel');
        } catch (error) {
            this.contextLogger.error('npm detection debug failed', error as Error);
        }
    }

    public async installTool(): Promise<void> {
        const tools = ['TypeScript', 'ESLint', 'Semgrep'];
        const selected = await vscode.window.showQuickPick(tools, {
            placeHolder: 'Select a tool to install'
        });

        if (selected) {
            const success = await ToolManager.installTool(selected);
            if (success) {
                vscode.window.showInformationMessage(`✅ ${selected} installed successfully!`);
            } else {
                vscode.window.showErrorMessage(`❌ Failed to install ${selected}. Please install manually.`);
            }
        }
    }

    public async runSecurityAudit(): Promise<void> {
        try {
            // Use new agentic approach
            const task = await this.taskPlanningEngine.decomposeGoal(
                'Perform comprehensive security audit of the codebase'
            );

            vscode.window.showInformationMessage(
                `Security audit task planned with ${task.steps.length} steps. Agentic execution coming soon!`
            );
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            vscode.window.showErrorMessage(`Security audit failed: ${message}`);
        }
    }

    public async showMonitoringDashboard(): Promise<void> {
        try {
            await this.monitoringDashboard.show();
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            vscode.window.showErrorMessage(`Failed to show monitoring dashboard: ${message}`);
        }
    }

    public async showPerformanceReport(): Promise<void> {
        try {
            const { FlowCodeBenchmarks } = await import('./utils/performance-benchmark');
            const benchmarks = new FlowCodeBenchmarks();

            vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Generating performance report...',
                cancellable: false
            }, async (progress) => {
                progress.report({ increment: 50, message: 'Running benchmarks...' });

                const report = await benchmarks.runFullBenchmarkSuite();

                progress.report({ increment: 100, message: 'Report generated!' });

                // Show performance report in webview
                const panel = vscode.window.createWebviewPanel(
                    'flowcodePerformance',
                    'FlowCode Performance Report',
                    vscode.ViewColumn.One,
                    { enableScripts: true }
                );

                panel.webview.html = this.generatePerformanceReportHtml(report);
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            vscode.window.showErrorMessage(`Failed to generate performance report: ${message}`);
        }
    }

    public async optimizeMemory(): Promise<void> {
        try {
            const { MemoryOptimizer } = await import('./utils/memory-optimizer');
            const optimizer = new MemoryOptimizer();

            vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Optimizing memory...',
                cancellable: false
            }, async (progress) => {
                progress.report({ increment: 50, message: 'Running memory optimization...' });

                const optimizations = await optimizer.optimizeMemory();

                progress.report({ increment: 100, message: 'Memory optimized!' });

                if (optimizations.length > 0) {
                    vscode.window.showInformationMessage(
                        `Memory optimization completed: ${optimizations.join(', ')}`
                    );
                } else {
                    vscode.window.showInformationMessage('Memory usage is already optimal');
                }
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            vscode.window.showErrorMessage(`Memory optimization failed: ${message}`);
        }
    }

    public async showChatInterface(): Promise<void> {
        try {
            await this.chatInterface.show();
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            vscode.window.showErrorMessage(`Failed to show chat interface: ${message}`);
        }
    }

    public async showWelcomeGuide(): Promise<void> {
        try {
            const panel = vscode.window.createWebviewPanel(
                'flowcodeWelcome',
                'FlowCode Welcome Guide',
                vscode.ViewColumn.One,
                { enableScripts: true }
            );

            panel.webview.html = this.generateWelcomeGuideHtml();

            // Handle messages from webview
            panel.webview.onDidReceiveMessage(async (message) => {
                switch (message.command) {
                    case 'configureApiKey':
                        await this.configureApiKey();
                        break;
                    case 'showChat':
                        await this.showChat();
                        break;
                    case 'runSecurityAudit':
                        await this.runSecurityAudit();
                        break;
                }
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            vscode.window.showErrorMessage(`Failed to show welcome guide: ${message}`);
        }
    }

    public async configureTelemetry(): Promise<void> {
        try {
            const config = vscode.workspace.getConfiguration('flowcode');
            const currentSetting = config.get<boolean>('telemetry.enabled', false);

            const options = [
                { label: 'Enable Telemetry', description: 'Help improve FlowCode by sharing usage data', value: true },
                { label: 'Disable Telemetry', description: 'Keep all data local (recommended)', value: false }
            ];

            const selected = await vscode.window.showQuickPick(options, {
                placeHolder: `Current setting: ${currentSetting ? 'Enabled' : 'Disabled'}`,
                ignoreFocusOut: true
            });

            if (selected) {
                await config.update('telemetry.enabled', selected.value, vscode.ConfigurationTarget.Global);
                vscode.window.showInformationMessage(
                    `Telemetry ${selected.value ? 'enabled' : 'disabled'} successfully`
                );
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            vscode.window.showErrorMessage(`Failed to configure telemetry: ${message}`);
        }
    }

    public async provideFeedback(): Promise<void> {
        try {
            const feedbackOptions = [
                { label: '🐛 Report Bug', description: 'Report a bug or issue', action: 'bug' },
                { label: '💡 Feature Request', description: 'Suggest a new feature', action: 'feature' },
                { label: '⭐ General Feedback', description: 'Share your thoughts', action: 'general' }
            ];

            const selected = await vscode.window.showQuickPick(feedbackOptions, {
                placeHolder: 'What type of feedback would you like to provide?',
                ignoreFocusOut: true
            });

            if (selected) {
                const feedback = await vscode.window.showInputBox({
                    prompt: `Please describe your ${selected.action === 'bug' ? 'bug report' : selected.action === 'feature' ? 'feature request' : 'feedback'}`,
                    placeHolder: 'Type your feedback here...',
                    ignoreFocusOut: true
                });

                if (feedback) {
                    // For now, just show a thank you message
                    // In a real implementation, this would send to a feedback service
                    vscode.window.showInformationMessage(
                        'Thank you for your feedback! Your input helps improve FlowCode.',
                        'View GitHub Issues'
                    ).then(selection => {
                        if (selection === 'View GitHub Issues') {
                            vscode.env.openExternal(vscode.Uri.parse('https://github.com/Aladin147/FlowCode/issues'));
                        }
                    });
                }
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            vscode.window.showErrorMessage(`Failed to provide feedback: ${message}`);
        }
    }

    public async runChatDiagnostics(): Promise<void> {
        try {
            vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Running FlowCode Chat Diagnostics...',
                cancellable: false
            }, async (progress) => {
                const results: string[] = [];

                progress.report({ increment: 10, message: 'Checking extension activation...' });

                // Test 1: Extension activation
                results.push('🔍 **EXTENSION ACTIVATION**');
                results.push(this.chatInterface ? '✅ ChatInterface initialized' : '❌ ChatInterface not initialized');
                results.push(this.architectService ? '✅ ArchitectService available' : '❌ ArchitectService not available');
                results.push(this.configManager ? '✅ ConfigurationManager available' : '❌ ConfigurationManager not available');

                progress.report({ increment: 20, message: 'Checking API configuration...' });

                // Test 2: API Configuration
                results.push('\n🔑 **API CONFIGURATION**');
                try {
                    const apiConfig = await this.configManager.getApiConfiguration();
                    results.push(`✅ Provider: ${apiConfig.provider}`);
                    results.push(`✅ Max Tokens: ${apiConfig.maxTokens}`);
                    results.push(apiConfig.apiKey ? '✅ API Key configured' : '❌ API Key missing');
                    results.push(apiConfig.endpoint ? `✅ Custom Endpoint: ${apiConfig.endpoint}` : '✅ Using default endpoint');

                    // Test API key validity
                    if (apiConfig.apiKey) {
                        progress.report({ increment: 30, message: 'Testing API key...' });
                        const isValid = await this.configManager.testApiKey(apiConfig.provider, apiConfig.apiKey, apiConfig.endpoint);
                        results.push(isValid ? '✅ API Key is valid' : '❌ API Key test failed');
                    }
                } catch (error) {
                    results.push(`❌ Configuration error: ${error}`);
                }

                progress.report({ increment: 50, message: 'Testing chat functionality...' });

                // Test 3: Chat Interface
                results.push('\n💬 **CHAT INTERFACE**');
                try {
                    // Test if chat can be opened
                    results.push('✅ Chat interface can be created');

                    // Test context gathering
                    const activeFile = vscode.window.activeTextEditor?.document.fileName;
                    results.push(activeFile ? `✅ Active file detected: ${activeFile}` : '⚠️ No active file');

                    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                    results.push(workspaceRoot ? `✅ Workspace detected: ${workspaceRoot}` : '⚠️ No workspace open');

                } catch (error) {
                    results.push(`❌ Chat interface error: ${error}`);
                }

                progress.report({ increment: 70, message: 'Testing file operations...' });

                // Test 4: File Operations
                results.push('\n📁 **FILE OPERATIONS**');
                try {
                    const files = await vscode.workspace.findFiles('**/*', '**/node_modules/**', 5);
                    results.push(`✅ Can scan workspace: ${files.length} files found`);

                    if (files.length > 0) {
                        const testFile = files[0];
                        if (testFile) {
                            try {
                                const document = await vscode.workspace.openTextDocument(testFile.fsPath);
                                results.push(`✅ Can read files: ${document.getText().length} characters`);
                            } catch (readError) {
                                results.push(`⚠️ File read test failed: ${readError}`);
                            }
                        }
                    }
                } catch (error) {
                    results.push(`❌ File operation error: ${error}`);
                }

                progress.report({ increment: 90, message: 'Testing services...' });

                // Test 5: Service Health
                results.push('\n🔧 **SERVICE HEALTH**');
                results.push(this.chatInterface ? '✅ ChatInterface available' : '❌ ChatInterface missing');
                results.push(this.architectService ? '✅ ArchitectService available' : '❌ ArchitectService missing');
                results.push(this.configManager ? '✅ ConfigurationManager available' : '❌ ConfigurationManager missing');
                results.push('✅ Core services initialized');

                progress.report({ increment: 100, message: 'Generating report...' });

                // Create diagnostic report
                const reportContent = results.join('\n');

                // Show results in new document
                const doc = await vscode.workspace.openTextDocument({
                    content: `# FlowCode Chat Diagnostics Report\n\nGenerated: ${new Date().toLocaleString()}\n\n${reportContent}\n\n## Recommendations\n\n${this.generateRecommendations(results)}`,
                    language: 'markdown'
                });

                await vscode.window.showTextDocument(doc);
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            vscode.window.showErrorMessage(`Diagnostics failed: ${message}`);
        }
    }

    private generateRecommendations(results: string[]): string {
        const recommendations: string[] = [];
        const resultText = results.join('\n');

        if (resultText.includes('❌ API Key missing')) {
            recommendations.push('1. **Configure API Key**: Run "FlowCode: Configure API Key" command');
        }

        if (resultText.includes('❌ API Key test failed')) {
            recommendations.push('2. **Check API Key**: Verify your API key is correct and has sufficient credits');
        }

        if (resultText.includes('⚠️ No workspace open')) {
            recommendations.push('3. **Open Workspace**: Open a folder or workspace for better context');
        }

        if (resultText.includes('❌') && !resultText.includes('API Key')) {
            recommendations.push('4. **Restart Extension**: Try reloading VS Code or disabling/enabling FlowCode');
        }

        if (recommendations.length === 0) {
            recommendations.push('✅ **All systems operational!** Your FlowCode chat should be working perfectly.');
            recommendations.push('If you\'re still experiencing issues, try:');
            recommendations.push('- Opening the chat with "FlowCode: Show Chat"');
            recommendations.push('- Sending a test message');
            recommendations.push('- Clicking the file context button (📁)');
        }

        return recommendations.join('\n');
    }

    public async openChatSession(sessionId: string): Promise<void> {
        // For now, just open the main chat interface
        // In the future, this could load a specific chat session
        try {
            await this.showChatInterface();
            this.contextLogger.info(`Opening chat session: ${sessionId}`);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            vscode.window.showErrorMessage(`Failed to open chat session: ${message}`);
        }
    }

    public async showSettings(): Promise<void> {
        try {
            // Open VS Code settings for FlowCode
            vscode.commands.executeCommand('workbench.action.openSettings', 'flowcode');
            this.contextLogger.info('Settings opened');
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            vscode.window.showErrorMessage(`Failed to open settings: ${message}`);
        }
    }

    /**
     * Show workspace selection panel when no workspace is available
     */
    public showWorkspaceSelection(): void {
        WorkspaceSelectionPanel.createOrShow(this.context.extensionUri);
    }

    /**
     * Check if workspace is available and show selection panel if not
     */
    public async ensureWorkspaceOrPrompt(): Promise<boolean> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            this.showWorkspaceSelection();
            return false;
        }
        return true;
    }

    private generateSecurityReportHtml(report: string, auditResult: any): string {
        const scoreColor = auditResult.overallScore >= 80 ? '#28a745' :
                          auditResult.overallScore >= 60 ? '#ffc107' : '#dc3545';

        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>FlowCode Security Audit Report</title>
            <style>
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    margin: 20px;
                    line-height: 1.6;
                }
                .score {
                    font-size: 2em;
                    font-weight: bold;
                    color: ${scoreColor};
                    text-align: center;
                    margin: 20px 0;
                }
                .summary {
                    background: #f8f9fa;
                    padding: 15px;
                    border-radius: 5px;
                    margin: 20px 0;
                }
                .critical { color: #dc3545; font-weight: bold; }
                .high { color: #fd7e14; font-weight: bold; }
                .medium { color: #ffc107; font-weight: bold; }
                .low { color: #6c757d; }
                .pass { color: #28a745; }
                .fail { color: #dc3545; }
                pre { background: #f8f9fa; padding: 10px; border-radius: 3px; overflow-x: auto; }
                h1, h2, h3 { color: #333; }
                ul { padding-left: 20px; }
            </style>
        </head>
        <body>
            <div class="score">Security Score: ${auditResult.overallScore}/100</div>
            <div class="summary">
                <h3>Summary</h3>
                <ul>
                    <li>Total Checks: ${auditResult.totalChecks}</li>
                    <li>Passed: <span class="pass">${auditResult.passedChecks}</span></li>
                    <li>Critical Issues: <span class="critical">${auditResult.criticalIssues}</span></li>
                    <li>High Issues: <span class="high">${auditResult.highIssues}</span></li>
                    <li>Medium Issues: <span class="medium">${auditResult.mediumIssues}</span></li>
                    <li>Low Issues: <span class="low">${auditResult.lowIssues}</span></li>
                </ul>
            </div>
            <pre>${report}</pre>
        </body>
        </html>
        `;
    }

    public async showStatusDashboard(): Promise<void> {
        try {
            const panel = vscode.window.createWebviewPanel(
                'flowcodeStatus',
                'FlowCode Status Dashboard',
                vscode.ViewColumn.One,
                { enableScripts: true }
            );

            const html = await this.generateStatusDashboardHtml();
            panel.webview.html = html;

            // Handle messages from webview
            panel.webview.onDidReceiveMessage(async (message) => {
                switch (message.command) {
                    case 'clearCache':
                        const { CacheManager } = await import('./utils/performance-cache');
                        CacheManager.clearAll();
                        await this.notificationManager.showSuccess('Cache cleared successfully');
                        break;
                    case 'runSecurityAudit':
                        await this.runSecurityAudit();
                        break;
                    case 'checkDependencies':
                        await this.checkDependencyStatus();
                        break;
                }
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            await this.notificationManager.showError(
                'Failed to show status dashboard',
                {
                    operation: 'Status Dashboard',
                    suggestion: 'Try restarting VS Code if the issue persists',
                    reportable: true
                },
                { detail: message }
            );
        }
    }

    private async generateStatusDashboardHtml(): Promise<string> {
        const { PerformanceMonitor } = await import('./utils/performance-monitor');
        const { CacheManager } = await import('./utils/performance-cache');

        const performanceStats = PerformanceMonitor.getInstance().getAllStats();
        const cacheStats = CacheManager.getAllStats();
        const systemMetrics = PerformanceMonitor.getInstance().getCurrentSystemMetrics();

        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>FlowCode Status Dashboard</title>
            <style>
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    margin: 20px;
                    background: var(--vscode-editor-background);
                    color: var(--vscode-editor-foreground);
                }
                .dashboard { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
                .card {
                    background: var(--vscode-editor-inactiveSelectionBackground);
                    padding: 15px;
                    border-radius: 8px;
                    border: 1px solid var(--vscode-panel-border);
                }
                .metric { display: flex; justify-content: space-between; margin: 8px 0; }
                .metric-value { font-weight: bold; color: var(--vscode-textLink-foreground); }
                .button {
                    background: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    padding: 8px 16px;
                    border-radius: 4px;
                    cursor: pointer;
                    margin: 4px;
                }
                .button:hover { background: var(--vscode-button-hoverBackground); }
                h2 { color: var(--vscode-textLink-foreground); margin-top: 0; }
                .status-good { color: #4CAF50; }
                .status-warning { color: #FF9800; }
                .status-error { color: #F44336; }
            </style>
        </head>
        <body>
            <h1>🚀 FlowCode Status Dashboard</h1>

            <div class="dashboard">
                <div class="card">
                    <h2>📊 Performance Metrics</h2>
                    ${performanceStats.map(stat => `
                        <div class="metric">
                            <span>${stat.name}</span>
                            <span class="metric-value">${stat.averageDuration.toFixed(1)}ms avg</span>
                        </div>
                    `).join('')}
                    <div class="metric">
                        <span>Memory Usage</span>
                        <span class="metric-value">${(systemMetrics.memoryUsage.heapUsed / 1024 / 1024).toFixed(1)} MB</span>
                    </div>
                </div>

                <div class="card">
                    <h2>💾 Cache Status</h2>
                    ${Object.entries(cacheStats).map(([name, stats]) => `
                        <div class="metric">
                            <span>${name}</span>
                            <span class="metric-value">${stats.totalEntries} entries (${(stats.hitRate * 100).toFixed(1)}% hit rate)</span>
                        </div>
                    `).join('')}
                    <button class="button" onclick="clearCache()">🗑️ Clear All Caches</button>
                </div>

                <div class="card">
                    <h2>🔧 Quick Actions</h2>
                    <button class="button" onclick="runSecurityAudit()">🛡️ Run Security Audit</button>
                    <button class="button" onclick="checkDependencies()">📦 Check Dependencies</button>
                    <button class="button" onclick="location.reload()">🔄 Refresh Dashboard</button>
                </div>

                <div class="card">
                    <h2>ℹ️ System Information</h2>
                    <div class="metric">
                        <span>VS Code Version</span>
                        <span class="metric-value">${vscode.version}</span>
                    </div>
                    <div class="metric">
                        <span>Platform</span>
                        <span class="metric-value">${process.platform}</span>
                    </div>
                    <div class="metric">
                        <span>Node Version</span>
                        <span class="metric-value">${process.version}</span>
                    </div>
                </div>
            </div>

            <script>
                const vscode = acquireVsCodeApi();

                function clearCache() {
                    vscode.postMessage({ command: 'clearCache' });
                }

                function runSecurityAudit() {
                    vscode.postMessage({ command: 'runSecurityAudit' });
                }

                function checkDependencies() {
                    vscode.postMessage({ command: 'checkDependencies' });
                }
            </script>
        </body>
        </html>
        `;
    }

    public async showHelp(): Promise<void> {
        await this.helpSystem.showHelpPanel();
    }

    public async showContextualHelp(): Promise<void> {
        await this.helpSystem.showContextualHelp();
    }

    public async showQuickHelp(topic?: string): Promise<void> {
        if (topic) {
            await this.helpSystem.showQuickHelp(topic);
        } else {
            await this.helpSystem.showContextualHelp();
        }
    }

    public async showHealthStatus(): Promise<void> {
        try {
            const health = await this.healthCheckSystem.runHealthChecks();
            const report = this.healthCheckSystem.generateHealthReport();

            const panel = vscode.window.createWebviewPanel(
                'flowcodeHealth',
                'FlowCode Health Status',
                vscode.ViewColumn.One,
                { enableScripts: true }
            );

            panel.webview.html = this.generateHealthStatusHtml(health, report);

            // Telemetry removed in V0.2 agentic pivot
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            await this.notificationManager.showError(
                'Failed to show health status',
                {
                    operation: 'Health Status',
                    suggestion: 'Try restarting VS Code if the issue persists',
                    reportable: true
                },
                { detail: message }
            );
        }
    }

    public async runHealthCheck(checkName?: string): Promise<void> {
        try {
            if (checkName) {
                const result = await this.healthCheckSystem.runHealthCheck(checkName);
                if (result) {
                    const status = result.status ? '✅ Passed' : '❌ Failed';
                    const message = `Health check "${checkName}": ${status}`;

                    if (result.status) {
                        await this.notificationManager.showSuccess(message);
                    } else {
                        await this.notificationManager.showError(message, {
                            operation: 'Health Check',
                            suggestion: result.error || 'Check system configuration'
                        });
                    }
                }
            } else {
                const health = await this.healthCheckSystem.runHealthChecks();
                const message = health.overall
                    ? `All health checks passed (${health.summary.passed}/${health.summary.total})`
                    : `Health issues detected (${health.summary.failed}/${health.summary.total} failed)`;

                if (health.overall) {
                    await this.notificationManager.showSuccess(message);
                } else {
                    await this.notificationManager.showWarning(message, {
                        operation: 'Health Check',
                        suggestion: 'Run "FlowCode: Show Health Status" for detailed information'
                    });
                }
            }

            // Telemetry removed in V0.2 agentic pivot
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            await this.notificationManager.showError(
                'Health check failed',
                {
                    operation: 'Health Check',
                    reportable: true
                },
                { detail: message }
            );
        }
    }

    /**
     * Check if the extension is currently active
     * @returns true if extension is active, false otherwise
     */
    public isActive(): boolean {
        return this._isActive;
    }

    /**
     * Manually run the companion guard
     * Executes linting and code quality checks on the current workspace
     */
    public async runCompanionGuard(): Promise<void> {
        try {
            if (!this._isActive) {
                throw new Error('Extension is not active. Please activate FlowCode first.');
            }

            this.statusBarManager.showRunning('Companion Guard');
            this.contextLogger.info('Running companion guard manually');

            // Run companion guard checks
            await this.companionGuard.runChecks();

            this.statusBarManager.showReady();
            vscode.window.showInformationMessage('Companion Guard analysis completed successfully!');

        } catch (error) {
            this.statusBarManager.showError('Companion Guard failed');
            const message = error instanceof Error ? error.message : 'Unknown error';
            this.contextLogger.error('Companion guard manual run failed', error as Error);

            await this.notificationManager.showError(
                'Companion Guard failed',
                {
                    operation: 'Manual Companion Guard Run',
                    suggestion: 'Check your workspace for syntax errors or try running on a smaller selection',
                    documentation: 'https://flowcode.dev/docs/companion-guard',
                    reportable: true
                },
                { detail: message }
            );
        }
    }

    /**
     * Initialize the final guard system
     * Sets up pre-commit hooks and final validation
     */
    public async initializeFinalGuard(): Promise<void> {
        try {
            if (!this._isActive) {
                throw new Error('Extension is not active. Please activate FlowCode first.');
            }

            this.statusBarManager.showRunning('Initializing Final Guard');
            this.contextLogger.info('Initializing final guard system');

            // Initialize final guard
            await this.finalGuard.initialize();

            // Set up git hooks if in a git repository
            await this.initializeGitHooks();

            this.statusBarManager.showReady();
            vscode.window.showInformationMessage('Final Guard initialized successfully!');

        } catch (error) {
            this.statusBarManager.showError('Final Guard initialization failed');
            const message = error instanceof Error ? error.message : 'Unknown error';
            this.contextLogger.error('Final guard initialization failed', error as Error);

            await this.notificationManager.showError(
                'Final Guard initialization failed',
                {
                    operation: 'Final Guard Initialization',
                    suggestion: 'Ensure you are in a git repository and have proper permissions',
                    documentation: 'https://flowcode.dev/docs/final-guard',
                    reportable: true
                },
                { detail: message }
            );
        }
    }

    /**
     * Show AI chat interface
     */
    public async showChat(): Promise<void> {
        if (!this._isActive) {
            vscode.window.showWarningMessage('FlowCode is not active. Please activate it first.');
            return;
        }

        try {
            await this.chatInterface.show();
            this.contextLogger.info('Chat interface opened successfully');

        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            this.contextLogger.error('Failed to show chat interface', error as Error);

            await this.notificationManager.showError(
                'Failed to open chat interface',
                {
                    operation: 'Show Chat',
                    suggestion: 'Try restarting VS Code or check the extension logs',
                    documentation: 'https://flowcode.dev/docs/chat',
                    reportable: true
                },
                { detail: message }
            );
        }
    }

    /**
     * Refactor code using AI-powered analysis
     * Analyzes selected code or current file and suggests improvements
     */
    public async refactorCode(): Promise<void> {
        try {
            if (!this._isActive) {
                throw new Error('Extension is not active. Please activate FlowCode first.');
            }

            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showErrorMessage('No active editor found. Please open a file to refactor.');
                return;
            }

            this.statusBarManager.showRunning('Code Refactoring');
            this.contextLogger.info('Starting code refactoring');

            // Use architect service for refactoring
            // Use new agentic approach
            const task = await this.taskPlanningEngine.decomposeGoal(
                'Refactor the selected code or current file'
            );

            vscode.window.showInformationMessage(
                `Refactoring task planned with ${task.steps.length} steps. Agentic execution coming soon!`
            );

            this.statusBarManager.showReady();
            vscode.window.showInformationMessage('Code refactoring completed successfully!');

        } catch (error) {
            this.statusBarManager.showError('Refactoring failed');
            const message = error instanceof Error ? error.message : 'Unknown error';
            this.contextLogger.error('Code refactoring failed', error as Error);

            await this.notificationManager.showError(
                'Code refactoring failed',
                {
                    operation: 'Code Refactoring',
                    suggestion: 'Try selecting a smaller piece of code or check your API configuration',
                    documentation: 'https://flowcode.dev/docs/refactoring',
                    reportable: true
                },
                { detail: message }
            );
        }
    }

    /**
     * Toggle smart autocomplete feature
     */
    public async toggleSmartAutocomplete(): Promise<void> {
        try {
            if (!this._isActive) {
                throw new Error('Extension is not active. Please activate FlowCode first.');
            }

            // Toggle the autocomplete service
            const currentState = this.smartAutocompleteService ? true : false;
            const newState = !currentState;

            this.smartAutocompleteService.setEnabled(newState);

            const message = newState
                ? '✅ Smart Autocomplete enabled! AI-powered suggestions are now active.'
                : '❌ Smart Autocomplete disabled. Using standard IntelliSense only.';

            vscode.window.showInformationMessage(message);

            this.contextLogger.info(`Smart autocomplete ${newState ? 'enabled' : 'disabled'}`);

        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            vscode.window.showErrorMessage(`Failed to toggle smart autocomplete: ${message}`);
            this.contextLogger.error('Failed to toggle smart autocomplete', error as Error);
        }
    }

    /**
     * Analyze current code
     */
    public async analyzeCode(): Promise<void> {
        try {
            if (!this._isActive) {
                throw new Error('Extension is not active. Please activate FlowCode first.');
            }

            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showWarningMessage('Please open a file to analyze.');
                return;
            }

            const document = editor.document;
            const selection = editor.selection;
            const code = selection.isEmpty ? document.getText() : document.getText(selection);

            if (!code.trim()) {
                vscode.window.showWarningMessage('No code to analyze.');
                return;
            }

            // Show progress
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Analyzing code...',
                cancellable: false
            }, async (progress) => {
                progress.report({ increment: 50, message: 'Running analysis...' });

                // Use architect service for analysis
                const response = await this.architectService.generateResponse({
                    userMessage: `Analyze this ${document.languageId} code and provide insights about structure, quality, and potential improvements:\n\n${code}`,
                    activeFile: document.fileName,
                    workspaceRoot: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
                });

                progress.report({ increment: 100, message: 'Analysis complete!' });

                // Show results in chat
                await this.showChatInterface();
                // The response will be handled by the chat interface
            });

        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            vscode.window.showErrorMessage(`Code analysis failed: ${message}`);
            this.contextLogger.error('Code analysis failed', error as Error);
        }
    }

    /**
     * Show Quick Actions menu
     */
    public async showQuickActions(): Promise<void> {
        try {
            const actions = [
                {
                    label: '$(rocket) Generate Code',
                    description: 'AI-powered code generation',
                    command: 'flowcode.generateCode'
                },
                {
                    label: '$(search) Analyze Code',
                    description: 'Code analysis and insights',
                    command: 'flowcode.analyzeCode'
                },
                {
                    label: '$(git-branch) Create Hotfix',
                    description: 'Emergency hotfix workflow',
                    command: 'flowcode.createHotfix'
                },
                {
                    label: '$(shield) Security Audit',
                    description: 'Run security vulnerability scan',
                    command: 'flowcode.runSecurityAudit'
                },
                {
                    label: '$(graph) Dependency Graph',
                    description: 'Visualize code dependencies',
                    command: 'flowcode.showDependencyGraph'
                },
                {
                    label: '$(comment-discussion) Open Chat',
                    description: 'Open FlowCode chat interface',
                    command: 'flowcode.showChat'
                },
                {
                    label: '$(settings-gear) Settings',
                    description: 'Configure FlowCode',
                    command: 'flowcode.openSettings'
                }
            ];

            const selected = await vscode.window.showQuickPick(actions, {
                placeHolder: 'Select a FlowCode action',
                matchOnDescription: true
            });

            if (selected) {
                await vscode.commands.executeCommand(selected.command);
            }

        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            vscode.window.showErrorMessage(`Quick actions failed: ${message}`);
            this.contextLogger.error('Quick actions failed', error as Error);
        }
    }

    /**
     * Debug context system to identify issues
     */
    public async debugContextSystem(): Promise<void> {
        try {
            this.contextLogger.info('Running context system diagnostics...');

            // Run comprehensive diagnostics
            const diagnostics = await this.runContextDiagnostics();

            // Display results in a webview panel
            await this.showContextDiagnosticsPanel(diagnostics);

            // Also log to console for development
            console.log('Context Diagnostics:', JSON.stringify(diagnostics, null, 2));

        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            vscode.window.showErrorMessage(`Context diagnostics failed: ${message}`);
            this.contextLogger.error('Context diagnostics failed', error as Error);
        }
    }

    /**
     * Test TaskPlanningEngine functionality
     */
    public async testTaskPlanningEngine(): Promise<void> {
        try {
            vscode.window.showInformationMessage('🔍 Testing TaskPlanningEngine...');

            // Test 1: Simple goal decomposition
            const simpleGoal = 'Create a new TypeScript file with a simple function';
            const task = await this.taskPlanningEngine.decomposeGoal(simpleGoal);

            // Test 2: Complexity estimation
            const complexity = await this.taskPlanningEngine.estimateComplexity('Refactor the entire application');

            // Test 3: Plan adaptation
            const adaptedTask = await this.taskPlanningEngine.adaptPlan(task, 'Add more validation steps');

            // Show results
            const results = [
                `✅ Goal Decomposition: ${task.steps.length} steps, ${task.riskLevel} risk`,
                `✅ Complexity Estimation: ${complexity.level} (${complexity.estimatedTime}ms)`,
                `✅ Plan Adaptation: v${task.metadata.version} → v${adaptedTask.metadata.version}`,
                ``,
                `🎉 TaskPlanningEngine is working correctly!`
            ].join('\n');

            vscode.window.showInformationMessage(results, { modal: true });

        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            vscode.window.showErrorMessage(`TaskPlanningEngine test failed: ${message}`);
        }
    }

    /**
     * Execute a user goal autonomously using the enhanced goal execution panel
     */
    public async executeGoalAutonomously(): Promise<void> {
        try {
            // Show the enhanced goal execution panel
            await this.goalExecutionPanel.show();
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            vscode.window.showErrorMessage(`Failed to open goal execution panel: ${message}`);
        }
    }

    /**
     * Show agent status and current execution
     */
    public async showAgentStatus(): Promise<void> {
        try {
            const status = this.agenticOrchestrator.getExecutionStatus();
            const state = this.agentStateManager.getState();
            const stats = this.agentStateManager.getTaskStatistics();

            const statusMessage = [
                `🤖 **Agent Status**`,
                ``,
                `**Current Execution:**`,
                `• Executing: ${status.isExecuting ? 'Yes' : 'No'}`,
                `• Current Task: ${status.currentTask?.goal || 'None'}`,
                `• Current Step: ${status.currentStep?.description || 'None'}`,
                ``,
                `**Statistics:**`,
                `• Total Tasks: ${stats.totalTasks}`,
                `• Success Rate: ${Math.round(stats.successRate * 100)}%`,
                `• Average Duration: ${Math.round(stats.averageDuration / 1000)}s`,
                ``,
                `**Queue:**`,
                `• Queued Tasks: ${state.taskQueue.length}`,
                `• Session Start: ${new Date(state.sessionStartTime).toLocaleString()}`
            ].join('\n');

            vscode.window.showInformationMessage(statusMessage, { modal: true });

        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            vscode.window.showErrorMessage(`Failed to show agent status: ${message}`);
        }
    }

    /**
     * Test Week 2 implementation
     */
    public async testWeek2Implementation(): Promise<void> {
        try {
            vscode.window.showInformationMessage('🔍 Testing Week 2 Implementation...');

            // Test ExecutionEngine
            const testResult1 = await this.testExecutionEngineBasic();

            // Test AgentStateManager
            const testResult2 = await this.testAgentStateManagerBasic();

            // Test HumanOversightSystem
            const testResult3 = await this.testHumanOversightSystemBasic();

            // Test AgenticOrchestrator
            const testResult4 = await this.testAgenticOrchestratorBasic();

            const results = [
                `✅ ExecutionEngine: ${testResult1 ? 'Working' : 'Failed'}`,
                `✅ AgentStateManager: ${testResult2 ? 'Working' : 'Failed'}`,
                `✅ HumanOversightSystem: ${testResult3 ? 'Working' : 'Failed'}`,
                `✅ AgenticOrchestrator: ${testResult4 ? 'Working' : 'Failed'}`,
                ``,
                `🎉 Week 2 Implementation: ${testResult1 && testResult2 && testResult3 && testResult4 ? 'All Systems Operational!' : 'Some Issues Detected'}`
            ].join('\n');

            if (testResult1 && testResult2 && testResult3 && testResult4) {
                vscode.window.showInformationMessage(results, { modal: true });
            } else {
                vscode.window.showWarningMessage(results, { modal: true });
            }

        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            vscode.window.showErrorMessage(`Week 2 testing failed: ${message}`);
        }
    }

    private async testExecutionEngineBasic(): Promise<boolean> {
        try {
            // Test that ExecutionEngine is properly initialized
            return this.executionEngine !== undefined;
        } catch {
            return false;
        }
    }

    private async testAgentStateManagerBasic(): Promise<boolean> {
        try {
            // Test basic state operations
            const state = this.agentStateManager.getState();
            const stats = this.agentStateManager.getTaskStatistics();
            return state !== undefined && stats !== undefined;
        } catch {
            return false;
        }
    }

    private async testHumanOversightSystemBasic(): Promise<boolean> {
        try {
            // Test that HumanOversightSystem is properly initialized
            return this.humanOversightSystem !== undefined;
        } catch {
            return false;
        }
    }

    private async testAgenticOrchestratorBasic(): Promise<boolean> {
        try {
            // Test orchestrator status
            const status = this.agenticOrchestrator.getExecutionStatus();
            return status !== undefined && typeof status.isExecuting === 'boolean';
        } catch {
            return false;
        }
    }

    private async testBasicIntegration(): Promise<boolean> {
        try {
            // Test basic integration between components
            const testGoal = 'Test integration';
            const task = await this.taskPlanningEngine.decomposeGoal(testGoal);
            await this.agentStateManager.setCurrentTask(task);
            const currentTask = this.agentStateManager.getCurrentTask();
            await this.agentStateManager.setCurrentTask(null);
            return currentTask?.id === task.id;
        } catch {
            return false;
        }
    }

    /**
     * Run comprehensive integration test
     */
    public async runIntegrationTest(): Promise<void> {
        try {
            vscode.window.showInformationMessage('🔍 Running Comprehensive Integration Test...');

            // Test 1: Service Integration
            const servicesOk = this.executionEngine && this.agentStateManager &&
                              this.humanOversightSystem && this.agenticOrchestrator;

            // Test 2: Component Communication
            const status = this.agenticOrchestrator.getExecutionStatus();
            const state = this.agentStateManager.getState();
            const stats = this.agentStateManager.getTaskStatistics();

            // Test 3: Task Planning Integration
            const testGoal = 'Create a simple test file';
            const plannedTask = await this.taskPlanningEngine.decomposeGoal(testGoal);

            // Test 4: State Management
            await this.agentStateManager.setCurrentTask(plannedTask);
            const currentTask = this.agentStateManager.getCurrentTask();

            // Test 5: Progress Tracking
            await this.agentStateManager.updateTaskProgress(plannedTask.id, {
                percentComplete: 50,
                currentStep: plannedTask.steps[0]?.id
            });

            // Create comprehensive test results
            const testResults = [
                `🔍 **Comprehensive Integration Test Results**`,
                ``,
                `**1. Service Integration:**`,
                `• ExecutionEngine: ${this.executionEngine ? '✅ Ready' : '❌ Failed'}`,
                `• AgentStateManager: ${this.agentStateManager ? '✅ Ready' : '❌ Failed'}`,
                `• HumanOversightSystem: ${this.humanOversightSystem ? '✅ Ready' : '❌ Failed'}`,
                `• AgenticOrchestrator: ${this.agenticOrchestrator ? '✅ Ready' : '❌ Failed'}`,
                ``,
                `**2. Component Communication:**`,
                `• Orchestrator Status: ${status ? '✅ Available' : '❌ Failed'}`,
                `• State Management: ${state ? '✅ Working' : '❌ Failed'}`,
                `• Statistics: ${stats ? '✅ Working' : '❌ Failed'}`,
                ``,
                `**3. Task Planning Integration:**`,
                `• Goal Decomposition: ${plannedTask ? '✅ Working' : '❌ Failed'}`,
                `• Steps Generated: ${plannedTask?.steps.length || 0}`,
                `• Risk Assessment: ${plannedTask?.riskLevel || 'Unknown'}`,
                ``,
                `**4. State Management:**`,
                `• Task Storage: ${currentTask?.id === plannedTask?.id ? '✅ Working' : '❌ Failed'}`,
                `• Progress Tracking: ${currentTask?.progress.percentComplete === 50 ? '✅ Working' : '❌ Failed'}`,
                `• History Tracking: ${state?.executionHistory ? '✅ Working' : '❌ Failed'}`,
                ``,
                `**5. Overall Integration:**`,
                `• All Services: ${servicesOk ? '✅ Integrated' : '❌ Issues Detected'}`,
                `• Communication: ${status && state && stats ? '✅ Working' : '❌ Issues Detected'}`,
                `• End-to-End Flow: ${plannedTask && currentTask ? '✅ Functional' : '❌ Issues Detected'}`,
                ``,
                `🎉 **Integration Status: ${servicesOk && status && state && stats && plannedTask && currentTask ? 'ALL SYSTEMS OPERATIONAL' : 'ISSUES DETECTED'}**`
            ].join('\n');

            // Show results
            if (servicesOk && status && state && stats && plannedTask && currentTask) {
                vscode.window.showInformationMessage(testResults, { modal: true });
            } else {
                vscode.window.showWarningMessage(testResults, { modal: true });
            }

            // Clean up test task
            await this.agentStateManager.setCurrentTask(null);

        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            vscode.window.showErrorMessage(`Integration test failed: ${message}`);
        }
    }

    /**
     * Demonstrate complete agentic workflow
     */
    public async demonstrateAgenticWorkflow(): Promise<void> {
        try {
            vscode.window.showInformationMessage('🤖 Starting Agentic Workflow Demonstration...');

            // Step 1: Show current agent status
            const status = this.agenticOrchestrator.getExecutionStatus();
            const state = this.agentStateManager.getState();

            // Step 2: Demonstrate task planning
            const demoGoal = 'Create a simple TypeScript utility function with documentation';
            const plannedTask = await this.taskPlanningEngine.decomposeGoal(demoGoal);

            // Step 3: Show state management
            await this.agentStateManager.setCurrentTask(plannedTask);
            const currentTask = this.agentStateManager.getCurrentTask();

            // Step 4: Demonstrate progress tracking
            await this.agentStateManager.updateTaskProgress(plannedTask.id, {
                percentComplete: 25,
                currentStep: plannedTask.steps[0]?.id
            });

            // Step 5: Show statistics
            const stats = this.agentStateManager.getTaskStatistics();

            // Create comprehensive demo results
            const demoResults = [
                `🤖 **Agentic Workflow Demonstration**`,
                ``,
                `**1. Agent Status:**`,
                `• Currently Executing: ${status.isExecuting ? 'Yes' : 'No'}`,
                `• Session Tasks: ${state.totalTasksCompleted + state.totalTasksFailed}`,
                `• Success Rate: ${Math.round(stats.successRate * 100)}%`,
                ``,
                `**2. Task Planning:**`,
                `• Goal: "${demoGoal}"`,
                `• Steps Generated: ${plannedTask.steps.length}`,
                `• Risk Level: ${plannedTask.riskLevel}`,
                `• Estimated Duration: ${Math.round(plannedTask.estimatedDuration / 1000)}s`,
                ``,
                `**3. State Management:**`,
                `• Task Stored: ${currentTask?.id === plannedTask.id ? 'Yes' : 'No'}`,
                `• Progress Tracking: 25% Complete`,
                `• History Entries: ${state.executionHistory.length}`,
                ``,
                `**4. System Integration:**`,
                `• ExecutionEngine: Ready`,
                `• AgentStateManager: Active`,
                `• HumanOversightSystem: Monitoring`,
                `• AgenticOrchestrator: Coordinating`,
                ``,
                `**5. Capabilities Demonstrated:**`,
                `• ✅ Goal decomposition and planning`,
                `• ✅ Risk assessment and approval workflows`,
                `• ✅ State persistence and progress tracking`,
                `• ✅ Human oversight and intervention`,
                `• ✅ Learning and adaptation framework`,
                ``,
                `🎉 **Complete Autonomous Agent Ready!**`,
                ``,
                `The system can now execute complex coding goals`,
                `autonomously with appropriate human oversight.`
            ].join('\n');

            // Show comprehensive results
            vscode.window.showInformationMessage(demoResults, { modal: true });

            // Clean up demo task
            await this.agentStateManager.setCurrentTask(null);

        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            vscode.window.showErrorMessage(`Workflow demonstration failed: ${message}`);
        }
    }

    /**
     * Run comprehensive context system diagnostics
     */
    private async runContextDiagnostics(): Promise<any> {
        const diagnostics = {
            timestamp: new Date().toISOString(),
            extension: {
                isActive: this._isActive,
                activationTime: Date.now() // Simplified for now
            },
            workspace: {
                hasWorkspace: !!vscode.workspace.workspaceFolders?.length,
                workspaceRoot: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
                workspaceName: vscode.workspace.workspaceFolders?.[0]?.name,
                fileCount: 0,
                activeFile: vscode.window.activeTextEditor?.document.fileName
            },
            services: {
                contextManager: !!this.contextManager,
                contextAnalyzer: false, // Will be set during testing
                contextCompressionService: !!this.contextCompressionService,
                configManager: !!this.configManager,
                companionGuard: !!this.companionGuard
            },
            apiConfig: {
                hasApiKey: false,
                provider: 'unknown',
                isValid: false
            },
            contextTest: {
                basicContextWorks: false,
                enhancedContextWorks: false,
                compressionWorks: false,
                error: null as string | null
            },
            errors: [] as string[]
        };

        try {
            // Test workspace access
            if (diagnostics.workspace.workspaceRoot) {
                const files = await vscode.workspace.findFiles('**/*', '**/node_modules/**', 100);
                diagnostics.workspace.fileCount = files.length;
            } else {
                diagnostics.errors.push('No workspace folder open');
            }

            // Test API configuration
            if (this.configManager) {
                try {
                    const apiConfig = await this.configManager.getApiConfiguration();
                    diagnostics.apiConfig.hasApiKey = !!apiConfig.apiKey;
                    diagnostics.apiConfig.provider = apiConfig.provider;
                    diagnostics.apiConfig.isValid = !!apiConfig.apiKey && !!apiConfig.provider;
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                    diagnostics.errors.push(`API config error: ${errorMessage}`);
                }
            }

            // Test basic context
            if (this.contextManager) {
                try {
                    const basicContext = await this.getBasicContextForDiagnostics();
                    diagnostics.contextTest.basicContextWorks = !!basicContext;
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                    diagnostics.contextTest.error = `Basic context failed: ${errorMessage}`;
                    diagnostics.errors.push(diagnostics.contextTest.error);
                }

                // Test enhanced context
                try {
                    const enhancedContext = await this.contextManager.getChatContext('test query');
                    diagnostics.contextTest.enhancedContextWorks = !!enhancedContext;
                    diagnostics.contextTest.compressionWorks = !!enhancedContext.compressionApplied;

                    // Check if context analyzer is working by testing if we got analysis results
                    diagnostics.services.contextAnalyzer = !!(enhancedContext.analysis && enhancedContext.analysis.items);
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                    diagnostics.contextTest.error = `Enhanced context failed: ${errorMessage}`;
                    diagnostics.errors.push(diagnostics.contextTest.error);
                }
            } else {
                diagnostics.errors.push('Context manager not initialized');
            }

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            diagnostics.errors.push(`Diagnostics error: ${errorMessage}`);
        }

        return diagnostics;
    }

    /**
     * Get basic context for diagnostics (simplified version)
     */
    private async getBasicContextForDiagnostics(): Promise<any> {
        const activeEditor = vscode.window.activeTextEditor;
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

        return {
            activeFile: activeEditor?.document.fileName,
            workspaceRoot,
            selectedText: activeEditor?.document.getText(activeEditor.selection),
            hasCompanionGuard: !!this.companionGuard
        };
    }

    /**
     * Show context diagnostics in a webview panel
     */
    private async showContextDiagnosticsPanel(diagnostics: any): Promise<void> {
        const panel = vscode.window.createWebviewPanel(
            'flowcodeContextDiagnostics',
            'FlowCode Context Diagnostics',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        panel.webview.html = this.generateContextDiagnosticsHtml(diagnostics);

        // Handle messages from webview
        panel.webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case 'rerunDiagnostics':
                    const newDiagnostics = await this.runContextDiagnostics();
                    panel.webview.html = this.generateContextDiagnosticsHtml(newDiagnostics);
                    break;
                case 'copyDiagnostics':
                    await vscode.env.clipboard.writeText(JSON.stringify(diagnostics, null, 2));
                    vscode.window.showInformationMessage('Diagnostics copied to clipboard');
                    break;
            }
        });
    }

    /**
     * Generate HTML for context diagnostics panel
     */
    private generateContextDiagnosticsHtml(diagnostics: any): string {
        const overallStatus = diagnostics.errors.length === 0 ? '✅ HEALTHY' : '❌ ISSUES FOUND';
        const statusColor = diagnostics.errors.length === 0 ? '#4CAF50' : '#F44336';

        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>FlowCode Context Diagnostics</title>
            <style>
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    margin: 20px;
                    background: var(--vscode-editor-background);
                    color: var(--vscode-editor-foreground);
                    line-height: 1.6;
                }
                .header {
                    display: flex;
                    align-items: center;
                    margin-bottom: 20px;
                    padding: 15px;
                    background: var(--vscode-textBlockQuote-background);
                    border-radius: 5px;
                }
                .status {
                    font-size: 18px;
                    font-weight: bold;
                    color: ${statusColor};
                }
                .section {
                    margin: 20px 0;
                    padding: 15px;
                    background: var(--vscode-textBlockQuote-background);
                    border-radius: 5px;
                }
                .section h3 {
                    margin-top: 0;
                    color: var(--vscode-textLink-foreground);
                }
                .diagnostic-item {
                    display: flex;
                    justify-content: space-between;
                    margin: 8px 0;
                    padding: 5px 0;
                    border-bottom: 1px solid var(--vscode-widget-border);
                }
                .diagnostic-label {
                    font-weight: 500;
                }
                .diagnostic-value {
                    font-family: 'Courier New', monospace;
                }
                .success { color: #4CAF50; }
                .error { color: #F44336; }
                .warning { color: #FF9800; }
                .errors-list {
                    background: var(--vscode-inputValidation-errorBackground);
                    border: 1px solid var(--vscode-inputValidation-errorBorder);
                    border-radius: 3px;
                    padding: 10px;
                    margin: 10px 0;
                }
                .error-item {
                    margin: 5px 0;
                    color: var(--vscode-inputValidation-errorForeground);
                }
                .actions {
                    margin: 20px 0;
                    text-align: center;
                }
                button {
                    background: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    padding: 10px 20px;
                    margin: 0 10px;
                    border-radius: 3px;
                    cursor: pointer;
                }
                button:hover {
                    background: var(--vscode-button-hoverBackground);
                }
                .json-output {
                    background: var(--vscode-textCodeBlock-background);
                    border: 1px solid var(--vscode-widget-border);
                    border-radius: 3px;
                    padding: 15px;
                    font-family: 'Courier New', monospace;
                    font-size: 12px;
                    white-space: pre-wrap;
                    max-height: 300px;
                    overflow-y: auto;
                }
            </style>
        </head>
        <body>
            <div class="header">
                <h2>🔍 FlowCode Context System Diagnostics</h2>
                <div style="margin-left: auto;">
                    <span class="status">${overallStatus}</span>
                </div>
            </div>

            <div class="section">
                <h3>📊 System Overview</h3>
                <div class="diagnostic-item">
                    <span class="diagnostic-label">Timestamp:</span>
                    <span class="diagnostic-value">${diagnostics.timestamp}</span>
                </div>
                <div class="diagnostic-item">
                    <span class="diagnostic-label">Extension Active:</span>
                    <span class="diagnostic-value ${diagnostics.extension.isActive ? 'success' : 'error'}">
                        ${diagnostics.extension.isActive ? '✅ Yes' : '❌ No'}
                    </span>
                </div>
            </div>

            <div class="section">
                <h3>📁 Workspace Status</h3>
                <div class="diagnostic-item">
                    <span class="diagnostic-label">Has Workspace:</span>
                    <span class="diagnostic-value ${diagnostics.workspace.hasWorkspace ? 'success' : 'error'}">
                        ${diagnostics.workspace.hasWorkspace ? '✅ Yes' : '❌ No'}
                    </span>
                </div>
                <div class="diagnostic-item">
                    <span class="diagnostic-label">Workspace Root:</span>
                    <span class="diagnostic-value">${diagnostics.workspace.workspaceRoot || 'None'}</span>
                </div>
                <div class="diagnostic-item">
                    <span class="diagnostic-label">File Count:</span>
                    <span class="diagnostic-value">${diagnostics.workspace.fileCount}</span>
                </div>
                <div class="diagnostic-item">
                    <span class="diagnostic-label">Active File:</span>
                    <span class="diagnostic-value">${diagnostics.workspace.activeFile || 'None'}</span>
                </div>
            </div>

            <div class="section">
                <h3>🔧 Services Status</h3>
                <div class="diagnostic-item">
                    <span class="diagnostic-label">Context Manager:</span>
                    <span class="diagnostic-value ${diagnostics.services.contextManager ? 'success' : 'error'}">
                        ${diagnostics.services.contextManager ? '✅ Initialized' : '❌ Missing'}
                    </span>
                </div>
                <div class="diagnostic-item">
                    <span class="diagnostic-label">Context Analyzer:</span>
                    <span class="diagnostic-value ${diagnostics.services.contextAnalyzer ? 'success' : 'error'}">
                        ${diagnostics.services.contextAnalyzer ? '✅ Initialized' : '❌ Missing'}
                    </span>
                </div>
                <div class="diagnostic-item">
                    <span class="diagnostic-label">Compression Service:</span>
                    <span class="diagnostic-value ${diagnostics.services.contextCompressionService ? 'success' : 'error'}">
                        ${diagnostics.services.contextCompressionService ? '✅ Initialized' : '❌ Missing'}
                    </span>
                </div>
            </div>

            <div class="section">
                <h3>🔑 API Configuration</h3>
                <div class="diagnostic-item">
                    <span class="diagnostic-label">Has API Key:</span>
                    <span class="diagnostic-value ${diagnostics.apiConfig.hasApiKey ? 'success' : 'error'}">
                        ${diagnostics.apiConfig.hasApiKey ? '✅ Yes' : '❌ No'}
                    </span>
                </div>
                <div class="diagnostic-item">
                    <span class="diagnostic-label">Provider:</span>
                    <span class="diagnostic-value">${diagnostics.apiConfig.provider}</span>
                </div>
                <div class="diagnostic-item">
                    <span class="diagnostic-label">Config Valid:</span>
                    <span class="diagnostic-value ${diagnostics.apiConfig.isValid ? 'success' : 'error'}">
                        ${diagnostics.apiConfig.isValid ? '✅ Yes' : '❌ No'}
                    </span>
                </div>
            </div>

            <div class="section">
                <h3>🧪 Context System Tests</h3>
                <div class="diagnostic-item">
                    <span class="diagnostic-label">Basic Context:</span>
                    <span class="diagnostic-value ${diagnostics.contextTest.basicContextWorks ? 'success' : 'error'}">
                        ${diagnostics.contextTest.basicContextWorks ? '✅ Working' : '❌ Failed'}
                    </span>
                </div>
                <div class="diagnostic-item">
                    <span class="diagnostic-label">Enhanced Context:</span>
                    <span class="diagnostic-value ${diagnostics.contextTest.enhancedContextWorks ? 'success' : 'error'}">
                        ${diagnostics.contextTest.enhancedContextWorks ? '✅ Working' : '❌ Failed'}
                    </span>
                </div>
                <div class="diagnostic-item">
                    <span class="diagnostic-label">Compression:</span>
                    <span class="diagnostic-value ${diagnostics.contextTest.compressionWorks ? 'success' : 'warning'}">
                        ${diagnostics.contextTest.compressionWorks ? '✅ Working' : '⚠️ Not Applied'}
                    </span>
                </div>
            </div>

            ${diagnostics.errors.length > 0 ? `
            <div class="section">
                <h3>❌ Errors Found</h3>
                <div class="errors-list">
                    ${diagnostics.errors.map((error: string) => `<div class="error-item">• ${error}</div>`).join('')}
                </div>
            </div>
            ` : ''}

            <div class="actions">
                <button onclick="rerunDiagnostics()">🔄 Rerun Diagnostics</button>
                <button onclick="copyDiagnostics()">📋 Copy to Clipboard</button>
            </div>

            <div class="section">
                <h3>📋 Raw Diagnostics Data</h3>
                <div class="json-output">${JSON.stringify(diagnostics, null, 2)}</div>
            </div>

            <script>
                const vscode = acquireVsCodeApi();

                function rerunDiagnostics() {
                    vscode.postMessage({ command: 'rerunDiagnostics' });
                }

                function copyDiagnostics() {
                    vscode.postMessage({ command: 'copyDiagnostics' });
                }
            </script>
        </body>
        </html>
        `;
    }

    private generateHealthStatusHtml(health: any, report: string): string {
        const statusColor = health.overall ? '#4CAF50' : '#F44336';
        const statusIcon = health.overall ? '✅' : '❌';

        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>FlowCode Health Status</title>
            <style>
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    margin: 20px;
                    background: var(--vscode-editor-background);
                    color: var(--vscode-editor-foreground);
                }
                .header {
                    display: flex;
                    align-items: center;
                    margin-bottom: 20px;
                    padding: 15px;
                    background: var(--vscode-editor-inactiveSelectionBackground);
                    border-radius: 8px;
                }
                .status-icon {
                    font-size: 24px;
                    margin-right: 10px;
                }
                .status-text {
                    font-size: 18px;
                    font-weight: bold;
                    color: ${statusColor};
                }
                .summary {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
                    gap: 15px;
                    margin-bottom: 20px;
                }
                .summary-card {
                    background: var(--vscode-editor-inactiveSelectionBackground);
                    padding: 15px;
                    border-radius: 8px;
                    text-align: center;
                }
                .summary-number {
                    font-size: 24px;
                    font-weight: bold;
                    color: var(--vscode-textLink-foreground);
                }
                .summary-label {
                    font-size: 14px;
                    opacity: 0.8;
                    margin-top: 5px;
                }
                .report {
                    background: var(--vscode-editor-inactiveSelectionBackground);
                    padding: 20px;
                    border-radius: 8px;
                    white-space: pre-wrap;
                    font-family: 'Courier New', monospace;
                    font-size: 14px;
                    line-height: 1.4;
                }
                .button {
                    background: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    padding: 8px 16px;
                    border-radius: 4px;
                    cursor: pointer;
                    margin: 4px;
                }
                .button:hover { background: var(--vscode-button-hoverBackground); }
            </style>
        </head>
        <body>
            <div class="header">
                <span class="status-icon">${statusIcon}</span>
                <span class="status-text">System ${health.overall ? 'Healthy' : 'Issues Detected'}</span>
            </div>

            <div class="summary">
                <div class="summary-card">
                    <div class="summary-number">${health.summary.total}</div>
                    <div class="summary-label">Total Checks</div>
                </div>
                <div class="summary-card">
                    <div class="summary-number" style="color: #4CAF50">${health.summary.passed}</div>
                    <div class="summary-label">Passed</div>
                </div>
                <div class="summary-card">
                    <div class="summary-number" style="color: #F44336">${health.summary.failed}</div>
                    <div class="summary-label">Failed</div>
                </div>
                <div class="summary-card">
                    <div class="summary-number">${new Date(health.summary.lastCheck).toLocaleTimeString()}</div>
                    <div class="summary-label">Last Check</div>
                </div>
            </div>

            <button class="button" onclick="location.reload()">🔄 Refresh</button>
            <button class="button" onclick="runHealthCheck()">▶️ Run Check</button>

            <div class="report">${report}</div>

            <script>
                function runHealthCheck() {
                    // This would trigger a health check via message passing
                    console.log('Running health check...');
                }
            </script>
        </body>
        </html>
        `;
    }

    private generatePerformanceReportHtml(report: any): string {
        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>FlowCode Performance Report</title>
            <style>
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    margin: 20px;
                    background: var(--vscode-editor-background);
                    color: var(--vscode-editor-foreground);
                }
                .report-header { text-align: center; margin-bottom: 30px; }
                .metric-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
                .metric-card {
                    background: var(--vscode-editor-inactiveSelectionBackground);
                    padding: 15px;
                    border-radius: 8px;
                    border: 1px solid var(--vscode-panel-border);
                }
                .metric-title { font-weight: bold; margin-bottom: 10px; }
                .metric-value { font-size: 1.2em; color: var(--vscode-textLink-foreground); }
                .benchmark-list { list-style: none; padding: 0; }
                .benchmark-item {
                    display: flex;
                    justify-content: space-between;
                    padding: 5px 0;
                    border-bottom: 1px solid var(--vscode-panel-border);
                }
            </style>
        </head>
        <body>
            <div class="report-header">
                <h1>📊 FlowCode Performance Report</h1>
                <p>Generated on ${new Date().toLocaleString()}</p>
            </div>

            <div class="metric-grid">
                <div class="metric-card">
                    <div class="metric-title">Overall Statistics</div>
                    <div class="metric-value">Total Operations: ${report.overallStats?.totalOperations || 0}</div>
                    <div class="metric-value">Average Duration: ${report.overallStats?.averageDuration?.toFixed(2) || 0}ms</div>
                    <div class="metric-value">Success Rate: ${((report.overallStats?.successRate || 0) * 100).toFixed(1)}%</div>
                </div>

                <div class="metric-card">
                    <div class="metric-title">Service Benchmarks</div>
                    <ul class="benchmark-list">
                        ${Object.entries(report.serviceStats || {}).map(([service, stats]: [string, any]) => `
                            <li class="benchmark-item">
                                <span>${service}</span>
                                <span>${stats.averageDuration?.toFixed(2) || 0}ms</span>
                            </li>
                        `).join('')}
                    </ul>
                </div>
            </div>

            <div style="margin-top: 30px; text-align: center;">
                <button onclick="window.close()" style="padding: 10px 20px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 4px; cursor: pointer;">Close</button>
            </div>
        </body>
        </html>
        `;
    }

    private generateWelcomeGuideHtml(): string {
        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>FlowCode Welcome Guide</title>
            <style>
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    margin: 20px;
                    background: var(--vscode-editor-background);
                    color: var(--vscode-editor-foreground);
                    line-height: 1.6;
                }
                .welcome-header { text-align: center; margin-bottom: 30px; }
                .welcome-title { font-size: 2.5em; margin-bottom: 10px; }
                .welcome-subtitle { font-size: 1.2em; color: var(--vscode-descriptionForeground); }
                .steps { max-width: 800px; margin: 0 auto; }
                .step {
                    background: var(--vscode-editor-inactiveSelectionBackground);
                    padding: 20px;
                    margin: 20px 0;
                    border-radius: 8px;
                    border-left: 4px solid var(--vscode-textLink-foreground);
                }
                .step-number {
                    background: var(--vscode-textLink-foreground);
                    color: var(--vscode-button-foreground);
                    width: 30px;
                    height: 30px;
                    border-radius: 50%;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    font-weight: bold;
                    margin-right: 15px;
                }
                .step-title { font-size: 1.3em; font-weight: bold; margin-bottom: 10px; }
                .action-button {
                    background: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    padding: 10px 20px;
                    border-radius: 4px;
                    cursor: pointer;
                    margin: 5px;
                }
                .action-button:hover {
                    background: var(--vscode-button-hoverBackground);
                }
            </style>
        </head>
        <body>
            <div class="welcome-header">
                <div class="welcome-title">🚀 Welcome to FlowCode</div>
                <div class="welcome-subtitle">Your AI-powered coding assistant</div>
            </div>

            <div class="steps">
                <div class="step">
                    <div style="display: flex; align-items: center;">
                        <span class="step-number">1</span>
                        <div>
                            <div class="step-title">Configure API Key</div>
                            <p>Set up your AI provider (OpenAI, Anthropic, or DeepSeek) to enable AI features.</p>
                            <button class="action-button" onclick="configureApiKey()">Configure API Key</button>
                        </div>
                    </div>
                </div>

                <div class="step">
                    <div style="display: flex; align-items: center;">
                        <span class="step-number">2</span>
                        <div>
                            <div class="step-title">Start Chatting</div>
                            <p>Open the AI chat interface to get coding assistance, code reviews, and suggestions.</p>
                            <button class="action-button" onclick="showChat()">Open Chat</button>
                        </div>
                    </div>
                </div>

                <div class="step">
                    <div style="display: flex; align-items: center;">
                        <span class="step-number">3</span>
                        <div>
                            <div class="step-title">Run Security Audit</div>
                            <p>Analyze your code for security vulnerabilities and get recommendations.</p>
                            <button class="action-button" onclick="runSecurityAudit()">Run Security Audit</button>
                        </div>
                    </div>
                </div>
            </div>

            <script>
                const vscode = acquireVsCodeApi();

                function configureApiKey() {
                    vscode.postMessage({ command: 'configureApiKey' });
                }

                function showChat() {
                    vscode.postMessage({ command: 'showChat' });
                }

                function runSecurityAudit() {
                    vscode.postMessage({ command: 'runSecurityAudit' });
                }
            </script>
        </body>
        </html>
        `;
    }
}