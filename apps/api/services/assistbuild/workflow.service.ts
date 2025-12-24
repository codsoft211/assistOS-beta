import { db } from '../../db.js';
import {
  assistbuildWorkflows,
  assistbuildExecutions,
} from '../../../../shared/schema.js';
import { eq, and, desc, sql, ne } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import type {
  AssistBuildWorkflow,
  CreateWorkflowRequest,
  UpdateWorkflowRequest,
  ListWorkflowsQuery,
} from './types.js';
import { ValidationService } from './validation.service.js';

export class WorkflowService {
  /**
   * Create a new workflow (Always starts in Sandbox as Draft)
   */
  static async create(
    data: CreateWorkflowRequest & { createdBy: string; tenantId: string }
  ): Promise<AssistBuildWorkflow> {
    // Determine trigger type from nodes
    const hasTrigger = data.definition?.nodes?.find(
      (n: any) => n.type === 'manual_trigger' || n.type === 'schedule_trigger' || n.type === 'webhook_trigger'
    );
    const triggerType = hasTrigger?.type === 'webhook_trigger' ? 'webhook' :
      hasTrigger?.type === 'schedule_trigger' ? 'scheduled' : 'manual';

    const [workflow] = await db
      .insert(assistbuildWorkflows)
      .values({
        workflowId: uuidv4(), // Generate stable logical identity
        name: data.name,
        description: data.description,
        definition: data.definition,
        environment: 'sandbox', // Initial state
        status: 'draft',
        versionNumber: 1,
        triggerType,
        createdBy: data.createdBy,
        tenantId: data.tenantId,
      })
      .returning();

    return workflow;
  }

  /**
   * List workflows for a tenant with environment isolation
   */
  static async list(
    tenantId: string,
    query: ListWorkflowsQuery = {}
  ): Promise<{ workflows: AssistBuildWorkflow[]; total: number }> {
    const { status, environment, page = 1, limit = 50 } = query;
    const offset = (page - 1) * limit;

    const conditions = [eq(assistbuildWorkflows.tenantId, tenantId)];

    if (status) conditions.push(eq(assistbuildWorkflows.status, status));
    if (environment) conditions.push(eq(assistbuildWorkflows.environment, environment));

    const workflows = await db
      .select()
      .from(assistbuildWorkflows)
      .where(and(...conditions))
      .orderBy(desc(assistbuildWorkflows.createdAt))
      .limit(limit)
      .offset(offset);

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
   * Get a single workflow version
   */
  static async get(id: string, tenantId: string): Promise<AssistBuildWorkflow | null> {
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
   * Update a Sandbox draft. 
   * PRODUCTION versions are IMMUTABLE.
   */
  static async update(
    id: string,
    tenantId: string,
    data: UpdateWorkflowRequest
  ): Promise<AssistBuildWorkflow> {
    const existing = await this.get(id, tenantId);
    if (!existing) throw new Error('Workflow not found');

    // Rule: Production versions cannot be updated
    if (existing.environment === 'production' || existing.status === 'published') {
      throw new Error('Production workflows are immutable. Create a new sandbox version to make changes.');
    }

    const updateData: any = { updatedAt: new Date() };
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.definition !== undefined) updateData.definition = data.definition;

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
   * Promote a Sandbox draft to Production.
   * Creates a NEW immutable record.
   */
  static async publish(id: string, tenantId: string): Promise<AssistBuildWorkflow> {
    const sandboxVersion = await this.get(id, tenantId);
    if (!sandboxVersion) throw new Error('Draft not found');

    if (sandboxVersion.environment !== 'sandbox') {
      throw new Error('Can only publish from Sandbox environment');
    }

    // Strict Validation for Production
    const validation = ValidationService.validateWorkflow(sandboxVersion.definition as any);
    if (!validation.valid) {
      throw new Error(`Cannot publish invalid workflow: ${validation.errors.join(', ')}`);
    }

    // Get current max version for this logical workflowId across all environments
    const [lastVersion] = await db
      .select({ maxVersion: sql<number>`max(version_number)::int` })
      .from(assistbuildWorkflows)
      .where(eq(assistbuildWorkflows.workflowId, sandboxVersion.workflowId));

    const nextVersion = (lastVersion?.maxVersion || 0) + 1;

    // Create NEW Production Immutable record
    const [published] = await db
      .insert(assistbuildWorkflows)
      .values({
        workflowId: sandboxVersion.workflowId,
        name: sandboxVersion.name,
        description: sandboxVersion.description,
        definition: sandboxVersion.definition,
        environment: 'production',
        status: 'published',
        versionNumber: nextVersion,
        createdFromVersion: sandboxVersion.id,
        triggerType: sandboxVersion.triggerType,
        createdBy: sandboxVersion.createdBy,
        tenantId: sandboxVersion.tenantId,
        publishedAt: new Date(),
      })
      .returning();

    return published;
  }

  /**
   * Create a NEW Sandbox Draft from a Production version
   */
  static async createNextVersion(
    sourceId: string,
    tenantId: string,
    userId: string
  ): Promise<AssistBuildWorkflow> {
    const source = await this.get(sourceId, tenantId);
    if (!source) throw new Error('Source version not found');

    // Archive or clean up existing sandbox drafts for this logical ID if user wants single-draft mode
    // (Optional: for simplicity we allow multiple drafts, but usually you want one)

    const [draft] = await db
      .insert(assistbuildWorkflows)
      .values({
        workflowId: source.workflowId,
        name: source.name,
        description: source.description,
        definition: source.definition,
        environment: 'sandbox',
        status: 'draft',
        versionNumber: source.versionNumber, // Keep ref to current number or increment later
        createdFromVersion: source.id,
        triggerType: source.triggerType,
        createdBy: userId,
        tenantId,
      })
      .returning();

    return draft;
  }

  /**
   * Archive a workflow version
   */
  static async archive(id: string, tenantId: string): Promise<AssistBuildWorkflow> {
    const [updated] = await db
      .update(assistbuildWorkflows)
      .set({ status: 'archived', updatedAt: new Date() })
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
   * Duplicate a workflow (New ID)
   */
  static async duplicate(
    id: string,
    tenantId: string,
    userId: string,
    newName?: string
  ): Promise<AssistBuildWorkflow> {
    const original = await this.get(id, tenantId);
    if (!original) throw new Error('Workflow not found');

    const [duplicate] = await db
      .insert(assistbuildWorkflows)
      .values({
        workflowId: uuidv4(), // NEW stable identity
        name: newName || `${original.name} (Copy)`,
        description: original.description,
        definition: original.definition,
        environment: 'sandbox',
        status: 'draft',
        versionNumber: 1,
        triggerType: original.triggerType,
        createdBy: userId,
        tenantId,
      })
      .returning();

    return duplicate;
  }

  static async getStats(workflowId: string, tenantId: string) {
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
          eq(assistbuildExecutions.workflowId, workflowId), // Executions should link to VERSION ID or LOGICAL ID?
          eq(assistbuildExecutions.tenantId, tenantId)
        )
      );

    return {
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
}
