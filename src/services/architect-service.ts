import axios from 'axios';
import { ConfigurationManager } from '../utils/configuration-manager';

export interface RefactorOptions {
    language: string;
    filePath: string;
    context?: string;
}

export class ArchitectService {
    constructor(private configManager: ConfigurationManager) {}

    public async refactor(code: string, options: RefactorOptions): Promise<string | null> {
        const config = await this.configManager.getApiConfiguration();
        
        const prompt = this.buildPrompt(code, options);
        
        try {
            let response: string;
            
            switch (config.provider) {
                case 'openai':
                    response = await this.callOpenAI(prompt, config.apiKey, config.maxTokens);
                    break;
                case 'anthropic':
                    response = await this.callAnthropic(prompt, config.apiKey, config.maxTokens);
                    break;
                default:
                    throw new Error(`Unsupported provider: ${config.provider}`);
            }
            
            return this.extractCodeBlock(response);
        } catch (error) {
            throw new Error(`Architect service failed: ${error}`);
        }
    }

    private buildPrompt(code: string, options: RefactorOptions): string {
        return `You are an expert software architect. Please refactor the following ${options.language} code to improve its quality, maintainability, and performance while preserving its functionality.

File: ${options.filePath}

Code to refactor:
\`\`\`${options.language}
${code}
\`\`\`

Please provide the refactored code with:
1. Improved readability and structure
2. Better error handling
3. Performance optimizations where applicable
4. Clear variable and function names
5. Appropriate comments for complex logic

Return only the refactored code in a single code block.`;

    }

    private async callOpenAI(prompt: string, apiKey: string, maxTokens: number): Promise<string> {
        const response = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            {
                model: 'gpt-4-turbo-preview',
                messages: [
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                max_tokens: maxTokens,
                temperature: 0.1
            },
            {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        return response.data.choices[0]?.message?.content || '';
    }

    private async callAnthropic(prompt: string, apiKey: string, maxTokens: number): Promise<string> {
        const response = await axios.post(
            'https://api.anthropic.com/v1/messages',
            {
                model: 'claude-3-opus-20240229',
                max_tokens: maxTokens,
                messages: [
                    {
                        role: 'user',
                        content: prompt
                    }
                ]
            },
            {
                headers: {
                    'x-api-key': apiKey,
                    'Content-Type': 'application/json',
                    'anthropic-version': '2023-06-01'
                }
            }
        );

        return response.data.content[0]?.text || '';
    }

    private extractCodeBlock(response: string): string | null {
        const codeBlockRegex = /```(?:\w+)?\n([\s\S]*?)```/;
        const match = response.match(codeBlockRegex);
        
        if (match) {
            return match[1].trim();
        }
        
        // If no code block found, return the entire response
        return response.trim();
    }
}