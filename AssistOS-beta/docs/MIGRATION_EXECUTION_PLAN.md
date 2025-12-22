# Migration Execution Plan - Environment Column Schema Updates

**Version:** 1.0  
**Date:** November 8, 2025  
**Status:** ⚠️ BLOCKED - Pre-Migration Issues Discovered  
**Migration Type:** Schema Update (ADD COLUMN)  
**Database:** PostgreSQL (Neon) Development Environment  
**Migration Tool:** Drizzle Kit (`npm run db:push`)

---

## Executive Summary

### Objective
Add `environment` column to enable sandbox/production data isolation across all tenant-scoped tables in the AssistOS platform.

### Current Status
**🛑 MIGRATION BLOCKED** - Pre-migration schema conflicts detected that must be resolved before proceeding.

### Key Metrics

| Metric | Count | Status |
|--------|-------|--------|
| Total Database Tables | 278 | ✅ Inventoried |
| Tables in Schema with `environment` | 191 | ✅ Defined |
| Tables Already Having `environment` | 19 | ✅ Verified |
| **Tables Requiring Migration** | **~172** | ⚠️ Pending |
| Unresolved Schema Conflicts | 2+ | 🛑 **BLOCKER** |

---

## 🛑 Critical Issues Discovered

### Issue 1: agent_runs Table Ambiguity

**Drizzle Prompt:**
```
Is agent_runs table created or renamed from another table?
❯ + agent_runs                            create table
  ~ document_versions_legacy › agent_runs rename table
  ~ user_sessions › agent_runs            rename table
```

**Impact:** Drizzle cannot determine if `agent_runs` is:
- A new table to be created
- Renamed from `document_versions_legacy`
- Renamed from `user_sessions`

**Resolution Required:**
- Review schema.ts to confirm `agent_runs` table definition
- Determine if this is a rename or new table
- Update Drizzle configuration or resolve manually before migration

---

### Issue 2: document_id Column Ambiguity in document_versions

**Drizzle Prompt:**
```
Is document_id column in document_versions table created or renamed from another column?
❯ + document_id                    create column
  ~ original_file_id › document_id rename column
  ~ file_id › document_id          rename column
  ~ changes_summary › document_id  rename column
  ~ comparison_data › document_id  rename column
```

**Impact:** Drizzle cannot determine if `document_id` is:
- A new column to be added
- Renamed from `original_file_id`, `file_id`, `changes_summary`, or `comparison_data`

**Resolution Required:**
- Review `document_versions` table schema changes
- Confirm column naming/renaming strategy
- Resolve ambiguity before proceeding

---

## Migration Scope

### Tables Already Having Environment Column (19 tables)

These tables will be **SKIPPED** during migration as they already have the column:

| Table Name | Status | Verified |
|------------|--------|----------|
| api_integrations | ✅ Has environment | Yes |
| clients | ✅ Has environment | Yes |
| configuration_checkpoints | ✅ Has environment | Yes |
| conversations | ✅ Has environment | Yes |
| custom_entities | ✅ Has environment | Yes |
| custom_fields | ✅ Has environment | Yes |
| entity_menu_items | ✅ Has environment | Yes |
| entity_views | ✅ Has environment | Yes |
| entity_workflow_states | ✅ Has environment | Yes |
| messages | ✅ Has environment | Yes |
| products | ✅ Has environment | Yes |
| public_forms | ✅ Has environment | Yes |
| suppliers | ✅ Has environment | Yes |
| tasks | ✅ Has environment | Yes |
| tenant_code_artifacts | ✅ Has environment | Yes |
| tenant_code_files | ✅ Has environment | Yes |
| tenant_code_releases | ✅ Has environment | Yes |
| tenant_secrets | ✅ Has environment | Yes |
| webhooks | ✅ Has environment | Yes |

---

### Tables Requiring Environment Column (~172 tables)

Based on schema analysis, approximately **172 tables** need the environment column added.

#### Sample of High-Priority Tables (First 50):

**Core Platform (11 tables)**
- sequence_counters
- company_info
- modules
- module_interface_config
- tenant_modules
- module_features
- user_module_preferences
- tenant_blueprints
- user_tenants
- tenant_invitations
- tenant_context

**Users & Authentication (7 tables)**
- user_oauth_tokens
- user_profiles
- user_gmail_accounts
- oauth_states
- onboarding_cache
- user_actions
- detected_patterns

**Audit & Logging (3 tables)**
- audit_log
- studio_audit_log
- code_generation_audit

**Notifications (3 tables)**
- notifications
- notification_rules
- conversation_insights

**CRM & Commercial (14 tables)**
- client_contacts
- client_documents
- leads
- lead_activities
- lead_scores
- opportunities
- opportunity_rules
- client_orders
- client_order_lines
- sales_pipelines
- sales_pipeline_stages
- quotes
- quote_lines
- sales_orders

**Procurement (21 tables)**
- purchase_requisitions
- purchase_requisition_lines
- rfqs
- rfq_lines
- rfq_quotes
- rfq_quote_lines
- purchase_orders
- purchase_order_lines
- receipts
- receipt_lines
- supplier_returns
- supplier_return_lines
- purchasing_invoices
- purchasing_invoice_lines
- purchasing_payments
- purchasing_payment_allocations
- supplier_documents
- supplier_contacts
- supplier_performance
- supplier_embeddings
- supplier_price_history

**Financial (15+ tables)**
- invoices
- invoice_lines
- invoice_embeddings
- invoice_taxes
- invoice_validations
- payments
- payment_allocations
- payment_reminders
- bank_accounts
- bank_transactions
- bank_reconciliations
- bank_statement_transactions
- budgets
- budget_alerts
- chart_of_accounts

**Documents (8 tables)**
- documents
- document_versions
- document_embeddings
- document_folders
- document_analyses
- document_templates
- document_classifications
- document_permissions

**Projects (20+ tables)**
- projects
- project_embeddings
- project_tasks
- project_milestones
- project_deliverables
- project_time_entries
- project_expenses
- project_resource_allocations
- project_resources
- project_team_members
- project_risks
- project_change_requests
- project_issues
- project_decisions
- project_documents
- project_phases
- project_approvals
- project_contracts
- project_external_mappings
- project_purchases

**Studio & Code Generation (8 tables)**
- generated_code
- code_generation_validations
- assistbuild_jobs
- tenant_code_modules
- execution_plans
- sandbox_executions
- tenant_code_tests
- code_validation_results

**Connectors (6 tables)**
- connector_secrets (or connectors)
- connector_instances (or connector_credentials)
- connector_sync_jobs (or connector_sync_logs)
- connector_sync_errors
- connector_event_log (or connector_change_events)
- connector_sync_state

**WhatsApp Integration (5 tables)**
- whatsapp_accounts
- whatsapp_messages
- whatsapp_contacts
- whatsapp_templates
- whatsapp_conversations

**Gmail Integration (5 tables)**
- gmail_messages
- gmail_threads
- gmail_auto_responders
- gmail_settings
- email_classifications

**Production & Manufacturing (6 tables)**
- production_work_orders
- production_operations
- production_work_order_materials (or production_materials)
- production_quality_checks
- production_execution_logs (or production_defects)
- production_integrations

**Logistics & Warehouse (5 tables)**
- warehouses
- warehouse_locations
- stock_items
- stock_movements
- stock_alerts

**Additional Tables (20+ more)**
- employee_expenses
- rate_cards
- cost_templates
- cost_template_sections
- cost_template_line_items
- quote_templates
- quote_template_sections
- quote_template_line_items
- budget_quotes
- catering_kitchen_workflows
- catering_prep_lists
- catering_logistics
- fiscal_periods
- tax_rates
- tax_categories
- tax_obligations
- vat_returns
- open_banking_connections
- open_banking_accounts
- open_banking_transactions
- ... and more

---

## Detailed Schema Changes

### Environment Column Specification

```sql
-- Column Definition
environment text NOT NULL DEFAULT 'production'
```

**Properties:**
- **Type:** `text`
- **Constraint:** `NOT NULL` (set after backfill)
- **Default:** `'production'`
- **Allowed Values:** `'production'` | `'sandbox'`

### SQL Pattern (Per Table)

For each table, Drizzle will execute:

```sql
-- Step 1: Add nullable column (instant)
ALTER TABLE <table_name> 
ADD COLUMN environment text;

-- Step 2: Backfill existing data (batched by backfill job)
-- This will be done by Task 2.2.5 backfill job AFTER migration

-- Step 3: Add NOT NULL constraint (instant after backfill)
ALTER TABLE <table_name> 
ALTER COLUMN environment SET NOT NULL;

-- Step 4: Add default value
ALTER TABLE <table_name> 
ALTER COLUMN environment SET DEFAULT 'production';

-- Step 5: Create composite index (concurrent, non-blocking)
CREATE INDEX CONCURRENTLY <table_name>_tenant_env_idx 
ON <table_name> (tenant_id, environment);
```

---

## Safety Checks

### ✅ Required Verifications

| Check | Status | Notes |
|-------|--------|-------|
| No ID type changes | ⚠️ **UNVERIFIED** | Blocked by Drizzle prompts |
| All changes are additive | ⚠️ **UNVERIFIED** | Blocked by Drizzle prompts |
| No DROP statements | ⚠️ **UNVERIFIED** | Blocked by Drizzle prompts |
| No data loss warnings | ⚠️ **UNVERIFIED** | Blocked by Drizzle prompts |
| Indexes are correct | ⚠️ **UNVERIFIED** | Blocked by Drizzle prompts |
| Schema conflicts resolved | ❌ **FAILED** | 2+ conflicts detected |

### ⚠️ Pre-Migration Requirements

**MUST BE COMPLETED BEFORE MIGRATION:**

1. ✅ Resolve `agent_runs` table ambiguity
2. ✅ Resolve `document_id` column ambiguity in `document_versions`
3. ✅ Verify no primary key type changes
4. ✅ Confirm all changes are non-destructive
5. ✅ Review complete diff of schema changes
6. ✅ Backup database (development environment)

---

## Risk Assessment

### Risk Level: **HIGH** ⚠️

**Reasons:**

1. **Unresolved Schema Conflicts** (BLOCKER)
   - Cannot proceed until agent_runs and document_versions issues are resolved
   - Unknown additional conflicts may exist

2. **Large Scope** (CONCERN)
   - ~172 tables to modify
   - Development database has 278 total tables
   - 62% of all tables will be altered

3. **Critical Business Data** (CONCERN)
   - Includes invoices, purchase orders, projects, clients
   - Financial and operational transaction tables
   - Cannot afford data loss or corruption

4. **Unknown Additional Changes** (BLOCKER)
   - Drizzle diff was interrupted by prompts
   - Full scope of changes is not yet visible
   - May include unexpected schema modifications

### Mitigation Factors

✅ **Non-destructive changes** (ADD COLUMN only)  
✅ **Nullable column** (no immediate data requirement)  
✅ **Backfill job ready** (Task 2.2.5 prepared)  
✅ **Development environment** (not production)  
❌ **Schema conflicts unresolved** (BLOCKER)

---

## Execution Steps (WHEN READY)

### Prerequisites

**BEFORE executing migration, complete these steps:**

1. **Resolve Schema Conflicts**
   ```bash
   # Manually review and resolve:
   # - agent_runs table ambiguity
   # - document_id column ambiguity
   # - Any other detected conflicts
   ```

2. **Review Complete Diff**
   ```bash
   # Generate migration files to see full SQL
   npx drizzle-kit generate
   # Review generated SQL in ./migrations/
   ```

3. **Backup Database**
   ```bash
   # Backup development database before migration
   pg_dump $DATABASE_URL > backup_pre_environment_migration_$(date +%Y%m%d_%H%M%S).sql
   ```

4. **Final Safety Check**
   - Verify no ID type changes
   - Confirm all changes are additive
   - Review indexes to be created
   - Confirm no DROP statements

### Migration Execution (DO NOT RUN YET)

**⚠️ APPROVAL REQUIRED - DO NOT EXECUTE WITHOUT EXPLICIT AUTHORIZATION**

```bash
# Step 1: Apply schema changes (ADD COLUMN environment to ~172 tables)
npm run db:push --force

# Wait for completion and verify success
# Expected duration: 1-5 minutes (depending on table count)

# Step 2: Execute backfill job (sets environment = 'production' for all existing data)
# This is Task 2.2.5 - Run AFTER migration completes
npm run backfill:environment

# Expected duration: 15-60 minutes (depending on data volume)

# Step 3: Verify migration success
npm run verify:environment-migration

# Step 4: Monitor application logs for errors
# Check that all services restart successfully
```

### Post-Migration Verification

```sql
-- Verify environment column exists on key tables
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE column_name = 'environment' 
  AND table_schema = 'public'
ORDER BY table_name;

-- Expected result: ~191 rows (19 existing + 172 new)

-- Verify all rows have environment = 'production' after backfill
SELECT table_name, COUNT(*) as null_count
FROM (
  SELECT 'clients' as table_name, COUNT(*) FROM clients WHERE environment IS NULL
  UNION ALL
  SELECT 'suppliers', COUNT(*) FROM suppliers WHERE environment IS NULL
  UNION ALL
  SELECT 'invoices', COUNT(*) FROM invoices WHERE environment IS NULL
  UNION ALL
  SELECT 'projects', COUNT(*) FROM projects WHERE environment IS NULL
  -- Add more tables as needed
) counts
WHERE null_count > 0;

-- Expected result: 0 rows (no NULLs after backfill)

-- Verify composite indexes created
SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE indexname LIKE '%_tenant_env_idx'
ORDER BY tablename;

-- Expected result: ~172 indexes
```

---

## Rollback Plan

### If Migration Fails During Execution

**Scenario 1: Migration fails before completion**

```bash
# 1. Cancel migration immediately (Ctrl+C)
# 2. Restore from backup
psql $DATABASE_URL < backup_pre_environment_migration_YYYYMMDD_HHMMSS.sql

# 3. Verify restoration
psql $DATABASE_URL -c "SELECT COUNT(*) FROM information_schema.columns WHERE column_name = 'environment';"
# Should return 19 (pre-migration count)
```

**Scenario 2: Migration completes but application breaks**

```sql
-- Option A: Drop environment column from affected tables
-- (DO NOT USE if data has been created with environment values)

DO $$
DECLARE
  table_name text;
BEGIN
  FOR table_name IN 
    SELECT t.table_name 
    FROM information_schema.columns c
    JOIN information_schema.tables t ON c.table_name = t.table_name
    WHERE c.column_name = 'environment' 
      AND t.table_schema = 'public'
      AND c.is_nullable = 'YES' -- Only drop if still nullable (no data dependency)
  LOOP
    EXECUTE format('ALTER TABLE %I DROP COLUMN environment;', table_name);
    RAISE NOTICE 'Dropped environment column from %', table_name;
  END LOOP;
END $$;
```

**Scenario 3: Backfill job fails**

```sql
-- Reset backfill and retry
UPDATE <table_name> SET environment = NULL WHERE environment = 'production';
-- Then re-run backfill job
```

**Scenario 4: Complete rollback required**

```bash
# Full restoration from backup
# 1. Drop current database (CAUTION!)
psql $DATABASE_URL -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"

# 2. Restore from backup
psql $DATABASE_URL < backup_pre_environment_migration_YYYYMMDD_HHMMSS.sql

# 3. Restart application
npm run dev
```

---

## Performance Considerations

### Estimated Timing

| Phase | Duration | Notes |
|-------|----------|-------|
| Schema Analysis | BLOCKED | Awaiting conflict resolution |
| Migration Execution | 1-5 minutes | ~172 ADD COLUMN operations |
| Backfill Job (Task 2.2.5) | 15-60 minutes | Depends on data volume |
| Index Creation | 5-30 minutes | Concurrent, non-blocking |
| **Total** | **20-95 minutes** | Plus resolution time |

### Database Impact

- **Lock Duration:** <100ms per table (ADD COLUMN is fast)
- **Downtime:** None (nullable column, gradual rollout)
- **Disk Space:** +2-5% (column data + indexes)
- **Query Performance:** Neutral (column unused until backfill)

---

## Outstanding Questions

### Critical Blockers

1. **What is the correct resolution for the `agent_runs` table?**
   - Is it a new table?
   - Is it renamed from `document_versions_legacy`?
   - Is it renamed from `user_sessions`?

2. **What is the correct resolution for `document_id` in `document_versions`?**
   - Is it a new column?
   - Is it renamed from `original_file_id`?
   - Is it renamed from another column?

3. **Are there additional schema conflicts not yet visible?**
   - Drizzle diff was interrupted by prompts
   - Full scope of changes unknown

### Pre-Execution Verification Needed

4. **Backup strategy confirmed?**
   - Where should backup be stored?
   - How long should backup be retained?

5. **Downtime window approved?**
   - When can migration be executed?
   - Who needs to be notified?

6. **Rollback procedures tested?**
   - Has rollback been tested in a separate environment?
   - Are stakeholders aware of rollback plan?

---

## Recommendations

### Immediate Actions Required

1. **🔴 HIGH PRIORITY: Resolve Schema Conflicts**
   - Review `shared/schema.ts` for `agent_runs` table definition
   - Review `shared/schema.ts` for `document_versions` table changes
   - Determine correct rename vs. create strategy
   - Update schema or manually resolve in Drizzle

2. **🔴 HIGH PRIORITY: Generate Full Migration Diff**
   - Resolve interactive prompts in Drizzle
   - Generate complete migration files
   - Review all SQL statements to be executed
   - Verify no unexpected changes

3. **🟡 MEDIUM PRIORITY: Verify Backfill Job**
   - Ensure Task 2.2.5 backfill job is ready
   - Test backfill on a subset of tables
   - Confirm batching strategy for large tables

4. **🟡 MEDIUM PRIORITY: Create Backup**
   - Backup development database before migration
   - Store backup in secure location
   - Verify backup can be restored

5. **🟢 LOW PRIORITY: Schedule Migration**
   - Coordinate with stakeholders
   - Schedule during low-usage period
   - Prepare monitoring and alerting

### Alternative Approaches

**Option 1: Resolve Conflicts Manually (RECOMMENDED)**
- Review schema changes carefully
- Make explicit decisions on rename vs. create
- Update Drizzle snapshots
- Proceed with migration

**Option 2: Manual SQL Migration**
- Generate SQL scripts manually for environment column
- Skip Drizzle's interactive prompts
- Execute SQL directly with psql
- **⚠️ NOT RECOMMENDED** - bypasses safety checks

**Option 3: Split Migration into Phases**
- Phase 1: Resolve conflicts only
- Phase 2: Migrate environment column separately
- **⚠️ NOT RECOMMENDED** - more complex, longer timeline

---

## Approval Required

**⚠️ THIS MIGRATION REQUIRES EXPLICIT APPROVAL BEFORE EXECUTION**

### Sign-Off Checklist

- [ ] Schema conflicts resolved (agent_runs, document_id)
- [ ] Full migration diff reviewed and approved
- [ ] Backup strategy confirmed
- [ ] Rollback plan tested
- [ ] Stakeholders notified
- [ ] Migration window scheduled
- [ ] Monitoring and alerting prepared
- [ ] Backfill job (Task 2.2.5) ready
- [ ] Risk assessment acknowledged
- [ ] **ARCHITECT/LEAD APPROVAL OBTAINED**

---

## Next Steps

### Before Proceeding

1. **Review this document** with the project architect/lead
2. **Resolve schema conflicts** (agent_runs, document_id)
3. **Generate and review** complete migration SQL
4. **Test rollback procedure** in a separate environment
5. **Obtain explicit approval** to proceed

### When Ready to Execute

1. Create database backup
2. Run `npm run db:push --force` (after approval)
3. Execute backfill job (Task 2.2.5)
4. Verify migration success
5. Monitor application for errors
6. Document results and lessons learned

---

## Conclusion

**Status:** ⚠️ **BLOCKED - AWAITING CONFLICT RESOLUTION**

The environment column migration is well-scoped and documented, with ~172 tables requiring the column addition. However, **critical schema conflicts** have been detected that must be resolved before proceeding:

1. `agent_runs` table ambiguity (create vs. rename)
2. `document_id` column ambiguity in `document_versions` (create vs. rename)

**Recommendation:** Resolve these conflicts manually by:
- Reviewing schema.ts definitions
- Making explicit decisions on table/column creation vs. renaming
- Updating Drizzle configuration or manually resolving
- Re-running migration dry-run to verify clean execution

**Once conflicts are resolved,** this migration is ready for review and approval. The migration itself is low-risk (additive changes only), but the large scope (~172 tables) requires careful planning and execution.

**DO NOT PROCEED** with migration execution until:
✅ Schema conflicts are resolved  
✅ Full migration diff is reviewed  
✅ Architect/lead approval is obtained  

---

**Document Version:** 1.0  
**Last Updated:** November 8, 2025  
**Next Review:** After conflict resolution  
**Owner:** Development Team  
**Approver:** TBD (Architect/Lead)
