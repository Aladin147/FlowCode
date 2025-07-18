import * as assert from 'assert';
import * as vscode from 'vscode';
import { TaskPlanningEngine } from '../services/task-planning-engine';
import { ConfigurationManager } from '../utils/configuration-manager';
import { AgenticTask, ComplexityEstimate, RiskAssessment } from '../types/agentic-types';

suite('TaskPlanningEngine Tests', () => {
    let taskPlanningEngine: TaskPlanningEngine;
    let configManager: ConfigurationManager;

    suiteSetup(async () => {
        // Mock extension context for testing
        const mockContext = {
            subscriptions: [],
            workspaceState: {
                get: () => undefined,
                update: () => Promise.resolve()
            },
            globalState: {
                get: () => undefined,
                update: () => Promise.resolve()
            },
            secrets: {
                get: () => Promise.resolve(undefined),
                store: () => Promise.resolve(),
                delete: () => Promise.resolve()
            }
        } as any;

        configManager = new ConfigurationManager(mockContext);
        taskPlanningEngine = new TaskPlanningEngine(configManager);
    });

    test('TaskPlanningEngine should initialize correctly', () => {
        assert.ok(taskPlanningEngine, 'TaskPlanningEngine should be initialized');
    });

    test('Should decompose simple goal into task', async () => {
        const goal = 'Create a new TypeScript file with a simple function';
        
        try {
            const task: AgenticTask = await taskPlanningEngine.decomposeGoal(goal);
            
            assert.ok(task, 'Task should be created');
            assert.strictEqual(task.goal, goal, 'Task goal should match input');
            assert.ok(task.id, 'Task should have an ID');
            assert.ok(task.steps, 'Task should have steps');
            assert.ok(task.steps.length > 0, 'Task should have at least one step');
            assert.ok(task.context, 'Task should have context');
            assert.ok(task.metadata, 'Task should have metadata');
            assert.ok(task.progress, 'Task should have progress tracking');
            
            console.log(`✅ Task created with ${task.steps.length} steps`);
            console.log(`   Risk Level: ${task.riskLevel}`);
            console.log(`   Priority: ${task.priority}`);
            console.log(`   Status: ${task.status}`);
            
        } catch (error) {
            console.error('❌ Task decomposition failed:', error);
            throw error;
        }
    });

    test('Should estimate complexity correctly', async () => {
        const simpleGoal = 'Add a comment to a file';
        const complexGoal = 'Refactor the entire application architecture';
        
        try {
            const simpleComplexity: ComplexityEstimate = await taskPlanningEngine.estimateComplexity(simpleGoal);
            const complexComplexity: ComplexityEstimate = await taskPlanningEngine.estimateComplexity(complexGoal);
            
            assert.ok(simpleComplexity, 'Simple complexity should be estimated');
            assert.ok(complexComplexity, 'Complex complexity should be estimated');
            
            // Simple task should be less complex than complex task
            const complexityLevels = ['trivial', 'simple', 'moderate', 'complex', 'expert'];
            const simpleIndex = complexityLevels.indexOf(simpleComplexity.level);
            const complexIndex = complexityLevels.indexOf(complexComplexity.level);
            
            assert.ok(simpleIndex <= complexIndex, 'Simple task should have lower or equal complexity');
            
            console.log(`✅ Simple task complexity: ${simpleComplexity.level} (${simpleComplexity.estimatedTime}ms)`);
            console.log(`✅ Complex task complexity: ${complexComplexity.level} (${complexComplexity.estimatedTime}ms)`);
            
        } catch (error) {
            console.error('❌ Complexity estimation failed:', error);
            throw error;
        }
    });

    test('Should assess risks appropriately', async () => {
        const safeGoal = 'Read a configuration file';
        const riskyGoal = 'Delete all files in the project';
        
        try {
            // Create mock analysis and context for risk assessment
            const safeAnalysis = {
                intent: safeGoal,
                scope: 'file' as const,
                complexity: { level: 'simple' as const, factors: [], estimatedTime: 1000, confidence: 0.9, recommendations: [] },
                requiredActions: ['analyze_code' as const],
                dependencies: [],
                risks: []
            };
            
            const riskyAnalysis = {
                intent: riskyGoal,
                scope: 'project' as const,
                complexity: { level: 'expert' as const, factors: [], estimatedTime: 10000, confidence: 0.5, recommendations: [] },
                requiredActions: ['delete_file' as const],
                dependencies: [],
                risks: ['File deletion requested']
            };
            
            const mockContext = {
                workspaceRoot: '/test',
                activeFiles: [],
                gitBranch: 'main',
                dependencies: [],
                architecture: { patterns: [], frameworks: [], languages: [], dependencies: [] },
                security: { sensitiveFiles: [], securityRules: [], complianceRequirements: [], riskFactors: [] },
                quality: { qualityGates: [], technicalDebt: [], testCoverage: 0, codeMetrics: { complexity: 0, maintainability: 0, testability: 0, reliability: 0 } }
            };
            
            const safeRisk: RiskAssessment = await taskPlanningEngine.assessRisks(safeAnalysis, mockContext);
            const riskyRisk: RiskAssessment = await taskPlanningEngine.assessRisks(riskyAnalysis, mockContext);
            
            assert.ok(safeRisk, 'Safe risk assessment should be created');
            assert.ok(riskyRisk, 'Risky risk assessment should be created');
            
            // Risky task should have higher risk level
            const riskLevels = ['low', 'medium', 'high', 'critical'];
            const safeIndex = riskLevels.indexOf(safeRisk.level);
            const riskyIndex = riskLevels.indexOf(riskyRisk.level);
            
            assert.ok(safeIndex <= riskyIndex, 'Safe task should have lower or equal risk');
            
            console.log(`✅ Safe task risk: ${safeRisk.level}`);
            console.log(`✅ Risky task risk: ${riskyRisk.level}`);
            
        } catch (error) {
            console.error('❌ Risk assessment failed:', error);
            throw error;
        }
    });

    test('Should adapt plan based on feedback', async () => {
        const goal = 'Create a simple function';
        
        try {
            const originalTask = await taskPlanningEngine.decomposeGoal(goal);
            const feedback = 'This task is too risky, please add more validation steps';
            
            const adaptedTask = await taskPlanningEngine.adaptPlan(originalTask, feedback);
            
            assert.ok(adaptedTask, 'Adapted task should be created');
            assert.strictEqual(adaptedTask.id, originalTask.id, 'Task ID should remain the same');
            assert.notStrictEqual(adaptedTask.metadata.version, originalTask.metadata.version, 'Version should be updated');
            
            console.log(`✅ Task adapted from v${originalTask.metadata.version} to v${adaptedTask.metadata.version}`);
            
        } catch (error) {
            console.error('❌ Plan adaptation failed:', error);
            throw error;
        }
    });

    test('Should handle different goal types', async () => {
        const goals = [
            'Create a new file',
            'Refactor existing code',
            'Run security audit',
            'Generate documentation',
            'Optimize performance'
        ];
        
        try {
            for (const goal of goals) {
                const task = await taskPlanningEngine.decomposeGoal(goal);
                
                assert.ok(task, `Task should be created for goal: ${goal}`);
                assert.ok(task.steps.length > 0, `Task should have steps for goal: ${goal}`);
                
                console.log(`✅ ${goal}: ${task.steps.length} steps, ${task.riskLevel} risk`);
            }
            
        } catch (error) {
            console.error('❌ Goal handling failed:', error);
            throw error;
        }
    });
});
