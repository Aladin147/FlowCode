import * as vscode from 'vscode';
import { logger } from './logger';

/**
 * Decorator for handling errors in service methods
 */
export function handleErrors(context?: string) {
    return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
        const method = descriptor.value;

        descriptor.value = async function (...args: any[]) {
            try {
                return await method.apply(this, args);
            } catch (error) {
                const errorHandler = ErrorHandler.getInstance();
                await errorHandler.handleError(error as Error, context || `${target.constructor.name}.${propertyName}`);
                throw error; // Re-throw for caller to handle if needed
            }
        };
    };
}

/**
 * Decorator for handling errors silently (log only)
 */
export function handleErrorsSilently(context?: string) {
    return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
        const method = descriptor.value;

        descriptor.value = async function (...args: any[]) {
            try {
                return await method.apply(this, args);
            } catch (error) {
                const errorHandler = ErrorHandler.getInstance();
                errorHandler.handleErrorSilently(error as Error, context || `${target.constructor.name}.${propertyName}`);
                throw error; // Re-throw for caller to handle if needed
            }
        };
    };
}

export interface UserFriendlyError {
    title: string;
    message: string;
    actions?: ErrorAction[];
    showLogs?: boolean;
}

export interface ErrorAction {
    label: string;
    action: () => any;
}

/**
 * Error handler that provides user-friendly error messages and recovery actions
 */
export class ErrorHandler {
    private static instance: ErrorHandler;
    private contextLogger = logger.createContextLogger('ErrorHandler');

    public static getInstance(): ErrorHandler {
        if (!ErrorHandler.instance) {
            ErrorHandler.instance = new ErrorHandler();
        }
        return ErrorHandler.instance;
    }

    /**
     * Handle an error with user-friendly messaging
     */
    public async handleError(error: Error, context?: string): Promise<void> {
        this.contextLogger.error(`Error in ${context || 'unknown context'}`, error);
        const userError = this.createUserFriendlyError(error, context);
        await this.showErrorToUser(userError);
    }

    /**
     * Handle an error silently (log only, no user notification)
     */
    public handleErrorSilently(error: Error, context?: string): void {
        this.contextLogger.error(`Silent error in ${context || 'unknown context'}`, error);
    }

    /**
     * Create and handle a custom error with specific user message
     */
    public async handleCustomError(title: string, message: string, actions?: ErrorAction[]): Promise<void> {
        const userError: UserFriendlyError = {
            title,
            message,
            actions
        };
        await this.showErrorToUser(userError);
    }

    /**
     * Wrap an async operation with error handling
     */
    public async withErrorHandling<T>(
        operation: () => Promise<T>,
        context: string,
        fallbackValue?: T
    ): Promise<T | undefined> {
        try {
            return await operation();
        } catch (error) {
            await this.handleError(error as Error, context);
            return fallbackValue;
        }
    }

    /**
     * Wrap a sync operation with error handling
     */
    public withErrorHandlingSync<T>(
        operation: () => T,
        context: string,
        fallbackValue?: T
    ): T | undefined {
        try {
            return operation();
        } catch (error) {
            this.handleErrorSilently(error as Error, context);
            return fallbackValue;
        }
    }

    /**
     * Create a user-friendly error from a technical error
     */
    private createUserFriendlyError(error: Error, context?: string): UserFriendlyError {
        const errorMessage = error.message.toLowerCase();

        // API Configuration Errors
        if (errorMessage.includes('api key not configured')) {
            return {
                title: 'API Key Required',
                message: 'FlowCode needs an API key to provide AI-powered features. Please configure your OpenAI or Anthropic API key.',
                actions: [
                    {
                        label: 'Configure API Key',
                        action: () => vscode.commands.executeCommand('flowcode.configureApiKey')
                    }
                ]
            };
        }

        // Network/API Errors
        if (errorMessage.includes('network') || errorMessage.includes('timeout') || errorMessage.includes('enotfound')) {
            return {
                title: 'Network Connection Issue',
                message: 'FlowCode cannot connect to the AI service. Please check your internet connection and try again.',
                actions: [
                    {
                        label: 'Retry',
                        action: () => {
                            // Retry logic would be implemented by the calling service
                        }
                    }
                ]
            };
        }

        // Tool Missing Errors
        if (errorMessage.includes('eslint') && errorMessage.includes('not found')) {
            return {
                title: 'ESLint Not Found',
                message: 'ESLint is required for JavaScript/TypeScript linting but was not found. Please install ESLint in your project.',
                actions: [
                    {
                        label: 'Install ESLint',
                        action: async () => {
                            const terminal = vscode.window.createTerminal('FlowCode Setup');
                            terminal.sendText('npm install --save-dev eslint');
                            terminal.show();
                        }
                    }
                ]
            };
        }

        if (errorMessage.includes('ruff') && errorMessage.includes('not found')) {
            return {
                title: 'Ruff Not Found',
                message: 'Ruff is required for Python linting but was not found. Please install Ruff.',
                actions: [
                    {
                        label: 'Install Ruff',
                        action: async () => {
                            const terminal = vscode.window.createTerminal('FlowCode Setup');
                            terminal.sendText('pip install ruff');
                            terminal.show();
                        }
                    }
                ]
            };
        }

        // Git Errors
        if (errorMessage.includes('git') && errorMessage.includes('not found')) {
            return {
                title: 'Git Not Found',
                message: 'Git is required for FlowCode features but was not found. Please install Git and ensure it\'s in your PATH.',
                actions: [
                    {
                        label: 'Download Git',
                        action: () => vscode.env.openExternal(vscode.Uri.parse('https://git-scm.com/downloads'))
                    }
                ]
            };
        }

        // Workspace Errors
        if (errorMessage.includes('no workspace folder')) {
            return {
                title: 'No Workspace Open',
                message: 'FlowCode requires an open workspace to function. Please open a folder or workspace.',
                actions: [
                    {
                        label: 'Open Folder',
                        action: () => vscode.commands.executeCommand('vscode.openFolder')
                    }
                ]
            };
        }

        // Permission Errors
        if (errorMessage.includes('permission denied') || errorMessage.includes('eacces')) {
            return {
                title: 'Permission Denied',
                message: 'FlowCode doesn\'t have permission to access the required files or directories. Please check file permissions.',
                showLogs: true
            };
        }

        // Rate Limit Errors
        if (errorMessage.includes('rate limit') || errorMessage.includes('quota exceeded')) {
            return {
                title: 'API Rate Limit Exceeded',
                message: 'You\'ve exceeded the API rate limit. Please wait a moment before trying again or check your API plan.',
                showLogs: true
            };
        }

        // Tree-sitter Errors
        if (errorMessage.includes('tree-sitter') || errorMessage.includes('parser')) {
            return {
                title: 'Code Parsing Error',
                message: 'FlowCode encountered an issue parsing your code. The graph visualization may not work correctly.',
                actions: [
                    {
                        label: 'Report Issue',
                        action: () => vscode.env.openExternal(vscode.Uri.parse('https://github.com/Aladin147/FlowCode/issues'))
                    }
                ]
            };
        }

        // Git Errors
        if (errorMessage.includes('git') || errorMessage.includes('repository')) {
            return {
                title: 'Git Repository Error',
                message: 'FlowCode requires a Git repository to function properly. Please initialize a Git repository or open a folder with an existing repository.',
                actions: [
                    {
                        label: 'Initialize Git',
                        action: async () => {
                            const terminal = vscode.window.createTerminal('FlowCode Git Setup');
                            terminal.sendText('git init');
                            terminal.show();
                        }
                    }
                ]
            };
        }

        // Performance Errors
        if (errorMessage.includes('timeout') || errorMessage.includes('performance')) {
            return {
                title: 'Performance Issue',
                message: 'FlowCode is taking longer than expected to complete this operation. This might be due to large files or system load.',
                actions: [
                    {
                        label: 'Retry',
                        action: () => {
                            // Retry would be handled by calling service
                        }
                    }
                ]
            };
        }

        // Validation Errors
        if (errorMessage.includes('validation') || errorMessage.includes('invalid')) {
            return {
                title: 'Input Validation Error',
                message: 'The provided input is not valid. Please check your code and try again.',
                showLogs: true
            };
        }

        // Generic Error
        return {
            title: context ? `${context} Error` : 'FlowCode Error',
            message: `An unexpected error occurred: ${error.message}`,
            showLogs: true,
            actions: [
                {
                    label: 'Report Issue',
                    action: () => vscode.env.openExternal(vscode.Uri.parse('https://github.com/Aladin147/FlowCode/issues'))
                }
            ]
        };
    }

    /**
     * Show error to user with appropriate actions
     */
    private async showErrorToUser(userError: UserFriendlyError): Promise<void> {
        this.contextLogger.error(`Showing user error: ${userError.title}`, undefined, { message: userError.message });

        const actions = userError.actions?.map(a => a.label) || [];
        if (userError.showLogs) {
            actions.push('Show Logs');
        }

        const selection = await vscode.window.showErrorMessage(
            `${userError.title}: ${userError.message}`,
            ...actions
        );

        if (selection) {
            if (selection === 'Show Logs') {
                logger.show();
            } else {
                const action = userError.actions?.find(a => a.label === selection);
                if (action) {
                    try {
                        await action.action();
                    } catch (actionError) {
                        this.contextLogger.error('Error action failed', actionError as Error);
                        vscode.window.showErrorMessage(`Failed to execute action: ${(actionError as Error).message}`);
                    }
                }
            }
        }
    }
}

// Export singleton instance
export const errorHandler = ErrorHandler.getInstance();