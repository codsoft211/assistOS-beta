import '../load-env';
import { db } from '../apps/api/db';
import { tenants, userTenants, users } from '../shared/schema';
import { eq, like } from 'drizzle-orm';

async function main() {
  // Find Google tenant
  const googleTenants = await db
    .select()
    .from(tenants)
    .where(like(tenants.name, '%Google%'));
  
  console.log('Google tenants found:', googleTenants.length);
  
  for (const tenant of googleTenants) {
    console.log(`\n- Tenant ID: ${tenant.id}`);
    console.log(`  Name: ${tenant.name}`);
    console.log(`  Country: ${tenant.country}`);
    console.log(`  Currency: ${tenant.currency}`);
    
    // Find users associated with this tenant
    const members = await db
      .select({
        userId: userTenants.userId,
        role: userTenants.role,
        environment: userTenants.environment,
      })
      .from(userTenants)
      .where(eq(userTenants.tenantId, tenant.id));
    
    console.log(`  Members: ${members.length}`);
    for (const member of members) {
      const [user] = await db.select().from(users).where(eq(users.id, member.userId)).limit(1);
      if (user) {
        console.log(`    - ${user.email} (${member.role}, ${member.environment})`);
      }
    }
  }
}

main().catch(console.error);
