# Sentry Configuration Guide

**Last Updated:** November 10, 2025  
**Status:** Production Ready  
**Owner:** Infrastructure Team

## Overview

Guidelines for configuring Sentry for AssistOS production environments, including environment-tagged releases, severity levels, deployment health dashboards, and integrations.

## Environment-Tagged Releases

### Release Naming Convention

AssistOS uses a structured release naming convention to track deployments across services and environments:

```
<service>@<version>-<environment>
```

**Examples:**
- `assistos-api@1.2.3-production`
- `assistos-worker@1.2.3-production`
- `assistos-api@1.2.3-staging`
- `assistos-worker@1.0.0-development`

### Benefits

✅ **Correlate errors with deployments** - Identify which version introduced a bug  
✅ **Environment isolation** - Filter production vs staging errors  
✅ **Service separation** - Track API vs Worker issues independently  
✅ **Release health tracking** - Monitor error rates per deployment  

### Configuration in Code

**API Service** (`apps/api/sentry.ts`):

```typescript
import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || 'development',
  
  // Environment-tagged release
  release: `assistos-${process.env.SERVICE_NAME || 'api'}@${process.env.APP_VERSION || 'dev'}-${process.env.NODE_ENV || 'development'}`,
  
  integrations: [
    nodeProfilingIntegration(),
  ],

  // Performance Monitoring
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  
  // Profiling
  profilesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
});
```

**Worker Service** (`apps/worker/sentry.ts`):

```typescript
import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || 'development',
  
  // Environment-tagged release
  release: `assistos-${process.env.SERVICE_NAME || 'worker'}@${process.env.APP_VERSION || 'dev'}-${process.env.NODE_ENV || 'development'}`,
  
  integrations: [
    nodeProfilingIntegration(),
  ],

  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  profilesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
});
```

### Environment Variables

**Required for Release Tracking:**

```bash
# Sentry DSN (EU region for GDPR compliance)
SENTRY_DSN=https://xxx@xxx.ingest.de.sentry.io/xxx

# Environment (production, staging, development)
NODE_ENV=production

# Service name (api or worker)
SERVICE_NAME=api

# Application version (semantic versioning)
APP_VERSION=1.2.3
```

**Setting Environment Variables:**

In Replit Secrets (Production):
```
SENTRY_DSN: https://xxx@xxx.ingest.de.sentry.io/xxx
NODE_ENV: production
SERVICE_NAME: api
APP_VERSION: 1.2.3
```

In `.env` (Local Development):
```bash
export SENTRY_DSN="https://xxx@xxx.ingest.de.sentry.io/xxx"
export NODE_ENV="development"
export SERVICE_NAME="api"
export APP_VERSION="dev"
```

### Version Management

**Semantic Versioning:**
- **MAJOR:** Breaking changes (1.0.0 → 2.0.0)
- **MINOR:** New features, backwards compatible (1.0.0 → 1.1.0)
- **PATCH:** Bug fixes (1.0.0 → 1.0.1)

**Version Update Process:**

1. Update `APP_VERSION` in environment variables before deployment
2. Tag Git commit with version: `git tag v1.2.3`
3. Deploy application (Sentry auto-detects new release)
4. Verify release in Sentry UI: **Releases → assistos-api@1.2.3-production**

**Alternative: Git-Based Versioning**

For automatic versioning from Git commits:

```typescript
// Get version from package.json or git commit
const APP_VERSION = process.env.APP_VERSION 
  || process.env.COMMIT_SHA?.substring(0, 7) 
  || 'dev';

release: `assistos-${SERVICE_NAME}@${APP_VERSION}-${NODE_ENV}`,
```

## Service-Specific Severity Levels

### Severity Mapping

Sentry supports 5 severity levels, but AssistOS uses 3 primary levels:

| AssistOS Level | Sentry Level | Use Case |
|----------------|--------------|----------|
| **ERROR** | `error` | Production-breaking issues (immediate action) |
| **WARNING** | `warning` | Degraded performance (business hours response) |
| **INFO** | `info` | Informational events (trend monitoring) |

### Usage Examples

**ERROR Level (Critical):**

```typescript
import { Sentry } from './sentry';

try {
  await db.query('SELECT 1');
} catch (error) {
  Sentry.captureException(error, {
    level: 'error',
    tags: {
      service: 'database',
      error_type: 'connection_failed',
    },
    contexts: {
      database: {
        host: process.env.DATABASE_HOST,
        connectionPoolSize: pool.totalCount,
      },
    },
  });
  throw error; // Re-throw to fail health check
}
```

**WARNING Level (Degraded):**

```typescript
import { Sentry } from './sentry';

const redisLatencyP95 = 150; // milliseconds

if (redisLatencyP95 >= 50 && redisLatencyP95 < 200) {
  Sentry.captureMessage('Redis latency degraded', {
    level: 'warning',
    tags: {
      service: 'redis',
      metric: 'latency',
      threshold: 'warning',
    },
    contexts: {
      serviceMetrics: {
        currentValue: redisLatencyP95,
        threshold: 50,
        criticalThreshold: 200,
        p75: 120,
        p95: 150,
        p99: 180,
      },
    },
  });
}
```

**INFO Level (Informational):**

```typescript
import { Sentry } from './sentry';

Sentry.captureMessage('Daily backup verification completed', {
  level: 'info',
  tags: {
    service: 'backup',
    scheduled_check: 'true',
  },
  contexts: {
    backup: {
      retentionDays: 30,
      databaseSize: '10GB',
      lastBackupTime: new Date().toISOString(),
    },
  },
});
```

### Tag Best Practices

**Consistent Tagging Strategy:**

```typescript
// Standard tags for all alerts
Sentry.captureException(error, {
  level: 'error',
  tags: {
    // Service identification
    service: 'redis' | 'database' | 'queue' | 'backup',
    
    // Metric type (for performance issues)
    metric: 'latency' | 'depth' | 'availability',
    
    // Threshold crossed (for degradation alerts)
    threshold: 'critical' | 'warning',
    
    // Environment (auto-set by Sentry.init, but can override)
    environment: process.env.NODE_ENV,
    
    // Queue name (for BullMQ alerts)
    queue: 'connector-sync' | 'promotion' | 'dlq',
    
    // Cron job name (for scheduled task failures)
    cron_job: 'backup-monitoring' | 'queue-monitoring',
  },
  contexts: {
    // Rich contextual data for debugging
    serviceMetrics: {
      currentValue: 250,
      threshold: 200,
      // ... additional metrics
    },
  },
});
```

**Tag Naming Conventions:**

- Use lowercase with underscores: `error_type`, not `errorType`
- Keep tag values short: `connection_failed`, not `database_connection_has_failed`
- Use colons for hierarchical tags: `queue:dlq`, `queue:connector-sync`

## Deployment Health Dashboards

### Sentry Project Settings

**1. Enable Release Health Tracking**

Navigate to **Settings → Projects → assistos-api** (or assistos-worker):

1. Click **Settings** → **Projects**
2. Select **assistos-api** or **assistos-worker**
3. Navigate to **SDK Setup** section
4. Enable **"Release Health"** toggle
5. Save changes

**2. Configure Alert Rules**

Navigate to **Alerts → Create Alert Rule**:

**Rule 1: High Error Rate**
- **Name:** High Error Rate - Production
- **Alert Conditions:**
  - Metric: Error rate
  - Threshold: >5% in 5 minutes
  - Environment: production
- **Actions:**
  - Send to Slack (#incidents)
  - Page PagerDuty (on-call)

**Rule 2: Session Crash Rate**
- **Name:** Session Crash Rate - Production
- **Alert Conditions:**
  - Metric: Crash free sessions
  - Threshold: <99% in 15 minutes
  - Environment: production
- **Actions:**
  - Send to Slack (#incidents)
  - Page PagerDuty (on-call)

### Custom Dashboards (Sentry Web UI)

**1. Queue Health Dashboard**

Navigate to **Dashboards → Create Dashboard** → "Queue Health":

**Widgets:**

1. **Queue Depth Trends (Line Chart)**
   - Query: `tags[queue] = *`
   - Metric: Average `depth` tag value
   - Group by: `queue` tag
   - Time range: Last 7 days

2. **DLQ Depth Over Time (Line Chart)**
   - Query: `tags[queue] = dlq`
   - Metric: Max `depth` tag value
   - Time range: Last 30 days
   - Alert threshold line at 50

3. **Success Rate per Queue (Bar Chart)**
   - Query: `tags[queue] = *`
   - Metric: Event count
   - Group by: `queue`, `level`
   - Filter: Show ERROR vs WARNING ratio

4. **Queue Alerts by Severity (Pie Chart)**
   - Query: All events with `queue` tag
   - Group by: `level` (error, warning, info)

**2. Infrastructure Health Dashboard**

**Widgets:**

1. **Database Availability % (Big Number)**
   - Query: `tags[service] = database`
   - Metric: (Total events - ERROR events) / Total events × 100
   - Time range: Last 24 hours
   - Goal: 99.9%

2. **Redis Latency Percentiles (Multi-Line Chart)**
   - Query: `tags[service] = redis`
   - Metrics: p50, p75, p95, p99 from `contexts.serviceMetrics`
   - Time range: Last 7 days
   - Reference lines at 50ms, 200ms

3. **Health Endpoint Response Times (Histogram)**
   - Query: Transaction `/api/health/readyz`
   - Metric: Duration distribution
   - Time range: Last 24 hours

4. **Service Errors by Type (Table)**
   - Query: `tags[service] = *`
   - Columns: Service, Error Type, Count, Last Seen
   - Sort by: Count (descending)

**3. Cron Job Dashboard**

**Widgets:**

1. **Backup Monitoring Success Rate (Line Chart)**
   - Query: `tags[cron_job] = backup-monitoring`
   - Metric: Success rate (INFO / (INFO + ERROR + WARNING))
   - Time range: Last 30 days

2. **Queue Monitoring Success Rate (Line Chart)**
   - Query: `tags[cron_job] = queue-monitoring`
   - Metric: Success rate
   - Time range: Last 7 days

3. **Failure Counts per Cron (Bar Chart)**
   - Query: `tags[cron_job] = *` AND `level = error`
   - Group by: `cron_job`
   - Time range: Last 7 days

4. **Recent Cron Failures (Table)**
   - Query: `tags[cron_job] = *` AND `level = error`
   - Columns: Cron Job, Error Message, Timestamp
   - Limit: Last 20 failures

### Dashboard Access

**Production Dashboards URL:**
```
https://sentry.io/organizations/assistos/dashboards/
```

**Recommended Review Cadence:**
- **Queue Health:** Daily (morning standup)
- **Infrastructure Health:** Hourly (automated alerts)
- **Cron Job Health:** Weekly (retrospectives)

## Integration with Monitoring Tools

### Slack Integration

**1. Install Sentry App in Slack**

1. Navigate to **Sentry → Settings → Integrations**
2. Find **Slack** integration
3. Click **Add to Slack**
4. Authorize Sentry to access your workspace
5. Select default channel (e.g., `#monitoring`)

**2. Configure Alert Channels**

| Channel | Alert Type | Environment | Severity |
|---------|------------|-------------|----------|
| `#incidents` | ERROR alerts | production | Critical |
| `#alerts` | WARNING alerts | all | Degraded |
| `#monitoring` | INFO events | all | Informational |

**3. Channel Setup**

```bash
# Create Slack channels if not exists
/slack create-channel #incidents
/slack create-channel #alerts
/slack create-channel #monitoring

# Set channel topics
/topic Production incidents requiring immediate action (#incidents)
/topic Degraded performance warnings (#alerts)
/topic Informational monitoring events (#monitoring)
```

**4. Configure Alert Rules → Slack Actions**

For each alert rule (in Sentry UI):
1. Navigate to **Alerts → [Alert Name] → Edit**
2. Scroll to **Actions**
3. Add action: **Send a notification to Slack**
4. Select channel: `#incidents` or `#alerts`
5. Customize message template (optional)

**5. Slack Message Format**

Sentry will post messages like:

```
🚨 [ERROR] Queue Depth Critical
assistos-api@1.2.3-production

Queue depth exceeded 500 jobs
Queue: connector-sync
Depth: 523 jobs

View in Sentry: https://sentry.io/...
```

### PagerDuty Integration

**1. Create Sentry Integration in PagerDuty**

1. Log in to **PagerDuty**
2. Navigate to **Integrations → Generic Integrations**
3. Click **New Integration**
4. Name: "Sentry - AssistOS"
5. Integration Type: **Events API v2**
6. Click **Add Integration**
7. Copy **Integration Key** (save securely)

**2. Configure Sentry → PagerDuty**

1. Navigate to **Sentry → Settings → Integrations**
2. Find **PagerDuty** integration
3. Click **Add Installation**
4. Paste **Integration Key** from step 1
5. Click **Save**

**3. Configure Routing Rules**

**Service 1: AssistOS Platform** (Database, Redis, Backup)
- Integration Key: `xxx-platform-xxx`
- Escalation Policy: Platform Team rotation
- Routing:
  - `tags[service] = database` → Platform Team
  - `tags[service] = redis` → Platform Team
  - `tags[service] = backup` → Platform Team

**Service 2: AssistOS Backend** (Queues, Workers, DLQ)
- Integration Key: `xxx-backend-xxx`
- Escalation Policy: Backend Team rotation
- Routing:
  - `tags[queue] = *` → Backend Team
  - `tags[cron_job] = *` → Backend Team (low-urgency)

**4. Alert Severity Mapping**

| Sentry Level | PagerDuty Severity | Action |
|--------------|-------------------|--------|
| `error` | Critical | Immediate page (phone call + SMS + push) |
| `warning` | Low | Email only (batched) |
| `info` | Info | No notification (logged only) |

**5. On-Call Schedules**

Configure in PagerDuty:

**Platform Team Schedule:**
- Rotation: Weekly (Mon 9am UTC → Mon 9am UTC)
- Layer 1: Primary on-call (15 min response)
- Layer 2: Backup on-call (30 min response if no ack)

**Backend Team Schedule:**
- Rotation: Weekly (Mon 9am UTC → Mon 9am UTC)
- Layer 1: Primary on-call (15 min response)
- Layer 2: Backup on-call (30 min response if no ack)

### Email Notifications (Optional)

**Configure Email Alerts** for individual developers:

1. Navigate to **Sentry → Settings → Account → Notifications**
2. Configure personal notification preferences:
   - **Deploy notifications:** On (for releases you deployed)
   - **Workflow notifications:** On (for issues assigned to you)
   - **Issue alerts:** Off (use Slack/PagerDuty instead)

## Monitoring Best Practices

### 1. Tag Everything

**Why:** Tags enable powerful filtering, grouping, and alerting in Sentry.

**Best Practices:**
- Always include `service` tag
- Add `environment` tag (auto-set by Sentry.init)
- Use `threshold` tag for performance alerts
- Include contextual tags (`queue`, `cron_job`, etc.)

**Example:**

```typescript
Sentry.captureException(error, {
  tags: {
    service: 'redis',
    metric: 'latency',
    threshold: 'critical',
    environment: 'production',
    operation: 'GET',
  },
});
```

### 2. Rich Context

**Why:** Context provides debugging information without cluttering tags.

**Best Practices:**
- Use `contexts` for metrics, configurations, state
- Include relevant IDs (user, tenant, request)
- Add timestamps for temporal correlation
- Provide actionable data (current vs threshold values)

**Example:**

```typescript
Sentry.captureMessage('Redis latency degraded', {
  level: 'warning',
  contexts: {
    serviceMetrics: {
      p50: 35,
      p75: 80,
      p95: 150,
      p99: 180,
      threshold: 50,
      criticalThreshold: 200,
      timestamp: new Date().toISOString(),
    },
    redis: {
      host: process.env.REDIS_HOST,
      connectionPoolSize: 10,
      memoryUsage: '512MB',
    },
  },
});
```

### 3. Environment Separation

**Why:** Prevent production alert fatigue from staging/dev noise.

**Best Practices:**
- Always set `NODE_ENV` correctly
- Use environment-specific Sentry projects (optional)
- Filter dashboards by environment
- Configure different alert rules per environment

**Alert Rule Example:**

```
WHEN: tags[service] = database AND tags[error_type] = connection_failed
AND environment = production
THEN: Page on-call
```

### 4. Release Tracking

**Why:** Correlate errors with specific deployments.

**Best Practices:**
- Use semantic versioning for `APP_VERSION`
- Tag Git commits with versions
- Deploy using consistent release names
- Monitor error rates per release

**Sentry Release Health:**

Navigate to **Releases** to see:
- Error rate per release
- Crash-free sessions %
- Deploy time and author
- Rollback recommendations

### 5. Alerting Hygiene

**Why:** Reduce alert fatigue and improve response times.

**Best Practices:**
- Review alert volume monthly
- Tune thresholds to reduce false positives
- Consolidate related alerts (use `OR` conditions)
- Mute known issues during investigations
- Delete stale alert rules

**Monthly Review Checklist:**
- [ ] Alert volume per channel (target: <10/day per channel)
- [ ] False positive rate (target: <5%)
- [ ] Mean time to acknowledge (MTTA) (target: <15 min)
- [ ] Mean time to resolution (MTTR) (target: <1 hour)

## Troubleshooting

### Sentry Not Capturing Errors

**1. Verify DSN is set:**

```bash
echo $SENTRY_DSN
# Expected: https://xxx@xxx.ingest.de.sentry.io/xxx
```

**2. Check Sentry initialization:**

```typescript
// In apps/api/index.ts or apps/worker/index.ts
import './sentry'; // Must be first import

console.log('[Sentry] Initialized:', !!Sentry.getCurrentHub());
```

**3. Test manual capture:**

```typescript
import { Sentry } from './sentry';

Sentry.captureMessage('Test message from AssistOS', { level: 'info' });
```

**4. Check beforeSend filter:**

Ensure your `beforeSend` hook isn't filtering out events:

```typescript
beforeSend(event, hint) {
  console.log('[Sentry] Capturing event:', event.message || event.exception);
  return event; // Ensure you return the event
}
```

### Release Not Showing in Sentry

**1. Verify environment variables:**

```bash
echo "Service: $SERVICE_NAME"
echo "Version: $APP_VERSION"
echo "Environment: $NODE_ENV"
```

**2. Check release format:**

```typescript
console.log('[Sentry] Release:', Sentry.getCurrentHub().getClient()?.getOptions().release);
// Expected: assistos-api@1.2.3-production
```

**3. Create release manually (if needed):**

```bash
# Using Sentry CLI
sentry-cli releases new assistos-api@1.2.3-production
sentry-cli releases set-commits assistos-api@1.2.3-production --auto
sentry-cli releases finalize assistos-api@1.2.3-production
```

### Alerts Not Triggering

**1. Verify alert rule configuration:**

Navigate to **Alerts → [Rule Name]** and check:
- Conditions match your event tags
- Environment filter is correct
- Actions are properly configured (Slack/PagerDuty)

**2. Test alert manually:**

```typescript
// Trigger test alert matching your alert rule
Sentry.captureException(new Error('Test alert for rule verification'), {
  level: 'error',
  tags: {
    service: 'database',
    error_type: 'connection_failed',
  },
});
```

**3. Check Sentry quota:**

Navigate to **Stats** to ensure you haven't exceeded monthly event quota.

## Related Documentation

- [Sentry Alert Catalog](./sentry-alert-catalog.md) - Complete alert inventory
- [Sentry Official Docs](https://docs.sentry.io/) - Sentry documentation
- [Health Check Implementation](../apps/api/services/health.service.ts) - Health monitoring service
- [Queue Monitor Implementation](../apps/worker/services/queue-monitor.service.ts) - Queue monitoring service

## Changelog

| Date | Change | Author |
|------|--------|--------|
| 2025-11-10 | Initial configuration guide | Infrastructure Team |
| 2025-11-10 | Added environment-tagged releases | Infrastructure Team |
| 2025-11-10 | Documented dashboards and integrations | Infrastructure Team |
