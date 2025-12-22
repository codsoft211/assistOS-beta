import cron from 'node-cron';
import { db } from './db';
import { tenants } from '../../shared/schema';
import { eq } from 'drizzle-orm';
import { analysisQueue } from './queues/analysis';
import { patternAggregationQueue } from './queues/pattern-aggregation';
import { financeDunningQueue } from './queues/finance-dunning';

export function startScheduler() {
  console.log('[Scheduler] Inicializando cron jobs...');

  cron.schedule('0 2 * * *', async () => {
    console.log('[Scheduler] Executando análise diária de patterns');
    
    if (!analysisQueue) {
      console.warn('[Scheduler] Analysis queue não disponível - saltando análise de patterns');
      return;
    }

    try {
      const activeTenants = await db.query.tenants.findMany({
        where: eq(tenants.status, 'active'),
      });

      for (const tenant of activeTenants) {
        await analysisQueue.add('analyze-patterns', {
          tenantId: tenant.id,
          environment: 'production', // Scheduled jobs run against production environment
        });
      }

      console.log(`[Scheduler] ${activeTenants.length} análises de patterns agendadas`);
    } catch (error) {
      console.error('[Scheduler] Erro ao agendar análise de patterns:', error);
    }
  });

  console.log('[Scheduler] ✅ Cron job configurado: Análise de patterns diária às 2h');

  // Cross-tenant pattern aggregation - runs daily at 3 AM (after single-tenant analysis)
  cron.schedule('0 3 * * *', async () => {
    console.log('[Scheduler] Executando agregação cross-tenant de patterns');
    
    if (!patternAggregationQueue) {
      console.warn('[Scheduler] Pattern aggregation queue não disponível - saltando agregação');
      return;
    }

    try {
      // Run aggregation for sandbox only (production GATED pending middleware fix)
      // CRITICAL: Production aggregation disabled until:
      // 1. Request context middleware populates req.environment from tenant.defaultEnvironment
      // 2. Aggregation uses watermark system for true cumulative idempotency
      // See replit.md technical debt section for details
      await patternAggregationQueue.add('aggregate-cross-tenant-patterns', {
        environment: 'sandbox',
      });
      
      // TODO (Post-MVP): Enable production after middleware audit + watermark implementation
      // await patternAggregationQueue.add('aggregate-cross-tenant-patterns', {
      //   environment: 'production',
      // });

      console.log('[Scheduler] 1 job de agregação cross-tenant agendado (sandbox only - production gated)');
    } catch (error) {
      console.error('[Scheduler] Erro ao agendar agregação cross-tenant:', error);
    }
  });

  console.log('[Scheduler] ✅ Cron job configurado: Agregação cross-tenant diária às 3h');

  // Finance Module Jobs

  // Dunning Campaigns Automation - runs daily at 9 AM
  cron.schedule('0 9 * * *', async () => {
    console.log('[Scheduler] Executando automação de cobranças (dunning)');
    
    if (!financeDunningQueue) {
      console.warn('[Scheduler] Finance dunning queue não disponível - saltando automação de cobranças');
      return;
    }

    try {
      await financeDunningQueue.add('dunning-automation', {
        environment: 'production',
      });

      console.log('[Scheduler] Job de automação de cobranças agendado');
    } catch (error) {
      console.error('[Scheduler] Erro ao agendar automação de cobranças:', error);
    }
  });

  console.log('[Scheduler] ✅ Cron job configurado: Automação de cobranças diária às 9h');

  // Cashflow Forecast Refresh - runs every 6 hours (00:00, 06:00, 12:00, 18:00)
  cron.schedule('0 */6 * * *', async () => {
    console.log('[Scheduler] Executando refresh de previsão de cashflow');
    
    if (!analysisQueue) {
      console.warn('[Scheduler] Analysis queue não disponível - saltando refresh de cashflow');
      return;
    }

    try {
      await analysisQueue.add('cashflow-refresh', {
        environment: 'production',
      });

      console.log('[Scheduler] Job de refresh de cashflow agendado');
    } catch (error) {
      console.error('[Scheduler] Erro ao agendar refresh de cashflow:', error);
    }
  });

  console.log('[Scheduler] ✅ Cron job configurado: Refresh de cashflow a cada 6 horas');

  // Dashboard KPI Caching - runs every 1 hour
  cron.schedule('0 * * * *', async () => {
    console.log('[Scheduler] Executando cache de KPIs do dashboard');
    
    if (!analysisQueue) {
      console.warn('[Scheduler] Analysis queue não disponível - saltando cache de KPIs');
      return;
    }

    try {
      await analysisQueue.add('kpi-cache', {
        environment: 'production',
      });

      console.log('[Scheduler] Job de cache de KPIs agendado');
    } catch (error) {
      console.error('[Scheduler] Erro ao agendar cache de KPIs:', error);
    }
  });

  console.log('[Scheduler] ✅ Cron job configurado: Cache de KPIs a cada hora');

  // Scheduled Subscription Plan Changes - runs every hour
  cron.schedule('0 * * * *', async () => {
    console.log('[Scheduler] Executando processamento de mudanças de plano agendadas');
    
    try {
      // Import service dynamically to avoid circular dependencies
      const { scheduledSubscriptionChangesService } = await import('../api/services/scheduled-subscription-changes.service');
      await scheduledSubscriptionChangesService.processScheduledChanges();
      
      console.log('[Scheduler] Processamento de mudanças de plano agendadas concluído');
    } catch (error) {
      console.error('[Scheduler] Erro ao processar mudanças de plano agendadas:', error);
    }
  });

  console.log('[Scheduler] ✅ Cron job configurado: Processamento de mudanças de plano agendadas a cada hora');
}
