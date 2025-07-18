import { expect } from 'chai';
import { describe, it, beforeEach, afterEach } from 'mocha';
import * as sinon from 'sinon';
import axios from 'axios';
import { ArchitectService, RefactorOptions } from '../../services/architect-service';
import { ConfigurationManager } from '../../utils/configuration-manager';
import { TestUtils } from '../TestUtils';

describe('ArchitectService', () => {
    let architectService: ArchitectService;
    let configManager: ConfigurationManager;
    let sandbox: sinon.SinonSandbox;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        TestUtils.mockVSCodeAPI(sandbox);
        
        configManager = new ConfigurationManager();
        architectService = new ArchitectService(configManager);
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('refactor', () => {
        const validCode = 'function test() { return "hello"; }';
        const validOptions: RefactorOptions = {
            language: 'typescript',
            filePath: '/test/file.ts'
        };

        beforeEach(() => {
            // Mock configuration
            sandbox.stub(configManager, 'getApiConfiguration').resolves({
                provider: 'openai' as const,
                apiKey: 'test-api-key',
                maxTokens: 2000
            });
        });

        it('should validate request before processing', async () => {
            const invalidCode = 'x'; // Too short

            try {
                await architectService.refactor(invalidCode, validOptions);
                expect.fail('Should have thrown validation error');
            } catch (error) {
                expect((error as Error).message).to.include('Validation failed');
                expect((error as Error).message).to.include('Code too short');
            }
        });

        it('should detect dangerous code patterns', async () => {
            const dangerousCode = 'eval("malicious code"); function test() { return "hello"; }';

            try {
                await architectService.refactor(dangerousCode, validOptions);
                expect.fail('Should have thrown validation error');
            } catch (error) {
                expect((error as Error).message).to.include('Validation failed');
                expect((error as Error).message).to.include('dangerous pattern');
            }
        });

        it('should enforce rate limiting', async () => {
            // Mock successful API calls
            sandbox.stub(axios, 'post').resolves({
                data: {
                    choices: [{ message: { content: '```typescript\nrefactored code\n```' } }]
                }
            });

            // Make multiple rapid requests
            const promises = [];
            for (let i = 0; i < 15; i++) { // Exceed rate limit of 10
                promises.push(architectService.refactor(validCode, validOptions));
            }

            const results = await Promise.allSettled(promises);
            const rejectedCount = results.filter(r => r.status === 'rejected').length;

            expect(rejectedCount).to.be.greaterThan(0);
        });

        it('should use cached responses for identical requests', async () => {
            const mockResponse = {
                data: {
                    choices: [{ message: { content: '```typescript\nrefactored code\n```' } }]
                }
            };
            const axiosStub = sandbox.stub(axios, 'post').resolves(mockResponse);

            // First call
            const result1 = await architectService.refactor(validCode, validOptions);

            // Second identical call should use cache
            const result2 = await architectService.refactor(validCode, validOptions);

            expect(result1).to.equal(result2);
            expect(axiosStub.callCount).to.equal(1); // Only called once due to caching
        });

        it('should handle OpenAI API errors gracefully', async () => {
            sandbox.stub(axios, 'post').rejects(new Error('API Error'));

            try {
                await architectService.refactor(validCode, validOptions);
                expect.fail('Should have thrown error');
            } catch (error) {
                expect((error as Error).message).to.include('Architect service failed');
            }
        });

        it('should handle Anthropic provider', async () => {
            // Mock Anthropic configuration
            sandbox.stub(configManager, 'getApiConfiguration').resolves({
                provider: 'anthropic' as const,
                apiKey: 'test-anthropic-key',
                maxTokens: 2000
            });

            const mockResponse = {
                data: {
                    content: [{ text: '```typescript\nrefactored code\n```' }]
                }
            };
            sandbox.stub(axios, 'post').resolves(mockResponse);

            const result = await architectService.refactor(validCode, validOptions);

            expect(result).to.equal('refactored code');
        });

        it('should extract code blocks from responses', async () => {
            const mockResponse = {
                data: {
                    choices: [{
                        message: {
                            content: 'Here is the refactored code:\n```typescript\nfunction improved() { return "better"; }\n```\nThis is much better!'
                        }
                    }]
                }
            };
            sandbox.stub(axios, 'post').resolves(mockResponse);

            const result = await architectService.refactor(validCode, validOptions);

            expect(result).to.equal('function improved() { return "better"; }');
        });

        it('should handle responses without code blocks', async () => {
            const mockResponse = {
                data: {
                    choices: [{
                        message: {
                            content: 'function improved() { return "better"; }'
                        }
                    }]
                }
            };
            sandbox.stub(axios, 'post').resolves(mockResponse);

            const result = await architectService.refactor(validCode, validOptions);

            expect(result).to.equal('function improved() { return "better"; }');
        });

        it('should validate file path input', async () => {
            const invalidOptions: RefactorOptions = {
                language: 'typescript',
                filePath: '../../../etc/passwd' // Path traversal attempt
            };

            try {
                await architectService.refactor(validCode, invalidOptions);
                expect.fail('Should have thrown validation error');
            } catch (error) {
                expect((error as Error).message).to.include('Validation failed');
            }
        });

        it('should validate language input', async () => {
            const invalidOptions: RefactorOptions = {
                language: 'malicious-script',
                filePath: '/test/file.ts'
            };

            try {
                await architectService.refactor(validCode, invalidOptions);
                expect.fail('Should have thrown validation error');
            } catch (error) {
                expect((error as Error).message).to.include('Validation failed');
            }
        });

        it('should handle unsupported provider', async () => {
            sandbox.stub(configManager, 'getApiConfiguration').resolves({
                provider: 'unsupported' as any,
                apiKey: 'test-key',
                maxTokens: 2000
            });

            try {
                await architectService.refactor(validCode, validOptions);
                expect.fail('Should have thrown error');
            } catch (error) {
                expect((error as Error).message).to.include('Unsupported provider');
            }
        });

        it('should enforce rate limiting', async () => {
            // Mock successful API call
            sandbox.stub(axios, 'post').resolves({
                data: {
                    choices: [{ message: { content: '```typescript\nfunction test() { return "hello"; }\n```' } }]
                }
            });

            // Make multiple rapid requests
            const promises = Array(15).fill(0).map(() => 
                architectService.refactor(validCode, validOptions)
            );

            const results = await Promise.allSettled(promises);
            const rejectedCount = results.filter(r => r.status === 'rejected').length;
            
            expect(rejectedCount).to.be.greaterThan(0);
        });

        it('should cache responses', async () => {
            const mockResponse = {
                data: {
                    choices: [{ message: { content: '```typescript\nfunction test() { return "hello"; }\n```' } }]
                }
            };
            const axiosStub = sandbox.stub(axios, 'post').resolves(mockResponse);

            // First call
            const result1 = await architectService.refactor(validCode, validOptions);
            
            // Second call with same input
            const result2 = await architectService.refactor(validCode, validOptions);

            expect(result1).to.equal(result2);
            expect(axiosStub.callCount).to.equal(1); // Should only call API once
        });

        it('should handle OpenAI API calls', async () => {
            const mockResponse = {
                data: {
                    choices: [{ message: { content: '```typescript\nfunction betterTest() { return "hello world"; }\n```' } }]
                }
            };
            sandbox.stub(axios, 'post').resolves(mockResponse);

            const result = await architectService.refactor(validCode, validOptions);

            expect(result).to.equal('function betterTest() { return "hello world"; }');
        });

        it('should handle Anthropic API calls', async () => {
            sandbox.stub(configManager, 'getApiConfiguration').resolves({
                provider: 'anthropic' as const,
                apiKey: 'test-api-key',
                maxTokens: 2000
            });

            const mockResponse = {
                data: {
                    content: [{ text: '```typescript\nfunction betterTest() { return "hello world"; }\n```' }]
                }
            };
            sandbox.stub(axios, 'post').resolves(mockResponse);

            const result = await architectService.refactor(validCode, validOptions);

            expect(result).to.equal('function betterTest() { return "hello world"; }');
        });

        it('should handle API errors gracefully', async () => {
            sandbox.stub(axios, 'post').rejects(new Error('API Error'));

            try {
                await architectService.refactor(validCode, validOptions);
                expect.fail('Should have thrown an error');
            } catch (error) {
                expect((error as Error).message).to.include('Architect service failed');
            }
        });

        it('should extract code blocks correctly', async () => {
            const mockResponse = {
                data: {
                    choices: [{ message: { content: 'Here is the refactored code:\n```typescript\nfunction betterTest() { return "hello world"; }\n```\nThis is better because...' } }]
                }
            };
            sandbox.stub(axios, 'post').resolves(mockResponse);

            const result = await architectService.refactor(validCode, validOptions);

            expect(result).to.equal('function betterTest() { return "hello world"; }');
        });

        it('should handle responses without code blocks', async () => {
            const mockResponse = {
                data: {
                    choices: [{ message: { content: 'function betterTest() { return "hello world"; }' } }]
                }
            };
            sandbox.stub(axios, 'post').resolves(mockResponse);

            const result = await architectService.refactor(validCode, validOptions);

            expect(result).to.equal('function betterTest() { return "hello world"; }');
        });

        it('should reject dangerous code patterns', async () => {
            const dangerousCode = 'eval("malicious code")';
            
            try {
                await architectService.refactor(dangerousCode, validOptions);
                expect.fail('Should have rejected dangerous code');
            } catch (error) {
                expect((error as Error).message).to.include('dangerous patterns');
            }
        });

        it('should validate supported languages', async () => {
            const invalidOptions: RefactorOptions = {
                language: 'unsupported',
                filePath: '/test/file.txt'
            };
            
            try {
                await architectService.refactor(validCode, invalidOptions);
                expect.fail('Should have rejected unsupported language');
            } catch (error) {
                expect((error as Error).message).to.include('Unsupported language');
            }
        });

        it('should handle code length limits', async () => {
            const tooLongCode = 'x'.repeat(60000); // Exceeds MAX_CODE_LENGTH
            
            try {
                await architectService.refactor(tooLongCode, validOptions);
                expect.fail('Should have rejected code that is too long');
            } catch (error) {
                expect((error as Error).message).to.include('Code too long');
            }
        });

        it('should generate enhanced prompts for different languages', async () => {
            const mockResponse = {
                data: {
                    choices: [{ message: { content: '```python\ndef better_test():\n    return "hello world"\n```' } }]
                }
            };
            const axiosStub = sandbox.stub(axios, 'post').resolves(mockResponse);

            const pythonOptions: RefactorOptions = {
                language: 'python',
                filePath: '/test/file.py'
            };

            await architectService.refactor('def test(): return "hello"', pythonOptions);

            const callArgs = axiosStub.getCall(0).args[1];
            expect(callArgs.messages[0].content).to.include('PEP 8');
            expect(callArgs.messages[0].content).to.include('type hints');
        });
    });

    describe('rate limiting', () => {
        it('should reset rate limit after time window', async () => {
            // Mock time to control rate limit window
            const clock = sandbox.useFakeTimers();
            
            sandbox.stub(configManager, 'getApiConfiguration').resolves({
                provider: 'openai' as const,
                apiKey: 'test-api-key',
                maxTokens: 2000
            });

            sandbox.stub(axios, 'post').resolves({
                data: {
                    choices: [{ message: { content: 'test response' } }]
                }
            });

            const validCode = 'function test() { return "hello"; }';
            const validOptions: RefactorOptions = {
                language: 'typescript',
                filePath: '/test/file.ts'
            };

            // Make requests up to the limit
            for (let i = 0; i < 10; i++) {
                await architectService.refactor(validCode, validOptions);
            }

            // Next request should be rate limited
            try {
                await architectService.refactor(validCode, validOptions);
                expect.fail('Should have been rate limited');
            } catch (error) {
                expect((error as Error).message).to.include('Rate limit exceeded');
            }

            // Advance time past rate limit window
            clock.tick(61000); // 61 seconds

            // Should be able to make requests again
            const result = await architectService.refactor(validCode, validOptions);
            expect(result).to.be.a('string');

            clock.restore();
        });
    });

    describe('caching', () => {
        it('should expire cached responses after TTL', async () => {
            const clock = sandbox.useFakeTimers();
            
            sandbox.stub(configManager, 'getApiConfiguration').resolves({
                provider: 'openai' as const,
                apiKey: 'test-api-key',
                maxTokens: 2000
            });

            const axiosStub = sandbox.stub(axios, 'post').resolves({
                data: {
                    choices: [{ message: { content: 'test response' } }]
                }
            });

            const validCode = 'function test() { return "hello"; }';
            const validOptions: RefactorOptions = {
                language: 'typescript',
                filePath: '/test/file.ts'
            };

            // First call
            await architectService.refactor(validCode, validOptions);
            expect(axiosStub.callCount).to.equal(1);

            // Second call should use cache
            await architectService.refactor(validCode, validOptions);
            expect(axiosStub.callCount).to.equal(1);

            // Advance time past cache TTL
            clock.tick(3700000); // 1 hour + 100 seconds

            // Third call should make new API request
            await architectService.refactor(validCode, validOptions);
            expect(axiosStub.callCount).to.equal(2);

            clock.restore();
        });
    });
});
