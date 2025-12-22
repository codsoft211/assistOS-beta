import { ToolBase, type ToolManifest, type ToolExecutionContext } from '../../kernel';

export class GetAgentsTool extends ToolBase<{}, any> {
  manifest: ToolManifest = {
    name: 'get_agents',
    category: 'discovery',
    description: 'Lists autonomous agents configured for the tenant',
    parameters: [],
    requiresAuth: true,
    progressSupport: false
  };

  protected async executeInternal(input: {}, context: ToolExecutionContext): Promise<any> {
    return {
      agents: [],
      count: 0,
      message: 'Agent system coming in Week 3'
    };
  }
}
