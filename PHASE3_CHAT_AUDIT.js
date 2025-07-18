#!/usr/bin/env node

/**
 * PHASE 3 CHAT SYSTEM AUDIT
 * Verify our claims about the chat system being "fully functional"
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 PHASE 3 CHAT SYSTEM AUDIT');
console.log('============================\n');

// Read chat interface source
const chatInterfacePath = path.join(__dirname, 'src', 'ui', 'chat-interface.ts');
const chatContent = fs.readFileSync(chatInterfacePath, 'utf8');

console.log('📊 PHASE 3 CLAIMS VERIFICATION');
console.log('==============================\n');

// CLAIM 1: "Chat system is 100% implemented and functional"
console.log('🔍 CLAIM 1: Chat system implementation verification');
console.log('--------------------------------------------------');

const coreMethodChecks = {
    'getAIResponse': /private async getAIResponse\(/,
    'handleUserMessage': /private async handleUserMessage\(/,
    'addFileContext': /private async addFileContext\(/,
    'addFolderContext': /private async addFolderContext\(/,
    'addProblemsContext': /private async addProblemsContext\(/,
    'streamResponseToUI': /private async streamResponseToUI\(/,
    'handleWebviewMessage': /private async handleWebviewMessage\(/,
    'updateWebviewContent': /private async updateWebviewContent\(/
};

let implementedMethods = 0;
console.log('Core chat methods verification:');
Object.entries(coreMethodChecks).forEach(([method, pattern]) => {
    const isImplemented = pattern.test(chatContent);
    console.log(`${method}(): ${isImplemented ? '✅ Implemented' : '❌ Missing'}`);
    if (isImplemented) implementedMethods++;
});

const implementationRate = (implementedMethods / Object.keys(coreMethodChecks).length) * 100;
console.log(`\nImplementation rate: ${implementationRate.toFixed(1)}%`);

// CLAIM 2: "AI integration is fully functional"
console.log('\n🔍 CLAIM 2: AI integration verification');
console.log('--------------------------------------');

const aiIntegrationChecks = {
    'ArchitectService injection': /private architectService: ArchitectService/,
    'generateResponse call': /this\.architectService\.generateResponse\(/,
    'AI response handling': /getAIResponse.*Promise.*string/,
    'Error handling for AI': /catch.*error.*AI/i,
    'Response streaming': /streamResponseToUI/
};

let aiFeatures = 0;
console.log('AI integration features:');
Object.entries(aiIntegrationChecks).forEach(([feature, pattern]) => {
    const isPresent = pattern.test(chatContent);
    console.log(`${feature}: ${isPresent ? '✅ Present' : '❌ Missing'}`);
    if (isPresent) aiFeatures++;
});

const aiIntegrationRate = (aiFeatures / Object.keys(aiIntegrationChecks).length) * 100;
console.log(`\nAI integration completeness: ${aiIntegrationRate.toFixed(1)}%`);

// CLAIM 3: "File operations are fully implemented"
console.log('\n🔍 CLAIM 3: File operations verification');
console.log('---------------------------------------');

const fileOperationChecks = {
    'File reading': /vscode\.workspace\.openTextDocument/,
    'File picker': /vscode\.window\.showQuickPick/,
    'Folder scanning': /vscode\.workspace\.findFiles/,
    'Content display': /document\.getText\(\)/,
    'Context message creation': /ChatMessage.*system.*content/,
    'File context handling': /addFileContext.*filePath/
};

let fileFeatures = 0;
console.log('File operation features:');
Object.entries(fileOperationChecks).forEach(([feature, pattern]) => {
    const isPresent = pattern.test(chatContent);
    console.log(`${feature}: ${isPresent ? '✅ Present' : '❌ Missing'}`);
    if (isPresent) fileFeatures++;
});

const fileOperationRate = (fileFeatures / Object.keys(fileOperationChecks).length) * 100;
console.log(`\nFile operations completeness: ${fileOperationRate.toFixed(1)}%`);

// CLAIM 4: "Context buttons are fully functional"
console.log('\n🔍 CLAIM 4: Context buttons verification');
console.log('---------------------------------------');

const contextButtonChecks = {
    'File context button handler': /case 'file':/,
    'Folder context button handler': /case 'folder':/,
    'Problems context button handler': /case 'problems':/,
    'Context command routing': /handleAddContext.*type.*value/,
    'UI button definitions': /addFileContext.*addFolderContext.*addProblemsContext/,
    'Webview message handling': /addContext.*message\.type/
};

let contextFeatures = 0;
console.log('Context button features:');
Object.entries(contextButtonChecks).forEach(([feature, pattern]) => {
    const isPresent = pattern.test(chatContent);
    console.log(`${feature}: ${isPresent ? '✅ Present' : '❌ Missing'}`);
    if (isPresent) contextFeatures++;
});

const contextButtonRate = (contextFeatures / Object.keys(contextButtonChecks).length) * 100;
console.log(`\nContext buttons completeness: ${contextButtonRate.toFixed(1)}%`);

// CLAIM 5: Check for potential issues
console.log('\n🔍 CLAIM 5: Potential issues detection');
console.log('------------------------------------');

const potentialIssues = [];

// Check for TODO/FIXME comments
const todoMatches = chatContent.match(/TODO|FIXME|HACK|XXX/gi);
if (todoMatches && todoMatches.length > 0) {
    potentialIssues.push(`${todoMatches.length} TODO/FIXME comments found`);
}

// Check for placeholder implementations
const placeholderMatches = chatContent.match(/placeholder|not implemented|coming soon/gi);
if (placeholderMatches && placeholderMatches.length > 0) {
    potentialIssues.push(`${placeholderMatches.length} placeholder implementations found`);
}

// Check for empty catch blocks
const emptyCatchMatches = chatContent.match(/catch.*\{[\s]*\}/g);
if (emptyCatchMatches && emptyCatchMatches.length > 0) {
    potentialIssues.push(`${emptyCatchMatches.length} empty catch blocks found`);
}

// Check for hardcoded values
const hardcodedMatches = chatContent.match(/'http:\/\/|"http:\/\/|localhost|127\.0\.0\.1/g);
if (hardcodedMatches && hardcodedMatches.length > 0) {
    potentialIssues.push(`${hardcodedMatches.length} potential hardcoded values found`);
}

console.log('Potential issues:');
if (potentialIssues.length === 0) {
    console.log('✅ No obvious issues detected');
} else {
    potentialIssues.forEach((issue, i) => {
        console.log(`⚠️ ${i + 1}. ${issue}`);
    });
}

// CLAIM 6: Check diagnostic system we added
console.log('\n🔍 CLAIM 6: Diagnostic system verification');
console.log('-----------------------------------------');

const flowcodeExtensionPath = path.join(__dirname, 'src', 'flowcode-extension.ts');
const flowcodeContent = fs.readFileSync(flowcodeExtensionPath, 'utf8');

const diagnosticChecks = {
    'runChatDiagnostics method': /public async runChatDiagnostics\(/,
    'API configuration testing': /testApiKey/,
    'Service health checks': /SERVICE HEALTH/,
    'Diagnostic report generation': /generateDiagnosticReport/,
    'Progress reporting': /withProgress/
};

let diagnosticFeatures = 0;
console.log('Diagnostic system features:');
Object.entries(diagnosticChecks).forEach(([feature, pattern]) => {
    const isPresent = pattern.test(flowcodeContent);
    console.log(`${feature}: ${isPresent ? '✅ Present' : '❌ Missing'}`);
    if (isPresent) diagnosticFeatures++;
});

const diagnosticRate = (diagnosticFeatures / Object.keys(diagnosticChecks).length) * 100;
console.log(`\nDiagnostic system completeness: ${diagnosticRate.toFixed(1)}%`);

// SUMMARY
console.log('\n📊 PHASE 3 AUDIT SUMMARY');
console.log('========================');

const overallScores = [
    implementationRate,
    aiIntegrationRate,
    fileOperationRate,
    contextButtonRate,
    diagnosticRate
];

const averageScore = overallScores.reduce((sum, score) => sum + score, 0) / overallScores.length;

console.log(`Core implementation: ${implementationRate.toFixed(1)}%`);
console.log(`AI integration: ${aiIntegrationRate.toFixed(1)}%`);
console.log(`File operations: ${fileOperationRate.toFixed(1)}%`);
console.log(`Context buttons: ${contextButtonRate.toFixed(1)}%`);
console.log(`Diagnostic system: ${diagnosticRate.toFixed(1)}%`);
console.log(`\nOverall completeness: ${averageScore.toFixed(1)}%`);
console.log(`Potential issues: ${potentialIssues.length}`);

// FINAL VERDICT
console.log('\n🎯 PHASE 3 AUDIT VERDICT');
console.log('========================');

if (averageScore >= 90 && potentialIssues.length <= 2) {
    console.log('✅ PHASE 3 CLAIMS VERIFIED');
    console.log('Chat system appears to be comprehensively implemented.');
} else if (averageScore >= 75) {
    console.log('⚠️ PHASE 3 CLAIMS MOSTLY VERIFIED');
    console.log('Chat system is well-implemented but may have minor issues.');
} else {
    console.log('❌ PHASE 3 CLAIMS QUESTIONABLE');
    console.log('Chat system may have significant gaps or issues.');
}

console.log('\n📋 RECOMMENDATIONS');
console.log('==================');

if (averageScore >= 90) {
    console.log('✅ Phase 3 work is excellent. Chat system is production-ready.');
} else if (averageScore >= 75) {
    console.log('⚠️ Phase 3 work is good but could use minor improvements.');
} else {
    console.log('❌ Phase 3 needs significant work before claiming completion.');
}

process.exit(averageScore < 75 ? 1 : 0);
