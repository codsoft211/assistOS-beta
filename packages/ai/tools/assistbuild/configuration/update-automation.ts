import { ToolBase, type ToolManifest, type ToolExecutionContext } from '../../kernel';
import { db } from '../../../../../apps/api/db';
import { tenantAutomations } from '../../../../../shared/schema';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { insertIntoTenantTable } from '../../../../../apps/api/utils/tenant-db-helper';

const inputSchema = z.object({
  automationId: z.string().min(1, 'Automation ID is required'),
  
  name: z.string().optional(),
  description: z.string().optional(),
  
  triggerType: z.enum(['schedule', 'event', 'webhook', 'manual']).optional(),
  triggerConfig: z.record(z.any()).optional(),
  
  actions: z.array(z.object({
    type: z.string(),
    config: z.record(z.any()),
    order: z.number().int().min(0),
  })).optional(),
  
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
});

type UpdateAutomationInput = z.infer<typeof inputSchema>;

export class UpdateAutomationTool extends ToolBase<UpdateAutomationInput, any> {
  manifest: ToolManifest = {
    name: 'update_automation',
    category: 'configuration',
    description: 'Updates an existing automation (trigger, actions, status, etc)',
    parameters: [
      { name: 'automationId', type: 'string', description: 'Automation ID to update', required: true },
      { name: 'name', type: 'string', description: 'New name', required: false },
      { name: 'description', type: 'string', description: 'New description', required: false },
      { name: 'triggerType', type: 'string', description: 'New trigger type', required: false },
      { name: 'triggerConfig', type: 'object', description: 'New trigger configuration', required: false },
      { 
        name: 'actions', 
        type: 'array', 
        description: 'New list of actions', 
        required: false,
        items: {
          type: 'object',
          properties: {
            type: { type: 'string', description: 'Action type' },
            config: { type: 'object', description: 'Action configuration' },
            order: { type: 'number', description: 'Execution order' }
          },
          required: ['type', 'config', 'order']
        }
      },
      { name: 'category', type: 'string', description: 'New category', required: false },
      { name: 'tags', type: 'array', description: 'New tags', required: false, items: { type: 'string' } },
      { name: 'isActive', type: 'boolean', description: 'Activate/deactivate automation', required: false },
    ],
    scope: 'tenant', // 🔒 SECURITY: Tenant-wide automation updates - NOT for AssistSettings
    requiresAuth: true,
    progressSupport: true
  };

  protected async executeInternal(
    input: UpdateAutomationInput,
    context: ToolExecutionContext,
    onProgress?: (progress: number, message: string) => void
  ): Promise<any> {
    try {
      const validated = inputSchema.parse(input);
      
      onProgress?.(20, 'Checking existing automation...');
      
      // Check if automation exists and belongs to tenant
      const [existing] = await db
        .select()
        .from(tenantAutomations)
        .where(
          and(
            eq(tenantAutomations.id, validated.automationId),
            eq(tenantAutomations.tenantId, context.tenantId)
          )
        );
      
      if (!existing) {
        return {
          success: false,
          error: `Automation ${validated.automationId} not found in this tenant`
        };
      }
      
      onProgress?.(40, 'Validating updates...');
      
      // Validate trigger config if triggerType is being updated
      const newTriggerType = validated.triggerType ?? existing.triggerType;
      const newTriggerConfig = (validated.triggerConfig ?? existing.triggerConfig) as Record<string, any>;
      
      if (newTriggerType === 'schedule') {
        if (!newTriggerConfig?.cronSchedule) {
          return {
            success: false,
            error: 'triggerConfig.cronSchedule is required for trigger type "schedule"',
            suggestion: 'Provide triggerConfig with cronSchedule when changing to schedule trigger'
          };
        }
      } else if (newTriggerType === 'event') {
        if (!newTriggerConfig?.eventName) {
          return {
            success: false,
            error: 'triggerConfig.eventName is required for trigger type "event"',
            suggestion: 'Provide triggerConfig with eventName when changing to event trigger'
          };
        }
      }
      
      // Validate actions array is not empty if provided
      if (validated.actions !== undefined) {
        if (validated.actions.length === 0) {
          return {
            success: false,
            error: 'At least one action is required',
            suggestion: 'Provide actions array with at least one element'
          };
        }
        
        // Validate each action has required fields
        for (const action of validated.actions) {
          if (!action.type || !action.config) {
            return {
              success: false,
              error: 'All actions need type and config',
              suggestion: 'Example: {type: "send_email", config: {to: "{{lead.email}}"}, order: 0}'
            };
          }
        }
      }
      
      // Build update object with only provided fields
      const updates: any = {
        updatedAt: new Date()
      };
      
      if (validated.name !== undefined) updates.name = validated.name;
      if (validated.description !== undefined) updates.description = validated.description;
      if (validated.triggerType !== undefined) updates.triggerType = validated.triggerType;
      if (validated.triggerConfig !== undefined) updates.triggerConfig = validated.triggerConfig;
      if (validated.actions !== undefined) updates.actions = validated.actions;
      if (validated.category !== undefined) updates.category = validated.category;
      if (validated.tags !== undefined) updates.tags = validated.tags;
      if (validated.isActive !== undefined) updates.isActive = validated.isActive;
      
      onProgress?.(60, 'Updating automation...');
      
      const [updated] = await db
        .update(tenantAutomations)
        .set(updates)
        .where(eq(tenantAutomations.id, validated.automationId))
        .returning();
      
      onProgress?.(80, 'Recording audit log...');
      
      // Create audit log entry (tenant schema)
      await insertIntoTenantTable(
        context.tenantId,
        'audit_log',
        {
          tenant_id: context.tenantId,
          actor_user_id: context.userId,
          action: 'automation_updated',
          metadata: JSON.stringify({
            automationId: updated.id,
            automationName: updated.name,
            changes: Object.keys(updates).filter(k => k !== 'updatedAt'),
            previousState: {
              name: existing.name,
              isActive: existing.isActive
            }
          })
        }
      );
      
      onProgress?.(100, 'Automation updated successfully!');
      
      return {
        success: true,
        automation: updated,
        message: `Automation "${updated.name}" updated successfully`,
        changes: Object.keys(updates).filter(k => k !== 'updatedAt')
      };
      
    } catch (error) {
      console.error('[UpdateAutomationTool] Error:', error);
      
      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: 'Invalid parameters',
          details: error.errors
        };
      }
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update automation'
      };
    }
  }
}
