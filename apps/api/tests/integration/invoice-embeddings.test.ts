// Sprint 1 - Task 1.3.4: Invoice Embeddings Integration Test
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { db } from '../../db';
import { tenants, suppliers, purchasingInvoices, invoiceEmbeddings } from '@shared/schema';
import { embeddingService } from '../../services/embedding.service';
import { eq, and } from 'drizzle-orm';

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

describe('Invoice Embeddings Integration', () => {
  let tenantId: string;
  let supplierId: string;
  let invoiceId: string;

  beforeAll(async () => {
    const [t] = await db.insert(tenants).values({
      name: 'Test Tenant',
      slug: 'invoice-test-' + Date.now(),
      nif: '333333333',
      address: 'Test',
      city: 'Test',
      country: 'PT'
    }).returning();
    tenantId = t.id;

    const [s] = await db.insert(suppliers).values({
      tenantId,
      code: 'SUPI' + Date.now(),
      name: 'Test Supplier',
      taxId: '444444444',
      category: 'services'
    }).returning();
    supplierId = s.id;

    const [i] = await db.insert(purchasingInvoices).values({
      tenantId,
      supplierId,
      code: 'INV' + Date.now(),
      invoiceDate: new Date(),
      submissionSource: 'manual',
      subtotal: '1000.00',
      taxTotal: '230.00',
      totalAmount: '1230.00'
    }).returning();
    invoiceId = i.id;
  });

  afterAll(async () => {
    await db.delete(invoiceEmbeddings).where(eq(invoiceEmbeddings.tenantId, tenantId));
    await db.delete(purchasingInvoices).where(eq(purchasingInvoices.tenantId, tenantId));
    await db.delete(suppliers).where(eq(suppliers.tenantId, tenantId));
    await db.delete(tenants).where(eq(tenants.id, tenantId));
  });

  it('should insert invoice embedding', async () => {
    await embeddingService.generateInvoiceEmbedding(invoiceId, tenantId);

    const rows = await db
      .select()
      .from(invoiceEmbeddings)
      .where(and(
        eq(invoiceEmbeddings.invoiceId, invoiceId),
        eq(invoiceEmbeddings.tenantId, tenantId)
      ));

    expect(rows).toHaveLength(1);
    expect(rows[0].embedding).toHaveLength(1536);
  });

  it('should upsert on duplicate', async () => {
    await embeddingService.generateInvoiceEmbedding(invoiceId, tenantId);
    const [first] = await db.select().from(invoiceEmbeddings).where(eq(invoiceEmbeddings.invoiceId, invoiceId));

    await new Promise(r => setTimeout(r, 50));
    await embeddingService.generateInvoiceEmbedding(invoiceId, tenantId);

    const rows = await db.select().from(invoiceEmbeddings).where(eq(invoiceEmbeddings.invoiceId, invoiceId));
    expect(rows).toHaveLength(1);
    expect(new Date(rows[0].updatedAt).getTime()).toBeGreaterThan(new Date(first.updatedAt).getTime());
  });
});
