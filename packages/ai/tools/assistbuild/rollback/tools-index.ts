/**
 * Rollback Management Tools for AssistBuild (GAP #6)
 * 
 * Production-ready AI tools for system-wide rollback management.
 * All 4 tools implemented using ToolBase pattern and registered with toolRegistry.
 * 
 * Available Tools:
 * - ✅ list_rollback_points: Lists available snapshots
 * - ✅ create_manual_snapshot: Creates manual system snapshots
 * - ✅ execute_rollback: Executes rollback to specific points
 * - ✅ get_rollback_status: Checks rollback execution status
 * 
 * Integration:
 * - Tools auto-register with toolRegistry on import
 * - Filtered by filterAssistBuildTools() for AssistBuild access
 * - Use RollbackService for all backend operations
 */

import { toolRegistry } from '../../kernel';
import { ListRollbackPointsTool } from './list-rollback-points.tool';
import { CreateManualSnapshotTool } from './create-manual-snapshot.tool';
import { ExecuteRollbackTool } from './execute-rollback.tool';
import { GetRollbackStatusTool } from './get-rollback-status.tool';

// Production-ready tools (all 4 completed)
const rollbackTools = [
  new ListRollbackPointsTool(),
  new CreateManualSnapshotTool(),
  new ExecuteRollbackTool(),
  new GetRollbackStatusTool()
];

// Register all tools with global registry
for (const tool of rollbackTools) {
  toolRegistry.register(tool);
}

export { rollbackTools };
