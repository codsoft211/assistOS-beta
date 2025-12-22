/**
 * Gmail Auto-Sync Cron Service (FASE 3.5-3.6)
 * 
 * Automatically syncs Gmail emails for all tenants with active Gmail accounts
 * Reads dynamic settings from GmailSettingsService:
 * - autoSync: enable/disable automatic sync
 * - syncIntervalMinutes: how often to sync (used for cron expression)
 * - filterPeriodHours: only fetch emails from last X hours
 */

import * as cron from 'node-cron';
import { db } from '../../db';
import { userGmailAccounts } from '../../../../shared/schema';
import { eq } from 'drizzle-orm';
import logger from '../../logger';
import { GmailSettingsService } from '../gmail-settings.service';
import { syncGmailAccount } from '../gmail-sync-helper';

export class GmailSyncService {
  private cronTask: cron.ScheduledTask | null = null;
  private isRunning = false;

  /**
   * Start the Gmail sync cron job
   * @param cronExpression - Cron expression (default: every 15 minutes)
   */
  start(cronExpression: string = '*/15 * * * *') {
    if (this.cronTask) {
      logger.warn('[Gmail Sync] Cron job already running');
      return;
    }

    // Validate cron expression
    if (!cron.validate(cronExpression)) {
      throw new Error(`Invalid cron expression: ${cronExpression}`);
    }

    logger.info({ cronExpression }, '[Gmail Sync] Starting auto-sync cron job');

    this.cronTask = cron.schedule(cronExpression, async () => {
      await this.syncAllTenants();
    });

    logger.info('[Gmail Sync] Auto-sync cron job started');
  }

  /**
   * Stop the Gmail sync cron job
   */
  stop() {
    if (this.cronTask) {
      this.cronTask.stop();
      this.cronTask = null;
      logger.info('[Gmail Sync] Auto-sync cron job stopped');
    }
  }

  /**
   * Sync emails for all tenants with active Gmail accounts
   */
  private async syncAllTenants(): Promise<void> {
    if (this.isRunning) {
      logger.warn('[Gmail Sync] Sync already in progress, skipping');
      return;
    }

    this.isRunning = true;
    logger.info('[Gmail Sync] Starting automatic sync for all tenants');

    try {
      // Get all active Gmail accounts
      const activeAccounts = await db.query.userGmailAccounts.findMany({
        where: eq(userGmailAccounts.isActive, true),
      });

      logger.info({ count: activeAccounts.length }, '[Gmail Sync] Found active Gmail accounts');

      // Group by tenant to avoid duplicate syncs
      const accountsByTenant = new Map<string, typeof activeAccounts>();
      for (const account of activeAccounts) {
        const tenantId = account.tenantId;
        if (!accountsByTenant.has(tenantId)) {
          accountsByTenant.set(tenantId, []);
        }
        accountsByTenant.get(tenantId)!.push(account);
      }

      // Sync each tenant
      for (const [tenantId, accounts] of Array.from(accountsByTenant.entries())) {
        try {
          await this.syncTenant(tenantId, accounts);
        } catch (error: any) {
          logger.error({ tenantId, error: error.message }, '[Gmail Sync] Error syncing tenant');
        }
      }

      logger.info('[Gmail Sync] Automatic sync completed');
    } catch (error: any) {
      logger.error({ error: error.message }, '[Gmail Sync] Error during automatic sync');
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Sync emails for a specific tenant
   * FASE 3.5-3.6: Reads tenant settings and respects autoSync flag
   * FASE 3.8: Checks sync interval before syncing
   */
  private async syncTenant(tenantId: string, accounts: any[]): Promise<void> {
    try {
      // FASE 3.5-3.6: Read tenant settings
      const settings = await GmailSettingsService.getSettings(tenantId);
      
      // Skip if autoSync is disabled for this tenant
      if (!settings.autoSync) {
        logger.info({ tenantId }, '[Gmail Sync] Skipping tenant - autoSync disabled in settings');
        return;
      }

      // FASE 3.8: Check sync interval
      if (settings.lastSyncAt) {
        const minutesSinceLastSync = (Date.now() - new Date(settings.lastSyncAt).getTime()) / 60000;
        if (minutesSinceLastSync < settings.syncIntervalMinutes) {
          logger.info({ 
            tenantId, 
            minutesSinceLastSync: Math.floor(minutesSinceLastSync),
            syncIntervalMinutes: settings.syncIntervalMinutes
          }, '[Gmail Sync] Skipping tenant - sync interval not yet elapsed');
          return;
        }
      }
      
      logger.info({ 
        tenantId, 
        accountCount: accounts.length,
        filterPeriodHours: settings.filterPeriodHours,
        syncIntervalMinutes: settings.syncIntervalMinutes
      }, '[Gmail Sync] Syncing tenant with dynamic settings');
      
      // Sync each account for this tenant
      let totalSynced = 0;
      for (const account of accounts) {
        try {
          const synced = await this.syncAccount(account, settings.filterPeriodHours);
          totalSynced += synced;
        } catch (error: any) {
          logger.error({ 
            tenantId, 
            accountEmail: account.email, 
            error: error.message 
          }, '[Gmail Sync] Error syncing account');
        }
      }
      
      logger.info({ tenantId, totalSynced }, '[Gmail Sync] Tenant sync completed');

      // FASE 3.8: Update lastSyncAt after successful sync
      await GmailSettingsService.updateLastSyncAt(tenantId);
    } catch (error: any) {
      logger.error({ tenantId, error: error.message }, '[Gmail Sync] Error reading tenant settings');
      throw error;
    }
  }

  /**
   * Sync a single Gmail account
   * FASE 3.7: Uses shared helper function to sync Gmail account
   */
  private async syncAccount(account: any, filterPeriodHours: number): Promise<number> {
    // FASE 3.7: Use shared helper function
    const result = await syncGmailAccount({
      tenantId: account.tenantId,
      userId: account.userId,
      account,
      filterPeriodHours,
      maxResults: 100, // Default for cron sync
    });

    if (result.error) {
      logger.error({ 
        email: account.email, 
        error: result.error 
      }, '[Gmail Sync] Error syncing account via helper');
    }

    return result.synced;
  }
}

// Singleton instance
export const gmailSyncService = new GmailSyncService();
