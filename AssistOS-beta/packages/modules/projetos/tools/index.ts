/**
 * Projetos Module AI Tools
 * 
 * Generic AI tools that work with ANY template configuration (Construction, Events, Consulting, or custom).
 * These tools operate on CORE entities only (projects, project_phases, project_resources, project_documents).
 * 
 * Tools:
 * 1. list_projects - List all projects with filtering
 * 2. create_project - Create a new project
 * 3. update_project_status - Update project status
 * 4. allocate_resources - Allocate resources to a project
 * 5. track_project_budget - Get budget overview
 * 6. generate_project_analytics - Generate analytics across all projects
 */

import type { ModuleTool } from '../../base/module.interface';
import { db } from '../../../../apps/api/db';
import { projects, projectResources, projectPhases, projectDocuments, clients } from '../../../../shared/schema';
import { eq, and, gte, lte, or, sql, sum, count } from 'drizzle-orm';

export const projetosTools: ModuleTool[] = [
  /**
   * Tool 1: list_projects
   * List all projects with filtering by status, priority, date range, client
   */
  {
    name: 'list_projects',
    description: 'List all projects with optional filters (status, priority, date range, client)',
    parameters: [
      {
        name: 'status',
        type: 'string',
        description: 'Filter by project status (planning, active, completed, cancelled, etc)',
        required: false
      },
      {
        name: 'priority',
        type: 'string',
        description: 'Filter by priority (Low, Medium, High, Critical)',
        required: false
      },
      {
        name: 'clientId',
        type: 'string',
        description: 'Filter by client (client ID)',
        required: false
      },
      {
        name: 'startDateFrom',
        type: 'string',
        description: 'Filter projects that start after this date (ISO format)',
        required: false
      },
      {
        name: 'startDateTo',
        type: 'string',
        description: 'Filter projects that start before this date (ISO format)',
        required: false
      },
      {
        name: 'limit',
        type: 'number',
        description: 'Maximum number of results',
        required: false,
        default: 50
      },
      {
        name: 'offset',
        type: 'number',
        description: 'Number of results to skip (pagination)',
        required: false,
        default: 0
      }
    ],
    execute: async (params: any, context) => {
      const { 
        status, 
        priority, 
        clientId, 
        startDateFrom, 
        startDateTo, 
        limit = 50, 
        offset = 0 
      } = params;
      
      const conditions: any[] = [
        eq(projects.tenantId, context.tenantId)
      ];
      
      if (status) {
        conditions.push(eq(projects.status, status));
      }
      
      if (priority) {
        conditions.push(eq(projects.priority, priority));
      }
      
      if (clientId) {
        conditions.push(eq(projects.clientId, clientId));
      }
      
      if (startDateFrom) {
        conditions.push(gte(projects.startDate, new Date(startDateFrom)));
      }
      
      if (startDateTo) {
        conditions.push(lte(projects.startDate, new Date(startDateTo)));
      }
      
      // ISSUE 3 FIX: Removed clientName (denormalized data) - use clientId only
      const projectsList = await db
        .select({
          id: projects.id,
          projectCode: projects.projectCode,
          name: projects.name,
          description: projects.description,
          status: projects.status,
          priority: projects.priority,
          clientId: projects.clientId,
          startDate: projects.startDate,
          endDate: projects.endDate,
          estimatedBudget: projects.estimatedBudget,
          actualCost: projects.actualCost,
          projectType: projects.projectType,
          tags: projects.tags,
          createdAt: projects.createdAt,
          updatedAt: projects.updatedAt
        })
        .from(projects)
        .where(and(...conditions))
        .limit(limit)
        .offset(offset);
      
      return { 
        projects: projectsList, 
        total: projectsList.length,
        limit,
        offset
      };
    }
  },
  
  /**
   * Tool 2: create_project
   * Create a new project (core entity)
   */
  {
    name: 'create_project',
    description: 'Create a new project with basic information. Validates project code uniqueness.',
    parameters: [
      {
        name: 'projectCode',
        type: 'string',
        description: 'Unique project code (e.g. PROJ-2024-001)',
        required: true
      },
      {
        name: 'name',
        type: 'string',
        description: 'Project name',
        required: true
      },
      {
        name: 'description',
        type: 'string',
        description: 'Project description',
        required: false
      },
      {
        name: 'clientId',
        type: 'string',
        description: 'Client ID associated with project',
        required: false
      },
      {
        name: 'startDate',
        type: 'string',
        description: 'Project start date (ISO format)',
        required: false
      },
      {
        name: 'endDate',
        type: 'string',
        description: 'Project end date (ISO format)',
        required: false
      },
      {
        name: 'estimatedBudget',
        type: 'number',
        description: 'Estimated project budget',
        required: false
      },
      {
        name: 'status',
        type: 'string',
        description: 'Project status (planning, active, completed, cancelled)',
        required: false,
        default: 'planning'
      },
      {
        name: 'priority',
        type: 'string',
        description: 'Project priority (Low, Medium, High, Critical)',
        required: false,
        default: 'Medium'
      },
      {
        name: 'projectType',
        type: 'string',
        description: 'Project type (Construction, Events, Consulting, etc)',
        required: false
      },
      {
        name: 'tags',
        type: 'string',
        description: 'Project tags (comma separated)',
        required: false
      },
      {
        name: 'notes',
        type: 'string',
        description: 'Additional notes about the project',
        required: false
      }
    ],
    execute: async (params: any, context) => {
      const { 
        projectCode, 
        name, 
        description, 
        clientId, 
        startDate, 
        endDate, 
        estimatedBudget,
        status = 'planning',
        priority = 'Medium',
        projectType,
        tags,
        notes
      } = params;
      
      // Validate projectCode uniqueness within tenant
      const existingProject = await db
        .select({ id: projects.id })
        .from(projects)
        .where(and(
          eq(projects.tenantId, context.tenantId),
          eq(projects.projectCode, projectCode)
        ))
        .limit(1);
      
      if (existingProject && existingProject.length > 0) {
        return {
          success: false,
          error: `Project code '${projectCode}' already exists. Please choose a unique code.`
        };
      }
      
      // Validate client exists if clientId provided
      if (clientId) {
        const clientResult = await db
          .select({ id: clients.id })
          .from(clients)
          .where(and(
            eq(clients.id, clientId),
            eq(clients.tenantId, context.tenantId)
          ))
          .limit(1);
        
        if (!clientResult || clientResult.length === 0) {
          return {
            success: false,
            error: `Client '${clientId}' not found. Check the client ID.`
          };
        }
      }
      
      try {
        const projectResult = await db
          .insert(projects)
          .values({
            tenantId: context.tenantId,
            projectCode,
            name,
            description: description || null,
            clientId: clientId || null,
            startDate: startDate ? new Date(startDate) : null,
            endDate: endDate ? new Date(endDate) : null,
            estimatedBudget: estimatedBudget ? estimatedBudget.toString() : null,
            actualCost: '0',
            status,
            priority,
            projectType: projectType || null,
            tags: tags || null,
            notes: notes || null,
            createdBy: context.userId
          })
          .returning();
        
        const project = Array.isArray(projectResult) ? projectResult[0] : projectResult;
        
        return {
          success: true,
          project: {
            id: project.id,
            projectCode: project.projectCode,
            name: project.name,
            status: project.status,
            priority: project.priority,
            estimatedBudget: project.estimatedBudget,
            startDate: project.startDate,
            endDate: project.endDate
          }
        };
      } catch (error: any) {
        console.error('[create_project] Database error:', error);
        return {
          success: false,
          error: `Error creating project: ${error.message || error}`
        };
      }
    }
  },
  
  /**
   * Tool 3: update_project_status
   * Update project status and track state transitions
   */
  {
    name: 'update_project_status',
    description: 'Update project status and record state transition',
    parameters: [
      {
        name: 'projectId',
        type: 'string',
        description: 'Project ID',
        required: true
      },
      {
        name: 'newStatus',
        type: 'string',
        description: 'New status (planning, active, completed, on-hold, cancelled)',
        required: true
      },
      {
        name: 'notes',
        type: 'string',
        description: 'Reason or notes about the status change',
        required: false
      }
    ],
    execute: async (params: any, context) => {
      const { projectId, newStatus, notes } = params;
      
      // Verify project exists and belongs to tenant
      const projectResult = await db
        .select({
          id: projects.id,
          status: projects.status,
          name: projects.name
        })
        .from(projects)
        .where(and(
          eq(projects.id, projectId),
          eq(projects.tenantId, context.tenantId)
        ))
        .limit(1);
      
      if (!projectResult || projectResult.length === 0) {
        return {
          success: false,
          error: `Project '${projectId}' not found.`
        };
      }
      
      const currentProject = projectResult[0];
      const oldStatus = currentProject.status;
      
      try {
        // Update project status
        const updateValues: any = {
          status: newStatus,
          updatedAt: new Date()
        };
        
        // If notes provided, append to project notes
        if (notes) {
          const statusChangeNote = `\n[${new Date().toISOString()}] Status changed from '${oldStatus}' to '${newStatus}': ${notes}`;
          updateValues.notes = sql`COALESCE(${projects.notes}, '') || ${statusChangeNote}`;
        }
        
        const updatedProjectResult = await db
          .update(projects)
          .set(updateValues)
          .where(and(
            eq(projects.id, projectId),
            eq(projects.tenantId, context.tenantId)
          ))
          .returning();
        
        const updatedProject = Array.isArray(updatedProjectResult) 
          ? updatedProjectResult[0] 
          : updatedProjectResult;
        
        return {
          success: true,
          project: {
            id: updatedProject.id,
            name: updatedProject.name,
            oldStatus,
            newStatus: updatedProject.status,
            updatedAt: updatedProject.updatedAt
          },
          message: `Project '${currentProject.name}' status changed from '${oldStatus}' to '${newStatus}'`
        };
      } catch (error: any) {
        console.error('[update_project_status] Database error:', error);
        return {
          success: false,
          error: `Error updating project status: ${error.message || error}`
        };
      }
    }
  },
  
  /**
   * Tool 4: allocate_resources
   * Allocate resources (human, equipment, material) to a project
   */
  {
    name: 'allocate_resources',
    description: 'Allocate resources (human, equipment, materials, external) to a project. Automatically calculates total cost.',
    parameters: [
      {
        name: 'projectId',
        type: 'string',
        description: 'Project ID',
        required: true
      },
      {
        name: 'resourceType',
        type: 'string',
        description: 'Resource type (Human, Equipment, Material, External)',
        required: true
      },
      {
        name: 'resourceName',
        type: 'string',
        description: 'Resource name (e.g. John Silva, Excavator, Cement, Consulting)',
        required: true
      },
      {
        name: 'quantity',
        type: 'number',
        description: 'Resource quantity',
        required: true
      },
      {
        name: 'unit',
        type: 'string',
        description: 'Unit (hours, days, units, kg, etc)',
        required: false
      },
      {
        name: 'costPerUnit',
        type: 'number',
        description: 'Cost per unit',
        required: false
      },
      {
        name: 'allocationDate',
        type: 'string',
        description: 'Allocation date (ISO format, default: today)',
        required: false
      }
    ],
    execute: async (params: any, context) => {
      const { 
        projectId, 
        resourceType, 
        resourceName, 
        quantity, 
        unit, 
        costPerUnit,
        allocationDate
      } = params;
      
      // Validate quantity is positive
      if (quantity <= 0) {
        return {
          success: false,
          error: `Invalid quantity: ${quantity}. Quantity must be greater than zero.`
        };
      }
      
      // Verify project exists and belongs to tenant
      const projectResult = await db
        .select({ 
          id: projects.id,
          name: projects.name
        })
        .from(projects)
        .where(and(
          eq(projects.id, projectId),
          eq(projects.tenantId, context.tenantId)
        ))
        .limit(1);
      
      if (!projectResult || projectResult.length === 0) {
        return {
          success: false,
          error: `Project '${projectId}' not found.`
        };
      }
      
      const project = projectResult[0];
      
      // Calculate total cost
      const totalCost = costPerUnit ? (quantity * costPerUnit) : 0;
      
      try {
        // Convert to ISO date string (YYYY-MM-DD) for Drizzle date type
        const allocationDateStr = allocationDate 
          ? new Date(allocationDate).toISOString().split('T')[0]
          : new Date().toISOString().split('T')[0];
        
        const resourceResult = await db
          .insert(projectResources)
          .values({
            tenantId: context.tenantId,
            projectId,
            resourceType,
            resourceName,
            quantity: quantity.toString(),
            unit: unit || null,
            costPerUnit: costPerUnit ? costPerUnit.toString() : null,
            totalCost: totalCost.toString(),
            allocationDate: allocationDateStr,
            status: 'Allocated'
          })
          .returning();
        
        const resource = Array.isArray(resourceResult) ? resourceResult[0] : resourceResult;
        
        return {
          success: true,
          resource: {
            id: resource.id,
            projectId: resource.projectId,
            projectName: project.name,
            resourceType: resource.resourceType,
            resourceName: resource.resourceName,
            quantity: resource.quantity,
            unit: resource.unit,
            costPerUnit: resource.costPerUnit,
            totalCost: resource.totalCost,
            allocationDate: resource.allocationDate
          },
          message: `Resource '${resourceName}' (${resourceType}) allocated to project '${project.name}'`
        };
      } catch (error: any) {
        console.error('[allocate_resources] Database error:', error);
        return {
          success: false,
          error: `Error allocating resource: ${error.message || error}`
        };
      }
    }
  },
  
  /**
   * Tool 5: track_project_budget
   * Get budget overview for a project (estimated vs actual)
   */
  {
    name: 'track_project_budget',
    description: 'Get complete project budget overview: estimated vs actual, allocated resources, variance and utilization percentage',
    parameters: [
      {
        name: 'projectId',
        type: 'string',
        description: 'Project ID',
        required: true
      }
    ],
    execute: async (params: any, context) => {
      const { projectId } = params;
      
      // Get project budget data
      const projectResult = await db
        .select({
          id: projects.id,
          name: projects.name,
          projectCode: projects.projectCode,
          estimatedBudget: projects.estimatedBudget,
          actualCost: projects.actualCost,
          status: projects.status
        })
        .from(projects)
        .where(and(
          eq(projects.id, projectId),
          eq(projects.tenantId, context.tenantId)
        ))
        .limit(1);
      
      if (!projectResult || projectResult.length === 0) {
        return {
          success: false,
          error: `Project '${projectId}' not found.`
        };
      }
      
      const project = projectResult[0];
      
      // Get allocated resources cost
      const resourcesResult = await db
        .select({
          totalResourcesCost: sum(projectResources.totalCost)
        })
        .from(projectResources)
        .where(and(
          eq(projectResources.projectId, projectId),
          eq(projectResources.tenantId, context.tenantId)
        ));
      
      const allocatedResourcesCost = resourcesResult[0]?.totalResourcesCost 
        ? parseFloat(resourcesResult[0].totalResourcesCost as string) 
        : 0;
      
      const estimatedBudget = project.estimatedBudget 
        ? parseFloat(project.estimatedBudget as string) 
        : 0;
        
      const actualCost = project.actualCost 
        ? parseFloat(project.actualCost as string) 
        : 0;
      
      const variance = estimatedBudget - actualCost;
      const utilizationPercentage = estimatedBudget > 0 
        ? (actualCost / estimatedBudget) * 100 
        : 0;
      
      return {
        success: true,
        budget: {
          projectId: project.id,
          projectName: project.name,
          projectCode: project.projectCode,
          status: project.status,
          estimatedBudget,
          actualCost,
          allocatedResourcesCost,
          variance,
          utilizationPercentage: Math.round(utilizationPercentage * 100) / 100,
          isOverBudget: actualCost > estimatedBudget,
          budgetRemaining: estimatedBudget - actualCost
        }
      };
    }
  },
  
  /**
   * Tool 6: generate_project_analytics
   * Generate analytics across all projects (dashboards, reports)
   */
  {
    name: 'generate_project_analytics',
    description: 'Generate analytics and aggregated metrics for all projects: total, by status, by priority, budgets, average duration',
    parameters: [
      {
        name: 'groupBy',
        type: 'string',
        description: 'Group by (status, priority, projectType)',
        required: false
      },
      {
        name: 'dateRange',
        type: 'object',
        description: 'Date range to filter projects { from: date, to: date }',
        required: false
      }
    ],
    execute: async (params: any, context) => {
      const { groupBy, dateRange } = params;
      
      const conditions: any[] = [
        eq(projects.tenantId, context.tenantId)
      ];
      
      // Apply date range filter if provided
      if (dateRange?.from) {
        conditions.push(gte(projects.startDate, new Date(dateRange.from)));
      }
      if (dateRange?.to) {
        conditions.push(lte(projects.startDate, new Date(dateRange.to)));
      }
      
      // Get all projects matching criteria
      const allProjects = await db
        .select({
          id: projects.id,
          status: projects.status,
          priority: projects.priority,
          projectType: projects.projectType,
          estimatedBudget: projects.estimatedBudget,
          actualCost: projects.actualCost,
          startDate: projects.startDate,
          endDate: projects.endDate
        })
        .from(projects)
        .where(and(...conditions));
      
      // Calculate analytics
      const totalProjects = allProjects.length;
      
      // Group by status
      const projectsByStatus: Record<string, number> = {};
      allProjects.forEach(p => {
        const status = p.status || 'unknown';
        projectsByStatus[status] = (projectsByStatus[status] || 0) + 1;
      });
      
      // Group by priority
      const projectsByPriority: Record<string, number> = {};
      allProjects.forEach(p => {
        const priority = p.priority || 'Medium';
        projectsByPriority[priority] = (projectsByPriority[priority] || 0) + 1;
      });
      
      // Group by project type if requested
      let projectsByType: Record<string, number> | undefined;
      if (groupBy === 'projectType') {
        projectsByType = {};
        allProjects.forEach(p => {
          const type = p.projectType || 'Other';
          projectsByType![type] = (projectsByType![type] || 0) + 1;
        });
      }
      
      // Calculate budget totals
      let totalBudget = 0;
      let totalActualCost = 0;
      allProjects.forEach(p => {
        if (p.estimatedBudget) {
          totalBudget += parseFloat(p.estimatedBudget as string);
        }
        if (p.actualCost) {
          totalActualCost += parseFloat(p.actualCost as string);
        }
      });
      
      // Calculate average project duration
      let totalDurationDays = 0;
      let projectsWithDuration = 0;
      allProjects.forEach(p => {
        if (p.startDate && p.endDate) {
          const duration = Math.ceil(
            (new Date(p.endDate).getTime() - new Date(p.startDate).getTime()) / (1000 * 60 * 60 * 24)
          );
          totalDurationDays += duration;
          projectsWithDuration++;
        }
      });
      
      const averageProjectDuration = projectsWithDuration > 0 
        ? Math.round(totalDurationDays / projectsWithDuration) 
        : 0;
      
      const analytics: any = {
        totalProjects,
        projectsByStatus,
        projectsByPriority,
        totalBudget: Math.round(totalBudget * 100) / 100,
        totalActualCost: Math.round(totalActualCost * 100) / 100,
        budgetUtilization: totalBudget > 0 
          ? Math.round((totalActualCost / totalBudget) * 10000) / 100 
          : 0,
        averageProjectDuration,
        dateRange: dateRange || null
      };
      
      if (projectsByType) {
        analytics.projectsByType = projectsByType;
      }
      
      return {
        success: true,
        analytics
      };
    }
  }
];
