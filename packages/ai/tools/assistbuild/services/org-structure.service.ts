/**
 * Organization Structure Service for AssistBuild
 * 
 * Manages departments and teams in TENANT SCHEMA tables.
 * Note: Tenant schema tables do NOT have tenant_id column (dropped during migration).
 * Used by AssistBuild tools for conversational org structure management.
 */

import { db } from '../../../../../apps/api/db';
import { tenantSchemas, users } from '../../../../../shared/schema';
import { eq } from 'drizzle-orm';
import { Pool } from 'pg';

// Pool for raw SQL queries to tenant schemas
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export interface Department {
  id: string;
  name: string;
  description: string | null;
  parentDepartmentId: string | null;
  managerId: string | null;
  managerName?: string;
  createdAt: Date;
  updatedAt: Date;
  subdepartments?: Department[];
}

export interface Team {
  id: string;
  departmentId: string | null;
  departmentName?: string;
  name: string;
  description: string | null;
  teamLeadId: string | null;
  teamLeadName?: string;
  createdAt: Date;
  updatedAt: Date;
  members: TeamMember[];
}

export interface TeamMember {
  userId: string;
  userName: string;
  email: string;
  role: string | null;
  joinedAt: Date;
}

/**
 * Escape identifier for SQL (prevent SQL injection)
 */
function escapeIdentifier(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/**
 * Get tenant's schema name
 */
async function getTenantSchemaName(tenantId: string): Promise<string | null> {
  const [schema] = await db
    .select({ schemaName: tenantSchemas.schemaName })
    .from(tenantSchemas)
    .where(eq(tenantSchemas.tenantId, tenantId))
    .limit(1);
  
  return schema?.schemaName || null;
}

class OrgStructureService {
  /**
   * Get all departments with hierarchy
   */
  async getDepartments(tenantId: string): Promise<Department[]> {
    try {
      const schemaName = await getTenantSchemaName(tenantId);
      
      if (!schemaName) {
        console.warn(`[OrgStructureService] No schema found for tenant ${tenantId}`);
        return [];
      }

      // Note: No tenant_id filter - schema provides isolation
      const result = await pool.query(`
        SELECT 
          d.id::text as id, d.name, d.description,
          d.parent_department_id::text as "parentDepartmentId",
          d.manager_id::text as "managerId",
          u.first_name || ' ' || u.last_name as "managerName",
          d.created_at as "createdAt", d.updated_at as "updatedAt"
        FROM ${escapeIdentifier(schemaName)}."departments" d
        LEFT JOIN public."users" u ON d.manager_id::text = u.id
        ORDER BY d.name
      `);

      // Build hierarchy
      const departmentMap = new Map<string, Department>();
      const rootDepartments: Department[] = [];

      result.rows.forEach(dept => {
        departmentMap.set(dept.id, {
          ...dept,
          subdepartments: []
        });
      });

      departmentMap.forEach(dept => {
        if (dept.parentDepartmentId) {
          const parent = departmentMap.get(dept.parentDepartmentId);
          if (parent) {
            parent.subdepartments!.push(dept);
          } else {
            rootDepartments.push(dept);
          }
        } else {
          rootDepartments.push(dept);
        }
      });

      return rootDepartments;
    } catch (error) {
      console.error('[OrgStructureService] Error fetching departments:', error);
      throw new Error('Failed to fetch departments');
    }
  }

  /**
   * Get a single department by ID
   */
  async getDepartment(tenantId: string, departmentId: string): Promise<Department | null> {
    try {
      const schemaName = await getTenantSchemaName(tenantId);
      if (!schemaName) return null;

      const result = await pool.query(`
        SELECT 
          d.id::text as id, d.name, d.description,
          d.parent_department_id::text as "parentDepartmentId",
          d.manager_id::text as "managerId",
          u.first_name || ' ' || u.last_name as "managerName",
          d.created_at as "createdAt", d.updated_at as "updatedAt"
        FROM ${escapeIdentifier(schemaName)}."departments" d
        LEFT JOIN public."users" u ON d.manager_id::text = u.id
        WHERE d.id::text = $1
        LIMIT 1
      `, [departmentId]);

      return result.rows[0] || null;
    } catch (error) {
      console.error('[OrgStructureService] Error fetching department:', error);
      throw new Error('Failed to fetch department');
    }
  }

  /**
   * Get all teams with members
   */
  async getTeams(tenantId: string): Promise<Team[]> {
    try {
      const schemaName = await getTenantSchemaName(tenantId);
      
      if (!schemaName) {
        console.warn(`[OrgStructureService] No schema found for tenant ${tenantId}`);
        return [];
      }

      // Get teams - no tenant_id filter
      const teamsResult = await pool.query(`
        SELECT 
          t.id::text as id, t.name, t.description,
          t.department_id::text as "departmentId",
          d.name as "departmentName",
          t.team_lead_id::text as "teamLeadId",
          u.first_name || ' ' || u.last_name as "teamLeadName",
          t.created_at as "createdAt", t.updated_at as "updatedAt"
        FROM ${escapeIdentifier(schemaName)}."teams" t
        LEFT JOIN ${escapeIdentifier(schemaName)}."departments" d ON t.department_id::text = d.id::text
        LEFT JOIN public."users" u ON t.team_lead_id::text = u.id
        ORDER BY t.name
      `);

      // Get team members
      const teamIds = teamsResult.rows.map(t => t.id);
      let membersResult = { rows: [] as any[] };
      
      if (teamIds.length > 0) {
        membersResult = await pool.query(`
          SELECT 
            tm.team_id::text as "teamId", tm.user_id::text as "userId", tm.role,
            tm.joined_at as "joinedAt",
            u.first_name || ' ' || u.last_name as "userName",
            u.email
          FROM ${escapeIdentifier(schemaName)}."team_members" tm
          INNER JOIN public."users" u ON tm.user_id::text = u.id
          WHERE tm.team_id::text = ANY($1)
        `, [teamIds]);
      }

      // Build teams with members
      return teamsResult.rows.map(team => ({
        ...team,
        members: membersResult.rows
          .filter(m => m.teamId === team.id)
          .map(m => ({
            userId: m.userId,
            userName: m.userName,
            email: m.email,
            role: m.role,
            joinedAt: m.joinedAt,
          }))
      }));
    } catch (error) {
      console.error('[OrgStructureService] Error fetching teams:', error);
      throw new Error('Failed to fetch teams');
    }
  }

  /**
   * Get a single team by ID
   */
  async getTeam(tenantId: string, teamId: string): Promise<Team | null> {
    try {
      const schemaName = await getTenantSchemaName(tenantId);
      if (!schemaName) return null;

      const result = await pool.query(`
        SELECT 
          t.id::text as id, t.name, t.description,
          t.department_id::text as "departmentId",
          d.name as "departmentName",
          t.team_lead_id::text as "teamLeadId",
          u.first_name || ' ' || u.last_name as "teamLeadName",
          t.created_at as "createdAt", t.updated_at as "updatedAt"
        FROM ${escapeIdentifier(schemaName)}."teams" t
        LEFT JOIN ${escapeIdentifier(schemaName)}."departments" d ON t.department_id::text = d.id::text
        LEFT JOIN public."users" u ON t.team_lead_id::text = u.id
        WHERE t.id::text = $1
        LIMIT 1
      `, [teamId]);

      if (!result.rows[0]) return null;

      // Get members
      const membersResult = await pool.query(`
        SELECT 
          tm.user_id::text as "userId", tm.role,
          tm.joined_at as "joinedAt",
          u.first_name || ' ' || u.last_name as "userName",
          u.email
        FROM ${escapeIdentifier(schemaName)}."team_members" tm
        INNER JOIN public."users" u ON tm.user_id::text = u.id
        WHERE tm.team_id::text = $1
      `, [teamId]);

      return {
        ...result.rows[0],
        members: membersResult.rows.map(m => ({
          userId: m.userId,
          userName: m.userName,
          email: m.email,
          role: m.role,
          joinedAt: m.joinedAt,
        }))
      };
    } catch (error) {
      console.error('[OrgStructureService] Error fetching team:', error);
      throw new Error('Failed to fetch team');
    }
  }

  /**
   * Create a department
   */
  async createDepartment(
    tenantId: string, 
    userId: string,
    data: {
      name: string;
      description?: string | null;
      parentDepartmentId?: string | null;
      managerId?: string | null;
    }
  ): Promise<Department> {
    try {
      const schemaName = await getTenantSchemaName(tenantId);
      if (!schemaName) throw new Error('Tenant schema not found');

      // Validate parent if provided
      if (data.parentDepartmentId) {
        const parentExists = await pool.query(`
          SELECT 1 FROM ${escapeIdentifier(schemaName)}."departments"
          WHERE id::text = $1 LIMIT 1
        `, [data.parentDepartmentId]);
        if (parentExists.rows.length === 0) {
          throw new Error('Parent department not found');
        }
      }

      // Insert - no tenant_id column
      const result = await pool.query(`
        INSERT INTO ${escapeIdentifier(schemaName)}."departments" 
          (name, description, parent_department_id, manager_id)
        VALUES ($1, $2, $3, $4)
        RETURNING 
          id::text as id, name, description,
          parent_department_id::text as "parentDepartmentId",
          manager_id::text as "managerId",
          created_at as "createdAt", updated_at as "updatedAt"
      `, [data.name, data.description || null, data.parentDepartmentId || null, data.managerId || null]);

      // Audit log - has tenant_id column
      await pool.query(`
        INSERT INTO ${escapeIdentifier(schemaName)}."audit_log"
          (tenant_id, actor_user_id, action, metadata)
        VALUES ($1, $2, $3, $4)
      `, [tenantId, userId, 'department_created', JSON.stringify({ departmentId: result.rows[0].id, name: data.name })]);

      // Get manager name
      let managerName: string | undefined;
      if (result.rows[0].managerId) {
        const managerResult = await db
          .select({ firstName: users.firstName, lastName: users.lastName })
          .from(users)
          .where(eq(users.id, result.rows[0].managerId))
          .limit(1);
        if (managerResult[0]) {
          managerName = `${managerResult[0].firstName} ${managerResult[0].lastName}`;
        }
      }

      return { ...result.rows[0], managerName, subdepartments: [] };
    } catch (error) {
      console.error('[OrgStructureService] Error creating department:', error);
      throw error;
    }
  }

  /**
   * Update a department
   */
  async updateDepartment(
    tenantId: string,
    userId: string,
    departmentId: string,
    data: {
      name?: string;
      description?: string | null;
      parentDepartmentId?: string | null;
      managerId?: string | null;
    }
  ): Promise<Department> {
    try {
      const schemaName = await getTenantSchemaName(tenantId);
      if (!schemaName) throw new Error('Tenant schema not found');

      // Check exists
      const existing = await pool.query(`
        SELECT id, name FROM ${escapeIdentifier(schemaName)}."departments"
        WHERE id::text = $1 LIMIT 1
      `, [departmentId]);
      if (existing.rows.length === 0) throw new Error('Department not found');

      // Prevent circular reference
      if (data.parentDepartmentId === departmentId) {
        throw new Error('Department cannot be its own parent');
      }

      // Build update
      const updates: string[] = [];
      const values: any[] = [];
      let idx = 1;

      if (data.name !== undefined) { updates.push(`name = $${idx++}`); values.push(data.name); }
      if (data.description !== undefined) { updates.push(`description = $${idx++}`); values.push(data.description); }
      if (data.parentDepartmentId !== undefined) { updates.push(`parent_department_id = $${idx++}`); values.push(data.parentDepartmentId); }
      if (data.managerId !== undefined) { updates.push(`manager_id = $${idx++}`); values.push(data.managerId); }
      updates.push(`updated_at = NOW()`);
      values.push(departmentId);

      const result = await pool.query(`
        UPDATE ${escapeIdentifier(schemaName)}."departments"
        SET ${updates.join(', ')}
        WHERE id::text = $${idx}
        RETURNING 
          id::text as id, name, description,
          parent_department_id::text as "parentDepartmentId",
          manager_id::text as "managerId",
          created_at as "createdAt", updated_at as "updatedAt"
      `, values);

      // Audit log
      await pool.query(`
        INSERT INTO ${escapeIdentifier(schemaName)}."audit_log"
          (tenant_id, actor_user_id, action, metadata)
        VALUES ($1, $2, $3, $4)
      `, [tenantId, userId, 'department_updated', JSON.stringify({ departmentId, changes: data })]);

      return { ...result.rows[0], subdepartments: [] };
    } catch (error) {
      console.error('[OrgStructureService] Error updating department:', error);
      throw error;
    }
  }

  /**
   * Delete a department
   */
  async deleteDepartment(tenantId: string, userId: string, departmentId: string): Promise<void> {
    try {
      const schemaName = await getTenantSchemaName(tenantId);
      if (!schemaName) throw new Error('Tenant schema not found');

      // Check exists and get name
      const existing = await pool.query(`
        SELECT name FROM ${escapeIdentifier(schemaName)}."departments"
        WHERE id::text = $1 LIMIT 1
      `, [departmentId]);
      if (existing.rows.length === 0) throw new Error('Department not found');

      // Check for subdepartments
      const subdepts = await pool.query(`
        SELECT COUNT(*) as count FROM ${escapeIdentifier(schemaName)}."departments"
        WHERE parent_department_id::text = $1
      `, [departmentId]);
      if (parseInt(subdepts.rows[0].count) > 0) {
        throw new Error('Cannot delete department with subdepartments');
      }

      // Check for teams
      const teams = await pool.query(`
        SELECT COUNT(*) as count FROM ${escapeIdentifier(schemaName)}."teams"
        WHERE department_id::text = $1
      `, [departmentId]);
      if (parseInt(teams.rows[0].count) > 0) {
        throw new Error('Cannot delete department with teams');
      }

      await pool.query(`
        DELETE FROM ${escapeIdentifier(schemaName)}."departments"
        WHERE id::text = $1
      `, [departmentId]);

      // Audit log
      await pool.query(`
        INSERT INTO ${escapeIdentifier(schemaName)}."audit_log"
          (tenant_id, actor_user_id, action, metadata)
        VALUES ($1, $2, $3, $4)
      `, [tenantId, userId, 'department_deleted', JSON.stringify({ departmentId, name: existing.rows[0].name })]);
    } catch (error) {
      console.error('[OrgStructureService] Error deleting department:', error);
      throw error;
    }
  }

  /**
   * Create a team
   */
  async createTeam(
    tenantId: string,
    userId: string,
    data: {
      name: string;
      description?: string | null;
      departmentId: string;
      teamLeadId?: string | null;
      memberUserIds?: string[];
    }
  ): Promise<Team> {
    try {
      const schemaName = await getTenantSchemaName(tenantId);
      if (!schemaName) throw new Error('Tenant schema not found');

      // Validate department
      const deptExists = await pool.query(`
        SELECT 1 FROM ${escapeIdentifier(schemaName)}."departments"
        WHERE id::text = $1 LIMIT 1
      `, [data.departmentId]);
      if (deptExists.rows.length === 0) {
        throw new Error('Department not found');
      }

      // Insert - no tenant_id column
      const result = await pool.query(`
        INSERT INTO ${escapeIdentifier(schemaName)}."teams" 
          (name, description, department_id, team_lead_id)
        VALUES ($1, $2, $3, $4)
        RETURNING 
          id::text as id, name, description,
          department_id::text as "departmentId",
          team_lead_id::text as "teamLeadId",
          created_at as "createdAt", updated_at as "updatedAt"
      `, [data.name, data.description || null, data.departmentId, data.teamLeadId || null]);

      const teamId = result.rows[0].id;

      // Add members if provided
      if (data.memberUserIds && data.memberUserIds.length > 0) {
        for (const memberId of data.memberUserIds) {
          await pool.query(`
            INSERT INTO ${escapeIdentifier(schemaName)}."team_members" 
              (user_id, team_id, role)
            VALUES ($1, $2, $3)
          `, [memberId, teamId, 'member']);
        }
      }

      // Audit log
      await pool.query(`
        INSERT INTO ${escapeIdentifier(schemaName)}."audit_log"
          (tenant_id, actor_user_id, action, metadata)
        VALUES ($1, $2, $3, $4)
      `, [tenantId, userId, 'team_created', JSON.stringify({ teamId, name: data.name })]);

      return this.getTeam(tenantId, teamId) as Promise<Team>;
    } catch (error) {
      console.error('[OrgStructureService] Error creating team:', error);
      throw error;
    }
  }

  /**
   * Update a team
   */
  async updateTeam(
    tenantId: string,
    userId: string,
    teamId: string,
    data: {
      name?: string;
      description?: string | null;
      departmentId?: string;
      teamLeadId?: string | null;
    }
  ): Promise<Team> {
    try {
      const schemaName = await getTenantSchemaName(tenantId);
      if (!schemaName) throw new Error('Tenant schema not found');

      // Check exists
      const existing = await pool.query(`
        SELECT 1 FROM ${escapeIdentifier(schemaName)}."teams"
        WHERE id::text = $1 LIMIT 1
      `, [teamId]);
      if (existing.rows.length === 0) throw new Error('Team not found');

      // Validate department if changing
      if (data.departmentId) {
        const deptExists = await pool.query(`
          SELECT 1 FROM ${escapeIdentifier(schemaName)}."departments"
          WHERE id::text = $1 LIMIT 1
        `, [data.departmentId]);
        if (deptExists.rows.length === 0) {
          throw new Error('Department not found');
        }
      }

      // Build update
      const updates: string[] = [];
      const values: any[] = [];
      let idx = 1;

      if (data.name !== undefined) { updates.push(`name = $${idx++}`); values.push(data.name); }
      if (data.description !== undefined) { updates.push(`description = $${idx++}`); values.push(data.description); }
      if (data.departmentId !== undefined) { updates.push(`department_id = $${idx++}`); values.push(data.departmentId); }
      if (data.teamLeadId !== undefined) { updates.push(`team_lead_id = $${idx++}`); values.push(data.teamLeadId); }
      updates.push(`updated_at = NOW()`);
      values.push(teamId);

      await pool.query(`
        UPDATE ${escapeIdentifier(schemaName)}."teams"
        SET ${updates.join(', ')}
        WHERE id::text = $${idx}
      `, values);

      // Audit log
      await pool.query(`
        INSERT INTO ${escapeIdentifier(schemaName)}."audit_log"
          (tenant_id, actor_user_id, action, metadata)
        VALUES ($1, $2, $3, $4)
      `, [tenantId, userId, 'team_updated', JSON.stringify({ teamId, changes: data })]);

      return this.getTeam(tenantId, teamId) as Promise<Team>;
    } catch (error) {
      console.error('[OrgStructureService] Error updating team:', error);
      throw error;
    }
  }

  /**
   * Delete a team
   */
  async deleteTeam(tenantId: string, userId: string, teamId: string): Promise<void> {
    try {
      const schemaName = await getTenantSchemaName(tenantId);
      if (!schemaName) throw new Error('Tenant schema not found');

      // Check exists
      const existing = await pool.query(`
        SELECT name FROM ${escapeIdentifier(schemaName)}."teams"
        WHERE id::text = $1 LIMIT 1
      `, [teamId]);
      if (existing.rows.length === 0) throw new Error('Team not found');

      // Delete members first
      await pool.query(`
        DELETE FROM ${escapeIdentifier(schemaName)}."team_members"
        WHERE team_id::text = $1
      `, [teamId]);

      // Delete team
      await pool.query(`
        DELETE FROM ${escapeIdentifier(schemaName)}."teams"
        WHERE id::text = $1
      `, [teamId]);

      // Audit log
      await pool.query(`
        INSERT INTO ${escapeIdentifier(schemaName)}."audit_log"
          (tenant_id, actor_user_id, action, metadata)
        VALUES ($1, $2, $3, $4)
      `, [tenantId, userId, 'team_deleted', JSON.stringify({ teamId, name: existing.rows[0].name })]);
    } catch (error) {
      console.error('[OrgStructureService] Error deleting team:', error);
      throw error;
    }
  }

  /**
   * Add members to a team
   */
  async addTeamMembers(
    tenantId: string,
    userId: string,
    teamId: string,
    memberUserIds: string[],
    role: string = 'member'
  ): Promise<Team> {
    try {
      const schemaName = await getTenantSchemaName(tenantId);
      if (!schemaName) throw new Error('Tenant schema not found');

      // Check team exists
      const existing = await pool.query(`
        SELECT 1 FROM ${escapeIdentifier(schemaName)}."teams"
        WHERE id::text = $1 LIMIT 1
      `, [teamId]);
      if (existing.rows.length === 0) throw new Error('Team not found');

      // Get existing members
      const existingMembers = await pool.query(`
        SELECT user_id::text as "userId" FROM ${escapeIdentifier(schemaName)}."team_members"
        WHERE team_id::text = $1
      `, [teamId]);
      const existingSet = new Set(existingMembers.rows.map(r => r.userId));

      // Add new members
      const added: string[] = [];
      for (const memberId of memberUserIds) {
        if (!existingSet.has(memberId)) {
          await pool.query(`
            INSERT INTO ${escapeIdentifier(schemaName)}."team_members" 
              (user_id, team_id, role)
            VALUES ($1, $2, $3)
          `, [memberId, teamId, role]);
          added.push(memberId);
        }
      }

      // Audit log
      if (added.length > 0) {
        await pool.query(`
          INSERT INTO ${escapeIdentifier(schemaName)}."audit_log"
            (tenant_id, actor_user_id, action, metadata)
          VALUES ($1, $2, $3, $4)
        `, [tenantId, userId, 'team_members_added', JSON.stringify({ teamId, addedUserIds: added, role })]);
      }

      return this.getTeam(tenantId, teamId) as Promise<Team>;
    } catch (error) {
      console.error('[OrgStructureService] Error adding team members:', error);
      throw error;
    }
  }

  /**
   * Remove members from a team
   */
  async removeTeamMembers(
    tenantId: string,
    userId: string,
    teamId: string,
    memberUserIds: string[]
  ): Promise<Team> {
    try {
      const schemaName = await getTenantSchemaName(tenantId);
      if (!schemaName) throw new Error('Tenant schema not found');

      // Check team exists
      const existing = await pool.query(`
        SELECT 1 FROM ${escapeIdentifier(schemaName)}."teams"
        WHERE id::text = $1 LIMIT 1
      `, [teamId]);
      if (existing.rows.length === 0) throw new Error('Team not found');

      // Remove members
      for (const memberId of memberUserIds) {
        await pool.query(`
          DELETE FROM ${escapeIdentifier(schemaName)}."team_members"
          WHERE team_id::text = $1 AND user_id::text = $2
        `, [teamId, memberId]);
      }

      // Audit log
      await pool.query(`
        INSERT INTO ${escapeIdentifier(schemaName)}."audit_log"
          (tenant_id, actor_user_id, action, metadata)
        VALUES ($1, $2, $3, $4)
      `, [tenantId, userId, 'team_members_removed', JSON.stringify({ teamId, removedUserIds: memberUserIds })]);

      return this.getTeam(tenantId, teamId) as Promise<Team>;
    } catch (error) {
      console.error('[OrgStructureService] Error removing team members:', error);
      throw error;
    }
  }

  /**
   * Get available users for assignment (in tenant)
   */
  async getAvailableUsers(tenantId: string): Promise<Array<{ id: string; name: string; email: string }>> {
    try {
      const schemaName = await getTenantSchemaName(tenantId);
      if (!schemaName) return [];

      const result = await pool.query(`
        SELECT 
          u.id, 
          u.first_name || ' ' || u.last_name as name,
          u.email
        FROM public."users" u
        INNER JOIN ${escapeIdentifier(schemaName)}."user_tenants" ut ON u.id = ut.user_id::text
        ORDER BY u.first_name, u.last_name
      `);

      return result.rows;
    } catch (error) {
      console.error('[OrgStructureService] Error fetching users:', error);
      return [];
    }
  }
}

export const orgStructureService = new OrgStructureService();
