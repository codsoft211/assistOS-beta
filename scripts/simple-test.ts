import { db } from '../apps/api/db.js';
import { assistbuildWorkflows, assistbuildExecutions } from '../shared/schema.js';
import { eq } from 'drizzle-orm';

const TENANT_ID = 'test-tenant';
const USER_ID = 'test-user';

console.log('\n🧪 Creating simple test workflow...\n');

// Create workflow directly in DB
const [workflow] = await db
  .insert(assistbuildWorkflows)
  .values({
    name: 'Debug Test Workflow',
    description: 'Simple test',
    definition: {
      nodes: [
        {
          id: 'trigger-1',
          type: 'manual_trigger',
          name: 'Start',
          position: { x: 100, y: 100 },
          config: {},
        },
        {
          id: 'crud-1',
          type: 'crud_record',
          name: 'Create Customer',
          position: { x: 300, y: 100 },
          config: {
            operation: 'create',
            moduleId: 'customers',
            recordData: {
              name: 'Test Customer',
              email: 'test@example.com',
            },
          },
        },
      ],
      edges: [
        { source: 'trigger-1', target: 'crud-1' },
      ],
    },
    environment: 'sandbox',
    status: 'published',
    publishedAt: new Date(),
    triggerType: 'manual',
    createdBy: USER_ID,
    tenantId: TENANT_ID,
  })
  .returning();

console.log(`✅ Workflow created: ${workflow.id}\n`);

// Create execution
const { ExecutionService } = await import('../apps/api/services/assistbuild/execution.service.js');

const execution = await ExecutionService.createExecution({
  workflowId: workflow.id,
  tenantId: TENANT_ID,
  userId: USER_ID,
  environment: 'sandbox',
});

console.log(`✅ Execution created: ${execution.id}\n`);

// Enqueue it
console.log('📤 Enqueuing execution...\n');
await ExecutionService.enqueueExecution({
  workflowId: workflow.id,
  executionId: execution.id,
  tenantId: TENANT_ID,
  userId: USER_ID,
  environment: 'sandbox',
});

console.log('✅ Execution enqueued\n');
console.log('⏳ Waiting 5 seconds for worker to process...\n');

// Wait for execution
await new Promise(resolve => setTimeout(resolve, 5000));

// Check status
const [updated] = await db
  .select()
  .from(assistbuildExecutions)
  .where(eq(assistbuildExecutions.id, execution.id));

console.log('📊 Execution Status:');
console.log(`   Status: ${updated.status}`);
console.log(`   Error: ${updated.errorMessage || 'None'}`);

if (updated.errorStack) {
  console.log('\n📜 Full Error Stack:');
  console.log(updated.errorStack);
}

// Cleanup
await db.delete(assistbuildExecutions).where(eq(assistbuildExecutions.id, execution.id));
await db.delete(assistbuildWorkflows).where(eq(assistbuildWorkflows.id, workflow.id));

console.log('\n✅ Cleanup complete\n');
