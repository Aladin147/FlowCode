import { expect } from 'chai';
import { describe, it, beforeEach, afterEach } from 'mocha';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { ArchitectCommands } from '../../commands/architect-commands';
import { ArchitectService } from '../../services/architect-service';
import { ConfigurationManager } from '../../utils/configuration-manager';
import { TestUtils } from '../TestUtils';

describe('ArchitectCommands', () => {
    let architectCommands: ArchitectCommands;
    let configManager: ConfigurationManager;
    let architectService: ArchitectService;
    let sandbox: sinon.SinonSandbox;
    let mockEditor: any;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        TestUtils.mockVSCodeAPI(sandbox);
        
        configManager = new ConfigurationManager();
        architectCommands = new ArchitectCommands(configManager);
        architectService = (architectCommands as any).architectService;

        // Mock VS Code editor
        mockEditor = {
            document: {
                languageId: 'typescript',
                getText: sandbox.stub().returns('function test() { return "hello"; }'),
                uri: { fsPath: '/test/file.ts' }
            },
            selection: {
                isEmpty: false,
                start: { line: 0, character: 0 },
                end: { line: 0, character: 10 },
                active: { line: 0, character: 0 }
            },
            edit: sandbox.stub().resolves(true)
        };
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('initialize', () => {
        it('should initialize successfully', async () => {
            sandbox.stub(architectService, 'initialize').resolves();
            
            await architectCommands.initialize();
            
            // Should not throw
        });

        it('should handle initialization errors', async () => {
            sandbox.stub(architectService, 'initialize').rejects(new Error('Init failed'));
            
            try {
                await architectCommands.initialize();
                expect.fail('Should have thrown error');
            } catch (error) {
                expect((error as Error).message).to.equal('Init failed');
            }
        });
    });

    describe('elevateToArchitect', () => {
        beforeEach(() => {
            sandbox.stub(vscode.window, 'activeTextEditor').value(mockEditor);
            sandbox.stub(configManager, 'hasValidApiKey').resolves(true);
            sandbox.stub(architectService, 'refactorCode').resolves('function test() {\n  return "hello";\n}');
        });

        it('should show error when no active editor', async () => {
            sandbox.stub(vscode.window, 'activeTextEditor').value(undefined);
            const showErrorStub = sandbox.stub(vscode.window, 'showErrorMessage');
            
            await architectCommands.elevateToArchitect();
            
            expect(showErrorStub.calledWith('No active editor found. Please open a file to refactor.')).to.be.true;
        });

        it('should show error when no API key configured', async () => {
            sandbox.stub(configManager, 'hasValidApiKey').resolves(false);
            const showErrorStub = sandbox.stub(vscode.window, 'showErrorMessage').resolves('Cancel');
            
            await architectCommands.elevateToArchitect();
            
            expect(showErrorStub.calledWith(
                'AI API key not configured. Please configure your API key to use Architect features.',
                'Configure API Key',
                'Cancel'
            )).to.be.true;
        });

        it('should show error when no text selected', async () => {
            mockEditor.document.getText.returns('');
            const showErrorStub = sandbox.stub(vscode.window, 'showErrorMessage');
            
            await architectCommands.elevateToArchitect();
            
            expect(showErrorStub.calledWith('Please select code to refactor.')).to.be.true;
        });

        it('should show error for unsupported language', async () => {
            mockEditor.document.languageId = 'unsupported';
            const showErrorStub = sandbox.stub(vscode.window, 'showErrorMessage');
            
            await architectCommands.elevateToArchitect();
            
            expect(showErrorStub.calledWith('Unsupported language for AI refactoring.')).to.be.true;
        });

        it('should successfully refactor code', async () => {
            // Mock user selections
            sandbox.stub(vscode.window, 'showQuickPick')
                .onFirstCall().resolves({ label: 'Optimize Performance', value: 'optimize' })
                .onSecondCall().resolves({ label: 'Yes', value: true });

            const withProgressStub = sandbox.stub(vscode.window, 'withProgress');
            withProgressStub.callsFake(async (options, callback) => {
                const mockProgress = { report: sandbox.stub() };
                const mockToken = { onCancellationRequested: sandbox.stub() };
                return await callback(mockProgress, mockToken);
            });

            const showInfoStub = sandbox.stub(vscode.window, 'showInformationMessage');
            
            await architectCommands.elevateToArchitect();
            
            expect(withProgressStub.called).to.be.true;
            expect(showInfoStub.calledWith('✅ Code refactoring completed successfully!')).to.be.true;
            expect(mockEditor.edit.called).to.be.true;
        });

        it('should handle refactoring errors', async () => {
            sandbox.stub(vscode.window, 'showQuickPick')
                .onFirstCall().resolves({ label: 'Optimize Performance', value: 'optimize' })
                .onSecondCall().resolves({ label: 'Yes', value: true });

            sandbox.stub(architectService, 'refactorCode').rejects(new Error('Refactoring failed'));

            const withProgressStub = sandbox.stub(vscode.window, 'withProgress');
            withProgressStub.callsFake(async (options, callback) => {
                const mockProgress = { report: sandbox.stub() };
                const mockToken = { onCancellationRequested: sandbox.stub() };
                return await callback(mockProgress, mockToken);
            });

            const showErrorStub = sandbox.stub(vscode.window, 'showErrorMessage');
            
            await architectCommands.elevateToArchitect();
            
            expect(showErrorStub.calledWith('AI refactoring failed: Refactoring failed')).to.be.true;
        });

        it('should handle user cancellation', async () => {
            sandbox.stub(vscode.window, 'showQuickPick').resolves(undefined);
            
            await architectCommands.elevateToArchitect();
            
            // Should complete without error or action
        });
    });

    describe('generateCode', () => {
        beforeEach(() => {
            sandbox.stub(vscode.window, 'activeTextEditor').value(mockEditor);
            sandbox.stub(configManager, 'hasValidApiKey').resolves(true);
            sandbox.stub(architectService, 'refactorCode').resolves('function validateEmail(email) {\n  return /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email);\n}');
        });

        it('should show error when no active editor', async () => {
            sandbox.stub(vscode.window, 'activeTextEditor').value(undefined);
            const showErrorStub = sandbox.stub(vscode.window, 'showErrorMessage');
            
            await architectCommands.generateCode();
            
            expect(showErrorStub.calledWith('No active editor found. Please open a file to generate code.')).to.be.true;
        });

        it('should show error when no API key configured', async () => {
            sandbox.stub(configManager, 'hasValidApiKey').resolves(false);
            const showErrorStub = sandbox.stub(vscode.window, 'showErrorMessage').resolves('Cancel');
            
            await architectCommands.generateCode();
            
            expect(showErrorStub.calledWith(
                'AI API key not configured. Please configure your API key to use Architect features.',
                'Configure API Key',
                'Cancel'
            )).to.be.true;
        });

        it('should show error for unsupported language', async () => {
            mockEditor.document.languageId = 'unsupported';
            const showErrorStub = sandbox.stub(vscode.window, 'showErrorMessage');
            
            await architectCommands.generateCode();
            
            expect(showErrorStub.calledWith('Unsupported language for code generation.')).to.be.true;
        });

        it('should successfully generate code', async () => {
            sandbox.stub(vscode.window, 'showInputBox').resolves('Create a function that validates email addresses');

            const withProgressStub = sandbox.stub(vscode.window, 'withProgress');
            withProgressStub.callsFake(async (options, callback) => {
                const mockProgress = { report: sandbox.stub() };
                const mockToken = { onCancellationRequested: sandbox.stub() };
                return await callback(mockProgress, mockToken);
            });

            const showInfoStub = sandbox.stub(vscode.window, 'showInformationMessage');
            
            await architectCommands.generateCode();
            
            expect(withProgressStub.called).to.be.true;
            expect(showInfoStub.calledWith('✅ Code generation completed successfully!')).to.be.true;
            expect(mockEditor.edit.called).to.be.true;
        });

        it('should handle generation errors', async () => {
            sandbox.stub(vscode.window, 'showInputBox').resolves('Create a function that validates email addresses');
            sandbox.stub(architectService, 'refactorCode').rejects(new Error('Generation failed'));

            const withProgressStub = sandbox.stub(vscode.window, 'withProgress');
            withProgressStub.callsFake(async (options, callback) => {
                const mockProgress = { report: sandbox.stub() };
                const mockToken = { onCancellationRequested: sandbox.stub() };
                return await callback(mockProgress, mockToken);
            });

            const showErrorStub = sandbox.stub(vscode.window, 'showErrorMessage');
            
            await architectCommands.generateCode();
            
            expect(showErrorStub.calledWith('Code generation failed: Generation failed')).to.be.true;
        });

        it('should handle user cancellation', async () => {
            sandbox.stub(vscode.window, 'showInputBox').resolves(undefined);
            
            await architectCommands.generateCode();
            
            // Should complete without error or action
        });

        it('should validate input description', async () => {
            const inputBoxStub = sandbox.stub(vscode.window, 'showInputBox');
            inputBoxStub.callsFake((options: any) => {
                // Test validation function
                const validator = options.validateInput;
                
                expect(validator('')).to.equal('Please provide a description');
                expect(validator('short')).to.equal('Please provide a more detailed description');
                expect(validator('This is a valid description that is long enough')).to.be.null;
                
                return Promise.resolve(undefined);
            });
            
            await architectCommands.generateCode();
        });
    });

    describe('detectLanguage', () => {
        it('should detect supported languages correctly', () => {
            const detectLanguage = (architectCommands as any).detectLanguage;
            
            expect(detectLanguage('typescript')).to.equal('typescript');
            expect(detectLanguage('javascript')).to.equal('javascript');
            expect(detectLanguage('typescriptreact')).to.equal('typescript');
            expect(detectLanguage('javascriptreact')).to.equal('javascript');
            expect(detectLanguage('python')).to.equal('python');
            expect(detectLanguage('java')).to.equal('java');
            expect(detectLanguage('csharp')).to.equal('csharp');
            expect(detectLanguage('go')).to.equal('go');
            expect(detectLanguage('rust')).to.equal('rust');
            expect(detectLanguage('php')).to.equal('php');
            expect(detectLanguage('ruby')).to.equal('ruby');
        });

        it('should return null for unsupported languages', () => {
            const detectLanguage = (architectCommands as any).detectLanguage;
            
            expect(detectLanguage('unsupported')).to.be.null;
            expect(detectLanguage('plaintext')).to.be.null;
            expect(detectLanguage('')).to.be.null;
        });
    });
});
