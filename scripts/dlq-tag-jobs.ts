#!/usr/bin/env tsx

/**
 * DLQ Tag Jobs Script
 * 
 * Tags DLQ jobs for manual review and tracking.
 * 
 * Usage:
 *   # Tag specific jobs
 *   npx tsx scripts/dlq-tag-jobs.ts --job-ids <id1>,<id2> --tag "manual_review_required" --reason "Invalid payload"
 * 
 *   # Tag jobs by error pattern
 *   npx tsx scripts/dlq-tag-jobs.ts --error-pattern "ValidationError" --tag "data_corruption" --execute --reason "Schema validation failed"
 * 
 *   # Multiple tags (comma-separated)
 *   npx tsx scripts/dlq-tag-jobs.ts --job-ids <id1> --tag "review,urgent,data_issue" --execute --reason "Critical issue"
 * 
 * Features:
 *   - Dry-run mode by default (--dry-run)
 *   - Execute mode (--execute) requires --tag and --reason
 *   - Tags append to existing metadata without clobbering
 *   - Sentry audit logging
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
  tagJob,
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
    console.log('🏷️  DLQ Tag Jobs Script\n');
    console.log('═'.repeat(60));

    // 1. Load configuration
    const config = loadConfig();
    initializeSentry(config);

    // 2. Parse arguments
    const args = parseArguments();

    // 3. Validate arguments for execute mode
    if (args.execute) {
      if (!args.tag) {
        console.error('❌ Error: --tag is required in execute mode');
        process.exit(1);
      }
      if (!args.reason) {
        console.error('❌ Error: --reason is required in execute mode');
        process.exit(1);
      }
    }

    // 4. Validate that either job-ids or error-pattern is provided
    if (!args.jobIds && !args.errorPattern) {
      console.error('❌ Error: Either --job-ids or --error-pattern must be provided');
      console.error('   Use --job-ids to tag specific jobs');
      console.error('   Use --error-pattern to tag all jobs matching an error pattern');
      process.exit(1);
    }

    // 5. Connect to DLQ
    connection = createDLQConnection(config);

    // 6. Get jobs from DLQ
    let jobs;
    if (args.jobIds) {
      console.log(`\n🔍 Mode: Tag specific jobs by ID\n`);
      jobs = await getJobsByIds(connection, args.jobIds);
    } else if (args.errorPattern) {
      console.log(`\n🔍 Mode: Tag jobs matching error pattern\n`);
      const allJobs = await getDLQJobs(connection, args.limit);
      jobs = filterJobsByError(allJobs, args.errorPattern);
    } else {
      throw new Error('Internal error: No job selection method provided');
    }

    // 7. Check if any jobs found
    if (jobs.length === 0) {
      console.log('\n⚠️  No jobs found matching criteria');
      process.exit(0);
    }

    // 8. Display job summary
    displayJobSummary(jobs);

    // 9. Parse tags (support comma-separated)
    const tags = args.tag?.split(',').map(t => t.trim()).filter(Boolean) || [];
    if (tags.length === 0 && args.execute) {
      console.error('❌ Error: No valid tags provided');
      process.exit(1);
    }

    // 10. Preview tagging operation
    console.log(`\n📋 Tagging Preview:\n`);
    console.log(`   - Jobs to tag: ${jobs.length}`);
    console.log(`   - Tags to apply: ${tags.join(', ')}`);
    console.log(`   - Reason: ${args.reason || 'N/A (dry-run)'}`);
    console.log(`   - Mode: ${args.dryRun ? 'DRY-RUN' : 'EXECUTE'}`);

    // 11. Confirm action
    if (args.execute) {
      const confirmed = await confirmTagging(jobs.length, tags, args.reason!);
      if (!confirmed) {
        console.log('\n❌ Operation cancelled by user');
        process.exit(0);
      }
    }

    // 12. Tag jobs
    console.log('\n🏷️  Tagging jobs...\n');
    let successCount = 0;
    let failureCount = 0;

    for (const job of jobs) {
      try {
        // Apply all tags to each job
        for (const tag of tags) {
          await tagJob(job, tag, args.dryRun);
        }
        successCount++;
      } catch (error) {
        console.error(`❌ Failed to tag job ${job.id}:`, error);
        failureCount++;
      }
    }

    // 13. Display results
    console.log('\n═'.repeat(60));
    console.log(`\n✅ Tagging ${args.dryRun ? 'Preview' : 'Complete'}:\n`);
    console.log(`   - Successfully tagged: ${successCount} jobs`);
    if (failureCount > 0) {
      console.log(`   - Failed to tag: ${failureCount} jobs`);
    }
    console.log(`   - Tags applied: ${tags.join(', ')}`);

    // 14. Log to Sentry (if executed)
    if (!args.dryRun) {
      const jobIds = jobs.map(j => j.id || 'unknown');
      logDLQIntervention(
        'tag',
        jobIds,
        args.reason!,
        args.operator,
        false,
        {
          tags: tags,
          success_count: successCount,
          failure_count: failureCount,
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
// CONFIRMATION PROMPT
// ============================================================================

async function confirmTagging(
  jobCount: number,
  tags: string[],
  reason: string
): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    console.log('\n⚠️  Confirmation Required:\n');
    console.log(`   You are about to tag ${jobCount} DLQ jobs with:`);
    console.log(`   Tags: ${tags.join(', ')}`);
    console.log(`   Reason: ${reason}`);
    console.log('\n   This will modify job metadata in the DLQ.');

    rl.question('\n   Continue? (yes/no): ', (answer) => {
      rl.close();
      const confirmed = answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y';
      resolve(confirmed);
    });
  });
}

// ============================================================================
// RUN SCRIPT
// ============================================================================

main();
