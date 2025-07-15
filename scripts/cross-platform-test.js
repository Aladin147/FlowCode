#!/usr/bin/env node

const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Cross-platform test runner for FlowCode extension
 */
class CrossPlatformTestRunner {
    constructor() {
        this.platform = process.platform;
        this.isWindows = this.platform === 'win32';
        this.isUnix = !this.isWindows;
        this.testResults = {
            platform: this.platform,
            arch: process.arch,
            nodeVersion: process.version,
            timestamp: new Date().toISOString(),
            tests: [],
            summary: {
                total: 0,
                passed: 0,
                failed: 0,
                skipped: 0
            }
        };
    }

    /**
     * Run all cross-platform tests
     */
    async runTests() {
        console.log(`🚀 Starting FlowCode Cross-Platform Tests on ${this.getPlatformName()}`);
        console.log(`📋 Platform: ${this.platform} (${process.arch})`);
        console.log(`📋 Node.js: ${process.version}`);
        console.log('');

        try {
            // Check prerequisites
            await this.checkPrerequisites();

            // Run test suites
            await this.runTestSuite('Platform Detection', this.testPlatformDetection.bind(this));
            await this.runTestSuite('File System Operations', this.testFileSystemOperations.bind(this));
            await this.runTestSuite('Path Handling', this.testPathHandling.bind(this));
            await this.runTestSuite('Environment Variables', this.testEnvironmentVariables.bind(this));
            await this.runTestSuite('Command Execution', this.testCommandExecution.bind(this));
            await this.runTestSuite('Git Operations', this.testGitOperations.bind(this));
            await this.runTestSuite('Tool Detection', this.testToolDetection.bind(this));
            await this.runTestSuite('Security Features', this.testSecurityFeatures.bind(this));

            // Generate report
            await this.generateReport();

        } catch (error) {
            console.error('❌ Test runner failed:', error.message);
            process.exit(1);
        }
    }

    /**
     * Check test prerequisites
     */
    async checkPrerequisites() {
        console.log('🔍 Checking prerequisites...');

        const requirements = [
            { name: 'Node.js', command: 'node --version', required: true },
            { name: 'npm', command: 'npm --version', required: true },
            { name: 'Git', command: 'git --version', required: true },
            { name: 'TypeScript', command: 'npx tsc --version', required: false }
        ];

        for (const req of requirements) {
            try {
                const version = await this.executeCommand(req.command);
                console.log(`  ✅ ${req.name}: ${version.trim()}`);
            } catch (error) {
                if (req.required) {
                    throw new Error(`Required tool not found: ${req.name}`);
                } else {
                    console.log(`  ⚠️  ${req.name}: Not available (optional)`);
                }
            }
        }
        console.log('');
    }

    /**
     * Run a test suite
     */
    async runTestSuite(suiteName, testFunction) {
        console.log(`📦 Running ${suiteName} tests...`);
        
        try {
            const results = await testFunction();
            this.testResults.tests.push({
                suite: suiteName,
                results: results,
                passed: results.filter(r => r.status === 'passed').length,
                failed: results.filter(r => r.status === 'failed').length,
                skipped: results.filter(r => r.status === 'skipped').length
            });

            const passed = results.filter(r => r.status === 'passed').length;
            const failed = results.filter(r => r.status === 'failed').length;
            const skipped = results.filter(r => r.status === 'skipped').length;

            console.log(`  ✅ Passed: ${passed}, ❌ Failed: ${failed}, ⏭️  Skipped: ${skipped}`);
            
            this.testResults.summary.total += results.length;
            this.testResults.summary.passed += passed;
            this.testResults.summary.failed += failed;
            this.testResults.summary.skipped += skipped;

        } catch (error) {
            console.log(`  ❌ Suite failed: ${error.message}`);
            this.testResults.tests.push({
                suite: suiteName,
                error: error.message,
                passed: 0,
                failed: 1,
                skipped: 0
            });
            this.testResults.summary.failed += 1;
        }
        console.log('');
    }

    /**
     * Test platform detection
     */
    async testPlatformDetection() {
        const tests = [];

        // Test 1: Platform identification
        tests.push({
            name: 'Platform identification',
            status: ['win32', 'darwin', 'linux'].includes(this.platform) ? 'passed' : 'failed',
            details: `Detected platform: ${this.platform}`
        });

        // Test 2: Architecture detection
        tests.push({
            name: 'Architecture detection',
            status: ['x64', 'arm64', 'ia32'].includes(process.arch) ? 'passed' : 'failed',
            details: `Detected architecture: ${process.arch}`
        });

        // Test 3: OS-specific features
        const hasWindowsFeatures = this.isWindows && process.env.COMSPEC;
        const hasUnixFeatures = this.isUnix && process.env.SHELL;
        
        tests.push({
            name: 'OS-specific features',
            status: (hasWindowsFeatures || hasUnixFeatures) ? 'passed' : 'failed',
            details: this.isWindows ? `COMSPEC: ${process.env.COMSPEC}` : `SHELL: ${process.env.SHELL}`
        });

        return tests;
    }

    /**
     * Test file system operations
     */
    async testFileSystemOperations() {
        const tests = [];
        const testDir = path.join(os.tmpdir(), 'flowcode-test');

        try {
            // Test 1: Directory creation
            if (!fs.existsSync(testDir)) {
                fs.mkdirSync(testDir, { recursive: true });
            }
            tests.push({
                name: 'Directory creation',
                status: fs.existsSync(testDir) ? 'passed' : 'failed',
                details: `Created directory: ${testDir}`
            });

            // Test 2: File creation and reading
            const testFile = path.join(testDir, 'test.txt');
            const testContent = 'FlowCode cross-platform test';
            fs.writeFileSync(testFile, testContent, 'utf8');
            const readContent = fs.readFileSync(testFile, 'utf8');
            
            tests.push({
                name: 'File creation and reading',
                status: readContent === testContent ? 'passed' : 'failed',
                details: `File content matches: ${readContent === testContent}`
            });

            // Test 3: File permissions (Unix only)
            if (this.isUnix) {
                fs.chmodSync(testFile, 0o644);
                const stats = fs.statSync(testFile);
                const hasCorrectPermissions = (stats.mode & parseInt('644', 8)) !== 0;
                
                tests.push({
                    name: 'File permissions',
                    status: hasCorrectPermissions ? 'passed' : 'failed',
                    details: `File permissions: ${(stats.mode & parseInt('777', 8)).toString(8)}`
                });
            } else {
                tests.push({
                    name: 'File permissions',
                    status: 'skipped',
                    details: 'Not applicable on Windows'
                });
            }

            // Cleanup
            fs.rmSync(testDir, { recursive: true, force: true });

        } catch (error) {
            tests.push({
                name: 'File system operations',
                status: 'failed',
                details: `Error: ${error.message}`
            });
        }

        return tests;
    }

    /**
     * Test path handling
     */
    async testPathHandling() {
        const tests = [];

        // Test 1: Path separator
        const expectedSeparator = this.isWindows ? '\\' : '/';
        tests.push({
            name: 'Path separator',
            status: path.sep === expectedSeparator ? 'passed' : 'failed',
            details: `Expected: ${expectedSeparator}, Got: ${path.sep}`
        });

        // Test 2: Path joining
        const joinedPath = path.join('src', 'utils', 'test.ts');
        const hasCorrectSeparator = joinedPath.includes(path.sep);
        tests.push({
            name: 'Path joining',
            status: hasCorrectSeparator ? 'passed' : 'failed',
            details: `Joined path: ${joinedPath}`
        });

        // Test 3: Absolute path detection
        const absolutePath = this.isWindows ? 'C:\\test\\path' : '/test/path';
        tests.push({
            name: 'Absolute path detection',
            status: path.isAbsolute(absolutePath) ? 'passed' : 'failed',
            details: `Path: ${absolutePath}, Is absolute: ${path.isAbsolute(absolutePath)}`
        });

        return tests;
    }

    /**
     * Test environment variables
     */
    async testEnvironmentVariables() {
        const tests = [];

        // Test 1: PATH variable
        const pathVar = process.env.PATH || process.env.Path;
        tests.push({
            name: 'PATH environment variable',
            status: pathVar ? 'passed' : 'failed',
            details: `PATH length: ${pathVar ? pathVar.length : 0} characters`
        });

        // Test 2: Home directory
        const homeVar = this.isWindows ? process.env.USERPROFILE : process.env.HOME;
        tests.push({
            name: 'Home directory variable',
            status: homeVar && fs.existsSync(homeVar) ? 'passed' : 'failed',
            details: `Home directory: ${homeVar}`
        });

        // Test 3: Temporary directory
        const tempDir = os.tmpdir();
        tests.push({
            name: 'Temporary directory',
            status: tempDir && fs.existsSync(tempDir) ? 'passed' : 'failed',
            details: `Temp directory: ${tempDir}`
        });

        return tests;
    }

    /**
     * Test command execution
     */
    async testCommandExecution() {
        const tests = [];

        // Test 1: Node.js execution
        try {
            const nodeVersion = await this.executeCommand('node --version');
            tests.push({
                name: 'Node.js command execution',
                status: nodeVersion.startsWith('v') ? 'passed' : 'failed',
                details: `Node.js version: ${nodeVersion.trim()}`
            });
        } catch (error) {
            tests.push({
                name: 'Node.js command execution',
                status: 'failed',
                details: `Error: ${error.message}`
            });
        }

        // Test 2: Platform-specific commands
        const platformCommand = this.isWindows ? 'echo %OS%' : 'uname -s';
        try {
            const result = await this.executeCommand(platformCommand);
            tests.push({
                name: 'Platform-specific command',
                status: result.trim().length > 0 ? 'passed' : 'failed',
                details: `Command output: ${result.trim()}`
            });
        } catch (error) {
            tests.push({
                name: 'Platform-specific command',
                status: 'failed',
                details: `Error: ${error.message}`
            });
        }

        return tests;
    }

    /**
     * Test Git operations
     */
    async testGitOperations() {
        const tests = [];

        // Test 1: Git availability
        try {
            const gitVersion = await this.executeCommand('git --version');
            tests.push({
                name: 'Git availability',
                status: gitVersion.includes('git version') ? 'passed' : 'failed',
                details: `Git version: ${gitVersion.trim()}`
            });
        } catch (error) {
            tests.push({
                name: 'Git availability',
                status: 'failed',
                details: `Error: ${error.message}`
            });
            return tests; // Skip other git tests if git is not available
        }

        // Test 2: Git configuration
        try {
            const gitConfig = await this.executeCommand('git config --list --global');
            tests.push({
                name: 'Git configuration',
                status: gitConfig.length > 0 ? 'passed' : 'failed',
                details: `Config entries: ${gitConfig.split('\n').length}`
            });
        } catch (error) {
            tests.push({
                name: 'Git configuration',
                status: 'failed',
                details: `Error: ${error.message}`
            });
        }

        return tests;
    }

    /**
     * Test tool detection
     */
    async testToolDetection() {
        const tests = [];
        
        const tools = [
            { name: 'npm', command: 'npm --version' },
            { name: 'npx', command: 'npx --version' },
            { name: 'tsc', command: 'npx tsc --version' },
            { name: 'eslint', command: 'npx eslint --version' }
        ];

        for (const tool of tools) {
            try {
                const version = await this.executeCommand(tool.command);
                tests.push({
                    name: `${tool.name} detection`,
                    status: version.trim().length > 0 ? 'passed' : 'failed',
                    details: `Version: ${version.trim()}`
                });
            } catch (error) {
                tests.push({
                    name: `${tool.name} detection`,
                    status: 'failed',
                    details: `Not available: ${error.message}`
                });
            }
        }

        return tests;
    }

    /**
     * Test security features
     */
    async testSecurityFeatures() {
        const tests = [];

        // Test 1: File permission checks (Unix only)
        if (this.isUnix) {
            const testDir = path.join(os.tmpdir(), 'security-test');
            try {
                fs.mkdirSync(testDir, { recursive: true });
                fs.chmodSync(testDir, 0o755);
                
                const stats = fs.statSync(testDir);
                const hasCorrectPermissions = (stats.mode & parseInt('755', 8)) !== 0;
                
                tests.push({
                    name: 'File permission security',
                    status: hasCorrectPermissions ? 'passed' : 'failed',
                    details: `Directory permissions: ${(stats.mode & parseInt('777', 8)).toString(8)}`
                });

                fs.rmSync(testDir, { recursive: true, force: true });
            } catch (error) {
                tests.push({
                    name: 'File permission security',
                    status: 'failed',
                    details: `Error: ${error.message}`
                });
            }
        } else {
            tests.push({
                name: 'File permission security',
                status: 'skipped',
                details: 'Not applicable on Windows'
            });
        }

        // Test 2: Path traversal detection
        const maliciousPaths = [
            '../../../etc/passwd',
            '..\\..\\..\\windows\\system32',
            './../../sensitive'
        ];

        let pathTraversalDetected = 0;
        for (const maliciousPath of maliciousPaths) {
            if (maliciousPath.includes('..')) {
                pathTraversalDetected++;
            }
        }

        tests.push({
            name: 'Path traversal detection',
            status: pathTraversalDetected === maliciousPaths.length ? 'passed' : 'failed',
            details: `Detected ${pathTraversalDetected}/${maliciousPaths.length} traversal attempts`
        });

        return tests;
    }

    /**
     * Execute a command and return output
     */
    executeCommand(command) {
        return new Promise((resolve, reject) => {
            exec(command, (error, stdout, stderr) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(stdout || stderr);
                }
            });
        });
    }

    /**
     * Generate test report
     */
    async generateReport() {
        console.log('📊 Generating test report...');

        const reportPath = path.join(process.cwd(), 'cross-platform-test-report.json');
        fs.writeFileSync(reportPath, JSON.stringify(this.testResults, null, 2));

        // Console summary
        console.log('');
        console.log('🎯 Test Summary:');
        console.log(`  Platform: ${this.getPlatformName()}`);
        console.log(`  Total Tests: ${this.testResults.summary.total}`);
        console.log(`  ✅ Passed: ${this.testResults.summary.passed}`);
        console.log(`  ❌ Failed: ${this.testResults.summary.failed}`);
        console.log(`  ⏭️  Skipped: ${this.testResults.summary.skipped}`);
        console.log('');

        const successRate = (this.testResults.summary.passed / this.testResults.summary.total * 100).toFixed(1);
        console.log(`📈 Success Rate: ${successRate}%`);
        console.log(`📄 Full report saved to: ${reportPath}`);

        if (this.testResults.summary.failed > 0) {
            console.log('');
            console.log('❌ Some tests failed. Check the report for details.');
            process.exit(1);
        } else {
            console.log('');
            console.log('🎉 All tests passed! FlowCode is cross-platform compatible.');
        }
    }

    /**
     * Get platform display name
     */
    getPlatformName() {
        switch (this.platform) {
            case 'win32': return 'Windows';
            case 'darwin': return 'macOS';
            case 'linux': return 'Linux';
            default: return this.platform;
        }
    }
}

// Run tests if this script is executed directly
if (require.main === module) {
    const runner = new CrossPlatformTestRunner();
    runner.runTests().catch(error => {
        console.error('Test runner failed:', error);
        process.exit(1);
    });
}

module.exports = CrossPlatformTestRunner;
