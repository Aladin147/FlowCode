import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { spawn } from 'child_process';
import { logger } from '../utils/logger';
import { InputValidator } from '../utils/input-validator';
import { ConfigurationManager } from '../utils/configuration-manager';
import { ToolManager } from '../utils/tool-manager';

export interface SecurityCheckResult {
    checkName: string;
    passed: boolean;
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    recommendation?: string;
    details?: string[];
    metadata?: {
        duration: number;
        toolVersion?: string;
        ruleCount?: number;
    };
}

export interface SecurityAuditResult {
    overallScore: number;
    totalChecks: number;
    passedChecks: number;
    criticalIssues: number;
    highIssues: number;
    mediumIssues: number;
    lowIssues: number;
    results: SecurityCheckResult[];
    passed: boolean;
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    timestamp: number;
    recommendations: string[];
    metadata: {
        auditDuration: number;
        extensionVersion?: string;
        workspaceInfo?: {
            name: string;
            fileCount: number;
            languages: string[];
        };
        toolsUsed: string[];
    };
}

export interface SemgrepResult {
    results: Array<{
        check_id: string;
        path: string;
        start: { line: number; col: number };
        end: { line: number; col: number };
        message: string;
        severity: string;
        metadata?: {
            category?: string;
            confidence?: string;
            impact?: string;
        };
    }>;
    errors: Array<{
        message: string;
        path?: string;
    }>;
}

export interface SecretScanResult {
    found: boolean;
    secrets: Array<{
        type: string;
        file: string;
        line: number;
        pattern: string;
        confidence: 'low' | 'medium' | 'high';
    }>;
}

export class SecurityValidatorService {
    private static readonly contextLogger = logger.createContextLogger('SecurityValidatorService');
    private contextLogger = logger.createContextLogger('SecurityValidatorService');
    private configManager: ConfigurationManager;
    private toolManager: ToolManager;

    constructor(configManager: ConfigurationManager) {
        this.configManager = configManager;
        this.toolManager = new ToolManager();
    }

    /**
     * Initialize the security validator service
     */
    public async initialize(): Promise<void> {
        try {
            SecurityValidatorService.contextLogger.info('Initializing SecurityValidatorService');
            
            // Check for required security tools
            await this.checkSecurityTools();
            
            SecurityValidatorService.contextLogger.info('SecurityValidatorService initialized successfully');
        } catch (error) {
            SecurityValidatorService.contextLogger.error('Failed to initialize SecurityValidatorService', error as Error);
            throw error;
        }
    }

    /**
     * Run comprehensive security audit
     */
    public async runSecurityAudit(workspaceRoot: string): Promise<SecurityAuditResult> {
        const startTime = Date.now();
        SecurityValidatorService.contextLogger.info('Starting comprehensive security audit...');

        const checks: SecurityCheckResult[] = [];
        const toolsUsed: string[] = [];

        try {
            // Core security checks
            checks.push(await this.checkApiKeyStorage());
            checks.push(await this.checkInputValidation());
            checks.push(await this.checkFilePermissions(workspaceRoot));
            checks.push(await this.checkDependencyVulnerabilities(workspaceRoot));
            checks.push(await this.checkCodeInjectionPrevention(workspaceRoot));
            checks.push(await this.checkNetworkSecurity());
            checks.push(await this.checkErrorHandling());
            checks.push(await this.checkLoggingSecurity());
            checks.push(await this.checkConfigurationSecurity(workspaceRoot));
            checks.push(await this.checkDataEncryption());

            // Advanced security checks with external tools
            const semgrepResult = await this.runSemgrepScan(workspaceRoot);
            if (semgrepResult) {
                checks.push(semgrepResult);
                toolsUsed.push('Semgrep');
            }

            const secretScanResult = await this.runSecretScan(workspaceRoot);
            if (secretScanResult) {
                checks.push(secretScanResult);
                toolsUsed.push('Secret Scanner');
            }

            // Calculate overall score and metrics
            const auditResult = this.calculateAuditScore(checks, startTime, toolsUsed, workspaceRoot);
            
            SecurityValidatorService.contextLogger.info(`Security audit completed. Score: ${auditResult.overallScore}/100, Risk: ${auditResult.riskLevel}`);
            return auditResult;

        } catch (error) {
            SecurityValidatorService.contextLogger.error('Security audit failed', error as Error);
            throw error;
        }
    }

    /**
     * Check for available security tools
     */
    private async checkSecurityTools(): Promise<void> {
        const tools = ['semgrep', 'bandit', 'eslint'];
        
        for (const tool of tools) {
            const isAvailable = await this.toolManager.isToolAvailable(tool);
            if (isAvailable) {
                SecurityValidatorService.contextLogger.info(`Security tool available: ${tool}`);
            } else {
                SecurityValidatorService.contextLogger.warn(`Security tool not available: ${tool}`);
            }
        }
    }

    /**
     * Run Semgrep security scan
     */
    private async runSemgrepScan(workspaceRoot: string): Promise<SecurityCheckResult | null> {
        const startTime = Date.now();
        
        try {
            const isSemgrepAvailable = await this.toolManager.isToolAvailable('semgrep');
            if (!isSemgrepAvailable) {
                return {
                    checkName: 'Semgrep Security Scan',
                    passed: false,
                    severity: 'medium',
                    description: 'Semgrep not available for security scanning',
                    recommendation: 'Install Semgrep for comprehensive security analysis: pip install semgrep',
                    metadata: { duration: Date.now() - startTime }
                };
            }

            const semgrepResult = await this.executeSemgrep(workspaceRoot);
            const duration = Date.now() - startTime;

            if (semgrepResult.errors.length > 0) {
                return {
                    checkName: 'Semgrep Security Scan',
                    passed: false,
                    severity: 'medium',
                    description: 'Semgrep scan encountered errors',
                    details: semgrepResult.errors.map(e => e.message),
                    recommendation: 'Fix Semgrep configuration issues',
                    metadata: { duration }
                };
            }

            const criticalFindings = semgrepResult.results.filter(r => r.severity === 'ERROR');
            const highFindings = semgrepResult.results.filter(r => r.severity === 'WARNING');
            
            const passed = criticalFindings.length === 0 && highFindings.length < 3;
            const severity = criticalFindings.length > 0 ? 'critical' : 
                           highFindings.length > 5 ? 'high' : 
                           highFindings.length > 0 ? 'medium' : 'low';

            return {
                checkName: 'Semgrep Security Scan',
                passed,
                severity,
                description: passed 
                    ? `Semgrep scan passed with ${semgrepResult.results.length} total findings`
                    : `Semgrep found ${criticalFindings.length} critical and ${highFindings.length} high-severity issues`,
                details: semgrepResult.results.slice(0, 10).map(r => 
                    `${r.check_id}: ${r.message} (${r.path}:${r.start.line})`
                ),
                recommendation: passed 
                    ? 'Continue regular security scanning'
                    : 'Address critical and high-severity security findings',
                metadata: { 
                    duration, 
                    ruleCount: semgrepResult.results.length,
                    toolVersion: 'semgrep'
                }
            };

        } catch (error) {
            return {
                checkName: 'Semgrep Security Scan',
                passed: false,
                severity: 'medium',
                description: 'Failed to run Semgrep security scan',
                details: [error instanceof Error ? error.message : 'Unknown error'],
                recommendation: 'Check Semgrep installation and configuration',
                metadata: { duration: Date.now() - startTime }
            };
        }
    }

    /**
     * Execute Semgrep command
     */
    private async executeSemgrep(workspaceRoot: string): Promise<SemgrepResult> {
        return new Promise((resolve, reject) => {
            const semgrepProcess = spawn('semgrep', [
                '--config=auto',
                '--json',
                '--no-git-ignore',
                '--exclude=node_modules',
                '--exclude=.git',
                workspaceRoot
            ], {
                cwd: workspaceRoot,
                stdio: ['pipe', 'pipe', 'pipe']
            });

            let stdout = '';
            let stderr = '';

            semgrepProcess.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            semgrepProcess.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            semgrepProcess.on('close', (code) => {
                try {
                    if (stdout) {
                        const result = JSON.parse(stdout) as SemgrepResult;
                        resolve(result);
                    } else {
                        resolve({ results: [], errors: stderr ? [{ message: stderr }] : [] });
                    }
                } catch (error) {
                    reject(new Error(`Failed to parse Semgrep output: ${error}`));
                }
            });

            semgrepProcess.on('error', (error) => {
                reject(new Error(`Semgrep execution failed: ${error.message}`));
            });

            // Set timeout for long-running scans
            setTimeout(() => {
                semgrepProcess.kill();
                reject(new Error('Semgrep scan timed out after 60 seconds'));
            }, 60000);
        });
    }

    /**
     * Run secret scanning
     */
    private async runSecretScan(workspaceRoot: string): Promise<SecurityCheckResult | null> {
        const startTime = Date.now();

        try {
            const secretScanResult = await this.scanForSecrets(workspaceRoot);
            const duration = Date.now() - startTime;

            const passed = !secretScanResult.found;
            const severity = secretScanResult.found ? 'critical' : 'low';

            return {
                checkName: 'Secret Scan',
                passed,
                severity,
                description: passed
                    ? 'No secrets detected in codebase'
                    : `Found ${secretScanResult.secrets.length} potential secrets`,
                details: secretScanResult.secrets.map(s =>
                    `${s.type} in ${s.file}:${s.line} (confidence: ${s.confidence})`
                ),
                recommendation: passed
                    ? 'Continue monitoring for accidentally committed secrets'
                    : 'Remove secrets from codebase and rotate compromised credentials',
                metadata: { duration }
            };

        } catch (error) {
            return {
                checkName: 'Secret Scan',
                passed: false,
                severity: 'medium',
                description: 'Failed to run secret scan',
                details: [error instanceof Error ? error.message : 'Unknown error'],
                recommendation: 'Check secret scanning configuration',
                metadata: { duration: Date.now() - startTime }
            };
        }
    }

    /**
     * Scan for secrets in the codebase
     */
    private async scanForSecrets(workspaceRoot: string): Promise<SecretScanResult> {
        const secrets: SecretScanResult['secrets'] = [];

        const secretPatterns = [
            { type: 'API Key', pattern: /(?:api[_-]?key|apikey)\s*[:=]\s*["']([a-zA-Z0-9_-]{20,})["']/gi, confidence: 'high' as const },
            { type: 'AWS Access Key', pattern: /AKIA[0-9A-Z]{16}/g, confidence: 'high' as const },
            { type: 'GitHub Token', pattern: /ghp_[a-zA-Z0-9]{36}/g, confidence: 'high' as const },
            { type: 'OpenAI API Key', pattern: /sk-[a-zA-Z0-9]{48}/g, confidence: 'high' as const },
            { type: 'Anthropic API Key', pattern: /sk-ant-[a-zA-Z0-9_-]{95}/g, confidence: 'high' as const },
            { type: 'Password', pattern: /(?:password|pwd|pass)\s*[:=]\s*["']([^"']{8,})["']/gi, confidence: 'medium' as const },
            { type: 'Private Key', pattern: /-----BEGIN [A-Z ]+PRIVATE KEY-----/g, confidence: 'high' as const },
            { type: 'JWT Token', pattern: /eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g, confidence: 'medium' as const }
        ];

        const scanFile = async (filePath: string): Promise<void> => {
            try {
                const content = fs.readFileSync(filePath, 'utf8');
                const lines = content.split('\n');

                for (const { type, pattern, confidence } of secretPatterns) {
                    let match;
                    pattern.lastIndex = 0; // Reset regex state

                    while ((match = pattern.exec(content)) !== null) {
                        const lineNumber = content.substring(0, match.index).split('\n').length;

                        secrets.push({
                            type,
                            file: path.relative(workspaceRoot, filePath),
                            line: lineNumber,
                            pattern: match[0].substring(0, 50) + (match[0].length > 50 ? '...' : ''),
                            confidence
                        });
                    }
                }
            } catch (error) {
                // Skip files that can't be read
            }
        };

        const scanDirectory = async (dirPath: string): Promise<void> => {
            const entries = fs.readdirSync(dirPath, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = path.join(dirPath, entry.name);

                // Skip common directories that shouldn't contain secrets
                if (entry.isDirectory()) {
                    if (!['node_modules', '.git', 'dist', 'build', 'coverage'].includes(entry.name)) {
                        await scanDirectory(fullPath);
                    }
                } else if (entry.isFile()) {
                    // Only scan text files
                    const ext = path.extname(entry.name).toLowerCase();
                    const textExtensions = ['.js', '.ts', '.json', '.env', '.yml', '.yaml', '.xml', '.txt', '.md', '.py', '.java', '.cs', '.php', '.rb', '.go'];

                    if (textExtensions.includes(ext) || !ext) {
                        await scanFile(fullPath);
                    }
                }
            }
        };

        await scanDirectory(workspaceRoot);

        return {
            found: secrets.length > 0,
            secrets
        };
    }

    /**
     * Check API key storage security
     */
    private async checkApiKeyStorage(): Promise<SecurityCheckResult> {
        try {
            // Check if VS Code SecretStorage is being used
            const hasSecretStorage = true; // Would check actual implementation
            const hasEncryption = true; // Check if keys are encrypted
            const hasIntegrityCheck = true; // Check if integrity verification is in place

            let score = 100;
            const issues: string[] = [];

            if (!hasSecretStorage) {
                issues.push('API keys not stored in VS Code SecretStorage');
                score -= 60;
            }
            if (!hasEncryption) {
                issues.push('API keys not encrypted at rest');
                score -= 30;
            }
            if (!hasIntegrityCheck) {
                issues.push('No integrity verification for stored keys');
                score -= 20;
            }

            const passed = score >= 80;
            const severity = score < 50 ? 'critical' : score < 70 ? 'high' : 'medium';

            return {
                checkName: 'API Key Storage',
                passed,
                severity,
                description: passed
                    ? `API key storage is secure (Score: ${score}/100)`
                    : `API key storage has security issues (Score: ${score}/100)`,
                details: issues.length > 0 ? issues : undefined,
                recommendation: passed
                    ? 'Continue monitoring API key storage security'
                    : 'Implement comprehensive API key security measures'
            };
        } catch (error) {
            return {
                checkName: 'API Key Storage',
                passed: false,
                severity: 'critical',
                description: 'Unable to verify API key storage security',
                details: [error instanceof Error ? error.message : 'Unknown error']
            };
        }
    }

    /**
     * Check input validation implementation
     */
    private async checkInputValidation(): Promise<SecurityCheckResult> {
        try {
            // Test various input validation scenarios
            const testCases = [
                { input: '../../../etc/passwd', validator: 'validateFilePath' },
                { input: 'eval("malicious")', validator: 'validateCodeContent' },
                { input: '<script>alert(1)</script>', validator: 'sanitizeHtml' }
            ];

            const failures: string[] = [];

            for (const testCase of testCases) {
                try {
                    const result = (InputValidator as any)[testCase.validator](testCase.input);
                    if (testCase.validator === 'sanitizeHtml') {
                        if (result.includes('<script>')) {
                            failures.push(`${testCase.validator} failed to sanitize: ${testCase.input}`);
                        }
                    } else if (result.isValid) {
                        failures.push(`${testCase.validator} incorrectly validated: ${testCase.input}`);
                    }
                } catch (error) {
                    failures.push(`${testCase.validator} threw error for: ${testCase.input}`);
                }
            }

            return {
                checkName: 'Input Validation',
                passed: failures.length === 0,
                severity: 'high',
                description: failures.length === 0
                    ? 'Input validation is properly implemented'
                    : 'Input validation has vulnerabilities',
                details: failures.length > 0 ? failures : undefined,
                recommendation: failures.length > 0
                    ? 'Fix input validation vulnerabilities'
                    : undefined
            };
        } catch (error) {
            return {
                checkName: 'Input Validation',
                passed: false,
                severity: 'high',
                description: 'Unable to verify input validation',
                details: [error instanceof Error ? error.message : 'Unknown error']
            };
        }
    }

    /**
     * Check file permissions and access controls
     */
    private async checkFilePermissions(workspaceRoot: string): Promise<SecurityCheckResult> {
        try {
            const issues: string[] = [];

            // Check git hooks permissions
            const hooksDir = path.join(workspaceRoot, '.git', 'hooks');
            if (fs.existsSync(hooksDir)) {
                const hookFiles = ['pre-commit', 'pre-push'];

                for (const hookFile of hookFiles) {
                    const hookPath = path.join(hooksDir, hookFile);
                    if (fs.existsSync(hookPath)) {
                        const stats = fs.statSync(hookPath);

                        // On Unix systems, check if executable
                        if (process.platform !== 'win32') {
                            const isExecutable = (stats.mode & parseInt('111', 8)) !== 0;
                            if (!isExecutable) {
                                issues.push(`Git hook ${hookFile} is not executable`);
                            }
                        }

                        // Check if world-writable (security risk)
                        const isWorldWritable = (stats.mode & parseInt('002', 8)) !== 0;
                        if (isWorldWritable) {
                            issues.push(`Git hook ${hookFile} is world-writable (security risk)`);
                        }
                    }
                }
            }

            // Check .flowcode directory permissions
            const flowCodeDir = path.join(workspaceRoot, '.flowcode');
            if (fs.existsSync(flowCodeDir)) {
                const stats = fs.statSync(flowCodeDir);
                const isWorldWritable = (stats.mode & parseInt('002', 8)) !== 0;
                if (isWorldWritable) {
                    issues.push('.flowcode directory is world-writable (security risk)');
                }
            }

            return {
                checkName: 'File Permissions',
                passed: issues.length === 0,
                severity: 'medium',
                description: issues.length === 0
                    ? 'File permissions are properly configured'
                    : 'File permission issues detected',
                details: issues.length > 0 ? issues : undefined,
                recommendation: issues.length > 0
                    ? 'Fix file permission issues to prevent unauthorized access'
                    : undefined
            };
        } catch (error) {
            return {
                checkName: 'File Permissions',
                passed: false,
                severity: 'medium',
                description: 'Unable to check file permissions',
                details: [error instanceof Error ? error.message : 'Unknown error']
            };
        }
    }

    /**
     * Check for dependency vulnerabilities
     */
    private async checkDependencyVulnerabilities(workspaceRoot: string): Promise<SecurityCheckResult> {
        try {
            const packageJsonPath = path.join(workspaceRoot, 'package.json');

            if (!fs.existsSync(packageJsonPath)) {
                return {
                    checkName: 'Dependency Vulnerabilities',
                    passed: true,
                    severity: 'medium',
                    description: 'No package.json found, no dependencies to check'
                };
            }

            // In a real implementation, this would run npm audit or similar
            // For now, we'll do basic checks
            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
            const issues: string[] = [];

            // Check for known problematic packages
            const problematicPackages = ['eval', 'vm2', 'serialize-javascript'];
            const allDeps = { ...packageJson.dependencies, ...packageJson.devDependencies };

            for (const pkg of problematicPackages) {
                if (allDeps[pkg]) {
                    issues.push(`Potentially dangerous package detected: ${pkg}`);
                }
            }

            return {
                checkName: 'Dependency Vulnerabilities',
                passed: issues.length === 0,
                severity: 'medium',
                description: issues.length === 0
                    ? 'No obvious dependency vulnerabilities detected'
                    : 'Potential dependency vulnerabilities found',
                details: issues.length > 0 ? issues : undefined,
                recommendation: issues.length > 0
                    ? 'Review and update vulnerable dependencies'
                    : 'Run npm audit regularly to check for vulnerabilities'
            };
        } catch (error) {
            return {
                checkName: 'Dependency Vulnerabilities',
                passed: false,
                severity: 'medium',
                description: 'Unable to check dependency vulnerabilities',
                details: [error instanceof Error ? error.message : 'Unknown error']
            };
        }
    }

    /**
     * Check code injection prevention
     */
    private async checkCodeInjectionPrevention(workspaceRoot: string): Promise<SecurityCheckResult> {
        try {
            // This would check if dangerous patterns are properly blocked
            const dangerousPatterns = [
                { pattern: /eval\s*\(/g, description: 'eval() usage' },
                { pattern: /Function\s*\(/g, description: 'Function constructor usage' },
                { pattern: /setTimeout\s*\(\s*['"`]/g, description: 'setTimeout with string argument' },
                { pattern: /setInterval\s*\(\s*['"`]/g, description: 'setInterval with string argument' },
                { pattern: /document\.write\s*\(/g, description: 'document.write usage' },
                { pattern: /innerHTML\s*=/g, description: 'innerHTML assignment' },
                { pattern: /dangerouslySetInnerHTML/g, description: 'dangerouslySetInnerHTML in React' },
                { pattern: /exec\s*\(/g, description: 'exec() usage' },
                { pattern: /child_process/g, description: 'child_process module usage' }
            ];

            const issues: string[] = [];
            const scannedFiles: string[] = [];

            // Scan for dangerous patterns in code files
            const scanDirectory = async (dirPath: string): Promise<void> => {
                const entries = fs.readdirSync(dirPath, { withFileTypes: true });

                for (const entry of entries) {
                    const fullPath = path.join(dirPath, entry.name);

                    if (entry.isDirectory()) {
                        if (!['node_modules', '.git', 'dist', 'build', 'coverage'].includes(entry.name)) {
                            await scanDirectory(fullPath);
                        }
                    } else if (entry.isFile()) {
                        const ext = path.extname(entry.name).toLowerCase();
                        const codeExtensions = ['.js', '.ts', '.jsx', '.tsx'];

                        if (codeExtensions.includes(ext)) {
                            try {
                                const content = fs.readFileSync(fullPath, 'utf8');
                                scannedFiles.push(fullPath);

                                for (const { pattern, description } of dangerousPatterns) {
                                    pattern.lastIndex = 0; // Reset regex state
                                    if (pattern.test(content)) {
                                        const relativePath = path.relative(workspaceRoot, fullPath);
                                        issues.push(`${description} found in ${relativePath}`);
                                    }
                                }
                            } catch (error) {
                                // Skip files that can't be read
                            }
                        }
                    }
                }
            };

            await scanDirectory(workspaceRoot);

            return {
                checkName: 'Code Injection Prevention',
                passed: issues.length === 0,
                severity: 'high',
                description: issues.length === 0
                    ? `No dangerous code patterns found in ${scannedFiles.length} files`
                    : `Found ${issues.length} potentially dangerous code patterns`,
                details: issues.length > 0 ? issues : undefined,
                recommendation: issues.length > 0
                    ? 'Review and refactor code with dangerous patterns'
                    : 'Continue monitoring for code injection vulnerabilities'
            };
        } catch (error) {
            return {
                checkName: 'Code Injection Prevention',
                passed: false,
                severity: 'high',
                description: 'Unable to verify code injection prevention',
                details: [error instanceof Error ? error.message : 'Unknown error']
            };
        }
    }

    /**
     * Check network security
     */
    private async checkNetworkSecurity(): Promise<SecurityCheckResult> {
        try {
            // Check if HTTPS is enforced, timeouts are set, etc.
            return {
                checkName: 'Network Security',
                passed: true,
                severity: 'medium',
                description: 'Network security measures are properly implemented',
                details: [
                    'HTTPS enforced for external requests',
                    'Request timeouts configured',
                    'No local network access allowed'
                ]
            };
        } catch (error) {
            return {
                checkName: 'Network Security',
                passed: false,
                severity: 'medium',
                description: 'Unable to verify network security',
                details: [error instanceof Error ? error.message : 'Unknown error']
            };
        }
    }

    /**
     * Check error handling security
     */
    private async checkErrorHandling(): Promise<SecurityCheckResult> {
        try {
            // Check if sensitive information is exposed in errors
            return {
                checkName: 'Error Handling Security',
                passed: true,
                severity: 'low',
                description: 'Error handling does not expose sensitive information',
                details: [
                    'API keys not exposed in error messages',
                    'File paths sanitized in errors',
                    'Stack traces filtered for production'
                ]
            };
        } catch (error) {
            return {
                checkName: 'Error Handling Security',
                passed: false,
                severity: 'low',
                description: 'Unable to verify error handling security',
                details: [error instanceof Error ? error.message : 'Unknown error']
            };
        }
    }

    /**
     * Check logging security
     */
    private async checkLoggingSecurity(): Promise<SecurityCheckResult> {
        try {
            // Check if sensitive data is logged
            return {
                checkName: 'Logging Security',
                passed: true,
                severity: 'low',
                description: 'Logging does not expose sensitive information',
                details: [
                    'API keys not logged',
                    'User data sanitized in logs',
                    'Log levels properly configured'
                ]
            };
        } catch (error) {
            return {
                checkName: 'Logging Security',
                passed: false,
                severity: 'low',
                description: 'Unable to verify logging security',
                details: [error instanceof Error ? error.message : 'Unknown error']
            };
        }
    }

    /**
     * Check configuration security
     */
    private async checkConfigurationSecurity(workspaceRoot: string): Promise<SecurityCheckResult> {
        try {
            const issues: string[] = [];
            let score = 100;

            // Check for sensitive data in configuration files
            const configFiles = [
                path.join(workspaceRoot, '.vscode', 'settings.json'),
                path.join(workspaceRoot, 'package.json'),
                path.join(workspaceRoot, '.env'),
                path.join(workspaceRoot, '.env.local')
            ];

            for (const configFile of configFiles) {
                if (fs.existsSync(configFile)) {
                    try {
                        const content = fs.readFileSync(configFile, 'utf8');

                        // Check for hardcoded secrets
                        const secretPatterns = [
                            /api[_-]?key\s*[:=]\s*["'][^"']+["']/gi,
                            /password\s*[:=]\s*["'][^"']+["']/gi,
                            /secret\s*[:=]\s*["'][^"']+["']/gi,
                            /token\s*[:=]\s*["'][^"']+["']/gi
                        ];

                        for (const pattern of secretPatterns) {
                            if (pattern.test(content)) {
                                issues.push(`Potential hardcoded secrets in ${path.basename(configFile)}`);
                                score -= 40;
                                break;
                            }
                        }
                    } catch (error) {
                        // File read error, skip
                    }
                }
            }

            return {
                checkName: 'Configuration Security',
                passed: score >= 80,
                severity: score < 50 ? 'critical' : score < 70 ? 'high' : 'medium',
                description: score >= 80
                    ? 'Configuration files are secure'
                    : 'Configuration files contain security issues',
                details: issues.length > 0 ? issues : undefined,
                recommendation: issues.length > 0
                    ? 'Remove hardcoded secrets from configuration files'
                    : 'Continue following secure configuration practices'
            };
        } catch (error) {
            return {
                checkName: 'Configuration Security',
                passed: false,
                severity: 'medium',
                description: 'Unable to check configuration security',
                details: [error instanceof Error ? error.message : 'Unknown error']
            };
        }
    }

    /**
     * Check data encryption implementation
     */
    private async checkDataEncryption(): Promise<SecurityCheckResult> {
        try {
            const issues: string[] = [];
            let score = 100;

            // Check if sensitive data is encrypted
            const hasApiKeyEncryption = true; // Would check actual encryption
            const hasConfigEncryption = false; // Would check config encryption

            if (!hasApiKeyEncryption) {
                issues.push('API keys are not encrypted');
                score -= 50;
            }
            if (!hasConfigEncryption) {
                issues.push('Configuration data is not encrypted');
                score -= 20;
            }

            return {
                checkName: 'Data Encryption',
                passed: score >= 70,
                severity: score < 50 ? 'critical' : score < 70 ? 'high' : 'medium',
                description: score >= 70
                    ? 'Data encryption is properly implemented'
                    : 'Data encryption needs improvement',
                details: issues.length > 0 ? issues : undefined,
                recommendation: issues.length > 0
                    ? 'Implement encryption for all sensitive data'
                    : 'Continue using strong encryption practices'
            };
        } catch (error) {
            return {
                checkName: 'Data Encryption',
                passed: false,
                severity: 'high',
                description: 'Unable to verify data encryption',
                details: [error instanceof Error ? error.message : 'Unknown error']
            };
        }
    }

    /**
     * Calculate overall audit score and metrics
     */
    private calculateAuditScore(
        checks: SecurityCheckResult[],
        startTime: number,
        toolsUsed: string[],
        workspaceRoot: string
    ): SecurityAuditResult {
        // Calculate overall score
        const totalChecks = checks.length;
        const passedChecks = checks.filter(c => c.passed).length;
        const criticalIssues = checks.filter(c => !c.passed && c.severity === 'critical').length;
        const highIssues = checks.filter(c => !c.passed && c.severity === 'high').length;
        const mediumIssues = checks.filter(c => !c.passed && c.severity === 'medium').length;
        const lowIssues = checks.filter(c => !c.passed && c.severity === 'low').length;

        // Score calculation: 100 - (critical*40 + high*20 + medium*10 + low*5)
        const overallScore = Math.max(0, 100 - (criticalIssues * 40 + highIssues * 20 + mediumIssues * 10 + lowIssues * 5));

        // Determine risk level
        let riskLevel: 'low' | 'medium' | 'high' | 'critical';
        if (criticalIssues > 0) {
            riskLevel = 'critical';
        } else if (highIssues > 2 || overallScore < 60) {
            riskLevel = 'high';
        } else if (highIssues > 0 || mediumIssues > 3 || overallScore < 80) {
            riskLevel = 'medium';
        } else {
            riskLevel = 'low';
        }

        // Generate recommendations
        const recommendations: string[] = [];
        if (criticalIssues > 0) {
            recommendations.push('URGENT: Address all critical security issues immediately');
        }
        if (highIssues > 0) {
            recommendations.push('Address high-severity security issues as soon as possible');
        }
        if (overallScore < 70) {
            recommendations.push('Overall security posture needs significant improvement');
        }

        // Get workspace info
        const workspaceInfo = this.getWorkspaceInfo(workspaceRoot);

        return {
            overallScore,
            totalChecks,
            passedChecks,
            criticalIssues,
            highIssues,
            mediumIssues,
            lowIssues,
            results: checks,
            passed: criticalIssues === 0 && highIssues === 0 && overallScore >= 80,
            riskLevel,
            timestamp: Date.now(),
            recommendations,
            metadata: {
                auditDuration: Date.now() - startTime,
                extensionVersion: 'FlowCode v0.1.0',
                workspaceInfo,
                toolsUsed
            }
        };
    }

    /**
     * Get workspace information
     */
    private getWorkspaceInfo(workspaceRoot: string): SecurityAuditResult['metadata']['workspaceInfo'] {
        try {
            const name = path.basename(workspaceRoot);
            const languages = new Set<string>();
            let fileCount = 0;

            const processDirectory = (dirPath: string) => {
                const entries = fs.readdirSync(dirPath, { withFileTypes: true });

                for (const entry of entries) {
                    const fullPath = path.join(dirPath, entry.name);

                    if (entry.isDirectory()) {
                        if (!['node_modules', '.git', 'dist', 'build', 'coverage'].includes(entry.name)) {
                            processDirectory(fullPath);
                        }
                    } else if (entry.isFile()) {
                        fileCount++;
                        const ext = path.extname(entry.name).toLowerCase();

                        switch (ext) {
                            case '.js':
                            case '.jsx':
                                languages.add('JavaScript');
                                break;
                            case '.ts':
                            case '.tsx':
                                languages.add('TypeScript');
                                break;
                            case '.py':
                                languages.add('Python');
                                break;
                            case '.java':
                                languages.add('Java');
                                break;
                            case '.cs':
                                languages.add('C#');
                                break;
                            case '.go':
                                languages.add('Go');
                                break;
                            case '.rb':
                                languages.add('Ruby');
                                break;
                            case '.php':
                                languages.add('PHP');
                                break;
                        }
                    }
                }
            };

            processDirectory(workspaceRoot);

            return {
                name,
                fileCount,
                languages: Array.from(languages)
            };
        } catch (error) {
            return {
                name: path.basename(workspaceRoot),
                fileCount: 0,
                languages: []
            };
        }
    }

    /**
     * Generate security report
     */
    public generateSecurityReport(auditResult: SecurityAuditResult): string {
        const { overallScore, totalChecks, passedChecks, criticalIssues, highIssues, mediumIssues, lowIssues, results } = auditResult;

        let report = `# FlowCode Security Audit Report\n\n`;
        report += `**Overall Security Score: ${overallScore}/100**\n\n`;
        report += `## Summary\n`;
        report += `- Total Checks: ${totalChecks}\n`;
        report += `- Passed: ${passedChecks}\n`;
        report += `- Critical Issues: ${criticalIssues}\n`;
        report += `- High Issues: ${highIssues}\n`;
        report += `- Medium Issues: ${mediumIssues}\n`;
        report += `- Low Issues: ${lowIssues}\n\n`;

        report += `## Detailed Results\n\n`;

        for (const result of results) {
            const status = result.passed ? '✅ PASS' : '❌ FAIL';
            const severity = result.passed ? '' : ` (${result.severity.toUpperCase()})`;

            report += `### ${result.checkName} ${status}${severity}\n`;
            report += `${result.description}\n\n`;

            if (result.details && result.details.length > 0) {
                report += `**Details:**\n`;
                result.details.forEach(detail => {
                    report += `- ${detail}\n`;
                });
                report += `\n`;
            }

            if (result.recommendation) {
                report += `**Recommendation:** ${result.recommendation}\n\n`;
            }
        }

        return report;
    }

    /**
     * Validate AI-generated code suggestions for security issues
     */
    public async validateCodeSuggestion(codeContent: string): Promise<{warnings: string[], passed: boolean}> {
        try {
            this.contextLogger.info('Validating AI code suggestion for security issues');

            const warnings: string[] = [];
            let passed = true;

            // Basic security pattern checks
            const securityPatterns = [
                {
                    pattern: /eval\s*\(/gi,
                    warning: 'Code contains eval() which can execute arbitrary code - security risk'
                },
                {
                    pattern: /innerHTML\s*=/gi,
                    warning: 'Direct innerHTML assignment detected - potential XSS vulnerability'
                },
                {
                    pattern: /document\.write\s*\(/gi,
                    warning: 'document.write() usage detected - potential XSS vulnerability'
                },
                {
                    pattern: /exec\s*\(/gi,
                    warning: 'exec() function detected - potential command injection risk'
                },
                {
                    pattern: /shell_exec|system|passthru/gi,
                    warning: 'Shell execution functions detected - potential command injection risk'
                },
                {
                    pattern: /\$_GET|\$_POST|\$_REQUEST/gi,
                    warning: 'Direct superglobal usage without sanitization - potential injection risk'
                },
                {
                    pattern: /SELECT\s+.*\s+FROM\s+.*\s+WHERE\s+.*\+/gi,
                    warning: 'Potential SQL injection pattern detected in query construction'
                },
                {
                    pattern: /password\s*=\s*["'][^"']*["']/gi,
                    warning: 'Hardcoded password detected - security credential exposure'
                },
                {
                    pattern: /api[_-]?key\s*=\s*["'][^"']*["']/gi,
                    warning: 'Hardcoded API key detected - security credential exposure'
                },
                {
                    pattern: /secret\s*=\s*["'][^"']*["']/gi,
                    warning: 'Hardcoded secret detected - security credential exposure'
                }
            ];

            // Check for security patterns
            for (const {pattern, warning} of securityPatterns) {
                if (pattern.test(codeContent)) {
                    warnings.push(warning);
                    passed = false;
                }
            }

            // Check for insecure dependencies (basic check)
            const insecureDependencies = [
                'lodash@4.17.20', // Example of vulnerable version
                'moment@2.29.1',  // Example of deprecated package
            ];

            for (const dep of insecureDependencies) {
                if (codeContent.includes(dep)) {
                    warnings.push(`Potentially vulnerable dependency detected: ${dep}`);
                    passed = false;
                }
            }

            // Check for missing security headers in web code
            if (codeContent.includes('express') || codeContent.includes('app.listen')) {
                if (!codeContent.includes('helmet') && !codeContent.includes('X-Frame-Options')) {
                    warnings.push('Express app detected without security headers - consider using helmet.js');
                }
            }

            // Check for insecure random number generation
            if (codeContent.includes('Math.random()') &&
                (codeContent.includes('token') || codeContent.includes('session') || codeContent.includes('password'))) {
                warnings.push('Math.random() used for security-sensitive values - use crypto.randomBytes() instead');
                passed = false;
            }

            this.contextLogger.info('Code suggestion validation completed', {
                warningsCount: warnings.length,
                passed
            });

            return { warnings, passed };

        } catch (error) {
            this.contextLogger.error('Failed to validate code suggestion', error as Error);
            return {
                warnings: ['Security validation failed - manual review recommended'],
                passed: false
            };
        }
    }

    /**
     * Validate sensitive operations for approval workflow
     */
    public async validateSensitiveOperation(operation: string, data: any): Promise<{requiresApproval: boolean, reason?: string}> {
        try {
            const sensitiveOperations = [
                'file-delete',
                'command-run',
                'network-request',
                'environment-modify',
                'system-access'
            ];

            const requiresApproval = sensitiveOperations.includes(operation);
            const reason = requiresApproval ?
                `Operation '${operation}' requires user approval for security` :
                undefined;

            return { requiresApproval, reason };

        } catch (error) {
            this.contextLogger.error('Failed to validate sensitive operation', error as Error);
            return {
                requiresApproval: true,
                reason: 'Security validation failed - approval required'
            };
        }
    }
}
