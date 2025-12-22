import cron from 'node-cron';
import { runBackupHealthCheck } from '../backup-monitoring.service';
import { Sentry } from '../../sentry';
import logger from '../../logger';

/**
 * Daily backup health check at 6:00 AM UTC
 * Monitors database backup configuration and alerts on failures
 */
export function scheduleBackupMonitoring() {
  // Run daily at 6:00 AM UTC
  cron.schedule('0 6 * * *', async () => {
    logger.info('[Cron] Running scheduled backup health check');
    
    try {
      const healthCheck = await runBackupHealthCheck();
      
      if (!healthCheck.healthy) {
        // Alert to Sentry for unhealthy backup status
        Sentry.captureMessage('Backup health check failed', {
          level: 'error',
          tags: { 
            component: 'backup-monitoring',
            scheduled_check: 'true',
          },
          extra: {
            backupStatus: healthCheck.backupStatus,
            databaseHealth: healthCheck.databaseHealth,
            storageStats: healthCheck.storageStats,
            timestamp: healthCheck.timestamp,
          },
        });
        
        logger.error({ healthCheck }, '[Cron] Backup health check FAILED - alerting to Sentry');
      } else {
        logger.info({ healthCheck }, '[Cron] Backup health check PASSED');
      }
    } catch (error) {
      Sentry.captureException(error, {
        tags: { component: 'backup-monitoring-cron' },
      });
      
      logger.error({ error }, '[Cron] Backup health check cron failed');
    }
  });
  
  logger.info('[Cron] Backup monitoring cron scheduled (daily at 6:00 AM UTC)');
}
