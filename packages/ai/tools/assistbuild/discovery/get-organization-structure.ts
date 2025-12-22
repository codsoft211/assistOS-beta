import { ToolBase, type ToolManifest, type ToolExecutionContext } from '../../kernel';
import { orgStructureService } from '../services/org-structure.service';
import { z } from 'zod';

const inputSchema = z.object({
  includeMembers: z.boolean().optional().default(true),
  departmentId: z.string().optional(),
  teamId: z.string().optional(),
});

export class GetOrganizationStructureTool extends ToolBase<any, any> {
  manifest: ToolManifest = {
    name: 'get_organization_structure',
    category: 'discovery',
    description: 'Retrieves current organizational structure including departments, teams, and team members',
    parameters: [
      { 
        name: 'includeMembers', 
        type: 'boolean', 
        description: 'Include team members in the response (default: true)', 
        required: false 
      },
      { 
        name: 'departmentId', 
        type: 'string', 
        description: 'Get a specific department by ID', 
        required: false 
      },
      { 
        name: 'teamId', 
        type: 'string', 
        description: 'Get a specific team by ID', 
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

      // Get specific department
      if (validated.departmentId) {
        const department = await orgStructureService.getDepartment(context.tenantId, validated.departmentId);
        if (!department) {
          return { success: false, error: 'Department not found' };
        }
        return {
          success: true,
          department,
          message: `Retrieved department: ${department.name}`
        };
      }

      // Get specific team
      if (validated.teamId) {
        const team = await orgStructureService.getTeam(context.tenantId, validated.teamId);
        if (!team) {
          return { success: false, error: 'Team not found' };
        }
        return {
          success: true,
          team,
          message: `Retrieved team: ${team.name} with ${team.members.length} member(s)`
        };
      }

      // Get full structure
      const departments = await orgStructureService.getDepartments(context.tenantId);
      const teams = await orgStructureService.getTeams(context.tenantId);
      const availableUsers = await orgStructureService.getAvailableUsers(context.tenantId);

      // Calculate stats
      const totalMembers = teams.reduce((sum, t) => sum + t.members.length, 0);
      const teamsWithoutDept = teams.filter(t => !t.departmentId).length;

      return {
        success: true,
        structure: {
          departments,
          teams: validated.includeMembers ? teams : teams.map(t => ({ ...t, members: undefined })),
        },
        availableUsers,
        summary: {
          totalDepartments: this.countDepartments(departments),
          totalTeams: teams.length,
          totalMembers,
          teamsWithoutDepartment: teamsWithoutDept,
          availableUsersCount: availableUsers.length,
        },
        message: `Organization has ${this.countDepartments(departments)} department(s) and ${teams.length} team(s) with ${totalMembers} total member(s).`
      };
    } catch (error) {
      console.error('[GetOrganizationStructureTool] Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to retrieve organization structure'
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

