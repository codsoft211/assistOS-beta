# AssistBuild Workflow API Reference

## Base URL
```
http://localhost:5000/api/assistbuild
```

All endpoints require authentication and tenant context.

## 🔧 Workflow Management

### Create Workflow
```http
POST /workflows
Content-Type: application/json

{
  "name": "Customer Onboarding",
  "description": "Automated customer onboarding workflow",
  "environment": "sandbox",
  "definition": {
    "nodes": [
      {
        "id": "trigger-1",
        "type": "manual_trigger",
        "name": "Start",
        "position": { "x": 100, "y": 100 },
        "config": {}
      },
      {
        "id": "crud-1",
        "type": "crud_record",
        "name": "Create Customer",
        "position": { "x": 300, "y": 100 },
        "config": {
          "operation": "create",
          "moduleId": "customers",
          "recordData": {
            "name": "{{trigger.data.customerName}}",
            "email": "{{trigger.data.email}}"
          }
        }
      }
    ],
    "edges": [
      {
        "id": "edge-1",
        "source": "trigger-1",
        "target": "crud-1"
      }
    ]
  }
}
```

### List Workflows
```http
GET /workflows?status=published&environment=sandbox&page=1&limit=20
```

Query Parameters:
- `status` - Filter by status: `draft`, `published`, `archived`
- `environment` - Filter by environment: `sandbox`, `production`
- `page` - Page number (default: 1)
- `limit` - Results per page (default: 20)

### Get Workflow
```http
GET /workflows/:id
```

### Update Workflow
```http
PUT /workflows/:id
Content-Type: application/json

{
  "name": "Updated Name",
  "description": "Updated description",
  "definition": { ... }
}
```

### Delete Workflow
```http
DELETE /workflows/:id
```

### Publish Workflow
```http
POST /workflows/:id/publish
```

Makes workflow active and validates it before publishing.

### Archive Workflow
```http
POST /workflows/:id/archive
```

Soft deletes workflow (status becomes `archived`).

### Duplicate Workflow
```http
POST /workflows/:id/duplicate
```

Creates a copy with "(Copy)" suffix in name.

### Get Workflow Statistics
```http
GET /workflows/:id/stats
```

Returns execution statistics for the workflow.

## ▶️ Execution Management

### Execute Workflow
```http
POST /workflows/:id/execute
Content-Type: application/json

{
  "triggerData": {
    "customerName": "John Doe",
    "email": "john@example.com"
  },
  "environment": "sandbox"
}
```

Returns:
```json
{
  "id": "exec-uuid",
  "workflowId": "workflow-uuid",
  "status": "pending",
  "environment": "sandbox",
  "triggerData": { ... },
  "createdAt": "2025-12-16T10:00:00Z"
}
```

### List Executions
```http
GET /executions?workflowId=xxx&status=running&page=1&limit=20
```

Query Parameters:
- `workflowId` - Filter by workflow ID
- `status` - Filter by status: `pending`, `running`, `completed`, `failed`, `cancelled`
- `page` - Page number (default: 1)
- `limit` - Results per page (default: 20)

### Get Execution
```http
GET /executions/:id
```

Returns execution details with workflow information.

### Get Execution Logs
```http
GET /executions/:id/logs
```

Returns node-level execution logs:
```json
[
  {
    "id": "log-uuid",
    "executionId": "exec-uuid",
    "nodeId": "trigger-1",
    "nodeType": "manual_trigger",
    "nodeName": "Start",
    "status": "success",
    "startedAt": "2025-12-16T10:00:00Z",
    "completedAt": "2025-12-16T10:00:01Z",
    "durationMs": 50,
    "outputData": { ... }
  },
  ...
]
```

### Get Execution Summary
```http
GET /executions/:id/summary
```

Returns comprehensive summary with progress:
```json
{
  "execution": { ... },
  "workflow": { ... },
  "logs": [ ... ],
  "totalNodes": 2,
  "successfulNodes": 2,
  "failedNodes": 0,
  "progress": 100
}
```

### Cancel Execution
```http
POST /executions/:id/cancel
```

Cancels a running execution.

### Retry Execution
```http
POST /executions/:id/retry
```

Creates a new execution with same parameters as failed execution.

## 📊 Statistics

### Tenant Statistics
```http
GET /stats
```

Returns:
```json
{
  "totalWorkflows": 15,
  "publishedWorkflows": 10,
  "totalExecutions": 150,
  "successfulExecutions": 140,
  "failedExecutions": 10,
  "averageDuration": 2500,
  "recentExecutions": [ ... ]
}
```

## 🔐 Authentication

All endpoints require:
1. **Session Cookie** or **Bearer Token**
2. **Tenant Context** (via subdomain or header)

Example with curl:
```bash
curl -X POST http://localhost:5000/api/assistbuild/workflows \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid=xxx" \
  -d '{ "name": "Test Workflow", ... }'
```

## 📝 Node Types (Phase 1)

### Manual Trigger
```json
{
  "type": "manual_trigger",
  "config": {}
}
```

Entry point for workflows. No configuration needed.

### CRUD Record
```json
{
  "type": "crud_record",
  "config": {
    "operation": "create|read|update|delete",
    "moduleId": "customers",
    "recordData": { ... },
    "filters": { ... },
    "recordId": "optional-id",
    "outputVariable": "customer"
  }
}
```

Operations:
- **CREATE**: Inserts new record (`recordData` required)
- **READ**: Queries records (`filters` or `recordId`)
- **UPDATE**: Updates record (`recordId` + `recordData` required)
- **DELETE**: Removes record (`recordId` required)

## 🚨 Error Responses

All endpoints follow standard error format:

```json
{
  "error": "Human-readable error message",
  "details": [ ... ] // Optional validation errors
}
```

Status Codes:
- `200` - Success
- `201` - Created
- `202` - Accepted (async operation)
- `204` - No Content (successful deletion)
- `400` - Bad Request (validation error)
- `401` - Unauthorized
- `404` - Not Found
- `500` - Internal Server Error

## 📖 Example: Complete Workflow

```bash
# 1. Create workflow
WORKFLOW_ID=$(curl -s -X POST http://localhost:5000/api/assistbuild/workflows \
  -H "Content-Type: application/json" \
  -d '{ "name": "Test", "definition": { ... } }' | jq -r '.id')

# 2. Publish workflow
curl -X POST http://localhost:5000/api/assistbuild/workflows/$WORKFLOW_ID/publish

# 3. Execute workflow
EXEC_ID=$(curl -s -X POST http://localhost:5000/api/assistbuild/workflows/$WORKFLOW_ID/execute \
  -H "Content-Type: application/json" \
  -d '{ "triggerData": { "test": true } }' | jq -r '.id')

# 4. Monitor execution
curl http://localhost:5000/api/assistbuild/executions/$EXEC_ID/summary

# 5. Get logs
curl http://localhost:5000/api/assistbuild/executions/$EXEC_ID/logs
```

## 🔄 Workflow Status Lifecycle

```
draft → published → archived
  ↓        ↓
  └─────→ deleted
```

- **draft**: Can be edited, cannot be executed
- **published**: Active, can be executed, limited editing
- **archived**: Soft deleted, can be restored
- **deleted**: Hard deleted (via DELETE endpoint)

## 📈 Monitoring

Use these endpoints for real-time monitoring:
1. `GET /executions?status=running` - Active executions
2. `GET /executions/:id/logs` - Node-level progress
3. `GET /stats` - Overall health metrics
