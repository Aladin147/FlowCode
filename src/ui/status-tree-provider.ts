import * as vscode from 'vscode';
import { logger } from '../utils/logger';
import { ConfigurationManager } from '../utils/configuration-manager';

export interface StatusTreeItem {
    id: string;
    label: string;
    description?: string;
    tooltip?: string;
    iconPath?: vscode.ThemeIcon;
    command?: vscode.Command;
    contextValue?: string;
    collapsibleState?: vscode.TreeItemCollapsibleState;
    children?: StatusTreeItem[];
}

export class StatusTreeProvider implements vscode.TreeDataProvider<StatusTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<StatusTreeItem | undefined | null | void> = new vscode.EventEmitter<StatusTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<StatusTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;
    
    private contextLogger = logger.createContextLogger('StatusTreeProvider');
    private configManager: ConfigurationManager;
    private extensionStatus: 'active' | 'inactive' | 'error' = 'inactive';
    private apiStatus: 'configured' | 'not-configured' | 'error' = 'not-configured';
    private dependencyStatus: 'ok' | 'missing' | 'checking' = 'checking';

    constructor(configManager: ConfigurationManager) {
        this.configManager = configManager;
        this.updateStatus();
    }

    refresh(): void {
        this.updateStatus();
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: StatusTreeItem): vscode.TreeItem {
        const treeItem = new vscode.TreeItem(element.label, element.collapsibleState);
        treeItem.id = element.id;
        treeItem.description = element.description;
        treeItem.tooltip = element.tooltip;
        treeItem.iconPath = element.iconPath;
        treeItem.command = element.command;
        treeItem.contextValue = element.contextValue;
        return treeItem;
    }

    getChildren(element?: StatusTreeItem): Thenable<StatusTreeItem[]> {
        if (!element) {
            // Root level items
            return Promise.resolve([
                this.getExtensionStatusItem(),
                this.getApiStatusItem(),
                this.getDependencyStatusItem(),
                this.getActionsItem()
            ]);
        } else {
            // Return children of the element
            return Promise.resolve(element.children || []);
        }
    }

    private getExtensionStatusItem(): StatusTreeItem {
        const statusIcon = this.extensionStatus === 'active' ? 'check' : 
                          this.extensionStatus === 'error' ? 'error' : 'circle-outline';
        const statusColor = this.extensionStatus === 'active' ? 'testing.iconPassed' : 
                           this.extensionStatus === 'error' ? 'testing.iconFailed' : 'testing.iconQueued';

        return {
            id: 'extension-status',
            label: 'Extension Status',
            description: this.extensionStatus.charAt(0).toUpperCase() + this.extensionStatus.slice(1),
            tooltip: `FlowCode extension is ${this.extensionStatus}`,
            iconPath: new vscode.ThemeIcon(statusIcon, new vscode.ThemeColor(statusColor)),
            contextValue: 'extensionStatus'
        };
    }

    private getApiStatusItem(): StatusTreeItem {
        const statusIcon = this.apiStatus === 'configured' ? 'key' : 
                          this.apiStatus === 'error' ? 'error' : 'key';
        const statusColor = this.apiStatus === 'configured' ? 'testing.iconPassed' : 'testing.iconQueued';

        return {
            id: 'api-status',
            label: 'API Configuration',
            description: this.apiStatus === 'configured' ? 'Ready' : 'Not configured',
            tooltip: this.apiStatus === 'configured' ? 'API key is configured and ready' : 'Click to configure API key',
            iconPath: new vscode.ThemeIcon(statusIcon, new vscode.ThemeColor(statusColor)),
            command: this.apiStatus !== 'configured' ? {
                command: 'flowcode.configureApiKey',
                title: 'Configure API Key'
            } : undefined,
            contextValue: 'apiStatus'
        };
    }

    private getDependencyStatusItem(): StatusTreeItem {
        const statusIcon = this.dependencyStatus === 'ok' ? 'package' : 
                          this.dependencyStatus === 'missing' ? 'warning' : 'sync';
        const statusColor = this.dependencyStatus === 'ok' ? 'testing.iconPassed' : 
                           this.dependencyStatus === 'missing' ? 'testing.iconFailed' : 'testing.iconQueued';

        return {
            id: 'dependency-status',
            label: 'Dependencies',
            description: this.dependencyStatus === 'ok' ? 'All good' : 
                        this.dependencyStatus === 'missing' ? 'Issues found' : 'Checking...',
            tooltip: 'Click to check dependency status',
            iconPath: new vscode.ThemeIcon(statusIcon, new vscode.ThemeColor(statusColor)),
            command: {
                command: 'flowcode.checkDependencies',
                title: 'Check Dependencies'
            },
            contextValue: 'dependencyStatus'
        };
    }

    private getActionsItem(): StatusTreeItem {
        return {
            id: 'actions',
            label: 'Actions',
            iconPath: new vscode.ThemeIcon('gear'),
            collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
            children: [
                {
                    id: 'configure-api',
                    label: 'Configure API Key',
                    iconPath: new vscode.ThemeIcon('key'),
                    command: {
                        command: 'flowcode.configureApiKey',
                        title: 'Configure API Key'
                    },
                    contextValue: 'action'
                },
                {
                    id: 'check-dependencies',
                    label: 'Check Dependencies',
                    iconPath: new vscode.ThemeIcon('package'),
                    command: {
                        command: 'flowcode.checkDependencies',
                        title: 'Check Dependencies'
                    },
                    contextValue: 'action'
                },
                {
                    id: 'show-dashboard',
                    label: 'Show Dashboard',
                    iconPath: new vscode.ThemeIcon('dashboard'),
                    command: {
                        command: 'flowcode.showMonitoringDashboard',
                        title: 'Show Monitoring Dashboard'
                    },
                    contextValue: 'action'
                },
                {
                    id: 'show-help',
                    label: 'Show Help',
                    iconPath: new vscode.ThemeIcon('question'),
                    command: {
                        command: 'flowcode.showHelp',
                        title: 'Show Help'
                    },
                    contextValue: 'action'
                },
                {
                    id: 'show-settings',
                    label: 'Show Settings',
                    iconPath: new vscode.ThemeIcon('settings-gear'),
                    command: {
                        command: 'flowcode.showSettings',
                        title: 'Show Settings'
                    },
                    contextValue: 'action'
                }
            ]
        };
    }

    private async updateStatus(): Promise<void> {
        try {
            // Check API status
            const hasApiKey = await this.configManager.hasValidApiKey();
            this.apiStatus = hasApiKey ? 'configured' : 'not-configured';

            // Extension is active if we can create this provider
            this.extensionStatus = 'active';

            // For now, assume dependencies are OK (this could be enhanced)
            this.dependencyStatus = 'ok';

        } catch (error) {
            this.contextLogger.error('Failed to update status', error as Error);
            this.extensionStatus = 'error';
            this.apiStatus = 'error';
            this.dependencyStatus = 'missing';
        }
    }

    public updateExtensionStatus(status: 'active' | 'inactive' | 'error'): void {
        this.extensionStatus = status;
        this.refresh();
    }

    public updateApiStatus(status: 'configured' | 'not-configured' | 'error'): void {
        this.apiStatus = status;
        this.refresh();
    }

    public updateDependencyStatus(status: 'ok' | 'missing' | 'checking'): void {
        this.dependencyStatus = status;
        this.refresh();
    }
}
