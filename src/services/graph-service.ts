import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

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
    type: 'calls' | 'imports' | 'extends' | 'implements' | 'uses';
    line?: number;
}

export class GraphService {
    private static readonly SUPPORTED_LANGUAGES = ['typescript', 'javascript', 'python'];

    public async generateGraph(filePath: string, position?: vscode.Position): Promise<CodeGraph | null> {
        try {
            const language = this.detectLanguage(filePath);
            if (!language || !GraphService.SUPPORTED_LANGUAGES.includes(language)) {
                return null;
            }

            const content = fs.readFileSync(filePath, 'utf-8');
            const nodes = await this.parseCode(content, filePath, language);
            const edges = await this.buildEdges(nodes, content, language);

            return { nodes, edges };
        } catch (error) {
            console.error('Failed to generate code graph:', error);
            return null;
        }
    }

    public async showGraphView(graph: CodeGraph): Promise<void> {
        const panel = vscode.window.createWebviewPanel(
            'flowcodeGraph',
            'Code Graph',
            vscode.ViewColumn.Two,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        panel.webview.html = this.getWebviewContent(graph);
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
        
        // Simple edge detection based on function calls and imports
        nodes.forEach(node => {
            if (node.type === 'function') {
                // Find calls to other functions
                nodes.forEach(targetNode => {
                    if (targetNode.type === 'function' && targetNode.name !== node.name) {
                        const callPattern = new RegExp(`\\b${targetNode.name}\\s*\\(`, 'g');
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
                        const usagePattern = new RegExp(`\\b${targetNode.name}\\b`, 'g');
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
        
        return edges;
    }

    private getWebviewContent(graph: CodeGraph): string {
        const nodesJson = JSON.stringify(graph.nodes);
        const edgesJson = JSON.stringify(graph.edges);

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

    <script>
        const nodes = ${nodesJson};
        const edges = ${edgesJson};

        const svg = document.getElementById('graph-svg');
        const width = svg.clientWidth;
        const height = svg.clientHeight;

        // Simple force-directed layout
        const simulation = d3.forceSimulation(nodes)
            .force('link', d3.forceLink(edges).id(d => d.id))
            .force('charge', d3.forceManyBody().strength(-300))
            .force('center', d3.forceCenter(width / 2, height / 2));

        const link = svg.append('g')
            .selectAll('line')
            .data(edges)
            .enter().append('line')
            .attr('class', 'link');

        const node = svg.append('g')
            .selectAll('circle')
            .data(nodes)
            .enter().append('circle')
            .attr('class', d => 'node ' + d.type)
            .attr('r', 20)
            .call(d3.drag()
                .on('start', dragstarted)
                .on('drag', dragged)
                .on('end', dragended));

        const label = svg.append('g')
            .selectAll('text')
            .data(nodes)
            .enter().append('text')
            .attr('class', 'label')
            .text(d => d.name.length > 10 ? d.name.substring(0, 10) + '...' : d.name);

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

        // Add click handlers
        node.on('click', (event, d) => {
            vscode.postMessage({
                command: 'openFile',
                file: d.file,
                line: d.line
            });
        });
    </script>
</body>
</html>`;
    }
}