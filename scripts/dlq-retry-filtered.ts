#!/usr/bin/env tsx
/**
 * DLQ Retry Filtered Script
 * 
 * Retry jobs from Dead Letter Queue (DLQ) that match a specific error pattern
 * 
 * Usage:
 *   # Preview filtered retry
 *   npx tsx scripts/dlq-retry-filtered.ts --error-pattern "ECONNREFUSED" --dry-run
 * 
 *   # Execute filtered retry (requires --execute, --error-pattern, and --reason)
 *   npx tsx scripts/dlq-retry-filtered.ts --error-pattern "timeout" --execute --reason "Increased timeout threshold"
 * 
 *   # Skip confirmation prompt
 *   npx tsx scripts/dlq-retry-filtered.ts --error-pattern "timeout" --execute --reason "Timeout fixed" --yes
 */

import * as readline from 'readline';
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
    console.log('🔍 DLQ Retry Filtered - Error Pattern Retry Script\n');

    // 1. Parse arguments
    const args = parseArguments();

    // 2. Validate arguments
    if (!args.errorPattern) {
      console.error('❌ Error: --error-pattern flag is required');
      console.error('   Example: --error-pattern "ECONNREFUSED"');
      process.exit(1);
    }

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
    const allJobs = await getDLQJobs(connection, args.limit);

    if (allJobs.length === 0) {
      console.log('✅ No jobs in DLQ - nothing to retry');
      await connection.cleanup();
      process.exit(0);
    }

    console.log(`   Total jobs in DLQ: ${allJobs.length}\n`);

    // 6. Filter jobs by error pattern
    const matchedJobs = filterJobsByError(allJobs, args.errorPattern);

    if (matchedJobs.length === 0) {
      console.log(`✅ No jobs match error pattern: "${args.errorPattern}"`);
      console.log('   Try a different pattern or check existing errors');
      await connection.cleanup();
      process.exit(0);
    }

    // 7. Display summary of matched jobs
    console.log('');
    displayJobSummary(matchedJobs);

    // 8. Validate matched jobs have originalQueue
    const jobsWithoutQueue = matchedJobs.filter(job => !job.data.originalQueue);
    if (jobsWithoutQueue.length > 0) {
      console.error(`⚠️  Warning: ${jobsWithoutQueue.length} matched jobs missing originalQueue field`);
      console.error('   These jobs will be skipped during retry');
      jobsWithoutQueue.forEach(job => {
        console.error(`   - Job ${job.id || 'unknown'}`);
      });
      console.log('');
    }

    const retryableJobs = matchedJobs.filter(job => job.data.originalQueue);

    if (retryableJobs.length === 0) {
      console.error('❌ Error: No retryable jobs found (all missing originalQueue)');
      await connection.cleanup();
      process.exit(1);
    }

    // 9. Confirmation prompt
    if (args.execute) {
      console.log(`\n⚠️  WARNING: You are about to retry ${retryableJobs.length} jobs matching pattern "${args.errorPattern}"`);
      console.log(`   Mode: EXECUTE (changes will be applied)`);
      console.log(`   Reason: ${args.reason}`);
      console.log(`   Operator: ${args.operator}`);
      console.log(`   Matched: ${matchedJobs.length} out of ${allJobs.length} total jobs`);
      
      // Check for --yes flag to skip confirmation
      const skipConfirmation = process.argv.includes('--yes') || process.argv.includes('-y');
      
      if (!skipConfirmation) {
        const confirmed = await confirmAction('\n   Proceed with filtered retry?');
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
      console.log(`   Matched ${matchedJobs.length} out of ${allJobs.length} total jobs`);
      console.log(`   To execute, run with: --execute --reason "your reason here"`);
    }

    // 10. Retry matched jobs
    console.log(`\n🔄 ${args.dryRun ? '[DRY-RUN]' : ''} Retrying ${retryableJobs.length} matched jobs...\n`);

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

    // 11. Log to Sentry for audit trail
    if (!args.dryRun) {
      logDLQIntervention(
        'retry',
        jobIds,
        args.reason || `Filtered retry for error pattern: ${args.errorPattern}`,
        args.operator,
        args.dryRun,
        {
          action: 'filtered_retry',
          error_pattern: args.errorPattern,
          total_jobs_in_dlq: allJobs.length,
          matched_jobs: matchedJobs.length,
          retryable_jobs: retryableJobs.length,
          success_count: successCount,
          failure_count: failureCount,
        }
      );
    }

    // 12. Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 Retry Summary:');
    console.log(`   - Error pattern: "${args.errorPattern}"`);
    console.log(`   - Total jobs in DLQ: ${allJobs.length}`);
    console.log(`   - Matched jobs: ${matchedJobs.length}`);
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

    // 13. Cleanup
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
