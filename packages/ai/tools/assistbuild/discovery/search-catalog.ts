import { ToolBase, type ToolManifest, type ToolExecutionContext } from '../../kernel';
import { db } from '../../../../../apps/api/db';
import { moduleTemplates } from '../../../../../shared/schema';
import { eq, or, ilike, and } from 'drizzle-orm';

export class SearchCatalogTool extends ToolBase<{ query: string }, any> {
  manifest: ToolManifest = {
    name: 'search_catalog',
    category: 'discovery',
    description: 'Searches modules in catalog by name, description or category',
    parameters: [
      {
        name: 'query',
        type: 'string',
        description: 'Search term',
        required: true
      }
    ],
    requiresAuth: true,
    progressSupport: false
  };

  protected async executeInternal(
    input: { query: string },
    context: ToolExecutionContext
  ): Promise<any> {
    const results = await db
      .select()
      .from(moduleTemplates)
      .where(
        and(
          eq(moduleTemplates.isActive, true),
          or(
            ilike(moduleTemplates.name, `%${input.query}%`),
            ilike(moduleTemplates.description, `%${input.query}%`),
            ilike(moduleTemplates.category, `%${input.query}%`)
          )
        )
      );

    return {
      results,
      count: results.length,
      query: input.query
    };
  }
}
