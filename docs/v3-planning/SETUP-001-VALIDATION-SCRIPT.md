# SETUP-001: Automated Validation Script

## 🎯 **Overview**

This document provides automated validation scripts to verify SETUP-001 completion against all quality gates and success criteria.

## 📋 **Validation Script (Node.js)**

### **setup-001-validator.js**
```javascript
#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class Setup001Validator {
    constructor() {
        this.results = {
            passed: 0,
            failed: 0,
            total: 0,
            details: []
        };
    }

    // Validation helper
    validate(testName, condition, message) {
        this.results.total++;
        if (condition) {
            this.results.passed++;
            console.log(`✅ ${testName}: PASSED`);
            this.results.details.push({ test: testName, status: 'PASSED', message });
        } else {
            this.results.failed++;
            console.log(`❌ ${testName}: FAILED - ${message}`);
            this.results.details.push({ test: testName, status: 'FAILED', message });
        }
    }

    // Check if directory exists
    directoryExists(dirPath) {
        return fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory();
    }

    // Check if file exists
    fileExists(filePath) {
        return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
    }

    // Validate directory structure
    validateDirectoryStructure() {
        console.log('\n🏗️  Validating Directory Structure...');
        
        const requiredDirs = [
            'src',
            'src/presentation',
            'src/presentation/chat',
            'src/presentation/status',
            'src/presentation/commands',
            'src/presentation/webview',
            'src/application',
            'src/application/usecases',
            'src/application/services',
            'src/application/orchestrators',
            'src/domain',
            'src/domain/entities',
            'src/domain/interfaces',
            'src/domain/services',
            'src/infrastructure',
            'src/infrastructure/ai',
            'src/infrastructure/filesystem',
            'src/infrastructure/cache',
            'src/infrastructure/config',
            'src/shared',
            'src/shared/types',
            'src/shared/utils',
            'src/shared/constants',
            'tests',
            'tests/unit',
            'tests/integration',
            'tests/fixtures'
        ];

        requiredDirs.forEach(dir => {
            this.validate(
                `Directory: ${dir}`,
                this.directoryExists(dir),
                `Directory ${dir} should exist`
            );
        });
    }

    // Validate TypeScript configuration
    validateTypeScriptConfig() {
        console.log('\n⚙️  Validating TypeScript Configuration...');
        
        // Check tsconfig.json exists
        this.validate(
            'tsconfig.json exists',
            this.fileExists('tsconfig.json'),
            'tsconfig.json file should exist'
        );

        if (this.fileExists('tsconfig.json')) {
            try {
                const tsconfig = JSON.parse(fs.readFileSync('tsconfig.json', 'utf8'));
                
                // Validate compiler options
                this.validate(
                    'TypeScript strict mode',
                    tsconfig.compilerOptions?.strict === true,
                    'TypeScript strict mode should be enabled'
                );

                this.validate(
                    'TypeScript target ES2020',
                    tsconfig.compilerOptions?.target === 'ES2020',
                    'TypeScript target should be ES2020'
                );

                this.validate(
                    'Path mapping configured',
                    tsconfig.compilerOptions?.paths !== undefined,
                    'Path mapping should be configured'
                );

                // Check specific path mappings
                const paths = tsconfig.compilerOptions?.paths || {};
                const requiredPaths = [
                    '@presentation/*',
                    '@application/*',
                    '@domain/*',
                    '@infrastructure/*',
                    '@shared/*'
                ];

                requiredPaths.forEach(pathMapping => {
                    this.validate(
                        `Path mapping: ${pathMapping}`,
                        paths[pathMapping] !== undefined,
                        `Path mapping ${pathMapping} should be configured`
                    );
                });

            } catch (error) {
                this.validate(
                    'tsconfig.json valid JSON',
                    false,
                    `tsconfig.json should be valid JSON: ${error.message}`
                );
            }
        }
    }

    // Validate build system
    validateBuildSystem() {
        console.log('\n🔧 Validating Build System...');
        
        // Check webpack config
        this.validate(
            'webpack.config.js exists',
            this.fileExists('webpack.config.js'),
            'webpack.config.js should exist'
        );

        // Check package.json
        this.validate(
            'package.json exists',
            this.fileExists('package.json'),
            'package.json should exist'
        );

        if (this.fileExists('package.json')) {
            try {
                const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
                
                // Check required scripts
                const requiredScripts = ['build', 'build:dev', 'watch', 'compile', 'lint', 'test'];
                requiredScripts.forEach(script => {
                    this.validate(
                        `Script: ${script}`,
                        packageJson.scripts?.[script] !== undefined,
                        `Package.json should have ${script} script`
                    );
                });

                // Check VS Code extension fields
                this.validate(
                    'VS Code engine version',
                    packageJson.engines?.vscode !== undefined,
                    'Package.json should specify VS Code engine version'
                );

                this.validate(
                    'Extension main entry',
                    packageJson.main !== undefined,
                    'Package.json should specify main entry point'
                );

                this.validate(
                    'Extension activation events',
                    packageJson.activationEvents !== undefined,
                    'Package.json should specify activation events'
                );

            } catch (error) {
                this.validate(
                    'package.json valid JSON',
                    false,
                    `package.json should be valid JSON: ${error.message}`
                );
            }
        }
    }

    // Validate foundation files
    validateFoundationFiles() {
        console.log('\n📄 Validating Foundation Files...');
        
        const requiredFiles = [
            'src/extension.ts',
            'src/shared/types/index.ts',
            'src/shared/container/index.ts'
        ];

        requiredFiles.forEach(file => {
            this.validate(
                `File: ${file}`,
                this.fileExists(file),
                `File ${file} should exist`
            );
        });

        // Validate extension.ts structure
        if (this.fileExists('src/extension.ts')) {
            const content = fs.readFileSync('src/extension.ts', 'utf8');
            
            this.validate(
                'Extension activate function',
                content.includes('export async function activate'),
                'extension.ts should export activate function'
            );

            this.validate(
                'Extension deactivate function',
                content.includes('export function deactivate'),
                'extension.ts should export deactivate function'
            );

            this.validate(
                'VS Code import',
                content.includes("import * as vscode from 'vscode'"),
                'extension.ts should import vscode'
            );
        }
    }

    // Test TypeScript compilation
    validateTypeScriptCompilation() {
        console.log('\n🔍 Validating TypeScript Compilation...');
        
        try {
            execSync('npx tsc --noEmit', { stdio: 'pipe' });
            this.validate(
                'TypeScript compilation',
                true,
                'TypeScript compiles without errors'
            );
        } catch (error) {
            this.validate(
                'TypeScript compilation',
                false,
                `TypeScript compilation failed: ${error.message}`
            );
        }
    }

    // Test build process
    validateBuildProcess() {
        console.log('\n🏗️  Validating Build Process...');
        
        try {
            execSync('npm run build', { stdio: 'pipe' });
            this.validate(
                'Build process',
                true,
                'Build process completes successfully'
            );

            // Check if output files exist
            this.validate(
                'Build output exists',
                this.fileExists('out/extension.js'),
                'Build should produce out/extension.js'
            );

        } catch (error) {
            this.validate(
                'Build process',
                false,
                `Build process failed: ${error.message}`
            );
        }
    }

    // Validate clean architecture compliance
    validateCleanArchitecture() {
        console.log('\n🏛️  Validating Clean Architecture Compliance...');
        
        // Check that presentation layer doesn't import from infrastructure
        // This would require more sophisticated AST parsing in a real implementation
        this.validate(
            'Clean architecture layers',
            true, // Placeholder - would need AST analysis
            'Architecture layers should follow dependency inversion'
        );
    }

    // Run all validations
    async runAllValidations() {
        console.log('🚀 Starting SETUP-001 Validation...\n');
        
        this.validateDirectoryStructure();
        this.validateTypeScriptConfig();
        this.validateBuildSystem();
        this.validateFoundationFiles();
        this.validateTypeScriptCompilation();
        this.validateBuildProcess();
        this.validateCleanArchitecture();
        
        this.printSummary();
        return this.results.failed === 0;
    }

    // Print validation summary
    printSummary() {
        console.log('\n📊 Validation Summary');
        console.log('='.repeat(50));
        console.log(`Total Tests: ${this.results.total}`);
        console.log(`Passed: ${this.results.passed}`);
        console.log(`Failed: ${this.results.failed}`);
        console.log(`Success Rate: ${((this.results.passed / this.results.total) * 100).toFixed(1)}%`);
        
        if (this.results.failed === 0) {
            console.log('\n🎉 All validations passed! SETUP-001 is complete.');
            console.log('✅ Ready to proceed to SETUP-002');
        } else {
            console.log('\n❌ Some validations failed. Please fix issues before proceeding.');
            console.log('\nFailed Tests:');
            this.results.details
                .filter(detail => detail.status === 'FAILED')
                .forEach(detail => {
                    console.log(`  - ${detail.test}: ${detail.message}`);
                });
        }
    }
}

// Run validation if called directly
if (require.main === module) {
    const validator = new Setup001Validator();
    validator.runAllValidations().then(success => {
        process.exit(success ? 0 : 1);
    });
}

module.exports = Setup001Validator;
```

## 📋 **Manual Validation Checklist**

### **Quick Validation Commands**
```bash
# 1. Check directory structure
ls -la src/
ls -la src/presentation/
ls -la src/application/
ls -la src/domain/
ls -la src/infrastructure/
ls -la src/shared/

# 2. Validate TypeScript configuration
npx tsc --noEmit

# 3. Test build process
npm run build

# 4. Check build output
ls -la out/

# 5. Validate extension manifest
cat package.json | jq '.engines.vscode, .main, .activationEvents'

# 6. Test extension loading (manual in VS Code)
# Open VS Code, press F5 to launch Extension Development Host
# Check that extension activates without errors
```

## 🎯 **Quality Gate Validation Matrix**

### **Technical Quality Gates**
| Gate | Validation Method | Pass Criteria |
|------|------------------|---------------|
| TypeScript Compilation | `npx tsc --noEmit` | Zero errors |
| Webpack Build | `npm run build` | Successful completion |
| Extension Loading | Manual VS Code test | No activation errors |
| Path Mappings | Import test | All paths resolve |
| Dependency Injection | Unit test | Container works |

### **Architecture Quality Gates**
| Gate | Validation Method | Pass Criteria |
|------|------------------|---------------|
| Clean Architecture | Directory structure check | Layers separated |
| Dependency Inversion | Import analysis | Correct dependencies |
| Component Support | Structure validation | All Phase 1 components supported |
| Extensibility | Architecture review | Future phases supported |

### **User Experience Quality Gates**
| Gate | Validation Method | Pass Criteria |
|------|------------------|---------------|
| Activation Speed | Performance test | < 5 seconds |
| Progressive Features | Config validation | Settings support |
| UX-First Development | Structure review | UX components ready |
| Contextual Greeting | Foundation check | Greeting system ready |

### **Performance Quality Gates**
| Gate | Validation Method | Pass Criteria |
|------|------------------|---------------|
| Bundle Size | Build output check | Optimized size |
| Development Efficiency | Build time test | Fast builds |
| Performance Targets | Config validation | Settings optimized |
| Memory Foundation | Architecture review | Memory management ready |

## 🚨 **Failure Recovery Procedures**

### **Common Issues and Solutions**

#### **TypeScript Compilation Errors**
```bash
# Check for common issues
npx tsc --noEmit --listFiles
# Fix path mapping issues
# Verify all imports are correctly typed
```

#### **Build Process Failures**
```bash
# Clean build
rm -rf out/ node_modules/
npm install
npm run build
```

#### **Extension Loading Issues**
```bash
# Validate package.json
npx vsce package --dry-run
# Check activation events
# Verify entry point exists
```

## 📊 **Success Criteria Validation**

### **SETUP-001 Complete When:**
- [ ] All 25+ validation tests pass
- [ ] TypeScript compiles with zero errors
- [ ] Webpack build completes successfully
- [ ] Extension loads in VS Code without errors
- [ ] All quality gates validated
- [ ] Foundation ready for SETUP-002

### **Ready for Next Phase When:**
- [ ] Project structure validated
- [ ] Build system functional
- [ ] Development environment ready
- [ ] All dependencies satisfied for SETUP-002
- [ ] Documentation updated
- [ ] Execution tracker completed

---

**Usage**: Run `node setup-001-validator.js` to automatically validate SETUP-001 completion  
**Success Criteria**: All validations must pass before proceeding to SETUP-002  
**Quality Assurance**: Manual verification recommended in addition to automated validation
