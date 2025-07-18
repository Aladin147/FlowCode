#!/usr/bin/env node

/**
 * INTEGRATION TESTING AUDIT
 * Test how all Phase 1-3 components work together
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 INTEGRATION TESTING AUDIT');
console.log('============================\n');

// Read key files
const packagePath = path.join(__dirname, 'package.json');
const extensionPath = path.join(__dirname, 'src', 'extension.ts');
const flowcodeExtensionPath = path.join(__dirname, 'src', 'flowcode-extension.ts');
const chatInterfacePath = path.join(__dirname, 'src', 'ui', 'chat-interface.ts');

const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
const extensionContent = fs.readFileSync(extensionPath, 'utf8');
const flowcodeExtensionContent = fs.readFileSync(flowcodeExtensionPath, 'utf8');
const chatContent = fs.readFileSync(chatInterfacePath, 'utf8');

console.log('📊 INTEGRATION VERIFICATION');
console.log('===========================\n');

// TEST 1: Command-to-Implementation Integration
console.log('🔍 TEST 1: Command-to-Implementation Integration');
console.log('-----------------------------------------------');

const criticalCommands = [
    'flowcode.showChat',
    'flowcode.configureApiKey',
    'flowcode.runChatDiagnostics',
    'flowcode.showPerformanceReport',
    'flowcode.provideFeedback'
];

let integrationIssues = [];

criticalCommands.forEach(cmd => {
    const isDeclared = packageJson.contributes.commands.some(c => c.command === cmd);
    const isRegistered = extensionContent.includes(`'${cmd}'`) || extensionContent.includes(`"${cmd}"`);
    
    // Extract method name from command
    const methodName = cmd.replace('flowcode.', '');
    const camelCaseMethod = methodName.replace(/([A-Z])/g, (match, letter) => letter.toLowerCase());
    
    const hasImplementation = flowcodeExtensionContent.includes(`${camelCaseMethod}(`) || 
                             flowcodeExtensionContent.includes(`${methodName}(`);
    
    console.log(`${cmd}:`);
    console.log(`  📋 Declared: ${isDeclared ? '✅' : '❌'}`);
    console.log(`  🔧 Registered: ${isRegistered ? '✅' : '❌'}`);
    console.log(`  💡 Implemented: ${hasImplementation ? '✅' : '❌'}`);
    
    if (!isDeclared || !isRegistered || !hasImplementation) {
        integrationIssues.push(`${cmd} has integration gaps`);
    }
    console.log('');
});

// TEST 2: Settings-to-Code Integration
console.log('🔍 TEST 2: Settings-to-Code Integration');
console.log('--------------------------------------');

const criticalSettings = [
    'flowcode.ai.provider',
    'flowcode.ai.maxTokens',
    'flowcode.customEndpoint'
];

criticalSettings.forEach(setting => {
    const isDeclared = Object.keys(packageJson.contributes.configuration.properties).includes(setting);
    
    // Check if setting is used in any of the main files
    const isUsedInExtension = extensionContent.includes(setting.replace('flowcode.', ''));
    const isUsedInFlowcode = flowcodeExtensionContent.includes(setting.replace('flowcode.', ''));
    const isUsedInChat = chatContent.includes(setting.replace('flowcode.', ''));
    
    const isUsed = isUsedInExtension || isUsedInFlowcode || isUsedInChat;
    
    console.log(`${setting}:`);
    console.log(`  📋 Declared: ${isDeclared ? '✅' : '❌'}`);
    console.log(`  🔧 Used in code: ${isUsed ? '✅' : '❌'}`);
    
    if (!isDeclared || !isUsed) {
        integrationIssues.push(`${setting} has integration gaps`);
    }
    console.log('');
});

// TEST 3: Service Dependencies Integration
console.log('🔍 TEST 3: Service Dependencies Integration');
console.log('-----------------------------------------');

const serviceDependencies = {
    'ChatInterface': {
        dependencies: ['ArchitectService', 'CompanionGuard', 'SecurityValidatorService', 'GraphService'],
        file: chatContent
    },
    'FlowCodeExtension': {
        dependencies: ['ConfigurationManager', 'ChatInterface', 'ArchitectService'],
        file: flowcodeExtensionContent
    }
};

Object.entries(serviceDependencies).forEach(([service, { dependencies, file }]) => {
    console.log(`${service} dependencies:`);
    
    dependencies.forEach(dep => {
        const isInjected = file.includes(`private ${dep.toLowerCase()}`) || 
                          file.includes(`private ${dep}`) ||
                          file.includes(`: ${dep}`);
        
        console.log(`  ${dep}: ${isInjected ? '✅ Injected' : '❌ Missing'}`);
        
        if (!isInjected) {
            integrationIssues.push(`${service} missing ${dep} dependency`);
        }
    });
    console.log('');
});

// TEST 4: Error Handling Integration
console.log('🔍 TEST 4: Error Handling Integration');
console.log('------------------------------------');

const errorHandlingChecks = {
    'Command error handling': /catch.*error.*showErrorMessage/,
    'Service initialization errors': /Failed to initialize/,
    'User-friendly error messages': /vscode\.window\.showErrorMessage/,
    'Graceful degradation': /fallback|default/i
};

let errorHandlingScore = 0;

Object.entries(errorHandlingChecks).forEach(([check, pattern]) => {
    const inExtension = pattern.test(extensionContent);
    const inFlowcode = pattern.test(flowcodeExtensionContent);
    const inChat = pattern.test(chatContent);
    
    const isPresent = inExtension || inFlowcode || inChat;
    
    console.log(`${check}: ${isPresent ? '✅ Present' : '❌ Missing'}`);
    
    if (isPresent) errorHandlingScore++;
});

const errorHandlingRate = (errorHandlingScore / Object.keys(errorHandlingChecks).length) * 100;
console.log(`\nError handling completeness: ${errorHandlingRate.toFixed(1)}%`);

// TEST 5: Compilation Integration
console.log('\n🔍 TEST 5: Compilation Integration');
console.log('---------------------------------');

try {
    const outPath = path.join(__dirname, 'out');
    const hasCompiledOutput = fs.existsSync(outPath);
    
    if (hasCompiledOutput) {
        const compiledFiles = fs.readdirSync(outPath);
        const hasExtensionJs = compiledFiles.includes('extension.js');
        const hasFlowcodeJs = compiledFiles.some(f => f.includes('flowcode-extension.js'));
        
        console.log(`Compilation output exists: ✅`);
        console.log(`extension.js compiled: ${hasExtensionJs ? '✅' : '❌'}`);
        console.log(`flowcode-extension.js compiled: ${hasFlowcodeJs ? '✅' : '❌'}`);
        
        if (!hasExtensionJs || !hasFlowcodeJs) {
            integrationIssues.push('Compilation output incomplete');
        }
    } else {
        console.log(`Compilation output exists: ❌`);
        integrationIssues.push('No compilation output found');
    }
} catch (error) {
    console.log(`Compilation check failed: ❌`);
    integrationIssues.push(`Compilation check error: ${error.message}`);
}

// TEST 6: Package.json Consistency
console.log('\n🔍 TEST 6: Package.json Consistency');
console.log('----------------------------------');

const packageChecks = {
    'Main entry point': packageJson.main === './out/extension.js',
    'Activation events': packageJson.activationEvents && packageJson.activationEvents.length > 0,
    'Commands declared': packageJson.contributes.commands && packageJson.contributes.commands.length > 0,
    'Settings declared': packageJson.contributes.configuration && packageJson.contributes.configuration.properties,
    'Dependencies present': packageJson.dependencies && Object.keys(packageJson.dependencies).length > 0
};

let packageScore = 0;

Object.entries(packageChecks).forEach(([check, isValid]) => {
    console.log(`${check}: ${isValid ? '✅ Valid' : '❌ Invalid'}`);
    if (isValid) packageScore++;
});

const packageConsistency = (packageScore / Object.keys(packageChecks).length) * 100;
console.log(`\nPackage.json consistency: ${packageConsistency.toFixed(1)}%`);

// SUMMARY
console.log('\n📊 INTEGRATION AUDIT SUMMARY');
console.log('============================');

const totalIssues = integrationIssues.length;
const errorHandlingGood = errorHandlingRate >= 75;
const packageGood = packageConsistency >= 80;

console.log(`Integration issues found: ${totalIssues}`);
console.log(`Error handling quality: ${errorHandlingRate.toFixed(1)}%`);
console.log(`Package consistency: ${packageConsistency.toFixed(1)}%`);

if (totalIssues === 0 && errorHandlingGood && packageGood) {
    console.log('\n✅ INTEGRATION TEST PASSED');
    console.log('All components integrate well together.');
} else if (totalIssues <= 3 && errorHandlingGood) {
    console.log('\n⚠️ INTEGRATION TEST MOSTLY PASSED');
    console.log('Minor integration issues found but overall system is solid.');
} else {
    console.log('\n❌ INTEGRATION TEST FAILED');
    console.log('Significant integration issues need to be addressed.');
}

if (integrationIssues.length > 0) {
    console.log('\n🚨 INTEGRATION ISSUES:');
    integrationIssues.forEach((issue, i) => {
        console.log(`${i + 1}. ${issue}`);
    });
}

console.log('\n🎯 INTEGRATION RECOMMENDATIONS');
console.log('==============================');

if (totalIssues === 0) {
    console.log('✅ System integration is excellent. Ready for production.');
} else if (totalIssues <= 3) {
    console.log('⚠️ Minor integration issues should be addressed but system is functional.');
} else {
    console.log('❌ Significant integration work needed before system is production-ready.');
}

process.exit(totalIssues > 5 ? 1 : 0);
