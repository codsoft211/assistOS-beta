import { ToolBase, type ToolManifest, type ToolExecutionContext } from '../../kernel';
import { db } from '../../../../../apps/api/db';
import { tenantWorkflows, auditLog } from '../../../../../shared/schema';
import { z } from 'zod';
import { insertIntoTenantTable } from '../../../../../apps/api/utils/tenant-db-helper';

const inputSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  
  steps: z.array(z.object({
    id: z.string().min(1, 'Step ID is required'),
    type: z.string().min(1, 'Step type is required'),
    name: z.string().min(1, 'Step name is required'),
    config: z.record(z.any()),
    nextSteps: z.array(z.string()).default([]),
    order: z.number().int().min(0),
  })).min(1, 'At least one step is required'),
  
  triggerType: z.enum(['manual', 'event', 'schedule'], {
    errorMap: () => ({ message: 'Invalid trigger type. Use: manual, event, or schedule' })
  }),
  triggerConfig: z.record(z.any()).optional(),
  
  category: z.string().optional(),
  estimatedDurationMinutes: z.number().int().positive().optional(),
  tags: z.array(z.string()).optional(),
  isActive: z.boolean().optional().default(true),
});

type CreateWorkflowInput = z.infer<typeof inputSchema>;

export class CreateWorkflowTool extends ToolBase<CreateWorkflowInput, any> {
  manifest: ToolManifest = {
    name: 'create_workflow',
    category: 'configuration',
    description: 'Creates a multi-step workflow (e.g.: approval workflow, onboarding process, procurement flow)',
    parameters: [
      { name: 'name', type: 'string', description: 'Workflow name', required: true },
      { name: 'description', type: 'string', description: 'Workflow description', required: false },
      { 
        name: 'steps', 
        type: 'array', 
        description: 'Lista de steps [{id, type, name, config, nextSteps, order}]', 
        required: true,
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'ID único do step' },
            type: { type: 'string', description: 'Tipo: approval, task, notification, condition, ai_decision, automation' },
            name: { type: 'string', description: 'Nome do step' },
            config: { type: 'object', description: 'Step-specific configuration' },
            nextSteps: { type: 'string', description: 'IDs dos próximos steps', items: { type: 'string' } },
            order: { type: 'number', description: 'Execution order' }
          },
          required: ['id', 'type', 'name', 'config', 'order']
        }
      },
      { name: 'triggerType', type: 'string', description: 'Tipo de trigger: manual, event, schedule', required: true },
      { name: 'triggerConfig', type: 'object', description: 'Configuração do trigger', required: false },
      { name: 'category', type: 'string', description: 'Categoria (approval, onboarding, procurement, custom)', required: false },
      { name: 'estimatedDurationMinutes', type: 'number', description: 'Duração estimada em minutos', required: false },
      { name: 'tags', type: 'array', description: 'Tags for organization', required: false, items: { type: 'string' } },
      { name: 'isActive', type: 'boolean', description: 'Activate workflow immediately (default: true)', required: false },
    ],
    scope: 'tenant', // 🔒 SECURITY: Tenant-wide workflow creation - NOT for AssistSettings
    requiresAuth: true,
    progressSupport: true
  };

  protected async executeInternal(
    input: CreateWorkflowInput,
    context: ToolExecutionContext,
    onProgress?: (progress: number, message: string) => void
  ): Promise<any> {
    try {
      const validated = inputSchema.parse(input);
      
      onProgress?.(20, 'Validating workflow configuration...');
      
      // Validate step IDs are unique
      const stepIds = new Set<string>();
      for (const step of validated.steps) {
        if (stepIds.has(step.id)) {
          return {
            success: false,
            error: `Duplicate step ID: ${step.id}`,
            suggestion: 'All steps must have unique IDs'
          };
        }
        stepIds.add(step.id);
      }
      
      // Validate nextSteps references exist
      for (const step of validated.steps) {
        for (const nextStepId of step.nextSteps) {
          if (!stepIds.has(nextStepId)) {
            return {
              success: false,
              error: `Step ${step.id} references non-existent nextStep: ${nextStepId}`,
              suggestion: 'All nextSteps must reference existing step IDs'
            };
          }
        }
      }
      
      // Validate step types
      const validStepTypes = ['approval', 'task', 'notification', 'condition', 'ai_decision', 'automation'];
      for (const step of validated.steps) {
        if (!validStepTypes.includes(step.type)) {
          return {
            success: false,
            error: `Invalid step type: ${step.type}`,
            suggestion: `Use one of the valid types: ${validStepTypes.join(', ')}`
          };
        }
      }
      
      onProgress?.(40, 'Creating workflow in tenant schema...');
      
      // Create workflow in tenant schema
      const workflow = await insertIntoTenantTable(
        context.tenantId,
        'tenant_workflows',
        {
          tenant_id: context.tenantId,
          name: validated.name,
          description: validated.description,
          steps: validated.steps,
          trigger_type: validated.triggerType,
          trigger_config: validated.triggerConfig,
          category: validated.category,
          estimated_duration_minutes: validated.estimatedDurationMinutes,
          tags: validated.tags,
          is_active: validated.isActive ?? true,
          created_by: context.userId,
          environment: context.environment || 'production',
          created_at: new Date(),
          updated_at: new Date(),
        }
      );
      
      onProgress?.(80, 'Recording audit log...');
      
      // Create audit log entry in tenant schema
      await insertIntoTenantTable(
        context.tenantId,
        'audit_log',
        {
          tenant_id: context.tenantId,
          actor_user_id: context.userId,
          action: 'workflow_created',
          metadata: {
            workflowId: workflow.id,
            workflowName: workflow.name,
            triggerType: workflow.triggerType,
            stepsCount: validated.steps.length,
            isActive: workflow.isActive
          },
          environment: context.environment || 'production',
          created_at: new Date(),
        }
      );
      
      onProgress?.(100, 'Workflow created successfully!');
      
      return {
        success: true,
        workflow,
        message: `Workflow "${workflow.name}" created${workflow.isActive ? ' and active' : ' (inactive)'}`,
        info: {
          id: workflow.id,
          triggerType: workflow.triggerType,
          stepsCount: validated.steps.length,
          status: workflow.isActive ? 'active' : 'inactive',
          estimatedDuration: workflow.estimatedDurationMinutes ? `${workflow.estimatedDurationMinutes} minutes` : 'not specified'
        }
      };
      
    } catch (error) {
      console.error('[CreateWorkflowTool] Error:', error);
      
      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: 'Invalid parameters',
          details: error.errors
        };
      }
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create workflow'
      };
    }
  }
}
