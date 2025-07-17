import * as vscode from 'vscode';
import { FlowCodeExtension } from './flowcode-extension';

let flowCodeExtension: FlowCodeExtension;

export async function activate(context: vscode.ExtensionContext) {
    console.log('🚀 FlowCode extension activation started!');

    try {
        flowCodeExtension = new FlowCodeExtension(context);
        console.log('✅ FlowCodeExtension instance created');

        // Activate the extension
        await flowCodeExtension.activate();
        console.log('✅ FlowCodeExtension activated successfully');
    } catch (error) {
        console.error('❌ FlowCodeExtension activation failed:', error);
        vscode.window.showErrorMessage(`FlowCode activation failed: ${error}`);
    }
    
    // Register commands
    console.log('📝 Registering FlowCode commands...');
    const commands = [
        // Simple test command that always works
        vscode.commands.registerCommand('flowcode.test', () => {
            console.log('🧪 Test command executed!');
            vscode.window.showInformationMessage('FlowCode is working! 🚀');
        }),

        vscode.commands.registerCommand('flowcode.initialize', () =>
            flowCodeExtension.initialize()),
        vscode.commands.registerCommand('flowcode.elevateToArchitect', () =>
            flowCodeExtension.elevateToArchitect()),
        vscode.commands.registerCommand('flowcode.hotfix', () =>
            flowCodeExtension.createHotfix()),
        vscode.commands.registerCommand('flowcode.createHotfix', () =>
            flowCodeExtension.createHotfix()),
        vscode.commands.registerCommand('flowcode.showGraph', () =>
            flowCodeExtension.showCodeGraph()),
        vscode.commands.registerCommand('flowcode.showDependencyGraph', () =>
            flowCodeExtension.showCodeGraph()),
        vscode.commands.registerCommand('flowcode.configureApiKey', () =>
            flowCodeExtension.configureApiKey()),
        vscode.commands.registerCommand('flowcode.clearApiCredentials', () =>
            flowCodeExtension.clearApiCredentials()),
        vscode.commands.registerCommand('flowcode.checkDependencies', () =>
            flowCodeExtension.checkDependencyStatus()),
        vscode.commands.registerCommand('flowcode.installTool', () =>
            flowCodeExtension.installTool()),
        vscode.commands.registerCommand('flowcode.runSecurityAudit', () =>
            flowCodeExtension.runSecurityAudit()),
        vscode.commands.registerCommand('flowcode.showStatus', () =>
            flowCodeExtension.showStatusDashboard()),
        vscode.commands.registerCommand('flowcode.showHelp', () =>
            flowCodeExtension.showHelp()),
        vscode.commands.registerCommand('flowcode.showContextualHelp', () =>
            flowCodeExtension.showContextualHelp()),
        vscode.commands.registerCommand('flowcode.showHealthStatus', () =>
            flowCodeExtension.showHealthStatus()),
        vscode.commands.registerCommand('flowcode.runHealthCheck', () =>
            flowCodeExtension.runHealthCheck()),
        vscode.commands.registerCommand('flowcode.generateCode', () =>
            flowCodeExtension.generateCode()),
        vscode.commands.registerCommand('flowcode.showChat', () =>
            flowCodeExtension.showChat()),
        vscode.commands.registerCommand('flowcode.toggleSmartAutocomplete', () =>
            flowCodeExtension.toggleSmartAutocomplete()),

        // Missing Quick Actions commands
        vscode.commands.registerCommand('flowcode.analyzeCode', () =>
            flowCodeExtension.analyzeCode()),
        vscode.commands.registerCommand('flowcode.openSettings', () =>
            flowCodeExtension.showSettings()),
        vscode.commands.registerCommand('flowcode.showQuickActions', () =>
            flowCodeExtension.showQuickActions()),

        // Debug and diagnostics commands
        vscode.commands.registerCommand('flowcode.debugContext', () =>
            flowCodeExtension.debugContextSystem()),

        // Force show chat without activation check
        vscode.commands.registerCommand('flowcode.forceShowChat', async () => {
            try {
                await flowCodeExtension.showChatInterface();
                vscode.window.showInformationMessage('Chat interface opened!');
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to open chat: ${error}`);
            }
        }),

        // Open specific chat session
        vscode.commands.registerCommand('flowcode.openChatSession', (sessionId: string) =>
            flowCodeExtension.openChatSession(sessionId)),

        // Show settings panel
        vscode.commands.registerCommand('flowcode.showSettings', () =>
            flowCodeExtension.showSettings()),

        // Show workspace selection panel
        vscode.commands.registerCommand('flowcode.selectWorkspace', () =>
            flowCodeExtension.showWorkspaceSelection()),

        // Test TaskPlanningEngine
        vscode.commands.registerCommand('flowcode.testTaskPlanning', () =>
            flowCodeExtension.testTaskPlanningEngine()),

        // Test Week 2 Implementation
        vscode.commands.registerCommand('flowcode.testWeek2', () =>
            flowCodeExtension.testWeek2Implementation()),

        // Agentic execution commands
        vscode.commands.registerCommand('flowcode.executeGoal', () =>
            flowCodeExtension.executeGoalAutonomously()),

        vscode.commands.registerCommand('flowcode.showAgentStatus', () =>
            flowCodeExtension.showAgentStatus()),

        vscode.commands.registerCommand('flowcode.pauseExecution', () =>
            flowCodeExtension.agenticOrchestrator?.pauseExecution()),

        vscode.commands.registerCommand('flowcode.cancelExecution', () =>
            flowCodeExtension.agenticOrchestrator?.cancelExecution()),

        // Demonstrate complete workflow
        vscode.commands.registerCommand('flowcode.demonstrateWorkflow', () =>
            flowCodeExtension.demonstrateAgenticWorkflow()),

        // Run integration test
        vscode.commands.registerCommand('flowcode.runIntegrationTest', () =>
            flowCodeExtension.runIntegrationTest())
    ];
    
    commands.forEach(command => context.subscriptions.push(command));
    console.log(`✅ Registered ${commands.length} FlowCode commands successfully!`);
}

export function deactivate() {
    if (flowCodeExtension) {
        flowCodeExtension.deactivate();
    }
}