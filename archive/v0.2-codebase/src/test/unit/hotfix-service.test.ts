import { expect } from 'chai';
import { describe, it, beforeEach, afterEach } from 'mocha';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import * as fs from 'fs';
import { HotfixService, HotfixRecord } from '../../services/hotfix-service';
import { ConfigurationManager } from '../../utils/configuration-manager';
import { TestUtils } from '../TestUtils';

describe('HotfixService', () => {
    let hotfixService: HotfixService;
    let configManager: ConfigurationManager;
    let sandbox: sinon.SinonSandbox;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        TestUtils.mockVSCodeAPI(sandbox);
        
        configManager = new ConfigurationManager();
        hotfixService = new HotfixService(configManager);
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('createHotfix', () => {
        beforeEach(() => {
            // Mock git operations
            sandbox.stub(hotfixService as any, 'getCurrentBranch').resolves('main');
            sandbox.stub(hotfixService as any, 'getChangedFiles').resolves(['file1.ts', 'file2.ts']);
            sandbox.stub(hotfixService as any, 'createBranch').resolves();
            sandbox.stub(hotfixService as any, 'saveHotfixRecord').resolves();
            
            // Mock VS Code input
            sandbox.stub(vscode.window, 'showInputBox').resolves('Test hotfix message');
            sandbox.stub(vscode.window, 'showQuickPick').resolves(['eslint', 'tests']);
            sandbox.stub(vscode.window, 'showInformationMessage').resolves();
        });

        it('should create hotfix with proper record', async () => {
            const saveStub = sandbox.stub(hotfixService as any, 'saveHotfixRecord');
            
            await hotfixService.createHotfix();

            expect(saveStub.called).to.be.true;
            const record: HotfixRecord = saveStub.getCall(0).args[0];
            
            expect(record.message).to.equal('Test hotfix message');
            expect(record.status).to.equal('pending');
            expect(record.priority).to.be.oneOf(['low', 'medium', 'high', 'critical']);
            expect(record.files).to.deep.equal(['file1.ts', 'file2.ts']);
            expect(record.skippedChecks).to.deep.equal(['eslint', 'tests']);
            expect(record.slaDeadline).to.be.a('string');
        });

        it('should determine priority based on message content', async () => {
            const testCases = [
                { message: 'security vulnerability fix', expectedPriority: 'critical' },
                { message: 'production outage fix', expectedPriority: 'high' },
                { message: 'minor bug fix', expectedPriority: 'low' }
            ];

            for (const testCase of testCases) {
                sandbox.stub(vscode.window, 'showInputBox').resolves(testCase.message);
                
                const priority = (hotfixService as any).determinePriority(testCase.message, ['file.ts']);
                expect(priority).to.equal(testCase.expectedPriority);
            }
        });

        it('should handle user cancellation gracefully', async () => {
            sandbox.stub(vscode.window, 'showInputBox').resolves(undefined);
            
            // Should not throw an error
            await hotfixService.createHotfix();
            
            // Verify no record was saved
            const saveStub = sandbox.stub(hotfixService as any, 'saveHotfixRecord');
            expect(saveStub.called).to.be.false;
        });

        it('should handle git errors gracefully', async () => {
            sandbox.stub(hotfixService as any, 'createBranch').rejects(new Error('Git error'));
            
            try {
                await hotfixService.createHotfix();
                expect.fail('Should have thrown an error');
            } catch (error) {
                expect((error as Error).message).to.include('Failed to create hotfix');
            }
        });
    });

    describe('getPendingHotfixes', () => {
        it('should return empty array when no debt file exists', async () => {
            sandbox.stub(configManager, 'getDebtFilePath').resolves('/test/debt.json');
            sandbox.stub(fs, 'existsSync').returns(false);
            
            const result = await hotfixService.getPendingHotfixes();
            
            expect(result).to.be.an('array');
            expect(result).to.be.empty;
        });

        it('should load and update hotfix records', async () => {
            const mockRecords: HotfixRecord[] = [
                {
                    id: 'hotfix-1',
                    message: 'Test hotfix',
                    timestamp: new Date(Date.now() - 50 * 60 * 60 * 1000).toISOString(), // 50 hours ago
                    branch: 'hotfix/test',
                    files: ['file.ts'],
                    skippedChecks: [],
                    status: 'pending',
                    priority: 'medium',
                    slaDeadline: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() // 2 hours ago (overdue)
                }
            ];

            sandbox.stub(configManager, 'getDebtFilePath').resolves('/test/debt.json');
            sandbox.stub(fs, 'existsSync').returns(true);
            sandbox.stub(fs, 'readFileSync').returns(JSON.stringify(mockRecords));
            
            const result = await hotfixService.getPendingHotfixes();
            
            expect(result).to.be.an('array');
            expect(result).to.have.length(1);
            expect(result[0].status).to.equal('overdue');
        });

        it('should notify about critical overdue items', async () => {
            const mockRecords: HotfixRecord[] = [
                {
                    id: 'hotfix-critical',
                    message: 'Critical security fix',
                    timestamp: new Date().toISOString(),
                    branch: 'hotfix/security',
                    files: ['auth.ts'],
                    skippedChecks: [],
                    status: 'overdue',
                    priority: 'critical',
                    slaDeadline: new Date(Date.now() - 1000).toISOString()
                }
            ];

            sandbox.stub(configManager, 'getDebtFilePath').resolves('/test/debt.json');
            sandbox.stub(fs, 'existsSync').returns(true);
            sandbox.stub(fs, 'readFileSync').returns(JSON.stringify(mockRecords));
            
            const showWarningStub = sandbox.stub(vscode.window, 'showWarningMessage').resolves();
            
            await hotfixService.getPendingHotfixes();
            
            expect(showWarningStub.called).to.be.true;
            expect(showWarningStub.getCall(0).args[0]).to.include('critical hotfix');
        });

        it('should handle file read errors gracefully', async () => {
            sandbox.stub(configManager, 'getDebtFilePath').resolves('/test/debt.json');
            sandbox.stub(fs, 'existsSync').returns(true);
            sandbox.stub(fs, 'readFileSync').throws(new Error('Read error'));
            
            const result = await hotfixService.getPendingHotfixes();
            
            expect(result).to.be.an('array');
            expect(result).to.be.empty;
        });
    });

    describe('SLA calculations', () => {
        it('should calculate SLA status correctly', () => {
            const now = new Date();
            const testCases = [
                {
                    deadline: new Date(now.getTime() + 10 * 60 * 60 * 1000), // 10 hours from now
                    expectedUrgency: 'normal'
                },
                {
                    deadline: new Date(now.getTime() + 2 * 60 * 60 * 1000), // 2 hours from now
                    expectedUrgency: 'warning'
                },
                {
                    deadline: new Date(now.getTime() + 30 * 60 * 1000), // 30 minutes from now
                    expectedUrgency: 'critical'
                },
                {
                    deadline: new Date(now.getTime() - 60 * 60 * 1000), // 1 hour ago
                    expectedUrgency: 'overdue'
                }
            ];

            for (const testCase of testCases) {
                const record: HotfixRecord = {
                    id: 'test',
                    message: 'test',
                    timestamp: now.toISOString(),
                    branch: 'test',
                    files: [],
                    skippedChecks: [],
                    status: 'pending',
                    priority: 'medium',
                    slaDeadline: testCase.deadline.toISOString()
                };

                const slaStatus = (hotfixService as any).calculateSLAStatus(record);
                expect(slaStatus.urgencyLevel).to.equal(testCase.expectedUrgency);
                expect(slaStatus.isOverdue).to.equal(testCase.expectedUrgency === 'overdue');
            }
        });
    });

    describe('priority determination', () => {
        it('should assign critical priority for security issues', () => {
            const securityMessages = [
                'Fix security vulnerability in auth',
                'Patch SQL injection vulnerability',
                'Security breach response'
            ];

            for (const message of securityMessages) {
                const priority = (hotfixService as any).determinePriority(message, ['file.ts']);
                expect(priority).to.equal('critical');
            }
        });

        it('should assign high priority for production issues', () => {
            const productionMessages = [
                'Fix production outage',
                'Resolve crash in payment system',
                'Fix data loss bug'
            ];

            for (const message of productionMessages) {
                const priority = (hotfixService as any).determinePriority(message, ['file.ts']);
                expect(priority).to.equal('high');
            }
        });

        it('should consider file types for priority', () => {
            const criticalFiles = ['auth.ts', 'security.js', 'payment.py', 'database.sql'];
            
            for (const file of criticalFiles) {
                const priority = (hotfixService as any).determinePriority('Minor fix', [file]);
                expect(priority).to.equal('high');
            }
        });

        it('should assign medium priority for multiple files', () => {
            const manyFiles = Array(10).fill(0).map((_, i) => `file${i}.ts`);
            const priority = (hotfixService as any).determinePriority('Update multiple files', manyFiles);
            expect(priority).to.equal('medium');
        });

        it('should default to low priority', () => {
            const priority = (hotfixService as any).determinePriority('Minor bug fix', ['file.ts']);
            expect(priority).to.equal('low');
        });
    });

    describe('hotfix resolution', () => {
        it('should resolve hotfix and update record', async () => {
            const mockRecords: HotfixRecord[] = [
                {
                    id: 'hotfix-1',
                    message: 'Test hotfix',
                    timestamp: new Date().toISOString(),
                    branch: 'hotfix/test',
                    files: ['file.ts'],
                    skippedChecks: [],
                    status: 'pending',
                    priority: 'medium',
                    slaDeadline: new Date().toISOString()
                }
            ];

            sandbox.stub(hotfixService, 'getPendingHotfixes').resolves(mockRecords);
            const saveStub = sandbox.stub(hotfixService as any, 'saveHotfixRecords').resolves();
            sandbox.stub(vscode.window, 'showInformationMessage').resolves();

            await (hotfixService as any).resolveHotfix('hotfix-1', 'merged');

            expect(saveStub.called).to.be.true;
            const updatedRecords = saveStub.getCall(0).args[0];
            expect(updatedRecords[0].status).to.equal('resolved');
            expect(updatedRecords[0].resolution).to.exist;
            expect(updatedRecords[0].resolution.method).to.equal('merged');
        });

        it('should handle non-existent hotfix gracefully', async () => {
            sandbox.stub(hotfixService, 'getPendingHotfixes').resolves([]);
            sandbox.stub(vscode.window, 'showErrorMessage').resolves();

            try {
                await (hotfixService as any).resolveHotfix('non-existent', 'merged');
                expect.fail('Should have thrown an error');
            } catch (error) {
                expect((error as Error).message).to.include('Hotfix not found');
            }
        });
    });

    describe('dashboard generation', () => {
        it('should generate valid HTML dashboard', () => {
            const mockRecords: HotfixRecord[] = [
                {
                    id: 'hotfix-1',
                    message: 'Test hotfix',
                    timestamp: new Date().toISOString(),
                    branch: 'hotfix/test',
                    files: ['file.ts'],
                    skippedChecks: [],
                    status: 'pending',
                    priority: 'high',
                    slaDeadline: new Date(Date.now() + 10 * 60 * 60 * 1000).toISOString()
                }
            ];

            const html = (hotfixService as any).generateDashboardHTML(mockRecords);

            expect(html).to.include('<!DOCTYPE html>');
            expect(html).to.include('Hotfix Debt Dashboard');
            expect(html).to.include('Test hotfix');
            expect(html).to.include('hotfix-1');
            expect(html).to.include('priority-high');
        });
    });
});
