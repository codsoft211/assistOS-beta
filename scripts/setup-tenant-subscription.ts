import "../load-env";
import { db } from "../apps/api/db";
import { tenantSubscriptions, tenantCredits } from "../shared/schema";
import { eq } from "drizzle-orm";

/**
 * Setup subscription and credits for a tenant
 * Usage: npx tsx scripts/setup-tenant-subscription.ts <tenantId> [planId]
 */

async function setupTenantSubscription() {
  try {
    const tenantId = process.argv[2];
    const planId = process.argv[3] ? parseInt(process.argv[3]) : 1;

    if (!tenantId) {
      console.error("❌ Error: Tenant ID is required");
      console.log("Usage: npx tsx scripts/setup-tenant-subscription.ts <tenantId> [planId]");
      process.exit(1);
    }

    console.log(`📦 Setting up subscription for tenant: ${tenantId}`);
    console.log(`   Plan ID: ${planId}`);

    // Check if subscription already exists
    const [existingSubscription] = await db
      .select()
      .from(tenantSubscriptions)
      .where(eq(tenantSubscriptions.tenantId, tenantId))
      .limit(1);

    if (existingSubscription) {
      console.log(`ℹ️  Subscription already exists`);
      console.log(`   Status: ${existingSubscription.status}`);
    } else {
      console.log(`Creating subscription...`);

      const [newSubscription] = await db
        .insert(tenantSubscriptions)
        .values({
          tenantId,
          subscriptionPlanId: planId,
          status: "active",
          startDate: new Date(),
          paymentMethod: "manual",
          billingInterval: "monthly",
          autoRenew: true,
        })
        .returning();

      console.log(`✅ Subscription created`);
    }

    console.log(`\n💳 Setting up credits...`);

    // Check if credits exist
    const [existingCredits] = await db
      .select()
      .from(tenantCredits)
      .where(eq(tenantCredits.tenantId, tenantId))
      .limit(1);

    let credits;
    if (existingCredits) {
      // Update existing
      [credits] = await db
        .update(tenantCredits)
        .set({
          monthlyCredits: 500,
          packageCredits: 500,
          reserved: 0,
          updatedAt: new Date(),
        })
        .where(eq(tenantCredits.tenantId, tenantId))
        .returning();
      console.log(`✅ Credits updated`);
    } else {
      // Create new
      [credits] = await db
        .insert(tenantCredits)
        .values({
          tenantId,
          monthlyCredits: 500,
          packageCredits: 500,
          reserved: 0,
          lastRenewal: new Date(),
        })
        .returning();
      console.log(`✅ Credits created`);
    }

    const totalBalance = (credits.monthlyCredits || 0) + (credits.packageCredits || 0);
    console.log(`   Total Balance: ${totalBalance} credits`);

    console.log(`\n✨ Setup complete!`);
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

setupTenantSubscription();
