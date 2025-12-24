import { z } from 'zod';
import { ToolBase, type ToolManifest, type ToolExecutionContext } from '../../kernel';
import { WorkflowService, ValidationService, type WorkflowDefinition, type WorkflowNode, type WorkflowEdge, type NodeType } from '../../../../../apps/api/services/assistbuild/index.js';

const allowedNodeTypes: NodeType[] = [
  'manual_trigger',
  'crud_record',
  'schedule_trigger',
  'fetch_invoice',
  'send_email',
  'webhook_trigger',
];

function isValidNodeType(type: string): type is NodeType {
  return (allowedNodeTypes as string[]).includes(type);
}

const positionSchema = z.object({
  x: z.number(),
  y: z.number(),
});

const operationSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('add_node'),
    node: z.object({
      id: z.string().min(1, 'Node id is required'),
      type: z.string().min(1, 'Node type is required'),
      name: z.string().min(1, 'Node name is required'),
      position: positionSchema,
      config: z.record(z.any()).default({}),
    }),
  }),
  z.object({
    type: z.literal('update_node'),
    id: z.string().min(1, 'Node id is required'),
    name: z.string().optional(),
    position: positionSchema.optional(),
    config: z.record(z.any()).optional(),
  }),
  z.object({
    type: z.literal('delete_node'),
    id: z.string().min(1, 'Node id is required'),
  }),
  z.object({
    type: z.literal('add_edge'),
    edge: z.object({
      id: z.string().min(1, 'Edge id is required'),
      source: z.string().min(1, 'Edge source node id is required'),
      target: z.string().min(1, 'Edge target node id is required'),
      condition: z.string().optional(),
      loopBack: z.boolean().optional(),
    }),
  }),
  z.object({
    type: z.literal('delete_edge'),
    id: z.string().min(1, 'Edge id is required'),
  }),
]);

const inputSchema = z.object({
  workflowId: z.string().min(1, 'workflowId is required'),
  operations: z.array(operationSchema).min(1, 'At least one operation is required'),
  name: z.string().optional(),
  description: z.string().optional(),
});

type UpdateAssistbuildWorkflowInput = z.infer<typeof inputSchema>;

type Operation = z.infer<typeof operationSchema>;

type UpdateAssistbuildWorkflowOutput = {
  success: boolean;
  workflow?: any;
  error?: string;
  details?: any;
  appliedOperations?: Operation[];
};

export class UpdateAssistbuildWorkflowTool extends ToolBase<UpdateAssistbuildWorkflowInput, UpdateAssistbuildWorkflowOutput> {
  manifest: ToolManifest = {
    name: 'update_assistbuild_workflow',
    category: 'configuration',
    description: 'Applies graph operations (add/update/delete nodes and edges) to an AssistBuild workflow in sandbox environment only',
    parameters: [
      {
        name: 'workflowId',
        type: 'string',
        description: 'ID of the AssistBuild workflow version to update',
        required: true,
      },
      {
        name: 'operations',
        type: 'array',
        description: 'List of graph operations to apply on the workflow definition (add_node, update_node, delete_node, add_edge, delete_edge)',
        required: true,
        schema: inputSchema.shape.operations,
        items: {
          type: 'object',
          description: 'Graph operation',
          properties: {
            type: { type: 'string', description: 'Operation type: add_node | update_node | delete_node | add_edge | delete_edge' },
          },
        },
      },
      {
        name: 'name',
        type: 'string',
        description: 'Optional new workflow name',
        required: false,
      },
      {
        name: 'description',
        type: 'string',
        description: 'Optional new workflow description',
        required: false,
      },
    ],
    scope: 'tenant',
    requiresAuth: true,
    requiresSandbox: true,
    progressSupport: true,
  };

  protected async executeInternal(
    input: UpdateAssistbuildWorkflowInput,
    context: ToolExecutionContext,
    onProgress?: (progress: number, message: string) => void,
  ): Promise<UpdateAssistbuildWorkflowOutput> {
    const parsed = inputSchema.parse(input);

    if (context.environment !== 'sandbox') {
      return {
        success: false,
        error: 'Workflow updates are only allowed in the sandbox environment. Switch to sandbox or create a sandbox draft version before editing.',
      };
    }

    onProgress?.(10, 'Loading current workflow definition...');

    const existing = await WorkflowService.get(parsed.workflowId, context.tenantId);

    if (!existing) {
      return {
        success: false,
        error: `Workflow ${parsed.workflowId} not found for this tenant`,
      };
    }

    if (existing.environment !== 'sandbox' || existing.status === 'published') {
      return {
        success: false,
        error: 'Only sandbox draft workflows can be updated. Create a new sandbox version from the published workflow first.',
      };
    }

    const currentDefinition = (existing.definition || { nodes: [], edges: [] }) as WorkflowDefinition;

    const definition: WorkflowDefinition = {
      nodes: [...(currentDefinition.nodes || [])],
      edges: [...(currentDefinition.edges || [])],
      variables: currentDefinition.variables ? { ...currentDefinition.variables } : undefined,
    };

    for (const op of parsed.operations) {
      switch (op.type) {
        case 'add_node': {
          const node = op.node;

          if (!isValidNodeType(node.type)) {
            return {
              success: false,
              error: `Unsupported node type: ${node.type}. Allowed types: ${allowedNodeTypes.join(', ')}`,
            };
          }

          if (definition.nodes.some((n) => n.id === node.id)) {
            return {
              success: false,
              error: `Node with id ${node.id} already exists`,
            };
          }

          const newNode: WorkflowNode = {
            id: node.id,
            type: node.type as NodeType,
            name: node.name,
            position: { x: node.position.x, y: node.position.y },
            config: node.config || {},
          };

          definition.nodes.push(newNode);
          break;
        }
        case 'update_node': {
          const index = definition.nodes.findIndex((n) => n.id === op.id);
          if (index === -1) {
            return {
              success: false,
              error: `Cannot update node ${op.id}: node not found`,
            };
          }

          const existingNode = definition.nodes[index];

          const updatedNode: WorkflowNode = {
            ...existingNode,
            name: op.name ?? existingNode.name,
            position: op.position ? { x: op.position.x, y: op.position.y } : existingNode.position,
            config: op.config ? { ...(existingNode.config || {}), ...op.config } : existingNode.config,
          };

          definition.nodes[index] = updatedNode;
          break;
        }
        case 'delete_node': {
          const exists = definition.nodes.some((n) => n.id === op.id);
          if (!exists) {
            return {
              success: false,
              error: `Cannot delete node ${op.id}: node not found`,
            };
          }

          definition.nodes = definition.nodes.filter((n) => n.id !== op.id);
          definition.edges = definition.edges.filter((e) => e.source !== op.id && e.target !== op.id);
          break;
        }
        case 'add_edge': {
          const edge = op.edge;

          if (definition.edges.some((e) => e.id === edge.id)) {
            return {
              success: false,
              error: `Edge with id ${edge.id} already exists`,
            };
          }

          const hasSource = definition.nodes.some((n) => n.id === edge.source);
          const hasTarget = definition.nodes.some((n) => n.id === edge.target);

          if (!hasSource || !hasTarget) {
            return {
              success: false,
              error: `Cannot create edge ${edge.id}: both source (${edge.source}) and target (${edge.target}) nodes must exist`,
            };
          }

          const newEdge: WorkflowEdge = {
            id: edge.id,
            source: edge.source,
            target: edge.target,
            condition: edge.condition,
            loopBack: edge.loopBack,
          };

          definition.edges.push(newEdge);
          break;
        }
        case 'delete_edge': {
          const exists = definition.edges.some((e) => e.id === op.id);
          if (!exists) {
            return {
              success: false,
              error: `Cannot delete edge ${op.id}: edge not found`,
            };
          }

          definition.edges = definition.edges.filter((e) => e.id !== op.id);
          break;
        }
        default: {
          const exhaustiveCheck: never = op;
          throw new Error(`Unsupported operation type: ${(exhaustiveCheck as any).type}`);
        }
      }
    }

    onProgress?.(60, 'Validating updated workflow definition...');

    const validation = ValidationService.validateWorkflow(definition, false);

    if (!validation.valid) {
      return {
        success: false,
        error: 'Updated workflow definition is invalid',
        details: {
          errors: validation.errors,
          warnings: validation.warnings,
        },
      };
    }

    onProgress?.(85, 'Persisting workflow changes to AssistBuild storage...');

    const updatePayload: Partial<{ name: string; description?: string | null; definition: WorkflowDefinition }> = {
      definition,
    };

    if (parsed.name !== undefined) {
      updatePayload.name = parsed.name;
    }

    if (parsed.description !== undefined) {
      updatePayload.description = parsed.description;
    }

    const updated = await WorkflowService.update(parsed.workflowId, context.tenantId, updatePayload as any);

    onProgress?.(100, 'Workflow updated successfully');

    return {
      success: true,
      workflow: updated,
      appliedOperations: parsed.operations,
    };
  }
}
