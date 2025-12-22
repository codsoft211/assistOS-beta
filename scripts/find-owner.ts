import "../load-env";
import { db } from "../apps/api/db";
import { users, tenants, userTenants } from "../shared/schema";
import { eq } from "drizzle-orm";

async function findOwner() {
  try {
    // Get all tenants with their owners
    const allTenants = await db.query.tenants.findMany();
    
    for (const tenant of allTenants) {
      const [ownerRelation] = await db
        .select({
          userId: userTenants.userId,
          role: userTenants.role,
        })
        .from(userTenants)
        .where(eq(userTenants.tenantId, tenant.id))
        .limit(1);

      if (ownerRelation) {
        const [ownerUser] = await db
          .select()
          .from(users)
          .where(eq(users.id, ownerRelation.userId))
          .limit(1);

        if (ownerUser) {
          console.log(`\n📋 Tenant: ${tenant.name}`);
          console.log(`   ID: ${tenant.id}`);
          console.log(`   Owner Email: ${ownerUser.email}`);
          console.log(`   Owner Name: ${ownerUser.firstName} ${ownerUser.lastName}`);
          console.log(`   Role: ${ownerRelation.role}`);
        }
      }
    }
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

findOwner().then(() => process.exit(0));
