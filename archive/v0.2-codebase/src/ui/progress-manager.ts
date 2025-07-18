import * as vscode from 'vscode';
import { logger } from '../utils/logger';

export interface ProgressStep {
    name: string;
    weight: number;
    message?: string;
}

export interface ProgressOptions {
    title: string;
    location?: vscode.ProgressLocation;
    cancellable?: boolean;
    steps?: ProgressStep[];
}

export class ProgressManager {
    private contextLogger = logger.createContextLogger('ProgressManager');
    private activeProgress: Map<string, {
        progress: vscode.Progress<{ message?: string; increment?: number }>;
        token: vscode.CancellationToken;
        currentStep: number;
        steps: ProgressStep[];
        totalWeight: number;
        completedWeight: number;
    }> = new Map();

    /**
     * Start a new progress operation
     */
    public async withProgress<T>(
        id: string,
        options: ProgressOptions,
        task: (progress: ProgressManager) => Promise<T>
    ): Promise<T> {
        return vscode.window.withProgress({
            location: options.location || vscode.ProgressLocation.Notification,
            title: options.title,
            cancellable: options.cancellable || false
        }, async (progress, token) => {
            const steps = options.steps || [];
            const totalWeight = steps.reduce((sum, step) => sum + step.weight, 0);

            this.activeProgress.set(id, {
                progress,
                token,
                currentStep: 0,
                steps,
                totalWeight,
                completedWeight: 0
            });

            this.contextLogger.info(`Started progress: ${options.title}`, {
                id,
                steps: steps.length,
                totalWeight
            });

            try {
                const result = await task(this);
                this.contextLogger.info(`Completed progress: ${options.title}`, { id });
                return result;
            } finally {
                this.activeProgress.delete(id);
            }
        });
    }

    /**
     * Update progress for a specific operation
     */
    public updateProgress(id: string, message?: string, increment?: number): void {
        const progressInfo = this.activeProgress.get(id);
        if (!progressInfo) {
            this.contextLogger.warn(`Progress not found: ${id}`);
            return;
        }

        if (increment !== undefined) {
            progressInfo.completedWeight += increment;
            const percentage = Math.min(100, (progressInfo.completedWeight / progressInfo.totalWeight) * 100);
            progressInfo.progress.report({ message, increment: percentage });
        } else {
            progressInfo.progress.report({ message });
        }

        this.contextLogger.debug(`Progress updated: ${id}`, {
            message,
            increment,
            completedWeight: progressInfo.completedWeight,
            totalWeight: progressInfo.totalWeight
        });
    }

    /**
     * Complete a step in the progress
     */
    public completeStep(id: string, stepName?: string): void {
        const progressInfo = this.activeProgress.get(id);
        if (!progressInfo) {
            this.contextLogger.warn(`Progress not found: ${id}`);
            return;
        }

        const currentStep = progressInfo.steps[progressInfo.currentStep];
        if (currentStep) {
            progressInfo.completedWeight += currentStep.weight;
            const percentage = (progressInfo.completedWeight / progressInfo.totalWeight) * 100;
            
            const message = stepName || currentStep.message || `Step ${progressInfo.currentStep + 1} completed`;
            progressInfo.progress.report({
                message,
                increment: (currentStep.weight / progressInfo.totalWeight) * 100
            });

            progressInfo.currentStep++;
            
            this.contextLogger.debug(`Step completed: ${id}`, {
                stepName: currentStep.name,
                currentStep: progressInfo.currentStep,
                percentage
            });
        }
    }

    /**
     * Start a specific step
     */
    public startStep(id: string, stepIndex?: number): void {
        const progressInfo = this.activeProgress.get(id);
        if (!progressInfo) {
            this.contextLogger.warn(`Progress not found: ${id}`);
            return;
        }

        const index = stepIndex !== undefined ? stepIndex : progressInfo.currentStep;
        const step = progressInfo.steps[index];
        
        if (step) {
            const message = step.message || `Starting ${step.name}...`;
            progressInfo.progress.report({ message });
            
            this.contextLogger.debug(`Step started: ${id}`, {
                stepName: step.name,
                stepIndex: index,
                message
            });
        }
    }

    /**
     * Check if progress is cancelled
     */
    public isCancelled(id: string): boolean {
        const progressInfo = this.activeProgress.get(id);
        return progressInfo?.token.isCancellationRequested || false;
    }

    /**
     * Set progress to indeterminate state
     */
    public setIndeterminate(id: string, message: string): void {
        const progressInfo = this.activeProgress.get(id);
        if (!progressInfo) {
            this.contextLogger.warn(`Progress not found: ${id}`);
            return;
        }

        progressInfo.progress.report({ message });
        this.contextLogger.debug(`Progress set to indeterminate: ${id}`, { message });
    }

    /**
     * Show error in progress
     */
    public showError(id: string, error: string): void {
        const progressInfo = this.activeProgress.get(id);
        if (!progressInfo) {
            this.contextLogger.warn(`Progress not found: ${id}`);
            return;
        }

        progressInfo.progress.report({ message: `❌ ${error}` });
        this.contextLogger.error(`Progress error: ${id}`, new Error(error));
    }

    /**
     * Show success in progress
     */
    public showSuccess(id: string, message: string): void {
        const progressInfo = this.activeProgress.get(id);
        if (!progressInfo) {
            this.contextLogger.warn(`Progress not found: ${id}`);
            return;
        }

        progressInfo.progress.report({ message: `✅ ${message}` });
        this.contextLogger.info(`Progress success: ${id}`, { message });
    }

    /**
     * Create a quick progress for simple operations
     */
    public static async quickProgress<T>(
        title: string,
        task: () => Promise<T>,
        location: vscode.ProgressLocation = vscode.ProgressLocation.Window
    ): Promise<T> {
        return vscode.window.withProgress({
            location,
            title,
            cancellable: false
        }, async (progress) => {
            progress.report({ message: "Starting..." });
            
            try {
                const result = await task();
                progress.report({ message: "Completed" });
                return result;
            } catch (error) {
                progress.report({ message: `Failed: ${error instanceof Error ? error.message : 'Unknown error'}` });
                throw error;
            }
        });
    }

    /**
     * Create a cancellable progress
     */
    public static async cancellableProgress<T>(
        title: string,
        task: (token: vscode.CancellationToken) => Promise<T>,
        location: vscode.ProgressLocation = vscode.ProgressLocation.Notification
    ): Promise<T> {
        return vscode.window.withProgress({
            location,
            title,
            cancellable: true
        }, async (progress, token) => {
            progress.report({ message: "Starting..." });
            
            try {
                const result = await task(token);
                if (token.isCancellationRequested) {
                    throw new Error('Operation was cancelled');
                }
                progress.report({ message: "Completed" });
                return result;
            } catch (error) {
                if (token.isCancellationRequested) {
                    progress.report({ message: "Cancelled" });
                } else {
                    progress.report({ message: `Failed: ${error instanceof Error ? error.message : 'Unknown error'}` });
                }
                throw error;
            }
        });
    }

    /**
     * Show a simple notification with progress
     */
    public static showNotificationProgress(
        message: string,
        duration: number = 3000
    ): void {
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: message,
            cancellable: false
        }, async (progress) => {
            const steps = 10;
            const stepDuration = duration / steps;
            
            for (let i = 0; i <= steps; i++) {
                if (i === steps) {
                    progress.report({ message: "Complete", increment: 100 });
                } else {
                    progress.report({ increment: 10 });
                    await new Promise(resolve => setTimeout(resolve, stepDuration));
                }
            }
        });
    }

    /**
     * Get current progress info
     */
    public getProgressInfo(id: string): {
        currentStep: number;
        totalSteps: number;
        completedWeight: number;
        totalWeight: number;
        percentage: number;
    } | null {
        const progressInfo = this.activeProgress.get(id);
        if (!progressInfo) {
            return null;
        }

        return {
            currentStep: progressInfo.currentStep,
            totalSteps: progressInfo.steps.length,
            completedWeight: progressInfo.completedWeight,
            totalWeight: progressInfo.totalWeight,
            percentage: (progressInfo.completedWeight / progressInfo.totalWeight) * 100
        };
    }

    /**
     * Dispose all active progress
     */
    public dispose(): void {
        this.activeProgress.clear();
        this.contextLogger.info('ProgressManager disposed');
    }
}
