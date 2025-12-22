import fs from 'fs';
import path from 'path';

// Read the demo workflow
const workflowData = JSON.parse(fs.readFileSync('./demo-workflow.json', 'utf8'));

console.log('Demo Workflow Data:');
console.log(JSON.stringify(workflowData, null, 2));

console.log('\n=== FRONTEND USAGE ===');
console.log('1. Go to /workflows/builder/new');
console.log('2. Set workflow name to: "Demo Customer Creation Workflow"');
console.log('3. Add Manual Trigger node with config:');
console.log(JSON.stringify(workflowData.definition.nodes[0].data.config, null, 2));

console.log('\n4. Add CRUD Record node with config:');
console.log(JSON.stringify(workflowData.definition.nodes[1].data.config, null, 2));

console.log('\n5. Connect Manual Trigger -> CRUD Record');
console.log('\n6. Save and Execute with trigger data:');
console.log(JSON.stringify({
  firstName: 'John',
  lastName: 'Doe',
  email: 'john@example.com', 
  phone: '+1234567890'
}, null, 2));

console.log('\n=== EXPECTED BEHAVIOR ===');
console.log('- Manual trigger should store: { firstName: "John", lastName: "Doe", email: "john@example.com", phone: "+1234567890" }');
console.log('- CRUD node should resolve variables: {{trigger.firstName}} -> "John"');
console.log('- Final INSERT should be: { firstName: "John", lastName: "Doe", email: "john@example.com", phone: "+1234567890" }');