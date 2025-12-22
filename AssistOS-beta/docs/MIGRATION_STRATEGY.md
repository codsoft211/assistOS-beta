# Environment Column Migration Strategy

**Version:** 1.0  
**Date:** November 8, 2025  
**Status:** Ready for Implementation  
**Target Tables:** 143 (Category A from SANDBOX_TABLE_INVENTORY.md)

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Migration Overview](#migration-overview)
3. [4-Step Migration Process](#4-step-migration-process)
4. [Table Grouping Strategy](#table-grouping-strategy)
5. [Detailed Phase Plans](#detailed-phase-plans)
6. [Rollback Procedures](#rollback-procedures)
7. [Performance Considerations](#performance-considerations)
8. [Risk Mitigation](#risk-mitigation)
9. [Monitoring & Validation](#monitoring--validation)
10. [Execution Checklist](#execution-checklist)

---

## Executive Summary

### Objective

Add `environment` column to 143 tables to enable sandbox/production data isolation in AssistOS multi-tenant architecture.

### Key Metrics

- **Total Tables:** 143 (Category A)
- **Estimated Duration:** 7-8 hours (with monitoring)
- **Downtime:** Zero (non-blocking migrations)
- **Data Loss Risk:** Zero (additive changes only)
- **Rollback Time:** <30 minutes per phase

### Migration Phases

| Phase | Tables | Est. Duration | Risk Level |
|-------|--------|---------------|------------|
| Phase 1: Small Tables | 40 | 30 minutes | Low |
| Phase 2: Medium Tables | 58 | 2 hours | Low |
| Phase 3: Large Tables | 30 | 4 hours | Medium |
| Phase 4: Critical Dependencies | 15 | 1 hour | Medium |
| **Total** | **143** | **7-8 hours** | **Low-Medium** |

---

## Migration Overview

### Environment Column Specification

```sql
environment text NOT NULL DEFAULT 'production'
```

- **Type:** `text` (PostgreSQL)
- **Constraint:** `NOT NULL` (after backfill)
- **Default:** `'production'`
- **Values:** `'production'` | `'sandbox'`

### Why 4-Step Process?

The 4-step approach ensures **zero downtime** and **zero data loss**:

1. **Step 1 (ADD NULLABLE):** Non-blocking schema change
2. **Step 2 (BACKFILL):** Gradual data population with batching
3. **Step 3 (NOT NULL):** Enforce integrity after data is complete
4. **Step 4 (INDEX):** Optimize queries with composite index

This approach avoids:
- ❌ Long table locks (adding NOT NULL column directly)
- ❌ Application downtime (nullable allows gradual rollout)
- ❌ Data inconsistency (backfill before constraint)

---

## 4-Step Migration Process

### Step 1: Add Nullable Column

**Purpose:** Add column without blocking writes

```sql
-- Step 1: Add environment column (nullable for now)
ALTER TABLE <table_name> 
ADD COLUMN environment text;
```

**Characteristics:**
- ✅ **Non-blocking:** Instant execution (<100ms)
- ✅ **No data changes:** Pure schema change
- ✅ **Safe:** Application continues working (NULL values allowed)
- ✅ **Reversible:** Can drop column if needed

**Lock Time:** <100ms per table

**Application Impact:** None (application doesn't rely on this column yet)

---

### Step 2: Backfill with 'production'

**Purpose:** Set all existing records to 'production' environment

```sql
-- Step 2: Backfill existing data with 'production'
UPDATE <table_name> 
SET environment = 'production' 
WHERE environment IS NULL;
```

**For Large Tables (>100K rows), use batched updates:**

```sql
-- Batched backfill for large tables (10K rows per batch)
DO $$
DECLARE
  batch_size INT := 10000;
  rows_affected INT;
BEGIN
  LOOP
    UPDATE <table_name>
    SET environment = 'production'
    WHERE id IN (
      SELECT id 
      FROM <table_name> 
      WHERE environment IS NULL 
      LIMIT batch_size
    );
    
    GET DIAGNOSTICS rows_affected = ROW_COUNT;
    
    -- Exit when no more rows to update
    EXIT WHEN rows_affected = 0;
    
    -- Small pause between batches to avoid lock contention
    PERFORM pg_sleep(0.1);
    
    RAISE NOTICE 'Updated % rows', rows_affected;
  END LOOP;
END $$;
```

**Characteristics:**
- ✅ **Batched:** 10K rows at a time prevents long locks
- ✅ **Pausable:** Can stop/resume if needed
- ✅ **Progress tracking:** Logs rows updated
- ⚠️ **Lock contention:** Minimal (short locks per batch)

**Lock Time:**
- **Small tables (<10K rows):** 1-5 seconds
- **Medium tables (10K-100K rows):** 10-30 seconds
- **Large tables (>100K rows):** 30-180 seconds

**Application Impact:** Minimal (short row-level locks per batch)

---

### Step 3: Make NOT NULL

**Purpose:** Enforce data integrity constraint

```sql
-- Step 3: Add NOT NULL constraint
ALTER TABLE <table_name> 
ALTER COLUMN environment SET NOT NULL;
```

**Characteristics:**
- ✅ **Fast:** Table scan to verify no NULLs (<100ms)
- ✅ **Safe:** Guaranteed to succeed after backfill
- ⚠️ **Validation:** PostgreSQL scans table to verify constraint

**Lock Time:** <100ms per table

**Application Impact:** None (all rows already have values)

**Important:** This step will **fail** if any NULL values exist. Always verify Step 2 completed successfully:

```sql
-- Verify no NULLs before Step 3
SELECT COUNT(*) FROM <table_name> WHERE environment IS NULL;
-- Should return 0
```

---

### Step 4: Add Composite Index

**Purpose:** Optimize environment-filtered queries

```sql
-- Step 4: Create composite index for efficient queries
CREATE INDEX CONCURRENTLY <table_name>_tenant_env_idx 
ON <table_name> (tenant_id, environment);

-- Analyze table statistics for query planner
ANALYZE <table_name>;
```

**Index Strategy:**
- **Composite Index:** `(tenant_id, environment)`
- **Order matters:** tenant_id first (more selective)
- **CONCURRENT:** Non-blocking index creation

**Why This Index?**

Most queries filter by BOTH tenant_id AND environment:

```sql
-- Typical query pattern
SELECT * FROM clients 
WHERE tenant_id = '...' 
  AND environment = 'production';
```

**Characteristics:**
- ✅ **Non-blocking:** CONCURRENTLY prevents table locks
- ⚠️ **Disk space:** Requires ~10-30% of table size
- ⚠️ **Build time:** Proportional to table size

**Lock Time:** 0ms (CONCURRENT means no locks)

**Build Time:**
- **Small tables (<10K rows):** 1-5 seconds
- **Medium tables (10K-100K rows):** 10-60 seconds
- **Large tables (>100K rows):** 60-300 seconds

**Application Impact:** None (index builds in background)

---

## Table Grouping Strategy

### Size Categories

Based on expected row counts:

- **Small:** <10K rows (fast migration, <1 min per table)
- **Medium:** 10K-100K rows (moderate migration, 1-5 min per table)
- **Large:** >100K rows (careful batching, 5-15 min per table)

### Dependency Categories

Based on foreign key relationships:

- **Independent:** No FK dependencies
- **Parent:** Referenced by other tables (migrate first)
- **Child:** References other tables (migrate after parent)

---

## Detailed Phase Plans

### Phase 1: Small Independent Tables (40 tables, ~30 minutes)

**Characteristics:**
- <10K rows per table
- No critical FK dependencies
- Low risk, fast execution

**Tables:**

#### Core Platform (8 tables)
- sequenceCounters
- moduleInterfaceConfig
- moduleFeatures
- userModulePreferences
- tenantBlueprints
- tenantInvitations
- tenantContext
- governancePolicies

#### Users & Auth (7 tables)
- userOAuthTokens
- userProfiles
- userGmailAccounts
- oauthStates
- onboardingCache
- userActions
- detectedPatterns

#### Notifications (3 tables)
- notifications
- notificationRules
- conversationInsights

#### Proactive Intelligence (1 table)
- proactiveInsights

#### Connectors (6 tables)
- connectorSecrets
- connectorInstances
- connectorSyncJobs
- connectorSyncErrors
- connectorEventLog
- connectorSyncLogs

#### Document Tags (1 table)
- documentTags

#### Products (1 table)
- products

#### Rate Cards (2 tables)
- rateCards
- rateCardRoles

#### Budgeting (3 tables)
- budgets
- budgetLines
- budgetActuals

#### Cost Templates (4 tables)
- costTemplates
- costTemplateSections
- costTemplateLineItems
- costSummaries

#### Catering (3 tables)
- cateringKitchenWorkflows
- cateringPrepLists
- cateringLogistics

#### Studio (1 table)
- blueprintUsageStats

**Execution Plan:**
1. Run all 4 steps sequentially for each table
2. No batching needed (small tables)
3. Validate after each table
4. Estimated: <1 minute per table

**SQL Example:**
```sql
-- Phase 1 Template (Small Tables)
BEGIN;

-- Step 1: Add column
ALTER TABLE sequenceCounters ADD COLUMN environment text;

-- Step 2: Backfill (no batching needed)
UPDATE sequenceCounters SET environment = 'production' WHERE environment IS NULL;

-- Step 3: NOT NULL
ALTER TABLE sequenceCounters ALTER COLUMN environment SET NOT NULL;

COMMIT;

-- Step 4: Index (outside transaction)
CREATE INDEX CONCURRENTLY sequenceCounters_tenant_env_idx 
ON sequenceCounters (tenant_id, environment);

ANALYZE sequenceCounters;
```

---

### Phase 2: Medium Tables (58 tables, ~2 hours)

**Characteristics:**
- 10K-100K rows per table
- Moderate FK dependencies
- Batched updates recommended

**Tables:**

#### Audit Logs (3 tables)
- auditLog
- studioAuditLog
- codeGenerationAudit

#### Document Management (7 tables)
- documentProviders
- documents
- documentVersions
- documentShares
- documentFolders
- documentEmbeddings
- documentAnalysisResults

#### CRM & Commercial (14 tables)
- clients
- clientContacts
- clientDocuments
- leads
- leadActivities
- leadScores
- opportunities
- opportunityRules
- clientOrders
- clientOrderLines
- salesPipelines
- salesPipelineStages
- quotes
- quoteLines

#### Quote Templates (6 tables)
- quoteTemplates
- quoteTemplateSections
- quoteTemplateLineItems
- quoteVersions
- quotePriceBooks
- quotePriceItems

#### Suppliers (6 tables)
- suppliers
- supplierContacts
- supplierDocuments
- supplierPerformance
- supplierEmbeddings
- employeeExpenses

#### Projects (7 tables)
- projects
- projectEmbeddings
- projectTasks
- projectTaskDependencies
- projectMilestones
- projectResources
- projectTimeEntries

#### Logistics (5 tables)
- warehouses
- warehouseLocations
- stockItems
- stockMovements
- stockAlerts

#### Production (6 tables)
- productionWorkOrders
- productionOperations
- productionMaterials
- productionQualityChecks
- productionDefects
- productionIntegrations

#### Studio V2 (4 tables)
- tenantCodeModules
- executionPlans
- sandboxExecutions
- tenantCodeTests

**Execution Plan:**
1. Use batched updates (10K rows per batch)
2. Monitor lock contention
3. Validate after each table
4. Estimated: 2-5 minutes per table

**SQL Example:**
```sql
-- Phase 2 Template (Medium Tables)
BEGIN;

-- Step 1: Add column
ALTER TABLE clients ADD COLUMN environment text;

COMMIT;

-- Step 2: Batched backfill
DO $$
DECLARE
  batch_size INT := 10000;
  rows_affected INT;
BEGIN
  LOOP
    UPDATE clients
    SET environment = 'production'
    WHERE id IN (
      SELECT id FROM clients WHERE environment IS NULL LIMIT batch_size
    );
    
    GET DIAGNOSTICS rows_affected = ROW_COUNT;
    EXIT WHEN rows_affected = 0;
    
    PERFORM pg_sleep(0.1);
    RAISE NOTICE 'Clients: Updated % rows', rows_affected;
  END LOOP;
END $$;

-- Step 3: NOT NULL
BEGIN;
ALTER TABLE clients ALTER COLUMN environment SET NOT NULL;
COMMIT;

-- Step 4: Index
CREATE INDEX CONCURRENTLY clients_tenant_env_idx 
ON clients (tenant_id, environment);

ANALYZE clients;
```

---

### Phase 3: Large Tables (30 tables, ~4 hours)

**Characteristics:**
- >100K rows (potentially millions)
- Critical business data
- Careful batching required
- Monitor disk space and locks

**Tables:**

#### Procurement - Large Transaction Tables (15 tables)
- purchaseRequisitions
- purchaseRequisitionLines
- rfqs
- rfqLines
- rfqQuotes
- rfqQuoteLines
- purchaseOrders
- purchaseOrderLines
- receipts
- receiptLines
- supplierReturns
- supplierReturnLines
- purchasingInvoices
- purchasingInvoiceLines
- purchasingPayments

#### Financial - Large Transaction Tables (6 tables)
- invoices
- invoiceLines
- invoiceEmbeddings
- payments
- paymentAllocations
- purchasingPaymentAllocations

#### Banking (3 tables)
- bankAccounts
- bankTransactions
- reconciliationMatches

#### Gmail Integration (5 tables)
- gmailMessages
- gmailThreads
- gmailAutoResponders
- gmailSettings
- emailClassifications

#### WhatsApp Integration (1 table)
- whatsappMessages

**Special Considerations:**

**invoices, purchaseOrders, documents:**
- Potentially 100K+ rows per table
- Use smallest batch size (5K rows)
- Monitor pg_stat_activity during migration
- Run during low-traffic window

**Execution Plan:**
1. Schedule during low-traffic window
2. Use smaller batches (5K-10K rows)
3. Monitor lock contention closely
4. Pause if blocking detected
5. Estimated: 5-15 minutes per table

**SQL Example:**
```sql
-- Phase 3 Template (Large Tables)
-- Run during LOW TRAFFIC window

BEGIN;

-- Step 1: Add column
ALTER TABLE invoices ADD COLUMN environment text;

COMMIT;

-- Step 2: Batched backfill (smaller batches for large tables)
DO $$
DECLARE
  batch_size INT := 5000; -- Smaller batches for large tables
  rows_affected INT;
  total_updated INT := 0;
BEGIN
  LOOP
    UPDATE invoices
    SET environment = 'production'
    WHERE id IN (
      SELECT id FROM invoices WHERE environment IS NULL LIMIT batch_size
    );
    
    GET DIAGNOSTICS rows_affected = ROW_COUNT;
    total_updated := total_updated + rows_affected;
    
    EXIT WHEN rows_affected = 0;
    
    -- Longer pause between batches
    PERFORM pg_sleep(0.5);
    
    RAISE NOTICE 'Invoices: Updated % rows (total: %)', rows_affected, total_updated;
  END LOOP;
  
  RAISE NOTICE 'Invoices: Migration complete. Total rows: %', total_updated;
END $$;

-- Step 3: NOT NULL
BEGIN;
ALTER TABLE invoices ALTER COLUMN environment SET NOT NULL;
COMMIT;

-- Step 4: Index (will take longer for large tables)
CREATE INDEX CONCURRENTLY invoices_tenant_env_idx 
ON invoices (tenant_id, environment);

ANALYZE invoices;
```

---

### Phase 4: Critical FK Dependencies (15 tables, ~1 hour)

**Characteristics:**
- Parent tables that MUST migrate before children
- Critical for referential integrity
- Moderate size but high importance

**Dependency Order:**

#### Level 1: Core Configuration (migrate FIRST)
1. companyInfo (parent of many tables)
2. modules (parent of moduleInterfaceConfig)
3. tenantModules (parent of moduleFeatures)
4. userTenants (parent of user preferences)

#### Level 2: Document Providers
5. documentProviders (parent of documents)

#### Level 3: Communication
6. gmailTemplates (referenced by auto-responders)
7. whatsappAccounts (parent of contacts/messages)
8. whatsappContacts (parent of conversations)
9. whatsappConversations (parent of messages)
10. whatsappTemplates (referenced by messages)

#### Level 4: Bank Reconciliation
11. bankReconciliations (parent of reconciliationMatches)

#### Level 5: Studio & Blueprints
12. blueprintImprovements (special case)
13. tenantCodeFiles (parent of artifacts)
14. tenantCodeArtifacts (parent of releases)
15. tenantCodeReleases (final in dependency chain)

**Execution Plan:**
1. Migrate in strict dependency order
2. Validate FK integrity after each table
3. Do NOT proceed to children until parent completes
4. Estimated: 2-5 minutes per table

**SQL Example (with dependency validation):**
```sql
-- Phase 4 Template (Critical Dependencies)

-- LEVEL 1: Parent table
BEGIN;
ALTER TABLE companyInfo ADD COLUMN environment text;
COMMIT;

-- Backfill
UPDATE companyInfo SET environment = 'production' WHERE environment IS NULL;

-- Validate no NULLs
DO $$
DECLARE
  null_count INT;
BEGIN
  SELECT COUNT(*) INTO null_count FROM companyInfo WHERE environment IS NULL;
  IF null_count > 0 THEN
    RAISE EXCEPTION 'Found % NULL values in companyInfo.environment', null_count;
  END IF;
  RAISE NOTICE 'companyInfo: Validation passed, no NULLs';
END $$;

-- NOT NULL
BEGIN;
ALTER TABLE companyInfo ALTER COLUMN environment SET NOT NULL;
COMMIT;

-- Index
CREATE INDEX CONCURRENTLY companyInfo_tenant_env_idx 
ON companyInfo (tenant_id, environment);

ANALYZE companyInfo;

-- Now safe to proceed to children that reference companyInfo
```

---

## Rollback Procedures

### Per-Table Rollback

If a table migration fails or needs to be reverted:

```sql
-- ROLLBACK TEMPLATE (execute steps in reverse order)

-- Step 4 Rollback: Drop index
DROP INDEX IF EXISTS <table_name>_tenant_env_idx;

-- Step 3 Rollback: Remove NOT NULL constraint
ALTER TABLE <table_name> 
ALTER COLUMN environment DROP NOT NULL;

-- Step 2 Rollback: Clear backfilled data (optional)
-- Only if you want to fully revert, otherwise skip this
UPDATE <table_name> SET environment = NULL;

-- Step 1 Rollback: Drop column entirely
ALTER TABLE <table_name> DROP COLUMN environment;

-- Verify rollback
\d <table_name>
```

**Rollback Time:** <5 minutes per table

### Phase Rollback

To rollback an entire phase:

```bash
#!/bin/bash
# Rollback script for Phase 1

tables=(
  "sequenceCounters"
  "moduleInterfaceConfig"
  # ... all Phase 1 tables
)

for table in "${tables[@]}"; do
  echo "Rolling back $table..."
  psql -c "DROP INDEX IF EXISTS ${table}_tenant_env_idx;"
  psql -c "ALTER TABLE $table ALTER COLUMN environment DROP NOT NULL;"
  psql -c "ALTER TABLE $table DROP COLUMN environment;"
done
```

### Full Migration Rollback

**When to use:**
- Critical bug discovered
- Data integrity issues
- Need to redesign approach

**How to execute:**
1. Stop application (prevent new writes)
2. Run rollback script for all phases in reverse order (4→3→2→1)
3. Validate schema matches pre-migration state
4. Restart application

**Estimated Time:** 1-2 hours for full rollback

---

## Performance Considerations

### Disk Space Requirements

**Indexes consume ~10-30% of table size:**

| Table Size | Index Size | Total Additional Space |
|------------|------------|------------------------|
| 1 GB | 100-300 MB | 100-300 MB |
| 10 GB | 1-3 GB | 1-3 GB |
| 100 GB | 10-30 GB | 10-30 GB |

**Estimated Total:** ~5-15 GB additional disk space for all 143 indexes

**Pre-migration Check:**
```sql
-- Check available disk space
SELECT 
  pg_database.datname,
  pg_size_pretty(pg_database_size(pg_database.datname)) AS size
FROM pg_database;

-- Check largest tables
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
LIMIT 20;
```

### Lock Contention Monitoring

**Monitor locks during migration:**

```sql
-- Monitor active locks
SELECT 
  locktype,
  database,
  relation::regclass,
  mode,
  granted
FROM pg_locks
WHERE relation IS NOT NULL
ORDER BY granted, relation;

-- Monitor blocking queries
SELECT 
  blocked_locks.pid AS blocked_pid,
  blocked_activity.usename AS blocked_user,
  blocking_locks.pid AS blocking_pid,
  blocking_activity.usename AS blocking_user,
  blocked_activity.query AS blocked_statement,
  blocking_activity.query AS blocking_statement
FROM pg_catalog.pg_locks blocked_locks
JOIN pg_catalog.pg_stat_activity blocked_activity ON blocked_activity.pid = blocked_locks.pid
JOIN pg_catalog.pg_locks blocking_locks 
  ON blocking_locks.locktype = blocked_locks.locktype
  AND blocking_locks.database IS NOT DISTINCT FROM blocked_locks.database
  AND blocking_locks.relation IS NOT DISTINCT FROM blocked_locks.relation
  AND blocking_locks.page IS NOT DISTINCT FROM blocked_locks.page
  AND blocking_locks.tuple IS NOT DISTINCT FROM blocked_locks.tuple
  AND blocking_locks.virtualxid IS NOT DISTINCT FROM blocked_locks.virtualxid
  AND blocking_locks.transactionid IS NOT DISTINCT FROM blocked_locks.transactionid
  AND blocking_locks.classid IS NOT DISTINCT FROM blocked_locks.classid
  AND blocking_locks.objid IS NOT DISTINCT FROM blocked_locks.objid
  AND blocking_locks.objsubid IS NOT DISTINCT FROM blocked_locks.objsubid
  AND blocking_locks.pid != blocked_locks.pid
JOIN pg_catalog.pg_stat_activity blocking_activity ON blocking_activity.pid = blocking_locks.pid
WHERE NOT blocked_locks.granted;
```

### Query Performance

**Before migration:**
```sql
-- Query WITHOUT environment filter (current state)
EXPLAIN ANALYZE
SELECT * FROM clients WHERE tenant_id = '...';
-- Uses: clients_tenant_id_idx
```

**After migration:**
```sql
-- Query WITH environment filter (post-migration)
EXPLAIN ANALYZE
SELECT * FROM clients 
WHERE tenant_id = '...' AND environment = 'production';
-- Uses: clients_tenant_env_idx (composite index)
-- Better selectivity, fewer rows scanned
```

**Expected improvement:** 2-5x faster queries with environment filter

---

## Risk Mitigation

### Risk 1: Long Table Locks

**Scenario:** ALTER TABLE blocks reads/writes on large tables

**Mitigation:**
- ✅ Use nullable column first (Step 1)
- ✅ Batched updates with pauses (Step 2)
- ✅ CONCURRENT index creation (Step 4)
- ✅ Run during low-traffic windows

**Detection:**
```sql
-- Check for long-running migrations
SELECT 
  pid, 
  now() - pg_stat_activity.query_start AS duration, 
  query 
FROM pg_stat_activity 
WHERE state = 'active' 
  AND query LIKE '%ALTER TABLE%'
ORDER BY duration DESC;
```

### Risk 2: Failed Backfill

**Scenario:** UPDATE fails mid-batch

**Mitigation:**
- ✅ Batched approach allows resume
- ✅ Idempotent (WHERE environment IS NULL)
- ✅ Progress logging shows completion

**Recovery:**
```sql
-- Check backfill progress
SELECT 
  COUNT(*) FILTER (WHERE environment IS NULL) AS null_count,
  COUNT(*) FILTER (WHERE environment = 'production') AS production_count,
  COUNT(*) AS total
FROM <table_name>;

-- Resume backfill
UPDATE <table_name> 
SET environment = 'production' 
WHERE environment IS NULL;
```

### Risk 3: Disk Space Exhaustion

**Scenario:** Run out of disk space during index creation

**Mitigation:**
- ✅ Pre-check disk space (see above)
- ✅ Monitor space during migration
- ✅ Indexes created CONCURRENTLY (can cancel safely)

**Detection:**
```sql
-- Monitor disk usage during migration
SELECT 
  pg_size_pretty(pg_database_size(current_database())) AS db_size;
```

**Recovery:**
- Cancel index creation (it's CONCURRENT, safe to cancel)
- Free up space
- Retry index creation

### Risk 4: Cross-Environment FK Violations

**Scenario:** Application creates FK between production and sandbox

**Mitigation:**
- ✅ Application-level validation (see environment.ts)
- ✅ Future: Database-level CHECK constraints
- ✅ Comprehensive testing before production

**Prevention (future enhancement):**
```sql
-- Add CHECK constraint to prevent cross-environment FKs
-- (requires custom function)
ALTER TABLE clientOrders
ADD CONSTRAINT check_client_same_environment
CHECK (
  -- Verify client.environment matches order.environment
  -- Implementation requires custom function
);
```

---

## Monitoring & Validation

### Pre-Migration Checks

```sql
-- 1. Check database size and available space
SELECT pg_size_pretty(pg_database_size(current_database()));

-- 2. Count NULL values (should be 0 after backfill)
SELECT COUNT(*) FROM <table_name> WHERE environment IS NULL;

-- 3. Verify tenant_id coverage
SELECT COUNT(*) FROM <table_name> WHERE tenant_id IS NULL;
-- Should be 0 for all tables

-- 4. Check for active transactions
SELECT COUNT(*) FROM pg_stat_activity WHERE state = 'active';
```

### During Migration

```sql
-- 1. Monitor lock contention (see above)

-- 2. Track backfill progress
SELECT 
  schemaname,
  tablename,
  n_tup_upd AS rows_updated
FROM pg_stat_user_tables
WHERE tablename = '<table_name>';

-- 3. Monitor disk usage
SELECT pg_size_pretty(pg_database_size(current_database()));

-- 4. Check index build progress
SELECT 
  phase,
  blocks_total,
  blocks_done,
  current_locker_pid
FROM pg_stat_progress_create_index;
```

### Post-Migration Validation

```sql
-- 1. Verify NOT NULL constraint
SELECT 
  table_name,
  column_name,
  is_nullable
FROM information_schema.columns
WHERE table_name = '<table_name>' 
  AND column_name = 'environment';
-- is_nullable should be 'NO'

-- 2. Verify default value
SELECT column_default 
FROM information_schema.columns
WHERE table_name = '<table_name>' 
  AND column_name = 'environment';
-- Should be 'production'::text

-- 3. Verify index exists
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = '<table_name>' 
  AND indexname LIKE '%tenant_env%';

-- 4. Verify data distribution
SELECT environment, COUNT(*) 
FROM <table_name> 
GROUP BY environment;
-- All existing data should be 'production'

-- 5. Test query performance
EXPLAIN ANALYZE
SELECT * FROM <table_name>
WHERE tenant_id = '...' AND environment = 'production';
-- Should use composite index
```

---

## Execution Checklist

### Pre-Migration (Day Before)

- [ ] Review migration plan with team
- [ ] Schedule maintenance window (low-traffic period)
- [ ] Check disk space availability (>15GB free recommended)
- [ ] Backup database (pg_dump or snapshot)
- [ ] Test rollback procedure on staging
- [ ] Notify users of planned maintenance (if applicable)
- [ ] Prepare monitoring dashboard
- [ ] Set up alerts for lock contention

### During Migration

#### Phase 1: Small Tables (30 min)
- [ ] Start migration log
- [ ] Execute Phase 1 migration script
- [ ] Validate all 40 tables completed
- [ ] Check for lock contention
- [ ] Verify indexes created
- [ ] Checkpoint: GO/NO-GO for Phase 2

#### Phase 2: Medium Tables (2 hours)
- [ ] Execute Phase 2 migration script
- [ ] Monitor batched updates progress
- [ ] Validate all 58 tables completed
- [ ] Check query performance on clients table
- [ ] Verify disk space remaining
- [ ] Checkpoint: GO/NO-GO for Phase 3

#### Phase 3: Large Tables (4 hours)
- [ ] Confirm low-traffic window
- [ ] Execute Phase 3 migration script (smallest batches)
- [ ] Monitor lock contention closely
- [ ] Pause if blocking detected
- [ ] Validate all 30 tables completed
- [ ] Check disk space and index sizes
- [ ] Checkpoint: GO/NO-GO for Phase 4

#### Phase 4: Critical Dependencies (1 hour)
- [ ] Execute in strict dependency order
- [ ] Validate FK integrity after each table
- [ ] Complete all 15 tables
- [ ] Final validation of all 143 tables

### Post-Migration (Same Day)

- [ ] Run comprehensive validation queries
- [ ] Verify all indexes exist and are used
- [ ] Test sample queries from application
- [ ] Check application logs for errors
- [ ] Monitor performance metrics
- [ ] Run ANALYZE on all migrated tables
- [ ] Update documentation with completion time
- [ ] Notify team of successful completion

### Post-Migration (Week After)

- [ ] Monitor query performance (compare to baseline)
- [ ] Check for any environment-related bugs
- [ ] Validate sandbox isolation working correctly
- [ ] Review disk space trends
- [ ] Optimize any slow queries
- [ ] Update monitoring dashboards
- [ ] Archive migration logs

---

## Emergency Procedures

### If Migration Fails Mid-Phase

1. **Stop immediately** - Don't proceed to next table
2. **Check error** - Review logs for specific error
3. **Assess impact** - Which tables completed vs failed?
4. **Decide:**
   - **Continue:** Fix error and resume
   - **Rollback:** Revert completed tables in phase
5. **Document** - Record what happened and resolution

### If Application Errors Detected

1. **Assess severity:**
   - **Critical:** Production data corruption → Immediate rollback
   - **High:** Feature broken → Rollback phase
   - **Medium:** Performance issue → Monitor and fix
   - **Low:** UI glitch → Fix in place

2. **Rollback decision tree:**
   ```
   Data corruption? → YES → Full rollback
   Data mixing? → YES → Full rollback
   Query errors? → YES → Rollback current phase
   Slow queries? → NO → Optimize in place
   ```

### If Disk Space Runs Low

1. **Cancel current index creation:**
   ```sql
   SELECT pg_cancel_backend(pid) 
   FROM pg_stat_activity 
   WHERE query LIKE '%CREATE INDEX%';
   ```

2. **Free up space:**
   - Drop old indexes
   - Vacuum large tables
   - Archive old data

3. **Resume when space available**

---

## Success Criteria

### Technical Success

- ✅ All 143 tables have environment column
- ✅ All columns are NOT NULL
- ✅ All existing data is 'production'
- ✅ All composite indexes created
- ✅ Zero data loss
- ✅ Zero downtime
- ✅ All validation queries pass

### Performance Success

- ✅ Query performance maintained or improved
- ✅ Index usage confirmed in EXPLAIN plans
- ✅ No lock contention issues
- ✅ Disk space within acceptable limits

### Application Success

- ✅ All application features working
- ✅ Sandbox isolation functional
- ✅ No cross-environment data leakage
- ✅ FK validation working correctly

---

## Appendix A: Table Size Estimates

Based on typical SaaS usage patterns:

| Table Category | Est. Rows/Tenant | Size Category |
|----------------|------------------|---------------|
| Invoices | 10K-100K | Large |
| Purchase Orders | 5K-50K | Medium-Large |
| Documents | 5K-20K | Medium |
| Clients | 100-5K | Small-Medium |
| Projects | 50-1K | Small |
| Notifications | 1K-10K | Small-Medium |
| Audit Logs | 10K-100K | Large |

**Note:** Actual sizes will vary. Use these queries to check YOUR data:

```sql
SELECT 
  tablename,
  n_tup_ins AS total_inserts,
  n_tup_upd AS total_updates,
  n_live_tup AS approx_row_count,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS total_size
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

---

## Appendix B: Example Migration Log Template

```
=== MIGRATION LOG: Environment Column Migration ===
Start Time: 2025-11-08 02:00:00 UTC
Executed By: DBA Name
Database: assistos_production

--- PHASE 1: Small Tables (40 tables) ---
[02:00:15] START: sequenceCounters
[02:00:16] ✓ Step 1: Column added
[02:00:17] ✓ Step 2: 1,234 rows backfilled
[02:00:18] ✓ Step 3: NOT NULL constraint added
[02:00:20] ✓ Step 4: Index created
[02:00:20] COMPLETE: sequenceCounters (5 seconds)

[02:00:21] START: moduleInterfaceConfig
...

--- PHASE 1 SUMMARY ---
Completed: 40/40 tables
Duration: 28 minutes
Errors: 0
Status: SUCCESS ✓

--- PHASE 2: Medium Tables (58 tables) ---
...

=== MIGRATION COMPLETE ===
Total Time: 7 hours 23 minutes
Tables Migrated: 143/143
Errors: 0
Rollbacks: 0
Status: SUCCESS ✓
```

---

**Document Version:** 1.0  
**Last Updated:** November 8, 2025  
**Next Review:** After Phase 1 completion  
**Status:** ✅ Ready for Implementation
