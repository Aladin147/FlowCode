import { expect } from 'chai';
import { describe, it, beforeEach, afterEach } from 'mocha';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { CompanionGuard } from '../../services/companion-guard';
import { ConfigurationManager } from '../../utils/configuration-manager';
import { TestUtils } from '../TestUtils';

describe('CompanionGuard Performance Benchmarks', () => {
    let companionGuard: CompanionGuard;
    let configManager: ConfigurationManager;
    let sandbox: sinon.SinonSandbox;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        TestUtils.mockVSCodeAPI(sandbox);
        
        // Mock status bar item
        const mockStatusBarItem = {
            text: '',
            tooltip: '',
            backgroundColor: undefined,
            show: sandbox.stub(),
            dispose: sandbox.stub()
        };
        sandbox.stub(vscode.window, 'createStatusBarItem').returns(mockStatusBarItem);
        
        configManager = new ConfigurationManager();
        companionGuard = new CompanionGuard(configManager);
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('initialization performance', () => {
        it('should initialize within 100ms', async () => {
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
            
            const startTime = Date.now();
            await companionGuard.initialize();
            const duration = Date.now() - startTime;
            
            expect(duration).to.be.lessThan(100);
        });
    });

    describe('check execution performance', () => {
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

        it('should complete checks within 500ms for small files', async () => {
            const mockEditor = {
                document: {
                    uri: { fsPath: '/test/small-file.ts' },
                    languageId: 'typescript'
                }
            };
            sandbox.stub(vscode.window, 'activeTextEditor').value(mockEditor);
            
            // Mock fast ESLint and TSC responses
            sandbox.stub(companionGuard as any, 'runESLintDirect').resolves([]);
            sandbox.stub(companionGuard as any, 'runTSCDirect').resolves([]);
            sandbox.stub(companionGuard as any, 'runTests').resolves([]);
            
            const startTime = Date.now();
            const result = await companionGuard.runChecks();
            const duration = Date.now() - startTime;
            
            expect(duration).to.be.lessThan(500);
            expect(result.duration).to.be.lessThan(500);
        });

        it('should handle large files within 2 seconds', async () => {
            const mockEditor = {
                document: {
                    uri: { fsPath: '/test/large-file.ts' },
                    languageId: 'typescript'
                }
            };
            sandbox.stub(vscode.window, 'activeTextEditor').value(mockEditor);
            
            // Mock slower responses for large files
            sandbox.stub(companionGuard as any, 'runESLintDirect').callsFake(async () => {
                await new Promise(resolve => setTimeout(resolve, 800)); // Simulate 800ms
                return [];
            });
            sandbox.stub(companionGuard as any, 'runTSCDirect').callsFake(async () => {
                await new Promise(resolve => setTimeout(resolve, 600)); // Simulate 600ms
                return [];
            });
            sandbox.stub(companionGuard as any, 'runTests').resolves([]);
            
            const startTime = Date.now();
            const result = await companionGuard.runChecks();
            const duration = Date.now() - startTime;
            
            expect(duration).to.be.lessThan(2000);
            expect(result.duration).to.be.lessThan(2000);
        });

        it('should benefit from caching on repeated calls', async () => {
            const mockEditor = {
                document: {
                    uri: { fsPath: '/test/cached-file.ts' },
                    languageId: 'typescript'
                }
            };
            sandbox.stub(vscode.window, 'activeTextEditor').value(mockEditor);
            
            // Mock file system for caching
            const fs = require('fs');
            sandbox.stub(fs, 'readFileSync').returns('test content');
            sandbox.stub(fs, 'statSync').returns({ mtime: new Date() });
            
            // Mock check methods
            sandbox.stub(companionGuard as any, 'runESLintDirect').resolves([]);
            sandbox.stub(companionGuard as any, 'runTSCDirect').resolves([]);
            sandbox.stub(companionGuard as any, 'runTests').resolves([]);
            
            // First call (should be slower)
            const firstStart = Date.now();
            await companionGuard.runChecks();
            const firstDuration = Date.now() - firstStart;
            
            // Second call (should be faster due to caching)
            const secondStart = Date.now();
            await companionGuard.runChecks();
            const secondDuration = Date.now() - secondStart;
            
            expect(secondDuration).to.be.lessThan(firstDuration);
            expect(secondDuration).to.be.lessThan(50); // Should be very fast from cache
        });

        it('should handle concurrent check requests efficiently', async () => {
            const mockEditor = {
                document: {
                    uri: { fsPath: '/test/concurrent-file.ts' },
                    languageId: 'typescript'
                }
            };
            sandbox.stub(vscode.window, 'activeTextEditor').value(mockEditor);
            
            // Mock check methods
            sandbox.stub(companionGuard as any, 'runESLintDirect').resolves([]);
            sandbox.stub(companionGuard as any, 'runTSCDirect').resolves([]);
            sandbox.stub(companionGuard as any, 'runTests').resolves([]);
            
            // Make multiple concurrent requests
            const startTime = Date.now();
            const promises = Array(5).fill(0).map(() => companionGuard.runChecks());
            const results = await Promise.all(promises);
            const totalDuration = Date.now() - startTime;
            
            // All results should be identical (from the same execution)
            expect(results.every(r => r === results[0])).to.be.true;
            
            // Total time should not be much more than a single execution
            expect(totalDuration).to.be.lessThan(1000);
        });
    });

    describe('debouncing performance', () => {
        it('should effectively debounce rapid file changes', (done) => {
            let executionCount = 0;
            const originalRunChecks = companionGuard.runChecks.bind(companionGuard);
            
            // Override runChecks to count executions
            (companionGuard as any).runChecks = async () => {
                executionCount++;
                return { passed: true, issues: [], duration: 0 };
            };
            
            const debouncedMethod = (companionGuard as any).debouncedRunChecks;
            
            // Trigger multiple rapid calls
            for (let i = 0; i < 10; i++) {
                debouncedMethod();
            }
            
            // Check after debounce delay
            setTimeout(() => {
                expect(executionCount).to.equal(1); // Should only execute once
                done();
            }, 600); // Wait longer than debounce delay (500ms)
        });
    });

    describe('memory usage', () => {
        it('should not leak memory with cache cleanup', async () => {
            const mockEditor = {
                document: {
                    uri: { fsPath: '/test/memory-test.ts' },
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
            
            // Fill cache with many entries
            for (let i = 0; i < 100; i++) {
                mockEditor.document.uri.fsPath = `/test/file-${i}.ts`;
                await companionGuard.runChecks();
            }
            
            const cacheSize = (companionGuard as any).resultCache.size;
            
            // Cache should not grow indefinitely
            expect(cacheSize).to.be.lessThan(100);
        });

        it('should clean up resources on disposal', () => {
            const initialCacheSize = (companionGuard as any).resultCache.size;
            
            companionGuard.dispose();
            
            const finalCacheSize = (companionGuard as any).resultCache.size;
            expect(finalCacheSize).to.equal(0);
        });
    });

    describe('stress testing', () => {
        it('should handle rapid successive calls without degradation', async () => {
            const mockEditor = {
                document: {
                    uri: { fsPath: '/test/stress-test.ts' },
                    languageId: 'typescript'
                }
            };
            sandbox.stub(vscode.window, 'activeTextEditor').value(mockEditor);
            
            // Mock check methods with consistent timing
            sandbox.stub(companionGuard as any, 'runESLintDirect').callsFake(async () => {
                await new Promise(resolve => setTimeout(resolve, 50));
                return [];
            });
            sandbox.stub(companionGuard as any, 'runTSCDirect').callsFake(async () => {
                await new Promise(resolve => setTimeout(resolve, 50));
                return [];
            });
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
            
            const durations: number[] = [];
            
            // Make 20 successive calls
            for (let i = 0; i < 20; i++) {
                const startTime = Date.now();
                await companionGuard.runChecks();
                durations.push(Date.now() - startTime);
            }
            
            // Performance should not degrade significantly
            const firstFive = durations.slice(0, 5);
            const lastFive = durations.slice(-5);
            
            const avgFirst = firstFive.reduce((a, b) => a + b) / firstFive.length;
            const avgLast = lastFive.reduce((a, b) => a + b) / lastFive.length;
            
            // Last calls should not be more than 50% slower than first calls
            expect(avgLast).to.be.lessThan(avgFirst * 1.5);
        });
    });
});
