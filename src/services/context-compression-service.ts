import { ConfigurationManager, ApiConfiguration } from '../utils/configuration-manager';
import { logger } from '../utils/logger';
import { AdvancedCache, CACHE_STRATEGIES } from '../utils/advanced-cache';
import { CacheManager } from '../utils/performance-cache';

/**
 * Context compression configuration
 */
export interface ContextCompressionConfig {
    provider: 'openai' | 'anthropic' | 'deepseek' | 'gemini';
    model: string;
    maxInputTokens: number;
    maxOutputTokens: number;
    compressionRatio: number; // Target compression ratio (0.1 = compress to 10% of original)
    preserveStructure: boolean;
    preserveCodeBlocks: boolean;
    preserveImportantSymbols: boolean;
}

/**
 * Context item with metadata
 */
export interface ContextItem {
    id: string;
    type: 'file' | 'selection' | 'symbol' | 'dependency' | 'documentation';
    content: string;
    path?: string;
    importance: number; // 0-1 scale
    size: number; // in tokens/characters
    metadata?: Record<string, any>;
}

/**
 * Compressed context result
 */
export interface CompressedContext {
    originalSize: number;
    compressedSize: number;
    compressionRatio: number;
    compressedContent: string;
    preservedItems: string[]; // IDs of items that were preserved
    summary: string;
    metadata: {
        provider: string;
        model: string;
        timestamp: number;
        processingTime: number;
    };
}

/**
 * Context compression request
 */
export interface CompressionRequest {
    items: ContextItem[];
    targetSize: number;
    preserveTypes?: string[];
    userQuery?: string;
    config?: Partial<ContextCompressionConfig>;
}

/**
 * Context Compression Service
 * 
 * Intelligently compresses codebase context using AI models to fit within token limits
 * while preserving the most relevant information for the current task.
 */
export class ContextCompressionService {
    private readonly contextLogger = logger.createContextLogger('ContextCompressionService');
    private readonly compressionCache: AdvancedCache<CompressedContext>;
    private readonly defaultConfig: ContextCompressionConfig;

    constructor(private configManager: ConfigurationManager) {
        // Initialize cache for compression results
        this.compressionCache = CacheManager.getAdvancedCache<CompressedContext>(
            'context-compression',
            50 * 1024 * 1024, // 50MB cache
            1000, // 1000 entries
            30 * 60 * 1000, // 30 minutes TTL
            CACHE_STRATEGIES.LRU // Least Recently Used
        );

        // Default compression configuration
        this.defaultConfig = {
            provider: 'openai',
            model: 'gpt-4-turbo-preview',
            maxInputTokens: 128000,
            maxOutputTokens: 4000,
            compressionRatio: 0.3, // Compress to 30% of original
            preserveStructure: true,
            preserveCodeBlocks: true,
            preserveImportantSymbols: true
        };

        this.contextLogger.info('ContextCompressionService initialized');
    }

    /**
     * Compress context items to fit within token limits
     */
    public async compressContext(request: CompressionRequest): Promise<CompressedContext> {
        try {
            const startTime = Date.now();
            
            // Generate cache key
            const cacheKey = this.generateCacheKey(request);
            
            // Check cache first
            const cached = this.compressionCache.get(cacheKey);
            if (cached) {
                this.contextLogger.debug('Returning cached compression result');
                return cached;
            }

            // Merge with default config
            const config = { ...this.defaultConfig, ...request.config };
            
            // Calculate original size
            const originalSize = this.calculateTotalSize(request.items);
            
            this.contextLogger.info('Starting context compression', {
                itemCount: request.items.length,
                originalSize,
                targetSize: request.targetSize,
                provider: config.provider
            });

            // If already within target size, return as-is
            if (originalSize <= request.targetSize) {
                const result: CompressedContext = {
                    originalSize,
                    compressedSize: originalSize,
                    compressionRatio: 1.0,
                    compressedContent: this.combineItems(request.items),
                    preservedItems: request.items.map(item => item.id),
                    summary: 'No compression needed - content already within target size',
                    metadata: {
                        provider: config.provider,
                        model: config.model,
                        timestamp: Date.now(),
                        processingTime: Date.now() - startTime
                    }
                };
                
                this.compressionCache.set(cacheKey, result);
                return result;
            }

            // Perform intelligent compression
            const compressed = await this.performCompression(request, config);
            
            // Cache the result
            this.compressionCache.set(cacheKey, compressed);
            
            this.contextLogger.info('Context compression completed', {
                originalSize: compressed.originalSize,
                compressedSize: compressed.compressedSize,
                compressionRatio: compressed.compressionRatio,
                processingTime: compressed.metadata.processingTime
            });

            return compressed;

        } catch (error) {
            this.contextLogger.error('Context compression failed', error as Error);
            throw new Error(`Context compression failed: ${(error as Error).message}`);
        }
    }

    /**
     * Get optimal compression configuration for a provider
     */
    public async getOptimalConfig(provider?: string): Promise<ContextCompressionConfig> {
        try {
            // TEMPORARY FIX: If provider is explicitly passed, use it directly
            if (provider) {
                return this.getConfigForProvider(provider);
            }

            const apiConfig = await this.configManager.getApiConfiguration();
            const targetProvider = apiConfig.provider;

            return this.getConfigForProvider(targetProvider);

        } catch (error) {
            this.contextLogger.warn('Failed to get optimal config, using default', error as Error);
            return this.defaultConfig;
        }
    }

    /**
     * Get configuration for a specific provider (helper method)
     */
    private getConfigForProvider(provider: string): ContextCompressionConfig {
        switch (provider) {
            case 'openai':
                return {
                    ...this.defaultConfig,
                    provider: 'openai' as const,
                    model: 'gpt-4-turbo-preview',
                    maxInputTokens: 128000,
                    maxOutputTokens: 4000
                };

            case 'anthropic':
                return {
                    ...this.defaultConfig,
                    provider: 'anthropic' as const,
                    model: 'claude-3-opus-20240229',
                    maxInputTokens: 200000,
                    maxOutputTokens: 4000
                };

            case 'deepseek':
                return {
                    ...this.defaultConfig,
                    provider: 'deepseek' as const,
                    model: 'deepseek-chat',
                    maxInputTokens: 32000,
                    maxOutputTokens: 4000
                };

            case 'gemini':
                return {
                    ...this.defaultConfig,
                    provider: 'gemini' as const,
                    model: 'gemini-2.0-flash-exp',
                    maxInputTokens: 1000000, // 1M tokens
                    maxOutputTokens: 8000
                };

            default:
                this.contextLogger.warn(`Unknown provider: ${provider}, using default`);
                return this.defaultConfig;
        }
    }

    /**
     * Estimate token count for text
     */
    public estimateTokenCount(text: string): number {
        // Rough estimation: ~4 characters per token for English text
        // More accurate for code would require actual tokenization
        return Math.ceil(text.length / 4);
    }

    /**
     * Calculate total size of context items
     */
    private calculateTotalSize(items: ContextItem[]): number {
        return items.reduce((total, item) => total + item.size, 0);
    }

    /**
     * Generate cache key for compression request
     */
    private generateCacheKey(request: CompressionRequest): string {
        const itemsHash = request.items
            .map(item => `${item.id}:${item.size}:${item.importance}`)
            .join('|');
        
        const configHash = JSON.stringify(request.config || {});
        const queryHash = request.userQuery || '';
        
        return `${itemsHash}:${request.targetSize}:${configHash}:${queryHash}`;
    }

    /**
     * Combine context items into a single string
     */
    private combineItems(items: ContextItem[]): string {
        return items
            .sort((a, b) => b.importance - a.importance) // Sort by importance
            .map(item => {
                const header = `\n--- ${item.type.toUpperCase()}: ${item.path || item.id} ---\n`;
                return header + item.content;
            })
            .join('\n');
    }

    /**
     * Perform the actual compression using AI
     */
    private async performCompression(
        request: CompressionRequest, 
        config: ContextCompressionConfig
    ): Promise<CompressedContext> {
        const startTime = Date.now();
        
        // Sort items by importance and select the most important ones first
        const sortedItems = [...request.items].sort((a, b) => b.importance - a.importance);
        
        // Try to fit as many high-importance items as possible
        const selectedItems: ContextItem[] = [];
        let currentSize = 0;
        
        for (const item of sortedItems) {
            if (currentSize + item.size <= request.targetSize * 0.8) { // Leave 20% for compression overhead
                selectedItems.push(item);
                currentSize += item.size;
            }
        }

        // If we still have too much content, use AI compression
        if (currentSize > request.targetSize) {
            const compressedContent = await this.aiCompress(selectedItems, request, config);
            
            return {
                originalSize: this.calculateTotalSize(request.items),
                compressedSize: this.estimateTokenCount(compressedContent),
                compressionRatio: this.estimateTokenCount(compressedContent) / this.calculateTotalSize(request.items),
                compressedContent,
                preservedItems: selectedItems.map(item => item.id),
                summary: `Compressed ${request.items.length} items to fit target size using AI`,
                metadata: {
                    provider: config.provider,
                    model: config.model,
                    timestamp: Date.now(),
                    processingTime: Date.now() - startTime
                }
            };
        }

        // If we can fit without AI compression, just combine selected items
        const combinedContent = this.combineItems(selectedItems);
        
        return {
            originalSize: this.calculateTotalSize(request.items),
            compressedSize: currentSize,
            compressionRatio: currentSize / this.calculateTotalSize(request.items),
            compressedContent: combinedContent,
            preservedItems: selectedItems.map(item => item.id),
            summary: `Selected ${selectedItems.length} most important items without AI compression`,
            metadata: {
                provider: config.provider,
                model: config.model,
                timestamp: Date.now(),
                processingTime: Date.now() - startTime
            }
        };
    }

    /**
     * Use AI to compress content intelligently
     */
    private async aiCompress(
        items: ContextItem[], 
        request: CompressionRequest, 
        config: ContextCompressionConfig
    ): Promise<string> {
        const combinedContent = this.combineItems(items);
        
        const compressionPrompt = this.buildCompressionPrompt(
            combinedContent, 
            request.userQuery, 
            request.targetSize,
            config
        );

        // Get API configuration for the compression provider
        const apiConfig = await this.getCompressionApiConfig(config);
        
        // Make compression request
        return await this.makeCompressionRequest(compressionPrompt, apiConfig, config);
    }

    /**
     * Build compression prompt for AI
     */
    private buildCompressionPrompt(
        content: string, 
        userQuery: string | undefined, 
        targetSize: number,
        config: ContextCompressionConfig
    ): string {
        return `You are a code context compression expert. Your task is to compress the following codebase context while preserving the most important information for the user's query.

USER QUERY: ${userQuery || 'General code assistance'}

TARGET SIZE: Approximately ${targetSize} tokens

COMPRESSION REQUIREMENTS:
- Preserve code structure and important symbols: ${config.preserveStructure}
- Preserve code blocks: ${config.preserveCodeBlocks}
- Preserve important symbols: ${config.preserveImportantSymbols}
- Target compression ratio: ${config.compressionRatio}

CONTEXT TO COMPRESS:
${content}

Please compress this context by:
1. Removing redundant information
2. Summarizing less important sections
3. Preserving critical code patterns and structures
4. Maintaining enough context for the user query
5. Keeping the most relevant information for coding assistance

Return only the compressed context, maintaining readability and usefulness.`;
    }

    /**
     * Get API configuration for compression
     */
    private async getCompressionApiConfig(config: ContextCompressionConfig): Promise<ApiConfiguration> {
        // For now, use the same API config but could be different provider for compression
        const baseConfig = await this.configManager.getApiConfiguration();
        
        return {
            ...baseConfig,
            provider: config.provider as any,
            model: config.model,
            maxTokens: config.maxOutputTokens
        };
    }

    /**
     * Make compression request to AI provider
     */
    private async makeCompressionRequest(
        prompt: string, 
        apiConfig: ApiConfiguration, 
        config: ContextCompressionConfig
    ): Promise<string> {
        // This would use the same API calling logic as ArchitectService
        // For now, return a placeholder that indicates compression happened
        
        this.contextLogger.debug('Making AI compression request', {
            provider: config.provider,
            model: config.model,
            promptLength: prompt.length
        });

        // TODO: Implement actual API calls using the same pattern as ArchitectService
        // For now, return a simple compression simulation
        const lines = prompt.split('\n');
        const compressed = lines
            .filter((line, index) => index % 2 === 0 || line.trim().startsWith('//') || line.trim().startsWith('*'))
            .join('\n');
            
        return compressed;
    }
}
