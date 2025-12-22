import { ToolBase, type ToolManifest, type ToolExecutionContext } from '../../kernel';
import { db } from '../../../../../apps/api/db';
import { promotionLogs } from '../../../../../shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { z } from 'zod';

const inputSchema = z.object({
  logId: z.string().optional()
});

type GetPromotionStatusInput = z.infer<typeof inputSchema>;

export class GetPromotionStatusTool extends ToolBase<GetPromotionStatusInput, any> {
  manifest: ToolManifest = {
    name: 'get_promotion_status',
    category: 'validation',
    description: 'Queries the status and history of sandbox to production promotions. If logId provided, returns details of a specific promotion. If omitted, lists last 10 promotions for the tenant. Shows promoted records, date, responsible user and results.',
    parameters: [
      { 
        name: 'logId', 
        type: 'string', 
        description: 'Optional promotion log ID to query. If omitted, lists recent promotions.', 
        required: false 
      }
    ],
    requiresAuth: true,
    progressSupport: false
  };

  protected async executeInternal(
    input: GetPromotionStatusInput,
    context: ToolExecutionContext
  ): Promise<any> {
    try {
      const validated = inputSchema.parse(input);
      const { tenantId } = context;

      if (validated.logId) {
        // Get specific promotion log
        const [log] = await db
          .select()
          .from(promotionLogs)
          .where(and(
            eq(promotionLogs.id, validated.logId),
            eq(promotionLogs.tenantId, tenantId)
          ))
          .limit(1);

        if (!log) {
          return {
            success: false,
            error: `Promotion log ${validated.logId} not found`
          };
        }

        const manifest = log.manifestJson as any;
        const result = log.result as any;

        return {
          success: true,
          log: {
            id: log.id,
            promotedAt: log.completedAt || log.startedAt,
            promotedBy: manifest.createdBy,
            recordsPromoted: result.promotedCount || 0,
            tablesAffected: manifest.entities?.length || 0,
            promotionManifest: manifest,
            result: result,
            status: log.status
          },
          message: `Promotion of ${result.promotedCount || 0} record(s) on ${new Date(log.completedAt || log.createdAt).toLocaleString('en-US')}`
        };
      }

      // List recent promotions
      const logs = await db
        .select()
        .from(promotionLogs)
        .where(eq(promotionLogs.tenantId, tenantId))
        .orderBy(desc(promotionLogs.completedAt))
        .limit(10);

      return {
        success: true,
        totalPromotions: logs.length,
        promotions: logs.map(log => {
          const manifest = log.manifestJson as any;
          const result = log.result as any;
          
          return {
            id: log.id,
            promotedAt: log.completedAt || log.startedAt,
            promotedBy: manifest.createdBy,
            recordsPromoted: result.promotedCount || 0,
            tablesAffected: manifest.entities?.length || 0,
            success: result.success ?? true,
            status: log.status
          };
        }),
        message: `Found ${logs.length} recent promotions`
      };
    } catch (error: any) {
      console.error('[get_promotion_status] Error:', error);
      
      if (error.name === 'ZodError') {
        return {
          success: false,
          error: 'Validation error',
          details: error.errors,
          suggestion: 'Check the provided parameters'
        };
      }
      
      return {
        success: false,
        error: error.message || 'Error querying promotion status',
        suggestion: 'Check the provided data and try again'
      };
    }
  }
}
