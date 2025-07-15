import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawn, exec } from 'child_process';
import { logger } from './logger';

export interface ToolDependency {
    name: string;
    displayName: string;
    description: string;
    required: boolean;
    platforms: NodeJS.Platform[];
    commands: string[];
    installInstructions: {
        [platform: string]: {
            method: string;
            command: string;
            url?: string;
            notes?: string;
        };
    };
    versionCommand: string;
    versionPattern: RegExp;
    minimumVersion?: string;
    category: 'linting' | 'formatting' | 'testing' | 'security' | 'git' | 'build' | 'runtime';
}

export interface ToolStatus {
    name: string;
    installed: boolean;
    version?: string;
    path?: string;
    compatible: boolean;
    issues: string[];
    recommendations: string[];
}

export interface DependencyCheckResult {
    allSatisfied: boolean;
    requiredMissing: string[];
    optionalMissing: string[];
    incompatible: string[];
    toolStatuses: ToolStatus[];
    platformInfo: {
        platform: NodeJS.Platform;
        arch: string;
        nodeVersion: string;
        npmVersion?: string;
    };
}

export class ToolDependencyManager {
    private contextLogger = logger.createContextLogger('ToolDependencyManager');
    private toolDefinitions: ToolDependency[] = [];

    constructor() {
        this.initializeToolDefinitions();
        this.contextLogger.info('ToolDependencyManager initialized', {
            platform: process.platform,
            toolCount: this.toolDefinitions.length
        });
    }

    /**
     * Initialize tool definitions for FlowCode
     */
    private initializeToolDefinitions(): void {
        this.toolDefinitions = [
            // Node.js Runtime
            {
                name: 'node',
                displayName: 'Node.js',
                description: 'JavaScript runtime required for FlowCode extension',
                required: true,
                platforms: ['win32', 'darwin', 'linux'],
                commands: ['node'],
                installInstructions: {
                    win32: {
                        method: 'Download installer',
                        command: 'Download from nodejs.org',
                        url: 'https://nodejs.org/en/download/',
                        notes: 'Download the Windows Installer (.msi) for your architecture'
                    },
                    darwin: {
                        method: 'Homebrew or installer',
                        command: 'brew install node',
                        url: 'https://nodejs.org/en/download/',
                        notes: 'Use Homebrew for easier management: brew install node'
                    },
                    linux: {
                        method: 'Package manager',
                        command: 'sudo apt-get install nodejs npm',
                        notes: 'Use your distribution\'s package manager or NodeSource repository'
                    }
                },
                versionCommand: 'node --version',
                versionPattern: /v(\d+\.\d+\.\d+)/,
                minimumVersion: '14.0.0',
                category: 'runtime'
            },

            // npm Package Manager
            {
                name: 'npm',
                displayName: 'npm',
                description: 'Package manager for Node.js dependencies',
                required: true,
                platforms: ['win32', 'darwin', 'linux'],
                commands: ['npm'],
                installInstructions: {
                    win32: {
                        method: 'Included with Node.js',
                        command: 'Install Node.js from nodejs.org',
                        url: 'https://nodejs.org/en/download/'
                    },
                    darwin: {
                        method: 'Included with Node.js',
                        command: 'brew install node',
                        notes: 'npm is included with Node.js installation'
                    },
                    linux: {
                        method: 'Package manager',
                        command: 'sudo apt-get install npm',
                        notes: 'Usually included with Node.js package'
                    }
                },
                versionCommand: 'npm --version',
                versionPattern: /(\d+\.\d+\.\d+)/,
                minimumVersion: '6.0.0',
                category: 'runtime'
            },

            // Git Version Control
            {
                name: 'git',
                displayName: 'Git',
                description: 'Version control system required for git hooks and repository operations',
                required: true,
                platforms: ['win32', 'darwin', 'linux'],
                commands: ['git'],
                installInstructions: {
                    win32: {
                        method: 'Git for Windows',
                        command: 'Download Git for Windows installer',
                        url: 'https://git-scm.com/download/win',
                        notes: 'Includes Git Bash which is recommended for hook execution'
                    },
                    darwin: {
                        method: 'Xcode Command Line Tools or Homebrew',
                        command: 'xcode-select --install or brew install git',
                        notes: 'Xcode CLT includes Git, or use Homebrew for latest version'
                    },
                    linux: {
                        method: 'Package manager',
                        command: 'sudo apt-get install git',
                        notes: 'Available in most distribution repositories'
                    }
                },
                versionCommand: 'git --version',
                versionPattern: /git version (\d+\.\d+\.\d+)/,
                minimumVersion: '2.20.0',
                category: 'git'
            },

            // ESLint for JavaScript/TypeScript
            {
                name: 'eslint',
                displayName: 'ESLint',
                description: 'JavaScript and TypeScript linter',
                required: false,
                platforms: ['win32', 'darwin', 'linux'],
                commands: ['eslint', 'npx eslint'],
                installInstructions: {
                    win32: {
                        method: 'npm install',
                        command: 'npm install -g eslint',
                        notes: 'Global installation recommended for CLI usage'
                    },
                    darwin: {
                        method: 'npm install',
                        command: 'npm install -g eslint',
                        notes: 'Can also install locally in project: npm install --save-dev eslint'
                    },
                    linux: {
                        method: 'npm install',
                        command: 'npm install -g eslint',
                        notes: 'May require sudo for global installation'
                    }
                },
                versionCommand: 'eslint --version',
                versionPattern: /v(\d+\.\d+\.\d+)/,
                minimumVersion: '7.0.0',
                category: 'linting'
            },

            // TypeScript Compiler
            {
                name: 'typescript',
                displayName: 'TypeScript',
                description: 'TypeScript compiler for type checking',
                required: false,
                platforms: ['win32', 'darwin', 'linux'],
                commands: ['tsc', 'npx tsc'],
                installInstructions: {
                    win32: {
                        method: 'npm install',
                        command: 'npm install -g typescript',
                        notes: 'Global installation provides tsc command'
                    },
                    darwin: {
                        method: 'npm install',
                        command: 'npm install -g typescript',
                        notes: 'Can also use project-local installation'
                    },
                    linux: {
                        method: 'npm install',
                        command: 'npm install -g typescript',
                        notes: 'May require sudo for global installation'
                    }
                },
                versionCommand: 'tsc --version',
                versionPattern: /Version (\d+\.\d+\.\d+)/,
                minimumVersion: '4.0.0',
                category: 'build'
            },

            // Prettier Code Formatter
            {
                name: 'prettier',
                displayName: 'Prettier',
                description: 'Code formatter for consistent styling',
                required: false,
                platforms: ['win32', 'darwin', 'linux'],
                commands: ['prettier', 'npx prettier'],
                installInstructions: {
                    win32: {
                        method: 'npm install',
                        command: 'npm install -g prettier',
                        notes: 'Can be installed globally or per-project'
                    },
                    darwin: {
                        method: 'npm install',
                        command: 'npm install -g prettier',
                        notes: 'Project-local installation often preferred'
                    },
                    linux: {
                        method: 'npm install',
                        command: 'npm install -g prettier',
                        notes: 'Available through npm package manager'
                    }
                },
                versionCommand: 'prettier --version',
                versionPattern: /(\d+\.\d+\.\d+)/,
                minimumVersion: '2.0.0',
                category: 'formatting'
            },

            // Python for Python projects
            {
                name: 'python',
                displayName: 'Python',
                description: 'Python interpreter for Python project support',
                required: false,
                platforms: ['win32', 'darwin', 'linux'],
                commands: ['python', 'python3'],
                installInstructions: {
                    win32: {
                        method: 'Python installer or Microsoft Store',
                        command: 'Download from python.org',
                        url: 'https://www.python.org/downloads/',
                        notes: 'Microsoft Store version is also available'
                    },
                    darwin: {
                        method: 'Homebrew or python.org',
                        command: 'brew install python',
                        url: 'https://www.python.org/downloads/',
                        notes: 'Homebrew installation recommended for development'
                    },
                    linux: {
                        method: 'Package manager',
                        command: 'sudo apt-get install python3 python3-pip',
                        notes: 'Usually pre-installed on most distributions'
                    }
                },
                versionCommand: 'python --version',
                versionPattern: /Python (\d+\.\d+\.\d+)/,
                minimumVersion: '3.7.0',
                category: 'runtime'
            },

            // Ruff Python Linter
            {
                name: 'ruff',
                displayName: 'Ruff',
                description: 'Fast Python linter and formatter',
                required: false,
                platforms: ['win32', 'darwin', 'linux'],
                commands: ['ruff'],
                installInstructions: {
                    win32: {
                        method: 'pip install',
                        command: 'pip install ruff',
                        notes: 'Requires Python and pip to be installed'
                    },
                    darwin: {
                        method: 'pip install or Homebrew',
                        command: 'pip install ruff or brew install ruff',
                        notes: 'Homebrew installation available for easier management'
                    },
                    linux: {
                        method: 'pip install',
                        command: 'pip install ruff',
                        notes: 'Fast alternative to flake8 and black'
                    }
                },
                versionCommand: 'ruff --version',
                versionPattern: /ruff (\d+\.\d+\.\d+)/,
                minimumVersion: '0.1.0',
                category: 'linting'
            }
        ];
    }

    /**
     * Check all tool dependencies
     */
    public async checkDependencies(): Promise<DependencyCheckResult> {
        this.contextLogger.info('Starting dependency check...');

        const toolStatuses: ToolStatus[] = [];
        const requiredMissing: string[] = [];
        const optionalMissing: string[] = [];
        const incompatible: string[] = [];

        // Get platform information
        const platformInfo = {
            platform: process.platform,
            arch: process.arch,
            nodeVersion: process.version,
            npmVersion: await this.getToolVersion('npm')
        };

        // Check each tool
        for (const tool of this.toolDefinitions) {
            if (!tool.platforms.includes(process.platform)) {
                continue; // Skip tools not supported on this platform
            }

            const status = await this.checkTool(tool);
            toolStatuses.push(status);

            if (!status.installed) {
                if (tool.required) {
                    requiredMissing.push(tool.name);
                } else {
                    optionalMissing.push(tool.name);
                }
            } else if (!status.compatible) {
                incompatible.push(tool.name);
            }
        }

        const allSatisfied = requiredMissing.length === 0 && incompatible.length === 0;

        this.contextLogger.info('Dependency check completed', {
            allSatisfied,
            requiredMissing: requiredMissing.length,
            optionalMissing: optionalMissing.length,
            incompatible: incompatible.length
        });

        return {
            allSatisfied,
            requiredMissing,
            optionalMissing,
            incompatible,
            toolStatuses,
            platformInfo
        };
    }

    /**
     * Check a specific tool
     */
    private async checkTool(tool: ToolDependency): Promise<ToolStatus> {
        const status: ToolStatus = {
            name: tool.name,
            installed: false,
            compatible: false,
            issues: [],
            recommendations: []
        };

        try {
            // Check if any of the tool commands are available
            let foundCommand: string | undefined;
            let toolPath: string | undefined;

            for (const command of tool.commands) {
                const path = await this.findCommand(command);
                if (path) {
                    foundCommand = command;
                    toolPath = path;
                    break;
                }
            }

            if (!foundCommand || !toolPath) {
                status.issues.push(`Command not found: ${tool.commands.join(' or ')}`);
                status.recommendations.push(this.getInstallRecommendation(tool));
                return status;
            }

            status.installed = true;
            status.path = toolPath;

            // Get version information
            const version = await this.getToolVersion(foundCommand, tool.versionCommand, tool.versionPattern);
            if (version) {
                status.version = version;

                // Check version compatibility
                if (tool.minimumVersion) {
                    const compatible = this.compareVersions(version, tool.minimumVersion) >= 0;
                    status.compatible = compatible;

                    if (!compatible) {
                        status.issues.push(`Version ${version} is below minimum required ${tool.minimumVersion}`);
                        status.recommendations.push(`Update ${tool.displayName} to version ${tool.minimumVersion} or higher`);
                    }
                } else {
                    status.compatible = true;
                }
            } else {
                status.issues.push('Could not determine version');
                status.recommendations.push(`Verify ${tool.displayName} installation`);
                status.compatible = false;
            }

        } catch (error) {
            status.issues.push(`Error checking tool: ${(error as Error).message}`);
            status.recommendations.push(`Reinstall ${tool.displayName}`);
        }

        return status;
    }

    /**
     * Find command in system PATH
     */
    private async findCommand(command: string): Promise<string | undefined> {
        return new Promise((resolve) => {
            const isWindows = process.platform === 'win32';
            const cmd = isWindows ? 'where' : 'which';

            exec(`${cmd} ${command}`, (error, stdout) => {
                if (error) {
                    resolve(undefined);
                } else {
                    const path = stdout.trim().split('\n')[0];
                    resolve(path || undefined);
                }
            });
        });
    }

    /**
     * Get tool version
     */
    private async getToolVersion(
        command: string,
        versionCommand?: string,
        versionPattern?: RegExp
    ): Promise<string | undefined> {
        return new Promise((resolve) => {
            const cmd = versionCommand || `${command} --version`;

            exec(cmd, (error, stdout, stderr) => {
                if (error) {
                    resolve(undefined);
                    return;
                }

                const output = stdout || stderr;
                if (versionPattern) {
                    const match = output.match(versionPattern);
                    resolve(match ? match[1] : undefined);
                } else {
                    // Try common version patterns
                    const patterns = [
                        /v?(\d+\.\d+\.\d+)/,
                        /version (\d+\.\d+\.\d+)/i,
                        /(\d+\.\d+\.\d+)/
                    ];

                    for (const pattern of patterns) {
                        const match = output.match(pattern);
                        if (match) {
                            resolve(match[1]);
                            return;
                        }
                    }
                    resolve(undefined);
                }
            });
        });
    }

    /**
     * Compare semantic versions
     */
    private compareVersions(version1: string, version2: string): number {
        const v1Parts = version1.split('.').map(Number);
        const v2Parts = version2.split('.').map(Number);

        for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); i++) {
            const v1Part = v1Parts[i] || 0;
            const v2Part = v2Parts[i] || 0;

            if (v1Part > v2Part) {return 1;}
            if (v1Part < v2Part) {return -1;}
        }

        return 0;
    }

    /**
     * Get installation recommendation for a tool
     */
    private getInstallRecommendation(tool: ToolDependency): string {
        const platform = process.platform;
        const instruction = tool.installInstructions[platform];

        if (instruction) {
            return `Install using ${instruction.method}: ${instruction.command}`;
        }

        return `Install ${tool.displayName} from ${tool.installInstructions.win32?.url || 'official website'}`;
    }

    /**
     * Get tool by name
     */
    public getTool(name: string): ToolDependency | undefined {
        return this.toolDefinitions.find(tool => tool.name === name);
    }

    /**
     * Get all tools by category
     */
    public getToolsByCategory(category: string): ToolDependency[] {
        return this.toolDefinitions.filter(tool => tool.category === category);
    }

    /**
     * Get required tools
     */
    public getRequiredTools(): ToolDependency[] {
        return this.toolDefinitions.filter(tool =>
            tool.required && tool.platforms.includes(process.platform)
        );
    }

    /**
     * Get optional tools
     */
    public getOptionalTools(): ToolDependency[] {
        return this.toolDefinitions.filter(tool =>
            !tool.required && tool.platforms.includes(process.platform)
        );
    }

    /**
     * Generate installation guide
     */
    public generateInstallationGuide(result: DependencyCheckResult): string {
        const platform = result.platformInfo.platform;
        const platformName = this.getPlatformDisplayName(platform);

        let guide = `# FlowCode Tool Installation Guide\n\n`;
        guide += `**Platform**: ${platformName}\n`;
        guide += `**Architecture**: ${result.platformInfo.arch}\n`;
        guide += `**Node.js Version**: ${result.platformInfo.nodeVersion}\n\n`;

        if (result.allSatisfied) {
            guide += `✅ **All required dependencies are satisfied!**\n\n`;
        } else {
            guide += `❌ **Some dependencies need attention**\n\n`;
        }

        // Required missing tools
        if (result.requiredMissing.length > 0) {
            guide += `## 🚨 Required Tools (Missing)\n\n`;
            for (const toolName of result.requiredMissing) {
                const tool = this.getTool(toolName);
                if (tool) {
                    guide += this.formatToolInstallation(tool, platform);
                }
            }
        }

        // Incompatible tools
        if (result.incompatible.length > 0) {
            guide += `## ⚠️ Incompatible Versions\n\n`;
            for (const toolName of result.incompatible) {
                const tool = this.getTool(toolName);
                const status = result.toolStatuses.find(s => s.name === toolName);
                if (tool && status) {
                    guide += `### ${tool.displayName}\n`;
                    guide += `- **Current Version**: ${status.version}\n`;
                    guide += `- **Required Version**: ${tool.minimumVersion}+\n`;
                    guide += `- **Update Command**: ${tool.installInstructions[platform]?.command}\n\n`;
                }
            }
        }

        // Optional missing tools
        if (result.optionalMissing.length > 0) {
            guide += `## 📦 Optional Tools (Recommended)\n\n`;
            for (const toolName of result.optionalMissing) {
                const tool = this.getTool(toolName);
                if (tool) {
                    guide += this.formatToolInstallation(tool, platform);
                }
            }
        }

        // Successfully installed tools
        const installedTools = result.toolStatuses.filter(s => s.installed && s.compatible);
        if (installedTools.length > 0) {
            guide += `## ✅ Installed Tools\n\n`;
            for (const status of installedTools) {
                const tool = this.getTool(status.name);
                if (tool) {
                    guide += `- **${tool.displayName}**: ${status.version} ✅\n`;
                }
            }
            guide += `\n`;
        }

        // Platform-specific notes
        guide += this.getPlatformSpecificNotes(platform);

        return guide;
    }

    /**
     * Format tool installation instructions
     */
    private formatToolInstallation(tool: ToolDependency, platform: NodeJS.Platform): string {
        const instruction = tool.installInstructions[platform];
        let section = `### ${tool.displayName}\n`;
        section += `${tool.description}\n\n`;

        if (instruction) {
            section += `**Installation Method**: ${instruction.method}\n`;
            section += `**Command**: \`${instruction.command}\`\n`;

            if (instruction.url) {
                section += `**Download**: [${instruction.url}](${instruction.url})\n`;
            }

            if (instruction.notes) {
                section += `**Notes**: ${instruction.notes}\n`;
            }
        }

        section += `\n`;
        return section;
    }

    /**
     * Get platform display name
     */
    private getPlatformDisplayName(platform: NodeJS.Platform): string {
        switch (platform) {
            case 'win32': return 'Windows';
            case 'darwin': return 'macOS';
            case 'linux': return 'Linux';
            default: return platform;
        }
    }

    /**
     * Get platform-specific notes
     */
    private getPlatformSpecificNotes(platform: NodeJS.Platform): string {
        let notes = `## Platform-Specific Notes\n\n`;

        switch (platform) {
            case 'win32':
                notes += `### Windows\n`;
                notes += `- Use PowerShell or Command Prompt as Administrator for global installations\n`;
                notes += `- Git Bash is recommended for better shell compatibility\n`;
                notes += `- Windows Defender may interfere with some tools - add exclusions if needed\n`;
                notes += `- Consider using Chocolatey package manager for easier tool management\n\n`;
                break;

            case 'darwin':
                notes += `### macOS\n`;
                notes += `- Xcode Command Line Tools are required for many development tools\n`;
                notes += `- Homebrew is the recommended package manager for development tools\n`;
                notes += `- Some tools may require additional permissions or certificates\n`;
                notes += `- Use \`sudo\` carefully - prefer user-local installations when possible\n\n`;
                break;

            case 'linux':
                notes += `### Linux\n`;
                notes += `- Package manager commands may vary by distribution\n`;
                notes += `- Some tools may require additional development packages\n`;
                notes += `- Global npm installations may require \`sudo\` or npm prefix configuration\n`;
                notes += `- Consider using Node Version Manager (nvm) for Node.js management\n\n`;
                break;
        }

        notes += `## Troubleshooting\n\n`;
        notes += `- Restart your terminal/VS Code after installing tools\n`;
        notes += `- Check PATH environment variable if commands are not found\n`;
        notes += `- Use \`npx\` prefix for npm-installed tools if global installation fails\n`;
        notes += `- Run FlowCode dependency check again after installations\n\n`;

        return notes;
    }
}
