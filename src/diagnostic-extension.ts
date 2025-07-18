import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Comprehensive diagnostic extension that records and logs everything
 * This will help us identify exactly what's broken and where
 */
export class DiagnosticExtension {
    private outputChannel: vscode.OutputChannel;
    private logFile: string;
    private diagnosticData: any[] = [];
    private startTime: number;

    constructor(private context: vscode.ExtensionContext) {
        this.startTime = Date.now();
        this.outputChannel = vscode.window.createOutputChannel('FlowCode Diagnostics');
        this.outputChannel.show();
        
        // Create log file in extension directory
        this.logFile = path.join(context.extensionPath, 'diagnostic-log.json');
        
        this.log('🚀 DiagnosticExtension created successfully');
        this.recordDiagnostic('constructor', 'DiagnosticExtension constructor completed', { 
            timestamp: new Date().toISOString(),
            extensionPath: context.extensionPath,
            globalStateKeys: context.globalState.keys().length
        });
    }

    private log(message: string, data?: any): void {
        const timestamp = new Date().toISOString();
        const logEntry = `[${timestamp}] ${message}`;
        
        // Log to output channel
        this.outputChannel.appendLine(logEntry);
        
        // Log to console
        console.log(`[FlowCode Diagnostic] ${message}`, data || '');
        
        // Record to diagnostic data
        this.recordDiagnostic('log', message, { timestamp, data });
    }

    private recordDiagnostic(category: string, message: string, data: any = {}): void {
        const entry = {
            category,
            message,
            timestamp: new Date().toISOString(),
            elapsedMs: Date.now() - this.startTime,
            data
        };
        
        this.diagnosticData.push(entry);
        
        // Write to file immediately for crash recovery
        try {
            fs.writeFileSync(this.logFile, JSON.stringify(this.diagnosticData, null, 2));
        } catch (error) {
            console.error('Failed to write diagnostic log:', error);
        }
    }

    public async activate(): Promise<void> {
        this.log('🚀 Starting comprehensive FlowCode diagnostic activation...');
        this.recordDiagnostic('activation', 'Diagnostic activation started');

        try {
            // Test environment
            await this.testEnvironment();

            // Test command registration
            await this.testCommandRegistration();

            // Test webview functionality
            await this.testWebviewFunctionality();

            // Test service imports
            await this.testServiceImports();

            // Register report generation command
            const reportCommand = vscode.commands.registerCommand('flowcode.diagnostic.report', async () => {
                await this.generateDiagnosticReport();
            });
            this.context.subscriptions.push(reportCommand);

            this.log('🎉 All diagnostic tests completed successfully!');
            this.recordDiagnostic('activation', 'All diagnostic tests completed');

            // Auto-generate initial report
            await this.generateDiagnosticReport();

        } catch (error) {
            this.log('❌ Diagnostic activation failed', error);
            this.recordDiagnostic('error', 'Diagnostic activation failed', {
                error: error instanceof Error ? {
                    name: error.name,
                    message: error.message,
                    stack: error.stack
                } : error
            });
        }
    }

    private async testEnvironment(): Promise<void> {
        this.log('🔍 Testing VS Code environment...');
        
        try {
            // Test VS Code API availability
            this.recordDiagnostic('test', 'VS Code API availability', {
                vscode: !!vscode,
                version: vscode.version,
                env: {
                    appName: vscode.env.appName,
                    appRoot: vscode.env.appRoot,
                    language: vscode.env.language,
                    machineId: vscode.env.machineId.substring(0, 8) + '...',
                    sessionId: vscode.env.sessionId.substring(0, 8) + '...'
                }
            });

            // Test workspace information
            const workspaceFolders = vscode.workspace.workspaceFolders;
            this.recordDiagnostic('test', 'Workspace information', {
                hasWorkspace: !!workspaceFolders,
                folderCount: workspaceFolders?.length || 0,
                folders: workspaceFolders?.map(f => ({
                    name: f.name,
                    scheme: f.uri.scheme,
                    path: f.uri.fsPath
                })) || []
            });

            // Test extension context
            this.recordDiagnostic('test', 'Extension context', {
                extensionPath: this.context.extensionPath,
                storagePath: this.context.storagePath,
                globalStoragePath: this.context.globalStoragePath,
                logPath: this.context.logPath,
                subscriptionsCount: this.context.subscriptions.length,
                globalStateKeys: this.context.globalState.keys(),
                workspaceStateKeys: this.context.workspaceState.keys()
            });

            // Test configuration access
            const config = vscode.workspace.getConfiguration('flowcode');
            this.recordDiagnostic('test', 'Configuration access', {
                configExists: !!config,
                configKeys: Object.keys(config),
                sampleSettings: {
                    'agent.riskTolerance': config.get('agent.riskTolerance'),
                    'agent.autoApprovalLevel': config.get('agent.autoApprovalLevel')
                }
            });

            this.log('✅ Environment testing completed');

        } catch (error) {
            this.log('❌ Environment testing failed', error);
            this.recordDiagnostic('error', 'Environment testing failed', {
                error: error instanceof Error ? {
                    name: error.name,
                    message: error.message,
                    stack: error.stack
                } : error
            });
        }
    }

    private async testCommandRegistration(): Promise<void> {
        this.log('🔍 Testing command registration...');
        
        try {
            // Test basic command registration
            const testCommand = vscode.commands.registerCommand('flowcode.diagnostic.test', () => {
                this.log('🧪 Diagnostic test command executed!');
                this.recordDiagnostic('command', 'Test command executed');
                vscode.window.showInformationMessage('FlowCode Diagnostic: Basic functionality working! 🎉');
            });
            this.context.subscriptions.push(testCommand);
            this.recordDiagnostic('test', 'Basic command registration', { success: true });

            // Test parameter command
            const paramCommand = vscode.commands.registerCommand('flowcode.diagnostic.param', (param: string) => {
                this.log(`🧪 Parameter command executed with: ${param}`);
                this.recordDiagnostic('command', 'Parameter command executed', { param });
                vscode.window.showInformationMessage(`Parameter received: ${param}`);
            });
            this.context.subscriptions.push(paramCommand);
            this.recordDiagnostic('test', 'Parameter command registration', { success: true });

            // Test async command
            const asyncCommand = vscode.commands.registerCommand('flowcode.diagnostic.async', async () => {
                this.log('🧪 Async command started...');
                this.recordDiagnostic('command', 'Async command started');
                
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                this.log('🧪 Async command completed!');
                this.recordDiagnostic('command', 'Async command completed');
                vscode.window.showInformationMessage('Async command completed!');
            });
            this.context.subscriptions.push(asyncCommand);
            this.recordDiagnostic('test', 'Async command registration', { success: true });

            this.log('✅ Command registration tests passed');

        } catch (error) {
            this.log('❌ Command registration tests failed', error);
            this.recordDiagnostic('error', 'Command registration failed', {
                error: error instanceof Error ? {
                    name: error.name,
                    message: error.message,
                    stack: error.stack
                } : error
            });
        }
    }

    private async testWebviewFunctionality(): Promise<void> {
        this.log('🔍 Testing webview functionality...');
        
        try {
            // Test webview creation command
            const webviewCommand = vscode.commands.registerCommand('flowcode.diagnostic.webview', () => {
                this.createDiagnosticWebview();
            });
            this.context.subscriptions.push(webviewCommand);
            this.recordDiagnostic('test', 'Webview command registration', { success: true });

            // Test basic webview panel creation
            const testPanel = vscode.window.createWebviewPanel(
                'flowcodeDiagnosticTest',
                'Test Panel',
                { viewColumn: vscode.ViewColumn.One, preserveFocus: true },
                { enableScripts: true, retainContextWhenHidden: true }
            );
            
            testPanel.webview.html = '<h1>Test</h1>';
            testPanel.dispose(); // Clean up immediately
            
            this.recordDiagnostic('test', 'Webview panel creation', { success: true });
            this.log('✅ Webview functionality tests passed');

        } catch (error) {
            this.log('❌ Webview functionality tests failed', error);
            this.recordDiagnostic('error', 'Webview functionality failed', {
                error: error instanceof Error ? {
                    name: error.name,
                    message: error.message,
                    stack: error.stack
                } : error
            });
        }
    }

    private async testServiceImports(): Promise<void> {
        this.log('🔍 Testing service imports...');
        
        try {
            const services = [
                { name: 'ConfigurationManager', path: './utils/configuration-manager' },
                { name: 'StatusBarManager', path: './ui/status-bar-manager' },
                { name: 'ProgressManager', path: './ui/progress-manager' },
                { name: 'NotificationManager', path: './ui/notification-manager' },
                { name: 'HelpSystem', path: './ui/help-system' },
                { name: 'HealthCheckSystem', path: './utils/health-check' }
            ];

            for (const service of services) {
                try {
                    const serviceModule = await import(service.path);
                    this.recordDiagnostic('test', `Service import: ${service.name}`, { 
                        success: true,
                        hasDefault: !!serviceModule.default,
                        exports: Object.keys(serviceModule)
                    });
                } catch (error) {
                    this.recordDiagnostic('error', `Service import failed: ${service.name}`, {
                        error: error instanceof Error ? {
                            name: error.name,
                            message: error.message
                        } : error
                    });
                }
            }

            this.log('✅ Service import tests completed');

        } catch (error) {
            this.log('❌ Service import tests failed', error);
            this.recordDiagnostic('error', 'Service import tests failed', {
                error: error instanceof Error ? {
                    name: error.name,
                    message: error.message,
                    stack: error.stack
                } : error
            });
        }
    }

    private createDiagnosticWebview(): void {
        try {
            this.log('Creating comprehensive diagnostic webview...');
            this.recordDiagnostic('webview', 'Creating diagnostic webview');

            const panel = vscode.window.createWebviewPanel(
                'flowcodeDiagnostic',
                'FlowCode Comprehensive Diagnostic Panel',
                vscode.ViewColumn.One,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true
                }
            );

            panel.webview.html = this.getDiagnosticWebviewContent();
            
            // Handle messages from webview
            panel.webview.onDidReceiveMessage(
                message => {
                    switch (message.command) {
                        case 'test':
                            this.log(`Webview test message received: ${message.text}`);
                            this.recordDiagnostic('webview', 'Message received from webview', { message: message.text });
                            vscode.window.showInformationMessage(`Webview communication working: ${message.text}`);
                            break;
                        case 'refresh':
                            panel.webview.html = this.getDiagnosticWebviewContent();
                            this.recordDiagnostic('webview', 'Webview refreshed');
                            break;
                        case 'export':
                            this.generateDiagnosticReport();
                            break;
                    }
                },
                undefined,
                this.context.subscriptions
            );

            this.log('✅ Comprehensive diagnostic webview created successfully');
            this.recordDiagnostic('webview', 'Diagnostic webview created successfully');

        } catch (error) {
            this.log(`❌ Failed to create diagnostic webview: ${error}`);
            this.recordDiagnostic('error', 'Webview creation failed', {
                error: error instanceof Error ? {
                    name: error.name,
                    message: error.message,
                    stack: error.stack
                } : error
            });
            vscode.window.showErrorMessage(`Failed to create diagnostic webview: ${error}`);
        }
    }

    private getDiagnosticWebviewContent(): string {
        const errorCount = this.diagnosticData.filter(d => d.category === 'error').length;
        const testCount = this.diagnosticData.filter(d => d.category === 'test').length;
        const commandCount = this.diagnosticData.filter(d => d.category === 'command').length;
        const elapsedTime = Date.now() - this.startTime;

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>FlowCode Comprehensive Diagnostic</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 20px;
            line-height: 1.6;
        }
        .header {
            background: var(--vscode-panel-background);
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 20px;
            border: 1px solid var(--vscode-panel-border);
        }
        .summary {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 15px;
            margin-top: 15px;
        }
        .summary-item {
            padding: 10px;
            background: var(--vscode-input-background);
            border-radius: 4px;
            border: 1px solid var(--vscode-input-border);
        }
        .summary-item.error {
            border-color: var(--vscode-charts-red);
        }
        .summary-item.success {
            border-color: var(--vscode-charts-green);
        }
        .summary-label {
            font-weight: bold;
            display: block;
        }
        .summary-value {
            font-size: 18px;
            color: var(--vscode-foreground);
        }
        .test-section {
            background: var(--vscode-input-background);
            padding: 15px;
            border-radius: 6px;
            margin-bottom: 15px;
            border: 1px solid var(--vscode-input-border);
        }
        .success { color: var(--vscode-charts-green); }
        .warning { color: var(--vscode-charts-yellow); }
        .error { color: var(--vscode-charts-red); }
        button {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 10px 20px;
            border-radius: 4px;
            cursor: pointer;
            margin: 5px;
        }
        button:hover {
            background: var(--vscode-button-hoverBackground);
        }
        .diagnostic-data {
            max-height: 400px;
            overflow-y: auto;
            background: var(--vscode-editor-background);
            padding: 10px;
            border-radius: 4px;
            border: 1px solid var(--vscode-panel-border);
            font-family: monospace;
            font-size: 12px;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>🔧 FlowCode Comprehensive Diagnostic Panel</h1>
        <div class="summary">
            <div class="summary-item ${errorCount > 0 ? 'error' : 'success'}">
                <span class="summary-label">Status:</span>
                <span class="summary-value">${errorCount > 0 ? '❌ Issues Found' : '✅ All Tests Passed'}</span>
            </div>
            <div class="summary-item">
                <span class="summary-label">Tests:</span>
                <span class="summary-value">${testCount}</span>
            </div>
            <div class="summary-item">
                <span class="summary-label">Errors:</span>
                <span class="summary-value">${errorCount}</span>
            </div>
            <div class="summary-item">
                <span class="summary-label">Commands:</span>
                <span class="summary-value">${commandCount}</span>
            </div>
            <div class="summary-item">
                <span class="summary-label">Runtime:</span>
                <span class="summary-value">${Math.round(elapsedTime / 1000)}s</span>
            </div>
        </div>
    </div>

    <div class="test-section">
        <h3>🔄 Actions</h3>
        <button onclick="testCommunication()">Test Communication</button>
        <button onclick="refreshData()">Refresh Data</button>
        <button onclick="exportReport()">Export Report</button>
    </div>

    <div class="test-section">
        <h3>📊 Diagnostic Data</h3>
        <div class="diagnostic-data">
            <pre>${JSON.stringify(this.diagnosticData, null, 2)}</pre>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        function testCommunication() {
            vscode.postMessage({
                command: 'test',
                text: 'Hello from comprehensive diagnostic webview!'
            });
        }

        function refreshData() {
            vscode.postMessage({
                command: 'refresh'
            });
        }

        function exportReport() {
            vscode.postMessage({
                command: 'export'
            });
        }

        // Auto-refresh every 10 seconds
        setInterval(refreshData, 10000);
    </script>
</body>
</html>`;
    }

    public async generateDiagnosticReport(): Promise<void> {
        this.log('📊 Generating comprehensive diagnostic report...');

        try {
            const report = {
                metadata: {
                    timestamp: new Date().toISOString(),
                    totalElapsedMs: Date.now() - this.startTime,
                    vsCodeVersion: vscode.version,
                    extensionPath: this.context.extensionPath
                },
                summary: {
                    totalTests: this.diagnosticData.filter(d => d.category === 'test').length,
                    totalErrors: this.diagnosticData.filter(d => d.category === 'error').length,
                    totalCommands: this.diagnosticData.filter(d => d.category === 'command').length,
                    totalLogs: this.diagnosticData.filter(d => d.category === 'log').length
                },
                diagnosticData: this.diagnosticData
            };

            // Write comprehensive report
            const reportPath = path.join(this.context.extensionPath, 'diagnostic-report.json');
            fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

            this.log(`📊 Diagnostic report saved to: ${reportPath}`);
            this.recordDiagnostic('report', 'Diagnostic report generated', { reportPath });

            // Show summary to user
            const errorCount = report.summary.totalErrors;
            const testCount = report.summary.totalTests;
            const message = errorCount > 0
                ? `⚠️ Diagnostic completed with ${errorCount} errors out of ${testCount} tests. Check report for details.`
                : `✅ All ${testCount} diagnostic tests passed successfully!`;

            vscode.window.showInformationMessage(message, 'Open Report', 'Open Log').then(selection => {
                if (selection === 'Open Report') {
                    vscode.workspace.openTextDocument(reportPath).then(doc => {
                        vscode.window.showTextDocument(doc);
                    });
                } else if (selection === 'Open Log') {
                    vscode.workspace.openTextDocument(this.logFile).then(doc => {
                        vscode.window.showTextDocument(doc);
                    });
                }
            });

        } catch (error) {
            this.log('❌ Failed to generate diagnostic report', error);
            this.recordDiagnostic('error', 'Report generation failed', {
                error: error instanceof Error ? {
                    name: error.name,
                    message: error.message,
                    stack: error.stack
                } : error
            });
        }
    }

    public dispose(): void {
        this.log('DiagnosticExtension disposing...');
        this.outputChannel.dispose();
    }
}
