import * as vscode from 'vscode';
import { ConfigurationManager } from '../utils/configuration-manager';
import { ContextManager } from './context-manager';
import { ArchitectService } from './architect-service';
import { CompanionGuard } from './companion-guard';
import { logger } from '../utils/logger';
import { CacheManager, PerformanceCache } from '../utils/performance-cache';

/**
 * Smart completion item with confidence scoring
 */
export interface SmartCompletionItem extends vscode.CompletionItem {
    confidence: number;
    contextRelevance: number;
    aiGenerated: boolean;
    source: 'ai' | 'intellisense' | 'hybrid';
}

/**
 * Completion context for AI suggestions
 */
export interface CompletionContext {
    document: vscode.TextDocument;
    position: vscode.Position;
    triggerCharacter?: string;
    linePrefix: string;
    lineSuffix: string;
    currentWord: string;
    surroundingContext: string;
}

/**
 * Smart Autocomplete Service
 * 
 * Provides AI-powered code completion that integrates with VS Code's IntelliSense
 * system. Combines traditional completions with intelligent AI suggestions based
 * on context compression and confidence scoring.
 */
export class SmartAutocompleteService implements vscode.CompletionItemProvider {
    private contextLogger = logger.createContextLogger('SmartAutocompleteService');
    private completionCache: PerformanceCache<SmartCompletionItem[]>;
    private isEnabled = true;
    private supportedLanguages = ['typescript', 'javascript', 'python', 'java', 'csharp', 'go', 'rust'];

    constructor(
        private configManager: ConfigurationManager,
        private contextManager: ContextManager,
        private architectService: ArchitectService,
        private companionGuard: CompanionGuard
    ) {
        // Initialize completion cache for fast responses
        this.completionCache = CacheManager.getCache<SmartCompletionItem[]>('smart-completions', {
            maxSize: 5 * 1024 * 1024, // 5MB
            maxEntries: 1000,
            defaultTTL: 300000 // 5 minutes
        });

        this.contextLogger.info('SmartAutocompleteService initialized');
    }

    /**
     * Provide completion items
     */
    public async provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken,
        context: vscode.CompletionContext
    ): Promise<vscode.CompletionItem[] | vscode.CompletionList> {
        if (!this.isEnabled || !this.supportedLanguages.includes(document.languageId)) {
            return [];
        }

        const startTime = performance.now();

        try {
            // Build completion context
            const completionContext = this.buildCompletionContext(document, position, context.triggerCharacter);
            
            // Check cache first for instant responses
            const cacheKey = this.generateCacheKey(completionContext);
            const cachedItems = this.completionCache.get(cacheKey);
            
            if (cachedItems && !token.isCancellationRequested) {
                this.contextLogger.info('Returning cached completions', {
                    count: cachedItems.length,
                    duration: performance.now() - startTime
                });
                return cachedItems;
            }

            // Get AI-powered completions
            const aiCompletions = await this.getAICompletions(completionContext, token);
            
            // Enhance with confidence scoring
            const enhancedCompletions = await this.enhanceWithConfidence(aiCompletions, completionContext);
            
            // Sort by confidence and relevance
            const sortedCompletions = this.sortCompletions(enhancedCompletions);
            
            // Cache results
            this.completionCache.set(cacheKey, sortedCompletions);
            
            const duration = performance.now() - startTime;
            this.contextLogger.info('Smart completions provided', {
                count: sortedCompletions.length,
                duration,
                target: 200, // Target <200ms for autocomplete
                achieved: duration < 200
            });

            return sortedCompletions;

        } catch (error) {
            this.contextLogger.error('Failed to provide smart completions', error as Error);
            return [];
        }
    }

    /**
     * Resolve completion item with additional details
     */
    public async resolveCompletionItem(
        item: vscode.CompletionItem,
        token: vscode.CancellationToken
    ): Promise<vscode.CompletionItem> {
        const smartItem = item as SmartCompletionItem;
        
        if (smartItem.aiGenerated && !item.documentation) {
            try {
                // Add AI-generated documentation
                item.documentation = new vscode.MarkdownString(
                    `**AI Suggestion** (${smartItem.confidence}% confidence)\n\n` +
                    `Generated based on ${smartItem.source} analysis with ${smartItem.contextRelevance}% context relevance.`
                );
                
                // Add confidence indicator
                if (smartItem.confidence >= 80) {
                    item.documentation.appendMarkdown('\n\n🟢 **High Confidence**');
                } else if (smartItem.confidence >= 60) {
                    item.documentation.appendMarkdown('\n\n🟡 **Medium Confidence**');
                } else {
                    item.documentation.appendMarkdown('\n\n🔴 **Low Confidence**');
                }
                
            } catch (error) {
                this.contextLogger.warn('Failed to resolve completion item', error as Error);
            }
        }

        return item;
    }

    /**
     * Build completion context from document and position
     */
    private buildCompletionContext(
        document: vscode.TextDocument,
        position: vscode.Position,
        triggerCharacter?: string
    ): CompletionContext {
        const line = document.lineAt(position);
        const linePrefix = line.text.substring(0, position.character);
        const lineSuffix = line.text.substring(position.character);
        
        // Get current word being typed
        const wordRange = document.getWordRangeAtPosition(position);
        const currentWord = wordRange ? document.getText(wordRange) : '';
        
        // Get surrounding context (5 lines before and after)
        const startLine = Math.max(0, position.line - 5);
        const endLine = Math.min(document.lineCount - 1, position.line + 5);
        const surroundingRange = new vscode.Range(startLine, 0, endLine, document.lineAt(endLine).text.length);
        const surroundingContext = document.getText(surroundingRange);

        return {
            document,
            position,
            triggerCharacter,
            linePrefix,
            lineSuffix,
            currentWord,
            surroundingContext
        };
    }

    /**
     * Get AI-powered completion suggestions
     */
    private async getAICompletions(
        context: CompletionContext,
        token: vscode.CancellationToken
    ): Promise<SmartCompletionItem[]> {
        try {
            // Use context manager for intelligent context
            const enhancedContext = await this.contextManager.getInlineContext(
                1000 // Target 1000 tokens for autocomplete
            );

            // Build completion prompt
            const prompt = this.buildCompletionPrompt(context, enhancedContext);
            
            // Get AI suggestions (with timeout for responsiveness)
            const aiResponse = await Promise.race([
                this.architectService.generateResponse({
                    userMessage: prompt,
                    activeFile: context.document.fileName,
                    workspaceRoot: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
                }),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('AI completion timeout')), 150)
                )
            ]);

            if (token.isCancellationRequested) {
                return [];
            }

            // Parse AI response into completion items
            return this.parseAIResponse((aiResponse as any).content, context);

        } catch (error) {
            this.contextLogger.warn('AI completions failed, using fallback', error as Error);
            return this.getFallbackCompletions(context);
        }
    }

    /**
     * Build completion prompt for AI
     */
    private buildCompletionPrompt(context: CompletionContext, enhancedContext: any): string {
        return `Complete the following ${context.document.languageId} code:

Context:
${enhancedContext.finalContext}

Current line: ${context.linePrefix}█${context.lineSuffix}

Provide 3-5 relevant completions for the cursor position (█). Format as JSON array:
[
  {
    "text": "completion text",
    "description": "brief description",
    "type": "function|variable|class|keyword|snippet"
  }
]

Focus on:
- Context-appropriate suggestions
- Common patterns in this codebase
- Language-specific best practices
- Type-safe completions when applicable`;
    }

    /**
     * Parse AI response into completion items
     */
    private parseAIResponse(response: string, context: CompletionContext): SmartCompletionItem[] {
        try {
            // Extract JSON from response
            const jsonMatch = response.match(/\[[\s\S]*\]/);
            if (!jsonMatch) {
                return [];
            }

            const suggestions = JSON.parse(jsonMatch[0]);
            
            return suggestions.map((suggestion: any, index: number) => {
                const item: SmartCompletionItem = {
                    label: suggestion.text,
                    detail: suggestion.description,
                    kind: this.getCompletionKind(suggestion.type),
                    insertText: suggestion.text,
                    confidence: 70 + (5 - index) * 5, // Higher confidence for earlier suggestions
                    contextRelevance: 75,
                    aiGenerated: true,
                    source: 'ai',
                    sortText: `ai_${index.toString().padStart(2, '0')}`
                };

                return item;
            });

        } catch (error) {
            this.contextLogger.warn('Failed to parse AI response', error as Error);
            return [];
        }
    }

    /**
     * Get completion kind from type string
     */
    private getCompletionKind(type: string): vscode.CompletionItemKind {
        switch (type) {
            case 'function': return vscode.CompletionItemKind.Function;
            case 'variable': return vscode.CompletionItemKind.Variable;
            case 'class': return vscode.CompletionItemKind.Class;
            case 'keyword': return vscode.CompletionItemKind.Keyword;
            case 'snippet': return vscode.CompletionItemKind.Snippet;
            default: return vscode.CompletionItemKind.Text;
        }
    }

    /**
     * Get fallback completions when AI fails
     */
    private getFallbackCompletions(context: CompletionContext): SmartCompletionItem[] {
        // Provide basic language-specific completions
        const fallbacks: SmartCompletionItem[] = [];
        
        if (context.document.languageId === 'typescript' || context.document.languageId === 'javascript') {
            fallbacks.push({
                label: 'console.log',
                insertText: 'console.log($1)',
                kind: vscode.CompletionItemKind.Function,
                confidence: 60,
                contextRelevance: 50,
                aiGenerated: false,
                source: 'intellisense'
            });
        }

        return fallbacks;
    }

    /**
     * Enhance completions with confidence scoring
     */
    private async enhanceWithConfidence(
        items: SmartCompletionItem[],
        context: CompletionContext
    ): Promise<SmartCompletionItem[]> {
        // Get companion guard status for context quality
        const guardStatus = await this.companionGuard.getStatus();
        const hasIssues = guardStatus.issues && guardStatus.issues.length > 0;

        return items.map(item => {
            // Adjust confidence based on context quality
            if (hasIssues) {
                item.confidence = Math.max(item.confidence - 10, 0);
            }

            // Boost confidence for exact matches
            const labelText = typeof item.label === 'string' ? item.label : item.label.label;
            if (labelText.toLowerCase().startsWith(context.currentWord.toLowerCase())) {
                item.confidence = Math.min(item.confidence + 15, 100);
                item.contextRelevance = Math.min(item.contextRelevance + 20, 100);
            }

            return item;
        });
    }

    /**
     * Sort completions by confidence and relevance
     */
    private sortCompletions(items: SmartCompletionItem[]): SmartCompletionItem[] {
        return items.sort((a, b) => {
            // Primary sort: confidence
            const confidenceDiff = b.confidence - a.confidence;
            if (confidenceDiff !== 0) return confidenceDiff;
            
            // Secondary sort: context relevance
            const relevanceDiff = b.contextRelevance - a.contextRelevance;
            if (relevanceDiff !== 0) return relevanceDiff;
            
            // Tertiary sort: AI-generated items first
            if (a.aiGenerated && !b.aiGenerated) return -1;
            if (!a.aiGenerated && b.aiGenerated) return 1;
            
            return 0;
        });
    }

    /**
     * Generate cache key for completion context
     */
    private generateCacheKey(context: CompletionContext): string {
        return `${context.document.fileName}:${context.position.line}:${context.linePrefix}:${context.currentWord}`;
    }

    /**
     * Enable/disable smart autocomplete
     */
    public setEnabled(enabled: boolean): void {
        this.isEnabled = enabled;
        this.contextLogger.info(`Smart autocomplete ${enabled ? 'enabled' : 'disabled'}`);
    }

    /**
     * Clear completion cache
     */
    public clearCache(): void {
        this.completionCache.clear();
        this.contextLogger.info('Completion cache cleared');
    }
}
