#!/usr/bin/env npx tsx
/**
 * Demo Script: Create and Execute Invoice Email Workflow
 * 
 * This script:
 * 1. Creates a workflow with Schedule Trigger → Fetch Invoice → Send Email nodes
 * 2. Optionally schedules it or runs immediately for demo
 * 
 * Usage:
 *   npx tsx scripts/invoice-workflow/run-demo.ts
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import 'dotenv/config';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL not found in environment');
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL });
const db = drizzle(pool);

// Demo tenant and user (use existing ones from your system)
const DEMO_TENANT_ID = process.argv[2] || 'demo-tenant-id';
const DEMO_USER_ID = process.argv[3] || 'demo-user-id';

async function createDemoWorkflow() {
  console.log('\n🚀 Invoice Email Workflow Demo\n');
  console.log('═'.repeat(50));
  
  // Check if invoices exist
  const invoiceCheck = await pool.query(`
    SELECT COUNT(*) as count, SUM(amount) as total
    FROM invoice_workflow_schema.invoices
    WHERE status IN ('pending', 'overdue') AND due_date < CURRENT_DATE
  `);
  
  const overdueCount = parseInt(invoiceCheck.rows[0].count);
  const overdueTotal = parseFloat(invoiceCheck.rows[0].total || 0);
  
  console.log(`\n📊 Database Status:`);
  console.log(`   Overdue invoices: ${overdueCount}`);
  console.log(`   Total overdue amount: $${overdueTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
  
  if (overdueCount === 0) {
    console.log('\n⚠️  No overdue invoices found. Run the seed script first:');
    console.log('   npx tsx scripts/invoice-workflow/seed-invoices.ts\n');
    await pool.end();
    return;
  }

  // Create workflow
  const workflowId = randomUUID();
  const workflowName = `Invoice Email Reminder - ${new Date().toISOString().split('T')[0]}`;
  
  const workflowDefinition = {
    nodes: [
      {
        id: 'schedule_1',
        type: 'schedule_trigger',
        position: { x: 100, y: 200 },
        data: {
          label: 'Daily 9 AM',
        },
        config: {
          scheduleType: 'cron',
          cronExpression: '0 9 * * *',
          timezone: 'UTC',
          label: 'Daily Invoice Check'
        }
      },
      {
        id: 'fetch_1',
        type: 'fetch_invoice',
        position: { x: 400, y: 200 },
        data: {
          label: 'Fetch Overdue',
        },
        config: {
          status: 'overdue',
          dueDateRange: 'past',
          limit: 100
        }
      },
      {
        id: 'email_1',
        type: 'send_email',
        position: { x: 700, y: 200 },
        data: {
          label: 'Send Emails',
        },
        config: {
          mode: 'batch',
          toField: '{{customer_email}}',
          subject: 'Invoice Reminder - {{invoice_number}}',
          bodyTemplate: 'Dear {{customer_name}},\n\nThis is a friendly reminder that invoice {{invoice_number}} for ${{amount}} is overdue.\n\nDue Date: {{due_date}}\nAmount: ${{amount}}\n\nPlease arrange payment at your earliest convenience.\n\nBest regards,\nAccounts Team',
          fromName: 'Accounts Team'
        }
      }
    ],
    edges: [
      {
        id: 'e_schedule_fetch',
        source: 'schedule_1',
        target: 'fetch_1',
      },
      {
        id: 'e_fetch_email',
        source: 'fetch_1',
        target: 'email_1',
      }
    ]
  };

  console.log(`\n📝 Creating workflow: "${workflowName}"`);
  
  try {
    // Insert workflow into assistbuild_workflows
    await pool.query(`
      INSERT INTO public.assistbuild_workflows 
      (id, tenant_id, name, description, definition, status, environment, version, created_by)
      VALUES ($1, $2, $3, $4, $5, 'published', 'sandbox', 1, $6)
    `, [
      workflowId,
      DEMO_TENANT_ID,
      workflowName,
      'Automated workflow that fetches overdue invoices and sends email reminders',
      JSON.stringify(workflowDefinition),
      DEMO_USER_ID
    ]);

    console.log(`   ✅ Workflow created: ${workflowId}`);

    // Create execution
    const executionId = randomUUID();
    
    await pool.query(`
      INSERT INTO public.assistbuild_executions
      (id, workflow_id, tenant_id, triggered_by, environment, status)
      VALUES ($1, $2, $3, $4, 'sandbox', 'pending')
    `, [executionId, workflowId, DEMO_TENANT_ID, DEMO_USER_ID]);

    console.log(`   ✅ Execution created: ${executionId}`);
    
    console.log('\n' + '═'.repeat(50));
    console.log('\n📋 DEMO READY!\n');
    console.log('To see this workflow in action:');
    console.log(`\n1. Start the worker:`);
    console.log(`   npx tsx apps/worker/index.ts`);
    console.log(`\n2. Start the API server:`);
    console.log(`   npm run dev`);
    console.log(`\n3. Open the workflow builder at:`);
    console.log(`   http://localhost:5000/workflow-builder?id=${workflowId}`);
    console.log(`\n4. Or trigger execution via API:`);
    console.log(`   curl -X POST http://localhost:3000/api/assistbuild/workflows/${workflowId}/execute`);
    
    console.log('\n' + '═'.repeat(50));
    console.log('\n🔧 Workflow Details:');
    console.log(JSON.stringify(workflowDefinition, null, 2));

  } catch (error) {
    if ((error as any).code === '42P01') {
      console.log('\n❌ Error: assistbuild_workflows table not found.');
      console.log('   Make sure the database schema is set up correctly.');
    } else if ((error as any).code === '23505') {
      console.log('\n⚠️  Workflow already exists. Using existing workflow.');
    } else {
      console.error('\n❌ Error creating workflow:', (error as Error).message);
    }
  }

  await pool.end();
}

createDemoWorkflow().catch(console.error);
