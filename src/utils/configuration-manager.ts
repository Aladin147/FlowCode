import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { logger } from './logger';

export interface ApiConfiguration {
    provider: 'openai' | 'anthropic';
    apiKey: string;
    maxTokens: number;
    keyCreatedAt?: number;
    keyExpiresAt?: number;
    keyRotationDue?: boolean;
}

export interface SecureKeyMetadata {
    createdAt: number;
    lastUsed: number;
    usageCount: number;
    rotationDue: boolean;
    expiresAt?: number;
}

export class ConfigurationManager {
    private static readonly CONFIG_SECTION = 'flowcode';
    private static readonly API_KEY_SECRET = 'flowcode.apiKey';
    private static readonly API_KEY_HASH_SECRET = 'flowcode.apiKeyHash';
    private static readonly API_KEY_METADATA_SECRET = 'flowcode.apiKeyMetadata';
    private static readonly ENCRYPTION_KEY_SECRET = 'flowcode.encryptionKey';
    private static readonly KEY_ROTATION_DAYS = 90; // Rotate keys every 90 days
    private static readonly KEY_EXPIRY_WARNING_DAYS = 7; // Warn 7 days before expiry

    private contextLogger = logger.createContextLogger('ConfigurationManager');

    constructor(private context?: vscode.ExtensionContext) {}

    public async getApiConfiguration(): Promise<ApiConfiguration> {
        const config = vscode.workspace.getConfiguration(ConfigurationManager.CONFIG_SECTION);

        const provider = config.get<'openai' | 'anthropic'>('apiProvider', 'openai');
        const maxTokens = config.get<number>('maxTokens', 2000);

        // Try to get API key from secure storage first, fallback to settings
        let apiKey = '';
        let keyMetadata: SecureKeyMetadata | null = null;

        if (this.context?.secrets) {
            // Get encrypted API key
            const encryptedKey = await this.context.secrets.get(ConfigurationManager.API_KEY_SECRET);
            if (encryptedKey) {
                apiKey = await this.decryptApiKey(encryptedKey);

                // Get key metadata
                const metadataJson = await this.context.secrets.get(ConfigurationManager.API_KEY_METADATA_SECRET);
                if (metadataJson) {
                    keyMetadata = JSON.parse(metadataJson);
                }
            }
        }

        // Fallback to old settings-based storage for backward compatibility
        if (!apiKey) {
            apiKey = config.get<string>('apiKey', '');
            // If found in settings, migrate to secure storage
            if (apiKey && this.context?.secrets) {
                await this.migrateToSecureStorage(apiKey, provider);
                // Remove from settings
                await config.update('apiKey', undefined, vscode.ConfigurationTarget.Global);
            }
        }

        if (!apiKey) {
            throw new Error('API key not configured. Please run "FlowCode: Configure API Key" command.');
        }

        // Validate API key format
        if (!this.validateApiKeyFormat(apiKey, provider)) {
            throw new Error(`Invalid API key format for ${provider}. Please check your API key and try again.`);
        }

        // Check key expiration and rotation
        const rotationStatus = await this.checkKeyRotationStatus(keyMetadata);

        // Update usage statistics
        if (keyMetadata && this.context?.secrets) {
            keyMetadata.lastUsed = Date.now();
            keyMetadata.usageCount++;
            await this.context.secrets.store(
                ConfigurationManager.API_KEY_METADATA_SECRET,
                JSON.stringify(keyMetadata)
            );
        }

        return {
            provider,
            apiKey,
            maxTokens,
            keyCreatedAt: keyMetadata?.createdAt,
            keyExpiresAt: keyMetadata?.expiresAt,
            keyRotationDue: rotationStatus.rotationDue
        };
    }

    /**
     * Check if a valid API key is configured
     */
    public async hasValidApiKey(): Promise<boolean> {
        try {
            const config = await this.getApiConfiguration();
            return !!config.apiKey;
        } catch (error) {
            this.contextLogger.error('Failed to check API key validity', error as Error);
            return false;
        }
    }

    public async setApiConfiguration(provider: 'openai' | 'anthropic', apiKey: string): Promise<void> {
        // Validate API key format before storing
        if (!this.validateApiKeyFormat(apiKey, provider)) {
            throw new Error(`Invalid API key format for ${provider}. Please check your API key format.`);
        }

        // Sanitize API key (remove whitespace)
        const sanitizedApiKey = apiKey.trim();

        const config = vscode.workspace.getConfiguration(ConfigurationManager.CONFIG_SECTION);
        await config.update('apiProvider', provider, vscode.ConfigurationTarget.Global);

        // Store API key securely with encryption
        if (this.context?.secrets) {
            // Encrypt the API key
            const encryptedKey = await this.encryptApiKey(sanitizedApiKey);
            await this.context.secrets.store(ConfigurationManager.API_KEY_SECRET, encryptedKey);

            // Store hash for integrity verification
            const keyHash = await this.hashApiKey(sanitizedApiKey);
            await this.context.secrets.store(ConfigurationManager.API_KEY_HASH_SECRET, keyHash);

            // Store metadata for key management
            const now = Date.now();
            const metadata: SecureKeyMetadata = {
                createdAt: now,
                lastUsed: now,
                usageCount: 0,
                rotationDue: false,
                expiresAt: now + (ConfigurationManager.KEY_ROTATION_DAYS * 24 * 60 * 60 * 1000)
            };
            await this.context.secrets.store(
                ConfigurationManager.API_KEY_METADATA_SECRET,
                JSON.stringify(metadata)
            );

            // Remove from settings if it exists there
            await config.update('apiKey', undefined, vscode.ConfigurationTarget.Global);

            this.contextLogger.info('API key stored securely with encryption and metadata');
        } else {
            // Fallback to settings if secrets not available
            await config.update('apiKey', sanitizedApiKey, vscode.ConfigurationTarget.Global);
            this.contextLogger.warn('Storing API key in settings (SecretStorage not available)');
        }
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
        return workspaceFolders[0]?.uri.fsPath || process.cwd();
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

    /**
     * Validate API key format based on provider
     */
    private validateApiKeyFormat(apiKey: string, provider: 'openai' | 'anthropic'): boolean {
        if (!apiKey || typeof apiKey !== 'string') {
            return false;
        }

        const trimmedKey = apiKey.trim();

        switch (provider) {
            case 'openai':
                // OpenAI API keys start with 'sk-' and are typically 51 characters long
                return /^sk-[A-Za-z0-9]{48}$/.test(trimmedKey);

            case 'anthropic':
                // Anthropic API keys start with 'sk-ant-' and are longer
                return /^sk-ant-[A-Za-z0-9\-_]{95,}$/.test(trimmedKey);

            default:
                return false;
        }
    }

    /**
     * Encrypt API key for secure storage
     */
    private async encryptApiKey(apiKey: string): Promise<string> {
        try {
            const encryptionKey = await this.getOrCreateEncryptionKey();
            const iv = crypto.randomBytes(16);
            const cipher = crypto.createCipher('aes-256-cbc', encryptionKey);

            let encrypted = cipher.update(apiKey, 'utf8', 'hex');
            encrypted += cipher.final('hex');

            // Combine IV and encrypted data
            return iv.toString('hex') + ':' + encrypted;
        } catch (error) {
            this.contextLogger.error('Failed to encrypt API key', error as Error);
            // Fallback to base64 encoding if encryption fails
            return Buffer.from(apiKey).toString('base64');
        }
    }

    /**
     * Decrypt API key from secure storage
     */
    private async decryptApiKey(encryptedKey: string): Promise<string> {
        try {
            // Check if it's the new encrypted format (contains ':')
            if (encryptedKey.includes(':')) {
                const encryptionKey = await this.getOrCreateEncryptionKey();
                const [ivHex, encrypted] = encryptedKey.split(':');
                if (!ivHex || !encrypted) {
                    throw new Error('Invalid encrypted data format');
                }
                const iv = Buffer.from(ivHex, 'hex');

                const decipher = crypto.createDecipher('aes-256-cbc', encryptionKey);
                let decrypted = decipher.update(encrypted, 'hex', 'utf8');
                decrypted += decipher.final('utf8');

                return decrypted;
            } else {
                // Fallback for base64 encoded keys
                return Buffer.from(encryptedKey, 'base64').toString('utf8');
            }
        } catch (error) {
            this.contextLogger.error('Failed to decrypt API key', error as Error);
            // If decryption fails, assume it's already plain text (backward compatibility)
            return encryptedKey;
        }
    }

    /**
     * Get or create encryption key for API key encryption
     */
    private async getOrCreateEncryptionKey(): Promise<string> {
        if (!this.context?.secrets) {
            throw new Error('SecretStorage not available');
        }

        let encryptionKey = await this.context.secrets.get(ConfigurationManager.ENCRYPTION_KEY_SECRET);

        if (!encryptionKey) {
            // Generate new encryption key
            encryptionKey = crypto.randomBytes(32).toString('hex');
            await this.context.secrets.store(ConfigurationManager.ENCRYPTION_KEY_SECRET, encryptionKey);
            this.contextLogger.info('Generated new encryption key for API key storage');
        }

        return encryptionKey;
    }

    /**
     * Migrate existing plain text API key to secure encrypted storage
     */
    private async migrateToSecureStorage(apiKey: string, provider: 'openai' | 'anthropic'): Promise<void> {
        this.contextLogger.info('Migrating API key to secure encrypted storage');
        await this.setApiConfiguration(provider, apiKey);
    }

    /**
     * Check if API key rotation is due
     */
    private async checkKeyRotationStatus(metadata: SecureKeyMetadata | null): Promise<{ rotationDue: boolean; daysUntilExpiry?: number }> {
        if (!metadata) {
            return { rotationDue: false };
        }

        const now = Date.now();
        const daysSinceCreation = (now - metadata.createdAt) / (24 * 60 * 60 * 1000);

        let rotationDue = false;
        let daysUntilExpiry: number | undefined;

        // Check if rotation is due based on age
        if (daysSinceCreation >= ConfigurationManager.KEY_ROTATION_DAYS) {
            rotationDue = true;
        }

        // Check if expiration is approaching
        if (metadata.expiresAt) {
            const daysUntilExpiration = (metadata.expiresAt - now) / (24 * 60 * 60 * 1000);
            daysUntilExpiry = Math.max(0, Math.floor(daysUntilExpiration));

            if (daysUntilExpiration <= ConfigurationManager.KEY_EXPIRY_WARNING_DAYS) {
                rotationDue = true;
            }
        }

        // Update metadata if rotation is due
        if (rotationDue && !metadata.rotationDue && this.context?.secrets) {
            metadata.rotationDue = true;
            await this.context.secrets.store(
                ConfigurationManager.API_KEY_METADATA_SECRET,
                JSON.stringify(metadata)
            );

            // Show warning to user
            vscode.window.showWarningMessage(
                'FlowCode API key rotation recommended',
                'Rotate Key',
                'Remind Later'
            ).then(selection => {
                if (selection === 'Rotate Key') {
                    vscode.commands.executeCommand('flowcode.configureApiKey');
                }
            });
        }

        return { rotationDue, daysUntilExpiry };
    }

    /**
     * Hash API key for integrity verification
     */
    private async hashApiKey(apiKey: string): Promise<string> {
        const crypto = await import('crypto');
        return crypto.createHash('sha256').update(apiKey).digest('hex');
    }

    /**
     * Verify API key integrity with enhanced security checks
     */
    public async verifyApiKeyIntegrity(): Promise<{ valid: boolean; issues: string[] }> {
        const issues: string[] = [];

        if (!this.context?.secrets) {
            issues.push('SecretStorage not available');
            return { valid: false, issues };
        }

        try {
            const encryptedKey = await this.context.secrets.get(ConfigurationManager.API_KEY_SECRET);
            const storedHash = await this.context.secrets.get(ConfigurationManager.API_KEY_HASH_SECRET);
            const metadataJson = await this.context.secrets.get(ConfigurationManager.API_KEY_METADATA_SECRET);

            if (!encryptedKey || !storedHash) {
                issues.push('API key or hash not found in secure storage');
                return { valid: false, issues };
            }

            // Decrypt and verify the API key
            const decryptedKey = await this.decryptApiKey(encryptedKey);
            const currentHash = await this.hashApiKey(decryptedKey);

            if (currentHash !== storedHash) {
                issues.push('API key integrity check failed - hash mismatch');
                return { valid: false, issues };
            }

            // Verify metadata integrity
            if (metadataJson) {
                try {
                    const metadata: SecureKeyMetadata = JSON.parse(metadataJson);

                    // Check if key has expired
                    if (metadata.expiresAt && Date.now() > metadata.expiresAt) {
                        issues.push('API key has expired');
                    }

                    // Check if rotation is overdue
                    const daysSinceCreation = (Date.now() - metadata.createdAt) / (24 * 60 * 60 * 1000);
                    if (daysSinceCreation > ConfigurationManager.KEY_ROTATION_DAYS + 30) { // 30 day grace period
                        issues.push('API key rotation is overdue');
                    }

                    // Check for suspicious usage patterns
                    if (metadata.usageCount > 10000) { // Arbitrary high usage threshold
                        issues.push('API key has unusually high usage count');
                    }

                } catch (error) {
                    issues.push('Failed to parse API key metadata');
                }
            }

            const isValid = issues.length === 0;

            if (isValid) {
                this.contextLogger.debug('API key integrity verification passed');
            } else {
                this.contextLogger.warn('API key integrity issues detected: ' + issues.join(', '));
            }

            return { valid: isValid, issues };

        } catch (error) {
            this.contextLogger.error('API key integrity verification failed', error as Error);
            issues.push(`Verification error: ${(error as Error).message}`);
            return { valid: false, issues };
        }
    }

    /**
     * Clear all stored API credentials and related data
     */
    public async clearApiCredentials(): Promise<void> {
        if (this.context?.secrets) {
            await this.context.secrets.delete(ConfigurationManager.API_KEY_SECRET);
            await this.context.secrets.delete(ConfigurationManager.API_KEY_HASH_SECRET);
            await this.context.secrets.delete(ConfigurationManager.API_KEY_METADATA_SECRET);
            // Note: We don't delete the encryption key as it might be reused
        }

        const config = vscode.workspace.getConfiguration(ConfigurationManager.CONFIG_SECTION);
        await config.update('apiKey', undefined, vscode.ConfigurationTarget.Global);
        await config.update('apiProvider', undefined, vscode.ConfigurationTarget.Global);

        this.contextLogger.info('All API credentials cleared from secure storage');
    }

    /**
     * Get API key usage statistics
     */
    public async getApiKeyStats(): Promise<SecureKeyMetadata | null> {
        if (!this.context?.secrets) {
            return null;
        }

        const metadataJson = await this.context.secrets.get(ConfigurationManager.API_KEY_METADATA_SECRET);
        if (!metadataJson) {
            return null;
        }

        try {
            return JSON.parse(metadataJson);
        } catch (error) {
            this.contextLogger.error('Failed to parse API key metadata', error as Error);
            return null;
        }
    }

    /**
     * Force API key rotation
     */
    public async rotateApiKey(): Promise<void> {
        // Clear existing credentials to force re-configuration
        await this.clearApiCredentials();

        // Show configuration dialog
        vscode.window.showInformationMessage(
            'API key rotation initiated. Please configure a new API key.',
            'Configure New Key'
        ).then(selection => {
            if (selection === 'Configure New Key') {
                vscode.commands.executeCommand('flowcode.configureApiKey');
            }
        });
    }

    /**
     * Test API key validity by making a test request
     */
    public async testApiKey(provider: 'openai' | 'anthropic', apiKey: string): Promise<boolean> {
        try {
            const axios = await import('axios');

            switch (provider) {
                case 'openai':
                    const openaiResponse = await axios.default.get('https://api.openai.com/v1/models', {
                        headers: {
                            'Authorization': `Bearer ${apiKey}`,
                            'Content-Type': 'application/json'
                        },
                        timeout: 10000
                    });
                    return openaiResponse.status === 200;

                case 'anthropic':
                    // Anthropic doesn't have a simple test endpoint, so we'll just validate format
                    return this.validateApiKeyFormat(apiKey, provider);

                default:
                    return false;
            }
        } catch (error) {
            return false;
        }
    }

    /**
     * Perform comprehensive security audit of API key storage
     */
    public async performSecurityAudit(): Promise<{
        passed: boolean;
        score: number;
        checks: Array<{ name: string; passed: boolean; severity: 'low' | 'medium' | 'high' | 'critical'; message: string }>;
    }> {
        const checks: Array<{ name: string; passed: boolean; severity: 'low' | 'medium' | 'high' | 'critical'; message: string }> = [];
        let score = 100;

        // Check 1: SecretStorage availability
        const hasSecretStorage = !!this.context?.secrets;
        checks.push({
            name: 'SecretStorage Available',
            passed: hasSecretStorage,
            severity: 'critical',
            message: hasSecretStorage ? 'Using VS Code SecretStorage API' : 'SecretStorage not available - keys may be stored in plain text'
        });
        if (!hasSecretStorage) {score -= 50;}

        // Check 2: API key integrity
        const integrityResult = await this.verifyApiKeyIntegrity();
        checks.push({
            name: 'API Key Integrity',
            passed: integrityResult.valid,
            severity: 'high',
            message: integrityResult.valid ? 'API key integrity verified' : `Integrity issues: ${integrityResult.issues.join(', ')}`
        });
        if (!integrityResult.valid) {score -= 30;}

        // Check 3: Encryption status
        let encryptionEnabled = false;
        if (this.context?.secrets) {
            const encryptionKey = await this.context.secrets.get(ConfigurationManager.ENCRYPTION_KEY_SECRET);
            encryptionEnabled = !!encryptionKey;
        }
        checks.push({
            name: 'API Key Encryption',
            passed: encryptionEnabled,
            severity: 'high',
            message: encryptionEnabled ? 'API keys are encrypted at rest' : 'API keys are not encrypted'
        });
        if (!encryptionEnabled) {score -= 25;}

        // Check 4: Key rotation status
        const keyStats = await this.getApiKeyStats();
        const rotationCurrent = keyStats ? !keyStats.rotationDue : true;
        checks.push({
            name: 'Key Rotation Status',
            passed: rotationCurrent,
            severity: 'medium',
            message: rotationCurrent ? 'Key rotation is current' : 'Key rotation is due'
        });
        if (!rotationCurrent) {score -= 15;}

        // Check 5: Configuration security
        const config = vscode.workspace.getConfiguration(ConfigurationManager.CONFIG_SECTION);
        const hasPlaintextKey = !!config.get<string>('apiKey');
        checks.push({
            name: 'No Plaintext Keys in Settings',
            passed: !hasPlaintextKey,
            severity: 'critical',
            message: hasPlaintextKey ? 'API key found in plaintext settings' : 'No plaintext keys in settings'
        });
        if (hasPlaintextKey) {score -= 40;}

        // Check 6: Key age and usage
        if (keyStats) {
            const keyAge = (Date.now() - keyStats.createdAt) / (24 * 60 * 60 * 1000);
            const ageAppropriate = keyAge < ConfigurationManager.KEY_ROTATION_DAYS * 1.5; // 1.5x rotation period
            checks.push({
                name: 'Key Age Appropriate',
                passed: ageAppropriate,
                severity: 'medium',
                message: ageAppropriate ? `Key age: ${Math.floor(keyAge)} days` : `Key is too old: ${Math.floor(keyAge)} days`
            });
            if (!ageAppropriate) {score -= 10;}
        }

        const passed = checks.every(check => check.passed || check.severity === 'low');
        score = Math.max(0, score);

        this.contextLogger.info('Security audit completed', {
            passed,
            score,
            criticalIssues: checks.filter(c => !c.passed && c.severity === 'critical').length
        });

        return { passed, score, checks };
    }

    /**
     * Get the configured API provider
     * @returns The API provider name (e.g., 'openai', 'anthropic')
     */
    public async getApiProvider(): Promise<string> {
        try {
            const config = await this.getApiConfiguration();
            return config.provider;
        } catch (error) {
            this.contextLogger.warn('Failed to get API provider, returning default', error as Error);
            return 'openai'; // Default fallback
        }
    }

    /**
     * Get the path to the VS Code configuration file
     * @returns Path to the settings.json file
     */
    public async getConfigFilePath(): Promise<string> {
        try {
            // Get the workspace configuration file path
            const workspaceRoot = await this.getWorkspaceRoot();
            const workspaceConfigPath = path.join(workspaceRoot, '.vscode', 'settings.json');

            // Check if workspace config exists
            if (fs.existsSync(workspaceConfigPath)) {
                return workspaceConfigPath;
            }

            // Fall back to user settings
            const userConfigDir = process.env.APPDATA ||
                                 (process.platform === 'darwin' ? process.env.HOME + '/Library/Application Support' : process.env.HOME + '/.config');

            if (userConfigDir) {
                return path.join(userConfigDir, 'Code', 'User', 'settings.json');
            }

            // Final fallback
            return path.join(process.env.HOME || '~', '.vscode', 'settings.json');

        } catch (error) {
            this.contextLogger.warn('Failed to determine config file path', error as Error);
            // Return a reasonable default
            return path.join(process.env.HOME || '~', '.vscode', 'settings.json');
        }
    }
}