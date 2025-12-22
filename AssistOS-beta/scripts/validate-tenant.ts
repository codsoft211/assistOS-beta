import { db } from '../apps/api/db';
import {
  tenants,
  users,
  userTenants,
  companyInfo,
  tenantModules,
  sequenceCounters,
  tenantStorageProviders,
  notificationPreferences,
} from '../shared/schema';
import { eq, and, sql } from 'drizzle-orm';

// Expected module counts by tier
const EXPECTED_MODULES = {
  default: 2,
  starter: 4,
  premium: 7,
  enterprise: 7,
} as const;

// Expected modules by tier
const MODULE_ASSIGNMENTS = {
  default: ['chat', 'documents'],
  starter: ['chat', 'documents', 'compras', 'financeiro'],
  premium: ['chat', 'documents', 'compras', 'financeiro', 'comercial', 'logistica', 'projetos'],
  enterprise: ['chat', 'documents', 'compras', 'financeiro', 'comercial', 'logistica', 'projetos'],
} as const;

interface ValidationCheck {
  name: string;
  passed: boolean;
  message: string;
}

interface ValidationResult {
  tenantSlug: string;
  allPassed: boolean;
  checksRun: number;
  checksPassed: number;
  checksFailed: number;
  checks: ValidationCheck[];
}

/**
 * Run all validation checks for a tenant
 */
async function validateTenant(tenantSlug: string): Promise<ValidationResult> {
  const checks: ValidationCheck[] = [];
  
  console.log('🔍 Validating tenant:', tenantSlug);
  console.log('');

  // ========== DATABASE CHECKS ==========
  console.log('📊 Database Checks:');
  console.log('─────────────────────────────────────────');

  // Check 1: Tenant record exists
  let tenant: any = null;
  try {
    const [result] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.slug, tenantSlug))
      .limit(1);
    
    tenant = result;
    if (tenant) {
      checks.push({
        name: 'Tenant Record Exists',
        passed: true,
        message: `ID: ${tenant.id}, Name: ${tenant.name}, Tier: ${tenant.tier}`,
      });
      console.log(`✅ Tenant record exists (ID: ${tenant.id})`);
    } else {
      checks.push({
        name: 'Tenant Record Exists',
        passed: false,
        message: 'Tenant not found',
      });
      console.log(`❌ Tenant not found with slug: ${tenantSlug}`);
      return {
        tenantSlug,
        allPassed: false,
        checksRun: 1,
        checksPassed: 0,
        checksFailed: 1,
        checks,
      };
    }
  } catch (error: any) {
    checks.push({
      name: 'Tenant Record Exists',
      passed: false,
      message: `Database error: ${error.message}`,
    });
    console.log(`❌ Database error: ${error.message}`);
    return {
      tenantSlug,
      allPassed: false,
      checksRun: 1,
      checksPassed: 0,
      checksFailed: 1,
      checks,
    };
  }

  // Check 2: Tenant status is active
  const statusCheck = tenant.status === 'active';
  checks.push({
    name: 'Tenant Status Active',
    passed: statusCheck,
    message: `Status: ${tenant.status}`,
  });
  console.log(statusCheck 
    ? `✅ Tenant status is active` 
    : `❌ Tenant status is not active: ${tenant.status}`
  );

  // Check 3: Admin user exists
  const adminUsers = await db
    .select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      isActive: users.isActive,
    })
    .from(users)
    .innerJoin(userTenants, eq(userTenants.userId, users.id))
    .where(
      and(
        eq(userTenants.tenantId, tenant.id),
        eq(userTenants.role, 'owner')
      )
    );

  const hasAdmin = adminUsers.length > 0;
  checks.push({
    name: 'Admin User Exists',
    passed: hasAdmin,
    message: hasAdmin 
      ? `${adminUsers[0].email} (${adminUsers[0].firstName} ${adminUsers[0].lastName})`
      : 'No admin user found',
  });
  console.log(hasAdmin 
    ? `✅ Admin user exists (${adminUsers[0].email})` 
    : `❌ No admin user found`
  );

  // Check 4: Admin user is active
  if (hasAdmin) {
    const adminActive = adminUsers[0].isActive;
    checks.push({
      name: 'Admin User Active',
      passed: adminActive,
      message: adminActive ? 'User is active' : 'User is inactive',
    });
    console.log(adminActive 
      ? `✅ Admin user is active` 
      : `❌ Admin user is inactive`
    );
  }

  // Check 5: User-tenant association exists
  const userTenantAssociations = await db
    .select()
    .from(userTenants)
    .where(eq(userTenants.tenantId, tenant.id));

  const hasUserTenant = userTenantAssociations.length > 0;
  checks.push({
    name: 'User-Tenant Association Exists',
    passed: hasUserTenant,
    message: hasUserTenant 
      ? `${userTenantAssociations.length} user(s) associated`
      : 'No user-tenant associations',
  });
  console.log(hasUserTenant 
    ? `✅ User-tenant association exists (${userTenantAssociations.length} user(s))` 
    : `❌ No user-tenant associations found`
  );

  // Check 6: Active environment is set to sandbox
  if (hasUserTenant) {
    const sandboxEnvironment = userTenantAssociations[0].activeEnvironment === 'sandbox';
    checks.push({
      name: 'Active Environment is Sandbox',
      passed: sandboxEnvironment,
      message: `Environment: ${userTenantAssociations[0].activeEnvironment}`,
    });
    console.log(sandboxEnvironment 
      ? `✅ Active environment: sandbox` 
      : `❌ Active environment: ${userTenantAssociations[0].activeEnvironment} (expected: sandbox)`
    );
  }

  // Check 7: Company info initialized
  const companyInfoRecords = await db
    .select()
    .from(companyInfo)
    .where(
      and(
        eq(companyInfo.tenantId, tenant.id),
        eq(companyInfo.environment, 'sandbox')
      )
    );

  const hasCompanyInfo = companyInfoRecords.length > 0;
  checks.push({
    name: 'Company Info Initialized',
    passed: hasCompanyInfo,
    message: hasCompanyInfo 
      ? `Company: ${companyInfoRecords[0].name}`
      : 'No company info found',
  });
  console.log(hasCompanyInfo 
    ? `✅ Company info initialized (${companyInfoRecords[0].name})` 
    : `❌ Company info not initialized`
  );

  // Check 8: Tenant modules assigned
  const installedModules = await db
    .select()
    .from(tenantModules)
    .where(
      and(
        eq(tenantModules.tenantId, tenant.id),
        eq(tenantModules.environment, 'sandbox'),
        eq(tenantModules.isActive, true)
      )
    );

  const moduleCount = installedModules.length;
  const expectedCount = EXPECTED_MODULES[tenant.tier as keyof typeof EXPECTED_MODULES] || 0;
  const correctModuleCount = moduleCount === expectedCount;
  
  checks.push({
    name: 'Tenant Modules Assigned',
    passed: correctModuleCount,
    message: `${moduleCount} modules installed (expected: ${expectedCount} for tier: ${tenant.tier})`,
  });
  console.log(correctModuleCount 
    ? `✅ Tenant modules assigned (${moduleCount} modules for tier: ${tenant.tier})` 
    : `❌ Module count mismatch: ${moduleCount} (expected: ${expectedCount})`
  );

  // Check 9: Correct modules installed for tier
  const expectedModules = MODULE_ASSIGNMENTS[tenant.tier as keyof typeof MODULE_ASSIGNMENTS] || [];
  const installedModuleIds = installedModules.map(m => m.moduleId);
  const hasCorrectModules = expectedModules.every(mod => installedModuleIds.includes(mod));
  
  checks.push({
    name: 'Correct Modules for Tier',
    passed: hasCorrectModules,
    message: hasCorrectModules 
      ? `All expected modules installed: ${expectedModules.join(', ')}`
      : `Missing modules: ${expectedModules.filter(m => !installedModuleIds.includes(m)).join(', ')}`,
  });
  console.log(hasCorrectModules 
    ? `✅ Correct modules installed: ${expectedModules.join(', ')}` 
    : `❌ Module mismatch. Expected: ${expectedModules.join(', ')}, Got: ${installedModuleIds.join(', ')}`
  );

  // Check 10: Sequence counters initialized
  const sequenceCountersRecords = await db
    .select()
    .from(sequenceCounters)
    .where(
      and(
        eq(sequenceCounters.tenantId, tenant.id),
        eq(sequenceCounters.environment, 'sandbox')
      )
    );

  const hasSequenceCounters = sequenceCountersRecords.length > 0;
  checks.push({
    name: 'Sequence Counters Initialized',
    passed: hasSequenceCounters,
    message: hasSequenceCounters 
      ? `${sequenceCountersRecords.length} counters initialized`
      : 'No sequence counters found',
  });
  console.log(hasSequenceCounters 
    ? `✅ Sequence counters initialized (${sequenceCountersRecords.length} counters)` 
    : `❌ Sequence counters not initialized`
  );

  // Check 11: Storage provider configured
  const storageProviders = await db
    .select()
    .from(tenantStorageProviders)
    .where(
      and(
        eq(tenantStorageProviders.tenantId, tenant.id),
        eq(tenantStorageProviders.isDefault, true)
      )
    );

  const hasStorageProvider = storageProviders.length > 0;
  checks.push({
    name: 'Storage Provider Configured',
    passed: hasStorageProvider,
    message: hasStorageProvider 
      ? `Provider: ${storageProviders[0].providerType}`
      : 'No storage provider configured',
  });
  console.log(hasStorageProvider 
    ? `✅ Storage provider configured (${storageProviders[0].providerType})` 
    : `❌ No storage provider configured`
  );

  // Check 12: Notification preferences set
  const notifPreferences = await db
    .select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.tenantId, tenant.id));

  const hasNotifPreferences = notifPreferences.length > 0;
  checks.push({
    name: 'Notification Preferences Set',
    passed: hasNotifPreferences,
    message: hasNotifPreferences 
      ? `Preferences configured for ${notifPreferences.length} user(s)`
      : 'No notification preferences found',
  });
  console.log(hasNotifPreferences 
    ? `✅ Notification preferences set` 
    : `❌ No notification preferences found`
  );

  // ========== FUNCTIONAL CHECKS ==========
  console.log('');
  console.log('⚙️  Functional Checks:');
  console.log('─────────────────────────────────────────');

  // Check 13: Feature access matches tier (enterprise has advanced tools)
  const correctAdvancedTools = tenant.tier === 'enterprise' 
    ? tenant.enableAdvancedTools === true 
    : tenant.enableAdvancedTools === false;
  
  checks.push({
    name: 'Advanced Tools Configuration',
    passed: correctAdvancedTools,
    message: tenant.tier === 'enterprise' 
      ? `Enterprise tier has advanced tools: ${tenant.enableAdvancedTools}`
      : `Non-enterprise tier, advanced tools: ${tenant.enableAdvancedTools}`,
  });
  console.log(correctAdvancedTools 
    ? `✅ Advanced tools correctly configured for tier: ${tenant.tier}` 
    : `❌ Advanced tools misconfigured: ${tenant.enableAdvancedTools} (tier: ${tenant.tier})`
  );

  // Check 14: Tenant isolation (no orphaned records)
  // Check for users not linked to any tenant
  const orphanedUsers = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .leftJoin(userTenants, eq(userTenants.userId, users.id))
    .where(sql`${userTenants.userId} IS NULL`);

  const noOrphanedUsers = orphanedUsers.length === 0;
  checks.push({
    name: 'No Orphaned Users',
    passed: noOrphanedUsers,
    message: noOrphanedUsers 
      ? 'All users are linked to tenants'
      : `${orphanedUsers.length} orphaned user(s) found`,
  });
  console.log(noOrphanedUsers 
    ? `✅ No orphaned users found` 
    : `⚠️  ${orphanedUsers.length} orphaned user(s) detected (not critical for this tenant)`
  );

  // Check 15: Environment configuration complete
  const envConfigComplete = hasUserTenant && userTenantAssociations[0].activeEnvironment === 'sandbox';
  checks.push({
    name: 'Environment Configuration Complete',
    passed: envConfigComplete,
    message: envConfigComplete 
      ? 'Sandbox environment ready'
      : 'Environment configuration incomplete',
  });
  console.log(envConfigComplete 
    ? `✅ Environment configuration complete (sandbox ready)` 
    : `❌ Environment configuration incomplete`
  );

  // Check 16: Localization settings configured
  const localizationSet = tenant.country && tenant.currency && tenant.timezone;
  checks.push({
    name: 'Localization Settings',
    passed: localizationSet,
    message: `Country: ${tenant.country}, Currency: ${tenant.currency}, Timezone: ${tenant.timezone}`,
  });
  console.log(localizationSet 
    ? `✅ Localization configured (${tenant.country}, ${tenant.currency}, ${tenant.timezone})` 
    : `❌ Localization settings incomplete`
  );

  // ========== SUMMARY ==========
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  
  const checksPassed = checks.filter(c => c.passed).length;
  const checksFailed = checks.filter(c => !c.passed).length;
  const allPassed = checksFailed === 0;

  if (allPassed) {
    console.log('🎉 ALL VALIDATION CHECKS PASSED!');
    console.log(`   Tenant ${tenantSlug} is ready for use.`);
  } else {
    console.log('❌ VALIDATION FAILED!');
    console.log(`   ${checksFailed} check(s) failed.`);
  }
  
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');
  console.log(`📊 Validation Summary:`);
  console.log(`   • Total Checks:  ${checks.length}`);
  console.log(`   • Passed:        ${checksPassed} ✅`);
  console.log(`   • Failed:        ${checksFailed} ❌`);
  console.log('');

  if (!allPassed) {
    console.log('❌ Failed Checks:');
    checks.filter(c => !c.passed).forEach(check => {
      console.log(`   • ${check.name}: ${check.message}`);
    });
    console.log('');
  }

  return {
    tenantSlug,
    allPassed,
    checksRun: checks.length,
    checksPassed,
    checksFailed,
    checks,
  };
}

// Main execution
async function main() {
  const args = process.argv.slice(2);

  // Validate arguments
  if (args.length < 1) {
    console.error('❌ Invalid arguments!\n');
    console.error('Usage: npx tsx scripts/validate-tenant.ts <tenantSlug>\n');
    console.error('Example:');
    console.error('  npx tsx scripts/validate-tenant.ts acme-corp');
    console.error('');
    process.exit(1);
  }

  const [tenantSlug] = args;

  // Validate tenant slug format
  if (!/^[a-z0-9-]+$/.test(tenantSlug)) {
    console.error(`❌ Invalid tenant slug format: ${tenantSlug}`);
    console.error('   Slug must contain only lowercase letters, numbers, and hyphens');
    console.error('');
    process.exit(1);
  }

  // Execute validation
  const result = await validateTenant(tenantSlug);

  // Exit with appropriate code
  process.exit(result.allPassed ? 0 : 1);
}

// Run the script
main().catch((error) => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});
