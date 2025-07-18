# FlowCode Troubleshooting Guide

This guide helps you diagnose and resolve common issues with FlowCode.

## Quick Diagnostics

### Run FlowCode Diagnostics

1. Open Command Palette (Ctrl+Shift+P / Cmd+Shift+P)
2. Run "FlowCode: Run Health Check"
3. Review the generated report for issues

### Check Extension Status

1. Look for FlowCode icon in status bar
2. If red or missing, there may be an activation issue
3. Check VS Code Output panel for FlowCode logs
4. Run "FlowCode: Show Status" to see detailed status

### Verify Dependencies

1. Run "FlowCode: Run Health Check" to check system dependencies
2. Install any missing required tools (ESLint, TypeScript, etc.)
3. For security scanning, install Semgrep: `pip install semgrep`
4. Restart VS Code after installing dependencies

## Common Issues

### 1. Extension Won't Activate

**Symptoms**:
- No FlowCode commands in Command Palette
- No FlowCode icon in status bar
- Error messages about activation failure

**Solutions**:

**Check VS Code Version**:
```bash
# Ensure VS Code 1.74.0 or higher
code --version
```

**Check Node.js Version**:
```bash
# Ensure Node.js 16.0.0 or higher
node --version
```

**Restart VS Code**:
1. Close all VS Code windows
2. Restart VS Code
3. Check if FlowCode activates

**Check Extension Logs**:
1. Open Output panel (View → Output)
2. Select "FlowCode" from dropdown
3. Look for error messages

**Reinstall Extension**:
1. Uninstall FlowCode extension
2. Restart VS Code
3. Reinstall FlowCode from marketplace

### 2. AI Features Not Working

**Symptoms**:
- "API key not configured" errors
- Code generation fails
- Analysis features unavailable

**Solutions**:

**Configure API Key**:
1. Run "FlowCode: Configure API Key"
2. Select your AI provider
3. Enter valid API key
4. Test connection

**Check API Key Validity**:
```bash
# Test OpenAI API key
curl -H "Authorization: Bearer YOUR_API_KEY" \
     https://api.openai.com/v1/models
```

**Verify Internet Connection**:
1. Check internet connectivity
2. Verify firewall/proxy settings
3. Try different network if available

**Check API Credits**:
1. Log into your AI provider account
2. Verify sufficient API credits
3. Check usage limits

### 3. Git Hooks Not Working

**Symptoms**:
- Hooks don't run on commit/push
- "Git hooks not installed" messages
- Permission errors on Unix systems

**Solutions**:

**Reinstall Git Hooks**:
1. Run "FlowCode: Install Git Hooks"
2. Confirm installation in terminal:
```bash
ls -la .git/hooks/
```

**Fix Permissions (Unix/macOS)**:
```bash
# Make hooks executable
chmod +x .git/hooks/pre-commit
chmod +x .git/hooks/pre-push
```

**Check Git Version**:
```bash
# Ensure Git 2.20.0 or higher
git --version
```

**Verify Repository**:
```bash
# Ensure you're in a git repository
git status
```

**Manual Hook Test**:
```bash
# Test pre-commit hook manually
.git/hooks/pre-commit
```

### 4. Performance Issues

**Symptoms**:
- Slow extension startup
- High memory usage
- VS Code becomes unresponsive

**Solutions**:

**Optimize Memory**:
1. Run "FlowCode: Optimize Memory"
2. Check memory usage in status bar
3. Restart VS Code if memory is high

**Check System Resources**:
- Monitor CPU and RAM usage
- Close unnecessary applications
- Ensure sufficient disk space

**Disable Unused Features**:
```json
{
  "flowcode.performance.enableOptimization": true,
  "flowcode.userExperience.enableQuickActions": false,
  "flowcode.security.enableAuditing": false
}
```

**Clear Cache**:
1. Run "FlowCode: Clear All Caches"
2. Restart VS Code
3. Monitor performance improvement

### 5. Security Audit Issues

**Symptoms**:
- Security scans fail to complete
- False positive security warnings
- Missing security tools

**Solutions**:

**Install Security Tools**:
```bash
# Install semgrep for security scanning
pip install semgrep

# Install bandit for Python security
pip install bandit

# Install ESLint security plugins
npm install -g eslint-plugin-security
```

**Configure Security Settings**:
```json
{
  "flowcode.security.enableAuditing": true,
  "flowcode.security.auditLevel": "basic",
  "flowcode.security.excludePatterns": [
    "node_modules/**",
    "*.test.js",
    "test/**"
  ]
}
```

**Update Security Rules**:
1. Run "FlowCode: Update Security Rules"
2. Restart security audit
3. Review updated findings

### 6. Configuration Issues

**Symptoms**:
- Settings not saving
- Configuration errors
- Workspace-specific issues

**Solutions**:

**Reset Configuration**:
1. Run "FlowCode: Reset Configuration"
2. Reconfigure essential settings
3. Test functionality

**Check Configuration File**:
```bash
# Check workspace configuration
cat .flowcode/config.json

# Validate JSON syntax
python -m json.tool .flowcode/config.json
```

**Workspace vs Global Settings**:
1. Check both workspace and global settings
2. Ensure no conflicts between settings
3. Use workspace settings for project-specific config

### 7. Network and Connectivity Issues

**Symptoms**:
- API timeouts
- Connection refused errors
- Proxy-related failures

**Solutions**:

**Configure Proxy Settings**:
```json
{
  "http.proxy": "http://proxy.company.com:8080",
  "http.proxyStrictSSL": false,
  "flowcode.network.timeout": 30000
}
```

**Check Firewall**:
1. Ensure outbound HTTPS (443) is allowed
2. Whitelist AI provider domains:
   - api.openai.com
   - api.anthropic.com
   - generativelanguage.googleapis.com

**Test Connectivity**:
```bash
# Test OpenAI connectivity
curl -I https://api.openai.com/v1/models

# Test with proxy
curl -I --proxy http://proxy:8080 https://api.openai.com/v1/models
```

## Platform-Specific Issues

### Windows

**PowerShell Execution Policy**:
```powershell
# Check current policy
Get-ExecutionPolicy

# Set policy to allow scripts
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

**Windows Defender**:
1. Add VS Code to Windows Defender exclusions
2. Add workspace folder to exclusions
3. Add Node.js to exclusions

**Path Issues**:
```cmd
# Check PATH environment variable
echo %PATH%

# Add Node.js to PATH if missing
setx PATH "%PATH%;C:\Program Files\nodejs"
```

### macOS

**Xcode Command Line Tools**:
```bash
# Install Xcode Command Line Tools
xcode-select --install

# Verify installation
xcode-select -p
```

**Permission Issues**:
```bash
# Fix npm permissions
sudo chown -R $(whoami) $(npm config get prefix)/{lib/node_modules,bin,share}

# Or use nvm for Node.js management
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
```

**Gatekeeper Issues**:
1. System Preferences → Security & Privacy
2. Allow apps downloaded from App Store and identified developers
3. If blocked, click "Allow Anyway"

### Linux

**Package Manager Issues**:
```bash
# Ubuntu/Debian
sudo apt update
sudo apt install nodejs npm git

# CentOS/RHEL
sudo yum install nodejs npm git

# Arch Linux
sudo pacman -S nodejs npm git
```

**Permission Issues**:
```bash
# Fix npm global permissions
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc
```

**Snap Package Issues**:
```bash
# If using snap VS Code, install classic
sudo snap install code --classic

# Or use .deb package
wget -qO- https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor > packages.microsoft.gpg
sudo install -o root -g root -m 644 packages.microsoft.gpg /etc/apt/trusted.gpg.d/
```

## Advanced Troubleshooting

### Enable Debug Logging

```json
{
  "flowcode.logging.level": "debug",
  "flowcode.logging.enableFileLogging": true
}
```

### Collect Diagnostic Information

1. Run "FlowCode: Generate Diagnostic Report"
2. Include system information:
   - OS version
   - VS Code version
   - Node.js version
   - Git version
   - FlowCode version

### Safe Mode Testing

1. Disable all other extensions
2. Test FlowCode functionality
3. Re-enable extensions one by one
4. Identify conflicting extensions

### Clean Installation

1. Uninstall FlowCode extension
2. Clear VS Code extension cache:
```bash
# Windows
rmdir /s "%USERPROFILE%\.vscode\extensions\flowcode*"

# macOS/Linux
rm -rf ~/.vscode/extensions/flowcode*
```
3. Restart VS Code
4. Reinstall FlowCode

## Getting Help

### Self-Service Resources

1. **Documentation**: Check docs/ folder
2. **FAQ**: Common questions and answers
3. **Community**: GitHub Discussions
4. **Examples**: Sample configurations and workflows

### Reporting Issues

When reporting issues, include:

1. **FlowCode version**
2. **VS Code version**
3. **Operating system**
4. **Node.js version**
5. **Error messages** (exact text)
6. **Steps to reproduce**
7. **Expected vs actual behavior**
8. **Diagnostic report** (if available)

### Issue Templates

**Bug Report**:
```
**FlowCode Version**: 0.1.0
**VS Code Version**: 1.74.0
**OS**: Windows 11 / macOS 13 / Ubuntu 22.04
**Node.js Version**: 18.0.0

**Description**:
Brief description of the issue

**Steps to Reproduce**:
1. Step one
2. Step two
3. Step three

**Expected Behavior**:
What should happen

**Actual Behavior**:
What actually happens

**Error Messages**:
```
Paste any error messages here
```

**Additional Context**:
Any other relevant information
```

### Contact Support

- **GitHub Issues**: Bug reports and feature requests
- **GitHub Discussions**: Questions and community support
- **Email**: support@flowcode.dev (for urgent issues)
- **Documentation**: Comprehensive guides and tutorials

### Emergency Support

For critical production issues:

1. **Disable FlowCode**: Temporarily disable if causing issues
2. **Rollback**: Use previous working configuration
3. **Minimal Configuration**: Use basic settings only
4. **Contact Support**: Include "URGENT" in subject line

## Prevention

### Best Practices

1. **Regular Updates**: Keep FlowCode and dependencies updated
2. **Backup Configuration**: Save working configurations
3. **Test Changes**: Test configuration changes in development
4. **Monitor Performance**: Watch for performance degradation
5. **Review Logs**: Regularly check logs for warnings

### Health Checks

Run these commands regularly:

```bash
# Check FlowCode health
# Command Palette → FlowCode: Run Performance Diagnostics

# Check dependencies
# Command Palette → FlowCode: Check Dependencies

# Optimize performance
# Command Palette → FlowCode: Optimize Memory
```

### Monitoring

Set up monitoring for:

- Extension startup time
- Memory usage patterns
- API response times
- Error frequencies
- Feature usage patterns

---

If you can't find a solution here, please check our [GitHub Issues](https://github.com/Aladin147/FlowCode/issues) or create a new issue with detailed information about your problem.
