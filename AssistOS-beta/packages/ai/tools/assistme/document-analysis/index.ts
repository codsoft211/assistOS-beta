import { AnalyzeImageTool } from './analyze-image';
import { AnalyzeDocumentTool } from './analyze-document';

// Export tools
export { AnalyzeImageTool, AnalyzeDocumentTool };

// Auto-register tools
import { toolRegistry } from '../../kernel';

toolRegistry.register(new AnalyzeImageTool());
toolRegistry.register(new AnalyzeDocumentTool());

console.log('[Tools] Document Analysis tools registered (2 tools)');
