import * as vscode from 'vscode';
import { logger } from '../utils/logger';
import { AgenticOrchestrator } from '../services/agentic-orchestrator';
import { AgentStateManager } from '../services/agent-state-manager';
import { HumanOversightSystem } from '../services/human-oversight-system';
import { AgenticTask, TaskStep } from '../types/agentic-types';

export interface GoalTemplate {
    id: string;
    title: string;
    description: string;
    template: string;
    category: 'development' | 'testing' | 'refactoring' | 'analysis' | 'documentation';
    complexity: 'simple' | 'moderate' | 'complex';
    estimatedTime: string;
}

export class GoalExecutionPanel {
    private panel: vscode.WebviewPanel | undefined;
    private contextLogger = logger.createContextLogger('GoalExecutionPanel');
    private currentExecution: AgenticTask | null = null;
    private progressUpdateInterval: NodeJS.Timeout | undefined;

    constructor(
        private context: vscode.ExtensionContext,
        private agenticOrchestrator: AgenticOrchestrator,
        private agentStateManager: AgentStateManager,
        private humanOversightSystem: HumanOversightSystem
    ) {}

    /**
     * Show goal execution panel
     */
    public async show(): Promise<void> {
        try {
            if (this.panel) {
                this.panel.reveal(vscode.ViewColumn.One);
                return;
            }

            this.panel = vscode.window.createWebviewPanel(
                'goalExecution',
                'FlowCode Goal Execution',
                vscode.ViewColumn.One,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true,
                    localResourceRoots: [this.context.extensionUri]
                }
            );

            // Handle panel disposal
            this.panel.onDidDispose(() => {
                this.panel = undefined;
                this.stopProgressUpdates();
            });

            // Handle messages from webview
            this.panel.webview.onDidReceiveMessage(async (message: any) => {
                await this.handleWebviewMessage(message);
            });

            // Set initial content
            this.panel.webview.html = this.getWebviewContent();

            this.contextLogger.info('Goal execution panel opened');
        } catch (error) {
            this.contextLogger.error('Failed to show goal execution panel', error as Error);
            vscode.window.showErrorMessage('Failed to open goal execution panel');
        }
    }

    /**
     * Handle messages from webview
     */
    private async handleWebviewMessage(message: any): Promise<void> {
        switch (message.command) {
            case 'executeGoal':
                await this.executeGoal(message.goal, message.options);
                break;

            case 'pauseExecution':
                await this.pauseExecution();
                break;

            case 'cancelExecution':
                await this.cancelExecution();
                break;

            case 'approveStep':
                await this.approveStep(message.stepId, message.approved);
                break;

            case 'useTemplate':
                await this.useTemplate(message.templateId);
                break;

            case 'refresh':
                this.updateContent();
                break;

            default:
                this.contextLogger.warn('Unknown webview message command', new Error(`Unknown command: ${message.command}`));
        }
    }

    /**
     * Execute a goal with enhanced workflow
     */
    private async executeGoal(goal: string, options: any = {}): Promise<void> {
        try {
            this.contextLogger.info('Starting goal execution', { goal: goal.substring(0, 100) });

            // Start progress updates
            this.startProgressUpdates();

            // Execute goal using orchestrator
            const result = await this.agenticOrchestrator.executeGoal(goal);
            
            // Stop progress updates
            this.stopProgressUpdates();

            // Update UI with final results
            this.updateContent();

            // Show completion notification
            const message = result.success
                ? `✅ Goal completed successfully! Completed ${result.completedSteps} steps in ${Math.round(result.totalDuration / 1000)}s`
                : `⚠️ Goal partially completed. ${result.completedSteps} steps completed, ${result.failedSteps} failed`;

            if (result.success) {
                vscode.window.showInformationMessage(message);
            } else {
                vscode.window.showWarningMessage(message);
            }

        } catch (error) {
            this.stopProgressUpdates();
            this.contextLogger.error('Goal execution failed', error as Error);
            
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            vscode.window.showErrorMessage(`Goal execution failed: ${errorMessage}`);
            
            this.updateContent();
        }
    }

    /**
     * Pause current execution
     */
    private async pauseExecution(): Promise<void> {
        try {
            await this.agenticOrchestrator.pauseExecution();
            vscode.window.showInformationMessage('Execution paused');
            this.updateContent();
        } catch (error) {
            this.contextLogger.error('Failed to pause execution', error as Error);
            vscode.window.showErrorMessage('Failed to pause execution');
        }
    }

    /**
     * Cancel current execution
     */
    private async cancelExecution(): Promise<void> {
        try {
            await this.agenticOrchestrator.cancelExecution();
            this.stopProgressUpdates();
            vscode.window.showInformationMessage('Execution cancelled');
            this.updateContent();
        } catch (error) {
            this.contextLogger.error('Failed to cancel execution', error as Error);
            vscode.window.showErrorMessage('Failed to cancel execution');
        }
    }

    /**
     * Approve or reject a step
     */
    private async approveStep(stepId: string, approved: boolean): Promise<void> {
        try {
            // This would integrate with the HumanOversightSystem
            // For now, just log the approval
            this.contextLogger.info('Step approval', { stepId, approved });
            
            if (approved) {
                vscode.window.showInformationMessage(`Step ${stepId} approved`);
            } else {
                vscode.window.showWarningMessage(`Step ${stepId} rejected`);
            }
            
            this.updateContent();
        } catch (error) {
            this.contextLogger.error('Failed to process step approval', error as Error);
        }
    }

    /**
     * Use a goal template
     */
    private async useTemplate(templateId: string): Promise<void> {
        const templates = this.getGoalTemplates();
        const template = templates.find(t => t.id === templateId);
        
        if (template) {
            // Send template to webview
            this.panel?.webview.postMessage({
                command: 'setGoal',
                goal: template.template
            });
        }
    }

    /**
     * Start progress updates
     */
    private startProgressUpdates(): void {
        this.stopProgressUpdates();
        
        this.progressUpdateInterval = setInterval(() => {
            this.updateContent();
        }, 2000); // Update every 2 seconds
    }

    /**
     * Stop progress updates
     */
    private stopProgressUpdates(): void {
        if (this.progressUpdateInterval) {
            clearInterval(this.progressUpdateInterval);
            this.progressUpdateInterval = undefined;
        }
    }

    /**
     * Update webview content
     */
    private updateContent(): void {
        if (this.panel) {
            this.panel.webview.html = this.getWebviewContent();
        }
    }

    /**
     * Get goal templates
     */
    private getGoalTemplates(): GoalTemplate[] {
        return [
            {
                id: 'create-component',
                title: 'Create React Component',
                description: 'Create a new React component with TypeScript and tests',
                template: 'Create a new React component called [ComponentName] with TypeScript, including props interface, basic styling, and unit tests',
                category: 'development',
                complexity: 'moderate',
                estimatedTime: '5-10 minutes'
            },
            {
                id: 'refactor-function',
                title: 'Refactor Function',
                description: 'Refactor a function to improve readability and performance',
                template: 'Refactor the [functionName] function in [fileName] to improve readability, add proper error handling, and optimize performance',
                category: 'refactoring',
                complexity: 'simple',
                estimatedTime: '3-5 minutes'
            },
            {
                id: 'add-tests',
                title: 'Add Unit Tests',
                description: 'Add comprehensive unit tests for existing code',
                template: 'Add comprehensive unit tests for [fileName] covering all public methods, edge cases, and error scenarios',
                category: 'testing',
                complexity: 'moderate',
                estimatedTime: '10-15 minutes'
            },
            {
                id: 'analyze-performance',
                title: 'Performance Analysis',
                description: 'Analyze code performance and suggest optimizations',
                template: 'Analyze the performance of [fileName] and suggest specific optimizations for memory usage, execution speed, and resource efficiency',
                category: 'analysis',
                complexity: 'complex',
                estimatedTime: '15-20 minutes'
            },
            {
                id: 'generate-docs',
                title: 'Generate Documentation',
                description: 'Generate comprehensive documentation for code',
                template: 'Generate comprehensive documentation for [fileName] including API documentation, usage examples, and inline comments',
                category: 'documentation',
                complexity: 'simple',
                estimatedTime: '5-8 minutes'
            }
        ];
    }

    /**
     * Render current execution section
     */
    private renderCurrentExecution(agentState: any, executionStatus: any): string {
        if (!agentState.currentTask) {
            return '<div class="section"><h2>No Active Execution</h2><p>Ready to execute a new goal.</p></div>';
        }

        const task = agentState.currentTask;
        const progress = task.progress?.percentComplete || 0;
        const stepsCompleted = task.steps?.filter((s: any) => s.status === 'completed').length || 0;
        const totalSteps = task.steps?.length || 0;

        return `
        <div class="section current-execution">
            <h2>🚀 Current Execution</h2>
            <div class="execution-card">
                <div class="goal-text">${task.goal}</div>
                <div class="progress-section">
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${progress}%"></div>
                    </div>
                    <div class="progress-text">${progress}% Complete (${stepsCompleted}/${totalSteps} steps)</div>
                </div>
                <div class="execution-controls">
                    ${executionStatus.isExecuting ? `
                        <button class="btn btn-warning" onclick="pauseExecution()">⏸️ Pause</button>
                        <button class="btn btn-danger" onclick="cancelExecution()">🛑 Cancel</button>
                    ` : `
                        <button class="btn btn-primary" onclick="resumeExecution()">▶️ Resume</button>
                        <button class="btn btn-danger" onclick="cancelExecution()">🛑 Cancel</button>
                    `}
                </div>
                ${this.renderStepsList(task.steps || [])}
            </div>
        </div>`;
    }

    /**
     * Render steps list
     */
    private renderStepsList(steps: TaskStep[]): string {
        if (steps.length === 0) {
            return '<div class="steps-section"><p>No steps available yet...</p></div>';
        }

        const stepsHtml = steps.map((step, index) => {
            const statusIcon = step.status === 'completed' ? '✅' :
                             step.status === 'failed' ? '❌' :
                             step.status === 'executing' ? '⏳' :
                             step.status === 'waiting_approval' ? '⏸️' : '⏸️';

            const duration = step.startTime && step.endTime ?
                Math.round((step.endTime - step.startTime) / 1000) + 's' : '';

            return `
            <div class="step-item ${step.status}">
                <div class="step-header">
                    <span class="step-icon">${statusIcon}</span>
                    <span class="step-title">${step.description}</span>
                    <span class="step-duration">${duration}</span>
                </div>
                ${step.status === 'waiting_approval' ? `
                    <div class="step-approval">
                        <p>This step requires your approval:</p>
                        <button class="btn btn-success btn-sm" onclick="approveStep('${step.id}', true)">✅ Approve</button>
                        <button class="btn btn-danger btn-sm" onclick="approveStep('${step.id}', false)">❌ Reject</button>
                    </div>
                ` : ''}
            </div>`;
        }).join('');

        return `<div class="steps-section"><h3>Execution Steps</h3><div class="steps-list">${stepsHtml}</div></div>`;
    }

    /**
     * Render goal input section
     */
    private renderGoalInput(templates: GoalTemplate[]): string {
        return `
        <div class="section goal-input">
            <h2>🎯 Execute New Goal</h2>
            <div class="input-section">
                <textarea id="goalInput" placeholder="Describe what you want the AI agent to do...
Examples:
• Create a new React component with tests
• Refactor the UserService class for better performance
• Add comprehensive error handling to the API endpoints
• Generate documentation for the authentication module"></textarea>
                <div class="input-controls">
                    <button class="btn btn-primary" onclick="executeGoal()">🚀 Execute Goal</button>
                    <button class="btn btn-secondary" onclick="showTemplates()">📋 Use Template</button>
                </div>
            </div>

            <div id="templatesSection" class="templates-section" style="display: none;">
                <h3>Goal Templates</h3>
                <div class="templates-grid">
                    ${templates.map(template => `
                        <div class="template-card" onclick="useTemplate('${template.id}')">
                            <div class="template-header">
                                <h4>${template.title}</h4>
                                <span class="template-complexity ${template.complexity}">${template.complexity}</span>
                            </div>
                            <p class="template-description">${template.description}</p>
                            <div class="template-meta">
                                <span class="template-category">${template.category}</span>
                                <span class="template-time">${template.estimatedTime}</span>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>`;
    }

    /**
     * Render execution history section
     */
    private renderExecutionHistory(agentState: any): string {
        const history = agentState.executionHistory || [];

        if (history.length === 0) {
            return `
            <div class="section execution-history">
                <h2>📊 Execution History</h2>
                <p>No previous executions yet.</p>
            </div>`;
        }

        const historyHtml = history.slice(-5).reverse().map((execution: any) => {
            const statusIcon = execution.success ? '✅' : '❌';
            const duration = Math.round(execution.totalDuration / 1000);

            return `
            <div class="history-item">
                <div class="history-header">
                    <span class="history-icon">${statusIcon}</span>
                    <span class="history-goal">${execution.task?.goal || 'Unknown goal'}</span>
                    <span class="history-time">${new Date(execution.timestamp).toLocaleString()}</span>
                </div>
                <div class="history-stats">
                    <span>Duration: ${duration}s</span>
                    <span>Steps: ${execution.completedSteps}/${execution.completedSteps + execution.failedSteps}</span>
                    <span>Success Rate: ${Math.round((execution.completedSteps / (execution.completedSteps + execution.failedSteps)) * 100)}%</span>
                </div>
            </div>`;
        }).join('');

        return `
        <div class="section execution-history">
            <h2>📊 Recent Executions</h2>
            <div class="history-list">${historyHtml}</div>
        </div>`;
    }

    /**
     * Get webview content
     */
    private getWebviewContent(): string {
        const agentState = this.agentStateManager.getState();
        const executionStatus = this.agenticOrchestrator.getExecutionStatus();
        const templates = this.getGoalTemplates();

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>FlowCode Goal Execution</title>
    <style>
        ${this.getStyles()}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🤖 Autonomous Goal Execution</h1>
            <div class="status-indicator ${executionStatus.isExecuting ? 'executing' : 'idle'}">
                ${executionStatus.isExecuting ? '⚡ Executing' : '💤 Idle'}
            </div>
        </div>

        ${this.renderCurrentExecution(agentState, executionStatus)}
        ${this.renderGoalInput(templates)}
        ${this.renderExecutionHistory(agentState)}
    </div>

    <script>
        ${this.getScript()}
    </script>
</body>
</html>`;
    }

    /**
     * Get CSS styles
     */
    private getStyles(): string {
        return `
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            margin: 0;
            padding: 0;
        }

        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
        }

        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }

        .header h1 {
            margin: 0;
            color: var(--vscode-foreground);
        }

        .status-indicator {
            padding: 8px 16px;
            border-radius: 20px;
            font-weight: bold;
            font-size: 14px;
        }

        .status-indicator.executing {
            background-color: var(--vscode-testing-iconQueued);
            color: var(--vscode-foreground);
        }

        .status-indicator.idle {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }

        .section {
            margin-bottom: 30px;
            padding: 20px;
            background-color: var(--vscode-panel-background);
            border-radius: 8px;
            border: 1px solid var(--vscode-panel-border);
        }

        .section h2 {
            margin-top: 0;
            margin-bottom: 20px;
            color: var(--vscode-foreground);
        }

        .execution-card {
            background-color: var(--vscode-editor-background);
            padding: 20px;
            border-radius: 8px;
            border: 1px solid var(--vscode-input-border);
        }

        .goal-text {
            font-size: 16px;
            font-weight: bold;
            margin-bottom: 15px;
            color: var(--vscode-foreground);
        }

        .progress-section {
            margin-bottom: 20px;
        }

        .progress-bar {
            width: 100%;
            height: 8px;
            background-color: var(--vscode-progressBar-background);
            border-radius: 4px;
            overflow: hidden;
            margin-bottom: 8px;
        }

        .progress-fill {
            height: 100%;
            background-color: var(--vscode-progressBar-foreground);
            transition: width 0.3s ease;
        }

        .progress-text {
            font-size: 14px;
            color: var(--vscode-descriptionForeground);
        }

        .execution-controls {
            display: flex;
            gap: 10px;
            margin-bottom: 20px;
        }

        .btn {
            padding: 8px 16px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            font-weight: bold;
            transition: background-color 0.2s;
        }

        .btn-primary {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }

        .btn-primary:hover {
            background-color: var(--vscode-button-hoverBackground);
        }

        .btn-secondary {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }

        .btn-secondary:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }

        .btn-warning {
            background-color: var(--vscode-testing-iconQueued);
            color: var(--vscode-foreground);
        }

        .btn-danger {
            background-color: var(--vscode-testing-iconFailed);
            color: var(--vscode-foreground);
        }

        .btn-success {
            background-color: var(--vscode-testing-iconPassed);
            color: var(--vscode-foreground);
        }

        .btn-sm {
            padding: 4px 8px;
            font-size: 12px;
        }

        .steps-section {
            margin-top: 20px;
        }

        .steps-section h3 {
            margin-bottom: 15px;
            color: var(--vscode-foreground);
        }

        .steps-list {
            display: flex;
            flex-direction: column;
            gap: 10px;
        }

        .step-item {
            padding: 12px;
            background-color: var(--vscode-input-background);
            border-radius: 6px;
            border: 1px solid var(--vscode-input-border);
        }

        .step-header {
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .step-icon {
            font-size: 16px;
        }

        .step-title {
            flex: 1;
            font-weight: bold;
        }

        .step-duration {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
        }

        .step-approval {
            margin-top: 10px;
            padding: 10px;
            background-color: var(--vscode-panel-background);
            border-radius: 4px;
            border: 1px solid var(--vscode-panel-border);
        }

        .step-approval p {
            margin: 0 0 10px 0;
            font-weight: bold;
        }

        .step-approval .btn {
            margin-right: 10px;
        }

        .input-section {
            margin-bottom: 20px;
        }

        #goalInput {
            width: 100%;
            min-height: 120px;
            padding: 12px;
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            resize: vertical;
            margin-bottom: 15px;
        }

        #goalInput:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
        }

        .input-controls {
            display: flex;
            gap: 10px;
        }

        .templates-section {
            margin-top: 20px;
            padding-top: 20px;
            border-top: 1px solid var(--vscode-panel-border);
        }

        .templates-section h3 {
            margin-bottom: 15px;
        }

        .templates-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 15px;
        }

        .template-card {
            padding: 15px;
            background-color: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            border-radius: 6px;
            cursor: pointer;
            transition: border-color 0.2s, background-color 0.2s;
        }

        .template-card:hover {
            border-color: var(--vscode-focusBorder);
            background-color: var(--vscode-list-hoverBackground);
        }

        .template-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
        }

        .template-header h4 {
            margin: 0;
            font-size: 16px;
        }

        .template-complexity {
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 11px;
            font-weight: bold;
            text-transform: uppercase;
        }

        .template-complexity.simple {
            background-color: var(--vscode-testing-iconPassed);
            color: var(--vscode-foreground);
        }

        .template-complexity.moderate {
            background-color: var(--vscode-testing-iconQueued);
            color: var(--vscode-foreground);
        }

        .template-complexity.complex {
            background-color: var(--vscode-testing-iconFailed);
            color: var(--vscode-foreground);
        }

        .template-description {
            margin-bottom: 10px;
            color: var(--vscode-descriptionForeground);
            font-size: 14px;
        }

        .template-meta {
            display: flex;
            justify-content: space-between;
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
        }

        .history-list {
            display: flex;
            flex-direction: column;
            gap: 10px;
        }

        .history-item {
            padding: 12px;
            background-color: var(--vscode-input-background);
            border-radius: 6px;
            border: 1px solid var(--vscode-input-border);
        }

        .history-header {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 8px;
        }

        .history-icon {
            font-size: 16px;
        }

        .history-goal {
            flex: 1;
            font-weight: bold;
        }

        .history-time {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
        }

        .history-stats {
            display: flex;
            gap: 15px;
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
        }
        `;
    }

    /**
     * Get JavaScript for webview
     */
    private getScript(): string {
        return `
        const vscode = acquireVsCodeApi();

        function executeGoal() {
            const goalInput = document.getElementById('goalInput');
            const goal = goalInput.value.trim();

            if (!goal) {
                alert('Please enter a goal to execute');
                return;
            }

            vscode.postMessage({
                command: 'executeGoal',
                goal: goal,
                options: {}
            });

            goalInput.value = '';
        }

        function pauseExecution() {
            vscode.postMessage({
                command: 'pauseExecution'
            });
        }

        function cancelExecution() {
            if (confirm('Are you sure you want to cancel the current execution?')) {
                vscode.postMessage({
                    command: 'cancelExecution'
                });
            }
        }

        function resumeExecution() {
            vscode.postMessage({
                command: 'resumeExecution'
            });
        }

        function approveStep(stepId, approved) {
            vscode.postMessage({
                command: 'approveStep',
                stepId: stepId,
                approved: approved
            });
        }

        function showTemplates() {
            const templatesSection = document.getElementById('templatesSection');
            const isVisible = templatesSection.style.display !== 'none';
            templatesSection.style.display = isVisible ? 'none' : 'block';

            const button = event.target;
            button.textContent = isVisible ? '📋 Use Template' : '❌ Hide Templates';
        }

        function useTemplate(templateId) {
            vscode.postMessage({
                command: 'useTemplate',
                templateId: templateId
            });
        }

        function refresh() {
            vscode.postMessage({
                command: 'refresh'
            });
        }

        // Listen for messages from extension
        window.addEventListener('message', event => {
            const message = event.data;

            switch (message.command) {
                case 'setGoal':
                    const goalInput = document.getElementById('goalInput');
                    goalInput.value = message.goal;

                    // Hide templates section
                    const templatesSection = document.getElementById('templatesSection');
                    templatesSection.style.display = 'none';

                    // Update button text
                    const templateButton = document.querySelector('button[onclick="showTemplates()"]');
                    if (templateButton) {
                        templateButton.textContent = '📋 Use Template';
                    }
                    break;

                case 'updateProgress':
                    // Handle progress updates
                    break;
            }
        });

        // Auto-refresh every 5 seconds when executing
        setInterval(() => {
            const statusIndicator = document.querySelector('.status-indicator');
            if (statusIndicator && statusIndicator.classList.contains('executing')) {
                refresh();
            }
        }, 5000);

        // Handle Enter key in goal input (Ctrl+Enter to execute)
        document.addEventListener('DOMContentLoaded', () => {
            const goalInput = document.getElementById('goalInput');
            if (goalInput) {
                goalInput.addEventListener('keydown', (event) => {
                    if (event.ctrlKey && event.key === 'Enter') {
                        executeGoal();
                    }
                });
            }
        });
        `;
    }

    /**
     * Dispose of resources
     */
    public dispose(): void {
        this.stopProgressUpdates();
        if (this.panel) {
            this.panel.dispose();
        }
    }
}
