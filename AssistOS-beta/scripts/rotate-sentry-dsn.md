# SENTRY_DSN Rotation Workflow

**Document Version:** 1.0.0  
**Last Updated:** November 10, 2025  
**Owner:** Platform Team  
**Classification:** CONFIDENTIAL - Internal Use Only

---

## Overview

**Secret:** `SENTRY_DSN`  
**Risk Tier:** LOW (365-day rotation)  
**Blast Radius:** Monitoring only (no data persistence, can tolerate brief gaps)  
**RTO Target:** <5 minutes  
**Downtime:** Zero (event routing continuity)

**Rotation Frequency:** Every 365 days (annual refresh)  
**Lead Time:** 7 days (coordinate with Platform team)  
**Notification:** Slack #platform-ops (7 days before, 24 hours before, rotation start)

---

## Prerequisites

### Access Requirements
- [ ] Sentry admin access (organization + project settings)
- [ ] Replit Secrets write access (production environment)
- [ ] SSH access to API + Worker services (or Replit workspace access)
- [ ] `sentry-cli` installed and authenticated

### Pre-Rotation Checklist
- [ ] **System Health:** Verify `/api/health/readyz` returns 200 OK
- [ ] **Event Ingestion:** Confirm recent events in Sentry dashboard (last 24h)
- [ ] **Release Tracking:** Document current release version (tagged in Sentry)
- [ ] **Alert Rules:** Verify alert rules active (no muted rules)
- [ ] **Stakeholder Notification:** Platform Team notified 24h prior
- [ ] **Rollback Window:** Identify 1-hour maintenance window (flexible, low-risk)

### Tools Required
```bash
# Install Sentry CLI
npm install -g @sentry/cli

# Authenticate
sentry-cli login

# Verify access
sentry-cli projects list
```

---

## Rotation Steps

### Phase 1: Staged Credential Issuance (Dual-DSN Period)

**Goal:** Generate new DSN while keeping old DSN active (simultaneous event ingestion).

**Duration:** 2 minutes  
**Impact:** None (both DSNs active)

#### 1.1 Create New Client Key (DSN)
```bash
# Via Sentry UI:
# 1. Navigate to Settings > Projects > assistos-prod
# 2. Click "Client Keys (DSN)"
# 3. Click "Create New Key"
# 4. Name: "assistos-prod-rotation-$(date +%Y%m%d)"
# 5. Copy new DSN URL

NEW_SENTRY_DSN="https://NEW_KEY@o123456.ingest.sentry.io/7890123"
```

**Verification:**
```bash
# Test new DSN with sentry-cli
sentry-cli send-event \
  --dsn "$NEW_SENTRY_DSN" \
  --message "SENTRY_DSN rotation canary test" \
  --level info \
  --tag environment:canary

# Expected: Event ID returned
# Example: Event sent successfully (ID: abc123def456)

# Verify event in Sentry UI:
# 1. Navigate to Issues
# 2. Search: "SENTRY_DSN rotation canary test"
# 3. Confirm event visible with tag environment:canary
```

#### 1.2 Store New Credential in Staging
```bash
# Update staging secret (test environment)
# Via Replit Secrets UI:
# 1. Navigate to Secrets tab
# 2. Add new secret: SENTRY_DSN_NEW = <new_dsn_url>
# 3. Keep existing SENTRY_DSN unchanged
```

**Audit Trail:**
```bash
# Log rotation start
echo "$(date -Iseconds) - SENTRY_DSN rotation started - dual-DSN period active" >> docs/rotation-logs/$(date +%Y%m%d)-sentry-dsn.md
```

---

### Phase 2: Canary Validation (Test Event Submission)

**Goal:** Test new DSN with canary event submission from production code.

**Duration:** 3 minutes  
**Impact:** None (canary events isolated)

#### 2.1 Test Event Submission from Code
```bash
# Temporarily update SENTRY_DSN in .env (local test)
export SENTRY_DSN="$NEW_SENTRY_DSN"

# Run health check with new DSN (triggers Sentry init)
curl -f http://localhost:5000/api/health/readyz

# Expected: Health check succeeds, Sentry client initialized

# Test error capture
node -e "
const Sentry = require('@sentry/node');
Sentry.init({ dsn: process.env.SENTRY_DSN });
Sentry.captureMessage('SENTRY_DSN rotation canary - error capture test', 'info');
setTimeout(() => process.exit(0), 2000); // Wait for event flush
"

# Expected: Event sent successfully
```

#### 2.2 Verify Release Health Pipeline
```bash
# Test release tracking with new DSN
export COMMIT_SHA=$(git rev-parse HEAD)
export SERVICE_NAME="api"

node -e "
const Sentry = require('@sentry/node');
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  release: \`\${process.env.SERVICE_NAME}@\${process.env.COMMIT_SHA}\`,
  environment: 'canary'
});
Sentry.captureMessage('Release health canary', 'info');
setTimeout(() => process.exit(0), 2000);
"

# Verify in Sentry UI:
# 1. Navigate to Releases
# 2. Search for: api@<commit_sha>
# 3. Confirm release visible with environment:canary
```

**Canary Success Criteria:**
- [ ] Event submission succeeds (sentry-cli test)
- [ ] Event visible in Sentry dashboard
- [ ] Release tracking works (commit SHA tagged correctly)
- [ ] No error messages in application logs
- [ ] New DSN accepts events from production code

**Canary Failure → Rollback:**
If canary fails, skip to **Phase 5: Rollback Procedure**.

---

### Phase 3: Production Rollout (Update Secret + Restart Services)

**Goal:** Update SENTRY_DSN secret in production, restart services sequentially (API → Worker).

**Duration:** 5 minutes  
**Impact:** Brief monitoring gap (<30s during service restart)

#### 3.1 Mute Alert Rules (Optional)
```bash
# Optional: Mute alert rules if concerned about brief monitoring gap
# Via Sentry UI:
# 1. Navigate to Alerts > Alert Rules
# 2. Mute rule: "Error Rate Spike"
# 3. Duration: 15 minutes
```

#### 3.2 Update Replit Secret (Production)
```bash
# Via Replit Secrets UI:
# 1. Navigate to Secrets tab (production workspace)
# 2. Edit secret: SENTRY_DSN
# 3. Replace value with NEW_SENTRY_DSN
# 4. Save changes

# Verification: Secret updated timestamp should reflect current time
```

#### 3.3 Restart API Service
```bash
# Graceful restart via Replit (API service picks up new SENTRY_DSN)
# Via Replit UI:
# 1. Navigate to Deployments > API Service
# 2. Click "Restart"
# 3. Wait for status: "Running"

# Verify new DSN active (trigger test error)
curl -f http://localhost:5000/api/health/readyz

# Check Sentry UI for recent events (should show new DSN key)
```

**API Service Verification:**
- [ ] Health endpoint returns 200 OK
- [ ] Recent events visible in Sentry (last 5 minutes)
- [ ] Release tracking active (commit SHA tagged)
- [ ] No initialization errors in logs

#### 3.4 Restart Worker Service
```bash
# Graceful restart via Replit (Worker service picks up new SENTRY_DSN)
# Via Replit UI:
# 1. Navigate to Deployments > Worker Service
# 2. Click "Restart"
# 3. Wait for status: "Running"

# Verify worker events captured
# (Wait for next background job execution, check Sentry dashboard)
```

**Worker Service Verification:**
- [ ] Service started successfully
- [ ] Background job events captured in Sentry
- [ ] No initialization errors in logs

---

### Phase 4: Monitoring & Verification (15-Minute Observation Window)

**Goal:** Confirm event ingestion continuity and alert pipeline health.

**Duration:** 15 minutes (LOW tier requirement)  
**Impact:** None (monitoring only)

#### 4.1 Event Ingestion Monitoring
```bash
# Poll Sentry dashboard every 2 minutes for 15 minutes
# Via Sentry UI:
# 1. Navigate to Issues
# 2. Filter: last 15 minutes, environment:production
# 3. Confirm events flowing (at least 1 event per poll)

# Expected: Continuous event stream (no gaps >2 minutes)
```

#### 4.2 Release Health Dashboard Check
```bash
# Via Sentry UI:
# 1. Navigate to Releases
# 2. Select current release: api@<commit_sha>
# 3. Confirm session data flowing
# 4. Verify error tracking active

# Expected: Release health metrics visible (crash rate, session count)
```

#### 4.3 Alert Pipeline Test
```bash
# Trigger test alert (manual error submission)
sentry-cli send-event \
  --dsn "$NEW_SENTRY_DSN" \
  --message "SENTRY_DSN rotation - alert pipeline test" \
  --level error \
  --tag environment:production

# Verify in Sentry UI:
# 1. Navigate to Alerts
# 2. Confirm alert triggered (if threshold exceeded)
# 3. Check notification channels (Slack, Email, PagerDuty)

# Expected: Alert triggered, notifications sent
```

**Monitoring Success Criteria:**
- [ ] Event ingestion continuous (no gaps >2 minutes)
- [ ] Release health metrics visible
- [ ] Alert pipeline active (test alert triggered)
- [ ] No event submission errors in logs
- [ ] Notification channels working (Slack, Email)

**Monitoring Failure → Rollback:**
If event ingestion fails for >5 minutes, proceed to **Phase 5: Rollback Procedure**.

---

### Phase 5: Post-Rotation Cleanup

**Goal:** Revoke old DSN, unmute alerts, document rotation completion.

**Duration:** 3 minutes  
**Impact:** None (old DSN already unused)

#### 5.1 Revoke Old Client Key (DSN)
```bash
# Via Sentry UI:
# 1. Navigate to Settings > Projects > assistos-prod > Client Keys (DSN)
# 2. Select old key (created before rotation)
# 3. Click "Delete"
# 4. Confirm deletion

# Verify old DSN revoked (should fail)
sentry-cli send-event \
  --dsn "$OLD_SENTRY_DSN" \
  --message "Revocation test" \
  --level info

# Expected: Error: 403 Forbidden or Invalid DSN
```

#### 5.2 Unmute Alert Rules
```bash
# Via Sentry UI:
# 1. Navigate to Alerts > Muted Alerts
# 2. Unmute: "Error Rate Spike" (if muted in Phase 3)
```

#### 5.3 Cleanup Staging Secret
```bash
# Remove staging canary secret
# Via Replit Secrets UI (staging):
# 1. Delete: SENTRY_DSN_NEW
```

#### 5.4 Audit Trail Completion
```bash
# Log rotation completion
cat >> docs/rotation-logs/$(date +%Y%m%d)-sentry-dsn.md <<EOF
## Rotation Summary

**Status:** SUCCESS  
**Duration:** $(( ($(date +%s) - ROTATION_START_TIME) / 60 )) minutes  
**Event Ingestion:** Continuous (no gaps)  
**Alert Pipeline:** Active  
**Release Tracking:** Verified

**Approvals:**
- Platform Lead: [Signature]

**Next Rotation:** $(date -d '+365 days' +%Y-%m-%d)
EOF
```

---

## Phase 6: Rollback Procedure

**Trigger Conditions:**
- [ ] Event ingestion fails for >5 minutes
- [ ] Canary error rate >5%
- [ ] Alert pipeline broken (no notifications)
- [ ] Manual escalation (Platform Lead decision)

**RTO:** <5 minutes  
**Impact:** Brief monitoring gap (service restarts)

### 6.1 Immediate Actions
```bash
# Alert stakeholders
echo "ROLLBACK INITIATED - SENTRY_DSN rotation failed" | mail -s "URGENT: SENTRY_DSN Rollback" platform-ops@assistos.com
```

### 6.2 Revert Replit Secret
```bash
# Via Replit Secrets UI (production):
# 1. Edit secret: SENTRY_DSN
# 2. Replace with OLD_SENTRY_DSN (stored in pre-rotation backup)
# 3. Save changes immediately

# Backup stored at: docs/rotation-logs/$(date +%Y%m%d)-sentry-dsn-backup.txt
OLD_SENTRY_DSN=$(cat docs/rotation-logs/$(date +%Y%m%d)-sentry-dsn-backup.txt)
```

### 6.3 Restart Services
```bash
# Restart API service
# Via Replit UI:
# 1. Deployments > API Service > Restart
# 2. Wait for status: "Running"

# Restart Worker service
# Via Replit UI:
# 1. Deployments > Worker Service > Restart
# 2. Wait for status: "Running"
```

### 6.4 Verify Rollback Success
```bash
# Test event submission with old DSN
sentry-cli send-event \
  --dsn "$OLD_SENTRY_DSN" \
  --message "Rollback verification test" \
  --level info

# Expected: Event sent successfully

# Verify in Sentry UI:
# 1. Navigate to Issues
# 2. Search: "Rollback verification test"
# 3. Confirm event visible
```

### 6.5 Revoke New DSN (Failed Credential)
```bash
# Via Sentry UI:
# 1. Navigate to Settings > Projects > assistos-prod > Client Keys (DSN)
# 2. Select new key (created during rotation)
# 3. Click "Delete"
# 4. Confirm deletion
```

### 6.6 Post-Rollback Analysis
```bash
# Document root cause
cat >> docs/rotation-logs/$(date +%Y%m%d)-sentry-dsn.md <<EOF
## Rollback Analysis

**Rollback Reason:** [Describe trigger condition]  
**Error Details:** [Paste error messages]  
**Root Cause:** [Analysis]  
**Remediation Plan:** [Next steps]  
**Next Attempt:** [Date after fixes]

**Approvals:**
- Platform Lead: [Signature]
EOF
```

---

## Dual-Control Approvals

**Pre-Rotation Sign-Off:**
- [ ] Platform Team Lead: _________________________ Date: _______

**Post-Rotation Sign-Off:**
- [ ] Platform Team Lead: _________________________ Date: _______

---

## Related Documentation

- **Secrets Inventory:** `docs/secrets-inventory.md` Section 22 (SENTRY_DSN detailed profile)
- **Rotation Policy:** `docs/secrets-rotation-policy.md` Section 3.10 (SENTRY_DSN rotation schedule)
- **Sentry Alert Catalog:** `docs/sentry-alert-catalog.md` (alert rules and escalation)

---

## Emergency Contacts

- **Platform Team Lead:** [Contact Info]  
- **Sentry Support:** support@sentry.io  
- **PagerDuty:** On-call rotation (24/7)
