/**
 * Project Sub-Items Routes
 * 
 * CRUD endpoints for all project sub-entities:
 * - Menu Items (project_menu_items)
 * - Materials/Resources (project_resources)
 * - Milestones (project_milestones)
 * - Team Members (project_team_members)
 * - Tasks/Checklist (project_tasks)
 * - Costs/Expenses (project_expenses)
 */

import { Router, Request, Response } from 'express';
import { db } from '../../../../apps/api/db';
import { 
  projectMenuItems, 
  projectResources, 
  projectMilestones, 
  projectTeamMembers, 
  projectTasks, 
  projectExpenses,
  products,
  users
} from '../../../../shared/schema';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';

const router = Router();

// ============================================================================
// MENU ITEMS
// ============================================================================

/**
 * GET /api/projetos/projects/:projectId/menu-items
 * List all menu items for a project
 */
router.get('/projects/:projectId/menu-items', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const { projectId } = req.params;
    const environment = (req.query.env as string) || 'production';

    if (!tenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const items = await db
      .select({
        id: projectMenuItems.id,
        projectId: projectMenuItems.projectId,
        productId: projectMenuItems.productId,
        productName: products.name,
        productCode: products.code,
        category: projectMenuItems.category,
        quantity: projectMenuItems.quantity,
        unitPrice: projectMenuItems.unitPrice,
        notes: projectMenuItems.notes,
        displayOrder: projectMenuItems.displayOrder,
        createdAt: projectMenuItems.createdAt,
      })
      .from(projectMenuItems)
      .leftJoin(products, eq(projectMenuItems.productId, products.id))
      .where(
        and(
          eq(projectMenuItems.tenantId, tenantId),
          eq(projectMenuItems.projectId, projectId),
          eq(projectMenuItems.environment, environment)
        )
      )
      .orderBy(projectMenuItems.displayOrder);

    res.json({ items });
  } catch (error: any) {
    console.error('[Projetos] Error fetching menu items:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/projetos/projects/:projectId/menu-items
 * Add a menu item to a project
 */
router.post('/projects/:projectId/menu-items', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const { projectId } = req.params;
    const environment = req.body.environment || 'production';

    if (!tenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const schema = z.object({
      productId: z.string().min(1, 'Product is required'),
      category: z.string().optional(),
      quantity: z.number().positive().optional(),
      unitPrice: z.number().optional(),
      notes: z.string().optional(),
      displayOrder: z.number().optional(),
    });

    const data = schema.parse(req.body);

    const [item] = await db
      .insert(projectMenuItems)
      .values({
        tenantId,
        projectId,
        environment,
        productId: data.productId,
        category: data.category || 'main',
        quantity: String(data.quantity || 1),
        unitPrice: data.unitPrice ? String(data.unitPrice) : null,
        notes: data.notes,
        displayOrder: data.displayOrder || 0,
      })
      .returning();

    res.status(201).json({ item });
  } catch (error: any) {
    console.error('[Projetos] Error creating menu item:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/projetos/projects/:projectId/menu-items/:itemId
 * Remove a menu item from a project
 */
router.delete('/projects/:projectId/menu-items/:itemId', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const { itemId } = req.params;

    if (!tenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    await db
      .delete(projectMenuItems)
      .where(
        and(
          eq(projectMenuItems.id, itemId),
          eq(projectMenuItems.tenantId, tenantId)
        )
      );

    res.json({ success: true });
  } catch (error: any) {
    console.error('[Projetos] Error deleting menu item:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// MATERIALS / RESOURCES
// ============================================================================

/**
 * GET /api/projetos/projects/:projectId/resources
 * List all resources/materials for a project
 */
router.get('/projects/:projectId/resources', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const { projectId } = req.params;
    const environment = (req.query.env as string) || 'production';

    if (!tenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const resources = await db
      .select()
      .from(projectResources)
      .where(
        and(
          eq(projectResources.tenantId, tenantId),
          eq(projectResources.projectId, projectId),
          eq(projectResources.environment, environment)
        )
      );

    res.json({ resources });
  } catch (error: any) {
    console.error('[Projetos] Error fetching resources:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/projetos/projects/:projectId/resources
 * Add a resource/material to a project
 */
router.post('/projects/:projectId/resources', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const { projectId } = req.params;
    const environment = req.body.environment || 'production';

    if (!tenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const schema = z.object({
      resourceType: z.string().min(1, 'Resource type is required'),
      resourceName: z.string().min(1, 'Resource name is required'),
      quantity: z.number().optional(),
      unit: z.string().optional(),
      costPerUnit: z.number().optional(),
      allocationDate: z.string().optional(),
      releaseDate: z.string().optional(),
      status: z.string().optional(),
    });

    const data = schema.parse(req.body);
    const totalCost = (data.quantity || 0) * (data.costPerUnit || 0);

    const [resource] = await db
      .insert(projectResources)
      .values({
        tenantId,
        projectId,
        environment,
        resourceType: data.resourceType,
        resourceName: data.resourceName,
        quantity: data.quantity ? String(data.quantity) : null,
        unit: data.unit,
        costPerUnit: data.costPerUnit ? String(data.costPerUnit) : null,
        totalCost: totalCost ? String(totalCost) : null,
        allocationDate: data.allocationDate,
        releaseDate: data.releaseDate,
        status: data.status || 'Allocated',
      })
      .returning();

    res.status(201).json({ resource });
  } catch (error: any) {
    console.error('[Projetos] Error creating resource:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/projetos/projects/:projectId/resources/:resourceId
 * Remove a resource from a project
 */
router.delete('/projects/:projectId/resources/:resourceId', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const { resourceId } = req.params;

    if (!tenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    await db
      .delete(projectResources)
      .where(
        and(
          eq(projectResources.id, resourceId),
          eq(projectResources.tenantId, tenantId)
        )
      );

    res.json({ success: true });
  } catch (error: any) {
    console.error('[Projetos] Error deleting resource:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// MILESTONES / TIMELINE
// ============================================================================

/**
 * GET /api/projetos/projects/:projectId/milestones
 * List all milestones for a project
 */
router.get('/projects/:projectId/milestones', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const { projectId } = req.params;
    const environment = (req.query.env as string) || 'production';

    if (!tenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const milestones = await db
      .select()
      .from(projectMilestones)
      .where(
        and(
          eq(projectMilestones.tenantId, tenantId),
          eq(projectMilestones.projectId, projectId),
          eq(projectMilestones.environment, environment)
        )
      )
      .orderBy(projectMilestones.dueDate);

    res.json({ milestones });
  } catch (error: any) {
    console.error('[Projetos] Error fetching milestones:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/projetos/projects/:projectId/milestones
 * Add a milestone to a project
 */
router.post('/projects/:projectId/milestones', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const { projectId } = req.params;
    const environment = req.body.environment || 'production';

    if (!tenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const schema = z.object({
      name: z.string().min(1, 'Name is required'),
      description: z.string().optional(),
      dueDate: z.string().min(1, 'Due date is required'),
      status: z.string().optional(),
    });

    const data = schema.parse(req.body);

    const [milestone] = await db
      .insert(projectMilestones)
      .values({
        tenantId,
        projectId,
        environment,
        name: data.name,
        description: data.description,
        dueDate: new Date(data.dueDate),
        status: data.status || 'pending',
      })
      .returning();

    res.status(201).json({ milestone });
  } catch (error: any) {
    console.error('[Projetos] Error creating milestone:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /api/projetos/projects/:projectId/milestones/:milestoneId
 * Update a milestone
 */
router.patch('/projects/:projectId/milestones/:milestoneId', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const { milestoneId } = req.params;

    if (!tenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const updateData: any = { updatedAt: new Date() };
    
    if (req.body.name) updateData.name = req.body.name;
    if (req.body.description !== undefined) updateData.description = req.body.description;
    if (req.body.dueDate) updateData.dueDate = new Date(req.body.dueDate);
    if (req.body.status) updateData.status = req.body.status;
    if (req.body.completedAt) updateData.completedAt = new Date(req.body.completedAt);

    const [milestone] = await db
      .update(projectMilestones)
      .set(updateData)
      .where(
        and(
          eq(projectMilestones.id, milestoneId),
          eq(projectMilestones.tenantId, tenantId)
        )
      )
      .returning();

    res.json({ milestone });
  } catch (error: any) {
    console.error('[Projetos] Error updating milestone:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/projetos/projects/:projectId/milestones/:milestoneId
 * Remove a milestone from a project
 */
router.delete('/projects/:projectId/milestones/:milestoneId', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const { milestoneId } = req.params;

    if (!tenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    await db
      .delete(projectMilestones)
      .where(
        and(
          eq(projectMilestones.id, milestoneId),
          eq(projectMilestones.tenantId, tenantId)
        )
      );

    res.json({ success: true });
  } catch (error: any) {
    console.error('[Projetos] Error deleting milestone:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// TEAM MEMBERS
// ============================================================================

/**
 * GET /api/projetos/projects/:projectId/team
 * List all team members for a project
 */
router.get('/projects/:projectId/team', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const { projectId } = req.params;
    const environment = (req.query.env as string) || 'production';

    if (!tenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const members = await db
      .select({
        id: projectTeamMembers.id,
        projectId: projectTeamMembers.projectId,
        userId: projectTeamMembers.userId,
        userName: sql<string>`${users.firstName} || ' ' || ${users.lastName}`,
        userEmail: users.email,
        role: projectTeamMembers.role,
        hourlyRate: projectTeamMembers.hourlyRate,
        canApproveTimeEntries: projectTeamMembers.canApproveTimeEntries,
        canApproveExpenses: projectTeamMembers.canApproveExpenses,
        joinedAt: projectTeamMembers.joinedAt,
        leftAt: projectTeamMembers.leftAt,
        createdAt: projectTeamMembers.createdAt,
      })
      .from(projectTeamMembers)
      .leftJoin(users, eq(projectTeamMembers.userId, users.id))
      .where(
        and(
          eq(projectTeamMembers.tenantId, tenantId),
          eq(projectTeamMembers.projectId, projectId),
          eq(projectTeamMembers.environment, environment)
        )
      );

    res.json({ members });
  } catch (error: any) {
    console.error('[Projetos] Error fetching team members:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/projetos/projects/:projectId/team
 * Add a team member to a project
 */
router.post('/projects/:projectId/team', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const { projectId } = req.params;
    const environment = req.body.environment || 'production';

    if (!tenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const schema = z.object({
      userId: z.string().min(1, 'User is required'),
      role: z.string().min(1, 'Role is required'),
      hourlyRate: z.number().optional(),
      canApproveTimeEntries: z.boolean().optional(),
      canApproveExpenses: z.boolean().optional(),
    });

    const data = schema.parse(req.body);

    const [member] = await db
      .insert(projectTeamMembers)
      .values({
        tenantId,
        projectId,
        environment,
        userId: data.userId,
        role: data.role,
        hourlyRate: data.hourlyRate ? String(data.hourlyRate) : null,
        canApproveTimeEntries: data.canApproveTimeEntries || false,
        canApproveExpenses: data.canApproveExpenses || false,
      })
      .returning();

    res.status(201).json({ member });
  } catch (error: any) {
    console.error('[Projetos] Error adding team member:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/projetos/projects/:projectId/team/:memberId
 * Remove a team member from a project
 */
router.delete('/projects/:projectId/team/:memberId', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const { memberId } = req.params;

    if (!tenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    await db
      .delete(projectTeamMembers)
      .where(
        and(
          eq(projectTeamMembers.id, memberId),
          eq(projectTeamMembers.tenantId, tenantId)
        )
      );

    res.json({ success: true });
  } catch (error: any) {
    console.error('[Projetos] Error removing team member:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// TASKS / CHECKLIST
// ============================================================================

/**
 * GET /api/projetos/projects/:projectId/tasks
 * List all tasks for a project
 */
router.get('/projects/:projectId/tasks', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const { projectId } = req.params;
    const environment = (req.query.env as string) || 'production';

    if (!tenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const tasks = await db
      .select({
        id: projectTasks.id,
        projectId: projectTasks.projectId,
        name: projectTasks.name,
        description: projectTasks.description,
        status: projectTasks.status,
        priority: projectTasks.priority,
        taskOrder: projectTasks.taskOrder,
        assignedTo: projectTasks.assignedTo,
        assignedToName: sql<string>`${users.firstName} || ' ' || ${users.lastName}`,
        startDate: projectTasks.startDate,
        dueDate: projectTasks.dueDate,
        completedAt: projectTasks.completedAt,
        estimatedHours: projectTasks.estimatedHours,
        actualHours: projectTasks.actualHours,
        createdAt: projectTasks.createdAt,
      })
      .from(projectTasks)
      .leftJoin(users, eq(projectTasks.assignedTo, users.id))
      .where(
        and(
          eq(projectTasks.tenantId, tenantId),
          eq(projectTasks.projectId, projectId),
          eq(projectTasks.environment, environment)
        )
      )
      .orderBy(projectTasks.taskOrder);

    res.json({ tasks });
  } catch (error: any) {
    console.error('[Projetos] Error fetching tasks:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/projetos/projects/:projectId/tasks
 * Add a task to a project
 */
router.post('/projects/:projectId/tasks', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const { projectId } = req.params;
    const environment = req.body.environment || 'production';

    if (!tenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const schema = z.object({
      name: z.string().min(1, 'Task name is required'),
      description: z.string().optional(),
      status: z.string().optional(),
      priority: z.string().optional(),
      assignedTo: z.string().optional(),
      dueDate: z.string().optional(),
      estimatedHours: z.number().optional(),
    });

    const data = schema.parse(req.body);

    const [task] = await db
      .insert(projectTasks)
      .values({
        tenantId,
        projectId,
        environment,
        name: data.name,
        description: data.description,
        status: data.status || 'todo',
        priority: data.priority || 'medium',
        assignedTo: data.assignedTo || null,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        estimatedHours: data.estimatedHours ? String(data.estimatedHours) : null,
      })
      .returning();

    res.status(201).json({ task });
  } catch (error: any) {
    console.error('[Projetos] Error creating task:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /api/projetos/projects/:projectId/tasks/:taskId
 * Update a task
 */
router.patch('/projects/:projectId/tasks/:taskId', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const { taskId } = req.params;

    if (!tenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const updateData: any = { updatedAt: new Date() };
    
    if (req.body.name) updateData.name = req.body.name;
    if (req.body.description !== undefined) updateData.description = req.body.description;
    if (req.body.status) {
      updateData.status = req.body.status;
      if (req.body.status === 'done' || req.body.status === 'completed') {
        updateData.completedAt = new Date();
      }
    }
    if (req.body.priority) updateData.priority = req.body.priority;
    if (req.body.assignedTo !== undefined) updateData.assignedTo = req.body.assignedTo || null;
    if (req.body.dueDate) updateData.dueDate = new Date(req.body.dueDate);
    if (req.body.estimatedHours !== undefined) updateData.estimatedHours = req.body.estimatedHours ? String(req.body.estimatedHours) : null;
    if (req.body.actualHours !== undefined) updateData.actualHours = req.body.actualHours ? String(req.body.actualHours) : null;

    const [task] = await db
      .update(projectTasks)
      .set(updateData)
      .where(
        and(
          eq(projectTasks.id, taskId),
          eq(projectTasks.tenantId, tenantId)
        )
      )
      .returning();

    res.json({ task });
  } catch (error: any) {
    console.error('[Projetos] Error updating task:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/projetos/projects/:projectId/tasks/:taskId
 * Remove a task from a project
 */
router.delete('/projects/:projectId/tasks/:taskId', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const { taskId } = req.params;

    if (!tenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    await db
      .delete(projectTasks)
      .where(
        and(
          eq(projectTasks.id, taskId),
          eq(projectTasks.tenantId, tenantId)
        )
      );

    res.json({ success: true });
  } catch (error: any) {
    console.error('[Projetos] Error deleting task:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// COSTS / EXPENSES
// ============================================================================

/**
 * GET /api/projetos/projects/:projectId/expenses
 * List all expenses for a project
 */
router.get('/projects/:projectId/expenses', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const { projectId } = req.params;
    const environment = (req.query.env as string) || 'production';

    if (!tenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const expenses = await db
      .select({
        id: projectExpenses.id,
        projectId: projectExpenses.projectId,
        userId: projectExpenses.userId,
        userName: sql<string>`${users.firstName} || ' ' || ${users.lastName}`,
        expenseDate: projectExpenses.expenseDate,
        amount: projectExpenses.amount,
        currency: projectExpenses.currency,
        category: projectExpenses.category,
        description: projectExpenses.description,
        receiptUrl: projectExpenses.receiptUrl,
        status: projectExpenses.status,
        createdAt: projectExpenses.createdAt,
      })
      .from(projectExpenses)
      .leftJoin(users, eq(projectExpenses.userId, users.id))
      .where(
        and(
          eq(projectExpenses.tenantId, tenantId),
          eq(projectExpenses.projectId, projectId),
          eq(projectExpenses.environment, environment)
        )
      )
      .orderBy(projectExpenses.expenseDate);

    res.json({ expenses });
  } catch (error: any) {
    console.error('[Projetos] Error fetching expenses:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/projetos/projects/:projectId/expenses
 * Add an expense to a project
 */
router.post('/projects/:projectId/expenses', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).userId;
    const { projectId } = req.params;
    const environment = req.body.environment || 'production';

    if (!tenantId || !userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const schema = z.object({
      expenseDate: z.string().min(1, 'Date is required'),
      amount: z.number().positive('Amount must be positive'),
      currency: z.string().optional(),
      category: z.string().min(1, 'Category is required'),
      description: z.string().optional(),
      receiptUrl: z.string().optional(),
    });

    const data = schema.parse(req.body);

    const [expense] = await db
      .insert(projectExpenses)
      .values({
        tenantId,
        projectId,
        environment,
        userId,
        expenseDate: new Date(data.expenseDate),
        amount: String(data.amount),
        currency: data.currency || 'EUR',
        category: data.category,
        description: data.description,
        receiptUrl: data.receiptUrl,
        status: 'pending',
      })
      .returning();

    res.status(201).json({ expense });
  } catch (error: any) {
    console.error('[Projetos] Error creating expense:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/projetos/projects/:projectId/expenses/:expenseId
 * Remove an expense from a project
 */
router.delete('/projects/:projectId/expenses/:expenseId', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const { expenseId } = req.params;

    if (!tenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    await db
      .delete(projectExpenses)
      .where(
        and(
          eq(projectExpenses.id, expenseId),
          eq(projectExpenses.tenantId, tenantId)
        )
      );

    res.json({ success: true });
  } catch (error: any) {
    console.error('[Projetos] Error deleting expense:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// PRODUCT SEARCH (for dialogs)
// ============================================================================

/**
 * GET /api/projetos/products/search
 * Search products for menu item selection
 */
router.get('/products/search', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const search = req.query.q as string || '';
    const environment = (req.query.env as string) || 'production';

    if (!tenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const productList = await db
      .select({
        id: products.id,
        code: products.code,
        name: products.name,
        price: products.price,
        itemType: products.itemType,
      })
      .from(products)
      .where(
        and(
          eq(products.tenantId, tenantId),
          eq(products.environment, environment),
          search ? sql`(${products.name} ILIKE ${`%${search}%`} OR ${products.code} ILIKE ${`%${search}%`})` : sql`1=1`
        )
      )
      .limit(50);

    res.json({ products: productList });
  } catch (error: any) {
    console.error('[Projetos] Error searching products:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/projetos/users/search
 * Search users for team member and task assignment
 */
router.get('/users/search', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const search = req.query.q as string || '';

    if (!tenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userList = await db
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
      })
      .from(users)
      .where(
        and(
          eq(users.tenantId, tenantId),
          search ? sql`(${users.firstName} ILIKE ${`%${search}%`} OR ${users.lastName} ILIKE ${`%${search}%`} OR ${users.email} ILIKE ${`%${search}%`})` : sql`1=1`
        )
      )
      .limit(50);

    res.json({ users: userList });
  } catch (error: any) {
    console.error('[Projetos] Error searching users:', error);
    res.status(500).json({ error: error.message });
  }
});

export { router as projectSubItemsRoutes };
