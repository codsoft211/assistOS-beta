#!/usr/bin/env node

import { db } from './apps/api/db.js';
import { assistbuildWorkflows } from './shared/schema.js';
import { eq } from 'drizzle-orm';

async function checkWorkflow() {
  try {
    // Get the workflow that's failing
    const workflowId = '68b813a0-23c3-49b8-9765-336c2c7d3457';
    
    const [workflow] = await db
      .select()
      .from(assistbuildWorkflows)
      .where(eq(assistbuildWorkflows.id, workflowId));

    if (!workflow) {
      console.log('❌ Workflow not found');
      return;
    }

    console.log('✅ Workflow found:');
    console.log('ID:', workflow.id);
    console.log('Name:', workflow.name);
    console.log('Status:', workflow.status);
    console.log('Environment:', workflow.environment);
    console.log('\n📋 Definition:');
    console.log(JSON.stringify(workflow.definition, null, 2));

    // Check specifically for CRUD nodes
    const nodes = workflow.definition.nodes;
    const crudNodes = nodes.filter(node => node.type === 'crud_record');
    
    console.log('\n🔍 CRUD Nodes Analysis:');
    crudNodes.forEach((node, index) => {
      console.log(`\nCRUD Node ${index + 1}:`);
      console.log('  ID:', node.id);
      console.log('  Name:', node.name);
      console.log('  Config:', JSON.stringify(node.config, null, 4));
      console.log('  Has recordData:', !!(node.config && node.config.recordData));
      console.log('  Has data:', !!(node.config && node.config.data));
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    process.exit(0);
  }
}

checkWorkflow();