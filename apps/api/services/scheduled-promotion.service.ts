import cron from 'node-cron';
import { db } from '../db';
import { tenants } from '../../../shared/schema';
import { eq } from 'drizzle-orm';
import { PromotionEventsService } from './promotion-events.service';
import { ENVIRONMENTS } from '../../../shared/types/environment';
import type { PromotionManifest } from '../types/promotion.types';
import logger from '../logger';

/**
 * ScheduledPromotionService
 * 
 * Manages scheduled/automated promotions.
 * 
 * Features:
 * - Cron-based scheduling
 * - Auto-promotion for configured tenants
 * - BullMQ job enqueueing
 * 
 * Default schedule: Every day at 2 AM
 */
export class ScheduledPromotionService {
  private eventsService = new PromotionEventsService();
  private isRunning = false;
  
  /**
   * Start the scheduled promotion cron job
   * 
   * Runs every day at 2 AM UTC
   */
  start(): void {
    // Run at 2 AM every day
    cron.schedule('0 2 * * *', async () => {
      await this.runScheduledPromotions();
    });
    
    logger.info('Scheduled promotion service started (cron: 0 2 * * *)');
  }
  
  /**
   * Run scheduled promotions for all eligible tenants
   */
  async runScheduledPromotions(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Scheduled promotion already running, skipping');
      return;
    }
    
    this.isRunning = true;
    const startTime = Date.now();
    
    logger.info('Starting scheduled promotions');
    
    try {
      const manifests = await this.getScheduledPromotions();
      
      logger.info({
        manifestCount: manifests.length,
      }, 'Found scheduled promotions');
      
      for (const manifest of manifests) {
        try {
          await this.eventsService.enqueuePromotion(manifest);
          
          logger.info({
            tenantId: manifest.tenantId,
          }, 'Enqueued scheduled promotion');
          
        } catch (error) {
          logger.error({
            tenantId: manifest.tenantId,
            error: error instanceof Error ? error.message : 'Unknown error',
          }, 'Failed to enqueue scheduled promotion');
        }
      }
      
      const duration = Date.now() - startTime;
      
      logger.info({
        manifestCount: manifests.length,
        duration,
      }, 'Scheduled promotions completed');
      
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 'Failed to run scheduled promotions');
      
    } finally {
      this.isRunning = false;
    }
  }
  
  /**
   * Get tenants with auto-promotion enabled
   * 
   * @returns Array of promotion manifests
   */
  private async getScheduledPromotions(): Promise<PromotionManifest[]> {
    // Future: Add auto-promotion configuration to tenant settings
    // For now, return empty array
    
    logger.debug('Fetching tenants with auto-promotion enabled');
    
    // Example logic (disabled for now):
    // const tenantsWithAutoPromotion = await db
    //   .select()
    //   .from(tenants)
    //   .where(eq(tenants.settings->>'autoPromotion', 'enabled'));
    
    // For each tenant, build promotion manifest based on their rules
    
    return [];
  }
  
  /**
   * Manually trigger scheduled promotions (for testing)
   */
  async triggerManual(): Promise<void> {
    logger.info('Manually triggering scheduled promotions');
    await this.runScheduledPromotions();
  }
}

// Singleton instance
export const scheduledPromotionService = new ScheduledPromotionService();
