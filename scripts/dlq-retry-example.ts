#!/usr/bin/env npx tsx
/**
 * DLQ Retry Script - Example Implementation
 * 
 * Retries failed jobs from the Dead Letter Queue back to their original queues.
 * 
 * Usage:
 *   npx tsx scripts/dlq-retry-example.ts --dry-run --error-pattern "timeout"
 *   npx tsx scripts/dlq-retry-example.ts --execute --job-ids "job1,job2,job3" --reason "Fixed timeout issue"
 *   npx tsx scripts/dlq-retry-example.ts --execute --limit 10 --operator "admin@example.com"
 */

import {
  loadConfig,
  initializeSentry,
  createDLQConnection,
  parseArguments,
  getDLQJobs,
  getJobsByIds,
  filterJobsByError,
  moveJobToOriginalQueue,
  logDLQIntervention,
  displayJobSummary,
  confirmAction,
} from './utils/dlq-cli-helpers';

async function main() {
  console.log('🔄 DLQ Retry Script\n');

  // 1. Load configuration
  console.log('📋 Step 1: Loading configuration...');
  const config = loadConfig();
  initializeSentry(config);

  // 2. Parse command-line arguments
  console.log('\n📋 Step 2: Parsing arguments...');
  const args = parseArguments();

  // Validate: require reason for execute mode
  if (!args.dryRun && !args.reason) {
    console.error('\n❌ Error: --reason is required when using --execute');
    console.error('   Example: --reason "Fixed database connection issue"\n');
    process.exit(1);
  }

  // 3. Connect to Redis/BullMQ
  console.log('\n📋 Step 3: Connecting to Redis/BullMQ...');
  const connection = createDLQConnection(config);

  try {
    // 4. Get jobs from DLQ
    console.log('\n📋 Step 4: Fetching jobs from DLQ...');
    let jobs;

    if (args.jobIds && args.jobIds.length > 0) {
      // Get specific jobs by ID
      jobs = await getJobsByIds(connection, args.jobIds);
    } else {
      // Get all jobs (with optional limit)
      jobs = await getDLQJobs(connection, args.limit);
    }

    if (jobs.length === 0) {
      console.log('\n⚠️  No jobs found in DLQ matching criteria');
      return;
    }

    // 5. Filter by error pattern if specified
    if (args.errorPattern) {
      console.log(`\n📋 Step 5: Filtering by error pattern: ${args.errorPattern}`);
      jobs = filterJobsByError(jobs, args.errorPattern);

      if (jobs.length === 0) {
        console.log('\n⚠️  No jobs matched the error pattern');
        return;
      }
    }

    // 6. Display job summary
    console.log('\n📋 Step 6: Job summary');
    displayJobSummary(jobs);

    // 7. Confirm action (for execute mode)
    if (!args.dryRun) {
      const confirmed = await confirmAction('retry', jobs.length, args.dryRun);
      if (!confirmed) {
        console.log('\n❌ Operation cancelled by user');
        return;
      }
    }

    // 8. Retry jobs
    console.log(`\n📋 Step 7: Retrying ${jobs.length} jobs...`);
    let successCount = 0;
    let failureCount = 0;

    for (const job of jobs) {
      try {
        await moveJobToOriginalQueue(connection, job, args.dryRun);
        successCount++;
      } catch (error) {
        console.error(`   ❌ Failed to retry job ${job.id}:`, error);
        failureCount++;
      }
    }

    console.log(`\n📊 Results:`);
    console.log(`   - Success: ${successCount}`);
    console.log(`   - Failures: ${failureCount}`);

    // 9. Log audit event
    if (config.enableSentry) {
      console.log('\n📋 Step 8: Logging audit event to Sentry...');
      logDLQIntervention(
        'retry',
        jobs.map(j => j.id || 'unknown'),
        args.reason || 'Manual retry via CLI',
        args.operator,
        args.dryRun,
        {
          successCount,
          failureCount,
          errorPattern: args.errorPattern,
        }
      );
    }

    if (args.dryRun) {
      console.log('\n💡 This was a DRY-RUN. No actual changes were made.');
      console.log('   Run with --execute to perform the retry operation.\n');
    } else {
      console.log('\n✅ Retry operation completed!\n');
    }
  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  } finally {
    // 10. Cleanup connections
    console.log('\n📋 Step 9: Cleaning up connections...');
    await connection.cleanup();
  }
}

// Run the script
main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
