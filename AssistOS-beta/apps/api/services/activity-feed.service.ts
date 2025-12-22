import { db } from '../db';
import { activityFeed, type InsertActivityFeed, type SelectActivityFeed } from '../../../shared/schema';
import { eq, and, desc, gte, lte, inArray, sql } from 'drizzle-orm';
import { realtimeEvents } from './event-emitter';

export interface ActivityFeedFilters {
  moduleTypes?: string[];
  entityTypes?: string[];
  userIds?: string[];
  priorities?: string[];
  categories?: string[];
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

export class ActivityFeedService {
  /**
   * Create a new activity feed entry
   * Also broadcasts it in real-time via SSE
   */
  async createActivity(
    activityData: Omit<InsertActivityFeed, 'id' | 'createdAt'>,
    broadcast: boolean = true
  ): Promise<SelectActivityFeed> {
    const [newActivity] = await db
      .insert(activityFeed)
      .values(activityData)
      .returning();

    // 🔴 Broadcast to real-time listeners (SSE)
    if (broadcast && newActivity) {
      realtimeEvents.emit(`tenant:${activityData.tenantId}`, {
        type: 'activity_feed_new',
        data: newActivity,
      });

      // Also broadcast to specific module listeners
      realtimeEvents.emit(
        `tenant:${activityData.tenantId}:module:${activityData.moduleType}`,
        {
          type: 'activity_feed_new',
          data: newActivity,
        }
      );
    }

    return newActivity;
  }

  /**
   * Get recent activity feed for a tenant with optional filters
   */
  async getRecentActivity(
    tenantId: string,
    environment: 'production' | 'sandbox',
    filters: ActivityFeedFilters = {}
  ): Promise<SelectActivityFeed[]> {
    const {
      moduleTypes,
      entityTypes,
      userIds,
      priorities,
      categories,
      startDate,
      endDate,
      limit = 50,
      offset = 0,
    } = filters;

    let query = db
      .select()
      .from(activityFeed)
      .where(
        and(
          eq(activityFeed.tenantId, tenantId),
          eq(activityFeed.environment, environment)
        )
      )
      .$dynamic();

    // Apply filters
    const conditions = [];

    if (moduleTypes && moduleTypes.length > 0) {
      conditions.push(inArray(activityFeed.moduleType, moduleTypes));
    }

    if (entityTypes && entityTypes.length > 0) {
      conditions.push(inArray(activityFeed.entityType, entityTypes));
    }

    if (userIds && userIds.length > 0) {
      conditions.push(inArray(activityFeed.userId, userIds as any));
    }

    if (priorities && priorities.length > 0) {
      conditions.push(inArray(activityFeed.priority, priorities));
    }

    if (categories && categories.length > 0) {
      conditions.push(inArray(activityFeed.category, categories as any));
    }

    if (startDate) {
      conditions.push(gte(activityFeed.createdAt, startDate));
    }

    if (endDate) {
      conditions.push(lte(activityFeed.createdAt, endDate));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    // Order by most recent first
    const activities = await query
      .orderBy(desc(activityFeed.createdAt))
      .limit(limit)
      .offset(offset);

    return activities;
  }

  /**
   * Get activity statistics for a tenant
   */
  async getActivityStats(
    tenantId: string,
    environment: 'production' | 'sandbox',
    startDate?: Date,
    endDate?: Date
  ): Promise<{
    totalActivities: number;
    byModule: Record<string, number>;
    byPriority: Record<string, number>;
    byUser: Record<string, number>;
  }> {
    let baseConditions = and(
      eq(activityFeed.tenantId, tenantId),
      eq(activityFeed.environment, environment)
    );

    const dateConditions = [];
    if (startDate) {
      dateConditions.push(gte(activityFeed.createdAt, startDate));
    }
    if (endDate) {
      dateConditions.push(lte(activityFeed.createdAt, endDate));
    }

    const finalConditions =
      dateConditions.length > 0
        ? and(baseConditions, ...dateConditions)
        : baseConditions;

    // Total activities
    const [totalResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(activityFeed)
      .where(finalConditions);

    const totalActivities = Number(totalResult?.count || 0);

    // By module
    const moduleStats = await db
      .select({
        moduleType: activityFeed.moduleType,
        count: sql<number>`count(*)`,
      })
      .from(activityFeed)
      .where(finalConditions)
      .groupBy(activityFeed.moduleType);

    const byModule: Record<string, number> = {};
    moduleStats.forEach((stat) => {
      byModule[stat.moduleType] = Number(stat.count);
    });

    // By priority
    const priorityStats = await db
      .select({
        priority: activityFeed.priority,
        count: sql<number>`count(*)`,
      })
      .from(activityFeed)
      .where(finalConditions)
      .groupBy(activityFeed.priority);

    const byPriority: Record<string, number> = {};
    priorityStats.forEach((stat) => {
      byPriority[stat.priority] = Number(stat.count);
    });

    // By user (top 10)
    const userStats = await db
      .select({
        userId: activityFeed.userId,
        userName: activityFeed.userName,
        count: sql<number>`count(*)`,
      })
      .from(activityFeed)
      .where(finalConditions)
      .groupBy(activityFeed.userId, activityFeed.userName)
      .orderBy(desc(sql<number>`count(*)`))
      .limit(10);

    const byUser: Record<string, number> = {};
    userStats.forEach((stat) => {
      if (stat.userId) {
        byUser[stat.userName || stat.userId] = Number(stat.count);
      }
    });

    return {
      totalActivities,
      byModule,
      byPriority,
      byUser,
    };
  }

  /**
   * Get activity for a specific entity (e.g., all activity for a project)
   */
  async getEntityActivity(
    tenantId: string,
    environment: 'production' | 'sandbox',
    entityType: string,
    entityId: string,
    limit: number = 20
  ): Promise<SelectActivityFeed[]> {
    const activities = await db
      .select()
      .from(activityFeed)
      .where(
        and(
          eq(activityFeed.tenantId, tenantId),
          eq(activityFeed.environment, environment),
          eq(activityFeed.entityType, entityType),
          eq(activityFeed.entityId, entityId)
        )
      )
      .orderBy(desc(activityFeed.createdAt))
      .limit(limit);

    return activities;
  }

  /**
   * Cleanup old activities (retention policy)
   * Call this via cron job
   */
  async cleanupOldActivities(retentionDays: number = 90): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const result = await db
      .delete(activityFeed)
      .where(lte(activityFeed.createdAt, cutoffDate))
      .returning({ id: activityFeed.id });

    return result.length;
  }
}

export const activityFeedService = new ActivityFeedService();
