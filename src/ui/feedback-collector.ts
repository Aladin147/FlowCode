import * as vscode from 'vscode';
import { logger } from '../utils/logger';

export interface FeedbackData {
    type: 'bug' | 'feature' | 'general' | 'performance';
    rating: number;
    comments?: string;
    email?: string;
    category?: string;
    timestamp: number;
}

export class FeedbackCollector {
    private contextLogger = logger.createContextLogger('FeedbackCollector');
    private panel: vscode.WebviewPanel | undefined;
    private feedbackData: FeedbackData | undefined;

    constructor(private telemetryService?: any) {} // Made optional for V0.2 transition

    /**
     * Show feedback form
     */
    public async show(initialType?: FeedbackData['type']): Promise<void> {
        try {
            // Create panel if it doesn't exist
            if (!this.panel) {
                this.panel = vscode.window.createWebviewPanel(
                    'flowcodeFeedback',
                    'FlowCode Feedback',
                    vscode.ViewColumn.One,
                    {
                        enableScripts: true,
                        retainContextWhenHidden: false,
                        localResourceRoots: []
                    }
                );

                // Handle panel disposal
                this.panel.onDidDispose(() => {
                    this.panel = undefined;
                }, null, []);

                // Handle messages from webview
                this.panel.webview.onDidReceiveMessage(message => {
                    this.handleWebviewMessage(message);
                });
            }

            // Initialize feedback data
            this.feedbackData = {
                type: initialType || 'general',
                rating: 0,
                timestamp: Date.now()
            };

            // Set initial content
            this.panel.webview.html = this.getWebviewContent();

            // Reveal panel
            this.panel.reveal(vscode.ViewColumn.One);

        } catch (error) {
            this.contextLogger.error('Failed to show feedback form', error as Error);
            vscode.window.showErrorMessage('Failed to show feedback form');
        }
    }

    /**
     * Handle messages from webview
     */
    private handleWebviewMessage(message: any): void {
        switch (message.command) {
            case 'updateFeedback':
                this.feedbackData = {
                    ...this.feedbackData!,
                    ...message.data
                };
                break;

            case 'submitFeedback':
                this.submitFeedback(message.data);
                break;

            case 'cancel':
                if (this.panel) {
                    this.panel.dispose();
                    this.panel = undefined;
                }
                break;
        }
    }

    /**
     * Submit feedback
     */
    private async submitFeedback(data: FeedbackData): Promise<void> {
        try {
            // Update feedback data
            this.feedbackData = {
                ...this.feedbackData!,
                ...data,
                timestamp: Date.now()
            };

            // Track feedback in telemetry
            this.telemetryService.trackFeedback(
                this.feedbackData.type,
                this.feedbackData.rating,
                this.feedbackData.comments
            );

            // Show confirmation
            if (this.panel) {
                this.panel.webview.html = this.getConfirmationContent();
            }

            // Log feedback
            this.contextLogger.info('Feedback submitted', {
                type: this.feedbackData.type,
                rating: this.feedbackData.rating,
                category: this.feedbackData.category
            });

            // In a real implementation, this would send feedback to a server
            // For now, we'll just show a confirmation message
            setTimeout(() => {
                if (this.panel) {
                    this.panel.dispose();
                    this.panel = undefined;
                }
                
                vscode.window.showInformationMessage(
                    'Thank you for your feedback! It helps us improve FlowCode.',
                    'Provide More Feedback',
                    'View Roadmap'
                ).then(action => {
                    if (action === 'Provide More Feedback') {
                        this.show();
                    } else if (action === 'View Roadmap') {
                        vscode.env.openExternal(vscode.Uri.parse('https://github.com/Aladin147/FlowCode/projects'));
                    }
                });
            }, 2000);

        } catch (error) {
            this.contextLogger.error('Failed to submit feedback', error as Error);
            vscode.window.showErrorMessage('Failed to submit feedback');
        }
    }

    /**
     * Get webview content
     */
    private getWebviewContent(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>FlowCode Feedback</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            padding: 20px;
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
        }
        .form-group {
            margin-bottom: 20px;
        }
        label {
            display: block;
            margin-bottom: 5px;
            font-weight: bold;
        }
        select, textarea, input[type="email"] {
            width: 100%;
            padding: 8px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 2px;
        }
        .rating {
            display: flex;
            flex-direction: row-reverse;
            justify-content: flex-end;
        }
        .rating > input {
            display: none;
        }
        .rating > label {
            position: relative;
            width: 1.1em;
            font-size: 2em;
            color: var(--vscode-descriptionForeground);
            cursor: pointer;
        }
        .rating > label::before {
            content: "\\2605";
            position: absolute;
            opacity: 0;
        }
        .rating > label:hover:before,
        .rating > label:hover ~ label:before {
            opacity: 1 !important;
        }
        .rating > input:checked ~ label:before {
            opacity: 1;
        }
        .rating > input:checked ~ label:hover:before {
            opacity: 1;
        }
        .actions {
            display: flex;
            justify-content: space-between;
            margin-top: 20px;
        }
        button {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 8px 12px;
            border-radius: 2px;
            cursor: pointer;
        }
        button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        button.secondary {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        button.secondary:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }
        .privacy-notice {
            margin-top: 20px;
            font-size: 0.8em;
            color: var(--vscode-descriptionForeground);
        }
        .required {
            color: var(--vscode-editorError-foreground);
        }
    </style>
</head>
<body>
    <h1>FlowCode Feedback</h1>
    <p>Your feedback helps us improve FlowCode. Please share your thoughts with us.</p>
    
    <div class="form-group">
        <label for="feedback-type">Feedback Type <span class="required">*</span></label>
        <select id="feedback-type">
            <option value="general" ${this.feedbackData?.type === 'general' ? 'selected' : ''}>General Feedback</option>
            <option value="bug" ${this.feedbackData?.type === 'bug' ? 'selected' : ''}>Bug Report</option>
            <option value="feature" ${this.feedbackData?.type === 'feature' ? 'selected' : ''}>Feature Request</option>
            <option value="performance" ${this.feedbackData?.type === 'performance' ? 'selected' : ''}>Performance Issue</option>
        </select>
    </div>
    
    <div class="form-group">
        <label for="category">Category</label>
        <select id="category">
            <option value="">-- Select Category --</option>
            <option value="code-generation">Code Generation</option>
            <option value="security">Security Features</option>
            <option value="performance">Performance</option>
            <option value="git-integration">Git Integration</option>
            <option value="ui">User Interface</option>
            <option value="documentation">Documentation</option>
            <option value="other">Other</option>
        </select>
    </div>
    
    <div class="form-group">
        <label>Rating <span class="required">*</span></label>
        <div class="rating">
            <input type="radio" id="star5" name="rating" value="5" />
            <label for="star5" title="Excellent">5</label>
            <input type="radio" id="star4" name="rating" value="4" />
            <label for="star4" title="Good">4</label>
            <input type="radio" id="star3" name="rating" value="3" />
            <label for="star3" title="Average">3</label>
            <input type="radio" id="star2" name="rating" value="2" />
            <label for="star2" title="Poor">2</label>
            <input type="radio" id="star1" name="rating" value="1" />
            <label for="star1" title="Very Poor">1</label>
        </div>
    </div>
    
    <div class="form-group">
        <label for="comments">Comments <span class="required">*</span></label>
        <textarea id="comments" rows="5" placeholder="Please provide details about your feedback..."></textarea>
    </div>
    
    <div class="form-group">
        <label for="email">Email (Optional)</label>
        <input type="email" id="email" placeholder="Your email for follow-up (optional)">
    </div>
    
    <div class="actions">
        <button id="cancel" class="secondary">Cancel</button>
        <button id="submit">Submit Feedback</button>
    </div>
    
    <div class="privacy-notice">
        <p>Privacy Notice: Your feedback may be used to improve FlowCode. Email addresses are only used for follow-up and are not stored with anonymous telemetry data. See our <a href="#" id="privacy-policy">Privacy Policy</a> for details.</p>
    </div>
    
    <script>
        (function() {
            const vscode = acquireVsCodeApi();
            let feedbackData = ${JSON.stringify(this.feedbackData)};
            
            // Initialize form
            document.getElementById('feedback-type').addEventListener('change', (e) => {
                feedbackData.type = e.target.value;
                vscode.postMessage({ command: 'updateFeedback', data: { type: e.target.value } });
            });
            
            document.getElementById('category').addEventListener('change', (e) => {
                feedbackData.category = e.target.value;
                vscode.postMessage({ command: 'updateFeedback', data: { category: e.target.value } });
            });
            
            document.querySelectorAll('input[name="rating"]').forEach(input => {
                input.addEventListener('change', (e) => {
                    feedbackData.rating = parseInt(e.target.value);
                    vscode.postMessage({ command: 'updateFeedback', data: { rating: parseInt(e.target.value) } });
                });
            });
            
            document.getElementById('comments').addEventListener('input', (e) => {
                feedbackData.comments = e.target.value;
                vscode.postMessage({ command: 'updateFeedback', data: { comments: e.target.value } });
            });
            
            document.getElementById('email').addEventListener('input', (e) => {
                feedbackData.email = e.target.value;
                vscode.postMessage({ command: 'updateFeedback', data: { email: e.target.value } });
            });
            
            // Handle submit
            document.getElementById('submit').addEventListener('click', () => {
                // Validate form
                if (!feedbackData.rating) {
                    alert('Please provide a rating');
                    return;
                }
                
                if (!feedbackData.comments) {
                    alert('Please provide comments');
                    return;
                }
                
                vscode.postMessage({ command: 'submitFeedback', data: feedbackData });
            });
            
            // Handle cancel
            document.getElementById('cancel').addEventListener('click', () => {
                vscode.postMessage({ command: 'cancel' });
            });
            
            // Handle privacy policy
            document.getElementById('privacy-policy').addEventListener('click', (e) => {
                e.preventDefault();
                vscode.postMessage({ command: 'openPrivacyPolicy' });
            });
            
            // Set initial rating if available
            if (feedbackData.rating) {
                document.getElementById('star' + feedbackData.rating).checked = true;
            }
            
            // Set initial comments if available
            if (feedbackData.comments) {
                document.getElementById('comments').value = feedbackData.comments;
            }
            
            // Set initial email if available
            if (feedbackData.email) {
                document.getElementById('email').value = feedbackData.email;
            }
            
            // Set initial category if available
            if (feedbackData.category) {
                document.getElementById('category').value = feedbackData.category;
            }
        })();
    </script>
</body>
</html>`;
    }

    /**
     * Get confirmation content
     */
    private getConfirmationContent(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Feedback Submitted</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            padding: 20px;
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            text-align: center;
        }
        .success-icon {
            font-size: 48px;
            color: var(--vscode-testing-iconPassed);
            margin-bottom: 20px;
        }
        h1 {
            margin-bottom: 20px;
        }
        p {
            margin-bottom: 30px;
        }
    </style>
</head>
<body>
    <div class="success-icon">✓</div>
    <h1>Thank You for Your Feedback!</h1>
    <p>Your feedback has been submitted successfully. We appreciate your input and will use it to improve FlowCode.</p>
    <p>This window will close automatically...</p>
</body>
</html>`;
    }

    /**
     * Dispose resources
     */
    public dispose(): void {
        if (this.panel) {
            this.panel.dispose();
            this.panel = undefined;
        }

        this.contextLogger.info('FeedbackCollector disposed');
    }
}
