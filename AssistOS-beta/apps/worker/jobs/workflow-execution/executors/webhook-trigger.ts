/**
 * Webhook Trigger Node Executor
 * 
 * Simply passes the incoming webhook payload to the next node.
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

export class WebhookTriggerExecutor {
    async execute(
        node: AssistBuildNode,
        context: ExecutionContext
    ): Promise<{ success: boolean; output?: any; error?: string }> {
        const { executionId, triggerData } = context;

        logger.info(
            { executionId, nodeId: node.id },
            '[WebhookTriggerExecutor] Processing webhook payload'
        );

        try {
            const output = {
                receivedAt: new Date().toISOString(),
                payload: triggerData || {},
                headers: (triggerData as any)?._headers || {},
                query: (triggerData as any)?._query || {},
            };

            // Store in context for downstream nodes
            context.variables['webhook'] = output;
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
