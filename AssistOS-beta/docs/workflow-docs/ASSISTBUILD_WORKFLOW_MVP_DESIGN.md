# AssistBuild – MVP Workflow Automation Builder

## 📋 Executive Summary

This document defines a production-ready, minimal viable workflow automation system for AssistOS. It leverages existing infrastructure (PostgreSQL multi-tenancy, BullMQ, Redis, AssistME) and restricts scope to **11 carefully chosen nodes** to maximize business value while minimizing time-to-market.

**Key Principles:**
- ✅ Simple, safe, and business-focused
- ✅ Reuses 100% of existing AssistOS infrastructure
- ✅ Multi-tenant by design
- ✅ Production-ready with audit trails
- ❌ No custom scripting
- ❌ No plugin system
- ❌ No advanced routing

---

## 1️⃣ System Architecture

### 1.1 High-Level Component Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        AssistOS Client                       │
│  ┌────────────────┐           ┌─────────────────────────┐  │
│  │  Studio Page   │──────────▶│  Workflow Canvas (React)│  │
│  │  (Container)   │           │  - Node Drag & Drop     │  │
│  └────────────────┘           │  - Edge Connections     │  │
│                                │  - Config Side Panel    │  │
│                                └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                           │
                           │ REST API / WebSocket
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                     AssistOS API Server                      │
│  ┌──────────────────────────────────────────────────────┐  │
│  │         Workflow Management Service                   │  │
│  │  - CRUD workflows (per tenant schema)                │  │
│  │  - Version management (draft ↔ published)           │  │
│  │  - Validation & DAG checks                           │  │
│  │  - NL → Workflow conversion (via AssistME)          │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │         Workflow Execution Service                    │  │
│  │  - Manual trigger handler                            │  │
│  │  - Schedule trigger registration (cron)              │  │
│  │  - Event trigger registration (hooks)                │  │
│  │  - Enqueues jobs to BullMQ                           │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                           │
                           │ Job Queue
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    BullMQ + Redis                            │
│  Queue: workflow_executions_{tenantId}                      │
│  - Retry logic: 3 attempts with backoff                     │
│  - Dead letter queue for failures                           │
│  - Job data: {workflowId, executionId, nodeId, context}    │
└─────────────────────────────────────────────────────────────┘
                           │
                           │ Workers consume jobs
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                  Workflow Execution Worker                   │
│  ┌──────────────────────────────────────────────────────┐  │
│  │           DAG Traversal Engine                        │  │
│  │  - Loads workflow definition from tenant schema      │  │
│  │  - Executes nodes sequentially                       │  │
│  │  - Handles If/Else branching                         │  │
│  │  - Handles Loop iterations                           │  │
│  │  - Handles Approval pauses (human-in-loop)          │  │
│  │  - Logs execution state per node                     │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │           Node Executor Registry                      │  │
│  │  - 11 node type handlers                             │  │
│  │  - Each handler: execute(nodeConfig, context)       │  │
│  │  - Returns: {success, output, error}                │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                           │
                           │ Calls external services
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              External Service Integrations                   │
│  - AssistME (AI actions)                                    │
│  - Email service (SendGrid/Resend)                          │
│  - WhatsApp service (Twilio)                                │
│  - Database (tenant schema isolation)                       │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 Data Flow: User Creates Workflow → Execution

```
1. User opens AssistBuild canvas
   │
   ▼
2. User describes workflow in NL OR drags nodes manually
   │
   ▼
3. [If NL] → API calls AssistME to generate workflow JSON
   │          └─ AssistME returns {nodes[], edges[], config}
   │
   ▼
4. User refines workflow visually (add nodes, connect, configure)
   │
   ▼
5. User clicks "Test in Sandbox"
   │          └─ API validates workflow, sets environment=sandbox
   │          └─ Enqueues job to BullMQ
   │
   ▼
6. Worker executes workflow in sandbox mode
   │          └─ Uses mock data, disables production writes
   │          └─ Returns execution log
   │
   ▼
7. User reviews execution, clicks "Publish to Production"
   │          └─ API creates workflow version (status=published)
   │          └─ Registers triggers (schedule/event)
   │
   ▼
8. Workflow runs in production when triggered
   │          └─ Event/Schedule → API → BullMQ → Worker → Execution
   │
   ▼
9. User monitors executions in AssistBuild dashboard
```

### 1.3 Tenant Isolation Strategy

**Database Level:**
- All workflow definitions stored in tenant-specific schema: `{tenant_id}.workflows`
- All workflow executions stored in: `{tenant_id}.workflow_executions`
- All execution logs stored in: `{tenant_id}.workflow_execution_logs`

**Runtime Level:**
- BullMQ queue naming: `workflow_executions_{tenant_id}`
- Worker validates tenant context before ANY database operation
- Node executors receive `tenantId` in context and use it for ALL queries

**Security Enforcement:**
- Middleware validates JWT → extracts `tenantId`
- All API endpoints scoped by `tenantId`
- Workers reject jobs without valid `tenantId` in payload

---

## 2️⃣ Workflow Data Model

### 2.1 Database Schema

```sql
-- Per tenant schema
CREATE TABLE IF NOT EXISTS {tenant_id}.workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  
  -- Workflow definition (JSON)
  definition JSONB NOT NULL,
  
  -- Version control
  version INTEGER NOT NULL DEFAULT 1,
  status VARCHAR(20) NOT NULL DEFAULT 'draft', -- draft | published | archived
  
  -- Environment
  environment VARCHAR(20) NOT NULL DEFAULT 'sandbox', -- sandbox | production
  
  -- Trigger configuration
  trigger_type VARCHAR(20), -- event | schedule | manual
  trigger_config JSONB, -- {eventName, cron, etc}
  
  -- Metadata
  created_by UUID REFERENCES {tenant_id}.users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  published_at TIMESTAMP,
  
  -- Indexes
  CONSTRAINT check_status CHECK (status IN ('draft', 'published', 'archived')),
  CONSTRAINT check_environment CHECK (environment IN ('sandbox', 'production')),
  CONSTRAINT check_trigger_type CHECK (trigger_type IN ('event', 'schedule', 'manual'))
);

CREATE INDEX idx_workflows_status ON {tenant_id}.workflows(status);
CREATE INDEX idx_workflows_trigger_type ON {tenant_id}.workflows(trigger_type);


-- Execution tracking
CREATE TABLE IF NOT EXISTS {tenant_id}.workflow_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES {tenant_id}.workflows(id) ON DELETE CASCADE,
  
  -- Execution metadata
  status VARCHAR(20) NOT NULL DEFAULT 'running', -- running | completed | failed | paused | cancelled
  environment VARCHAR(20) NOT NULL, -- sandbox | production
  
  -- Trigger context
  triggered_by VARCHAR(20), -- event | schedule | manual | retry
  trigger_data JSONB, -- Original event/schedule payload
  
  -- Execution state
  current_node_id VARCHAR(255), -- Which node is currently executing
  execution_context JSONB, -- Variables, outputs from previous nodes
  
  -- Timing
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  
  -- Human-in-loop
  awaiting_approval BOOLEAN DEFAULT FALSE,
  approval_node_id VARCHAR(255),
  approved_by UUID REFERENCES {tenant_id}.users(id),
  approved_at TIMESTAMP,
  
  -- Error tracking
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  
  CONSTRAINT check_execution_status CHECK (status IN ('running', 'completed', 'failed', 'paused', 'cancelled'))
);

CREATE INDEX idx_executions_workflow_id ON {tenant_id}.workflow_executions(workflow_id);
CREATE INDEX idx_executions_status ON {tenant_id}.workflow_executions(status);
CREATE INDEX idx_executions_started_at ON {tenant_id}.workflow_executions(started_at);


-- Node-level execution logs
CREATE TABLE IF NOT EXISTS {tenant_id}.workflow_execution_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id UUID NOT NULL REFERENCES {tenant_id}.workflow_executions(id) ON DELETE CASCADE,
  
  -- Node identification
  node_id VARCHAR(255) NOT NULL,
  node_type VARCHAR(50) NOT NULL,
  node_name VARCHAR(255),
  
  -- Execution result
  status VARCHAR(20) NOT NULL, -- success | failed | skipped
  input_data JSONB, -- What the node received
  output_data JSONB, -- What the node produced
  error_message TEXT,
  
  -- Timing
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  duration_ms INTEGER,
  
  CONSTRAINT check_log_status CHECK (status IN ('success', 'failed', 'skipped'))
);

CREATE INDEX idx_logs_execution_id ON {tenant_id}.workflow_execution_logs(execution_id);
CREATE INDEX idx_logs_node_id ON {tenant_id}.workflow_execution_logs(node_id);
```

### 2.2 Workflow Definition JSON Schema

```json
{
  "workflowId": "uuid",
  "name": "Send Overdue Invoice Reminders",
  "description": "Sends reminders for invoices 3+ days overdue",
  "version": 1,
  "nodes": [
    {
      "id": "node_1",
      "type": "schedule_trigger",
      "name": "Daily at 9 AM",
      "position": { "x": 100, "y": 100 },
      "config": {
        "cron": "0 9 * * *",
        "timezone": "America/New_York"
      }
    },
    {
      "id": "node_2",
      "type": "create_update_record",
      "name": "Get Overdue Invoices",
      "position": { "x": 300, "y": 100 },
      "config": {
        "operation": "read",
        "entity": "invoice",
        "filters": {
          "status": "unpaid",
          "due_date": { "operator": "<", "value": "{{now - 3 days}}" }
        },
        "limit": 100
      }
    },
    {
      "id": "node_3",
      "type": "if_else",
      "name": "Any Overdue?",
      "position": { "x": 500, "y": 100 },
      "config": {
        "condition": {
          "field": "{{node_2.output.length}}",
          "operator": ">",
          "value": 0
        }
      }
    },
    {
      "id": "node_4",
      "type": "loop",
      "name": "For Each Invoice",
      "position": { "x": 700, "y": 50 },
      "config": {
        "iterateOver": "{{node_2.output}}"
      }
    },
    {
      "id": "node_5",
      "type": "ai_action",
      "name": "Draft Reminder",
      "position": { "x": 900, "y": 50 },
      "config": {
        "assistMeTaskId": "draft_invoice_reminder",
        "parameters": {
          "invoice": "{{loop.current}}",
          "customerName": "{{loop.current.customer.name}}",
          "amountDue": "{{loop.current.amount}}",
          "daysOverdue": "{{loop.current.days_overdue}}"
        }
      }
    },
    {
      "id": "node_6",
      "type": "send_communication",
      "name": "Send Email",
      "position": { "x": 1100, "y": 50 },
      "config": {
        "channel": "email",
        "to": "{{loop.current.customer.email}}",
        "subject": "Payment Reminder - Invoice {{loop.current.number}}",
        "body": "{{node_5.output.message}}"
      }
    },
    {
      "id": "node_7",
      "type": "end",
      "name": "Complete",
      "position": { "x": 700, "y": 200 },
      "config": {}
    }
  ],
  "edges": [
    { "id": "edge_1", "source": "node_1", "target": "node_2" },
    { "id": "edge_2", "source": "node_2", "target": "node_3" },
    { "id": "edge_3", "source": "node_3", "target": "node_4", "condition": "true" },
    { "id": "edge_4", "source": "node_3", "target": "node_7", "condition": "false" },
    { "id": "edge_5", "source": "node_4", "target": "node_5" },
    { "id": "edge_6", "source": "node_5", "target": "node_6" },
    { "id": "edge_7", "source": "node_6", "target": "node_4", "loopBack": true }
  ],
  "variables": {
    "maxRetries": 3,
    "delayBetweenEmails": 2000
  }
}
```

### 2.3 Node Configuration Schemas

Each of the 11 nodes has a strict configuration schema:

#### 1. Event Trigger
```json
{
  "type": "event_trigger",
  "config": {
    "eventName": "invoice.overdue" | "lead.updated" | "order.created",
    "filters": { /* optional event filters */ }
  }
}
```

#### 2. Schedule Trigger
```json
{
  "type": "schedule_trigger",
  "config": {
    "cron": "0 9 * * *", // Standard cron expression
    "timezone": "America/New_York"
  }
}
```

#### 3. Manual Trigger
```json
{
  "type": "manual_trigger",
  "config": {
    "allowedRoles": ["admin", "manager"] // Optional access control
  }
}
```

#### 4. If / Else
```json
{
  "type": "if_else",
  "config": {
    "condition": {
      "field": "{{node_X.output.status}}", // Variable reference
      "operator": "equals" | "not_equals" | ">" | "<" | ">=" | "<=",
      "value": "approved"
    }
  }
}
```

#### 5. Loop (For Each)
```json
{
  "type": "loop",
  "config": {
    "iterateOver": "{{node_X.output.items}}", // Must be array
    "maxIterations": 100 // Safety limit
  }
}
```

#### 6. Create / Update Record
```json
{
  "type": "create_update_record",
  "config": {
    "operation": "create" | "read" | "update" | "delete",
    "entity": "invoice" | "customer" | "lead" | "task" | "order",
    "filters": { /* for read/update/delete */ },
    "data": { /* for create/update */ },
    "limit": 100 // for read operations
  }
}
```

#### 7. Send Communication
```json
{
  "type": "send_communication",
  "config": {
    "channel": "email" | "whatsapp" | "notification",
    "to": "{{variable}}", // Email, phone, or userId
    "subject": "...", // Email only
    "body": "...",
    "template": "optional_template_id"
  }
}
```

#### 8. AI Action (AssistME Task)
```json
{
  "type": "ai_action",
  "config": {
    "assistMeTaskId": "draft_message" | "summarize_data" | "decide_escalation",
    "parameters": {
      // Task-specific parameters
    },
    "timeout": 30000 // ms
  }
}
```

#### 9. Delay / Wait
```json
{
  "type": "delay",
  "config": {
    "duration": 3, // Number
    "unit": "seconds" | "minutes" | "hours" | "days",
    "waitUntil": "{{variable.dueDate}}" // Alternative: wait until timestamp
  }
}
```

#### 10. Approval (Human-in-Loop)
```json
{
  "type": "approval",
  "config": {
    "message": "Please approve this action",
    "assignTo": "{{node_X.output.managerId}}" | "role:admin",
    "timeout": 86400000, // ms (1 day)
    "onTimeout": "reject" | "approve" | "cancel"
  }
}
```

#### 11. End / Stop
```json
{
  "type": "end",
  "config": {
    "output": { /* optional final output */ }
  }
}
```

### 2.4 Versioning Model

**States:**
- `draft` → User is building/editing
- `published` → Live in production
- `archived` → Deprecated, no longer runs

**Version Flow:**
```
1. Create workflow → status=draft, version=1
2. User edits → updates definition, version stays 1
3. User publishes → status=published, published_at=now
4. User edits published workflow → creates NEW row with version=2, status=draft
5. User publishes v2 → status=published, old version auto-archived
```

**Key Rules:**
- Only ONE published version per workflow name
- Editing a published workflow always creates a new version
- Old executions always reference original version (immutable)

---

## 3️⃣ Visual Builder UX (MVP)

### 3.1 Canvas Layout

```
┌────────────────────────────────────────────────────────────────┐
│  AssistBuild - Workflow Builder                        [?] [X]  │
├────────────────────────────────────────────────────────────────┤
│  [← Back]  My Workflow v1 (Draft)                              │
│  [Save Draft] [Test in Sandbox] [Publish to Production]        │
├─────────────┬──────────────────────────────────────────────────┤
│             │                                                    │
│  Node List  │              Canvas Area                          │
│             │                                                    │
│  Triggers   │   ┌────────┐      ┌────────┐      ┌────────┐    │
│   📍 Event  │   │Schedule│─────▶│Get Data│─────▶│If/Else │    │
│   ⏰ Schedule│   └────────┘      └────────┘      └────────┘    │
│   👆 Manual │         │                             │    │      │
│             │         │                           Yes   No     │
│  Logic      │         │                             ▼    ▼      │
│   🔀 If/Else│   [Zoom: 100%]  [Grid: On]   [Align Nodes]      │
│   🔁 Loop   │                                                    │
│             │                                                    │
│  Actions    │                                                    │
│   💾 CRUD   │                                                    │
│   📧 Send   │                                                    │
│   🤖 AI     │                                                    │
│   ⏳ Delay  │                                                    │
│             │                                                    │
│  Control    │                                                    │
│   ✋ Approval│                                                    │
│   ⬛ End    │                                                    │
│             │                                                    │
└─────────────┴──────────────────────────────────────────────────┘
                                           │
                                           │ Click node
                                           ▼
                              ┌──────────────────────┐
                              │  Configuration Panel │
                              ├──────────────────────┤
                              │  Node: Get Data      │
                              │                      │
                              │  Entity: [Invoice ▼] │
                              │  Operation: [Read ▼] │
                              │  Filters:            │
                              │    status = unpaid   │
                              │    due_date < {{now}}│
                              │                      │
                              │  [Save] [Cancel]     │
                              └──────────────────────┘
```

### 3.2 Node Connection Rules

**Valid Connections:**
- Trigger nodes → MUST be first node (source only)
- If/Else → MUST have 2 outgoing edges (true/false)
- Loop → CAN have loopBack edge from descendant node
- End → MUST be terminal node (no outgoing edges)
- All other nodes → Standard input/output

**Validation:**
- No cycles (except loop)
- No disconnected nodes
- Every path must end in End node
- If/Else must have both branches

### 3.3 Node Configuration Side Panel

**Components:**
1. **Node Type** (read-only badge)
2. **Node Name** (editable, user-friendly label)
3. **Configuration Form** (dynamic based on node type)
4. **Variable Selector** (dropdown showing available variables)
5. **Test Node** button (executes single node with mock data)
6. **Validation Errors** (inline, real-time)

**Variable Reference Syntax:**
```
{{node_2.output.customerId}}
{{loop.current.email}}
{{trigger.data.invoiceId}}
{{now}}
{{now - 3 days}}
```

### 3.4 Inline Validation

**Real-time checks:**
- ✅ Variable references exist
- ✅ Data types match (e.g., loop needs array)
- ✅ Required fields filled
- ✅ Valid cron expressions
- ✅ Entity names valid

**Visual Indicators:**
- 🔴 Red border = invalid node
- 🟡 Yellow border = warning (e.g., no error handling)
- 🟢 Green border = valid
- Grey node = not yet configured

### 3.5 Manual Trigger for Testing

**Button:** "Test in Sandbox"

**Flow:**
1. Validates workflow
2. Shows modal: "Enter test data" (for trigger inputs)
3. Executes workflow in sandbox mode
4. Shows real-time execution in right panel:
   ```
   ✅ Schedule Trigger (0.1s)
   ✅ Get Overdue Invoices (1.2s) - Found 3 items
   ✅ Any Overdue? (0.0s) - True
   🔁 For Each Invoice - Iteration 1/3
   ✅ Draft Reminder (2.3s)
   ✅ Send Email (0.8s)
   🔁 For Each Invoice - Iteration 2/3
   ...
   ```
5. Shows execution summary (time, nodes executed, outputs)

---

## 4️⃣ Natural Language → Workflow Conversion

### 4.1 User Flow

```
User: "Send email reminders for overdue invoices every day at 9am"
  │
  ▼
AssistBuild UI: "Generating workflow..."
  │
  ▼
API → AssistME with prompt:
  """
  Convert this business requirement into a workflow using ONLY these nodes:
  - event_trigger, schedule_trigger, manual_trigger
  - if_else, loop
  - create_update_record, send_communication, ai_action, delay
  - approval, end

  User request: "Send email reminders for overdue invoices every day at 9am"

  Return JSON with nodes and edges. Follow schema: {...}
  """
  │
  ▼
AssistME returns:
  {
    "nodes": [...],
    "edges": [...],
    "suggestedName": "Daily Overdue Invoice Reminders",
    "description": "..."
  }
  │
  ▼
AssistBuild renders workflow on canvas
  │
  ▼
User reviews, edits nodes, adds approval, tests
```

### 4.2 AssistME Integration

**New AssistME Tool:** `generate_workflow`

**Input:**
```json
{
  "userDescription": "string",
  "availableNodes": [...], // List of 11 nodes with descriptions
  "context": {
    "availableEntities": ["invoice", "customer", "lead", ...],
    "availableEvents": ["invoice.overdue", "lead.updated", ...],
    "availableAIActions": ["draft_message", "summarize_data", ...]
  }
}
```

**Output:**
```json
{
  "workflow": {
    "name": "...",
    "description": "...",
    "nodes": [...],
    "edges": [...]
  },
  "explanation": "This workflow does X by first Y, then Z..."
}
```

### 4.3 Refinement Loop

After AI generation:
1. User can drag nodes to reposition
2. User can edit node configurations
3. User can add/remove nodes
4. User can reconnect edges
5. User can re-generate with refined prompt

**UI:** "Not quite right? [Refine with AI]" → Opens text area for additional instructions

---

## 5️⃣ Execution Engine

### 5.1 DAG Traversal Logic

```typescript
async function executeWorkflow(
  workflowId: string,
  executionId: string,
  tenantId: string,
  triggerData: any
) {
  // 1. Load workflow definition
  const workflow = await db.getWorkflow(workflowId, tenantId);
  
  // 2. Initialize execution context
  const context = {
    tenantId,
    workflowId,
    executionId,
    environment: workflow.environment,
    variables: workflow.variables,
    nodeOutputs: {}, // Stores output from each node
    triggerData,
    loopStack: [], // For nested loops (future)
  };

  // 3. Update execution status
  await db.updateExecution(executionId, { status: 'running' });

  // 4. Find entry node (trigger)
  const entryNode = workflow.nodes.find(n => 
    n.type.includes('_trigger')
  );

  try {
    // 5. Traverse DAG starting from entry node
    await executeNode(entryNode, workflow, context);

    // 6. Mark as completed
    await db.updateExecution(executionId, {
      status: 'completed',
      completed_at: new Date(),
    });
  } catch (error) {
    // 7. Handle failure
    await db.updateExecution(executionId, {
      status: 'failed',
      error_message: error.message,
    });
    
    throw error;
  }
}

async function executeNode(
  node: Node,
  workflow: Workflow,
  context: ExecutionContext
) {
  const startTime = Date.now();

  try {
    // 1. Update current node
    await db.updateExecution(context.executionId, {
      current_node_id: node.id,
    });

    // 2. Log node start
    const logId = await db.createExecutionLog({
      execution_id: context.executionId,
      node_id: node.id,
      node_type: node.type,
      node_name: node.name,
      status: 'running',
      input_data: resolveVariables(node.config, context),
    });

    // 3. Execute node based on type
    const executor = getNodeExecutor(node.type);
    const result = await executor.execute(node.config, context);

    // 4. Store output in context
    context.nodeOutputs[node.id] = result.output;

    // 5. Log success
    await db.updateExecutionLog(logId, {
      status: 'success',
      output_data: result.output,
      completed_at: new Date(),
      duration_ms: Date.now() - startTime,
    });

    // 6. Handle special node types
    if (node.type === 'if_else') {
      return await handleIfElse(node, workflow, context, result.output);
    }
    
    if (node.type === 'loop') {
      return await handleLoop(node, workflow, context);
    }
    
    if (node.type === 'approval') {
      return await handleApproval(node, workflow, context);
    }
    
    if (node.type === 'end') {
      return; // Terminal node
    }

    // 7. Get next node(s)
    const nextEdges = workflow.edges.filter(e => e.source === node.id);
    
    for (const edge of nextEdges) {
      const nextNode = workflow.nodes.find(n => n.id === edge.target);
      await executeNode(nextNode, workflow, context);
    }

  } catch (error) {
    // Log failure
    await db.updateExecutionLog(logId, {
      status: 'failed',
      error_message: error.message,
      completed_at: new Date(),
      duration_ms: Date.now() - startTime,
    });

    throw error;
  }
}
```

### 5.2 Node Executors

Each node type has a dedicated executor:

```typescript
interface NodeExecutor {
  execute(
    config: NodeConfig,
    context: ExecutionContext
  ): Promise<{ output: any }>;
}

// Example: Create/Update Record Executor
class CreateUpdateRecordExecutor implements NodeExecutor {
  async execute(config, context) {
    const { operation, entity, filters, data } = config;
    
    // Enforce tenant isolation
    const tenantSchema = context.tenantId;
    
    switch (operation) {
      case 'read':
        const results = await db.query(
          `SELECT * FROM ${tenantSchema}.${entity} 
           WHERE ${buildFilterSQL(filters)} LIMIT ${config.limit || 100}`
        );
        return { output: results };
        
      case 'create':
        const record = await db.insert(
          `${tenantSchema}.${entity}`,
          resolveVariables(data, context)
        );
        return { output: record };
        
      case 'update':
        await db.update(
          `${tenantSchema}.${entity}`,
          resolveVariables(data, context),
          filters
        );
        return { output: { updated: true } };
        
      case 'delete':
        await db.delete(`${tenantSchema}.${entity}`, filters);
        return { output: { deleted: true } };
    }
  }
}

// Example: AI Action Executor
class AIActionExecutor implements NodeExecutor {
  async execute(config, context) {
    const { assistMeTaskId, parameters } = config;
    
    // Call existing AssistME infrastructure
    const result = await assistME.executeTask(
      assistMeTaskId,
      resolveVariables(parameters, context),
      { tenantId: context.tenantId }
    );
    
    return { output: result };
  }
}

// Example: Send Communication Executor
class SendCommunicationExecutor implements NodeExecutor {
  async execute(config, context) {
    const { channel, to, subject, body } = config;
    
    const resolvedConfig = {
      to: resolveVariable(to, context),
      subject: resolveVariable(subject, context),
      body: resolveVariable(body, context),
    };
    
    switch (channel) {
      case 'email':
        await emailService.send(resolvedConfig);
        break;
      case 'whatsapp':
        await whatsappService.send(resolvedConfig);
        break;
      case 'notification':
        await notificationService.send(resolvedConfig, context.tenantId);
        break;
    }
    
    return { output: { sent: true, timestamp: new Date() } };
  }
}
```

### 5.3 Special Handlers

#### If/Else Handler
```typescript
async function handleIfElse(
  node: Node,
  workflow: Workflow,
  context: ExecutionContext,
  conditionResult: boolean
) {
  const edges = workflow.edges.filter(e => e.source === node.id);
  
  const trueEdge = edges.find(e => e.condition === 'true');
  const falseEdge = edges.find(e => e.condition === 'false');
  
  const targetEdge = conditionResult ? trueEdge : falseEdge;
  
  if (targetEdge) {
    const nextNode = workflow.nodes.find(n => n.id === targetEdge.target);
    await executeNode(nextNode, workflow, context);
  }
}
```

#### Loop Handler
```typescript
async function handleLoop(
  node: Node,
  workflow: Workflow,
  context: ExecutionContext
) {
  const items = resolveVariable(node.config.iterateOver, context);
  
  if (!Array.isArray(items)) {
    throw new Error('Loop node requires array input');
  }
  
  const maxIterations = node.config.maxIterations || 100;
  const iterationCount = Math.min(items.length, maxIterations);
  
  for (let i = 0; i < iterationCount; i++) {
    // Add loop context
    context.loop = {
      current: items[i],
      index: i,
      total: items.length,
    };
    
    // Execute loop body (nodes connected from loop node)
    const loopEdges = workflow.edges.filter(e => 
      e.source === node.id && !e.loopBack
    );
    
    for (const edge of loopEdges) {
      const bodyNode = workflow.nodes.find(n => n.id === edge.target);
      await executeNode(bodyNode, workflow, context);
    }
  }
  
  // Clear loop context
  delete context.loop;
  
  // Continue to next node after loop
  const exitEdges = workflow.edges.filter(e =>
    e.source === node.id && e.loopBack
  );
  // (Exit logic here)
}
```

#### Approval Handler
```typescript
async function handleApproval(
  node: Node,
  workflow: Workflow,
  context: ExecutionContext
) {
  // 1. Pause execution
  await db.updateExecution(context.executionId, {
    status: 'paused',
    awaiting_approval: true,
    approval_node_id: node.id,
  });
  
  // 2. Create approval request
  const approvalId = await db.createApprovalRequest({
    execution_id: context.executionId,
    node_id: node.id,
    message: node.config.message,
    assign_to: resolveVariable(node.config.assignTo, context),
    timeout_at: new Date(Date.now() + node.config.timeout),
  });
  
  // 3. Send notification to approver
  await notificationService.sendApprovalRequest(approvalId);
  
  // 4. Return early (workflow resumes when approved/rejected)
  return { pausedForApproval: true };
}

// Separate handler when user approves/rejects
async function resumeAfterApproval(
  executionId: string,
  approved: boolean,
  userId: string
) {
  const execution = await db.getExecution(executionId);
  
  await db.updateExecution(executionId, {
    status: 'running',
    awaiting_approval: false,
    approved_by: userId,
    approved_at: new Date(),
  });
  
  if (approved) {
    // Continue workflow from next node
    const workflow = await db.getWorkflow(execution.workflow_id);
    const approvalNode = workflow.nodes.find(
      n => n.id === execution.approval_node_id
    );
    const nextEdges = workflow.edges.filter(e => e.source === approvalNode.id);
    
    // Resume execution...
  } else {
    // Cancel workflow
    await db.updateExecution(executionId, { status: 'cancelled' });
  }
}
```

### 5.4 Error Handling & Retries

**Retry Strategy:**
```typescript
// BullMQ job configuration
{
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 2000, // 2s, 4s, 8s
  },
  removeOnComplete: false, // Keep for audit
  removeOnFail: false,
}
```

**Node-level Error Handling:**
- If node fails → Log error → Retry job (BullMQ)
- If retry exhausted → Move to DLQ → Send alert
- User can manually re-run from failed node

**Idempotency:**
- Each execution has unique `executionId`
- CRUD operations check for duplicates (e.g., upsert)
- Communication nodes check `sent` status before sending
- Loop iterations tracked to prevent re-execution

---

## 6️⃣ Sandbox & Promotion

### 6.1 Sandbox Execution Mode

**Environment Flag:** `environment: 'sandbox'`

**Sandbox Constraints:**
1. **Read Operations:** Use production data OR test data set
2. **Write Operations:** Write to `{tenant_id}_sandbox.{entity}` tables
3. **Communications:** Redirect to test email/phone OR log only
4. **AI Actions:** Use with warning "Sandbox mode - real AI call"
5. **External APIs:** Mock responses where possible

**Implementation:**
```typescript
class CreateUpdateRecordExecutor {
  async execute(config, context) {
    const schema = context.environment === 'sandbox'
      ? `${context.tenantId}_sandbox`
      : context.tenantId;
    
    // All queries use appropriate schema
    const results = await db.query(
      `SELECT * FROM ${schema}.${config.entity} ...`
    );
    
    return { output: results };
  }
}

class SendCommunicationExecutor {
  async execute(config, context) {
    if (context.environment === 'sandbox') {
      // Log instead of sending
      console.log(`[SANDBOX] Would send ${config.channel} to ${config.to}`);
      await db.insertSandboxLog({
        type: 'communication',
        channel: config.channel,
        to: config.to,
        body: config.body,
      });
      return { output: { sent: true, sandboxMode: true } };
    }
    
    // Real send in production
    await emailService.send(...);
  }
}
```

### 6.2 Dry-Run Mode

**User clicks:** "Test in Sandbox (Dry Run)"

**Behavior:**
- Validates workflow
- Simulates execution
- Does NOT write to ANY database
- Does NOT send ANY communications
- Does NOT call external APIs
- Returns execution plan:
  ```
  ✅ Would execute: Schedule Trigger
  ✅ Would read: 3 invoices (filters: status=unpaid, due_date < now-3d)
  ✅ Would loop: 3 iterations
  ✅ Would call AI: draft_invoice_reminder (3x)
  ✅ Would send email: 3 emails to [test@example.com, ...]
  ```

### 6.3 Publish to Production Flow

```
User clicks: "Publish to Production"
  │
  ▼
1. Validate workflow (no errors)
  │
  ▼
2. Show confirmation modal:
   "This workflow will run in production and affect real data.
    - Trigger: Daily at 9 AM
    - Actions: Send emails, update records
    - [Cancel] [Publish]"
  │
  ▼
3. Create new published version
   - Copy workflow definition
   - Set status=published, environment=production
   - Archive old version (if exists)
  │
  ▼
4. Register triggers
   - Schedule: Create cron job in BullMQ
   - Event: Register webhook/listener
   - Manual: Enable "Run Now" button
  │
  ▼
5. Show success message:
   "✅ Workflow published! Next run: Tomorrow at 9:00 AM"
```

### 6.4 Rollback on Failure

**Automatic Rollback Trigger:**
- If workflow fails 3+ times in 1 hour → Auto-disable
- Send alert to workflow owner
- Revert to previous published version (optional)

**Manual Rollback:**
```
User clicks: "Revert to v1"
  │
  ▼
1. Confirm: "This will stop v2 and restore v1"
  │
  ▼
2. Disable v2 triggers
3. Re-enable v1 triggers
4. Update status: v1=published, v2=archived
```

---

## 7️⃣ Monitoring & Debugging (MVP)

### 7.1 Workflow Dashboard

```
┌──────────────────────────────────────────────────────────────┐
│  Workflows                                         [+ New]    │
├──────────────────────────────────────────────────────────────┤
│  Name                      Status      Last Run     Success   │
│  ─────────────────────────────────────────────────────────── │
│  Daily Invoice Reminders   Published   2 min ago   ✅ 100%  │
│  Lead Assignment          Published   1 hour ago  ✅ 98%   │
│  Order Notifications      Draft       -            -         │
│  Weekly Reports           Published   2 days ago  ❌ Failed │
└──────────────────────────────────────────────────────────────┘
```

### 7.2 Execution History

```
Click workflow → Execution History tab

┌──────────────────────────────────────────────────────────────┐
│  Execution History - Daily Invoice Reminders                 │
├──────────────────────────────────────────────────────────────┤
│  Time            Trigger    Status      Duration   Actions   │
│  ─────────────────────────────────────────────────────────── │
│  2 min ago      Schedule   ✅ Completed  4.2s      [View]    │
│  1 day ago      Schedule   ✅ Completed  3.8s      [View]    │
│  2 days ago     Schedule   ❌ Failed     2.1s      [View]    │
│  3 days ago     Manual     ✅ Completed  5.0s      [View]    │
└──────────────────────────────────────────────────────────────┘
```

### 7.3 Node-Level Execution View

```
Click [View] → Node Execution Details

┌──────────────────────────────────────────────────────────────┐
│  Execution: exec_12345 - Completed (4.2s)                    │
├──────────────────────────────────────────────────────────────┤
│  Node                    Status      Duration   Output        │
│  ─────────────────────────────────────────────────────────── │
│  ✅ Schedule Trigger      Success     0.1s      [View]       │
│  ✅ Get Overdue Invoices  Success     1.2s      3 items      │
│  ✅ Any Overdue?          Success     0.0s      true         │
│  ✅ For Each Invoice      Success     2.9s      3 iterations │
│    ├─ ✅ Draft Reminder   Success     0.8s      [View]       │
│    ├─ ✅ Send Email       Success     0.4s      sent         │
│    ├─ ✅ Draft Reminder   Success     0.9s      [View]       │
│    ├─ ✅ Send Email       Success     0.3s      sent         │
│    └─ ✅ Draft Reminder   Success     0.5s      [View]       │
│       └─ ✅ Send Email    Success     0.0s      sent         │
│  ✅ End                   Success     0.0s      -            │
└──────────────────────────────────────────────────────────────┘

[Download Logs] [Re-run Workflow] [View in Canvas]
```

### 7.4 Error Logs

```
Click failed execution → Error Details

┌──────────────────────────────────────────────────────────────┐
│  ❌ Execution Failed: exec_12346                             │
├──────────────────────────────────────────────────────────────┤
│  Error at: Send Email (node_6)                               │
│  Duration: 2.1s                                              │
│  Retry Attempts: 3/3 exhausted                               │
│                                                              │
│  Error Message:                                              │
│  SMTPError: Could not connect to mail server (timeout)      │
│                                                              │
│  Stack Trace:                                                │
│  at SendCommunicationExecutor.execute (executor.ts:45)      │
│  at executeNode (engine.ts:102)                             │
│                                                              │
│  Input Data:                                                 │
│  {                                                           │
│    "to": "customer@example.com",                            │
│    "subject": "Payment Reminder",                           │
│    "body": "..."                                            │
│  }                                                           │
│                                                              │
│  [Re-run from Failed Node] [Edit Workflow] [Contact Support]│
└──────────────────────────────────────────────────────────────┘
```

### 7.5 Manual Re-Run

**Button:** "Run Now" (for published workflows with manual trigger)

**Flow:**
1. Opens modal: "Run workflow manually?"
2. Shows input form for trigger data (if needed)
3. Executes immediately
4. Redirects to execution view
5. Shows real-time progress

---

## 8️⃣ Implementation Phases

### Phase 1: Foundation (Week 1-2)
**Goal:** Core infrastructure + 3 simplest nodes

**Tasks:**
- [ ] Database schema implementation (workflows, executions, logs)
- [ ] Workflow management API (CRUD, versioning)
- [ ] Basic DAG traversal engine
- [ ] Implement 3 nodes:
  - Manual Trigger
  - Create/Update Record (read only)
  - End
- [ ] Basic canvas UI (drag/drop, connect)
- [ ] Manual execution flow (sandbox only)

**Deliverable:** Can create simple "Manual → Get Data → End" workflow

---

### Phase 2: Core Nodes (Week 3-4)
**Goal:** Add logic and action nodes

**Tasks:**
- [ ] Implement nodes:
  - If/Else
  - Loop
  - Send Communication (email only)
  - Delay
- [ ] Variable resolution system
- [ ] Node configuration panel UI
- [ ] Execution logging (node-level)
- [ ] Basic monitoring dashboard

**Deliverable:** Can create conditional workflows with loops and delays

---

### Phase 3: Triggers & AI (Week 5-6)
**Goal:** Automate workflows

**Tasks:**
- [ ] Implement nodes:
  - Schedule Trigger (cron)
  - Event Trigger
  - AI Action (AssistME integration)
- [ ] BullMQ job scheduling
- [ ] Event hook system
- [ ] Natural language → workflow conversion
- [ ] Sandbox vs production modes

**Deliverable:** Can create fully automated workflows triggered by events/schedules

---

### Phase 4: Production Readiness (Week 7-8)
**Goal:** Safety, approval, monitoring

**Tasks:**
- [ ] Implement node:
  - Approval (human-in-loop)
- [ ] Publish/rollback flow
- [ ] Enhanced error handling & retries
- [ ] Execution history UI
- [ ] Alerts & notifications
- [ ] Performance optimization
- [ ] Security audit

**Deliverable:** Production-ready workflow system with approvals

---

### Phase 5: Polish & Scale (Week 9-10)
**Goal:** UX improvements, docs, onboarding

**Tasks:**
- [ ] Workflow templates library
- [ ] Improved canvas UX (zoom, align, search)
- [ ] Multi-select, copy/paste nodes
- [ ] Workflow export/import
- [ ] User documentation
- [ ] Video tutorials
- [ ] Load testing & optimization

**Deliverable:** Polished, user-friendly workflow builder ready for scale

---

## 9️⃣ API Endpoints Summary

### Workflow Management
```
POST   /api/workflows                    Create workflow
GET    /api/workflows                    List workflows
GET    /api/workflows/:id                Get workflow
PUT    /api/workflows/:id                Update workflow
DELETE /api/workflows/:id                Delete workflow
POST   /api/workflows/:id/publish        Publish to production
POST   /api/workflows/:id/archive        Archive workflow
POST   /api/workflows/:id/rollback/:v    Rollback to version
```

### Workflow Execution
```
POST   /api/workflows/:id/execute        Manual trigger
GET    /api/workflows/:id/executions     Execution history
GET    /api/executions/:id               Execution details
GET    /api/executions/:id/logs          Node-level logs
POST   /api/executions/:id/retry         Retry failed execution
POST   /api/executions/:id/cancel        Cancel running execution
```

### Approvals
```
GET    /api/approvals                    List pending approvals
POST   /api/approvals/:id/approve        Approve
POST   /api/approvals/:id/reject         Reject
```

### AI-Assisted
```
POST   /api/workflows/generate           Generate from NL
POST   /api/workflows/:id/refine         Refine with AI
```

---

## 🔟 Security & Compliance

### Multi-Tenancy Enforcement
- ✅ All queries scoped by `tenantId` from JWT
- ✅ Workers validate `tenantId` before execution
- ✅ Separate BullMQ queues per tenant
- ✅ Node executors use tenant schema isolation

### Role-Based Access Control
- **Admin:** Full access to all workflows
- **Manager:** Can create, edit, publish workflows
- **User:** Can trigger manual workflows, view executions
- **Viewer:** Read-only access

### Audit Trail
- All workflow changes logged (created_by, updated_at)
- All executions logged (triggered_by, trigger_data)
- All approvals logged (approved_by, approved_at)
- Immutable execution history (no edits/deletes)

### Data Privacy
- Sensitive data (emails, phone numbers) encrypted at rest
- Execution logs can be purged after N days (configurable)
- Sandbox data isolated from production
- No cross-tenant data leakage (enforced at DB + app level)

---

## 1️⃣1️⃣ Success Metrics (MVP)

### Technical KPIs
- Workflow execution success rate > 95%
- Median execution time < 5 seconds
- Node executor latency < 500ms
- Zero cross-tenant data leaks

### Business KPIs
- 10+ workflows created in first week
- 50% of workflows use AI Action node
- 80% of workflows run without errors after 1 week
- 3+ hours saved per user per week (measured via survey)

### User Experience KPIs
- Time to create first workflow < 5 minutes
- NL → Workflow conversion accuracy > 70%
- User satisfaction score > 4/5

---

## 1️⃣2️⃣ Example Workflows

### Example 1: Overdue Invoice Reminders
```
Trigger: Schedule (daily at 9 AM)
  │
  ▼
Get overdue invoices (status=unpaid, due_date < now-3d)
  │
  ▼
If: any found?
  │
  ├─ Yes → Loop: for each invoice
  │           │
  │           ▼
  │         AI Action: draft reminder message
  │           │
  │           ▼
  │         Send Email: to customer
  │
  └─ No → End
```

### Example 2: Lead Assignment with Approval
```
Trigger: Event (lead.created)
  │
  ▼
Get lead data
  │
  ▼
If: lead.value > $10,000?
  │
  ├─ Yes → Approval: assign to senior sales?
  │           │
  │           ├─ Approved → Update lead (assign_to = senior_sales)
  │           │               │
  │           │               ▼
  │           │             Send notification to senior
  │           │
  │           └─ Rejected → End
  │
  └─ No → Update lead (assign_to = junior_sales)
            │
            ▼
          Send notification to junior
```

### Example 3: Weekly Report Generation
```
Trigger: Schedule (every Monday at 8 AM)
  │
  ▼
Get last week's data (sales, leads, tasks)
  │
  ▼
AI Action: generate weekly summary report
  │
  ▼
Send Email: to management team with PDF attachment
  │
  ▼
End
```

---

## 1️⃣3️⃣ Technology Stack

### Frontend
- **Framework:** React + TypeScript
- **Canvas:** ReactFlow (for node-based UI)
- **State:** Zustand or React Context
- **Forms:** React Hook Form + Zod validation
- **UI:** Existing AssistOS component library

### Backend
- **Runtime:** Node.js + TypeScript
- **API:** Express or Fastify
- **Validation:** Zod schemas
- **Jobs:** BullMQ + Redis (existing)
- **Database:** PostgreSQL (existing multi-tenant setup)

### Workers
- **Engine:** BullMQ workers (existing infrastructure)
- **Isolation:** One queue per tenant
- **Retry:** Exponential backoff (built-in)
- **Monitoring:** Bull Board dashboard (existing)

### External Services
- **AI:** AssistME (existing 75+ tools)
- **Email:** SendGrid or Resend
- **WhatsApp:** Twilio
- **Notifications:** In-app (via WebSocket/SSE)

---

## 1️⃣4️⃣ Risk Mitigation

### Risk 1: Infinite Loops
**Mitigation:**
- Max iterations limit (100 default)
- Execution timeout (5 minutes default)
- Loop detection in DAG validation

### Risk 2: Runaway Costs (AI calls)
**Mitigation:**
- Rate limiting per tenant
- Budget alerts (e.g., > 1000 AI calls/day)
- Approval required for high-volume workflows

### Risk 3: Cross-Tenant Data Leaks
**Mitigation:**
- Strict schema isolation
- Worker-level validation
- Automated security tests

### Risk 4: Workflow Failures Cascade
**Mitigation:**
- Dead letter queue
- Auto-disable after N failures
- Alerts to workflow owner

### Risk 5: Complex Workflows Break System
**Mitigation:**
- Node limit (e.g., max 50 nodes per workflow)
- Depth limit (e.g., max 10 nested levels)
- Validation before publish

---

## 1️⃣5️⃣ Future Enhancements (Post-MVP)

**NOT in v1, but planned for later:**
- ❌ Custom JavaScript nodes
- ❌ Plugin system
- ❌ Advanced routing (switch/case, parallel branches)
- ❌ Sub-workflows (call another workflow)
- ❌ Versioned node libraries
- ❌ Workflow marketplace/templates
- ❌ A/B testing workflows
- ❌ Workflow analytics dashboard

---

## 📌 Conclusion

This design delivers a **production-ready, MVP workflow automation system** for AssistOS that:

✅ Restricts scope to **11 essential nodes**  
✅ Reuses **100% of existing infrastructure**  
✅ Ensures **multi-tenant safety** at every level  
✅ Provides **visual + AI-assisted** workflow creation  
✅ Supports **sandbox testing** before production  
✅ Includes **human-in-loop approvals** for safety  
✅ Delivers **comprehensive monitoring** and debugging  
✅ Can be **implemented in 8-10 weeks**  

**Next Steps:**
1. Review and approve this design document
2. Create detailed technical specifications for Phase 1
3. Set up project tracking (tickets, milestones)
4. Begin Phase 1 implementation

---

**Document Version:** 1.0  
**Last Updated:** December 16, 2025  
**Owner:** AssistOS Architecture Team
