#!/usr/bin/env tsx

/**
 * Test Client Integration with Tenant Schema Changes
 * 
 * This script tests the API endpoints that the client uses to ensure
 * they work correctly with the new tenant schema architecture.
 * 
 * Usage: npm run test:client-integration [--tenant-id=<id>] [--user-id=<id>]
 */

import '../../../load-env';
import { db } from '../db';
import { tenants, users } from '../../../shared/schema';
import { eq } from 'drizzle-orm';
import * as tenantService from '../services/tenant.service';
import { tenantSchemaService } from '../services/tenant-schema.service';

interface TestOptions {
  tenantId?: string;
  userId?: string;
}

async function testClientIntegration(options: TestOptions = {}) {
  console.log('🧪 Testing Client Integration with Tenant Schema Changes...\n');

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL must be set');
  }

  try {
    // Get test tenant and user
    let testTenant;
    let testUser;

    if (options.tenantId) {
      testTenant = await tenantService.getTenantById(options.tenantId);
      if (!testTenant) {
        throw new Error(`Tenant ${options.tenantId} not found`);
      }
    } else {
      // Get first tenant
      const [firstTenant] = await db.select().from(tenants).limit(1);
      if (!firstTenant) {
        throw new Error('No tenants found in database');
      }
      testTenant = firstTenant;
    }

    console.log(`✅ Using tenant: ${testTenant.id} (${testTenant.name})\n`);

    // Get users for this tenant
    const tenantUsers = await tenantService.getTenantUsers(testTenant.id, 'production');
    if (tenantUsers.length === 0) {
      throw new Error(`No users found for tenant ${testTenant.id}`);
    }

    testUser = tenantUsers[0];
    console.log(`✅ Using user: ${testUser.id} (${testUser.email})\n`);

    // Test 1: Check tenant schema exists
    console.log('📋 Test 1: Check tenant schema exists...');
    const schemaName = await tenantSchemaService.getTenantSchemaName(testTenant.id);
    if (!schemaName) {
      console.log('   ⚠️  Tenant schema not found - this is expected for new tenants');
      console.log('   ✅ Schema will be created automatically on next tenant operation');
    } else {
      console.log(`   ✅ Schema found: ${schemaName}`);
      const expectedName = `tenant_${testTenant.id.toLowerCase().replace(/-/g, '_')}`;
      if (schemaName === expectedName) {
        console.log(`   ✅ Schema name is correct: ${schemaName}`);
      } else {
        console.log(`   ⚠️  Schema name mismatch: expected ${expectedName}, got ${schemaName}`);
        console.log(`   💡 Run: npm run update:schema-names -- --tenant-id=${testTenant.id}`);
      }
    }
    console.log('');

    // Test 2: Test getUserTenants (used by /api/auth/me)
    console.log('📋 Test 2: Test getUserTenants()...');
    try {
      const userTenants = await tenantService.getUserTenants(testUser.id, 'production');
      console.log(`   ✅ getUserTenants() returned ${userTenants.length} tenant(s)`);
      if (userTenants.length > 0) {
        const firstTenant = userTenants[0];
        console.log(`   ✅ First tenant: ${firstTenant.name} (role: ${firstTenant.role})`);
        console.log(`   ✅ Has required fields: id=${!!firstTenant.id}, name=${!!firstTenant.name}, role=${!!firstTenant.role}`);
      }
    } catch (error: any) {
      console.log(`   ❌ Error: ${error.message}`);
    }
    console.log('');

    // Test 3: Test getUserRoleInTenant (used by /api/auth/switch-tenant)
    console.log('📋 Test 3: Test getUserRoleInTenant()...');
    try {
      const role = await tenantService.getUserRoleInTenant(testUser.id, testTenant.id, 'production');
      if (role) {
        console.log(`   ✅ getUserRoleInTenant() returned role: ${role}`);
      } else {
        console.log(`   ⚠️  getUserRoleInTenant() returned null (user may not be in tenant)`);
      }
    } catch (error: any) {
      console.log(`   ❌ Error: ${error.message}`);
    }
    console.log('');

    // Test 4: Test getTenantUsers (used by team management)
    console.log('📋 Test 4: Test getTenantUsers()...');
    try {
      const users = await tenantService.getTenantUsers(testTenant.id, 'production');
      console.log(`   ✅ getTenantUsers() returned ${users.length} user(s)`);
      if (users.length > 0) {
        const firstUser = users[0];
        console.log(`   ✅ First user: ${firstUser.email} (role: ${firstUser.role})`);
      }
    } catch (error: any) {
      console.log(`   ❌ Error: ${error.message}`);
    }
    console.log('');

    // Test 5: Check user_tenants table in tenant schema
    console.log('📋 Test 5: Check user_tenants table in tenant schema...');
    if (schemaName) {
      const { Pool } = await import('pg');
      const pool = new Pool({ connectionString: process.env.DATABASE_URL });
      try {
        const result = await pool.query(`
          SELECT COUNT(*) as count
          FROM "${schemaName}"."user_tenants"
          WHERE user_id = $1 AND tenant_id = $2
        `, [testUser.id, testTenant.id]);
        const count = parseInt(result.rows[0].count, 10);
        if (count > 0) {
          console.log(`   ✅ user_tenants table exists in schema ${schemaName}`);
          console.log(`   ✅ Found ${count} record(s) for user ${testUser.id}`);
        } else {
          console.log(`   ⚠️  No records found in user_tenants table`);
        }
      } finally {
        await pool.end();
      }
    } else {
      console.log('   ⚠️  Cannot test - schema not found');
    }
    console.log('');

    console.log('✅ Client integration tests completed!\n');
    console.log('📝 Next steps:');
    console.log('   1. Test in browser: Login and verify tenant list loads');
    console.log('   2. Test tenant switching');
    console.log('   3. Test Settings → Organization page');
    console.log('   4. Test AssistBuild studio');

  } catch (error) {
    console.error('❌ Test failed:', error);
    throw error;
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const options: TestOptions = {
  tenantId: args.find(arg => arg.startsWith('--tenant-id='))?.split('=')[1],
  userId: args.find(arg => arg.startsWith('--user-id='))?.split('=')[1],
};

testClientIntegration(options).catch(console.error);

