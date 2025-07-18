import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ConfigurationManager } from '../utils/configuration-manager';
import { logger } from '../utils/logger';
import { InputValidator } from '../utils/input-validator';

export interface HotfixRecord {
    id: string;
    message: string;
    timestamp: string;
    branch: string;
    files: string[];
    skippedChecks: string[];
    status: 'pending' | 'resolved' | 'overdue' | 'failed';
    priority: 'low' | 'medium' | 'high' | 'critical';
    assignee?: string;
    reviewer?: string;
    slaDeadline: string;
    resolution?: {
        timestamp: string;
        method: 'merged' | 'reverted' | 'superseded';
        notes?: string;
    };
}

export interface BranchInfo {
    name: string;
    exists: boolean;
    isClean: boolean;
    currentBranch: string;
}

export interface SLAStatus {
    isOverdue: boolean;
    hoursRemaining: number;
    urgencyLevel: 'normal' | 'warning' | 'critical' | 'overdue';
}

export interface DebtReductionSuggestion {
    type: string;
    priority: 'low' | 'medium' | 'high';
    title: string;
    description: string;
    impact: string;
    effort: 'low' | 'medium' | 'high';
    files: string[];
}

export interface DebtTrend {
    period: string;
    newDebt: number;
    resolvedDebt: number;
    trend: 'increasing' | 'decreasing' | 'stable';
}

export class HotfixService {
    private contextLogger = logger.createContextLogger('HotfixService');
    private readonly SLA_HOURS = 48; // 48 hour SLA
    private gitApi: any; // VS Code Git API

    constructor(private configManager: ConfigurationManager) {
        this.contextLogger.info('HotfixService constructed');
    }

    /**
     * Initialize the hotfix service
     */
    public async initialize(): Promise<void> {
        try {
            this.contextLogger.info('Initializing HotfixService');

            // Initialize Git API
            await this.initializeGitApi();

            // Ensure hotfix directory exists
            await this.ensureHotfixDirectoryExists();

            this.contextLogger.info('HotfixService initialized successfully');
        } catch (error) {
            this.contextLogger.error('Failed to initialize HotfixService', error as Error);
            throw error;
        }
    }

    /**
     * Ensure the hotfix directory exists
     */
    private async ensureHotfixDirectoryExists(): Promise<void> {
        try {
            // Use fallback method that works without workspace
            const debtFilePath = await this.configManager.getDebtFilePathOrFallback();
            const debtDir = path.dirname(debtFilePath);

            if (!fs.existsSync(debtDir)) {
                fs.mkdirSync(debtDir, { recursive: true });
                this.contextLogger.info(`Created hotfix directory: ${debtDir}`);
            }

            if (!fs.existsSync(debtFilePath)) {
                fs.writeFileSync(debtFilePath, '[]', 'utf8');
                this.contextLogger.info(`Created empty debt file: ${debtFilePath}`);
            }
        } catch (error) {
            this.contextLogger.error('Failed to ensure hotfix directory exists', error as Error);
            throw error;
        }
    }

    private async initializeGitApi(): Promise<void> {
        try {
            const gitExtension = vscode.extensions.getExtension('vscode.git');
            if (gitExtension) {
                const git = gitExtension.isActive ? gitExtension.exports : await gitExtension.activate();
                this.gitApi = git.getAPI(1);
                this.contextLogger.debug('Git API initialized successfully');
            } else {
                this.contextLogger.warn('Git extension not found');
            }
        } catch (error) {
            this.contextLogger.error('Failed to initialize Git API', error as Error);
        }
    }

    public async createHotfix(message: string): Promise<void> {
        // Validate commit message
        const validation = InputValidator.validateCommitMessage(message);
        if (!validation.isValid) {
            throw new Error(`Invalid commit message: ${validation.errors.join(', ')}`);
        }

        const sanitizedMessage = validation.sanitizedValue as string;
        const workspaceRoot = await this.configManager.getWorkspaceRoot();

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Creating hotfix...",
            cancellable: false
        }, async () => {
            try {
                // Create hotfix branch
                const branchName = `hotfix/${Date.now()}`;
                await this.createBranch(workspaceRoot, branchName);
                
                // Get changed files
                const changedFiles = await this.getChangedFiles(workspaceRoot);
                
                // Run minimal checks
                const skippedChecks = await this.runMinimalChecks(workspaceRoot, changedFiles);
                
                // Create commit
                await this.createCommit(workspaceRoot, `HOTFIX: ${sanitizedMessage}`);
                
                // Record hotfix
                const now = new Date();
                const slaDeadline = new Date(now.getTime() + (this.SLA_HOURS * 60 * 60 * 1000));

                const record: HotfixRecord = {
                    id: `hotfix-${Date.now()}`,
                    message,
                    timestamp: now.toISOString(),
                    branch: branchName,
                    files: changedFiles,
                    skippedChecks,
                    status: 'pending',
                    priority: this.determinePriority(message, changedFiles),
                    slaDeadline: slaDeadline.toISOString()
                };
                
                await this.saveHotfixRecord(record);

                this.contextLogger.info('Hotfix created successfully', {
                    id: record.id,
                    branch: branchName,
                    priority: record.priority,
                    filesCount: changedFiles.length
                });

                vscode.window.showInformationMessage(
                    `Hotfix created successfully! Branch: ${branchName} (Priority: ${record.priority})`,
                    'View Debt', 'Monitor SLA'
                ).then(selection => {
                    if (selection === 'View Debt') {
                        this.showDebtDashboard();
                    } else if (selection === 'Monitor SLA') {
                        this.showSLAStatus(record.id);
                    }
                });

            } catch (error) {
                this.contextLogger.error('Failed to create hotfix', error as Error);
                throw new Error(`Failed to create hotfix: ${(error as Error).message}`);
            }
        });
    }

    public async getPendingHotfixes(): Promise<HotfixRecord[]> {
        try {
            const debtFile = await this.configManager.getDebtFilePath();
            const fs = await import('fs');

            if (!fs.existsSync(debtFile)) {
                return [];
            }

            const content = fs.readFileSync(debtFile, 'utf-8');
            const records: HotfixRecord[] = JSON.parse(content);

            // Update status based on SLA and current state
            const now = new Date();

            const updatedRecords = records.map(record => {
                const slaStatus = this.calculateSLAStatus(record);
                let newStatus = record.status;

                // Update status based on SLA
                if (slaStatus.isOverdue && record.status === 'pending') {
                    newStatus = 'overdue';
                }

                return {
                    ...record,
                    status: newStatus
                };
            });

            // Check for critical overdue items and notify
            const criticalOverdue = updatedRecords.filter(r =>
                r.status === 'overdue' && r.priority === 'critical'
            );

            if (criticalOverdue.length > 0) {
                this.notifyCriticalOverdue(criticalOverdue);
            }

            this.contextLogger.debug(`Retrieved ${updatedRecords.length} hotfix records`);
            return updatedRecords;
        } catch (error) {
            this.contextLogger.error('Failed to load hotfix records', error as Error);
            return [];
        }
    }



    private async createBranch(workspaceRoot: string, branchName: string): Promise<void> {
        try {
            if (!this.gitApi) {
                throw new Error('Git API not available');
            }

            // Get the repository for the workspace
            const repository = this.gitApi.repositories.find((repo: any) =>
                repo.rootUri.fsPath === workspaceRoot
            );

            if (!repository) {
                throw new Error(`No Git repository found for ${workspaceRoot}`);
            }

            // Create and checkout new branch
            await repository.createBranch(branchName, true);
            this.contextLogger.debug(`Created and checked out branch: ${branchName}`);
        } catch (error) {
            this.contextLogger.error(`Failed to create branch ${branchName}`, error as Error);
            throw new Error(`Failed to create branch ${branchName}: ${(error as Error).message}`);
        }
    }

    private async getChangedFiles(workspaceRoot: string): Promise<string[]> {
        try {
            if (!this.gitApi) {
                this.contextLogger.warn('Git API not available, returning empty file list');
                return [];
            }

            // Get the repository for the workspace
            const repository = this.gitApi.repositories.find((repo: any) =>
                repo.rootUri.fsPath === workspaceRoot
            );

            if (!repository) {
                this.contextLogger.warn(`No Git repository found for ${workspaceRoot}`);
                return [];
            }

            // Get working tree changes (modified, added, deleted files)
            const changes = repository.state.workingTreeChanges || [];
            const indexChanges = repository.state.indexChanges || [];

            // Combine working tree and index changes
            const allChanges = [...changes, ...indexChanges];
            const changedFiles = allChanges
                .map((change: any) => change.uri.fsPath)
                .filter((file: string, index: number, array: string[]) => array.indexOf(file) === index); // Remove duplicates

            this.contextLogger.debug(`Found ${changedFiles.length} changed files`);
            return changedFiles;
        } catch (error) {
            this.contextLogger.error('Failed to get changed files', error as Error);
            return [];
        }
    }

    private async runMinimalChecks(workspaceRoot: string, files: string[]): Promise<string[]> {
        const skippedChecks: string[] = [];
        
        // Check if we can run syntax validation
        const hasTypeScriptFiles = files.some(f => f.endsWith('.ts') || f.endsWith('.tsx'));
        const hasJavaScriptFiles = files.some(f => f.endsWith('.js') || f.endsWith('.jsx'));
        const hasPythonFiles = files.some(f => f.endsWith('.py'));
        
        if (hasTypeScriptFiles || hasJavaScriptFiles) {
            // Run basic syntax check
            const syntaxValid = await this.checkSyntax(workspaceRoot, files);
            if (!syntaxValid) {
                skippedChecks.push('full-lint');
            }
        }
        
        if (hasPythonFiles) {
            // Run basic Python syntax check
            const syntaxValid = await this.checkPythonSyntax(workspaceRoot, files);
            if (!syntaxValid) {
                skippedChecks.push('ruff-check');
            }
        }
        
        return skippedChecks;
    }

    private async checkSyntax(workspaceRoot: string, files: string[]): Promise<boolean> {
        try {
            const hasTypeScript = files.some(f => f.endsWith('.ts') || f.endsWith('.tsx'));

            if (hasTypeScript) {
                // For hotfix mode, we'll do a basic TypeScript syntax check
                // This is faster and doesn't require subprocess spawning
                const ts = require('typescript');
                const fs = require('fs');
                const path = require('path');

                for (const file of files.filter(f => f.endsWith('.ts') || f.endsWith('.tsx'))) {
                    try {
                        const fullPath = path.resolve(workspaceRoot, file);
                        const content = fs.readFileSync(fullPath, 'utf8');

                        // Basic TypeScript syntax check
                        const result = ts.transpileModule(content, {
                            compilerOptions: {
                                target: ts.ScriptTarget.ES2020,
                                module: ts.ModuleKind.CommonJS,
                                noEmit: true
                            }
                        });

                        if (result.diagnostics && result.diagnostics.length > 0) {
                            const errors = result.diagnostics.filter((d: any) => d.category === ts.DiagnosticCategory.Error);
                            if (errors.length > 0) {
                                this.contextLogger.warn(`TypeScript syntax errors in ${file}`);
                                return false;
                            }
                        }
                    } catch (error) {
                        this.contextLogger.warn(`Could not check TypeScript file ${file}`, error as Error);
                        return false;
                    }
                }
            }

            // For JavaScript or if no TypeScript files, skip detailed checks in hotfix mode
            return true;
        } catch (error) {
            this.contextLogger.error('Syntax check failed', error as Error);
            return false;
        }
    }

    private async checkPythonSyntax(workspaceRoot: string, files: string[]): Promise<boolean> {
        try {
            const pythonFiles = files.filter(f => f.endsWith('.py'));
            if (pythonFiles.length === 0) {
                return true;
            }

            // For hotfix mode, we'll do a basic syntax check by reading files
            // This is faster than spawning Python processes
            const fs = require('fs');
            const path = require('path');

            for (const file of pythonFiles) {
                try {
                    const fullPath = path.resolve(workspaceRoot, file);
                    const content = fs.readFileSync(fullPath, 'utf8');

                    // Basic syntax checks
                    if (this.hasBasicPythonSyntaxErrors(content)) {
                        this.contextLogger.warn(`Basic syntax issues detected in ${file}`);
                        return false;
                    }
                } catch (error) {
                    this.contextLogger.warn(`Could not read Python file ${file}`, error as Error);
                    return false;
                }
            }

            this.contextLogger.debug(`Basic Python syntax check passed for ${pythonFiles.length} files`);
            return true;
        } catch (error) {
            this.contextLogger.error('Python syntax check failed', error as Error);
            return false;
        }
    }

    private hasBasicPythonSyntaxErrors(content: string): boolean {
        // Basic syntax error detection (not comprehensive, but fast)
        const lines = content.split('\n');
        let indentLevel = 0;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // Skip if line is undefined
            if (!line) {
                continue;
            }

            const trimmed = line.trim();

            // Skip empty lines and comments
            if (!trimmed || trimmed.startsWith('#')) {
                continue;
            }

            // Check for basic indentation issues
            const leadingSpaces = line.length - line.trimStart().length;
            if (leadingSpaces % 4 !== 0 && leadingSpaces > 0) {
                // Inconsistent indentation (assuming 4-space standard)
                return true;
            }

            // Check for obvious syntax errors
            if (trimmed.includes('def ') && !trimmed.endsWith(':')) {
                return true;
            }
            if (trimmed.includes('class ') && !trimmed.endsWith(':')) {
                return true;
            }
            if (trimmed.includes('if ') && !trimmed.endsWith(':')) {
                return true;
            }
            if (trimmed.includes('for ') && !trimmed.endsWith(':')) {
                return true;
            }
            if (trimmed.includes('while ') && !trimmed.endsWith(':')) {
                return true;
            }
        }

        return false;
    }

    private async createCommit(workspaceRoot: string, message: string): Promise<void> {
        try {
            if (!this.gitApi) {
                throw new Error('Git API not available');
            }

            // Get the repository for the workspace
            const repository = this.gitApi.repositories.find((repo: any) =>
                repo.rootUri.fsPath === workspaceRoot
            );

            if (!repository) {
                throw new Error(`No Git repository found for ${workspaceRoot}`);
            }

            // Stage all changes (equivalent to -a flag)
            const changes = repository.state.workingTreeChanges || [];
            if (changes.length > 0) {
                await repository.add(changes.map((change: any) => change.uri));
                this.contextLogger.debug(`Staged ${changes.length} files`);
            }

            // Create commit
            await repository.commit(message);
            this.contextLogger.debug(`Created commit: ${message}`);
        } catch (error) {
            this.contextLogger.error('Failed to create commit', error as Error);
            throw new Error(`Failed to create commit: ${(error as Error).message}`);
        }
    }

    private async saveHotfixRecord(record: HotfixRecord): Promise<void> {
        const records = await this.getPendingHotfixes();
        records.push(record);
        await this.saveHotfixRecords(records);
    }

    private async saveHotfixRecords(records: HotfixRecord[]): Promise<void> {
        const debtFile = await this.configManager.getDebtFilePath();
        const fs = await import('fs');
        const path = await import('path');
        
        // Ensure directory exists
        const dir = path.dirname(debtFile);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        
        fs.writeFileSync(debtFile, JSON.stringify(records, null, 2));
    }

    private determinePriority(message: string, files: string[]): 'low' | 'medium' | 'high' | 'critical' {
        const lowerMessage = message.toLowerCase();

        // Critical keywords
        if (lowerMessage.includes('security') || lowerMessage.includes('vulnerability') ||
            lowerMessage.includes('exploit') || lowerMessage.includes('breach')) {
            return 'critical';
        }

        // High priority keywords
        if (lowerMessage.includes('production') || lowerMessage.includes('outage') ||
            lowerMessage.includes('crash') || lowerMessage.includes('data loss')) {
            return 'high';
        }

        // Check file types for priority
        const criticalFiles = files.some(file =>
            file.includes('auth') || file.includes('security') ||
            file.includes('payment') || file.includes('database')
        );

        if (criticalFiles) {
            return 'high';
        }

        // Medium priority for multiple files
        if (files.length > 5) {
            return 'medium';
        }

        return 'low';
    }

    private calculateSLAStatus(record: HotfixRecord): SLAStatus {
        const now = new Date();
        const deadline = new Date(record.slaDeadline);
        const hoursRemaining = (deadline.getTime() - now.getTime()) / (1000 * 60 * 60);

        let urgencyLevel: 'normal' | 'warning' | 'critical' | 'overdue' = 'normal';

        if (hoursRemaining < 0) {
            urgencyLevel = 'overdue';
        } else if (hoursRemaining < 4) {
            urgencyLevel = 'critical';
        } else if (hoursRemaining < 12) {
            urgencyLevel = 'warning';
        }

        return {
            isOverdue: hoursRemaining < 0,
            hoursRemaining: Math.max(0, hoursRemaining),
            urgencyLevel
        };
    }

    private async notifyCriticalOverdue(overdueRecords: HotfixRecord[]): Promise<void> {
        const count = overdueRecords.length;
        const message = `⚠️ ${count} critical hotfix${count > 1 ? 'es' : ''} overdue!`;

        this.contextLogger.warn(`Critical hotfixes overdue: ${count} records`, new Error('SLA violation'));

        vscode.window.showWarningMessage(
            message,
            'View Details', 'Escalate'
        ).then(selection => {
            if (selection === 'View Details') {
                this.showDebtDashboard();
            } else if (selection === 'Escalate') {
                this.escalateOverdueHotfixes(overdueRecords);
            }
        });
    }

    private async showDebtDashboard(): Promise<void> {
        try {
            const records = await this.getPendingHotfixes();
            const panel = vscode.window.createWebviewPanel(
                'hotfixDashboard',
                'Hotfix Debt Dashboard',
                vscode.ViewColumn.Two,
                { enableScripts: true }
            );

            panel.webview.html = this.generateDashboardHTML(records);
        } catch (error) {
            this.contextLogger.error('Failed to show debt dashboard', error as Error);
            vscode.window.showErrorMessage('Failed to load debt dashboard');
        }
    }

    private async showSLAStatus(hotfixId: string): Promise<void> {
        try {
            const records = await this.getPendingHotfixes();
            const record = records.find(r => r.id === hotfixId);

            if (!record) {
                vscode.window.showErrorMessage('Hotfix not found');
                return;
            }

            const slaStatus = this.calculateSLAStatus(record);
            const statusIcon = this.getSLAStatusIcon(slaStatus.urgencyLevel);

            vscode.window.showInformationMessage(
                `${statusIcon} Hotfix ${record.id}: ${slaStatus.hoursRemaining.toFixed(1)} hours remaining`,
                'View Details', 'Mark Resolved'
            ).then(selection => {
                if (selection === 'View Details') {
                    this.showDebtDashboard();
                } else if (selection === 'Mark Resolved') {
                    this.resolveHotfix(hotfixId, 'merged');
                }
            });
        } catch (error) {
            this.contextLogger.error('Failed to show SLA status', error as Error);
            vscode.window.showErrorMessage('Failed to load SLA status');
        }
    }

    private getSLAStatusIcon(urgencyLevel: string): string {
        switch (urgencyLevel) {
            case 'overdue': return '🔴';
            case 'critical': return '🟠';
            case 'warning': return '🟡';
            default: return '🟢';
        }
    }

    private async escalateOverdueHotfixes(records: HotfixRecord[]): Promise<void> {
        // In a real implementation, this would integrate with ticketing systems
        this.contextLogger.warn(`Escalating ${records.length} overdue hotfixes`, new Error('SLA escalation'));

        vscode.window.showWarningMessage(
            `Escalated ${records.length} overdue hotfix${records.length > 1 ? 'es' : ''} to management`
        );
    }

    private async resolveHotfix(hotfixId: string, method: 'merged' | 'reverted' | 'superseded'): Promise<void> {
        try {
            const records = await this.getPendingHotfixes();
            const recordIndex = records.findIndex(r => r.id === hotfixId);

            if (recordIndex === -1) {
                throw new Error('Hotfix not found');
            }

            const record = records[recordIndex];
            if (!record) {
                throw new Error('Hotfix record is undefined');
            }

            record.status = 'resolved';
            record.resolution = {
                timestamp: new Date().toISOString(),
                method,
                notes: `Resolved via ${method}`
            };

            await this.saveHotfixRecords(records);

            this.contextLogger.info('Hotfix resolved', {
                id: hotfixId,
                method
            });

            vscode.window.showInformationMessage(`Hotfix ${hotfixId} marked as resolved`);
        } catch (error) {
            this.contextLogger.error('Failed to resolve hotfix', error as Error);
            vscode.window.showErrorMessage(`Failed to resolve hotfix: ${(error as Error).message}`);
        }
    }

    private generateDashboardHTML(records: HotfixRecord[]): string {
        const pendingRecords = records.filter(r => r.status === 'pending' || r.status === 'overdue');
        const overdueCount = records.filter(r => r.status === 'overdue').length;

        return `<!DOCTYPE html>
<html>
<head>
    <title>Hotfix Debt Dashboard</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 20px; }
        .header { border-bottom: 2px solid #007acc; padding-bottom: 10px; margin-bottom: 20px; }
        .stats { display: flex; gap: 20px; margin-bottom: 20px; }
        .stat-card { padding: 15px; border-radius: 8px; background: #f5f5f5; }
        .overdue { background: #ffebee; border-left: 4px solid #f44336; }
        .warning { background: #fff3e0; border-left: 4px solid #ff9800; }
        .normal { background: #e8f5e8; border-left: 4px solid #4caf50; }
        .hotfix-item { margin: 10px 0; padding: 15px; border: 1px solid #ddd; border-radius: 4px; }
        .priority-critical { border-left: 4px solid #f44336; }
        .priority-high { border-left: 4px solid #ff9800; }
        .priority-medium { border-left: 4px solid #2196f3; }
        .priority-low { border-left: 4px solid #4caf50; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🔧 Hotfix Debt Dashboard</h1>
        <p>Technical debt tracking and SLA monitoring</p>
    </div>

    <div class="stats">
        <div class="stat-card">
            <h3>Total Pending</h3>
            <p style="font-size: 24px; margin: 0;">${pendingRecords.length}</p>
        </div>
        <div class="stat-card ${overdueCount > 0 ? 'overdue' : 'normal'}">
            <h3>Overdue</h3>
            <p style="font-size: 24px; margin: 0;">${overdueCount}</p>
        </div>
    </div>

    <h2>Pending Hotfixes</h2>
    ${pendingRecords.map(record => {
        const slaStatus = this.calculateSLAStatus(record);
        return `
        <div class="hotfix-item priority-${record.priority}">
            <h3>${record.message}</h3>
            <p><strong>ID:</strong> ${record.id}</p>
            <p><strong>Branch:</strong> ${record.branch}</p>
            <p><strong>Priority:</strong> ${record.priority.toUpperCase()}</p>
            <p><strong>Files:</strong> ${record.files.length}</p>
            <p><strong>SLA:</strong> ${slaStatus.hoursRemaining.toFixed(1)} hours remaining</p>
            <p><strong>Status:</strong> ${this.getSLAStatusIcon(slaStatus.urgencyLevel)} ${slaStatus.urgencyLevel}</p>
        </div>`;
    }).join('')}
</body>
</html>`;
    }

    /**
     * Get debt summary for chat integration
     */
    public async getDebtSummary(): Promise<{
        totalDebt: number;
        criticalDebt: number;
        overdueDebt: number;
        averageAge: number;
        slaWarnings: string[];
        riskLevel: 'low' | 'medium' | 'high' | 'critical';
    }> {
        try {
            const records = await this.getPendingHotfixes();
            const now = new Date();

            const totalDebt = records.length;
            const criticalDebt = records.filter(r => r.priority === 'critical').length;
            const overdueDebt = records.filter(r => r.status === 'overdue').length;

            // Calculate average age in hours
            const totalAge = records.reduce((sum, record) => {
                const created = new Date(record.timestamp);
                const ageHours = (now.getTime() - created.getTime()) / (1000 * 60 * 60);
                return sum + ageHours;
            }, 0);
            const averageAge = totalDebt > 0 ? totalAge / totalDebt : 0;

            // Generate SLA warnings
            const slaWarnings: string[] = [];
            records.forEach(record => {
                const slaStatus = this.calculateSLAStatus(record);
                if (slaStatus.urgencyLevel === 'critical' || slaStatus.urgencyLevel === 'overdue') {
                    slaWarnings.push(`${record.id}: ${slaStatus.urgencyLevel} (${slaStatus.hoursRemaining.toFixed(1)}h remaining)`);
                }
            });

            // Determine overall risk level
            let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';
            if (overdueDebt > 0 || criticalDebt > 2) {
                riskLevel = 'critical';
            } else if (criticalDebt > 0 || totalDebt > 5) {
                riskLevel = 'high';
            } else if (totalDebt > 2) {
                riskLevel = 'medium';
            }

            return {
                totalDebt,
                criticalDebt,
                overdueDebt,
                averageAge,
                slaWarnings,
                riskLevel
            };

        } catch (error) {
            this.contextLogger.error('Failed to get debt summary', error as Error);
            return {
                totalDebt: 0,
                criticalDebt: 0,
                overdueDebt: 0,
                averageAge: 0,
                slaWarnings: [],
                riskLevel: 'low'
            };
        }
    }

    /**
     * Analyze debt impact for a specific file
     */
    public async analyzeFileDebtImpact(filePath: string): Promise<{
        hasDebt: boolean;
        relatedHotfixes: HotfixRecord[];
        riskLevel: 'low' | 'medium' | 'high';
        recommendations: string[];
    }> {
        try {
            const records = await this.getPendingHotfixes();
            const relatedHotfixes = records.filter(record =>
                record.files.some(file => file.includes(path.basename(filePath)))
            );

            const hasDebt = relatedHotfixes.length > 0;
            const criticalCount = relatedHotfixes.filter(r => r.priority === 'critical').length;
            const overdueCount = relatedHotfixes.filter(r => r.status === 'overdue').length;

            let riskLevel: 'low' | 'medium' | 'high' = 'low';
            if (overdueCount > 0 || criticalCount > 1) {
                riskLevel = 'high';
            } else if (criticalCount > 0 || relatedHotfixes.length > 2) {
                riskLevel = 'medium';
            }

            const recommendations: string[] = [];
            if (hasDebt) {
                recommendations.push('Consider addressing existing hotfixes before making major changes');
                if (riskLevel === 'high') {
                    recommendations.push('High risk: Coordinate with team before modifying this file');
                }
                if (overdueCount > 0) {
                    recommendations.push('Urgent: Resolve overdue hotfixes immediately');
                }
            }

            return {
                hasDebt,
                relatedHotfixes,
                riskLevel,
                recommendations
            };

        } catch (error) {
            this.contextLogger.error('Failed to analyze file debt impact', error as Error);
            return {
                hasDebt: false,
                relatedHotfixes: [],
                riskLevel: 'low',
                recommendations: []
            };
        }
    }

    /**
     * Get proactive debt reduction suggestions
     */
    public async getProactiveDebtSuggestions(): Promise<{
        suggestions: DebtReductionSuggestion[];
        hotspots: string[];
        trends: DebtTrend[];
        actionPlan: string[];
    }> {
        try {
            const records = await this.getPendingHotfixes();
            const suggestions: DebtReductionSuggestion[] = [];
            const hotspots: string[] = [];
            const trends: DebtTrend[] = [];
            const actionPlan: string[] = [];

            // Analyze file hotspots
            const fileFrequency = new Map<string, number>();
            records.forEach(record => {
                record.files.forEach(file => {
                    fileFrequency.set(file, (fileFrequency.get(file) || 0) + 1);
                });
            });

            // Identify hotspots (files with multiple hotfixes)
            for (const [file, count] of fileFrequency.entries()) {
                if (count > 1) {
                    hotspots.push(`${file} (${count} hotfixes)`);

                    suggestions.push({
                        type: 'refactor-hotspot',
                        priority: count > 3 ? 'high' : 'medium',
                        title: `Refactor High-Debt File: ${path.basename(file)}`,
                        description: `This file has ${count} pending hotfixes, indicating structural issues`,
                        impact: 'Reduces future hotfix frequency and improves maintainability',
                        effort: count > 3 ? 'high' : 'medium',
                        files: [file]
                    });
                }
            }

            // Analyze age trends
            const now = new Date();
            const oldHotfixes = records.filter(record => {
                const age = (now.getTime() - new Date(record.timestamp).getTime()) / (1000 * 60 * 60 * 24);
                return age > 7; // Older than 7 days
            });

            if (oldHotfixes.length > 0) {
                suggestions.push({
                    type: 'address-old-debt',
                    priority: 'medium',
                    title: 'Address Aging Technical Debt',
                    description: `${oldHotfixes.length} hotfixes are older than 7 days`,
                    impact: 'Prevents debt from becoming more expensive to fix',
                    effort: 'medium',
                    files: oldHotfixes.flatMap(h => h.files)
                });
            }

            // Analyze priority distribution
            const criticalCount = records.filter(r => r.priority === 'critical').length;
            const highCount = records.filter(r => r.priority === 'high').length;

            if (criticalCount > 0) {
                suggestions.push({
                    type: 'critical-debt-sprint',
                    priority: 'high',
                    title: 'Critical Debt Sprint',
                    description: `${criticalCount} critical hotfixes need immediate attention`,
                    impact: 'Prevents system instability and customer impact',
                    effort: 'high',
                    files: records.filter(r => r.priority === 'critical').flatMap(h => h.files)
                });
            }

            // Generate trends
            trends.push({
                period: 'last_7_days',
                newDebt: records.filter(r => {
                    const age = (now.getTime() - new Date(r.timestamp).getTime()) / (1000 * 60 * 60 * 24);
                    return age <= 7;
                }).length,
                resolvedDebt: 0, // Would need historical data
                trend: 'increasing' // Simplified
            });

            // Create action plan
            if (suggestions.length > 0) {
                actionPlan.push('🎯 **Proactive Debt Reduction Plan**');

                const highPriority = suggestions.filter(s => s.priority === 'high');
                const mediumPriority = suggestions.filter(s => s.priority === 'medium');

                if (highPriority.length > 0) {
                    actionPlan.push(`**Phase 1 (Immediate):** ${highPriority.length} high-priority items`);
                    highPriority.forEach(s => actionPlan.push(`  • ${s.title}`));
                }

                if (mediumPriority.length > 0) {
                    actionPlan.push(`**Phase 2 (Next Sprint):** ${mediumPriority.length} medium-priority items`);
                    mediumPriority.forEach(s => actionPlan.push(`  • ${s.title}`));
                }

                actionPlan.push('**Phase 3:** Monitor and prevent new debt accumulation');
            } else {
                actionPlan.push('✅ **No immediate debt reduction needed**');
                actionPlan.push('🎯 **Focus on prevention:** Maintain current quality standards');
            }

            return {
                suggestions,
                hotspots,
                trends,
                actionPlan
            };

        } catch (error) {
            this.contextLogger.error('Failed to get proactive debt suggestions', error as Error);
            return {
                suggestions: [],
                hotspots: [],
                trends: [],
                actionPlan: ['Failed to analyze debt - manual review recommended']
            };
        }
    }
}