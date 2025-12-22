/**
 * Sandbox Promotion Management Tools for AssistBuild (GAP #7 - COMPLETE)
 * 
 * Production-ready AI tools for sandbox-to-production promotion workflow.
 * All 4 tools implemented using ToolBase pattern and fully integrated.
 * 
 * Tools:
 * - ✅ list_sandbox_changes: Lists all sandbox changes ready for promotion
 * - ✅ preview_promotion: Previews promotion without applying changes
 * - ✅ promote_to_production: Executes sandbox to production promotion
 * - ✅ get_promotion_status: Checks promotion history and status
 * 
 * Integration Status:
 * - All tools registered with toolRegistry
 * - Accessible to AssistBuild via filterAssistBuildTools()
 * - Backend powered by SandboxPromotionService + environment API
 * - English error/success messages
 */

// Export all production-ready tools
export * from './tools-index';
