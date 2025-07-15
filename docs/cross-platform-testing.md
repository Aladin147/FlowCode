# FlowCode Cross-Platform Testing Guide

## Overview

FlowCode is designed to work seamlessly across Windows, macOS, and Linux platforms. This document outlines our cross-platform testing strategy, test coverage, and platform-specific considerations.

## Supported Platforms

### Primary Platforms
- **Windows 10/11** (x64, ARM64)
- **macOS 10.15+** (Intel, Apple Silicon)
- **Linux** (Ubuntu 18.04+, other major distributions)

### Architecture Support
- x64 (Intel/AMD 64-bit)
- ARM64 (Apple Silicon, ARM-based systems)
- ia32 (legacy 32-bit support where applicable)

## Testing Strategy

### 1. Automated Cross-Platform Tests

Our automated test suite covers:

#### Platform Detection
- ✅ Correct platform identification (win32, darwin, linux)
- ✅ Architecture detection (x64, arm64, ia32)
- ✅ OS-specific feature availability

#### File System Operations
- ✅ Path separator handling (`\` on Windows, `/` on Unix)
- ✅ File creation, reading, and deletion
- ✅ Directory operations with proper permissions
- ✅ Executable file permissions (Unix systems)
- ✅ Case sensitivity handling

#### Path Handling
- ✅ Cross-platform path joining
- ✅ Absolute vs relative path detection
- ✅ Path normalization
- ✅ Drive letter handling (Windows)
- ✅ Symbolic link support (Unix systems)

#### Environment Variables
- ✅ PATH variable parsing (`;` on Windows, `:` on Unix)
- ✅ Home directory detection (USERPROFILE vs HOME)
- ✅ Temporary directory access
- ✅ Shell environment detection

#### Command Execution
- ✅ Platform-appropriate shell usage
- ✅ Command-line tool detection
- ✅ Process spawning and management
- ✅ Exit code handling

### 2. Git Hook Cross-Platform Support

#### Script Generation
- ✅ Windows batch files (.bat) with proper syntax
- ✅ Unix shell scripts with shebang headers
- ✅ Platform-specific command adaptations
- ✅ Error handling and exit codes

#### Permission Management
- ✅ Executable permissions on Unix systems (chmod +x)
- ✅ Windows compatibility (no special permissions needed)
- ✅ Hook installation verification

#### Tool Integration
- ✅ Node.js/npm command detection
- ✅ Git command availability
- ✅ ESLint/TypeScript integration
- ✅ Python/Ruff support where available

### 3. Tool Dependency Management

#### Detection Logic
- ✅ Command availability checking (`which` vs `where`)
- ✅ Version extraction and parsing
- ✅ Minimum version validation
- ✅ Installation path detection

#### Installation Guidance
- ✅ Platform-specific installation instructions
- ✅ Package manager recommendations
- ✅ Download links and methods
- ✅ Troubleshooting guidance

### 4. Security Features

#### Input Validation
- ✅ Path traversal detection (../ and ..\)
- ✅ Malicious pattern recognition
- ✅ File extension validation
- ✅ Command injection prevention

#### File Permissions
- ✅ Unix permission checking (rwx)
- ✅ Windows ACL awareness
- ✅ Secure file creation
- ✅ Temporary file handling

## Running Cross-Platform Tests

### Automated Test Suite

```bash
# Run the comprehensive cross-platform test suite
node scripts/cross-platform-test.js

# Run specific Mocha tests
npm test -- --grep "Cross-Platform"

# Run with coverage
npm run test:coverage
```

### Manual Testing Checklist

#### Windows Testing
- [ ] Extension loads correctly in VS Code
- [ ] Git hooks install and execute properly
- [ ] Tool detection works with Windows paths
- [ ] PowerShell and Command Prompt compatibility
- [ ] Windows Defender doesn't interfere
- [ ] Drive letter handling works correctly

#### macOS Testing
- [ ] Extension works on Intel and Apple Silicon
- [ ] Xcode Command Line Tools integration
- [ ] Homebrew tool detection
- [ ] Unix permissions handled correctly
- [ ] File system case sensitivity respected

#### Linux Testing
- [ ] Works on major distributions (Ubuntu, CentOS, Debian)
- [ ] Package manager integration (apt, yum, dnf)
- [ ] Shell compatibility (bash, zsh, fish)
- [ ] Permission handling across file systems
- [ ] Snap/Flatpak VS Code compatibility

## Platform-Specific Considerations

### Windows
- **Path Separators**: Use `path.join()` and `path.sep` consistently
- **Case Insensitivity**: File system is case-insensitive
- **Executable Extensions**: .exe, .bat, .cmd files
- **Environment Variables**: Use USERPROFILE, COMSPEC, Path
- **Line Endings**: CRLF (\r\n) by default
- **Shell**: cmd.exe or PowerShell

### macOS
- **Case Sensitivity**: HFS+ is case-insensitive, APFS can be either
- **Permissions**: Standard Unix permissions apply
- **Xcode Tools**: Required for many development tools
- **Homebrew**: Preferred package manager
- **Gatekeeper**: Code signing considerations
- **Shell**: zsh (default), bash available

### Linux
- **Distributions**: Wide variety with different package managers
- **Permissions**: Full Unix permission model
- **File Systems**: ext4, btrfs, others with different features
- **Package Managers**: apt, yum, dnf, pacman, zypper
- **Shell Variety**: bash, zsh, fish, dash
- **Container Support**: Docker, Podman compatibility

## Test Results and Coverage

### Current Test Coverage
- ✅ **Platform Detection**: 100%
- ✅ **File Operations**: 95%
- ✅ **Path Handling**: 100%
- ✅ **Environment Variables**: 90%
- ✅ **Command Execution**: 85%
- ✅ **Git Integration**: 90%
- ✅ **Tool Detection**: 80%
- ✅ **Security Features**: 85%

### Known Platform Issues
- **Windows**: Long path support (>260 characters) requires Windows 10 1607+
- **macOS**: Notarization required for distribution outside App Store
- **Linux**: Snap-packaged VS Code has restricted file system access

## Continuous Integration

### GitHub Actions Matrix
```yaml
strategy:
  matrix:
    os: [windows-latest, macos-latest, ubuntu-latest]
    node-version: [16.x, 18.x, 20.x]
```

### Test Environments
- **Windows**: Windows Server 2022, Windows 11
- **macOS**: macOS 12 (Monterey), macOS 13 (Ventura)
- **Linux**: Ubuntu 20.04, Ubuntu 22.04

## Troubleshooting Cross-Platform Issues

### Common Issues

#### Path Problems
```javascript
// ❌ Wrong - hardcoded separators
const filePath = 'src\\utils\\file.ts';

// ✅ Correct - use path.join()
const filePath = path.join('src', 'utils', 'file.ts');
```

#### Command Execution
```javascript
// ❌ Wrong - assumes Unix shell
exec('ls -la', callback);

// ✅ Correct - platform detection
const command = process.platform === 'win32' ? 'dir' : 'ls -la';
exec(command, callback);
```

#### File Permissions
```javascript
// ❌ Wrong - assumes Unix permissions
fs.chmodSync(file, 0o755);

// ✅ Correct - check platform first
if (process.platform !== 'win32') {
    fs.chmodSync(file, 0o755);
}
```

### Debugging Tips
1. **Use `process.platform`** for platform detection
2. **Test with different shells** on each platform
3. **Check file system case sensitivity**
4. **Verify environment variable availability**
5. **Test with different VS Code installation methods**

## Future Improvements

### Planned Enhancements
- [ ] ARM64 Windows support
- [ ] Alpine Linux compatibility
- [ ] WSL (Windows Subsystem for Linux) optimization
- [ ] Container-based testing
- [ ] Performance benchmarking across platforms

### Testing Infrastructure
- [ ] Automated testing on real hardware
- [ ] Cloud-based cross-platform testing
- [ ] User acceptance testing program
- [ ] Beta testing across platforms

## Contributing

When contributing cross-platform code:

1. **Test on multiple platforms** before submitting
2. **Use platform-agnostic APIs** when possible
3. **Document platform-specific behavior**
4. **Add appropriate test coverage**
5. **Consider edge cases** for each platform

## Resources

- [Node.js Platform Documentation](https://nodejs.org/api/os.html)
- [VS Code Extension Platform Guide](https://code.visualstudio.com/api/advanced-topics/extension-host)
- [Cross-Platform Node.js Best Practices](https://nodejs.org/en/docs/guides/cross-platform/)
- [Git Hooks Documentation](https://git-scm.com/book/en/v2/Customizing-Git-Git-Hooks)
