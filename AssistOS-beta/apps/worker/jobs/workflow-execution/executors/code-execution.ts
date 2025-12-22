/**
 * Code Execution Node Executor
 * 
 * Executes custom JavaScript code.
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

export class CodeExecutionExecutor {
    async execute(
        node: AssistBuildNode,
        context: ExecutionContext
    ): Promise<{ success: boolean; output?: any; error?: string }> {
        const { executionId } = context;
        const config = node.config as any;

        const { code, language } = config;

        logger.info(
            { executionId, nodeId: node.id, language },
            '[CodeExecutionExecutor] Executing code'
        );

        try {
            if (language !== 'javascript') {
                throw new Error(`Unsupported language: ${language}. Only JavaScript is supported in Phase 1.`);
            }

            // Prepare environment
            const sandbox = {
                data: context.variables, // Pass all variables
                context: {
                    executionId,
                    tenantId: context.tenantId,
                    environment: context.environment
                },
                console: {
                    log: (...args: any[]) => logger.info({ executionId, nodeId: node.id, args }, '[CodeNode-Stdout]'),
                    error: (...args: any[]) => logger.error({ executionId, nodeId: node.id, args }, '[CodeNode-Stderr]'),
                }
            };

            // Execute code
            // We use a AsyncFunction-like approach
            const fn = new Function('data', 'context', 'console', `
        return (async () => {
          ${code}
        })();
      `);

            const result = await fn(sandbox.data, sandbox.context, sandbox.console);

            logger.info(
                { executionId, nodeId: node.id },
                '[CodeExecutionExecutor] ✅ Code execution completed'
            );

            return {
                success: true,
                output: result,
            };
        } catch (error) {
            logger.error(
                { error, executionId, nodeId: node.id },
                '[CodeExecutionExecutor] ❌ Code execution failed'
            );

            return {
                success: false,
                error: String(error),
            };
        }
    }
}
