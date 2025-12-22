# Database Refactoring Plan: Per-Tenant Schema Migration

## Executive Summary

**Objective:** Migrate tenant-scoped tables from `public` to per-tenant schemas, keeping platform-wide and user-scoped tables in `public`.

**Scope:** 315 tables across 17 categories  
**Impact:** High — affects all tenant data operations  
**Timeline:** Phased migration with zero-downtime strategy

---

## 1. Schema Classification

### 1.1 Tables to REMAIN in `public` Schema (Platform-Wide)

#### A. Global/Platform Tables (G) - 15 tables

- `users` - User accounts
- `tenants` - Tenant organizations
- `tenant_schemas` - Schema registry (NEW - already created)
- `module_templates` - Available module definitions
- `workflow_templates` - Workflow definitions
- `tool_embeddings` - AI tool selection embeddings
- `blueprint_templates` - Blueprint templates
- `agents_library` - Available agent types
- `core_assets` - Core asset registry
- `configuration_patterns` - Business pattern library
- `subscription_plans` - Pricing plans
- `cross_tenant_patterns` - Anonymized cross-tenant patterns (E only, no T)

#### B. Subscription/Billing Tables - 4 tables

- `subscription_plans` (already listed above)
- `tenant_subscriptions` - Active tenant subscriptions (T but billing, keep in public)
- `tenant_credits` - Credit balances (T but billing, keep in public)
- `credit_pricing_rules` - Resource pricing (T but billing, keep in public)

**Note:** Billing tables are tenant-scoped but should remain in `public` for centralized billing management and cross-tenant analytics.

#### C. AI Chat Systems (Modified) - 6 tables

**Change:** Remove `tenant_id`, add `user_id` instead

- `conversations` → `user_id` (AssistME)
- `messages` → `user_id` (AssistME)
- `conversation_insights` → `user_id` (AssistME)
- `assistbuild_conversations` → `user_id` (AssistBuild)
- `assistbuild_messages` → `user_id` (AssistBuild)
- `assistsettings_conversations` → `user_id` (AssistSettings)
- `assistsettings_messages` → `user_id` (AssistSettings)

**Rationale:** AI conversations are user-scoped, not tenant-scoped. Users can have conversations across tenants.

#### D. User-Scoped Tables (U) - 2 tables

- `assistsettings_conversations` (already listed above)
- `assistsettings_messages` (already listed above)

**Total in Public Schema: ~27 tables**

---

### 1.2 Tables to MIGRATE to Tenant Schemas

#### A. Core Platform Tenant Tables - 8 tables

- `user_tenants` - User-tenant membership
- `user_sessions` - Session management
- `user_profiles` - Extended user profiles per tenant
- `user_actions` - User action audit trail
- `tenant_invitations` - Pending invitations
- `invite_billing_events` - Invitation billing events
- `company_info` - Company details
- `departments` - Organizational departments
- `teams` - Team groupings
- `team_members` - Team membership
- `tenant_context` - Business context for AI
- `tenant_blueprints` - Business blueprint summary
- `sequence_counters` - Auto-increment codes

#### B. Module Management Tables - 6 tables

- `modules` - Installed modules (legacy)
- `tenant_modules` - Active modules per tenant
- `module_features` - Feature flags
- `module_pages` - Navigation menu structure
- `module_interface_config` - UI customization
- `user_module_preferences` - User module preferences

#### C. All Business Module Tables - ~280 tables

**CRM Module (15 tables):**

- `clients`, `client_embeddings`, `entities`, `opportunities`, `opportunity_rules`
- `crm_activities`, `crm_contracts`, `crm_renewals`, `contract_submissions`
- `activities`, `activity_feed`

**Financial Module (35 tables):**

- Chart of accounts, journals, invoicing, payables, banking, taxation, open banking, financial models

**Inventory Module (20 tables):**

- Products, recipes, stock control, production

**Commercial/Sales Module (25 tables):**

- Service lines, quotes, pricing, sales orders

**Projects Module (20 tables):**

- Projects, phases, tasks, resources, documents, governance

**Lead Generation (15 tables):**

- Leads, campaigns, scoring, pipeline, email sequences

**Logistics Module (3 tables):**

- Catering operations

**Document Management (15 tables):**

- Documents, versions, folders, AI analysis, relations

**Communication (10 tables):**

- Email, WhatsApp, notifications

**Configuration & Schema Evolution (25 tables):**

- Schema versions, migrations, rollback, sandbox, blueprints, custom entities, workflows

**Integration & Connector (15 tables):**

- Connectors, OAuth, provider sync, storage providers

**Agent & Automation (25 tables):**

- Agent library, execution, configuration, learning, automation

**Purchasing Module (15 tables):**

- Suppliers, RFQs, purchase orders, receipts, invoices

**Miscellaneous (20 tables):**

- Audit logs, development, forms, webhooks, onboarding, patterns

**Total to Migrate: ~288 tables**

---

## 2. Migration Strategy

### 2.1 Phase 1: Preparation (Week 1)

#### 1.1 Schema Registry Enhancement

```sql
-- Add migration tracking columns
ALTER TABLE tenant_schemas ADD COLUMN IF NOT EXISTS migration_status VARCHAR(50) DEFAULT 'pending';
ALTER TABLE tenant_schemas ADD COLUMN IF NOT EXISTS migration_started_at TIMESTAMP;
ALTER TABLE tenant_schemas ADD COLUMN IF NOT EXISTS migration_completed_at TIMESTAMP;
ALTER TABLE tenant_schemas ADD COLUMN IF NOT EXISTS tables_migrated INTEGER DEFAULT 0;
ALTER TABLE tenant_schemas ADD COLUMN IF NOT EXISTS migration_errors JSONB;
```

#### 1.2 Create Migration Tracking Table

```sql
CREATE TABLE IF NOT EXISTS schema_migration_log (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR NOT NULL REFERENCES tenants(id),
  table_name VARCHAR NOT NULL,
  source_schema VARCHAR NOT NULL DEFAULT 'public',
  target_schema VARCHAR NOT NULL,
  migration_status VARCHAR(50) NOT NULL, -- 'pending', 'in_progress', 'completed', 'failed'
  rows_migrated INTEGER DEFAULT 0,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  error_message TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

#### 1.3 Update Tenant Schema Service

- Add `migrateTableToTenantSchema()` method
- Add `rollbackTableMigration()` method
- Add batch migration support

### 2.2 Phase 2: AI Chat Systems Refactoring (Week 1-2)

#### 2.1 Modify AI Chat Tables

```sql
-- For each AI chat table:
-- 1. Add user_id column (if not exists)
-- 2. Migrate data: user_id = (SELECT user_id FROM user_tenants WHERE tenant_id = X LIMIT 1)
-- 3. Remove tenant_id column
-- 4. Add foreign key: user_id REFERENCES users(id)

-- Example for conversations table:
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS user_id VARCHAR REFERENCES users(id);
UPDATE conversations c
SET user_id = (
  SELECT ut.user_id
  FROM user_tenants ut
  WHERE ut.tenant_id = c.tenant_id
  LIMIT 1
);
ALTER TABLE conversations DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE conversations DROP COLUMN IF EXISTS environment; -- Not needed for user-scoped
CREATE INDEX IF NOT EXISTS conversations_user_id_idx ON conversations(user_id);
```

**Tables to modify:**

- `conversations`, `messages`, `conversation_insights`
- `assistbuild_conversations`, `assistbuild_messages`
- `assistsettings_conversations`, `assistsettings_messages`

### 2.3 Phase 3: Tenant Schema Migration (Week 2-4)

#### 3.1 Migration Order (Critical Dependencies First)

**Batch 1: Core Platform Tables (13 tables)**

1. `user_tenants` - Foundation for all tenant operations
2. `tenant_invitations`
3. `company_info`
4. `departments`
5. `teams`, `team_members`
6. `user_profiles`
7. `user_actions`
8. `user_sessions`
9. `tenant_context`
10. `tenant_blueprints`
11. `sequence_counters`
12. `invite_billing_events`

**Batch 2: Module Management (6 tables)**

1. `tenant_modules`
2. `module_pages`
3. `module_features`
4. `module_interface_config`
5. `user_module_preferences`
6. `modules` (legacy)

**Batch 3: Business Modules (by dependency order)**

- Products/UOMs first (referenced by many)
- Then CRM, Finance, Inventory, Commercial, Projects, etc.

#### 3.2 Migration Script Template

```typescript
async function migrateTableToTenantSchema(
  tenantId: string,
  tableName: string,
  preserveData: boolean = true
): Promise<void> {
  const schemaName = await tenantSchemaService.getTenantSchemaName(tenantId);
  if (!schemaName) {
    throw new Error(`No schema found for tenant ${tenantId}`);
  }

  // 1. Create table in tenant schema (from template or copy structure)
  const createTableDDL = await generateTableDDL(tableName, schemaName);
  await tenantSchemaService.executeInTenantSchema(tenantId, [createTableDDL]);

  // 2. Migrate data if preserveData = true
  if (preserveData) {
    const migrateDataSQL = `
      INSERT INTO ${schemaName}.${tableName}
      SELECT * FROM public.${tableName}
      WHERE tenant_id = $1
    `;
    await db.execute(sql.raw(migrateDataSQL), [tenantId]);
  }

  // 3. Create indexes
  const indexes = await getTableIndexes(tableName);
  for (const index of indexes) {
    await tenantSchemaService.executeInTenantSchema(tenantId, [index]);
  }

  // 4. Update foreign key references
  await updateForeignKeyReferences(tableName, schemaName);

  // 5. Log migration
  await logMigration(tenantId, tableName, "completed");
}
```

### 2.4 Phase 4: Module Templates System (Week 3-4)

#### 4.1 Module Template Structure

```sql
-- Create module_templates_schema table in public schema
CREATE TABLE IF NOT EXISTS module_table_templates (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id VARCHAR NOT NULL REFERENCES module_templates(id),
  table_name VARCHAR NOT NULL,
  table_definition JSONB NOT NULL, -- Full DDL as JSON
  is_core BOOLEAN NOT NULL DEFAULT false, -- Core tables vs optional
  display_order INTEGER,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

#### 4.2 Template Installation Process

1. User activates module via AssistBuild
2. System reads `module_table_templates` for that module
3. Generates DDL from templates
4. Creates tables in tenant schema
5. User can customize via AssistBuild tools

### 2.5 Phase 5: Code Updates (Week 4-5)

#### 5.1 Update Database Access Layer

**Create Schema-Aware Query Builder:**

```typescript
export class TenantAwareQueryBuilder {
  constructor(
    private tenantId: string,
    private environment: Environment = "production"
  ) {}

  async query<T>(table: Table, conditions: any): Promise<T[]> {
    const schemaName = await tenantSchemaService.getTenantSchemaName(
      this.tenantId
    );
    if (!schemaName) {
      throw new Error(`No schema for tenant ${this.tenantId}`);
    }

    // Use schema-qualified table name
    return db.execute(
      sql`SELECT * FROM ${sql.identifier(schemaName)}.${sql.identifier(
        table.name
      )} 
          WHERE tenant_id = ${this.tenantId} 
          AND environment = ${this.environment}`
    );
  }
}
```

#### 5.2 Update All Service Layers

- Replace direct `db.select().from(table)` with schema-aware queries
- Update all CRUD operations
- Update all foreign key lookups

#### 5.3 Update Drizzle Schema Definitions

- Keep schema definitions in `shared/schema.ts` for type safety
- Add schema name resolution at runtime
- Use `sql.identifier()` for schema-qualified queries

### 2.6 Phase 6: Data Migration Execution (Week 5-6)

#### 6.1 Migration Execution Plan

**Per-Tenant Migration:**

1. For each tenant:
   - Verify schema exists
   - Migrate tables in dependency order
   - Verify data integrity
   - Update application code to use tenant schema
   - Mark migration complete

**Zero-Downtime Strategy:**

- Use dual-write pattern: Write to both `public` and tenant schema
- Read from tenant schema once migration complete
- Remove dual-write after verification period

#### 6.2 Rollback Plan

- Keep original tables in `public` for 30 days
- Maintain migration log for rollback capability
- Script to restore data from tenant schema to `public` if needed

### 2.7 Phase 7: Cleanup & Optimization (Week 6-7)

#### 7.1 Remove Migrated Tables from Public Schema

```sql
-- After verification period (30 days)
DROP TABLE IF EXISTS public.clients CASCADE;
DROP TABLE IF EXISTS public.products CASCADE;
-- ... (all migrated tables)
```

#### 7.2 Update Indexes

- Create tenant-specific indexes in tenant schemas
- Remove old indexes from public schema

#### 7.3 Performance Optimization

- Analyze query patterns per tenant
- Create tenant-specific indexes
- Optimize foreign key constraints

---

## 3. Additional Rules & Considerations

### 3.1 Scalability Enhancements

#### A. Schema-Level Isolation

- Each tenant gets isolated schema = better query performance
- No cross-tenant data leakage possible
- Easier to scale individual tenants

#### B. Connection Pooling Strategy

```typescript
// Use schema-specific connection pools
const tenantPool = new Pool({
  connectionString: DATABASE_URL,
  // Set default schema for connection
  options: `-c search_path=${schemaName},public`,
});
```

#### C. Query Performance

- Schema-qualified queries are faster (no tenant_id filtering needed)
- Smaller tables per schema = faster indexes
- Better query plan optimization

### 3.2 Reliability Enhancements

#### A. Foreign Key Handling

**Problem:** Foreign keys can't reference across schemas easily

**Solution:**

1. Keep reference tables in `public` (users, tenants, module_templates)
2. Use application-level referential integrity for tenant schema tables
3. Or use PostgreSQL's cross-schema foreign keys (requires careful setup)

```sql
-- Example: Cross-schema foreign key
ALTER TABLE tenant_schema.clients
ADD CONSTRAINT clients_user_id_fk
FOREIGN KEY (created_by)
REFERENCES public.users(id);
```

#### B. Transaction Management

- All operations within tenant schema are transactional
- Cross-schema transactions require careful handling
- Use two-phase commits for critical operations

#### C. Backup Strategy

- Backup each tenant schema separately
- Enable point-in-time recovery per tenant
- Tenant-level backup/restore capabilities

### 3.3 Security Enhancements

#### A. Row-Level Security (RLS)

```sql
-- Enable RLS on tenant schema tables
ALTER TABLE tenant_schema.clients ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only access their tenant's data
CREATE POLICY tenant_isolation ON tenant_schema.clients
  FOR ALL
  USING (
    tenant_id = current_setting('app.current_tenant_id')::VARCHAR
  );
```

#### B. Schema Access Control

```sql
-- Grant access only to application role
GRANT USAGE ON SCHEMA tenant_acme_corp TO app_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA tenant_acme_corp TO app_role;
```

### 3.4 Module Template System

#### A. Template Definition

```typescript
interface ModuleTableTemplate {
  moduleId: string;
  tableName: string;
  columns: ColumnDefinition[];
  indexes: IndexDefinition[];
  foreignKeys: ForeignKeyDefinition[];
  isCore: boolean; // Core tables installed automatically
  isOptional: boolean; // User can choose to install
}
```

#### B. Template Installation Flow

1. User activates module → AssistBuild shows available tables
2. User previews table structure
3. User approves → Tables created in tenant schema
4. User can customize via `modify_table_structure` tool

### 3.5 Environment Isolation

**Keep `environment` column in tenant schemas:**

- Sandbox vs Production data in same schema
- Use `environment` filter in queries
- Easier to promote sandbox → production

---

## 4. Migration Checklist

### Pre-Migration

- [ ] Backup entire database
- [ ] Test migration on staging tenant
- [ ] Verify schema creation works
- [ ] Test data migration scripts
- [ ] Update application code for schema-aware queries
- [ ] Create rollback scripts

### During Migration

- [ ] Migrate one tenant at a time (or batch small tenants)
- [ ] Verify data integrity after each tenant
- [ ] Monitor application errors
- [ ] Keep dual-write active during transition
- [ ] Log all migration steps

### Post-Migration

- [ ] Verify all queries work correctly
- [ ] Performance testing
- [ ] Monitor error rates
- [ ] Keep public schema tables for 30 days
- [ ] Document any issues
- [ ] Update documentation

---

## 5. Risk Mitigation

### High-Risk Areas

1. Foreign key constraints across schemas
2. Application code updates (many files)
3. Data migration (large tables)
4. Performance impact during migration

### Mitigation Strategies

1. Test foreign key handling thoroughly
2. Gradual code rollout with feature flags
3. Migrate during low-traffic periods
4. Monitor query performance closely

---

## 6. Success Metrics

- [ ] All tenant tables migrated to tenant schemas
- [ ] Zero data loss
- [ ] Application performance maintained or improved
- [ ] No increase in error rates
- [ ] Module template system operational
- [ ] Documentation updated

---

## 7. Timeline Summary

| Phase   | Duration | Tasks                               |
| ------- | -------- | ----------------------------------- |
| Phase 1 | Week 1   | Preparation, tracking tables        |
| Phase 2 | Week 1-2 | AI chat systems refactoring         |
| Phase 3 | Week 2-4 | Migration scripts, module templates |
| Phase 4 | Week 3-4 | Module template system              |
| Phase 5 | Week 4-5 | Code updates                        |
| Phase 6 | Week 5-6 | Data migration execution            |
| Phase 7 | Week 6-7 | Cleanup, optimization               |

**Total Duration: 6-7 weeks**

---

# Technical implementation plan: table-by-table refactoring

## Table classification matrix

### Category 1: Stay in `public` schema (no changes)

#### 1.1 Global platform tables (G)

| Table                    | Current | Action   | Notes               |
| ------------------------ | ------- | -------- | ------------------- |
| `users`                  | public  | **KEEP** | No changes needed   |
| `tenants`                | public  | **KEEP** | No changes needed   |
| `tenant_schemas`         | public  | **KEEP** | Already created     |
| `module_templates`       | public  | **KEEP** | Reference data      |
| `workflow_templates`     | public  | **KEEP** | Reference data      |
| `tool_embeddings`        | public  | **KEEP** | AI tool embeddings  |
| `blueprint_templates`    | public  | **KEEP** | Reference data      |
| `agents_library`         | public  | **KEEP** | Reference data      |
| `core_assets`            | public  | **KEEP** | Platform protection |
| `configuration_patterns` | public  | **KEEP** | Reference data      |
| `subscription_plans`     | public  | **KEEP** | Reference data      |
| `cross_tenant_patterns`  | public  | **KEEP** | E-only, no T        |

#### 1.2 Billing tables (stay in public for centralized billing)

| Table                      | Current        | Action   | SQL Changes | Code Changes           |
| -------------------------- | -------------- | -------- | ----------- | ---------------------- |
| `tenant_subscriptions`     | public (T)     | **KEEP** | None        | None - already correct |
| `tenant_credits`           | public (T+E)   | **KEEP** | None        | None - already correct |
| `credit_pricing_rules`     | public (T+E)   | **KEEP** | None        | None - already correct |
| `credit_transactions`      | public (T+E)   | **KEEP** | None        | None - already correct |
| `credit_packages`          | public (T)     | **KEEP** | None        | None - already correct |
| `credit_package_purchases` | public (T)     | **KEEP** | None        | None - already correct |
| `usage_events`             | public (T+E+U) | **KEEP** | None        | None - already correct |
| `invite_billing_events`    | public (T)     | **KEEP** | None        | None - already correct |

---

### Category 2: Modify in `public` schema (AI chat systems)

#### 2.1 AssistME tables — change to user-scoped

**Table: `conversations`**

```sql
-- Current: T+E (has tenant_id, environment)
-- Target: U (user_id only, no tenant_id)

-- Step 1: Add user_id column
ALTER TABLE conversations
ADD COLUMN IF NOT EXISTS user_id VARCHAR REFERENCES users(id);

-- Step 2: Migrate data (assign to first user in tenant)
UPDATE conversations c
SET user_id = (
  SELECT ut.user_id
  FROM user_tenants ut
  WHERE ut.tenant_id = c.tenant_id
  ORDER BY ut.joined_at ASC
  LIMIT 1
)
WHERE user_id IS NULL;

-- Step 3: Make user_id NOT NULL after migration
ALTER TABLE conversations
ALTER COLUMN user_id SET NOT NULL;

-- Step 4: Remove tenant_id and environment
ALTER TABLE conversations DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE conversations DROP COLUMN IF EXISTS environment;

-- Step 5: Update indexes
DROP INDEX IF EXISTS conversations_tenant_id_idx;
CREATE INDEX IF NOT EXISTS conversations_user_id_idx ON conversations(user_id);
CREATE INDEX IF NOT EXISTS conversations_created_at_idx ON conversations(created_at);
```

**Code changes:**

```typescript
// shared/schema.ts
export const conversations = pgTable(
  "conversations",
  {
    id: varchar("id").primaryKey(),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id), // Changed from tenantId
    // ... other columns
    // REMOVED: tenantId, environment
  },
  (table) => ({
    userIdIdx: index("conversations_user_id_idx").on(table.userId),
  })
);

// apps/api/services/conversation.service.ts
// Change all queries from:
//   .where(eq(conversations.tenantId, tenantId))
// To:
//   .where(eq(conversations.userId, userId))
```

**Table: `messages`**

```sql
-- Same pattern as conversations
ALTER TABLE messages ADD COLUMN IF NOT EXISTS user_id VARCHAR REFERENCES users(id);

UPDATE messages m
SET user_id = (
  SELECT c.user_id
  FROM conversations c
  WHERE c.id = m.conversation_id
)
WHERE user_id IS NULL;

ALTER TABLE messages ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE messages DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE messages DROP COLUMN IF EXISTS environment;

DROP INDEX IF EXISTS messages_tenant_id_idx;
CREATE INDEX IF NOT EXISTS messages_user_id_idx ON messages(user_id);
CREATE INDEX IF NOT EXISTS messages_conversation_id_idx ON messages(conversation_id);
```

**Table: `conversation_insights`**

```sql
-- Same pattern
ALTER TABLE conversation_insights ADD COLUMN IF NOT EXISTS user_id VARCHAR REFERENCES users(id);

UPDATE conversation_insights ci
SET user_id = (
  SELECT c.user_id
  FROM conversations c
  WHERE c.id = ci.conversation_id
)
WHERE user_id IS NULL;

ALTER TABLE conversation_insights ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE conversation_insights DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE conversation_insights DROP COLUMN IF EXISTS environment;
```

#### 2.2 AssistBuild tables — change to user-scoped

**Table: `assistbuild_conversations`**

```sql
ALTER TABLE assistbuild_conversations ADD COLUMN IF NOT EXISTS user_id VARCHAR REFERENCES users(id);

UPDATE assistbuild_conversations abc
SET user_id = (
  SELECT ut.user_id
  FROM user_tenants ut
  WHERE ut.tenant_id = abc.tenant_id
  ORDER BY ut.joined_at ASC
  LIMIT 1
)
WHERE user_id IS NULL;

ALTER TABLE assistbuild_conversations ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE assistbuild_conversations DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE assistbuild_conversations DROP COLUMN IF EXISTS environment;
```

**Table: `assistbuild_messages`**

```sql
-- Similar to messages, linked via conversation
ALTER TABLE assistbuild_messages ADD COLUMN IF NOT EXISTS user_id VARCHAR REFERENCES users(id);

UPDATE assistbuild_messages abm
SET user_id = (
  SELECT abc.user_id
  FROM assistbuild_conversations abc
  WHERE abc.id = abm.conversation_id
)
WHERE user_id IS NULL;

ALTER TABLE assistbuild_messages ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE assistbuild_messages DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE assistbuild_messages DROP COLUMN IF EXISTS environment;
```

#### 2.3 AssistSettings tables — already user-scoped

**Tables: `assistsettings_conversations`, `assistsettings_messages`**

- Already U-scoped (no tenant_id)
- No changes needed

---

### Category 3: Migrate to tenant schemas

#### 3.1 Core platform tenant tables

**Table: `user_tenants`**

```sql
-- Migration to tenant schema
-- This is CRITICAL - must be first as other tables depend on it

-- Step 1: Create table in tenant schema
CREATE TABLE IF NOT EXISTS tenant_<slug>.user_tenants (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL REFERENCES public.users(id),
  tenant_id VARCHAR NOT NULL REFERENCES public.tenants(id),
  role VARCHAR NOT NULL,
  permissions JSONB,
  scopes JSONB,
  active_environment TEXT NOT NULL DEFAULT 'sandbox',
  studio_mode TEXT,
  invited_by VARCHAR,
  joined_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Step 2: Migrate data
INSERT INTO tenant_<slug>.user_tenants
SELECT * FROM public.user_tenants
WHERE tenant_id = '<tenant_id>';

-- Step 3: Create indexes
CREATE INDEX IF NOT EXISTS user_tenants_user_id_idx ON tenant_<slug>.user_tenants(user_id);
CREATE INDEX IF NOT EXISTS user_tenants_tenant_id_idx ON tenant_<slug>.user_tenants(tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS user_tenants_user_tenant_unique ON tenant_<slug>.user_tenants(user_id, tenant_id);

-- Step 4: Cross-schema foreign key (PostgreSQL allows this)
-- Already defined in CREATE TABLE above
```

**Code changes:**

```typescript
// apps/api/services/tenant.service.ts
// Update getTenantDb() to use tenant schema
export async function getUserTenants(
  userId: string
): Promise<TenantWithRole[]> {
  // For each tenant, query from tenant schema
  const tenantIds = await db
    .select({ tenantId: userTenants.tenantId })
    .from(userTenants)
    .where(eq(userTenants.userId, userId));

  const results = [];
  for (const { tenantId } of tenantIds) {
    const schemaName = await tenantSchemaService.getTenantSchemaName(tenantId);
    if (!schemaName) continue;

    const tenantData = await db.execute(sql`
      SELECT * FROM ${sql.identifier(schemaName)}.user_tenants
      WHERE user_id = ${userId} AND tenant_id = ${tenantId}
    `);
    results.push(...tenantData.rows);
  }
  return results;
}
```

**Table: `company_info`**

```sql
-- Create in tenant schema
CREATE TABLE IF NOT EXISTS tenant_<slug>.company_info (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR NOT NULL REFERENCES public.tenants(id),
  environment TEXT NOT NULL DEFAULT 'production',
  -- ... all other columns from current schema
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Migrate data
INSERT INTO tenant_<slug>.company_info
SELECT * FROM public.company_info
WHERE tenant_id = '<tenant_id>';

-- Cross-schema FK to public.tenants
-- Already defined above
```

**Table: `departments`**

```sql
CREATE TABLE IF NOT EXISTS tenant_<slug>.departments (
  id VARCHAR PRIMARY KEY,
  tenant_id VARCHAR NOT NULL REFERENCES public.tenants(id),
  environment TEXT NOT NULL DEFAULT 'production',
  name VARCHAR NOT NULL,
  -- ... other columns
);

INSERT INTO tenant_<slug>.departments
SELECT * FROM public.departments
WHERE tenant_id = '<tenant_id>';
```

**Table: `teams`, `team_members`**

```sql
-- Similar pattern
-- Note: team_members may reference users (public) and teams (tenant schema)
CREATE TABLE IF NOT EXISTS tenant_<slug>.teams (
  -- columns
);

CREATE TABLE IF NOT EXISTS tenant_<slug>.team_members (
  id VARCHAR PRIMARY KEY,
  team_id VARCHAR NOT NULL REFERENCES tenant_<slug>.teams(id),
  user_id VARCHAR NOT NULL REFERENCES public.users(id), -- Cross-schema FK
  -- ... other columns
);
```

**Table: `user_profiles`**

```sql
CREATE TABLE IF NOT EXISTS tenant_<slug>.user_profiles (
  id VARCHAR PRIMARY KEY,
  tenant_id VARCHAR NOT NULL REFERENCES public.tenants(id),
  environment TEXT NOT NULL DEFAULT 'production',
  user_id VARCHAR NOT NULL REFERENCES public.users(id), -- Cross-schema FK
  -- ... other columns
);
```

**Table: `user_actions`**

```sql
CREATE TABLE IF NOT EXISTS tenant_<slug>.user_actions (
  id VARCHAR PRIMARY KEY,
  tenant_id VARCHAR NOT NULL REFERENCES public.tenants(id),
  environment TEXT NOT NULL DEFAULT 'production',
  user_id VARCHAR NOT NULL REFERENCES public.users(id),
  -- ... other columns
);
```

**Table: `tenant_invitations`**

```sql
CREATE TABLE IF NOT EXISTS tenant_<slug>.tenant_invitations (
  id VARCHAR PRIMARY KEY,
  tenant_id VARCHAR NOT NULL REFERENCES public.tenants(id),
  environment TEXT NOT NULL DEFAULT 'production',
  email VARCHAR NOT NULL,
  -- ... other columns
);
```

**Table: `tenant_context`, `tenant_blueprints`**

```sql
-- Similar pattern for both
CREATE TABLE IF NOT EXISTS tenant_<slug>.tenant_context (
  id VARCHAR PRIMARY KEY,
  tenant_id VARCHAR NOT NULL REFERENCES public.tenants(id),
  environment TEXT NOT NULL DEFAULT 'production',
  -- ... columns
);
```

**Table: `sequence_counters`**

```sql
CREATE TABLE IF NOT EXISTS tenant_<slug>.sequence_counters (
  id VARCHAR PRIMARY KEY,
  tenant_id VARCHAR NOT NULL REFERENCES public.tenants(id),
  environment TEXT NOT NULL DEFAULT 'production',
  entity_type VARCHAR NOT NULL,
  prefix VARCHAR NOT NULL,
  current_value INTEGER NOT NULL DEFAULT 0,
  -- ... other columns
);
```

#### 3.2 Module management tables

**Table: `tenant_modules`**

```sql
CREATE TABLE IF NOT EXISTS tenant_<slug>.tenant_modules (
  id VARCHAR PRIMARY KEY,
  tenant_id VARCHAR NOT NULL REFERENCES public.tenants(id),
  environment TEXT NOT NULL DEFAULT 'production',
  module_id VARCHAR NOT NULL REFERENCES public.module_templates(id), -- Cross-schema FK
  is_active BOOLEAN NOT NULL DEFAULT true,
  -- ... other columns
);
```

**Table: `module_pages`**

```sql
CREATE TABLE IF NOT EXISTS tenant_<slug>.module_pages (
  id VARCHAR PRIMARY KEY,
  tenant_id VARCHAR NOT NULL REFERENCES public.tenants(id),
  environment TEXT NOT NULL DEFAULT 'production',
  module_id VARCHAR NOT NULL REFERENCES public.module_templates(id),
  -- ... other columns
);
```

**Tables: `module_features`, `module_interface_config`, `user_module_preferences`**

- Same pattern as above

#### 3.3 Business module tables

**CRM module tables**

**Table: `clients`**

```sql
CREATE TABLE IF NOT EXISTS tenant_<slug>.clients (
  id VARCHAR PRIMARY KEY,
  tenant_id VARCHAR NOT NULL REFERENCES public.tenants(id),
  environment TEXT NOT NULL DEFAULT 'production',
  name VARCHAR NOT NULL,
  email VARCHAR,
  -- ... all other columns from current schema
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Migrate data
INSERT INTO tenant_<slug>.clients
SELECT * FROM public.clients
WHERE tenant_id = '<tenant_id>';

-- Indexes
CREATE INDEX IF NOT EXISTS clients_tenant_env_idx ON tenant_<slug>.clients(tenant_id, environment);
CREATE INDEX IF NOT EXISTS clients_name_idx ON tenant_<slug>.clients(name);
```

**Code changes:**

```typescript
// apps/api/services/client.service.ts
export async function getClients(tenantId: string, environment: Environment) {
  const schemaName = await tenantSchemaService.getTenantSchemaName(tenantId);
  if (!schemaName) throw new Error("No schema for tenant");

  return await db.execute(sql`
    SELECT * FROM ${sql.identifier(schemaName)}.clients
    WHERE tenant_id = ${tenantId} 
    AND environment = ${environment}
  `);
}
```

**Table: `opportunities`**

```sql
CREATE TABLE IF NOT EXISTS tenant_<slug>.opportunities (
  id VARCHAR PRIMARY KEY,
  tenant_id VARCHAR NOT NULL REFERENCES public.tenants(id),
  environment TEXT NOT NULL DEFAULT 'production',
  client_id VARCHAR NOT NULL REFERENCES tenant_<slug>.clients(id), -- Same-schema FK
  -- ... other columns
);
```

**Financial module tables**

**Table: `invoices`**

```sql
CREATE TABLE IF NOT EXISTS tenant_<slug>.invoices (
  id VARCHAR PRIMARY KEY,
  tenant_id VARCHAR NOT NULL REFERENCES public.tenants(id),
  environment TEXT NOT NULL DEFAULT 'production',
  invoice_number VARCHAR NOT NULL,
  client_id VARCHAR NOT NULL REFERENCES tenant_<slug>.clients(id),
  -- ... other columns
);

-- Note: invoice_number might use sequence_counters from same schema
```

**Table: `chart_of_accounts`**

```sql
CREATE TABLE IF NOT EXISTS tenant_<slug>.chart_of_accounts (
  id VARCHAR PRIMARY KEY,
  tenant_id VARCHAR NOT NULL REFERENCES public.tenants(id),
  environment TEXT NOT NULL DEFAULT 'production',
  account_code VARCHAR NOT NULL,
  account_name VARCHAR NOT NULL,
  -- ... other columns
);
```

**Inventory module tables**

**Table: `products`**

```sql
CREATE TABLE IF NOT EXISTS tenant_<slug>.products (
  id VARCHAR PRIMARY KEY,
  tenant_id VARCHAR NOT NULL REFERENCES public.tenants(id),
  environment TEXT NOT NULL DEFAULT 'production',
  name VARCHAR NOT NULL,
  sku VARCHAR,
  uom_id VARCHAR NOT NULL REFERENCES tenant_<slug>.uoms(id), -- Same-schema FK
  -- ... other columns
);
```

**Table: `uoms`**

```sql
CREATE TABLE IF NOT EXISTS tenant_<slug>.uoms (
  id VARCHAR PRIMARY KEY,
  tenant_id VARCHAR NOT NULL REFERENCES public.tenants(id),
  environment TEXT NOT NULL DEFAULT 'production',
  code VARCHAR NOT NULL,
  name VARCHAR NOT NULL,
  -- ... other columns
);
```

**All other module tables follow the same pattern**

---

## Implementation service: table migration

```typescript
// apps/api/services/table-migration.service.ts

export class TableMigrationService {
  /**
   * Migrate a single table from public to tenant schema
   */
  async migrateTable(
    tenantId: string,
    tableName: string,
    tableDefinition: TableDefinition
  ): Promise<void> {
    const schemaName = await tenantSchemaService.getTenantSchemaName(tenantId);
    if (!schemaName) throw new Error(`No schema for tenant ${tenantId}`);

    // 1. Generate CREATE TABLE DDL
    const createTableDDL = this.generateCreateTableDDL(
      schemaName,
      tableName,
      tableDefinition
    );

    // 2. Execute in tenant schema
    await tenantSchemaService.executeInTenantSchema(tenantId, [createTableDDL]);

    // 3. Migrate data
    const rowCount = await this.migrateTableData(
      tenantId,
      schemaName,
      tableName,
      tableDefinition
    );

    // 4. Create indexes
    const indexDDLs = this.generateIndexDDLs(
      schemaName,
      tableName,
      tableDefinition.indexes
    );
    await tenantSchemaService.executeInTenantSchema(tenantId, indexDDLs);

    // 5. Update foreign keys
    await this.updateForeignKeys(
      tenantId,
      schemaName,
      tableName,
      tableDefinition
    );

    console.log(`✅ Migrated ${tableName}: ${rowCount} rows`);
  }

  private generateCreateTableDDL(
    schemaName: string,
    tableName: string,
    def: TableDefinition
  ): string {
    const columns = def.columns
      .map((col) => {
        let colDef = `"${col.name}" ${col.type}`;
        if (col.notNull) colDef += " NOT NULL";
        if (col.default) colDef += ` DEFAULT ${col.default}`;
        return colDef;
      })
      .join(",\n    ");

    const constraints = def.constraints || [];
    const constraintDefs = constraints
      .map((c) => {
        if (c.type === "primary_key") {
          return `PRIMARY KEY ("${c.columns.join('", "')}")`;
        }
        if (c.type === "foreign_key") {
          const refSchema = c.referenceSchema || "public";
          return `FOREIGN KEY ("${c.column}") REFERENCES ${refSchema}.${c.referenceTable}("${c.referenceColumn}")`;
        }
        return "";
      })
      .filter(Boolean)
      .join(",\n    ");

    return `
CREATE TABLE IF NOT EXISTS "${schemaName}"."${tableName}" (
    ${columns}${constraints.length ? ",\n    " + constraintDefs : ""}
);
    `.trim();
  }

  private async migrateTableData(
    tenantId: string,
    schemaName: string,
    tableName: string,
    def: TableDefinition
  ): Promise<number> {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });

    // Check if table has tenant_id
    const hasTenantId = def.columns.some((c) => c.name === "tenant_id");

    let query: string;
    if (hasTenantId) {
      query = `
        INSERT INTO "${schemaName}"."${tableName}"
        SELECT * FROM public."${tableName}"
        WHERE tenant_id = $1
      `;
    } else {
      // For tables without tenant_id, migrate all (shouldn't happen for tenant tables)
      query = `
        INSERT INTO "${schemaName}"."${tableName}"
        SELECT * FROM public."${tableName}"
      `;
    }

    const result = await pool.query(query, hasTenantId ? [tenantId] : []);
    await pool.end();

    return result.rowCount || 0;
  }
}
```

---

## Code changes: schema-aware query builder

```typescript
// apps/api/utils/tenant-query-builder.ts

export class TenantQueryBuilder {
  constructor(
    private tenantId: string,
    private environment: Environment = "production"
  ) {}

  /**
   * Get schema-qualified table reference
   */
  private async getTableRef(tableName: string): Promise<SQL> {
    const schemaName = await tenantSchemaService.getTenantSchemaName(
      this.tenantId
    );
    if (!schemaName) {
      throw new Error(`No schema for tenant ${this.tenantId}`);
    }
    return sql.identifier(schemaName, tableName);
  }

  /**
   * Select from tenant schema table
   */
  async select<T>(
    tableName: string,
    conditions?: Record<string, any>
  ): Promise<T[]> {
    const tableRef = await this.getTableRef(tableName);

    let query = sql`SELECT * FROM ${tableRef}`;
    const params: any[] = [];

    // Always add tenant_id and environment filters
    const whereConditions = [
      sql`tenant_id = ${this.tenantId}`,
      sql`environment = ${this.environment}`,
    ];

    // Add additional conditions
    if (conditions) {
      for (const [key, value] of Object.entries(conditions)) {
        whereConditions.push(sql`${sql.identifier(key)} = ${value}`);
      }
    }

    query = sql`${query} WHERE ${sql.join(whereConditions, sql` AND `)}`;

    return await db.execute(query);
  }

  /**
   * Insert into tenant schema table
   */
  async insert<T>(tableName: string, data: Record<string, any>): Promise<T> {
    const schemaName = await tenantSchemaService.getTenantSchemaName(
      this.tenantId
    );
    if (!schemaName) throw new Error(`No schema for tenant ${this.tenantId}`);

    // Always add tenant_id and environment
    const insertData = {
      ...data,
      tenant_id: this.tenantId,
      environment: this.environment,
    };

    const columns = Object.keys(insertData);
    const values = Object.values(insertData);
    const placeholders = values.map((_, i) => `$${i + 1}`).join(", ");

    const query = `
      INSERT INTO "${schemaName}"."${tableName}" (${columns
      .map((c) => `"${c}"`)
      .join(", ")})
      VALUES (${placeholders})
      RETURNING *
    `;

    const result = await db.execute(sql.raw(query), values);
    return result.rows[0] as T;
  }
}
```

---

## Migration execution order

### Batch 1: Foundation (must be first)

1. `user_tenants` - All other tables depend on this
2. `tenant_invitations` - Referenced by user onboarding

### Batch 2: Core tenant data

3. `company_info`
4. `departments`
5. `teams`, `team_members`
6. `user_profiles`
7. `user_actions`
8. `user_sessions`
9. `tenant_context`
10. `tenant_blueprints`
11. `sequence_counters`

### Batch 3: Module management

12. `tenant_modules`
13. `module_pages`
14. `module_features`
15. `module_interface_config`
16. `user_module_preferences`

### Batch 4: Business modules (by dependency)

17. `uoms` (referenced by products)
18. `products` (referenced by many)
19. `clients` (referenced by invoices, opportunities)
20. `suppliers` (referenced by purchase orders)
21. All other module tables...

---

## Foreign key strategy

### Cross-schema foreign keys

PostgreSQL supports FKs across schemas:

```sql
-- Example: clients table in tenant schema referencing users in public
ALTER TABLE tenant_acme.clients
ADD CONSTRAINT clients_created_by_fk
FOREIGN KEY (created_by)
REFERENCES public.users(id);

-- Example: invoices referencing clients in same tenant schema
ALTER TABLE tenant_acme.invoices
ADD CONSTRAINT invoices_client_id_fk
FOREIGN KEY (client_id)
REFERENCES tenant_acme.clients(id);
```

### Reference table mapping

| Referenced Table   | Location      | FK Pattern                               |
| ------------------ | ------------- | ---------------------------------------- |
| `users`            | public        | `REFERENCES public.users(id)`            |
| `tenants`          | public        | `REFERENCES public.tenants(id)`          |
| `module_templates` | public        | `REFERENCES public.module_templates(id)` |
| `clients`          | tenant schema | `REFERENCES tenant_<slug>.clients(id)`   |
| `products`         | tenant schema | `REFERENCES tenant_<slug>.products(id)`  |

---
