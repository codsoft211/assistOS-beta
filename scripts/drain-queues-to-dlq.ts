#!/usr/bin/env tsx
/**
 * Drain Queues to DLQ Script
 * 
 * Moves pending jobs from queues to Dead Letter Queue (DLQ) before rollback.
 * Preserves job data for post-rollback analysis and potential retry.
 * 
 * Usage:
 *   # Preview drain (dry-run mode)
 *   npx tsx scripts/drain-queues-to-dlq.ts --dry-run
 * 
 *   # Execute drain (all queues, requires --execute flag and --reason)
 *   npx tsx scripts/drain-queues-to-dlq.ts --execute --reason "Canary rollback - preserve pending jobs"
 * 
 *   # Drain specific queue only
 *   npx tsx scripts/drain-queues-to-dlq.ts --queue "connector-sync" --execute --reason "Moloni API outage"
 * 
 *   # Skip confirmation prompt
 *   npx tsx scripts/drain-queues-to-dlq.ts --execute --reason "Emergency rollback" --yes
 */

import { Queue, Job } from 'bullmq';
import * as readline from 'readline';
import {
  loadConfig,
  initializeSentry,
} from './utils/dlq-cli-helpers.js';
import Redis from 'ioredis';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import * as Sentry from '@sentry/node';

// ============================================================================
// QUEUE CONFIGURATION
// ============================================================================

const QUEUE_NAMES = [
  'assistbuild',
  'apply-migration',
  'promotion',
  'connector-sync',
  'analyze-patterns',
  'pattern-aggregation',
  'backfill-environment',
] as const;

type QueueName = typeof QUEUE_NAMES[number];

// ============================================================================
// TYPES
// ============================================================================

interface DrainQueuesArgs {
  queue?: string;
  reason?: string;
  dryRun: boolean;
  execute: boolean;
  yes: boolean;
  operator: string;
}

interface DrainResult {
  queueName: string;
  waitingJobs: number;
  delayedJobs: number;
  totalMoved: number;
  success: boolean;
  error?: string;
}

interface DLQJobData {
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
  drainedAt: Date;
  drainReason: string;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Confirm action with user
 */
async function confirmAction(message: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${message} (yes/no): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y');
    });
  });
}

/**
 * Move a single job to DLQ
 */
async function moveJobToDLQ(
  job: Job,
  dlqQueue: Queue<DLQJobData>,
  reason: string,
  dryRun: boolean
): Promise<boolean> {
  try {
    const dlqJobData: DLQJobData = {
      originalQueue: job.queueName,
      jobId: job.id,
      jobName: job.name,
      jobData: job.data,
      error: `Drained to DLQ before rollback: ${reason}`,
      failedAt: new Date(),
      attemptsMade: job.attemptsMade || 0,
      tenantId: job.data?.tenantId,
      environment: job.data?.environment || 'production',
      userId: job.data?.userId,
      drainedAt: new Date(),
      drainReason: reason,
    };

    if (!dryRun) {
      // Add to DLQ
      await dlqQueue.add('drained-job', dlqJobData, {
        priority: 2, // Medium priority (normal DLQ jobs are priority 1-3)
      });

      // Remove from original queue
      await job.remove();
    }

    return true;
  } catch (error) {
    console.error(`   ❌ Failed to move job ${job.id} to DLQ:`, error);
    return false;
  }
}

/**
 * Drain a single queue to DLQ
 */
async function drainQueue(
  queue: Queue,
  dlqQueue: Queue<DLQJobData>,
  reason: string,
  dryRun: boolean
): Promise<DrainResult> {
  try {
    console.log(`\n🔍 Draining queue: ${queue.name}...`);

    // Get waiting jobs
    const waitingJobs = await queue.getJobs(['waiting']);
    console.log(`   - Waiting jobs: ${waitingJobs.length}`);

    // Get delayed jobs
    const delayedJobs = await queue.getJobs(['delayed']);
    console.log(`   - Delayed jobs: ${delayedJobs.length}`);

    const allJobs = [...waitingJobs, ...delayedJobs];

    if (allJobs.length === 0) {
      console.log(`   ℹ️  No jobs to drain (queue is empty)`);
      return {
        queueName: queue.name,
        waitingJobs: 0,
        delayedJobs: 0,
        totalMoved: 0,
        success: true,
      };
    }

    // Move all jobs to DLQ
    let successCount = 0;
    for (const job of allJobs) {
      const moved = await moveJobToDLQ(job, dlqQueue, reason, dryRun);
      if (moved) {
        successCount++;
      }
    }

    console.log(
      `   ${dryRun ? '[DRY-RUN]' : '✅'} Moved ${successCount}/${allJobs.length} jobs to DLQ`
    );

    return {
      queueName: queue.name,
      waitingJobs: waitingJobs.length,
      delayedJobs: delayedJobs.length,
      totalMoved: successCount,
      success: successCount === allJobs.length,
    };
  } catch (error) {
    console.error(`   ❌ Failed to drain queue "${queue.name}":`, error);
    return {
      queueName: queue.name,
      waitingJobs: 0,
      delayedJobs: 0,
      totalMoved: 0,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ============================================================================
// MAIN SCRIPT
// ============================================================================

async function main() {
  let redis: Redis | null = null;
  const queues: Queue[] = [];
  let dlqQueue: Queue<DLQJobData> | null = null;

  try {
    console.log('🚰 Drain Queues to DLQ Script\n');
    console.log('═'.repeat(80));

    // 1. Parse arguments
    const args = yargs(hideBin(process.argv))
      .option('queue', {
        type: 'string',
        description: 'Specific queue to drain (or omit for all queues)',
      })
      .option('reason', {
        type: 'string',
        description: 'Reason for draining queues',
      })
      .option('dry-run', {
        type: 'boolean',
        description: 'Preview changes without executing',
        default: true,
      })
      .option('execute', {
        type: 'boolean',
        description: 'Actually execute the drain operation',
        default: false,
      })
      .option('yes', {
        type: 'boolean',
        description: 'Skip confirmation prompt',
        default: false,
      })
      .option('operator', {
        type: 'string',
        description: 'Operator name for audit trail',
        default: process.env.USER || process.env.OPERATOR_NAME || 'system',
      })
      .help()
      .parseSync() as DrainQueuesArgs;

    // Set dryRun based on execute flag
    args.dryRun = args.execute ? false : true;

    console.log('\n📋 Parsed Arguments:');
    console.log(`   - Mode: ${args.dryRun ? 'DRY-RUN' : 'EXECUTE'}`);
    if (args.queue) {
      console.log(`   - Queue: ${args.queue}`);
    }
    if (args.reason) {
      console.log(`   - Reason: ${args.reason}`);
    }
    console.log(`   - Operator: ${args.operator}\n`);

    // 2. Validate arguments
    if (args.execute && !args.reason) {
      console.error('❌ Error: --reason flag is required when using --execute mode');
      console.error(
        '   Example: --execute --reason "Canary rollback - preserve pending jobs"'
      );
      process.exit(1);
    }

    // 3. Load configuration
    const config = loadConfig();
    initializeSentry(config);

    // 4. Create Redis connection
    if (!config.redisUrl) {
      console.error('❌ Error: REDIS_URL environment variable not set');
      process.exit(1);
    }

    redis = new Redis(config.redisUrl);
    console.log('✅ Connected to Redis\n');

    // 5. Determine which queues to drain
    const queuesToDrain: QueueName[] = args.queue
      ? [args.queue as QueueName]
      : [...QUEUE_NAMES];

    // Validate queue name if specific queue requested
    if (args.queue && !QUEUE_NAMES.includes(args.queue as QueueName)) {
      console.error(`❌ Error: Invalid queue name "${args.queue}"`);
      console.error(`   Valid queue names: ${QUEUE_NAMES.join(', ')}`);
      process.exit(1);
    }

    // 6. Initialize queues
    for (const queueName of queuesToDrain) {
      const queue = new Queue(queueName, { connection: redis });
      queues.push(queue);
    }

    // 7. Initialize DLQ queue
    dlqQueue = new Queue<DLQJobData>('dead-letter-queue', { connection: redis });
    console.log('✅ Connected to DLQ\n');

    console.log(`📋 Queues to drain: ${queuesToDrain.join(', ')}\n`);

    // 8. Get job counts
    console.log('🔍 Analyzing queues...\n');
    const jobCounts = await Promise.all(
      queues.map(async (queue) => {
        const [waiting, delayed] = await Promise.all([
          queue.getWaitingCount(),
          queue.getDelayedCount(),
        ]);
        return {
          name: queue.name,
          waiting,
          delayed,
          total: waiting + delayed,
        };
      })
    );

    // Display job counts
    console.log('='.repeat(80));
    console.log('📊 Job Count Summary:');
    console.log('='.repeat(80));
    console.log(
      `${'Queue Name'.padEnd(25)} | ${'Waiting'.padEnd(10)} | ${'Delayed'.padEnd(10)} | ${'Total'.padEnd(10)}`
    );
    console.log('-'.repeat(80));

    jobCounts.forEach((count) => {
      console.log(
        `${count.name.padEnd(25)} | ${String(count.waiting).padEnd(10)} | ${String(count.delayed).padEnd(10)} | ${String(count.total).padEnd(10)}`
      );
    });

    console.log('='.repeat(80));

    const totalJobs = jobCounts.reduce((sum, c) => sum + c.total, 0);
    console.log(`\n📈 Total jobs to drain: ${totalJobs}`);

    if (totalJobs === 0) {
      console.log('\n✅ No jobs to drain - all queues are empty');
      process.exit(0);
    }

    // 9. Confirmation prompt
    if (args.execute) {
      console.log(
        `\n⚠️  WARNING: You are about to drain ${totalJobs} job(s) to DLQ`
      );
      console.log(`   Mode: EXECUTE (changes will be applied)`);
      console.log(`   Reason: ${args.reason}`);
      console.log(`   Operator: ${args.operator}`);
      console.log(
        `\n   ⚠️  Jobs will be removed from their original queues and moved to DLQ`
      );
      console.log('   They can be retried later using dlq-retry-all.ts script');

      // Check for --yes flag to skip confirmation
      if (!args.yes) {
        const confirmed = await confirmAction('\n   Proceed with drain?');
        if (!confirmed) {
          console.log('\n❌ Operation cancelled by user');
          process.exit(0);
        }
      } else {
        console.log('   --yes flag detected, skipping confirmation');
      }
    } else {
      console.log(`\n📋 DRY-RUN MODE: Preview only, no changes will be made`);
      console.log(
        `   To execute, run with: --execute --reason "your reason here"`
      );
    }

    // 10. Drain queues
    console.log(
      `\n🚰 ${args.dryRun ? '[DRY-RUN]' : ''} Draining ${queuesToDrain.length} queue(s) to DLQ...`
    );

    const results = await Promise.all(
      queues.map((queue) => drainQueue(queue, dlqQueue!, args.reason || 'Queue drain', args.dryRun))
    );

    // 11. Log to Sentry for audit trail
    if (!args.dryRun && config.enableSentry) {
      const totalMoved = results.reduce((sum, r) => sum + r.totalMoved, 0);
      Sentry.captureEvent({
        message: 'Queue Management: Drain Queues to DLQ',
        level: args.dryRun ? 'info' : 'warning',
        contexts: {
          action: {
            type: 'drain_to_dlq',
            queues: args.queue ? [args.queue] : queuesToDrain.map(String),
            reason: args.reason || 'Drain queues to DLQ',
            operator: args.operator,
            dry_run: args.dryRun,
            total_queues: queuesToDrain.length,
            total_jobs_moved: totalMoved,
            success_count: results.filter((r) => r.success).length,
            failure_count: results.filter((r) => !r.success).length,
            timestamp: new Date().toISOString(),
          },
        },
      });
      console.log('✅ Audit log sent to Sentry');
    }

    // 12. Summary
    const totalMoved = results.reduce((sum, r) => sum + r.totalMoved, 0);
    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.filter((r) => !r.success).length;

    console.log('\n' + '='.repeat(80));
    console.log('📊 Drain Summary:');
    console.log(`   - Total queues processed: ${queuesToDrain.length}`);
    console.log(`   - Total jobs moved to DLQ: ${totalMoved}`);
    console.log(`   - Queues drained successfully: ${successCount}`);
    if (failureCount > 0) {
      console.log(`   - Queues failed to drain: ${failureCount}`);
    }
    console.log('='.repeat(80));

    // Per-queue breakdown
    console.log('\n📋 Per-Queue Breakdown:');
    results.forEach((result) => {
      console.log(`   - ${result.queueName}: ${result.totalMoved} jobs moved to DLQ`);
    });

    if (args.dryRun) {
      console.log('\n✅ Dry-run complete - no changes were made');
      console.log('   To execute, run with: --execute --reason "your reason here"');
    } else {
      console.log(`\n✅ Drain complete: ${totalMoved} job(s) moved to DLQ`);
      if (failureCount > 0) {
        console.log(
          `⚠️  Warning: ${failureCount} queue(s) failed to drain - check logs above`
        );
      }
      console.log('\nℹ️  Next steps:');
      console.log('   1. Proceed with rollback procedures');
      console.log(
        '   2. After rollback, analyze DLQ jobs: npx tsx scripts/dlq-export-jobs.ts'
      );
      console.log(
        '   3. Retry jobs if appropriate: npx tsx scripts/dlq-retry-all.ts'
      );
    }

    process.exit(failureCount > 0 ? 1 : 0);
  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  } finally {
    // Cleanup
    if (redis) {
      await redis.quit();
    }
    for (const queue of queues) {
      await queue.close();
    }
    if (dlqQueue) {
      await dlqQueue.close();
    }
  }
}

// Execute main function
main();
