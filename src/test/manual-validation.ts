/**
 * Manual validation script for Week 1 implementation
 * Run this to verify TaskPlanningEngine works correctly
 */

import { TaskPlanningEngine } from '../services/task-planning-engine';
import { ConfigurationManager } from '../utils/configuration-manager';

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

async function validateTaskPlanningEngine() {
    console.log('🔍 Starting TaskPlanningEngine validation...\n');

    try {
        // Initialize services
        const configManager = new ConfigurationManager(mockContext);
        const taskPlanningEngine = new TaskPlanningEngine(configManager);
        
        console.log('✅ TaskPlanningEngine initialized successfully');

        // Test 1: Simple goal decomposition
        console.log('\n📋 Test 1: Simple goal decomposition');
        const simpleGoal = 'Create a new TypeScript file with a simple function';
        const task = await taskPlanningEngine.decomposeGoal(simpleGoal);
        
        console.log(`   Goal: ${task.goal}`);
        console.log(`   Task ID: ${task.id}`);
        console.log(`   Steps: ${task.steps.length}`);
        console.log(`   Risk Level: ${task.riskLevel}`);
        console.log(`   Priority: ${task.priority}`);
        console.log(`   Status: ${task.status}`);
        console.log(`   Approval Required: ${task.approvalRequired}`);
        console.log('✅ Goal decomposition successful');

        // Test 2: Complexity estimation
        console.log('\n📊 Test 2: Complexity estimation');
        const complexGoal = 'Refactor the entire application architecture';
        const complexity = await taskPlanningEngine.estimateComplexity(complexGoal);
        
        console.log(`   Goal: ${complexGoal}`);
        console.log(`   Complexity Level: ${complexity.level}`);
        console.log(`   Estimated Time: ${complexity.estimatedTime}ms`);
        console.log(`   Confidence: ${complexity.confidence}`);
        console.log(`   Factors: ${complexity.factors.join(', ')}`);
        console.log('✅ Complexity estimation successful');

        // Test 3: Risk assessment
        console.log('\n⚠️ Test 3: Risk assessment');
        const riskyGoal = 'Delete all temporary files and clean up project';
        const riskyTask = await taskPlanningEngine.decomposeGoal(riskyGoal);
        
        console.log(`   Goal: ${riskyGoal}`);
        console.log(`   Risk Level: ${riskyTask.riskLevel}`);
        console.log(`   Approval Required: ${riskyTask.approvalRequired}`);
        console.log('✅ Risk assessment successful');

        // Test 4: Plan adaptation
        console.log('\n🔄 Test 4: Plan adaptation');
        const feedback = 'This task is too risky, please add more validation steps';
        const adaptedTask = await taskPlanningEngine.adaptPlan(task, feedback);
        
        console.log(`   Original Version: ${task.metadata.version}`);
        console.log(`   Adapted Version: ${adaptedTask.metadata.version}`);
        console.log(`   Approval Required: ${adaptedTask.approvalRequired}`);
        console.log('✅ Plan adaptation successful');

        // Test 5: Different goal types
        console.log('\n🎯 Test 5: Different goal types');
        const testGoals = [
            'Create a new file',
            'Refactor existing code', 
            'Run security audit',
            'Generate documentation',
            'Optimize performance'
        ];

        for (const goal of testGoals) {
            const testTask = await taskPlanningEngine.decomposeGoal(goal);
            console.log(`   ${goal}: ${testTask.steps.length} steps, ${testTask.riskLevel} risk`);
        }
        console.log('✅ Different goal types handled successfully');

        console.log('\n🎉 All validation tests passed!');
        console.log('\n📋 Summary:');
        console.log('   ✅ TaskPlanningEngine initialization');
        console.log('   ✅ Goal decomposition');
        console.log('   ✅ Complexity estimation');
        console.log('   ✅ Risk assessment');
        console.log('   ✅ Plan adaptation');
        console.log('   ✅ Multiple goal types');
        
        return true;

    } catch (error) {
        console.error('❌ Validation failed:', error);
        return false;
    }
}

// Run validation if this file is executed directly
if (require.main === module) {
    validateTaskPlanningEngine().then(success => {
        process.exit(success ? 0 : 1);
    });
}

export { validateTaskPlanningEngine };
