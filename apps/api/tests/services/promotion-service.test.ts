import { describe, it, expect, beforeEach } from 'vitest';
import { PromotionEventsService } from '../../services/promotion-events.service';
import { PromotionMetricsService } from '../../services/promotion-metrics.service';
import { ENVIRONMENTS } from '../../../../shared/types/environment';
import type { PromotionManifest, PromotionResult } from '../../types/promotion.types';

describe('PromotionEventsService', () => {
  let eventsService: PromotionEventsService;
  
  beforeEach(() => {
    eventsService = new PromotionEventsService();
  });
  
  describe('beforePromotion', () => {
    it('should execute without errors', async () => {
      const manifest: PromotionManifest = {
        tenantId: 'test-tenant',
        environment: ENVIRONMENTS.SANDBOX,
        entities: [
          {
            tableName: 'clients',
            recordIds: ['id-1', 'id-2'],
          },
        ],
        createdAt: new Date(),
      };
      
      await expect(eventsService.beforePromotion(manifest)).resolves.not.toThrow();
    });
  });
  
  describe('afterPromotion', () => {
    it('should execute without errors for successful promotion', async () => {
      const result: PromotionResult = {
        success: true,
        promotedCount: 5,
        auditLogId: 'audit-123',
        duration: 1234,
      };
      
      await expect(eventsService.afterPromotion(result)).resolves.not.toThrow();
    });
    
    it('should execute without errors for failed promotion', async () => {
      const result: PromotionResult = {
        success: false,
        promotedCount: 0,
        errors: ['Test error'],
      };
      
      await expect(eventsService.afterPromotion(result)).resolves.not.toThrow();
    });
  });
});

describe('PromotionMetricsService', () => {
  let metricsService: PromotionMetricsService;
  
  beforeEach(() => {
    metricsService = new PromotionMetricsService();
    metricsService.reset();
  });
  
  describe('incrementPromotionCount', () => {
    it('should increment count for tenant', () => {
      metricsService.incrementPromotionCount('tenant-1');
      metricsService.incrementPromotionCount('tenant-1');
      metricsService.incrementPromotionCount('tenant-2');
      
      const metrics = metricsService.getMetrics();
      
      expect(metrics.promotionsByTenant['tenant-1']).toBe(2);
      expect(metrics.promotionsByTenant['tenant-2']).toBe(1);
      expect(metrics.totalPromotions).toBe(3);
    });
  });
  
  describe('recordPromotionDuration', () => {
    it('should record duration and calculate average', () => {
      metricsService.recordPromotionDuration(1000);
      metricsService.recordPromotionDuration(2000);
      metricsService.recordPromotionDuration(3000);
      
      const metrics = metricsService.getMetrics();
      
      expect(metrics.averageDuration).toBe(2000);
    });
    
    it('should limit stored durations to prevent memory leak', () => {
      // Record 1500 durations
      for (let i = 0; i < 1500; i++) {
        metricsService.recordPromotionDuration(100);
      }
      
      // Average should still be calculated correctly
      const metrics = metricsService.getMetrics();
      expect(metrics.averageDuration).toBe(100);
    });
  });
  
  describe('incrementPromotionErrors', () => {
    it('should increment error count', () => {
      metricsService.incrementPromotionErrors();
      metricsService.incrementPromotionErrors();
      
      const metrics = metricsService.getMetrics();
      
      expect(metrics.totalErrors).toBe(2);
    });
  });
  
  describe('recordRecordsPromoted', () => {
    it('should accumulate total records promoted', () => {
      metricsService.recordRecordsPromoted(10);
      metricsService.recordRecordsPromoted(20);
      metricsService.recordRecordsPromoted(5);
      
      const metrics = metricsService.getMetrics();
      
      expect(metrics.totalRecordsPromoted).toBe(35);
    });
  });
  
  describe('reset', () => {
    it('should reset all metrics', () => {
      metricsService.incrementPromotionCount('tenant-1');
      metricsService.recordPromotionDuration(1000);
      metricsService.incrementPromotionErrors();
      metricsService.recordRecordsPromoted(10);
      
      metricsService.reset();
      
      const metrics = metricsService.getMetrics();
      
      expect(metrics.totalPromotions).toBe(0);
      expect(metrics.averageDuration).toBe(0);
      expect(metrics.totalErrors).toBe(0);
      expect(metrics.totalRecordsPromoted).toBe(0);
    });
  });
});
