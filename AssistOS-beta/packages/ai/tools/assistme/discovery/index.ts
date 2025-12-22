import { GetActiveModulesTool } from './get-active-modules';
import { UniversalSearchTool } from './universal-search';
import { GetCompanyInfoTool } from './get-company-info';
import { GetDashboardSummaryTool } from './get-dashboard-summary';
import { toolRegistry } from '../../kernel';

// Instantiate and register all discovery tools
export const discoveryTools = [
  new GetActiveModulesTool(),
  new UniversalSearchTool(),
  new GetCompanyInfoTool(),
  new GetDashboardSummaryTool(),
];

// Auto-register on import
for (const tool of discoveryTools) {
  toolRegistry.register(tool);
}

export {
  GetActiveModulesTool,
  UniversalSearchTool,
  GetCompanyInfoTool,
  GetDashboardSummaryTool,
};
