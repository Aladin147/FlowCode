import * as vscode from 'vscode';
import * as sinon from 'sinon';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Test utilities for FlowCode extension testing
 */
export class TestUtils {
    private static sandbox: sinon.SinonSandbox;

    /**
     * Initialize test environment
     */
    public static setup(): void {
        TestUtils.sandbox = sinon.createSandbox();
    }

    /**
     * Clean up test environment
     */
    public static teardown(): void {
        if (TestUtils.sandbox) {
            TestUtils.sandbox.restore();
        }
    }

    /**
     * Create a mock VS Code workspace
     */
    public static createMockWorkspace(workspacePath: string = '/test/workspace'): void {
        const mockWorkspaceFolder: vscode.WorkspaceFolder = {
            uri: vscode.Uri.file(workspacePath),
            name: 'test-workspace',
            index: 0
        };

        TestUtils.sandbox.stub(vscode.workspace, 'workspaceFolders').value([mockWorkspaceFolder]);
        TestUtils.sandbox.stub(vscode.workspace, 'getWorkspaceFolder').returns(mockWorkspaceFolder);
    }

    /**
     * Create a mock VS Code text editor
     */
    public static createMockTextEditor(
        content: string = '',
        languageId: string = 'typescript',
        filePath: string = '/test/file.ts'
    ): vscode.TextEditor {
        const mockDocument: Partial<vscode.TextDocument> = {
            uri: vscode.Uri.file(filePath),
            fileName: filePath,
            languageId,
            getText: TestUtils.sandbox.stub().returns(content),
            lineCount: content.split('\n').length,
            save: TestUtils.sandbox.stub().resolves(true),
            isDirty: false,
            isClosed: false,
            version: 1
        };

        const mockSelection: vscode.Selection = new vscode.Selection(0, 0, 0, 0);

        const mockEditor: Partial<vscode.TextEditor> = {
            document: mockDocument as vscode.TextDocument,
            selection: mockSelection,
            selections: [mockSelection],
            edit: TestUtils.sandbox.stub().resolves(true)
        };

        return mockEditor as vscode.TextEditor;
    }

    /**
     * Create a mock VS Code configuration
     */
    public static createMockConfiguration(configValues: { [key: string]: any } = {}): void {
        const mockConfig = {
            get: TestUtils.sandbox.stub().callsFake((key: string, defaultValue?: any) => {
                return configValues[key] !== undefined ? configValues[key] : defaultValue;
            }),
            update: TestUtils.sandbox.stub().resolves(),
            has: TestUtils.sandbox.stub().callsFake((key: string) => configValues.hasOwnProperty(key)),
            inspect: TestUtils.sandbox.stub()
        };

        TestUtils.sandbox.stub(vscode.workspace, 'getConfiguration').returns(mockConfig as any);
    }

    /**
     * Create a temporary test file
     */
    public static createTempFile(content: string, extension: string = '.ts'): string {
        const tempDir = path.join(__dirname, '../fixtures/temp');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        const fileName = `test_${Date.now()}${extension}`;
        const filePath = path.join(tempDir, fileName);
        fs.writeFileSync(filePath, content);
        return filePath;
    }

    /**
     * Clean up temporary test files
     */
    public static cleanupTempFiles(): void {
        const tempDir = path.join(__dirname, '../fixtures/temp');
        if (fs.existsSync(tempDir)) {
            const files = fs.readdirSync(tempDir);
            files.forEach(file => {
                fs.unlinkSync(path.join(tempDir, file));
            });
        }
    }

    /**
     * Mock VS Code window methods
     */
    public static mockVSCodeWindow(): void {
        TestUtils.sandbox.stub(vscode.window, 'showInformationMessage').resolves();
        TestUtils.sandbox.stub(vscode.window, 'showWarningMessage').resolves();
        TestUtils.sandbox.stub(vscode.window, 'showErrorMessage').resolves();
        TestUtils.sandbox.stub(vscode.window, 'showInputBox').resolves('test-input');
        TestUtils.sandbox.stub(vscode.window, 'showQuickPick').resolves({ label: 'test-option' } as any);
        TestUtils.sandbox.stub(vscode.window, 'withProgress').callsFake(async (options, task) => {
            return await task({ report: () => {} }, {} as any);
        });
    }

    /**
     * Create a mock status bar item
     */
    public static createMockStatusBarItem(): vscode.StatusBarItem {
        return {
            id: 'test-status-bar',
            name: 'Test Status Bar',
            alignment: vscode.StatusBarAlignment.Right,
            priority: 100,
            text: '',
            tooltip: '',
            color: undefined,
            backgroundColor: undefined,
            command: undefined,
            accessibilityInformation: undefined,
            show: TestUtils.sandbox.stub(),
            hide: TestUtils.sandbox.stub(),
            dispose: TestUtils.sandbox.stub()
        } as vscode.StatusBarItem;
    }

    /**
     * Wait for a specified amount of time
     */
    public static async wait(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Assert that a function throws an error
     */
    public static async assertThrows(
        fn: () => Promise<any> | any,
        expectedError?: string | RegExp
    ): Promise<void> {
        let threw = false;
        let error: Error | undefined;

        try {
            const result = fn();
            if (result && typeof result.then === 'function') {
                await result;
            }
        } catch (e) {
            threw = true;
            error = e as Error;
        }

        if (!threw) {
            throw new Error('Expected function to throw an error');
        }

        if (expectedError) {
            if (typeof expectedError === 'string') {
                if (!error?.message.includes(expectedError)) {
                    throw new Error(`Expected error message to contain "${expectedError}", got "${error?.message}"`);
                }
            } else if (expectedError instanceof RegExp) {
                if (!expectedError.test(error?.message || '')) {
                    throw new Error(`Expected error message to match ${expectedError}, got "${error?.message}"`);
                }
            }
        }
    }

    /**
     * Get the sandbox for custom stubbing
     */
    public static getSandbox(): sinon.SinonSandbox {
        return TestUtils.sandbox;
    }

    /**
     * Create a mock file system watcher
     */
    public static createMockFileSystemWatcher(): vscode.FileSystemWatcher {
        return {
            ignoreCreateEvents: false,
            ignoreChangeEvents: false,
            ignoreDeleteEvents: false,
            onDidCreate: TestUtils.sandbox.stub().returns({ dispose: TestUtils.sandbox.stub() }),
            onDidChange: TestUtils.sandbox.stub().returns({ dispose: TestUtils.sandbox.stub() }),
            onDidDelete: TestUtils.sandbox.stub().returns({ dispose: TestUtils.sandbox.stub() }),
            dispose: TestUtils.sandbox.stub()
        } as vscode.FileSystemWatcher;
    }

    /**
     * Mock file system operations
     */
    public static mockFileSystem(files: { [path: string]: string } = {}): void {
        const fs = require('fs');

        TestUtils.sandbox.stub(fs, 'existsSync').callsFake((...args: any[]) => {
            const path = args[0] as string;
            return files.hasOwnProperty(path);
        });

        TestUtils.sandbox.stub(fs, 'readFileSync').callsFake((...args: any[]) => {
            const path = args[0] as string;
            if (files.hasOwnProperty(path)) {
                return files[path];
            }
            throw new Error(`ENOENT: no such file or directory, open '${path}'`);
        });

        TestUtils.sandbox.stub(fs, 'writeFileSync').callsFake((...args: any[]) => {
            const path = args[0] as string;
            const content = args[1] as string;
            files[path] = content;
        });

        TestUtils.sandbox.stub(fs, 'statSync').callsFake((...args: any[]) => {
            const path = args[0] as string;
            if (files.hasOwnProperty(path)) {
                return {
                    isFile: () => true,
                    isDirectory: () => false,
                    mtime: new Date(),
                    size: files[path].length
                };
            }
            throw new Error(`ENOENT: no such file or directory, stat '${path}'`);
        });
    }

    /**
     * Create a mock webview panel
     */
    public static createMockWebviewPanel(): vscode.WebviewPanel {
        const mockWebview = {
            options: {},
            html: '',
            onDidReceiveMessage: TestUtils.sandbox.stub().returns({ dispose: TestUtils.sandbox.stub() }),
            postMessage: TestUtils.sandbox.stub().resolves(true),
            asWebviewUri: TestUtils.sandbox.stub().callsFake((uri: vscode.Uri) => uri),
            cspSource: 'vscode-webview:'
        };

        return {
            webview: mockWebview,
            viewType: 'test',
            title: 'Test Panel',
            iconPath: undefined,
            options: {},
            viewColumn: vscode.ViewColumn.One,
            active: true,
            visible: true,
            onDidDispose: TestUtils.sandbox.stub().returns({ dispose: TestUtils.sandbox.stub() }),
            onDidChangeViewState: TestUtils.sandbox.stub().returns({ dispose: TestUtils.sandbox.stub() }),
            reveal: TestUtils.sandbox.stub(),
            dispose: TestUtils.sandbox.stub()
        } as vscode.WebviewPanel;
    }

    /**
     * Create a performance timer for testing
     */
    public static createTimer(): { start: () => void; stop: () => number; elapsed: () => number } {
        let startTime: number;

        return {
            start: () => {
                startTime = Date.now();
            },
            stop: () => {
                const elapsed = Date.now() - startTime;
                return elapsed;
            },
            elapsed: () => {
                return Date.now() - startTime;
            }
        };
    }

    /**
     * Wait for a condition to be true with timeout
     */
    public static async waitForCondition(
        condition: () => boolean | Promise<boolean>,
        timeout: number = 5000,
        interval: number = 100
    ): Promise<void> {
        const startTime = Date.now();

        while (Date.now() - startTime < timeout) {
            if (await condition()) {
                return;
            }
            await new Promise(resolve => setTimeout(resolve, interval));
        }

        throw new Error(`Condition not met within ${timeout}ms`);
    }

    /**
     * Create mock diagnostic collection
     */
    public static createMockDiagnosticCollection(): vscode.DiagnosticCollection {
        const mockCollection = {
            name: 'test-diagnostics',
            set: TestUtils.sandbox.stub(),
            delete: TestUtils.sandbox.stub(),
            clear: TestUtils.sandbox.stub(),
            forEach: TestUtils.sandbox.stub(),
            get: TestUtils.sandbox.stub().returns([]),
            has: TestUtils.sandbox.stub().returns(false),
            dispose: TestUtils.sandbox.stub(),
            [Symbol.iterator]: TestUtils.sandbox.stub()
        };
        return mockCollection as unknown as vscode.DiagnosticCollection;
    }
}