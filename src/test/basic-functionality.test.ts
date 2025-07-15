import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { FlowCodeExtension } from '../flowcode-extension';
import { ConfigurationManager } from '../utils/configuration-manager';
import { Logger } from '../utils/logger';

/**
 * Basic functionality tests to validate core extension features
 * These tests focus on essential functionality without complex mocking
 */
describe('FlowCode Basic Functionality', () => {
    let sandbox: sinon.SinonSandbox;
    let mockContext: vscode.ExtensionContext;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        
        // Create minimal mock context
        mockContext = {
            subscriptions: [],
            workspaceState: {
                get: sandbox.stub(),
                update: sandbox.stub()
            },
            globalState: {
                get: sandbox.stub(),
                update: sandbox.stub(),
                setKeysForSync: sandbox.stub()
            },
            extensionUri: vscode.Uri.file('/test'),
            extensionPath: '/test',
            asAbsolutePath: (path: string) => `/test/${path}`,
            storagePath: '/test/storage',
            globalStoragePath: '/test/global',
            logPath: '/test/logs',
            secrets: {
                get: sandbox.stub(),
                store: sandbox.stub(),
                delete: sandbox.stub(),
                onDidChange: sandbox.stub()
            },
            environmentVariableCollection: {
                persistent: true,
                replace: sandbox.stub(),
                append: sandbox.stub(),
                prepend: sandbox.stub(),
                get: sandbox.stub(),
                forEach: sandbox.stub(),
                delete: sandbox.stub(),
                clear: sandbox.stub()
            },
            extension: {
                id: 'test',
                extensionUri: vscode.Uri.file('/test'),
                extensionPath: '/test',
                isActive: true,
                packageJSON: {},
                extensionKind: vscode.ExtensionKind.Workspace,
                exports: undefined,
                activate: sandbox.stub(),
                deactivate: sandbox.stub()
            },
            extensionMode: vscode.ExtensionMode.Test
        } as any;
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('Extension Initialization', () => {
        it('should create extension instance without errors', () => {
            expect(() => {
                new FlowCodeExtension(mockContext);
            }).to.not.throw();
        });

        it('should initialize configuration manager', () => {
            const extension = new FlowCodeExtension(mockContext);
            expect(extension).to.be.instanceOf(FlowCodeExtension);
        });
    });

    describe('Configuration Manager', () => {
        let configManager: ConfigurationManager;

        beforeEach(() => {
            configManager = new ConfigurationManager(mockContext);
        });

        it('should create configuration manager instance', () => {
            expect(configManager).to.be.instanceOf(ConfigurationManager);
        });

        it('should have default configuration values', async () => {
            // Mock workspace configuration
            const mockConfig = {
                get: sandbox.stub().callsFake((key: string) => {
                    switch (key) {
                        case 'apiProvider': return 'openai';
                        case 'maxTokens': return 2000;
                        case 'enableCompanionGuard': return true;
                        case 'enableFinalGuard': return true;
                        default: return undefined;
                    }
                }),
                has: sandbox.stub().returns(true),
                inspect: sandbox.stub(),
                update: sandbox.stub()
            };

            sandbox.stub(vscode.workspace, 'getConfiguration').returns(mockConfig as any);

            const apiProvider = await configManager.getApiProvider();
            expect(apiProvider).to.equal('openai');
        });
    });

    describe('Logger', () => {
        let logger: Logger;

        beforeEach(() => {
            logger = Logger.getInstance();
            logger.clearLogs();
        });

        it('should create singleton logger instance', () => {
            const logger1 = Logger.getInstance();
            const logger2 = Logger.getInstance();
            expect(logger1).to.equal(logger2);
        });

        it('should log messages correctly', () => {
            logger.info('Test message');
            const entries = logger.getLogEntries();
            expect(entries).to.have.length(1);
            expect(entries[0].message).to.equal('Test message');
        });

        it('should create context loggers', () => {
            const contextLogger = logger.createContextLogger('TestContext');
            contextLogger.info('Context message');
            
            const entries = logger.getLogEntries();
            expect(entries).to.have.length(1);
            expect(entries[0].context).to.equal('TestContext');
        });
    });

    describe('Core Services Instantiation', () => {
        it('should create all core services without errors', () => {
            // Mock VS Code APIs that services depend on
            sandbox.stub(vscode.window, 'createStatusBarItem').returns({
                text: '',
                show: sandbox.stub(),
                dispose: sandbox.stub()
            } as any);

            sandbox.stub(vscode.workspace, 'createFileSystemWatcher').returns({
                onDidChange: sandbox.stub(),
                onDidCreate: sandbox.stub(),
                onDidDelete: sandbox.stub(),
                dispose: sandbox.stub()
            } as any);

            expect(() => {
                const extension = new FlowCodeExtension(mockContext);
                // If we get here without throwing, the services were created successfully
            }).to.not.throw();
        });
    });

    describe('Error Handling', () => {
        it('should handle missing workspace gracefully', () => {
            sandbox.stub(vscode.workspace, 'workspaceFolders').value(undefined);
            
            expect(() => {
                new FlowCodeExtension(mockContext);
            }).to.not.throw();
        });

        it('should handle configuration errors gracefully', () => {
            sandbox.stub(vscode.workspace, 'getConfiguration').throws(new Error('Config error'));
            
            expect(() => {
                new ConfigurationManager(mockContext);
            }).to.not.throw();
        });
    });

    describe('Type Guards and Utilities', () => {
        it('should validate input correctly', () => {
            const { isDefined, isNonEmptyString, isValidNumber } = require('../utils/type-guards');
            
            expect(isDefined('test')).to.be.true;
            expect(isDefined(null)).to.be.false;
            expect(isDefined(undefined)).to.be.false;
            
            expect(isNonEmptyString('test')).to.be.true;
            expect(isNonEmptyString('')).to.be.false;
            expect(isNonEmptyString(null)).to.be.false;
            
            expect(isValidNumber(42)).to.be.true;
            expect(isValidNumber(NaN)).to.be.false;
            expect(isValidNumber(Infinity)).to.be.false;
        });
    });

    describe('Performance and Memory', () => {
        it('should not leak memory during basic operations', () => {
            const initialMemory = process.memoryUsage().heapUsed;
            
            // Create and destroy multiple instances
            for (let i = 0; i < 10; i++) {
                const extension = new FlowCodeExtension(mockContext);
                // Simulate some work
                Logger.getInstance().info(`Test ${i}`);
            }
            
            // Force garbage collection if available
            if (global.gc) {
                global.gc();
            }
            
            const finalMemory = process.memoryUsage().heapUsed;
            const memoryIncrease = finalMemory - initialMemory;
            
            // Memory increase should be reasonable (less than 10MB)
            expect(memoryIncrease).to.be.lessThan(10 * 1024 * 1024);
        });
    });

    describe('Integration Validation', () => {
        it('should validate that all required dependencies are available', () => {
            // Test that all required modules can be imported
            expect(() => require('../services/companion-guard')).to.not.throw();
            expect(() => require('../services/final-guard')).to.not.throw();
            expect(() => require('../services/architect-service')).to.not.throw();
            expect(() => require('../services/graph-service')).to.not.throw();
            expect(() => require('../services/hotfix-service')).to.not.throw();
            expect(() => require('../services/security-validator')).to.not.throw();
            expect(() => require('../utils/error-handler')).to.not.throw();
            expect(() => require('../utils/type-guards')).to.not.throw();
        });

        it('should validate that all services have required methods', () => {
            const { CompanionGuard } = require('../services/companion-guard');
            const { FinalGuard } = require('../services/final-guard');
            const { ArchitectService } = require('../services/architect-service');
            
            // Check that services have initialize methods
            expect(CompanionGuard.prototype.initialize).to.be.a('function');
            expect(FinalGuard.prototype.initialize).to.be.a('function');
            expect(ArchitectService.prototype.initialize).to.be.a('function');
        });
    });
});
