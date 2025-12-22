import { ToolBase, type ToolManifest, type ToolExecutionContext } from '../../kernel';
import { discoveryService } from '../../../../../packages/platform/services/discovery';

/**
 * Get Platform Resources Tool
 * 
 * Returns complete platform capabilities:
 * - Available modules (templates + installation status for tenant)
 * - Available AI tools (from ToolRegistry)
 * - Available agents (system templates + tenant custom)
 * - Available workflows (system templates + tenant custom)
 * 
 * This gives AssistBuild full context of what exists in the platform.
 */
export class GetPlatformResourcesTool extends ToolBase<{}, any> {
  manifest: ToolManifest = {
    name: 'get_platform_resources',
    category: 'discovery',
    description: 'Returns all resources available in the platform: modules, tools, agents, workflows. Use this to understand the complete capabilities of AssistOS.',
    parameters: [],
    requiresAuth: true,
    progressSupport: false
  };

  protected async executeInternal(input: {}, context: ToolExecutionContext): Promise<any> {
    try {
      // Get tenant ID from context
      const tenantId = context.tenantId;
      
      // Get complete platform summary
      const summary = await discoveryService.getPlatformSummary({
        tenantId: tenantId,
      });
      
      return {
        success: true,
        resources: summary,
        message: `Found ${summary.summary.totalModules} modules, ${summary.summary.totalTools} tools, ${summary.summary.totalAgents} agents, ${summary.summary.totalWorkflows} workflows`,
      };
    } catch (error: any) {
      console.error('[GetPlatformResourcesTool] Error:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }
}
