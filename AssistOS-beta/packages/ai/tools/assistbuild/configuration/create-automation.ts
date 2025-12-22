import { ToolBase, type ToolManifest, type ToolExecutionContext } from '../../kernel';
import { db } from '../../../../../apps/api/db';
import { tenantAutomations, auditLog } from '../../../../../shared/schema';
import { z } from 'zod';
import { insertIntoTenantTable } from '../../../../../apps/api/utils/tenant-db-helper';

const inputSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  
  triggerType: z.enum(['schedule', 'event', 'webhook', 'manual'], {
    errorMap: () => ({ message: 'Invalid trigger type. Use: schedule, event, webhook, or manual' })
  }),
  triggerConfig: z.record(z.any()).describe('Trigger-specific configuration (e.g.: cron schedule, event name)'),
  
  actions: z.array(z.object({
    type: z.string().min(1, 'Action type is required'),
    config: z.record(z.any()),
    order: z.number().int().min(0),
  })).min(1, 'At least one action is required'),
  
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  isActive: z.boolean().optional().default(true),
});

type CreateAutomationInput = z.infer<typeof inputSchema>;

export class CreateAutomationTool extends ToolBase<CreateAutomationInput, any> {
  manifest: ToolManifest = {
    name: 'create_automation',
    category: 'configuration',
    description: 'Creates a configurable trigger->action automation (e.g.: when lead created -> send welcome email)',
    parameters: [
      { name: 'name', type: 'string', description: 'Automation name', required: true },
      { name: 'description', type: 'string', description: 'Description of what the automation does', required: false },
      { name: 'triggerType', type: 'string', description: 'Tipo de trigger: schedule, event, webhook, manual', required: true },
      { name: 'triggerConfig', type: 'object', description: 'Configuração do trigger (ex: {cronSchedule: "0 9 * * *"} para schedule)', required: true },
      { 
        name: 'actions', 
        type: 'array', 
        description: 'List of actions to execute [{type, config, order}]', 
        required: true,
        items: {
          type: 'object',
          properties: {
            type: { type: 'string', description: 'Tipo de ação' },
            config: { type: 'object', description: 'Configuração da ação' },
            order: { type: 'number', description: 'Execution order' }
          },
          required: ['type', 'config', 'order']
        }
      },
      { name: 'category', type: 'string', description: 'Categoria (sales, operations, finance, custom)', required: false },
      { name: 'tags', type: 'array', description: 'Tags for organization', required: false, items: { type: 'string' } },
      { name: 'isActive', type: 'boolean', description: 'Activate automation immediately (default: true)', required: false },
    ],
    scope: 'tenant', // 🔒 SECURITY: Tenant-wide automation creation - NOT for AssistSettings
    requiresAuth: true,
    progressSupport: true
  };

  protected async executeInternal(
    input: CreateAutomationInput,
    context: ToolExecutionContext,
    onProgress?: (progress: number, message: string) => void
  ): Promise<any> {
    try {
      const validated = inputSchema.parse(input);
      
      onProgress?.(20, 'Validating automation configuration...');
      
      // Validate trigger config based on type
      if (validated.triggerType === 'schedule') {
        if (!validated.triggerConfig.cronSchedule) {
          return {
            success: false,
            error: 'triggerConfig.cronSchedule is required for trigger type "schedule"',
            suggestion: 'Example: {cronSchedule: "0 9 * * *"} to run daily at 9am'
          };
        }
      } else if (validated.triggerType === 'event') {
        if (!validated.triggerConfig.eventName) {
          return {
            success: false,
            error: 'triggerConfig.eventName is required for trigger type "event"',
            suggestion: 'Example: {eventName: "lead.created", filters: {...}}'
          };
        }
      }
      
      // Validate actions have required fields
      for (const action of validated.actions) {
        if (!action.type || !action.config) {
          return {
            success: false,
            error: 'All actions need type and config',
            suggestion: 'Example: {type: "send_email", config: {to: "{{lead.email}}", template: "welcome"}, order: 0}'
          };
        }
      }
      
      onProgress?.(40, 'Creating automation in tenant schema...');
      
      // Create automation in tenant schema
      const automation = await insertIntoTenantTable(
        context.tenantId,
        'tenant_automations',
        {
          tenant_id: context.tenantId,
          name: validated.name,
          description: validated.description,
          trigger_type: validated.triggerType,
          trigger_config: validated.triggerConfig,
          actions: validated.actions,
          category: validated.category,
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
          action: 'automation_created',
          metadata: {
            automationId: automation.id,
            automationName: automation.name,
            triggerType: automation.triggerType,
            actionsCount: validated.actions.length,
            isActive: automation.isActive
          },
          environment: context.environment || 'production',
          created_at: new Date(),
        }
      );
      
      onProgress?.(100, 'Automation created successfully!');
      
      return {
        success: true,
        automation,
        message: `Automation "${automation.name}" created${automation.isActive ? ' and active' : ' (inactive)'}`,
        info: {
          id: automation.id,
          triggerType: automation.triggerType,
          actionsCount: validated.actions.length,
          status: automation.isActive ? 'active' : 'inactive'
        }
      };
      
    } catch (error) {
      console.error('[CreateAutomationTool] Error:', error);
      
      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: 'Invalid parameters',
          details: error.errors
        };
      }
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create automation'
      };
    }
  }
}
