import { ToolBase, type ToolManifest, type ToolExecutionContext } from '../../kernel';
import { orgStructureService } from '../services/org-structure.service';
import { z } from 'zod';

const inputSchema = z.object({
  action: z.enum(['add', 'remove', 'list']),
  teamId: z.string(),
  userIds: z.array(z.string()).optional(),
  role: z.string().optional().default('member'),
});

export class ManageTeamMembersTool extends ToolBase<any, any> {
  manifest: ToolManifest = {
    name: 'manage_team_members',
    category: 'configuration',
    description: 'Add, remove, or list members of a team',
    parameters: [
      { 
        name: 'action', 
        type: 'string', 
        description: 'Action to perform: "add", "remove", or "list"', 
        required: true,
        enum: ['add', 'remove', 'list']
      },
      { 
        name: 'teamId', 
        type: 'string', 
        description: 'Team ID to manage members for', 
        required: true 
      },
      { 
        name: 'userIds', 
        type: 'array', 
        description: 'Array of user IDs to add or remove (required for add/remove)',
        required: false,
        items: { type: 'string' }
      },
      { 
        name: 'role', 
        type: 'string', 
        description: 'Role for new members (default: "member")', 
        required: false 
      },
    ],
    scope: 'tenant',
    requiresAuth: true,
    progressSupport: false
  };

  protected async executeInternal(input: any, context: ToolExecutionContext): Promise<any> {
    try {
      const validated = inputSchema.parse(input);

      // First check if team exists
      const team = await orgStructureService.getTeam(context.tenantId, validated.teamId);
      if (!team) {
        return { success: false, error: 'Team not found' };
      }

      switch (validated.action) {
        case 'list': {
          return {
            success: true,
            team: {
              id: team.id,
              name: team.name,
              departmentName: team.departmentName,
            },
            members: team.members,
            memberCount: team.members.length,
            message: `Team "${team.name}" has ${team.members.length} member(s)`
          };
        }

        case 'add': {
          if (!validated.userIds || validated.userIds.length === 0) {
            return { success: false, error: 'User IDs are required for adding members' };
          }

          const updatedTeam = await orgStructureService.addTeamMembers(
            context.tenantId,
            context.userId,
            validated.teamId,
            validated.userIds,
            validated.role
          );

          // Calculate how many were actually added (some might have been duplicates)
          const previousCount = team.members.length;
          const newCount = updatedTeam.members.length;
          const addedCount = newCount - previousCount;

          return {
            success: true,
            team: updatedTeam,
            action: 'members_added',
            requestedCount: validated.userIds.length,
            actuallyAddedCount: addedCount,
            skippedCount: validated.userIds.length - addedCount,
            newMemberCount: newCount,
            message: addedCount > 0 
              ? `Added ${addedCount} member(s) to team "${updatedTeam.name}". Team now has ${newCount} member(s).`
              : `No new members added (${validated.userIds.length} were already members)`
          };
        }

        case 'remove': {
          if (!validated.userIds || validated.userIds.length === 0) {
            return { success: false, error: 'User IDs are required for removing members' };
          }

          const updatedTeam = await orgStructureService.removeTeamMembers(
            context.tenantId,
            context.userId,
            validated.teamId,
            validated.userIds
          );

          const previousCount = team.members.length;
          const newCount = updatedTeam.members.length;
          const removedCount = previousCount - newCount;

          return {
            success: true,
            team: updatedTeam,
            action: 'members_removed',
            requestedCount: validated.userIds.length,
            actuallyRemovedCount: removedCount,
            remainingMemberCount: newCount,
            message: removedCount > 0
              ? `Removed ${removedCount} member(s) from team "${updatedTeam.name}". Team now has ${newCount} member(s).`
              : `No members removed (specified users were not team members)`
          };
        }

        default:
          return { success: false, error: `Unknown action: ${validated.action}` };
      }
    } catch (error) {
      console.error('[ManageTeamMembersTool] Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to manage team members'
      };
    }
  }
}

