#!/usr/bin/env node

/**
 * Find which commands are declared but not registered
 */

const fs = require('fs');
const path = require('path');

const packagePath = path.join(__dirname, 'package.json');
const extensionPath = path.join(__dirname, 'src', 'extension.ts');

const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
const extensionContent = fs.readFileSync(extensionPath, 'utf8');

const declaredCommands = packageJson.contributes.commands.map(cmd => cmd.command);

console.log('🔍 MISSING COMMAND ANALYSIS');
console.log('===========================\n');

const missingCommands = [];
const registeredCommands = [];

declaredCommands.forEach(cmd => {
    const isRegistered = extensionContent.includes(`'${cmd}'`) || extensionContent.includes(`"${cmd}"`);
    
    if (isRegistered) {
        registeredCommands.push(cmd);
    } else {
        missingCommands.push(cmd);
    }
});

console.log(`📊 SUMMARY:`);
console.log(`Total declared: ${declaredCommands.length}`);
console.log(`Registered: ${registeredCommands.length}`);
console.log(`Missing: ${missingCommands.length}`);

if (missingCommands.length > 0) {
    console.log('\n❌ MISSING COMMANDS:');
    missingCommands.forEach((cmd, i) => {
        console.log(`${i + 1}. ${cmd}`);
    });
    
    console.log('\n🔍 ANALYSIS:');
    
    // Check if these are diagnostic commands
    const diagnosticCommands = missingCommands.filter(cmd => cmd.includes('diagnostic'));
    if (diagnosticCommands.length > 0) {
        console.log(`Diagnostic commands missing: ${diagnosticCommands.length}`);
        console.log('These might be registered in DiagnosticExtension');
    }
    
    // Check if these are test commands
    const testCommands = missingCommands.filter(cmd => cmd.includes('test'));
    if (testCommands.length > 0) {
        console.log(`Test commands missing: ${testCommands.length}`);
        console.log('These might need separate registration');
    }
} else {
    console.log('\n✅ All commands are registered!');
}

console.log('\n📋 ALL DECLARED COMMANDS:');
declaredCommands.forEach((cmd, i) => {
    const isRegistered = registeredCommands.includes(cmd);
    console.log(`${i + 1}. ${cmd} ${isRegistered ? '✅' : '❌'}`);
});
