/**
 * JSON Operation Node Executor
 * 
 * Performs JSON parse and stringify operations.
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

export class JsonOperationExecutor {
    async execute(
        node: AssistBuildNode,
        context: ExecutionContext
    ): Promise<{ success: boolean; output?: any; error?: string }> {
        const { executionId } = context;
        const config = node.config as any;

        const { operation, inputField } = config;

        logger.info(
            { executionId, nodeId: node.id, operation },
            '[JsonOperationExecutor] Executing JSON operation'
        );

        try {
            // inputField is already resolved if it was a template {{...}}
            const input = inputField;

            let result;
            if (operation === 'parse') {
                if (typeof input !== 'string') {
                    throw new Error('Input must be a string for JSON parse operation');
                }
                result = JSON.parse(input);
            } else if (operation === 'stringify') {
                result = JSON.stringify(input, null, 2);
            } else {
                throw new Error(`Unsupported operation: ${operation}`);
            }

            logger.info(
                { executionId, nodeId: node.id },
                '[JsonOperationExecutor] ✅ JSON operation completed'
            );

            return {
                success: true,
                output: result,
            };
        } catch (error) {
            logger.error(
                { error, executionId, nodeId: node.id },
                '[JsonOperationExecutor] ❌ JSON operation failed'
            );

            return {
                success: false,
                error: String(error),
            };
        }
    }
}
