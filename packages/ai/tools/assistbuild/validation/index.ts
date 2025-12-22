import { TestModuleTool } from './test-module';
import { TestIntegrationTool } from './test-integration';
import { RollbackConfigurationTool } from './rollback-configuration';
import { ExportConfigurationTool } from './export-configuration';
import { toolRegistry } from '../../kernel';

export const validationTools = [
  new TestModuleTool(),
  new TestIntegrationTool(),
  new RollbackConfigurationTool(),
  new ExportConfigurationTool()
];

for (const tool of validationTools) {
  toolRegistry.register(tool);
}

export * from './test-module';
export * from './test-integration';
export * from './rollback-configuration';
export * from './export-configuration';
