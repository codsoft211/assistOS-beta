import { ToolBase, type ToolManifest, type ToolExecutionContext } from '../../kernel';
import { db } from '../../../../../apps/api/db';
import { moduleTemplates } from '../../../../../shared/schema';
import { eq } from 'drizzle-orm';

export class GetModulesCatalogTool extends ToolBase<{}, any> {
  manifest: ToolManifest = {
    name: 'get_modules_catalog',
    category: 'discovery',
    description: 'Lists all modules available in the platform catalog',
    parameters: [],
    requiresAuth: true,
    progressSupport: false
  };

  protected async executeInternal(input: {}, context: ToolExecutionContext): Promise<any> {
    const catalog = await db
      .select()
      .from(moduleTemplates)
      .where(eq(moduleTemplates.isActive, true));

    const categorySet = new Set<string>();
    catalog.forEach(m => {
      if (m.category) categorySet.add(m.category);
    });

    return {
      modules: catalog,
      count: catalog.length,
      categories: Array.from(categorySet)
    };
  }
}
