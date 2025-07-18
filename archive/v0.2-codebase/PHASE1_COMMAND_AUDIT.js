#!/usr/bin/env node

/**
 * PHASE 1 COMMAND SYSTEM AUDIT
 * Systematic verification of all Phase 1 claims and implementations
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 PHASE 1 COMMAND SYSTEM AUDIT');
console.log('===============================\n');

// Read source files
const packagePath = path.join(__dirname, 'package.json');
const extensionPath = path.join(__dirname, 'src', 'extension.ts');
const flowcodeExtensionPath = path.join(__dirname, 'src', 'flowcode-extension.ts');

const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
const extensionContent = fs.readFileSync(extensionPath, 'utf8');
const flowcodeExtensionContent = fs.readFileSync(flowcodeExtensionPath, 'utf8');

// Extract declared commands from package.json
const declaredCommands = packageJson.contributes.commands.map(cmd => cmd.command);

console.log('📋 PHASE 1 CLAIMS VERIFICATION');
console.log('==============================\n');

// CLAIM 1: "Fixed 11 missing command registrations"
console.log('🔍 CLAIM 1: Fixed missing command registrations');
console.log('-----------------------------------------------');

const commandsWeClaimedToAdd = [
    'flowcode.showPerformanceReport',
    'flowcode.optimizeMemory', 
    'flowcode.showWelcomeGuide',
    'flowcode.configureTelemetry',
    'flowcode.provideFeedback',
    'flowcode.showMonitoringDashboard',
    'flowcode.runChatDiagnostics'
];

let registrationIssues = [];

commandsWeClaimedToAdd.forEach(cmd => {
    const isDeclared = declaredCommands.includes(cmd);
    const isRegistered = extensionContent.includes(`'${cmd}'`) || extensionContent.includes(`"${cmd}"`);
    
    console.log(`${cmd}:`);
    console.log(`  📋 Declared in package.json: ${isDeclared ? '✅' : '❌'}`);
    console.log(`  🔧 Registered in extension.ts: ${isRegistered ? '✅' : '❌'}`);
    
    if (!isDeclared) registrationIssues.push(`${cmd} not declared in package.json`);
    if (!isRegistered) registrationIssues.push(`${cmd} not registered in extension.ts`);
    console.log('');
});

// CLAIM 2: "Implemented 6 missing methods"
console.log('🔍 CLAIM 2: Implemented missing methods');
console.log('--------------------------------------');

const methodsWeClaimedToImplement = [
    'showPerformanceReport',
    'optimizeMemory',
    'showWelcomeGuide', 
    'configureTelemetry',
    'provideFeedback',
    'runChatDiagnostics'
];

let methodIssues = [];

methodsWeClaimedToImplement.forEach(method => {
    const methodPattern = new RegExp(`public\\s+async\\s+${method}\\s*\\(`);
    const isImplemented = methodPattern.test(flowcodeExtensionContent);
    
    console.log(`${method}():`);
    console.log(`  🔧 Implemented in FlowCodeExtension: ${isImplemented ? '✅' : '❌'}`);
    
    if (!isImplemented) {
        methodIssues.push(`${method}() method not found in FlowCodeExtension`);
    } else {
        // Check if method has real implementation (not just placeholder)
        const methodStart = flowcodeExtensionContent.search(methodPattern);
        if (methodStart !== -1) {
            const methodEnd = flowcodeExtensionContent.indexOf('\n    }', methodStart);
            const methodBody = flowcodeExtensionContent.substring(methodStart, methodEnd);
            
            const hasRealImplementation = methodBody.length > 200 && // Substantial implementation
                                        !methodBody.includes('TODO') && 
                                        !methodBody.includes('placeholder') &&
                                        methodBody.includes('try') && // Has error handling
                                        methodBody.includes('catch');
            
            console.log(`  💡 Has substantial implementation: ${hasRealImplementation ? '✅' : '❌'}`);
            
            if (!hasRealImplementation) {
                methodIssues.push(`${method}() appears to be placeholder or incomplete`);
            }
        }
    }
    console.log('');
});

// CLAIM 3: "Enhanced error handling and validation"
console.log('🔍 CLAIM 3: Enhanced error handling');
console.log('----------------------------------');

const errorHandlingChecks = {
    'safeRegisterCommand enhancement': /const safeRegisterCommand.*=.*\(commandId.*handler.*\).*=>.*{[\s\S]*?typeof handler.*!==.*function[\s\S]*?}/,
    'Command execution wrapping': /const wrappedHandler.*=.*async.*\(.*args.*\).*=>.*{[\s\S]*?try[\s\S]*?catch/,
    'User-visible error messages': /vscode\.window\.showErrorMessage/,
    'Critical command validation': /criticalCommands.*=.*\[.*flowcode\./,
    'Registration summary reporting': /Successfully registered.*commands/
};

let errorHandlingIssues = [];

Object.entries(errorHandlingChecks).forEach(([check, pattern]) => {
    const found = pattern.test(extensionContent);
    console.log(`${check}: ${found ? '✅' : '❌'}`);
    
    if (!found) {
        errorHandlingIssues.push(`Missing: ${check}`);
    }
});

// CLAIM 4: "100% command functionality"
console.log('\n🔍 CLAIM 4: 100% command functionality');
console.log('------------------------------------');

const totalDeclared = declaredCommands.length;
const registeredCount = declaredCommands.filter(cmd => 
    extensionContent.includes(`'${cmd}'`) || extensionContent.includes(`"${cmd}"`)
).length;

const functionalityScore = (registeredCount / totalDeclared) * 100;

console.log(`Total commands declared: ${totalDeclared}`);
console.log(`Commands registered: ${registeredCount}`);
console.log(`Registration rate: ${functionalityScore.toFixed(1)}%`);
console.log(`100% functionality claim: ${functionalityScore === 100 ? '✅ VERIFIED' : '❌ FALSE'}`);

// COMPILATION CHECK
console.log('\n🔍 COMPILATION VERIFICATION');
console.log('---------------------------');

try {
    const outPath = path.join(__dirname, 'out');
    const hasCompiledOutput = fs.existsSync(outPath) && fs.existsSync(path.join(outPath, 'extension.js'));
    console.log(`Extension compiles successfully: ${hasCompiledOutput ? '✅' : '❌'}`);
    
    if (!hasCompiledOutput) {
        registrationIssues.push('Extension does not compile - no output files found');
    }
} catch (error) {
    console.log(`Compilation check failed: ❌`);
    registrationIssues.push(`Compilation verification failed: ${error.message}`);
}

// SUMMARY
console.log('\n📊 PHASE 1 AUDIT SUMMARY');
console.log('========================');

const totalIssues = registrationIssues.length + methodIssues.length + errorHandlingIssues.length;

console.log(`Registration Issues: ${registrationIssues.length}`);
console.log(`Method Implementation Issues: ${methodIssues.length}`);
console.log(`Error Handling Issues: ${errorHandlingIssues.length}`);
console.log(`Total Issues Found: ${totalIssues}`);

if (totalIssues === 0) {
    console.log('\n✅ PHASE 1 CLAIMS VERIFIED');
    console.log('All Phase 1 claims appear to be accurate.');
} else {
    console.log('\n❌ PHASE 1 CLAIMS HAVE ISSUES');
    console.log('The following issues were found:');
    
    if (registrationIssues.length > 0) {
        console.log('\n🔧 REGISTRATION ISSUES:');
        registrationIssues.forEach((issue, i) => console.log(`${i + 1}. ${issue}`));
    }
    
    if (methodIssues.length > 0) {
        console.log('\n💡 METHOD IMPLEMENTATION ISSUES:');
        methodIssues.forEach((issue, i) => console.log(`${i + 1}. ${issue}`));
    }
    
    if (errorHandlingIssues.length > 0) {
        console.log('\n⚠️ ERROR HANDLING ISSUES:');
        errorHandlingIssues.forEach((issue, i) => console.log(`${i + 1}. ${issue}`));
    }
}

console.log('\n🎯 RECOMMENDATIONS');
console.log('==================');

if (totalIssues === 0) {
    console.log('✅ Phase 1 work appears solid. Proceed to Phase 2 audit.');
} else {
    console.log('❌ Phase 1 needs remediation before proceeding:');
    console.log('1. Fix all registration issues');
    console.log('2. Complete method implementations');
    console.log('3. Enhance error handling');
    console.log('4. Verify compilation and runtime functionality');
}

process.exit(totalIssues > 0 ? 1 : 0);
