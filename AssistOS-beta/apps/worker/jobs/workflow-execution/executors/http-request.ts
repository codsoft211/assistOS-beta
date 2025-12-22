/**
 * HTTP Request Node Executor
 * 
 * Makes HTTP API calls to external services.
 */

import axios from 'axios';
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

export class HttpRequestExecutor {
    async execute(
        node: AssistBuildNode,
        context: ExecutionContext
    ): Promise<{ success: boolean; output?: any; error?: string }> {
        const { executionId } = context;
        const config = node.config as any;

        const { method, url, headers, body } = config;

        logger.info(
            { executionId, nodeId: node.id, method, url },
            '[HttpRequestExecutor] Executing HTTP request'
        );

        try {
            if (!url) {
                throw new Error('URL is required');
            }

            const response = await axios({
                method: method || 'GET',
                url: url,
                headers: headers || {},
                data: body ? (typeof body === 'string' ? JSON.parse(body) : body) : undefined,
                timeout: 10000, // 10s timeout
            });

            logger.info(
                { executionId, nodeId: node.id, status: response.status },
                '[HttpRequestExecutor] ✅ HTTP request completed'
            );

            return {
                success: true,
                output: {
                    status: response.status,
                    statusText: response.statusText,
                    headers: response.headers,
                    data: response.data,
                },
            };
        } catch (error: any) {
            const errorMessage = error.response?.data
                ? JSON.stringify(error.response.data)
                : error.message;

            logger.error(
                {
                    error: errorMessage,
                    status: error.response?.status,
                    executionId,
                    nodeId: node.id
                },
                '[HttpRequestExecutor] ❌ HTTP request failed'
            );

            return {
                success: false,
                error: errorMessage,
                output: error.response ? {
                    status: error.response.status,
                    data: error.response.data
                } : undefined
            };
        }
    }
}
