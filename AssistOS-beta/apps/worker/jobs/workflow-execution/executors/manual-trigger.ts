/**
 * Manual Trigger Node Executor
 * 
 * The entry point for workflow executions.
 * Simply validates that trigger data is present and passes it forward.
 * 
 * Input: triggerData from context
 * Output: Same trigger data (passthrough)
 */

import type { AssistBuildNode } from '../../../../../shared/schema.js';
import logger from '../../../../api/logger.js';

interface ExecutionContext {
  workflowId: string;
  executionId: string;
  tenantId: string;
  userId: string;
  environment: 'sandbox' | 'production';
  variables: Record<string, any>;
  triggerData?: any;
}

export class ManualTriggerExecutor {
  async execute(
    node: AssistBuildNode,
    context: ExecutionContext
  ): Promise<{ success: boolean; output?: any; error?: string }> {
    const { executionId, triggerData } = context;

    logger.info(
      { executionId, nodeId: node.id, nodeType: 'manual_trigger' },
      '[ManualTriggerExecutor] Executing manual trigger'
    );

    try {
      // Manual trigger just validates and passes data forward
      const output = {
        triggeredAt: new Date().toISOString(),
        data: triggerData || {},
      };

      // Store trigger data in context variables for downstream nodes
      // Store in the format expected by variable resolution: trigger.name, trigger.email
      context.variables['trigger'] = {
        ...output,
        ...(triggerData || {}), // Spread trigger data fields directly (name, email)
        data: triggerData || {}, // Also store under 'data' for trigger.data.name access
      };

      logger.info(
        { executionId, nodeId: node.id, hasData: !!triggerData },
        '[ManualTriggerExecutor] ✅ Manual trigger executed'
      );

      return {
        success: true,
        output,
      };
    } catch (error) {
      logger.error(
        { error, executionId, nodeId: node.id },
        '[ManualTriggerExecutor] ❌ Failed to execute manual trigger'
      );

      return {
        success: false,
        error: String(error),
      };
    }
  }
}
