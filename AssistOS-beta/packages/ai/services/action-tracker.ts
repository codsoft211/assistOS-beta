import { db } from '../../../apps/api/db';
import { userActions, type InsertUserAction } from '../../../shared/schema';
import { eq, and, gte, desc } from 'drizzle-orm';
import { subDays } from 'date-fns';

export class ActionTracker {
  async trackAction(action: InsertUserAction): Promise<string> {
    const [result] = await db.insert(userActions).values([action]).returning({ id: userActions.id });
    return result.id;
  }

  async trackToolExecution(params: {
    tenantId: string;
    userId: string;
    toolName: string;
    category: string;
    affectedEntities?: Array<{ type: string; id: string; name?: string }>;
    sessionId?: string;
    metadata?: Record<string, any>;
  }) {
    return this.trackAction({
      tenantId: params.tenantId,
      userId: params.userId,
      actionType: 'tool_execution',
      toolName: params.toolName,
      category: params.category,
      affectedEntities: params.affectedEntities || [],
      sessionId: params.sessionId,
      metadata: params.metadata,
    });
  }

  async getRecentActions(tenantId: string, userId: string, days: number = 30) {
    const cutoffDate = subDays(new Date(), days);
    
    return db.query.userActions.findMany({
      where: and(
        eq(userActions.tenantId, tenantId),
        eq(userActions.userId, userId),
        gte(userActions.createdAt, cutoffDate)
      ),
      orderBy: [desc(userActions.createdAt)],
      limit: 1000,
    });
  }

  async getActionsBySession(tenantId: string, userId: string, sessionId: string) {
    return db.query.userActions.findMany({
      where: and(
        eq(userActions.tenantId, tenantId),
        eq(userActions.userId, userId),
        eq(userActions.sessionId, sessionId)
      ),
      orderBy: [userActions.sequenceNumber],
    });
  }
}

export const actionTracker = new ActionTracker();
