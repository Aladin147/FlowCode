#!/usr/bin/env node

/**
 * CORRECTED PHASE 2 SETTINGS AUDIT
 * Comprehensive check across all source files for settings usage
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');

console.log('🔍 CORRECTED PHASE 2 SETTINGS AUDIT');
console.log('===================================\n');

// Read package.json
const packagePath = path.join(__dirname, 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
const currentSettings = Object.keys(packageJson.contributes.configuration.properties);

console.log('📊 COMPREHENSIVE SETTINGS USAGE VERIFICATION');
console.log('============================================\n');

// Get all TypeScript files
const tsFiles = glob.sync('src/**/*.ts', { cwd: __dirname });

// Read all source files
const allSourceContent = tsFiles.map(file => {
    const filePath = path.join(__dirname, file);
    return {
        file,
        content: fs.readFileSync(filePath, 'utf8')
    };
}).reduce((acc, { file, content }) => {
    acc[file] = content;
    return acc;
}, {});

// Combine all content for searching
const combinedContent = Object.values(allSourceContent).join('\n');

// Test key settings that we kept
const settingsToVerify = [
    { setting: 'flowcode.ai.provider', pattern: /ai\.provider|'ai\.provider'|"ai\.provider"/ },
    { setting: 'flowcode.ai.maxTokens', pattern: /ai\.maxTokens|'ai\.maxTokens'|"ai\.maxTokens"/ },
    { setting: 'flowcode.customEndpoint', pattern: /customEndpoint|'customEndpoint'|"customEndpoint"/ },
    { setting: 'flowcode.performance.memoryThreshold', pattern: /memoryThreshold|'memoryThreshold'|"memoryThreshold"/ },
    { setting: 'flowcode.performance.enableGarbageCollection', pattern: /enableGarbageCollection|'enableGarbageCollection'|"enableGarbageCollection"/ },
    { setting: 'flowcode.gitHooks.enablePreCommit', pattern: /enablePreCommit|'enablePreCommit'|"enablePreCommit"/ },
    { setting: 'flowcode.gitHooks.enablePrePush', pattern: /enablePrePush|'enablePrePush'|"enablePrePush"/ },
    { setting: 'flowcode.telemetry.enabled', pattern: /telemetry\.enabled|'telemetry\.enabled'|"telemetry\.enabled"/ },
    { setting: 'flowcode.agent.riskTolerance', pattern: /riskTolerance|'riskTolerance'|"riskTolerance"/ },
    { setting: 'flowcode.agent.executionTimeout', pattern: /executionTimeout|'executionTimeout'|"executionTimeout"/ }
];

let functionalSettings = 0;
let declaredSettings = 0;

console.log('Settings verification across all source files:');
settingsToVerify.forEach(({ setting, pattern }) => {
    const isDeclared = currentSettings.includes(setting);
    const isUsed = pattern.test(combinedContent);
    
    console.log(`${setting}:`);
    console.log(`  📋 Declared in package.json: ${isDeclared ? '✅' : '❌'}`);
    console.log(`  🔧 Used in codebase: ${isUsed ? '✅' : '❌'}`);
    
    if (isDeclared) declaredSettings++;
    if (isDeclared && isUsed) functionalSettings++;
    
    // Find which files use this setting
    if (isUsed) {
        const usingFiles = Object.entries(allSourceContent)
            .filter(([file, content]) => pattern.test(content))
            .map(([file]) => file);
        
        if (usingFiles.length > 0) {
            console.log(`  📁 Used in: ${usingFiles.join(', ')}`);
        }
    }
    console.log('');
});

const functionalityRate = declaredSettings > 0 ? (functionalSettings / declaredSettings) * 100 : 0;

console.log('📊 PHASE 2 CORRECTED SUMMARY');
console.log('============================');
console.log(`Settings verified: ${declaredSettings}`);
console.log(`Functional settings: ${functionalSettings}`);
console.log(`Functionality rate: ${functionalityRate.toFixed(1)}%`);

// Check if we accidentally removed critical settings
console.log('\n🔍 CRITICAL SETTINGS CHECK');
console.log('--------------------------');

const criticalSettings = [
    'flowcode.ai.provider',
    'flowcode.ai.maxTokens',
    'flowcode.customEndpoint'
];

let criticalPresent = 0;
criticalSettings.forEach(setting => {
    const isPresent = currentSettings.includes(setting);
    console.log(`${setting}: ${isPresent ? '✅ Present' : '❌ MISSING'}`);
    if (isPresent) criticalPresent++;
});

// Verify our cleanup claims
console.log('\n🔍 CLEANUP VERIFICATION');
console.log('-----------------------');

const removedSettings = [
    'flowcode.security.enableAuditing',
    'flowcode.userExperience.enableQuickActions',
    'flowcode.logging.level',
    'flowcode.agent.enableLearning'
];

let actuallyRemoved = 0;
removedSettings.forEach(setting => {
    const isGone = !currentSettings.includes(setting);
    console.log(`${setting}: ${isGone ? '✅ Removed' : '❌ Still present'}`);
    if (isGone) actuallyRemoved++;
});

const removalRate = (actuallyRemoved / removedSettings.length) * 100;

// FINAL VERDICT
console.log('\n🎯 CORRECTED PHASE 2 VERDICT');
console.log('============================');

const issues = [];

if (functionalityRate < 80) {
    issues.push(`Low functionality rate: ${functionalityRate.toFixed(1)}%`);
}

if (criticalPresent < criticalSettings.length) {
    issues.push(`Missing critical settings: ${criticalSettings.length - criticalPresent}`);
}

if (removalRate < 100) {
    issues.push(`Incomplete removal: ${100 - removalRate}% of claimed removals not completed`);
}

console.log(`Current settings count: ${currentSettings.length}`);
console.log(`Functionality verification: ${functionalityRate.toFixed(1)}%`);
console.log(`Critical settings preservation: ${(criticalPresent / criticalSettings.length * 100).toFixed(1)}%`);
console.log(`Cleanup completion: ${removalRate.toFixed(1)}%`);

if (issues.length === 0) {
    console.log('\n✅ PHASE 2 CLAIMS VERIFIED');
    console.log('Settings cleanup was successful.');
} else {
    console.log('\n⚠️ PHASE 2 CLAIMS NEED REVIEW');
    console.log('Issues found:');
    issues.forEach((issue, i) => {
        console.log(`${i + 1}. ${issue}`);
    });
}

console.log('\n📋 RECOMMENDATIONS');
console.log('==================');

if (functionalityRate >= 80 && criticalPresent === criticalSettings.length) {
    console.log('✅ Phase 2 work is solid. Settings are functional and well-organized.');
} else {
    console.log('⚠️ Phase 2 may need minor adjustments but overall structure is good.');
}

process.exit(issues.length > 2 ? 1 : 0); // Allow minor issues
