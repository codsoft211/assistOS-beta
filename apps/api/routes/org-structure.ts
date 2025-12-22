/**
 * Organization Structure Routes
 * 
 * API routes for managing departments, teams, and team members.
 * These operate on tenant-scoped tables (departments, teams, team_members)
 * which do NOT have tenant_id or environment columns.
 */

import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { orgStructureService } from "../services/org-structure.service";

const router = Router();

// ==================== MIDDLEWARE ====================

/**
 * Middleware to check admin/owner access
 * Queries tenant schema's user_tenants table for role
 */
async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.session.userId;
    const tenantId = (req as any).tenantId;

    if (!userId || !tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Get schema name if not already set
    let schemaName = (req as any).tenantSchemaName;
    if (!schemaName) {
      const { tenantSchemaService } = await import('../services/tenant-schema.service');
      schemaName = await tenantSchemaService.getTenantSchemaName(tenantId);
      if (!schemaName) {
        console.error("[requireAdmin] No tenant schema found for tenant:", tenantId);
        return res.status(500).json({ error: "Tenant schema not found" });
      }
      (req as any).tenantSchemaName = schemaName;
    }

    const { Pool } = await import('pg');
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    
    // Query tenant schema's user_tenants table
    // user_id might be uuid type, need to cast for comparison
    const escapedSchema = `"${schemaName.replace(/"/g, '""')}"`;
    const result = await pool.query(`
      SELECT role FROM ${escapedSchema}."user_tenants"
      WHERE user_id::text = $1
      LIMIT 1
    `, [userId]);
    
    await pool.end();

    const role = result.rows[0]?.role;
    console.log(`[requireAdmin] User ${userId} role in tenant ${tenantId}: ${role || 'NOT FOUND'}`);
    
    if (!role || !['admin', 'owner'].includes(role)) {
      return res.status(403).json({ error: "Admin or owner access required" });
    }

    (req as any).userRole = role;
    next();
  } catch (error: any) {
    console.error("[requireAdmin] Error:", error);
    res.status(500).json({ error: "Authorization check failed" });
  }
}

// ==================== VALIDATION SCHEMAS ====================

const createDepartmentSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  parentDepartmentId: z.string().uuid().optional(),
  managerId: z.string().uuid().optional(),
});

const updateDepartmentSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  parentDepartmentId: z.string().uuid().nullable().optional(),
  managerId: z.string().uuid().nullable().optional(),
});

const createTeamSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  departmentId: z.string().uuid(),
  teamLeadId: z.string().uuid().optional(),
});

const updateTeamSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  departmentId: z.string().uuid().optional(),
  teamLeadId: z.string().uuid().nullable().optional(),
});

const addMembersSchema = z.object({
  userIds: z.array(z.string().uuid()).min(1),
  role: z.string().default("member"),
});

// ==================== ROUTES ====================

/**
 * GET /api/org-structure
 * Get full organizational structure with departments and teams
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;

    if (!tenantId) {
      return res.status(401).json({ error: "Tenant ID required" });
    }

    const structure = await orgStructureService.getFullOrgStructure(tenantId);
    res.json(structure);
  } catch (error: any) {
    console.error("[OrgStructure API] Error fetching org structure:", error);
    res.status(500).json({ 
      error: "Failed to fetch organization structure",
      details: error.message 
    });
  }
});

/**
 * GET /api/org-structure/departments
 * List all departments (flat list)
 */
router.get("/departments", async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;

    if (!tenantId) {
      return res.status(401).json({ error: "Tenant ID required" });
    }

    const departments = await orgStructureService.listDepartments(tenantId);
    res.json(departments);
  } catch (error: any) {
    console.error("[OrgStructure API] Error listing departments:", error);
    res.status(500).json({ 
      error: "Failed to list departments",
      details: error.message 
    });
  }
});

/**
 * POST /api/org-structure/departments
 * Create a new department
 */
router.post("/departments", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = req.session.userId!;

    const data = createDepartmentSchema.parse(req.body);

    // Validate parent department exists if provided
    if (data.parentDepartmentId) {
      const parentExists = await orgStructureService.departmentExists(tenantId, data.parentDepartmentId);
      if (!parentExists) {
        return res.status(400).json({ error: "Parent department not found" });
      }
    }

    const department = await orgStructureService.createDepartment(tenantId, data);

    // Log audit event
    await orgStructureService.createAuditLog(tenantId, userId, 'department_created', {
      departmentId: department.id,
      name: data.name,
    });

    res.status(201).json(department);
  } catch (error: any) {
    console.error("[OrgStructure API] Error creating department:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: "Validation error",
        details: error.errors 
      });
    }
    res.status(500).json({ 
      error: "Failed to create department",
      details: error.message 
    });
  }
});

/**
 * PATCH /api/org-structure/departments/:id
 * Update a department
 */
router.patch("/departments/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = req.session.userId!;
    const { id } = req.params;

    const data = updateDepartmentSchema.parse(req.body);

    // Check department exists
    const exists = await orgStructureService.departmentExists(tenantId, id);
    if (!exists) {
      return res.status(404).json({ error: "Department not found" });
    }

    // Prevent circular parent reference
    if (data.parentDepartmentId === id) {
      return res.status(400).json({ error: "Department cannot be its own parent" });
    }

    const department = await orgStructureService.updateDepartment(tenantId, id, data);

    // Log audit event
    await orgStructureService.createAuditLog(tenantId, userId, 'department_updated', {
      departmentId: id,
      changes: data,
    });

    res.json(department);
  } catch (error: any) {
    console.error("[OrgStructure API] Error updating department:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: "Validation error",
        details: error.errors 
      });
    }
    res.status(500).json({ 
      error: "Failed to update department",
      details: error.message 
    });
  }
});

/**
 * DELETE /api/org-structure/departments/:id
 * Delete a department (fails if has subdepartments or teams)
 */
router.delete("/departments/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = req.session.userId!;
    const { id } = req.params;

    // Check department exists
    const department = await orgStructureService.getDepartment(tenantId, id);
    if (!department) {
      return res.status(404).json({ error: "Department not found" });
    }

    // Check for subdepartments
    const subdeptCount = await orgStructureService.countSubdepartments(tenantId, id);
    if (subdeptCount > 0) {
      return res.status(400).json({ 
        error: "Cannot delete department with subdepartments. Remove subdepartments first." 
      });
    }

    // Check for teams
    const teamCount = await orgStructureService.countTeamsInDepartment(tenantId, id);
    if (teamCount > 0) {
      return res.status(400).json({ 
        error: "Cannot delete department with teams. Remove or reassign teams first." 
      });
    }

    await orgStructureService.deleteDepartment(tenantId, id);

    // Log audit event
    await orgStructureService.createAuditLog(tenantId, userId, 'department_deleted', {
      departmentId: id,
      name: department.name,
    });

    res.json({ success: true });
  } catch (error: any) {
    console.error("[OrgStructure API] Error deleting department:", error);
    res.status(500).json({ 
      error: "Failed to delete department",
      details: error.message 
    });
  }
});

/**
 * GET /api/org-structure/teams
 * List all teams (flat list with members)
 */
router.get("/teams", async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;

    if (!tenantId) {
      return res.status(401).json({ error: "Tenant ID required" });
    }

    const teams = await orgStructureService.listTeams(tenantId);
    res.json(teams);
  } catch (error: any) {
    console.error("[OrgStructure API] Error listing teams:", error);
    res.status(500).json({ 
      error: "Failed to list teams",
      details: error.message 
    });
  }
});

/**
 * POST /api/org-structure/teams
 * Create a new team (must belong to a department)
 */
router.post("/teams", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = req.session.userId!;

    const data = createTeamSchema.parse(req.body);

    // Validate department exists
    const deptExists = await orgStructureService.departmentExists(tenantId, data.departmentId);
    if (!deptExists) {
      return res.status(400).json({ error: "Department not found" });
    }

    const team = await orgStructureService.createTeam(tenantId, data);

    // Log audit event
    await orgStructureService.createAuditLog(tenantId, userId, 'team_created', {
      teamId: team.id,
      name: data.name,
      departmentId: data.departmentId,
    });

    res.status(201).json(team);
  } catch (error: any) {
    console.error("[OrgStructure API] Error creating team:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: "Validation error",
        details: error.errors 
      });
    }
    res.status(500).json({ 
      error: "Failed to create team",
      details: error.message 
    });
  }
});

/**
 * PATCH /api/org-structure/teams/:id
 * Update a team
 */
router.patch("/teams/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = req.session.userId!;
    const { id } = req.params;

    const data = updateTeamSchema.parse(req.body);

    // Check team exists
    const exists = await orgStructureService.teamExists(tenantId, id);
    if (!exists) {
      return res.status(404).json({ error: "Team not found" });
    }

    // Validate new department if changing
    if (data.departmentId) {
      const deptExists = await orgStructureService.departmentExists(tenantId, data.departmentId);
      if (!deptExists) {
        return res.status(400).json({ error: "Department not found" });
      }
    }

    const team = await orgStructureService.updateTeam(tenantId, id, data);

    // Log audit event
    await orgStructureService.createAuditLog(tenantId, userId, 'team_updated', {
      teamId: id,
      changes: data,
    });

    res.json(team);
  } catch (error: any) {
    console.error("[OrgStructure API] Error updating team:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: "Validation error",
        details: error.errors 
      });
    }
    res.status(500).json({ 
      error: "Failed to update team",
      details: error.message 
    });
  }
});

/**
 * DELETE /api/org-structure/teams/:id
 * Delete a team (removes all team members)
 */
router.delete("/teams/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = req.session.userId!;
    const { id } = req.params;

    // Check team exists
    const team = await orgStructureService.getTeam(tenantId, id);
    if (!team) {
      return res.status(404).json({ error: "Team not found" });
    }

    await orgStructureService.deleteTeam(tenantId, id);

    // Log audit event
    await orgStructureService.createAuditLog(tenantId, userId, 'team_deleted', {
      teamId: id,
      name: team.name,
    });

    res.json({ success: true });
  } catch (error: any) {
    console.error("[OrgStructure API] Error deleting team:", error);
    res.status(500).json({ 
      error: "Failed to delete team",
      details: error.message 
    });
  }
});

/**
 * POST /api/org-structure/teams/:id/members
 * Add members to a team
 */
router.post("/teams/:id/members", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = req.session.userId!;
    const { id } = req.params;

    const data = addMembersSchema.parse(req.body);

    // Check team exists
    const teamExists = await orgStructureService.teamExists(tenantId, id);
    if (!teamExists) {
      return res.status(404).json({ error: "Team not found" });
    }

    // Get existing members to avoid duplicates
    const existingMemberIds = await orgStructureService.getTeamMemberIds(tenantId, id);
    const existingSet = new Set(existingMemberIds);
    const newUserIds = data.userIds.filter(uid => !existingSet.has(uid));

    if (newUserIds.length === 0) {
      return res.status(400).json({ error: "All specified users are already team members" });
    }

    // Add new members
    for (const uid of newUserIds) {
      await orgStructureService.addTeamMember(tenantId, id, uid, data.role);
    }

    // Log audit event
    await orgStructureService.createAuditLog(tenantId, userId, 'team_members_added', {
      teamId: id,
      addedUserIds: newUserIds,
      role: data.role,
    });

    res.json({ 
      success: true, 
      addedCount: newUserIds.length,
      skippedCount: data.userIds.length - newUserIds.length,
    });
  } catch (error: any) {
    console.error("[OrgStructure API] Error adding team members:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: "Validation error",
        details: error.errors 
      });
    }
    res.status(500).json({ 
      error: "Failed to add team members",
      details: error.message 
    });
  }
});

/**
 * DELETE /api/org-structure/teams/:id/members/:userId
 * Remove a member from a team
 */
router.delete("/teams/:id/members/:userId", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const actorUserId = req.session.userId!;
    const { id, userId: memberUserId } = req.params;

    // Check team exists
    const teamExists = await orgStructureService.teamExists(tenantId, id);
    if (!teamExists) {
      return res.status(404).json({ error: "Team not found" });
    }

    // Check member exists
    const isMember = await orgStructureService.isTeamMember(tenantId, id, memberUserId);
    if (!isMember) {
      return res.status(404).json({ error: "Team member not found" });
    }

    await orgStructureService.removeTeamMember(tenantId, id, memberUserId);

    // Log audit event
    await orgStructureService.createAuditLog(tenantId, actorUserId, 'team_member_removed', {
      teamId: id,
      removedUserId: memberUserId,
    });

    res.json({ success: true });
  } catch (error: any) {
    console.error("[OrgStructure API] Error removing team member:", error);
    res.status(500).json({ 
      error: "Failed to remove team member",
      details: error.message 
    });
  }
});

/**
 * GET /api/org-structure/users
 * Get list of users in tenant (for assigning to teams/departments)
 */
router.get("/users", async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;

    if (!tenantId) {
      return res.status(401).json({ error: "Tenant ID required" });
    }

    const users = await orgStructureService.listTenantUsers(tenantId);
    res.json(users);
  } catch (error: any) {
    console.error("[OrgStructure API] Error listing users:", error);
    res.status(500).json({ 
      error: "Failed to list users",
      details: error.message 
    });
  }
});

/**
 * GET /api/org-structure/audit-logs
 * Get audit logs from tenant schema with pagination
 */
router.get("/audit-logs", async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;

    if (!tenantId) {
      return res.status(401).json({ error: "Tenant ID required" });
    }

    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.size as string) || 20;
    const action = req.query.action as string;
    const search = req.query.search as string;

    const result = await orgStructureService.getAuditLogs(tenantId, {
      page,
      pageSize,
      action,
      search,
    });

    res.json({
      logs: result.logs,
      pagination: {
        page,
        pageSize,
        total: result.total,
        totalPages: Math.ceil(result.total / pageSize),
      },
      actions: result.actions,
    });
  } catch (error: any) {
    console.error("[OrgStructure API] Error fetching audit logs:", error);
    res.status(500).json({ 
      error: "Failed to fetch audit logs",
      details: error.message 
    });
  }
});

export default router;
