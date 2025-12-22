import { GetTenantStateTool } from './get-tenant-state';
import { ListModuleCatalogTool } from './list-module-catalog';
import { SearchCatalogTool } from './search-catalog';
import { GetModuleInfoTool } from './get-module-info';
import { GetConnectorsTool } from './get-connectors';
import { GetIntegrationsCatalogTool } from './get-integrations-catalog';
import { GetAgentsTool } from './get-agents';
import { GetWorkflowsTool } from './get-workflows';
import { GetAuditTrailTool } from './get-audit-trail';
import { GetPlatformResourcesTool } from './get-platform-resources';
// Custom table discovery tools
import { ListCustomTablesTool } from './list-custom-tables';
import { GetCustomTableTool } from './get-custom-table';
// Organization structure discovery
import { GetOrganizationStructureTool } from './get-organization-structure';
import { toolRegistry } from '../../kernel';

// Instantiate and register all discovery tools
export const discoveryTools = [
  new GetTenantStateTool(),
  // new ListModuleCatalogTool(), // NEW: Replaces get_modules_active + get_modules_catalog with richer version
  new SearchCatalogTool(),
  new GetModuleInfoTool(),
  new GetConnectorsTool(),
  new GetIntegrationsCatalogTool(),
  new GetAgentsTool(),
  new GetWorkflowsTool(),
  new GetAuditTrailTool(),
  new GetPlatformResourcesTool(),
  // Custom table discovery tools
  new ListCustomTablesTool(),
  new GetCustomTableTool(),
  // Organization structure discovery
  new GetOrganizationStructureTool(),
];

// Auto-register on import
for (const tool of discoveryTools) {
  toolRegistry.register(tool);
}

export {
  GetTenantStateTool,
  // ListModuleCatalogTool,
  SearchCatalogTool,
  GetModuleInfoTool,
  GetConnectorsTool,
  GetIntegrationsCatalogTool,
  GetAgentsTool,
  GetWorkflowsTool,
  GetAuditTrailTool,
  GetPlatformResourcesTool,
  // Custom table discovery tools
  ListCustomTablesTool,
  GetCustomTableTool,
  // Organization structure discovery
  GetOrganizationStructureTool,
};
