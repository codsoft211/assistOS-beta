import { ExecutionService } from '../apps/api/services/assistbuild/execution.service.js';
import { WorkflowService } from '../apps/api/services/assistbuild/workflow.service.js';

console.log('Creating a simple test workflow...\n');

// Create a simple workflow
const workflow = await WorkflowService.createWorkflow({
  tenantId: 'test-tenant',
  userId: 'test-user',
  name: 'Debug Workflow',
  description: 'Simple test to debug execution',
  nodes: [
    {
      id: 'trigger-1',
      type: 'manual_trigger',
      name: 'Start',
      position: { x: 0, y: 0 },
      config: {},
    },
    {
      id: 'crud-1',
      type: 'crud_record',
      name: 'Create Customer',
      position: { x: 200, y: 0 },
      config: {
        operation: 'create',
        tableName: 'customers',
        record: {
          name: 'Test Customer',
          email: 'test@example.com',
        },
      },
    },
  ],
  edges: [
    { source: 'trigger-1', target: 'crud-1' },
  ],
});

console.log(`✅ Workflow created: ${workflow.id}\n`);

// Publish it
await WorkflowService.publishWorkflow(workflow.id, 'test-tenant');
console.log('✅ Workflow published\n');

// Execute it
const execution = await ExecutionService.createExecution({
  workflowId: workflow.id,
  tenantId: 'test-tenant',
  userId: 'test-user',
  environment: 'sandbox',
});

console.log(`✅ Execution created: ${execution.id}\n`);

// Enqueue execution
await ExecutionService.enqueueExecution({
  workflowId: workflow.id,
  executionId: execution.id,
  tenantId: 'test-tenant',
  userId: 'test-user',
  environment: 'sandbox',
});

console.log('✅ Execution enqueued\n');
console.log('⏳ Now check the worker logs for execution details...\n');
console.log(`To monitor: SELECT * FROM assistbuild_executions WHERE id = '${execution.id}'\n`);

// Wait a bit then check status
await new Promise(resolve => setTimeout(resolve, 3000));

const { db } = await import('../apps/api/db.js');
const { assistbuildExecutions } = await import('../shared/schema.js');
const { eq } = await import('drizzle-orm');

const [updated] = await db.select().from(assistbuildExecutions).where(eq(assistbuildExecutions.id, execution.id));

console.log('\n📊 Execution Status:');
console.log(`   Status: ${updated.status}`);
console.log(`   Error: ${updated.errorMessage || 'None'}`);
if (updated.errorStack) {
  console.log(`\n📜 Error Stack:\n${updated.errorStack}`);
}
