#!/usr/bin/env node

/**
 * Production Readiness Validation Script
 * Validates that FlowCode extension is ready for production deployment
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class ProductionReadinessChecker {
    constructor() {
        this.checks = [];
        this.results = {
            passed: 0,
            failed: 0,
            warnings: 0,
            details: []
        };
    }

    log(level, message, details = null) {
        const timestamp = new Date().toISOString();
        const logEntry = { timestamp, level, message, details };
        
        console.log(`[${timestamp}] ${level.toUpperCase()}: ${message}`);
        if (details) {
            console.log(`  Details: ${JSON.stringify(details, null, 2)}`);
        }
        
        this.results.details.push(logEntry);
    }

    async runCheck(name, checkFn) {
        try {
            this.log('info', `Running check: ${name}`);
            const result = await checkFn();
            
            if (result.passed) {
                this.results.passed++;
                this.log('pass', `✅ ${name}: ${result.message}`, result.details);
            } else {
                this.results.failed++;
                this.log('fail', `❌ ${name}: ${result.message}`, result.details);
            }
            
            if (result.warnings && result.warnings.length > 0) {
                this.results.warnings += result.warnings.length;
                result.warnings.forEach(warning => {
                    this.log('warn', `⚠️  ${name}: ${warning}`);
                });
            }
            
        } catch (error) {
            this.results.failed++;
            this.log('fail', `❌ ${name}: Check failed with error`, error.message);
        }
    }

    // Check 1: Package.json validation
    async checkPackageJson() {
        const packagePath = path.join(process.cwd(), 'package.json');
        
        if (!fs.existsSync(packagePath)) {
            return { passed: false, message: 'package.json not found' };
        }
        
        const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
        const issues = [];
        const warnings = [];
        
        // Required fields
        const requiredFields = ['name', 'version', 'description', 'publisher', 'engines'];
        requiredFields.forEach(field => {
            if (!pkg[field]) {
                issues.push(`Missing required field: ${field}`);
            }
        });
        
        // Version format
        if (pkg.version && !/^\d+\.\d+\.\d+/.test(pkg.version)) {
            issues.push('Version should follow semantic versioning');
        }
        
        // VS Code engine version
        if (pkg.engines && pkg.engines.vscode) {
            const vscodeVersion = pkg.engines.vscode.replace('^', '');
            if (vscodeVersion < '1.74.0') {
                warnings.push('VS Code engine version might be too old');
            }
        }
        
        // Production scripts
        const requiredScripts = ['compile', 'package', 'vscode:prepublish'];
        requiredScripts.forEach(script => {
            if (!pkg.scripts || !pkg.scripts[script]) {
                issues.push(`Missing required script: ${script}`);
            }
        });
        
        return {
            passed: issues.length === 0,
            message: issues.length === 0 ? 'Package.json is properly configured' : `${issues.length} issues found`,
            details: { issues, warnings, version: pkg.version },
            warnings
        };
    }

    // Check 2: TypeScript compilation
    async checkCompilation() {
        try {
            execSync('npx tsc --noEmit', { stdio: 'pipe' });
            return {
                passed: true,
                message: 'TypeScript compilation successful'
            };
        } catch (error) {
            const output = error.stdout ? error.stdout.toString() : error.message;
            return {
                passed: false,
                message: 'TypeScript compilation failed',
                details: { error: output }
            };
        }
    }

    // Check 3: Dependencies security
    async checkDependencySecurity() {
        try {
            const auditOutput = execSync('npm audit --json', { stdio: 'pipe' }).toString();
            const audit = JSON.parse(auditOutput);
            
            const vulnerabilities = audit.vulnerabilities || {};
            const vulnCount = Object.keys(vulnerabilities).length;
            const highVulns = Object.values(vulnerabilities).filter(v => 
                v.severity === 'high' || v.severity === 'critical'
            ).length;
            
            return {
                passed: highVulns === 0,
                message: highVulns === 0 
                    ? `No high/critical vulnerabilities found (${vulnCount} total)` 
                    : `${highVulns} high/critical vulnerabilities found`,
                details: { totalVulnerabilities: vulnCount, highCritical: highVulns },
                warnings: vulnCount > 0 && highVulns === 0 ? [`${vulnCount} low/medium vulnerabilities found`] : []
            };
        } catch (error) {
            return {
                passed: false,
                message: 'Failed to run security audit',
                details: { error: error.message }
            };
        }
    }

    // Check 4: File structure validation
    async checkFileStructure() {
        const requiredFiles = [
            'src/extension.ts',
            'src/flowcode-extension.ts',
            'README.md',
            'CHANGELOG.md',
            'package.json',
            'tsconfig.json'
        ];
        
        const requiredDirs = [
            'src/services',
            'src/utils',
            'src/commands',
            'docs'
        ];
        
        const missing = [];
        
        requiredFiles.forEach(file => {
            if (!fs.existsSync(file)) {
                missing.push(`File: ${file}`);
            }
        });
        
        requiredDirs.forEach(dir => {
            if (!fs.existsSync(dir)) {
                missing.push(`Directory: ${dir}`);
            }
        });
        
        return {
            passed: missing.length === 0,
            message: missing.length === 0 
                ? 'All required files and directories present' 
                : `${missing.length} required items missing`,
            details: { missing }
        };
    }

    // Check 5: Extension manifest validation
    async checkExtensionManifest() {
        const packagePath = path.join(process.cwd(), 'package.json');
        const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
        
        const issues = [];
        const warnings = [];
        
        // Check activation events
        if (!pkg.activationEvents || pkg.activationEvents.length === 0) {
            issues.push('No activation events defined');
        }
        
        // Check main entry point
        if (!pkg.main) {
            issues.push('No main entry point defined');
        } else if (!fs.existsSync(pkg.main.replace('./out/', './src/').replace('.js', '.ts'))) {
            issues.push('Main entry point source file not found');
        }
        
        // Check commands
        if (!pkg.contributes || !pkg.contributes.commands) {
            warnings.push('No commands defined in contributes');
        }
        
        // Check categories
        if (!pkg.categories || pkg.categories.length === 0) {
            warnings.push('No categories defined');
        }
        
        return {
            passed: issues.length === 0,
            message: issues.length === 0 
                ? 'Extension manifest is valid' 
                : `${issues.length} manifest issues found`,
            details: { issues },
            warnings
        };
    }

    // Main execution
    async run() {
        console.log('🚀 FlowCode Production Readiness Check\n');
        
        await this.runCheck('Package.json Validation', () => this.checkPackageJson());
        await this.runCheck('TypeScript Compilation', () => this.checkCompilation());
        await this.runCheck('Dependency Security', () => this.checkDependencySecurity());
        await this.runCheck('File Structure', () => this.checkFileStructure());
        await this.runCheck('Extension Manifest', () => this.checkExtensionManifest());
        
        // Summary
        console.log('\n📊 Production Readiness Summary:');
        console.log(`✅ Passed: ${this.results.passed}`);
        console.log(`❌ Failed: ${this.results.failed}`);
        console.log(`⚠️  Warnings: ${this.results.warnings}`);
        
        const isReady = this.results.failed === 0;
        console.log(`\n${isReady ? '🎉' : '🚫'} Production Ready: ${isReady ? 'YES' : 'NO'}`);
        
        // Save detailed report
        const reportPath = path.join(process.cwd(), 'production-readiness-report.json');
        fs.writeFileSync(reportPath, JSON.stringify({
            timestamp: new Date().toISOString(),
            ready: isReady,
            summary: {
                passed: this.results.passed,
                failed: this.results.failed,
                warnings: this.results.warnings
            },
            details: this.results.details
        }, null, 2));
        
        console.log(`\n📄 Detailed report saved to: ${reportPath}`);
        
        process.exit(isReady ? 0 : 1);
    }
}

// Run the checker
if (require.main === module) {
    const checker = new ProductionReadinessChecker();
    checker.run().catch(error => {
        console.error('Production readiness check failed:', error);
        process.exit(1);
    });
}

module.exports = ProductionReadinessChecker;
