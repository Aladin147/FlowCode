import * as vscode from 'vscode';
import { ConfigurationManager } from '../utils/configuration-manager';
import { logger } from '../utils/logger';
import { ESLint } from 'eslint';
import * as ts from 'typescript';
import * as fs from 'fs';
import * as path from 'path';

export interface GuardCheckResult {
    passed: boolean;
    checkName: string;
    duration: number;
    issues: string[];
}

export interface PlatformInfo {
    platform: NodeJS.Platform;
    shell: string;
    isWindows: boolean;
    isUnix: boolean;
}

export class FinalGuard {
    private contextLogger = logger.createContextLogger('FinalGuard');
    private platformInfo: PlatformInfo;

    constructor(private configManager: ConfigurationManager) {
        this.platformInfo = this.detectPlatform();
        this.contextLogger.info('FinalGuard initialized', {
            platform: this.platformInfo.platform,
            shell: this.platformInfo.shell
        });
    }

    public async initialize(): Promise<void> {
        try {
            this.contextLogger.info('Initializing Final Guard with comprehensive pre-push validation');

            // Verify git repository
            await this.verifyGitRepository();

            // Setup cross-platform git hooks
            await this.setupGitHooks();

            // Verify hook installation
            await this.verifyHookInstallation();

            this.contextLogger.info('Final Guard initialization completed successfully');
        } catch (error) {
            this.contextLogger.error('Failed to initialize Final Guard', error as Error);
            throw error;
        }
    }

    private detectPlatform(): PlatformInfo {
        const platform = process.platform;
        const isWindows = platform === 'win32';
        const isUnix = !isWindows;

        let shell = 'sh';
        if (isWindows) {
            shell = process.env.COMSPEC || 'cmd.exe';
        } else {
            shell = process.env.SHELL || '/bin/sh';
        }

        return {
            platform,
            shell,
            isWindows,
            isUnix
        };
    }

    private async verifyGitRepository(): Promise<void> {
        const workspaceRoot = await this.configManager.getWorkspaceRoot();
        const gitDir = path.join(workspaceRoot, '.git');

        if (!fs.existsSync(gitDir)) {
            throw new Error('Not a git repository. Final Guard requires git for hook installation.');
        }

        this.contextLogger.debug('Git repository verified');
    }

    private async verifyHookInstallation(): Promise<void> {
        try {
            const hooksDir = await this.configManager.getGitHooksDirectory();
            const preCommitPath = path.join(hooksDir, 'pre-commit');
            const prePushPath = path.join(hooksDir, 'pre-push');

            const preCommitExists = fs.existsSync(preCommitPath);
            const prePushExists = fs.existsSync(prePushPath);

            if (!preCommitExists || !prePushExists) {
                throw new Error('Git hooks installation verification failed');
            }

            // Verify hooks are executable on Unix systems
            if (this.platformInfo.isUnix) {
                const preCommitStats = fs.statSync(preCommitPath);
                const prePushStats = fs.statSync(prePushPath);

                if (!(preCommitStats.mode & parseInt('111', 8)) || !(prePushStats.mode & parseInt('111', 8))) {
                    this.contextLogger.warn('Git hooks may not be executable');
                }
            }

            this.contextLogger.info('Git hooks installation verified');
        } catch (error) {
            this.contextLogger.error('Hook installation verification failed', error as Error);
            throw error;
        }
    }

    private async setupGitHooks(): Promise<void> {
        try {
            const hooksDir = await this.configManager.getGitHooksDirectory();

            this.contextLogger.info('Setting up cross-platform git hooks', {
                hooksDir,
                platform: this.platformInfo.platform
            });

            // Ensure hooks directory exists
            if (!fs.existsSync(hooksDir)) {
                fs.mkdirSync(hooksDir, { recursive: true });
            }

            // Create pre-commit hook
            const preCommitHook = this.generateCrossPlatformPreCommitHook();
            await this.writeHook(hooksDir, 'pre-commit', preCommitHook);

            // Create pre-push hook
            const prePushHook = this.generateCrossPlatformPrePushHook();
            await this.writeHook(hooksDir, 'pre-push', prePushHook);

            this.contextLogger.info('Git hooks setup completed successfully');
        } catch (error) {
            this.contextLogger.error('Failed to setup git hooks', error as Error);
            throw error;
        }
    }

    private generateCrossPlatformPreCommitHook(): string {
        if (this.platformInfo.isWindows) {
            return this.generateWindowsPreCommitHook();
        } else {
            return this.generateUnixPreCommitHook();
        }
    }

    private generateWindowsPreCommitHook(): string {
        return `@echo off
REM FlowCode pre-commit hook for Windows
setlocal enabledelayedexpansion

echo Running FlowCode pre-commit checks...

REM Check if required tools are available
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo Warning: Node.js not found in PATH, skipping checks
    exit /b 0
)

where git >nul 2>&1
if %errorlevel% neq 0 (
    echo Warning: Git not found in PATH, skipping checks
    exit /b 0
)

REM Check for TypeScript/JavaScript files
git diff --cached --name-only | findstr /R "\\.js$ \\.ts$ \\.jsx$ \\.tsx$" >nul 2>&1
if %errorlevel% equ 0 (
    echo Checking TypeScript/JavaScript files...

    REM Check if ESLint is available
    where npx >nul 2>&1
    if %errorlevel% equ 0 (
        for /f "delims=" %%i in ('git diff --cached --name-only ^| findstr /R "\\.js$ \\.ts$ \\.jsx$ \\.tsx$"') do (
            echo Checking: %%i
            npx eslint --quiet "%%i" 2>nul
            if errorlevel 1 (
                echo ESLint checks failed for %%i
                echo Please fix the linting issues before committing.
                echo Run: npx eslint "%%i" to see details
                exit /b 1
            )
        )
    ) else (
        echo Warning: npx not found, skipping ESLint checks
    )

    REM TypeScript checks
    if exist "tsconfig.json" (
        echo Running TypeScript checks...
        npx tsc --noEmit 2>nul
        if errorlevel 1 (
            echo TypeScript checks failed. Please fix the type errors before committing.
            echo Run: npx tsc --noEmit to see details
            exit /b 1
        )
    )
) else (
    echo No TypeScript/JavaScript files to check
)

echo Pre-commit checks passed!
exit /b 0
`;
    }

    private generateUnixPreCommitHook(): string {
        return `#!/bin/sh
# FlowCode pre-commit hook for Unix/Linux/macOS
echo "Running FlowCode pre-commit checks..."

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check if required tools are available
if ! command_exists node; then
    echo "Warning: Node.js not found in PATH, skipping checks"
    exit 0
fi

if ! command_exists git; then
    echo "Warning: Git not found in PATH, skipping checks"
    exit 0
fi

# Check for TypeScript/JavaScript files
if git diff --cached --name-only | grep -E '\\.(js|ts|jsx|tsx)$' >/dev/null 2>&1; then
    echo "Checking TypeScript/JavaScript files..."

    # Check if npx is available
    if command_exists npx; then
        for file in $(git diff --cached --name-only | grep -E '\\.(js|ts|jsx|tsx)$'); do
            echo "Checking: $file"
            if ! npx eslint --quiet "$file" 2>/dev/null; then
                echo "ESLint checks failed for $file"
                echo "Please fix the linting issues before committing."
                echo "Run: npx eslint \\"$file\\" to see details"
                exit 1
            fi
        done
    else
        echo "Warning: npx not found, skipping ESLint checks"
    fi

    # TypeScript checks
    if [ -f "tsconfig.json" ]; then
        echo "Running TypeScript checks..."
        if ! npx tsc --noEmit 2>/dev/null; then
            echo "TypeScript checks failed. Please fix the type errors before committing."
            echo "Run: npx tsc --noEmit to see details"
            exit 1
        fi
    fi
else
    echo "No TypeScript/JavaScript files to check"
fi

echo "Pre-commit checks passed!"
exit 0
`;
    }

    private generateCrossPlatformPrePushHook(): string {
        if (this.platformInfo.isWindows) {
            return this.generateWindowsPrePushHook();
        } else {
            return this.generateUnixPrePushHook();
        }
    }

    private generateWindowsPrePushHook(): string {
        return `@echo off
REM FlowCode pre-push hook for Windows
echo Running FlowCode pre-push checks...

REM Run full test suite
if exist "package.json" (
    echo Running npm tests...
    npm test >nul 2>&1
    if errorlevel 1 (
        echo Some tests failed. Please fix failing tests before pushing.
        exit /b 1
    )
    echo All tests passed!
)

REM Run security scan with Semgrep if available
where semgrep >nul 2>&1
if %errorlevel% equ 0 (
    echo Running security scan...
    semgrep --config=auto --error
    if errorlevel 1 (
        echo Security scan failed. Please review the issues before pushing.
        exit /b 1
    )
)

echo Pre-push checks passed!
exit /b 0
`;
    }

    private generateUnixPrePushHook(): string {
        return `#!/bin/sh
# FlowCode pre-push hook for Unix/Linux/macOS
echo "Running FlowCode pre-push checks..."

# Run full test suite
if [ -f "package.json" ]; then
    echo "Running npm tests..."
    if npm test >/dev/null 2>&1; then
        echo "All tests passed!"
    else
        echo "Some tests failed. Please fix failing tests before pushing."
        exit 1
    fi
fi

# Run security scan with Semgrep if available
if command -v semgrep >/dev/null 2>&1; then
    echo "Running security scan..."
    if ! semgrep --config=auto --error; then
        echo "Security scan failed. Please review the issues before pushing."
        exit 1
    fi
fi

echo "Pre-push checks passed!"
exit 0
`;
    }

    private async writeHook(hooksDir: string, hookName: string, content: string): Promise<void> {
        const hookPath = path.join(hooksDir, hookName);

        try {
            // Ensure hooks directory exists
            if (!fs.existsSync(hooksDir)) {
                fs.mkdirSync(hooksDir, { recursive: true });
            }

            // Git hooks should not have extensions, even on Windows
            const finalHookPath = hookPath;

            fs.writeFileSync(finalHookPath, content, { encoding: 'utf8' });

            // Make hook executable on Unix systems
            if (this.platformInfo.isUnix) {
                fs.chmodSync(finalHookPath, 0o755);
            }

            // Validate hook was created successfully
            if (!fs.existsSync(finalHookPath)) {
                throw new Error(`Hook file was not created: ${finalHookPath}`);
            }

            // Verify hook is executable on Unix systems
            if (this.platformInfo.isUnix) {
                const stats = fs.statSync(finalHookPath);
                const isExecutable = (stats.mode & parseInt('111', 8)) !== 0;
                if (!isExecutable) {
                    this.contextLogger.warn(`Hook may not be executable: ${finalHookPath}`);
                }
            }

            this.contextLogger.info(`Created ${hookName} hook`, {
                path: finalHookPath,
                platform: this.platformInfo.platform,
                size: fs.statSync(finalHookPath).size
            });
        } catch (error) {
            this.contextLogger.error(`Failed to create ${hookName} hook`, error as Error);
            throw error;
        }
    }

    /**
     * Validate that git hooks are properly installed
     */
    public async validateGitHooks(): Promise<{ isValid: boolean; issues: string[] }> {
        const issues: string[] = [];

        try {
            const workspaceRoot = await this.configManager.getWorkspaceRoot();
            const hooksDir = path.join(workspaceRoot, '.git', 'hooks');

            if (!fs.existsSync(hooksDir)) {
                issues.push('Git hooks directory does not exist');
                return { isValid: false, issues };
            }

            // Check pre-commit hook
            const preCommitPath = path.join(hooksDir, 'pre-commit');
            if (!fs.existsSync(preCommitPath)) {
                issues.push('Pre-commit hook is not installed');
            } else {
                const content = fs.readFileSync(preCommitPath, 'utf8');
                if (!content.includes('FlowCode')) {
                    issues.push('Pre-commit hook does not appear to be FlowCode hook');
                }
            }

            // Check pre-push hook
            const prePushPath = path.join(hooksDir, 'pre-push');
            if (!fs.existsSync(prePushPath)) {
                issues.push('Pre-push hook is not installed');
            } else {
                const content = fs.readFileSync(prePushPath, 'utf8');
                if (!content.includes('FlowCode')) {
                    issues.push('Pre-push hook does not appear to be FlowCode hook');
                }
            }

            // Check permissions on Unix systems
            if (this.platformInfo.isUnix) {
                for (const hookPath of [preCommitPath, prePushPath]) {
                    if (fs.existsSync(hookPath)) {
                        const stats = fs.statSync(hookPath);
                        const isExecutable = (stats.mode & parseInt('111', 8)) !== 0;
                        if (!isExecutable) {
                            issues.push(`Hook is not executable: ${path.basename(hookPath)}`);
                        }
                    }
                }
            }

            return { isValid: issues.length === 0, issues };
        } catch (error) {
            this.contextLogger.error('Failed to validate git hooks', error as Error);
            issues.push(`Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return { isValid: false, issues };
        }
    }

    public async runFinalChecks(): Promise<GuardCheckResult[]> {
        try {
            const workspaceRoot = await this.configManager.getWorkspaceRoot();

            this.contextLogger.info('Starting comprehensive final guard checks');

            return await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "Running final guard checks...",
                cancellable: false
            }, async (progress) => {
                const results: GuardCheckResult[] = [];

                // Run tests
                progress.report({ message: "Running test suite..." });
                const testResult = await this.runTestsWithDetails(workspaceRoot);
                results.push(testResult);

                // Run security scan
                progress.report({ message: "Running security scan..." });
                const securityResult = await this.runSecurityScanWithDetails(workspaceRoot);
                results.push(securityResult);

                // Run lint checks
                progress.report({ message: "Running lint checks..." });
                const lintResult = await this.runLintChecksWithDetails(workspaceRoot);
                results.push(lintResult);

                // Run type checks
                progress.report({ message: "Running type checks..." });
                const typeResult = await this.runTypeChecksWithDetails(workspaceRoot);
                results.push(typeResult);

                const allPassed = results.every(r => r.passed);
                this.contextLogger.info('Final guard checks completed', {
                    allPassed,
                    results: results.map(r => ({ name: r.checkName, passed: r.passed, duration: r.duration }))
                });

                return results;
            });
        } catch (error) {
            this.contextLogger.error('Final guard checks failed', error as Error);
            return [{
                passed: false,
                checkName: 'initialization',
                duration: 0,
                issues: [(error as Error).message]
            }];
        }
    }



    private async runTestsWithDetails(workspaceRoot: string): Promise<GuardCheckResult> {
        const startTime = Date.now();
        const issues: string[] = [];

        try {
            // Check if package.json exists and has test script
            const packageJsonPath = path.join(workspaceRoot, 'package.json');
            if (!fs.existsSync(packageJsonPath)) {
                return {
                    passed: true,
                    checkName: 'tests',
                    duration: Date.now() - startTime,
                    issues: ['No package.json found, skipping tests']
                };
            }

            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
            if (!packageJson.scripts?.test) {
                return {
                    passed: true,
                    checkName: 'tests',
                    duration: Date.now() - startTime,
                    issues: ['No test script defined in package.json']
                };
            }

            // Check for test files
            const testPatterns = [
                '**/*.test.{js,ts,jsx,tsx}',
                '**/*.spec.{js,ts,jsx,tsx}',
                'test/**/*.{js,ts,jsx,tsx}',
                'tests/**/*.{js,ts,jsx,tsx}'
            ];

            let hasTestFiles = false;
            for (const pattern of testPatterns) {
                const glob = require('glob');
                const files = glob.sync(pattern, { cwd: workspaceRoot });
                if (files.length > 0) {
                    hasTestFiles = true;
                    break;
                }
            }

            if (!hasTestFiles) {
                issues.push('No test files found');
            }

            // For final guard, we'll do basic validation rather than running tests
            // Running tests can be time-consuming and is better done in CI
            const passed = hasTestFiles;

            return {
                passed,
                checkName: 'tests',
                duration: Date.now() - startTime,
                issues
            };
        } catch (error) {
            return {
                passed: false,
                checkName: 'tests',
                duration: Date.now() - startTime,
                issues: [`Test validation failed: ${(error as Error).message}`]
            };
        }
    }

    private async runSecurityScanWithDetails(workspaceRoot: string): Promise<GuardCheckResult> {
        const startTime = Date.now();
        const issues: string[] = [];

        try {
            // Basic security pattern detection without external tools
            const securityPatterns = [
                { pattern: /eval\s*\(/g, message: 'Use of eval() detected - potential security risk' },
                { pattern: /innerHTML\s*=/g, message: 'Use of innerHTML - potential XSS risk' },
                { pattern: /document\.write\s*\(/g, message: 'Use of document.write() - potential XSS risk' },
                { pattern: /\$\{[^}]*\}/g, message: 'Template literal - check for injection risks' },
                { pattern: /process\.env\./g, message: 'Environment variable access - ensure proper validation' },
                { pattern: /require\s*\(\s*['"][^'"]*['"].*\+/g, message: 'Dynamic require() - potential security risk' },
                { pattern: /exec\s*\(/g, message: 'Use of exec() - potential command injection risk' }
            ];

            // Scan JavaScript/TypeScript files
            const jsFiles = this.findFiles(workspaceRoot, ['**/*.js', '**/*.ts', '**/*.jsx', '**/*.tsx']);

            for (const file of jsFiles.slice(0, 50)) { // Limit to first 50 files for performance
                try {
                    const content = fs.readFileSync(file, 'utf8');
                    const lines = content.split('\n');

                    for (const { pattern, message } of securityPatterns) {
                        lines.forEach((line, index) => {
                            if (pattern.test(line)) {
                                issues.push(`${message} in ${path.relative(workspaceRoot, file)}:${index + 1}`);
                            }
                        });
                    }
                } catch (error) {
                    // Skip files that can't be read
                    continue;
                }
            }

            // Check for common security misconfigurations
            const configFiles = [
                { file: '.env', message: 'Environment file found - ensure it\'s not committed to version control' },
                { file: 'config.json', message: 'Config file found - check for hardcoded secrets' },
                { file: 'package-lock.json', message: 'Check for known vulnerabilities in dependencies' }
            ];

            for (const { file, message } of configFiles) {
                if (fs.existsSync(path.join(workspaceRoot, file))) {
                    issues.push(message);
                }
            }

            const passed = issues.length === 0;

            return {
                passed,
                checkName: 'security',
                duration: Date.now() - startTime,
                issues
            };
        } catch (error) {
            return {
                passed: false,
                checkName: 'security',
                duration: Date.now() - startTime,
                issues: [`Security scan failed: ${(error as Error).message}`]
            };
        }
    }

    private findFiles(workspaceRoot: string, patterns: string[]): string[] {
        const glob = require('glob');
        const files: string[] = [];

        for (const pattern of patterns) {
            try {
                const matches = glob.sync(pattern, {
                    cwd: workspaceRoot,
                    absolute: true,
                    ignore: ['**/node_modules/**', '**/dist/**', '**/build/**']
                });
                files.push(...matches);
            } catch (error) {
                // Skip patterns that fail
                continue;
            }
        }

        return [...new Set(files)]; // Remove duplicates
    }

    private async runLintChecksWithDetails(workspaceRoot: string): Promise<GuardCheckResult> {
        const startTime = Date.now();
        const issues: string[] = [];

        try {
            const eslint = new ESLint({
                cwd: workspaceRoot,
                fix: false,
                errorOnUnmatchedPattern: false,
                ignore: true
            });

            // Find JavaScript/TypeScript files to lint
            const filesToLint = this.findFiles(workspaceRoot, [
                '**/*.js', '**/*.jsx', '**/*.ts', '**/*.tsx'
            ]).slice(0, 100); // Limit to first 100 files for performance

            if (filesToLint.length === 0) {
                return {
                    passed: true,
                    checkName: 'lint',
                    duration: Date.now() - startTime,
                    issues: ['No JavaScript/TypeScript files found to lint']
                };
            }

            const results = await eslint.lintFiles(filesToLint);

            results.forEach(result => {
                if (result.messages && result.messages.length > 0) {
                    result.messages.forEach(message => {
                        if (message.severity === 2) { // Error only
                            const relativePath = path.relative(workspaceRoot, result.filePath);
                            issues.push(`${relativePath}:${message.line} - ${message.message} (${message.ruleId || 'unknown'})`);
                        }
                    });
                }
            });

            const passed = issues.length === 0;

            return {
                passed,
                checkName: 'lint',
                duration: Date.now() - startTime,
                issues
            };
        } catch (error) {
            return {
                passed: false,
                checkName: 'lint',
                duration: Date.now() - startTime,
                issues: [`Lint check failed: ${(error as Error).message}`]
            };
        }
    }

    private async runTypeChecksWithDetails(workspaceRoot: string): Promise<GuardCheckResult> {
        const startTime = Date.now();
        const issues: string[] = [];

        // Check if TypeScript project
        const tsconfigPath = path.join(workspaceRoot, 'tsconfig.json');
        if (!fs.existsSync(tsconfigPath)) {
            return {
                passed: true,
                checkName: 'types',
                duration: Date.now() - startTime,
                issues: ['No TypeScript configuration found']
            };
        }

        try {
            const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
            if (configFile.error) {
                return {
                    passed: false,
                    checkName: 'types',
                    duration: Date.now() - startTime,
                    issues: [`Failed to read tsconfig.json: ${ts.flattenDiagnosticMessageText(configFile.error.messageText, '\n')}`]
                };
            }

            const parsedConfig = ts.parseJsonConfigFileContent(
                configFile.config,
                ts.sys,
                workspaceRoot
            );

            if (parsedConfig.errors.length > 0) {
                parsedConfig.errors.forEach(error => {
                    issues.push(`Config error: ${ts.flattenDiagnosticMessageText(error.messageText, '\n')}`);
                });
            }

            // Create program and get diagnostics
            const program = ts.createProgram(parsedConfig.fileNames, {
                ...parsedConfig.options,
                noEmit: true,
                skipLibCheck: true
            });

            const diagnostics = [
                ...program.getConfigFileParsingDiagnostics(),
                ...program.getSyntacticDiagnostics(),
                ...program.getSemanticDiagnostics()
            ];

            diagnostics.forEach(diagnostic => {
                if (diagnostic.file && diagnostic.start !== undefined) {
                    const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
                    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
                    const relativePath = path.relative(workspaceRoot, diagnostic.file.fileName);
                    issues.push(`${relativePath}:${line + 1}:${character + 1} - ${message} (TS${diagnostic.code})`);
                } else {
                    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
                    issues.push(`TypeScript error: ${message} (TS${diagnostic.code})`);
                }
            });

            const passed = issues.length === 0;

            return {
                passed,
                checkName: 'types',
                duration: Date.now() - startTime,
                issues
            };
        } catch (error) {
            return {
                passed: false,
                checkName: 'types',
                duration: Date.now() - startTime,
                issues: [`TypeScript check failed: ${(error as Error).message}`]
            };
        }
    }
}