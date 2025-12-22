#!/usr/bin/env tsx
/**
 * Pause All Queues Script
 * 
 * Pauses all BullMQ queues to stop new job processing during rollback.
 * 
 * Usage:
 *   # Preview pause (dry-run mode)
 *   npx tsx scripts/pause-all-queues.ts --dry-run
 * 
 *   # Execute pause (requires --execute flag and --reason)
 *   npx tsx scripts/pause-all-queues.ts --execute --reason "Canary rollback in progress"
 * 
 *   # Pause specific queue only
 *   npx tsx scripts/pause-all-queues.ts --queue "assistbuild" --execute --reason "AssistBuild errors"
 * 
 *   # Skip confirmation prompt
 *   npx tsx scripts/pause-all-queues.ts --execute --reason "Emergency rollback" --yes
 */

import { Queue } from 'bullmq';
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

interface PauseQueuesArgs {
  queue?: string;
  reason?: string;
  dryRun: boolean;
  execute: boolean;
  yes: boolean;
  operator: string;
}

interface QueueStatus {
  name: string;
  paused: boolean;
  waiting: number;
  active: number;
  delayed: number;
}

interface PauseResult {
  name: string;
  success: boolean;
  previouslyPaused: boolean;
  error?: string;
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
 * Get queue status
 */
async function getQueueStatus(queue: Queue): Promise<QueueStatus> {
  const [paused, waiting, active, delayed] = await Promise.all([
    queue.isPaused(),
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getDelayedCount(),
  ]);

  return {
    name: queue.name,
    paused,
    waiting,
    active,
    delayed,
  };
}

/**
 * Pause a single queue
 */
async function pauseQueue(
  queue: Queue,
  dryRun: boolean
): Promise<PauseResult> {
  try {
    const previouslyPaused = await queue.isPaused();

    if (previouslyPaused) {
      console.log(`   ℹ️  Queue "${queue.name}" already paused (no action needed)`);
      return {
        name: queue.name,
        success: true,
        previouslyPaused: true,
      };
    }

    if (!dryRun) {
      await queue.pause();
    }

    console.log(`   ${dryRun ? '[DRY-RUN]' : '✅'} Paused queue: ${queue.name}`);

    return {
      name: queue.name,
      success: true,
      previouslyPaused: false,
    };
  } catch (error) {
    console.error(`   ❌ Failed to pause queue "${queue.name}":`, error);
    return {
      name: queue.name,
      success: false,
      previouslyPaused: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Display queue status summary
 */
function displayQueueSummary(statuses: QueueStatus[]): void {
  console.log('\n' + '='.repeat(80));
  console.log('📊 Queue Status Summary:');
  console.log('='.repeat(80));
  console.log(
    `${'Queue Name'.padEnd(25)} | ${'Paused'.padEnd(8)} | ${'Waiting'.padEnd(8)} | ${'Active'.padEnd(8)} | ${'Delayed'.padEnd(8)}`
  );
  console.log('-'.repeat(80));

  statuses.forEach((status) => {
    const pausedIndicator = status.paused ? '✅ Yes' : '❌ No';
    console.log(
      `${status.name.padEnd(25)} | ${pausedIndicator.padEnd(8)} | ${String(status.waiting).padEnd(8)} | ${String(status.active).padEnd(8)} | ${String(status.delayed).padEnd(8)}`
    );
  });

  console.log('='.repeat(80));

  const totalJobs = statuses.reduce(
    (sum, s) => sum + s.waiting + s.active + s.delayed,
    0
  );
  const pausedCount = statuses.filter((s) => s.paused).length;

  console.log(`\n📈 Totals:`);
  console.log(`   - Total queues: ${statuses.length}`);
  console.log(`   - Already paused: ${pausedCount}`);
  console.log(`   - Total jobs (waiting + active + delayed): ${totalJobs}`);
}

// ============================================================================
// MAIN SCRIPT
// ============================================================================

async function main() {
  let redis: Redis | null = null;
  const queues: Queue[] = [];

  try {
    console.log('⏸️  Pause All Queues Script\n');
    console.log('═'.repeat(80));

    // 1. Parse arguments
    const args = yargs(hideBin(process.argv))
      .option('queue', {
        type: 'string',
        description: 'Specific queue to pause (or omit for all queues)',
      })
      .option('reason', {
        type: 'string',
        description: 'Reason for pausing queues',
      })
      .option('dry-run', {
        type: 'boolean',
        description: 'Preview changes without executing',
        default: true,
      })
      .option('execute', {
        type: 'boolean',
        description: 'Actually execute the pause operation',
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
      .parseSync() as PauseQueuesArgs;

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
      console.error('   Example: --execute --reason "Canary rollback in progress"');
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

    // 5. Determine which queues to pause
    const queuesToPause: QueueName[] = args.queue
      ? [args.queue as QueueName]
      : [...QUEUE_NAMES];

    // Validate queue name if specific queue requested
    if (args.queue && !QUEUE_NAMES.includes(args.queue as QueueName)) {
      console.error(`❌ Error: Invalid queue name "${args.queue}"`);
      console.error(`   Valid queue names: ${QUEUE_NAMES.join(', ')}`);
      process.exit(1);
    }

    // 6. Initialize queues
    for (const queueName of queuesToPause) {
      const queue = new Queue(queueName, { connection: redis });
      queues.push(queue);
    }

    console.log(`📋 Queues to pause: ${queuesToPause.join(', ')}\n`);

    // 7. Get current queue status
    console.log('🔍 Fetching queue status...\n');
    const statuses = await Promise.all(queues.map(getQueueStatus));

    // 8. Display queue summary
    displayQueueSummary(statuses);

    // 9. Check if any queues have active jobs
    const activeJobCount = statuses.reduce((sum, s) => sum + s.active, 0);
    if (activeJobCount > 0) {
      console.log(
        `\n⚠️  Warning: ${activeJobCount} active jobs currently processing`
      );
      console.log(
        '   Pausing queues will NOT cancel active jobs - they will complete'
      );
      console.log(
        '   Use pause-and-wait strategy if you need to drain active jobs first'
      );
    }

    // 10. Confirmation prompt
    if (args.execute) {
      console.log(`\n⚠️  WARNING: You are about to pause ${queuesToPause.length} queue(s)`);
      console.log(`   Mode: EXECUTE (changes will be applied)`);
      console.log(`   Reason: ${args.reason}`);
      console.log(`   Operator: ${args.operator}`);

      // Check for --yes flag to skip confirmation
      if (!args.yes) {
        const confirmed = await confirmAction('\n   Proceed with pause?');
        if (!confirmed) {
          console.log('\n❌ Operation cancelled by user');
          process.exit(0);
        }
      } else {
        console.log('   --yes flag detected, skipping confirmation');
      }
    } else {
      console.log(`\n📋 DRY-RUN MODE: Preview only, no changes will be made`);
      console.log(`   To execute, run with: --execute --reason "your reason here"`);
    }

    // 11. Pause queues
    console.log(
      `\n⏸️  ${args.dryRun ? '[DRY-RUN]' : ''} Pausing ${queuesToPause.length} queue(s)...\n`
    );

    const results = await Promise.all(
      queues.map((queue) => pauseQueue(queue, args.dryRun))
    );

    // 12. Log to Sentry for audit trail
    if (!args.dryRun && config.enableSentry) {
      Sentry.captureEvent({
        message: 'Queue Management: Pause Queues',
        level: args.dryRun ? 'info' : 'warning',
        contexts: {
          action: {
            type: 'pause_queues',
            queues: args.queue ? [args.queue] : queuesToPause.map(String),
            reason: args.reason || 'Pause all queues',
            operator: args.operator,
            dry_run: args.dryRun,
            total_queues: queuesToPause.length,
            success_count: results.filter((r) => r.success).length,
            failure_count: results.filter((r) => !r.success).length,
            previously_paused_count: results.filter((r) => r.previouslyPaused).length,
            timestamp: new Date().toISOString(),
          },
        },
      });
      console.log('✅ Audit log sent to Sentry');
    }

    // 13. Summary
    const successCount = results.filter((r) => r.success && !r.previouslyPaused).length;
    const alreadyPausedCount = results.filter((r) => r.previouslyPaused).length;
    const failureCount = results.filter((r) => !r.success).length;

    console.log('\n' + '='.repeat(80));
    console.log('📊 Pause Summary:');
    console.log(`   - Total queues targeted: ${queuesToPause.length}`);
    console.log(`   - Successfully paused: ${successCount}`);
    if (alreadyPausedCount > 0) {
      console.log(`   - Already paused (skipped): ${alreadyPausedCount}`);
    }
    if (failureCount > 0) {
      console.log(`   - Failed to pause: ${failureCount}`);
    }
    console.log('='.repeat(80));

    if (args.dryRun) {
      console.log('\n✅ Dry-run complete - no changes were made');
      console.log('   To execute, run with: --execute --reason "your reason here"');
    } else {
      console.log(`\n✅ Pause complete: ${successCount} queue(s) paused successfully`);
      if (failureCount > 0) {
        console.log(`⚠️  Warning: ${failureCount} queue(s) failed to pause - check logs above`);
      }
      console.log('\nℹ️  Next steps:');
      console.log('   1. Wait for active jobs to complete (monitor via health endpoint)');
      console.log('   2. Proceed with rollback procedures');
      console.log('   3. Resume queues after rollback: npx tsx scripts/resume-all-queues.ts');
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
  }
}

// Execute main function
main();
