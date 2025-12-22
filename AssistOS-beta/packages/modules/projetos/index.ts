/**
 * ProjetosModule - Configurable Project Management
 * 
 * THE FIRST CONFIGURABLE MODULE IN ASSISTOS
 * 
 * Features:
 * - Base project management (4 core entities)
 * - Template-driven configuration (Construction, Events, Consulting, etc.)
 * - Runtime entity extension per tenant
 * - Industry-specific workflows via templates
 * 
 * Core Entities (Always Present):
 * - projects: Base project tracking
 * - project_phases: Project stages/milestones
 * - project_resources: Resource allocation
 * - project_documents: Document management
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
  Filter,
  ModuleConfiguration,
  ModuleTemplate
} from '../base/module.interface';
import { db } from '../../../apps/api/db';
import { eq, and } from 'drizzle-orm';
import { ProjetosQueryBuilder } from './query-builder';
import { projetosTools } from './tools';
import { projetosRoutes } from './routes';
import { projetosWorkflows } from './workflows';
import { templates, getTemplate } from './templates';
import { ModuleConfigurationManager } from '../base/module-configuration';
import { createLinkResolver } from '../base/link-resolver.service';

export class ProjetosModule implements IModule {
  private tenantId?: string;
  
  // ============================================================================
  // MODULE METADATA
  // ============================================================================
  
  metadata: ModuleMetadata = {
    id: 'projects',
    name: 'Projects',
    version: '1.0.0',
    category: 'projects',
    description: 'Configurable project management - adapts to Construction, Events, Consulting and more',
    icon: 'FolderKanban',
    dependencies: [],
    permissions: [
      { key: 'projects.read', name: 'View projects' },
      { key: 'projects.write', name: 'Create/edit projects' },
      { key: 'projects.delete', name: 'Delete projects' },
      { key: 'projects.configure', name: 'Configure projects module' }
    ]
  };
  
  // ============================================================================
  // CONFIGURABILITY (FASE 3 - New Paradigm)
  // ============================================================================
  
  configurable = true;
  
  extensionPoints: ('entities' | 'workflows' | 'tools' | 'routes' | 'reports')[] = ['entities', 'workflows', 'tools', 'routes', 'reports'];
  
  appliedTemplateId?: string = undefined;
  
  // Core entities - always present, immutable
  coreEntities: EntityDefinition[] = [
    // 1. PROJECTS - Base project entity
    {
      name: 'projects',
      schema: {
        fields: [
          { name: 'id', type: 'text', required: true },
          { name: 'projectCode', type: 'text', required: true, unique: true },
          { name: 'name', type: 'text', required: true },
          { name: 'description', type: 'text' },
          { name: 'clientId', type: 'relation', ref: 'clients' },
          { name: 'startDate', type: 'date' },
          { name: 'endDate', type: 'date' },
          { name: 'estimatedBudget', type: 'decimal' },
          { name: 'actualCost', type: 'decimal' },
          { 
            name: 'status', 
            type: 'enum', 
            options: ['Planning', 'Active', 'On Hold', 'Completed', 'Cancelled'],
            required: true,
            default: 'Planning'
          },
          { 
            name: 'priority', 
            type: 'enum', 
            options: ['Low', 'Medium', 'High', 'Critical'],
            required: true,
            default: 'Medium'
          },
          { name: 'projectType', type: 'text' },
          { name: 'tags', type: 'text' },
          { name: 'notes', type: 'text' }
        ],
        timestamps: true,
        tenantIsolation: true
      },
      relationships: [
        { type: 'hasMany', target: 'project_phases', foreignKey: 'projectId' },
        { type: 'hasMany', target: 'project_resources', foreignKey: 'projectId' },
        { type: 'hasMany', target: 'project_documents', foreignKey: 'projectId' },
        { type: 'belongsTo', target: 'clients', foreignKey: 'clientId' }
      ],
      indexes: [
        { fields: ['projectCode'], unique: true },
        { fields: ['status'] },
        { fields: ['clientId'] },
        { fields: ['priority'] }
      ],
      softDelete: true
    },
    
    // 2. PROJECT_PHASES - Project phases/stages
    {
      name: 'project_phases',
      schema: {
        fields: [
          { name: 'id', type: 'text', required: true },
          { name: 'projectId', type: 'relation', ref: 'projects', required: true },
          { name: 'phaseName', type: 'text', required: true },
          { name: 'description', type: 'text' },
          { name: 'startDate', type: 'date' },
          { name: 'endDate', type: 'date' },
          { 
            name: 'status', 
            type: 'enum', 
            options: ['Not Started', 'In Progress', 'Completed', 'Delayed'],
            required: true,
            default: 'Not Started'
          },
          { name: 'percentComplete', type: 'decimal', min: 0, max: 100, default: 0 },
          { name: 'budget', type: 'decimal' },
          { name: 'actualCost', type: 'decimal' }
        ],
        timestamps: true,
        tenantIsolation: true
      },
      relationships: [
        { type: 'belongsTo', target: 'projects', foreignKey: 'projectId' }
      ],
      indexes: [
        { fields: ['projectId'] },
        { fields: ['status'] }
      ],
      softDelete: false
    },
    
    // 3. PROJECT_RESOURCES - Resource allocations
    {
      name: 'project_resources',
      schema: {
        fields: [
          { name: 'id', type: 'text', required: true },
          { name: 'projectId', type: 'relation', ref: 'projects', required: true },
          { 
            name: 'resourceType', 
            type: 'enum', 
            options: ['Human', 'Equipment', 'Material', 'External'],
            required: true
          },
          { name: 'resourceName', type: 'text', required: true },
          { name: 'quantity', type: 'decimal', required: true },
          { name: 'unit', type: 'text' },
          { name: 'costPerUnit', type: 'decimal' },
          { name: 'totalCost', type: 'decimal' },
          { name: 'allocationDate', type: 'date' },
          { name: 'releaseDate', type: 'date' },
          { 
            name: 'status', 
            type: 'enum', 
            options: ['Allocated', 'In Use', 'Released'],
            required: true,
            default: 'Allocated'
          }
        ],
        timestamps: true,
        tenantIsolation: true
      },
      relationships: [
        { type: 'belongsTo', target: 'projects', foreignKey: 'projectId' }
      ],
      indexes: [
        { fields: ['projectId'] },
        { fields: ['resourceType'] },
        { fields: ['status'] }
      ],
      softDelete: false
    },
    
    // 4. PROJECT_DOCUMENTS - Project documentation
    {
      name: 'project_documents',
      schema: {
        fields: [
          { name: 'id', type: 'text', required: true },
          { name: 'projectId', type: 'relation', ref: 'projects', required: true },
          { name: 'documentName', type: 'text', required: true },
          { 
            name: 'documentType', 
            type: 'enum', 
            options: ['Contract', 'Proposal', 'Report', 'Specification', 'Drawing', 'Photo', 'Other'],
            required: true
          },
          { name: 'fileUrl', type: 'text' },
          { name: 'uploadedBy', type: 'text' },
          { name: 'documentDate', type: 'date' },
          { name: 'category', type: 'text' },
          { name: 'tags', type: 'text' },
          { name: 'notes', type: 'text' }
        ],
        timestamps: true,
        tenantIsolation: true
      },
      relationships: [
        { type: 'belongsTo', target: 'projects', foreignKey: 'projectId' }
      ],
      indexes: [
        { fields: ['projectId'] },
        { fields: ['documentType'] }
      ],
      softDelete: false
    }
  ];
  
  // Custom entities - added per tenant via templates/configuration
  customEntities: EntityDefinition[] = [];
  
  // Combined entities getter
  get entities(): EntityDefinition[] {
    return [...this.coreEntities, ...this.customEntities];
  }
  
  // ============================================================================
  // WORKFLOWS (stubbed for now - will implement in next tasks)
  // ============================================================================
  
  workflows: WorkflowDefinition[] = projetosWorkflows;
  
  // ============================================================================
  // TOOLS (stubbed for now - will implement in next tasks)
  // ============================================================================
  
  tools: ModuleTool[] = projetosTools;
  
  // ============================================================================
  // ROUTES (stubbed for now - will implement in next tasks)
  // ============================================================================
  
  routes: RouteDefinition[] = projetosRoutes;
  
  // ============================================================================
  // HOOKS (lifecycle events)
  // ============================================================================
  
  hooks: ModuleHooks = {
    onInstall: async (tenantId: string) => {
      console.log(`[ProjetosModule] Installing for tenant ${tenantId}`);
      // TODO: Create default project templates, workflows, etc.
    },
    
    onUninstall: async (tenantId: string) => {
      console.log(`[ProjetosModule] Uninstalling from tenant ${tenantId}`);
      // TODO: Cleanup (if necessary)
    },
    
    onActivate: async (tenantId: string) => {
      console.log(`[ProjetosModule] Activating for tenant ${tenantId}`);
    },
    
    onDeactivate: async (tenantId: string) => {
      console.log(`[ProjetosModule] Deactivating for tenant ${tenantId}`);
    }
  };
  
  // ============================================================================
  // INITIALIZATION
  // ============================================================================
  
  async initialize(tenantId: string): Promise<void> {
    this.tenantId = tenantId;
    
    // Load custom configuration from database
    await this.loadCustomConfiguration();
    
    console.log(`[ProjetosModule] Initialized for tenant ${tenantId}`);
  }
  
  // ============================================================================
  // DATA EXPOSURE (para cross-module tools)
  // ============================================================================
  
  exposeData(): ModuleDataInterface {
    if (!this.tenantId) {
      throw new Error('Module not initialized - call initialize() first');
    }
    
    const tenantId = this.tenantId;
    
    return {
      createQuery: () => new ProjetosQueryBuilder(tenantId),
      
      aggregate: async (metric: string, filters?: Filter[]) => {
        switch (metric) {
          case 'total_projects':
            return await new ProjetosQueryBuilder(tenantId).select('projects').count();
          
          case 'active_projects': {
            const projects = await new ProjetosQueryBuilder(tenantId)
              .select('projects')
              .where([{ field: 'status', operator: 'eq', value: 'Active' }])
              .execute();
            return projects.length;
          }
          
          case 'total_budget': {
            const projects = await new ProjetosQueryBuilder(tenantId)
              .select('projects')
              .execute();
            return projects.reduce((sum: number, proj: any) => 
              sum + parseFloat(proj.estimatedBudget || 0), 0
            );
          }
          
          case 'total_phases':
            return await new ProjetosQueryBuilder(tenantId).select('project_phases').count();
          
          case 'total_resources':
            return await new ProjetosQueryBuilder(tenantId).select('project_resources').count();
          
          case 'total_documents':
            return await new ProjetosQueryBuilder(tenantId).select('project_documents').count();
          
          default:
            console.warn(`Unknown metric: ${metric}`);
            return 0;
        }
      },
      
      export: async (format: 'json' | 'csv' | 'excel', filters?: Filter[]) => {
        // TODO: Implement export functionality
        return Buffer.from('');
      },
      
      getSchema: () => ({
        entities: this.entities,
        workflows: this.workflows,
        relationships: this.entities.flatMap(e => e.relationships || [])
      }),
      
      getEntity: async (entityName: string, id: string) => {
        const query = new ProjetosQueryBuilder(tenantId);
        const results = await query
          .select(entityName)
          .where([{ field: 'id', operator: 'eq', value: id }])
          .execute();
        return results[0] || null;
      },
      
      listEntities: async (entityName: string, filters?: Filter[]) => {
        const query = new ProjetosQueryBuilder(tenantId);
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
  // TEMPLATE MANAGEMENT (New for Configurable Modules)
  // ============================================================================
  
  /**
   * Get available templates for this module
   */
  getTemplates(): ModuleTemplate[] {
    return templates;
  }
  
  /**
   * Apply a template configuration to this module instance
   * NOW WITH DATABASE PERSISTENCE via ModuleConfigurationManager!
   */
  async configure(config: ModuleConfiguration, context?: ModuleContext): Promise<void> {
    console.log(`[ProjetosModule] Applying configuration:`, config);
    
    if (!this.tenantId) {
      throw new Error('Module not initialized - call initialize() first');
    }
    
    // Create configuration manager for this tenant
    const configManager = new ModuleConfigurationManager(
      this.tenantId,
      this.metadata.id
    );
    
    // Apply template if specified
    if (config.templateId) {
      const template = getTemplate(config.templateId);
      if (!template) {
        throw new Error(`Template not found: ${config.templateId}`);
      }
      
      console.log(`[ProjetosModule] Applying template: ${template.name} via ModuleConfigurationManager`);
      this.appliedTemplateId = config.templateId;
      
      // Use ModuleConfigurationManager to persist template to database
      if (context) {
        await configManager.applyTemplate(template, context);
      }
      
      // Merge template configuration in-memory (for runtime)
      if (template.configuration.customEntities) {
        this.customEntities = [...template.configuration.customEntities];
      }
      
      if (template.configuration.customWorkflows) {
        this.workflows = [...this.workflows, ...template.configuration.customWorkflows];
      }
      
      if (template.configuration.customTools) {
        this.tools = [...this.tools, ...template.configuration.customTools];
      }
    } else if (context) {
      // No template, but custom configuration - persist it
      await configManager.applyConfiguration(config, context);
    }
    
    // Apply custom entities (in-memory)
    if (config.customEntities) {
      this.customEntities = [...this.customEntities, ...config.customEntities];
    }
    
    // Apply custom workflows (in-memory)
    if (config.customWorkflows) {
      this.workflows = [...this.workflows, ...config.customWorkflows];
    }
    
    // Apply custom tools (in-memory)
    if (config.customTools) {
      this.tools = [...this.tools, ...config.customTools];
    }
    
    console.log(`[ProjetosModule] Configuration applied successfully (persisted to database via ModuleConfigurationManager)`);
  }
  
  /**
   * Load custom entities from database for this tenant
   * This is called during initialization to restore configured entities
   */
  async loadCustomConfiguration(): Promise<void> {
    if (!this.tenantId) {
      throw new Error('Module not initialized');
    }
    
    const configManager = new ModuleConfigurationManager(
      this.tenantId,
      this.metadata.id
    );
    
    // Load custom entities from database
    const customEntities = await configManager.loadCustomEntities();
    
    if (customEntities.length > 0) {
      this.customEntities = customEntities;
      console.log(`[ProjetosModule] Loaded ${customEntities.length} custom entities from database`);
    }
  }
  
  // ============================================================================
  // HELPER METHODS
  // ============================================================================
  
  /**
   * Map entity name to Drizzle table
   * This will be expanded as we add actual database tables
   */
  private getTableForEntity(entityName: string): any {
    // TODO: Import actual tables from shared/schema.ts when they exist
    // For now, return null - will implement when database schema is ready
    switch (entityName) {
      case 'projects':
      case 'project_phases':
      case 'project_resources':
      case 'project_documents':
        // Will map to actual tables when schema is created
        console.warn(`Table mapping for ${entityName} not yet implemented`);
        return null;
      default:
        return null;
    }
  }
  
  // ============================================================================
  // HEALTH CHECK
  // ============================================================================
  
  async healthCheck(): Promise<boolean> {
    try {
      // Basic health check - verify module is initialized
      if (!this.tenantId) {
        return false;
      }
      
      // TODO: Add more comprehensive health checks
      // - Verify database tables exist
      // - Check data integrity
      // - Validate configuration
      
      return true;
    } catch (error) {
      console.error('[ProjetosModule] Health check failed:', error);
      return false;
    }
  }
}

// ============================================================================
// MODULE FACTORY
// ============================================================================

export function createProjetosModule(): IModule {
  return new ProjetosModule();
}
