import { ToolBase, type ToolManifest, type ToolExecutionContext } from '../../kernel';
import { db } from '../../../../../apps/api/db';
import { tenants, tenantBlueprints } from '../../../../../shared/schema';
import { eq, sql } from 'drizzle-orm';
import { selectOneFromTenantTable } from '../../../../../apps/api/utils/tenant-db-helper';

export class GetTenantStateTool extends ToolBase<{}, any> {
  manifest: ToolManifest = {
    name: 'get_tenant_state',
    category: 'discovery',
    description: 'Gets complete tenant state: company information, business blueprint, configurations',
    parameters: [],
    requiresAuth: true,
    progressSupport: false
  };

  protected async executeInternal(
    input: {},
    context: ToolExecutionContext
  ): Promise<any> {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, context.tenantId));
    // Read company info from tenant-specific schema (not public schema)
    const company = await selectOneFromTenantTable(
      context.tenantId,
      'company_info',
      sql`tenant_id = ${context.tenantId}`
    );
    const [blueprint] = await db.select().from(tenantBlueprints).where(eq(tenantBlueprints.tenantId, context.tenantId));

    return {
      tenant: tenant ? {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        industry: tenant.industry,
        status: tenant.status,
        country: tenant.country,
        currency: tenant.currency,
        timezone: tenant.timezone
      } : null,
      company: company || null,
      blueprint: blueprint || null,
      environment: context.environment
    };
  }
}
