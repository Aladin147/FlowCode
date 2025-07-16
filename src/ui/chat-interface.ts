import * as vscode from 'vscode';
import { logger } from '../utils/logger';
import { ArchitectService } from '../services/architect-service';
import { CompanionGuard } from '../services/companion-guard';
import { SecurityValidatorService } from '../services/security-validator';
import { GraphService } from '../services/graph-service';
import { HotfixService } from '../services/hotfix-service';
import { ConfigurationManager } from '../utils/configuration-manager';
import { PerformanceCache, CacheManager } from '../utils/performance-cache';

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
        error?: boolean;
        typing?: boolean;
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
    diffType: 'create' | 'modify' | 'delete';
    hunks: DiffHunk[];
    securityImpact?: SecurityImpact;
    qualityImpact?: QualityImpact;
    approvalStatus?: 'pending' | 'approved' | 'rejected';
}

export interface DiffHunk {
    oldStart: number;
    oldLines: number;
    newStart: number;
    newLines: number;
    lines: DiffLine[];
    context: string;
}

export interface DiffLine {
    type: 'add' | 'remove' | 'context';
    content: string;
    lineNumber: number;
    oldLineNumber?: number;
    newLineNumber?: number;
    hasSecurityIssue?: boolean;
    hasQualityIssue?: boolean;
}

export interface SecurityImpact {
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    issues: string[];
    recommendations: string[];
}

export interface QualityImpact {
    complexityChange: number;
    maintainabilityScore: number;
    issues: string[];
    improvements: string[];
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
    private responseCache: PerformanceCache<string>;

    constructor(
        private architectService: ArchitectService,
        private companionGuard: CompanionGuard,
        private securityValidator: SecurityValidatorService,
        private graphService: GraphService,
        private hotfixService: HotfixService,
        private configManager: ConfigurationManager
    ) {
        this.loadMessageHistory();

        // Initialize response cache for sub-500ms performance
        this.responseCache = CacheManager.getCache<string>('chat-responses', {
            maxSize: 10 * 1024 * 1024, // 10MB
            maxEntries: 500,
            defaultTTL: 600000 // 10 minutes
        });
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

            case 'approveDiff':
                await this.handleDiffApproval(message.diffId, true);
                break;

            case 'rejectDiff':
                await this.handleDiffApproval(message.diffId, false);
                break;

            case 'previewDiff':
                await this.handleDiffPreview(message.diffId);
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

            case 'showSampleDiff':
                await this.createSampleDiff();
                break;

            case 'showGraphPopover':
                await this.handleShowGraphPopover(message.symbolName, message.filePath);
                break;

            case 'exploreGraph':
                await this.handleExploreGraph(message.symbolName, message.filePath, message.depth);
                break;
        }
    }

    /**
     * Handle user message with optimized streaming
     */
    private async handleUserMessage(content: string, context?: any): Promise<void> {
        const startTime = performance.now();

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

            // Immediate UI update for responsiveness
            this.updateWebviewContentImmediate();

            // Get current context in parallel with UI update
            const chatContextPromise = this.getCurrentContext();

            // Start streaming response immediately
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

            // Update UI with streaming indicator
            this.updateWebviewContentImmediate();

            // Wait for context and start AI response
            const chatContext = await chatContextPromise;

            // Stream AI response with real-time updates
            await this.streamAIResponse(content, chatContext, assistantMessage);

            const endTime = performance.now();
            this.contextLogger.info('Message handled', {
                duration: endTime - startTime,
                target: 500,
                achieved: endTime - startTime < 500
            });

        } catch (error) {
            this.contextLogger.error('Failed to handle user message', error as Error);
            this.addSystemMessage('Error processing your message. Please try again.');
            this.isStreaming = false;
            this.currentStreamingMessage = undefined;
        }
    }

    /**
     * Immediate UI update without async operations
     */
    private updateWebviewContentImmediate(): void {
        if (this.panel && this.panel.webview) {
            // Use synchronous HTML generation for immediate updates
            const html = this.generateWebviewContentSync();
            this.panel.webview.html = html;
        }
    }

    /**
     * Stream AI response with real-time updates
     */
    private async streamAIResponse(userMessage: string, context: ChatContext, assistantMessage: ChatMessage): Promise<void> {
        try {
            // Check cache first for instant responses
            const cacheKey = this.generateCacheKey(userMessage, context);
            const cachedResponse = await this.getCachedResponse(cacheKey);

            if (cachedResponse) {
                // Simulate streaming for cached responses
                await this.simulateStreamingResponse(cachedResponse, assistantMessage);
                return;
            }

            // Start AI response generation
            const responsePromise = this.getAIResponse(userMessage, context);

            // Show typing indicator immediately
            this.showTypingIndicator(assistantMessage);

            // Wait for response and stream it
            const response = await responsePromise;

            // Cache the response for future use
            this.cacheResponse(cacheKey, response);

            // Stream the response to UI
            await this.streamResponseToUI(response, assistantMessage);

        } catch (error) {
            this.contextLogger.error('Failed to stream AI response', error as Error);
            assistantMessage.content = 'Sorry, I encountered an error processing your request.';
            assistantMessage.metadata = { error: true };
        } finally {
            this.isStreaming = false;
            this.currentStreamingMessage = undefined;
            this.updateWebviewContentImmediate();
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
    private async addSystemMessage(content: string, metadata?: any): Promise<void> {
        const systemMessage: ChatMessage = {
            id: this.generateMessageId(),
            type: 'system',
            content,
            timestamp: Date.now(),
            metadata: metadata || {}
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
        try {
            // Find the diff in current messages
            const diff = this.findDiffById(diffId);
            if (!diff) {
                await this.addSystemMessage(`Diff ${diffId} not found.`);
                return;
            }

            // Check if diff requires approval
            if (diff.approvalStatus === 'pending') {
                await this.addSystemMessage(`⚠️ Diff requires approval before applying. Please approve or reject first.`);
                return;
            }

            if (diff.approvalStatus === 'rejected') {
                await this.addSystemMessage(`❌ Cannot apply rejected diff.`);
                return;
            }

            // Apply the diff
            const success = await this.applyDiffToFile(diff);
            if (success) {
                diff.applied = true;
                await this.addSystemMessage(`✅ Successfully applied diff to ${diff.filePath}`);
                await this.updateWebviewContent();
            } else {
                await this.addSystemMessage(`❌ Failed to apply diff to ${diff.filePath}`);
            }

        } catch (error) {
            this.contextLogger.error('Failed to apply diff', error as Error);
            await this.addSystemMessage(`Failed to apply diff: ${(error as Error).message}`);
        }
    }

    /**
     * Handle diff approval/rejection
     */
    private async handleDiffApproval(diffId: string, approved: boolean): Promise<void> {
        try {
            const diff = this.findDiffById(diffId);
            if (!diff) {
                await this.addSystemMessage(`Diff ${diffId} not found.`);
                return;
            }

            diff.approvalStatus = approved ? 'approved' : 'rejected';

            const status = approved ? '✅ approved' : '❌ rejected';
            await this.addSystemMessage(`Diff for ${diff.filePath} has been ${status}.`);
            await this.updateWebviewContent();

        } catch (error) {
            this.contextLogger.error('Failed to handle diff approval', error as Error);
            await this.addSystemMessage(`Failed to handle diff approval: ${(error as Error).message}`);
        }
    }

    /**
     * Handle diff preview
     */
    private async handleDiffPreview(diffId: string): Promise<void> {
        try {
            const diff = this.findDiffById(diffId);
            if (!diff) {
                await this.addSystemMessage(`Diff ${diffId} not found.`);
                return;
            }

            // Open diff preview in VS Code
            await this.showDiffPreview(diff);

        } catch (error) {
            this.contextLogger.error('Failed to show diff preview', error as Error);
            await this.addSystemMessage(`Failed to show diff preview: ${(error as Error).message}`);
        }
    }

    /**
     * Find diff by ID in current messages
     */
    private findDiffById(diffId: string): CodeDiff | undefined {
        for (const message of this.messages) {
            if (message.metadata?.diffs) {
                const diff = message.metadata.diffs.find((d: CodeDiff) => d.id === diffId);
                if (diff) return diff;
            }
        }
        return undefined;
    }

    /**
     * Apply diff to file
     */
    private async applyDiffToFile(diff: CodeDiff): Promise<boolean> {
        try {
            const document = await vscode.workspace.openTextDocument(diff.filePath);
            const edit = new vscode.WorkspaceEdit();

            if (diff.diffType === 'create') {
                // Create new file
                edit.createFile(vscode.Uri.file(diff.filePath));
                edit.insert(vscode.Uri.file(diff.filePath), new vscode.Position(0, 0), diff.newContent);
            } else if (diff.diffType === 'delete') {
                // Delete file
                edit.deleteFile(vscode.Uri.file(diff.filePath));
            } else {
                // Modify existing file
                const fullRange = new vscode.Range(
                    document.positionAt(0),
                    document.positionAt(document.getText().length)
                );
                edit.replace(document.uri, fullRange, diff.newContent);
            }

            return await vscode.workspace.applyEdit(edit);

        } catch (error) {
            this.contextLogger.error('Failed to apply diff to file', error as Error);
            return false;
        }
    }

    /**
     * Show diff preview in VS Code
     */
    private async showDiffPreview(diff: CodeDiff): Promise<void> {
        try {
            // Create temporary files for diff comparison
            const tempDir = require('os').tmpdir();
            const path = require('path');
            const fs = require('fs');

            const oldFile = path.join(tempDir, `${diff.id}_old.${path.extname(diff.filePath)}`);
            const newFile = path.join(tempDir, `${diff.id}_new.${path.extname(diff.filePath)}`);

            fs.writeFileSync(oldFile, diff.oldContent);
            fs.writeFileSync(newFile, diff.newContent);

            // Open diff view
            await vscode.commands.executeCommand(
                'vscode.diff',
                vscode.Uri.file(oldFile),
                vscode.Uri.file(newFile),
                `${path.basename(diff.filePath)} (Diff Preview)`
            );

        } catch (error) {
            this.contextLogger.error('Failed to show diff preview', error as Error);
            throw error;
        }
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
     * Handle show graph popover request
     */
    private async handleShowGraphPopover(symbolName?: string, filePath?: string): Promise<void> {
        try {
            const activeFile = filePath || vscode.window.activeTextEditor?.document.fileName;
            if (!activeFile) {
                await this.addSystemMessage('No active file to show graph for.');
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
                    { placeHolder: 'Select a symbol to explore graph' }
                );

                if (!selected) return;
                symbolName = selected.label;
            }

            // Get comprehensive graph data
            const graphData = await this.generateInteractiveGraphData(symbolName, activeFile);

            // Create interactive graph visualization
            await this.addSystemMessage(`🕸️ **Interactive Graph for \`${symbolName}\`**`, {
                graphData,
                interactiveGraph: true
            });

        } catch (error) {
            this.contextLogger.error('Failed to show graph popover', error as Error);
            await this.addSystemMessage(`Failed to show graph popover: ${(error as Error).message}`);
        }
    }

    /**
     * Handle explore graph request
     */
    private async handleExploreGraph(symbolName?: string, filePath?: string, depth: number = 2): Promise<void> {
        try {
            const activeFile = filePath || vscode.window.activeTextEditor?.document.fileName;
            if (!activeFile || !symbolName) {
                await this.addSystemMessage('Invalid parameters for graph exploration.');
                return;
            }

            // Get deep graph exploration data
            const explorationData = await this.generateGraphExplorationData(symbolName, activeFile, depth);

            // Create exploration report
            let report = `🔍 **Graph Exploration: \`${symbolName}\` (Depth: ${depth})**\n\n`;

            if (explorationData.paths.length > 0) {
                report += `**Dependency Paths Found:**\n`;
                explorationData.paths.forEach((path: any, index: number) => {
                    report += `\n**Path ${index + 1}:** ${path.description}\n`;
                    report += `${path.nodes.map((node: any) => `\`${node.name}\``).join(' → ')}\n`;
                    if (path.riskLevel !== 'low') {
                        report += `⚠️ *Risk Level: ${path.riskLevel}*\n`;
                    }
                });
                report += '\n';
            }

            if (explorationData.hotspots.length > 0) {
                report += `**🔥 Hotspots (High Connectivity):**\n`;
                explorationData.hotspots.forEach((hotspot: any) => {
                    report += `- \`${hotspot.name}\` (${hotspot.connections} connections) in ${hotspot.file}\n`;
                });
                report += '\n';
            }

            if (explorationData.suggestions.length > 0) {
                report += `**💡 Architectural Suggestions:**\n`;
                explorationData.suggestions.forEach((suggestion: string) => {
                    report += `- ${suggestion}\n`;
                });
            }

            await this.addSystemMessage(report, {
                explorationData,
                graphExploration: true
            });

        } catch (error) {
            this.contextLogger.error('Failed to explore graph', error as Error);
            await this.addSystemMessage(`Failed to explore graph: ${(error as Error).message}`);
        }
    }

    /**
     * Generate interactive graph data
     */
    private async generateInteractiveGraphData(symbolName: string, filePath: string): Promise<any> {
        try {
            const dependencies = await this.graphService.getDependencies(symbolName, filePath);
            const impact = await this.graphService.analyzeChangeImpact(symbolName, filePath);

            return {
                centerNode: {
                    name: symbolName,
                    file: filePath,
                    type: 'center'
                },
                dependencies: dependencies.dependencies.map(dep => ({
                    ...dep,
                    relationship: 'depends_on'
                })),
                dependents: dependencies.dependents.map(dep => ({
                    ...dep,
                    relationship: 'depended_by'
                })),
                impactAnalysis: {
                    directImpact: impact.directImpact.length,
                    indirectImpact: impact.indirectImpact.length,
                    riskLevel: impact.riskLevel,
                    affectedFiles: impact.affectedFiles.length
                },
                interactionHints: [
                    'Click on nodes to explore their dependencies',
                    'Hover for detailed information',
                    'Use the depth slider to control exploration level'
                ]
            };

        } catch (error) {
            this.contextLogger.error('Failed to generate interactive graph data', error as Error);
            return { error: 'Failed to generate graph data' };
        }
    }

    /**
     * Generate graph exploration data
     */
    private async generateGraphExplorationData(symbolName: string, filePath: string, depth: number): Promise<any> {
        try {
            const paths: any[] = [];
            const hotspots: any[] = [];
            const suggestions: string[] = [];

            // Explore dependency paths
            await this.explorePathsRecursively(symbolName, filePath, depth, [], paths);

            // Identify hotspots (nodes with many connections)
            const allNodes = new Map<string, { name: string, file: string, connections: number }>();

            for (const path of paths) {
                for (const node of path.nodes) {
                    const key = `${node.name}:${node.file}`;
                    if (allNodes.has(key)) {
                        allNodes.get(key)!.connections++;
                    } else {
                        allNodes.set(key, { name: node.name, file: node.file, connections: 1 });
                    }
                }
            }

            // Find hotspots (nodes with > 3 connections)
            for (const [key, node] of allNodes.entries()) {
                if (node.connections > 3) {
                    hotspots.push(node);
                }
            }

            // Generate suggestions
            if (hotspots.length > 0) {
                suggestions.push(`Consider refactoring high-connectivity nodes to reduce coupling`);
            }

            if (paths.some(p => p.riskLevel === 'high')) {
                suggestions.push(`High-risk dependency paths detected - review before making changes`);
            }

            if (paths.length > 10) {
                suggestions.push(`Complex dependency network - consider architectural simplification`);
            }

            return {
                paths: paths.slice(0, 10), // Limit to 10 paths for readability
                hotspots: hotspots.slice(0, 5), // Top 5 hotspots
                suggestions,
                totalPaths: paths.length,
                explorationDepth: depth
            };

        } catch (error) {
            this.contextLogger.error('Failed to generate graph exploration data', error as Error);
            return { paths: [], hotspots: [], suggestions: ['Failed to explore graph'], totalPaths: 0, explorationDepth: depth };
        }
    }

    /**
     * Explore dependency paths recursively
     */
    private async explorePathsRecursively(
        symbolName: string,
        filePath: string,
        remainingDepth: number,
        currentPath: any[],
        allPaths: any[]
    ): Promise<void> {
        if (remainingDepth <= 0) return;

        try {
            const dependencies = await this.graphService.getDependencies(symbolName, filePath);

            for (const dep of dependencies.dependencies.slice(0, 3)) { // Limit to 3 per level
                const newPath = [...currentPath, { name: symbolName, file: filePath }, { name: dep.name, file: dep.file }];

                // Determine risk level based on path characteristics
                const riskLevel = this.calculatePathRisk(newPath);

                allPaths.push({
                    nodes: newPath,
                    description: `${symbolName} → ${dep.name}`,
                    riskLevel,
                    depth: currentPath.length + 1
                });

                // Continue exploration
                await this.explorePathsRecursively(dep.name, dep.file, remainingDepth - 1, newPath, allPaths);
            }

        } catch (error) {
            // Continue exploration even if one path fails
            this.contextLogger.warn('Failed to explore path', error as Error);
        }
    }

    /**
     * Calculate risk level for a dependency path
     */
    private calculatePathRisk(path: any[]): 'low' | 'medium' | 'high' {
        // Simple heuristics for risk calculation
        if (path.length > 5) return 'high'; // Long dependency chains are risky
        if (path.some(node => node.file.includes('node_modules'))) return 'medium'; // External dependencies
        if (path.length > 3) return 'medium'; // Medium length chains
        return 'low';
    }

    /**
     * Create a sample diff for demonstration
     */
    public async createSampleDiff(): Promise<void> {
        const sampleDiff: CodeDiff = {
            id: `diff_${Date.now()}`,
            filePath: 'src/example.ts',
            diffType: 'modify',
            oldContent: `function calculateTotal(items: Item[]): number {
    let total = 0;
    for (let i = 0; i < items.length; i++) {
        total += items[i].price;
    }
    return total;
}`,
            newContent: `function calculateTotal(items: Item[]): number {
    return items.reduce((total, item) => total + item.price, 0);
}`,
            hunks: [{
                oldStart: 1,
                oldLines: 6,
                newStart: 1,
                newLines: 3,
                context: 'calculateTotal function',
                lines: [
                    { type: 'remove', content: '    let total = 0;', lineNumber: 2, oldLineNumber: 2 },
                    { type: 'remove', content: '    for (let i = 0; i < items.length; i++) {', lineNumber: 3, oldLineNumber: 3 },
                    { type: 'remove', content: '        total += items[i].price;', lineNumber: 4, oldLineNumber: 4 },
                    { type: 'remove', content: '    }', lineNumber: 5, oldLineNumber: 5 },
                    { type: 'remove', content: '    return total;', lineNumber: 6, oldLineNumber: 6 },
                    { type: 'add', content: '    return items.reduce((total, item) => total + item.price, 0);', lineNumber: 2, newLineNumber: 2 }
                ]
            }],
            securityImpact: {
                riskLevel: 'low',
                issues: [],
                recommendations: ['Code change looks safe - using built-in array methods']
            },
            qualityImpact: {
                complexityChange: -3,
                maintainabilityScore: 8.5,
                issues: [],
                improvements: ['Reduced cyclomatic complexity', 'More functional programming style', 'Fewer lines of code']
            },
            approvalStatus: 'pending'
        };

        // Add sample diff to a system message
        await this.addSystemMessage('Here\'s a sample code change for review:', {
            diffs: [sampleDiff]
        });
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
                <button onclick="showSampleDiff()">📝 Sample Diff</button>
                <button onclick="showGraphPopover()">🕸️ Graph Explorer</button>
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

            /* Architecture Visualization Styles */
            .architecture-viz, .dependency-viz {
                margin: 10px 0;
                padding: 12px;
                background: var(--vscode-editor-background);
                border: 1px solid var(--vscode-panel-border);
                border-radius: 6px;
                font-size: 12px;
            }

            .architecture-viz h4, .dependency-viz h4 {
                margin: 0 0 10px 0;
                color: var(--vscode-foreground);
                font-size: 13px;
            }

            .metrics-grid {
                display: flex;
                flex-direction: column;
                gap: 8px;
            }

            .metric {
                display: flex;
                align-items: center;
                gap: 10px;
            }

            .metric-label {
                min-width: 70px;
                font-weight: 500;
                color: var(--vscode-foreground);
            }

            .metric-bar {
                flex: 1;
                height: 16px;
                background: var(--vscode-input-background);
                border-radius: 8px;
                position: relative;
                overflow: hidden;
            }

            .metric-fill {
                height: 100%;
                border-radius: 8px;
                transition: width 0.3s ease;
            }

            .metric-fill.complexity {
                background: linear-gradient(90deg, #4CAF50, #FF9800, #F44336);
            }

            .metric-fill.coupling {
                background: linear-gradient(90deg, #4CAF50, #FF9800, #F44336);
            }

            .metric-fill.cohesion {
                background: linear-gradient(90deg, #F44336, #FF9800, #4CAF50);
            }

            .metric-value {
                position: absolute;
                right: 6px;
                top: 50%;
                transform: translateY(-50%);
                font-size: 11px;
                font-weight: 600;
                color: var(--vscode-foreground);
                text-shadow: 0 0 3px var(--vscode-editor-background);
            }

            .suggestions {
                margin-top: 10px;
                padding-top: 8px;
                border-top: 1px solid var(--vscode-panel-border);
            }

            .suggestions ul {
                margin: 5px 0 0 0;
                padding-left: 16px;
            }

            .suggestions li {
                margin: 3px 0;
                color: var(--vscode-foreground);
            }

            /* Dependency Visualization Styles */
            .dependency-grid {
                display: flex;
                flex-direction: column;
                gap: 12px;
            }

            .dependency-section {
                display: flex;
                flex-direction: column;
                gap: 6px;
            }

            .dependency-list {
                display: flex;
                flex-direction: column;
                gap: 4px;
            }

            .dependency-item {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 4px 8px;
                background: var(--vscode-input-background);
                border-radius: 4px;
                font-size: 11px;
            }

            .dep-type {
                background: var(--vscode-badge-background);
                color: var(--vscode-badge-foreground);
                padding: 2px 6px;
                border-radius: 3px;
                font-size: 10px;
                font-weight: 600;
                min-width: 50px;
                text-align: center;
            }

            .dep-name {
                font-weight: 500;
                color: var(--vscode-foreground);
                flex: 1;
            }

            .dep-file {
                color: var(--vscode-descriptionForeground);
                font-style: italic;
            }

            .more-items {
                color: var(--vscode-descriptionForeground);
                font-style: italic;
                text-align: center;
                padding: 4px;
            }

            /* Diff Visualization Styles */
            .diff-visualizations {
                margin: 10px 0;
                padding: 12px;
                background: var(--vscode-editor-background);
                border: 1px solid var(--vscode-panel-border);
                border-radius: 6px;
                font-size: 12px;
            }

            .diff-visualizations h4 {
                margin: 0 0 12px 0;
                color: var(--vscode-foreground);
                font-size: 13px;
            }

            .diff-container {
                margin: 8px 0;
                border: 1px solid var(--vscode-panel-border);
                border-radius: 6px;
                overflow: hidden;
                background: var(--vscode-input-background);
            }

            .diff-container.pending {
                border-left: 4px solid var(--vscode-notificationsWarningIcon-foreground);
            }

            .diff-container.approved {
                border-left: 4px solid var(--vscode-testing-iconPassed);
            }

            .diff-container.rejected {
                border-left: 4px solid var(--vscode-testing-iconFailed);
            }

            .diff-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 8px 12px;
                background: var(--vscode-titleBar-inactiveBackground);
                border-bottom: 1px solid var(--vscode-panel-border);
            }

            .diff-file-info {
                display: flex;
                align-items: center;
                gap: 8px;
            }

            .diff-type-icon {
                font-size: 14px;
            }

            .diff-filename {
                font-weight: 600;
                color: var(--vscode-foreground);
            }

            .diff-path {
                color: var(--vscode-descriptionForeground);
                font-size: 11px;
            }

            .diff-status {
                display: flex;
                align-items: center;
                gap: 8px;
            }

            .security-indicator {
                font-size: 12px;
                cursor: help;
            }

            .approval-status {
                font-size: 11px;
                font-weight: 500;
                padding: 2px 6px;
                border-radius: 3px;
                background: var(--vscode-badge-background);
                color: var(--vscode-badge-foreground);
            }

            .diff-content {
                max-height: 300px;
                overflow-y: auto;
                font-family: var(--vscode-editor-font-family);
                font-size: 11px;
                line-height: 1.4;
            }

            .diff-hunk {
                margin: 4px 0;
            }

            .hunk-header {
                background: var(--vscode-diffEditor-unchangedRegionBackground);
                color: var(--vscode-descriptionForeground);
                padding: 4px 8px;
                font-size: 10px;
                border-top: 1px solid var(--vscode-panel-border);
                border-bottom: 1px solid var(--vscode-panel-border);
            }

            .diff-line {
                display: flex;
                align-items: center;
                padding: 1px 0;
                white-space: pre;
                font-family: var(--vscode-editor-font-family);
            }

            .diff-line.add {
                background: var(--vscode-diffEditor-insertedTextBackground);
                color: var(--vscode-diffEditor-insertedTextForeground);
            }

            .diff-line.remove {
                background: var(--vscode-diffEditor-removedTextBackground);
                color: var(--vscode-diffEditor-removedTextForeground);
            }

            .diff-line.context {
                background: var(--vscode-editor-background);
                color: var(--vscode-foreground);
            }

            .diff-line.security-issue {
                border-left: 3px solid var(--vscode-errorForeground);
            }

            .diff-line.quality-issue {
                border-left: 3px solid var(--vscode-notificationsWarningIcon-foreground);
            }

            .line-number {
                min-width: 40px;
                padding: 0 8px;
                color: var(--vscode-editorLineNumber-foreground);
                text-align: right;
                user-select: none;
            }

            .line-prefix {
                min-width: 20px;
                padding: 0 4px;
                font-weight: bold;
                user-select: none;
            }

            .line-content {
                flex: 1;
                padding-right: 8px;
            }

            .simple-diff {
                padding: 8px;
                font-family: var(--vscode-editor-font-family);
                font-size: 11px;
                line-height: 1.4;
            }

            .diff-more {
                color: var(--vscode-descriptionForeground);
                font-style: italic;
                text-align: center;
                padding: 8px;
                border-top: 1px solid var(--vscode-panel-border);
            }

            .diff-actions {
                display: flex;
                gap: 8px;
                padding: 8px 12px;
                background: var(--vscode-titleBar-inactiveBackground);
                border-top: 1px solid var(--vscode-panel-border);
            }

            .diff-action {
                padding: 4px 8px;
                border: none;
                border-radius: 4px;
                font-size: 11px;
                cursor: pointer;
                font-weight: 500;
                transition: background-color 0.2s;
            }

            .diff-action.approve {
                background: var(--vscode-testing-iconPassed);
                color: white;
            }

            .diff-action.reject {
                background: var(--vscode-testing-iconFailed);
                color: white;
            }

            .diff-action.apply {
                background: var(--vscode-button-background);
                color: var(--vscode-button-foreground);
            }

            .diff-action.preview {
                background: var(--vscode-button-secondaryBackground);
                color: var(--vscode-button-secondaryForeground);
            }

            .diff-action:hover {
                opacity: 0.8;
            }

            .diff-impact {
                padding: 8px 12px;
                border-top: 1px solid var(--vscode-panel-border);
                background: var(--vscode-editor-background);
            }

            .impact-section {
                margin: 6px 0;
                padding: 6px;
                border-radius: 4px;
                font-size: 11px;
            }

            .security-impact {
                background: var(--vscode-inputValidation-errorBackground);
                border-left: 3px solid var(--vscode-errorForeground);
            }

            .quality-impact {
                background: var(--vscode-inputValidation-warningBackground);
                border-left: 3px solid var(--vscode-notificationsWarningIcon-foreground);
            }

            .impact-section ul {
                margin: 4px 0;
                padding-left: 16px;
            }

            .impact-section li {
                margin: 2px 0;
            }

            /* Interactive Graph Styles */
            .interactive-graph, .graph-exploration {
                margin: 10px 0;
                padding: 12px;
                background: var(--vscode-editor-background);
                border: 1px solid var(--vscode-panel-border);
                border-radius: 6px;
                font-size: 12px;
            }

            .interactive-graph h4, .graph-exploration h4 {
                margin: 0 0 12px 0;
                color: var(--vscode-foreground);
                font-size: 13px;
            }

            .graph-container {
                display: flex;
                flex-direction: column;
                gap: 12px;
                margin: 12px 0;
            }

            .graph-center {
                display: flex;
                justify-content: center;
                margin: 8px 0;
            }

            .center-node {
                display: flex;
                flex-direction: column;
                align-items: center;
                padding: 12px;
                background: var(--vscode-button-background);
                color: var(--vscode-button-foreground);
                border-radius: 8px;
                cursor: pointer;
                transition: all 0.2s;
                min-width: 120px;
            }

            .center-node:hover {
                background: var(--vscode-button-hoverBackground);
                transform: scale(1.05);
            }

            .graph-section {
                margin: 8px 0;
            }

            .graph-section h5 {
                margin: 0 0 8px 0;
                color: var(--vscode-foreground);
                font-size: 12px;
                font-weight: 600;
            }

            .node-list {
                display: flex;
                flex-direction: column;
                gap: 4px;
            }

            .graph-node {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 6px 8px;
                background: var(--vscode-input-background);
                border-radius: 4px;
                cursor: pointer;
                transition: background-color 0.2s;
                font-size: 11px;
            }

            .graph-node:hover {
                background: var(--vscode-list-hoverBackground);
            }

            .graph-node.dependency {
                border-left: 3px solid var(--vscode-charts-blue);
            }

            .graph-node.dependent {
                border-left: 3px solid var(--vscode-charts-green);
            }

            .node-icon {
                font-size: 14px;
                min-width: 20px;
            }

            .node-name {
                font-weight: 600;
                color: var(--vscode-foreground);
                flex: 1;
            }

            .node-type {
                background: var(--vscode-badge-background);
                color: var(--vscode-badge-foreground);
                padding: 2px 6px;
                border-radius: 3px;
                font-size: 10px;
                font-weight: 600;
            }

            .node-file {
                color: var(--vscode-descriptionForeground);
                font-style: italic;
                font-size: 10px;
            }

            .more-nodes {
                color: var(--vscode-descriptionForeground);
                font-style: italic;
                text-align: center;
                padding: 4px;
                font-size: 10px;
            }

            .graph-impact {
                margin: 12px 0;
                padding: 8px;
                background: var(--vscode-titleBar-inactiveBackground);
                border-radius: 4px;
            }

            .graph-impact h5 {
                margin: 0 0 8px 0;
                color: var(--vscode-foreground);
                font-size: 12px;
            }

            .impact-metrics {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 8px;
            }

            .impact-metrics .metric {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 4px;
                background: var(--vscode-input-background);
                border-radius: 3px;
            }

            .metric-label {
                font-size: 10px;
                color: var(--vscode-descriptionForeground);
            }

            .metric-value {
                font-weight: 600;
                font-size: 11px;
            }

            .metric-value.risk-low { color: var(--vscode-charts-green); }
            .metric-value.risk-medium { color: var(--vscode-charts-yellow); }
            .metric-value.risk-high { color: var(--vscode-charts-red); }
            .metric-value.risk-critical { color: var(--vscode-errorForeground); }

            .graph-actions {
                display: flex;
                gap: 8px;
                margin: 12px 0;
            }

            .graph-action {
                padding: 6px 12px;
                background: var(--vscode-button-secondaryBackground);
                color: var(--vscode-button-secondaryForeground);
                border: none;
                border-radius: 4px;
                font-size: 11px;
                cursor: pointer;
                transition: background-color 0.2s;
            }

            .graph-action:hover {
                background: var(--vscode-button-secondaryHoverBackground);
            }

            .graph-hints {
                margin: 12px 0 0 0;
                padding: 8px;
                background: var(--vscode-textCodeBlock-background);
                border-radius: 4px;
                font-size: 10px;
            }

            .graph-hints ul {
                margin: 4px 0 0 0;
                padding-left: 16px;
            }

            .graph-hints li {
                margin: 2px 0;
                color: var(--vscode-descriptionForeground);
            }

            /* Graph Exploration Styles */
            .exploration-summary {
                display: flex;
                gap: 16px;
                margin: 12px 0;
                padding: 8px;
                background: var(--vscode-titleBar-inactiveBackground);
                border-radius: 4px;
            }

            .summary-metric {
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 2px;
            }

            .exploration-section {
                margin: 12px 0;
            }

            .exploration-section h5 {
                margin: 0 0 8px 0;
                color: var(--vscode-foreground);
                font-size: 12px;
                font-weight: 600;
            }

            .path-list {
                display: flex;
                flex-direction: column;
                gap: 6px;
            }

            .dependency-path {
                padding: 8px;
                border-radius: 4px;
                background: var(--vscode-input-background);
            }

            .dependency-path.risk-low {
                border-left: 3px solid var(--vscode-charts-green);
            }

            .dependency-path.risk-medium {
                border-left: 3px solid var(--vscode-charts-yellow);
            }

            .dependency-path.risk-high {
                border-left: 3px solid var(--vscode-charts-red);
            }

            .path-header {
                display: flex;
                align-items: center;
                gap: 8px;
                margin-bottom: 4px;
            }

            .path-number {
                background: var(--vscode-badge-background);
                color: var(--vscode-badge-foreground);
                padding: 2px 6px;
                border-radius: 3px;
                font-size: 10px;
                font-weight: 600;
                min-width: 20px;
                text-align: center;
            }

            .path-description {
                flex: 1;
                font-weight: 500;
                font-size: 11px;
            }

            .path-risk {
                padding: 2px 6px;
                border-radius: 3px;
                font-size: 10px;
                font-weight: 600;
            }

            .path-risk.risk-low { background: var(--vscode-charts-green); color: white; }
            .path-risk.risk-medium { background: var(--vscode-charts-yellow); color: black; }
            .path-risk.risk-high { background: var(--vscode-charts-red); color: white; }

            .path-nodes {
                display: flex;
                align-items: center;
                gap: 4px;
                flex-wrap: wrap;
                font-size: 10px;
            }

            .path-node {
                background: var(--vscode-button-secondaryBackground);
                color: var(--vscode-button-secondaryForeground);
                padding: 2px 6px;
                border-radius: 3px;
                cursor: pointer;
                transition: background-color 0.2s;
            }

            .path-node:hover {
                background: var(--vscode-button-secondaryHoverBackground);
            }

            .path-arrow {
                color: var(--vscode-descriptionForeground);
                font-weight: bold;
            }

            .hotspot-list {
                display: flex;
                flex-direction: column;
                gap: 4px;
            }

            .hotspot-item {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 6px 8px;
                background: var(--vscode-input-background);
                border-left: 3px solid var(--vscode-charts-red);
                border-radius: 4px;
                cursor: pointer;
                transition: background-color 0.2s;
                font-size: 11px;
            }

            .hotspot-item:hover {
                background: var(--vscode-list-hoverBackground);
            }

            .hotspot-name {
                font-weight: 600;
                color: var(--vscode-foreground);
                flex: 1;
            }

            .hotspot-connections {
                background: var(--vscode-charts-red);
                color: white;
                padding: 2px 6px;
                border-radius: 3px;
                font-size: 10px;
                font-weight: 600;
            }

            .hotspot-file {
                color: var(--vscode-descriptionForeground);
                font-style: italic;
                font-size: 10px;
            }

            .suggestion-list {
                margin: 4px 0;
                padding-left: 16px;
            }

            .suggestion-list li {
                margin: 4px 0;
                color: var(--vscode-foreground);
                font-size: 11px;
            }

            .graph-error {
                padding: 8px;
                background: var(--vscode-inputValidation-errorBackground);
                border-left: 3px solid var(--vscode-errorForeground);
                border-radius: 4px;
                color: var(--vscode-errorForeground);
                font-size: 11px;
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

        let metadataHtml = parts.length ? `<div class="message-metadata"><span>${parts.join(' • ')}</span></div>` : '';

        // Add architecture visualization if available
        if (metadata.architecturalInsights) {
            metadataHtml += this.renderArchitectureVisualization(metadata.architecturalInsights);
        }

        // Add dependency visualization if available
        if (metadata.dependencyAnalysis) {
            metadataHtml += this.renderDependencyVisualization(metadata.dependencyAnalysis);
        }

        // Add diff visualizations if available
        if (metadata.diffs && metadata.diffs.length > 0) {
            metadataHtml += this.renderDiffVisualizations(metadata.diffs);
        }

        // Add interactive graph if available
        if (metadata.interactiveGraph && metadata.graphData) {
            metadataHtml += this.renderInteractiveGraph(metadata.graphData);
        }

        // Add graph exploration if available
        if (metadata.graphExploration && metadata.explorationData) {
            metadataHtml += this.renderGraphExploration(metadata.explorationData);
        }

        return metadataHtml;
    }

    /**
     * Render architecture visualization
     */
    private renderArchitectureVisualization(insights: any): string {
        const complexity = insights.complexity || 0;
        const coupling = (insights.coupling || 0) * 100;
        const cohesion = (insights.cohesion || 0) * 100;

        return `
            <div class="architecture-viz">
                <h4>🏗️ Architecture Analysis</h4>
                <div class="metrics-grid">
                    <div class="metric">
                        <span class="metric-label">Complexity</span>
                        <div class="metric-bar">
                            <div class="metric-fill complexity" style="width: ${Math.min(complexity * 10, 100)}%"></div>
                            <span class="metric-value">${complexity.toFixed(1)}</span>
                        </div>
                    </div>
                    <div class="metric">
                        <span class="metric-label">Coupling</span>
                        <div class="metric-bar">
                            <div class="metric-fill coupling" style="width: ${coupling}%"></div>
                            <span class="metric-value">${coupling.toFixed(1)}%</span>
                        </div>
                    </div>
                    <div class="metric">
                        <span class="metric-label">Cohesion</span>
                        <div class="metric-bar">
                            <div class="metric-fill cohesion" style="width: ${cohesion}%"></div>
                            <span class="metric-value">${cohesion.toFixed(1)}%</span>
                        </div>
                    </div>
                </div>
                ${insights.suggestions?.length ? `
                    <div class="suggestions">
                        <strong>💡 Suggestions:</strong>
                        <ul>
                            ${insights.suggestions.map((s: string) => `<li>${s}</li>`).join('')}
                        </ul>
                    </div>
                ` : ''}
            </div>
        `;
    }

    /**
     * Render dependency visualization
     */
    private renderDependencyVisualization(analysis: any): string {
        const dependencies = analysis.dependencies || [];
        const dependents = analysis.dependents || [];

        if (dependencies.length === 0 && dependents.length === 0) {
            return '';
        }

        return `
            <div class="dependency-viz">
                <h4>🔗 Dependency Analysis</h4>
                <div class="dependency-grid">
                    ${dependencies.length > 0 ? `
                        <div class="dependency-section">
                            <strong>Dependencies (${dependencies.length}):</strong>
                            <div class="dependency-list">
                                ${dependencies.slice(0, 5).map((dep: any) => `
                                    <div class="dependency-item">
                                        <span class="dep-type">${dep.type}</span>
                                        <span class="dep-name">${dep.name}</span>
                                        <span class="dep-file">${dep.file.split('/').pop()}</span>
                                    </div>
                                `).join('')}
                                ${dependencies.length > 5 ? `<div class="more-items">... and ${dependencies.length - 5} more</div>` : ''}
                            </div>
                        </div>
                    ` : ''}
                    ${dependents.length > 0 ? `
                        <div class="dependency-section">
                            <strong>Dependents (${dependents.length}):</strong>
                            <div class="dependency-list">
                                ${dependents.slice(0, 5).map((dep: any) => `
                                    <div class="dependency-item">
                                        <span class="dep-type">${dep.type}</span>
                                        <span class="dep-name">${dep.name}</span>
                                        <span class="dep-file">${dep.file.split('/').pop()}</span>
                                    </div>
                                `).join('')}
                                ${dependents.length > 5 ? `<div class="more-items">... and ${dependents.length - 5} more</div>` : ''}
                            </div>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }

    /**
     * Render diff visualizations
     */
    private renderDiffVisualizations(diffs: CodeDiff[]): string {
        return `
            <div class="diff-visualizations">
                <h4>📝 Code Changes</h4>
                ${diffs.map(diff => this.renderSingleDiff(diff)).join('')}
            </div>
        `;
    }

    /**
     * Render a single diff
     */
    private renderSingleDiff(diff: CodeDiff): string {
        const fileName = diff.filePath.split('/').pop() || diff.filePath;
        const diffTypeIcon = diff.diffType === 'create' ? '📄' :
                            diff.diffType === 'delete' ? '🗑️' : '✏️';

        const approvalStatusClass = diff.approvalStatus === 'approved' ? 'approved' :
                                   diff.approvalStatus === 'rejected' ? 'rejected' : 'pending';

        const securityRisk = diff.securityImpact?.riskLevel || 'low';
        const securityIcon = securityRisk === 'critical' ? '🔴' :
                            securityRisk === 'high' ? '🟠' :
                            securityRisk === 'medium' ? '🟡' : '🟢';

        return `
            <div class="diff-container ${approvalStatusClass}" data-diff-id="${diff.id}">
                <div class="diff-header">
                    <div class="diff-file-info">
                        <span class="diff-type-icon">${diffTypeIcon}</span>
                        <span class="diff-filename">${fileName}</span>
                        <span class="diff-path">${diff.filePath}</span>
                    </div>
                    <div class="diff-status">
                        <span class="security-indicator" title="Security Risk: ${securityRisk}">${securityIcon}</span>
                        <span class="approval-status">${this.getApprovalStatusText(diff.approvalStatus)}</span>
                    </div>
                </div>

                ${this.renderDiffContent(diff)}

                <div class="diff-actions">
                    ${diff.approvalStatus === 'pending' ? `
                        <button class="diff-action approve" onclick="approveDiff('${diff.id}')">✅ Approve</button>
                        <button class="diff-action reject" onclick="rejectDiff('${diff.id}')">❌ Reject</button>
                    ` : ''}
                    ${diff.approvalStatus === 'approved' && !diff.applied ? `
                        <button class="diff-action apply" onclick="applyDiff('${diff.id}')">🚀 Apply</button>
                    ` : ''}
                    <button class="diff-action preview" onclick="previewDiff('${diff.id}')">👁️ Preview</button>
                </div>

                ${this.renderDiffImpact(diff)}
            </div>
        `;
    }

    /**
     * Render diff content with syntax highlighting
     */
    private renderDiffContent(diff: CodeDiff): string {
        if (diff.hunks && diff.hunks.length > 0) {
            return `
                <div class="diff-content">
                    ${diff.hunks.map(hunk => this.renderDiffHunk(hunk)).join('')}
                </div>
            `;
        } else {
            // Fallback to simple diff
            return this.renderSimpleDiff(diff);
        }
    }

    /**
     * Render a diff hunk
     */
    private renderDiffHunk(hunk: DiffHunk): string {
        return `
            <div class="diff-hunk">
                <div class="hunk-header">
                    @@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@ ${hunk.context}
                </div>
                <div class="hunk-lines">
                    ${hunk.lines.map(line => this.renderDiffLine(line)).join('')}
                </div>
            </div>
        `;
    }

    /**
     * Render a diff line
     */
    private renderDiffLine(line: DiffLine): string {
        const lineClass = `diff-line ${line.type}`;
        const linePrefix = line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' ';
        const securityClass = line.hasSecurityIssue ? 'security-issue' : '';
        const qualityClass = line.hasQualityIssue ? 'quality-issue' : '';

        return `
            <div class="${lineClass} ${securityClass} ${qualityClass}">
                <span class="line-number">${line.lineNumber}</span>
                <span class="line-prefix">${linePrefix}</span>
                <span class="line-content">${this.escapeHtml(line.content)}</span>
            </div>
        `;
    }

    /**
     * Render simple diff (fallback)
     */
    private renderSimpleDiff(diff: CodeDiff): string {
        const oldLines = diff.oldContent.split('\n');
        const newLines = diff.newContent.split('\n');
        const maxLines = Math.max(oldLines.length, newLines.length);

        let diffHtml = '<div class="simple-diff">';

        for (let i = 0; i < Math.min(maxLines, 10); i++) { // Limit to 10 lines for preview
            const oldLine = oldLines[i] || '';
            const newLine = newLines[i] || '';

            if (oldLine !== newLine) {
                if (oldLine) {
                    diffHtml += `<div class="diff-line remove">- ${this.escapeHtml(oldLine)}</div>`;
                }
                if (newLine) {
                    diffHtml += `<div class="diff-line add">+ ${this.escapeHtml(newLine)}</div>`;
                }
            } else if (oldLine) {
                diffHtml += `<div class="diff-line context">  ${this.escapeHtml(oldLine)}</div>`;
            }
        }

        if (maxLines > 10) {
            diffHtml += `<div class="diff-more">... and ${maxLines - 10} more lines</div>`;
        }

        diffHtml += '</div>';
        return diffHtml;
    }

    /**
     * Render diff impact information
     */
    private renderDiffImpact(diff: CodeDiff): string {
        let impactHtml = '';

        if (diff.securityImpact && diff.securityImpact.issues.length > 0) {
            impactHtml += `
                <div class="impact-section security-impact">
                    <strong>🔒 Security Impact (${diff.securityImpact.riskLevel}):</strong>
                    <ul>
                        ${diff.securityImpact.issues.map(issue => `<li>${issue}</li>`).join('')}
                    </ul>
                    ${diff.securityImpact.recommendations.length > 0 ? `
                        <strong>Recommendations:</strong>
                        <ul>
                            ${diff.securityImpact.recommendations.map(rec => `<li>${rec}</li>`).join('')}
                        </ul>
                    ` : ''}
                </div>
            `;
        }

        if (diff.qualityImpact && diff.qualityImpact.issues.length > 0) {
            impactHtml += `
                <div class="impact-section quality-impact">
                    <strong>🔍 Quality Impact:</strong>
                    <ul>
                        ${diff.qualityImpact.issues.map(issue => `<li>${issue}</li>`).join('')}
                    </ul>
                    ${diff.qualityImpact.improvements.length > 0 ? `
                        <strong>Improvements:</strong>
                        <ul>
                            ${diff.qualityImpact.improvements.map(imp => `<li>${imp}</li>`).join('')}
                        </ul>
                    ` : ''}
                </div>
            `;
        }

        return impactHtml ? `<div class="diff-impact">${impactHtml}</div>` : '';
    }

    /**
     * Get approval status text
     */
    private getApprovalStatusText(status?: string): string {
        switch (status) {
            case 'approved': return '✅ Approved';
            case 'rejected': return '❌ Rejected';
            case 'pending': return '⏳ Pending';
            default: return '📋 Ready';
        }
    }

    /**
     * Render interactive graph visualization
     */
    private renderInteractiveGraph(graphData: any): string {
        if (graphData.error) {
            return `<div class="graph-error">❌ ${graphData.error}</div>`;
        }

        const centerNode = graphData.centerNode;
        const dependencies = graphData.dependencies || [];
        const dependents = graphData.dependents || [];
        const impact = graphData.impactAnalysis || {};

        return `
            <div class="interactive-graph">
                <h4>🕸️ Interactive Dependency Graph</h4>

                <div class="graph-container">
                    <div class="graph-center">
                        <div class="center-node" onclick="exploreNode('${centerNode.name}', '${centerNode.file}')">
                            <span class="node-icon">🎯</span>
                            <span class="node-name">${centerNode.name}</span>
                            <span class="node-file">${centerNode.file.split('/').pop()}</span>
                        </div>
                    </div>

                    ${dependencies.length > 0 ? `
                        <div class="graph-section dependencies">
                            <h5>Dependencies (${dependencies.length})</h5>
                            <div class="node-list">
                                ${dependencies.slice(0, 5).map((dep: any) => `
                                    <div class="graph-node dependency" onclick="exploreNode('${dep.name}', '${dep.file}')">
                                        <span class="node-icon">📦</span>
                                        <span class="node-name">${dep.name}</span>
                                        <span class="node-type">${dep.type}</span>
                                        <span class="node-file">${dep.file.split('/').pop()}</span>
                                    </div>
                                `).join('')}
                                ${dependencies.length > 5 ? `<div class="more-nodes">... and ${dependencies.length - 5} more</div>` : ''}
                            </div>
                        </div>
                    ` : ''}

                    ${dependents.length > 0 ? `
                        <div class="graph-section dependents">
                            <h5>Dependents (${dependents.length})</h5>
                            <div class="node-list">
                                ${dependents.slice(0, 5).map((dep: any) => `
                                    <div class="graph-node dependent" onclick="exploreNode('${dep.name}', '${dep.file}')">
                                        <span class="node-icon">🔗</span>
                                        <span class="node-name">${dep.name}</span>
                                        <span class="node-type">${dep.type}</span>
                                        <span class="node-file">${dep.file.split('/').pop()}</span>
                                    </div>
                                `).join('')}
                                ${dependents.length > 5 ? `<div class="more-nodes">... and ${dependents.length - 5} more</div>` : ''}
                            </div>
                        </div>
                    ` : ''}
                </div>

                <div class="graph-impact">
                    <h5>📊 Impact Analysis</h5>
                    <div class="impact-metrics">
                        <div class="metric">
                            <span class="metric-label">Direct Impact:</span>
                            <span class="metric-value">${impact.directImpact || 0} items</span>
                        </div>
                        <div class="metric">
                            <span class="metric-label">Indirect Impact:</span>
                            <span class="metric-value">${impact.indirectImpact || 0} items</span>
                        </div>
                        <div class="metric">
                            <span class="metric-label">Risk Level:</span>
                            <span class="metric-value risk-${impact.riskLevel || 'low'}">${(impact.riskLevel || 'low').toUpperCase()}</span>
                        </div>
                        <div class="metric">
                            <span class="metric-label">Affected Files:</span>
                            <span class="metric-value">${impact.affectedFiles || 0} files</span>
                        </div>
                    </div>
                </div>

                <div class="graph-actions">
                    <button class="graph-action" onclick="exploreGraphDeep('${centerNode.name}', '${centerNode.file}', 3)">
                        🔍 Deep Explore (Depth 3)
                    </button>
                    <button class="graph-action" onclick="showTaintPath('${centerNode.name}', '${centerNode.file}')">
                        🛡️ Show Taint Path
                    </button>
                </div>

                ${graphData.interactionHints ? `
                    <div class="graph-hints">
                        <strong>💡 Interaction Hints:</strong>
                        <ul>
                            ${graphData.interactionHints.map((hint: string) => `<li>${hint}</li>`).join('')}
                        </ul>
                    </div>
                ` : ''}
            </div>
        `;
    }

    /**
     * Render graph exploration results
     */
    private renderGraphExploration(explorationData: any): string {
        const paths = explorationData.paths || [];
        const hotspots = explorationData.hotspots || [];
        const suggestions = explorationData.suggestions || [];

        return `
            <div class="graph-exploration">
                <h4>🔍 Graph Exploration Results</h4>

                <div class="exploration-summary">
                    <div class="summary-metric">
                        <span class="metric-label">Paths Found:</span>
                        <span class="metric-value">${explorationData.totalPaths || 0}</span>
                    </div>
                    <div class="summary-metric">
                        <span class="metric-label">Exploration Depth:</span>
                        <span class="metric-value">${explorationData.explorationDepth || 0}</span>
                    </div>
                    <div class="summary-metric">
                        <span class="metric-label">Hotspots:</span>
                        <span class="metric-value">${hotspots.length}</span>
                    </div>
                </div>

                ${paths.length > 0 ? `
                    <div class="exploration-section">
                        <h5>🛤️ Dependency Paths</h5>
                        <div class="path-list">
                            ${paths.map((path: any, index: number) => `
                                <div class="dependency-path risk-${path.riskLevel}">
                                    <div class="path-header">
                                        <span class="path-number">#${index + 1}</span>
                                        <span class="path-description">${path.description}</span>
                                        <span class="path-risk risk-${path.riskLevel}">${path.riskLevel.toUpperCase()}</span>
                                    </div>
                                    <div class="path-nodes">
                                        ${path.nodes.map((node: any, nodeIndex: number) => `
                                            <span class="path-node" onclick="exploreNode('${node.name}', '${node.file}')">${node.name}</span>
                                            ${nodeIndex < path.nodes.length - 1 ? '<span class="path-arrow">→</span>' : ''}
                                        `).join('')}
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}

                ${hotspots.length > 0 ? `
                    <div class="exploration-section">
                        <h5>🔥 Connectivity Hotspots</h5>
                        <div class="hotspot-list">
                            ${hotspots.map((hotspot: any) => `
                                <div class="hotspot-item" onclick="exploreNode('${hotspot.name}', '${hotspot.file}')">
                                    <span class="hotspot-name">${hotspot.name}</span>
                                    <span class="hotspot-connections">${hotspot.connections} connections</span>
                                    <span class="hotspot-file">${hotspot.file.split('/').pop()}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}

                ${suggestions.length > 0 ? `
                    <div class="exploration-section">
                        <h5>💡 Architectural Suggestions</h5>
                        <ul class="suggestion-list">
                            ${suggestions.map((suggestion: string) => `<li>${suggestion}</li>`).join('')}
                        </ul>
                    </div>
                ` : ''}
            </div>
        `;
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

            function approveDiff(diffId) {
                vscode.postMessage({
                    command: 'approveDiff',
                    diffId: diffId
                });
            }

            function rejectDiff(diffId) {
                vscode.postMessage({
                    command: 'rejectDiff',
                    diffId: diffId
                });
            }

            function applyDiff(diffId) {
                vscode.postMessage({
                    command: 'applyDiff',
                    diffId: diffId
                });
            }

            function previewDiff(diffId) {
                vscode.postMessage({
                    command: 'previewDiff',
                    diffId: diffId
                });
            }

            function showSampleDiff() {
                vscode.postMessage({
                    command: 'showSampleDiff'
                });
            }

            function showGraphPopover() {
                vscode.postMessage({
                    command: 'showGraphPopover'
                });
            }

            function exploreNode(symbolName, filePath) {
                vscode.postMessage({
                    command: 'showGraphPopover',
                    symbolName: symbolName,
                    filePath: filePath
                });
            }

            function exploreGraphDeep(symbolName, filePath, depth) {
                vscode.postMessage({
                    command: 'exploreGraph',
                    symbolName: symbolName,
                    filePath: filePath,
                    depth: depth
                });
            }

            function showTaintPath(symbolName, filePath) {
                vscode.postMessage({
                    command: 'exploreGraph',
                    symbolName: symbolName,
                    filePath: filePath,
                    depth: 5
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
     * Generate cache key for responses
     */
    private generateCacheKey(userMessage: string, context: ChatContext): string {
        const contextHash = JSON.stringify({
            activeFile: context.activeFile,
            workspaceRoot: context.workspaceRoot,
            companionGuardStatus: context.companionGuardStatus?.issues?.length || 0
        });

        return `chat_${Buffer.from(userMessage + contextHash).toString('base64').slice(0, 50)}`;
    }

    /**
     * Get cached response if available
     */
    private async getCachedResponse(cacheKey: string): Promise<{content: string, metadata: any} | null> {
        try {
            // Use performance cache for sub-100ms lookups
            const cached = this.responseCache?.get(cacheKey);
            if (cached) {
                this.contextLogger.debug('Cache hit for chat response', { key: cacheKey.slice(0, 20) });
                return JSON.parse(cached);
            }
            return null;
        } catch (error) {
            this.contextLogger.warn('Cache lookup failed', error as Error);
            return null;
        }
    }

    /**
     * Cache response for future use
     */
    private cacheResponse(cacheKey: string, response: {content: string, metadata: any}): void {
        try {
            if (this.responseCache) {
                // Cache for 10 minutes for chat responses
                this.responseCache.set(cacheKey, JSON.stringify(response), 600000);
                this.contextLogger.debug('Cached chat response', { key: cacheKey.slice(0, 20) });
            }
        } catch (error) {
            this.contextLogger.warn('Failed to cache response', error as Error);
        }
    }

    /**
     * Show typing indicator
     */
    private showTypingIndicator(assistantMessage: ChatMessage): void {
        assistantMessage.content = '⚡ Thinking...';
        assistantMessage.metadata = { typing: true };
        this.updateWebviewContentImmediate();
    }

    /**
     * Simulate streaming for cached responses
     */
    private async simulateStreamingResponse(response: {content: string, metadata: any}, assistantMessage: ChatMessage): Promise<void> {
        const words = response.content.split(' ');
        const chunkSize = Math.max(1, Math.floor(words.length / 10)); // 10 chunks

        for (let i = 0; i < words.length; i += chunkSize) {
            const chunk = words.slice(i, i + chunkSize).join(' ');
            assistantMessage.content = words.slice(0, i + chunkSize).join(' ');
            assistantMessage.metadata = response.metadata;

            this.updateWebviewContentImmediate();

            // Small delay to simulate streaming (50ms for responsiveness)
            await new Promise(resolve => setTimeout(resolve, 50));
        }
    }

    /**
     * Stream response to UI in real-time
     */
    private async streamResponseToUI(response: {content: string, metadata: any}, assistantMessage: ChatMessage): Promise<void> {
        // For now, update immediately - real streaming would require API support
        assistantMessage.content = response.content;
        assistantMessage.metadata = response.metadata;
        this.updateWebviewContentImmediate();
    }

    /**
     * Generate webview content synchronously for immediate updates
     */
    private generateWebviewContentSync(): string {
        // Simplified synchronous version for immediate updates
        const messagesHtml = this.renderMessages();

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>FlowCode Chat</title>
    <style>${this.getChatStyles()}</style>
</head>
<body>
    <div class="chat-container">
        <div class="chat-header">
            <h2>💬 FlowCode Assistant</h2>
            <div class="status-indicator ${this.isStreaming ? 'streaming' : 'ready'}">
                ${this.isStreaming ? '⚡ Processing...' : '✅ Ready'}
            </div>
        </div>
        <div class="messages-container" id="messagesContainer">
            ${messagesHtml}
        </div>
        <div class="input-container">
            <div class="context-buttons">
                <button onclick="addFileContext()" title="Add file context">📁</button>
                <button onclick="addFolderContext()" title="Add folder context">📂</button>
                <button onclick="addProblemsContext()" title="Add problems context">⚠️</button>
            </div>
            <div class="input-wrapper">
                <textarea id="messageInput" placeholder="Ask FlowCode anything..." rows="3"></textarea>
                <button onclick="sendMessage()" id="sendButton" ${this.isStreaming ? 'disabled' : ''}>
                    ${this.isStreaming ? '⏳' : '➤'}
                </button>
            </div>
        </div>
    </div>
    <script>${this.getChatScript()}</script>
</body>
</html>`;
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
