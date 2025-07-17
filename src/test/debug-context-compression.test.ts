import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import * as sinon from 'sinon';
import { ContextCompressionService } from '../services/context-compression-service';
import { ConfigurationManager } from '../utils/configuration-manager';

/**
 * Debug test for Context Compression Service provider issue
 */
describe('Debug Context Compression Provider Issue', () => {
    let sandbox: sinon.SinonSandbox;
    let configManager: ConfigurationManager;
    let compressionService: ContextCompressionService;

    beforeEach(async () => {
        sandbox = sinon.createSandbox();

        // Create minimal mock context
        const mockContext = {
            subscriptions: [],
            workspaceState: {
                get: () => undefined,
                update: () => Promise.resolve()
            },
            globalState: {
                get: () => undefined,
                update: () => Promise.resolve()
            },
            secrets: {
                get: () => Promise.resolve(undefined),
                store: () => Promise.resolve(),
                delete: () => Promise.resolve()
            }
        } as any;

        configManager = new ConfigurationManager(mockContext);

        // Mock getApiConfiguration to return a proper configuration
        sandbox.stub(configManager, 'getApiConfiguration').resolves({
            provider: 'openai', // Default provider
            apiKey: 'test-key',
            maxTokens: 2000,
            customEndpoint: '',
            keyMetadata: null
        });

        compressionService = new ContextCompressionService(configManager);
    });

    afterEach(() => {
        sandbox.restore();
    });

    it('should debug provider configuration issue', async () => {
        console.log('=== DEBUGGING PROVIDER CONFIGURATION ===');

        try {
            // First, let's check what getApiConfiguration returns
            console.log('About to call getApiConfiguration...');
            const apiConfig = await configManager.getApiConfiguration();
            console.log('API Configuration:', apiConfig);

            // Test each provider individually
            const providers = ['openai', 'anthropic', 'deepseek', 'gemini'];

            for (const provider of providers) {
                console.log(`\n--- Testing provider: ${provider} ---`);

                try {
                    const config = await compressionService.getOptimalConfig(provider);

                    console.log(`Input provider: ${provider}`);
                    console.log(`Output provider: ${config.provider}`);
                    console.log(`Model: ${config.model}`);
                    console.log(`Max input tokens: ${config.maxInputTokens}`);

                    // This should pass for each provider
                    expect(config.provider).to.equal(provider, `Provider should be ${provider} but got ${config.provider}`);
                } catch (error) {
                    console.log(`Error testing provider ${provider}:`, error);
                    throw error;
                }
            }
        } catch (error) {
            console.log('Error in test:', error);
            throw error;
        }
    });

    it('should test default provider behavior', async () => {
        console.log('\n=== TESTING DEFAULT PROVIDER ===');
        
        // Test with no provider specified
        const config = await compressionService.getOptimalConfig();
        
        console.log(`Default provider: ${config.provider}`);
        console.log(`Default model: ${config.model}`);
        
        // Should use the default from configManager.getApiConfiguration()
        expect(config.provider).to.exist;
    });
});
