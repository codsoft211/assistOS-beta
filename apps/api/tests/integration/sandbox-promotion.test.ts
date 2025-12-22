import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { db } from '../../db';
import { clients, suppliers, promotionLogs, tenants } from '../../../../shared/schema';
import { SandboxPromotionService } from '../../services/sandbox-promotion.service';
import { ENVIRONMENTS } from '../../../../shared/types/environment';
import { eq, and, sql } from 'drizzle-orm';
import type { PromotionManifest } from '../../types/promotion.types';

describe('Sandbox Promotion Integration Tests', () => {
  const promotionService = new SandboxPromotionService();
  
  const testTenantId = 'test-tenant-promotion';
  const testUserId = 'test-user-promotion';
  
  beforeAll(async () => {
    // Clean up any existing test data
    await db.delete(promotionLogs).where(eq(promotionLogs.tenantId, testTenantId));
    await db.delete(clients).where(eq(clients.tenantId, testTenantId));
    await db.delete(suppliers).where(eq(suppliers.tenantId, testTenantId));
    await db.delete(tenants).where(eq(tenants.id, testTenantId));
  });
  
  afterAll(async () => {
    // Clean up test data in reverse order (FK constraints)
    await db.delete(promotionLogs).where(eq(promotionLogs.tenantId, testTenantId));
    await db.delete(clients).where(eq(clients.tenantId, testTenantId));
    await db.delete(suppliers).where(eq(suppliers.tenantId, testTenantId));
    await db.delete(tenants).where(eq(tenants.id, testTenantId));
  });
  
  beforeEach(async () => {
    // Clean up before each test
    await db.delete(promotionLogs).where(eq(promotionLogs.tenantId, testTenantId));
    await db.delete(clients).where(eq(clients.tenantId, testTenantId));
    await db.delete(suppliers).where(eq(suppliers.tenantId, testTenantId));
    await db.delete(tenants).where(eq(tenants.id, testTenantId));
    
    // STEP 1: Create test tenant FIRST
    await db.insert(tenants).values({
      id: testTenantId,
      name: 'Test Tenant Promotion',
      slug: 'test-tenant-promotion',
      country: 'PT',
    });
  });
  
  afterEach(async () => {
    // Clean up in reverse order (FK constraints)
    await db.delete(promotionLogs).where(eq(promotionLogs.tenantId, testTenantId));
    await db.delete(clients).where(eq(clients.tenantId, testTenantId));
    await db.delete(suppliers).where(eq(suppliers.tenantId, testTenantId));
    await db.delete(tenants).where(eq(tenants.id, testTenantId));
  });
  
  describe('Snapshot', () => {
    it('should snapshot sandbox records', async () => {
      // Create test records in sandbox
      const [sandboxClient] = await db.insert(clients).values({
        id: 'client-sandbox-1',
        tenantId: testTenantId,
        environment: ENVIRONMENTS.SANDBOX,
        name: 'Test Client Sandbox',
        email: 'sandbox@example.com',
        nif: '123456789',
      }).returning();
      
      // Create manifest
      const manifest: PromotionManifest = {
        tenantId: testTenantId,
        environment: ENVIRONMENTS.SANDBOX,
        entities: [
          {
            tableName: 'clients',
            recordIds: [sandboxClient.id],
          },
        ],
        createdAt: new Date(),
        createdBy: testUserId,
      };
      
      // Snapshot records
      const recordsMap = await promotionService.snapshot(manifest);
      
      // Verify snapshot
      expect(recordsMap.size).toBe(1);
      expect(recordsMap.has('clients')).toBe(true);
      
      const clientRecords = recordsMap.get('clients') || [];
      expect(clientRecords.length).toBe(1);
      expect(clientRecords[0].id).toBe(sandboxClient.id);
      expect(clientRecords[0].environment).toBe(ENVIRONMENTS.SANDBOX);
    });
    
    it('should only snapshot records from specified environment', async () => {
      // Create records in both environments
      const [sandboxClient] = await db.insert(clients).values({
        id: 'client-sandbox-2',
        tenantId: testTenantId,
        environment: ENVIRONMENTS.SANDBOX,
        name: 'Sandbox Client',
        email: 'sandbox@example.com',
        nif: '123456789',
      }).returning();
      
      await db.insert(clients).values({
        id: 'client-production-1',
        tenantId: testTenantId,
        environment: ENVIRONMENTS.PRODUCTION,
        name: 'Production Client',
        email: 'prod@example.com',
        nif: '987654321',
      });
      
      // Manifest requests both IDs but only sandbox environment
      const manifest: PromotionManifest = {
        tenantId: testTenantId,
        environment: ENVIRONMENTS.SANDBOX,
        entities: [
          {
            tableName: 'clients',
            recordIds: ['client-sandbox-2', 'client-production-1'],
          },
        ],
        createdAt: new Date(),
        createdBy: testUserId,
      };
      
      // Snapshot records
      const recordsMap = await promotionService.snapshot(manifest);
      
      // Verify only sandbox record is returned
      const clientRecords = recordsMap.get('clients') || [];
      expect(clientRecords.length).toBe(1);
      expect(clientRecords[0].id).toBe('client-sandbox-2');
    });
  });
  
  describe('Diff', () => {
    it('should identify new records that do not exist in production', async () => {
      // Create sandbox record
      const [sandboxClient] = await db.insert(clients).values({
        id: 'client-diff-1',
        tenantId: testTenantId,
        environment: ENVIRONMENTS.SANDBOX,
        name: 'New Client',
        email: 'new@example.com',
        nif: '111111111',
      }).returning();
      
      // Snapshot records
      const recordsMap = new Map([
        ['clients', [sandboxClient]],
      ]);
      
      // Diff against production
      const newRecordsMap = await promotionService.diff(recordsMap, testTenantId);
      
      // Verify new record is identified
      const newClients = newRecordsMap.get('clients') || [];
      expect(newClients.length).toBe(1);
      expect(newClients[0].id).toBe('client-diff-1');
    });
    
    it('should skip records that already exist in production', async () => {
      // Create record in sandbox and then simulate it existing in production
      // Note: Due to PK constraint on id alone, we use UPDATE to change environment
      const sharedId = 'client-existing';
      
      const [sandboxClient] = await db.insert(clients).values({
        id: sharedId,
        tenantId: testTenantId,
        environment: ENVIRONMENTS.SANDBOX,
        name: 'Sandbox Version',
        email: 'sandbox@example.com',
        nif: '222222222',
      }).returning();
      
      // Manually update to production to simulate it already being promoted
      await db.execute(sql`
        UPDATE clients 
        SET environment = ${ENVIRONMENTS.PRODUCTION}, name = 'Production Version'
        WHERE id = ${sharedId}
      `);
      
      // Create the record data as if it came from sandbox snapshot
      const recordsMap = new Map([
        ['clients', [{ ...sandboxClient, name: 'Sandbox Version' }]],
      ]);
      
      // Diff against production
      const newRecordsMap = await promotionService.diff(recordsMap, testTenantId);
      
      // Verify existing record is skipped
      const newClients = newRecordsMap.get('clients') || [];
      expect(newClients.length).toBe(0);
    });
  });
  
  describe('Dedupe', () => {
    it('should remove duplicate records with same ID', async () => {
      const duplicateRecord = {
        id: 'duplicate-client',
        tenantId: testTenantId,
        environment: ENVIRONMENTS.SANDBOX,
        name: 'Duplicate',
      };
      
      const recordsMap = new Map([
        ['clients', [
          duplicateRecord,
          duplicateRecord,
          { ...duplicateRecord, id: 'unique-client' },
        ]],
      ]);
      
      // Dedupe
      const dedupedMap = await promotionService.dedupe(recordsMap);
      
      // Verify duplicates removed
      const dedupedClients = dedupedMap.get('clients') || [];
      expect(dedupedClients.length).toBe(2);
      
      const ids = dedupedClients.map(c => c.id);
      expect(ids).toContain('duplicate-client');
      expect(ids).toContain('unique-client');
    });
  });
  
  describe('Apply', () => {
    it('should insert records into production with environment=production', async () => {
      // Create sandbox record
      const [sandboxClient] = await db.insert(clients).values({
        id: 'client-apply-1',
        tenantId: testTenantId,
        environment: ENVIRONMENTS.SANDBOX,
        name: 'Apply Test Client',
        email: 'apply@example.com',
        nif: '333333333',
      }).returning();
      
      // Apply to production
      const recordsMap = new Map([
        ['clients', [sandboxClient]],
      ]);
      
      const result = await promotionService.apply(recordsMap, testTenantId);
      
      // Verify success
      expect(result.success).toBe(true);
      expect(result.promotedCount).toBe(1);
      
      // Verify production record exists
      const productionClient = await db.query.clients.findFirst({
        where: and(
          eq(clients.id, 'client-apply-1'),
          eq(clients.environment, ENVIRONMENTS.PRODUCTION)
        ),
      });
      
      expect(productionClient).toBeDefined();
      expect(productionClient!.environment).toBe(ENVIRONMENTS.PRODUCTION);
      expect(productionClient!.name).toBe('Apply Test Client');
    });
  });
  
  describe('Promote (E2E)', () => {
    it('should execute full promotion workflow and create audit log', async () => {
      // Create sandbox record
      const [sandboxClient] = await db.insert(clients).values({
        id: 'client-e2e-1',
        tenantId: testTenantId,
        environment: ENVIRONMENTS.SANDBOX,
        name: 'E2E Test Client',
        email: 'e2e@example.com',
        nif: '444444444',
      }).returning();
      
      // Create manifest
      const manifest: PromotionManifest = {
        tenantId: testTenantId,
        environment: ENVIRONMENTS.SANDBOX,
        entities: [
          {
            tableName: 'clients',
            recordIds: [sandboxClient.id],
          },
        ],
        createdAt: new Date(),
        createdBy: testUserId,
      };
      
      // Execute full promotion
      const result = await promotionService.promote(manifest);
      
      // Verify result
      expect(result.success).toBe(true);
      expect(result.promotedCount).toBe(1);
      expect(result.auditLogId).toBeDefined();
      
      // Verify production record exists
      const productionClient = await db.query.clients.findFirst({
        where: and(
          eq(clients.id, sandboxClient.id),
          eq(clients.environment, ENVIRONMENTS.PRODUCTION)
        ),
      });
      
      expect(productionClient).toBeDefined();
      
      // Verify audit log created
      const auditLog = await db.query.promotionLogs.findFirst({
        where: eq(promotionLogs.id, result.auditLogId!),
      });
      
      expect(auditLog).toBeDefined();
      expect(auditLog!.tenantId).toBe(testTenantId);
      expect(auditLog!.status).toBe('completed');
    });
    
    it('should reject promotion from production environment', async () => {
      // Try to promote from production
      const manifest: PromotionManifest = {
        tenantId: testTenantId,
        environment: ENVIRONMENTS.PRODUCTION,
        entities: [
          {
            tableName: 'clients',
            recordIds: ['some-id'],
          },
        ],
        createdAt: new Date(),
        createdBy: testUserId,
      };
      
      const result = await promotionService.promote(manifest);
      
      // Verify rejection
      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0]).toContain('sandbox');
    });
  });
});
