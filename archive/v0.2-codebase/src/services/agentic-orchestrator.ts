import * as vscode from 'vscode';
import { logger } from '../utils/logger';
import { ConfigurationManager } from '../utils/configuration-manager';
import { TaskPlanningEngine } from './task-planning-engine';
import { ExecutionEngine } from './execution-engine';
import { AgentStateManager } from './agent-state-manager';
import { HumanOversightSystem } from './human-oversight-system';
import {
    AgenticTask,
    TaskStep,
    TaskStatus,
    StepStatus,
    ExecutionContext,
    UserFeedback,
    HumanIntervention,
    LearningData
} from '../types/agentic-types';

/**
 * Orchestration result for task execution
 */
interface OrchestrationResult {
    success: boolean;
    task: AgenticTask;
    completedSteps: number;
    failedSteps: number;
    totalDuration: number;
    userInterventions: HumanIntervention[];
    feedback?: UserFeedback;
}

/**
 * Agentic Orchestrator
 * 
 * Central coordinator for the autonomous coding agent system.
 * Orchestrates the interaction between planning, execution, state management,
 * and human oversight components.
 */
export class AgenticOrchestrator {
    private readonly contextLogger = logger.createContextLogger('AgenticOrchestrator');
    private isExecuting = false;
    private currentExecutionContext: ExecutionContext | null = null;

    constructor(
        private context: vscode.ExtensionContext,
        private configManager: ConfigurationManager,
        private taskPlanningEngine: TaskPlanningEngine,
        private executionEngine: ExecutionEngine,
        private stateManager: AgentStateManager,
        private oversightSystem: HumanOversightSystem
    ) {
        this.contextLogger.info('AgenticOrchestrator initialized');
    }

    /**
     * Initialize the orchestrator
     */
    public async initialize(): Promise<void> {
        try {
            await this.stateManager.initialize();
            this.contextLogger.info('AgenticOrchestrator initialized successfully');
        } catch (error) {
            this.contextLogger.error('Failed to initialize AgenticOrchestrator', error as Error);
            throw error;
        }
    }

    /**
     * Execute a user goal autonomously
     */
    public async executeGoal(userGoal: string): Promise<OrchestrationResult> {
        if (this.isExecuting) {
            throw new Error('Another task is already executing');
        }

        this.isExecuting = true;
        const startTime = Date.now();

        try {
            this.contextLogger.info('Starting goal execution', { goal: userGoal.substring(0, 100) });

            // Step 1: Plan the task
            const task = await this.taskPlanningEngine.decomposeGoal(userGoal);
            await this.stateManager.setCurrentTask(task);

            // Step 2: Show progress to user
            await this.oversightSystem.showProgress(task);

            // Step 3: Execute the task
            const result = await this.executeTask(task);

            // Step 4: Collect feedback
            const feedback = await this.oversightSystem.collectFeedback(task);
            if (feedback) {
                task.feedback = feedback;
                await this.processUserFeedback(task, feedback);
            }

            // Step 5: Update final state
            await this.stateManager.setCurrentTask(null);

            const totalDuration = Date.now() - startTime;
            this.contextLogger.info('Goal execution completed', {
                taskId: task.id,
                success: result.success,
                duration: totalDuration,
                completedSteps: result.completedSteps
            });

            return {
                ...result,
                totalDuration,
                feedback: feedback || undefined
            };

        } catch (error) {
            this.contextLogger.error('Goal execution failed', error as Error);
            throw error;
        } finally {
            this.isExecuting = false;
            this.currentExecutionContext = null;
        }
    }

    /**
     * Execute a planned task
     */
    private async executeTask(task: AgenticTask): Promise<OrchestrationResult> {
        const startTime = Date.now();
        let completedSteps = 0;
        let failedSteps = 0;
        const userInterventions: HumanIntervention[] = [];

        try {
            // Update task status
            task.status = 'executing';
            await this.stateManager.updateTaskStatus(task.id, 'executing');

            // Create execution context (step will be updated in loop)
            this.currentExecutionContext = {
                task,
                step: task.steps[0] || {
                    id: 'placeholder',
                    description: 'Placeholder step',
                    action: {
                        id: 'placeholder-action',
                        type: 'analyze_code',
                        description: 'Placeholder action',
                        target: '',
                        payload: {},
                        validation: [],
                        riskLevel: 'low',
                        estimatedTime: 0,
                        requiresApproval: false
                    },
                    status: 'pending',
                    riskLevel: 'low',
                    approvalRequired: false,
                    dependencies: []
                },
                environment: {
                    platform: process.platform,
                    nodeVersion: process.version,
                    availableTools: ['git', 'npm', 'node'],
                    workspaceConfig: {}
                },
                resources: {
                    memoryLimit: 1024 * 1024 * 1024, // 1GB
                    timeLimit: 3600000, // 1 hour
                    networkAccess: true,
                    fileSystemAccess: true
                },
                constraints: {
                    maxFileSize: 10 * 1024 * 1024, // 10MB
                    allowedOperations: ['analyze_code', 'create_file', 'edit_file', 'run_tests'],
                    restrictedPaths: ['node_modules', '.git'],
                    securityLevel: 'medium'
                }
            };

            // Execute steps sequentially
            for (let i = 0; i < task.steps.length; i++) {
                const step = task.steps[i];
                if (!step) continue;

                if (this.currentExecutionContext) {
                    this.currentExecutionContext.step = step;
                }

                // Check for user interventions
                if (task.status === 'paused' as any) {
                    await this.handleTaskPause(task);
                    continue;
                }

                if (task.status === 'cancelled' as any) {
                    break;
                }

                // Update progress
                await this.updateTaskProgress(task, i);

                // Execute step
                const stepStartTime = Date.now();
                try {
                    if (!this.currentExecutionContext) {
                        throw new Error('Execution context not available');
                    }

                    const stepResult = await this.executionEngine.executeStep(step, this.currentExecutionContext);
                    const stepDuration = Date.now() - stepStartTime;

                    // Record execution step
                    await this.stateManager.recordExecutionStep(
                        task.id,
                        step.id,
                        step.status,
                        stepDuration,
                        stepResult.success,
                        step.error?.message,
                        stepResult.output
                    );

                    if (stepResult.success) {
                        completedSteps++;
                    } else {
                        failedSteps++;
                        
                        // Handle step failure
                        const shouldContinue = await this.handleStepFailure(task, step, stepResult);
                        if (!shouldContinue) {
                            break;
                        }
                    }

                } catch (error) {
                    failedSteps++;
                    step.status = 'failed';
                    step.error = error as Error;

                    this.contextLogger.error('Step execution failed', error as Error, {
                        taskId: task.id,
                        stepId: step.id
                    });

                    // Escalate to user
                    await this.oversightSystem.escalateIssue(task, `Step failed: ${(error as Error).message}`, {
                        task,
                        currentStep: step,
                        reason: 'Step execution error',
                        suggestedActions: ['Skip step', 'Retry step', 'Cancel task'],
                        urgency: 'high'
                    });
                }

                // Update progress display
                await this.oversightSystem.showProgress(task);
            }

            // Determine final task status
            const finalStatus: TaskStatus = (task.status as any) === 'cancelled' ? 'cancelled' :
                                          failedSteps > 0 && completedSteps === 0 ? 'failed' :
                                          'completed';

            task.status = finalStatus;
            task.actualDuration = Date.now() - startTime;
            
            // Update final progress
            task.progress.percentComplete = 100;
            task.progress.completedSteps = completedSteps;
            task.progress.failedSteps = failedSteps;

            await this.stateManager.updateTaskStatus(task.id, finalStatus);
            await this.stateManager.updateTaskProgress(task.id, task.progress);

            return {
                success: finalStatus === 'completed',
                task,
                completedSteps,
                failedSteps,
                totalDuration: task.actualDuration,
                userInterventions: task.interventions
            };

        } catch (error) {
            task.status = 'failed';
            await this.stateManager.updateTaskStatus(task.id, 'failed');
            
            this.contextLogger.error('Task execution failed', error as Error);
            throw error;
        }
    }

    /**
     * Update task progress
     */
    private async updateTaskProgress(task: AgenticTask, currentStepIndex: number): Promise<void> {
        const progress = {
            currentStep: task.steps[currentStepIndex]?.id,
            percentComplete: Math.round((currentStepIndex / task.steps.length) * 100),
            estimatedTimeRemaining: this.calculateEstimatedTimeRemaining(task, currentStepIndex)
        };

        task.progress = { ...task.progress, ...progress };
        await this.stateManager.updateTaskProgress(task.id, progress);
    }

    /**
     * Handle task pause
     */
    private async handleTaskPause(task: AgenticTask): Promise<void> {
        this.contextLogger.info('Task paused, waiting for user action', { taskId: task.id });
        
        // Wait for user to resume or cancel
        return new Promise((resolve) => {
            const checkStatus = () => {
                if (task.status !== 'paused') {
                    resolve();
                } else {
                    setTimeout(checkStatus, 1000);
                }
            };
            checkStatus();
        });
    }

    /**
     * Handle step failure
     */
    private async handleStepFailure(task: AgenticTask, step: TaskStep, stepResult: any): Promise<boolean> {
        // Check if we should continue or stop
        const criticalFailure = step.riskLevel === 'critical' || 
                               step.action.type === 'delete_file' ||
                               stepResult.validationResults?.some((v: any) => !v.passed && v.rule.severity === 'error');

        if (criticalFailure) {
            await this.oversightSystem.escalateIssue(task, 'Critical step failure', {
                task,
                currentStep: step,
                reason: 'Critical step failed',
                suggestedActions: ['Cancel task', 'Skip step', 'Retry with modifications'],
                urgency: 'critical'
            });
            return false;
        }

        // Continue with non-critical failures
        return true;
    }

    /**
     * Process user feedback for learning
     */
    private async processUserFeedback(task: AgenticTask, feedback: UserFeedback): Promise<void> {
        const learningData: LearningData = {
            patterns: this.extractPatterns(task, feedback),
            successes: feedback.rating >= 4 ? [task.goal] : [],
            failures: feedback.rating <= 2 ? [task.goal] : [],
            userPreferences: {
                preferredComplexity: task.priority,
                riskTolerance: task.riskLevel,
                feedbackStyle: feedback.comments ? 'detailed' : 'minimal'
            },
            adaptations: feedback.suggestions || []
        };

        await this.stateManager.addLearningData(learningData);
        
        this.contextLogger.info('User feedback processed for learning', {
            taskId: task.id,
            rating: feedback.rating,
            patterns: learningData.patterns.length
        });
    }

    /**
     * Extract patterns from task execution and feedback
     */
    private extractPatterns(task: AgenticTask, feedback: UserFeedback): string[] {
        const patterns: string[] = [];

        // Extract patterns based on task characteristics
        if (feedback.rating >= 4) {
            patterns.push(`successful_${task.priority}_priority_task`);
            patterns.push(`successful_${task.riskLevel}_risk_task`);
            
            // Extract successful action patterns
            const successfulActions = task.steps
                .filter(step => step.status === 'completed')
                .map(step => step.action.type);
            
            patterns.push(...successfulActions.map(action => `successful_${action}`));
        }

        // Extract failure patterns
        if (feedback.rating <= 2) {
            patterns.push(`failed_${task.priority}_priority_task`);
            patterns.push(`failed_${task.riskLevel}_risk_task`);
        }

        // Extract user preference patterns
        if (feedback.wouldUseAgain) {
            patterns.push('user_satisfaction_high');
        }

        return patterns;
    }

    /**
     * Calculate estimated time remaining
     */
    private calculateEstimatedTimeRemaining(task: AgenticTask, currentStepIndex: number): number {
        const remainingSteps = task.steps.length - currentStepIndex;
        const averageStepTime = task.estimatedDuration / task.steps.length;
        return remainingSteps * averageStepTime;
    }

    /**
     * Get current execution status
     */
    public getExecutionStatus(): {
        isExecuting: boolean;
        currentTask: AgenticTask | null;
        currentStep: TaskStep | null;
    } {
        return {
            isExecuting: this.isExecuting,
            currentTask: this.stateManager.getCurrentTask(),
            currentStep: this.currentExecutionContext?.step || null
        };
    }

    /**
     * Pause current execution
     */
    public async pauseExecution(): Promise<void> {
        const currentTask = this.stateManager.getCurrentTask();
        if (currentTask && this.isExecuting) {
            await this.oversightSystem.handleIntervention(
                currentTask,
                'pause',
                'User requested pause'
            );
        }
    }

    /**
     * Cancel current execution
     */
    public async cancelExecution(): Promise<void> {
        const currentTask = this.stateManager.getCurrentTask();
        if (currentTask && this.isExecuting) {
            await this.oversightSystem.handleIntervention(
                currentTask,
                'cancel',
                'User requested cancellation'
            );
        }
    }

    /**
     * Cleanup resources
     */
    public async dispose(): Promise<void> {
        await this.stateManager.dispose();
        this.oversightSystem.dispose();
        this.contextLogger.info('AgenticOrchestrator disposed');
    }
}
