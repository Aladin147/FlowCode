import * as vscode from 'vscode';
import { FlowCodeExtension } from './flowcode-extension';
import { DiagnosticExtension } from './diagnostic-extension';

let flowCodeExtension: FlowCodeExtension;
let diagnosticExtension: DiagnosticExtension;

export async function activate(context: vscode.ExtensionContext) {
    console.log('🔍 INVESTIGATION: FlowCode extension activation started!');
    console.log('🔍 INVESTIGATION: VS Code version:', vscode.version);
    console.log('🔍 INVESTIGATION: Extension context exists:', !!context);
    console.log('🔍 INVESTIGATION: Extension path:', context?.extensionPath);
    console.log('🔍 INVESTIGATION: Workspace folders:', vscode.workspace.workspaceFolders?.length || 0);

    // Test 1: Basic VS Code API access
    try {
        console.log('🔍 TEST 1: Testing basic VS Code API access...');
        vscode.window.showInformationMessage('FlowCode Investigation: Basic API access working');
        console.log('✅ TEST 1: Basic VS Code API access - PASSED');
    } catch (error) {
        console.error('❌ TEST 1: Basic VS Code API access - FAILED:', error);
        return;
    }

    // Test 2: Basic command registration
    try {
        console.log('🔍 TEST 2: Testing basic command registration...');

        // Test minimal command that doesn't depend on anything
        const minimalCommand = vscode.commands.registerCommand('flowcode.test.minimal', () => {
            console.log('🧪 MINIMAL TEST: Command executed successfully!');
            vscode.window.showInformationMessage('✅ FlowCode Minimal Test: Command registration working!');
        });
        context.subscriptions.push(minimalCommand);
        console.log('✅ TEST 2A: Minimal command registration - PASSED');

        // Test investigation command
        const investigationCommand = vscode.commands.registerCommand('flowcode.investigation.basic', () => {
            console.log('🔍 INVESTIGATION: Basic test command executed!');
            vscode.window.showInformationMessage('FlowCode Investigation: Basic command working! 🎉');
        });
        context.subscriptions.push(investigationCommand);
        console.log('✅ TEST 2B: Investigation command registration - PASSED');

    } catch (error) {
        console.error('❌ TEST 2: Basic command registration - FAILED:', error);
    }

    // First, try diagnostic mode to test basic functionality
    try {
        console.log('🔍 INVESTIGATION: Creating DiagnosticExtension...');
        diagnosticExtension = new DiagnosticExtension(context);
        console.log('🔍 INVESTIGATION: DiagnosticExtension created, activating...');
        await diagnosticExtension.activate();
        console.log('✅ DiagnosticExtension activated successfully');
    } catch (error) {
        console.error('❌ DiagnosticExtension activation failed:', error);
        vscode.window.showErrorMessage(`FlowCode diagnostic failed: ${error}`);
        return; // Don't proceed if basic functionality is broken
    }

    // Test 3: Try to create FlowCodeExtension (but don't activate yet)
    try {
        console.log('🔍 TEST 3: Testing FlowCodeExtension creation...');
        console.log('🔍 TEST 3: About to call new FlowCodeExtension(context)...');

        const startTime = Date.now();
        flowCodeExtension = new FlowCodeExtension(context);
        const creationTime = Date.now() - startTime;

        console.log(`✅ TEST 3: FlowCodeExtension instance created - PASSED (${creationTime}ms)`);
        console.log('🔍 TEST 3: FlowCodeExtension constructor completed successfully');

    } catch (error) {
        console.error('❌ TEST 3: FlowCodeExtension creation - FAILED:', error);
        console.error('🔍 TEST 3: Error details:', {
            name: error instanceof Error ? error.name : 'Unknown',
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : 'No stack trace'
        });

        vscode.window.showErrorMessage(`FlowCode creation failed: ${error}. Running in diagnostic mode only.`);

        // Continue with diagnostic mode only
        return;
    }

    // Test 4: Try to activate the full extension
    try {
        console.log('🔍 TEST 4: Testing FlowCodeExtension activation...');
        console.log('🔍 TEST 4: About to call flowCodeExtension.activate()...');

        const startTime = Date.now();
        await flowCodeExtension.activate();
        const activationTime = Date.now() - startTime;

        console.log(`✅ TEST 4: FlowCodeExtension activated successfully - PASSED (${activationTime}ms)`);
        console.log('🔍 TEST 4: Full extension activation completed');

        vscode.window.showInformationMessage('🎉 FlowCode fully activated! All systems operational.');

    } catch (error) {
        console.error('❌ TEST 4: FlowCodeExtension activation - FAILED:', error);
        console.error('🔍 TEST 4: Activation error details:', {
            name: error instanceof Error ? error.name : 'Unknown',
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : 'No stack trace'
        });

        vscode.window.showErrorMessage(`FlowCode activation failed: ${error}. Running in diagnostic mode.`);
        // Continue with diagnostic mode only
    }
    
    // Register commands with error handling
    console.log('📝 Registering FlowCode commands...');
    const commands: vscode.Disposable[] = [];

    // Helper function to safely register commands with enhanced error handling
    const safeRegisterCommand = (commandId: string, handler: (...args: any[]) => any) => {
        try {
            // Verify handler exists and is callable
            if (typeof handler !== 'function') {
                throw new Error(`Handler for ${commandId} is not a function (got ${typeof handler})`);
            }

            // Wrap handler to catch runtime errors
            const wrappedHandler = async (...args: any[]) => {
                try {
                    console.log(`🔄 Executing command: ${commandId}`);
                    const result = await handler(...args);
                    console.log(`✅ Command completed: ${commandId}`);
                    return result;
                } catch (error) {
                    console.error(`❌ Command execution failed: ${commandId}`, error);
                    const message = error instanceof Error ? error.message : 'Unknown error';
                    vscode.window.showErrorMessage(`Command "${commandId}" failed: ${message}`);
                    throw error;
                }
            };

            const command = vscode.commands.registerCommand(commandId, wrappedHandler);
            commands.push(command);
            console.log(`✅ Registered command: ${commandId}`);
            return command;
        } catch (error) {
            console.error(`❌ CRITICAL: Failed to register command ${commandId}:`, error);
            vscode.window.showErrorMessage(`Command registration failed: ${commandId} - ${error}`);
            return null;
        }
    };

    // Simple test command that always works
    safeRegisterCommand('flowcode.test', () => {
        console.log('🧪 Test command executed!');
        vscode.window.showInformationMessage('FlowCode is working! 🚀');
    });

    // Register FlowCodeExtension-dependent commands with error handling
    if (flowCodeExtension) {
        safeRegisterCommand('flowcode.initialize', () => flowCodeExtension.initialize());
        safeRegisterCommand('flowcode.elevateToArchitect', () => flowCodeExtension.elevateToArchitect());
        safeRegisterCommand('flowcode.hotfix', () => flowCodeExtension.createHotfix());
        safeRegisterCommand('flowcode.createHotfix', () => flowCodeExtension.createHotfix());
        safeRegisterCommand('flowcode.showGraph', () => flowCodeExtension.showCodeGraph());
        safeRegisterCommand('flowcode.showDependencyGraph', () => flowCodeExtension.showCodeGraph());
        safeRegisterCommand('flowcode.configureApiKey', () => flowCodeExtension.configureApiKey());
        safeRegisterCommand('flowcode.clearApiCredentials', () => flowCodeExtension.clearApiCredentials());
        safeRegisterCommand('flowcode.checkDependencies', () => flowCodeExtension.checkDependencyStatus());
        safeRegisterCommand('flowcode.installTool', () => flowCodeExtension.installTool());
        safeRegisterCommand('flowcode.runSecurityAudit', () => flowCodeExtension.runSecurityAudit());
        safeRegisterCommand('flowcode.showStatus', () => flowCodeExtension.showStatusDashboard());
        safeRegisterCommand('flowcode.showHelp', () => flowCodeExtension.showHelp());
        safeRegisterCommand('flowcode.showContextualHelp', () => flowCodeExtension.showContextualHelp());
        safeRegisterCommand('flowcode.showHealthStatus', () => flowCodeExtension.showHealthStatus());
        safeRegisterCommand('flowcode.runHealthCheck', () => flowCodeExtension.runHealthCheck());
        safeRegisterCommand('flowcode.generateCode', () => flowCodeExtension.generateCode());
        safeRegisterCommand('flowcode.showChat', () => flowCodeExtension.showChat());
        safeRegisterCommand('flowcode.toggleSmartAutocomplete', () => flowCodeExtension.toggleSmartAutocomplete());

        // Additional commands with safe registration
        safeRegisterCommand('flowcode.analyzeCode', () => flowCodeExtension.analyzeCode());
        safeRegisterCommand('flowcode.openSettings', () => flowCodeExtension.showSettings());
        safeRegisterCommand('flowcode.showQuickActions', () => flowCodeExtension.showQuickActions());
        safeRegisterCommand('flowcode.debugContext', () => flowCodeExtension.debugContextSystem());

        safeRegisterCommand('flowcode.forceShowChat', async () => {
            try {
                await flowCodeExtension.showChatInterface();
                vscode.window.showInformationMessage('Chat interface opened!');
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to open chat: ${error}`);
            }
        });

        safeRegisterCommand('flowcode.openChatSession', (sessionId: string) =>
            flowCodeExtension.openChatSession(sessionId));
        safeRegisterCommand('flowcode.showSettings', () => flowCodeExtension.showSettings());
        safeRegisterCommand('flowcode.selectWorkspace', () => flowCodeExtension.showWorkspaceSelection());

        safeRegisterCommand('flowcode.testTaskPlanning', () => flowCodeExtension.testTaskPlanningEngine());
        safeRegisterCommand('flowcode.testWeek2', () => flowCodeExtension.testWeek2Implementation());
        safeRegisterCommand('flowcode.executeGoal', () => flowCodeExtension.executeGoalAutonomously());
        safeRegisterCommand('flowcode.showAgentStatus', () => flowCodeExtension.showAgentStatus());

        safeRegisterCommand('flowcode.pauseExecution', async () => {
            try {
                if (!flowCodeExtension.agenticOrchestrator) {
                    vscode.window.showWarningMessage('No autonomous execution is currently running.');
                    return;
                }
                await flowCodeExtension.agenticOrchestrator.pauseExecution();
                vscode.window.showInformationMessage('Execution paused successfully.');
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Unknown error';
                vscode.window.showErrorMessage(`Failed to pause execution: ${message}`);
            }
        });

        safeRegisterCommand('flowcode.cancelExecution', async () => {
            try {
                if (!flowCodeExtension.agenticOrchestrator) {
                    vscode.window.showWarningMessage('No autonomous execution is currently running.');
                    return;
                }
                await flowCodeExtension.agenticOrchestrator.cancelExecution();
                vscode.window.showInformationMessage('Execution cancelled successfully.');
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Unknown error';
                vscode.window.showErrorMessage(`Failed to cancel execution: ${message}`);
            }
        });

        safeRegisterCommand('flowcode.demonstrateWorkflow', () => flowCodeExtension.demonstrateAgenticWorkflow());
        safeRegisterCommand('flowcode.runIntegrationTest', () => flowCodeExtension.runIntegrationTest());

        // Add missing command registrations
        safeRegisterCommand('flowcode.showPerformanceReport', () => flowCodeExtension.showPerformanceReport());
        safeRegisterCommand('flowcode.optimizeMemory', () => flowCodeExtension.optimizeMemory());
        safeRegisterCommand('flowcode.showWelcomeGuide', () => flowCodeExtension.showWelcomeGuide());
        safeRegisterCommand('flowcode.configureTelemetry', () => flowCodeExtension.configureTelemetry());
        safeRegisterCommand('flowcode.provideFeedback', () => flowCodeExtension.provideFeedback());
        safeRegisterCommand('flowcode.showMonitoringDashboard', () => flowCodeExtension.showMonitoringDashboard());
        safeRegisterCommand('flowcode.runChatDiagnostics', () => flowCodeExtension.runChatDiagnostics());

        // Add all successfully registered commands to subscriptions
        commands.forEach(command => {
            if (command) {
                context.subscriptions.push(command);
            }
        });

        const successfulCommands = commands.filter(cmd => cmd !== null).length;
        const failedCommands = commands.filter(cmd => cmd === null).length;

        console.log(`📊 COMMAND REGISTRATION SUMMARY:`);
        console.log(`✅ Successfully registered: ${successfulCommands} commands`);
        if (failedCommands > 0) {
            console.log(`❌ Failed to register: ${failedCommands} commands`);
            vscode.window.showWarningMessage(
                `FlowCode: ${failedCommands} commands failed to register. Check console for details.`
            );
        }

        // Validate that critical commands are registered
        const criticalCommands = ['flowcode.test', 'flowcode.showChat', 'flowcode.configureApiKey'];
        const missingCritical = criticalCommands.filter(cmdId =>
            !commands.some(cmd => cmd !== null)
        );

        if (missingCritical.length > 0) {
            console.error(`🚨 CRITICAL: Essential commands missing: ${missingCritical.join(', ')}`);
            vscode.window.showErrorMessage(
                `FlowCode: Critical commands failed to register: ${missingCritical.join(', ')}`
            );
        }

        console.log(`🎯 FlowCode command registration completed!`);
    } else {
        console.error('❌ FlowCodeExtension not available - no commands registered');
        vscode.window.showErrorMessage('FlowCode: Extension failed to initialize - no commands available');
    }
}

export function deactivate() {
    if (flowCodeExtension) {
        flowCodeExtension.deactivate();
    }
    if (diagnosticExtension) {
        diagnosticExtension.dispose();
    }
}