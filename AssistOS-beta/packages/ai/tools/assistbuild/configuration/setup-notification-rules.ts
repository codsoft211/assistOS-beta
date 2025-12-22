import { ToolBase, type ToolManifest, type ToolExecutionContext } from '../../kernel';
import { db } from '../../../../../apps/api/db';
import { notificationRules } from '../../../../../shared/schema';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { insertIntoTenantTable } from '../../../../../apps/api/utils/tenant-db-helper';

const inputSchema = z.object({
  ruleId: z.string().optional(), // For updates
  name: z.string().min(1, 'Rule name is required'),
  description: z.string().optional(),
  
  triggerEvents: z.array(z.string()).min(1, 'At least one trigger event is required'),
  
  channels: z.array(z.object({
    type: z.enum(['email', 'slack', 'in_app', 'webhook'], {
      errorMap: () => ({ message: 'Invalid channel type. Use: email, slack, in_app, webhook' })
    }),
    config: z.record(z.any()).describe('Channel-specific configuration'),
    enabled: z.boolean(),
  })).min(1, 'At least one channel is required'),
  
  recipients: z.object({
    userIds: z.array(z.string()).optional(),
    roles: z.array(z.string()).optional(),
    departmentIds: z.array(z.string()).optional(),
    slackChannels: z.array(z.string()).optional(),
    emailAddresses: z.array(z.string()).optional(),
  }),
  
  messageTemplate: z.object({
    title: z.string(),
    body: z.string(),
    variables: z.record(z.string()).optional(),
  }).optional(),
  
  conditions: z.array(z.object({
    field: z.string(),
    operator: z.string(),
    value: z.any(),
  })).optional(),
  
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  isActive: z.boolean().optional().default(true),
});

type SetupNotificationRulesInput = z.infer<typeof inputSchema>;

export class SetupNotificationRulesTool extends ToolBase<SetupNotificationRulesInput, any> {
  manifest: ToolManifest = {
    name: 'setup_notification_rules',
    category: 'configuration',
    description: 'Configures multi-channel notification rules (email, Slack, in-app, webhook) based on system events',
    parameters: [
      { name: 'ruleId', type: 'string', description: 'Rule ID to update (optional, omit to create new)', required: false },
      { name: 'name', type: 'string', description: 'Notification rule name', required: true },
      { name: 'description', type: 'string', description: 'Description of what the rule does', required: false },
      { name: 'triggerEvents', type: 'array', description: 'Events that trigger notification (e.g.: ["order.created", "approval.needed"])', required: true, items: { type: 'string' } },
      { 
        name: 'channels', 
        type: 'array', 
        description: 'Notification channels [{type, config, enabled}]', 
        required: true,
        items: {
          type: 'object',
          properties: {
            type: { type: 'string', description: 'Type: email, slack, in_app, webhook' },
            config: { type: 'object', description: 'Channel configuration' },
            enabled: { type: 'boolean', description: 'Channel active' }
          },
          required: ['type', 'config', 'enabled']
        }
      },
      { name: 'recipients', type: 'object', description: 'Recipients: {userIds, roles, departmentIds, slackChannels, emailAddresses}', required: true },
      { name: 'messageTemplate', type: 'object', description: 'Template da mensagem {title, body, variables}', required: false },
      { 
        name: 'conditions', 
        type: 'array', 
        description: 'Condições opcionais para filtrar [{field, operator, value}]', 
        required: false,
        items: {
          type: 'object',
          properties: {
            field: { type: 'string', description: 'Campo a verificar' },
            operator: { type: 'string', description: 'Operador de comparação' },
            value: { type: 'string', description: 'Valor a comparar' }
          },
          required: ['field', 'operator', 'value']
        }
      },
      { name: 'priority', type: 'string', description: 'Prioridade: low, normal, high, urgent', required: false },
      { name: 'category', type: 'string', description: 'Notification category', required: false },
      { name: 'tags', type: 'array', description: 'Tags for organization', required: false, items: { type: 'string' } },
      { name: 'isActive', type: 'boolean', description: 'Activate rule immediately (default: true)', required: false },
    ],
    scope: 'tenant', // 🔒 SECURITY: Tenant-wide notification rules - NOT for AssistSettings
    requiresAuth: true,
    progressSupport: true
  };

  protected async executeInternal(
    input: SetupNotificationRulesInput,
    context: ToolExecutionContext,
    onProgress?: (progress: number, message: string) => void
  ): Promise<any> {
    try {
      const validated = inputSchema.parse(input);
      
      onProgress?.(20, 'Validating notification configuration...');
      
      // Validate recipients - at least one type must be provided
      const hasRecipients = 
        (validated.recipients.userIds && validated.recipients.userIds.length > 0) ||
        (validated.recipients.roles && validated.recipients.roles.length > 0) ||
        (validated.recipients.departmentIds && validated.recipients.departmentIds.length > 0) ||
        (validated.recipients.slackChannels && validated.recipients.slackChannels.length > 0) ||
        (validated.recipients.emailAddresses && validated.recipients.emailAddresses.length > 0);
      
      if (!hasRecipients) {
        return {
          success: false,
          error: 'At least one recipient is required',
          suggestion: 'Configure userIds, roles, departmentIds, slackChannels or emailAddresses'
        };
      }
      
      // Validate channel configs
      for (const channel of validated.channels) {
        if (!channel.config || Object.keys(channel.config).length === 0) {
          return {
            success: false,
            error: `Channel ${channel.type} needs configuration`,
            suggestion: 'Example: {type: "email", config: {template: "order_created"}, enabled: true}'
          };
        }
      }
      
      if (validated.ruleId) {
        // Update existing rule
        onProgress?.(40, 'Checking existing rule...');
        
        const existing = await db.query.notificationRules.findFirst({
          where: and(
            eq(notificationRules.id, validated.ruleId),
            eq(notificationRules.tenantId, context.tenantId)
          )
        });
        
        if (!existing) {
          return {
            success: false,
            error: `Rule ${validated.ruleId} not found in this tenant`
          };
        }
        
        onProgress?.(60, 'Updating rule...');
        
        const updates: any = {
          name: validated.name,
          description: validated.description,
          triggerEvents: validated.triggerEvents,
          channels: validated.channels,
          recipients: validated.recipients,
          messageTemplate: validated.messageTemplate,
          conditions: validated.conditions,
          priority: validated.priority || existing.priority,
          category: validated.category,
          tags: validated.tags,
          isActive: validated.isActive !== undefined ? validated.isActive : existing.isActive,
          updatedAt: new Date()
        };
        
        const [updated] = await db
          .update(notificationRules)
          .set(updates)
          .where(and(
            eq(notificationRules.id, validated.ruleId),
            eq(notificationRules.tenantId, context.tenantId)
          ))
          .returning();
        
        onProgress?.(80, 'Registrando auditoria...');
        
        await insertIntoTenantTable(
          context.tenantId,
          'audit_log',
          {
            tenant_id: context.tenantId,
            actor_user_id: context.userId,
            action: 'notification_rule_updated',
            metadata: JSON.stringify({ 
              resourceType: 'notification_rule',
              resourceId: validated.ruleId,
              updates, 
              ruleName: validated.name 
            })
          }
        );
        
        onProgress?.(100, 'Rule updated successfully!');
        
        return {
          success: true,
          ruleId: updated.id,
          rule: updated,
          message: `Notification rule "${validated.name}" updated successfully`
        };
        
      } else {
        // Create new rule
        onProgress?.(60, 'Creating new rule...');
        
        const [created] = await db
          .insert(notificationRules)
          .values({
            tenantId: context.tenantId,
            name: validated.name,
            description: validated.description,
            triggerEvents: validated.triggerEvents,
            channels: validated.channels,
            recipients: validated.recipients,
            messageTemplate: validated.messageTemplate,
            conditions: validated.conditions,
            priority: validated.priority || 'normal',
            category: validated.category,
            tags: validated.tags,
            isActive: validated.isActive,
            createdBy: context.userId
          })
          .returning();
        
        onProgress?.(80, 'Registrando auditoria...');
        
        await insertIntoTenantTable(
          context.tenantId,
          'audit_log',
          {
            tenant_id: context.tenantId,
            actor_user_id: context.userId,
            action: 'notification_rule_created',
            metadata: JSON.stringify({ 
              resourceType: 'notification_rule',
              resourceId: created.id,
              ruleName: validated.name,
              triggerEvents: validated.triggerEvents,
              channels: validated.channels.map(c => c.type)
            })
          }
        );
        
        onProgress?.(100, 'Rule created successfully!');
        
        return {
          success: true,
          ruleId: created.id,
          rule: created,
          message: `Notification rule "${validated.name}" created successfully`
        };
      }
      
    } catch (error: any) {
      console.error('[setup_notification_rules] Error:', error);
      
      if (error.name === 'ZodError') {
        return {
          success: false,
          error: 'Validation error',
          details: error.errors,
          suggestion: 'Check the provided parameters'
        };
      }
      
      return {
        success: false,
        error: error.message || 'Error configuring notification rule',
        suggestion: 'Check the provided data and try again'
      };
    }
  }
}
