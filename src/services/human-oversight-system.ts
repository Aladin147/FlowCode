import * as vscode from 'vscode';
import { logger } from '../utils/logger';
import { ConfigurationManager } from '../utils/configuration-manager';
import {
    AgenticTask,
    TaskStep,
    AgentAction,
    ApprovalRequest,
    ApprovalResponse,
    HumanIntervention,
    UserFeedback,
    RiskLevel,
    TaskStatus,
    RiskAssessment
} from '../types/agentic-types';

/**
 * Approval workflow configuration
 */
interface ApprovalWorkflow {
    id: string;
    name: string;
    riskLevels: RiskLevel[];
    actionTypes: string[];
    autoApprovalEnabled: boolean;
    timeoutMs: number;
    escalationEnabled: boolean;
    requiredApprovers: number;
}

/**
 * Progress notification configuration
 */
interface ProgressNotification {
    taskId: string;
    message: string;
    progress: number;
    timestamp: number;
    type: 'info' | 'warning' | 'error' | 'success';
}

/**
 * Intervention context for user actions
 */
interface InterventionContext {
    task: AgenticTask;
    currentStep?: TaskStep;
    reason: string;
    suggestedActions: string[];
    urgency: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Human Oversight System
 * 
 * Manages human-in-the-loop interactions for the agentic system:
 * - Approval workflows for risky actions
 * - Progress display and notifications
 * - User intervention handling
 * - Feedback collection and processing
 */
export class HumanOversightSystem {
    private readonly contextLogger = logger.createContextLogger('HumanOversightSystem');
    private activeApprovals: Map<string, ApprovalRequest> = new Map();
    private approvalWorkflows: Map<string, ApprovalWorkflow> = new Map();
    private progressPanel: vscode.WebviewPanel | null = null;
    private interventionCallbacks: Map<string, (intervention: HumanIntervention) => void> = new Map();

    constructor(private configManager: ConfigurationManager) {
        this.initializeDefaultWorkflows();
        this.contextLogger.info('HumanOversightSystem initialized');
    }

    /**
     * Request approval for an agent action
     */
    public async requestApproval(
        action: AgentAction,
        task: AgenticTask,
        riskAssessment: RiskAssessment
    ): Promise<ApprovalResponse> {
        const approvalId = `approval-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        const request: ApprovalRequest = {
            id: approvalId,
            action,
            reason: `Action requires approval due to ${riskAssessment.level} risk level`,
            riskAssessment,
            status: 'pending',
            timestamp: Date.now()
        };

        this.activeApprovals.set(approvalId, request);

        this.contextLogger.info('Approval requested', {
            approvalId,
            actionType: action.type,
            riskLevel: riskAssessment.level,
            target: action.target
        });

        // Determine appropriate workflow
        const workflow = this.getApprovalWorkflow(action, riskAssessment);
        
        // Check for auto-approval
        if (workflow.autoApprovalEnabled && this.canAutoApprove(action, riskAssessment)) {
            const response: ApprovalResponse = {
                approved: true,
                feedback: 'Auto-approved based on workflow configuration',
                timestamp: Date.now()
            };
            
            request.status = 'approved';
            request.response = response;
            
            this.contextLogger.info('Action auto-approved', { approvalId });
            return response;
        }

        // Show approval dialog to user
        return this.showApprovalDialog(request, workflow, task);
    }

    /**
     * Show progress for a task
     */
    public async showProgress(task: AgenticTask): Promise<void> {
        try {
            if (!this.progressPanel) {
                this.createProgressPanel();
            }

            if (this.progressPanel) {
                const html = this.generateProgressHTML(task);
                this.progressPanel.webview.html = html;
                this.progressPanel.reveal(vscode.ViewColumn.Beside);
            }

            this.contextLogger.info('Progress displayed', {
                taskId: task.id,
                progress: task.progress.percentComplete
            });
        } catch (error) {
            this.contextLogger.error('Failed to show progress', error as Error);
        }
    }

    /**
     * Handle user intervention
     */
    public async handleIntervention(
        task: AgenticTask,
        interventionType: HumanIntervention['type'],
        reason: string,
        instructions?: string
    ): Promise<HumanIntervention> {
        const intervention: HumanIntervention = {
            id: `intervention-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            type: interventionType,
            reason,
            instructions,
            timestamp: Date.now()
        };

        // Add intervention to task
        task.interventions.push(intervention);

        // Handle different intervention types
        switch (interventionType) {
            case 'pause':
                await this.pauseTask(task, intervention);
                break;
            case 'modify':
                await this.modifyTask(task, intervention);
                break;
            case 'cancel':
                await this.cancelTask(task, intervention);
                break;
            case 'redirect':
                await this.redirectTask(task, intervention);
                break;
        }

        this.contextLogger.info('Intervention handled', {
            taskId: task.id,
            type: interventionType,
            reason
        });

        return intervention;
    }

    /**
     * Escalate issue to user
     */
    public async escalateIssue(
        task: AgenticTask,
        issue: string,
        context: InterventionContext
    ): Promise<void> {
        const message = `Task Escalation Required: ${issue}`;
        const detail = `Task: ${task.goal}\nReason: ${context.reason}\nUrgency: ${context.urgency}`;

        const actions = ['Pause Task', 'Modify Task', 'Cancel Task', 'Continue'];
        const choice = await vscode.window.showErrorMessage(
            message,
            { detail, modal: true },
            ...actions
        );

        if (choice) {
            let interventionType: HumanIntervention['type'];
            switch (choice) {
                case 'Pause Task':
                    interventionType = 'pause';
                    break;
                case 'Modify Task':
                    interventionType = 'modify';
                    break;
                case 'Cancel Task':
                    interventionType = 'cancel';
                    break;
                default:
                    return; // Continue without intervention
            }

            await this.handleIntervention(task, interventionType, issue);
        }

        this.contextLogger.info('Issue escalated', {
            taskId: task.id,
            issue,
            urgency: context.urgency,
            userChoice: choice
        });
    }

    /**
     * Collect user feedback
     */
    public async collectFeedback(task: AgenticTask): Promise<UserFeedback | null> {
        try {
            const panel = vscode.window.createWebviewPanel(
                'flowcode-feedback',
                'Task Feedback',
                vscode.ViewColumn.One,
                { enableScripts: true }
            );

            const html = this.generateFeedbackHTML(task);
            panel.webview.html = html;

            return new Promise((resolve) => {
                panel.webview.onDidReceiveMessage(
                    (message) => {
                        if (message.command === 'submitFeedback') {
                            const feedback: UserFeedback = {
                                rating: message.rating,
                                comments: message.comments,
                                suggestions: message.suggestions ? [message.suggestions] : [],
                                wouldUseAgain: message.wouldUseAgain,
                                timestamp: Date.now()
                            };
                            
                            panel.dispose();
                            resolve(feedback);
                        } else if (message.command === 'cancel') {
                            panel.dispose();
                            resolve(null);
                        }
                    }
                );

                panel.onDidDispose(() => {
                    resolve(null);
                });
            });
        } catch (error) {
            this.contextLogger.error('Failed to collect feedback', error as Error);
            return null;
        }
    }

    /**
     * Show approval dialog
     */
    private async showApprovalDialog(
        request: ApprovalRequest,
        workflow: ApprovalWorkflow,
        task: AgenticTask
    ): Promise<ApprovalResponse> {
        const action = request.action;
        const risk = request.riskAssessment;

        const message = `Approval Required: ${action.type}`;
        const detail = [
            `Target: ${action.target}`,
            `Risk Level: ${risk.level}`,
            `Impact: ${risk.impact}`,
            `Confidence: ${Math.round(risk.confidence * 100)}%`,
            ``,
            `Risk Factors:`,
            ...risk.factors.map(f => `• ${f}`),
            ``,
            `Mitigation:`,
            ...risk.mitigation.map(m => `• ${m}`)
        ].join('\n');

        const choice = await vscode.window.showWarningMessage(
            message,
            { detail, modal: true },
            'Approve',
            'Deny',
            'View Details',
            'Modify Action'
        );

        const response: ApprovalResponse = {
            approved: choice === 'Approve',
            feedback: choice === 'Deny' ? 'User denied approval' : 
                     choice === 'Modify Action' ? 'User requested modification' : undefined,
            timestamp: Date.now()
        };

        // Update request status
        request.status = response.approved ? 'approved' : 'rejected';
        request.response = response;

        this.contextLogger.info('Approval response received', {
            approvalId: request.id,
            approved: response.approved,
            choice
        });

        return response;
    }

    /**
     * Create progress panel
     */
    private createProgressPanel(): void {
        this.progressPanel = vscode.window.createWebviewPanel(
            'flowcode-progress',
            'FlowCode Agent Progress',
            vscode.ViewColumn.Beside,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        this.progressPanel.onDidDispose(() => {
            this.progressPanel = null;
        });

        this.progressPanel.webview.onDidReceiveMessage((message) => {
            if (message.command === 'pauseTask') {
                // Handle pause request
                this.contextLogger.info('User requested task pause');
            } else if (message.command === 'cancelTask') {
                // Handle cancel request
                this.contextLogger.info('User requested task cancellation');
            }
        });
    }

    /**
     * Generate progress HTML
     */
    private generateProgressHTML(task: AgenticTask): string {
        const progress = task.progress;
        const currentStep = task.steps.find(s => s.status === 'executing');
        
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Agent Progress</title>
                <style>
                    body { font-family: var(--vscode-font-family); padding: 20px; }
                    .progress-container { margin: 20px 0; }
                    .progress-bar { width: 100%; height: 20px; background: var(--vscode-progressBar-background); border-radius: 10px; overflow: hidden; }
                    .progress-fill { height: 100%; background: var(--vscode-progressBar-foreground); transition: width 0.3s ease; }
                    .step-list { margin: 20px 0; }
                    .step-item { padding: 10px; margin: 5px 0; border-radius: 5px; }
                    .step-completed { background: var(--vscode-testing-iconPassed); color: white; }
                    .step-executing { background: var(--vscode-testing-iconQueued); color: white; }
                    .step-pending { background: var(--vscode-button-secondaryBackground); }
                    .step-failed { background: var(--vscode-testing-iconFailed); color: white; }
                    .controls { margin: 20px 0; }
                    .button { padding: 8px 16px; margin: 5px; border: none; border-radius: 3px; cursor: pointer; }
                    .button-primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
                    .button-secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
                </style>
            </head>
            <body>
                <h2>🤖 Agent Progress</h2>
                <h3>${task.goal}</h3>
                
                <div class="progress-container">
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${progress.percentComplete}%"></div>
                    </div>
                    <p>${progress.percentComplete}% Complete (${progress.completedSteps}/${progress.totalSteps} steps)</p>
                </div>

                <div class="step-list">
                    <h4>Steps:</h4>
                    ${task.steps.map(step => `
                        <div class="step-item step-${step.status}">
                            <strong>${step.action.type}</strong>: ${step.description}
                            ${step.status === 'executing' ? ' (Current)' : ''}
                            ${step.status === 'failed' && step.error ? ` - Error: ${step.error.message}` : ''}
                        </div>
                    `).join('')}
                </div>

                <div class="controls">
                    <button class="button button-secondary" onclick="pauseTask()">⏸️ Pause</button>
                    <button class="button button-secondary" onclick="cancelTask()">❌ Cancel</button>
                </div>

                <script>
                    const vscode = acquireVsCodeApi();
                    
                    function pauseTask() {
                        vscode.postMessage({ command: 'pauseTask', taskId: '${task.id}' });
                    }
                    
                    function cancelTask() {
                        vscode.postMessage({ command: 'cancelTask', taskId: '${task.id}' });
                    }
                </script>
            </body>
            </html>
        `;
    }

    /**
     * Generate feedback HTML
     */
    private generateFeedbackHTML(task: AgenticTask): string {
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Task Feedback</title>
                <style>
                    body { font-family: var(--vscode-font-family); padding: 20px; }
                    .form-group { margin: 15px 0; }
                    label { display: block; margin-bottom: 5px; font-weight: bold; }
                    input, textarea, select { width: 100%; padding: 8px; border: 1px solid var(--vscode-input-border); background: var(--vscode-input-background); color: var(--vscode-input-foreground); }
                    textarea { height: 100px; resize: vertical; }
                    .rating { display: flex; gap: 10px; }
                    .star { font-size: 24px; cursor: pointer; color: var(--vscode-descriptionForeground); }
                    .star.active { color: gold; }
                    .buttons { margin: 20px 0; }
                    .button { padding: 10px 20px; margin: 5px; border: none; border-radius: 3px; cursor: pointer; }
                    .button-primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
                    .button-secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
                </style>
            </head>
            <body>
                <h2>📝 Task Feedback</h2>
                <p><strong>Task:</strong> ${task.goal}</p>
                <p><strong>Status:</strong> ${task.status}</p>
                
                <form id="feedbackForm">
                    <div class="form-group">
                        <label>How would you rate this task execution?</label>
                        <div class="rating" id="rating">
                            <span class="star" data-rating="1">⭐</span>
                            <span class="star" data-rating="2">⭐</span>
                            <span class="star" data-rating="3">⭐</span>
                            <span class="star" data-rating="4">⭐</span>
                            <span class="star" data-rating="5">⭐</span>
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label for="comments">Comments:</label>
                        <textarea id="comments" placeholder="Share your thoughts about the task execution..."></textarea>
                    </div>
                    
                    <div class="form-group">
                        <label for="suggestions">Suggestions for improvement:</label>
                        <textarea id="suggestions" placeholder="How could the agent do better next time?"></textarea>
                    </div>
                    
                    <div class="form-group">
                        <label for="wouldUseAgain">Would you use the agent for similar tasks again?</label>
                        <select id="wouldUseAgain">
                            <option value="true">Yes</option>
                            <option value="false">No</option>
                        </select>
                    </div>
                    
                    <div class="buttons">
                        <button type="button" class="button button-primary" onclick="submitFeedback()">Submit Feedback</button>
                        <button type="button" class="button button-secondary" onclick="cancel()">Cancel</button>
                    </div>
                </form>

                <script>
                    const vscode = acquireVsCodeApi();
                    let selectedRating = 0;
                    
                    // Handle star rating
                    document.querySelectorAll('.star').forEach(star => {
                        star.addEventListener('click', function() {
                            selectedRating = parseInt(this.dataset.rating);
                            updateStars();
                        });
                    });
                    
                    function updateStars() {
                        document.querySelectorAll('.star').forEach((star, index) => {
                            star.classList.toggle('active', index < selectedRating);
                        });
                    }
                    
                    function submitFeedback() {
                        if (selectedRating === 0) {
                            alert('Please select a rating');
                            return;
                        }
                        
                        vscode.postMessage({
                            command: 'submitFeedback',
                            rating: selectedRating,
                            comments: document.getElementById('comments').value,
                            suggestions: document.getElementById('suggestions').value,
                            wouldUseAgain: document.getElementById('wouldUseAgain').value === 'true'
                        });
                    }
                    
                    function cancel() {
                        vscode.postMessage({ command: 'cancel' });
                    }
                </script>
            </body>
            </html>
        `;
    }

    // Task intervention methods
    private async pauseTask(task: AgenticTask, intervention: HumanIntervention): Promise<void> {
        task.status = 'paused';
        this.contextLogger.info('Task paused by user', { taskId: task.id });
    }

    private async modifyTask(task: AgenticTask, intervention: HumanIntervention): Promise<void> {
        // Task modification would be handled by TaskPlanningEngine
        this.contextLogger.info('Task modification requested', { taskId: task.id });
    }

    private async cancelTask(task: AgenticTask, intervention: HumanIntervention): Promise<void> {
        task.status = 'cancelled';
        this.contextLogger.info('Task cancelled by user', { taskId: task.id });
    }

    private async redirectTask(task: AgenticTask, intervention: HumanIntervention): Promise<void> {
        // Task redirection would involve creating a new task
        this.contextLogger.info('Task redirection requested', { taskId: task.id });
    }

    // Helper methods
    private initializeDefaultWorkflows(): void {
        const defaultWorkflow: ApprovalWorkflow = {
            id: 'default',
            name: 'Default Approval Workflow',
            riskLevels: ['medium', 'high', 'critical'],
            actionTypes: ['delete_file', 'run_command', 'edit_file'],
            autoApprovalEnabled: false,
            timeoutMs: 300000, // 5 minutes
            escalationEnabled: true,
            requiredApprovers: 1
        };

        this.approvalWorkflows.set('default', defaultWorkflow);
    }

    private getApprovalWorkflow(action: AgentAction, risk: RiskAssessment): ApprovalWorkflow {
        // For now, return default workflow
        return this.approvalWorkflows.get('default')!;
    }

    private canAutoApprove(action: AgentAction, risk: RiskAssessment): boolean {
        // Auto-approve only low-risk actions
        return risk.level === 'low' && !['delete_file', 'run_command'].includes(action.type);
    }

    /**
     * Cleanup resources
     */
    public dispose(): void {
        if (this.progressPanel) {
            this.progressPanel.dispose();
        }
        this.contextLogger.info('HumanOversightSystem disposed');
    }
}
