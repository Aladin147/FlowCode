import { expect } from 'chai';
import { describe, it, beforeEach, afterEach } from 'mocha';
import * as sinon from 'sinon';
import * as fs from 'fs';
import * as path from 'path';
import { SecurityValidatorService, SecurityCheckResult, SecurityAuditResult } from '../../services/security-validator';
import { ConfigurationManager } from '../../utils/configuration-manager';
import { ToolManager } from '../../utils/tool-manager';
import { TestUtils } from '../TestUtils';

describe('SecurityValidatorService', () => {
    let securityValidator: SecurityValidatorService;
    let configManager: ConfigurationManager;
    let toolManager: ToolManager;
    let sandbox: sinon.SinonSandbox;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        TestUtils.mockVSCodeAPI(sandbox);
        
        configManager = new ConfigurationManager();
        securityValidator = new SecurityValidatorService(configManager);
        toolManager = new ToolManager();
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('initialize', () => {
        it('should initialize successfully', async () => {
            sandbox.stub(securityValidator as any, 'checkSecurityTools').resolves();
            
            await securityValidator.initialize();
            
            // Should not throw
        });

        it('should handle initialization errors', async () => {
            sandbox.stub(securityValidator as any, 'checkSecurityTools').rejects(new Error('Tool check failed'));
            
            try {
                await securityValidator.initialize();
                expect.fail('Should have thrown error');
            } catch (error) {
                expect((error as Error).message).to.equal('Tool check failed');
            }
        });
    });

    describe('runSecurityAudit', () => {
        const testWorkspaceRoot = '/test/workspace';

        beforeEach(() => {
            // Mock all security check methods
            sandbox.stub(securityValidator as any, 'checkApiKeyStorage').resolves({
                checkName: 'API Key Storage',
                passed: true,
                severity: 'medium',
                description: 'API key storage is secure'
            } as SecurityCheckResult);

            sandbox.stub(securityValidator as any, 'checkInputValidation').resolves({
                checkName: 'Input Validation',
                passed: true,
                severity: 'high',
                description: 'Input validation is properly implemented'
            } as SecurityCheckResult);

            sandbox.stub(securityValidator as any, 'checkFilePermissions').resolves({
                checkName: 'File Permissions',
                passed: true,
                severity: 'medium',
                description: 'File permissions are properly configured'
            } as SecurityCheckResult);

            sandbox.stub(securityValidator as any, 'checkDependencyVulnerabilities').resolves({
                checkName: 'Dependency Vulnerabilities',
                passed: true,
                severity: 'medium',
                description: 'No obvious dependency vulnerabilities detected'
            } as SecurityCheckResult);

            sandbox.stub(securityValidator as any, 'runSemgrepScan').resolves({
                checkName: 'Semgrep Security Scan',
                passed: true,
                severity: 'high',
                description: 'Semgrep scan passed'
            } as SecurityCheckResult);

            sandbox.stub(securityValidator as any, 'runSecretScan').resolves({
                checkName: 'Secret Scan',
                passed: true,
                severity: 'critical',
                description: 'No secrets detected in codebase'
            } as SecurityCheckResult);
        });

        it('should run comprehensive security audit successfully', async () => {
            const result = await securityValidator.runSecurityAudit(testWorkspaceRoot);
            
            expect(result).to.be.an('object');
            expect(result.overallScore).to.be.a('number');
            expect(result.totalChecks).to.be.greaterThan(0);
            expect(result.results).to.be.an('array');
            expect(result.passed).to.be.a('boolean');
            expect(result.riskLevel).to.be.oneOf(['low', 'medium', 'high', 'critical']);
            expect(result.timestamp).to.be.a('number');
            expect(result.recommendations).to.be.an('array');
            expect(result.metadata).to.be.an('object');
            expect(result.metadata.toolsUsed).to.be.an('array');
        });

        it('should calculate correct overall score for all passing checks', async () => {
            const result = await securityValidator.runSecurityAudit(testWorkspaceRoot);
            
            expect(result.overallScore).to.equal(100);
            expect(result.criticalIssues).to.equal(0);
            expect(result.highIssues).to.equal(0);
            expect(result.mediumIssues).to.equal(0);
            expect(result.lowIssues).to.equal(0);
            expect(result.passed).to.be.true;
            expect(result.riskLevel).to.equal('low');
        });

        it('should calculate correct overall score with critical issues', async () => {
            // Mock a critical failure
            sandbox.restore();
            sandbox = sinon.createSandbox();
            TestUtils.mockVSCodeAPI(sandbox);
            
            sandbox.stub(securityValidator as any, 'checkApiKeyStorage').resolves({
                checkName: 'API Key Storage',
                passed: false,
                severity: 'critical',
                description: 'Critical security issue'
            } as SecurityCheckResult);

            // Mock other checks as passing
            const passingCheck = {
                checkName: 'Test Check',
                passed: true,
                severity: 'low',
                description: 'Test passed'
            } as SecurityCheckResult;

            sandbox.stub(securityValidator as any, 'checkInputValidation').resolves(passingCheck);
            sandbox.stub(securityValidator as any, 'checkFilePermissions').resolves(passingCheck);
            sandbox.stub(securityValidator as any, 'checkDependencyVulnerabilities').resolves(passingCheck);
            sandbox.stub(securityValidator as any, 'runSemgrepScan').resolves(null);
            sandbox.stub(securityValidator as any, 'runSecretScan').resolves(null);

            const result = await securityValidator.runSecurityAudit(testWorkspaceRoot);
            
            expect(result.overallScore).to.equal(60); // 100 - (1 * 40)
            expect(result.criticalIssues).to.equal(1);
            expect(result.passed).to.be.false;
            expect(result.riskLevel).to.equal('critical');
        });

        it('should handle audit errors gracefully', async () => {
            sandbox.stub(securityValidator as any, 'checkApiKeyStorage').rejects(new Error('Check failed'));
            
            try {
                await securityValidator.runSecurityAudit(testWorkspaceRoot);
                expect.fail('Should have thrown error');
            } catch (error) {
                expect((error as Error).message).to.equal('Check failed');
            }
        });
    });

    describe('scanForSecrets', () => {
        const testWorkspaceRoot = '/test/workspace';

        beforeEach(() => {
            // Mock file system operations
            sandbox.stub(fs, 'readdirSync').returns([
                { name: 'test.js', isFile: () => true, isDirectory: () => false },
                { name: 'config.json', isFile: () => true, isDirectory: () => false }
            ] as any);
        });

        it('should detect API keys in files', async () => {
            sandbox.stub(fs, 'readFileSync').returns('const apiKey = "sk-1234567890abcdef1234567890abcdef";');
            
            const result = await (securityValidator as any).scanForSecrets(testWorkspaceRoot);
            
            expect(result.found).to.be.true;
            expect(result.secrets).to.have.length.greaterThan(0);
            expect(result.secrets[0].type).to.equal('OpenAI API Key');
            expect(result.secrets[0].confidence).to.equal('high');
        });

        it('should return no secrets for clean files', async () => {
            sandbox.stub(fs, 'readFileSync').returns('const message = "Hello, world!";');
            
            const result = await (securityValidator as any).scanForSecrets(testWorkspaceRoot);
            
            expect(result.found).to.be.false;
            expect(result.secrets).to.have.length(0);
        });

        it('should handle file read errors gracefully', async () => {
            sandbox.stub(fs, 'readFileSync').throws(new Error('File read error'));
            
            const result = await (securityValidator as any).scanForSecrets(testWorkspaceRoot);
            
            // Should not throw, but return empty results
            expect(result.found).to.be.false;
            expect(result.secrets).to.have.length(0);
        });
    });

    describe('generateSecurityReport', () => {
        it('should generate comprehensive security report', () => {
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
                    },
                    {
                        checkName: 'Failed Check',
                        passed: false,
                        severity: 'high',
                        description: 'Test failed',
                        details: ['Error detail 1', 'Error detail 2'],
                        recommendation: 'Fix the issue'
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

            const report = securityValidator.generateSecurityReport(mockAuditResult);
            
            expect(report).to.be.a('string');
            expect(report).to.include('FlowCode Security Audit Report');
            expect(report).to.include('Overall Security Score: 85/100');
            expect(report).to.include('Total Checks: 10');
            expect(report).to.include('Test Check ✅ PASS');
            expect(report).to.include('Failed Check ❌ FAIL (HIGH)');
            expect(report).to.include('Error detail 1');
            expect(report).to.include('Fix the issue');
        });
    });

    describe('checkApiKeyStorage', () => {
        it('should pass when API keys are stored securely', async () => {
            const result = await (securityValidator as any).checkApiKeyStorage();
            
            expect(result.checkName).to.equal('API Key Storage');
            expect(result.passed).to.be.true;
            expect(result.severity).to.be.oneOf(['low', 'medium', 'high', 'critical']);
            expect(result.description).to.be.a('string');
        });
    });

    describe('checkInputValidation', () => {
        it('should validate input validation implementation', async () => {
            const result = await (securityValidator as any).checkInputValidation();
            
            expect(result.checkName).to.equal('Input Validation');
            expect(result.passed).to.be.a('boolean');
            expect(result.severity).to.equal('high');
            expect(result.description).to.be.a('string');
        });
    });
});
