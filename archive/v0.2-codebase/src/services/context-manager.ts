import * as vscode from 'vscode';
import { ConfigurationManager } from '../utils/configuration-manager';
import { logger } from '../utils/logger';
import { ContextCompressionService, CompressedContext, CompressionRequest, ContextItem } from './context-compression-service';
import { ContextAnalyzer, ContextAnalysisResult } from './context-analyzer';

/**
 * Context request configuration
 */
export interface ContextRequest {
    userQuery?: string;
    targetTokens?: number;
    includeActiveFile?: boolean;
    includeSelection?: boolean;
    includeDependencies?: boolean;
    includeTests?: boolean;
    includeDocumentation?: boolean;
    maxFiles?: number;
    compressionProvider?: 'openai' | 'anthropic' | 'deepseek' | 'gemini';
    preserveStructure?: boolean;
}

/**
 * Enhanced context result with both analysis and compression
 */
export interface EnhancedContext {
    analysis: ContextAnalysisResult;
    compression?: CompressedContext;
    finalContext: string;
    compressionApplied?: boolean;
    metadata: {
        totalOriginalSize: number;
        finalSize: number;
        compressionRatio: number;
        processingTime: number;
        provider?: string;
        model?: string;
        timestamp: number;
    };
}

/**
 * Context Manager Service
 * 
 * Orchestrates context analysis and compression to provide optimal context
 * for AI interactions. Manages the flow between context gathering, analysis,
 * and intelligent compression.
 */
export class ContextManager {
    private readonly contextLogger = logger.createContextLogger('ContextManager');
    private readonly contextAnalyzer: ContextAnalyzer;
    private readonly compressionService: ContextCompressionService;

    constructor(
        private configManager: ConfigurationManager,
        compressionService?: ContextCompressionService
    ) {
        this.contextAnalyzer = new ContextAnalyzer();
        this.compressionService = compressionService || new ContextCompressionService(configManager);

        this.contextLogger.info('ContextManager initialized');
    }

    /**
     * Get enhanced context for AI interactions
     */
    public async getEnhancedContext(request: ContextRequest = {}): Promise<EnhancedContext> {
        const startTime = Date.now();
        
        try {
            this.contextLogger.info('Getting enhanced context', {
                userQuery: request.userQuery?.substring(0, 100),
                targetTokens: request.targetTokens,
                compressionProvider: request.compressionProvider
            });

            // Step 1: Analyze context
            const analysis = await this.contextAnalyzer.analyzeContext(
                request.userQuery,
                {
                    maxFiles: request.maxFiles,
                    includeTests: request.includeTests,
                    includeDocumentation: request.includeDocumentation,
                    includeDependencies: request.includeDependencies
                }
            );

            this.contextLogger.debug('Context analysis completed', {
                itemCount: analysis.items.length,
                totalSize: analysis.totalSize
            });

            // Step 2: Determine if compression is needed
            const targetTokens = request.targetTokens || await this.getOptimalTokenLimit(request.compressionProvider);
            let compression: CompressedContext | undefined;
            let finalContext: string;

            this.contextLogger.info('Compression decision', {
                analysisSize: analysis.totalSize,
                targetTokens,
                needsCompression: analysis.totalSize > targetTokens
            });

            if (analysis.totalSize > targetTokens) {
                this.contextLogger.info('Context exceeds target size, applying compression', {
                    originalSize: analysis.totalSize,
                    targetSize: targetTokens
                });

                // Step 3: Compress context
                const compressionRequest: CompressionRequest = {
                    items: analysis.items,
                    targetSize: targetTokens,
                    userQuery: request.userQuery,
                    config: {
                        provider: request.compressionProvider,
                        preserveStructure: request.preserveStructure
                    }
                };

                compression = await this.compressionService.compressContext(compressionRequest);
                finalContext = compression.compressedContent;

                this.contextLogger.info('Context compression completed', {
                    originalSize: compression.originalSize,
                    compressedSize: compression.compressedSize,
                    compressionRatio: compression.compressionRatio
                });

            } else {
                // No compression needed
                finalContext = this.combineContextItems(analysis.items);
                this.contextLogger.info('No compression needed', {
                    originalSize: analysis.totalSize,
                    targetSize: targetTokens
                });
            }

            // Step 4: Build enhanced context result
            const processingTime = Date.now() - startTime;
            const finalSize = this.estimateTokenCount(finalContext);

            const enhancedContext: EnhancedContext = {
                analysis,
                compression,
                finalContext,
                compressionApplied: !!compression,
                metadata: {
                    totalOriginalSize: analysis.totalSize,
                    finalSize,
                    compressionRatio: compression?.compressionRatio || 1.0,
                    processingTime,
                    provider: compression?.metadata.provider,
                    model: compression?.metadata.model,
                    timestamp: Date.now()
                }
            };

            this.contextLogger.info('Enhanced context ready', {
                originalSize: enhancedContext.metadata.totalOriginalSize,
                finalSize: enhancedContext.metadata.finalSize,
                compressionRatio: enhancedContext.metadata.compressionRatio,
                processingTime: enhancedContext.metadata.processingTime
            });

            return enhancedContext;

        } catch (error) {
            this.contextLogger.error('Failed to get enhanced context', error as Error);
            throw new Error(`Context enhancement failed: ${(error as Error).message}`);
        }
    }

    /**
     * Get context for chat interface
     */
    public async getChatContext(userMessage: string, targetTokens?: number): Promise<EnhancedContext> {
        // Use a more reasonable default for chat contexts to encourage compression
        const chatTargetTokens = targetTokens || 16000; // 16K tokens is reasonable for chat

        return this.getEnhancedContext({
            userQuery: userMessage,
            targetTokens: chatTargetTokens,
            includeActiveFile: true,
            includeSelection: true,
            includeDependencies: true,
            includeTests: false, // Usually not needed for chat
            includeDocumentation: true,
            maxFiles: 20
        });
    }

    /**
     * Get context for inline suggestions
     */
    public async getInlineContext(targetTokens?: number): Promise<EnhancedContext> {
        return this.getEnhancedContext({
            targetTokens: targetTokens || 4000, // Smaller context for inline
            includeActiveFile: true,
            includeSelection: true,
            includeDependencies: true,
            includeTests: false,
            includeDocumentation: false,
            maxFiles: 10,
            preserveStructure: true
        });
    }

    /**
     * Get context for code generation
     */
    public async getCodeGenerationContext(
        description: string, 
        targetTokens?: number
    ): Promise<EnhancedContext> {
        return this.getEnhancedContext({
            userQuery: description,
            targetTokens,
            includeActiveFile: true,
            includeSelection: true,
            includeDependencies: true,
            includeTests: true, // Include tests for better code generation
            includeDocumentation: true,
            maxFiles: 30,
            preserveStructure: true
        });
    }

    /**
     * Get context for refactoring
     */
    public async getRefactoringContext(
        refactoringType: string,
        targetTokens?: number
    ): Promise<EnhancedContext> {
        return this.getEnhancedContext({
            userQuery: `Refactoring: ${refactoringType}`,
            targetTokens,
            includeActiveFile: true,
            includeSelection: true,
            includeDependencies: true,
            includeTests: true, // Important for refactoring validation
            includeDocumentation: false,
            maxFiles: 25,
            preserveStructure: true
        });
    }

    /**
     * Get optimal token limit based on provider
     */
    private async getOptimalTokenLimit(provider?: string): Promise<number> {
        try {
            const config = await this.compressionService.getOptimalConfig(provider);
            
            // Reserve tokens for response (typically 20-30% of max)
            const responseReserve = Math.floor(config.maxInputTokens * 0.25);
            return config.maxInputTokens - responseReserve;

        } catch (error) {
            this.contextLogger.warn('Failed to get optimal token limit, using default', error as Error);
            return 8000; // Conservative default
        }
    }

    /**
     * Combine context items into a single string
     */
    private combineContextItems(items: ContextItem[]): string {
        return items
            .sort((a, b) => b.importance - a.importance)
            .map(item => {
                let header = `\n--- ${item.type.toUpperCase()}`;
                if (item.path) {
                    header += `: ${item.path}`;
                } else if (item.id) {
                    header += `: ${item.id}`;
                }
                header += ` (importance: ${item.importance.toFixed(2)}) ---\n`;
                
                return header + item.content;
            })
            .join('\n');
    }

    /**
     * Estimate token count for text
     */
    private estimateTokenCount(text: string): number {
        return Math.ceil(text.length / 4);
    }

    /**
     * Get context statistics
     */
    public async getContextStatistics(): Promise<{
        cacheSize: number;
        recentCompressions: number;
        averageCompressionRatio: number;
        totalProcessingTime: number;
    }> {
        // This would gather statistics from the compression service
        // For now, return placeholder data
        return {
            cacheSize: 0,
            recentCompressions: 0,
            averageCompressionRatio: 0.3,
            totalProcessingTime: 0
        };
    }

    /**
     * Clear context cache
     */
    public async clearCache(): Promise<void> {
        try {
            // This would clear the compression cache
            this.contextLogger.info('Context cache cleared');
        } catch (error) {
            this.contextLogger.error('Failed to clear context cache', error as Error);
            throw error;
        }
    }

    /**
     * Validate context configuration
     */
    public async validateConfiguration(): Promise<{
        isValid: boolean;
        issues: string[];
        recommendations: string[];
    }> {
        const issues: string[] = [];
        const recommendations: string[] = [];

        try {
            // Check API configuration
            const apiConfig = await this.configManager.getApiConfiguration();
            
            if (!apiConfig.apiKey) {
                issues.push('No API key configured');
            }

            // Check workspace
            if (!vscode.workspace.workspaceFolders?.length) {
                issues.push('No workspace folder open');
            }

            // Check compression provider availability
            const compressionConfig = await this.compressionService.getOptimalConfig();
            if (compressionConfig.maxInputTokens < 8000) {
                recommendations.push('Consider using a provider with larger context window for better compression');
            }

            return {
                isValid: issues.length === 0,
                issues,
                recommendations
            };

        } catch (error) {
            this.contextLogger.error('Configuration validation failed', error as Error);
            return {
                isValid: false,
                issues: [`Configuration validation failed: ${(error as Error).message}`],
                recommendations: ['Check your API configuration and try again']
            };
        }
    }
}
