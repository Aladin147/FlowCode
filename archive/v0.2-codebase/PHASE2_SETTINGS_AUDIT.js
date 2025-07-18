#!/usr/bin/env node

/**
 * PHASE 2 SETTINGS SYSTEM AUDIT
 * Verify settings cleanup claims and check for accidentally removed critical settings
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 PHASE 2 SETTINGS SYSTEM AUDIT');
console.log('=================================\n');

// Read source files
const packagePath = path.join(__dirname, 'package.json');
const configManagerPath = path.join(__dirname, 'src', 'utils', 'configuration-manager.ts');

const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
const configManagerContent = fs.readFileSync(configManagerPath, 'utf8');

// Extract current settings from package.json
const currentSettings = Object.keys(packageJson.contributes.configuration.properties);

console.log('📊 PHASE 2 CLAIMS VERIFICATION');
console.log('==============================\n');

// CLAIM 1: "Removed 17 non-functional settings (40% reduction)"
console.log('🔍 CLAIM 1: Settings reduction verification');
console.log('------------------------------------------');

console.log(`Current settings count: ${currentSettings.length}`);

// Based on our documentation, we claimed to go from 42 to 25 settings
const claimedOriginalCount = 42;
const claimedFinalCount = 25;
const claimedReduction = claimedOriginalCount - claimedFinalCount;
const claimedReductionPercent = (claimedReduction / claimedOriginalCount) * 100;

console.log(`Claimed original count: ${claimedOriginalCount}`);
console.log(`Claimed final count: ${claimedFinalCount}`);
console.log(`Actual current count: ${currentSettings.length}`);
console.log(`Claimed reduction: ${claimedReduction} settings (${claimedReductionPercent.toFixed(1)}%)`);

const actualReductionMatches = currentSettings.length === claimedFinalCount;
console.log(`Reduction claim accuracy: ${actualReductionMatches ? '✅ VERIFIED' : '❌ INACCURATE'}`);

// CLAIM 2: "100% functional settings"
console.log('\n🔍 CLAIM 2: Settings functionality verification');
console.log('----------------------------------------------');

// Check which settings are actually used in ConfigurationManager
const settingsUsageChecks = {
    'ai.provider': /ai\.provider/,
    'ai.maxTokens': /ai\.maxTokens/,
    'customEndpoint': /customEndpoint/,
    'performance.memoryThreshold': /performance\.memoryThreshold/,
    'gitHooks.enablePreCommit': /gitHooks\.enablePreCommit/,
    'gitHooks.enablePrePush': /gitHooks\.enablePrePush/,
    'agent.riskTolerance': /agent\.riskTolerance/,
    'agent.executionTimeout': /agent\.executionTimeout/,
    'telemetry.enabled': /telemetry\.enabled/
};

let functionalSettings = 0;
let totalChecked = 0;

console.log('Settings usage in ConfigurationManager:');
Object.entries(settingsUsageChecks).forEach(([setting, pattern]) => {
    totalChecked++;
    const fullSettingName = `flowcode.${setting}`;
    const isInPackageJson = currentSettings.includes(fullSettingName);
    const isUsedInCode = pattern.test(configManagerContent);
    
    console.log(`${fullSettingName}:`);
    console.log(`  📋 Declared: ${isInPackageJson ? '✅' : '❌'}`);
    console.log(`  🔧 Used in code: ${isUsedInCode ? '✅' : '❌'}`);
    
    if (isInPackageJson && isUsedInCode) {
        functionalSettings++;
    }
    console.log('');
});

const functionalityRate = (functionalSettings / totalChecked) * 100;
console.log(`Functionality verification: ${functionalSettings}/${totalChecked} settings verified (${functionalityRate.toFixed(1)}%)`);

// CLAIM 3: Check for accidentally removed critical settings
console.log('🔍 CLAIM 3: Critical settings preservation check');
console.log('-----------------------------------------------');

const criticalSettingsToCheck = [
    'flowcode.ai.provider',
    'flowcode.ai.maxTokens', 
    'flowcode.customEndpoint',
    'flowcode.gitHooks.enablePreCommit',
    'flowcode.gitHooks.enablePrePush'
];

let criticalSettingsPresent = 0;

criticalSettingsToCheck.forEach(setting => {
    const isPresent = currentSettings.includes(setting);
    console.log(`${setting}: ${isPresent ? '✅ Present' : '❌ MISSING'}`);
    if (isPresent) criticalSettingsPresent++;
});

const criticalPreservationRate = (criticalSettingsPresent / criticalSettingsToCheck.length) * 100;
console.log(`\nCritical settings preservation: ${criticalPreservationRate.toFixed(1)}%`);

// CLAIM 4: Check for settings that were supposed to be removed but are still there
console.log('\n🔍 CLAIM 4: Verify removed settings are actually gone');
console.log('---------------------------------------------------');

const settingsWeClaimedToRemove = [
    'flowcode.security.enableAuditing',
    'flowcode.security.auditLevel',
    'flowcode.security.excludePatterns',
    'flowcode.userExperience.enableQuickActions',
    'flowcode.userExperience.enableStatusBarIndicators',
    'flowcode.userExperience.enableSmartNotifications',
    'flowcode.userExperience.enableContextualHelp',
    'flowcode.telemetry.collectUsageData',
    'flowcode.telemetry.collectPerformanceData',
    'flowcode.telemetry.collectErrorReports',
    'flowcode.telemetry.privacyLevel',
    'flowcode.logging.level',
    'flowcode.agent.enableLearning',
    'flowcode.agent.adaptiveBehavior',
    'flowcode.performance.enableOptimization',
    'flowcode.performance.enableAutoOptimization',
    'flowcode.maxTokens' // duplicate
];

let actuallyRemoved = 0;
let stillPresent = [];

settingsWeClaimedToRemove.forEach(setting => {
    const isStillPresent = currentSettings.includes(setting);
    console.log(`${setting}: ${isStillPresent ? '❌ Still present' : '✅ Removed'}`);
    
    if (isStillPresent) {
        stillPresent.push(setting);
    } else {
        actuallyRemoved++;
    }
});

const removalRate = (actuallyRemoved / settingsWeClaimedToRemove.length) * 100;
console.log(`\nRemoval success rate: ${removalRate.toFixed(1)}%`);

// SUMMARY
console.log('\n📊 PHASE 2 AUDIT SUMMARY');
console.log('========================');

const issues = [];

if (!actualReductionMatches) {
    issues.push(`Settings count mismatch: expected ${claimedFinalCount}, got ${currentSettings.length}`);
}

if (criticalPreservationRate < 100) {
    issues.push(`Critical settings missing: ${criticalSettingsToCheck.length - criticalSettingsPresent} settings`);
}

if (stillPresent.length > 0) {
    issues.push(`Settings not removed: ${stillPresent.length} settings still present`);
}

if (functionalityRate < 80) {
    issues.push(`Low functionality verification rate: ${functionalityRate.toFixed(1)}%`);
}

console.log(`Issues found: ${issues.length}`);

if (issues.length === 0) {
    console.log('\n✅ PHASE 2 CLAIMS VERIFIED');
    console.log('Settings cleanup appears successful.');
} else {
    console.log('\n❌ PHASE 2 CLAIMS HAVE ISSUES');
    issues.forEach((issue, i) => {
        console.log(`${i + 1}. ${issue}`);
    });
}

console.log('\n🎯 RECOMMENDATIONS');
console.log('==================');

if (issues.length === 0) {
    console.log('✅ Phase 2 work appears solid. Proceed to Phase 3 audit.');
} else {
    console.log('❌ Phase 2 needs attention:');
    if (stillPresent.length > 0) {
        console.log('- Complete removal of claimed-to-be-removed settings');
    }
    if (criticalPreservationRate < 100) {
        console.log('- Restore accidentally removed critical settings');
    }
    console.log('- Verify settings functionality in actual usage');
}

process.exit(issues.length > 0 ? 1 : 0);
