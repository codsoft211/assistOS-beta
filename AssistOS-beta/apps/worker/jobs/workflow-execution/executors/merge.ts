/**
 * Merge Node Executor
 * 
 * Combines data from multiple inputs.
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

export class MergeExecutor {
    async execute(
        node: AssistBuildNode,
        context: ExecutionContext
    ): Promise<{ success: boolean; output?: any; error?: string }> {
        const { executionId } = context;
        const config = node.config as any;

        const { mode } = config;

        logger.info(
            { executionId, nodeId: node.id, mode },
            '[MergeExecutor] Executing merge'
        );

        try {
            // Collect all inputs. 
            // In our system, if the user connected edges, the engine resolved 
            // the template variables in the config before calling this.
            // E.g. input_1 might be {{node_a}}, resolveNodeVariables will 
            // substitute it with the actual value from context.variables['node_a'].

            const input1 = (config as any).input_1;
            const input2 = (config as any).input_2;

            let result: any;

            switch (mode) {
                case 'merge_objects':
                    result = {
                        ...(typeof input1 === 'object' ? input1 : { input1 }),
                        ...(typeof input2 === 'object' ? input2 : { input2 }),
                    };
                    break;
                case 'array_of_objects':
                    result = [input1, input2];
                    break;
                case 'wait_for_all':
                    result = input2; // Return the last one
                    break;
                default:
                    result = input2;
            }

            logger.info(
                { executionId, nodeId: node.id },
                '[MergeExecutor] ✅ Merge completed'
            );

            return {
                success: true,
                output: result,
            };
        } catch (error) {
            logger.error(
                { error, executionId, nodeId: node.id },
                '[MergeExecutor] ❌ Merge failed'
            );

            return {
                success: false,
                error: String(error),
            };
        }
    }
}
