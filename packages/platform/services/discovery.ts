/**
 * Discovery Service
 * 
 * API unificada para descobrir recursos disponíveis na plataforma:
 * - Módulos (templates + tenant installed)
 * - AI Tools (from ToolRegistry)
 * - Agents (templates + tenant custom)
 * - Workflows (templates + tenant custom)
 * 
 * Used by AssistBuild to provide contextual awareness of platform capabilities.
 */

import { db } from '../../../apps/api/db';
import {
  moduleTemplates,
  workflowTemplates,
  specializedAgents,
  customAgents,
  tenantWorkflows,
  type SelectModuleTemplate,
  type SelectWorkflowTemplate,
} from '../../../shared/schema';
import { toolRegistry } from '../../ai/tools/kernel/registry';
import type { ToolManifest } from '../../ai/tools/kernel/types';
import { eq, and, sql } from 'drizzle-orm';
import { selectFromTenantTable } from '../../../apps/api/utils/tenant-db-helper';

// Import assistme tools to trigger auto-registration
import '../../ai/tools/assistme';

export interface ModuleInfo {
  id: string;
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  category: string;
  features?: string[];
  agentTypes?: string[];
  isActive: boolean;
  isInstalled?: boolean; // Only present when filtered by tenant
}

export interface AgentInfo {
  id: string;
  code: string;
  name: string;
  description?: string;
  type: string;
  category: string;
  moduleId?: string;
  capabilities?: string[];
  tools?: string[];
  isSystem: boolean;
  isActive: boolean;
}

export interface WorkflowInfo {
  id: string;
  code: string;
  name: string;
  description?: string;
  category: string;
  moduleId?: string;
  triggerType: string;
  states?: string[];
  isSystem: boolean;
  isActive: boolean;
}

export interface ToolInfo extends ToolManifest {
  // ToolManifest já tem: name, category, description, parameters, etc
}

export class DiscoveryService {
  /**
   * Get all available modules from catalog
   * Optionally filter by tenant to show installation status
   */
  async getAvailableModules(options?: {
    category?: string;
    tenantId?: string;
  }): Promise<ModuleInfo[]> {
    try {
      // Get all module templates
      const templates = await db
        .select()
        .from(moduleTemplates)
        .where(options?.category ? eq(moduleTemplates.category, options.category) : undefined);
      
      // If tenant specified, check which are installed (tenant-scoped table)
      if (options?.tenantId) {
        const installed = await selectFromTenantTable<{
          module_id: string;
          is_active: boolean;
        }>(
          options.tenantId,
          'tenant_modules',
          sql`is_active = true`
        );
        
        const installedSet = new Set(installed.map(m => m.module_id));
        
        return templates.map(t => ({
          id: t.id,
          name: t.name,
          slug: t.slug,
          description: t.description || undefined,
          icon: t.icon || undefined,
          category: t.category,
          features: t.features || undefined,
          agentTypes: t.agentTypes || undefined,
          isActive: t.isActive,
          isInstalled: installedSet.has(t.slug),
        }));
      }
      
      // Return all templates without installation status
      return templates.map(t => ({
        id: t.id,
        name: t.name,
        slug: t.slug,
        description: t.description || undefined,
        icon: t.icon || undefined,
        category: t.category,
        features: t.features || undefined,
        agentTypes: t.agentTypes || undefined,
        isActive: t.isActive,
      }));
    } catch (error) {
      console.error('[DiscoveryService] Error getting available modules:', error);
      throw error;
    }
  }

  /**
   * Get all available AI tools from ToolRegistry
   * Tools are always in-memory, no DB persistence needed
   */
  getAvailableTools(options?: {
    category?: string;
  }): ToolInfo[] {
    try {
      let tools = toolRegistry.getAllManifests();
      
      if (options?.category) {
        tools = tools.filter(t => t.category === options.category);
      }
      
      return tools;
    } catch (error) {
      console.error('[DiscoveryService] Error getting available tools:', error);
      throw error;
    }
  }

  /**
   * Get all available agents for a tenant
   * Agents are created dynamically by tenants (no system templates)
   * Returns specialized_agents + custom_agents for the tenant
   */
  async getAvailableAgents(options?: {
    tenantId?: string;
    category?: string;
    moduleId?: string;
  }): Promise<AgentInfo[]> {
    try {
      // Agents require tenant context - they're tenant-specific, not system templates
      if (!options?.tenantId) {
        return [];
      }
      
      const agents: AgentInfo[] = [];
      
      // Get specialized agents for tenant
      const specialized = await db
        .select()
        .from(specializedAgents)
        .where(eq(specializedAgents.tenantId, options.tenantId));
      
      agents.push(...specialized.map(a => ({
        id: a.id,
        code: a.type,
        name: a.name,
        description: a.specialization,
        type: a.type,
        category: a.layer,
        capabilities: (a.capabilities as string[]) || [],
        tools: (a.tools as string[]) || [],
        isSystem: false,
        isActive: a.isActive,
      })));
      
      // Get custom agents for tenant
      const custom = await db
        .select()
        .from(customAgents)
        .where(eq(customAgents.tenantId, options.tenantId));
      
      agents.push(...custom.map(a => ({
        id: a.id,
        code: a.agentType,
        name: a.name,
        description: a.description,
        type: a.agentType,
        category: 'custom',
        capabilities: (a.capabilities as string[]) || [],
        isSystem: false,
        isActive: a.isActive,
      })));
      
      return agents;
    } catch (error) {
      console.error('[DiscoveryService] Error getting available agents:', error);
      throw error;
    }
  }

  /**
   * Get all available workflows
   * Returns system templates + tenant custom workflows (if tenantId provided)
   */
  async getAvailableWorkflows(options?: {
    tenantId?: string;
    category?: string;
    moduleId?: string;
  }): Promise<WorkflowInfo[]> {
    try {
      const workflows: WorkflowInfo[] = [];
      
      // Get system workflow templates
      const templates = await db
        .select()
        .from(workflowTemplates)
        .where(options?.category ? eq(workflowTemplates.category, options.category) : undefined);
      
      workflows.push(...templates.map(t => ({
        id: t.id,
        code: t.code,
        name: t.name,
        description: t.description || undefined,
        category: t.category,
        moduleId: t.moduleId || undefined,
        triggerType: t.triggerType,
        states: t.states || undefined,
        isSystem: t.isSystem,
        isActive: t.isActive,
      })));
      
      // If tenant specified, also get tenant-specific workflows
      if (options?.tenantId) {
        const tenantWfs = await db
          .select()
          .from(tenantWorkflows)
          .where(eq(tenantWorkflows.tenantId, options.tenantId));
        
        workflows.push(...tenantWfs.map(w => ({
          id: w.id,
          code: w.name, // Use name as code for tenant workflows
          name: w.name,
          description: w.description || undefined,
          category: 'custom', // Tenant workflows don't have category
          triggerType: w.triggerType,
          isSystem: false,
          isActive: w.isActive,
        })));
      }
      
      return workflows;
    } catch (error) {
      console.error('[DiscoveryService] Error getting available workflows:', error);
      throw error;
    }
  }

  /**
   * Get complete platform summary
   * Useful for AssistBuild context
   */
  async getPlatformSummary(options?: {
    tenantId?: string;
  }): Promise<{
    modules: ModuleInfo[];
    tools: ToolInfo[];
    agents: AgentInfo[];
    workflows: WorkflowInfo[];
    summary: {
      totalModules: number;
      totalTools: number;
      totalAgents: number;
      totalWorkflows: number;
    };
  }> {
    const [modules, tools, agents, workflows] = await Promise.all([
      this.getAvailableModules(options),
      Promise.resolve(this.getAvailableTools()),
      this.getAvailableAgents(options),
      this.getAvailableWorkflows(options),
    ]);
    
    return {
      modules,
      tools,
      agents,
      workflows,
      summary: {
        totalModules: modules.length,
        totalTools: tools.length,
        totalAgents: agents.length,
        totalWorkflows: workflows.length,
      },
    };
  }
}

/**
 * Create discovery service instance
 */
export function createDiscoveryService(): DiscoveryService {
  return new DiscoveryService();
}

/**
 * Singleton instance for convenience
 */
export const discoveryService = new DiscoveryService();
