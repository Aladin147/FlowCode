import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export interface ApiConfiguration {
    provider: 'openai' | 'anthropic';
    apiKey: string;
    maxTokens: number;
}

export class ConfigurationManager {
    private static readonly CONFIG_SECTION = 'flowcode';
    
    public async getApiConfiguration(): Promise<ApiConfiguration> {
        const config = vscode.workspace.getConfiguration(ConfigurationManager.CONFIG_SECTION);
        
        const provider = config.get<'openai' | 'anthropic'>('apiProvider', 'openai');
        const apiKey = config.get<string>('apiKey', '');
        const maxTokens = config.get<number>('maxTokens', 2000);
        
        if (!apiKey) {
            throw new Error('API key not configured. Please run "FlowCode: Configure API Key" command.');
        }
        
        return { provider, apiKey, maxTokens };
    }

    public async setApiConfiguration(provider: 'openai' | 'anthropic', apiKey: string): Promise<void> {
        const config = vscode.workspace.getConfiguration(ConfigurationManager.CONFIG_SECTION);
        await config.update('apiProvider', provider, vscode.ConfigurationTarget.Global);
        await config.update('apiKey', apiKey, vscode.ConfigurationTarget.Global);
    }

    public async getMaxTokens(): Promise<number> {
        const config = vscode.workspace.getConfiguration(ConfigurationManager.CONFIG_SECTION);
        return config.get<number>('maxTokens', 2000);
    }

    public async isCompanionGuardEnabled(): Promise<boolean> {
        const config = vscode.workspace.getConfiguration(ConfigurationManager.CONFIG_SECTION);
        return config.get<boolean>('enableCompanionGuard', true);
    }

    public async isFinalGuardEnabled(): Promise<boolean> {
        const config = vscode.workspace.getConfiguration(ConfigurationManager.CONFIG_SECTION);
        return config.get<boolean>('enableFinalGuard', true);
    }

    public async validateConfiguration(): Promise<void> {
        try {
            await this.getApiConfiguration();
        } catch (error) {
            throw new Error(`Configuration validation failed: ${error}`);
        }
    }

    public async getWorkspaceRoot(): Promise<string> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            throw new Error('No workspace folder found');
        }
        return workspaceFolders[0].uri.fsPath;
    }

    public async getFlowCodeDirectory(): Promise<string> {
        const workspaceRoot = await this.getWorkspaceRoot();
        const flowCodeDir = path.join(workspaceRoot, '.flowcode');
        
        if (!fs.existsSync(flowCodeDir)) {
            fs.mkdirSync(flowCodeDir, { recursive: true });
        }
        
        return flowCodeDir;
    }

    public async getDebtFilePath(): Promise<string> {
        const flowCodeDir = await this.getFlowCodeDirectory();
        return path.join(flowCodeDir, 'debt.json');
    }

    public async getGitHooksDirectory(): Promise<string> {
        const workspaceRoot = await this.getWorkspaceRoot();
        return path.join(workspaceRoot, '.git', 'hooks');
    }
}