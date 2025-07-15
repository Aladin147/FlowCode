# FlowCode API Reference

This document provides a comprehensive reference for FlowCode's internal APIs, services, and extension points.

## Core Services

### ConfigurationManager

Manages FlowCode configuration and settings.

```typescript
class ConfigurationManager {
    /**
     * Get the current workspace root directory
     */
    getWorkspaceRoot(): Promise<string>

    /**
     * Get API configuration for AI services
     */
    getApiConfiguration(): Promise<{
        provider: 'openai' | 'anthropic';
        apiKey: string;
        maxTokens: number;
        hasApiKey: boolean;
    }>

    /**
     * Check if a valid API key is configured
     */
    hasValidApiKey(): Promise<boolean>

    /**
     * Set API configuration
     */
    setApiConfiguration(provider: 'openai' | 'anthropic', apiKey: string): Promise<void>

    /**
     * Get debt file path for hotfix tracking
     */
    getDebtFilePath(): Promise<string>

    /**
     * Check if CompanionGuard is enabled
     */
    isCompanionGuardEnabled(): Promise<boolean>

    /**
     * Check if FinalGuard is enabled
     */
    isFinalGuardEnabled(): Promise<boolean>

    /**
     * Update configuration
     */
    updateConfiguration(key: string, value: any, target?: ConfigurationTarget): Promise<void>

    /**
     * Validate configuration
     */
    validateConfiguration(): Promise<ValidationResult>
}
```

### CompanionGuard

Real-time code quality monitoring service.

```typescript
class CompanionGuard {
    /**
     * Initialize the companion guard
     */
    initialize(): Promise<void>

    /**
     * Start monitoring a document
     */
    startMonitoring(document: vscode.TextDocument): void

    /**
     * Stop monitoring a document
     */
    stopMonitoring(document: vscode.TextDocument): void

    /**
     * Perform quality check on document
     */
    checkQuality(document: vscode.TextDocument): Promise<QualityResult>

    /**
     * Get current monitoring status
     */
    getMonitoringStatus(): MonitoringStatus

    /**
     * Configure quality rules
     */
    configureRules(rules: QualityRule[]): void
}

interface QualityResult {
    document: vscode.TextDocument;
    issues: QualityIssue[];
    metrics: QualityMetrics;
    suggestions: string[];
    timestamp: number;
}

interface QualityIssue {
    severity: 'error' | 'warning' | 'info';
    message: string;
    range: vscode.Range;
    code?: string;
    source: string;
    fixable: boolean;
}
```

### ArchitectService

AI-powered code generation and refactoring service.

```typescript
class ArchitectService {
    /**
     * Generate code from natural language description
     */
    generateCode(request: CodeGenerationRequest): Promise<CodeGenerationResult>

    /**
     * Refactor existing code
     */
    refactorCode(request: RefactoringRequest): Promise<RefactoringResult>

    /**
     * Analyze code and provide insights
     */
    analyzeCode(request: AnalysisRequest): Promise<AnalysisResult>

    /**
     * Get available AI models
     */
    getAvailableModels(): Promise<AIModel[]>

    /**
     * Test API connection
     */
    testConnection(): Promise<ConnectionResult>
}

interface CodeGenerationRequest {
    description: string;
    language: string;
    context?: {
        filePath: string;
        existingCode: string;
        imports: string[];
    };
    options?: {
        style: 'functional' | 'object-oriented';
        includeTests: boolean;
        includeDocumentation: boolean;
    };
}

interface CodeGenerationResult {
    success: boolean;
    code: string;
    explanation: string;
    suggestions: string[];
    confidence: number;
    tokensUsed: number;
}
```

### SecurityValidatorService

Security auditing and validation service.

```typescript
class SecurityValidatorService {
    /**
     * Initialize the security validator service
     */
    initialize(): Promise<void>

    /**
     * Run comprehensive security audit
     */
    runSecurityAudit(workspaceRoot: string): Promise<SecurityAuditResult>

    /**
     * Generate security report from audit results
     */
    generateSecurityReport(auditResult: SecurityAuditResult): string

    /**
     * Validate input for security issues
     */
    validateInput(input: string, context: ValidationContext): ValidationResult

    /**
     * Scan for secrets and sensitive data
     */
    scanForSecrets(content: string): Promise<SecretScanResult>

    /**
     * Check dependencies for vulnerabilities
     */
    checkDependencies(packageFile: string): Promise<DependencyAuditResult>

    /**
     * Get security recommendations
     */
    getSecurityRecommendations(auditResult: SecurityAuditResult): SecurityRecommendation[]
}

interface SecurityAuditResult {
    overallScore: number;
    results: SecurityCheckResult[];
    vulnerabilities: Vulnerability[];
    recommendations: SecurityRecommendation[];
    timestamp: number;
    platform: string;
}

interface Vulnerability {
    id: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
    title: string;
    description: string;
    file: string;
    line: number;
    cwe?: string;
    fix?: string;
}
```

### HotfixService

Emergency hotfix management service.

```typescript
class HotfixService {
    /**
     * Create a new hotfix
     */
    createHotfix(description: string): Promise<HotfixResult>

    /**
     * Get all pending hotfixes
     */
    getPendingHotfixes(): Promise<HotfixRecord[]>

    /**
     * Resolve a hotfix
     */
    resolveHotfix(hotfixId: string, resolution: HotfixResolution): Promise<void>

    /**
     * Get hotfix statistics
     */
    getHotfixStatistics(): Promise<HotfixStatistics>

    /**
     * Check for overdue hotfixes
     */
    checkOverdueHotfixes(): Promise<HotfixRecord[]>
}

interface HotfixRecord {
    id: string;
    description: string;
    branchName: string;
    createdAt: number;
    deadline: number;
    status: 'pending' | 'resolved' | 'overdue';
    priority: 'low' | 'medium' | 'high' | 'critical';
    assignee?: string;
}

interface HotfixResult {
    success: boolean;
    hotfixId: string;
    branchName: string;
    message: string;
}
```

### GraphService

Code dependency visualization service.

```typescript
class GraphService {
    /**
     * Generate dependency graph for workspace
     */
    generateDependencyGraph(workspaceRoot: string): Promise<DependencyGraph>

    /**
     * Analyze code relationships
     */
    analyzeRelationships(filePath: string): Promise<RelationshipAnalysis>

    /**
     * Find circular dependencies
     */
    findCircularDependencies(graph: DependencyGraph): CircularDependency[]

    /**
     * Get impact analysis for changes
     */
    getImpactAnalysis(filePath: string, changes: Change[]): Promise<ImpactAnalysis>

    /**
     * Export graph in various formats
     */
    exportGraph(graph: DependencyGraph, format: 'json' | 'svg' | 'png'): Promise<string>
}

interface DependencyGraph {
    nodes: GraphNode[];
    edges: GraphEdge[];
    metadata: GraphMetadata;
}

interface GraphNode {
    id: string;
    label: string;
    type: 'file' | 'function' | 'class' | 'module';
    filePath: string;
    properties: { [key: string]: any };
}
```

## Utility Classes

### PerformanceMonitor

Performance monitoring and optimization utilities.

```typescript
class PerformanceMonitor {
    /**
     * Start timing an operation
     */
    startTimer(operationName: string): void

    /**
     * End timing an operation
     */
    endTimer(operationName: string): number

    /**
     * Record a metric
     */
    recordMetric(name: string, value: number): void

    /**
     * Get performance metrics
     */
    getMetrics(): { [name: string]: number }

    /**
     * Get performance report
     */
    generateReport(): PerformanceReport

    /**
     * Clear metrics
     */
    clearMetrics(): void
}

interface PerformanceReport {
    timestamp: number;
    metrics: { [name: string]: number };
    averages: { [name: string]: number };
    trends: { [name: string]: number[] };
    recommendations: string[];
}
```

### Logger

Centralized logging system.

```typescript
class Logger {
    /**
     * Create a context logger
     */
    createContextLogger(context: string): ContextLogger

    /**
     * Set log level
     */
    setLogLevel(level: 'debug' | 'info' | 'warn' | 'error'): void

    /**
     * Get log entries
     */
    getLogEntries(filter?: LogFilter): LogEntry[]

    /**
     * Clear logs
     */
    clearLogs(): void
}

interface ContextLogger {
    debug(message: string, data?: any): void;
    info(message: string, data?: any): void;
    warn(message: string, data?: any): void;
    error(message: string, error?: Error, data?: any): void;
}
```

### InputValidator

Input validation and sanitization utilities.

```typescript
class InputValidator {
    /**
     * Validate file path
     */
    static validateFilePath(path: string): ValidationResult

    /**
     * Validate email address
     */
    static validateEmail(email: string): ValidationResult

    /**
     * Validate URL
     */
    static validateUrl(url: string): ValidationResult

    /**
     * Sanitize HTML input
     */
    static sanitizeHtml(html: string): string

    /**
     * Validate JSON
     */
    static validateJson(json: string): ValidationResult

    /**
     * Check for SQL injection
     */
    static checkSqlInjection(input: string): ValidationResult
}

interface ValidationResult {
    isValid: boolean;
    errors: string[];
    warnings: string[];
    securityScore: number;
}
```

## Extension Points

### Custom Security Rules

Extend FlowCode's security validation with custom rules.

```typescript
interface SecurityRule {
    id: string;
    name: string;
    description: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    pattern: RegExp | string;
    languages: string[];
    check: (content: string, context: SecurityContext) => SecurityViolation[];
}

interface SecurityContext {
    filePath: string;
    language: string;
    imports: string[];
    functions: FunctionInfo[];
}

interface SecurityViolation {
    line: number;
    column: number;
    message: string;
    fix?: string;
}
```

### Custom AI Providers

Add support for additional AI providers.

```typescript
interface AIProvider {
    name: string;
    displayName: string;
    models: AIModel[];
    authenticate: (apiKey: string) => Promise<boolean>;
    generateCode: (request: CodeGenerationRequest) => Promise<CodeGenerationResult>;
    analyzeCode: (request: AnalysisRequest) => Promise<AnalysisResult>;
}

interface AIModel {
    id: string;
    name: string;
    description: string;
    capabilities: ModelCapability[];
    limits: ModelLimits;
}
```

### Custom Quality Metrics

Define custom code quality metrics.

```typescript
interface QualityMetric {
    id: string;
    name: string;
    description: string;
    calculate: (code: string, ast: any) => number;
    threshold: {
        good: number;
        acceptable: number;
        poor: number;
    };
}
```

### ArchitectCommands

AI-powered code generation and refactoring commands.

```typescript
class ArchitectCommands {
    /**
     * Initialize architect commands
     */
    initialize(): Promise<void>

    /**
     * Elevate to architect - main AI refactoring command
     */
    elevateToArchitect(): Promise<void>

    /**
     * Generate code from description
     */
    generateCode(): Promise<void>
}
```

### SecurityCommands

Security audit and scanning commands.

```typescript
class SecurityCommands {
    /**
     * Initialize security commands
     */
    initialize(): Promise<void>

    /**
     * Run security audit command
     */
    runSecurityAudit(): Promise<void>
}
```

## Events and Hooks

### Event System

FlowCode provides an event system for extension and integration.

```typescript
interface FlowCodeEvents {
    'code.generated': (event: CodeGeneratedEvent) => void;
    'security.audit.completed': (event: SecurityAuditEvent) => void;
    'hotfix.created': (event: HotfixCreatedEvent) => void;
    'performance.threshold.exceeded': (event: PerformanceEvent) => void;
    'configuration.changed': (event: ConfigurationChangedEvent) => void;
}

// Subscribe to events
flowcode.on('code.generated', (event) => {
    console.log('Code generated:', event.code);
});

// Emit custom events
flowcode.emit('custom.event', { data: 'value' });
```

### Git Hooks Integration

Integrate with FlowCode's git hook system.

```typescript
interface GitHookHandler {
    name: string;
    hook: 'pre-commit' | 'pre-push' | 'commit-msg';
    priority: number;
    execute: (context: GitHookContext) => Promise<GitHookResult>;
}

interface GitHookContext {
    workspaceRoot: string;
    stagedFiles: string[];
    commitMessage?: string;
    branch: string;
}

interface GitHookResult {
    success: boolean;
    message?: string;
    suggestions?: string[];
}
```

## Configuration Schema

### Extension Settings

Complete configuration schema for FlowCode settings.

```json
{
  "flowcode.ai.provider": {
    "type": "string",
    "enum": ["openai", "anthropic", "google", "azure"],
    "default": "openai",
    "description": "AI service provider"
  },
  "flowcode.ai.model": {
    "type": "string",
    "default": "gpt-4",
    "description": "AI model to use"
  },
  "flowcode.security.enableAuditing": {
    "type": "boolean",
    "default": true,
    "description": "Enable security auditing"
  },
  "flowcode.performance.enableOptimization": {
    "type": "boolean",
    "default": true,
    "description": "Enable performance optimization"
  },
  "flowcode.userExperience.enableQuickActions": {
    "type": "boolean",
    "default": true,
    "description": "Enable quick actions menu"
  }
}
```

## Error Handling

### Error Types

FlowCode defines specific error types for better error handling.

```typescript
class FlowCodeError extends Error {
    constructor(
        message: string,
        public code: string,
        public category: 'user' | 'system' | 'network' | 'configuration',
        public recoverable: boolean = true
    ) {
        super(message);
        this.name = 'FlowCodeError';
    }
}

class APIError extends FlowCodeError {
    constructor(message: string, public statusCode: number) {
        super(message, 'API_ERROR', 'network');
    }
}

class ConfigurationError extends FlowCodeError {
    constructor(message: string, public setting: string) {
        super(message, 'CONFIG_ERROR', 'configuration');
    }
}
```

---

This API reference covers the main interfaces and services in FlowCode. For implementation examples and tutorials, see the [tutorials](tutorials/) directory.
