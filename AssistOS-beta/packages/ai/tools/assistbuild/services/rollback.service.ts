/**
 * Rollback Service Adapter for AssistBuild AI Tools
 * 
 * Wraps RollbackService to provide LLM-friendly responses
 * for conversational rollback management.
 */

import { RollbackService } from '../../../../../apps/api/services/rollback.service';
import { db } from '../../../../../apps/api/db';
import { rollbackPoints } from '../../../../../shared/schema';
import { eq, and } from 'drizzle-orm';
import type { Environment } from '../../../../../shared/types/environment';

const rollbackService = new RollbackService();

/**
 * List available rollback points for the tenant
 */
export async function listRollbackPoints(metadata: any) {
  const { tenantId, environment } = metadata;

  if (!tenantId || !environment) {
    return {
      success: false,
      error: 'Invalid context: tenantId and environment are required'
    };
  }

  try {
    const points = await rollbackService.listRollbackPoints(
      tenantId,
      environment as Environment,
      { limit: 20, status: 'active' }
    );

    return {
      success: true,
      totalPoints: points.length,
      points: points.map(p => ({
        id: p.id,
        label: p.label,
        description: p.description || 'No description',
        triggerType: p.triggerType,
        triggerSource: p.triggerSource,
        createdAt: p.createdAt,
        createdBy: p.createdBy,
        snapshotSizeBytes: p.snapshotSizeBytes,
        componentsIncluded: Object.keys(p.snapshotData || {}),
        isProtected: p.isProtected,
        status: p.status,
        canBeDeleted: !p.isProtected
      })),
      message: `Found ${points.length} available rollback points`
    };
  } catch (error: any) {
    return {
      success: false,
      error: `Error listing rollback points: ${error.message}`
    };
  }
}

/**
 * Create a manual snapshot
 */
export async function createManualSnapshot(metadata: any, description?: string) {
  const { tenantId, environment, userId } = metadata;

  if (!tenantId || !environment || !userId) {
    return {
      success: false,
      error: 'Invalid context: tenantId, environment and userId are required'
    };
  }

  try {
    const point = await rollbackService.createRollbackPoint({
      tenantId,
      environment: environment as Environment,
      label: description || 'Manual snapshot',
      description: description || 'Manual snapshot created via AssistBuild',
      triggerType: 'manual',
      triggerSource: 'user_request',
      userId
    });

    return {
      success: true,
      point: {
        id: point.id,
        label: point.label,
        description: point.description,
        createdAt: point.createdAt,
        snapshotSizeBytes: point.snapshotSizeBytes,
        componentsIncluded: Object.keys(point.snapshotData || {})
      },
      message: `Snapshot created successfully. ID: ${point.id}`
    };
  } catch (error: any) {
    return {
      success: false,
      error: `Error creating snapshot: ${error.message}`
    };
  }
}

/**
 * Execute rollback to a specific point
 */
export async function executeRollback(
  metadata: any,
  rollbackPointId: string,
  components?: string[]
) {
  const { tenantId, environment, userId } = metadata;

  if (!tenantId || !environment || !userId) {
    return {
      success: false,
      error: 'Invalid context: tenantId, environment and userId are required'
    };
  }

  if (!rollbackPointId) {
    return {
      success: false,
      error: 'rollbackPointId is required'
    };
  }

  try {
    // Verify rollback point exists
    const [point] = await db
      .select()
      .from(rollbackPoints)
      .where(and(
        eq(rollbackPoints.id, rollbackPointId),
        eq(rollbackPoints.tenantId, tenantId)
      ))
      .limit(1);

    if (!point) {
      return {
        success: false,
        error: `Rollback point ${rollbackPointId} not found`
      };
    }

    const result = await rollbackService.executeRollback({
      rollbackPointId,
      tenantId,
      environment: environment as Environment,
      userId,
      componentsToRollback: components as any,
      async: false
    });

    return {
      success: result.status === 'completed',
      execution: {
        id: result.executionId,
        status: result.status,
        message: result.message
      },
      rollbackPoint: {
        id: point.id,
        description: point.description,
        createdAt: point.createdAt
      },
      message: result.status === 'completed'
        ? `Rollback executed successfully for snapshot from ${new Date(point.createdAt).toLocaleString('en-US')}`
        : `Rollback failed: ${result.message}`
    };
  } catch (error: any) {
    return {
      success: false,
      error: `Error executing rollback: ${error.message}`
    };
  }
}

/**
 * Get status of a rollback execution
 */
export async function getRollbackStatus(metadata: any, executionId: string) {
  const { tenantId, environment } = metadata;

  if (!tenantId || !environment) {
    return {
      success: false,
      error: 'Invalid context: tenantId and environment are required'
    };
  }

  if (!executionId) {
    return {
      success: false,
      error: 'executionId is required'
    };
  }

  try {
    const execution = await rollbackService.getRollbackExecutionStatus(
      executionId,
      tenantId,
      environment as Environment
    );

    if (!execution) {
      return {
        success: false,
        error: `Execution ${executionId} not found`
      };
    }

    return {
      success: true,
      execution: {
        id: execution.id,
        status: execution.status,
        progress: execution.progress,
        currentStep: execution.currentStep,
        totalSteps: execution.totalSteps,
        initiatedAt: execution.initiatedAt,
        completedAt: execution.completedAt,
        componentsRolledBack: execution.componentsRolledBack,
        errorMessage: execution.errorMessage
      },
      message: `Status: ${execution.status} (${execution.progress}% completed)`
    };
  } catch (error: any) {
    return {
      success: false,
      error: `Error checking status: ${error.message}`
    };
  }
}
