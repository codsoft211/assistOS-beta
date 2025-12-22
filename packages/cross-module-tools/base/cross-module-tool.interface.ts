/**
 * ICrossModuleTool - Interface para ferramentas transversais
 * 
 * Cross-module tools trabalham sobre MÚLTIPLOS módulos simultaneamente.
 * Exemplos:
 * - Financial Grid: agrega dados de Comercial, Financeiro, Logística
 * - Document Management: classifica e roteia docs para qualquer módulo
 * - Analytics: KPIs cross-module
 * 
 * Estas ferramentas SÃO AGNÓSTICAS aos módulos - funcionam com qualquer
 * módulo que exponha a interface ModuleDataInterface.
 */

import { IModule, ModuleDataInterface, Filter } from '../../modules/base/module.interface';

// ============================================================================
// CROSS-MODULE TOOL METADATA
// ============================================================================

export interface CrossModuleToolMetadata {
  id: string;                    // Unique tool identifier (e.g., 'financial-grid')
  name: string;                  // Display name (e.g., 'Financial Grid')
  description: string;           // What this tool does
  version: string;               // Semantic version
  category: 'analytics' | 'automation' | 'intelligence' | 'integration';
  icon?: string;                 // Optional icon
}

// ============================================================================
// MODULE REGISTRY (injected into cross-module tools)
// ============================================================================

export interface ModuleRegistry {
  // Get module instance
  get(moduleId: string): IModule | null;
  
  // Check if module installed for this tenant
  isInstalled(moduleId: string): boolean;
  
  // List all installed modules
  list(): string[];
  
  // Query across multiple modules
  queryAll(query: CrossModuleQuery): Promise<any[]>;
  
  // Get data interface for module
  getDataInterface(moduleId: string): ModuleDataInterface | null;
}

export interface CrossModuleQuery {
  modules: string[];             // Module IDs to query
  entity: string;                // Entity name
  filters?: Filter[];
  orderBy?: { field: string; direction: 'asc' | 'desc' };
  limit?: number;
  offset?: number;
}

// ============================================================================
// CROSS-MODULE CONTEXT (runtime context)
// ============================================================================

export interface CrossModuleContext {
  tenantId: string;
  userId: string;
  organizationId?: string;
  
  // Module registry (acesso a todos os módulos instalados)
  modules: ModuleRegistry;
  
  // Parameters (variáveis do request)
  params?: Record<string, any>;
  
  // Filters (para queries)
  filters?: Filter[];
  
  // Date range (para analytics)
  dateRange?: {
    start: Date;
    end: Date;
  };
  
  // Metadata adicional
  metadata?: Record<string, any>;
}

// ============================================================================
// AGGREGATED DATA (resultado de agregações cross-module)
// ============================================================================

export interface AggregatedData {
  // Data por módulo
  byModule: Record<string, any>;
  
  // KPIs globais
  kpis?: Record<string, number>;
  
  // Trends (séries temporais)
  trends?: TimeSeries[];
  
  // Insights (descobertas automáticas)
  insights?: Insight[];
  
  // Metadata
  metadata?: {
    moduleCount: number;
    dataPointCount: number;
    lastUpdated: Date;
  };
}

export interface TimeSeries {
  metric: string;
  data: TimeSeriesPoint[];
}

export interface TimeSeriesPoint {
  timestamp: Date;
  value: number;
  metadata?: Record<string, any>;
}

export interface Insight {
  type: 'trend' | 'anomaly' | 'opportunity' | 'risk';
  severity: 'low' | 'medium' | 'high';
  title: string;
  description: string;
  affectedModules: string[];
  data?: any;
  actionable?: boolean;
  suggestedAction?: string;
}

// ============================================================================
// MAIN ICROSSMODULETOOL INTERFACE
// ============================================================================

export interface ICrossModuleTool {
  // Metadata
  metadata: CrossModuleToolMetadata;
  
  // Required modules (lista de módulos necessários)
  // Se vazio [], funciona com QUALQUER combinação de módulos
  requiredModules?: string[];
  
  // Optional modules (funcionam melhor com estes, mas não obrigatório)
  optionalModules?: string[];
  
  // Execute (main function)
  execute(context: CrossModuleContext): Promise<any>;
  
  // Aggregate data across modules
  aggregateData?(modules: ModuleRegistry, filters?: Filter[]): Promise<AggregatedData>;
  
  // Health check
  healthCheck?(): Promise<boolean>;
  
  // Initialize
  initialize?(tenantId: string): Promise<void>;
}

// ============================================================================
// HELPER TYPES
// ============================================================================

export type CrossModuleToolId = string;

// ============================================================================
// CROSS-MODULE TOOL BUILDER (helper para criar tools facilmente)
// ============================================================================

export interface CrossModuleToolBuilder {
  withMetadata(metadata: CrossModuleToolMetadata): CrossModuleToolBuilder;
  requiringModules(...moduleIds: string[]): CrossModuleToolBuilder;
  withOptionalModules(...moduleIds: string[]): CrossModuleToolBuilder;
  withExecute(fn: (context: CrossModuleContext) => Promise<any>): CrossModuleToolBuilder;
  withAggregation(fn: (modules: ModuleRegistry) => Promise<AggregatedData>): CrossModuleToolBuilder;
  build(): ICrossModuleTool;
}
