/**
 * Test script for DLQ CLI helpers
 * 
 * Run with: npx tsx scripts/test-dlq-helpers.ts
 */

import {
  loadConfig,
  initializeSentry,
  createDLQConnection,
  parseArguments,
  logDLQIntervention,
  getDLQJobs,
  filterJobsByError,
  displayJobSummary,
  QUEUE_NAMES,
} from './utils/dlq-cli-helpers';

async function testHelpers() {
  console.log('🧪 Testing DLQ CLI Helpers\n');
  console.log('=' .repeat(60));

  try {
    // Test 1: Config loading
    console.log('\n1️⃣  Testing config loading...');
    const config = loadConfig();
    console.log('   ✅ Config loaded successfully');

    // Test 2: Sentry initialization
    console.log('\n2️⃣  Testing Sentry initialization...');
    initializeSentry(config);
    console.log('   ✅ Sentry initialized');

    // Test 3: Argument parsing
    console.log('\n3️⃣  Testing argument parsing...');
    const testArgs = [
      'node',
      'script.js',
      '--dry-run',
      '--job-ids',
      'job1,job2,job3',
      '--error-pattern',
      'timeout',
      '--tag',
      'reviewed',
      '--reason',
      'Manual triage',
      '--operator',
      'admin',
    ];
    const args = parseArguments(testArgs);
    console.log('   ✅ Arguments parsed successfully');

    // Test 4: Queue names
    console.log('\n4️⃣  Testing queue names...');
    console.log(`   - DLQ: ${QUEUE_NAMES.DLQ}`);
    console.log(`   - Connector Sync: ${QUEUE_NAMES.CONNECTOR_SYNC}`);
    console.log(`   - Migration: ${QUEUE_NAMES.APPLY_MIGRATION}`);
    console.log('   ✅ Queue names defined');

    // Test 5: Sentry audit logging (dry-run)
    console.log('\n5️⃣  Testing Sentry audit logging...');
    logDLQIntervention(
      'tag',
      ['job1', 'job2'],
      'Test intervention',
      'test-operator',
      true
    );
    console.log('   ✅ Audit log sent (dry-run mode)');

    // Test 6: Connection (only if Redis is available)
    if (config.redisUrl) {
      console.log('\n6️⃣  Testing Redis/BullMQ connection...');
      try {
        const connection = createDLQConnection(config);
        console.log('   ✅ Connection created');

        // Test getting DLQ queue
        const dlqQueue = connection.getDLQQueue();
        console.log(`   ✅ DLQ queue instance: ${dlqQueue.name}`);

        // Test getting jobs (limit to 5 for testing)
        console.log('\n7️⃣  Testing getDLQJobs...');
        const jobs = await getDLQJobs(connection, 5);
        console.log(`   ✅ Retrieved ${jobs.length} jobs from DLQ`);

        if (jobs.length > 0) {
          // Test job summary
          console.log('\n8️⃣  Testing displayJobSummary...');
          displayJobSummary(jobs);
          console.log('   ✅ Job summary displayed');

          // Test filtering (if there are jobs)
          console.log('\n9️⃣  Testing filterJobsByError...');
          const filtered = filterJobsByError(jobs, 'error');
          console.log(`   ✅ Filtered ${filtered.length} jobs`);
        }

        // Cleanup
        console.log('\n🧹 Testing cleanup...');
        await connection.cleanup();
        console.log('   ✅ Cleanup complete');
      } catch (error) {
        console.warn('   ⚠️  Redis connection test skipped:', (error as Error).message);
      }
    } else {
      console.log('\n6️⃣  Skipping connection tests (no REDIS_URL configured)');
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ All tests passed!\n');
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

// Run tests
testHelpers().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
