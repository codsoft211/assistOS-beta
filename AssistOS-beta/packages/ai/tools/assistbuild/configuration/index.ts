import { BootstrapTenantTool } from './bootstrap-tenant';
import { ConfigureCompanyInfoTool } from './configure-company-info';
import { SetupOrganizationStructureTool } from './setup-organization-structure';
import { ManageDepartmentTool } from './manage-department';
import { ManageTeamTool } from './manage-team';
import { ManageTeamMembersTool } from './manage-team-members';
import { ActivateModuleTool } from './activate-module';
import { DeactivateModuleTool } from './deactivate-module';
import { ConfigureModuleSettingsTool } from './configure-module-settings';
import { SetupConnectorTool } from './setup-connector';
import { ValidateTenantConfigurationTool } from './validate-tenant-configuration';
import { CreateAutomationTool } from './create-automation';
import { UpdateAutomationTool } from './update-automation';
import { CreateWorkflowTool } from './create-workflow';
import { SetupNotificationRulesTool } from './setup-notification-rules';
import { ConfigureCustomFieldTool } from './configure-custom-field';
import { AnalyzeConfigureImportEntitiesTool } from './analyze-configure-import-entities';
// Schema management tools
import { PreviewModuleTablesTool } from './preview-module-tables';
import { CreateCustomTableTool } from './create-custom-table';
import { ModifyTableStructureTool } from './modify-table-structure';
import { DeleteCustomTableTool } from './delete-custom-table';
import { RestoreCustomTableTool } from './restore-custom-table';
// File parsing tool for attachments
import { ParseAttachedFileTool } from './parse-attached-file';
// 🌐 Web enrichment tool for company info
import { EnrichCompanyFromWebTool } from './enrich-company-from-web';
import { toolRegistry } from '../../kernel';

export const configurationTools = [
  new BootstrapTenantTool(),
  new ConfigureCompanyInfoTool(),
  new SetupOrganizationStructureTool(),
  new ManageDepartmentTool(),
  new ManageTeamTool(),
  new ManageTeamMembersTool(),
  new ActivateModuleTool(),
  new DeactivateModuleTool(),
  new ConfigureModuleSettingsTool(),
  new SetupConnectorTool(),
  new ValidateTenantConfigurationTool(),
  new CreateAutomationTool(),
  new UpdateAutomationTool(),
  new CreateWorkflowTool(),
  new SetupNotificationRulesTool(),
  new ConfigureCustomFieldTool(),
  new AnalyzeConfigureImportEntitiesTool(),
  // Schema management tools
  new PreviewModuleTablesTool(),
  new CreateCustomTableTool(),
  new ModifyTableStructureTool(),
  new DeleteCustomTableTool(),
  new RestoreCustomTableTool(),
  // File parsing tool for attachments
  new ParseAttachedFileTool(),
  // 🌐 Web enrichment tool for company info
  new EnrichCompanyFromWebTool(),
];

for (const tool of configurationTools) {
  toolRegistry.register(tool);
}

export * from './bootstrap-tenant';
export * from './configure-company-info';
export * from './setup-organization-structure';
export * from './manage-department';
export * from './manage-team';
export * from './manage-team-members';
export * from './activate-module';
export * from './deactivate-module';
export * from './configure-module-settings';
export * from './setup-connector';
export * from './validate-tenant-configuration';
export * from './create-automation';
export * from './update-automation';
export * from './create-workflow';
export * from './setup-notification-rules';
export * from './configure-custom-field';
export * from './analyze-configure-import-entities';
export * from './preview-module-tables';
export * from './create-custom-table';
export * from './modify-table-structure';
export * from './delete-custom-table';
export * from './restore-custom-table';
export * from './parse-attached-file';
export * from './enrich-company-from-web';
