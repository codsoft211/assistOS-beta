/**
 * Execution Engine - Core Type Definitions
 * 
 * This file defines the core interfaces for the workflow execution engine.
 */

/**
 * ExecutionContext - Runtime context for a workflow execution
 * Contains all necessary information to execute and track a workflow run
 */
export interface ExecutionContext {
  workflowId: string;
  executionId: string;
  tenantId: string;
  variables: Record<string, any>;
  stepResults: Record<string, any>;
  schema?: string;  // Add schema to context
}

/**
 * WorkflowStep - Individual step within a workflow
 * Represents a single action to be executed in sequence
 */
export interface WorkflowStep {
  id: string;
  name: string;
  action: string; // e.g., 'send_email', 'create_record', 'call_api'
  config: Record<string, any>;
  onError?: 'stop' | 'continue' | 'retry';
  retryCount?: number;
}

/**
 * ExecutionResult - Result of a step execution
 * Captures the outcome and any outputs from executing a step
 */
export interface ExecutionResult {
  success: boolean;
  stepId: string;
  output?: any;
  error?: string;
  executedAt: Date;
}

/**
 * WorkflowDefinition - Complete workflow definition
 * Defines the structure and configuration of a workflow
 */
export interface WorkflowDefinition {
  id: string;
  name: string;
  steps: WorkflowStep[];
  config?: {
    timeout?: number;
    retryPolicy?: 'stop' | 'continue';
  };
}
