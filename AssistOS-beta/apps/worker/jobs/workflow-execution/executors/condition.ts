/**
 * Condition Node Executor
 * 
 * Evaluates a condition and branches the workflow.
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

export class ConditionExecutor {
    async execute(
        node: AssistBuildNode,
        context: ExecutionContext
    ): Promise<{ success: boolean; output?: any; error?: string }> {
        const { executionId } = context;
        const config = node.config as any;

        const { field, operator, value } = config;

        logger.info(
            { executionId, nodeId: node.id, field, operator, value },
            '[ConditionExecutor] Evaluating condition'
        );

        try {
            // The engine resolves variables in config, so 'field' might be a value if it was {{path}}
            // but in this node, the user usually enters a template in the field input.
            // E.g. config.field might be "100" (from {{invoice.amount}})

            const actualValue = field; // Already resolved by engine
            const expectedValue = value; // Already resolved by engine

            let conditionMet = false;

            switch (operator) {
                case 'equals':
                    conditionMet = actualValue == expectedValue;
                    break;
                case 'notEquals':
                    conditionMet = actualValue != expectedValue;
                    break;
                case 'contains':
                    conditionMet = String(actualValue).includes(String(expectedValue));
                    break;
                case 'greaterThan':
                    conditionMet = Number(actualValue) > Number(expectedValue);
                    break;
                case 'lessThan':
                    conditionMet = Number(actualValue) < Number(expectedValue);
                    break;
                case 'isEmpty':
                    conditionMet = actualValue === undefined || actualValue === null || actualValue === '';
                    break;
                case 'isNotEmpty':
                    conditionMet = actualValue !== undefined && actualValue !== null && actualValue !== '';
                    break;
                default:
                    throw new Error(`Unsupported operator: ${operator}`);
            }

            logger.info(
                { executionId, nodeId: node.id, result: conditionMet },
                `[ConditionExecutor] ✅ Condition evaluated to: ${conditionMet}`
            );

            return {
                success: true,
                output: { result: conditionMet },
            };
        } catch (error) {
            logger.error(
                { error, executionId, nodeId: node.id },
                '[ConditionExecutor] ❌ Evaluation failed'
            );

            return {
                success: false,
                error: String(error),
            };
        }
    }
}
