#!/usr/bin/env node

/**
 * CORRECTED PHASE 1 AUDIT
 * Checks both extension.ts and diagnostic-extension.ts for command registration
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 CORRECTED PHASE 1 COMMAND AUDIT');
console.log('==================================\n');

// Read source files
const packagePath = path.join(__dirname, 'package.json');
const extensionPath = path.join(__dirname, 'src', 'extension.ts');
const diagnosticExtensionPath = path.join(__dirname, 'src', 'diagnostic-extension.ts');

const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
const extensionContent = fs.readFileSync(extensionPath, 'utf8');
const diagnosticExtensionContent = fs.readFileSync(diagnosticExtensionPath, 'utf8');

// Extract declared commands from package.json
const declaredCommands = packageJson.contributes.commands.map(cmd => cmd.command);

console.log('📊 COMPREHENSIVE COMMAND REGISTRATION CHECK');
console.log('===========================================\n');

let registeredInMain = 0;
let registeredInDiagnostic = 0;
let notRegistered = 0;
const missingCommands = [];

declaredCommands.forEach(cmd => {
    const inMain = extensionContent.includes(`'${cmd}'`) || extensionContent.includes(`"${cmd}"`);
    const inDiagnostic = diagnosticExtensionContent.includes(`'${cmd}'`) || diagnosticExtensionContent.includes(`"${cmd}"`);
    
    let status = '';
    if (inMain) {
        registeredInMain++;
        status = '✅ Main Extension';
    } else if (inDiagnostic) {
        registeredInDiagnostic++;
        status = '✅ Diagnostic Extension';
    } else {
        notRegistered++;
        status = '❌ Not Registered';
        missingCommands.push(cmd);
    }
    
    console.log(`${cmd}: ${status}`);
});

console.log('\n📊 REGISTRATION SUMMARY:');
console.log('========================');
console.log(`Total commands declared: ${declaredCommands.length}`);
console.log(`Registered in main extension: ${registeredInMain}`);
console.log(`Registered in diagnostic extension: ${registeredInDiagnostic}`);
console.log(`Total registered: ${registeredInMain + registeredInDiagnostic}`);
console.log(`Not registered: ${notRegistered}`);

const totalRegistered = registeredInMain + registeredInDiagnostic;
const registrationRate = (totalRegistered / declaredCommands.length) * 100;

console.log(`\nRegistration rate: ${registrationRate.toFixed(1)}%`);
console.log(`100% functionality claim: ${registrationRate === 100 ? '✅ VERIFIED' : '❌ FALSE'}`);

if (missingCommands.length > 0) {
    console.log('\n❌ STILL MISSING COMMANDS:');
    missingCommands.forEach((cmd, i) => {
        console.log(`${i + 1}. ${cmd}`);
    });
} else {
    console.log('\n✅ ALL COMMANDS ARE REGISTERED!');
}

// Check our specific Phase 1 additions
console.log('\n🔍 PHASE 1 SPECIFIC ADDITIONS VERIFICATION:');
console.log('==========================================');

const phase1Additions = [
    'flowcode.showPerformanceReport',
    'flowcode.optimizeMemory', 
    'flowcode.showWelcomeGuide',
    'flowcode.configureTelemetry',
    'flowcode.provideFeedback',
    'flowcode.showMonitoringDashboard',
    'flowcode.runChatDiagnostics'
];

let phase1Success = 0;

phase1Additions.forEach(cmd => {
    const isDeclared = declaredCommands.includes(cmd);
    const isRegistered = extensionContent.includes(`'${cmd}'`) || extensionContent.includes(`"${cmd}"`);
    
    console.log(`${cmd}:`);
    console.log(`  📋 Declared: ${isDeclared ? '✅' : '❌'}`);
    console.log(`  🔧 Registered: ${isRegistered ? '✅' : '❌'}`);
    
    if (isDeclared && isRegistered) phase1Success++;
});

console.log(`\nPhase 1 additions success rate: ${(phase1Success / phase1Additions.length * 100).toFixed(1)}%`);

// FINAL VERDICT
console.log('\n🎯 CORRECTED PHASE 1 AUDIT VERDICT:');
console.log('===================================');

if (registrationRate === 100) {
    console.log('✅ PHASE 1 CLAIMS VERIFIED');
    console.log('All commands are properly registered across both extensions.');
    console.log('The "100% command functionality" claim is ACCURATE.');
} else {
    console.log('⚠️ PHASE 1 CLAIMS PARTIALLY VERIFIED');
    console.log(`Registration rate is ${registrationRate.toFixed(1)}%, not 100%.`);
    console.log('Some commands may still be missing registration.');
}

console.log(`\nPhase 1 specific work: ${phase1Success}/${phase1Additions.length} commands successfully added`);

process.exit(registrationRate < 100 ? 1 : 0);
