import { ToolBase, type ToolManifest, type ToolExecutionContext } from '../../kernel';

export class GetWorkflowsTool extends ToolBase<{}, any> {
  manifest: ToolManifest = {
    name: 'get_workflows',
    category: 'discovery',
    description: 'Lists configured automation workflows',
    parameters: [],
    requiresAuth: true,
    progressSupport: false
  };

  protected async executeInternal(input: {}, context: ToolExecutionContext): Promise<any> {
    return {
      workflows: [],
      count: 0,
      message: 'Workflow system coming in Week 3'
    };
  }
}
