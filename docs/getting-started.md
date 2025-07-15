# Getting Started with FlowCode

Welcome to FlowCode! This guide will help you get up and running with FlowCode's AI-powered development features.

## Prerequisites

Before installing FlowCode, ensure you have:

- **VS Code**: Version 1.74.0 or higher
- **Node.js**: Version 16.0.0 or higher
- **Git**: Version 2.20.0 or higher
- **npm**: Version 6.0.0 or higher

## Installation

### Method 1: VS Code Marketplace (Recommended)
1. Open VS Code
2. Go to Extensions (Ctrl+Shift+X / Cmd+Shift+X)
3. Search for "FlowCode"
4. Click "Install"

### Method 2: From VSIX Package
1. Download the latest `flowcode-x.x.x.vsix` file
2. Open VS Code
3. Go to Extensions → "..." menu → "Install from VSIX"
4. Select the downloaded file

### Method 3: From Source
```bash
git clone https://github.com/Aladin147/FlowCode.git
cd FlowCode
npm install
npm run compile
npm run package
code --install-extension flowcode-0.1.0.vsix
```

## Initial Setup

### 1. Configure API Key

FlowCode requires an AI service API key for intelligent features:

1. Open Command Palette (Ctrl+Shift+P / Cmd+Shift+P)
2. Run "FlowCode: Configure API Key"
3. Select your preferred AI provider:
   - **OpenAI**: GPT-4, GPT-3.5-turbo
   - **Anthropic**: Claude-3 Opus, Sonnet, Haiku

4. Enter your API key
5. Test the connection

#### Getting API Keys

**OpenAI**:
1. Visit [platform.openai.com](https://platform.openai.com)
2. Sign up or log in
3. Go to API Keys section
4. Create a new secret key

**Anthropic**:
1. Visit [console.anthropic.com](https://console.anthropic.com)
2. Sign up or log in
3. Go to API Keys
4. Generate a new key

### 2. Initialize FlowCode

1. Open your project in VS Code
2. Open Command Palette
3. Run "FlowCode: Initialize"
4. FlowCode will:
   - Check dependencies
   - Install git hooks
   - Create configuration files
   - Set up workspace

### 3. Verify Installation

Check that FlowCode is working:

1. Look for the FlowCode icon in the status bar
2. Open Command Palette and search for "FlowCode" commands
3. Try the quick actions: Ctrl+Alt+F (Cmd+Alt+F on Mac)

## First Steps

### 1. Generate Your First Code

Let's generate a simple function:

1. Create a new file (e.g., `example.ts`)
2. Place your cursor where you want code
3. Press Ctrl+Alt+G (Cmd+Alt+G on Mac)
4. Type: "Create a function that validates email addresses"
5. Press Enter and review the generated code
6. Accept or modify as needed

### 2. Analyze Your Code

If you have an existing project:

1. Open a file in your project
2. Press Ctrl+Alt+A (Cmd+Alt+A on Mac)
3. Review the analysis results:
   - Code quality metrics
   - Architecture insights
   - Improvement suggestions

### 3. Run Security Audit

Check your code for security issues:

1. Press Ctrl+Alt+S (Cmd+Alt+S on Mac)
2. Wait for the scan to complete
3. Review findings and recommendations
4. Fix issues with guided assistance

### 4. Create a Hotfix

Practice the emergency hotfix workflow:

1. Press Ctrl+Alt+H (Cmd+Alt+H on Mac)
2. Describe the issue: "Fix critical login bug"
3. FlowCode will:
   - Create a hotfix branch
   - Set up tracking
   - Guide you through the process

## Understanding the Interface

### Status Bar Indicators

FlowCode adds several indicators to your status bar:

- **🚀 FlowCode**: Main status and quick actions
- **🟢 Memory**: Memory usage (green=good, yellow=moderate, red=high)
- **⚡ Performance**: Extension performance metrics

### Quick Actions Menu

Press Ctrl+Alt+F (Cmd+Alt+F) to access:

- **Generate Code**: AI-powered code generation
- **Analyze Code**: Code analysis and insights
- **Security Audit**: Vulnerability scanning
- **Create Hotfix**: Emergency fix workflow
- **Dependency Graph**: Code relationship visualization
- **Performance Report**: Extension performance metrics
- **Configure FlowCode**: Settings and preferences

### Command Palette Integration

All FlowCode features are available through the Command Palette:

1. Press Ctrl+Shift+P (Cmd+Shift+P)
2. Type "FlowCode"
3. Browse available commands

## Configuration

### Basic Settings

Access FlowCode settings:

1. File → Preferences → Settings (Ctrl+,)
2. Search for "FlowCode"
3. Configure options:

```json
{
  "flowcode.ai.provider": "openai",
  "flowcode.ai.model": "gpt-4",
  "flowcode.security.enableAuditing": true,
  "flowcode.performance.enableOptimization": true,
  "flowcode.userExperience.enableQuickActions": true
}
```

### Workspace Configuration

FlowCode creates a `.flowcode` directory in your workspace:

```
.flowcode/
├── config.json          # Workspace-specific settings
├── debt.json           # Hotfix tracking
├── cache/              # Performance cache
└── logs/               # Debug logs
```

### Git Hooks Setup

FlowCode automatically installs git hooks:

- **pre-commit**: Code quality checks
- **pre-push**: Comprehensive validation
- **commit-msg**: Commit message validation

To customize hooks:
1. Run "FlowCode: Configure Git Hooks"
2. Enable/disable specific hooks
3. Set validation levels

## Troubleshooting

### Common Issues

**Extension doesn't activate**:
- Check VS Code version (1.74.0+)
- Restart VS Code
- Check Output panel for errors

**API key not working**:
- Verify key is correct
- Check internet connection
- Ensure sufficient API credits

**Git hooks not running**:
- Check git version (2.20.0+)
- Verify repository is git-initialized
- Run "FlowCode: Initialize" again

**Performance issues**:
- Run "FlowCode: Optimize Memory"
- Check system resources
- Disable unused features

### Getting Help

1. **Documentation**: Check the docs/ folder
2. **Command Palette**: "FlowCode: Show Help"
3. **Status Bar**: Click FlowCode icon for quick help
4. **GitHub Issues**: Report bugs and request features
5. **Community**: Join discussions and get support

## Next Steps

Now that you have FlowCode set up:

1. **Explore Features**: Try each major feature
2. **Customize Settings**: Adjust FlowCode to your workflow
3. **Learn Shortcuts**: Memorize key combinations
4. **Read Documentation**: Dive deeper into specific features
5. **Join Community**: Connect with other FlowCode users

### Recommended Learning Path

1. **Week 1**: Basic code generation and analysis
2. **Week 2**: Security auditing and git integration
3. **Week 3**: Performance optimization and advanced features
4. **Week 4**: Customization and workflow integration

### Advanced Topics

Once comfortable with basics, explore:

- [Advanced Code Generation](tutorials/advanced-code-generation.md)
- [Custom Security Rules](tutorials/custom-security-rules.md)
- [Performance Optimization](tutorials/performance-optimization.md)
- [Team Collaboration](tutorials/team-collaboration.md)

## Support

Need help? We're here for you:

- **Documentation**: Comprehensive guides and tutorials
- **Community**: GitHub Discussions for questions
- **Issues**: GitHub Issues for bugs and features
- **Email**: support@flowcode.dev for direct support

Welcome to the FlowCode community! 🚀
