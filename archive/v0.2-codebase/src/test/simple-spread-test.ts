import { describe, it } from 'mocha';
import { expect } from 'chai';

/**
 * Simple test to verify JavaScript spread operator behavior
 */
describe('JavaScript Spread Operator Test', () => {
    it('should properly override provider in spread operation', () => {
        const defaultConfig = {
            provider: 'openai' as const,
            model: 'default-model',
            maxInputTokens: 1000
        };

        const anthropicConfig = {
            provider: 'anthropic' as const,
            model: 'claude-model',
            maxInputTokens: 2000
        };

        const result = { ...defaultConfig, ...anthropicConfig };

        console.log('Default config:', defaultConfig);
        console.log('Anthropic config:', anthropicConfig);
        console.log('Spread result:', result);

        expect(result.provider).to.equal('anthropic');
        expect(result.model).to.equal('claude-model');
        expect(result.maxInputTokens).to.equal(2000);
    });

    it('should test the exact pattern from context compression service', () => {
        interface TestConfig {
            provider: 'openai' | 'anthropic' | 'deepseek' | 'gemini';
            model: string;
            maxInputTokens: number;
        }

        const defaultConfig: TestConfig = {
            provider: 'openai',
            model: 'gpt-4-turbo-preview',
            maxInputTokens: 128000
        };

        const configs: Record<string, Partial<TestConfig>> = {
            'anthropic': {
                provider: 'anthropic' as const,
                model: 'claude-3-opus-20240229',
                maxInputTokens: 200000
            }
        };

        const targetProvider = 'anthropic';
        const providerConfig = configs[targetProvider];
        
        console.log('Target provider:', targetProvider);
        console.log('Provider config:', providerConfig);
        
        expect(providerConfig).to.exist;
        
        const result = { ...defaultConfig, ...providerConfig };
        
        console.log('Final result:', result);
        
        expect(result.provider).to.equal('anthropic');
    });
});
