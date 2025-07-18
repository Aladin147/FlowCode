import * as vscode from 'vscode';
import { logger } from './logger';

export interface ErrorContext {
    operation: string;
    component: string;
    severity?: 'info' | 'warning' | 'error' | 'critical';
    category?: 'user' | 'system' | 'network' | 'configuration' | 'dependency' | 'general';
    userId?: string;
    workspaceRoot?: string;
    additionalInfo?: { [key: string]: any };
}

export interface UserFriendlyError {
    title: string;
    message: string;
    details?: string;
    actions: ErrorAction[];
    severity: 'info' | 'warning' | 'error' | 'critical';
    category: 'user' | 'system' | 'network' | 'configuration' | 'dependency';
    recoverable: boolean;
    reportable: boolean;
}

export interface ErrorAction {
    label: string;
    action: 'command' | 'url' | 'retry' | 'ignore' | 'report';
    value: string;
    primary?: boolean;
}

export interface ErrorReport {
    errorId: string;
    timestamp: number;
    context: ErrorContext;
    originalError: Error;
    userFriendlyError: UserFriendlyError;
    stackTrace: string;
    systemInfo: {
        platform: string;
        vscodeVersion: string;
        extensionVersion: string;
        nodeVersion: string;
    };
}

export class EnhancedErrorHandler {
    private static instance: EnhancedErrorHandler;
    private contextLogger = logger.createContextLogger('EnhancedErrorHandler');
    private errorReports: Map<string, ErrorReport> = new Map();
    private errorPatterns: Map<RegExp, (error: Error, context: ErrorContext) => UserFriendlyError> = new Map();

    constructor() {
        this.initializeErrorPatterns();
        this.contextLogger.info('EnhancedErrorHandler initialized');
    }

    public static getInstance(): EnhancedErrorHandler {
        if (!EnhancedErrorHandler.instance) {
            EnhancedErrorHandler.instance = new EnhancedErrorHandler();
        }
        return EnhancedErrorHandler.instance;
    }

    /**
     * Handle error with enhanced user experience
     */
    public async handleError(error: Error, context: ErrorContext): Promise<string | undefined> {
        try {
            // Generate error ID
            const errorId = this.generateErrorId();

            // Create user-friendly error
            const userFriendlyError = this.createUserFriendlyError(error, context);

            // Create error report
            const errorReport: ErrorReport = {
                errorId,
                timestamp: Date.now(),
                context,
                originalError: error,
                userFriendlyError,
                stackTrace: error.stack || '',
                systemInfo: this.getSystemInfo()
            };

            // Store error report
            this.errorReports.set(errorId, errorReport);

            // Log error
            this.contextLogger.error(`Error in ${context.component}.${context.operation}`, error, {
                errorId,
                context,
                userFriendly: userFriendlyError
            });

            // Show user-friendly error to user
            const selectedAction = await this.showUserFriendlyError(userFriendlyError, errorId);

            // Handle selected action
            if (selectedAction) {
                await this.handleErrorAction(selectedAction, errorReport);
            }

            return selectedAction;

        } catch (handlingError) {
            // Fallback error handling
            this.contextLogger.error('Error handler failed', handlingError as Error);
            vscode.window.showErrorMessage(`An unexpected error occurred: ${error.message}`);
            return undefined;
        }
    }

    /**
     * Create user-friendly error from technical error
     */
    private createUserFriendlyError(error: Error, context: ErrorContext): UserFriendlyError {
        // Check for known error patterns
        for (const [pattern, handler] of this.errorPatterns) {
            if (pattern.test(error.message) || pattern.test(error.name)) {
                return handler(error, context);
            }
        }

        // Default user-friendly error
        return this.createDefaultUserFriendlyError(error, context);
    }

    /**
     * Initialize error patterns and handlers
     */
    private initializeErrorPatterns(): void {
        // Network errors
        this.errorPatterns.set(/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|fetch failed/i, (error, context) => ({
            title: 'Network Connection Error',
            message: 'FlowCode cannot connect to the required services. Please check your internet connection.',
            details: `Technical details: ${error.message}`,
            actions: [
                { label: 'Retry', action: 'retry', value: 'retry', primary: true },
                { label: 'Check Network Settings', action: 'command', value: 'workbench.action.openSettings' },
                { label: 'Work Offline', action: 'command', value: 'flowcode.enableOfflineMode' },
                { label: 'Report Issue', action: 'report', value: 'network' }
            ],
            severity: 'error',
            category: 'network',
            recoverable: true,
            reportable: true
        }));

        // API key errors
        this.errorPatterns.set(/api.?key|unauthorized|authentication|401/i, (error, context) => ({
            title: 'API Authentication Error',
            message: 'FlowCode cannot authenticate with AI services. Please check your API key configuration.',
            details: 'Your API key may be missing, invalid, or expired.',
            actions: [
                { label: 'Configure API Key', action: 'command', value: 'flowcode.configureApiKey', primary: true },
                { label: 'Check API Key Status', action: 'command', value: 'flowcode.checkApiKeyStatus' },
                { label: 'Get Help', action: 'url', value: 'https://flowcode.dev/docs/api-keys' },
                { label: 'Report Issue', action: 'report', value: 'authentication' }
            ],
            severity: 'error',
            category: 'configuration',
            recoverable: true,
            reportable: false
        }));

        // File system errors
        this.errorPatterns.set(/ENOENT|EACCES|EPERM|permission denied/i, (error, context) => ({
            title: 'File Access Error',
            message: 'FlowCode cannot access the required files or directories.',
            details: `File operation failed: ${error.message}`,
            actions: [
                { label: 'Check Permissions', action: 'command', value: 'workbench.action.terminal.new', primary: true },
                { label: 'Select Different Location', action: 'command', value: 'workbench.action.files.openFolder' },
                { label: 'Run as Administrator', action: 'command', value: 'workbench.action.reloadWindow' },
                { label: 'Get Help', action: 'url', value: 'https://flowcode.dev/docs/troubleshooting' }
            ],
            severity: 'error',
            category: 'system',
            recoverable: true,
            reportable: true
        }));

        // Memory errors
        this.errorPatterns.set(/out of memory|heap|maximum call stack/i, (error, context) => ({
            title: 'Memory Error',
            message: 'FlowCode has encountered a memory issue. This may be due to processing large files or complex operations.',
            details: 'Try reducing the scope of the operation or optimizing memory usage.',
            actions: [
                { label: 'Optimize Memory', action: 'command', value: 'flowcode.optimizeMemory', primary: true },
                { label: 'Restart Extension', action: 'command', value: 'workbench.action.reloadWindow' },
                { label: 'Reduce File Size', action: 'ignore', value: 'reduce_scope' },
                { label: 'Report Issue', action: 'report', value: 'memory' }
            ],
            severity: 'warning',
            category: 'system',
            recoverable: true,
            reportable: true
        }));

        // Dependency errors
        this.errorPatterns.set(/module not found|cannot resolve|dependency/i, (error, context) => ({
            title: 'Dependency Error',
            message: 'FlowCode is missing required dependencies or tools.',
            details: 'Some features may not work correctly until dependencies are installed.',
            actions: [
                { label: 'Check Dependencies', action: 'command', value: 'flowcode.checkDependencies', primary: true },
                { label: 'Install Missing Tools', action: 'command', value: 'flowcode.showInstallationGuide' },
                { label: 'Continue Anyway', action: 'ignore', value: 'continue' },
                { label: 'Get Help', action: 'url', value: 'https://flowcode.dev/docs/installation' }
            ],
            severity: 'warning',
            category: 'dependency',
            recoverable: true,
            reportable: false
        }));

        // Configuration errors
        this.errorPatterns.set(/configuration|config|setting|invalid/i, (error, context) => ({
            title: 'Configuration Error',
            message: 'FlowCode configuration is invalid or incomplete.',
            details: 'Please check your FlowCode settings and ensure all required values are provided.',
            actions: [
                { label: 'Open Settings', action: 'command', value: 'workbench.action.openSettings', primary: true },
                { label: 'Reset Configuration', action: 'command', value: 'flowcode.resetConfiguration' },
                { label: 'Import Configuration', action: 'command', value: 'flowcode.importConfiguration' },
                { label: 'Get Help', action: 'url', value: 'https://flowcode.dev/docs/configuration' }
            ],
            severity: 'warning',
            category: 'configuration',
            recoverable: true,
            reportable: false
        }));

        // Git errors
        this.errorPatterns.set(/git|repository|branch|commit|merge/i, (error, context) => ({
            title: 'Git Operation Error',
            message: 'FlowCode encountered an error during git operations.',
            details: `Git operation failed: ${error.message}`,
            actions: [
                { label: 'Check Git Status', action: 'command', value: 'git.refresh', primary: true },
                { label: 'Open Git Panel', action: 'command', value: 'workbench.view.scm' },
                { label: 'Retry Operation', action: 'retry', value: 'retry' },
                { label: 'Skip Git Hooks', action: 'command', value: 'flowcode.disableGitHooks' }
            ],
            severity: 'warning',
            category: 'system',
            recoverable: true,
            reportable: false
        }));
    }

    /**
     * Create default user-friendly error
     */
    private createDefaultUserFriendlyError(error: Error, context: ErrorContext): UserFriendlyError {
        return {
            title: 'Unexpected Error',
            message: `An unexpected error occurred in ${context.component}. FlowCode will continue to work, but some features may be affected.`,
            details: `Technical details: ${error.message}`,
            actions: [
                { label: 'Retry', action: 'retry', value: 'retry', primary: true },
                { label: 'Restart Extension', action: 'command', value: 'workbench.action.reloadWindow' },
                { label: 'Report Issue', action: 'report', value: 'general' },
                { label: 'Continue', action: 'ignore', value: 'continue' }
            ],
            severity: 'error',
            category: 'system',
            recoverable: true,
            reportable: true
        };
    }

    /**
     * Show user-friendly error to user
     */
    private async showUserFriendlyError(userFriendlyError: UserFriendlyError, errorId: string): Promise<string | undefined> {
        const message = userFriendlyError.message;
        const actions = userFriendlyError.actions.map(action => action.label);

        let selectedAction: string | undefined;

        switch (userFriendlyError.severity) {
            case 'critical':
            case 'error':
                selectedAction = await vscode.window.showErrorMessage(message, ...actions);
                break;
            case 'warning':
                selectedAction = await vscode.window.showWarningMessage(message, ...actions);
                break;
            case 'info':
                selectedAction = await vscode.window.showInformationMessage(message, ...actions);
                break;
        }

        return selectedAction;
    }

    /**
     * Handle error action selected by user
     */
    private async handleErrorAction(selectedAction: string, errorReport: ErrorReport): Promise<void> {
        try {
            const action = errorReport.userFriendlyError.actions.find(a => a.label === selectedAction);
            if (!action) {
                return;
            }

            switch (action.action) {
                case 'command':
                    await vscode.commands.executeCommand(action.value);
                    break;
                case 'url':
                    await vscode.env.openExternal(vscode.Uri.parse(action.value));
                    break;
                case 'retry':
                    // Retry logic would be implemented by the calling component
                    this.contextLogger.info(`User requested retry for error: ${errorReport.errorId}`);
                    break;
                case 'report':
                    await this.reportError(errorReport);
                    break;
                case 'ignore':
                    this.contextLogger.info(`User chose to ignore error: ${errorReport.errorId}`);
                    break;
            }

        } catch (error) {
            this.contextLogger.error('Failed to handle error action', error as Error);
        }
    }

    /**
     * Report error for analysis
     */
    private async reportError(errorReport: ErrorReport): Promise<void> {
        try {
            // In a real implementation, this would send the error report to a service
            // For now, we'll create a local report
            const reportContent = this.generateErrorReportContent(errorReport);
            
            const doc = await vscode.workspace.openTextDocument({
                content: reportContent,
                language: 'markdown'
            });

            await vscode.window.showTextDocument(doc);

            vscode.window.showInformationMessage(
                'Error report generated. You can review and submit this report to help improve FlowCode.',
                'Copy to Clipboard'
            ).then(action => {
                if (action === 'Copy to Clipboard') {
                    vscode.env.clipboard.writeText(reportContent);
                }
            });

        } catch (error) {
            this.contextLogger.error('Failed to report error', error as Error);
        }
    }

    /**
     * Generate error report content
     */
    private generateErrorReportContent(errorReport: ErrorReport): string {
        return `# FlowCode Error Report

**Error ID**: ${errorReport.errorId}
**Timestamp**: ${new Date(errorReport.timestamp).toISOString()}

## Error Summary
- **Component**: ${errorReport.context.component}
- **Operation**: ${errorReport.context.operation}
- **Severity**: ${errorReport.userFriendlyError.severity}
- **Category**: ${errorReport.userFriendlyError.category}
- **Recoverable**: ${errorReport.userFriendlyError.recoverable}

## User-Friendly Description
**Title**: ${errorReport.userFriendlyError.title}
**Message**: ${errorReport.userFriendlyError.message}
${errorReport.userFriendlyError.details ? `**Details**: ${errorReport.userFriendlyError.details}` : ''}

## Technical Details
**Error Message**: ${errorReport.originalError.message}
**Error Name**: ${errorReport.originalError.name}

## Stack Trace
\`\`\`
${errorReport.stackTrace}
\`\`\`

## System Information
- **Platform**: ${errorReport.systemInfo.platform}
- **VS Code Version**: ${errorReport.systemInfo.vscodeVersion}
- **Extension Version**: ${errorReport.systemInfo.extensionVersion}
- **Node.js Version**: ${errorReport.systemInfo.nodeVersion}

## Context
- **Workspace**: ${errorReport.context.workspaceRoot || 'N/A'}
- **Additional Info**: ${JSON.stringify(errorReport.context.additionalInfo || {}, null, 2)}

## Next Steps
Please review this error report and consider submitting it to the FlowCode team for analysis.
You can also check the FlowCode documentation for troubleshooting steps.
`;
    }

    /**
     * Generate unique error ID
     */
    private generateErrorId(): string {
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substr(2, 5);
        return `FC-${timestamp}-${random}`.toUpperCase();
    }

    /**
     * Get system information
     */
    private getSystemInfo() {
        return {
            platform: process.platform,
            vscodeVersion: vscode.version,
            extensionVersion: 'FlowCode v0.1.0', // Would be read from package.json
            nodeVersion: process.version
        };
    }

    /**
     * Get error report by ID
     */
    public getErrorReport(errorId: string): ErrorReport | undefined {
        return this.errorReports.get(errorId);
    }

    /**
     * Get all error reports
     */
    public getAllErrorReports(): ErrorReport[] {
        return Array.from(this.errorReports.values());
    }

    /**
     * Clear error reports
     */
    public clearErrorReports(): void {
        this.errorReports.clear();
    }

    /**
     * Get error statistics
     */
    public getErrorStatistics(): {
        totalErrors: number;
        errorsByCategory: { [category: string]: number };
        errorsBySeverity: { [severity: string]: number };
        recoverableErrors: number;
        reportableErrors: number;
    } {
        const reports = this.getAllErrorReports();
        const stats = {
            totalErrors: reports.length,
            errorsByCategory: {} as { [category: string]: number },
            errorsBySeverity: {} as { [severity: string]: number },
            recoverableErrors: 0,
            reportableErrors: 0
        };

        for (const report of reports) {
            const category = report.userFriendlyError.category;
            const severity = report.userFriendlyError.severity;

            stats.errorsByCategory[category] = (stats.errorsByCategory[category] || 0) + 1;
            stats.errorsBySeverity[severity] = (stats.errorsBySeverity[severity] || 0) + 1;

            if (report.userFriendlyError.recoverable) {
                stats.recoverableErrors++;
            }
            if (report.userFriendlyError.reportable) {
                stats.reportableErrors++;
            }
        }

        return stats;
    }

    /**
     * Dispose resources
     */
    public dispose(): void {
        this.errorReports.clear();
        this.contextLogger.info('EnhancedErrorHandler disposed');
    }
}
