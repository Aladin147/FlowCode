import * as vscode from 'vscode';

export class StatusBarManager {
    private statusBarItem: vscode.StatusBarItem;

    constructor() {
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            100
        );
        this.statusBarItem.command = 'flowcode.showStatus';
        this.statusBarItem.show();
    }

    public showReady(): void {
        this.statusBarItem.text = "$(check) FlowCode";
        this.statusBarItem.tooltip = "FlowCode is ready";
        this.statusBarItem.backgroundColor = undefined;
    }

    public showError(message: string): void {
        this.statusBarItem.text = "$(error) FlowCode";
        this.statusBarItem.tooltip = message;
        this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    }

    public showWarning(message: string): void {
        this.statusBarItem.text = "$(warning) FlowCode";
        this.statusBarItem.tooltip = message;
        this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    }

    public showLoading(message: string = "Loading..."): void {
        this.statusBarItem.text = "$(sync~spin) FlowCode";
        this.statusBarItem.tooltip = message;
        this.statusBarItem.backgroundColor = undefined;
    }

    public dispose(): void {
        this.statusBarItem.dispose();
    }
}