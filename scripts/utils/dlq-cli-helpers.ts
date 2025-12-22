/**
 * DLQ CLI Helper Module
 * 
 * Provides reusable utilities for DLQ operational tooling scripts:
 * - Config loading and validation
 * - Redis/BullMQ connection management
 * - Command-line argument parsing
 * - Sentry audit logging
 * - Job manipulation utilities (retry/tag/export/discard)
 */

import * as dotenv from 'dotenv';
import { Queue, Job } from 'bullmq';
import Redis from 'ioredis';
import * as Sentry from '@sentry/node';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// TYPES
// ============================================================================

export interface DLQJobData {
  originalQueue: string;
  jobId: string | undefined;
  jobName: string | undefined;
  jobData: any;
  error: string;
  stackTrace?: string;
  failedAt: Date;
  attemptsMade: number;
  tenantId?: string;
  environment?: string;
  userId?: string;
  processedOn?: number;
  finishedOn?: number;
  duration?: number;
  tags?: string[];
}

export interface DLQConfig {
  redisUrl?: string;
  sentryDsn?: string;
  enableSentry: boolean;
  operator: string;
}

export interface CLIArgs {
  dryRun: boolean;
  execute: boolean;
  jobIds?: string[];
  errorPattern?: string;
  tag?: string;
  reason?: string;
  output?: string;
  operator: string;
  limit?: number;
}

export type DLQAction = 'retry' | 'discard' | 'tag' | 'export';

// ============================================================================
// 1. CONFIG LOADING
// ============================================================================

/**
 * Load and validate environment configuration
 * Supports .env file loading via dotenv
 */
export function loadConfig(): DLQConfig {
  // Load .env file if it exists
  dotenv.config();

  const config: DLQConfig = {
    redisUrl: process.env.REDIS_URL,
    sentryDsn: process.env.SENTRY_DSN,
    enableSentry: process.env.ENABLE_SENTRY === 'true',
    operator: process.env.OPERATOR_NAME || 'system',
  };

  // Validate required configs
  const errors: string[] = [];

  if (!config.redisUrl) {
    errors.push('REDIS_URL is required but not configured');
  }

  if (config.enableSentry && !config.sentryDsn) {
    errors.push('SENTRY_DSN is required when ENABLE_SENTRY=true');
  }

  if (errors.length > 0) {
    console.error('❌ Configuration validation failed:');
    errors.forEach(err => console.error(`   - ${err}`));
    throw new Error('Invalid configuration');
  }

  console.log('✅ Configuration loaded successfully');
  console.log(`   - Redis: ${config.redisUrl?.substring(0, 20)}...`);
  console.log(`   - Sentry: ${config.enableSentry ? 'enabled' : 'disabled'}`);
  console.log(`   - Operator: ${config.operator}`);

  return config;
}

/**
 * Initialize Sentry for audit logging
 */
export function initializeSentry(config: DLQConfig): void {
  if (!config.enableSentry || !config.sentryDsn) {
    console.log('⚠️  Sentry audit logging disabled');
    return;
  }

  Sentry.init({
    dsn: config.sentryDsn,
    environment: process.env.NODE_ENV || 'development',
    release: `assistos-dlq-cli@${process.env.APP_VERSION || 'dev'}`,
    tracesSampleRate: 0,
    beforeSend(event) {
      // Add CLI context
      event.tags = {
        ...event.tags,
        source: 'dlq-cli',
      };
      return event;
    },
  });

  console.log('✅ Sentry audit logging initialized');
}

// ============================================================================
// 2. REDIS/BULLMQ CONNECTION
// ============================================================================

/**
 * Supported queue names in the system
 */
export const QUEUE_NAMES = {
  DLQ: 'dead-letter-queue',
  // Actual queues from the system
  CONNECTOR_SYNC: 'connector-sync',
  APPLY_MIGRATION: 'apply-migration',
  PROMOTION: 'promotion',
  ANALYZE_PATTERNS: 'analyze-patterns',
  ASSISTBUILD: 'assistbuild',
  PATTERN_AGGREGATION: 'pattern-aggregation',
  BACKFILL_ENVIRONMENT: 'backfill-environment',
  // Additional queues mentioned in requirements
  INVOICE_PROCESSING: 'invoice-processing',
  AI_TASKS: 'ai-tasks',
  MIGRATION_JOBS: 'migration-jobs',
  EMAIL_NOTIFICATIONS: 'email-notifications',
  DOCUMENT_ANALYSIS: 'document-analysis',
  GMAIL_SYNC: 'gmail-sync',
} as const;

export class DLQConnection {
  private redis: Redis;
  private dlqQueue: Queue<DLQJobData>;
  private queueCache: Map<string, Queue> = new Map();

  constructor(redisUrl: string) {
    // Create Redis connection
    this.redis = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });

    // Create DLQ queue
    this.dlqQueue = new Queue<DLQJobData>(QUEUE_NAMES.DLQ, {
      connection: this.redis,
    });

    console.log('✅ Redis connection established');
  }

  /**
   * Get DLQ queue instance
   */
  getDLQQueue(): Queue<DLQJobData> {
    return this.dlqQueue;
  }

  /**
   * Get or create a queue instance for original queue
   */
  getQueue(queueName: string): Queue {
    if (!this.queueCache.has(queueName)) {
      const queue = new Queue(queueName, {
        connection: this.redis,
      });
      this.queueCache.set(queueName, queue);
    }
    return this.queueCache.get(queueName)!;
  }

  /**
   * Close all connections
   */
  async cleanup(): Promise<void> {
    console.log('🧹 Cleaning up connections...');

    // Close all cached queues
    for (const [queueName, queue] of Array.from(this.queueCache.entries())) {
      await queue.close();
      console.log(`   - Closed queue: ${queueName}`);
    }

    // Close DLQ queue
    await this.dlqQueue.close();
    console.log(`   - Closed DLQ queue`);

    // Close Redis connection
    await this.redis.quit();
    console.log(`   - Closed Redis connection`);

    console.log('✅ Cleanup complete');
  }
}

/**
 * Create DLQ connection
 */
export function createDLQConnection(config: DLQConfig): DLQConnection {
  if (!config.redisUrl) {
    throw new Error('Redis URL is required');
  }
  return new DLQConnection(config.redisUrl);
}

// ============================================================================
// 3. COMMAND-LINE ARGUMENT PARSING
// ============================================================================

/**
 * Parse common CLI arguments for DLQ operations
 */
export function parseArguments(argv?: string[]): CLIArgs {
  const args = yargs(hideBin(argv || process.argv))
    .option('dry-run', {
      type: 'boolean',
      default: true,
      description: 'Preview changes without executing (default: true)',
    })
    .option('execute', {
      type: 'boolean',
      default: false,
      description: 'Actually execute the operation (overrides --dry-run)',
    })
    .option('job-ids', {
      type: 'string',
      description: 'Comma-separated job IDs',
    })
    .option('error-pattern', {
      type: 'string',
      description: 'Error message pattern for filtering (regex supported)',
    })
    .option('tag', {
      type: 'string',
      description: 'Tag to apply to jobs',
    })
    .option('reason', {
      type: 'string',
      description: 'Reason for manual intervention (required for audit)',
    })
    .option('output', {
      type: 'string',
      description: 'Output file path for exports',
    })
    .option('operator', {
      type: 'string',
      default: process.env.OPERATOR_NAME || 'system',
      description: 'Operator name for audit trail',
    })
    .option('limit', {
      type: 'number',
      description: 'Maximum number of jobs to process',
    })
    .help()
    .parseSync();

  // Convert to CLIArgs format
  const parsedArgs: CLIArgs = {
    dryRun: args.execute ? false : args['dry-run'],
    execute: args.execute,
    jobIds: args['job-ids']?.split(',').map((id: string) => id.trim()).filter(Boolean),
    errorPattern: args['error-pattern'],
    tag: args.tag,
    reason: args.reason,
    output: args.output,
    operator: args.operator,
    limit: args.limit,
  };

  // Display parsed arguments
  console.log('\n📋 Parsed Arguments:');
  console.log(`   - Mode: ${parsedArgs.dryRun ? 'DRY-RUN' : 'EXECUTE'}`);
  if (parsedArgs.jobIds) {
    console.log(`   - Job IDs: ${parsedArgs.jobIds.join(', ')}`);
  }
  if (parsedArgs.errorPattern) {
    console.log(`   - Error Pattern: ${parsedArgs.errorPattern}`);
  }
  if (parsedArgs.tag) {
    console.log(`   - Tag: ${parsedArgs.tag}`);
  }
  if (parsedArgs.reason) {
    console.log(`   - Reason: ${parsedArgs.reason}`);
  }
  if (parsedArgs.output) {
    console.log(`   - Output: ${parsedArgs.output}`);
  }
  if (parsedArgs.limit) {
    console.log(`   - Limit: ${parsedArgs.limit}`);
  }
  console.log(`   - Operator: ${parsedArgs.operator}\n`);

  return parsedArgs;
}

// ============================================================================
// 4. SENTRY AUDIT LOGGING
// ============================================================================

/**
 * Log DLQ intervention to Sentry for audit trail
 */
export function logDLQIntervention(
  action: DLQAction,
  jobIds: string[],
  reason: string,
  operator: string,
  dryRun: boolean,
  additionalContext?: Record<string, any>
): void {
  if (!process.env.ENABLE_SENTRY || process.env.ENABLE_SENTRY !== 'true') {
    console.log('⚠️  Sentry logging disabled, skipping audit log');
    return;
  }

  const level: Sentry.SeverityLevel = dryRun ? 'info' : 'warning';

  Sentry.captureMessage('dlq.manual_intervention', {
    level,
    tags: {
      action,
      operator,
      dry_run: dryRun.toString(),
      job_count: jobIds.length.toString(),
    },
    contexts: {
      intervention: {
        job_ids: jobIds,
        action,
        reason,
        operator,
        dry_run: dryRun,
        timestamp: new Date().toISOString(),
        ...additionalContext,
      },
    },
  });

  console.log(`✅ Audit log sent to Sentry (level: ${level})`);
}

// ============================================================================
// 5. JOB UTILITIES
// ============================================================================

/**
 * Get jobs from DLQ queue
 */
export async function getDLQJobs(
  connection: DLQConnection,
  limit?: number
): Promise<Job<DLQJobData>[]> {
  const dlqQueue = connection.getDLQQueue();
  const count = limit || 100;

  console.log(`📥 Fetching up to ${count} jobs from DLQ...`);

  const jobs = await dlqQueue.getJobs(['waiting', 'completed'], 0, count - 1);

  console.log(`   - Found ${jobs.length} jobs in DLQ`);

  return jobs;
}

/**
 * Filter jobs by error message pattern
 */
export function filterJobsByError(
  jobs: Job<DLQJobData>[],
  errorPattern: string
): Job<DLQJobData>[] {
  console.log(`🔍 Filtering jobs by error pattern: ${errorPattern}`);

  const regex = new RegExp(errorPattern, 'i');
  const filtered = jobs.filter(job => {
    const error = job.data.error || '';
    return regex.test(error);
  });

  console.log(`   - Matched ${filtered.length} out of ${jobs.length} jobs`);

  return filtered;
}

/**
 * Move job from DLQ back to original queue
 */
export async function moveJobToOriginalQueue(
  connection: DLQConnection,
  job: Job<DLQJobData>,
  dryRun: boolean = true
): Promise<void> {
  const originalQueue = job.data.originalQueue;
  const jobId = job.id || 'unknown';

  console.log(`📤 ${dryRun ? '[DRY-RUN]' : ''} Moving job ${jobId} to ${originalQueue}...`);

  if (dryRun) {
    console.log(`   - [DRY-RUN] Would add job to ${originalQueue}`);
    console.log(`   - [DRY-RUN] Would remove job from DLQ`);
    return;
  }

  try {
    // Get original queue
    const targetQueue = connection.getQueue(originalQueue);

    // Add job back to original queue
    await targetQueue.add(
      job.data.jobName || 'dlq-retry',
      job.data.jobData,
      {
        jobId: job.data.jobId,
        priority: 1, // High priority for retried jobs
      }
    );

    // Remove from DLQ
    await job.remove();

    console.log(`   ✅ Job ${jobId} moved to ${originalQueue}`);
  } catch (error) {
    console.error(`   ❌ Failed to move job ${jobId}:`, error);
    throw error;
  }
}

/**
 * Remove job from DLQ
 */
export async function removeJobFromDLQ(
  job: Job<DLQJobData>,
  dryRun: boolean = true
): Promise<void> {
  const jobId = job.id || 'unknown';

  console.log(`🗑️  ${dryRun ? '[DRY-RUN]' : ''} Removing job ${jobId} from DLQ...`);

  if (dryRun) {
    console.log(`   - [DRY-RUN] Would remove job from DLQ`);
    return;
  }

  try {
    await job.remove();
    console.log(`   ✅ Job ${jobId} removed from DLQ`);
  } catch (error) {
    console.error(`   ❌ Failed to remove job ${jobId}:`, error);
    throw error;
  }
}

/**
 * Add tag to job metadata
 */
export async function tagJob(
  job: Job<DLQJobData>,
  tag: string,
  dryRun: boolean = true
): Promise<void> {
  const jobId = job.id || 'unknown';

  console.log(`🏷️  ${dryRun ? '[DRY-RUN]' : ''} Tagging job ${jobId} with "${tag}"...`);

  if (dryRun) {
    console.log(`   - [DRY-RUN] Would add tag to job metadata`);
    return;
  }

  try {
    // Update job data with tag
    const currentTags = job.data.tags || [];
    if (!currentTags.includes(tag)) {
      currentTags.push(tag);
      job.data.tags = currentTags;
      await job.updateData(job.data);
      console.log(`   ✅ Tag "${tag}" added to job ${jobId}`);
    } else {
      console.log(`   ⚠️  Job ${jobId} already has tag "${tag}"`);
    }
  } catch (error) {
    console.error(`   ❌ Failed to tag job ${jobId}:`, error);
    throw error;
  }
}

/**
 * Export jobs to CSV file
 */
export async function exportJobsToCSV(
  jobs: Job<DLQJobData>[],
  outputPath: string,
  dryRun: boolean = true
): Promise<void> {
  console.log(`📊 ${dryRun ? '[DRY-RUN]' : ''} Exporting ${jobs.length} jobs to CSV...`);

  // CSV columns
  const columns = [
    'job_id',
    'original_queue',
    'tenant_id',
    'user_id',
    'failed_at',
    'attempts',
    'error_message',
    'tags',
  ];

  // Generate CSV content
  const csvRows: string[] = [columns.join(',')];

  for (const job of jobs) {
    const row = [
      job.id || '',
      job.data.originalQueue || '',
      job.data.tenantId || '',
      job.data.userId || '',
      job.data.failedAt ? new Date(job.data.failedAt).toISOString() : '',
      job.data.attemptsMade?.toString() || '0',
      `"${(job.data.error || '').replace(/"/g, '""')}"`, // Escape quotes
      `"${(job.data.tags || []).join('; ')}"`,
    ];
    csvRows.push(row.join(','));
  }

  const csvContent = csvRows.join('\n');

  if (dryRun) {
    console.log(`   - [DRY-RUN] Would write ${csvRows.length - 1} rows to ${outputPath}`);
    console.log(`   - [DRY-RUN] Preview (first 3 rows):`);
    csvRows.slice(0, 4).forEach(row => console.log(`     ${row}`));
    return;
  }

  try {
    // Ensure output directory exists
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Write CSV file
    fs.writeFileSync(outputPath, csvContent, 'utf8');
    console.log(`   ✅ Exported ${csvRows.length - 1} jobs to ${outputPath}`);
  } catch (error) {
    console.error(`   ❌ Failed to export to CSV:`, error);
    throw error;
  }
}

/**
 * Get jobs by job IDs
 */
export async function getJobsByIds(
  connection: DLQConnection,
  jobIds: string[]
): Promise<Job<DLQJobData>[]> {
  console.log(`🔍 Fetching ${jobIds.length} jobs by ID...`);

  const dlqQueue = connection.getDLQQueue();
  const jobs: Job<DLQJobData>[] = [];

  for (const jobId of jobIds) {
    try {
      const job = await dlqQueue.getJob(jobId);
      if (job) {
        jobs.push(job);
      } else {
        console.warn(`   ⚠️  Job ${jobId} not found in DLQ`);
      }
    } catch (error) {
      console.error(`   ❌ Failed to fetch job ${jobId}:`, error);
    }
  }

  console.log(`   - Found ${jobs.length} out of ${jobIds.length} jobs`);

  return jobs;
}

// ============================================================================
// HELPER UTILITIES
// ============================================================================

/**
 * Display job summary
 */
export function displayJobSummary(jobs: Job<DLQJobData>[]): void {
  if (jobs.length === 0) {
    console.log('📊 No jobs to display');
    return;
  }

  console.log(`\n📊 Job Summary (${jobs.length} jobs):\n`);

  // Group by original queue
  const byQueue: Record<string, number> = {};
  const byTenant: Record<string, number> = {};
  const byError: Record<string, number> = {};

  for (const job of jobs) {
    const queue = job.data.originalQueue || 'unknown';
    const tenant = job.data.tenantId || 'unknown';
    const error = (job.data.error || 'unknown').substring(0, 50);

    byQueue[queue] = (byQueue[queue] || 0) + 1;
    byTenant[tenant] = (byTenant[tenant] || 0) + 1;
    byError[error] = (byError[error] || 0) + 1;
  }

  console.log('By Original Queue:');
  Object.entries(byQueue)
    .sort((a, b) => b[1] - a[1])
    .forEach(([queue, count]) => {
      console.log(`   - ${queue}: ${count}`);
    });

  console.log('\nBy Tenant:');
  Object.entries(byTenant)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([tenant, count]) => {
      console.log(`   - ${tenant}: ${count}`);
    });

  console.log('\nTop Errors:');
  Object.entries(byError)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .forEach(([error, count]) => {
      console.log(`   - ${error}...: ${count}`);
    });

  console.log('');
}

/**
 * Confirm action before execution
 */
export async function confirmAction(
  action: string,
  jobCount: number,
  dryRun: boolean
): Promise<boolean> {
  if (dryRun) {
    return true; // No confirmation needed for dry-run
  }

  console.log(`\n⚠️  WARNING: You are about to ${action} ${jobCount} jobs.`);
  console.log('This action cannot be undone.');

  // In a real CLI tool, you'd use readline or prompts library
  // For now, we'll just require --execute flag
  return true;
}
