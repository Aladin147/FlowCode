import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger';
import { ConfigurationManager } from '../utils/configuration-manager';
import {
    AgenticTask,
    TaskStep,
    TaskStatus,
    StepStatus,
    UserFeedback,
    LearningData,
    HumanIntervention,
    ApprovalRequest,
    ExecutionContext,
    TaskProgress
} from '../types/agentic-types';

/**
 * Execution step record for history tracking
 */
interface ExecutionStep {
    taskId: string;
    stepId: string;
    timestamp: number;
    status: StepStatus;
    duration: number;
    success: boolean;
    error?: string;
    output?: any;
    userIntervention?: HumanIntervention;
}

/**
 * User preferences for agent behavior
 */
interface UserPreferences {
    autoApprovalLevel: 'none' | 'low' | 'medium' | 'high';
    preferredComplexityLevel: 'simple' | 'moderate' | 'complex';
    notificationLevel: 'minimal' | 'normal' | 'verbose';
    defaultApprovalTimeout: number; // in milliseconds
    learningEnabled: boolean;
    adaptiveBehavior: boolean;
    riskTolerance: 'conservative' | 'balanced' | 'aggressive';
}

/**
 * Agent state snapshot
 */
interface AgentState {
    currentTask: AgenticTask | null;
    taskQueue: AgenticTask[];
    executionHistory: ExecutionStep[];
    userPreferences: UserPreferences;
    learningMemory: LearningData[];
    sessionStartTime: number;
    totalTasksCompleted: number;
    totalTasksFailed: number;
    averageTaskDuration: number;
    lastSaveTime: number;
}

/**
 * Task statistics for analytics
 */
interface TaskStatistics {
    totalTasks: number;
    completedTasks: number;
    failedTasks: number;
    averageDuration: number;
    successRate: number;
    mostCommonActions: string[];
    riskDistribution: Record<string, number>;
    complexityDistribution: Record<string, number>;
}

/**
 * Agent State Manager
 * 
 * Manages the persistent state of the agentic system including:
 * - Current and queued tasks
 * - Execution history and analytics
 * - User preferences and learning data
 * - State persistence and recovery
 */
export class AgentStateManager {
    private readonly contextLogger = logger.createContextLogger('AgentStateManager');
    private state: AgentState;
    private stateFilePath: string;
    private autoSaveInterval: NodeJS.Timeout | null = null;
    private readonly AUTO_SAVE_INTERVAL = 30000; // 30 seconds

    constructor(
        private context: vscode.ExtensionContext,
        private configManager: ConfigurationManager
    ) {
        this.stateFilePath = path.join(context.globalStorageUri?.fsPath || '', 'agent-state.json');
        this.state = this.initializeDefaultState();
        this.contextLogger.info('AgentStateManager initialized', { stateFile: this.stateFilePath });
    }

    /**
     * Initialize the state manager
     */
    public async initialize(): Promise<void> {
        try {
            await this.loadState();
            this.startAutoSave();
            this.setupConfigurationListener();
            this.contextLogger.info('AgentStateManager initialized successfully');
        } catch (error) {
            this.contextLogger.error('Failed to initialize AgentStateManager', error as Error);
            throw error;
        }
    }

    /**
     * Get current agent state
     */
    public getState(): AgentState {
        return { ...this.state };
    }

    /**
     * Get current task
     */
    public getCurrentTask(): AgenticTask | null {
        return this.state.currentTask;
    }

    /**
     * Set current task
     */
    public async setCurrentTask(task: AgenticTask | null): Promise<void> {
        this.state.currentTask = task;
        await this.saveState();
        
        this.contextLogger.info('Current task updated', { 
            taskId: task?.id || 'none',
            status: task?.status || 'none'
        });
    }

    /**
     * Add task to queue
     */
    public async addTaskToQueue(task: AgenticTask): Promise<void> {
        this.state.taskQueue.push(task);
        await this.saveState();
        
        this.contextLogger.info('Task added to queue', { 
            taskId: task.id,
            queueLength: this.state.taskQueue.length
        });
    }

    /**
     * Get next task from queue
     */
    public async getNextTask(): Promise<AgenticTask | null> {
        const nextTask = this.state.taskQueue.shift();
        if (nextTask) {
            await this.saveState();
            this.contextLogger.info('Next task retrieved from queue', { taskId: nextTask.id });
        }
        return nextTask || null;
    }

    /**
     * Update task status
     */
    public async updateTaskStatus(taskId: string, status: TaskStatus): Promise<void> {
        // Update current task if it matches
        if (this.state.currentTask?.id === taskId) {
            this.state.currentTask.status = status;
            
            // Update statistics
            if (status === 'completed') {
                this.state.totalTasksCompleted++;
            } else if (status === 'failed') {
                this.state.totalTasksFailed++;
            }
        }

        // Update task in queue if it exists
        const queueTask = this.state.taskQueue.find(t => t.id === taskId);
        if (queueTask) {
            queueTask.status = status;
        }

        await this.saveState();
        
        this.contextLogger.info('Task status updated', { taskId, status });
    }

    /**
     * Update task progress
     */
    public async updateTaskProgress(taskId: string, progress: Partial<TaskProgress>): Promise<void> {
        const task = this.state.currentTask?.id === taskId 
            ? this.state.currentTask 
            : this.state.taskQueue.find(t => t.id === taskId);

        if (task) {
            task.progress = { ...task.progress, ...progress };
            await this.saveState();
            
            this.contextLogger.info('Task progress updated', { 
                taskId, 
                percentComplete: task.progress.percentComplete 
            });
        }
    }

    /**
     * Record execution step
     */
    public async recordExecutionStep(
        taskId: string,
        stepId: string,
        status: StepStatus,
        duration: number,
        success: boolean,
        error?: string,
        output?: any,
        userIntervention?: HumanIntervention
    ): Promise<void> {
        const executionStep: ExecutionStep = {
            taskId,
            stepId,
            timestamp: Date.now(),
            status,
            duration,
            success,
            error,
            output,
            userIntervention
        };

        this.state.executionHistory.push(executionStep);
        
        // Limit history size to prevent memory issues
        const MAX_HISTORY_SIZE = 1000;
        if (this.state.executionHistory.length > MAX_HISTORY_SIZE) {
            this.state.executionHistory = this.state.executionHistory.slice(-MAX_HISTORY_SIZE);
        }

        // Update average task duration
        this.updateAverageTaskDuration();

        await this.saveState();
        
        this.contextLogger.info('Execution step recorded', { 
            taskId, 
            stepId, 
            status, 
            success 
        });
    }

    /**
     * Get execution history
     */
    public getExecutionHistory(taskId?: string): ExecutionStep[] {
        if (taskId) {
            return this.state.executionHistory.filter(step => step.taskId === taskId);
        }
        return [...this.state.executionHistory];
    }

    /**
     * Get task statistics
     */
    public getTaskStatistics(): TaskStatistics {
        const totalTasks = this.state.totalTasksCompleted + this.state.totalTasksFailed;
        const successRate = totalTasks > 0 ? this.state.totalTasksCompleted / totalTasks : 0;

        // Analyze execution history for patterns
        const actionCounts: Record<string, number> = {};
        const riskCounts: Record<string, number> = {};
        const complexityCounts: Record<string, number> = {};

        // This would be populated from actual execution history analysis
        // For now, providing mock data structure

        return {
            totalTasks,
            completedTasks: this.state.totalTasksCompleted,
            failedTasks: this.state.totalTasksFailed,
            averageDuration: this.state.averageTaskDuration,
            successRate,
            mostCommonActions: Object.keys(actionCounts).sort((a, b) => (actionCounts[b] || 0) - (actionCounts[a] || 0)).slice(0, 5),
            riskDistribution: riskCounts,
            complexityDistribution: complexityCounts
        };
    }

    /**
     * Get user preferences
     */
    public getUserPreferences(): UserPreferences {
        return { ...this.state.userPreferences };
    }

    /**
     * Update user preferences
     */
    public async updateUserPreferences(preferences: Partial<UserPreferences>): Promise<void> {
        this.state.userPreferences = { ...this.state.userPreferences, ...preferences };
        await this.saveState();
        
        this.contextLogger.info('User preferences updated', { preferences });
    }

    /**
     * Add learning data
     */
    public async addLearningData(learningData: LearningData): Promise<void> {
        this.state.learningMemory.push(learningData);
        
        // Limit learning memory size
        const MAX_LEARNING_SIZE = 500;
        if (this.state.learningMemory.length > MAX_LEARNING_SIZE) {
            this.state.learningMemory = this.state.learningMemory.slice(-MAX_LEARNING_SIZE);
        }

        await this.saveState();
        
        this.contextLogger.info('Learning data added', { 
            patterns: learningData.patterns.length,
            successes: learningData.successes.length,
            failures: learningData.failures.length
        });
    }

    /**
     * Get learning data
     */
    public getLearningData(): LearningData[] {
        return [...this.state.learningMemory];
    }

    /**
     * Clear execution history
     */
    public async clearExecutionHistory(): Promise<void> {
        this.state.executionHistory = [];
        await this.saveState();
        
        this.contextLogger.info('Execution history cleared');
    }

    /**
     * Reset agent state
     */
    public async resetState(): Promise<void> {
        this.state = this.initializeDefaultState();
        await this.saveState();
        
        this.contextLogger.info('Agent state reset to defaults');
    }

    /**
     * Save state to persistent storage
     */
    public async saveState(): Promise<void> {
        try {
            // Ensure directory exists
            const dir = path.dirname(this.stateFilePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            // Update save time
            this.state.lastSaveTime = Date.now();

            // Save state to file
            const stateJson = JSON.stringify(this.state, null, 2);
            fs.writeFileSync(this.stateFilePath, stateJson, 'utf8');

            this.contextLogger.debug('State saved successfully');
        } catch (error) {
            this.contextLogger.error('Failed to save state', error as Error);
            throw error;
        }
    }

    /**
     * Load state from persistent storage
     */
    public async loadState(): Promise<void> {
        try {
            if (fs.existsSync(this.stateFilePath)) {
                const stateJson = fs.readFileSync(this.stateFilePath, 'utf8');
                const loadedState = JSON.parse(stateJson);
                
                // Merge with default state to handle schema changes
                this.state = { ...this.initializeDefaultState(), ...loadedState };
                
                this.contextLogger.info('State loaded successfully', {
                    currentTask: this.state.currentTask?.id || 'none',
                    queueLength: this.state.taskQueue.length,
                    historyLength: this.state.executionHistory.length
                });
            } else {
                this.contextLogger.info('No existing state file found, using defaults');
            }
        } catch (error) {
            this.contextLogger.error('Failed to load state, using defaults', error as Error);
            this.state = this.initializeDefaultState();
        }
    }

    /**
     * Start auto-save timer
     */
    private startAutoSave(): void {
        if (this.autoSaveInterval) {
            clearInterval(this.autoSaveInterval);
        }

        this.autoSaveInterval = setInterval(async () => {
            try {
                await this.saveState();
            } catch (error) {
                this.contextLogger.error('Auto-save failed', error as Error);
            }
        }, this.AUTO_SAVE_INTERVAL);

        this.contextLogger.info('Auto-save started', { interval: this.AUTO_SAVE_INTERVAL });
    }

    /**
     * Stop auto-save timer
     */
    public stopAutoSave(): void {
        if (this.autoSaveInterval) {
            clearInterval(this.autoSaveInterval);
            this.autoSaveInterval = null;
            this.contextLogger.info('Auto-save stopped');
        }
    }

    /**
     * Initialize default state
     */
    private initializeDefaultState(): AgentState {
        // Get current configuration settings
        const agenticConfig = this.configManager.getAgenticConfiguration();

        return {
            currentTask: null,
            taskQueue: [],
            executionHistory: [],
            userPreferences: {
                autoApprovalLevel: agenticConfig.autoApprovalLevel,
                preferredComplexityLevel: 'moderate',
                notificationLevel: agenticConfig.notificationLevel,
                defaultApprovalTimeout: agenticConfig.approvalTimeout,
                learningEnabled: agenticConfig.enableLearning,
                adaptiveBehavior: agenticConfig.adaptiveBehavior,
                riskTolerance: agenticConfig.riskTolerance
            },
            learningMemory: [],
            sessionStartTime: Date.now(),
            totalTasksCompleted: 0,
            totalTasksFailed: 0,
            averageTaskDuration: 0,
            lastSaveTime: Date.now()
        };
    }

    /**
     * Update average task duration
     */
    private updateAverageTaskDuration(): void {
        const completedSteps = this.state.executionHistory.filter(step => 
            step.status === 'completed' || step.status === 'failed'
        );

        if (completedSteps.length > 0) {
            const totalDuration = completedSteps.reduce((sum, step) => sum + step.duration, 0);
            this.state.averageTaskDuration = totalDuration / completedSteps.length;
        }
    }

    /**
     * Cleanup resources
     */
    /**
     * Setup configuration change listener
     */
    private setupConfigurationListener(): void {
        const disposable = vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration('flowcode.agent')) {
                this.contextLogger.info('Agent configuration changed, updating user preferences');
                this.updateUserPreferencesFromConfig();
            }
        });

        this.context.subscriptions.push(disposable);
    }

    /**
     * Update user preferences from current configuration
     */
    private updateUserPreferencesFromConfig(): void {
        try {
            const agenticConfig = this.configManager.getAgenticConfiguration();

            this.state.userPreferences = {
                ...this.state.userPreferences,
                autoApprovalLevel: agenticConfig.autoApprovalLevel,
                notificationLevel: agenticConfig.notificationLevel,
                defaultApprovalTimeout: agenticConfig.approvalTimeout,
                learningEnabled: agenticConfig.enableLearning,
                adaptiveBehavior: agenticConfig.adaptiveBehavior,
                riskTolerance: agenticConfig.riskTolerance
            };

            // Save updated state
            this.saveState().catch(error => {
                this.contextLogger.error('Failed to save state after configuration change', error as Error);
            });

            this.contextLogger.info('User preferences updated from configuration', {
                riskTolerance: this.state.userPreferences.riskTolerance,
                autoApprovalLevel: this.state.userPreferences.autoApprovalLevel
            });
        } catch (error) {
            this.contextLogger.error('Failed to update user preferences from configuration', error as Error);
        }
    }

    public async dispose(): Promise<void> {
        this.stopAutoSave();
        await this.saveState();
        this.contextLogger.info('AgentStateManager disposed');
    }
}
