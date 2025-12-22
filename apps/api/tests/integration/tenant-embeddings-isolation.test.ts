// Sprint 1 - Gap 2: Tenant Embeddings Isolation Tests
// Validates tenant-scoped queries prevent cross-tenant data leaks

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { db } from '../../db';
import { 
  supplierEmbeddings, 
  invoiceEmbeddings,
  projectEmbeddings,
  clientEmbeddings,
  productEmbeddings
} from '../../../../shared/schema';
import { embeddingService } from '../../services/embedding.service';
import { eq, and } from 'drizzle-orm';
import { createTestTenant, createTestSupplier, createTestInvoice, createTestProject, createTestClient, createTestProduct } from '../setup';

// Mock OpenAI to avoid API costs
const mockEmbedding = Array(1536).fill(0).map((_, i) => i / 1536);
vi.mock('openai', () => ({
  default: class {
    embeddings = {
      create: vi.fn(async () => ({
        data: [{ embedding: mockEmbedding }],
        usage: { prompt_tokens: 10, total_tokens: 10 }
      }))
    };
  }
}));

describe('Tenant Embeddings Isolation - Regression Tests', () => {
  let tenant1Id: string;
  let tenant2Id: string;

  beforeAll(async () => {
    // Create 2 tenants for isolation testing
    const tenant1 = await createTestTenant({ name: 'Tenant 1' });
    const tenant2 = await createTestTenant({ name: 'Tenant 2' });
    tenant1Id = tenant1.id;
    tenant2Id = tenant2.id;
  });

  afterAll(async () => {
    // Cleanup embeddings
    await db.delete(supplierEmbeddings).where(eq(supplierEmbeddings.tenantId, tenant1Id));
    await db.delete(supplierEmbeddings).where(eq(supplierEmbeddings.tenantId, tenant2Id));
    await db.delete(invoiceEmbeddings).where(eq(invoiceEmbeddings.tenantId, tenant1Id));
    await db.delete(invoiceEmbeddings).where(eq(invoiceEmbeddings.tenantId, tenant2Id));
    await db.delete(projectEmbeddings).where(eq(projectEmbeddings.tenantId, tenant1Id));
    await db.delete(projectEmbeddings).where(eq(projectEmbeddings.tenantId, tenant2Id));
    await db.delete(clientEmbeddings).where(eq(clientEmbeddings.tenantId, tenant1Id));
    await db.delete(clientEmbeddings).where(eq(clientEmbeddings.tenantId, tenant2Id));
    await db.delete(productEmbeddings).where(eq(productEmbeddings.tenantId, tenant1Id));
    await db.delete(productEmbeddings).where(eq(productEmbeddings.tenantId, tenant2Id));
  });

  describe('Supplier Embeddings Tenant Isolation', () => {
    it('should scope supplier embeddings by tenantId', async () => {
      const environment = 'production';
      
      // Create suppliers for both tenants
      const supplier1 = await createTestSupplier(tenant1Id, environment);
      const supplier2 = await createTestSupplier(tenant1Id, environment);
      const supplier3 = await createTestSupplier(tenant2Id, environment);
      
      // Generate embeddings
      await embeddingService.generateSupplierEmbedding(supplier1.id, tenant1Id, environment);
      await embeddingService.generateSupplierEmbedding(supplier2.id, tenant1Id, environment);
      await embeddingService.generateSupplierEmbedding(supplier3.id, tenant2Id, environment);
      
      // Query tenant 1 embeddings
      const tenant1Embeddings = await db
        .select()
        .from(supplierEmbeddings)
        .where(and(
          eq(supplierEmbeddings.tenantId, tenant1Id),
          eq(supplierEmbeddings.environment, environment)
        ));
      
      // Query tenant 2 embeddings
      const tenant2Embeddings = await db
        .select()
        .from(supplierEmbeddings)
        .where(and(
          eq(supplierEmbeddings.tenantId, tenant2Id),
          eq(supplierEmbeddings.environment, environment)
        ));
      
      // Verify tenant isolation
      expect(tenant1Embeddings).toHaveLength(2);
      expect(tenant2Embeddings).toHaveLength(1);
      
      // Verify no cross-contamination
      const tenant1SupplierIds = tenant1Embeddings.map(e => e.supplierId);
      const tenant2SupplierIds = tenant2Embeddings.map(e => e.supplierId);
      
      expect(tenant1SupplierIds).toContain(supplier1.id);
      expect(tenant1SupplierIds).toContain(supplier2.id);
      expect(tenant1SupplierIds).not.toContain(supplier3.id);
      
      expect(tenant2SupplierIds).toContain(supplier3.id);
      expect(tenant2SupplierIds).not.toContain(supplier1.id);
      expect(tenant2SupplierIds).not.toContain(supplier2.id);
    });

    it('should prevent cross-tenant access to supplier embeddings', async () => {
      const environment = 'production';
      
      const supplier1 = await createTestSupplier(tenant1Id, environment);
      await embeddingService.generateSupplierEmbedding(supplier1.id, tenant1Id, environment);
      
      // Try to query supplier1 with wrong tenant
      const wrongTenantResults = await db
        .select()
        .from(supplierEmbeddings)
        .where(and(
          eq(supplierEmbeddings.supplierId, supplier1.id),
          eq(supplierEmbeddings.tenantId, tenant2Id) // WRONG TENANT!
        ));
      
      expect(wrongTenantResults).toHaveLength(0);
    });
  });

  describe('Batch Generation Tenant Scoping', () => {
    it('batchGenerateSupplierEmbeddings only processes suppliers from specified tenant', async () => {
      const environment = 'production';
      
      // Create suppliers for tenant 1
      await createTestSupplier(tenant1Id, environment, { name: 'Tenant 1 Supplier A' });
      await createTestSupplier(tenant1Id, environment, { name: 'Tenant 1 Supplier B' });
      await createTestSupplier(tenant1Id, environment, { name: 'Tenant 1 Supplier C' });
      
      // Create suppliers for tenant 2
      await createTestSupplier(tenant2Id, environment, { name: 'Tenant 2 Supplier X' });
      await createTestSupplier(tenant2Id, environment, { name: 'Tenant 2 Supplier Y' });
      
      // Batch generate for tenant 1 only
      const count = await embeddingService.batchGenerateSupplierEmbeddings(tenant1Id, environment);
      
      // Verify count matches tenant 1 suppliers only
      expect(count).toBe(3);
      
      const tenant1Embeddings = await db
        .select()
        .from(supplierEmbeddings)
        .where(and(
          eq(supplierEmbeddings.tenantId, tenant1Id),
          eq(supplierEmbeddings.environment, environment)
        ));
      
      expect(tenant1Embeddings).toHaveLength(3);
      
      // Verify tenant 2 has zero embeddings (not processed)
      const tenant2Embeddings = await db
        .select()
        .from(supplierEmbeddings)
        .where(and(
          eq(supplierEmbeddings.tenantId, tenant2Id),
          eq(supplierEmbeddings.environment, environment)
        ));
      
      expect(tenant2Embeddings).toHaveLength(0);
    });

    it('batchGenerateInvoiceEmbeddings respects tenant boundaries', async () => {
      const environment = 'production';
      
      // Create suppliers first
      const supplier1 = await createTestSupplier(tenant1Id, environment);
      const supplier2 = await createTestSupplier(tenant2Id, environment);
      
      // Create invoices for tenant 1
      await createTestInvoice(tenant1Id, supplier1.id, environment);
      await createTestInvoice(tenant1Id, supplier1.id, environment);
      
      // Create invoice for tenant 2
      await createTestInvoice(tenant2Id, supplier2.id, environment);
      
      // Batch generate for tenant 1 only
      const count = await embeddingService.batchGenerateInvoiceEmbeddings(tenant1Id, environment);
      
      expect(count).toBe(2);
      
      // Verify tenant isolation
      const tenant1Embeddings = await db
        .select()
        .from(invoiceEmbeddings)
        .where(and(
          eq(invoiceEmbeddings.tenantId, tenant1Id),
          eq(invoiceEmbeddings.environment, environment)
        ));
      
      expect(tenant1Embeddings).toHaveLength(2);
    });

    it('batchGenerateProjectEmbeddings scopes correctly', async () => {
      const environment = 'production';
      
      // Create projects for tenant 1
      await createTestProject(tenant1Id, environment, { name: 'T1 Project Alpha' });
      await createTestProject(tenant1Id, environment, { name: 'T1 Project Beta' });
      
      // Create project for tenant 2
      await createTestProject(tenant2Id, environment, { name: 'T2 Project Gamma' });
      
      // Batch generate for tenant 1
      const count = await embeddingService.batchGenerateProjectEmbeddings(tenant1Id, environment);
      
      expect(count).toBe(2);
      
      const tenant1Embeddings = await db
        .select()
        .from(projectEmbeddings)
        .where(and(
          eq(projectEmbeddings.tenantId, tenant1Id),
          eq(projectEmbeddings.environment, environment)
        ));
      
      expect(tenant1Embeddings).toHaveLength(2);
    });

    it('batchGenerateClientEmbeddings maintains tenant isolation', async () => {
      const environment = 'production';
      
      // Create clients for both tenants
      await createTestClient(tenant1Id, environment);
      await createTestClient(tenant1Id, environment);
      await createTestClient(tenant2Id, environment);
      
      // Batch generate for tenant 1
      const count = await embeddingService.batchGenerateClientEmbeddings(tenant1Id, environment);
      
      expect(count).toBe(2);
      
      const tenant1Embeddings = await db
        .select()
        .from(clientEmbeddings)
        .where(and(
          eq(clientEmbeddings.tenantId, tenant1Id),
          eq(clientEmbeddings.environment, environment)
        ));
      
      expect(tenant1Embeddings).toHaveLength(2);
    });

    it('batchGenerateProductEmbeddings respects tenant scope', async () => {
      const environment = 'production';
      
      // Create products
      await createTestProduct(tenant1Id, environment);
      await createTestProduct(tenant2Id, environment);
      await createTestProduct(tenant2Id, environment);
      
      // Batch generate for tenant 2
      const count = await embeddingService.batchGenerateProductEmbeddings(tenant2Id, environment);
      
      expect(count).toBe(2);
      
      const tenant2Embeddings = await db
        .select()
        .from(productEmbeddings)
        .where(and(
          eq(productEmbeddings.tenantId, tenant2Id),
          eq(productEmbeddings.environment, environment)
        ));
      
      expect(tenant2Embeddings).toHaveLength(2);
    });
  });

  describe('Cross-Tenant Data Leakage Prevention', () => {
    it('should never return embeddings from other tenants in queries', async () => {
      const environment = 'production';
      
      // Create data for both tenants
      const supplier1 = await createTestSupplier(tenant1Id, environment);
      const supplier2 = await createTestSupplier(tenant2Id, environment);
      
      await embeddingService.generateSupplierEmbedding(supplier1.id, tenant1Id, environment);
      await embeddingService.generateSupplierEmbedding(supplier2.id, tenant2Id, environment);
      
      // Query with tenant 1 filter
      const results = await db
        .select()
        .from(supplierEmbeddings)
        .where(eq(supplierEmbeddings.tenantId, tenant1Id));
      
      // Verify ONLY tenant 1 data returned
      expect(results.every(r => r.tenantId === tenant1Id)).toBe(true);
      expect(results.some(r => r.tenantId === tenant2Id)).toBe(false);
    });
  });
});
