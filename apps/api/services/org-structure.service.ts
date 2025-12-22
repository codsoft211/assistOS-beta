/**
 * Organization Structure Service
 * 
 * Handles all database operations for departments, teams, and team members
 * in tenant-scoped schemas. These tables DO NOT have tenant_id or environment
 * columns - tenant isolation is handled by the schema itself.
 */

import { Pool } from 'pg';
import { tenantSchemaService } from './tenant-schema.service';

// Types
export interface Department {
  id: string;
  name: string;
  description: string | null;
  parentDepartmentId: string | null;
  managerId: string | null;
  managerName?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Team {
  id: string;
  name: string;
  description: string | null;
  departmentId: string | null;
  departmentName?: string | null;
  teamLeadId: string | null;
  teamLeadName?: string | null;
  createdAt: Date;
  updatedAt: Date;
  members?: TeamMember[];
}

export interface TeamMember {
  userId: string;
  teamId: string;
  role: string;
  joinedAt: Date;
  userName?: string;
  email?: string;
}

export interface AuditLog {
  id: string;
  actorUserId: string | null;
  actorName?: string | null;
  actorEmail?: string | null;
  targetUserId: string | null;
  action: string;
  metadata: Record<string, any> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
}

export interface TenantUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  fullName: string;
}

class OrgStructureService {
  private pool: Pool;

  constructor() {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL must be set');
    }
    this.pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }

  /**
   * Escape PostgreSQL identifier to prevent SQL injection
   */
  private escapeIdentifier(name: string): string {
    return `"${name.replace(/"/g, '""')}"`;
  }

  /**
   * Get schema name for a tenant
   */
  async getSchemaName(tenantId: string): Promise<string> {
    const schemaName = await tenantSchemaService.getTenantSchemaName(tenantId);
    if (!schemaName) {
      throw new Error(`No schema found for tenant ${tenantId}`);
    }
    return schemaName;
  }

  // ==================== DEPARTMENTS ====================

  /**
   * List all departments for a tenant
   */
  async listDepartments(tenantId: string): Promise<Department[]> {
    const schemaName = await this.getSchemaName(tenantId);
    
    // Cast all uuid columns to text for consistent JavaScript handling
    const result = await this.pool.query(`
      SELECT 
        d.id::text as id, d.name, d.description,
        d.parent_department_id::text as "parentDepartmentId",
        d.manager_id::text as "managerId",
        u.first_name || ' ' || u.last_name as "managerName",
        d.created_at as "createdAt", d.updated_at as "updatedAt"
      FROM ${this.escapeIdentifier(schemaName)}."departments" d
      LEFT JOIN public."users" u ON d.manager_id::text = u.id
      ORDER BY d.name
    `);

    return result.rows;
  }

  /**
   * Get a department by ID
   */
  async getDepartment(tenantId: string, departmentId: string): Promise<Department | null> {
    const schemaName = await this.getSchemaName(tenantId);
    
    const result = await this.pool.query(`
      SELECT 
        d.id::text as id, d.name, d.description,
        d.parent_department_id::text as "parentDepartmentId",
        d.manager_id::text as "managerId",
        u.first_name || ' ' || u.last_name as "managerName",
        d.created_at as "createdAt", d.updated_at as "updatedAt"
      FROM ${this.escapeIdentifier(schemaName)}."departments" d
      LEFT JOIN public."users" u ON d.manager_id::text = u.id
      WHERE d.id::text = $1
      LIMIT 1
    `, [departmentId]);

    return result.rows[0] || null;
  }

  /**
   * Check if a department exists
   */
  async departmentExists(tenantId: string, departmentId: string): Promise<boolean> {
    const schemaName = await this.getSchemaName(tenantId);
    
    const result = await this.pool.query(`
      SELECT 1 FROM ${this.escapeIdentifier(schemaName)}."departments"
      WHERE id::text = $1
      LIMIT 1
    `, [departmentId]);

    return result.rows.length > 0;
  }

  /**
   * Create a new department
   */
  async createDepartment(
    tenantId: string, 
    data: { name: string; description?: string; parentDepartmentId?: string; managerId?: string }
  ): Promise<Department> {
    const schemaName = await this.getSchemaName(tenantId);
    
    // Note: departments table in tenant schema does NOT have tenant_id (dropped during migration)
    const result = await this.pool.query(`
      INSERT INTO ${this.escapeIdentifier(schemaName)}."departments" 
        (name, description, parent_department_id, manager_id)
      VALUES ($1, $2, $3, $4)
      RETURNING 
        id::text as id, name, description,
        parent_department_id::text as "parentDepartmentId",
        manager_id::text as "managerId",
        created_at as "createdAt", updated_at as "updatedAt"
    `, [data.name, data.description || null, data.parentDepartmentId || null, data.managerId || null]);

    return result.rows[0];
  }

  /**
   * Update a department
   */
  async updateDepartment(
    tenantId: string,
    departmentId: string,
    data: { name?: string; description?: string | null; parentDepartmentId?: string | null; managerId?: string | null }
  ): Promise<Department> {
    const schemaName = await this.getSchemaName(tenantId);
    
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (data.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(data.name);
    }
    if (data.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(data.description || null);
    }
    if (data.parentDepartmentId !== undefined) {
      updates.push(`parent_department_id = $${paramIndex++}`);
      values.push(data.parentDepartmentId || null);
    }
    if (data.managerId !== undefined) {
      updates.push(`manager_id = $${paramIndex++}`);
      values.push(data.managerId || null);
    }
    updates.push(`updated_at = NOW()`);
    values.push(departmentId);

    const result = await this.pool.query(`
      UPDATE ${this.escapeIdentifier(schemaName)}."departments"
      SET ${updates.join(', ')}
      WHERE id::text = $${paramIndex}
      RETURNING 
        id::text as id, name, description,
        parent_department_id::text as "parentDepartmentId",
        manager_id::text as "managerId",
        created_at as "createdAt", updated_at as "updatedAt"
    `, values);

    return result.rows[0];
  }

  /**
   * Delete a department
   */
  async deleteDepartment(tenantId: string, departmentId: string): Promise<void> {
    const schemaName = await this.getSchemaName(tenantId);
    
    await this.pool.query(`
      DELETE FROM ${this.escapeIdentifier(schemaName)}."departments"
      WHERE id::text = $1
    `, [departmentId]);
  }

  /**
   * Count subdepartments
   */
  async countSubdepartments(tenantId: string, departmentId: string): Promise<number> {
    const schemaName = await this.getSchemaName(tenantId);
    
    const result = await this.pool.query(`
      SELECT COUNT(*) as count 
      FROM ${this.escapeIdentifier(schemaName)}."departments"
      WHERE parent_department_id::text = $1
    `, [departmentId]);

    return parseInt(result.rows[0].count);
  }

  // ==================== TEAMS ====================

  /**
   * List all teams for a tenant with members
   */
  async listTeams(tenantId: string): Promise<Team[]> {
    const schemaName = await this.getSchemaName(tenantId);
    
    // Get teams
    // Cast all uuid columns to text for consistent JavaScript handling
    const teamsResult = await this.pool.query(`
      SELECT 
        t.id::text as id, t.name, t.description,
        t.department_id::text as "departmentId",
        d.name as "departmentName",
        t.team_lead_id::text as "teamLeadId",
        u.first_name || ' ' || u.last_name as "teamLeadName",
        t.created_at as "createdAt", t.updated_at as "updatedAt"
      FROM ${this.escapeIdentifier(schemaName)}."teams" t
      LEFT JOIN ${this.escapeIdentifier(schemaName)}."departments" d ON t.department_id::text = d.id::text
      LEFT JOIN public."users" u ON t.team_lead_id::text = u.id
      ORDER BY t.name
    `);

    // Get members for all teams
    // Convert team IDs to strings since teams.id might be uuid type in DB
    const teamIds = teamsResult.rows.map(t => String(t.id));
    let membersMap = new Map<string, TeamMember[]>();
    
    if (teamIds.length > 0) {
      const membersResult = await this.pool.query(`
        SELECT 
          tm.team_id::text as "teamId", tm.user_id as "userId", tm.role,
          tm.joined_at as "joinedAt",
          u.first_name || ' ' || u.last_name as "userName",
          u.email
        FROM ${this.escapeIdentifier(schemaName)}."team_members" tm
        INNER JOIN public."users" u ON tm.user_id::text = u.id
        WHERE tm.team_id::text = ANY($1)
      `, [teamIds]);

      for (const member of membersResult.rows) {
        if (!membersMap.has(member.teamId)) {
          membersMap.set(member.teamId, []);
        }
        membersMap.get(member.teamId)!.push({
          userId: member.userId,
          teamId: member.teamId,
          role: member.role,
          joinedAt: member.joinedAt,
          userName: member.userName,
          email: member.email,
        });
      }
    }

    // Attach members to teams
    return teamsResult.rows.map(team => ({
      ...team,
      members: membersMap.get(team.id) || [],
    }));
  }

  /**
   * Check if a team exists
   */
  async teamExists(tenantId: string, teamId: string): Promise<boolean> {
    const schemaName = await this.getSchemaName(tenantId);
    
    const result = await this.pool.query(`
      SELECT 1 FROM ${this.escapeIdentifier(schemaName)}."teams"
      WHERE id::text = $1
      LIMIT 1
    `, [teamId]);

    return result.rows.length > 0;
  }

  /**
   * Get a team by ID
   */
  async getTeam(tenantId: string, teamId: string): Promise<{ id: string; name: string } | null> {
    const schemaName = await this.getSchemaName(tenantId);
    
    const result = await this.pool.query(`
      SELECT id::text as id, name FROM ${this.escapeIdentifier(schemaName)}."teams"
      WHERE id::text = $1
      LIMIT 1
    `, [teamId]);

    return result.rows[0] || null;
  }

  /**
   * Create a new team
   */
  async createTeam(
    tenantId: string,
    data: { name: string; description?: string; departmentId: string; teamLeadId?: string }
  ): Promise<Team> {
    const schemaName = await this.getSchemaName(tenantId);
    
    // Note: teams table in tenant schema does NOT have tenant_id (dropped during migration)
    const result = await this.pool.query(`
      INSERT INTO ${this.escapeIdentifier(schemaName)}."teams" 
        (name, description, department_id, team_lead_id)
      VALUES ($1, $2, $3, $4)
      RETURNING 
        id::text as id, name, description,
        department_id::text as "departmentId",
        team_lead_id::text as "teamLeadId",
        created_at as "createdAt", updated_at as "updatedAt"
    `, [data.name, data.description || null, data.departmentId, data.teamLeadId || null]);

    return { ...result.rows[0], members: [] };
  }

  /**
   * Update a team
   */
  async updateTeam(
    tenantId: string,
    teamId: string,
    data: { name?: string; description?: string | null; departmentId?: string; teamLeadId?: string | null }
  ): Promise<Team> {
    const schemaName = await this.getSchemaName(tenantId);
    
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (data.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(data.name);
    }
    if (data.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(data.description || null);
    }
    if (data.departmentId !== undefined) {
      updates.push(`department_id = $${paramIndex++}`);
      values.push(data.departmentId);
    }
    if (data.teamLeadId !== undefined) {
      updates.push(`team_lead_id = $${paramIndex++}`);
      values.push(data.teamLeadId || null);
    }
    updates.push(`updated_at = NOW()`);
    values.push(teamId);

    const result = await this.pool.query(`
      UPDATE ${this.escapeIdentifier(schemaName)}."teams"
      SET ${updates.join(', ')}
      WHERE id::text = $${paramIndex}
      RETURNING 
        id::text as id, name, description,
        department_id::text as "departmentId",
        team_lead_id::text as "teamLeadId",
        created_at as "createdAt", updated_at as "updatedAt"
    `, values);

    return { ...result.rows[0], members: [] };
  }

  /**
   * Delete a team and its members
   */
  async deleteTeam(tenantId: string, teamId: string): Promise<void> {
    const schemaName = await this.getSchemaName(tenantId);
    
    // Delete team members first (FK constraint)
    await this.pool.query(`
      DELETE FROM ${this.escapeIdentifier(schemaName)}."team_members"
      WHERE team_id::text = $1
    `, [teamId]);

    // Delete team
    await this.pool.query(`
      DELETE FROM ${this.escapeIdentifier(schemaName)}."teams"
      WHERE id::text = $1
    `, [teamId]);
  }

  /**
   * Count teams in a department
   */
  async countTeamsInDepartment(tenantId: string, departmentId: string): Promise<number> {
    const schemaName = await this.getSchemaName(tenantId);
    
    const result = await this.pool.query(`
      SELECT COUNT(*) as count 
      FROM ${this.escapeIdentifier(schemaName)}."teams"
      WHERE department_id::text = $1
    `, [departmentId]);

    return parseInt(result.rows[0].count);
  }

  // ==================== TEAM MEMBERS ====================

  /**
   * Get existing member IDs for a team
   */
  async getTeamMemberIds(tenantId: string, teamId: string): Promise<string[]> {
    const schemaName = await this.getSchemaName(tenantId);
    
    const result = await this.pool.query(`
      SELECT user_id::text as "userId" 
      FROM ${this.escapeIdentifier(schemaName)}."team_members"
      WHERE team_id::text = $1
    `, [teamId]);

    return result.rows.map(r => r.userId);
  }

  /**
   * Add a member to a team
   */
  async addTeamMember(tenantId: string, teamId: string, userId: string, role: string): Promise<void> {
    const schemaName = await this.getSchemaName(tenantId);
    
    await this.pool.query(`
      INSERT INTO ${this.escapeIdentifier(schemaName)}."team_members" 
        (user_id, team_id, role)
      VALUES ($1, $2, $3)
    `, [userId, teamId, role]);
  }

  /**
   * Check if a user is a member of a team
   */
  async isTeamMember(tenantId: string, teamId: string, userId: string): Promise<boolean> {
    const schemaName = await this.getSchemaName(tenantId);
    
    const result = await this.pool.query(`
      SELECT 1 FROM ${this.escapeIdentifier(schemaName)}."team_members"
      WHERE team_id::text = $1 AND user_id::text = $2
      LIMIT 1
    `, [teamId, userId]);

    return result.rows.length > 0;
  }

  /**
   * Remove a member from a team
   */
  async removeTeamMember(tenantId: string, teamId: string, userId: string): Promise<void> {
    const schemaName = await this.getSchemaName(tenantId);
    
    await this.pool.query(`
      DELETE FROM ${this.escapeIdentifier(schemaName)}."team_members"
      WHERE team_id::text = $1 AND user_id::text = $2
    `, [teamId, userId]);
  }

  // ==================== USERS ====================

  /**
   * Get users in a tenant (for assignment dropdowns)
   */
  async listTenantUsers(tenantId: string): Promise<TenantUser[]> {
    const schemaName = await this.getSchemaName(tenantId);
    
    // user_tenants.user_id might be uuid, public.users.id is varchar
    const result = await this.pool.query(`
      SELECT 
        u.id, u.first_name as "firstName", u.last_name as "lastName", u.email,
        ut.role
      FROM public."users" u
      INNER JOIN ${this.escapeIdentifier(schemaName)}."user_tenants" ut ON u.id = ut.user_id::text
      ORDER BY u.first_name, u.last_name
    `);

    return result.rows.map(u => ({
      ...u,
      fullName: `${u.firstName} ${u.lastName}`,
    }));
  }

  // ==================== AUDIT LOG ====================

  /**
   * Create an audit log entry
   * Note: audit_log table keeps tenant_id column even in tenant schema (NOT NULL constraint)
   */
  async createAuditLog(
    tenantId: string,
    actorUserId: string,
    action: string,
    metadata: Record<string, any>
  ): Promise<void> {
    const schemaName = await this.getSchemaName(tenantId);
    
    await this.pool.query(`
      INSERT INTO ${this.escapeIdentifier(schemaName)}."audit_log"
        (tenant_id, actor_user_id, action, metadata)
      VALUES ($1, $2, $3, $4)
    `, [tenantId, actorUserId, action, JSON.stringify(metadata)]);
  }

  /**
   * Get audit logs with pagination
   */
  async getAuditLogs(
    tenantId: string,
    options: { page?: number; pageSize?: number; action?: string; search?: string }
  ): Promise<{ logs: AuditLog[]; total: number; actions: string[] }> {
    const schemaName = await this.getSchemaName(tenantId);
    const page = Math.max(1, options.page || 1);
    const pageSize = Math.min(100, Math.max(1, options.pageSize || 20));
    const offset = (page - 1) * pageSize;

    // Build WHERE clause
    let whereClause = '1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (options.action && options.action !== 'all') {
      whereClause += ` AND action = $${paramIndex++}`;
      params.push(options.action);
    }

    if (options.search) {
      whereClause += ` AND (action ILIKE $${paramIndex} OR metadata::text ILIKE $${paramIndex})`;
      params.push(`%${options.search}%`);
      paramIndex++;
    }

    // Get total count
    const countResult = await this.pool.query(`
      SELECT COUNT(*) as total
      FROM ${this.escapeIdentifier(schemaName)}."audit_log"
      WHERE ${whereClause}
    `, params);

    const total = parseInt(countResult.rows[0].total);

    // Get paginated logs with user info
    const logsResult = await this.pool.query(`
      SELECT 
        al.id::text as id,
        al.actor_user_id::text as "actorUserId",
        u.first_name || ' ' || u.last_name as "actorName",
        u.email as "actorEmail",
        al.target_user_id::text as "targetUserId",
        al.action,
        al.metadata,
        al.ip_address as "ipAddress",
        al.user_agent as "userAgent",
        al.created_at as "createdAt"
      FROM ${this.escapeIdentifier(schemaName)}."audit_log" al
      LEFT JOIN public."users" u ON al.actor_user_id::text = u.id
      WHERE ${whereClause}
      ORDER BY al.created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex}
    `, [...params, pageSize, offset]);

    // Get unique actions for filter dropdown
    const actionsResult = await this.pool.query(`
      SELECT DISTINCT action
      FROM ${this.escapeIdentifier(schemaName)}."audit_log"
      ORDER BY action
    `);

    return {
      logs: logsResult.rows,
      total,
      actions: actionsResult.rows.map(r => r.action),
    };
  }

  // ==================== FULL ORG STRUCTURE ====================

  /**
   * Get full organizational structure with hierarchy
   */
  async getFullOrgStructure(tenantId: string): Promise<{
    departments: any[];
    teams: Team[];
    summary: { totalDepartments: number; totalTeams: number; totalMembers: number };
  }> {
    const departments = await this.listDepartments(tenantId);
    const teams = await this.listTeams(tenantId);

    // Build department hierarchy
    const departmentMap = new Map<string, any>();
    const rootDepartments: any[] = [];

    departments.forEach(dept => {
      departmentMap.set(dept.id, {
        ...dept,
        subdepartments: [],
        teams: teams.filter(t => t.departmentId === dept.id),
      });
    });

    departmentMap.forEach(dept => {
      if (dept.parentDepartmentId) {
        const parent = departmentMap.get(dept.parentDepartmentId);
        if (parent) {
          parent.subdepartments.push(dept);
        } else {
          rootDepartments.push(dept);
        }
      } else {
        rootDepartments.push(dept);
      }
    });

    const totalMembers = teams.reduce((sum, t) => sum + (t.members?.length || 0), 0);

    return {
      departments: rootDepartments,
      teams,
      summary: {
        totalDepartments: departments.length,
        totalTeams: teams.length,
        totalMembers,
      },
    };
  }
}

export const orgStructureService = new OrgStructureService();

