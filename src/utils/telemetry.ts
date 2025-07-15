import * as vscode from 'vscode';
import { logger } from './logger';

export interface TelemetryEvent {
    name: string;
    properties?: Record<string, string | number | boolean>;
    measurements?: Record<string, number>;
    timestamp: number;
    sessionId: string;
    userId?: string;
}

export interface TelemetryConfiguration {
    enabled: boolean;
    endpoint?: string;
    apiKey?: string;
    batchSize: number;
    flushInterval: number;
    enabledEvents: string[];
}

export class TelemetryService {
    private static instance: TelemetryService;
    private contextLogger = logger.createContextLogger('TelemetryService');
    private eventQueue: TelemetryEvent[] = [];
    private sessionId: string;
    private userId?: string;
    private flushTimer?: NodeJS.Timeout;
    private configuration: TelemetryConfiguration;

    private constructor() {
        this.sessionId = this.generateSessionId();
        this.configuration = this.loadConfiguration();
        
        if (this.configuration.enabled) {
            this.startFlushTimer();
        }
        
        this.contextLogger.info('TelemetryService initialized', {
            enabled: this.configuration.enabled,
            sessionId: this.sessionId
        });
    }

    public static getInstance(): TelemetryService {
        if (!TelemetryService.instance) {
            TelemetryService.instance = new TelemetryService();
        }
        return TelemetryService.instance;
    }

    /**
     * Track an event
     */
    public trackEvent(
        name: string,
        properties?: Record<string, string | number | boolean>,
        measurements?: Record<string, number>
    ): void {
        if (!this.configuration.enabled || !this.configuration.enabledEvents.includes(name)) {
            return;
        }

        const event: TelemetryEvent = {
            name,
            properties: {
                ...properties,
                vsCodeVersion: vscode.version,
                platform: process.platform,
                nodeVersion: process.version,
                extensionVersion: this.getExtensionVersion()
            },
            measurements,
            timestamp: Date.now(),
            sessionId: this.sessionId,
            userId: this.userId
        };

        this.eventQueue.push(event);
        this.contextLogger.debug(`Event tracked: ${name}`, { properties, measurements });

        // Flush if queue is full
        if (this.eventQueue.length >= this.configuration.batchSize) {
            this.flush();
        }
    }

    /**
     * Track feature usage
     */
    public trackFeatureUsage(
        feature: string,
        action: string,
        success: boolean,
        duration?: number,
        metadata?: Record<string, any>
    ): void {
        this.trackEvent('feature_usage', {
            feature,
            action,
            success,
            ...metadata
        }, {
            duration: duration || 0
        });
    }

    /**
     * Track performance metrics
     */
    public trackPerformance(
        operation: string,
        duration: number,
        success: boolean,
        metadata?: Record<string, any>
    ): void {
        this.trackEvent('performance', {
            operation,
            success,
            ...metadata
        }, {
            duration,
            memoryUsed: process.memoryUsage().heapUsed
        });
    }

    /**
     * Track errors
     */
    public trackError(
        error: Error,
        context?: string,
        metadata?: Record<string, any>
    ): void {
        this.trackEvent('error', {
            errorName: error.name,
            errorMessage: error.message,
            context: context || 'unknown',
            stack: error.stack?.substring(0, 1000) || '', // Limit stack trace length
            ...metadata
        });
    }

    /**
     * Track user actions
     */
    public trackUserAction(
        action: string,
        source: string,
        metadata?: Record<string, any>
    ): void {
        this.trackEvent('user_action', {
            action,
            source,
            ...metadata
        });
    }

    /**
     * Track configuration changes
     */
    public trackConfigurationChange(
        setting: string,
        oldValue: any,
        newValue: any
    ): void {
        this.trackEvent('configuration_change', {
            setting,
            oldValue: String(oldValue),
            newValue: String(newValue)
        });
    }

    /**
     * Set user ID for tracking
     */
    public setUserId(userId: string): void {
        this.userId = userId;
        this.contextLogger.info('User ID set for telemetry');
    }

    /**
     * Update telemetry configuration
     */
    public updateConfiguration(config: Partial<TelemetryConfiguration>): void {
        this.configuration = { ...this.configuration, ...config };
        
        if (this.configuration.enabled && !this.flushTimer) {
            this.startFlushTimer();
        } else if (!this.configuration.enabled && this.flushTimer) {
            this.stopFlushTimer();
        }
        
        this.contextLogger.info('Telemetry configuration updated', config);
    }

    /**
     * Flush events to endpoint
     */
    public async flush(): Promise<void> {
        if (this.eventQueue.length === 0 || !this.configuration.enabled) {
            return;
        }

        const events = [...this.eventQueue];
        this.eventQueue = [];

        try {
            if (this.configuration.endpoint && this.configuration.apiKey) {
                await this.sendEvents(events);
            } else {
                // Log events locally if no endpoint configured
                this.contextLogger.info('Telemetry events (local)', { 
                    count: events.length,
                    events: events.map(e => ({ name: e.name, timestamp: e.timestamp }))
                });
            }
        } catch (error) {
            this.contextLogger.error('Failed to send telemetry events', error as Error);
            // Re-queue events for retry (with limit)
            if (this.eventQueue.length < 1000) {
                this.eventQueue.unshift(...events);
            }
        }
    }

    /**
     * Get telemetry summary
     */
    public getTelemetrySummary(): {
        sessionId: string;
        queuedEvents: number;
        configuration: TelemetryConfiguration;
        sessionDuration: number;
    } {
        return {
            sessionId: this.sessionId,
            queuedEvents: this.eventQueue.length,
            configuration: this.configuration,
            sessionDuration: Date.now() - parseInt(this.sessionId.split('-')[1])
        };
    }

    /**
     * Load configuration from VS Code settings
     */
    private loadConfiguration(): TelemetryConfiguration {
        const config = vscode.workspace.getConfiguration('flowcode.telemetry');
        
        return {
            enabled: config.get('enabled', true),
            endpoint: config.get('endpoint'),
            apiKey: config.get('apiKey'),
            batchSize: config.get('batchSize', 50),
            flushInterval: config.get('flushInterval', 60000), // 1 minute
            enabledEvents: config.get('enabledEvents', [
                'feature_usage',
                'performance',
                'error',
                'user_action',
                'configuration_change'
            ])
        };
    }

    /**
     * Send events to telemetry endpoint
     */
    private async sendEvents(events: TelemetryEvent[]): Promise<void> {
        if (!this.configuration.endpoint || !this.configuration.apiKey) {
            return;
        }

        const axios = await import('axios');
        
        await axios.default.post(this.configuration.endpoint, {
            events,
            metadata: {
                extensionVersion: this.getExtensionVersion(),
                vsCodeVersion: vscode.version,
                platform: process.platform
            }
        }, {
            headers: {
                'Authorization': `Bearer ${this.configuration.apiKey}`,
                'Content-Type': 'application/json'
            },
            timeout: 10000
        });

        this.contextLogger.debug(`Sent ${events.length} telemetry events`);
    }

    /**
     * Generate unique session ID
     */
    private generateSessionId(): string {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2);
        return `session-${timestamp}-${random}`;
    }

    /**
     * Get extension version
     */
    private getExtensionVersion(): string {
        try {
            const extension = vscode.extensions.getExtension('flowcode.flowcode');
            return extension?.packageJSON?.version || '0.0.0';
        } catch {
            return '0.0.0';
        }
    }

    /**
     * Start flush timer
     */
    private startFlushTimer(): void {
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
        }
        
        this.flushTimer = setInterval(() => {
            this.flush();
        }, this.configuration.flushInterval);
    }

    /**
     * Stop flush timer
     */
    private stopFlushTimer(): void {
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
            this.flushTimer = undefined;
        }
    }

    /**
     * Dispose telemetry service
     */
    public dispose(): void {
        this.stopFlushTimer();
        this.flush(); // Final flush
        this.contextLogger.info('TelemetryService disposed');
    }
}

/**
 * Decorator for automatic performance tracking
 */
export function trackPerformance(eventName?: string) {
    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
        const originalMethod = descriptor.value;
        const operationName = eventName || `${target.constructor.name}.${propertyKey}`;

        descriptor.value = async function (...args: any[]) {
            const telemetry = TelemetryService.getInstance();
            const startTime = Date.now();
            
            try {
                const result = await originalMethod.apply(this, args);
                const duration = Date.now() - startTime;
                
                telemetry.trackPerformance(operationName, duration, true);
                return result;
            } catch (error) {
                const duration = Date.now() - startTime;
                
                telemetry.trackPerformance(operationName, duration, false, {
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
                
                if (error instanceof Error) {
                    telemetry.trackError(error, operationName);
                }
                
                throw error;
            }
        };

        return descriptor;
    };
}

/**
 * Decorator for automatic feature usage tracking
 */
export function trackFeature(feature: string, action?: string) {
    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
        const originalMethod = descriptor.value;
        const actionName = action || propertyKey;

        descriptor.value = async function (...args: any[]) {
            const telemetry = TelemetryService.getInstance();
            const startTime = Date.now();
            
            try {
                const result = await originalMethod.apply(this, args);
                const duration = Date.now() - startTime;
                
                telemetry.trackFeatureUsage(feature, actionName, true, duration);
                return result;
            } catch (error) {
                const duration = Date.now() - startTime;
                
                telemetry.trackFeatureUsage(feature, actionName, false, duration, {
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
                
                throw error;
            }
        };

        return descriptor;
    };
}
