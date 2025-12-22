import logger from '../logger';

/**
 * PromotionMetricsService
 * 
 * Tracks metrics for the promotion system.
 * 
 * Metrics:
 * - Promotion count (by tenant)
 * - Promotion duration
 * - Promotion errors
 * - Record count
 * 
 * Future: Integrate with Prometheus, Datadog, or other monitoring systems
 */
export class PromotionMetricsService {
  private metrics = {
    promotionCount: new Map<string, number>(),
    promotionDurations: [] as number[],
    promotionErrors: 0,
    recordsPromoted: 0,
  };
  
  /**
   * Increment promotion count for tenant
   * 
   * @param tenantId - Tenant ID
   */
  incrementPromotionCount(tenantId: string): void {
    const current = this.metrics.promotionCount.get(tenantId) || 0;
    this.metrics.promotionCount.set(tenantId, current + 1);
    
    logger.debug({
      tenantId,
      count: current + 1,
    }, 'Promotion count incremented');
  }
  
  /**
   * Record promotion duration
   * 
   * @param duration - Duration in milliseconds
   */
  recordPromotionDuration(duration: number): void {
    this.metrics.promotionDurations.push(duration);
    
    // Keep only last 1000 durations to prevent memory leak
    if (this.metrics.promotionDurations.length > 1000) {
      this.metrics.promotionDurations.shift();
    }
    
    logger.debug({
      duration,
      avgDuration: this.getAverageDuration(),
    }, 'Promotion duration recorded');
  }
  
  /**
   * Increment promotion error count
   */
  incrementPromotionErrors(): void {
    this.metrics.promotionErrors++;
    
    logger.debug({
      errorCount: this.metrics.promotionErrors,
    }, 'Promotion error count incremented');
  }
  
  /**
   * Record number of records promoted
   * 
   * @param count - Number of records
   */
  recordRecordsPromoted(count: number): void {
    this.metrics.recordsPromoted += count;
    
    logger.debug({
      count,
      total: this.metrics.recordsPromoted,
    }, 'Records promoted count updated');
  }
  
  /**
   * Get average promotion duration
   * 
   * @returns Average duration in milliseconds
   */
  getAverageDuration(): number {
    if (this.metrics.promotionDurations.length === 0) {
      return 0;
    }
    
    const sum = this.metrics.promotionDurations.reduce((a, b) => a + b, 0);
    return sum / this.metrics.promotionDurations.length;
  }
  
  /**
   * Get metrics summary
   * 
   * @returns Metrics object
   */
  getMetrics() {
    return {
      promotionsByTenant: Object.fromEntries(this.metrics.promotionCount),
      totalPromotions: Array.from(this.metrics.promotionCount.values()).reduce((a, b) => a + b, 0),
      averageDuration: this.getAverageDuration(),
      totalErrors: this.metrics.promotionErrors,
      totalRecordsPromoted: this.metrics.recordsPromoted,
    };
  }
  
  /**
   * Reset all metrics
   */
  reset(): void {
    this.metrics = {
      promotionCount: new Map(),
      promotionDurations: [],
      promotionErrors: 0,
      recordsPromoted: 0,
    };
    
    logger.info('Promotion metrics reset');
  }
}

// Singleton instance
export const promotionMetrics = new PromotionMetricsService();
