# AssistBuild Phase 1 - 2-Node MVP Implementation Plan

## 🎯 Objective

Build the **absolute minimum** workflow system with only 2 nodes to prove the architecture works. Once this is solid, we can rapidly add the remaining 9 nodes.

---

## 🧩 The 2 Nodes We're Building

### 1. Manual Trigger
- User clicks "Run" to start workflow
- Simplest trigger type
- Perfect for testing

### 2. Create/Update Record (CRUD)
- Read, Create, Update, Delete operations
- Works across all entities (invoices, customers, leads, etc.)
- Most useful action node

**Example Workflow:**
```
Manual Trigger → Get Customers (Read) → End
Manual Trigger → Create Invoice → End
Manual Trigger → Update Lead Status → End
```

---

## 📦 Implementation Order

### ✅ Phase 1A: Database Schema (Day 1)
### ✅ Phase 1B: Backend APIs (Day 2-3)
### ✅ Phase 1C: Execution Engine (Day 4-5)
### ✅ Phase 1D: Frontend Canvas (Day 6-8)

---

## 1️⃣ Database Schema

### 1.1 Migration File Structure

Create migration: `migrations/0001_workflow_system_foundation.sql`

```sql
-- ============================================================================
-- AssistBuild Workflow System - Phase 1 (2 Nodes)
-- ============================================================================

-- This migration creates the foundation for workflow automation
-- Supports: Manual Trigger + CRUD Record nodes only

-- ============================================================================
-- PART 1: Workflow Definitions
-- ============================================================================

-- Store workflow definitions (nodes, edges, config)
CREATE TABLE IF NOT EXISTS workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Basic info
  name VARCHAR(255) NOT NULL,
  description TEXT,
  
  -- Workflow structure (JSON)
  definition JSONB NOT NULL,
  -- Example structure:
  -- {
  --   "nodes": [
  --     { "id": "node_1", "type": "manual_trigger", "config": {} },
  --     { "id": "node_2", "type": "crud_record", "config": {...} }
  --   ],
  --   "edges": [
  --     { "source": "node_1", "target": "node_2" }
  --   ]
  -- }
  
  -- Version control
  version INTEGER NOT NULL DEFAULT 1,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  -- Status: 'draft' | 'published' | 'archived'
  
  -- Environment
  environment VARCHAR(20) NOT NULL DEFAULT 'sandbox',
  -- Environment: 'sandbox' | 'production'
  
  -- Metadata
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  published_at TIMESTAMPTZ,
  
  -- Constraints
  CONSTRAINT check_status CHECK (status IN ('draft', 'published', 'archived')),
  CONSTRAINT check_environment CHECK (environment IN ('sandbox', 'production'))
);

-- Indexes for performance
CREATE INDEX idx_workflows_status ON workflows(status);
CREATE INDEX idx_workflows_created_by ON workflows(created_by);
CREATE INDEX idx_workflows_created_at ON workflows(created_at DESC);

-- Enable full-text search on workflow names
CREATE INDEX idx_workflows_name_search ON workflows USING gin(to_tsvector('english', name));

-- Audit trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER workflows_updated_at
  BEFORE UPDATE ON workflows
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();


-- ============================================================================
-- PART 2: Workflow Executions
-- ============================================================================

-- Track individual workflow runs
CREATE TABLE IF NOT EXISTS workflow_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  
  -- Execution state
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  -- Status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  
  environment VARCHAR(20) NOT NULL,
  
  -- Trigger info
  triggered_by VARCHAR(20) NOT NULL DEFAULT 'manual',
  -- For Phase 1: always 'manual'
  trigger_user_id UUID NOT NULL,
  trigger_data JSONB,
  
  -- Execution progress
  current_node_id VARCHAR(255),
  execution_context JSONB DEFAULT '{}',
  -- Stores outputs from each node:
  -- {
  --   "node_1": { "output": {...} },
  --   "node_2": { "output": {...} }
  -- }
  
  -- Timing
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  
  -- Error tracking
  error_message TEXT,
  error_node_id VARCHAR(255),
  retry_count INTEGER DEFAULT 0,
  
  -- Constraints
  CONSTRAINT check_execution_status CHECK (
    status IN ('pending', 'running', 'completed', 'failed', 'cancelled')
  )
);

-- Indexes
CREATE INDEX idx_executions_workflow_id ON workflow_executions(workflow_id);
CREATE INDEX idx_executions_status ON workflow_executions(status);
CREATE INDEX idx_executions_started_at ON workflow_executions(started_at DESC);
CREATE INDEX idx_executions_user ON workflow_executions(trigger_user_id);

-- Composite index for common queries
CREATE INDEX idx_executions_workflow_status ON workflow_executions(workflow_id, status);


-- ============================================================================
-- PART 3: Node Execution Logs
-- ============================================================================

-- Detailed logs for each node execution
CREATE TABLE IF NOT EXISTS workflow_execution_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id UUID NOT NULL REFERENCES workflow_executions(id) ON DELETE CASCADE,
  
  -- Node identification
  node_id VARCHAR(255) NOT NULL,
  node_type VARCHAR(50) NOT NULL,
  node_name VARCHAR(255),
  
  -- Execution result
  status VARCHAR(20) NOT NULL,
  -- Status: 'running' | 'success' | 'failed' | 'skipped'
  
  -- Data flow
  input_data JSONB,
  output_data JSONB,
  error_message TEXT,
  error_stack TEXT,
  
  -- Timing
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  
  -- Constraints
  CONSTRAINT check_log_status CHECK (
    status IN ('running', 'success', 'failed', 'skipped')
  )
);

-- Indexes
CREATE INDEX idx_logs_execution_id ON workflow_execution_logs(execution_id);
CREATE INDEX idx_logs_node_id ON workflow_execution_logs(node_id);
CREATE INDEX idx_logs_status ON workflow_execution_logs(status);
CREATE INDEX idx_logs_started_at ON workflow_execution_logs(started_at DESC);


-- ============================================================================
-- PART 4: Support Tables
-- ============================================================================

-- Store reusable workflow templates (future enhancement)
CREATE TABLE IF NOT EXISTS workflow_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(100),
  definition JSONB NOT NULL,
  is_system BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_templates_category ON workflow_templates(category);


-- ============================================================================
-- PART 5: Views for Common Queries
-- ============================================================================

-- View: Latest executions with workflow info
CREATE OR REPLACE VIEW v_workflow_executions_latest AS
SELECT 
  e.id AS execution_id,
  e.workflow_id,
  w.name AS workflow_name,
  w.environment,
  e.status,
  e.triggered_by,
  e.trigger_user_id,
  e.started_at,
  e.completed_at,
  e.duration_ms,
  e.error_message,
  (
    SELECT COUNT(*) 
    FROM workflow_execution_logs l 
    WHERE l.execution_id = e.id AND l.status = 'success'
  ) AS successful_nodes,
  (
    SELECT COUNT(*) 
    FROM workflow_execution_logs l 
    WHERE l.execution_id = e.id AND l.status = 'failed'
  ) AS failed_nodes
FROM workflow_executions e
JOIN workflows w ON w.id = e.workflow_id
ORDER BY e.started_at DESC;


-- View: Workflow success rate (last 30 days)
CREATE OR REPLACE VIEW v_workflow_stats AS
SELECT 
  w.id AS workflow_id,
  w.name AS workflow_name,
  w.status AS workflow_status,
  COUNT(e.id) AS total_executions,
  COUNT(CASE WHEN e.status = 'completed' THEN 1 END) AS successful_executions,
  COUNT(CASE WHEN e.status = 'failed' THEN 1 END) AS failed_executions,
  ROUND(
    100.0 * COUNT(CASE WHEN e.status = 'completed' THEN 1 END) / NULLIF(COUNT(e.id), 0),
    2
  ) AS success_rate,
  MAX(e.started_at) AS last_execution_at
FROM workflows w
LEFT JOIN workflow_executions e ON e.workflow_id = w.id 
  AND e.started_at > NOW() - INTERVAL '30 days'
GROUP BY w.id, w.name, w.status;


-- ============================================================================
-- PART 6: Seed Data (Optional)
-- ============================================================================

-- Example template: Simple customer lookup
INSERT INTO workflow_templates (name, description, category, definition, is_system) VALUES
(
  'Customer Lookup',
  'Find customers by email or ID',
  'Data',
  '{
    "nodes": [
      {
        "id": "node_1",
        "type": "manual_trigger",
        "name": "Start",
        "position": { "x": 100, "y": 100 },
        "config": {}
      },
      {
        "id": "node_2",
        "type": "crud_record",
        "name": "Get Customer",
        "position": { "x": 300, "y": 100 },
        "config": {
          "operation": "read",
          "entity": "customers",
          "filters": {
            "email": "{{trigger.email}}"
          },
          "limit": 1
        }
      }
    ],
    "edges": [
      { "source": "node_1", "target": "node_2" }
    ]
  }'::jsonb,
  true
);


-- ============================================================================
-- PART 7: Permissions (RLS if needed)
-- ============================================================================

-- Note: If using Row Level Security, add policies here
-- For now, we'll handle authorization in the application layer


-- ============================================================================
-- PART 8: Comments for Documentation
-- ============================================================================

COMMENT ON TABLE workflows IS 'Stores workflow definitions with nodes and edges';
COMMENT ON TABLE workflow_executions IS 'Tracks individual workflow runs and their state';
COMMENT ON TABLE workflow_execution_logs IS 'Detailed logs for each node execution';
COMMENT ON COLUMN workflows.definition IS 'JSONB structure containing nodes[] and edges[]';
COMMENT ON COLUMN workflow_executions.execution_context IS 'Stores intermediate outputs from each node';
```

---

## 2️⃣ Backend API Structure

### 2.1 File Structure

```
apps/api/src/
├── routes/
│   └── workflows/
│       ├── index.ts              # Router
│       ├── create.ts             # POST /workflows
│       ├── list.ts               # GET /workflows
│       ├── get.ts                # GET /workflows/:id
│       ├── update.ts             # PUT /workflows/:id
│       ├── delete.ts             # DELETE /workflows/:id
│       ├── execute.ts            # POST /workflows/:id/execute
│       ├── executions/
│       │   ├── list.ts           # GET /workflows/:id/executions
│       │   ├── get.ts            # GET /executions/:id
│       │   └── logs.ts           # GET /executions/:id/logs
│       └── templates.ts          # GET /workflows/templates
├── services/
│   └── workflow/
│       ├── WorkflowService.ts    # CRUD operations
│       ├── ExecutionService.ts   # Trigger executions
│       ├── ValidationService.ts  # Validate workflow definitions
│       └── types.ts              # TypeScript types
├── workers/
│   └── workflow/
│       ├── WorkflowWorker.ts     # BullMQ worker
│       ├── ExecutionEngine.ts    # DAG traversal
│       ├── executors/
│       │   ├── ManualTriggerExecutor.ts
│       │   └── CrudRecordExecutor.ts
│       └── utils/
│           ├── variableResolver.ts
│           └── dagValidator.ts
└── queues/
    └── workflow/
        ├── WorkflowQueue.ts      # BullMQ queue setup
        └── types.ts              # Job types
```

### 2.2 TypeScript Types

**File:** `apps/api/src/services/workflow/types.ts`

```typescript
// ============================================================================
// Workflow Definition Types
// ============================================================================

export type WorkflowStatus = 'draft' | 'published' | 'archived';
export type WorkflowEnvironment = 'sandbox' | 'production';
export type NodeType = 'manual_trigger' | 'crud_record';
export type CrudOperation = 'create' | 'read' | 'update' | 'delete';

export interface Position {
  x: number;
  y: number;
}

export interface BaseNodeConfig {
  [key: string]: any;
}

export interface ManualTriggerConfig extends BaseNodeConfig {
  // No special config for Phase 1
}

export interface CrudRecordConfig extends BaseNodeConfig {
  operation: CrudOperation;
  entity: string; // 'customers', 'invoices', 'leads', etc.
  filters?: Record<string, any>; // For read/update/delete
  data?: Record<string, any>; // For create/update
  limit?: number; // For read
}

export interface WorkflowNode {
  id: string;
  type: NodeType;
  name: string;
  position: Position;
  config: ManualTriggerConfig | CrudRecordConfig;
}

export interface WorkflowEdge {
  id: string;
  source: string; // node id
  target: string; // node id
}

export interface WorkflowDefinition {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  variables?: Record<string, any>;
}

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  definition: WorkflowDefinition;
  version: number;
  status: WorkflowStatus;
  environment: WorkflowEnvironment;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  publishedAt?: Date;
}

// ============================================================================
// Execution Types
// ============================================================================

export type ExecutionStatus = 
  | 'pending' 
  | 'running' 
  | 'completed' 
  | 'failed' 
  | 'cancelled';

export type LogStatus = 'running' | 'success' | 'failed' | 'skipped';

export interface ExecutionContext {
  tenantId: string;
  workflowId: string;
  executionId: string;
  environment: WorkflowEnvironment;
  nodeOutputs: Record<string, any>;
  triggerData: any;
  userId: string;
}

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  status: ExecutionStatus;
  environment: WorkflowEnvironment;
  triggeredBy: string;
  triggerUserId: string;
  triggerData?: any;
  currentNodeId?: string;
  executionContext: Record<string, any>;
  startedAt?: Date;
  completedAt?: Date;
  durationMs?: number;
  errorMessage?: string;
  errorNodeId?: string;
  retryCount: number;
}

export interface WorkflowExecutionLog {
  id: string;
  executionId: string;
  nodeId: string;
  nodeType: string;
  nodeName: string;
  status: LogStatus;
  inputData?: any;
  outputData?: any;
  errorMessage?: string;
  errorStack?: string;
  startedAt: Date;
  completedAt?: Date;
  durationMs?: number;
}

// ============================================================================
// API Request/Response Types
// ============================================================================

export interface CreateWorkflowRequest {
  name: string;
  description?: string;
  definition: WorkflowDefinition;
  environment?: WorkflowEnvironment;
}

export interface UpdateWorkflowRequest {
  name?: string;
  description?: string;
  definition?: WorkflowDefinition;
}

export interface ExecuteWorkflowRequest {
  triggerData?: any;
  environment?: WorkflowEnvironment; // For testing
}

export interface ListWorkflowsQuery {
  status?: WorkflowStatus;
  environment?: WorkflowEnvironment;
  page?: number;
  limit?: number;
}

// ============================================================================
// BullMQ Job Types
// ============================================================================

export interface WorkflowJobData {
  workflowId: string;
  executionId: string;
  tenantId: string;
  userId: string;
  triggerData?: any;
  environment: WorkflowEnvironment;
}

export interface NodeExecutionResult {
  success: boolean;
  output?: any;
  error?: string;
}
```

### 2.3 API Endpoints (Detailed)

#### **POST /api/workflows** - Create Workflow

```typescript
// apps/api/src/routes/workflows/create.ts

import { Request, Response } from 'express';
import { WorkflowService } from '../../services/workflow/WorkflowService';
import { ValidationService } from '../../services/workflow/ValidationService';
import { CreateWorkflowRequest } from '../../services/workflow/types';

export async function createWorkflow(req: Request, res: Response) {
  try {
    const userId = req.user.id; // From auth middleware
    const tenantId = req.user.tenantId;
    const body: CreateWorkflowRequest = req.body;
    
    // Validate workflow definition
    const validation = ValidationService.validateWorkflow(body.definition);
    if (!validation.valid) {
      return res.status(400).json({
        error: 'Invalid workflow definition',
        details: validation.errors
      });
    }
    
    // Create workflow
    const workflow = await WorkflowService.create({
      ...body,
      createdBy: userId,
      tenantId
    });
    
    res.status(201).json({
      success: true,
      data: workflow
    });
  } catch (error) {
    console.error('Error creating workflow:', error);
    res.status(500).json({
      error: 'Failed to create workflow',
      message: error.message
    });
  }
}
```

#### **POST /api/workflows/:id/execute** - Execute Workflow

```typescript
// apps/api/src/routes/workflows/execute.ts

import { Request, Response } from 'express';
import { ExecutionService } from '../../services/workflow/ExecutionService';
import { WorkflowService } from '../../services/workflow/WorkflowService';

export async function executeWorkflow(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const tenantId = req.user.tenantId;
    const { triggerData, environment } = req.body;
    
    // Get workflow
    const workflow = await WorkflowService.get(id, tenantId);
    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found' });
    }
    
    // Create execution record
    const execution = await ExecutionService.createExecution({
      workflowId: id,
      tenantId,
      userId,
      triggerData,
      environment: environment || workflow.environment
    });
    
    // Enqueue job
    await ExecutionService.enqueueExecution({
      workflowId: id,
      executionId: execution.id,
      tenantId,
      userId,
      triggerData,
      environment: execution.environment
    });
    
    res.status(202).json({
      success: true,
      data: {
        executionId: execution.id,
        status: 'pending',
        message: 'Workflow execution queued'
      }
    });
  } catch (error) {
    console.error('Error executing workflow:', error);
    res.status(500).json({
      error: 'Failed to execute workflow',
      message: error.message
    });
  }
}
```

#### **GET /api/executions/:id** - Get Execution Details

```typescript
// apps/api/src/routes/workflows/executions/get.ts

import { Request, Response } from 'express';
import { ExecutionService } from '../../../services/workflow/ExecutionService';

export async function getExecution(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const tenantId = req.user.tenantId;
    
    const execution = await ExecutionService.getExecution(id, tenantId);
    if (!execution) {
      return res.status(404).json({ error: 'Execution not found' });
    }
    
    // Get logs
    const logs = await ExecutionService.getExecutionLogs(id, tenantId);
    
    res.json({
      success: true,
      data: {
        execution,
        logs
      }
    });
  } catch (error) {
    console.error('Error getting execution:', error);
    res.status(500).json({
      error: 'Failed to get execution',
      message: error.message
    });
  }
}
```

---

## 3️⃣ BullMQ Queue Setup

### 3.1 Queue Configuration

**File:** `apps/api/src/queues/workflow/WorkflowQueue.ts`

```typescript
import { Queue, Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { WorkflowJobData } from '../../services/workflow/types';
import { ExecutionEngine } from '../../workers/workflow/ExecutionEngine';

const connection = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: null
});

// ============================================================================
// Queue Setup
// ============================================================================

export const workflowQueue = new Queue<WorkflowJobData>('workflow-executions', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000 // 2s, 4s, 8s
    },
    removeOnComplete: {
      age: 86400, // Keep for 24 hours
      count: 1000 // Keep last 1000
    },
    removeOnFail: {
      age: 604800 // Keep failures for 7 days
    }
  }
});

// ============================================================================
// Worker Setup
// ============================================================================

export const workflowWorker = new Worker<WorkflowJobData>(
  'workflow-executions',
  async (job: Job<WorkflowJobData>) => {
    console.log(`Processing workflow execution: ${job.data.executionId}`);
    
    const engine = new ExecutionEngine(job.data);
    const result = await engine.execute();
    
    return result;
  },
  {
    connection,
    concurrency: 5, // Process 5 workflows simultaneously
    limiter: {
      max: 100, // Max 100 jobs
      duration: 60000 // per minute
    }
  }
);

// ============================================================================
// Event Handlers
// ============================================================================

workflowWorker.on('completed', (job) => {
  console.log(`Workflow execution completed: ${job.data.executionId}`);
});

workflowWorker.on('failed', (job, err) => {
  console.error(`Workflow execution failed: ${job?.data.executionId}`, err);
});

workflowWorker.on('error', (err) => {
  console.error('Worker error:', err);
});

// ============================================================================
// Graceful Shutdown
// ============================================================================

process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing worker...');
  await workflowWorker.close();
  await connection.quit();
  process.exit(0);
});
```

---

## 4️⃣ Execution Engine

### 4.1 Main Engine

**File:** `apps/api/src/workers/workflow/ExecutionEngine.ts`

```typescript
import { WorkflowJobData, ExecutionContext, WorkflowNode } from '../../services/workflow/types';
import { WorkflowService } from '../../services/workflow/WorkflowService';
import { ExecutionService } from '../../services/workflow/ExecutionService';
import { ManualTriggerExecutor } from './executors/ManualTriggerExecutor';
import { CrudRecordExecutor } from './executors/CrudRecordExecutor';
import { resolveVariables } from './utils/variableResolver';

export class ExecutionEngine {
  private jobData: WorkflowJobData;
  private context: ExecutionContext;
  
  constructor(jobData: WorkflowJobData) {
    this.jobData = jobData;
    this.context = {
      tenantId: jobData.tenantId,
      workflowId: jobData.workflowId,
      executionId: jobData.executionId,
      environment: jobData.environment,
      nodeOutputs: {},
      triggerData: jobData.triggerData || {},
      userId: jobData.userId
    };
  }
  
  async execute() {
    const startTime = Date.now();
    
    try {
      // 1. Load workflow definition
      const workflow = await WorkflowService.get(
        this.jobData.workflowId,
        this.jobData.tenantId
      );
      
      if (!workflow) {
        throw new Error('Workflow not found');
      }
      
      // 2. Update execution status to running
      await ExecutionService.updateExecution(this.jobData.executionId, {
        status: 'running',
        startedAt: new Date()
      });
      
      // 3. Find entry node (manual_trigger)
      const entryNode = workflow.definition.nodes.find(
        n => n.type === 'manual_trigger'
      );
      
      if (!entryNode) {
        throw new Error('No trigger node found');
      }
      
      // 4. Execute workflow starting from entry node
      await this.executeNode(entryNode, workflow.definition);
      
      // 5. Mark as completed
      const duration = Date.now() - startTime;
      await ExecutionService.updateExecution(this.jobData.executionId, {
        status: 'completed',
        completedAt: new Date(),
        durationMs: duration
      });
      
      return {
        success: true,
        executionId: this.jobData.executionId,
        duration
      };
      
    } catch (error) {
      // Handle failure
      const duration = Date.now() - startTime;
      await ExecutionService.updateExecution(this.jobData.executionId, {
        status: 'failed',
        completedAt: new Date(),
        durationMs: duration,
        errorMessage: error.message,
        errorNodeId: this.context.currentNodeId
      });
      
      throw error;
    }
  }
  
  private async executeNode(node: WorkflowNode, definition: any) {
    const nodeStartTime = Date.now();
    
    try {
      // 1. Update current node
      this.context.currentNodeId = node.id;
      await ExecutionService.updateExecution(this.jobData.executionId, {
        currentNodeId: node.id
      });
      
      // 2. Create log entry
      const logId = await ExecutionService.createLog({
        executionId: this.jobData.executionId,
        nodeId: node.id,
        nodeType: node.type,
        nodeName: node.name,
        status: 'running',
        inputData: resolveVariables(node.config, this.context)
      });
      
      // 3. Get executor for node type
      const executor = this.getExecutor(node.type);
      
      // 4. Execute node
      const result = await executor.execute(node.config, this.context);
      
      // 5. Store output in context
      this.context.nodeOutputs[node.id] = result.output;
      
      // 6. Update log with success
      const nodeDuration = Date.now() - nodeStartTime;
      await ExecutionService.updateLog(logId, {
        status: 'success',
        outputData: result.output,
        completedAt: new Date(),
        durationMs: nodeDuration
      });
      
      // 7. Find and execute next node
      const nextEdge = definition.edges.find((e: any) => e.source === node.id);
      if (nextEdge) {
        const nextNode = definition.nodes.find((n: any) => n.id === nextEdge.target);
        if (nextNode) {
          await this.executeNode(nextNode, definition);
        }
      }
      
    } catch (error) {
      const nodeDuration = Date.now() - nodeStartTime;
      await ExecutionService.updateLog(logId, {
        status: 'failed',
        errorMessage: error.message,
        errorStack: error.stack,
        completedAt: new Date(),
        durationMs: nodeDuration
      });
      
      throw error;
    }
  }
  
  private getExecutor(nodeType: string) {
    switch (nodeType) {
      case 'manual_trigger':
        return new ManualTriggerExecutor();
      case 'crud_record':
        return new CrudRecordExecutor();
      default:
        throw new Error(`Unknown node type: ${nodeType}`);
    }
  }
}
```

### 4.2 Node Executors

**File:** `apps/api/src/workers/workflow/executors/CrudRecordExecutor.ts`

```typescript
import { ExecutionContext, CrudRecordConfig, NodeExecutionResult } from '../../../services/workflow/types';
import { resolveVariables } from '../utils/variableResolver';
import { db } from '../../../lib/db'; // Your DB connection

export class CrudRecordExecutor {
  async execute(
    config: CrudRecordConfig,
    context: ExecutionContext
  ): Promise<NodeExecutionResult> {
    try {
      // Resolve all variables in config
      const resolvedConfig = resolveVariables(config, context) as CrudRecordConfig;
      
      const { operation, entity, filters, data, limit } = resolvedConfig;
      
      // Build table name with tenant schema
      const tableName = `${context.tenantId}.${entity}`;
      
      switch (operation) {
        case 'read':
          return await this.executeRead(tableName, filters, limit);
          
        case 'create':
          return await this.executeCreate(tableName, data);
          
        case 'update':
          return await this.executeUpdate(tableName, filters, data);
          
        case 'delete':
          return await this.executeDelete(tableName, filters);
          
        default:
          throw new Error(`Unknown operation: ${operation}`);
      }
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  private async executeRead(
    tableName: string,
    filters: any,
    limit: number = 100
  ): Promise<NodeExecutionResult> {
    const whereClause = this.buildWhereClause(filters);
    const query = `SELECT * FROM ${tableName} ${whereClause} LIMIT ${limit}`;
    
    const results = await db.query(query);
    
    return {
      success: true,
      output: {
        records: results.rows,
        count: results.rows.length
      }
    };
  }
  
  private async executeCreate(
    tableName: string,
    data: any
  ): Promise<NodeExecutionResult> {
    const columns = Object.keys(data).join(', ');
    const values = Object.values(data);
    const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
    
    const query = `
      INSERT INTO ${tableName} (${columns})
      VALUES (${placeholders})
      RETURNING *
    `;
    
    const result = await db.query(query, values);
    
    return {
      success: true,
      output: {
        record: result.rows[0],
        created: true
      }
    };
  }
  
  private async executeUpdate(
    tableName: string,
    filters: any,
    data: any
  ): Promise<NodeExecutionResult> {
    const setClause = Object.keys(data)
      .map((key, i) => `${key} = $${i + 1}`)
      .join(', ');
    const whereClause = this.buildWhereClause(filters);
    
    const query = `
      UPDATE ${tableName}
      SET ${setClause}
      ${whereClause}
      RETURNING *
    `;
    
    const result = await db.query(query, Object.values(data));
    
    return {
      success: true,
      output: {
        records: result.rows,
        updated: result.rowCount
      }
    };
  }
  
  private async executeDelete(
    tableName: string,
    filters: any
  ): Promise<NodeExecutionResult> {
    const whereClause = this.buildWhereClause(filters);
    const query = `DELETE FROM ${tableName} ${whereClause}`;
    
    const result = await db.query(query);
    
    return {
      success: true,
      output: {
        deleted: result.rowCount
      }
    };
  }
  
  private buildWhereClause(filters: any): string {
    if (!filters || Object.keys(filters).length === 0) {
      return '';
    }
    
    const conditions = Object.entries(filters).map(([key, value]) => {
      // Handle operators: { field: { operator: '>', value: 100 } }
      if (typeof value === 'object' && value.operator) {
        return `${key} ${value.operator} '${value.value}'`;
      }
      // Simple equality
      return `${key} = '${value}'`;
    });
    
    return `WHERE ${conditions.join(' AND ')}`;
  }
}
```

---

## 5️⃣ Services

### 5.1 Workflow Service

**File:** `apps/api/src/services/workflow/WorkflowService.ts`

```typescript
import { db } from '../../lib/db';
import { Workflow, CreateWorkflowRequest, UpdateWorkflowRequest } from './types';

export class WorkflowService {
  static async create(data: CreateWorkflowRequest & { createdBy: string; tenantId: string }): Promise<Workflow> {
    const query = `
      INSERT INTO workflows (name, description, definition, environment, created_by)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
    
    const result = await db.query(query, [
      data.name,
      data.description,
      JSON.stringify(data.definition),
      data.environment || 'sandbox',
      data.createdBy
    ]);
    
    return this.mapToWorkflow(result.rows[0]);
  }
  
  static async list(tenantId: string, filters?: any): Promise<Workflow[]> {
    const query = `
      SELECT * FROM workflows
      WHERE created_by IN (SELECT id FROM users WHERE tenant_id = $1)
      ORDER BY created_at DESC
    `;
    
    const result = await db.query(query, [tenantId]);
    return result.rows.map(this.mapToWorkflow);
  }
  
  static async get(id: string, tenantId: string): Promise<Workflow | null> {
    const query = `
      SELECT * FROM workflows
      WHERE id = $1
      AND created_by IN (SELECT id FROM users WHERE tenant_id = $2)
    `;
    
    const result = await db.query(query, [id, tenantId]);
    return result.rows[0] ? this.mapToWorkflow(result.rows[0]) : null;
  }
  
  static async update(id: string, tenantId: string, data: UpdateWorkflowRequest): Promise<Workflow> {
    const fields = [];
    const values = [];
    let paramIndex = 1;
    
    if (data.name) {
      fields.push(`name = $${paramIndex++}`);
      values.push(data.name);
    }
    if (data.description !== undefined) {
      fields.push(`description = $${paramIndex++}`);
      values.push(data.description);
    }
    if (data.definition) {
      fields.push(`definition = $${paramIndex++}`);
      values.push(JSON.stringify(data.definition));
    }
    
    values.push(id, tenantId);
    
    const query = `
      UPDATE workflows
      SET ${fields.join(', ')}
      WHERE id = $${paramIndex++}
      AND created_by IN (SELECT id FROM users WHERE tenant_id = $${paramIndex++})
      RETURNING *
    `;
    
    const result = await db.query(query, values);
    return this.mapToWorkflow(result.rows[0]);
  }
  
  static async delete(id: string, tenantId: string): Promise<boolean> {
    const query = `
      DELETE FROM workflows
      WHERE id = $1
      AND created_by IN (SELECT id FROM users WHERE tenant_id = $2)
    `;
    
    const result = await db.query(query, [id, tenantId]);
    return result.rowCount > 0;
  }
  
  private static mapToWorkflow(row: any): Workflow {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      definition: row.definition,
      version: row.version,
      status: row.status,
      environment: row.environment,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      publishedAt: row.published_at
    };
  }
}
```

---

## 6️⃣ Validation Service

**File:** `apps/api/src/services/workflow/ValidationService.ts`

```typescript
import { WorkflowDefinition, WorkflowNode } from './types';

interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export class ValidationService {
  static validateWorkflow(definition: WorkflowDefinition): ValidationResult {
    const errors: string[] = [];
    
    // 1. Must have at least one node
    if (!definition.nodes || definition.nodes.length === 0) {
      errors.push('Workflow must have at least one node');
    }
    
    // 2. Must have manual_trigger node
    const hasTrigger = definition.nodes.some(n => n.type === 'manual_trigger');
    if (!hasTrigger) {
      errors.push('Workflow must have a manual_trigger node');
    }
    
    // 3. All edges must reference existing nodes
    const nodeIds = new Set(definition.nodes.map(n => n.id));
    for (const edge of definition.edges || []) {
      if (!nodeIds.has(edge.source)) {
        errors.push(`Edge references non-existent source node: ${edge.source}`);
      }
      if (!nodeIds.has(edge.target)) {
        errors.push(`Edge references non-existent target node: ${edge.target}`);
      }
    }
    
    // 4. No cycles (for Phase 1)
    if (this.hasCycles(definition)) {
      errors.push('Workflow contains cycles (not supported in Phase 1)');
    }
    
    // 5. All nodes must be reachable from trigger
    const reachable = this.getReachableNodes(definition);
    const unreachable = definition.nodes.filter(n => !reachable.has(n.id));
    if (unreachable.length > 0) {
      errors.push(`Unreachable nodes: ${unreachable.map(n => n.name).join(', ')}`);
    }
    
    // 6. Validate node configs
    for (const node of definition.nodes) {
      const nodeErrors = this.validateNodeConfig(node);
      errors.push(...nodeErrors);
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
  
  private static validateNodeConfig(node: WorkflowNode): string[] {
    const errors: string[] = [];
    
    if (node.type === 'crud_record') {
      const config = node.config as any;
      
      if (!config.operation) {
        errors.push(`Node ${node.name}: operation is required`);
      }
      
      if (!config.entity) {
        errors.push(`Node ${node.name}: entity is required`);
      }
      
      if (config.operation === 'create' && !config.data) {
        errors.push(`Node ${node.name}: data is required for create operation`);
      }
      
      if (['update', 'delete'].includes(config.operation) && !config.filters) {
        errors.push(`Node ${node.name}: filters are required for ${config.operation} operation`);
      }
    }
    
    return errors;
  }
  
  private static hasCycles(definition: WorkflowDefinition): boolean {
    const visited = new Set<string>();
    const recStack = new Set<string>();
    
    const dfs = (nodeId: string): boolean => {
      visited.add(nodeId);
      recStack.add(nodeId);
      
      const edges = definition.edges.filter(e => e.source === nodeId);
      for (const edge of edges) {
        if (!visited.has(edge.target)) {
          if (dfs(edge.target)) return true;
        } else if (recStack.has(edge.target)) {
          return true; // Cycle detected
        }
      }
      
      recStack.delete(nodeId);
      return false;
    };
    
    for (const node of definition.nodes) {
      if (!visited.has(node.id)) {
        if (dfs(node.id)) return true;
      }
    }
    
    return false;
  }
  
  private static getReachableNodes(definition: WorkflowDefinition): Set<string> {
    const trigger = definition.nodes.find(n => n.type === 'manual_trigger');
    if (!trigger) return new Set();
    
    const reachable = new Set<string>([trigger.id]);
    const queue = [trigger.id];
    
    while (queue.length > 0) {
      const current = queue.shift()!;
      const edges = definition.edges.filter(e => e.source === current);
      
      for (const edge of edges) {
        if (!reachable.has(edge.target)) {
          reachable.add(edge.target);
          queue.push(edge.target);
        }
      }
    }
    
    return reachable;
  }
}
```

---

## 7️⃣ Testing Plan

### 7.1 Unit Tests
- Validation service (all validation rules)
- Variable resolver (template parsing)
- CRUD executor (each operation)
- DAG validator (cycle detection)

### 7.2 Integration Tests
- Create workflow → Execute → Verify results
- Failed execution → Retry logic
- Concurrent executions
- Multi-tenant isolation

### 7.3 Manual Testing Checklist
```
□ Create workflow via API
□ Execute workflow manually
□ View execution logs
□ Test with missing data (error handling)
□ Test with invalid workflow (validation)
□ Test concurrent executions
□ Test sandbox vs production modes
□ Test multi-tenant isolation
```

---

## 8️⃣ Deployment Checklist

```
□ Database migration applied
□ Environment variables set
□ Redis connection configured
□ BullMQ worker running
□ API endpoints tested
□ Monitoring/logging set up
□ Error alerts configured
□ Performance baseline established
```

---

## 9️⃣ Next Steps After Phase 1

Once these 2 nodes work perfectly:

1. **Add 3rd node:** If/Else (logic)
2. **Add 4th node:** Send Communication (email)
3. **Add 5th node:** Schedule Trigger
4. **Add remaining 6 nodes**

Each node follows the same pattern, so adding new nodes becomes trivial.

---

## 🎯 Success Criteria

Phase 1 is complete when:

✅ Can create workflow with 2 nodes via API  
✅ Can execute workflow manually  
✅ Execution appears in logs with node-level details  
✅ Can read/write data via CRUD node  
✅ Multi-tenant isolation verified  
✅ Error handling works (retry, DLQ)  
✅ API documentation complete  

---

**Estimated Time:** 5-8 days for backend complete
