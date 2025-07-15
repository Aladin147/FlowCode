import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { SecurityValidatorService, SecurityAuditResult } from '../services/security-validator';
import { ConfigurationManager } from '../utils/configuration-manager';
import { logger } from '../utils/logger';
import { ToolManager } from '../utils/tool-manager';

/**
 * Security commands implementation
 */
export class SecurityCommands {
    private static readonly contextLogger = logger.createContextLogger('SecurityCommands');
    private securityValidator: SecurityValidatorService;
    private configManager: ConfigurationManager;
    private toolManager: ToolManager;

    constructor(configManager: ConfigurationManager, securityValidator?: SecurityValidatorService) {
        this.configManager = configManager;
        this.securityValidator = securityValidator || new SecurityValidatorService(configManager);
        this.toolManager = new ToolManager();
    }

    /**
     * Initialize security commands
     */
    public async initialize(): Promise<void> {
        try {
            SecurityCommands.contextLogger.info('Initializing security commands');
            // SecurityValidator should already be initialized by the main extension
            SecurityCommands.contextLogger.info('Security commands initialized successfully');
        } catch (error) {
            SecurityCommands.contextLogger.error('Failed to initialize security commands', error as Error);
            throw error;
        }
    }

    /**
     * Run security audit command
     */
    public async runSecurityAudit(): Promise<void> {
        try {
            const workspaceRoot = await this.getWorkspaceRoot();
            if (!workspaceRoot) {
                vscode.window.showErrorMessage('No workspace folder found. Please open a folder to run security audit.');
                return;
            }

            SecurityCommands.contextLogger.info('Running security audit');

            // Show progress notification
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "Running FlowCode Security Audit",
                cancellable: true
            }, async (progress, token) => {
                token.onCancellationRequested(() => {
                    SecurityCommands.contextLogger.info('Security audit cancelled by user');
                });

                progress.report({ message: "Initializing security scan...", increment: 0 });

                try {
                    // Check if required security tools are available
                    progress.report({ message: "Checking security tools...", increment: 10 });
                    const semgrepAvailable = await this.toolManager.isToolAvailable('semgrep');
                    
                    if (!semgrepAvailable) {
                        const installAction = await vscode.window.showWarningMessage(
                            'Semgrep is not installed. For comprehensive security scanning, it is recommended to install Semgrep.',
                            'Install Semgrep',
                            'Continue without Semgrep',
                            'Cancel'
                        );

                        if (installAction === 'Install Semgrep') {
                            await this.installSemgrep();
                        } else if (installAction === 'Cancel') {
                            return;
                        }
                    }

                    // Run core security checks
                    progress.report({ message: "Running core security checks...", increment: 20 });
                    
                    // Run comprehensive security audit
                    progress.report({ message: "Running comprehensive security audit...", increment: 40 });
                    const auditResult = await this.securityValidator.runSecurityAudit(workspaceRoot);
                    
                    // Generate report
                    progress.report({ message: "Generating security report...", increment: 80 });
                    await this.showSecurityReport(auditResult);
                    
                    progress.report({ message: "Security audit completed", increment: 100 });
                    
                    // Show summary notification
                    this.showAuditSummaryNotification(auditResult);
                    
                } catch (error) {
                    SecurityCommands.contextLogger.error('Security audit failed', error as Error);
                    vscode.window.showErrorMessage(`Security audit failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
                }
            });
        } catch (error) {
            SecurityCommands.contextLogger.error('Failed to run security audit', error as Error);
            vscode.window.showErrorMessage(`Failed to run security audit: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Install Semgrep security tool
     */
    private async installSemgrep(): Promise<boolean> {
        try {
            return await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "Installing Semgrep",
                cancellable: true
            }, async (progress, token) => {
                progress.report({ message: "Installing Semgrep via pip..." });
                
                // Use ToolManager to install Semgrep
                const success = await this.toolManager.installTool('Semgrep');
                
                if (success) {
                    vscode.window.showInformationMessage('Semgrep installed successfully');
                    return true;
                } else {
                    const openDocs = await vscode.window.showErrorMessage(
                        'Failed to install Semgrep automatically. Would you like to open the installation guide?',
                        'Open Installation Guide',
                        'Cancel'
                    );
                    
                    if (openDocs === 'Open Installation Guide') {
                        vscode.env.openExternal(vscode.Uri.parse('https://semgrep.dev/docs/getting-started/'));
                    }
                    
                    return false;
                }
            });
        } catch (error) {
            SecurityCommands.contextLogger.error('Failed to install Semgrep', error as Error);
            vscode.window.showErrorMessage(`Failed to install Semgrep: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return false;
        }
    }

    /**
     * Show security audit report
     */
    private async showSecurityReport(auditResult: SecurityAuditResult): Promise<void> {
        try {
            const reportContent = this.securityValidator.generateSecurityReport(auditResult);
            
            // Create a temporary file for the report
            const tempDir = path.join(os.tmpdir(), 'flowcode');
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }
            
            const reportPath = path.join(tempDir, `security-report-${Date.now()}.md`);
            fs.writeFileSync(reportPath, reportContent, 'utf8');
            
            // Open the report in VS Code
            const doc = await vscode.workspace.openTextDocument(reportPath);
            await vscode.window.showTextDocument(doc);
            
        } catch (error) {
            SecurityCommands.contextLogger.error('Failed to show security report', error as Error);
            vscode.window.showErrorMessage(`Failed to show security report: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Show audit summary notification
     */
    private showAuditSummaryNotification(auditResult: SecurityAuditResult): void {
        const { overallScore, criticalIssues, highIssues, mediumIssues, lowIssues, passed } = auditResult;
        
        if (passed) {
            vscode.window.showInformationMessage(`✅ Security audit passed with score ${overallScore}/100`);
        } else {
            const message = `⚠️ Security audit found issues: ${criticalIssues} critical, ${highIssues} high, ${mediumIssues} medium, ${lowIssues} low`;
            vscode.window.showWarningMessage(message, 'View Report');
        }
    }

    /**
     * Get workspace root path
     */
    private async getWorkspaceRoot(): Promise<string | undefined> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return undefined;
        }
        
        return workspaceFolders[0]?.uri.fsPath || process.cwd();
    }
}
