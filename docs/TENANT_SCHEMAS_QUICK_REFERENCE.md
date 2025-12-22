# 🚀 Tenant Schemas Quick Reference

**Quick lookup guide for developers working with tenant schemas**

---

## 📌 Core Concepts (30-Second Version)

1. **Each tenant gets their own PostgreSQL schema**: `tenant_{tenantId}`
2. **No tenant_id columns needed** in tenant schema tables
3. **Queries are schema-qualified**: `"tenant_abc123"."invoices"`
4. **Use helper functions** for all tenant data operations
5. **Public schema** = platform data, **Tenant schemas** = business data

---

## 🎯 Common Tasks

### Get Tenant Schema Name

```typescript
import { tenantSchemaService } from '../services/tenant-schema.service';

const schemaName = await tenantSchemaService.getTenantSchemaName(tenantId);
// Returns: "tenant_abc123" or null
```

### Query Tenant Data (Simple)

```typescript
import { 
  selectFromTenantTable,
  insertIntoTenantTable,
  updateTenantTable,
  deleteFromTenantTable
} from '../utils/tenant-db-helper';

// SELECT
const invoices = await selectFromTenantTable(
  tenantId, 
  'invoices', 
  { status: 'pending' }
);

// INSERT
const [invoice] = await insertIntoTenantTable(
  tenantId,
  'invoices',
  { amount: 1500, client_id: 'c123' }
);

// UPDATE
await updateTenantTable(
  tenantId,
  'invoices',
  { status: 'paid' },
  { id: invoiceId }
);

// DELETE
await deleteFromTenantTable(
  tenantId,
  'invoices',
  { id: invoiceId }
);
```

### Complex Queries

```typescript
import { tenantSchemaService } from '../services/tenant-schema.service';
import { db } from '../db';
import { sql } from 'drizzle-orm';

const schemaName = await tenantSchemaService.getTenantSchemaName(tenantId);

// Schema-qualified table reference
const invoicesTable = sql`${sql.identifier(schemaName)}.invoices`;

const results = await db
  .select()
  .from(invoicesTable)
  .where(sql`${invoicesTable}.status = 'pending'`)
  .limit(10);
```

### Create Module Tables

```typescript
import { moduleTableService } from '../services/module-table.service';

await moduleTableService.createModuleTables(tenantId, 'crm');
// Creates all CRM module tables in tenant schema
```

---

## 📂 File Locations

| Purpose | File Path |
|---------|-----------|
| Schema service | `apps/api/services/tenant-schema.service.ts` |
| Helper functions | `apps/api/utils/tenant-db-helper.ts` |
| Module tables | `apps/api/services/module-table.service.ts` |
| Schema definitions | `shared/schema.ts` |
| Migrations (platform) | `supabase/migrations/*.sql` |
| Migrations (tenant) | `migrations/*.ts` |

---

## 🗄️ Database Tables

### Platform Tables (public schema)

| Table | Purpose |
|-------|---------|
| `users` | All user accounts |
| `tenants` | Tenant registry |
| `tenant_schemas` | Maps tenant_id → schema_name |
| `subscription_plans` | Pricing plans |
| `module_templates` | Available modules |
| `conversations` | AI chat history |
| `tool_embeddings` | AI tool data |

### Tenant Tables (tenant_* schemas)

**Essential (18 tables):**
- `company_info` - Company settings
- `user_tenants` - User memberships
- `tenant_modules` - Installed modules
- `audit_log` - Security audit
- `notifications` - User notifications
- `departments`, `teams`, `team_members` - Org structure
- ... (11 more)

**Module Tables (installed on-demand):**
- CRM: 11 tables (`clients`, `opportunities`, etc.)
- Financial: 32 tables (`invoices`, `payments`, etc.)
- Inventory: 19 tables (`products`, `warehouses`, etc.)
- ... (5 more modules)

---

## 🔧 API Patterns

### Route Handler Pattern

```typescript
// File: apps/api/routes/[resource].ts
import { Router } from 'express';
import { selectFromTenantTable } from '../utils/tenant-db-helper';

const router = Router();

router.get('/:id', async (req, res) => {
  const tenantId = req.user.tenantId; // From auth middleware
  
  const [record] = await selectFromTenantTable(
    tenantId,
    'invoices',
    { id: req.params.id }
  );
  
  if (!record) {
    return res.status(404).json({ error: 'Not found' });
  }
  
  res.json(record);
});

export default router;
```

### Service Pattern

```typescript
// File: apps/api/services/invoice.service.ts
import { tenantSchemaService } from './tenant-schema.service';
import { selectFromTenantTable } from '../utils/tenant-db-helper';

export class InvoiceService {
  private schemaCache = new Map<string, string>();
  
  async getSchema(tenantId: string): Promise<string> {
    if (!this.schemaCache.has(tenantId)) {
      const schema = await tenantSchemaService.getTenantSchemaName(tenantId);
      if (!schema) throw new Error('Tenant schema not found');
      this.schemaCache.set(tenantId, schema);
    }
    return this.schemaCache.get(tenantId)!;
  }
  
  async getInvoices(tenantId: string, filters: any) {
    return await selectFromTenantTable(tenantId, 'invoices', filters);
  }
}

export const invoiceService = new InvoiceService();
```

### Query Builder Pattern

```typescript
// File: packages/modules/[module]/query-builder.ts
export class ModuleQueryBuilder {
  constructor(private tenantId: string) {}
  
  private async getSchema(): Promise<string> {
    const schema = await tenantSchemaService.getTenantSchemaName(this.tenantId);
    if (!schema) throw new Error('No schema');
    return schema;
  }
  
  async getRelatedData() {
    const schema = await this.getSchema();
    
    const table1 = sql`${sql.identifier(schema)}.invoices`;
    const table2 = sql`${sql.identifier(schema)}.payments`;
    
    return await db
      .select()
      .from(table1)
      .leftJoin(table2, sql`${table1}.id = ${table2}.invoice_id`);
  }
}
```

---

## 🔄 Schema Lifecycle Commands

```bash
# Create tenant schema (automatic on signup)
# Done by: tenantSchemaService.createTenantSchema(tenantId)

# Add table to all tenant schemas
npx tsx migrations/add-[feature]-to-tenants.ts

# Add table to specific tenant
npx tsx migrations/add-[feature]-to-tenants.ts --tenant-id=abc123

# Activate module for tenant (via AssistBuild tool)
# Creates module tables in tenant schema

# List tenant schemas (SQL)
SELECT * FROM tenant_schemas;

# List tables in tenant schema (SQL)
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'tenant_abc123';
```

---

## ⚠️ Common Pitfalls

### 1. Forgetting to Get Schema Name

```typescript
// ❌ Wrong - queries public schema
const invoices = await db.select().from(invoices);

// ✅ Correct - queries tenant schema
const invoices = await selectFromTenantTable(tenantId, 'invoices');
```

### 2. Hard-coding Schema Names

```typescript
// ❌ Wrong - brittle
const query = sql`SELECT * FROM tenant_abc123.invoices`;

// ✅ Correct - dynamic
const schema = await tenantSchemaService.getTenantSchemaName(tenantId);
const query = sql`SELECT * FROM ${sql.identifier(schema)}.invoices`;
```

### 3. Not Handling Missing Schema

```typescript
// ❌ Wrong - will crash
const schema = await tenantSchemaService.getTenantSchemaName(tenantId);
const data = await db.select().from(sql`${sql.identifier(schema)}.invoices`);

// ✅ Correct - checks first
const schema = await tenantSchemaService.getTenantSchemaName(tenantId);
if (!schema) {
  throw new Error('Tenant schema not found. Has tenant been provisioned?');
}
const data = await db.select().from(sql`${sql.identifier(schema)}.invoices`);
```

### 4. Mixing Public and Tenant Data

```typescript
// ❌ Wrong - trying to join across schemas
const result = await db
  .select()
  .from(tenantInvoices) // In tenant schema
  .innerJoin(users, ...); // In public schema - will fail

// ✅ Correct - fetch separately or use search_path
const invoices = await selectFromTenantTable(tenantId, 'invoices');
const userIds = invoices.map(i => i.userId);
const users = await db.select().from(users).where(inArray(users.id, userIds));
```

### 5. Not Using Transactions for Multi-Step Operations

```typescript
// ❌ Wrong - not atomic
const [invoice] = await insertIntoTenantTable(tenantId, 'invoices', data);
await insertIntoTenantTable(tenantId, 'invoice_items', items);
// If second insert fails, invoice exists without items!

// ✅ Correct - use transaction
const client = await pool.connect();
try {
  await client.query('BEGIN');
  const schema = await tenantSchemaService.getTenantSchemaName(tenantId);
  await client.query(`SET search_path TO "${schema}"`);
  
  const invResult = await client.query(
    'INSERT INTO invoices (...) VALUES (...) RETURNING id'
  );
  const invoiceId = invResult.rows[0].id;
  
  await client.query(
    'INSERT INTO invoice_items (...) VALUES (...)',
    [invoiceId, ...]
  );
  
  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
}
```

---

## 🎓 Learning Path

1. ✅ **Read this quick reference** (you're here!)
2. 📖 **[Understanding Tenant Schemas](./UNDERSTANDING_TENANT_SCHEMAS.md)** - Full concepts
3. 🎨 **[Visual Guide](./TENANT_SCHEMAS_VISUAL_GUIDE.md)** - Diagrams and flows
4. 🔨 **Study existing routes** - See patterns in action
5. 💻 **Build a feature** - Apply what you learned

---

## 🔍 Debugging Checklist

When queries aren't working:

- [ ] Did you call `getTenantSchemaName(tenantId)`?
- [ ] Is the tenant schema registered in `tenant_schemas` table?
- [ ] Does the table exist in the tenant schema?
- [ ] Are you using schema-qualified table references?
- [ ] Did you check for null schema name?
- [ ] Is the tenantId correct (from auth middleware)?
- [ ] Are you using the helper functions or building SQL correctly?

### Debug Queries

```typescript
// Check if schema exists
const schema = await tenantSchemaService.getTenantSchema(tenantId);
console.log('Schema info:', schema);

// Check if table exists in schema
const exists = await tenantTableExists(tenantId, 'invoices');
console.log('Table exists:', exists);

// Count rows
const count = await countTenantTableRows(tenantId, 'invoices');
console.log('Row count:', count);

// Enable query logging
// In db.ts, add logger option to drizzle config
```

---

## 📊 Performance Tips

1. **Cache schema names** - Don't look up on every query
2. **Use indexes** - Tenant schemas have smaller indexes = faster queries
3. **Batch operations** - Use transactions for multiple inserts
4. **Connection pooling** - Let pg pool manage connections
5. **Query only what you need** - SELECT specific columns, not *

---

## 🔗 Quick Links

| Resource | Link |
|----------|------|
| Full Guide | [UNDERSTANDING_TENANT_SCHEMAS.md](./UNDERSTANDING_TENANT_SCHEMAS.md) |
| Visual Guide | [TENANT_SCHEMAS_VISUAL_GUIDE.md](./TENANT_SCHEMAS_VISUAL_GUIDE.md) |
| Implementation | [COMPLETE_TENANT_SCHEMA_IMPLEMENTATION.md](./COMPLETE_TENANT_SCHEMA_IMPLEMENTATION.md) |
| Migration Guide | [TENANT_SCHEMA_MIGRATION_COMPLETE.md](./TENANT_SCHEMA_MIGRATION_COMPLETE.md) |
| Database Reference | [DATABASE_REFERENCE.md](./DATABASE_REFERENCE.md) |

---

## 💡 Remember

- **Public schema** = Platform-wide data (users, tenants, plans)
- **Tenant schemas** = Isolated business data (invoices, clients, products)
- **Always use helper functions** for tenant data operations
- **Schema name format**: `tenant_{tenantId}`
- **Lookup via**: `public.tenant_schemas` table

---

**Need Help?** Check the full documentation or look at existing route/service implementations!
