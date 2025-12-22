import { ToolBase, type ToolManifest, type ToolExecutionContext } from '../../kernel';
import { patternSuggestionService } from '../../../services/pattern-suggestion.service';

interface GetPatternSuggestionsInput {
  category?: string;
  minUtilityScore?: number;
  limit?: number;
}

export class GetPatternSuggestionsTool extends ToolBase<GetPatternSuggestionsInput, any> {
  manifest: ToolManifest = {
    name: 'get_pattern_suggestions',
    category: 'discovery',
    description: 'Gets suggestions for workflow patterns discovered cross-tenant. Patterns are common workflows used by multiple tenants that can be applied to increase productivity. Each suggestion includes evidence (how many tenants use it, success rate) and suggested workflow.',
    parameters: [
      {
        name: 'category',
        description: 'Optional category to filter patterns (e.g.: "procurement", "finance", "sales")',
        type: 'string',
        required: false
      },
      {
        name: 'minUtilityScore',
        description: 'Minimum utility score (0-1, default 0.5). Patterns with higher scores are more reliable.',
        type: 'number',
        required: false
      },
      {
        name: 'limit',
        description: 'Maximum number of suggestions (default 10)',
        type: 'number',
        required: false
      }
    ],
    requiresAuth: true,
    progressSupport: false
  };

  protected async executeInternal(
    input: GetPatternSuggestionsInput,
    context: ToolExecutionContext
  ): Promise<any> {
    const suggestions = await patternSuggestionService.getSuggestionsForTenant(
      context.tenantId,
      context.environment as 'sandbox' | 'production',
      {
        category: input.category,
        minUtilityScore: input.minUtilityScore,
        limit: input.limit
      }
    );

    return {
      totalSuggestions: suggestions.length,
      newPatterns: suggestions.filter(s => !s.alreadyImplemented).length,
      alreadyUsed: suggestions.filter(s => s.alreadyImplemented).length,
      suggestions: suggestions.map(s => ({
        id: s.id,
        type: s.type,
        category: s.category,
        workflow: s.suggestedWorkflow,
        evidence: {
          adoptedBy: `${s.evidence.uniqueTenants} tenants`,
          totalUses: s.evidence.totalOccurrences,
          confidence: `${(s.evidence.avgConfidence * 100).toFixed(0)}%`,
          successRate: `${(s.evidence.successRate * 100).toFixed(0)}%`,
          utilityScore: s.evidence.utilityScore.toFixed(2)
        },
        status: s.alreadyImplemented ? 'already_used' : 'suggested'
      }))
    };
  }
}
