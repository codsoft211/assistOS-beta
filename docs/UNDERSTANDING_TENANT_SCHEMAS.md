# 🏗️ Understanding Tenant Schemas in AssistOS - Complete Guide

**Last Updated:** December 15, 2025  
**Author:** AI Assistant  
**Status:** Educational Documentation

---

## 📚 Table of Contents

1. [What Are Tenant Schemas?](#what-are-tenant-schemas)
2. [Why Not Just Public Schema?](#why-not-just-public-schema)
3. [How It Works](#how-it-works)
4. [Database Structure](#database-structure)
5. [Schema Lifecycle](#schema-lifecycle)
6. [Code Examples](#code-examples)
7. [Migration System](#migration-system)
8. [Query Patterns](#query-patterns)
9. [Best Practices](#best-practices)

---

## 🎯 What Are Tenant Schemas?

AssistOS uses **PostgreSQL schemas** to provide **true data isolation** for each tenant (organization/company). Think of it like this:

### Traditional Approach (What We Don't Do)
```sql
-- All tenants share one schema with tenant_id columns
public.invoices
├── id | tenant_id | invoice_number | amount
├── 1  | tenant_A  | INV-001        | 1000
├── 2  | tenant_B  | INV-001        | 2000
└── 3  | tenant_A  | INV-002        | 1500
```

**Problems:**
- ❌ Must filter every query by `tenant_id`
- ❌ Easy to forget `WHERE tenant_id = ?` → data leaks!
- ❌ No physical separation
- ❌ Indexes contain data from all tenants
- ❌ Vacuum/maintenance affects all tenants

### Our Approach (Tenant Schemas)
```sql
-- Each tenant gets their own schema
tenant_abc123.invoices
├── id | invoice_number | amount
├── 1  | INV-001        | 1000
└── 2  | INV-002        | 1500

tenant_def456.invoices
├── id | invoice_number | amount
└── 1  | INV-001        | 2000
```

**Benefits:**
- ✅ Physical data isolation
- ✅ No tenant_id needed in queries
- ✅ Impossible to query another tenant's data
- ✅ Per-tenant maintenance and backups
- ✅ Better query performance
- ✅ Tenant-specific indexes

---

## 🤔 Why Not Just Public Schema?

### Security
```typescript
// ❌ Traditional - Easy to forget tenant filter
const invoices = await db.select().from(invoices)
  // Oops! Forgot WHERE tenant_id = ? 
  // Now you've leaked ALL tenants' data!

// ✅ Tenant Schema - Impossible to leak
const invoices = await selectFromTenantTable(tenantId, 'invoices')
  // Automatically queries tenant_abc123.invoices
  // Can ONLY see this tenant's data
```

### Performance
```typescript
// Traditional: Index contains ALL tenants' data
Index on (tenant_id, invoice_number) has 1,000,000 rows

// Tenant Schema: Index only has THIS tenant's data  
Index on (invoice_number) has only 1,000 rows
→ 1000x smaller index = faster queries
```

### Compliance & Auditing
```sql
-- Need to delete a tenant for GDPR?

-- Traditional: Complex multi-table cleanup
DELETE FROM invoices WHERE tenant_id = 'abc123';
DELETE FROM payments WHERE tenant_id = 'abc123';
DELETE FROM clients WHERE tenant_id = 'abc123';
-- ... 100 more tables to clean ...

-- Tenant Schema: Simple
DROP SCHEMA tenant_abc123 CASCADE;
-- Done! All data gone atomically.
```

---

## 🔧 How It Works

### 1. Schema Registration

When a tenant is created, a schema is registered:

```typescript
// Database tables involved:
┌──────────────────┐      ┌────────────────────┐
│ public.tenants   │      │ public.tenant_schemas │
├──────────────────┤      ├────────────────────┤
│ id: abc123       │◄────┤ tenant_id: abc123  │
│ name: "ACME"     │      │ schema_name:       │
│ slug: "acme"     │      │   tenant_abc123    │
│ created_at       │      │ current_version: 1 │
└──────────────────┘      └────────────────────┘
```

**File:** [migrations/add-tenant-schemas.sql](../migrations/add-tenant-schemas.sql)

```sql
CREATE TABLE tenant_schemas (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR UNIQUE NOT NULL REFERENCES tenants(id),
  schema_name VARCHAR(100) UNIQUE NOT NULL,
  current_version INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### 2. Schema Creation

When a tenant signs up:

```typescript
// File: apps/api/services/tenant-schema.service.ts

async createTenantSchema(tenantId: string): Promise<string> {
  // 1. Generate schema name: tenant_abc123
  const schemaName = this.sanitizeSchemaName(tenantId);
  
  // 2. Create PostgreSQL schema
  await client.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);
  
  // 3. Copy essential tables from public schema
  for (const tableName of ESSENTIAL_TENANT_TABLES) {
    await client.query(`
      CREATE TABLE "${schemaName}"."${tableName}"
      (LIKE public."${tableName}" INCLUDING ALL)
    `);
  }
  
  // 4. Register in tenant_schemas
  await db.insert(tenantSchemas).values({
    tenantId,
    schemaName,
    currentVersion: 1
  });
  
  return schemaName;
}
```

### 3. Querying Data

Every query automatically uses the tenant's schema:

```typescript
// File: apps/api/utils/tenant-db-helper.ts

export async function selectFromTenantTable<T>(
  tenantId: string,
  tableName: string,
  conditions?: Record<string, any>
): Promise<T[]> {
  // 1. Get schema name from tenant_schemas table
  const schemaName = await tenantSchemaService.getTenantSchemaName(tenantId);
  // Returns: "tenant_abc123"
  
  // 2. Build schema-qualified query
  const tableRef = sql`${sql.identifier(schemaName)}.${sql.identifier(tableName)}`;
  // Produces: "tenant_abc123"."invoices"
  
  // 3. Execute query
  const query = db.select().from(tableRef).where(conditions);
  
  return await query;
}
```

---

## 🗄️ Database Structure

### Complete Schema Layout

```
PostgreSQL Database (Supabase)
│
├── 📁 public (Platform-Level Data)
│   ├── users                      # All user accounts
│   ├── tenants                    # Tenant registry
│   ├── tenant_schemas             # Schema name mapping
│   ├── subscription_plans         # Base/Pro/Ultra plans
│   ├── module_templates           # Available modules
│   ├── tool_embeddings            # AI tool descriptions
│   ├── conversations              # AI chat (user-scoped)
│   ├── messages                   # AI chat messages
│   └── usage_events               # Billing events
│
├── 📁 tenant_abc123 (ACME Corp)
│   ├── 🔑 Essential Tables (18 tables)
│   │   ├── company_info           # Company settings
│   │   ├── user_tenants           # User-tenant mapping
│   │   ├── tenant_modules         # Installed modules
│   │   ├── audit_log              # Security audit trail
│   │   ├── notifications          # User notifications
│   │   ├── file_attachments       # Document storage
│   │   ├── departments            # Org structure
│   │   ├── teams                  # Team management
│   │   └── ... (10 more)
│   │
│   ├── 💼 Business Module Tables (when installed)
│   │   ├── CRM (11 tables)
│   │   │   ├── clients
│   │   │   ├── opportunities
│   │   │   ├── crm_activities
│   │   │   └── ...
│   │   │
│   │   ├── Financial (32 tables)
│   │   │   ├── invoices
│   │   │   ├── payments
│   │   │   ├── chart_of_accounts
│   │   │   ├── journal_entries
│   │   │   └── ...
│   │   │
│   │   ├── Inventory (19 tables)
│   │   │   ├── products
│   │   │   ├── inventory_levels
│   │   │   ├── warehouses
│   │   │   └── ...
│   │   │
│   │   └── ... (5 more modules)
│   │
│   └── 🛠️ Custom Tables (user-created)
│       ├── custom_tables          # Metadata
│       └── [any table they create]
│
├── 📁 tenant_def456 (Beta Inc)
│   └── [same structure, different data]
│
└── 📁 tenant_xyz789 (Gamma LLC)
    └── [same structure, different data]
```

### Schema Naming Convention

```typescript
// Format: tenant_{tenantId}
// Hyphens replaced with underscores for PostgreSQL compatibility

tenantId: "810f22c3-5e5d-4be2-b062-615fa489996f"
schemaName: "tenant_810f22c3_5e5d_4be2_b062_615fa489996f"

tenantId: "acme-corp-123"
schemaName: "tenant_acme_corp_123"
```

**Why this format?**
- ✅ Unique per tenant (UUID-based)
- ✅ PostgreSQL-compatible (no hyphens)
- ✅ Human-readable in logs
- ✅ Under 63-char limit (PostgreSQL max identifier length)

---

## 🔄 Schema Lifecycle

### 1. Tenant Registration

```typescript
// User signs up → POST /api/auth/signup
{
  email: "john@acme.com",
  password: "...",
  tenantName: "ACME Corp",
  tenantSlug: "acme"
}

// System creates:
1. User record in public.users
2. Tenant record in public.tenants (id: abc123)
3. Tenant schema: tenant_abc123
4. Essential tables in tenant_abc123
5. Entry in public.tenant_schemas
```

### 2. Module Installation

```typescript
// User activates CRM module → AssistBuild tool: activate-module
activateModule({
  tenantId: "abc123",
  moduleId: "crm"
})

// System creates:
1. Entry in tenant_abc123.tenant_modules
2. All 11 CRM tables in tenant_abc123:
   - clients
   - opportunities
   - crm_activities
   - client_embeddings
   - ... (8 more)
```

**File:** [apps/api/services/module-table.service.ts](../apps/api/services/module-table.service.ts)

```typescript
async createModuleTables(tenantId: string, moduleId: string) {
  const schemaName = await tenantSchemaService.getTenantSchemaName(tenantId);
  const tables = MODULE_TABLE_LISTS[moduleId];
  
  for (const table of tables) {
    // Copy table structure from public schema
    await pool.query(`
      CREATE TABLE "${schemaName}"."${table}"
      (LIKE public."${table}" INCLUDING ALL)
    `);
  }
}
```

### 3. Data Operations

```typescript
// Create invoice → API call
POST /api/invoices
{
  clientId: "client-123",
  amount: 1500.00,
  items: [...]
}

// System executes:
const invoice = await insertIntoTenantTable(
  req.tenantId,          // abc123
  'invoices',            // table
  invoiceData            // data
);

// Actual SQL executed:
// INSERT INTO "tenant_abc123"."invoices" 
// VALUES (...) RETURNING *
```

### 4. Schema Migration

When new features need database changes:

```typescript
// Add column to all tenant schemas
npm run migrate:tenant-schemas

// Script iterates all tenants:
for (const schema of allSchemas) {
  await pool.query(`
    ALTER TABLE "${schema.schemaName}"."invoices"
    ADD COLUMN IF NOT EXISTS "tax_amount" DECIMAL(10,2)
  `);
}
```

**Files:**
- [migrations/add-custom-tables-to-tenants.ts](../migrations/add-custom-tables-to-tenants.ts)
- [migrations/add-org-structure-to-tenants.ts](../migrations/add-org-structure-to-tenants.ts)

---

## 💻 Code Examples

### Example 1: Reading Data

```typescript
// File: apps/api/routes/invoices.ts

router.get('/invoices', async (req, res) => {
  const tenantId = req.user.tenantId; // From auth middleware
  
  // ✅ Schema-aware query
  const invoices = await selectFromTenantTable(
    tenantId,
    'invoices',
    { status: 'pending' }
  );
  
  // Behind the scenes:
  // 1. Looks up schema: tenant_abc123
  // 2. Queries: SELECT * FROM "tenant_abc123"."invoices" 
  //             WHERE status = 'pending'
  
  res.json(invoices);
});
```

### Example 2: Writing Data

```typescript
router.post('/invoices', async (req, res) => {
  const tenantId = req.user.tenantId;
  const invoiceData = req.body;
  
  // ✅ Schema-aware insert
  const [invoice] = await insertIntoTenantTable(
    tenantId,
    'invoices',
    invoiceData
  );
  
  // Actual SQL:
  // INSERT INTO "tenant_abc123"."invoices"
  // (client_id, amount, status, ...)
  // VALUES ($1, $2, $3, ...)
  // RETURNING *
  
  res.json(invoice);
});
```

### Example 3: Complex Queries

```typescript
// File: packages/modules/financeiro/query-builder.ts

class FinanceiroQueryBuilder {
  async getInvoicesWithPayments(tenantId: string) {
    const schemaName = await tenantSchemaService.getTenantSchemaName(tenantId);
    
    // Build schema-qualified table references
    const invoicesTable = sql`${sql.identifier(schemaName)}.invoices`;
    const paymentsTable = sql`${sql.identifier(schemaName)}.payments`;
    
    return await db
      .select({
        invoice: invoicesTable,
        payment: paymentsTable
      })
      .from(invoicesTable)
      .leftJoin(
        paymentsTable,
        sql`${invoicesTable}.id = ${paymentsTable}.invoice_id`
      );
    
    // Actual SQL:
    // SELECT * FROM "tenant_abc123"."invoices" i
    // LEFT JOIN "tenant_abc123"."payments" p
    //   ON i.id = p.invoice_id
  }
}
```

### Example 4: Raw SQL Execution

```typescript
async function executeCustomQuery(tenantId: string, query: string) {
  const schemaName = await tenantSchemaService.getTenantSchemaName(tenantId);
  
  const client = await pool.connect();
  try {
    // Set search_path to tenant schema
    await client.query(`SET search_path TO "${schemaName}"`);
    
    // Now queries default to tenant schema
    const result = await client.query(query);
    // SELECT * FROM invoices
    // → Actually queries tenant_abc123.invoices
    
    return result.rows;
  } finally {
    client.release();
  }
}
```

---

## 🔄 Migration System

### Understanding Migration Levels

```
┌─────────────────────────────────────────┐
│ Platform-Level Migrations               │
│ (affects public schema)                 │
├─────────────────────────────────────────┤
│ File: supabase/migrations/*.sql         │
│ Creates: Tables in public schema        │
│ Examples:                                │
│  - subscription_plans                   │
│  - tenant_schemas                       │
│  - users                                │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ Tenant-Level Migrations                 │
│ (affects all tenant schemas)            │
├─────────────────────────────────────────┤
│ File: migrations/*.ts                   │
│ Modifies: Tables in tenant schemas      │
│ Examples:                                │
│  - add-custom-tables-to-tenants.ts      │
│  - add-org-structure-to-tenants.ts      │
│                                          │
│ Runs on: All existing tenant schemas    │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ Module Installation                      │
│ (affects one tenant schema)             │
├─────────────────────────────────────────┤
│ File: apps/api/services/                │
│       module-table.service.ts           │
│ Creates: Module tables in one schema    │
│ Trigger: User activates module          │
└─────────────────────────────────────────┘
```

### Migration Example

**File:** [migrations/add-custom-tables-to-tenants.ts](../migrations/add-custom-tables-to-tenants.ts)

```typescript
// Add custom_tables table to all existing tenant schemas

async function addCustomTablesToTenants() {
  // 1. Get all tenant schemas
  const schemas = await db.select().from(tenantSchemas);
  console.log(`Found ${schemas.length} tenant schemas`);
  
  // 2. For each tenant schema
  for (const schema of schemas) {
    console.log(`Processing ${schema.schemaName}...`);
    
    // 3. Create table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "${schema.schemaName}"."custom_tables"
      (LIKE public."custom_tables" INCLUDING ALL)
    `);
    
    console.log(`✅ Created custom_tables in ${schema.schemaName}`);
  }
}

// Run migration
npm run migrate:add-custom-tables
```

---

## 🎯 Query Patterns

### Pattern 1: Simple CRUD (Recommended)

Use the helper functions from `tenant-db-helper.ts`:

```typescript
import { 
  selectFromTenantTable,
  insertIntoTenantTable,
  updateTenantTable,
  deleteFromTenantTable
} from '../utils/tenant-db-helper';

// SELECT
const invoices = await selectFromTenantTable(tenantId, 'invoices');

// INSERT
const [invoice] = await insertIntoTenantTable(tenantId, 'invoices', data);

// UPDATE
const updated = await updateTenantTable(
  tenantId, 
  'invoices', 
  { status: 'paid' },
  { id: invoiceId }
);

// DELETE
await deleteFromTenantTable(tenantId, 'invoices', { id: invoiceId });
```

### Pattern 2: Complex Queries (Query Builder)

Create module-specific query builders:

```typescript
// File: packages/modules/[module]/query-builder.ts

export class ModuleQueryBuilder {
  private schemaName: string | null = null;
  
  constructor(private tenantId: string) {}
  
  private async getSchema(): Promise<string> {
    if (!this.schemaName) {
      this.schemaName = await tenantSchemaService.getTenantSchemaName(this.tenantId);
    }
    return this.schemaName!;
  }
  
  async getClientInvoices(clientId: string) {
    const schema = await this.getSchema();
    
    return await db
      .select()
      .from(sql`${sql.identifier(schema)}.invoices`)
      .where(eq(sql`client_id`, clientId));
  }
}
```

### Pattern 3: Joins Across Tables

```typescript
async function getInvoiceWithClient(tenantId: string, invoiceId: string) {
  const schema = await tenantSchemaService.getTenantSchemaName(tenantId);
  
  const invoicesTable = sql`${sql.identifier(schema)}.invoices`;
  const clientsTable = sql`${sql.identifier(schema)}.clients`;
  
  return await db
    .select({
      invoice: invoicesTable,
      client: clientsTable
    })
    .from(invoicesTable)
    .innerJoin(
      clientsTable,
      sql`${invoicesTable}.client_id = ${clientsTable}.id`
    )
    .where(sql`${invoicesTable}.id = ${invoiceId}`);
}
```

### Pattern 4: Aggregations

```typescript
async function getMonthlyRevenue(tenantId: string, year: number) {
  const schema = await tenantSchemaService.getTenantSchemaName(tenantId);
  
  return await db.execute(sql`
    SELECT 
      EXTRACT(MONTH FROM created_at) as month,
      SUM(amount) as revenue
    FROM ${sql.identifier(schema)}.invoices
    WHERE EXTRACT(YEAR FROM created_at) = ${year}
      AND status = 'paid'
    GROUP BY EXTRACT(MONTH FROM created_at)
    ORDER BY month
  `);
}
```

---

## ✅ Best Practices

### 1. Always Use Helper Functions

```typescript
// ❌ Don't: Direct queries without schema
const invoices = await db.select().from(invoices);

// ✅ Do: Use schema-aware helpers
const invoices = await selectFromTenantTable(tenantId, 'invoices');
```

### 2. Cache Schema Names

```typescript
// ❌ Don't: Look up schema name on every query
async function getInvoice(tenantId: string, id: string) {
  const schema = await tenantSchemaService.getTenantSchemaName(tenantId);
  // ... query
}

// ✅ Do: Cache in class or request context
class InvoiceService {
  private schemaCache = new Map<string, string>();
  
  async getSchema(tenantId: string): Promise<string> {
    if (!this.schemaCache.has(tenantId)) {
      const schema = await tenantSchemaService.getTenantSchemaName(tenantId);
      this.schemaCache.set(tenantId, schema);
    }
    return this.schemaCache.get(tenantId)!;
  }
}
```

### 3. Use Transactions for Multi-Table Operations

```typescript
async function createInvoiceWithItems(tenantId: string, data: any) {
  const client = await pool.connect();
  const schema = await tenantSchemaService.getTenantSchemaName(tenantId);
  
  try {
    await client.query('BEGIN');
    await client.query(`SET search_path TO "${schema}"`);
    
    // Insert invoice
    const invoiceResult = await client.query(`
      INSERT INTO invoices (client_id, amount) 
      VALUES ($1, $2) RETURNING id
    `, [data.clientId, data.amount]);
    
    const invoiceId = invoiceResult.rows[0].id;
    
    // Insert invoice items
    for (const item of data.items) {
      await client.query(`
        INSERT INTO invoice_items (invoice_id, product_id, quantity)
        VALUES ($1, $2, $3)
      `, [invoiceId, item.productId, item.quantity]);
    }
    
    await client.query('COMMIT');
    return invoiceId;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
```

### 4. Handle Schema Not Found

```typescript
async function getInvoices(tenantId: string) {
  const schema = await tenantSchemaService.getTenantSchemaName(tenantId);
  
  if (!schema) {
    throw new Error(`Tenant ${tenantId} has no schema. Has it been provisioned?`);
  }
  
  return await selectFromTenantTable(tenantId, 'invoices');
}
```

### 5. Module Table Creation

```typescript
// When user activates a module
async function activateModule(tenantId: string, moduleId: string) {
  // 1. Ensure schema exists
  const schema = await tenantSchemaService.getTenantSchemaName(tenantId);
  if (!schema) {
    throw new Error('Tenant schema not found');
  }
  
  // 2. Create module tables
  await moduleTableService.createModuleTables(tenantId, moduleId);
  
  // 3. Record module activation
  await insertIntoTenantTable(tenantId, 'tenant_modules', {
    moduleId,
    isActive: true,
    activatedAt: new Date()
  });
}
```

---

## 🔍 Debugging Tips

### 1. Check Schema Exists

```sql
-- List all tenant schemas
SELECT * FROM tenant_schemas;

-- Check specific tenant
SELECT * FROM tenant_schemas WHERE tenant_id = 'abc123';
```

### 2. List Tables in Schema

```sql
-- List all tables in a tenant schema
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'tenant_abc123';
```

### 3. View Schema Search Path

```sql
-- Current search path
SHOW search_path;

-- Set search path
SET search_path TO tenant_abc123, public;
```

### 4. Enable Query Logging

```typescript
// Log all queries for debugging
import { drizzle } from 'drizzle-orm/node-postgres';

const db = drizzle(pool, { 
  logger: {
    logQuery(query, params) {
      console.log('🔍 Query:', query);
      console.log('📊 Params:', params);
    }
  }
});
```

---

## 📊 Performance Considerations

### Index Strategy

```sql
-- ❌ Traditional: Compound index with tenant_id
CREATE INDEX idx_invoices_tenant_date 
ON invoices (tenant_id, created_at);
-- Index contains ALL tenants' data

-- ✅ Tenant Schema: Simple index
CREATE INDEX idx_invoices_date 
ON tenant_abc123.invoices (created_at);
-- Index contains ONLY this tenant's data
-- Result: 10-1000x smaller → faster queries
```

### Query Performance

```typescript
// Query performance comparison:

// Traditional: Must filter every query
SELECT * FROM public.invoices 
WHERE tenant_id = 'abc123' 
  AND status = 'pending'
  AND created_at > '2025-01-01';
// PostgreSQL must:
// 1. Scan compound index (tenant_id, ...)
// 2. Filter 1M rows to find 1K for this tenant
// 3. Apply additional filters

// Tenant Schema: No tenant filter needed
SELECT * FROM tenant_abc123.invoices
WHERE status = 'pending'
  AND created_at > '2025-01-01';
// PostgreSQL:
// 1. Scans simple index (created_at)
// 2. Only 1K rows in table (not 1M)
// 3. Much faster execution
```

---

## 🚀 Summary

### Key Takeaways

1. **One Schema per Tenant**
   - Each tenant gets `tenant_{id}` schema
   - Physical data isolation
   - Registered in `public.tenant_schemas`

2. **Two Types of Data**
   - **Public Schema:** Platform-wide (users, tenants, plans)
   - **Tenant Schemas:** Tenant-specific (invoices, clients, products)

3. **Query Pattern**
   - Look up schema name from `tenant_schemas`
   - Build schema-qualified queries
   - Use helper functions for safety

4. **Migration Types**
   - **Platform:** Supabase migrations (public schema)
   - **Tenant:** TypeScript scripts (all tenant schemas)
   - **Module:** On-demand table creation (one tenant schema)

5. **Benefits**
   - ✅ Security (impossible to query wrong tenant)
   - ✅ Performance (smaller indexes, faster queries)
   - ✅ Compliance (easy tenant deletion)
   - ✅ Scalability (per-tenant maintenance)

### Quick Reference

```typescript
// Core services
import { tenantSchemaService } from './services/tenant-schema.service';
import { 
  selectFromTenantTable,
  insertIntoTenantTable,
  updateTenantTable,
  deleteFromTenantTable
} from './utils/tenant-db-helper';

// Typical flow
const tenantId = req.user.tenantId;
const data = await selectFromTenantTable(tenantId, 'invoices');
```

---

## 📚 Related Documentation

- [TENANT_SCHEMA_MIGRATION_COMPLETE.md](./TENANT_SCHEMA_MIGRATION_COMPLETE.md) - Full migration guide
- [COMPLETE_TENANT_SCHEMA_IMPLEMENTATION.md](./COMPLETE_TENANT_SCHEMA_IMPLEMENTATION.md) - Implementation details
- [SCHEMA_NAMING_UPDATE.md](./SCHEMA_NAMING_UPDATE.md) - Schema naming conventions
- [DATABASE_REFERENCE.md](./DATABASE_REFERENCE.md) - Complete database schema

---

## 🤝 Contributing

When adding new features that require database tables:

1. **Create table in public schema first** (for template)
2. **Add to migration script** to create in existing tenant schemas
3. **Update module table lists** if it's a module table
4. **Document in schema.ts** for type safety
5. **Use helper functions** in all queries

---

**Questions?** Check existing code examples in:
- `apps/api/routes/` - API endpoints
- `packages/modules/*/query-builder.ts` - Complex queries
- `migrations/*.ts` - Migration scripts
- `docs/TENANT_SCHEMA_*.md` - Detailed guides
