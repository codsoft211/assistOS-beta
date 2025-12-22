/**
 * Postgres Node Executor
 * 
 * Executes SQL queries against a PostgreSQL database.
 * If connectionString is provided, it connects to that DB.
 * Otherwise, it uses the platform's default pool.
 */

import { Pool } from 'pg';
import { pool as defaultPool } from '../../../db.js';
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

export class PostgresExecutor {
    async execute(
        node: AssistBuildNode,
        context: ExecutionContext
    ): Promise<{ success: boolean; output?: any; error?: string }> {
        const { executionId } = context;
        const config = node.config as any;

        const { query, connectionString } = config;

        logger.info(
            { executionId, nodeId: node.id, hasCustomConn: !!connectionString },
            '[PostgresExecutor] Executing SQL query'
        );

        let clientPool = defaultPool;
        let isCustomPool = false;

        try {
            if (!query) {
                throw new Error('SQL query is required');
            }

            if (connectionString) {
                clientPool = new Pool({ connectionString });
                isCustomPool = true;
            }

            const result = await clientPool.query(query);

            logger.info(
                { executionId, nodeId: node.id, rowCount: result.rowCount },
                '[PostgresExecutor] ✅ Query executed successfully'
            );

            return {
                success: true,
                output: result.rows,
                // We also return rowCount for convenience
                // Note: result.rowCount can be null for some queries
                error: undefined
            };
        } catch (error: any) {
            logger.error(
                { error: error.message, executionId, nodeId: node.id },
                '[PostgresExecutor] ❌ Query failed'
            );

            return {
                success: false,
                error: error.message,
            };
        } finally {
            if (isCustomPool && clientPool && (clientPool as any).end) {
                // Close custom pool to prevent leaks
                await (clientPool as any).end();
            }
        }
    }
}
