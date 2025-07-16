// Debug script to check VS Code's Node.js version
const vscode = require('vscode');

function activate(context) {
    console.log('🔍 VS Code Node.js Environment Debug:');
    console.log('Node.js version:', process.version);
    console.log('Node.js versions:', process.versions);
    console.log('Platform:', process.platform);
    console.log('Architecture:', process.arch);
    console.log('Module version:', process.versions.modules);
    
    vscode.window.showInformationMessage(
        `VS Code Node.js: ${process.version} (MODULE_VERSION: ${process.versions.modules})`
    );
}

function deactivate() {}

module.exports = { activate, deactivate };
