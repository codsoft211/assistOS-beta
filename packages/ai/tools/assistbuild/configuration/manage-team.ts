import { ToolBase, type ToolManifest, type ToolExecutionContext } from '../../kernel';
import { orgStructureService } from '../services/org-structure.service';
import { z } from 'zod';

const inputSchema = z.object({
  action: z.enum(['create', 'update', 'delete']),
  teamId: z.string().optional(),
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullish(), // Allow null to clear
  departmentId: z.string().optional(),
  teamLeadId: z.string().nullish(), // Allow null to remove team lead
  memberUserIds: z.array(z.string()).optional(),
});

export class ManageTeamTool extends ToolBase<any, any> {
  manifest: ToolManifest = {
    name: 'manage_team',
    category: 'configuration',
    description: 'Create, update, or delete a team in the organization structure',
    parameters: [
      { 
        name: 'action', 
        type: 'string', 
        description: 'Action to perform: "create", "update", or "delete"', 
        required: true,
        enum: ['create', 'update', 'delete']
      },
      { 
        name: 'teamId', 
        type: 'string', 
        description: 'Team ID (required for update/delete)', 
        required: false 
      },
      { 
        name: 'name', 
        type: 'string', 
        description: 'Team name (required for create)', 
        required: false 
      },
      { 
        name: 'description', 
        type: 'string', 
        description: 'Team description', 
        required: false 
      },
      { 
        name: 'departmentId', 
        type: 'string', 
        description: 'Department ID that the team belongs to (required for create)', 
        required: false 
      },
      { 
        name: 'teamLeadId', 
        type: 'string', 
        description: 'User ID of the team lead (null to clear)', 
        required: false 
      },
      { 
        name: 'memberUserIds', 
        type: 'array', 
        description: 'Array of user IDs to add as initial team members (only for create)',
        required: false,
        items: { type: 'string' }
      },
    ],
    scope: 'tenant',
    requiresAuth: true,
    progressSupport: false
  };

  protected async executeInternal(input: any, context: ToolExecutionContext): Promise<any> {
    try {
      const validated = inputSchema.parse(input);

      switch (validated.action) {
        case 'create': {
          if (!validated.name) {
            return { success: false, error: 'Name is required for creating a team' };
          }
          if (!validated.departmentId) {
            return { success: false, error: 'Department ID is required for creating a team' };
          }

          const team = await orgStructureService.createTeam(
            context.tenantId,
            context.userId,
            {
              name: validated.name,
              description: validated.description || null,
              departmentId: validated.departmentId,
              teamLeadId: validated.teamLeadId || null,
              memberUserIds: validated.memberUserIds,
            }
          );

          return {
            success: true,
            team,
            action: 'created',
            message: `Successfully created team "${team.name}" in department "${team.departmentName || 'Unknown'}" with ${team.members.length} member(s)`
          };
        }

        case 'update': {
          if (!validated.teamId) {
            return { success: false, error: 'Team ID is required for update' };
          }

          const updates: any = {};
          if (validated.name !== undefined) updates.name = validated.name;
          if (validated.description !== undefined) updates.description = validated.description;
          if (validated.departmentId !== undefined) updates.departmentId = validated.departmentId;
          if (validated.teamLeadId !== undefined) updates.teamLeadId = validated.teamLeadId;

          if (Object.keys(updates).length === 0) {
            return { success: false, error: 'No updates provided' };
          }

          const team = await orgStructureService.updateTeam(
            context.tenantId,
            context.userId,
            validated.teamId,
            updates
          );

          return {
            success: true,
            team,
            action: 'updated',
            changes: Object.keys(updates),
            message: `Successfully updated team "${team.name}". Changed: ${Object.keys(updates).join(', ')}`
          };
        }

        case 'delete': {
          if (!validated.teamId) {
            return { success: false, error: 'Team ID is required for delete' };
          }

          // Get team info before deletion
          const existing = await orgStructureService.getTeam(context.tenantId, validated.teamId);
          if (!existing) {
            return { success: false, error: 'Team not found' };
          }

          await orgStructureService.deleteTeam(
            context.tenantId,
            context.userId,
            validated.teamId
          );

          return {
            success: true,
            action: 'deleted',
            deletedTeamId: validated.teamId,
            deletedTeamName: existing.name,
            membersRemoved: existing.members.length,
            message: `Successfully deleted team "${existing.name}" and removed ${existing.members.length} member(s)`
          };
        }

        default:
          return { success: false, error: `Unknown action: ${validated.action}` };
      }
    } catch (error) {
      console.error('[ManageTeamTool] Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to manage team'
      };
    }
  }
}

