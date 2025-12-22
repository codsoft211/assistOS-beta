import '../load-env';
import { db } from '../apps/api/db';
import { subscriptionPlans } from '../shared/schema';

async function main() {
  const plans = await db.select().from(subscriptionPlans);
  console.log('Available subscription plans:');
  plans.forEach(plan => {
    console.log(`  - ID: ${plan.id}, Name: ${plan.name}, Price Model: ${plan.priceModel}`);
  });
}

main().catch(console.error);
