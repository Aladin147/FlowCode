import * as vscode from 'vscode';
import { logger } from '../utils/logger';
import { AgenticTask, TaskStep, HumanIntervention } from '../types/agentic-types';
import { AgentStateManager } from './agent-state-manager';
import { HumanOversightSystem } from './human-oversight-system';

export interface ProgressUpdate {
    taskId: string;
    timestamp: number;
    percentComplete: number;
    currentStep: TaskStep | null;
    stepsCompleted: number;
    totalSteps: number;
    estimatedTimeRemaining: number;
    status: 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
    message?: string;
}

export interface ProgressSubscription {
    id: string;
    callback: (update: ProgressUpdate) => void;
    filter?: (update: ProgressUpdate) => boolean;
}

export class ProgressMonitoringService {
    private contextLogger = logger.createContextLogger('ProgressMonitoringService');
    private subscriptions: Map<string, ProgressSubscription> = new Map();
    private progressHistory: Map<string, ProgressUpdate[]> = new Map();
    private statusBarItem: vscode.StatusBarItem;
    private updateInterval: NodeJS.Timeout | undefined;
    private currentTask: AgenticTask | null = null;

    constructor(
        private context: vscode.ExtensionContext,
        private agentStateManager: AgentStateManager,
        private humanOversightSystem: HumanOversightSystem
    ) {
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            100
        );
        this.statusBarItem.command = 'flowcode.showAgentStatus';
        this.context.subscriptions.push(this.statusBarItem);
        
        this.startProgressMonitoring();
    }

    /**
     * Start monitoring progress
     */
    public startProgressMonitoring(): void {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }

        this.updateInterval = setInterval(() => {
            this.checkForProgressUpdates();
        }, 1000); // Update every second

        this.contextLogger.info('Progress monitoring started');
    }

    /**
     * Stop monitoring progress
     */
    public stopProgressMonitoring(): void {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = undefined;
        }

        this.statusBarItem.hide();
        this.contextLogger.info('Progress monitoring stopped');
    }

    /**
     * Subscribe to progress updates
     */
    public subscribe(
        id: string,
        callback: (update: ProgressUpdate) => void,
        filter?: (update: ProgressUpdate) => boolean
    ): void {
        this.subscriptions.set(id, { id, callback, filter });
        this.contextLogger.info('Progress subscription added', { subscriptionId: id });
    }

    /**
     * Unsubscribe from progress updates
     */
    public unsubscribe(id: string): void {
        this.subscriptions.delete(id);
        this.contextLogger.info('Progress subscription removed', { subscriptionId: id });
    }

    /**
     * Publish progress update to all subscribers
     */
    private publishUpdate(update: ProgressUpdate): void {
        // Store in history
        if (!this.progressHistory.has(update.taskId)) {
            this.progressHistory.set(update.taskId, []);
        }
        const history = this.progressHistory.get(update.taskId)!;
        history.push(update);
        
        // Keep only last 100 updates per task
        if (history.length > 100) {
            history.splice(0, history.length - 100);
        }

        // Notify subscribers
        for (const subscription of this.subscriptions.values()) {
            try {
                if (!subscription.filter || subscription.filter(update)) {
                    subscription.callback(update);
                }
            } catch (error) {
                this.contextLogger.error('Error in progress subscription callback', error as Error);
            }
        }

        // Update status bar
        this.updateStatusBar(update);

        // Show notifications for important events
        this.handleProgressNotifications(update);
    }

    /**
     * Check for progress updates from agent state
     */
    private checkForProgressUpdates(): void {
        try {
            const agentState = this.agentStateManager.getState();
            const currentTask = agentState.currentTask;

            if (currentTask && currentTask !== this.currentTask) {
                // New task started
                this.currentTask = currentTask;
                this.onTaskStarted(currentTask);
            } else if (!currentTask && this.currentTask) {
                // Task completed or cancelled
                this.onTaskEnded(this.currentTask);
                this.currentTask = null;
            } else if (currentTask) {
                // Task in progress - check for updates
                this.checkTaskProgress(currentTask);
            }
        } catch (error) {
            this.contextLogger.error('Error checking progress updates', error as Error);
        }
    }

    /**
     * Handle task started
     */
    private onTaskStarted(task: AgenticTask): void {
        const update: ProgressUpdate = {
            taskId: task.id,
            timestamp: Date.now(),
            percentComplete: 0,
            currentStep: null,
            stepsCompleted: 0,
            totalSteps: task.steps.length,
            estimatedTimeRemaining: this.estimateTimeRemaining(task),
            status: 'running',
            message: `Started: ${task.goal}`
        };

        this.publishUpdate(update);
        
        // Show progress panel
        this.humanOversightSystem.showProgress(task);
        
        this.contextLogger.info('Task started', { taskId: task.id, goal: task.goal });
    }

    /**
     * Handle task ended
     */
    private onTaskEnded(task: AgenticTask): void {
        const completedSteps = task.steps.filter(step => step.status === 'completed').length;
        const failedSteps = task.steps.filter(step => step.status === 'failed').length;
        const isSuccess = failedSteps === 0 && completedSteps === task.steps.length;

        const update: ProgressUpdate = {
            taskId: task.id,
            timestamp: Date.now(),
            percentComplete: 100,
            currentStep: null,
            stepsCompleted: completedSteps,
            totalSteps: task.steps.length,
            estimatedTimeRemaining: 0,
            status: isSuccess ? 'completed' : 'failed',
            message: isSuccess ? 'Task completed successfully' : `Task failed (${failedSteps} steps failed)`
        };

        this.publishUpdate(update);
        this.contextLogger.info('Task ended', { taskId: task.id, success: isSuccess });
    }

    /**
     * Check task progress for updates
     */
    private checkTaskProgress(task: AgenticTask): void {
        const completedSteps = task.steps.filter(step => step.status === 'completed').length;
        const currentStep = task.steps.find(step => 
            step.status === 'executing' || step.status === 'waiting_approval'
        );

        const percentComplete = task.steps.length > 0 ? 
            Math.round((completedSteps / task.steps.length) * 100) : 0;

        const update: ProgressUpdate = {
            taskId: task.id,
            timestamp: Date.now(),
            percentComplete,
            currentStep: currentStep || null,
            stepsCompleted: completedSteps,
            totalSteps: task.steps.length,
            estimatedTimeRemaining: this.estimateTimeRemaining(task),
            status: task.status === 'paused' ? 'paused' : 'running',
            message: currentStep ? `Executing: ${currentStep.description}` : 'Processing...'
        };

        this.publishUpdate(update);
    }

    /**
     * Estimate time remaining for task
     */
    private estimateTimeRemaining(task: AgenticTask): number {
        // Use the progress estimatedTimeRemaining if available
        if (task.progress?.estimatedTimeRemaining) {
            return task.progress.estimatedTimeRemaining;
        }

        // Fallback to estimated duration if no progress data
        if (task.estimatedDuration && task.progress?.percentComplete) {
            const remainingPercent = (100 - task.progress.percentComplete) / 100;
            return task.estimatedDuration * remainingPercent;
        }

        // Default fallback
        return 0;
    }

    /**
     * Update status bar with current progress
     */
    private updateStatusBar(update: ProgressUpdate): void {
        if (update.status === 'running' || update.status === 'paused') {
            const icon = update.status === 'running' ? '$(sync~spin)' : '$(debug-pause)';
            const text = `${icon} FlowCode: ${update.percentComplete}%`;
            
            this.statusBarItem.text = text;
            this.statusBarItem.tooltip = update.message || 'FlowCode autonomous execution in progress';
            this.statusBarItem.show();
        } else {
            this.statusBarItem.hide();
        }
    }

    /**
     * Handle progress notifications
     */
    private handleProgressNotifications(update: ProgressUpdate): void {
        // Show notification for major milestones
        if (update.percentComplete === 25 || update.percentComplete === 50 || update.percentComplete === 75) {
            vscode.window.showInformationMessage(
                `FlowCode Progress: ${update.percentComplete}% complete`,
                'Show Details'
            ).then(selection => {
                if (selection === 'Show Details') {
                    vscode.commands.executeCommand('flowcode.showAgentStatus');
                }
            });
        }

        // Show notification for completion
        if (update.status === 'completed') {
            vscode.window.showInformationMessage(
                `✅ FlowCode task completed successfully!`,
                'View Results'
            ).then(selection => {
                if (selection === 'View Results') {
                    vscode.commands.executeCommand('flowcode.showAgentStatus');
                }
            });
        }

        // Show notification for failures
        if (update.status === 'failed') {
            vscode.window.showErrorMessage(
                `❌ FlowCode task failed: ${update.message}`,
                'View Details'
            ).then(selection => {
                if (selection === 'View Details') {
                    vscode.commands.executeCommand('flowcode.showAgentStatus');
                }
            });
        }

        // Show notification for approval requests
        if (update.currentStep?.status === 'waiting_approval') {
            vscode.window.showWarningMessage(
                `⏸️ FlowCode needs approval: ${update.currentStep.description}`,
                'Approve', 'Reject', 'View Details'
            ).then(selection => {
                if (selection === 'Approve') {
                    // Handle approval
                    this.handleStepApproval(update.currentStep!.id, true);
                } else if (selection === 'Reject') {
                    // Handle rejection
                    this.handleStepApproval(update.currentStep!.id, false);
                } else if (selection === 'View Details') {
                    vscode.commands.executeCommand('flowcode.showAgentStatus');
                }
            });
        }
    }

    /**
     * Handle step approval/rejection
     */
    private async handleStepApproval(stepId: string, approved: boolean): Promise<void> {
        try {
            // This would integrate with the HumanOversightSystem
            // For now, just log the approval
            this.contextLogger.info('Step approval handled', { stepId, approved });
            
            const message = approved ? 'Step approved' : 'Step rejected';
            vscode.window.showInformationMessage(message);
        } catch (error) {
            this.contextLogger.error('Failed to handle step approval', error as Error);
            vscode.window.showErrorMessage('Failed to process approval');
        }
    }

    /**
     * Get progress history for a task
     */
    public getProgressHistory(taskId: string): ProgressUpdate[] {
        return this.progressHistory.get(taskId) || [];
    }

    /**
     * Get current progress for active task
     */
    public getCurrentProgress(): ProgressUpdate | null {
        if (!this.currentTask) {
            return null;
        }

        const history = this.progressHistory.get(this.currentTask.id);
        if (history && history.length > 0) {
            const lastUpdate = history[history.length - 1];
            return lastUpdate || null;
        }
        return null;
    }

    /**
     * Clear progress history
     */
    public clearHistory(taskId?: string): void {
        if (taskId) {
            this.progressHistory.delete(taskId);
        } else {
            this.progressHistory.clear();
        }
        this.contextLogger.info('Progress history cleared', { taskId });
    }

    /**
     * Dispose resources
     */
    public dispose(): void {
        this.stopProgressMonitoring();
        this.subscriptions.clear();
        this.progressHistory.clear();
        this.statusBarItem.dispose();
        this.contextLogger.info('ProgressMonitoringService disposed');
    }
}
