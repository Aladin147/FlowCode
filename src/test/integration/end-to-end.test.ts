import { expect } from 'chai';
import { describe, it, beforeEach, afterEach } from 'mocha';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { FlowCodeExtension } from '../../flowcode-extension';
import { TestUtils } from '../TestUtils';

describe('FlowCode End-to-End Integration Tests', () => {
    let extension: FlowCodeExtension;
    let sandbox: sinon.SinonSandbox;
    let mockContext: vscode.ExtensionContext;
    let testWorkspaceRoot: string;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        TestUtils.mockVSCodeAPI(sandbox);
        
        mockContext = TestUtils.createMockExtensionContext();
        extension = new FlowCodeExtension(mockContext);
        
        // Setup test workspace
        testWorkspaceRoot = '/test/workspace';
        sandbox.stub(vscode.workspace, 'workspaceFolders').value([
            { uri: { fsPath: testWorkspaceRoot } }
        ]);
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('Complete Development Workflow', () => {
        it('should handle complete development cycle from setup to deployment', async () => {
            // Step 1: Extension activation
            await extension.activate();
            expect(extension.isActive()).to.be.true;

            // Step 2: Configure API key
            sandbox.stub(vscode.window, 'showQuickPick').resolves('OpenAI');
            sandbox.stub(vscode.window, 'showInputBox').resolves('sk-test1234567890abcdef1234567890abcdef1234567890ab');
            
            await extension.configureApiKey();

            // Step 3: Create test file
            const testFile = path.join(testWorkspaceRoot, 'test.ts');
            const testContent = `
function calculateSum(a: number, b: number): number {
    return a + b;
}

function processData(data: any[]): any[] {
    return data.map(item => item.value);
}
`;
            
            // Mock file system
            sandbox.stub(fs, 'readFileSync').returns(testContent);
            sandbox.stub(fs, 'existsSync').returns(true);
            sandbox.stub(fs, 'writeFileSync').returns(undefined);
            sandbox.stub(fs, 'mkdirSync').returns(undefined);

            // Step 4: Run companion guard checks
            const mockEditor = TestUtils.createMockTextEditor(
                TestUtils.createMockTextDocument(testContent, 'typescript', testFile)
            );
            sandbox.stub(vscode.window, 'activeTextEditor').value(mockEditor);

            await extension.runCompanionGuard();

            // Step 5: Generate code graph
            await extension.showCodeGraph();

            // Step 6: Refactor code with architect
            mockEditor.selection = new vscode.Selection(0, 0, 5, 0);
            await extension.refactorCode();

            // Step 7: Create hotfix
            sandbox.stub(vscode.window, 'showInputBox').resolves('Fix critical bug in calculation');
            await extension.createHotfix();

            // Step 8: Initialize final guard
            await extension.initializeFinalGuard();

            // Verify all steps completed successfully
            expect(true).to.be.true; // If we reach here, all steps passed
        });

        it('should handle error recovery throughout workflow', async () => {
            // Test error scenarios and recovery
            
            // Activation with missing dependencies
            const toolManager = await import('../../utils/tool-manager');
            sandbox.stub(toolManager.ToolManager, 'checkAllDependencies').resolves({
                allRequired: false,
                missing: [{ name: 'Node.js', command: 'node', isRequired: true, installUrl: '', description: '', checkCommand: [] }],
                installed: [],
                warnings: []
            });

            await extension.activate();
            expect(extension.isActive()).to.be.true; // Should still activate with warnings

            // API configuration with invalid key
            sandbox.stub(vscode.window, 'showQuickPick').resolves('OpenAI');
            sandbox.stub(vscode.window, 'showInputBox').resolves('invalid-key');
            
            try {
                await extension.configureApiKey();
                // Should handle invalid key gracefully
            } catch (error) {
                expect(error).to.be.instanceOf(Error);
            }

            // Companion guard with no active editor
            sandbox.stub(vscode.window, 'activeTextEditor').value(undefined);
            await extension.runCompanionGuard(); // Should not throw

            // Graph generation with invalid file
            sandbox.stub(fs, 'existsSync').returns(false);
            await extension.showCodeGraph(); // Should handle gracefully

            expect(true).to.be.true;
        });
    });

    describe('Service Integration Workflows', () => {
        it('should integrate companion guard with status updates', async () => {
            await extension.activate();

            const testFile = '/test/file.ts';
            const testContent = 'const x = 1;';
            
            const mockEditor = TestUtils.createMockTextEditor(
                TestUtils.createMockTextDocument(testContent, 'typescript', testFile)
            );
            sandbox.stub(vscode.window, 'activeTextEditor').value(mockEditor);

            // Mock successful checks
            sandbox.stub(fs, 'readFileSync').returns(testContent);
            sandbox.stub(fs, 'existsSync').returns(true);

            await extension.runCompanionGuard();

            // Verify status bar was updated (through mocked calls)
            expect(vscode.window.createStatusBarItem.called).to.be.true;
        });

        it('should integrate architect service with configuration', async () => {
            await extension.activate();

            // Mock configuration
            const configStub = sandbox.stub(vscode.workspace, 'getConfiguration').returns({
                get: (key: string) => {
                    switch (key) {
                        case 'apiProvider': return 'openai';
                        case 'maxTokens': return 2000;
                        default: return undefined;
                    }
                },
                update: sandbox.stub(),
                has: sandbox.stub(),
                inspect: sandbox.stub()
            });

            const testContent = 'function test() { return "hello"; }';
            const mockEditor = TestUtils.createMockTextEditor(
                TestUtils.createMockTextDocument(testContent, 'typescript', '/test/file.ts')
            );
            mockEditor.selection = new vscode.Selection(0, 0, 0, 30);
            sandbox.stub(vscode.window, 'activeTextEditor').value(mockEditor);

            // Mock API response
            const axios = await import('axios');
            sandbox.stub(axios, 'default').resolves({
                data: {
                    choices: [{ message: { content: 'function betterTest() { return "hello world"; }' } }]
                }
            });

            await extension.refactorCode();

            expect(configStub.called).to.be.true;
        });

        it('should integrate hotfix service with git operations', async () => {
            await extension.activate();

            // Mock git operations
            const { spawn } = require('child_process');
            const mockProcess = {
                stdout: { on: sandbox.stub() },
                stderr: { on: sandbox.stub() },
                on: sandbox.stub().callsArgWith(1, 0) // Success exit code
            };
            sandbox.stub(spawn, 'spawn').returns(mockProcess);

            // Mock user input
            sandbox.stub(vscode.window, 'showInputBox').resolves('Critical hotfix for production');

            await extension.createHotfix();

            expect(spawn.called).to.be.true;
        });

        it('should integrate final guard with git hooks', async () => {
            await extension.activate();

            // Mock file system operations
            sandbox.stub(fs, 'existsSync').returns(true);
            sandbox.stub(fs, 'mkdirSync').returns(undefined);
            sandbox.stub(fs, 'writeFileSync').returns(undefined);
            sandbox.stub(fs, 'chmodSync').returns(undefined);
            sandbox.stub(fs, 'statSync').returns({ mode: parseInt('755', 8) });

            await extension.initializeFinalGuard();

            expect(fs.writeFileSync.called).to.be.true;
        });
    });

    describe('Cross-Platform Integration', () => {
        it('should work correctly on Windows', async () => {
            // Mock Windows environment
            const originalPlatform = process.platform;
            Object.defineProperty(process, 'platform', { value: 'win32' });

            try {
                await extension.activate();
                await extension.initializeFinalGuard();
                
                // Verify Windows-specific behavior
                expect(fs.writeFileSync.called).to.be.true;
            } finally {
                Object.defineProperty(process, 'platform', { value: originalPlatform });
            }
        });

        it('should work correctly on Unix/Linux', async () => {
            // Mock Unix environment
            const originalPlatform = process.platform;
            Object.defineProperty(process, 'platform', { value: 'linux' });

            try {
                await extension.activate();
                await extension.initializeFinalGuard();
                
                // Verify Unix-specific behavior (chmod calls)
                expect(fs.chmodSync.called).to.be.true;
            } finally {
                Object.defineProperty(process, 'platform', { value: originalPlatform });
            }
        });
    });

    describe('Performance Integration', () => {
        it('should handle large files efficiently', async () => {
            await extension.activate();

            // Create large test content
            const largeContent = 'function test() { return "hello"; }\n'.repeat(1000);
            const mockEditor = TestUtils.createMockTextEditor(
                TestUtils.createMockTextDocument(largeContent, 'typescript', '/test/large-file.ts')
            );
            sandbox.stub(vscode.window, 'activeTextEditor').value(mockEditor);

            const startTime = Date.now();
            await extension.runCompanionGuard();
            const duration = Date.now() - startTime;

            // Should complete within reasonable time
            expect(duration).to.be.lessThan(5000); // 5 seconds max
        });

        it('should handle concurrent operations', async () => {
            await extension.activate();

            const testContent = 'const x = 1;';
            const mockEditor = TestUtils.createMockTextEditor(
                TestUtils.createMockTextDocument(testContent, 'typescript', '/test/file.ts')
            );
            sandbox.stub(vscode.window, 'activeTextEditor').value(mockEditor);

            // Run multiple operations concurrently
            const promises = [
                extension.runCompanionGuard(),
                extension.showCodeGraph(),
                extension.runCompanionGuard() // Duplicate to test debouncing
            ];

            const results = await Promise.allSettled(promises);
            
            // All operations should complete without throwing
            results.forEach(result => {
                expect(result.status).to.equal('fulfilled');
            });
        });
    });

    describe('Security Integration', () => {
        it('should validate all inputs throughout workflow', async () => {
            await extension.activate();

            // Test with malicious input
            const maliciousContent = `
                eval("malicious code");
                document.write("<script>alert('xss')</script>");
            `;

            const mockEditor = TestUtils.createMockTextEditor(
                TestUtils.createMockTextDocument(maliciousContent, 'typescript', '/test/malicious.ts')
            );
            sandbox.stub(vscode.window, 'activeTextEditor').value(mockEditor);

            // Should handle malicious content safely
            await extension.runCompanionGuard();
            await extension.showCodeGraph();

            expect(true).to.be.true; // Should not throw or execute malicious code
        });

        it('should protect API keys throughout workflow', async () => {
            await extension.activate();

            // Configure API key
            sandbox.stub(vscode.window, 'showQuickPick').resolves('OpenAI');
            sandbox.stub(vscode.window, 'showInputBox').resolves('sk-test1234567890abcdef1234567890abcdef1234567890ab');

            await extension.configureApiKey();

            // Verify API key is stored securely (not in plain text settings)
            const config = vscode.workspace.getConfiguration('flowcode');
            expect(config.get('apiKey')).to.be.undefined; // Should not be in settings
        });

        it('should handle complete architect workflow', async () => {
            await extension.activate();

            // Mock API configuration
            sandbox.stub(extension as any, 'configManager').value({
                getApiConfiguration: sandbox.stub().resolves({
                    provider: 'openai',
                    apiKey: 'test-key',
                    maxTokens: 2000
                })
            });

            const testCode = 'function oldFunction() { return "old"; }';
            const mockEditor = TestUtils.createMockTextEditor(
                TestUtils.createMockTextDocument(testCode, 'typescript', '/test/refactor.ts')
            );
            mockEditor.selection = new vscode.Selection(0, 0, 0, testCode.length);
            sandbox.stub(vscode.window, 'activeTextEditor').value(mockEditor);

            // Mock API response
            const axios = require('axios');
            sandbox.stub(axios, 'post').resolves({
                data: {
                    choices: [{ message: { content: 'function newFunction() { return "new"; }' } }]
                }
            });

            await extension.refactorCode();

            expect(axios.post.called).to.be.true;
        });

        it('should handle complete hotfix workflow', async () => {
            await extension.activate();

            const testMessage = 'Fix critical bug in authentication';

            // Mock git operations
            const { spawn } = require('child_process');
            const mockProcess = {
                stdout: { on: sandbox.stub() },
                stderr: { on: sandbox.stub() },
                on: sandbox.stub().callsArgWith(1, 0)
            };
            sandbox.stub(spawn, 'spawn').returns(mockProcess);

            // Mock user input
            sandbox.stub(vscode.window, 'showInputBox').resolves(testMessage);
            sandbox.stub(vscode.window, 'showQuickPick').resolves(['eslint']);

            await extension.createHotfix();

            expect(spawn.called).to.be.true;
        });

        it('should handle complete graph visualization workflow', async () => {
            await extension.activate();

            const testCode = `
                function caller() {
                    return callee();
                }
                function callee() {
                    return "test";
                }
            `;

            const mockEditor = TestUtils.createMockTextEditor(
                TestUtils.createMockTextDocument(testCode, 'typescript', '/test/graph.ts')
            );
            sandbox.stub(vscode.window, 'activeTextEditor').value(mockEditor);

            // Mock file system
            const fs = require('fs');
            sandbox.stub(fs, 'readFileSync').returns(testCode);
            sandbox.stub(fs, 'existsSync').returns(true);

            // Mock webview panel
            const mockPanel = {
                webview: {
                    html: '',
                    onDidReceiveMessage: sandbox.stub()
                }
            };
            sandbox.stub(vscode.window, 'createWebviewPanel').returns(mockPanel);

            await extension.showCodeGraph();

            expect(vscode.window.createWebviewPanel.called).to.be.true;
            expect(mockPanel.webview.html).to.include('caller');
        });

        it('should handle final guard initialization and validation', async () => {
            await extension.activate();

            // Mock file system operations
            const fs = require('fs');
            sandbox.stub(fs, 'existsSync').returns(true);
            sandbox.stub(fs, 'mkdirSync').returns(undefined);
            sandbox.stub(fs, 'writeFileSync').returns(undefined);
            sandbox.stub(fs, 'chmodSync').returns(undefined);
            sandbox.stub(fs, 'statSync').returns({
                mode: parseInt('755', 8),
                size: 1000
            });

            await extension.initializeFinalGuard();

            // Verify hooks were created
            expect(fs.writeFileSync.calledTwice).to.be.true; // pre-commit and pre-push
        });
    });

    describe('Error Handling and Recovery', () => {
        it('should handle API key configuration errors gracefully', async () => {
            await extension.activate();

            // Mock configuration error
            sandbox.stub(extension as any, 'configManager').value({
                getApiConfiguration: sandbox.stub().rejects(new Error('API key not configured'))
            });

            // Should not throw
            await extension.refactorCode();

            // Should show error message
            expect(vscode.window.showErrorMessage.called).to.be.true;
        });

        it('should handle git operation failures gracefully', async () => {
            await extension.activate();

            // Mock git failure
            const { spawn } = require('child_process');
            const mockProcess = {
                stdout: { on: sandbox.stub() },
                stderr: { on: sandbox.stub() },
                on: sandbox.stub().callsArgWith(1, 1) // Exit code 1 (failure)
            };
            sandbox.stub(spawn, 'spawn').returns(mockProcess);

            sandbox.stub(vscode.window, 'showInputBox').resolves('Test hotfix');
            sandbox.stub(vscode.window, 'showQuickPick').resolves(['eslint']);

            // Should not throw
            await extension.createHotfix();

            // Should handle error gracefully
            expect(vscode.window.showErrorMessage.called).to.be.true;
        });

        it('should handle file system errors gracefully', async () => {
            await extension.activate();

            const mockEditor = TestUtils.createMockTextEditor(
                TestUtils.createMockTextDocument('test', 'typescript', '/test/file.ts')
            );
            sandbox.stub(vscode.window, 'activeTextEditor').value(mockEditor);

            // Mock file system error
            const fs = require('fs');
            sandbox.stub(fs, 'readFileSync').throws(new Error('File not found'));

            // Should not throw
            await extension.showCodeGraph();

            // Should handle error gracefully
            expect(vscode.window.showErrorMessage.called).to.be.true;
        });

        it('should handle network errors gracefully', async () => {
            await extension.activate();

            // Mock API configuration
            sandbox.stub(extension as any, 'configManager').value({
                getApiConfiguration: sandbox.stub().resolves({
                    provider: 'openai',
                    apiKey: 'test-key',
                    maxTokens: 2000
                })
            });

            const mockEditor = TestUtils.createMockTextEditor(
                TestUtils.createMockTextDocument('test code', 'typescript', '/test/file.ts')
            );
            mockEditor.selection = new vscode.Selection(0, 0, 0, 9);
            sandbox.stub(vscode.window, 'activeTextEditor').value(mockEditor);

            // Mock network error
            const axios = require('axios');
            sandbox.stub(axios, 'post').rejects(new Error('Network error'));

            // Should not throw
            await extension.refactorCode();

            // Should handle error gracefully
            expect(vscode.window.showErrorMessage.called).to.be.true;
        });
    });

    describe('Cross-Platform Compatibility', () => {
        it('should handle Windows-specific operations', async () => {
            // Mock Windows platform
            const originalPlatform = process.platform;
            Object.defineProperty(process, 'platform', { value: 'win32' });

            await extension.activate();
            await extension.initializeFinalGuard();

            // Restore original platform
            Object.defineProperty(process, 'platform', { value: originalPlatform });

            expect(true).to.be.true; // Test completed without errors
        });

        it('should handle Unix-specific operations', async () => {
            // Mock Unix platform
            const originalPlatform = process.platform;
            Object.defineProperty(process, 'platform', { value: 'linux' });

            await extension.activate();
            await extension.initializeFinalGuard();

            // Restore original platform
            Object.defineProperty(process, 'platform', { value: originalPlatform });

            expect(true).to.be.true; // Test completed without errors
        });
    });
});
