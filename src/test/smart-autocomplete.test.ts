import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { SmartAutocompleteService, SmartCompletionItem } from '../services/smart-autocomplete-service';
import { ConfigurationManager } from '../utils/configuration-manager';
import { ContextManager } from '../services/context-manager';
import { ArchitectService } from '../services/architect-service';
import { CompanionGuard } from '../services/companion-guard';

/**
 * Test suite for Smart Autocomplete System
 * 
 * Validates AI-powered code completion with confidence scoring,
 * context integration, and performance optimization.
 */
describe('Smart Autocomplete System', () => {
    let smartAutocompleteService: SmartAutocompleteService;
    let mockConfigManager: sinon.SinonStubbedInstance<ConfigurationManager>;
    let mockContextManager: sinon.SinonStubbedInstance<ContextManager>;
    let mockArchitectService: sinon.SinonStubbedInstance<ArchitectService>;
    let mockCompanionGuard: sinon.SinonStubbedInstance<CompanionGuard>;
    let mockDocument: sinon.SinonStubbedInstance<vscode.TextDocument>;
    let mockPosition: vscode.Position;
    let mockContext: vscode.CompletionContext;

    beforeEach(() => {
        // Create mocks
        mockConfigManager = sinon.createStubInstance(ConfigurationManager);
        mockContextManager = sinon.createStubInstance(ContextManager);
        mockArchitectService = sinon.createStubInstance(ArchitectService);
        mockCompanionGuard = sinon.createStubInstance(CompanionGuard);
        mockDocument = sinon.createStubInstance(vscode.TextDocument);

        // Setup mock document
        mockDocument.languageId = 'typescript';
        mockDocument.fileName = 'test.ts';
        mockDocument.lineCount = 10;
        
        // Setup mock position
        mockPosition = new vscode.Position(5, 10);
        
        // Setup mock completion context
        mockContext = {
            triggerKind: vscode.CompletionTriggerKind.Invoke,
            triggerCharacter: '.'
        };

        // Setup default mock responses
        mockContextManager.getInlineContext.resolves({
            analysis: {
                items: [],
                totalSize: 1000,
                fileCount: 3,
                analysisTime: 50,
                metadata: {
                    activeFile: 'test.ts',
                    workspaceRoot: '/project',
                    timestamp: Date.now()
                }
            },
            finalContext: 'Enhanced context for autocomplete',
            compressionApplied: true,
            metadata: {
                totalOriginalSize: 2000,
                finalSize: 1000,
                compressionRatio: 0.5,
                processingTime: 50,
                provider: 'anthropic',
                model: 'claude-3-opus',
                timestamp: Date.now()
            }
        });

        mockArchitectService.generateResponse.resolves({
            content: JSON.stringify([
                {
                    text: 'console.log',
                    description: 'Log to console',
                    type: 'function'
                },
                {
                    text: 'const result =',
                    description: 'Declare constant',
                    type: 'keyword'
                }
            ]),
            cost: 0.001,
            tokens: 50
        });

        mockCompanionGuard.getStatus.resolves({
            status: 'active',
            issues: []
        });

        // Create service instance
        smartAutocompleteService = new SmartAutocompleteService(
            mockConfigManager,
            mockContextManager,
            mockArchitectService,
            mockCompanionGuard
        );
    });

    afterEach(() => {
        sinon.restore();
    });

    describe('Basic Completion Functionality', () => {
        it('should provide completion items for supported languages', async () => {
            // Setup mock document line
            const mockLine = {
                text: 'console.',
                range: new vscode.Range(5, 0, 5, 8)
            };
            mockDocument.lineAt.returns(mockLine);
            mockDocument.getText.returns('console.');
            mockDocument.getWordRangeAtPosition.returns(new vscode.Range(5, 0, 5, 7));

            const token = new vscode.CancellationTokenSource().token;
            
            const completions = await smartAutocompleteService.provideCompletionItems(
                mockDocument,
                mockPosition,
                token,
                mockContext
            );

            expect(completions).to.be.an('array');
            expect(completions.length).to.be.greaterThan(0);
            
            // Verify AI completions are included
            const smartCompletions = completions as SmartCompletionItem[];
            const aiCompletion = smartCompletions.find(item => item.aiGenerated);
            expect(aiCompletion).to.exist;
            expect(aiCompletion?.confidence).to.be.a('number');
            expect(aiCompletion?.confidence).to.be.greaterThan(0);
        });

        it('should return empty array for unsupported languages', async () => {
            mockDocument.languageId = 'plaintext';
            
            const token = new vscode.CancellationTokenSource().token;
            
            const completions = await smartAutocompleteService.provideCompletionItems(
                mockDocument,
                mockPosition,
                token,
                mockContext
            );

            expect(completions).to.be.an('array');
            expect(completions.length).to.equal(0);
        });

        it('should handle cancellation gracefully', async () => {
            const tokenSource = new vscode.CancellationTokenSource();
            tokenSource.cancel(); // Cancel immediately
            
            const completions = await smartAutocompleteService.provideCompletionItems(
                mockDocument,
                mockPosition,
                tokenSource.token,
                mockContext
            );

            expect(completions).to.be.an('array');
            expect(completions.length).to.equal(0);
        });
    });

    describe('Confidence Scoring', () => {
        it('should assign confidence scores to AI completions', async () => {
            const mockLine = {
                text: 'const test = ',
                range: new vscode.Range(5, 0, 5, 13)
            };
            mockDocument.lineAt.returns(mockLine);
            mockDocument.getText.returns('const test = ');
            mockDocument.getWordRangeAtPosition.returns(new vscode.Range(5, 6, 5, 10));

            const token = new vscode.CancellationTokenSource().token;
            
            const completions = await smartAutocompleteService.provideCompletionItems(
                mockDocument,
                mockPosition,
                token,
                mockContext
            ) as SmartCompletionItem[];

            const aiCompletions = completions.filter(item => item.aiGenerated);
            
            for (const completion of aiCompletions) {
                expect(completion.confidence).to.be.a('number');
                expect(completion.confidence).to.be.at.least(0);
                expect(completion.confidence).to.be.at.most(100);
                expect(completion.contextRelevance).to.be.a('number');
                expect(completion.source).to.equal('ai');
            }
        });

        it('should boost confidence for exact matches', async () => {
            const mockLine = {
                text: 'cons',
                range: new vscode.Range(5, 0, 5, 4)
            };
            mockDocument.lineAt.returns(mockLine);
            mockDocument.getText.returns('cons');
            mockDocument.getWordRangeAtPosition.returns(new vscode.Range(5, 0, 5, 4));

            // Mock AI response with console.log suggestion
            mockArchitectService.generateResponse.resolves({
                content: JSON.stringify([
                    {
                        text: 'console.log',
                        description: 'Log to console',
                        type: 'function'
                    }
                ]),
                cost: 0.001,
                tokens: 30
            });

            const token = new vscode.CancellationTokenSource().token;
            
            const completions = await smartAutocompleteService.provideCompletionItems(
                mockDocument,
                mockPosition,
                token,
                mockContext
            ) as SmartCompletionItem[];

            const consoleCompletion = completions.find(item => 
                typeof item.label === 'string' && item.label.startsWith('console')
            );
            
            expect(consoleCompletion).to.exist;
            expect(consoleCompletion?.confidence).to.be.greaterThan(70); // Should be boosted
        });

        it('should reduce confidence for quality issues', async () => {
            // Mock companion guard with issues
            mockCompanionGuard.getStatus.resolves({
                status: 'warning',
                issues: [
                    { line: 1, column: 1, severity: 'error', message: 'Type error', rule: 'typescript' }
                ]
            });

            const mockLine = {
                text: 'test.',
                range: new vscode.Range(5, 0, 5, 5)
            };
            mockDocument.lineAt.returns(mockLine);
            mockDocument.getText.returns('test.');
            mockDocument.getWordRangeAtPosition.returns(new vscode.Range(5, 0, 5, 4));

            const token = new vscode.CancellationTokenSource().token;
            
            const completions = await smartAutocompleteService.provideCompletionItems(
                mockDocument,
                mockPosition,
                token,
                mockContext
            ) as SmartCompletionItem[];

            const aiCompletions = completions.filter(item => item.aiGenerated);
            
            // Confidence should be reduced due to quality issues
            for (const completion of aiCompletions) {
                expect(completion.confidence).to.be.lessThan(80);
            }
        });
    });

    describe('Context Integration', () => {
        it('should use ContextManager for intelligent context', async () => {
            const mockLine = {
                text: 'function test() {',
                range: new vscode.Range(5, 0, 5, 17)
            };
            mockDocument.lineAt.returns(mockLine);
            mockDocument.getText.returns('function test() {');

            const token = new vscode.CancellationTokenSource().token;
            
            await smartAutocompleteService.provideCompletionItems(
                mockDocument,
                mockPosition,
                token,
                mockContext
            );

            // Verify ContextManager was called
            expect(mockContextManager.getInlineContext.calledOnce).to.be.true;
            expect(mockContextManager.getInlineContext.calledWith(1000)).to.be.true;
        });

        it('should handle context manager errors gracefully', async () => {
            // Make ContextManager throw an error
            mockContextManager.getInlineContext.rejects(new Error('Context failed'));

            const mockLine = {
                text: 'test',
                range: new vscode.Range(5, 0, 5, 4)
            };
            mockDocument.lineAt.returns(mockLine);
            mockDocument.getText.returns('test');

            const token = new vscode.CancellationTokenSource().token;
            
            const completions = await smartAutocompleteService.provideCompletionItems(
                mockDocument,
                mockPosition,
                token,
                mockContext
            );

            // Should return fallback completions
            expect(completions).to.be.an('array');
            // Should not throw error
        });
    });

    describe('Performance and Caching', () => {
        it('should cache completion results', async () => {
            const mockLine = {
                text: 'console.',
                range: new vscode.Range(5, 0, 5, 8)
            };
            mockDocument.lineAt.returns(mockLine);
            mockDocument.getText.returns('console.');
            mockDocument.getWordRangeAtPosition.returns(new vscode.Range(5, 0, 5, 7));

            const token = new vscode.CancellationTokenSource().token;
            
            // First call
            const completions1 = await smartAutocompleteService.provideCompletionItems(
                mockDocument,
                mockPosition,
                token,
                mockContext
            );

            // Second call with same parameters
            const completions2 = await smartAutocompleteService.provideCompletionItems(
                mockDocument,
                mockPosition,
                token,
                mockContext
            );

            expect(completions1).to.deep.equal(completions2);
            
            // AI service should only be called once due to caching
            expect(mockArchitectService.generateResponse.callCount).to.be.lessThanOrEqual(1);
        });

        it('should clear cache when requested', () => {
            smartAutocompleteService.clearCache();
            // Should not throw error
        });
    });

    describe('Enable/Disable Functionality', () => {
        it('should respect enabled/disabled state', async () => {
            // Disable the service
            smartAutocompleteService.setEnabled(false);

            const token = new vscode.CancellationTokenSource().token;
            
            const completions = await smartAutocompleteService.provideCompletionItems(
                mockDocument,
                mockPosition,
                token,
                mockContext
            );

            expect(completions).to.be.an('array');
            expect(completions.length).to.equal(0);

            // Re-enable
            smartAutocompleteService.setEnabled(true);
        });
    });
});
