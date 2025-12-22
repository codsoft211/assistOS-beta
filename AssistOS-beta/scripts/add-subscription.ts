import '../load-env';
import { db } from '../apps/api/db';
import {
  users,
  userTenants,
  tenants,
  subscriptionPlans,
  tenantSubscriptions,
} from '../shared/schema';
import { eq, and } from 'drizzle-orm';

interface Args {
  email: string;
  plan: string;
  environment?: string;
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const out: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--')) {
      const key = a.replace(/^--/, '');
      const next = args[i + 1];
      if (next && !next.startsWith('--')) {
        out[key] = next;
        i++;
      } else {
        out[key] = 'true';
      }
    }
  }
  if (!out.email) throw new Error('Missing --email');
  if (!out.plan) throw new Error('Missing --plan');
  return { email: out.email, plan: out.plan, environment: out.environment || 'production' };
}

async function main() {
  const { email, plan, environment } = parseArgs();
  console.log(`[Add Subscription] Starting for email=${email}, plan=${plan}, env=${environment}`);

  // 1) Find user
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) {
    throw new Error(`User not found for email: ${email}`);
  }
  console.log(`[Add Subscription] Found user: ${user.id}`);

  // 2) Find or create tenant for this user
  let memberships = await db
    .select({ tenantId: userTenants.tenantId })
    .from(userTenants)
    .where(and(eq(userTenants.userId, user.id), eq(userTenants.environment, environment)));

  let tenantId: string;

  if (memberships.length === 0) {
    console.log(`[Add Subscription] No tenant found, creating one...`);
    
    // Create a new tenant for the user
    const tenantName = user.firstName && user.lastName 
      ? `${user.firstName} ${user.lastName}'s Workspace`
      : `${email}'s Workspace`;
    const slug = `${email.split('@')[0]}-${Date.now()}`;
    
    const [newTenant] = await db
      .insert(tenants)
      .values({
        name: tenantName,
        slug,
        country: 'US',
        currency: 'USD',
        timezone: 'America/New_York',
      })
      .returning();

    tenantId = newTenant.id;
    console.log(`[Add Subscription] Created tenant: ${tenantId} (${tenantName})`);

    // Associate user with tenant as owner
    await db
      .insert(userTenants)
      .values({
        userId: user.id,
        tenantId: newTenant.id,
        role: 'owner',
        environment,
      });
    console.log(`[Add Subscription] Associated user with tenant as owner`);
  } else {
    tenantId = memberships[0].tenantId;
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    if (!tenant) {
      throw new Error(`Tenant not found: ${tenantId}`);
    }
    console.log(`[Add Subscription] Using existing tenant: ${tenantId} (${tenant.name})`);
  }

  // 3) Find plan by name (case-insensitive match by exact name)
  const plans = await db
    .select()
    .from(subscriptionPlans)
    .where(eq(subscriptionPlans.name, plan))
    .limit(1);
  const targetPlan = plans[0];
  if (!targetPlan) {
    throw new Error(`Subscription plan not found: ${plan}. Available plans: Base, Pro, Ultra, Enterprise`);
  }
  if (targetPlan.isEnterprise) {
    console.log(`[Add Subscription] ⚠️  Plan ${plan} is marked as enterprise; proceeding with manual setup.`);
  }
  console.log(`[Add Subscription] Plan found: id=${targetPlan.id}, name=${targetPlan.name}, priceModel=${targetPlan.priceModel}`);

  // 4) Check existing active subscription
  const [currentSub] = await db
    .select()
    .from(tenantSubscriptions)
    .where(and(eq(tenantSubscriptions.tenantId, tenantId), eq(tenantSubscriptions.status, 'active')))
    .limit(1);

  const now = new Date();

  if (!currentSub) {
    // Create a new active subscription
    const insertValues = {
      tenantId,
      subscriptionPlanId: targetPlan.id,
      status: 'active' as const,
      startDate: now,
      currentPeriodStart: now,
      billingInterval: 'monthly' as const,
      autoRenew: true,
      payingSeatsAllocated: 1,
      freeSeatsAllocated: 0,
      creditBalance: '0',
      metadata: { createdByScript: 'scripts/add-subscription.ts', email },
      notes: `Initial subscription set to ${targetPlan.name}`,
      updatedAt: now,
    };

    const inserted = await db.insert(tenantSubscriptions).values(insertValues).returning();
    console.log(`[Add Subscription] ✅ Created subscription ${inserted[0].id} on plan ${targetPlan.name}`);
  } else {
    // Update existing subscription to target plan (direct switch)
    await db
      .update(tenantSubscriptions)
      .set({
        subscriptionPlanId: targetPlan.id,
        scheduledPlanId: null,
        scheduledPlanChangeAt: null,
        updatedAt: now,
      })
      .where(eq(tenantSubscriptions.id, currentSub.id));

    console.log(`[Add Subscription] ✅ Updated subscription ${currentSub.id} to plan ${targetPlan.name}`);
  }

  console.log('[Add Subscription] Done.');
}

main().catch((err) => {
  console.error('[Add Subscription] Error:', err.message);
  process.exitCode = 1;
});
