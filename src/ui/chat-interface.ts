import * as vscode from 'vscode';
import { logger } from '../utils/logger';
import { ArchitectService } from '../services/architect-service';
import { CompanionGuard } from '../services/companion-guard';
import { SecurityValidatorService } from '../services/security-validator';
import { GraphService } from '../services/graph-service';
import { HotfixService } from '../services/hotfix-service';
import { ConfigurationManager } from '../utils/configuration-manager';

export interface ChatMessage {
    id: string;
    type: 'user' | 'assistant' | 'system' | 'action-request' | 'code-diff';
    content: string;
    timestamp: number;
    threadId?: string; // For message threading
    parentId?: string; // For reply chains
    status?: 'pending' | 'streaming' | 'complete' | 'error';
    metadata?: {
        files?: string[];
        securityWarnings?: string[];
        qualityIssues?: string[];
        cost?: number;
        tokens?: number;
        actions?: ChatAction[];
        diffs?: CodeDiff[];
    };
}

export interface ChatAction {
    id: string;
    type: 'file-create' | 'file-edit' | 'file-delete' | 'command-run' | 'security-check';
    description: string;
    data: any;
    approved?: boolean;
    executed?: boolean;
}

export interface CodeDiff {
    id: string;
    filePath: string;
    oldContent: string;
    newContent: string;
    applied?: boolean;
}

export interface ChatThread {
    id: string;
    title: string;
    messages: ChatMessage[];
    createdAt: number;
    updatedAt: number;
    archived?: boolean;
}

export interface ChatContext {
    activeFile?: string;
    workspaceRoot?: string;
    selectedText?: string;
    recentFiles?: string[];
    companionGuardStatus?: any;
}

export class ChatInterface {
    private contextLogger = logger.createContextLogger('ChatInterface');
    private panel: vscode.WebviewPanel | undefined;
    private messages: ChatMessage[] = [];
    private threads: ChatThread[] = [];
    private currentThreadId: string | undefined;
    private isStreaming = false;
    private currentStreamingMessage: ChatMessage | undefined;
    private messageHistory: Map<string, ChatMessage[]> = new Map();

    constructor(
        private architectService: ArchitectService,
        private companionGuard: CompanionGuard,
        private securityValidator: SecurityValidatorService,
        private graphService: GraphService,
        private hotfixService: HotfixService,
        private configManager: ConfigurationManager
    ) {
        this.loadMessageHistory();
    }

    /**
     * Show chat interface
     */
    public async show(): Promise<void> {
        try {
            // Create panel if it doesn't exist
            if (!this.panel) {
                this.panel = vscode.window.createWebviewPanel(
                    'flowcodeChat',
                    'FlowCode AI Assistant',
                    vscode.ViewColumn.Beside,
                    {
                        enableScripts: true,
                        retainContextWhenHidden: true,
                        localResourceRoots: []
                    }
                );

                // Handle panel disposal
                this.panel.onDidDispose(() => {
                    this.panel = undefined;
                    this.saveMessageHistory();
                }, null, []);

                // Handle messages from webview
                this.panel.webview.onDidReceiveMessage(message => {
                    this.handleWebviewMessage(message);
                });

                // Listen for active editor changes for context awareness
                vscode.window.onDidChangeActiveTextEditor(() => {
                    this.updateContext();
                });

                // Listen for companion guard updates
                this.companionGuard.onStatusChange(() => {
                    this.updateContext();
                });
            }

            // Set initial content
            await this.updateWebviewContent();

            // Reveal panel
            this.panel.reveal(vscode.ViewColumn.Beside);

        } catch (error) {
            this.contextLogger.error('Failed to show chat interface', error as Error);
            vscode.window.showErrorMessage('Failed to show FlowCode chat interface');
        }
    }

    /**
     * Handle messages from webview
     */
    private async handleWebviewMessage(message: any): Promise<void> {
        switch (message.command) {
            case 'sendMessage':
                await this.handleUserMessage(message.content, message.context);
                break;

            case 'clearChat':
                this.messages = [];
                await this.updateWebviewContent();
                break;

            case 'addContext':
                await this.handleAddContext(message.type, message.value);
                break;

            case 'approveAction':
                await this.handleActionApproval(message.actionId, true);
                break;

            case 'rejectAction':
                await this.handleActionApproval(message.actionId, false);
                break;

            case 'copyCode':
                await vscode.env.clipboard.writeText(message.code);
                vscode.window.showInformationMessage('Code copied to clipboard');
                break;

            case 'applyDiff':
                await this.handleApplyDiff(message.diffId);
                break;

            case 'showDependencies':
                await this.handleShowDependencies(message.symbolName, message.filePath);
                break;

            case 'analyzeImpact':
                await this.handleAnalyzeImpact(message.symbolName, message.filePath);
                break;

            case 'showArchitecture':
                await this.handleShowArchitecture(message.filePath);
                break;

            case 'elevateToArchitect':
                await this.handleElevateToArchitect(message.filePath, message.selectedCode);
                break;

            case 'showDebtSummary':
                await this.handleShowDebtSummary();
                break;

            case 'analyzeFileDebt':
                await this.handleAnalyzeFileDebt(message.filePath);
                break;

            case 'getProactiveDebtSuggestions':
                await this.handleProactiveDebtSuggestions();
                break;
        }
    }

    /**
     * Handle user message
     */
    private async handleUserMessage(content: string, context?: any): Promise<void> {
        try {
            // Add user message
            const userMessage: ChatMessage = {
                id: this.generateMessageId(),
                type: 'user',
                content,
                timestamp: Date.now(),
                metadata: {
                    files: context?.files || []
                }
            };

            this.messages.push(userMessage);
            await this.updateWebviewContent();

            // Get current context
            const chatContext = await this.getCurrentContext();

            // Start streaming response
            this.isStreaming = true;
            const assistantMessage: ChatMessage = {
                id: this.generateMessageId(),
                type: 'assistant',
                content: '',
                timestamp: Date.now(),
                metadata: {}
            };

            this.currentStreamingMessage = assistantMessage;
            this.messages.push(assistantMessage);
            await this.updateWebviewContent();

            // Get AI response with security validation
            const response = await this.getAIResponse(content, chatContext);
            
            // Update message with final response
            assistantMessage.content = response.content;
            assistantMessage.metadata = response.metadata;
            
            this.isStreaming = false;
            this.currentStreamingMessage = undefined;
            await this.updateWebviewContent();

        } catch (error) {
            this.contextLogger.error('Failed to handle user message', error as Error);
            this.addSystemMessage('Error processing your message. Please try again.');
            this.isStreaming = false;
            this.currentStreamingMessage = undefined;
        }
    }

    /**
     * Get AI response with security validation and dependency analysis
     */
    private async getAIResponse(userMessage: string, context: ChatContext): Promise<{content: string, metadata: any}> {
        try {
            // Get dependency analysis and debt information if we have an active file
            let dependencyAnalysis = null;
            let architecturalInsights = null;
            let debtAnalysis = null;
            let proactiveDebtSuggestions = null;

            if (context.activeFile) {
                try {
                    // Get architectural insights for the current file
                    architecturalInsights = await this.graphService.getArchitecturalInsights(context.activeFile);

                    // Get debt analysis for the current file
                    debtAnalysis = await this.hotfixService.analyzeFileDebtImpact(context.activeFile);

                    // Get proactive debt suggestions if user is asking about refactoring or improvements
                    const isRefactoringQuery = /\b(refactor|improve|optimize|clean|debt|technical debt|hotfix)\b/i.test(userMessage);
                    if (isRefactoringQuery) {
                        proactiveDebtSuggestions = await this.hotfixService.getProactiveDebtSuggestions();
                    }

                    // If the user is asking about a specific symbol, get dependency info
                    const symbolMatch = userMessage.match(/\b(function|class|method|variable)\s+(\w+)/i);
                    if (symbolMatch && context.activeFile && symbolMatch[2]) {
                        const symbolName = symbolMatch[2];
                        dependencyAnalysis = await this.graphService.getDependencies(symbolName, context.activeFile);
                    }
                } catch (error) {
                    this.contextLogger.warn('Failed to get analysis data', error as Error);
                }
            }

            // Prepare enhanced context for AI
            const aiContext = {
                userMessage,
                activeFile: context.activeFile,
                workspaceRoot: context.workspaceRoot,
                companionGuardStatus: context.companionGuardStatus,
                recentFiles: context.recentFiles,
                dependencyAnalysis,
                architecturalInsights,
                debtAnalysis,
                proactiveDebtSuggestions
            };

            // Get response from architect service
            const response = await this.architectService.generateResponse(aiContext);

            // Validate security of any code suggestions
            const securityValidation = await this.securityValidator.validateCodeSuggestion(response.content);

            // Prepare enhanced metadata
            const metadata = {
                cost: response.cost || 0,
                tokens: response.tokens || 0,
                securityWarnings: securityValidation.warnings || [],
                qualityIssues: context.companionGuardStatus?.issues || [],
                dependencyAnalysis,
                architecturalInsights,
                debtAnalysis,
                proactiveDebtSuggestions
            };

            return {
                content: response.content,
                metadata
            };

        } catch (error) {
            this.contextLogger.error('Failed to get AI response', error as Error);
            throw error;
        }
    }

    /**
     * Get current context for AI
     */
    private async getCurrentContext(): Promise<ChatContext> {
        const activeEditor = vscode.window.activeTextEditor;
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        
        return {
            activeFile: activeEditor?.document.fileName,
            workspaceRoot,
            selectedText: activeEditor?.document.getText(activeEditor.selection),
            recentFiles: await this.getRecentFiles(),
            companionGuardStatus: await this.companionGuard.getStatus()
        };
    }

    /**
     * Get recent files
     */
    private async getRecentFiles(): Promise<string[]> {
        // Implementation would get recently opened files
        // For now, return empty array
        return [];
    }

    /**
     * Add system message
     */
    private async addSystemMessage(content: string): Promise<void> {
        const systemMessage: ChatMessage = {
            id: this.generateMessageId(),
            type: 'system',
            content,
            timestamp: Date.now()
        };

        this.messages.push(systemMessage);
        await this.updateWebviewContent();
    }

    /**
     * Update context and refresh webview
     */
    private async updateContext(): Promise<void> {
        if (this.panel) {
            const context = await this.getCurrentContext();
            this.panel.webview.postMessage({
                command: 'updateContext',
                context
            });
        }
    }

    /**
     * Handle add context commands (@file, @folder, etc.)
     */
    private async handleAddContext(type: string, value: string): Promise<void> {
        try {
            switch (type) {
                case 'file':
                    await this.addFileContext(value);
                    break;
                case 'folder':
                    await this.addFolderContext(value);
                    break;
                case 'problems':
                    await this.addProblemsContext();
                    break;
                case 'url':
                    await this.addUrlContext(value);
                    break;
                default:
                    this.contextLogger.warn(`Unknown context type: ${type}`);
            }
        } catch (error) {
            this.contextLogger.error(`Failed to add ${type} context`, error as Error);
            await this.addSystemMessage(`Failed to add ${type} context: ${(error as Error).message}`);
        }
    }

    /**
     * Add file context to chat
     */
    private async addFileContext(filePath?: string): Promise<void> {
        try {
            let targetFile = filePath;

            if (!targetFile) {
                // Show file picker
                const files = await vscode.workspace.findFiles('**/*', '**/node_modules/**', 100);
                const fileItems = files.map(file => ({
                    label: vscode.workspace.asRelativePath(file),
                    description: file.fsPath,
                    uri: file
                }));

                const selected = await vscode.window.showQuickPick(fileItems, {
                    placeHolder: 'Select a file to add to context'
                });

                if (!selected) return;
                targetFile = selected.uri.fsPath;
            }

            // Read file content
            const document = await vscode.workspace.openTextDocument(targetFile);
            const content = document.getText();

            // Add context message
            const contextMessage: ChatMessage = {
                id: this.generateMessageId(),
                type: 'system',
                content: `📄 Added file context: ${vscode.workspace.asRelativePath(targetFile)}\n\n\`\`\`${document.languageId}\n${content}\n\`\`\``,
                timestamp: Date.now(),
                metadata: {
                    files: [targetFile]
                }
            };

            this.messages.push(contextMessage);
            await this.updateWebviewContent();

        } catch (error) {
            throw new Error(`Failed to read file: ${(error as Error).message}`);
        }
    }

    /**
     * Add folder context to chat
     */
    private async addFolderContext(folderPath?: string): Promise<void> {
        try {
            let targetFolder = folderPath;

            if (!targetFolder) {
                // Show folder picker
                const folders = await vscode.window.showOpenDialog({
                    canSelectFiles: false,
                    canSelectFolders: true,
                    canSelectMany: false,
                    openLabel: 'Select Folder'
                });

                if (!folders || folders.length === 0) return;
                targetFolder = folders[0]?.fsPath;
                if (!targetFolder) return;
            }

            // Get folder structure
            const files = await vscode.workspace.findFiles(
                new vscode.RelativePattern(targetFolder, '**/*'),
                '**/node_modules/**',
                50
            );

            const fileList = files
                .map(file => vscode.workspace.asRelativePath(file))
                .sort()
                .slice(0, 20); // Limit to first 20 files

            const contextMessage: ChatMessage = {
                id: this.generateMessageId(),
                type: 'system',
                content: `📁 Added folder context: ${vscode.workspace.asRelativePath(targetFolder)}\n\nFiles (showing first 20):\n${fileList.map(f => `- ${f}`).join('\n')}${files.length > 20 ? `\n... and ${files.length - 20} more files` : ''}`,
                timestamp: Date.now(),
                metadata: {
                    files: files.map(f => f.fsPath)
                }
            };

            this.messages.push(contextMessage);
            await this.updateWebviewContent();

        } catch (error) {
            throw new Error(`Failed to read folder: ${(error as Error).message}`);
        }
    }

    /**
     * Add problems context to chat
     */
    private async addProblemsContext(): Promise<void> {
        try {
            const diagnostics = vscode.languages.getDiagnostics();
            const problems: string[] = [];

            for (const [uri, diags] of diagnostics) {
                if (diags.length > 0) {
                    const relativePath = vscode.workspace.asRelativePath(uri);
                    problems.push(`\n**${relativePath}:**`);

                    diags.forEach(diag => {
                        const severity = diag.severity === vscode.DiagnosticSeverity.Error ? '❌' :
                                       diag.severity === vscode.DiagnosticSeverity.Warning ? '⚠️' : 'ℹ️';
                        problems.push(`  ${severity} Line ${diag.range.start.line + 1}: ${diag.message}`);
                    });
                }
            }

            const contextMessage: ChatMessage = {
                id: this.generateMessageId(),
                type: 'system',
                content: problems.length > 0
                    ? `🔍 Current workspace problems:\n${problems.join('\n')}`
                    : '✅ No problems found in workspace',
                timestamp: Date.now()
            };

            this.messages.push(contextMessage);
            await this.updateWebviewContent();

        } catch (error) {
            throw new Error(`Failed to get problems: ${(error as Error).message}`);
        }
    }

    /**
     * Add URL context to chat
     */
    private async addUrlContext(url: string): Promise<void> {
        try {
            if (!url) {
                url = await vscode.window.showInputBox({
                    prompt: 'Enter URL to fetch and add to context',
                    placeHolder: 'https://example.com'
                }) || '';
            }

            if (!url) return;

            // Simple URL validation
            if (!url.startsWith('http://') && !url.startsWith('https://')) {
                throw new Error('URL must start with http:// or https://');
            }

            const contextMessage: ChatMessage = {
                id: this.generateMessageId(),
                type: 'system',
                content: `🌐 URL context added: ${url}\n\n(Note: URL fetching not implemented in this version. Please copy and paste the content manually.)`,
                timestamp: Date.now()
            };

            this.messages.push(contextMessage);
            await this.updateWebviewContent();

        } catch (error) {
            throw new Error(`Failed to add URL context: ${(error as Error).message}`);
        }
    }

    /**
     * Handle action approval/rejection
     */
    private async handleActionApproval(actionId: string, approved: boolean): Promise<void> {
        this.contextLogger.info(`Action ${actionId} ${approved ? 'approved' : 'rejected'}`);
    }

    /**
     * Handle applying code diffs
     */
    private async handleApplyDiff(diffId: string): Promise<void> {
        this.contextLogger.info(`Applying diff: ${diffId}`);
    }

    /**
     * Handle show dependencies request
     */
    private async handleShowDependencies(symbolName?: string, filePath?: string): Promise<void> {
        try {
            const activeFile = filePath || vscode.window.activeTextEditor?.document.fileName;
            if (!activeFile) {
                await this.addSystemMessage('No active file to analyze dependencies for.');
                return;
            }

            if (!symbolName) {
                // Ask user to select a symbol
                const symbols = await this.getSymbolsFromFile(activeFile);
                if (symbols.length === 0) {
                    await this.addSystemMessage('No symbols found in the current file.');
                    return;
                }

                const selected = await vscode.window.showQuickPick(
                    symbols.map(s => ({ label: s.name, description: s.type, detail: s.signature })),
                    { placeHolder: 'Select a symbol to analyze dependencies' }
                );

                if (!selected) return;
                symbolName = selected.label;
            }

            // Get dependency analysis
            const analysis = await this.graphService.getDependencies(symbolName, activeFile);

            // Create dependency report
            let report = `🔗 **Dependency Analysis for \`${symbolName}\`**\n\n`;

            if (analysis.dependencies.length > 0) {
                report += `**Dependencies (${analysis.dependencies.length}):**\n`;
                analysis.dependencies.forEach(dep => {
                    report += `- \`${dep.name}\` (${dep.type}) in ${vscode.workspace.asRelativePath(dep.file)}\n`;
                });
                report += '\n';
            }

            if (analysis.dependents.length > 0) {
                report += `**Dependents (${analysis.dependents.length}):**\n`;
                analysis.dependents.forEach(dep => {
                    report += `- \`${dep.name}\` (${dep.type}) in ${vscode.workspace.asRelativePath(dep.file)}\n`;
                });
                report += '\n';
            }

            if (analysis.dependencies.length === 0 && analysis.dependents.length === 0) {
                report += 'No dependencies or dependents found.';
            }

            await this.addSystemMessage(report);

        } catch (error) {
            this.contextLogger.error('Failed to show dependencies', error as Error);
            await this.addSystemMessage(`Failed to analyze dependencies: ${(error as Error).message}`);
        }
    }

    /**
     * Handle analyze impact request
     */
    private async handleAnalyzeImpact(symbolName?: string, filePath?: string): Promise<void> {
        try {
            const activeFile = filePath || vscode.window.activeTextEditor?.document.fileName;
            if (!activeFile) {
                await this.addSystemMessage('No active file to analyze impact for.');
                return;
            }

            if (!symbolName) {
                const symbols = await this.getSymbolsFromFile(activeFile);
                if (symbols.length === 0) {
                    await this.addSystemMessage('No symbols found in the current file.');
                    return;
                }

                const selected = await vscode.window.showQuickPick(
                    symbols.map(s => ({ label: s.name, description: s.type, detail: s.signature })),
                    { placeHolder: 'Select a symbol to analyze change impact' }
                );

                if (!selected) return;
                symbolName = selected.label;
            }

            // Get impact analysis
            const impact = await this.graphService.analyzeChangeImpact(symbolName, activeFile);

            // Create impact report
            let report = `⚠️ **Change Impact Analysis for \`${symbolName}\`**\n\n`;
            report += `**Risk Level:** ${impact.riskLevel.toUpperCase()}\n\n`;

            if (impact.directImpact.length > 0) {
                report += `**Direct Impact (${impact.directImpact.length} items):**\n`;
                impact.directImpact.forEach(item => {
                    report += `- \`${item.name}\` (${item.type}) in ${vscode.workspace.asRelativePath(item.file)}\n`;
                });
                report += '\n';
            }

            if (impact.indirectImpact.length > 0) {
                report += `**Indirect Impact (${impact.indirectImpact.length} items):**\n`;
                impact.indirectImpact.forEach(item => {
                    report += `- \`${item.name}\` (${item.type}) in ${vscode.workspace.asRelativePath(item.file)}\n`;
                });
                report += '\n';
            }

            if (impact.affectedFiles.length > 0) {
                report += `**Affected Files (${impact.affectedFiles.length}):**\n`;
                impact.affectedFiles.forEach(file => {
                    report += `- ${vscode.workspace.asRelativePath(file)}\n`;
                });
            }

            await this.addSystemMessage(report);

        } catch (error) {
            this.contextLogger.error('Failed to analyze impact', error as Error);
            await this.addSystemMessage(`Failed to analyze impact: ${(error as Error).message}`);
        }
    }

    /**
     * Handle show architecture request
     */
    private async handleShowArchitecture(filePath?: string): Promise<void> {
        try {
            const activeFile = filePath || vscode.window.activeTextEditor?.document.fileName;
            if (!activeFile) {
                await this.addSystemMessage('No active file to analyze architecture for.');
                return;
            }

            // Get architectural insights
            const insights = await this.graphService.getArchitecturalInsights(activeFile);

            // Create architecture report
            let report = `🏗️ **Architectural Analysis for \`${vscode.workspace.asRelativePath(activeFile)}\`**\n\n`;
            report += `**Complexity Score:** ${insights.complexity.toFixed(2)}\n`;
            report += `**Coupling Score:** ${(insights.coupling * 100).toFixed(1)}%\n`;
            report += `**Cohesion Score:** ${(insights.cohesion * 100).toFixed(1)}%\n\n`;

            if (insights.suggestions.length > 0) {
                report += `**Suggestions:**\n`;
                insights.suggestions.forEach(suggestion => {
                    report += `- ${suggestion}\n`;
                });
            } else {
                report += '✅ No architectural issues detected.';
            }

            await this.addSystemMessage(report);

        } catch (error) {
            this.contextLogger.error('Failed to show architecture', error as Error);
            await this.addSystemMessage(`Failed to analyze architecture: ${(error as Error).message}`);
        }
    }

    /**
     * Handle Elevate to Architect request
     */
    private async handleElevateToArchitect(filePath?: string, selectedCode?: string): Promise<void> {
        try {
            const activeFile = filePath || vscode.window.activeTextEditor?.document.fileName;
            if (!activeFile) {
                await this.addSystemMessage('No active file to analyze for architectural elevation.');
                return;
            }

            // Get selected code if not provided
            if (!selectedCode) {
                const editor = vscode.window.activeTextEditor;
                if (editor && !editor.selection.isEmpty) {
                    selectedCode = editor.document.getText(editor.selection);
                }
            }

            // Show progress message
            await this.addSystemMessage('🚀 **Elevating to Architect** - Analyzing code architecture...');

            // Get comprehensive analysis
            const result = await this.architectService.elevateToArchitect(activeFile, selectedCode);

            // Create comprehensive report
            let report = `🏗️ **Architect Analysis Complete**\n\n`;

            // Add architectural metrics
            if (result.analysis) {
                report += `**Architectural Metrics:**\n`;
                report += `- Complexity: ${result.analysis.complexity.toFixed(2)}\n`;
                report += `- Coupling: ${(result.analysis.coupling * 100).toFixed(1)}%\n`;
                report += `- Cohesion: ${(result.analysis.cohesion * 100).toFixed(1)}%\n\n`;
            }

            // Add suggestions
            if (result.suggestions.length > 0) {
                report += `**Refactoring Suggestions (${result.suggestions.length}):**\n\n`;

                const highPriority = result.suggestions.filter(s => s.priority === 'high');
                const mediumPriority = result.suggestions.filter(s => s.priority === 'medium');
                const lowPriority = result.suggestions.filter(s => s.priority === 'low');

                if (highPriority.length > 0) {
                    report += `**🔴 High Priority:**\n`;
                    highPriority.forEach(s => {
                        report += `- **${s.title}**: ${s.description}\n`;
                        report += `  *Reason*: ${s.reason}\n`;
                        report += `  *Impact*: ${s.impact}\n\n`;
                    });
                }

                if (mediumPriority.length > 0) {
                    report += `**🟡 Medium Priority:**\n`;
                    mediumPriority.forEach(s => {
                        report += `- **${s.title}**: ${s.description}\n`;
                        report += `  *Reason*: ${s.reason}\n\n`;
                    });
                }

                if (lowPriority.length > 0) {
                    report += `**🟢 Low Priority:**\n`;
                    lowPriority.forEach(s => {
                        report += `- **${s.title}**: ${s.description}\n`;
                    });
                }
            }

            // Add action plan
            if (result.actionPlan.length > 0) {
                report += `\n**Action Plan:**\n`;
                result.actionPlan.forEach(step => {
                    report += `${step}\n`;
                });
            }

            await this.addSystemMessage(report);

        } catch (error) {
            this.contextLogger.error('Failed to elevate to architect', error as Error);
            await this.addSystemMessage(`Failed to elevate to architect: ${(error as Error).message}`);
        }
    }

    /**
     * Handle show debt summary request
     */
    private async handleShowDebtSummary(): Promise<void> {
        try {
            const debtSummary = await this.hotfixService.getDebtSummary();

            let report = `💳 **Technical Debt Summary**\n\n`;
            report += `**Overall Risk Level:** ${debtSummary.riskLevel.toUpperCase()}\n\n`;
            report += `**Debt Metrics:**\n`;
            report += `- Total Pending Hotfixes: ${debtSummary.totalDebt}\n`;
            report += `- Critical Priority: ${debtSummary.criticalDebt}\n`;
            report += `- Overdue Items: ${debtSummary.overdueDebt}\n`;
            report += `- Average Age: ${debtSummary.averageAge.toFixed(1)} hours\n\n`;

            if (debtSummary.slaWarnings.length > 0) {
                report += `**⚠️ SLA Warnings:**\n`;
                debtSummary.slaWarnings.forEach(warning => {
                    report += `- ${warning}\n`;
                });
                report += '\n';
            }

            // Add recommendations based on risk level
            if (debtSummary.riskLevel === 'critical') {
                report += `**🚨 Immediate Actions Required:**\n`;
                report += `- Address overdue hotfixes immediately\n`;
                report += `- Escalate critical items to team leads\n`;
                report += `- Consider code freeze until debt is reduced\n`;
            } else if (debtSummary.riskLevel === 'high') {
                report += `**⚠️ Recommended Actions:**\n`;
                report += `- Prioritize critical hotfixes in next sprint\n`;
                report += `- Review and resolve oldest items first\n`;
                report += `- Monitor SLA compliance closely\n`;
            } else if (debtSummary.totalDebt > 0) {
                report += `**📋 Maintenance Recommendations:**\n`;
                report += `- Schedule regular debt reduction sessions\n`;
                report += `- Address items before they become critical\n`;
            } else {
                report += `✅ **Excellent!** No pending technical debt detected.`;
            }

            await this.addSystemMessage(report);

        } catch (error) {
            this.contextLogger.error('Failed to show debt summary', error as Error);
            await this.addSystemMessage(`Failed to get debt summary: ${(error as Error).message}`);
        }
    }

    /**
     * Handle analyze file debt request
     */
    private async handleAnalyzeFileDebt(filePath?: string): Promise<void> {
        try {
            const activeFile = filePath || vscode.window.activeTextEditor?.document.fileName;
            if (!activeFile) {
                await this.addSystemMessage('No active file to analyze debt for.');
                return;
            }

            const debtAnalysis = await this.hotfixService.analyzeFileDebtImpact(activeFile);

            let report = `💳 **File Debt Analysis: \`${vscode.workspace.asRelativePath(activeFile)}\`**\n\n`;

            if (debtAnalysis.hasDebt) {
                report += `**Risk Level:** ${debtAnalysis.riskLevel.toUpperCase()}\n\n`;
                report += `**Related Hotfixes (${debtAnalysis.relatedHotfixes.length}):**\n`;

                debtAnalysis.relatedHotfixes.forEach(hotfix => {
                    const urgencyIcon = hotfix.status === 'overdue' ? '🔴' :
                                       hotfix.priority === 'critical' ? '🟠' :
                                       hotfix.priority === 'high' ? '🟡' : '🟢';
                    report += `- ${urgencyIcon} **${hotfix.id}**: ${hotfix.message}\n`;
                    report += `  *Priority*: ${hotfix.priority}, *Status*: ${hotfix.status}\n`;
                });
                report += '\n';

                if (debtAnalysis.recommendations.length > 0) {
                    report += `**Recommendations:**\n`;
                    debtAnalysis.recommendations.forEach(rec => {
                        report += `- ${rec}\n`;
                    });
                }
            } else {
                report += `✅ **No technical debt detected** for this file.\n\n`;
                report += `This file is clear of pending hotfixes and can be modified safely.`;
            }

            await this.addSystemMessage(report);

        } catch (error) {
            this.contextLogger.error('Failed to analyze file debt', error as Error);
            await this.addSystemMessage(`Failed to analyze file debt: ${(error as Error).message}`);
        }
    }

    /**
     * Handle proactive debt suggestions request
     */
    private async handleProactiveDebtSuggestions(): Promise<void> {
        try {
            await this.addSystemMessage('🔍 **Analyzing technical debt patterns...** This may take a moment.');

            const proactiveAnalysis = await this.hotfixService.getProactiveDebtSuggestions();

            let report = `🎯 **Proactive Debt Reduction Analysis**\n\n`;

            // Show hotspots
            if (proactiveAnalysis.hotspots.length > 0) {
                report += `**🔥 Debt Hotspots (${proactiveAnalysis.hotspots.length}):**\n`;
                proactiveAnalysis.hotspots.forEach(hotspot => {
                    report += `- ${hotspot}\n`;
                });
                report += '\n';
            }

            // Show trends
            if (proactiveAnalysis.trends.length > 0) {
                report += `**📈 Debt Trends:**\n`;
                proactiveAnalysis.trends.forEach(trend => {
                    const trendIcon = trend.trend === 'increasing' ? '📈' :
                                     trend.trend === 'decreasing' ? '📉' : '➡️';
                    report += `- ${trend.period}: ${trend.newDebt} new, ${trend.resolvedDebt} resolved ${trendIcon}\n`;
                });
                report += '\n';
            }

            // Show suggestions
            if (proactiveAnalysis.suggestions.length > 0) {
                report += `**💡 Proactive Suggestions (${proactiveAnalysis.suggestions.length}):**\n\n`;

                const highPriority = proactiveAnalysis.suggestions.filter(s => s.priority === 'high');
                const mediumPriority = proactiveAnalysis.suggestions.filter(s => s.priority === 'medium');
                const lowPriority = proactiveAnalysis.suggestions.filter(s => s.priority === 'low');

                if (highPriority.length > 0) {
                    report += `**🔴 High Priority:**\n`;
                    highPriority.forEach(s => {
                        report += `- **${s.title}**\n`;
                        report += `  *Description*: ${s.description}\n`;
                        report += `  *Impact*: ${s.impact}\n`;
                        report += `  *Effort*: ${s.effort}\n`;
                        report += `  *Files*: ${s.files.length} affected\n\n`;
                    });
                }

                if (mediumPriority.length > 0) {
                    report += `**🟡 Medium Priority:**\n`;
                    mediumPriority.forEach(s => {
                        report += `- **${s.title}**\n`;
                        report += `  *Description*: ${s.description}\n`;
                        report += `  *Impact*: ${s.impact}\n\n`;
                    });
                }

                if (lowPriority.length > 0) {
                    report += `**🟢 Low Priority:**\n`;
                    lowPriority.forEach(s => {
                        report += `- **${s.title}**: ${s.description}\n`;
                    });
                    report += '\n';
                }
            }

            // Show action plan
            if (proactiveAnalysis.actionPlan.length > 0) {
                report += `**📋 Recommended Action Plan:**\n`;
                proactiveAnalysis.actionPlan.forEach(step => {
                    report += `${step}\n`;
                });
            }

            await this.addSystemMessage(report);

        } catch (error) {
            this.contextLogger.error('Failed to get proactive debt suggestions', error as Error);
            await this.addSystemMessage(`Failed to analyze proactive debt suggestions: ${(error as Error).message}`);
        }
    }

    /**
     * Get symbols from a file
     */
    private async getSymbolsFromFile(filePath: string): Promise<Array<{name: string, type: string, signature?: string}>> {
        try {
            const graph = await this.graphService.generateGraph(filePath);
            if (!graph) return [];

            return graph.nodes.map(node => ({
                name: node.name,
                type: node.type,
                signature: node.signature
            }));

        } catch (error) {
            this.contextLogger.error('Failed to get symbols from file', error as Error);
            return [];
        }
    }

    /**
     * Generate unique message ID
     */
    private generateMessageId(): string {
        return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Load message history from storage
     */
    private async loadMessageHistory(): Promise<void> {
        try {
            const storedThreads = await this.configManager.getWorkspaceState('chatThreads');
            const storedCurrentThread = await this.configManager.getWorkspaceState('currentChatThread');

            if (storedThreads) {
                this.threads = JSON.parse(storedThreads);
            }

            if (storedCurrentThread) {
                this.currentThreadId = storedCurrentThread;
                const currentThread = this.threads.find(t => t.id === this.currentThreadId);
                if (currentThread) {
                    this.messages = currentThread.messages;
                }
            }

            // Create default thread if none exists
            if (this.threads.length === 0) {
                await this.createNewThread();
            }

        } catch (error) {
            this.contextLogger.error('Failed to load message history', error as Error);
            await this.createNewThread();
        }
    }

    /**
     * Save message history to storage
     */
    private async saveMessageHistory(): Promise<void> {
        try {
            // Update current thread with latest messages
            if (this.currentThreadId) {
                const threadIndex = this.threads.findIndex(t => t.id === this.currentThreadId);
                if (threadIndex >= 0 && this.threads[threadIndex]) {
                    this.threads[threadIndex]!.messages = this.messages;
                    this.threads[threadIndex]!.updatedAt = Date.now();
                }
            }

            await this.configManager.setWorkspaceState('chatThreads', JSON.stringify(this.threads));
            await this.configManager.setWorkspaceState('currentChatThread', this.currentThreadId);

            this.contextLogger.info('Message history saved successfully');

        } catch (error) {
            this.contextLogger.error('Failed to save message history', error as Error);
        }
    }

    /**
     * Create new chat thread
     */
    private async createNewThread(title?: string): Promise<string> {
        const threadId = this.generateThreadId();
        const thread: ChatThread = {
            id: threadId,
            title: title || `Chat ${new Date().toLocaleDateString()}`,
            messages: [],
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        this.threads.push(thread);
        this.currentThreadId = threadId;
        this.messages = [];

        await this.saveMessageHistory();
        return threadId;
    }

    /**
     * Switch to different thread
     */
    private async switchThread(threadId: string): Promise<void> {
        // Save current thread
        await this.saveMessageHistory();

        // Switch to new thread
        const thread = this.threads.find(t => t.id === threadId);
        if (thread) {
            this.currentThreadId = threadId;
            this.messages = thread.messages;
            await this.updateWebviewContent();
        }
    }

    /**
     * Generate unique thread ID
     */
    private generateThreadId(): string {
        return `thread_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Update webview content
     */
    private async updateWebviewContent(): Promise<void> {
        if (this.panel) {
            this.panel.webview.html = await this.getWebviewContent();
        }
    }

    /**
     * Generate webview HTML content
     */
    private async getWebviewContent(): Promise<string> {
        const context = await this.getCurrentContext();
        
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>FlowCode AI Assistant</title>
    <style>
        ${this.getChatStyles()}
    </style>
</head>
<body>
    <div class="chat-container">
        <div class="chat-header">
            <h2>🤖 FlowCode AI Assistant</h2>
            <div class="context-indicator">
                <span class="context-file">${context.activeFile ? '📄 ' + context.activeFile.split('/').pop() : '📁 No file selected'}</span>
                <span class="guard-status ${context.companionGuardStatus?.status || 'unknown'}">${this.getGuardStatusIcon(context.companionGuardStatus?.status)}</span>
            </div>
        </div>
        
        <div class="messages-container" id="messagesContainer">
            ${this.renderMessages()}
        </div>
        
        <div class="input-container">
            <div class="context-actions">
                <button onclick="addFileContext()">@file</button>
                <button onclick="addFolderContext()">@folder</button>
                <button onclick="addProblemsContext()">@problems</button>
                <button onclick="showDependencies()">🔗 Dependencies</button>
                <button onclick="analyzeImpact()">⚠️ Impact</button>
                <button onclick="showArchitecture()">🏗️ Architecture</button>
                <button onclick="showDebtSummary()">💳 Debt Summary</button>
                <button onclick="analyzeFileDebt()">🔍 File Debt</button>
                <button onclick="getProactiveDebtSuggestions()">🎯 Debt Insights</button>
                <button onclick="elevateToArchitect()" class="architect-button">🚀 Elevate to Architect</button>
            </div>
            <div class="input-wrapper">
                <textarea id="messageInput" placeholder="Ask FlowCode anything about your code..." rows="3"></textarea>
                <button id="sendButton" onclick="sendMessage()">Send</button>
            </div>
        </div>
    </div>
    
    <script>
        ${this.getChatScript()}
    </script>
</body>
</html>`;
    }

    /**
     * Get CSS styles for chat interface
     */
    private getChatStyles(): string {
        return `
            body {
                margin: 0;
                padding: 0;
                font-family: var(--vscode-font-family);
                background: var(--vscode-editor-background);
                color: var(--vscode-editor-foreground);
                height: 100vh;
                overflow: hidden;
            }
            
            .chat-container {
                display: flex;
                flex-direction: column;
                height: 100vh;
            }
            
            .chat-header {
                padding: 12px 16px;
                border-bottom: 1px solid var(--vscode-panel-border);
                background: var(--vscode-panel-background);
            }
            
            .chat-header h2 {
                margin: 0 0 8px 0;
                font-size: 16px;
                font-weight: 600;
            }
            
            .context-indicator {
                display: flex;
                justify-content: space-between;
                align-items: center;
                font-size: 12px;
                opacity: 0.8;
            }
            
            .guard-status {
                padding: 2px 6px;
                border-radius: 3px;
                font-size: 11px;
            }
            
            .guard-status.ready { background: var(--vscode-testing-iconPassed); }
            .guard-status.running { background: var(--vscode-testing-iconQueued); }
            .guard-status.error { background: var(--vscode-testing-iconFailed); }
            
            .messages-container {
                flex: 1;
                overflow-y: auto;
                padding: 16px;
            }
            
            .message {
                margin-bottom: 16px;
                padding: 12px;
                border-radius: 8px;
                max-width: 85%;
            }
            
            .message.user {
                background: var(--vscode-button-background);
                color: var(--vscode-button-foreground);
                margin-left: auto;
            }
            
            .message.assistant {
                background: var(--vscode-input-background);
                border: 1px solid var(--vscode-input-border);
            }
            
            .message.system {
                background: var(--vscode-notifications-background);
                border: 1px solid var(--vscode-notifications-border);
                font-style: italic;
                text-align: center;
                margin: 8px auto;
                max-width: 70%;
            }
            
            .message-content {
                white-space: pre-wrap;
                word-wrap: break-word;
            }
            
            .message-metadata {
                margin-top: 8px;
                font-size: 11px;
                opacity: 0.7;
                display: flex;
                justify-content: space-between;
            }
            
            .input-container {
                border-top: 1px solid var(--vscode-panel-border);
                padding: 12px 16px;
                background: var(--vscode-panel-background);
            }
            
            .context-actions {
                margin-bottom: 8px;
            }
            
            .context-actions button {
                background: var(--vscode-button-secondaryBackground);
                color: var(--vscode-button-secondaryForeground);
                border: none;
                padding: 4px 8px;
                margin-right: 8px;
                border-radius: 4px;
                font-size: 11px;
                cursor: pointer;
            }

            .architect-button {
                background: var(--vscode-button-background) !important;
                color: var(--vscode-button-foreground) !important;
                font-weight: 600 !important;
                padding: 6px 12px !important;
                font-size: 12px !important;
            }

            .architect-button:hover {
                background: var(--vscode-button-hoverBackground) !important;
            }
            
            .input-wrapper {
                display: flex;
                gap: 8px;
            }
            
            #messageInput {
                flex: 1;
                background: var(--vscode-input-background);
                color: var(--vscode-input-foreground);
                border: 1px solid var(--vscode-input-border);
                border-radius: 4px;
                padding: 8px;
                font-family: inherit;
                resize: vertical;
                min-height: 60px;
            }
            
            #sendButton {
                background: var(--vscode-button-background);
                color: var(--vscode-button-foreground);
                border: none;
                padding: 8px 16px;
                border-radius: 4px;
                cursor: pointer;
                font-weight: 600;
            }
            
            #sendButton:hover {
                background: var(--vscode-button-hoverBackground);
            }
            
            .streaming {
                opacity: 0.7;
            }
            
            .streaming::after {
                content: '▋';
                animation: blink 1s infinite;
            }
            
            @keyframes blink {
                0%, 50% { opacity: 1; }
                51%, 100% { opacity: 0; }
            }
        `;
    }

    /**
     * Render messages as HTML
     */
    private renderMessages(): string {
        return this.messages.map(message => {
            const streamingClass = this.isStreaming && message.id === this.currentStreamingMessage?.id ? 'streaming' : '';
            
            return `
                <div class="message ${message.type} ${streamingClass}">
                    <div class="message-content">${this.escapeHtml(message.content)}</div>
                    ${message.metadata ? this.renderMessageMetadata(message.metadata) : ''}
                </div>
            `;
        }).join('');
    }

    /**
     * Render message metadata
     */
    private renderMessageMetadata(metadata: any): string {
        const parts = [];
        
        if (metadata.cost) {
            parts.push(`💰 $${metadata.cost.toFixed(4)}`);
        }
        
        if (metadata.tokens) {
            parts.push(`🔤 ${metadata.tokens} tokens`);
        }
        
        if (metadata.securityWarnings?.length) {
            parts.push(`⚠️ ${metadata.securityWarnings.length} security warnings`);
        }
        
        if (metadata.qualityIssues?.length) {
            parts.push(`🔍 ${metadata.qualityIssues.length} quality issues`);
        }
        
        return parts.length ? `<div class="message-metadata"><span>${parts.join(' • ')}</span></div>` : '';
    }

    /**
     * Get guard status icon
     */
    private getGuardStatusIcon(status?: string): string {
        switch (status) {
            case 'ready': return '✅ Ready';
            case 'running': return '⚡ Running';
            case 'error': return '❌ Error';
            default: return '⚪ Unknown';
        }
    }

    /**
     * Escape HTML
     */
    private escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Get JavaScript for chat interface
     */
    private getChatScript(): string {
        return `
            const vscode = acquireVsCodeApi();
            
            function sendMessage() {
                const input = document.getElementById('messageInput');
                const content = input.value.trim();
                
                if (!content) return;
                
                vscode.postMessage({
                    command: 'sendMessage',
                    content: content,
                    context: {}
                });
                
                input.value = '';
                input.focus();
            }
            
            function addFileContext() {
                vscode.postMessage({
                    command: 'addContext',
                    type: 'file',
                    value: ''
                });
            }
            
            function addFolderContext() {
                vscode.postMessage({
                    command: 'addContext',
                    type: 'folder',
                    value: ''
                });
            }
            
            function addProblemsContext() {
                vscode.postMessage({
                    command: 'addContext',
                    type: 'problems',
                    value: ''
                });
            }

            function showDependencies() {
                vscode.postMessage({
                    command: 'showDependencies'
                });
            }

            function analyzeImpact() {
                vscode.postMessage({
                    command: 'analyzeImpact'
                });
            }

            function showArchitecture() {
                vscode.postMessage({
                    command: 'showArchitecture'
                });
            }

            function elevateToArchitect() {
                vscode.postMessage({
                    command: 'elevateToArchitect'
                });
            }

            function showDebtSummary() {
                vscode.postMessage({
                    command: 'showDebtSummary'
                });
            }

            function analyzeFileDebt() {
                vscode.postMessage({
                    command: 'analyzeFileDebt'
                });
            }

            function getProactiveDebtSuggestions() {
                vscode.postMessage({
                    command: 'getProactiveDebtSuggestions'
                });
            }
            
            // Handle Enter key in textarea
            document.getElementById('messageInput').addEventListener('keydown', function(e) {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                }
            });
            
            // Auto-scroll to bottom
            function scrollToBottom() {
                const container = document.getElementById('messagesContainer');
                container.scrollTop = container.scrollHeight;
            }
            
            // Listen for context updates
            window.addEventListener('message', event => {
                const message = event.data;
                if (message.command === 'updateContext') {
                    // Update context indicators
                    console.log('Context updated:', message.context);
                }
            });
            
            // Initial scroll to bottom
            setTimeout(scrollToBottom, 100);
        `;
    }

    /**
     * Dispose of resources
     */
    public dispose(): void {
        if (this.panel) {
            this.panel.dispose();
        }
        this.saveMessageHistory();
    }
}
