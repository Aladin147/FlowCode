import * as vscode from 'vscode';
import { FlowCodeExtension } from './flowcode-extension';

let flowCodeExtension: FlowCodeExtension;

export function activate(context: vscode.ExtensionContext) {
    console.log('FlowCode extension is now active!');
    
    flowCodeExtension = new FlowCodeExtension(context);
    
    // Register commands
    const commands = [
        vscode.commands.registerCommand('flowcode.initialize', () => 
            flowCodeExtension.initialize()),
        vscode.commands.registerCommand('flowcode.elevateToArchitect', () => 
            flowCodeExtension.elevateToArchitect()),
        vscode.commands.registerCommand('flowcode.hotfix', () => 
            flowCodeExtension.createHotfix()),
        vscode.commands.registerCommand('flowcode.showGraph', () => 
            flowCodeExtension.showCodeGraph()),
        vscode.commands.registerCommand('flowcode.configureApiKey', () => 
            flowCodeExtension.configureApiKey())
    ];
    
    commands.forEach(command => context.subscriptions.push(command));
    
    // Initialize FlowCode
    flowCodeExtension.activate();
}

export function deactivate() {
    if (flowCodeExtension) {
        flowCodeExtension.deactivate();
    }
}