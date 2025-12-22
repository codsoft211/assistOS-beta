# 🎨 Tenant Schemas Visual Guide

**Visual representations and diagrams for understanding tenant schema architecture**

---

## 📊 Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        SUPABASE POSTGRESQL DATABASE                     │
└─────────────────────────────────────────────────────────────────────────┘
           │
           ├─────────────────────────────────────────────────────────────┐
           │                                                             │
           ▼                                                             ▼
    ┌─────────────┐                                           ┌──────────────┐
    │   PUBLIC    │                                           │TENANT SCHEMAS│
    │   SCHEMA    │                                           │ (Isolated)   │
    └─────────────┘                                           └──────────────┘
           │                                                          │
           │                                                          │
    ┌──────┴───────┐                                          ┌───────┴────────┐
    │              │                                          │                │
    ▼              ▼                                          ▼                ▼
┌─────────┐  ┌──────────┐                           ┌──────────────┐  ┌──────────────┐
│ USERS   │  │ TENANTS  │                           │tenant_abc123 │  │tenant_def456 │
└─────────┘  └──────────┘                           └──────────────┘  └──────────────┘
┌─────────┐  ┌────────────────┐                            │                 │
│ PLANS   │  │TENANT_SCHEMAS  │                            │                 │
└─────────┘  └────────────────┘                     ┌──────┴──────┐   ┌──────┴──────┐
                     │                              │             │   │             │
                     │ Maps tenants to schemas      ▼             ▼   ▼             ▼
                     └──────────────────────►  ┌──────────┐ ┌────────┐┌────────┐┌────────┐
                                               │company   │ │invoices││clients ││products│
                                               │ _info    │ └────────┘└────────┘└────────┘
                                               └──────────┘
```

---

## 🔄 Data Flow Diagram

### How a Query Executes

```
┌──────────────────────────────────────────────────────────────────────┐
│ 1. USER REQUEST                                                      │
│    POST /api/invoices { amount: 1500, client_id: "c123" }          │
└──────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│ 2. AUTH MIDDLEWARE                                                   │
│    - Extracts JWT token                                             │
│    - Decodes tenantId: "abc123"                                     │
│    - Attaches to req.user.tenantId                                  │
└──────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│ 3. ROUTE HANDLER (apps/api/routes/invoices.ts)                     │
│    const tenantId = req.user.tenantId; // "abc123"                  │
│    const invoice = await insertIntoTenantTable(                     │
│      tenantId, 'invoices', req.body                                 │
│    );                                                               │
└──────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│ 4. TENANT-DB-HELPER (apps/api/utils/tenant-db-helper.ts)           │
│    async function insertIntoTenantTable(...) {                      │
│      // Lookup schema name                                          │
│      const schemaName = await getTenantSchemaName(tenantId);       │
│      // Returns: "tenant_abc123"                                    │
│    }                                                                │
└──────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│ 5. SCHEMA LOOKUP (queries public.tenant_schemas)                    │
│    SELECT schema_name FROM tenant_schemas                           │
│    WHERE tenant_id = 'abc123'                                       │
│    → Result: "tenant_abc123"                                        │
└──────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│ 6. BUILD QUALIFIED QUERY                                            │
│    const tableRef = sql`${sql.identifier("tenant_abc123")}          │
│                        .${sql.identifier("invoices")}`;             │
│    // Produces: "tenant_abc123"."invoices"                          │
└──────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│ 7. EXECUTE SQL                                                       │
│    INSERT INTO "tenant_abc123"."invoices"                           │
│      (amount, client_id, status, created_at)                        │
│    VALUES (1500, 'c123', 'draft', NOW())                            │
│    RETURNING *;                                                     │
└──────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│ 8. RETURN RESULT                                                     │
│    { id: "inv-001", amount: 1500, status: "draft", ... }           │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 🏗️ Schema Creation Flow

### What Happens When a Tenant Signs Up

```
┌─────────────────────────────────────────────────────────────────┐
│ USER SIGNUP                                                     │
│ POST /api/auth/signup                                          │
│ { email: "john@acme.com", tenantName: "ACME Corp" }           │
└─────────────────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 1: Create User & Tenant Records (PUBLIC schema)          │
├─────────────────────────────────────────────────────────────────┤
│ INSERT INTO public.users (id, email, ...)                     │
│ VALUES ('u123', 'john@acme.com', ...)                         │
│                                                                │
│ INSERT INTO public.tenants (id, name, slug, ...)              │
│ VALUES ('abc123', 'ACME Corp', 'acme', ...)                   │
└─────────────────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 2: Create PostgreSQL Schema                              │
├─────────────────────────────────────────────────────────────────┤
│ await tenantSchemaService.createTenantSchema('abc123')        │
│                                                                │
│ → Generates name: tenant_abc123                               │
│ → Executes: CREATE SCHEMA IF NOT EXISTS "tenant_abc123"       │
└─────────────────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 3: Register Schema Mapping                               │
├─────────────────────────────────────────────────────────────────┤
│ INSERT INTO public.tenant_schemas                             │
│   (tenant_id, schema_name, current_version)                   │
│ VALUES ('abc123', 'tenant_abc123', 1)                         │
└─────────────────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 4: Copy Essential Tables (18 tables)                     │
├─────────────────────────────────────────────────────────────────┤
│ FOR EACH table IN ESSENTIAL_TENANT_TABLES:                    │
│   CREATE TABLE "tenant_abc123"."{table}"                      │
│   (LIKE public."{table}" INCLUDING ALL)                       │
│                                                                │
│ Created tables:                                                │
│   ✅ company_info                                              │
│   ✅ user_tenants                                              │
│   ✅ tenant_modules                                            │
│   ✅ audit_log                                                 │
│   ✅ notifications                                             │
│   ✅ departments, teams, team_members                          │
│   ... (11 more)                                                │
└─────────────────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 5: Create User-Tenant Association                        │
├─────────────────────────────────────────────────────────────────┤
│ INSERT INTO "tenant_abc123".user_tenants                      │
│   (user_id, tenant_id, role, ...)                             │
│ VALUES ('u123', 'abc123', 'owner', ...)                       │
└─────────────────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│ ✅ TENANT READY!                                                │
│                                                                │
│ Database now contains:                                         │
│   - User record in public.users                               │
│   - Tenant record in public.tenants                           │
│   - Schema "tenant_abc123" with 18 essential tables           │
│   - Mapping in public.tenant_schemas                          │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📦 Module Installation Flow

### What Happens When User Activates CRM Module

```
┌─────────────────────────────────────────────────────────────────┐
│ USER ACTION (via AssistBuild)                                  │
│ "Activate CRM module"                                          │
└─────────────────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 1: Tool Invocation                                        │
├─────────────────────────────────────────────────────────────────┤
│ activate_module({                                              │
│   tenantId: "abc123",                                          │
│   moduleId: "crm"                                              │
│ })                                                             │
└─────────────────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 2: Get Schema Name                                        │
├─────────────────────────────────────────────────────────────────┤
│ const schemaName =                                             │
│   await tenantSchemaService.getTenantSchemaName('abc123')     │
│                                                                │
│ → Returns: "tenant_abc123"                                     │
└─────────────────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 3: Create Module Tables                                   │
├─────────────────────────────────────────────────────────────────┤
│ const tables = MODULE_TABLE_LISTS['crm'];                     │
│ // Returns: [                                                 │
│ //   'clients',                                               │
│ //   'client_embeddings',                                     │
│ //   'opportunities',                                         │
│ //   'crm_activities',                                        │
│ //   ... (7 more)                                             │
│ // ]                                                           │
│                                                                │
│ FOR EACH table IN tables:                                      │
│   CREATE TABLE "tenant_abc123"."{table}"                      │
│   (LIKE public."{table}" INCLUDING ALL)                       │
└─────────────────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 4: Register Module Activation                            │
├─────────────────────────────────────────────────────────────────┤
│ INSERT INTO "tenant_abc123".tenant_modules                    │
│   (module_id, is_active, activated_at, ...)                   │
│ VALUES ('crm', true, NOW(), ...)                              │
└─────────────────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 5: Initialize Module Data (if needed)                    │
├─────────────────────────────────────────────────────────────────┤
│ // Create default records                                      │
│ // e.g., default pipelines, stages, etc.                      │
└─────────────────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│ ✅ MODULE ACTIVATED!                                            │
│                                                                │
│ Tenant "tenant_abc123" now has:                               │
│   ✅ 18 essential tables (from signup)                         │
│   ✅ 11 CRM tables (just created):                             │
│      - clients                                                 │
│      - client_embeddings                                       │
│      - opportunities                                           │
│      - opportunity_rules                                       │
│      - crm_activities                                          │
│      - crm_contracts                                           │
│      - crm_renewals                                            │
│      - contract_submissions                                    │
│      - activities                                              │
│      - activity_feed                                           │
│      - entities                                                │
│                                                                │
│ Total: 29 tables in tenant_abc123                             │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔐 Data Isolation Visualization

### Traditional Multi-Tenancy (What We DON'T Do)

```
┌─────────────────────────────────────────────────────────────────┐
│ PUBLIC.INVOICES (ALL TENANTS MIXED)                            │
├────┬───────────┬────────────┬────────┬─────────────────────────┤
│ ID │ TENANT_ID │ NUMBER     │ AMOUNT │ CLIENT_ID               │
├────┼───────────┼────────────┼────────┼─────────────────────────┤
│  1 │ tenant_A  │ INV-001    │  1000  │ A-client-123            │
│  2 │ tenant_B  │ INV-001    │  2000  │ B-client-456      ⚠️    │
│  3 │ tenant_A  │ INV-002    │  1500  │ A-client-789            │
│  4 │ tenant_C  │ INV-001    │   500  │ C-client-111      ⚠️    │
│  5 │ tenant_A  │ INV-003    │  2500  │ A-client-234            │
│  6 │ tenant_B  │ INV-002    │  3000  │ B-client-567      ⚠️    │
└────┴───────────┴────────────┴────────┴─────────────────────────┘
     ⚠️  SECURITY RISK: Forget WHERE tenant_id = ? → Data Leak!
     ⚠️  PERFORMANCE: Index scans through ALL tenants' data
     ⚠️  COMPLIANCE: Can't easily delete one tenant's data
```

### Tenant Schema Architecture (What We DO)

```
┌──────────────────────────────────────────────────────────────┐
│ TENANT_ABC123.INVOICES (ONLY TENANT A)                       │
├────┬────────────┬────────┬─────────────────────────────────┤
│ ID │ NUMBER     │ AMOUNT │ CLIENT_ID                        │
├────┼────────────┼────────┼─────────────────────────────────┤
│  1 │ INV-001    │  1000  │ client-123                       │
│  2 │ INV-002    │  1500  │ client-789                       │
│  3 │ INV-003    │  2500  │ client-234                       │
└────┴────────────┴────────┴─────────────────────────────────┘
     ✅ ISOLATED: No tenant_id column needed
     ✅ SECURE: Can't query other tenants' data
     ✅ FAST: Smaller indexes, faster queries

┌──────────────────────────────────────────────────────────────┐
│ TENANT_DEF456.INVOICES (ONLY TENANT B)                       │
├────┬────────────┬────────┬─────────────────────────────────┤
│ ID │ NUMBER     │ AMOUNT │ CLIENT_ID                        │
├────┼────────────┼────────┼─────────────────────────────────┤
│  1 │ INV-001    │  2000  │ client-456                       │
│  2 │ INV-002    │  3000  │ client-567                       │
└────┴────────────┴────────┴─────────────────────────────────┘
     ✅ PHYSICALLY SEPARATED in different schema
     ✅ DELETE TENANT = DROP SCHEMA tenant_def456 CASCADE

┌──────────────────────────────────────────────────────────────┐
│ TENANT_XYZ789.INVOICES (ONLY TENANT C)                       │
├────┬────────────┬────────┬─────────────────────────────────┤
│ ID │ NUMBER     │ AMOUNT │ CLIENT_ID                        │
├────┼────────────┼────────┼─────────────────────────────────┤
│  1 │ INV-001    │   500  │ client-111                       │
└────┴────────────┴────────┴─────────────────────────────────┘
     ✅ COMPLIANCE: Easy tenant deletion
     ✅ PERFORMANCE: Independent indexes per tenant
```

---

## 🎯 Query Resolution

### How Schema Resolution Works

```
                         ┌─────────────────┐
                         │  API REQUEST    │
                         │  tenantId:      │
                         │  "abc123"       │
                         └────────┬────────┘
                                  │
                                  ▼
┌──────────────────────────────────────────────────────────────┐
│ SCHEMA LOOKUP SERVICE                                        │
│                                                              │
│ Query: SELECT schema_name FROM tenant_schemas                │
│        WHERE tenant_id = 'abc123'                            │
│                                                              │
│ ┌────────────────────────────────────────────────────────┐  │
│ │ public.tenant_schemas                                  │  │
│ ├────────────┬─────────────────┬──────────────┬─────────┤  │
│ │ tenant_id  │ schema_name     │ version      │ created │  │
│ ├────────────┼─────────────────┼──────────────┼─────────┤  │
│ │ abc123  ◄──┤ tenant_abc123   │ 1            │ ...     │  │
│ │ def456     │ tenant_def456   │ 1            │ ...     │  │
│ │ xyz789     │ tenant_xyz789   │ 1            │ ...     │  │
│ └────────────┴─────────────────┴──────────────┴─────────┘  │
│                         │                                    │
│                         └─────► Returns: "tenant_abc123"    │
└──────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌──────────────────────────────────────────────────────────────┐
│ SQL BUILDER                                                  │
│                                                              │
│ Constructs:                                                  │
│   SELECT * FROM "tenant_abc123"."invoices"                  │
│                                                              │
│ Using:                                                       │
│   sql`${sql.identifier("tenant_abc123")}                    │
│       .${sql.identifier("invoices")}`                       │
└──────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌──────────────────────────────────────────────────────────────┐
│ POSTGRESQL EXECUTION                                         │
│                                                              │
│ Database executes:                                           │
│   SELECT * FROM "tenant_abc123"."invoices"                  │
│                                                              │
│ ✅ Only accesses tenant_abc123 schema                        │
│ ✅ Impossible to leak data from other schemas                │
└──────────────────────────────────────────────────────────────┘
```

---

## 📋 Schema Comparison Table

| Feature | Traditional (tenant_id) | Tenant Schemas |
|---------|------------------------|----------------|
| **Data Isolation** | Logical (via WHERE) | Physical (separate schemas) |
| **Query Filter** | Must add WHERE tenant_id | Automatic (schema-qualified) |
| **Security Risk** | High (easy to forget filter) | Low (impossible to query wrong tenant) |
| **Index Size** | Large (all tenants) | Small (one tenant) |
| **Query Performance** | Slower (scan all data) | Faster (scan only tenant data) |
| **Tenant Deletion** | Complex (multi-table) | Simple (DROP SCHEMA) |
| **Backup/Restore** | All-or-nothing | Per-tenant possible |
| **Compliance (GDPR)** | Difficult | Easy |
| **Schema Changes** | Single migration | Must update all schemas |
| **Implementation** | Simple | More complex |

---

## 🔄 Complete System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         ASSISTOS PLATFORM                               │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │
        ┌───────────────────────────┼───────────────────────────┐
        │                           │                           │
        ▼                           ▼                           ▼
┌──────────────┐          ┌──────────────┐          ┌──────────────┐
│ TENANT A     │          │ TENANT B     │          │ TENANT C     │
│ (ACME Corp)  │          │ (Beta Inc)   │          │ (Gamma LLC)  │
└──────────────┘          └──────────────┘          └──────────────┘
        │                           │                           │
        │ tenantId: abc123         │ tenantId: def456         │ tenantId: xyz789
        │                           │                           │
        └───────────────────────────┼───────────────────────────┘
                                    │
                                    ▼
                    ┌───────────────────────────────┐
                    │  public.tenant_schemas        │
                    │  (Schema Registry)            │
                    ├───────────────────────────────┤
                    │ abc123 → tenant_abc123        │
                    │ def456 → tenant_def456        │
                    │ xyz789 → tenant_xyz789        │
                    └───────────────────────────────┘
                                    │
                                    │
        ┌───────────────────────────┼───────────────────────────┐
        │                           │                           │
        ▼                           ▼                           ▼
┌──────────────┐          ┌──────────────┐          ┌──────────────┐
│tenant_abc123 │          │tenant_def456 │          │tenant_xyz789 │
│              │          │              │          │              │
│ Essential:   │          │ Essential:   │          │ Essential:   │
│ • company    │          │ • company    │          │ • company    │
│ • users      │          │ • users      │          │ • users      │
│ • modules    │          │ • modules    │          │ • modules    │
│              │          │              │          │              │
│ Modules:     │          │ Modules:     │          │ Modules:     │
│ • invoices   │          │ • clients    │          │ • products   │
│ • payments   │          │ • projects   │          │ • orders     │
│ • clients    │          │ • tasks      │          │ • shipments  │
└──────────────┘          └──────────────┘          └──────────────┘
```

---

## 🚀 Performance Comparison

### Query Execution Time

```
Traditional (tenant_id column):
┌────────────────────────────────────────────────┐
│ Query: Find all pending invoices for tenant A │
│ SELECT * FROM invoices                         │
│ WHERE tenant_id = 'abc123'                     │
│   AND status = 'pending'                       │
│                                                │
│ Execution:                                     │
│ 1. Scan compound index (tenant_id, status)    │
│ 2. Filter 1,000,000 rows → find 1,000         │
│ 3. Seek to matching rows                      │
│                                                │
│ ⏱️  Time: 45ms                                  │
│ 📊 Rows scanned: 1,000,000                     │
│ 💾 Index size: 25 MB                           │
└────────────────────────────────────────────────┘

Tenant Schema:
┌────────────────────────────────────────────────┐
│ Query: Find all pending invoices              │
│ SELECT * FROM tenant_abc123.invoices           │
│ WHERE status = 'pending'                       │
│                                                │
│ Execution:                                     │
│ 1. Scan simple index (status)                 │
│ 2. Find matching rows (only 1,000 total)      │
│                                                │
│ ⏱️  Time: 2ms                                   │
│ 📊 Rows scanned: 1,000                         │
│ 💾 Index size: 25 KB                           │
│                                                │
│ ✅ 22.5x FASTER!                                │
│ ✅ 1000x fewer rows                             │
│ ✅ 1000x smaller index                          │
└────────────────────────────────────────────────┘
```

---

## 📚 Real-World Example

### Complete Invoice Creation Flow

```typescript
// 1. USER SUBMITS INVOICE
fetch('/api/invoices', {
  method: 'POST',
  headers: { 
    'Authorization': 'Bearer <jwt-token-with-tenantId>' 
  },
  body: JSON.stringify({
    clientId: 'client-123',
    amount: 1500.00,
    items: [...]
  })
})

// 2. BACKEND PROCESSES
// File: apps/api/routes/invoices.ts
router.post('/invoices', async (req, res) => {
  const tenantId = req.user.tenantId; // "abc123" from JWT
  
  // Helper function handles schema resolution
  const [invoice] = await insertIntoTenantTable(
    tenantId,
    'invoices',
    req.body
  );
  
  res.json(invoice);
});

// 3. HELPER RESOLVES SCHEMA
// File: apps/api/utils/tenant-db-helper.ts
async function insertIntoTenantTable(tenantId, tableName, data) {
  // Lookup: tenant_schemas WHERE tenant_id = 'abc123'
  // Returns: "tenant_abc123"
  const schemaName = await tenantSchemaService.getTenantSchemaName(tenantId);
  
  // Build qualified table reference
  const tableRef = sql`${sql.identifier(schemaName)}.${sql.identifier(tableName)}`;
  
  // Execute: INSERT INTO "tenant_abc123"."invoices" ...
  return await db.insert(tableRef).values(data).returning();
}

// 4. DATABASE EXECUTES
/*
   INSERT INTO "tenant_abc123"."invoices"
     (client_id, amount, status, created_at)
   VALUES ('client-123', 1500.00, 'draft', NOW())
   RETURNING *;
   
   Result: { id: 'inv-001', amount: 1500, ... }
*/

// 5. RESPONSE TO USER
{
  "id": "inv-001",
  "clientId": "client-123",
  "amount": 1500.00,
  "status": "draft",
  "createdAt": "2025-12-15T10:30:00Z"
}
```

---

## 🎓 Key Concepts Summary

### 1. Physical vs Logical Isolation

```
LOGICAL (tenant_id):              PHYSICAL (schemas):
────────────────────             ────────────────────
   ┌─────────────┐                  ┌──────────┐
   │  One Table  │                  │Schema A  │
   │             │                  ├──────────┤
   │ ┌─────────┐ │                  │ Table    │
   │ │Tenant A │ │                  └──────────┘
   │ ├─────────┤ │
   │ │Tenant B │ │                  ┌──────────┐
   │ ├─────────┤ │                  │Schema B  │
   │ │Tenant C │ │                  ├──────────┤
   │ └─────────┘ │                  │ Table    │
   └─────────────┘                  └──────────┘
```

### 2. Automatic Security

```
// Traditional - RISKY
const invoices = await db.select()
  .from(invoices);
// ☠️  Oops! Returns ALL tenants' invoices!

// Tenant Schema - SAFE
const invoices = await selectFromTenantTable(tenantId, 'invoices');
// ✅ Can ONLY return this tenant's invoices
// ✅ Schema resolution enforces isolation
```

### 3. Module Expansion

```
New Tenant:
  tenant_abc123
  └─ 18 essential tables

+ Activate CRM:
  tenant_abc123
  └─ 18 + 11 = 29 tables

+ Activate Financial:
  tenant_abc123
  └─ 29 + 32 = 61 tables

+ Activate Inventory:
  tenant_abc123
  └─ 61 + 19 = 80 tables

All isolated per tenant! 🎉
```

---

## 🔗 Navigation

- [← Back to Understanding Tenant Schemas](./UNDERSTANDING_TENANT_SCHEMAS.md)
- [Complete Implementation Report →](./COMPLETE_TENANT_SCHEMA_IMPLEMENTATION.md)
- [Migration Guide →](./TENANT_SCHEMA_MIGRATION_COMPLETE.md)
