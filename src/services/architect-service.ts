import axios from 'axios';
import { ConfigurationManager } from '../utils/configuration-manager';
import { logger } from '../utils/logger';
import { InputValidator, ValidationRule } from '../utils/input-validator';
import { PerformanceCache, CacheManager } from '../utils/performance-cache';
import { AdvancedCache, CACHE_STRATEGIES } from '../utils/advanced-cache';
import { PerformanceMonitor, timed } from '../utils/performance-monitor';
import * as crypto from 'crypto';

export interface RefactorOptions {
    language: string;
    filePath?: string;
    context?: string;
    refactorType?: string;
    description?: string;
    includeComments?: boolean;
    includeTests?: boolean;
}

interface CacheEntry {
    response: string;
    timestamp: number;
    hash: string;
}

interface RateLimitEntry {
    count: number;
    resetTime: number;
}

interface ValidationResult {
    isValid: boolean;
    errors: string[];
    sanitizedValue?: any;
}

export interface ChatContext {
    userMessage: string;
    activeFile?: string;
    workspaceRoot?: string;
    companionGuardStatus?: any;
    recentFiles?: string[];
    dependencyAnalysis?: any;
    architecturalInsights?: any;
    debtAnalysis?: any;
    proactiveDebtSuggestions?: any;
}

export interface ChatResponse {
    content: string;
    cost?: number;
    tokens?: number;
    metadata?: any;
}

export interface RefactoringSuggestion {
    type: string;
    title: string;
    description: string;
    priority: 'low' | 'medium' | 'high';
    reason: string;
    impact: string;
}

export class ArchitectService {
    private contextLogger = logger.createContextLogger('ArchitectService');
    private responseCache: PerformanceCache<string>;
    private advancedCache: AdvancedCache<string>;
    private rateLimitMap = new Map<string, RateLimitEntry>();
    private readonly CACHE_TTL = 3600000; // 1 hour
    private readonly RATE_LIMIT_WINDOW = 60000; // 1 minute
    private readonly RATE_LIMIT_MAX_REQUESTS = 10; // 10 requests per minute
    private readonly MAX_CODE_LENGTH = 50000; // 50KB max
    private readonly MIN_CODE_LENGTH = 10; // 10 characters min
    private readonly MAX_RETRIES = 3;
    private readonly RETRY_DELAY_BASE = 1000; // 1 second base delay
    private performanceMonitor = PerformanceMonitor.getInstance();

    constructor(private configManager: ConfigurationManager) {
        this.responseCache = CacheManager.getCache<string>('architect-service', {
            maxSize: 20 * 1024 * 1024, // 20MB
            maxEntries: 1000,
            defaultTTL: this.CACHE_TTL
        });

        // Advanced cache with LFU strategy for frequently accessed refactorings
        this.advancedCache = CacheManager.getAdvancedCache<string>(
            'architect-advanced',
            50 * 1024 * 1024, // 50MB
            2000, // 2000 entries
            this.CACHE_TTL * 2, // 2 hours TTL
            CACHE_STRATEGIES.LFU // Least Frequently Used for code patterns
        );

        this.contextLogger.info('ArchitectService initialized with advanced caching');
    }

    /**
     * Initialize the architect service
     */
    public async initialize(): Promise<void> {
        try {
            this.contextLogger.info('Initializing ArchitectService');
            // Initialization logic if needed
            this.contextLogger.info('ArchitectService initialized successfully');
        } catch (error) {
            this.contextLogger.error('Failed to initialize ArchitectService', error as Error);
            throw error;
        }
    }

    /**
     * Generate AI response for chat interface
     */
    @timed('ArchitectService.generateResponse')
    public async generateResponse(context: ChatContext): Promise<ChatResponse> {
        try {
            this.contextLogger.info('Generating AI response for chat', {
                messageLength: context.userMessage.length,
                hasActiveFile: !!context.activeFile,
                hasWorkspace: !!context.workspaceRoot
            });

            // Prepare the prompt with context
            const prompt = this.buildChatPrompt(context);

            // Get API configuration
            const apiConfig = await this.configManager.getApiConfiguration();

            // Make API request
            const response = await this.makeApiRequest(prompt, apiConfig);

            // Parse response and extract metadata
            const chatResponse: ChatResponse = {
                content: response.content || response,
                cost: response.cost || 0,
                tokens: response.tokens || 0,
                metadata: {
                    model: apiConfig.model,
                    provider: apiConfig.provider,
                    timestamp: Date.now()
                }
            };

            this.contextLogger.info('AI response generated successfully', {
                responseLength: chatResponse.content.length,
                cost: chatResponse.cost,
                tokens: chatResponse.tokens
            });

            return chatResponse;

        } catch (error) {
            this.contextLogger.error('Failed to generate AI response', error as Error);
            throw error;
        }
    }

    /**
     * Build chat prompt with context
     */
    private buildChatPrompt(context: ChatContext): string {
        let prompt = `You are FlowCode AI Assistant, a security-focused coding assistant with real-time quality gates and dependency analysis.

User Message: ${context.userMessage}

Context:`;

        if (context.activeFile) {
            prompt += `\nActive File: ${context.activeFile}`;
        }

        if (context.workspaceRoot) {
            prompt += `\nWorkspace: ${context.workspaceRoot}`;
        }

        if (context.companionGuardStatus) {
            prompt += `\nCode Quality Status: ${JSON.stringify(context.companionGuardStatus, null, 2)}`;
        }

        if (context.recentFiles && context.recentFiles.length > 0) {
            prompt += `\nRecent Files: ${context.recentFiles.join(', ')}`;
        }

        // Add dependency analysis if available
        if (context.dependencyAnalysis) {
            prompt += `\nDependency Analysis:`;
            prompt += `\n- Dependencies: ${context.dependencyAnalysis.dependencies.length} items`;
            prompt += `\n- Dependents: ${context.dependencyAnalysis.dependents.length} items`;

            if (context.dependencyAnalysis.dependencies.length > 0) {
                prompt += `\n- Key Dependencies: ${context.dependencyAnalysis.dependencies.slice(0, 3).map((d: any) => d.name).join(', ')}`;
            }

            if (context.dependencyAnalysis.dependents.length > 0) {
                prompt += `\n- Key Dependents: ${context.dependencyAnalysis.dependents.slice(0, 3).map((d: any) => d.name).join(', ')}`;
            }
        }

        // Add architectural insights if available
        if (context.architecturalInsights) {
            prompt += `\nArchitectural Insights:`;
            prompt += `\n- Complexity: ${context.architecturalInsights.complexity.toFixed(2)}`;
            prompt += `\n- Coupling: ${(context.architecturalInsights.coupling * 100).toFixed(1)}%`;
            prompt += `\n- Cohesion: ${(context.architecturalInsights.cohesion * 100).toFixed(1)}%`;

            if (context.architecturalInsights.suggestions.length > 0) {
                prompt += `\n- Suggestions: ${context.architecturalInsights.suggestions.join('; ')}`;
            }
        }

        // Add debt analysis if available
        if (context.debtAnalysis) {
            prompt += `\nTechnical Debt Analysis:`;
            prompt += `\n- Has Debt: ${context.debtAnalysis.hasDebt ? 'Yes' : 'No'}`;
            prompt += `\n- Risk Level: ${context.debtAnalysis.riskLevel}`;

            if (context.debtAnalysis.hasDebt) {
                prompt += `\n- Related Hotfixes: ${context.debtAnalysis.relatedHotfixes.length}`;
                if (context.debtAnalysis.recommendations.length > 0) {
                    prompt += `\n- Recommendations: ${context.debtAnalysis.recommendations.join('; ')}`;
                }
            }
        }

        // Add proactive debt suggestions if available
        if (context.proactiveDebtSuggestions) {
            prompt += `\nProactive Debt Reduction Opportunities:`;
            prompt += `\n- Total Suggestions: ${context.proactiveDebtSuggestions.suggestions.length}`;
            prompt += `\n- Hotspots: ${context.proactiveDebtSuggestions.hotspots.length}`;

            if (context.proactiveDebtSuggestions.suggestions.length > 0) {
                const highPriority = context.proactiveDebtSuggestions.suggestions.filter((s: any) => s.priority === 'high');
                if (highPriority.length > 0) {
                    prompt += `\n- High Priority Items: ${highPriority.map((s: any) => s.title).join(', ')}`;
                }
            }
        }

        prompt += `

Instructions:
- Provide helpful, accurate coding assistance with dependency and debt awareness
- Consider security implications of any code suggestions
- Reference the companion guard status when relevant
- Use dependency analysis to inform suggestions about code changes
- Consider architectural impact when suggesting refactoring
- Factor in technical debt when recommending changes
- Proactively suggest debt reduction opportunities when relevant
- Warn about high-risk modifications to files with existing debt
- When user asks about refactoring, include proactive debt reduction suggestions
- Be concise but thorough
- If suggesting code changes, explain the reasoning and potential impact
- Always prioritize code quality, security, maintainability, and debt reduction

Response:`;

        return prompt;
    }

    /**
     * Make API request to AI provider
     */
    private async makeApiRequest(prompt: string, apiConfig: any): Promise<any> {
        try {
            // This is a simplified implementation
            // In a real implementation, you'd handle different providers (OpenAI, Anthropic, etc.)

            const requestData = {
                model: apiConfig.model || 'gpt-3.5-turbo',
                messages: [
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                max_tokens: 2000,
                temperature: 0.7
            };

            const response = await axios.post(
                apiConfig.endpoint || 'https://api.openai.com/v1/chat/completions',
                requestData,
                {
                    headers: {
                        'Authorization': `Bearer ${apiConfig.apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 30000
                }
            );

            if (response.data && response.data.choices && response.data.choices[0]) {
                return {
                    content: response.data.choices[0].message.content,
                    tokens: response.data.usage?.total_tokens || 0,
                    cost: this.calculateCost(response.data.usage?.total_tokens || 0, apiConfig.model)
                };
            }

            throw new Error('Invalid API response format');

        } catch (error) {
            this.contextLogger.error('API request failed', error as Error);

            // Return a fallback response for development
            return {
                content: `I'm FlowCode AI Assistant. I received your message: "${prompt.substring(0, 100)}..."

I'm currently in development mode. Once properly configured with an AI provider, I'll be able to provide intelligent coding assistance with security validation and real-time quality feedback.

Key features I'll provide:
- Code analysis and suggestions
- Security vulnerability detection
- Real-time quality gate feedback
- Architecture-aware refactoring
- Technical debt tracking

Please configure your AI provider API key to enable full functionality.`,
                tokens: 0,
                cost: 0
            };
        }
    }

    /**
     * Calculate API cost based on tokens and model
     */
    private calculateCost(tokens: number, model: string): number {
        // Simplified cost calculation - in reality this would be more sophisticated
        const costPerToken = model.includes('gpt-4') ? 0.00003 : 0.000002;
        return tokens * costPerToken;
    }

    /**
     * Generate architecture-aware refactoring suggestions
     */
    public async generateArchitectureAwareRefactoring(
        code: string,
        filePath: string,
        symbolName?: string
    ): Promise<{
        suggestions: RefactoringSuggestion[];
        architecturalImpact: any;
        riskAssessment: any;
    }> {
        try {
            this.contextLogger.info('Generating architecture-aware refactoring suggestions');

            // Get architectural insights
            const graphService = new (await import('../services/graph-service')).GraphService();
            await graphService.initialize();

            const insights = await graphService.getArchitecturalInsights(filePath, symbolName);
            let impactAnalysis = null;

            if (symbolName) {
                impactAnalysis = await graphService.analyzeChangeImpact(symbolName, filePath);
            }

            // Generate refactoring suggestions based on architectural analysis
            const suggestions: RefactoringSuggestion[] = [];

            // High complexity suggestions
            if (insights.complexity > 5) {
                suggestions.push({
                    type: 'extract-method',
                    title: 'Extract Method',
                    description: 'Break down complex function into smaller, focused methods',
                    priority: 'high',
                    reason: `High complexity score (${insights.complexity.toFixed(2)}) indicates this function is doing too much`,
                    impact: impactAnalysis?.riskLevel || 'medium'
                });
            }

            // High coupling suggestions
            if (insights.coupling > 0.7) {
                suggestions.push({
                    type: 'reduce-coupling',
                    title: 'Reduce Coupling',
                    description: 'Introduce interfaces or dependency injection to reduce external dependencies',
                    priority: 'medium',
                    reason: `High coupling (${(insights.coupling * 100).toFixed(1)}%) makes code harder to test and maintain`,
                    impact: impactAnalysis?.riskLevel || 'medium'
                });
            }

            // Low cohesion suggestions
            if (insights.cohesion < 0.3) {
                suggestions.push({
                    type: 'improve-cohesion',
                    title: 'Improve Cohesion',
                    description: 'Group related functionality together or split unrelated concerns',
                    priority: 'medium',
                    reason: `Low cohesion (${(insights.cohesion * 100).toFixed(1)}%) indicates mixed responsibilities`,
                    impact: impactAnalysis?.riskLevel || 'low'
                });
            }

            // Add general architectural suggestions
            insights.suggestions.forEach(suggestion => {
                suggestions.push({
                    type: 'architectural',
                    title: 'Architectural Improvement',
                    description: suggestion,
                    priority: 'low',
                    reason: 'Based on static analysis of code structure',
                    impact: 'low'
                });
            });

            return {
                suggestions,
                architecturalImpact: insights,
                riskAssessment: impactAnalysis
            };

        } catch (error) {
            this.contextLogger.error('Failed to generate architecture-aware refactoring', error as Error);
            return {
                suggestions: [],
                architecturalImpact: null,
                riskAssessment: null
            };
        }
    }

    /**
     * Elevate to Architect - comprehensive refactoring workflow
     */
    public async elevateToArchitect(filePath: string, selectedCode?: string): Promise<{
        analysis: any;
        suggestions: RefactoringSuggestion[];
        actionPlan: string[];
    }> {
        try {
            this.contextLogger.info('Starting Elevate to Architect workflow');

            // Get comprehensive analysis
            const graphService = new (await import('../services/graph-service')).GraphService();
            await graphService.initialize();

            const insights = await graphService.getArchitecturalInsights(filePath);

            // Get refactoring suggestions
            const refactoringResult = await this.generateArchitectureAwareRefactoring(
                selectedCode || '',
                filePath
            );

            // Create action plan
            const actionPlan: string[] = [];

            if (refactoringResult.suggestions.length > 0) {
                actionPlan.push('🔍 **Analysis Complete** - Found architectural improvement opportunities');

                const highPriority = refactoringResult.suggestions.filter(s => s.priority === 'high');
                const mediumPriority = refactoringResult.suggestions.filter(s => s.priority === 'medium');

                if (highPriority.length > 0) {
                    actionPlan.push(`⚠️ **High Priority** - ${highPriority.length} critical improvements needed`);
                    highPriority.forEach(s => actionPlan.push(`   • ${s.title}: ${s.description}`));
                }

                if (mediumPriority.length > 0) {
                    actionPlan.push(`📋 **Medium Priority** - ${mediumPriority.length} recommended improvements`);
                    mediumPriority.forEach(s => actionPlan.push(`   • ${s.title}: ${s.description}`));
                }

                actionPlan.push('🚀 **Next Steps** - Review suggestions and apply incrementally');
            } else {
                actionPlan.push('✅ **Analysis Complete** - No major architectural issues detected');
                actionPlan.push('🎯 **Recommendation** - Code structure appears well-organized');
            }

            return {
                analysis: insights,
                suggestions: refactoringResult.suggestions,
                actionPlan
            };

        } catch (error) {
            this.contextLogger.error('Failed to elevate to architect', error as Error);
            throw error;
        }
    }

    /**
     * Refactor code with enhanced options
     */
    @timed('ArchitectService.refactorCode')
    public async refactorCode(code: string, options: RefactorOptions): Promise<string | null> {
        try {
            this.contextLogger.info(`Starting refactorCode for ${options.language} code`, {
                codeLength: code.length,
                refactorType: options.refactorType
            });

            // Convert to legacy options format for compatibility
            const legacyOptions = {
                language: options.language,
                filePath: options.filePath || 'untitled',
                context: options.context || options.refactorType || 'refactor'
            };

            return await this.refactor(code, legacyOptions);
        } catch (error) {
            this.contextLogger.error('ArchitectService refactorCode failed', error as Error, {
                codeLength: code.length,
                language: options.language
            });
            throw error;
        }
    }

    @timed('ArchitectService.refactor')
    public async refactor(code: string, options: RefactorOptions): Promise<string | null> {
        try {
            this.contextLogger.info(`Starting refactor for ${options.language} code`, {
                codeLength: code.length,
                filePath: options.filePath
            });

            // Validate request
            const validation = this.validateRequest(code, options);
            if (!validation.isValid) {
                const error = new Error(`Validation failed: ${validation.errors.join(', ')}`);
                this.contextLogger.error('Request validation failed', error);
                throw error;
            }

            // Check rate limiting
            const config = await this.configManager.getApiConfiguration();
            const rateLimitKey = `${config.provider}-${config.apiKey.substring(0, 8)}`;
            if (!this.checkRateLimit(rateLimitKey)) {
                const error = new Error('Rate limit exceeded. Please wait before making another request.');
                this.contextLogger.warn('Rate limit exceeded', error);
                throw error;
            }

            // Check cache (try both caches)
            const cacheKey = this.generateCacheKey(code, options);
            const cachedResponse = this.getCachedResponse(cacheKey);
            if (cachedResponse) {
                this.contextLogger.debug('Cache hit for refactor request');
                return cachedResponse;
            }

            const prompt = this.buildEnhancedPrompt(code, options);

            let response: string;

            // Call AI provider with retry logic
            response = await this.callAIProviderWithRetry(config, prompt);

            // Validate response quality
            if (!this.validateResponse(response, code, options)) {
                throw new Error('AI response failed quality validation');
            }

            const result = this.extractCodeBlock(response);

            // Cache the response
            if (result) {
                this.setCachedResponse(cacheKey, result);
            }

            this.contextLogger.info('Refactoring completed successfully', {
                resultLength: result?.length || 0
            });

            return result;
        } catch (error) {
            this.contextLogger.error('Architect service failed', error as Error, {
                codeLength: code.length,
                language: options.language
            });
            throw new Error(`Architect service failed: ${(error as Error).message}`);
        }
    }

    private async callAIProviderWithRetry(config: any, prompt: string): Promise<string> {
        let lastError: Error | null = null;

        for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
            try {
                this.contextLogger.debug(`AI provider call attempt ${attempt}/${this.MAX_RETRIES}`);

                switch (config.provider) {
                    case 'openai':
                        return await this.callOpenAI(prompt, config.apiKey, config.maxTokens);
                    case 'anthropic':
                        return await this.callAnthropic(prompt, config.apiKey, config.maxTokens);
                    default:
                        throw new Error(`Unsupported provider: ${config.provider}`);
                }
            } catch (error) {
                lastError = error as Error;
                this.contextLogger.warn(`AI provider call attempt ${attempt} failed`, lastError);

                // Don't retry on authentication or validation errors
                if (this.isNonRetryableError(lastError)) {
                    throw lastError;
                }

                // Exponential backoff delay
                if (attempt < this.MAX_RETRIES) {
                    const delay = this.RETRY_DELAY_BASE * Math.pow(2, attempt - 1);
                    this.contextLogger.debug(`Retrying in ${delay}ms...`);
                    await this.sleep(delay);
                }
            }
        }

        throw lastError || new Error('All retry attempts failed');
    }

    private isNonRetryableError(error: Error): boolean {
        const message = error.message.toLowerCase();
        return message.includes('unauthorized') ||
               message.includes('invalid api key') ||
               message.includes('validation failed') ||
               message.includes('rate limit exceeded');
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    private validateResponse(response: string, originalCode: string, options: RefactorOptions): boolean {
        try {
            // Basic validation checks
            if (!response || response.trim().length === 0) {
                this.contextLogger.warn('Empty response from AI provider');
                return false;
            }

            // Check if response is too short (likely incomplete)
            if (response.length < originalCode.length * 0.3) {
                this.contextLogger.warn('Response too short compared to original code');
                return false;
            }

            // Check if response contains code-like content
            const codeIndicators = ['{', '}', '(', ')', 'function', 'class', 'def', 'import', 'const', 'let', 'var'];
            const hasCodeIndicators = codeIndicators.some(indicator => response.includes(indicator));

            if (!hasCodeIndicators) {
                this.contextLogger.warn('Response does not appear to contain code');
                return false;
            }

            // Language-specific validation
            if (options.language === 'typescript' || options.language === 'javascript') {
                // Check for basic JS/TS syntax
                if (!response.match(/[{}();]/)) {
                    this.contextLogger.warn('Response missing basic JavaScript/TypeScript syntax');
                    return false;
                }
            } else if (options.language === 'python') {
                // Check for basic Python syntax
                if (!response.match(/[:]/)) {
                    this.contextLogger.warn('Response missing basic Python syntax');
                    return false;
                }
            }

            return true;
        } catch (error) {
            this.contextLogger.error('Error validating response', error as Error);
            return false;
        }
    }

    private buildPrompt(code: string, options: RefactorOptions): string {
        return `You are an expert software architect. Please refactor the following ${options.language} code to improve its quality, maintainability, and performance while preserving its functionality.

File: ${options.filePath}

Code to refactor:
\`\`\`${options.language}
${code}
\`\`\`

Please provide the refactored code with:
1. Improved readability and structure
2. Better error handling
3. Performance optimizations where applicable
4. Clear variable and function names
5. Appropriate comments for complex logic

Return only the refactored code in a single code block.`;

    }

    private async callOpenAI(prompt: string, apiKey: string, maxTokens: number): Promise<string> {
        const response = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            {
                model: 'gpt-4-turbo-preview',
                messages: [
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                max_tokens: maxTokens,
                temperature: 0.1
            },
            {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        return response.data.choices[0]?.message?.content || '';
    }

    private async callAnthropic(prompt: string, apiKey: string, maxTokens: number): Promise<string> {
        const response = await axios.post(
            'https://api.anthropic.com/v1/messages',
            {
                model: 'claude-3-opus-20240229',
                max_tokens: maxTokens,
                messages: [
                    {
                        role: 'user',
                        content: prompt
                    }
                ]
            },
            {
                headers: {
                    'x-api-key': apiKey,
                    'Content-Type': 'application/json',
                    'anthropic-version': '2023-06-01'
                }
            }
        );

        return response.data.content[0]?.text || '';
    }

    private extractCodeBlock(response: string): string | null {
        const codeBlockRegex = /```(?:\w+)?\n([\s\S]*?)```/;
        const match = response.match(codeBlockRegex);

        if (match) {
            return match[1]?.trim() || '';
        }

        // If no code block found, return the entire response
        return response.trim();
    }

    private validateRequest(code: string, options: RefactorOptions): ValidationResult {
        const validationRules: ValidationRule[] = [
            {
                name: 'Code Content',
                severity: 'high' as const,
                validator: (value) => InputValidator.validateCodeContent(value, this.MAX_CODE_LENGTH)
            },
            {
                name: 'Language',
                severity: 'medium' as const,
                validator: (_value) => InputValidator.validateLanguage(options.language)
            },
            {
                name: 'File Path',
                severity: 'low' as const,
                validator: (_value) => InputValidator.validateFilePath(options.filePath || '')
            }
        ];

        // Apply basic validation rules
        const basicValidation = InputValidator.applyRules(code, validationRules);
        if (!basicValidation.isValid) {
            return basicValidation;
        }

        // Additional custom validation for code length
        const errors: string[] = [];
        if (code.length < this.MIN_CODE_LENGTH) {
            errors.push(`Code too short (minimum ${this.MIN_CODE_LENGTH} characters)`);
        }

        // Enhanced dangerous pattern detection
        const codeWithoutComments = this.removeCommentsAndStrings(code, options.language);
        const dangerousPatterns = [
            { pattern: /\beval\s*\(/, description: 'eval() function call' },
            { pattern: /\bexec\s*\(/, description: 'exec() function call' },
            { pattern: /\bsystem\s*\(/, description: 'system() function call' },
            { pattern: /subprocess\.(run|call|Popen|check_output)\s*\(/, description: 'subprocess execution' },
            { pattern: /os\.system\s*\(/, description: 'os.system() call' },
            { pattern: /shell_exec\s*\(/, description: 'shell_exec() call' },
            { pattern: /\$\{[^}]*\}/, description: 'template literal injection risk' },
            { pattern: /document\.write\s*\(/, description: 'document.write() call' },
            { pattern: /innerHTML\s*=/, description: 'innerHTML assignment' },
            { pattern: /outerHTML\s*=/, description: 'outerHTML assignment' }
        ];

        for (const { pattern, description } of dangerousPatterns) {
            if (pattern.test(codeWithoutComments)) {
                errors.push(`Code contains potentially dangerous pattern: ${description}`);
                break;
            }
        }

        return {
            isValid: errors.length === 0,
            errors: [...basicValidation.errors, ...errors],
            sanitizedValue: basicValidation.sanitizedValue
        };
    }

    private checkRateLimit(key: string): boolean {
        const now = Date.now();
        const entry = this.rateLimitMap.get(key);

        if (!entry) {
            this.rateLimitMap.set(key, {
                count: 1,
                resetTime: now + this.RATE_LIMIT_WINDOW
            });
            return true;
        }

        if (now > entry.resetTime) {
            // Reset the rate limit window
            this.rateLimitMap.set(key, {
                count: 1,
                resetTime: now + this.RATE_LIMIT_WINDOW
            });
            return true;
        }

        if (entry.count >= this.RATE_LIMIT_MAX_REQUESTS) {
            return false;
        }

        entry.count++;
        return true;
    }

    private generateCacheKey(code: string, options: RefactorOptions): string {
        const content = `${code}-${options.language}-${options.context || ''}`;
        return crypto.createHash('sha256').update(content).digest('hex');
    }

    private getCachedResponse(key: string): string | null {
        // Try performance cache first (faster)
        const cached = this.responseCache.get(key);
        if (cached) {
            this.contextLogger.debug('Performance cache hit for refactor request');
            return cached;
        }

        // Try advanced cache as fallback
        const advancedCached = this.advancedCache.get(key);
        if (advancedCached) {
            this.contextLogger.debug('Advanced cache hit for refactor request');
            // Promote to performance cache for faster access next time
            this.responseCache.set(key, advancedCached);
            return advancedCached;
        }

        return null;
    }

    private setCachedResponse(key: string, response: string): void {
        // Store in both caches for redundancy and performance
        this.responseCache.set(key, response);
        this.advancedCache.set(key, response, undefined, {
            timestamp: Date.now(),
            responseLength: response.length,
            quality: this.assessResponseQuality(response)
        });
    }

    private assessResponseQuality(response: string): number {
        // Simple quality assessment (0-100)
        let quality = 50; // Base quality

        // Length factor (reasonable length gets bonus)
        if (response.length > 100 && response.length < 10000) {
            quality += 20;
        }

        // Code structure indicators
        const structureIndicators = ['{', '}', 'function', 'class', 'const', 'let'];
        const structureScore = structureIndicators.filter(indicator =>
            response.includes(indicator)
        ).length;
        quality += Math.min(structureScore * 5, 30);

        return Math.min(quality, 100);
    }

    private analyzeCode(code: string, language: string): { summary: string; issues: string[]; complexity: number } {
        const issues: string[] = [];
        let complexity = 1;

        // Basic code analysis
        const lines = code.split('\n').filter(line => line.trim().length > 0);
        const codeLength = code.length;

        // Complexity indicators
        const complexityPatterns = [
            /\bif\b/g, /\belse\b/g, /\bfor\b/g, /\bwhile\b/g,
            /\bswitch\b/g, /\btry\b/g, /\bcatch\b/g
        ];

        complexityPatterns.forEach(pattern => {
            const matches = code.match(pattern);
            if (matches) {
                complexity += matches.length;
            }
        });

        // Common issues detection
        if (language === 'javascript' || language === 'typescript') {
            if (code.includes('var ')) {
                issues.push('Uses var instead of let/const');
            }
            if (code.includes('==') && !code.includes('===')) {
                issues.push('Uses loose equality (==) instead of strict equality (===)');
            }
            if (code.match(/function\s*\(/)) {
                issues.push('Uses function declarations instead of arrow functions where appropriate');
            }
        } else if (language === 'python') {
            if (!code.match(/def\s+\w+\([^)]*\)\s*->/)) {
                issues.push('Missing type hints');
            }
            if (code.includes('except:')) {
                issues.push('Uses bare except clauses');
            }
        }

        // General issues
        if (lines.length > 50) {
            issues.push('Function/method is too long (>50 lines)');
        }
        if (codeLength > 2000) {
            issues.push('Code block is very large');
        }
        if (!code.match(/\/\/|#|\/\*/)) {
            issues.push('Lacks comments or documentation');
        }

        const summary = `${lines.length} lines, complexity score: ${complexity}, ${issues.length} potential issues identified`;

        return { summary, issues, complexity };
    }

    private getContextualInstructions(analysis: { issues: string[]; complexity: number }, options: RefactorOptions): string {
        let instructions = 'SPECIFIC IMPROVEMENTS NEEDED:\n';

        if (analysis.issues.length > 0) {
            instructions += analysis.issues.map(issue => `- Address: ${issue}`).join('\n') + '\n';
        }

        if (analysis.complexity > 10) {
            instructions += '- Reduce cyclomatic complexity by breaking down complex functions\n';
            instructions += '- Consider using design patterns to simplify logic\n';
        }

        if (options.context) {
            instructions += `\nADDITIONAL CONTEXT: ${options.context}\n`;
        }

        return instructions;
    }

    private buildEnhancedPrompt(code: string, options: RefactorOptions): string {
        const codeAnalysis = this.analyzeCode(code, options.language);
        const contextualInstructions = this.getContextualInstructions(codeAnalysis, options);
        const languageSpecificInstructions = this.getLanguageSpecificInstructions(options.language);

        return `You are an expert software architect and code reviewer with deep expertise in ${options.language}.

TASK: Refactor the following code to improve its quality, maintainability, and performance while preserving exact functionality.

FILE CONTEXT: ${options.filePath}
LANGUAGE: ${options.language}
CODE ANALYSIS: ${codeAnalysis.summary}

ORIGINAL CODE:
\`\`\`${options.language}
${code}
\`\`\`

${languageSpecificInstructions}

${contextualInstructions}

REFACTORING REQUIREMENTS:
1. PRESERVE FUNCTIONALITY: The refactored code must produce identical results
2. IMPROVE READABILITY: Use clear, descriptive names and logical structure
3. ENHANCE MAINTAINABILITY: Follow SOLID principles and design patterns
4. OPTIMIZE PERFORMANCE: Remove inefficiencies and improve algorithms where possible
5. ADD DOCUMENTATION: Include meaningful comments for complex logic
6. FOLLOW CONVENTIONS: Adhere to ${options.language} best practices and style guides
7. ERROR HANDLING: Implement robust error handling and validation
8. SECURITY: Address potential security vulnerabilities

RESPONSE FORMAT:
- Provide ONLY the refactored code
- Use proper code block formatting
- No explanations or commentary outside the code
- Ensure the code is complete and runnable

REFACTORED CODE:`;
    }

    private getLanguageSpecificInstructions(language: string): string {
        switch (language.toLowerCase()) {
            case 'typescript':
            case 'javascript':
                return `TYPESCRIPT/JAVASCRIPT EXCELLENCE STANDARDS:
- Use strict TypeScript types (avoid 'any', prefer interfaces/types)
- Implement proper async/await patterns with error handling
- Use modern ES2020+ features (optional chaining, nullish coalescing)
- Follow functional programming principles where appropriate
- Use const/let appropriately, never var
- Implement proper error boundaries and validation
- Use meaningful, descriptive variable and function names
- Apply SOLID principles and design patterns
- Optimize for performance (avoid unnecessary re-renders, use memoization)
- Follow ESLint/Prettier standards
- Use proper JSDoc comments for complex functions`;

            case 'python':
                return `PYTHON EXCELLENCE STANDARDS:
- Follow PEP 8 style guidelines strictly
- Use comprehensive type hints (typing module)
- Implement proper exception handling with specific exception types
- Use dataclasses, enums, and modern Python features
- Apply list/dict comprehensions and generators appropriately
- Follow Pythonic conventions (duck typing, EAFP)
- Use context managers for resource management
- Implement proper logging instead of print statements
- Use f-strings for string formatting
- Apply design patterns (Factory, Observer, etc.)
- Write docstrings following Google/NumPy style`;

            case 'java':
                return `JAVA EXCELLENCE STANDARDS:
- Follow Java naming conventions and coding standards
- Use appropriate design patterns (Builder, Strategy, Observer)
- Implement comprehensive exception handling
- Use generics and collections framework effectively
- Follow SOLID principles and clean architecture
- Use modern Java features (streams, lambdas, optional)
- Implement proper equals/hashCode/toString methods
- Use annotations appropriately (@Override, @Nullable, etc.)
- Apply dependency injection principles
- Write comprehensive JavaDoc comments
- Use immutable objects where possible`;

            case 'csharp':
            case 'c#':
                return `C# EXCELLENCE STANDARDS:
- Follow C# naming conventions and coding standards
- Use LINQ and async/await patterns effectively
- Implement proper exception handling and logging
- Use nullable reference types and pattern matching
- Apply SOLID principles and dependency injection
- Use modern C# features (records, init-only properties)
- Implement proper IDisposable pattern
- Use attributes and reflection appropriately
- Follow Microsoft's coding guidelines
- Write XML documentation comments`;

            default:
                return `GENERAL EXCELLENCE STANDARDS:
- Follow language-specific best practices and conventions
- Use appropriate design patterns for the problem domain
- Implement comprehensive error handling and validation
- Use meaningful, descriptive names for all identifiers
- Apply SOLID principles and clean code practices
- Optimize for readability and maintainability
- Add appropriate documentation and comments
- Consider performance implications of design choices`;
        }
    }

    private removeCommentsAndStrings(code: string, language: string): string {
        // Simple implementation to remove comments and strings for security scanning
        // This is not perfect but reduces false positives

        let result = code;

        if (language === 'typescript' || language === 'javascript') {
            // Remove single-line comments
            result = result.replace(/\/\/.*$/gm, '');
            // Remove multi-line comments
            result = result.replace(/\/\*[\s\S]*?\*\//g, '');
            // Remove string literals (basic - doesn't handle all edge cases)
            result = result.replace(/"([^"\\]|\\.)*"/g, '""');
            result = result.replace(/'([^'\\]|\\.)*'/g, "''");
            result = result.replace(/`([^`\\]|\\.)*`/g, '``');
        } else if (language === 'python') {
            // Remove Python comments
            result = result.replace(/#.*$/gm, '');
            // Remove string literals
            result = result.replace(/"""[\s\S]*?"""/g, '""""""');
            result = result.replace(/'''[\s\S]*?'''/g, "''''''");
            result = result.replace(/"([^"\\]|\\.)*"/g, '""');
            result = result.replace(/'([^'\\]|\\.)*'/g, "''");
        }

        return result;
    }
}