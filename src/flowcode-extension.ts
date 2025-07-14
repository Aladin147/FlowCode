import * as vscode from 'vscode';
import { CompanionGuard } from './services/companion-guard';
import { FinalGuard } from './services/final-guard';
import { ArchitectService } from './services/architect-service';
import { GraphService } from './services/graph-service';
import { HotfixService } from './services/hotfix-service';
import { StatusBarManager } from './ui/status-bar-manager';
import { ConfigurationManager } from './utils/configuration-manager';

export class FlowCodeExtension {
    private companionGuard: CompanionGuard;
    private finalGuard: FinalGuard;
    private architectService: ArchitectService;
    private graphService: GraphService;
    private hotfixService: HotfixService;
    private statusBarManager: StatusBarManager;
    private configManager: ConfigurationManager;

    constructor(private context: vscode.ExtensionContext) {
        this.configManager = new ConfigurationManager();
        this.statusBarManager = new StatusBarManager();
        this.companionGuard = new CompanionGuard(this.configManager);
        this.finalGuard = new FinalGuard(this.configManager);
        this.architectService = new ArchitectService(this.configManager);
        this.graphService = new GraphService();
        this.hotfixService = new HotfixService(this.configManager);
    }

    public async activate(): Promise<void> {
        try {
            await this.configManager.validateConfiguration();
            await this.initializeServices();
            this.statusBarManager.showReady();
            vscode.window.showInformationMessage('FlowCode activated successfully!');
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            this.statusBarManager.showError(message);
            vscode.window.showErrorMessage(`FlowCode activation failed: ${message}`);
        }
    }

    public async deactivate(): Promise<void> {
        this.companionGuard.dispose();
        this.statusBarManager.dispose();
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
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor found');
            return;
        }

        const selection = editor.selection;
        const selectedText = editor.document.getText(selection);
        
        if (!selectedText.trim()) {
            vscode.window.showErrorMessage('Please select code to refactor');
            return;
        }

        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "Elevating to Architect...",
                cancellable: false
            }, async () => {
                const result = await this.architectService.refactor(selectedText, {
                    language: editor.document.languageId,
                    filePath: editor.document.uri.fsPath
                });
                
                if (result) {
                    await editor.edit(editBuilder => {
                        editBuilder.replace(selection, result);
                    });
                    vscode.window.showInformationMessage('Refactoring completed!');
                }
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            vscode.window.showErrorMessage(`Architect service failed: ${message}`);
        }
    }

    public async createHotfix(): Promise<void> {
        const message = await vscode.window.showInputBox({
            prompt: 'Enter hotfix commit message',
            placeHolder: 'Fix critical bug in authentication'
        });

        if (!message) {
            return;
        }

        try {
            await this.hotfixService.createHotfix(message);
            vscode.window.showInformationMessage('Hotfix created successfully!');
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            vscode.window.showErrorMessage(`Hotfix creation failed: ${message}`);
        }
    }

    public async showCodeGraph(): Promise<void> {
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
        const provider = await vscode.window.showQuickPick(['OpenAI', 'Anthropic'], {
            placeHolder: 'Select your AI provider'
        });

        if (!provider) {
            return;
        }

        const apiKey = await vscode.window.showInputBox({
            prompt: `Enter your ${provider} API key`,
            password: true,
            validateInput: (value) => {
                if (!value || value.length < 10) {
                    return 'Please enter a valid API key';
                }
                return null;
            }
        });

        if (apiKey) {
            await this.configManager.setApiConfiguration(
                provider.toLowerCase() as 'openai' | 'anthropic',
                apiKey
            );
            vscode.window.showInformationMessage('API key configured successfully!');
        }
    }

    private async initializeServices(): Promise<void> {
        await this.companionGuard.initialize();
        await this.finalGuard.initialize();
    }

    private async initializeGitHooks(): Promise<void> {
        // Git hooks initialization will be implemented here
        // This includes setting up pre-commit and pre-push hooks
    }
}