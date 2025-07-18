# Contributing to FlowCode

Thank you for your interest in contributing to FlowCode! This document provides guidelines and instructions for contributing to the project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Environment](#development-environment)
- [Contribution Workflow](#contribution-workflow)
- [Coding Standards](#coding-standards)
- [Testing Guidelines](#testing-guidelines)
- [Documentation](#documentation)
- [Pull Request Process](#pull-request-process)
- [Release Process](#release-process)
- [Community](#community)

## Code of Conduct

This project and everyone participating in it is governed by the [FlowCode Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code. Please report unacceptable behavior to [conduct@flowcode.dev](mailto:conduct@flowcode.dev).

## Getting Started

### Prerequisites

Before you begin, ensure you have the following installed:

- **VS Code**: Version 1.74.0 or higher
- **Node.js**: Version 16.0.0 or higher
- **Git**: Version 2.20.0 or higher
- **npm**: Version 6.0.0 or higher

### Fork and Clone

1. Fork the repository on GitHub
2. Clone your fork locally:
```bash
git clone https://github.com/YOUR-USERNAME/FlowCode.git
cd FlowCode
```

3. Add the original repository as an upstream remote:
```bash
git remote add upstream https://github.com/Aladin147/FlowCode.git
```

4. Install dependencies:
```bash
npm install
```

## Development Environment

### Setup

1. Install development dependencies:
```bash
npm install
```

2. Build the extension:
```bash
npm run compile
```

3. Launch the extension in development mode:
```bash
npm run watch
```

4. In VS Code, press F5 to start debugging

### Project Structure

```
FlowCode/
├── src/                  # Source code
│   ├── commands/         # Command implementations
│   ├── services/         # Core services
│   ├── utils/            # Utility classes
│   ├── ui/               # UI components
│   ├── models/           # Data models
│   ├── providers/        # VS Code providers
│   ├── ai/               # AI provider implementations
│   ├── extension.ts      # Extension entry point
│   └── service-registry.ts # Service registration
├── test/                 # Test files
├── docs/                 # Documentation
├── .vscode/              # VS Code settings
├── .github/              # GitHub workflows and templates
├── scripts/              # Build and utility scripts
├── package.json          # Project metadata
└── tsconfig.json         # TypeScript configuration
```

## Contribution Workflow

### Branching Strategy

We use a feature branch workflow:

- `master`: Main development branch
- `release/*`: Release branches
- `feature/*`: Feature branches
- `bugfix/*`: Bug fix branches
- `hotfix/*`: Emergency fixes

### Creating a Branch

```bash
# Ensure you're on the latest master
git checkout master
git pull upstream master

# Create a new branch
git checkout -b feature/your-feature-name
```

### Making Changes

1. Make your changes in your feature branch
2. Commit your changes with a descriptive commit message:
```bash
git commit -m "feat: add new feature X"
```

3. Push your changes to your fork:
```bash
git push origin feature/your-feature-name
```

## Coding Standards

### TypeScript Guidelines

- Use TypeScript for all new code
- Follow the [TypeScript Style Guide](https://github.com/microsoft/TypeScript/wiki/Coding-guidelines)
- Use strict mode and explicit types
- Use interfaces for public APIs
- Document all public methods with JSDoc comments

### Code Style

We use ESLint and Prettier for code formatting:

```bash
# Check code style
npm run lint

# Fix code style issues
npm run lint:fix

# Format code
npm run format
```

### Commit Messages

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

Types:
- `feat`: A new feature
- `fix`: A bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code changes that neither fix bugs nor add features
- `perf`: Performance improvements
- `test`: Adding or updating tests
- `chore`: Changes to the build process or auxiliary tools

Examples:
```
feat(code-gen): add support for Python code generation
fix(security): resolve path traversal vulnerability
docs: update API reference documentation
```

## Testing Guidelines

### Running Tests

```bash
# Run all tests
npm test

# Run specific tests
npm test -- --grep "Security"

# Run with coverage
npm run test:coverage
```

### Writing Tests

- Write unit tests for all new features
- Aim for at least 80% code coverage
- Use descriptive test names
- Follow the AAA pattern (Arrange, Act, Assert)
- Mock external dependencies

Example:
```typescript
describe('SecurityValidator', () => {
  describe('validateInput', () => {
    it('should detect XSS attempts', () => {
      // Arrange
      const validator = new SecurityValidator();
      const input = '<script>alert("XSS")</script>';
      
      // Act
      const result = validator.validateInput(input, { context: 'html' });
      
      // Assert
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('XSS attempt detected');
    });
  });
});
```

### Cross-Platform Testing

- Test on Windows, macOS, and Linux
- Use the cross-platform test script:
```bash
npm run test:cross-platform
```

## Documentation

### Code Documentation

- Use JSDoc comments for all public APIs
- Document parameters, return values, and exceptions
- Include examples for complex methods

Example:
```typescript
/**
 * Validates input for security vulnerabilities
 * 
 * @param input - The input string to validate
 * @param context - The context in which the input will be used
 * @returns Validation result with errors and security score
 * @throws {ValidationError} If the context is invalid
 * 
 * @example
 * ```typescript
 * const result = validateInput('<script>alert("XSS")</script>', { context: 'html' });
 * // result.isValid === false
 * // result.errors contains 'XSS attempt detected'
 * ```
 */
function validateInput(input: string, context: ValidationContext): ValidationResult {
  // Implementation
}
```

### User Documentation

- Update relevant documentation for new features
- Create tutorials for complex features
- Use clear, concise language
- Include examples and screenshots

## Pull Request Process

1. Ensure your code passes all tests and linting
2. Update documentation as needed
3. Create a pull request against the `master` branch
4. Fill out the PR template completely
5. Request review from maintainers
6. Address review feedback
7. Once approved, a maintainer will merge your PR

### PR Template

```markdown
## Description
Brief description of the changes

## Related Issue
Fixes #123

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## How Has This Been Tested?
Describe the tests you ran

## Checklist
- [ ] My code follows the project's style guidelines
- [ ] I have performed a self-review of my code
- [ ] I have commented my code, particularly in hard-to-understand areas
- [ ] I have made corresponding changes to the documentation
- [ ] My changes generate no new warnings
- [ ] I have added tests that prove my fix is effective or that my feature works
- [ ] New and existing unit tests pass locally with my changes
```

## Release Process

### Versioning

We follow [Semantic Versioning](https://semver.org/):

- **MAJOR** version for incompatible API changes
- **MINOR** version for new functionality in a backward compatible manner
- **PATCH** version for backward compatible bug fixes

### Release Steps

1. Update version in `package.json`
2. Update `CHANGELOG.md`
3. Create a release branch: `release/vX.Y.Z`
4. Create a tag: `vX.Y.Z`
5. Build the VSIX package: `npm run package`
6. Create a GitHub release with release notes
7. Publish to VS Code Marketplace

## Community

### Discussions

Join our [GitHub Discussions](https://github.com/Aladin147/FlowCode/discussions) for:
- Q&A
- Feature ideas
- Show and tell
- General discussion

### Issue Reporting

- Use the issue tracker for bugs and feature requests
- Follow the issue template
- Provide detailed reproduction steps
- Include system information

### Getting Help

- Check the [documentation](docs/)
- Ask in [GitHub Discussions](https://github.com/Aladin147/FlowCode/discussions)
- Join our [Discord community](https://discord.gg/flowcode)
- Email [support@flowcode.dev](mailto:support@flowcode.dev)

---

Thank you for contributing to FlowCode! Your efforts help make this project better for everyone.
