import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Panel for workspace selection when no workspace is available
 */
export class WorkspaceSelectionPanel {
    public static currentPanel: WorkspaceSelectionPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];

    public static createOrShow(extensionUri: vscode.Uri): WorkspaceSelectionPanel {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        // If we already have a panel, show it
        if (WorkspaceSelectionPanel.currentPanel) {
            WorkspaceSelectionPanel.currentPanel._panel.reveal(column);
            return WorkspaceSelectionPanel.currentPanel;
        }

        // Otherwise, create a new panel
        const panel = vscode.window.createWebviewPanel(
            'flowcodeWorkspaceSelection',
            'FlowCode - Select Workspace',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(extensionUri, 'media'),
                    vscode.Uri.joinPath(extensionUri, 'out', 'media')
                ]
            }
        );

        WorkspaceSelectionPanel.currentPanel = new WorkspaceSelectionPanel(panel, extensionUri);
        return WorkspaceSelectionPanel.currentPanel;
    }

    public static revive(panel: vscode.WebviewPanel, extensionUri: vscode.Uri): WorkspaceSelectionPanel {
        WorkspaceSelectionPanel.currentPanel = new WorkspaceSelectionPanel(panel, extensionUri);
        return WorkspaceSelectionPanel.currentPanel;
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel;

        // Set the webview's initial html content
        this._update();

        // Listen for when the panel is disposed
        // This happens when the user closes the panel or when the panel is closed programmatically
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Handle messages from the webview
        this._panel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'selectFolder':
                        this._selectFolder();
                        return;
                    case 'openFolder':
                        this._openFolder(message.path);
                        return;
                    case 'createWorkspace':
                        this._createWorkspace();
                        return;
                    case 'continueWithoutWorkspace':
                        this._continueWithoutWorkspace();
                        return;
                }
            },
            null,
            this._disposables
        );
    }

    public dispose(): void {
        WorkspaceSelectionPanel.currentPanel = undefined;

        // Clean up our resources
        this._panel.dispose();

        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }

    private async _selectFolder(): Promise<void> {
        const options: vscode.OpenDialogOptions = {
            canSelectMany: false,
            canSelectFiles: false,
            canSelectFolders: true,
            openLabel: 'Select Folder',
            title: 'Select a folder to open as workspace'
        };

        const folderUri = await vscode.window.showOpenDialog(options);
        if (folderUri && folderUri[0]) {
            await vscode.commands.executeCommand('vscode.openFolder', folderUri[0]);
        }
    }

    private async _openFolder(folderPath: string): Promise<void> {
        if (fs.existsSync(folderPath)) {
            const folderUri = vscode.Uri.file(folderPath);
            await vscode.commands.executeCommand('vscode.openFolder', folderUri);
        } else {
            vscode.window.showErrorMessage(`Folder does not exist: ${folderPath}`);
        }
    }

    private async _createWorkspace(): Promise<void> {
        const options: vscode.SaveDialogOptions = {
            defaultUri: vscode.Uri.file(path.join(require('os').homedir(), 'FlowCode-Workspace')),
            filters: {
                'VS Code Workspace': ['code-workspace']
            },
            saveLabel: 'Create Workspace'
        };

        const workspaceUri = await vscode.window.showSaveDialog(options);
        if (workspaceUri) {
            // Create a basic workspace file
            const workspaceContent = {
                folders: [],
                settings: {
                    "flowcode.enabled": true
                }
            };

            await vscode.workspace.fs.writeFile(
                workspaceUri,
                Buffer.from(JSON.stringify(workspaceContent, null, 2))
            );

            await vscode.commands.executeCommand('vscode.openFolder', workspaceUri);
        }
    }

    private _continueWithoutWorkspace(): void {
        vscode.window.showInformationMessage(
            'FlowCode is running with limited functionality. Some features require a workspace to be open.',
            'Open Folder',
            'Create Workspace'
        ).then(selection => {
            if (selection === 'Open Folder') {
                this._selectFolder();
            } else if (selection === 'Create Workspace') {
                this._createWorkspace();
            }
        });

        this.dispose();
    }

    private _update(): void {
        const webview = this._panel.webview;
        this._panel.title = 'FlowCode - Select Workspace';
        this._panel.webview.html = this._getHtmlForWebview(webview);
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>FlowCode - Select Workspace</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 20px;
            line-height: 1.6;
        }
        .container {
            max-width: 600px;
            margin: 0 auto;
        }
        .header {
            text-align: center;
            margin-bottom: 30px;
        }
        .logo {
            font-size: 2em;
            margin-bottom: 10px;
        }
        .subtitle {
            color: var(--vscode-descriptionForeground);
            margin-bottom: 20px;
        }
        .option-card {
            background-color: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 15px;
            cursor: pointer;
            transition: background-color 0.2s;
        }
        .option-card:hover {
            background-color: var(--vscode-list-hoverBackground);
        }
        .option-title {
            font-weight: bold;
            margin-bottom: 8px;
            color: var(--vscode-textLink-foreground);
        }
        .option-description {
            color: var(--vscode-descriptionForeground);
            font-size: 0.9em;
        }
        .button {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 10px 20px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            margin: 5px;
        }
        .button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        .button.secondary {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        .button.secondary:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }
        .recent-folders {
            margin-top: 20px;
        }
        .recent-folder {
            padding: 10px;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            margin-bottom: 5px;
            cursor: pointer;
            font-family: monospace;
            font-size: 0.9em;
        }
        .recent-folder:hover {
            background-color: var(--vscode-list-hoverBackground);
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">🚀 FlowCode</div>
            <div class="subtitle">AI-Powered Development Companion</div>
            <p>To get the most out of FlowCode, please select a workspace or folder to work with.</p>
        </div>

        <div class="option-card" onclick="selectFolder()">
            <div class="option-title">📁 Open Existing Folder</div>
            <div class="option-description">
                Select an existing folder on your computer to use as your workspace. 
                FlowCode will analyze your code and provide intelligent assistance.
            </div>
        </div>

        <div class="option-card" onclick="createWorkspace()">
            <div class="option-title">✨ Create New Workspace</div>
            <div class="option-description">
                Create a new VS Code workspace file that you can customize with multiple folders 
                and project-specific settings.
            </div>
        </div>

        <div class="option-card" onclick="continueWithoutWorkspace()">
            <div class="option-title">⚡ Continue Without Workspace</div>
            <div class="option-description">
                Continue with limited functionality. Some FlowCode features require a workspace 
                to analyze your code effectively.
            </div>
        </div>

        <div class="recent-folders">
            <h3>Quick Actions</h3>
            <button class="button" onclick="selectFolder()">Browse for Folder</button>
            <button class="button secondary" onclick="continueWithoutWorkspace()">Skip for Now</button>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        function selectFolder() {
            vscode.postMessage({
                command: 'selectFolder'
            });
        }

        function openFolder(path) {
            vscode.postMessage({
                command: 'openFolder',
                path: path
            });
        }

        function createWorkspace() {
            vscode.postMessage({
                command: 'createWorkspace'
            });
        }

        function continueWithoutWorkspace() {
            vscode.postMessage({
                command: 'continueWithoutWorkspace'
            });
        }
    </script>
</body>
</html>`;
    }
}
