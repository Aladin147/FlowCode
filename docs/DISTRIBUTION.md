# FlowCode Distribution Guide

This document outlines the process for packaging and distributing FlowCode.

## Pre-Release Checklist

### Code Quality
- [ ] All unit tests pass (`npm run test:unit`)
- [ ] All integration tests pass (`npm run test:integration`)
- [ ] All performance tests pass (`npm run test:performance`)
- [ ] All security tests pass (`npm run test:security`)
- [ ] Code coverage is above 80%
- [ ] No TypeScript compilation errors
- [ ] ESLint passes with no errors
- [ ] All dependencies are up to date

### Documentation
- [ ] README.md is updated with latest features
- [ ] CHANGELOG.md includes all changes for this version
- [ ] API documentation is current
- [ ] User guides are updated
- [ ] Troubleshooting guide is current

### Configuration
- [ ] package.json version is correct
- [ ] All commands are properly registered
- [ ] Configuration schema is complete
- [ ] Keybindings are documented
- [ ] Extension metadata is accurate

### Security
- [ ] No hardcoded secrets or API keys
- [ ] All user inputs are validated
- [ ] Security audit passes
- [ ] Dependencies have no known vulnerabilities
- [ ] Privacy policy is current

### Cross-Platform Testing
- [ ] Tested on Windows 10/11
- [ ] Tested on macOS (Intel and Apple Silicon)
- [ ] Tested on Linux (Ubuntu, CentOS)
- [ ] Git hooks work on all platforms
- [ ] File paths are handled correctly
- [ ] Environment variables work correctly

## Packaging Process

### 1. Prepare for Release

```bash
# Update version in package.json
npm version patch  # or minor/major

# Update CHANGELOG.md with release notes
# Update README.md if needed

# Run full test suite
npm run test:all

# Clean and compile
npm run clean
npm run compile
```

### 2. Package Extension

```bash
# For alpha release
node scripts/package-extension.js --release-type alpha

# For beta release
node scripts/package-extension.js --release-type beta

# For production release
node scripts/package-extension.js --release-type release
```

### 3. Test Package

```bash
# Install the packaged extension locally
code --install-extension dist/flowcode-X.X.X.vsix

# Test all major features:
# - Extension activation
# - API key configuration
# - Code generation
# - Security audit
# - Performance optimization
# - Git hooks
# - Telemetry (if enabled)
```

### 4. Publish to Marketplace

```bash
# Login to Visual Studio Marketplace
vsce login flowcode-team

# Publish alpha/beta (pre-release)
vsce publish --pre-release

# Publish production release
vsce publish
```

## Distribution Channels

### Visual Studio Code Marketplace
- **Primary distribution channel**
- Automatic updates for users
- Built-in discovery and installation
- User reviews and ratings

### GitHub Releases
- **Secondary distribution channel**
- Manual VSIX downloads
- Release notes and changelogs
- Community feedback and issues

### Direct Distribution
- **Enterprise/custom deployments**
- VSIX file sharing
- Internal marketplace deployment
- Custom installation scripts

## Release Types

### Alpha Releases (0.X.X-alpha)
- **Purpose**: Early testing and feedback
- **Audience**: Developers and early adopters
- **Frequency**: Weekly or bi-weekly
- **Testing**: Unit tests + basic integration tests
- **Distribution**: Pre-release flag on marketplace

### Beta Releases (0.X.X-beta)
- **Purpose**: Feature complete testing
- **Audience**: Beta testers and power users
- **Frequency**: Monthly
- **Testing**: Full test suite
- **Distribution**: Pre-release flag on marketplace

### Production Releases (0.X.X)
- **Purpose**: Stable release for all users
- **Audience**: General public
- **Frequency**: Quarterly or as needed
- **Testing**: Full test suite + manual testing
- **Distribution**: Main marketplace channel

## Version Management

### Semantic Versioning
FlowCode follows [Semantic Versioning](https://semver.org/):

- **MAJOR** (X.0.0): Breaking changes, major new features
- **MINOR** (0.X.0): New features, backward compatible
- **PATCH** (0.0.X): Bug fixes, backward compatible

### Pre-release Identifiers
- **alpha**: Early development, unstable
- **beta**: Feature complete, testing phase
- **rc**: Release candidate, final testing

### Version Examples
- `0.1.0-alpha.1`: First alpha of version 0.1.0
- `0.1.0-beta.1`: First beta of version 0.1.0
- `0.1.0-rc.1`: First release candidate of version 0.1.0
- `0.1.0`: Production release

## Rollback Procedure

If a release has critical issues:

1. **Immediate Response**
   - Unpublish the problematic version from marketplace
   - Notify users through GitHub and social media
   - Document the issue in GitHub Issues

2. **Fix and Re-release**
   - Create hotfix branch from the problematic release
   - Fix the critical issue
   - Increment patch version
   - Follow expedited release process

3. **Communication**
   - Update users on the fix timeline
   - Provide workarounds if available
   - Post-mortem analysis and prevention measures

## Monitoring and Analytics

### Post-Release Monitoring
- Extension activation rates
- Error reports and crash logs
- User feedback and reviews
- Performance metrics
- Feature usage analytics

### Success Metrics
- Installation and activation rates
- User retention and engagement
- Feature adoption rates
- Error rates and stability
- User satisfaction scores

## Support and Maintenance

### User Support
- GitHub Issues for bug reports
- GitHub Discussions for questions
- Documentation and troubleshooting guides
- Community support and contributions

### Maintenance Schedule
- **Security updates**: As needed (immediate)
- **Bug fixes**: Monthly patch releases
- **Feature updates**: Quarterly minor releases
- **Major updates**: Annually or as needed

## Legal and Compliance

### License
- MIT License for open source distribution
- Clear attribution requirements
- Third-party license compliance

### Privacy
- Privacy policy compliance
- GDPR compliance for EU users
- Transparent data collection practices
- User consent for telemetry

### Security
- Regular security audits
- Vulnerability disclosure process
- Secure development practices
- Dependency security monitoring

---

For questions about the distribution process, contact the FlowCode team at team@flowcode.dev.
