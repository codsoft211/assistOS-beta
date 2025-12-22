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

  // 2) Find a tenant associated with this user (production env preferred)
  const memberships = await db
    .select({ tenantId: userTenants.tenantId })
    .from(userTenants)
    .where(and(eq(userTenants.userId, user.id), eq(userTenants.environment, environment)));

  if (memberships.length === 0) {
    throw new Error(`No tenant memberships found for user ${email} in environment ${environment}`);
  }

  // Prefer the first tenant (if multiple, you may refine this selection criteria)
  const tenantId = memberships[0].tenantId;
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!tenant) {
    throw new Error(`Tenant not found: ${tenantId}`);
  }
  console.log(`[Add Subscription] Target tenant: ${tenantId} (${tenant.name})`);

  // 3) Find plan by name (case-insensitive match by exact name)
  const plans = await db
    .select()
    .from(subscriptionPlans)
    .where(eq(subscriptionPlans.name, plan))
    .limit(1);
  const targetPlan = plans[0];
  if (!targetPlan) {
    throw new Error(`Subscription plan not found: ${plan}`);
  }
  if (targetPlan.isEnterprise) {
    throw new Error(`Plan ${plan} is marked as enterprise; manual setup required.`);
  }
  console.log(`[Add Subscription] Plan found: id=${targetPlan.id}, priceModel=${targetPlan.priceModel}`);

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
      payingSeatsAllocated: 0,
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
