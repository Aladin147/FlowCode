import { expect } from 'chai';
import { describe, it, beforeEach, afterEach } from 'mocha';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import * as fs from 'fs';
import { GraphService, CodeGraph, CodeNode, CodeEdge } from '../../services/graph-service';
import { TestUtils } from '../TestUtils';

describe('GraphService', () => {
    let graphService: GraphService;
    let sandbox: sinon.SinonSandbox;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        TestUtils.mockVSCodeAPI(sandbox);
        
        graphService = new GraphService();
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('generateGraph', () => {
        it('should return null for unsupported file types', async () => {
            const result = await graphService.generateGraph('/test/file.txt');
            expect(result).to.be.null;
        });

        it('should generate graph for TypeScript files', async () => {
            const mockContent = `
                class TestClass {
                    method1() {
                        return this.method2();
                    }
                    
                    method2() {
                        return "test";
                    }
                }
                
                function testFunction() {
                    const instance = new TestClass();
                    return instance.method1();
                }
            `;
            
            sandbox.stub(fs, 'readFileSync').returns(mockContent);
            
            const result = await graphService.generateGraph('/test/file.ts');
            
            expect(result).to.not.be.null;
            expect(result!.nodes).to.be.an('array');
            expect(result!.edges).to.be.an('array');
            expect(result!.nodes.length).to.be.greaterThan(0);
        });

        it('should generate graph for Python files', async () => {
            const mockContent = `
                class TestClass:
                    def method1(self):
                        return self.method2()
                    
                    def method2(self):
                        return "test"
                
                def test_function():
                    instance = TestClass()
                    return instance.method1()
            `;
            
            sandbox.stub(fs, 'readFileSync').returns(mockContent);
            
            const result = await graphService.generateGraph('/test/file.py');
            
            expect(result).to.not.be.null;
            expect(result!.nodes).to.be.an('array');
            expect(result!.edges).to.be.an('array');
        });

        it('should handle file read errors gracefully', async () => {
            sandbox.stub(fs, 'readFileSync').throws(new Error('File not found'));
            
            const result = await graphService.generateGraph('/test/nonexistent.ts');
            
            expect(result).to.be.null;
        });

        it('should detect language from file extension', async () => {
            const testCases = [
                { file: '/test/file.ts', expected: 'typescript' },
                { file: '/test/file.tsx', expected: 'typescript' },
                { file: '/test/file.js', expected: 'javascript' },
                { file: '/test/file.jsx', expected: 'javascript' },
                { file: '/test/file.py', expected: 'python' }
            ];

            for (const testCase of testCases) {
                const detected = (graphService as any).detectLanguage(testCase.file);
                expect(detected).to.equal(testCase.expected);
            }
        });
    });

    describe('showGraphView', () => {
        it('should create webview panel with graph data', async () => {
            const mockPanel = {
                webview: {
                    html: '',
                    onDidReceiveMessage: sandbox.stub()
                }
            };
            
            sandbox.stub(vscode.window, 'createWebviewPanel').returns(mockPanel);
            
            const mockGraph: CodeGraph = {
                nodes: [
                    {
                        id: 'node1',
                        type: 'function',
                        name: 'testFunction',
                        file: '/test/file.ts',
                        line: 1,
                        column: 1
                    }
                ],
                edges: []
            };

            await graphService.showGraphView(mockGraph);

            expect(vscode.window.createWebviewPanel.called).to.be.true;
            expect(mockPanel.webview.html).to.include('testFunction');
            expect(mockPanel.webview.html).to.include('d3js.org');
        });

        it('should handle webview messages for file navigation', async () => {
            const mockPanel = {
                webview: {
                    html: '',
                    onDidReceiveMessage: sandbox.stub()
                }
            };
            
            sandbox.stub(vscode.window, 'createWebviewPanel').returns(mockPanel);
            sandbox.stub(vscode.workspace, 'openTextDocument').resolves({});
            sandbox.stub(vscode.window, 'showTextDocument').resolves({
                selection: {},
                revealRange: sandbox.stub()
            });

            const mockGraph: CodeGraph = {
                nodes: [],
                edges: []
            };

            await graphService.showGraphView(mockGraph);

            // Simulate message from webview
            const messageHandler = mockPanel.webview.onDidReceiveMessage.getCall(0).args[0];
            await messageHandler({
                command: 'openFile',
                file: '/test/file.ts',
                line: 10
            });

            expect(vscode.workspace.openTextDocument.called).to.be.true;
        });
    });

    describe('edge detection', () => {
        it('should detect function calls in JavaScript', async () => {
            const nodes: CodeNode[] = [
                {
                    id: 'func1',
                    type: 'function',
                    name: 'caller',
                    file: '/test/file.js',
                    line: 1,
                    column: 1
                },
                {
                    id: 'func2',
                    type: 'function',
                    name: 'callee',
                    file: '/test/file.js',
                    line: 5,
                    column: 1
                }
            ];

            const content = `
                function caller() {
                    return callee();
                }
                
                function callee() {
                    return "test";
                }
            `;

            const edges = await (graphService as any).buildEdges(nodes, content, 'javascript');

            expect(edges).to.be.an('array');
            const callEdge = edges.find((e: CodeEdge) => e.type === 'calls');
            expect(callEdge).to.exist;
            expect(callEdge!.from).to.equal('func1');
            expect(callEdge!.to).to.equal('func2');
        });

        it('should detect class inheritance in TypeScript', async () => {
            const nodes: CodeNode[] = [
                {
                    id: 'base',
                    type: 'class',
                    name: 'BaseClass',
                    file: '/test/file.ts',
                    line: 1,
                    column: 1
                },
                {
                    id: 'derived',
                    type: 'class',
                    name: 'DerivedClass',
                    file: '/test/file.ts',
                    line: 5,
                    column: 1
                }
            ];

            const content = `
                class BaseClass {
                    method() {}
                }
                
                class DerivedClass extends BaseClass {
                    method() {
                        super.method();
                    }
                }
            `;

            const edges = await (graphService as any).buildEdges(nodes, content, 'typescript');

            expect(edges).to.be.an('array');
            const extendsEdge = edges.find((e: CodeEdge) => e.type === 'extends');
            expect(extendsEdge).to.exist;
            expect(extendsEdge!.from).to.equal('derived');
            expect(extendsEdge!.to).to.equal('base');
        });

        it('should detect Python class inheritance', async () => {
            const nodes: CodeNode[] = [
                {
                    id: 'base',
                    type: 'class',
                    name: 'BaseClass',
                    file: '/test/file.py',
                    line: 1,
                    column: 1
                },
                {
                    id: 'derived',
                    type: 'class',
                    name: 'DerivedClass',
                    file: '/test/file.py',
                    line: 5,
                    column: 1
                }
            ];

            const content = `
                class BaseClass:
                    def method(self):
                        pass
                
                class DerivedClass(BaseClass):
                    def method(self):
                        super().method()
            `;

            const edges = await (graphService as any).buildEdges(nodes, content, 'python');

            expect(edges).to.be.an('array');
            const inheritsEdge = edges.find((e: CodeEdge) => e.type === 'inherits');
            expect(inheritsEdge).to.exist;
        });

        it('should escape regex special characters in names', () => {
            const testCases = [
                { input: 'normal_name', expected: 'normal_name' },
                { input: 'name.with.dots', expected: 'name\\.with\\.dots' },
                { input: 'name$with$dollars', expected: 'name\\$with\\$dollars' },
                { input: 'name[with]brackets', expected: 'name\\[with\\]brackets' }
            ];

            for (const testCase of testCases) {
                const result = (graphService as any).escapeRegex(testCase.input);
                expect(result).to.equal(testCase.expected);
            }
        });
    });

    describe('tree-sitter parsing', () => {
        it('should fall back to regex parsing when tree-sitter fails', async () => {
            // Mock tree-sitter to throw an error
            sandbox.stub(graphService as any, 'parseWithTreeSitter').throws(new Error('Tree-sitter error'));
            
            const mockContent = `
                function testFunction() {
                    return "test";
                }
            `;

            const result = await (graphService as any).parseCode(mockContent, '/test/file.js', 'javascript');

            expect(result).to.be.an('array');
            expect(result.length).to.be.greaterThan(0);
            expect(result[0].name).to.equal('testFunction');
        });

        it('should parse JavaScript functions with regex fallback', async () => {
            const content = `
                function regularFunction() {
                    return "test";
                }
                
                const arrowFunction = () => {
                    return "arrow";
                };
                
                async function asyncFunction() {
                    return await Promise.resolve("async");
                }
            `;

            const result = await (graphService as any).parseJavaScript(content, '/test/file.js');

            expect(result).to.be.an('array');
            expect(result.length).to.equal(3);
            
            const functionNames = result.map((node: CodeNode) => node.name);
            expect(functionNames).to.include('regularFunction');
            expect(functionNames).to.include('arrowFunction');
            expect(functionNames).to.include('asyncFunction');
        });

        it('should parse Python functions and classes with regex fallback', async () => {
            const content = `
                class TestClass:
                    def __init__(self):
                        self.value = "test"
                    
                    def method(self):
                        return self.value
                
                def standalone_function():
                    return "standalone"
                
                async def async_function():
                    return "async"
            `;

            const result = await (graphService as any).parsePython(content, '/test/file.py');

            expect(result).to.be.an('array');
            expect(result.length).to.be.greaterThan(0);
            
            const names = result.map((node: CodeNode) => node.name);
            expect(names).to.include('TestClass');
            expect(names).to.include('standalone_function');
            expect(names).to.include('async_function');
        });
    });

    describe('webview content generation', () => {
        it('should generate valid HTML with D3.js integration', () => {
            const mockGraph: CodeGraph = {
                nodes: [
                    {
                        id: 'node1',
                        type: 'function',
                        name: 'testFunction',
                        file: '/test/file.ts',
                        line: 1,
                        column: 1
                    }
                ],
                edges: [
                    {
                        from: 'node1',
                        to: 'node1',
                        type: 'calls',
                        line: 2
                    }
                ]
            };

            const html = (graphService as any).getWebviewContent(mockGraph);

            expect(html).to.include('<!DOCTYPE html>');
            expect(html).to.include('d3js.org');
            expect(html).to.include('testFunction');
            expect(html).to.include('vscode.postMessage');
            expect(html).to.include('forceSimulation');
        });
    });
});
