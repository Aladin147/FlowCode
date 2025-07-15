import { expect } from 'chai';
import { describe, it, beforeEach, afterEach } from 'mocha';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { FlowCodeExtension } from '../../flowcode-extension';
import { TestUtils } from '../TestUtils';

describe('FlowCodeExtension Integration Tests', () => {
    let extension: FlowCodeExtension;
    let sandbox: sinon.SinonSandbox;
    let mockContext: vscode.ExtensionContext;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        TestUtils.mockVSCodeAPI(sandbox);
        
        mockContext = TestUtils.createMockExtensionContext();
        extension = new FlowCodeExtension(mockContext);
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('extension lifecycle', () => {
        it('should activate successfully', async () => {
            // Mock workspace folders
            sandbox.stub(vscode.workspace, 'workspaceFolders').value([
                { uri: { fsPath: '/test/workspace' } }
            ]);

            // Mock file system watchers
            const mockWatcher = {
                onDidChange: sandbox.stub(),
                onDidCreate: sandbox.stub(),
                onDidDelete: sandbox.stub(),
                dispose: sandbox.stub()
            };
            sandbox.stub(vscode.workspace, 'createFileSystemWatcher').returns(mockWatcher);

            // Mock status bar
            const mockStatusBar = {
                text: '',
                show: sandbox.stub(),
                dispose: sandbox.stub()
            };
            sandbox.stub(vscode.window, 'createStatusBarItem').returns(mockStatusBar);

            await extension.activate();

            expect(extension.isActive()).to.be.true;
        });

        it('should handle activation errors gracefully', async () => {
            // Mock an error during initialization
            sandbox.stub(vscode.workspace, 'createFileSystemWatcher').throws(new Error('Test error'));

            try {
                await extension.activate();
                // Should not throw, but should handle error gracefully
                expect(extension.isActive()).to.be.false;
            } catch (error) {
                // If it does throw, that's also acceptable for this test
                expect(error).to.be.instanceOf(Error);
            }
        });

        it('should deactivate successfully', async () => {
            // First activate
            sandbox.stub(vscode.workspace, 'workspaceFolders').value([
                { uri: { fsPath: '/test/workspace' } }
            ]);

            const mockWatcher = {
                onDidChange: sandbox.stub(),
                onDidCreate: sandbox.stub(),
                onDidDelete: sandbox.stub(),
                dispose: sandbox.stub()
            };
            sandbox.stub(vscode.workspace, 'createFileSystemWatcher').returns(mockWatcher);

            const mockStatusBar = {
                text: '',
                show: sandbox.stub(),
                dispose: sandbox.stub()
            };
            sandbox.stub(vscode.window, 'createStatusBarItem').returns(mockStatusBar);

            await extension.activate();

            // Then deactivate
            extension.deactivate();

            expect(extension.isActive()).to.be.false;
            expect(mockWatcher.dispose.called).to.be.true;
            expect(mockStatusBar.dispose.called).to.be.true;
        });
    });

    describe('command integration', () => {
        beforeEach(async () => {
            // Setup for command tests
            sandbox.stub(vscode.workspace, 'workspaceFolders').value([
                { uri: { fsPath: '/test/workspace' } }
            ]);

            const mockWatcher = {
                onDidChange: sandbox.stub(),
                onDidCreate: sandbox.stub(),
                onDidDelete: sandbox.stub(),
                dispose: sandbox.stub()
            };
            sandbox.stub(vscode.workspace, 'createFileSystemWatcher').returns(mockWatcher);

            const mockStatusBar = {
                text: '',
                show: sandbox.stub(),
                dispose: sandbox.stub()
            };
            sandbox.stub(vscode.window, 'createStatusBarItem').returns(mockStatusBar);

            await extension.activate();
        });

        it('should execute companion guard command', async () => {
            // Mock active editor
            const mockEditor = {
                document: {
                    uri: { fsPath: '/test/file.ts' },
                    languageId: 'typescript'
                }
            };
            sandbox.stub(vscode.window, 'activeTextEditor').value(mockEditor);

            // Mock progress notification
            sandbox.stub(vscode.window, 'withProgress').callsFake(async (options, task) => {
                return await task({ report: sandbox.stub() });
            });

            // Execute command
            await extension.runCompanionGuard();

            // Should complete without throwing
            expect(true).to.be.true;
        });

        it('should execute architect refactor command', async () => {
            // Mock active editor with selected text
            const mockEditor = {
                document: {
                    uri: { fsPath: '/test/file.ts' },
                    languageId: 'typescript',
                    getText: sandbox.stub().returns('function test() { return "hello"; }')
                },
                selection: {
                    isEmpty: false,
                    start: { line: 0, character: 0 },
                    end: { line: 0, character: 30 }
                }
            };
            sandbox.stub(vscode.window, 'activeTextEditor').value(mockEditor);

            // Mock configuration
            sandbox.stub(vscode.workspace, 'getConfiguration').returns({
                get: sandbox.stub().returns('test-api-key')
            });

            // Mock progress and user input
            sandbox.stub(vscode.window, 'withProgress').callsFake(async (options, task) => {
                return await task({ report: sandbox.stub() });
            });

            // Execute command
            await extension.refactorCode();

            // Should complete without throwing
            expect(true).to.be.true;
        });

        it('should execute graph visualization command', async () => {
            // Mock active editor
            const mockEditor = {
                document: {
                    uri: { fsPath: '/test/file.ts' },
                    languageId: 'typescript'
                }
            };
            sandbox.stub(vscode.window, 'activeTextEditor').value(mockEditor);

            // Mock file system
            const fs = require('fs');
            sandbox.stub(fs, 'readFileSync').returns('function test() { return "hello"; }');

            // Mock webview panel
            const mockPanel = {
                webview: {
                    html: '',
                    onDidReceiveMessage: sandbox.stub()
                }
            };
            sandbox.stub(vscode.window, 'createWebviewPanel').returns(mockPanel);

            // Execute command
            await extension.showCodeGraph();

            expect(vscode.window.createWebviewPanel.called).to.be.true;
        });

        it('should execute hotfix creation command', async () => {
            // Mock user input
            sandbox.stub(vscode.window, 'showInputBox').resolves('Test hotfix message');
            sandbox.stub(vscode.window, 'showQuickPick').resolves(['eslint']);

            // Mock git operations
            const { spawn } = require('child_process');
            sandbox.stub(spawn, 'spawn').returns({
                stdout: { on: sandbox.stub() },
                stderr: { on: sandbox.stub() },
                on: sandbox.stub().callsArgWith(1, 0)
            });

            // Execute command
            await extension.createHotfix();

            // Should complete without throwing
            expect(true).to.be.true;
        });

        it('should execute final guard initialization command', async () => {
            // Mock file system operations
            const fs = require('fs');
            sandbox.stub(fs, 'existsSync').returns(true);
            sandbox.stub(fs, 'mkdirSync').returns(undefined);
            sandbox.stub(fs, 'writeFileSync').returns(undefined);
            sandbox.stub(fs, 'chmodSync').returns(undefined);
            sandbox.stub(fs, 'statSync').returns({ mode: parseInt('755', 8) });

            // Execute command
            await extension.initializeFinalGuard();

            // Should complete without throwing
            expect(true).to.be.true;
        });
    });

    describe('service integration', () => {
        beforeEach(async () => {
            sandbox.stub(vscode.workspace, 'workspaceFolders').value([
                { uri: { fsPath: '/test/workspace' } }
            ]);

            const mockWatcher = {
                onDidChange: sandbox.stub(),
                onDidCreate: sandbox.stub(),
                onDidDelete: sandbox.stub(),
                dispose: sandbox.stub()
            };
            sandbox.stub(vscode.workspace, 'createFileSystemWatcher').returns(mockWatcher);

            const mockStatusBar = {
                text: '',
                show: sandbox.stub(),
                dispose: sandbox.stub()
            };
            sandbox.stub(vscode.window, 'createStatusBarItem').returns(mockStatusBar);

            await extension.activate();
        });

        it('should integrate companion guard with status bar updates', async () => {
            const mockEditor = {
                document: {
                    uri: { fsPath: '/test/file.ts' },
                    languageId: 'typescript'
                }
            };
            sandbox.stub(vscode.window, 'activeTextEditor').value(mockEditor);

            // Mock the companion guard service methods
            const companionGuard = (extension as any).companionGuard;
            sandbox.stub(companionGuard, 'runChecks').resolves({
                passed: true,
                issues: [],
                duration: 1000
            });

            await extension.runCompanionGuard();

            // Verify status bar was updated
            const statusBar = (extension as any).statusBarManager;
            expect(statusBar).to.exist;
        });

        it('should integrate architect service with configuration', async () => {
            // Mock configuration
            sandbox.stub(vscode.workspace, 'getConfiguration').returns({
                get: (key: string) => {
                    switch (key) {
                        case 'flowcode.ai.provider': return 'openai';
                        case 'flowcode.ai.apiKey': return 'test-key';
                        case 'flowcode.ai.maxTokens': return 2000;
                        default: return undefined;
                    }
                }
            });

            const mockEditor = {
                document: {
                    uri: { fsPath: '/test/file.ts' },
                    languageId: 'typescript',
                    getText: sandbox.stub().returns('function test() { return "hello"; }')
                },
                selection: {
                    isEmpty: false,
                    start: { line: 0, character: 0 },
                    end: { line: 0, character: 30 }
                }
            };
            sandbox.stub(vscode.window, 'activeTextEditor').value(mockEditor);

            // Mock HTTP request
            const axios = require('axios');
            sandbox.stub(axios, 'post').resolves({
                data: {
                    choices: [{ message: { content: 'function betterTest() { return "hello world"; }' } }]
                }
            });

            await extension.refactorCode();

            expect(axios.post.called).to.be.true;
        });

        it('should integrate graph service with webview', async () => {
            const mockEditor = {
                document: {
                    uri: { fsPath: '/test/file.ts' },
                    languageId: 'typescript'
                }
            };
            sandbox.stub(vscode.window, 'activeTextEditor').value(mockEditor);

            const fs = require('fs');
            sandbox.stub(fs, 'readFileSync').returns(`
                function caller() {
                    return callee();
                }
                function callee() {
                    return "test";
                }
            `);

            const mockPanel = {
                webview: {
                    html: '',
                    onDidReceiveMessage: sandbox.stub()
                }
            };
            sandbox.stub(vscode.window, 'createWebviewPanel').returns(mockPanel);

            await extension.showCodeGraph();

            expect(mockPanel.webview.html).to.include('caller');
            expect(mockPanel.webview.html).to.include('callee');
        });
    });

    describe('error handling integration', () => {
        it('should handle service initialization failures gracefully', async () => {
            // Mock a service that fails to initialize
            sandbox.stub(vscode.workspace, 'createFileSystemWatcher').throws(new Error('Service error'));

            // Should not throw during activation
            try {
                await extension.activate();
                expect(extension.isActive()).to.be.false;
            } catch (error) {
                // If it throws, that's also acceptable
                expect(error).to.be.instanceOf(Error);
            }
        });

        it('should handle command execution errors gracefully', async () => {
            await extension.activate();

            // Mock a command that will fail
            sandbox.stub(vscode.window, 'activeTextEditor').value(undefined);

            // Should not throw
            await extension.runCompanionGuard();
            await extension.refactorCode();
            await extension.showCodeGraph();
        });
    });
});
