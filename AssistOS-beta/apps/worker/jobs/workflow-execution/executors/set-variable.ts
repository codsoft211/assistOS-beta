/**
 * Set Variable Node Executor
 * 
 * Allows users to define and update variables in the workflow context.
 * These variables can then be used by downstream nodes using {{variable_name}}.
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

export class SetVariableExecutor {
    async execute(
        node: AssistBuildNode,
        context: ExecutionContext
    ): Promise<{ success: boolean; output?: any; error?: string }> {
        const { executionId } = context;
        const config = node.config as any;

        logger.info(
            { executionId, nodeId: node.id, nodeType: 'set_variable' },
            '[SetVariableExecutor] Executing set variable'
        );

        try {
            const { variables } = config;

            if (!variables || !Array.isArray(variables)) {
                throw new Error('Variables must be an array');
            }

            const results: Record<string, any> = {};

            for (const entry of variables) {
                const { key, value } = entry;
                if (!key) continue;

                // The value is already resolved by the engine's resolveNodeVariables
                // before calling the executor.
                context.variables[key] = value;
                results[key] = value;
            }

            logger.info(
                { executionId, nodeId: node.id, keys: Object.keys(results) },
                '[SetVariableExecutor] ✅ Set variables completed'
            );

            return {
                success: true,
                output: results,
            };
        } catch (error) {
            logger.error(
                { error, executionId, nodeId: node.id },
                '[SetVariableExecutor] ❌ Failed to set variables'
            );

            return {
                success: false,
                error: String(error),
            };
        }
    }
}
