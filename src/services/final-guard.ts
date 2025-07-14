import * as vscode from 'vscode';
import { spawn } from 'child_process';
import { ConfigurationManager } from '../utils/configuration-manager';

export class FinalGuard {
    constructor(private configManager: ConfigurationManager) {}

    public async initialize(): Promise<void> {
        // Initialize pre-push and pre-commit hooks
        await this.setupGitHooks();
    }

    private async setupGitHooks(): Promise<void> {
        try {
            const hooksDir = await this.configManager.getGitHooksDirectory();
            
            // Create pre-commit hook
            const preCommitHook = this.generatePreCommitHook();
            await this.writeHook(hooksDir, 'pre-commit', preCommitHook);
            
            // Create pre-push hook
            const prePushHook = this.generatePrePushHook();
            await this.writeHook(hooksDir, 'pre-push', prePushHook);
            
        } catch (error) {
            console.error('Failed to setup git hooks:', error);
        }
    }

    private generatePreCommitHook(): string {
        return `#!/bin/sh
# FlowCode pre-commit hook
# This hook runs quick checks before allowing commits

echo "Running FlowCode pre-commit checks..."

# Check if FlowCode extension is available
if command -v code >/dev/null 2>&1; then
    # Run companion guard checks
    echo "Running companion guard checks..."
    
    # Check for TypeScript/JavaScript files
    if git diff --cached --name-only | grep -E '\\.(js|ts|jsx|tsx)$' >/dev/null; then
        echo "Checking TypeScript/JavaScript files..."
        if ! npx eslint --quiet $(git diff --cached --name-only | grep -E '\\.(js|ts|jsx|tsx)$'); then
            echo "ESLint checks failed. Please fix the issues before committing."
            exit 1
        fi
        
        if [ -f "tsconfig.json" ]; then
            echo "Running TypeScript checks..."
            if ! npx tsc --noEmit; then
                echo "TypeScript checks failed. Please fix the issues before committing."
                exit 1
            fi
        fi
    fi
    
    # Check for Python files
    if git diff --cached --name-only | grep -E '\\.py$' >/dev/null; then
        echo "Checking Python files..."
        if command -v ruff >/dev/null 2>&1; then
            if ! ruff check $(git diff --cached --name-only | grep -E '\\.py$'); then
                echo "Ruff checks failed. Please fix the issues before committing."
                exit 1
            fi
        fi
    fi
    
    echo "Pre-commit checks passed!"
else
    echo "VS Code not found, skipping FlowCode checks"
fi
`;
    }

    private generatePrePushHook(): string {
        return `#!/bin/sh
# FlowCode pre-push hook
# This hook runs comprehensive checks before allowing pushes

echo "Running FlowCode pre-push checks..."

# Check if FlowCode extension is available
if command -v code >/dev/null 2>&1; then
    echo "Running final guard checks..."
    
    # Run full test suite
    if [ -f "package.json" ]; then
        echo "Running npm tests..."
        if npm test 2>/dev/null; then
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
else
    echo "VS Code not found, skipping FlowCode checks"
fi
`;
    }

    private async writeHook(hooksDir: string, hookName: string, content: string): Promise<void> {
        const hookPath = `${hooksDir}/${hookName}`;
        
        try {
            const fs = await import('fs');
            const path = await import('path');
            
            // Ensure hooks directory exists
            if (!fs.existsSync(hooksDir)) {
                fs.mkdirSync(hooksDir, { recursive: true });
            }
            
            // Write hook file
            fs.writeFileSync(hookPath, content);
            
            // Make hook executable (Unix-like systems)
            if (process.platform !== 'win32') {
                fs.chmodSync(hookPath, '755');
            }
            
            console.log(`Created ${hookName} hook at ${hookPath}`);
        } catch (error) {
            console.error(`Failed to create ${hookName} hook:`, error);
        }
    }

    public async runFinalChecks(): Promise<boolean> {
        try {
            const workspaceRoot = await this.configManager.getWorkspaceRoot();
            
            return await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "Running final guard checks...",
                cancellable: false
            }, async () => {
                // Run comprehensive checks
                const checks = [
                    this.runTests(workspaceRoot),
                    this.runSecurityScan(workspaceRoot)
                ];
                
                const results = await Promise.all(checks);
                return results.every(result => result);
            });
        } catch (error) {
            console.error('Final guard checks failed:', error);
            return false;
        }
    }

    private async runTests(workspaceRoot: string): Promise<boolean> {
        return new Promise((resolve) => {
            const testRunner = spawn('npm', ['test'], {
                cwd: workspaceRoot,
                stdio: 'pipe'
            });

            testRunner.on('close', (code) => {
                resolve(code === 0);
            });

            testRunner.on('error', () => {
                resolve(true); // If no tests exist, consider it passed
            });
        });
    }

    private async runSecurityScan(workspaceRoot: string): Promise<boolean> {
        return new Promise((resolve) => {
            const semgrep = spawn('semgrep', ['--config=auto', '--error'], {
                cwd: workspaceRoot,
                stdio: 'pipe'
            });

            semgrep.on('close', (code) => {
                resolve(code === 0);
            });

            semgrep.on('error', () => {
                resolve(true); // If semgrep not available, skip security scan
            });
        });
    }
}