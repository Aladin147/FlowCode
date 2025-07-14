import * as vscode from 'vscode';
import { spawn } from 'child_process';
import { ConfigurationManager } from '../utils/configuration-manager';

export interface HotfixRecord {
    id: string;
    message: string;
    timestamp: string;
    branch: string;
    files: string[];
    skippedChecks: string[];
    status: 'pending' | 'resolved' | 'overdue';
}

export class HotfixService {
    constructor(private configManager: ConfigurationManager) {}

    public async createHotfix(message: string): Promise<void> {
        const workspaceRoot = await this.configManager.getWorkspaceRoot();
        
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Creating hotfix...",
            cancellable: false
        }, async () => {
            try {
                // Create hotfix branch
                const branchName = `hotfix/${Date.now()}`;
                await this.createBranch(workspaceRoot, branchName);
                
                // Get changed files
                const changedFiles = await this.getChangedFiles(workspaceRoot);
                
                // Run minimal checks
                const skippedChecks = await this.runMinimalChecks(workspaceRoot, changedFiles);
                
                // Create commit
                await this.createCommit(workspaceRoot, `HOTFIX: ${message}`);
                
                // Record hotfix
                const record: HotfixRecord = {
                    id: `hotfix-${Date.now()}`,
                    message,
                    timestamp: new Date().toISOString(),
                    branch: branchName,
                    files: changedFiles,
                    skippedChecks,
                    status: 'pending'
                };
                
                await this.saveHotfixRecord(record);
                
                vscode.window.showInformationMessage(
                    `Hotfix created: ${message}. Debt recorded for 48h resolution.`
                );
                
            } catch (error) {
                throw new Error(`Failed to create hotfix: ${error}`);
            }
        });
    }

    public async getPendingHotfixes(): Promise<HotfixRecord[]> {
        try {
            const debtFile = await this.configManager.getDebtFilePath();
            const fs = await import('fs');
            
            if (!fs.existsSync(debtFile)) {
                return [];
            }
            
            const content = fs.readFileSync(debtFile, 'utf-8');
            const records: HotfixRecord[] = JSON.parse(content);
            
            // Update status based on 48h SLA
            const now = new Date();
            const slaHours = 48;
            
            return records.map(record => {
                const created = new Date(record.timestamp);
                const hoursSinceCreation = (now.getTime() - created.getTime()) / (1000 * 60 * 60);
                
                return {
                    ...record,
                    status: hoursSinceCreation > slaHours ? 'overdue' : record.status
                };
            });
        } catch (error) {
            console.error('Failed to load hotfix records:', error);
            return [];
        }
    }

    public async resolveHotfix(hotfixId: string): Promise<void> {
        const hotfixes = await this.getPendingHotfixes();
        const updatedHotfixes = hotfixes.map(hotfix => 
            hotfix.id === hotfixId 
                ? { ...hotfix, status: 'resolved' as const }
                : hotfix
        );
        
        await this.saveHotfixRecords(updatedHotfixes);
    }

    private async createBranch(workspaceRoot: string, branchName: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const git = spawn('git', ['checkout', '-b', branchName], {
                cwd: workspaceRoot
            });

            git.on('close', (code: number) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`Failed to create branch ${branchName}`));
                }
            });
        });
    }

    private async getChangedFiles(workspaceRoot: string): Promise<string[]> {
        return new Promise((resolve, reject) => {
            const git = spawn('git', ['diff', '--name-only'], {
                cwd: workspaceRoot
            });

            let output = '';
            git.stdout.on('data', (data: any) => {
                output += data.toString();
            });

            git.on('close', (code: number) => {
                if (code === 0) {
                    resolve(output.split('\n').filter(f => f.trim()));
                } else {
                    resolve([]);
                }
            });
        });
    }

    private async runMinimalChecks(workspaceRoot: string, files: string[]): Promise<string[]> {
        const skippedChecks: string[] = [];
        
        // Check if we can run syntax validation
        const hasTypeScriptFiles = files.some(f => f.endsWith('.ts') || f.endsWith('.tsx'));
        const hasJavaScriptFiles = files.some(f => f.endsWith('.js') || f.endsWith('.jsx'));
        const hasPythonFiles = files.some(f => f.endsWith('.py'));
        
        if (hasTypeScriptFiles || hasJavaScriptFiles) {
            // Run basic syntax check
            const syntaxValid = await this.checkSyntax(workspaceRoot, files);
            if (!syntaxValid) {
                skippedChecks.push('full-lint');
            }
        }
        
        if (hasPythonFiles) {
            // Run basic Python syntax check
            const syntaxValid = await this.checkPythonSyntax(workspaceRoot, files);
            if (!syntaxValid) {
                skippedChecks.push('ruff-check');
            }
        }
        
        return skippedChecks;
    }

    private async checkSyntax(workspaceRoot: string, files: string[]): Promise<boolean> {
        return new Promise((resolve) => {
            const hasTypeScript = files.some(f => f.endsWith('.ts') || f.endsWith('.tsx'));
            
            if (hasTypeScript) {
                const tsc = spawn('npx', ['tsc', '--noEmit'], {
                    cwd: workspaceRoot
                });
                
                tsc.on('close', (code: number) => {
                    resolve(code === 0);
                });
            } else {
                // For JavaScript, we'll skip detailed checks in hotfix mode
                resolve(true);
            }
        });
    }

    private async checkPythonSyntax(workspaceRoot: string, files: string[]): Promise<boolean> {
        return new Promise((resolve) => {
            const pythonFiles = files.filter(f => f.endsWith('.py'));
            if (pythonFiles.length === 0) {
                resolve(true);
                return;
            }
            
            const python = spawn('python', ['-m', 'py_compile', ...pythonFiles], {
                cwd: workspaceRoot
            });
            
            python.on('close', (code: number) => {
                resolve(code === 0);
            });
        });
    }

    private async createCommit(workspaceRoot: string, message: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const git = spawn('git', ['commit', '-am', message], {
                cwd: workspaceRoot
            });

            git.on('close', (code: number) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error('Failed to create commit'));
                }
            });
        });
    }

    private async saveHotfixRecord(record: HotfixRecord): Promise<void> {
        const records = await this.getPendingHotfixes();
        records.push(record);
        await this.saveHotfixRecords(records);
    }

    private async saveHotfixRecords(records: HotfixRecord[]): Promise<void> {
        const debtFile = await this.configManager.getDebtFilePath();
        const fs = await import('fs');
        const path = await import('path');
        
        // Ensure directory exists
        const dir = path.dirname(debtFile);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        
        fs.writeFileSync(debtFile, JSON.stringify(records, null, 2));
    }
}