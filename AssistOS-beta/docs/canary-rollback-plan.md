# Canary Rollback Plan - AssistOS Alpha Go-Live

**Document Version:** 1.0.0  
**Last Updated:** November 10, 2025  
**Owner:** Platform Team  
**Classification:** CONFIDENTIAL - Internal Use Only

---

## Executive Summary

This document provides comprehensive procedures for **safely rolling back the AssistOS alpha canary deployment** if critical issues are detected during the 7-day go-live period (10 tenants).

**Deployment Context:**
- **Alpha Go-Live:** 10 tenants onboarded within 7 days
- **Multi-Tenant ERP:** AI-first system with production and sandbox environments
- **Database:** PostgreSQL (Neon) with PITR (30-day retention)
- **Job Queue:** BullMQ with Redis (7 queues + DLQ)
- **Infrastructure:** DLQ system, queue monitoring, secrets management

**Rollback Goals:**
1. **Rapid Response:** P0 incidents resolved <15 minutes, P1 <60 minutes
2. **Data Integrity:** Zero data loss via PITR, zero tenant data leakage
3. **Service Continuity:** Minimize downtime during rollback execution
4. **Root Cause Analysis:** Preserve forensic data (DLQ jobs, logs, Sentry events)

**Key Stakeholders:**
- **Platform Team:** Rollback execution, infrastructure coordination
- **Backend Team:** Queue management, API service health
- **Security Team:** Data integrity validation, audit compliance
- **Customer Success:** Tenant communication, impact assessment

---

## Table of Contents

1. [Rollback Decision Matrix](#1-rollback-decision-matrix)
2. [Database Rollback Procedures](#2-database-rollback-procedures)
3. [Queue Drain Strategy](#3-queue-drain-strategy)
4. [Feature Flag Kill Switch](#4-feature-flag-kill-switch)
5. [Environment Promotion Rollback](#5-environment-promotion-rollback)
6. [Secrets Rollback](#6-secrets-rollback)
7. [Rollback Execution Checklist](#7-rollback-execution-checklist)
8. [Communication Templates](#8-communication-templates)
9. [Post-Rollback Validation](#9-post-rollback-validation)
10. [Automation Scripts](#10-automation-scripts)

---

## 1. Rollback Decision Matrix

### 1.1 Severity Levels

| Severity | Description | Examples | Action | Timeline |
|----------|-------------|----------|--------|----------|
| **🚨 P0 - Critical** | Data loss, security breach, multi-tenant data leakage | Tenant A can see Tenant B's data, database corruption, ransomware attack | **Immediate rollback** | <15 min |
| **⚠️ P1 - High** | Core features broken, widespread errors | Authentication broken, cannot create invoices, payment processing down | **Rollback within 1 hour** | <60 min |
| **📋 P2 - Medium** | Degraded performance, non-critical features broken | Slow page loads (>5s), email notifications not sending, search timeouts | **Evaluate, possible rollback** | <4 hours |
| **ℹ️ P3 - Low** | Minor UI bugs, cosmetic issues | Button alignment, typos, color inconsistencies | **Fix forward, no rollback** | N/A |

### 1.2 Rollback Triggers

#### **Auto Triggers** (Monitoring System)

**Infrastructure Health:**
- [ ] **Database Down:** Neon connection failures (>3 consecutive health checks)
- [ ] **Redis Down:** Redis connection timeouts (>3 consecutive health checks)
- [ ] **Queue Stalled:** No job processing for 5 minutes (any queue)
- [ ] **DLQ Surge:** DLQ depth >100 jobs within 10 minutes

**Error Rate Thresholds:**
- [ ] **API Errors:** Error rate >10% on critical endpoints (`/api/auth/login`, `/api/conversations`, `/api/invoices`)
- [ ] **Job Failures:** Queue success rate <85% (sustained for 10 minutes)
- [ ] **Sentry Spike:** Error event rate >5x baseline (15-minute window)

**Performance Degradation:**
- [ ] **Response Time:** API p95 latency >5s (sustained for 10 minutes)
- [ ] **Database Latency:** Query p95 latency >2s (sustained for 10 minutes)
- [ ] **Memory/CPU:** Worker OOM events (>3 occurrences in 10 minutes)

#### **Manual Triggers** (Human Decision)

**Security Escalation:**
- [ ] **Data Leakage:** Tenant reports seeing other tenant's data
- [ ] **Authentication Bypass:** User reports accessing system without credentials
- [ ] **Privilege Escalation:** User reports unauthorized admin access
- [ ] **SQL Injection:** Suspected SQL injection attack detected

**Platform Admin Decision:**
- [ ] **Customer Escalation:** Multiple tenants report critical issues (>3 tenants)
- [ ] **Revenue Impact:** Payment processing blocked, preventing invoicing
- [ ] **Compliance Risk:** GDPR/SOC2 violation detected (data exposure)
- [ ] **Vendor Outage:** Critical dependency down (OpenAI, Neon, Upstash) with no ETA

**Canary Metrics:**
- [ ] **Tenant Churn Risk:** Alpha tenant requests immediate cancellation
- [ ] **Support Overload:** Support ticket volume >10x normal (urgent/critical)
- [ ] **NPS Impact:** Tenant NPS score drops <6 (from baseline 8+)

### 1.3 Decision Tree

```
┌───────────────────────────────────┐
│ Issue Detected (Auto or Manual)   │
└─────────────┬─────────────────────┘
              │
              ▼
      ┌───────────────┐
      │ Severity?     │
      └───┬───────────┘
          │
    ┌─────┼─────┬─────┬─────┐
    │     │     │     │     │
    ▼     ▼     ▼     ▼     ▼
   P0    P1    P2    P3   False
    │     │     │     │   Alarm
    │     │     │     │     │
    ▼     ▼     ▼     ▼     ▼
  Roll  Roll  Eval  Fix  Monitor
  back  back  uate  Fwd  & Close
  NOW   <1hr  <4hr  N/A

P0/P1: Execute rollback immediately
P2: Evaluate impact, rollback if:
   - Affects >50% of tenants
   - No fix available within 4 hours
   - Degradation worsening
P3: Fix forward (code patch, config change)
```

---

## 2. Database Rollback Procedures

### 2.1 Full Database Restore (P0/P1)

**Use Case:** Complete system rollback (all tenants affected)

**Duration:** 15-20 minutes  
**Impact:** Full service outage during restore

#### **Step 1: Identify Rollback Timestamp**

**Goal:** Determine last known good state before deployment

```bash
# 1. Check deployment logs for go-live timestamp
cat /var/log/assistos/deployment.log | grep "canary-deployment-start"

# Expected output:
# 2025-11-10 10:00:00 UTC - Canary deployment started (version v2.4.0)

# 2. Identify rollback timestamp (5 minutes before deployment)
ROLLBACK_TIMESTAMP="2025-11-10T09:55:00Z"
echo "Rollback timestamp: $ROLLBACK_TIMESTAMP"

# 3. Verify via audit logs
psql $DATABASE_URL -c "
  SELECT 
    MAX(created_at) as last_good_record,
    COUNT(*) as total_records
  FROM audit_trail
  WHERE created_at < '$ROLLBACK_TIMESTAMP';
"

# Expected: Last record before deployment timestamp
```

**Verification Checklist:**
- [ ] Deployment timestamp confirmed from logs
- [ ] Rollback timestamp calculated (5-10 min buffer before deployment)
- [ ] Audit trail confirms data exists at rollback timestamp
- [ ] Stakeholders notified (Platform, Backend, Security teams)

#### **Step 2: Create PITR Branch (Neon Console)**

**Method A: Via Neon Console (Recommended)**

```bash
# Via Neon Console:
1. Navigate to: https://console.neon.tech/app/projects/<PROJECT_ID>
2. Click "Branches" tab
3. Click "Create Branch" button
4. Select "Point in Time" restore type
5. Enter timestamp: 2025-11-10T09:55:00Z
6. Branch name: rollback-canary-20251110-emergency
7. Parent branch: main
8. Click "Create Branch"
9. Wait for completion (~60 seconds)

# Connection string provided:
# postgresql://user:pass@ep-rollback-canary.eu-central-1.aws.neon.tech/assistos
```

**Method B: Via Neon CLI**

```bash
# Install Neon CLI (if not already installed)
npm install -g neonctl

# Authenticate
neonctl auth

# Create recovery branch
neonctl branches create \
  --project-id assistos-prod-eu-central \
  --name rollback-canary-20251110-emergency \
  --parent main \
  --timestamp "2025-11-10T09:55:00Z"

# Get connection string
RECOVERY_DB_URL=$(neonctl connection-string rollback-canary-20251110-emergency)
echo "Recovery branch URL: $RECOVERY_DB_URL"
```

**Method C: Via Neon API**

```bash
export NEON_API_KEY="<your-api-key>"
export PROJECT_ID="assistos-prod-eu-central"

curl -X POST \
  "https://console.neon.tech/api/v2/projects/${PROJECT_ID}/branches" \
  -H "Authorization: Bearer ${NEON_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "branch": {
      "name": "rollback-canary-20251110-emergency",
      "parent_id": "main",
      "parent_timestamp": "2025-11-10T09:55:00Z"
    }
  }' | jq '.branch.connection_uri'
```

#### **Step 3: Validate Restored Branch**

**Goal:** Verify data integrity before promotion

```bash
# Connect to recovery branch
export RECOVERY_DB_URL="postgresql://user:pass@ep-rollback-canary.neon.tech/assistos"
psql $RECOVERY_DB_URL

# 1. Verify tenant count (should match pre-deployment)
SELECT COUNT(*) as tenant_count FROM tenants;
-- Expected: Same count as before deployment

# 2. Verify user count
SELECT COUNT(*) as user_count FROM users;

# 3. Verify conversation count
SELECT COUNT(*) as conversation_count FROM conversations;

# 4. Check most recent records (should NOT include post-deployment data)
SELECT 
  id, 
  name, 
  created_at 
FROM tenants 
ORDER BY created_at DESC 
LIMIT 10;
-- Expected: All created_at timestamps < rollback timestamp

# 5. Verify data integrity (no orphaned records)
SELECT COUNT(*) as orphaned_conversations
FROM conversations 
WHERE user_id NOT IN (SELECT id FROM users);
-- Expected: 0 (no orphaned records)

# 6. Verify multi-tenant isolation (critical for security)
SELECT 
  tenant_id,
  COUNT(*) as record_count
FROM users
GROUP BY tenant_id
ORDER BY tenant_id;
-- Expected: All tenants present, no data loss
```

**Validation Checklist:**
- [ ] Tenant count matches pre-deployment baseline
- [ ] User count matches pre-deployment baseline
- [ ] No records created after rollback timestamp
- [ ] Zero orphaned records (referential integrity intact)
- [ ] Multi-tenant isolation verified (no cross-tenant data)
- [ ] Sample tenant login test succeeds

#### **Step 4: Stop Application Workflow**

**Goal:** Prevent writes during database promotion

```bash
# Via Replit UI:
1. Navigate to: Deployments > Workflows
2. Select "Start application" workflow
3. Click "Stop" button
4. Confirm stop action
5. Wait for status: "Stopped"

# Verify workflow stopped
curl -f http://localhost:5000/api/health/readyz
# Expected: Connection refused (application not running)
```

#### **Step 5: Promote Restored Branch to Primary**

**Method A: Via Neon Console (Recommended)**

```bash
# Via Neon Console:
1. Navigate to: Branches > rollback-canary-20251110-emergency
2. Click "..." menu > "Set as Primary"
3. Confirm promotion warning
4. Wait for completion (~30 seconds)

# Result: Main branch now points to rollback state
```

**Method B: Rename Approach**

```bash
# Rename current main to backup
neonctl branches rename \
  --branch main \
  --name main-backup-20251110-canary

# Rename rollback branch to main
neonctl branches rename \
  --branch rollback-canary-20251110-emergency \
  --name main

# Verify
neonctl branches list | grep main
```

#### **Step 6: Update DATABASE_URL Secret**

**Goal:** Point application to restored database

```bash
# Via Replit Secrets UI:
1. Navigate to: Secrets tab
2. Edit secret: DATABASE_URL
3. Replace value with rollback branch connection string
4. Save changes

# New value (example):
# postgresql://user:pass@ep-rollback-canary.neon.tech/assistos?sslmode=require
```

#### **Step 7: Restart Application Workflow**

```bash
# Via Replit UI:
1. Navigate to: Deployments > Workflows
2. Select "Start application" workflow
3. Click "Start" button
4. Wait for status: "Running"

# Verify application health
curl -f http://localhost:5000/api/health/readyz

# Expected:
# {
#   "status": "healthy",
#   "database": "healthy",
#   "redis": "healthy",
#   "queues": [...]
# }
```

#### **Step 8: Verify Rollback Success**

```bash
# 1. Health check (all systems green)
curl -f http://localhost:5000/api/health/readyz | jq '.status, .database, .redis'

# 2. Tenant login test (verify authentication)
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@tenant1.com","password":"test123"}'

# Expected: JWT token returned

# 3. Data integrity spot check
curl -H "Authorization: Bearer <JWT>" \
  http://localhost:5000/api/tenants/me

# Expected: Tenant data returned (no post-deployment data)

# 4. Monitor Sentry error rate (should drop immediately)
# Via Sentry UI: Issues > Last 15 minutes
# Expected: Error rate returns to baseline
```

---

### 2.2 Partial Rollback (Tenant-Specific)

**Use Case:** Isolated tenant issues (P1/P2) without affecting other tenants

**Duration:** 10-15 minutes  
**Impact:** Single tenant affected during restore

#### **Step 1: Export Affected Tenant Data (Pre-Rollback)**

**Goal:** Preserve forensic evidence for root cause analysis

```bash
# 1. Export DLQ jobs for affected tenant
npx tsx scripts/dlq-export-jobs.ts \
  --output /tmp/tenant-123-dlq-$(date +%Y%m%d).csv \
  --reason "Canary rollback - forensic export for tenant 123"

# 2. Export tenant-specific database tables
export TENANT_ID=123
pg_dump $DATABASE_URL \
  -t "users" \
  -t "conversations" \
  -t "invoices" \
  -t "documents" \
  --where "tenant_id=$TENANT_ID" \
  > /tmp/tenant-${TENANT_ID}-backup-$(date +%Y%m%d).sql

# 3. Export audit trail for tenant
psql $DATABASE_URL -c "
  \copy (
    SELECT *
    FROM audit_trail
    WHERE tenant_id = $TENANT_ID
      AND created_at >= NOW() - INTERVAL '24 hours'
    ORDER BY created_at DESC
  ) TO '/tmp/tenant-${TENANT_ID}-audit-$(date +%Y%m%d).csv' CSV HEADER;
"

# 4. Log export completion
echo "$(date -Iseconds) - Forensic export complete for tenant $TENANT_ID" \
  >> docs/rollback-logs/tenant-${TENANT_ID}-rollback.log
```

#### **Step 2: Create Tenant-Specific PITR Branch**

```bash
# Create PITR branch for tenant-specific restore
ROLLBACK_TIMESTAMP="2025-11-10T09:55:00Z"

neonctl branches create \
  --project-id assistos-prod-eu-central \
  --name rollback-tenant-123-20251110 \
  --parent main \
  --timestamp "$ROLLBACK_TIMESTAMP"

# Get connection string
TENANT_RECOVERY_URL=$(neonctl connection-string rollback-tenant-123-20251110)
```

#### **Step 3: Extract Tenant Data from PITR Branch**

```bash
# Connect to PITR branch and export tenant data
psql "$TENANT_RECOVERY_URL" -c "
  \copy (
    SELECT *
    FROM users
    WHERE tenant_id = $TENANT_ID
  ) TO '/tmp/tenant-${TENANT_ID}-users-restored.csv' CSV HEADER;

  \copy (
    SELECT *
    FROM conversations
    WHERE tenant_id = $TENANT_ID
  ) TO '/tmp/tenant-${TENANT_ID}-conversations-restored.csv' CSV HEADER;

  \copy (
    SELECT *
    FROM invoices
    WHERE tenant_id = $TENANT_ID
  ) TO '/tmp/tenant-${TENANT_ID}-invoices-restored.csv' CSV HEADER;
"
```

#### **Step 4: Restore Tenant Data to Production**

```bash
# Delete corrupted tenant data from production
psql $DATABASE_URL <<EOF
  -- Backup current state first
  CREATE TABLE users_backup_${TENANT_ID} AS 
    SELECT * FROM users WHERE tenant_id = $TENANT_ID;

  -- Delete corrupted data
  DELETE FROM conversations WHERE tenant_id = $TENANT_ID;
  DELETE FROM invoices WHERE tenant_id = $TENANT_ID;
  DELETE FROM users WHERE tenant_id = $TENANT_ID;
EOF

# Import restored tenant data
psql $DATABASE_URL <<EOF
  -- Import users
  CREATE TEMP TABLE users_restore (LIKE users INCLUDING ALL);
  \copy users_restore FROM '/tmp/tenant-${TENANT_ID}-users-restored.csv' CSV HEADER;
  INSERT INTO users SELECT * FROM users_restore;

  -- Import conversations
  CREATE TEMP TABLE conversations_restore (LIKE conversations INCLUDING ALL);
  \copy conversations_restore FROM '/tmp/tenant-${TENANT_ID}-conversations-restored.csv' CSV HEADER;
  INSERT INTO conversations SELECT * FROM conversations_restore;

  -- Import invoices
  CREATE TEMP TABLE invoices_restore (LIKE invoices INCLUDING ALL);
  \copy invoices_restore FROM '/tmp/tenant-${TENANT_ID}-invoices-restored.csv' CSV HEADER;
  INSERT INTO invoices SELECT * FROM invoices_restore;

  -- Verify record counts
  SELECT 
    'users' as table_name, 
    COUNT(*) as record_count 
  FROM users 
  WHERE tenant_id = $TENANT_ID
  UNION ALL
  SELECT 
    'conversations', 
    COUNT(*) 
  FROM conversations 
  WHERE tenant_id = $TENANT_ID
  UNION ALL
  SELECT 
    'invoices', 
    COUNT(*) 
  FROM invoices 
  WHERE tenant_id = $TENANT_ID;
EOF
```

#### **Step 5: Verify Tenant Health**

```bash
# 1. Tenant login test
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@tenant123.com","password":"tenant123pass"}'

# Expected: JWT token returned

# 2. Verify tenant data integrity
curl -H "Authorization: Bearer <JWT>" \
  http://localhost:5000/api/tenants/me | jq

# Expected: Tenant profile returned with correct data

# 3. Test critical features
# - Create invoice
# - Upload document
# - Send email notification

# 4. Check for errors in Sentry (tenant-specific filter)
# Via Sentry UI: Issues > tag:tenant_id:123
# Expected: No new errors after restore
```

#### **Step 6: Cleanup Tenant PITR Branch**

```bash
# After 24-48 hours of stable operation
neonctl branches delete --branch rollback-tenant-123-20251110

# Document restoration in audit log
psql $DATABASE_URL -c "
  INSERT INTO audit_trail (
    tenant_id,
    user_id,
    action,
    table_name,
    details,
    created_at
  ) VALUES (
    $TENANT_ID,
    NULL,
    'TENANT_ROLLBACK',
    'multiple',
    'Tenant data restored from PITR $(date -Iseconds)',
    NOW()
  );
"
```

---

## 3. Queue Drain Strategy

### 3.1 Queue Overview

**AssistOS Queue Architecture (7 Queues + DLQ):**

| Queue Name | Purpose | Criticality | Avg Jobs/Day |
|------------|---------|-------------|--------------|
| `assistbuild` | Code generation, sandbox testing | HIGH | 50-100 |
| `apply-migration` | Schema migrations | CRITICAL | 5-10 |
| `promotion` | Sandbox → production promotion | CRITICAL | 10-20 |
| `connector-sync` | External API sync (Moloni, SAP) | HIGH | 100-200 |
| `analyze-patterns` | AI pattern detection | MEDIUM | 50-100 |
| `pattern-aggregation` | Cross-tenant analytics | MEDIUM | 20-50 |
| `backfill-environment` | Data backfill jobs | MEDIUM | 10-30 |
| `dead-letter-queue` (DLQ) | Failed jobs | - | 0-10 |

### 3.2 Pause All Queues

**Goal:** Stop new job processing during rollback

**Script:** `scripts/pause-all-queues.ts`

```bash
# Pause all queues (dry-run mode)
npx tsx scripts/pause-all-queues.ts --dry-run

# Execute pause (requires --execute flag)
npx tsx scripts/pause-all-queues.ts --execute --reason "Canary rollback in progress"

# Expected output:
# ✅ Paused queue: assistbuild
# ✅ Paused queue: apply-migration
# ✅ Paused queue: promotion
# ✅ Paused queue: connector-sync
# ✅ Paused queue: analyze-patterns
# ✅ Paused queue: pattern-aggregation
# ✅ Paused queue: backfill-environment
# ✅ All 7 queues paused successfully
```

**Manual Verification:**

```bash
# Verify all queues paused
curl -f http://localhost:5000/api/health/readyz | jq '.queues[] | select(.paused == true)'

# Expected: All 7 queues show "paused": true
```

### 3.3 Wait for In-Flight Jobs Completion

**Goal:** Drain active jobs before proceeding with rollback

**Max Wait Time:** 10 minutes (timeout for safety)

```bash
# Poll active jobs every 5 seconds (max 10 minutes)
START_TIME=$(date +%s)
MAX_WAIT=600  # 10 minutes

while true; do
  # Get active job count across all queues
  ACTIVE_JOBS=$(curl -s http://localhost:5000/api/health/readyz | \
    jq '[.queues[] | .active] | add')
  
  ELAPSED=$(($(date +%s) - START_TIME))
  
  echo "$(date -Iseconds) - Active jobs: $ACTIVE_JOBS (elapsed: ${ELAPSED}s)"
  
  # Exit conditions
  if [ "$ACTIVE_JOBS" -eq 0 ]; then
    echo "✅ All in-flight jobs completed"
    break
  fi
  
  if [ $ELAPSED -ge $MAX_WAIT ]; then
    echo "⚠️  WARNING: Timeout reached (10 minutes) - $ACTIVE_JOBS jobs still active"
    echo "   Proceeding with rollback despite active jobs"
    break
  fi
  
  sleep 5
done
```

**Escalation:** If jobs remain active after 10 minutes:
1. Capture job details for forensics:
   ```bash
   curl -s http://localhost:5000/api/health/readyz | \
     jq '.queues[] | select(.active > 0)' > /tmp/stuck-jobs-$(date +%Y%m%d).json
   ```
2. Force-terminate stuck jobs (if safe):
   ```bash
   # Only for non-critical queues (analyze-patterns, pattern-aggregation)
   # DO NOT force-terminate: apply-migration, promotion, connector-sync
   ```

### 3.4 Move Pending Jobs to DLQ

**Goal:** Preserve pending jobs for post-rollback analysis

**Script:** `scripts/drain-queues-to-dlq.ts`

```bash
# Drain all pending jobs to DLQ (dry-run mode)
npx tsx scripts/drain-queues-to-dlq.ts --dry-run

# Execute drain (requires --execute flag)
npx tsx scripts/drain-queues-to-dlq.ts \
  --execute \
  --reason "Canary rollback - preserving pending jobs for analysis" \
  --operator "platform-admin@assistos.com"

# Expected output:
# 📋 Draining queues to DLQ...
# ✅ Moved 15 jobs from assistbuild to DLQ
# ✅ Moved 3 jobs from connector-sync to DLQ
# ✅ Moved 0 jobs from apply-migration to DLQ (empty)
# ...
# ✅ Total: 25 jobs moved to DLQ
```

**Verification:**

```bash
# Verify DLQ depth increased
curl -f http://localhost:5000/api/health/readyz | \
  jq '.queues[] | select(.name=="dead-letter-queue") | .depth'

# Expected: Depth equals number of drained jobs (e.g., 25)
```

### 3.5 Clear Queue State (Optional)

**⚠️ WARNING:** Only use if rollback requires clean slate (rare)

```bash
# Clear all queue state (THIS IS DESTRUCTIVE)
# Skipping implementation - use only under Platform Lead approval
```

### 3.6 Resume Queues (Post-Rollback)

**Goal:** Resume queue processing after rollback verification

```bash
# Resume all queues after rollback validation
npx tsx scripts/resume-all-queues.ts --execute --reason "Rollback complete, resuming queues"

# Verify queues resumed
curl -f http://localhost:5000/api/health/readyz | jq '.queues[] | .paused'

# Expected: All queues show "paused": false
```

---

## 4. Feature Flag Kill Switch

### 4.1 Kill Switch Architecture

**Purpose:** Instantly disable problematic features without code deployment

**Implementation:** Database-backed feature flags with API endpoints

#### **Database Schema**

```sql
-- Create feature_kill_switches table (if not exists)
CREATE TABLE IF NOT EXISTS feature_kill_switches (
  id SERIAL PRIMARY KEY,
  feature_name VARCHAR(100) UNIQUE NOT NULL,
  enabled BOOLEAN DEFAULT true,
  reason TEXT,
  disabled_at TIMESTAMPTZ,
  disabled_by VARCHAR(100),
  auto_disabled BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index for fast lookups
CREATE INDEX idx_feature_kill_switches_name ON feature_kill_switches(feature_name);
CREATE INDEX idx_feature_kill_switches_enabled ON feature_kill_switches(enabled);

-- Insert default feature flags
INSERT INTO feature_kill_switches (feature_name, enabled) VALUES
  ('assistbuild', true),
  ('assistme', true),
  ('invoice-processing', true),
  ('connector-sync', true),
  ('sandbox-promotion', true),
  ('email-notifications', true),
  ('document-upload', true)
ON CONFLICT (feature_name) DO NOTHING;
```

### 4.2 Kill Switch API

**Endpoint:** `POST /api/admin/kill-switch`  
**Authentication:** Platform admin only

#### **Disable Feature**

```bash
# Disable AssistBuild feature
curl -X POST http://localhost:5000/api/admin/kill-switch \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <ADMIN_JWT>" \
  -d '{
    "feature_name": "assistbuild",
    "reason": "AssistBuild causing high error rate during canary (Sentry issue #12345)",
    "disabled_by": "platform-admin@assistos.com"
  }'

# Expected response:
# {
#   "success": true,
#   "feature_name": "assistbuild",
#   "enabled": false,
#   "disabled_at": "2025-11-10T14:30:00Z",
#   "disabled_by": "platform-admin@assistos.com"
# }
```

#### **Re-Enable Feature**

```bash
# Re-enable feature after fix
curl -X PUT http://localhost:5000/api/admin/kill-switch/assistbuild/enable \
  -H "Authorization: Bearer <ADMIN_JWT>"

# Expected response:
# {
#   "success": true,
#   "feature_name": "assistbuild",
#   "enabled": true,
#   "enabled_at": "2025-11-10T15:00:00Z"
# }
```

#### **List All Kill Switches**

```bash
# Get all feature flags
curl -X GET http://localhost:5000/api/admin/kill-switch \
  -H "Authorization: Bearer <ADMIN_JWT>" | jq

# Expected response:
# [
#   {"feature_name": "assistbuild", "enabled": false, "disabled_by": "platform-admin@assistos.com"},
#   {"feature_name": "assistme", "enabled": true},
#   {"feature_name": "invoice-processing", "enabled": true},
#   ...
# ]
```

### 4.3 Feature Flag Usage (Code Integration)

**Backend Middleware:**

```typescript
// apps/api/middleware/feature-flag.middleware.ts
import { Request, Response, NextFunction } from 'express';
import { db } from '../db';

export function requireFeature(featureName: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const feature = await db.query(
        'SELECT enabled FROM feature_kill_switches WHERE feature_name = $1',
        [featureName]
      );

      if (!feature.rows[0]?.enabled) {
        return res.status(503).json({
          error: 'Feature temporarily disabled',
          feature: featureName,
          message: 'This feature is currently unavailable. Please try again later.'
        });
      }

      next();
    } catch (error) {
      // Fail open (allow request if kill switch check fails)
      console.error('Kill switch check failed:', error);
      next();
    }
  };
}

// Usage in routes:
app.post('/api/assistbuild/generate', 
  requireAuth, 
  requireFeature('assistbuild'), 
  assistbuildController.generate
);
```

### 4.4 Kill Switch Examples

#### **Example 1: Disable AssistBuild (Code Generation Errors)**

```bash
# Scenario: AssistBuild causing high error rate in Sentry
# Severity: P1 (core feature broken)

# 1. Disable feature immediately
curl -X POST http://localhost:5000/api/admin/kill-switch \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <ADMIN_JWT>" \
  -d '{
    "feature_name": "assistbuild",
    "reason": "High error rate (>25%) in code generation - Sentry issue #12345",
    "disabled_by": "backend-lead@assistos.com"
  }'

# 2. Verify feature disabled
curl -X POST http://localhost:5000/api/assistbuild/generate \
  -H "Authorization: Bearer <USER_JWT>" \
  -d '{"prompt":"Create invoice form"}'

# Expected: 503 Service Unavailable
# {"error":"Feature temporarily disabled","feature":"assistbuild"}

# 3. Monitor error rate drop in Sentry
# Via Sentry UI: Issues > tag:feature:assistbuild
# Expected: Error rate drops to 0%

# 4. After fix deployed, re-enable
curl -X PUT http://localhost:5000/api/admin/kill-switch/assistbuild/enable \
  -H "Authorization: Bearer <ADMIN_JWT>"
```

#### **Example 2: Disable Invoice Processing (OCR Failures)**

```bash
# Scenario: Invoice OCR failing for all tenants (Google Document AI timeout)
# Severity: P1 (core feature broken)

# 1. Disable invoice processing
curl -X POST http://localhost:5000/api/admin/kill-switch \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <ADMIN_JWT>" \
  -d '{
    "feature_name": "invoice-processing",
    "reason": "OCR failures - Google Document AI timeout (99% failure rate)",
    "disabled_by": "backend-lead@assistos.com"
  }'

# 2. Drain invoice processing queue to DLQ
npx tsx scripts/drain-queues-to-dlq.ts \
  --queue "invoice-processing" \
  --execute \
  --reason "Kill switch activated - OCR failures"

# 3. Notify tenants via email
# Template: docs/canary-rollback-plan.md#customer-notification-email

# 4. After Google Document AI recovered, re-enable
curl -X PUT http://localhost:5000/api/admin/kill-switch/invoice-processing/enable \
  -H "Authorization: Bearer <ADMIN_JWT>"

# 5. Retry failed jobs from DLQ
npx tsx scripts/dlq-retry-all.ts \
  --execute \
  --reason "Invoice processing re-enabled after OCR fix"
```

#### **Example 3: Disable Connector Sync (Moloni API Down)**

```bash
# Scenario: Moloni API outage (external dependency down)
# Severity: P2 (non-critical feature degraded)

# 1. Disable connector sync
curl -X POST http://localhost:5000/api/admin/kill-switch \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <ADMIN_JWT>" \
  -d '{
    "feature_name": "connector-sync",
    "reason": "Moloni API outage (ETA: 2 hours) - preventing sync job failures",
    "disabled_by": "backend-lead@assistos.com"
  }'

# 2. Pause connector-sync queue (prevent new jobs)
npx tsx scripts/pause-all-queues.ts \
  --queue "connector-sync" \
  --execute \
  --reason "Kill switch activated - Moloni API down"

# 3. Monitor Moloni status page
# https://status.moloni.pt

# 4. After Moloni API recovered, re-enable
curl -X PUT http://localhost:5000/api/admin/kill-switch/connector-sync/enable \
  -H "Authorization: Bearer <ADMIN_JWT>"

# 5. Resume connector-sync queue
npx tsx scripts/resume-all-queues.ts \
  --queue "connector-sync" \
  --execute \
  --reason "Moloni API recovered"
```

---

## 5. Environment Promotion Rollback

### 5.1 Overview

**Use Case:** Rollback sandbox → production environment promotions

**Scenarios:**
- Tenant promoted broken configuration to production
- Schema migration failed during promotion
- Data corruption detected post-promotion

### 5.2 Revert Environment Promotion

**Script:** `scripts/revert-environment-promotion.ts`

**Usage:**

```bash
# Dry-run mode (preview changes)
npx tsx scripts/revert-environment-promotion.ts \
  --tenant "acme-corp" \
  --from "production" \
  --to "sandbox" \
  --dry-run

# Execute revert (requires --execute flag)
npx tsx scripts/revert-environment-promotion.ts \
  --tenant "acme-corp" \
  --from "production" \
  --to "sandbox" \
  --reason "Rollback canary deployment - schema migration failed" \
  --operator "platform-admin@assistos.com" \
  --execute

# Expected output:
# 🔄 Environment Promotion Revert
# Tenant: acme-corp
# From: production
# To: sandbox
# Reason: Rollback canary deployment - schema migration failed
# 
# 📊 Analysis:
# - 25 tables in production environment
# - 20 tables in sandbox environment
# - 5 tables to delete (added during promotion)
# - 0 tables to restore (deleted during promotion)
# 
# ✅ Reverted production environment to sandbox state
# ✅ Promotion rollback complete
```

### 5.3 Manual Revert Procedure

**Step 1: Identify Promotion Timestamp**

```bash
# Query promotion events from audit trail
psql $DATABASE_URL -c "
  SELECT 
    id,
    tenant_id,
    created_at,
    details
  FROM audit_trail
  WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'acme-corp')
    AND action = 'ENVIRONMENT_PROMOTION'
  ORDER BY created_at DESC
  LIMIT 1;
"

# Expected output:
# id | tenant_id | created_at | details
# ---|-----------|------------|--------
# 123 | 456 | 2025-11-10 14:00:00 | {"from":"sandbox","to":"production",... }
```

**Step 2: Create PITR Branch (Pre-Promotion State)**

```bash
# Get timestamp before promotion (5 minutes buffer)
PROMOTION_TIME="2025-11-10T14:00:00Z"
ROLLBACK_TIME="2025-11-10T13:55:00Z"

# Create PITR branch
neonctl branches create \
  --project-id assistos-prod-eu-central \
  --name rollback-promotion-acme-corp-20251110 \
  --parent main \
  --timestamp "$ROLLBACK_TIME"
```

**Step 3: Export Sandbox State from PITR Branch**

```bash
TENANT_ID=456
RECOVERY_URL=$(neonctl connection-string rollback-promotion-acme-corp-20251110)

# Export all tenant tables from PITR branch (pre-promotion sandbox state)
pg_dump "$RECOVERY_URL" \
  -t "users" \
  -t "conversations" \
  -t "invoices" \
  --where "tenant_id=$TENANT_ID AND environment='sandbox'" \
  > /tmp/tenant-${TENANT_ID}-sandbox-restore.sql
```

**Step 4: Restore Sandbox State to Production**

```bash
# WARNING: This overwrites production environment with sandbox state

# Delete production environment data
psql $DATABASE_URL <<EOF
  -- Backup current production state first
  CREATE TABLE users_prod_backup_${TENANT_ID} AS
    SELECT * FROM users WHERE tenant_id = $TENANT_ID AND environment = 'production';

  -- Delete current production data
  DELETE FROM users WHERE tenant_id = $TENANT_ID AND environment = 'production';
  DELETE FROM conversations WHERE tenant_id = $TENANT_ID AND environment = 'production';
  DELETE FROM invoices WHERE tenant_id = $TENANT_ID AND environment = 'production';
EOF

# Restore sandbox state
psql $DATABASE_URL < /tmp/tenant-${TENANT_ID}-sandbox-restore.sql

# Update environment field to 'production'
psql $DATABASE_URL <<EOF
  UPDATE users 
  SET environment = 'production'
  WHERE tenant_id = $TENANT_ID AND environment = 'sandbox';

  UPDATE conversations 
  SET environment = 'production'
  WHERE tenant_id = $TENANT_ID AND environment = 'sandbox';

  UPDATE invoices 
  SET environment = 'production'
  WHERE tenant_id = $TENANT_ID AND environment = 'sandbox';
EOF
```

**Step 5: Verify Rollback**

```bash
# Verify record counts match pre-promotion state
psql $DATABASE_URL -c "
  SELECT 
    'users' as table_name,
    COUNT(*) as record_count
  FROM users
  WHERE tenant_id = $TENANT_ID AND environment = 'production'
  UNION ALL
  SELECT 
    'conversations',
    COUNT(*)
  FROM conversations
  WHERE tenant_id = $TENANT_ID AND environment = 'production';
"

# Expected: Counts match pre-promotion sandbox baseline
```

---

## 6. Secrets Rollback

### 6.1 Overview

**Use Case:** Revert secret rotations performed during canary deployment

**Secrets Requiring Rollback:**
1. `DATABASE_URL` (PostgreSQL connection string)
2. `REDIS_URL` (Redis connection string)
3. `OPENAI_API_KEY` (OpenAI API key)

### 6.2 DATABASE_URL Rollback

**Reference:** `scripts/rotate-database-url.md` Section "Phase 6: Rollback Procedure"

**Quick Rollback:**

```bash
# 1. Retrieve old DATABASE_URL from backup
OLD_DATABASE_URL=$(cat docs/rotation-logs/$(date +%Y%m%d)-database-url-backup.txt)

# 2. Update Replit secret (revert to old password)
# Via Replit Secrets UI:
# - Edit secret: DATABASE_URL
# - Replace with OLD_DATABASE_URL
# - Save changes

# 3. Restart API + Worker services
# Via Replit UI: Deployments > Restart

# 4. Verify rollback success
curl -f http://localhost:5000/api/health/readyz | jq '.database'

# Expected: {"status":"healthy"}
```

**Full Procedure:** See `scripts/rotate-database-url.md#phase-6-rollback-procedure`

### 6.3 REDIS_URL Rollback

**Reference:** `scripts/rotate-redis-url.md` Section "Phase 6: Rollback Procedure"

**Quick Rollback:**

```bash
# 1. Retrieve old REDIS_URL from backup
OLD_REDIS_URL=$(cat docs/rotation-logs/$(date +%Y%m%d)-redis-url-backup.txt)

# 2. Update Replit secret (revert to old token)
# Via Replit Secrets UI:
# - Edit secret: REDIS_URL
# - Replace with OLD_REDIS_URL
# - Save changes

# 3. Restart API + Worker services
# Via Replit UI: Deployments > Restart

# 4. Verify rollback success
curl -f http://localhost:5000/api/health/readyz | jq '.redis'

# Expected: {"status":"healthy"}
```

**Full Procedure:** See `scripts/rotate-redis-url.md#phase-6-rollback-procedure`

### 6.4 OPENAI_API_KEY Rollback

**Reference:** `scripts/rotate-openai-api-key.md` Section "Phase 6: Rollback Procedure"

**Quick Rollback:**

```bash
# 1. Retrieve old OPENAI_API_KEY from backup
OLD_OPENAI_API_KEY=$(cat docs/rotation-logs/$(date +%Y%m%d)-openai-api-key-backup.txt)

# 2. Update Replit secret (revert to old key)
# Via Replit Secrets UI:
# - Edit secret: OPENAI_API_KEY
# - Replace with OLD_OPENAI_API_KEY
# - Save changes

# 3. Restart API + Worker services
# Via Replit UI: Deployments > Restart

# 4. Verify rollback success (test embeddings)
curl -X POST http://localhost:5000/api/assistme/test-embeddings \
  -H "Content-Type: application/json" \
  -d '{"text":"Rollback test"}'

# Expected: {"dimensions":1536,"success":true}
```

**Full Procedure:** See `scripts/rotate-openai-api-key.md#phase-6-rollback-procedure`

---

## 7. Rollback Execution Checklist

### 7.1 Pre-Rollback (5 minutes)

**Goal:** Prepare for rollback execution

- [ ] **Identify Severity:** Classify issue (P0/P1/P2) using decision matrix
- [ ] **Determine Rollback Timestamp:** Identify last known good state (deployment logs, audit trail)
- [ ] **Notify Stakeholders:** Alert Platform, Backend, Security teams via Slack #platform-ops
- [ ] **Create Incident:** Create Sentry incident for tracking (tag: `canary-rollback`)
- [ ] **Export Forensic Data:**
  - [ ] Export DLQ jobs: `npx tsx scripts/dlq-export-jobs.ts --output /tmp/dlq-$(date +%Y%m%d).csv`
  - [ ] Capture queue metrics: `curl -f http://localhost:5000/api/health/readyz | jq '.queues' > /tmp/queue-metrics-pre-rollback.json`
  - [ ] Capture Sentry snapshot: Screenshot error rate dashboard
- [ ] **Backup Current DATABASE_URL:** `echo $DATABASE_URL > docs/rollback-logs/database-url-backup-$(date +%Y%m%d).txt`
- [ ] **Document Rollback Reason:** Create rollback log file:
  ```bash
  cat > docs/rollback-logs/rollback-$(date +%Y%m%d).md <<EOF
  # Canary Rollback - $(date -Iseconds)
  
  **Severity:** P1 - High
  **Reason:** [Describe issue]
  **Rollback Timestamp:** [YYYY-MM-DDTHH:MM:SSZ]
  **Initiated By:** [Name/Email]
  **Stakeholders Notified:** Platform, Backend, Security teams
  EOF
  ```

### 7.2 During Rollback (15-30 minutes)

**Goal:** Execute rollback procedures systematically

#### **Phase 1: Stop Application (2 minutes)**

- [ ] **Stop Workflow:** Via Replit UI > Deployments > Stop "Start application" workflow
- [ ] **Verify Stopped:** `curl -f http://localhost:5000/api/health/readyz` (expect connection refused)
- [ ] **Notify Tenants:** Send "Brief Service Interruption" email (see Section 8.2)

#### **Phase 2: Pause Queues (3 minutes)**

- [ ] **Pause All Queues:** `npx tsx scripts/pause-all-queues.ts --execute --reason "Canary rollback"`
- [ ] **Verify Paused:** `curl -f http://localhost:5000/api/health/readyz | jq '.queues[] | .paused'` (all true)
- [ ] **Wait for In-Flight Jobs:** Poll active jobs until 0 (max 10 minutes, see Section 3.3)
- [ ] **Drain to DLQ:** `npx tsx scripts/drain-queues-to-dlq.ts --execute --reason "Canary rollback - preserve pending jobs"`

#### **Phase 3: Database Rollback (10-15 minutes)**

- [ ] **Create PITR Branch:** Via Neon Console (see Section 2.1 Step 2)
- [ ] **Validate Restored Branch:** Connect via `psql` and verify data integrity (see Section 2.1 Step 3)
- [ ] **Promote PITR Branch:** Via Neon Console > Set as Primary (see Section 2.1 Step 5)
- [ ] **Update DATABASE_URL:** Via Replit Secrets UI (see Section 2.1 Step 6)

#### **Phase 4: Restart Application (5 minutes)**

- [ ] **Restart Workflow:** Via Replit UI > Deployments > Start "Start application" workflow
- [ ] **Wait for Healthy Status:** Poll health endpoint until `"status":"healthy"`
  ```bash
  while true; do
    STATUS=$(curl -s http://localhost:5000/api/health/readyz | jq -r '.status')
    echo "$(date -Iseconds) - Status: $STATUS"
    [ "$STATUS" == "healthy" ] && break
    sleep 5
  done
  ```
- [ ] **Verify Database Connection:** `curl -f http://localhost:5000/api/health/readyz | jq '.database'` (expect "healthy")
- [ ] **Verify Redis Connection:** `curl -f http://localhost:5000/api/health/readyz | jq '.redis'` (expect "healthy")

### 7.3 Post-Rollback (30-60 minutes)

**Goal:** Validate rollback success and monitor for issues

#### **Phase 1: Immediate Validation (10 minutes)**

- [ ] **Health Check:** `curl -f http://localhost:5000/api/health/readyz` (all systems green)
- [ ] **Tenant Login Test:**
  ```bash
  curl -X POST http://localhost:5000/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"admin@tenant1.com","password":"test123"}'
  ```
  (expect JWT token)
- [ ] **Data Integrity Spot Check:**
  ```sql
  -- Verify no post-deployment data
  SELECT COUNT(*) FROM tenants WHERE created_at > '$ROLLBACK_TIMESTAMP';
  -- Expected: 0
  
  -- Verify no orphaned records
  SELECT COUNT(*) FROM conversations WHERE user_id NOT IN (SELECT id FROM users);
  -- Expected: 0
  ```
- [ ] **Critical Feature Tests:**
  - [ ] Create invoice (POST /api/invoices)
  - [ ] Upload document (POST /api/documents)
  - [ ] Send email notification (verify email sent)

#### **Phase 2: Monitoring (30 minutes)**

- [ ] **Sentry Error Rate:** Monitor for 30 minutes (expect return to baseline)
  ```bash
  # Via Sentry UI: Issues > Last 30 minutes
  # Threshold: Error rate <2x baseline
  ```
- [ ] **Queue Metrics:** Poll queue depth every 5 minutes
  ```bash
  for i in {1..6}; do
    echo "Poll $i/6 - $(date -Iseconds)"
    curl -f http://localhost:5000/api/health/readyz | jq '.queues[] | {name, depth, active}'
    sleep 300  # 5 minutes
  done
  ```
  (expect stable depth, no spikes)
- [ ] **DLQ Depth:** Monitor DLQ for new failures
  ```bash
  curl -f http://localhost:5000/api/health/readyz | jq '.queues[] | select(.name=="dead-letter-queue") | .depth'
  ```
  (expect stable, no increase)

#### **Phase 3: Resume Queues (5 minutes)**

- [ ] **Decision Point:** Resume queues if monitoring success criteria met:
  - Health checks passing for 30 minutes
  - Error rate < baseline
  - No tenant-reported issues
- [ ] **Resume Queues:** `npx tsx scripts/resume-all-queues.ts --execute --reason "Rollback validation complete"`
- [ ] **Verify Resumed:** `curl -f http://localhost:5000/api/health/readyz | jq '.queues[] | .paused'` (all false)
- [ ] **Monitor Job Processing:** Verify jobs processing successfully (success rate >95%)

#### **Phase 4: Tenant Notification (10 minutes)**

- [ ] **Send "Service Restored" Email:** (see Section 8.2 template)
- [ ] **Update Status Page:** If public status page exists, update with "Resolved" status
- [ ] **Respond to Support Tickets:** Close any related support tickets with explanation

#### **Phase 5: Post-Mortem (30-60 minutes)**

- [ ] **Document Incident:** Complete rollback log:
  ```bash
  cat >> docs/rollback-logs/rollback-$(date +%Y%m%d).md <<EOF
  
  ## Rollback Summary
  
  **Status:** SUCCESS
  **Duration:** [X minutes]
  **Database Restored:** Yes (PITR to $ROLLBACK_TIMESTAMP)
  **Data Loss:** None
  **Tenant Impact:** [X tenants, Y minutes downtime]
  
  ## Root Cause Analysis
  
  **Issue:** [Describe root cause]
  **Contributing Factors:** [List factors]
  **Immediate Fix:** [Describe fix]
  **Long-Term Prevention:** [Preventive measures]
  
  ## Approvals
  
  - Platform Lead: _________________________ Date: _______
  - Backend Lead: _________________________ Date: _______
  - Security Lead: _________________________ Date: _______
  EOF
  ```
- [ ] **Create Sentry Post-Mortem:** Link to rollback log in Sentry incident
- [ ] **Schedule Retrospective:** Schedule team meeting (within 48 hours)
- [ ] **Analyze DLQ Jobs:** Review failed jobs for patterns
  ```bash
  npx tsx scripts/dlq-export-jobs.ts --output /tmp/dlq-post-rollback-$(date +%Y%m%d).csv
  ```

---

## 8. Communication Templates

### 8.1 Internal Alert (Slack/Email)

**Channel:** #platform-ops  
**Audience:** Platform, Backend, Security teams

```
🚨 **CANARY ROLLBACK IN PROGRESS**

**Severity:** P1 - High  
**Reason:** [Brief description of issue - e.g., "Authentication broken after deployment"]  
**Timeline:**  
  - Rollback initiated: 14:30 UTC  
  - ETA completion: 14:45 UTC (15 minutes)  

**Actions Taken:**  
  - Application workflow stopped  
  - BullMQ queues paused  
  - Database PITR branch created (rollback timestamp: 10:00 UTC)  

**Current Status:**  
  - [ ] Stop application  
  - [ ] Pause queues  
  - [x] Create PITR branch  
  - [ ] Promote PITR branch  
  - [ ] Restart application  

**Next Steps:**  
  1. Database promotion to rollback state  
  2. Application restart and health validation  
  3. Tenant notification (if customer-facing impact)  

**Incident Tracking:** Sentry issue #12345  
**Rollback Lead:** [Name] (@slack-handle)  
**Stakeholders:** @platform-team @backend-team @security-team  

**DO NOT DEPLOY** any changes until rollback complete and validated.
```

**Follow-Up Message (Rollback Complete):**

```
✅ **CANARY ROLLBACK COMPLETE**

**Duration:** 15 minutes (14:30 - 14:45 UTC)  
**Status:** All systems healthy  

**Validation:**  
  - ✅ Health checks passing  
  - ✅ Tenant login test successful  
  - ✅ Data integrity verified (no data loss)  
  - ✅ Error rate returned to baseline  
  - ✅ Queues resumed  

**Tenant Impact:**  
  - 10 alpha tenants affected  
  - 15 minutes downtime  
  - 0 data loss  

**Next Steps:**  
  1. Monitor Sentry for 30 minutes (error rate threshold: <2x baseline)  
  2. Root cause analysis meeting scheduled (tomorrow 10:00 UTC)  
  3. Post-mortem document: docs/rollback-logs/rollback-20251110.md  

**Deployments:** Resume normal deployment workflow after post-mortem review.

**Thanks to:** @platform-team for rapid response 🙌
```

### 8.2 Customer Notification (Email)

#### **Template A: Service Interruption (During Rollback)**

**Subject:** Brief Service Interruption - AssistOS Maintenance

**To:** All alpha tenants (BCC)  
**From:** support@assistos.com

```
Dear [Tenant Name],

We're currently performing emergency maintenance to address a technical issue affecting the AssistOS platform.

**Impact:**  
You may experience brief service interruptions for the next 15 minutes. Specifically:
- Login may be unavailable temporarily
- Ongoing tasks may be paused
- Recent data changes (within the last hour) may be temporarily unavailable

**Resolution:**  
Our engineering team is actively working to restore full service. We expect to resolve this issue by 14:45 UTC (approximately 15 minutes from now).

**Your Data:**  
All your data is safe and secure. No data loss will occur during this maintenance.

**What You Can Do:**  
- Please save any work in progress
- You may see a connection error if accessing the platform during this time - this is expected
- Service will automatically resume once maintenance is complete

**ETA:** 14:45 UTC  

We apologize for the inconvenience and appreciate your patience. If you have any urgent concerns, please contact our support team at support@assistos.com.

Best regards,  
AssistOS Platform Team

---
**AssistOS** | AI-First ERP for Modern Businesses  
support@assistos.com | https://assistos.com
```

#### **Template B: Service Restored (After Rollback)**

**Subject:** Service Restored - AssistOS Maintenance Complete

**To:** All alpha tenants (BCC)  
**From:** support@assistos.com

```
Dear [Tenant Name],

We're pleased to inform you that our emergency maintenance is now complete, and the AssistOS platform is fully operational.

**Summary:**  
- **Duration:** 15 minutes (14:30 - 14:45 UTC)  
- **Impact:** Brief service interruption  
- **Data Loss:** None - all your data is safe and intact  
- **Current Status:** All systems fully restored  

**What Happened:**  
We identified a technical issue that required immediate attention to ensure the stability and security of the platform. Our team successfully resolved the issue by rolling back to a previous stable version.

**What We've Done:**  
- Restored all services to full functionality  
- Verified data integrity (no data loss)  
- Implemented additional monitoring to prevent recurrence  

**What You Should Do:**  
- You can now log in and resume normal operations  
- If you were in the middle of a task, you may need to restart it  
- Any data entered before 14:30 UTC is preserved  

**Next Steps:**  
We're conducting a thorough post-mortem analysis to understand the root cause and implement preventive measures. We'll share our findings and improvement plan with you in the coming days.

**Questions or Concerns?**  
If you experience any issues or have questions, please don't hesitate to contact our support team at support@assistos.com. We're here to help 24/7.

Thank you for your understanding and patience during this maintenance window. We're committed to providing you with a reliable and secure platform.

Best regards,  
AssistOS Platform Team

---
**AssistOS** | AI-First ERP for Modern Businesses  
support@assistos.com | https://assistos.com
```

### 8.3 PagerDuty Escalation (Critical Incidents)

**Trigger:** P0 severity OR rollback duration >30 minutes

**Alert Message:**

```
🚨 CRITICAL: Canary Rollback Escalation Required

**Severity:** P0 - Critical  
**Issue:** [Brief description]  
**Rollback Status:** IN PROGRESS (>30 minutes)  

**Escalation Reason:**  
[X] Rollback duration exceeded threshold (>30 minutes)  
[X] Database PITR promotion failed  
[X] Health checks not passing after restart  
[X] Data integrity issues detected  

**Immediate Action Required:**  
1. Platform Lead: Review rollback logs (docs/rollback-logs/)  
2. Database Admin: Investigate PITR branch status  
3. Security Team: Validate data integrity  

**Incident Details:**  
- Rollback initiated: [HH:MM UTC]  
- Current duration: [X minutes]  
- Blocking issue: [Description]  
- Sentry incident: #12345  

**On-Call Engineer:** [Name] ([Phone])  
**Escalation Path:** Platform Lead → CTO → CEO  

Acknowledge this alert immediately. If unresolved within 60 minutes, escalate to CTO.
```

---

## 9. Post-Rollback Validation

### 9.1 Database Validation

**Goal:** Verify database state matches pre-deployment baseline

```sql
-- Connect to production database
psql $DATABASE_URL

-- 1. Verify tenant count (should match pre-deployment)
SELECT 
  COUNT(*) as tenant_count,
  'Expected: 10 (alpha tenants)' as note
FROM tenants;

-- 2. Verify user count
SELECT 
  COUNT(*) as user_count
FROM users;

-- 3. Verify conversation count
SELECT 
  COUNT(*) as conversation_count
FROM conversations;

-- 4. Verify no post-deployment data
SELECT 
  COUNT(*) as post_deployment_records,
  'Expected: 0' as note
FROM tenants 
WHERE created_at > '$ROLLBACK_TIMESTAMP';

-- 5. Check data integrity (no orphaned records)
SELECT 
  'orphaned_conversations' as check_name,
  COUNT(*) as orphan_count,
  'Expected: 0' as note
FROM conversations 
WHERE user_id NOT IN (SELECT id FROM users)
UNION ALL
SELECT 
  'orphaned_invoices',
  COUNT(*),
  'Expected: 0'
FROM invoices 
WHERE tenant_id NOT IN (SELECT id FROM tenants);

-- 6. Verify multi-tenant isolation (critical for security)
SELECT 
  tenant_id,
  COUNT(*) as user_count
FROM users
GROUP BY tenant_id
ORDER BY tenant_id;
-- Expected: All 10 alpha tenants present with user counts

-- 7. Verify audit trail integrity
SELECT 
  MAX(created_at) as last_audit_record,
  'Expected: <= rollback timestamp' as note
FROM audit_trail;

-- 8. Sample tenant data spot check
SELECT * FROM tenants ORDER BY id LIMIT 5;
SELECT * FROM users ORDER BY id LIMIT 5;
SELECT * FROM conversations ORDER BY id LIMIT 5;
```

**Validation Success Criteria:**
- [ ] Tenant count: 10 (all alpha tenants present)
- [ ] User count: Matches pre-deployment baseline
- [ ] Zero post-deployment records
- [ ] Zero orphaned records
- [ ] All tenants have user data (multi-tenant isolation intact)
- [ ] Audit trail max timestamp ≤ rollback timestamp

### 9.2 Queue Validation

**Goal:** Verify BullMQ queues operational and processing jobs

```bash
# 1. Get queue health status
curl -f http://localhost:5000/api/health/readyz | jq '.queues'

# Expected output (example):
# [
#   {"name":"assistbuild","active":2,"waiting":10,"depth":12,"paused":false,"success_rate":0.98},
#   {"name":"connector-sync","active":1,"waiting":5,"depth":6,"paused":false,"success_rate":0.95},
#   {"name":"dead-letter-queue","active":0,"waiting":3,"depth":3,"paused":false}
# ]

# 2. Verify all queues resumed (not paused)
curl -f http://localhost:5000/api/health/readyz | \
  jq '.queues[] | select(.paused == true)'

# Expected: Empty output (no paused queues)

# 3. Verify DLQ depth stable (no new failures)
DLQ_DEPTH_BEFORE=$(cat /tmp/queue-metrics-pre-rollback.json | \
  jq '.[] | select(.name=="dead-letter-queue") | .depth')
DLQ_DEPTH_AFTER=$(curl -s http://localhost:5000/api/health/readyz | \
  jq '.queues[] | select(.name=="dead-letter-queue") | .depth')

echo "DLQ depth - Before rollback: $DLQ_DEPTH_BEFORE, After rollback: $DLQ_DEPTH_AFTER"
# Expected: After ≤ Before + 5 (allow minor increase from rollback-related jobs)

# 4. Verify job success rate >95%
curl -f http://localhost:5000/api/health/readyz | \
  jq '.queues[] | select(.success_rate < 0.95)'

# Expected: Empty output (all queues >95% success rate)

# 5. Monitor queue depth over 10 minutes (ensure stable, not growing)
for i in {1..10}; do
  echo "Poll $i/10 - $(date -Iseconds)"
  curl -s http://localhost:5000/api/health/readyz | \
    jq '.queues[] | {name, depth}'
  sleep 60
done

# Expected: Depth stable or decreasing (jobs processing normally)
```

**Validation Success Criteria:**
- [ ] All queues resumed (paused: false)
- [ ] DLQ depth stable (no surge of new failures)
- [ ] Job success rate >95% (all queues)
- [ ] Queue depth stable/decreasing over 10 minutes
- [ ] No stuck jobs (active count decreasing over time)

### 9.3 Feature Validation

**Goal:** Verify critical features operational

#### **Test 1: Tenant Login (Authentication)**

```bash
# Test login for 3 alpha tenants
for TENANT_EMAIL in admin@tenant1.com admin@tenant2.com admin@tenant3.com; do
  echo "Testing login for $TENANT_EMAIL..."
  
  RESPONSE=$(curl -s -X POST http://localhost:5000/api/auth/login \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$TENANT_EMAIL\",\"password\":\"test123\"}")
  
  JWT=$(echo $RESPONSE | jq -r '.token')
  
  if [ "$JWT" != "null" ] && [ -n "$JWT" ]; then
    echo "✅ Login successful for $TENANT_EMAIL"
  else
    echo "❌ Login failed for $TENANT_EMAIL"
    echo "Response: $RESPONSE"
  fi
done
```

**Expected:** All 3 tenants login successfully, JWT tokens returned

#### **Test 2: Create Invoice (Core Feature)**

```bash
# Login as tenant admin
JWT=$(curl -s -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@tenant1.com","password":"test123"}' | jq -r '.token')

# Create test invoice
curl -X POST http://localhost:5000/api/invoices \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "customer_name": "Test Customer",
    "amount": 100.00,
    "currency": "EUR",
    "due_date": "2025-12-31",
    "items": [
      {"description":"Test item","quantity":1,"unit_price":100.00}
    ]
  }' | jq

# Expected: Invoice created successfully, invoice ID returned
```

#### **Test 3: Upload Document (Document Management)**

```bash
# Upload test document
curl -X POST http://localhost:5000/api/documents \
  -H "Authorization: Bearer $JWT" \
  -F "file=@/tmp/test-invoice.pdf" \
  -F "folder_id=1" | jq

# Expected: Document uploaded successfully, document ID returned
```

#### **Test 4: Send Email Notification (Communication)**

```bash
# Trigger email notification (e.g., invoice created)
curl -X POST http://localhost:5000/api/notifications/test \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "email",
    "recipient": "test@tenant1.com",
    "subject": "Test Email - Post-Rollback Validation",
    "body": "This is a test email to verify email notifications are working after rollback."
  }' | jq

# Expected: Email queued successfully, notification ID returned

# Verify email sent (check email queue or inbox)
```

#### **Test 5: AssistME Chat (AI Feature)**

```bash
# Send test message to AssistME
curl -X POST http://localhost:5000/api/conversations \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Create a test invoice for Acme Corp with amount 500 EUR"
  }' | jq

# Expected: Conversation created, AssistME response received
```

**Feature Validation Success Criteria:**
- [ ] Tenant login: 100% success rate (all test tenants)
- [ ] Create invoice: Invoice created successfully
- [ ] Upload document: Document uploaded successfully
- [ ] Send email: Email queued and sent
- [ ] AssistME chat: Conversation created, response received

### 9.4 Sentry Error Monitoring

**Goal:** Verify error rate returned to baseline (no new errors introduced)

```bash
# Via Sentry UI:
# 1. Navigate to: Issues > Search
# 2. Filter: last 1 hour, environment:production
# 3. Group by: Error message
# 4. Compare with 24h baseline

# Threshold: Error rate <2x baseline
# Alert if error rate >2x baseline for >10 minutes
```

**Metrics to Monitor:**
- **Error Rate:** Events per minute (baseline: <5/min)
- **Top Errors:** Most frequent error messages (should be familiar, not new)
- **Affected Users:** Number of unique users experiencing errors (baseline: <10)
- **Error Severity:** Distribution of error/warning/info (baseline: 80% info, 15% warning, 5% error)

**Sentry Success Criteria:**
- [ ] Error rate <2x baseline (sustained for 30 minutes)
- [ ] No new error types introduced (all errors familiar)
- [ ] Affected users <10 (or <10% of active users)
- [ ] Zero P0 errors (data loss, security breach)

### 9.5 Performance Validation

**Goal:** Verify application performance returned to normal

```bash
# 1. API response time (health endpoint)
for i in {1..10}; do
  START=$(date +%s%N)
  curl -s -f http://localhost:5000/api/health/readyz > /dev/null
  END=$(date +%s%N)
  DURATION=$(( (END - START) / 1000000 ))  # Convert to ms
  echo "Poll $i/10 - Health endpoint latency: ${DURATION}ms"
done

# Expected: Latency <200ms (average), <500ms (p95)

# 2. Database query latency
psql $DATABASE_URL -c "\timing on" -c "SELECT COUNT(*) FROM users;"

# Expected: Execution time <100ms

# 3. Redis latency (PING command)
redis-cli -u "$REDIS_URL" --latency-history

# Expected: Latency <20ms (average)
```

**Performance Success Criteria:**
- [ ] API p95 latency <500ms
- [ ] Database query latency <100ms
- [ ] Redis latency <20ms
- [ ] No timeout errors in Sentry

---

## 10. Automation Scripts

### 10.1 Pause All Queues Script

**File:** `scripts/pause-all-queues.ts`

**Purpose:** Pause all BullMQ queues during rollback to prevent new job processing

**Usage:**

```bash
# Dry-run mode (preview)
npx tsx scripts/pause-all-queues.ts --dry-run

# Execute pause
npx tsx scripts/pause-all-queues.ts --execute --reason "Canary rollback in progress"

# Pause specific queue
npx tsx scripts/pause-all-queues.ts --queue "assistbuild" --execute --reason "AssistBuild errors"
```

**Implementation:** See `scripts/pause-all-queues.ts`

---

### 10.2 Drain Queues to DLQ Script

**File:** `scripts/drain-queues-to-dlq.ts`

**Purpose:** Move pending jobs to DLQ before rollback to preserve for post-rollback analysis

**Usage:**

```bash
# Dry-run mode (preview)
npx tsx scripts/drain-queues-to-dlq.ts --dry-run

# Execute drain (all queues)
npx tsx scripts/drain-queues-to-dlq.ts --execute --reason "Canary rollback - preserve pending jobs"

# Drain specific queue
npx tsx scripts/drain-queues-to-dlq.ts --queue "connector-sync" --execute --reason "Moloni API outage"
```

**Implementation:** See `scripts/drain-queues-to-dlq.ts`

---

### 10.3 Revert Environment Promotion Script

**File:** `scripts/revert-environment-promotion.ts`

**Purpose:** Rollback sandbox → production environment promotions

**Usage:**

```bash
# Dry-run mode (preview)
npx tsx scripts/revert-environment-promotion.ts \
  --tenant "acme-corp" \
  --from "production" \
  --to "sandbox" \
  --dry-run

# Execute revert
npx tsx scripts/revert-environment-promotion.ts \
  --tenant "acme-corp" \
  --from "production" \
  --to "sandbox" \
  --reason "Rollback canary deployment - schema migration failed" \
  --operator "platform-admin@assistos.com" \
  --execute
```

**Implementation:** See `scripts/revert-environment-promotion.ts`

---

## Appendix

### A. Related Documentation

- **Database Restore Runbook:** `docs/database-restore-runbook.md` (Neon PITR procedures)
- **DLQ Triage SOP:** `docs/dlq-triage-sop.md` (DLQ management and root cause analysis)
- **DATABASE_URL Rotation:** `scripts/rotate-database-url.md` (rollback procedure in Phase 6)
- **REDIS_URL Rotation:** `scripts/rotate-redis-url.md` (rollback procedure in Phase 6)
- **OPENAI_API_KEY Rotation:** `scripts/rotate-openai-api-key.md` (rollback procedure in Phase 6)
- **Secrets Inventory:** `docs/secrets-inventory.md` (all secrets requiring rollback)
- **Secrets Rotation Policy:** `docs/secrets-rotation-policy.md` (rotation schedules and procedures)
- **Tenant Onboarding Playbook:** `docs/tenant-onboarding-playbook.md` (alpha go-live procedures)

### B. Emergency Contacts

| Role | Name | Email | Phone | Slack |
|------|------|-------|-------|-------|
| **Platform Lead** | [Name] | platform-lead@assistos.com | +XXX | @platform-lead |
| **Backend Lead** | [Name] | backend-lead@assistos.com | +XXX | @backend-lead |
| **Security Lead** | [Name] | security-lead@assistos.com | +XXX | @security-lead |
| **CTO** | [Name] | cto@assistos.com | +XXX | @cto |
| **On-Call Engineer** | [Rotation] | oncall@assistos.com | PagerDuty | @oncall |

### C. Approval Sign-Off

**Document Review:**
- [ ] Platform Team Lead: _________________________ Date: _______
- [ ] Backend Team Lead: _________________________ Date: _______
- [ ] Security Team Lead: _________________________ Date: _______

**Rollback Execution Authority:**

This document authorizes the following individuals to execute canary rollbacks without additional approval for P0/P1 incidents:
- [ ] Platform Lead: _________________________ Date: _______
- [ ] On-Call Engineer (P0 only): _________________________ Date: _______

P2 rollbacks require approval from Platform Lead + Backend Lead.

---

**Document Version History:**

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-11-10 | Platform Team | Initial canary rollback plan for alpha go-live |

---

**End of Document**
