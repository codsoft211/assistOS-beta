// Sprint 1 - Task 1.3.4: Supplier Embeddings Integration Test
// Validates database writes, upserts, and tenant isolation

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { db } from '../../db';
import { tenants, suppliers, supplierEmbeddings } from '../../../../shared/schema';
import { embeddingService } from '../../services/embedding.service';
import { eq, and } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

// Mock OpenAI
const mockEmbedding = Array(1536).fill(0).map((_, i) => i / 1536);
vi.mock('openai', () => ({
  default: class {
    embeddings = {
      create: vi.fn(async () => ({
        data: [{ embedding: mockEmbedding }]
      }))
    };
  }
}));

describe.skip('Supplier Embeddings Integration - NEEDS UPDATE FOR ENVIRONMENT ISOLATION', () => {
  let tenant1Id: string;
  let tenant2Id: string;
  let supplier1Id: string;

  beforeAll(async () => {
    // Create 2 tenants for isolation testing
    const [t1] = await db.insert(tenants).values({
      name: 'Tenant 1',
      slug: 'tenant-1-' + Date.now(),
      nif: '111111111',
      address: 'Addr 1',
      city: 'City 1',
      country: 'PT'
    }).returning();
    tenant1Id = t1.id;

    const [t2] = await db.insert(tenants).values({
      name: 'Tenant 2',
      slug: 'tenant-2-' + Date.now(),
      nif: '222222222',
      address: 'Addr 2',
      city: 'City 2',
      country: 'PT'
    }).returning();
    tenant2Id = t2.id;

    // Create supplier for tenant 1
    const [s1] = await db.insert(suppliers).values({
      tenantId: tenant1Id,
      code: 'S001-' + Date.now(),
      name: 'Supplier One',
      taxId: '123456789',
      category: 'raw_materials'
    }).returning();
    supplier1Id = s1.id;
  });

  afterAll(async () => {
    // Cleanup
    await db.delete(supplierEmbeddings).where(eq(supplierEmbeddings.tenantId, tenant1Id));
    await db.delete(supplierEmbeddings).where(eq(supplierEmbeddings.tenantId, tenant2Id));
    await db.delete(suppliers).where(eq(suppliers.tenantId, tenant1Id));
    await db.delete(suppliers).where(eq(suppliers.tenantId, tenant2Id));
    await db.delete(tenants).where(eq(tenants.id, tenant1Id));
    await db.delete(tenants).where(eq(tenants.id, tenant2Id));
  });

  it('should insert supplier embedding into database', async () => {
    await embeddingService.generateSupplierEmbedding(supplier1Id, tenant1Id);

    const rows = await db
      .select()
      .from(supplierEmbeddings)
      .where(and(
        eq(supplierEmbeddings.supplierId, supplier1Id),
        eq(supplierEmbeddings.tenantId, tenant1Id)
      ));

    expect(rows).toHaveLength(1);
    expect(rows[0].embedding).toHaveLength(1536);
    expect(rows[0].embeddingSource).toBe('combined');
  });

  it('should upsert (not duplicate) on second call', async () => {
    // First call
    await embeddingService.generateSupplierEmbedding(supplier1Id, tenant1Id);
    const [first] = await db
      .select()
      .from(supplierEmbeddings)
      .where(and(
        eq(supplierEmbeddings.supplierId, supplier1Id),
        eq(supplierEmbeddings.tenantId, tenant1Id)
      ));

    // Wait to ensure timestamp difference
    await new Promise(r => setTimeout(r, 50));

    // Second call - should UPDATE not INSERT
    await embeddingService.generateSupplierEmbedding(supplier1Id, tenant1Id);
    
    const rows = await db
      .select()
      .from(supplierEmbeddings)
      .where(and(
        eq(supplierEmbeddings.supplierId, supplier1Id),
        eq(supplierEmbeddings.tenantId, tenant1Id)
      ));

    // Still only 1 row (not 2)
    expect(rows).toHaveLength(1);
    
    // updatedAt should be newer
    expect(new Date(rows[0].updatedAt).getTime())
      .toBeGreaterThan(new Date(first.updatedAt).getTime());
  });

  it('should enforce tenant isolation', async () => {
    await embeddingService.generateSupplierEmbedding(supplier1Id, tenant1Id);

    // Try to query with wrong tenant
    const wrongTenant = await db
      .select()
      .from(supplierEmbeddings)
      .where(and(
        eq(supplierEmbeddings.supplierId, supplier1Id),
        eq(supplierEmbeddings.tenantId, tenant2Id)
      ));

    expect(wrongTenant).toHaveLength(0);

    // Correct tenant can access
    const correctTenant = await db
      .select()
      .from(supplierEmbeddings)
      .where(and(
        eq(supplierEmbeddings.supplierId, supplier1Id),
        eq(supplierEmbeddings.tenantId, tenant1Id)
      ));

    expect(correctTenant).toHaveLength(1);
  });
});
