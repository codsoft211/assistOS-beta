import { ToolBase, type ToolManifest, type ToolExecutionContext } from '../../kernel';
import { connectorService } from '../services/connector.service';

export class GetConnectorsTool extends ToolBase<{}, any> {
  manifest: ToolManifest = {
    name: 'get_connectors',
    category: 'discovery',
    description: 'Lists configured connectors and integrations (OAuth, external APIs)',
    parameters: [],
    requiresAuth: true,
    progressSupport: false
  };

  protected async executeInternal(input: {}, context: ToolExecutionContext): Promise<any> {
    try {
      const result = await connectorService.getAllConnectors(context.tenantId);

      if (result.counts.total === 0) {
        return {
          success: true,
          message: 'No connectors configured yet',
          connectors: result.connectors,
          counts: result.counts,
          suggestions: [
            'Configure an API integration to connect to external services',
            'Add a document integration for OCR or digital signatures',
            'Set up a storage provider for cloud document storage'
          ]
        };
      }

      return {
        success: true,
        connectors: result.connectors,
        counts: result.counts,
        summary: `Found ${result.counts.total} connector(s): ${result.counts.byType.api} API, ${result.counts.byType.document} document, ${result.counts.byType.storage} storage`
      };
    } catch (error) {
      console.error('[GetConnectorsTool] Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch connectors',
        connectors: { api: [], document: [], storage: [] },
        counts: { total: 0, active: 0, inactive: 0, byType: { api: 0, document: 0, storage: 0 } }
      };
    }
  }
}
