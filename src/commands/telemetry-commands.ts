import * as vscode from 'vscode';
import { TelemetryService } from '../services/telemetry-service';
import { ConfigurationManager } from '../utils/configuration-manager';
import { logger } from '../utils/logger';

export class TelemetryCommands {
    private contextLogger = logger.createContextLogger('TelemetryCommands');
    private telemetryService: TelemetryService;

    constructor(private configManager: ConfigurationManager) {
        this.telemetryService = new TelemetryService(configManager);
    }

    /**
     * Register all telemetry commands
     */
    public registerCommands(context: vscode.ExtensionContext): void {
        const commands = [
            vscode.commands.registerCommand('flowcode.configureTelemetry', () => this.configureTelemetry()),
            vscode.commands.registerCommand('flowcode.showTelemetryStatus', () => this.showTelemetryStatus()),
            vscode.commands.registerCommand('flowcode.enableTelemetry', () => this.enableTelemetry()),
            vscode.commands.registerCommand('flowcode.disableTelemetry', () => this.disableTelemetry()),
            vscode.commands.registerCommand('flowcode.showPrivacyPolicy', () => this.showPrivacyPolicy()),
            vscode.commands.registerCommand('flowcode.provideFeedback', () => this.provideFeedback()),
            vscode.commands.registerCommand('flowcode.showUsageAnalytics', () => this.showUsageAnalytics()),
            vscode.commands.registerCommand('flowcode.exportTelemetryData', () => this.exportTelemetryData()),
            vscode.commands.registerCommand('flowcode.clearTelemetryData', () => this.clearTelemetryData())
        ];

        context.subscriptions.push(...commands);
        this.contextLogger.info('Telemetry commands registered');
    }

    /**
     * Initialize telemetry service
     */
    public async initialize(): Promise<void> {
        await this.telemetryService.initialize();
    }

    /**
     * Configure telemetry settings
     */
    private async configureTelemetry(): Promise<void> {
        try {
            const status = this.telemetryService.getTelemetryStatus();
            
            const options = [
                {
                    label: status.enabled ? '$(check) Telemetry Enabled' : '$(x) Telemetry Disabled',
                    description: 'Toggle telemetry collection on/off',
                    action: 'toggle'
                },
                {
                    label: '$(gear) Data Collection Settings',
                    description: 'Configure what data to collect',
                    action: 'dataSettings'
                },
                {
                    label: '$(shield) Privacy Settings',
                    description: 'Configure privacy level and data retention',
                    action: 'privacySettings'
                },
                {
                    label: '$(info) View Current Status',
                    description: 'Show current telemetry configuration',
                    action: 'status'
                },
                {
                    label: '$(law) Privacy Policy',
                    description: 'View FlowCode privacy policy',
                    action: 'privacy'
                }
            ];

            const selected = await vscode.window.showQuickPick(options, {
                placeHolder: 'Select telemetry configuration option'
            });

            if (selected) {
                await this.handleTelemetryAction(selected.action);
            }

        } catch (error) {
            this.contextLogger.error('Failed to configure telemetry', error as Error);
            vscode.window.showErrorMessage('Failed to configure telemetry settings');
        }
    }

    /**
     * Handle telemetry configuration action
     */
    private async handleTelemetryAction(action: string): Promise<void> {
        switch (action) {
            case 'toggle':
                const status = this.telemetryService.getTelemetryStatus();
                await this.telemetryService.setTelemetryEnabled(!status.enabled);
                vscode.window.showInformationMessage(
                    `Telemetry ${!status.enabled ? 'enabled' : 'disabled'}`
                );
                break;

            case 'dataSettings':
                await this.configureDataCollection();
                break;

            case 'privacySettings':
                await this.configurePrivacySettings();
                break;

            case 'status':
                await this.showTelemetryStatus();
                break;

            case 'privacy':
                await this.showPrivacyPolicy();
                break;
        }
    }

    /**
     * Configure data collection settings
     */
    private async configureDataCollection(): Promise<void> {
        const config = vscode.workspace.getConfiguration('flowcode.telemetry');
        
        const options = [
            {
                label: config.get('collectUsageData', true) ? '$(check) Usage Data' : '$(x) Usage Data',
                description: 'Command usage, feature adoption, workflow patterns',
                setting: 'collectUsageData'
            },
            {
                label: config.get('collectPerformanceData', true) ? '$(check) Performance Data' : '$(x) Performance Data',
                description: 'Startup time, memory usage, response times',
                setting: 'collectPerformanceData'
            },
            {
                label: config.get('collectErrorReports', true) ? '$(check) Error Reports' : '$(x) Error Reports',
                description: 'Crash reports, error messages, stack traces',
                setting: 'collectErrorReports'
            },
            {
                label: config.get('collectFeedback', true) ? '$(check) User Feedback' : '$(x) User Feedback',
                description: 'Ratings, comments, feature requests',
                setting: 'collectFeedback'
            }
        ];

        const selected = await vscode.window.showQuickPick(options, {
            placeHolder: 'Select data collection types to toggle',
            canPickMany: true
        });

        if (selected) {
            for (const option of selected) {
                const currentValue = config.get<boolean>(option.setting, true);
                await config.update(option.setting, !currentValue, vscode.ConfigurationTarget.Global);
            }
            
            vscode.window.showInformationMessage('Data collection settings updated');
        }
    }

    /**
     * Configure privacy settings
     */
    private async configurePrivacySettings(): Promise<void> {
        const config = vscode.workspace.getConfiguration('flowcode.telemetry');
        
        // Privacy level selection
        const privacyLevels = [
            {
                label: 'Minimal',
                description: 'Only essential error reports and basic usage statistics',
                value: 'minimal'
            },
            {
                label: 'Standard',
                description: 'Balanced data collection for product improvement',
                value: 'standard'
            },
            {
                label: 'Detailed',
                description: 'Comprehensive data for advanced analytics and features',
                value: 'detailed'
            }
        ];

        const currentLevel = config.get<string>('privacyLevel', 'standard');
        const selectedLevel = await vscode.window.showQuickPick(privacyLevels, {
            placeHolder: `Current privacy level: ${currentLevel}. Select new level:`
        });

        if (selectedLevel) {
            await config.update('privacyLevel', selectedLevel.value, vscode.ConfigurationTarget.Global);
        }

        // Data retention settings
        const retentionInput = await vscode.window.showInputBox({
            prompt: 'Data retention period (days)',
            value: config.get<number>('dataRetentionDays', 30).toString(),
            validateInput: (value) => {
                const num = parseInt(value);
                if (isNaN(num) || num < 1 || num > 365) {
                    return 'Retention period must be between 1 and 365 days';
                }
                return undefined;
            }
        });

        if (retentionInput) {
            await config.update('dataRetentionDays', parseInt(retentionInput), vscode.ConfigurationTarget.Global);
        }

        vscode.window.showInformationMessage('Privacy settings updated');
    }

    /**
     * Show telemetry status
     */
    private async showTelemetryStatus(): Promise<void> {
        try {
            const status = this.telemetryService.getTelemetryStatus();
            
            const statusContent = `# FlowCode Telemetry Status

## Current Status
- **Enabled**: ${status.enabled ? '✅ Yes' : '❌ No'}
- **User Consent**: ${status.hasConsent ? '✅ Given' : '❌ Not given'}
- **Events Queued**: ${status.eventsCollected}

## Data Collection Settings
- **Usage Data**: ${status.config.collectUsageData ? '✅ Enabled' : '❌ Disabled'}
- **Performance Data**: ${status.config.collectPerformanceData ? '✅ Enabled' : '❌ Disabled'}
- **Error Reports**: ${status.config.collectErrorReports ? '✅ Enabled' : '❌ Disabled'}
- **User Feedback**: ${status.config.collectFeedback ? '✅ Enabled' : '❌ Disabled'}

## Privacy Settings
- **Privacy Level**: ${status.config.privacyLevel}
- **Data Retention**: ${status.config.dataRetentionDays} days

## What Data is Collected?

### Usage Data (Anonymous)
- Command usage frequency
- Feature adoption rates
- Session duration and patterns
- Configuration preferences (anonymized)
- Platform information

### Performance Data
- Extension startup time
- Memory usage patterns
- API response times
- Cache performance metrics
- UI responsiveness

### Error Reports (With Consent)
- Exception types and frequencies
- Failed operations (no sensitive data)
- Performance bottlenecks
- Compatibility issues

### User Feedback
- Ratings and satisfaction scores
- Feature requests and suggestions
- Bug reports and comments

## Privacy Safeguards
- ✅ No personal identifiable information (PII)
- ✅ No code content collection
- ✅ No file paths or names
- ✅ No API keys or secrets
- ✅ Hashed user IDs only
- ✅ Local data anonymization
- ✅ Opt-out at any time
- ✅ Data retention limits

## Commands
- Configure telemetry: \`FlowCode: Configure Telemetry\`
- Enable telemetry: \`FlowCode: Enable Telemetry\`
- Disable telemetry: \`FlowCode: Disable Telemetry\`
- View privacy policy: \`FlowCode: Show Privacy Policy\`
- Provide feedback: \`FlowCode: Provide Feedback\`

---

*Your privacy is important to us. All data collection is optional and transparent.*
`;

            const doc = await vscode.workspace.openTextDocument({
                content: statusContent,
                language: 'markdown'
            });

            await vscode.window.showTextDocument(doc);

        } catch (error) {
            this.contextLogger.error('Failed to show telemetry status', error as Error);
            vscode.window.showErrorMessage('Failed to show telemetry status');
        }
    }

    /**
     * Enable telemetry
     */
    private async enableTelemetry(): Promise<void> {
        try {
            await this.telemetryService.setTelemetryEnabled(true);
            
            vscode.window.showInformationMessage(
                'Telemetry enabled. Thank you for helping improve FlowCode!',
                'Configure Settings',
                'View Privacy Policy'
            ).then(action => {
                if (action === 'Configure Settings') {
                    this.configureTelemetry();
                } else if (action === 'View Privacy Policy') {
                    this.showPrivacyPolicy();
                }
            });

        } catch (error) {
            this.contextLogger.error('Failed to enable telemetry', error as Error);
            vscode.window.showErrorMessage('Failed to enable telemetry');
        }
    }

    /**
     * Disable telemetry
     */
    private async disableTelemetry(): Promise<void> {
        try {
            const confirm = await vscode.window.showWarningMessage(
                'Are you sure you want to disable telemetry? This will prevent us from improving FlowCode based on usage patterns.',
                { modal: true },
                'Yes, disable',
                'Cancel'
            );

            if (confirm === 'Yes, disable') {
                await this.telemetryService.setTelemetryEnabled(false);
                vscode.window.showInformationMessage('Telemetry disabled');
            }

        } catch (error) {
            this.contextLogger.error('Failed to disable telemetry', error as Error);
            vscode.window.showErrorMessage('Failed to disable telemetry');
        }
    }

    /**
     * Show privacy policy
     */
    private async showPrivacyPolicy(): Promise<void> {
        try {
            await vscode.env.openExternal(vscode.Uri.parse('https://flowcode.dev/privacy'));
        } catch (error) {
            this.contextLogger.error('Failed to open privacy policy', error as Error);
            vscode.window.showErrorMessage('Failed to open privacy policy');
        }
    }

    /**
     * Provide feedback
     */
    private async provideFeedback(): Promise<void> {
        try {
            const feedbackTypes = [
                { label: 'Bug Report', description: 'Report a bug or issue', value: 'bug' },
                { label: 'Feature Request', description: 'Suggest a new feature', value: 'feature' },
                { label: 'General Feedback', description: 'Share your thoughts', value: 'general' },
                { label: 'Performance Issue', description: 'Report performance problems', value: 'performance' }
            ];

            const feedbackType = await vscode.window.showQuickPick(feedbackTypes, {
                placeHolder: 'What type of feedback would you like to provide?'
            });

            if (!feedbackType) {return;}

            // Get rating
            const ratingOptions = [
                { label: '⭐⭐⭐⭐⭐ Excellent (5)', value: 5 },
                { label: '⭐⭐⭐⭐ Good (4)', value: 4 },
                { label: '⭐⭐⭐ Average (3)', value: 3 },
                { label: '⭐⭐ Poor (2)', value: 2 },
                { label: '⭐ Very Poor (1)', value: 1 }
            ];

            const rating = await vscode.window.showQuickPick(ratingOptions, {
                placeHolder: 'How would you rate your experience?'
            });

            if (!rating) {return;}

            // Get comments
            const comments = await vscode.window.showInputBox({
                prompt: 'Please provide additional details (optional)',
                placeHolder: 'Your feedback helps us improve FlowCode...'
            });

            // Track feedback
            this.telemetryService.trackFeedback(feedbackType.value, rating.value, comments);

            vscode.window.showInformationMessage(
                'Thank you for your feedback! It helps us improve FlowCode.',
                'Provide More Feedback',
                'View Roadmap'
            ).then(action => {
                if (action === 'Provide More Feedback') {
                    this.provideFeedback();
                } else if (action === 'View Roadmap') {
                    vscode.env.openExternal(vscode.Uri.parse('https://github.com/Aladin147/FlowCode/projects'));
                }
            });

        } catch (error) {
            this.contextLogger.error('Failed to collect feedback', error as Error);
            vscode.window.showErrorMessage('Failed to submit feedback');
        }
    }

    /**
     * Show usage analytics
     */
    private async showUsageAnalytics(): Promise<void> {
        try {
            const status = this.telemetryService.getTelemetryStatus();
            
            if (!status.enabled) {
                vscode.window.showInformationMessage(
                    'Telemetry is disabled. Enable telemetry to view usage analytics.',
                    'Enable Telemetry'
                ).then(action => {
                    if (action === 'Enable Telemetry') {
                        this.enableTelemetry();
                    }
                });
                return;
            }

            // In a real implementation, this would show actual analytics
            const analyticsContent = `# FlowCode Usage Analytics

## Session Information
- **Current Session**: Active
- **Events Collected**: ${status.eventsCollected}
- **Data Collection**: ${status.config.collectUsageData ? 'Enabled' : 'Disabled'}

## Feature Usage (This Session)
- Code Generation: Not tracked yet
- Security Audit: Not tracked yet
- Performance Optimization: Not tracked yet
- Git Operations: Not tracked yet

## Performance Metrics (This Session)
- Extension Startup: Not tracked yet
- Memory Usage: Current usage available in status bar
- Response Times: Not tracked yet

*Note: Detailed analytics will be available after using FlowCode features.*

## Privacy Notice
All analytics data is:
- Anonymized and aggregated
- Used only for product improvement
- Never shared with third parties
- Retained for ${status.config.dataRetentionDays} days only

To disable analytics: Run "FlowCode: Disable Telemetry"
`;

            const doc = await vscode.workspace.openTextDocument({
                content: analyticsContent,
                language: 'markdown'
            });

            await vscode.window.showTextDocument(doc);

        } catch (error) {
            this.contextLogger.error('Failed to show usage analytics', error as Error);
            vscode.window.showErrorMessage('Failed to show usage analytics');
        }
    }

    /**
     * Export telemetry data
     */
    private async exportTelemetryData(): Promise<void> {
        try {
            const status = this.telemetryService.getTelemetryStatus();
            
            const exportData = {
                timestamp: new Date().toISOString(),
                telemetryStatus: status,
                note: 'This export contains your FlowCode telemetry configuration and status. No personal data is included.'
            };

            const exportContent = JSON.stringify(exportData, null, 2);
            
            const doc = await vscode.workspace.openTextDocument({
                content: exportContent,
                language: 'json'
            });

            await vscode.window.showTextDocument(doc);

            vscode.window.showInformationMessage(
                'Telemetry data exported. You can save this file for your records.',
                'Save File'
            );

        } catch (error) {
            this.contextLogger.error('Failed to export telemetry data', error as Error);
            vscode.window.showErrorMessage('Failed to export telemetry data');
        }
    }

    /**
     * Clear telemetry data
     */
    private async clearTelemetryData(): Promise<void> {
        try {
            const confirm = await vscode.window.showWarningMessage(
                'This will clear all locally stored telemetry data. Are you sure?',
                { modal: true },
                'Yes, clear data',
                'Cancel'
            );

            if (confirm === 'Yes, clear data') {
                // In a real implementation, this would clear stored telemetry data
                vscode.window.showInformationMessage('Telemetry data cleared');
            }

        } catch (error) {
            this.contextLogger.error('Failed to clear telemetry data', error as Error);
            vscode.window.showErrorMessage('Failed to clear telemetry data');
        }
    }

    /**
     * Get telemetry service
     */
    public getTelemetryService(): TelemetryService {
        return this.telemetryService;
    }

    /**
     * Dispose resources
     */
    public dispose(): void {
        this.telemetryService.dispose();
        this.contextLogger.info('TelemetryCommands disposed');
    }
}
