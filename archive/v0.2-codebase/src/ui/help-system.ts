import * as vscode from 'vscode';
import { logger } from '../utils/logger';

export interface HelpTopic {
    id: string;
    title: string;
    content: string;
    category: string;
    tags: string[];
    relatedTopics?: string[];
    videoUrl?: string;
    exampleCode?: string;
}

export interface HelpCategory {
    id: string;
    name: string;
    description: string;
    icon: string;
    topics: string[];
}

export class HelpSystem {
    private static instance: HelpSystem;
    private contextLogger = logger.createContextLogger('HelpSystem');
    private helpTopics: Map<string, HelpTopic> = new Map();
    private helpCategories: Map<string, HelpCategory> = new Map();

    private constructor() {
        this.initializeHelpContent();
    }

    public static getInstance(): HelpSystem {
        if (!HelpSystem.instance) {
            HelpSystem.instance = new HelpSystem();
        }
        return HelpSystem.instance;
    }

    /**
     * Show help panel with search and navigation
     */
    public async showHelpPanel(): Promise<void> {
        const panel = vscode.window.createWebviewPanel(
            'flowcodeHelp',
            'FlowCode Help',
            vscode.ViewColumn.Beside,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        panel.webview.html = this.generateHelpPanelHtml();

        // Handle messages from webview
        panel.webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case 'searchHelp':
                    const results = this.searchHelp(message.query);
                    panel.webview.postMessage({
                        command: 'searchResults',
                        results
                    });
                    break;
                case 'showTopic':
                    const topic = this.helpTopics.get(message.topicId);
                    if (topic) {
                        panel.webview.postMessage({
                            command: 'showTopicContent',
                            topic
                        });
                    }
                    break;
                case 'openExternal':
                    vscode.env.openExternal(vscode.Uri.parse(message.url));
                    break;
                case 'runExample':
                    await this.runCodeExample(message.code, message.language);
                    break;
            }
        });

        this.contextLogger.info('Help panel opened');
    }

    /**
     * Show quick help for a specific topic
     */
    public async showQuickHelp(topicId: string): Promise<void> {
        const topic = this.helpTopics.get(topicId);
        if (!topic) {
            vscode.window.showErrorMessage(`Help topic '${topicId}' not found`);
            return;
        }

        const actions: string[] = [];
        if (topic.videoUrl) {
            actions.push('📺 Watch Video');
        }
        if (topic.exampleCode) {
            actions.push('💻 Run Example');
        }
        actions.push('📖 Open Full Help');

        const result = await vscode.window.showInformationMessage(
            `${topic.title}\n\n${topic.content.substring(0, 200)}...`,
            { modal: false },
            ...actions
        );

        await this.handleQuickHelpAction(result, topic);
    }

    /**
     * Search help topics
     */
    public searchHelp(query: string): HelpTopic[] {
        const searchTerms = query.toLowerCase().split(' ');
        const results: Array<{ topic: HelpTopic; score: number }> = [];

        for (const topic of this.helpTopics.values()) {
            let score = 0;
            const searchableText = `${topic.title} ${topic.content} ${topic.tags.join(' ')}`.toLowerCase();

            for (const term of searchTerms) {
                if (topic.title.toLowerCase().includes(term)) {
                    score += 10; // Title matches are weighted higher
                }
                if (topic.tags.some(tag => tag.toLowerCase().includes(term))) {
                    score += 5; // Tag matches
                }
                if (searchableText.includes(term)) {
                    score += 1; // Content matches
                }
            }

            if (score > 0) {
                results.push({ topic, score });
            }
        }

        return results
            .sort((a, b) => b.score - a.score)
            .slice(0, 10)
            .map(r => r.topic);
    }

    /**
     * Get help topics by category
     */
    public getTopicsByCategory(categoryId: string): HelpTopic[] {
        const category = this.helpCategories.get(categoryId);
        if (!category) {
            return [];
        }

        return category.topics
            .map(topicId => this.helpTopics.get(topicId))
            .filter(Boolean) as HelpTopic[];
    }

    /**
     * Show contextual help based on current editor
     */
    public async showContextualHelp(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            await this.showHelpPanel();
            return;
        }

        const language = editor.document.languageId;
        const selection = editor.selection;
        const selectedText = editor.document.getText(selection);

        // Determine relevant help topics based on context
        let relevantTopics: string[] = [];

        if (selectedText.includes('flowcode')) {
            relevantTopics.push('getting-started');
        }

        if (language === 'typescript' || language === 'javascript') {
            relevantTopics.push('companion-guard', 'architect-service');
        }

        if (selectedText.includes('git') || selectedText.includes('commit')) {
            relevantTopics.push('hotfix-service', 'final-guard');
        }

        if (relevantTopics.length === 0) {
            relevantTopics = ['getting-started'];
        }

        // Show quick pick with relevant topics
        const items = relevantTopics.map(topicId => {
            const topic = this.helpTopics.get(topicId);
            return topic ? {
                label: `📖 ${topic.title}`,
                description: topic.content.substring(0, 100) + '...',
                topicId
            } : null;
        }).filter((item): item is { label: string; description: string; topicId: string } => item !== null);

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select a help topic',
            title: 'FlowCode Help'
        });

        if (selected) {
            await this.showQuickHelp(selected.topicId);
        }
    }

    /**
     * Initialize help content
     */
    private initializeHelpContent(): void {
        // Categories
        this.helpCategories.set('getting-started', {
            id: 'getting-started',
            name: 'Getting Started',
            description: 'Learn the basics of FlowCode',
            icon: '🚀',
            topics: ['overview', 'installation', 'first-steps', 'configuration']
        });

        this.helpCategories.set('features', {
            id: 'features',
            name: 'Features',
            description: 'Explore FlowCode features',
            icon: '⚡',
            topics: ['companion-guard', 'architect-service', 'graph-service', 'hotfix-service', 'final-guard']
        });

        this.helpCategories.set('troubleshooting', {
            id: 'troubleshooting',
            name: 'Troubleshooting',
            description: 'Solve common issues',
            icon: '🔧',
            topics: ['common-issues', 'performance', 'api-errors', 'git-issues']
        });

        // Topics
        this.helpTopics.set('overview', {
            id: 'overview',
            title: 'FlowCode Overview',
            content: `FlowCode is an intelligent VS Code extension that enhances your development workflow with AI-powered features:

• **Companion Guard**: Real-time code quality monitoring
• **Architect Service**: AI-powered code refactoring
• **Graph Service**: Visual code dependency analysis
• **Hotfix Service**: Streamlined emergency fixes
• **Final Guard**: Pre-commit quality gates

FlowCode integrates seamlessly with your existing workflow, providing intelligent assistance without disrupting your development process.`,
            category: 'getting-started',
            tags: ['overview', 'introduction', 'features'],
            relatedTopics: ['installation', 'first-steps']
        });

        this.helpTopics.set('companion-guard', {
            id: 'companion-guard',
            title: 'Companion Guard',
            content: `Companion Guard provides real-time code quality monitoring with:

• **Live Linting**: ESLint integration with instant feedback
• **Type Checking**: TypeScript compiler integration
• **Performance Monitoring**: Track check execution times
• **Smart Caching**: Avoid redundant checks
• **Status Bar Integration**: Visual feedback on code quality

The Companion Guard runs automatically when you save files and provides immediate feedback through the status bar and problems panel.`,
            category: 'features',
            tags: ['companion-guard', 'linting', 'typescript', 'quality'],
            relatedTopics: ['final-guard', 'performance'],
            exampleCode: `// Companion Guard will automatically check this code
function calculateTotal(items: Item[]): number {
    return items.reduce((sum, item) => sum + item.price, 0);
}`
        });

        this.helpTopics.set('architect-service', {
            id: 'architect-service',
            title: 'Architect Service',
            content: `The Architect Service uses AI to improve your code:

• **Smart Refactoring**: AI-powered code improvements
• **Multiple Providers**: OpenAI and Anthropic support
• **Context Awareness**: Understands your codebase
• **Rate Limiting**: Prevents API abuse
• **Secure Storage**: API keys stored securely

To use: Select code → Right-click → "FlowCode: Elevate to Architect" or use Ctrl+Shift+P → "FlowCode: Elevate to Architect"`,
            category: 'features',
            tags: ['architect', 'ai', 'refactoring', 'openai', 'anthropic'],
            relatedTopics: ['configuration', 'api-errors'],
            exampleCode: `// Select this code and use Architect to improve it
function processData(data) {
    var result = [];
    for (var i = 0; i < data.length; i++) {
        if (data[i].active) {
            result.push(data[i].name.toUpperCase());
        }
    }
    return result;
}`
        });

        this.helpTopics.set('configuration', {
            id: 'configuration',
            title: 'Configuration',
            content: `Configure FlowCode for optimal performance:

**API Configuration:**
• Use Command Palette: "FlowCode: Configure API Key"
• Supports OpenAI and Anthropic
• Keys stored securely using VS Code SecretStorage

**Settings:**
• \`flowcode.ai.provider\`: Choose AI provider
• \`flowcode.ai.maxTokens\`: Set token limit
• \`flowcode.companion.debounceDelay\`: Adjust check frequency

**Security:**
• API keys are encrypted and never logged
• Rate limiting prevents abuse
• Input validation protects against injection`,
            category: 'getting-started',
            tags: ['configuration', 'api', 'settings', 'security'],
            relatedTopics: ['api-errors', 'troubleshooting']
        });

        this.helpTopics.set('common-issues', {
            id: 'common-issues',
            title: 'Common Issues',
            content: `**API Key Issues:**
• Ensure API key is valid and has sufficient credits
• Check network connectivity
• Verify provider selection (OpenAI/Anthropic)

**Performance Issues:**
• Clear cache: Command Palette → "FlowCode: Show Status"
• Check system resources
• Adjust debounce delay in settings

**Git Issues:**
• Ensure git is installed and configured
• Check repository status
• Verify file permissions for git hooks

**General Troubleshooting:**
• Restart VS Code
• Check VS Code Developer Console (Help → Toggle Developer Tools)
• Run security audit for detailed diagnostics`,
            category: 'troubleshooting',
            tags: ['troubleshooting', 'issues', 'problems', 'debug'],
            relatedTopics: ['performance', 'api-errors', 'git-issues']
        });

        this.contextLogger.info('Help content initialized', {
            topics: this.helpTopics.size,
            categories: this.helpCategories.size
        });
    }

    /**
     * Handle quick help actions
     */
    private async handleQuickHelpAction(action: string | undefined, topic: HelpTopic): Promise<void> {
        if (!action) {return;}

        switch (action) {
            case '📺 Watch Video':
                if (topic.videoUrl) {
                    vscode.env.openExternal(vscode.Uri.parse(topic.videoUrl));
                }
                break;
            case '💻 Run Example':
                if (topic.exampleCode) {
                    await this.runCodeExample(topic.exampleCode, 'typescript');
                }
                break;
            case '📖 Open Full Help':
                await this.showHelpPanel();
                break;
        }
    }

    /**
     * Run code example in new editor
     */
    private async runCodeExample(code: string, language: string): Promise<void> {
        const document = await vscode.workspace.openTextDocument({
            content: code,
            language
        });
        await vscode.window.showTextDocument(document);
    }

    /**
     * Generate help panel HTML
     */
    private generateHelpPanelHtml(): string {
        const categories = Array.from(this.helpCategories.values());
        
        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>FlowCode Help</title>
            <style>
                body { 
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
                    margin: 0; 
                    padding: 20px;
                    background: var(--vscode-editor-background);
                    color: var(--vscode-editor-foreground);
                }
                .header { margin-bottom: 20px; }
                .search-box { 
                    width: 100%; 
                    padding: 10px; 
                    border: 1px solid var(--vscode-input-border);
                    background: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    border-radius: 4px;
                    margin-bottom: 20px;
                }
                .categories { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 15px; }
                .category { 
                    background: var(--vscode-editor-inactiveSelectionBackground); 
                    padding: 15px; 
                    border-radius: 8px; 
                    border: 1px solid var(--vscode-panel-border);
                    cursor: pointer;
                }
                .category:hover { background: var(--vscode-list-hoverBackground); }
                .category-icon { font-size: 24px; margin-bottom: 10px; }
                .category-title { font-weight: bold; margin-bottom: 5px; }
                .category-desc { font-size: 14px; opacity: 0.8; }
                .content { margin-top: 20px; }
                .topic { 
                    background: var(--vscode-editor-inactiveSelectionBackground); 
                    padding: 15px; 
                    margin: 10px 0; 
                    border-radius: 8px;
                    border: 1px solid var(--vscode-panel-border);
                }
                .topic-title { font-weight: bold; margin-bottom: 10px; color: var(--vscode-textLink-foreground); }
                .topic-content { line-height: 1.6; white-space: pre-wrap; }
                .topic-tags { margin-top: 10px; }
                .tag { 
                    background: var(--vscode-badge-background); 
                    color: var(--vscode-badge-foreground);
                    padding: 2px 8px; 
                    border-radius: 12px; 
                    font-size: 12px; 
                    margin-right: 5px;
                }
                .button { 
                    background: var(--vscode-button-background); 
                    color: var(--vscode-button-foreground);
                    border: none; 
                    padding: 8px 16px; 
                    border-radius: 4px; 
                    cursor: pointer;
                    margin: 4px;
                }
                .button:hover { background: var(--vscode-button-hoverBackground); }
                .hidden { display: none; }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>🚀 FlowCode Help</h1>
                <input type="text" class="search-box" placeholder="Search help topics..." id="searchInput">
            </div>

            <div id="categoriesView">
                <div class="categories">
                    ${categories.map(cat => `
                        <div class="category" onclick="showCategory('${cat.id}')">
                            <div class="category-icon">${cat.icon}</div>
                            <div class="category-title">${cat.name}</div>
                            <div class="category-desc">${cat.description}</div>
                        </div>
                    `).join('')}
                </div>
            </div>

            <div id="contentView" class="content hidden">
                <button class="button" onclick="showCategories()">← Back to Categories</button>
                <div id="topicContent"></div>
            </div>

            <script>
                const vscode = acquireVsCodeApi();
                
                document.getElementById('searchInput').addEventListener('input', (e) => {
                    if (e.target.value.trim()) {
                        vscode.postMessage({ command: 'searchHelp', query: e.target.value });
                    } else {
                        showCategories();
                    }
                });

                function showCategory(categoryId) {
                    // This would be implemented to show category topics
                    console.log('Show category:', categoryId);
                }

                function showCategories() {
                    document.getElementById('categoriesView').classList.remove('hidden');
                    document.getElementById('contentView').classList.add('hidden');
                }

                function showTopic(topicId) {
                    vscode.postMessage({ command: 'showTopic', topicId });
                }

                // Handle messages from extension
                window.addEventListener('message', event => {
                    const message = event.data;
                    switch (message.command) {
                        case 'searchResults':
                            showSearchResults(message.results);
                            break;
                        case 'showTopicContent':
                            showTopicContent(message.topic);
                            break;
                    }
                });

                function showSearchResults(results) {
                    const contentDiv = document.getElementById('topicContent');
                    contentDiv.innerHTML = results.map(topic => \`
                        <div class="topic" onclick="showTopic('\${topic.id}')">
                            <div class="topic-title">\${topic.title}</div>
                            <div class="topic-content">\${topic.content.substring(0, 200)}...</div>
                            <div class="topic-tags">
                                \${topic.tags.map(tag => \`<span class="tag">\${tag}</span>\`).join('')}
                            </div>
                        </div>
                    \`).join('');
                    
                    document.getElementById('categoriesView').classList.add('hidden');
                    document.getElementById('contentView').classList.remove('hidden');
                }

                function showTopicContent(topic) {
                    const contentDiv = document.getElementById('topicContent');
                    contentDiv.innerHTML = \`
                        <div class="topic">
                            <div class="topic-title">\${topic.title}</div>
                            <div class="topic-content">\${topic.content}</div>
                            \${topic.exampleCode ? \`
                                <button class="button" onclick="runExample('\${topic.exampleCode}', 'typescript')">💻 Run Example</button>
                            \` : ''}
                            \${topic.videoUrl ? \`
                                <button class="button" onclick="openExternal('\${topic.videoUrl}')">📺 Watch Video</button>
                            \` : ''}
                            <div class="topic-tags">
                                \${topic.tags.map(tag => \`<span class="tag">\${tag}</span>\`).join('')}
                            </div>
                        </div>
                    \`;
                    
                    document.getElementById('categoriesView').classList.add('hidden');
                    document.getElementById('contentView').classList.remove('hidden');
                }

                function runExample(code, language) {
                    vscode.postMessage({ command: 'runExample', code, language });
                }

                function openExternal(url) {
                    vscode.postMessage({ command: 'openExternal', url });
                }
            </script>
        </body>
        </html>
        `;
    }

    /**
     * Dispose help system
     */
    public dispose(): void {
        this.helpTopics.clear();
        this.helpCategories.clear();
        this.contextLogger.info('HelpSystem disposed');
    }
}
