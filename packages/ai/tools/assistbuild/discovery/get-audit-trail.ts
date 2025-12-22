import { ToolBase, type ToolManifest, type ToolExecutionContext } from '../../kernel';
import { db } from '../../../../../apps/api/db';
import { tenantSchemas } from '../../../../../shared/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { Pool } from 'pg';

// Pool for raw SQL queries to tenant schemas
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/**
 * Escape identifier for SQL (prevent SQL injection)
 */
function escapeIdentifier(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/**
 * Get tenant's schema name
 */
async function getTenantSchemaName(tenantId: string): Promise<string | null> {
  const [schema] = await db
    .select({ schemaName: tenantSchemas.schemaName })
    .from(tenantSchemas)
    .where(eq(tenantSchemas.tenantId, tenantId))
    .limit(1);
  
  return schema?.schemaName || null;
}

const inputSchema = z.object({
  action: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  limit: z.number().int().positive().max(100).optional().default(50),
  offset: z.number().int().nonnegative().optional().default(0),
});

type GetAuditTrailInput = z.infer<typeof inputSchema>;

export class GetAuditTrailTool extends ToolBase<GetAuditTrailInput, any> {
  manifest: ToolManifest = {
    name: 'get_audit_trail',
    category: 'discovery',
    description: 'Views complete history of tenant changes/configurations (audit trail)',
    parameters: [
      { name: 'action', type: 'string', description: 'Filter by action type (e.g., "module_activated")', required: false },
      { name: 'startDate', type: 'string', description: 'Start date (ISO 8601)', required: false },
      { name: 'endDate', type: 'string', description: 'End date (ISO 8601)', required: false },
      { name: 'limit', type: 'number', description: 'Maximum records (default: 50, max: 100)', required: false },
      { name: 'offset', type: 'number', description: 'Offset for pagination (default: 0)', required: false }
    ],
    requiresAuth: true,
    progressSupport: false
  };

  protected async executeInternal(
    input: GetAuditTrailInput,
    context: ToolExecutionContext
  ): Promise<any> {
    try {
      const validated = inputSchema.parse(input);

      // Get tenant schema name
      const schemaName = await getTenantSchemaName(context.tenantId);
      
      if (!schemaName) {
        return {
          success: false,
          error: 'Tenant schema not found'
        };
      }

      // Build WHERE clause
      let whereClause = 'tenant_id = $1';
      const params: any[] = [context.tenantId];
      let paramIndex = 2;

      if (validated.action) {
        whereClause += ` AND action = $${paramIndex++}`;
        params.push(validated.action);
      }

      if (validated.startDate) {
        whereClause += ` AND created_at >= $${paramIndex++}`;
        params.push(new Date(validated.startDate));
      }

      if (validated.endDate) {
        whereClause += ` AND created_at <= $${paramIndex++}`;
        params.push(new Date(validated.endDate));
      }

      // Query tenant schema audit_log
      const result = await pool.query(`
        SELECT 
          id, tenant_id as "tenantId", actor_user_id as "actorUserId",
          target_user_id as "targetUserId", action, metadata,
          ip_address as "ipAddress", user_agent as "userAgent",
          environment, created_at as "createdAt"
        FROM ${escapeIdentifier(schemaName)}."audit_log"
        WHERE ${whereClause}
        ORDER BY created_at DESC
        LIMIT $${paramIndex++} OFFSET $${paramIndex}
      `, [...params, validated.limit, validated.offset]);

      const logs = result.rows;

      if (logs.length === 0) {
        return {
          success: true,
          message: 'No audit trail entries found with the specified filters',
          logs: [],
          count: 0,
          filters: {
            action: validated.action,
            startDate: validated.startDate,
            endDate: validated.endDate
          }
        };
      }

      const actionCounts = logs.reduce((acc: Record<string, number>, log) => {
        acc[log.action] = (acc[log.action] || 0) + 1;
        return acc;
      }, {});

      return {
        success: true,
        logs,
        count: logs.length,
        summary: {
          totalEntries: logs.length,
          actionBreakdown: actionCounts,
          dateRange: {
            oldest: logs[logs.length - 1]?.createdAt,
            newest: logs[0]?.createdAt
          }
        },
        pagination: {
          limit: validated.limit,
          offset: validated.offset,
          hasMore: logs.length === validated.limit
        }
      };

    } catch (error) {
      console.error('[GetAuditTrailTool] Error:', error);
      
      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: 'Invalid input parameters',
          details: error.errors
        };
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch audit trail'
      };
    }
  }
}
