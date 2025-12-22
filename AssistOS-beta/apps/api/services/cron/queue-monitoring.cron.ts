import cron from 'node-cron';
import { Sentry } from '../../sentry';
import logger from '../../logger';
import { queueMonitorService } from '../../../worker/services/queue-monitor.service';

/**
 * Queue Monitoring Cron Job
 * 
 * Runs every 5 minutes to collect queue metrics and emit alerts.
 * Monitors BullMQ queue depth and emits Sentry alerts for buildup.
 * 
 * Schedule: every 5 minutes (cron: "asterisk/5 * * * *")
 * 
 * ENABLE_CRON_JOBS=true must be set to activate this cron.
 * This prevents race conditions in multi-instance deployments.
 */
export function startQueueMonitoringCron() {
  // Only run if ENABLE_CRON_JOBS is enabled
  if (process.env.ENABLE_CRON_JOBS !== 'true') {
    logger.info('[Cron] Queue monitoring cron skipped - ENABLE_CRON_JOBS not set to true');
    return;
  }

  logger.info('[Cron] Starting queue monitoring cron job (every 5 minutes)');

  // Run every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    logger.info('[Cron] Collecting queue metrics...');
    
    try {
      const snapshot = await queueMonitorService.collectMetrics();
      
      logger.info({
        queuesMonitored: snapshot.queues.length,
        dlqDepth: snapshot.dlqDepth,
        overallStatus: snapshot.overallStatus,
        timestamp: snapshot.timestamp,
      }, '[Cron] Queue metrics collected successfully');
      
      // Log any queues in warning/critical state
      const problematicQueues = snapshot.queues.filter(
        q => q.status !== 'healthy'
      );
      
      if (problematicQueues.length > 0) {
        logger.warn({
          problematicQueues: problematicQueues.map(q => ({
            name: q.queueName,
            depth: q.totalDepth,
            status: q.status,
            waiting: q.waiting,
            active: q.active,
            delayed: q.delayed,
          }))
        }, '[Cron] Queues needing attention detected');
      }
      
    } catch (error) {
      logger.error({ error }, '[Cron] Failed to collect queue metrics');
      
      Sentry.captureException(error, {
        tags: {
          cron_job: 'queue-monitoring',
          error_type: 'metrics_collection_failed',
        },
        contexts: {
          cronJob: {
            name: 'queue-monitoring',
            schedule: 'every 5 minutes',
            timestamp: new Date().toISOString(),
          },
        },
      });
    }
  });
  
  logger.info('[Cron] Queue monitoring cron scheduled (every 5 minutes)');
}
