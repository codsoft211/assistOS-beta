import '../load-env';
import { db } from '../apps/api/db';
import { tenantCredits, tenants } from '../shared/schema';
import { eq } from 'drizzle-orm';

async function main() {
  const tenantId = '2e37ec81-d926-4fba-a05c-a934d8fa6fd8';
  
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  const [credits] = await db.select().from(tenantCredits).where(eq(tenantCredits.tenantId, tenantId)).limit(1);
  
  if (tenant) {
    console.log('Tenant:', tenant.name);
    console.log('Tenant ID:', tenant.id);
  }
  
  if (credits) {
    const totalBalance = (credits.monthlyCredits || 0) + (credits.packageCredits || 0);
    console.log('\nCredit Balance:');
    console.log('  Monthly Credits:', credits.monthlyCredits);
    console.log('  Package Credits:', credits.packageCredits);
    console.log('  Total Balance:', totalBalance, 'créditos');
    console.log('  Reserved:', credits.reserved);
    console.log('  Lifetime Usage:', credits.lifetimeUsage);
    console.log('  Lifetime Purchases:', credits.lifetimePurchases);
    console.log('\n  Value: €' + (totalBalance * 0.10).toFixed(2));
  } else {
    console.log('No credits found for this tenant');
  }
}

main().catch(console.error);
