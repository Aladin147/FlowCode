import * as vscode from 'vscode';
import { logger } from '../utils/logger';

export interface NotificationOptions {
    modal?: boolean;
    detail?: string;
    actions?: string[];
    timeout?: number;
    showAgain?: boolean;
}

export interface ErrorContext {
    operation: string;
    file?: string;
    line?: number;
    suggestion?: string;
    documentation?: string;
    reportable?: boolean;
}

export class NotificationManager {
    private static instance: NotificationManager;
    private contextLogger = logger.createContextLogger('NotificationManager');
    private suppressedNotifications = new Set<string>();
    private notificationHistory: Array<{
        type: 'info' | 'warning' | 'error';
        message: string;
        timestamp: number;
        context?: any;
    }> = [];

    private constructor() {}

    public static getInstance(): NotificationManager {
        if (!NotificationManager.instance) {
            NotificationManager.instance = new NotificationManager();
        }
        return NotificationManager.instance;
    }

    /**
     * Show an enhanced error message with context and suggestions
     */
    public async showError(
        message: string,
        context?: ErrorContext,
        options?: NotificationOptions
    ): Promise<string | undefined> {
        const errorId = this.generateErrorId(message, context);
        
        if (this.suppressedNotifications.has(errorId) && options?.showAgain !== true) {
            return undefined;
        }

        this.logNotification('error', message, context);

        let enhancedMessage = message;
        const actions: string[] = options?.actions || [];

        // Add context-specific suggestions
        if (context?.suggestion) {
            enhancedMessage += `\n\n💡 Suggestion: ${context.suggestion}`;
        }

        if (context?.file) {
            enhancedMessage += `\n📁 File: ${context.file}`;
            if (context.line) {
                enhancedMessage += `:${context.line}`;
            }
        }

        // Add helpful actions
        if (context?.documentation) {
            actions.push('📖 View Documentation');
        }

        if (context?.reportable !== false) {
            actions.push('🐛 Report Issue');
        }

        actions.push('❌ Don\'t Show Again');

        const result = await vscode.window.showErrorMessage(
            enhancedMessage,
            { modal: options?.modal || false, detail: options?.detail },
            ...actions
        );

        await this.handleActionResult(result, context, errorId);
        return result;
    }

    /**
     * Show an enhanced warning message
     */
    public async showWarning(
        message: string,
        context?: Partial<ErrorContext>,
        options?: NotificationOptions
    ): Promise<string | undefined> {
        const warningId = this.generateErrorId(message, context);
        
        if (this.suppressedNotifications.has(warningId) && options?.showAgain !== true) {
            return undefined;
        }

        this.logNotification('warning', message, context);

        let enhancedMessage = message;
        const actions: string[] = options?.actions || [];

        if (context?.suggestion) {
            enhancedMessage += `\n\n💡 Tip: ${context.suggestion}`;
        }

        if (context?.documentation) {
            actions.push('📖 Learn More');
        }

        actions.push('❌ Don\'t Show Again');

        const result = await vscode.window.showWarningMessage(
            enhancedMessage,
            { modal: options?.modal || false, detail: options?.detail },
            ...actions
        );

        await this.handleActionResult(result, context, warningId);
        return result;
    }

    /**
     * Show an enhanced information message
     */
    public async showInfo(
        message: string,
        context?: Partial<ErrorContext>,
        options?: NotificationOptions
    ): Promise<string | undefined> {
        this.logNotification('info', message, context);

        let enhancedMessage = message;
        const actions: string[] = options?.actions || [];

        if (context?.suggestion) {
            enhancedMessage += `\n\n💡 ${context.suggestion}`;
        }

        if (context?.documentation) {
            actions.push('📖 Learn More');
        }

        const result = await vscode.window.showInformationMessage(
            enhancedMessage,
            { modal: options?.modal || false, detail: options?.detail },
            ...actions
        );

        await this.handleActionResult(result, context);
        return result;
    }

    /**
     * Show a success notification with celebration
     */
    public async showSuccess(
        message: string,
        details?: string,
        actions?: string[]
    ): Promise<string | undefined> {
        this.logNotification('info', `✅ ${message}`, { details });

        const enhancedMessage = `✅ ${message}`;
        const allActions = actions || [];

        return await vscode.window.showInformationMessage(
            enhancedMessage,
            { detail: details },
            ...allActions
        );
    }

    /**
     * Show a progress notification that auto-dismisses
     */
    public showProgressNotification(
        message: string,
        duration: number = 3000
    ): void {
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: message,
            cancellable: false
        }, async (progress) => {
            const steps = 20;
            const stepDuration = duration / steps;
            
            for (let i = 0; i <= steps; i++) {
                progress.report({ increment: 5 });
                if (i < steps) {
                    await new Promise(resolve => setTimeout(resolve, stepDuration));
                }
            }
        });
    }

    /**
     * Show a quick toast notification
     */
    public showToast(
        message: string,
        type: 'info' | 'warning' | 'error' = 'info',
        duration: number = 2000
    ): void {
        const icon = type === 'error' ? '❌' : type === 'warning' ? '⚠️' : 'ℹ️';
        const enhancedMessage = `${icon} ${message}`;

        // Use status bar for quick toasts
        const statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            1000
        );
        
        statusBarItem.text = enhancedMessage;
        statusBarItem.show();

        setTimeout(() => {
            statusBarItem.dispose();
        }, duration);
    }

    /**
     * Show a confirmation dialog with enhanced options
     */
    public async showConfirmation(
        message: string,
        options: {
            confirmText?: string;
            cancelText?: string;
            detail?: string;
            modal?: boolean;
            destructive?: boolean;
        } = {}
    ): Promise<boolean> {
        const confirmText = options.confirmText || (options.destructive ? '🗑️ Delete' : '✅ Confirm');
        const cancelText = options.cancelText || '❌ Cancel';

        const result = await vscode.window.showWarningMessage(
            message,
            { 
                modal: options.modal || options.destructive || false,
                detail: options.detail 
            },
            confirmText,
            cancelText
        );

        return result === confirmText;
    }

    /**
     * Show input dialog with validation
     */
    public async showInput(
        prompt: string,
        options: {
            placeholder?: string;
            value?: string;
            password?: boolean;
            validator?: (value: string) => string | null;
            ignoreFocusOut?: boolean;
        } = {}
    ): Promise<string | undefined> {
        return await vscode.window.showInputBox({
            prompt,
            placeHolder: options.placeholder,
            value: options.value,
            password: options.password,
            ignoreFocusOut: options.ignoreFocusOut || true,
            validateInput: options.validator
        });
    }

    /**
     * Show quick pick with enhanced options
     */
    public async showQuickPick<T extends vscode.QuickPickItem>(
        items: T[],
        options: {
            title?: string;
            placeholder?: string;
            canPickMany?: boolean;
            ignoreFocusOut?: boolean;
            matchOnDescription?: boolean;
            matchOnDetail?: boolean;
        } = {}
    ): Promise<T | T[] | undefined> {
        return await vscode.window.showQuickPick(items, {
            title: options.title,
            placeHolder: options.placeholder,
            canPickMany: options.canPickMany,
            ignoreFocusOut: options.ignoreFocusOut || true,
            matchOnDescription: options.matchOnDescription,
            matchOnDetail: options.matchOnDetail
        });
    }

    /**
     * Handle action results from notifications
     */
    private async handleActionResult(
        result: string | undefined,
        context?: Partial<ErrorContext>,
        notificationId?: string
    ): Promise<void> {
        if (!result) return;

        switch (result) {
            case '📖 View Documentation':
            case '📖 Learn More':
                if (context?.documentation) {
                    vscode.env.openExternal(vscode.Uri.parse(context.documentation));
                }
                break;

            case '🐛 Report Issue':
                await this.openIssueReporter(context);
                break;

            case '❌ Don\'t Show Again':
                if (notificationId) {
                    this.suppressedNotifications.add(notificationId);
                }
                break;
        }
    }

    /**
     * Open issue reporter with context
     */
    private async openIssueReporter(context?: Partial<ErrorContext>): Promise<void> {
        const issueBody = this.generateIssueBody(context);
        const issueUrl = `https://github.com/your-repo/flowcode/issues/new?body=${encodeURIComponent(issueBody)}`;
        
        await vscode.env.openExternal(vscode.Uri.parse(issueUrl));
    }

    /**
     * Generate issue body for bug reports
     */
    private generateIssueBody(context?: Partial<ErrorContext>): string {
        let body = '## Bug Report\n\n';
        
        if (context?.operation) {
            body += `**Operation:** ${context.operation}\n`;
        }
        
        if (context?.file) {
            body += `**File:** ${context.file}\n`;
        }
        
        if (context?.line) {
            body += `**Line:** ${context.line}\n`;
        }
        
        body += '\n**Environment:**\n';
        body += `- VS Code Version: ${vscode.version}\n`;
        body += `- Platform: ${process.platform}\n`;
        body += `- Node Version: ${process.version}\n`;
        
        body += '\n**Description:**\n';
        body += 'Please describe what happened and what you expected to happen.\n';
        
        body += '\n**Steps to Reproduce:**\n';
        body += '1. \n2. \n3. \n';
        
        return body;
    }

    /**
     * Generate unique ID for notifications
     */
    private generateErrorId(message: string, context?: Partial<ErrorContext>): string {
        const contextStr = context ? JSON.stringify(context) : '';
        return Buffer.from(message + contextStr).toString('base64').substring(0, 16);
    }

    /**
     * Log notification for history
     */
    private logNotification(
        type: 'info' | 'warning' | 'error',
        message: string,
        context?: any
    ): void {
        this.notificationHistory.push({
            type,
            message,
            timestamp: Date.now(),
            context
        });

        // Keep only last 100 notifications
        if (this.notificationHistory.length > 100) {
            this.notificationHistory = this.notificationHistory.slice(-100);
        }

        this.contextLogger.info(`Notification shown: ${type}`, {
            message: message.substring(0, 100),
            context
        });
    }

    /**
     * Get notification history
     */
    public getNotificationHistory(): typeof this.notificationHistory {
        return [...this.notificationHistory];
    }

    /**
     * Clear suppressed notifications
     */
    public clearSuppressed(): void {
        this.suppressedNotifications.clear();
        this.contextLogger.info('Cleared suppressed notifications');
    }

    /**
     * Dispose notification manager
     */
    public dispose(): void {
        this.suppressedNotifications.clear();
        this.notificationHistory = [];
        this.contextLogger.info('NotificationManager disposed');
    }
}
