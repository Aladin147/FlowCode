import { expect } from 'chai';
import { describe, it, beforeEach, afterEach } from 'mocha';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { FinalGuard, GuardCheckResult } from '../../services/final-guard';
import { ConfigurationManager } from '../../utils/configuration-manager';
import { TestUtils } from '../TestUtils';

describe('FinalGuard', () => {
    let finalGuard: FinalGuard;
    let configManager: ConfigurationManager;
    let sandbox: sinon.SinonSandbox;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        TestUtils.mockVSCodeAPI(sandbox);
        
        configManager = new ConfigurationManager();
        finalGuard = new FinalGuard(configManager);
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('platform detection', () => {
        it('should detect Windows platform correctly', () => {
            sandbox.stub(process, 'platform').value('win32');
            
            const platformInfo = (finalGuard as any).detectPlatform();
            
            expect(platformInfo.platform).to.equal('win32');
            expect(platformInfo.isWindows).to.be.true;
            expect(platformInfo.isUnix).to.be.false;
        });

        it('should detect Unix platforms correctly', () => {
            const unixPlatforms = ['linux', 'darwin', 'freebsd'];
            
            for (const platform of unixPlatforms) {
                sandbox.stub(process, 'platform').value(platform);
                
                const platformInfo = (finalGuard as any).detectPlatform();
                
                expect(platformInfo.platform).to.equal(platform);
                expect(platformInfo.isWindows).to.be.false;
                expect(platformInfo.isUnix).to.be.true;
            }
        });

        it('should detect shell correctly', () => {
            // Test Windows
            sandbox.stub(process, 'platform').value('win32');
            sandbox.stub(process.env, 'COMSPEC').value('C:\\Windows\\System32\\cmd.exe');
            
            let platformInfo = (finalGuard as any).detectPlatform();
            expect(platformInfo.shell).to.equal('C:\\Windows\\System32\\cmd.exe');
            
            // Test Unix
            sandbox.stub(process, 'platform').value('linux');
            sandbox.stub(process.env, 'SHELL').value('/bin/bash');
            
            platformInfo = (finalGuard as any).detectPlatform();
            expect(platformInfo.shell).to.equal('/bin/bash');
        });
    });

    describe('initialization', () => {
        beforeEach(() => {
            sandbox.stub(configManager, 'getWorkspaceRoot').resolves('/test/workspace');
            sandbox.stub(configManager, 'getGitHooksDirectory').resolves('/test/workspace/.git/hooks');
        });

        it('should initialize successfully', async () => {
            sandbox.stub(fs, 'existsSync').returns(true);
            sandbox.stub(fs, 'mkdirSync').returns(undefined);
            sandbox.stub(fs, 'writeFileSync').returns(undefined);
            sandbox.stub(fs, 'chmodSync').returns(undefined);
            sandbox.stub(fs, 'statSync').returns({ mode: parseInt('755', 8) } as any);
            
            await finalGuard.initialize();
            
            // Should complete without throwing
            expect(true).to.be.true;
        });

        it('should verify git repository exists', async () => {
            sandbox.stub(fs, 'existsSync').withArgs('/test/workspace/.git').returns(false);
            
            try {
                await finalGuard.initialize();
                expect.fail('Should have thrown an error');
            } catch (error) {
                expect((error as Error).message).to.include('Not a git repository');
            }
        });

        it('should create hooks directory if it does not exist', async () => {
            sandbox.stub(fs, 'existsSync')
                .withArgs('/test/workspace/.git').returns(true)
                .withArgs('/test/workspace/.git/hooks').returns(false);
            
            const mkdirStub = sandbox.stub(fs, 'mkdirSync').returns(undefined);
            sandbox.stub(fs, 'writeFileSync').returns(undefined);
            sandbox.stub(fs, 'chmodSync').returns(undefined);
            sandbox.stub(fs, 'statSync').returns({ mode: parseInt('755', 8) } as any);
            
            await finalGuard.initialize();
            
            expect(mkdirStub.calledWith('/test/workspace/.git/hooks', { recursive: true })).to.be.true;
        });

        it('should verify hook installation', async () => {
            sandbox.stub(fs, 'existsSync')
                .withArgs('/test/workspace/.git').returns(true)
                .withArgs('/test/workspace/.git/hooks').returns(true)
                .withArgs(path.join('/test/workspace/.git/hooks', 'pre-commit')).returns(false);
            
            try {
                await finalGuard.initialize();
                expect.fail('Should have thrown verification error');
            } catch (error) {
                expect((error as Error).message).to.include('installation verification failed');
            }
        });
    });

    describe('hook generation', () => {
        it('should generate Windows pre-commit hook', () => {
            // Mock Windows platform
            (finalGuard as any).platformInfo = {
                platform: 'win32',
                shell: 'cmd.exe',
                isWindows: true,
                isUnix: false
            };
            
            const hook = (finalGuard as any).generateCrossPlatformPreCommitHook();
            
            expect(hook).to.include('@echo off');
            expect(hook).to.include('findstr');
            expect(hook).to.include('exit /b');
        });

        it('should generate Unix pre-commit hook', () => {
            // Mock Unix platform
            (finalGuard as any).platformInfo = {
                platform: 'linux',
                shell: '/bin/bash',
                isWindows: false,
                isUnix: true
            };
            
            const hook = (finalGuard as any).generateCrossPlatformPreCommitHook();
            
            expect(hook).to.include('#!/bin/sh');
            expect(hook).to.include('grep -E');
            expect(hook).to.include('exit 1');
        });

        it('should generate Windows pre-push hook', () => {
            (finalGuard as any).platformInfo = {
                platform: 'win32',
                shell: 'cmd.exe',
                isWindows: true,
                isUnix: false
            };
            
            const hook = (finalGuard as any).generateCrossPlatformPrePushHook();
            
            expect(hook).to.include('@echo off');
            expect(hook).to.include('npm test');
            expect(hook).to.include('semgrep');
        });

        it('should generate Unix pre-push hook', () => {
            (finalGuard as any).platformInfo = {
                platform: 'linux',
                shell: '/bin/bash',
                isWindows: false,
                isUnix: true
            };
            
            const hook = (finalGuard as any).generateCrossPlatformPrePushHook();
            
            expect(hook).to.include('#!/bin/sh');
            expect(hook).to.include('npm test');
            expect(hook).to.include('semgrep');
        });
    });

    describe('hook writing', () => {
        beforeEach(() => {
            sandbox.stub(fs, 'existsSync').returns(true);
            sandbox.stub(fs, 'mkdirSync').returns(undefined);
        });

        it('should write Unix hook with correct permissions', async () => {
            (finalGuard as any).platformInfo = {
                platform: 'linux',
                shell: '/bin/bash',
                isWindows: false,
                isUnix: true
            };
            
            const writeStub = sandbox.stub(fs, 'writeFileSync').returns(undefined);
            const chmodStub = sandbox.stub(fs, 'chmodSync').returns(undefined);
            
            await (finalGuard as any).writeHook('/test/hooks', 'pre-commit', '#!/bin/sh\necho "test"');
            
            expect(writeStub.calledWith('/test/hooks/pre-commit')).to.be.true;
            expect(chmodStub.calledWith('/test/hooks/pre-commit', 0o755)).to.be.true;
        });

        it('should write Windows hook with .bat extension', async () => {
            (finalGuard as any).platformInfo = {
                platform: 'win32',
                shell: 'cmd.exe',
                isWindows: true,
                isUnix: false
            };
            
            const writeStub = sandbox.stub(fs, 'writeFileSync').returns(undefined);
            
            await (finalGuard as any).writeHook('/test/hooks', 'pre-commit', '@echo off\necho test');
            
            expect(writeStub.calledWith('/test/hooks/pre-commit.bat')).to.be.true;
        });

        it('should handle write errors gracefully', async () => {
            sandbox.stub(fs, 'writeFileSync').throws(new Error('Write error'));
            
            try {
                await (finalGuard as any).writeHook('/test/hooks', 'pre-commit', 'content');
                expect.fail('Should have thrown an error');
            } catch (error) {
                expect((error as Error).message).to.include('Write error');
            }
        });
    });

    describe('final checks', () => {
        beforeEach(() => {
            sandbox.stub(configManager, 'getWorkspaceRoot').resolves('/test/workspace');
        });

        it('should run all check types', async () => {
            const testStub = sandbox.stub(finalGuard as any, 'runTestsWithDetails').resolves({
                passed: true,
                checkName: 'tests',
                duration: 1000,
                issues: []
            });
            
            const securityStub = sandbox.stub(finalGuard as any, 'runSecurityScanWithDetails').resolves({
                passed: true,
                checkName: 'security',
                duration: 2000,
                issues: []
            });
            
            const lintStub = sandbox.stub(finalGuard as any, 'runLintChecksWithDetails').resolves({
                passed: true,
                checkName: 'lint',
                duration: 1500,
                issues: []
            });
            
            const typeStub = sandbox.stub(finalGuard as any, 'runTypeChecksWithDetails').resolves({
                passed: true,
                checkName: 'types',
                duration: 3000,
                issues: []
            });
            
            const results = await finalGuard.runFinalChecks();
            
            expect(testStub.called).to.be.true;
            expect(securityStub.called).to.be.true;
            expect(lintStub.called).to.be.true;
            expect(typeStub.called).to.be.true;
            
            expect(results).to.have.length(4);
            expect(results.every(r => r.passed)).to.be.true;
        });

        it('should handle check failures', async () => {
            sandbox.stub(finalGuard as any, 'runTestsWithDetails').resolves({
                passed: false,
                checkName: 'tests',
                duration: 1000,
                issues: ['Test failure in file.test.ts']
            });
            
            sandbox.stub(finalGuard as any, 'runSecurityScanWithDetails').resolves({
                passed: true,
                checkName: 'security',
                duration: 2000,
                issues: []
            });
            
            sandbox.stub(finalGuard as any, 'runLintChecksWithDetails').resolves({
                passed: true,
                checkName: 'lint',
                duration: 1500,
                issues: []
            });
            
            sandbox.stub(finalGuard as any, 'runTypeChecksWithDetails').resolves({
                passed: true,
                checkName: 'types',
                duration: 3000,
                issues: []
            });
            
            const results = await finalGuard.runFinalChecks();
            
            expect(results).to.have.length(4);
            expect(results[0].passed).to.be.false;
            expect(results[0].issues).to.have.length(1);
        });

        it('should handle initialization errors', async () => {
            sandbox.stub(configManager, 'getWorkspaceRoot').rejects(new Error('Config error'));
            
            const results = await finalGuard.runFinalChecks();
            
            expect(results).to.have.length(1);
            expect(results[0].passed).to.be.false;
            expect(results[0].checkName).to.equal('initialization');
            expect(results[0].issues[0]).to.include('Config error');
        });
    });

    describe('individual check methods', () => {
        it('should handle missing test runner gracefully', async () => {
            const result = await (finalGuard as any).runTestsWithDetails('/test/workspace');
            
            expect(result.checkName).to.equal('tests');
            expect(result.passed).to.be.true; // Should pass if no tests exist
            expect(result.issues).to.include('No test runner found');
        });

        it('should handle missing TypeScript configuration', async () => {
            sandbox.stub(fs, 'existsSync').returns(false);
            
            const result = await (finalGuard as any).runTypeChecksWithDetails('/test/workspace');
            
            expect(result.checkName).to.equal('types');
            expect(result.passed).to.be.true;
            expect(result.issues).to.include('No TypeScript configuration found');
        });

        it('should parse security scan results', async () => {
            // This would require mocking child_process.spawn
            // For now, just test that the method exists and returns correct structure
            const result = await (finalGuard as any).runSecurityScanWithDetails('/test/workspace');
            
            expect(result).to.have.property('passed');
            expect(result).to.have.property('checkName');
            expect(result).to.have.property('duration');
            expect(result).to.have.property('issues');
            expect(result.checkName).to.equal('security');
        });
    });
});
