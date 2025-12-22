import type { Environment } from '../../../shared/types/environment';

/**
 * Promotion Manifest
 * 
 * Defines which records should be promoted from sandbox to production.
 * Used as input for the promotion workflow.
 */
export interface PromotionManifest {
  tenantId: string;
  environment: Environment;
  entities: {
    tableName: string;
    recordIds: string[];
  }[];
  createdAt: Date;
  createdBy?: string;
}

/**
 * Promotion Result
 * 
 * Output of the promotion workflow.
 * Contains success/failure status and audit information.
 */
export interface PromotionResult {
  success: boolean;
  promotedCount: number;
  errors?: string[];
  auditLogId?: string;
  duration?: number;
  warnings?: string[];
}

/**
 * Promotion Entity Result
 * 
 * Per-entity result during promotion
 */
export interface PromotionEntityResult {
  tableName: string;
  recordId: string;
  success: boolean;
  error?: string;
  skipped?: boolean;
  skipReason?: string;
}
