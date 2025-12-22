/**
 * AngariacaoQueryBuilder
 * 
 * Implementa ModuleQueryBuilder interface para queries cross-module.
 * Adapter para o Drizzle ORM específico do módulo Angariação.
 */

import type { ModuleQueryBuilder, Filter } from '../base/module.interface';
import { db } from '../../../apps/api/db';
import { 
  angariacaoLeads,
  leadSources,
  leadScoringRules,
  leadActivities
} from '../../../shared/schema';
import { eq, and, or, gt, gte, lt, lte, inArray, like, ilike, sql, desc, asc } from 'drizzle-orm';
import { tenantSchemaService } from '../../../apps/api/services/tenant-schema.service';

export class AngariacaoQueryBuilder implements ModuleQueryBuilder {
  private entityName?: string;
  private filters: Filter[] = [];
  private orderField?: string;
  private orderDirection: 'asc' | 'desc' = 'asc';
  private limitValue?: number;
  private offsetValue?: number;
  
  constructor(private tenantId: string) {}
  
  select(entity: string): ModuleQueryBuilder {
    this.entityName = entity;
    return this;
  }
  
  where(filters: Filter[]): ModuleQueryBuilder {
    this.filters = filters;
    return this;
  }
  
  orderBy(field: string, direction: 'asc' | 'desc'): ModuleQueryBuilder {
    this.orderField = field;
    this.orderDirection = direction;
    return this;
  }
  
  limit(count: number): ModuleQueryBuilder {
    this.limitValue = count;
    return this;
  }
  
  offset(count: number): ModuleQueryBuilder {
    this.offsetValue = count;
    return this;
  }
  
  async execute(schema?: string): Promise<any[]> {
    if (!this.entityName) {
      throw new Error('Entity not specified - call select() first');
    }
    
    // Auto-resolve tenant schema if not provided
    const targetSchema = schema || await tenantSchemaService.getTenantSchemaName(this.tenantId) || 'public';
    const tableName = this.getTableName(this.entityName);
    
    if (!tableName) {
      throw new Error(`Unknown entity: ${this.entityName}`);
    }
    
    // Build WHERE conditions
    const conditions = [`tenant_id = '${this.tenantId}'`];
    
    for (const filter of this.filters) {
      const condition = this.buildSQLCondition(filter);
      if (condition) {
        conditions.push(condition);
      }
    }
    
    // Build query
    let query = `SELECT * FROM "${targetSchema}"."${tableName}"`;
    
    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }
    
    // Apply ORDER BY
    if (this.orderField) {
      query += ` ORDER BY ${this.orderField} ${this.orderDirection.toUpperCase()}`;
    }
    
    // Apply LIMIT
    if (this.limitValue) {
      query += ` LIMIT ${this.limitValue}`;
    }
    
    // Apply OFFSET
    if (this.offsetValue) {
      query += ` OFFSET ${this.offsetValue}`;
    }
    
    const result = await db.execute(sql.raw(query));
    return result.rows as any[];
  }
  
  async count(schema?: string): Promise<number> {
    if (!this.entityName) {
      throw new Error('Entity not specified - call select() first');
    }
    
    // Auto-resolve tenant schema if not provided
    const targetSchema = schema || await tenantSchemaService.getTenantSchemaName(this.tenantId) || 'public';
    const tableName = this.getTableName(this.entityName);
    
    if (!tableName) {
      throw new Error(`Unknown entity: ${this.entityName}`);
    }
    
    // Build WHERE conditions
    const conditions = [`tenant_id = '${this.tenantId}'`];
    
    for (const filter of this.filters) {
      const condition = this.buildSQLCondition(filter);
      if (condition) {
        conditions.push(condition);
      }
    }
    
    let query = `SELECT COUNT(*) as count FROM "${targetSchema}"."${tableName}"`;
    
    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }
    
    const result = await db.execute(sql.raw(query));
    return Number(result.rows[0]?.count || 0);
  }
  
  /**
   * Map entity name to Drizzle table
   */
  private getTableForEntity(entityName: string): any {
    switch (entityName) {
      case 'commercial_leads':
        return angariacaoLeads;
      case 'lead_sources':
        return leadSources;
      case 'lead_scoring_rules':
        return leadScoringRules;
      case 'lead_activities':
        return leadActivities;
      default:
        return null;
    }
  }
  
  /**
   * Build Drizzle filter condition from Filter interface
   */
  private buildFilterCondition(table: any, filter: Filter): any {
    const field = (table as any)[filter.field];
    if (!field) {
      console.warn(`Field ${filter.field} not found in table`);
      return null;
    }
    
    switch (filter.operator) {
      case 'eq':
        return eq(field, filter.value);
      case 'ne':
        return sql`${field} != ${filter.value}`;
      case 'gt':
        return gt(field, filter.value);
      case 'gte':
        return gte(field, filter.value);
      case 'lt':
        return lt(field, filter.value);
      case 'lte':
        return lte(field, filter.value);
      case 'in':
        return inArray(field, filter.value);
      case 'nin':
        return sql`${field} NOT IN ${filter.value}`;
      case 'like':
        return like(field, filter.value);
      case 'ilike':
        return ilike(field, filter.value);
      default:
        console.warn(`Unsupported operator: ${filter.operator}`);
        return null;
    }
  }
  
  // ============================================================================
  // UTILITY METHODS (specific to Angariação)
  // ============================================================================
  
  /**
   * Get leads by status
   */
  async getLeadsByStatus(status: string): Promise<any[]> {
    return await this
      .select('commercial_leads')
      .where([{ field: 'status', operator: 'eq', value: status }])
      .execute();
  }
  
  /**
   * Get leads by source
   */
  async getLeadsBySource(sourceId: string): Promise<any[]> {
    return await this
      .select('commercial_leads')
      .where([{ field: 'leadSource', operator: 'eq', value: sourceId }])
      .execute();
  }
  
  /**
   * Calculate funnel metrics
   */
  async calculateFunnelMetrics(): Promise<{
    total: number;
    new: number;
    contacted: number;
    qualified: number;
    nurturing: number;
    converted: number;
    lost: number;
    conversionRate: number;
  }> {
    const allLeads = await this.select('commercial_leads').execute();
    
    const metrics = {
      total: allLeads.length,
      new: allLeads.filter(l => l.status === 'new').length,
      contacted: allLeads.filter(l => l.status === 'contacted').length,
      qualified: allLeads.filter(l => l.status === 'qualified').length,
      nurturing: allLeads.filter(l => l.status === 'nurturing').length,
      converted: allLeads.filter(l => l.status === 'converted').length,
      lost: allLeads.filter(l => l.status === 'lost').length,
      conversionRate: 0
    };
    
    if (metrics.total > 0) {
      metrics.conversionRate = (metrics.converted / metrics.total) * 100;
    }
    
    return metrics;
  }
  
  /**
   * Get leads with high score (qualified)
   */
  async getHighScoreLeads(minScore: number = 70): Promise<any[]> {
    return await this
      .select('commercial_leads')
      .where([{ field: 'score', operator: 'gte', value: minScore }])
      .orderBy('score', 'desc')
      .execute();
  }
  
  /**
   * Get recent activities for a lead
   */
  async getLeadActivities(leadId: string, limit: number = 50): Promise<any[]> {
    return await db
      .select()
      .from(leadActivities)
      .where(and(
        eq(leadActivities.tenantId, this.tenantId),
        eq(leadActivities.leadId, leadId)
      ))
      .orderBy(desc(leadActivities.createdAt))
      .limit(limit);
  }
  
  /**
   * Get active scoring rules
   */
  async getActiveScoringRules(): Promise<any[]> {
    return await db
      .select()
      .from(leadScoringRules)
      .where(and(
        eq(leadScoringRules.tenantId, this.tenantId),
        eq(leadScoringRules.isActive, true)
      ))
      .orderBy(desc(leadScoringRules.priority));
  }
}
