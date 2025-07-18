import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger';
import { ConfigurationManager } from '../utils/configuration-manager';
import {
    AgenticTask,
    TaskStep,
    AgentAction,
    StepResult,
    StepStatus,
    ValidationResult,
    ApprovalRequest,
    ApprovalResponse,
    ExecutionContext,
    FileChange,
    PerformanceMetrics,
    RiskLevel,
    HumanIntervention
} from '../types/agentic-types';

/**
 * Recovery action for handling execution errors
 */
interface RecoveryAction {
    type: 'retry' | 'skip' | 'modify' | 'abort';
    description: string;
    parameters?: any;
    maxRetries?: number;
}

/**
 * Execution result for internal tracking
 */
interface ExecutionResult {
    success: boolean;
    result?: StepResult;
    error?: Error;
    recoveryAction?: RecoveryAction;
    metrics: PerformanceMetrics;
}

/**
 * Execution Engine
 * 
 * Core component responsible for autonomous execution of agentic tasks.
 * Handles step-by-step execution, validation, error handling, and approval requests.
 */
export class ExecutionEngine {
    private readonly contextLogger = logger.createContextLogger('ExecutionEngine');
    private currentExecution: AgenticTask | null = null;
    private executionHistory: Map<string, ExecutionResult[]> = new Map();
    private approvalCallbacks: Map<string, (response: ApprovalResponse) => void> = new Map();

    constructor(
        private configManager: ConfigurationManager,
        private companionGuard?: any, // Will be properly typed when integrated
        private securityValidator?: any, // Will be properly typed when integrated
        private architectService?: any // Will be properly typed when integrated
    ) {
        this.contextLogger.info('ExecutionEngine initialized');
    }

    /**
     * Resolve file path to absolute path, handling workspace context
     */
    private resolveFilePath(filePath: string): string {
        // Handle absolute paths
        if (path.isAbsolute(filePath)) {
            return filePath;
        }

        // Resolve relative to workspace
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (workspaceRoot) {
            return path.resolve(workspaceRoot, filePath);
        }

        // Fallback to current working directory
        return path.resolve(process.cwd(), filePath);
    }

    /**
     * Handle missing file with user-friendly options
     */
    private async handleMissingFile(filePath: string, action: AgentAction): Promise<StepResult> {
        const fileName = path.basename(filePath);
        const relativePath = this.getRelativePath(filePath);

        this.contextLogger.warn(`File not found: ${filePath} for action: ${action.type}`);

        const choice = await vscode.window.showWarningMessage(
            `File not found: ${relativePath}`,
            'Create File',
            'Select Different File',
            'Skip Step'
        );

        switch (choice) {
            case 'Create File':
                return this.createMissingFile(filePath, action);
            case 'Select Different File':
                return this.promptForFile(action);
            case 'Skip Step':
                return this.skipStep(action, `File not found: ${relativePath}`);
            default:
                throw new Error(`File not found: ${filePath}`);
        }
    }

    /**
     * Get relative path for display purposes
     */
    private getRelativePath(filePath: string): string {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (workspaceRoot && filePath.startsWith(workspaceRoot)) {
            return path.relative(workspaceRoot, filePath);
        }
        return filePath;
    }

    /**
     * Create missing file with basic content
     */
    private async createMissingFile(filePath: string, action: AgentAction): Promise<StepResult> {
        try {
            // Ensure directory exists
            const dir = path.dirname(filePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            // Create file with basic content based on extension
            const ext = path.extname(filePath);
            let content = '';

            switch (ext) {
                case '.ts':
                case '.js':
                    content = '// Created by FlowCode\n\n';
                    break;
                case '.json':
                    content = '{\n  \n}\n';
                    break;
                case '.md':
                    content = `# ${path.basename(filePath, ext)}\n\n`;
                    break;
                default:
                    content = '';
            }

            fs.writeFileSync(filePath, content, 'utf8');

            const change: FileChange = {
                path: filePath,
                type: 'create',
                content
            };

            return {
                success: true,
                output: `Created file: ${this.getRelativePath(filePath)}`,
                changes: [change],
                nextSteps: ['Edit the created file as needed']
            };

        } catch (error) {
            this.contextLogger.error('Failed to create file', error as Error, { filePath });
            throw new Error(`Failed to create file: ${filePath} - ${(error as Error).message}`);
        }
    }

    /**
     * Prompt user to select a different file
     */
    private async promptForFile(action: AgentAction): Promise<StepResult> {
        const fileUri = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            openLabel: 'Select File'
        });

        if (fileUri && fileUri[0]) {
            // Update action with new file path
            action.target = fileUri[0].fsPath;

            return {
                success: true,
                output: `Selected file: ${this.getRelativePath(fileUri[0].fsPath)}`,
                nextSteps: ['Proceeding with selected file']
            };
        } else {
            return this.skipStep(action, 'No file selected');
        }
    }

    /**
     * Skip step with appropriate messaging
     */
    private skipStep(action: AgentAction, reason: string): StepResult {
        return {
            success: false,
            output: `Step skipped: ${reason}`,
            warnings: [`Skipped ${action.type} action: ${reason}`],
            nextSteps: ['Consider resolving the issue and retrying']
        };
    }

    /**
     * Execute a single task step
     */
    public async executeStep(step: TaskStep, context: ExecutionContext): Promise<StepResult> {
        const startTime = Date.now();
        
        try {
            this.contextLogger.info('Executing step', { 
                stepId: step.id, 
                actionType: step.action.type,
                riskLevel: step.riskLevel 
            });

            // Update step status
            step.status = 'executing';
            step.startTime = startTime;

            // Check if approval is required
            if (step.approvalRequired || step.riskLevel === 'high' || step.riskLevel === 'critical') {
                const approved = await this.requestApproval(step.action, context);
                if (!approved) {
                    step.status = 'skipped';
                    return {
                        success: false,
                        output: 'Step skipped - approval denied',
                        warnings: ['User denied approval for this step']
                    };
                }
            }

            // Execute the action based on type
            const result = await this.executeAction(step.action, context);
            
            // Validate the result
            const validationResults = await this.validateStepResult(result, step, context);
            result.validationResults = validationResults;

            // Check for validation failures
            const hasErrors = validationResults.some(v => !v.passed && v.rule.severity === 'error');
            if (hasErrors) {
                step.status = 'failed';
                result.success = false;
                result.warnings = result.warnings || [];
                result.warnings.push('Step failed validation checks');
            } else {
                step.status = 'completed';
                result.success = true;
            }

            // Record metrics
            const endTime = Date.now();
            step.endTime = endTime;
            result.metrics = {
                executionTime: endTime - startTime,
                memoryUsage: process.memoryUsage().heapUsed,
                cpuUsage: 0 // Would implement CPU monitoring
            };

            // Store result
            step.result = result;

            this.contextLogger.info('Step execution completed', {
                stepId: step.id,
                success: result.success,
                duration: result.metrics.executionTime,
                validationResults: validationResults.length
            });

            return result;

        } catch (error) {
            const endTime = Date.now();
            step.status = 'failed';
            step.endTime = endTime;
            step.error = error as Error;

            this.contextLogger.error('Step execution failed', error as Error, { stepId: step.id });

            // Attempt error recovery
            const recoveryAction = await this.handleError(error as Error, context);
            
            const failureResult: StepResult = {
                success: false,
                output: `Step failed: ${(error as Error).message}`,
                metrics: {
                    executionTime: endTime - startTime,
                    memoryUsage: process.memoryUsage().heapUsed,
                    cpuUsage: 0
                },
                warnings: ['Step execution failed'],
                nextSteps: recoveryAction ? [recoveryAction.description] : []
            };

            step.result = failureResult;
            return failureResult;
        }
    }

    /**
     * Execute a specific agent action
     */
    private async executeAction(action: AgentAction, context: ExecutionContext): Promise<StepResult> {
        switch (action.type) {
            case 'analyze_code':
                return this.executeAnalyzeCode(action, context);
            
            case 'create_file':
                return this.executeCreateFile(action, context);
            
            case 'edit_file':
                return this.executeEditFile(action, context);
            
            case 'delete_file':
                return this.executeDeleteFile(action, context);
            
            case 'run_command':
                return this.executeRunCommand(action, context);
            
            case 'validate_security':
                return this.executeValidateSecurity(action, context);
            
            case 'run_tests':
                return this.executeRunTests(action, context);
            
            case 'refactor_code':
                return this.executeRefactorCode(action, context);
            
            case 'generate_documentation':
                return this.executeGenerateDocumentation(action, context);
            
            case 'analyze_dependencies':
                return this.executeAnalyzeDependencies(action, context);
            
            case 'optimize_performance':
                return this.executeOptimizePerformance(action, context);
            
            default:
                throw new Error(`Unsupported action type: ${action.type}`);
        }
    }

    /**
     * Analyze code action implementation
     */
    private async executeAnalyzeCode(action: AgentAction, context: ExecutionContext): Promise<StepResult> {
        const resolvedPath = this.resolveFilePath(action.target);

        if (!fs.existsSync(resolvedPath)) {
            return this.handleMissingFile(resolvedPath, action);
        }

        const content = fs.readFileSync(resolvedPath, 'utf8');
        const analysis = {
            fileSize: content.length,
            lineCount: content.split('\n').length,
            language: path.extname(resolvedPath).substring(1),
            complexity: this.calculateComplexity(content),
            issues: this.findCodeIssues(content)
        };

        return {
            success: true,
            output: analysis,
            nextSteps: analysis.issues.length > 0 ? ['Consider fixing identified issues'] : []
        };
    }

    /**
     * Create file action implementation
     */
    private async executeCreateFile(action: AgentAction, context: ExecutionContext): Promise<StepResult> {
        const resolvedPath = this.resolveFilePath(action.target);
        const content = action.payload.content || '';

        // Check if file already exists
        if (fs.existsSync(resolvedPath)) {
            return {
                success: false,
                output: `File already exists: ${this.getRelativePath(resolvedPath)}`,
                warnings: ['File creation skipped - file already exists']
            };
        }

        // Ensure directory exists
        const dir = path.dirname(resolvedPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        // Create file
        fs.writeFileSync(resolvedPath, content, 'utf8');

        const change: FileChange = {
            path: resolvedPath,
            type: 'create',
            content
        };

        return {
            success: true,
            output: `File created: ${this.getRelativePath(resolvedPath)}`,
            changes: [change],
            nextSteps: ['Review created file', 'Add to version control if needed']
        };
    }

    /**
     * Edit file action implementation
     */
    private async executeEditFile(action: AgentAction, context: ExecutionContext): Promise<StepResult> {
        const resolvedPath = this.resolveFilePath(action.target);

        if (!fs.existsSync(resolvedPath)) {
            return this.handleMissingFile(resolvedPath, action);
        }

        // Backup original content
        const originalContent = fs.readFileSync(resolvedPath, 'utf8');
        const newContent = action.payload.content;

        // Apply changes
        fs.writeFileSync(resolvedPath, newContent, 'utf8');

        const change: FileChange = {
            path: resolvedPath,
            type: 'modify',
            content: newContent,
            backup: originalContent,
            diff: this.generateDiff(originalContent, newContent)
        };

        return {
            success: true,
            output: `File edited: ${this.getRelativePath(resolvedPath)}`,
            changes: [change],
            nextSteps: ['Review changes', 'Test modifications']
        };
    }

    /**
     * Delete file action implementation
     */
    private async executeDeleteFile(action: AgentAction, context: ExecutionContext): Promise<StepResult> {
        const resolvedPath = this.resolveFilePath(action.target);

        if (!fs.existsSync(resolvedPath)) {
            return this.skipStep(action, `File already deleted or not found: ${this.getRelativePath(resolvedPath)}`);
        }

        // Backup content before deletion
        const content = fs.readFileSync(resolvedPath, 'utf8');

        // Delete file
        fs.unlinkSync(resolvedPath);

        const change: FileChange = {
            path: resolvedPath,
            type: 'delete',
            backup: content
        };

        return {
            success: true,
            output: `File deleted: ${this.getRelativePath(resolvedPath)}`,
            changes: [change],
            warnings: ['File has been permanently deleted'],
            nextSteps: ['Verify deletion was intended', 'Update references if needed']
        };
    }

    /**
     * Run command action implementation
     */
    private async executeRunCommand(action: AgentAction, context: ExecutionContext): Promise<StepResult> {
        const command = action.payload.command;
        const workingDir = action.payload.workingDir || context.task.context.workspaceRoot;

        return new Promise((resolve) => {
            const { spawn } = require('child_process');
            const process = spawn(command, { shell: true, cwd: workingDir });
            
            let output = '';
            let error = '';

            process.stdout.on('data', (data: Buffer) => {
                output += data.toString();
            });

            process.stderr.on('data', (data: Buffer) => {
                error += data.toString();
            });

            process.on('close', (code: number) => {
                const success = code === 0;
                resolve({
                    success,
                    output: success ? output : error,
                    warnings: success ? [] : [`Command exited with code ${code}`],
                    nextSteps: success ? [] : ['Review command output', 'Fix any issues']
                });
            });
        });
    }

    /**
     * Validate security action implementation
     */
    private async executeValidateSecurity(action: AgentAction, context: ExecutionContext): Promise<StepResult> {
        // This would integrate with SecurityValidator service
        const validationType = action.payload.validationType || 'general';
        
        // Mock security validation for now
        const issues: string[] = [
            // Would be populated by actual security validation
        ];

        return {
            success: issues.length === 0,
            output: {
                validationType,
                issuesFound: issues.length,
                issues
            },
            warnings: issues.length > 0 ? ['Security issues found'] : [],
            nextSteps: issues.length > 0 ? ['Address security issues'] : []
        };
    }

    /**
     * Run tests action implementation
     */
    private async executeRunTests(action: AgentAction, context: ExecutionContext): Promise<StepResult> {
        const testCommand = action.payload.testCommand || 'npm test';
        return this.executeRunCommand({
            ...action,
            payload: { command: testCommand }
        }, context);
    }

    /**
     * Refactor code action implementation
     */
    private async executeRefactorCode(action: AgentAction, context: ExecutionContext): Promise<StepResult> {
        // This would integrate with ArchitectService
        const filePath = action.target;
        const refactorType = action.payload.refactorType || 'general';

        // Mock refactoring for now
        return {
            success: true,
            output: `Code refactoring completed: ${refactorType}`,
            nextSteps: ['Review refactored code', 'Run tests to verify functionality']
        };
    }

    /**
     * Generate documentation action implementation
     */
    private async executeGenerateDocumentation(action: AgentAction, context: ExecutionContext): Promise<StepResult> {
        const filePath = action.target;
        const docType = action.payload.docType || 'README';

        // Mock documentation generation
        const docContent = `# ${path.basename(filePath, path.extname(filePath))}\n\nGenerated documentation for ${filePath}`;
        const docPath = path.join(path.dirname(filePath), `${docType}.md`);

        fs.writeFileSync(docPath, docContent, 'utf8');

        return {
            success: true,
            output: `Documentation generated: ${docPath}`,
            changes: [{
                path: docPath,
                type: 'create',
                content: docContent
            }],
            nextSteps: ['Review generated documentation', 'Update as needed']
        };
    }

    /**
     * Analyze dependencies action implementation
     */
    private async executeAnalyzeDependencies(action: AgentAction, context: ExecutionContext): Promise<StepResult> {
        // Mock dependency analysis
        const analysis = {
            totalDependencies: 0,
            outdatedDependencies: [],
            vulnerabilities: [],
            recommendations: []
        };

        return {
            success: true,
            output: analysis,
            nextSteps: analysis.vulnerabilities.length > 0 ? ['Address security vulnerabilities'] : []
        };
    }

    /**
     * Optimize performance action implementation
     */
    private async executeOptimizePerformance(action: AgentAction, context: ExecutionContext): Promise<StepResult> {
        // Mock performance optimization
        return {
            success: true,
            output: 'Performance optimization completed',
            nextSteps: ['Measure performance improvements', 'Run benchmarks']
        };
    }

    /**
     * Request approval for risky actions
     */
    private async requestApproval(action: AgentAction, context: ExecutionContext): Promise<boolean> {
        return new Promise((resolve) => {
            const approvalId = `approval-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            
            const request: ApprovalRequest = {
                id: approvalId,
                action,
                reason: `Action requires approval due to ${action.riskLevel} risk level`,
                riskAssessment: {
                    level: action.riskLevel,
                    factors: [`Action type: ${action.type}`, `Target: ${action.target}`],
                    impact: this.getImpactDescription(action),
                    mitigation: this.getMitigationStrategies(action),
                    confidence: 0.8
                },
                status: 'pending',
                timestamp: Date.now()
            };

            // Store callback for when approval is received
            this.approvalCallbacks.set(approvalId, (response: ApprovalResponse) => {
                resolve(response.approved);
            });

            // Show approval dialog to user
            this.showApprovalDialog(request);
        });
    }

    /**
     * Show approval dialog to user
     */
    private async showApprovalDialog(request: ApprovalRequest): Promise<void> {
        const message = `Approval Required: ${request.action.type} on ${request.action.target}`;
        const detail = `Risk Level: ${request.riskAssessment.level}\nReason: ${request.reason}`;
        
        const choice = await vscode.window.showWarningMessage(
            message,
            { detail, modal: true },
            'Approve',
            'Deny',
            'View Details'
        );

        const response: ApprovalResponse = {
            approved: choice === 'Approve',
            feedback: choice === 'Deny' ? 'User denied approval' : undefined,
            timestamp: Date.now()
        };

        // Call the stored callback
        const callback = this.approvalCallbacks.get(request.id);
        if (callback) {
            callback(response);
            this.approvalCallbacks.delete(request.id);
        }
    }

    /**
     * Validate step result
     */
    private async validateStepResult(
        result: StepResult, 
        step: TaskStep, 
        context: ExecutionContext
    ): Promise<ValidationResult[]> {
        const validationResults: ValidationResult[] = [];

        // Run validation rules
        for (const rule of step.action.validation) {
            try {
                const passed = await this.runValidationRule(rule, result, step, context);
                validationResults.push({
                    rule,
                    passed,
                    message: passed ? 'Validation passed' : 'Validation failed',
                    suggestions: passed ? [] : ['Review and fix the issue']
                });
            } catch (error) {
                validationResults.push({
                    rule,
                    passed: false,
                    message: `Validation error: ${(error as Error).message}`,
                    suggestions: ['Fix validation error and retry']
                });
            }
        }

        return validationResults;
    }

    /**
     * Run a specific validation rule
     */
    private async runValidationRule(
        rule: any, 
        result: StepResult, 
        step: TaskStep, 
        context: ExecutionContext
    ): Promise<boolean> {
        // Mock validation - would implement actual validation logic
        switch (rule.type) {
            case 'security':
                return !result.warnings?.some(w => w.includes('security'));
            case 'quality':
                return result.success;
            case 'performance':
                return (result.metrics?.executionTime || 0) < 30000; // 30 seconds
            case 'compliance':
                return true; // Mock compliance check
            default:
                return true;
        }
    }

    /**
     * Handle execution errors
     */
    public async handleError(error: Error, context: ExecutionContext): Promise<RecoveryAction> {
        this.contextLogger.error('Handling execution error', error);

        // Determine recovery action based on error type
        if (error.message.includes('File not found')) {
            return {
                type: 'skip',
                description: 'Skip step due to missing file',
                maxRetries: 0
            };
        }

        if (error.message.includes('Permission denied')) {
            return {
                type: 'modify',
                description: 'Modify step to use different approach',
                parameters: { useAlternativeMethod: true }
            };
        }

        // Default recovery action
        return {
            type: 'retry',
            description: 'Retry step with exponential backoff',
            maxRetries: 3
        };
    }

    // Helper methods
    private calculateComplexity(content: string): number {
        // Simple complexity calculation
        const lines = content.split('\n').length;
        const functions = (content.match(/function|=>/g) || []).length;
        return Math.min(10, Math.floor((lines + functions * 2) / 10));
    }

    private findCodeIssues(content: string): string[] {
        const issues: string[] = [];
        if (content.includes('console.log')) {
            issues.push('Contains console.log statements');
        }
        if (content.includes('TODO')) {
            issues.push('Contains TODO comments');
        }
        return issues;
    }

    private generateDiff(original: string, modified: string): string {
        // Simple diff generation - would use proper diff library
        return `--- Original\n+++ Modified\n@@ -1,${original.split('\n').length} +1,${modified.split('\n').length} @@`;
    }

    private getImpactDescription(action: AgentAction): string {
        switch (action.type) {
            case 'delete_file':
                return 'File will be permanently deleted';
            case 'edit_file':
                return 'File content will be modified';
            case 'run_command':
                return 'System command will be executed';
            default:
                return 'Action will modify the codebase';
        }
    }

    private getMitigationStrategies(action: AgentAction): string[] {
        const strategies: string[] = [];
        
        if (action.type === 'delete_file') {
            strategies.push('Create backup before deletion');
        }
        
        if (action.riskLevel === 'high' || action.riskLevel === 'critical') {
            strategies.push('Require explicit user approval');
            strategies.push('Create rollback plan');
        }
        
        return strategies;
    }
}
