import { db } from '../apps/api/db.js';
import { assistbuildExecutions } from '../shared/schema.js';
import { desc } from 'drizzle-orm';

const executions = await db.select().from(assistbuildExecutions).orderBy(desc(assistbuildExecutions.createdAt)).limit(5);

console.log('\n📊 Recent Executions:\n');
executions.forEach(ex => {
  console.log(`ID: ${ex.id}`);
  console.log(`Workflow: ${ex.workflowId}`);
  console.log(`Status: ${ex.status}`);
  console.log(`Error: ${ex.errorMessage || 'None'}`);
  if (ex.errorStack) {
    console.log(`Stack:\n${ex.errorStack}`);
  }
  console.log('---\n');
});
