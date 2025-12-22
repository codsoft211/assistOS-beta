import type { Job } from 'bullmq';
import { crossTenantPatternAggregator } from '../../../packages/ai/services/cross-tenant-pattern-aggregator.service';

export interface AggregateCrossTenantPatternsJobData {
  environment?: 'sandbox' | 'production';
  requestId?: string;
}

export interface AggregateCrossTenantPatternsJobResult {
  success: boolean;
  patternsProcessed: number;
  patternsCreated: number;
  patternsUpdated: number;
  tenantsAnalyzed: number;
  duration: number;
  error?: string;
}

/**
 * Background job: Aggregate patterns across all tenants
 * 
 * This job:
 * 1. Fetches all detected patterns from all tenants
 * 2. Anonymizes and aggregates them into cross-tenant patterns
 * 3. Updates the global knowledge base
 * 
 * Privacy guarantee: All tenant-specific data is stripped
 * Runs: Daily (configured in worker scheduler)
 */
export async function aggregateCrossTenantPatternsJob(
  job: Job<AggregateCrossTenantPatternsJobData>
): Promise<AggregateCrossTenantPatternsJobResult> {
  const startTime = Date.now();
  const { environment = 'sandbox', requestId } = job.data;

  console.log(`[Cross-Tenant Aggregation Job ${job.id}] Starting for environment: ${environment}`);

  try {
    // Update job progress
    await job.updateProgress(10);

    // Execute aggregation
    const result = await crossTenantPatternAggregator.aggregateAllTenants(environment);

    await job.updateProgress(80);

    // Privacy audit (optional but recommended)
    const auditResult = await crossTenantPatternAggregator.auditPrivacy(environment);
    
    if (auditResult.violations.length > 0) {
      console.warn(`[Cross-Tenant Aggregation Job ${job.id}] Privacy violations detected:`, auditResult.violations);
    }

    await job.updateProgress(100);

    const duration = Date.now() - startTime;

    console.log(`[Cross-Tenant Aggregation Job ${job.id}] Completed: ${result.patternsProcessed} patterns processed, ${result.patternsCreated} created, ${result.patternsUpdated} updated (${result.tenantsAnalyzed} tenants, ${duration}ms)`);

    return {
      success: true,
      patternsProcessed: result.patternsProcessed,
      patternsCreated: result.patternsCreated,
      patternsUpdated: result.patternsUpdated,
      tenantsAnalyzed: result.tenantsAnalyzed,
      duration,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    console.error(`[Cross-Tenant Aggregation Job ${job.id}] Failed:`, errorMessage, `(${duration}ms)`);

    return {
      success: false,
      patternsProcessed: 0,
      patternsCreated: 0,
      patternsUpdated: 0,
      tenantsAnalyzed: 0,
      duration,
      error: errorMessage,
    };
  }
}
