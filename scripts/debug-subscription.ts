import "../load-env";
import { db } from "../apps/api/db";
import { users, userTenants, tenants, tenantSubscriptions, tenantCredits } from "../shared/schema";
import { eq } from "drizzle-orm";

async function debug() {
  const [user] = await db.select().from(users).where(eq(users.email, 'abhinav@email.com')).limit(1);
  console.log('User:', user?.id, user?.email);

  if (user) {
    const [ut] = await db.select().from(userTenants).where(eq(userTenants.userId, user.id)).limit(1);
    console.log('UserTenant:', ut);
    
    if (ut) {
      const [t] = await db.select().from(tenants).where(eq(tenants.id, ut.tenantId)).limit(1);
      console.log('Tenant:', t?.id, t?.name);
      
      const [sub] = await db.select().from(tenantSubscriptions).where(eq(tenantSubscriptions.tenantId, ut.tenantId)).limit(1);
      console.log('Subscription:', sub);
      
      const [credits] = await db.select().from(tenantCredits).where(eq(tenantCredits.tenantId, ut.tenantId)).limit(1);
      console.log('Credits:', credits);
    }
  }
}

debug().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
