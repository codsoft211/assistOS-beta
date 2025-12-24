import { z } from 'zod';
import { ToolBase, type ToolManifest, type ToolExecutionContext } from '../../kernel';
import { WorkflowService, type WorkflowDefinition, type WorkflowStatus } from '../../../../../apps/api/services/assistbuild/index.js';

const inputSchema = z.object({
  workflowId: z.string().min(1, 'workflowId is required'),
});

type GetAssistbuildWorkflowInput = z.infer<typeof inputSchema>;

type SerializedNode = {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: {
    label: string;
    config: Record<string, any>;
  };
};

type SerializedEdge = {
  id: string;
  source: string;
  target: string;
};

type SerializedWorkflow = {
  id: string;
  name: string;
  description?: string | null;
  environment: 'sandbox' | 'production';
  status: WorkflowStatus;
  definition: {
    nodes: SerializedNode[];
    edges: SerializedEdge[];
  };
};

type GetAssistbuildWorkflowOutput = {
  success: boolean;
  workflow?: SerializedWorkflow;
  raw?: any;
  error?: string;
};

export class GetAssistbuildWorkflowTool extends ToolBase<GetAssistbuildWorkflowInput, GetAssistbuildWorkflowOutput> {
  manifest: ToolManifest = {
    name: 'get_assistbuild_workflow',
    category: 'configuration',
    description: 'Loads a single AssistBuild visual workflow by ID and returns its nodes and edges for graph operations',
    parameters: [
      {
        name: 'workflowId',
        type: 'string',
        description: 'ID of the AssistBuild workflow version to load',
        required: true,
      },
    ],
    scope: 'tenant',
    requiresAuth: true,
    progressSupport: false,
  };

  protected async executeInternal(
    input: GetAssistbuildWorkflowInput,
    context: ToolExecutionContext,
  ): Promise<GetAssistbuildWorkflowOutput> {
    const parsed = inputSchema.parse(input);

    const workflow = await WorkflowService.get(parsed.workflowId, context.tenantId);

    if (!workflow) {
      return {
        success: false,
        error: `Workflow ${parsed.workflowId} not found for this tenant`,
      };
    }

    const definition = (workflow.definition || { nodes: [], edges: [] }) as WorkflowDefinition;

    const serialized: SerializedWorkflow = {
      id: String(workflow.id),
      name: workflow.name || 'Untitled Workflow',
      description: workflow.description,
      environment: workflow.environment,
      status: workflow.status as AssistBuildWorkflowStatus,
      definition: {
        nodes: (definition.nodes || []).map((node: any) => ({
          id: String(node.id),
          type: String(node.type),
          position: {
            x: Number(node.position?.x || 0),
            y: Number(node.position?.y || 0),
          },
          data: {
            label: String(node.name || 'Node'),
            config: (node.config || {}) as Record<string, any>,
          },
        })),
        edges: (definition.edges || []).map((edge: any) => ({
          id: String(edge.id),
          source: String(edge.source),
          target: String(edge.target),
        })),
      },
    };

    return {
      success: true,
      workflow: serialized,
      raw: workflow,
    };
  }
}
