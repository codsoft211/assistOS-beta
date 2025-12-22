# 📚 Complete Tenant Schemas Documentation Index

**Your guide to understanding and working with AssistOS's multi-tenant architecture**

---

## 🎯 Overview

AssistOS uses **PostgreSQL schemas** to provide true data isolation for each tenant. Instead of storing all tenants' data in one schema with `tenant_id` columns, each tenant gets their own dedicated schema (`tenant_{tenantId}`).

**Benefits:**
- ✅ **Security**: Impossible to accidentally query another tenant's data
- ✅ **Performance**: Smaller indexes and faster queries (10-1000x improvement)
- ✅ **Compliance**: Easy tenant deletion for GDPR/data privacy
- ✅ **Scalability**: Per-tenant maintenance and backups

---

## 📖 Documentation Structure

### 1. [Quick Reference](./TENANT_SCHEMAS_QUICK_REFERENCE.md) ⚡
**Start here for immediate answers!**

Quick lookup guide for common tasks:
- Getting schema names
- Querying tenant data
- Common patterns and code snippets
- File locations
- Debugging tips

**Best for:** Developers who need quick answers while coding

---

### 2. [Understanding Tenant Schemas](./UNDERSTANDING_TENANT_SCHEMAS.md) 📚
**Complete conceptual guide**

Deep dive into:
- What are tenant schemas and why we use them
- How the architecture works
- Schema lifecycle (creation, migration, deletion)
- Detailed code examples
- Query patterns and best practices
- Performance considerations

**Best for:** New team members or those wanting comprehensive understanding

---

### 3. [Visual Guide](./TENANT_SCHEMAS_VISUAL_GUIDE.md) 🎨
**Diagrams and visual explanations**

Visual representations of:
- Architecture diagrams
- Data flow charts
- Schema creation process
- Module installation flow
- Query resolution process
- Performance comparisons

**Best for:** Visual learners who prefer diagrams over text

---

### 4. [Complete Implementation Report](./COMPLETE_TENANT_SCHEMA_IMPLEMENTATION.md) 🏆
**Detailed implementation history**

Technical documentation:
- Implementation phases and progress
- Module coverage (158 tables across 8 modules)
- Query builder migrations
- Files created and modified
- Testing and validation

**Best for:** Technical leads or those reviewing the implementation

---

### 5. [Migration Guide](./TENANT_SCHEMA_MIGRATION_COMPLETE.md) 🔄
**Migration procedures and tools**

Migration details:
- Migration scripts and tools
- Step-by-step migration process
- Rollback procedures
- Testing strategies
- Post-migration validation

**Best for:** DevOps or those managing database migrations

---

## 🚀 Getting Started

### For New Developers

1. **Start with** → [Quick Reference](./TENANT_SCHEMAS_QUICK_REFERENCE.md) (5 min)
   - Get the core concepts
   - Learn the helper functions
   - See common patterns

2. **Then read** → [Understanding Tenant Schemas](./UNDERSTANDING_TENANT_SCHEMAS.md) (30 min)
   - Understand why we use schemas
   - Learn the architecture
   - Study code examples

3. **Review** → [Visual Guide](./TENANT_SCHEMAS_VISUAL_GUIDE.md) (15 min)
   - See how everything connects
   - Understand data flow
   - Visualize the system

4. **Code!** → Start building features using the patterns

---

## 🏗️ Architecture Summary

### The Big Picture

```
┌─────────────────────────────────────────────────────────────┐
│                    POSTGRESQL DATABASE                       │
└─────────────────────────────────────────────────────────────┘
                        │
        ┌───────────────┴───────────────┐
        │                               │
        ▼                               ▼
┌───────────────┐              ┌──────────────────┐
│ PUBLIC SCHEMA │              │ TENANT SCHEMAS   │
│               │              │                  │
│ • users       │              │ • tenant_abc123  │
│ • tenants     │              │ • tenant_def456  │
│ • tenant_     │──maps to─────┤ • tenant_xyz789  │
│   schemas     │              │ • ...            │
│ • plans       │              │                  │
└───────────────┘              └──────────────────┘
  Platform Data                 Business Data
                                (Isolated per tenant)
```

### Key Tables

**Public Schema (Platform-Wide):**
- `users` - All user accounts
- `tenants` - Tenant registry
- `tenant_schemas` - Maps tenant_id → schema_name
- `subscription_plans` - Pricing tiers
- `module_templates` - Available modules

**Tenant Schemas (Per-Tenant):**
- **Essential (18 tables)**: company_info, user_tenants, audit_log, etc.
- **Module Tables (on-demand)**: invoices, clients, products, etc.
- **Custom Tables**: User-created tables

---

## 💻 Code Examples

### Basic Usage

```typescript
import { 
  selectFromTenantTable,
  insertIntoTenantTable 
} from '../utils/tenant-db-helper';

// Get tenant data
const invoices = await selectFromTenantTable(
  tenantId, 
  'invoices', 
  { status: 'pending' }
);

// Insert tenant data
const [invoice] = await insertIntoTenantTable(
  tenantId,
  'invoices',
  { amount: 1500, client_id: 'c123' }
);
```

### Route Pattern

```typescript
router.get('/invoices', async (req, res) => {
  const tenantId = req.user.tenantId; // From auth middleware
  const invoices = await selectFromTenantTable(tenantId, 'invoices');
  res.json(invoices);
});
```

---

## 🗂️ File Organization

### Core Files

```
apps/api/
├── services/
│   ├── tenant-schema.service.ts    # Schema management
│   ├── module-table.service.ts     # Module installation
│   └── [module].service.ts         # Business logic
├── utils/
│   ├── tenant-db-helper.ts         # Helper functions
│   └── tenant-query-builder.ts     # Query builder
└── routes/
    └── [resource].ts               # API endpoints

migrations/
├── add-tenant-schemas.sql          # Initial schema
├── add-custom-tables-to-tenants.ts # Tenant migrations
└── add-org-structure-to-tenants.ts # Feature migrations

supabase/migrations/
└── *.sql                           # Platform migrations

shared/
└── schema.ts                       # Database schema definitions
```

---

## 📊 Database Schema

### Schema Naming

```typescript
// Format: tenant_{tenantId}
tenantId: "810f22c3-5e5d-4be2-b062-615fa489996f"
schemaName: "tenant_810f22c3_5e5d_4be2_b062_615fa489996f"

// Hyphens → underscores for PostgreSQL compatibility
tenantId: "acme-corp-123"
schemaName: "tenant_acme_corp_123"
```

### Schema Registration

```sql
-- Maps tenants to their schemas
CREATE TABLE tenant_schemas (
  id VARCHAR PRIMARY KEY,
  tenant_id VARCHAR UNIQUE NOT NULL,
  schema_name VARCHAR(100) UNIQUE NOT NULL,
  current_version INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

---

## 🔄 Workflow

### 1. Tenant Signup
```
User signs up
  ↓
Create user in public.users
  ↓
Create tenant in public.tenants
  ↓
Create schema: tenant_{id}
  ↓
Register in tenant_schemas
  ↓
Copy 18 essential tables
  ↓
Tenant ready! ✅
```

### 2. Module Activation
```
User activates CRM module
  ↓
Get schema name from tenant_schemas
  ↓
Create 11 CRM tables in tenant schema
  ↓
Register in tenant_modules
  ↓
Module ready! ✅
```

### 3. Query Data
```
API request with JWT
  ↓
Extract tenantId from token
  ↓
Lookup schema: tenant_abc123
  ↓
Build query: SELECT * FROM "tenant_abc123"."invoices"
  ↓
Execute and return results ✅
```

---

## 🎯 Common Patterns

### Pattern 1: Simple CRUD
```typescript
// Use helper functions
const data = await selectFromTenantTable(tenantId, 'invoices');
await insertIntoTenantTable(tenantId, 'invoices', newData);
await updateTenantTable(tenantId, 'invoices', updates, { id });
await deleteFromTenantTable(tenantId, 'invoices', { id });
```

### Pattern 2: Complex Queries
```typescript
// Build schema-qualified queries
const schema = await tenantSchemaService.getTenantSchemaName(tenantId);
const table = sql`${sql.identifier(schema)}.invoices`;
const results = await db.select().from(table).where(...);
```

### Pattern 3: Transactions
```typescript
// Use client for multi-step operations
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query(`SET search_path TO "${schema}"`);
  // ... multiple queries
  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK');
} finally {
  client.release();
}
```

---

## ⚠️ Important Rules

### Do's ✅
- Always use helper functions for tenant data
- Cache schema names when making multiple queries
- Use transactions for multi-table operations
- Check if schema exists before querying
- Use schema-qualified table references

### Don'ts ❌
- Never query tenant tables directly without schema qualification
- Don't hard-code schema names
- Don't forget to handle null schema names
- Don't mix public and tenant schema queries without careful planning
- Don't skip transaction handling for critical operations

---

## 🔍 Debugging

### Common Issues

1. **"Table doesn't exist"**
   - Check if schema exists: `SELECT * FROM tenant_schemas WHERE tenant_id = ?`
   - Check if table exists in schema: Use `tenantTableExists()`

2. **"Schema not found"**
   - Tenant not provisioned yet
   - Wrong tenantId in request

3. **"Permission denied"**
   - Database user doesn't have access to schema
   - Check PostgreSQL permissions

4. **Wrong data returned**
   - Verify correct tenantId from auth
   - Check schema name resolution

### Debug Tools

```typescript
// Check schema
const schema = await tenantSchemaService.getTenantSchema(tenantId);
console.log('Schema:', schema);

// Check table
const exists = await tenantTableExists(tenantId, 'invoices');
console.log('Table exists:', exists);

// Count rows
const count = await countTenantTableRows(tenantId, 'invoices');
console.log('Rows:', count);
```

---

## 📈 Performance

### Before (traditional tenant_id column)
- Index contains ALL tenants' data
- Every query must filter by tenant_id
- Slow queries (scanning millions of rows)

### After (tenant schemas)
- Index contains ONLY one tenant's data (1000x smaller)
- No tenant_id filter needed
- Fast queries (10-1000x faster)

**Real example:**
- Traditional: 45ms, 1M rows scanned, 25MB index
- Tenant schema: 2ms, 1K rows scanned, 25KB index
- **22.5x faster!**

---

## 🎓 Learning Resources

### By Experience Level

**Beginner (New to project):**
1. [Quick Reference](./TENANT_SCHEMAS_QUICK_REFERENCE.md)
2. [Visual Guide](./TENANT_SCHEMAS_VISUAL_GUIDE.md)
3. Study existing routes in `apps/api/routes/`

**Intermediate (Building features):**
1. [Understanding Tenant Schemas](./UNDERSTANDING_TENANT_SCHEMAS.md)
2. Review query builders in `packages/modules/*/query-builder.ts`
3. Study service implementations

**Advanced (Architecture/migrations):**
1. [Complete Implementation Report](./COMPLETE_TENANT_SCHEMA_IMPLEMENTATION.md)
2. [Migration Guide](./TENANT_SCHEMA_MIGRATION_COMPLETE.md)
3. Review migration scripts in `migrations/`

---

## 🔗 Quick Navigation

| I want to... | Go to... |
|--------------|----------|
| Get started quickly | [Quick Reference](./TENANT_SCHEMAS_QUICK_REFERENCE.md) |
| Understand concepts | [Understanding Tenant Schemas](./UNDERSTANDING_TENANT_SCHEMAS.md) |
| See diagrams | [Visual Guide](./TENANT_SCHEMAS_VISUAL_GUIDE.md) |
| Review implementation | [Implementation Report](./COMPLETE_TENANT_SCHEMA_IMPLEMENTATION.md) |
| Run migrations | [Migration Guide](./TENANT_SCHEMA_MIGRATION_COMPLETE.md) |
| See database schema | [Database Reference](./DATABASE_REFERENCE.md) |

---

## 🤝 Contributing

When adding features that require database tables:

1. **Create table in public schema** (as template)
2. **Update `ESSENTIAL_TENANT_TABLES`** (if essential) or `MODULE_TABLE_LISTS` (if module-specific)
3. **Create migration script** to add to existing tenant schemas
4. **Update `shared/schema.ts`** for type safety
5. **Use helper functions** in all queries
6. **Document** your changes

---

## 📞 Support

**Questions about tenant schemas?**

1. Check this index for relevant documentation
2. Review code examples in existing routes/services
3. Look at migration scripts for patterns
4. Consult the team lead

**Common questions answered in:**
- How do I query tenant data? → [Quick Reference](./TENANT_SCHEMAS_QUICK_REFERENCE.md)
- Why do we use schemas? → [Understanding Tenant Schemas](./UNDERSTANDING_TENANT_SCHEMAS.md)
- How does it work? → [Visual Guide](./TENANT_SCHEMAS_VISUAL_GUIDE.md)

---

## 🎉 Summary

**In 3 sentences:**

1. Each tenant gets their own PostgreSQL schema (`tenant_{id}`) for complete data isolation
2. Use helper functions from `tenant-db-helper.ts` to query tenant data - they automatically handle schema resolution
3. This architecture provides better security, performance, and compliance compared to traditional tenant_id columns

**Remember:** Public schema = platform, Tenant schemas = business data!

---

**Ready to start?** → Begin with the [Quick Reference](./TENANT_SCHEMAS_QUICK_REFERENCE.md)!
