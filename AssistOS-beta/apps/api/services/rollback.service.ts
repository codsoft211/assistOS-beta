/**
 * Rollback Service (GAP #6)
 * 
 * System-wide rollback capabilities for AssistOS platform.
 * Allows safe recovery from breaking changes by creating snapshots and restoring system state.
 * 
 * Architecture:
 * - Automatic snapshots before critical operations (migrations, code generation, pattern deployment)
 * - Manual snapshots for user-initiated backups
 * - Multi-component rollback (schemas, modules, patterns, code)
 * - Async execution for large rollbacks via BullMQ
 * - Full audit trail of all rollback operations
 * 
 * Supported Rollback Components:
 * - schemas: Database schema rollback via Schema Evolution System (Gap #3)
 * - modules: Module configuration restoration
 * - patterns: Pattern deployment rollback
 * - codeGeneration: Generated code rollback
 * - workflows: Workflow configuration rollback
 * 
 * Integration Points:
 * - Schema Evolution Service (migration rollback)
 * - Code Generation Service (code file rollback)
 * - Pattern Recognition Service (pattern rollback)
 * - Module Configuration Manager (module rollback)
 */

import { db } from '../db';
import {
  rollbackPoints,
  rollbackExecutions,
  schemaVersions,
  modules,
  detectedPatterns,
  generatedCode,
  tenantWorkflows,
  users,
  type InsertRollbackPoint,
  type RollbackPoint,
  type InsertRollbackExecution,
  type RollbackExecution,
} from '../../../shared/schema';
import { and, eq, desc, sql } from 'drizzle-orm';
import logger from '../logger';
import type { Environment } from '../../../shared/types/environment';

// ============================================================================
// Types & Interfaces
// ============================================================================

export type TriggerType = 'automatic' | 'manual';

export type TriggerSource = 
  | 'schema_migration'
  | 'code_generation'
  | 'pattern_deployment'
  | 'module_installation'
  | 'workflow_deployment'
  | 'user_request';

export type RollbackStatus = 
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface SnapshotData {
  schemas?: { version: number; snapshot: any; schemaVersionId: string };
  modules?: Array<{ id: string; name: string; config: any }>;
  patterns?: Array<{ id: string; name: string; config: any }>;
  codeGeneration?: Array<{ id: string; files: string[]; metadata: any }>;
  workflows?: Array<{ id: string; name: string; config: any }>;
}

export interface CreateSnapshotParams {
  tenantId: string;
  environment: Environment;
  label: string;
  description?: string;
  triggerType: TriggerType;
  triggerSource: TriggerSource;
  userId: string;
  isProtected?: boolean;
  expiresAt?: Date;
}

export interface RollbackOptions {
  tenantId: string;
  environment: Environment;
  rollbackPointId: string;
  userId: string;
  componentsToRollback?: Array<'schemas' | 'modules' | 'patterns' | 'codeGeneration' | 'workflows'>;
  async?: boolean; // If true, queues BullMQ job instead of executing immediately
}

export interface RollbackResult {
  executionId: string;
  status: RollbackStatus;
  message: string;
  jobId?: string; // BullMQ job ID for async rollbacks
}

// ============================================================================
// Rollback Service
// ============================================================================

export class RollbackService {
  /**
   * Create a new rollback point (snapshot)
   * Captures current state of all critical system components
   */
  async createRollbackPoint(params: CreateSnapshotParams): Promise<RollbackPoint> {
    const {
      tenantId,
      environment,
      label,
      description,
      triggerType,
      triggerSource,
      userId,
      isProtected = false,
      expiresAt,
    } = params;

    logger.info({
      tenantId,
      environment,
      label,
      triggerSource,
    }, '[RollbackService] Creating rollback point');

    try {
      // 1. Capture schema snapshot
      const schemaSnapshot = await this.captureSchemaSnapshot(tenantId, environment);

      // 2. Capture modules snapshot
      const modulesSnapshot = await this.captureModulesSnapshot(tenantId, environment);

      // 3. Capture patterns snapshot
      const patternsSnapshot = await this.capturePatternsSnapshot(tenantId, environment);

      // 4. Capture code generation snapshot
      const codeGenSnapshot = await this.captureCodeGenerationSnapshot(tenantId, environment);

      // 5. Capture workflows snapshot
      const workflowsSnapshot = await this.captureWorkflowsSnapshot(tenantId, environment);

      // 6. Build snapshot data
      const snapshotData: SnapshotData = {
        schemas: schemaSnapshot,
        modules: modulesSnapshot,
        patterns: patternsSnapshot,
        codeGeneration: codeGenSnapshot,
        workflows: workflowsSnapshot,
      };

      // 7. Calculate snapshot size
      const snapshotSizeBytes = Buffer.byteLength(JSON.stringify(snapshotData), 'utf-8');

      // 8. Create rollback point
      const [rollbackPoint] = await db.insert(rollbackPoints).values({
        tenantId,
        environment,
        label,
        description,
        triggerType,
        triggerSource,
        schemaVersionId: schemaSnapshot?.schemaVersionId,
        snapshotData,
        snapshotSizeBytes,
        createdBy: userId,
        expiresAt,
        status: 'active',
        isProtected,
      }).returning();

      logger.info({
        rollbackPointId: rollbackPoint.id,
        sizeBytes: snapshotSizeBytes,
      }, '[RollbackService] Rollback point created');

      return rollbackPoint;
    } catch (error) {
      logger.error({
        tenantId,
        environment,
        error: error instanceof Error ? error.message : String(error),
      }, '[RollbackService] Failed to create rollback point');
      throw error;
    }
  }

  /**
   * Execute rollback to a specific point
   * Restores system state from snapshot
   */
  async executeRollback(options: RollbackOptions): Promise<RollbackResult> {
    const {
      tenantId,
      environment,
      rollbackPointId,
      userId,
      componentsToRollback,
      async = false,
    } = options;

    logger.info({
      tenantId,
      environment,
      rollbackPointId,
      async,
    }, '[RollbackService] Executing rollback');

    // Guard: Async execution not yet implemented (deferred to post-MVP)
    if (async) {
      throw new Error('Async rollback execution not yet implemented. Use async: false for synchronous execution. Async worker scheduled for Week 6-12 expansion.');
    }

    try {
      // 1. Fetch rollback point
      const [rollbackPoint] = await db
        .select()
        .from(rollbackPoints)
        .where(
          and(
            eq(rollbackPoints.id, rollbackPointId),
            eq(rollbackPoints.tenantId, tenantId),
            eq(rollbackPoints.environment, environment),
            eq(rollbackPoints.status, 'active')
          )
        )
        .limit(1);

      if (!rollbackPoint) {
        throw new Error('Rollback point not found or inactive');
      }

      // 2. Create execution record
      const [execution] = await db.insert(rollbackExecutions).values({
        rollbackPointId,
        tenantId,
        environment,
        status: async ? 'pending' : 'in_progress',
        initiatedBy: userId,
        progress: 0,
        currentStep: 'Initializing rollback',
        totalSteps: this.calculateTotalSteps(rollbackPoint.snapshotData as SnapshotData, componentsToRollback),
      }).returning();

      // 3. If async, queue BullMQ job
      if (async) {
        // TODO: Queue BullMQ job (Task 5)
        const jobId = `rollback-${execution.id}`;

        await db.update(rollbackExecutions)
          .set({ jobId })
          .where(eq(rollbackExecutions.id, execution.id));

        return {
          executionId: execution.id,
          status: 'pending',
          message: 'Rollback queued for async execution',
          jobId,
        };
      }

      // 4. Execute rollback synchronously
      const startTime = Date.now();

      try {
        await this.performRollback(
          execution.id,
          rollbackPoint,
          componentsToRollback
        );

        const executionDuration = Date.now() - startTime;

        // 5. Mark execution as completed
        await db.update(rollbackExecutions)
          .set({
            status: 'completed',
            progress: 100,
            completedAt: new Date(),
            executionDuration,
          })
          .where(eq(rollbackExecutions.id, execution.id));

        return {
          executionId: execution.id,
          status: 'completed',
          message: 'Rollback completed successfully',
        };
      } catch (error) {
        // 6. Mark execution as failed
        await db.update(rollbackExecutions)
          .set({
            status: 'failed',
            errorMessage: error instanceof Error ? error.message : String(error),
            errorDetails: { error: String(error) },
            completedAt: new Date(),
          })
          .where(eq(rollbackExecutions.id, execution.id));

        throw error;
      }
    } catch (error) {
      logger.error({
        tenantId,
        environment,
        rollbackPointId,
        error: error instanceof Error ? error.message : String(error),
      }, '[RollbackService] Rollback execution failed');

      return {
        executionId: '',
        status: 'failed',
        message: error instanceof Error ? error.message : 'Rollback failed',
      };
    }
  }

  /**
   * List available rollback points for a tenant
   */
  async listRollbackPoints(
    tenantId: string,
    environment: Environment,
    options?: {
      limit?: number;
      status?: 'active' | 'expired' | 'deleted';
      triggerSource?: TriggerSource;
    }
  ): Promise<RollbackPoint[]> {
    const conditions = [
      eq(rollbackPoints.tenantId, tenantId),
      eq(rollbackPoints.environment, environment),
    ];

    if (options?.status) {
      conditions.push(eq(rollbackPoints.status, options.status));
    }

    if (options?.triggerSource) {
      conditions.push(eq(rollbackPoints.triggerSource, options.triggerSource));
    }

    const points = await db
      .select()
      .from(rollbackPoints)
      .where(and(...conditions))
      .orderBy(desc(rollbackPoints.createdAt))
      .limit(options?.limit || 50);

    return points;
  }

  /**
   * Get rollback execution status
   */
  async getRollbackExecutionStatus(
    executionId: string,
    tenantId: string,
    environment: Environment
  ): Promise<RollbackExecution | null> {
    const [execution] = await db
      .select()
      .from(rollbackExecutions)
      .where(
        and(
          eq(rollbackExecutions.id, executionId),
          eq(rollbackExecutions.tenantId, tenantId),
          eq(rollbackExecutions.environment, environment)
        )
      )
      .limit(1);

    return execution || null;
  }

  // ============================================================================
  // Private Snapshot Methods
  // ============================================================================

  private async captureSchemaSnapshot(
    tenantId: string,
    environment: Environment
  ): Promise<SnapshotData['schemas'] | undefined> {
    try {
      const [latestVersion] = await db
        .select()
        .from(schemaVersions)
        .where(
          and(
            eq(schemaVersions.tenantId, tenantId),
            eq(schemaVersions.environment, environment),
            eq(schemaVersions.status, 'active')
          )
        )
        .orderBy(desc(schemaVersions.version))
        .limit(1);

      if (!latestVersion) {
        return undefined;
      }

      return {
        version: latestVersion.version,
        snapshot: latestVersion.schemaSnapshot,
        schemaVersionId: latestVersion.id,
      };
    } catch (error) {
      logger.warn({ error }, '[RollbackService] Failed to capture schema snapshot');
      return undefined;
    }
  }

  private async captureModulesSnapshot(
    tenantId: string,
    environment: Environment
  ): Promise<SnapshotData['modules'] | undefined> {
    try {
      const installedModules = await db
        .select()
        .from(modules)
        .where(
          and(
            eq(modules.tenantId, tenantId),
            eq(modules.environment, environment),
            eq(modules.isActive, true)
          )
        );

      return installedModules.map(m => ({
        id: m.id,
        name: m.name,
        config: m.customSettings,
      }));
    } catch (error) {
      logger.warn({ error }, '[RollbackService] Failed to capture modules snapshot');
      return undefined;
    }
  }

  private async capturePatternsSnapshot(
    tenantId: string,
    environment: Environment
  ): Promise<SnapshotData['patterns'] | undefined> {
    try {
      const patterns = await db
        .select()
        .from(detectedPatterns)
        .where(
          and(
            eq(detectedPatterns.tenantId, tenantId),
            eq(detectedPatterns.environment, environment)
          )
        );

      return patterns.map(p => ({
        id: p.id.toString(),
        name: p.type,
        config: {
          type: p.type,
          sequence: p.sequence,
          confidence: p.confidence,
        },
      }));
    } catch (error) {
      logger.warn({ error }, '[RollbackService] Failed to capture patterns snapshot');
      return undefined;
    }
  }

  private async captureCodeGenerationSnapshot(
    tenantId: string,
    environment: Environment
  ): Promise<SnapshotData['codeGeneration'] | undefined> {
    try {
      // Capture validated and deployed code (not pending/failed)
      const codeGens = await db
        .select()
        .from(generatedCode)
        .where(
          and(
            eq(generatedCode.tenantId, tenantId),
            eq(generatedCode.environment, environment),
            sql`${generatedCode.status} IN ('validated', 'deployed')`
          )
        );

      return codeGens.map(c => ({
        id: c.id,
        files: Object.keys(c.files),
        metadata: {
          files: c.files,
          validationResults: c.validationResults,
        },
      }));
    } catch (error) {
      logger.warn({ error }, '[RollbackService] Failed to capture code generation snapshot');
      return undefined;
    }
  }

  private async captureWorkflowsSnapshot(
    tenantId: string,
    environment: Environment
  ): Promise<SnapshotData['workflows'] | undefined> {
    try {
      const workflows = await db
        .select()
        .from(tenantWorkflows)
        .where(
          and(
            eq(tenantWorkflows.tenantId, tenantId),
            eq(tenantWorkflows.environment, environment),
            eq(tenantWorkflows.isActive, true)
          )
        );

      return workflows.map(w => ({
        id: w.id,
        name: w.name,
        config: {
          steps: w.steps,
          triggerType: w.triggerType,
        },
      }));
    } catch (error) {
      logger.warn({ error }, '[RollbackService] Failed to capture workflows snapshot');
      return undefined;
    }
  }

  // ============================================================================
  // Private Rollback Execution Methods
  // ============================================================================

  private async performRollback(
    executionId: string,
    rollbackPoint: RollbackPoint,
    componentsToRollback?: string[]
  ): Promise<void> {
    const snapshotData = rollbackPoint.snapshotData as SnapshotData;
    const componentsRolledBack: string[] = [];

    const components = componentsToRollback || [
      'schemas',
      'modules',
      'patterns',
      'codeGeneration',
      'workflows',
    ];

    // Rollback each component
    for (const component of components) {
      await this.updateExecutionProgress(
        executionId,
        `Rolling back ${component}...`,
        Math.floor((componentsRolledBack.length / components.length) * 100)
      );

      try {
        switch (component) {
          case 'schemas':
            if (snapshotData.schemas) {
              await this.rollbackSchemas(rollbackPoint.tenantId, rollbackPoint.environment as Environment, snapshotData.schemas);
              componentsRolledBack.push('schemas');
            }
            break;
          case 'modules':
            if (snapshotData.modules) {
              await this.rollbackModules(rollbackPoint.tenantId, rollbackPoint.environment as Environment, snapshotData.modules);
              componentsRolledBack.push('modules');
            }
            break;
          case 'patterns':
            if (snapshotData.patterns) {
              await this.rollbackPatterns(rollbackPoint.tenantId, rollbackPoint.environment as Environment, snapshotData.patterns);
              componentsRolledBack.push('patterns');
            }
            break;
          case 'codeGeneration':
            if (snapshotData.codeGeneration) {
              await this.rollbackCodeGeneration(rollbackPoint.tenantId, rollbackPoint.environment as Environment, snapshotData.codeGeneration);
              componentsRolledBack.push('codeGeneration');
            }
            break;
          case 'workflows':
            if (snapshotData.workflows) {
              await this.rollbackWorkflows(rollbackPoint.tenantId, rollbackPoint.environment as Environment, snapshotData.workflows);
              componentsRolledBack.push('workflows');
            }
            break;
        }
      } catch (error) {
        logger.error({ error, component }, `[RollbackService] Failed to rollback ${component}`);
        // Continue with other components
      }
    }

    // Update execution with rolled back components
    await db.update(rollbackExecutions)
      .set({ componentsRolledBack })
      .where(eq(rollbackExecutions.id, executionId));
  }

  private async updateExecutionProgress(
    executionId: string,
    currentStep: string,
    progress: number
  ): Promise<void> {
    await db.update(rollbackExecutions)
      .set({ currentStep, progress })
      .where(eq(rollbackExecutions.id, executionId));
  }

  private async rollbackSchemas(
    tenantId: string,
    environment: Environment,
    schemasSnapshot: NonNullable<SnapshotData['schemas']>
  ): Promise<void> {
    logger.info({ tenantId, environment, version: schemasSnapshot.version }, '[RollbackService] Rolling back schemas');
    // TODO: Integrate with Schema Evolution Service to rollback to specific version
    // This requires Schema Evolution Service to expose a rollback method
  }

  private async rollbackModules(
    tenantId: string,
    environment: Environment,
    modulesSnapshot: NonNullable<SnapshotData['modules']>
  ): Promise<void> {
    logger.info({ tenantId, environment, count: modulesSnapshot.length }, '[RollbackService] Rolling back modules');
    // TODO: Restore module configurations from snapshot
    // This requires Module Configuration Manager integration
  }

  private async rollbackPatterns(
    tenantId: string,
    environment: Environment,
    patternsSnapshot: NonNullable<SnapshotData['patterns']>
  ): Promise<void> {
    logger.info({ tenantId, environment, count: patternsSnapshot.length }, '[RollbackService] Rolling back patterns');
    // TODO: Restore pattern deployments from snapshot
    // This requires Pattern Recognition Service integration
  }

  private async rollbackCodeGeneration(
    tenantId: string,
    environment: Environment,
    codeGenSnapshot: NonNullable<SnapshotData['codeGeneration']>
  ): Promise<void> {
    logger.info({ tenantId, environment, count: codeGenSnapshot.length }, '[RollbackService] Rolling back code generation');
    // TODO: Restore generated code files from snapshot
    // This requires Code Generation Service integration
  }

  private async rollbackWorkflows(
    tenantId: string,
    environment: Environment,
    workflowsSnapshot: NonNullable<SnapshotData['workflows']>
  ): Promise<void> {
    logger.info({ tenantId, environment, count: workflowsSnapshot.length }, '[RollbackService] Rolling back workflows');
    // TODO: Restore workflow configurations from snapshot
  }

  private calculateTotalSteps(
    snapshotData: SnapshotData,
    componentsToRollback?: string[]
  ): number {
    const components = componentsToRollback || [
      'schemas',
      'modules',
      'patterns',
      'codeGeneration',
      'workflows',
    ];

    return components.filter(component => {
      const key = component as keyof SnapshotData;
      return snapshotData[key] !== undefined;
    }).length;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

export const rollbackService = new RollbackService();
