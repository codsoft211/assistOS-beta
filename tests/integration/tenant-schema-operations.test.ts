/**
 * Integration Tests: Tenant Schema Operations
 * 
 * Tests critical business operations with tenant schemas
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { db } from '../../apps/api/db';
import { tenants } from '../../shared/schema';
import { tenantSchemaService } from '../../apps/api/services/tenant-schema.service';
import { 
  selectFromTenantTable,
  selectOneFromTenantTable,
  insertIntoTenantTable,
  updateTenantTable,
  deleteFromTenantTable,
  tenantTableExists
} from '../../apps/api/utils/tenant-db-helper';
import { sql } from 'drizzle-orm';

describe('Tenant Schema Operations', () => {
  let testTenantId: string;
  let testSchemaName: string;

  beforeAll(async () => {
    // Create test tenant
    const [tenant] = await db.insert(tenants).values({
      name: 'Test Tenant',
      slug: `test-tenant-${Date.now()}`,
      country: 'PT',
      currency: 'EUR',
      timezone: 'Europe/Lisbon',
    }).returning();

    testTenantId = tenant.id;

    // Create tenant schema
    testSchemaName = await tenantSchemaService.createTenantSchema(testTenantId);
    
    // Create test table
    await tenantSchemaService.executeInTenantSchema(testTenantId, [
      `CREATE TABLE IF NOT EXISTS ${testSchemaName}.test_table (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id VARCHAR NOT NULL,
        name VARCHAR(255),
        status VARCHAR(50),
        amount DECIMAL(19, 4),
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )`
    ]);
  });

  afterAll(async () => {
    // Cleanup: Drop schema
    await tenantSchemaService.dropTenantSchema(testTenantId);
    
    // Delete tenant
    await db.delete(tenants).where(sql`id = ${testTenantId}`);
  });

  describe('Schema Management', () => {
    it('should create tenant schema', async () => {
      expect(testSchemaName).toBeDefined();
      expect(testSchemaName).toMatch(/^tenant_/);
    });

    it('should resolve tenant schema name', async () => {
      const schemaName = await tenantSchemaService.getTenantSchemaName(testTenantId);
      expect(schemaName).toBe(testSchemaName);
    });

    it('should check if table exists', async () => {
      const exists = await tenantTableExists(testTenantId, 'test_table');
      expect(exists).toBe(true);
    });

    it('should return false for non-existent table', async () => {
      const exists = await tenantTableExists(testTenantId, 'non_existent_table');
      expect(exists).toBe(false);
    });
  });

  describe('CRUD Operations', () => {
    let testRecordId: string;

    it('should INSERT record into tenant schema', async () => {
      const result = await insertIntoTenantTable(testTenantId, 'test_table', {
        tenant_id: testTenantId,
        name: 'Test Record',
        status: 'active',
        amount: 100.50,
        created_at: new Date(),
        updated_at: new Date(),
      });

      expect(result).toBeDefined();
      expect(result.name).toBe('Test Record');
      expect(result.status).toBe('active');
      
      testRecordId = result.id;
    });

    it('should SELECT records from tenant schema', async () => {
      const results = await selectFromTenantTable(
        testTenantId,
        'test_table',
        sql`tenant_id = ${testTenantId}`
      );

      expect(results).toBeInstanceOf(Array);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].name).toBe('Test Record');
    });

    it('should SELECT ONE record from tenant schema', async () => {
      const result = await selectOneFromTenantTable(
        testTenantId,
        'test_table',
        sql`id = ${testRecordId}`
      );

      expect(result).toBeDefined();
      expect(result.id).toBe(testRecordId);
      expect(result.name).toBe('Test Record');
    });

    it('should UPDATE record in tenant schema', async () => {
      const result = await updateTenantTable(
        testTenantId,
        'test_table',
        { status: 'inactive', amount: 200.75 },
        sql`id = ${testRecordId}`
      );

      expect(result).toBeDefined();
      expect(result.status).toBe('inactive');
      expect(Number(result.amount)).toBe(200.75);
    });

    it('should DELETE record from tenant schema', async () => {
      const deletedCount = await deleteFromTenantTable(
        testTenantId,
        'test_table',
        sql`id = ${testRecordId}`
      );

      expect(deletedCount).toBe(1);

      // Verify deletion
      const result = await selectOneFromTenantTable(
        testTenantId,
        'test_table',
        sql`id = ${testRecordId}`
      );

      expect(result).toBeNull();
    });
  });

  describe('Data Isolation', () => {
    it('should isolate data between tenants', async () => {
      // Create another test tenant
      const [tenant2] = await db.insert(tenants).values({
        name: 'Test Tenant 2',
        slug: `test-tenant-2-${Date.now()}`,
        country: 'PT',
        currency: 'EUR',
        timezone: 'Europe/Lisbon',
      }).returning();

      const tenant2Schema = await tenantSchemaService.createTenantSchema(tenant2.id);

      // Create same table in tenant2's schema
      await tenantSchemaService.executeInTenantSchema(tenant2.id, [
        `CREATE TABLE IF NOT EXISTS ${tenant2Schema}.test_table (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id VARCHAR NOT NULL,
          name VARCHAR(255),
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        )`
      ]);

      // Insert record in tenant1
      const record1 = await insertIntoTenantTable(testTenantId, 'test_table', {
        tenant_id: testTenantId,
        name: 'Tenant 1 Record',
        created_at: new Date(),
      });

      // Insert record in tenant2
      const record2 = await insertIntoTenantTable(tenant2.id, 'test_table', {
        tenant_id: tenant2.id,
        name: 'Tenant 2 Record',
        created_at: new Date(),
      });

      // Verify tenant1 can only see their data
      const tenant1Records = await selectFromTenantTable(
        testTenantId,
        'test_table',
        sql`tenant_id = ${testTenantId}`
      );

      expect(tenant1Records.every((r: any) => r.tenant_id === testTenantId)).toBe(true);
      expect(tenant1Records.some((r: any) => r.id === record2.id)).toBe(false);

      // Verify tenant2 can only see their data
      const tenant2Records = await selectFromTenantTable(
        tenant2.id,
        'test_table',
        sql`tenant_id = ${tenant2.id}`
      );

      expect(tenant2Records.every((r: any) => r.tenant_id === tenant2.id)).toBe(true);
      expect(tenant2Records.some((r: any) => r.id === record1.id)).toBe(false);

      // Cleanup tenant2
      await tenantSchemaService.dropTenantSchema(tenant2.id);
      await db.delete(tenants).where(sql`id = ${tenant2.id}`);
    });
  });

  describe('Critical Business Operations', () => {
    beforeAll(async () => {
      // Create company_info table
      await tenantSchemaService.executeInTenantSchema(testTenantId, [
        `CREATE TABLE IF NOT EXISTS ${testSchemaName}.company_info (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id VARCHAR NOT NULL,
          name VARCHAR(255),
          nif VARCHAR(50),
          email VARCHAR(255),
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        )`
      ]);
    });

    it('should create company_info in tenant schema', async () => {
      const company = await insertIntoTenantTable(testTenantId, 'company_info', {
        tenant_id: testTenantId,
        name: 'Test Company',
        nif: '123456789',
        email: 'test@example.com',
        created_at: new Date(),
        updated_at: new Date(),
      });

      expect(company).toBeDefined();
      expect(company.name).toBe('Test Company');
      expect(company.nif).toBe('123456789');
    });

    it('should retrieve company_info from tenant schema', async () => {
      const company = await selectOneFromTenantTable(
        testTenantId,
        'company_info',
        sql`tenant_id = ${testTenantId}`
      );

      expect(company).toBeDefined();
      expect(company.name).toBe('Test Company');
    });

    it('should update company_info in tenant schema', async () => {
      const updated = await updateTenantTable(
        testTenantId,
        'company_info',
        { email: 'updated@example.com' },
        sql`tenant_id = ${testTenantId}`
      );

      expect(updated.email).toBe('updated@example.com');
    });
  });

  describe('Error Handling', () => {
    it('should throw error for non-existent tenant', async () => {
      await expect(
        selectFromTenantTable('non-existent-tenant-id', 'test_table')
      ).rejects.toThrow('No schema found');
    });

    it('should throw error for missing WHERE clause in UPDATE', async () => {
      await expect(
        updateTenantTable(testTenantId, 'test_table', { name: 'test' }, null as any)
      ).rejects.toThrow('WHERE clause is required');
    });

    it('should throw error for missing WHERE clause in DELETE', async () => {
      await expect(
        deleteFromTenantTable(testTenantId, 'test_table', null as any)
      ).rejects.toThrow('WHERE clause is required');
    });
  });
});

describe('Module Query Builder Integration', () => {
  let testTenantId: string;

  beforeAll(async () => {
    // Create test tenant with Financial module tables
    const [tenant] = await db.insert(tenants).values({
      name: 'Module Test Tenant',
      slug: `module-test-${Date.now()}`,
      country: 'PT',
      currency: 'EUR',
      timezone: 'Europe/Lisbon',
    }).returning();

    testTenantId = tenant.id;

    const schemaName = await tenantSchemaService.createTenantSchema(testTenantId);

    // Create invoices table
    await tenantSchemaService.executeInTenantSchema(testTenantId, [
      `CREATE TABLE IF NOT EXISTS ${schemaName}.invoices (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id VARCHAR NOT NULL,
        invoice_number VARCHAR(50),
        client_name VARCHAR(255),
        total_amount DECIMAL(19, 4),
        status VARCHAR(50),
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )`
    ]);
  });

  afterAll(async () => {
    await tenantSchemaService.dropTenantSchema(testTenantId);
    await db.delete(tenants).where(sql`id = ${testTenantId}`);
  });

  it('should create invoice in tenant schema', async () => {
    const invoice = await insertIntoTenantTable(testTenantId, 'invoices', {
      tenant_id: testTenantId,
      invoice_number: 'INV-0001',
      client_name: 'Test Client',
      total_amount: 1500.00,
      status: 'paid',
      created_at: new Date(),
      updated_at: new Date(),
    });

    expect(invoice).toBeDefined();
    expect(invoice.invoice_number).toBe('INV-0001');
  });

  it('should query invoices from tenant schema', async () => {
    const invoices = await selectFromTenantTable(
      testTenantId,
      'invoices',
      sql`status = 'paid'`
    );

    expect(invoices).toBeInstanceOf(Array);
    expect(invoices.length).toBeGreaterThan(0);
    expect(invoices[0].status).toBe('paid');
  });
});

