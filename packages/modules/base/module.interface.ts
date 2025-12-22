/**
 * IModule - Interface padrão para todos os módulos do AssistOS
 * 
 * Cada módulo de negócio (Comercial, Financeiro, Logística, etc) implementa esta interface.
 * Garante que todos os módulos expõem uma API consistente para:
 * - Definição de entities (schema)
 * - Workflows e estados
 * - AI Tools específicas do módulo
 * - Rotas API
 * - Lifecycle hooks
 * - Data exposure para cross-module tools
 */

import { z } from 'zod';

// ============================================================================
// MODULE METADATA
// ============================================================================

export interface ModuleMetadata {
  id: string;                    // Unique module identifier (e.g., 'crm')
  name: string;                  // Display name (e.g., 'CRM')
  version: string;               // Semantic version (e.g., '1.0.0')
  category: 'crm' | 'sales' | 'finance' | 'operations' | 'admin' | 'purchasing' | 'projects' | 'production' | 'logistics' | 'hr' | 'lead-generation';
  description?: string;          // Optional description
  icon?: string;                 // Optional icon name (lucide-react)
  dependencies?: string[];       // Other modules required (e.g., ['crm'])
  permissions: Permission[];     // Required permissions
}

export interface Permission {
  key: string;                   // e.g., 'sales.read'
  name: string;                  // e.g., 'View Commercial Data'
  description?: string;
}

// ============================================================================
// ENTITY DEFINITIONS
// ============================================================================

export interface EntityDefinition {
  name: string;                  // Entity name (e.g., 'leads')
  schema: EntitySchema;          // Schema definition
  relationships?: Relationship[];
  indexes?: Index[];
  softDelete?: boolean;          // Enable soft delete
}

export interface EntitySchema {
  fields: FieldDefinition[];
  timestamps?: boolean;          // Auto createdAt/updatedAt
  tenantIsolation?: boolean;     // Auto tenantId field
}

export type FieldType = 
  | 'text' 
  | 'email' 
  | 'phone' 
  | 'url'
  | 'number' 
  | 'decimal' 
  | 'boolean'
  | 'date' 
  | 'datetime'
  | 'json'
  | 'enum'
  | 'relation';

export interface FieldDefinition {
  name: string;
  type: FieldType;
  required?: boolean;
  unique?: boolean;
  default?: any;
  min?: number;                  // For numbers
  max?: number;                  // For numbers
  options?: string[];            // For enums
  ref?: string;                  // For relations (table name)
  validation?: z.ZodType<any>;   // Custom Zod validation
}

export interface Relationship {
  type: 'hasOne' | 'hasMany' | 'belongsTo' | 'manyToMany';
  target: string;                // Target entity name
  foreignKey?: string;
  through?: string;              // For manyToMany
}

export interface Index {
  fields: string[];
  unique?: boolean;
  name?: string;
}

// ============================================================================
// WORKFLOW DEFINITIONS
// ============================================================================

export interface WorkflowDefinition {
  name: string;                  // Workflow name (e.g., 'Lead to Customer')
  entity: string;                // Entity this workflow applies to
  states: WorkflowState[];
  transitions: WorkflowTransition[];
  automations?: Automation[];
}

export interface WorkflowState {
  key: string;                   // State key (e.g., 'new')
  label: string;                 // Display label (e.g., 'Novo Lead')
  color: string;                 // Hex color for UI
  isInitial?: boolean;
  isFinal?: boolean;
}

export interface WorkflowTransition {
  from: string | '*';            // Source state (* = any)
  to: string;                    // Target state
  action: string;                // Action name (e.g., 'qualify')
  label?: string;                // Display label
  permissions?: string[];        // Required permissions
  conditions?: TransitionCondition[];
}

export interface TransitionCondition {
  field: string;
  operator: 'eq' | 'ne' | 'gt' | 'lt' | 'gte' | 'lte' | 'in' | 'nin';
  value: any;
}

export interface Automation {
  trigger: 'state_change' | 'field_change' | 'time_based';
  condition?: {
    from?: string;
    to?: string;
    field?: string;
    value?: any;
  };
  action: string;                // Function name or tool name
  params?: Record<string, any>;
}

// ============================================================================
// MODULE TOOLS (AI Tools específicas do módulo)
// ============================================================================

export interface ModuleTool {
  name: string;                  // Tool name (e.g., 'create_lead')
  description: string;           // AI-friendly description
  parameters: ToolParameter[];
  execute: (params: any, context: ModuleContext) => Promise<any>;
}

export interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description: string;
  required?: boolean;
  default?: any;
  enum?: string[];
}

// ============================================================================
// API ROUTES
// ============================================================================

export interface RouteDefinition {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;                  // e.g., '/api/comercial/leads'
  handler: string;               // Handler function name
  permissions?: string[];        // Required permissions
  validation?: {
    body?: z.ZodType<any>;
    query?: z.ZodType<any>;
    params?: z.ZodType<any>;
  };
}

// ============================================================================
// LIFECYCLE HOOKS
// ============================================================================

export interface ModuleHooks {
  onInstall?: (tenantId: string) => Promise<void>;
  onUninstall?: (tenantId: string) => Promise<void>;
  onActivate?: (tenantId: string) => Promise<void>;
  onDeactivate?: (tenantId: string) => Promise<void>;
  onDataChange?: (event: DataChangeEvent) => Promise<void>;
  onBeforeDelete?: (entityId: string, entity: string) => Promise<boolean>;
  onAfterDelete?: (entityId: string, entity: string) => Promise<void>;
}

export interface DataChangeEvent {
  entity: string;
  action: 'create' | 'update' | 'delete';
  data: any;
  previous?: any;
  tenantId: string;
  userId: string;
  timestamp: Date;
}

// ============================================================================
// MODULE DATA INTERFACE (para Cross-Module Tools)
// ============================================================================

export interface ModuleDataInterface {
  // Query builder factory - retorna novo builder para cada query
  createQuery: () => ModuleQueryBuilder;
  
  // Agregações
  aggregate: (metric: string, filters?: Filter[]) => Promise<number>;
  
  // Export
  export: (format: 'json' | 'csv' | 'excel', filters?: Filter[]) => Promise<Buffer>;
  
  // Schema introspection
  getSchema: () => ModuleSchema;
  
  // Entity CRUD (for cross-module operations)
  getEntity: (entityName: string, id: string) => Promise<any>;
  listEntities: (entityName: string, filters?: Filter[]) => Promise<any[]>;
  createEntity: (entityName: string, data: any) => Promise<any>;
  updateEntity: (entityName: string, id: string, data: any) => Promise<any>;
  deleteEntity: (entityName: string, id: string) => Promise<void>;
}

/**
 * Fluent query builder for cross-module queries
 * Cada método retorna this para permitir chaining
 */
export interface ModuleQueryBuilder {
  select: (entity: string) => ModuleQueryBuilder;
  where: (filters: Filter[]) => ModuleQueryBuilder;
  orderBy: (field: string, direction: 'asc' | 'desc') => ModuleQueryBuilder;
  limit: (count: number) => ModuleQueryBuilder;
  offset: (count: number) => ModuleQueryBuilder;
  execute: (schema?: string) => Promise<any[]>;  // Add schema parameter
  count: (schema?: string) => Promise<number>;    // Add schema parameter
}

export interface Filter {
  field: string;
  operator: 'eq' | 'ne' | 'gt' | 'lt' | 'gte' | 'lte' | 'in' | 'nin' | 'like' | 'ilike';
  value: any;
}

export interface ModuleSchema {
  entities: EntityDefinition[];
  workflows: WorkflowDefinition[];
  relationships: Relationship[];
}

// ============================================================================
// MODULE CONTEXT (runtime context para tools e handlers)
// ============================================================================

export interface ModuleContext {
  tenantId: string;
  userId: string;
  organizationId?: string;
  permissions: string[];
  environment?: 'sandbox' | 'production';
  metadata?: Record<string, any>;
}

// ============================================================================
// MODULE CONFIGURATION (for configurable modules)
// ============================================================================

export interface ModuleConfiguration {
  templateId?: string;                           // Template to apply (e.g., 'construction', 'events')
  customEntities?: EntityDefinition[];           // Custom entities to add
  customWorkflows?: WorkflowDefinition[];        // Custom workflows
  customTools?: ModuleTool[];                    // Custom AI tools
  enabledFeatures?: string[];                    // Features to enable
  settings?: Record<string, any>;                // Module-specific settings
}

export interface ModuleTemplate {
  id: string;                                    // Template identifier (e.g., 'construction')
  name: string;                                  // Display name
  description: string;                           // Description
  icon?: string;                                 // Icon name
  version: string;                               // Template version
  suggestedFor?: string[];                       // Keywords/industries this applies to
  configuration: ModuleConfiguration;            // Configuration to apply
  usageCount?: number;                           // How many tenants use this (pattern recognition)
}

// ============================================================================
// MAIN IMODULE INTERFACE
// ============================================================================

export interface IModule {
  // Metadata
  metadata: ModuleMetadata;
  
  // Entities
  entities: EntityDefinition[];
  
  // Workflows
  workflows: WorkflowDefinition[];
  
  // Tools (AI tools específicas do módulo)
  tools: ModuleTool[];
  
  // API Routes
  routes: RouteDefinition[];
  
  // Hooks (lifecycle events)
  hooks: ModuleHooks;
  
  // Data exposure (para cross-module tools)
  exposeData(): ModuleDataInterface;
  
  // Initialization
  initialize?: (tenantId: string) => Promise<void>;
  
  // Health check
  healthCheck?: () => Promise<boolean>;
  
  // ============================================================================
  // CONFIGURABILITY (FASE 3 - New)
  // ============================================================================
  
  // Indicates if this module can be configured per-tenant
  configurable?: boolean;
  
  // Core entities (always present, immutable)
  coreEntities?: EntityDefinition[];
  
  // Custom entities (added per-tenant via configuration)
  customEntities?: EntityDefinition[];
  
  // Extension points where AssistBuild can add functionality
  extensionPoints?: Array<'entities' | 'workflows' | 'tools' | 'routes' | 'reports'>;
  
  // Configure the module for a specific tenant
  configure?: (config: ModuleConfiguration, context: ModuleContext) => Promise<void>;
  
  // Get available templates for this module
  getTemplates?: () => ModuleTemplate[];
  
  // Template ID currently applied (if any)
  appliedTemplateId?: string;
}

// ============================================================================
// HELPER TYPES
// ============================================================================

export type ModuleId = string;
export type EntityName = string;
export type EntityId = string;
