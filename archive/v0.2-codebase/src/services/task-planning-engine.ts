import * as vscode from 'vscode';
import { logger } from '../utils/logger';
import { ConfigurationManager } from '../utils/configuration-manager';
import {
    AgenticTask,
    TaskStep,
    AgentAction,
    AgentActionType,
    RiskLevel,
    TaskStatus,
    ComplexityEstimate,
    RiskAssessment,
    TaskContext,
    TaskMetadata,
    TaskProgress,
    ArchitecturalContext,
    SecurityContext,
    QualityContext,
    ValidationRule
} from '../types/agentic-types';

/**
 * Goal analysis result
 */
interface GoalAnalysis {
    intent: string;
    scope: 'file' | 'module' | 'project' | 'architecture';
    complexity: ComplexityEstimate;
    requiredActions: AgentActionType[];
    dependencies: string[];
    risks: string[];
}

/**
 * Task Planning Engine
 * 
 * Responsible for decomposing user goals into actionable agentic tasks.
 * Uses AI-powered analysis to understand intent, assess complexity,
 * and create step-by-step execution plans.
 */
export class TaskPlanningEngine {
    private readonly contextLogger = logger.createContextLogger('TaskPlanningEngine');
    private taskCounter = 0;

    constructor(private configManager: ConfigurationManager) {
        this.contextLogger.info('TaskPlanningEngine initialized');
    }

    /**
     * Decompose a user goal into an executable agentic task
     */
    public async decomposeGoal(userGoal: string): Promise<AgenticTask> {
        const startTime = Date.now();
        
        try {
            this.contextLogger.info('Decomposing user goal', { goal: userGoal.substring(0, 100) });

            // Step 1: Analyze the goal
            const analysis = await this.analyzeGoal(userGoal);
            
            // Step 2: Gather context
            const context = await this.gatherTaskContext();
            
            // Step 3: Estimate complexity
            const complexity = await this.estimateComplexity(userGoal, analysis, context);
            
            // Step 4: Assess risks
            const riskAssessment = await this.assessRisks(analysis, context);
            
            // Step 5: Generate steps
            const steps = await this.generateTaskSteps(analysis, context, complexity);
            
            // Step 6: Create task
            const task = this.createAgenticTask(
                userGoal,
                analysis,
                steps,
                context,
                complexity,
                riskAssessment
            );

            const duration = Date.now() - startTime;
            this.contextLogger.info('Goal decomposition completed', {
                taskId: task.id,
                stepCount: steps.length,
                complexity: complexity.level,
                riskLevel: task.riskLevel,
                duration
            });

            return task;

        } catch (error) {
            this.contextLogger.error('Failed to decompose goal', error as Error);
            throw new Error(`Goal decomposition failed: ${(error as Error).message}`);
        }
    }

    /**
     * Estimate complexity of a goal
     */
    public async estimateComplexity(
        goal: string,
        analysis?: GoalAnalysis,
        context?: TaskContext
    ): Promise<ComplexityEstimate> {
        try {
            const goalAnalysis = analysis || await this.analyzeGoal(goal);
            const taskContext = context || await this.gatherTaskContext();

            // Complexity factors
            const factors: string[] = [];
            let complexityScore = 0;

            // Scope-based complexity
            switch (goalAnalysis.scope) {
                case 'file':
                    complexityScore += 1;
                    factors.push('Single file modification');
                    break;
                case 'module':
                    complexityScore += 3;
                    factors.push('Module-level changes');
                    break;
                case 'project':
                    complexityScore += 5;
                    factors.push('Project-wide modifications');
                    break;
                case 'architecture':
                    complexityScore += 8;
                    factors.push('Architectural changes');
                    break;
            }

            // Action-based complexity
            const complexActions = ['refactor_code', 'analyze_dependencies', 'optimize_performance'];
            const hasComplexActions = goalAnalysis.requiredActions.some(action => 
                complexActions.includes(action)
            );
            if (hasComplexActions) {
                complexityScore += 3;
                factors.push('Complex operations required');
            }

            // Context-based complexity
            if (taskContext.dependencies.length > 10) {
                complexityScore += 2;
                factors.push('Many dependencies');
            }

            if (taskContext.architecture.languages.length > 2) {
                complexityScore += 2;
                factors.push('Multi-language project');
            }

            // Risk-based complexity
            if (goalAnalysis.risks.length > 0) {
                complexityScore += goalAnalysis.risks.length;
                factors.push(`${goalAnalysis.risks.length} risk factors identified`);
            }

            // Determine complexity level
            let level: ComplexityEstimate['level'];
            let estimatedTime: number;

            if (complexityScore <= 2) {
                level = 'trivial';
                estimatedTime = 30000; // 30 seconds
            } else if (complexityScore <= 5) {
                level = 'simple';
                estimatedTime = 120000; // 2 minutes
            } else if (complexityScore <= 8) {
                level = 'moderate';
                estimatedTime = 600000; // 10 minutes
            } else if (complexityScore <= 12) {
                level = 'complex';
                estimatedTime = 1800000; // 30 minutes
            } else {
                level = 'expert';
                estimatedTime = 3600000; // 1 hour
            }

            const confidence = Math.max(0.3, Math.min(0.9, 1 - (complexityScore * 0.05)));

            return {
                level,
                factors,
                estimatedTime,
                confidence,
                recommendations: this.generateComplexityRecommendations(level, factors)
            };

        } catch (error) {
            this.contextLogger.warn('Failed to estimate complexity, using default', error as Error);
            return {
                level: 'moderate',
                factors: ['Unable to analyze complexity'],
                estimatedTime: 600000,
                confidence: 0.5,
                recommendations: ['Manual review recommended']
            };
        }
    }

    /**
     * Assess risks for a goal
     */
    public async assessRisks(
        analysis: GoalAnalysis,
        context: TaskContext
    ): Promise<RiskAssessment> {
        const factors: string[] = [];
        let riskScore = 0;

        // Action-based risks
        const highRiskActions = ['delete_file', 'run_command', 'commit_changes'];
        const hasHighRiskActions = analysis.requiredActions.some(action => 
            highRiskActions.includes(action)
        );
        if (hasHighRiskActions) {
            riskScore += 3;
            factors.push('High-risk operations required');
        }

        // Scope-based risks
        if (analysis.scope === 'architecture') {
            riskScore += 4;
            factors.push('Architectural changes can have wide impact');
        }

        // Security risks
        if (context.security.sensitiveFiles.length > 0) {
            riskScore += 2;
            factors.push('Sensitive files in scope');
        }

        // Quality risks
        if (context.quality.technicalDebt.length > 5) {
            riskScore += 2;
            factors.push('High technical debt may complicate changes');
        }

        // Dependency risks
        const hasVulnerabilities = context.architecture.dependencies.some(dep => 
            dep.vulnerabilities && dep.vulnerabilities.length > 0
        );
        if (hasVulnerabilities) {
            riskScore += 2;
            factors.push('Dependencies with known vulnerabilities');
        }

        // Determine risk level
        let level: RiskLevel;
        if (riskScore <= 2) {
            level = 'low';
        } else if (riskScore <= 5) {
            level = 'medium';
        } else if (riskScore <= 8) {
            level = 'high';
        } else {
            level = 'critical';
        }

        const confidence = Math.max(0.6, Math.min(0.95, 1 - (riskScore * 0.03)));

        return {
            level,
            factors,
            impact: this.generateImpactDescription(level, analysis.scope),
            mitigation: this.generateMitigationStrategies(factors),
            confidence
        };
    }

    /**
     * Adapt a plan based on feedback
     */
    public async adaptPlan(task: AgenticTask, feedback: string): Promise<AgenticTask> {
        try {
            this.contextLogger.info('Adapting task plan', { 
                taskId: task.id, 
                feedback: feedback.substring(0, 100) 
            });

            // Analyze feedback to understand required changes
            const adaptations = await this.analyzeFeedback(feedback, task);
            
            // Apply adaptations
            const adaptedTask = await this.applyAdaptations(task, adaptations);
            
            // Update metadata
            adaptedTask.metadata.updatedAt = Date.now();
            adaptedTask.metadata.version = this.incrementVersion(task.metadata.version);

            this.contextLogger.info('Task plan adapted', {
                taskId: adaptedTask.id,
                adaptations: adaptations.length
            });

            return adaptedTask;

        } catch (error) {
            this.contextLogger.error('Failed to adapt plan', error as Error);
            throw new Error(`Plan adaptation failed: ${(error as Error).message}`);
        }
    }

    /**
     * Analyze user goal to understand intent and requirements
     */
    private async analyzeGoal(goal: string): Promise<GoalAnalysis> {
        // This would use AI/LLM to analyze the goal
        // For now, implementing rule-based analysis
        
        const intent = goal.toLowerCase();
        let scope: GoalAnalysis['scope'] = 'file';
        const requiredActions: AgentActionType[] = [];
        const dependencies: string[] = [];
        const risks: string[] = [];

        // Determine scope
        if (intent.includes('architecture') || intent.includes('refactor entire') || intent.includes('restructure')) {
            scope = 'architecture';
        } else if (intent.includes('module') || intent.includes('package') || intent.includes('component')) {
            scope = 'module';
        } else if (intent.includes('project') || intent.includes('app') || intent.includes('application')) {
            scope = 'project';
        }

        // Determine required actions
        if (intent.includes('create') || intent.includes('add') || intent.includes('new')) {
            requiredActions.push('create_file');
        }
        if (intent.includes('edit') || intent.includes('modify') || intent.includes('update') || intent.includes('change')) {
            requiredActions.push('edit_file');
        }
        if (intent.includes('delete') || intent.includes('remove')) {
            requiredActions.push('delete_file');
            risks.push('File deletion requested');
        }
        if (intent.includes('test') || intent.includes('spec')) {
            requiredActions.push('run_tests');
        }
        if (intent.includes('refactor')) {
            requiredActions.push('refactor_code');
        }
        if (intent.includes('security') || intent.includes('audit')) {
            requiredActions.push('validate_security');
        }
        if (intent.includes('optimize') || intent.includes('performance')) {
            requiredActions.push('optimize_performance');
        }
        if (intent.includes('document')) {
            requiredActions.push('generate_documentation');
        }

        // Default to analyze if no specific actions identified
        if (requiredActions.length === 0) {
            requiredActions.push('analyze_code');
        }

        // Calculate basic complexity without calling estimateComplexity to avoid recursion
        let complexityLevel: 'trivial' | 'simple' | 'moderate' | 'complex' | 'expert' = 'simple';
        let estimatedTime = 15; // minutes
        const factors: string[] = [];

        if (scope === 'architecture' || requiredActions.length > 3 || risks.length > 2) {
            complexityLevel = 'complex';
            estimatedTime = 120;
            factors.push('High complexity due to scope or risk factors');
        } else if (scope === 'project' || requiredActions.length > 1 || risks.length > 0) {
            complexityLevel = 'moderate';
            estimatedTime = 45;
            factors.push('Moderate complexity due to scope or multiple actions');
        } else {
            factors.push('Simple single-file operation');
        }

        const basicComplexity: ComplexityEstimate = {
            level: complexityLevel,
            factors,
            estimatedTime,
            confidence: 0.7, // Basic analysis has moderate confidence
            recommendations: ['Consider using detailed analysis for better estimates']
        };

        return {
            intent: goal,
            scope,
            complexity: basicComplexity,
            requiredActions,
            dependencies,
            risks
        };
    }

    /**
     * Gather context for task planning
     */
    private async gatherTaskContext(): Promise<TaskContext> {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
        const activeFiles = vscode.window.visibleTextEditors.map(editor => editor.document.fileName);
        const selectedText = this.getSelectedText();

        // This would integrate with existing services to gather context
        return {
            workspaceRoot,
            activeFiles,
            selectedText,
            gitBranch: 'main', // Would get from git
            dependencies: [], // Would get from package analysis
            architecture: {
                patterns: [],
                frameworks: [],
                languages: [],
                dependencies: []
            },
            security: {
                sensitiveFiles: [],
                securityRules: [],
                complianceRequirements: [],
                riskFactors: []
            },
            quality: {
                qualityGates: [],
                technicalDebt: [],
                testCoverage: 0,
                codeMetrics: {
                    complexity: 0,
                    maintainability: 0,
                    testability: 0,
                    reliability: 0
                }
            }
        };
    }

    /**
     * Generate task steps based on analysis
     */
    private async generateTaskSteps(
        analysis: GoalAnalysis,
        context: TaskContext,
        complexity: ComplexityEstimate
    ): Promise<TaskStep[]> {
        const steps: TaskStep[] = [];
        let stepCounter = 0;

        // Generate steps based on required actions
        for (const actionType of analysis.requiredActions) {
            const step = this.createTaskStep(
                ++stepCounter,
                actionType,
                analysis,
                context,
                complexity
            );
            steps.push(step);
        }

        // Add validation steps
        if (steps.some(s => s.action.type === 'edit_file' || s.action.type === 'create_file')) {
            steps.push(this.createValidationStep(++stepCounter, 'quality'));
            steps.push(this.createValidationStep(++stepCounter, 'security'));
        }

        return steps;
    }

    // Helper methods would continue here...
    // Due to 300-line limit, I'll add the remaining methods in the next edit

    private getSelectedText(): string | undefined {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.selection.isEmpty) {
            return undefined;
        }
        return editor.document.getText(editor.selection);
    }

    private generateComplexityRecommendations(level: string, factors: string[]): string[] {
        const recommendations: string[] = [];
        
        if (level === 'complex' || level === 'expert') {
            recommendations.push('Consider breaking down into smaller tasks');
            recommendations.push('Review and approve each step carefully');
        }
        
        if (factors.some(f => f.includes('Multi-language'))) {
            recommendations.push('Ensure language-specific tools are available');
        }
        
        return recommendations;
    }

    private generateImpactDescription(level: RiskLevel, scope: string): string {
        const impacts = {
            low: `Minimal impact expected for ${scope}-level changes`,
            medium: `Moderate impact possible for ${scope}-level changes`,
            high: `Significant impact likely for ${scope}-level changes`,
            critical: `Critical impact expected for ${scope}-level changes`
        };
        return impacts[level];
    }

    private generateMitigationStrategies(factors: string[]): string[] {
        const strategies: string[] = [];
        
        if (factors.some(f => f.includes('High-risk operations'))) {
            strategies.push('Create backup before proceeding');
            strategies.push('Require explicit approval for risky operations');
        }
        
        if (factors.some(f => f.includes('Sensitive files'))) {
            strategies.push('Extra security validation required');
            strategies.push('Audit all changes to sensitive files');
        }
        
        return strategies;
    }

    private async analyzeFeedback(feedback: string, task: AgenticTask): Promise<string[]> {
        // Simplified feedback analysis - would use AI in production
        const adaptations: string[] = [];
        
        if (feedback.toLowerCase().includes('too risky')) {
            adaptations.push('reduce_risk');
        }
        if (feedback.toLowerCase().includes('break down') || feedback.toLowerCase().includes('smaller')) {
            adaptations.push('break_down_steps');
        }
        if (feedback.toLowerCase().includes('add') || feedback.toLowerCase().includes('include')) {
            adaptations.push('add_steps');
        }
        
        return adaptations;
    }

    private async applyAdaptations(task: AgenticTask, adaptations: string[]): Promise<AgenticTask> {
        // Apply adaptations to the task
        const adaptedTask = { ...task };
        
        for (const adaptation of adaptations) {
            switch (adaptation) {
                case 'reduce_risk':
                    adaptedTask.approvalRequired = true;
                    adaptedTask.steps.forEach(step => {
                        if (step.riskLevel === 'high') {
                            step.approvalRequired = true;
                        }
                    });
                    break;
                case 'break_down_steps':
                    // Would implement step breakdown logic
                    break;
                case 'add_steps':
                    // Would implement step addition logic
                    break;
            }
        }
        
        return adaptedTask;
    }

    private incrementVersion(version: string): string {
        const parts = version.split('.');
        const patch = parseInt(parts[2] || '0') + 1;
        return `${parts[0]}.${parts[1]}.${patch}`;
    }

    private createTaskStep(
        stepNumber: number,
        actionType: AgentActionType,
        analysis: GoalAnalysis,
        context: TaskContext,
        complexity: ComplexityEstimate
    ): TaskStep {
        // Implementation would create appropriate task steps
        // Simplified for now
        return {
            id: `step-${stepNumber}`,
            action: {
                id: `action-${stepNumber}`,
                type: actionType,
                description: `Execute ${actionType}`,
                target: '',
                payload: {},
                validation: [],
                riskLevel: 'low',
                estimatedTime: 30000,
                requiresApproval: false
            },
            description: `Step ${stepNumber}: ${actionType}`,
            dependencies: [],
            status: 'pending',
            approvalRequired: false,
            riskLevel: 'low'
        };
    }

    private createValidationStep(stepNumber: number, type: string): TaskStep {
        return {
            id: `validation-${stepNumber}`,
            action: {
                id: `validation-action-${stepNumber}`,
                type: 'validate_security',
                description: `Validate ${type}`,
                target: '',
                payload: { validationType: type },
                validation: [],
                riskLevel: 'low',
                estimatedTime: 15000,
                requiresApproval: false
            },
            description: `Validation: ${type}`,
            dependencies: [],
            status: 'pending',
            approvalRequired: false,
            riskLevel: 'low'
        };
    }

    private createAgenticTask(
        userGoal: string,
        analysis: GoalAnalysis,
        steps: TaskStep[],
        context: TaskContext,
        complexity: ComplexityEstimate,
        riskAssessment: RiskAssessment
    ): AgenticTask {
        const taskId = `task-${++this.taskCounter}-${Date.now()}`;
        
        return {
            id: taskId,
            goal: userGoal,
            description: analysis.intent,
            steps,
            status: 'planning',
            priority: complexity.level === 'expert' ? 'high' : 'medium',
            riskLevel: riskAssessment.level,
            estimatedDuration: complexity.estimatedTime,
            approvalRequired: riskAssessment.level === 'high' || riskAssessment.level === 'critical',
            context,
            metadata: {
                createdAt: Date.now(),
                createdBy: 'user',
                updatedAt: Date.now(),
                version: '1.0.0',
                tags: [analysis.scope, complexity.level],
                source: 'user'
            },
            progress: {
                totalSteps: steps.length,
                completedSteps: 0,
                failedSteps: 0,
                skippedSteps: 0,
                percentComplete: 0,
                estimatedTimeRemaining: complexity.estimatedTime
            },
            approvals: [],
            interventions: []
        };
    }
}
