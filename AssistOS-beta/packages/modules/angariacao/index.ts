/**
 * Módulo Angariação - Lead Generation & Capture
 * 
 * Sistema completo de captura e qualificação automatizada de leads.
 * 
 * Entidades principais:
 * - Leads (commercial_leads)
 * - Lead Sources (lead_sources)
 * - Lead Scoring Rules (lead_scoring_rules)
 * - Lead Activities (lead_activities)
 */

import type {
  IModule,
  ModuleMetadata,
  EntityDefinition,
  WorkflowDefinition,
  ModuleTool,
  RouteDefinition,
  ModuleHooks,
  ModuleDataInterface,
  ModuleContext,
  Filter
} from '../base/module.interface';

import { AngariacaoQueryBuilder } from './query-builder';
import { angariacaoTools } from './tools/index';
import { angariacaoRoutes } from './routes/index';
import { angariacaoWorkflows } from './workflows/index';
import { db } from '../../../apps/api/db';
import { eq, and } from 'drizzle-orm';

// ============================================================================
// ANGARIAÇÃO MODULE
// ============================================================================

export class AngariacaoModule implements IModule {
  private tenantId?: string;
  
  metadata: ModuleMetadata = {
    id: 'lead-generation',
    name: 'Lead Generation',
    version: '1.0.0',
    category: 'crm',
    description: 'Automated lead capture and qualification with AI scoring and conversion funnel',
    icon: 'Target',
    dependencies: [],
    permissions: [
      { key: 'lead-generation.read', name: 'View lead generation data' },
      { key: 'lead-generation.write', name: 'Create/edit leads' },
      { key: 'lead-generation.delete', name: 'Delete leads' },
      { key: 'lead-generation.qualify', name: 'Qualify and assign leads' },
      { key: 'lead-generation.convert', name: 'Convert leads to customers' },
      { key: 'lead-generation.manage_sources', name: 'Manage lead sources' },
      { key: 'lead-generation.manage_scoring', name: 'Manage scoring rules' },
      { key: 'lead-generation.configure', name: 'Configure module fields and settings' }
    ]
  };
  
  // ============================================================================
  // ENTITIES (mapeadas das tabelas DB)
  // ============================================================================
  
  entities: EntityDefinition[] = [
    {
      name: 'commercial_leads',
      schema: {
        fields: [
          { name: 'id', type: 'text', required: true },
          { name: 'email', type: 'email', required: true },
          { name: 'firstName', type: 'text' },
          { name: 'lastName', type: 'text' },
          { name: 'phone', type: 'phone' },
          { name: 'company', type: 'text' },
          { name: 'nif', type: 'text' },
          { name: 'leadSource', type: 'text' },
          { name: 'campaign', type: 'text' },
          { name: 'medium', type: 'text' },
          { name: 'status', type: 'enum', options: ['new', 'contacted', 'qualified', 'nurturing', 'converted', 'lost'], required: true, default: 'new' },
          { name: 'score', type: 'number', default: 0 },
          { name: 'assignedToUserId', type: 'relation', ref: 'users' },
          { name: 'convertedToClientId', type: 'text' },
          { name: 'convertedAt', type: 'datetime' },
          { name: 'customFields', type: 'json' },
          { name: 'notes', type: 'text' },
          { name: 'lastActivityAt', type: 'datetime' }
        ],
        timestamps: true,
        tenantIsolation: true
      },
      relationships: [
        { type: 'belongsTo', target: 'lead_sources', foreignKey: 'leadSource' },
        { type: 'belongsTo', target: 'users', foreignKey: 'assignedToUserId' },
        { type: 'hasMany', target: 'lead_activities', foreignKey: 'leadId' }
      ],
      indexes: [
        { fields: ['email'], unique: true },
        { fields: ['status'] },
        { fields: ['leadSource'] },
        { fields: ['score'] },
        { fields: ['assignedToUserId'] }
      ],
      softDelete: false
    },
    
    {
      name: 'lead_sources',
      schema: {
        fields: [
          { name: 'id', type: 'text', required: true },
          { name: 'sourceType', type: 'enum', options: ['instantly', 'facebook_ads', 'linkedin', 'web_form', 'manual', 'referral', 'other'], required: true },
          { name: 'sourceName', type: 'text', required: true },
          { name: 'isActive', type: 'boolean', default: true },
          { name: 'autoAssignToUserId', type: 'relation', ref: 'users' },
          { name: 'autoApplyTags', type: 'json' },
          { name: 'defaultScore', type: 'number', default: 0 },
          { name: 'apiConfig', type: 'json' },
          { name: 'stats', type: 'json' }
        ],
        timestamps: true,
        tenantIsolation: true
      },
      relationships: [
        { type: 'belongsTo', target: 'users', foreignKey: 'autoAssignToUserId' },
        { type: 'hasMany', target: 'commercial_leads', foreignKey: 'leadSource' }
      ],
      indexes: [
        { fields: ['sourceType'] },
        { fields: ['isActive'] }
      ],
      softDelete: false
    },
    
    {
      name: 'lead_scoring_rules',
      schema: {
        fields: [
          { name: 'id', type: 'text', required: true },
          { name: 'ruleName', type: 'text', required: true },
          { name: 'ruleType', type: 'enum', options: ['demographic', 'behavior', 'engagement', 'firmographic'], required: true },
          { name: 'condition', type: 'json', required: true },
          { name: 'scoreValue', type: 'number', required: true },
          { name: 'isActive', type: 'boolean', default: true },
          { name: 'priority', type: 'number', default: 0 },
          { name: 'description', type: 'text' }
        ],
        timestamps: true,
        tenantIsolation: true
      },
      relationships: [],
      indexes: [
        { fields: ['ruleType'] },
        { fields: ['isActive'] },
        { fields: ['priority'] }
      ],
      softDelete: false
    },
    
    {
      name: 'lead_activities',
      schema: {
        fields: [
          { name: 'id', type: 'text', required: true },
          { name: 'leadId', type: 'relation', ref: 'commercial_leads', required: true },
          { name: 'activityType', type: 'enum', options: ['email_sent', 'email_opened', 'email_replied', 'call', 'meeting', 'note', 'status_change', 'score_change'], required: true },
          { name: 'description', type: 'text' },
          { name: 'metadata', type: 'json' },
          { name: 'userId', type: 'relation', ref: 'users' }
        ],
        timestamps: true,
        tenantIsolation: true
      },
      relationships: [
        { type: 'belongsTo', target: 'commercial_leads', foreignKey: 'leadId' },
        { type: 'belongsTo', target: 'users', foreignKey: 'userId' }
      ],
      indexes: [
        { fields: ['leadId'] },
        { fields: ['activityType'] },
        { fields: ['createdAt'] }
      ],
      softDelete: false
    }
  ];
  
  // ============================================================================
  // WORKFLOWS (automation workflows)
  // ============================================================================
  
  workflows: WorkflowDefinition[] = angariacaoWorkflows;
  
  // ============================================================================
  // TOOLS (AI tools)
  // ============================================================================
  
  tools: ModuleTool[] = angariacaoTools;
  
  // ============================================================================
  // ROUTES (API routes)
  // ============================================================================
  
  routes: RouteDefinition[] = angariacaoRoutes;
  
  // ============================================================================
  // HOOKS (lifecycle events)
  // ============================================================================
  
  hooks: ModuleHooks = {
    onInstall: async (tenantId: string) => {
      console.log(`[AngariacaoModule] Installing for tenant ${tenantId}`);
      // TODO: Criar lead sources padrão, scoring rules default
    },
    
    onUninstall: async (tenantId: string) => {
      console.log(`[AngariacaoModule] Uninstalling from tenant ${tenantId}`);
      // TODO: Cleanup se necessário
    },
    
    onActivate: async (tenantId: string) => {
      console.log(`[AngariacaoModule] Activating for tenant ${tenantId}`);
    },
    
    onDeactivate: async (tenantId: string) => {
      console.log(`[AngariacaoModule] Deactivating for tenant ${tenantId}`);
    }
  };
  
  // ============================================================================
  // DATA EXPOSURE (para cross-module tools)
  // ============================================================================
  
  exposeData(): ModuleDataInterface {
    if (!this.tenantId) {
      throw new Error('Module not initialized - call initialize() first');
    }
    
    const tenantId = this.tenantId;
    
    return {
      createQuery: () => new AngariacaoQueryBuilder(tenantId),
      
      aggregate: async (metric: string, filters?: Filter[]) => {
        switch (metric) {
          case 'leads_count':
            return await new AngariacaoQueryBuilder(tenantId).select('commercial_leads').count();
          
          case 'qualified_leads_count':
            return await new AngariacaoQueryBuilder(tenantId)
              .select('commercial_leads')
              .where([{ field: 'status', operator: 'eq', value: 'qualified' }])
              .count();
          
          case 'converted_leads_count':
            return await new AngariacaoQueryBuilder(tenantId)
              .select('commercial_leads')
              .where([{ field: 'status', operator: 'eq', value: 'converted' }])
              .count();
          
          case 'average_score':
            const leads = await new AngariacaoQueryBuilder(tenantId).select('commercial_leads').execute();
            if (leads.length === 0) return 0;
            const totalScore = leads.reduce((sum: number, lead: any) => sum + (lead.score || 0), 0);
            return totalScore / leads.length;
          
          default:
            console.warn(`Unknown metric: ${metric}`);
            return 0;
        }
      },
      
      export: async (format: 'json' | 'csv' | 'excel', filters?: Filter[]) => {
        // TODO: Implementar export
        return Buffer.from('');
      },
      
      getSchema: () => ({
        entities: this.entities,
        workflows: this.workflows,
        relationships: this.entities.flatMap(e => e.relationships || [])
      }),
      
      getEntity: async (entityName: string, id: string) => {
        const query = new AngariacaoQueryBuilder(tenantId);
        const results = await query
          .select(entityName)
          .where([{ field: 'id', operator: 'eq', value: id }])
          .execute();
        return results[0] || null;
      },
      
      listEntities: async (entityName: string, filters?: Filter[]) => {
        const query = new AngariacaoQueryBuilder(tenantId);
        let builder = query.select(entityName);
        if (filters) {
          builder = builder.where(filters);
        }
        return await builder.execute();
      },
      
      createEntity: async (entityName: string, data: any) => {
        const table = this.getTableForEntity(entityName);
        if (!table) {
          throw new Error(`Unknown entity: ${entityName}`);
        }
        
        const result = await db.insert(table).values({
          ...data,
          tenantId
        }).returning();
        
        return Array.isArray(result) ? result[0] : result;
      },
      
      updateEntity: async (entityName: string, id: string, data: any) => {
        const table = this.getTableForEntity(entityName);
        if (!table) {
          throw new Error(`Unknown entity: ${entityName}`);
        }
        
        const result = await db
          .update(table)
          .set(data)
          .where(and(
            eq((table as any).id, id),
            eq((table as any).tenantId, tenantId)
          ))
          .returning();
        
        return Array.isArray(result) ? result[0] : result;
      },
      
      deleteEntity: async (entityName: string, id: string) => {
        const table = this.getTableForEntity(entityName);
        if (!table) {
          throw new Error(`Unknown entity: ${entityName}`);
        }
        
        await db
          .delete(table)
          .where(and(
            eq((table as any).id, id),
            eq((table as any).tenantId, tenantId)
          ));
      }
    };
  }
  
  // ============================================================================
  // INITIALIZATION
  // ============================================================================
  
  async initialize(tenantId: string): Promise<void> {
    this.tenantId = tenantId;
    console.log(`[AngariacaoModule] Initialized for tenant ${tenantId}`);
  }
  
  async healthCheck(): Promise<boolean> {
    return true; // TODO: Verificar conexão DB, etc
  }
  
  /**
   * Helper to get table for entity name
   */
  private getTableForEntity(entityName: string): any {
    // Import tables dynamically to avoid circular deps
    const { angariacaoLeads, leadSources, leadScoringRules, leadActivities } = require('../../../shared/schema');
    
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
}

// Export singleton factory
export function createAngariacaoModule(): IModule {
  return new AngariacaoModule();
}
