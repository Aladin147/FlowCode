import * as vscode from 'vscode';
import * as path from 'path';
import * as crypto from 'crypto';
import { logger } from './logger';

export interface ValidationResult {
    isValid: boolean;
    errors: string[];
    warnings?: string[];
    sanitizedValue?: any;
    securityScore?: number; // 0-100, higher is more secure
    metadata?: Record<string, any>;
}

export interface ValidationRule {
    name: string;
    validator: (value: any) => ValidationResult;
    severity: 'low' | 'medium' | 'high' | 'critical';
    description?: string;
}

export interface SecurityContext {
    allowDangerousPatterns?: boolean;
    maxComplexity?: number;
    strictMode?: boolean;
    trustedSources?: string[];
}

export class InputValidator {
    private static readonly contextLogger = logger.createContextLogger('InputValidator');

    /**
     * Validate and sanitize file path with comprehensive security checks
     */
    public static validateFilePath(filePath: string, context?: SecurityContext): ValidationResult {
        const errors: string[] = [];
        const warnings: string[] = [];
        let securityScore = 100;

        if (!filePath || typeof filePath !== 'string') {
            return {
                isValid: false,
                errors: ['File path must be a non-empty string'],
                securityScore: 0
            };
        }

        const trimmedPath = filePath.trim();

        if (trimmedPath.length === 0) {
            errors.push('File path cannot be empty');
            securityScore -= 50;
        }

        // Enhanced path traversal detection
        const traversalPatterns = [
            /\.\./g,                    // Standard path traversal
            /~[\/\\]/g,                 // Home directory access
            /\$\{.*\}/g,                // Variable expansion
            /%2e%2e/gi,                 // URL encoded path traversal
            /\.{2,}/g,                  // Multiple dots
            /[\/\\]{2,}/g,              // Multiple slashes
            /\x00/g,                    // Null bytes
            /\.(bat|cmd|exe|scr|pif|com|vbs|js|jar|ps1|sh)$/i // Executable extensions
        ];

        for (const pattern of traversalPatterns) {
            if (pattern.test(trimmedPath)) {
                errors.push('Potentially dangerous path pattern detected');
                securityScore -= 30;
                break;
            }
        }

        // Check for dangerous characters (enhanced)
        const dangerousChars = /[<>:"|?*\x00-\x1f\x7f-\x9f]/;
        if (dangerousChars.test(trimmedPath)) {
            errors.push('File path contains invalid or dangerous characters');
            securityScore -= 20;
        }

        // Check for suspicious file extensions
        const suspiciousExtensions = [
            '.exe', '.bat', '.cmd', '.scr', '.pif', '.com', '.vbs', '.js', '.jar',
            '.ps1', '.sh', '.py', '.pl', '.rb', '.php', '.asp', '.jsp'
        ];

        const extension = path.extname(trimmedPath).toLowerCase();
        if (suspiciousExtensions.includes(extension)) {
            if (!context?.allowDangerousPatterns) {
                errors.push(`Potentially dangerous file extension: ${extension}`);
                securityScore -= 25;
            } else {
                warnings.push(`Dangerous file extension allowed by context: ${extension}`);
                securityScore -= 10;
            }
        }

        // Normalize path
        let sanitizedPath: string;
        try {
            sanitizedPath = path.normalize(trimmedPath);

            // Additional normalization checks
            if (sanitizedPath !== trimmedPath) {
                warnings.push('Path was normalized during validation');
                securityScore -= 5;
            }
        } catch (error) {
            errors.push('Invalid file path format');
            return {
                isValid: false,
                errors,
                securityScore: 0
            };
        }

        // Enhanced workspace boundary checks
        if (path.isAbsolute(sanitizedPath)) {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (workspaceFolders && workspaceFolders.length > 0) {
                const workspaceRoot = workspaceFolders[0]?.uri.fsPath || process.cwd();
                const normalizedWorkspaceRoot = path.normalize(workspaceRoot);

                if (!sanitizedPath.startsWith(normalizedWorkspaceRoot)) {
                    errors.push('File path must be within the workspace');
                    securityScore -= 40;
                }
            } else {
                warnings.push('No workspace folder available for boundary check');
                securityScore -= 10;
            }
        }

        // Check path length (security consideration)
        if (sanitizedPath.length > 260) { // Windows MAX_PATH limit
            warnings.push('Path length exceeds recommended maximum');
            securityScore -= 5;
        }

        // Check for hidden files/directories (security consideration)
        const pathParts = sanitizedPath.split(path.sep);
        if (pathParts.some(part => part.startsWith('.'))) {
            warnings.push('Path contains hidden files or directories');
            securityScore -= 5;
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings: warnings.length > 0 ? warnings : undefined,
            sanitizedValue: sanitizedPath,
            securityScore: Math.max(0, securityScore),
            metadata: {
                originalPath: filePath,
                normalized: sanitizedPath !== trimmedPath,
                extension,
                isAbsolute: path.isAbsolute(sanitizedPath)
            }
        };
    }

    /**
     * Validate and sanitize code content with comprehensive security analysis
     */
    public static validateCodeContent(code: string, maxLength: number = 100000, context?: SecurityContext): ValidationResult {
        const errors: string[] = [];
        const warnings: string[] = [];
        let securityScore = 100;

        if (!code || typeof code !== 'string') {
            return {
                isValid: false,
                errors: ['Code content must be a string'],
                securityScore: 0
            };
        }

        if (code.length === 0) {
            errors.push('Code content cannot be empty');
            securityScore -= 30;
        }

        if (code.length > maxLength) {
            errors.push(`Code content exceeds maximum length of ${maxLength} characters`);
            securityScore -= 20;
        }

        // Enhanced malicious pattern detection
        const maliciousPatterns = [
            // Web-based attacks
            { pattern: /<script[^>]*>.*?<\/script>/gi, description: 'Script tags', severity: 'critical', score: 40 },
            { pattern: /javascript:/gi, description: 'JavaScript protocol', severity: 'high', score: 30 },
            { pattern: /data:.*base64/gi, description: 'Base64 data URLs', severity: 'medium', score: 20 },
            { pattern: /on\w+\s*=/gi, description: 'HTML event handlers', severity: 'high', score: 25 },

            // Code injection patterns
            { pattern: /eval\s*\(/gi, description: 'eval() calls', severity: 'critical', score: 50 },
            { pattern: /Function\s*\(/gi, description: 'Function constructor', severity: 'critical', score: 45 },
            { pattern: /setTimeout\s*\(\s*["']/gi, description: 'setTimeout with string', severity: 'high', score: 35 },
            { pattern: /setInterval\s*\(\s*["']/gi, description: 'setInterval with string', severity: 'high', score: 35 },

            // System command execution
            { pattern: /exec\s*\(/gi, description: 'exec() calls', severity: 'critical', score: 50 },
            { pattern: /system\s*\(/gi, description: 'system() calls', severity: 'critical', score: 50 },
            { pattern: /shell_exec\s*\(/gi, description: 'shell_exec() calls', severity: 'critical', score: 50 },
            { pattern: /subprocess\./gi, description: 'subprocess usage', severity: 'high', score: 40 },
            { pattern: /os\.system/gi, description: 'os.system calls', severity: 'critical', score: 50 },
            { pattern: /Runtime\.getRuntime/gi, description: 'Java Runtime execution', severity: 'critical', score: 50 },

            // File system access
            { pattern: /file_get_contents\s*\(/gi, description: 'File access functions', severity: 'medium', score: 20 },
            { pattern: /fopen\s*\(/gi, description: 'File open functions', severity: 'medium', score: 20 },
            { pattern: /readFile\s*\(/gi, description: 'File read functions', severity: 'medium', score: 15 },
            { pattern: /writeFile\s*\(/gi, description: 'File write functions', severity: 'medium', score: 15 },

            // Network access
            { pattern: /curl\s+/gi, description: 'curl commands', severity: 'medium', score: 20 },
            { pattern: /wget\s+/gi, description: 'wget commands', severity: 'medium', score: 20 },
            { pattern: /fetch\s*\(/gi, description: 'Network fetch calls', severity: 'low', score: 10 },
            { pattern: /XMLHttpRequest/gi, description: 'XMLHttpRequest usage', severity: 'low', score: 10 },

            // Dangerous operators and functions
            { pattern: /\$\{[^}]*\}/gi, description: 'Template literal injection', severity: 'high', score: 30 },
            { pattern: /document\.write\s*\(/gi, description: 'document.write calls', severity: 'high', score: 25 },
            { pattern: /innerHTML\s*=/gi, description: 'innerHTML assignment', severity: 'medium', score: 20 },
            { pattern: /outerHTML\s*=/gi, description: 'outerHTML assignment', severity: 'medium', score: 20 },

            // Sensitive data patterns
            { pattern: /password\s*[:=]\s*["'][^"']+["']/gi, description: 'Hardcoded passwords', severity: 'critical', score: 60 },
            { pattern: /api[_-]?key\s*[:=]\s*["'][^"']+["']/gi, description: 'Hardcoded API keys', severity: 'critical', score: 60 },
            { pattern: /secret\s*[:=]\s*["'][^"']+["']/gi, description: 'Hardcoded secrets', severity: 'critical', score: 60 },
            { pattern: /token\s*[:=]\s*["'][^"']+["']/gi, description: 'Hardcoded tokens', severity: 'high', score: 40 },

            // Obfuscation attempts
            { pattern: /\\x[0-9a-f]{2}/gi, description: 'Hex encoded strings', severity: 'medium', score: 15 },
            { pattern: /\\u[0-9a-f]{4}/gi, description: 'Unicode encoded strings', severity: 'medium', score: 15 },
            { pattern: /String\.fromCharCode/gi, description: 'Character code obfuscation', severity: 'high', score: 30 },
            { pattern: /atob\s*\(/gi, description: 'Base64 decoding', severity: 'medium', score: 20 },
            { pattern: /btoa\s*\(/gi, description: 'Base64 encoding', severity: 'low', score: 10 }
        ];

        for (const { pattern, description, severity, score } of maliciousPatterns) {
            if (pattern.test(code)) {
                if (!context?.allowDangerousPatterns) {
                    if (severity === 'critical') {
                        errors.push(`Critical security risk detected: ${description}`);
                    } else {
                        warnings.push(`Potentially dangerous content detected: ${description}`);
                    }
                    securityScore -= score;
                } else {
                    warnings.push(`Dangerous pattern allowed by context: ${description}`);
                    securityScore -= Math.floor(score / 2);
                }
            }
        }

        // Check code complexity (security consideration)
        const complexity = this.calculateCodeComplexity(code);
        if (context?.maxComplexity && complexity > context.maxComplexity) {
            warnings.push(`Code complexity (${complexity}) exceeds maximum (${context.maxComplexity})`);
            securityScore -= 10;
        }

        // Check for suspicious patterns specific to different languages
        const languagePatterns = this.detectLanguageSpecificThreats(code);
        if (languagePatterns.length > 0) {
            warnings.push(...languagePatterns);
            securityScore -= languagePatterns.length * 5;
        }

        // Sanitize by removing dangerous characters
        let sanitizedCode = code.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

        // Additional sanitization in strict mode
        if (context?.strictMode) {
            // Remove comments that might contain malicious content
            sanitizedCode = sanitizedCode.replace(/\/\*[\s\S]*?\*\//g, '');
            sanitizedCode = sanitizedCode.replace(/\/\/.*$/gm, '');
            sanitizedCode = sanitizedCode.replace(/#.*$/gm, '');
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings: warnings.length > 0 ? warnings : undefined,
            sanitizedValue: sanitizedCode,
            securityScore: Math.max(0, securityScore),
            metadata: {
                originalLength: code.length,
                sanitizedLength: sanitizedCode.length,
                complexity,
                detectedPatterns: maliciousPatterns.filter(p => p.pattern.test(code)).length
            }
        };
    }

    /**
     * Calculate code complexity score
     */
    private static calculateCodeComplexity(code: string): number {
        let complexity = 1; // Base complexity

        // Cyclomatic complexity indicators
        const complexityPatterns = [
            /\bif\b/g, /\belse\b/g, /\belif\b/g, /\bwhile\b/g, /\bfor\b/g,
            /\bswitch\b/g, /\bcase\b/g, /\btry\b/g, /\bcatch\b/g, /\bfinally\b/g,
            /\?\s*:/g, // Ternary operators
            /&&/g, /\|\|/g // Logical operators
        ];

        complexityPatterns.forEach(pattern => {
            const matches = code.match(pattern);
            if (matches) {
                complexity += matches.length;
            }
        });

        // Nesting depth penalty
        const nestingDepth = this.calculateNestingDepth(code);
        complexity += nestingDepth * 2;

        return complexity;
    }

    /**
     * Calculate maximum nesting depth
     */
    private static calculateNestingDepth(code: string): number {
        let maxDepth = 0;
        let currentDepth = 0;

        for (const char of code) {
            if (char === '{' || char === '(') {
                currentDepth++;
                maxDepth = Math.max(maxDepth, currentDepth);
            } else if (char === '}' || char === ')') {
                currentDepth = Math.max(0, currentDepth - 1);
            }
        }

        return maxDepth;
    }

    /**
     * Detect language-specific security threats
     */
    private static detectLanguageSpecificThreats(code: string): string[] {
        const threats: string[] = [];

        // JavaScript/TypeScript specific
        if (/\.(js|ts|jsx|tsx)$/.test(code) || /function|const|let|var/.test(code)) {
            if (/require\s*\(\s*["']child_process["']\s*\)/.test(code)) {
                threats.push('Node.js child_process usage detected');
            }
            if (/require\s*\(\s*["']fs["']\s*\)/.test(code)) {
                threats.push('Node.js filesystem access detected');
            }
            if (/process\.env/.test(code)) {
                threats.push('Environment variable access detected');
            }
        }

        // Python specific
        if (/def\s+|import\s+|from\s+/.test(code)) {
            if (/import\s+os/.test(code)) {
                threats.push('Python os module import detected');
            }
            if (/import\s+subprocess/.test(code)) {
                threats.push('Python subprocess module import detected');
            }
            if (/__import__\s*\(/.test(code)) {
                threats.push('Dynamic import usage detected');
            }
        }

        // SQL injection patterns
        if (/SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER/i.test(code)) {
            if (/\+.*["'].*\+/.test(code)) {
                threats.push('Potential SQL injection via string concatenation');
            }
        }

        return threats;
    }

    /**
     * Validate commit message with enhanced security and quality checks
     */
    public static validateCommitMessage(message: string, context?: SecurityContext): ValidationResult {
        const errors: string[] = [];
        const warnings: string[] = [];
        let securityScore = 100;

        if (!message || typeof message !== 'string') {
            return {
                isValid: false,
                errors: ['Commit message must be a string'],
                securityScore: 0
            };
        }

        const trimmedMessage = message.trim();

        if (trimmedMessage.length === 0) {
            errors.push('Commit message cannot be empty');
            securityScore -= 50;
        }

        if (trimmedMessage.length > 500) {
            errors.push('Commit message is too long (maximum 500 characters)');
            securityScore -= 20;
        }

        if (trimmedMessage.length < 10) {
            errors.push('Commit message is too short (minimum 10 characters)');
            securityScore -= 15;
        }

        // Enhanced inappropriate content detection
        const inappropriatePatterns = [
            { pattern: /\b(fuck|shit|damn|hell|crap|bitch|ass)\b/gi, description: 'Profanity', score: 30 },
            { pattern: /\b(password|secret|key|token|auth)\s*[:=]\s*\S+/gi, description: 'Sensitive data', score: 60 },
            { pattern: /\b(api[_-]?key|access[_-]?token|private[_-]?key)\s*[:=]\s*\S+/gi, description: 'API credentials', score: 70 },
            { pattern: /\b(username|user|login)\s*[:=]\s*\S+/gi, description: 'User credentials', score: 40 },
            { pattern: /\b(database|db)[_-]?(password|pass|pwd)\s*[:=]\s*\S+/gi, description: 'Database credentials', score: 70 },
            { pattern: /\b(ssh|ssl|tls)[_-]?(key|cert|certificate)\s*[:=]\s*\S+/gi, description: 'Security certificates', score: 60 }
        ];

        for (const { pattern, description, score } of inappropriatePatterns) {
            if (pattern.test(trimmedMessage)) {
                errors.push(`Commit message contains ${description.toLowerCase()}`);
                securityScore -= score;
            }
        }

        // Check for potential information disclosure
        const disclosurePatterns = [
            /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, // IP addresses
            /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, // Email addresses
            /\b[A-Za-z0-9]{20,}\b/g, // Long alphanumeric strings (potential tokens)
            /\b(localhost|127\.0\.0\.1|0\.0\.0\.0)\b/gi // Local addresses
        ];

        for (const pattern of disclosurePatterns) {
            if (pattern.test(trimmedMessage)) {
                warnings.push('Commit message may contain sensitive information');
                securityScore -= 15;
                break;
            }
        }

        // Check commit message format (conventional commits)
        const conventionalCommitPattern = /^(feat|fix|docs|style|refactor|test|chore|perf|ci|build|revert)(\(.+\))?: .+/;
        if (!conventionalCommitPattern.test(trimmedMessage)) {
            warnings.push('Commit message does not follow conventional commit format');
            securityScore -= 5;
        }

        // Sanitize message
        const sanitizedMessage = trimmedMessage
            .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove control characters
            .replace(/\s+/g, ' '); // Normalize whitespace

        return {
            isValid: errors.length === 0,
            errors,
            warnings: warnings.length > 0 ? warnings : undefined,
            sanitizedValue: sanitizedMessage,
            securityScore: Math.max(0, securityScore),
            metadata: {
                originalLength: message.length,
                sanitizedLength: sanitizedMessage.length,
                followsConventionalFormat: conventionalCommitPattern.test(trimmedMessage)
            }
        };
    }

    /**
     * Validate language identifier
     */
    public static validateLanguage(language: string): ValidationResult {
        const errors: string[] = [];
        
        if (!language || typeof language !== 'string') {
            return { isValid: false, errors: ['Language must be a string'] };
        }

        const trimmedLanguage = language.trim().toLowerCase();
        
        const supportedLanguages = [
            'typescript', 'javascript', 'python', 'java', 'csharp', 'cpp', 'c',
            'go', 'rust', 'php', 'ruby', 'swift', 'kotlin', 'scala', 'html',
            'css', 'json', 'xml', 'yaml', 'markdown', 'sql', 'shell', 'bash'
        ];

        if (!supportedLanguages.includes(trimmedLanguage)) {
            errors.push(`Unsupported language: ${trimmedLanguage}`);
        }

        return {
            isValid: errors.length === 0,
            errors,
            sanitizedValue: trimmedLanguage
        };
    }

    /**
     * Validate URL
     */
    public static validateUrl(url: string): ValidationResult {
        const errors: string[] = [];
        
        if (!url || typeof url !== 'string') {
            return { isValid: false, errors: ['URL must be a string'] };
        }

        const trimmedUrl = url.trim();
        
        try {
            const urlObj = new URL(trimmedUrl);
            
            // Only allow HTTPS for security
            if (urlObj.protocol !== 'https:') {
                errors.push('Only HTTPS URLs are allowed');
            }

            // Check for suspicious domains
            const suspiciousDomains = ['localhost', '127.0.0.1', '0.0.0.0'];
            if (suspiciousDomains.some(domain => urlObj.hostname.includes(domain))) {
                errors.push('Local URLs are not allowed');
            }

        } catch (error) {
            errors.push('Invalid URL format');
        }

        return {
            isValid: errors.length === 0,
            errors,
            sanitizedValue: trimmedUrl
        };
    }

    /**
     * Validate configuration object
     */
    public static validateConfiguration(config: any): ValidationResult {
        const errors: string[] = [];
        
        if (!config || typeof config !== 'object') {
            return { isValid: false, errors: ['Configuration must be an object'] };
        }

        // Check for required fields
        const requiredFields = ['provider', 'maxTokens'];
        for (const field of requiredFields) {
            if (!(field in config)) {
                errors.push(`Missing required field: ${field}`);
            }
        }

        // Validate provider
        if (config.provider && !['openai', 'anthropic'].includes(config.provider)) {
            errors.push('Invalid provider. Must be "openai" or "anthropic"');
        }

        // Validate maxTokens
        if (config.maxTokens && (typeof config.maxTokens !== 'number' || config.maxTokens < 1 || config.maxTokens > 10000)) {
            errors.push('maxTokens must be a number between 1 and 10000');
        }

        return {
            isValid: errors.length === 0,
            errors,
            sanitizedValue: config
        };
    }

    /**
     * Apply multiple validation rules
     */
    public static applyRules(value: any, rules: ValidationRule[]): ValidationResult {
        const allErrors: string[] = [];
        let sanitizedValue = value;

        for (const rule of rules) {
            try {
                const result = rule.validator(sanitizedValue);
                if (!result.isValid) {
                    allErrors.push(...result.errors.map(error => `${rule.name}: ${error}`));
                } else if (result.sanitizedValue !== undefined) {
                    sanitizedValue = result.sanitizedValue;
                }
            } catch (error) {
                this.contextLogger.error(`Validation rule '${rule.name}' failed`, error as Error);
                allErrors.push(`${rule.name}: Validation rule failed`);
            }
        }

        return {
            isValid: allErrors.length === 0,
            errors: allErrors,
            sanitizedValue
        };
    }

    /**
     * Sanitize HTML content
     */
    public static sanitizeHtml(html: string): string {
        if (!html || typeof html !== 'string') {
            return '';
        }

        return html
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#x27;')
            .replace(/\//g, '&#x2F;');
    }

    /**
     * Validate and sanitize user input for UI
     */
    public static validateUserInput(input: string, maxLength: number = 1000): ValidationResult {
        const errors: string[] = [];
        
        if (!input || typeof input !== 'string') {
            return { isValid: false, errors: ['Input must be a string'] };
        }

        const trimmedInput = input.trim();
        
        if (trimmedInput.length > maxLength) {
            errors.push(`Input exceeds maximum length of ${maxLength} characters`);
        }

        // Remove potentially dangerous characters
        const sanitizedInput = trimmedInput.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

        return {
            isValid: errors.length === 0,
            errors,
            sanitizedValue: sanitizedInput
        };
    }

    /**
     * Validate API key format and security
     */
    public static validateApiKey(apiKey: string, provider: 'openai' | 'anthropic'): ValidationResult {
        const errors: string[] = [];
        const warnings: string[] = [];
        let securityScore = 100;

        if (!apiKey || typeof apiKey !== 'string') {
            return {
                isValid: false,
                errors: ['API key must be a non-empty string'],
                securityScore: 0
            };
        }

        const trimmedKey = apiKey.trim();

        // Provider-specific validation
        switch (provider) {
            case 'openai':
                if (!trimmedKey.startsWith('sk-')) {
                    errors.push('OpenAI API key must start with "sk-"');
                    securityScore -= 50;
                }
                if (trimmedKey.length < 40) {
                    errors.push('OpenAI API key appears to be too short');
                    securityScore -= 30;
                }
                break;
            case 'anthropic':
                if (!trimmedKey.startsWith('sk-ant-')) {
                    errors.push('Anthropic API key must start with "sk-ant-"');
                    securityScore -= 50;
                }
                if (trimmedKey.length < 50) {
                    errors.push('Anthropic API key appears to be too short');
                    securityScore -= 30;
                }
                break;
        }

        // General security checks
        if (trimmedKey.includes(' ')) {
            errors.push('API key should not contain spaces');
            securityScore -= 20;
        }

        if (!/^[A-Za-z0-9\-_]+$/.test(trimmedKey)) {
            warnings.push('API key contains unusual characters');
            securityScore -= 10;
        }

        // Check for potential test/dummy keys
        const testPatterns = [
            /test/i, /dummy/i, /fake/i, /example/i, /placeholder/i
        ];

        for (const pattern of testPatterns) {
            if (pattern.test(trimmedKey)) {
                warnings.push('API key appears to be a test or placeholder key');
                securityScore -= 40;
                break;
            }
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings: warnings.length > 0 ? warnings : undefined,
            sanitizedValue: trimmedKey,
            securityScore: Math.max(0, securityScore),
            metadata: {
                provider,
                keyLength: trimmedKey.length,
                hasValidPrefix: provider === 'openai' ? trimmedKey.startsWith('sk-') : trimmedKey.startsWith('sk-ant-')
            }
        };
    }

    /**
     * Validate JSON input with security considerations
     */
    public static validateJsonInput(jsonString: string, maxDepth: number = 10): ValidationResult {
        const errors: string[] = [];
        const warnings: string[] = [];
        let securityScore = 100;

        if (!jsonString || typeof jsonString !== 'string') {
            return {
                isValid: false,
                errors: ['JSON input must be a string'],
                securityScore: 0
            };
        }

        const trimmedJson = jsonString.trim();

        // Check for potential JSON injection patterns
        const dangerousPatterns = [
            { pattern: /__proto__/gi, description: 'Prototype pollution attempt', score: 60 },
            { pattern: /constructor/gi, description: 'Constructor access attempt', score: 40 },
            { pattern: /eval\s*\(/gi, description: 'eval() in JSON', score: 70 },
            { pattern: /function\s*\(/gi, description: 'Function in JSON', score: 50 },
            { pattern: /javascript:/gi, description: 'JavaScript protocol in JSON', score: 50 }
        ];

        for (const { pattern, description, score } of dangerousPatterns) {
            if (pattern.test(trimmedJson)) {
                errors.push(`Dangerous pattern detected: ${description}`);
                securityScore -= score;
            }
        }

        // Try to parse JSON
        let parsedJson: any;
        try {
            parsedJson = JSON.parse(trimmedJson);
        } catch (error) {
            errors.push('Invalid JSON format');
            return {
                isValid: false,
                errors,
                securityScore: 0
            };
        }

        // Check JSON depth (DoS prevention)
        const depth = this.calculateJsonDepth(parsedJson);
        if (depth > maxDepth) {
            errors.push(`JSON depth (${depth}) exceeds maximum allowed (${maxDepth})`);
            securityScore -= 30;
        }

        // Check for excessively large arrays/objects
        const size = this.calculateJsonSize(parsedJson);
        if (size > 10000) {
            warnings.push(`JSON contains ${size} elements, which may impact performance`);
            securityScore -= 10;
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings: warnings.length > 0 ? warnings : undefined,
            sanitizedValue: parsedJson,
            securityScore: Math.max(0, securityScore),
            metadata: {
                originalLength: jsonString.length,
                depth,
                size,
                type: Array.isArray(parsedJson) ? 'array' : typeof parsedJson
            }
        };
    }

    /**
     * Calculate JSON object depth
     */
    private static calculateJsonDepth(obj: any, currentDepth: number = 0): number {
        if (obj === null || typeof obj !== 'object') {
            return currentDepth;
        }

        let maxDepth = currentDepth;
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                const depth = this.calculateJsonDepth(obj[key], currentDepth + 1);
                maxDepth = Math.max(maxDepth, depth);
            }
        }

        return maxDepth;
    }

    /**
     * Calculate JSON object size (number of elements)
     */
    private static calculateJsonSize(obj: any): number {
        if (obj === null || typeof obj !== 'object') {
            return 1;
        }

        let size = 1;
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                size += this.calculateJsonSize(obj[key]);
            }
        }

        return size;
    }

    /**
     * Comprehensive input sanitization
     */
    public static sanitizeInput(input: string, options?: {
        allowHtml?: boolean;
        maxLength?: number;
        removeControlChars?: boolean;
        normalizeWhitespace?: boolean;
    }): ValidationResult {
        const errors: string[] = [];
        const warnings: string[] = [];
        let securityScore = 100;
        const opts = {
            allowHtml: false,
            maxLength: 10000,
            removeControlChars: true,
            normalizeWhitespace: true,
            ...options
        };

        if (!input || typeof input !== 'string') {
            return {
                isValid: false,
                errors: ['Input must be a string'],
                securityScore: 0
            };
        }

        let sanitized = input;

        // Length check
        if (sanitized.length > opts.maxLength) {
            errors.push(`Input exceeds maximum length of ${opts.maxLength} characters`);
            sanitized = sanitized.substring(0, opts.maxLength);
            securityScore -= 20;
        }

        // Remove control characters
        if (opts.removeControlChars) {
            const originalLength = sanitized.length;
            sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '');
            if (sanitized.length !== originalLength) {
                warnings.push('Control characters were removed from input');
                securityScore -= 5;
            }
        }

        // HTML sanitization
        if (!opts.allowHtml) {
            const htmlPattern = /<[^>]*>/g;
            if (htmlPattern.test(sanitized)) {
                sanitized = sanitized.replace(htmlPattern, '');
                warnings.push('HTML tags were removed from input');
                securityScore -= 15;
            }
        }

        // Normalize whitespace
        if (opts.normalizeWhitespace) {
            const originalLength = sanitized.length;
            sanitized = sanitized.replace(/\s+/g, ' ').trim();
            if (sanitized.length !== originalLength) {
                warnings.push('Whitespace was normalized');
                securityScore -= 2;
            }
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings: warnings.length > 0 ? warnings : undefined,
            sanitizedValue: sanitized,
            securityScore: Math.max(0, securityScore),
            metadata: {
                originalLength: input.length,
                sanitizedLength: sanitized.length,
                charactersRemoved: input.length - sanitized.length
            }
        };
    }
}
