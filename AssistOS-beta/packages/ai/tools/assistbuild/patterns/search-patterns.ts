import { ToolBase, type ToolManifest, type ToolExecutionContext } from '../../kernel';
import { patternSuggestionService } from '../../../services/pattern-suggestion.service';

interface SearchPatternsInput {
  query: string;
  limit?: number;
}

export class SearchPatternsTool extends ToolBase<SearchPatternsInput, any> {
  manifest: ToolManifest = {
    name: 'search_patterns',
    category: 'discovery',
    description: 'Searches patterns by keyword or action type. Useful when user describes a specific workflow (e.g.: "purchase approval", "email sending"). Returns cross-tenant patterns that match the search.',
    parameters: [
      {
        name: 'query',
        description: 'Keyword or description of desired workflow (e.g.: "invoice processing", "approval workflow")',
        type: 'string',
        required: true
      },
      {
        name: 'limit',
        description: 'Número máximo de resultados (default 10)',
        type: 'number',
        required: false
      }
    ],
    requiresAuth: true,
    progressSupport: false
  };

  protected async executeInternal(
    input: SearchPatternsInput,
    context: ToolExecutionContext
  ): Promise<any> {
    const results = await patternSuggestionService.searchPatterns(
      input.query,
      context.environment as 'sandbox' | 'production',
      input.limit
    );

    return {
      query: input.query,
      totalResults: results.length,
      patterns: results.map(p => ({
        id: p.id,
        type: p.type,
        category: p.category,
        workflow: p.suggestedWorkflow,
        evidence: {
          adoptedBy: `${p.evidence.uniqueTenants} tenants`,
          totalUses: p.evidence.totalOccurrences,
          confidence: `${(p.evidence.avgConfidence * 100).toFixed(0)}%`,
          utilityScore: p.evidence.utilityScore.toFixed(2)
        }
      }))
    };
  }
}
