#!/usr/bin/env tsx
/**
 * Manual Embedding Latency Measurement Script
 * 
 * Fallback script when database migration is blocked.
 * Measures OpenAI API latency directly without database operations.
 * 
 * Usage: tsx scripts/observability/manual-timing.ts
 * 
 * Outputs:
 * - Console output with percentile metrics
 * - Estimated baselines accounting for database overhead
 */

import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Measure raw OpenAI embedding API latency
 */
async function measureEmbeddingLatency() {
  console.log('📊 Measuring OpenAI embedding latency (50 iterations)...\n');
  
  const iterations = 50;
  const latencies: number[] = [];
  
  for (let i = 0; i < iterations; i++) {
    const start = Date.now();
    
    try {
      await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: `Test embedding measurement iteration ${i}: This is sample text for measuring OpenAI API latency.`
      });
      const duration = Date.now() - start;
      latencies.push(duration);
      
      // Progress indicator
      if ((i + 1) % 10 === 0) {
        console.log(`  Progress: ${i + 1}/${iterations} measurements completed`);
      }
    } catch (error) {
      console.error(`  ❌ Iteration ${i + 1} failed:`, (error as Error).message);
    }
  }
  
  if (latencies.length === 0) {
    throw new Error('No successful measurements collected. Check OPENAI_API_KEY.');
  }
  
  console.log(`  ✅ Completed ${latencies.length}/${iterations} measurements\n`);
  
  // Sort for percentile calculations
  latencies.sort((a, b) => a - b);
  
  return {
    p50: latencies[Math.floor(latencies.length * 0.5)],
    p95: latencies[Math.floor(latencies.length * 0.95)],
    p99: latencies[Math.floor(latencies.length * 0.99)],
    avg: latencies.reduce((a, b) => a + b, 0) / latencies.length,
    min: latencies[0],
    max: latencies[latencies.length - 1],
    count: latencies.length
  };
}

/**
 * Calculate estimated baselines including database overhead
 */
function estimateBaselines(apiMetrics: ReturnType<Awaited<typeof measureEmbeddingLatency>>) {
  // Estimated database overhead (conservative):
  // - Single insert: ~10-30ms
  // - Vector index update: ~20-50ms
  const dbOverheadEstimate = 30;
  
  return {
    embeddingGeneration: {
      p50: Math.round(apiMetrics.p50 + dbOverheadEstimate),
      p95: Math.round(apiMetrics.p95 + dbOverheadEstimate),
      p99: Math.round(apiMetrics.p99 + dbOverheadEstimate),
      avg: Math.round(apiMetrics.avg + dbOverheadEstimate),
    },
    semanticSearch: {
      // Search = Query embedding + Vector search
      // Assuming cached embeddings reduce by ~66%
      p95: Math.round((apiMetrics.p95 + 30) / 3),
    },
    batchThroughput: {
      // Entities per minute based on P95 latency
      entitiesPerMinute: Math.floor(60000 / (apiMetrics.p95 + dbOverheadEstimate)),
    }
  };
}

/**
 * Print formatted results
 */
function printResults(apiMetrics: any, estimates: any) {
  console.log('═'.repeat(60));
  console.log('  MANUAL TIMING RESULTS');
  console.log('═'.repeat(60));
  console.log();
  
  console.log('📊 Raw OpenAI API Metrics (no database):');
  console.log(`   P50 Latency:     ${apiMetrics.p50.toFixed(0)}ms`);
  console.log(`   P95 Latency:     ${apiMetrics.p95.toFixed(0)}ms`);
  console.log(`   P99 Latency:     ${apiMetrics.p99.toFixed(0)}ms`);
  console.log(`   Average:         ${apiMetrics.avg.toFixed(0)}ms`);
  console.log(`   Min:             ${apiMetrics.min.toFixed(0)}ms`);
  console.log(`   Max:             ${apiMetrics.max.toFixed(0)}ms`);
  console.log(`   Measurements:    ${apiMetrics.count}`);
  console.log();
  
  console.log('📈 Estimated Baselines (with DB overhead):');
  console.log();
  
  console.log('  1️⃣  Embedding Generation:');
  console.log(`     P50:  ${estimates.embeddingGeneration.p50}ms`);
  console.log(`     P95:  ${estimates.embeddingGeneration.p95}ms`);
  console.log(`     P99:  ${estimates.embeddingGeneration.p99}ms`);
  console.log(`     Avg:  ${estimates.embeddingGeneration.avg}ms`);
  console.log(`     SLO:  <500ms (P95)`);
  console.log(`     Status: ${estimates.embeddingGeneration.p95 < 500 ? '✅ LIKELY PASS' : '⚠️  MAY FAIL'}`);
  console.log();
  
  console.log('  2️⃣  Semantic Search (estimated):');
  console.log(`     P95:  ~${estimates.semanticSearch.p95}ms (cached embeddings)`);
  console.log(`     SLO:  <50ms (P95)`);
  console.log(`     Status: ${estimates.semanticSearch.p95 < 50 ? '✅ LIKELY PASS' : '⚠️  MAY FAIL - needs optimization'}`);
  console.log();
  
  console.log('  3️⃣  Batch Throughput:');
  console.log(`     Rate: ~${estimates.batchThroughput.entitiesPerMinute} entities/minute`);
  console.log(`     SLO:  >100 entities/minute`);
  console.log(`     Status: ${estimates.batchThroughput.entitiesPerMinute > 100 ? '✅ LIKELY PASS' : '⚠️  MAY FAIL'}`);
  console.log();
  
  console.log('⚠️  Important Notes:');
  console.log('   - These are ESTIMATED baselines only');
  console.log('   - Database overhead is assumed (~30ms conservative estimate)');
  console.log('   - Actual performance may vary based on:');
  console.log('     • Database connection latency');
  console.log('     • Vector index size and performance');
  console.log('     • Concurrent request load');
  console.log('   - Run actual baseline script after migration completes');
  console.log();
  
  console.log('📋 Next Steps:');
  console.log('   1. Resolve database migration blocker');
  console.log('   2. Run: tsx scripts/observability/perf-baseline.ts');
  console.log('   3. Compare actual vs. estimated baselines');
  console.log('   4. Validate SLO compliance with real data');
  console.log();
  console.log('═'.repeat(60));
}

/**
 * Main execution
 */
async function main() {
  console.log();
  console.log('═'.repeat(60));
  console.log('  Manual OpenAI API Timing (Migration Blocker Workaround)');
  console.log('  Sprint 1 Gap 4: Performance Benchmarks');
  console.log('═'.repeat(60));
  console.log();
  
  // Check for OpenAI API key
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ Error: OPENAI_API_KEY environment variable not set');
    console.error('   Please set your OpenAI API key to run this script.');
    process.exit(1);
  }
  
  try {
    // Measure raw API latency
    const apiMetrics = await measureEmbeddingLatency();
    
    // Estimate baselines with database overhead
    const estimates = estimateBaselines(apiMetrics);
    
    // Print formatted results
    printResults(apiMetrics, estimates);
    
  } catch (error) {
    console.error();
    console.error('❌ Error during manual timing:', error);
    console.error();
    process.exit(1);
  }
}

// Run the script
main().catch(console.error);
