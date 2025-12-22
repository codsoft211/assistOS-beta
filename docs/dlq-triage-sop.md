# Dead Letter Queue (DLQ) Triage Playbook

**Document Version:** 1.0.0  
**Last Updated:** November 10, 2025  
**Owner:** Backend Team  
**Classification:** CONFIDENTIAL - Internal Use Only

---

## Purpose

This Standard Operating Procedure (SOP) provides a systematic framework for **investigating and resolving jobs that fail permanently** and land in the Dead Letter Queue (DLQ).

**DLQ System:** BullMQ jobs that exhaust all retry attempts (max 3 attempts, exponential backoff) are automatically moved to the DLQ for manual investigation. This prevents failed jobs from blocking queue processing while preserving job data for root cause analysis.

**Goals:**
1. **Rapid Triage:** Identify root cause of job failures within 30 minutes
2. **Data Recovery:** Determine if failed jobs can be retried safely or require manual intervention
3. **Pattern Detection:** Surface systemic issues (API outages, schema changes, data corruption)
4. **Continuous Improvement:** Document root causes and implement preventive measures

**Target Metrics:**
- **Triage Time:** <30 minutes per DLQ job (investigation + resolution)
- **Recovery Rate:** >80% of DLQ jobs successfully retried or manually fixed
- **Recurrence Prevention:** <10% of DLQ jobs are repeat failures (same root cause)

---

## DLQ System Overview

### Architecture

**DLQ Queue:** `dlq` (managed by `apps/worker/queues/dlq.ts`)

**Automatic DLQ Movement:**
Jobs are moved to DLQ when:
- Max retry attempts exhausted (3 attempts with exponential backoff: 30s, 5min, 30min)
- Job execution exceeds timeout threshold (varies by queue type)
- Permanent error detected (e.g., validation failure, missing required data)

**Job Metadata Preserved:**
- Original queue name (`metadata.originalQueue`)
- Original job ID (`metadata.originalJobId`)
- Failure timestamp (`metadata.failedAt`)
- Error stack trace (`metadata.error`)
- Retry attempts count (`metadata.attempts`)
- Tenant ID (`metadata.tenantId`)
- User ID (`metadata.userId`)

**Monitoring Integration:**
- **Queue Monitor Service:** `apps/api/services/queue-monitor.service.ts` tracks DLQ depth, emits Sentry alerts when depth exceeds thresholds (warning: ≥10, critical: ≥50)
- **Health Endpoints:** `/api/health/readyz` exposes DLQ metrics (depth, oldest job timestamp)
- **Sentry Alerts:** Alert rule "DLQ Depth Critical" triggers PagerDuty escalation when depth ≥50

---

## Investigation Workflow

### Phase 1: Alert Response (0-5 Minutes)

#### 1.1 Alert Received
**Trigger:** Sentry alert "DLQ Depth Warning" (≥10 jobs) OR "DLQ Depth Critical" (≥50 jobs)

**Immediate Actions:**
- [ ] **Acknowledge Alert:** Acknowledge Sentry alert in PagerDuty (prevents duplicate escalations)
- [ ] **Check DLQ Depth:** Verify current DLQ depth via health endpoint:
  ```bash
  curl -f http://localhost:5000/api/health/readyz | jq '.queues[] | select(.name=="dlq")'
  
  # Expected output:
  # {
  #   "name": "dlq",
  #   "active": 0,
  #   "waiting": 15,
  #   "depth": 15,
  #   "success_rate": null
  # }
  ```
- [ ] **Assess Severity:**
  - **Low (10-19 jobs):** Investigate within 30 minutes (triage target), prioritize during business hours if off-hours
  - **Medium (20-49 jobs):** Investigate within 1 hour, may indicate systemic issue
  - **High (≥50 jobs):** Immediate investigation required (within 15 minutes), likely service outage or data corruption

#### 1.2 Initial Triage
**Goal:** Identify if this is an isolated incident or systemic failure

**Data Sources:**
- **Sentry Events:** Check recent error events (last 1 hour) for spike in job failures
  - Navigate to: Sentry > Issues > Search: `tag:bullmq_job_failed`
  - Look for patterns: same error message, same queue, same tenant
- **Queue Monitor Metrics:** Check queue metrics snapshot for correlated issues
  ```bash
  curl -f http://localhost:5000/api/health/readyz | jq '.queues'
  
  # Look for:
  # - Multiple queues with high depth (systemic issue)
  # - Single queue with high depth (queue-specific issue)
  # - Low success_rate across queues (infrastructure problem)
  ```
- **Health Dashboard:** Verify database, Redis, external API health
  ```bash
  curl -f http://localhost:5000/api/health/readyz | jq '.database, .redis'
  
  # Healthy status expected:
  # "database": {"status": "healthy"}
  # "redis": {"status": "healthy"}
  ```

**Triage Decision:**
- **Isolated Incident:** 1-5 jobs in DLQ, no pattern, investigate individual jobs
- **Systemic Failure:** 10+ jobs in DLQ, same error pattern, escalate to Phase 2

---

### Phase 2: Root Cause Analysis (5-20 Minutes)

#### 2.1 Sample DLQ Jobs
**Goal:** Retrieve job data from DLQ for analysis

**Access DLQ via BullMQ Dashboard (if available):**
- Navigate to: BullMQ Dashboard > DLQ Queue
- Sort by: Failed timestamp (descending, newest first)
- Sample 3-5 recent jobs for analysis

**Alternative: Direct Redis Access (if BullMQ Dashboard unavailable):**
```bash
# List DLQ jobs (Redis CLI)
redis-cli -u "$REDIS_URL" LRANGE bull:dlq:wait 0 4

# Get job details
redis-cli -u "$REDIS_URL" HGETALL bull:dlq:<job_id>
```

**Data to Capture (Use Template Below):**
- Job ID, Original Queue, Tenant ID, User ID
- Error message, Stack trace
- Job payload (input data)
- Failure timestamp, Retry attempts

#### 2.2 Error Pattern Analysis
**Goal:** Categorize failure root cause

**Common Error Patterns:**

| Error Pattern | Root Cause | Resolution |
|---------------|------------|------------|
| `ECONNREFUSED` | External API unavailable (e.g., OpenAI, Moloni) | Wait for API recovery, retry jobs |
| `timeout` | Job execution exceeded timeout (e.g., large document processing) | Increase timeout OR split job into smaller tasks |
| `ValidationError` | Invalid job payload (e.g., missing required field) | Fix data source, manual intervention required |
| `DatabaseError: duplicate key` | Concurrent job execution (race condition) | Safe to retry (idempotency check) |
| `DatabaseError: foreign key constraint` | Missing related entity (e.g., tenant deleted) | Cannot retry, requires manual data fix |
| `RateLimitError` | API rate limit exceeded (e.g., OpenAI 3500 req/min) | Implement backoff, reduce job concurrency |
| `401 Unauthorized` | Expired API credentials (e.g., Google OAuth token expired) | Refresh credentials, retry jobs |
| `OutOfMemoryError` | Worker OOM (job payload too large) | Optimize job payload size, increase worker memory |

**Pattern Detection Checklist:**
- [ ] **Same Error Across Multiple Jobs:** Systemic issue (e.g., API outage)
- [ ] **Same Tenant Across Multiple Jobs:** Tenant-specific issue (e.g., invalid configuration)
- [ ] **Same Queue Across Multiple Jobs:** Queue-specific issue (e.g., worker configuration)
- [ ] **Time-Based Pattern:** Jobs failed during specific time window (e.g., 2-4 AM UTC = external maintenance)

#### 2.3 Sentry Error Investigation
**Goal:** Leverage Sentry stack traces for deeper analysis

**Steps:**
1. Navigate to: Sentry > Issues > Search: `tag:bullmq_job_failed`
2. Filter by: Last 1 hour (or time window of DLQ spike)
3. Group by: Error message (identify most frequent errors)
4. Select top error, analyze:
   - **Stack Trace:** Identify failing line of code
   - **Breadcrumbs:** Review request context (tenant, user, environment)
   - **Tags:** `queue_name`, `tenant_id`, `user_id`, `environment`
5. Check for related issues: Link to GitHub issues, Slack threads

**Sentry Integration:**
- DLQ jobs automatically tagged: `dlq_job: true`
- Error events include metadata: `originalQueue`, `originalJobId`, `tenantId`
- Alert rule: "DLQ Depth Critical" references this SOP for investigation steps

---

### Phase 3: Resolution (20-30 Minutes)

#### 3.1 Resolution Decision Tree

**Decision 1: Can Jobs Be Retried Safely?**

**YES → Proceed to 3.2 (Retry Jobs)**
- Error is transient (API outage recovered)
- External dependency now available
- Rate limit window reset
- Credentials refreshed

**NO → Proceed to 3.3 (Manual Intervention)**
- Data corruption detected
- Invalid job payload (missing required fields)
- Business logic changed (job no longer valid)
- Duplicate key errors (job already processed)

**UNKNOWN → Escalate to Backend Lead**
- Root cause unclear after 20 minutes investigation
- Systemic issue affecting multiple queues
- Suspected security breach (e.g., unauthorized API access)

#### 3.2 Retry Jobs (If Safe)
**Goal:** Move jobs from DLQ back to original queue for reprocessing

**Retry Methods:**

**Option A: Bulk Retry (All DLQ Jobs)**
```bash
# Use DLQ operational tooling (see scripts/dlq-triage-workbench.md)
# WARNING: Only retry if root cause resolved (e.g., API back online)
npx tsx scripts/dlq-retry-all.js --dry-run

# Review jobs to be retried, confirm safe
# Execute retry
npx tsx scripts/dlq-retry-all.js --execute

# Expected: Jobs moved from DLQ back to original queues
```

**Option B: Selective Retry (By Error Pattern)**
```bash
# Retry only jobs with specific error pattern (e.g., ECONNREFUSED)
npx tsx scripts/dlq-retry-filtered.js \
  --error-pattern "ECONNREFUSED" \
  --dry-run

# Review filtered jobs
# Execute retry
npx tsx scripts/dlq-retry-filtered.js \
  --error-pattern "ECONNREFUSED" \
  --execute
```

**Option C: Manual Retry (Single Job)**
```bash
# Retry single DLQ job by ID (for testing)
npx tsx scripts/dlq-retry-job.js --job-id <job_id>
```

**Post-Retry Monitoring:**
- [ ] Monitor queue depth (should decrease as jobs process)
  ```bash
  watch -n 10 "curl -s http://localhost:5000/api/health/readyz | jq '.queues'"
  ```
- [ ] Monitor Sentry for new errors (job failures recurring?)
- [ ] Verify DLQ depth returns to <10 within 30 minutes

#### 3.3 Manual Intervention (If Retry Unsafe)
**Goal:** Document jobs requiring manual fixes, prevent recurrence

**Manual Resolution Steps:**

**Step 1: Tag DLQ Jobs as "Manual Review Required"**
```bash
# Tag jobs in DLQ for manual review (prevents accidental retry)
npx tsx scripts/dlq-tag-jobs.js \
  --tag "manual_review_required" \
  --job-ids <job_id_1>,<job_id_2>,<job_id_3>
```

**Step 2: Extract Job Data for Manual Processing**
```bash
# Export DLQ job data to CSV for manual analysis
npx tsx scripts/dlq-export-jobs.js \
  --output /tmp/dlq-manual-review-$(date +%Y%m%d).csv

# Review CSV: job_id, original_queue, tenant_id, error, payload
```

**Step 3: Manual Data Fixes**
- **Invalid Payload:** Contact tenant, request corrected data, resubmit job manually
- **Data Corruption:** Restore data from database backup (see `docs/database-restore-runbook.md`)
- **Business Logic Change:** Update job processor code, deploy fix, retry jobs

**Step 4: Discard Jobs (If Unrecoverable)**
```bash
# Discard jobs that cannot be retried or fixed (e.g., duplicate processing)
npx tsx scripts/dlq-discard-jobs.js \
  --job-ids <job_id_1>,<job_id_2> \
  --reason "Duplicate processing detected, original job succeeded"

# Jobs removed from DLQ, logged to Sentry for audit trail
```

**Audit Trail:**
All manual interventions logged to Sentry:
- Event: `dlq.manual_intervention`
- Context: `job_ids`, `action` (retry/discard/manual_fix), `reason`, `operator`

---

### Phase 4: Escalation (If Required)

#### 4.1 Escalation Triggers

**Escalate to Backend Lead:**
- [ ] Root cause unclear after 30 minutes investigation
- [ ] DLQ depth continues growing (>10 new jobs/hour)
- [ ] Suspected code bug in job processor (requires code changes)
- [ ] Multiple queues affected (systemic issue)

**Escalate to Platform Team:**
- [ ] Infrastructure issue detected (database connection pool exhausted, Redis memory full)
- [ ] External API outage confirmed (OpenAI, Moloni, Google) requiring vendor escalation
- [ ] Rate limit issues requiring quota increase

**Escalate to Security Team:**
- [ ] Suspected data breach (unauthorized API access, sensitive data exposure)
- [ ] Malicious job payloads detected (SQL injection, XSS attempts)
- [ ] Credential compromise suspected (401 errors across multiple tenants)

#### 4.2 Escalation Procedure

**Step 1: Gather Escalation Data Package**
- [ ] **DLQ Snapshot:** Current depth, sample jobs (3-5 examples)
- [ ] **Sentry Error Report:** Top 5 error patterns (screenshot or export)
- [ ] **Queue Metrics:** Health endpoint output (before/after DLQ spike)
- [ ] **Timeline:** When DLQ spike started, duration, rate of new failures
- [ ] **Suspected Root Cause:** Your hypothesis (even if unconfirmed)

**Step 2: Create Escalation Ticket**
```markdown
# DLQ Escalation - [Date] - [Root Cause Hypothesis]

**Severity:** [LOW / MEDIUM / HIGH / CRITICAL]  
**DLQ Depth:** [X jobs]  
**Affected Queues:** [invoice-processing, ai-tasks, ...]  
**Started:** [YYYY-MM-DD HH:MM UTC]  
**Duration:** [X hours]

## Summary
[2-3 sentence description of issue]

## Error Pattern
[Most common error message, frequency]

## Sample Jobs
- Job ID: [xxx], Queue: [invoice-processing], Error: [ECONNREFUSED]
- Job ID: [yyy], Queue: [ai-tasks], Error: [timeout]

## Investigation So Far
[What you've checked, what you've ruled out]

## Suspected Root Cause
[Your hypothesis]

## Recommended Next Steps
[What should be done next?]

## Attachments
- DLQ Snapshot: /tmp/dlq-snapshot-[date].json
- Sentry Report: [Link to Sentry issue]
- Queue Metrics: /tmp/queue-metrics-[date].json
```

**Step 3: Notify Escalation Channel**
- **Slack:** Post in `#backend-team` (Backend Lead) OR `#platform-ops` (Platform Team)
- **PagerDuty:** Escalate via Sentry alert (for CRITICAL severity only)
- **Email:** Send escalation ticket to team lead (for LOW/MEDIUM severity)

**Step 4: Handoff to Escalation Owner**
- [ ] Confirm escalation received (Slack acknowledgment)
- [ ] Provide access to DLQ data (share credentials if needed)
- [ ] Remain available for questions (30-minute handoff window)

---

## Data Capture Templates

### Template 1: DLQ Job Analysis Form

**File:** `/tmp/dlq-job-analysis-[job_id].md`

```markdown
# DLQ Job Analysis - Job ID: [xxx]

**Captured:** [YYYY-MM-DD HH:MM UTC]  
**Operator:** [Your Name]

---

## Job Metadata

| Field | Value |
|-------|-------|
| Job ID | [xxx] |
| Original Queue | [invoice-processing] |
| Original Job ID | [yyy] |
| Tenant ID | [tenant_123] |
| User ID | [user_456] |
| Environment | [production / staging] |
| Failed At | [YYYY-MM-DD HH:MM UTC] |
| Retry Attempts | [3] |

---

## Error Details

**Error Message:**
```
[Full error message from job metadata]
```

**Stack Trace:**
```
[Full stack trace if available]
```

**Error Pattern:** [ECONNREFUSED / timeout / ValidationError / ...]

---

## Job Payload

**Input Data:**
```json
{
  "invoiceId": "INV-2025-001",
  "tenantId": "tenant_123",
  "userId": "user_456",
  "documentUrl": "https://storage.googleapis.com/...",
  "processingOptions": {
    "ocrEnabled": true,
    "autoClassify": true
  }
}
```

**Payload Size:** [X KB]  
**Suspicious Fields:** [None / Missing required field: documentUrl / ...]

---

## Root Cause Hypothesis

**Suspected Cause:** [External API unavailable / Invalid data / ...]

**Evidence:**
- [Evidence 1: Sentry shows spike in ECONNREFUSED errors at same timestamp]
- [Evidence 2: External API status page confirms outage 2-4 AM UTC]

**Confidence:** [LOW / MEDIUM / HIGH]

---

## Resolution Recommendation

**Action:** [RETRY / MANUAL_FIX / DISCARD / ESCALATE]

**Rationale:**
[Explain why this action is recommended]

**Retry Safe?** [YES / NO / UNKNOWN]  
**Data Recovery Possible?** [YES / NO / UNKNOWN]

**Next Steps:**
1. [Step 1: Wait for API recovery (confirm via status page)]
2. [Step 2: Retry job using dlq-retry-job.js script]
3. [Step 3: Monitor Sentry for successful completion]

---

## Audit Trail

**Sentry Event ID:** [evt_123]  
**Related Issues:** [Link to GitHub issue, Slack thread]  
**Sign-Off:** [Your Name] - [YYYY-MM-DD HH:MM UTC]
```

---

### Template 2: DLQ Escalation Report

**File:** `/tmp/dlq-escalation-report-[date].md`

```markdown
# DLQ Escalation Report - [YYYY-MM-DD]

**Severity:** [LOW / MEDIUM / HIGH / CRITICAL]  
**Escalated To:** [Backend Lead / Platform Team / Security Team]  
**Escalated By:** [Your Name]  
**Escalated At:** [YYYY-MM-DD HH:MM UTC]

---

## Executive Summary

**DLQ Depth:** [X jobs] (threshold: warning ≥10, critical ≥50)  
**Affected Queues:** [invoice-processing, ai-tasks]  
**Time Window:** [Started: YYYY-MM-DD HH:MM UTC, Duration: X hours]  
**Impact:** [X% of jobs failing, Y tenants affected]

**Suspected Root Cause:** [API outage / Data corruption / Code bug]

---

## Error Pattern Analysis

**Top Errors (by frequency):**

| Error | Count | Queues Affected | % of Total |
|-------|-------|-----------------|------------|
| ECONNREFUSED | 45 | invoice-processing, ai-tasks | 75% |
| timeout | 10 | document-analysis | 17% |
| ValidationError | 5 | connector-sync | 8% |

**Error Distribution (by queue):**

| Queue | DLQ Jobs | Total Jobs Processed | Failure Rate |
|-------|----------|----------------------|--------------|
| invoice-processing | 30 | 500 | 6% |
| ai-tasks | 15 | 200 | 7.5% |
| document-analysis | 10 | 150 | 6.7% |
| connector-sync | 5 | 100 | 5% |

---

## Sample Jobs (Top 3)

### Job 1
- **Job ID:** [job_xxx]
- **Queue:** [invoice-processing]
- **Error:** ECONNREFUSED (OpenAI API unreachable)
- **Payload:** [Invoice INV-2025-001, tenant_123]
- **Retry Safe:** YES (after API recovery)

### Job 2
- **Job ID:** [job_yyy]
- **Queue:** [ai-tasks]
- **Error:** timeout (embeddings generation exceeded 60s)
- **Payload:** [Large document 5MB, tenant_456]
- **Retry Safe:** UNKNOWN (may need timeout increase)

### Job 3
- **Job ID:** [job_zzz]
- **Queue:** [connector-sync]
- **Error:** ValidationError (missing field: connectorId)
- **Payload:** [Moloni sync, tenant_789]
- **Retry Safe:** NO (requires data fix)

---

## Investigation Timeline

| Time | Action | Outcome |
|------|--------|---------|
| 14:00 UTC | Sentry alert received (DLQ depth: 15) | Acknowledged |
| 14:05 UTC | Checked health endpoint | Database/Redis healthy |
| 14:10 UTC | Sampled 5 DLQ jobs | Pattern: ECONNREFUSED to OpenAI API |
| 14:15 UTC | Checked OpenAI status page | Confirmed outage 14:00-14:30 UTC |
| 14:20 UTC | Decision: Wait for API recovery | Monitoring DLQ depth |
| 14:30 UTC | OpenAI API recovered | Prepared retry jobs |
| 14:35 UTC | DLQ depth continuing to grow | Decision to escalate |

---

## Escalation Rationale

**Why escalating:**
[OpenAI API outage resolved, but DLQ depth still growing. Suspected secondary issue (rate limiting?) requiring Backend Lead review.]

**What I've ruled out:**
- [x] Infrastructure issues (database/Redis healthy)
- [x] Tenant-specific configuration (multiple tenants affected)
- [x] Time-based pattern (jobs failing continuously, not time-specific)

**What needs investigation:**
- [ ] OpenAI rate limit configuration (may need quota increase)
- [ ] Worker concurrency settings (may be overwhelming API after recovery)
- [ ] Code review (job processor may have retry logic bug)

---

## Recommended Next Steps

1. **Backend Lead Review:** Analyze OpenAI API usage logs, verify rate limit compliance
2. **Worker Configuration:** Reduce job concurrency temporarily (5 → 2 concurrent jobs)
3. **Retry Strategy:** Implement longer backoff between retries (current: 30s, 5min, 30min → recommend: 1min, 15min, 1hr)
4. **Monitoring:** Add OpenAI rate limit metrics to health dashboard

---

## Attachments

- **DLQ Snapshot:** `/tmp/dlq-snapshot-20251110.json` (60 jobs)
- **Sentry Report:** https://sentry.io/organizations/assistos/issues/12345/
- **Queue Metrics:** `/tmp/queue-metrics-20251110.json` (pre/post DLQ spike)
- **OpenAI Status Page:** https://status.openai.com/incidents/xxx

---

## Handoff Notes

**Availability:** [Your Name] available until 18:00 UTC for questions  
**Contact:** [Slack: @yourname, Email: you@assistos.com]  
**Sign-Off:** [Your Name] - [YYYY-MM-DD HH:MM UTC]
```

---

## Ownership Matrix

| Queue | Primary Owner | Secondary Owner | Escalation Path |
|-------|---------------|-----------------|-----------------|
| **invoice-processing** | Backend Team | Platform Team | Backend Lead → Platform Lead |
| **ai-tasks** | Backend Team | AI/ML Team | Backend Lead → AI/ML Lead |
| **migration-jobs** | Platform Team | Backend Team | Platform Lead → Backend Lead |
| **connector-sync** | Backend Team | Integration Team | Backend Lead → Integration Lead |
| **email-notifications** | Backend Team | Platform Team | Backend Lead → Platform Lead |
| **document-analysis** | Backend Team | AI/ML Team | Backend Lead → AI/ML Lead |
| **gmail-sync** | Integration Team | Backend Team | Integration Lead → Backend Lead |

**Primary Owner Responsibilities:**
- Investigate DLQ jobs for owned queues
- Maintain job processor code
- Define retry strategies
- Document known error patterns

**Secondary Owner Responsibilities:**
- Assist with escalations
- Provide domain expertise (e.g., OpenAI API, Gmail OAuth)
- Review code changes affecting queue

**Escalation Path:**
- **Level 1 (L1):** On-call Engineer (this SOP)
- **Level 2 (L2):** Primary Owner (Backend/Integration/Platform Team Lead)
- **Level 3 (L3):** CTO / VP Engineering (systemic failures only)

---

## Escalation Ladder

### Level 1 (L1): On-Call Engineer
**Scope:** Routine DLQ triage (0-30 minutes investigation)

**Responsibilities:**
- [ ] Acknowledge Sentry alerts
- [ ] Investigate DLQ jobs (Phase 1-2)
- [ ] Retry jobs if safe (Phase 3.2)
- [ ] Tag jobs for manual review (Phase 3.3)
- [ ] Escalate if root cause unclear (Phase 4)

**Decision Authority:**
- Retry transient errors (API outages, rate limits)
- Discard duplicate jobs
- Tag jobs for manual review

**Escalation Triggers:**
- Root cause unclear after 30 minutes
- DLQ depth >50 jobs
- Multiple queues affected
- Suspected security breach

---

### Level 2 (L2): Backend Team Lead
**Scope:** Code-level investigation (30-120 minutes)

**Responsibilities:**
- [ ] Review job processor code for bugs
- [ ] Analyze retry logic and timeout settings
- [ ] Implement code fixes if needed
- [ ] Coordinate with external API vendors (OpenAI, Moloni)
- [ ] Approve bulk retry operations (>50 jobs)

**Decision Authority:**
- Deploy code fixes
- Adjust worker configuration (concurrency, timeouts)
- Request API quota increases
- Approve bulk job discards

**Escalation Triggers:**
- Code changes require cross-team coordination
- Infrastructure changes needed (database, Redis)
- Security incident confirmed

---

### Level 3 (L3): CTO / VP Engineering
**Scope:** Systemic failures, vendor escalations (2+ hours)

**Responsibilities:**
- [ ] Coordinate cross-team incident response
- [ ] Escalate to external vendors (Neon, Upstash, OpenAI)
- [ ] Approve emergency infrastructure changes
- [ ] Communicate with customers (if user-facing impact)

**Decision Authority:**
- Emergency maintenance windows
- Vendor SLA breach escalations
- Customer communication approval

**Escalation Triggers:**
- Multi-service outage (database + Redis + queues)
- Vendor SLA breach (OpenAI, Neon)
- User-facing impact (>10 tenants affected)

---

## Integration with Monitoring Systems

### Sentry Alert Integration

**Alert Rule:** "DLQ Depth Warning" (depth ≥10)
- **Severity:** WARNING
- **Notification:** Slack `#backend-team`
- **Auto-Resolve:** When depth <5 for 10 minutes
- **Runbook:** This SOP (link in alert description)

**Alert Rule:** "DLQ Depth Critical" (depth ≥50)
- **Severity:** CRITICAL
- **Notification:** PagerDuty → On-call Engineer
- **Auto-Resolve:** When depth <10 for 30 minutes
- **Runbook:** This SOP (link in alert description)

**Sentry Event Tagging:**
- All DLQ jobs tagged: `dlq_job: true`
- Additional tags: `queue_name`, `tenant_id`, `user_id`, `error_pattern`
- Custom event: `dlq.manual_intervention` (logged when jobs manually retried/discarded)

**Sentry Dashboard:**
- **DLQ Overview:** https://sentry.io/organizations/assistos/dashboards/dlq-overview/
  - DLQ depth over time
  - Top error patterns (last 24 hours)
  - Queue-level failure rates

---

### Queue Monitor Service Integration

**Service:** `apps/api/services/queue-monitor.service.ts`

**Metrics Exposed:**
- `dlq.depth`: Current number of jobs in DLQ
- `dlq.oldest_job_age_hours`: Age of oldest job in DLQ (hours)
- `dlq.jobs_added_last_hour`: New jobs added to DLQ in last hour

**Health Endpoint:**
```bash
curl -f http://localhost:5000/api/health/readyz | jq '.queues[] | select(.name=="dlq")'

# Output:
{
  "name": "dlq",
  "active": 0,
  "waiting": 15,
  "depth": 15,
  "oldest_job_age_hours": 2.5,
  "jobs_added_last_hour": 5
}
```

**Alerting Thresholds:**
- **Warning:** `depth ≥ 10` OR `jobs_added_last_hour ≥ 5`
- **Critical:** `depth ≥ 50` OR `oldest_job_age_hours ≥ 24`

**Automated Actions:**
- Sentry event created when threshold crossed
- PagerDuty escalation for CRITICAL threshold
- Daily summary report (email to Backend Team)

---

## Preventive Measures

### Proactive Monitoring

**Daily DLQ Review (Automated):**
- [ ] **Schedule:** Every day at 9:00 AM UTC (after overnight batch jobs)
- [ ] **Scope:** Review DLQ jobs added in last 24 hours
- [ ] **Output:** Email summary to Backend Team (job count, top errors)
- [ ] **Action:** If depth >5, investigate proactively (before alert triggers)

**Weekly Pattern Analysis:**
- [ ] **Schedule:** Every Monday 10:00 AM UTC
- [ ] **Scope:** Analyze DLQ trends (week-over-week)
- [ ] **Output:** Report: recurring error patterns, affected queues, prevention recommendations
- [ ] **Action:** Create tickets for code fixes, configuration adjustments

### Code Quality Gates

**Pre-Deployment Checks:**
- [ ] **Job Processor Tests:** All job processors have unit tests (>80% coverage)
- [ ] **Retry Logic:** Verify retry strategy (max attempts, backoff timing)
- [ ] **Timeout Configuration:** Document timeout thresholds (per queue type)
- [ ] **Error Handling:** Validate error messages logged to Sentry (no sensitive data)

**Production Monitoring (First 24 Hours After Deploy):**
- [ ] Monitor DLQ depth hourly (alert if increase >5 jobs)
- [ ] Review Sentry for new error patterns (compare vs baseline)
- [ ] Check queue success rates (should remain >95%)

### Knowledge Base

**DLQ Runbooks (Maintain):**
- [ ] **Common Error Patterns:** Document top 10 recurring errors, root causes, resolutions
  - Example: "ECONNREFUSED to OpenAI API → Check status.openai.com, wait for recovery, retry jobs"
- [ ] **Queue-Specific Gotchas:** Document known issues per queue
  - Example: "invoice-processing: Large PDFs (>10MB) may timeout, split into chunks"
- [ ] **Vendor Contact Info:** Maintain list of external API support contacts
  - Example: "OpenAI Support: help.openai.com, SLA: 4 hours response"

**Team Training:**
- [ ] **Quarterly DLQ Drill:** Simulate DLQ spike, practice triage workflow (see `docs/secrets-rotation-drill.md` for drill format)
- [ ] **Onboarding:** New Backend engineers shadow DLQ triage (2-3 sessions)

---

## Related Documentation

- **DLQ System Implementation:** `apps/worker/queues/dlq.ts` (DLQ queue configuration)
- **Queue Monitor Service:** `apps/api/services/queue-monitor.service.ts` (metrics, alerting)
- **Sentry Alert Catalog:** `docs/sentry-alert-catalog.md` (alert rules, escalation procedures)
- **Health Endpoints:** `apps/api/services/health.service.ts` (DLQ health checks)
- **BullMQ Job Monitoring:** `apps/worker/utils/job-monitoring.ts` (job lifecycle logging)
- **DLQ Operational Tooling:** `scripts/dlq-triage-workbench.md` (retry/discard scripts) - **To be created in day6-8-6**

---

## Emergency Contacts

- **Backend Team Lead:** [Contact Info]  
- **Platform Team Lead:** [Contact Info]  
- **Integration Team Lead:** [Contact Info]  
- **CTO / VP Engineering:** [Contact Info]  
- **PagerDuty:** On-call rotation (24/7)

---

## Document Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-11-10 | Backend Team | Initial release - DLQ triage SOP with investigation workflow, data capture templates, ownership matrix, escalation ladder, Sentry/queue-monitor integration |
