/**
 * Core Assets Manifest
 * 
 * Defines all platform-level core assets that must be protected from
 * unauthorized modification. These are the foundational building blocks
 * that all tenants depend on for baseline functionality.
 * 
 * @see apps/api/services/core-protection.service.ts
 */

// Asset types as defined in schema.ts coreAssets table
export type AssetType = 'module' | 'workflow_template' | 'tool_manifest' | 'schema' | 'ai_parameter' | 'tool';

// Mutability policies as defined in schema.ts coreAssets table
export type MutabilityPolicy = 'immutable' | 'clone_only' | 'mutable';

export interface CoreAssetDefinition {
  assetId: string;
  assetType: AssetType;
  mutabilityPolicy: MutabilityPolicy;
  name: string;
  description: string;
  isCore: true;
  metadata?: Record<string, unknown>;
}

/**
 * Core Modules
 * 
 * Modules shipped with platform that provide baseline functionality.
 * Mutability: clone_only - tenants can fork but not modify originals
 */
export const CORE_MODULES: CoreAssetDefinition[] = [
  {
    assetId: 'compras',
    assetType: 'module',
    mutabilityPolicy: 'clone_only',
    name: 'Compras',
    description: 'Procurement module with 3-way matching, OCR, supplier scoring',
    isCore: true,
    metadata: { packagePath: 'packages/modules/compras' }
  },
  {
    assetId: 'vendas',
    assetType: 'module',
    mutabilityPolicy: 'clone_only',
    name: 'Vendas/Comercial',
    description: 'CRM, quotes, proposals, pipeline management',
    isCore: true,
    metadata: { packagePath: 'packages/modules/vendas' }
  },
  {
    assetId: 'financeiro',
    assetType: 'module',
    mutabilityPolicy: 'clone_only',
    name: 'Financeiro',
    description: 'Accounting, AP/AR, bank reconciliation',
    isCore: true,
    metadata: { packagePath: 'packages/modules/financeiro' }
  },
  {
    assetId: 'logistica',
    assetType: 'module',
    mutabilityPolicy: 'clone_only',
    name: 'Logística',
    description: 'Inventory management, warehouses, tracking',
    isCore: true,
    metadata: { packagePath: 'packages/modules/logistica' }
  },
  {
    assetId: 'projetos',
    assetType: 'module',
    mutabilityPolicy: 'clone_only',
    name: 'Projetos',
    description: 'Task management, time tracking, budgets, Gantt',
    isCore: true,
    metadata: { packagePath: 'packages/modules/projetos' }
  },
  {
    assetId: 'angariacao',
    assetType: 'module',
    mutabilityPolicy: 'clone_only',
    name: 'Angariação',
    description: 'Lead management, prospecting, scoring',
    isCore: true,
    metadata: { packagePath: 'packages/modules/angariacao' }
  },
];

/**
 * Core AI Tools
 * 
 * Essential AI tools available to all tenants by default.
 * Mutability: clone_only - can be cloned for customization
 */
export const CORE_TOOLS: CoreAssetDefinition[] = [
  {
    assetId: 'query_user_data',
    assetType: 'tool',
    mutabilityPolicy: 'clone_only',
    name: 'Query User Data',
    description: 'Query tenant-specific user data',
    isCore: true,
    metadata: { category: 'core' }
  },
  {
    assetId: 'create_personal_task',
    assetType: 'tool',
    mutabilityPolicy: 'clone_only',
    name: 'Create Personal Task',
    description: 'Create personal task for user',
    isCore: true,
    metadata: { category: 'core' }
  },
  {
    assetId: 'create_team_task',
    assetType: 'tool',
    mutabilityPolicy: 'clone_only',
    name: 'Create Team Task',
    description: 'Create task assigned to team',
    isCore: true,
    metadata: { category: 'core' }
  },
  {
    assetId: 'update_task_status',
    assetType: 'tool',
    mutabilityPolicy: 'clone_only',
    name: 'Update Task Status',
    description: 'Update status of existing task',
    isCore: true,
    metadata: { category: 'core' }
  },
  {
    assetId: 'search_documents',
    assetType: 'tool',
    mutabilityPolicy: 'clone_only',
    name: 'Search Documents',
    description: 'Search tenant documents with semantic search',
    isCore: true,
    metadata: { category: 'core' }
  },
  {
    assetId: 'get_analytics',
    assetType: 'tool',
    mutabilityPolicy: 'clone_only',
    name: 'Get Analytics',
    description: 'Retrieve tenant analytics and metrics',
    isCore: true,
    metadata: { category: 'core' }
  },
  {
    assetId: 'analyze_document',
    assetType: 'tool',
    mutabilityPolicy: 'clone_only',
    name: 'Analyze Document',
    description: 'OCR and analysis of uploaded documents',
    isCore: true,
    metadata: { category: 'core' }
  },
];

/**
 * Core Schema Tables
 * 
 * Database tables that are immutable and critical for platform operation.
 * Mutability: immutable - cannot be modified at all
 */
export const CORE_SCHEMA_TABLES: CoreAssetDefinition[] = [
  {
    assetId: 'tenants',
    assetType: 'schema',
    mutabilityPolicy: 'immutable',
    name: 'Tenants',
    description: 'Multi-tenancy root table',
    isCore: true,
    metadata: { table: 'tenants', schemaPath: 'shared/schema.ts' }
  },
  {
    assetId: 'users',
    assetType: 'schema',
    mutabilityPolicy: 'immutable',
    name: 'Users',
    description: 'User authentication and identity',
    isCore: true,
    metadata: { table: 'users', schemaPath: 'shared/schema.ts' }
  },
  {
    assetId: 'user_tenants',
    assetType: 'schema',
    mutabilityPolicy: 'immutable',
    name: 'User Tenants',
    description: 'User-tenant relationships and roles',
    isCore: true,
    metadata: { table: 'userTenants', schemaPath: 'shared/schema.ts' }
  },
  {
    assetId: 'sessions',
    assetType: 'schema',
    mutabilityPolicy: 'immutable',
    name: 'Sessions',
    description: 'User session management',
    isCore: true,
    metadata: { table: 'sessions', schemaPath: 'shared/schema.ts' }
  },
  {
    assetId: 'core_assets',
    assetType: 'schema',
    mutabilityPolicy: 'immutable',
    name: 'Core Assets',
    description: 'Core asset protection registry',
    isCore: true,
    metadata: { table: 'coreAssets', schemaPath: 'shared/schema.ts' }
  },
  {
    assetId: 'core_asset_versions',
    assetType: 'schema',
    mutabilityPolicy: 'immutable',
    name: 'Core Asset Versions',
    description: 'Core asset mutation audit trail',
    isCore: true,
    metadata: { table: 'coreAssetVersions', schemaPath: 'shared/schema.ts' }
  },
];

/**
 * Core Workflows
 * 
 * Platform-level workflows that execute system-critical operations.
 * Currently empty - will be populated as workflow system is built.
 * Mutability: clone_only - can be cloned for customization
 */
export const CORE_WORKFLOWS: CoreAssetDefinition[] = [
  // To be populated when workflow system is implemented
];

/**
 * Get all core assets as flat list
 */
export function getAllCoreAssets(): CoreAssetDefinition[] {
  return [
    ...CORE_MODULES,
    ...CORE_TOOLS,
    ...CORE_SCHEMA_TABLES,
    ...CORE_WORKFLOWS,
  ];
}

/**
 * Get core assets by type
 */
export function getCoreAssetsByType(assetType: AssetType): CoreAssetDefinition[] {
  return getAllCoreAssets().filter(asset => asset.assetType === assetType);
}

/**
 * Manifest version for drift detection
 */
export const MANIFEST_VERSION = '1.0.0';
