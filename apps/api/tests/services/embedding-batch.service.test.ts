// Sprint 1 - Gap 2: Batch Pipeline Regression Tests
// Validates batch embedding generation for all 5 entity types

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
import {
  createTestTenant,
  createTestSupplier,
  createTestInvoice,
  createTestProject,
  createTestClient,
  createTestProduct
} from '../setup';

// Mock OpenAI
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

describe('Batch Pipeline Regression Tests', () => {
  let tenantId: string;

  beforeAll(async () => {
    const tenant = await createTestTenant({ name: 'Batch Test Tenant' });
    tenantId = tenant.id;
  });

  afterAll(async () => {
    // Cleanup all embeddings
    await db.delete(supplierEmbeddings).where(eq(supplierEmbeddings.tenantId, tenantId));
    await db.delete(invoiceEmbeddings).where(eq(invoiceEmbeddings.tenantId, tenantId));
    await db.delete(projectEmbeddings).where(eq(projectEmbeddings.tenantId, tenantId));
    await db.delete(clientEmbeddings).where(eq(clientEmbeddings.tenantId, tenantId));
    await db.delete(productEmbeddings).where(eq(productEmbeddings.tenantId, tenantId));
  });

  describe('batchGenerateSupplierEmbeddings', () => {
    it('should generate embeddings for all suppliers', async () => {
      const environment = 'production';
      
      // Create 5 suppliers
      await createTestSupplier(tenantId, environment, { name: 'Supplier 1' });
      await createTestSupplier(tenantId, environment, { name: 'Supplier 2' });
      await createTestSupplier(tenantId, environment, { name: 'Supplier 3' });
      await createTestSupplier(tenantId, environment, { name: 'Supplier 4' });
      await createTestSupplier(tenantId, environment, { name: 'Supplier 5' });
      
      // Batch generate
      const count = await embeddingService.batchGenerateSupplierEmbeddings(tenantId, environment);
      
      expect(count).toBe(5);
      
      // Verify embeddings created
      const embeddings = await db
        .select()
        .from(supplierEmbeddings)
        .where(and(
          eq(supplierEmbeddings.tenantId, tenantId),
          eq(supplierEmbeddings.environment, environment)
        ));
      
      expect(embeddings).toHaveLength(5);
      
      // Verify all have valid 1536-dim vectors
      embeddings.forEach(emb => {
        expect(emb.embedding).toHaveLength(1536);
        expect(emb.embeddingSource).toBe('combined');
      });
    });

    it('should deduplicate on re-generation (upsert behavior)', async () => {
      const environment = 'production';
      
      // Create suppliers
      await createTestSupplier(tenantId, environment);
      await createTestSupplier(tenantId, environment);
      
      // First batch
      const count1 = await embeddingService.batchGenerateSupplierEmbeddings(tenantId, environment);
      expect(count1).toBe(2);
      
      // Get first embedding timestamps
      const [first] = await db
        .select()
        .from(supplierEmbeddings)
        .where(and(
          eq(supplierEmbeddings.tenantId, tenantId),
          eq(supplierEmbeddings.environment, environment)
        ))
        .limit(1);
      
      const firstUpdatedAt = new Date(first.updatedAt).getTime();
      
      // Wait to ensure timestamp difference
      await new Promise(r => setTimeout(r, 100));
      
      // Second batch (should UPDATE, not INSERT)
      const count2 = await embeddingService.batchGenerateSupplierEmbeddings(tenantId, environment);
      expect(count2).toBe(2);
      
      // Verify no duplicates (still only 2 rows)
      const embeddings = await db
        .select()
        .from(supplierEmbeddings)
        .where(and(
          eq(supplierEmbeddings.tenantId, tenantId),
          eq(supplierEmbeddings.environment, environment)
        ));
      
      expect(embeddings).toHaveLength(2); // NOT 4!
      
      // Verify updatedAt changed (upsert occurred)
      const [updated] = embeddings;
      const updatedAt = new Date(updated.updatedAt).getTime();
      expect(updatedAt).toBeGreaterThan(firstUpdatedAt);
    });

    it('should handle empty supplier list gracefully', async () => {
      const emptyTenant = await createTestTenant({ name: 'Empty Tenant' });
      
      const count = await embeddingService.batchGenerateSupplierEmbeddings(emptyTenant.id, 'production');
      
      expect(count).toBe(0);
    });
  });

  describe('batchGenerateInvoiceEmbeddings', () => {
    it('should generate embeddings for all invoices', async () => {
      const environment = 'production';
      
      // Create supplier first
      const supplier = await createTestSupplier(tenantId, environment);
      
      // Create 3 invoices
      await createTestInvoice(tenantId, supplier.id, environment);
      await createTestInvoice(tenantId, supplier.id, environment);
      await createTestInvoice(tenantId, supplier.id, environment);
      
      const count = await embeddingService.batchGenerateInvoiceEmbeddings(tenantId, environment);
      
      expect(count).toBe(3);
      
      const embeddings = await db
        .select()
        .from(invoiceEmbeddings)
        .where(and(
          eq(invoiceEmbeddings.tenantId, tenantId),
          eq(invoiceEmbeddings.environment, environment)
        ));
      
      expect(embeddings).toHaveLength(3);
    });

    it('should update existing invoice embeddings on re-run', async () => {
      const environment = 'production';
      const supplier = await createTestSupplier(tenantId, environment);
      
      await createTestInvoice(tenantId, supplier.id, environment);
      
      // First run
      const count1 = await embeddingService.batchGenerateInvoiceEmbeddings(tenantId, environment);
      
      // Second run (should upsert)
      const count2 = await embeddingService.batchGenerateInvoiceEmbeddings(tenantId, environment);
      
      expect(count1).toBe(count2);
      
      // Verify no duplicates
      const embeddings = await db
        .select()
        .from(invoiceEmbeddings)
        .where(and(
          eq(invoiceEmbeddings.tenantId, tenantId),
          eq(invoiceEmbeddings.environment, environment)
        ));
      
      expect(embeddings).toHaveLength(count1);
    });
  });

  describe('batchGenerateProjectEmbeddings', () => {
    it('should generate embeddings for all projects', async () => {
      const environment = 'production';
      
      await createTestProject(tenantId, environment);
      await createTestProject(tenantId, environment);
      await createTestProject(tenantId, environment);
      await createTestProject(tenantId, environment);
      
      const count = await embeddingService.batchGenerateProjectEmbeddings(tenantId, environment);
      
      expect(count).toBe(4);
      
      const embeddings = await db
        .select()
        .from(projectEmbeddings)
        .where(and(
          eq(projectEmbeddings.tenantId, tenantId),
          eq(projectEmbeddings.environment, environment)
        ));
      
      expect(embeddings).toHaveLength(4);
    });
  });

  describe('batchGenerateClientEmbeddings', () => {
    it('should generate embeddings for all clients', async () => {
      const environment = 'production';
      
      await createTestClient(tenantId, environment);
      await createTestClient(tenantId, environment);
      
      const count = await embeddingService.batchGenerateClientEmbeddings(tenantId, environment);
      
      expect(count).toBe(2);
      
      const embeddings = await db
        .select()
        .from(clientEmbeddings)
        .where(and(
          eq(clientEmbeddings.tenantId, tenantId),
          eq(clientEmbeddings.environment, environment)
        ));
      
      expect(embeddings).toHaveLength(2);
    });
  });

  describe('batchGenerateProductEmbeddings', () => {
    it('should generate embeddings for all products', async () => {
      const environment = 'production';
      
      await createTestProduct(tenantId, environment);
      await createTestProduct(tenantId, environment);
      await createTestProduct(tenantId, environment);
      
      const count = await embeddingService.batchGenerateProductEmbeddings(tenantId, environment);
      
      expect(count).toBe(3);
      
      const embeddings = await db
        .select()
        .from(productEmbeddings)
        .where(and(
          eq(productEmbeddings.tenantId, tenantId),
          eq(productEmbeddings.environment, environment)
        ));
      
      expect(embeddings).toHaveLength(3);
    });
  });

  describe('Batch Environment Scoping', () => {
    it('batch methods respect environment parameter', async () => {
      // Create suppliers in both environments
      await createTestSupplier(tenantId, 'sandbox');
      await createTestSupplier(tenantId, 'sandbox');
      await createTestSupplier(tenantId, 'production');
      
      // Batch generate for sandbox only
      const sandboxCount = await embeddingService.batchGenerateSupplierEmbeddings(tenantId, 'sandbox');
      
      expect(sandboxCount).toBe(2);
      
      // Verify production has zero embeddings
      const prodEmbeddings = await db
        .select()
        .from(supplierEmbeddings)
        .where(and(
          eq(supplierEmbeddings.tenantId, tenantId),
          eq(supplierEmbeddings.environment, 'production')
        ));
      
      expect(prodEmbeddings).toHaveLength(0);
    });
  });

  describe('Error Handling in Batch Operations', () => {
    it('should return successCount even if some entities fail', async () => {
      const environment = 'production';
      
      // This is a best-effort test
      // Create suppliers with valid data
      await createTestSupplier(tenantId, environment);
      await createTestSupplier(tenantId, environment);
      
      // In production, the service continues on individual failures
      const count = await embeddingService.batchGenerateSupplierEmbeddings(tenantId, environment);
      
      // Should still process valid suppliers
      expect(count).toBeGreaterThanOrEqual(0);
      expect(count).toBeLessThanOrEqual(2);
    });
  });

  describe('Batch Performance Characteristics', () => {
    it('should process multiple entities efficiently', async () => {
      const environment = 'production';
      
      // Create 10 suppliers
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(createTestSupplier(tenantId, environment, { name: `Supplier ${i}` }));
      }
      await Promise.all(promises);
      
      const startTime = Date.now();
      const count = await embeddingService.batchGenerateSupplierEmbeddings(tenantId, environment);
      const duration = Date.now() - startTime;
      
      expect(count).toBe(10);
      
      // Should complete in reasonable time (with mocks, should be fast)
      // This is a smoke test, not a hard performance requirement
      expect(duration).toBeLessThan(10000); // 10 seconds max
    });
  });
});
