# DLQ CLI Helpers

Shared utility module for DLQ (Dead Letter Queue) operational tooling.

## Overview

The `dlq-cli-helpers.ts` module provides reusable utilities for building CLI scripts that manage jobs in the Dead Letter Queue (DLQ). It handles:

- Environment configuration and validation
- Redis/BullMQ connection management
- Command-line argument parsing
- Sentry audit logging
- Job manipulation operations

## Installation

No additional installation required. The module uses existing project dependencies:
- `dotenv` - Environment variable management
- `ioredis` - Redis client
- `bullmq` - Queue management
- `@sentry/node` - Error tracking and audit logging
- `yargs` - Command-line argument parsing

## Configuration

The module loads configuration from environment variables (`.env` file supported):

```bash
# Required
REDIS_URL=rediss://default:password@host:port

# Optional (for audit logging)
SENTRY_DSN=https://...@sentry.io/...
ENABLE_SENTRY=true

# Optional
OPERATOR_NAME=admin
```

## API Reference

### Config Loading

```typescript
import { loadConfig, initializeSentry } from './utils/dlq-cli-helpers';

const config = loadConfig();
initializeSentry(config);
```

### Connection Management

```typescript
import { createDLQConnection } from './utils/dlq-cli-helpers';

const connection = createDLQConnection(config);

// Get DLQ queue instance
const dlqQueue = connection.getDLQQueue();

// Get original queue instance
const originalQueue = connection.getQueue('connector-sync');

// Cleanup when done
await connection.cleanup();
```

### Argument Parsing

```typescript
import { parseArguments } from './utils/dlq-cli-helpers';

const args = parseArguments();
// Supports: --dry-run, --execute, --job-ids, --error-pattern, --tag, --reason, --output, --operator, --limit
```

### Audit Logging

```typescript
import { logDLQIntervention } from './utils/dlq-cli-helpers';

logDLQIntervention(
  'retry',                    // action: retry | discard | tag | export
  ['job-123', 'job-456'],     // job IDs
  'Manual intervention',      // reason
  'admin',                    // operator
  false                       // dry-run flag
);
```

### Job Utilities

#### Get DLQ Jobs

```typescript
import { getDLQJobs } from './utils/dlq-cli-helpers';

const jobs = await getDLQJobs(connection, 100); // limit optional
```

#### Filter Jobs by Error Pattern

```typescript
import { filterJobsByError } from './utils/dlq-cli-helpers';

const filtered = filterJobsByError(jobs, 'timeout'); // regex supported
```

#### Move Job to Original Queue

```typescript
import { moveJobToOriginalQueue } from './utils/dlq-cli-helpers';

await moveJobToOriginalQueue(connection, job, false); // dry-run: false
```

#### Remove Job from DLQ

```typescript
import { removeJobFromDLQ } from './utils/dlq-cli-helpers';

await removeJobFromDLQ(job, false); // dry-run: false
```

#### Tag Job

```typescript
import { tagJob } from './utils/dlq-cli-helpers';

await tagJob(job, 'reviewed', false); // dry-run: false
```

#### Export Jobs to CSV

```typescript
import { exportJobsToCSV } from './utils/dlq-cli-helpers';

await exportJobsToCSV(jobs, './output/failed-jobs.csv', false); // dry-run: false
```

#### Get Jobs by IDs

```typescript
import { getJobsByIds } from './utils/dlq-cli-helpers';

const jobs = await getJobsByIds(connection, ['job-123', 'job-456']);
```

#### Display Job Summary

```typescript
import { displayJobSummary } from './utils/dlq-cli-helpers';

displayJobSummary(jobs);
// Shows breakdown by queue, tenant, and error type
```

## Supported Queue Names

The module defines constants for all supported queues:

```typescript
import { QUEUE_NAMES } from './utils/dlq-cli-helpers';

QUEUE_NAMES.DLQ                   // 'dead-letter-queue'
QUEUE_NAMES.CONNECTOR_SYNC        // 'connector-sync'
QUEUE_NAMES.APPLY_MIGRATION       // 'apply-migration'
QUEUE_NAMES.PROMOTION             // 'promotion'
QUEUE_NAMES.ANALYZE_PATTERNS      // 'analyze-patterns'
QUEUE_NAMES.ASSISTBUILD           // 'assistbuild'
QUEUE_NAMES.INVOICE_PROCESSING    // 'invoice-processing'
QUEUE_NAMES.AI_TASKS              // 'ai-tasks'
QUEUE_NAMES.EMAIL_NOTIFICATIONS   // 'email-notifications'
QUEUE_NAMES.DOCUMENT_ANALYSIS     // 'document-analysis'
QUEUE_NAMES.GMAIL_SYNC            // 'gmail-sync'
```

## Example: Retry DLQ Jobs

```typescript
#!/usr/bin/env npx tsx

import {
  loadConfig,
  initializeSentry,
  createDLQConnection,
  parseArguments,
  getDLQJobs,
  filterJobsByError,
  moveJobToOriginalQueue,
  logDLQIntervention,
  displayJobSummary,
} from './utils/dlq-cli-helpers';

async function main() {
  // 1. Load config
  const config = loadConfig();
  initializeSentry(config);

  // 2. Parse arguments
  const args = parseArguments();

  // 3. Connect to Redis/BullMQ
  const connection = createDLQConnection(config);

  try {
    // 4. Get jobs
    let jobs = await getDLQJobs(connection, args.limit);

    // 5. Filter by error pattern if specified
    if (args.errorPattern) {
      jobs = filterJobsByError(jobs, args.errorPattern);
    }

    // 6. Display summary
    displayJobSummary(jobs);

    // 7. Retry jobs
    for (const job of jobs) {
      await moveJobToOriginalQueue(connection, job, args.dryRun);
    }

    // 8. Log audit event
    logDLQIntervention(
      'retry',
      jobs.map(j => j.id || 'unknown'),
      args.reason || 'Manual retry',
      args.operator,
      args.dryRun
    );

    console.log('\n✅ Operation complete');
  } finally {
    // 9. Cleanup
    await connection.cleanup();
  }
}

main().catch(console.error);
```

## CLI Flags

All DLQ CLI scripts support these common flags:

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--dry-run` | boolean | `true` | Preview changes without executing |
| `--execute` | boolean | `false` | Actually execute the operation |
| `--job-ids` | string | - | Comma-separated job IDs |
| `--error-pattern` | string | - | Error message pattern (regex) |
| `--tag` | string | - | Tag to apply to jobs |
| `--reason` | string | - | Reason for intervention (audit) |
| `--output` | string | - | Output file path for exports |
| `--operator` | string | `system` | Operator name (audit trail) |
| `--limit` | number | - | Max number of jobs to process |

## Testing

Run the test script to verify the module:

```bash
npx tsx scripts/test-dlq-helpers.ts
```

## Best Practices

1. **Always use dry-run first** - Preview operations before executing
2. **Provide reason for audit** - Use `--reason` flag for manual interventions
3. **Set operator name** - Use `--operator` flag or `OPERATOR_NAME` env var
4. **Enable Sentry for production** - Set `ENABLE_SENTRY=true` for audit trail
5. **Limit batch size** - Use `--limit` to process jobs in smaller batches
6. **Clean up connections** - Always call `connection.cleanup()` in finally block

## Error Handling

The module handles common errors gracefully:

- Missing configuration (REDIS_URL) - throws error with clear message
- Redis connection failures - logged and propagated
- Job not found - warns and continues with other jobs
- CSV export failures - logged with error details

## Audit Trail

When `ENABLE_SENTRY=true`, all DLQ interventions are logged to Sentry with:

- Event name: `dlq.manual_intervention`
- Level: `info` (dry-run) or `warning` (execute)
- Tags: `action`, `operator`, `dry_run`, `job_count`
- Context: `job_ids`, `reason`, `timestamp`, etc.

This provides a complete audit trail of all manual DLQ operations.
