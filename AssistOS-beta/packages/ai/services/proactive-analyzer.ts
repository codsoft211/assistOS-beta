/**
 * Proactive Analyzer Service
 * 
 * "Se o AssistME precisa ser perguntado, ainda não está pronto"
 * 
 * Analisa dados do tenant periodicamente e detecta situações que requerem atenção:
 * - Deadline Alerts: Avisos de prazos próximos
 * - Overdue Detection: Itens em atraso
 * - Anomaly Detection: Padrões anormais
 */

import { db } from '../../../apps/api/db';
import { 
  projects, 
  projectTasks, 
  invoices, 
  opportunities,
  type SelectProactiveInsight 
} from '@shared/schema';
import { and, eq, lte, lt, gte, isNull, sql, desc } from 'drizzle-orm';
import { addDays, subDays, differenceInDays } from 'date-fns';
import crypto from 'crypto';

export interface ProactiveInsight {
  id?: string;
  tenantId: string;
  type: 'deadline' | 'overdue' | 'anomaly' | 'opportunity';
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: 'crm' | 'financial' | 'projects' | 'hr';
  title: string;
  description: string;
  suggestedActions: string[];
  affectedEntities: Array<{ type: string; id: string; name: string }>;
  metadata?: Record<string, any>;
  subtype?: string; // Optional subtype to differentiate insights of same type+category
}

/**
 * Generate deterministic ID for an insight based on tenant + type + category + entity type/subtype
 * Uses STABLE key (not dynamic title/count/entity IDs) to ensure same insights get same ID
 * This enables proper upserts when insights are re-analyzed
 */
function generateInsightId(tenantId: string, insight: Omit<ProactiveInsight, 'id'>): string {
  const hash = crypto.createHash('sha256');
  hash.update(tenantId);
  hash.update(insight.type);
  hash.update(insight.category);
  
  // Use subtype if provided (for anomalies), otherwise use entity type
  // e.g., "overdue_financial_invoice", "overdue_financial_payable", "anomaly_financial_revenue_drop"
  const differentiator = insight.subtype || insight.affectedEntities[0]?.type || 'unknown';
  const stableKey = `${insight.type}_${insight.category}_${differentiator}`;
  hash.update(stableKey);
  
  return hash.digest('hex').substring(0, 32);
}

export class ProactiveAnalyzer {
  /**
   * DETECTOR 1: Upcoming Deadlines
   * Detecta prazos próximos que requerem atenção
   */
  async checkUpcomingDeadlines(tenantId: string): Promise<ProactiveInsight[]> {
    const insights: ProactiveInsight[] = [];
    const now = new Date();
    const in3Days = addDays(now, 3);
    const in7Days = addDays(now, 7);

    try {
      // 1. Project Deadlines (endDate < 7 dias) - CONSOLIDATED
      const upcomingProjects = await db.query.projects.findMany({
        where: and(
          eq(projects.tenantId, tenantId),
          isNull(projects.deletedAt),
          lte(projects.endDate, in7Days),
          gte(projects.endDate, now)
        ),
        limit: 20
      });

      if (upcomingProjects.length > 0) {
        const projectsWithDays = upcomingProjects
          .filter(p => p.endDate)
          .map(p => ({
            project: p,
            daysUntil: differenceInDays(new Date(p.endDate!), now)
          }));

        const criticalCount = projectsWithDays.filter(p => p.daysUntil <= 3).length;
        const minDays = Math.min(...projectsWithDays.map(p => p.daysUntil));

        insights.push({
          tenantId,
          type: 'deadline',
          severity: criticalCount > 0 ? 'high' : 'medium',
          category: 'projects',
          title: `${upcomingProjects.length} projeto${upcomingProjects.length !== 1 ? 's' : ''} com prazos próximos`,
          description: `${criticalCount > 0 ? `${criticalCount} crítico${criticalCount !== 1 ? 's' : ''} (<3 dias). ` : ''}Projeto mais próximo: ${minDays} dia${minDays !== 1 ? 's' : ''}`,
          suggestedActions: [
            'Verificar progresso dos projetos',
            'Confirmar se tarefas críticas estão completas',
            'Contactar equipas se necessário',
            'Priorizar projetos críticos'
          ],
          affectedEntities: upcomingProjects.slice(0, 5).map(p => ({
            type: 'project',
            id: p.id,
            name: p.name || 'Sem nome'
          })),
          metadata: {
            count: upcomingProjects.length,
            criticalCount,
            minDaysRemaining: minDays
          }
        });
      }

      // 2. Invoice Payment Deadlines (dueDate < 7 dias)
      const upcomingInvoices = await db.query.invoices.findMany({
        where: and(
          eq(invoices.tenantId, tenantId),
          eq(invoices.invoiceType, 'receivable'),
          sql`${invoices.status} IN ('sent', 'pending', 'issued')`,
          lte(invoices.dueDate, in7Days),
          gte(invoices.dueDate, now)
        ),
        limit: 10
      });

      if (upcomingInvoices.length > 0) {
        const totalAmount = upcomingInvoices.reduce((sum, inv) => {
          const amount = parseFloat(String(inv.totalAmount || '0'));
          return sum + amount;
        }, 0);

        insights.push({
          tenantId,
          type: 'deadline',
          severity: upcomingInvoices.length > 5 ? 'high' : 'medium',
          category: 'financial',
          title: `${upcomingInvoices.length} fatura${upcomingInvoices.length !== 1 ? 's' : ''} a vencer nos próximos 7 dias`,
          description: `Total a receber: €${totalAmount.toFixed(2)}`,
          suggestedActions: [
            'Enviar lembretes de pagamento',
            'Verificar histórico de pagamento dos clientes',
            'Preparar follow-up para pagamentos em atraso'
          ],
          affectedEntities: upcomingInvoices.slice(0, 5).map(inv => ({
            type: 'invoice',
            id: inv.id,
            name: inv.invoiceNumber || 'Sem número'
          })),
          metadata: {
            count: upcomingInvoices.length,
            totalAmount
          }
        });
      }

      // 3. Stale Opportunities (sem atualização há >7 dias)
      const staleDate = subDays(now, 7);
      const staleOpportunities = await db.query.opportunities.findMany({
        where: and(
          eq(opportunities.tenantId, tenantId),
          sql`${opportunities.status} IN ('aberta', 'contactado', 'em_negociacao')`,
          lte(opportunities.updatedAt, staleDate)
        ),
        limit: 10
      });

      if (staleOpportunities.length > 0) {
        insights.push({
          tenantId,
          type: 'deadline',
          severity: 'medium',
          category: 'crm',
          title: `${staleOpportunities.length} oportunidade${staleOpportunities.length !== 1 ? 's' : ''} sem follow-up há >7 dias`,
          description: `Oportunidades podem estar a esfriar. Requer atenção`,
          suggestedActions: [
            'Contactar clientes das oportunidades',
            'Atualizar status das oportunidades',
            'Enviar propostas pendentes'
          ],
          affectedEntities: staleOpportunities.slice(0, 5).map(opp => ({
            type: 'opportunity',
            id: opp.id,
            name: opp.title || 'Sem título'
          })),
          metadata: {
            count: staleOpportunities.length
          }
        });
      }

    } catch (error) {
      console.error('[ProactiveAnalyzer] Error in checkUpcomingDeadlines:', error);
    }

    return insights;
  }

  /**
   * DETECTOR 2: Overdue Items
   * Detecta itens que já passaram do prazo
   */
  async detectOverdueItems(tenantId: string): Promise<ProactiveInsight[]> {
    const insights: ProactiveInsight[] = [];
    const now = new Date();

    try {
      // 1. Overdue Invoices (receivable)
      const overdueInvoices = await db.query.invoices.findMany({
        where: and(
          eq(invoices.tenantId, tenantId),
          eq(invoices.invoiceType, 'receivable'),
          sql`${invoices.status} IN ('sent', 'pending', 'issued')`,
          lt(invoices.dueDate, now)
        ),
        limit: 20
      });

      if (overdueInvoices.length > 0) {
        const totalOverdue = overdueInvoices.reduce((sum, inv) => {
          const amount = parseFloat(String(inv.totalAmount || '0'));
          return sum + amount;
        }, 0);

        const criticalCount = overdueInvoices.filter(inv => {
          const daysPast = differenceInDays(now, new Date(inv.dueDate!));
          return daysPast > 30;
        }).length;

        insights.push({
          tenantId,
          type: 'overdue',
          severity: criticalCount > 0 ? 'critical' : 'high',
          category: 'financial',
          title: `${overdueInvoices.length} fatura${overdueInvoices.length !== 1 ? 's' : ''} em atraso`,
          description: `Total em atraso: €${totalOverdue.toFixed(2)}${criticalCount > 0 ? ` (${criticalCount} >30 dias)` : ''}`,
          suggestedActions: [
            'Enviar lembretes urgentes de pagamento',
            'Contactar clientes com maior dívida',
            'Rever termos de pagamento',
            'Considerar procedimentos de cobrança'
          ],
          affectedEntities: overdueInvoices.slice(0, 5).map(inv => ({
            type: 'invoice',
            id: inv.id,
            name: inv.invoiceNumber || 'Sem número'
          })),
          metadata: {
            count: overdueInvoices.length,
            totalOverdue,
            criticalCount
          }
        });
      }

      // 2. Overdue Project Tasks
      const overdueTasks = await db.query.projectTasks.findMany({
        where: and(
          eq(projectTasks.tenantId, tenantId),
          sql`${projectTasks.status} NOT IN ('completed', 'cancelled')`,
          lt(projectTasks.dueDate, now)
        ),
        with: {
          project: true
        },
        limit: 20
      });

      if (overdueTasks.length > 0) {
        // Group by project
        const tasksByProject = overdueTasks.reduce((acc, task) => {
          const projectId = task.projectId;
          if (!acc[projectId]) acc[projectId] = [];
          acc[projectId].push(task);
          return acc;
        }, {} as Record<string, any[]>);

        const projectsWithOverdue = Object.keys(tasksByProject).length;

        insights.push({
          tenantId,
          type: 'overdue',
          severity: overdueTasks.length > 10 ? 'high' : 'medium',
          category: 'projects',
          title: `${overdueTasks.length} tarefa${overdueTasks.length !== 1 ? 's' : ''} de projeto em atraso`,
          description: `Afetando ${projectsWithOverdue} projeto${projectsWithOverdue !== 1 ? 's' : ''}`,
          suggestedActions: [
            'Rever e repriorizar tarefas atrasadas',
            'Contactar responsáveis pelas tarefas',
            'Avaliar impacto nos prazos dos projetos',
            'Realocar recursos se necessário'
          ],
          affectedEntities: overdueTasks.slice(0, 5).map(task => ({
            type: 'task',
            id: task.id,
            name: task.name || 'Sem nome'
          })),
          metadata: {
            taskCount: overdueTasks.length,
            projectCount: projectsWithOverdue
          }
        });
      }

      // 3. Overdue Payables (if we have bills to pay)
      const overduePayables = await db.query.invoices.findMany({
        where: and(
          eq(invoices.tenantId, tenantId),
          eq(invoices.invoiceType, 'payable'),
          sql`${invoices.status} IN ('pending', 'issued')`,
          lt(invoices.dueDate, now)
        ),
        limit: 10
      });

      if (overduePayables.length > 0) {
        const totalOwed = overduePayables.reduce((sum, inv) => {
          const amount = parseFloat(String(inv.totalAmount || '0'));
          return sum + amount;
        }, 0);

        insights.push({
          tenantId,
          type: 'overdue',
          severity: 'high',
          category: 'financial',
          title: `${overduePayables.length} pagamento${overduePayables.length !== 1 ? 's' : ''} em atraso`,
          description: `Total a pagar: €${totalOwed.toFixed(2)}`,
          suggestedActions: [
            'Processar pagamentos pendentes',
            'Contactar fornecedores para negociar prazos',
            'Verificar saldo bancário disponível'
          ],
          affectedEntities: overduePayables.slice(0, 5).map(inv => ({
            type: 'payable',
            id: inv.id,
            name: inv.invoiceNumber || 'Sem número'
          })),
          metadata: {
            count: overduePayables.length,
            totalOwed
          }
        });
      }

    } catch (error) {
      console.error('[ProactiveAnalyzer] Error in detectOverdueItems:', error);
    }

    return insights;
  }

  /**
   * DETECTOR 3: Anomalies
   * Detecta padrões anormais que requerem investigação
   */
  async detectAnomalies(tenantId: string): Promise<ProactiveInsight[]> {
    const insights: ProactiveInsight[] = [];
    const now = new Date();

    try {
      // 1. Revenue Drop Detection (comparing last 30 days vs previous 30 days)
      const last30Start = subDays(now, 30);
      const last30End = now;
      const prev30Start = subDays(now, 60);
      const prev30End = subDays(now, 30);

      const last30Revenue = await db.query.invoices.findMany({
        where: and(
          eq(invoices.tenantId, tenantId),
          eq(invoices.invoiceType, 'receivable'),
          gte(invoices.issueDate, last30Start),
          lte(invoices.issueDate, last30End)
        )
      });

      const prev30Revenue = await db.query.invoices.findMany({
        where: and(
          eq(invoices.tenantId, tenantId),
          eq(invoices.invoiceType, 'receivable'),
          gte(invoices.issueDate, prev30Start),
          lte(invoices.issueDate, prev30End)
        )
      });

      const last30Total = last30Revenue.reduce((sum, inv) => 
        sum + parseFloat(String(inv.totalAmount || '0')), 0
      );
      
      const prev30Total = prev30Revenue.reduce((sum, inv) => 
        sum + parseFloat(String(inv.totalAmount || '0')), 0
      );

      if (prev30Total > 0) {
        const dropPercentage = ((prev30Total - last30Total) / prev30Total) * 100;
        
        if (dropPercentage > 20) {
          insights.push({
            tenantId,
            type: 'anomaly',
            severity: dropPercentage > 40 ? 'critical' : 'high',
            category: 'financial',
            subtype: 'revenue_drop',
            title: `Queda de ${dropPercentage.toFixed(0)}% nas receitas`,
            description: `Receitas últimos 30 dias (€${last30Total.toFixed(2)}) vs período anterior (€${prev30Total.toFixed(2)})`,
            suggestedActions: [
              'Analisar motivos da queda',
              'Verificar pipeline de vendas',
              'Identificar clientes inativos',
              'Revisar estratégia de preços e marketing'
            ],
            affectedEntities: [],
            metadata: {
              last30Total,
              prev30Total,
              dropPercentage
            }
          });
        }
      }

      // 2. High Opportunity Loss Rate
      const closedOpps = await db.query.opportunities.findMany({
        where: and(
          eq(opportunities.tenantId, tenantId),
          gte(opportunities.updatedAt, subDays(now, 60))
        )
      });

      const wonCount = closedOpps.filter(o => o.status === 'ganha').length;
      const lostCount = closedOpps.filter(o => o.status === 'perdida').length;
      const total = wonCount + lostCount;

      if (total > 5) {
        const winRate = (wonCount / total) * 100;
        
        if (winRate < 20) {
          insights.push({
            tenantId,
            type: 'anomaly',
            severity: 'high',
            category: 'crm',
            subtype: 'conversion_rate',
            title: `Taxa de conversão baixa: ${winRate.toFixed(0)}%`,
            description: `Apenas ${wonCount} oportunidades ganhas de ${total} fechadas (últimos 60 dias)`,
            suggestedActions: [
              'Analisar motivos de perda de oportunidades',
              'Melhorar qualificação de leads',
              'Treinar equipa de vendas',
              'Revisar propostas e abordagem comercial'
            ],
            affectedEntities: [],
            metadata: {
              winRate,
              wonCount,
              lostCount,
              total
            }
          });
        }
      }

      // 3. Project Budget Overruns
      const activeProjects = await db.query.projects.findMany({
        where: and(
          eq(projects.tenantId, tenantId),
          sql`${projects.status} IN ('planning', 'in_progress', 'on_hold')`
        )
      });

      const overBudgetProjects = activeProjects.filter(p => {
        const budget = parseFloat(String(p.plannedBudget || '0'));
        const actual = parseFloat(String(p.actualCost || '0'));
        return budget > 0 && actual > budget * 1.1; // >10% over budget
      });

      if (overBudgetProjects.length > 0) {
        insights.push({
          tenantId,
          type: 'anomaly',
          severity: 'medium',
          category: 'projects',
          subtype: 'budget_overrun',
          title: `${overBudgetProjects.length} projeto${overBudgetProjects.length !== 1 ? 's' : ''} acima do orçamento`,
          description: `Projetos com custos >10% acima do planeado`,
          suggestedActions: [
            'Rever orçamentos dos projetos afetados',
            'Identificar causas dos desvios',
            'Ajustar alocação de recursos',
            'Negociar com clientes se necessário'
          ],
          affectedEntities: overBudgetProjects.slice(0, 5).map(p => ({
            type: 'project',
            id: p.id,
            name: p.name || 'Sem nome'
          })),
          metadata: {
            count: overBudgetProjects.length
          }
        });
      }

    } catch (error) {
      console.error('[ProactiveAnalyzer] Error in detectAnomalies:', error);
    }

    return insights;
  }

  /**
   * DETECTOR 4: Opportunities (Optional for MVP+)
   * Detecta oportunidades proativas
   */
  async detectOpportunities(tenantId: string): Promise<ProactiveInsight[]> {
    const insights: ProactiveInsight[] = [];
    // Future implementation: cross-sell, upsell, retention opportunities
    return insights;
  }

  /**
   * Main Runner - Executa todos os detectors
   */
  async analyzeAll(tenantId: string): Promise<ProactiveInsight[]> {
    console.log(`[ProactiveAnalyzer] Running analysis for tenant ${tenantId}`);
    
    const [
      deadlines,
      overdues,
      anomalies,
      opportunities
    ] = await Promise.all([
      this.checkUpcomingDeadlines(tenantId),
      this.detectOverdueItems(tenantId),
      this.detectAnomalies(tenantId),
      this.detectOpportunities(tenantId)
    ]);

    const allInsights = [
      ...deadlines,
      ...overdues,
      ...anomalies,
      ...opportunities
    ];

    const insightsWithIds = allInsights.map(insight => ({
      ...insight,
      id: generateInsightId(tenantId, insight)
    }));

    console.log(`[ProactiveAnalyzer] Found ${insightsWithIds.length} insights for tenant ${tenantId}`);
    
    return insightsWithIds;
  }
}

// Export singleton
export const proactiveAnalyzer = new ProactiveAnalyzer();
