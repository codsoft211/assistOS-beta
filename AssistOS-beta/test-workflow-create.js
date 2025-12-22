// Simple test to create a new workflow with correct config
const timestamp = Date.now();
const workflowData = {
  "name": "Test Client Creation Workflow",
  "description": "Test workflow to create clients",
  "definition": {
    "nodes": [
      {
        "id": "manual_trigger-" + timestamp,
        "type": "manual_trigger",
        "name": "Manual Trigger",
        "position": { "x": 100, "y": 100 },
        "config": { "label": "Start" }
      },
      {
        "id": "crud_record-" + timestamp,
        "type": "crud_record", 
        "name": "CRUD Operation",
        "position": { "x": 400, "y": 100 },
        "config": {
          "operation": "create",
          "entity": "clients",
          "data": {
            "name": "{{trigger.firstName}} {{trigger.lastName}}",
            "email": "{{trigger.email}}",
            "phone": "{{trigger.phone}}",
            "clientType": "particular"
          }
        }
      }
    ],
    "edges": [
      {
        "id": "edge-" + timestamp,
        "source": "manual_trigger-" + timestamp,
        "target": "crud_record-" + timestamp
      }
    ]
  },
  "environment": "sandbox"
};

console.log('Test workflow data:');
console.log(JSON.stringify(workflowData, null, 2));

console.log('\nStep 1 - Create workflow:');
console.log(`curl 'http://localhost:5000/api/assistbuild/workflows' \\
  -X 'POST' \\
  -H 'Content-Type: application/json' \\
  -b 'connect.sid=s%3AckxqHSCvl412aKOHpJQVj_Z6e2FKg45U.9qln%2F0v8bcX1f7nKzOswaHgtDv5i4RnVkT6GJcY58%2Bs' \\
  --data-raw '${JSON.stringify(workflowData)}'`);

console.log('\nStep 2 - Publish workflow (replace WORKFLOW_ID):');
console.log(`curl 'http://localhost:5000/api/assistbuild/workflows/WORKFLOW_ID/publish' \\
  -X 'POST' \\
  -H 'Content-Type: application/json' \\
  -b 'connect.sid=s%3AckxqHSCvl412aKOHpJQVj_Z6e2FKg45U.9qln%2F0v8bcX1f7nKzOswaHgtDv5i4RnVkT6GJcY58%2Bs'`);

console.log('\nStep 3 - Execute workflow (replace WORKFLOW_ID):');
console.log(`curl 'http://localhost:5000/api/assistbuild/workflows/WORKFLOW_ID/execute' \\
  -X 'POST' \\
  -H 'Content-Type: application/json' \\
  -b 'connect.sid=s%3AckxqHSCvl412aKOHpJQVj_Z6e2FKg45U.9qln%2F0v8bcX1f7nKzOswaHgtDv5i4RnVkT6GJcY58%2Bs' \\
  --data-raw '{"environment":"sandbox","triggerData":{"firstName":"John","lastName":"Doe","email":"john@example.com","phone":"+1234567890"}}'`);