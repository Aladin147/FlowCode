#!/usr/bin/env node

/**
 * EXTENSION MANIFEST VALIDATION
 * Verify package.json has all required fields for VS Code extension
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 EXTENSION MANIFEST VALIDATION');
console.log('=================================\n');

const packagePath = path.join(__dirname, 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

console.log('📊 REQUIRED FIELDS VERIFICATION');
console.log('===============================\n');

// Required fields for VS Code extension
const requiredFields = {
    'name': { value: packageJson.name, required: true },
    'displayName': { value: packageJson.displayName, required: true },
    'description': { value: packageJson.description, required: true },
    'version': { value: packageJson.version, required: true },
    'publisher': { value: packageJson.publisher, required: true },
    'engines.vscode': { value: packageJson.engines?.vscode, required: true },
    'main': { value: packageJson.main, required: true },
    'activationEvents': { value: packageJson.activationEvents, required: true },
    'contributes': { value: packageJson.contributes, required: true },
    'categories': { value: packageJson.categories, required: false },
    'keywords': { value: packageJson.keywords, required: false },
    'license': { value: packageJson.license, required: false },
    'repository': { value: packageJson.repository, required: false },
    'bugs': { value: packageJson.bugs, required: false }
};

let missingRequired = [];
let warnings = [];

Object.entries(requiredFields).forEach(([field, { value, required }]) => {
    const exists = value !== undefined && value !== null;
    const status = exists ? '✅' : (required ? '❌' : '⚠️');
    
    console.log(`${field}: ${status} ${exists ? '(present)' : '(missing)'}`);
    
    if (required && !exists) {
        missingRequired.push(field);
    } else if (!required && !exists) {
        warnings.push(field);
    }
});

console.log('\n🔍 CONTRIBUTION POINTS VERIFICATION');
console.log('===================================');

const contributes = packageJson.contributes || {};
const contributionPoints = {
    'commands': { value: contributes.commands, expected: 'array' },
    'configuration': { value: contributes.configuration, expected: 'object' },
    'activationEvents': { value: packageJson.activationEvents, expected: 'array' },
    'menus': { value: contributes.menus, expected: 'object' },
    'keybindings': { value: contributes.keybindings, expected: 'array' }
};

let contributionIssues = [];

Object.entries(contributionPoints).forEach(([point, { value, expected }]) => {
    const exists = value !== undefined && value !== null;
    const correctType = exists && (
        (expected === 'array' && Array.isArray(value)) ||
        (expected === 'object' && typeof value === 'object' && !Array.isArray(value))
    );
    
    let status = '⚠️ Optional';
    if (exists && correctType) {
        status = '✅ Valid';
    } else if (exists && !correctType) {
        status = '❌ Invalid type';
        contributionIssues.push(`${point} has wrong type (expected ${expected})`);
    }
    
    console.log(`${point}: ${status}`);
    
    if (point === 'commands' && exists) {
        console.log(`  Commands count: ${value.length}`);
    }
    if (point === 'configuration' && exists) {
        const props = value.properties ? Object.keys(value.properties).length : 0;
        console.log(`  Configuration properties: ${props}`);
    }
});

console.log('\n🔍 ACTIVATION EVENTS VERIFICATION');
console.log('=================================');

const activationEvents = packageJson.activationEvents || [];
if (activationEvents.length === 0) {
    console.log('❌ No activation events defined');
    contributionIssues.push('No activation events defined');
} else {
    console.log(`✅ ${activationEvents.length} activation events defined:`);
    activationEvents.forEach((event, i) => {
        console.log(`  ${i + 1}. ${event}`);
    });
}

console.log('\n🔍 MAIN ENTRY POINT VERIFICATION');
console.log('================================');

const mainEntry = packageJson.main;
if (!mainEntry) {
    console.log('❌ Main entry point not defined');
    contributionIssues.push('Main entry point not defined');
} else {
    const mainPath = path.join(__dirname, mainEntry);
    const exists = fs.existsSync(mainPath);
    console.log(`Main entry: ${mainEntry}`);
    console.log(`File exists: ${exists ? '✅' : '❌'}`);
    
    if (!exists) {
        contributionIssues.push(`Main entry file does not exist: ${mainEntry}`);
    }
}

console.log('\n🔍 DEPENDENCIES VERIFICATION');
console.log('============================');

const dependencies = packageJson.dependencies || {};
const devDependencies = packageJson.devDependencies || {};

console.log(`Dependencies: ${Object.keys(dependencies).length}`);
console.log(`Dev Dependencies: ${Object.keys(devDependencies).length}`);

// Check for VS Code types
const hasVSCodeTypes = devDependencies['@types/vscode'] || dependencies['@types/vscode'];
console.log(`VS Code types: ${hasVSCodeTypes ? '✅' : '❌'}`);

if (!hasVSCodeTypes) {
    contributionIssues.push('Missing @types/vscode dependency');
}

// Check for TypeScript
const hasTypeScript = devDependencies['typescript'] || dependencies['typescript'];
console.log(`TypeScript: ${hasTypeScript ? '✅' : '❌'}`);

console.log('\n📊 VALIDATION SUMMARY');
console.log('====================');

const totalIssues = missingRequired.length + contributionIssues.length;

console.log(`Missing required fields: ${missingRequired.length}`);
console.log(`Contribution issues: ${contributionIssues.length}`);
console.log(`Warnings: ${warnings.length}`);
console.log(`Total issues: ${totalIssues}`);

if (missingRequired.length > 0) {
    console.log('\n❌ MISSING REQUIRED FIELDS:');
    missingRequired.forEach((field, i) => {
        console.log(`${i + 1}. ${field}`);
    });
}

if (contributionIssues.length > 0) {
    console.log('\n❌ CONTRIBUTION ISSUES:');
    contributionIssues.forEach((issue, i) => {
        console.log(`${i + 1}. ${issue}`);
    });
}

if (warnings.length > 0) {
    console.log('\n⚠️ WARNINGS (Optional fields):');
    warnings.forEach((field, i) => {
        console.log(`${i + 1}. ${field}`);
    });
}

console.log('\n🎯 FINAL VERDICT');
console.log('================');

if (totalIssues === 0) {
    console.log('✅ EXTENSION MANIFEST IS VALID');
    console.log('Package.json is properly configured for VS Code extension.');
} else if (missingRequired.length === 0) {
    console.log('⚠️ EXTENSION MANIFEST IS MOSTLY VALID');
    console.log('Minor issues found but extension should work.');
} else {
    console.log('❌ EXTENSION MANIFEST HAS CRITICAL ISSUES');
    console.log('Required fields are missing - extension may not load properly.');
}

process.exit(totalIssues > 3 ? 1 : 0);
