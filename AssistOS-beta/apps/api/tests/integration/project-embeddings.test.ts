// Sprint 1 - Task 1.3.4: Project Embeddings Integration Test
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { db } from '../../db';
import { tenants, users, projects, projectEmbeddings } from '@shared/schema';
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

describe('Project Embeddings Integration', () => {
  let tenantId: string;
  let userId: string;
  let projectId: string;

  beforeAll(async () => {
    const [t] = await db.insert(tenants).values({
      name: 'Test Tenant',
      slug: 'project-test-' + Date.now(),
      nif: '555555555',
      address: 'Test',
      city: 'Test',
      country: 'PT'
    }).returning();
    tenantId = t.id;

    const [u] = await db.insert(users).values({
      email: 'test-project-' + Date.now() + '@example.com',
      firstName: 'Test',
      lastName: 'User'
    }).returning();
    userId = u.id;

    const [p] = await db.insert(projects).values({
      tenantId,
      name: 'Test Project',
      description: 'Test description',
      status: 'active',
      clientName: 'Test Client',
      projectCode: 'PROJ-' + Date.now(),
      createdBy: userId
    }).returning();
    projectId = p.id;
  });

  afterAll(async () => {
    await db.delete(projectEmbeddings).where(eq(projectEmbeddings.tenantId, tenantId));
    await db.delete(projects).where(eq(projects.tenantId, tenantId));
    await db.delete(tenants).where(eq(tenants.id, tenantId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it('should insert project embedding', async () => {
    await embeddingService.generateProjectEmbedding(projectId, tenantId);

    const rows = await db
      .select()
      .from(projectEmbeddings)
      .where(and(
        eq(projectEmbeddings.projectId, projectId),
        eq(projectEmbeddings.tenantId, tenantId)
      ));

    expect(rows).toHaveLength(1);
    expect(rows[0].embedding).toHaveLength(1536);
  });

  it('should upsert on duplicate', async () => {
    await embeddingService.generateProjectEmbedding(projectId, tenantId);
    const [first] = await db.select().from(projectEmbeddings).where(eq(projectEmbeddings.projectId, projectId));

    await new Promise(r => setTimeout(r, 50));
    await embeddingService.generateProjectEmbedding(projectId, tenantId);

    const rows = await db.select().from(projectEmbeddings).where(eq(projectEmbeddings.projectId, projectId));
    expect(rows).toHaveLength(1);
    expect(new Date(rows[0].updatedAt).getTime()).toBeGreaterThan(new Date(first.updatedAt).getTime());
  });
});
