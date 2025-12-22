import { ToolBase, type ToolManifest } from '../../kernel';
import { db } from '../../../../../apps/api/db';
import { companyInfo, tenantBlueprints } from '../../../../../shared/schema';
import { eq, sql } from 'drizzle-orm';
import { selectOneFromTenantTable, insertIntoTenantTable } from '../../../../../apps/api/utils/tenant-db-helper';

interface BootstrapInput {
  companyName: string;
  sector?: string;
  businessType?: string;
}

export class BootstrapTenantTool extends ToolBase<BootstrapInput, any> {
  manifest: ToolManifest = {
    name: 'bootstrap_tenant',
    category: 'configuration',
    description: 'Initializes tenant from scratch: creates basic company information, business blueprint',
    parameters: [
      {
        name: 'companyName',
        type: 'string',
        description: 'Company name',
        required: true
      },
      {
        name: 'sector',
        type: 'string',
        description: 'Activity sector',
        required: false
      },
      {
        name: 'businessType',
        type: 'string',
        description: 'Business type (B2B, B2C, services, etc)',
        required: false
      }
    ],
    scope: 'tenant', // 🔒 SECURITY: Tenant initialization - NOT for AssistSettings
    requiresAuth: true,
    progressSupport: true
  };

  protected async executeInternal(
    input: BootstrapInput,
    context: any,
    onProgress?: (progress: number, message: string) => void
  ): Promise<any> {
    const tenantId = context.tenantId;
    
    onProgress?.(20, 'Checking if tenant already exists...');
    console.log('[BootstrapTenantTool] Bootstrap tenant in tenant schema:', tenantId);
    
    // Check if company already exists in tenant schema
    const existingCompany = await selectOneFromTenantTable(
      tenantId,
      'company_info',
      sql`tenant_id = ${tenantId}`
    );

    if (existingCompany) {
      return {
        success: false,
        message: 'Tenant already initialized. Use configure_company_info to update.',
        existing: existingCompany
      };
    }

    onProgress?.(40, 'Creating company information in tenant schema...');
    
    // Create company info in tenant schema
    const newCompany = await insertIntoTenantTable(
      tenantId,
      'company_info',
      {
        tenant_id: tenantId,
        brand_name: input.companyName,
        name: input.companyName,
        sector: input.sector,
        business_type: input.businessType,
        environment: context.environment || 'production',
        created_at: new Date(),
        updated_at: new Date()
      }
    );

    onProgress?.(70, 'Creating business blueprint in tenant schema...');
    
    // Create blueprint in tenant schema
    const blueprint = await insertIntoTenantTable(
      tenantId,
      'tenant_blueprints',
      {
        tenant_id: tenantId,
        business_type: input.businessType,
        sector: input.sector,
        processes: [],
        environment: context.environment || 'production',
        created_at: new Date(),
        updated_at: new Date()
      }
    );

    onProgress?.(100, 'Bootstrap completed!');

    return {
      success: true,
      company: newCompany,
      blueprint: blueprint,
      message: `Tenant initialized for ${input.companyName}`
    };
  }
}
