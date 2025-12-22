/**
 * AssistBuild Workflow Execution Engine
 * 
 * Orchestrates the execution of workflow nodes in DAG order.
 * Handles:
 * - DAG traversal (topological execution)
 * - Node execution delegation
 * - State management
 * - Error handling and retries
 * - Logging at each step
 */

import { db } from '../../db.js';
import { 
  assistbuildWorkflows,
  assistbuildExecutions,
  assistbuildExecutionLogs,
} from '../../../../shared/schema.js';
import { eq } from 'drizzle-orm';
import type { 
  AssistBuildWorkflowDefinition, 
  AssistBuildNode,
  AssistBuildEdge,
} from '../../../../shared/schema.js';
import logger from '../../../api/logger.js';
import { ManualTriggerExecutor } from './executors/manual-trigger.js';
import { CrudRecordExecutor } from './executors/crud-record.js';
import { ScheduleTriggerExecutor } from './executors/schedule-trigger.js';
import { FetchInvoiceExecutor } from './executors/fetch-invoice.js';
import { SendEmailExecutor } from './executors/send-email.js';

interface ExecutionContext {
  workflowId: string;
  executionId: string;
  tenantId: string;
  userId: string;
  environment: 'sandbox' | 'production';
  variables: Record<string, any>;
  triggerData?: any;
}

interface NodeExecutor {
  execute(
    node: AssistBuildNode,
    context: ExecutionContext
  ): Promise<{ success: boolean; output?: any; error?: string }>;
}

export class ExecutionEngine {
  private executors: Map<string, NodeExecutor> = new Map();

  constructor() {
    // Register node executors for Phase 1
    this.executors.set('manual_trigger', new ManualTriggerExecutor());
    this.executors.set('crud_record', new CrudRecordExecutor());
    
    // Register Invoice Workflow node executors
    this.executors.set('schedule_trigger', new ScheduleTriggerExecutor());
    this.executors.set('fetch_invoice', new FetchInvoiceExecutor());
    this.executors.set('send_email', new SendEmailExecutor());
  }

  /**
   * Main execution entry point
   */
  async execute(context: ExecutionContext): Promise<void> {
    const { workflowId, executionId, tenantId } = context;

    logger.info(
      { workflowId, executionId, tenantId },
      '[ExecutionEngine] Starting workflow execution'
    );

    try {
      // 1. Load workflow definition
      const workflow = await this.loadWorkflow(workflowId, tenantId);
      if (!workflow) {
        throw new Error(`Workflow ${workflowId} not found`);
      }

      // 2. Update execution status to running
      await this.updateExecutionStatus(executionId, 'running');

      // 3. Execute nodes in DAG order
      const executionOrder = this.getExecutionOrder(workflow.definition);
      logger.info(
        { workflowId, executionId, executionOrder: executionOrder.map(n => n.id) },
        '[ExecutionEngine] Execution order determined'
      );

      for (const node of executionOrder) {
        const result = await this.executeNode(node, context);
        if (!result.success && !node.config?.continueOnError) {
          const errorMsg = result.error || `Node ${node.id} (${node.type}) failed`;
          throw new Error(errorMsg);
        }
      }

      // 4. Mark execution as completed
      await this.updateExecutionStatus(executionId, 'completed');
      logger.info(
        { workflowId, executionId },
        '[ExecutionEngine] ✅ Workflow execution completed'
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      
      logger.error(
        { error: { message: errorMessage, stack: errorStack }, workflowId, executionId },
        '[ExecutionEngine] ❌ Workflow execution failed'
      );

      await this.updateExecutionStatus(executionId, 'failed', errorMessage);
      throw error;
    }
  }

  /**
   * Load workflow from database
   */
  private async loadWorkflow(workflowId: string, tenantId: string) {
    const [workflow] = await db
      .select()
      .from(assistbuildWorkflows)
      .where(eq(assistbuildWorkflows.id, workflowId));

    if (!workflow || workflow.tenantId !== tenantId) {
      return null;
    }

    return workflow;
  }

  /**
   * Get execution order using topological sort
   * Ensures nodes execute in correct DAG order
   */
  private getExecutionOrder(definition: AssistBuildWorkflowDefinition): AssistBuildNode[] {
    const { nodes, edges } = definition;
    
    // Build adjacency list and in-degree map
    const adjacencyList = new Map<string, string[]>();
    const inDegree = new Map<string, number>();
    
    // Initialize all nodes
    nodes.forEach((node: AssistBuildNode) => {
      adjacencyList.set(node.id, []);
      inDegree.set(node.id, 0);
    });
    
    // Build graph from edges
    edges.forEach((edge: AssistBuildEdge) => {
      adjacencyList.get(edge.source)?.push(edge.target);
      inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
    });
    
    // Kahn's algorithm for topological sort
    const queue: string[] = [];
    const executionOrder: AssistBuildNode[] = [];
    
    // Start with nodes that have no dependencies
    inDegree.forEach((degree, nodeId) => {
      if (degree === 0) {
        queue.push(nodeId);
      }
    });
    
    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      const node = nodes.find((n: AssistBuildNode) => n.id === nodeId);
      
      if (node) {
        executionOrder.push(node);
      }
      
      // Reduce in-degree for all neighbors
      const neighbors = adjacencyList.get(nodeId) || [];
      neighbors.forEach(neighborId => {
        const newDegree = (inDegree.get(neighborId) || 0) - 1;
        inDegree.set(neighborId, newDegree);
        
        if (newDegree === 0) {
          queue.push(neighborId);
        }
      });
    }
    
    // Check for cycles (should have been caught in validation)
    if (executionOrder.length !== nodes.length) {
      throw new Error('Cycle detected in workflow graph');
    }
    
    return executionOrder;
  }

  /**
   * Execute a single node
   */
  private async executeNode(
    node: AssistBuildNode,
    context: ExecutionContext
  ): Promise<{ success: boolean; error?: string }> {
    const { executionId } = context;
    const startTime = new Date();

    console.log(`🔥 EXECUTE NODE START: ${node.id} (${node.type})`);
    console.log(`🔥 Context variables:`, JSON.stringify(context.variables, null, 2));
    console.log(`🔥 Node config:`, JSON.stringify(node.config, null, 2));

    logger.info(
      { executionId, nodeId: node.id, nodeType: node.type },
      '[ExecutionEngine] Executing node'
    );
    
    logger.info(
      { executionId, nodeId: node.id, nodeType: node.type, step: 'START_EXECUTE_NODE' },
      '[ExecutionEngine] DEBUG: Starting executeNode'
    );

    // Create log entry
    const [logEntry] = await db
      .insert(assistbuildExecutionLogs)
      .values({
        executionId,
        tenantId: context.tenantId,
        nodeId: node.id,
        nodeType: node.type,
        nodeName: node.name,
        status: 'running',
        startedAt: startTime,
      })
      .returning();

    try {
      // Get executor for node type
      const executor = this.executors.get(node.type);
      if (!executor) {
        throw new Error(`No executor found for node type: ${node.type}`);
      }

      // Substitute variables in node config before execution
      console.log('VARIABLE RESOLUTION CHECKPOINT 1 - About to resolve variables');
      logger.info(
        { 
          executionId, 
          nodeId: node.id,
          originalConfig: node.config,
          contextVariables: context.variables,
          triggerData: context.triggerData
        },
        '[ExecutionEngine] BEFORE variable resolution'
      );
      console.log('VARIABLE RESOLUTION CHECKPOINT 2 - Logged BEFORE info');
      
      const resolvedNode = this.resolveNodeVariables(node, context);
      
      logger.info(
        { 
          executionId, 
          nodeId: node.id,
          resolvedConfig: resolvedNode.config,
          contextVariables: context.variables
        },
        '[ExecutionEngine] AFTER variable resolution'
      );
      
      // Additional debug for CRUD nodes
      if (node.type === 'crud_record') {
        logger.info(
          {
            executionId,
            nodeId: node.id,
            hasRecordData: !!(resolvedNode.config as any).recordData,
            hasData: !!(resolvedNode.config as any).data,
            recordDataValue: (resolvedNode.config as any).recordData,
            dataValue: (resolvedNode.config as any).data
          },
          '[ExecutionEngine] CRUD node debug'
        );
      }

      // Execute node with resolved config
      const result = await executor.execute(resolvedNode, context);

      // Update log with result
      await db
        .update(assistbuildExecutionLogs)
        .set({
          status: result.success ? 'success' : 'failed',
          outputData: result.output,
          errorMessage: result.error,
          completedAt: new Date(),
          durationMs: Date.now() - startTime.getTime(),
        })
        .where(eq(assistbuildExecutionLogs.id, logEntry.id));

      logger.info(
        { 
          executionId, 
          nodeId: node.id, 
          success: result.success,
          duration: Date.now() - startTime.getTime(),
        },
        '[ExecutionEngine] Node execution completed'
      );

      return { success: result.success, error: result.error };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      
      // Update log with error
      await db
        .update(assistbuildExecutionLogs)
        .set({
          status: 'failed',
          errorMessage,
          errorStack,
          completedAt: new Date(),
          durationMs: Date.now() - startTime.getTime(),
        })
        .where(eq(assistbuildExecutionLogs.id, logEntry.id));

      logger.error(
        { error: { message: errorMessage, stack: errorStack }, executionId, nodeId: node.id },
        '[ExecutionEngine] Node execution failed'
      );

      return { success: false, error: errorMessage };
    }
  }

  /**
   * Resolve template variables in node configuration
   * Replaces {{variable.path}} with actual values from context
   */
  private resolveNodeVariables(node: AssistBuildNode, context: ExecutionContext): AssistBuildNode {
    const resolvedNode = { ...node };
    
    // Skip resolution for send_email node - it has its own template system
    // that works with invoice data in the loop
    if (node.type === 'send_email') {
      return resolvedNode;
    }
    
    resolvedNode.config = this.resolveObject(node.config, context);
    return resolvedNode;
  }

  /**
   * Recursively resolve variables in an object
   */
  private resolveObject(obj: any, context: ExecutionContext): any {
    if (typeof obj === 'string') {
      return this.resolveString(obj, context);
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.resolveObject(item, context));
    }

    if (obj && typeof obj === 'object') {
      const resolved: any = {};
      for (const [key, value] of Object.entries(obj)) {
        resolved[key] = this.resolveObject(value, context);
      }
      return resolved;
    }

    return obj;
  }

  /**
   * Resolve template variables in a string
   * Supports: {{variable}}, {{variable.nested.path}}, {{trigger.data.field}}
   */
  private resolveString(str: string, context: ExecutionContext): any {
    // Check if entire string is a template variable (return actual type)
    const fullMatch = str.match(/^{{(.+?)}}$/);
    if (fullMatch) {
      const path = fullMatch[1].trim();
      return this.getValueByPath(path, context);
    }

    // Replace inline templates (convert to string)
    return str.replace(/{{(.+?)}}/g, (_, path) => {
      const value = this.getValueByPath(path.trim(), context);
      return value !== undefined ? String(value) : '';
    });
  }

  /**
   * Get value from context by dot-notation path
   * Examples: "trigger.data.email", "newCustomer.id", "customer.name"
   */
  private getValueByPath(path: string, context: ExecutionContext): any {
    const parts = path.split('.');
    
    // Start with context variables (which includes 'trigger' set by ManualTriggerExecutor)
    let value: any = context.variables;

    // Navigate the path
    for (const part of parts) {
      if (value === undefined || value === null) {
        return undefined;
      }
      value = value[part];
    }

    return value;
  }

  /**
   * Update execution status in database
   */
  private async updateExecutionStatus(
    executionId: string,
    status: 'running' | 'completed' | 'failed' | 'cancelled',
    error?: string
  ): Promise<void> {
    const updates: any = { status };

    if (status === 'running') {
      updates.startedAt = new Date();
    } else if (status === 'completed') {
      updates.completedAt = new Date();
    } else if (status === 'failed') {
      updates.completedAt = new Date();
      if (error) {
        updates.errorMessage = error;
      }
    }

    await db
      .update(assistbuildExecutions)
      .set(updates)
      .where(eq(assistbuildExecutions.id, executionId));
  }
}
