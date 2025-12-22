import { ToolBase, type ToolManifest, type ToolExecutionContext } from '../../kernel';
import { db } from '../../../../../apps/api/db';
import { apiIntegrations, documentIntegrations, tenantStorageProviders } from '../../../../../shared/schema';
import { eq, sql } from 'drizzle-orm';
import { selectOneFromTenantTable, selectFromTenantTable } from '../../../../../apps/api/utils/tenant-db-helper';

// Interface for tenant_modules table rows
interface TenantModuleRow {
  id: string;
  tenant_id: string;
  module_id: string;
  is_active: boolean;
  installed_at: Date;
  installed_by: string | null;
  config: Record<string, any> | null;
  environment: string;
  updated_at: Date;
}

export class ValidateTenantConfigurationTool extends ToolBase<{}, any> {
  manifest: ToolManifest = {
    name: 'validate_tenant_configuration',
    category: 'configuration',
    description: 'Validates the complete tenant configuration (modules, integrations, company info)',
    parameters: [],
    scope: 'tenant', // 🔒 SECURITY: Tenant configuration validation - NOT for AssistSettings
    requiresAuth: true,
    progressSupport: true
  };

  protected async executeInternal(
    input: {},
    context: ToolExecutionContext,
    onProgress?: (progress: number, message: string) => void
  ): Promise<any> {
    try {
      const issues: string[] = [];
      const warnings: string[] = [];
      const info: Record<string, any> = {};

      onProgress?.(10, 'Validating company information...');
      
      // Read company info from tenant-specific schema (not public schema)
      const company = await selectOneFromTenantTable(
        context.tenantId,
        'company_info',
        sql`tenant_id = ${context.tenantId}`
      );

      if (!company) {
        issues.push('Company info not configured');
      } else {
        const missingFields: string[] = [];
        if (!company.name) missingFields.push('name');
        if (!company.nif) missingFields.push('nif');
        if (!company.email) missingFields.push('email');
        
        if (missingFields.length > 0) {
          warnings.push(`Company info incomplete: missing fields ${missingFields.join(', ')}`);
        }
        info.companyConfigured = true;
        info.companyFields = {
          name: !!company.name,
          nif: !!company.nif,
          email: !!company.email,
          address: !!company.address
        };
      }

      onProgress?.(30, 'Checking installed modules...');
      
      // Query from tenant schema
      const modules = await selectFromTenantTable<TenantModuleRow>(
        context.tenantId,
        'tenant_modules'
      );

      const activeModules = modules.filter(m => m.is_active);
      
      if (activeModules.length === 0) {
        warnings.push('No active modules - consider activating essential modules');
      }

      info.modules = {
        total: modules.length,
        active: activeModules.length,
        inactive: modules.length - activeModules.length,
        list: activeModules.map(m => m.module_id)
      };

      onProgress?.(50, 'Checking integrations...');
      
      const [apiIntegrationsList, documentIntegrationsList, storageProvidersList] = await Promise.all([
        db.select().from(apiIntegrations).where(eq(apiIntegrations.tenantId, context.tenantId)),
        db.select().from(documentIntegrations).where(eq(documentIntegrations.tenantId, context.tenantId)),
        db.select().from(tenantStorageProviders).where(eq(tenantStorageProviders.tenantId, context.tenantId))
      ]);

      const totalIntegrations = apiIntegrationsList.length + documentIntegrationsList.length + storageProvidersList.length;
      const activeIntegrations = [
        ...apiIntegrationsList.filter(i => i.isActive),
        ...documentIntegrationsList.filter(i => i.isActive),
        ...storageProvidersList.filter(i => i.isActive)
      ].length;

      if (totalIntegrations === 0) {
        info.integrations = {
          configured: false,
          message: 'No integrations configured (optional)'
        };
      } else {
        info.integrations = {
          total: totalIntegrations,
          active: activeIntegrations,
          byType: {
            api: apiIntegrationsList.length,
            document: documentIntegrationsList.length,
            storage: storageProvidersList.length
          }
        };
      }

      onProgress?.(80, 'Validating complete configuration...');
      
      if (activeModules.length > 0 && !company) {
        issues.push('Active modules but company info not configured - may cause problems');
      }

      const configurationScore = this.calculateScore({
        hasCompanyInfo: !!company,
        companyComplete: company?.name && company?.nif && company?.email,
        hasModules: activeModules.length > 0,
        hasIntegrations: activeIntegrations > 0
      });

      onProgress?.(100, 'Validation complete!');

      const isValid = issues.length === 0;

      return {
        success: true,
        isValid,
        score: configurationScore,
        issues,
        warnings,
        info,
        summary: this.generateSummary(isValid, configurationScore, issues, warnings),
        recommendations: this.generateRecommendations(info, activeModules.length, activeIntegrations)
      };

    } catch (error) {
      console.error('[ValidateTenantConfigurationTool] Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to validate tenant configuration'
      };
    }
  }

  private calculateScore(checks: Record<string, any>): number {
    let score = 0;
    if (checks.hasCompanyInfo) score += 25;
    if (checks.companyComplete) score += 25;
    if (checks.hasModules) score += 30;
    if (checks.hasIntegrations) score += 20;
    return score;
  }

  private generateSummary(isValid: boolean, score: number, issues: string[], warnings: string[]): string {
    if (!isValid) {
      return `Invalid configuration: ${issues.length} critical problem(s) found`;
    }
    
    if (score >= 80) {
      return `Excellent configuration (${score}/100)`;
    } else if (score >= 50) {
      return `Basic functional configuration (${score}/100) - ${warnings.length} warning(s)`;
    } else {
      return `Incomplete configuration (${score}/100) - consider completing setup`;
    }
  }

  private generateRecommendations(info: Record<string, any>, moduleCount: number, integrationCount: number): string[] {
    const recs: string[] = [];
    
    if (!info.companyConfigured) {
      recs.push('Configure company info with configure_company_info');
    }
    
    if (moduleCount === 0) {
      recs.push('Activate essential modules with activate_module (e.g., commercial, financial)');
    }
    
    if (moduleCount < 3) {
      recs.push('Consider activating more modules for complete functionality');
    }
    
    if (integrationCount === 0) {
      recs.push('Configure integrations (Slack, Gmail) for complete automation');
    }

    return recs;
  }
}
