/**
 * AssistBuild Workflow Service
 * CRUD operations for workflow definitions
 */

import { db } from '../../db.js';
import { 
  assistbuildWorkflows,
  assistbuildExecutions,
  assistbuildExecutionLogs,
} from '../../../../shared/schema.js';
import { eq, and, desc, sql } from 'drizzle-orm';
import type {
  AssistBuildWorkflow,
  CreateWorkflowRequest,
  UpdateWorkflowRequest,
  ListWorkflowsQuery,
  WorkflowStatus,
} from './types.js';
import { ValidationService } from './validation.service.js';

export class WorkflowService {
  /**
   * Create a new workflow
   */
  static async create(
    data: CreateWorkflowRequest & { createdBy: string; tenantId: string; status?: string }
  ): Promise<AssistBuildWorkflow> {
    // Only validate strictly for published workflows, allow drafts with minimal validation
    const isDraft = !data.status || data.status === 'draft';
    
    if (!isDraft) {
      const validation = ValidationService.validateWorkflow(data.definition);
      if (!validation.valid) {
        throw new Error(`Invalid workflow definition: ${validation.errors.join(', ')}`);
      }
    } else {
      // Minimal validation for drafts - just check for at least one node
      if (!data.definition.nodes || data.definition.nodes.length === 0) {
        throw new Error('Workflow must have at least one node');
      }
    }

    // Determine trigger type from nodes
    const hasTrigger = data.definition?.nodes?.find(
      (n: any) => n.type === 'manual_trigger' || n.type === 'schedule_trigger'
    );
    const triggerType = hasTrigger?.type === 'schedule_trigger' ? 'scheduled' : 'manual';

    const [workflow] = await db
      .insert(assistbuildWorkflows)
      .values({
        name: data.name,
        description: data.description,
        definition: data.definition,
        environment: data.environment || 'sandbox',
        status: 'draft',
        triggerType,
        createdBy: data.createdBy,
        tenantId: data.tenantId,
      })
      .returning();

    return workflow;
  }

  /**
   * List workflows for a tenant
   */
  static async list(
    tenantId: string,
    query: ListWorkflowsQuery = {}
  ): Promise<{ workflows: AssistBuildWorkflow[]; total: number }> {
    const { status, environment, page = 1, limit = 50 } = query;
    const offset = (page - 1) * limit;

    // Build where conditions
    const conditions = [eq(assistbuildWorkflows.tenantId, tenantId)];
    
    if (status) {
      conditions.push(eq(assistbuildWorkflows.status, status));
    }
    
    if (environment) {
      conditions.push(eq(assistbuildWorkflows.environment, environment));
    }

    // Get workflows
    const workflows = await db
      .select()
      .from(assistbuildWorkflows)
      .where(and(...conditions))
      .orderBy(desc(assistbuildWorkflows.createdAt))
      .limit(limit)
      .offset(offset);

    // Get total count
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(assistbuildWorkflows)
      .where(and(...conditions));

    return {
      workflows,
      total: count,
    };
  }

  /**
   * Get a single workflow by ID
   */
  static async get(
    id: string,
    tenantId: string
  ): Promise<AssistBuildWorkflow | null> {
    const [workflow] = await db
      .select()
      .from(assistbuildWorkflows)
      .where(
        and(
          eq(assistbuildWorkflows.id, id),
          eq(assistbuildWorkflows.tenantId, tenantId)
        )
      )
      .limit(1);

    return workflow || null;
  }

  /**
   * Update a workflow
   */
  static async update(
    id: string,
    tenantId: string,
    data: UpdateWorkflowRequest
  ): Promise<AssistBuildWorkflow> {
    // Get existing workflow
    const existing = await this.get(id, tenantId);
    if (!existing) {
      throw new Error('Workflow not found');
    }

    // Allow status updates (draft -> published)
    const isPublishing = data.status === 'published' && existing.status === 'draft';
    
    // Cannot update published workflows except for publishing drafts
    if (existing.status === 'published' && !isPublishing) {
      throw new Error('Cannot update published workflow. Create a new version instead.');
    }

    // Validate definition if provided or if publishing
    if (data.definition || isPublishing) {
      const definitionToValidate = data.definition || existing.definition;
      const validation = ValidationService.validateWorkflow(definitionToValidate as any);
      if (!validation.valid) {
        throw new Error(`Invalid workflow definition: ${validation.errors.join(', ')}`);
      }
    }

    // Build update object
    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.definition !== undefined) updateData.definition = data.definition;
    if (data.status !== undefined) {
      updateData.status = data.status;
      if (data.status === 'published') {
        updateData.publishedAt = new Date();
      }
    }

    const [updated] = await db
      .update(assistbuildWorkflows)
      .set(updateData)
      .where(
        and(
          eq(assistbuildWorkflows.id, id),
          eq(assistbuildWorkflows.tenantId, tenantId)
        )
      )
      .returning();

    return updated;
  }

  /**
   * Delete a workflow
   */
  static async delete(id: string, tenantId: string): Promise<boolean> {
    const workflow = await this.get(id, tenantId);
    if (!workflow) {
      return false;
    }

    // Cannot delete published workflows
    if (workflow.status === 'published') {
      throw new Error('Cannot delete published workflow. Archive it first.');
    }

    await db
      .delete(assistbuildWorkflows)
      .where(
        and(
          eq(assistbuildWorkflows.id, id),
          eq(assistbuildWorkflows.tenantId, tenantId)
        )
      );

    return true;
  }

  /**
   * Publish a workflow (make it live)
   */
  static async publish(id: string, tenantId: string): Promise<AssistBuildWorkflow> {
    const workflow = await this.get(id, tenantId);
    if (!workflow) {
      throw new Error('Workflow not found');
    }

    if (workflow.status === 'published') {
      throw new Error('Workflow is already published');
    }

    // Validate before publishing
    const validation = ValidationService.validateWorkflow(workflow.definition as any);
    if (!validation.valid) {
      throw new Error(`Cannot publish invalid workflow: ${validation.errors.join(', ')}`);
    }

    const [updated] = await db
      .update(assistbuildWorkflows)
      .set({
        status: 'published',
        publishedAt: new Date(),
      })
      .where(
        and(
          eq(assistbuildWorkflows.id, id),
          eq(assistbuildWorkflows.tenantId, tenantId)
        )
      )
      .returning();

    return updated;
  }

  /**
   * Archive a workflow (soft delete)
   */
  static async archive(id: string, tenantId: string): Promise<AssistBuildWorkflow> {
    const workflow = await this.get(id, tenantId);
    if (!workflow) {
      throw new Error('Workflow not found');
    }

    const [updated] = await db
      .update(assistbuildWorkflows)
      .set({
        status: 'archived',
      })
      .where(
        and(
          eq(assistbuildWorkflows.id, id),
          eq(assistbuildWorkflows.tenantId, tenantId)
        )
      )
      .returning();

    return updated;
  }

  /**
   * Duplicate a workflow (create a copy)
   */
  static async duplicate(
    id: string,
    tenantId: string,
    userId: string,
    newName?: string
  ): Promise<AssistBuildWorkflow> {
    const original = await this.get(id, tenantId);
    if (!original) {
      throw new Error('Workflow not found');
    }

    const [duplicate] = await db
      .insert(assistbuildWorkflows)
      .values({
        name: newName || `${original.name} (Copy)`,
        description: original.description,
        definition: original.definition,
        environment: 'sandbox', // Always start in sandbox
        status: 'draft',
        triggerType: original.triggerType,
        triggerConfig: original.triggerConfig,
        createdBy: userId,
        tenantId,
      })
      .returning();

    return duplicate;
  }

  /**
   * Get workflow statistics
   */
  static async getStats(workflowId: string, tenantId: string) {
    const workflow = await this.get(workflowId, tenantId);
    if (!workflow) {
      throw new Error('Workflow not found');
    }

    // Get execution counts
    const [stats] = await db
      .select({
        totalExecutions: sql<number>`count(*)::int`,
        completedExecutions: sql<number>`count(*) FILTER (WHERE status = 'completed')::int`,
        failedExecutions: sql<number>`count(*) FILTER (WHERE status = 'failed')::int`,
        avgDurationMs: sql<number>`avg(duration_ms)::int`,
      })
      .from(assistbuildExecutions)
      .where(
        and(
          eq(assistbuildExecutions.workflowId, workflowId),
          eq(assistbuildExecutions.tenantId, tenantId)
        )
      );

    return {
      workflow,
      stats: {
        totalExecutions: stats.totalExecutions || 0,
        completedExecutions: stats.completedExecutions || 0,
        failedExecutions: stats.failedExecutions || 0,
        successRate: stats.totalExecutions 
          ? Math.round((stats.completedExecutions / stats.totalExecutions) * 100)
          : 0,
        avgDurationMs: stats.avgDurationMs || 0,
      },
    };
  }

  /**
   * Search workflows by name
   */
  static async search(
    tenantId: string,
    searchTerm: string,
    limit: number = 20
  ): Promise<AssistBuildWorkflow[]> {
    const workflows = await db
      .select()
      .from(assistbuildWorkflows)
      .where(
        and(
          eq(assistbuildWorkflows.tenantId, tenantId),
          sql`${assistbuildWorkflows.name} ILIKE ${`%${searchTerm}%`}`
        )
      )
      .orderBy(desc(assistbuildWorkflows.createdAt))
      .limit(limit);

    return workflows;
  }
}
