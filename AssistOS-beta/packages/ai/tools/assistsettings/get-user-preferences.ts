import { ToolBase } from '../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../kernel/types';
import { z } from 'zod';
import { db } from '../../../../apps/api/db';
import { users } from 'shared/schema';
import { eq } from 'drizzle-orm';

/**
 * Retrieves the authenticated user's preferences
 * @scope user - Only accesses current user's preferences
 */
export class GetUserPreferencesTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'get_user_preferences',
    category: 'management' as const,
    description: 'Get the current user\'s preferences including theme, language, and notification settings',
    scope: 'user',
    parameters: [],
    outputSchema: z.object({
      success: z.boolean(),
      preferences: z.record(z.any()),
    }),
    requiresAuth: true,
    progressSupport: false,
  };

  async executeInternal(
    input: {},
    context: ToolExecutionContext
  ) {
    const user = await db.query.users.findFirst({
      where: eq(users.id, context.userId),
      columns: {
        id: true,
        email: true,
        preferences: true,
      },
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Return actual preferences from DB or default values
    const preferences = user.preferences || {
      theme: 'system',
      language: 'pt',
      emailNotifications: true,
      desktopNotifications: false,
      sidebarCollapsed: false,
      hiddenModules: [],
      favoriteModules: [],
    };

    return {
      success: true,
      preferences,
    };
  }
}
