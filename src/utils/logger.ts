import * as vscode from 'vscode';

export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3
}

export interface LogEntry {
    timestamp: Date;
    level: LogLevel;
    message: string;
    context?: string;
    error?: Error;
    metadata?: any;
}

/**
 * Centralized logging system for FlowCode extension
 */
export class Logger {
    private static instance: Logger;
    private outputChannel: vscode.OutputChannel;
    private logLevel: LogLevel = LogLevel.INFO;
    private logEntries: LogEntry[] = [];
    private maxLogEntries: number = 1000;

    private constructor() {
        this.outputChannel = vscode.window.createOutputChannel('FlowCode');
    }

    public static getInstance(): Logger {
        if (!Logger.instance) {
            Logger.instance = new Logger();
        }
        return Logger.instance;
    }

    public setLogLevel(level: LogLevel): void {
        this.logLevel = level;
    }

    public debug(message: string, context?: string, metadata?: any): void {
        this.log(LogLevel.DEBUG, message, context, undefined, metadata);
    }

    public info(message: string, context?: string, metadata?: any): void {
        this.log(LogLevel.INFO, message, context, undefined, metadata);
    }

    public warn(message: string, context?: string, error?: Error, metadata?: any): void {
        this.log(LogLevel.WARN, message, context, error, metadata);
    }

    public error(message: string, context?: string, error?: Error, metadata?: any): void {
        this.log(LogLevel.ERROR, message, context, error, metadata);
    }

    private log(level: LogLevel, message: string, context?: string, error?: Error, metadata?: any): void {
        if (level < this.logLevel) {
            return;
        }

        const entry: LogEntry = {
            timestamp: new Date(),
            level,
            message,
            context,
            error,
            metadata
        };

        this.logEntries.push(entry);
        this.trimLogEntries();
        this.writeToOutputChannel(entry);

        // Show error messages to user for ERROR level
        if (level === LogLevel.ERROR) {
            this.showErrorToUser(message, error);
        }
    }

    private writeToOutputChannel(entry: LogEntry): void {
        const timestamp = entry.timestamp.toISOString();
        const levelStr = LogLevel[entry.level].padEnd(5);
        const contextStr = entry.context ? `[${entry.context}] ` : '';
        const errorStr = entry.error ? ` | Error: ${entry.error.message}` : '';
        const metadataStr = entry.metadata ? ` | Metadata: ${JSON.stringify(entry.metadata)}` : '';

        const logLine = `${timestamp} ${levelStr} ${contextStr}${entry.message}${errorStr}${metadataStr}`;
        this.outputChannel.appendLine(logLine);

        if (entry.error && entry.error.stack) {
            this.outputChannel.appendLine(`Stack trace: ${entry.error.stack}`);
        }
    }

    private showErrorToUser(message: string, error?: Error): void {
        const userMessage = error ? `${message}: ${error.message}` : message;
        vscode.window.showErrorMessage(`FlowCode: ${userMessage}`, 'Show Logs').then(selection => {
            if (selection === 'Show Logs') {
                this.outputChannel.show();
            }
        });
    }

    private trimLogEntries(): void {
        if (this.logEntries.length > this.maxLogEntries) {
            this.logEntries = this.logEntries.slice(-this.maxLogEntries);
        }
    }

    public getLogEntries(level?: LogLevel): LogEntry[] {
        if (level !== undefined) {
            return this.logEntries.filter(entry => entry.level >= level);
        }
        return [...this.logEntries];
    }

    public clearLogs(): void {
        this.logEntries = [];
        this.outputChannel.clear();
    }

    public show(): void {
        this.outputChannel.show();
    }

    public dispose(): void {
        this.outputChannel.dispose();
    }

    /**
     * Create a contextual logger for a specific component
     */
    public createContextLogger(context: string): ContextLogger {
        return new ContextLogger(this, context);
    }
}

/**
 * Contextual logger that automatically includes context in all log messages
 */
export class ContextLogger {
    constructor(private logger: Logger, private context: string) {}

    public debug(message: string, metadata?: any): void {
        this.logger.debug(message, this.context, metadata);
    }

    public info(message: string, metadata?: any): void {
        this.logger.info(message, this.context, metadata);
    }

    public warn(message: string, error?: Error, metadata?: any): void {
        this.logger.warn(message, this.context, error, metadata);
    }

    public error(message: string, error?: Error, metadata?: any): void {
        this.logger.error(message, this.context, error, metadata);
    }
}

// Export singleton instance
export const logger = Logger.getInstance();