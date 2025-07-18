#!/usr/bin/env node

/**
 * Test script to verify command registration status
 * This script analyzes package.json vs extension.ts to identify missing commands
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 COMMAND REGISTRATION ANALYSIS');
console.log('================================\n');

// Read package.json
const packagePath = path.join(__dirname, 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

// Read extension.ts
const extensionPath = path.join(__dirname, 'src', 'extension.ts');
const extensionContent = fs.readFileSync(extensionPath, 'utf8');

// Extract declared commands from package.json
const declaredCommands = packageJson.contributes.commands.map(cmd => cmd.command);
console.log(`📋 DECLARED COMMANDS (${declaredCommands.length}):`);
declaredCommands.forEach((cmd, i) => {
    console.log(`${i + 1}. ${cmd}`);
});

console.log('\n🔍 REGISTRATION ANALYSIS:');
console.log('========================\n');

// Check which commands are registered in extension.ts
const registeredCommands = [];
const missingCommands = [];

declaredCommands.forEach(command => {
    // Check if command is registered in extension.ts
    const isRegistered = extensionContent.includes(`'${command}'`) || 
                        extensionContent.includes(`"${command}"`);
    
    if (isRegistered) {
        registeredCommands.push(command);
        console.log(`✅ ${command} - REGISTERED`);
    } else {
        missingCommands.push(command);
        console.log(`❌ ${command} - MISSING FROM REGISTRATION`);
    }
});

console.log('\n📊 SUMMARY:');
console.log('===========');
console.log(`Total Declared: ${declaredCommands.length}`);
console.log(`Registered: ${registeredCommands.length}`);
console.log(`Missing: ${missingCommands.length}`);

if (missingCommands.length > 0) {
    console.log('\n🚨 MISSING COMMANDS:');
    console.log('===================');
    missingCommands.forEach((cmd, i) => {
        console.log(`${i + 1}. ${cmd}`);
    });
    
    console.log('\n🔧 REQUIRED ACTIONS:');
    console.log('===================');
    console.log('1. Add missing command registrations to extension.ts');
    console.log('2. Implement corresponding methods in FlowCodeExtension class');
    console.log('3. Test each command in Command Palette');
    
    process.exit(1); // Exit with error code
} else {
    console.log('\n✅ All commands are registered!');
    process.exit(0);
}
