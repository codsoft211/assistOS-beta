import "../load-env";
import { db } from "../apps/api/db";
import { users, tenantSubscriptions, tenantCredits, tenants, userTenants } from "../shared/schema";
import { eq, sql } from "drizzle-orm";

/**
 * Script to setup subscription and credits for a user
 * Usage: tsx scripts/setup-user-subscription.ts <email> [planId]
 * 
 * Example: tsx scripts/setup-user-subscription.ts abhinav@email.com 1
 */

async function setupUserSubscription() {
  try {
    const email = process.argv[2];
    const planId = process.argv[3] ? parseInt(process.argv[3]) : 1;

    if (!email) {
      console.error("❌ Error: Email is required");
      console.log("Usage: tsx scripts/setup-user-subscription.ts <email> [planId]");
      console.log("Example: tsx scripts/setup-user-subscription.ts abhinav@email.com 1");
      process.exit(1);
    }

    console.log(`🔍 Searching for user with email: ${email}`);

    // Find user by email
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!user) {
      console.error(`❌ User not found with email: ${email}`);
      process.exit(1);
    }

    console.log(`✅ User found:`);
    console.log(`   ID: ${user.id}`);
    console.log(`   Name: ${user.firstName} ${user.lastName}`);
    console.log(`   Email: ${user.email}`);

    // Get tenant ID from user's tenant association
    const [userTenant] = await db
      .select({ tenantId: userTenants.tenantId })
      .from(userTenants)
      .where(eq(userTenants.userId, user.id))
      .limit(1);

    let tenantId: string;

    if (!userTenant) {
      console.log(`⚠️  User has no associated tenant, creating one...`);
      
      // Create a new tenant for the user
      const tenantName = `${user.firstName} ${user.lastName}'s Workspace`;
      const slug = `${user.firstName.toLowerCase()}-${user.lastName.toLowerCase()}-${Date.now()}`;
      
      const [newTenant] = await db
        .insert(tenants)
        .values({
          name: tenantName,
          slug,
          country: "PT",
          currency: "EUR",
          timezone: "Europe/Lisbon",
        })
        .returning();

      tenantId = newTenant.id;
      console.log(`✅ Tenant created: ${tenantName}`);

      // Associate user with tenant
      await db
        .insert(userTenants)
        .values({
          userId: user.id,
          tenantId: newTenant.id,
          role: "owner",
        });
      console.log(`✅ User associated with tenant`);
    } else {
      tenantId = userTenant.tenantId;
    }

    console.log(`✅ Tenant ID: ${tenantId}`);

    // Check if subscription already exists
    const [existingSubscription] = await db
      .select()
      .from(tenantSubscriptions)
      .where(eq(tenantSubscriptions.tenantId, tenantId))
      .limit(1);

    if (existingSubscription) {
      console.log(`ℹ️  Subscription already exists for this tenant`);
      console.log(`   ID: ${existingSubscription.id}`);
      console.log(`   Status: ${existingSubscription.status}`);
      console.log(`   Plan ID: ${existingSubscription.subscriptionPlanId}`);
    } else {
      console.log(`\n📦 Creating subscription...`);

      // Create subscription
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

      console.log(`✅ Subscription created:`);
      console.log(`   ID: ${newSubscription.id}`);
      console.log(`   Status: ${newSubscription.status}`);
      console.log(`   Plan ID: ${newSubscription.subscriptionPlanId}`);
    }

    console.log(`\n💳 Adding credits...`);

    // Check if credits exist
    const [existingCredits] = await db
      .select()
      .from(tenantCredits)
      .where(eq(tenantCredits.tenantId, tenantId))
      .limit(1);

    let credits;
    if (existingCredits) {
      // Update existing - set both monthlyCredits and packageCredits so balance = 1000
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
      // Create new - set both fields so balance = 1000
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

    console.log(`   Monthly Credits: ${credits.monthlyCredits}`);
    console.log(`   Package Credits: ${credits.packageCredits}`);
    console.log(`   Total Balance: ${(credits.monthlyCredits || 0) + (credits.packageCredits || 0)}`);

    console.log(`\n✨ Setup complete! User can now use AI features.`);
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

setupUserSubscription();
