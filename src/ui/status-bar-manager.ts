import * as vscode from 'vscode';
import { PerformanceMonitor } from '../utils/performance-monitor';
import { CacheManager } from '../utils/performance-cache';

export class StatusBarManager {
    private statusBarItem: vscode.StatusBarItem;
    private performanceMonitor = PerformanceMonitor.getInstance();
    private lastUpdateTime = 0;
    private animationFrame = 0;

    constructor() {
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            100
        );
        this.statusBarItem.command = 'flowcode.showStatus';
        this.statusBarItem.show();
        this.showReady();
    }

    public showReady(): void {
        this.statusBarItem.text = "$(check) FlowCode: Ready";
        this.statusBarItem.tooltip = this.buildTooltip("FlowCode is ready to assist");
        this.statusBarItem.backgroundColor = undefined;
        this.statusBarItem.color = undefined;
    }

    public showRunning(operation?: string): void {
        const operationText = operation ? `: ${operation}` : '';
        this.statusBarItem.text = "$(sync~spin) FlowCode: Running...";
        this.statusBarItem.tooltip = this.buildTooltip(`FlowCode is running${operationText}`);
        this.statusBarItem.backgroundColor = undefined;
        this.statusBarItem.color = new vscode.ThemeColor('statusBarItem.prominentForeground');
    }

    public showError(message: string): void {
        this.statusBarItem.text = "$(error) FlowCode: Error";
        this.statusBarItem.tooltip = this.buildTooltip(message);
        this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
        this.statusBarItem.color = new vscode.ThemeColor('statusBarItem.errorForeground');
    }

    public showWarning(message: string): void {
        this.statusBarItem.text = "$(warning) FlowCode: Warning";
        this.statusBarItem.tooltip = this.buildTooltip(message);
        this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        this.statusBarItem.color = new vscode.ThemeColor('statusBarItem.warningForeground');
    }

    public showSuccess(message: string, duration?: number): void {
        const durationText = duration ? ` (${duration}ms)` : '';
        this.statusBarItem.text = `$(check) FlowCode: Success${durationText}`;
        this.statusBarItem.tooltip = this.buildTooltip(message);
        this.statusBarItem.backgroundColor = undefined;
        this.statusBarItem.color = new vscode.ThemeColor('statusBarItem.prominentForeground');
    }

    public showProgress(message: string, percentage?: number): void {
        const progressText = percentage !== undefined ? ` ${percentage}%` : '';
        this.statusBarItem.text = `$(loading~spin) FlowCode: ${message}${progressText}`;
        this.statusBarItem.tooltip = this.buildTooltip(`FlowCode is ${message.toLowerCase()}`);
        this.statusBarItem.backgroundColor = undefined;
        this.statusBarItem.color = new vscode.ThemeColor('statusBarItem.prominentForeground');
    }

    public showStats(stats: { checks: number; duration: number; issues: number }): void {
        const { checks, duration, issues } = stats;
        const icon = issues > 0 ? "$(warning)" : "$(check)";
        this.statusBarItem.text = `${icon} FlowCode: ${checks} checks (${duration}ms)`;
        this.statusBarItem.tooltip = this.buildTooltip(
            `Completed ${checks} checks in ${duration}ms. ${issues} issues found.`
        );
        this.statusBarItem.backgroundColor = issues > 0
            ? new vscode.ThemeColor('statusBarItem.warningBackground')
            : undefined;
    }

    public showLoading(message: string = "Loading..."): void {
        this.statusBarItem.text = "$(sync~spin) FlowCode";
        this.statusBarItem.tooltip = this.buildTooltip(message);
        this.statusBarItem.backgroundColor = undefined;
    }

    private buildTooltip(message: string): string {
        const stats = this.performanceMonitor.getAllStats();
        const cacheStats = CacheManager.getAllStats();

        let tooltip = `${message}\n\n`;

        // Add performance info
        if (stats.length > 0) {
            tooltip += "Recent Performance:\n";
            stats.slice(0, 3).forEach(stat => {
                tooltip += `• ${stat.name}: ${stat.averageDuration.toFixed(1)}ms avg\n`;
            });
            tooltip += "\n";
        }

        // Add cache info
        const cacheNames = Object.keys(cacheStats);
        if (cacheNames.length > 0) {
            tooltip += "Cache Status:\n";
            cacheNames.forEach(name => {
                const cache = cacheStats[name];
                tooltip += `• ${name}: ${cache.totalEntries} entries, ${(cache.hitRate * 100).toFixed(1)}% hit rate\n`;
            });
            tooltip += "\n";
        }

        tooltip += "Click for detailed status";
        return tooltip;
    }

    public dispose(): void {
        this.statusBarItem.dispose();
    }
}