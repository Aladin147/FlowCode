import * as vscode from 'vscode';
import { spawn } from 'child_process';
import { ConfigurationManager } from '../utils/configuration-manager';

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

export class CompanionGuard {
    private disposables: vscode.Disposable[] = [];
    private statusBarItem: vscode.StatusBarItem;
    private isRunning = false;
    private lastResult?: GuardResult;

    constructor(private configManager: ConfigurationManager) {
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            100
        );
        this.statusBarItem.text = "$(sync~spin) FlowCode: Initializing...";
        this.statusBarItem.show();
    }

    public async initialize(): Promise<void> {
        // Set up file watchers for TypeScript/JavaScript and Python
        const watchers = [
            vscode.workspace.createFileSystemWatcher('**/*.ts'),
            vscode.workspace.createFileSystemWatcher('**/*.js'),
            vscode.workspace.createFileSystemWatcher('**/*.py')
        ];

        watchers.forEach(watcher => {
            watcher.onDidChange(() => this.runChecks());
            watcher.onDidCreate(() => this.runChecks());
            watcher.onDidDelete(() => this.runChecks());
            this.disposables.push(watcher);
        });

        // Run initial check
        await this.runChecks();
    }

    public async runChecks(): Promise<GuardResult> {
        if (this.isRunning) {
            return this.lastResult || { passed: false, issues: [], duration: 0 };
        }

        this.isRunning = true;
        const startTime = Date.now();
        
        try {
            this.statusBarItem.text = "$(sync~spin) FlowCode: Checking...";
            
            const issues: GuardIssue[] = [];
            
            // Run lint checks based on file type
            const activeEditor = vscode.window.activeTextEditor;
            if (activeEditor) {
                const filePath = activeEditor.document.uri.fsPath;
                const language = activeEditor.document.languageId;
                
                if (language === 'typescript' || language === 'javascript') {
                    issues.push(...await this.runESLint(filePath));
                    issues.push(...await this.runTSC(filePath));
                } else if (language === 'python') {
                    issues.push(...await this.runRuff(filePath));
                }
                
                // Run basic tests if available
                issues.push(...await this.runTests(filePath));
            }

            const duration = Date.now() - startTime;
            const passed = issues.filter(i => i.severity === 'error').length === 0;
            
            this.lastResult = { passed, issues, duration };
            
            this.updateStatusBar();
            this.showIssues(issues);
            
            return this.lastResult;
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            this.statusBarItem.text = "$(error) FlowCode: Error";
            this.statusBarItem.tooltip = message;
            
            return { passed: false, issues: [], duration: Date.now() - startTime };
        } finally {
            this.isRunning = false;
        }
    }

    private async runESLint(filePath: string): Promise<GuardIssue[]> {
        return new Promise((resolve) => {
            const eslint = spawn('npx', ['eslint', filePath, '--format', 'json'], {
                cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
            });

            let output = '';
            let errorOutput = '';

            eslint.stdout.on('data', (data) => {
                output += data.toString();
            });

            eslint.stderr.on('data', (data) => {
                errorOutput += data.toString();
            });

            eslint.on('close', (code) => {
                if (code === 0) {
                    resolve([]);
                    return;
                }

                try {
                    const results = JSON.parse(output);
                    const issues: GuardIssue[] = [];
                    
                    results.forEach((result: any) => {
                        result.messages.forEach((msg: any) => {
                            issues.push({
                                severity: msg.severity === 2 ? 'error' : 'warning',
                                message: msg.message,
                                file: result.filePath,
                                line: msg.line,
                                column: msg.column,
                                rule: msg.ruleId
                            });
                        });
                    });
                    
                    resolve(issues);
                } catch {
                    resolve([{
                        severity: 'error',
                        message: `ESLint failed: ${errorOutput || output}`,
                        file: filePath
                    }]);
                }
            });
        });
    }

    private async runTSC(filePath: string): Promise<GuardIssue[]> {
        return new Promise((resolve) => {
            const tsc = spawn('npx', ['tsc', '--noEmit', '--pretty', 'false'], {
                cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
            });

            let output = '';

            tsc.stdout.on('data', (data) => {
                output += data.toString();
            });

            tsc.stderr.on('data', (data) => {
                output += data.toString();
            });

            tsc.on('close', (code) => {
                if (code === 0) {
                    resolve([]);
                    return;
                }

                const issues: GuardIssue[] = [];
                const lines = output.split('\n');
                
                lines.forEach(line => {
                    const match = line.match(/(.+)\((\d+),(\d+)\): error TS(\d+): (.+)/);
                    if (match) {
                        issues.push({
                            severity: 'error',
                            message: match[5],
                            file: match[1],
                            line: parseInt(match[2]),
                            column: parseInt(match[3]),
                            rule: `TS${match[4]}`
                        });
                    }
                });
                
                resolve(issues);
            });
        });
    }

    private async runRuff(filePath: string): Promise<GuardIssue[]> {
        return new Promise((resolve) => {
            const ruff = spawn('ruff', ['check', filePath, '--format', 'json'], {
                cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
            });

            let output = '';

            ruff.stdout.on('data', (data) => {
                output += data.toString();
            });

            ruff.on('close', (code) => {
                if (code === 0) {
                    resolve([]);
                    return;
                }

                try {
                    const results = JSON.parse(output);
                    const issues: GuardIssue[] = [];
                    
                    results.forEach((result: any) => {
                        issues.push({
                            severity: 'error',
                            message: result.message,
                            file: result.filename,
                            line: result.location.row,
                            column: result.location.column,
                            rule: result.code
                        });
                    });
                    
                    resolve(issues);
                } catch {
                    resolve([]);
                }
            });
        });
    }

    private async runTests(filePath: string): Promise<GuardIssue[]> {
        // Basic test detection - will be expanded in future versions
        return [];
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

            const uri = vscode.Uri.file(issue.file);
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

    public dispose(): void {
        this.disposables.forEach(d => d.dispose());
        this.statusBarItem.dispose();
    }
}