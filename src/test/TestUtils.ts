import * as sinon from 'sinon';
import * as vscode from 'vscode';

export class TestUtils {
    /**
     * Mock VS Code API for testing
     */
    public static mockVSCodeAPI(sandbox: sinon.SinonSandbox): void {
        // Mock workspace
        sandbox.stub(vscode.workspace, 'getConfiguration').returns({
            get: sandbox.stub().returns(''),
            update: sandbox.stub().resolves(),
            has: sandbox.stub().returns(false),
            inspect: sandbox.stub().returns(undefined)
        });

        // Mock window
        sandbox.stub(vscode.window, 'showInformationMessage').resolves();
        sandbox.stub(vscode.window, 'showWarningMessage').resolves();
        sandbox.stub(vscode.window, 'showErrorMessage').resolves();
        sandbox.stub(vscode.window, 'showInputBox').resolves('');
        sandbox.stub(vscode.window, 'showQuickPick').resolves(undefined);
        sandbox.stub(vscode.window, 'withProgress').callsFake(async (options, task) => {
            const mockToken = {
                isCancellationRequested: false,
                onCancellationRequested: sandbox.stub().returns({ dispose: sandbox.stub() })
            };
            return await task({ report: sandbox.stub() }, mockToken);
        });

        // Mock commands
        sandbox.stub(vscode.commands, 'registerCommand').returns({
            dispose: sandbox.stub()
        });
        sandbox.stub(vscode.commands, 'executeCommand').resolves();

        // Mock languages
        const mockDiagnosticCollection = {
            name: 'test',
            set: sandbox.stub().callsFake((uri: any, diagnostics?: any) => {}),
            delete: sandbox.stub(),
            clear: sandbox.stub(),
            forEach: sandbox.stub(),
            get: sandbox.stub(),
            has: sandbox.stub(),
            dispose: sandbox.stub(),
            [Symbol.iterator]: sandbox.stub()
        };
        sandbox.stub(vscode.languages, 'createDiagnosticCollection').returns(mockDiagnosticCollection as any);

        // Mock Uri
        sandbox.stub(vscode.Uri, 'file').callsFake((path: string) => ({
            scheme: 'file',
            authority: '',
            path,
            query: '',
            fragment: '',
            fsPath: path,
            with: sandbox.stub(),
            toJSON: sandbox.stub()
        }));

        // Mock Range
        sandbox.stub(vscode.Range.prototype, 'contains').returns(false);
        sandbox.stub(vscode.Range.prototype, 'intersection').returns(undefined);
        sandbox.stub(vscode.Range.prototype, 'union').returns(new vscode.Range(0, 0, 0, 0));
        sandbox.stub(vscode.Range.prototype, 'isEmpty').value(false);
        sandbox.stub(vscode.Range.prototype, 'isSingleLine').value(true);

        // Mock Position
        sandbox.stub(vscode.Position.prototype, 'compareTo').returns(0);
        sandbox.stub(vscode.Position.prototype, 'isAfter').returns(false);
        sandbox.stub(vscode.Position.prototype, 'isAfterOrEqual').returns(false);
        sandbox.stub(vscode.Position.prototype, 'isBefore').returns(false);
        sandbox.stub(vscode.Position.prototype, 'isBeforeOrEqual').returns(false);
        sandbox.stub(vscode.Position.prototype, 'isEqual').returns(false);
        sandbox.stub(vscode.Position.prototype, 'translate').returns(new vscode.Position(0, 0));
        sandbox.stub(vscode.Position.prototype, 'with').returns(new vscode.Position(0, 0));

        // Mock Selection
        sandbox.stub(vscode.Selection.prototype, 'contains').returns(false);
        sandbox.stub(vscode.Selection.prototype, 'intersection').returns(undefined);
        sandbox.stub(vscode.Selection.prototype, 'union').returns(new vscode.Range(0, 0, 0, 0));
        sandbox.stub(vscode.Selection.prototype, 'isEmpty').value(false);
        sandbox.stub(vscode.Selection.prototype, 'isSingleLine').value(true);
        sandbox.stub(vscode.Selection.prototype, 'isReversed').value(false);
    }

    /**
     * Create a mock extension context
     */
    public static createMockExtensionContext(): vscode.ExtensionContext {
        return {
            subscriptions: [],
            workspaceState: {
                get: sinon.stub(),
                update: sinon.stub().resolves(),
                keys: sinon.stub().returns([])
            },
            globalState: {
                get: sinon.stub(),
                update: sinon.stub().resolves(),
                keys: sinon.stub().returns([]),
                setKeysForSync: sinon.stub()
            },
            secrets: {
                get: sinon.stub().resolves(''),
                store: sinon.stub().resolves(),
                delete: sinon.stub().resolves(),
                onDidChange: sinon.stub().returns({ dispose: sinon.stub() })
            },
            extensionUri: vscode.Uri.file('/test/extension'),
            extensionPath: '/test/extension',
            environmentVariableCollection: {
                persistent: true,
                replace: sinon.stub(),
                append: sinon.stub(),
                prepend: sinon.stub(),
                get: sinon.stub(),
                forEach: sinon.stub(),
                delete: sinon.stub(),
                clear: sinon.stub()
            },
            asAbsolutePath: sinon.stub().callsFake((relativePath: string) => `/test/extension/${relativePath}`),
            storageUri: vscode.Uri.file('/test/storage'),
            storagePath: '/test/storage',
            globalStorageUri: vscode.Uri.file('/test/global-storage'),
            globalStoragePath: '/test/global-storage',
            logUri: vscode.Uri.file('/test/logs'),
            logPath: '/test/logs',
            extensionMode: vscode.ExtensionMode.Test,
            languageModelAccessInformation: {
                onDidChange: sinon.stub().returns({ dispose: sinon.stub() }),
                canSendRequest: sinon.stub().returns(undefined)
            },
            extension: {
                id: 'test.flowcode',
                extensionUri: vscode.Uri.file('/test/extension'),
                extensionPath: '/test/extension',
                isActive: true,
                packageJSON: {},
                extensionKind: vscode.ExtensionKind.Workspace,
                exports: undefined,
                activate: sinon.stub().resolves()
            }
        } as unknown as vscode.ExtensionContext;
    }

    /**
     * Create a mock text document
     */
    public static createMockTextDocument(content: string, languageId: string = 'typescript', filePath: string = '/test/file.ts'): vscode.TextDocument {
        const lines = content.split('\n');
        
        return {
            uri: vscode.Uri.file(filePath),
            fileName: filePath,
            isUntitled: false,
            languageId,
            version: 1,
            isDirty: false,
            isClosed: false,
            save: sinon.stub().resolves(true),
            eol: vscode.EndOfLine.LF,
            encoding: 'utf8',
            lineCount: lines.length,
            lineAt: sinon.stub().callsFake((line: number) => ({
                lineNumber: line,
                text: lines[line] || '',
                range: new vscode.Range(line, 0, line, (lines[line] || '').length),
                rangeIncludingLineBreak: new vscode.Range(line, 0, line + 1, 0),
                firstNonWhitespaceCharacterIndex: 0,
                isEmptyOrWhitespace: (lines[line] || '').trim().length === 0
            })),
            offsetAt: sinon.stub().returns(0),
            positionAt: sinon.stub().returns(new vscode.Position(0, 0)),
            getText: sinon.stub().callsFake((range?: vscode.Range) => {
                if (!range) {
                    return content;
                }
                return content; // Simplified for testing
            }),
            getWordRangeAtPosition: sinon.stub().returns(new vscode.Range(0, 0, 0, 0)),
            validateRange: sinon.stub().callsFake((range: vscode.Range) => range),
            validatePosition: sinon.stub().callsFake((position: vscode.Position) => position)
        } as unknown as vscode.TextDocument;
    }

    /**
     * Create a mock text editor
     */
    public static createMockTextEditor(document: vscode.TextDocument): vscode.TextEditor {
        return {
            document,
            selection: new vscode.Selection(0, 0, 0, 0),
            selections: [new vscode.Selection(0, 0, 0, 0)],
            visibleRanges: [new vscode.Range(0, 0, 10, 0)],
            options: {
                tabSize: 4,
                insertSpaces: true,
                cursorStyle: vscode.TextEditorCursorStyle.Line,
                lineNumbers: vscode.TextEditorLineNumbersStyle.On
            },
            viewColumn: vscode.ViewColumn.One,
            edit: sinon.stub().resolves(true),
            insertSnippet: sinon.stub().resolves(true),
            setDecorations: sinon.stub(),
            revealRange: sinon.stub(),
            show: sinon.stub(),
            hide: sinon.stub()
        } as vscode.TextEditor;
    }

    /**
     * Wait for a specified amount of time
     */
    public static async wait(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Create a spy that can be used to verify method calls
     */
    public static createSpy(): sinon.SinonSpy {
        return sinon.spy();
    }

    /**
     * Create a stub that returns a specific value
     */
    public static createStub(returnValue?: any): sinon.SinonStub {
        return sinon.stub().returns(returnValue);
    }

    /**
     * Restore all stubs and spies
     */
    public static restoreAll(): void {
        sinon.restore();
    }
}
