import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import { ESLint } from 'eslint';
import * as ts from 'typescript';
import * as fs from 'fs';
import * as path from 'path';

export interface LintingTask {
    id: string;
    type: 'eslint' | 'typescript' | 'ruff';
    filePath: string;
    workspaceRoot: string;
    options?: any;
}

export interface LintingResult {
    id: string;
    success: boolean;
    issues: Array<{
        line: number;
        column: number;
        severity: 'error' | 'warning';
        message: string;
        rule: string;
    }>;
    duration: number;
    error?: string;
}

// Worker thread implementation
if (!isMainThread && parentPort) {
    let eslintInstance: ESLint | null = null;
    
    const initializeESLint = async (workspaceRoot: string): Promise<void> => {
        if (eslintInstance) return;
        
        try {
            eslintInstance = new ESLint({
                cwd: workspaceRoot,
                fix: false,
                errorOnUnmatchedPattern: false,
                ignore: true,
                cache: true,
                cacheLocation: path.join(workspaceRoot, '.eslintcache')
            });
        } catch (error) {
            throw new Error(`Failed to initialize ESLint: ${(error as Error).message}`);
        }
    };

    const runESLint = async (filePath: string, workspaceRoot: string): Promise<LintingResult['issues']> => {
        if (!fs.existsSync(filePath)) {
            return [];
        }

        await initializeESLint(workspaceRoot);
        if (!eslintInstance) {
            throw new Error('ESLint not initialized');
        }

        const isPathIgnored = await eslintInstance.isPathIgnored(filePath);
        if (isPathIgnored) {
            return [];
        }

        const results = await eslintInstance.lintFiles([filePath]);
        const issues: LintingResult['issues'] = [];

        results.forEach(result => {
            if (result.messages && result.messages.length > 0) {
                result.messages.forEach(message => {
                    if (message.fatal && message.ruleId === null) {
                        return; // Skip parsing errors
                    }

                    issues.push({
                        line: message.line || 1,
                        column: message.column || 1,
                        severity: message.severity === 2 ? 'error' : 'warning',
                        message: message.message,
                        rule: message.ruleId || 'eslint'
                    });
                });
            }
        });

        return issues;
    };

    const runTypeScript = async (filePath: string, workspaceRoot: string): Promise<LintingResult['issues']> => {
        if (!fs.existsSync(filePath)) {
            return [];
        }

        const ext = path.extname(filePath);
        if (!['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
            return [];
        }

        const configPath = path.join(workspaceRoot, 'tsconfig.json');
        let parsedConfig: ts.ParsedCommandLine;

        if (fs.existsSync(configPath)) {
            const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
            if (configFile.error) {
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

        const program = ts.createProgram([filePath], {
            ...parsedConfig.options,
            noEmit: true,
            skipLibCheck: true,
            incremental: false
        });

        const sourceFile = program.getSourceFile(filePath);
        if (!sourceFile) {
            return [];
        }

        const diagnostics = [
            ...program.getSyntacticDiagnostics(sourceFile),
            ...program.getSemanticDiagnostics(sourceFile)
        ];

        const issues: LintingResult['issues'] = [];
        diagnostics.forEach(diagnostic => {
            if (diagnostic.file && diagnostic.start !== undefined) {
                const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
                const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');

                // Filter out some noisy diagnostics
                if (diagnostic.code === 2307 && message.includes('Cannot find module')) {
                    return;
                }

                issues.push({
                    line: line + 1,
                    column: character + 1,
                    severity: diagnostic.category === ts.DiagnosticCategory.Error ? 'error' : 'warning',
                    message,
                    rule: `TS${diagnostic.code}`
                });
            }
        });

        return issues;
    };

    const runRuff = async (filePath: string, workspaceRoot: string): Promise<LintingResult['issues']> => {
        // For now, return empty array since Ruff requires subprocess
        // This can be enhanced later with a Python bridge or alternative
        return [];
    };

    // Message handler
    parentPort.on('message', async (task: LintingTask) => {
        const startTime = Date.now();
        let result: LintingResult;

        try {
            let issues: LintingResult['issues'] = [];

            switch (task.type) {
                case 'eslint':
                    issues = await runESLint(task.filePath, task.workspaceRoot);
                    break;
                case 'typescript':
                    issues = await runTypeScript(task.filePath, task.workspaceRoot);
                    break;
                case 'ruff':
                    issues = await runRuff(task.filePath, task.workspaceRoot);
                    break;
                default:
                    throw new Error(`Unknown task type: ${task.type}`);
            }

            result = {
                id: task.id,
                success: true,
                issues,
                duration: Date.now() - startTime
            };
        } catch (error) {
            result = {
                id: task.id,
                success: false,
                issues: [],
                duration: Date.now() - startTime,
                error: (error as Error).message
            };
        }

        parentPort!.postMessage(result);
    });
}

// Main thread worker pool manager
export class LintingWorkerPool {
    private workers: Worker[] = [];
    private taskQueue: Map<string, { resolve: (result: LintingResult) => void; reject: (error: Error) => void }> = new Map();
    private workerIndex = 0;
    private readonly maxWorkers: number;

    constructor(maxWorkers: number = 2) {
        this.maxWorkers = Math.min(maxWorkers, require('os').cpus().length);
        this.initializeWorkers();
    }

    private initializeWorkers(): void {
        for (let i = 0; i < this.maxWorkers; i++) {
            const worker = new Worker(__filename);
            
            worker.on('message', (result: LintingResult) => {
                const pending = this.taskQueue.get(result.id);
                if (pending) {
                    this.taskQueue.delete(result.id);
                    if (result.success) {
                        pending.resolve(result);
                    } else {
                        pending.reject(new Error(result.error || 'Worker task failed'));
                    }
                }
            });

            worker.on('error', (error) => {
                console.error('Worker error:', error);
                // Handle worker errors by restarting the worker
                this.restartWorker(i);
            });

            this.workers[i] = worker;
        }
    }

    private restartWorker(index: number): void {
        if (this.workers[index]) {
            this.workers[index].terminate();
        }
        
        const worker = new Worker(__filename);
        worker.on('message', (result: LintingResult) => {
            const pending = this.taskQueue.get(result.id);
            if (pending) {
                this.taskQueue.delete(result.id);
                if (result.success) {
                    pending.resolve(result);
                } else {
                    pending.reject(new Error(result.error || 'Worker task failed'));
                }
            }
        });

        worker.on('error', (error) => {
            console.error('Worker error:', error);
            this.restartWorker(index);
        });

        this.workers[index] = worker;
    }

    public async runTask(task: Omit<LintingTask, 'id'>): Promise<LintingResult> {
        const taskWithId: LintingTask = {
            ...task,
            id: `${task.type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        };

        return new Promise((resolve, reject) => {
            this.taskQueue.set(taskWithId.id, { resolve, reject });
            
            // Round-robin worker selection
            const worker = this.workers[this.workerIndex];
            this.workerIndex = (this.workerIndex + 1) % this.maxWorkers;
            
            worker.postMessage(taskWithId);
        });
    }

    public async dispose(): Promise<void> {
        await Promise.all(this.workers.map(worker => worker.terminate()));
        this.workers = [];
        this.taskQueue.clear();
    }
}
