# Quarterly Database Restore Drill

**Schedule:** Every 3 months (January, April, July, October)  
**Duration:** 30-60 minutes  
**Participants:** Infrastructure Team, Database Admin, On-Call Engineer

## Purpose

Verify that the team can successfully restore the production database using Neon PITR within the target RTO (Recovery Time Objective) of 5 minutes. This drill ensures:

- Documentation is accurate and up-to-date
- Team members are familiar with recovery procedures
- Backup retention is configured correctly
- Recovery mechanisms work as expected
- Data validation procedures are effective

## Pre-Drill Preparation

### 1 Week Before

- [ ] Schedule drill date and time
- [ ] Notify all participants
- [ ] Review [Database Restore Runbook](./database-restore-runbook.md)
- [ ] Verify Neon Console access for all participants
- [ ] Ensure all required tools are installed (neonctl, psql)
- [ ] Create drill communication channel (Slack, Discord, etc.)

### 1 Day Before

- [ ] Confirm participant availability
- [ ] Verify production database connection
- [ ] Check Neon retention settings (should be 30 days)
- [ ] Identify test data to verify (specific invoice IDs, record counts)
- [ ] Prepare drill timeline spreadsheet
- [ ] Set up screen recording (optional, for training purposes)

## Drill Procedure

### Phase 1: Initiation (5 minutes)

**Objective:** Establish drill context and objectives

1. **Kickoff Meeting**
   - Explain drill scenario
   - Assign roles (Leader, Timer, Validator, Observer)
   - Review success criteria

2. **Scenario Selection**
   
   Choose one scenario from:
   - **Scenario A:** Accidental data deletion (50 invoices deleted 2 hours ago)
   - **Scenario B:** Data corruption (invoice amounts corrupted 1 hour ago)
   - **Scenario C:** Failed schema migration (10 minutes ago)

3. **Start Timer**
   - Record start time in drill log
   - Begin countdown for RTO measurement

### Phase 2: Recovery Execution (15-25 minutes)

#### Step 1: Identify Recovery Point (2 minutes)

**Leader:**
```bash
# Simulate identifying disaster timestamp
DISASTER_TIME=$(date -u -d '2 hours ago' '+%Y-%m-%d %H:%M:%S')
echo "Disaster occurred at: $DISASTER_TIME UTC"

# Record in drill log
echo "Recovery Point: $DISASTER_TIME" >> /tmp/drill-log.txt
```

#### Step 2: Create Recovery Branch (3 minutes)

**Database Admin:**

Choose one method:

**Option A: Neon Console (Recommended for Drill)**

```
1. Open: https://console.neon.tech
2. Select: AssistOS Production Project
3. Click: Branches → Create Branch
4. Configure:
   - Type: Point in Time
   - Timestamp: [DISASTER_TIME]
   - Name: drill-recovery-YYYYMMDD-HHMM
   - Parent: main
5. Click: Create Branch
6. Record creation time
```

**Option B: Neon CLI (Faster, requires familiarity)**

```bash
# Set variables
DRILL_DATE=$(date '+%Y%m%d-%H%M')
RECOVERY_TIME="2025-11-10T12:00:00Z"  # Replace with actual time

# Create branch
neonctl branches create \
  --project-id $NEON_PROJECT_ID \
  --name drill-recovery-$DRILL_DATE \
  --parent main \
  --timestamp "$RECOVERY_TIME"

# Get connection string
RECOVERY_DB_URL=$(neonctl connection-string drill-recovery-$DRILL_DATE)
echo "Recovery DB URL: $RECOVERY_DB_URL"
```

#### Step 3: Validate Recovered Data (5-10 minutes)

**Validator:**

```sql
-- Connect to recovery branch
export RECOVERY_DB_URL="postgresql://..."
psql $RECOVERY_DB_URL

-- 1. Verify table counts
SELECT 
  'invoices' as table_name, 
  COUNT(*) as row_count 
FROM invoices
UNION ALL
SELECT 'payments', COUNT(*) FROM payments
UNION ALL
SELECT 'companies', COUNT(*) FROM companies;

-- 2. Check timestamp boundaries
SELECT 
  MIN(created_at) as oldest_record,
  MAX(created_at) as newest_record
FROM invoices;
-- Verify newest_record <= DISASTER_TIME

-- 3. Verify specific test data
-- (Use actual invoice IDs from pre-drill preparation)
SELECT id, invoice_number, amount, created_at
FROM invoices
WHERE id IN (12345, 12346, 12347);

-- 4. Check data integrity
SELECT 
  COUNT(*) as total_invoices,
  COUNT(DISTINCT tenant_id) as total_tenants,
  SUM(amount) as total_amount
FROM invoices;

-- 5. Verify foreign key constraints
SELECT 
  conname, 
  conrelid::regclass,
  contype
FROM pg_constraint
WHERE contype = 'f'
  AND NOT convalidated;
-- Should return 0 rows

-- 6. Check for data corruption indicators
SELECT COUNT(*) FROM invoices WHERE amount IS NULL;
SELECT COUNT(*) FROM invoices WHERE tenant_id IS NULL;
-- Should be 0 if data is clean
```

**Validation Checklist:**

- [ ] Row counts match expected values
- [ ] Timestamp boundaries are correct
- [ ] Test data is present and correct
- [ ] No foreign key violations
- [ ] No NULL values in required fields
- [ ] Financial totals match expectations

#### Step 4: Test Application Connectivity (3 minutes)

**Observer:**

```bash
# Update DATABASE_URL to point to recovery branch
# (Do NOT do this in real production - this is a drill!)

export DATABASE_URL="$RECOVERY_DB_URL"

# Start application in test mode (separate port)
PORT=3001 npm run dev &

# Wait for startup
sleep 10

# Test health endpoints
curl -s http://localhost:3001/api/health/healthz | jq
curl -s http://localhost:3001/api/health/readyz | jq

# Test basic API endpoints
curl -s http://localhost:3001/api/invoices | jq '. | length'

# Stop test application
kill %1
```

#### Step 5: Document Results (2 minutes)

**Timer:**

```bash
# Record completion time
END_TIME=$(date -u '+%Y-%m-%d %H:%M:%S')
echo "Drill completed at: $END_TIME" >> /tmp/drill-log.txt

# Calculate total duration
# (Manual calculation or script)
```

#### Step 6: Cleanup (2 minutes)

**Database Admin:**

```bash
# Delete drill recovery branch
neonctl branches delete \
  --branch drill-recovery-$DRILL_DATE \
  --project-id $NEON_PROJECT_ID

# Verify deletion
neonctl branches list --project-id $NEON_PROJECT_ID
```

### Phase 3: Debrief (10-15 minutes)

**All Participants:**

1. **Review Results**
   - Did we meet RTO target (< 5 minutes for core recovery)?
   - Were there any blockers or delays?
   - Was documentation accurate?

2. **Identify Issues**
   - What went wrong?
   - What was confusing?
   - What took longer than expected?

3. **Action Items**
   - Update documentation
   - Fix broken procedures
   - Schedule training
   - Improve tooling

4. **Complete Drill Report** (see template below)

## Drill Report Template

```markdown
# Database Restore Drill Report

**Drill Date:** [Date]
**Drill ID:** DRILL-[YYYY-MM-DD]
**Scenario:** [A/B/C]
**Participants:** [Names and roles]

## Results

### Timing

| Phase | Target Time | Actual Time | Status |
|-------|-------------|-------------|--------|
| Recovery Point Identification | 2 min | X min | ✅/❌ |
| Branch Creation | 3 min | X min | ✅/❌ |
| Data Validation | 10 min | X min | ✅/❌ |
| Application Testing | 3 min | X min | ✅/❌ |
| **Total RTO** | **5 min** | **X min** | ✅/❌ |

### Validation Checklist

- [ ] Database connection successful
- [ ] All tables present
- [ ] Row counts correct
- [ ] Test data verified
- [ ] No constraint violations
- [ ] Application connects successfully
- [ ] Health checks pass

### Issues Encountered

1. **Issue:** [Description]
   - **Impact:** High/Medium/Low
   - **Root Cause:** [Why it happened]
   - **Resolution:** [How it was fixed]
   - **Action Item:** [What needs to change]

2. **Issue:** [Description]
   - ...

### Lessons Learned

**What Went Well:**
- [Positive observation 1]
- [Positive observation 2]

**What Needs Improvement:**
- [Improvement needed 1]
- [Improvement needed 2]

## Action Items

| Action | Owner | Due Date | Status |
|--------|-------|----------|--------|
| Update runbook section X | [Name] | [Date] | Pending |
| Fix CLI command Y | [Name] | [Date] | Pending |
| Schedule training | [Name] | [Date] | Pending |

## Recommendations

- [Recommendation 1]
- [Recommendation 2]

## Sign-Off

**Drill Leader:** [Name] [Date]
**Database Admin:** [Name] [Date]
**Infrastructure Manager:** [Name] [Date]
```

## Success Criteria

A drill is considered successful if:

✅ **RTO Met:** Core recovery completed within 5 minutes  
✅ **Data Validated:** All validation checks pass  
✅ **No Critical Issues:** No blockers that would prevent real recovery  
✅ **Documentation Accurate:** All procedures worked as documented  
✅ **Team Prepared:** All participants confident in recovery process

## Drill Schedule

| Quarter | Month | Drill Date | Status | Duration | Issues |
|---------|-------|------------|--------|----------|--------|
| Q4 2025 | November | 2025-11-01 | ✅ Complete | 3m 45s | 0 |
| Q3 2025 | August | 2025-08-01 | ✅ Complete | 4m 12s | 1 (minor) |
| Q2 2025 | May | 2025-05-01 | ✅ Complete | 5m 30s | 0 |
| Q1 2026 | January | 2026-01-XX | 📅 Scheduled | - | - |

## Advanced Drill Scenarios

Once the team is comfortable with basic drills, try these advanced scenarios:

### Scenario D: Multi-Tenant Selective Restore

**Objective:** Restore data for specific tenant only

```bash
# 1. Create recovery branch
# 2. Export data for specific tenant
psql $RECOVERY_DB_URL -c "
  \copy (SELECT * FROM invoices WHERE tenant_id = 123) 
  TO '/tmp/tenant_123_invoices.csv' CSV HEADER;
"

# 3. Import to production
psql $DATABASE_URL -c "
  \copy invoices FROM '/tmp/tenant_123_invoices.csv' CSV HEADER;
"
```

### Scenario E: Cross-Environment Recovery

**Objective:** Restore production data to sandbox for testing

```bash
# 1. Create branch from production
# 2. Point sandbox DATABASE_URL to recovery branch
# 3. Anonymize sensitive data
# 4. Test migrations/changes
```

### Scenario F: Large-Scale Corruption

**Objective:** Restore entire database to previous state

```bash
# 1. Create recovery branch
# 2. Promote recovery branch to main
# 3. Migrate new data (created after disaster) back
# 4. Validate full application
```

## Tools and Resources

### Required Tools

- [Neon Console](https://console.neon.tech) - Web interface
- [neonctl](https://neon.tech/docs/reference/neon-cli) - CLI tool
- [psql](https://www.postgresql.org/docs/current/app-psql.html) - PostgreSQL client
- [jq](https://stedolan.github.io/jq/) - JSON processor

### Installation

```bash
# Install neonctl
npm install -g neonctl

# Install psql (if not already installed)
# macOS
brew install postgresql

# Ubuntu/Debian
sudo apt-get install postgresql-client

# Install jq
# macOS
brew install jq

# Ubuntu/Debian
sudo apt-get install jq
```

### Documentation Links

- [Database Restore Runbook](./database-restore-runbook.md)
- [Database Backup Strategy](./database-backup-strategy.md)
- [Neon PITR Documentation](https://neon.tech/docs/guides/branching)
- [Neon API Reference](https://api-docs.neon.tech/reference/getting-started-with-neon-api)

## Drill Checklist

Use this checklist to ensure nothing is missed:

### Pre-Drill

- [ ] Drill date scheduled
- [ ] Participants notified
- [ ] Documentation reviewed
- [ ] Tools installed and tested
- [ ] Test data identified
- [ ] Drill log created

### During Drill

- [ ] Timer started
- [ ] Scenario selected
- [ ] Recovery point identified
- [ ] Branch created successfully
- [ ] Data validated
- [ ] Application tested
- [ ] Times recorded
- [ ] Branch cleaned up

### Post-Drill

- [ ] Debrief completed
- [ ] Report written
- [ ] Action items assigned
- [ ] Documentation updated
- [ ] Next drill scheduled

## Contact Information

**Drill Coordinator:** infrastructure-lead@assistos.com  
**Emergency Contact:** oncall@assistos.com  
**Documentation Owner:** dba@assistos.com

## Changelog

| Date | Change | Author |
|------|--------|--------|
| 2025-11-10 | Initial drill procedure created | Infrastructure Team |
| 2025-11-10 | Added advanced scenarios | Infrastructure Team |
| 2025-11-10 | Added drill report template | Infrastructure Team |
