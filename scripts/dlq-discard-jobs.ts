#!/usr/bin/env tsx

/**
 * DLQ Discard Jobs Script
 * 
 * Permanently discards unrecoverable DLQ jobs.
 * 
 * ⚠️  DANGER: This script permanently removes jobs from the DLQ!
 * Use with extreme caution. Jobs cannot be recovered after discard.
 * 
 * Usage:
 *   # Discard specific jobs (dry-run preview)
 *   npx tsx scripts/dlq-discard-jobs.ts --job-ids <id1>,<id2> --reason "Duplicate processing" --dry-run
 * 
 *   # Execute discard
 *   npx tsx scripts/dlq-discard-jobs.ts --job-ids <id1>,<id2> --reason "Duplicate, original succeeded" --execute
 * 
 *   # Discard by error pattern (DANGEROUS!)
 *   npx tsx scripts/dlq-discard-jobs.ts --error-pattern "duplicate key" --execute --reason "Data already processed" --yes
 * 
 * Safety Features:
 *   - Dry-run mode by default (--dry-run)
 *   - Execute mode requires --reason
 *   - Confirmation prompt requires typing "DISCARD" (unless --yes flag)
 *   - Extra confirmation for >10 jobs
 *   - Sentry audit logging with reason
 */

import * as readline from 'readline';
import {
  loadConfig,
  initializeSentry,
  createDLQConnection,
  parseArguments,
  getDLQJobs,
  getJobsByIds,
  filterJobsByError,
  removeJobFromDLQ,
  logDLQIntervention,
  displayJobSummary,
  type CLIArgs,
  type DLQConnection,
} from './utils/dlq-cli-helpers';

// ============================================================================
// MAIN SCRIPT
// ============================================================================

async function main() {
  let connection: DLQConnection | null = null;

  try {
    console.log('🗑️  DLQ Discard Jobs Script\n');
    console.log('⚠️  DANGER: This script permanently removes jobs from DLQ!');
    console.log('═'.repeat(60));

    // 1. Load configuration
    const config = loadConfig();
    initializeSentry(config);

    // 2. Parse arguments
    const args = parseArguments();

    // 3. Validate arguments for execute mode
    if (args.execute) {
      if (!args.reason) {
        console.error('❌ Error: --reason is required in execute mode');
        console.error('   Reason is logged to Sentry for audit trail');
        process.exit(1);
      }
    }

    // 4. Validate that either job-ids or error-pattern is provided
    if (!args.jobIds && !args.errorPattern) {
      console.error('❌ Error: Either --job-ids or --error-pattern must be provided');
      console.error('   ⚠️  Recommendation: Use --job-ids for safety (explicit job selection)');
      console.error('   ⚠️  WARNING: --error-pattern discards ALL matching jobs (dangerous!)');
      process.exit(1);
    }

    // 5. Warn about error-pattern mode
    if (args.errorPattern && args.execute) {
      console.log('\n⚠️  WARNING: Using --error-pattern mode!');
      console.log('   This will discard ALL jobs matching the pattern.');
      console.log('   Consider using --job-ids for safer, explicit selection.');
      console.log('');
    }

    // 6. Connect to DLQ
    connection = createDLQConnection(config);

    // 7. Get jobs from DLQ
    let jobs;
    if (args.jobIds) {
      console.log(`\n🔍 Mode: Discard specific jobs by ID (RECOMMENDED)\n`);
      jobs = await getJobsByIds(connection, args.jobIds);
    } else if (args.errorPattern) {
      console.log(`\n🔍 Mode: Discard jobs matching error pattern (DANGEROUS!)\n`);
      const allJobs = await getDLQJobs(connection, args.limit);
      jobs = filterJobsByError(allJobs, args.errorPattern);
    } else {
      throw new Error('Internal error: No job selection method provided');
    }

    // 8. Check if any jobs found
    if (jobs.length === 0) {
      console.log('\n⚠️  No jobs found matching criteria');
      process.exit(0);
    }

    // 9. Display job summary
    displayJobSummary(jobs);

    // 10. Preview discard operation
    console.log(`\n📋 Discard Preview:\n`);
    console.log(`   - Jobs to discard: ${jobs.length}`);
    console.log(`   - Reason: ${args.reason || 'N/A (dry-run)'}`);
    console.log(`   - Mode: ${args.dryRun ? 'DRY-RUN' : 'EXECUTE'}`);

    // 11. DANGER warning for execute mode
    if (args.execute) {
      console.log('\n⚠️  DANGER WARNING:');
      console.log(`   - ${jobs.length} jobs will be PERMANENTLY deleted from DLQ`);
      console.log('   - This action CANNOT be undone');
      console.log('   - Jobs will be lost forever');
    }

    // 12. Check if --yes flag is provided
    const yesFlag = process.argv.includes('--yes');

    // 13. Confirm action
    if (args.execute && !yesFlag) {
      const confirmed = await confirmDiscard(jobs.length, args.reason!);
      if (!confirmed) {
        console.log('\n❌ Operation cancelled by user');
        process.exit(0);
      }

      // Extra confirmation for >10 jobs
      if (jobs.length > 10) {
        const extraConfirmed = await confirmLargeDiscard(jobs.length);
        if (!extraConfirmed) {
          console.log('\n❌ Operation cancelled by user');
          process.exit(0);
        }
      }
    } else if (args.execute && yesFlag) {
      console.log('\n⚠️  Skipping confirmation (--yes flag provided)');
    }

    // 14. Discard jobs
    console.log('\n🗑️  Discarding jobs...\n');
    let successCount = 0;
    let failureCount = 0;

    for (const job of jobs) {
      try {
        await removeJobFromDLQ(job, args.dryRun);
        successCount++;
      } catch (error) {
        console.error(`❌ Failed to discard job ${job.id}:`, error);
        failureCount++;
      }
    }

    // 15. Display results
    console.log('\n═'.repeat(60));
    console.log(`\n${args.dryRun ? '📊 Discard Preview:' : '✅ Discard Complete:'}\n`);
    console.log(`   - Successfully discarded: ${successCount} jobs`);
    if (failureCount > 0) {
      console.log(`   - Failed to discard: ${failureCount} jobs`);
    }
    if (!args.dryRun) {
      console.log(`   - Reason: ${args.reason}`);
      console.log('\n   ⚠️  Jobs have been permanently removed from DLQ');
    }

    // 16. Log to Sentry (if executed)
    if (!args.dryRun) {
      const jobIds = jobs.map(j => j.id || 'unknown');
      logDLQIntervention(
        'discard',
        jobIds,
        args.reason!,
        args.operator,
        false,
        {
          success_count: successCount,
          failure_count: failureCount,
          discard_mode: args.jobIds ? 'by_id' : 'by_pattern',
          skipped_confirmation: yesFlag,
        }
      );
    }

    console.log('\n✅ Script completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  } finally {
    // Cleanup
    if (connection) {
      await connection.cleanup();
    }
  }
}

// ============================================================================
// CONFIRMATION PROMPTS
// ============================================================================

async function confirmDiscard(
  jobCount: number,
  reason: string
): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    console.log('\n⚠️  DANGER: You are about to permanently discard DLQ jobs!\n');
    console.log(`   Jobs to discard: ${jobCount}`);
    console.log(`   Reason: ${reason}`);
    console.log('\n   This action CANNOT be undone. Jobs will be removed from DLQ.');

    rl.question('\n   Type "DISCARD" to confirm (or Ctrl+C to cancel): ', (answer) => {
      rl.close();
      const confirmed = answer === 'DISCARD';
      if (!confirmed) {
        console.log(`\n   ❌ Invalid confirmation: "${answer}" (expected "DISCARD")`);
      }
      resolve(confirmed);
    });
  });
}

async function confirmLargeDiscard(jobCount: number): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    console.log('\n⚠️  EXTRA CONFIRMATION REQUIRED:\n');
    console.log(`   You are about to discard ${jobCount} jobs (>10 jobs threshold)`);
    console.log('   This is a LARGE batch discard operation.');

    rl.question('\n   Are you absolutely sure? (yes/no): ', (answer) => {
      rl.close();
      const confirmed = answer.toLowerCase() === 'yes';
      if (!confirmed) {
        console.log(`\n   ❌ Large batch discard cancelled`);
      }
      resolve(confirmed);
    });
  });
}

// ============================================================================
// RUN SCRIPT
// ============================================================================

main();
