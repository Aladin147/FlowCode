import { expect } from 'chai';
import { describe, it, beforeEach, afterEach } from 'mocha';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { CompanionGuard, GuardResult } from '../../services/companion-guard';
import { ConfigurationManager } from '../../utils/configuration-manager';
import { TestUtils } from '../TestUtils';

describe('CompanionGuard', () => {
    let companionGuard: CompanionGuard;
    let configManager: ConfigurationManager;
    let mockStatusBarItem: any;
    let sandbox: sinon.SinonSandbox;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        
        // Mock VS Code API
        TestUtils.mockVSCodeAPI(sandbox);
        
        // Mock status bar item
        mockStatusBarItem = {
            text: '',
            tooltip: '',
            backgroundColor: undefined,
            show: sandbox.stub(),
            dispose: sandbox.stub()
        };
        
        sandbox.stub(vscode.window, 'createStatusBarItem').returns(mockStatusBarItem);
        
        // Create test instances
        configManager = new ConfigurationManager();
        companionGuard = new CompanionGuard(configManager);
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('initialization', () => {
        it('should initialize successfully', async () => {
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
            
            await companionGuard.initialize();
            
            expect(mockStatusBarItem.show.called).to.be.true;
            expect(vscode.workspace.createFileSystemWatcher.callCount).to.equal(3);
        });

        it('should handle initialization errors gracefully', async () => {
            sandbox.stub(vscode.workspace, 'createFileSystemWatcher').throws(new Error('Test error'));
            
            try {
                await companionGuard.initialize();
                expect.fail('Should have thrown an error');
            } catch (error) {
                expect(error).to.be.instanceOf(Error);
                expect(mockStatusBarItem.text).to.include('Init Failed');
            }
        });
    });

    describe('runChecks', () => {
        beforeEach(async () => {
            // Setup basic mocks for initialization
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
            
            await companionGuard.initialize();
        });

        it('should return cached result when checks are already running', async () => {
            const firstCall = companionGuard.runChecks();
            const secondCall = companionGuard.runChecks();

            const [firstResult, secondResult] = await Promise.all([firstCall, secondCall]);

            expect(firstResult).to.deep.equal(secondResult);
        });

        it('should run ESLint checks for TypeScript files', async () => {
            // Mock active editor with TypeScript file
            const mockDocument = TestUtils.createMockTextDocument(
                'const x: string = "test";',
                'typescript',
                '/test/file.ts'
            );
            const mockEditor = TestUtils.createMockTextEditor(mockDocument);
            sandbox.stub(vscode.window, 'activeTextEditor').value(mockEditor);

            // Mock file system
            sandbox.stub(require('fs'), 'existsSync').returns(true);
            sandbox.stub(require('fs'), 'readFileSync').returns('const x: string = "test";');
            sandbox.stub(require('fs'), 'statSync').returns({ mtime: new Date(), size: 100 });

            const result = await companionGuard.runChecks();

            expect(result).to.have.property('passed');
            expect(result).to.have.property('issues');
            expect(result).to.have.property('duration');
            expect(result.duration).to.be.a('number');
        });

        it('should run Python checks for Python files', async () => {
            // Mock active editor with Python file
            const mockDocument = TestUtils.createMockTextDocument(
                'def hello():\n    print("Hello")',
                'python',
                '/test/file.py'
            );
            const mockEditor = TestUtils.createMockTextEditor(mockDocument);
            sandbox.stub(vscode.window, 'activeTextEditor').value(mockEditor);

            // Mock file system
            sandbox.stub(require('fs'), 'existsSync').returns(true);
            sandbox.stub(require('fs'), 'readFileSync').returns('def hello():\n    print("Hello")');
            sandbox.stub(require('fs'), 'statSync').returns({ mtime: new Date(), size: 100 });

            const result = await companionGuard.runChecks();

            expect(result).to.have.property('passed');
            expect(result).to.have.property('issues');
            expect(result.duration).to.be.a('number');
        });

        it('should handle no active editor gracefully', async () => {
            sandbox.stub(vscode.window, 'activeTextEditor').value(undefined);

            const result = await companionGuard.runChecks();

            expect(result.passed).to.be.true;
            expect(result.issues).to.be.empty;
        });

        it('should use cached results for unchanged files', async () => {
            const mockDocument = TestUtils.createMockTextDocument(
                'const x: string = "test";',
                'typescript',
                '/test/file.ts'
            );
            const mockEditor = TestUtils.createMockTextEditor(mockDocument);
            sandbox.stub(vscode.window, 'activeTextEditor').value(mockEditor);

            // Mock file system with consistent hash
            sandbox.stub(require('fs'), 'existsSync').returns(true);
            sandbox.stub(require('fs'), 'readFileSync').returns('const x: string = "test";');
            sandbox.stub(require('fs'), 'statSync').returns({ mtime: new Date(2023, 1, 1), size: 100 });

            // First call
            const result1 = await companionGuard.runChecks();

            // Second call should use cache
            const result2 = await companionGuard.runChecks();

            expect(result1).to.deep.equal(result2);
        });

        it('should handle ESLint errors gracefully', async () => {
            const mockDocument = TestUtils.createMockTextDocument(
                'const x: string = "test";',
                'typescript',
                '/test/file.ts'
            );
            const mockEditor = TestUtils.createMockTextEditor(mockDocument);
            sandbox.stub(vscode.window, 'activeTextEditor').value(mockEditor);

            // Mock file system
            sandbox.stub(require('fs'), 'existsSync').returns(true);
            sandbox.stub(require('fs'), 'readFileSync').returns('const x: string = "test";');
            sandbox.stub(require('fs'), 'statSync').returns({ mtime: new Date(), size: 100 });

            // Mock ESLint to throw error
            const ESLint = require('eslint').ESLint;
            sandbox.stub(ESLint.prototype, 'lintFiles').rejects(new Error('ESLint error'));

            const result = await companionGuard.runChecks();

            expect(result.issues).to.have.length.greaterThan(0);
            expect(result.issues[0].severity).to.equal('warning');
            expect(result.issues[0].message).to.include('Linting failed');
        });

        it('should complete checks within performance threshold', async () => {
            const mockDocument = TestUtils.createMockTextDocument(
                'const x: string = "test";',
                'typescript',
                '/test/file.ts'
            );
            const mockEditor = TestUtils.createMockTextEditor(mockDocument);
            sandbox.stub(vscode.window, 'activeTextEditor').value(mockEditor);

            // Mock file system
            sandbox.stub(require('fs'), 'existsSync').returns(true);
            sandbox.stub(require('fs'), 'readFileSync').returns('const x: string = "test";');
            sandbox.stub(require('fs'), 'statSync').returns({ mtime: new Date(), size: 100 });

            const startTime = Date.now();
            const result = await companionGuard.runChecks();
            const elapsed = Date.now() - startTime;

            expect(elapsed).to.be.lessThan(1000); // Should complete within 1 second
            expect(result.duration).to.be.lessThan(1000);
        });

        it('should run checks for TypeScript files', async () => {
            // Mock active editor with TypeScript file
            const mockEditor = {
                document: {
                    uri: { fsPath: '/test/file.ts' },
                    languageId: 'typescript'
                }
            };
            sandbox.stub(vscode.window, 'activeTextEditor').value(mockEditor);
            
            // Mock ESLint and TSC methods
            sandbox.stub(companionGuard as any, 'runESLintDirect').resolves([]);
            sandbox.stub(companionGuard as any, 'runTSCDirect').resolves([]);
            sandbox.stub(companionGuard as any, 'runTests').resolves([]);
            
            const result = await companionGuard.runChecks();
            
            expect(result.passed).to.be.true;
            expect(result.issues).to.be.an('array');
            expect(result.duration).to.be.a('number');
        });

        it('should handle errors in checks gracefully', async () => {
            const mockEditor = {
                document: {
                    uri: { fsPath: '/test/file.ts' },
                    languageId: 'typescript'
                }
            };
            sandbox.stub(vscode.window, 'activeTextEditor').value(mockEditor);
            
            // Mock methods to throw errors
            sandbox.stub(companionGuard as any, 'runESLintDirect').rejects(new Error('ESLint error'));
            sandbox.stub(companionGuard as any, 'runTSCDirect').resolves([]);
            sandbox.stub(companionGuard as any, 'runTests').resolves([]);
            
            const result = await companionGuard.runChecks();
            
            expect(result.passed).to.be.false;
            expect(result.issues).to.have.length.greaterThan(0);
            expect(result.issues[0].message).to.include('Linting failed');
        });

        it('should skip checks when no active editor', async () => {
            sandbox.stub(vscode.window, 'activeTextEditor').value(undefined);
            
            const result = await companionGuard.runChecks();
            
            expect(result.passed).to.be.true;
            expect(result.issues).to.be.empty;
        });
    });

    describe('caching', () => {
        it('should cache results for files', async () => {
            const mockEditor = {
                document: {
                    uri: { fsPath: '/test/file.ts' },
                    languageId: 'typescript'
                }
            };
            sandbox.stub(vscode.window, 'activeTextEditor').value(mockEditor);
            
            // Mock file system
            const fs = require('fs');
            sandbox.stub(fs, 'readFileSync').returns('test content');
            sandbox.stub(fs, 'statSync').returns({ mtime: new Date() });
            
            // Mock check methods
            sandbox.stub(companionGuard as any, 'runESLintDirect').resolves([]);
            sandbox.stub(companionGuard as any, 'runTSCDirect').resolves([]);
            sandbox.stub(companionGuard as any, 'runTests').resolves([]);
            
            // Setup initialization
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
            await companionGuard.initialize();
            
            // First call should run checks
            const firstResult = await companionGuard.runChecks();
            
            // Second call should use cache
            const secondResult = await companionGuard.runChecks();
            
            expect(firstResult).to.deep.equal(secondResult);
        });
    });

    describe('debouncing', () => {
        it('should debounce file change events', (done) => {
            const debouncedMethod = (companionGuard as any).debouncedRunChecks;
            
            // Call multiple times quickly
            debouncedMethod();
            debouncedMethod();
            debouncedMethod();
            
            // Should only execute once after delay
            setTimeout(() => {
                // Test passes if no errors thrown
                done();
            }, 600); // Wait longer than debounce delay
        });
    });

    describe('disposal', () => {
        it('should clean up resources on disposal', () => {
            companionGuard.dispose();
            
            expect(mockStatusBarItem.dispose.called).to.be.true;
        });
    });
});
