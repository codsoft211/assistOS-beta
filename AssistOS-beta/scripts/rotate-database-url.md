# DATABASE_URL Rotation Workflow (Neon PostgreSQL)

**Document Version:** 1.0.0  
**Last Updated:** November 10, 2025  
**Owner:** Platform Team  
**Classification:** CONFIDENTIAL - Internal Use Only

---

## Overview

**Secret:** `DATABASE_URL`  
**Risk Tier:** CRITICAL (60-day rotation)  
**Blast Radius:** All services (API, Worker), BullMQ persistence, multi-tenant data  
**RTO Target:** <5 minutes  
**Downtime:** Zero (dual-credential approach with staged rollout)

**Rotation Frequency:** Every 60 days (infrastructure credential best practice)  
**Lead Time:** 7 days (coordinate with Platform + Security teams)  
**Notification:** Slack #platform-ops, PagerDuty (7 days before, 24 hours before, rotation start)

---

## Prerequisites

### Access Requirements
- [ ] Neon PostgreSQL owner access (eu-central-1 Frankfurt project)
- [ ] Replit Secrets write access (production environment)
- [ ] Neon CLI installed and authenticated (`neonctl auth`)
- [ ] SSH access to API + Worker services (or Replit workspace access)
- [ ] Sentry admin access (for alert mute window)

### Pre-Rotation Checklist
- [ ] **System Health:** Verify `/api/health/readyz` returns 200 OK
- [ ] **Queue Metrics:** Confirm queue depth <50 for all 7 queues
- [ ] **Sentry Baseline:** Record current error rate (target: <2x during rotation)
- [ ] **Active Tenants:** Document active tenant count + concurrent sessions
- [ ] **Backup Verification:** Confirm PITR available (check Neon console)
- [ ] **Stakeholder Notification:** Platform Team + Security Team notified 24h prior
- [ ] **Rollback Window:** Identify 2-hour maintenance window (low traffic period)

### Tools Required
```bash
# Install Neon CLI
npm install -g neonctl

# Authenticate
neonctl auth

# Verify project access
neonctl projects list
```

---

## Rotation Steps

### Phase 1: Staged Credential Issuance (Dual-Credential Period)

**Goal:** Generate new database password while keeping old password active (simultaneous connections from API + Worker).

**Duration:** 5 minutes  
**Impact:** None (both credentials active)

#### 1.1 Generate New Password
```bash
# List current roles
neonctl roles list --project-id assistos-prod-eu-central

# Generate new password for database role
NEW_PASSWORD=$(openssl rand -base64 32)
echo "New password: $NEW_PASSWORD"

# Rotate password via Neon CLI (keeps old password active for 30 minutes)
neonctl roles password-reset \
  --project-id assistos-prod-eu-central \
  --role-name assistos_app_user \
  --password "$NEW_PASSWORD" \
  --ttl 30m
```

**Verification:**
```bash
# Test new connection string
NEW_DATABASE_URL="postgresql://assistos_app_user:${NEW_PASSWORD}@ep-xxx.eu-central-1.aws.neon.tech/assistos_prod?sslmode=require"

# Test connection (read-only query)
psql "$NEW_DATABASE_URL" -c "SELECT COUNT(*) FROM tenants;"

# Expected: Row count returned successfully
```

#### 1.2 Store New Credential in Staging
```bash
# Update staging secret (test environment)
# Via Replit Secrets UI:
# 1. Navigate to Secrets tab
# 2. Add new secret: DATABASE_URL_NEW = <new_connection_string>
# 3. Keep existing DATABASE_URL unchanged
```

**Audit Trail:**
```bash
# Log rotation start
echo "$(date -Iseconds) - DATABASE_URL rotation started - dual-credential period active (30 min TTL)" >> docs/rotation-logs/$(date +%Y%m%d)-database-url.md
```

---

### Phase 2: Canary Validation (Disposable Schema Test)

**Goal:** Test new credential with isolated read/write transactions before full rollout.

**Duration:** 3 minutes  
**Impact:** None (canary schema isolated from production tables)

#### 2.1 Create Canary Schema
```bash
# Connect using NEW credential
psql "$NEW_DATABASE_URL" <<EOF
-- Create isolated test schema
CREATE SCHEMA IF NOT EXISTS canary_test;

-- Create test table
CREATE TABLE canary_test.rotation_verification (
  id SERIAL PRIMARY KEY,
  test_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  test_data TEXT NOT NULL
);

-- Insert test data
INSERT INTO canary_test.rotation_verification (test_data)
VALUES ('DATABASE_URL rotation canary - $(date -Iseconds)');

-- Verify read/write
SELECT * FROM canary_test.rotation_verification ORDER BY id DESC LIMIT 1;
EOF
```

**Expected Output:**
```
 id |      test_timestamp       |               test_data                
----+---------------------------+----------------------------------------
  1 | 2025-11-10 14:30:00+00    | DATABASE_URL rotation canary - 2025-11-10T14:30:00+00:00
```

#### 2.2 Test Connection Pooling
```bash
# Test Drizzle ORM connection with new credential
# Temporarily update DATABASE_URL in .env (local test)
export DATABASE_URL="$NEW_DATABASE_URL"

# Run health check with new credential
curl -f http://localhost:5000/api/health/readyz

# Expected: {"status":"healthy","database":"healthy",...}
```

**Canary Success Criteria:**
- [ ] Read query returns data successfully
- [ ] Write transaction commits successfully
- [ ] Connection pooling works (Drizzle ORM connects)
- [ ] Health endpoint returns `database: "healthy"`
- [ ] No errors in Sentry (zero events tagged `database_connection_error`)

**Canary Failure → Rollback:**
If canary fails, skip to **Phase 6: Rollback Procedure**.

#### 2.3 Cleanup Canary Schema
```bash
# Remove test schema after validation
psql "$NEW_DATABASE_URL" -c "DROP SCHEMA canary_test CASCADE;"
```

---

### Phase 3: Production Rollout (Staggered Service Update)

**Goal:** Update DATABASE_URL secret in production, restart services sequentially (API → Worker).

**Duration:** 10 minutes  
**Impact:** Brief service interruptions (<30s per service during restart)

#### 3.1 Mute Sentry Alerts
```bash
# Mute database connection alerts for 30 minutes
# Via Sentry UI:
# 1. Navigate to Alerts > Alert Rules
# 2. Mute rule: "Database Connection Pool Errors"
# 3. Mute rule: "Health Check Degraded"
# 4. Duration: 30 minutes
```

#### 3.2 Update Replit Secret (Production)
```bash
# Via Replit Secrets UI:
# 1. Navigate to Secrets tab (production workspace)
# 2. Edit secret: DATABASE_URL
# 3. Replace value with NEW_DATABASE_URL
# 4. Save changes

# Verification: Secret updated timestamp should reflect current time
```

#### 3.3 Restart API Service
```bash
# Graceful restart via Replit (API service picks up new DATABASE_URL)
# Via Replit UI:
# 1. Navigate to Deployments > API Service
# 2. Click "Restart"
# 3. Wait for status: "Running"

# Verify new connection
curl -f http://localhost:5000/api/health/readyz

# Expected: {"status":"healthy","database":"healthy",...}
# Monitor: Sentry dashboard for database errors (should remain at baseline)
```

**API Service Verification:**
- [ ] Health endpoint returns 200 OK
- [ ] Database status: `"healthy"`
- [ ] No connection pool errors in Sentry
- [ ] Response time <200ms

#### 3.4 Restart Worker Service
```bash
# Graceful restart via Replit (Worker service picks up new DATABASE_URL)
# Via Replit UI:
# 1. Navigate to Deployments > Worker Service
# 2. Click "Restart"
# 3. Wait for status: "Running"

# Verify BullMQ jobs processing
curl -f http://localhost:5000/api/health/readyz | jq '.queues'

# Expected: All queues "active", depth <50
```

**Worker Service Verification:**
- [ ] All 7 queues active (no paused queues)
- [ ] Queue depth remains stable (<50 per queue)
- [ ] Job success rate >95%
- [ ] No BullMQ connection errors in Sentry

---

### Phase 4: Monitoring & Verification (30-Minute Observation Window)

**Goal:** Confirm zero degradation across all services and tenants.

**Duration:** 30 minutes (CRITICAL tier requirement)  
**Impact:** None (monitoring only)

#### 4.1 Health Endpoint Monitoring
```bash
# Poll health endpoint every 30 seconds for 30 minutes
for i in {1..60}; do
  echo "Poll $i/60 - $(date -Iseconds)"
  curl -f http://localhost:5000/api/health/readyz | jq '.database, .queues | length'
  sleep 30
done

# Expected: All polls return "healthy" database status
# Alert if 2+ consecutive failures → trigger rollback
```

#### 4.2 Queue Metrics Snapshot (Pre vs Post)
```bash
# Capture queue metrics snapshot
curl -f http://localhost:5000/api/health/readyz | jq '.queues' > /tmp/queue-metrics-post-rotation.json

# Compare with pre-rotation snapshot
diff /tmp/queue-metrics-pre-rotation.json /tmp/queue-metrics-post-rotation.json

# Expected: No significant depth increase (±20%)
# Alert if queue depth doubles → trigger rollback
```

#### 4.3 Sentry Error Rate Analysis
```bash
# Via Sentry UI:
# 1. Navigate to Issues > Search
# 2. Filter: last 30 minutes, environment:production
# 3. Compare error rate vs 24h baseline
# 4. Focus on: database_connection_error, drizzle_query_error tags

# Threshold: <2x baseline error rate
# Alert if error rate >2x → trigger rollback
```

#### 4.4 User-Facing Latency Check
```bash
# Sample API latency (p95)
curl -w "@curl-format.txt" -o /dev/null -s http://localhost:5000/api/health

# curl-format.txt:
# time_total: %{time_total}\n

# Expected: <200ms (p95)
# Alert if latency >10% regression → investigate (may not trigger immediate rollback)
```

**Monitoring Success Criteria:**
- [ ] Health endpoint: 60/60 polls successful (100% uptime)
- [ ] Queue depth: stable (±20% variance)
- [ ] Sentry error rate: <2x baseline
- [ ] API latency: <10% regression
- [ ] No multi-tenant isolation errors
- [ ] No user-reported issues (check support channels)

**Monitoring Failure → Rollback:**
If any failure threshold exceeded, proceed to **Phase 6: Rollback Procedure**.

---

### Phase 5: Post-Rotation Cleanup

**Goal:** Invalidate old credential, unmute Sentry alerts, document rotation completion.

**Duration:** 5 minutes  
**Impact:** None (old credential already unused)

#### 5.1 Revoke Old Password
```bash
# Old password automatically expires after 30-minute TTL
# Verify revocation via Neon console:
# 1. Navigate to Neon project > Roles
# 2. Confirm only NEW password active for assistos_app_user

# Manual revocation (if TTL expired):
neonctl roles password-reset \
  --project-id assistos-prod-eu-central \
  --role-name assistos_app_user \
  --revoke-old-password
```

#### 5.2 Unmute Sentry Alerts
```bash
# Via Sentry UI:
# 1. Navigate to Alerts > Muted Alerts
# 2. Unmute: "Database Connection Pool Errors"
# 3. Unmute: "Health Check Degraded"
```

#### 5.3 Cleanup Staging Secret
```bash
# Remove staging canary secret
# Via Replit Secrets UI (staging):
# 1. Delete: DATABASE_URL_NEW
```

#### 5.4 Audit Trail Completion
```bash
# Log rotation completion
cat >> docs/rotation-logs/$(date +%Y%m%d)-database-url.md <<EOF
## Rotation Summary

**Status:** SUCCESS  
**Duration:** $(( ($(date +%s) - ROTATION_START_TIME) / 60 )) minutes  
**Health Checks:** 60/60 passed  
**Error Rate:** <2x baseline  
**Queue Depth:** Stable (±15%)  
**Latency Impact:** <5% regression

**Approvals:**
- Platform Lead: [Signature]
- Security Team: [Signature]

**Next Rotation:** $(date -d '+60 days' +%Y-%m-%d)
EOF
```

---

## Phase 6: Rollback Procedure

**Trigger Conditions:**
- [ ] Health check fails 2+ consecutive polls
- [ ] Queue depth doubles (>2x pre-rotation baseline)
- [ ] Canary error rate >5%
- [ ] Sentry error rate >2x baseline
- [ ] Manual escalation (Platform Lead decision)

**RTO:** <5 minutes  
**Impact:** Brief service interruption (service restarts)

### 6.1 Immediate Actions
```bash
# STOP further rollout if mid-deployment
# DO NOT restart Worker service if API rollback in progress

# Alert stakeholders
echo "ROLLBACK INITIATED - DATABASE_URL rotation failed" | mail -s "URGENT: DATABASE_URL Rollback" platform-ops@assistos.com
```

### 6.2 Revert Replit Secret
```bash
# Via Replit Secrets UI (production):
# 1. Edit secret: DATABASE_URL
# 2. Replace with OLD_DATABASE_URL (stored in pre-rotation backup)
# 3. Save changes immediately

# Backup stored at: docs/rotation-logs/$(date +%Y%m%d)-database-url-backup.txt
OLD_DATABASE_URL=$(cat docs/rotation-logs/$(date +%Y%m%d)-database-url-backup.txt)
```

### 6.3 Restart Services (Reverse Order)
```bash
# Restart Worker service FIRST (minimize job failures)
# Via Replit UI:
# 1. Deployments > Worker Service > Restart
# 2. Wait for status: "Running"

# Restart API service
# Via Replit UI:
# 1. Deployments > API Service > Restart
# 2. Wait for status: "Running"
```

### 6.4 Verify Rollback Success
```bash
# Health check
curl -f http://localhost:5000/api/health/readyz

# Expected: {"status":"healthy","database":"healthy",...}

# Queue verification
curl -f http://localhost:5000/api/health/readyz | jq '.queues | length'

# Expected: 7 queues active
```

### 6.5 Revoke New Password (Failed Credential)
```bash
# Revoke new password via Neon CLI
neonctl roles password-reset \
  --project-id assistos-prod-eu-central \
  --role-name assistos_app_user \
  --revoke-new-password
```

### 6.6 Post-Rollback Analysis
```bash
# Capture Sentry error logs
# Via Sentry UI:
# 1. Navigate to Issues
# 2. Filter: last 1 hour, tag:database_connection_error
# 3. Export error stack traces

# Document root cause
cat >> docs/rotation-logs/$(date +%Y%m%d)-database-url.md <<EOF
## Rollback Analysis

**Rollback Reason:** [Describe trigger condition]  
**Error Details:** [Paste Sentry stack traces]  
**Root Cause:** [Analysis]  
**Remediation Plan:** [Next steps]  
**Next Attempt:** [Date after fixes]

**Approvals:**
- Platform Lead: [Signature]
- Security Team: [Signature]
EOF
```

---

## Dual-Control Approvals

**Pre-Rotation Sign-Off:**
- [ ] Platform Team Lead: _________________________ Date: _______
- [ ] Security Team Lead: _________________________ Date: _______

**Post-Rotation Sign-Off:**
- [ ] Platform Team Lead: _________________________ Date: _______
- [ ] Security Team Lead: _________________________ Date: _______

---

## Related Documentation

- **Secrets Inventory:** `docs/secrets-inventory.md` Section 1 (DATABASE_URL detailed profile)
- **Rotation Policy:** `docs/secrets-rotation-policy.md` Section 3.1 (DATABASE_URL rotation schedule)
- **Database Backup Strategy:** `docs/database-backup-strategy.md` (Neon PITR procedures)
- **Database Restore Runbook:** `docs/database-restore-runbook.md` (disaster recovery)
- **Health Service:** `apps/api/services/health.service.ts` (health check implementation)

---

## Emergency Contacts

- **Platform Team Lead:** [Contact Info]  
- **Security Team Lead:** [Contact Info]  
- **Neon Support:** support@neon.tech  
- **PagerDuty:** On-call rotation (24/7)
