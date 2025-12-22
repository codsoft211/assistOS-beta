# REDIS_URL Rotation Workflow (Upstash Redis)

**Document Version:** 1.0.0  
**Last Updated:** November 10, 2025  
**Owner:** Platform Team  
**Classification:** CONFIDENTIAL - Internal Use Only

---

## Overview

**Secret:** `REDIS_URL`  
**Risk Tier:** CRITICAL (60-day rotation)  
**Blast Radius:** BullMQ queues (7 queues + DLQ), session persistence, multi-tenancy isolation  
**RTO Target:** <5 minutes  
**Downtime:** Zero (dual-token approach with queue quiesce)

**Rotation Frequency:** Every 60 days (infrastructure credential best practice)  
**Lead Time:** 7 days (coordinate with Platform + Backend teams)  
**Notification:** Slack #platform-ops, PagerDuty (7 days before, 24 hours before, rotation start)

---

## Prerequisites

### Access Requirements
- [ ] Upstash Redis owner access (production database)
- [ ] Replit Secrets write access (production environment)
- [ ] SSH access to API + Worker services (or Replit workspace access)
- [ ] Sentry admin access (for alert mute window)

### Pre-Rotation Checklist
- [ ] **System Health:** Verify `/api/health/readyz` returns 200 OK
- [ ] **Queue Metrics:** Confirm queue depth <50 for all 7 queues
- [ ] **Active Jobs:** Document in-flight job count (target: <10 active jobs)
- [ ] **Session Count:** Document active session count
- [ ] **Sentry Baseline:** Record current error rate (target: <2x during rotation)
- [ ] **Namespace Verification:** Confirm multi-tenant namespaces isolated
- [ ] **Stakeholder Notification:** Platform Team + Backend Team notified 24h prior
- [ ] **Rollback Window:** Identify 2-hour maintenance window (low traffic period)

### Tools Required
```bash
# Install Redis CLI (optional, for manual verification)
brew install redis  # macOS
# OR apt-get install redis-tools  # Linux

# Verify Upstash connection
redis-cli -u "$REDIS_URL" PING
# Expected: PONG
```

---

## Rotation Steps

### Phase 1: Staged Credential Issuance (Dual-Token Period)

**Goal:** Generate new Redis token while keeping old token active (simultaneous connections).

**Duration:** 5 minutes  
**Impact:** None (both tokens active)

#### 1.1 Generate New Token
```bash
# Via Upstash Console:
# 1. Navigate to Redis database > Security tab
# 2. Click "Create Token"
# 3. Name: "assistos-prod-rotation-$(date +%Y%m%d)"
# 4. Permissions: Read + Write (full access)
# 5. Copy new token URL

NEW_REDIS_URL="rediss://default:NEW_TOKEN@upstash-hostname.upstash.io:6379"
```

**Verification:**
```bash
# Test new token connection
redis-cli -u "$NEW_REDIS_URL" PING

# Expected: PONG

# Test namespace scan (verify multi-tenant isolation preserved)
redis-cli -u "$NEW_REDIS_URL" SCAN 0 MATCH "tenant:*" COUNT 10

# Expected: Tenant namespace keys returned
```

#### 1.2 Store New Credential in Staging
```bash
# Update staging secret (test environment)
# Via Replit Secrets UI:
# 1. Navigate to Secrets tab
# 2. Add new secret: REDIS_URL_NEW = <new_token_url>
# 3. Keep existing REDIS_URL unchanged
```

**Audit Trail:**
```bash
# Log rotation start
echo "$(date -Iseconds) - REDIS_URL rotation started - dual-token period active" >> docs/rotation-logs/$(date +%Y%m%d)-redis-url.md
```

---

### Phase 2: Queue Quiesce (Drain In-Flight Jobs)

**Goal:** Pause BullMQ workers and drain in-flight jobs before switching Redis credential.

**Duration:** 5 minutes  
**Impact:** Job processing paused (new jobs queued, not processed)

#### 2.1 Capture Pre-Rotation Queue Snapshot
```bash
# Capture queue metrics BEFORE quiesce
curl -f http://localhost:5000/api/health/readyz | jq '.queues' > /tmp/queue-metrics-pre-rotation.json

# Document in-flight jobs
cat /tmp/queue-metrics-pre-rotation.json | jq '.[] | select(.active > 0)'

# Expected: List of queues with active jobs
```

#### 2.2 Pause All Workers
```bash
# Pause BullMQ workers via API (if pause endpoint exists)
# OR manually via Replit UI:
# 1. Navigate to Deployments > Worker Service
# 2. Stop Worker service
# 3. Wait for status: "Stopped"

# Verify workers paused
curl -f http://localhost:5000/api/health/readyz | jq '.queues[] | .active'

# Expected: All queues show 0 active jobs (workers stopped)
```

#### 2.3 Wait for Job Drain (Max 5 Minutes)
```bash
# Poll queue depth every 10 seconds until active jobs = 0
for i in {1..30}; do
  ACTIVE_JOBS=$(curl -s http://localhost:5000/api/health/readyz | jq '[.queues[] | .active] | add')
  echo "Poll $i/30 - Active jobs: $ACTIVE_JOBS - $(date -Iseconds)"
  
  if [ "$ACTIVE_JOBS" -eq 0 ]; then
    echo "All jobs drained successfully"
    break
  fi
  
  sleep 10
done

# Alert if active jobs remain after 5 minutes
if [ "$ACTIVE_JOBS" -gt 0 ]; then
  echo "WARNING: Jobs still active after 5 minutes - manual intervention required"
fi
```

---

### Phase 3: Canary Validation (Namespace Diff Check)

**Goal:** Test new Redis token with canary worker running queue-monitor snapshot.

**Duration:** 3 minutes  
**Impact:** None (canary worker isolated from production)

#### 3.1 Test New Token with Canary Worker
```bash
# Temporarily update REDIS_URL in .env (local test)
export REDIS_URL="$NEW_REDIS_URL"

# Run queue-monitor service with new credential
node -e "
const { queueMonitorService } = require('./apps/api/services/queue-monitor.service');
queueMonitorService.collectMetrics().then(() => {
  console.log('Canary: queue-monitor succeeded with new REDIS_URL');
  process.exit(0);
}).catch(err => {
  console.error('Canary FAILED:', err);
  process.exit(1);
});
"

# Expected: "Canary: queue-monitor succeeded with new REDIS_URL"
```

#### 3.2 Verify Namespace Isolation
```bash
# Scan tenant namespaces with new token
redis-cli -u "$NEW_REDIS_URL" --scan --pattern "tenant:*" | head -10

# Expected: Tenant namespace keys visible (confirms isolation preserved)

# Compare namespace count OLD vs NEW
OLD_COUNT=$(redis-cli -u "$REDIS_URL" KEYS "tenant:*" | wc -l)
NEW_COUNT=$(redis-cli -u "$NEW_REDIS_URL" KEYS "tenant:*" | wc -l)

echo "Namespace count - OLD: $OLD_COUNT, NEW: $NEW_COUNT"

# Expected: Counts match (no namespace loss)
```

**Canary Success Criteria:**
- [ ] PING command returns PONG
- [ ] Queue-monitor service connects successfully
- [ ] Namespace keys accessible
- [ ] Namespace count matches old token
- [ ] No errors in Sentry (zero events tagged `redis_connection_error`)

**Canary Failure → Rollback:**
If canary fails, skip to **Phase 6: Rollback Procedure**.

---

### Phase 4: Production Rollout (Update Secret + Resume Workers)

**Goal:** Update REDIS_URL secret in production, restart services sequentially (API → Worker).

**Duration:** 10 minutes  
**Impact:** Brief service interruptions (<30s per service during restart)

#### 4.1 Mute Sentry Alerts
```bash
# Mute Redis connection alerts for 30 minutes
# Via Sentry UI:
# 1. Navigate to Alerts > Alert Rules
# 2. Mute rule: "Redis Connection Errors"
# 3. Mute rule: "BullMQ Queue Stalled"
# 4. Duration: 30 minutes
```

#### 4.2 Update Replit Secret (Production)
```bash
# Via Replit Secrets UI:
# 1. Navigate to Secrets tab (production workspace)
# 2. Edit secret: REDIS_URL
# 3. Replace value with NEW_REDIS_URL
# 4. Save changes

# Verification: Secret updated timestamp should reflect current time
```

#### 4.3 Restart API Service
```bash
# Graceful restart via Replit (API service picks up new REDIS_URL)
# Via Replit UI:
# 1. Navigate to Deployments > API Service
# 2. Click "Restart"
# 3. Wait for status: "Running"

# Verify new connection
curl -f http://localhost:5000/api/health/readyz | jq '.redis'

# Expected: {"status":"healthy","latency_p75_ms":10,"latency_p95_ms":15}
```

**API Service Verification:**
- [ ] Health endpoint returns 200 OK
- [ ] Redis status: `"healthy"`
- [ ] Redis latency <50ms (p95)
- [ ] No connection errors in Sentry

#### 4.4 Restart Worker Service (Resume Job Processing)
```bash
# Start Worker service via Replit UI:
# 1. Navigate to Deployments > Worker Service
# 2. Click "Start"
# 3. Wait for status: "Running"

# Verify BullMQ workers resumed
curl -f http://localhost:5000/api/health/readyz | jq '.queues[] | .name, .active'

# Expected: Queues processing jobs (active > 0 for queues with waiting jobs)
```

**Worker Service Verification:**
- [ ] All 7 queues active (no paused queues)
- [ ] Jobs processing (waiting count decreasing)
- [ ] Job success rate >95%
- [ ] No BullMQ connection errors in Sentry

---

### Phase 5: Monitoring & Verification (30-Minute Observation Window)

**Goal:** Confirm zero degradation across all services, queues, and sessions.

**Duration:** 30 minutes (CRITICAL tier requirement)  
**Impact:** None (monitoring only)

#### 5.1 Health Endpoint Monitoring
```bash
# Poll health endpoint every 30 seconds for 30 minutes
for i in {1..60}; do
  echo "Poll $i/60 - $(date -Iseconds)"
  curl -f http://localhost:5000/api/health/readyz | jq '.redis.status, .queues | length'
  sleep 30
done

# Expected: All polls return "healthy" Redis status
# Alert if 2+ consecutive failures → trigger rollback
```

#### 5.2 Queue Metrics Snapshot (Pre vs Post)
```bash
# Capture queue metrics snapshot
curl -f http://localhost:5000/api/health/readyz | jq '.queues' > /tmp/queue-metrics-post-rotation.json

# Compare with pre-rotation snapshot
diff /tmp/queue-metrics-pre-rotation.json /tmp/queue-metrics-post-rotation.json

# Expected: Queue depth stable or decreasing (jobs processing)
# Alert if queue depth doubles → trigger rollback
```

#### 5.3 Session Persistence Check
```bash
# Test session persistence (login + verify session cookie)
# Via Playwright or manual browser test:
# 1. Login to application
# 2. Verify session cookie present
# 3. Refresh page - confirm user still logged in
# 4. No re-authentication required

# Expected: Sessions persist across Redis credential change
```

#### 5.4 Sentry Error Rate Analysis
```bash
# Via Sentry UI:
# 1. Navigate to Issues > Search
# 2. Filter: last 30 minutes, environment:production
# 3. Compare error rate vs 24h baseline
# 4. Focus on: redis_connection_error, bullmq_job_failed tags

# Threshold: <2x baseline error rate
# Alert if error rate >2x → trigger rollback
```

**Monitoring Success Criteria:**
- [ ] Health endpoint: 60/60 polls successful (100% uptime)
- [ ] Redis latency: <50ms (p95)
- [ ] Queue depth: stable or decreasing
- [ ] Job success rate: >95%
- [ ] Session persistence: 100% (no re-authentication required)
- [ ] Sentry error rate: <2x baseline
- [ ] No multi-tenant namespace errors

**Monitoring Failure → Rollback:**
If any failure threshold exceeded, proceed to **Phase 6: Rollback Procedure**.

---

### Phase 6: Post-Rotation Cleanup

**Goal:** Revoke old token, unmute Sentry alerts, document rotation completion.

**Duration:** 5 minutes  
**Impact:** None (old token already unused)

#### 6.1 Revoke Old Token
```bash
# Via Upstash Console:
# 1. Navigate to Redis database > Security tab
# 2. Select old token (created before rotation)
# 3. Click "Delete Token"
# 4. Confirm deletion

# Verify old token revoked (should fail)
redis-cli -u "$REDIS_URL" PING
# Expected: Connection refused or authentication error
```

#### 6.2 Unmute Sentry Alerts
```bash
# Via Sentry UI:
# 1. Navigate to Alerts > Muted Alerts
# 2. Unmute: "Redis Connection Errors"
# 3. Unmute: "BullMQ Queue Stalled"
```

#### 6.3 Cleanup Staging Secret
```bash
# Remove staging canary secret
# Via Replit Secrets UI (staging):
# 1. Delete: REDIS_URL_NEW
```

#### 6.4 Audit Trail Completion
```bash
# Log rotation completion
cat >> docs/rotation-logs/$(date +%Y%m%d)-redis-url.md <<EOF
## Rotation Summary

**Status:** SUCCESS  
**Duration:** $(( ($(date +%s) - ROTATION_START_TIME) / 60 )) minutes  
**Health Checks:** 60/60 passed  
**Queue Metrics:** Stable (±10%)  
**Session Persistence:** 100%  
**Error Rate:** <2x baseline

**Approvals:**
- Platform Lead: [Signature]
- Backend Lead: [Signature]

**Next Rotation:** $(date -d '+60 days' +%Y-%m-%d)
EOF
```

---

## Phase 7: Rollback Procedure

**Trigger Conditions:**
- [ ] Health check fails 2+ consecutive polls
- [ ] Queue depth doubles (>2x pre-rotation baseline)
- [ ] Canary error rate >5%
- [ ] Sentry error rate >2x baseline
- [ ] Session persistence failure (users logged out)
- [ ] Manual escalation (Platform Lead decision)

**RTO:** <5 minutes  
**Impact:** Brief service interruption (service restarts)

### 7.1 Immediate Actions
```bash
# STOP further rollout if mid-deployment
# DO NOT resume Worker service if API rollback in progress

# Alert stakeholders
echo "ROLLBACK INITIATED - REDIS_URL rotation failed" | mail -s "URGENT: REDIS_URL Rollback" platform-ops@assistos.com
```

### 7.2 Revert Replit Secret
```bash
# Via Replit Secrets UI (production):
# 1. Edit secret: REDIS_URL
# 2. Replace with OLD_REDIS_URL (stored in pre-rotation backup)
# 3. Save changes immediately

# Backup stored at: docs/rotation-logs/$(date +%Y%m%d)-redis-url-backup.txt
OLD_REDIS_URL=$(cat docs/rotation-logs/$(date +%Y%m%d)-redis-url-backup.txt)
```

### 7.3 Restart Services (Reverse Order)
```bash
# Restart API service FIRST (restore session access)
# Via Replit UI:
# 1. Deployments > API Service > Restart
# 2. Wait for status: "Running"

# Restart Worker service
# Via Replit UI:
# 1. Deployments > Worker Service > Restart
# 2. Wait for status: "Running"
```

### 7.4 Verify Rollback Success
```bash
# Health check
curl -f http://localhost:5000/api/health/readyz | jq '.redis.status'

# Expected: "healthy"

# Queue verification
curl -f http://localhost:5000/api/health/readyz | jq '.queues | length'

# Expected: 7 queues active
```

### 7.5 Revoke New Token (Failed Credential)
```bash
# Via Upstash Console:
# 1. Navigate to Redis database > Security tab
# 2. Select new token (created during rotation)
# 3. Click "Delete Token"
# 4. Confirm deletion
```

### 7.6 Resume Workers from Previous Snapshot
```bash
# Resume BullMQ workers
# Via Replit UI:
# 1. Deployments > Worker Service > Start
# 2. Wait for queues to resume processing
# 3. Monitor queue depth (should decrease)
```

### 7.7 Post-Rollback Analysis
```bash
# Capture Sentry error logs
# Via Sentry UI:
# 1. Navigate to Issues
# 2. Filter: last 1 hour, tag:redis_connection_error
# 3. Export error stack traces

# Document root cause
cat >> docs/rotation-logs/$(date +%Y%m%d)-redis-url.md <<EOF
## Rollback Analysis

**Rollback Reason:** [Describe trigger condition]  
**Error Details:** [Paste Sentry stack traces]  
**Root Cause:** [Analysis]  
**Remediation Plan:** [Next steps]  
**Next Attempt:** [Date after fixes]

**Approvals:**
- Platform Lead: [Signature]
- Backend Lead: [Signature]
EOF
```

---

## Dual-Control Approvals

**Pre-Rotation Sign-Off:**
- [ ] Platform Team Lead: _________________________ Date: _______
- [ ] Backend Team Lead: _________________________ Date: _______

**Post-Rotation Sign-Off:**
- [ ] Platform Team Lead: _________________________ Date: _______
- [ ] Backend Team Lead: _________________________ Date: _______

---

## Related Documentation

- **Secrets Inventory:** `docs/secrets-inventory.md` Section 2 (REDIS_URL detailed profile)
- **Rotation Policy:** `docs/secrets-rotation-policy.md` Section 3.2 (REDIS_URL rotation schedule)
- **Queue Monitor Service:** `apps/api/services/queue-monitor.service.ts` (queue metrics)
- **Health Service:** `apps/api/services/health.service.ts` (Redis health check)

---

## Emergency Contacts

- **Platform Team Lead:** [Contact Info]  
- **Backend Team Lead:** [Contact Info]  
- **Upstash Support:** support@upstash.com  
- **PagerDuty:** On-call rotation (24/7)
