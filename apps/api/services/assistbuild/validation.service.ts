/**
 * AssistBuild Workflow Validation Service
 * Validates workflow definitions before saving or executing
 */

import type {
  WorkflowDefinition,
  WorkflowNode,
  ValidationResult,
  NodeValidationError,
  CrudRecordConfig,
} from './types.js';

export class ValidationService {
  /**
   * Validate complete workflow definition
   * @param definition The workflow to validate
   * @param strict If true, enforces strict production rules (trigger required, no orphans, etc.)
   */
  static validateWorkflow(definition: WorkflowDefinition, strict: boolean = true): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 1. Must have at least one node
    if (!definition.nodes || definition.nodes.length === 0) {
      errors.push('Workflow must have at least one node');
      return { valid: false, errors, warnings };
    }

    // 2. Trigger Check (Strict only)
    const hasTrigger = definition.nodes.some(n =>
      n.type === 'manual_trigger' ||
      n.type === 'schedule_trigger' ||
      n.type === 'webhook_trigger'
    );

    if (strict && !hasTrigger) {
      errors.push('Production workflows must have at least one trigger node (Manual, Schedule, or Webhook)');
    } else if (!hasTrigger) {
      warnings.push('Draft currently lacks a trigger node');
    }

    // 3. Connectivity Check (Strict only)
    const reachable = this.getReachableNodes(definition);
    const unreachable = definition.nodes.filter(n => !reachable.has(n.id));

    if (strict && unreachable.length > 0) {
      errors.push(`Workflow contains orphaned nodes that are unreachable from the trigger: ${unreachable.map(n => n.name || n.id).join(', ')}`);
    } else if (unreachable.length > 0) {
      warnings.push(`Some nodes are unreachable: ${unreachable.map(n => n.name || n.id).join(', ')}`);
    }

    // 4. Edge Validation
    const nodeIds = new Set(definition.nodes.map(n => n.id));
    for (const edge of definition.edges || []) {
      if (!nodeIds.has(edge.source)) errors.push(`Edge references non-existent source node: ${edge.source}`);
      if (!nodeIds.has(edge.target)) errors.push(`Edge references non-existent target node: ${edge.target}`);
    }

    // 5. Node Config Validation
    const nodeErrors = this.validateNodes(definition.nodes);
    for (const nodeError of nodeErrors) {
      errors.push(...nodeError.errors.map(e => `Node "${nodeError.nodeName}": ${e}`));
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /**
   * Validate individual node configurations
   */
  private static validateNodes(nodes: WorkflowNode[]): NodeValidationError[] {
    const nodeErrors: NodeValidationError[] = [];

    for (const node of nodes) {
      const errors: string[] = [];

      // Validate node ID
      if (!node.id || node.id.trim() === '') {
        errors.push('Node ID is required');
      }

      // Validate node name
      if (!node.name || node.name.trim() === '') {
        errors.push('Node name is required');
      }

      // Validate node type
      if (!node.type) {
        errors.push('Node type is required');
      }

      // Validate node position
      if (!node.position || typeof node.position.x !== 'number' || typeof node.position.y !== 'number') {
        errors.push('Node must have valid position (x, y)');
      }

      // Type-specific validation
      if (node.type === 'crud_record') {
        errors.push(...this.validateCrudRecordNode(node));
      } else if (node.type === 'manual_trigger' || node.type === 'schedule_trigger') {
        // Trigger nodes have minimal required config
      } else if (node.type === 'fetch_invoice' || node.type === 'send_email') {
        // Invoice workflow nodes - validated by executor
      } else {
        errors.push(`Unknown node type: ${node.type}`);
      }

      if (errors.length > 0) {
        nodeErrors.push({
          nodeId: node.id,
          nodeName: node.name,
          errors,
        });
      }
    }

    return nodeErrors;
  }

  /**
   * Validate CRUD Record node configuration
   */
  private static validateCrudRecordNode(node: WorkflowNode): string[] {
    const errors: string[] = [];
    const config = node.config as CrudRecordConfig;

    if (!config.operation) {
      errors.push('operation is required');
    } else if (!['create', 'read', 'update', 'delete'].includes(config.operation)) {
      errors.push(`Invalid operation: ${config.operation}. Must be: create, read, update, delete`);
    }

    if (!config.entity || config.entity.trim() === '') {
      errors.push('entity is required (e.g., "customers", "invoices")');
    }

    // Operation-specific validation
    if (config.operation === 'create') {
      if (!config.data) {
        errors.push('data is required for create operation');
      } else if (typeof config.data !== 'object' || Array.isArray(config.data)) {
        errors.push('data must be an object');
      }
    }

    if (config.operation === 'update') {
      if (!config.data) {
        errors.push('data is required for update operation');
      }
      if (!config.filters) {
        errors.push('filters are required for update operation');
      }
    }

    if (config.operation === 'delete') {
      if (!config.filters) {
        errors.push('filters are required for delete operation');
      }
    }

    // Validate limit for read operations
    if (config.operation === 'read' && config.limit !== undefined) {
      if (typeof config.limit !== 'number' || config.limit < 1 || config.limit > 1000) {
        errors.push('limit must be a number between 1 and 1000');
      }
    }

    return errors;
  }

  /**
   * Check if workflow contains cycles (circular dependencies)
   */
  private static hasCycles(definition: WorkflowDefinition): boolean {
    const visited = new Set<string>();
    const recStack = new Set<string>();

    const dfs = (nodeId: string): boolean => {
      visited.add(nodeId);
      recStack.add(nodeId);

      const edges = (definition.edges || []).filter(e => e.source === nodeId);
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

  /**
   * Get all nodes reachable from trigger node
   */
  private static getReachableNodes(definition: WorkflowDefinition): Set<string> {
    const trigger = definition.nodes.find(n => n.type === 'manual_trigger' || n.type === 'schedule_trigger');
    if (!trigger) return new Set();

    const reachable = new Set<string>([trigger.id]);
    const queue = [trigger.id];

    while (queue.length > 0) {
      const current = queue.shift()!;
      const edges = (definition.edges || []).filter(e => e.source === current);

      for (const edge of edges) {
        if (!reachable.has(edge.target)) {
          reachable.add(edge.target);
          queue.push(edge.target);
        }
      }
    }

    return reachable;
  }

  /**
   * Validate variable references in node config
   * Checks if referenced variables exist in context
   */
  static validateVariableReferences(
    config: any,
    availableVariables: string[]
  ): string[] {
    const errors: string[] = [];
    const varPattern = /\{\{([^}]+)\}\}/g;

    const checkValue = (value: any, path: string = '') => {
      if (typeof value === 'string') {
        const matches = Array.from(value.matchAll(varPattern));
        for (const match of matches) {
          const varName = match[1].trim();
          // Basic variable names (trigger.*, loop.*, node_*.output.*)
          const baseVar = varName.split('.')[0];

          if (!['trigger', 'loop', 'now'].includes(baseVar) &&
            !baseVar.startsWith('node_') &&
            !availableVariables.includes(baseVar)) {
            errors.push(`Invalid variable reference at ${path}: {{${varName}}}`);
          }
        }
      } else if (typeof value === 'object' && value !== null) {
        for (const [key, val] of Object.entries(value)) {
          checkValue(val, path ? `${path}.${key}` : key);
        }
      }
    };

    checkValue(config);
    return errors;
  }
}
