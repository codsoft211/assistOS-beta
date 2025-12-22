import { db, pool } from '../apps/api/db.js';
import { tenants, tenantSchemas } from '../shared/schema.js';
import { eq } from 'drizzle-orm';

console.log('\n🔧 Setting up test tenant for workflow testing...\n');
console.log('⚠️  This creates a test-only tenant schema - safe for development\n');

try {
  // 0. Create test tenant in tenants table if it doesn't exist
  console.log('1️⃣  Creating test tenant record...');
  const existingTenant = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, 'test-tenant'))
    .limit(1);

  if (existingTenant.length === 0) {
    await db.insert(tenants).values({
      id: 'test-tenant',
      name: 'Test Tenant (Workflows)',
      slug: 'test-tenant',
      email: 'test-workflows@assistos.dev',
      status: 'active',
      tier: 'free',
      environment: 'sandbox',
    });
    console.log('   ✅ Test tenant created\n');
  } else {
    console.log('   ✅ Test tenant already exists\n');
  }

  // 1. Create schema
  console.log('2️⃣  Creating test_tenant schema...');
  await pool.query(`CREATE SCHEMA IF NOT EXISTS test_tenant`);
  console.log('   ✅ Schema created\n');

  // 2. Create customers table
  console.log('3️⃣  Creating customers table...');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS test_tenant.customers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      email TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
  console.log('   ✅ Customers table created\n');

  // 2b. Create orders table
  console.log('3b️⃣ Creating orders table...');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS test_tenant.orders (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id TEXT NOT NULL,
      customer_id UUID,
      amount DECIMAL(10, 2),
      status TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
  console.log('   ✅ Orders table created\n');

  // 3. Create indexes
  console.log('4️⃣  Creating indexes...');
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_customers_tenant_id 
    ON test_tenant.customers(tenant_id)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_orders_tenant_id 
    ON test_tenant.orders(tenant_id)
  `);
  console.log('   ✅ Indexes created\n');

  // 4. Insert/update tenant schema record
  console.log('5️⃣  Registering tenant schema...');
  
  // Check if exists
  const existing = await db
    .select()
    .from(tenantSchemas)
    .where(eq(tenantSchemas.tenantId, 'test-tenant'))
    .limit(1);

  if (existing.length === 0) {
    await db.insert(tenantSchemas).values({
      tenantId: 'test-tenant',
      schemaName: 'test_tenant',
      environment: 'sandbox',
    });
    console.log('   ✅ Tenant schema registered\n');
  } else {
    console.log('   ✅ Tenant schema already exists\n');
  }

  // 5. Verify
  console.log('6️⃣  Verifying setup...');
  const [schema] = await db
    .select()
    .from(tenantSchemas)
    .where(eq(tenantSchemas.tenantId, 'test-tenant'));

  console.log('   ✅ Verified:');
  console.log(`      • Tenant: ${schema.tenantId}`);
  console.log(`      • Schema: ${schema.schemaName}`);
  console.log(`      • Environment: ${schema.environment}`);

  console.log('\n✅ Setup complete! Your app is safe.\n');
  console.log('📝 What was created:');
  console.log('   • Test tenant record (test-tenant)');
  console.log('   • Isolated schema (test_tenant)');
  console.log('   • Sample customers & orders tables\n');
  console.log('▶️  Next: Restart worker and run tests:');
  console.log('   npm run worker');
  console.log('   npm run test:workflows\n');

} catch (error) {
  console.error('\n❌ Setup failed:', error);
  process.exit(1);
} finally {
  await pool.end();
}
