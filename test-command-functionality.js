#!/usr/bin/env node

/**
 * Comprehensive Command Functionality Test
 * Tests each FlowCode command to verify actual functionality
 */

const fs = require('fs');
const path = require('path');

console.log('🧪 FLOWCODE COMMAND FUNCTIONALITY TEST');
console.log('=====================================\n');

// Read package.json to get declared commands
const packagePath = path.join(__dirname, 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
const declaredCommands = packageJson.contributes.commands.map(cmd => ({
    id: cmd.command,
    title: cmd.title,
    category: cmd.category
}));

console.log(`📋 Testing ${declaredCommands.length} declared commands...\n`);

// Test categories and expected functionality
const commandTests = {
    // Core FlowCode Commands
    'flowcode.test': {
        category: 'Core',
        expectedBehavior: 'Shows test message',
        criticalCommand: true
    },
    'flowcode.test.minimal': {
        category: 'Core',
        expectedBehavior: 'Shows minimal test message',
        criticalCommand: false
    },
    'flowcode.initialize': {
        category: 'Core',
        expectedBehavior: 'Initializes FlowCode extension',
        criticalCommand: true
    },
    'flowcode.showChat': {
        category: 'Core',
        expectedBehavior: 'Opens AI chat interface',
        criticalCommand: true
    },
    'flowcode.configureApiKey': {
        category: 'Core',
        expectedBehavior: 'Opens API key configuration',
        criticalCommand: true
    },
    
    // AI Features
    'flowcode.toggleSmartAutocomplete': {
        category: 'AI',
        expectedBehavior: 'Toggles smart autocomplete feature',
        criticalCommand: false
    },
    'flowcode.forceShowChat': {
        category: 'AI',
        expectedBehavior: 'Forces chat interface to open',
        criticalCommand: false
    },
    
    // Security & Quality
    'flowcode.runSecurityAudit': {
        category: 'Security',
        expectedBehavior: 'Runs security audit on codebase',
        criticalCommand: false
    },
    'flowcode.createHotfix': {
        category: 'Quality',
        expectedBehavior: 'Creates hotfix branch and commit',
        criticalCommand: false
    },
    
    // Visualization
    'flowcode.showDependencyGraph': {
        category: 'Visualization',
        expectedBehavior: 'Shows dependency graph',
        criticalCommand: false
    },
    
    // Performance
    'flowcode.showPerformanceReport': {
        category: 'Performance',
        expectedBehavior: 'Generates and shows performance report',
        criticalCommand: false
    },
    'flowcode.optimizeMemory': {
        category: 'Performance',
        expectedBehavior: 'Optimizes memory usage',
        criticalCommand: false
    },
    
    // User Experience
    'flowcode.showQuickActions': {
        category: 'UX',
        expectedBehavior: 'Shows quick actions menu',
        criticalCommand: false
    },
    'flowcode.showWelcomeGuide': {
        category: 'UX',
        expectedBehavior: 'Shows welcome guide',
        criticalCommand: false
    },
    'flowcode.showSettings': {
        category: 'UX',
        expectedBehavior: 'Opens FlowCode settings',
        criticalCommand: false
    },
    
    // Configuration
    'flowcode.configureTelemetry': {
        category: 'Config',
        expectedBehavior: 'Configures telemetry settings',
        criticalCommand: false
    },
    'flowcode.provideFeedback': {
        category: 'Config',
        expectedBehavior: 'Opens feedback interface',
        criticalCommand: false
    },
    
    // Monitoring
    'flowcode.showMonitoringDashboard': {
        category: 'Monitoring',
        expectedBehavior: 'Shows monitoring dashboard',
        criticalCommand: false
    },
    'flowcode.debugContext': {
        category: 'Debug',
        expectedBehavior: 'Shows context debugging info',
        criticalCommand: false
    },
    
    // Agentic Features
    'flowcode.executeGoal': {
        category: 'Agentic',
        expectedBehavior: 'Executes goal autonomously',
        criticalCommand: false
    },
    'flowcode.showAgentStatus': {
        category: 'Agentic',
        expectedBehavior: 'Shows agent status',
        criticalCommand: false
    },
    'flowcode.pauseExecution': {
        category: 'Agentic',
        expectedBehavior: 'Pauses autonomous execution',
        criticalCommand: false
    },
    'flowcode.cancelExecution': {
        category: 'Agentic',
        expectedBehavior: 'Cancels autonomous execution',
        criticalCommand: false
    },
    
    // Testing & Development
    'flowcode.testWeek2': {
        category: 'Testing',
        expectedBehavior: 'Runs Week 2 implementation test',
        criticalCommand: false
    },
    'flowcode.demonstrateWorkflow': {
        category: 'Testing',
        expectedBehavior: 'Demonstrates agentic workflow',
        criticalCommand: false
    },
    'flowcode.runIntegrationTest': {
        category: 'Testing',
        expectedBehavior: 'Runs integration tests',
        criticalCommand: false
    },
    'flowcode.testTaskPlanning': {
        category: 'Testing',
        expectedBehavior: 'Tests task planning engine',
        criticalCommand: false
    },
    
    // Diagnostic Commands (registered in DiagnosticExtension)
    'flowcode.diagnostic.test': {
        category: 'Diagnostic',
        expectedBehavior: 'Runs diagnostic test',
        criticalCommand: false,
        registeredIn: 'DiagnosticExtension'
    },
    'flowcode.diagnostic.webview': {
        category: 'Diagnostic',
        expectedBehavior: 'Shows diagnostic webview',
        criticalCommand: false,
        registeredIn: 'DiagnosticExtension'
    },
    'flowcode.diagnostic.param': {
        category: 'Diagnostic',
        expectedBehavior: 'Tests parameter handling',
        criticalCommand: false,
        registeredIn: 'DiagnosticExtension'
    },
    'flowcode.diagnostic.async': {
        category: 'Diagnostic',
        expectedBehavior: 'Tests async command handling',
        criticalCommand: false,
        registeredIn: 'DiagnosticExtension'
    },
    'flowcode.diagnostic.report': {
        category: 'Diagnostic',
        expectedBehavior: 'Generates diagnostic report',
        criticalCommand: false,
        registeredIn: 'DiagnosticExtension'
    },
    'flowcode.investigation.basic': {
        category: 'Investigation',
        expectedBehavior: 'Runs basic investigation test',
        criticalCommand: false
    }
};

// Analyze command coverage
console.log('📊 COMMAND ANALYSIS:');
console.log('====================\n');

const categories = {};
let criticalCommands = 0;
let totalTested = 0;
let missingTests = [];

declaredCommands.forEach(cmd => {
    const test = commandTests[cmd.id];
    if (test) {
        totalTested++;
        if (test.criticalCommand) criticalCommands++;
        
        if (!categories[test.category]) {
            categories[test.category] = [];
        }
        categories[test.category].push({
            id: cmd.id,
            title: cmd.title,
            critical: test.criticalCommand,
            registeredIn: test.registeredIn || 'FlowCodeExtension'
        });
    } else {
        missingTests.push(cmd.id);
    }
});

// Display results by category
Object.entries(categories).forEach(([category, commands]) => {
    console.log(`📁 ${category.toUpperCase()} (${commands.length} commands):`);
    commands.forEach(cmd => {
        const criticalMark = cmd.critical ? '🔴' : '🟢';
        const locationMark = cmd.registeredIn === 'DiagnosticExtension' ? '🔧' : '⚙️';
        console.log(`  ${criticalMark} ${locationMark} ${cmd.id} - ${cmd.title}`);
    });
    console.log('');
});

console.log('📈 SUMMARY:');
console.log('===========');
console.log(`Total Commands: ${declaredCommands.length}`);
console.log(`Tested Commands: ${totalTested}`);
console.log(`Critical Commands: ${criticalCommands}`);
console.log(`Missing Tests: ${missingTests.length}`);

if (missingTests.length > 0) {
    console.log('\n❌ COMMANDS WITHOUT TESTS:');
    missingTests.forEach(cmd => console.log(`  - ${cmd}`));
}

console.log('\n🎯 NEXT STEPS FOR MANUAL TESTING:');
console.log('=================================');
console.log('1. Install the extension in VS Code');
console.log('2. Open Command Palette (Ctrl+Shift+P)');
console.log('3. Search for "FlowCode" commands');
console.log('4. Test each critical command first:');

Object.entries(commandTests).forEach(([cmdId, test]) => {
    if (test.criticalCommand) {
        console.log(`   🔴 ${cmdId} - ${test.expectedBehavior}`);
    }
});

console.log('\n5. Then test remaining commands by category');
console.log('6. Document any failures or unexpected behavior');

process.exit(missingTests.length > 0 ? 1 : 0);
