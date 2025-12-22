// AssistBuild Tenant Context Builder
// Fetches all necessary context data for AssistBuild orchestrator

import { db } from "../db";
import { tenants, connectors, modules } from "../../../shared/schema";
import { eq, sql } from "drizzle-orm";
import type { TenantContext } from "../../../packages/ai/agents/assistbuild/types";
import { selectFromTenantTable } from "../utils/tenant-db-helper";

/**
 * Build complete TenantContext required by AssistBuild orchestrator
 * Fetches active modules, connectors, agents, workflows, and company info
 */
export async function buildAssistBuildTenantContext(
  tenantId: string,
  userId: string,
  environment: "sandbox" | "production"
): Promise<TenantContext> {
  // Get tenant/company info
  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  const companyInfo = tenant
    ? {
        companyName: tenant.name,
        country: tenant.country,
        currency: tenant.currency,
        timezone: tenant.timezone,
        fiscalYearStart: tenant.fiscalYearStart,
        accountingStandard: tenant.accountingStandard,
      }
    : undefined;

  // Get active modules for this tenant (tenant-scoped table)
  const activeModulesData = await selectFromTenantTable<{
    module_id: string;
  }>(
    tenantId,
    'tenant_modules',
    sql`is_active = true AND environment = ${environment}`
  );

  const activeModules = activeModulesData.map((m) => m.module_id);

  // Get connectors (integrations) for this tenant
  // Use try-catch to gracefully handle missing table or query errors
  let connectorsData: any[] = [];
  try {
    connectorsData = await db
      .select()
      .from(connectors)
      .where(eq(connectors.tenantId, tenantId));
  } catch (error) {
    console.warn("[AssistBuild Context] Failed to fetch connectors, using empty array:", error);
    // Continue with empty array - non-critical data
  }

  // TODO: Get agents and workflows when those tables are available
  // For now, return empty arrays
  const agents: any[] = [];
  const workflows: any[] = [];

  return {
    tenantId,
    userId,
    companyInfo,
    activeModules,
    connectors: connectorsData,
    agents,
    workflows,
    environment,
  };
}
