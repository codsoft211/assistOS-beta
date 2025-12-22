import { ExtractQuoteRequirementsTool } from './extract-requirements';
import { CreateCostTemplateTool } from './create-cost-template';
import { ConfigureTemplateFromTextTool } from './configure-template-from-text';
import { toolRegistry } from '../../kernel';

export const quoteTools = [
  new ExtractQuoteRequirementsTool(),
  new CreateCostTemplateTool(),
  new ConfigureTemplateFromTextTool()
];

for (const tool of quoteTools) {
  toolRegistry.register(tool);
}

export * from './extract-requirements';
export * from './create-cost-template';
export * from './configure-template-from-text';
