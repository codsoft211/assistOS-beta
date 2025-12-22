import { db } from '../db';
import { generatedCode, codeGenerationAudit, executionPlans } from '../../../shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import logger from '../logger';
import { CodeValidationService, type CodeFiles, type ValidationResult } from './code-validation.service';
import { coreProtectionService, type MutationRequest } from './core-protection.service';
import { checkQuota, createQuotaViolation, type QuotaViolation } from './code-generation/quota';

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface CodeGenerationRequest {
  tenantId: string;
  userId: string;
  environment: 'sandbox' | 'production';
  blueprintId?: string;
  executionPlanId?: string;
  files: CodeFiles; // { "client/src/components/Button.tsx": "code...", ... }
  metadata?: {
    description?: string;
    conversationId?: string;
    ipAddress?: string;
    userAgent?: string;
  };
}

export interface CodeGenerationResult {
  success: boolean;
  generatedCodeId?: string;
  status: string;
  validationResult?: ValidationResult;
  coreProtectionIssues?: CoreProtectionIssue[];
  quotaViolation?: QuotaViolation;
  error?: string;
}

export interface CoreProtectionIssue {
  filePath: string;
  assetType: string;
  reason: string;
  suggestedAction?: string;
}

export type GenerationStatus = 
  | 'pending' 
  | 'generated' 
  | 'validating' 
  | 'validated' 
  | 'validation_failed'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'deployed'
  | 'failed';

// ============================================================================
// CodeGenerationService - Main Orchestrator
// ============================================================================

export class CodeGenerationService {
  private validationService: CodeValidationService;

  constructor() {
    this.validationService = new CodeValidationService();
  }

  /**
   * Main entry point: Generate code with full validation pipeline
   * 
   * Flow:
   * 1. Create generatedCode record (status: 'pending')
   * 2. Check Core Protection (prevent overwriting protected files)
   * 3. Run multi-stage validation (CodeValidationService)
   * 4. Store validation results
   * 5. Update status based on results
   * 6. Create audit log
   * 7. Return result
   */
  async generateCode(request: CodeGenerationRequest): Promise<CodeGenerationResult> {
    const startTime = Date.now();
    let generatedCodeId: string | undefined;
    
    logger.info({
      tenantId: request.tenantId,
      userId: request.userId,
      environment: request.environment,
      fileCount: Object.keys(request.files).length,
    }, '[CodeGeneration] Starting code generation');

    try {
      // Step 0: Check Resource Quotas (BEFORE any DB operations)
      const quotaCheck = await checkQuota(request.tenantId, request.environment, request.files);
      
      if (!quotaCheck.allowed) {
        const quotaViolation = createQuotaViolation(quotaCheck);
        
        logger.warn({
          tenantId: request.tenantId,
          quotaType: quotaViolation.quotaType,
          limit: quotaViolation.limit,
          currentUsage: quotaViolation.currentUsage,
        }, '[CodeGeneration] ❌ Quota exceeded - request rejected');

        // Create audit log for quota violation (no generatedCodeId since we haven't created record)
        // Note: We can't create full audit entry without generatedCodeId, so we log warning instead
        // Future enhancement: Create separate quota_violation_audit table
        
        return {
          success: false,
          status: 'failed',
          quotaViolation,
          error: quotaViolation.message,
        };
      }

      logger.info({ tenantId: request.tenantId }, '[CodeGeneration] ✅ Quota check passed');

      // Step 1: Create generatedCode record
      generatedCodeId = await this.createGenerationRecord(request);
      
      // Step 2: Check Core Protection (prevent overwriting protected files)
      const coreProtectionIssues = await this.checkCoreProtection(
        request.files,
        request.tenantId,
        request.userId,
        request.environment
      );

      if (coreProtectionIssues.length > 0) {
        const reason = `Core protection violation: ${coreProtectionIssues.map(i => i.filePath).join(', ')}`;
        
        await this.rollbackCode(
          generatedCodeId,
          request.tenantId,
          request.userId,
          request.environment,
          reason
        );

        await this.createAuditLog({
          generatedCodeId,
          tenantId: request.tenantId,
          userId: request.userId,
          environment: request.environment,
          action: 'generate_code',
          metadata: {
            status: 'failed',
            reason: 'core_protection_violation',
            issues: coreProtectionIssues,
            rollbackTriggered: true,
            ipAddress: request.metadata?.ipAddress,
            userAgent: request.metadata?.userAgent,
          },
        });

        logger.warn({
          generatedCodeId,
          issueCount: coreProtectionIssues.length,
        }, '[CodeGeneration] ❌ Core protection violations detected - rollback triggered');

        return {
          success: false,
          generatedCodeId,
          status: 'failed',
          coreProtectionIssues,
          error: 'Code generation blocked by core protection policy',
        };
      }

      logger.info({ generatedCodeId }, '[CodeGeneration] ✅ Core protection check passed');

      // Step 3: Run multi-stage validation
      await this.updateStatus(generatedCodeId, 'validating');
      
      const validationResult = await this.validationService.validateCode(
        generatedCodeId,
        request.files,
        request.tenantId
      );

      // Step 4: Store validation results
      await this.storeValidationResults(generatedCodeId, validationResult);

      // Step 5: Handle validation results
      const newStatus: GenerationStatus = validationResult.passed 
        ? 'validated' 
        : 'validation_failed';
      
      if (!validationResult.passed) {
        const reason = `Validation failed: ${validationResult.errors.slice(0, 3).map(e => e.message).join('; ')}`;
        
        await this.rollbackCode(
          generatedCodeId,
          request.tenantId,
          request.userId,
          request.environment,
          reason
        );
      } else {
        await this.updateStatus(generatedCodeId, newStatus);
      }

      // Step 6: Create audit log
      await this.createAuditLog({
        generatedCodeId,
        tenantId: request.tenantId,
        userId: request.userId,
        environment: request.environment,
        action: 'generate_code',
        metadata: {
          status: newStatus,
          validationPassed: validationResult.passed,
          errorCount: validationResult.errors.length,
          warningCount: validationResult.warnings.length,
          rollbackTriggered: !validationResult.passed,
          duration: Date.now() - startTime,
          ipAddress: request.metadata?.ipAddress,
          userAgent: request.metadata?.userAgent,
        },
      });

      const duration = Date.now() - startTime;
      
      if (validationResult.passed) {
        logger.info({
          generatedCodeId,
          duration,
        }, '[CodeGeneration] ✅ Code generation completed successfully');
      } else {
        logger.warn({
          generatedCodeId,
          errorCount: validationResult.errors.length,
          duration,
        }, '[CodeGeneration] ❌ Code generation failed validation - rollback triggered');
      }

      return {
        success: validationResult.passed,
        generatedCodeId,
        status: newStatus,
        validationResult,
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;

      logger.error({
        error,
        tenantId: request.tenantId,
        generatedCodeId,
        stack: errorStack,
      }, '[CodeGeneration] ❌ Code generation failed with exception');

      // Cleanup: Rollback and create audit log for exception
      try {
        // If we already created a generatedCode record, trigger rollback
        // Note: generatedCodeId might not exist if exception occurred in createGenerationRecord
        if (generatedCodeId) {
          await this.rollbackCode(
            generatedCodeId,
            request.tenantId,
            request.userId,
            request.environment,
            `Exception: ${errorMessage}`
          );
          
          await this.createAuditLog({
            generatedCodeId,
            tenantId: request.tenantId,
            userId: request.userId,
            environment: request.environment,
            action: 'generate_code',
            metadata: {
              status: 'failed',
              reason: `exception: ${errorMessage}`,
              rollbackTriggered: true,
              ipAddress: request.metadata?.ipAddress,
              userAgent: request.metadata?.userAgent,
            },
          });
        }
      } catch (cleanupError) {
        // Log cleanup failure but don't throw (already in error path)
        logger.error({
          cleanupError,
          originalError: error,
        }, '[CodeGeneration] ❌ Failed to cleanup after exception');
      }

      return {
        success: false,
        generatedCodeId, // Return ID so caller can correlate failed run
        status: 'failed',
        error: errorMessage,
      };
    }
  }

  /**
   * Check Core Protection: Validate files against protected core assets
   * Returns list of issues if any files violate core protection policies
   */
  private async checkCoreProtection(
    files: CodeFiles,
    tenantId: string,
    userId: string,
    environment: 'sandbox' | 'production'
  ): Promise<CoreProtectionIssue[]> {
    const issues: CoreProtectionIssue[] = [];

    // Map file paths to asset types
    const pathToAssetType: Record<string, string> = {
      'shared/schema.ts': 'schema',
      'shared/types.ts': 'schema',
      'packages/ai/tools': 'tool_manifest',
      'apps/api/services/module': 'module',
    };

    for (const filePath of Object.keys(files)) {
      // Determine if file is a protected asset
      const assetType = this.getAssetTypeFromPath(filePath, pathToAssetType);
      
      if (!assetType) {
        continue; // Not a protected asset
      }

      // Check with Core Protection Service
      const mutationRequest: MutationRequest = {
        assetType: assetType as any,
        assetId: filePath,
        action: 'update', // Generated code is attempting to update/create file
        tenantId: environment === 'sandbox' ? tenantId : undefined,
        userId,
        role: 'user', // AssistBuild operates with user permissions
        environment,
      };

      const validationResult = await coreProtectionService.validateMutation(mutationRequest);

      if (!validationResult.allowed) {
        issues.push({
          filePath,
          assetType,
          reason: validationResult.reason || 'Core protection policy violation',
          suggestedAction: validationResult.suggestedAction,
        });
      }
    }

    return issues;
  }

  /**
   * Map file path to asset type for core protection checks
   */
  private getAssetTypeFromPath(
    filePath: string,
    pathToAssetType: Record<string, string>
  ): string | null {
    for (const [pattern, assetType] of Object.entries(pathToAssetType)) {
      if (filePath.includes(pattern)) {
        return assetType;
      }
    }
    return null;
  }

  /**
   * Create generatedCode record in database
   */
  private async createGenerationRecord(request: CodeGenerationRequest): Promise<string> {
    const [record] = await db
      .insert(generatedCode)
      .values({
        tenantId: request.tenantId,
        environment: request.environment,
        blueprintId: request.blueprintId,
        executionPlanId: request.executionPlanId,
        files: request.files,
        status: 'pending',
      })
      .returning({ id: generatedCode.id });

    logger.info({ 
      generatedCodeId: record.id,
      fileCount: Object.keys(request.files).length 
    }, '[CodeGeneration] Created generation record');

    return record.id;
  }

  /**
   * Update generation status
   */
  async updateStatus(
    generatedCodeId: string,
    status: GenerationStatus
  ): Promise<void> {
    await db
      .update(generatedCode)
      .set({ status })
      .where(eq(generatedCode.id, generatedCodeId));

    logger.info({ 
      generatedCodeId, 
      status 
    }, '[CodeGeneration] Status updated');
  }

  /**
   * Store validation results in generatedCode record
   */
  private async storeValidationResults(
    generatedCodeId: string,
    validationResult: ValidationResult
  ): Promise<void> {
    // Convert ValidationResult to database format
    const errorsByStage = !validationResult.passed 
      ? this.groupErrorsByStage(validationResult.errors)
      : { syntax: [], lsp: [], security: [], dependency: [] };

    const dbValidationResults = {
      passed: validationResult.passed,
      syntax: validationResult.metadata?.stagesCompleted?.includes('syntax')
        ? { passed: true }
        : errorsByStage.syntax.length > 0
        ? { passed: false, errors: errorsByStage.syntax }
        : undefined,
      lsp: validationResult.metadata?.stagesCompleted?.includes('types')
        ? { passed: true }
        : errorsByStage.lsp.length > 0
        ? { passed: false, errors: errorsByStage.lsp }
        : undefined,
      warnings: validationResult.warnings.map(w => 
        typeof w === 'string' ? w : w.message
      ),
    };

    await db
      .update(generatedCode)
      .set({ validationResults: dbValidationResults })
      .where(eq(generatedCode.id, generatedCodeId));

    logger.info({
      generatedCodeId,
      passed: validationResult.passed,
      errorCount: validationResult.errors.length,
    }, '[CodeGeneration] Validation results stored');
  }

  /**
   * Group validation errors by stage for structured storage
   */
  private groupErrorsByStage(errors: ValidationResult['errors']): {
    syntax: string[];
    lsp: string[];
    security: string[];
    dependency: string[];
  } {
    const grouped = {
      syntax: [] as string[],
      lsp: [] as string[],
      security: [] as string[],
      dependency: [] as string[],
    };

    for (const error of errors) {
      const errorStr = typeof error === 'string' ? error : JSON.stringify(error);
      
      // Heuristic: categorize based on error message content
      if (errorStr.includes('Syntax') || errorStr.includes('parse')) {
        grouped.syntax.push(errorStr);
      } else if (errorStr.includes('type') || errorStr.includes('Cannot find module')) {
        grouped.lsp.push(errorStr);
      } else if (errorStr.includes('security') || errorStr.includes('dangerous')) {
        grouped.security.push(errorStr);
      } else if (errorStr.includes('dependency') || errorStr.includes('import')) {
        grouped.dependency.push(errorStr);
      } else {
        // Default to lsp if unclear
        grouped.lsp.push(errorStr);
      }
    }

    return grouped;
  }

  /**
   * Create audit log entry
   */
  private async createAuditLog(params: {
    generatedCodeId: string;
    tenantId: string;
    userId: string;
    environment: 'sandbox' | 'production';
    action: 'generate_code' | 'deploy_sandbox' | 'deploy_production';
    metadata: {
      status?: string;
      reason?: string;
      validationPassed?: boolean;
      errorCount?: number;
      warningCount?: number;
      duration?: number;
      issues?: CoreProtectionIssue[];
      ipAddress?: string;
      userAgent?: string;
    };
  }): Promise<void> {
    const codeSnapshot = await this.getCodeSnapshot(params.generatedCodeId);

    await db.insert(codeGenerationAudit).values({
      tenantId: params.tenantId,
      environment: params.environment,
      userId: params.userId,
      action: params.action,
      codeSnapshot,
      ipAddress: params.metadata.ipAddress,
      userAgent: params.metadata.userAgent,
    });

    logger.info({
      generatedCodeId: params.generatedCodeId,
      action: params.action,
    }, '[CodeGeneration] Audit log created');
  }

  /**
   * Get code snapshot for audit (truncated if too large)
   */
  private async getCodeSnapshot(generatedCodeId: string): Promise<string> {
    const [record] = await db
      .select({ files: generatedCode.files })
      .from(generatedCode)
      .where(eq(generatedCode.id, generatedCodeId));

    if (!record) {
      return '';
    }

    const snapshot = JSON.stringify(record.files, null, 2);
    const MAX_SNAPSHOT_SIZE = 50000; // 50KB limit for audit logs

    if (snapshot.length > MAX_SNAPSHOT_SIZE) {
      return snapshot.substring(0, MAX_SNAPSHOT_SIZE) + '\n... [TRUNCATED]';
    }

    return snapshot;
  }

  /**
   * Approve generated code (user/admin approval)
   */
  async approveCode(
    generatedCodeId: string,
    userId: string
  ): Promise<void> {
    await db
      .update(generatedCode)
      .set({
        status: 'approved',
        approvedBy: userId,
        approvedAt: new Date(),
      })
      .where(eq(generatedCode.id, generatedCodeId));

    logger.info({ generatedCodeId, userId }, '[CodeGeneration] Code approved');
  }

  /**
   * Reject generated code (user/admin rejection)
   */
  async rejectCode(
    generatedCodeId: string,
    userId: string,
    reason: string
  ): Promise<void> {
    await db
      .update(generatedCode)
      .set({
        status: 'rejected',
        rejectedBy: userId,
        rejectedAt: new Date(),
        rejectionReason: reason,
      })
      .where(eq(generatedCode.id, generatedCodeId));

    logger.info({ generatedCodeId, userId, reason }, '[CodeGeneration] Code rejected');
  }

  /**
   * Deploy code to environment (sandbox or production)
   */
  async deployCode(
    generatedCodeId: string,
    tenantId: string,
    userId: string,
    environment: 'sandbox' | 'production'
  ): Promise<CodeGenerationResult> {
    const [record] = await db
      .select()
      .from(generatedCode)
      .where(eq(generatedCode.id, generatedCodeId));

    if (!record) {
      return {
        success: false,
        status: 'failed',
        error: 'Generated code record not found',
      };
    }

    if (record.status !== 'approved' && record.status !== 'validated') {
      return {
        success: false,
        status: record.status,
        error: `Cannot deploy code with status: ${record.status}`,
      };
    }

    // Update status to deployed
    await db
      .update(generatedCode)
      .set({
        status: 'deployed',
        deployedAt: new Date(),
      })
      .where(eq(generatedCode.id, generatedCodeId));

    // Create audit log
    await this.createAuditLog({
      generatedCodeId,
      tenantId,
      userId,
      environment,
      action: environment === 'sandbox' ? 'deploy_sandbox' : 'deploy_production',
      metadata: {},
    });

    logger.info({
      generatedCodeId,
      environment,
    }, '[CodeGeneration] ✅ Code deployed successfully');

    return {
      success: true,
      generatedCodeId,
      status: 'deployed',
    };
  }

  /**
   * Rollback code generation (mark as failed, cleanup artifacts, create audit trail)
   * 
   * Transaction-based rollback ensures:
   * 1. Status update to 'failed'
   * 2. Generated files removed
   * 3. Execution plans marked as failed
   * 4. Rejection metadata stored
   * 5. Audit trail created
   */
  async rollbackCode(
    generatedCodeId: string,
    tenantId: string,
    userId: string,
    environment: 'sandbox' | 'production',
    reason: string
  ): Promise<void> {
    logger.info({
      generatedCodeId,
      reason,
    }, '[CodeGeneration] Starting rollback...');

    try {
      await db.transaction(async (tx) => {
        // Update status and clear generated files
        await tx
          .update(generatedCode)
          .set({
            status: 'failed',
            rejectedBy: userId,
            rejectedAt: new Date(),
            rejectionReason: `ROLLBACK: ${reason}`,
            files: {}, // Clear generated files (artifact cleanup)
          })
          .where(eq(generatedCode.id, generatedCodeId));

        // Mark associated execution plans as failed (if any)
        const [record] = await tx
          .select({ executionPlanId: generatedCode.executionPlanId })
          .from(generatedCode)
          .where(eq(generatedCode.id, generatedCodeId));

        if (record?.executionPlanId) {
          await tx
            .update(executionPlans)
            .set({
              status: 'failed',
              executionLog: `Rollback triggered: ${reason}`,
            })
            .where(eq(executionPlans.id, record.executionPlanId));
        }

        // Create audit entry for rollback
        await tx.insert(codeGenerationAudit).values({
          generatedCodeId,
          tenantId,
          environment,
          userId,
          action: 'rollback_code',
          codeSnapshot: `Rollback reason: ${reason}`,
        });
      });

      logger.warn({
        generatedCodeId,
        reason,
      }, '[CodeGeneration] ✅ Code rolled back successfully (artifacts cleaned)');
    } catch (error) {
      logger.error({
        error,
        generatedCodeId,
      }, '[CodeGeneration] ❌ Rollback failed');
      throw error;
    }
  }

  /**
   * Get generation status and details
   */
  async getGenerationStatus(generatedCodeId: string): Promise<any> {
    const [record] = await db
      .select()
      .from(generatedCode)
      .where(eq(generatedCode.id, generatedCodeId));

    return record || null;
  }

  /**
   * List recent code generations for tenant
   */
  async listGenerations(
    tenantId: string,
    limit: number = 50
  ): Promise<any[]> {
    return await db
      .select()
      .from(generatedCode)
      .where(eq(generatedCode.tenantId, tenantId))
      .orderBy(desc(generatedCode.createdAt))
      .limit(limit);
  }
}

export const codeGenerationService = new CodeGenerationService();
