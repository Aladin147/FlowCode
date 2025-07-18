/**
 * Core Agentic Types for FlowCode V0.2
 * Defines the fundamental interfaces for autonomous coding agent functionality
 */

/**
 * Risk levels for agent actions and tasks
 */
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

/**
 * Task execution status
 */
export type TaskStatus = 
    | 'planning' 
    | 'ready' 
    | 'executing' 
    | 'waiting_approval' 
    | 'paused' 
    | 'completed' 
    | 'failed' 
    | 'cancelled';

/**
 * Step execution status
 */
export type StepStatus = 
    | 'pending' 
    | 'executing' 
    | 'completed' 
    | 'failed' 
    | 'skipped' 
    | 'waiting_approval';

/**
 * Types of actions the agent can perform
 */
export type AgentActionType = 
    | 'analyze_code'
    | 'create_file'
    | 'edit_file'
    | 'delete_file'
    | 'run_command'
    | 'validate_security'
    | 'run_tests'
    | 'commit_changes'
    | 'create_branch'
    | 'refactor_code'
    | 'generate_documentation'
    | 'analyze_dependencies'
    | 'optimize_performance';

/**
 * Validation rules for agent actions
 */
export interface ValidationRule {
    type: 'security' | 'quality' | 'performance' | 'compliance';
    description: string;
    severity: 'error' | 'warning' | 'info';
    validator: string; // Name of the validator service
}

/**
 * Individual action that the agent can perform
 */
export interface AgentAction {
    id: string;
    type: AgentActionType;
    description: string;
    target: string; // File path, command, etc.
    payload: any; // Action-specific data
    validation: ValidationRule[];
    riskLevel: RiskLevel;
    estimatedTime: number; // in milliseconds
    requiresApproval: boolean;
    metadata?: Record<string, any>;
}

/**
 * Individual step within an agentic task
 */
export interface TaskStep {
    id: string;
    action: AgentAction;
    description: string;
    dependencies: string[]; // IDs of steps that must complete first
    status: StepStatus;
    result?: StepResult;
    error?: Error;
    startTime?: number;
    endTime?: number;
    approvalRequired: boolean;
    riskLevel: RiskLevel;
}

/**
 * Result of executing a task step
 */
export interface StepResult {
    success: boolean;
    output?: any;
    changes?: FileChange[];
    validationResults?: ValidationResult[];
    metrics?: PerformanceMetrics;
    warnings?: string[];
    nextSteps?: string[]; // Suggested follow-up actions
}

/**
 * File change made by an agent action
 */
export interface FileChange {
    path: string;
    type: 'create' | 'modify' | 'delete';
    content?: string;
    diff?: string;
    backup?: string; // Backup of original content
}

/**
 * Validation result for an agent action
 */
export interface ValidationResult {
    rule: ValidationRule;
    passed: boolean;
    message: string;
    details?: any;
    suggestions?: string[];
}

/**
 * Performance metrics for agent actions
 */
export interface PerformanceMetrics {
    executionTime: number;
    memoryUsage: number;
    cpuUsage: number;
    networkRequests?: number;
    cacheHits?: number;
}

/**
 * High-level agentic task representing a user goal
 */
export interface AgenticTask {
    id: string;
    goal: string; // Natural language description of what user wants
    description: string; // Detailed breakdown of the task
    steps: TaskStep[];
    status: TaskStatus;
    priority: 'low' | 'medium' | 'high' | 'urgent';
    riskLevel: RiskLevel;
    estimatedDuration: number; // in milliseconds
    actualDuration?: number;
    approvalRequired: boolean;
    
    // Context and metadata
    context: TaskContext;
    metadata: TaskMetadata;
    
    // Progress tracking
    progress: TaskProgress;
    
    // Human oversight
    approvals: ApprovalRequest[];
    interventions: HumanIntervention[];
    
    // Learning and adaptation
    feedback?: UserFeedback;
    learningData?: LearningData;
}

/**
 * Context information for a task
 */
export interface TaskContext {
    workspaceRoot: string;
    activeFiles: string[];
    selectedText?: string;
    gitBranch: string;
    dependencies: string[];
    architecture: ArchitecturalContext;
    security: SecurityContext;
    quality: QualityContext;
}

/**
 * Architectural context for decision making
 */
export interface ArchitecturalContext {
    patterns: string[];
    frameworks: string[];
    languages: string[];
    dependencies: DependencyInfo[];
    codeGraph?: any; // From GraphService
}

/**
 * Security context for validation
 */
export interface SecurityContext {
    sensitiveFiles: string[];
    securityRules: ValidationRule[];
    complianceRequirements: string[];
    riskFactors: string[];
}

/**
 * Quality context for validation
 */
export interface QualityContext {
    qualityGates: ValidationRule[];
    technicalDebt: DebtInfo[];
    testCoverage: number;
    codeMetrics: CodeMetrics;
}

/**
 * Dependency information
 */
export interface DependencyInfo {
    name: string;
    version: string;
    type: 'direct' | 'transitive';
    vulnerabilities?: SecurityVulnerability[];
}

/**
 * Technical debt information
 */
export interface DebtInfo {
    type: string;
    severity: RiskLevel;
    description: string;
    estimatedEffort: number;
    impact: string;
}

/**
 * Code quality metrics
 */
export interface CodeMetrics {
    complexity: number;
    maintainability: number;
    testability: number;
    reliability: number;
}

/**
 * Security vulnerability information
 */
export interface SecurityVulnerability {
    id: string;
    severity: RiskLevel;
    description: string;
    fix?: string;
}

/**
 * Task metadata
 */
export interface TaskMetadata {
    createdAt: number;
    createdBy: string;
    updatedAt: number;
    version: string;
    tags: string[];
    source: 'user' | 'agent' | 'system';
}

/**
 * Task progress tracking
 */
export interface TaskProgress {
    totalSteps: number;
    completedSteps: number;
    failedSteps: number;
    skippedSteps: number;
    currentStep?: string;
    percentComplete: number;
    estimatedTimeRemaining: number;
}

/**
 * Approval request for risky actions
 */
export interface ApprovalRequest {
    id: string;
    action: AgentAction;
    reason: string;
    riskAssessment: RiskAssessment;
    alternatives?: AgentAction[];
    status: 'pending' | 'approved' | 'rejected';
    response?: ApprovalResponse;
    timestamp: number;
}

/**
 * Risk assessment for actions
 */
export interface RiskAssessment {
    level: RiskLevel;
    factors: string[];
    impact: string;
    mitigation: string[];
    confidence: number;
}

/**
 * Human approval response
 */
export interface ApprovalResponse {
    approved: boolean;
    feedback?: string;
    modifications?: Partial<AgentAction>;
    timestamp: number;
}

/**
 * Human intervention in task execution
 */
export interface HumanIntervention {
    id: string;
    type: 'pause' | 'modify' | 'cancel' | 'redirect';
    reason: string;
    instructions?: string;
    timestamp: number;
}

/**
 * User feedback on task execution
 */
export interface UserFeedback {
    rating: number; // 1-5 scale
    comments?: string;
    suggestions?: string[];
    wouldUseAgain: boolean;
    timestamp: number;
}

/**
 * Learning data for agent improvement
 */
export interface LearningData {
    patterns: string[];
    successes: string[];
    failures: string[];
    userPreferences: Record<string, any>;
    adaptations: string[];
}

/**
 * Complexity estimate for tasks
 */
export interface ComplexityEstimate {
    level: 'trivial' | 'simple' | 'moderate' | 'complex' | 'expert';
    factors: string[];
    estimatedTime: number;
    confidence: number;
    recommendations: string[];
}

/**
 * Execution context for agent operations
 */
export interface ExecutionContext {
    task: AgenticTask;
    step: TaskStep;
    environment: EnvironmentInfo;
    resources: ResourceInfo;
    constraints: ExecutionConstraints;
}

/**
 * Environment information
 */
export interface EnvironmentInfo {
    platform: string;
    nodeVersion?: string;
    gitVersion?: string;
    availableTools: string[];
    workspaceConfig: any;
}

/**
 * Resource information
 */
export interface ResourceInfo {
    memoryLimit: number;
    timeLimit: number;
    networkAccess: boolean;
    fileSystemAccess: boolean;
}

/**
 * Execution constraints
 */
export interface ExecutionConstraints {
    maxFileSize: number;
    allowedOperations: AgentActionType[];
    restrictedPaths: string[];
    securityLevel: RiskLevel;
}
