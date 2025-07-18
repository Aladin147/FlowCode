import { expect } from 'chai';
import { describe, it, beforeEach, afterEach } from 'mocha';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SecurityCommands } from '../../commands/security-commands';
import { SecurityValidatorService, SecurityAuditResult } from '../../services/security-validator';
import { ConfigurationManager } from '../../utils/configuration-manager';
import { ToolManager } from '../../utils/tool-manager';
import { TestUtils } from '../TestUtils';

describe('SecurityCommands', () => {
    let securityCommands: SecurityCommands;
    let configManager: ConfigurationManager;
    let securityValidator: SecurityValidatorService;
    let toolManager: ToolManager;
    let sandbox: sinon.SinonSandbox;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        TestUtils.mockVSCodeAPI(sandbox);
        
        configManager = new ConfigurationManager();
        securityCommands = new SecurityCommands(configManager);
        securityValidator = (securityCommands as any).securityValidator;
        toolManager = (securityCommands as any).toolManager;
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('initialize', () => {
        it('should initialize successfully', async () => {
            sandbox.stub(securityValidator, 'initialize').resolves();
            
            await securityCommands.initialize();
            
            // Should not throw
        });

        it('should handle initialization errors', async () => {
            sandbox.stub(securityValidator, 'initialize').rejects(new Error('Init failed'));
            
            try {
                await securityCommands.initialize();
                expect.fail('Should have thrown error');
            } catch (error) {
                expect((error as Error).message).to.equal('Init failed');
            }
        });
    });

    describe('runSecurityAudit', () => {
        const mockAuditResult: SecurityAuditResult = {
            overallScore: 85,
            totalChecks: 10,
            passedChecks: 8,
            criticalIssues: 0,
            highIssues: 1,
            mediumIssues: 1,
            lowIssues: 0,
            results: [
                {
                    checkName: 'Test Check',
                    passed: true,
                    severity: 'low',
                    description: 'Test passed'
                }
            ],
            passed: true,
            riskLevel: 'medium',
            timestamp: Date.now(),
            recommendations: ['Fix high-severity issues'],
            metadata: {
                auditDuration: 5000,
                extensionVersion: 'FlowCode v0.1.0',
                toolsUsed: ['Semgrep']
            }
        };

        beforeEach(() => {
            // Mock workspace
            sandbox.stub(vscode.workspace, 'workspaceFolders').value([{
                uri: { fsPath: '/test/workspace' },
                name: 'test-workspace',
                index: 0
            }]);

            sandbox.stub(securityValidator, 'runSecurityAudit').resolves(mockAuditResult);
            sandbox.stub(toolManager, 'isToolAvailable').resolves(true);
        });

        it('should show error when no workspace folder', async () => {
            sandbox.stub(vscode.workspace, 'workspaceFolders').value(undefined);
            const showErrorStub = sandbox.stub(vscode.window, 'showErrorMessage');
            
            await securityCommands.runSecurityAudit();
            
            expect(showErrorStub.calledWith('No workspace folder found. Please open a folder to run security audit.')).to.be.true;
        });

        it('should run security audit successfully', async () => {
            const withProgressStub = sandbox.stub(vscode.window, 'withProgress');
            withProgressStub.callsFake(async (options, callback) => {
                const mockProgress = { report: sandbox.stub() };
                const mockToken = { onCancellationRequested: sandbox.stub() };
                return await callback(mockProgress, mockToken);
            });

            const showInfoStub = sandbox.stub(vscode.window, 'showInformationMessage');
            sandbox.stub(securityCommands as any, 'showSecurityReport').resolves();
            
            await securityCommands.runSecurityAudit();
            
            expect(withProgressStub.called).to.be.true;
            expect(showInfoStub.calledWith('✅ Security audit passed with score 85/100')).to.be.true;
        });

        it('should show warning for failed audit', async () => {
            const failedAuditResult = {
                ...mockAuditResult,
                passed: false,
                criticalIssues: 1,
                highIssues: 2
            };

            sandbox.stub(securityValidator, 'runSecurityAudit').resolves(failedAuditResult);

            const withProgressStub = sandbox.stub(vscode.window, 'withProgress');
            withProgressStub.callsFake(async (options, callback) => {
                const mockProgress = { report: sandbox.stub() };
                const mockToken = { onCancellationRequested: sandbox.stub() };
                return await callback(mockProgress, mockToken);
            });

            const showWarningStub = sandbox.stub(vscode.window, 'showWarningMessage');
            sandbox.stub(securityCommands as any, 'showSecurityReport').resolves();
            
            await securityCommands.runSecurityAudit();
            
            expect(showWarningStub.calledWith('⚠️ Security audit found issues: 1 critical, 2 high, 1 medium, 0 low', 'View Report')).to.be.true;
        });

        it('should offer to install Semgrep when not available', async () => {
            sandbox.stub(toolManager, 'isToolAvailable').resolves(false);
            const showWarningStub = sandbox.stub(vscode.window, 'showWarningMessage').resolves('Continue without Semgrep');

            const withProgressStub = sandbox.stub(vscode.window, 'withProgress');
            withProgressStub.callsFake(async (options, callback) => {
                const mockProgress = { report: sandbox.stub() };
                const mockToken = { onCancellationRequested: sandbox.stub() };
                return await callback(mockProgress, mockToken);
            });

            sandbox.stub(securityCommands as any, 'showSecurityReport').resolves();
            
            await securityCommands.runSecurityAudit();
            
            expect(showWarningStub.calledWith(
                'Semgrep is not installed. For comprehensive security scanning, it is recommended to install Semgrep.',
                'Install Semgrep',
                'Continue without Semgrep',
                'Cancel'
            )).to.be.true;
        });

        it('should install Semgrep when user chooses to', async () => {
            sandbox.stub(toolManager, 'isToolAvailable').resolves(false);
            sandbox.stub(vscode.window, 'showWarningMessage').resolves('Install Semgrep');
            
            const installSemgrepStub = sandbox.stub(securityCommands as any, 'installSemgrep').resolves(true);

            const withProgressStub = sandbox.stub(vscode.window, 'withProgress');
            withProgressStub.callsFake(async (options, callback) => {
                const mockProgress = { report: sandbox.stub() };
                const mockToken = { onCancellationRequested: sandbox.stub() };
                return await callback(mockProgress, mockToken);
            });

            sandbox.stub(securityCommands as any, 'showSecurityReport').resolves();
            
            await securityCommands.runSecurityAudit();
            
            expect(installSemgrepStub.called).to.be.true;
        });

        it('should cancel when user chooses to', async () => {
            sandbox.stub(toolManager, 'isToolAvailable').resolves(false);
            sandbox.stub(vscode.window, 'showWarningMessage').resolves('Cancel');

            const withProgressStub = sandbox.stub(vscode.window, 'withProgress');
            withProgressStub.callsFake(async (options, callback) => {
                const mockProgress = { report: sandbox.stub() };
                const mockToken = { onCancellationRequested: sandbox.stub() };
                return await callback(mockProgress, mockToken);
            });
            
            await securityCommands.runSecurityAudit();
            
            expect(withProgressStub.called).to.be.false;
        });

        it('should handle audit errors', async () => {
            sandbox.stub(securityValidator, 'runSecurityAudit').rejects(new Error('Audit failed'));

            const withProgressStub = sandbox.stub(vscode.window, 'withProgress');
            withProgressStub.callsFake(async (options, callback) => {
                const mockProgress = { report: sandbox.stub() };
                const mockToken = { onCancellationRequested: sandbox.stub() };
                return await callback(mockProgress, mockToken);
            });

            const showErrorStub = sandbox.stub(vscode.window, 'showErrorMessage');
            
            await securityCommands.runSecurityAudit();
            
            expect(showErrorStub.calledWith('Security audit failed: Audit failed')).to.be.true;
        });
    });

    describe('installSemgrep', () => {
        it('should install Semgrep successfully', async () => {
            sandbox.stub(toolManager, 'installTool').resolves(true);
            const showInfoStub = sandbox.stub(vscode.window, 'showInformationMessage');

            const withProgressStub = sandbox.stub(vscode.window, 'withProgress');
            withProgressStub.callsFake(async (options, callback) => {
                const mockProgress = { report: sandbox.stub() };
                const mockToken = { onCancellationRequested: sandbox.stub() };
                return await callback(mockProgress, mockToken);
            });
            
            const result = await (securityCommands as any).installSemgrep();
            
            expect(result).to.be.true;
            expect(showInfoStub.calledWith('Semgrep installed successfully')).to.be.true;
        });

        it('should handle installation failure', async () => {
            sandbox.stub(toolManager, 'installTool').resolves(false);
            const showErrorStub = sandbox.stub(vscode.window, 'showErrorMessage').resolves('Cancel');

            const withProgressStub = sandbox.stub(vscode.window, 'withProgress');
            withProgressStub.callsFake(async (options, callback) => {
                const mockProgress = { report: sandbox.stub() };
                const mockToken = { onCancellationRequested: sandbox.stub() };
                return await callback(mockProgress, mockToken);
            });
            
            const result = await (securityCommands as any).installSemgrep();
            
            expect(result).to.be.false;
            expect(showErrorStub.calledWith(
                'Failed to install Semgrep automatically. Would you like to open the installation guide?',
                'Open Installation Guide',
                'Cancel'
            )).to.be.true;
        });

        it('should open installation guide when requested', async () => {
            sandbox.stub(toolManager, 'installTool').resolves(false);
            sandbox.stub(vscode.window, 'showErrorMessage').resolves('Open Installation Guide');
            const openExternalStub = sandbox.stub(vscode.env, 'openExternal');

            const withProgressStub = sandbox.stub(vscode.window, 'withProgress');
            withProgressStub.callsFake(async (options, callback) => {
                const mockProgress = { report: sandbox.stub() };
                const mockToken = { onCancellationRequested: sandbox.stub() };
                return await callback(mockProgress, mockToken);
            });
            
            await (securityCommands as any).installSemgrep();
            
            expect(openExternalStub.called).to.be.true;
        });
    });

    describe('showSecurityReport', () => {
        const mockAuditResult: SecurityAuditResult = {
            overallScore: 85,
            totalChecks: 10,
            passedChecks: 8,
            criticalIssues: 0,
            highIssues: 1,
            mediumIssues: 1,
            lowIssues: 0,
            results: [],
            passed: true,
            riskLevel: 'medium',
            timestamp: Date.now(),
            recommendations: [],
            metadata: {
                auditDuration: 5000,
                extensionVersion: 'FlowCode v0.1.0',
                toolsUsed: []
            }
        };

        it('should create and show security report', async () => {
            sandbox.stub(securityValidator, 'generateSecurityReport').returns('# Security Report\n\nTest report content');
            sandbox.stub(os, 'tmpdir').returns('/tmp');
            sandbox.stub(fs, 'existsSync').returns(false);
            sandbox.stub(fs, 'mkdirSync');
            sandbox.stub(fs, 'writeFileSync');
            
            const openTextDocumentStub = sandbox.stub(vscode.workspace, 'openTextDocument').resolves({} as any);
            const showTextDocumentStub = sandbox.stub(vscode.window, 'showTextDocument').resolves({} as any);
            
            await (securityCommands as any).showSecurityReport(mockAuditResult);
            
            expect(openTextDocumentStub.called).to.be.true;
            expect(showTextDocumentStub.called).to.be.true;
        });

        it('should handle report creation errors', async () => {
            sandbox.stub(securityValidator, 'generateSecurityReport').throws(new Error('Report generation failed'));
            const showErrorStub = sandbox.stub(vscode.window, 'showErrorMessage');
            
            await (securityCommands as any).showSecurityReport(mockAuditResult);
            
            expect(showErrorStub.calledWith('Failed to show security report: Report generation failed')).to.be.true;
        });
    });

    describe('getWorkspaceRoot', () => {
        it('should return workspace root path', async () => {
            sandbox.stub(vscode.workspace, 'workspaceFolders').value([{
                uri: { fsPath: '/test/workspace' },
                name: 'test-workspace',
                index: 0
            }]);
            
            const result = await (securityCommands as any).getWorkspaceRoot();
            
            expect(result).to.equal('/test/workspace');
        });

        it('should return undefined when no workspace', async () => {
            sandbox.stub(vscode.workspace, 'workspaceFolders').value(undefined);
            
            const result = await (securityCommands as any).getWorkspaceRoot();
            
            expect(result).to.be.undefined;
        });

        it('should return undefined when empty workspace folders', async () => {
            sandbox.stub(vscode.workspace, 'workspaceFolders').value([]);
            
            const result = await (securityCommands as any).getWorkspaceRoot();
            
            expect(result).to.be.undefined;
        });
    });
});
