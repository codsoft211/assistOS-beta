import type { PromotionManifest, PromotionResult } from '../types/promotion.types';
import logger from '../logger';

/**
 * PromotionEventsService
 * 
 * Manages events and hooks for the promotion workflow.
 * 
 * Features:
 * - Pre/post promotion hooks
 * - BullMQ job enqueueing
 * - Event emission for monitoring
 */
export class PromotionEventsService {
  /**
   * Hook: Before promotion
   * 
   * Called before promotion workflow starts.
   * Use for validation, pre-checks, or notifications.
   * 
   * @param manifest - Promotion manifest
   */
  async beforePromotion(manifest: PromotionManifest): Promise<void> {
    logger.info({
      tenantId: manifest.tenantId,
      environment: manifest.environment,
      entityCount: manifest.entities.length,
      totalRecords: manifest.entities.reduce((sum, e) => sum + e.recordIds.length, 0),
    }, 'beforePromotion hook triggered');
    
    // Future: Add validation logic here
    // - Check user permissions
    // - Validate data integrity
    // - Send notifications
  }
  
  /**
   * Hook: After promotion
   * 
   * Called after promotion workflow completes (success or failure).
   * Use for cleanup, notifications, or metrics.
   * 
   * @param result - Promotion result
   */
  async afterPromotion(result: PromotionResult): Promise<void> {
    logger.info({
      success: result.success,
      promotedCount: result.promotedCount,
      duration: result.duration,
      auditLogId: result.auditLogId,
    }, 'afterPromotion hook triggered');
    
    // Future: Add post-promotion logic here
    // - Send success/failure notifications
    // - Update metrics
    // - Trigger downstream workflows
    
    if (!result.success) {
      logger.error({
        errors: result.errors,
      }, 'Promotion failed - afterPromotion hook');
    }
  }
  
  /**
   * Enqueue promotion to BullMQ
   * 
   * Adds promotion job to queue for async processing.
   * 
   * @param manifest - Promotion manifest
   * @returns Job ID if enqueued, undefined if queue unavailable
   */
  async enqueuePromotion(manifest: PromotionManifest): Promise<string | undefined> {
    logger.info({
      tenantId: manifest.tenantId,
      environment: manifest.environment,
      entityCount: manifest.entities.length,
    }, 'Enqueueing promotion job');
    
    try {
      // Import queue dynamically to avoid circular dependencies
      const { promotionQueue } = await import('../../worker/queues/promotion');
      
      if (!promotionQueue) {
        logger.warn('Promotion queue not available - promotion will not be enqueued');
        return undefined;
      }
      
      const job = await promotionQueue.add('promote', manifest, {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: 100,
        removeOnFail: 500,
      });
      
      logger.info({
        jobId: job.id,
        tenantId: manifest.tenantId,
      }, 'Promotion job enqueued successfully');
      
      return job.id;
      
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error',
        tenantId: manifest.tenantId,
      }, 'Failed to enqueue promotion job');
      
      throw error;
    }
  }
}
