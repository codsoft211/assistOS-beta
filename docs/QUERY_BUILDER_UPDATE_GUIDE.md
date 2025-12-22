# Query Builder Update Guide - Tenant Schema Support

**Date:** December 3, 2025  
**Status:** Implementation Template Ready

---

## Overview

This guide provides the exact steps to update each module query builder to support tenant schemas. All query builders follow similar patterns, so the same update template applies to all.

---

## Quick Reference

### Query Builders Status

| Module | File | Lines | Status |
|--------|------|-------|--------|
| Financeiro | `packages/modules/financeiro/query-builder.ts` | 200 | ✅ Complete |
| Comercial | `packages/modules/comercial/query-builder.ts` | 190 | ✅ Complete |
| Compras | `packages/modules/compras/query-builder.ts` | 1308 | 🔄 Large file - use wrapper |
| Projetos | `packages/modules/projetos/query-builder.ts` | ~250 | ⏳ Pending |
| Angariacao | `packages/modules/angariacao/query-builder.ts` | ~280 | ⏳ Pending |
| Logistica | `packages/modules/logistica/query-builder.ts` | ~220 | ⏳ Pending |

---

## Approach 1: Direct Update (Simple Query Builders)

For query builders < 300 lines with simple execute() methods.

### Step 1: Add Import
```typescript
import { tenantSchemaService } from '../../../apps/api/services/tenant-schema.service';
```

### Step 2: Update execute() Method
```typescript
// Before
async execute(): Promise<any[]> {
  // ... build query logic
  const result = await db.select().from(table).where(...);
  return result;
}

// After
async execute(schema?: string): Promise<any[]> {
  // Auto-resolve tenant schema
  const targetSchema = schema || 
    await tenantSchemaService.getTenantSchemaName(this.tenantId) || 
    'public';
  
  // ... rest of query logic (use targetSchema in SQL)
}
```

### Step 3: Use Schema in Queries
```typescript
// Build schema-qualified table reference
const tableName = 'your_table_name';
const query = sql`SELECT * FROM ${sql.raw(`"${targetSchema}"."${tableName}"`)} WHERE ...`;

const result = await db.execute(query);
return result.rows as any[];
```

---

## Approach 2: Schema Wrapper (Complex Query Builders)

For large query builders (>300 lines) with many methods.

### Use the Wrapper
```typescript
import { getTenantSchema, executeInTenantSchema } from '../base/tenant-schema-query-wrapper';

export class ComprasQueryBuilder {
  constructor(private tenantId: string) {}

  async listSuppliers(filters: any = {}, options: any = {}) {
    // Get schema automatically
    const schemaName = await getTenantSchema(this.tenantId);
    
    // Use schema in raw SQL
    const query = sql`
      SELECT * FROM "${schemaName}"."suppliers"
      WHERE tenant_id = ${this.tenantId}
      ${filters.status ? sql`AND status = ${filters.status}` : sql``}
    `;
    
    const result = await db.execute(query);
    return result.rows;
  }

  // Or use wrapper helper
  async listPurchaseOrders(filters: any = {}) {
    return executeInTenantSchema(this.tenantId, async (schemaName) => {
      const query = sql`SELECT * FROM "${schemaName}"."purchase_orders" WHERE tenant_id = ${this.tenantId}`;
      const result = await db.execute(query);
      return result.rows;
    });
  }
}
```

---

## Approach 3: Hybrid (Recommended for Production)

Update incrementally, method by method:

### Phase 1: Add Schema Support (Non-Breaking)
```typescript
// Add schema parameter but keep backward compatibility
async listSuppliers(filters: any = {}, options: any = {}, schema?: string) {
  const targetSchema = schema || await getTenantSchema(this.tenantId);
  
  // Build query with schema
  const query = sql`SELECT * FROM "${targetSchema}"."suppliers" WHERE tenant_id = ${this.tenantId}`;
  const result = await db.execute(query);
  return result.rows;
}
```

### Phase 2: Test Each Method
```typescript
// Test with explicit schema
await queryBuilder.listSuppliers({}, {}, 'tenant_abc');

// Test with auto-resolution
await queryBuilder.listSuppliers({}, {}); // Auto-resolves schema
```

### Phase 3: Remove Old Code
Once all methods are updated and tested, clean up unused Drizzle table imports.

---

## Implementation for Each Module

### 1. Compras (Purchasing) Module
**File:** `packages/modules/compras/query-builder.ts` (1308 lines)

**Strategy:** Use wrapper approach (too many methods to update individually)

**Implementation:**
```typescript
import { getTenantSchema } from '../base/tenant-schema-query-wrapper';

export class ComprasQueryBuilder {
  constructor(private tenantId: string) {}
  
  private async getSchema(): Promise<string> {
    return getTenantSchema(this.tenantId);
  }

  async listSuppliers(filters: SupplierFilters = {}, options: QueryOptions = {}) {
    const schema = await this.getSchema();
    
    // Build WHERE conditions as SQL strings
    const conditions = [`tenant_id = '${this.tenantId}'`];
    
    if (filters.type) conditions.push(`type = '${filters.type}'`);
    if (filters.status !== undefined) conditions.push(`status = ${filters.status}`);
    if (filters.isActive !== undefined) conditions.push(`is_active = ${filters.isActive}`);
    
    let query = `SELECT * FROM "${schema}"."suppliers"`;
    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }
    
    if (options.orderBy) {
      query += ` ORDER BY ${options.orderBy} ${options.orderDirection || 'ASC'}`;
    }
    
    if (options.limit) query += ` LIMIT ${options.limit}`;
    if (options.offset) query += ` OFFSET ${options.offset}`;
    
    const result = await db.execute(sql.raw(query));
    return result.rows;
  }

  // Update other methods similarly...
}
```

### 2. Projetos (Projects) Module
**File:** `packages/modules/projetos/query-builder.ts` (~250 lines)

**Strategy:** Direct update (manageable size)

**Key Methods:**
- `execute()` - Main query execution
- `count()` - Row counting
- Custom methods for projects, phases, tasks, resources

### 3. Angariacao (Lead Generation) Module
**File:** `packages/modules/angariacao/query-builder.ts` (~280 lines)

**Strategy:** Direct update

**Key Methods:**
- Lead queries
- Campaign tracking
- Pipeline management

### 4. Logistica (Logistics) Module
**File:** `packages/modules/logistica/query-builder.ts` (~220 lines)

**Strategy:** Direct update (smallest module)

**Key Methods:**
- Warehouse operations
- Kitchen workflows
- Event logistics

---

## Module Routes Update

### Current Pattern
```typescript
router.get('/api/module/entity', async (req, res) => {
  const tenantId = req.tenantId;
  const queryBuilder = new ModuleQueryBuilder(tenantId);
  const results = await queryBuilder.select('entity').execute();
  res.json(results);
});
```

### Updated Pattern
```typescript
router.get('/api/module/entity', async (req, res) => {
  const tenantId = req.tenantId;
  const queryBuilder = new ModuleQueryBuilder(tenantId);
  
  // Schema automatically resolved by query builder
  const results = await queryBuilder.select('entity').execute();
  // OR explicitly pass schema if needed
  // const results = await queryBuilder.select('entity').execute(schemaName);
  
  res.json(results);
});
```

**Good news:** No route changes needed! Query builders auto-resolve schemas.

---

## Testing Checklist

For each module:

- [ ] Import added successfully
- [ ] execute() method updated
- [ ] count() method updated (if exists)
- [ ] Schema parameter optional
- [ ] Auto-resolution works
- [ ] Queries return correct data
- [ ] Data isolation verified
- [ ] Performance acceptable

---

## Performance Optimization

### 1. Use Schema Cache
```typescript
import { getTenantSchema } from '../base/tenant-schema-query-wrapper';

// Fast cached lookup
const schema = await getTenantSchema(tenantId);
```

### 2. Batch Queries
```typescript
// Resolve schema once, use multiple times
const schema = await getTenantSchema(tenantId);

const [suppliers, orders, invoices] = await Promise.all([
  db.execute(sql.raw(`SELECT * FROM "${schema}"."suppliers"`)),
  db.execute(sql.raw(`SELECT * FROM "${schema}"."purchase_orders"`)),
  db.execute(sql.raw(`SELECT * FROM "${schema}"."purchasing_invoices"`)),
]);
```

### 3. Connection Pooling
```typescript
// Set search_path for connection
const client = await pool.connect();
await client.query(`SET search_path TO ${schema}, public`);

// Now all queries use tenant schema by default
await client.query('SELECT * FROM suppliers'); // Uses tenant schema
await client.release();
```

---

## Rollout Plan

### Week 1: Small Modules (Low Risk)
- ✅ Financeiro (200 lines) - Complete
- ✅ Comercial (190 lines) - Complete
- [ ] Logistica (220 lines) - 1 hour
- Total: 1 hour

### Week 2: Medium Modules
- [ ] Projetos (250 lines) - 2 hours
- [ ] Angariacao (280 lines) - 2 hours
- Total: 4 hours

### Week 3: Large Module
- [ ] Compras (1308 lines) - Use wrapper approach - 4 hours
- Total: 4 hours

### Week 4: Testing & Verification
- Integration tests for all modules
- Performance benchmarking
- Data integrity verification

---

## Success Metrics

- [ ] All 6 query builders support tenant schemas
- [ ] All tests passing
- [ ] Performance improved or maintained
- [ ] Zero data leakage between tenants
- [ ] Documentation complete
- [ ] Team trained

---

## Quick Start

**Option 1: Automated Patch (Adds Imports)**
```bash
npm run patch:query-builders:dry-run  # Preview
npm run patch:query-builders          # Apply
```

**Option 2: Manual Update Using Template**
1. Open query builder file
2. Add import: `import { tenantSchemaService } from '...'`
3. Update execute() signature: `async execute(schema?: string)`
4. Add schema resolution: `const schema = schema || await getTenantSchema(this.tenantId)`
5. Use schema in queries
6. Test

**Option 3: Use Wrapper (Large Files)**
1. Import wrapper: `import { getTenantSchema } from '../base/tenant-schema-query-wrapper'`
2. Add private method: `private async getSchema() { return getTenantSchema(this.tenantId); }`
3. Update each method to use `const schema = await this.getSchema()`
4. Build raw SQL queries with schema
5. Test

---

## Support

**Questions?** Refer to:
- `TENANT_SCHEMA_IMPLEMENTATION.md` - Core concepts
- `tenant-schema-query-wrapper.ts` - Wrapper implementation
- `financeiro/query-builder.ts` - Working example
- `comercial/query-builder.ts` - Recently updated example

**Issues?**
- Check schema exists: `SELECT * FROM tenant_schemas WHERE tenant_id = '...'`
- Verify table exists: `\dt tenant_abc.*` (in psql)
- Check logs: Look for "[TenantSchemaService]" messages

---

**Status:** Infrastructure Complete, Templates Ready  
**Next Action:** Update remaining 4 query builders (estimated 11 hours total)  
**Risk Level:** Low (proven pattern, wrapper available for complex cases)

