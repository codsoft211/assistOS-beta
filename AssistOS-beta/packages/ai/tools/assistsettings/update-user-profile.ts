import { ToolBase } from '../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../kernel/types';
import { z } from 'zod';
import { db } from '../../../../apps/api/db';
import { users } from 'shared/schema';
import { eq } from 'drizzle-orm';

/**
 * Updates the authenticated user's profile information
 * @scope user - Only updates current user's data
 */
export class UpdateUserProfileTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'update_user_profile',
    category: 'management' as const,
    description: 'Update the current user\'s profile information (firstName, lastName, avatar)',
    scope: 'user',
    parameters: [
      {
        name: 'firstName',
        type: 'string',
        description: 'User\'s first name',
        required: false,
      },
      {
        name: 'lastName',
        type: 'string',
        description: 'User\'s last name',
        required: false,
      },
      {
        name: 'avatar',
        type: 'string',
        description: 'URL to user\'s avatar image',
        required: false,
      },
    ],
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
      updated: z.record(z.any()).optional(),
    }),
    requiresAuth: true,
    progressSupport: false,
  };

  async executeInternal(
    input: {
      firstName?: string;
      lastName?: string;
      avatar?: string;
    },
    context: ToolExecutionContext
  ) {
    const { userId } = context;

    // CRITICAL FIX 1: Validate userId exists
    if (!userId) {
      throw new Error('User not authenticated');
    }

    const updates: Partial<{
      firstName: string;
      lastName: string;
      avatar: string;
      updatedAt: Date;
    }> = {};

    if (input.firstName !== undefined) updates.firstName = input.firstName;
    if (input.lastName !== undefined) updates.lastName = input.lastName;
    if (input.avatar !== undefined) updates.avatar = input.avatar;

    if (Object.keys(updates).length === 0) {
      return {
        success: false,
        message: 'No fields to update',
      };
    }

    updates.updatedAt = new Date();

    // CRITICAL FIX 2: Verify UPDATE affected a row
    const result = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, userId))
      .returning({ id: users.id });

    // Check if any row was updated
    if (!result || result.length === 0) {
      return {
        success: false,
        message: 'User profile not found or update failed',
      };
    }

    // ✅ Broadcast SSE event for real-time sync
    try {
      const { realtimeEvents } = await import('../../../../apps/api/services/event-emitter');
      const { REALTIME_CHANNELS } = await import('../../../../shared/realtime');
      
      // Fetch updated profile for event payload
      const updatedUser = await db.query.users.findFirst({
        where: eq(users.id, userId),
        columns: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          avatar: true,
        },
      });
      
      if (updatedUser) {
        // ✅ FIX: Use tenantId if available, otherwise use userId as fallback
        const targetId = context.tenantId || userId;
        
        realtimeEvents.emitForTenant(
          REALTIME_CHANNELS.SETTINGS_USER_PROFILE_UPDATED,
          targetId,
          {
            userId,
            profile: updatedUser,
          }
        );
        
        console.log(`[UpdateUserProfileTool] SSE event emitted for ${context.tenantId ? 'tenant' : 'user'}: ${targetId}`);
      }
    } catch (error) {
      console.error('[UpdateUserProfileTool] Failed to broadcast SSE event:', error);
      // Don't fail the tool if SSE broadcasting fails
    }

    return {
      success: true,
      message: 'Profile updated successfully',
      updated: updates,
    };
  }
}
