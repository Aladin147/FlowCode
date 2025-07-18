#!/usr/bin/env node

/**
 * Chat Functionality Test
 * Tests the actual chat system functionality to identify what's broken
 */

const fs = require('fs');
const path = require('path');

console.log('🧪 CHAT FUNCTIONALITY ANALYSIS');
console.log('==============================\n');

// Read ChatInterface source to analyze implementation
const chatInterfacePath = path.join(__dirname, 'src', 'ui', 'chat-interface.ts');
const chatContent = fs.readFileSync(chatInterfacePath, 'utf8');

console.log('📋 ANALYZING CHAT IMPLEMENTATION...\n');

// Check for key methods
const methods = {
    'getAIResponse': {
        pattern: /private async getAIResponse\(/,
        description: 'AI response generation',
        critical: true
    },
    'streamResponseToUI': {
        pattern: /private async streamResponseToUI\(/,
        description: 'Response streaming to UI',
        critical: true
    },
    'handleUserMessage': {
        pattern: /private async handleUserMessage\(/,
        description: 'User message handling',
        critical: true
    },
    'handleWebviewMessage': {
        pattern: /private async handleWebviewMessage\(/,
        description: 'Webview message handling',
        critical: true
    },
    'updateWebviewContent': {
        pattern: /private async updateWebviewContent\(/,
        description: 'Webview content updates',
        critical: false
    },
    'addFileContext': {
        pattern: /function addFileContext\(\)/,
        description: 'File context addition (UI)',
        critical: false
    },
    'addFolderContext': {
        pattern: /function addFolderContext\(\)/,
        description: 'Folder context addition (UI)',
        critical: false
    }
};

console.log('🔍 METHOD IMPLEMENTATION STATUS:');
console.log('================================\n');

let implementedMethods = 0;
let criticalMethods = 0;
let implementedCritical = 0;

Object.entries(methods).forEach(([methodName, config]) => {
    const isImplemented = config.pattern.test(chatContent);
    const status = isImplemented ? '✅ IMPLEMENTED' : '❌ MISSING';
    const criticalMark = config.critical ? '🔴' : '🟢';
    
    console.log(`${criticalMark} ${status} - ${methodName}: ${config.description}`);
    
    if (isImplemented) implementedMethods++;
    if (config.critical) {
        criticalMethods++;
        if (isImplemented) implementedCritical++;
    }
});

console.log('\n📊 IMPLEMENTATION SUMMARY:');
console.log('==========================');
console.log(`Total Methods: ${Object.keys(methods).length}`);
console.log(`Implemented: ${implementedMethods}`);
console.log(`Critical Methods: ${criticalMethods}`);
console.log(`Critical Implemented: ${implementedCritical}`);

// Check for ArchitectService integration
console.log('\n🤖 AI INTEGRATION ANALYSIS:');
console.log('===========================');

const aiIntegrationChecks = {
    'ArchitectService injection': /private architectService: ArchitectService/,
    'generateResponse call': /this\.architectService\.generateResponse\(/,
    'API configuration': /getApiConfiguration\(\)/,
    'Error handling for AI': /Failed to get AI response/,
    'Security validation': /securityValidator\.validateCodeSuggestion/
};

Object.entries(aiIntegrationChecks).forEach(([check, pattern]) => {
    const found = pattern.test(chatContent);
    const status = found ? '✅ FOUND' : '❌ MISSING';
    console.log(`${status} - ${check}`);
});

// Check for UI functionality
console.log('\n🎨 UI FUNCTIONALITY ANALYSIS:');
console.log('=============================');

const uiChecks = {
    'Message rendering': /renderMessages\(\)/,
    'Input handling': /sendMessage\(\)/,
    'Context buttons': /addFileContext|addFolderContext|addProblemsContext/,
    'Webview creation': /createWebviewPanel/,
    'Message history': /loadMessageHistory|saveMessageHistory/,
    'Streaming indicators': /streaming.*indicator/i
};

Object.entries(uiChecks).forEach(([check, pattern]) => {
    const found = pattern.test(chatContent);
    const status = found ? '✅ FOUND' : '❌ MISSING';
    console.log(`${status} - ${check}`);
});

// Check for context handling
console.log('\n📁 CONTEXT HANDLING ANALYSIS:');
console.log('=============================');

const contextChecks = {
    'File context gathering': /getEnhancedContext/,
    'Active file detection': /activeTextEditor/,
    'Workspace root detection': /workspaceFolders/,
    'Selected text handling': /selectedText/,
    'Context compression': /contextCompressionService/,
    'Context validation': /contextConfidence/
};

Object.entries(contextChecks).forEach(([check, pattern]) => {
    const found = pattern.test(chatContent);
    const status = found ? '✅ FOUND' : '❌ MISSING';
    console.log(`${status} - ${check}`);
});

// Analyze potential issues
console.log('\n🚨 POTENTIAL ISSUES ANALYSIS:');
console.log('=============================');

const issues = [];

// Check for TODO comments
const todoMatches = chatContent.match(/TODO:.*$/gm);
if (todoMatches && todoMatches.length > 0) {
    issues.push(`${todoMatches.length} TODO comments found - incomplete implementation`);
}

// Check for placeholder responses
const placeholderMatches = chatContent.match(/placeholder|TODO|FIXME|NOT IMPLEMENTED/gi);
if (placeholderMatches && placeholderMatches.length > 0) {
    issues.push(`${placeholderMatches.length} placeholder/unimplemented sections found`);
}

// Check for error handling
const errorHandling = chatContent.match(/catch.*error/gi);
if (!errorHandling || errorHandling.length < 5) {
    issues.push('Insufficient error handling - may fail silently');
}

// Check for API key validation
const apiKeyValidation = chatContent.match(/api.*key.*valid|key.*test|authenticate/gi);
if (!apiKeyValidation || apiKeyValidation.length === 0) {
    issues.push('No API key validation - may fail with unclear errors');
}

if (issues.length > 0) {
    console.log('❌ ISSUES FOUND:');
    issues.forEach((issue, i) => {
        console.log(`${i + 1}. ${issue}`);
    });
} else {
    console.log('✅ No obvious implementation issues found');
}

console.log('\n🎯 TESTING RECOMMENDATIONS:');
console.log('===========================');
console.log('1. Test with valid API key configured');
console.log('2. Test with invalid/missing API key');
console.log('3. Test file context buttons functionality');
console.log('4. Test message sending and response generation');
console.log('5. Check browser console for JavaScript errors');
console.log('6. Verify ArchitectService is properly initialized');
console.log('7. Test with different AI providers (OpenAI, Anthropic, DeepSeek)');

console.log('\n📋 MANUAL TEST CHECKLIST:');
console.log('=========================');
console.log('[ ] Open FlowCode chat interface');
console.log('[ ] Send a simple message like "Hello"');
console.log('[ ] Check if AI responds or shows error');
console.log('[ ] Click file context button (📁)');
console.log('[ ] Click folder context button (📂)');
console.log('[ ] Click problems context button (⚠️)');
console.log('[ ] Check VS Code Developer Console for errors');
console.log('[ ] Verify API key is configured in settings');

// Final assessment
const functionalityScore = (implementedMethods / Object.keys(methods).length) * 100;
const criticalScore = (implementedCritical / criticalMethods) * 100;

console.log('\n📈 FUNCTIONALITY ASSESSMENT:');
console.log('============================');
console.log(`Overall Implementation: ${functionalityScore.toFixed(1)}%`);
console.log(`Critical Features: ${criticalScore.toFixed(1)}%`);

if (criticalScore === 100) {
    console.log('✅ All critical features are implemented');
    console.log('🔍 Issue likely in configuration or service initialization');
} else {
    console.log('❌ Critical features missing - implementation incomplete');
}

process.exit(functionalityScore < 80 ? 1 : 0);
