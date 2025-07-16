import * as vscode from 'vscode';
import { spawn } from 'child_process';
import { logger } from './logger';
import * as fs from 'fs';
import * as path from 'path';

export interface ToolInfo {
    name: string;
    command: string;
    version?: string;
    isRequired: boolean;
    installUrl: string;
    description: string;
    checkCommand: string[];
    alternatives?: string[];
}

export interface ToolStatus {
    name: string;
    isInstalled: boolean;
    version?: string;
    path?: string;
    error?: string;
}

export interface DependencyCheckResult {
    allRequired: boolean;
    missing: ToolInfo[];
    installed: ToolStatus[];
    warnings: string[];
}

export class ToolManager {
    private static readonly contextLogger = logger.createContextLogger('ToolManager');
    
    private static readonly REQUIRED_TOOLS: ToolInfo[] = [
        {
            name: 'Node.js',
            command: 'node',
            isRequired: true,
            installUrl: 'https://nodejs.org/',
            description: 'JavaScript runtime required for FlowCode',
            checkCommand: ['node', '--version'],
            alternatives: ['nodejs']
        },
        {
            name: 'npm',
            command: 'npm',
            isRequired: true,
            installUrl: 'https://www.npmjs.com/get-npm',
            description: 'Package manager for Node.js',
            checkCommand: ['npm', '--version'],
            alternatives: process.platform === 'win32' ? ['npm.cmd'] : undefined
        },
        {
            name: 'Git',
            command: 'git',
            isRequired: true,
            installUrl: 'https://git-scm.com/downloads',
            description: 'Version control system required for FlowCode features',
            checkCommand: ['git', '--version']
        }
    ];

    private static readonly OPTIONAL_TOOLS: ToolInfo[] = [
        {
            name: 'TypeScript',
            command: 'tsc',
            isRequired: false,
            installUrl: 'https://www.typescriptlang.org/download',
            description: 'TypeScript compiler for type checking',
            checkCommand: ['node', '-e', 'console.log(require("typescript").version)']
        },
        {
            name: 'ESLint',
            command: 'eslint',
            isRequired: false,
            installUrl: 'https://eslint.org/docs/user-guide/getting-started',
            description: 'JavaScript/TypeScript linter',
            checkCommand: ['node', '-e', 'console.log(require("eslint").Linter.version)']
        },
        {
            name: 'Semgrep',
            command: 'semgrep',
            isRequired: false,
            installUrl: 'https://semgrep.dev/docs/getting-started/',
            description: 'Static analysis tool for security scanning (optional)',
            checkCommand: ['semgrep', '--version']
        }
    ];

    /**
     * Check if a tool is available by name
     */
    public async isToolAvailable(toolName: string): Promise<boolean> {
        const tool = [...ToolManager.REQUIRED_TOOLS, ...ToolManager.OPTIONAL_TOOLS].find(t =>
            t.name.toLowerCase() === toolName.toLowerCase() ||
            t.command.toLowerCase() === toolName.toLowerCase()
        );

        if (!tool) {
            return false;
        }

        const status = await ToolManager.checkTool(tool);
        return status.isInstalled;
    }

    /**
     * Check if a specific tool is installed
     */
    public static async checkTool(tool: ToolInfo): Promise<ToolStatus> {
        const status: ToolStatus = {
            name: tool.name,
            isInstalled: false
        };

        try {
            // Special handling for npm packages that are dependencies
            if (tool.name === 'TypeScript') {
                try {
                    const typescript = require('typescript');
                    status.isInstalled = true;
                    status.version = typescript.version;
                    status.path = 'node_modules/typescript';
                    return status;
                } catch (error) {
                    // Fall back to command check
                }
            }

            if (tool.name === 'ESLint') {
                try {
                    const eslint = require('eslint');
                    status.isInstalled = true;
                    status.version = eslint.Linter.version;
                    status.path = 'node_modules/eslint';
                    return status;
                } catch (error) {
                    // Fall back to command check
                }
            }

            if (tool.name === 'npm') {
                // Special handling for npm - check if it's available via Node.js
                try {
                    const result = await this.executeCommand(['node', '-e', 'console.log(process.version)']);
                    if (result.success) {
                        // If Node.js is available, npm should be available too
                        status.isInstalled = true;
                        status.version = 'bundled with Node.js';
                        status.path = 'bundled with Node.js';
                        return status;
                    }
                } catch (error) {
                    // Fall back to command check
                }
            }

            // Try primary command first
            const result = await this.executeCommand(tool.checkCommand);
            if (result.success) {
                status.isInstalled = true;
                status.version = this.extractVersion(result.output);
                status.path = await this.getCommandPath(tool.command);
                return status;
            }

            // Try alternatives if primary command failed
            if (tool.alternatives) {
                for (const alt of tool.alternatives) {
                    const altCommand = [...tool.checkCommand];
                    altCommand[0] = alt;
                    const altResult = await this.executeCommand(altCommand);
                    if (altResult.success) {
                        status.isInstalled = true;
                        status.version = this.extractVersion(altResult.output);
                        status.path = await this.getCommandPath(alt);
                        return status;
                    }
                }
            }

            status.error = result.error || 'Command not found';
        } catch (error) {
            status.error = error instanceof Error ? error.message : 'Unknown error';
        }

        return status;
    }

    /**
     * Check all required and optional tools
     */
    public static async checkAllDependencies(): Promise<DependencyCheckResult> {
        const result: DependencyCheckResult = {
            allRequired: true,
            missing: [],
            installed: [],
            warnings: []
        };

        this.contextLogger.info('Checking tool dependencies...');

        // Check required tools
        for (const tool of this.REQUIRED_TOOLS) {
            const status = await this.checkTool(tool);
            result.installed.push(status);

            if (!status.isInstalled) {
                result.allRequired = false;
                result.missing.push(tool);
                this.contextLogger.warn(`Required tool missing: ${tool.name}`);
            } else {
                this.contextLogger.info(`Required tool found: ${tool.name} ${status.version || ''}`);
            }
        }

        // Check optional tools
        for (const tool of this.OPTIONAL_TOOLS) {
            const status = await this.checkTool(tool);
            result.installed.push(status);

            if (!status.isInstalled) {
                // Only warn about missing optional tools, don't treat as errors
                result.warnings.push(`Optional tool not found: ${tool.name} - ${tool.description}`);
                this.contextLogger.debug(`Optional tool missing: ${tool.name} - this is OK, tool is optional`);
            } else {
                this.contextLogger.info(`Optional tool found: ${tool.name} ${status.version || ''}`);
            }
        }

        return result;
    }

    /**
     * Show dependency status to user
     */
    public static async showDependencyStatus(): Promise<void> {
        const result = await this.checkAllDependencies();

        if (result.allRequired) {
            const installedCount = result.installed.filter(t => t.isInstalled).length;
            vscode.window.showInformationMessage(
                `✅ All required tools are installed (${installedCount}/${result.installed.length} total)`
            );
        } else {
            const missingNames = result.missing.map(t => t.name).join(', ');
            const action = await vscode.window.showErrorMessage(
                `❌ Missing required tools: ${missingNames}`,
                'Show Installation Guide',
                'Dismiss'
            );

            if (action === 'Show Installation Guide') {
                await this.showInstallationGuide(result.missing);
            }
        }

        // Show warnings for missing optional tools
        if (result.warnings.length > 0) {
            const action = await vscode.window.showWarningMessage(
                `⚠️ Some optional tools are missing. FlowCode will work with reduced functionality.`,
                'Show Details',
                'Dismiss'
            );

            if (action === 'Show Details') {
                await this.showOptionalToolsInfo(result.warnings);
            }
        }
    }

    /**
     * Show installation guide for missing tools
     */
    private static async showInstallationGuide(missingTools: ToolInfo[]): Promise<void> {
        const panel = vscode.window.createWebviewPanel(
            'flowcodeInstallGuide',
            'FlowCode - Installation Guide',
            vscode.ViewColumn.One,
            { enableScripts: false }
        );

        const html = this.generateInstallationGuideHtml(missingTools);
        panel.webview.html = html;
    }

    /**
     * Generate HTML for installation guide
     */
    private static generateInstallationGuideHtml(missingTools: ToolInfo[]): string {
        const toolsHtml = missingTools.map(tool => `
            <div class="tool-card">
                <h3>${tool.name}</h3>
                <p>${tool.description}</p>
                <p><strong>Installation:</strong> <a href="${tool.installUrl}" target="_blank">${tool.installUrl}</a></p>
                <p><strong>Command:</strong> <code>${tool.command}</code></p>
            </div>
        `).join('');

        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>FlowCode Installation Guide</title>
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 20px; }
                .tool-card { border: 1px solid #ddd; padding: 15px; margin: 10px 0; border-radius: 5px; }
                .tool-card h3 { margin-top: 0; color: #007acc; }
                code { background: #f5f5f5; padding: 2px 4px; border-radius: 3px; }
                a { color: #007acc; }
            </style>
        </head>
        <body>
            <h1>FlowCode - Missing Dependencies</h1>
            <p>The following tools are required for FlowCode to function properly:</p>
            ${toolsHtml}
            <h2>Installation Steps</h2>
            <ol>
                <li>Install each tool using the provided links</li>
                <li>Restart VS Code after installation</li>
                <li>Run "FlowCode: Check Dependencies" command to verify installation</li>
            </ol>
        </body>
        </html>
        `;
    }

    /**
     * Show information about optional tools
     */
    private static async showOptionalToolsInfo(warnings: string[]): Promise<void> {
        const message = warnings.join('\n\n');
        vscode.window.showInformationMessage(message, { modal: true });
    }

    /**
     * Execute a command and return result
     */
    private static async executeCommand(command: string[]): Promise<{ success: boolean; output: string; error?: string }> {
        return new Promise((resolve) => {
            const [cmd, ...args] = command;

            // Ensure cmd is defined
            if (!cmd) {
                resolve({
                    success: false,
                    output: '',
                    error: 'No command specified'
                });
                return;
            }

            const childProcess = spawn(cmd, args, {
                stdio: ['pipe', 'pipe', 'pipe'],
                timeout: 10000, // 10 second timeout
                env: process.env, // Inherit environment variables
                shell: process.platform === 'win32' // Use shell on Windows for PATH resolution
            });

            let output = '';
            let error = '';

            childProcess.stdout?.on('data', (data: Buffer) => {
                output += data.toString();
            });

            childProcess.stderr?.on('data', (data: Buffer) => {
                error += data.toString();
            });

            childProcess.on('close', (code: number | null) => {
                resolve({
                    success: code === 0,
                    output: output.trim(),
                    error: error.trim() || undefined
                });
            });

            childProcess.on('error', (err: Error) => {
                this.contextLogger.warn(`Command execution failed: ${cmd} ${args.join(' ')}`, err);
                resolve({
                    success: false,
                    output: '',
                    error: err.message
                });
            });
        });
    }

    /**
     * Extract version from command output
     */
    private static extractVersion(output: string): string | undefined {
        const versionMatch = output.match(/v?(\d+\.\d+\.\d+)/);
        return versionMatch ? versionMatch[1] : undefined;
    }

    /**
     * Get the full path of a command
     */
    private static async getCommandPath(command: string): Promise<string | undefined> {
        const isWindows = process.platform === 'win32';
        const whereCmd = isWindows ? 'where' : 'which';
        
        const result = await this.executeCommand([whereCmd, command]);
        return result.success ? result.output.split('\n')[0] : undefined;
    }

    /**
     * Install a tool automatically (where possible)
     */
    public static async installTool(toolName: string): Promise<boolean> {
        const tool = [...this.REQUIRED_TOOLS, ...this.OPTIONAL_TOOLS].find(t => t.name === toolName);
        if (!tool) {
            return false;
        }

        // For now, we can only auto-install npm packages
        if (tool.name === 'TypeScript' || tool.name === 'ESLint') {
            const packageName = tool.name === 'TypeScript' ? 'typescript' : 'eslint';
            
            const result = await vscode.window.showInformationMessage(
                `Install ${tool.name} globally using npm?`,
                'Install',
                'Cancel'
            );

            if (result === 'Install') {
                return await this.installNpmPackage(packageName, true);
            }
        }

        return false;
    }

    /**
     * Instance method to install a tool
     */
    public async installTool(toolName: string): Promise<boolean> {
        return await ToolManager.installTool(toolName);
    }



    /**
     * Install npm package
     */
    private static async installNpmPackage(packageName: string, global: boolean = false): Promise<boolean> {
        const args = ['install'];
        if (global) {
            args.push('-g');
        }
        args.push(packageName);

        const result = await this.executeCommand(['npm', ...args]);
        return result.success;
    }

    /**
     * Check if a package is available in node_modules
     */
    private static checkNodeModulesPackage(packageName: string): { available: boolean; version?: string; path?: string } {
        try {
            const pkg = require(packageName);
            const packageJson = require(`${packageName}/package.json`);
            return {
                available: true,
                version: packageJson.version,
                path: require.resolve(packageName)
            };
        } catch (error) {
            return { available: false };
        }
    }

    /**
     * Validate that all runtime dependencies are properly installed
     */
    public static async validateRuntimeDependencies(): Promise<{ valid: boolean; missing: string[]; details: string[] }> {
        const result = {
            valid: true,
            missing: [] as string[],
            details: [] as string[]
        };

        // Check critical runtime dependencies (only Node.js modules used by extension)
        const runtimeDeps = ['typescript', 'eslint', 'axios', 'tree-sitter'];

        for (const dep of runtimeDeps) {
            const check = this.checkNodeModulesPackage(dep);
            if (!check.available) {
                result.valid = false;
                result.missing.push(dep);
                result.details.push(`Missing runtime dependency: ${dep}`);
            } else {
                result.details.push(`✓ ${dep} v${check.version} available`);
            }
        }

        return result;
    }
}
