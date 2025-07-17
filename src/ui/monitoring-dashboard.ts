import * as vscode from 'vscode';
import { logger } from '../utils/logger';
import { PerformanceMonitor } from '../utils/performance-monitor';
import { TelemetryService } from '../utils/telemetry';
import { CompanionGuard } from '../services/companion-guard';
import { HotfixService } from '../services/hotfix-service';
import { GraphService } from '../services/graph-service';
import { ChatInterface } from './chat-interface';
import { AgentStateManager } from '../services/agent-state-manager';
import { AgenticOrchestrator } from '../services/agentic-orchestrator';

export class MonitoringDashboard {
    private contextLogger = logger.createContextLogger('MonitoringDashboard');
    private panel: vscode.WebviewPanel | undefined;
    private performanceMonitor = PerformanceMonitor.getInstance();
    private updateInterval: NodeJS.Timeout | undefined;
    private readonly UPDATE_INTERVAL_MS = 5000; // 5 seconds

    constructor(
        private telemetryService?: any, // Made optional for V0.2 transition
        private companionGuard?: CompanionGuard,
        private hotfixService?: HotfixService,
        private graphService?: GraphService,
        private chatInterface?: ChatInterface,
        private agentStateManager?: AgentStateManager,
        private agenticOrchestrator?: AgenticOrchestrator
    ) {}

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
            this.panel.webview.html = await this.getWebviewContent();

            // Start update interval
            if (!this.updateInterval) {
                this.updateInterval = setInterval(async () => {
                    if (this.panel) {
                        this.panel.webview.html = await this.getWebviewContent();
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
                    this.getWebviewContent().then(html => {
                        if (this.panel) this.panel.webview.html = html;
                    });
                }
                break;

            case 'clearMetrics':
                this.performanceMonitor.clearMetrics();
                if (this.panel) {
                    this.getWebviewContent().then(html => {
                        if (this.panel) this.panel.webview.html = html;
                    });
                }
                break;

            case 'toggleTelemetry':
                this.telemetryService.updateConfiguration({ enabled: message.value });
                if (this.panel) {
                    this.getWebviewContent().then(html => {
                        if (this.panel) this.panel.webview.html = html;
                    });
                }
                break;

            case 'exportData':
                this.exportMonitoringData();
                break;

            case 'openChat':
                this.openChatInterface();
                break;

            case 'runQuickAction':
                this.handleQuickAction(message.action, message.params);
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
            const telemetryStatus = this.telemetryService.getTelemetrySummary();
            
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
     * Open chat interface
     */
    private openChatInterface(): void {
        if (this.chatInterface) {
            this.chatInterface.show();
        } else {
            vscode.window.showWarningMessage('Chat interface not available');
        }
    }

    /**
     * Handle quick actions from dashboard
     */
    private async handleQuickAction(action: string, params?: any): Promise<void> {
        try {
            switch (action) {
                case 'showDebtSummary':
                    if (this.hotfixService && this.chatInterface) {
                        this.chatInterface.show();
                        // Trigger debt summary in chat
                        vscode.commands.executeCommand('flowcode.showDebtSummary');
                    }
                    break;

                case 'runArchitectAnalysis':
                    if (this.chatInterface) {
                        this.chatInterface.show();
                        vscode.commands.executeCommand('flowcode.elevateToArchitect');
                    }
                    break;

                case 'showDependencyGraph':
                    if (this.graphService && this.chatInterface) {
                        this.chatInterface.show();
                        vscode.commands.executeCommand('flowcode.showGraphPopover');
                    }
                    break;

                case 'refreshStatus':
                    if (this.panel) {
                        this.getWebviewContent().then(html => {
                            if (this.panel) this.panel.webview.html = html;
                        });
                    }
                    break;

                default:
                    this.contextLogger.warn(`Unknown quick action: ${action}`);
            }

        } catch (error) {
            this.contextLogger.error('Failed to handle quick action', error as Error);
            vscode.window.showErrorMessage(`Failed to execute action: ${action}`);
        }
    }

    /**
     * Get real-time status data
     */
    private async getRealTimeStatus(): Promise<any> {
        try {
            const status: any = {
                timestamp: new Date().toISOString(),
                system: this.getSystemInfo(),
                performance: this.getPerformanceMetrics(),
                companionGuard: null,
                technicalDebt: null,
                architecture: null,
                agent: null
            };

            // Get companion guard status
            if (this.companionGuard) {
                try {
                    const guardStatus = await this.companionGuard.getStatus();
                    status.companionGuard = {
                        isActive: guardStatus.isActive,
                        issueCount: guardStatus.issues?.length || 0,
                        lastCheck: guardStatus.lastCheck,
                        riskLevel: this.calculateRiskLevel(guardStatus.issues || [])
                    };
                } catch (error) {
                    this.contextLogger.warn('Failed to get companion guard status', error as Error);
                }
            }

            // Get technical debt summary
            if (this.hotfixService) {
                try {
                    const debtSummary = await this.hotfixService.getDebtSummary();
                    status.technicalDebt = {
                        totalDebt: debtSummary.totalDebt,
                        criticalDebt: debtSummary.criticalDebt,
                        overdueDebt: debtSummary.overdueDebt,
                        riskLevel: debtSummary.riskLevel,
                        slaWarnings: debtSummary.slaWarnings.length
                    };
                } catch (error) {
                    this.contextLogger.warn('Failed to get debt summary', error as Error);
                }
            }

            // Get architecture insights for current file
            if (this.graphService) {
                try {
                    const activeFile = vscode.window.activeTextEditor?.document.fileName;
                    if (activeFile) {
                        const insights = await this.graphService.getArchitecturalInsights(activeFile);
                        status.architecture = {
                            complexity: insights.complexity,
                            coupling: insights.coupling,
                            cohesion: insights.cohesion,
                            suggestions: insights.suggestions.length,
                            activeFile: activeFile.split('/').pop()
                        };
                    }
                } catch (error) {
                    this.contextLogger.warn('Failed to get architecture insights', error as Error);
                }
            }

            // Get agent status
            if (this.agentStateManager && this.agenticOrchestrator) {
                try {
                    const agentState = this.agentStateManager.getState();
                    const executionStatus = this.agenticOrchestrator.getExecutionStatus();
                    const taskStats = this.agentStateManager.getTaskStatistics();

                    status.agent = {
                        isExecuting: executionStatus.isExecuting,
                        currentTask: agentState.currentTask ? {
                            id: agentState.currentTask.id,
                            goal: agentState.currentTask.goal,
                            status: agentState.currentTask.status,
                            progress: agentState.currentTask.progress?.percentComplete || 0,
                            stepsCompleted: agentState.currentTask.steps?.filter(s => s.status === 'completed').length || 0,
                            totalSteps: agentState.currentTask.steps?.length || 0
                        } : null,
                        queueLength: agentState.taskQueue.length,
                        statistics: {
                            totalCompleted: taskStats.completedTasks,
                            totalFailed: taskStats.failedTasks,
                            successRate: taskStats.successRate,
                            averageDuration: taskStats.averageDuration
                        },
                        userPreferences: {
                            riskTolerance: agentState.userPreferences.riskTolerance,
                            autoApprovalLevel: agentState.userPreferences.autoApprovalLevel,
                            learningEnabled: agentState.userPreferences.learningEnabled
                        }
                    };
                } catch (error) {
                    this.contextLogger.warn('Failed to get agent status', error as Error);
                    status.agent = { error: 'Failed to get agent status' };
                }
            }

            return status;

        } catch (error) {
            this.contextLogger.error('Failed to get real-time status', error as Error);
            return {
                timestamp: new Date().toISOString(),
                error: 'Failed to get status data'
            };
        }
    }

    /**
     * Calculate risk level from issues
     */
    private calculateRiskLevel(issues: any[]): 'low' | 'medium' | 'high' | 'critical' {
        if (issues.length === 0) return 'low';
        if (issues.length > 10) return 'critical';
        if (issues.length > 5) return 'high';
        if (issues.length > 2) return 'medium';
        return 'low';
    }

    /**
     * Get performance metrics
     */
    private getPerformanceMetrics(): any {
        const memUsage = process.memoryUsage();
        return {
            heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
            heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
            external: Math.round(memUsage.external / 1024 / 1024), // MB
            uptime: Math.round(process.uptime()), // seconds
            cpuUsage: process.cpuUsage()
        };
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
    private async getWebviewContent(): Promise<string> {
        const status = await this.getRealTimeStatus();

        return this.generateDashboardHTML(status);
    }

    /**
     * Generate dashboard HTML with real-time status
     */
    private generateDashboardHTML(status: any): string {
        const companionGuard = status.companionGuard || {};
        const technicalDebt = status.technicalDebt || {};
        const architecture = status.architecture || {};
        const performance = status.performance || {};
        const system = status.system || {};
        const agent = status.agent || {};

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>FlowCode Monitoring Dashboard</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            background: var(--vscode-editor-background);
            color: var(--vscode-foreground);
            margin: 0;
            padding: 20px;
            line-height: 1.4;
        }

        .dashboard-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 24px;
            padding-bottom: 16px;
            border-bottom: 2px solid var(--vscode-panel-border);
        }

        .dashboard-title {
            font-size: 24px;
            font-weight: 600;
            color: var(--vscode-foreground);
        }

        .dashboard-actions {
            display: flex;
            gap: 12px;
        }

        .action-button {
            padding: 8px 16px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            font-weight: 500;
            transition: background-color 0.2s;
        }

        .action-button:hover {
            background: var(--vscode-button-hoverBackground);
        }

        .action-button.secondary {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }

        .action-button.secondary:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }

        .status-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
            margin-bottom: 24px;
        }

        .status-tile {
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 8px;
            padding: 16px;
            transition: transform 0.2s, box-shadow 0.2s;
        }

        .status-tile:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        }

        .tile-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 12px;
        }

        .tile-title {
            font-size: 14px;
            font-weight: 600;
            color: var(--vscode-foreground);
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .tile-icon {
            font-size: 16px;
        }

        .tile-status {
            padding: 4px 8px;
            border-radius: 12px;
            font-size: 10px;
            font-weight: 600;
            text-transform: uppercase;
        }

        .status-healthy {
            background: var(--vscode-charts-green);
            color: white;
        }

        .status-warning {
            background: var(--vscode-charts-yellow);
            color: black;
        }

        .status-critical {
            background: var(--vscode-charts-red);
            color: white;
        }

        .status-unknown {
            background: var(--vscode-descriptionForeground);
            color: white;
        }

        .tile-content {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .metric-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 4px 0;
        }

        .metric-label {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
        }

        .metric-value {
            font-size: 12px;
            font-weight: 600;
            color: var(--vscode-foreground);
        }

        .metric-bar {
            width: 100%;
            height: 6px;
            background: var(--vscode-progressBar-background);
            border-radius: 3px;
            overflow: hidden;
            margin: 4px 0;
        }

        .metric-fill {
            height: 100%;
            transition: width 0.3s ease;
        }

        .fill-green { background: var(--vscode-charts-green); }
        .fill-yellow { background: var(--vscode-charts-yellow); }
        .fill-red { background: var(--vscode-charts-red); }

        .tile-actions {
            display: flex;
            gap: 8px;
            margin-top: 12px;
            padding-top: 12px;
            border-top: 1px solid var(--vscode-panel-border);
        }

        .tile-action {
            padding: 4px 8px;
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: none;
            border-radius: 3px;
            cursor: pointer;
            font-size: 10px;
            transition: background-color 0.2s;
        }

        .tile-action:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }

        .quick-actions {
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 8px;
            padding: 16px;
            margin-bottom: 24px;
        }

        .quick-actions h3 {
            margin: 0 0 12px 0;
            font-size: 16px;
            color: var(--vscode-foreground);
        }

        .quick-action-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 12px;
        }

        .quick-action-card {
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px;
            padding: 12px;
            cursor: pointer;
            transition: all 0.2s;
            text-align: center;
        }

        .quick-action-card:hover {
            background: var(--vscode-list-hoverBackground);
            transform: translateY(-1px);
        }

        .quick-action-icon {
            font-size: 24px;
            margin-bottom: 8px;
        }

        .quick-action-title {
            font-size: 12px;
            font-weight: 600;
            color: var(--vscode-foreground);
            margin-bottom: 4px;
        }

        .quick-action-desc {
            font-size: 10px;
            color: var(--vscode-descriptionForeground);
        }

        .timestamp {
            text-align: center;
            font-size: 10px;
            color: var(--vscode-descriptionForeground);
            margin-top: 20px;
            padding-top: 16px;
            border-top: 1px solid var(--vscode-panel-border);
        }
    </style>
</head>
<body>
    <div class="dashboard-header">
        <div class="dashboard-title">🚀 FlowCode Monitoring Dashboard</div>
        <div class="dashboard-actions">
            <button class="action-button" onclick="openChat()">💬 Open Chat</button>
            <button class="action-button secondary" onclick="refresh()">🔄 Refresh</button>
        </div>
    </div>

    <div class="status-grid">
        <!-- Companion Guard Tile -->
        <div class="status-tile">
            <div class="tile-header">
                <div class="tile-title">
                    <span class="tile-icon">🛡️</span>
                    Companion Guard
                </div>
                <div class="tile-status ${this.getStatusClass(companionGuard.riskLevel || 'unknown')}">
                    ${companionGuard.isActive ? 'Active' : 'Inactive'}
                </div>
            </div>
            <div class="tile-content">
                <div class="metric-row">
                    <span class="metric-label">Issues Found:</span>
                    <span class="metric-value">${companionGuard.issueCount || 0}</span>
                </div>
                <div class="metric-row">
                    <span class="metric-label">Risk Level:</span>
                    <span class="metric-value">${(companionGuard.riskLevel || 'unknown').toUpperCase()}</span>
                </div>
                <div class="metric-row">
                    <span class="metric-label">Last Check:</span>
                    <span class="metric-value">${companionGuard.lastCheck ? new Date(companionGuard.lastCheck).toLocaleTimeString() : 'Never'}</span>
                </div>
            </div>
            <div class="tile-actions">
                <button class="tile-action" onclick="runQuickAction('runArchitectAnalysis')">🏗️ Analyze</button>
            </div>
        </div>

        <!-- Autonomous Agent Tile -->
        <div class="status-tile">
            <div class="tile-header">
                <div class="tile-title">
                    <span class="tile-icon">🤖</span>
                    Autonomous Agent
                </div>
                <div class="tile-status ${agent.isExecuting ? 'status-active' : 'status-idle'}">
                    ${agent.isExecuting ? 'Executing' : 'Idle'}
                </div>
            </div>
            <div class="tile-content">
                ${agent.currentTask ? `
                    <div class="metric-row">
                        <span class="metric-label">Current Goal:</span>
                        <span class="metric-value" title="${agent.currentTask.goal}">${(agent.currentTask.goal || '').substring(0, 30)}${(agent.currentTask.goal || '').length > 30 ? '...' : ''}</span>
                    </div>
                    <div class="metric-row">
                        <span class="metric-label">Progress:</span>
                        <span class="metric-value">${agent.currentTask.progress || 0}% (${agent.currentTask.stepsCompleted}/${agent.currentTask.totalSteps})</span>
                    </div>
                ` : `
                    <div class="metric-row">
                        <span class="metric-label">Queue Length:</span>
                        <span class="metric-value">${agent.queueLength || 0}</span>
                    </div>
                `}
                <div class="metric-row">
                    <span class="metric-label">Success Rate:</span>
                    <span class="metric-value">${agent.statistics ? Math.round(agent.statistics.successRate * 100) : 0}%</span>
                </div>
                <div class="metric-row">
                    <span class="metric-label">Risk Tolerance:</span>
                    <span class="metric-value">${agent.userPreferences ? (agent.userPreferences.riskTolerance || 'balanced').toUpperCase() : 'UNKNOWN'}</span>
                </div>
            </div>
            <div class="tile-actions">
                <button class="tile-action" onclick="runQuickAction('showAgentStatus')">📊 Details</button>
                ${agent.isExecuting ? '<button class="tile-action secondary" onclick="runQuickAction(\'pauseExecution\')">⏸️ Pause</button>' : ''}
            </div>
        </div>

        <!-- Technical Debt Tile -->
        <div class="status-tile">
            <div class="tile-header">
                <div class="tile-title">
                    <span class="tile-icon">💳</span>
                    Technical Debt
                </div>
                <div class="tile-status ${this.getStatusClass(technicalDebt.riskLevel || 'unknown')}">
                    ${technicalDebt.riskLevel ? technicalDebt.riskLevel.toUpperCase() : 'UNKNOWN'}
                </div>
            </div>
            <div class="tile-content">
                <div class="metric-row">
                    <span class="metric-label">Total Debt:</span>
                    <span class="metric-value">${technicalDebt.totalDebt || 0} items</span>
                </div>
                <div class="metric-row">
                    <span class="metric-label">Critical:</span>
                    <span class="metric-value">${technicalDebt.criticalDebt || 0}</span>
                </div>
                <div class="metric-row">
                    <span class="metric-label">Overdue:</span>
                    <span class="metric-value">${technicalDebt.overdueDebt || 0}</span>
                </div>
                <div class="metric-row">
                    <span class="metric-label">SLA Warnings:</span>
                    <span class="metric-value">${technicalDebt.slaWarnings || 0}</span>
                </div>
            </div>
            <div class="tile-actions">
                <button class="tile-action" onclick="runQuickAction('showDebtSummary')">📊 View Details</button>
            </div>
        </div>

        <!-- Architecture Tile -->
        <div class="status-tile">
            <div class="tile-header">
                <div class="tile-title">
                    <span class="tile-icon">🏗️</span>
                    Architecture
                </div>
                <div class="tile-status ${architecture.activeFile ? 'status-healthy' : 'status-unknown'}">
                    ${architecture.activeFile ? 'Analyzed' : 'No File'}
                </div>
            </div>
            <div class="tile-content">
                ${architecture.activeFile ? `
                    <div class="metric-row">
                        <span class="metric-label">File:</span>
                        <span class="metric-value">${architecture.activeFile}</span>
                    </div>
                    <div class="metric-row">
                        <span class="metric-label">Complexity:</span>
                        <span class="metric-value">${(architecture.complexity || 0).toFixed(1)}</span>
                    </div>
                    <div class="metric-bar">
                        <div class="metric-fill ${this.getComplexityColor(architecture.complexity || 0)}"
                             style="width: ${Math.min((architecture.complexity || 0) * 10, 100)}%"></div>
                    </div>
                    <div class="metric-row">
                        <span class="metric-label">Coupling:</span>
                        <span class="metric-value">${((architecture.coupling || 0) * 100).toFixed(1)}%</span>
                    </div>
                    <div class="metric-bar">
                        <div class="metric-fill ${this.getCouplingColor(architecture.coupling || 0)}"
                             style="width: ${(architecture.coupling || 0) * 100}%"></div>
                    </div>
                    <div class="metric-row">
                        <span class="metric-label">Suggestions:</span>
                        <span class="metric-value">${architecture.suggestions || 0}</span>
                    </div>
                ` : `
                    <div class="metric-row">
                        <span class="metric-label">Status:</span>
                        <span class="metric-value">Open a file to analyze</span>
                    </div>
                `}
            </div>
            <div class="tile-actions">
                <button class="tile-action" onclick="runQuickAction('showDependencyGraph')">🕸️ Graph</button>
                <button class="tile-action" onclick="runQuickAction('runArchitectAnalysis')">🚀 Elevate</button>
            </div>
        </div>

        <!-- Performance Tile -->
        <div class="status-tile">
            <div class="tile-header">
                <div class="tile-title">
                    <span class="tile-icon">⚡</span>
                    Performance
                </div>
                <div class="tile-status ${this.getPerformanceStatus(performance)}">
                    ${this.getPerformanceStatusText(performance)}
                </div>
            </div>
            <div class="tile-content">
                <div class="metric-row">
                    <span class="metric-label">Memory Used:</span>
                    <span class="metric-value">${performance.heapUsed || 0} MB</span>
                </div>
                <div class="metric-bar">
                    <div class="metric-fill ${this.getMemoryColor(performance.heapUsed || 0, performance.heapTotal || 100)}"
                         style="width: ${Math.min(((performance.heapUsed || 0) / (performance.heapTotal || 100)) * 100, 100)}%"></div>
                </div>
                <div class="metric-row">
                    <span class="metric-label">Uptime:</span>
                    <span class="metric-value">${this.formatUptime(performance.uptime || 0)}</span>
                </div>
                <div class="metric-row">
                    <span class="metric-label">VS Code:</span>
                    <span class="metric-value">${system.vscodeVersion || 'Unknown'}</span>
                </div>
            </div>
        </div>
    </div>

    <div class="quick-actions">
        <h3>🚀 Quick Actions</h3>
        <div class="quick-action-grid">
            <div class="quick-action-card" onclick="runQuickAction('showDebtSummary')">
                <div class="quick-action-icon">💳</div>
                <div class="quick-action-title">Debt Analysis</div>
                <div class="quick-action-desc">View technical debt summary</div>
            </div>
            <div class="quick-action-card" onclick="runQuickAction('runArchitectAnalysis')">
                <div class="quick-action-icon">🏗️</div>
                <div class="quick-action-title">Architecture Review</div>
                <div class="quick-action-desc">Elevate to architect mode</div>
            </div>
            <div class="quick-action-card" onclick="runQuickAction('showDependencyGraph')">
                <div class="quick-action-icon">🕸️</div>
                <div class="quick-action-title">Dependency Graph</div>
                <div class="quick-action-desc">Explore code relationships</div>
            </div>
            <div class="quick-action-card" onclick="openChat()">
                <div class="quick-action-icon">💬</div>
                <div class="quick-action-title">Open Chat</div>
                <div class="quick-action-desc">Start AI conversation</div>
            </div>
        </div>
    </div>

    <div class="timestamp">
        Last updated: ${new Date(status.timestamp).toLocaleString()}
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        function refresh() {
            vscode.postMessage({ command: 'refresh' });
        }

        function openChat() {
            vscode.postMessage({ command: 'openChat' });
        }

        function runQuickAction(action, params) {
            vscode.postMessage({
                command: 'runQuickAction',
                action: action,
                params: params
            });
        }
    </script>
</body>
</html>`;
    }




    /**
     * Get status CSS class based on risk level
     */
    private getStatusClass(riskLevel: string): string {
        switch (riskLevel) {
            case 'low': return 'status-healthy';
            case 'medium': return 'status-warning';
            case 'high': case 'critical': return 'status-critical';
            default: return 'status-unknown';
        }
    }

    /**
     * Get complexity color based on value
     */
    private getComplexityColor(complexity: number): string {
        if (complexity > 5) return 'fill-red';
        if (complexity > 3) return 'fill-yellow';
        return 'fill-green';
    }

    /**
     * Get coupling color based on value
     */
    private getCouplingColor(coupling: number): string {
        if (coupling > 0.7) return 'fill-red';
        if (coupling > 0.4) return 'fill-yellow';
        return 'fill-green';
    }

    /**
     * Get performance status
     */
    private getPerformanceStatus(performance: any): string {
        const memoryUsage = (performance.heapUsed || 0) / (performance.heapTotal || 100);
        if (memoryUsage > 0.8) return 'status-critical';
        if (memoryUsage > 0.6) return 'status-warning';
        return 'status-healthy';
    }

    /**
     * Get performance status text
     */
    private getPerformanceStatusText(performance: any): string {
        const memoryUsage = (performance.heapUsed || 0) / (performance.heapTotal || 100);
        if (memoryUsage > 0.8) return 'High Usage';
        if (memoryUsage > 0.6) return 'Moderate';
        return 'Good';
    }

    /**
     * Get memory color based on usage
     */
    private getMemoryColor(used: number, total: number): string {
        const usage = used / total;
        if (usage > 0.8) return 'fill-red';
        if (usage > 0.6) return 'fill-yellow';
        return 'fill-green';
    }

    /**
     * Format uptime in human readable format
     */
    private formatUptime(seconds: number): string {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);

        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        } else if (minutes > 0) {
            return `${minutes}m`;
        } else {
            return `${seconds}s`;
        }
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
