/**
 * RSS Trigger Node Executor
 * 
 * Simply passes the detected RSS feed item to the next node.
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

export class RssTriggerExecutor {
    async execute(
        node: AssistBuildNode,
        context: ExecutionContext
    ): Promise<{ success: boolean; output?: any; error?: string }> {
        const { executionId, triggerData } = context;

        logger.info(
            { executionId, nodeId: node.id },
            '[RssTriggerExecutor] Processing RSS item'
        );

        try {
            const output = triggerData || {};

            // Store in context for downstream nodes
            context.variables['rss'] = output;
            context.variables['trigger'] = output;

            return {
                success: true,
                output,
            };
        } catch (error: any) {
            return {
                success: false,
                error: error.message,
            };
        }
    }
}
