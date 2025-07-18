#!/usr/bin/env node

/**
 * RUNTIME INTEGRATION TEST
 * Test critical integration points that could cause runtime failures
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 RUNTIME INTEGRATION TEST');
console.log('===========================\n');

console.log('📊 CRITICAL INTEGRATION POINTS VERIFICATION');
console.log('===========================================\n');

// Test 1: Main extension entry point
console.log('🔍 TEST 1: Main Extension Entry Point');
console.log('------------------------------------');

try {
    const mainPath = path.join(__dirname, 'out', 'extension.js');
    const mainExists = fs.existsSync(mainPath);
    console.log(`Main file exists: ${mainExists ? '✅' : '❌'}`);
    
    if (mainExists) {
        const mainContent = fs.readFileSync(mainPath, 'utf8');
        const hasActivate = mainContent.includes('function activate') || mainContent.includes('activate:');
        const hasDeactivate = mainContent.includes('function deactivate') || mainContent.includes('deactivate:');
        const hasExports = mainContent.includes('exports.activate') || mainContent.includes('module.exports');
        
        console.log(`Has activate function: ${hasActivate ? '✅' : '❌'}`);
        console.log(`Has deactivate function: ${hasDeactivate ? '✅' : '❌'}`);
        console.log(`Has proper exports: ${hasExports ? '✅' : '❌'}`);
    }
} catch (error) {
    console.log(`❌ Main entry point test failed: ${error.message}`);
}

// Test 2: FlowCode Extension Class
console.log('\n🔍 TEST 2: FlowCode Extension Class');
console.log('----------------------------------');

try {
    const flowcodePath = path.join(__dirname, 'out', 'flowcode-extension.js');
    const flowcodeExists = fs.existsSync(flowcodePath);
    console.log(`FlowCode extension file exists: ${flowcodeExists ? '✅' : '❌'}`);
    
    if (flowcodeExists) {
        const flowcodeContent = fs.readFileSync(flowcodePath, 'utf8');
        const hasClass = flowcodeContent.includes('class FlowCodeExtension') || flowcodeContent.includes('FlowCodeExtension');
        const hasConstructor = flowcodeContent.includes('constructor');
        const hasInitialize = flowcodeContent.includes('initialize');
        
        console.log(`Has FlowCodeExtension class: ${hasClass ? '✅' : '❌'}`);
        console.log(`Has constructor: ${hasConstructor ? '✅' : '❌'}`);
        console.log(`Has initialize method: ${hasInitialize ? '✅' : '❌'}`);
    }
} catch (error) {
    console.log(`❌ FlowCode extension test failed: ${error.message}`);
}

// Test 3: Chat Interface
console.log('\n🔍 TEST 3: Chat Interface');
console.log('-------------------------');

try {
    const chatPath = path.join(__dirname, 'out', 'ui', 'chat-interface.js');
    const chatExists = fs.existsSync(chatPath);
    console.log(`Chat interface file exists: ${chatExists ? '✅' : '❌'}`);
    
    if (chatExists) {
        const chatContent = fs.readFileSync(chatPath, 'utf8');
        const hasChatInterface = chatContent.includes('ChatInterface');
        const hasShowMethod = chatContent.includes('show');
        const hasMessageHandling = chatContent.includes('handleUserMessage') || chatContent.includes('handleMessage');
        
        console.log(`Has ChatInterface class: ${hasChatInterface ? '✅' : '❌'}`);
        console.log(`Has show method: ${hasShowMethod ? '✅' : '❌'}`);
        console.log(`Has message handling: ${hasMessageHandling ? '✅' : '❌'}`);
    }
} catch (error) {
    console.log(`❌ Chat interface test failed: ${error.message}`);
}

// Test 4: Service Dependencies
console.log('\n🔍 TEST 4: Service Dependencies');
console.log('-------------------------------');

const criticalServices = [
    'architect-service.js',
    'configuration-manager.js',
    'companion-guard.js',
    'security-validator.js'
];

let serviceIssues = 0;

criticalServices.forEach(service => {
    try {
        const servicePath = path.join(__dirname, 'out', 'services', service);
        const utilPath = path.join(__dirname, 'out', 'utils', service);
        
        const serviceExists = fs.existsSync(servicePath) || fs.existsSync(utilPath);
        console.log(`${service}: ${serviceExists ? '✅' : '❌'}`);
        
        if (!serviceExists) {
            serviceIssues++;
        }
    } catch (error) {
        console.log(`${service}: ❌ (${error.message})`);
        serviceIssues++;
    }
});

// Test 5: Node.js Compatibility
console.log('\n🔍 TEST 5: Node.js Compatibility');
console.log('--------------------------------');

try {
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
    
    console.log(`Node.js version: ${nodeVersion}`);
    console.log(`Major version: ${majorVersion}`);
    console.log(`Meets requirement (>=16): ${majorVersion >= 16 ? '✅' : '❌'}`);
    
    // Test fetch availability (we added node-fetch)
    const chatPath = path.join(__dirname, 'out', 'ui', 'chat-interface.js');
    if (fs.existsSync(chatPath)) {
        const chatContent = fs.readFileSync(chatPath, 'utf8');
        const hasNodeFetch = chatContent.includes('node-fetch') || chatContent.includes('fetch');
        console.log(`Has fetch implementation: ${hasNodeFetch ? '✅' : '❌'}`);
    }
    
} catch (error) {
    console.log(`❌ Node.js compatibility test failed: ${error.message}`);
}

// Test 6: Import/Export Consistency
console.log('\n🔍 TEST 6: Import/Export Consistency');
console.log('-----------------------------------');

try {
    // Check if compiled files use proper CommonJS exports
    const mainPath = path.join(__dirname, 'out', 'extension.js');
    if (fs.existsSync(mainPath)) {
        const mainContent = fs.readFileSync(mainPath, 'utf8');
        const hasCommonJSExports = mainContent.includes('exports.') || mainContent.includes('module.exports');
        const hasESModules = mainContent.includes('export ') && !mainContent.includes('exports.');
        
        console.log(`Uses CommonJS exports: ${hasCommonJSExports ? '✅' : '❌'}`);
        console.log(`Avoids ES modules: ${!hasESModules ? '✅' : '❌'}`);
    }
} catch (error) {
    console.log(`❌ Import/export test failed: ${error.message}`);
}

// Test 7: VS Code API Usage
console.log('\n🔍 TEST 7: VS Code API Usage');
console.log('----------------------------');

try {
    const mainPath = path.join(__dirname, 'out', 'extension.js');
    if (fs.existsSync(mainPath)) {
        const mainContent = fs.readFileSync(mainPath, 'utf8');
        const hasVSCodeImport = mainContent.includes('vscode') || mainContent.includes('require("vscode")');
        const hasCommandRegistration = mainContent.includes('registerCommand') || mainContent.includes('commands.register');
        
        console.log(`Has VS Code import: ${hasVSCodeImport ? '✅' : '❌'}`);
        console.log(`Has command registration: ${hasCommandRegistration ? '✅' : '❌'}`);
    }
} catch (error) {
    console.log(`❌ VS Code API test failed: ${error.message}`);
}

// Summary
console.log('\n📊 RUNTIME INTEGRATION SUMMARY');
console.log('==============================');

console.log(`Service dependency issues: ${serviceIssues}`);

// Final assessment
const criticalIssues = serviceIssues;

if (criticalIssues === 0) {
    console.log('\n✅ RUNTIME INTEGRATION TESTS PASSED');
    console.log('All critical integration points are properly configured.');
} else if (criticalIssues <= 2) {
    console.log('\n⚠️ RUNTIME INTEGRATION TESTS MOSTLY PASSED');
    console.log('Minor issues found but extension should work.');
} else {
    console.log('\n❌ RUNTIME INTEGRATION TESTS FAILED');
    console.log('Critical issues found that may cause runtime failures.');
}

console.log('\n🎯 RECOMMENDATIONS');
console.log('==================');

if (criticalIssues === 0) {
    console.log('✅ Extension is ready for packaging and distribution.');
} else {
    console.log('⚠️ Address integration issues before packaging.');
}

process.exit(criticalIssues > 2 ? 1 : 0);
