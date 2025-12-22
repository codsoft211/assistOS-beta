import { db } from '../../../../apps/api/db';
import { opportunityRules, opportunities, clients, salesOrders, salesOrderLines } from '../../../../shared/schema';
import { and, eq, sql } from 'drizzle-orm';

interface RuleEvaluationResult {
  ruleId: string;
  triggered: boolean;
  affectedClients: string[];
  reason: string;
}

export class OpportunityRulesEngine {
  /**
   * Avalia TODAS as regras ativas de um tenant
   * Retorna array de oportunidades criadas
   */
  async evaluateAllRules(tenantId: string): Promise<any[]> {
    console.log(`[RulesEngine] Starting evaluation for tenant: ${tenantId}`);
    
    // 1. Buscar regras ativas
    const activeRules = await db
      .select()
      .from(opportunityRules)
      .where(
        and(
          eq(opportunityRules.tenantId, tenantId),
          eq(opportunityRules.isActive, true)
        )
      );

    if (activeRules.length === 0) {
      console.log(`[RulesEngine] No active rules for tenant ${tenantId}`);
      return [];
    }

    console.log(`[RulesEngine] Found ${activeRules.length} active rules`);

    const createdOpportunities = [];

    // 2. Avaliar cada regra
    for (const rule of activeRules) {
      try {
        const result = await this.evaluateRule(rule, tenantId);
        
        if (result.triggered && result.affectedClients.length > 0) {
          console.log(`[RulesEngine] Rule ${rule.id} triggered for ${result.affectedClients.length} clients`);
          
          // 3. Criar oportunidades para clientes afetados
          for (const clientId of result.affectedClients) {
            const opportunity = await this.createOpportunityFromRule(rule, clientId, result.reason, tenantId);
            createdOpportunities.push(opportunity);
          }
        }
      } catch (error) {
        console.error(`[RulesEngine] Error evaluating rule ${rule.id}:`, error);
      }
    }

    console.log(`[RulesEngine] Created ${createdOpportunities.length} opportunities`);
    return createdOpportunities;
  }

  /**
   * Avalia UMA regra específica
   */
  private async evaluateRule(rule: any, tenantId: string): Promise<RuleEvaluationResult> {
    // Legacy compatibility: Skip rules without conditions
    if (!rule.conditions || Object.keys(rule.conditions).length === 0) {
      console.warn(`[RulesEngine] Skipping legacy rule ${rule.id} without conditions`);
      return {
        ruleId: rule.id,
        triggered: false,
        affectedClients: [],
        reason: 'Legacy rule - missing conditions'
      };
    }

    const trigger = rule.ruleType;
    const conditions = rule.conditions;
    
    console.log(`[RulesEngine] Evaluating rule ${rule.id} (${rule.name}) - Trigger: ${trigger}`);

    switch (trigger) {
      case 'client_inactive':
        return await this.evaluateClientInactiveRule(rule, conditions, tenantId);
      
      case 'product_recurring':
        return await this.evaluateProductRecurringRule(rule, conditions, tenantId);
      
      case 'cross_sell':
        return await this.evaluateCrossSellRule(rule, conditions, tenantId);
      
      case 'upsell':
        return await this.evaluateUpsellRule(rule, conditions, tenantId);
      
      case 'churn_risk':
        return await this.evaluateChurnRiskRule(rule, conditions, tenantId);
      
      default:
        console.warn(`[RulesEngine] Unknown trigger type: ${trigger}`);
        return {
          ruleId: rule.id,
          triggered: false,
          affectedClients: [],
          reason: `Unknown trigger: ${trigger}`
        };
    }
  }

  /**
   * REGRA 1: Cliente Inativo
   * Detecta clientes que não compraram há X dias
   * 
   * Conditions: { daysInactive: 90, minLifetimeValue: 1000 }
   */
  private async evaluateClientInactiveRule(
    rule: any,
    conditions: any,
    tenantId: string
  ): Promise<RuleEvaluationResult> {
    if (typeof conditions?.daysInactive === 'undefined' || typeof conditions?.minLifetimeValue === 'undefined') {
      throw new Error(`[RulesEngine] Missing required conditions for client_inactive rule: ${rule.id}. Required: daysInactive, minLifetimeValue`);
    }
    
    const daysInactive = conditions.daysInactive;
    const minLifetimeValue = conditions.minLifetimeValue;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysInactive);

    const inactiveClients = await db.execute(sql`
      SELECT 
        c.id as client_id,
        c.name,
        MAX(so.order_date) as last_order_date,
        SUM(so.total_amount) as lifetime_value,
        COUNT(so.id) as total_orders
      FROM ${clients} c
      LEFT JOIN ${salesOrders} so ON so.client_id = c.id AND so.tenant_id = ${tenantId}
      WHERE c.tenant_id = ${tenantId}
      GROUP BY c.id, c.name
      HAVING 
        MAX(so.order_date) < ${cutoffDate.toISOString()} 
        AND SUM(so.total_amount) >= ${minLifetimeValue}
    `);

    const affectedClientIds = inactiveClients.rows.map((row: any) => row.client_id);

    return {
      ruleId: rule.id,
      triggered: affectedClientIds.length > 0,
      affectedClients: affectedClientIds,
      reason: `Cliente sem compras há ${daysInactive} dias`
    };
  }

  /**
   * REGRA 2: Produto Recorrente
   * Detecta clientes que compravam produto X regularmente mas pararam
   * 
   * Conditions: { productName: "Produto X", expectedFrequencyDays: 30, gracePeriodDays: 45 }
   */
  private async evaluateProductRecurringRule(
    rule: any,
    conditions: any,
    tenantId: string
  ): Promise<RuleEvaluationResult> {
    if (!conditions?.productName || typeof conditions?.expectedFrequencyDays === 'undefined' || typeof conditions?.gracePeriodDays === 'undefined') {
      throw new Error(`[RulesEngine] Missing required conditions for product_recurring rule: ${rule.id}. Required: productName, expectedFrequencyDays, gracePeriodDays`);
    }
    
    const productName = conditions.productName;
    const expectedFrequency = conditions.expectedFrequencyDays;
    const gracePeriod = conditions.gracePeriodDays;
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - gracePeriod);

    const affectedClients = await db.execute(sql`
      SELECT DISTINCT
        so.client_id,
        MAX(so.order_date) as last_purchase_date,
        COUNT(*) as purchase_count
      FROM ${salesOrders} so
      JOIN ${salesOrderLines} sol ON sol.order_id = so.id
      WHERE 
        so.tenant_id = ${tenantId}
        AND sol.description ILIKE ${'%' + productName + '%'}
        AND so.order_date < ${cutoffDate.toISOString()}
      GROUP BY so.client_id
      HAVING COUNT(*) >= 2
    `);

    const affectedClientIds = affectedClients.rows.map((row: any) => row.client_id);

    return {
      ruleId: rule.id,
      triggered: affectedClientIds.length > 0,
      affectedClients: affectedClientIds,
      reason: `Produto recorrente "${productName}" não comprado há ${gracePeriod} dias`
    };
  }

  /**
   * REGRA 3: Cross-Sell
   * Detecta clientes que compraram produto X mas nunca compraram produto Y
   * 
   * Conditions: { boughtProduct: "Produto X", suggestedProduct: "Produto Y", minOrders: 3 }
   */
  private async evaluateCrossSellRule(
    rule: any,
    conditions: any,
    tenantId: string
  ): Promise<RuleEvaluationResult> {
    if (!conditions?.boughtProduct || !conditions?.suggestedProduct || typeof conditions?.minOrders === 'undefined') {
      throw new Error(`[RulesEngine] Missing required conditions for cross_sell rule: ${rule.id}. Required: boughtProduct, suggestedProduct, minOrders`);
    }
    
    const boughtProduct = conditions.boughtProduct;
    const suggestedProduct = conditions.suggestedProduct;
    const minOrders = conditions.minOrders;

    const affectedClients = await db.execute(sql`
      SELECT client_id
      FROM (
        SELECT 
          so.client_id,
          SUM(CASE WHEN sol.description ILIKE ${'%' + boughtProduct + '%'} THEN 1 ELSE 0 END) as bought_count,
          SUM(CASE WHEN sol.description ILIKE ${'%' + suggestedProduct + '%'} THEN 1 ELSE 0 END) as suggested_count
        FROM ${salesOrders} so
        JOIN ${salesOrderLines} sol ON sol.order_id = so.id
        WHERE so.tenant_id = ${tenantId}
        GROUP BY so.client_id
      ) subq
      WHERE bought_count >= ${minOrders} AND suggested_count = 0
    `);

    const affectedClientIds = affectedClients.rows.map((row: any) => row.client_id);

    return {
      ruleId: rule.id,
      triggered: affectedClientIds.length > 0,
      affectedClients: affectedClientIds,
      reason: `Cross-sell: Cliente comprou "${boughtProduct}" mas não "${suggestedProduct}"`
    };
  }

  /**
   * REGRA 4: Upsell
   * Detecta clientes com gasto total < threshold mas potencial para mais
   * 
   * Conditions: { minLifetimeValue: 5000, maxLifetimeValue: 20000, minOrders: 5 }
   */
  private async evaluateUpsellRule(
    rule: any,
    conditions: any,
    tenantId: string
  ): Promise<RuleEvaluationResult> {
    if (typeof conditions?.minLifetimeValue === 'undefined' || typeof conditions?.maxLifetimeValue === 'undefined' || typeof conditions?.minOrders === 'undefined') {
      throw new Error(`[RulesEngine] Missing required conditions for upsell rule: ${rule.id}. Required: minLifetimeValue, maxLifetimeValue, minOrders`);
    }
    
    const minValue = conditions.minLifetimeValue;
    const maxValue = conditions.maxLifetimeValue;
    const minOrders = conditions.minOrders;

    const affectedClients = await db.execute(sql`
      SELECT 
        so.client_id,
        SUM(so.total_amount) as lifetime_value,
        COUNT(so.id) as total_orders
      FROM ${salesOrders} so
      WHERE so.tenant_id = ${tenantId}
      GROUP BY so.client_id
      HAVING 
        SUM(so.total_amount) BETWEEN ${minValue} AND ${maxValue}
        AND COUNT(so.id) >= ${minOrders}
    `);

    const affectedClientIds = affectedClients.rows.map((row: any) => row.client_id);

    return {
      ruleId: rule.id,
      triggered: affectedClientIds.length > 0,
      affectedClients: affectedClientIds,
      reason: `Upsell: Cliente gastou €${minValue}-€${maxValue}, potencial para mais`
    };
  }

  /**
   * REGRA 5: Churn Risk
   * Detecta clientes com diminuição de frequência/valor
   * 
   * Conditions: { comparisonMonths: 3, minDecreasePercent: 30 }
   */
  private async evaluateChurnRiskRule(
    rule: any,
    conditions: any,
    tenantId: string
  ): Promise<RuleEvaluationResult> {
    if (typeof conditions?.comparisonMonths === 'undefined' || typeof conditions?.minDecreasePercent === 'undefined') {
      throw new Error(`[RulesEngine] Missing required conditions for churn_risk rule: ${rule.id}. Required: comparisonMonths, minDecreasePercent`);
    }
    
    const comparisonMonths = conditions.comparisonMonths;
    const minDecreasePercent = conditions.minDecreasePercent;

    const monthsAgo = new Date();
    monthsAgo.setMonth(monthsAgo.getMonth() - comparisonMonths);

    const affectedClients = await db.execute(sql`
      SELECT 
        client_id,
        recent_value,
        previous_value,
        ((previous_value - recent_value) / previous_value * 100) as decrease_percent
      FROM (
        SELECT 
          client_id,
          SUM(CASE WHEN order_date >= ${monthsAgo.toISOString()} THEN total_amount ELSE 0 END) as recent_value,
          SUM(CASE WHEN order_date < ${monthsAgo.toISOString()} THEN total_amount ELSE 0 END) as previous_value
        FROM ${salesOrders}
        WHERE tenant_id = ${tenantId}
        GROUP BY client_id
      ) subq
      WHERE previous_value > 0 
        AND ((previous_value - recent_value) / previous_value * 100) >= ${minDecreasePercent}
    `);

    const affectedClientIds = affectedClients.rows.map((row: any) => row.client_id);

    return {
      ruleId: rule.id,
      triggered: affectedClientIds.length > 0,
      affectedClients: affectedClientIds,
      reason: `Churn risk: Diminuição de ${minDecreasePercent}% no valor`
    };
  }

  /**
   * Cria oportunidade a partir de regra ativada
   */
  private async createOpportunityFromRule(
    rule: any,
    clientId: string,
    reason: string,
    tenantId: string
  ): Promise<any> {
    // Legacy compatibility: Skip if action is missing
    if (!rule.action || Object.keys(rule.action).length === 0) {
      console.warn(`[RulesEngine] Skipping opportunity creation for legacy rule ${rule.id} without action`);
      throw new Error(`[RulesEngine] Legacy rule ${rule.id} missing action configuration`);
    }

    const existing = await db
      .select()
      .from(opportunities)
      .where(
        and(
          eq(opportunities.clientId, clientId),
          eq(opportunities.ruleId, rule.id),
          eq(opportunities.status, 'open')
        )
      )
      .limit(1);

    if (existing.length > 0) {
      console.log(`[RulesEngine] Opportunity already exists for client ${clientId} and rule ${rule.id}`);
      return existing[0];
    }

    if (!rule.action.opportunityType || !rule.action.opportunityPriority) {
      throw new Error(`[RulesEngine] Missing required action fields for rule: ${rule.id}. Required: action.opportunityType, action.opportunityPriority`);
    }
    
    const action = rule.action;
    const opportunityType = action.opportunityType;
    const opportunityPriority = action.opportunityPriority;

    const [opportunity] = await db
      .insert(opportunities)
      .values({
        tenantId,
        clientId,
        ruleId: rule.id,
        title: rule.name,
        description: reason,
        type: opportunityType,
        estimatedValue: rule.triggers?.orderValueThreshold?.toString() || '1000',
        probability: 50,
        priority: opportunityPriority,
        status: 'open',
        source: 'ai_generated',
        triggeredAt: new Date(),
        triggerData: {
          ruleId: rule.id,
          ruleName: rule.name,
          trigger: reason,
          evaluatedAt: new Date().toISOString()
        }
      })
      .returning();

    console.log(`[RulesEngine] Created opportunity ${opportunity.id} for client ${clientId}`);
    return opportunity;
  }

  /**
   * Método de teste para avaliar regra única (útil para debug/preview)
   */
  async testRule(ruleId: string, tenantId: string): Promise<RuleEvaluationResult> {
    const [rule] = await db
      .select()
      .from(opportunityRules)
      .where(
        and(
          eq(opportunityRules.id, ruleId),
          eq(opportunityRules.tenantId, tenantId)
        )
      );

    if (!rule) {
      throw new Error(`Rule ${ruleId} not found`);
    }

    return await this.evaluateRule(rule, tenantId);
  }
}

export const opportunityRulesEngine = new OpportunityRulesEngine();
