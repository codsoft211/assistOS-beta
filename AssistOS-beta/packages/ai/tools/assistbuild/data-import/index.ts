import { ToolDefinitionAdapter } from '../../kernel/adapters';
import { toolRegistry } from '../../kernel/registry';

// Import tools
import { importLeadsCSV } from './import-leads-csv';

// Wrap and register tools
const dataImportTools = [
  new ToolDefinitionAdapter(importLeadsCSV),
];

for (const tool of dataImportTools) {
  toolRegistry.register(tool);
}

console.log(`[AssistBuild Data Import] Registered ${dataImportTools.length} tools`);

// Export for direct usage
export { importLeadsCSV } from './import-leads-csv';
