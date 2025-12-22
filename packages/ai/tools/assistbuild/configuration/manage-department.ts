import { ToolBase, type ToolManifest, type ToolExecutionContext } from '../../kernel';
import { orgStructureService } from '../services/org-structure.service';
import { z } from 'zod';

const inputSchema = z.object({
  action: z.enum(['create', 'update', 'delete']),
  departmentId: z.string().optional(),
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullish(), // Allow null to clear
  parentDepartmentId: z.string().nullish(), // Allow null to make root department
  managerId: z.string().nullish(), // Allow null to remove manager
});

export class ManageDepartmentTool extends ToolBase<any, any> {
  manifest: ToolManifest = {
    name: 'manage_department',
    category: 'configuration',
    description: 'Create, update, or delete a department in the organization structure',
    parameters: [
      { 
        name: 'action', 
        type: 'string', 
        description: 'Action to perform: "create", "update", or "delete"', 
        required: true,
        enum: ['create', 'update', 'delete']
      },
      { 
        name: 'departmentId', 
        type: 'string', 
        description: 'Department ID (required for update/delete)', 
        required: false 
      },
      { 
        name: 'name', 
        type: 'string', 
        description: 'Department name (required for create)', 
        required: false 
      },
      { 
        name: 'description', 
        type: 'string', 
        description: 'Department description', 
        required: false 
      },
      { 
        name: 'parentDepartmentId', 
        type: 'string', 
        description: 'Parent department ID for hierarchy (null for root)', 
        required: false 
      },
      { 
        name: 'managerId', 
        type: 'string', 
        description: 'User ID of the department manager', 
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

      switch (validated.action) {
        case 'create': {
          if (!validated.name) {
            return { success: false, error: 'Name is required for creating a department' };
          }

          const department = await orgStructureService.createDepartment(
            context.tenantId,
            context.userId,
            {
              name: validated.name,
              description: validated.description || null,
              parentDepartmentId: validated.parentDepartmentId || null,
              managerId: validated.managerId || null,
            }
          );

          return {
            success: true,
            department,
            action: 'created',
            message: `Successfully created department "${department.name}"${department.parentDepartmentId ? ' as subdepartment' : ''}`
          };
        }

        case 'update': {
          if (!validated.departmentId) {
            return { success: false, error: 'Department ID is required for update' };
          }

          const updates: any = {};
          if (validated.name !== undefined) updates.name = validated.name;
          if (validated.description !== undefined) updates.description = validated.description;
          if (validated.parentDepartmentId !== undefined) updates.parentDepartmentId = validated.parentDepartmentId;
          if (validated.managerId !== undefined) updates.managerId = validated.managerId;

          if (Object.keys(updates).length === 0) {
            return { success: false, error: 'No updates provided' };
          }

          const department = await orgStructureService.updateDepartment(
            context.tenantId,
            context.userId,
            validated.departmentId,
            updates
          );

          return {
            success: true,
            department,
            action: 'updated',
            changes: Object.keys(updates),
            message: `Successfully updated department "${department.name}". Changed: ${Object.keys(updates).join(', ')}`
          };
        }

        case 'delete': {
          if (!validated.departmentId) {
            return { success: false, error: 'Department ID is required for delete' };
          }

          // Get department name before deletion
          const existing = await orgStructureService.getDepartment(context.tenantId, validated.departmentId);
          if (!existing) {
            return { success: false, error: 'Department not found' };
          }

          await orgStructureService.deleteDepartment(
            context.tenantId,
            context.userId,
            validated.departmentId
          );

          return {
            success: true,
            action: 'deleted',
            deletedDepartmentId: validated.departmentId,
            deletedDepartmentName: existing.name,
            message: `Successfully deleted department "${existing.name}"`
          };
        }

        default:
          return { success: false, error: `Unknown action: ${validated.action}` };
      }
    } catch (error) {
      console.error('[ManageDepartmentTool] Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to manage department'
      };
    }
  }
}

