#!/usr/bin/env tsx
/**
 * DLQ Retry Job Script
 * 
 * Retry single or multiple specific jobs from Dead Letter Queue (DLQ) by job ID
 * 
 * Usage:
 *   # Retry single job (requires --job-id and --reason)
 *   npx tsx scripts/dlq-retry-job.ts --job-id <job_id> --reason "Manual retry after data fix"
 * 
 *   # Retry multiple specific jobs
 *   npx tsx scripts/dlq-retry-job.ts --job-ids <id1>,<id2>,<id3> --reason "Retry after credential refresh"
 * 
 *   # Skip confirmation prompt
 *   npx tsx scripts/dlq-retry-job.ts --job-id <job_id> --reason "Data fixed" --yes
 */

import * as readline from 'readline';
import {
  loadConfig,
  initializeSentry,
  createDLQConnection,
  parseArguments,
  getJobsByIds,
  moveJobToOriginalQueue,
  logDLQIntervention,
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
 * Display detailed job information
 */
function displayJobDetails(job: Job<DLQJobData>): void {
  const jobId = job.id || 'unknown';
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📋 Job Details: ${jobId}`);
  console.log(`${'='.repeat(60)}`);
  console.log(`   Queue: ${job.data.originalQueue || 'N/A'}`);
  console.log(`   Tenant: ${job.data.tenantId || 'N/A'}`);
  console.log(`   User: ${job.data.userId || 'N/A'}`);
  console.log(`   Environment: ${job.data.environment || 'N/A'}`);
  console.log(`   Failed At: ${job.data.failedAt ? new Date(job.data.failedAt).toISOString() : 'N/A'}`);
  console.log(`   Attempts Made: ${job.data.attemptsMade || 0}`);
  console.log(`   Error: ${(job.data.error || 'N/A').substring(0, 200)}${job.data.error && job.data.error.length > 200 ? '...' : ''}`);
  if (job.data.tags && job.data.tags.length > 0) {
    console.log(`   Tags: ${job.data.tags.join(', ')}`);
  }
  console.log(`${'='.repeat(60)}`);
}

/**
 * Main execution
 */
async function main() {
  let connection: DLQConnection | null = null;

  try {
    console.log('🔧 DLQ Retry Job - Single/Multiple Job Retry Script\n');

    // 1. Parse arguments
    const args = parseArguments();

    // 2. Validate arguments
    // Check for --job-id (singular) as alternative to --job-ids
    let jobIds = args.jobIds || [];
    const singleJobId = process.argv.find((arg, i) => 
      (process.argv[i - 1] === '--job-id' || process.argv[i - 1] === '-j') && 
      !arg.startsWith('-')
    );
    
    if (singleJobId && !jobIds.includes(singleJobId)) {
      jobIds = [singleJobId];
    }

    if (!jobIds || jobIds.length === 0) {
      console.error('❌ Error: --job-id or --job-ids flag is required');
      console.error('   Examples:');
      console.error('     --job-id <job_id>');
      console.error('     --job-ids <id1>,<id2>,<id3>');
      process.exit(1);
    }

    if (!args.reason) {
      console.error('❌ Error: --reason flag is required');
      console.error('   Example: --reason "Manual retry after data fix"');
      process.exit(1);
    }

    console.log(`📋 Target Jobs: ${jobIds.join(', ')}\n`);

    // 3. Load configuration
    const config = loadConfig();
    initializeSentry(config);

    // 4. Create DLQ connection
    connection = createDLQConnection(config);

    // 5. Get jobs by IDs
    console.log('');
    const jobs = await getJobsByIds(connection, jobIds);

    // 6. Validate all requested jobs were found
    if (jobs.length === 0) {
      console.error('❌ Error: No jobs found in DLQ with the provided IDs');
      console.error('   Requested IDs:', jobIds.join(', '));
      await connection.cleanup();
      process.exit(1);
    }

    const foundJobIds = jobs.map(j => j.id).filter(Boolean) as string[];
    const missingJobIds = jobIds.filter(id => !foundJobIds.includes(id));
    
    if (missingJobIds.length > 0) {
      console.error(`⚠️  Warning: ${missingJobIds.length} job(s) not found in DLQ:`);
      missingJobIds.forEach(id => console.error(`   - ${id}`));
      console.log('');
    }

    // 7. Display job details
    for (const job of jobs) {
      displayJobDetails(job);
    }

    // 8. Validate jobs have originalQueue
    const jobsWithoutQueue = jobs.filter(job => !job.data.originalQueue);
    if (jobsWithoutQueue.length > 0) {
      console.error(`\n❌ Error: ${jobsWithoutQueue.length} job(s) missing originalQueue field`);
      console.error('   Cannot retry jobs without originalQueue:');
      jobsWithoutQueue.forEach(job => {
        console.error(`   - Job ${job.id || 'unknown'}`);
      });
      await connection.cleanup();
      process.exit(1);
    }

    // 9. Confirmation prompt (always required for single job script)
    console.log(`\n⚠️  You are about to retry ${jobs.length} job(s)`);
    console.log(`   Reason: ${args.reason}`);
    console.log(`   Operator: ${args.operator}`);
    console.log(`   Jobs will be moved back to their original queues for reprocessing`);
    
    // Check for --yes flag to skip confirmation
    const skipConfirmation = process.argv.includes('--yes') || process.argv.includes('-y');
    
    if (!skipConfirmation) {
      const confirmed = await confirmAction('\n   Proceed with retry?');
      if (!confirmed) {
        console.log('\n❌ Operation cancelled by user');
        await connection.cleanup();
        process.exit(0);
      }
    } else {
      console.log('   --yes flag detected, skipping confirmation');
    }

    // 10. Retry jobs
    console.log(`\n🔄 Retrying ${jobs.length} job(s)...\n`);

    let successCount = 0;
    let failureCount = 0;
    const retriedJobIds: string[] = [];

    for (const job of jobs) {
      const jobId = job.id || 'unknown';
      retriedJobIds.push(jobId);

      try {
        await moveJobToOriginalQueue(connection, job, false); // Always execute (no dry-run mode for this script)
        successCount++;
      } catch (error) {
        console.error(`   ❌ Failed to retry job ${jobId}:`, error);
        failureCount++;
      }
    }

    // 11. Log to Sentry for audit trail
    logDLQIntervention(
      'retry',
      retriedJobIds,
      args.reason,
      args.operator,
      false, // Not a dry-run
      {
        action: 'single_retry',
        job_ids: retriedJobIds,
        requested_count: jobIds.length,
        found_count: jobs.length,
        success_count: successCount,
        failure_count: failureCount,
      }
    );

    // 12. Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 Retry Summary:');
    console.log(`   - Requested jobs: ${jobIds.length}`);
    console.log(`   - Found in DLQ: ${jobs.length}`);
    console.log(`   - Successfully retried: ${successCount}`);
    if (failureCount > 0) {
      console.log(`   - Failed to retry: ${failureCount}`);
    }
    if (missingJobIds.length > 0) {
      console.log(`   - Not found: ${missingJobIds.length}`);
    }
    console.log('='.repeat(60));

    if (failureCount === 0 && missingJobIds.length === 0) {
      console.log(`\n✅ Retry complete: ${successCount} job(s) moved to original queues`);
    } else {
      if (failureCount > 0) {
        console.log(`\n⚠️  Warning: ${failureCount} job(s) failed to retry - check logs above`);
      }
      if (missingJobIds.length > 0) {
        console.log(`⚠️  Warning: ${missingJobIds.length} job(s) not found in DLQ`);
      }
    }

    // 13. Cleanup
    await connection.cleanup();
    process.exit(failureCount > 0 || missingJobIds.length > 0 ? 1 : 0);

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
