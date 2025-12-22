import '../load-env';
import { db } from '../apps/api/db';
import { users, userTenants, tenants } from '../shared/schema';
import { eq } from 'drizzle-orm';

async function main() {
  const email = 'johndoe@gmail.com';
  
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) {
    console.log('User not found');
    return;
  }
  
  console.log('User ID:', user.id);
  console.log('User Name:', `${user.firstName} ${user.lastName}`);
  
  const memberships = await db
    .select({
      tenantId: userTenants.tenantId,
      environment: userTenants.environment,
      role: userTenants.role,
    })
    .from(userTenants)
    .where(eq(userTenants.userId, user.id));
  
  console.log('\nTenant memberships:', memberships.length);
  
  for (const membership of memberships) {
    const [tenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.id, membership.tenantId))
      .limit(1);
    
    if (tenant) {
      console.log(`\n- Tenant ID: ${tenant.id}`);
      console.log(`  Name: ${tenant.name}`);
      console.log(`  Country: ${tenant.country}`);
      console.log(`  Currency: ${tenant.currency}`);
      console.log(`  Timezone: ${tenant.timezone}`);
      console.log(`  Environment: ${membership.environment}`);
      console.log(`  Role: ${membership.role}`);
    }
  }
}

main().catch(console.error);
