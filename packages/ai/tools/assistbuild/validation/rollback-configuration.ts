import { ToolBase, type ToolManifest, type ToolExecutionContext } from '../../kernel';
import { db } from '../../../../../apps/api/db';
import { 
  configurationCheckpoints,
  apiIntegrations
} from '../../../../../shared/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import { z } from 'zod';
import { updateTenantTable, getTenantTableRef, insertIntoTenantTable } from '../../../../../apps/api/utils/tenant-db-helper';

const inputSchema = z.object({
  checkpointId: z.string().optional(),
  listCheckpoints: z.boolean().optional().default(false),
  limit: z.number().int().min(1).max(50).optional().default(10),
  dryRun: z.boolean().optional().default(false),
});

type RollbackConfigurationInput = z.infer<typeof inputSchema>;

export class RollbackConfigurationTool extends ToolBase<RollbackConfigurationInput, any> {
  manifest: ToolManifest = {
    name: 'rollback_configuration',
    category: 'validation',
    description: 'Reverts tenant configurations to a previous checkpoint, allowing to undo problematic changes',
    parameters: [
      { name: 'checkpointId', type: 'string', description: 'Checkpoint ID to revert to (optional if listCheckpoints=true)', required: false },
      { name: 'listCheckpoints', type: 'boolean', description: 'List available checkpoints without performing rollback (default: false)', required: false },
      { name: 'limit', type: 'number', description: 'Number of checkpoints to list (default: 10)', required: false },
      { name: 'dryRun', type: 'boolean', description: 'Simulate rollback without applying changes (default: false)', required: false },
    ],
    requiresAuth: true,
    progressSupport: true
  };

  protected async executeInternal(
    input: RollbackConfigurationInput,
    context: ToolExecutionContext,
    onProgress?: (progress: number, message: string) => void
  ): Promise<any> {
    try {
      const validated = inputSchema.parse(input);
      
      onProgress?.(10, 'Searching checkpoints...');
      
      // List checkpoints mode
      if (validated.listCheckpoints) {
        const checkpoints = await db.query.configurationCheckpoints.findMany({
          where: eq(configurationCheckpoints.tenantId, context.tenantId),
          orderBy: [desc(configurationCheckpoints.createdAt)],
          limit: validated.limit
        });
        
        onProgress?.(100, 'Checkpoints listed!');
        
        return {
          success: true,
          checkpoints: checkpoints.map((cp: any) => ({
            id: cp.id,
            version: cp.version,
            changeType: cp.changeType,
            entityType: cp.entityType,
            entityId: cp.entityId,
            changeSummary: cp.changeSummary,
            createdBy: cp.createdBy,
            createdAt: cp.createdAt,
            hasBeforeSnapshot: !!cp.beforeSnapshot
          })),
          message: `${checkpoints.length} checkpoint(s) found`
        };
      }
      
      // Rollback mode - require checkpointId
      if (!validated.checkpointId) {
        return {
          success: false,
          error: 'checkpointId is required to perform rollback',
          suggestion: 'Use listCheckpoints=true to see available checkpoints'
        };
      }
      
      onProgress?.(20, 'Validating checkpoint...');
      
      // Find checkpoint
      const checkpoint = await db.query.configurationCheckpoints.findFirst({
        where: and(
          eq(configurationCheckpoints.id, validated.checkpointId),
          eq(configurationCheckpoints.tenantId, context.tenantId)
        )
      });
      
      if (!checkpoint) {
        return {
          success: false,
          error: `Checkpoint ${validated.checkpointId} not found in this tenant`
        };
      }
      
      if (!checkpoint.beforeSnapshot) {
        return {
          success: false,
          error: 'Checkpoint does not have previous snapshot (rollback impossible)',
          suggestion: 'This checkpoint documents resource creation, there is no previous state'
        };
      }
      
      onProgress?.(40, 'Preparing rollback...');
      
      // Analyze what needs to be rolled back
      const rollbackPlan = this.analyzeRollback(checkpoint);
      
      if (validated.dryRun) {
        onProgress?.(100, 'Simulation completed!');
        
        return {
          success: true,
          dryRun: true,
          checkpoint: {
            id: checkpoint.id,
            version: checkpoint.version,
            changeType: checkpoint.changeType,
            entityType: checkpoint.entityType,
            changeSummary: checkpoint.changeSummary
          },
          rollbackPlan,
          message: 'Simulação de rollback - nenhuma mudança aplicada'
        };
      }
      
      onProgress?.(60, 'Applying rollback...');
      
      // Execute rollback, checkpoint creation, and audit logging in a transaction
      // This ensures atomicity - either all operations succeed or all are rolled back
      const { result, newCheckpoint } = await db.transaction(async (tx) => {
        // Apply rollback based on entity type
        const rollbackResult = await this.applyRollbackInTransaction(
          checkpoint,
          rollbackPlan,
          context,
          tx
        );
        
        if (!rollbackResult.success) {
          // Transaction will auto-rollback on error
          throw new Error(rollbackResult.error || 'Rollback failed');
        }
        
        onProgress?.(80, 'Criando checkpoint de rollback...');
        
        // Create new checkpoint documenting the rollback
        const [checkpoint_record] = await tx.insert(configurationCheckpoints).values({
          tenantId: context.tenantId,
          environment: checkpoint.environment,
          version: checkpoint.version + 1,
          changeType: 'rollback',
          entityType: checkpoint.entityType,
          entityId: checkpoint.entityId,
          changeSummary: `Rollback para checkpoint ${checkpoint.id}: ${checkpoint.changeSummary}`,
          beforeSnapshot: checkpoint.afterSnapshot, // Current state becomes "before"
          afterSnapshot: checkpoint.beforeSnapshot, // Old state becomes "after"
          createdBy: context.userId
        }).returning();
        
        return {
          result: rollbackResult,
          newCheckpoint: checkpoint_record
        };
      });
      
      onProgress?.(90, 'Registrando auditoria...');
      
      // Create audit log entry (tenant schema) - outside transaction for tenant schema support
      await insertIntoTenantTable(
        context.tenantId,
        'audit_log',
        {
          tenant_id: context.tenantId,
          actor_user_id: context.userId,
          action: 'configuration_rolledback',
          metadata: JSON.stringify({
            resourceType: 'configuration_checkpoint',
            resourceId: newCheckpoint.id,
            originalCheckpointId: checkpoint.id,
            changeType: checkpoint.changeType,
            entityType: checkpoint.entityType,
            entityId: checkpoint.entityId
          })
        }
      );
      
      onProgress?.(100, 'Rollback completed!');
      
      return {
        success: true,
        checkpoint: {
          id: checkpoint.id,
          version: checkpoint.version,
          changeType: checkpoint.changeType,
          entityType: checkpoint.entityType,
          changeSummary: checkpoint.changeSummary
        },
        newCheckpoint: {
          id: newCheckpoint.id,
          version: newCheckpoint.version
        },
        rollbackPlan,
        appliedChanges: result.appliedChanges,
        message: `✓ Rollback applied successfully - restored to checkpoint ${checkpoint.id}`
      };
      
    } catch (error: any) {
      console.error('[rollback_configuration] Error:', error);
      
      if (error.name === 'ZodError') {
        return {
          success: false,
          error: 'Validation error',
          details: error.errors,
          suggestion: 'Check the provided parameters'
        };
      }
      
      return {
        success: false,
        error: error.message || 'Error performing rollback',
        suggestion: 'Check the provided data and try again'
      };
    }
  }
  
  private analyzeRollback(checkpoint: any): {
    entityType: string;
    entityId: string | null;
    changeType: string;
    beforeState: any;
    afterState: any;
    actions: string[];
  } {
    const actions: string[] = [];
    
    switch (checkpoint.changeType) {
      case 'module_activated':
      case 'module_deactivated':
        actions.push(`Revert module ${checkpoint.entityId} status`);
        break;
      case 'module_configured':
        actions.push(`Restore module ${checkpoint.entityId} configurations`);
        break;
      case 'connector_created':
      case 'connector_updated':
        actions.push(`Revert integration ${checkpoint.entityId}`);
        break;
      case 'automation_created':
      case 'automation_updated':
        actions.push(`Revert automation ${checkpoint.entityId}`);
        break;
      default:
        actions.push(`Revert change type ${checkpoint.changeType}`);
    }
    
    return {
      entityType: checkpoint.entityType,
      entityId: checkpoint.entityId,
      changeType: checkpoint.changeType,
      beforeState: checkpoint.beforeSnapshot,
      afterState: checkpoint.afterSnapshot,
      actions
    };
  }
  
  private async applyRollbackInTransaction(
    checkpoint: any,
    plan: any,
    context: ToolExecutionContext,
    tx: any
  ): Promise<any> {
    const appliedChanges: string[] = [];
    
    try {
      // Apply rollback based on entity type
      switch (checkpoint.entityType) {
        case 'tenant_module':
          await this.rollbackModuleInTransaction(checkpoint, appliedChanges, context, tx);
          break;
          
        case 'api_integration':
          await this.rollbackIntegrationInTransaction(checkpoint, appliedChanges, context, tx);
          break;
          
        default:
          return {
            success: false,
            error: `Entity type "${checkpoint.entityType}" not supported for rollback`,
            suggestion: 'Only tenant_module and api_integration are currently supported'
          };
      }
      
      return {
        success: true,
        appliedChanges
      };
      
    } catch (error: any) {
      return {
        success: false,
        error: `Error applying rollback: ${error.message}`,
        partialChanges: appliedChanges
      };
    }
  }
  
  private async rollbackModuleInTransaction(
    checkpoint: any,
    appliedChanges: string[],
    context: ToolExecutionContext,
    tx: any
  ): Promise<void> {
    const beforeState = checkpoint.beforeSnapshot;
    
    if (!beforeState) {
      throw new Error('Previous snapshot missing');
    }
    
    // Restore module state with verification (tenant-scoped table)
    // Note: We use raw SQL for tenant-scoped tables in transactions
    const tableRef = await getTenantTableRef(context.tenantId, 'tenant_modules');
    const result = await tx.execute(
      sql`UPDATE ${tableRef}
          SET is_active = ${beforeState.isActive},
              config = ${JSON.stringify(beforeState.config)}::jsonb,
              updated_at = NOW()
          WHERE id = ${checkpoint.entityId}
          RETURNING *`
    );
    
    // Verify that exactly one row was updated
    if (!result || !result.rows || result.rows.length === 0) {
      throw new Error(
        `Failed to restore module ${checkpoint.entityId}: record not found or does not belong to tenant`
      );
    }
    
    appliedChanges.push(`Module ${checkpoint.entityId} restored`);
  }
  
  private async rollbackIntegrationInTransaction(
    checkpoint: any,
    appliedChanges: string[],
    context: ToolExecutionContext,
    tx: any
  ): Promise<void> {
    const beforeState = checkpoint.beforeSnapshot;
    
    if (!beforeState) {
      throw new Error('Previous snapshot missing');
    }
    
    // Restore integration state with verification
    const result = await tx
      .update(apiIntegrations)
      .set({
        integrationName: beforeState.integrationName,
        baseUrl: beforeState.baseUrl,
        authType: beforeState.authType,
        authConfig: beforeState.authConfig,
        endpoints: beforeState.endpoints,
        isActive: beforeState.isActive,
        metadata: beforeState.metadata
      })
      .where(and(
        eq(apiIntegrations.id, checkpoint.entityId),
        eq(apiIntegrations.tenantId, context.tenantId)
      ))
      .returning();
    
    // Verify that exactly one row was updated
    if (!result || result.length === 0) {
      throw new Error(
        `Failed to restore integration ${checkpoint.entityId}: record not found or does not belong to tenant`
      );
    }
    
    appliedChanges.push(`Integration ${checkpoint.entityId} restored`);
  }
}
