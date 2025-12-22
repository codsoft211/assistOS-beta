import { ToolBase } from "../kernel/base";
import { ToolManifest, ToolExecutionContext } from "../kernel/types";
import { z } from "zod";
import { db } from "../../../../apps/api/db";
import { users } from "shared/schema";
import { eq } from "drizzle-orm";

// Zod schema with strict enums for validation
const UpdateUserPreferencesArgsSchema = z.object({
  theme: z.enum(["light", "dark", "system"]).optional(),
  language: z.enum(["pt-PT", "en-US"]).optional(),
  emailNotifications: z.boolean().optional(),
  desktopNotifications: z.boolean().optional(),
  sidebarCollapsed: z.boolean().optional(),
});

type UpdateUserPreferencesArgs = z.infer<
  typeof UpdateUserPreferencesArgsSchema
>;

/**
 * Updates the authenticated user's preferences
 * @scope user - Only updates current user's preferences
 */
export class UpdateUserPreferencesTool extends ToolBase {
  manifest: ToolManifest = {
    name: "update_user_preferences",
    category: "management" as const,
    description:
      "Update the current user's preferences (theme, language, notifications)",
    scope: "user",
    parameters: [
      {
        name: "theme",
        type: "string",
        description: "UI theme preference: light, dark, or system",
        required: false,
      },
      {
        name: "language",
        type: "string",
        description: "Language preference: pt-PT or en-US",
        required: false,
      },
      {
        name: "emailNotifications",
        type: "boolean",
        description: "Enable email notifications",
        required: false,
      },
      {
        name: "desktopNotifications",
        type: "boolean",
        description: "Enable desktop notifications",
        required: false,
      },
      {
        name: "sidebarCollapsed",
        type: "boolean",
        description: "Collapse sidebar by default",
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
    input: UpdateUserPreferencesArgs,
    context: ToolExecutionContext,
  ) {
    const { userId } = context;

    // Validate userId exists
    if (!userId) {
      throw new Error("User not authenticated");
    }

    // ADDED: Zod validation to reject invalid enum values
    const validationResult = UpdateUserPreferencesArgsSchema.safeParse(input);
    if (!validationResult.success) {
      return {
        success: false,
        message: `Invalid preferences: ${validationResult.error.message}`,
      };
    }

    // Get current preferences
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: {
        preferences: true,
      },
    });

    if (!user) {
      return {
        success: false,
        message: "User not found",
      };
    }

    // Merge with existing preferences
    const currentPreferences = user.preferences || {};
    const updates: Record<string, any> = {};

    if (input.theme !== undefined) updates.theme = input.theme;
    if (input.language !== undefined) updates.language = input.language;
    if (input.emailNotifications !== undefined)
      updates.emailNotifications = input.emailNotifications;
    if (input.desktopNotifications !== undefined)
      updates.desktopNotifications = input.desktopNotifications;
    if (input.sidebarCollapsed !== undefined)
      updates.sidebarCollapsed = input.sidebarCollapsed;

    if (Object.keys(updates).length === 0) {
      return {
        success: false,
        message: "No preferences to update",
      };
    }

    const newPreferences = {
      ...currentPreferences,
      ...updates,
    };

    const result = await db
      .update(users)
      .set({
        preferences: newPreferences,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning({ id: users.id });

    if (!result || result.length === 0) {
      return {
        success: false,
        message: "User profile not found or preferences update failed",
      };
    }

    // ✅ Broadcast SSE event for real-time sync
    try {
      const { realtimeEvents } = await import(
        "../../../../apps/api/services/event-emitter"
      );
      const { REALTIME_CHANNELS } = await import("../../../../shared/realtime");

      // ✅ FIX: Use tenantId if available, otherwise use userId as fallback
      const targetId = context.tenantId || userId;

      realtimeEvents.emitForTenant(
        REALTIME_CHANNELS.SETTINGS_USER_PREFERENCES_UPDATED,
        targetId,
        {
          userId,
          preferences: newPreferences,
        },
      );

      console.log(
        `[UpdateUserPreferencesTool] SSE event emitted for ${context.tenantId ? "tenant" : "user"}: ${targetId}`,
      );
    } catch (error) {
      console.error(
        "[UpdateUserPreferencesTool] Failed to broadcast SSE event:",
        error,
      );
      // Don't fail the tool if SSE broadcasting fails
    }

    return {
      success: true,
      message: "Preferences updated successfully",
      updated: updates,
    };
  }
}
