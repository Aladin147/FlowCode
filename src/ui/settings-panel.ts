import * as vscode from 'vscode';
import { logger } from '../utils/logger';
import { ConfigurationManager } from '../utils/configuration-manager';

export class SettingsPanel {
    private static instance: SettingsPanel;
    private contextLogger = logger.createContextLogger('SettingsPanel');
    private panel: vscode.WebviewPanel | undefined;
    private configManager: ConfigurationManager;

    private constructor(configManager: ConfigurationManager) {
        this.configManager = configManager;
    }

    public static getInstance(configManager: ConfigurationManager): SettingsPanel {
        if (!SettingsPanel.instance) {
            SettingsPanel.instance = new SettingsPanel(configManager);
        }
        return SettingsPanel.instance;
    }

    public async show(): Promise<void> {
        if (this.panel) {
            this.panel.reveal();
            return;
        }

        this.panel = vscode.window.createWebviewPanel(
            'flowcodeSettings',
            'FlowCode Settings',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        this.panel.webview.html = await this.getWebviewContent();

        // Handle messages from webview
        this.panel.webview.onDidReceiveMessage(async (message) => {
            await this.handleMessage(message);
        });

        this.panel.onDidDispose(() => {
            this.panel = undefined;
        });

        this.contextLogger.info('Settings panel opened');
    }

    private async handleMessage(message: any): Promise<void> {
        try {
            switch (message.command) {
                case 'saveApiConfig':
                    await this.saveApiConfiguration(message.data);
                    break;
                case 'testApiKey':
                    await this.testApiKey(message.data);
                    break;
                case 'clearApiKey':
                    await this.clearApiKey();
                    break;
                case 'loadCurrentConfig':
                    await this.loadCurrentConfiguration();
                    break;
                case 'saveGeneralSettings':
                    await this.saveGeneralSettings(message.data);
                    break;
                default:
                    this.contextLogger.warn(`Unknown message command: ${message.command}`);
            }
        } catch (error) {
            this.contextLogger.error('Error handling settings message', error as Error);
            this.panel?.webview.postMessage({
                command: 'error',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    private async saveApiConfiguration(data: any): Promise<void> {
        try {
            const { provider, apiKey, customEndpoint } = data;
            
            // Save API configuration
            await this.configManager.setApiConfiguration(provider, apiKey);
            
            // Save custom endpoint if provided
            if (customEndpoint) {
                const config = vscode.workspace.getConfiguration('flowcode');
                await config.update('customEndpoint', customEndpoint, vscode.ConfigurationTarget.Global);
            }

            this.panel?.webview.postMessage({
                command: 'apiConfigSaved',
                message: 'API configuration saved successfully!'
            });

            this.contextLogger.info(`API configuration saved for provider: ${provider}`);
        } catch (error) {
            throw new Error(`Failed to save API configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    private async testApiKey(data: any): Promise<void> {
        try {
            const { provider, apiKey, customEndpoint } = data;
            
            this.panel?.webview.postMessage({
                command: 'testingApiKey',
                message: 'Testing API key...'
            });

            const isValid = await this.configManager.testApiKey(provider, apiKey, customEndpoint);
            
            this.panel?.webview.postMessage({
                command: 'apiKeyTestResult',
                success: isValid,
                message: isValid ? 'API key is valid!' : 'API key test failed. Please check your key and endpoint.'
            });

        } catch (error) {
            this.panel?.webview.postMessage({
                command: 'apiKeyTestResult',
                success: false,
                message: `API key test failed: ${error instanceof Error ? error.message : 'Unknown error'}`
            });
        }
    }

    private async clearApiKey(): Promise<void> {
        try {
            await this.configManager.clearApiCredentials();
            
            this.panel?.webview.postMessage({
                command: 'apiKeyCleared',
                message: 'API credentials cleared successfully!'
            });

            this.contextLogger.info('API credentials cleared from settings panel');
        } catch (error) {
            throw new Error(`Failed to clear API credentials: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    private async loadCurrentConfiguration(): Promise<void> {
        try {
            const config = vscode.workspace.getConfiguration('flowcode');
            const hasApiKey = await this.configManager.hasValidApiKey();
            
            let currentProvider = 'openai';
            let customEndpoint = '';
            
            if (hasApiKey) {
                try {
                    const apiConfig = await this.configManager.getApiConfiguration();
                    currentProvider = apiConfig.provider;
                    customEndpoint = apiConfig.endpoint || '';
                } catch (error) {
                    // API key exists but can't be loaded - might be corrupted
                    this.contextLogger.warn('API key exists but cannot be loaded', error as Error);
                }
            }

            const currentConfig = {
                hasApiKey,
                provider: currentProvider,
                customEndpoint,
                maxTokens: config.get('ai.maxTokens', 2000),
                securityAuditing: config.get('security.enableAuditing', true),
                auditLevel: config.get('security.auditLevel', 'standard'),
                performanceOptimization: config.get('performance.enableOptimization', true),
                memoryThreshold: config.get('performance.memoryThreshold', 200)
            };

            this.panel?.webview.postMessage({
                command: 'currentConfig',
                data: currentConfig
            });

        } catch (error) {
            this.contextLogger.error('Failed to load current configuration', error as Error);
        }
    }

    private async saveGeneralSettings(data: any): Promise<void> {
        try {
            const config = vscode.workspace.getConfiguration('flowcode');
            
            await config.update('ai.maxTokens', data.maxTokens, vscode.ConfigurationTarget.Global);
            await config.update('security.enableAuditing', data.securityAuditing, vscode.ConfigurationTarget.Global);
            await config.update('security.auditLevel', data.auditLevel, vscode.ConfigurationTarget.Global);
            await config.update('performance.enableOptimization', data.performanceOptimization, vscode.ConfigurationTarget.Global);
            await config.update('performance.memoryThreshold', data.memoryThreshold, vscode.ConfigurationTarget.Global);

            this.panel?.webview.postMessage({
                command: 'generalSettingsSaved',
                message: 'Settings saved successfully!'
            });

            this.contextLogger.info('General settings saved');
        } catch (error) {
            throw new Error(`Failed to save general settings: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    private async getWebviewContent(): Promise<string> {
        return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>FlowCode Settings</title>
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    font-size: var(--vscode-font-size);
                    color: var(--vscode-foreground);
                    background-color: var(--vscode-editor-background);
                    margin: 0;
                    padding: 20px;
                    line-height: 1.6;
                }
                
                .container {
                    max-width: 800px;
                    margin: 0 auto;
                }
                
                h1 {
                    color: var(--vscode-titleBar-activeForeground);
                    border-bottom: 1px solid var(--vscode-titleBar-border);
                    padding-bottom: 10px;
                    margin-bottom: 30px;
                }
                
                .section {
                    background: var(--vscode-editor-background);
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 6px;
                    padding: 20px;
                    margin-bottom: 20px;
                }
                
                .section h2 {
                    margin-top: 0;
                    color: var(--vscode-textLink-foreground);
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                
                .form-group {
                    margin-bottom: 15px;
                }
                
                label {
                    display: block;
                    margin-bottom: 5px;
                    font-weight: 500;
                }
                
                input, select, textarea {
                    width: 100%;
                    padding: 8px 12px;
                    border: 1px solid var(--vscode-input-border);
                    background: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    border-radius: 4px;
                    font-family: inherit;
                    font-size: inherit;
                    box-sizing: border-box;
                }
                
                input:focus, select:focus, textarea:focus {
                    outline: none;
                    border-color: var(--vscode-focusBorder);
                }
                
                .button {
                    background: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    padding: 8px 16px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-family: inherit;
                    font-size: inherit;
                    margin-right: 10px;
                    margin-bottom: 10px;
                }
                
                .button:hover {
                    background: var(--vscode-button-hoverBackground);
                }
                
                .button.secondary {
                    background: var(--vscode-button-secondaryBackground);
                    color: var(--vscode-button-secondaryForeground);
                }
                
                .button.secondary:hover {
                    background: var(--vscode-button-secondaryHoverBackground);
                }
                
                .status-message {
                    padding: 10px;
                    border-radius: 4px;
                    margin: 10px 0;
                    display: none;
                }
                
                .status-message.success {
                    background: var(--vscode-testing-iconPassed);
                    color: var(--vscode-editor-background);
                }
                
                .status-message.error {
                    background: var(--vscode-testing-iconFailed);
                    color: var(--vscode-editor-background);
                }
                
                .status-message.info {
                    background: var(--vscode-testing-iconQueued);
                    color: var(--vscode-editor-background);
                }
                
                .checkbox-group {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                
                .checkbox-group input[type="checkbox"] {
                    width: auto;
                }
                
                .description {
                    font-size: 0.9em;
                    color: var(--vscode-descriptionForeground);
                    margin-top: 5px;
                }
                
                .icon {
                    font-size: 1.2em;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🚀 FlowCode Settings</h1>
                
                <div id="statusMessage" class="status-message"></div>
                
                <!-- API Configuration Section -->
                <div class="section">
                    <h2><span class="icon">🔑</span> API Configuration</h2>
                    
                    <div class="form-group">
                        <label for="provider">AI Provider:</label>
                        <select id="provider">
                            <option value="openai">OpenAI</option>
                            <option value="anthropic">Anthropic (Claude)</option>
                        </select>
                    </div>
                    
                    <div class="form-group">
                        <label for="apiKey">API Key:</label>
                        <input type="password" id="apiKey" placeholder="Enter your API key">
                        <div class="description">Your API key is stored securely and encrypted.</div>
                    </div>
                    
                    <div class="form-group" id="customEndpointGroup">
                        <label for="customEndpoint">Custom Endpoint (Optional):</label>
                        <input type="text" id="customEndpoint" placeholder="https://api.deepseek.com">
                        <div class="description">For OpenAI-compatible services like DeepSeek. Leave empty for standard OpenAI.</div>
                    </div>
                    
                    <div class="form-group">
                        <button class="button" onclick="testApiKey()">Test API Key</button>
                        <button class="button" onclick="saveApiConfig()">Save API Configuration</button>
                        <button class="button secondary" onclick="clearApiKey()">Clear API Key</button>
                    </div>
                </div>
                
                <!-- General Settings Section -->
                <div class="section">
                    <h2><span class="icon">⚙️</span> General Settings</h2>
                    
                    <div class="form-group">
                        <label for="maxTokens">Max Tokens:</label>
                        <input type="number" id="maxTokens" min="100" max="8000" value="2000">
                        <div class="description">Maximum tokens for AI responses (100-8000).</div>
                    </div>
                    
                    <div class="form-group">
                        <div class="checkbox-group">
                            <input type="checkbox" id="securityAuditing" checked>
                            <label for="securityAuditing">Enable Security Auditing</label>
                        </div>
                        <div class="description">Automatically scan code for security vulnerabilities.</div>
                    </div>
                    
                    <div class="form-group">
                        <label for="auditLevel">Security Audit Level:</label>
                        <select id="auditLevel">
                            <option value="basic">Basic</option>
                            <option value="standard" selected>Standard</option>
                            <option value="comprehensive">Comprehensive</option>
                        </select>
                    </div>
                    
                    <div class="form-group">
                        <div class="checkbox-group">
                            <input type="checkbox" id="performanceOptimization" checked>
                            <label for="performanceOptimization">Enable Performance Optimization</label>
                        </div>
                        <div class="description">Optimize extension performance and memory usage.</div>
                    </div>
                    
                    <div class="form-group">
                        <label for="memoryThreshold">Memory Threshold (MB):</label>
                        <input type="number" id="memoryThreshold" min="50" max="1000" value="200">
                        <div class="description">Memory usage threshold for triggering optimization.</div>
                    </div>
                    
                    <div class="form-group">
                        <button class="button" onclick="saveGeneralSettings()">Save General Settings</button>
                    </div>
                </div>
            </div>
            
            <script>
                const vscode = acquireVsCodeApi();
                
                // Load current configuration on startup
                window.addEventListener('load', () => {
                    vscode.postMessage({ command: 'loadCurrentConfig' });
                });
                
                // Handle messages from extension
                window.addEventListener('message', event => {
                    const message = event.data;
                    
                    switch (message.command) {
                        case 'currentConfig':
                            loadConfiguration(message.data);
                            break;
                        case 'apiConfigSaved':
                        case 'generalSettingsSaved':
                        case 'apiKeyCleared':
                            showStatus(message.message, 'success');
                            break;
                        case 'testingApiKey':
                            showStatus(message.message, 'info');
                            break;
                        case 'apiKeyTestResult':
                            showStatus(message.message, message.success ? 'success' : 'error');
                            break;
                        case 'error':
                            showStatus(message.message, 'error');
                            break;
                    }
                });
                
                function loadConfiguration(config) {
                    document.getElementById('provider').value = config.provider || 'openai';
                    document.getElementById('customEndpoint').value = config.customEndpoint || '';
                    document.getElementById('maxTokens').value = config.maxTokens || 2000;
                    document.getElementById('securityAuditing').checked = config.securityAuditing !== false;
                    document.getElementById('auditLevel').value = config.auditLevel || 'standard';
                    document.getElementById('performanceOptimization').checked = config.performanceOptimization !== false;
                    document.getElementById('memoryThreshold').value = config.memoryThreshold || 200;
                    
                    if (config.hasApiKey) {
                        document.getElementById('apiKey').placeholder = 'API key is configured (hidden for security)';
                    }
                    
                    toggleCustomEndpoint();
                }
                
                function toggleCustomEndpoint() {
                    const provider = document.getElementById('provider').value;
                    const customEndpointGroup = document.getElementById('customEndpointGroup');
                    customEndpointGroup.style.display = provider === 'openai' ? 'block' : 'none';
                }
                
                function saveApiConfig() {
                    const provider = document.getElementById('provider').value;
                    const apiKey = document.getElementById('apiKey').value;
                    const customEndpoint = document.getElementById('customEndpoint').value;
                    
                    if (!apiKey) {
                        showStatus('Please enter an API key', 'error');
                        return;
                    }
                    
                    vscode.postMessage({
                        command: 'saveApiConfig',
                        data: { provider, apiKey, customEndpoint }
                    });
                }
                
                function testApiKey() {
                    const provider = document.getElementById('provider').value;
                    const apiKey = document.getElementById('apiKey').value;
                    const customEndpoint = document.getElementById('customEndpoint').value;
                    
                    if (!apiKey) {
                        showStatus('Please enter an API key to test', 'error');
                        return;
                    }
                    
                    vscode.postMessage({
                        command: 'testApiKey',
                        data: { provider, apiKey, customEndpoint }
                    });
                }
                
                function clearApiKey() {
                    if (confirm('Are you sure you want to clear the stored API key?')) {
                        vscode.postMessage({ command: 'clearApiKey' });
                        document.getElementById('apiKey').value = '';
                        document.getElementById('apiKey').placeholder = 'Enter your API key';
                    }
                }
                
                function saveGeneralSettings() {
                    const data = {
                        maxTokens: parseInt(document.getElementById('maxTokens').value),
                        securityAuditing: document.getElementById('securityAuditing').checked,
                        auditLevel: document.getElementById('auditLevel').value,
                        performanceOptimization: document.getElementById('performanceOptimization').checked,
                        memoryThreshold: parseInt(document.getElementById('memoryThreshold').value)
                    };
                    
                    vscode.postMessage({
                        command: 'saveGeneralSettings',
                        data: data
                    });
                }
                
                function showStatus(message, type) {
                    const statusEl = document.getElementById('statusMessage');
                    statusEl.textContent = message;
                    statusEl.className = 'status-message ' + type;
                    statusEl.style.display = 'block';
                    
                    setTimeout(() => {
                        statusEl.style.display = 'none';
                    }, 5000);
                }
                
                // Event listeners
                document.getElementById('provider').addEventListener('change', toggleCustomEndpoint);
            </script>
        </body>
        </html>
        `;
    }
}
