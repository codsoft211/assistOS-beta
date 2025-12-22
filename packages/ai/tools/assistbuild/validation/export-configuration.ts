import { ToolBase, type ToolManifest, type ToolExecutionContext } from '../../kernel';
import { db } from '../../../../../apps/api/db';
import { 
  tenants,
  departments,
  apiIntegrations,
  tenantAutomations,
  tenantWorkflows,
  notificationRules
} from '../../../../../shared/schema';
import { eq } from 'drizzle-orm';
import { selectFromTenantTable, insertIntoTenantTable } from '../../../../../apps/api/utils/tenant-db-helper';
import { z } from 'zod';

const inputSchema = z.object({
  includeModules: z.boolean().optional().default(true),
  includeIntegrations: z.boolean().optional().default(true),
  includeAutomations: z.boolean().optional().default(true),
  includeWorkflows: z.boolean().optional().default(true),
  includeNotifications: z.boolean().optional().default(true),
  includeOrganization: z.boolean().optional().default(true),
  maskSensitiveData: z.boolean().optional().default(true),
});

type ExportConfigurationInput = z.infer<typeof inputSchema>;

export class ExportConfigurationTool extends ToolBase<ExportConfigurationInput, any> {
  manifest: ToolManifest = {
    name: 'export_configuration',
    category: 'validation',
    description: 'Exports complete tenant configuration in JSON format to replicate in another tenant or create backup',
    parameters: [
      { name: 'includeModules', type: 'boolean', description: 'Include activated modules and their configurations (default: true)', required: false },
      { name: 'includeIntegrations', type: 'boolean', description: 'Include configured integrations (default: true)', required: false },
      { name: 'includeAutomations', type: 'boolean', description: 'Include created automations (default: true)', required: false },
      { name: 'includeWorkflows', type: 'boolean', description: 'Include configured workflows (default: true)', required: false },
      { name: 'includeNotifications', type: 'boolean', description: 'Include notification rules (default: true)', required: false },
      { name: 'includeOrganization', type: 'boolean', description: 'Include organizational structure (default: true)', required: false },
      { name: 'maskSensitiveData', type: 'boolean', description: 'Mask sensitive data such as passwords and tokens (default: true)', required: false },
    ],
    requiresAuth: true,
    progressSupport: true
  };

  protected async executeInternal(
    input: ExportConfigurationInput,
    context: ToolExecutionContext,
    onProgress?: (progress: number, message: string) => void
  ): Promise<any> {
    try {
      const validated = inputSchema.parse(input);
      
      onProgress?.(5, 'Starting export...');
      
      // Get tenant info
      const tenant = await db.query.tenants.findFirst({
        where: eq(tenants.id, context.tenantId)
      });
      
      if (!tenant) {
        return {
          success: false,
          error: 'Tenant not found'
        };
      }
      
      const exportData: any = {
        version: '1.0.0',
        exportedAt: new Date().toISOString(),
        exportedBy: context.userId,
        tenant: {
          name: tenant.name,
          slug: tenant.slug,
          industry: tenant.industry,
          status: tenant.status,
          country: tenant.country,
          currency: tenant.currency,
          timezone: tenant.timezone
        }
      };
      
      let progress = 10;
      
      // Export organization structure
      if (validated.includeOrganization) {
        onProgress?.(progress, 'Exporting organizational structure...');
        
        const depts = await db.query.departments.findMany({
          where: eq(departments.tenantId, context.tenantId)
        });
        
        exportData.organization = {
          departments: depts.map((d: any) => ({
            name: d.name,
            description: d.description,
            parentId: d.parentId,
            level: d.level,
            path: d.path,
            isActive: d.isActive
          }))
        };
        
        progress += 15;
      }
      
      // Export modules (tenant-scoped table)
      if (validated.includeModules) {
        onProgress?.(progress, 'Exporting modules...');
        
        const modules = await selectFromTenantTable(context.tenantId, 'tenant_modules');
        
        exportData.modules = modules.map((m: any) => ({
          moduleId: m.module_id,
          isActive: m.is_active,
          config: validated.maskSensitiveData 
            ? this.maskSensitiveData(m.config)
            : m.config
        }));
        
        progress += 15;
      }
      
      // Export integrations
      if (validated.includeIntegrations) {
        onProgress?.(progress, 'Exporting integrations...');
        
        const integrations = await db.query.apiIntegrations.findMany({
          where: eq(apiIntegrations.tenantId, context.tenantId)
        });
        
        exportData.integrations = integrations.map((i: any) => ({
          integrationKey: i.integrationKey,
          integrationName: i.integrationName,
          baseUrl: i.baseUrl,
          authType: i.authType,
          authConfig: validated.maskSensitiveData 
            ? this.maskSensitiveData(i.authConfig)
            : i.authConfig,
          endpoints: validated.maskSensitiveData 
            ? this.maskSensitiveData(i.endpoints)
            : i.endpoints,
          isActive: i.isActive,
          environment: i.environment,
          metadata: validated.maskSensitiveData 
            ? this.maskSensitiveData(i.metadata)
            : i.metadata
        }));
        
        progress += 15;
      }
      
      // Export automations
      if (validated.includeAutomations) {
        onProgress?.(progress, 'Exporting automations...');
        
        const automations = await db.query.tenantAutomations.findMany({
          where: eq(tenantAutomations.tenantId, context.tenantId)
        });
        
        exportData.automations = automations.map((a: any) => ({
          name: a.name,
          description: a.description,
          triggerType: a.triggerType,
          triggerConfig: validated.maskSensitiveData 
            ? this.maskSensitiveData(a.triggerConfig)
            : a.triggerConfig,
          conditions: validated.maskSensitiveData 
            ? this.maskSensitiveData(a.conditions)
            : a.conditions,
          actions: validated.maskSensitiveData 
            ? this.maskSensitiveData(a.actions)
            : a.actions,
          category: a.category,
          tags: a.tags,
          isActive: a.isActive
        }));
        
        progress += 15;
      }
      
      // Export workflows
      if (validated.includeWorkflows) {
        onProgress?.(progress, 'Exporting workflows...');
        
        const workflows = await db.query.tenantWorkflows.findMany({
          where: eq(tenantWorkflows.tenantId, context.tenantId)
        });
        
        exportData.workflows = workflows.map((w: any) => ({
          name: w.name,
          description: w.description,
          triggerType: w.triggerType,
          triggerConfig: validated.maskSensitiveData 
            ? this.maskSensitiveData(w.triggerConfig)
            : w.triggerConfig,
          steps: validated.maskSensitiveData 
            ? this.maskSensitiveData(w.steps)
            : w.steps,
          category: w.category,
          tags: w.tags,
          isActive: w.isActive
        }));
        
        progress += 15;
      }
      
      // Export notification rules
      if (validated.includeNotifications) {
        onProgress?.(progress, 'Exporting notification rules...');
        
        const notifications = await db.query.notificationRules.findMany({
          where: eq(notificationRules.tenantId, context.tenantId)
        });
        
        exportData.notificationRules = notifications.map((n: any) => ({
          name: n.name,
          description: n.description,
          triggerEvents: n.triggerEvents,
          channels: validated.maskSensitiveData 
            ? this.maskSensitiveData(n.channels)
            : n.channels,
          recipients: n.recipients,
          messageTemplate: n.messageTemplate,
          conditions: validated.maskSensitiveData 
            ? this.maskSensitiveData(n.conditions)
            : n.conditions,
          priority: n.priority,
          category: n.category,
          tags: n.tags,
          isActive: n.isActive
        }));
        
        progress += 10;
      }
      
      // Calculate statistics
      const stats = {
        departments: exportData.organization?.departments?.length || 0,
        modules: exportData.modules?.length || 0,
        integrations: exportData.integrations?.length || 0,
        automations: exportData.automations?.length || 0,
        workflows: exportData.workflows?.length || 0,
        notificationRules: exportData.notificationRules?.length || 0,
        totalItems: 0
      };
      
      stats.totalItems = Object.values(stats).reduce((sum: number, count: number) => sum + count, 0) - stats.totalItems;
      
      exportData.statistics = stats;
      
      onProgress?.(95, 'Recording audit log...');
      
      await insertIntoTenantTable(
        context.tenantId,
        'audit_log',
        {
          tenant_id: context.tenantId,
          actor_user_id: context.userId,
          action: 'configuration_exported',
          metadata: JSON.stringify({
            resourceType: 'tenant_configuration',
            statistics: stats,
            maskSensitiveData: validated.maskSensitiveData
          })
        }
      );
      
      onProgress?.(100, 'Export completed!');
      
      return {
        success: true,
        export: exportData,
        statistics: stats,
        message: `✓ Configuration exported successfully - ${stats.totalItems} items`
      };
      
    } catch (error: any) {
      console.error('[export_configuration] Error:', error);
      
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
        error: error.message || 'Error exporting configuration',
        suggestion: 'Check the provided data and try again'
      };
    }
  }
  
  private maskSensitiveData(data: any): any {
    if (!data) return data;
    
    // Handle arrays - recursively mask each element
    if (Array.isArray(data)) {
      return data.map(item => this.maskSensitiveData(item));
    }
    
    // Handle objects - recursively mask nested objects
    if (typeof data === 'object') {
      const masked: any = {};
      
      // Sensitive field names to mask (comprehensive list)
      const sensitivePatterns = [
        'token',
        'apikey',
        'api_key', 
        'clientsecret',
        'client_secret',
        'password',
        'privatekey',
        'private_key',
        'accesstoken',
        'access_token',
        'refreshtoken',
        'refresh_token',
        'apisecret',
        'api_secret',
        'secret',
        'authtoken',
        'auth_token',
        'bearertoken',
        'bearer_token',
        'credentials'
      ];
      
      for (const [key, value] of Object.entries(data)) {
        // Check if this field name matches sensitive patterns
        const lowerKey = key.toLowerCase();
        const isSensitive = sensitivePatterns.some(pattern => 
          lowerKey === pattern || 
          lowerKey.includes(pattern)
        );
        
        if (isSensitive && typeof value === 'string' && value.length > 0) {
          // Mask the sensitive string value
          masked[key] = '***MASKED***';
        } else {
          // Recursively process nested objects and arrays
          masked[key] = this.maskSensitiveData(value);
        }
      }
      
      return masked;
    }
    
    // Return primitive values as-is
    return data;
  }
}
