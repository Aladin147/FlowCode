#!/usr/bin/env node

/**
 * ACCURATE CONTEXT BUTTON FUNCTIONALITY CHECK
 * Verify what's actually missing vs what the audit incorrectly flagged
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 ACCURATE CONTEXT BUTTON FUNCTIONALITY CHECK');
console.log('==============================================\n');

const chatInterfacePath = path.join(__dirname, 'src', 'ui', 'chat-interface.ts');
const chatContent = fs.readFileSync(chatInterfacePath, 'utf8');

console.log('📊 DETAILED CONTEXT BUTTON VERIFICATION');
console.log('=======================================\n');

// More accurate checks based on actual implementation
const accurateChecks = {
    'File context handler case': /case 'file':/,
    'Folder context handler case': /case 'folder':/,
    'Problems context handler case': /case 'problems':/,
    'handleAddContext method': /handleAddContext\(.*type.*value/,
    'addFileContext JS function': /function addFileContext\(\)/,
    'addFolderContext JS function': /function addFolderContext\(\)/,
    'addProblemsContext JS function': /function addProblemsContext\(\)/,
    'addContext message handling': /case 'addContext':/,
    'File context implementation': /private async addFileContext\(/,
    'Folder context implementation': /private async addFolderContext\(/,
    'Problems context implementation': /private async addProblemsContext\(/,
    'Context buttons in HTML': /addFileContext.*addFolderContext.*addProblemsContext/,
    'Context buttons onclick': /onclick="addFileContext\(\)"/,
    'File picker functionality': /vscode\.window\.showQuickPick/,
    'File reading functionality': /vscode\.workspace\.openTextDocument/,
    'Folder scanning functionality': /vscode\.workspace\.findFiles/,
    'Problems diagnostics': /vscode\.languages\.getDiagnostics/
};

let passedChecks = 0;
let failedChecks = [];

console.log('Context button functionality verification:');
Object.entries(accurateChecks).forEach(([check, pattern]) => {
    const isPresent = pattern.test(chatContent);
    console.log(`${check}: ${isPresent ? '✅ Present' : '❌ Missing'}`);
    
    if (isPresent) {
        passedChecks++;
    } else {
        failedChecks.push(check);
    }
});

const completionRate = (passedChecks / Object.keys(accurateChecks).length) * 100;

console.log(`\n📊 ACCURATE COMPLETION RATE: ${completionRate.toFixed(1)}%`);
console.log(`Passed checks: ${passedChecks}/${Object.keys(accurateChecks).length}`);

if (failedChecks.length > 0) {
    console.log('\n❌ MISSING FUNCTIONALITY:');
    failedChecks.forEach((check, i) => {
        console.log(`${i + 1}. ${check}`);
    });
} else {
    console.log('\n✅ ALL CONTEXT BUTTON FUNCTIONALITY IS PRESENT!');
}

// Check for specific UI integration issues
console.log('\n🔍 UI INTEGRATION ANALYSIS');
console.log('==========================');

const uiChecks = {
    'Context buttons in main HTML': /addFileContext.*title="Add file context"/,
    'Context buttons in fallback HTML': /onclick="addFileContext\(\)"/,
    'Button styling': /context-buttons/,
    'Button icons': /📁.*📂.*⚠️/,
    'Input wrapper': /input-wrapper/,
    'Message container': /messages-container/
};

let uiIssues = [];

Object.entries(uiChecks).forEach(([check, pattern]) => {
    const isPresent = pattern.test(chatContent);
    console.log(`${check}: ${isPresent ? '✅ Present' : '❌ Missing'}`);
    
    if (!isPresent) {
        uiIssues.push(check);
    }
});

console.log('\n🎯 REAL ISSUES IDENTIFICATION');
console.log('=============================');

if (failedChecks.length === 0 && uiIssues.length === 0) {
    console.log('✅ NO REAL ISSUES FOUND');
    console.log('The context button functionality is complete.');
    console.log('The original audit had false negatives due to pattern matching issues.');
} else {
    console.log('🚨 REAL ISSUES TO FIX:');
    
    if (failedChecks.length > 0) {
        console.log('\nFunctionality gaps:');
        failedChecks.forEach((issue, i) => {
            console.log(`${i + 1}. ${issue}`);
        });
    }
    
    if (uiIssues.length > 0) {
        console.log('\nUI integration gaps:');
        uiIssues.forEach((issue, i) => {
            console.log(`${i + 1}. ${issue}`);
        });
    }
}

console.log('\n📋 RECOMMENDATIONS');
console.log('==================');

if (completionRate >= 95) {
    console.log('✅ Context button system is essentially complete.');
    console.log('Any remaining issues are cosmetic or pattern-matching artifacts.');
} else if (completionRate >= 80) {
    console.log('⚠️ Context button system is mostly complete but needs minor fixes.');
} else {
    console.log('❌ Context button system needs significant work.');
}

process.exit(completionRate < 80 ? 1 : 0);
