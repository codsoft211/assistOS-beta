/**
 * AI Chat Node Executor
 * 
 * Generates text completions using OpenAI.
 */

import { openai } from '../../../../api/services/openai.service.js';
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

export class AiChatExecutor {
    async execute(
        node: AssistBuildNode,
        context: ExecutionContext
    ): Promise<{ success: boolean; output?: any; error?: string }> {
        const { executionId } = context;
        const config = node.config as any;

        const { model, prompt, systemPrompt, temperature, maxTokens } = config;

        logger.info(
            { executionId, nodeId: node.id, model },
            '[AiChatExecutor] Executing AI Chat'
        );

        try {
            if (!prompt) {
                throw new Error('Prompt is required');
            }

            const messages: any[] = [];
            if (systemPrompt) {
                messages.push({ role: 'system', content: systemPrompt });
            }
            messages.push({ role: 'user', content: prompt });

            const response = await openai.chat.completions.create({
                model: model || 'gpt-4o',
                messages,
                temperature: temperature !== undefined ? Number(temperature) : 0.7,
                max_tokens: maxTokens !== undefined ? Number(maxTokens) : 1000,
            });

            const content = response.choices[0]?.message?.content;
            const usage = response.usage;

            logger.info(
                {
                    executionId,
                    nodeId: node.id,
                    tokens: usage?.total_tokens,
                    model: response.model
                },
                '[AiChatExecutor] ✅ AI Chat completed'
            );

            return {
                success: true,
                output: content,
                // We can also return usage if needed, but primary output is the content
            };
        } catch (error: any) {
            logger.error(
                { error: error.message, executionId, nodeId: node.id },
                '[AiChatExecutor] ❌ AI Chat failed'
            );

            return {
                success: false,
                error: error.message,
            };
        }
    }
}
