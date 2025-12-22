import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { schemaEvolutionService } from '../../services/schema-evolution.service';
import { db } from '../../db';
import { schemaVersions, tenants, users, migrations } from '@shared/schema';
import { eq, and } from 'drizzle-orm';

describe('SchemaEvolutionService - Snapshot Generation', () => {
  let testTenantId: string;
  let testUserId: string;

  beforeAll(async () => {
    // Clean up any existing test data from previous runs
    const existingTenants = await db.select().from(tenants).where(eq(tenants.slug, 'test-schema-evolution'));
    for (const tenant of existingTenants) {
      await db.delete(schemaVersions).where(eq(schemaVersions.tenantId, tenant.id));
      await db.delete(tenants).where(eq(tenants.id, tenant.id));
    }
    const existingUsers = await db.select().from(users).where(eq(users.email, 'schema-test@example.com'));
    for (const user of existingUsers) {
      await db.delete(users).where(eq(users.id, user.id));
    }

    // Create test tenant
    const tenant = await db.insert(tenants).values({
      name: 'Test Tenant for Schema Evolution',
      slug: 'test-schema-evolution',
      status: 'active',
    }).returning();
    testTenantId = tenant[0].id;

    // Create test user
    const user = await db.insert(users).values({
      email: 'schema-test@example.com',
      firstName: 'Schema',
      lastName: 'Test',
      password: 'test123',
    }).returning();
    testUserId = user[0].id;
  });

  afterAll(async () => {
    // Clean up test data
    await db.delete(schemaVersions).where(eq(schemaVersions.tenantId, testTenantId));
    await db.delete(tenants).where(eq(tenants.id, testTenantId));
    await db.delete(users).where(eq(users.id, testUserId));
  });

  describe('captureSnapshot', () => {
    it('should capture initial schema snapshot with version 1', async () => {
      const snapshot = await schemaEvolutionService.captureSnapshot(
        testTenantId,
        testUserId,
        'Initial schema snapshot'
      );

      expect(snapshot).toBeDefined();
      expect(snapshot.version).toBe(1);
      expect(snapshot.tenantId).toBe(testTenantId);
      expect(snapshot.timestamp).toBeInstanceOf(Date);
      expect(snapshot.metadata.capturedBy).toBe(testUserId);
      expect(snapshot.metadata.description).toBe('Initial schema snapshot');
      expect(snapshot.tables).toBeInstanceOf(Array);
      expect(snapshot.tables.length).toBeGreaterThan(0);
      expect(snapshot.relationships).toBeInstanceOf(Array);
    });

    it('should capture schema with correct table structure', async () => {
      const snapshot = await schemaEvolutionService.captureSnapshot(
        testTenantId,
        testUserId,
        'Second snapshot'
      );

      // Check that we have captured some known tables
      const tableNames = snapshot.tables.map(t => t.name);
      expect(tableNames).toContain('tenants');
      expect(tableNames).toContain('users');
      expect(tableNames).toContain('schema_versions');

      // Check table structure for 'tenants' table
      const tenantsTable = snapshot.tables.find(t => t.name === 'tenants');
      expect(tenantsTable).toBeDefined();
      expect(tenantsTable!.columns).toBeInstanceOf(Array);
      expect(tenantsTable!.columns.length).toBeGreaterThan(0);

      // Check that columns have required properties
      const idColumn = tenantsTable!.columns.find(c => c.name === 'id');
      expect(idColumn).toBeDefined();
      expect(idColumn!.isPrimaryKey).toBe(true);
      expect(idColumn!.nullable).toBe(false);
    });

    it('should increment version number for subsequent snapshots', async () => {
      const snapshot1 = await schemaEvolutionService.captureSnapshot(
        testTenantId,
        testUserId,
        'Third snapshot'
      );

      const snapshot2 = await schemaEvolutionService.captureSnapshot(
        testTenantId,
        testUserId,
        'Fourth snapshot'
      );

      expect(snapshot2.version).toBe(snapshot1.version + 1);
    });

    it('should capture foreign key relationships', async () => {
      const snapshot = await schemaEvolutionService.captureSnapshot(
        testTenantId,
        testUserId,
        'Relationships test'
      );

      expect(snapshot.relationships).toBeInstanceOf(Array);
      expect(snapshot.relationships.length).toBeGreaterThan(0);

      // Check for a known relationship (e.g., schema_versions -> tenants)
      const schemaVersionsRelationship = snapshot.relationships.find(
        r => r.fromTable === 'schema_versions' && r.toTable === 'tenants'
      );

      expect(schemaVersionsRelationship).toBeDefined();
      expect(schemaVersionsRelationship!.fromColumn).toBe('tenant_id');
      expect(schemaVersionsRelationship!.toColumn).toBe('id');
      expect(schemaVersionsRelationship!.onDelete).toBeDefined();
      expect(schemaVersionsRelationship!.onUpdate).toBeDefined();
    });

    it('should capture foreign key relationships with valid enum values (no underscores)', async () => {
      const snapshot = await schemaEvolutionService.captureSnapshot(
        testTenantId,
        testUserId,
        'Enum validation test'
      );

      expect(snapshot.relationships).toBeInstanceOf(Array);
      expect(snapshot.relationships.length).toBeGreaterThan(0);

      const validOnDeleteValues = ['CASCADE', 'SET NULL', 'RESTRICT', 'NO ACTION'];
      const validOnUpdateValues = ['CASCADE', 'SET NULL', 'RESTRICT', 'NO ACTION'];

      snapshot.relationships.forEach(rel => {
        expect(validOnDeleteValues).toContain(rel.onDelete);
        expect(validOnUpdateValues).toContain(rel.onUpdate);
        expect(rel.onDelete).not.toContain('_');
        expect(rel.onUpdate).not.toContain('_');
      });
    });

    it('should save snapshot to database correctly', async () => {
      const snapshot = await schemaEvolutionService.captureSnapshot(
        testTenantId,
        testUserId,
        'Database save test'
      );

      // Verify it was saved to the database
      const savedSnapshots = await db
        .select()
        .from(schemaVersions)
        .where(eq(schemaVersions.tenantId, testTenantId));

      expect(savedSnapshots.length).toBeGreaterThan(0);

      const savedSnapshot = savedSnapshots.find(s => s.version === snapshot.version);
      expect(savedSnapshot).toBeDefined();
      expect(savedSnapshot!.changesSummary).toBe('Database save test');
      expect(savedSnapshot!.promotedBy).toBe(testUserId);
    });
  });

  describe('getLatestSnapshot', () => {
    it('should return null when no snapshots exist for tenant', async () => {
      const nonExistentTenant = 'non-existent-tenant-id';
      const snapshot = await schemaEvolutionService.getLatestSnapshot(nonExistentTenant);
      expect(snapshot).toBeNull();
    });

    it('should return the latest snapshot for tenant', async () => {
      // Capture a few snapshots
      await schemaEvolutionService.captureSnapshot(testTenantId, testUserId, 'Snapshot 1');
      await schemaEvolutionService.captureSnapshot(testTenantId, testUserId, 'Snapshot 2');
      const lastSnapshot = await schemaEvolutionService.captureSnapshot(
        testTenantId,
        testUserId,
        'Snapshot 3'
      );

      const latest = await schemaEvolutionService.getLatestSnapshot(testTenantId);

      expect(latest).toBeDefined();
      expect(latest!.version).toBe(lastSnapshot.version);
      expect(latest!.metadata.description).toBe('Snapshot 3');
    });

    it('should deserialize snapshot correctly from JSONB', async () => {
      const latest = await schemaEvolutionService.getLatestSnapshot(testTenantId);

      expect(latest).toBeDefined();
      expect(latest!.tables).toBeInstanceOf(Array);
      expect(latest!.relationships).toBeInstanceOf(Array);
      expect(latest!.metadata).toBeDefined();
      expect(latest!.metadata.capturedBy).toBe(testUserId);
      expect(latest!.timestamp).toBeInstanceOf(Date);
    });

    it('should return timestamp as Date instance, not string', async () => {
      const latest = await schemaEvolutionService.getLatestSnapshot(testTenantId);

      expect(latest).toBeDefined();
      expect(latest!.timestamp).toBeInstanceOf(Date);
      expect(typeof latest!.timestamp.getTime).toBe('function');
      expect(latest!.timestamp.getTime()).toBeGreaterThan(0);
    });
  });

  describe('getSnapshot', () => {
    it('should return null when snapshot version does not exist', async () => {
      const snapshot = await schemaEvolutionService.getSnapshot(testTenantId, 99999);
      expect(snapshot).toBeNull();
    });

    it('should return null when tenant does not exist', async () => {
      const snapshot = await schemaEvolutionService.getSnapshot('non-existent-tenant', 1);
      expect(snapshot).toBeNull();
    });

    it('should return specific snapshot by version', async () => {
      // Capture snapshots
      const snapshot1 = await schemaEvolutionService.captureSnapshot(
        testTenantId,
        testUserId,
        'Version specific test 1'
      );
      const snapshot2 = await schemaEvolutionService.captureSnapshot(
        testTenantId,
        testUserId,
        'Version specific test 2'
      );

      // Retrieve specific versions
      const retrieved1 = await schemaEvolutionService.getSnapshot(testTenantId, snapshot1.version);
      const retrieved2 = await schemaEvolutionService.getSnapshot(testTenantId, snapshot2.version);

      expect(retrieved1).toBeDefined();
      expect(retrieved1!.version).toBe(snapshot1.version);
      expect(retrieved1!.metadata.description).toBe('Version specific test 1');

      expect(retrieved2).toBeDefined();
      expect(retrieved2!.version).toBe(snapshot2.version);
      expect(retrieved2!.metadata.description).toBe('Version specific test 2');
    });

    it('should deserialize snapshot correctly from JSONB', async () => {
      const snapshot = await schemaEvolutionService.captureSnapshot(
        testTenantId,
        testUserId,
        'Deserialization test'
      );

      const retrieved = await schemaEvolutionService.getSnapshot(testTenantId, snapshot.version);

      expect(retrieved).toBeDefined();
      expect(retrieved!.tables).toBeInstanceOf(Array);
      expect(retrieved!.relationships).toBeInstanceOf(Array);
      expect(retrieved!.metadata).toBeDefined();
      expect(retrieved!.tenantId).toBe(testTenantId);
      expect(retrieved!.timestamp).toBeInstanceOf(Date);
    });

    it('should return timestamp as Date instance, not string', async () => {
      const snapshot = await schemaEvolutionService.captureSnapshot(
        testTenantId,
        testUserId,
        'Timestamp test'
      );

      const retrieved = await schemaEvolutionService.getSnapshot(testTenantId, snapshot.version);

      expect(retrieved).toBeDefined();
      expect(retrieved!.timestamp).toBeInstanceOf(Date);
      expect(typeof retrieved!.timestamp.getTime).toBe('function');
      expect(retrieved!.timestamp.getTime()).toBeGreaterThan(0);
    });
  });

  describe('listVersions', () => {
    it('should list all versions for a tenant', async () => {
      const versions = await schemaEvolutionService.listVersions(testTenantId);

      expect(versions).toBeInstanceOf(Array);
      expect(versions.length).toBeGreaterThan(0);
      expect(versions[0]).toHaveProperty('version');
      expect(versions[0]).toHaveProperty('createdAt');
      expect(versions[0]).toHaveProperty('promotedBy');
    });

    it('should return versions in descending order', async () => {
      const versions = await schemaEvolutionService.listVersions(testTenantId);

      for (let i = 0; i < versions.length - 1; i++) {
        expect(versions[i].version).toBeGreaterThan(versions[i + 1].version);
      }
    });
  });

  describe('diff - Schema Diff Algorithm', () => {
    let diffTestTenantId: string;
    let diffTestUserId: string;

    beforeAll(async () => {
      // Clean up any existing test data from previous runs
      const existingTenants = await db.select().from(tenants).where(eq(tenants.slug, 'test-diff'));
      for (const tenant of existingTenants) {
        await db.delete(schemaVersions).where(eq(schemaVersions.tenantId, tenant.id));
        await db.delete(tenants).where(eq(tenants.id, tenant.id));
      }
      const existingUsers = await db.select().from(users).where(eq(users.email, 'diff-test@example.com'));
      for (const user of existingUsers) {
        await db.delete(users).where(eq(users.id, user.id));
      }

      const tenant = await db.insert(tenants).values({
        name: 'Test Tenant for Diff',
        slug: 'test-diff',
        status: 'active',
      }).returning();
      diffTestTenantId = tenant[0].id;

      const user = await db.insert(users).values({
        email: 'diff-test@example.com',
        firstName: 'Diff',
        lastName: 'Test',
        password: 'test123',
      }).returning();
      diffTestUserId = user[0].id;
    });

    afterAll(async () => {
      await db.delete(schemaVersions).where(eq(schemaVersions.tenantId, diffTestTenantId));
      await db.delete(tenants).where(eq(tenants.id, diffTestTenantId));
      await db.delete(users).where(eq(users.id, diffTestUserId));
    });

    it('should throw error when fromVersion does not exist', async () => {
      await expect(
        schemaEvolutionService.diff(diffTestTenantId, 99999, 1)
      ).rejects.toThrow('Version not found');
    });

    it('should throw error when toVersion does not exist', async () => {
      const snapshot1 = await schemaEvolutionService.captureSnapshot(
        diffTestTenantId,
        diffTestUserId,
        'Version 1'
      );

      await expect(
        schemaEvolutionService.diff(diffTestTenantId, snapshot1.version, 99999)
      ).rejects.toThrow('Version not found');
    });

    it('should detect table additions', async () => {
      const snapshot1 = await schemaEvolutionService.captureSnapshot(
        diffTestTenantId,
        diffTestUserId,
        'Before table add'
      );

      const snapshot2 = await schemaEvolutionService.captureSnapshot(
        diffTestTenantId,
        diffTestUserId,
        'After table add'
      );

      const snapshot2Modified = { ...snapshot2 };
      snapshot2Modified.tables = [
        ...snapshot2.tables,
        {
          name: 'test_new_table',
          columns: [
            { name: 'id', type: 'uuid', nullable: false, isPrimaryKey: true, isForeignKey: false },
            { name: 'name', type: 'text', nullable: true, isPrimaryKey: false, isForeignKey: false }
          ],
          indexes: [],
          constraints: []
        }
      ];

      await db.insert(schemaVersions).values({
        tenantId: diffTestTenantId,
        version: snapshot2.version,
        schemaSnapshot: snapshot2Modified as any,
        changesSummary: 'Modified snapshot with new table',
        promotedBy: diffTestUserId,
      }).onConflictDoUpdate({
        target: [schemaVersions.tenantId, schemaVersions.version],
        set: { schemaSnapshot: snapshot2Modified as any }
      });

      const diff = await schemaEvolutionService.diff(
        diffTestTenantId,
        snapshot1.version,
        snapshot2.version
      );

      const tableAddChanges = diff.changes.filter(c => c.type === 'table_add');
      expect(tableAddChanges.length).toBeGreaterThanOrEqual(1);
      
      const newTableChange = tableAddChanges.find(c => c.tableName === 'test_new_table');
      expect(newTableChange).toBeDefined();
      expect(newTableChange!.severity).toBe('low');
      expect(newTableChange!.reversible).toBe(true);
      
      expect(diff.summary.tablesAdded).toBeGreaterThanOrEqual(1);
    });

    it('should detect table removals with critical severity', async () => {
      const snapshot1 = await schemaEvolutionService.captureSnapshot(
        diffTestTenantId,
        diffTestUserId,
        'Before table drop'
      );

      const snapshot2 = await schemaEvolutionService.captureSnapshot(
        diffTestTenantId,
        diffTestUserId,
        'After table drop'
      );

      const snapshot2Modified = { ...snapshot2 };
      snapshot2Modified.tables = snapshot2.tables.filter(t => t.name !== 'users');

      await db.insert(schemaVersions).values({
        tenantId: diffTestTenantId,
        version: snapshot2.version,
        schemaSnapshot: snapshot2Modified as any,
        changesSummary: 'Modified snapshot with dropped table',
        promotedBy: diffTestUserId,
      }).onConflictDoUpdate({
        target: [schemaVersions.tenantId, schemaVersions.version],
        set: { schemaSnapshot: snapshot2Modified as any }
      });

      const diff = await schemaEvolutionService.diff(
        diffTestTenantId,
        snapshot1.version,
        snapshot2.version
      );

      const tableDropChanges = diff.changes.filter(c => c.type === 'table_drop');
      expect(tableDropChanges.length).toBeGreaterThanOrEqual(1);
      
      const droppedTableChange = tableDropChanges.find(c => c.tableName === 'users');
      expect(droppedTableChange).toBeDefined();
      expect(droppedTableChange!.severity).toBe('critical');
      expect(droppedTableChange!.reversible).toBe(false);
      
      expect(diff.summary.tablesRemoved).toBeGreaterThanOrEqual(1);
    });

    it('should detect column additions with correct severity', async () => {
      const snapshot1 = await schemaEvolutionService.captureSnapshot(
        diffTestTenantId,
        diffTestUserId,
        'Before column add'
      );

      const snapshot2 = await schemaEvolutionService.captureSnapshot(
        diffTestTenantId,
        diffTestUserId,
        'After column add'
      );

      const snapshot2Modified = { ...snapshot2 };
      const tenantsTable = snapshot2Modified.tables.find(t => t.name === 'tenants');
      if (tenantsTable) {
        tenantsTable.columns = [
          ...tenantsTable.columns,
          { name: 'test_nullable_col', type: 'text', nullable: true, isPrimaryKey: false, isForeignKey: false },
          { name: 'test_not_null_col', type: 'text', nullable: false, isPrimaryKey: false, isForeignKey: false }
        ];
      }

      await db.insert(schemaVersions).values({
        tenantId: diffTestTenantId,
        version: snapshot2.version,
        schemaSnapshot: snapshot2Modified as any,
        changesSummary: 'Modified snapshot with new columns',
        promotedBy: diffTestUserId,
      }).onConflictDoUpdate({
        target: [schemaVersions.tenantId, schemaVersions.version],
        set: { schemaSnapshot: snapshot2Modified as any }
      });

      const diff = await schemaEvolutionService.diff(
        diffTestTenantId,
        snapshot1.version,
        snapshot2.version
      );

      const columnAddChanges = diff.changes.filter(
        c => c.type === 'column_add' && c.tableName === 'tenants'
      );
      expect(columnAddChanges.length).toBeGreaterThanOrEqual(2);
      
      const nullableColChange = columnAddChanges.find(
        c => c.details.columnName === 'test_nullable_col'
      );
      expect(nullableColChange).toBeDefined();
      expect(nullableColChange!.severity).toBe('low');
      expect(nullableColChange!.reversible).toBe(true);
      
      const notNullColChange = columnAddChanges.find(
        c => c.details.columnName === 'test_not_null_col'
      );
      expect(notNullColChange).toBeDefined();
      expect(notNullColChange!.severity).toBe('medium');
      expect(notNullColChange!.reversible).toBe(true);
      
      expect(diff.summary.columnsAdded).toBeGreaterThanOrEqual(2);
    });

    it('should detect column removals with critical severity', async () => {
      const snapshot1 = await schemaEvolutionService.captureSnapshot(
        diffTestTenantId,
        diffTestUserId,
        'Before column drop'
      );

      const snapshot2 = await schemaEvolutionService.captureSnapshot(
        diffTestTenantId,
        diffTestUserId,
        'After column drop'
      );

      const snapshot2Modified = { ...snapshot2 };
      const tenantsTable = snapshot2Modified.tables.find(t => t.name === 'tenants');
      if (tenantsTable) {
        tenantsTable.columns = tenantsTable.columns.filter(c => c.name !== 'name');
      }

      await db.insert(schemaVersions).values({
        tenantId: diffTestTenantId,
        version: snapshot2.version,
        schemaSnapshot: snapshot2Modified as any,
        changesSummary: 'Modified snapshot with dropped column',
        promotedBy: diffTestUserId,
      }).onConflictDoUpdate({
        target: [schemaVersions.tenantId, schemaVersions.version],
        set: { schemaSnapshot: snapshot2Modified as any }
      });

      const diff = await schemaEvolutionService.diff(
        diffTestTenantId,
        snapshot1.version,
        snapshot2.version
      );

      const columnDropChanges = diff.changes.filter(
        c => c.type === 'column_drop' && c.tableName === 'tenants'
      );
      expect(columnDropChanges.length).toBeGreaterThanOrEqual(1);
      
      const droppedColChange = columnDropChanges.find(
        c => c.details.columnName === 'name'
      );
      expect(droppedColChange).toBeDefined();
      expect(droppedColChange!.severity).toBe('critical');
      expect(droppedColChange!.reversible).toBe(false);
      
      expect(diff.summary.columnsRemoved).toBeGreaterThanOrEqual(1);
    });

    it('should detect column modifications with correct severity', async () => {
      const snapshot1 = await schemaEvolutionService.captureSnapshot(
        diffTestTenantId,
        diffTestUserId,
        'Before column modify'
      );

      const snapshot2 = await schemaEvolutionService.captureSnapshot(
        diffTestTenantId,
        diffTestUserId,
        'After column modify'
      );

      const snapshot2Modified = { ...snapshot2 };
      const tenantsTable = snapshot2Modified.tables.find(t => t.name === 'tenants');
      if (tenantsTable) {
        const nameColumn = tenantsTable.columns.find(c => c.name === 'slug');
        if (nameColumn) {
          nameColumn.type = 'varchar';
        }
        
        const statusColumn = tenantsTable.columns.find(c => c.name === 'status');
        if (statusColumn) {
          statusColumn.nullable = true;
        }
      }

      await db.insert(schemaVersions).values({
        tenantId: diffTestTenantId,
        version: snapshot2.version,
        schemaSnapshot: snapshot2Modified as any,
        changesSummary: 'Modified snapshot with changed columns',
        promotedBy: diffTestUserId,
      }).onConflictDoUpdate({
        target: [schemaVersions.tenantId, schemaVersions.version],
        set: { schemaSnapshot: snapshot2Modified as any }
      });

      const diff = await schemaEvolutionService.diff(
        diffTestTenantId,
        snapshot1.version,
        snapshot2.version
      );

      const columnModifyChanges = diff.changes.filter(
        c => c.type === 'column_modify' && c.tableName === 'tenants'
      );
      expect(columnModifyChanges.length).toBeGreaterThanOrEqual(2);
      
      const typeChangeCol = columnModifyChanges.find(
        c => c.details.columnName === 'slug'
      );
      expect(typeChangeCol).toBeDefined();
      expect(typeChangeCol!.severity).toBe('high');
      expect(typeChangeCol!.reversible).toBe(true);
      
      const nullableChangeCol = columnModifyChanges.find(
        c => c.details.columnName === 'status'
      );
      expect(nullableChangeCol).toBeDefined();
      expect(nullableChangeCol!.severity).toBe('medium');
      expect(nullableChangeCol!.reversible).toBe(true);
      
      expect(diff.summary.columnsModified).toBeGreaterThanOrEqual(2);
    });

    it('should detect index additions and removals', async () => {
      const snapshot1 = await schemaEvolutionService.captureSnapshot(
        diffTestTenantId,
        diffTestUserId,
        'Before index changes'
      );

      const snapshot2 = await schemaEvolutionService.captureSnapshot(
        diffTestTenantId,
        diffTestUserId,
        'After index changes'
      );

      const snapshot2Modified = { ...snapshot2 };
      const tenantsTable = snapshot2Modified.tables.find(t => t.name === 'tenants');
      if (tenantsTable) {
        tenantsTable.indexes = [
          ...tenantsTable.indexes.slice(0, -1),
          {
            name: 'test_new_index',
            columns: ['name'],
            unique: false,
            type: 'btree'
          }
        ];
      }

      await db.insert(schemaVersions).values({
        tenantId: diffTestTenantId,
        version: snapshot2.version,
        schemaSnapshot: snapshot2Modified as any,
        changesSummary: 'Modified snapshot with index changes',
        promotedBy: diffTestUserId,
      }).onConflictDoUpdate({
        target: [schemaVersions.tenantId, schemaVersions.version],
        set: { schemaSnapshot: snapshot2Modified as any }
      });

      const diff = await schemaEvolutionService.diff(
        diffTestTenantId,
        snapshot1.version,
        snapshot2.version
      );

      const indexAddChanges = diff.changes.filter(c => c.type === 'index_add');
      const indexDropChanges = diff.changes.filter(c => c.type === 'index_drop');
      
      expect(indexAddChanges.length).toBeGreaterThanOrEqual(1);
      expect(indexDropChanges.length).toBeGreaterThanOrEqual(1);
      
      const addedIndex = indexAddChanges.find(c => c.details.indexName === 'test_new_index');
      expect(addedIndex).toBeDefined();
      expect(addedIndex!.severity).toBe('medium');
      expect(addedIndex!.reversible).toBe(true);
      
      const droppedIndex = indexDropChanges[0];
      expect(droppedIndex.severity).toBe('low');
      expect(droppedIndex.reversible).toBe(true);
    });

    it('should detect constraint additions and removals', async () => {
      const snapshot1 = await schemaEvolutionService.captureSnapshot(
        diffTestTenantId,
        diffTestUserId,
        'Before constraint changes'
      );

      const snapshot2 = await schemaEvolutionService.captureSnapshot(
        diffTestTenantId,
        diffTestUserId,
        'After constraint changes'
      );

      const snapshot2Modified = { ...snapshot2 };
      const tenantsTable = snapshot2Modified.tables.find(t => t.name === 'tenants');
      if (tenantsTable && tenantsTable.constraints.length > 0) {
        const firstConstraint = tenantsTable.constraints[0];
        tenantsTable.constraints = [
          ...tenantsTable.constraints.slice(1),
          {
            name: 'test_new_constraint',
            type: 'check',
            columns: ['status'],
            definition: 'CHECK (status IN (\'active\', \'inactive\'))'
          }
        ];
      }

      await db.insert(schemaVersions).values({
        tenantId: diffTestTenantId,
        version: snapshot2.version,
        schemaSnapshot: snapshot2Modified as any,
        changesSummary: 'Modified snapshot with constraint changes',
        promotedBy: diffTestUserId,
      }).onConflictDoUpdate({
        target: [schemaVersions.tenantId, schemaVersions.version],
        set: { schemaSnapshot: snapshot2Modified as any }
      });

      const diff = await schemaEvolutionService.diff(
        diffTestTenantId,
        snapshot1.version,
        snapshot2.version
      );

      const constraintAddChanges = diff.changes.filter(c => c.type === 'constraint_add');
      const constraintDropChanges = diff.changes.filter(c => c.type === 'constraint_drop');
      
      expect(constraintAddChanges.length).toBeGreaterThanOrEqual(1);
      expect(constraintDropChanges.length).toBeGreaterThanOrEqual(1);
      
      const addedConstraint = constraintAddChanges.find(
        c => c.details.constraintName === 'test_new_constraint'
      );
      expect(addedConstraint).toBeDefined();
      expect(addedConstraint!.severity).toBe('medium');
      expect(addedConstraint!.reversible).toBe(true);
      
      const droppedConstraint = constraintDropChanges[0];
      expect(droppedConstraint.severity).toBe('high');
      expect(droppedConstraint.reversible).toBe(false);
    });

    it('should generate correct summary counts', async () => {
      const snapshot1 = await schemaEvolutionService.captureSnapshot(
        diffTestTenantId,
        diffTestUserId,
        'Complex changes - before'
      );

      const snapshot2 = await schemaEvolutionService.captureSnapshot(
        diffTestTenantId,
        diffTestUserId,
        'Complex changes - after'
      );

      const snapshot2Modified = { ...snapshot2 };
      
      snapshot2Modified.tables = [
        ...snapshot2.tables.filter(t => t.name !== 'users'),
        {
          name: 'test_summary_table',
          columns: [
            { name: 'id', type: 'uuid', nullable: false, isPrimaryKey: true, isForeignKey: false }
          ],
          indexes: [],
          constraints: []
        }
      ];
      
      const tenantsTable = snapshot2Modified.tables.find(t => t.name === 'tenants');
      if (tenantsTable) {
        tenantsTable.columns = [
          ...tenantsTable.columns.filter(c => c.name !== 'name'),
          { name: 'new_col_1', type: 'text', nullable: true, isPrimaryKey: false, isForeignKey: false },
          { name: 'new_col_2', type: 'text', nullable: false, isPrimaryKey: false, isForeignKey: false }
        ];
        
        const slugColumn = tenantsTable.columns.find(c => c.name === 'slug');
        if (slugColumn) {
          slugColumn.type = 'varchar';
        }
      }

      await db.insert(schemaVersions).values({
        tenantId: diffTestTenantId,
        version: snapshot2.version,
        schemaSnapshot: snapshot2Modified as any,
        changesSummary: 'Complex changes for summary test',
        promotedBy: diffTestUserId,
      }).onConflictDoUpdate({
        target: [schemaVersions.tenantId, schemaVersions.version],
        set: { schemaSnapshot: snapshot2Modified as any }
      });

      const diff = await schemaEvolutionService.diff(
        diffTestTenantId,
        snapshot1.version,
        snapshot2.version
      );

      expect(diff.summary.tablesAdded).toBeGreaterThanOrEqual(1);
      expect(diff.summary.tablesRemoved).toBeGreaterThanOrEqual(1);
      expect(diff.summary.tablesModified).toBeGreaterThanOrEqual(1);
      expect(diff.summary.columnsAdded).toBeGreaterThanOrEqual(2);
      expect(diff.summary.columnsRemoved).toBeGreaterThanOrEqual(1);
      expect(diff.summary.columnsModified).toBeGreaterThanOrEqual(1);
      
      expect(diff.tenantId).toBe(diffTestTenantId);
      expect(diff.fromVersion).toBe(snapshot1.version);
      expect(diff.toVersion).toBe(snapshot2.version);
      expect(diff.changes).toBeInstanceOf(Array);
      expect(diff.changes.length).toBeGreaterThan(0);
    });

    it('should correctly count modified tables (not counting same table multiple times)', async () => {
      const snapshot1 = await schemaEvolutionService.captureSnapshot(
        diffTestTenantId,
        diffTestUserId,
        'Modified tables count - before'
      );

      const snapshot2 = await schemaEvolutionService.captureSnapshot(
        diffTestTenantId,
        diffTestUserId,
        'Modified tables count - after'
      );

      const snapshot2Modified = { ...snapshot2 };
      const tenantsTable = snapshot2Modified.tables.find(t => t.name === 'tenants');
      if (tenantsTable) {
        tenantsTable.columns = [
          ...tenantsTable.columns,
          { name: 'col_a', type: 'text', nullable: true, isPrimaryKey: false, isForeignKey: false },
          { name: 'col_b', type: 'text', nullable: true, isPrimaryKey: false, isForeignKey: false },
          { name: 'col_c', type: 'text', nullable: true, isPrimaryKey: false, isForeignKey: false }
        ];
      }

      await db.insert(schemaVersions).values({
        tenantId: diffTestTenantId,
        version: snapshot2.version,
        schemaSnapshot: snapshot2Modified as any,
        changesSummary: 'Multiple column changes in same table',
        promotedBy: diffTestUserId,
      }).onConflictDoUpdate({
        target: [schemaVersions.tenantId, schemaVersions.version],
        set: { schemaSnapshot: snapshot2Modified as any }
      });

      const diff = await schemaEvolutionService.diff(
        diffTestTenantId,
        snapshot1.version,
        snapshot2.version
      );

      const tenantsChanges = diff.changes.filter(c => c.tableName === 'tenants');
      expect(tenantsChanges.length).toBe(3);
      
      const uniqueModifiedTables = new Set(
        diff.changes
          .filter(c => c.type !== 'table_add' && c.type !== 'table_drop')
          .map(c => c.tableName)
      );
      
      expect(diff.summary.tablesModified).toBe(uniqueModifiedTables.size);
      expect(uniqueModifiedTables.has('tenants')).toBe(true);
    });
  });

  describe('analyzeImpact - Impact Analysis Engine', () => {
    let impactTestTenantId: string;
    let impactTestUserId: string;

    beforeAll(async () => {
      const existingTenants = await db.select().from(tenants).where(eq(tenants.slug, 'test-impact'));
      for (const tenant of existingTenants) {
        await db.delete(schemaVersions).where(eq(schemaVersions.tenantId, tenant.id));
        await db.delete(tenants).where(eq(tenants.id, tenant.id));
      }
      const existingUsers = await db.select().from(users).where(eq(users.email, 'impact-test@example.com'));
      for (const user of existingUsers) {
        await db.delete(users).where(eq(users.id, user.id));
      }

      const tenant = await db.insert(tenants).values({
        name: 'Test Tenant for Impact Analysis',
        slug: 'test-impact',
        status: 'active',
      }).returning();
      impactTestTenantId = tenant[0].id;

      const user = await db.insert(users).values({
        email: 'impact-test@example.com',
        firstName: 'Impact',
        lastName: 'Test',
        password: 'test123',
      }).returning();
      impactTestUserId = user[0].id;
    });

    afterAll(async () => {
      await db.delete(schemaVersions).where(eq(schemaVersions.tenantId, impactTestTenantId));
      await db.delete(tenants).where(eq(tenants.id, impactTestTenantId));
      await db.delete(users).where(eq(users.id, impactTestUserId));
    });

    it('should detect high dataLossRisk for DROP operations', async () => {
      const snapshot1 = await schemaEvolutionService.captureSnapshot(
        impactTestTenantId,
        impactTestUserId,
        'Before drop operations'
      );

      const snapshot2 = await schemaEvolutionService.captureSnapshot(
        impactTestTenantId,
        impactTestUserId,
        'After drop operations'
      );

      const snapshot2Modified = { ...snapshot2 };
      snapshot2Modified.tables = snapshot2.tables.filter(t => t.name !== 'users');
      
      const tenantsTable = snapshot2Modified.tables.find(t => t.name === 'tenants');
      if (tenantsTable) {
        tenantsTable.columns = tenantsTable.columns.filter(c => c.name !== 'name');
      }

      await db.insert(schemaVersions).values({
        tenantId: impactTestTenantId,
        version: snapshot2.version,
        schemaSnapshot: snapshot2Modified as any,
        changesSummary: 'DROP operations test',
        promotedBy: impactTestUserId,
      }).onConflictDoUpdate({
        target: [schemaVersions.tenantId, schemaVersions.version],
        set: { schemaSnapshot: snapshot2Modified as any }
      });

      const diff = await schemaEvolutionService.diff(
        impactTestTenantId,
        snapshot1.version,
        snapshot2.version
      );

      const impact = await schemaEvolutionService.analyzeImpact(diff);

      expect(impact.dataLossRisk).toBe('high');
      expect(impact.breakingChanges).toBe(true);
      
      const criticalRisks = impact.risks.filter(r => r.severity === 'critical');
      expect(criticalRisks.length).toBeGreaterThan(0);
      
      const dataLossRisks = impact.risks.filter(r => r.type === 'data_loss');
      expect(dataLossRisks.length).toBeGreaterThan(0);
      
      expect(impact.recommendations.length).toBeGreaterThan(0);
      expect(impact.affectedQueries.length).toBeGreaterThan(0);
    });

    it('should detect low risk for ADD operations', async () => {
      const snapshot1 = await schemaEvolutionService.captureSnapshot(
        impactTestTenantId,
        impactTestUserId,
        'Before add operations'
      );

      const snapshot2 = await schemaEvolutionService.captureSnapshot(
        impactTestTenantId,
        impactTestUserId,
        'After add operations'
      );

      const snapshot2Modified = { ...snapshot2 };
      
      snapshot2Modified.tables = [
        ...snapshot2.tables,
        {
          name: 'test_new_table_safe',
          columns: [
            { name: 'id', type: 'uuid', nullable: false, isPrimaryKey: true, isForeignKey: false },
            { name: 'name', type: 'text', nullable: true, isPrimaryKey: false, isForeignKey: false }
          ],
          indexes: [],
          constraints: []
        }
      ];

      const tenantsTable = snapshot2Modified.tables.find(t => t.name === 'tenants');
      if (tenantsTable) {
        tenantsTable.columns = [
          ...tenantsTable.columns,
          { name: 'nullable_col', type: 'text', nullable: true, isPrimaryKey: false, isForeignKey: false }
        ];
        
        tenantsTable.indexes = [
          ...tenantsTable.indexes,
          { name: 'test_perf_index', columns: ['slug'], unique: false, type: 'btree' }
        ];
      }

      await db.insert(schemaVersions).values({
        tenantId: impactTestTenantId,
        version: snapshot2.version,
        schemaSnapshot: snapshot2Modified as any,
        changesSummary: 'ADD operations test',
        promotedBy: impactTestUserId,
      }).onConflictDoUpdate({
        target: [schemaVersions.tenantId, schemaVersions.version],
        set: { schemaSnapshot: snapshot2Modified as any }
      });

      const diff = await schemaEvolutionService.diff(
        impactTestTenantId,
        snapshot1.version,
        snapshot2.version
      );

      const impact = await schemaEvolutionService.analyzeImpact(diff);

      expect(impact.dataLossRisk).toBe('low');
      expect(impact.breakingChanges).toBe(false);
      
      const lowRisks = impact.risks.filter(r => r.severity === 'low');
      expect(lowRisks.length).toBeGreaterThan(0);
      
      const performanceRisks = impact.risks.filter(r => r.type === 'performance');
      expect(performanceRisks.length).toBeGreaterThan(0);
    });

    it('should detect medium risk for MODIFY operations', async () => {
      const snapshot1 = await schemaEvolutionService.captureSnapshot(
        impactTestTenantId,
        impactTestUserId,
        'Before modify operations'
      );

      const snapshot2 = await schemaEvolutionService.captureSnapshot(
        impactTestTenantId,
        impactTestUserId,
        'After modify operations'
      );

      const snapshot2Modified = { ...snapshot2 };
      const tenantsTable = snapshot2Modified.tables.find(t => t.name === 'tenants');
      if (tenantsTable) {
        const slugColumn = tenantsTable.columns.find(c => c.name === 'slug');
        if (slugColumn) {
          slugColumn.type = 'varchar';
        }

        tenantsTable.columns = [
          ...tenantsTable.columns,
          { name: 'not_null_new_col', type: 'text', nullable: false, default: 'default_value', isPrimaryKey: false, isForeignKey: false }
        ];
      }

      await db.insert(schemaVersions).values({
        tenantId: impactTestTenantId,
        version: snapshot2.version,
        schemaSnapshot: snapshot2Modified as any,
        changesSummary: 'MODIFY operations test',
        promotedBy: impactTestUserId,
      }).onConflictDoUpdate({
        target: [schemaVersions.tenantId, schemaVersions.version],
        set: { schemaSnapshot: snapshot2Modified as any }
      });

      const diff = await schemaEvolutionService.diff(
        impactTestTenantId,
        snapshot1.version,
        snapshot2.version
      );

      const impact = await schemaEvolutionService.analyzeImpact(diff);

      expect(impact.dataLossRisk).toBe('medium');
      expect(impact.breakingChanges).toBe(true);
      
      const highRisks = impact.risks.filter(r => r.severity === 'high');
      expect(highRisks.length).toBeGreaterThan(0);
      
      const mediumRisks = impact.risks.filter(r => r.severity === 'medium');
      expect(mediumRisks.length).toBeGreaterThan(0);
      
      expect(impact.estimatedDowntime).toBeGreaterThan(0);
    });

    it('should correctly detect breaking changes', async () => {
      const snapshot1 = await schemaEvolutionService.captureSnapshot(
        impactTestTenantId,
        impactTestUserId,
        'Before breaking changes'
      );

      const snapshot2 = await schemaEvolutionService.captureSnapshot(
        impactTestTenantId,
        impactTestUserId,
        'After breaking changes'
      );

      const snapshot2Modified = { ...snapshot2 };
      const tenantsTable = snapshot2Modified.tables.find(t => t.name === 'tenants');
      if (tenantsTable) {
        tenantsTable.columns = tenantsTable.columns.filter(c => c.name !== 'status');
        
        const slugColumn = tenantsTable.columns.find(c => c.name === 'slug');
        if (slugColumn) {
          slugColumn.type = 'integer';
        }

        if (tenantsTable.constraints.length > 0) {
          tenantsTable.constraints = tenantsTable.constraints.slice(1);
        }
      }

      await db.insert(schemaVersions).values({
        tenantId: impactTestTenantId,
        version: snapshot2.version,
        schemaSnapshot: snapshot2Modified as any,
        changesSummary: 'Breaking changes test',
        promotedBy: impactTestUserId,
      }).onConflictDoUpdate({
        target: [schemaVersions.tenantId, schemaVersions.version],
        set: { schemaSnapshot: snapshot2Modified as any }
      });

      const diff = await schemaEvolutionService.diff(
        impactTestTenantId,
        snapshot1.version,
        snapshot2.version
      );

      const impact = await schemaEvolutionService.analyzeImpact(diff);

      expect(impact.breakingChanges).toBe(true);
      
      const breakingChangeRisks = impact.risks.filter(r => r.type === 'breaking_change');
      expect(breakingChangeRisks.length).toBeGreaterThan(0);
      
      expect(impact.affectedQueries.length).toBeGreaterThan(0);
      
      const brokenQueries = impact.affectedQueries.filter(q => q.impact === 'broken');
      expect(brokenQueries.length).toBeGreaterThan(0);
    });

    it('should generate actionable recommendations', async () => {
      const snapshot1 = await schemaEvolutionService.captureSnapshot(
        impactTestTenantId,
        impactTestUserId,
        'Before recommendations test'
      );

      const snapshot2 = await schemaEvolutionService.captureSnapshot(
        impactTestTenantId,
        impactTestUserId,
        'After recommendations test'
      );

      const snapshot2Modified = { ...snapshot2 };
      
      snapshot2Modified.tables = snapshot2.tables.filter(t => t.name !== 'users');
      
      const tenantsTable = snapshot2Modified.tables.find(t => t.name === 'tenants');
      if (tenantsTable) {
        tenantsTable.columns = [
          ...tenantsTable.columns,
          { name: 'not_null_col', type: 'text', nullable: false, isPrimaryKey: false, isForeignKey: false }
        ];
        
        const slugColumn = tenantsTable.columns.find(c => c.name === 'slug');
        if (slugColumn) {
          slugColumn.type = 'varchar';
        }

        if (tenantsTable.indexes.length > 0) {
          tenantsTable.indexes = tenantsTable.indexes.slice(0, -1);
        }
      }

      await db.insert(schemaVersions).values({
        tenantId: impactTestTenantId,
        version: snapshot2.version,
        schemaSnapshot: snapshot2Modified as any,
        changesSummary: 'Recommendations test',
        promotedBy: impactTestUserId,
      }).onConflictDoUpdate({
        target: [schemaVersions.tenantId, schemaVersions.version],
        set: { schemaSnapshot: snapshot2Modified as any }
      });

      const diff = await schemaEvolutionService.diff(
        impactTestTenantId,
        snapshot1.version,
        snapshot2.version
      );

      const impact = await schemaEvolutionService.analyzeImpact(diff);

      expect(impact.recommendations.length).toBeGreaterThan(0);
      
      const backupRecommendation = impact.recommendations.find(r => r.includes('Backup'));
      expect(backupRecommendation).toBeDefined();
      
      const defaultValueRecommendation = impact.recommendations.find(r => r.includes('default value'));
      expect(defaultValueRecommendation).toBeDefined();
      
      const testConversionRecommendation = impact.recommendations.find(r => r.includes('Test data conversion'));
      expect(testConversionRecommendation).toBeDefined();
      
      const performanceRecommendation = impact.recommendations.find(r => r.includes('Monitor query performance'));
      expect(performanceRecommendation).toBeDefined();
    });

    it('should estimate downtime correctly', async () => {
      const snapshot1 = await schemaEvolutionService.captureSnapshot(
        impactTestTenantId,
        impactTestUserId,
        'Before downtime test'
      );

      const snapshot2 = await schemaEvolutionService.captureSnapshot(
        impactTestTenantId,
        impactTestUserId,
        'After downtime test'
      );

      const snapshot2Modified = { ...snapshot2 };
      
      snapshot2Modified.tables = snapshot2.tables.filter(t => t.name !== 'users');
      
      const tenantsTable = snapshot2Modified.tables.find(t => t.name === 'tenants');
      if (tenantsTable) {
        tenantsTable.columns = [
          ...tenantsTable.columns,
          { name: 'not_null_col_1', type: 'text', nullable: false, isPrimaryKey: false, isForeignKey: false },
          { name: 'not_null_col_2', type: 'text', nullable: false, isPrimaryKey: false, isForeignKey: false }
        ];
        
        const slugColumn = tenantsTable.columns.find(c => c.name === 'slug');
        if (slugColumn) {
          slugColumn.type = 'varchar';
        }
      }

      await db.insert(schemaVersions).values({
        tenantId: impactTestTenantId,
        version: snapshot2.version,
        schemaSnapshot: snapshot2Modified as any,
        changesSummary: 'Downtime estimation test',
        promotedBy: impactTestUserId,
      }).onConflictDoUpdate({
        target: [schemaVersions.tenantId, schemaVersions.version],
        set: { schemaSnapshot: snapshot2Modified as any }
      });

      const diff = await schemaEvolutionService.diff(
        impactTestTenantId,
        snapshot1.version,
        snapshot2.version
      );

      const impact = await schemaEvolutionService.analyzeImpact(diff);

      expect(impact.estimatedDowntime).toBeGreaterThan(0);
      expect(impact.estimatedDowntime).toBe(40);
    });

    it('should return complete ImpactAnalysis structure', async () => {
      const snapshot1 = await schemaEvolutionService.captureSnapshot(
        impactTestTenantId,
        impactTestUserId,
        'Structure test - before'
      );

      const snapshot2 = await schemaEvolutionService.captureSnapshot(
        impactTestTenantId,
        impactTestUserId,
        'Structure test - after'
      );

      const snapshot2Modified = { ...snapshot2 };
      const tenantsTable = snapshot2Modified.tables.find(t => t.name === 'tenants');
      if (tenantsTable) {
        tenantsTable.columns = [
          ...tenantsTable.columns,
          { name: 'test_col', type: 'text', nullable: true, isPrimaryKey: false, isForeignKey: false }
        ];
      }

      await db.insert(schemaVersions).values({
        tenantId: impactTestTenantId,
        version: snapshot2.version,
        schemaSnapshot: snapshot2Modified as any,
        changesSummary: 'Structure test',
        promotedBy: impactTestUserId,
      }).onConflictDoUpdate({
        target: [schemaVersions.tenantId, schemaVersions.version],
        set: { schemaSnapshot: snapshot2Modified as any }
      });

      const diff = await schemaEvolutionService.diff(
        impactTestTenantId,
        snapshot1.version,
        snapshot2.version
      );

      const impact = await schemaEvolutionService.analyzeImpact(diff);

      expect(impact).toHaveProperty('changes');
      expect(impact).toHaveProperty('risks');
      expect(impact).toHaveProperty('affectedQueries');
      expect(impact).toHaveProperty('estimatedDowntime');
      expect(impact).toHaveProperty('dataLossRisk');
      expect(impact).toHaveProperty('breakingChanges');
      expect(impact).toHaveProperty('recommendations');
      
      expect(impact.changes).toBeInstanceOf(Array);
      expect(impact.risks).toBeInstanceOf(Array);
      expect(impact.affectedQueries).toBeInstanceOf(Array);
      expect(typeof impact.estimatedDowntime).toBe('number');
      expect(['none', 'low', 'medium', 'high']).toContain(impact.dataLossRisk);
      expect(typeof impact.breakingChanges).toBe('boolean');
      expect(impact.recommendations).toBeInstanceOf(Array);
    });
  });

  describe('generateMigration - Migration Generator', () => {
    let migrationTestTenantId: string;
    let migrationTestUserId: string;

    beforeAll(async () => {
      const existingTenants = await db.select().from(tenants).where(eq(tenants.slug, 'test-migration'));
      for (const tenant of existingTenants) {
        await db.delete(schemaVersions).where(eq(schemaVersions.tenantId, tenant.id));
        await db.delete(tenants).where(eq(tenants.id, tenant.id));
      }
      const existingUsers = await db.select().from(users).where(eq(users.email, 'migration-test@example.com'));
      for (const user of existingUsers) {
        await db.delete(users).where(eq(users.id, user.id));
      }

      const tenant = await db.insert(tenants).values({
        name: 'Test Tenant for Migration',
        slug: 'test-migration',
        status: 'active',
      }).returning();
      migrationTestTenantId = tenant[0].id;

      const user = await db.insert(users).values({
        email: 'migration-test@example.com',
        firstName: 'Migration',
        lastName: 'Test',
        password: 'test123',
      }).returning();
      migrationTestUserId = user[0].id;
    });

    afterAll(async () => {
      await db.delete(schemaVersions).where(eq(schemaVersions.tenantId, migrationTestTenantId));
      await db.delete(tenants).where(eq(tenants.id, migrationTestTenantId));
      await db.delete(users).where(eq(users.id, migrationTestUserId));
    });

    it('should generate correct DDL for table add', async () => {
      const snapshot1 = await schemaEvolutionService.captureSnapshot(
        migrationTestTenantId,
        migrationTestUserId,
        'Before table add'
      );

      const snapshot2 = await schemaEvolutionService.captureSnapshot(
        migrationTestTenantId,
        migrationTestUserId,
        'After table add'
      );

      const snapshot2Modified = { ...snapshot2 };
      snapshot2Modified.tables = [
        ...snapshot2.tables,
        {
          name: 'new_test_table',
          columns: [
            { name: 'id', type: 'uuid', nullable: false, isPrimaryKey: true, isForeignKey: false },
            { name: 'name', type: 'text', nullable: false, isPrimaryKey: false, isForeignKey: false, default: "''" },
            { name: 'email', type: 'text', nullable: true, isPrimaryKey: false, isForeignKey: false }
          ],
          indexes: [],
          constraints: []
        }
      ];

      await db.insert(schemaVersions).values({
        tenantId: migrationTestTenantId,
        version: snapshot2.version,
        schemaSnapshot: snapshot2Modified as any,
        changesSummary: 'Table add test',
        promotedBy: migrationTestUserId,
      }).onConflictDoUpdate({
        target: [schemaVersions.tenantId, schemaVersions.version],
        set: { schemaSnapshot: snapshot2Modified as any }
      });

      const diff = await schemaEvolutionService.diff(
        migrationTestTenantId,
        snapshot1.version,
        snapshot2.version
      );

      const impact = await schemaEvolutionService.analyzeImpact(diff);
      const migration = await schemaEvolutionService.generateMigration(
        migrationTestTenantId,
        diff,
        impact
      );

      expect(migration).toBeDefined();
      expect(migration.id).toBeDefined();
      expect(migration.tenantId).toBe(migrationTestTenantId);
      expect(migration.upSql).toBeInstanceOf(Array);
      expect(migration.downSql).toBeInstanceOf(Array);
      expect(migration.upSql[0]).toContain('CREATE TABLE new_test_table');
      expect(migration.upSql[0]).toContain('id UUID PRIMARY KEY');
      expect(migration.upSql[0]).toContain('name TEXT NOT NULL');
      expect(migration.upSql[0]).toContain('email TEXT');
      expect(migration.upSql[0]).toContain('BEGIN;');
      expect(migration.upSql[0]).toContain('COMMIT;');
      expect(migration.downSql[0]).toContain('DROP TABLE IF EXISTS new_test_table');
    });

    it('should generate correct DDL for table drop with warnings', async () => {
      const snapshot1 = await schemaEvolutionService.captureSnapshot(
        migrationTestTenantId,
        migrationTestUserId,
        'Before table drop'
      );

      const snapshot2 = await schemaEvolutionService.captureSnapshot(
        migrationTestTenantId,
        migrationTestUserId,
        'After table drop'
      );

      const snapshot2Modified = { ...snapshot2 };
      snapshot2Modified.tables = snapshot2.tables.filter(t => t.name !== 'users');

      await db.insert(schemaVersions).values({
        tenantId: migrationTestTenantId,
        version: snapshot2.version,
        schemaSnapshot: snapshot2Modified as any,
        changesSummary: 'Table drop test',
        promotedBy: migrationTestUserId,
      }).onConflictDoUpdate({
        target: [schemaVersions.tenantId, schemaVersions.version],
        set: { schemaSnapshot: snapshot2Modified as any }
      });

      const diff = await schemaEvolutionService.diff(
        migrationTestTenantId,
        snapshot1.version,
        snapshot2.version
      );

      const impact = await schemaEvolutionService.analyzeImpact(diff);
      const migration = await schemaEvolutionService.generateMigration(
        migrationTestTenantId,
        diff,
        impact
      );

      expect(migration.upSql[0]).toContain('-- CRITICAL: table_drop on users');
      expect(migration.upSql[0]).toContain('-- Recommendation: Backup data first');
      expect(migration.upSql[0]).toContain('-- WARNING: Data loss! Backup required');
      expect(migration.upSql[0]).toContain('DROP TABLE IF EXISTS users');
      expect(migration.requiresDowntime).toBe(true);
    });

    it('should generate correct DDL for column add (nullable)', async () => {
      const snapshot1 = await schemaEvolutionService.captureSnapshot(
        migrationTestTenantId,
        migrationTestUserId,
        'Before nullable column add'
      );

      const snapshot2 = await schemaEvolutionService.captureSnapshot(
        migrationTestTenantId,
        migrationTestUserId,
        'After nullable column add'
      );

      const snapshot2Modified = { ...snapshot2 };
      const tenantsTable = snapshot2Modified.tables.find(t => t.name === 'tenants');
      if (tenantsTable) {
        tenantsTable.columns = [
          ...tenantsTable.columns,
          { name: 'test_nullable_col', type: 'text', nullable: true, isPrimaryKey: false, isForeignKey: false }
        ];
      }

      await db.insert(schemaVersions).values({
        tenantId: migrationTestTenantId,
        version: snapshot2.version,
        schemaSnapshot: snapshot2Modified as any,
        changesSummary: 'Nullable column add test',
        promotedBy: migrationTestUserId,
      }).onConflictDoUpdate({
        target: [schemaVersions.tenantId, schemaVersions.version],
        set: { schemaSnapshot: snapshot2Modified as any }
      });

      const diff = await schemaEvolutionService.diff(
        migrationTestTenantId,
        snapshot1.version,
        snapshot2.version
      );

      const impact = await schemaEvolutionService.analyzeImpact(diff);
      const migration = await schemaEvolutionService.generateMigration(
        migrationTestTenantId,
        diff,
        impact
      );

      expect(migration.upSql[0]).toContain('ALTER TABLE tenants ADD COLUMN test_nullable_col TEXT');
      expect(migration.upSql[0]).not.toContain('NOT NULL');
      expect(migration.downSql[0]).toContain('ALTER TABLE tenants DROP COLUMN test_nullable_col');
    });

    it('should throw error for NOT NULL column without default value', async () => {
      const snapshot1 = await schemaEvolutionService.captureSnapshot(
        migrationTestTenantId,
        migrationTestUserId,
        'Before unsafe NOT NULL column add'
      );

      const snapshot2 = await schemaEvolutionService.captureSnapshot(
        migrationTestTenantId,
        migrationTestUserId,
        'After unsafe NOT NULL column add'
      );

      const snapshot2Modified = { ...snapshot2 };
      const tenantsTable = snapshot2Modified.tables.find(t => t.name === 'tenants');
      if (tenantsTable) {
        tenantsTable.columns = [
          ...tenantsTable.columns,
          { name: 'unsafe_column', type: 'integer', nullable: false, isPrimaryKey: false, isForeignKey: false }
        ];
      }

      await db.insert(schemaVersions).values({
        tenantId: migrationTestTenantId,
        version: snapshot2.version,
        schemaSnapshot: snapshot2Modified as any,
        changesSummary: 'Unsafe NOT NULL column add test',
        promotedBy: migrationTestUserId,
      }).onConflictDoUpdate({
        target: [schemaVersions.tenantId, schemaVersions.version],
        set: { schemaSnapshot: snapshot2Modified as any }
      });

      const diff = await schemaEvolutionService.diff(
        migrationTestTenantId,
        snapshot1.version,
        snapshot2.version
      );

      const impact = await schemaEvolutionService.analyzeImpact(diff);

      await expect(
        schemaEvolutionService.generateMigration(
          migrationTestTenantId,
          diff,
          impact
        )
      ).rejects.toThrow(/Cannot generate migration.*NOT NULL.*without explicit default/);
    });

    it('should generate correct DDL for column add (NOT NULL) with data migration steps', async () => {
      const snapshot1 = await schemaEvolutionService.captureSnapshot(
        migrationTestTenantId,
        migrationTestUserId,
        'Before NOT NULL column add'
      );

      const snapshot2 = await schemaEvolutionService.captureSnapshot(
        migrationTestTenantId,
        migrationTestUserId,
        'After NOT NULL column add'
      );

      const snapshot2Modified = { ...snapshot2 };
      const tenantsTable = snapshot2Modified.tables.find(t => t.name === 'tenants');
      if (tenantsTable) {
        tenantsTable.columns = [
          ...tenantsTable.columns,
          { name: 'test_not_null_col', type: 'text', nullable: false, isPrimaryKey: false, isForeignKey: false, default: "'default'" }
        ];
      }

      await db.insert(schemaVersions).values({
        tenantId: migrationTestTenantId,
        version: snapshot2.version,
        schemaSnapshot: snapshot2Modified as any,
        changesSummary: 'NOT NULL column add test',
        promotedBy: migrationTestUserId,
      }).onConflictDoUpdate({
        target: [schemaVersions.tenantId, schemaVersions.version],
        set: { schemaSnapshot: snapshot2Modified as any }
      });

      const diff = await schemaEvolutionService.diff(
        migrationTestTenantId,
        snapshot1.version,
        snapshot2.version
      );

      const impact = await schemaEvolutionService.analyzeImpact(diff);
      const migration = await schemaEvolutionService.generateMigration(
        migrationTestTenantId,
        diff,
        impact
      );

      expect(migration.upSql[0]).toContain('ALTER TABLE tenants ADD COLUMN test_not_null_col TEXT DEFAULT');
      expect(migration.upSql[0]).toContain('ALTER TABLE tenants ALTER COLUMN test_not_null_col SET NOT NULL');
      expect(migration.upSql[0]).toContain('ALTER TABLE tenants ALTER COLUMN test_not_null_col DROP DEFAULT');
    });

    it('REGRESSION: should NOT generate invalid DEFAULT for NOT NULL integer column without default', async () => {
      const snapshot1 = await schemaEvolutionService.captureSnapshot(
        migrationTestTenantId,
        migrationTestUserId,
        'Before integer NOT NULL without default'
      );

      const snapshot2 = await schemaEvolutionService.captureSnapshot(
        migrationTestTenantId,
        migrationTestUserId,
        'After integer NOT NULL without default'
      );

      const snapshot2Modified = { ...snapshot2 };
      const tenantsTable = snapshot2Modified.tables.find(t => t.name === 'tenants');
      if (tenantsTable) {
        tenantsTable.columns = [
          ...tenantsTable.columns,
          { name: 'age', type: 'integer', nullable: false, isPrimaryKey: false, isForeignKey: false }
        ];
      }

      await db.insert(schemaVersions).values({
        tenantId: migrationTestTenantId,
        version: snapshot2.version,
        schemaSnapshot: snapshot2Modified as any,
        changesSummary: 'Integer NOT NULL without default',
        promotedBy: migrationTestUserId,
      }).onConflictDoUpdate({
        target: [schemaVersions.tenantId, schemaVersions.version],
        set: { schemaSnapshot: snapshot2Modified as any }
      });

      const diff = await schemaEvolutionService.diff(
        migrationTestTenantId,
        snapshot1.version,
        snapshot2.version
      );

      const impact = await schemaEvolutionService.analyzeImpact(diff);
      const migration = await schemaEvolutionService.generateMigration(
        migrationTestTenantId,
        diff,
        impact
      );

      expect(migration.upSql[0]).not.toContain("DEFAULT ''");
      expect(migration.upSql[0]).toContain('ALTER TABLE tenants ADD COLUMN age INTEGER;');
      expect(migration.upSql[0]).toContain('-- TODO: Backfill data for tenants.age before setting NOT NULL');
      expect(migration.upSql[0]).toContain('ALTER TABLE tenants ALTER COLUMN age SET NOT NULL');
    });

    it('REGRESSION: should NOT generate invalid DEFAULT for NOT NULL boolean column without default', async () => {
      const snapshot1 = await schemaEvolutionService.captureSnapshot(
        migrationTestTenantId,
        migrationTestUserId,
        'Before boolean NOT NULL without default'
      );

      const snapshot2 = await schemaEvolutionService.captureSnapshot(
        migrationTestTenantId,
        migrationTestUserId,
        'After boolean NOT NULL without default'
      );

      const snapshot2Modified = { ...snapshot2 };
      const tenantsTable = snapshot2Modified.tables.find(t => t.name === 'tenants');
      if (tenantsTable) {
        tenantsTable.columns = [
          ...tenantsTable.columns,
          { name: 'is_active', type: 'boolean', nullable: false, isPrimaryKey: false, isForeignKey: false }
        ];
      }

      await db.insert(schemaVersions).values({
        tenantId: migrationTestTenantId,
        version: snapshot2.version,
        schemaSnapshot: snapshot2Modified as any,
        changesSummary: 'Boolean NOT NULL without default',
        promotedBy: migrationTestUserId,
      }).onConflictDoUpdate({
        target: [schemaVersions.tenantId, schemaVersions.version],
        set: { schemaSnapshot: snapshot2Modified as any }
      });

      const diff = await schemaEvolutionService.diff(
        migrationTestTenantId,
        snapshot1.version,
        snapshot2.version
      );

      const impact = await schemaEvolutionService.analyzeImpact(diff);
      const migration = await schemaEvolutionService.generateMigration(
        migrationTestTenantId,
        diff,
        impact
      );

      expect(migration.upSql[0]).not.toContain("DEFAULT ''");
      expect(migration.upSql[0]).toContain('ALTER TABLE tenants ADD COLUMN is_active BOOLEAN;');
      expect(migration.upSql[0]).toContain('-- TODO: Backfill data for tenants.is_active before setting NOT NULL');
      expect(migration.upSql[0]).toContain('ALTER TABLE tenants ALTER COLUMN is_active SET NOT NULL');
    });

    it('REGRESSION: should NOT generate invalid DEFAULT for NOT NULL timestamp column without default', async () => {
      const snapshot1 = await schemaEvolutionService.captureSnapshot(
        migrationTestTenantId,
        migrationTestUserId,
        'Before timestamp NOT NULL without default'
      );

      const snapshot2 = await schemaEvolutionService.captureSnapshot(
        migrationTestTenantId,
        migrationTestUserId,
        'After timestamp NOT NULL without default'
      );

      const snapshot2Modified = { ...snapshot2 };
      const tenantsTable = snapshot2Modified.tables.find(t => t.name === 'tenants');
      if (tenantsTable) {
        tenantsTable.columns = [
          ...tenantsTable.columns,
          { name: 'last_login', type: 'timestamp', nullable: false, isPrimaryKey: false, isForeignKey: false }
        ];
      }

      await db.insert(schemaVersions).values({
        tenantId: migrationTestTenantId,
        version: snapshot2.version,
        schemaSnapshot: snapshot2Modified as any,
        changesSummary: 'Timestamp NOT NULL without default',
        promotedBy: migrationTestUserId,
      }).onConflictDoUpdate({
        target: [schemaVersions.tenantId, schemaVersions.version],
        set: { schemaSnapshot: snapshot2Modified as any }
      });

      const diff = await schemaEvolutionService.diff(
        migrationTestTenantId,
        snapshot1.version,
        snapshot2.version
      );

      const impact = await schemaEvolutionService.analyzeImpact(diff);
      const migration = await schemaEvolutionService.generateMigration(
        migrationTestTenantId,
        diff,
        impact
      );

      expect(migration.upSql[0]).not.toContain("DEFAULT ''");
      expect(migration.upSql[0]).toContain('ALTER TABLE tenants ADD COLUMN last_login TIMESTAMP;');
      expect(migration.upSql[0]).toContain('-- TODO: Backfill data for tenants.last_login before setting NOT NULL');
      expect(migration.upSql[0]).toContain('ALTER TABLE tenants ALTER COLUMN last_login SET NOT NULL');
    });

    it('should generate correct DDL for column drop with warnings', async () => {
      const snapshot1 = await schemaEvolutionService.captureSnapshot(
        migrationTestTenantId,
        migrationTestUserId,
        'Before column drop'
      );

      const snapshot2 = await schemaEvolutionService.captureSnapshot(
        migrationTestTenantId,
        migrationTestUserId,
        'After column drop'
      );

      const snapshot2Modified = { ...snapshot2 };
      const tenantsTable = snapshot2Modified.tables.find(t => t.name === 'tenants');
      if (tenantsTable) {
        tenantsTable.columns = tenantsTable.columns.filter(c => c.name !== 'status');
      }

      await db.insert(schemaVersions).values({
        tenantId: migrationTestTenantId,
        version: snapshot2.version,
        schemaSnapshot: snapshot2Modified as any,
        changesSummary: 'Column drop test',
        promotedBy: migrationTestUserId,
      }).onConflictDoUpdate({
        target: [schemaVersions.tenantId, schemaVersions.version],
        set: { schemaSnapshot: snapshot2Modified as any }
      });

      const diff = await schemaEvolutionService.diff(
        migrationTestTenantId,
        snapshot1.version,
        snapshot2.version
      );

      const impact = await schemaEvolutionService.analyzeImpact(diff);
      const migration = await schemaEvolutionService.generateMigration(
        migrationTestTenantId,
        diff,
        impact
      );

      expect(migration.upSql[0]).toContain('-- CRITICAL: column_drop on tenants');
      expect(migration.upSql[0]).toContain('-- WARNING: Data loss!');
      expect(migration.upSql[0]).toContain('ALTER TABLE tenants DROP COLUMN status');
    });

    it('should generate correct DDL for column type modification', async () => {
      const snapshot1 = await schemaEvolutionService.captureSnapshot(
        migrationTestTenantId,
        migrationTestUserId,
        'Before column modify'
      );

      const snapshot2 = await schemaEvolutionService.captureSnapshot(
        migrationTestTenantId,
        migrationTestUserId,
        'After column modify'
      );

      const snapshot2Modified = { ...snapshot2 };
      const tenantsTable = snapshot2Modified.tables.find(t => t.name === 'tenants');
      if (tenantsTable) {
        const slugColumn = tenantsTable.columns.find(c => c.name === 'slug');
        if (slugColumn) {
          slugColumn.type = 'varchar';
        }
      }

      await db.insert(schemaVersions).values({
        tenantId: migrationTestTenantId,
        version: snapshot2.version,
        schemaSnapshot: snapshot2Modified as any,
        changesSummary: 'Column modify test',
        promotedBy: migrationTestUserId,
      }).onConflictDoUpdate({
        target: [schemaVersions.tenantId, schemaVersions.version],
        set: { schemaSnapshot: snapshot2Modified as any }
      });

      const diff = await schemaEvolutionService.diff(
        migrationTestTenantId,
        snapshot1.version,
        snapshot2.version
      );

      const impact = await schemaEvolutionService.analyzeImpact(diff);
      const migration = await schemaEvolutionService.generateMigration(
        migrationTestTenantId,
        diff,
        impact
      );

      expect(migration.upSql[0]).toContain('-- HIGH RISK: column_modify on tenants');
      expect(migration.upSql[0]).toContain('ALTER TABLE tenants ALTER COLUMN slug TYPE VARCHAR USING slug::VARCHAR');
      expect(migration.downSql[0]).toContain('ALTER TABLE tenants ALTER COLUMN slug TYPE');
    });

    it('should generate correct DDL for index add', async () => {
      const snapshot1 = await schemaEvolutionService.captureSnapshot(
        migrationTestTenantId,
        migrationTestUserId,
        'Before index add'
      );

      const snapshot2 = await schemaEvolutionService.captureSnapshot(
        migrationTestTenantId,
        migrationTestUserId,
        'After index add'
      );

      const snapshot2Modified = { ...snapshot2 };
      const tenantsTable = snapshot2Modified.tables.find(t => t.name === 'tenants');
      if (tenantsTable) {
        tenantsTable.indexes = [
          ...tenantsTable.indexes,
          { name: 'idx_test_new', columns: ['name'], unique: false, type: 'btree' }
        ];
      }

      await db.insert(schemaVersions).values({
        tenantId: migrationTestTenantId,
        version: snapshot2.version,
        schemaSnapshot: snapshot2Modified as any,
        changesSummary: 'Index add test',
        promotedBy: migrationTestUserId,
      }).onConflictDoUpdate({
        target: [schemaVersions.tenantId, schemaVersions.version],
        set: { schemaSnapshot: snapshot2Modified as any }
      });

      const diff = await schemaEvolutionService.diff(
        migrationTestTenantId,
        snapshot1.version,
        snapshot2.version
      );

      const impact = await schemaEvolutionService.analyzeImpact(diff);
      const migration = await schemaEvolutionService.generateMigration(
        migrationTestTenantId,
        diff,
        impact
      );

      expect(migration.upSql[0]).toContain('CREATE INDEX idx_test_new ON tenants(name) USING BTREE');
      expect(migration.downSql[0]).toContain('DROP INDEX IF EXISTS idx_test_new');
    });

    it('should generate correct DDL for index drop', async () => {
      const snapshot1 = await schemaEvolutionService.captureSnapshot(
        migrationTestTenantId,
        migrationTestUserId,
        'Before index drop'
      );

      const snapshot2 = await schemaEvolutionService.captureSnapshot(
        migrationTestTenantId,
        migrationTestUserId,
        'After index drop'
      );

      const snapshot2Modified = { ...snapshot2 };
      const tenantsTable = snapshot2Modified.tables.find(t => t.name === 'tenants');
      if (tenantsTable && tenantsTable.indexes.length > 0) {
        const indexToRemove = tenantsTable.indexes[0].name;
        tenantsTable.indexes = tenantsTable.indexes.filter(idx => idx.name !== indexToRemove);
      }

      await db.insert(schemaVersions).values({
        tenantId: migrationTestTenantId,
        version: snapshot2.version,
        schemaSnapshot: snapshot2Modified as any,
        changesSummary: 'Index drop test',
        promotedBy: migrationTestUserId,
      }).onConflictDoUpdate({
        target: [schemaVersions.tenantId, schemaVersions.version],
        set: { schemaSnapshot: snapshot2Modified as any }
      });

      const diff = await schemaEvolutionService.diff(
        migrationTestTenantId,
        snapshot1.version,
        snapshot2.version
      );

      const impact = await schemaEvolutionService.analyzeImpact(diff);
      const migration = await schemaEvolutionService.generateMigration(
        migrationTestTenantId,
        diff,
        impact
      );

      expect(migration.upSql[0]).toContain('DROP INDEX IF EXISTS');
    });

    it('should order changes by safe execution phase', async () => {
      const snapshot1 = await schemaEvolutionService.captureSnapshot(
        migrationTestTenantId,
        migrationTestUserId,
        'Before mixed operations'
      );

      const snapshot2 = await schemaEvolutionService.captureSnapshot(
        migrationTestTenantId,
        migrationTestUserId,
        'After mixed operations'
      );

      const snapshot2Modified = { ...snapshot2 };
      
      snapshot2Modified.tables = snapshot2.tables.filter(t => t.name !== 'users');
      
      snapshot2Modified.tables = [
        ...snapshot2Modified.tables,
        {
          name: 'new_safe_table',
          columns: [
            { name: 'id', type: 'uuid', nullable: false, isPrimaryKey: true, isForeignKey: false }
          ],
          indexes: [],
          constraints: []
        }
      ];

      const tenantsTable = snapshot2Modified.tables.find(t => t.name === 'tenants');
      if (tenantsTable) {
        tenantsTable.columns = [
          ...tenantsTable.columns,
          { name: 'safe_nullable', type: 'text', nullable: true, isPrimaryKey: false, isForeignKey: false }
        ];
        tenantsTable.indexes = [
          ...tenantsTable.indexes,
          { name: 'idx_safe_new', columns: ['name'], unique: false }
        ];
      }

      await db.insert(schemaVersions).values({
        tenantId: migrationTestTenantId,
        version: snapshot2.version,
        schemaSnapshot: snapshot2Modified as any,
        changesSummary: 'Safe ordering test',
        promotedBy: migrationTestUserId,
      }).onConflictDoUpdate({
        target: [schemaVersions.tenantId, schemaVersions.version],
        set: { schemaSnapshot: snapshot2Modified as any }
      });

      const diff = await schemaEvolutionService.diff(
        migrationTestTenantId,
        snapshot1.version,
        snapshot2.version
      );

      const impact = await schemaEvolutionService.analyzeImpact(diff);
      const migration = await schemaEvolutionService.generateMigration(
        migrationTestTenantId,
        diff,
        impact
      );

      const upScript = migration.upSql[0];
      
      const createTablePos = upScript.indexOf('CREATE TABLE new_safe_table');
      const addColumnPos = upScript.indexOf('ALTER TABLE tenants ADD COLUMN safe_nullable');
      const createIndexPos = upScript.indexOf('CREATE INDEX idx_safe_new');
      const dropTablePos = upScript.indexOf('DROP TABLE IF EXISTS users');

      expect(createTablePos).toBeLessThan(dropTablePos);
      expect(addColumnPos).toBeLessThan(dropTablePos);
      expect(createIndexPos).toBeLessThan(dropTablePos);
    });

    it('should wrap scripts in transaction boundaries', async () => {
      const snapshot1 = await schemaEvolutionService.captureSnapshot(
        migrationTestTenantId,
        migrationTestUserId,
        'Before transaction test'
      );

      const snapshot2 = await schemaEvolutionService.captureSnapshot(
        migrationTestTenantId,
        migrationTestUserId,
        'After transaction test'
      );

      const snapshot2Modified = { ...snapshot2 };
      const tenantsTable = snapshot2Modified.tables.find(t => t.name === 'tenants');
      if (tenantsTable) {
        tenantsTable.columns = [
          ...tenantsTable.columns,
          { name: 'tx_test', type: 'text', nullable: true, isPrimaryKey: false, isForeignKey: false }
        ];
      }

      await db.insert(schemaVersions).values({
        tenantId: migrationTestTenantId,
        version: snapshot2.version,
        schemaSnapshot: snapshot2Modified as any,
        changesSummary: 'Transaction test',
        promotedBy: migrationTestUserId,
      }).onConflictDoUpdate({
        target: [schemaVersions.tenantId, schemaVersions.version],
        set: { schemaSnapshot: snapshot2Modified as any }
      });

      const diff = await schemaEvolutionService.diff(
        migrationTestTenantId,
        snapshot1.version,
        snapshot2.version
      );

      const impact = await schemaEvolutionService.analyzeImpact(diff);
      const migration = await schemaEvolutionService.generateMigration(
        migrationTestTenantId,
        diff,
        impact
      );

      expect(migration.upSql[0]).toMatch(/^BEGIN;/);
      expect(migration.upSql[0]).toMatch(/COMMIT;$/);
      expect(migration.downSql[0]).toMatch(/^BEGIN;/);
      expect(migration.downSql[0]).toMatch(/COMMIT;$/);
    });

    it('should generate rollback script with reversed operations', async () => {
      const snapshot1 = await schemaEvolutionService.captureSnapshot(
        migrationTestTenantId,
        migrationTestUserId,
        'Before rollback test'
      );

      const snapshot2 = await schemaEvolutionService.captureSnapshot(
        migrationTestTenantId,
        migrationTestUserId,
        'After rollback test'
      );

      const snapshot2Modified = { ...snapshot2 };
      const tenantsTable = snapshot2Modified.tables.find(t => t.name === 'tenants');
      if (tenantsTable) {
        tenantsTable.columns = [
          ...tenantsTable.columns,
          { name: 'rollback_test_col', type: 'text', nullable: true, isPrimaryKey: false, isForeignKey: false }
        ];
        tenantsTable.indexes = [
          ...tenantsTable.indexes,
          { name: 'idx_rollback_test', columns: ['name'], unique: false }
        ];
      }

      await db.insert(schemaVersions).values({
        tenantId: migrationTestTenantId,
        version: snapshot2.version,
        schemaSnapshot: snapshot2Modified as any,
        changesSummary: 'Rollback test',
        promotedBy: migrationTestUserId,
      }).onConflictDoUpdate({
        target: [schemaVersions.tenantId, schemaVersions.version],
        set: { schemaSnapshot: snapshot2Modified as any }
      });

      const diff = await schemaEvolutionService.diff(
        migrationTestTenantId,
        snapshot1.version,
        snapshot2.version
      );

      const impact = await schemaEvolutionService.analyzeImpact(diff);
      const migration = await schemaEvolutionService.generateMigration(
        migrationTestTenantId,
        diff,
        impact
      );

      expect(migration.downSql[0]).toContain('DROP INDEX IF EXISTS idx_rollback_test');
      expect(migration.downSql[0]).toContain('ALTER TABLE tenants DROP COLUMN rollback_test_col');
      
      const dropIndexPos = migration.downSql[0].indexOf('DROP INDEX IF EXISTS idx_rollback_test');
      const dropColumnPos = migration.downSql[0].indexOf('ALTER TABLE tenants DROP COLUMN rollback_test_col');
      
      expect(dropIndexPos).toBeLessThan(dropColumnPos);
    });

    it('should include migration metadata', async () => {
      const snapshot1 = await schemaEvolutionService.captureSnapshot(
        migrationTestTenantId,
        migrationTestUserId,
        'Before metadata test'
      );

      const snapshot2 = await schemaEvolutionService.captureSnapshot(
        migrationTestTenantId,
        migrationTestUserId,
        'After metadata test'
      );

      const snapshot2Modified = { ...snapshot2 };
      const tenantsTable = snapshot2Modified.tables.find(t => t.name === 'tenants');
      if (tenantsTable) {
        tenantsTable.columns = [
          ...tenantsTable.columns,
          { name: 'meta_test', type: 'text', nullable: true, isPrimaryKey: false, isForeignKey: false }
        ];
      }

      await db.insert(schemaVersions).values({
        tenantId: migrationTestTenantId,
        version: snapshot2.version,
        schemaSnapshot: snapshot2Modified as any,
        changesSummary: 'Metadata test',
        promotedBy: migrationTestUserId,
      }).onConflictDoUpdate({
        target: [schemaVersions.tenantId, schemaVersions.version],
        set: { schemaSnapshot: snapshot2Modified as any }
      });

      const diff = await schemaEvolutionService.diff(
        migrationTestTenantId,
        snapshot1.version,
        snapshot2.version
      );

      const impact = await schemaEvolutionService.analyzeImpact(diff);
      const migration = await schemaEvolutionService.generateMigration(
        migrationTestTenantId,
        diff,
        impact
      );

      expect(migration.id).toBeDefined();
      expect(migration.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
      expect(migration.tenantId).toBe(migrationTestTenantId);
      expect(migration.version).toBe(diff.toVersion);
      expect(migration.description).toContain(`Migration from v${diff.fromVersion} to v${diff.toVersion}`);
      expect(migration.estimatedDuration).toBe(impact.estimatedDowntime);
      expect(migration.createdAt).toBeInstanceOf(Date);
      expect(migration.status).toBe('pending');
    });
  });

  describe('Task 2.1.6 - Integration with schemaVersions Table', () => {
    let integrationTestTenantId: string;
    let integrationTestUserId: string;

    beforeAll(async () => {
      const existingTenants = await db.select().from(tenants).where(eq(tenants.slug, 'test-integration-2-1-6'));
      for (const tenant of existingTenants) {
        await db.delete(schemaVersions).where(eq(schemaVersions.tenantId, tenant.id));
        await db.delete(tenants).where(eq(tenants.id, tenant.id));
      }
      const existingUsers = await db.select().from(users).where(eq(users.email, 'integration-test@example.com'));
      for (const user of existingUsers) {
        await db.delete(users).where(eq(users.id, user.id));
      }

      const tenant = await db.insert(tenants).values({
        name: 'Test Tenant for Integration 2.1.6',
        slug: 'test-integration-2-1-6',
        status: 'active',
      }).returning();
      integrationTestTenantId = tenant[0].id;

      const user = await db.insert(users).values({
        email: 'integration-test@example.com',
        firstName: 'Integration',
        lastName: 'Test',
        password: 'test123',
      }).returning();
      integrationTestUserId = user[0].id;
    });

    afterAll(async () => {
      await db.delete(schemaVersions).where(eq(schemaVersions.tenantId, integrationTestTenantId));
      await db.delete(tenants).where(eq(tenants.id, integrationTestTenantId));
      await db.delete(users).where(eq(users.id, integrationTestUserId));
    });

    describe('listSnapshots', () => {
      it('should return empty array when no snapshots exist', async () => {
        const snapshots = await schemaEvolutionService.listSnapshots(integrationTestTenantId);
        expect(snapshots).toBeInstanceOf(Array);
        expect(snapshots.length).toBe(0);
      });

      it('should return snapshots ordered by version DESC', async () => {
        await schemaEvolutionService.captureSnapshot(integrationTestTenantId, integrationTestUserId, 'V1');
        await schemaEvolutionService.captureSnapshot(integrationTestTenantId, integrationTestUserId, 'V2');
        await schemaEvolutionService.captureSnapshot(integrationTestTenantId, integrationTestUserId, 'V3');

        const snapshots = await schemaEvolutionService.listSnapshots(integrationTestTenantId);

        expect(snapshots.length).toBeGreaterThanOrEqual(3);
        expect(snapshots[0].version).toBeGreaterThan(snapshots[1].version);
        expect(snapshots[1].version).toBeGreaterThan(snapshots[2].version);
      });

      it('should respect the limit parameter', async () => {
        await schemaEvolutionService.captureSnapshot(integrationTestTenantId, integrationTestUserId, 'L1');
        await schemaEvolutionService.captureSnapshot(integrationTestTenantId, integrationTestUserId, 'L2');

        const snapshots = await schemaEvolutionService.listSnapshots(integrationTestTenantId, 2);

        expect(snapshots.length).toBeLessThanOrEqual(2);
      });

      it('should use default limit of 10 when not specified', async () => {
        const snapshots = await schemaEvolutionService.listSnapshots(integrationTestTenantId);

        expect(snapshots.length).toBeLessThanOrEqual(10);
      });

      it('should deserialize timestamp as Date instance', async () => {
        await schemaEvolutionService.captureSnapshot(integrationTestTenantId, integrationTestUserId, 'TS Test');

        const snapshots = await schemaEvolutionService.listSnapshots(integrationTestTenantId, 1);

        expect(snapshots.length).toBeGreaterThan(0);
        expect(snapshots[0].timestamp).toBeInstanceOf(Date);
        expect(typeof snapshots[0].timestamp.getTime).toBe('function');
      });

      it('should return snapshots with complete structure', async () => {
        await schemaEvolutionService.captureSnapshot(integrationTestTenantId, integrationTestUserId, 'Complete test');

        const snapshots = await schemaEvolutionService.listSnapshots(integrationTestTenantId, 1);

        expect(snapshots.length).toBeGreaterThan(0);
        expect(snapshots[0]).toHaveProperty('version');
        expect(snapshots[0]).toHaveProperty('tenantId');
        expect(snapshots[0]).toHaveProperty('timestamp');
        expect(snapshots[0]).toHaveProperty('tables');
        expect(snapshots[0]).toHaveProperty('relationships');
        expect(snapshots[0]).toHaveProperty('metadata');
      });
    });

    describe('getSnapshotsByDateRange', () => {
      it('should return empty array when no snapshots in range', async () => {
        const startDate = new Date('2020-01-01');
        const endDate = new Date('2020-12-31');

        const snapshots = await schemaEvolutionService.getSnapshotsByDateRange(
          integrationTestTenantId,
          startDate,
          endDate
        );

        expect(snapshots).toBeInstanceOf(Array);
        expect(snapshots.length).toBe(0);
      });

      it('should return snapshots within date range', async () => {
        await schemaEvolutionService.captureSnapshot(integrationTestTenantId, integrationTestUserId, 'DR1');

        const now = new Date();
        const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

        const snapshots = await schemaEvolutionService.getSnapshotsByDateRange(
          integrationTestTenantId,
          yesterday,
          tomorrow
        );

        expect(snapshots.length).toBeGreaterThan(0);
      });

      it('should exclude snapshots outside date range', async () => {
        const now = new Date();
        const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

        const snapshots = await schemaEvolutionService.getSnapshotsByDateRange(
          integrationTestTenantId,
          lastWeek,
          yesterday
        );

        for (const snapshot of snapshots) {
          expect(snapshot.timestamp.getTime()).toBeGreaterThanOrEqual(lastWeek.getTime());
          expect(snapshot.timestamp.getTime()).toBeLessThanOrEqual(yesterday.getTime());
        }
      });

      it('should return snapshots ordered by version DESC', async () => {
        const now = new Date();
        const lastMonth = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

        const snapshots = await schemaEvolutionService.getSnapshotsByDateRange(
          integrationTestTenantId,
          lastMonth,
          tomorrow
        );

        for (let i = 0; i < snapshots.length - 1; i++) {
          expect(snapshots[i].version).toBeGreaterThanOrEqual(snapshots[i + 1].version);
        }
      });

      it('should deserialize timestamp as Date instance', async () => {
        const now = new Date();
        const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

        const snapshots = await schemaEvolutionService.getSnapshotsByDateRange(
          integrationTestTenantId,
          yesterday,
          tomorrow
        );

        if (snapshots.length > 0) {
          expect(snapshots[0].timestamp).toBeInstanceOf(Date);
          expect(typeof snapshots[0].timestamp.getTime).toBe('function');
        }
      });
    });

    describe('deleteSnapshot', () => {
      it('should throw error when trying to delete latest snapshot', async () => {
        const snapshot = await schemaEvolutionService.captureSnapshot(
          integrationTestTenantId,
          integrationTestUserId,
          'Latest snapshot'
        );

        await expect(
          schemaEvolutionService.deleteSnapshot(integrationTestTenantId, snapshot.version)
        ).rejects.toThrow('Cannot delete the latest snapshot');
      });

      it('should throw error when snapshot does not exist', async () => {
        await expect(
          schemaEvolutionService.deleteSnapshot(integrationTestTenantId, 99999)
        ).rejects.toThrow('Snapshot not found');
      });

      it('should throw error when no snapshots exist for tenant', async () => {
        const nonExistentTenant = 'non-existent-tenant-id';

        await expect(
          schemaEvolutionService.deleteSnapshot(nonExistentTenant, 1)
        ).rejects.toThrow('No snapshots found for this tenant');
      });

      it('should successfully delete a non-latest snapshot', async () => {
        const snapshot1 = await schemaEvolutionService.captureSnapshot(
          integrationTestTenantId,
          integrationTestUserId,
          'Delete test 1'
        );
        await schemaEvolutionService.captureSnapshot(
          integrationTestTenantId,
          integrationTestUserId,
          'Delete test 2'
        );

        await schemaEvolutionService.deleteSnapshot(integrationTestTenantId, snapshot1.version);

        const snapshot = await schemaEvolutionService.getSnapshot(integrationTestTenantId, snapshot1.version);
        expect(snapshot).toBeNull();
      });

      it('should allow deleting multiple non-latest snapshots', async () => {
        const snapshot1 = await schemaEvolutionService.captureSnapshot(
          integrationTestTenantId,
          integrationTestUserId,
          'Multi delete 1'
        );
        const snapshot2 = await schemaEvolutionService.captureSnapshot(
          integrationTestTenantId,
          integrationTestUserId,
          'Multi delete 2'
        );
        await schemaEvolutionService.captureSnapshot(
          integrationTestTenantId,
          integrationTestUserId,
          'Multi delete 3 (latest)'
        );

        await schemaEvolutionService.deleteSnapshot(integrationTestTenantId, snapshot1.version);
        await schemaEvolutionService.deleteSnapshot(integrationTestTenantId, snapshot2.version);

        const s1 = await schemaEvolutionService.getSnapshot(integrationTestTenantId, snapshot1.version);
        const s2 = await schemaEvolutionService.getSnapshot(integrationTestTenantId, snapshot2.version);

        expect(s1).toBeNull();
        expect(s2).toBeNull();
      });

      it('should throw error when migration references snapshot as fromVersion', async () => {
        const snapshot1 = await schemaEvolutionService.captureSnapshot(
          integrationTestTenantId,
          integrationTestUserId,
          'Snapshot with migration reference 1'
        );
        const snapshot2 = await schemaEvolutionService.captureSnapshot(
          integrationTestTenantId,
          integrationTestUserId,
          'Snapshot with migration reference 2'
        );
        const snapshot3 = await schemaEvolutionService.captureSnapshot(
          integrationTestTenantId,
          integrationTestUserId,
          'Latest snapshot'
        );

        // Create migration referencing snapshot1 as fromVersion
        const migrationId = `migration-from-${Date.now()}`;
        await db.insert(migrations).values({
          id: migrationId,
          tenantId: integrationTestTenantId,
          fromVersion: snapshot1.version,
          toVersion: snapshot2.version,
          status: 'pending',
        });

        await expect(
          schemaEvolutionService.deleteSnapshot(integrationTestTenantId, snapshot1.version)
        ).rejects.toThrow(/Cannot delete snapshot version.*It is referenced by.*migration/);

        // Clean up
        await db.delete(migrations).where(eq(migrations.id, migrationId));
      });

      it('should throw error when migration references snapshot as toVersion', async () => {
        const snapshot1 = await schemaEvolutionService.captureSnapshot(
          integrationTestTenantId,
          integrationTestUserId,
          'Snapshot with migration reference 3'
        );
        const snapshot2 = await schemaEvolutionService.captureSnapshot(
          integrationTestTenantId,
          integrationTestUserId,
          'Snapshot with migration reference 4'
        );
        const snapshot3 = await schemaEvolutionService.captureSnapshot(
          integrationTestTenantId,
          integrationTestUserId,
          'Latest snapshot 2'
        );

        // Create migration referencing snapshot2 as toVersion
        const migrationId = `migration-to-${Date.now()}`;
        await db.insert(migrations).values({
          id: migrationId,
          tenantId: integrationTestTenantId,
          fromVersion: snapshot1.version,
          toVersion: snapshot2.version,
          status: 'pending',
        });

        await expect(
          schemaEvolutionService.deleteSnapshot(integrationTestTenantId, snapshot2.version)
        ).rejects.toThrow(/Cannot delete snapshot version.*It is referenced by.*migration/);

        // Clean up
        await db.delete(migrations).where(eq(migrations.id, migrationId));
      });

      it('should throw error when multiple migrations reference snapshot', async () => {
        const snapshot1 = await schemaEvolutionService.captureSnapshot(
          integrationTestTenantId,
          integrationTestUserId,
          'Snapshot with multiple migrations 1'
        );
        const snapshot2 = await schemaEvolutionService.captureSnapshot(
          integrationTestTenantId,
          integrationTestUserId,
          'Snapshot with multiple migrations 2'
        );
        const snapshot3 = await schemaEvolutionService.captureSnapshot(
          integrationTestTenantId,
          integrationTestUserId,
          'Latest snapshot 3'
        );

        // Create multiple migrations referencing snapshot1
        const migration1Id = `migration-multi-1-${Date.now()}`;
        const migration2Id = `migration-multi-2-${Date.now()}`;
        await db.insert(migrations).values([
          {
            id: migration1Id,
            tenantId: integrationTestTenantId,
            fromVersion: snapshot1.version,
            toVersion: snapshot2.version,
            status: 'pending',
          },
          {
            id: migration2Id,
            tenantId: integrationTestTenantId,
            fromVersion: snapshot1.version,
            toVersion: snapshot3.version,
            status: 'applied',
          }
        ]);

        await expect(
          schemaEvolutionService.deleteSnapshot(integrationTestTenantId, snapshot1.version)
        ).rejects.toThrow(/Cannot delete snapshot version.*It is referenced by 2 migration\(s\)/);

        // Clean up
        await db.delete(migrations).where(eq(migrations.tenantId, integrationTestTenantId));
      });

      it('should successfully delete snapshot when no migrations reference it', async () => {
        const snapshot1 = await schemaEvolutionService.captureSnapshot(
          integrationTestTenantId,
          integrationTestUserId,
          'Unreferenced snapshot 1'
        );
        const snapshot2 = await schemaEvolutionService.captureSnapshot(
          integrationTestTenantId,
          integrationTestUserId,
          'Unreferenced snapshot 2'
        );
        const snapshot3 = await schemaEvolutionService.captureSnapshot(
          integrationTestTenantId,
          integrationTestUserId,
          'Latest unreferenced snapshot'
        );

        // Create migration that doesn't reference snapshot1
        const migrationId = `migration-no-ref-${Date.now()}`;
        await db.insert(migrations).values({
          id: migrationId,
          tenantId: integrationTestTenantId,
          fromVersion: snapshot2.version,
          toVersion: snapshot3.version,
          status: 'pending',
        });

        // Should succeed - snapshot1 is not referenced by any migration
        await schemaEvolutionService.deleteSnapshot(integrationTestTenantId, snapshot1.version);

        const deletedSnapshot = await schemaEvolutionService.getSnapshot(integrationTestTenantId, snapshot1.version);
        expect(deletedSnapshot).toBeNull();

        // Clean up
        await db.delete(migrations).where(eq(migrations.id, migrationId));
      });

      it('should include migration IDs in error message when delete is rejected', async () => {
        const snapshot1 = await schemaEvolutionService.captureSnapshot(
          integrationTestTenantId,
          integrationTestUserId,
          'Snapshot with migration IDs test 1'
        );
        const snapshot2 = await schemaEvolutionService.captureSnapshot(
          integrationTestTenantId,
          integrationTestUserId,
          'Snapshot with migration IDs test 2'
        );

        // Create migration
        const migrationId = `migration-id-check-${Date.now()}`;
        await db.insert(migrations).values({
          id: migrationId,
          tenantId: integrationTestTenantId,
          fromVersion: snapshot1.version,
          toVersion: snapshot2.version,
          status: 'pending',
        });

        try {
          await schemaEvolutionService.deleteSnapshot(integrationTestTenantId, snapshot1.version);
          throw new Error('Should have thrown error');
        } catch (error: any) {
          expect(error.message).toContain(migrationId);
          expect(error.message).toContain('Referenced migrations:');
        }

        // Clean up
        await db.delete(migrations).where(eq(migrations.id, migrationId));
      });
    });

    describe('getVersionHistory', () => {
      it('should return empty array when no versions exist', async () => {
        const emptyTenant = await db.insert(tenants).values({
          name: 'Empty Tenant',
          slug: 'test-empty-version-history',
          status: 'active',
        }).returning();

        const history = await schemaEvolutionService.getVersionHistory(emptyTenant[0].id);

        expect(history).toBeInstanceOf(Array);
        expect(history.length).toBe(0);

        await db.delete(tenants).where(eq(tenants.id, emptyTenant[0].id));
      });

      it('should return version history ordered by version DESC', async () => {
        await schemaEvolutionService.captureSnapshot(integrationTestTenantId, integrationTestUserId, 'VH1');
        await schemaEvolutionService.captureSnapshot(integrationTestTenantId, integrationTestUserId, 'VH2');
        await schemaEvolutionService.captureSnapshot(integrationTestTenantId, integrationTestUserId, 'VH3');

        const history = await schemaEvolutionService.getVersionHistory(integrationTestTenantId);

        expect(history.length).toBeGreaterThanOrEqual(3);
        for (let i = 0; i < history.length - 1; i++) {
          expect(history[i].version).toBeGreaterThan(history[i + 1].version);
        }
      });

      it('should return correct VersionHistoryEntry structure', async () => {
        await schemaEvolutionService.captureSnapshot(
          integrationTestTenantId,
          integrationTestUserId,
          'Structure test'
        );

        const history = await schemaEvolutionService.getVersionHistory(integrationTestTenantId);

        expect(history.length).toBeGreaterThan(0);
        expect(history[0]).toHaveProperty('version');
        expect(history[0]).toHaveProperty('timestamp');
        expect(history[0]).toHaveProperty('promotedBy');
        expect(history[0]).toHaveProperty('changesSummary');
        expect(typeof history[0].version).toBe('number');
        expect(history[0].timestamp).toBeInstanceOf(Date);
      });

      it('should include changesSummary in history', async () => {
        const description = 'Test changes summary for version history';
        await schemaEvolutionService.captureSnapshot(
          integrationTestTenantId,
          integrationTestUserId,
          description
        );

        const history = await schemaEvolutionService.getVersionHistory(integrationTestTenantId);

        const entry = history.find(h => h.changesSummary === description);
        expect(entry).toBeDefined();
        expect(entry!.changesSummary).toBe(description);
      });

      it('should include promotedBy user ID in history', async () => {
        await schemaEvolutionService.captureSnapshot(
          integrationTestTenantId,
          integrationTestUserId,
          'User tracking test'
        );

        const history = await schemaEvolutionService.getVersionHistory(integrationTestTenantId);

        expect(history.length).toBeGreaterThan(0);
        expect(history[0].promotedBy).toBe(integrationTestUserId);
      });

      it('should return timestamp as Date instance', async () => {
        await schemaEvolutionService.captureSnapshot(
          integrationTestTenantId,
          integrationTestUserId,
          'Timestamp type test'
        );

        const history = await schemaEvolutionService.getVersionHistory(integrationTestTenantId);

        expect(history.length).toBeGreaterThan(0);
        expect(history[0].timestamp).toBeInstanceOf(Date);
        expect(typeof history[0].timestamp.getTime).toBe('function');
      });
    });
  });

  // Task 2.1.6 - Bug Fixes Tests
  describe('Bug Fixes - Task 2.1.6', () => {
    let bugFixTenantId: string;
    let bugFixUserId: string;

    beforeAll(async () => {
      // Clean up any existing test data from previous runs
      const existingTenants = await db.select().from(tenants).where(eq(tenants.slug, 'test-bug-fixes-2-1-6'));
      for (const tenant of existingTenants) {
        await db.delete(schemaVersions).where(eq(schemaVersions.tenantId, tenant.id));
        await db.delete(tenants).where(eq(tenants.id, tenant.id));
      }
      const existingUsers = await db.select().from(users).where(eq(users.email, 'bugfix-test@example.com'));
      for (const user of existingUsers) {
        await db.delete(users).where(eq(users.id, user.id));
      }

      const tenant = await db.insert(tenants).values({
        name: 'Test Tenant for Bug Fixes',
        slug: 'test-bug-fixes-2-1-6',
        status: 'active',
      }).returning();
      bugFixTenantId = tenant[0].id;

      const user = await db.insert(users).values({
        email: 'bugfix-test@example.com',
        firstName: 'BugFix',
        lastName: 'Test',
        password: 'test123',
      }).returning();
      bugFixUserId = user[0].id;
    });

    afterAll(async () => {
      await db.delete(schemaVersions).where(eq(schemaVersions.tenantId, bugFixTenantId));
      await db.delete(tenants).where(eq(tenants.id, bugFixTenantId));
      await db.delete(users).where(eq(users.id, bugFixUserId));
    });

    describe('Bug 2: Timestamp Deserialization with Different Formats', () => {
      it('should parse ISO string timestamps correctly', async () => {
        // Create a snapshot (which uses Date)
        const snapshot = await schemaEvolutionService.captureSnapshot(
          bugFixTenantId,
          bugFixUserId,
          'ISO string timestamp test'
        );

        // Manually update the snapshot with an ISO string timestamp
        const isoString = new Date('2024-01-15T10:30:00.000Z').toISOString();
        await db.execute(sql`
          UPDATE schema_versions
          SET schema_snapshot = jsonb_set(
            schema_snapshot,
            '{timestamp}',
            to_jsonb(${isoString}::text)
          )
          WHERE tenant_id = ${bugFixTenantId} AND version = ${snapshot.version}
        `);

        // Retrieve and verify it parses correctly
        const retrieved = await schemaEvolutionService.getSnapshot(bugFixTenantId, snapshot.version);
        
        expect(retrieved).toBeDefined();
        expect(retrieved!.timestamp).toBeInstanceOf(Date);
        expect(retrieved!.timestamp.toISOString()).toBe(isoString);
        expect(retrieved!.timestamp.getTime()).toBe(new Date('2024-01-15T10:30:00.000Z').getTime());
      });

      it('should parse numeric epoch timestamps correctly', async () => {
        // Create a snapshot
        const snapshot = await schemaEvolutionService.captureSnapshot(
          bugFixTenantId,
          bugFixUserId,
          'Numeric epoch timestamp test'
        );

        // Manually update the snapshot with a numeric epoch timestamp
        const epochTime = 1705318200000; // 2024-01-15T10:30:00.000Z
        await db.execute(sql`
          UPDATE schema_versions
          SET schema_snapshot = jsonb_set(
            schema_snapshot,
            '{timestamp}',
            to_jsonb(${epochTime}::bigint)
          )
          WHERE tenant_id = ${bugFixTenantId} AND version = ${snapshot.version}
        `);

        // Retrieve and verify it parses correctly
        const retrieved = await schemaEvolutionService.getSnapshot(bugFixTenantId, snapshot.version);
        
        expect(retrieved).toBeDefined();
        expect(retrieved!.timestamp).toBeInstanceOf(Date);
        expect(retrieved!.timestamp.getTime()).toBe(epochTime);
        expect(retrieved!.timestamp.toISOString()).toBe('2024-01-15T10:30:00.000Z');
      });

      it('should handle mixed timestamp formats in listSnapshots', async () => {
        // Create two snapshots
        const snapshot1 = await schemaEvolutionService.captureSnapshot(
          bugFixTenantId,
          bugFixUserId,
          'Mixed format test 1'
        );
        const snapshot2 = await schemaEvolutionService.captureSnapshot(
          bugFixTenantId,
          bugFixUserId,
          'Mixed format test 2'
        );

        // Update one with ISO string and one with numeric epoch
        const isoString = new Date('2024-01-15T10:30:00.000Z').toISOString();
        const epochTime = 1705318200000;

        await db.execute(sql`
          UPDATE schema_versions
          SET schema_snapshot = jsonb_set(
            schema_snapshot,
            '{timestamp}',
            to_jsonb(${isoString}::text)
          )
          WHERE tenant_id = ${bugFixTenantId} AND version = ${snapshot1.version}
        `);

        await db.execute(sql`
          UPDATE schema_versions
          SET schema_snapshot = jsonb_set(
            schema_snapshot,
            '{timestamp}',
            to_jsonb(${epochTime}::bigint)
          )
          WHERE tenant_id = ${bugFixTenantId} AND version = ${snapshot2.version}
        `);

        // Retrieve all snapshots
        const snapshots = await schemaEvolutionService.listSnapshots(bugFixTenantId, 10);

        // Verify all timestamps are properly parsed
        expect(snapshots.length).toBeGreaterThanOrEqual(2);
        snapshots.forEach(snapshot => {
          expect(snapshot.timestamp).toBeInstanceOf(Date);
          expect(typeof snapshot.timestamp.getTime).toBe('function');
          expect(isNaN(snapshot.timestamp.getTime())).toBe(false);
        });
      });

      it('should handle mixed formats in getSnapshotsByDateRange', async () => {
        // Create a snapshot
        const snapshot = await schemaEvolutionService.captureSnapshot(
          bugFixTenantId,
          bugFixUserId,
          'Date range mixed format test'
        );

        // Update with numeric epoch
        const epochTime = 1705318200000;
        await db.execute(sql`
          UPDATE schema_versions
          SET schema_snapshot = jsonb_set(
            schema_snapshot,
            '{timestamp}',
            to_jsonb(${epochTime}::bigint)
          )
          WHERE tenant_id = ${bugFixTenantId} AND version = ${snapshot.version}
        `);

        // Query by date range
        const startDate = new Date('2024-01-01');
        const endDate = new Date('2024-12-31');
        const snapshots = await schemaEvolutionService.getSnapshotsByDateRange(
          bugFixTenantId,
          startDate,
          endDate
        );

        // Verify timestamps are properly parsed
        expect(snapshots.length).toBeGreaterThan(0);
        snapshots.forEach(snapshot => {
          expect(snapshot.timestamp).toBeInstanceOf(Date);
          expect(isNaN(snapshot.timestamp.getTime())).toBe(false);
        });
      });

      it('should handle Date objects (already parsed)', async () => {
        // Create and retrieve a normal snapshot
        const snapshot = await schemaEvolutionService.captureSnapshot(
          bugFixTenantId,
          bugFixUserId,
          'Date object test'
        );

        const retrieved = await schemaEvolutionService.getSnapshot(bugFixTenantId, snapshot.version);

        expect(retrieved).toBeDefined();
        expect(retrieved!.timestamp).toBeInstanceOf(Date);
        expect(isNaN(retrieved!.timestamp.getTime())).toBe(false);
      });

      it('should fallback to current date for invalid timestamps', async () => {
        // Create a snapshot
        const snapshot = await schemaEvolutionService.captureSnapshot(
          bugFixTenantId,
          bugFixUserId,
          'Invalid timestamp test'
        );

        // Update with an invalid timestamp (this is edge case testing)
        await db.execute(sql`
          UPDATE schema_versions
          SET schema_snapshot = jsonb_set(
            schema_snapshot,
            '{timestamp}',
            to_jsonb('invalid-date-string'::text)
          )
          WHERE tenant_id = ${bugFixTenantId} AND version = ${snapshot.version}
        `);

        // Retrieve - should not crash, should use fallback
        const beforeRetrieve = new Date();
        const retrieved = await schemaEvolutionService.getSnapshot(bugFixTenantId, snapshot.version);
        const afterRetrieve = new Date();

        expect(retrieved).toBeDefined();
        expect(retrieved!.timestamp).toBeInstanceOf(Date);
        // Should be around current time (fallback behavior)
        expect(retrieved!.timestamp.getTime()).toBeGreaterThanOrEqual(beforeRetrieve.getTime() - 1000);
        expect(retrieved!.timestamp.getTime()).toBeLessThanOrEqual(afterRetrieve.getTime() + 1000);
      });
    });

    describe('Conservative Delete Protection - Recent Snapshots (Task 2.1.6)', () => {
      it('should prevent deletion of latest snapshot', async () => {
        // Create 5 snapshots
        for (let i = 1; i <= 5; i++) {
          await schemaEvolutionService.captureSnapshot(
            bugFixTenantId,
            bugFixUserId,
            `Delete test snapshot ${i}`
          );
        }

        // Get the latest version
        const latest = await schemaEvolutionService.getLatestSnapshot(bugFixTenantId);
        expect(latest).toBeDefined();

        // Try to delete latest - should fail
        await expect(
          schemaEvolutionService.deleteSnapshot(bugFixTenantId, latest!.version)
        ).rejects.toThrow(/Cannot delete latest snapshot/);
      });

      it('should prevent deletion of recent snapshots (last 3)', async () => {
        // Create a fresh tenant for this test
        const testTenant = await db.insert(tenants).values({
          name: 'Recent Delete Protection Test',
          slug: 'test-recent-delete-protection',
          status: 'active',
        }).returning();
        const testTenantId = testTenant[0].id;

        try {
          // Create 5 snapshots (versions 1-5)
          for (let i = 1; i <= 5; i++) {
            await schemaEvolutionService.captureSnapshot(
              testTenantId,
              bugFixUserId,
              `Snapshot ${i}`
            );
          }

          // Get all snapshots to know exact versions
          const allSnapshots = await schemaEvolutionService.listSnapshots(testTenantId, 10);
          expect(allSnapshots.length).toBe(5);

          // Sort by version DESC to get recent ones
          const sortedVersions = allSnapshots.map(s => s.version).sort((a, b) => b - a);
          
          // Try to delete version 5 (latest) - should fail
          await expect(
            schemaEvolutionService.deleteSnapshot(testTenantId, sortedVersions[0])
          ).rejects.toThrow(/Cannot delete latest snapshot/);

          // Try to delete version 4 (second most recent) - should fail
          await expect(
            schemaEvolutionService.deleteSnapshot(testTenantId, sortedVersions[1])
          ).rejects.toThrow(/Cannot delete recent snapshot/);

          // Try to delete version 3 (third most recent) - should fail
          await expect(
            schemaEvolutionService.deleteSnapshot(testTenantId, sortedVersions[2])
          ).rejects.toThrow(/Cannot delete recent snapshot/);

          // Verify error message contains actionable information
          try {
            await schemaEvolutionService.deleteSnapshot(testTenantId, sortedVersions[1]);
            expect.fail('Should have thrown an error');
          } catch (error: any) {
            expect(error.message).toContain('recent snapshot');
            expect(error.message).toContain('beyond last 3');
            expect(error.message).toContain('Recent versions:');
          }
        } finally {
          // Cleanup
          await db.delete(schemaVersions).where(eq(schemaVersions.tenantId, testTenantId));
          await db.delete(tenants).where(eq(tenants.id, testTenantId));
        }
      });

      it('should allow deletion of old snapshots (beyond last 3)', async () => {
        // Create a fresh tenant for this test
        const testTenant = await db.insert(tenants).values({
          name: 'Old Snapshot Delete Test',
          slug: 'test-old-delete',
          status: 'active',
        }).returning();
        const testTenantId = testTenant[0].id;

        try {
          // Create 5 snapshots
          for (let i = 1; i <= 5; i++) {
            await schemaEvolutionService.captureSnapshot(
              testTenantId,
              bugFixUserId,
              `Old delete snapshot ${i}`
            );
          }

          // Get all snapshots
          const allSnapshots = await schemaEvolutionService.listSnapshots(testTenantId, 10);
          const sortedVersions = allSnapshots.map(s => s.version).sort((a, b) => b - a);

          // Delete version 2 (fourth most recent - OLD snapshot) - should succeed
          await schemaEvolutionService.deleteSnapshot(testTenantId, sortedVersions[3]);

          // Verify it was deleted
          const deleted = await schemaEvolutionService.getSnapshot(testTenantId, sortedVersions[3]);
          expect(deleted).toBeNull();

          // Delete version 1 (fifth most recent - OLD snapshot) - should succeed
          await schemaEvolutionService.deleteSnapshot(testTenantId, sortedVersions[4]);

          // Verify it was deleted
          const deleted2 = await schemaEvolutionService.getSnapshot(testTenantId, sortedVersions[4]);
          expect(deleted2).toBeNull();

          // Verify recent snapshots still exist
          const remaining = await schemaEvolutionService.listSnapshots(testTenantId, 10);
          expect(remaining.length).toBe(3); // Only last 3 remain
        } finally {
          // Cleanup
          await db.delete(schemaVersions).where(eq(schemaVersions.tenantId, testTenantId));
          await db.delete(tenants).where(eq(tenants.id, testTenantId));
        }
      });

      it('should handle edge case with less than 3 snapshots', async () => {
        // Create a fresh tenant for this test
        const testTenant = await db.insert(tenants).values({
          name: 'Edge Case Test',
          slug: 'test-edge-case-delete',
          status: 'active',
        }).returning();
        const testTenantId = testTenant[0].id;

        try {
          // Create only 2 snapshots
          const snapshot1 = await schemaEvolutionService.captureSnapshot(
            testTenantId,
            bugFixUserId,
            'Edge case snapshot 1'
          );
          const snapshot2 = await schemaEvolutionService.captureSnapshot(
            testTenantId,
            bugFixUserId,
            'Edge case snapshot 2'
          );

          // Try to delete version 1 (not latest but within last 3) - should fail
          await expect(
            schemaEvolutionService.deleteSnapshot(testTenantId, snapshot1.version)
          ).rejects.toThrow(/Cannot delete recent snapshot/);

          // Try to delete version 2 (latest) - should fail
          await expect(
            schemaEvolutionService.deleteSnapshot(testTenantId, snapshot2.version)
          ).rejects.toThrow(/Cannot delete latest snapshot/);

          // Both snapshots should still exist
          const remaining = await schemaEvolutionService.listSnapshots(testTenantId, 10);
          expect(remaining.length).toBe(2);
        } finally {
          // Cleanup
          await db.delete(schemaVersions).where(eq(schemaVersions.tenantId, testTenantId));
          await db.delete(tenants).where(eq(tenants.id, testTenantId));
        }
      });

      it('should validate snapshot exists before deletion', async () => {
        // Try to delete non-existent snapshot
        await expect(
          schemaEvolutionService.deleteSnapshot(bugFixTenantId, 99999)
        ).rejects.toThrow(/Snapshot version 99999 not found/);
      });

      it('should validate tenant exists', async () => {
        // Try to delete from non-existent tenant
        await expect(
          schemaEvolutionService.deleteSnapshot('non-existent-tenant-id', 1)
        ).rejects.toThrow(/Tenant non-existent-tenant-id not found/);
      });

      it('should provide clear error messages with actionable information', async () => {
        // Create 4 snapshots
        for (let i = 1; i <= 4; i++) {
          await schemaEvolutionService.captureSnapshot(
            bugFixTenantId,
            bugFixUserId,
            `Error message test ${i}`
          );
        }

        const allSnapshots = await schemaEvolutionService.listSnapshots(bugFixTenantId, 10);
        const sortedVersions = allSnapshots.map(s => s.version).sort((a, b) => b - a);

        // Try to delete recent snapshot and verify error message quality
        try {
          await schemaEvolutionService.deleteSnapshot(bugFixTenantId, sortedVersions[2]);
          expect.fail('Should have thrown an error');
        } catch (error: any) {
          // Error message should contain:
          // 1. What went wrong
          expect(error.message).toContain('Cannot delete recent snapshot');
          
          // 2. Why it's protected
          expect(error.message).toContain('prevent reference conflicts');
          
          // 3. What versions are protected
          expect(error.message).toContain('Recent versions:');
          
          // 4. How to resolve (what's allowed)
          expect(error.message).toContain('beyond last 3');
        }
      });
    });

    // Task 2.1.6: Diff Cache Reference Checks
    describe('Diff Cache Reference Checks', () => {
      let cacheTestTenantId: string;
      let cacheTestUserId: string;

      beforeAll(async () => {
        // Clean up any existing test data
        const existingTenants = await db.select().from(tenants).where(eq(tenants.slug, 'test-cache-diff'));
        for (const tenant of existingTenants) {
          await db.delete(schemaVersions).where(eq(schemaVersions.tenantId, tenant.id));
          await db.delete(tenants).where(eq(tenants.id, tenant.id));
        }
        const existingUsers = await db.select().from(users).where(eq(users.email, 'cache-diff-test@example.com'));
        for (const user of existingUsers) {
          await db.delete(users).where(eq(users.id, user.id));
        }

        // Create test tenant and user
        const tenant = await db.insert(tenants).values({
          name: 'Test Tenant for Cache Diff',
          slug: 'test-cache-diff',
          status: 'active',
        }).returning();
        cacheTestTenantId = tenant[0].id;

        const user = await db.insert(users).values({
          email: 'cache-diff-test@example.com',
          firstName: 'Cache',
          lastName: 'Test',
          password: 'test123',
        }).returning();
        cacheTestUserId = user[0].id;
      });

      afterAll(async () => {
        // Clean up test data
        await db.delete(schemaVersions).where(eq(schemaVersions.tenantId, cacheTestTenantId));
        await db.delete(tenants).where(eq(tenants.id, cacheTestTenantId));
        await db.delete(users).where(eq(users.id, cacheTestUserId));
      });

      it('should cache diff results with correct key format', async () => {
        // Create two snapshots
        const snapshot1 = await schemaEvolutionService.captureSnapshot(
          cacheTestTenantId,
          cacheTestUserId,
          'Version 1'
        );
        const snapshot2 = await schemaEvolutionService.captureSnapshot(
          cacheTestTenantId,
          cacheTestUserId,
          'Version 2'
        );

        // Generate diff (this should cache the result)
        await schemaEvolutionService.diff(
          cacheTestTenantId,
          snapshot1.version,
          snapshot2.version
        );

        // Verify cache key exists with correct format
        const { cache } = await import('../../services/cache.service');
        const allKeys = cache.keys();
        const expectedKey = `schema-diff:${cacheTestTenantId}:${snapshot1.version}:${snapshot2.version}`;
        
        expect(allKeys).toContain(expectedKey);
      });

      it('should block snapshot deletion when cached diffs exist', async () => {
        // Create three snapshots
        const snapshot1 = await schemaEvolutionService.captureSnapshot(
          cacheTestTenantId,
          cacheTestUserId,
          'Snapshot for cache test 1'
        );
        const snapshot2 = await schemaEvolutionService.captureSnapshot(
          cacheTestTenantId,
          cacheTestUserId,
          'Snapshot for cache test 2'
        );
        await schemaEvolutionService.captureSnapshot(
          cacheTestTenantId,
          cacheTestUserId,
          'Snapshot for cache test 3 (latest)'
        );

        // Generate diff (this caches the result)
        await schemaEvolutionService.diff(
          cacheTestTenantId,
          snapshot1.version,
          snapshot2.version
        );

        // Try to delete snapshot1 (should fail due to cached diff)
        await expect(
          schemaEvolutionService.deleteSnapshot(cacheTestTenantId, snapshot1.version)
        ).rejects.toThrow(/Cannot delete snapshot version.*cached diff/);
      });

      it('should allow snapshot deletion when cache is cleared', async () => {
        // Create three snapshots
        const snapshot1 = await schemaEvolutionService.captureSnapshot(
          cacheTestTenantId,
          cacheTestUserId,
          'Clear cache test 1'
        );
        const snapshot2 = await schemaEvolutionService.captureSnapshot(
          cacheTestTenantId,
          cacheTestUserId,
          'Clear cache test 2'
        );
        await schemaEvolutionService.captureSnapshot(
          cacheTestTenantId,
          cacheTestUserId,
          'Clear cache test 3 (latest)'
        );

        // Generate diff (this caches the result)
        await schemaEvolutionService.diff(
          cacheTestTenantId,
          snapshot1.version,
          snapshot2.version
        );

        // Clear the cache
        const { cache } = await import('../../services/cache.service');
        const cacheKey = `schema-diff:${cacheTestTenantId}:${snapshot1.version}:${snapshot2.version}`;
        cache.delete(cacheKey);

        // Now deletion should succeed
        await expect(
          schemaEvolutionService.deleteSnapshot(cacheTestTenantId, snapshot1.version)
        ).resolves.not.toThrow();

        // Verify snapshot was deleted
        const deletedSnapshot = await schemaEvolutionService.getSnapshot(
          cacheTestTenantId,
          snapshot1.version
        );
        expect(deletedSnapshot).toBeNull();
      });

      it('should block deletion when multiple cached diffs reference the version', async () => {
        // Create four snapshots
        const snapshot1 = await schemaEvolutionService.captureSnapshot(
          cacheTestTenantId,
          cacheTestUserId,
          'Multiple diffs test 1'
        );
        const snapshot2 = await schemaEvolutionService.captureSnapshot(
          cacheTestTenantId,
          cacheTestUserId,
          'Multiple diffs test 2'
        );
        const snapshot3 = await schemaEvolutionService.captureSnapshot(
          cacheTestTenantId,
          cacheTestUserId,
          'Multiple diffs test 3'
        );
        await schemaEvolutionService.captureSnapshot(
          cacheTestTenantId,
          cacheTestUserId,
          'Multiple diffs test 4 (latest)'
        );

        // Generate multiple diffs that reference snapshot2
        await schemaEvolutionService.diff(
          cacheTestTenantId,
          snapshot1.version,
          snapshot2.version
        );
        await schemaEvolutionService.diff(
          cacheTestTenantId,
          snapshot2.version,
          snapshot3.version
        );

        // Try to delete snapshot2 (should fail due to multiple cached diffs)
        try {
          await schemaEvolutionService.deleteSnapshot(cacheTestTenantId, snapshot2.version);
          expect.fail('Should have thrown an error');
        } catch (error: any) {
          expect(error.message).toContain('Cannot delete snapshot version');
          expect(error.message).toContain('cached diff');
          expect(error.message).toMatch(/2.*cached diff/); // Should mention 2 diffs
        }
      });

      it('should not block deletion when cached diffs reference different version', async () => {
        // Create four snapshots
        const snapshot1 = await schemaEvolutionService.captureSnapshot(
          cacheTestTenantId,
          cacheTestUserId,
          'Different version test 1'
        );
        const snapshot2 = await schemaEvolutionService.captureSnapshot(
          cacheTestTenantId,
          cacheTestUserId,
          'Different version test 2'
        );
        const snapshot3 = await schemaEvolutionService.captureSnapshot(
          cacheTestTenantId,
          cacheTestUserId,
          'Different version test 3'
        );
        await schemaEvolutionService.captureSnapshot(
          cacheTestTenantId,
          cacheTestUserId,
          'Different version test 4 (latest)'
        );

        // Generate diff that does NOT reference snapshot1
        await schemaEvolutionService.diff(
          cacheTestTenantId,
          snapshot2.version,
          snapshot3.version
        );

        // Deletion of snapshot1 should succeed (no cached diffs reference it)
        await expect(
          schemaEvolutionService.deleteSnapshot(cacheTestTenantId, snapshot1.version)
        ).resolves.not.toThrow();

        // Verify snapshot was deleted
        const deletedSnapshot = await schemaEvolutionService.getSnapshot(
          cacheTestTenantId,
          snapshot1.version
        );
        expect(deletedSnapshot).toBeNull();
      });

      it('should provide clear error message with cache count and keys', async () => {
        // Create three snapshots
        const snapshot1 = await schemaEvolutionService.captureSnapshot(
          cacheTestTenantId,
          cacheTestUserId,
          'Error message test 1'
        );
        const snapshot2 = await schemaEvolutionService.captureSnapshot(
          cacheTestTenantId,
          cacheTestUserId,
          'Error message test 2'
        );
        await schemaEvolutionService.captureSnapshot(
          cacheTestTenantId,
          cacheTestUserId,
          'Error message test 3 (latest)'
        );

        // Generate diff
        await schemaEvolutionService.diff(
          cacheTestTenantId,
          snapshot1.version,
          snapshot2.version
        );

        // Try to delete and verify error message quality
        try {
          await schemaEvolutionService.deleteSnapshot(cacheTestTenantId, snapshot1.version);
          expect.fail('Should have thrown an error');
        } catch (error: any) {
          // Error message should contain:
          // 1. What went wrong
          expect(error.message).toContain('Cannot delete snapshot version');
          
          // 2. How many cache entries
          expect(error.message).toMatch(/1.*cached diff/);
          
          // 3. Guidance on resolution
          expect(error.message).toContain('Clear cache before deletion');
          
          // 4. The actual cache keys
          expect(error.message).toContain('schema-diff:');
        }
      });

      it('should check cache for both fromVersion and toVersion', async () => {
        // Create three snapshots
        const snapshot1 = await schemaEvolutionService.captureSnapshot(
          cacheTestTenantId,
          cacheTestUserId,
          'From/To test 1'
        );
        const snapshot2 = await schemaEvolutionService.captureSnapshot(
          cacheTestTenantId,
          cacheTestUserId,
          'From/To test 2'
        );
        await schemaEvolutionService.captureSnapshot(
          cacheTestTenantId,
          cacheTestUserId,
          'From/To test 3 (latest)'
        );

        // Generate diff with snapshot2 as toVersion
        await schemaEvolutionService.diff(
          cacheTestTenantId,
          snapshot1.version,
          snapshot2.version
        );

        // Try to delete snapshot2 (used as toVersion, should still be blocked)
        await expect(
          schemaEvolutionService.deleteSnapshot(cacheTestTenantId, snapshot2.version)
        ).rejects.toThrow(/Cannot delete snapshot version.*cached diff/);
      });
    });
  });
});
