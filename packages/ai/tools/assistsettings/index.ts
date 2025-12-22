import { GetUserProfileTool } from './get-user-profile';
import { UpdateUserProfileTool } from './update-user-profile';
import { GetUserPreferencesTool } from './get-user-preferences';
import { UpdateUserPreferencesTool } from './update-user-preferences';
import { toolRegistry } from '../kernel';

// User Profile Management Tools (scope='user')
export const assistSettingsTools = [
  new GetUserProfileTool(),
  new UpdateUserProfileTool(),
  new GetUserPreferencesTool(),
  new UpdateUserPreferencesTool(),
];

// Register all AssistSettings tools with the global registry
for (const tool of assistSettingsTools) {
  toolRegistry.register(tool);
}

// Export individual tool classes for direct use if needed
export {
  GetUserProfileTool,
  UpdateUserProfileTool,
  GetUserPreferencesTool,
  UpdateUserPreferencesTool,
};
