import * as vscode from 'vscode';
import { CompanionGuard } from './services/companion-guard';
import { FinalGuard } from './services/final-guard';
import { ArchitectService } from './services/architect-service';
import { GraphService } from './services/graph-service';
import { HotfixService } from './services/hotfix-service';
import { StatusBarManager } from './ui/status-bar-manager';
import { ProgressManager } from './ui/progress-manager';
import { NotificationManager } from './ui/notification-manager';
import { HelpSystem } from './ui/help-system';
import { TelemetryService, trackFeature, trackPerformance } from './utils/telemetry';
import { HealthCheckSystem } from './utils/health-check';
import { ConfigurationManager } from './utils/configuration-manager';
import { ToolManager } from './utils/tool-manager';
import { SecurityValidator } from './utils/security-validator';
import { SecurityValidatorService } from './services/security-validator';
import { ArchitectCommands } from './commands/architect-commands';
import { SecurityCommands } from './commands/security-commands';

export class FlowCodeExtension {
    private companionGuard: CompanionGuard;
    private finalGuard: FinalGuard;
    private architectService: ArchitectService;
    private graphService: GraphService;
    private hotfixService: HotfixService;
    private statusBarManager: StatusBarManager;
    private progressManager: ProgressManager;
    private notificationManager: NotificationManager;
    private helpSystem: HelpSystem;
    private telemetryService: TelemetryService;
    private healthCheckSystem: HealthCheckSystem;
    private configManager: ConfigurationManager;
    private securityValidatorService: SecurityValidatorService;
    private architectCommands: ArchitectCommands;
    private securityCommands: SecurityCommands;

    constructor(private context: vscode.ExtensionContext) {
        this.configManager = new ConfigurationManager(context);
        this.statusBarManager = new StatusBarManager();
        this.progressManager = new ProgressManager();
        this.notificationManager = NotificationManager.getInstance();
        this.helpSystem = HelpSystem.getInstance();
        this.telemetryService = TelemetryService.getInstance();
        this.healthCheckSystem = HealthCheckSystem.getInstance();
        this.companionGuard = new CompanionGuard(this.configManager);
        this.finalGuard = new FinalGuard(this.configManager);
        this.architectService = new ArchitectService(this.configManager);
        this.graphService = new GraphService();
        this.hotfixService = new HotfixService(this.configManager);
        this.securityValidatorService = new SecurityValidatorService(this.configManager);
        this.architectCommands = new ArchitectCommands(this.configManager);
        this.securityCommands = new SecurityCommands(this.configManager);
    }

    public async activate(): Promise<void> {
        try {
            // Check dependencies first
            await this.checkDependencies();
            await this.configManager.validateConfiguration();
            await this.initializeServices();
            this.statusBarManager.showReady();
            vscode.window.showInformationMessage('FlowCode activated successfully!');
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            this.statusBarManager.showError(message);
            vscode.window.showErrorMessage(`FlowCode activation failed: ${message}`);
        }
    }

    public async deactivate(): Promise<void> {
        this.companionGuard.dispose();
        this.statusBarManager.dispose();
    }

    public async initialize(): Promise<void> {
        try {
            await this.configManager.validateConfiguration();
            await this.initializeGitHooks();
            vscode.window.showInformationMessage('FlowCode initialized successfully!');
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            vscode.window.showErrorMessage(`FlowCode initialization failed: ${message}`);
        }
    }

    @trackFeature('architect', 'elevate')
    @trackPerformance('elevateToArchitect')
    public async elevateToArchitect(): Promise<void> {
        try {
            this.statusBarManager.showRunning('Architect Refactor');
            await this.architectCommands.elevateToArchitect();
            this.statusBarManager.showReady();
        } catch (error) {
            this.statusBarManager.showError('Architect failed');
            const message = error instanceof Error ? error.message : 'Unknown error';

            await this.notificationManager.showError(
                'Architect refactoring failed',
                {
                    operation: 'Architect Refactor',
                    suggestion: 'Try selecting a smaller piece of code or check your API configuration',
                    documentation: 'https://flowcode.dev/docs/troubleshooting',
                    reportable: true
                },
                { detail: message }
            );
        }
    }

    @trackFeature('architect', 'generate')
    @trackPerformance('generateCode')
    public async generateCode(): Promise<void> {
        try {
            this.statusBarManager.showRunning('Code Generation');
            await this.architectCommands.generateCode();
            this.statusBarManager.showReady();
        } catch (error) {
            this.statusBarManager.showError('Code generation failed');
            const message = error instanceof Error ? error.message : 'Unknown error';

            await this.notificationManager.showError(
                'Code generation failed',
                {
                    operation: 'Code Generation',
                    suggestion: 'Check your API configuration and try again',
                    documentation: 'https://flowcode.dev/docs/troubleshooting',
                    reportable: true
                },
                { detail: message }
            );
        }
    }

    @trackFeature('hotfix', 'create')
    @trackPerformance('createHotfix')
    public async createHotfix(): Promise<void> {
        const message = await this.notificationManager.showInput(
            'Enter hotfix commit message',
            {
                placeholder: 'Fix critical bug in authentication',
                validator: (value) => {
                    if (!value.trim()) return 'Commit message cannot be empty';
                    if (value.length < 10) return 'Commit message too short (minimum 10 characters)';
                    if (value.length > 500) return 'Commit message too long (maximum 500 characters)';
                    return null;
                }
            }
        );

        if (!message) {
            return;
        }

        try {
            this.statusBarManager.showRunning('Creating Hotfix');

            await this.progressManager.withProgress('create-hotfix', {
                title: "🚀 Creating Hotfix",
                location: vscode.ProgressLocation.Notification,
                cancellable: false,
                steps: [
                    { name: 'validate', weight: 10, message: 'Validating changes...' },
                    { name: 'branch', weight: 20, message: 'Creating hotfix branch...' },
                    { name: 'commit', weight: 30, message: 'Committing changes...' },
                    { name: 'checks', weight: 30, message: 'Running quality checks...' },
                    { name: 'finalize', weight: 10, message: 'Finalizing hotfix...' }
                ]
            }, async (progress) => {
                progress.startStep('create-hotfix');
                progress.completeStep('create-hotfix', 'Changes validated');

                await this.hotfixService.createHotfix(message);

                progress.completeStep('create-hotfix', 'Branch created');
                progress.completeStep('create-hotfix', 'Changes committed');
                progress.completeStep('create-hotfix', 'Quality checks passed');
                progress.completeStep('create-hotfix', 'Hotfix ready');
            });

            this.statusBarManager.showSuccess('Hotfix created');

            await this.notificationManager.showSuccess(
                'Hotfix created successfully!',
                `Created hotfix branch with message: "${message}"`,
                ['🔍 View Changes', '🚀 Deploy']
            );
        } catch (error) {
            this.statusBarManager.showError('Hotfix failed');
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';

            await this.notificationManager.showError(
                'Hotfix creation failed',
                {
                    operation: 'Create Hotfix',
                    suggestion: 'Check your git configuration and ensure you have uncommitted changes',
                    documentation: 'https://flowcode.dev/docs/hotfix',
                    reportable: true
                },
                { detail: errorMessage }
            );
        }
    }

    public async showCodeGraph(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor found');
            return;
        }

        try {
            const graph = await this.graphService.generateGraph(
                editor.document.uri.fsPath,
                editor.selection.active
            );
            
            if (graph) {
                await this.graphService.showGraphView(graph);
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            vscode.window.showErrorMessage(`Graph generation failed: ${message}`);
        }
    }

    public async configureApiKey(): Promise<void> {
        try {
            // Check if API key already exists and offer to replace
            const existingConfig = await this.getExistingApiConfig();
            if (existingConfig) {
                const replace = await vscode.window.showWarningMessage(
                    `API key for ${existingConfig.provider} is already configured. Replace it?`,
                    'Yes', 'No'
                );
                if (replace !== 'Yes') {
                    return;
                }
            }

            const provider = await vscode.window.showQuickPick(['OpenAI', 'Anthropic'], {
                placeHolder: 'Select your AI provider',
                ignoreFocusOut: true
            });

            if (!provider) {
                return;
            }

            const providerLower = provider.toLowerCase() as 'openai' | 'anthropic';
            const keyFormat = providerLower === 'openai'
                ? 'sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
                : 'sk-ant-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';

            const apiKey = await vscode.window.showInputBox({
                prompt: `Enter your ${provider} API key`,
                placeHolder: keyFormat,
                password: true,
                ignoreFocusOut: true,
                validateInput: (value) => {
                    if (!value || value.trim().length === 0) {
                        return 'API key cannot be empty';
                    }

                    const trimmedValue = value.trim();

                    // Basic format validation
                    if (providerLower === 'openai' && !trimmedValue.startsWith('sk-')) {
                        return 'OpenAI API keys must start with "sk-"';
                    }
                    if (providerLower === 'anthropic' && !trimmedValue.startsWith('sk-ant-')) {
                        return 'Anthropic API keys must start with "sk-ant-"';
                    }

                    return null;
                }
            });

            if (!apiKey) {
                return;
            }

            // Show progress while validating and storing
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "Configuring API key...",
                cancellable: false
            }, async (progress) => {
                progress.report({ message: "Validating API key format..." });

                try {
                    // Store the API key (this will validate format)
                    await this.configManager.setApiConfiguration(providerLower, apiKey);

                    progress.report({ message: "Testing API key..." });

                    // Test the API key
                    const isValid = await this.configManager.testApiKey(providerLower, apiKey);
                    if (!isValid && providerLower === 'openai') {
                        const proceed = await vscode.window.showWarningMessage(
                            'API key validation failed. The key may be invalid or there may be network issues. Save anyway?',
                            'Save Anyway', 'Cancel'
                        );
                        if (proceed !== 'Save Anyway') {
                            await this.configManager.clearApiCredentials();
                            return;
                        }
                    }

                    progress.report({ message: "Verifying secure storage..." });

                    // Verify integrity
                    const integrityCheck = await this.configManager.verifyApiKeyIntegrity();
                    if (!integrityCheck) {
                        throw new Error('API key integrity verification failed');
                    }

                } catch (error) {
                    const message = error instanceof Error ? error.message : 'Unknown error';
                    throw new Error(`Failed to configure API key: ${message}`);
                }
            });

            vscode.window.showInformationMessage(
                `✅ ${provider} API key configured securely!`,
                'Test Connection'
            ).then(selection => {
                if (selection === 'Test Connection') {
                    this.testApiConnection();
                }
            });

        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            vscode.window.showErrorMessage(`API key configuration failed: ${message}`);
        }
    }

    private async initializeServices(): Promise<void> {
        await this.companionGuard.initialize();
        await this.finalGuard.initialize();
        await this.graphService.initialize();
        await this.hotfixService.initialize();
        await this.securityValidatorService.initialize();
        await this.architectCommands.initialize();
        await this.securityCommands.initialize();
    }

    private async initializeGitHooks(): Promise<void> {
        // Git hooks initialization will be implemented here
        // This includes setting up pre-commit and pre-push hooks
    }

    private async getExistingApiConfig(): Promise<{ provider: string } | null> {
        try {
            const config = await this.configManager.getApiConfiguration();
            return { provider: config.provider };
        } catch {
            return null;
        }
    }

    private async testApiConnection(): Promise<void> {
        try {
            const config = await this.configManager.getApiConfiguration();

            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "Testing API connection...",
                cancellable: false
            }, async () => {
                const isValid = await this.configManager.testApiKey(config.provider, config.apiKey);

                if (isValid) {
                    vscode.window.showInformationMessage(`✅ ${config.provider} API connection successful!`);
                } else {
                    vscode.window.showWarningMessage(`⚠️ ${config.provider} API connection failed. Please check your API key.`);
                }
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            vscode.window.showErrorMessage(`API connection test failed: ${message}`);
        }
    }

    public async clearApiCredentials(): Promise<void> {
        const confirm = await vscode.window.showWarningMessage(
            'Are you sure you want to clear all API credentials? This action cannot be undone.',
            'Clear Credentials', 'Cancel'
        );

        if (confirm === 'Clear Credentials') {
            try {
                await this.configManager.clearApiCredentials();
                vscode.window.showInformationMessage('API credentials cleared successfully.');
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Unknown error';
                vscode.window.showErrorMessage(`Failed to clear credentials: ${message}`);
            }
        }
    }

    private async checkDependencies(): Promise<void> {
        const result = await ToolManager.checkAllDependencies();

        if (!result.allRequired) {
            const missingNames = result.missing.map(t => t.name).join(', ');
            const action = await vscode.window.showWarningMessage(
                `⚠️ Missing required tools: ${missingNames}. FlowCode may not work properly.`,
                'Show Installation Guide',
                'Continue Anyway'
            );

            if (action === 'Show Installation Guide') {
                await ToolManager.showDependencyStatus();
            }
        }
    }

    public async checkDependencyStatus(): Promise<void> {
        await ToolManager.showDependencyStatus();
    }

    public async installTool(): Promise<void> {
        const tools = ['TypeScript', 'ESLint', 'Semgrep'];
        const selected = await vscode.window.showQuickPick(tools, {
            placeHolder: 'Select a tool to install'
        });

        if (selected) {
            const success = await ToolManager.installTool(selected);
            if (success) {
                vscode.window.showInformationMessage(`✅ ${selected} installed successfully!`);
            } else {
                vscode.window.showErrorMessage(`❌ Failed to install ${selected}. Please install manually.`);
            }
        }
    }

    public async runSecurityAudit(): Promise<void> {
        try {
            await this.securityCommands.runSecurityAudit();
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            vscode.window.showErrorMessage(`Security audit failed: ${message}`);
        }
    }

    private generateSecurityReportHtml(report: string, auditResult: any): string {
        const scoreColor = auditResult.overallScore >= 80 ? '#28a745' :
                          auditResult.overallScore >= 60 ? '#ffc107' : '#dc3545';

        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>FlowCode Security Audit Report</title>
            <style>
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    margin: 20px;
                    line-height: 1.6;
                }
                .score {
                    font-size: 2em;
                    font-weight: bold;
                    color: ${scoreColor};
                    text-align: center;
                    margin: 20px 0;
                }
                .summary {
                    background: #f8f9fa;
                    padding: 15px;
                    border-radius: 5px;
                    margin: 20px 0;
                }
                .critical { color: #dc3545; font-weight: bold; }
                .high { color: #fd7e14; font-weight: bold; }
                .medium { color: #ffc107; font-weight: bold; }
                .low { color: #6c757d; }
                .pass { color: #28a745; }
                .fail { color: #dc3545; }
                pre { background: #f8f9fa; padding: 10px; border-radius: 3px; overflow-x: auto; }
                h1, h2, h3 { color: #333; }
                ul { padding-left: 20px; }
            </style>
        </head>
        <body>
            <div class="score">Security Score: ${auditResult.overallScore}/100</div>
            <div class="summary">
                <h3>Summary</h3>
                <ul>
                    <li>Total Checks: ${auditResult.totalChecks}</li>
                    <li>Passed: <span class="pass">${auditResult.passedChecks}</span></li>
                    <li>Critical Issues: <span class="critical">${auditResult.criticalIssues}</span></li>
                    <li>High Issues: <span class="high">${auditResult.highIssues}</span></li>
                    <li>Medium Issues: <span class="medium">${auditResult.mediumIssues}</span></li>
                    <li>Low Issues: <span class="low">${auditResult.lowIssues}</span></li>
                </ul>
            </div>
            <pre>${report}</pre>
        </body>
        </html>
        `;
    }

    public async showStatusDashboard(): Promise<void> {
        try {
            const panel = vscode.window.createWebviewPanel(
                'flowcodeStatus',
                'FlowCode Status Dashboard',
                vscode.ViewColumn.One,
                { enableScripts: true }
            );

            const html = await this.generateStatusDashboardHtml();
            panel.webview.html = html;

            // Handle messages from webview
            panel.webview.onDidReceiveMessage(async (message) => {
                switch (message.command) {
                    case 'clearCache':
                        const { CacheManager } = await import('./utils/performance-cache');
                        CacheManager.clearAll();
                        await this.notificationManager.showSuccess('Cache cleared successfully');
                        break;
                    case 'runSecurityAudit':
                        await this.runSecurityAudit();
                        break;
                    case 'checkDependencies':
                        await this.checkDependencyStatus();
                        break;
                }
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            await this.notificationManager.showError(
                'Failed to show status dashboard',
                {
                    operation: 'Status Dashboard',
                    suggestion: 'Try restarting VS Code if the issue persists',
                    reportable: true
                },
                { detail: message }
            );
        }
    }

    private async generateStatusDashboardHtml(): Promise<string> {
        const { PerformanceMonitor } = await import('./utils/performance-monitor');
        const { CacheManager } = await import('./utils/performance-cache');

        const performanceStats = PerformanceMonitor.getInstance().getAllStats();
        const cacheStats = CacheManager.getAllStats();
        const systemMetrics = PerformanceMonitor.getInstance().getCurrentSystemMetrics();

        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>FlowCode Status Dashboard</title>
            <style>
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    margin: 20px;
                    background: var(--vscode-editor-background);
                    color: var(--vscode-editor-foreground);
                }
                .dashboard { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
                .card {
                    background: var(--vscode-editor-inactiveSelectionBackground);
                    padding: 15px;
                    border-radius: 8px;
                    border: 1px solid var(--vscode-panel-border);
                }
                .metric { display: flex; justify-content: space-between; margin: 8px 0; }
                .metric-value { font-weight: bold; color: var(--vscode-textLink-foreground); }
                .button {
                    background: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    padding: 8px 16px;
                    border-radius: 4px;
                    cursor: pointer;
                    margin: 4px;
                }
                .button:hover { background: var(--vscode-button-hoverBackground); }
                h2 { color: var(--vscode-textLink-foreground); margin-top: 0; }
                .status-good { color: #4CAF50; }
                .status-warning { color: #FF9800; }
                .status-error { color: #F44336; }
            </style>
        </head>
        <body>
            <h1>🚀 FlowCode Status Dashboard</h1>

            <div class="dashboard">
                <div class="card">
                    <h2>📊 Performance Metrics</h2>
                    ${performanceStats.map(stat => `
                        <div class="metric">
                            <span>${stat.name}</span>
                            <span class="metric-value">${stat.averageDuration.toFixed(1)}ms avg</span>
                        </div>
                    `).join('')}
                    <div class="metric">
                        <span>Memory Usage</span>
                        <span class="metric-value">${(systemMetrics.memoryUsage.heapUsed / 1024 / 1024).toFixed(1)} MB</span>
                    </div>
                </div>

                <div class="card">
                    <h2>💾 Cache Status</h2>
                    ${Object.entries(cacheStats).map(([name, stats]) => `
                        <div class="metric">
                            <span>${name}</span>
                            <span class="metric-value">${stats.totalEntries} entries (${(stats.hitRate * 100).toFixed(1)}% hit rate)</span>
                        </div>
                    `).join('')}
                    <button class="button" onclick="clearCache()">🗑️ Clear All Caches</button>
                </div>

                <div class="card">
                    <h2>🔧 Quick Actions</h2>
                    <button class="button" onclick="runSecurityAudit()">🛡️ Run Security Audit</button>
                    <button class="button" onclick="checkDependencies()">📦 Check Dependencies</button>
                    <button class="button" onclick="location.reload()">🔄 Refresh Dashboard</button>
                </div>

                <div class="card">
                    <h2>ℹ️ System Information</h2>
                    <div class="metric">
                        <span>VS Code Version</span>
                        <span class="metric-value">${vscode.version}</span>
                    </div>
                    <div class="metric">
                        <span>Platform</span>
                        <span class="metric-value">${process.platform}</span>
                    </div>
                    <div class="metric">
                        <span>Node Version</span>
                        <span class="metric-value">${process.version}</span>
                    </div>
                </div>
            </div>

            <script>
                const vscode = acquireVsCodeApi();

                function clearCache() {
                    vscode.postMessage({ command: 'clearCache' });
                }

                function runSecurityAudit() {
                    vscode.postMessage({ command: 'runSecurityAudit' });
                }

                function checkDependencies() {
                    vscode.postMessage({ command: 'checkDependencies' });
                }
            </script>
        </body>
        </html>
        `;
    }

    public async showHelp(): Promise<void> {
        await this.helpSystem.showHelpPanel();
    }

    public async showContextualHelp(): Promise<void> {
        await this.helpSystem.showContextualHelp();
    }

    public async showQuickHelp(topic?: string): Promise<void> {
        if (topic) {
            await this.helpSystem.showQuickHelp(topic);
        } else {
            await this.helpSystem.showContextualHelp();
        }
    }

    public async showHealthStatus(): Promise<void> {
        try {
            const health = await this.healthCheckSystem.runHealthChecks();
            const report = this.healthCheckSystem.generateHealthReport();

            const panel = vscode.window.createWebviewPanel(
                'flowcodeHealth',
                'FlowCode Health Status',
                vscode.ViewColumn.One,
                { enableScripts: true }
            );

            panel.webview.html = this.generateHealthStatusHtml(health, report);

            this.telemetryService.trackUserAction('show_health_status', 'command');
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            await this.notificationManager.showError(
                'Failed to show health status',
                {
                    operation: 'Health Status',
                    suggestion: 'Try restarting VS Code if the issue persists',
                    reportable: true
                },
                { detail: message }
            );
        }
    }

    public async runHealthCheck(checkName?: string): Promise<void> {
        try {
            if (checkName) {
                const result = await this.healthCheckSystem.runHealthCheck(checkName);
                if (result) {
                    const status = result.status ? '✅ Passed' : '❌ Failed';
                    const message = `Health check "${checkName}": ${status}`;

                    if (result.status) {
                        await this.notificationManager.showSuccess(message);
                    } else {
                        await this.notificationManager.showError(message, {
                            operation: 'Health Check',
                            suggestion: result.error || 'Check system configuration'
                        });
                    }
                }
            } else {
                const health = await this.healthCheckSystem.runHealthChecks();
                const message = health.overall
                    ? `All health checks passed (${health.summary.passed}/${health.summary.total})`
                    : `Health issues detected (${health.summary.failed}/${health.summary.total} failed)`;

                if (health.overall) {
                    await this.notificationManager.showSuccess(message);
                } else {
                    await this.notificationManager.showWarning(message, {
                        operation: 'Health Check',
                        suggestion: 'Run "FlowCode: Show Health Status" for detailed information'
                    });
                }
            }

            this.telemetryService.trackUserAction('run_health_check', 'command', { checkName });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            await this.notificationManager.showError(
                'Health check failed',
                {
                    operation: 'Health Check',
                    reportable: true
                },
                { detail: message }
            );
        }
    }

    private generateHealthStatusHtml(health: any, report: string): string {
        const statusColor = health.overall ? '#4CAF50' : '#F44336';
        const statusIcon = health.overall ? '✅' : '❌';

        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>FlowCode Health Status</title>
            <style>
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    margin: 20px;
                    background: var(--vscode-editor-background);
                    color: var(--vscode-editor-foreground);
                }
                .header {
                    display: flex;
                    align-items: center;
                    margin-bottom: 20px;
                    padding: 15px;
                    background: var(--vscode-editor-inactiveSelectionBackground);
                    border-radius: 8px;
                }
                .status-icon {
                    font-size: 24px;
                    margin-right: 10px;
                }
                .status-text {
                    font-size: 18px;
                    font-weight: bold;
                    color: ${statusColor};
                }
                .summary {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
                    gap: 15px;
                    margin-bottom: 20px;
                }
                .summary-card {
                    background: var(--vscode-editor-inactiveSelectionBackground);
                    padding: 15px;
                    border-radius: 8px;
                    text-align: center;
                }
                .summary-number {
                    font-size: 24px;
                    font-weight: bold;
                    color: var(--vscode-textLink-foreground);
                }
                .summary-label {
                    font-size: 14px;
                    opacity: 0.8;
                    margin-top: 5px;
                }
                .report {
                    background: var(--vscode-editor-inactiveSelectionBackground);
                    padding: 20px;
                    border-radius: 8px;
                    white-space: pre-wrap;
                    font-family: 'Courier New', monospace;
                    font-size: 14px;
                    line-height: 1.4;
                }
                .button {
                    background: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    padding: 8px 16px;
                    border-radius: 4px;
                    cursor: pointer;
                    margin: 4px;
                }
                .button:hover { background: var(--vscode-button-hoverBackground); }
            </style>
        </head>
        <body>
            <div class="header">
                <span class="status-icon">${statusIcon}</span>
                <span class="status-text">System ${health.overall ? 'Healthy' : 'Issues Detected'}</span>
            </div>

            <div class="summary">
                <div class="summary-card">
                    <div class="summary-number">${health.summary.total}</div>
                    <div class="summary-label">Total Checks</div>
                </div>
                <div class="summary-card">
                    <div class="summary-number" style="color: #4CAF50">${health.summary.passed}</div>
                    <div class="summary-label">Passed</div>
                </div>
                <div class="summary-card">
                    <div class="summary-number" style="color: #F44336">${health.summary.failed}</div>
                    <div class="summary-label">Failed</div>
                </div>
                <div class="summary-card">
                    <div class="summary-number">${new Date(health.summary.lastCheck).toLocaleTimeString()}</div>
                    <div class="summary-label">Last Check</div>
                </div>
            </div>

            <button class="button" onclick="location.reload()">🔄 Refresh</button>
            <button class="button" onclick="runHealthCheck()">▶️ Run Check</button>

            <div class="report">${report}</div>

            <script>
                function runHealthCheck() {
                    // This would trigger a health check via message passing
                    console.log('Running health check...');
                }
            </script>
        </body>
        </html>
        `;
    }
}