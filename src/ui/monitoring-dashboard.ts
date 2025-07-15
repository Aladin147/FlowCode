import * as vscode from 'vscode';
import { logger } from '../utils/logger';
import { PerformanceMonitor } from '../utils/performance-monitor';
import { TelemetryService } from '../services/telemetry-service';

export class MonitoringDashboard {
    private contextLogger = logger.createContextLogger('MonitoringDashboard');
    private panel: vscode.WebviewPanel | undefined;
    private performanceMonitor = PerformanceMonitor.getInstance();
    private updateInterval: NodeJS.Timeout | undefined;
    private readonly UPDATE_INTERVAL_MS = 5000; // 5 seconds

    constructor(private telemetryService: TelemetryService) {}

    /**
     * Show monitoring dashboard
     */
    public async show(): Promise<void> {
        try {
            // Create panel if it doesn't exist
            if (!this.panel) {
                this.panel = vscode.window.createWebviewPanel(
                    'flowcodeMonitoring',
                    'FlowCode Monitoring Dashboard',
                    vscode.ViewColumn.One,
                    {
                        enableScripts: true,
                        retainContextWhenHidden: true,
                        localResourceRoots: []
                    }
                );

                // Handle panel disposal
                this.panel.onDidDispose(() => {
                    this.panel = undefined;
                    if (this.updateInterval) {
                        clearInterval(this.updateInterval);
                        this.updateInterval = undefined;
                    }
                }, null, []);

                // Handle messages from webview
                this.panel.webview.onDidReceiveMessage(message => {
                    this.handleWebviewMessage(message);
                });
            }

            // Set initial content
            this.panel.webview.html = this.getWebviewContent();

            // Start update interval
            if (!this.updateInterval) {
                this.updateInterval = setInterval(() => {
                    if (this.panel) {
                        this.panel.webview.html = this.getWebviewContent();
                    }
                }, this.UPDATE_INTERVAL_MS);
            }

            // Reveal panel
            this.panel.reveal(vscode.ViewColumn.One);

        } catch (error) {
            this.contextLogger.error('Failed to show monitoring dashboard', error as Error);
            vscode.window.showErrorMessage('Failed to show monitoring dashboard');
        }
    }

    /**
     * Handle messages from webview
     */
    private handleWebviewMessage(message: any): void {
        switch (message.command) {
            case 'refresh':
                if (this.panel) {
                    this.panel.webview.html = this.getWebviewContent();
                }
                break;

            case 'clearMetrics':
                this.performanceMonitor.clearMetrics();
                if (this.panel) {
                    this.panel.webview.html = this.getWebviewContent();
                }
                break;

            case 'toggleTelemetry':
                this.telemetryService.setTelemetryEnabled(message.value);
                if (this.panel) {
                    this.panel.webview.html = this.getWebviewContent();
                }
                break;

            case 'exportData':
                this.exportMonitoringData();
                break;
        }
    }

    /**
     * Export monitoring data
     */
    private async exportMonitoringData(): Promise<void> {
        try {
            // In a real implementation, this would get metrics from the performance monitor
            const metrics = {};
            const telemetryStatus = this.telemetryService.getTelemetryStatus();
            
            const exportData = {
                timestamp: new Date().toISOString(),
                performanceMetrics: metrics,
                telemetryStatus: telemetryStatus,
                systemInfo: this.getSystemInfo()
            };

            const exportContent = JSON.stringify(exportData, null, 2);
            
            const doc = await vscode.workspace.openTextDocument({
                content: exportContent,
                language: 'json'
            });

            await vscode.window.showTextDocument(doc);

        } catch (error) {
            this.contextLogger.error('Failed to export monitoring data', error as Error);
            vscode.window.showErrorMessage('Failed to export monitoring data');
        }
    }

    /**
     * Get system information
     */
    private getSystemInfo(): any {
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
     * Get webview content
     */
    private getWebviewContent(): string {
        // In a real implementation, this would get metrics from the performance monitor
        const metrics = {};
        const telemetryStatus = this.telemetryService.getTelemetryStatus();
        const memoryUsage = process.memoryUsage();
        const heapUsedMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
        const heapTotalMB = Math.round(memoryUsage.heapTotal / 1024 / 1024);
        
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>FlowCode Monitoring Dashboard</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            padding: 20px;
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
        }
        .dashboard {
            display: grid;
            grid-template-columns: 1fr 1fr;
            grid-gap: 20px;
        }
        .card {
            background-color: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 5px;
            padding: 15px;
            margin-bottom: 20px;
        }
        .card h2 {
            margin-top: 0;
            border-bottom: 1px solid var(--vscode-panel-border);
            padding-bottom: 10px;
            color: var(--vscode-editor-foreground);
        }
        .metric {
            display: flex;
            justify-content: space-between;
            margin-bottom: 10px;
            padding: 5px 0;
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        .metric-name {
            font-weight: bold;
        }
        .metric-value {
            color: var(--vscode-charts-blue);
        }
        .good {
            color: var(--vscode-testing-iconPassed);
        }
        .warning {
            color: var(--vscode-editorWarning-foreground);
        }
        .error {
            color: var(--vscode-editorError-foreground);
        }
        .actions {
            display: flex;
            justify-content: space-between;
            margin-top: 20px;
        }
        button {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 8px 12px;
            border-radius: 2px;
            cursor: pointer;
        }
        button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        .telemetry-status {
            display: flex;
            align-items: center;
            margin-bottom: 15px;
        }
        .status-indicator {
            width: 12px;
            height: 12px;
            border-radius: 50%;
            margin-right: 10px;
        }
        .enabled {
            background-color: var(--vscode-testing-iconPassed);
        }
        .disabled {
            background-color: var(--vscode-editorError-foreground);
        }
        .chart-container {
            height: 200px;
            margin-top: 20px;
            border: 1px solid var(--vscode-panel-border);
            position: relative;
        }
        .chart-placeholder {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            color: var(--vscode-descriptionForeground);
        }
        .full-width {
            grid-column: 1 / span 2;
        }
    </style>
</head>
<body>
    <h1>FlowCode Monitoring Dashboard</h1>
    
    <div class="telemetry-status">
        <div class="status-indicator ${telemetryStatus.enabled ? 'enabled' : 'disabled'}"></div>
        <span>Telemetry: ${telemetryStatus.enabled ? 'Enabled' : 'Disabled'}</span>
    </div>
    
    <div class="dashboard">
        <div class="card">
            <h2>Memory Usage</h2>
            <div class="metric">
                <span class="metric-name">Heap Used</span>
                <span class="metric-value ${heapUsedMB > 300 ? 'error' : heapUsedMB > 200 ? 'warning' : 'good'}">${heapUsedMB} MB</span>
            </div>
            <div class="metric">
                <span class="metric-name">Heap Total</span>
                <span class="metric-value">${heapTotalMB} MB</span>
            </div>
            <div class="metric">
                <span class="metric-name">Heap Usage</span>
                <span class="metric-value ${(heapUsedMB / heapTotalMB) > 0.8 ? 'error' : (heapUsedMB / heapTotalMB) > 0.6 ? 'warning' : 'good'}">${Math.round((heapUsedMB / heapTotalMB) * 100)}%</span>
            </div>
            <div class="chart-container">
                <div class="chart-placeholder">Memory usage chart (placeholder)</div>
            </div>
        </div>
        
        <div class="card">
            <h2>Performance Metrics</h2>
            ${Object.entries(metrics).map(([name, value]) => `
                <div class="metric">
                    <span class="metric-name">${name}</span>
                    <span class="metric-value">${typeof value === 'number' ? `${value.toFixed(2)} ms` : value}</span>
                </div>
            `).join('')}
            ${Object.keys(metrics).length === 0 ? '<p>No performance metrics collected yet.</p>' : ''}
            <div class="chart-container">
                <div class="chart-placeholder">Performance metrics chart (placeholder)</div>
            </div>
        </div>
        
        <div class="card full-width">
            <h2>Telemetry Status</h2>
            <div class="metric">
                <span class="metric-name">Enabled</span>
                <span class="metric-value ${telemetryStatus.enabled ? 'good' : 'error'}">${telemetryStatus.enabled ? 'Yes' : 'No'}</span>
            </div>
            <div class="metric">
                <span class="metric-name">User Consent</span>
                <span class="metric-value ${telemetryStatus.hasConsent ? 'good' : 'error'}">${telemetryStatus.hasConsent ? 'Given' : 'Not given'}</span>
            </div>
            <div class="metric">
                <span class="metric-name">Events Collected</span>
                <span class="metric-value">${telemetryStatus.eventsCollected}</span>
            </div>
            <div class="metric">
                <span class="metric-name">Usage Data Collection</span>
                <span class="metric-value ${telemetryStatus.config.collectUsageData ? 'good' : 'error'}">${telemetryStatus.config.collectUsageData ? 'Enabled' : 'Disabled'}</span>
            </div>
            <div class="metric">
                <span class="metric-name">Performance Data Collection</span>
                <span class="metric-value ${telemetryStatus.config.collectPerformanceData ? 'good' : 'error'}">${telemetryStatus.config.collectPerformanceData ? 'Enabled' : 'Disabled'}</span>
            </div>
            <div class="metric">
                <span class="metric-name">Error Reports Collection</span>
                <span class="metric-value ${telemetryStatus.config.collectErrorReports ? 'good' : 'error'}">${telemetryStatus.config.collectErrorReports ? 'Enabled' : 'Disabled'}</span>
            </div>
            <div class="metric">
                <span class="metric-name">Feedback Collection</span>
                <span class="metric-value ${telemetryStatus.config.collectFeedback ? 'good' : 'error'}">${telemetryStatus.config.collectFeedback ? 'Enabled' : 'Disabled'}</span>
            </div>
            <div class="metric">
                <span class="metric-name">Privacy Level</span>
                <span class="metric-value">${telemetryStatus.config.privacyLevel}</span>
            </div>
            <div class="metric">
                <span class="metric-name">Data Retention</span>
                <span class="metric-value">${telemetryStatus.config.dataRetentionDays} days</span>
            </div>
        </div>
    </div>
    
    <div class="actions">
        <button id="refresh">Refresh Dashboard</button>
        <button id="clearMetrics">Clear Metrics</button>
        <button id="toggleTelemetry">${telemetryStatus.enabled ? 'Disable' : 'Enable'} Telemetry</button>
        <button id="exportData">Export Data</button>
    </div>
    
    <script>
        (function() {
            const vscode = acquireVsCodeApi();
            
            document.getElementById('refresh').addEventListener('click', () => {
                vscode.postMessage({ command: 'refresh' });
            });
            
            document.getElementById('clearMetrics').addEventListener('click', () => {
                vscode.postMessage({ command: 'clearMetrics' });
            });
            
            document.getElementById('toggleTelemetry').addEventListener('click', () => {
                vscode.postMessage({ 
                    command: 'toggleTelemetry',
                    value: ${!telemetryStatus.enabled}
                });
            });
            
            document.getElementById('exportData').addEventListener('click', () => {
                vscode.postMessage({ command: 'exportData' });
            });
            
            // Auto-refresh every 30 seconds
            setInterval(() => {
                vscode.postMessage({ command: 'refresh' });
            }, 30000);
        })();
    </script>
</body>
</html>`;
    }

    /**
     * Dispose resources
     */
    public dispose(): void {
        if (this.panel) {
            this.panel.dispose();
            this.panel = undefined;
        }

        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = undefined;
        }

        this.contextLogger.info('MonitoringDashboard disposed');
    }
}
