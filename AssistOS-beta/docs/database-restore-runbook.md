# Database Restore Runbook - Neon PITR

**Last Updated:** November 10, 2025  
**Status:** Production Ready  
**Classification:** Internal - Infrastructure Team Only

## Quick Reference

| Emergency Type | Recovery Time | Procedure |
|----------------|---------------|-----------|
| Accidental Deletion | < 5 minutes | [Scenario 1](#scenario-1-accidental-data-deletion) |
| Data Corruption | < 10 minutes | [Scenario 2](#scenario-2-data-corruption) |
| Schema Migration Failure | < 10 minutes | [Scenario 3](#scenario-3-failed-schema-migration) |
| Ransomware/Security Breach | < 15 minutes | [Scenario 4](#scenario-4-security-breach) |

## When to Use PITR

### Use PITR When:

✅ **Accidental Data Deletion**
- User accidentally deleted critical records
- Bulk DELETE without WHERE clause
- Truncated important table

✅ **Data Corruption**
- Application bug corrupted data
- Incorrect UPDATE statements
- Data integrity violations

✅ **Failed Schema Migrations**
- Migration partially applied
- Breaking schema changes
- Rollback mechanism failed

✅ **Security Incidents**
- Suspected ransomware attack
- Unauthorized data modification
- SQL injection detected

### Do NOT Use PITR For:

❌ **Application Code Issues** → Use Git rollback  
❌ **Configuration Changes** → Use environment variable history  
❌ **Object Storage Files** → Use Google Cloud Storage versioning  
❌ **Redis Cache** → Cache is ephemeral, regenerate from database  

## Pre-Recovery Checklist

Before initiating any restore operation:

- [ ] **Identify exact failure time** (from logs, monitoring, or user reports)
- [ ] **Document the issue** (what happened, who reported it, impact)
- [ ] **Verify recovery timestamp** is within 30-day retention window
- [ ] **Notify stakeholders** (infrastructure team, affected users)
- [ ] **Create Sentry issue** for tracking and post-mortem
- [ ] **Take snapshot of current state** (optional, for safety)

## Recovery Procedures

### Scenario 1: Accidental Data Deletion

**Example:** User accidentally deleted 50 invoices from production database at 14:30 UTC.

#### Step 1: Identify Disaster Timestamp

```bash
# Check application logs for deletion event
grep "DELETE FROM invoices" /var/log/assistos/api.log

# Check database audit trail
psql $DATABASE_URL -c "
  SELECT 
    created_at,
    user_id,
    action,
    table_name,
    details
  FROM audit_trail
  WHERE table_name = 'invoices'
    AND action = 'DELETE'
    AND created_at >= NOW() - INTERVAL '2 hours'
  ORDER BY created_at DESC
  LIMIT 20;
"

# Identify timestamp: 2025-11-10 14:30:45 UTC
```

#### Step 2: Create Recovery Branch (Console)

**Via Neon Console:**

1. Open [Neon Console](https://console.neon.tech)
2. Select project: **AssistOS Production**
3. Click **Branches** → **Create Branch**
4. Select **Point in Time**
5. Enter timestamp: `2025-11-10 14:30:00` (1 minute before deletion)
6. Branch name: `recovery-20251110-1430-invoice-deletion`
7. Parent branch: `main`
8. Click **Create Branch** (completes in < 60 seconds)

**Via Neon CLI:**

```bash
# Create recovery branch
neonctl branches create \
  --project-id <PROJECT_ID> \
  --name recovery-20251110-1430-invoice-deletion \
  --parent main \
  --timestamp "2025-11-10T14:30:00Z"

# Get connection string for recovery branch
neonctl connection-string recovery-20251110-1430-invoice-deletion
```

**Via Neon API:**

```bash
export NEON_API_KEY="your-api-key"
export PROJECT_ID="your-project-id"

curl -X POST \
  "https://console.neon.tech/api/v2/projects/${PROJECT_ID}/branches" \
  -H "Authorization: Bearer ${NEON_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "branch": {
      "name": "recovery-20251110-1430-invoice-deletion",
      "parent_id": "main",
      "parent_lsn": null,
      "parent_timestamp": "2025-11-10T14:30:00Z"
    }
  }'
```

#### Step 3: Validate Restored Data

```sql
-- Connect to recovery branch
export RECOVERY_DB_URL="postgresql://user:pass@recovery-branch.neon.tech/assistos"
psql $RECOVERY_DB_URL

-- Verify deleted invoices are present
SELECT COUNT(*) FROM invoices 
WHERE id IN (12345, 12346, 12347, ...);
-- Expected: 50 (deleted records)

-- Check timestamp of most recent invoice
SELECT MAX(created_at) FROM invoices;
-- Expected: <= 2025-11-10 14:30:00

-- Verify data integrity
SELECT 
  COUNT(*) as total_invoices,
  SUM(amount) as total_amount,
  COUNT(DISTINCT tenant_id) as tenant_count
FROM invoices;

-- Compare with production (should show 50 fewer)
\c $DATABASE_URL
SELECT COUNT(*) FROM invoices;
```

#### Step 4: Extract and Restore Deleted Data

**Option A: Selective Data Migration (Recommended)**

```sql
-- Export deleted invoices from recovery branch
\c $RECOVERY_DB_URL
\copy (SELECT * FROM invoices WHERE id IN (12345, 12346, ...)) TO '/tmp/deleted_invoices.csv' CSV HEADER;

-- Import back to production
\c $DATABASE_URL
\copy invoices FROM '/tmp/deleted_invoices.csv' CSV HEADER;

-- Verify restoration
SELECT COUNT(*) FROM invoices WHERE id IN (12345, 12346, ...);
-- Expected: 50
```

**Option B: Point Application to Recovery Branch (Full Restore)**

```bash
# Update DATABASE_URL in Replit Secrets
# Old: postgresql://main-branch.neon.tech/assistos
# New: postgresql://recovery-branch.neon.tech/assistos

# Restart application
kill -HUP $(cat /var/run/assistos.pid)

# Verify application health
curl https://assistos.repl.co/api/health/readyz
```

**Option C: Promote Recovery Branch to Main**

```bash
# Rename current main to backup
neonctl branches rename --branch main --name main-backup-20251110

# Rename recovery to main
neonctl branches rename \
  --branch recovery-20251110-1430-invoice-deletion \
  --name main

# Update application connection string (if using branch name)
# No changes needed if using project endpoint
```

#### Step 5: Post-Recovery Validation

```bash
# Run application health checks
curl https://assistos.repl.co/api/health/readyz | jq

# Verify user-facing functionality
# 1. Login to application
# 2. Navigate to Invoices page
# 3. Search for restored invoice IDs
# 4. Verify all data fields are correct

# Monitor error rates in Sentry
# Check for spike in errors after restore

# Check database connections
psql $DATABASE_URL -c "SELECT count(*) FROM pg_stat_activity;"
```

#### Step 6: Cleanup

```bash
# After 24-48 hours of stable operation
# Delete recovery branch to save storage costs
neonctl branches delete --branch recovery-20251110-1430-invoice-deletion

# Document in post-mortem
# Update incident ticket in Sentry
```

---

### Scenario 2: Data Corruption

**Example:** Application bug corrupted invoice amounts (set to NULL) at 16:45 UTC.

#### Recovery Steps

```bash
# 1. Identify last known good timestamp
# Check monitoring dashboards for when corruption started

# 2. Create recovery branch (5 minutes before corruption)
neonctl branches create \
  --name recovery-20251110-1640-corruption \
  --parent main \
  --timestamp "2025-11-10T16:40:00Z"

# 3. Export corrupted records from production
psql $DATABASE_URL -c "
  \copy (
    SELECT id, invoice_number, tenant_id 
    FROM invoices 
    WHERE amount IS NULL
  ) TO '/tmp/corrupted_invoices.csv' CSV HEADER;
"

# 4. Import correct data from recovery branch
RECOVERY_DB_URL="..." # Connection string for recovery branch
psql $RECOVERY_DB_URL -c "
  CREATE TEMP TABLE corrupted_ids (
    id INTEGER,
    invoice_number TEXT,
    tenant_id INTEGER
  );
  
  \copy corrupted_ids FROM '/tmp/corrupted_invoices.csv' CSV HEADER;
  
  \copy (
    SELECT i.* 
    FROM invoices i
    JOIN corrupted_ids c ON i.id = c.id
  ) TO '/tmp/correct_invoices.csv' CSV HEADER;
"

# 5. Update production with correct data
psql $DATABASE_URL <<EOF
  CREATE TEMP TABLE correct_data (
    id INTEGER,
    -- all invoice columns
  );
  
  \copy correct_data FROM '/tmp/correct_invoices.csv' CSV HEADER;
  
  UPDATE invoices i
  SET amount = c.amount,
      updated_at = NOW()
  FROM correct_data c
  WHERE i.id = c.id;
  
  -- Verify update count
  SELECT COUNT(*) FROM invoices WHERE amount IS NOT NULL;
EOF

# 6. Cleanup
neonctl branches delete --branch recovery-20251110-1640-corruption
```

---

### Scenario 3: Failed Schema Migration

**Example:** Drizzle migration added a NOT NULL constraint but some rows have NULL values, causing application to crash.

#### Recovery Steps

```bash
# 1. Identify migration timestamp
# Check drizzle_migrations table or deployment logs

# 2. Create recovery branch (before migration)
neonctl branches create \
  --name recovery-20251110-1800-migration-rollback \
  --parent main \
  --timestamp "2025-11-10T17:55:00Z"

# 3. Export application data created AFTER migration
# (to avoid losing new data)
psql $DATABASE_URL -c "
  \copy (
    SELECT * FROM invoices 
    WHERE created_at > '2025-11-10 18:00:00'
  ) TO '/tmp/new_invoices.csv' CSV HEADER;
"

# 4. Point application to recovery branch
# Update DATABASE_URL to recovery branch connection string

# 5. Import new data into recovery branch
psql $RECOVERY_DB_URL -c "
  \copy invoices FROM '/tmp/new_invoices.csv' CSV HEADER;
"

# 6. Fix migration script and re-apply
# Update migration to handle NULL values
# Run drizzle-kit push

# 7. Promote recovery branch or migrate data back
```

---

### Scenario 4: Security Breach

**Example:** Unauthorized access detected at 10:15 UTC, data may have been modified or exfiltrated.

#### Recovery Steps

```bash
# 1. IMMEDIATE ACTIONS
# - Rotate all database credentials
# - Revoke suspicious API keys
# - Enable IP allowlist in Neon Console
# - Notify security team and stakeholders

# 2. Identify breach timeline
# Check access logs, Sentry alerts, database audit trail
# Determine: When did breach start? What was accessed?

# 3. Create recovery branch (before breach)
neonctl branches create \
  --name recovery-20251110-1000-security-incident \
  --parent main \
  --timestamp "2025-11-10T10:00:00Z"

# 4. Forensic analysis
# Export data from both production and recovery branch
# Compare to identify unauthorized changes

psql $DATABASE_URL -c "
  SELECT table_name, COUNT(*) 
  FROM information_schema.tables 
  WHERE table_schema = 'public' 
  GROUP BY table_name;
" > /tmp/production_counts.txt

psql $RECOVERY_DB_URL -c "
  SELECT table_name, COUNT(*) 
  FROM information_schema.tables 
  WHERE table_schema = 'public' 
  GROUP BY table_name;
" > /tmp/recovery_counts.txt

diff /tmp/production_counts.txt /tmp/recovery_counts.txt

# 5. Full database restore to recovery branch
# Update DATABASE_URL to recovery branch
# Application now running on clean data

# 6. Security hardening
# - Update all passwords
# - Enable 2FA for all users
# - Review and update firewall rules
# - Implement additional monitoring

# 7. Post-incident review
# - Complete security audit
# - Update incident response procedures
# - Document lessons learned
```

---

## Validation Checklist

After ANY restore operation, complete this checklist:

### Database Health

- [ ] Database connection successful from application
- [ ] All expected tables present (`\dt` command)
- [ ] Row counts match expectations
- [ ] No foreign key constraint violations
- [ ] Indexes present and functional (`\di` command)
- [ ] Sequences correct (no ID conflicts on new inserts)

```sql
-- Check for constraint violations
SELECT conname, conrelid::regclass 
FROM pg_constraint 
WHERE contype = 'f' 
  AND NOT convalidated;

-- Verify sequences
SELECT schemaname, sequencename, last_value 
FROM pg_sequences 
WHERE schemaname = 'public';
```

### Application Health

- [ ] `/api/health/healthz` returns 200 OK
- [ ] `/api/health/readyz` returns 200 OK (all checks pass)
- [ ] No error spikes in Sentry (check last 15 minutes)
- [ ] Background jobs running (check BullMQ dashboard)
- [ ] SSE streaming working (test chat interface)

```bash
# Health checks
curl -s https://assistos.repl.co/api/health/healthz | jq
curl -s https://assistos.repl.co/api/health/readyz | jq

# Check Sentry for errors
# https://sentry.io/organizations/assistos/issues/?project=<id>&query=is:unresolved

# Verify background jobs
curl -s http://localhost:3000/api/admin/queue-status | jq
```

### User-Facing Features

- [ ] Login functionality works
- [ ] Dashboard loads with correct data
- [ ] Invoice creation/editing works
- [ ] Document upload works
- [ ] WhatsApp/Gmail integrations functional
- [ ] Multi-tenant isolation verified

### Data Integrity

- [ ] Financial totals match (invoices, payments, balances)
- [ ] Audit trail preserved
- [ ] File attachments accessible
- [ ] User permissions intact
- [ ] No duplicate records

```sql
-- Financial verification
SELECT 
  COUNT(*) as invoice_count,
  SUM(amount) as total_amount,
  SUM(amount_paid) as total_paid
FROM invoices
WHERE tenant_id = <TENANT_ID>;

-- Check for duplicates
SELECT id, COUNT(*) 
FROM invoices 
GROUP BY id 
HAVING COUNT(*) > 1;
```

## Rollback Procedures

If restore operation causes issues:

### Quick Rollback

```bash
# Revert to previous DATABASE_URL
# Update Replit Secrets back to original value

# Restart application
kill -HUP $(cat /var/run/assistos.pid)

# Verify health
curl https://assistos.repl.co/api/health/readyz
```

### Full Rollback with Branch Management

```bash
# If you promoted recovery branch to main
# Revert by renaming branches back

neonctl branches rename --branch main --name recovery-failed
neonctl branches rename --branch main-backup-20251110 --name main

# Application will automatically connect to reverted main
```

## Monitoring After Restore

Monitor these metrics for 24-48 hours post-restore:

### Key Metrics

| Metric | Normal Range | Alert Threshold |
|--------|--------------|-----------------|
| Error Rate | < 0.1% | > 1% |
| Response Time | < 200ms | > 500ms |
| Database Connections | 5-20 | > 50 |
| Failed Queries | 0 | > 10/hour |
| User Reports | 0 | > 3 |

### Monitoring Checklist

- [ ] Sentry error rate (hourly check for 24h)
- [ ] Application performance (response times)
- [ ] Database connection pool (no exhaustion)
- [ ] Background job success rate
- [ ] User support tickets (no unusual spike)

## Emergency Contacts

### Internal Team

| Role | Primary Contact | Backup Contact |
|------|----------------|----------------|
| Infrastructure Lead | infra-lead@assistos.com | CTO@assistos.com |
| On-Call Engineer | oncall@assistos.com | +351-XXX-XXX-XXX |
| Database Admin | dba@assistos.com | infra-lead@assistos.com |
| Security Team | security@assistos.com | CISO@assistos.com |

### External Support

| Service | Contact | SLA |
|---------|---------|-----|
| Neon Support | support@neon.tech | 4 hours |
| Neon Emergency | Via Console Ticket + Email | 1 hour |
| Replit Support | support@replit.com | 24 hours |

## Testing and Drills

### Quarterly Restore Drill

**Schedule:** January, April, July, October (1st week)

**Procedure:** See [Quarterly Restore Drill](./quarterly-restore-drill.md)

**Last Drill:** November 1, 2025 ✅ Success (3m 45s)

### Test Scenarios

1. **Basic Recovery:** Restore to 1 hour ago, verify data
2. **Selective Restore:** Extract specific records from recovery branch
3. **Cross-Environment:** Restore production data to sandbox
4. **Failover:** Promote recovery branch to main

## Post-Incident Procedures

After ANY production restore:

1. **Create Incident Report** (within 24 hours)
   - What happened and when
   - Root cause analysis
   - Timeline of events
   - Actions taken
   - Data lost (if any)

2. **Update Sentry Issue** (same day)
   - Mark as resolved
   - Add recovery steps
   - Link to incident report

3. **Team Debrief** (within 48 hours)
   - Review what went well
   - Identify improvements
   - Update runbook if needed

4. **Customer Communication** (if customer-facing)
   - Notify affected users
   - Explain impact
   - Apologize and provide timeline

5. **Documentation Update** (within 1 week)
   - Update this runbook
   - Add new scenarios if discovered
   - Improve procedures based on learnings

## Appendix

### Useful SQL Queries

```sql
-- Find timestamp of last UPDATE on specific table
SELECT MAX(updated_at) FROM invoices;

-- Audit trail search
SELECT * FROM audit_trail 
WHERE table_name = 'invoices' 
  AND action IN ('UPDATE', 'DELETE')
  AND created_at >= '2025-11-10 14:00:00'
ORDER BY created_at DESC;

-- Count records by time range
SELECT 
  DATE_TRUNC('hour', created_at) as hour,
  COUNT(*) as count
FROM invoices
WHERE created_at >= NOW() - INTERVAL '24 hours'
GROUP BY hour
ORDER BY hour DESC;
```

### Neon Branch Limits

- **Max Branches:** 10 (Free), Unlimited (Pro)
- **Branch Retention:** Same as main database (30 days)
- **Max Recovery Window:** 30 days (based on retention setting)
- **Branch Creation Time:** < 60 seconds (instant)

## References

- [Neon Branching Documentation](https://neon.tech/docs/guides/branching)
- [Neon PITR Guide](https://neon.tech/docs/guides/point-in-time-recovery)
- [Database Backup Strategy](./database-backup-strategy.md)
- [Quarterly Restore Drill](./quarterly-restore-drill.md)

## Changelog

| Date | Change | Author |
|------|--------|--------|
| 2025-11-10 | Initial runbook creation | Infrastructure Team |
| 2025-11-10 | Added 4 recovery scenarios | Infrastructure Team |
| 2025-11-10 | Added validation checklist | Infrastructure Team |
