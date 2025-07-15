import * as vscode from 'vscode';
import * as path from 'path';
import { ArchitectService, RefactorOptions } from '../services/architect-service';
import { ConfigurationManager } from '../utils/configuration-manager';
import { logger } from '../utils/logger';
import { InputValidator } from '../utils/input-validator';

/**
 * Architect commands implementation for AI-powered code generation and refactoring
 */
export class ArchitectCommands {
    private static readonly contextLogger = logger.createContextLogger('ArchitectCommands');
    private architectService: ArchitectService;
    private configManager: ConfigurationManager;

    constructor(configManager: ConfigurationManager) {
        this.configManager = configManager;
        this.architectService = new ArchitectService(configManager);
    }

    /**
     * Initialize architect commands
     */
    public async initialize(): Promise<void> {
        try {
            ArchitectCommands.contextLogger.info('Initializing architect commands');
            await this.architectService.initialize();
            ArchitectCommands.contextLogger.info('Architect commands initialized successfully');
        } catch (error) {
            ArchitectCommands.contextLogger.error('Failed to initialize architect commands', error as Error);
            throw error;
        }
    }

    /**
     * Elevate to architect - main AI refactoring command
     */
    public async elevateToArchitect(): Promise<void> {
        try {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showErrorMessage('No active editor found. Please open a file to refactor.');
                return;
            }

            // Check if API key is configured
            const hasApiKey = await this.configManager.hasValidApiKey();
            if (!hasApiKey) {
                const configureAction = await vscode.window.showErrorMessage(
                    'AI API key not configured. Please configure your API key to use Architect features.',
                    'Configure API Key',
                    'Cancel'
                );

                if (configureAction === 'Configure API Key') {
                    await vscode.commands.executeCommand('flowcode.configureApiKey');
                }
                return;
            }

            const selection = editor.selection;
            const selectedText = editor.document.getText(selection);
            
            if (!selectedText.trim()) {
                vscode.window.showErrorMessage('Please select code to refactor.');
                return;
            }

            // Validate selected code
            const codeValidation = InputValidator.validateCodeContent(selectedText);
            if (!codeValidation.isValid) {
                vscode.window.showErrorMessage(`Invalid code selection: ${codeValidation.errors.join(', ')}`);
                return;
            }

            const language = this.detectLanguage(editor.document.languageId);
            if (!language) {
                vscode.window.showErrorMessage('Unsupported language for AI refactoring.');
                return;
            }

            // Get refactoring options from user
            const refactorOptions = await this.getRefactorOptions(language);
            if (!refactorOptions) {
                return; // User cancelled
            }

            ArchitectCommands.contextLogger.info('Starting AI refactoring', {
                language,
                codeLength: selectedText.length,
                refactorType: refactorOptions.refactorType
            });

            // Show progress and run refactoring
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "🏗️ FlowCode Architect",
                cancellable: true
            }, async (progress, token) => {
                token.onCancellationRequested(() => {
                    ArchitectCommands.contextLogger.info('AI refactoring cancelled by user');
                });

                progress.report({ message: "Analyzing code structure...", increment: 20 });
                
                try {
                    const refactoredCode = await this.architectService.refactorCode(selectedText, refactorOptions);
                    
                    if (!refactoredCode) {
                        throw new Error('AI service returned empty result');
                    }

                    progress.report({ message: "Applying refactored code...", increment: 80 });
                    
                    // Apply the refactored code
                    await this.applyRefactoredCode(editor, selection, refactoredCode);
                    
                    progress.report({ message: "Refactoring completed", increment: 100 });
                    
                    vscode.window.showInformationMessage('✅ Code refactoring completed successfully!');
                    
                } catch (error) {
                    ArchitectCommands.contextLogger.error('AI refactoring failed', error as Error);
                    vscode.window.showErrorMessage(`AI refactoring failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
                }
            });

        } catch (error) {
            ArchitectCommands.contextLogger.error('Failed to elevate to architect', error as Error);
            vscode.window.showErrorMessage(`Failed to elevate to architect: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Generate code from description
     */
    public async generateCode(): Promise<void> {
        try {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showErrorMessage('No active editor found. Please open a file to generate code.');
                return;
            }

            // Check if API key is configured
            const hasApiKey = await this.configManager.hasValidApiKey();
            if (!hasApiKey) {
                const configureAction = await vscode.window.showErrorMessage(
                    'AI API key not configured. Please configure your API key to use Architect features.',
                    'Configure API Key',
                    'Cancel'
                );

                if (configureAction === 'Configure API Key') {
                    await vscode.commands.executeCommand('flowcode.configureApiKey');
                }
                return;
            }

            const language = this.detectLanguage(editor.document.languageId);
            if (!language) {
                vscode.window.showErrorMessage('Unsupported language for code generation.');
                return;
            }

            // Get code description from user
            const description = await vscode.window.showInputBox({
                prompt: 'Describe the code you want to generate',
                placeHolder: 'e.g., "Create a function that validates email addresses"',
                validateInput: (value) => {
                    if (!value.trim()) {
                        return 'Please provide a description';
                    }
                    if (value.length < 10) {
                        return 'Please provide a more detailed description';
                    }
                    return null;
                }
            });

            if (!description) {
                return; // User cancelled
            }

            ArchitectCommands.contextLogger.info('Starting code generation', {
                language,
                descriptionLength: description.length
            });

            // Show progress and generate code
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "🏗️ FlowCode Architect - Generating Code",
                cancellable: true
            }, async (progress, token) => {
                token.onCancellationRequested(() => {
                    ArchitectCommands.contextLogger.info('Code generation cancelled by user');
                });

                progress.report({ message: "Generating code...", increment: 50 });
                
                try {
                    const refactorOptions: RefactorOptions = {
                        language,
                        refactorType: 'generate',
                        description,
                        includeComments: true,
                        includeTests: false
                    };

                    const generatedCode = await this.architectService.refactorCode(description, refactorOptions);
                    
                    if (!generatedCode) {
                        throw new Error('AI service returned empty result');
                    }

                    progress.report({ message: "Inserting generated code...", increment: 90 });
                    
                    // Insert the generated code at cursor position
                    await this.insertGeneratedCode(editor, generatedCode);
                    
                    progress.report({ message: "Code generation completed", increment: 100 });
                    
                    vscode.window.showInformationMessage('✅ Code generation completed successfully!');
                    
                } catch (error) {
                    ArchitectCommands.contextLogger.error('Code generation failed', error as Error);
                    vscode.window.showErrorMessage(`Code generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
                }
            });

        } catch (error) {
            ArchitectCommands.contextLogger.error('Failed to generate code', error as Error);
            vscode.window.showErrorMessage(`Failed to generate code: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Get refactoring options from user
     */
    private async getRefactorOptions(language: string): Promise<RefactorOptions | null> {
        const refactorType = await vscode.window.showQuickPick([
            { label: 'Optimize Performance', value: 'optimize' },
            { label: 'Improve Readability', value: 'readability' },
            { label: 'Add Error Handling', value: 'error-handling' },
            { label: 'Add Documentation', value: 'documentation' },
            { label: 'Modernize Code', value: 'modernize' },
            { label: 'Custom Refactoring', value: 'custom' }
        ], {
            placeHolder: 'Select refactoring type'
        });

        if (!refactorType) {
            return null;
        }

        let description = '';
        if (refactorType.value === 'custom') {
            const customDescription = await vscode.window.showInputBox({
                prompt: 'Describe the custom refactoring you want',
                placeHolder: 'e.g., "Convert to async/await pattern"'
            });

            if (!customDescription) {
                return null;
            }
            description = customDescription;
        }

        const includeComments = await vscode.window.showQuickPick([
            { label: 'Yes', value: true },
            { label: 'No', value: false }
        ], {
            placeHolder: 'Include detailed comments?'
        });

        if (includeComments === undefined) {
            return null;
        }

        return {
            language,
            refactorType: refactorType.value,
            description,
            includeComments: includeComments.value,
            includeTests: false
        };
    }

    /**
     * Apply refactored code to editor
     */
    private async applyRefactoredCode(editor: vscode.TextEditor, selection: vscode.Selection, refactoredCode: string): Promise<void> {
        await editor.edit(editBuilder => {
            editBuilder.replace(selection, refactoredCode);
        });
    }

    /**
     * Insert generated code at cursor position
     */
    private async insertGeneratedCode(editor: vscode.TextEditor, generatedCode: string): Promise<void> {
        await editor.edit(editBuilder => {
            editBuilder.insert(editor.selection.active, generatedCode);
        });
    }

    /**
     * Detect language from VS Code language ID
     */
    private detectLanguage(languageId: string): string | null {
        const languageMap: { [key: string]: string } = {
            'typescript': 'typescript',
            'javascript': 'javascript',
            'typescriptreact': 'typescript',
            'javascriptreact': 'javascript',
            'python': 'python',
            'java': 'java',
            'csharp': 'csharp',
            'go': 'go',
            'rust': 'rust',
            'php': 'php',
            'ruby': 'ruby'
        };

        return languageMap[languageId] || null;
    }
}
