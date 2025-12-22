/**
 * Wait Node Executor
 * 
 * Pauses the workflow execution for a specified duration.
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

export class WaitExecutor {
    async execute(
        node: AssistBuildNode,
        context: ExecutionContext
    ): Promise<{ success: boolean; output?: any; error?: string }> {
        const { executionId } = context;
        const config = node.config as any;

        const duration = Number(config.duration || 5);
        const unit = config.unit || 'seconds';

        logger.info(
            { executionId, nodeId: node.id, duration, unit },
            '[WaitExecutor] Executing wait'
        );

        try {
            let waitMs = duration * 1000;
            if (unit === 'minutes') waitMs *= 60;
            if (unit === 'hours') waitMs *= 3600;

            // Cap at 30 seconds for now to prevent worker timeouts in Phase 1
            // In a real system, this would be handled via a delayed job or sleeping worker.
            const safeWaitMs = Math.min(waitMs, 30000);

            if (waitMs > 30000) {
                logger.warn(
                    { executionId, nodeId: node.id, requested: waitMs, actual: safeWaitMs },
                    '[WaitExecutor] Duration capped at 30s for demo purposes'
                );
            }

            await new Promise(resolve => setTimeout(resolve, safeWaitMs));

            logger.info(
                { executionId, nodeId: node.id },
                '[WaitExecutor] ✅ Wait completed'
            );

            return {
                success: true,
                output: { waitedMs: safeWaitMs, unit },
            };
        } catch (error) {
            logger.error(
                { error, executionId, nodeId: node.id },
                '[WaitExecutor] ❌ Wait failed'
            );

            return {
                success: false,
                error: String(error),
            };
        }
    }
}
