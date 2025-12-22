import '../load-env';
import { db } from '../apps/api/db';
import { subscriptionPlans, users, userTenants } from '../shared/schema';
import { eq } from 'drizzle-orm';

async function main() {
  // Check plans
  const plans = await db.select().from(subscriptionPlans);
  console.log('Available subscription plans:');
  plans.forEach(plan => {
    console.log(`  - ID: ${plan.id}, Name: ${plan.name}`);
  });
  
  // Check user
  const [user] = await db.select().from(users).where(eq(users.email, 'johndoe@gmail.com')).limit(1);
  if (user) {
    console.log('\nUser found:', user.id);
    const memberships = await db.select().from(userTenants).where(eq(userTenants.userId, user.id));
    console.log('Tenant memberships:', memberships.length);
  }
}

main().catch(console.error);
