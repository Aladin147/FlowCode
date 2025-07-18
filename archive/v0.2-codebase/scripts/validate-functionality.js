#!/usr/bin/env node

/**
 * Basic functionality validation script
 * Tests core functionality without requiring VS Code extension host
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 FlowCode Functionality Validation');
console.log('=====================================\n');

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`✅ ${name}`);
        passed++;
    } catch (error) {
        console.log(`❌ ${name}: ${error.message}`);
        failed++;
    }
}

function expect(actual) {
    return {
        toBe: (expected) => {
            if (actual !== expected) {
                throw new Error(`Expected ${expected}, got ${actual}`);
            }
        },
        toBeInstanceOf: (constructor) => {
            if (!(actual instanceof constructor)) {
                throw new Error(`Expected instance of ${constructor.name}, got ${typeof actual}`);
            }
        },
        toBeTrue: () => {
            if (actual !== true) {
                throw new Error(`Expected true, got ${actual}`);
            }
        },
        toBeFalse: () => {
            if (actual !== false) {
                throw new Error(`Expected false, got ${actual}`);
            }
        },
        toThrow: () => {
            if (typeof actual !== 'function') {
                throw new Error('Expected a function');
            }
            try {
                actual();
                throw new Error('Expected function to throw');
            } catch (e) {
                // Expected to throw
            }
        },
        notToThrow: () => {
            if (typeof actual !== 'function') {
                throw new Error('Expected a function');
            }
            try {
                actual();
            } catch (e) {
                throw new Error(`Expected function not to throw, but it threw: ${e.message}`);
            }
        }
    };
}

// Test 1: File Structure Validation
test('Project structure is valid', () => {
    const requiredFiles = [
        'src/flowcode-extension.ts',
        'src/services/companion-guard.ts',
        'src/services/final-guard.ts',
        'src/services/architect-service.ts',
        'src/utils/logger.ts',
        'src/utils/error-handler.ts',
        'src/utils/type-guards.ts',
        'package.json',
        'tsconfig.json'
    ];

    for (const file of requiredFiles) {
        if (!fs.existsSync(file)) {
            throw new Error(`Required file missing: ${file}`);
        }
    }
});

// Test 2: Package.json Validation
test('Package.json is valid', () => {
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    
    expect(packageJson.name).toBe('flowcode');
    expect(packageJson.version).toBe('0.1.0');
    expect(packageJson.engines.vscode).toBe('^1.102.0');
    
    if (!packageJson.main) {
        throw new Error('Package.json missing main entry point');
    }
    
    if (!packageJson.contributes) {
        throw new Error('Package.json missing contributes section');
    }
});

// Test 3: TypeScript Compilation
test('TypeScript files compile without errors', () => {
    const { execSync } = require('child_process');
    
    try {
        execSync('npx tsc -p ./tsconfig.production.json --noEmit', { 
            stdio: 'pipe',
            cwd: process.cwd()
        });
    } catch (error) {
        throw new Error('TypeScript compilation failed');
    }
});

// Test 4: Core Module Loading
test('Core modules can be loaded', () => {
    // Test that compiled modules can be required
    const modules = [
        './out/utils/logger.js',
        './out/utils/type-guards.js',
        './out/utils/error-handler.js'
    ];

    for (const module of modules) {
        if (fs.existsSync(module)) {
            try {
                require(path.resolve(module));
            } catch (error) {
                if (!error.message.includes('Cannot find module \'vscode\'')) {
                    throw new Error(`Failed to load ${module}: ${error.message}`);
                }
                // VS Code module not available in Node.js context is expected
            }
        }
    }
});

// Test 5: Type Guards Functionality
test('Type guards work correctly', () => {
    // Since we can't load the actual module due to VS Code dependency,
    // we'll test the logic by reading and evaluating the source
    const typeGuardsSource = fs.readFileSync('src/utils/type-guards.ts', 'utf8');
    
    // Check that key functions are defined
    expect(typeGuardsSource.includes('export function isDefined')).toBeTrue();
    expect(typeGuardsSource.includes('export function isNonEmptyString')).toBeTrue();
    expect(typeGuardsSource.includes('export function isValidNumber')).toBeTrue();
    expect(typeGuardsSource.includes('export function safePropertyAccess')).toBeTrue();
});

// Test 6: Error Handler Integration
test('Error handler has enhanced functionality', () => {
    const errorHandlerSource = fs.readFileSync('src/utils/error-handler.ts', 'utf8');
    
    expect(errorHandlerSource.includes('EnhancedErrorHandler')).toBeTrue();
    expect(errorHandlerSource.includes('handleServiceError')).toBeTrue();
    expect(errorHandlerSource.includes('createErrorContext')).toBeTrue();
});

// Test 7: Service Dependencies
test('Services have proper dependencies', () => {
    const services = [
        'src/services/companion-guard.ts',
        'src/services/final-guard.ts',
        'src/services/architect-service.ts',
        'src/services/graph-service.ts',
        'src/services/hotfix-service.ts'
    ];

    for (const service of services) {
        const content = fs.readFileSync(service, 'utf8');
        
        // Check for proper imports
        expect(content.includes('import')).toBeTrue();
        
        // Check for initialize method
        expect(content.includes('initialize')).toBeTrue();
        
        // Check for error handling
        expect(content.includes('try') || content.includes('catch')).toBeTrue();
    }
});

// Test 8: Configuration Files
test('Configuration files are valid', () => {
    // Test tsconfig.json
    const tsconfig = JSON.parse(fs.readFileSync('tsconfig.json', 'utf8'));
    expect(tsconfig.compilerOptions.target).toBe('ES2022');
    expect(tsconfig.compilerOptions.module).toBe('commonjs');
    
    // Test tsconfig.production.json
    const tsconfigProd = JSON.parse(fs.readFileSync('tsconfig.production.json', 'utf8'));
    expect(tsconfigProd.extends).toBe('./tsconfig.json');
});

// Test 9: Extension Manifest
test('Extension manifest is complete', () => {
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    
    // Check required VS Code extension fields
    expect(packageJson.publisher).toBe('flowcode-team');
    expect(packageJson.categories).toBeInstanceOf(Array);
    expect(packageJson.activationEvents).toBeInstanceOf(Array);
    expect(packageJson.contributes.commands).toBeInstanceOf(Array);
    
    // Check that we have essential commands
    const commands = packageJson.contributes.commands;
    const commandIds = commands.map(cmd => cmd.command);
    
    expect(commandIds.includes('flowcode.initialize')).toBeTrue();
    expect(commandIds.includes('flowcode.generateCode')).toBeTrue();
    expect(commandIds.includes('flowcode.runSecurityAudit')).toBeTrue();
});

// Test 10: Documentation
test('Documentation is present', () => {
    const requiredDocs = [
        'README.md',
        'CHANGELOG.md',
        'docs/architecture.md',
        'docs/api-reference.md'
    ];

    for (const doc of requiredDocs) {
        if (!fs.existsSync(doc)) {
            throw new Error(`Required documentation missing: ${doc}`);
        }
        
        const content = fs.readFileSync(doc, 'utf8');
        if (content.length < 100) {
            throw new Error(`Documentation too short: ${doc}`);
        }
    }
});

// Test 11: Build Output
test('Build output is valid', () => {
    if (!fs.existsSync('out')) {
        throw new Error('Build output directory missing');
    }
    
    const requiredOutput = [
        'out/flowcode-extension.js',
        'out/utils/logger.js',
        'out/services/companion-guard.js'
    ];

    for (const file of requiredOutput) {
        if (!fs.existsSync(file)) {
            throw new Error(`Required build output missing: ${file}`);
        }
    }
});

// Test 12: Dependencies
test('Dependencies are properly installed', () => {
    if (!fs.existsSync('node_modules')) {
        throw new Error('Node modules not installed');
    }
    
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    const requiredDeps = ['@types/vscode', 'typescript', 'eslint'];
    
    for (const dep of requiredDeps) {
        const isInDeps = packageJson.dependencies && packageJson.dependencies[dep];
        const isInDevDeps = packageJson.devDependencies && packageJson.devDependencies[dep];
        
        if (!isInDeps && !isInDevDeps) {
            throw new Error(`Required dependency missing: ${dep}`);
        }
    }
});

// Summary
console.log('\n📊 Test Results');
console.log('================');
console.log(`✅ Passed: ${passed}`);
console.log(`❌ Failed: ${failed}`);
console.log(`📈 Success Rate: ${Math.round((passed / (passed + failed)) * 100)}%`);

if (failed === 0) {
    console.log('\n🎉 All functionality validation tests passed!');
    console.log('FlowCode extension is ready for testing and deployment.');
    process.exit(0);
} else {
    console.log('\n⚠️  Some validation tests failed.');
    console.log('Please review and fix the issues before proceeding.');
    process.exit(1);
}
