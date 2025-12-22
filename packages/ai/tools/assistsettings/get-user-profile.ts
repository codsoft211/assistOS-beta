import { ToolBase } from '../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../kernel/types';
import { z } from 'zod';
import { db } from '../../../../apps/api/db';
import { users } from 'shared/schema';
import { eq } from 'drizzle-orm';

/**
 * Retrieves the authenticated user's profile information
 * @scope user - Only accesses current user's data
 */
export class GetUserProfileTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'get_user_profile',
    category: 'management' as const,
    description: 'Get the current user\'s profile information including name, email, and avatar',
    scope: 'user',
    parameters: [],
    outputSchema: z.object({
      success: z.boolean(),
      profile: z.object({
        id: z.string(),
        email: z.string(),
        firstName: z.string(),
        lastName: z.string(),
        avatar: z.string().nullable(),
        isPlatformAdmin: z.boolean(),
      }),
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
        firstName: true,
        lastName: true,
        avatar: true,
        isPlatformAdmin: true,
      },
    });

    if (!user) {
      throw new Error('User profile not found');
    }

    return {
      success: true,
      profile: user,
    };
  }
}
