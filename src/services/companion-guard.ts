import * as vscode from 'vscode';
import { ConfigurationManager } from '../utils/configuration-manager';
import { logger } from '../utils/logger';
import { PerformanceCache, CacheManager } from '../utils/performance-cache';
import { AdvancedCache, CACHE_STRATEGIES } from '../utils/advanced-cache';
import { PerformanceMonitor, timed } from '../utils/performance-monitor';
import { PerformanceOptimizer, OPTIMIZATION_STRATEGIES } from '../utils/performance-optimizer';
import { PerformanceBenchmark } from '../utils/performance-benchmark';
import { LintingWorkerPool } from '../workers/linting-worker';
import { ESLint } from 'eslint';
import ts from 'typescript';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { spawn } from 'child_process';

export interface GuardResult {
    passed: boolean;
    issues: GuardIssue[];
    duration: number;
}

export interface GuardIssue {
    severity: 'error' | 'warning' | 'info';
    message: string;
    file?: string;
    line?: number;
    column?: number;
    rule?: string;
}

interface CacheEntry {
    result: GuardResult;
    timestamp: number;
    fileHash: string;
}

export class CompanionGuard {
    private disposables: vscode.Disposable[] = [];
    private statusBarItem: vscode.StatusBarItem;
    private isRunning = false;
    private lastResult?: GuardResult;
    private contextLogger = logger.createContextLogger('CompanionGuard');
    private eslintInstance?: ESLint;
    private resultCache: PerformanceCache<GuardResult>;
    private advancedCache: AdvancedCache<GuardResult>;
    private debounceTimer?: NodeJS.Timeout;
    private readonly CACHE_TTL = 30000; // 30 seconds
    private readonly DEBOUNCE_DELAY = 500; // 500ms
    private readonly MAX_CHECK_DURATION = 500; // 500ms maximum check duration
    private performanceMonitor = PerformanceMonitor.getInstance();
    private performanceOptimizer = PerformanceOptimizer.getInstance();
    private performanceBenchmark = PerformanceBenchmark.getInstance();
    private workerPool: LintingWorkerPool;

    constructor(private configManager: ConfigurationManager) {
        try {
            this.statusBarItem = vscode.window.createStatusBarItem(
                vscode.StatusBarAlignment.Right,
                100
            );
            this.statusBarItem.text = "$(sync~spin) FlowCode: Initializing...";
            this.statusBarItem.show();

            // Initialize performance cache
            this.resultCache = CacheManager.getCache<GuardResult>('companion-guard', {
                maxSize: 10 * 1024 * 1024, // 10MB
                maxEntries: 500,
                defaultTTL: this.CACHE_TTL
            });

            // Initialize advanced cache with ARC strategy for better performance
            this.advancedCache = CacheManager.getAdvancedCache<GuardResult>(
                'companion-guard-advanced',
                20 * 1024 * 1024, // 20MB
                1000, // 1000 entries
                this.CACHE_TTL,
                CACHE_STRATEGIES.ARC, // Adaptive Replacement Cache for optimal performance
                undefined // No persistence for now
            );

            // Initialize worker pool
            this.workerPool = new LintingWorkerPool(2); // 2 worker threads

            this.contextLogger.info('CompanionGuard initialized successfully');
        } catch (error) {
            this.contextLogger.error('Failed to initialize CompanionGuard', error as Error);
            throw error;
        }
    }

    public async initialize(): Promise<void> {
        try {
            this.contextLogger.info('Initializing file watchers and running initial checks');

            // Set up file watchers for TypeScript/JavaScript and Python
            const watchers = [
                vscode.workspace.createFileSystemWatcher('**/*.ts'),
                vscode.workspace.createFileSystemWatcher('**/*.js'),
                vscode.workspace.createFileSystemWatcher('**/*.py')
            ];

            watchers.forEach(watcher => {
                watcher.onDidChange(() => this.debouncedRunChecks());
                watcher.onDidCreate(() => this.debouncedRunChecks());
                watcher.onDidDelete(() => this.debouncedRunChecks());
                this.disposables.push(watcher);
            });

            // Run initial check
            await this.runChecks();
            this.contextLogger.info('CompanionGuard initialization completed successfully');
        } catch (error) {
            this.contextLogger.error('Failed to initialize CompanionGuard', error as Error);
            this.statusBarItem.text = "$(error) FlowCode: Init Failed";
            this.statusBarItem.tooltip = `Initialization failed: ${(error as Error).message}`;
            throw error;
        }
    }

    private debouncedRunChecks(): void {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }

        this.debounceTimer = setTimeout(() => {
            this.runChecks();
        }, this.DEBOUNCE_DELAY);
    }

    private getFileHash(filePath: string): string {
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const stats = fs.statSync(filePath);
            return `${content.length}-${stats.mtime.getTime()}`;
        } catch {
            return `${Date.now()}`;
        }
    }

    private getCachedResult(filePath: string): GuardResult | null {
        const cacheKey = PerformanceCache.generateKey(filePath + this.getFileHash(filePath));

        // Try performance cache first (faster)
        const cached = this.resultCache.get(cacheKey);
        if (cached) {
            this.contextLogger.debug(`Performance cache hit for ${filePath}`);
            return cached;
        }

        // Try advanced cache as fallback
        const advancedCached = this.advancedCache.get(cacheKey);
        if (advancedCached) {
            this.contextLogger.debug(`Advanced cache hit for ${filePath}`);
            // Promote to performance cache for faster access next time
            this.resultCache.set(cacheKey, advancedCached);
            return advancedCached;
        }

        return null;
    }

    private setCachedResult(filePath: string, result: GuardResult): void {
        const cacheKey = PerformanceCache.generateKey(filePath + this.getFileHash(filePath));

        // Store in both caches for redundancy and performance
        this.resultCache.set(cacheKey, result);
        this.advancedCache.set(cacheKey, result, undefined, {
            filePath,
            language: this.getLanguage(vscode.window.activeTextEditor?.document),
            timestamp: Date.now()
        });
    }

    private getLanguage(document?: vscode.TextDocument): string {
        if (!document) {return 'unknown';}

        const languageId = document.languageId;
        const fileName = document.fileName;

        // Map VS Code language IDs to our internal language categories
        switch (languageId) {
            case 'typescript':
            case 'typescriptreact':
                return 'typescript';
            case 'javascript':
            case 'javascriptreact':
                return 'javascript';
            case 'python':
                return 'python';
            default:
                // Try to determine from file extension
                if (fileName.endsWith('.ts') || fileName.endsWith('.tsx')) {
                    return 'typescript';
                } else if (fileName.endsWith('.js') || fileName.endsWith('.jsx')) {
                    return 'javascript';
                } else if (fileName.endsWith('.py')) {
                    return 'python';
                }
                return languageId || 'unknown';
        }
    }

    @timed('CompanionGuard.runChecks')
    public async runChecks(): Promise<GuardResult> {
        if (this.isRunning) {
            this.contextLogger.debug('Checks already running, returning last result');
            return this.lastResult || { passed: false, issues: [], duration: 0 };
        }

        // Use performance optimizer with caching and debouncing
        const optimizedCheck = async (): Promise<GuardResult> => {
            this.isRunning = true;
            const startTime = Date.now();

            try {
                this.contextLogger.info('Starting companion guard checks');
                this.statusBarItem.text = "$(sync~spin) FlowCode: Checking...";

                const issues: GuardIssue[] = [];

            // Run lint checks based on file type
            const activeEditor = vscode.window.activeTextEditor;
            if (activeEditor) {
                const filePath = activeEditor.document.uri.fsPath;
                const language = activeEditor.document.languageId;

                this.contextLogger.debug(`Running checks for ${language} file: ${filePath}`);

                // Check cache first
                const cachedResult = this.getCachedResult(filePath);
                if (cachedResult) {
                    this.lastResult = cachedResult;
                    this.isRunning = false; // Reset flag before returning from cache
                    this.updateStatusBar();
                    this.showIssues(cachedResult.issues);
                    return cachedResult;
                }

                if (language === 'typescript' || language === 'javascript') {
                    try {
                        const [eslintResult, tsResult] = await Promise.all([
                            this.runESLintWorker(filePath),
                            this.runTypeScriptWorker(filePath)
                        ]);
                        issues.push(...eslintResult);
                        issues.push(...tsResult);
                    } catch (error) {
                        this.contextLogger.warn('TypeScript/JavaScript checks failed', error as Error);
                        issues.push({
                            severity: 'warning',
                            message: `Linting failed: ${(error as Error).message}`,
                            file: filePath
                        });
                    }
                } else if (language === 'python') {
                    try {
                        const pythonResult = await this.runPythonWorker(filePath);
                        issues.push(...pythonResult);
                    } catch (error) {
                        this.contextLogger.warn('Python checks failed', error as Error);
                        issues.push({
                            severity: 'warning',
                            message: `Python linting failed: ${(error as Error).message}`,
                            file: filePath
                        });
                    }
                }

                // Run basic tests if available
                try {
                    issues.push(...await this.runTests(filePath));
                } catch (error) {
                    this.contextLogger.warn('Test checks failed', error as Error);
                }
            } else {
                this.contextLogger.debug('No active editor found, skipping checks');
            }

            const duration = Date.now() - startTime;
            const passed = issues.filter(i => i.severity === 'error').length === 0;

            this.lastResult = { passed, issues, duration };

            // Cache the result if we have an active file
            if (activeEditor) {
                this.setCachedResult(activeEditor.document.uri.fsPath, this.lastResult);
            }

            this.contextLogger.info(`Checks completed in ${duration}ms, passed: ${passed}, issues: ${issues.length}`);

            this.updateStatusBar();
            this.showIssues(issues);

                return this.lastResult;
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Unknown error';
                this.contextLogger.error('Companion guard checks failed', error as Error);
                this.statusBarItem.text = "$(error) FlowCode: Error";
                this.statusBarItem.tooltip = message;

                return { passed: false, issues: [], duration: Date.now() - startTime };
            } finally {
                this.isRunning = false;
            }
        };

        // Apply performance optimizations with timeout
        const timeoutPromise = new Promise<GuardResult>((_, reject) => {
            setTimeout(() => {
                reject(new Error(`CompanionGuard check exceeded ${this.MAX_CHECK_DURATION}ms timeout`));
            }, this.MAX_CHECK_DURATION);
        });

        const optimizedPromise = this.performanceOptimizer.optimizeOperation(
            'companion-guard',
            optimizedCheck,
            [
                OPTIMIZATION_STRATEGIES.STANDARD_CACHE,
                OPTIMIZATION_STRATEGIES.FAST_DEBOUNCE
            ]
        ).then(({ result }) => result);

        try {
            const result = await Promise.race([optimizedPromise, timeoutPromise]);
            return result;
        } catch (error) {
            this.contextLogger.warn('CompanionGuard check timed out or failed', error as Error);

            // Return cached result if available, otherwise return minimal result
            if (this.lastResult) {
                return this.lastResult;
            }

            return {
                passed: false,
                issues: [{
                    line: 1,
                    column: 1,
                    severity: 'warning' as const,
                    message: 'Code check timed out - using cached result',
                    rule: 'flowcode-timeout'
                }],
                duration: this.MAX_CHECK_DURATION
            };
        }
    }

    private async initializeESLint(): Promise<void> {
        if (this.eslintInstance) {
            return;
        }

        try {
            const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (!workspaceRoot) {
                throw new Error('No workspace folder found');
            }

            // Check if ESLint is available before trying to use it
            try {
                this.eslintInstance = new ESLint({
                    cwd: workspaceRoot,
                    fix: false,
                    errorOnUnmatchedPattern: false,
                    ignore: true,
                    cache: true,
                    cacheLocation: path.join(workspaceRoot, '.eslintcache')
                });

                this.contextLogger.debug('ESLint instance initialized');
            } catch (eslintError) {
                this.contextLogger.warn('ESLint not available, will skip ESLint checks', eslintError as Error);
                // Don't throw here - we'll handle missing ESLint gracefully
                this.eslintInstance = undefined;
            }
        } catch (error) {
            this.contextLogger.error('Failed to initialize ESLint', error as Error);
            this.eslintInstance = undefined;
        }
    }

    @timed('CompanionGuard.runESLintWorker')
    private async runESLintWorker(filePath: string): Promise<GuardIssue[]> {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) {
            this.contextLogger.warn('No workspace folder found');
            return [];
        }

        // Initialize ESLint first and check if it's available
        await this.initializeESLint();
        if (!this.eslintInstance) {
            this.contextLogger.debug('ESLint not available, skipping ESLint checks');
            return [{
                line: 1,
                column: 1,
                severity: 'info' as const,
                message: 'ESLint not installed - install ESLint for enhanced code quality checks',
                rule: 'flowcode-dependency'
            }];
        }

        const eslintCheck = async (): Promise<GuardIssue[]> => {
            const result = await this.workerPool.runTask({
                type: 'eslint',
                filePath,
                workspaceRoot
            });

            return result.issues.map(issue => ({
                line: issue.line,
                column: issue.column,
                severity: issue.severity,
                message: issue.message,
                rule: issue.rule
            }));
        };

        try {
            const { result } = await this.performanceOptimizer.optimizeOperation(
                'eslint-check',
                eslintCheck,
                [OPTIMIZATION_STRATEGIES.STANDARD_CACHE]
            );
            return result;
        } catch (error) {
            this.contextLogger.error('ESLint worker failed', error as Error);
            return [{
                line: 1,
                column: 1,
                severity: 'warning' as const,
                message: `ESLint failed: ${(error as Error).message}`,
                rule: 'flowcode-internal'
            }];
        }
    }

    @timed('CompanionGuard.runTypeScriptWorker')
    private async runTypeScriptWorker(filePath: string): Promise<GuardIssue[]> {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) {
            this.contextLogger.warn('No workspace folder found');
            return [];
        }

        const tsCheck = async (): Promise<GuardIssue[]> => {
            const result = await this.workerPool.runTask({
                type: 'typescript',
                filePath,
                workspaceRoot
            });

            return result.issues.map(issue => ({
                line: issue.line,
                column: issue.column,
                severity: issue.severity,
                message: issue.message,
                rule: issue.rule
            }));
        };

        try {
            const { result } = await this.performanceOptimizer.optimizeOperation(
                'typescript-check',
                tsCheck,
                [OPTIMIZATION_STRATEGIES.STANDARD_CACHE]
            );
            return result;
        } catch (error) {
            this.contextLogger.error('TypeScript worker failed', error as Error);
            return [{
                line: 1,
                column: 1,
                severity: 'warning' as const,
                message: `TypeScript check failed: ${(error as Error).message}`,
                rule: 'flowcode-internal'
            }];
        }
    }

    @timed('CompanionGuard.runPythonWorker')
    private async runPythonWorker(filePath: string): Promise<GuardIssue[]> {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) {
            this.contextLogger.warn('No workspace folder found');
            return [];
        }

        try {
            const result = await this.workerPool.runTask({
                type: 'ruff',
                filePath,
                workspaceRoot
            });

            return result.issues.map(issue => ({
                line: issue.line,
                column: issue.column,
                severity: issue.severity,
                message: issue.message,
                rule: issue.rule
            }));
        } catch (error) {
            this.contextLogger.error('Python worker failed', error as Error);
            return [{
                line: 1,
                column: 1,
                severity: 'warning' as const,
                message: `Python linting failed: ${(error as Error).message}`,
                rule: 'flowcode-internal'
            }];
        }
    }

    // Legacy direct method for fallback (keeping for now)
    @timed('CompanionGuard.runESLintDirect')
    private async runESLintDirect(filePath: string): Promise<GuardIssue[]> {
        try {
            // Check if file exists first
            if (!fs.existsSync(filePath)) {
                this.contextLogger.warn(`File does not exist: ${filePath}`);
                return [];
            }

            await this.initializeESLint();

            if (!this.eslintInstance) {
                throw new Error('ESLint not initialized');
            }

            // Check if file should be linted
            const isPathIgnored = await this.eslintInstance.isPathIgnored(filePath);
            if (isPathIgnored) {
                this.contextLogger.debug(`File is ignored by ESLint: ${filePath}`);
                return [];
            }

            const results = await this.eslintInstance.lintFiles([filePath]);
            const issues: GuardIssue[] = [];

            results.forEach(result => {
                if (result.messages && result.messages.length > 0) {
                    result.messages.forEach(message => {
                        // Skip parsing errors as they're usually handled by TypeScript
                        if (message.fatal && message.ruleId === null) {
                            return;
                        }

                        issues.push({
                            severity: message.severity === 2 ? 'error' : 'warning',
                            message: message.message,
                            file: result.filePath,
                            line: message.line || 1,
                            column: message.column || 1,
                            rule: message.ruleId || 'eslint'
                        });
                    });
                }
            });

            this.contextLogger.debug(`ESLint found ${issues.length} issues in ${filePath}`);
            return issues;
        } catch (error) {
            this.contextLogger.error('ESLint execution failed', error as Error);
            // Return warning instead of failing completely
            return [{
                line: 1,
                column: 1,
                severity: 'warning' as const,
                message: `Linting failed: ${(error as Error).message}`,
                rule: 'flowcode-internal'
            }];
        }
    }

    @timed('CompanionGuard.runTSCDirect')
    private async runTSCDirect(filePath: string): Promise<GuardIssue[]> {
        try {
            // Check if file exists first
            if (!fs.existsSync(filePath)) {
                this.contextLogger.warn(`File does not exist: ${filePath}`);
                return [];
            }

            const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (!workspaceRoot) {
                this.contextLogger.warn('No workspace folder found');
                return [];
            }

            // Check if it's a TypeScript/JavaScript file
            const ext = path.extname(filePath);
            if (!['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
                this.contextLogger.debug(`Skipping TypeScript check for non-TS/JS file: ${filePath}`);
                return [];
            }

            const configPath = path.join(workspaceRoot, 'tsconfig.json');
            let parsedConfig: ts.ParsedCommandLine;

            if (fs.existsSync(configPath)) {
                const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
                if (configFile.error) {
                    this.contextLogger.warn('Failed to read tsconfig.json', configFile.error as any);
                    // Use default config
                    parsedConfig = {
                        options: ts.getDefaultCompilerOptions(),
                        fileNames: [filePath],
                        errors: []
                    };
                } else {
                    parsedConfig = ts.parseJsonConfigFileContent(
                        configFile.config,
                        ts.sys,
                        workspaceRoot
                    );
                }
            } else {
                // Use default TypeScript configuration
                parsedConfig = {
                    options: {
                        ...ts.getDefaultCompilerOptions(),
                        noEmit: true,
                        skipLibCheck: true,
                        allowJs: true,
                        checkJs: false
                    },
                    fileNames: [filePath],
                    errors: []
                };
            }

            // Create program with optimized options for single file checking
            const program = ts.createProgram([filePath], {
                ...parsedConfig.options,
                noEmit: true,
                skipLibCheck: true,
                incremental: false
            });

            // Get diagnostics only for the target file
            const sourceFile = program.getSourceFile(filePath);
            if (!sourceFile) {
                this.contextLogger.warn(`Could not get source file: ${filePath}`);
                return [];
            }

            const diagnostics = [
                ...program.getSyntacticDiagnostics(sourceFile),
                ...program.getSemanticDiagnostics(sourceFile)
            ];

            const issues: GuardIssue[] = [];
            diagnostics.forEach(diagnostic => {
                if (diagnostic.file && diagnostic.start !== undefined) {
                    const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
                    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');

                    // Filter out some noisy diagnostics for better UX
                    if (diagnostic.code === 2307 && message.includes('Cannot find module')) {
                        // Skip module resolution errors in single file mode
                        return;
                    }

                    issues.push({
                        severity: diagnostic.category === ts.DiagnosticCategory.Error ? 'error' : 'warning',
                        message,
                        file: diagnostic.file.fileName,
                        line: line + 1,
                        column: character + 1,
                        rule: `TS${diagnostic.code}`
                    });
                }
            });

            this.contextLogger.debug(`TypeScript found ${issues.length} issues in ${filePath}`);
            return issues;
        } catch (error) {
            this.contextLogger.error('TypeScript execution failed', error as Error);
            // Return warning instead of failing completely
            return [{
                line: 1,
                column: 1,
                severity: 'warning' as const,
                message: `TypeScript check failed: ${(error as Error).message}`,
                rule: 'flowcode-internal'
            }];
        }
    }







    private async runRuff(filePath: string): Promise<GuardIssue[]> {
        try {
            // Check if file exists first
            if (!fs.existsSync(filePath)) {
                this.contextLogger.warn(`File does not exist: ${filePath}`);
                return [];
            }

            // Check if it's a Python file
            const ext = path.extname(filePath);
            if (!['.py', '.pyi'].includes(ext)) {
                this.contextLogger.debug(`Skipping Python check for non-Python file: ${filePath}`);
                return [];
            }

            const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (!workspaceRoot) {
                this.contextLogger.warn('No workspace folder found');
                return [];
            }

            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    this.contextLogger.warn('Ruff check timed out');
                    resolve([{
                        line: 1,
                        column: 1,
                        severity: 'warning' as const,
                        message: 'Python linting timed out',
                        rule: 'flowcode-timeout'
                    }]);
                }, 10000); // 10 second timeout

                const ruff = spawn('ruff', [
                    'check',
                    filePath,
                    '--format', 'json',
                    '--no-cache', // Disable cache for single file checks
                    '--quiet'     // Reduce noise
                ], {
                    cwd: workspaceRoot,
                    stdio: ['ignore', 'pipe', 'pipe']
                });

                let output = '';
                let errorOutput = '';

                ruff.stdout.on('data', (data) => {
                    output += data.toString();
                });

                ruff.stderr.on('data', (data) => {
                    errorOutput += data.toString();
                });

                ruff.on('close', (code) => {
                    clearTimeout(timeout);

                    if (code === 0) {
                        resolve([]);
                        return;
                    }

                    // Ruff returns 1 when issues are found, which is expected
                    if (code === 1) {
                        try {
                            if (!output.trim()) {
                                resolve([]);
                                return;
                            }

                            const results = JSON.parse(output);
                            const issues: GuardIssue[] = [];

                            if (Array.isArray(results)) {
                                results.forEach((result: any) => {
                                    if (result.location && result.message) {
                                        issues.push({
                                            severity: result.fix ? 'warning' : 'error',
                                            message: result.message,
                                            file: result.filename || filePath,
                                            line: result.location.row || 1,
                                            column: result.location.column || 1,
                                            rule: result.code || 'ruff'
                                        });
                                    }
                                });
                            }

                            resolve(issues);
                        } catch (parseError) {
                            this.contextLogger.warn('Failed to parse Ruff output', parseError as Error);
                            resolve([{
                                line: 1,
                                column: 1,
                                severity: 'warning' as const,
                                message: 'Failed to parse Python linting results',
                                rule: 'flowcode-parse-error'
                            }]);
                        }
                    } else {
                        // Other error codes indicate Ruff issues
                        this.contextLogger.warn(`Ruff failed with code ${code}: ${errorOutput}`);
                        resolve([{
                            line: 1,
                            column: 1,
                            severity: 'warning' as const,
                            message: `Python linting failed: ${errorOutput || 'Unknown error'}`,
                            rule: 'flowcode-ruff-error'
                        }]);
                    }
                });

                ruff.on('error', (error) => {
                    clearTimeout(timeout);
                    this.contextLogger.warn('Ruff subprocess error', error);
                    resolve([{
                        line: 1,
                        column: 1,
                        severity: 'warning' as const,
                        message: `Python linting unavailable: ${error.message}`,
                        rule: 'flowcode-ruff-unavailable'
                    }]);
                });
            });
        } catch (error) {
            this.contextLogger.error('Ruff execution failed', error as Error);
            return [{
                line: 1,
                column: 1,
                severity: 'warning' as const,
                message: `Python linting failed: ${(error as Error).message}`,
                rule: 'flowcode-internal'
            }];
        }
    }

    private async runTests(filePath: string): Promise<GuardIssue[]> {
        try {
            const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (!workspaceRoot) {
                return [];
            }

            // Check if this is a test file
            const isTestFile = this.isTestFile(filePath);
            if (!isTestFile) {
                return []; // Only run tests for test files
            }

            // Basic test validation
            const issues: GuardIssue[] = [];
            const content = fs.readFileSync(filePath, 'utf8');

            // Check for common test patterns
            const testPatterns = [
                { pattern: /describe\s*\(/g, name: 'describe blocks' },
                { pattern: /it\s*\(/g, name: 'test cases' },
                { pattern: /test\s*\(/g, name: 'test functions' },
                { pattern: /expect\s*\(/g, name: 'assertions' }
            ];

            let hasTestStructure = false;
            for (const { pattern, name } of testPatterns) {
                const matches = content.match(pattern);
                if (matches && matches.length > 0) {
                    hasTestStructure = true;
                    this.contextLogger.debug(`Found ${matches.length} ${name} in ${filePath}`);
                }
            }

            // Warn if test file has no test structure
            if (!hasTestStructure) {
                issues.push({
                    line: 1,
                    column: 1,
                    severity: 'warning',
                    message: 'Test file appears to have no test cases or assertions',
                    rule: 'test-structure'
                });
            }

            // Check for common test anti-patterns
            const antiPatterns = [
                {
                    pattern: /\.only\s*\(/g,
                    message: 'Test has .only() which will skip other tests',
                    severity: 'warning' as const
                },
                {
                    pattern: /\.skip\s*\(/g,
                    message: 'Test is skipped with .skip()',
                    severity: 'warning' as const
                },
                {
                    pattern: /console\.log\s*\(/g,
                    message: 'Console.log found in test file - consider removing debug statements',
                    severity: 'warning' as const
                }
            ];

            for (const antiPattern of antiPatterns) {
                const matches = content.match(antiPattern.pattern);
                if (matches) {
                    // Find line numbers for each match
                    const lines = content.split('\n');
                    lines.forEach((line, index) => {
                        if (antiPattern.pattern.test(line)) {
                            issues.push({
                                line: index + 1,
                                column: 1,
                                severity: antiPattern.severity,
                                message: antiPattern.message,
                                rule: 'test-quality'
                            });
                        }
                    });
                }
            }

            this.contextLogger.debug(`Test validation found ${issues.length} issues in ${filePath}`);
            return issues;
        } catch (error) {
            this.contextLogger.error('Test validation failed', error as Error);
            return [{
                line: 1,
                column: 1,
                severity: 'warning' as const,
                message: `Test validation failed: ${(error as Error).message}`,
                rule: 'flowcode-internal'
            }];
        }
    }

    private isTestFile(filePath: string): boolean {
        const testPatterns = [
            /\.test\.(js|ts|jsx|tsx)$/,
            /\.spec\.(js|ts|jsx|tsx)$/,
            /test_.*\.py$/,
            /_test\.py$/,
            /tests?\/.*\.(js|ts|jsx|tsx|py)$/
        ];

        return testPatterns.some(pattern => pattern.test(filePath));
    }

    private updateStatusBar(): void {
        if (!this.lastResult) {
            this.statusBarItem.text = "$(circle-outline) FlowCode: Ready";
            this.statusBarItem.tooltip = "FlowCode is ready";
            return;
        }

        const { passed, issues, duration } = this.lastResult;
        const errorCount = issues.filter(i => i.severity === 'error').length;
        const warningCount = issues.filter(i => i.severity === 'warning').length;

        if (passed) {
            this.statusBarItem.text = `$(check) FlowCode: ${duration}ms`;
            this.statusBarItem.tooltip = "All checks passed";
        } else {
            this.statusBarItem.text = `$(error) FlowCode: ${errorCount} errors, ${warningCount} warnings`;
            this.statusBarItem.tooltip = `${errorCount} errors, ${warningCount} warnings`;
        }
    }

    private showIssues(issues: GuardIssue[]): void {
        if (issues.length === 0) {
            return;
        }

        const diagnosticCollection = vscode.languages.createDiagnosticCollection('flowcode');
        const diagnosticsMap = new Map<string, vscode.Diagnostic[]>();

        issues.forEach(issue => {
            if (!issue.file || !issue.line) {
                return;
            }

            const range = new vscode.Range(
                issue.line - 1,
                (issue.column || 1) - 1,
                issue.line - 1,
                (issue.column || 1) + 50
            );

            const diagnostic = new vscode.Diagnostic(
                range,
                issue.message,
                issue.severity === 'error' ? vscode.DiagnosticSeverity.Error :
                issue.severity === 'warning' ? vscode.DiagnosticSeverity.Warning :
                vscode.DiagnosticSeverity.Information
            );

            diagnostic.source = 'FlowCode';
            if (issue.rule) {
                diagnostic.code = issue.rule;
            }

            if (!diagnosticsMap.has(issue.file)) {
                diagnosticsMap.set(issue.file, []);
            }
            diagnosticsMap.get(issue.file)!.push(diagnostic);
        });

        diagnosticsMap.forEach((diagnostics, file) => {
            diagnosticCollection.set(vscode.Uri.file(file), diagnostics);
        });

        this.disposables.push(diagnosticCollection);
    }

    public async runPerformanceBenchmark(): Promise<void> {
        this.contextLogger.info('Starting CompanionGuard performance benchmark');

        try {
            const activeEditor = vscode.window.activeTextEditor;
            if (!activeEditor) {
                this.contextLogger.warn('No active editor for benchmark');
                return;
            }

            const filePath = activeEditor.document.uri.fsPath;
            const language = this.getLanguage(activeEditor.document);

            // Benchmark the main check operation
            await this.performanceBenchmark.benchmark(
                'companion-guard',
                () => this.runChecks(),
                5,
                { filePath, language }
            );

            // Benchmark individual operations
            if (language === 'typescript' || language === 'javascript') {
                await this.performanceBenchmark.benchmark(
                    'eslint-check',
                    () => this.runESLintWorker(filePath),
                    10,
                    { filePath, language }
                );

                await this.performanceBenchmark.benchmark(
                    'typescript-check',
                    () => this.runTypeScriptWorker(filePath),
                    10,
                    { filePath, language }
                );
            } else if (language === 'python') {
                await this.performanceBenchmark.benchmark(
                    'python-check',
                    () => this.runPythonWorker(filePath),
                    10,
                    { filePath, language }
                );
            }

            // Generate and save report
            const report = this.performanceBenchmark.generateReport();
            await this.performanceBenchmark.saveReport();

            this.contextLogger.info('Performance benchmark completed', {
                averageDuration: report.overallStats.averageDuration,
                successRate: report.overallStats.successRate,
                recommendations: report.recommendations.length
            });

            // Show results to user
            vscode.window.showInformationMessage(
                `Performance benchmark completed. Average duration: ${report.overallStats.averageDuration.toFixed(0)}ms, Success rate: ${report.overallStats.successRate.toFixed(1)}%`
            );

        } catch (error) {
            this.contextLogger.error('Performance benchmark failed', error as Error);
            vscode.window.showErrorMessage(`Performance benchmark failed: ${(error as Error).message}`);
        }
    }

    public async dispose(): Promise<void> {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }
        this.resultCache.dispose();
        this.advancedCache.dispose();
        await this.workerPool.dispose();
        this.disposables.forEach(d => d.dispose());
        this.statusBarItem.dispose();
    }
}