import { db } from '../apps/api/db';
import { 
  tenants, 
  users, 
  userTenants, 
  companyInfo, 
  tenantModules, 
  sequenceCounters,
  tenantStorageProviders,
  notificationPreferences
} from '../shared/schema';
import { generateUniqueSlug } from '../apps/api/utils/slug';
import { getDefaultScopes } from '../apps/api/permissions';
import bcrypt from 'bcrypt';
import { sql } from 'drizzle-orm';

// Tier-based module assignments
const MODULE_ASSIGNMENTS = {
  default: ['chat', 'documents'],
  starter: ['chat', 'documents', 'compras', 'financeiro'],
  premium: ['chat', 'documents', 'compras', 'financeiro', 'comercial', 'logistica', 'projetos'],
  enterprise: ['chat', 'documents', 'compras', 'financeiro', 'comercial', 'logistica', 'projetos'],
} as const;

const VALID_TIERS = ['default', 'starter', 'premium', 'enterprise'] as const;
type Tier = typeof VALID_TIERS[number];

// Sequence counter templates
const SEQUENCE_TEMPLATES = [
  { entityType: 'supplier', prefix: 'SUP' },
  { entityType: 'client', prefix: 'CLI' },
  { entityType: 'invoice', prefix: 'INV' },
  { entityType: 'quote', prefix: 'QUO' },
  { entityType: 'order', prefix: 'ORD' },
  { entityType: 'project', prefix: 'PRJ' },
];

interface ProvisionResult {
  success: boolean;
  tenantId?: string;
  tenantSlug?: string;
  userId?: string;
  error?: string;
}

/**
 * Generate slug from tenant name
 * Example: "Acme Corp" -> "acme-corp"
 */
function sanitizeTenantName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special chars except spaces and hyphens
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
    .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
}

/**
 * Provision a new tenant with all required setup
 */
async function provisionTenant(
  tenantName: string,
  tier: Tier,
  adminEmail: string,
  firstName: string,
  lastName: string,
  password: string
): Promise<ProvisionResult> {
  try {
    console.log('🚀 Starting tenant provisioning...\n');

    // Step 1: Generate unique slug
    console.log('📝 Step 1: Generating tenant slug...');
    const baseSlug = sanitizeTenantName(tenantName);
    const slug = await generateUniqueSlug(baseSlug);
    console.log(`   ✅ Slug: ${slug}\n`);

    // Step 2: Create tenant record
    console.log('🏢 Step 2: Creating tenant record...');
    const [tenant] = await db.insert(tenants).values({
      name: tenantName,
      slug: slug,
      tier: tier,
      status: 'active',
      enableAdvancedTools: tier === 'enterprise', // Enable advanced tools for enterprise
      country: 'PT',
      currency: 'EUR',
      timezone: 'Europe/Lisbon',
      fiscalYearStart: '01-01',
      accountingStandard: 'SNC',
    }).returning();
    console.log(`   ✅ Tenant created (ID: ${tenant.id})\n`);

    // Step 3: Create admin user
    console.log('👤 Step 3: Creating admin user...');
    const hashedPassword = await bcrypt.hash(password, 10);
    const [user] = await db.insert(users).values({
      email: adminEmail,
      firstName: firstName,
      lastName: lastName,
      password: hashedPassword,
      isActive: true,
      isPlatformAdmin: false,
    }).returning();
    console.log(`   ✅ User created (ID: ${user.id}, Email: ${user.email})\n`);

    // Step 4: Create user-tenant association
    console.log('🔗 Step 4: Creating user-tenant association...');
    await db.insert(userTenants).values({
      userId: user.id,
      tenantId: tenant.id,
      role: 'owner', // Full permissions
      scopes: getDefaultScopes('owner'),
      activeEnvironment: 'sandbox', // Start in sandbox
      environment: 'sandbox',
    });
    console.log(`   ✅ User linked to tenant with role: owner\n`);

    // Step 5: Initialize company info
    console.log('🏭 Step 5: Initializing company info...');
    await db.insert(companyInfo).values({
      tenantId: tenant.id,
      name: tenantName,
      legalName: tenantName,
      country: 'Portugal',
      environment: 'sandbox',
    });
    console.log(`   ✅ Company info initialized\n`);

    // Step 6: Install modules based on tier
    console.log('📦 Step 6: Installing tenant modules...');
    const modulesToInstall = MODULE_ASSIGNMENTS[tier];
    for (const moduleId of modulesToInstall) {
      await db.insert(tenantModules).values({
        tenantId: tenant.id,
        moduleId: moduleId,
        isActive: true,
        installedBy: user.id,
        environment: 'sandbox',
        config: {},
      });
    }
    console.log(`   ✅ Installed ${modulesToInstall.length} modules: ${modulesToInstall.join(', ')}\n`);

    // Step 7: Initialize sequence counters
    console.log('🔢 Step 7: Initializing sequence counters...');
    for (const seq of SEQUENCE_TEMPLATES) {
      await db.insert(sequenceCounters).values({
        tenantId: tenant.id,
        entityType: seq.entityType,
        prefix: seq.prefix,
        currentValue: 0,
        paddingLength: 4,
        environment: 'sandbox',
      });
    }
    console.log(`   ✅ Initialized ${SEQUENCE_TEMPLATES.length} sequence counters\n`);

    // Step 8: Create default storage provider
    console.log('💾 Step 8: Setting up storage provider...');
    await db.insert(tenantStorageProviders).values({
      tenantId: tenant.id,
      providerType: 'local',
      providerName: 'Local Storage (Development)',
      isDefault: true,
      isActive: true,
      priority: 0,
      config: { rootPath: `./storage/${slug}` },
      createdBy: user.id,
    });
    console.log(`   ✅ Storage provider configured\n`);

    // Step 9: Create notification preferences
    console.log('🔔 Step 9: Setting up notification preferences...');
    await db.insert(notificationPreferences).values({
      tenantId: tenant.id,
      userId: user.id,
      environment: 'sandbox',
      preferences: {
        channels: {
          in_app: { enabled: true, types: [] },
          email: { enabled: true, types: [], digestFrequency: 'never' as const },
          whatsapp: { enabled: tier === 'enterprise', types: [] },
          sms: { enabled: false, types: [] }
        }
      }
    });
    console.log(`   ✅ Notification preferences configured\n`);

    // Success summary
    console.log('═══════════════════════════════════════════════════════════');
    console.log('🎉 TENANT PROVISIONING SUCCESSFUL!');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');
    console.log(`📋 Tenant Details:`);
    console.log(`   • Name:         ${tenant.name}`);
    console.log(`   • Slug:         ${tenant.slug}`);
    console.log(`   • Tenant ID:    ${tenant.id}`);
    console.log(`   • Tier:         ${tenant.tier}`);
    console.log(`   • Status:       ${tenant.status}`);
    console.log('');
    console.log(`👤 Admin User:`);
    console.log(`   • Email:        ${user.email}`);
    console.log(`   • User ID:      ${user.id}`);
    console.log(`   • Name:         ${user.firstName} ${user.lastName}`);
    console.log(`   • Role:         owner`);
    console.log('');
    console.log(`🌍 Environment:`);
    console.log(`   • Active:       sandbox`);
    console.log(`   • Country:      ${tenant.country}`);
    console.log(`   • Currency:     ${tenant.currency}`);
    console.log(`   • Timezone:     ${tenant.timezone}`);
    console.log('');
    console.log(`📦 Modules Installed (${modulesToInstall.length}):`);
    modulesToInstall.forEach(mod => console.log(`   • ${mod}`));
    console.log('');
    console.log(`🔗 Login URL:`);
    console.log(`   https://app.assistos.com/login`);
    console.log('');
    console.log(`💡 Next Steps:`);
    console.log(`   1. Validate tenant: npx tsx scripts/validate-tenant.ts ${slug}`);
    console.log(`   2. Send welcome email to ${user.email}`);
    console.log(`   3. User can login with provided credentials`);
    console.log('');
    console.log('═══════════════════════════════════════════════════════════');

    return {
      success: true,
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      userId: user.id,
    };

  } catch (error: any) {
    console.error('❌ PROVISIONING FAILED!\n');
    console.error('Error:', error.message);
    if (error.code === '23505') {
      // Unique constraint violation
      if (error.constraint?.includes('slug')) {
        console.error('   • Tenant slug already exists (this should not happen with generateUniqueSlug)');
      } else if (error.constraint?.includes('email')) {
        console.error('   • Email address already in use');
      }
    }
    console.error('');
    return {
      success: false,
      error: error.message,
    };
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);

  // Validate arguments
  if (args.length < 6) {
    console.error('❌ Invalid arguments!\n');
    console.error('Usage: npx tsx scripts/provision-tenant.ts <tenantName> <tier> <adminEmail> <firstName> <lastName> <password>\n');
    console.error('Example:');
    console.error('  npx tsx scripts/provision-tenant.ts "Acme Corp" "starter" "admin@acme.com" "John" "Doe" "Pass123!"\n');
    console.error('Valid tiers: default, starter, premium, enterprise');
    process.exit(1);
  }

  const [tenantName, tier, adminEmail, firstName, lastName, password] = args;

  // Validate tier
  if (!VALID_TIERS.includes(tier as Tier)) {
    console.error(`❌ Invalid tier: ${tier}\n`);
    console.error(`Valid tiers: ${VALID_TIERS.join(', ')}`);
    process.exit(1);
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(adminEmail)) {
    console.error(`❌ Invalid email format: ${adminEmail}`);
    process.exit(1);
  }

  // Validate password strength (minimum 6 characters)
  if (password.length < 6) {
    console.error('❌ Password must be at least 6 characters long');
    process.exit(1);
  }

  // Execute provisioning
  const result = await provisionTenant(
    tenantName,
    tier as Tier,
    adminEmail,
    firstName,
    lastName,
    password
  );

  // Exit with appropriate code
  process.exit(result.success ? 0 : 1);
}

// Run the script
main().catch((error) => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});
