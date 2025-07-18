import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { logger } from './logger';
import { InputValidator } from './input-validator';

export interface PlatformInfo {
    platform: NodeJS.Platform;
    shell: string;
    isWindows: boolean;
    isUnix: boolean;
    isMacOS: boolean;
    isLinux: boolean;
    pathSeparator: string;
    scriptExtension: string;
    executableExtension: string;
}

export interface GitHookConfig {
    name: string;
    enabled: boolean;
    timeout: number; // in seconds
    failOnError: boolean;
    skipOnCI: boolean;
    customScript?: string;
}

export interface HookInstallationResult {
    success: boolean;
    installedHooks: string[];
    errors: string[];
    warnings: string[];
    platform: string;
}

export class CrossPlatformGitHooks {
    private contextLogger = logger.createContextLogger('CrossPlatformGitHooks');
    private platformInfo: PlatformInfo;

    constructor() {
        this.platformInfo = this.detectPlatform();
        this.contextLogger.info('Initialized cross-platform git hooks', {
            platform: this.platformInfo.platform,
            shell: this.platformInfo.shell
        });
    }

    /**
     * Detect current platform and capabilities
     */
    private detectPlatform(): PlatformInfo {
        const platform = process.platform;
        const isWindows = platform === 'win32';
        const isMacOS = platform === 'darwin';
        const isLinux = platform === 'linux';
        const isUnix = !isWindows;

        let shell = 'sh';
        let scriptExtension = '';
        let executableExtension = '';
        let pathSeparator = path.sep;

        if (isWindows) {
            shell = process.env.COMSPEC || 'cmd.exe';
            scriptExtension = '.bat';
            executableExtension = '.exe';
        } else {
            shell = process.env.SHELL || '/bin/sh';
        }

        return {
            platform,
            shell,
            isWindows,
            isUnix,
            isMacOS,
            isLinux,
            pathSeparator,
            scriptExtension,
            executableExtension
        };
    }

    /**
     * Install git hooks with cross-platform compatibility
     */
    public async installHooks(workspaceRoot: string, hooks: GitHookConfig[]): Promise<HookInstallationResult> {
        const result: HookInstallationResult = {
            success: false,
            installedHooks: [],
            errors: [],
            warnings: [],
            platform: this.platformInfo.platform
        };

        try {
            // Verify git repository
            await this.verifyGitRepository(workspaceRoot);

            // Get hooks directory
            const hooksDir = path.join(workspaceRoot, '.git', 'hooks');
            await this.ensureHooksDirectory(hooksDir);

            // Install each hook
            for (const hookConfig of hooks) {
                if (!hookConfig.enabled) {
                    this.contextLogger.debug(`Skipping disabled hook: ${hookConfig.name}`);
                    continue;
                }

                try {
                    await this.installSingleHook(hooksDir, hookConfig);
                    result.installedHooks.push(hookConfig.name);
                    this.contextLogger.info(`Successfully installed ${hookConfig.name} hook`);
                } catch (error) {
                    const errorMsg = `Failed to install ${hookConfig.name} hook: ${(error as Error).message}`;
                    result.errors.push(errorMsg);
                    this.contextLogger.error(errorMsg, error as Error);
                }
            }

            // Verify installation
            const verificationResult = await this.verifyHookInstallation(hooksDir, hooks);
            result.warnings.push(...verificationResult.warnings);

            result.success = result.errors.length === 0 && result.installedHooks.length > 0;

            this.contextLogger.info('Hook installation completed', {
                success: result.success,
                installed: result.installedHooks.length,
                errors: result.errors.length
            });

        } catch (error) {
            const errorMsg = `Hook installation failed: ${(error as Error).message}`;
            result.errors.push(errorMsg);
            this.contextLogger.error(errorMsg, error as Error);
        }

        return result;
    }

    /**
     * Generate cross-platform hook script
     */
    private generateHookScript(hookName: string, config: GitHookConfig): string {
        if (config.customScript) {
            return this.wrapCustomScript(config.customScript, config);
        }

        switch (hookName) {
            case 'pre-commit':
                return this.generatePreCommitHook(config);
            case 'pre-push':
                return this.generatePreCommitHook(config); // Use pre-commit logic for now
            case 'commit-msg':
                return this.generateCommitMsgHook(config);
            case 'pre-receive':
                return this.generatePreReceiveHook(config);
            default:
                throw new Error(`Unsupported hook: ${hookName}`);
        }
    }

    /**
     * Generate pre-commit hook with cross-platform support
     */
    private generatePreCommitHook(config: GitHookConfig): string {
        if (this.platformInfo.isWindows) {
            return `@echo off
REM FlowCode pre-commit hook for Windows
REM Generated on ${new Date().toISOString()}
setlocal enabledelayedexpansion

echo Running FlowCode pre-commit checks...

REM Check if running in CI environment
if defined CI (
    if "${config.skipOnCI}" == "true" (
        echo Skipping pre-commit checks in CI environment
        exit /b 0
    )
)

REM Set timeout for hook execution
set HOOK_TIMEOUT=${config.timeout}

REM Check for Node.js availability
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo Warning: Node.js not found in PATH, skipping some checks
    goto :skip_node_checks
)

REM Get staged files
for /f "delims=" %%i in ('git diff --cached --name-only --diff-filter=ACM') do (
    set "staged_files=!staged_files! %%i"
)

if "!staged_files!" == "" (
    echo No staged files to check
    goto :end
)

REM Run ESLint on staged JavaScript/TypeScript files
echo Checking JavaScript/TypeScript files...
for %%f in (!staged_files!) do (
    echo %%f | findstr /r "\\.\\(js\\|ts\\|jsx\\|tsx\\)$" >nul
    if !errorlevel! equ 0 (
        npx eslint "%%f" --fix
        if !errorlevel! neq 0 (
            echo ESLint failed for %%f
            ${config.failOnError ? 'exit /b 1' : 'echo Warning: ESLint issues found but continuing...'}
        )
    )
)

REM Run TypeScript checks if tsconfig.json exists
if exist "tsconfig.json" (
    echo Running TypeScript checks...
    timeout /t %HOOK_TIMEOUT% npx tsc --noEmit
    if !errorlevel! neq 0 (
        echo TypeScript checks failed
        ${config.failOnError ? 'exit /b 1' : 'echo Warning: TypeScript issues found but continuing...'}
    )
)

:skip_node_checks
:end
echo Pre-commit checks completed successfully!
exit /b 0`;
        } else {
            return `#!/bin/sh
# FlowCode pre-commit hook for Unix/Linux/macOS
# Generated on ${new Date().toISOString()}

echo "Running FlowCode pre-commit checks..."

# Check if running in CI environment
if [ "${config.skipOnCI}" = "true" ] && [ -n "$CI" ]; then
    echo "Skipping pre-commit checks in CI environment"
    exit 0
fi

# Set timeout for hook execution
HOOK_TIMEOUT=${config.timeout}

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check for Node.js availability
if ! command_exists node; then
    echo "Warning: Node.js not found in PATH, skipping some checks"
    exit 0
fi

# Get staged files
staged_files=$(git diff --cached --name-only --diff-filter=ACM)

if [ -z "$staged_files" ]; then
    echo "No staged files to check"
    exit 0
fi

# Run ESLint on staged JavaScript/TypeScript files
echo "Checking JavaScript/TypeScript files..."
js_ts_files=$(echo "$staged_files" | grep -E "\\.(js|ts|jsx|tsx)$" || true)

if [ -n "$js_ts_files" ]; then
    for file in $js_ts_files; do
        if ! timeout $HOOK_TIMEOUT npx eslint "$file" --fix; then
            echo "ESLint failed for $file"
            ${config.failOnError ? 'exit 1' : 'echo "Warning: ESLint issues found but continuing..."'}
        fi
    done
fi

# Run TypeScript checks if tsconfig.json exists
if [ -f "tsconfig.json" ]; then
    echo "Running TypeScript checks..."
    if ! timeout $HOOK_TIMEOUT npx tsc --noEmit; then
        echo "TypeScript checks failed"
        ${config.failOnError ? 'exit 1' : 'echo "Warning: TypeScript issues found but continuing..."'}
    fi
fi

echo "Pre-commit checks completed successfully!"
exit 0`;
        }
    }

    /**
     * Generate commit-msg hook for commit message validation
     */
    private generateCommitMsgHook(config: GitHookConfig): string {
        if (this.platformInfo.isWindows) {
            return `@echo off
REM FlowCode commit-msg hook for Windows
set commit_msg_file=%1
if not exist "%commit_msg_file%" (
    echo Commit message file not found
    exit /b 1
)

REM Read commit message
set /p commit_msg=<"%commit_msg_file%"

REM Basic validation
if "%commit_msg%" == "" (
    echo Commit message cannot be empty
    exit /b 1
)

REM Check minimum length
set msg_len=0
for /f %%i in ('echo %commit_msg% ^| find /c /v ""') do set msg_len=%%i
if %msg_len% lss 10 (
    echo Commit message too short (minimum 10 characters)
    ${config.failOnError ? 'exit /b 1' : 'echo Warning: Short commit message'}
)

echo Commit message validation passed
exit /b 0`;
        } else {
            return `#!/bin/sh
# FlowCode commit-msg hook for Unix/Linux/macOS
commit_msg_file="$1"

if [ ! -f "$commit_msg_file" ]; then
    echo "Commit message file not found"
    exit 1
fi

# Read commit message
commit_msg=$(cat "$commit_msg_file")

# Basic validation
if [ -z "$commit_msg" ]; then
    echo "Commit message cannot be empty"
    exit 1
fi

# Check minimum length
if [ \${#commit_msg} -lt 10 ]; then
    echo "Commit message too short (minimum 10 characters)"
    ${config.failOnError ? 'exit 1' : 'echo "Warning: Short commit message"'}
fi

# Check for conventional commit format (optional)
if ! echo "$commit_msg" | grep -qE "^(feat|fix|docs|style|refactor|test|chore|perf|ci|build|revert)(\\(.+\\))?: .+"; then
    echo "Consider using conventional commit format: type(scope): description"
fi

echo "Commit message validation passed"
exit 0`;
        }
    }

    /**
     * Generate pre-receive hook for server-side validation
     */
    private generatePreReceiveHook(config: GitHookConfig): string {
        if (this.platformInfo.isWindows) {
            return `@echo off
REM FlowCode pre-receive hook for Windows
echo Running server-side validation...

REM This hook runs on the server before accepting pushes
REM Add server-side validation logic here

echo Server-side validation passed
exit /b 0`;
        } else {
            return `#!/bin/sh
# FlowCode pre-receive hook for Unix/Linux/macOS
echo "Running server-side validation..."

# This hook runs on the server before accepting pushes
# Add server-side validation logic here

echo "Server-side validation passed"
exit 0`;
        }
    }

    /**
     * Wrap custom script with platform-specific wrapper
     */
    private wrapCustomScript(customScript: string, config: GitHookConfig): string {
        if (this.platformInfo.isWindows) {
            return `@echo off
REM FlowCode custom hook for Windows
REM Generated on ${new Date().toISOString()}

${customScript}`;
        } else {
            return `#!/bin/sh
# FlowCode custom hook for Unix/Linux/macOS
# Generated on ${new Date().toISOString()}

${customScript}`;
        }
    }

    /**
     * Install a single git hook
     */
    private async installSingleHook(hooksDir: string, config: GitHookConfig): Promise<void> {
        const hookPath = path.join(hooksDir, config.name);
        const hookContent = this.generateHookScript(config.name, config);

        // Validate hook content
        const validation = this.validateHookContent(hookContent);
        if (!validation.isValid) {
            throw new Error(`Hook validation failed: ${validation.errors.join(', ')}`);
        }

        // Write hook file
        fs.writeFileSync(hookPath, hookContent, { encoding: 'utf8' });

        // Make executable on Unix systems
        if (this.platformInfo.isUnix) {
            fs.chmodSync(hookPath, 0o755);
        }

        // Verify hook was created
        if (!fs.existsSync(hookPath)) {
            throw new Error(`Hook file was not created: ${hookPath}`);
        }

        this.contextLogger.debug(`Installed hook: ${config.name}`, {
            path: hookPath,
            size: hookContent.length
        });
    }

    /**
     * Validate hook content for security and correctness
     */
    private validateHookContent(content: string): { isValid: boolean; errors: string[] } {
        const errors: string[] = [];

        // Basic content validation
        if (!content || content.trim().length === 0) {
            errors.push('Hook content is empty');
        }

        // Check for potentially dangerous patterns
        const dangerousPatterns = [
            /rm\s+-rf\s+\//, // Dangerous rm commands
            /format\s+c:/, // Windows format commands
            /del\s+\/[fs]\s+\/[sq]/, // Dangerous Windows delete commands
            /eval\s*\(/, // eval() calls
            /exec\s*\(/, // exec() calls in scripts
        ];

        for (const pattern of dangerousPatterns) {
            if (pattern.test(content)) {
                errors.push('Hook contains potentially dangerous commands');
                break;
            }
        }

        // Platform-specific validation
        if (this.platformInfo.isWindows) {
            if (!content.startsWith('@echo off') && !content.includes('REM')) {
                errors.push('Windows hook should start with @echo off');
            }
        } else {
            if (!content.startsWith('#!/bin/sh') && !content.startsWith('#!/bin/bash')) {
                errors.push('Unix hook should start with shebang');
            }
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * Verify git repository exists
     */
    private async verifyGitRepository(workspaceRoot: string): Promise<void> {
        const gitDir = path.join(workspaceRoot, '.git');

        if (!fs.existsSync(gitDir)) {
            throw new Error('Not a git repository. Git hooks require a git repository.');
        }

        // Check if it's a valid git directory
        const gitHeadFile = path.join(gitDir, 'HEAD');
        if (!fs.existsSync(gitHeadFile)) {
            throw new Error('Invalid git repository structure.');
        }

        this.contextLogger.debug('Git repository verified', { gitDir });
    }

    /**
     * Ensure hooks directory exists
     */
    private async ensureHooksDirectory(hooksDir: string): Promise<void> {
        if (!fs.existsSync(hooksDir)) {
            fs.mkdirSync(hooksDir, { recursive: true });
            this.contextLogger.debug('Created hooks directory', { hooksDir });
        }

        // Verify directory is writable
        try {
            const testFile = path.join(hooksDir, '.test-write');
            fs.writeFileSync(testFile, 'test');
            fs.unlinkSync(testFile);
        } catch (error) {
            throw new Error(`Hooks directory is not writable: ${hooksDir}`);
        }
    }

    /**
     * Verify hook installation
     */
    private async verifyHookInstallation(hooksDir: string, hooks: GitHookConfig[]): Promise<{
        success: boolean;
        warnings: string[];
    }> {
        const warnings: string[] = [];

        for (const hookConfig of hooks) {
            if (!hookConfig.enabled) {continue;}

            const hookPath = path.join(hooksDir, hookConfig.name);

            if (!fs.existsSync(hookPath)) {
                warnings.push(`Hook file not found: ${hookConfig.name}`);
                continue;
            }

            // Check file permissions on Unix systems
            if (this.platformInfo.isUnix) {
                const stats = fs.statSync(hookPath);
                const isExecutable = (stats.mode & parseInt('111', 8)) !== 0;
                if (!isExecutable) {
                    warnings.push(`Hook is not executable: ${hookConfig.name}`);
                }
            }

            // Verify hook content
            const content = fs.readFileSync(hookPath, 'utf8');
            if (!content.includes('FlowCode')) {
                warnings.push(`Hook does not appear to be FlowCode hook: ${hookConfig.name}`);
            }
        }

        return {
            success: warnings.length === 0,
            warnings
        };
    }

    /**
     * Uninstall git hooks
     */
    public async uninstallHooks(workspaceRoot: string, hookNames: string[]): Promise<{
        success: boolean;
        uninstalledHooks: string[];
        errors: string[];
    }> {
        const result = {
            success: false,
            uninstalledHooks: [] as string[],
            errors: [] as string[]
        };

        try {
            const hooksDir = path.join(workspaceRoot, '.git', 'hooks');

            for (const hookName of hookNames) {
                const hookPath = path.join(hooksDir, hookName);

                if (fs.existsSync(hookPath)) {
                    try {
                        // Check if it's a FlowCode hook before removing
                        const content = fs.readFileSync(hookPath, 'utf8');
                        if (content.includes('FlowCode')) {
                            fs.unlinkSync(hookPath);
                            result.uninstalledHooks.push(hookName);
                            this.contextLogger.info(`Uninstalled hook: ${hookName}`);
                        } else {
                            result.errors.push(`Hook ${hookName} is not a FlowCode hook, skipping`);
                        }
                    } catch (error) {
                        result.errors.push(`Failed to uninstall ${hookName}: ${(error as Error).message}`);
                    }
                }
            }

            result.success = result.errors.length === 0;
        } catch (error) {
            result.errors.push(`Uninstallation failed: ${(error as Error).message}`);
        }

        return result;
    }

    /**
     * Get platform information
     */
    public getPlatformInfo(): PlatformInfo {
        return { ...this.platformInfo };
    }

    /**
     * Test hook execution
     */
    public async testHook(workspaceRoot: string, hookName: string): Promise<{
        success: boolean;
        output: string;
        error?: string;
        executionTime: number;
    }> {
        const startTime = Date.now();
        const hooksDir = path.join(workspaceRoot, '.git', 'hooks');
        const hookPath = path.join(hooksDir, hookName);

        if (!fs.existsSync(hookPath)) {
            return {
                success: false,
                output: '',
                error: `Hook not found: ${hookName}`,
                executionTime: Date.now() - startTime
            };
        }

        try {
            const { spawn } = await import('child_process');
            const command = this.platformInfo.isWindows ? 'cmd' : 'sh';
            const args = this.platformInfo.isWindows ? ['/c', hookPath] : [hookPath];

            return new Promise((resolve) => {
                const process = spawn(command, args, {
                    cwd: workspaceRoot,
                    stdio: ['pipe', 'pipe', 'pipe']
                });

                let output = '';
                let error = '';

                process.stdout?.on('data', (data) => {
                    output += data.toString();
                });

                process.stderr?.on('data', (data) => {
                    error += data.toString();
                });

                process.on('close', (code) => {
                    resolve({
                        success: code === 0,
                        output,
                        error: error || undefined,
                        executionTime: Date.now() - startTime
                    });
                });

                // Timeout after 30 seconds
                setTimeout(() => {
                    process.kill();
                    resolve({
                        success: false,
                        output,
                        error: 'Hook execution timed out',
                        executionTime: Date.now() - startTime
                    });
                }, 30000);
            });
        } catch (error) {
            return {
                success: false,
                output: '',
                error: `Failed to execute hook: ${(error as Error).message}`,
                executionTime: Date.now() - startTime
            };
        }
    }
}
