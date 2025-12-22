# Database Migration Conflicts - Resolution Plan

**Date:** November 8, 2025  
**Status:** ✅ INVESTIGATION COMPLETE - AWAITING APPROVAL  
**Migration:** Environment Column Addition (Task 2.2.4)

---

## Executive Summary

### 🔍 Investigation Results

**Total Conflicts Identified:** 2 critical conflicts + 1 orphaned table

**Root Cause:**
Drizzle detected orphaned legacy tables in the database that are **not defined in schema.ts**, causing ambiguity about whether new tables/columns should be created or existing ones renamed.

**Impact:** 
- ⚠️ **BLOCKS** environment column migration
- Must be resolved before `npm run db:push` can proceed

**Resolution:** 
- ✅ **DROP 1 orphaned table** (`document_versions_legacy` - 0 rows)
- ✅ **KEEP 1 system table** (`user_sessions` - managed by express-session)
- ✅ **CREATE 1 new table** (`agent_runs` - as schema.ts expects)

---

## Conflict #1: agent_runs Table

### Drizzle Prompt:
```
Is agent_runs table created or renamed from another table?
❯ + agent_runs                            create table
  ~ document_versions_legacy › agent_runs rename table
  ~ user_sessions › agent_runs            rename table
```

### Investigation Findings:

| Table Name | Exists in DB? | Exists in schema.ts? | Row Count | Status |
|------------|---------------|---------------------|-----------|--------|
| `agent_runs` | ❌ NO | ✅ YES (Line 7940) | N/A | **TO BE CREATED** |
| `document_versions_legacy` | ✅ YES | ❌ NO | 0 | **ORPHANED** |
| `user_sessions` | ✅ YES | ❌ NO | 156 | **SYSTEM TABLE** |

### Analysis:

**1. agent_runs (target table)**
- Defined in schema.ts at line 7940 as `agentRuns`
- Purpose: Track agent executions within Execution Engine (automations/workflows)
- Status: Does NOT exist in database yet
- Action: **CREATE NEW TABLE** ✅

**2. document_versions_legacy (orphaned table)**
- Exists in database with 0 rows
- NOT defined in schema.ts
- Appears to be an old version of document tracking
- Columns: `id`, `tenant_id`, `original_file_id`, `version_number`, `file_id`, `changes_summary`, `comparison_data`, `uploaded_by`, `created_at`
- Status: **ORPHANED - SAFE TO DROP** ✅

**3. user_sessions (system table)**
- Exists in database with 156 rows
- NOT defined in schema.ts (intentional)
- Managed by `connect-pg-simple` middleware (express-session store)
- Columns: `sid` (session ID), `sess` (session data), `expire` (expiration)
- Status: **KEEP - REQUIRED BY EXPRESS-SESSION** ✅

### Resolution:

**Option A: DROP orphaned table (RECOMMENDED)**
```sql
-- Drop the orphaned legacy table
DROP TABLE IF EXISTS document_versions_legacy CASCADE;
```

**Then:** Re-run migration → Drizzle will create `agent_runs` without ambiguity

**Option B: Manual clarification in Drizzle**
- When prompted, select: `+ agent_runs create table`
- Manually drop `document_versions_legacy` later

---

## Conflict #2: document_versions.document_id Column

### Drizzle Prompt:
```
Is document_id column in document_versions table created or renamed from another column?
❯ + document_id                    create column
  ~ original_file_id › document_id rename column
  ~ file_id › document_id          rename column
  ~ changes_summary › document_id  rename column
  ~ comparison_data › document_id  rename column
```

### Investigation Findings:

**Current `document_versions` Table (Database):**

| Column Name | Type | Nullable | In schema.ts? | Status |
|-------------|------|----------|---------------|--------|
| `id` | varchar | NO | ✅ YES | ✅ Correct |
| `document_id` | varchar | NO | ✅ YES (Line 7328) | ✅ **CORRECT** |
| `tenant_id` | varchar | NO | ✅ YES | ✅ Correct |
| `version_number` | integer | NO | ✅ YES | ✅ Correct |
| `filename` | text | NO | ✅ YES | ✅ Correct |
| `mime_type` | text | NO | ✅ YES | ✅ Correct |
| `size` | integer | NO | ✅ YES | ✅ Correct |
| `storage_path` | text | NO | ✅ YES | ✅ Correct |
| `checksum` | text | NO | ✅ YES | ✅ Correct |
| `change_description` | text | YES | ✅ YES | ✅ Correct |
| `changed_by` | varchar | YES | ✅ YES | ✅ Correct |
| `created_at` | timestamp | NO | ✅ YES | ✅ Correct |
| **`environment`** | - | - | ✅ YES (Line 7330) | ⚠️ **MISSING** (to be added) |

**Legacy `document_versions_legacy` Table (Database):**

| Column Name | Type | Exists in current table? | Status |
|-------------|------|-------------------------|--------|
| `original_file_id` | varchar | ❌ NO | Legacy column |
| `file_id` | varchar | ❌ NO | Legacy column |
| `changes_summary` | text | ❌ NO | Legacy column |
| `comparison_data` | jsonb | ❌ NO | Legacy column |

### Analysis:

**Current State:**
- ✅ `document_id` column **ALREADY EXISTS** in `document_versions` table
- ✅ `document_id` is **CORRECTLY DEFINED** in schema.ts (Line 7328)
- ⚠️ `environment` column **MISSING** (this is what migration wants to add)

**Why Drizzle is Confused:**
- `document_versions_legacy` table exists with old column names (`original_file_id`, `file_id`, `changes_summary`, `comparison_data`)
- Drizzle sees these legacy columns and wonders if `document_id` in the current table is a rename from one of them
- **Reality:** The current `document_versions` table is correct; the legacy table is orphaned

### Resolution:

**Option A: DROP orphaned legacy table (RECOMMENDED)**
```sql
-- Drop the orphaned legacy table
DROP TABLE IF EXISTS document_versions_legacy CASCADE;
```

**Then:** Re-run migration → Drizzle will only add `environment` column without ambiguity

**Option B: Manual clarification in Drizzle**
- When prompted, select: `+ document_id create column`
- Drizzle will proceed to add `environment` column as expected

---

## Summary of Orphaned Objects

### Tables in Database but NOT in schema.ts:

| Table Name | Row Count | Purpose | Recommendation |
|------------|-----------|---------|----------------|
| `document_versions_legacy` | 0 | Legacy document tracking | ✅ **DROP** - Empty, orphaned |
| `user_sessions` | 156 | Express session store | ✅ **KEEP** - Managed by middleware |

### Columns Analysis:

**document_versions table:**
- Current columns: ✅ All correct, match schema.ts
- Missing column: `environment` (to be added by migration)
- Legacy columns: Only exist in `document_versions_legacy` (different table)

---

## Recommended Resolution Plan

### Phase 1: Pre-Migration Cleanup (SAFE - No Data Loss)

**Step 1: Verify data counts**
```sql
-- Confirm document_versions_legacy is empty
SELECT COUNT(*) FROM document_versions_legacy;
-- Expected: 0

-- Confirm user_sessions has data (express sessions)
SELECT COUNT(*) FROM user_sessions;
-- Expected: ~156 (active sessions)
```

**Step 2: Drop orphaned table**
```sql
-- Drop the orphaned legacy table
DROP TABLE IF EXISTS document_versions_legacy CASCADE;
```

**Step 3: Verify cleanup**
```sql
-- Confirm table is dropped
SELECT table_name 
FROM information_schema.tables 
WHERE table_name = 'document_versions_legacy'
  AND table_schema = 'public';
-- Expected: 0 rows (table gone)
```

### Phase 2: Run Migration (After Cleanup)

**Step 4: Execute migration**
```bash
npm run db:push
```

**Expected outcome:**
- ✅ Creates `agent_runs` table (no ambiguity)
- ✅ Adds `environment` column to `document_versions` (no ambiguity)
- ✅ Adds `environment` column to ~172 other tables
- ✅ No interactive prompts from Drizzle

### Phase 3: Post-Migration Verification

**Step 5: Verify new table**
```sql
-- Confirm agent_runs table created
SELECT table_name 
FROM information_schema.tables 
WHERE table_name = 'agent_runs'
  AND table_schema = 'public';
-- Expected: 1 row

-- Verify agent_runs structure
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'agent_runs'
ORDER BY ordinal_position;
```

**Step 6: Verify environment column added**
```sql
-- Confirm environment column in document_versions
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'document_versions'
  AND column_name = 'environment';
-- Expected: 1 row (environment, text, NO, 'production')
```

---

## Alternative Resolution (If Cannot Drop Table)

If for some reason we cannot drop `document_versions_legacy`:

### Option B: Manual Drizzle Responses

When running `npm run db:push`:

**Prompt 1:**
```
Is agent_runs table created or renamed from another table?
```
**Response:** Select `+ agent_runs create table`

**Prompt 2:**
```
Is document_id column in document_versions table created or renamed from another column?
```
**Response:** Select `+ document_id create column`

**Note:** This approach requires manual interaction and may prompt for additional confirmations.

---

## Risk Assessment

### Pre-Cleanup Risk: **ZERO** ✅

| Action | Risk Level | Reason |
|--------|------------|--------|
| Query table row counts | ZERO | Read-only operation |
| Verify table structure | ZERO | Read-only operation |

### Cleanup Risk: **MINIMAL** ✅

| Action | Risk Level | Reason | Mitigation |
|--------|------------|--------|------------|
| DROP document_versions_legacy | MINIMAL | 0 rows, orphaned table | Already verified empty |

### Migration Risk: **LOW** ✅

| Action | Risk Level | Reason | Mitigation |
|--------|------------|--------|------------|
| CREATE agent_runs | MINIMAL | New table, no existing data | Rollback: DROP TABLE |
| ADD environment column | LOW | Nullable column, non-destructive | Backfill job ready (Task 2.2.5) |

### Rollback Plan:

**If cleanup fails:**
```sql
-- No rollback needed - table is empty and orphaned
-- Can recreate if needed (no data loss)
```

**If migration fails:**
```sql
-- Drop newly created table
DROP TABLE IF EXISTS agent_runs CASCADE;

-- Remove environment column from affected tables
-- (See full rollback plan in MIGRATION_EXECUTION_PLAN.md)
```

---

## Pre-Execution Checklist

### ✅ Investigation Complete

- [x] Database schema queried
- [x] Conflicts identified
- [x] Orphaned tables verified
- [x] Row counts confirmed
- [x] Schema.ts cross-referenced
- [x] Resolution plan documented

### ⏳ Awaiting Approval

- [ ] Approve dropping `document_versions_legacy` table
- [ ] Approve keeping `user_sessions` table (express-session)
- [ ] Approve migration execution plan
- [ ] Schedule maintenance window (if needed)

### 📋 Pre-Execution Steps

- [ ] Backup database (development environment)
- [ ] Notify stakeholders
- [ ] Confirm no active development work
- [ ] Prepare rollback scripts

---

## Execution Commands (DO NOT RUN WITHOUT APPROVAL)

### ⚠️ REQUIRES EXPLICIT AUTHORIZATION

```bash
# === PHASE 1: PRE-MIGRATION CLEANUP ===

# Step 1: Verify data counts
psql $DATABASE_URL -c "SELECT COUNT(*) as legacy_count FROM document_versions_legacy;"
psql $DATABASE_URL -c "SELECT COUNT(*) as session_count FROM user_sessions;"

# Step 2: Drop orphaned table (AFTER APPROVAL)
psql $DATABASE_URL -c "DROP TABLE IF EXISTS document_versions_legacy CASCADE;"

# Step 3: Verify cleanup
psql $DATABASE_URL -c "SELECT table_name FROM information_schema.tables WHERE table_name = 'document_versions_legacy';"

# === PHASE 2: RUN MIGRATION ===

# Step 4: Execute migration (should now run without prompts)
npm run db:push

# === PHASE 3: POST-MIGRATION VERIFICATION ===

# Step 5: Verify agent_runs table created
psql $DATABASE_URL -c "SELECT * FROM information_schema.tables WHERE table_name = 'agent_runs';"

# Step 6: Verify environment column added
psql $DATABASE_URL -c "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'document_versions' AND column_name = 'environment';"

# Step 7: Verify no NULL values after backfill
# (Run AFTER Task 2.2.5 backfill job completes)
psql $DATABASE_URL -c "SELECT COUNT(*) FROM document_versions WHERE environment IS NULL;"
```

---

## Next Steps

### Immediate Actions:

1. **🔴 HIGH PRIORITY:** Review and approve resolution plan
2. **🔴 HIGH PRIORITY:** Approve dropping `document_versions_legacy` table
3. **🟡 MEDIUM PRIORITY:** Schedule migration execution
4. **🟡 MEDIUM PRIORITY:** Prepare database backup
5. **🟢 LOW PRIORITY:** Notify team members

### Post-Resolution:

1. Execute pre-migration cleanup (DROP legacy table)
2. Run migration (`npm run db:push`)
3. Execute backfill job (Task 2.2.5)
4. Verify migration success
5. Update documentation

---

## Appendix: Detailed Table Comparison

### agentRuns vs. Candidates

**agentRuns (schema.ts definition):**
```typescript
export const agentRuns = pgTable("agent_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id),
  environment: environmentColumn(),
  agentId: varchar("agent_id").notNull(),
  status: text("status").notNull(),
  inputData: jsonb("input_data"),
  outputData: jsonb("output_data"),
  errorMessage: text("error_message"),
  errorStack: text("error_stack"),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
  durationMs: integer("duration_ms"),
  metadata: jsonb("metadata"),
});
```

**user_sessions (express-session):**
```sql
-- Managed by connect-pg-simple
CREATE TABLE user_sessions (
  sid varchar NOT NULL PRIMARY KEY,
  sess json NOT NULL,
  expire timestamp NOT NULL
);
```

**document_versions_legacy (orphaned):**
```sql
-- Legacy structure (to be dropped)
CREATE TABLE document_versions_legacy (
  id varchar NOT NULL,
  tenant_id varchar NOT NULL,
  original_file_id varchar NOT NULL,
  version_number integer NOT NULL,
  file_id varchar NOT NULL,
  changes_summary text,
  comparison_data jsonb,
  uploaded_by varchar,
  created_at timestamp NOT NULL DEFAULT now()
);
```

**Conclusion:** No structural similarity between `agent_runs` and the candidate tables for renaming. They serve completely different purposes.

---

## Recommendations Summary

### ✅ RECOMMENDED APPROACH:

**Execute Pre-Migration Cleanup:**
1. Verify `document_versions_legacy` is empty (0 rows)
2. DROP `document_versions_legacy` CASCADE
3. KEEP `user_sessions` (managed by express-session)
4. Proceed with migration

**Benefits:**
- ✅ Clean migration (no interactive prompts)
- ✅ No data loss (table is empty)
- ✅ Eliminates future confusion
- ✅ Faster migration execution
- ✅ Cleaner database schema

**Risks:**
- ✅ **ZERO** data loss risk (table is empty)
- ✅ **MINIMAL** execution risk (simple DROP statement)
- ✅ **LOW** rollback complexity (table can be recreated if needed)

### ⚠️ APPROVAL REQUIRED:

This resolution plan is **READY FOR EXECUTION** pending explicit approval to:
1. DROP `document_versions_legacy` table
2. Proceed with environment column migration

---

**END OF DOCUMENT**
