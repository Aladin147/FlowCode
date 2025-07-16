import * as vscode from 'vscode';
import { logger } from '../utils/logger';

export interface ChatTreeItem {
    id: string;
    label: string;
    description?: string;
    tooltip?: string;
    iconPath?: vscode.ThemeIcon;
    command?: vscode.Command;
    contextValue?: string;
    collapsibleState?: vscode.TreeItemCollapsibleState;
    children?: ChatTreeItem[];
}

export class ChatTreeProvider implements vscode.TreeDataProvider<ChatTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<ChatTreeItem | undefined | null | void> = new vscode.EventEmitter<ChatTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<ChatTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;
    
    private contextLogger = logger.createContextLogger('ChatTreeProvider');
    private chatHistory: ChatTreeItem[] = [];
    private quickActions: ChatTreeItem[] = [];

    constructor() {
        this.initializeQuickActions();
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: ChatTreeItem): vscode.TreeItem {
        const treeItem = new vscode.TreeItem(element.label, element.collapsibleState);
        treeItem.id = element.id;
        treeItem.description = element.description;
        treeItem.tooltip = element.tooltip;
        treeItem.iconPath = element.iconPath;
        treeItem.command = element.command;
        treeItem.contextValue = element.contextValue;
        return treeItem;
    }

    getChildren(element?: ChatTreeItem): Thenable<ChatTreeItem[]> {
        if (!element) {
            // Root level items
            return Promise.resolve([
                {
                    id: 'quick-actions',
                    label: 'Quick Actions',
                    iconPath: new vscode.ThemeIcon('zap'),
                    collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
                    children: this.quickActions
                },
                {
                    id: 'chat-history',
                    label: 'Recent Conversations',
                    iconPath: new vscode.ThemeIcon('history'),
                    collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
                    children: this.chatHistory
                },
                {
                    id: 'new-chat',
                    label: 'Start New Chat',
                    iconPath: new vscode.ThemeIcon('comment-discussion'),
                    command: {
                        command: 'flowcode.showChat',
                        title: 'Start New Chat'
                    },
                    contextValue: 'newChat'
                }
            ]);
        } else {
            // Return children of the element
            return Promise.resolve(element.children || []);
        }
    }

    private initializeQuickActions(): void {
        this.quickActions = [
            {
                id: 'generate-code',
                label: 'Generate Code',
                description: 'AI code generation',
                iconPath: new vscode.ThemeIcon('code'),
                command: {
                    command: 'flowcode.generateCode',
                    title: 'Generate Code'
                },
                contextValue: 'quickAction'
            },
            {
                id: 'analyze-code',
                label: 'Analyze Code',
                description: 'Code analysis & suggestions',
                iconPath: new vscode.ThemeIcon('search'),
                command: {
                    command: 'flowcode.analyzeCode',
                    title: 'Analyze Code'
                },
                contextValue: 'quickAction'
            },
            {
                id: 'elevate-architect',
                label: 'Elevate to Architect',
                description: 'AI refactoring',
                iconPath: new vscode.ThemeIcon('rocket'),
                command: {
                    command: 'flowcode.elevateToArchitect',
                    title: 'Elevate to Architect'
                },
                contextValue: 'quickAction'
            },
            {
                id: 'security-audit',
                label: 'Security Audit',
                description: 'Security analysis',
                iconPath: new vscode.ThemeIcon('shield'),
                command: {
                    command: 'flowcode.runSecurityAudit',
                    title: 'Run Security Audit'
                },
                contextValue: 'quickAction'
            },
            {
                id: 'create-hotfix',
                label: 'Create Hotfix',
                description: 'Quick fixes & debt tracking',
                iconPath: new vscode.ThemeIcon('tools'),
                command: {
                    command: 'flowcode.createHotfix',
                    title: 'Create Hotfix'
                },
                contextValue: 'quickAction'
            }
        ];
    }

    public addChatSession(sessionId: string, title: string, timestamp: Date): void {
        const chatItem: ChatTreeItem = {
            id: `chat-${sessionId}`,
            label: title,
            description: timestamp.toLocaleDateString(),
            tooltip: `Chat session from ${timestamp.toLocaleString()}`,
            iconPath: new vscode.ThemeIcon('comment'),
            command: {
                command: 'flowcode.openChatSession',
                title: 'Open Chat Session',
                arguments: [sessionId]
            },
            contextValue: 'chatSession'
        };

        this.chatHistory.unshift(chatItem);
        
        // Keep only last 10 sessions
        if (this.chatHistory.length > 10) {
            this.chatHistory = this.chatHistory.slice(0, 10);
        }

        this.refresh();
    }

    public clearChatHistory(): void {
        this.chatHistory = [];
        this.refresh();
    }
}
