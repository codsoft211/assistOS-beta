import { db } from '../../../apps/api/db';
import { detectedPatterns, crossTenantPatterns } from '../../../shared/schema';
import { sql, gte, and, isNull } from 'drizzle-orm';
import { subDays } from 'date-fns';
import { anonymizationService, type AnonymizedPattern } from './anonymization.service';

export interface AggregationResult {
  patternsProcessed: number;
  patternsCreated: number;
  patternsUpdated: number;
  tenantsAnalyzed: number;
}

export class CrossTenantPatternAggregator {
  /**
   * Aggregate patterns across all tenants
   * This is the main entry point for cross-tenant learning
   */
  async aggregateAllTenants(environment: 'sandbox' | 'production' = 'sandbox'): Promise<AggregationResult> {
    // 1. Fetch all detected patterns from all tenants (recent ones only)
    // CRITICAL: Filter by environment to prevent sandbox/production data mixing
    const cutoffDate = subDays(new Date(), 90); // Last 90 days
    
    const allPatterns = await db.query.detectedPatterns.findMany({
      where: and(
        sql`${detectedPatterns.environment} = ${environment}`,
        gte(detectedPatterns.lastSeen, cutoffDate),
        isNull(detectedPatterns.dismissedAt)
      ),
      limit: 10000, // Safety limit
    });

    if (allPatterns.length === 0) {
      return {
        patternsProcessed: 0,
        patternsCreated: 0,
        patternsUpdated: 0,
        tenantsAnalyzed: 0,
      };
    }

    // 2. Anonymize and aggregate patterns
    const anonymized = anonymizationService.anonymizeAndAggregate(allPatterns);

    // 3. Count unique tenants per pattern
    const tenantCountMap = this.countUniqueTenants(allPatterns);

    // 4. Upsert to cross_tenant_patterns table
    let created = 0;
    let updated = 0;

    for (const pattern of anonymized) {
      const uniqueTenants = tenantCountMap.get(pattern.id) || 1;
      const utilityScore = this.calculateUtilityScore(pattern, uniqueTenants);

      const existing = await db.query.crossTenantPatterns.findFirst({
        where: and(
          sql`${crossTenantPatterns.id} = ${pattern.id}`,
          sql`${crossTenantPatterns.environment} = ${environment}`
        ),
      });

      if (!existing) {
        // Create new cross-tenant pattern
        await db.insert(crossTenantPatterns).values({
          id: pattern.id,
          type: pattern.type,
          category: pattern.category,
          sequence: pattern.sequence,
          totalOccurrences: pattern.occurrences,
          uniqueTenants,
          avgConfidence: pattern.confidence,
          successRate: pattern.successRate || pattern.confidence,
          suggestedWorkflow: this.generateWorkflowSuggestion(pattern),
          firstSeen: pattern.firstSeen,
          lastSeen: pattern.lastSeen,
          utilityScore,
          environment,
        });
        created++;
      } else {
        // Update existing pattern (idempotent - SET recalculated values, don't accumulate)
        // CRITICAL: Overwrites with fresh calculation to prevent double counting on repeated runs
        await db.update(crossTenantPatterns)
          .set({
            totalOccurrences: pattern.occurrences, // SET (not +=) for idempotency
            uniqueTenants: uniqueTenants,
            avgConfidence: pattern.confidence, // Recalculated fresh value
            successRate: pattern.successRate || pattern.confidence,
            lastSeen: pattern.lastSeen > existing.lastSeen ? pattern.lastSeen : existing.lastSeen,
            utilityScore,
            lastAggregated: sql`NOW()`,
            updatedAt: sql`NOW()`,
          })
          .where(sql`${crossTenantPatterns.id} = ${pattern.id}`);
        updated++;
      }
    }

    // 5. Count unique tenants analyzed
    const tenantsAnalyzed = new Set(allPatterns.map(p => p.tenantId)).size;

    return {
      patternsProcessed: anonymized.length,
      patternsCreated: created,
      patternsUpdated: updated,
      tenantsAnalyzed,
    };
  }

  /**
   * Get top patterns for a specific category
   */
  async getTopPatterns(
    category: string,
    environment: 'sandbox' | 'production' = 'sandbox',
    limit: number = 10
  ) {
    return db.query.crossTenantPatterns.findMany({
      where: and(
        sql`${crossTenantPatterns.category} = ${category}`,
        sql`${crossTenantPatterns.environment} = ${environment}`
      ),
      orderBy: sql`${crossTenantPatterns.utilityScore} DESC`,
      limit,
    });
  }

  /**
   * Count unique tenants per pattern ID
   */
  private countUniqueTenants(patterns: typeof detectedPatterns.$inferSelect[]): Map<string, number> {
    const map = new Map<string, Set<string>>();

    for (const pattern of patterns) {
      const patternId = anonymizationService.anonymizePattern(pattern).id;
      
      if (!map.has(patternId)) {
        map.set(patternId, new Set());
      }
      map.get(patternId)!.add(pattern.tenantId);
    }

    // Convert Set size to number
    const result = new Map<string, number>();
    for (const [id, tenantSet] of Array.from(map.entries())) {
      result.set(id, tenantSet.size);
    }

    return result;
  }

  /**
   * Calculate utility score for pattern
   * Score = (confidence * 0.4) + (adoption * 0.4) + (successRate * 0.2)
   * where adoption = min(uniqueTenants / 10, 1)
   */
  private calculateUtilityScore(pattern: AnonymizedPattern, uniqueTenants: number): number {
    const confidenceWeight = 0.4;
    const adoptionWeight = 0.4;
    const successWeight = 0.2;

    const confidence = pattern.confidence;
    const adoption = Math.min(uniqueTenants / 10, 1); // Normalize to 0-1 (10+ tenants = max)
    const successRate = pattern.successRate || pattern.confidence;

    return (confidence * confidenceWeight) + (adoption * adoptionWeight) + (successRate * successWeight);
  }

  /**
   * Generate workflow suggestion from pattern
   */
  private generateWorkflowSuggestion(pattern: AnonymizedPattern): {
    name: string;
    description: string;
    trigger: string;
    actions: string[];
    estimatedTimeSaved?: string;
  } {
    const stepNames = pattern.sequence.map(s => s.toolName || s.actionType);
    
    return {
      name: `Automated: ${stepNames.slice(0, 3).join(' → ')}`,
      description: `Pattern detectado em ${pattern.occurrences} ocorrências com ${(pattern.confidence * 100).toFixed(0)}% confiança`,
      trigger: `Quando executar ${stepNames[0]}`,
      actions: stepNames.slice(1),
      estimatedTimeSaved: this.estimateTimeSaved(pattern.sequence.length),
    };
  }

  /**
   * Estimate time saved based on pattern complexity
   */
  private estimateTimeSaved(stepCount: number): string {
    const minutesPerStep = 2;
    const totalMinutes = stepCount * minutesPerStep;

    if (totalMinutes < 60) {
      return `${totalMinutes} min/dia`;
    } else {
      return `${(totalMinutes / 60).toFixed(1)} horas/dia`;
    }
  }

  /**
   * Privacy audit: Verify no PII in cross-tenant patterns
   */
  async auditPrivacy(environment: 'sandbox' | 'production' = 'sandbox'): Promise<{
    totalPatterns: number;
    privacyCompliant: number;
    violations: string[];
  }> {
    const patterns = await db.query.crossTenantPatterns.findMany({
      where: sql`${crossTenantPatterns.environment} = ${environment}`,
    });

    const violations: string[] = [];
    let compliant = 0;

    for (const pattern of patterns) {
      const anonymized: AnonymizedPattern = {
        id: pattern.id,
        type: pattern.type as 'sequential' | 'temporal' | 'conditional',
        category: pattern.category,
        sequence: pattern.sequence as any,
        occurrences: pattern.totalOccurrences,
        confidence: pattern.avgConfidence,
        firstSeen: pattern.firstSeen,
        lastSeen: pattern.lastSeen,
        successRate: pattern.successRate || undefined,
      };

      if (anonymizationService.isFullyAnonymized(anonymized)) {
        compliant++;
      } else {
        violations.push(pattern.id);
      }
    }

    return {
      totalPatterns: patterns.length,
      privacyCompliant: compliant,
      violations,
    };
  }
}

export const crossTenantPatternAggregator = new CrossTenantPatternAggregator();
