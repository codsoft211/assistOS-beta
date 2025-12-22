/**
 * Integration Test for Execution Engine
 * 
 * Tests the complete event-driven automation flow:
 * 1. Create automation via DB insert
 * 2. Publish event via eventBus.publish()
 * 3. EventBus processes event and finds automation
 * 4. ActionRegistry executes actions
 * 5. Results are persisted in automationExecutions
 * 
 * THIS IS A REAL TEST WITH EXPLICIT ASSERTIONS
 */

import { db } from '../../apps/api/db';
import { tenantAutomations, eventLog, automationExecutions } from '../../shared/schema';
import { eventBus } from './EventBus';
import { eq, and, desc } from 'drizzle-orm';

/**
 * Integration test for Execution Engine
 * Tests: Event → Automation → Action execution
 */
export async function testExecutionEngine() {
  console.log('\n=== EXECUTION ENGINE INTEGRATION TEST ===\n');
  
  // IMPORTANT: Replace these with actual tenant and user IDs from your database
  const TEST_TENANT_ID = '56d3bcf5-0fe9-4af9-8bf5-808792df1e9e';
  const TEST_USER_ID = '694d34ec-27dc-4ccc-bf57-6b9b2d333eac';
  
  try {
    // Step 1: Create test automation
    console.log('📝 Step 1: Creating test automation...');
    
    const [automation] = await db.insert(tenantAutomations).values({
      tenantId: TEST_TENANT_ID,
      name: 'Test Lead Welcome Email',
      description: 'Send welcome email when lead is created',
      triggerType: 'event',
      triggerConfig: {
        eventType: 'lead.created' // Match this event type
      },
      actions: [
        {
          type: 'log_event',
          config: {
            message: 'Lead created: {{leadName}}',
            level: 'info',
            category: 'leads'
          },
          order: 0
        },
        {
          type: 'send_notification',
          config: {
            userId: TEST_USER_ID,
            title: 'New Lead Created',
            message: 'Lead {{leadName}} was added to the system',
            type: 'info',
            category: 'sales'
          },
          order: 1
        }
      ],
      isActive: true,
      createdBy: TEST_USER_ID,
    }).returning();
    
    console.log(`✅ Automation created: ${automation.id} - "${automation.name}"`);
    
    // Step 2: Publish event
    console.log('\n📢 Step 2: Publishing event...');
    
    const eventId = await eventBus.publish(
      TEST_TENANT_ID,
      'lead.created',
      {
        leadId: 'test-lead-123',
        leadName: 'Acme Corp',
        leadEmail: 'contact@acme.com',
        source: 'website'
      },
      TEST_USER_ID
    );
    
    console.log(`✅ Event published: ${eventId}`);
    
    // Step 3: Trigger event processing (deterministic - no polling wait)
    console.log('\n⚡ Step 3: Processing events...');
    await eventBus.processNow();
    console.log('✅ Events processed');
    
    // Step 4: Check event was processed
    console.log('\n🔍 Step 4: Checking event status...');
    
    const event = await db.select()
      .from(eventLog)
      .where(eq(eventLog.id, eventId))
      .limit(1);
    
    // ASSERTION 1: Event must exist
    if (!event[0]) {
      throw new Error(`❌ ASSERTION FAILED: Event not found in database (eventId: ${eventId})`);
    }
    
    // ASSERTION 2: Event must be processed
    if (event[0].status !== 'processed') {
      throw new Error(`❌ ASSERTION FAILED: Event NOT processed (status: ${event[0].status}). Expected: processed`);
    }
    
    console.log(`✅ Event processed successfully`);
    console.log(`   - Automations triggered: ${event[0].automationsTriggered}`);
    console.log(`   - Processed at: ${event[0].processedAt}`);
    
    // ASSERTION 3: At least 1 automation must be triggered
    if ((event[0].automationsTriggered || 0) === 0) {
      throw new Error('❌ ASSERTION FAILED: No automations were triggered by this event');
    }
    
    // Step 5: Check automation execution
    console.log('\n🔍 Step 5: Checking automation execution...');
    
    const executions = await db.select()
      .from(automationExecutions)
      .where(
        and(
          eq(automationExecutions.automationId, automation.id),
          eq(automationExecutions.tenantId, TEST_TENANT_ID)
        )
      )
      .orderBy(desc(automationExecutions.startedAt))
      .limit(1);
    
    // ASSERTION 4: Automation execution must exist
    if (executions.length === 0) {
      throw new Error('❌ ASSERTION FAILED: No automation executions found');
    }
    
    const execution = executions[0];
    
    console.log(`✅ Automation executed: ${execution.id}`);
    console.log(`   - Status: ${execution.status}`);
    console.log(`   - Duration: ${execution.durationMs}ms`);
    console.log(`   - Actions executed: ${execution.actionsExecuted?.length || 0}`);
    
    // ASSERTION 5: Execution must succeed (or partial success)
    if (execution.status !== 'success' && execution.status !== 'partial') {
      throw new Error(`❌ ASSERTION FAILED: Execution status is ${execution.status}, expected success or partial`);
    }
    
    // ASSERTION 6: Actions must be executed
    if (!execution.actionsExecuted || execution.actionsExecuted.length === 0) {
      throw new Error('❌ ASSERTION FAILED: No actions were executed');
    }
    
    // ASSERTION 7: Expected number of actions (2 in this case)
    if (execution.actionsExecuted.length !== 2) {
      throw new Error(`❌ ASSERTION FAILED: Expected 2 actions, got ${execution.actionsExecuted.length}`);
    }
    
    // Print action details and assert each action succeeded
    execution.actionsExecuted.forEach((action: any, index: number) => {
      console.log(`   - Action ${index + 1} (${action.actionType}): ${action.status}`);
      
      // ASSERTION 8: Each action must succeed
      if (action.status !== 'success') {
        throw new Error(`❌ ASSERTION FAILED: Action ${action.actionType} failed with status: ${action.status}`);
      }
    });
    
    // Step 6: Cleanup (optional - comment out to keep data)
    console.log('\n🧹 Step 6: Cleanup (optional - comment out to keep data)...');
    // Uncomment the line below to delete the test automation after the test
    // await db.delete(tenantAutomations).where(eq(tenantAutomations.id, automation.id));
    // console.log('✅ Test automation deleted');
    
    console.log('\n=== ✅ ALL ASSERTIONS PASSED ===\n');
    
  } catch (error) {
    console.error('\n❌ TEST FAILED:', error);
    throw error;
  }
}

// Run test if executed directly
// ES module check: import.meta.url matches the process's entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  testExecutionEngine()
    .then(() => {
      console.log('✅ All tests passed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Tests failed:', error);
      process.exit(1);
    });
}
