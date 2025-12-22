/**
 * CrossModuleContext Service
 * 
 * Builder para criar contexto runtime para cross-module tools.
 * Carrega module registry e prepara ambiente de execução.
 */

import { CrossModuleContext } from './cross-module-tool.interface';
import { createModuleRegistry } from '../../modules/base/module-registry.service';
import { Filter } from '../../modules/base/module.interface';

export class CrossModuleContextService {
  
  /**
   * Build complete context for cross-module tool execution
   */
  static async buildContext(
    tenantId: string,
    userId: string,
    params?: {
      organizationId?: string;
      params?: Record<string, any>;
      filters?: Filter[];
      dateRange?: { start: Date; end: Date };
      metadata?: Record<string, any>;
    }
  ): Promise<CrossModuleContext> {
    
    // Load module registry for this tenant
    const modules = await createModuleRegistry(tenantId);
    
    return {
      tenantId,
      userId,
      organizationId: params?.organizationId,
      modules,
      params: params?.params || {},
      filters: params?.filters,
      dateRange: params?.dateRange,
      metadata: params?.metadata
    };
  }
  
  /**
   * Build context with date range (útil para analytics)
   */
  static async buildWithDateRange(
    tenantId: string,
    userId: string,
    startDate: Date,
    endDate: Date,
    additionalParams?: Record<string, any>
  ): Promise<CrossModuleContext> {
    
    return this.buildContext(tenantId, userId, {
      dateRange: { start: startDate, end: endDate },
      params: additionalParams
    });
  }
  
  /**
   * Build context with filters (útil para queries específicas)
   */
  static async buildWithFilters(
    tenantId: string,
    userId: string,
    filters: Filter[],
    additionalParams?: Record<string, any>
  ): Promise<CrossModuleContext> {
    
    return this.buildContext(tenantId, userId, {
      filters,
      params: additionalParams
    });
  }
}
