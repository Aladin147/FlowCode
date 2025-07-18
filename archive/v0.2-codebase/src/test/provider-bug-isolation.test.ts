import { describe, it } from 'mocha';
import { expect } from 'chai';

/**
 * Isolated test to debug the provider configuration bug
 */
describe('Provider Configuration Bug Isolation', () => {
    it('should test object spread behavior with provider field', () => {
        // Simulate the exact scenario from ContextCompressionService
        const defaultConfig = {
            provider: 'openai' as const,
            model: 'gpt-4-turbo-preview',
            maxInputTokens: 128000,
            maxOutputTokens: 4000,
            compressionRatio: 0.3,
            preserveStructure: true,
            prioritizeRecent: true
        };

        console.log('Default config:', defaultConfig);

        // Test the exact spread operation from the switch case
        const anthropicResult = {
            ...defaultConfig,
            provider: 'anthropic' as const,
            model: 'claude-3-opus-20240229',
            maxInputTokens: 200000,
            maxOutputTokens: 4000
        };

        console.log('Anthropic result:', anthropicResult);
        console.log('Provider field:', anthropicResult.provider);
        console.log('Provider type:', typeof anthropicResult.provider);

        expect(anthropicResult.provider).to.equal('anthropic');
    });

    it('should test the exact switch case logic', () => {
        const defaultConfig = {
            provider: 'openai' as const,
            model: 'gpt-4-turbo-preview',
            maxInputTokens: 128000,
            maxOutputTokens: 4000,
            compressionRatio: 0.3,
            preserveStructure: true,
            prioritizeRecent: true
        };

        function getOptimalConfigTest(provider: string) {
            const targetProvider = provider;
            console.log('Target provider:', targetProvider);

            switch (targetProvider) {
                case 'openai':
                    return {
                        ...defaultConfig,
                        provider: 'openai' as const,
                        model: 'gpt-4-turbo-preview',
                        maxInputTokens: 128000,
                        maxOutputTokens: 4000
                    };

                case 'anthropic':
                    const result = {
                        ...defaultConfig,
                        provider: 'anthropic' as const,
                        model: 'claude-3-opus-20240229',
                        maxInputTokens: 200000,
                        maxOutputTokens: 4000
                    };
                    console.log('Anthropic case result:', result);
                    return result;

                default:
                    return defaultConfig;
            }
        }

        const result = getOptimalConfigTest('anthropic');
        console.log('Final result:', result);
        console.log('Final provider:', result.provider);

        expect(result.provider).to.equal('anthropic');
    });

    it('should test with actual string values (no const assertions)', () => {
        const defaultConfig = {
            provider: 'openai',
            model: 'gpt-4-turbo-preview',
            maxInputTokens: 128000,
            maxOutputTokens: 4000,
            compressionRatio: 0.3,
            preserveStructure: true,
            prioritizeRecent: true
        };

        const result = {
            ...defaultConfig,
            provider: 'anthropic',
            model: 'claude-3-opus-20240229',
            maxInputTokens: 200000,
            maxOutputTokens: 4000
        };

        console.log('Simple string test result:', result);
        expect(result.provider).to.equal('anthropic');
    });
});
