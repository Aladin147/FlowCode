import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger';
import { InputValidator } from '../utils/input-validator';
// Tree-sitter imports - using require for compatibility
const Parser = require('tree-sitter');
const TypeScript = require('tree-sitter-typescript');
const Python = require('tree-sitter-python');

export interface CodeGraph {
    nodes: CodeNode[];
    edges: CodeEdge[];
}

export interface CodeNode {
    id: string;
    type: 'function' | 'class' | 'variable' | 'import' | 'export';
    name: string;
    file: string;
    line: number;
    column: number;
    signature?: string;
    documentation?: string;
}

export interface CodeEdge {
    from: string;
    to: string;
    type: 'calls' | 'imports' | 'extends' | 'implements' | 'uses' | 'provides' | 'inherits';
    line?: number;
}

export class GraphService {
    private static readonly SUPPORTED_LANGUAGES = ['typescript', 'javascript', 'python'];
    private tsParser: any;
    private pyParser: any;
    private contextLogger = logger.createContextLogger('GraphService');

    constructor() {
        this.tsParser = new Parser();
        this.pyParser = new Parser();

        try {
            this.tsParser.setLanguage(TypeScript.typescript);
            this.pyParser.setLanguage(Python);
            this.contextLogger.info('Tree-sitter parsers initialized successfully');
        } catch (error) {
            this.contextLogger.error('Failed to initialize tree-sitter parsers, falling back to regex parsing', error as Error);
        }
    }

    /**
     * Initialize the graph service
     */
    public async initialize(): Promise<void> {
        try {
            this.contextLogger.info('Initializing GraphService');

            // Ensure parsers are initialized
            if (!this.tsParser || !this.pyParser) {
                this.tsParser = new Parser();
                this.pyParser = new Parser();

                try {
                    this.tsParser.setLanguage(TypeScript.typescript);
                    this.pyParser.setLanguage(Python);
                    this.contextLogger.info('Tree-sitter parsers initialized successfully');
                } catch (error) {
                    this.contextLogger.error('Failed to initialize tree-sitter parsers, falling back to regex parsing', error as Error);
                }
            }

            this.contextLogger.info('GraphService initialized successfully');
        } catch (error) {
            this.contextLogger.error('Failed to initialize GraphService', error as Error);
            throw error;
        }
    }

    public async generateGraph(filePath: string, _position?: vscode.Position): Promise<CodeGraph | null> {
        try {
            // Validate file path
            const pathValidation = InputValidator.validateFilePath(filePath);
            if (!pathValidation.isValid) {
                this.contextLogger.warn(`Invalid file path: ${pathValidation.errors.join(', ')}`);
                return null;
            }

            const sanitizedPath = pathValidation.sanitizedValue as string;
            const language = this.detectLanguage(sanitizedPath);
            if (!language || !GraphService.SUPPORTED_LANGUAGES.includes(language)) {
                return null;
            }

            // Validate file exists and is readable
            if (!fs.existsSync(sanitizedPath)) {
                this.contextLogger.warn(`File does not exist: ${sanitizedPath}`);
                return null;
            }

            const content = fs.readFileSync(sanitizedPath, 'utf-8');

            // Validate file content
            const contentValidation = InputValidator.validateCodeContent(content);
            if (!contentValidation.isValid) {
                this.contextLogger.warn(`Invalid file content: ${contentValidation.errors.join(', ')}`);
                return null;
            }

            const sanitizedContent = contentValidation.sanitizedValue as string;
            const nodes = await this.parseCode(sanitizedContent, sanitizedPath, language);
            const edges = await this.buildEdges(nodes, sanitizedContent, language);

            return { nodes, edges };
        } catch (error) {
            this.contextLogger.error('Failed to generate code graph', error as Error);
            return null;
        }
    }

    public async showGraphView(graph: CodeGraph): Promise<void> {
        try {
            const panel = vscode.window.createWebviewPanel(
                'flowcodeGraph',
                'Code Graph',
                vscode.ViewColumn.Two,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true,
                    localResourceRoots: [
                        vscode.Uri.joinPath(vscode.workspace.workspaceFolders?.[0]?.uri || vscode.Uri.file('.'), 'node_modules')
                    ]
                }
            );

            panel.webview.html = await this.getWebviewContent(graph, panel.webview);

            // Handle messages from the webview
            panel.webview.onDidReceiveMessage(
                message => {
                    switch (message.command) {
                        case 'openFile':
                            this.openFileAtLocation(message.file, message.line);
                            break;
                        case 'error':
                            this.contextLogger.error('Webview error', new Error(message.error));
                            break;
                    }
                }
            );

            this.contextLogger.info('Graph webview created successfully');
        } catch (error) {
            this.contextLogger.error('Failed to create graph webview', error as Error);
            vscode.window.showErrorMessage('Failed to show code graph: ' + (error as Error).message);
        }
    }

    private async openFileAtLocation(filePath: string, line?: number): Promise<void> {
        try {
            const document = await vscode.workspace.openTextDocument(filePath);
            const editor = await vscode.window.showTextDocument(document);

            if (line && line > 0) {
                const position = new vscode.Position(line - 1, 0);
                editor.selection = new vscode.Selection(position, position);
                editor.revealRange(new vscode.Range(position, position));
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to open file: ${filePath}`);
        }
    }

    private detectLanguage(filePath: string): string | null {
        const ext = path.extname(filePath).toLowerCase();
        
        switch (ext) {
            case '.ts':
            case '.tsx':
                return 'typescript';
            case '.js':
            case '.jsx':
                return 'javascript';
            case '.py':
                return 'python';
            default:
                return null;
        }
    }

    private async parseCode(content: string, filePath: string, language: string): Promise<CodeNode[]> {
        const nodes: CodeNode[] = [];

        try {
            switch (language) {
                case 'typescript':
                case 'javascript':
                    return this.parseWithTreeSitter(content, filePath, this.tsParser, language);
                case 'python':
                    return this.parseWithTreeSitter(content, filePath, this.pyParser, language);
                default:
                    return nodes;
            }
        } catch (error) {
            console.warn('Tree-sitter parsing failed, falling back to regex:', error);
            // Fallback to regex parsing
            switch (language) {
                case 'typescript':
                case 'javascript':
                    return this.parseJavaScript(content, filePath);
                case 'python':
                    return this.parsePython(content, filePath);
                default:
                    return nodes;
            }
        }
    }

    private parseWithTreeSitter(content: string, filePath: string, parser: any, language: string): CodeNode[] {
        const nodes: CodeNode[] = [];

        try {
            const tree = parser.parse(content);
            const rootNode = tree.rootNode;

            this.traverseNode(rootNode, content, filePath, nodes, language);
        } catch (error) {
            console.error('Tree-sitter parsing error:', error);
            throw error;
        }

        return nodes;
    }

    private traverseNode(node: any, content: string, filePath: string, nodes: CodeNode[], language: string): void {
        const lines = content.split('\n');

        // Handle different node types based on language
        if (language === 'typescript' || language === 'javascript') {
            this.handleTypeScriptNode(node, content, filePath, nodes, lines);
        } else if (language === 'python') {
            this.handlePythonNode(node, content, filePath, nodes, lines);
        }

        // Recursively traverse child nodes
        for (let i = 0; i < node.childCount; i++) {
            this.traverseNode(node.child(i), content, filePath, nodes, language);
        }
    }

    private handleTypeScriptNode(node: any, content: string, filePath: string, nodes: CodeNode[], _lines: string[]): void {
        const nodeType = node.type;
        const startPosition = node.startPosition;

        switch (nodeType) {
            case 'function_declaration':
            case 'method_definition':
            case 'arrow_function':
                const funcName = this.extractNodeName(node, content);
                if (funcName) {
                    nodes.push({
                        id: `func_${funcName}`,
                        type: 'function',
                        name: funcName,
                        file: filePath,
                        line: startPosition.row + 1,
                        column: startPosition.column + 1,
                        signature: this.extractNodeText(node, content).substring(0, 100)
                    });
                }
                break;

            case 'class_declaration':
                const className = this.extractNodeName(node, content);
                if (className) {
                    nodes.push({
                        id: `class_${className}`,
                        type: 'class',
                        name: className,
                        file: filePath,
                        line: startPosition.row + 1,
                        column: startPosition.column + 1
                    });
                }
                break;

            case 'import_statement':
                const importPath = this.extractImportPath(node, content);
                if (importPath) {
                    nodes.push({
                        id: `import_${importPath}`,
                        type: 'import',
                        name: importPath,
                        file: filePath,
                        line: startPosition.row + 1,
                        column: startPosition.column + 1
                    });
                }
                break;
        }
    }

    private handlePythonNode(node: any, content: string, filePath: string, nodes: CodeNode[], _lines: string[]): void {
        const nodeType = node.type;
        const startPosition = node.startPosition;

        switch (nodeType) {
            case 'function_definition':
                const funcName = this.extractNodeName(node, content);
                if (funcName) {
                    nodes.push({
                        id: `func_${funcName}`,
                        type: 'function',
                        name: funcName,
                        file: filePath,
                        line: startPosition.row + 1,
                        column: startPosition.column + 1,
                        signature: this.extractNodeText(node, content).substring(0, 100)
                    });
                }
                break;

            case 'class_definition':
                const className = this.extractNodeName(node, content);
                if (className) {
                    nodes.push({
                        id: `class_${className}`,
                        type: 'class',
                        name: className,
                        file: filePath,
                        line: startPosition.row + 1,
                        column: startPosition.column + 1
                    });
                }
                break;

            case 'import_statement':
            case 'import_from_statement':
                const importPath = this.extractImportPath(node, content);
                if (importPath) {
                    nodes.push({
                        id: `import_${importPath}`,
                        type: 'import',
                        name: importPath,
                        file: filePath,
                        line: startPosition.row + 1,
                        column: startPosition.column + 1
                    });
                }
                break;
        }
    }

    private extractNodeName(node: any, content: string): string | null {
        // Look for identifier child nodes
        for (let i = 0; i < node.childCount; i++) {
            const child = node.child(i);
            if (child.type === 'identifier') {
                return this.extractNodeText(child, content);
            }
        }
        return null;
    }

    private extractNodeText(node: any, content: string): string {
        const startIndex = node.startIndex;
        const endIndex = node.endIndex;
        return content.substring(startIndex, endIndex);
    }

    private extractImportPath(node: any, content: string): string | null {
        // Look for string literal in import statement
        for (let i = 0; i < node.childCount; i++) {
            const child = node.child(i);
            if (child.type === 'string' || child.type === 'string_literal') {
                const text = this.extractNodeText(child, content);
                return text.replace(/['"]/g, ''); // Remove quotes
            }
        }
        return null;
    }

    private extractVariableName(node: any, content: string): string | null {
        try {
            // Look for variable declarator
            for (let i = 0; i < node.childCount; i++) {
                const child = node.child(i);
                if (child.type === 'variable_declarator') {
                    for (let j = 0; j < child.childCount; j++) {
                        const grandchild = child.child(j);
                        if (grandchild.type === 'identifier') {
                            return this.extractNodeText(grandchild, content);
                        }
                    }
                }
            }
            return null;
        } catch (error) {
            this.contextLogger.warn('Error extracting variable name', error as Error);
            return null;
        }
    }

    private extractDocumentation(node: any, content: string): string | undefined {
        try {
            // Look for preceding comment nodes
            const lines = content.split('\n');
            const startLine = node.startPosition.row;

            // Check a few lines before for JSDoc or comments
            for (let i = Math.max(0, startLine - 5); i < startLine; i++) {
                const line = lines[i]?.trim();
                if (line && (line.startsWith('/**') || line.startsWith('///'))) {
                    return line.substring(0, 100); // Return first 100 chars
                }
            }
            return undefined;
        } catch (error) {
            return undefined;
        }
    }

    private parseJavaScript(content: string, filePath: string): CodeNode[] {
        const nodes: CodeNode[] = [];
        const lines = content.split('\n');
        
        // Simple regex-based parsing for demonstration
        // In production, use tree-sitter for more accurate parsing
        
        // Find functions
        const functionRegex = /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(/g;
        let match;
        
        while ((match = functionRegex.exec(content)) !== null) {
            const lineIndex = content.substring(0, match.index).split('\n').length - 1;
            const line = lines[lineIndex];
            const column = line.indexOf(match[0]) + 1;
            
            nodes.push({
                id: `func_${match[1]}`,
                type: 'function',
                name: match[1],
                file: filePath,
                line: lineIndex + 1,
                column: column,
                signature: this.extractSignature(lines, lineIndex)
            });
        }

        // Find classes
        const classRegex = /(?:export\s+)?class\s+(\w+)/g;
        while ((match = classRegex.exec(content)) !== null) {
            const lineIndex = content.substring(0, match.index).split('\n').length - 1;
            const line = lines[lineIndex];
            const column = line.indexOf(match[0]) + 1;
            
            nodes.push({
                id: `class_${match[1]}`,
                type: 'class',
                name: match[1],
                file: filePath,
                line: lineIndex + 1,
                column: column
            });
        }

        // Find imports
        const importRegex = /import\s+(?:{[^}]+}\s+from\s+)?['"]([^'"]+)['"]/g;
        while ((match = importRegex.exec(content)) !== null) {
            const lineIndex = content.substring(0, match.index).split('\n').length - 1;
            const line = lines[lineIndex];
            const column = line.indexOf(match[0]) + 1;
            
            nodes.push({
                id: `import_${match[1]}`,
                type: 'import',
                name: match[1],
                file: filePath,
                line: lineIndex + 1,
                column: column
            });
        }

        return nodes;
    }

    private parsePython(content: string, filePath: string): CodeNode[] {
        const nodes: CodeNode[] = [];
        const lines = content.split('\n');
        
        // Find functions
        const functionRegex = /def\s+(\w+)\s*\(/g;
        let match;
        
        while ((match = functionRegex.exec(content)) !== null) {
            const lineIndex = content.substring(0, match.index).split('\n').length - 1;
            const line = lines[lineIndex];
            const column = line.indexOf(match[0]) + 1;
            
            nodes.push({
                id: `func_${match[1]}`,
                type: 'function',
                name: match[1],
                file: filePath,
                line: lineIndex + 1,
                column: column,
                signature: this.extractSignature(lines, lineIndex)
            });
        }

        // Find classes
        const classRegex = /class\s+(\w+)/g;
        while ((match = classRegex.exec(content)) !== null) {
            const lineIndex = content.substring(0, match.index).split('\n').length - 1;
            const line = lines[lineIndex];
            const column = line.indexOf(match[0]) + 1;
            
            nodes.push({
                id: `class_${match[1]}`,
                type: 'class',
                name: match[1],
                file: filePath,
                line: lineIndex + 1,
                column: column
            });
        }

        // Find imports
        const importRegex = /from\s+(\w+)\s+import|import\s+(\w+)/g;
        while ((match = importRegex.exec(content)) !== null) {
            const moduleName = match[1] || match[2];
            const lineIndex = content.substring(0, match.index).split('\n').length - 1;
            const line = lines[lineIndex];
            const column = line.indexOf(match[0]) + 1;
            
            nodes.push({
                id: `import_${moduleName}`,
                type: 'import',
                name: moduleName,
                file: filePath,
                line: lineIndex + 1,
                column: column
            });
        }

        return nodes;
    }

    private extractSignature(lines: string[], startLine: number): string {
        let signature = lines[startLine].trim();
        let lineIndex = startLine + 1;
        
        // Continue until we find the closing parenthesis or opening brace
        while (lineIndex < lines.length && !signature.includes(')') && !signature.includes(':')) {
            signature += ' ' + lines[lineIndex].trim();
            lineIndex++;
        }
        
        return signature.substring(0, 100) + (signature.length > 100 ? '...' : '');
    }

    private async buildEdges(nodes: CodeNode[], content: string, language: string): Promise<CodeEdge[]> {
        const edges: CodeEdge[] = [];

        // Enhanced edge detection based on language
        if (language === 'typescript' || language === 'javascript') {
            this.buildJavaScriptEdges(nodes, content, edges);
        } else if (language === 'python') {
            this.buildPythonEdges(nodes, content, edges);
        } else {
            // Fallback to simple detection
            this.buildSimpleEdges(nodes, content, edges);
        }

        return edges;
    }

    private buildSimpleEdges(nodes: CodeNode[], content: string, edges: CodeEdge[]): void {
        nodes.forEach(node => {
            if (node.type === 'function') {
                // Find calls to other functions
                nodes.forEach(targetNode => {
                    if (targetNode.type === 'function' && targetNode.name !== node.name) {
                        const callPattern = new RegExp(`\\b${this.escapeRegex(targetNode.name)}\\s*\\(`, 'g');
                        const match = callPattern.exec(content);
                        if (match) {
                            edges.push({
                                from: node.id,
                                to: targetNode.id,
                                type: 'calls',
                                line: content.substring(0, match.index).split('\n').length
                            });
                        }
                    }
                });
            }

            if (node.type === 'import') {
                // Link imports to their usage
                nodes.forEach(targetNode => {
                    if (targetNode.type === 'function' || targetNode.type === 'class') {
                        const usagePattern = new RegExp(`\\b${this.escapeRegex(targetNode.name)}\\b`, 'g');
                        const match = usagePattern.exec(content);
                        if (match) {
                            edges.push({
                                from: node.id,
                                to: targetNode.id,
                                type: 'uses',
                                line: content.substring(0, match.index).split('\n').length
                            });
                        }
                    }
                });
            }
        });
    }

    private buildJavaScriptEdges(nodes: CodeNode[], content: string, edges: CodeEdge[]): void {
        nodes.forEach(node => {
            if (node.type === 'function') {
                this.findFunctionCalls(node, nodes, content, edges);
            } else if (node.type === 'class') {
                this.findClassRelationships(node, nodes, content, edges);
            } else if (node.type === 'import') {
                this.findImportDependencies(node, nodes, content, edges);
            }
        });
    }

    private buildPythonEdges(nodes: CodeNode[], content: string, edges: CodeEdge[]): void {
        nodes.forEach(node => {
            if (node.type === 'function') {
                this.findPythonFunctionCalls(node, nodes, content, edges);
            } else if (node.type === 'class') {
                this.findPythonClassRelationships(node, nodes, content, edges);
            } else if (node.type === 'import') {
                this.findPythonImportDependencies(node, nodes, content, edges);
            }
        });
    }

    private async getWebviewContent(graph: CodeGraph, webview: vscode.Webview): Promise<string> {
        const nodesJson = JSON.stringify(graph.nodes);
        const edgesJson = JSON.stringify(graph.edges);

        // Get local D3.js URI
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        let d3Uri = '';

        if (workspaceFolder) {
            try {
                const d3Path = vscode.Uri.joinPath(workspaceFolder.uri, 'node_modules', 'd3', 'dist', 'd3.min.js');
                d3Uri = webview.asWebviewUri(d3Path).toString();
            } catch (error) {
                this.contextLogger.warn('Could not load local D3.js, falling back to CDN', error as Error);
                d3Uri = 'https://d3js.org/d3.v7.min.js';
            }
        } else {
            d3Uri = 'https://d3js.org/d3.v7.min.js';
        }

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Code Graph</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            margin: 0;
            padding: 20px;
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
        }
        .graph-container {
            width: 100%;
            height: 600px;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            overflow: hidden;
        }
        .node {
            cursor: pointer;
            stroke: var(--vscode-panel-border);
            stroke-width: 2px;
        }
        .node.function { fill: #4CAF50; }
        .node.class { fill: #2196F3; }
        .node.variable { fill: #FF9800; }
        .node.import { fill: #9C27B0; }
        .node.export { fill: #F44336; }
        .link {
            stroke: var(--vscode-panel-border);
            stroke-width: 1px;
            opacity: 0.6;
        }
        .label {
            font-size: 12px;
            font-family: monospace;
            fill: var(--vscode-editor-foreground);
            text-anchor: middle;
            dominant-baseline: central;
        }
        .tooltip {
            position: absolute;
            background: var(--vscode-editor-hoverHighlightBackground);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            padding: 8px;
            font-size: 12px;
            pointer-events: none;
            z-index: 1000;
        }
    </style>
</head>
<body>
    <h1>Code Graph</h1>
    <div class="graph-container">
        <svg id="graph-svg" width="100%" height="100%"></svg>
    </div>
    <div id="tooltip" class="tooltip" style="display: none;"></div>
    <div id="loading" style="text-align: center; margin-top: 50px; color: var(--vscode-descriptionForeground);">Loading graph visualization...</div>

    <script src="${d3Uri}"></script>
    <script>
        const vscode = acquireVsCodeApi();

        // Error handling
        window.addEventListener('error', (event) => {
            vscode.postMessage({
                command: 'error',
                error: event.error.message
            });
        });

        const nodes = ${nodesJson};
        const edges = ${edgesJson};

        // Check if D3 is loaded
        if (typeof d3 === 'undefined') {
            vscode.postMessage({
                command: 'error',
                error: 'D3.js failed to load'
            });
            document.body.innerHTML = '<div class="error-message">Failed to load D3.js visualization library. Please check your internet connection or install D3.js locally.</div>';
            return;
        }

        // Hide loading message
        document.getElementById('loading').style.display = 'none';

        const svg = d3.select('#graph-svg');
        const width = svg.node().clientWidth;
        const height = svg.node().clientHeight;

        // Create zoom behavior
        const zoom = d3.zoom()
            .scaleExtent([0.1, 4])
            .on('zoom', (event) => {
                container.attr('transform', event.transform);
            });

        svg.call(zoom);

        // Create container for zoomable content
        const container = svg.append('g');

        // Enhanced force-directed layout
        const simulation = d3.forceSimulation(nodes)
            .force('link', d3.forceLink(edges).id(d => d.id).distance(100))
            .force('charge', d3.forceManyBody().strength(-400))
            .force('center', d3.forceCenter(width / 2, height / 2))
            .force('collision', d3.forceCollide().radius(30));

        // Create links
        const link = container.append('g')
            .attr('class', 'links')
            .selectAll('line')
            .data(edges)
            .enter().append('line')
            .attr('class', d => 'link ' + d.type)
            .attr('stroke-width', 2)
            .on('mouseover', function(event, d) {
                showTooltip(event, \`\${d.type}: \${d.from} → \${d.to}\`);
                d3.select(this).attr('stroke-width', 4);
            })
            .on('mouseout', function() {
                hideTooltip();
                d3.select(this).attr('stroke-width', 2);
            });

        // Create nodes
        const node = container.append('g')
            .attr('class', 'nodes')
            .selectAll('circle')
            .data(nodes)
            .enter().append('circle')
            .attr('class', d => 'node ' + d.type)
            .attr('r', d => d.type === 'class' ? 25 : 20)
            .call(d3.drag()
                .on('start', dragstarted)
                .on('drag', dragged)
                .on('end', dragended))
            .on('mouseover', function(event, d) {
                const tooltip = \`\${d.type}: \${d.name}\\nFile: \${d.file}\\nLine: \${d.line}\`;
                showTooltip(event, tooltip);
                d3.select(this).attr('r', d => (d.type === 'class' ? 25 : 20) + 5);
            })
            .on('mouseout', function(event, d) {
                hideTooltip();
                d3.select(this).attr('r', d => d.type === 'class' ? 25 : 20);
            });

        // Create labels
        let labelsVisible = true;
        const label = container.append('g')
            .attr('class', 'labels')
            .selectAll('text')
            .data(nodes)
            .enter().append('text')
            .attr('class', 'label')
            .text(d => d.name.length > 12 ? d.name.substring(0, 12) + '...' : d.name)
            .attr('font-size', '11px');

        simulation.on('tick', () => {
            link
                .attr('x1', d => d.source.x)
                .attr('y1', d => d.source.y)
                .attr('x2', d => d.target.x)
                .attr('y2', d => d.target.y);

            node
                .attr('cx', d => d.x)
                .attr('cy', d => d.y);

            label
                .attr('x', d => d.x)
                .attr('y', d => d.y);
        });

        function dragstarted(event, d) {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
        }

        function dragged(event, d) {
            d.fx = event.x;
            d.fy = event.y;
        }

        function dragended(event, d) {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
        }

        // Tooltip functions
        function showTooltip(event, text) {
            const tooltip = document.getElementById('tooltip');
            tooltip.innerHTML = text.replace(/\\n/g, '<br>');
            tooltip.style.display = 'block';
            tooltip.style.left = (event.pageX + 10) + 'px';
            tooltip.style.top = (event.pageY - 10) + 'px';
        }

        function hideTooltip() {
            document.getElementById('tooltip').style.display = 'none';
        }

        // Control functions
        window.resetZoom = function() {
            svg.transition().duration(750).call(
                zoom.transform,
                d3.zoomIdentity
            );
        };

        window.toggleLabels = function() {
            labelsVisible = !labelsVisible;
            label.style('display', labelsVisible ? 'block' : 'none');
        };

        window.fitToScreen = function() {
            const bounds = container.node().getBBox();
            const fullWidth = svg.node().clientWidth;
            const fullHeight = svg.node().clientHeight;
            const width = bounds.width;
            const height = bounds.height;
            const midX = bounds.x + width / 2;
            const midY = bounds.y + height / 2;
            if (width == 0 || height == 0) return;
            const scale = Math.min(fullWidth / width, fullHeight / height) * 0.9;
            const translate = [fullWidth / 2 - scale * midX, fullHeight / 2 - scale * midY];

            svg.transition().duration(750).call(
                zoom.transform,
                d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale)
            );
        };

        window.exportSVG = function() {
            const svgData = new XMLSerializer().serializeToString(svg.node());
            const blob = new Blob([svgData], {type: 'image/svg+xml'});
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'code-graph.svg';
            link.click();
            URL.revokeObjectURL(url);
        };

        // Add click handlers
        node.on('click', (event, d) => {
            vscode.postMessage({
                command: 'openFile',
                file: d.file,
                line: d.line
            });
        });

        // Auto-fit on load
        setTimeout(() => {
            if (nodes.length > 0) {
                window.fitToScreen();
            }
        }, 1000);

        } // Close D3 check
    </script>
</body>
</html>`;
    }

    private findFunctionCalls(node: CodeNode, nodes: CodeNode[], content: string, edges: CodeEdge[]): void {
        nodes.forEach(targetNode => {
            if (targetNode.type === 'function' && targetNode.name !== node.name) {
                const callPattern = new RegExp(`\\b${this.escapeRegex(targetNode.name)}\\s*\\(`, 'g');
                let match;
                while ((match = callPattern.exec(content)) !== null) {
                    const lineNumber = content.substring(0, match.index).split('\n').length;
                    edges.push({
                        from: node.id,
                        to: targetNode.id,
                        type: 'calls',
                        line: lineNumber
                    });
                }
            }
        });
    }

    private findClassRelationships(node: CodeNode, nodes: CodeNode[], content: string, edges: CodeEdge[]): void {
        nodes.forEach(targetNode => {
            if (targetNode.type === 'class' && targetNode.name !== node.name) {
                // Check for inheritance
                const extendsPattern = new RegExp(
                    `class\\s+${this.escapeRegex(node.name)}\\s+extends\\s+${this.escapeRegex(targetNode.name)}\\b`
                );
                if (extendsPattern.test(content)) {
                    edges.push({
                        from: node.id,
                        to: targetNode.id,
                        type: 'extends',
                        line: node.line
                    });
                }

                // Check for implementation
                const implementsPattern = new RegExp(
                    `class\\s+${this.escapeRegex(node.name)}\\s+implements\\s+[^{]*\\b${this.escapeRegex(targetNode.name)}\\b`
                );
                if (implementsPattern.test(content)) {
                    edges.push({
                        from: node.id,
                        to: targetNode.id,
                        type: 'implements',
                        line: node.line
                    });
                }
            }
        });
    }

    private findImportDependencies(node: CodeNode, nodes: CodeNode[], content: string, edges: CodeEdge[]): void {
        nodes.forEach(targetNode => {
            if (targetNode.type !== 'import' && targetNode.name) {
                const usagePattern = new RegExp(`\\b${this.escapeRegex(targetNode.name)}\\b`, 'g');
                if (usagePattern.test(content)) {
                    edges.push({
                        from: node.id,
                        to: targetNode.id,
                        type: 'provides',
                        line: node.line
                    });
                }
            }
        });
    }

    private findPythonFunctionCalls(node: CodeNode, nodes: CodeNode[], content: string, edges: CodeEdge[]): void {
        nodes.forEach(targetNode => {
            if (targetNode.type === 'function' && targetNode.name !== node.name) {
                const callPattern = new RegExp(`\\b${this.escapeRegex(targetNode.name)}\\s*\\(`, 'g');
                let match;
                while ((match = callPattern.exec(content)) !== null) {
                    edges.push({
                        from: node.id,
                        to: targetNode.id,
                        type: 'calls',
                        line: content.substring(0, match.index).split('\n').length
                    });
                }
            }
        });
    }

    private findPythonClassRelationships(node: CodeNode, nodes: CodeNode[], content: string, edges: CodeEdge[]): void {
        nodes.forEach(targetNode => {
            if (targetNode.type === 'class' && targetNode.name !== node.name) {
                const inheritancePattern = new RegExp(
                    `class\\s+${this.escapeRegex(node.name)}\\s*\\([^)]*\\b${this.escapeRegex(targetNode.name)}\\b[^)]*\\):`
                );
                if (inheritancePattern.test(content)) {
                    edges.push({
                        from: node.id,
                        to: targetNode.id,
                        type: 'inherits',
                        line: node.line
                    });
                }
            }
        });
    }

    private findPythonImportDependencies(node: CodeNode, nodes: CodeNode[], content: string, edges: CodeEdge[]): void {
        nodes.forEach(targetNode => {
            if (targetNode.type !== 'import' && targetNode.name) {
                const usagePattern = new RegExp(`\\b${this.escapeRegex(targetNode.name)}\\b`, 'g');
                if (usagePattern.test(content)) {
                    edges.push({
                        from: node.id,
                        to: targetNode.id,
                        type: 'provides',
                        line: node.line
                    });
                }
            }
        });
    }

    private escapeRegex(string: string): string {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}