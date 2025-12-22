/**
 * Rollback Snapshot Middleware (GAP #6)
 * 
 * Automatically creates rollback points before critical operations.
 * 
 * Usage:
 *   router.post('/api/schema/migrations', 
 *     createRollbackSnapshot('schema_migration', 'Schema Migration'),
 *     asyncHandler(async (req, res) => { ... })
 *   );
 * 
 * Features:
 * - Auto-snapshot before destructive operations
 * - Stores rollbackPointId in req for audit trail
 * - Skips snapshot creation if request fails validation
 * - Protected snapshots for critical operations
 */

import { type Request, type Response, type NextFunction } from 'express';
import { rollbackService, type TriggerSource } from '../services/rollback.service';
import logger from '../logger';
import type { Environment } from '../../../shared/types/environment';

export interface RollbackSnapshotOptions {
  /**
   * Human-readable label for the rollback point
   * Example: "Schema Migration", "Code Generation"
   */
  label: string;

  /**
   * Trigger source identifier
   * Maps to specific AssistOS operations
   */
  triggerSource: TriggerSource;

  /**
   * Optional description template (can use req.body values)
   * Example: "Deploying code generation request {{requestId}}"
   */
  descriptionTemplate?: string;

  /**
   * Mark snapshot as protected (cannot be auto-deleted)
   * Use for critical operations like production migrations
   */
  isProtected?: boolean;

  /**
   * Optional expiration time (in days)
   * Default: no expiration
   */
  expirationDays?: number;
}

/**
 * Middleware factory to create automatic rollback snapshots
 * 
 * @param triggerSource - Source of the operation (schema_migration, code_generation, etc.)
 * @param label - Human-readable label for the snapshot
 * @param options - Additional snapshot configuration
 */
export function createRollbackSnapshot(
  triggerSource: TriggerSource,
  label: string,
  options?: Partial<Omit<RollbackSnapshotOptions, 'triggerSource' | 'label'>>
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // 1. Require authentication
      if (!req.user || !req.user.id) {
        logger.warn({ triggerSource }, '[RollbackSnapshot] Unauthenticated request - skipping snapshot');
        return next(); // Let auth middleware handle rejection
      }

      // 2. Require tenant
      if (!req.tenantId) {
        logger.warn({ triggerSource }, '[RollbackSnapshot] No tenant ID - skipping snapshot');
        return next(); // Let tenant middleware handle rejection
      }

      // 3. Require environment
      const environment = req.environment as Environment;
      if (!environment) {
        logger.warn({ triggerSource }, '[RollbackSnapshot] No environment - skipping snapshot');
        return next();
      }

      // 4. Build description (interpolate from request body if template provided)
      let description = options?.descriptionTemplate || undefined;
      if (description && req.body) {
        // Simple template interpolation: {{key}} -> req.body.key
        description = description.replace(/\{\{(\w+)\}\}/g, (_, key) => {
          return req.body[key] !== undefined ? String(req.body[key]) : '';
        });
      }

      // 5. Calculate expiration
      let expiresAt: Date | undefined;
      if (options?.expirationDays) {
        expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + options.expirationDays);
      }

      logger.info({
        tenantId: req.tenantId,
        environment,
        triggerSource,
        label,
      }, '[RollbackSnapshot] Creating automatic snapshot');

      // 6. Create rollback point
      const rollbackPoint = await rollbackService.createRollbackPoint({
        tenantId: req.tenantId,
        environment,
        label,
        description,
        triggerType: 'automatic',
        triggerSource,
        userId: req.user.id,
        isProtected: options?.isProtected || false,
        expiresAt,
      });

      // 7. Store rollbackPointId in request for downstream handlers
      // This allows API routes to reference the snapshot in response/audit logs
      (req as any).rollbackPointId = rollbackPoint.id;

      logger.info({
        rollbackPointId: rollbackPoint.id,
        sizeBytes: rollbackPoint.snapshotSizeBytes,
      }, '[RollbackSnapshot] Snapshot created successfully');

      next();
    } catch (error) {
      // Log error but don't block the request
      // Rollback snapshots are safety feature - operation should proceed even if snapshot fails
      logger.error({
        error: error instanceof Error ? error.message : String(error),
        triggerSource,
      }, '[RollbackSnapshot] Failed to create snapshot - proceeding with operation');
      
      next(); // Continue despite snapshot failure
    }
  };
}

/**
 * Pre-configured middleware for common operations
 */
export const RollbackSnapshots = {
  /**
   * Snapshot before schema migration
   * Protected: Yes (migrations are critical)
   * Expiration: Never
   */
  schemaMigration: createRollbackSnapshot(
    'schema_migration',
    'Schema Migration',
    {
      descriptionTemplate: 'Before applying migration {{migrationId}}',
      isProtected: true,
    }
  ),

  /**
   * Snapshot before code generation deployment
   * Protected: No (code can be regenerated)
   * Expiration: 30 days
   */
  codeGeneration: createRollbackSnapshot(
    'code_generation',
    'Code Generation Deployment',
    {
      descriptionTemplate: 'Before deploying generated code {{requestId}}',
      isProtected: false,
      expirationDays: 30,
    }
  ),

  /**
   * Snapshot before pattern deployment
   * Protected: No
   * Expiration: 14 days
   */
  patternDeployment: createRollbackSnapshot(
    'pattern_deployment',
    'Pattern Deployment',
    {
      descriptionTemplate: 'Before deploying pattern workflow {{patternId}}',
      isProtected: false,
      expirationDays: 14,
    }
  ),

  /**
   * Snapshot before module installation
   * Protected: No
   * Expiration: 7 days
   */
  moduleInstallation: createRollbackSnapshot(
    'module_installation',
    'Module Installation',
    {
      descriptionTemplate: 'Before installing module {{moduleId}}',
      isProtected: false,
      expirationDays: 7,
    }
  ),

  /**
   * Snapshot before workflow deployment
   * Protected: No
   * Expiration: 14 days
   */
  workflowDeployment: createRollbackSnapshot(
    'workflow_deployment',
    'Workflow Deployment',
    {
      descriptionTemplate: 'Before deploying workflow {{workflowId}}',
      isProtected: false,
      expirationDays: 14,
    }
  ),

  /**
   * Manual snapshot (user-requested)
   * Protected: Yes (user explicitly requested)
   * Expiration: Never
   */
  manualBackup: createRollbackSnapshot(
    'user_request',
    'Manual Backup',
    {
      descriptionTemplate: '{{reason}}',
      isProtected: true,
    }
  ),
};
