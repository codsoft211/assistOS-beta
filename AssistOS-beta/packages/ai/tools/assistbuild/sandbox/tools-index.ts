/**
 * Sandbox Promotion Tools for AssistBuild (GAP #7)
 * 
 * Production-ready AI tools for sandbox-to-production promotion management.
 * All 4 tools implemented using ToolBase pattern and registered with toolRegistry.
 * 
 * Available Tools:
 * - ✅ list_sandbox_changes: Lists all changes in sandbox ready for promotion
 * - ✅ preview_promotion: Previews what will be promoted without applying
 * - ✅ promote_to_production: Executes sandbox to production promotion
 * - ✅ get_promotion_status: Checks promotion history and status
 * 
 * Integration:
 * - Tools auto-register with toolRegistry on import
 * - Filtered by filterAssistBuildTools() for AssistBuild access
 * - Use SandboxPromotionService + environment API for backend operations
 */

import { toolRegistry } from '../../kernel';
import { ListSandboxChangesTool } from './list-sandbox-changes.tool';
import { PreviewPromotionTool } from './preview-promotion.tool';
import { PromoteToProductionTool } from './promote-to-production.tool';
import { GetPromotionStatusTool } from './get-promotion-status.tool';

// Production-ready tools (all 4 completed)
const sandboxTools = [
  new ListSandboxChangesTool(),
  new PreviewPromotionTool(),
  new PromoteToProductionTool(),
  new GetPromotionStatusTool()
];

// Register all tools with global registry
for (const tool of sandboxTools) {
  toolRegistry.register(tool);
}

export { sandboxTools };
