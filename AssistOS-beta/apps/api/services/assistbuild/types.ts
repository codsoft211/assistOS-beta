/**
 * AssistBuild Workflow Types
 * Type definitions for the visual workflow builder system
 */

import type { 
  SelectAssistbuildWorkflow,
  SelectAssistbuildExecution,
  SelectAssistbuildExecutionLog,
  InsertAssistbuildWorkflow,
  InsertAssistbuildExecution,
  InsertAssistbuildExecutionLog,
} from '../../../shared/schema.js';

// Re-export schema types
export type AssistBuildWorkflow = SelectAssistbuildWorkflow;
export type AssistBuildExecution = SelectAssistbuildExecution;
export type AssistBuildExecutionLog = SelectAssistbuildExecutionLog;

export type CreateWorkflowInput = InsertAssistbuildWorkflow;
export type CreateExecutionInput = InsertAssistbuildExecution;
export type CreateLogInput = InsertAssistbuildExecutionLog;

// ==================== Node Types ====================

export type NodeType = 'manual_trigger' | 'crud_record' | 'schedule_trigger' | 'fetch_invoice' | 'send_email';

export type CrudOperation = 'create' | 'read' | 'update' | 'delete';

export interface NodePosition {
  x: number;
  y: number;
}

// Base node configuration
export interface BaseNodeConfig {
  [key: string]: any;
}

// Manual Trigger Node
export interface ManualTriggerConfig extends BaseNodeConfig {
  // No specific config for Phase 1
  allowedRoles?: string[];
}

// CRUD Record Node
export interface CrudRecordConfig extends BaseNodeConfig {
  operation: CrudOperation;
  entity: string; // 'customers', 'invoices', 'leads', etc.
  filters?: Record<string, any>; // For read/update/delete
  data?: Record<string, any>; // For create/update
  limit?: number; // For read operations (default: 100)
}

// Node definition (in workflow)
export interface WorkflowNode {
  id: string;
  type: NodeType;
  name: string;
  position: NodePosition;
  config: ManualTriggerConfig | CrudRecordConfig;
}

// Edge (connection between nodes)
export interface WorkflowEdge {
  id: string;
  source: string; // source node id
  target: string; // target node id
  condition?: string; // For conditional edges (future: if/else)
  loopBack?: boolean; // For loop edges (future: loop node)
}

// Complete workflow definition
export interface WorkflowDefinition {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  variables?: Record<string, any>;
}

// ==================== Execution Types ====================

export type WorkflowStatus = 'draft' | 'published' | 'archived';
export type ExecutionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
export type LogStatus = 'running' | 'success' | 'failed' | 'skipped';

export interface ExecutionContext {
  tenantId: string;
  workflowId: string;
  executionId: string;
  environment: 'sandbox' | 'production';
  nodeOutputs: Record<string, any>;
  triggerData: any;
  userId: string;
  currentNodeId?: string;
  variables?: Record<string, any>;
}

export interface NodeExecutionResult {
  success: boolean;
  output?: any;
  error?: string;
}

// ==================== API Request/Response Types ====================

export interface CreateWorkflowRequest {
  name: string;
  description?: string;
  definition: WorkflowDefinition;
  environment?: 'sandbox' | 'production';
}

export interface UpdateWorkflowRequest {
  name?: string;
  description?: string;
  definition?: WorkflowDefinition;
  status?: WorkflowStatus;
}

export interface ExecuteWorkflowRequest {
  triggerData?: any;
  environment?: 'sandbox' | 'production'; // For testing
}

export interface ListWorkflowsQuery {
  status?: WorkflowStatus;
  environment?: 'sandbox' | 'production';
  page?: number;
  limit?: number;
}

export interface ListExecutionsQuery {
  workflowId?: string;
  status?: ExecutionStatus;
  page?: number;
  limit?: number;
}

// ==================== Validation Types ====================

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings?: string[];
}

export interface NodeValidationError {
  nodeId: string;
  nodeName: string;
  errors: string[];
}

// ==================== BullMQ Job Types ====================

export interface WorkflowJobData {
  workflowId: string;
  executionId: string;
  tenantId: string;
  userId: string;
  triggerData?: any;
  environment: 'sandbox' | 'production';
}

// ==================== Variable Resolution ====================

export interface VariableContext {
  trigger?: any;
  loop?: {
    current: any;
    index: number;
    total: number;
  };
  nodeOutputs?: Record<string, any>;
  variables?: Record<string, any>;
  now?: Date;
}

// ==================== Execution Summary ====================

export interface ExecutionSummary {
  execution: AssistBuildExecution;
  workflow: AssistBuildWorkflow;
  logs: AssistBuildExecutionLog[];
  totalNodes: number;
  successfulNodes: number;
  failedNodes: number;
  progress: number; // 0-100 percentage
}
