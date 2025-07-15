import * as vscode from 'vscode';
import { logger } from '../utils/logger';
import { ConfigurationManager } from '../utils/configuration-manager';
import { PerformanceMonitor } from '../utils/performance-monitor';

export interface TelemetryConfig {
    enabled: boolean;
    collectUsageData: boolean;
    collectPerformanceData: boolean;
    collectErrorReports: boolean;
    collectFeedback: boolean;
    privacyLevel: 'minimal' | 'standard' | 'detailed';
    dataRetentionDays: number;
}

export interface TelemetryEvent {
    eventName: string;
    eventType: 'command' | 'feature' | 'error' | 'performance' | 'feedback';
    timestamp: number;
    properties: { [key: string]: any };
    measurements: { [key: string]: number };
}

export class TelemetryService {
    private contextLogger = logger.createContextLogger('TelemetryService');
    private config: TelemetryConfig;
    private performanceMonitor = PerformanceMonitor.getInstance();
    private eventQueue: TelemetryEvent[] = [];
    private isTransmitting = false;
    private sessionId: string;
    private hasUserConsented = false;
    private transmissionTimer: NodeJS.Timeout | null = null;
    private readonly TRANSMISSION_INTERVAL = 15 * 60 * 1000; // 15 minutes

    constructor(private configManager: ConfigurationManager) {
        this.config = this.getDefaultConfig();
        this.sessionId = this.generateSessionId();
        this.contextLogger.info('TelemetryService initialized');
    }

    /**
     * Initialize telemetry service
     */
    public async initialize(): Promise<void> {
        try {
            // Load configuration
            await this.loadConfiguration();

            // Check for user consent
            this.hasUserConsented = await this.checkUserConsent();

            // Start transmission timer if enabled
            if (this.config.enabled && this.hasUserConsented) {
                this.startTransmissionTimer();
            }

            this.contextLogger.info('Telemetry service initialized', {
                enabled: this.config.enabled,
                hasConsent: this.hasUserConsented
            });

        } catch (error) {
            this.contextLogger.error('Failed to initialize telemetry service', error as Error);
            throw error;
        }
    }

    /**
     * Track a telemetry event
     */
    public trackEvent(eventName: string, eventType: TelemetryEvent['eventType'], properties: { [key: string]: any } = {}, measurements: { [key: string]: number } = {}): void {
        if (!this.config.enabled || !this.hasUserConsented) {
            return;
        }

        // Check specific data collection settings
        if (eventType === 'command' || eventType === 'feature') {
            if (!this.config.collectUsageData) {return;}
        } else if (eventType === 'performance') {
            if (!this.config.collectPerformanceData) {return;}
        } else if (eventType === 'error') {
            if (!this.config.collectErrorReports) {return;}
        } else if (eventType === 'feedback') {
            if (!this.config.collectFeedback) {return;}
        }

        // Create event
        const event: TelemetryEvent = {
            eventName,
            eventType,
            timestamp: Date.now(),
            properties: this.sanitizeProperties(properties),
            measurements
        };

        // Add to queue
        this.eventQueue.push(event);
        this.contextLogger.debug(`Tracked event: ${eventName}`, { eventType });

        // Transmit if queue is getting large
        if (this.eventQueue.length >= 100) {
            this.transmitEvents();
        }
    }

    /**
     * Track command execution
     */
    public trackCommand(commandId: string, succeeded: boolean, executionTime?: number): void {
        this.trackEvent('command_executed', 'command', {
            commandId,
            succeeded
        }, executionTime ? { executionTime } : {});
    }

    /**
     * Track feature usage
     */
    public trackFeatureUsage(featureId: string, succeeded: boolean, properties: { [key: string]: any } = {}): void {
        this.trackEvent('feature_used', 'feature', {
            featureId,
            succeeded,
            ...properties
        });
    }

    /**
     * Track error occurrence
     */
    public trackError(errorName: string, errorMessage: string, stackTrace?: string, componentName?: string): void {
        this.trackEvent('error_occurred', 'error', {
            errorName,
            errorMessage,
            componentName,
            stackTrace: this.sanitizeStackTrace(stackTrace)
        });
    }

    /**
     * Track performance metric
     */
    public trackPerformanceMetric(metricName: string, value: number, context?: string): void {
        this.trackEvent('performance_metric', 'performance', {
            metricName,
            context
        }, {
            value
        });
    }

    /**
     * Track user feedback
     */
    public trackFeedback(feedbackType: string, rating: number, comments?: string): void {
        this.trackEvent('user_feedback', 'feedback', {
            feedbackType,
            comments: comments ? this.sanitizeUserInput(comments) : undefined
        }, {
            rating
        });
    }

    /**
     * Check if user has consented to telemetry
     */
    private async checkUserConsent(): Promise<boolean> {
        const config = vscode.workspace.getConfiguration('flowcode.telemetry');
        const hasConsented = config.get<boolean>('enabled', false);

        // If first time, prompt for consent
        if (config.inspect('enabled')?.defaultValue === undefined) {
            const consent = await this.promptForConsent();
            await config.update('enabled', consent, vscode.ConfigurationTarget.Global);
            return consent;
        }

        return hasConsented;
    }

    /**
     * Prompt user for telemetry consent
     */
    private async promptForConsent(): Promise<boolean> {
        const message = 'Help improve FlowCode by sending anonymous usage data and error reports. No personal data or code content will be collected. You can change this setting anytime.';
        
        const response = await vscode.window.showInformationMessage(
            message,
            { modal: true },
            'Yes, I consent',
            'No, opt out',
            'View privacy policy'
        );

        if (response === 'View privacy policy') {
            await vscode.env.openExternal(vscode.Uri.parse('https://flowcode.dev/privacy'));
            // Ask again after showing privacy policy
            return await this.promptForConsent();
        }

        return response === 'Yes, I consent';
    }

    /**
     * Start transmission timer
     */
    private startTransmissionTimer(): void {
        if (this.transmissionTimer) {
            clearInterval(this.transmissionTimer);
        }

        this.transmissionTimer = setInterval(() => {
            this.transmitEvents();
        }, this.TRANSMISSION_INTERVAL);
    }

    /**
     * Transmit collected events
     */
    private async transmitEvents(): Promise<void> {
        if (!this.config.enabled || !this.hasUserConsented || this.isTransmitting || this.eventQueue.length === 0) {
            return;
        }

        this.isTransmitting = true;

        try {
            const events = [...this.eventQueue];
            this.eventQueue = [];

            // Add session and environment info
            const payload = {
                sessionId: this.sessionId,
                timestamp: Date.now(),
                events,
                environment: this.getEnvironmentInfo()
            };

            // In a real implementation, this would send to a telemetry service
            // For now, we'll just log it
            this.contextLogger.info(`Transmitting ${events.length} telemetry events`);
            
            // Simulate transmission
            await new Promise(resolve => setTimeout(resolve, 500));

            this.contextLogger.info('Telemetry events transmitted successfully');
        } catch (error) {
            this.contextLogger.error('Failed to transmit telemetry events', error as Error);
            
            // Put events back in queue for retry
            this.eventQueue = [...this.eventQueue, ...this.eventQueue];
            
            // Limit queue size to prevent memory issues
            if (this.eventQueue.length > 1000) {
                this.eventQueue = this.eventQueue.slice(-1000);
            }
        } finally {
            this.isTransmitting = false;
        }
    }

    /**
     * Get environment information
     */
    private getEnvironmentInfo(): { [key: string]: any } {
        return {
            vscodeVersion: vscode.version,
            extensionVersion: '0.1.0', // Would be read from package.json
            platform: process.platform,
            architecture: process.arch,
            nodeVersion: process.version,
            memoryUsage: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) // MB
        };
    }

    /**
     * Generate unique session ID
     */
    private generateSessionId(): string {
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substring(2, 7);
        return `${timestamp}-${random}`;
    }

    /**
     * Sanitize properties to remove sensitive information
     */
    private sanitizeProperties(properties: { [key: string]: any }): { [key: string]: any } {
        const sanitized: { [key: string]: any } = {};
        
        for (const [key, value] of Object.entries(properties)) {
            // Skip sensitive keys
            if (this.isSensitiveKey(key)) {
                continue;
            }

            // Sanitize string values
            if (typeof value === 'string') {
                sanitized[key] = this.sanitizeString(key, value);
            } 
            // Handle objects recursively
            else if (typeof value === 'object' && value !== null) {
                sanitized[key] = this.sanitizeProperties(value);
            }
            // Pass through other values
            else {
                sanitized[key] = value;
            }
        }

        return sanitized;
    }

    /**
     * Check if key is sensitive
     */
    private isSensitiveKey(key: string): boolean {
        const sensitiveKeys = [
            'password', 'token', 'secret', 'key', 'apiKey', 'auth',
            'credential', 'private', 'path', 'file', 'directory', 'email',
            'user', 'username', 'account', 'id', 'phone', 'address'
        ];

        return sensitiveKeys.some(sensitiveKey => 
            key.toLowerCase().includes(sensitiveKey.toLowerCase())
        );
    }

    /**
     * Sanitize string value
     */
    private sanitizeString(key: string, value: string): string {
        // Truncate long strings
        if (value.length > 100) {
            return `${value.substring(0, 100)}...`;
        }

        // Remove file paths
        if (value.includes('/') || value.includes('\\')) {
            if (this.looksLikeFilePath(value)) {
                return '[REDACTED_PATH]';
            }
        }

        // Remove potential URLs with credentials
        if (value.includes('://') && value.includes('@')) {
            return '[REDACTED_URL]';
        }

        return value;
    }

    /**
     * Check if string looks like a file path
     */
    private looksLikeFilePath(value: string): boolean {
        // Simple heuristic for file paths
        const filePathRegex = /^(?:[a-zA-Z]:\\|\/|~\/|\.\/|\.\.\/)/;
        return filePathRegex.test(value);
    }

    /**
     * Sanitize stack trace
     */
    private sanitizeStackTrace(stackTrace?: string): string | undefined {
        if (!stackTrace) {
            return undefined;
        }

        // Remove file paths from stack trace
        return stackTrace
            .split('\n')
            .map(line => {
                // Replace file paths with [FILE]
                return line.replace(/(?:[a-zA-Z]:\\|\/)[^:)]+/g, '[FILE]');
            })
            .join('\n');
    }

    /**
     * Sanitize user input
     */
    private sanitizeUserInput(input: string): string {
        // Remove potential PII
        return input
            .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]')
            .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[IP]')
            .replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, '[PHONE]');
    }

    /**
     * Load configuration
     */
    private async loadConfiguration(): Promise<void> {
        const config = vscode.workspace.getConfiguration('flowcode.telemetry');
        
        this.config = {
            enabled: config.get<boolean>('enabled', false),
            collectUsageData: config.get<boolean>('collectUsageData', true),
            collectPerformanceData: config.get<boolean>('collectPerformanceData', true),
            collectErrorReports: config.get<boolean>('collectErrorReports', true),
            collectFeedback: config.get<boolean>('collectFeedback', true),
            privacyLevel: config.get<'minimal' | 'standard' | 'detailed'>('privacyLevel', 'standard'),
            dataRetentionDays: config.get<number>('dataRetentionDays', 30)
        };
    }

    /**
     * Get default configuration
     */
    private getDefaultConfig(): TelemetryConfig {
        return {
            enabled: false,
            collectUsageData: true,
            collectPerformanceData: true,
            collectErrorReports: true,
            collectFeedback: true,
            privacyLevel: 'standard',
            dataRetentionDays: 30
        };
    }

    /**
     * Get telemetry status
     */
    public getTelemetryStatus(): {
        enabled: boolean;
        hasConsent: boolean;
        eventsCollected: number;
        config: TelemetryConfig;
    } {
        return {
            enabled: this.config.enabled,
            hasConsent: this.hasUserConsented,
            eventsCollected: this.eventQueue.length,
            config: { ...this.config }
        };
    }

    /**
     * Enable or disable telemetry
     */
    public async setTelemetryEnabled(enabled: boolean): Promise<void> {
        const config = vscode.workspace.getConfiguration('flowcode.telemetry');
        await config.update('enabled', enabled, vscode.ConfigurationTarget.Global);
        
        this.config.enabled = enabled;
        this.hasUserConsented = enabled;
        
        if (enabled && !this.transmissionTimer) {
            this.startTransmissionTimer();
        } else if (!enabled && this.transmissionTimer) {
            clearInterval(this.transmissionTimer);
            this.transmissionTimer = null;
        }
        
        this.contextLogger.info(`Telemetry ${enabled ? 'enabled' : 'disabled'}`);
    }

    /**
     * Dispose resources
     */
    public dispose(): void {
        if (this.transmissionTimer) {
            clearInterval(this.transmissionTimer);
            this.transmissionTimer = null;
        }

        // Transmit any remaining events
        if (this.config.enabled && this.hasUserConsented && this.eventQueue.length > 0) {
            this.transmitEvents();
        }

        this.contextLogger.info('TelemetryService disposed');
    }
}
