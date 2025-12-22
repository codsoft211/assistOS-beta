# DLQ Operational Tooling - Command Reference & Workbench

**Document Version:** 1.0.0  
**Last Updated:** November 10, 2025  
**Owner:** Backend Team, Platform Team  
**Audience:** Backend Engineers, Platform Engineers, On-call Engineers  
**Classification:** INTERNAL USE ONLY

---

## 📋 Table of Contents

1. [Purpose](#purpose)
2. [Quick Start](#quick-start)
3. [Command Reference](#command-reference)
   - [dlq-retry-all](#1-dlq-retry-all)
   - [dlq-retry-filtered](#2-dlq-retry-filtered)
   - [dlq-retry-job](#3-dlq-retry-job)
   - [dlq-tag-jobs](#4-dlq-tag-jobs)
   - [dlq-export-jobs](#5-dlq-export-jobs)
   - [dlq-discard-jobs](#6-dlq-discard-jobs)
4. [Staging Test Scenarios](#staging-test-scenarios)
5. [Sentry Audit Verification](#sentry-audit-verification)
6. [Best Practices](#best-practices)
7. [Troubleshooting](#troubleshooting)
8. [Related Documentation](#related-documentation)

---

## Purpose

This workbench provides **command-line reference documentation** for all 6 DLQ (Dead Letter Queue) operational tooling scripts used to manage failed jobs in production.

**What is the DLQ?**  
The DLQ is a BullMQ queue that stores jobs that have **exhausted all retry attempts** (max 3 attempts with exponential backoff: 30s, 5min, 30min). Jobs in the DLQ require manual investigation to determine if they can be safely retried or need data fixes before reprocessing.

**Why These Scripts?**  
Manual DLQ intervention requires **precise control** and **audit trails**. These scripts provide:
- ✅ **Dry-run mode** by default (preview before execute)
- ✅ **Sentry audit logging** for compliance and post-mortem analysis
- ✅ **Flexible filtering** by error pattern, job ID, or bulk operations
- ✅ **CSV export** for offline analysis and team collaboration
- ✅ **Confirmation prompts** to prevent accidental data loss

**Use Cases:**
- **Bulk Retry:** API outage recovered, retry all failed jobs
- **Filtered Retry:** Specific error type fixed (e.g., rate limit increased)
- **Single Retry:** Data corruption fixed for specific tenant/user
- **Tagging:** Mark jobs for manual review (e.g., validation errors)
- **Export:** Share DLQ jobs with Backend Team for root cause analysis
- **Discard:** Permanently remove duplicate or unrecoverable jobs

---

## Quick Start

### Prerequisites

**System Requirements:**
- Node.js 20+ (check: `node --version`)
- tsx installed globally (check: `npx tsx --version`)
- Access to Redis instance (staging or production)
- Access to Sentry project (for audit logging)

**Environment Variables:**
```bash
# Required for all scripts
REDIS_URL=redis://localhost:6379  # Redis connection string

# Required for Sentry audit logging (recommended)
SENTRY_DSN=https://xxx@sentry.io/yyy
ENABLE_SENTRY=true

# Optional: Operator identification
OPERATOR_NAME=platform-team  # Default: system
```

### Installation & Setup

**Option 1: Using .env file (Recommended for local development)**
```bash
# 1. Create .env file in project root
cat > .env <<EOF
REDIS_URL=redis://localhost:6379
SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id
ENABLE_SENTRY=true
OPERATOR_NAME=$(whoami)
EOF

# 2. Test configuration
npx tsx scripts/dlq-retry-all.ts --dry-run --limit 1
```

**Option 2: Using Replit Secrets (Production)**
```bash
# 1. Navigate to Replit Secrets panel
# 2. Add secrets:
#    - REDIS_URL
#    - SENTRY_DSN
#    - ENABLE_SENTRY
#    - OPERATOR_NAME

# 3. Test configuration
npx tsx scripts/dlq-retry-all.ts --dry-run --limit 1
```

**Option 3: Inline environment variables (Quick testing)**
```bash
REDIS_URL=redis://localhost:6379 \
ENABLE_SENTRY=false \
npx tsx scripts/dlq-retry-all.ts --dry-run
```

### Basic Workflow

**Standard DLQ Triage Workflow:**
```bash
# Step 1: Investigate - Export all DLQ jobs for analysis
npx tsx scripts/dlq-export-jobs.ts --output /tmp/dlq-jobs-$(date +%Y%m%d).csv

# Step 2: Analyze - Review CSV to identify error patterns
# Open /tmp/dlq-jobs-*.csv in spreadsheet tool

# Step 3a: Retry - If error fixed (e.g., API recovered)
npx tsx scripts/dlq-retry-filtered.ts \
  --error-pattern "ECONNREFUSED" \
  --execute \
  --reason "API endpoint recovered at 14:30 UTC"

# Step 3b: Tag - If requires manual review
npx tsx scripts/dlq-tag-jobs.ts \
  --error-pattern "ValidationError" \
  --tag "manual_review_required" \
  --execute \
  --reason "Schema validation failed, needs data fix"

# Step 3c: Discard - If duplicate or unrecoverable
npx tsx scripts/dlq-discard-jobs.ts \
  --error-pattern "duplicate key" \
  --execute \
  --reason "Duplicate processing, original succeeded"
```

---

## Command Reference

### 1. dlq-retry-all

**Synopsis:**
```bash
npx tsx scripts/dlq-retry-all.ts [OPTIONS]
```

**Description:**  
Bulk retry **all jobs** from Dead Letter Queue (DLQ). Use this after system-wide issues are resolved (e.g., API outage, infrastructure failure).

**When to Use:**
- ✅ API/service outage recovered (all jobs affected)
- ✅ Infrastructure issue resolved (database, Redis, network)
- ✅ Configuration fix deployed (affects all job types)

**When NOT to Use:**
- ❌ Only specific error types need retry (use `dlq-retry-filtered` instead)
- ❌ Single tenant/user issue (use `dlq-retry-job` instead)
- ❌ Jobs require data fixes before retry (tag/export first)

**Flags:**

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--dry-run` | boolean | `true` | Preview retry without executing (safe mode) |
| `--execute` | boolean | `false` | Actually execute retry (overrides --dry-run) |
| `--reason` | string | required* | Reason for intervention (logged to Sentry) |
| `--operator` | string | `$OPERATOR_NAME` or `system` | Operator name for audit trail |
| `--limit` | number | `100` | Maximum number of jobs to process |
| `--yes` / `-y` | boolean | `false` | Skip confirmation prompt |

*Required when using `--execute`

**Examples:**

**Example 1: Preview bulk retry (dry-run)**
```bash
npx tsx scripts/dlq-retry-all.ts --dry-run

# Output:
# 🔄 DLQ Retry All - Bulk Retry Script
# ✅ Configuration loaded successfully
#    - Redis: redis://localhost:...
#    - Sentry: enabled
#    - Operator: platform-team
# 
# 📥 Fetching up to 100 jobs from DLQ...
#    - Found 45 jobs in DLQ
# 
# 📊 Job Summary (45 jobs):
# 
# By Original Queue:
#    - assistbuild: 25
#    - connector-sync: 12
#    - email-notifications: 8
# 
# By Tenant:
#    - tenant_123: 18
#    - tenant_456: 15
#    - tenant_789: 12
# 
# Top Errors:
#    - OpenAI API timeout (429): 30
#    - ECONNREFUSED: 10
#    - ValidationError: 5
# 
# 📋 DRY-RUN MODE: Preview only, no changes will be made
#    To execute, run with: --execute --reason "your reason here"
```

**Example 2: Execute bulk retry (after API outage)**
```bash
npx tsx scripts/dlq-retry-all.ts \
  --execute \
  --reason "OpenAI API recovered at 14:30 UTC, rate limits restored"

# Output:
# ⚠️  WARNING: You are about to retry 45 jobs
#    Mode: EXECUTE (changes will be applied)
#    Reason: OpenAI API recovered at 14:30 UTC, rate limits restored
#    Operator: platform-team
#
#    Proceed with bulk retry? (yes/no): yes
#
# 🔄 Retrying 45 jobs...
# 
# 📤 Moving job job_001 to assistbuild...
#    ✅ Job job_001 moved to assistbuild
# 📤 Moving job job_002 to assistbuild...
#    ✅ Job job_002 moved to assistbuild
# [... 43 more jobs ...]
# 
# ✅ Retry Complete:
#    - Successfully retried: 45 jobs
#    - Failed to retry: 0 jobs
# 
# ✅ Audit log sent to Sentry (level: warning)
```

**Example 3: Bulk retry with auto-confirm (CI/CD pipeline)**
```bash
npx tsx scripts/dlq-retry-all.ts \
  --execute \
  --reason "Automated retry after scheduled maintenance" \
  --yes

# Skips confirmation prompt
```

**Example 4: Limit bulk retry to 10 jobs (testing)**
```bash
npx tsx scripts/dlq-retry-all.ts \
  --execute \
  --reason "Testing retry mechanism" \
  --limit 10
```

**Output:**

**Success Output:**
```
✅ Retry Complete:
   - Successfully retried: 45 jobs
   - Failed to retry: 0 jobs

✅ Audit log sent to Sentry (level: warning)
✅ Script completed successfully
```

**Partial Failure Output:**
```
⚠️  Retry Complete with Errors:
   - Successfully retried: 42 jobs
   - Failed to retry: 3 jobs

❌ Failed jobs:
   - job_043: Error: originalQueue metadata missing
   - job_044: Error: Target queue 'unknown-queue' does not exist
   - job_045: Error: Job data corrupted, cannot deserialize

✅ Audit log sent to Sentry (level: warning)
⚠️  Script completed with errors (see above)
```

**Sentry Audit:**

When `--execute` is used, the following event is logged to Sentry:

```json
{
  "message": "dlq.manual_intervention",
  "level": "warning",
  "tags": {
    "action": "retry",
    "operator": "platform-team",
    "dry_run": "false",
    "job_count": "45"
  },
  "contexts": {
    "intervention": {
      "job_ids": ["job_001", "job_002", ..., "job_045"],
      "action": "retry",
      "reason": "OpenAI API recovered at 14:30 UTC, rate limits restored",
      "operator": "platform-team",
      "dry_run": false,
      "timestamp": "2025-11-10T14:45:00.000Z",
      "action": "bulk_retry",
      "total_jobs": 45,
      "retryable_jobs": 45,
      "success_count": 45,
      "failure_count": 0
    }
  }
}
```

---

### 2. dlq-retry-filtered

**Synopsis:**
```bash
npx tsx scripts/dlq-retry-filtered.ts --error-pattern <PATTERN> [OPTIONS]
```

**Description:**  
Retry jobs from DLQ that **match a specific error pattern**. Use this for targeted retries when only certain error types are resolved.

**When to Use:**
- ✅ Specific error type fixed (e.g., rate limit increased)
- ✅ Temporary network issue resolved (e.g., ECONNREFUSED)
- ✅ Third-party service recovered (e.g., specific API endpoint)

**When NOT to Use:**
- ❌ All errors resolved (use `dlq-retry-all` instead)
- ❌ Single specific job needs retry (use `dlq-retry-job` instead)
- ❌ Pattern matches jobs with different root causes (too broad)

**Flags:**

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--error-pattern` | string | **required** | Error message pattern (regex supported) |
| `--dry-run` | boolean | `true` | Preview retry without executing |
| `--execute` | boolean | `false` | Execute retry (requires --reason) |
| `--reason` | string | required* | Reason for intervention |
| `--operator` | string | `$OPERATOR_NAME` or `system` | Operator name |
| `--limit` | number | `100` | Maximum jobs to fetch from DLQ |
| `--yes` / `-y` | boolean | `false` | Skip confirmation |

*Required when using `--execute`

**Examples:**

**Example 1: Preview filtered retry (dry-run)**
```bash
npx tsx scripts/dlq-retry-filtered.ts \
  --error-pattern "ECONNREFUSED" \
  --dry-run

# Output:
# 🔍 DLQ Retry Filtered - Error Pattern Retry Script
# 
# 📋 Parsed Arguments:
#    - Mode: DRY-RUN
#    - Error Pattern: ECONNREFUSED
#    - Operator: platform-team
# 
# 📥 Fetching up to 100 jobs from DLQ...
#    - Found 45 jobs in DLQ
#
#    Total jobs in DLQ: 45
# 
# 🔍 Filtering jobs by error pattern: ECONNREFUSED
#    - Matched 12 out of 45 jobs
# 
# 📊 Job Summary (12 jobs):
# By Original Queue:
#    - connector-sync: 8
#    - email-notifications: 4
# 
# 📋 DRY-RUN MODE: Preview only, no changes will be made
#    Matched 12 out of 45 total jobs
```

**Example 2: Execute filtered retry (timeout errors fixed)**
```bash
npx tsx scripts/dlq-retry-filtered.ts \
  --error-pattern "timeout" \
  --execute \
  --reason "Increased API timeout from 30s to 60s"

# Output:
# ⚠️  WARNING: You are about to retry 18 jobs matching pattern "timeout"
#    Mode: EXECUTE (changes will be applied)
#    Reason: Increased API timeout from 30s to 60s
#    Matched: 18 out of 45 total jobs
# 
#    Proceed with filtered retry? (yes/no): yes
# 
# 🔄 Retrying 18 jobs...
# [... retry output ...]
# 
# ✅ Retry Complete:
#    - Successfully retried: 18 jobs
#    - Total DLQ jobs: 45
#    - Remaining in DLQ: 27
```

**Example 3: Case-insensitive pattern matching**
```bash
# Matches "ValidationError", "validationerror", "VALIDATIONERROR"
npx tsx scripts/dlq-retry-filtered.ts \
  --error-pattern "validationerror" \
  --dry-run
```

**Example 4: Regex pattern (advanced)**
```bash
# Match either "ECONNREFUSED" or "ETIMEDOUT"
npx tsx scripts/dlq-retry-filtered.ts \
  --error-pattern "ECONN(REFUSED|TIMEOUT)" \
  --dry-run
```

**Example 5: Specific API error code**
```bash
# Retry only 429 (rate limit) errors
npx tsx scripts/dlq-retry-filtered.ts \
  --error-pattern "429|rate limit exceeded" \
  --execute \
  --reason "Rate limit quota increased"
```

**Output:**

**Success with Partial Match:**
```
✅ Filtered Retry Complete:
   - Successfully retried: 12 jobs
   - Error pattern: ECONNREFUSED
   - Total DLQ jobs: 45
   - Remaining in DLQ: 33 (non-matching errors)

✅ Audit log sent to Sentry (level: warning)
```

**No Matches:**
```
✅ No jobs match error pattern: "ECONNREFUSED"
   Try a different pattern or check existing errors
```

**Sentry Audit:**

```json
{
  "message": "dlq.manual_intervention",
  "level": "warning",
  "tags": {
    "action": "retry",
    "operator": "platform-team",
    "dry_run": "false",
    "job_count": "12"
  },
  "contexts": {
    "intervention": {
      "job_ids": ["job_005", "job_012", ..., "job_043"],
      "action": "retry",
      "reason": "Increased API timeout from 30s to 60s",
      "operator": "platform-team",
      "dry_run": false,
      "timestamp": "2025-11-10T15:20:00.000Z",
      "action": "filtered_retry",
      "error_pattern": "timeout",
      "total_jobs": 45,
      "matched_jobs": 12,
      "success_count": 12,
      "failure_count": 0
    }
  }
}
```

---

### 3. dlq-retry-job

**Synopsis:**
```bash
npx tsx scripts/dlq-retry-job.ts --job-id <JOB_ID> --reason <REASON> [OPTIONS]
npx tsx scripts/dlq-retry-job.ts --job-ids <ID1>,<ID2>,<ID3> --reason <REASON> [OPTIONS]
```

**Description:**  
Retry **single or multiple specific jobs** from DLQ by job ID. Use this for surgical retries after manual data fixes.

**When to Use:**
- ✅ Data corruption fixed for specific tenant/user
- ✅ Missing data populated (e.g., external ID synced)
- ✅ Manual validation passed (e.g., invoice reviewed by human)
- ✅ Test retry after code fix (confirm fix works)

**When NOT to Use:**
- ❌ Multiple jobs with same error pattern (use `dlq-retry-filtered`)
- ❌ All DLQ jobs need retry (use `dlq-retry-all`)
- ❌ Job ID unknown (export DLQ first to find job IDs)

**Flags:**

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--job-id` | string | - | Single job ID to retry |
| `--job-ids` | string | - | Comma-separated job IDs |
| `--reason` | string | **required** | Reason for retry (audit trail) |
| `--operator` | string | `$OPERATOR_NAME` or `system` | Operator name |
| `--yes` / `-y` | boolean | `false` | Skip confirmation |

**Note:** No `--dry-run` flag. Use `--execute` is implicit (retrying specific jobs is intentional).

**Examples:**

**Example 1: Retry single job**
```bash
npx tsx scripts/dlq-retry-job.ts \
  --job-id "job_12345" \
  --reason "Data corruption fixed for tenant_123, missing externalId populated"

# Output:
# 🔧 DLQ Retry Job - Single/Multiple Job Retry Script
# 
# 📋 Target Jobs: job_12345
# 
# 📥 Fetching 1 jobs by ID...
#    - Found 1 out of 1 jobs
# 
# ============================================================
# 📋 Job Details: job_12345
# ============================================================
#    Queue: connector-sync
#    Tenant: tenant_123
#    User: user_456
#    Environment: production
#    Failed At: 2025-11-10T12:00:00.000Z
#    Attempts Made: 3
#    Error: Missing externalId for supplier integration
#    Tags: manual_review_required
# ============================================================
# 
# ⚠️  WARNING: You are about to retry 1 job
#    Reason: Data corruption fixed for tenant_123, missing externalId populated
# 
#    Proceed with retry? (yes/no): yes
# 
# 📤 Moving job job_12345 to connector-sync...
#    ✅ Job job_12345 moved to connector-sync
# 
# ✅ Retry Complete:
#    - Successfully retried: 1 jobs
```

**Example 2: Retry multiple specific jobs**
```bash
npx tsx scripts/dlq-retry-job.ts \
  --job-ids "job_001,job_002,job_003" \
  --reason "Batch retry after schema migration rollback"

# Retries 3 specific jobs
```

**Example 3: Auto-confirm retry (scripted workflow)**
```bash
# Export DLQ, find job IDs programmatically, then retry
JOB_ID=$(cat /tmp/dlq-export.csv | grep "tenant_123" | cut -d',' -f1)

npx tsx scripts/dlq-retry-job.ts \
  --job-id "$JOB_ID" \
  --reason "Automated retry after tenant_123 data fix" \
  --yes
```

**Example 4: Retry job not found in DLQ**
```bash
npx tsx scripts/dlq-retry-job.ts \
  --job-id "job_nonexistent" \
  --reason "Test"

# Output:
# ⚠️  Warning: 1 job(s) not found in DLQ:
#    - job_nonexistent
# 
# ❌ Error: No jobs found in DLQ with the provided IDs
#    Requested IDs: job_nonexistent
```

**Output:**

**Success:**
```
✅ Retry Complete:
   - Successfully retried: 1 jobs
   - Failed to retry: 0 jobs

✅ Audit log sent to Sentry (level: warning)
```

**Job Missing originalQueue:**
```
❌ Error: 1 job(s) missing originalQueue field
   Cannot retry jobs without originalQueue:
   - Job job_12345

⚠️  Jobs missing metadata may require manual investigation
```

**Sentry Audit:**

```json
{
  "message": "dlq.manual_intervention",
  "level": "warning",
  "tags": {
    "action": "retry",
    "operator": "platform-team",
    "dry_run": "false",
    "job_count": "1"
  },
  "contexts": {
    "intervention": {
      "job_ids": ["job_12345"],
      "action": "retry",
      "reason": "Data corruption fixed for tenant_123, missing externalId populated",
      "operator": "platform-team",
      "dry_run": false,
      "timestamp": "2025-11-10T16:00:00.000Z",
      "action": "single_retry",
      "success_count": 1,
      "failure_count": 0
    }
  }
}
```

---

### 4. dlq-tag-jobs

**Synopsis:**
```bash
npx tsx scripts/dlq-tag-jobs.ts --tag <TAG> [--job-ids <IDS> | --error-pattern <PATTERN>] [OPTIONS]
```

**Description:**  
Tag DLQ jobs for **manual review and tracking**. Tags are stored in job metadata and visible in CSV exports.

**When to Use:**
- ✅ Mark jobs for manual review (e.g., "manual_review_required")
- ✅ Categorize error types (e.g., "data_corruption", "schema_mismatch")
- ✅ Track investigation status (e.g., "investigated", "pending_fix")
- ✅ Defer retry decision (tag now, retry later after fix confirmed)

**When NOT to Use:**
- ❌ Jobs ready to retry immediately (use retry scripts instead)
- ❌ Jobs confirmed unrecoverable (discard instead)

**Flags:**

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--tag` | string | required* | Tag(s) to apply (comma-separated for multiple) |
| `--job-ids` | string | - | Comma-separated job IDs to tag |
| `--error-pattern` | string | - | Tag all jobs matching error pattern |
| `--dry-run` | boolean | `true` | Preview tagging without executing |
| `--execute` | boolean | `false` | Execute tagging (requires --reason) |
| `--reason` | string | required* | Reason for tagging |
| `--operator` | string | `$OPERATOR_NAME` or `system` | Operator name |
| `--limit` | number | `100` | Max jobs to fetch (with --error-pattern) |

*Required when using `--execute`

**Examples:**

**Example 1: Tag specific jobs (dry-run)**
```bash
npx tsx scripts/dlq-tag-jobs.ts \
  --job-ids "job_001,job_002" \
  --tag "manual_review_required" \
  --dry-run

# Output:
# 🏷️  DLQ Tag Jobs Script
# 
# 🔍 Mode: Tag specific jobs by ID
# 
# 📥 Fetching 2 jobs by ID...
#    - Found 2 out of 2 jobs
# 
# 📊 Job Summary (2 jobs):
# [... summary ...]
# 
# 📋 Tagging Preview:
#    - Jobs to tag: 2
#    - Tags to apply: manual_review_required
#    - Reason: N/A (dry-run)
#    - Mode: DRY-RUN
```

**Example 2: Tag jobs by error pattern (execute)**
```bash
npx tsx scripts/dlq-tag-jobs.ts \
  --error-pattern "ValidationError" \
  --tag "schema_validation_failed" \
  --execute \
  --reason "Schema validation failed, requires data model review"

# Output:
# 🔍 Mode: Tag jobs matching error pattern
# 
# 🔍 Filtering jobs by error pattern: ValidationError
#    - Matched 8 out of 45 jobs
# 
# 📋 Tagging Preview:
#    - Jobs to tag: 8
#    - Tags to apply: schema_validation_failed
#    - Reason: Schema validation failed, requires data model review
#    - Mode: EXECUTE
# 
# ⚠️  You are about to tag 8 jobs with "schema_validation_failed"
#    Proceed? (yes/no): yes
# 
# 🏷️  Tagging jobs...
# 🏷️  Tagging job job_005 with "schema_validation_failed"...
#    ✅ Tag "schema_validation_failed" added to job job_005
# [... 7 more ...]
# 
# ✅ Tagging Complete:
#    - Successfully tagged: 8 jobs
#    - Tags applied: schema_validation_failed
```

**Example 3: Multiple tags (comma-separated)**
```bash
npx tsx scripts/dlq-tag-jobs.ts \
  --job-ids "job_001" \
  --tag "urgent,data_corruption,requires_cto_review" \
  --execute \
  --reason "Critical data issue affecting revenue calculations"

# Applies 3 tags to job_001
```

**Example 4: Verify tags in export**
```bash
# Step 1: Tag jobs
npx tsx scripts/dlq-tag-jobs.ts \
  --error-pattern "ValidationError" \
  --tag "manual_review" \
  --execute \
  --reason "Needs review"

# Step 2: Export to verify tags
npx tsx scripts/dlq-export-jobs.ts --output /tmp/tagged-jobs.csv

# Step 3: Check CSV
cat /tmp/tagged-jobs.csv | grep "manual_review"
# Output:
# job_005,connector-sync,tenant_123,user_456,2025-11-10T12:00:00.000Z,3,"ValidationError: ...","manual_review"
```

**Output:**

**Success:**
```
✅ Tagging Complete:
   - Successfully tagged: 8 jobs
   - Failed to tag: 0 jobs
   - Tags applied: schema_validation_failed

✅ Audit log sent to Sentry (level: warning)
```

**Duplicate Tag Warning:**
```
🏷️  Tagging job job_005 with "manual_review"...
   ⚠️  Job job_005 already has tag "manual_review"

✅ Tagging Complete:
   - Successfully tagged: 7 jobs (1 already tagged)
```

**Sentry Audit:**

```json
{
  "message": "dlq.manual_intervention",
  "level": "warning",
  "tags": {
    "action": "tag",
    "operator": "platform-team",
    "dry_run": "false",
    "job_count": "8"
  },
  "contexts": {
    "intervention": {
      "job_ids": ["job_005", "job_012", ..., "job_043"],
      "action": "tag",
      "reason": "Schema validation failed, requires data model review",
      "operator": "platform-team",
      "dry_run": false,
      "timestamp": "2025-11-10T17:00:00.000Z",
      "tags": ["schema_validation_failed"],
      "success_count": 8,
      "failure_count": 0
    }
  }
}
```

---

### 5. dlq-export-jobs

**Synopsis:**
```bash
npx tsx scripts/dlq-export-jobs.ts --output <FILE.csv> [OPTIONS]
```

**Description:**  
Export DLQ jobs to **CSV file** for offline analysis, team collaboration, and audit trails.

**When to Use:**
- ✅ Share DLQ jobs with Backend Team for root cause analysis
- ✅ Archive DLQ snapshot before bulk operations
- ✅ Generate reports for post-mortem reviews
- ✅ Find specific job IDs for targeted retry

**When NOT to Use:**
- ❌ Real-time monitoring (use health endpoints or Sentry instead)
- ❌ Large exports (>1000 jobs) without --limit flag (performance)

**Flags:**

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--output` | string | **required** | Output CSV file path (must end in .csv) |
| `--job-ids` | string | - | Export only specific job IDs |
| `--error-pattern` | string | - | Export only jobs matching error pattern |
| `--limit` | number | `100` | Max jobs to fetch (default: 100) |
| `--operator` | string | `$OPERATOR_NAME` or `system` | Operator name (audit) |

**Note:** No `--dry-run` or `--execute` flags. Export is read-only (always executes).

**CSV Schema:**

| Column | Type | Description | Example |
|--------|------|-------------|---------|
| `job_id` | string | Job ID | `job_12345` |
| `original_queue` | string | Queue job came from | `connector-sync` |
| `tenant_id` | string | Tenant ID | `tenant_123` |
| `user_id` | string | User ID | `user_456` |
| `failed_at` | ISO 8601 | Timestamp of failure | `2025-11-10T12:00:00.000Z` |
| `attempts` | integer | Number of retry attempts made | `3` |
| `error_message` | string | Error message (truncated to 200 chars) | `"ValidationError: Missing required field..."` |
| `tags` | string | Semicolon-separated tags | `"manual_review; urgent"` |

**Examples:**

**Example 1: Export all DLQ jobs**
```bash
npx tsx scripts/dlq-export-jobs.ts --output /tmp/dlq-export-$(date +%Y%m%d).csv

# Output:
# 📄 DLQ Export Jobs Script
# 
# 🔍 Mode: Export all DLQ jobs
# 
# 📥 Fetching up to 100 jobs from DLQ...
#    - Found 45 jobs in DLQ
# 
# 📊 Job Summary (45 jobs):
# [... summary ...]
# 
# 📊 Preparing CSV export...
#    - Jobs to export: 45
#    - Output file: /tmp/dlq-export-20251110.csv
#    - CSV columns: job_id, original_queue, tenant_id, user_id, failed_at, attempts, error_message, tags
# 
# 📊 Exporting 45 jobs to CSV...
#    ✅ Exported 45 jobs to /tmp/dlq-export-20251110.csv
# 
# ✅ Export Complete:
#    - Exported 45 jobs to /tmp/dlq-export-20251110.csv
#    - CSV file ready for analysis
```

**Example 2: Export filtered jobs (by error pattern)**
```bash
npx tsx scripts/dlq-export-jobs.ts \
  --error-pattern "ValidationError" \
  --output /tmp/validation-errors.csv

# Exports only jobs with "ValidationError" in error message
```

**Example 3: Export specific jobs (by ID)**
```bash
npx tsx scripts/dlq-export-jobs.ts \
  --job-ids "job_001,job_002,job_003" \
  --output /tmp/specific-jobs.csv

# Exports only 3 specific jobs
```

**Example 4: Large export with limit**
```bash
npx tsx scripts/dlq-export-jobs.ts \
  --output /tmp/dlq-large-export.csv \
  --limit 500

# Exports up to 500 jobs (default is 100)
```

**Example 5: Review CSV in terminal**
```bash
# Export
npx tsx scripts/dlq-export-jobs.ts --output /tmp/dlq.csv

# View CSV (using column for pretty printing)
column -t -s',' /tmp/dlq.csv | less -S

# Or open in spreadsheet
open /tmp/dlq.csv  # macOS
xdg-open /tmp/dlq.csv  # Linux
```

**Output:**

**Success:**
```
✅ Export Complete:
   - Exported 45 jobs to /tmp/dlq-export-20251110.csv
   - CSV file ready for analysis

✅ Audit log sent to Sentry (level: warning)
✅ Script completed successfully
```

**No Jobs Found:**
```
⚠️  No jobs found matching criteria
   No CSV file will be created
```

**CSV Example:**

```csv
job_id,original_queue,tenant_id,user_id,failed_at,attempts,error_message,tags
job_001,assistbuild,tenant_123,user_456,2025-11-10T12:00:00.000Z,3,"OpenAI API timeout (429): Rate limit exceeded","manual_review"
job_002,connector-sync,tenant_123,user_789,2025-11-10T12:05:00.000Z,3,"ECONNREFUSED: Connection refused to external API",""
job_003,email-notifications,tenant_456,user_101,2025-11-10T12:10:00.000Z,3,"ValidationError: Missing required field 'email'","urgent; data_corruption"
```

**Sentry Audit:**

```json
{
  "message": "dlq.manual_intervention",
  "level": "warning",
  "tags": {
    "action": "export",
    "operator": "platform-team",
    "dry_run": "false",
    "job_count": "45"
  },
  "contexts": {
    "intervention": {
      "job_ids": ["job_001", "job_002", ..., "job_045"],
      "action": "export",
      "reason": "Manual export for offline analysis",
      "operator": "platform-team",
      "dry_run": false,
      "timestamp": "2025-11-10T18:00:00.000Z",
      "output_file": "/tmp/dlq-export-20251110.csv",
      "job_count": 45,
      "export_mode": "all"
    }
  }
}
```

---

### 6. dlq-discard-jobs

**Synopsis:**
```bash
npx tsx scripts/dlq-discard-jobs.ts [--job-ids <IDS> | --error-pattern <PATTERN>] --reason <REASON> [OPTIONS]
```

**Description:**  
⚠️ **DANGER:** Permanently **discard** unrecoverable jobs from DLQ. **This action cannot be undone!**

**When to Use:**
- ✅ Duplicate jobs (original processing succeeded)
- ✅ Corrupted job data (cannot be deserialized)
- ✅ Jobs for deleted tenants/users (no longer relevant)
- ✅ Test jobs from staging environment (accidentally in production)

**When NOT to Use:**
- ❌ Jobs that might be retried later (tag instead)
- ❌ Unsure if jobs are recoverable (export + tag first)
- ❌ Jobs with valuable data (export for archive first)

**⚠️ SAFETY FEATURES:**
- Dry-run mode by default
- Requires `--execute` and `--reason` flags
- Confirmation prompt requires typing "DISCARD"
- Extra confirmation for >10 jobs
- Sentry audit logging with reason

**Flags:**

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--job-ids` | string | - | Comma-separated job IDs to discard |
| `--error-pattern` | string | - | Discard all jobs matching error pattern |
| `--dry-run` | boolean | `true` | Preview discard without executing |
| `--execute` | boolean | `false` | Execute discard (requires --reason) |
| `--reason` | string | required* | Reason for discarding (audit trail) |
| `--operator` | string | `$OPERATOR_NAME` or `system` | Operator name |
| `--limit` | number | `100` | Max jobs to fetch (with --error-pattern) |
| `--yes` | boolean | `false` | Skip confirmation (DANGEROUS!) |

*Required when using `--execute`

**Examples:**

**Example 1: Preview discard (dry-run)**
```bash
npx tsx scripts/dlq-discard-jobs.ts \
  --job-ids "job_001,job_002" \
  --reason "Duplicate jobs, original processing succeeded" \
  --dry-run

# Output:
# 🗑️  DLQ Discard Jobs Script
# ⚠️  DANGER: This script permanently removes jobs from DLQ!
# 
# 🔍 Mode: Discard specific jobs by ID (RECOMMENDED)
# 
# 📥 Fetching 2 jobs by ID...
#    - Found 2 out of 2 jobs
# 
# 📊 Job Summary (2 jobs):
# [... summary ...]
# 
# 📋 Discard Preview:
#    - Jobs to discard: 2
#    - Reason: Duplicate jobs, original processing succeeded
#    - Mode: DRY-RUN
```

**Example 2: Execute discard (with confirmation)**
```bash
npx tsx scripts/dlq-discard-jobs.ts \
  --job-ids "job_001,job_002" \
  --execute \
  --reason "Duplicate key errors, original jobs succeeded, confirmed via database check"

# Output:
# ⚠️  DANGER WARNING:
#    - 2 jobs will be PERMANENTLY deleted from DLQ
#    - This action CANNOT be undone
#    - Jobs will be lost forever
# 
# ⚠️  To confirm, type "DISCARD" exactly: DISCARD
# 
# 🗑️  Discarding jobs...
# 🗑️  Removing job job_001 from DLQ...
#    ✅ Job job_001 removed from DLQ
# 🗑️  Removing job job_002 from DLQ...
#    ✅ Job job_002 removed from DLQ
# 
# ✅ Discard Complete:
#    - Successfully discarded: 2 jobs
#    - Failed to discard: 0 jobs
# 
# ✅ Audit log sent to Sentry (level: warning)
```

**Example 3: Discard by error pattern (DANGEROUS!)**
```bash
npx tsx scripts/dlq-discard-jobs.ts \
  --error-pattern "duplicate key" \
  --execute \
  --reason "All duplicate key errors verified as successful in database"

# Output:
# ⚠️  WARNING: Using --error-pattern mode!
#    This will discard ALL jobs matching the pattern.
#    Consider using --job-ids for safer, explicit selection.
# 
# 🔍 Mode: Discard jobs matching error pattern (DANGEROUS!)
# 
# 🔍 Filtering jobs by error pattern: duplicate key
#    - Matched 15 out of 45 jobs
# 
# ⚠️  DANGER WARNING:
#    - 15 jobs will be PERMANENTLY deleted from DLQ
#    - This action CANNOT be undone
#    - Jobs will be lost forever
# 
# ⚠️  To confirm, type "DISCARD" exactly: DISCARD
# 
# ⚠️  EXTRA CONFIRMATION (>10 jobs):
#    You are about to discard 15 jobs. This is a large operation.
#    Type "CONFIRM DISCARD 15 JOBS" exactly: CONFIRM DISCARD 15 JOBS
# 
# [... discard output ...]
```

**Example 4: Skip confirmation (CI/CD automation - VERY DANGEROUS!)**
```bash
# ⚠️ WARNING: Use with extreme caution!
npx tsx scripts/dlq-discard-jobs.ts \
  --job-ids "job_001" \
  --execute \
  --reason "Automated cleanup of test jobs" \
  --yes

# Skips both "DISCARD" and extra confirmations
```

**Example 5: Safe workflow (export before discard)**
```bash
# Step 1: Export jobs for archive (safety backup)
npx tsx scripts/dlq-export-jobs.ts \
  --error-pattern "duplicate key" \
  --output /tmp/duplicates-archive-$(date +%Y%m%d).csv

# Step 2: Review CSV to confirm jobs are truly duplicates
cat /tmp/duplicates-archive-*.csv

# Step 3: Discard after confirmation
npx tsx scripts/dlq-discard-jobs.ts \
  --error-pattern "duplicate key" \
  --execute \
  --reason "Duplicates confirmed via CSV review, archived to /tmp/duplicates-archive-20251110.csv"
```

**Output:**

**Success:**
```
✅ Discard Complete:
   - Successfully discarded: 15 jobs
   - Failed to discard: 0 jobs

⚠️  Jobs permanently removed from DLQ
✅ Audit log sent to Sentry (level: warning)
```

**Confirmation Cancelled:**
```
⚠️  To confirm, type "DISCARD" exactly: cancel

❌ Operation cancelled by user
```

**Sentry Audit:**

```json
{
  "message": "dlq.manual_intervention",
  "level": "warning",
  "tags": {
    "action": "discard",
    "operator": "platform-team",
    "dry_run": "false",
    "job_count": "15"
  },
  "contexts": {
    "intervention": {
      "job_ids": ["job_010", "job_015", ..., "job_045"],
      "action": "discard",
      "reason": "All duplicate key errors verified as successful in database",
      "operator": "platform-team",
      "dry_run": false,
      "timestamp": "2025-11-10T19:00:00.000Z",
      "discard_mode": "by_pattern",
      "error_pattern": "duplicate key",
      "success_count": 15,
      "failure_count": 0
    }
  }
}
```

---

## Staging Test Scenarios

These test scenarios validate DLQ operational tooling in staging environment before production use.

### Prerequisites for Testing

```bash
# 1. Verify staging environment configured
echo $REDIS_URL  # Should be staging Redis
echo $SENTRY_DSN  # Should be staging Sentry project

# 2. Ensure DLQ has test jobs
curl -f http://localhost:5000/api/health/readyz | jq '.queues[] | select(.name=="dlq")'

# If DLQ is empty, create test jobs:
# [Instructions for creating test jobs would go here - implementation-specific]
```

---

### Test Scenario 1: Bulk Retry After API Outage

**Scenario:**  
OpenAI API recovered after 30-minute outage. 45 jobs in DLQ all failed with timeout errors.

**Prerequisites:**
- DLQ contains ≥10 jobs with API timeout errors
- OpenAI API healthy (or test with mock API)

**Steps:**

**1.1 Verify DLQ Depth**
```bash
curl -f http://localhost:5000/api/health/readyz | jq '.queues[] | select(.name=="dlq")'

# Expected output:
# {
#   "name": "dlq",
#   "active": 0,
#   "waiting": 45,
#   "depth": 45,
#   "success_rate": null
# }
```

**1.2 Preview Bulk Retry (Dry-Run)**
```bash
npx tsx scripts/dlq-retry-all.ts --dry-run

# Expected output:
# 📊 Job Summary (45 jobs):
# By Original Queue:
#    - assistbuild: 25
#    - connector-sync: 12
#    - email-notifications: 8
# 
# 📋 DRY-RUN MODE: Preview only, no changes will be made
```

**1.3 Review Output**
- ✅ Verify job counts match health endpoint
- ✅ Verify error patterns show API timeouts
- ✅ Verify originalQueue present for all jobs
- ✅ Verify tenant distribution makes sense

**1.4 Execute Bulk Retry**
```bash
npx tsx scripts/dlq-retry-all.ts \
  --execute \
  --reason "OpenAI API recovered at 14:30 UTC, rate limits restored, confirmed via status page"

# Expected prompts:
# ⚠️  WARNING: You are about to retry 45 jobs
#    Proceed with bulk retry? (yes/no): yes
```

**1.5 Monitor Queue Processing**
```bash
# Watch DLQ depth decrease
watch -n 5 'curl -sf http://localhost:5000/api/health/readyz | jq ".queues[] | select(.name==\"dlq\") | .depth"'

# Expected: Depth decreases from 45 to 0
```

**1.6 Verify Sentry Audit Event**
- Navigate to: Sentry > Events > Search: `message:"dlq.manual_intervention"`
- Filter: Last 1 hour, environment=development

**Expected Results:**
- ✅ 45 jobs moved from DLQ back to original queues
- ✅ Sentry event logged with:
  - `action="retry"`
  - `job_count=45`
  - `operator="platform-team"`
  - `reason="OpenAI API recovered at 14:30 UTC..."`
- ✅ Queue depths return to normal within 5 minutes
- ✅ No jobs re-fail and return to DLQ (confirms fix was successful)

---

### Test Scenario 2: Filtered Retry by Error Pattern

**Scenario:**  
Rate limit errors resolved (quota increased). Need to retry only ECONNREFUSED jobs, not other error types.

**Prerequisites:**
- DLQ contains mix of error types: ECONNREFUSED, timeout, ValidationError
- At least 5 jobs with ECONNREFUSED errors

**Steps:**

**2.1 Preview Filtered Retry**
```bash
npx tsx scripts/dlq-retry-filtered.ts \
  --error-pattern "ECONNREFUSED" \
  --dry-run

# Expected output:
# 🔍 Filtering jobs by error pattern: ECONNREFUSED
#    - Matched 12 out of 45 jobs
# 
# Top Errors:
#    - ECONNREFUSED: Connection refused to exte...: 12
```

**2.2 Verify Pattern Matching**
```bash
# Export all jobs to verify error distribution
npx tsx scripts/dlq-export-jobs.ts --output /tmp/dlq-before-filter.csv

# Check error breakdown
cat /tmp/dlq-before-filter.csv | cut -d',' -f7 | sort | uniq -c

# Expected:
#   12 "ECONNREFUSED: Connection refused..."
#   18 "OpenAI API timeout (429)..."
#   15 "ValidationError: Missing required..."
```

**2.3 Execute Filtered Retry**
```bash
npx tsx scripts/dlq-retry-filtered.ts \
  --error-pattern "ECONNREFUSED" \
  --execute \
  --reason "External API connection restored, firewall rule updated"

# Expected prompts:
# ⚠️  WARNING: You are about to retry 12 jobs matching pattern "ECONNREFUSED"
#    Proceed with filtered retry? (yes/no): yes
```

**2.4 Verify Selective Retry**
```bash
# Export remaining DLQ jobs
npx tsx scripts/dlq-export-jobs.ts --output /tmp/dlq-after-filter.csv

# Check remaining errors (should NOT include ECONNREFUSED)
cat /tmp/dlq-after-filter.csv | cut -d',' -f7 | grep -i "econnrefused"

# Expected: No matches (all ECONNREFUSED jobs retried)
```

**2.5 Verify Sentry Context**
- Navigate to: Sentry > Events > Search: `message:"dlq.manual_intervention"`
- Check event context includes: `error_pattern: "ECONNREFUSED"`

**Expected Results:**
- ✅ Only 12 jobs matching "ECONNREFUSED" retried
- ✅ Other error patterns (timeout, ValidationError) remain in DLQ (33 jobs)
- ✅ Sentry event includes:
  - `action="retry"`
  - `matched_jobs=12`
  - `total_jobs=45`
  - `error_pattern="ECONNREFUSED"`
- ✅ DLQ depth = 33 (45 - 12)

---

### Test Scenario 3: Single Job Retry After Manual Fix

**Scenario:**  
Data corruption fixed for tenant_123. Need to retry specific job that failed due to missing `externalId`.

**Prerequisites:**
- At least 1 job in DLQ for tenant_123
- Data fix applied (e.g., `externalId` populated in database)

**Steps:**

**3.1 Find Job ID in DLQ**
```bash
# Export all DLQ jobs
npx tsx scripts/dlq-export-jobs.ts --output /tmp/dlq-jobs.csv

# Find job for tenant_123
grep "tenant_123" /tmp/dlq-jobs.csv

# Expected output:
# job_12345,connector-sync,tenant_123,user_456,2025-11-10T12:00:00.000Z,3,"Missing externalId for supplier integration",""
```

**3.2 Review Job Details**
```bash
# Copy job_id from CSV (e.g., job_12345)
JOB_ID="job_12345"

# Preview retry (script shows job details)
npx tsx scripts/dlq-retry-job.ts \
  --job-id "$JOB_ID" \
  --reason "Data corruption fixed for tenant_123, missing externalId populated"

# Expected output:
# ============================================================
# 📋 Job Details: job_12345
# ============================================================
#    Queue: connector-sync
#    Tenant: tenant_123
#    User: user_456
#    Failed At: 2025-11-10T12:00:00.000Z
#    Attempts Made: 3
#    Error: Missing externalId for supplier integration
# ============================================================
```

**3.3 Execute Job Retry**
```bash
npx tsx scripts/dlq-retry-job.ts \
  --job-id "$JOB_ID" \
  --reason "Data corruption fixed for tenant_123, missing externalId populated via SQL update"

# Expected prompts:
# ⚠️  WARNING: You are about to retry 1 job
#    Proceed with retry? (yes/no): yes
```

**3.4 Monitor Job Processing**
```bash
# Watch connector-sync queue for job processing
curl -sf http://localhost:5000/api/health/readyz | jq '.queues[] | select(.name=="connector-sync")'

# Expected: Job should process successfully within 30 seconds
```

**3.5 Verify Job Success**
```bash
# Check if job returned to DLQ (should not)
npx tsx scripts/dlq-export-jobs.ts --output /tmp/dlq-after-retry.csv
grep "$JOB_ID" /tmp/dlq-after-retry.csv

# Expected: No match (job processed successfully)
```

**Expected Results:**
- ✅ Single job `job_12345` retried successfully
- ✅ Job processes without error (data fix confirmed working)
- ✅ Job does NOT return to DLQ (success indicator)
- ✅ Sentry event includes:
  - `action="retry"`
  - `job_ids=["job_12345"]`
  - `reason="Data corruption fixed..."`

---

### Test Scenario 4: Tag Jobs for Manual Review

**Scenario:**  
ValidationError jobs require manual data investigation before retry. Tag them for tracking.

**Prerequisites:**
- DLQ contains ≥5 jobs with ValidationError errors

**Steps:**

**4.1 Preview Tagging**
```bash
npx tsx scripts/dlq-tag-jobs.ts \
  --error-pattern "ValidationError" \
  --tag "manual_review_required" \
  --dry-run

# Expected output:
# 🔍 Filtering jobs by error pattern: ValidationError
#    - Matched 8 out of 45 jobs
# 
# 📋 Tagging Preview:
#    - Jobs to tag: 8
#    - Tags to apply: manual_review_required
#    - Mode: DRY-RUN
```

**4.2 Execute Tagging**
```bash
npx tsx scripts/dlq-tag-jobs.ts \
  --error-pattern "ValidationError" \
  --tag "manual_review_required" \
  --execute \
  --reason "Schema validation failed, requires manual data investigation"

# Expected prompts:
# ⚠️  You are about to tag 8 jobs with "manual_review_required"
#    Proceed? (yes/no): yes
```

**4.3 Verify Tags in Export**
```bash
# Export tagged jobs
npx tsx scripts/dlq-export-jobs.ts --output /tmp/validation-errors.csv

# Check tags column
cat /tmp/validation-errors.csv | grep "manual_review_required"

# Expected output (sample):
# job_005,connector-sync,tenant_123,user_456,2025-11-10T12:00:00.000Z,3,"ValidationError: Missing required field 'email'","manual_review_required"
# [... 7 more rows ...]
```

**4.4 Verify Multiple Tags**
```bash
# Add second tag to same jobs
npx tsx scripts/dlq-tag-jobs.ts \
  --error-pattern "ValidationError" \
  --tag "urgent" \
  --execute \
  --reason "Blocking customer onboarding"

# Export again
npx tsx scripts/dlq-export-jobs.ts --output /tmp/validation-errors-updated.csv

# Check tags column (should have both tags)
cat /tmp/validation-errors-updated.csv | grep "ValidationError"

# Expected: Tags column shows "manual_review_required; urgent"
```

**Expected Results:**
- ✅ All 8 ValidationError jobs tagged with "manual_review_required"
- ✅ Tags visible in CSV export (tags column)
- ✅ Multiple tags supported (semicolon-separated)
- ✅ Sentry event includes:
  - `action="tag"`
  - `tags=["manual_review_required"]`
  - `job_count=8`

---

### Test Scenario 5: Export Jobs for Offline Analysis

**Scenario:**  
Need to share DLQ jobs with Backend Team for root cause analysis. Export to CSV and verify schema.

**Prerequisites:**
- DLQ contains ≥10 jobs

**Steps:**

**5.1 Export All DLQ Jobs**
```bash
npx tsx scripts/dlq-export-jobs.ts --output /tmp/dlq-export-$(date +%Y%m%d).csv

# Expected output:
# 📊 Preparing CSV export...
#    - Jobs to export: 45
#    - Output file: /tmp/dlq-export-20251110.csv
#    - CSV columns: job_id, original_queue, tenant_id, user_id, failed_at, attempts, error_message, tags
# 
# ✅ Export Complete:
#    - Exported 45 jobs to /tmp/dlq-export-20251110.csv
```

**5.2 Verify CSV Schema (8 columns)**
```bash
# Check header row
head -1 /tmp/dlq-export-*.csv

# Expected:
# job_id,original_queue,tenant_id,user_id,failed_at,attempts,error_message,tags
```

**5.3 Verify Data Integrity**
```bash
# Count rows (should match job count + 1 header)
wc -l /tmp/dlq-export-*.csv
# Expected: 46 (45 jobs + 1 header)

# Check for proper CSV escaping (quotes in error messages)
grep '"' /tmp/dlq-export-*.csv | head -3

# Expected: Error messages wrapped in quotes
# "ValidationError: Missing field ""email"" in payload"
```

**5.4 Verify Timestamps (ISO 8601)**
```bash
# Check failed_at column (5th column)
cat /tmp/dlq-export-*.csv | cut -d',' -f5 | head -5

# Expected format:
# failed_at
# 2025-11-10T12:00:00.000Z
# 2025-11-10T12:05:00.000Z
# 2025-11-10T12:10:00.000Z
```

**5.5 Verify Error Truncation (200 chars)**
```bash
# Check longest error message
cat /tmp/dlq-export-*.csv | cut -d',' -f7 | awk '{ print length, $0 }' | sort -nr | head -1

# Expected: Max length ≤ 203 (200 chars + quotes + "...")
```

**5.6 Share CSV via Email (simulated)**
```bash
# Copy CSV to shared folder (in production, email to team)
cp /tmp/dlq-export-*.csv /shared/backend-team/

# Or generate shareable link
echo "CSV available at: file:///tmp/dlq-export-$(date +%Y%m%d).csv"
```

**Expected Results:**
- ✅ CSV file created with proper schema (8 columns)
- ✅ All columns populated correctly:
  - `job_id`: Non-empty string
  - `original_queue`: Valid queue name
  - `tenant_id`, `user_id`: UUID format or "unknown"
  - `failed_at`: ISO 8601 timestamp
  - `attempts`: Integer (typically 3)
  - `error_message`: Properly escaped, ≤200 chars
  - `tags`: Semicolon-separated or empty
- ✅ Quotes and commas in error messages properly escaped
- ✅ File ready for Excel/Google Sheets import

---

### Test Scenario 6: Discard Duplicate Jobs

**Scenario:**  
Duplicate key errors indicate jobs already processed successfully. Safe to discard after verification.

**Prerequisites:**
- DLQ contains ≥3 jobs with "duplicate key" errors
- Database verification confirms original processing succeeded

**Steps:**

**6.1 Export for Safety Archive**
```bash
# CRITICAL: Always export before discarding!
npx tsx scripts/dlq-export-jobs.ts \
  --error-pattern "duplicate key" \
  --output /tmp/duplicates-archive-$(date +%Y%m%d).csv

# Expected output:
# ✅ Export Complete:
#    - Exported 15 jobs to /tmp/duplicates-archive-20251110.csv
```

**6.2 Verify Duplicates in Database**
```bash
# Review CSV to get job IDs
cat /tmp/duplicates-archive-*.csv

# Manually verify in database that original processing succeeded
# (Implementation-specific SQL queries)
```

**6.3 Preview Discard (Dry-Run)**
```bash
npx tsx scripts/dlq-discard-jobs.ts \
  --error-pattern "duplicate key" \
  --reason "Jobs already processed successfully, confirmed via database check" \
  --dry-run

# Expected output:
# 📋 Discard Preview:
#    - Jobs to discard: 15
#    - Reason: Jobs already processed successfully, confirmed via database check
#    - Mode: DRY-RUN
```

**6.4 Execute Discard with Confirmation**
```bash
npx tsx scripts/dlq-discard-jobs.ts \
  --error-pattern "duplicate key" \
  --execute \
  --reason "Duplicates confirmed via CSV review and database check, archived to /tmp/duplicates-archive-20251110.csv"

# Expected prompts:
# ⚠️  DANGER WARNING:
#    - 15 jobs will be PERMANENTLY deleted from DLQ
#    - This action CANNOT be undone
# 
# ⚠️  To confirm, type "DISCARD" exactly: DISCARD
# 
# ⚠️  EXTRA CONFIRMATION (>10 jobs):
#    You are about to discard 15 jobs. This is a large operation.
#    Type "CONFIRM DISCARD 15 JOBS" exactly: CONFIRM DISCARD 15 JOBS
```

**6.5 Verify Jobs Removed**
```bash
# Export DLQ after discard
npx tsx scripts/dlq-export-jobs.ts --output /tmp/dlq-after-discard.csv

# Verify no "duplicate key" errors remain
grep -i "duplicate key" /tmp/dlq-after-discard.csv

# Expected: No matches
```

**6.6 Verify DLQ Depth Decreased**
```bash
curl -sf http://localhost:5000/api/health/readyz | jq '.queues[] | select(.name=="dlq") | .depth'

# Expected: Depth decreased by 15 (e.g., 45 → 30)
```

**Expected Results:**
- ✅ 15 duplicate jobs permanently removed from DLQ
- ✅ Confirmation prompts required:
  - Type "DISCARD" (standard confirmation)
  - Type "CONFIRM DISCARD 15 JOBS" (extra confirmation for >10 jobs)
- ✅ Sentry event logged with:
  - `action="discard"`
  - `reason="Duplicates confirmed..."`
  - `job_ids=[...15 job IDs...]`
  - `error_pattern="duplicate key"`
- ✅ Archive CSV preserved for audit trail
- ✅ DLQ depth decreased by 15

---

## Sentry Audit Verification

All DLQ operational scripts log audit events to Sentry for compliance, post-mortem analysis, and security tracking.

### Accessing Sentry Audit Trail

**Sentry Dashboard Navigation:**
```
1. Navigate to: Sentry Project > Events
2. Search: message:"dlq.manual_intervention"
3. Filter by:
   - Last 24 hours (or custom range)
   - Environment: development / staging / production
   - Tags: action, operator, dry_run
```

**Direct Search URL:**
```
https://sentry.io/organizations/assistos/issues/?query=message%3A%22dlq.manual_intervention%22&environment=development
```

### Event Schema

**Common Fields (All Actions):**

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `message` | string | Event type identifier | `"dlq.manual_intervention"` |
| `level` | string | Severity level | `"warning"` (execute), `"info"` (dry-run) |
| `timestamp` | ISO 8601 | Event timestamp | `"2025-11-10T14:45:00.000Z"` |
| `environment` | string | Environment name | `"development"`, `"production"` |

**Tags:**

| Tag | Type | Description | Example |
|-----|------|-------------|---------|
| `action` | string | DLQ operation type | `"retry"`, `"discard"`, `"tag"`, `"export"` |
| `operator` | string | Operator identifier | `"platform-team"`, `"john.doe"` |
| `dry_run` | boolean | Dry-run mode flag | `"true"`, `"false"` |
| `job_count` | integer | Number of jobs affected | `"45"` |

**Context (intervention):**

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `job_ids` | string[] | Array of job IDs | `["job_001", "job_002", ...]` |
| `action` | string | Action type (duplicate of tag) | `"retry"` |
| `reason` | string | Operator-provided reason | `"OpenAI API recovered at 14:30 UTC"` |
| `operator` | string | Operator identifier | `"platform-team"` |
| `dry_run` | boolean | Dry-run flag | `false` |
| `timestamp` | ISO 8601 | Intervention timestamp | `"2025-11-10T14:45:00.000Z"` |

**Action-Specific Context:**

**Retry Actions:**
- `action`: `"bulk_retry"` / `"filtered_retry"` / `"single_retry"`
- `total_jobs`: Total jobs in DLQ
- `retryable_jobs`: Jobs with `originalQueue` metadata
- `success_count`: Successfully retried jobs
- `failure_count`: Failed retry attempts
- `error_pattern`: (filtered_retry only) Error pattern matched

**Tag Actions:**
- `tags`: Array of applied tags (e.g., `["manual_review", "urgent"]`)
- `success_count`: Successfully tagged jobs
- `failure_count`: Failed tag operations

**Export Actions:**
- `output_file`: CSV file path (e.g., `"/tmp/dlq-export-20251110.csv"`)
- `job_count`: Total exported jobs
- `export_mode`: `"all"` / `"by_id"` / `"by_pattern"`

**Discard Actions:**
- `discard_mode`: `"by_id"` / `"by_pattern"`
- `error_pattern`: (by_pattern only) Error pattern matched
- `success_count`: Successfully discarded jobs
- `failure_count`: Failed discard operations

### Example Audit Events

**Example 1: Bulk Retry (Execute)**
```json
{
  "event_id": "a1b2c3d4e5f6",
  "message": "dlq.manual_intervention",
  "level": "warning",
  "timestamp": "2025-11-10T14:45:00.000Z",
  "environment": "production",
  "tags": {
    "action": "retry",
    "operator": "platform-team",
    "dry_run": "false",
    "job_count": "45"
  },
  "contexts": {
    "intervention": {
      "job_ids": ["job_001", "job_002", ..., "job_045"],
      "action": "retry",
      "reason": "OpenAI API recovered at 14:30 UTC, rate limits restored",
      "operator": "platform-team",
      "dry_run": false,
      "timestamp": "2025-11-10T14:45:00.000Z",
      "action": "bulk_retry",
      "total_jobs": 45,
      "retryable_jobs": 45,
      "success_count": 45,
      "failure_count": 0
    }
  }
}
```

**Example 2: Filtered Retry (Dry-Run)**
```json
{
  "event_id": "f6e5d4c3b2a1",
  "message": "dlq.manual_intervention",
  "level": "info",
  "timestamp": "2025-11-10T15:00:00.000Z",
  "environment": "development",
  "tags": {
    "action": "retry",
    "operator": "john.doe",
    "dry_run": "true",
    "job_count": "12"
  },
  "contexts": {
    "intervention": {
      "job_ids": ["job_005", "job_012", ..., "job_043"],
      "action": "retry",
      "reason": "Testing filtered retry",
      "operator": "john.doe",
      "dry_run": true,
      "timestamp": "2025-11-10T15:00:00.000Z",
      "action": "filtered_retry",
      "error_pattern": "ECONNREFUSED",
      "total_jobs": 45,
      "matched_jobs": 12,
      "success_count": 0,
      "failure_count": 0
    }
  }
}
```

**Example 3: Tag Jobs**
```json
{
  "event_id": "1a2b3c4d5e6f",
  "message": "dlq.manual_intervention",
  "level": "warning",
  "timestamp": "2025-11-10T16:00:00.000Z",
  "environment": "production",
  "tags": {
    "action": "tag",
    "operator": "backend-team",
    "dry_run": "false",
    "job_count": "8"
  },
  "contexts": {
    "intervention": {
      "job_ids": ["job_010", "job_015", ..., "job_045"],
      "action": "tag",
      "reason": "Schema validation failed, requires manual data investigation",
      "operator": "backend-team",
      "dry_run": false,
      "timestamp": "2025-11-10T16:00:00.000Z",
      "tags": ["manual_review_required", "urgent"],
      "success_count": 8,
      "failure_count": 0
    }
  }
}
```

**Example 4: Export Jobs**
```json
{
  "event_id": "6f5e4d3c2b1a",
  "message": "dlq.manual_intervention",
  "level": "warning",
  "timestamp": "2025-11-10T17:00:00.000Z",
  "environment": "production",
  "tags": {
    "action": "export",
    "operator": "platform-team",
    "dry_run": "false",
    "job_count": "45"
  },
  "contexts": {
    "intervention": {
      "job_ids": ["job_001", "job_002", ..., "job_045"],
      "action": "export",
      "reason": "Manual export for offline analysis",
      "operator": "platform-team",
      "dry_run": false,
      "timestamp": "2025-11-10T17:00:00.000Z",
      "output_file": "/tmp/dlq-export-20251110.csv",
      "job_count": 45,
      "export_mode": "all"
    }
  }
}
```

**Example 5: Discard Jobs**
```json
{
  "event_id": "9z8y7x6w5v4u",
  "message": "dlq.manual_intervention",
  "level": "warning",
  "timestamp": "2025-11-10T18:00:00.000Z",
  "environment": "production",
  "tags": {
    "action": "discard",
    "operator": "platform-team",
    "dry_run": "false",
    "job_count": "15"
  },
  "contexts": {
    "intervention": {
      "job_ids": ["job_020", "job_025", ..., "job_090"],
      "action": "discard",
      "reason": "Duplicate key errors verified as successful in database, archived to /tmp/duplicates-20251110.csv",
      "operator": "platform-team",
      "dry_run": false,
      "timestamp": "2025-11-10T18:00:00.000Z",
      "discard_mode": "by_pattern",
      "error_pattern": "duplicate key",
      "success_count": 15,
      "failure_count": 0
    }
  }
}
```

### Querying Audit Trail

**Example Sentry Queries:**

**1. All DLQ interventions (last 24 hours):**
```
message:"dlq.manual_intervention" is:unresolved
```

**2. Production retries only:**
```
message:"dlq.manual_intervention" action:retry environment:production
```

**3. Large operations (>10 jobs):**
```
message:"dlq.manual_intervention" job_count:>=10
```

**4. Discard operations (audit critical actions):**
```
message:"dlq.manual_intervention" action:discard
```

**5. Specific operator's actions:**
```
message:"dlq.manual_intervention" operator:john.doe
```

**6. Dry-run vs Execute:**
```
message:"dlq.manual_intervention" dry_run:false  // Executed operations only
message:"dlq.manual_intervention" dry_run:true   // Dry-run previews
```

### Post-Mortem Analysis

**Steps for incident investigation:**

1. **Identify intervention timeline:**
   ```
   Search: message:"dlq.manual_intervention"
   Filter: timestamp range around incident
   Sort: Oldest first
   ```

2. **Analyze intervention chain:**
   - Export → Tag → Retry (safe workflow)
   - Bulk retry → Partial failure → Export → Single retry (iterative recovery)

3. **Verify success rate:**
   - Check `success_count` vs `job_count`
   - Investigate `failure_count > 0` events

4. **Cross-reference with application errors:**
   - Find job_ids from intervention context
   - Search for original job failures: `job_id:job_12345`

5. **Document learnings:**
   - Was dry-run used first? (Best practice)
   - Was export performed before discard? (Safety)
   - Was reason descriptive? (Audit quality)

---

## Best Practices

### 1. Always Dry-Run First

**Rule:** NEVER execute operations without previewing first.

```bash
# ✅ GOOD: Preview, review, then execute
npx tsx scripts/dlq-retry-all.ts --dry-run
# [Review output carefully]
npx tsx scripts/dlq-retry-all.ts --execute --reason "Confirmed via dry-run"

# ❌ BAD: Execute without preview
npx tsx scripts/dlq-retry-all.ts --execute --reason "YOLO"
```

**Why:** Dry-run reveals:
- Total job count (prevent accidental bulk operations)
- Error pattern distribution (verify filter correctness)
- Missing metadata (e.g., `originalQueue` not present)

---

### 2. Provide Clear, Actionable Reasons

**Rule:** `--reason` should explain WHAT was fixed and HOW it was verified.

```bash
# ✅ GOOD: Clear, actionable, verifiable
npx tsx scripts/dlq-retry-filtered.ts \
  --error-pattern "ECONNREFUSED" \
  --execute \
  --reason "External API endpoint restored at 14:30 UTC, confirmed via status page https://status.example.com/incidents/12345"

# ❌ BAD: Vague, no context
npx tsx scripts/dlq-retry-filtered.ts \
  --error-pattern "ECONNREFUSED" \
  --execute \
  --reason "API fixed"
```

**Reason Template:**
```
"[What was fixed] at [timestamp], confirmed via [verification method]"

Examples:
- "OpenAI API rate limit increased from 1000/min to 5000/min at 14:30 UTC, confirmed via dashboard"
- "Database connection pool exhaustion resolved by increasing max_connections from 100 to 200 at 15:00 UTC, no errors in logs for 30 minutes"
- "Missing externalId populated for tenant_123 via SQL update at 16:00 UTC, verified via SELECT query"
```

---

### 3. Use Error Patterns for Targeted Retries

**Rule:** Avoid bulk retry unless ALL errors are resolved. Use filtered retry for specific error types.

```bash
# ✅ GOOD: Targeted retry after specific fix
npx tsx scripts/dlq-retry-filtered.ts \
  --error-pattern "rate limit exceeded|429" \
  --execute \
  --reason "Rate limit quota increased"

# ❌ BAD: Bulk retry when only one error type fixed
npx tsx scripts/dlq-retry-all.ts --execute --reason "Rate limit fixed"
# (Also retries timeout errors, validation errors, etc. - likely to re-fail!)
```

**Pattern Matching Tips:**
- Use regex for multiple variations: `ECONN(REFUSED|TIMEOUT|RESET)`
- Case-insensitive by default: `timeout` matches `Timeout`, `TIMEOUT`
- Test pattern with `--dry-run` first to verify match count

---

### 4. Export Before Discard (Safety Archive)

**Rule:** ALWAYS export jobs before discarding. Archives provide audit trail and recovery option.

```bash
# ✅ GOOD: Export for archive first
npx tsx scripts/dlq-export-jobs.ts \
  --error-pattern "duplicate key" \
  --output /tmp/duplicates-archive-$(date +%Y%m%d).csv

# Review archive
cat /tmp/duplicates-archive-*.csv

# Then discard
npx tsx scripts/dlq-discard-jobs.ts \
  --error-pattern "duplicate key" \
  --execute \
  --reason "Duplicates confirmed via CSV review, archived to /tmp/duplicates-archive-20251110.csv"

# ❌ BAD: Discard without archive
npx tsx scripts/dlq-discard-jobs.ts \
  --error-pattern "duplicate key" \
  --execute \
  --reason "Duplicates"
```

**Archive Retention:**
- Keep archives for ≥30 days
- Store in secure location (not /tmp in production!)
- Include timestamp in filename for uniqueness

---

### 5. Tag for Manual Review Instead of Immediate Discard

**Rule:** When unsure about recoverability, TAG jobs instead of discarding.

```bash
# ✅ GOOD: Tag for investigation
npx tsx scripts/dlq-tag-jobs.ts \
  --error-pattern "ValidationError" \
  --tag "manual_review_required" \
  --execute \
  --reason "Schema validation failed, needs Backend Team review"

# Then export for team analysis
npx tsx scripts/dlq-export-jobs.ts --output /tmp/validation-errors.csv

# ❌ BAD: Discard without investigation
npx tsx scripts/dlq-discard-jobs.ts \
  --error-pattern "ValidationError" \
  --execute \
  --reason "Looks like bad data"
```

**Tag Categories:**
- `manual_review_required`: Needs human investigation
- `data_corruption`: Data integrity issue
- `schema_mismatch`: Database schema vs code mismatch
- `urgent`: Blocking production functionality
- `investigated`: Review completed, pending fix

---

### 6. Monitor Sentry After Operations

**Rule:** Verify Sentry audit event logged after ALL execute operations.

```bash
# 1. Execute operation
npx tsx scripts/dlq-retry-all.ts --execute --reason "API recovered"

# 2. Verify Sentry audit event
# Navigate to: Sentry > Events > Search: message:"dlq.manual_intervention"
# Filter: Last 5 minutes

# 3. Confirm event contains:
#    - Correct action type (retry/tag/discard/export)
#    - Correct job_count
#    - Correct operator
#    - Complete reason text
```

**If Sentry event NOT logged:**
- Check `ENABLE_SENTRY=true` in environment
- Check `SENTRY_DSN` configured correctly
- Check Sentry quota limits (daily events limit)

---

### 7. Test in Staging Before Production

**Rule:** Validate scripts in staging environment before production use.

```bash
# Staging workflow:
# 1. Set staging environment variables
export REDIS_URL=redis://staging-redis:6379
export SENTRY_DSN=https://staging-sentry-dsn@sentry.io/project-id
export ENABLE_SENTRY=true

# 2. Test dry-run
npx tsx scripts/dlq-retry-all.ts --dry-run

# 3. Test execute with small limit
npx tsx scripts/dlq-retry-all.ts --execute --reason "Staging test" --limit 5

# 4. Verify Sentry event in staging project

# 5. If successful, proceed to production
export REDIS_URL=redis://production-redis:6379
export SENTRY_DSN=https://production-sentry-dsn@sentry.io/project-id
# [Run production operation]
```

---

### 8. Coordinate with Backend Team for Large Operations

**Rule:** For operations affecting >50 jobs, notify Backend Team first.

```bash
# Before executing large operation:
# 1. Export DLQ snapshot
npx tsx scripts/dlq-export-jobs.ts --output /tmp/dlq-pre-operation.csv

# 2. Share with Backend Team
# - Email CSV to backend-team@assistos.com
# - Slack: #backend-incidents channel
# - Include: job count, error patterns, proposed action

# 3. Get approval from team lead

# 4. Execute with coordination
npx tsx scripts/dlq-retry-all.ts \
  --execute \
  --reason "Coordinated with Backend Team, approved by [name], ticket #INC-12345"

# 5. Monitor with team (watch queues, error rates, Sentry)
```

**Coordination Thresholds:**
- <10 jobs: Self-service (follow best practices)
- 10-50 jobs: Notify in Slack, no approval needed
- >50 jobs: Require team lead approval
- >100 jobs: Require incident commander approval

---

### 9. Use --limit for Testing and Safety

**Rule:** Test scripts with `--limit` flag before full execution.

```bash
# ✅ GOOD: Test with small limit first
npx tsx scripts/dlq-retry-all.ts --execute --reason "Testing" --limit 5
# [Verify 5 jobs processed successfully]

npx tsx scripts/dlq-retry-all.ts --execute --reason "Full retry after test" --limit 100
# [Full operation]

# ❌ BAD: Full execution without testing
npx tsx scripts/dlq-retry-all.ts --execute --reason "Retry all 500 jobs"
# [Risky - what if script has bug or config is wrong?]
```

---

### 10. Verify Job Metadata Before Retry

**Rule:** Ensure jobs have `originalQueue` metadata before retrying.

```bash
# Check metadata via export
npx tsx scripts/dlq-export-jobs.ts --output /tmp/dlq-check.csv

# Inspect original_queue column
cat /tmp/dlq-check.csv | cut -d',' -f2 | sort | uniq -c

# Expected: All jobs have valid queue names
#  25 assistbuild
#  12 connector-sync
#   8 email-notifications

# If ANY jobs show empty original_queue:
# ⚠️  Jobs missing originalQueue cannot be retried!
# Contact Backend Team to investigate metadata corruption
```

---

## Troubleshooting

### Error: "REDIS_URL not configured"

**Symptom:**
```
❌ Configuration validation failed:
   - REDIS_URL is required but not configured
```

**Cause:** `REDIS_URL` environment variable not set.

**Solution:**

**Option 1: Set in .env file**
```bash
echo "REDIS_URL=redis://localhost:6379" >> .env
```

**Option 2: Set inline**
```bash
REDIS_URL=redis://localhost:6379 npx tsx scripts/dlq-retry-all.ts --dry-run
```

**Option 3: Set in Replit Secrets**
- Navigate to Replit Secrets panel
- Add key: `REDIS_URL`
- Add value: `redis://your-redis-host:6379`

---

### Error: "Job not found in DLQ"

**Symptom:**
```
⚠️  Job job_12345 not found in DLQ
```

**Possible Causes:**
1. Job already processed/retried
2. Job ID incorrect (typo)
3. Job in different environment (staging vs production)

**Solution:**

**1. Export current DLQ to find job:**
```bash
npx tsx scripts/dlq-export-jobs.ts --output /tmp/dlq-current.csv
grep "job_12345" /tmp/dlq-current.csv
```

**2. Check health endpoint:**
```bash
curl -f http://localhost:5000/api/health/readyz | jq '.queues[] | select(.name=="dlq")'
# If depth=0, DLQ is empty (job already processed)
```

**3. Search Sentry for job processing:**
```
Search: job_id:job_12345
# Check recent events to see if job was processed
```

---

### Error: "Failed to move job to originalQueue"

**Symptom:**
```
❌ Failed to move job job_12345: Error: Queue 'unknown-queue' does not exist
```

**Cause:** Job metadata contains invalid or missing `originalQueue` field.

**Solution:**

**1. Inspect job metadata:**
```bash
npx tsx scripts/dlq-export-jobs.ts --job-ids "job_12345" --output /tmp/job-inspect.csv
cat /tmp/job-inspect.csv
```

**2. If originalQueue is missing or invalid:**
- Tag job for manual review:
  ```bash
  npx tsx scripts/dlq-tag-jobs.ts \
    --job-ids "job_12345" \
    --tag "metadata_corruption" \
    --execute \
    --reason "originalQueue metadata missing"
  ```
- Contact Backend Team to investigate metadata corruption
- May require manual database update to fix metadata

**3. If originalQueue is valid but queue doesn't exist:**
- Queue may have been renamed/removed
- Check worker configuration for valid queue names
- Contact Platform Team to restore queue or remap jobs

---

### Error: "Sentry event not logged"

**Symptom:**
```
⚠️  Sentry logging disabled, skipping audit log
```

**Cause:** `ENABLE_SENTRY` not set to `true` or `SENTRY_DSN` missing.

**Solution:**

**1. Verify Sentry configuration:**
```bash
echo $ENABLE_SENTRY  # Should be: true
echo $SENTRY_DSN     # Should be: https://xxx@sentry.io/yyy
```

**2. Enable Sentry:**
```bash
export ENABLE_SENTRY=true
export SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id
```

**3. Test Sentry connection:**
```bash
npx tsx scripts/dlq-retry-all.ts --dry-run --limit 1
# Should show: ✅ Sentry audit logging initialized
```

**4. If SENTRY_DSN invalid:**
- Check Sentry project settings for correct DSN
- Verify Sentry project quota (daily events limit)
- Test DSN with curl:
  ```bash
  curl -f "$SENTRY_DSN"
  ```

---

### Error: "Connection timeout"

**Symptom:**
```
❌ Fatal error: Error: Connection timeout
    at Redis.connect (...)
```

**Cause:** Redis connection failed (network issue, wrong host, Redis down).

**Solution:**

**1. Verify Redis host reachable:**
```bash
# Extract host from REDIS_URL
REDIS_HOST=$(echo $REDIS_URL | sed 's/redis:\/\///' | cut -d':' -f1)
ping -c 3 $REDIS_HOST
```

**2. Test Redis connection:**
```bash
redis-cli -u "$REDIS_URL" ping
# Expected: PONG
```

**3. Check Redis status:**
```bash
curl -f http://localhost:5000/api/health/readyz | jq '.redis'
# Expected: {"status": "healthy"}
```

**4. If Redis is down:**
- Restart Redis service: `systemctl restart redis` (or cloud provider)
- Check Redis logs: `journalctl -u redis`
- Contact Platform Team if managed Redis

**5. If REDIS_URL is wrong:**
- Update REDIS_URL to correct host/port
- Common ports: 6379 (default), 6380 (SSL)

---

### Error: "Job data corrupted, cannot deserialize"

**Symptom:**
```
❌ Failed to retry job job_12345: SyntaxError: Unexpected token in JSON
```

**Cause:** Job data in DLQ is corrupted (invalid JSON).

**Solution:**

**1. Export job for inspection:**
```bash
npx tsx scripts/dlq-export-jobs.ts --job-ids "job_12345" --output /tmp/corrupted-job.csv
cat /tmp/corrupted-job.csv
```

**2. Tag job as corrupted:**
```bash
npx tsx scripts/dlq-tag-jobs.ts \
  --job-ids "job_12345" \
  --tag "data_corruption" \
  --execute \
  --reason "Job data corrupted, cannot deserialize JSON"
```

**3. Contact Backend Team:**
- Share CSV export
- Provide error stack trace
- Backend Team may need to manually fix job data in Redis

**4. If unrecoverable, discard:**
```bash
# Only after Backend Team confirms job is unrecoverable
npx tsx scripts/dlq-discard-jobs.ts \
  --job-ids "job_12345" \
  --execute \
  --reason "Job data corrupted beyond recovery, approved by Backend Team"
```

---

### Error: "Permission denied writing CSV"

**Symptom:**
```
❌ Failed to export to CSV: Error: EACCES: permission denied, open '/protected/dir/export.csv'
```

**Cause:** No write permission to output directory.

**Solution:**

**1. Use /tmp directory (world-writable):**
```bash
npx tsx scripts/dlq-export-jobs.ts --output /tmp/dlq-export.csv
```

**2. Or create directory with correct permissions:**
```bash
mkdir -p ~/dlq-exports
chmod 755 ~/dlq-exports
npx tsx scripts/dlq-export-jobs.ts --output ~/dlq-exports/export.csv
```

**3. Check disk space:**
```bash
df -h /tmp  # Or target directory
# Ensure sufficient space for CSV (estimate: 1KB per job)
```

---

### Script Hangs at Confirmation Prompt

**Symptom:**
Script waits for user input indefinitely in CI/CD pipeline.

**Cause:** Confirmation prompt requires interactive terminal.

**Solution:**

Use `--yes` flag to skip confirmation:
```bash
npx tsx scripts/dlq-retry-all.ts \
  --execute \
  --reason "Automated retry" \
  --yes  # Skips confirmation prompt
```

**⚠️ WARNING:** Only use `--yes` in trusted automated environments. Always test with `--dry-run` first.

---

## Related Documentation

### Internal Documentation

**DLQ System Documentation:**
- **DLQ Triage SOP:** `docs/dlq-triage-sop.md`  
  Standard Operating Procedure for investigating and resolving DLQ jobs. Covers alert response, root cause analysis, and escalation workflows.

- **DLQ System Implementation:** `apps/worker/queues/dlq.ts`  
  Dead Letter Queue configuration, automatic job movement logic, and retry policies.

**Queue System Documentation:**
- **Queue Monitor Service:** `apps/worker/services/queue-monitor.service.ts`  
  Real-time queue metrics, health checks, and DLQ depth monitoring.

- **Sentry Alert Catalog:** `docs/sentry-alert-catalog.md`  
  Alert rules for DLQ depth thresholds, PagerDuty escalation policies.

**Sentry Integration:**
- **Sentry Configuration:** `docs/sentry-configuration.md`  
  Sentry setup, event schemas, and audit logging best practices.

### External Resources

**BullMQ Documentation:**
- **BullMQ Queue Guide:** https://docs.bullmq.io/guide/queues  
  Queue creation, job processing, and failure handling.

- **BullMQ Job Lifecycle:** https://docs.bullmq.io/guide/jobs/job-lifecycle  
  Job states, retry mechanisms, and dead letter queue behavior.

**Redis Documentation:**
- **Redis CLI Commands:** https://redis.io/docs/manual/cli/  
  Redis command-line interface for debugging and manual queue inspection.

**Sentry Documentation:**
- **Sentry Events & Alerts:** https://docs.sentry.io/product/alerts/  
  Event tracking, custom alerts, and audit trail queries.

---

## Changelog

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-11-10 | Platform Team | Initial documentation release |

---

## Support & Feedback

**Questions or Issues?**
- **Slack:** #backend-incidents (urgent), #platform-team (general)
- **Email:** platform-team@assistos.com
- **On-call:** PagerDuty escalation for production incidents

**Feedback & Improvements:**
- Open GitHub issue: `assistos-platform/dlq-tooling`
- Submit pull request with documentation improvements
- Propose new script features in #platform-team channel

---

**Document Owner:** Platform Team  
**Review Cycle:** Quarterly (or after major DLQ system changes)  
**Next Review:** 2025-02-10
