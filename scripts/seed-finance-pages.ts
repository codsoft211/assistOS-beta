import { db } from '../apps/api/db';
import { modulePages, tenantModules, tenants } from '../shared/schema';
import { eq, and } from 'drizzle-orm';

async function seedFinancePages() {
  console.log('[Seed] Starting Finance module pages seed...');
  
  const MODULE_ID = 'financeiro';
  const allTenants = await db.select({ id: tenants.id }).from(tenants);
  
  console.log(`[Seed] Found ${allTenants.length} tenants`);
  console.log(`[Seed] Module ID (slug): ${MODULE_ID}`);
  
  for (const tenant of allTenants) {
    console.log(`[Seed] Processing tenant: ${tenant.id}`);
    
    // Check if tenant has 'financeiro' module installed
    const existingTenantModule = await db.select()
      .from(tenantModules)
      .where(
        and(
          eq(tenantModules.tenantId, tenant.id),
          eq(tenantModules.moduleId, MODULE_ID),
          eq(tenantModules.environment, 'production')
        )
      )
      .limit(1);
    
    // If not installed, create tenant_modules entry
    if (!existingTenantModule || existingTenantModule.length === 0) {
      console.log(`[Seed] Installing '${MODULE_ID}' module for tenant ${tenant.id}`);
      await db.insert(tenantModules).values({
        tenantId: tenant.id,
        moduleId: MODULE_ID,
        isActive: true,
        environment: 'production',
      });
    } else {
      console.log(`[Seed] Tenant ${tenant.id} already has '${MODULE_ID}' module installed`);
    }
    
    // Check if pages already exist
    const existingPages = await db.select()
      .from(modulePages)
      .where(
        and(
          eq(modulePages.tenantId, tenant.id),
          eq(modulePages.moduleId, MODULE_ID),
          eq(modulePages.environment, 'production')
        )
      );
    
    if (existingPages.length > 0) {
      console.log(`[Seed] Tenant ${tenant.id} already has ${existingPages.length} Finance pages. Skipping.`);
      continue;
    }
    
    console.log(`[Seed] Creating Finance page hierarchy for tenant ${tenant.id}`);
    
    // Dashboard page
    const dashboardPage = await db.insert(modulePages).values({
      tenantId: tenant.id,
      moduleId: MODULE_ID,
      routePath: '/financeiro',
      displayLabel: 'Dashboard',
      icon: 'LayoutDashboard',
      displayOrder: 0,
      isGroup: false,
      environment: 'production',
    }).returning();
    
    // Accounts Receivable Group
    const arGroupPage = await db.insert(modulePages).values({
      tenantId: tenant.id,
      moduleId: MODULE_ID,
      routePath: '/financeiro/accounts-receivable',
      displayLabel: 'Accounts Receivable',
      icon: 'FileText',
      displayOrder: 1,
      isGroup: true,
      environment: 'production',
    }).returning();
    
    await db.insert(modulePages).values([
      {
        tenantId: tenant.id,
        moduleId: MODULE_ID,
        parentPageId: arGroupPage[0].id,
        routePath: '/financeiro/invoices',
        displayLabel: 'Invoices',
        icon: 'Receipt',
        displayOrder: 0,
        isGroup: false,
        environment: 'production',
      },
      {
        tenantId: tenant.id,
        moduleId: MODULE_ID,
        parentPageId: arGroupPage[0].id,
        routePath: '/financeiro/credit-notes',
        displayLabel: 'Credit Notes',
        icon: 'FileCheck',
        displayOrder: 1,
        isGroup: false,
        environment: 'production',
      },
      {
        tenantId: tenant.id,
        moduleId: MODULE_ID,
        parentPageId: arGroupPage[0].id,
        routePath: '/financeiro/subscriptions',
        displayLabel: 'Subscriptions',
        icon: 'RefreshCw',
        displayOrder: 2,
        isGroup: false,
        environment: 'production',
      },
      {
        tenantId: tenant.id,
        moduleId: MODULE_ID,
        parentPageId: arGroupPage[0].id,
        routePath: '/financeiro/dunning',
        displayLabel: 'Payment Reminders',
        icon: 'Bell',
        displayOrder: 3,
        isGroup: false,
        environment: 'production',
      },
      {
        tenantId: tenant.id,
        moduleId: MODULE_ID,
        parentPageId: arGroupPage[0].id,
        routePath: '/financeiro/customer-statements',
        displayLabel: 'Customer Statements',
        icon: 'FileText',
        displayOrder: 4,
        isGroup: false,
        environment: 'production',
      },
    ]);
    
    // Accounts Payable Group
    const apGroupPage = await db.insert(modulePages).values({
      tenantId: tenant.id,
      moduleId: MODULE_ID,
      routePath: '/financeiro/accounts-payable',
      displayLabel: 'Accounts Payable',
      icon: 'Wallet',
      displayOrder: 2,
      isGroup: true,
      environment: 'production',
    }).returning();
    
    await db.insert(modulePages).values([
      {
        tenantId: tenant.id,
        moduleId: MODULE_ID,
        parentPageId: apGroupPage[0].id,
        routePath: '/financeiro/vendor-bills',
        displayLabel: 'Vendor Bills',
        icon: 'FileInput',
        displayOrder: 0,
        isGroup: false,
        environment: 'production',
      },
      {
        tenantId: tenant.id,
        moduleId: MODULE_ID,
        parentPageId: apGroupPage[0].id,
        routePath: '/financeiro/three-way-matching',
        displayLabel: '3-Way Matching',
        icon: 'GitCompare',
        displayOrder: 1,
        isGroup: false,
        environment: 'production',
      },
      {
        tenantId: tenant.id,
        moduleId: MODULE_ID,
        parentPageId: apGroupPage[0].id,
        routePath: '/financeiro/approvals',
        displayLabel: 'Approvals',
        icon: 'CheckCircle',
        displayOrder: 2,
        isGroup: false,
        environment: 'production',
      },
      {
        tenantId: tenant.id,
        moduleId: MODULE_ID,
        parentPageId: apGroupPage[0].id,
        routePath: '/financeiro/payment-planning',
        displayLabel: 'Payment Planning',
        icon: 'Calendar',
        displayOrder: 3,
        isGroup: false,
        environment: 'production',
      },
      {
        tenantId: tenant.id,
        moduleId: MODULE_ID,
        parentPageId: apGroupPage[0].id,
        routePath: '/financeiro/vendor-statements',
        displayLabel: 'Vendor Statements',
        icon: 'FileText',
        displayOrder: 4,
        isGroup: false,
        environment: 'production',
      },
    ]);
    
    // Treasury Group
    const treasuryGroupPage = await db.insert(modulePages).values({
      tenantId: tenant.id,
      moduleId: MODULE_ID,
      routePath: '/financeiro/treasury',
      displayLabel: 'Treasury',
      icon: 'Landmark',
      displayOrder: 3,
      isGroup: true,
      environment: 'production',
    }).returning();
    
    await db.insert(modulePages).values([
      {
        tenantId: tenant.id,
        moduleId: MODULE_ID,
        parentPageId: treasuryGroupPage[0].id,
        routePath: '/financeiro/bank-statements',
        displayLabel: 'Bank Statements',
        icon: 'Building',
        displayOrder: 0,
        isGroup: false,
        environment: 'production',
      },
      {
        tenantId: tenant.id,
        moduleId: MODULE_ID,
        parentPageId: treasuryGroupPage[0].id,
        routePath: '/financeiro/cashflow-forecast',
        displayLabel: 'Cashflow Forecast',
        icon: 'TrendingUp',
        displayOrder: 1,
        isGroup: false,
        environment: 'production',
      },
      {
        tenantId: tenant.id,
        moduleId: MODULE_ID,
        parentPageId: treasuryGroupPage[0].id,
        routePath: '/financeiro/foreign-exchange',
        displayLabel: 'Foreign Exchange',
        icon: 'Globe',
        displayOrder: 2,
        isGroup: false,
        environment: 'production',
      },
      {
        tenantId: tenant.id,
        moduleId: MODULE_ID,
        parentPageId: treasuryGroupPage[0].id,
        routePath: '/financeiro/bank-reconciliation',
        displayLabel: 'Bank Reconciliation',
        icon: 'CheckCheck',
        displayOrder: 3,
        isGroup: false,
        environment: 'production',
      },
    ]);
    
    console.log(`[Seed] ✅ Created complete Finance hierarchy for tenant ${tenant.id}`);
  }
  
  console.log('[Seed] Finance module pages seed completed!');
  process.exit(0);
}

seedFinancePages().catch((error) => {
  console.error('[Seed] Fatal error:', error);
  process.exit(1);
});
