import { db } from '../../../apps/api/db';
import { crossTenantPatterns, detectedPatterns } from '../../../shared/schema';
import { sql, desc, and, gt, isNull } from 'drizzle-orm';

export interface PatternSuggestion {
  id: string;
  type: 'sequential' | 'temporal' | 'conditional';
  category: string;
  suggestedWorkflow: {
    name: string;
    description: string;
    trigger: string;
    actions: string[];
    estimatedTimeSaved?: string;
  };
  evidence: {
    totalOccurrences: number;
    uniqueTenants: number;
    avgConfidence: number;
    successRate: number;
    utilityScore: number;
  };
  alreadyImplemented: boolean; // Whether tenant already uses this pattern
}

export class PatternSuggestionService {
  /**
   * Get pattern suggestions for a tenant
   * Filters out patterns tenant is already using
   */
  async getSuggestionsForTenant(
    tenantId: string,
    environment: 'sandbox' | 'production' = 'sandbox',
    options: {
      category?: string;
      minUtilityScore?: number;
      limit?: number;
    } = {}
  ): Promise<PatternSuggestion[]> {
    const { category, minUtilityScore = 0.5, limit = 10 } = options;

    // 1. Fetch tenant's existing patterns (to filter out duplicates)
    const existingPatterns = await db.query.detectedPatterns.findMany({
      where: and(
        sql`${detectedPatterns.tenantId} = ${tenantId}`,
        sql`${detectedPatterns.environment} = ${environment}`,
        isNull(detectedPatterns.dismissedAt)
      ),
      columns: { id: true },
    });

    const existingPatternIds = new Set(existingPatterns.map(p => p.id));

    // 2. Fetch cross-tenant patterns
    const whereConditions = [
      sql`${crossTenantPatterns.environment} = ${environment}`,
      gt(crossTenantPatterns.utilityScore, minUtilityScore),
    ];

    if (category) {
      whereConditions.push(sql`${crossTenantPatterns.category} = ${category}`);
    }

    const globalPatterns = await db.query.crossTenantPatterns.findMany({
      where: and(...whereConditions),
      orderBy: desc(crossTenantPatterns.utilityScore),
      limit: limit * 2, // Fetch extra to account for filtering
    });

    // 3. Map to suggestions and mark already implemented
    const suggestions: PatternSuggestion[] = globalPatterns.map(pattern => ({
      id: pattern.id,
      type: pattern.type as 'sequential' | 'temporal' | 'conditional',
      category: pattern.category,
      suggestedWorkflow: pattern.suggestedWorkflow as any,
      evidence: {
        totalOccurrences: pattern.totalOccurrences,
        uniqueTenants: pattern.uniqueTenants,
        avgConfidence: pattern.avgConfidence,
        successRate: pattern.successRate || 0,
        utilityScore: pattern.utilityScore,
      },
      alreadyImplemented: existingPatternIds.has(pattern.id),
    }));

    // 4. Prioritize new patterns (not already implemented)
    const newSuggestions = suggestions.filter(s => !s.alreadyImplemented);
    const implementedSuggestions = suggestions.filter(s => s.alreadyImplemented);

    // Return new patterns first, then already implemented (for comparison)
    return [...newSuggestions, ...implementedSuggestions].slice(0, limit);
  }

  /**
   * Get top patterns by category across all tenants
   * Useful for discovering trending workflows
   */
  async getTopPatternsByCategory(
    environment: 'sandbox' | 'production' = 'sandbox',
    limit: number = 5
  ): Promise<Map<string, PatternSuggestion[]>> {
    const allPatterns = await db.query.crossTenantPatterns.findMany({
      where: sql`${crossTenantPatterns.environment} = ${environment}`,
      orderBy: desc(crossTenantPatterns.utilityScore),
      limit: 100, // Sample top patterns
    });

    // Group by category
    const byCategory = new Map<string, PatternSuggestion[]>();

    for (const pattern of allPatterns) {
      const category = pattern.category;
      if (!byCategory.has(category)) {
        byCategory.set(category, []);
      }

      const suggestions = byCategory.get(category)!;
      if (suggestions.length < limit) {
        suggestions.push({
          id: pattern.id,
          type: pattern.type as 'sequential' | 'temporal' | 'conditional',
          category: pattern.category,
          suggestedWorkflow: pattern.suggestedWorkflow as any,
          evidence: {
            totalOccurrences: pattern.totalOccurrences,
            uniqueTenants: pattern.uniqueTenants,
            avgConfidence: pattern.avgConfidence,
            successRate: pattern.successRate || 0,
            utilityScore: pattern.utilityScore,
          },
          alreadyImplemented: false, // Not tenant-specific
        });
      }
    }

    return byCategory;
  }

  /**
   * Search patterns by keyword or action type
   */
  async searchPatterns(
    query: string,
    environment: 'sandbox' | 'production' = 'sandbox',
    limit: number = 10
  ): Promise<PatternSuggestion[]> {
    // Simple keyword matching in workflow name/description
    // In production, this could use full-text search or embeddings
    const allPatterns = await db.query.crossTenantPatterns.findMany({
      where: sql`${crossTenantPatterns.environment} = ${environment}`,
      orderBy: desc(crossTenantPatterns.utilityScore),
      limit: 100,
    });

    const queryLower = query.toLowerCase();
    const matchedPatterns = allPatterns.filter(pattern => {
      const workflow = pattern.suggestedWorkflow as any;
      return (
        workflow.name?.toLowerCase().includes(queryLower) ||
        workflow.description?.toLowerCase().includes(queryLower) ||
        pattern.category.toLowerCase().includes(queryLower)
      );
    });

    return matchedPatterns.slice(0, limit).map(pattern => ({
      id: pattern.id,
      type: pattern.type as 'sequential' | 'temporal' | 'conditional',
      category: pattern.category,
      suggestedWorkflow: pattern.suggestedWorkflow as any,
      evidence: {
        totalOccurrences: pattern.totalOccurrences,
        uniqueTenants: pattern.uniqueTenants,
        avgConfidence: pattern.avgConfidence,
        successRate: pattern.successRate || 0,
        utilityScore: pattern.utilityScore,
      },
      alreadyImplemented: false,
    }));
  }

  /**
   * Get pattern adoption stats
   * Shows how many tenants are using each pattern
   */
  async getAdoptionStats(environment: 'sandbox' | 'production' = 'sandbox'): Promise<{
    totalPatterns: number;
    totalAdoptions: number;
    avgTenantsPerPattern: number;
    topPatterns: Array<{
      id: string;
      category: string;
      workflowName: string;
      uniqueTenants: number;
      utilityScore: number;
    }>;
  }> {
    const patterns = await db.query.crossTenantPatterns.findMany({
      where: sql`${crossTenantPatterns.environment} = ${environment}`,
      orderBy: desc(crossTenantPatterns.uniqueTenants),
      limit: 20,
    });

    const totalPatterns = patterns.length;
    const totalAdoptions = patterns.reduce((sum, p) => sum + p.uniqueTenants, 0);
    const avgTenantsPerPattern = totalPatterns > 0 ? totalAdoptions / totalPatterns : 0;

    const topPatterns = patterns.slice(0, 10).map(p => ({
      id: p.id,
      category: p.category,
      workflowName: (p.suggestedWorkflow as any).name,
      uniqueTenants: p.uniqueTenants,
      utilityScore: p.utilityScore,
    }));

    return {
      totalPatterns,
      totalAdoptions,
      avgTenantsPerPattern,
      topPatterns,
    };
  }
}

export const patternSuggestionService = new PatternSuggestionService();
