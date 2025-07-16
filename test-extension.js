// Simple test to verify VS Code extension basics work
const vscode = require('vscode');

function activate(context) {
    console.log('🧪 TEST: Extension activated!');
    
    // Register a simple test command
    let disposable = vscode.commands.registerCommand('test.hello', function () {
        vscode.window.showInformationMessage('Hello from Test Extension!');
    });

    context.subscriptions.push(disposable);
    console.log('🧪 TEST: Command registered successfully!');
}

function deactivate() {
    console.log('🧪 TEST: Extension deactivated!');
}

module.exports = {
    activate,
    deactivate
};
