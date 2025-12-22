# Query Builder Migration to Tenant Schemas

**Date:** December 3, 2025  
**Status:** 🔄 In Progress

## Overview

This document outlines the migration of all module query builders to use tenant schemas instead of the `public` schema.

## Query Builder Pattern

### Before (Public Schema)
```typescript
export class FinanceiroQueryBuilder implements ModuleQueryBuilder {
  async execute(schema: string = 'public'): Promise<any[]> {
    const table = this.getTable();
    
    // Build WHERE conditions
    const whereConditions: any[] = [
      eq((table as any).tenantId, this.tenantId)
    ];
    
    // Query public schema
    const result = await db
      .select()
      .from(table)
      .where(and(...whereConditions));
    
    return result;
  }
}
```

### After (Tenant Schema)
```typescript
export class FinanceiroQueryBuilder implements ModuleQueryBuilder {
  async execute(schema?: string): Promise<any[]> {
    const table = this.getTable();
    
    // Get tenant schema name
    const schemaName = schema || await tenantSchemaService.getTenantSchemaName(this.tenantId);
    if (!schemaName) {
      throw new Error(`No schema found for tenant ${this.tenantId}`);
    }
    
    // Build WHERE conditions (tenant_id filter still needed for safety)
    const whereConditions: any[] = [
      sql`tenant_id = ${this.tenantId}`
    ];
    
    // Apply filters
    for (const filter of this.filters) {
      // ... filter logic
    }
    
    // Use raw SQL for schema-qualified queries
    const tableName = (table as any)._[Symbol.for('drizzle:Name')] || (table as any).name;
    const query = sql`
      SELECT * FROM ${sql.raw(`"${schemaName}"."${tableName}"`)}
      WHERE ${and(...whereConditions)}
    `;
    
    if (this.orderField) {
      query = sql`${query} ORDER BY ${sql.identifier(this.orderField)} ${sql.raw(this.orderDirection)}`;
    }
    
    if (this.limitValue) {
      query = sql`${query} LIMIT ${this.limitValue}`;
    }
    
    if (this.offsetValue) {
      query = sql`${query} OFFSET ${this.offsetValue}`;
    }
    
    const result = await db.execute(query);
    return result.rows as any[];
  }
}
```

## Module Query Builders to Update

### 1. Financeiro Module ✅
**File:** `packages/modules/financeiro/query-builder.ts`

**Tables:**
- invoices
- invoice_items
- payments
- bank_accounts
- chart_of_accounts

**Status:** Partially implemented (schema parameter exists)

**Updates Needed:**
- Use `tenantSchemaService` to resolve schema name
- Update SQL generation for schema-qualified tables
- Remove tenant_id filtering (schema provides isolation)

### 2. Compras (Purchasing) Module
**File:** `packages/modules/compras/query-builder.ts`

**Tables:**
- suppliers
- purchase_orders
- purchase_order_lines
- receipts
- purchasing_invoices

**Updates Needed:**
- Implement schema-aware queries
- Add tenant schema resolution
- Update all CRUD operations

### 3. Comercial (Sales) Module  
**File:** `packages/modules/comercial/query-builder.ts`

**Tables:**
- quotes
- quote_lines
- sales_orders
- service_lines
- pricing_catalogs

**Updates Needed:**
- Schema-qualified table references
- Update SELECT/INSERT/UPDATE operations
- Handle cross-schema foreign keys

### 4. Projetos (Projects) Module
**File:** `packages/modules/projetos/query-builder.ts`

**Tables:**
- projects
- project_phases
- project_tasks
- project_resources
- project_documents

**Updates Needed:**
- Schema resolution
- Custom entity handling
- Foreign key references to public schema (users)

### 5. Angariacao (Lead Generation) Module
**File:** `packages/modules/angariacao/query-builder.ts`

**Tables:**
- commercial_leads
- ad_campaigns
- commercial_pipeline
- commercial_activities

**Updates Needed:**
- Schema-aware queries
- Lead scoring and conversion tracking
- Email sequence handling

### 6. Logistica (Logistics) Module
**File:** `packages/modules/logistica/query-builder.ts`

**Tables:**
- warehouses
- inventory_levels
- inventory_transactions
- catering_logistics

**Updates Needed:**
- Stock movement tracking
- Warehouse operations
- Production workflows

### 7. Inventory Module
**File:** `packages/modules/inventory/query-builder.ts`

**Tables:**
- products
- uoms
- recipes
- recipe_lines
- production_work_orders

**Updates Needed:**
- Product catalog queries
- BOM (Bill of Materials) operations
- Production tracking

### 8. CRM Module
**File:** `packages/modules/crm/query-builder.ts`

**Tables:**
- clients
- opportunities
- crm_activities
- crm_contracts

**Updates Needed:**
- Client management
- Sales pipeline
- Activity tracking

## Implementation Template

```typescript
// packages/modules/[module]/query-builder.ts

import { sql } from 'drizzle-orm';
import { db } from '../../../apps/api/db';
import { tenantSchemaService } from '../../../apps/api/services/tenant-schema.service';

export class ModuleQueryBuilder implements ModuleQueryBuilder {
  private tenantId: string;
  private entityName: string | null = null;
  private filters: Filter[] = [];
  private orderField: string | null = null;
  private orderDirection: 'ASC' | 'DESC' = 'ASC';
  private limitValue: number | null = null;
  private offsetValue: number | null = null;
  private schema: string = 'production';

  constructor(tenantId: string, environment: Environment = 'production') {
    this.tenantId = tenantId;
    this.schema = environment;
  }

  select(entityName: string): this {
    this.entityName = entityName;
    return this;
  }

  where(field: string, operator: string, value: any): this {
    this.filters.push({ field, operator, value });
    return this;
  }

  orderBy(field: string, direction: 'asc' | 'desc' = 'asc'): this {
    this.orderField = field;
    this.orderDirection = direction.toUpperCase() as 'ASC' | 'DESC';
    return this;
  }

  limit(limit: number): this {
    this.limitValue = limit;
    return this;
  }

  offset(offset: number): this {
    this.offsetValue = offset;
    return this;
  }

  async execute(schema?: string): Promise<any[]> {
    if (!this.entityName) {
      throw new Error('Entity name not specified. Call select() first.');
    }

    // Resolve tenant schema
    const schemaName = schema || await tenantSchemaService.getTenantSchemaName(this.tenantId);
    if (!schemaName) {
      throw new Error(`No schema found for tenant ${this.tenantId}`);
    }

    // Get table name
    const tableName = this.getTableName(this.entityName);

    // Build WHERE conditions
    const whereConditions = [`tenant_id = '${this.tenantId}'`];
    
    for (const filter of this.filters) {
      const condition = this.buildCondition(filter);
      if (condition) {
        whereConditions.push(condition);
      }
    }

    // Build query
    let query = `SELECT * FROM "${schemaName}"."${tableName}"`;
    
    if (whereConditions.length > 0) {
      query += ` WHERE ${whereConditions.join(' AND ')}`;
    }

    if (this.orderField) {
      query += ` ORDER BY ${this.orderField} ${this.orderDirection}`;
    }

    if (this.limitValue) {
      query += ` LIMIT ${this.limitValue}`;
    }

    if (this.offsetValue) {
      query += ` OFFSET ${this.offsetValue}`;
    }

    // Execute
    const result = await db.execute(sql.raw(query));
    return result.rows as any[];
  }

  private getTableName(entityName: string): string {
    // Map entity names to table names
    const tableMap: Record<string, string> = {
      // Define your entity-to-table mapping
      'invoices': 'invoices',
      'clients': 'clients',
      // ... more mappings
    };

    return tableMap[entityName] || entityName;
  }

  private buildCondition(filter: Filter): string | null {
    const { field, operator, value } = filter;

    // Escape value to prevent SQL injection
    const escapedValue = typeof value === 'string' 
      ? `'${value.replace(/'/g, "''")}'` 
      : value;

    switch (operator) {
      case 'eq':
        return `${field} = ${escapedValue}`;
      case 'ne':
        return `${field} != ${escapedValue}`;
      case 'gt':
        return `${field} > ${escapedValue}`;
      case 'gte':
        return `${field} >= ${escapedValue}`;
      case 'lt':
        return `${field} < ${escapedValue}`;
      case 'lte':
        return `${field} <= ${escapedValue}`;
      case 'like':
        return `${field} ILIKE '%${value}%'`;
      case 'in':
        const values = Array.isArray(value) ? value : [value];
        const escapedValues = values.map(v => 
          typeof v === 'string' ? `'${v.replace(/'/g, "''")}'` : v
        ).join(', ');
        return `${field} IN (${escapedValues})`;
      default:
        return null;
    }
  }
}
```

## Migration Checklist

### Per Module
- [ ] Update query builder constructor to accept environment
- [ ] Add `tenantSchemaService` import
- [ ] Update `execute()` method to resolve schema name
- [ ] Replace Drizzle table references with raw SQL
- [ ] Update WHERE clause generation
- [ ] Test all query operations (SELECT, INSERT, UPDATE, DELETE)
- [ ] Update module routes to pass schema parameter
- [ ] Update tests

### Global
- [ ] Create base query builder class
- [ ] Implement schema caching for performance
- [ ] Add query logging for debugging
- [ ] Update API documentation
- [ ] Create migration guide for custom queries

## Performance Considerations

### 1. Schema Name Caching
```typescript
class SchemaCache {
  private cache = new Map<string, string>();
  private ttl = 300000; // 5 minutes

  async get(tenantId: string): Promise<string | null> {
    const cached = this.cache.get(tenantId);
    if (cached) return cached;

    const schemaName = await tenantSchemaService.getTenantSchemaName(tenantId);
    if (schemaName) {
      this.cache.set(tenantId, schemaName);
      setTimeout(() => this.cache.delete(tenantId), this.ttl);
    }

    return schemaName;
  }
}
```

### 2. Connection Pooling
```typescript
// Set search_path per connection for better performance
const client = await pool.connect();
await client.query(`SET search_path TO ${schemaName}, public`);
// Now all queries use tenant schema by default
```

### 3. Prepared Statements
```typescript
// Use parameterized queries for better performance
const result = await db.execute(
  sql`SELECT * FROM ${sql.raw(`"${schemaName}"."${tableName}"`)} 
      WHERE tenant_id = ${tenantId} AND status = ${status}`
);
```

## Testing Strategy

### Unit Tests
```typescript
describe('ModuleQueryBuilder with Tenant Schema', () => {
  it('should query from tenant schema', async () => {
    const builder = new ModuleQueryBuilder(tenantId);
    const results = await builder
      .select('invoices')
      .where('status', 'eq', 'paid')
      .execute();
    
    expect(results).toBeDefined();
    // Verify schema was used
  });

  it('should handle missing schema gracefully', async () => {
    const builder = new ModuleQueryBuilder('invalid-tenant-id');
    await expect(builder.select('invoices').execute())
      .rejects.toThrow('No schema found');
  });
});
```

### Integration Tests
```typescript
describe('Module Integration with Tenant Schema', () => {
  it('should create and query records in tenant schema', async () => {
    // Create record
    await createInvoice(tenantId, { ... });
    
    // Query record
    const invoices = await queryBuilder
      .select('invoices')
      .execute();
    
    expect(invoices.length).toBeGreaterThan(0);
  });
});
```

## Rollback Plan

If issues arise during migration:

1. **Revert Query Builders:** Keep old versions with `_legacy` suffix
2. **Feature Flag:** Use environment variable to toggle between schemas
3. **Dual Read:** Query both schemas and compare results
4. **Data Verification:** Run consistency checks before final cutover

## Next Steps

1. ✅ Create migration script
2. ✅ Update tenant-db-helper with schema caching
3. 🔄 Update all query builders (in progress)
4. ⏳ Update module routes
5. ⏳ Create comprehensive tests
6. ⏳ Performance testing and optimization
7. ⏳ Documentation updates

## Related Documentation

- [Tenant Schema Implementation](./TENANT_SCHEMA_IMPLEMENTATION.md)
- [Tenant Schema Updates](./TENANT_SCHEMA_UPDATES.md)
- [Database Reference](./DATABASE_REFERENCE.md)
- [Database Refactoring Plan](./Per-Tenant%20Schema%20Migration.md)

