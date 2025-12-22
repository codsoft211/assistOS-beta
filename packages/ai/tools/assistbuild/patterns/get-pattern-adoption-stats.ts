import { ToolBase, type ToolManifest, type ToolExecutionContext } from '../../kernel';
import { patternSuggestionService } from '../../../services/pattern-suggestion.service';

export class GetPatternAdoptionStatsTool extends ToolBase<{}, any> {
  manifest: ToolManifest = {
    name: 'get_pattern_adoption_stats',
    category: 'discovery',
    description: 'Gets cross-tenant pattern adoption statistics. Shows which workflows are most popular, how many tenants use each pattern, automation trends. Useful for insights on best practices.',
    parameters: [],
    requiresAuth: true,
    progressSupport: false
  };

  protected async executeInternal(
    input: {},
    context: ToolExecutionContext
  ): Promise<any> {
    const stats = await patternSuggestionService.getAdoptionStats(
      context.environment as 'sandbox' | 'production'
    );

    return {
      overview: {
        totalPatterns: stats.totalPatterns,
        totalAdoptions: stats.totalAdoptions,
        avgTenantsPerPattern: stats.avgTenantsPerPattern.toFixed(1)
      },
      topPatterns: stats.topPatterns.map((p, idx) => ({
        rank: idx + 1,
        category: p.category,
        workflowName: p.workflowName,
        adoptedBy: `${p.uniqueTenants} tenants`,
        utilityScore: p.utilityScore.toFixed(2)
      })),
      insights: this.generateInsights(stats)
    };
  }

  private generateInsights(stats: any): string[] {
    const insights: string[] = [];

    if (stats.avgTenantsPerPattern >= 5) {
      insights.push('✅ High standardization level - workflows are widely adopted');
    } else if (stats.avgTenantsPerPattern >= 2) {
      insights.push('📊 Moderate standardization - cross-tenant learning opportunities');
    } else {
      insights.push('💡 Low standardization - tenants use highly customized workflows');
    }

    if (stats.topPatterns.length > 0 && stats.topPatterns[0].uniqueTenants >= 10) {
      insights.push(`🏆 Most popular pattern: "${stats.topPatterns[0].workflowName}" used by ${stats.topPatterns[0].uniqueTenants} tenants`);
    }

    return insights;
  }
}
