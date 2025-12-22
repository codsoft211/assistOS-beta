/**
 * Opportunity Rules Cron Service (CRM Module)
 * 
 * Automatically evaluates opportunity rules for all tenants
 * Creates AI-generated opportunities based on configured rules
 * 
 * Default schedule: Daily at 2:00 AM ('0 2 * * *')
 */

import * as cron from 'node-cron';
import { db } from '../../db';
import { tenants } from '../../../../shared/schema';
import { eq } from 'drizzle-orm';
import logger from '../../logger';
import { OpportunityRulesEngine } from '../../../../packages/modules/comercial/services/opportunityRulesEngine';

export class OpportunityRulesCronService {
  private cronTask: cron.ScheduledTask | null = null;
  private isRunning = false;
  private rulesEngine: OpportunityRulesEngine;

  constructor() {
    this.rulesEngine = new OpportunityRulesEngine();
  }

  /**
   * Start the opportunity rules cron job
   * @param cronExpression - Cron expression (default: daily at 2:00 AM)
   */
  start(cronExpression: string = '0 2 * * *') {
    if (this.cronTask) {
      logger.warn('[OpportunityRules] Cron job already running');
      return;
    }

    // Validate cron expression
    if (!cron.validate(cronExpression)) {
      throw new Error(`Invalid cron expression: ${cronExpression}`);
    }

    logger.info({ cronExpression }, '[OpportunityRules] Starting auto-evaluation cron job');

    this.cronTask = cron.schedule(cronExpression, async () => {
      await this.evaluateAllTenants();
    });

    logger.info('[OpportunityRules] Auto-evaluation cron job started');
  }

  /**
   * Stop the opportunity rules cron job
   */
  stop() {
    if (this.cronTask) {
      this.cronTask.stop();
      this.cronTask = null;
      logger.info('[OpportunityRules] Auto-evaluation cron job stopped');
    }
  }

  /**
   * Evaluate opportunity rules for all active tenants
   */
  private async evaluateAllTenants(): Promise<void> {
    if (this.isRunning) {
      logger.warn('[OpportunityRules] Evaluation already in progress, skipping');
      return;
    }

    this.isRunning = true;
    logger.info('[OpportunityRules] Starting automatic rule evaluation for all tenants');

    try {
      // Get all active tenants
      const activeTenants = await db.query.tenants.findMany({
        where: eq(tenants.status, 'active'),
      });

      logger.info({ count: activeTenants.length }, '[OpportunityRules] Found active tenants');

      let totalOpportunities = 0;
      const results: any[] = [];

      // Evaluate rules for each tenant
      for (const tenant of activeTenants) {
        try {
          const opportunities = await this.evaluateTenant(tenant.id);
          totalOpportunities += opportunities.length;
          
          results.push({
            tenantId: tenant.id,
            tenantName: tenant.name,
            opportunitiesCreated: opportunities.length,
            success: true,
          });
        } catch (error: any) {
          logger.error(
            { tenantId: tenant.id, error: error.message },
            '[OpportunityRules] Error evaluating tenant rules'
          );
          
          results.push({
            tenantId: tenant.id,
            tenantName: tenant.name,
            opportunitiesCreated: 0,
            success: false,
            error: error.message,
          });
        }
      }

      logger.info(
        {
          totalTenants: activeTenants.length,
          totalOpportunities,
          results,
        },
        '[OpportunityRules] Automatic evaluation completed'
      );
    } catch (error: any) {
      logger.error(
        { error: error.message },
        '[OpportunityRules] Error during automatic evaluation'
      );
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Evaluate opportunity rules for a specific tenant
   * Returns array of created opportunities
   */
  private async evaluateTenant(tenantId: string): Promise<any[]> {
    logger.info({ tenantId }, '[OpportunityRules] Evaluating rules for tenant');

    const startTime = Date.now();
    const opportunities = await this.rulesEngine.evaluateAllRules(tenantId);
    const duration = Date.now() - startTime;

    logger.info(
      {
        tenantId,
        opportunitiesCreated: opportunities.length,
        durationMs: duration,
      },
      '[OpportunityRules] Tenant evaluation completed'
    );

    return opportunities;
  }

  /**
   * Manually trigger evaluation for a specific tenant (for testing/on-demand)
   */
  async evaluateTenantManually(tenantId: string): Promise<any[]> {
    logger.info({ tenantId }, '[OpportunityRules] Manual evaluation triggered');
    return await this.evaluateTenant(tenantId);
  }
}

// Singleton instance
export const opportunityRulesCron = new OpportunityRulesCronService();
