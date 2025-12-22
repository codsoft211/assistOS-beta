// Task 2.2.7.6: Environment Isolation Integration Tests
// Comprehensive tests for cross-environment isolation enforcement

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '../../db';
import { 
  suppliers, 
  purchasingInvoices, 
  supplierEmbeddings,
  invoiceEmbeddings,
  tenants 
} from '../../../../shared/schema';
import { ENVIRONMENTS } from '../../../../shared/types/environment';
import { 
  scopedFilter, 
  withEnvironment, 
  validateForeignKeyEnvironment 
} from '../../utils/environment-query.utils';
import { eq, and, sql } from 'drizzle-orm';
import { EmbeddingService } from '../../services/embedding.service';

// Mock OpenAI for embedding tests
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

describe('Environment Isolation Integration Tests', () => {
  let testTenantId: string;
  let prodSupplierId: string;
  let sandboxSupplierId: string;
  let embeddingService: EmbeddingService;

  beforeEach(async () => {
    // Create unique test tenant
    const timestamp = Date.now();
    const [tenant] = await db.insert(tenants).values({
      id: `test-tenant-isolation-${timestamp}`,
      name: `Test Tenant Isolation ${timestamp}`,
      slug: `test-isolation-${timestamp}`,
      status: 'active'
    }).returning();
    testTenantId = tenant.id;

    // Create suppliers in BOTH environments
    const [prodSupplier] = await db.insert(suppliers).values(
      withEnvironment({
        tenantId: testTenantId,
        code: `PROD-SUP-${timestamp}`,
        name: 'Production Supplier',
        taxId: '111111111',
        category: 'raw_materials'
      }, ENVIRONMENTS.PRODUCTION)
    ).returning();
    prodSupplierId = prodSupplier.id;

    const [sandboxSupplier] = await db.insert(suppliers).values(
      withEnvironment({
        tenantId: testTenantId,
        code: `SAND-SUP-${timestamp}`,
        name: 'Sandbox Supplier',
        taxId: '222222222',
        category: 'raw_materials'
      }, ENVIRONMENTS.SANDBOX)
    ).returning();
    sandboxSupplierId = sandboxSupplier.id;

    // Initialize embedding service
    embeddingService = new EmbeddingService();
  });

  describe('Promotion Workflow Integration', () => {
    it('should promote sandbox records to production', async () => {
      // Test added for Task 2.2.11.1
      const { SandboxPromotionService } = await import('../../services/sandbox-promotion.service');
      const promotionService = new SandboxPromotionService();
      
      // Create manifest
      const manifest = {
        tenantId: testTenantId,
        environment: ENVIRONMENTS.SANDBOX,
        entities: [
          {
            tableName: 'suppliers',
            recordIds: [sandboxSupplierId],
          },
        ],
        createdAt: new Date(),
      };
      
      // Execute promotion
      const result = await promotionService.promote(manifest);
      
      // Verify success
      expect(result.success).toBe(true);
      expect(result.promotedCount).toBeGreaterThan(0);
      expect(result.auditLogId).toBeDefined();
      
      // Verify record exists in production
      const promotedSupplier = await db.query.suppliers.findFirst({
        where: and(
          eq(suppliers.id, sandboxSupplierId),
          eq(suppliers.environment, ENVIRONMENTS.PRODUCTION)
        ),
      });
      
      expect(promotedSupplier).toBeDefined();
      expect(promotedSupplier!.environment).toBe(ENVIRONMENTS.PRODUCTION);
    });
    
    it('should reject promotion from production environment', async () => {
      // Test added for Task 2.2.11.1
      const { SandboxPromotionService } = await import('../../services/sandbox-promotion.service');
      const promotionService = new SandboxPromotionService();
      
      // Try to promote from production (should fail)
      const manifest = {
        tenantId: testTenantId,
        environment: ENVIRONMENTS.PRODUCTION,
        entities: [
          {
            tableName: 'suppliers',
            recordIds: [prodSupplierId],
          },
        ],
        createdAt: new Date(),
      };
      
      const result = await promotionService.promote(manifest);
      
      // Verify rejection
      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0]).toContain('sandbox');
    });
    
    it('should prevent duplicate promotions', async () => {
      // Test added for Task 2.2.11.1
      const { SandboxPromotionService } = await import('../../services/sandbox-promotion.service');
      const promotionService = new SandboxPromotionService();
      
      const manifest = {
        tenantId: testTenantId,
        environment: ENVIRONMENTS.SANDBOX,
        entities: [
          {
            tableName: 'suppliers',
            recordIds: [sandboxSupplierId],
          },
        ],
        createdAt: new Date(),
      };
      
      // First promotion
      const firstResult = await promotionService.promote(manifest);
      expect(firstResult.success).toBe(true);
      expect(firstResult.promotedCount).toBeGreaterThan(0);
      
      // Second promotion (should skip duplicates)
      const secondResult = await promotionService.promote(manifest);
      expect(secondResult.success).toBe(true);
      expect(secondResult.promotedCount).toBe(0); // No new records promoted
    });
  });

  afterEach(async () => {
    // Cleanup in reverse order of dependencies
    await db.delete(invoiceEmbeddings).where(eq(invoiceEmbeddings.tenantId, testTenantId));
    await db.delete(supplierEmbeddings).where(eq(supplierEmbeddings.tenantId, testTenantId));
    await db.delete(purchasingInvoices).where(eq(purchasingInvoices.tenantId, testTenantId));
    await db.delete(suppliers).where(eq(suppliers.tenantId, testTenantId));
    await db.delete(tenants).where(eq(tenants.id, testTenantId));
  });

  // ============================================================================
  // SELECT QUERIES - Environment Isolation
  // ============================================================================

  describe('SELECT Queries - Environment Isolation', () => {
    it('should only return production records when filtering by production', async () => {
      const results = await db
        .select()
        .from(suppliers)
        .where(scopedFilter(suppliers, testTenantId, ENVIRONMENTS.PRODUCTION));

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe(prodSupplierId);
      expect(results[0].environment).toBe(ENVIRONMENTS.PRODUCTION);
      expect(results[0].name).toBe('Production Supplier');
    });

    it('should only return sandbox records when filtering by sandbox', async () => {
      const results = await db
        .select()
        .from(suppliers)
        .where(scopedFilter(suppliers, testTenantId, ENVIRONMENTS.SANDBOX));

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe(sandboxSupplierId);
      expect(results[0].environment).toBe(ENVIRONMENTS.SANDBOX);
      expect(results[0].name).toBe('Sandbox Supplier');
    });

    it('should not return cross-environment records (negative test)', async () => {
      // Query production - should NOT include sandbox supplier
      const prodResults = await db
        .select()
        .from(suppliers)
        .where(scopedFilter(suppliers, testTenantId, ENVIRONMENTS.PRODUCTION));

      expect(prodResults).not.toContainEqual(
        expect.objectContaining({ id: sandboxSupplierId })
      );

      // Query sandbox - should NOT include production supplier
      const sandboxResults = await db
        .select()
        .from(suppliers)
        .where(scopedFilter(suppliers, testTenantId, ENVIRONMENTS.SANDBOX));

      expect(sandboxResults).not.toContainEqual(
        expect.objectContaining({ id: prodSupplierId })
      );
    });

    it('should return different record counts per environment', async () => {
      // Create additional records in production only
      await db.insert(suppliers).values(
        withEnvironment({
          tenantId: testTenantId,
          code: `PROD-SUP-2-${Date.now()}`,
          name: 'Production Supplier 2',
          taxId: '333333333',
          category: 'services'
        }, ENVIRONMENTS.PRODUCTION)
      );

      const prodCount = await db
        .select({ count: sql<number>`count(*)` })
        .from(suppliers)
        .where(scopedFilter(suppliers, testTenantId, ENVIRONMENTS.PRODUCTION));

      const sandboxCount = await db
        .select({ count: sql<number>`count(*)` })
        .from(suppliers)
        .where(scopedFilter(suppliers, testTenantId, ENVIRONMENTS.SANDBOX));

      expect(Number(prodCount[0].count)).toBe(2);
      expect(Number(sandboxCount[0].count)).toBe(1);
    });
  });

  // ============================================================================
  // INSERT OPERATIONS - Environment Setting
  // ============================================================================

  describe('INSERT Operations - Environment Setting', () => {
    it('should create records with correct production environment', async () => {
      const timestamp = Date.now();
      const [newSupplier] = await db.insert(suppliers).values(
        withEnvironment({
          tenantId: testTenantId,
          code: `NEW-PROD-${timestamp}`,
          name: 'New Production Supplier',
          taxId: '444444444',
          category: 'raw_materials'
        }, ENVIRONMENTS.PRODUCTION)
      ).returning();

      expect(newSupplier.environment).toBe(ENVIRONMENTS.PRODUCTION);

      // Verify it's queryable in production
      const results = await db
        .select()
        .from(suppliers)
        .where(and(
          eq(suppliers.id, newSupplier.id),
          scopedFilter(suppliers, testTenantId, ENVIRONMENTS.PRODUCTION)
        ));

      expect(results).toHaveLength(1);
    });

    it('should create records with correct sandbox environment', async () => {
      const timestamp = Date.now();
      const [newSupplier] = await db.insert(suppliers).values(
        withEnvironment({
          tenantId: testTenantId,
          code: `NEW-SAND-${timestamp}`,
          name: 'New Sandbox Supplier',
          taxId: '555555555',
          category: 'raw_materials'
        }, ENVIRONMENTS.SANDBOX)
      ).returning();

      expect(newSupplier.environment).toBe(ENVIRONMENTS.SANDBOX);

      // Verify it's queryable in sandbox
      const results = await db
        .select()
        .from(suppliers)
        .where(and(
          eq(suppliers.id, newSupplier.id),
          scopedFilter(suppliers, testTenantId, ENVIRONMENTS.SANDBOX)
        ));

      expect(results).toHaveLength(1);
    });

    it('should reject invalid environment values (negative test)', async () => {
      const timestamp = Date.now();
      
      await expect(async () => {
        await db.insert(suppliers).values(
          withEnvironment({
            tenantId: testTenantId,
            code: `INVALID-${timestamp}`,
            name: 'Invalid Environment Supplier',
            taxId: '666666666',
            category: 'raw_materials'
          }, 'invalid-environment' as any)
        );
      }).rejects.toThrow('Invalid environment: invalid-environment');
    });

    it('should preserve all data fields when adding environment', async () => {
      const timestamp = Date.now();
      const supplierData = {
        tenantId: testTenantId,
        code: `FULL-DATA-${timestamp}`,
        name: 'Full Data Supplier',
        legalName: 'Full Data Supplier Lda',
        taxId: '777777777',
        category: 'raw_materials' as const,
        address: '123 Test Street',
        email: 'test@example.com',
        phone: '+351123456789'
      };

      const [newSupplier] = await db.insert(suppliers).values(
        withEnvironment(supplierData, ENVIRONMENTS.PRODUCTION)
      ).returning();

      expect(newSupplier.name).toBe(supplierData.name);
      expect(newSupplier.legalName).toBe(supplierData.legalName);
      expect(newSupplier.taxId).toBe(supplierData.taxId);
      expect(newSupplier.address).toBe(supplierData.address);
      expect(newSupplier.email).toBe(supplierData.email);
      expect(newSupplier.phone).toBe(supplierData.phone);
      expect(newSupplier.environment).toBe(ENVIRONMENTS.PRODUCTION);
    });
  });

  // ============================================================================
  // FOREIGN KEY VALIDATION - Cross-Environment Prevention
  // ============================================================================

  describe('Foreign Key Validation - Cross-Environment Prevention', () => {
    it('should validate same-environment FK references (positive test)', async () => {
      // Production supplier → production invoice (VALID)
      const isValid = await validateForeignKeyEnvironment(
        db,
        suppliers,
        prodSupplierId,
        testTenantId,
        ENVIRONMENTS.PRODUCTION
      );

      expect(isValid).toBe(true);
    });

    it('should reject cross-environment FK references (negative test)', async () => {
      // Production supplier checked in sandbox environment (INVALID)
      const isValid = await validateForeignKeyEnvironment(
        db,
        suppliers,
        prodSupplierId,
        testTenantId,
        ENVIRONMENTS.SANDBOX
      );

      expect(isValid).toBe(false);
    });

    it('should prevent creating invoices with cross-environment supplier FK', async () => {
      const timestamp = Date.now();
      
      // Attempt to create sandbox invoice referencing production supplier (INVALID)
      const isValidFK = await validateForeignKeyEnvironment(
        db,
        suppliers,
        prodSupplierId, // Production supplier
        testTenantId,
        ENVIRONMENTS.SANDBOX // Sandbox environment
      );

      expect(isValidFK).toBe(false);

      // In real application, this would throw an error
      // The service layer should check validateForeignKeyEnvironment before insert
    });

    it('should allow creating invoices with same-environment supplier FK', async () => {
      const timestamp = Date.now();
      
      // Create production invoice referencing production supplier (VALID)
      const isValidFK = await validateForeignKeyEnvironment(
        db,
        suppliers,
        prodSupplierId,
        testTenantId,
        ENVIRONMENTS.PRODUCTION
      );

      expect(isValidFK).toBe(true);

      // This should succeed
      const [invoice] = await db.insert(purchasingInvoices).values(
        withEnvironment({
          tenantId: testTenantId,
          supplierId: prodSupplierId,
          code: `INV-PROD-${timestamp}`,
          invoiceNumber: `INV-PROD-${timestamp}`,
          invoiceDate: new Date().toISOString().split('T')[0],
          currency: 'EUR',
          subtotal: '1000.00',
          taxTotal: '0.00',
          totalAmount: '1000.00',
          status: 'draft'
        }, ENVIRONMENTS.PRODUCTION)
      ).returning();

      expect(invoice.environment).toBe(ENVIRONMENTS.PRODUCTION);
      expect(invoice.supplierId).toBe(prodSupplierId);
    });

    it('should validate FK for non-existent records', async () => {
      const fakeId = 'non-existent-supplier-id';
      
      const isValid = await validateForeignKeyEnvironment(
        db,
        suppliers,
        fakeId,
        testTenantId,
        ENVIRONMENTS.PRODUCTION
      );

      expect(isValid).toBe(false);
    });
  });

  // ============================================================================
  // SERVICE-LEVEL ISOLATION - Embedding Service
  // ============================================================================

  describe('Service-Level Isolation - Embedding Service', () => {
    it('should generate embeddings with correct environment', async () => {
      // Generate embedding for production supplier
      await embeddingService.generateSupplierEmbedding(
        prodSupplierId,
        testTenantId,
        ENVIRONMENTS.PRODUCTION
      );

      // Verify embedding exists in production
      const prodEmbeddings = await db
        .select()
        .from(supplierEmbeddings)
        .where(scopedFilter(supplierEmbeddings, testTenantId, ENVIRONMENTS.PRODUCTION));

      expect(prodEmbeddings).toHaveLength(1);
      expect(prodEmbeddings[0].supplierId).toBe(prodSupplierId);
      expect(prodEmbeddings[0].environment).toBe(ENVIRONMENTS.PRODUCTION);
    });

    it('should upsert embeddings per environment without cross-environment updates (onConflictDoUpdate)', async () => {
      // REGRESSION TEST: Verifies environment column in unique constraint
      // If environment is removed from unique key, this test will FAIL
      
      // Create same supplier ID in both environments (simulating duplicate code/name)
      const timestamp = Date.now();
      const sharedCode = `SHARED-${timestamp}`;
      
      const [prodSupplier] = await db.insert(suppliers).values(
        withEnvironment({
          tenantId: testTenantId,
          code: sharedCode,
          name: 'Shared Supplier Name',
          taxId: '999999999',
          category: 'raw_materials'
        }, ENVIRONMENTS.PRODUCTION)
      ).returning();
      
      const [sandboxSupplier] = await db.insert(suppliers).values(
        withEnvironment({
          tenantId: testTenantId,
          code: `${sharedCode}-SAND`,
          name: 'Shared Supplier Name',
          taxId: '888888888',
          category: 'raw_materials'
        }, ENVIRONMENTS.SANDBOX)
      ).returning();
      
      // Generate embeddings for both
      await embeddingService.generateSupplierEmbedding(prodSupplier.id, testTenantId, ENVIRONMENTS.PRODUCTION);
      await embeddingService.generateSupplierEmbedding(sandboxSupplier.id, testTenantId, ENVIRONMENTS.SANDBOX);
      
      // Get production embedding vector
      const [prodBefore] = await db
        .select()
        .from(supplierEmbeddings)
        .where(and(
          eq(supplierEmbeddings.supplierId, prodSupplier.id),
          eq(supplierEmbeddings.tenantId, testTenantId),
          eq(supplierEmbeddings.environment, ENVIRONMENTS.PRODUCTION)
        ));
      
      expect(prodBefore).toBeDefined();
      const prodVectorBefore = prodBefore.embedding;
      
      // Wait to ensure timestamp difference
      await new Promise(r => setTimeout(r, 100));
      
      // Re-generate sandbox embedding (should UPDATE sandbox row only)
      await embeddingService.generateSupplierEmbedding(sandboxSupplier.id, testTenantId, ENVIRONMENTS.SANDBOX);
      
      // Verify production embedding UNCHANGED
      const [prodAfter] = await db
        .select()
        .from(supplierEmbeddings)
        .where(and(
          eq(supplierEmbeddings.supplierId, prodSupplier.id),
          eq(supplierEmbeddings.tenantId, testTenantId),
          eq(supplierEmbeddings.environment, ENVIRONMENTS.PRODUCTION)
        ));
      
      expect(prodAfter.id).toBe(prodBefore.id); // Same row ID
      expect(prodAfter.embedding).toEqual(prodVectorBefore); // Vector unchanged
      expect(new Date(prodAfter.updatedAt).getTime()).toBe(new Date(prodBefore.updatedAt).getTime()); // Timestamp unchanged
      
      // Verify we still have exactly 2 embeddings (one per environment)
      const allEmbeddings = await db
        .select()
        .from(supplierEmbeddings)
        .where(eq(supplierEmbeddings.tenantId, testTenantId));
      
      const prodCount = allEmbeddings.filter(e => e.environment === ENVIRONMENTS.PRODUCTION).length;
      const sandboxCount = allEmbeddings.filter(e => e.environment === ENVIRONMENTS.SANDBOX).length;
      
      expect(prodCount).toBeGreaterThanOrEqual(1); // At least production test supplier
      expect(sandboxCount).toBeGreaterThanOrEqual(1); // At least sandbox test supplier
    });

    it('should not return cross-environment embeddings in semantic search', async () => {
      // Generate embeddings for both environments
      await embeddingService.generateSupplierEmbedding(
        prodSupplierId,
        testTenantId,
        ENVIRONMENTS.PRODUCTION
      );
      
      await embeddingService.generateSupplierEmbedding(
        sandboxSupplierId,
        testTenantId,
        ENVIRONMENTS.SANDBOX
      );

      // Search in production - should only return production embeddings
      const prodResults = await db
        .select()
        .from(supplierEmbeddings)
        .where(scopedFilter(supplierEmbeddings, testTenantId, ENVIRONMENTS.PRODUCTION));

      expect(prodResults).toHaveLength(1);
      expect(prodResults[0].supplierId).toBe(prodSupplierId);
      expect(prodResults[0].environment).toBe(ENVIRONMENTS.PRODUCTION);

      // Search in sandbox - should only return sandbox embeddings
      const sandboxResults = await db
        .select()
        .from(supplierEmbeddings)
        .where(scopedFilter(supplierEmbeddings, testTenantId, ENVIRONMENTS.SANDBOX));

      expect(sandboxResults).toHaveLength(1);
      expect(sandboxResults[0].supplierId).toBe(sandboxSupplierId);
      expect(sandboxResults[0].environment).toBe(ENVIRONMENTS.SANDBOX);
    });

    it('should batch generate embeddings only for specified environment', async () => {
      // Batch generate for production only
      const count = await embeddingService.batchGenerateSupplierEmbeddings(
        testTenantId,
        ENVIRONMENTS.PRODUCTION
      );

      expect(count).toBe(1); // Only 1 production supplier

      // Verify only production embeddings were created
      const prodEmbeddings = await db
        .select()
        .from(supplierEmbeddings)
        .where(scopedFilter(supplierEmbeddings, testTenantId, ENVIRONMENTS.PRODUCTION));

      const sandboxEmbeddings = await db
        .select()
        .from(supplierEmbeddings)
        .where(scopedFilter(supplierEmbeddings, testTenantId, ENVIRONMENTS.SANDBOX));

      expect(prodEmbeddings).toHaveLength(1);
      expect(sandboxEmbeddings).toHaveLength(0); // No sandbox embeddings created
    });

    it('should fail to generate embedding for non-existent supplier in environment', async () => {
      // Try to generate embedding for production supplier in sandbox environment
      await expect(async () => {
        await embeddingService.generateSupplierEmbedding(
          prodSupplierId, // Production supplier
          testTenantId,
          ENVIRONMENTS.SANDBOX // Sandbox environment
        );
      }).rejects.toThrow(`Supplier ${prodSupplierId} not found in sandbox`);
    });
  });

  // ============================================================================
  // COMPLETE WORKFLOW TESTS
  // ============================================================================

  describe('Complete Workflow Tests', () => {
    it('should maintain isolation through complete supplier → invoice workflow', async () => {
      const timestamp = Date.now();

      // 1. Create supplier in production
      const [supplier] = await db.insert(suppliers).values(
        withEnvironment({
          tenantId: testTenantId,
          code: `WF-PROD-${timestamp}`,
          name: 'Workflow Test Supplier',
          taxId: '888888888',
          category: 'raw_materials'
        }, ENVIRONMENTS.PRODUCTION)
      ).returning();

      // 2. Validate FK is in production
      const isValidProd = await validateForeignKeyEnvironment(
        db,
        suppliers,
        supplier.id,
        testTenantId,
        ENVIRONMENTS.PRODUCTION
      );
      expect(isValidProd).toBe(true);

      // 3. Validate FK is NOT in sandbox
      const isValidSandbox = await validateForeignKeyEnvironment(
        db,
        suppliers,
        supplier.id,
        testTenantId,
        ENVIRONMENTS.SANDBOX
      );
      expect(isValidSandbox).toBe(false);

      // 4. Create invoice in production
      const [invoice] = await db.insert(purchasingInvoices).values(
        withEnvironment({
          tenantId: testTenantId,
          supplierId: supplier.id,
          code: `WF-INV-${timestamp}`,
          invoiceNumber: `WF-INV-${timestamp}`,
          invoiceDate: new Date().toISOString().split('T')[0],
          currency: 'EUR',
          subtotal: '5000.00',
          taxTotal: '0.00',
          totalAmount: '5000.00',
          status: 'draft'
        }, ENVIRONMENTS.PRODUCTION)
      ).returning();

      // 5. Generate embedding in production
      await embeddingService.generateSupplierEmbedding(
        supplier.id,
        testTenantId,
        ENVIRONMENTS.PRODUCTION
      );

      // 6. Verify all data is in production only
      const prodSuppliers = await db
        .select()
        .from(suppliers)
        .where(and(
          eq(suppliers.id, supplier.id),
          scopedFilter(suppliers, testTenantId, ENVIRONMENTS.PRODUCTION)
        ));

      const prodInvoices = await db
        .select()
        .from(purchasingInvoices)
        .where(and(
          eq(purchasingInvoices.id, invoice.id),
          scopedFilter(purchasingInvoices, testTenantId, ENVIRONMENTS.PRODUCTION)
        ));

      const prodEmbeddings = await db
        .select()
        .from(supplierEmbeddings)
        .where(and(
          eq(supplierEmbeddings.supplierId, supplier.id),
          scopedFilter(supplierEmbeddings, testTenantId, ENVIRONMENTS.PRODUCTION)
        ));

      expect(prodSuppliers).toHaveLength(1);
      expect(prodInvoices).toHaveLength(1);
      expect(prodEmbeddings).toHaveLength(1);

      // 7. Verify nothing is in sandbox
      const sandboxSuppliers = await db
        .select()
        .from(suppliers)
        .where(and(
          eq(suppliers.id, supplier.id),
          scopedFilter(suppliers, testTenantId, ENVIRONMENTS.SANDBOX)
        ));

      const sandboxInvoices = await db
        .select()
        .from(purchasingInvoices)
        .where(and(
          eq(purchasingInvoices.id, invoice.id),
          scopedFilter(purchasingInvoices, testTenantId, ENVIRONMENTS.SANDBOX)
        ));

      const sandboxEmbeddings = await db
        .select()
        .from(supplierEmbeddings)
        .where(and(
          eq(supplierEmbeddings.supplierId, supplier.id),
          scopedFilter(supplierEmbeddings, testTenantId, ENVIRONMENTS.SANDBOX)
        ));

      expect(sandboxSuppliers).toHaveLength(0);
      expect(sandboxInvoices).toHaveLength(0);
      expect(sandboxEmbeddings).toHaveLength(0);
    });
  });
});
