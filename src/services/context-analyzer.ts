import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { logger } from '../utils/logger';
import { ContextItem } from './context-compression-service';

/**
 * Context analysis configuration
 */
export interface ContextAnalysisConfig {
    maxFiles: number;
    maxFileSize: number; // in bytes
    includeTests: boolean;
    includeDocumentation: boolean;
    includeDependencies: boolean;
    fileExtensions: string[];
    excludePatterns: string[];
    importanceWeights: {
        activeFile: number;
        recentFiles: number;
        dependencies: number;
        tests: number;
        documentation: number;
    };
}

/**
 * File analysis result
 */
export interface FileAnalysis {
    path: string;
    size: number;
    language: string;
    importance: number;
    symbols: string[];
    imports: string[];
    exports: string[];
    dependencies: string[];
    isTest: boolean;
    isDocumentation: boolean;
    lastModified: number;
}

/**
 * Context analysis result
 */
export interface ContextAnalysisResult {
    items: ContextItem[];
    totalSize: number;
    fileCount: number;
    analysisTime: number;
    metadata: {
        activeFile?: string;
        workspaceRoot?: string;
        selectedText?: string;
        userQuery?: string;
        timestamp: number;
    };
}

/**
 * Context Analyzer Service
 * 
 * Analyzes the codebase to gather relevant context for AI interactions.
 * Identifies important files, symbols, and dependencies based on the current task.
 */
export class ContextAnalyzer {
    private readonly contextLogger = logger.createContextLogger('ContextAnalyzer');
    private readonly defaultConfig: ContextAnalysisConfig;

    constructor() {
        this.defaultConfig = {
            maxFiles: 50,
            maxFileSize: 100 * 1024, // 100KB
            includeTests: true,
            includeDocumentation: true,
            includeDependencies: true,
            fileExtensions: [
                '.ts', '.js', '.tsx', '.jsx',
                '.py', '.java', '.cs', '.cpp', '.c',
                '.go', '.rs', '.php', '.rb',
                '.md', '.json', '.yaml', '.yml'
            ],
            excludePatterns: [
                'node_modules/**',
                '.git/**',
                'dist/**',
                'build/**',
                '*.min.js',
                '*.bundle.js'
            ],
            importanceWeights: {
                activeFile: 1.0,
                recentFiles: 0.8,
                dependencies: 0.6,
                tests: 0.4,
                documentation: 0.3
            }
        };

        this.contextLogger.info('ContextAnalyzer initialized');
    }

    /**
     * Analyze context for the current workspace and task
     */
    public async analyzeContext(
        userQuery?: string,
        config?: Partial<ContextAnalysisConfig>
    ): Promise<ContextAnalysisResult> {
        const startTime = Date.now();
        const analysisConfig = { ...this.defaultConfig, ...config };

        try {
            this.contextLogger.info('Starting context analysis', {
                userQuery: userQuery?.substring(0, 100),
                maxFiles: analysisConfig.maxFiles
            });

            const items: ContextItem[] = [];
            const metadata = {
                activeFile: vscode.window.activeTextEditor?.document.fileName,
                workspaceRoot: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
                selectedText: this.getSelectedText(),
                userQuery,
                timestamp: Date.now()
            };

            // 1. Add active file context
            if (metadata.activeFile) {
                const activeFileItem = await this.analyzeFile(metadata.activeFile, analysisConfig.importanceWeights.activeFile);
                if (activeFileItem) {
                    items.push(activeFileItem);
                }
            }

            // 2. Add selected text context
            if (metadata.selectedText) {
                items.push({
                    id: 'selected-text',
                    type: 'selection',
                    content: metadata.selectedText,
                    importance: 0.9,
                    size: this.estimateTokenCount(metadata.selectedText),
                    metadata: { source: 'user-selection' }
                });
            }

            // 3. Add recent files context
            const recentFiles = await this.getRecentFiles(analysisConfig);
            for (const filePath of recentFiles) {
                if (filePath !== metadata.activeFile) {
                    const fileItem = await this.analyzeFile(filePath, analysisConfig.importanceWeights.recentFiles);
                    if (fileItem) {
                        items.push(fileItem);
                    }
                }
            }

            // 4. Add dependency context
            if (analysisConfig.includeDependencies && metadata.activeFile) {
                const dependencies = await this.findDependencies(metadata.activeFile);
                for (const depPath of dependencies) {
                    const depItem = await this.analyzeFile(depPath, analysisConfig.importanceWeights.dependencies);
                    if (depItem) {
                        items.push(depItem);
                    }
                }
            }

            // 5. Add workspace files based on relevance
            if (metadata.workspaceRoot) {
                const relevantFiles = await this.findRelevantFiles(
                    metadata.workspaceRoot,
                    userQuery,
                    analysisConfig
                );
                
                for (const filePath of relevantFiles) {
                    if (!items.some(item => item.path === filePath)) {
                        const fileItem = await this.analyzeFile(filePath, 0.5);
                        if (fileItem) {
                            items.push(fileItem);
                        }
                    }
                }
            }

            // Sort by importance and limit count
            items.sort((a, b) => b.importance - a.importance);
            const limitedItems = items.slice(0, analysisConfig.maxFiles);

            const totalSize = limitedItems.reduce((sum, item) => sum + item.size, 0);
            const analysisTime = Date.now() - startTime;

            this.contextLogger.info('Context analysis completed', {
                itemCount: limitedItems.length,
                totalSize,
                analysisTime
            });

            return {
                items: limitedItems,
                totalSize,
                fileCount: limitedItems.filter(item => item.type === 'file').length,
                analysisTime,
                metadata
            };

        } catch (error) {
            this.contextLogger.error('Context analysis failed', error as Error);
            throw new Error(`Context analysis failed: ${(error as Error).message}`);
        }
    }

    /**
     * Analyze a single file and create context item
     */
    private async analyzeFile(filePath: string, baseImportance: number): Promise<ContextItem | null> {
        try {
            if (!fs.existsSync(filePath)) {
                return null;
            }

            const stats = fs.statSync(filePath);
            if (stats.size > this.defaultConfig.maxFileSize) {
                this.contextLogger.debug(`Skipping large file: ${filePath} (${stats.size} bytes)`);
                return null;
            }

            const content = fs.readFileSync(filePath, 'utf-8');
            const analysis = await this.analyzeFileContent(filePath, content);
            
            // Calculate importance based on various factors
            const importance = this.calculateFileImportance(analysis, baseImportance);

            return {
                id: `file:${filePath}`,
                type: 'file',
                content,
                path: filePath,
                importance,
                size: this.estimateTokenCount(content),
                metadata: {
                    language: analysis.language,
                    symbols: analysis.symbols,
                    imports: analysis.imports,
                    exports: analysis.exports,
                    isTest: analysis.isTest,
                    isDocumentation: analysis.isDocumentation,
                    lastModified: analysis.lastModified
                }
            };

        } catch (error) {
            this.contextLogger.warn(`Failed to analyze file: ${filePath}`, error as Error);
            return null;
        }
    }

    /**
     * Analyze file content to extract metadata
     */
    private async analyzeFileContent(filePath: string, content: string): Promise<FileAnalysis> {
        const ext = path.extname(filePath);
        const language = this.getLanguageFromExtension(ext);
        
        // Basic symbol extraction (can be enhanced with proper parsers)
        const symbols = this.extractSymbols(content, language);
        const imports = this.extractImports(content, language);
        const exports = this.extractExports(content, language);
        
        const isTest = this.isTestFile(filePath);
        const isDocumentation = this.isDocumentationFile(filePath);
        
        const stats = fs.statSync(filePath);

        return {
            path: filePath,
            size: content.length,
            language,
            importance: 0,
            symbols,
            imports,
            exports,
            dependencies: [], // Will be populated by dependency analysis
            isTest,
            isDocumentation,
            lastModified: stats.mtime.getTime()
        };
    }

    /**
     * Calculate file importance based on various factors
     */
    private calculateFileImportance(analysis: FileAnalysis, baseImportance: number): number {
        let importance = baseImportance;

        // Boost importance for files with many symbols
        importance += Math.min(analysis.symbols.length * 0.01, 0.2);

        // Boost importance for recently modified files
        const daysSinceModified = (Date.now() - analysis.lastModified) / (1000 * 60 * 60 * 24);
        if (daysSinceModified < 1) importance += 0.1;
        else if (daysSinceModified < 7) importance += 0.05;

        // Reduce importance for test files and documentation
        if (analysis.isTest) importance *= 0.7;
        if (analysis.isDocumentation) importance *= 0.5;

        // Boost importance for files with many exports (likely important modules)
        importance += Math.min(analysis.exports.length * 0.02, 0.15);

        return Math.min(importance, 1.0);
    }

    /**
     * Get selected text from active editor
     */
    private getSelectedText(): string | undefined {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.selection.isEmpty) {
            return undefined;
        }
        return editor.document.getText(editor.selection);
    }

    /**
     * Get recently opened files
     */
    private async getRecentFiles(config: ContextAnalysisConfig): Promise<string[]> {
        // This would integrate with VS Code's recent files API
        // For now, return empty array - can be enhanced
        return [];
    }

    /**
     * Find dependencies for a file
     */
    private async findDependencies(filePath: string): Promise<string[]> {
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const imports = this.extractImports(content, this.getLanguageFromExtension(path.extname(filePath)));
            
            const dependencies: string[] = [];
            const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            
            if (!workspaceRoot) return dependencies;

            for (const importPath of imports) {
                // Resolve relative imports to absolute paths
                if (importPath.startsWith('.')) {
                    const resolvedPath = path.resolve(path.dirname(filePath), importPath);
                    const possibleExtensions = ['.ts', '.js', '.tsx', '.jsx'];
                    
                    for (const ext of possibleExtensions) {
                        const fullPath = resolvedPath + ext;
                        if (fs.existsSync(fullPath)) {
                            dependencies.push(fullPath);
                            break;
                        }
                    }
                }
            }

            return dependencies;

        } catch (error) {
            this.contextLogger.warn(`Failed to find dependencies for: ${filePath}`, error as Error);
            return [];
        }
    }

    /**
     * Find relevant files in workspace
     */
    private async findRelevantFiles(
        workspaceRoot: string,
        userQuery: string | undefined,
        config: ContextAnalysisConfig
    ): Promise<string[]> {
        // This would implement intelligent file discovery based on query
        // For now, return empty array - can be enhanced with fuzzy search, etc.
        return [];
    }

    /**
     * Extract symbols from code content
     */
    private extractSymbols(content: string, language: string): string[] {
        const symbols: string[] = [];
        
        // Basic regex patterns for common languages
        const patterns: Record<string, RegExp[]> = {
            typescript: [
                /(?:class|interface|enum|type)\s+(\w+)/g,
                /(?:function|const|let|var)\s+(\w+)/g,
                /(\w+)\s*:/g // Object properties
            ],
            javascript: [
                /(?:class|function|const|let|var)\s+(\w+)/g,
                /(\w+)\s*:/g
            ],
            python: [
                /(?:class|def)\s+(\w+)/g
            ]
        };

        const langPatterns = patterns[language] || patterns.typescript;

        if (langPatterns) {
            for (const pattern of langPatterns) {
            let match;
            while ((match = pattern.exec(content)) !== null) {
                if (match[1] && !symbols.includes(match[1])) {
                    symbols.push(match[1]);
                }
            }
        }
        }

        return symbols;
    }

    /**
     * Extract imports from code content
     */
    private extractImports(content: string, language: string): string[] {
        const imports: string[] = [];
        
        const patterns: Record<string, RegExp[]> = {
            typescript: [
                /import.*from\s+['"]([^'"]+)['"]/g,
                /import\s+['"]([^'"]+)['"]/g
            ],
            javascript: [
                /import.*from\s+['"]([^'"]+)['"]/g,
                /require\(['"]([^'"]+)['"]\)/g
            ],
            python: [
                /from\s+(\w+(?:\.\w+)*)\s+import/g,
                /import\s+(\w+(?:\.\w+)*)/g
            ]
        };

        const langPatterns = patterns[language] || patterns.typescript;

        if (langPatterns) {
            for (const pattern of langPatterns) {
                let match;
                while ((match = pattern.exec(content)) !== null) {
                    if (match[1] && !imports.includes(match[1])) {
                        imports.push(match[1]);
                    }
                }
            }
        }

        return imports;
    }

    /**
     * Extract exports from code content
     */
    private extractExports(content: string, language: string): string[] {
        const exports: string[] = [];
        
        const patterns: Record<string, RegExp[]> = {
            typescript: [
                /export\s+(?:class|interface|enum|type|function|const|let|var)\s+(\w+)/g,
                /export\s*{\s*([^}]+)\s*}/g
            ],
            javascript: [
                /export\s+(?:class|function|const|let|var)\s+(\w+)/g,
                /module\.exports\s*=\s*(\w+)/g
            ]
        };

        const langPatterns = patterns[language] || patterns.typescript;

        if (langPatterns) {
            for (const pattern of langPatterns) {
                let match;
                while ((match = pattern.exec(content)) !== null) {
                    if (match[1]) {
                        // Handle export lists
                        if (match[1].includes(',')) {
                            const exportList = match[1].split(',').map(e => e.trim());
                            exports.push(...exportList);
                        } else if (!exports.includes(match[1])) {
                            exports.push(match[1]);
                        }
                    }
                }
            }
        }

        return exports;
    }

    /**
     * Get language from file extension
     */
    private getLanguageFromExtension(ext: string): string {
        const languageMap: Record<string, string> = {
            '.ts': 'typescript',
            '.tsx': 'typescript',
            '.js': 'javascript',
            '.jsx': 'javascript',
            '.py': 'python',
            '.java': 'java',
            '.cs': 'csharp',
            '.cpp': 'cpp',
            '.c': 'c',
            '.go': 'go',
            '.rs': 'rust',
            '.php': 'php',
            '.rb': 'ruby'
        };

        return languageMap[ext] || 'text';
    }

    /**
     * Check if file is a test file
     */
    private isTestFile(filePath: string): boolean {
        const fileName = path.basename(filePath).toLowerCase();
        return fileName.includes('test') || 
               fileName.includes('spec') || 
               filePath.includes('/test/') || 
               filePath.includes('/__tests__/');
    }

    /**
     * Check if file is documentation
     */
    private isDocumentationFile(filePath: string): boolean {
        const ext = path.extname(filePath).toLowerCase();
        return ext === '.md' || 
               ext === '.txt' || 
               filePath.includes('/docs/') ||
               filePath.includes('/documentation/');
    }

    /**
     * Estimate token count for text
     */
    private estimateTokenCount(text: string): number {
        // Rough estimation: ~4 characters per token
        return Math.ceil(text.length / 4);
    }
}
