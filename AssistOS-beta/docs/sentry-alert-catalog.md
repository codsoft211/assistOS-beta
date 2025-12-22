# Sentry Alert Catalog

**Last Updated:** November 10, 2025  
**Status:** Production Ready  
**Owner:** Platform & Backend Teams

## Overview

This document catalogues all Sentry alerts configured for AssistOS, including alert types, severity levels, ownership, SLO thresholds, and escalation procedures.

## Alert Taxonomy

### Severity Levels

#### ERROR (Critical)

- **Definition:** Production-breaking issues requiring immediate action
- **Response Time:** <15 minutes during business hours, <1 hour off-hours
- **Escalation:** On-call engineer → Team lead → VP Engineering
- **Examples:**
  - Database connection failures
  - Redis latency ≥200ms (p95)
  - Queue depth ≥500 jobs
  - DLQ depth ≥50 jobs
  - Critical backup failures
  - Authentication system failures

#### WARNING (Degraded)

- **Definition:** Degraded performance needing attention within business hours
- **Response Time:** <4 hours during business hours
- **Escalation:** Team notification → Daily standup discussion
- **Examples:**
  - Redis latency 50-200ms (p95)
  - Queue depth 100-500 jobs
  - DLQ depth 10-50 jobs
  - Backup warnings (non-critical)
  - Elevated error rates (not blocking)

#### INFO (Informational)

- **Definition:** Informational events for monitoring trends
- **Response Time:** Review during weekly retrospective
- **Escalation:** None
- **Examples:**
  - Successful backups
  - Queue processing metrics
  - System health snapshots

## Alert Catalog

### 1. Database Alerts

#### 1.1 Database Connection Failure

- **Severity:** ERROR
- **Source:** `apps/api/services/health.service.ts`
- **Trigger:** Database connection fails during health check
- **SLO:** 99.9% database availability
- **Owner:** Platform Team
- **Tags:** `service:database`, `error_type:connection_failed`
- **Escalation:** Immediate on-call page

**Remediation Steps:**
1. Check Neon Console for database status
2. Verify DATABASE_URL environment variable
3. Check network connectivity to Neon
4. Review recent database migrations
5. Escalate to Neon support if infrastructure issue

#### 1.2 Backup Monitoring Failure

- **Severity:** ERROR
- **Source:** `apps/api/services/backup-monitoring.service.ts`
- **Trigger:** Backup system shows degraded/critical status
- **SLO:** 100% backup success rate
- **Owner:** Platform Team
- **Tags:** `service:backup`, `error_type:backup_failed`
- **Escalation:** On-call engineer

**Remediation Steps:**
1. Verify Neon PITR retention settings (should be 30 days)
2. Check database WAL level (should be 'replica' or 'logical')
3. Review backup-monitoring cron logs
4. Verify database is not in read-only mode
5. Consult [Database Backup Strategy](./database-backup-strategy.md)

### 2. Redis Alerts

#### 2.1 Redis Connection Failure

- **Severity:** ERROR
- **Source:** `apps/api/services/health.service.ts`
- **Trigger:** Redis connection fails during health check
- **SLO:** 99.95% Redis availability
- **Owner:** Platform Team
- **Tags:** `service:redis`, `error_type:connection_failed`
- **Escalation:** Immediate on-call page

**Remediation Steps:**
1. Check Redis service status (Replit or external provider)
2. Verify REDIS_URL environment variable
3. Test connection manually: `redis-cli -u $REDIS_URL ping`
4. Review Redis logs for errors
5. Consider failover to backup Redis instance

#### 2.2 Redis Latency Critical

- **Severity:** ERROR
- **Source:** `apps/api/services/health.service.ts`
- **Trigger:** Redis p95 latency ≥200ms
- **SLO:** p95 latency <50ms (target), <200ms (max)
- **Owner:** Platform Team
- **Tags:** `service:redis`, `metric:latency`, `threshold:critical`
- **Escalation:** On-call engineer

**Remediation Steps:**
1. Check Redis memory usage (may need to increase limit)
2. Review recent traffic patterns (sudden spike?)
3. Identify slow commands: `SLOWLOG GET 10`
4. Consider Redis key eviction if memory full
5. Scale Redis instance vertically if needed

#### 2.3 Redis Latency Degraded

- **Severity:** WARNING
- **Source:** `apps/api/services/health.service.ts`
- **Trigger:** Redis p95 latency 50-200ms
- **SLO:** p95 latency <50ms
- **Owner:** Platform Team
- **Tags:** `service:redis`, `metric:latency`, `threshold:warning`
- **Escalation:** Team notification

**Remediation Steps:**
1. Monitor latency trends (is it increasing?)
2. Review application caching patterns
3. Optimize Redis key usage (large keys, inefficient operations)
4. Plan capacity upgrade if sustained degradation

### 3. BullMQ Queue Alerts

#### 3.1 Queue Depth Critical

- **Severity:** ERROR
- **Source:** `apps/worker/services/queue-monitor.service.ts`
- **Trigger:** Queue total depth ≥500 jobs
- **SLO:** <100 jobs per queue (normal), <500 (max)
- **Owner:** Backend Team
- **Tags:** `queue:<queue_name>`, `depth:<count>`, `threshold:critical`
- **Escalation:** On-call engineer
- **Affected Queues:** 
  - connector-sync
  - promotion
  - pattern-learning
  - pattern-aggregation
  - assistbuild
  - apply-migration
  - backfill-environment

**Remediation Steps:**
1. Check worker process status (are workers running?)
2. Review worker logs for stuck jobs or errors
3. Scale worker instances horizontally if traffic spike
4. Identify and remove stuck jobs if blocking queue
5. Consider increasing worker concurrency temporarily

#### 3.2 Queue Depth Warning

- **Severity:** WARNING
- **Source:** `apps/worker/services/queue-monitor.service.ts`
- **Trigger:** Queue total depth 100-500 jobs
- **SLO:** <100 jobs per queue
- **Owner:** Backend Team
- **Tags:** `queue:<queue_name>`, `depth:<count>`, `threshold:warning`
- **Escalation:** Team notification

**Remediation Steps:**
1. Monitor queue depth trends (is it growing?)
2. Review job processing times (are jobs taking longer?)
3. Check for unusual traffic patterns
4. Plan worker scaling if sustained high load

#### 3.3 DLQ Depth Critical

- **Severity:** ERROR
- **Source:** `apps/worker/services/queue-monitor.service.ts`
- **Trigger:** DLQ depth ≥50 jobs
- **SLO:** <10 jobs in DLQ
- **Owner:** Backend Team
- **Tags:** `queue:dlq`, `depth:<count>`, `threshold:critical`
- **Escalation:** Immediate on-call page + incident creation
- **Note:** DLQ indicates permanently failed jobs requiring manual intervention

**Remediation Steps:**
1. **Immediate:** Create incident ticket in project management system
2. Review DLQ job details (what's failing?)
3. Identify root cause (code bug, data issue, external API failure?)
4. Follow [DLQ Triage SOP](./dlq-triage-sop.md) (to be created in day6-8)
5. Fix root cause before re-queueing jobs
6. Manual intervention required - DO NOT auto-retry without fix

#### 3.4 DLQ Depth Warning

- **Severity:** WARNING
- **Source:** `apps/worker/services/queue-monitor.service.ts`
- **Trigger:** DLQ depth 10-50 jobs
- **SLO:** <10 jobs in DLQ
- **Owner:** Backend Team
- **Tags:** `queue:dlq`, `depth:<count>`, `threshold:warning`
- **Escalation:** Daily triage required (see DLQ SOP)

**Remediation Steps:**
1. Schedule daily DLQ review session
2. Categorize failed jobs by error type
3. Address underlying issues (code fixes, data corrections)
4. Document patterns for future prevention

### 4. Cron Job Alerts

#### 4.1 Cron Job Failure

- **Severity:** WARNING
- **Source:** `apps/api/services/cron/*.cron.ts`
- **Trigger:** Cron job fails with exception
- **Owner:** Platform Team
- **Tags:** `cron_job:<job_name>`, `error_type:*`
- **Escalation:** Review in next business day

**Affected Cron Jobs:**
- `backup-monitoring.cron.ts` - Daily backup health check (6:00 AM UTC)
- `queue-monitoring.cron.ts` - Queue depth monitoring (every 5 minutes)
- `gmail-sync.service.ts` - Gmail inbox sync (configurable)
- `opportunity-rules.service.ts` - CRM opportunity rules (configurable)

**Remediation Steps:**
1. Review cron job logs for error details
2. Verify external dependencies (database, Redis, APIs)
3. Check for transient failures (will retry on next run?)
4. Fix underlying issue if reproducible
5. Monitor next scheduled run for success

## SLO Thresholds Summary

| Service | Metric | Healthy | Degraded | Critical | Owner |
|---------|--------|---------|----------|----------|-------|
| Database | Availability | 100% | N/A | <100% | Platform |
| Redis | Availability | 100% | N/A | <100% | Platform |
| Redis | Latency (p95) | <50ms | 50-200ms | ≥200ms | Platform |
| Queues | Depth (per queue) | <100 | 100-500 | ≥500 | Backend |
| DLQ | Depth | <10 | 10-50 | ≥50 | Backend |
| Backup | Success Rate | 100% | N/A | <100% | Platform |

## Team Ownership

### Platform Team

**Responsibilities:**
- Database infrastructure (Neon PostgreSQL)
- Redis infrastructure
- Backup systems (PITR monitoring)
- Health monitoring endpoints
- Cron jobs (backup, queue monitoring)

**Primary Contact:** platform@assistos.com  
**On-Call Rotation:** PagerDuty "Platform Team" schedule

### Backend Team

**Responsibilities:**
- BullMQ queues (all 7 queues)
- Job processing (workers)
- DLQ triage and remediation
- Worker infrastructure

**Primary Contact:** backend@assistos.com  
**On-Call Rotation:** PagerDuty "Backend Team" schedule

## Escalation Procedures

### During Business Hours (9 AM - 6 PM UTC)

1. **ERROR alerts:** 
   - Slack #incidents channel (auto-posted by Sentry)
   - PagerDuty on-call page
   - Response within 15 minutes required

2. **WARNING alerts:** 
   - Slack #alerts channel
   - No immediate page
   - Review within 4 hours

3. **INFO alerts:** 
   - No immediate action
   - Reviewed in weekly retrospectives

### Off-Hours (6 PM - 9 AM UTC, weekends)

1. **ERROR alerts:** 
   - PagerDuty page to on-call engineer
   - Response within 1 hour required
   - Escalate to team lead if no response in 30 minutes

2. **WARNING alerts:** 
   - Batched for morning review
   - Slack notification only (no page)

3. **INFO alerts:** 
   - No immediate action
   - Reviewed in weekly retrospectives

### Escalation Chain

**Level 1: On-Call Engineer** (15-60 min response time)  
↓ (If unresolved after 30 minutes)  
**Level 2: Team Lead** (30 min response time)  
↓ (If unresolved after 1 hour)  
**Level 3: VP Engineering** (Immediate)

**Emergency Contact Card:**
- Platform Team: +351-XXX-XXX-XXX
- Backend Team: +351-XXX-XXX-XXX
- VP Engineering: +351-XXX-XXX-XXX

## Alert Configuration in Sentry

### Alert Rules

Navigate to **Sentry → Alerts → Create Alert Rule** to configure:

**1. Queue Depth Critical Alert**
```
WHEN: tag queue = * AND tag depth >= 500
THEN: Send notification to #incidents (Slack) AND page on-call (PagerDuty)
ENVIRONMENT: production
```

**2. Redis Latency Critical Alert**
```
WHEN: tag service = redis AND tag threshold = critical
THEN: Send notification to #incidents (Slack) AND page on-call (PagerDuty)
ENVIRONMENT: production
```

**3. Database Connection Failure Alert**
```
WHEN: tag service = database AND tag error_type = connection_failed
THEN: Send notification to #incidents (Slack) AND page on-call (PagerDuty)
ENVIRONMENT: production, staging
```

**4. DLQ Depth Critical Alert**
```
WHEN: tag queue = dlq AND tag depth >= 50
THEN: Send notification to #incidents (Slack) AND page on-call (PagerDuty)
ENVIRONMENT: production
```

### Notification Channels

**Slack Channels:**
- `#incidents` - ERROR alerts (production only)
- `#alerts` - WARNING alerts (all environments)
- `#monitoring` - INFO events (optional, high volume)

**PagerDuty Services:**
- `AssistOS Platform` - Database, Redis, Backup alerts
- `AssistOS Backend` - Queue, Worker, DLQ alerts

## Monitoring Best Practices

1. **Alert Fatigue Prevention:**
   - Review alert volume monthly
   - Tune thresholds to reduce false positives
   - Consolidate related alerts

2. **On-Call Rotation:**
   - Weekly rotation for sustainable workload
   - Handoff documentation required
   - Post-incident reviews for learning

3. **Metrics Review:**
   - Weekly SLO compliance check
   - Monthly alert effectiveness review
   - Quarterly threshold adjustment

4. **Continuous Improvement:**
   - Document all incident resolutions
   - Update runbooks after each incident
   - Share learnings in team retrospectives

## Related Documentation

- [Database Backup Strategy](./database-backup-strategy.md)
- [Database Restore Runbook](./database-restore-runbook.md)
- [DLQ Triage SOP](./dlq-triage-sop.md) (to be created in day6-8)
- [Sentry Configuration Guide](./sentry-configuration.md)
- [Health Check Implementation](../apps/api/services/health.service.ts)
- [Queue Monitor Implementation](../apps/worker/services/queue-monitor.service.ts)

## Changelog

| Date | Change | Author |
|------|--------|--------|
| 2025-11-10 | Initial alert catalog creation | Platform & Backend Teams |
| 2025-11-10 | Added remediation steps for all alerts | Platform & Backend Teams |
| 2025-11-10 | Defined escalation procedures | Infrastructure Team |
