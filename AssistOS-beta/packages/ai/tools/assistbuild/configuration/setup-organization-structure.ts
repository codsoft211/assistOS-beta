import { ToolBase, type ToolManifest, type ToolExecutionContext } from '../../kernel';
import { orgStructureService } from '../services/org-structure.service';
import { z } from 'zod';

const departmentInputSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  description: z.string().optional(),
  parentId: z.string().optional(),
  managerId: z.string().optional(),
});

const teamInputSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  description: z.string().optional(),
  departmentId: z.string().optional(),
  teamLeadId: z.string().optional(),
  memberUserIds: z.array(z.string()).optional(),
});

const inputSchema = z.object({
  departments: z.array(departmentInputSchema).optional(),
  teams: z.array(teamInputSchema).optional(),
});

/**
 * Batch setup tool for creating/updating multiple departments and teams at once.
 * Use manage_department, manage_team, and manage_team_members for individual operations.
 */
export class SetupOrganizationStructureTool extends ToolBase<any, any> {
  manifest: ToolManifest = {
    name: 'setup_organization_structure',
    category: 'configuration',
    description: 'Batch create or update multiple departments and teams at once. For individual CRUD operations, use manage_department, manage_team, or manage_team_members tools.',
    parameters: [
      { 
        name: 'departments', 
        type: 'array', 
        description: 'List of departments to create/update: [{ id?, name, description?, parentId?, managerId? }]', 
        required: false,
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Department ID (include for update, omit for create)' },
            name: { type: 'string', description: 'Department name' },
            description: { type: 'string', description: 'Department description' },
            parentId: { type: 'string', description: 'Parent department ID for hierarchy' },
            managerId: { type: 'string', description: 'Manager user ID' }
          },
          required: ['name']
        }
      },
      { 
        name: 'teams', 
        type: 'array', 
        description: 'List of teams to create/update: [{ id?, name, description?, departmentId?, teamLeadId?, memberUserIds? }]', 
        required: false,
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Team ID (include for update, omit for create)' },
            name: { type: 'string', description: 'Team name' },
            description: { type: 'string', description: 'Team description' },
            departmentId: { type: 'string', description: 'Department ID (required for new teams)' },
            teamLeadId: { type: 'string', description: 'Team lead user ID' },
            memberUserIds: { type: 'array', items: { type: 'string' }, description: 'Initial member user IDs' }
          },
          required: ['name']
        }
      }
    ],
    scope: 'tenant',
    requiresAuth: true,
    progressSupport: false
  };

  protected async executeInternal(input: any, context: ToolExecutionContext): Promise<any> {
    try {
      const validated = inputSchema.parse(input);
      const changes: string[] = [];
      const errors: string[] = [];
      const results: any = {
        departments: [],
        teams: [],
      };

      // Process departments
      if (validated.departments && validated.departments.length > 0) {
        for (const deptInput of validated.departments) {
          try {
            let dept;
            if (deptInput.id) {
              // Update existing
              dept = await orgStructureService.updateDepartment(
                context.tenantId,
                context.userId,
                deptInput.id,
                {
                  name: deptInput.name,
                  description: deptInput.description || null,
                  parentDepartmentId: deptInput.parentId || null,
                  managerId: deptInput.managerId || null,
                }
              );
              changes.push(`Updated department "${dept.name}"`);
            } else {
              // Create new
              dept = await orgStructureService.createDepartment(
                context.tenantId,
                context.userId,
                {
                  name: deptInput.name,
                  description: deptInput.description || null,
                  parentDepartmentId: deptInput.parentId || null,
                  managerId: deptInput.managerId || null,
                }
              );
              changes.push(`Created department "${dept.name}"`);
            }
            results.departments.push(dept);
          } catch (error) {
            const errorMsg = `Failed to process department "${deptInput.name}": ${error instanceof Error ? error.message : 'Unknown error'}`;
            console.error(errorMsg);
            errors.push(errorMsg);
          }
        }
      }

      // Process teams
      if (validated.teams && validated.teams.length > 0) {
        for (const teamInput of validated.teams) {
          try {
            let team;
            if (teamInput.id) {
              // Update existing
              team = await orgStructureService.updateTeam(
                context.tenantId,
                context.userId,
                teamInput.id,
                {
                  name: teamInput.name,
                  description: teamInput.description || null,
                  departmentId: teamInput.departmentId,
                  teamLeadId: teamInput.teamLeadId || null,
                }
              );

              // Handle member updates if provided
              if (teamInput.memberUserIds && teamInput.memberUserIds.length > 0) {
                team = await orgStructureService.addTeamMembers(
                  context.tenantId,
                  context.userId,
                  team.id,
                  teamInput.memberUserIds
                );
              }
              
              changes.push(`Updated team "${team.name}" with ${team.members?.length || 0} member(s)`);
            } else {
              // Create new - departmentId is required
              if (!teamInput.departmentId) {
                errors.push(`Failed to create team "${teamInput.name}": departmentId is required`);
                continue;
              }

              team = await orgStructureService.createTeam(
                context.tenantId,
                context.userId,
                {
                  name: teamInput.name,
                  description: teamInput.description || null,
                  departmentId: teamInput.departmentId,
                  teamLeadId: teamInput.teamLeadId || null,
                  memberUserIds: teamInput.memberUserIds,
                }
              );
              changes.push(`Created team "${team.name}" with ${team.members?.length || 0} member(s)`);
            }
            results.teams.push(team);
          } catch (error) {
            const errorMsg = `Failed to process team "${teamInput.name}": ${error instanceof Error ? error.message : 'Unknown error'}`;
            console.error(errorMsg);
            errors.push(errorMsg);
          }
        }
      }

      // Get final structure
      const allDepartments = await orgStructureService.getDepartments(context.tenantId);
      const allTeams = await orgStructureService.getTeams(context.tenantId);

      const hasChanges = changes.length > 0;
      const hasErrors = errors.length > 0;

      return {
        success: !hasErrors || hasChanges, // Partial success if some operations worked
        structure: {
          departments: allDepartments,
          teams: allTeams,
        },
        changes,
        errors: hasErrors ? errors : undefined,
        summary: {
          departmentsProcessed: validated.departments?.length || 0,
          departmentsSucceeded: results.departments.length,
          teamsProcessed: validated.teams?.length || 0,
          teamsSucceeded: results.teams.length,
          totalDepartments: this.countDepartments(allDepartments),
          totalTeams: allTeams.length,
          totalErrors: errors.length,
        },
        message: hasChanges 
          ? `Organization structure updated. ${changes.length} change(s) applied.${hasErrors ? ` ${errors.length} error(s) occurred.` : ''}`
          : hasErrors 
            ? `Failed to update organization structure. ${errors.length} error(s) occurred.`
            : 'No changes made to organization structure.'
      };

    } catch (error) {
      console.error('[SetupOrganizationStructureTool] Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to setup organization structure'
      };
    }
  }

  private countDepartments(departments: any[]): number {
    let count = departments.length;
    for (const dept of departments) {
      if (dept.subdepartments) {
        count += this.countDepartments(dept.subdepartments);
      }
    }
    return count;
  }
}
