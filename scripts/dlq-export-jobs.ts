#!/usr/bin/env tsx

/**
 * DLQ Export Jobs Script
 * 
 * Exports DLQ jobs to CSV for offline analysis and manual processing.
 * 
 * Usage:
 *   # Export all DLQ jobs
 *   npx tsx scripts/dlq-export-jobs.ts --output /tmp/dlq-export-$(date +%Y%m%d).csv
 * 
 *   # Export filtered jobs by error pattern
 *   npx tsx scripts/dlq-export-jobs.ts --error-pattern "timeout" --output /tmp/dlq-timeout-jobs.csv
 * 
 *   # Export specific jobs by ID
 *   npx tsx scripts/dlq-export-jobs.ts --job-ids <id1>,<id2> --output /tmp/dlq-manual-review.csv
 * 
 * Features:
 *   - No dry-run mode (export is read-only)
 *   - CSV with 8 columns: job_id, original_queue, tenant_id, user_id, failed_at, attempts, error_message, tags
 *   - Proper CSV escaping (quotes, commas)
 *   - Error messages truncated to 200 chars
 *   - Sentry audit logging
 */

import {
  loadConfig,
  initializeSentry,
  createDLQConnection,
  parseArguments,
  getDLQJobs,
  getJobsByIds,
  filterJobsByError,
  exportJobsToCSV,
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
    console.log('📄 DLQ Export Jobs Script\n');
    console.log('═'.repeat(60));

    // 1. Load configuration
    const config = loadConfig();
    initializeSentry(config);

    // 2. Parse arguments
    const args = parseArguments();

    // 3. Validate --output is provided
    if (!args.output) {
      console.error('❌ Error: --output flag is required');
      console.error('   Usage: npx tsx scripts/dlq-export-jobs.ts --output <file.csv>');
      console.error('   Example: --output /tmp/dlq-export-$(date +%Y%m%d).csv');
      process.exit(1);
    }

    // 4. Validate output file extension
    if (!args.output.endsWith('.csv')) {
      console.error('❌ Error: Output file must have .csv extension');
      process.exit(1);
    }

    // 5. Connect to DLQ
    connection = createDLQConnection(config);

    // 6. Get jobs from DLQ
    let jobs;
    if (args.jobIds) {
      console.log(`\n🔍 Mode: Export specific jobs by ID\n`);
      jobs = await getJobsByIds(connection, args.jobIds);
    } else if (args.errorPattern) {
      console.log(`\n🔍 Mode: Export jobs matching error pattern\n`);
      const allJobs = await getDLQJobs(connection, args.limit);
      jobs = filterJobsByError(allJobs, args.errorPattern);
    } else {
      console.log(`\n🔍 Mode: Export all DLQ jobs\n`);
      jobs = await getDLQJobs(connection, args.limit);
    }

    // 7. Check if any jobs found
    if (jobs.length === 0) {
      console.log('\n⚠️  No jobs found matching criteria');
      console.log('   No CSV file will be created');
      process.exit(0);
    }

    // 8. Display job summary
    displayJobSummary(jobs);

    // 9. Truncate error messages to 200 chars (per requirements)
    console.log('\n📊 Preparing CSV export...\n');
    console.log(`   - Jobs to export: ${jobs.length}`);
    console.log(`   - Output file: ${args.output}`);
    console.log(`   - CSV columns: job_id, original_queue, tenant_id, user_id, failed_at, attempts, error_message, tags`);

    // Truncate error messages to 200 chars before export
    const jobsWithTruncatedErrors = jobs.map(job => {
      const truncatedData = { ...job.data };
      if (truncatedData.error && truncatedData.error.length > 200) {
        truncatedData.error = truncatedData.error.substring(0, 200) + '...';
      }
      // Create a new job-like object with truncated error
      return {
        ...job,
        data: truncatedData,
      };
    });

    // 10. Export to CSV (never dry-run for export)
    await exportJobsToCSV(jobsWithTruncatedErrors as any, args.output, false);

    // 11. Display results
    console.log('\n═'.repeat(60));
    console.log(`\n✅ Export Complete:\n`);
    console.log(`   - Exported ${jobs.length} jobs to ${args.output}`);
    console.log(`   - CSV file ready for analysis`);

    // 12. Log to Sentry
    const jobIds = jobs.map(j => j.id || 'unknown');
    logDLQIntervention(
      'export',
      jobIds,
      args.reason || 'Manual export for offline analysis',
      args.operator,
      false,
      {
        output_file: args.output,
        job_count: jobs.length,
        export_mode: args.jobIds ? 'by_id' : args.errorPattern ? 'by_pattern' : 'all',
      }
    );

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
// RUN SCRIPT
// ============================================================================

main();
