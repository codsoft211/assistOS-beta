#!/usr/bin/env tsx
/**
 * AssistBuild Workflow Testing Script
 * 
 * Tests workflow automation system with different scenarios.
 * 
 * Usage:
 *   npm run test:workflows                    # Run all tests
 *   npm run test:workflows -- --scenario=1    # Run specific scenario
 *   npm run test:workflows -- --cleanup       # Cleanup test data
 */

import axios, { AxiosInstance } from 'axios';
import { db } from '../apps/api/db';
import { assistbuildWorkflows, assistbuildExecutions } from '../shared/schema';
import { eq } from 'drizzle-orm';

// Configuration
const API_BASE = process.env.API_URL || 'http://localhost:5000';
const TENANT_ID = process.env.TEST_TENANT_ID || 'test-tenant';
const USER_ID = process.env.TEST_USER_ID || 'test-user';

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message: string, color: keyof typeof colors = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title: string) {
  console.log('\n' + '='.repeat(60));
  log(title, 'cyan');
  console.log('='.repeat(60) + '\n');
}

function logSuccess(message: string) {
  log(`✅ ${message}`, 'green');
}

function logError(message: string) {
  log(`❌ ${message}`, 'red');
}

function logInfo(message: string) {
  log(`ℹ️  ${message}`, 'blue');
}

function logWarning(message: string) {
  log(`⚠️  ${message}`, 'yellow');
}

// Test scenarios
const scenarios = {
  1: {
    name: 'Simple CRUD - Create Customer',
    description: 'Manual trigger → Create customer record',
    workflow: {
      name: 'Test: Create Customer',
      description: 'Simple workflow to create a customer',
      environment: 'sandbox' as const,
      definition: {
        nodes: [
          {
            id: 'trigger-1',
            type: 'manual_trigger' as const,
            name: 'Manual Start',
            position: { x: 100, y: 100 },
            config: {},
          },
          {
            id: 'crud-1',
            type: 'crud_record' as const,
            name: 'Create Customer',
            position: { x: 300, y: 100 },
            config: {
              operation: 'create',
              moduleId: 'customers',
              recordData: {
                name: '{{trigger.data.name}}',
                email: '{{trigger.data.email}}',
              },
              outputVariable: 'newCustomer',
            },
          },
        ],
        edges: [
          {
            id: 'edge-1',
            source: 'trigger-1',
            target: 'crud-1',
          },
        ],
      },
    },
    triggerData: {
      name: 'John Doe',
      email: 'john.doe@example.com',
    },
  },

  2: {
    name: 'CRUD Chain - Create and Read',
    description: 'Create record → Read it back',
    workflow: {
      name: 'Test: Create and Read Customer',
      description: 'Create a customer then read it back',
      environment: 'sandbox' as const,
      definition: {
        nodes: [
          {
            id: 'trigger-1',
            type: 'manual_trigger' as const,
            name: 'Start',
            position: { x: 100, y: 100 },
            config: {},
          },
          {
            id: 'crud-1',
            type: 'crud_record' as const,
            name: 'Create Customer',
            position: { x: 300, y: 100 },
            config: {
              operation: 'create',
              moduleId: 'customers',
              recordData: {
                name: 'Jane Smith',
                email: 'jane@example.com',
              },
              outputVariable: 'newCustomer',
            },
          },
          {
            id: 'crud-2',
            type: 'crud_record' as const,
            name: 'Read Customer',
            position: { x: 500, y: 100 },
            config: {
              operation: 'read',
              moduleId: 'customers',
              recordId: '{{newCustomer.id}}',
              outputVariable: 'fetchedCustomer',
            },
          },
        ],
        edges: [
          {
            id: 'edge-1',
            source: 'trigger-1',
            target: 'crud-1',
          },
          {
            id: 'edge-2',
            source: 'crud-1',
            target: 'crud-2',
          },
        ],
      },
    },
    triggerData: {},
  },

  3: {
    name: 'Multiple Operations',
    description: 'Create multiple records in sequence',
    workflow: {
      name: 'Test: Multi-Create Workflow',
      description: 'Create multiple related records',
      environment: 'sandbox' as const,
      definition: {
        nodes: [
          {
            id: 'trigger-1',
            type: 'manual_trigger' as const,
            name: 'Start',
            position: { x: 100, y: 100 },
            config: {},
          },
          {
            id: 'crud-1',
            type: 'crud_record' as const,
            name: 'Create Customer',
            position: { x: 300, y: 100 },
            config: {
              operation: 'create',
              moduleId: 'customers',
              recordData: {
                name: '{{trigger.data.name}}',
                email: '{{trigger.data.email}}',
              },
              outputVariable: 'customer',
            },
          },
          {
            id: 'crud-2',
            type: 'crud_record' as const,
            name: 'Create Order',
            position: { x: 500, y: 100 },
            config: {
              operation: 'create',
              moduleId: 'orders',
              recordData: {
                customer_id: '{{customer.id}}',
                amount: '{{trigger.data.orderAmount}}',
                status: 'pending',
              },
              outputVariable: 'order',
            },
          },
        ],
        edges: [
          {
            id: 'edge-1',
            source: 'trigger-1',
            target: 'crud-1',
          },
          {
            id: 'edge-2',
            source: 'crud-1',
            target: 'crud-2',
          },
        ],
      },
    },
    triggerData: {
      name: 'Bob Wilson',
      email: 'bob@example.com',
      orderAmount: 99.99,
    },
  },

  4: {
    name: 'Error Scenario - Invalid Node',
    description: 'Workflow with validation errors',
    workflow: {
      name: 'Test: Invalid Workflow',
      description: 'Should fail validation',
      environment: 'sandbox' as const,
      definition: {
        nodes: [
          {
            id: 'trigger-1',
            type: 'manual_trigger' as const,
            name: 'Start',
            position: { x: 100, y: 100 },
            config: {},
          },
          {
            id: 'crud-1',
            type: 'crud_record' as const,
            name: 'Invalid CRUD',
            position: { x: 300, y: 100 },
            config: {
              operation: 'create',
              moduleId: 'customers',
              recordData: {
                // Missing required 'name' field - should cause database constraint error
                email: 'invalid@example.com',
              },
            },
          },
        ],
        edges: [
          {
            id: 'edge-1',
            source: 'trigger-1',
            target: 'crud-1',
          },
        ],
      },
    },
    triggerData: {},
  },

  5: {
    name: 'Cycle Detection',
    description: 'Workflow with circular dependency',
    workflow: {
      name: 'Test: Circular Workflow',
      description: 'Should fail cycle detection',
      environment: 'sandbox' as const,
      definition: {
        nodes: [
          {
            id: 'trigger-1',
            type: 'manual_trigger' as const,
            name: 'Start',
            position: { x: 100, y: 100 },
            config: {},
          },
          {
            id: 'crud-1',
            type: 'crud_record' as const,
            name: 'Node A',
            position: { x: 300, y: 100 },
            config: {
              operation: 'read',
              moduleId: 'customers',
            },
          },
          {
            id: 'crud-2',
            type: 'crud_record' as const,
            name: 'Node B',
            position: { x: 500, y: 100 },
            config: {
              operation: 'read',
              moduleId: 'customers',
            },
          },
        ],
        edges: [
          {
            id: 'edge-1',
            source: 'trigger-1',
            target: 'crud-1',
          },
          {
            id: 'edge-2',
            source: 'crud-1',
            target: 'crud-2',
          },
          {
            id: 'edge-3',
            source: 'crud-2',
            target: 'crud-1', // Creates cycle!
          },
        ],
      },
    },
    triggerData: {},
  },
};

// Test runner
class WorkflowTester {
  private createdWorkflowIds: string[] = [];
  private createdExecutionIds: string[] = [];

  async runScenario(scenarioId: number) {
    const scenario = scenarios[scenarioId as keyof typeof scenarios];
    if (!scenario) {
      logError(`Scenario ${scenarioId} not found`);
      return false;
    }

    logSection(`Scenario ${scenarioId}: ${scenario.name}`);
    logInfo(scenario.description);

    try {
      // Step 1: Create workflow
      log('\n📝 Step 1: Creating workflow...', 'blue');
      const workflow = await this.createWorkflow(scenario.workflow);
      
      if (!workflow) {
        logError('Failed to create workflow');
        return false;
      }
      
      this.createdWorkflowIds.push(workflow.id);
      logSuccess(`Workflow created: ${workflow.id}`);
      logInfo(`  Name: ${workflow.name}`);
      logInfo(`  Status: ${workflow.status}`);

      // Step 2: Publish workflow
      log('\n📤 Step 2: Publishing workflow...', 'blue');
      const published = await this.publishWorkflow(workflow.id);
      
      if (!published) {
        logError('Failed to publish workflow');
        return false;
      }
      
      logSuccess(`Workflow published`);

      // Step 3: Execute workflow
      log('\n▶️  Step 3: Executing workflow...', 'blue');
      const execution = await this.executeWorkflow(workflow.id, scenario.triggerData);
      
      if (!execution) {
        logError('Failed to execute workflow');
        return false;
      }
      
      this.createdExecutionIds.push(execution.id);
      logSuccess(`Execution started: ${execution.id}`);
      logInfo(`  Status: ${execution.status}`);

      // Step 4: Monitor execution
      log('\n👀 Step 4: Monitoring execution...', 'blue');
      const result = await this.monitorExecution(execution.id);
      
      if (!result) {
        logError('Execution monitoring failed');
        return false;
      }

      // Step 5: Get execution logs
      log('\n📊 Step 5: Fetching execution logs...', 'blue');
      const logs = await this.getExecutionLogs(execution.id);
      
      if (logs) {
        logSuccess(`Retrieved ${logs.length} execution logs`);
        logs.forEach((log: any, index: number) => {
          const icon = log.status === 'success' ? '✅' : log.status === 'failed' ? '❌' : '⏳';
          logInfo(`  ${icon} ${index + 1}. ${log.nodeName} (${log.nodeType}) - ${log.status}`);
          if (log.durationMs) {
            logInfo(`     Duration: ${log.durationMs}ms`);
          }
        });
      }

      // Step 6: Get statistics
      log('\n📈 Step 6: Getting workflow statistics...', 'blue');
      const stats = await this.getWorkflowStats(workflow.id);
      
      if (stats && stats.stats) {
        logSuccess('Statistics retrieved');
        logInfo(`  Total executions: ${stats.stats.totalExecutions || 0}`);
        logInfo(`  Success rate: ${stats.stats.successRate || 0}%`);
      }

      logSuccess(`\n✅ Scenario ${scenarioId} completed successfully!`);
      return true;

    } catch (error: any) {
      logError(`\n❌ Scenario ${scenarioId} failed: ${error.message}`);
      if (error.response?.data) {
        console.log('Error details:', JSON.stringify(error.response.data, null, 2));
      }
      return false;
    }
  }

  private async createWorkflow(workflow: any) {
    try {
      // Direct database insert for testing (bypassing API authentication)
      const [created] = await db
        .insert(assistbuildWorkflows)
        .values({
          tenantId: TENANT_ID,
          name: workflow.name,
          description: workflow.description,
          definition: workflow.definition,
          status: 'draft',
          environment: workflow.environment,
          createdBy: USER_ID,
        })
        .returning();

      return created;
    } catch (error: any) {
      logError(`Create workflow error: ${error.message}`);
      return null;
    }
  }

  private async publishWorkflow(workflowId: string) {
    try {
      // Direct database update
      const [updated] = await db
        .update(assistbuildWorkflows)
        .set({ status: 'published', publishedAt: new Date() })
        .where(eq(assistbuildWorkflows.id, workflowId))
        .returning();

      return updated;
    } catch (error: any) {
      logError(`Publish workflow error: ${error.message}`);
      return null;
    }
  }

  private async executeWorkflow(workflowId: string, triggerData: any) {
    try {
      // Use ExecutionService directly
      const { ExecutionService } = await import('../apps/api/services/assistbuild/execution.service.js');
      
      const execution = await ExecutionService.createExecution({
        workflowId,
        tenantId: TENANT_ID,
        userId: USER_ID,
        triggerData,
        environment: 'sandbox',
      });

      // Enqueue for processing
      await ExecutionService.enqueueExecution({
        workflowId,
        executionId: execution.id,
        tenantId: TENANT_ID,
        userId: USER_ID,
        triggerData,
        environment: 'sandbox',
      });

      return execution;
    } catch (error: any) {
      logError(`Execute workflow error: ${error.message}`);
      return null;
    }
  }

  private async monitorExecution(executionId: string, maxWaitTime = 30000) {
    const startTime = Date.now();
    const pollInterval = 1000;

    while (Date.now() - startTime < maxWaitTime) {
      try {
        const { ExecutionService } = await import('../apps/api/services/assistbuild/execution.service.js');
        const execution = await ExecutionService.getExecution(executionId, TENANT_ID);

        if (!execution) {
          logError('Execution not found');
          return false;
        }

        logInfo(`  Status: ${execution.status} (${Math.floor((Date.now() - startTime) / 1000)}s)`);

        if (execution.status === 'completed') {
          logSuccess('Execution completed successfully!');
          return true;
        }

        if (execution.status === 'failed') {
          logError(`Execution failed: ${execution.errorMessage || 'Unknown error'}`);
          return false;
        }

        if (execution.status === 'cancelled') {
          logWarning('Execution was cancelled');
          return false;
        }

        await new Promise(resolve => setTimeout(resolve, pollInterval));
      } catch (error: any) {
        logError(`Monitor error: ${error.message}`);
        return false;
      }
    }

    logWarning('Execution timeout - still running after 30s');
    return false;
  }

  private async getExecutionLogs(executionId: string) {
    try {
      const { ExecutionService } = await import('../apps/api/services/assistbuild/execution.service.js');
      return await ExecutionService.getExecutionLogs(executionId, TENANT_ID);
    } catch (error: any) {
      logError(`Get logs error: ${error.message}`);
      return null;
    }
  }

  private async getWorkflowStats(workflowId: string) {
    try {
      const { WorkflowService } = await import('../apps/api/services/assistbuild/workflow.service.js');
      return await WorkflowService.getStats(workflowId, TENANT_ID);
    } catch (error: any) {
      logError(`Get stats error: ${error.message}`);
      return null;
    }
  }

  async cleanup() {
    logSection('Cleanup');
    
    try {
      // Delete test executions
      if (this.createdExecutionIds.length > 0) {
        log(`Deleting ${this.createdExecutionIds.length} executions...`, 'yellow');
        await db
          .delete(assistbuildExecutions)
          .where(eq(assistbuildExecutions.tenantId, TENANT_ID));
        logSuccess('Executions deleted');
      }

      // Delete test workflows
      if (this.createdWorkflowIds.length > 0) {
        log(`Deleting ${this.createdWorkflowIds.length} workflows...`, 'yellow');
        await db
          .delete(assistbuildWorkflows)
          .where(eq(assistbuildWorkflows.tenantId, TENANT_ID));
        logSuccess('Workflows deleted');
      }

      logSuccess('Cleanup completed');
    } catch (error: any) {
      logError(`Cleanup error: ${error.message}`);
    }
  }

  async listScenarios() {
    logSection('Available Test Scenarios');
    Object.entries(scenarios).forEach(([id, scenario]) => {
      log(`\n${id}. ${scenario.name}`, 'cyan');
      logInfo(`   ${scenario.description}`);
      logInfo(`   Nodes: ${scenario.workflow.definition.nodes.length}`);
      logInfo(`   Edges: ${scenario.workflow.definition.edges.length}`);
    });
    console.log('');
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const scenarioArg = args.find(arg => arg.startsWith('--scenario='));
  const cleanupFlag = args.includes('--cleanup');
  const listFlag = args.includes('--list');

  const tester = new WorkflowTester();

  try {
    if (listFlag) {
      await tester.listScenarios();
      return;
    }

    // Wait for Redis to initialize (for workflow execution queue)
    if (!cleanupFlag) {
      logInfo('Waiting for Redis initialization...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    if (cleanupFlag) {
      await tester.cleanup();
      return;
    }

    if (scenarioArg) {
      const scenarioId = parseInt(scenarioArg.split('=')[1]);
      await tester.runScenario(scenarioId);
    } else {
      // Run all scenarios
      logSection('Running All Test Scenarios');
      const results = [];
      
      for (const id of Object.keys(scenarios)) {
        const success = await tester.runScenario(parseInt(id));
        results.push({ id, success });
        
        // Wait between tests
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      // Summary
      logSection('Test Summary');
      results.forEach(({ id, success }) => {
        const status = success ? '✅ PASS' : '❌ FAIL';
        log(`Scenario ${id}: ${status}`, success ? 'green' : 'red');
      });

      const passCount = results.filter(r => r.success).length;
      const totalCount = results.length;
      log(`\nTotal: ${passCount}/${totalCount} passed`, passCount === totalCount ? 'green' : 'yellow');
    }

    // Cleanup after tests
    if (!args.includes('--no-cleanup')) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      await tester.cleanup();
    }

  } catch (error: any) {
    logError(`Test execution failed: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

main();
