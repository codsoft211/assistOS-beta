#!/usr/bin/env tsx
/**
 * DLQ Retry All Script
 * 
 * Bulk retry all jobs from Dead Letter Queue (DLQ)
 * 
 * Usage:
 *   # Preview retry (default dry-run)
 *   npx tsx scripts/dlq-retry-all.ts --dry-run
 * 
 *   # Execute retry (requires --execute flag and --reason)
 *   npx tsx scripts/dlq-retry-all.ts --execute --reason "API recovered after outage"
 * 
 *   # Skip confirmation prompt
 *   npx tsx scripts/dlq-retry-all.ts --execute --reason "API recovered" --yes
 */

import * as readline from 'readline';
import {
  loadConfig,
  initializeSentry,
  createDLQConnection,
  parseArguments,
  getDLQJobs,
  moveJobToOriginalQueue,
  logDLQIntervention,
  displayJobSummary,
  DLQConnection,
  CLIArgs,
} from './utils/dlq-cli-helpers.js';
import type { Job } from 'bullmq';
import type { DLQJobData } from './utils/dlq-cli-helpers.js';

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
 * Main execution
 */
async function main() {
  let connection: DLQConnection | null = null;

  try {
    console.log('🔄 DLQ Retry All - Bulk Retry Script\n');

    // 1. Parse arguments
    const args = parseArguments();

    // 2. Validate arguments
    if (args.execute && !args.reason) {
      console.error('❌ Error: --reason flag is required when using --execute mode');
      console.error('   Example: --execute --reason "API recovered after outage"');
      process.exit(1);
    }

    // 3. Load configuration
    const config = loadConfig();
    initializeSentry(config);

    // 4. Create DLQ connection
    connection = createDLQConnection(config);

    // 5. Get all jobs from DLQ
    console.log('');
    const jobs = await getDLQJobs(connection, args.limit);

    if (jobs.length === 0) {
      console.log('✅ No jobs in DLQ - nothing to retry');
      await connection.cleanup();
      process.exit(0);
    }

    // 6. Display job summary
    displayJobSummary(jobs);

    // 7. Validate all jobs have originalQueue
    const jobsWithoutQueue = jobs.filter(job => !job.data.originalQueue);
    if (jobsWithoutQueue.length > 0) {
      console.error(`⚠️  Warning: ${jobsWithoutQueue.length} jobs missing originalQueue field`);
      console.error('   These jobs will be skipped during retry');
      jobsWithoutQueue.forEach(job => {
        console.error(`   - Job ${job.id || 'unknown'}`);
      });
      console.log('');
    }

    const retryableJobs = jobs.filter(job => job.data.originalQueue);

    if (retryableJobs.length === 0) {
      console.error('❌ Error: No retryable jobs found (all missing originalQueue)');
      await connection.cleanup();
      process.exit(1);
    }

    // 8. Confirmation prompt
    if (args.execute) {
      console.log(`\n⚠️  WARNING: You are about to retry ${retryableJobs.length} jobs`);
      console.log(`   Mode: EXECUTE (changes will be applied)`);
      console.log(`   Reason: ${args.reason}`);
      console.log(`   Operator: ${args.operator}`);
      
      // Check for --yes flag to skip confirmation
      const skipConfirmation = process.argv.includes('--yes') || process.argv.includes('-y');
      
      if (!skipConfirmation) {
        const confirmed = await confirmAction('\n   Proceed with bulk retry?');
        if (!confirmed) {
          console.log('\n❌ Operation cancelled by user');
          await connection.cleanup();
          process.exit(0);
        }
      } else {
        console.log('   --yes flag detected, skipping confirmation');
      }
    } else {
      console.log(`\n📋 DRY-RUN MODE: Preview only, no changes will be made`);
      console.log(`   To execute, run with: --execute --reason "your reason here"`);
    }

    // 9. Retry jobs
    console.log(`\n🔄 ${args.dryRun ? '[DRY-RUN]' : ''} Retrying ${retryableJobs.length} jobs...\n`);

    let successCount = 0;
    let failureCount = 0;
    const jobIds: string[] = [];

    for (const job of retryableJobs) {
      const jobId = job.id || 'unknown';
      jobIds.push(jobId);

      try {
        await moveJobToOriginalQueue(connection, job, args.dryRun);
        successCount++;
      } catch (error) {
        console.error(`   ❌ Failed to retry job ${jobId}:`, error);
        failureCount++;
      }
    }

    // 10. Log to Sentry for audit trail
    if (!args.dryRun) {
      logDLQIntervention(
        'retry',
        jobIds,
        args.reason || 'Bulk retry of all DLQ jobs',
        args.operator,
        args.dryRun,
        {
          action: 'bulk_retry',
          total_jobs: jobs.length,
          retryable_jobs: retryableJobs.length,
          success_count: successCount,
          failure_count: failureCount,
        }
      );
    }

    // 11. Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 Retry Summary:');
    console.log(`   - Total jobs in DLQ: ${jobs.length}`);
    console.log(`   - Retryable jobs: ${retryableJobs.length}`);
    console.log(`   - Successfully retried: ${successCount}`);
    if (failureCount > 0) {
      console.log(`   - Failed to retry: ${failureCount}`);
    }
    if (jobsWithoutQueue.length > 0) {
      console.log(`   - Skipped (no originalQueue): ${jobsWithoutQueue.length}`);
    }
    console.log('='.repeat(60));

    if (args.dryRun) {
      console.log('\n✅ Dry-run complete - no changes were made');
      console.log('   To execute, run with: --execute --reason "your reason here"');
    } else {
      console.log(`\n✅ Retry complete: ${successCount} jobs moved to original queues`);
      if (failureCount > 0) {
        console.log(`⚠️  Warning: ${failureCount} jobs failed to retry - check logs above`);
      }
    }

    // 12. Cleanup
    await connection.cleanup();
    process.exit(failureCount > 0 ? 1 : 0);

  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    if (connection) {
      await connection.cleanup();
    }
    process.exit(1);
  }
}

// Execute main function
main();
