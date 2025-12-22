/**
 * Rollback Management Tools for AssistBuild (GAP #6 - COMPLETE)
 * 
 * Production-ready AI tools for system-wide rollback management.
 * All 4 tools implemented using ToolBase pattern and fully integrated.
 * 
 * Tools:
 * - ✅ list_rollback_points: Lists available snapshots
 * - ✅ create_manual_snapshot: Creates manual system snapshots
 * - ✅ execute_rollback: Executes rollback to specific points
 * - ✅ get_rollback_status: Checks rollback execution status
 * 
 * Integration Status:
 * - All tools registered with toolRegistry
 * - Accessible to AssistBuild via filterAssistBuildTools()
 * - Backend powered by RollbackService
 * - English error/success messages
 */

// Export all production-ready tools
export * from './tools-index';
