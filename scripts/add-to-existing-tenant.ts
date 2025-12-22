import '../load-env';
import { db } from '../apps/api/db';
import {
  users,
  userTenants,
  tenants,
  subscriptionPlans,
  tenantSubscriptions,
  tenantCredits,
  creditTransactions,
} from '../shared/schema';
import { eq, and, sql } from 'drizzle-orm';

async function main() {
  const email = 'johndoe@gmail.com';
  const planName = 'Ultra';
  const targetTenantId = '2e37ec81-d926-4fba-a05c-a934d8fa6fd8'; // Google tenant
  const environment = 'production';

  console.log(`[Add Subscription] Starting for email=${email}, plan=${planName}`);
  console.log(`[Add Subscription] Target tenant: ${targetTenantId}`);

  // 1) Find user
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) {
    throw new Error(`User not found for email: ${email}`);
  }
  console.log(`[Add Subscription] Found user: ${user.id}`);

  // 2) Check if user is already a member of the target tenant
  const [membership] = await db
    .select()
    .from(userTenants)
    .where(
      and(
        eq(userTenants.userId, user.id),
        eq(userTenants.tenantId, targetTenantId),
        eq(userTenants.environment, environment)
      )
    )
    .limit(1);

  if (!membership) {
    console.log(`[Add Subscription] Adding user to tenant...`);
    await db
      .insert(userTenants)
      .values({
        userId: user.id,
        tenantId: targetTenantId,
        role: 'owner',
        environment,
      });
    console.log(`[Add Subscription] ✅ User added to tenant as owner`);
  } else {
    console.log(`[Add Subscription] User already member of tenant (role: ${membership.role})`);
  }

  // 3) Verify tenant exists
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, targetTenantId)).limit(1);
  if (!tenant) {
    throw new Error(`Tenant not found: ${targetTenantId}`);
  }
  console.log(`[Add Subscription] Tenant: ${tenant.name} (${tenant.country}/${tenant.currency})`);

  // 4) Find plan by name
  const [targetPlan] = await db
    .select()
    .from(subscriptionPlans)
    .where(eq(subscriptionPlans.name, planName))
    .limit(1);
  
  if (!targetPlan) {
    throw new Error(`Subscription plan not found: ${planName}`);
  }
  console.log(`[Add Subscription] Plan found: id=${targetPlan.id}, name=${targetPlan.name}`);

  // 5) Check existing active subscription
  const [currentSub] = await db
    .select()
    .from(tenantSubscriptions)
    .where(and(eq(tenantSubscriptions.tenantId, targetTenantId), eq(tenantSubscriptions.status, 'active')))
    .limit(1);

  const now = new Date();

  if (!currentSub) {
    // Create a new active subscription
    const insertValues = {
      tenantId: targetTenantId,
      subscriptionPlanId: targetPlan.id,
      status: 'active' as const,
      startDate: now,
      currentPeriodStart: now,
      billingInterval: 'monthly' as const,
      autoRenew: true,
      payingSeatsAllocated: 1,
      freeSeatsAllocated: 0,
      creditBalance: '0',
      metadata: { createdByScript: 'scripts/add-to-existing-tenant.ts', email },
      notes: `Subscription set to ${targetPlan.name}`,
      updatedAt: now,
    };

    const inserted = await db.insert(tenantSubscriptions).values(insertValues).returning();
    console.log(`[Add Subscription] ✅ Created subscription ${inserted[0].id} on plan ${targetPlan.name}`);
  } else {
    // Update existing subscription to target plan
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

  // 6) Add credits to tenant
  console.log('[Add Subscription] Adding credits...');
  
  const creditsToAdd = 10000; // 10,000 credits = €1000 value
  
  // Check if tenant credits record exists
  const [existingCredits] = await db
    .select()
    .from(tenantCredits)
    .where(eq(tenantCredits.tenantId, targetTenantId))
    .limit(1);

  if (existingCredits) {
    // Update existing credits
    const balanceBefore = (existingCredits.monthlyCredits || 0) + (existingCredits.packageCredits || 0);
    const newPackageCredits = (existingCredits.packageCredits || 0) + creditsToAdd;
    const balanceAfter = (existingCredits.monthlyCredits || 0) + newPackageCredits;

    await db
      .update(tenantCredits)
      .set({
        packageCredits: newPackageCredits,
        lifetimePurchases: sql`${tenantCredits.lifetimePurchases} + ${creditsToAdd}`,
        lastPurchaseAt: now,
        updatedAt: now,
      })
      .where(eq(tenantCredits.id, existingCredits.id));

    console.log(`[Add Subscription] ✅ Updated credits: ${balanceBefore} → ${balanceAfter}`);

    // Create transaction record
    await db.insert(creditTransactions).values({
      tenantId: targetTenantId,
      environment: 'production',
      type: 'purchase',
      amount: creditsToAdd,
      balanceBefore,
      balanceAfter,
      currency: 'EUR',
      description: `Manual credit grant for ${targetPlan.name} subscription`,
      metadata: { grantedByScript: 'add-to-existing-tenant.ts', email },
    });
  } else {
    // Create new credits record
    await db.insert(tenantCredits).values({
      tenantId: targetTenantId,
      monthlyCredits: 0,
      packageCredits: creditsToAdd,
      reserved: 0,
      lifetimeUsage: 0,
      lifetimePurchases: creditsToAdd,
      lastPurchaseAt: now,
      updatedAt: now,
    });

    console.log(`[Add Subscription] ✅ Created credits record with ${creditsToAdd} credits`);

    // Create transaction record
    await db.insert(creditTransactions).values({
      tenantId: targetTenantId,
      environment: 'production',
      type: 'purchase',
      amount: creditsToAdd,
      balanceBefore: 0,
      balanceAfter: creditsToAdd,
      currency: 'EUR',
      description: `Initial credit grant for ${targetPlan.name} subscription`,
      metadata: { grantedByScript: 'add-to-existing-tenant.ts', email },
    });
  }

  console.log('[Add Subscription] Done.');
}

main().catch((err) => {
  console.error('[Add Subscription] Error:', err.message);
  process.exitCode = 1;
});
