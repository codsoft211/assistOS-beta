/**
 * Caso Mafmo - Demonstração End-to-End do Execution Engine
 * 
 * Cenário: Cotação de fornecedor de alto valor (€50,000) dispara:
 * - EventBus automation (detecta, transforma, notifica)
 * - Workflow de aprovação multinível
 * - Agent AI para análise de fornecedor
 * - Monitoring dashboard
 */

import { eventBus } from './EventBus';
import { workflowScheduler } from './WorkflowScheduler';
import { agentScheduler } from './AgentScheduler';
import { db } from '../../apps/api/db';
import { 
  tenantAutomations, 
  tenantWorkflows,
  automationExecutions,
  workflowExecutions,
  users,
  tenants
} from '../../shared/schema';
import { eq, desc } from 'drizzle-orm';

const DEMO_TENANT_ID = 'demo-mafmo-tenant';
const DEMO_USER_ID = 'demo-user-mafmo';

/**
 * Step 0: Ensure demo tenant and user exist
 */
async function ensureDemoTenantAndUser() {
  // Check if tenant exists
  const existingTenant = await db.select()
    .from(tenants)
    .where(eq(tenants.id, DEMO_TENANT_ID))
    .limit(1);
  
  if (existingTenant.length === 0) {
    console.log('[Setup] Creating demo tenant...');
    await db.insert(tenants).values({
      id: DEMO_TENANT_ID,
      name: 'Mafmo Demo Company',
      slug: 'mafmo-demo',
      industry: 'Manufacturing',
      status: 'active',
    });
  }
  
  // Check if user exists
  const existingUser = await db.select()
    .from(users)
    .where(eq(users.id, DEMO_USER_ID))
    .limit(1);
  
  if (existingUser.length === 0) {
    console.log('[Setup] Creating demo user...');
    await db.insert(users).values({
      id: DEMO_USER_ID,
      email: 'demo@mafmo.pt',
      firstName: 'Demo',
      lastName: 'User',
      password: 'demo-password-hash',
      isActive: true,
    });
  }
}

/**
 * Step 1: Setup - Create automation and workflow configurations
 */
async function setupDemoConfigurations() {
  console.log('\n🔧 SETUP: Creating demo configurations...\n');
  
  // 1. Create Automation: "High-Value Quote Detector"
  const automationId = 'auto-high-value-quote';
  
  await db.insert(tenantAutomations).values({
    id: automationId,
    tenantId: DEMO_TENANT_ID,
    name: 'High-Value Quote Detector',
    description: 'Detecta cotações acima de €40k e inicia processo de aprovação',
    triggerType: 'event',
    triggerConfig: {
      eventType: 'supplier.quote.received',
      conditions: [
        {
          field: 'totalAmount',
          operator: '>',
          value: 40000
        }
      ]
    },
    actions: [
      {
        type: 'transform_data',
        config: {
          input: '$event',
          mapping: {
            vendorId: 'supplierId',
            amount: 'totalAmount',
            status: '@PENDING_APPROVAL'
          }
        },
        order: 1
      },
      {
        type: 'send_notification',
        config: {
          userId: DEMO_USER_ID,
          title: 'High-Value Quote Alert',
          message: 'New supplier quote received for €50,000',
          type: 'warning'
        },
        order: 2
      },
      {
        type: 'log_event',
        config: {
          eventType: 'procurement.high_value_quote_detected',
          eventData: {
            quoteId: '$context.quoteId',
            amount: '$context.amount',
            vendor: '$context.vendorId'
          }
        },
        order: 3
      }
    ],
    isActive: true,
    createdBy: DEMO_USER_ID,
    category: 'procurement',
  }).onConflictDoNothing();
  
  console.log(`✅ Automation created: ${automationId}`);
  
  // 2. Create Workflow: "Multi-Level Approval Process"
  const workflowId = 'wf-approval-multilevel';
  
  await db.insert(tenantWorkflows).values({
    id: workflowId,
    tenantId: DEMO_TENANT_ID,
    name: 'Multi-Level Approval Process',
    description: 'Aprovação sequencial: Manager → Finance → C-Level',
    triggerType: 'manual',
    steps: [
      {
        id: 'step-1',
        name: 'Manager Approval',
        type: 'wait',
        config: { duration: 1000 },
        nextSteps: ['step-2'],
        order: 1
      },
      {
        id: 'step-2',
        name: 'Finance Review',
        type: 'transform_data',
        config: {
          input: {},
          mapping: {
            stage: '@FINANCE_REVIEW',
            reviewedAt: '@now'
          }
        },
        nextSteps: ['step-3'],
        order: 2
      },
      {
        id: 'step-3',
        name: 'C-Level Decision',
        type: 'send_notification',
        config: {
          userId: DEMO_USER_ID,
          title: 'C-Level Approval Required',
          message: 'Please review and approve procurement request',
          type: 'info'
        },
        nextSteps: ['step-4'],
        order: 3
      },
      {
        id: 'step-4',
        name: 'Final Approval',
        type: 'transform_data',
        config: {
          input: {},
          mapping: {
            finalStatus: '@APPROVED',
            approvedAt: '@now'
          }
        },
        nextSteps: [],
        order: 4
      }
    ],
    isActive: true,
    createdBy: DEMO_USER_ID,
    category: 'approval',
    estimatedDurationMinutes: 5,
  }).onConflictDoNothing();
  
  console.log(`✅ Workflow created: ${workflowId}`);
  
  // Note: We don't create an agent config in the database because
  // the AgentScheduler works with agent IDs directly without DB config
  const agentId = 'supplier-analyzer';
  console.log(`✅ Agent ID prepared: ${agentId}`);
  
  return { automationId, workflowId, agentId };
}

/**
 * Step 2: Execute - Trigger the complete flow
 */
async function executeDemoFlow(automationId: string, workflowId: string, agentId: string) {
  console.log('\n🚀 EXECUTION: Starting demo flow...\n');
  
  // 1. Publish supplier quote event
  console.log('📨 Publishing event: supplier.quote.received');
  
  await eventBus.publish(
    DEMO_TENANT_ID,
    'supplier.quote.received',
    {
      quoteId: 'QT-2025-001',
      supplierId: 'SUPPLIER-ACME',
      supplierName: 'ACME Industrial Equipment Ltd.',
      totalAmount: 50000,
      items: [
        { description: 'CNC Machine Model X500', quantity: 1, unitPrice: 45000 },
        { description: 'Installation & Training', quantity: 1, unitPrice: 5000 }
      ],
      deliveryTime: '45 days',
      validUntil: '2025-02-01'
    },
    DEMO_USER_ID
  );
  
  // 2. Wait for automation processing and then trigger it manually
  console.log('⏳ Processing event with EventBus...');
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Use processNow() for deterministic testing
  await eventBus.processNow();
  
  console.log('✅ Automation should have executed');
  
  // 3. Execute workflow on-demand
  console.log('\n📋 Executing approval workflow...');
  
  const workflowExecutionId = await workflowScheduler.executeNow(
    workflowId,
    DEMO_TENANT_ID,
    DEMO_USER_ID,
    { quoteId: 'QT-2025-001', requestedAmount: 50000 }
  );
  
  console.log(`✅ Workflow execution started: ${workflowExecutionId}`);
  
  // Wait for workflow to complete
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  // 4. Run agent analysis
  console.log('\n🤖 Running agent analysis...');
  
  try {
    const agentExecutionId = await agentScheduler.executeNow(
      DEMO_TENANT_ID,
      agentId,
      'specialized',
      {
        task: 'Analyze supplier quote QT-2025-001 from ACME Industrial for €50,000. Check supplier reputation, pricing competitiveness, and delivery timeline. Provide approval recommendation.',
        context: {
          quoteId: 'QT-2025-001',
          supplier: 'ACME Industrial Equipment Ltd.',
          amount: 50000,
          deliveryDays: 45
        }
      }
    );
    
    console.log(`✅ Agent execution started: ${agentExecutionId}`);
    
    // Wait for agent to complete (multi-turn may take time)
    await new Promise(resolve => setTimeout(resolve, 8000));
  } catch (error: any) {
    // Graceful degradation if ANTHROPIC_API_KEY not configured
    if (error.message.includes('API key') || error.message.includes('ANTHROPIC')) {
      console.log('⚠️  Agent execution skipped (ANTHROPIC_API_KEY not configured)');
      console.log('   This is expected in environments without AI credentials.');
    } else {
      console.error('❌ Agent execution error:', error.message);
    }
  }
}

/**
 * Step 3: Validate - Check execution results
 */
async function validateResults() {
  console.log('\n📊 VALIDATION: Checking execution results...\n');
  
  // 1. Check automation executions
  const automationExecs = await db.select()
    .from(automationExecutions)
    .where(eq(automationExecutions.tenantId, DEMO_TENANT_ID))
    .orderBy(desc(automationExecutions.startedAt))
    .limit(5);
  
  console.log(`✅ Automation executions found: ${automationExecs.length}`);
  automationExecs.forEach(exec => {
    console.log(`   - ${exec.id}: ${exec.status} (${exec.completedAt ? 'completed' : 'running'})`);
    if (exec.actionsExecuted) {
      console.log(`     Actions: ${exec.actionsExecuted.length} executed`);
    }
  });
  
  // 2. Check workflow executions
  const workflowExecs = await db.select()
    .from(workflowExecutions)
    .where(eq(workflowExecutions.tenantId, DEMO_TENANT_ID))
    .orderBy(desc(workflowExecutions.startedAt))
    .limit(5);
  
  console.log(`\n✅ Workflow executions found: ${workflowExecs.length}`);
  workflowExecs.forEach(exec => {
    console.log(`   - ${exec.id}: ${exec.status}`);
    if (exec.stepsExecuted) {
      console.log(`     Steps: ${exec.stepsExecuted.length} executed`);
    }
  });
  
  // 3. Summary stats
  const completedAutomations = automationExecs.filter(e => e.status === 'success').length;
  const completedWorkflows = workflowExecs.filter(e => e.status === 'completed').length;
  
  console.log('\n📈 SUMMARY:');
  console.log(`   Automations completed: ${completedAutomations}/${automationExecs.length}`);
  console.log(`   Workflows completed: ${completedWorkflows}/${workflowExecs.length}`);
  console.log(`   ✅ Visit http://localhost:5000/admin/monitoring to see dashboard!`);
}

/**
 * Main demo runner
 */
async function runDemoMafmo() {
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║       CASO MAFMO - Execution Engine Demo                     ║');
  console.log('║       Procurement High-Value Quote → Full Flow                ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  
  try {
    // Step 0: Ensure demo tenant and user exist
    await ensureDemoTenantAndUser();
    
    // Step 1: Setup configurations
    const { automationId, workflowId, agentId } = await setupDemoConfigurations();
    
    // Step 2: Execute flow
    await executeDemoFlow(automationId, workflowId, agentId);
    
    // Step 3: Validate results
    await validateResults();
    
    console.log('\n✅ Demo completed successfully!');
    console.log('🌐 Open http://localhost:5000/admin/monitoring to see results\n');
    
  } catch (error) {
    console.error('\n❌ Demo failed:', error);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  runDemoMafmo()
    .then(() => {
      console.log('Demo finished, exiting...');
      process.exit(0);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

export { runDemoMafmo };
