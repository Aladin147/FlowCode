import { describe, it, before, after } from 'mocha';
import { expect } from 'chai';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { CrossPlatformGitHooks } from '../utils/cross-platform-git-hooks';
import { ToolDependencyManager } from '../utils/tool-dependency-manager';
import { ConfigurationManager } from '../utils/configuration-manager';
import { InputValidator } from '../utils/input-validator';
import { SecurityValidator } from '../utils/security-validator';

describe('Cross-Platform Compatibility Tests', function() {
    this.timeout(30000); // 30 second timeout for platform tests

    let testWorkspace: string;
    let configManager: ConfigurationManager;
    let platformInfo: {
        platform: NodeJS.Platform;
        isWindows: boolean;
        isUnix: boolean;
        isMacOS: boolean;
        isLinux: boolean;
    };

    before(async function() {
        // Setup test workspace
        testWorkspace = path.join(os.tmpdir(), 'flowcode-cross-platform-test');
        if (!fs.existsSync(testWorkspace)) {
            fs.mkdirSync(testWorkspace, { recursive: true });
        }

        // Initialize git repository for testing
        const gitDir = path.join(testWorkspace, '.git');
        if (!fs.existsSync(gitDir)) {
            fs.mkdirSync(gitDir, { recursive: true });
            fs.writeFileSync(path.join(gitDir, 'HEAD'), 'ref: refs/heads/main\n');
        }

        // Initialize configuration manager
        configManager = new ConfigurationManager();

        // Detect platform
        platformInfo = {
            platform: process.platform,
            isWindows: process.platform === 'win32',
            isUnix: process.platform !== 'win32',
            isMacOS: process.platform === 'darwin',
            isLinux: process.platform === 'linux'
        };

        console.log(`Running cross-platform tests on: ${platformInfo.platform}`);
    });

    after(async function() {
        // Cleanup test workspace
        try {
            if (fs.existsSync(testWorkspace)) {
                fs.rmSync(testWorkspace, { recursive: true, force: true });
            }
        } catch (error) {
            console.warn('Failed to cleanup test workspace:', error);
        }
    });

    describe('Platform Detection', function() {
        it('should correctly detect current platform', function() {
            expect(platformInfo.platform).to.be.oneOf(['win32', 'darwin', 'linux']);
            
            if (platformInfo.isWindows) {
                expect(platformInfo.platform).to.equal('win32');
                expect(platformInfo.isUnix).to.be.false;
            } else {
                expect(platformInfo.isUnix).to.be.true;
                expect(platformInfo.isWindows).to.be.false;
            }
        });

        it('should have consistent platform flags', function() {
            const flagCount = [
                platformInfo.isWindows,
                platformInfo.isMacOS,
                platformInfo.isLinux
            ].filter(Boolean).length;

            expect(flagCount).to.equal(1, 'Exactly one platform flag should be true');
        });
    });

    describe('File System Operations', function() {
        it('should handle path separators correctly', function() {
            const testPath = path.join('src', 'utils', 'test.ts');
            
            if (platformInfo.isWindows) {
                expect(testPath).to.include('\\');
            } else {
                expect(testPath).to.include('/');
            }
        });

        it('should create and read files with correct permissions', async function() {
            const testFile = path.join(testWorkspace, 'permission-test.txt');
            const testContent = 'Cross-platform test content';

            // Write file
            fs.writeFileSync(testFile, testContent, { encoding: 'utf8' });
            expect(fs.existsSync(testFile)).to.be.true;

            // Read file
            const readContent = fs.readFileSync(testFile, 'utf8');
            expect(readContent).to.equal(testContent);

            // Check permissions on Unix systems
            if (platformInfo.isUnix) {
                const stats = fs.statSync(testFile);
                expect(stats.mode & parseInt('400', 8)).to.be.greaterThan(0, 'File should be readable');
                expect(stats.mode & parseInt('200', 8)).to.be.greaterThan(0, 'File should be writable');
            }

            // Cleanup
            fs.unlinkSync(testFile);
        });

        it('should handle executable permissions on Unix systems', async function() {
            if (!platformInfo.isUnix) {
                this.skip();
            }

            const scriptFile = path.join(testWorkspace, 'test-script.sh');
            const scriptContent = '#!/bin/sh\necho "test"';

            fs.writeFileSync(scriptFile, scriptContent, { encoding: 'utf8' });
            fs.chmodSync(scriptFile, 0o755);

            const stats = fs.statSync(scriptFile);
            const isExecutable = (stats.mode & parseInt('111', 8)) !== 0;
            expect(isExecutable).to.be.true;

            fs.unlinkSync(scriptFile);
        });
    });

    describe('Git Hook Cross-Platform Functionality', function() {
        let gitHooks: CrossPlatformGitHooks;

        before(function() {
            gitHooks = new CrossPlatformGitHooks();
        });

        it('should detect platform information correctly', function() {
            const platformInfo = gitHooks.getPlatformInfo();
            
            expect(platformInfo.platform).to.equal(process.platform);
            expect(platformInfo.isWindows).to.equal(process.platform === 'win32');
            expect(platformInfo.isUnix).to.equal(process.platform !== 'win32');
            expect(platformInfo.pathSeparator).to.equal(path.sep);
        });

        it('should generate platform-specific hook scripts', async function() {
            const hookConfig = {
                name: 'pre-commit',
                enabled: true,
                timeout: 300,
                failOnError: true,
                skipOnCI: false
            };

            const result = await gitHooks.installHooks(testWorkspace, [hookConfig]);
            
            expect(result.success).to.be.true;
            expect(result.installedHooks).to.include('pre-commit');
            expect(result.platform).to.equal(process.platform);

            // Verify hook file exists
            const hookPath = path.join(testWorkspace, '.git', 'hooks', 'pre-commit');
            expect(fs.existsSync(hookPath)).to.be.true;

            // Verify hook content is platform-appropriate
            const hookContent = fs.readFileSync(hookPath, 'utf8');
            expect(hookContent).to.include('FlowCode');

            if (platformInfo.isWindows) {
                expect(hookContent).to.include('@echo off');
                expect(hookContent).to.include('REM');
            } else {
                expect(hookContent).to.include('#!/bin/sh');
                expect(hookContent).to.include('#');
            }
        });

        it('should set correct permissions on Unix systems', async function() {
            if (!platformInfo.isUnix) {
                this.skip();
            }

            const hookConfig = {
                name: 'pre-push',
                enabled: true,
                timeout: 300,
                failOnError: true,
                skipOnCI: false
            };

            const result = await gitHooks.installHooks(testWorkspace, [hookConfig]);
            expect(result.success).to.be.true;

            const hookPath = path.join(testWorkspace, '.git', 'hooks', 'pre-push');
            const stats = fs.statSync(hookPath);
            const isExecutable = (stats.mode & parseInt('111', 8)) !== 0;
            expect(isExecutable).to.be.true;
        });
    });

    describe('Tool Dependency Detection', function() {
        let toolManager: ToolDependencyManager;

        before(function() {
            toolManager = new ToolDependencyManager();
        });

        it('should detect Node.js installation', async function() {
            const result = await toolManager.checkDependencies();
            
            const nodeStatus = result.toolStatuses.find(s => s.name === 'node');
            expect(nodeStatus).to.exist;
            expect(nodeStatus!.installed).to.be.true;
            expect(nodeStatus!.version).to.match(/\d+\.\d+\.\d+/);
        });

        it('should detect npm installation', async function() {
            const result = await toolManager.checkDependencies();
            
            const npmStatus = result.toolStatuses.find(s => s.name === 'npm');
            expect(npmStatus).to.exist;
            expect(npmStatus!.installed).to.be.true;
            expect(npmStatus!.version).to.match(/\d+\.\d+\.\d+/);
        });

        it('should provide platform-specific installation instructions', async function() {
            const result = await toolManager.checkDependencies();
            const guide = toolManager.generateInstallationGuide(result);
            
            expect(guide).to.include(process.platform);
            
            if (platformInfo.isWindows) {
                expect(guide).to.include('Windows');
            } else if (platformInfo.isMacOS) {
                expect(guide).to.include('macOS');
                expect(guide).to.include('Homebrew');
            } else if (platformInfo.isLinux) {
                expect(guide).to.include('Linux');
                expect(guide).to.include('apt-get');
            }
        });
    });

    describe('Input Validation Cross-Platform', function() {
        it('should handle different path formats', function() {
            const windowsPath = 'C:\\Users\\test\\project\\file.ts';
            const unixPath = '/home/test/project/file.ts';
            const relativePath = './src/utils/test.ts';

            // Test Windows path
            const windowsResult = InputValidator.validateFilePath(windowsPath);
            if (platformInfo.isWindows) {
                expect(windowsResult.isValid).to.be.true;
            }

            // Test Unix path
            const unixResult = InputValidator.validateFilePath(unixPath);
            if (platformInfo.isUnix) {
                expect(unixResult.isValid).to.be.true;
            }

            // Test relative path (should work on all platforms)
            const relativeResult = InputValidator.validateFilePath(relativePath);
            expect(relativeResult.isValid).to.be.true;
        });

        it('should detect path traversal attempts on all platforms', function() {
            const traversalPaths = [
                '../../../etc/passwd',
                '..\\..\\..\\windows\\system32\\config\\sam',
                './../../sensitive/file.txt'
            ];

            for (const maliciousPath of traversalPaths) {
                const result = InputValidator.validateFilePath(maliciousPath);
                expect(result.securityScore).to.be.lessThan(70);
                expect(result.warnings).to.not.be.empty;
            }
        });
    });

    describe('Security Validation Cross-Platform', function() {
        it('should run security audit on current platform', async function() {
            const result = await SecurityValidator.runSecurityAudit(testWorkspace);
            
            expect(result.overallScore).to.be.a('number');
            expect(result.overallScore).to.be.at.least(0);
            expect(result.overallScore).to.be.at.most(100);
            expect(result.results).to.be.an('array');
            expect(result.platform).to.equal(process.platform);
        });

        it('should check file permissions appropriately for platform', async function() {
            const result = await SecurityValidator.runSecurityAudit(testWorkspace);
            
            const filePermCheck = result.results.find(r => r.checkName === 'File Permissions');
            expect(filePermCheck).to.exist;
            
            // Unix systems should have more detailed permission checks
            if (platformInfo.isUnix) {
                expect(filePermCheck!.description).to.include('permission');
            }
        });
    });

    describe('Configuration Management Cross-Platform', function() {
        it('should handle workspace root detection', async function() {
            const workspaceRoot = await configManager.getWorkspaceRoot();
            expect(workspaceRoot).to.be.a('string');
            expect(path.isAbsolute(workspaceRoot)).to.be.true;
        });

        it('should create platform-appropriate paths', async function() {
            const configPath = await configManager.getConfigFilePath();
            expect(configPath).to.be.a('string');
            
            if (platformInfo.isWindows) {
                expect(configPath).to.match(/^[A-Z]:\\/);
            } else {
                expect(configPath).to.match(/^\//);
            }
        });
    });

    describe('Environment Variable Handling', function() {
        it('should handle PATH environment variable correctly', function() {
            const pathVar = process.env.PATH || process.env.Path;
            expect(pathVar).to.exist;
            
            const pathSeparator = platformInfo.isWindows ? ';' : ':';
            const paths = pathVar!.split(pathSeparator);
            expect(paths.length).to.be.greaterThan(0);
        });

        it('should handle HOME/USERPROFILE directory correctly', function() {
            const homeDir = platformInfo.isWindows 
                ? process.env.USERPROFILE 
                : process.env.HOME;
            
            expect(homeDir).to.exist;
            expect(fs.existsSync(homeDir!)).to.be.true;
        });
    });

    describe('Shell Command Execution', function() {
        it('should use appropriate shell for platform', function() {
            const expectedShell = platformInfo.isWindows 
                ? (process.env.COMSPEC || 'cmd.exe')
                : (process.env.SHELL || '/bin/sh');
            
            expect(expectedShell).to.be.a('string');
            
            if (platformInfo.isWindows) {
                expect(expectedShell.toLowerCase()).to.include('cmd');
            } else {
                expect(expectedShell).to.include('sh');
            }
        });
    });
});
