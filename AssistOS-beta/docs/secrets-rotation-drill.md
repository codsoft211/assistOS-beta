# Secrets Rotation Tabletop Drill Guide

**Document Version:** 1.0.0  
**Last Updated:** November 10, 2025  
**Owner:** Platform Team  
**Classification:** CONFIDENTIAL - Internal Use Only

---

## Purpose

This document provides a structured framework for conducting **tabletop rotation drills** - simulated secret rotation exercises designed to:

1. **Validate Runbook Accuracy:** Ensure rotation procedures in `scripts/rotate-*.md` are complete, accurate, and executable
2. **Test Team Readiness:** Verify Platform + Backend + Security teams can execute rotations under time pressure
3. **Identify Gaps:** Surface missing tools, unclear procedures, or knowledge gaps before production rotations
4. **Measure RTO Compliance:** Confirm rotation/rollback times meet targets (<5 min RTO for CRITICAL secrets)
5. **Build Muscle Memory:** Practice coordination, communication, and decision-making under simulated incident conditions

**Drill Schedule:** Quarterly (recommended before each actual rotation cycle)  
**Drill Duration:** 2-3 hours (includes preparation, execution, debrief)  
**Participants:** Platform Team Lead, Backend Team Lead, Security Team, On-call Engineer

---

## Drill Scenarios

### Scenario 1: Normal Rotation (DATABASE_URL)

**Objective:** Simulate complete end-to-end DATABASE_URL rotation following `scripts/rotate-database-url.md`

**Scenario Description:**  
Platform Team executes scheduled 60-day rotation of Neon PostgreSQL password. System remains healthy throughout. All phases complete successfully.

**Expected Outcomes:**
- [ ] Dual-credential period established (30-minute TTL)
- [ ] Canary validation passes (disposable schema test)
- [ ] Production rollout completes (API + Worker restarted)
- [ ] Monitoring confirms zero degradation (30-minute observation)
- [ ] Old credential revoked
- [ ] Total duration: <60 minutes (including 30-minute observation window)

**Timing Breakdown:**
- Phase 1 (Credential Issuance): 5 minutes
- Phase 2 (Canary Validation): 3 minutes
- Phase 3 (Production Rollout): 10 minutes
- Phase 4 (Monitoring): 30 minutes
- Phase 5 (Cleanup): 5 minutes
- **Total:** 53 minutes

**Success Criteria:**
- ✅ All checklist items in runbook completed
- ✅ Zero service interruptions
- ✅ Health endpoints green throughout
- ✅ Sentry error rate <2x baseline

---

### Scenario 2: Rollback Required (REDIS_URL)

**Objective:** Simulate REDIS_URL rotation with canary failure, triggering rollback procedure

**Scenario Description:**  
Platform Team begins REDIS_URL rotation. During canary validation, new Upstash token fails namespace diff check (simulated: namespace count mismatch detected). Team must execute rollback within RTO target.

**Expected Outcomes:**
- [ ] Dual-token period established
- [ ] BullMQ workers paused successfully
- [ ] Canary validation FAILS (namespace count mismatch)
- [ ] Rollback decision made within 2 minutes
- [ ] Rollback procedure executed (revert secret, restart services)
- [ ] Services restored to baseline health
- [ ] Total rollback time: <5 minutes (RTO compliance)

**Timing Breakdown:**
- Phase 1 (Credential Issuance): 5 minutes
- Phase 2 (Queue Quiesce): 5 minutes
- Phase 3 (Canary Validation): 3 minutes → **FAIL**
- **Rollback Decision:** 2 minutes
- **Rollback Execution:** 5 minutes
- **Verification:** 3 minutes
- **Total:** 23 minutes (rotation aborted, rollback successful)

**Success Criteria:**
- ✅ Canary failure detected immediately
- ✅ Rollback decision made by Platform Lead
- ✅ Rollback execution <5 minutes (RTO met)
- ✅ Services restored to baseline (queue processing resumed)
- ✅ No data loss (BullMQ jobs preserved)
- ✅ Post-rollback analysis documented

**Injected Failure Points (Simulated):**
- Namespace scan returns count mismatch (OLD: 150 tenants, NEW: 148 tenants)
- Decision point: Continue with 2 missing tenants OR rollback?
- Expected decision: **ROLLBACK** (multi-tenant isolation critical)

---

### Scenario 3: Partial Failure (OPENAI_API_KEY)

**Objective:** Simulate OPENAI_API_KEY rotation with degraded performance during monitoring phase

**Scenario Description:**  
Backend Team executes OPENAI_API_KEY rotation. Canary passes, production rollout completes. During 30-minute monitoring phase, AssistME success rate drops to 92% (below 95% threshold). Team must decide: rollback OR investigate/tolerate.

**Expected Outcomes:**
- [ ] Dual-key period established
- [ ] Canary validation passes (embeddings + completion + streaming tests)
- [ ] Production rollout completes (API + Worker restarted)
- [ ] Monitoring detects degradation (success rate 92%)
- [ ] Decision: Investigate OR rollback within 10 minutes
- [ ] If rollback: <5 minutes execution
- [ ] If investigate: Root cause identified (simulated: rate limit throttling)

**Timing Breakdown:**
- Phase 1 (Credential Issuance): 5 minutes
- Phase 2 (Canary Validation): 5 minutes → **PASS**
- Phase 3 (Production Rollout): 10 minutes
- Phase 4 (Monitoring): 15 minutes → **DEGRADATION DETECTED**
- **Decision Point:** 10 minutes (investigate vs rollback)
- **Option A - Rollback:** 5 minutes
- **Option B - Investigation:** 15 minutes (discover rate limit issue, adjust traffic)
- **Total:** 50-60 minutes depending on decision

**Success Criteria:**
- ✅ Degradation detected within 5 minutes (monitoring alerts)
- ✅ Decision made by Backend Lead within 10 minutes
- ✅ If rollback: RTO <5 minutes met
- ✅ If investigate: Root cause identified, mitigation applied
- ✅ Post-drill analysis documents decision rationale

**Injected Failure Points (Simulated):**
- OpenAI rate limit hit: 3500 requests/min (production traffic spike)
- AssistME success rate: 92% (border threshold, not critical failure)
- Decision factors: Business impact (AI features degraded), mitigation options (throttle requests)
- Expected decision: **INVESTIGATE** (degradation tolerable, rate limit adjustable)

---

### Scenario 4: Communication Breakdown (SENTRY_DSN)

**Objective:** Test team coordination when communication channels fail during rotation

**Scenario Description:**  
Platform Team executes SENTRY_DSN rotation. During rollout, Slack notifications fail (simulated outage). Team must coordinate via PagerDuty + email. Tests backup communication channels under incident conditions.

**Expected Outcomes:**
- [ ] Slack outage detected (notifications failing)
- [ ] Team pivots to PagerDuty + email within 2 minutes
- [ ] Rotation continues using backup communication channels
- [ ] All stakeholders stay informed (status updates via email)
- [ ] Rotation completes successfully despite communication disruption
- [ ] Total duration: <20 minutes (minimal delay from communication switch)

**Timing Breakdown:**
- Phase 1 (Credential Issuance): 2 minutes
- Phase 2 (Canary Validation): 3 minutes
- **Communication Failure Detected:** 1 minute
- **Pivot to Backup Channels:** 2 minutes
- Phase 3 (Production Rollout): 5 minutes (coordinated via email)
- Phase 4 (Monitoring): 15 minutes
- Phase 5 (Cleanup): 3 minutes
- **Total:** 31 minutes (6-minute overhead from communication issues)

**Success Criteria:**
- ✅ Communication failure detected immediately
- ✅ Backup channels (PagerDuty + email) activated <2 minutes
- ✅ All stakeholders receive status updates
- ✅ Rotation completes despite disruption
- ✅ Communication overhead <10 minutes

**Injected Failure Points (Simulated):**
- Slack API outage (notifications to #platform-ops fail)
- Test: Can team complete rotation using only email + PagerDuty?
- Expected behavior: Team adapts, continues rotation with minimal delay

---

## Drill Execution Checklist

### Pre-Drill Preparation (1 Week Before)

#### Logistics
- [ ] **Schedule Drill:** Book 2-3 hour window with all participants (Platform, Backend, Security teams)
- [ ] **Select Scenario:** Choose 1-2 scenarios from above (recommend rotating each quarter)
- [ ] **Assign Roles:**
  - **Drill Coordinator:** Platform Team Lead (timekeeper, facilitator)
  - **Operator:** On-call Engineer (executes procedures from runbook)
  - **Observer:** Security Team (monitors for compliance gaps)
  - **Failure Injector:** Backend Lead (introduces simulated failures per scenario)
- [ ] **Prepare Materials:**
  - Print rotation runbook (`scripts/rotate-<secret>.md`)
  - Prepare mock artifacts (sample Sentry screenshots, health endpoint outputs)
  - Set up timer/stopwatch for RTO measurement
- [ ] **Notify Stakeholders:** Send drill agenda, scenario description, participant roles via email

#### Environment Setup
- [ ] **Staging Environment:** Confirm staging environment available (isolation from production)
- [ ] **Test Credentials:** Generate test credentials (Neon staging branch, Upstash staging DB, OpenAI test key)
- [ ] **Monitoring Access:** Ensure all participants have access to:
  - Staging Sentry project
  - Staging health endpoints (`/api/health/readyz`)
  - Staging Replit workspace (secrets management)
- [ ] **Communication Channels:** Test Slack, PagerDuty, email notifications (verify working before drill)

### During Drill Execution

#### Phase 1: Kickoff (10 minutes)
- [ ] **Attendance:** Confirm all participants present
- [ ] **Scenario Briefing:** Drill Coordinator reads scenario description aloud
- [ ] **Role Confirmation:** Verify role assignments (Operator, Observer, Failure Injector)
- [ ] **Timer Start:** Start stopwatch when scenario begins

#### Phase 2: Execution (30-90 minutes depending on scenario)
- [ ] **Operator Follows Runbook:** On-call Engineer executes procedures step-by-step
- [ ] **Observer Takes Notes:** Security Team documents:
  - Checklist items completed/skipped
  - Timing per phase
  - Communication effectiveness
  - Decision points and rationale
  - Gaps/issues discovered
- [ ] **Failure Injector Introduces Issues:** Backend Lead injects simulated failures per scenario:
  - Scenario 2: Namespace count mismatch during canary
  - Scenario 3: Success rate degradation during monitoring
  - Scenario 4: Slack outage during rollout
- [ ] **Timekeeper Calls Out Milestones:**
  - "5 minutes elapsed - Phase 1 complete?"
  - "15 minutes elapsed - Canary validation pass/fail?"
  - "RTO target approaching - rollback decision needed"

#### Phase 3: Debrief (30-60 minutes)
- [ ] **Stop Timer:** Record total drill duration
- [ ] **Immediate Reactions:** Each participant shares 1-2 observations
- [ ] **Observer Report:** Security Team presents notes:
  - Checklist completion rate
  - RTO compliance (met/missed targets)
  - Communication breakdowns
  - Gaps discovered
- [ ] **Lessons Learned Discussion:**
  - What went well?
  - What was confusing/unclear?
  - What would we change for real rotation?
- [ ] **Action Items:** Document improvements needed:
  - Runbook updates
  - Tool enhancements
  - Training needs
  - Communication protocol changes

### Post-Drill Follow-Up (1 Week After)

- [ ] **Publish Drill Report:** Complete post-drill review template (see below)
- [ ] **Update Runbooks:** Incorporate lessons learned into `scripts/rotate-*.md`
- [ ] **Track Action Items:** Create tickets for improvements (Sentry, Replit workspace)
- [ ] **Schedule Next Drill:** Book next quarterly drill (rotate scenario)
- [ ] **Share Results:** Present drill findings to leadership (Platform + Security leads)

---

## Mock Artifacts

### Sample: Rotation Log (Success Scenario)

**File:** `docs/rotation-logs/20251110-database-url.md`

```markdown
# DATABASE_URL Rotation Log - November 10, 2025

**Type:** Tabletop Drill (Scenario 1: Normal Rotation)  
**Operator:** Jane Doe (On-call Engineer)  
**Observer:** John Smith (Security Team)  
**Drill Coordinator:** Alice Johnson (Platform Lead)

---

## Execution Timeline

| Time | Phase | Status | Notes |
|------|-------|--------|-------|
| 14:00 | Drill Kickoff | Started | All participants present |
| 14:05 | Phase 1: Credential Issuance | In Progress | Simulated `neonctl roles password-reset` |
| 14:08 | Phase 1: Verification | Pass | Test connection successful |
| 14:10 | Phase 2: Canary Validation | In Progress | Created disposable schema `canary_test` |
| 14:12 | Phase 2: Read/Write Test | Pass | INSERT + SELECT queries successful |
| 14:13 | Phase 2: Connection Pooling | Pass | Health endpoint returned `database: "healthy"` |
| 14:15 | Phase 3: Production Rollout | In Progress | Updated Replit Secret (staging) |
| 14:18 | Phase 3: API Service Restart | Complete | Service restarted, health check green |
| 14:22 | Phase 3: Worker Service Restart | Complete | All 7 queues active |
| 14:25 | Phase 4: Monitoring (30 min) | In Progress | Polling health endpoint every 30s |
| 14:55 | Phase 4: Monitoring Complete | Pass | 60/60 polls successful, zero errors |
| 14:58 | Phase 5: Cleanup | Complete | Old credential revoked, audit trail logged |
| 15:00 | Drill Complete | Success | Total duration: 60 minutes |

---

## Checklist Completion

### Prerequisites (100%)
- [x] System Health verified (`/api/health/readyz` = 200 OK)
- [x] Queue Metrics captured (depth <50 all queues)
- [x] Sentry Baseline recorded (error rate: 5 events/hour)
- [x] Stakeholders notified (drill announcement sent)

### Phase 1: Credential Issuance (100%)
- [x] New password generated (`neonctl` simulated)
- [x] Dual-credential period established (30-min TTL)
- [x] New connection tested (psql query successful)
- [x] Staging secret created (REPLIT: DATABASE_URL_NEW)

### Phase 2: Canary Validation (100%)
- [x] Canary schema created (`canary_test`)
- [x] Read/write transaction tested (INSERT + SELECT)
- [x] Connection pooling verified (Drizzle ORM)
- [x] Health endpoint passed (`database: "healthy"`)
- [x] Canary schema cleanup (DROP SCHEMA)

### Phase 3: Production Rollout (100%)
- [x] Sentry alerts muted (30 min window)
- [x] Replit secret updated (staging environment)
- [x] API service restarted (startup logs checked)
- [x] Worker service restarted (queue activity verified)

### Phase 4: Monitoring (100%)
- [x] Health endpoint polled (60/60 successful)
- [x] Queue metrics compared (pre vs post, stable ±10%)
- [x] Sentry error rate analyzed (<2x baseline)
- [x] API latency checked (<200ms p95)

### Phase 5: Cleanup (100%)
- [x] Old password revoked (simulated via Neon console)
- [x] Sentry alerts unmuted
- [x] Staging secret deleted (DATABASE_URL_NEW)
- [x] Audit trail logged (this document)

---

## Observations

### What Went Well
- ✅ **Runbook Clarity:** All steps in `scripts/rotate-database-url.md` were clear and executable
- ✅ **Timing Accuracy:** Actual execution matched documented timing targets (5+3+10+30+5 = 53 min)
- ✅ **Communication:** Drill coordinator kept team informed of progress, no confusion
- ✅ **RTO Compliance:** Simulated rotation completed within acceptable timeframe

### Issues Discovered
- ⚠️ **Missing Tool:** `neonctl` CLI not installed on operator's machine (had to simulate commands)
  - **Action Item:** Add CLI installation to pre-rotation checklist
- ⚠️ **Unclear Step:** Phase 2.2 "Test connection pooling" - runbook didn't specify exact curl command
  - **Action Item:** Add explicit curl example to runbook
- ⚠️ **Communication Gap:** No template for stakeholder notification email
  - **Action Item:** Create email template in rotation policy doc

### Lessons Learned
- 📝 **Practice Pays Off:** Operator unfamiliar with Neon CLI initially, but runbook provided enough guidance
- 📝 **Monitoring Critical:** 30-minute observation window caught no issues (expected), but validated monitoring setup works
- 📝 **Staging Environment Essential:** Drill confirmed value of staging - zero production risk

---

## Decision Points

None (normal rotation scenario, no failures injected)

---

## RTO Compliance

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Total Rotation Time | <60 min | 60 min | ✅ Met |
| Credential Issuance | <5 min | 5 min | ✅ Met |
| Canary Validation | <5 min | 3 min | ✅ Met |
| Production Rollout | <15 min | 10 min | ✅ Met |
| Monitoring Window | 30 min | 30 min | ✅ Met |
| Cleanup | <5 min | 5 min | ✅ Met |

---

## Sign-Offs

**Drill Coordinator (Platform Lead):** Alice Johnson - November 10, 2025  
**Operator (On-call Engineer):** Jane Doe - November 10, 2025  
**Observer (Security Team):** John Smith - November 10, 2025

**Drill Status:** ✅ SUCCESS  
**Next Scheduled Drill:** February 10, 2026 (Scenario 2: Rollback Required)
```

---

### Sample: Sentry Screenshot (Mock Health Endpoint)

**Context:** Captured during Phase 4 (Monitoring) of drill

```json
{
  "status": "healthy",
  "timestamp": "2025-11-10T14:30:00Z",
  "database": {
    "status": "healthy",
    "latency_ms": 15,
    "pool_size": 10,
    "active_connections": 3
  },
  "redis": {
    "status": "healthy",
    "latency_p75_ms": 8,
    "latency_p95_ms": 12,
    "last_check": "2025-11-10T14:29:55Z"
  },
  "queues": [
    {
      "name": "invoice-processing",
      "active": 2,
      "waiting": 5,
      "depth": 7,
      "success_rate": 98.5
    },
    {
      "name": "ai-tasks",
      "active": 1,
      "waiting": 0,
      "depth": 1,
      "success_rate": 100
    }
  ],
  "backup": {
    "status": "healthy",
    "last_backup": "2025-11-10T06:00:00Z",
    "retention_days": 30
  }
}
```

**Interpretation:** All systems green, rotation did not degrade performance

---

### Sample: Queue Metrics Snapshot (Pre vs Post)

**File:** `/tmp/queue-metrics-comparison.json`

```json
{
  "pre_rotation": {
    "timestamp": "2025-11-10T14:00:00Z",
    "queues": [
      {"name": "invoice-processing", "depth": 8, "active": 2, "success_rate": 98.2},
      {"name": "ai-tasks", "depth": 1, "active": 1, "success_rate": 100},
      {"name": "migration-jobs", "depth": 0, "active": 0, "success_rate": 100},
      {"name": "connector-sync", "depth": 3, "active": 1, "success_rate": 97.5},
      {"name": "email-notifications", "depth": 5, "active": 1, "success_rate": 99.1},
      {"name": "document-analysis", "depth": 2, "active": 0, "success_rate": 98.8},
      {"name": "gmail-sync", "depth": 4, "active": 1, "success_rate": 99.5}
    ]
  },
  "post_rotation": {
    "timestamp": "2025-11-10T14:55:00Z",
    "queues": [
      {"name": "invoice-processing", "depth": 7, "active": 2, "success_rate": 98.5},
      {"name": "ai-tasks", "depth": 1, "active": 1, "success_rate": 100},
      {"name": "migration-jobs", "depth": 0, "active": 0, "success_rate": 100},
      {"name": "connector-sync", "depth": 3, "active": 1, "success_rate": 97.8},
      {"name": "email-notifications", "depth": 4, "active": 1, "success_rate": 99.2},
      {"name": "document-analysis", "depth": 2, "active": 0, "success_rate": 98.9},
      {"name": "gmail-sync", "depth": 3, "active": 1, "success_rate": 99.6}
    ]
  },
  "analysis": {
    "depth_change": "±10% (stable)",
    "success_rate_change": "+0.1% average (improved)",
    "conclusion": "Zero degradation, rotation successful"
  }
}
```

---

## Post-Drill Review Template

**File:** `docs/rotation-logs/YYYY-MM-DD-<secret>-drill-review.md`

```markdown
# Secrets Rotation Drill Review - [Date] - [Secret Name]

**Scenario:** [Scenario 1-4: Normal Rotation / Rollback Required / Partial Failure / Communication Breakdown]  
**Participants:**
- Drill Coordinator: [Name, Role]
- Operator: [Name, Role]
- Observer: [Name, Role]
- Failure Injector: [Name, Role]

---

## Executive Summary

**Drill Status:** [SUCCESS / PARTIAL SUCCESS / FAILURE]  
**Total Duration:** [X minutes]  
**RTO Compliance:** [MET / MISSED - Target: <5 min rollback OR <60 min rotation]  
**Checklist Completion:** [X/Y items completed = Z%]

**Key Findings:**
- [Finding 1: e.g., Runbook accurate, no gaps]
- [Finding 2: e.g., Neon CLI missing from operator machine]
- [Finding 3: e.g., Communication effective, no bottlenecks]

**Action Items:** [X items] (see section below)

---

## Detailed Findings

### Runbook Accuracy
- **Assessment:** [EXCELLENT / GOOD / NEEDS IMPROVEMENT]
- **Strengths:** [List 2-3 strengths]
- **Gaps:** [List any missing steps, unclear instructions]
- **Recommended Updates:** [Specific changes to `scripts/rotate-*.md`]

### Team Readiness
- **Assessment:** [EXCELLENT / GOOD / NEEDS IMPROVEMENT]
- **Strengths:** [List 2-3 observations about team coordination]
- **Challenges:** [List any confusion, delays, knowledge gaps]
- **Training Needs:** [Specific training recommendations]

### Tool Availability
- **Assessment:** [EXCELLENT / GOOD / NEEDS IMPROVEMENT]
- **Available Tools:** [List tools successfully used: Neon CLI, sentry-cli, curl, etc.]
- **Missing Tools:** [List tools not installed/accessible]
- **Tool Issues:** [List any tool errors, authentication failures]

### Communication Effectiveness
- **Assessment:** [EXCELLENT / GOOD / NEEDS IMPROVEMENT]
- **Channels Used:** [Slack, PagerDuty, Email - which worked?]
- **Notification Timing:** [Were stakeholders informed on time?]
- **Bottlenecks:** [Any communication delays/failures?]

### RTO Compliance
- **Target RTO:** [<5 min rollback OR <60 min rotation]
- **Actual Time:** [X minutes]
- **Status:** [MET / MISSED]
- **Delays:** [If RTO missed, what caused delays?]
- **Recommendations:** [How to reduce rotation time?]

---

## Lessons Learned

### What Went Well (3-5 items)
1. [Lesson 1]
2. [Lesson 2]
3. [Lesson 3]

### What Needs Improvement (3-5 items)
1. [Issue 1]
2. [Issue 2]
3. [Issue 3]

### Surprising Discoveries (1-3 items)
1. [Unexpected finding 1]
2. [Unexpected finding 2]

---

## Action Items

| # | Action | Owner | Priority | Due Date | Status |
|---|--------|-------|----------|----------|--------|
| 1 | [Action description] | [Team/Person] | [HIGH/MEDIUM/LOW] | [YYYY-MM-DD] | [PENDING/COMPLETE] |
| 2 | [Action description] | [Team/Person] | [HIGH/MEDIUM/LOW] | [YYYY-MM-DD] | [PENDING/COMPLETE] |
| 3 | [Action description] | [Team/Person] | [HIGH/MEDIUM/LOW] | [YYYY-MM-DD] | [PENDING/COMPLETE] |

**Example Action Items:**
- Install Neon CLI on all operator machines (Platform Team, HIGH, 2025-11-17)
- Add explicit curl examples to DATABASE_URL runbook Phase 2.2 (Platform Lead, MEDIUM, 2025-11-20)
- Create stakeholder notification email template (Security Team, LOW, 2025-11-30)

---

## Scenario-Specific Insights

### [For Scenario 2: Rollback Required]
- **Rollback Decision Time:** [X minutes]
- **Decision Factors:** [What triggered rollback decision?]
- **Rollback Execution Time:** [X minutes]
- **Success:** [Did rollback restore baseline health?]
- **Lessons:** [What did we learn about rollback procedures?]

### [For Scenario 3: Partial Failure]
- **Degradation Detected:** [When was degradation first noticed?]
- **Metrics:** [Success rate, latency, error rate]
- **Decision:** [Rollback OR Investigate?]
- **Rationale:** [Why this decision?]
- **Outcome:** [Was decision correct in retrospect?]

### [For Scenario 4: Communication Breakdown]
- **Communication Failure:** [Which channel failed?]
- **Backup Channels:** [Which channels worked?]
- **Adaptation Time:** [How long to pivot to backup channels?]
- **Impact:** [Did communication issues delay rotation?]

---

## Metrics Dashboard (Mock)

### Rotation Timeline
```
[Timeline visualization]
14:00 ─── 14:05 ─── 14:10 ─── 14:15 ─── 14:25 ─── 14:55 ─── 15:00
  │        │        │        │        │        │        │
Kickoff  Phase1   Phase2   Phase3  Monitoring  Done   Debrief
```

### RTO Compliance Chart
```
Target RTO: 60 min
Actual:     60 min ✅ (on target)

Breakdown:
Phase 1: ████░ 5 min (target: <5 min) ✅
Phase 2: ███░░ 3 min (target: <5 min) ✅
Phase 3: ██████████░ 10 min (target: <15 min) ✅
Phase 4: ██████████████████████████████ 30 min (fixed observation) ✅
Phase 5: █████░ 5 min (target: <5 min) ✅
```

---

## Approvals

**Drill Coordinator (Platform Lead):** _________________________ Date: _______  
**Observer (Security Team):** _________________________ Date: _______  
**Backend Team Lead (if applicable):** _________________________ Date: _______

**Next Drill Scheduled:** [YYYY-MM-DD] - Scenario [1-4]

---

## Appendices

### Appendix A: Full Execution Log
[Link to detailed rotation log: `docs/rotation-logs/YYYY-MM-DD-<secret>.md`]

### Appendix B: Health Endpoint Outputs
[Screenshots or JSON dumps of health checks during monitoring phase]

### Appendix C: Sentry Error Logs
[Screenshots of Sentry dashboard showing error rate before/after rotation]

### Appendix D: Communication Transcripts
[Slack message exports OR PagerDuty alert history OR email thread]

### Appendix E: Participant Feedback Forms
[Optional: Collect feedback from each participant post-drill]
```

---

## Drill Frequency & Scheduling

**Recommended Cadence:** Quarterly (every 3 months)

**Annual Drill Calendar (2026):**

| Quarter | Drill Date | Scenario | Secret | Participants | Status |
|---------|-----------|----------|--------|--------------|--------|
| Q1 | February 10, 2026 | Scenario 1: Normal Rotation | DATABASE_URL | Platform + Security | Scheduled |
| Q2 | May 12, 2026 | Scenario 2: Rollback Required | REDIS_URL | Platform + Backend + Security | Scheduled |
| Q3 | August 11, 2026 | Scenario 3: Partial Failure | OPENAI_API_KEY | Backend + Security | Scheduled |
| Q4 | November 10, 2026 | Scenario 4: Communication Breakdown | SENTRY_DSN | Platform + Security | Scheduled |

**Rotation Before Actual Production Rotation:**  
If a real production rotation is scheduled (e.g., DATABASE_URL rotation on March 1, 2026), conduct a tabletop drill **2 weeks prior** (February 15, 2026) to refresh team readiness.

---

## Success Metrics

**Drill Success Criteria:**
- [ ] **Runbook Completion:** ≥90% of checklist items completed
- [ ] **RTO Compliance:** Rotation time within target (<60 min) OR Rollback time <5 min
- [ ] **Team Coordination:** Zero communication breakdowns (or effective backup channels used)
- [ ] **Lessons Captured:** ≥3 actionable improvements documented
- [ ] **Follow-Up:** ≥80% of action items completed before next drill

**Long-Term Goals (After 4 Quarterly Drills):**
- [ ] **Team Confidence:** All participants rate confidence ≥8/10 for executing real rotations
- [ ] **Runbook Maturity:** Zero critical gaps discovered in last 2 drills
- [ ] **RTO Improvement:** Rotation time reduced by 20% from first drill
- [ ] **Zero Production Incidents:** All production rotations execute without rollback (validated by drills)

---

## Related Documentation

- **Rotation Runbooks:** `scripts/rotate-database-url.md`, `scripts/rotate-redis-url.md`, `scripts/rotate-sentry-dsn.md`, `scripts/rotate-openai-api-key.md`
- **Rotation Policy:** `docs/secrets-rotation-policy.md` (rotation schedule matrix, dual-control approvals)
- **Secrets Inventory:** `docs/secrets-inventory.md` (secret profiles, blast radius, compliance mapping)
- **Database Backup Strategy:** `docs/database-backup-strategy.md` (Neon PITR procedures)
- **Quarterly Restore Drill:** `docs/quarterly-restore-drill.md` (database disaster recovery drills)

---

## Emergency Contacts

- **Platform Team Lead:** [Contact Info]  
- **Backend Team Lead:** [Contact Info]  
- **Security Team Lead:** [Contact Info]  
- **PagerDuty:** On-call rotation (24/7)

---

## Document Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-11-10 | Platform Team | Initial release - tabletop drill framework with 4 scenarios, execution checklist, mock artifacts, post-drill review template |
