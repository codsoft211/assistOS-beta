/**
 * Activity Feed Service
 * 
 * Centralized service for recording and retrieving system activities across all modules.
 * Provides unified timeline of tenant activities with real-time updates via SSE.
 */

import { db } from "../db";
import { activities, type InsertActivity, type SelectActivity } from "../../../shared/schema";
import { eq, and, desc, gte, lte, inArray, sql } from "drizzle-orm";
import { realtimeEvents } from "./event-emitter";

export interface RecordActivityParams {
  tenantId: string;
  environment?: string;
  userId?: string | null;
  userName?: string | null;
  moduleId: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  entityName?: string | null;
  description?: string | null;
  metadata?: Record<string, any> | null;
  isVisible?: boolean;
  importance?: 'low' | 'normal' | 'high' | 'critical';
}

export interface ListActivitiesParams {
  tenantId: string;
  environment?: string;
  moduleIds?: string[];
  userIds?: string[];
  actions?: string[];
  entityTypes?: string[];
  fromDate?: Date;
  toDate?: Date;
  isVisible?: boolean;
  limit?: number;
  offset?: number;
}

class ActivityService {
  /**
   * Record a new activity in the system
   * Automatically emits real-time event for live updates
   */
  async recordActivity(params: RecordActivityParams): Promise<SelectActivity> {
    const {
      tenantId,
      environment = 'production',
      userId = null,
      userName = null,
      moduleId,
      action,
      entityType,
      entityId = null,
      entityName = null,
      description = null,
      metadata = null,
      isVisible = true,
      importance = 'normal',
    } = params;

    console.log(`[ActivityService] Recording activity: ${moduleId}.${action} for ${entityType}${entityId ? `/${entityId}` : ''}`);

    const activityData: InsertActivity = {
      tenantId,
      environment,
      userId,
      userName,
      moduleId,
      action,
      entityType,
      entityId,
      entityName,
      description,
      metadata,
      isVisible,
      importance,
    };

    const [activity] = await db
      .insert(activities)
      .values([activityData])
      .returning();

    console.log(`[ActivityService] Activity recorded: ${activity.id}`);

    // Emit real-time event for live updates
    realtimeEvents.emit("activity:created", {
      tenantId,
      environment,
      activity,
    });

    return activity;
  }

  /**
   * List activities with optional filters
   * Supports pagination and filtering by module, user, action, date range
   */
  async listActivities(params: ListActivitiesParams): Promise<{
    activities: SelectActivity[];
    total: number;
    hasMore: boolean;
  }> {
    const {
      tenantId,
      environment = 'production',
      moduleIds,
      userIds,
      actions,
      entityTypes,
      fromDate,
      toDate,
      isVisible = true,
      limit = 50,
      offset = 0,
    } = params;

    console.log(`[ActivityService] Listing activities for tenant ${tenantId} (env: ${environment})`);

    // Build WHERE conditions
    const conditions = [
      eq(activities.tenantId, tenantId),
      eq(activities.environment, environment),
      eq(activities.isVisible, isVisible),
    ];

    if (moduleIds && moduleIds.length > 0) {
      conditions.push(inArray(activities.moduleId, moduleIds));
    }

    if (userIds && userIds.length > 0) {
      conditions.push(inArray(activities.userId, userIds));
    }

    if (actions && actions.length > 0) {
      conditions.push(inArray(activities.action, actions));
    }

    if (entityTypes && entityTypes.length > 0) {
      conditions.push(inArray(activities.entityType, entityTypes));
    }

    if (fromDate) {
      conditions.push(gte(activities.createdAt, fromDate));
    }

    if (toDate) {
      conditions.push(lte(activities.createdAt, toDate));
    }

    // Get total count (for pagination)
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(activities)
      .where(and(...conditions));

    // Get paginated results
    const results = await db
      .select()
      .from(activities)
      .where(and(...conditions))
      .orderBy(desc(activities.createdAt))
      .limit(limit)
      .offset(offset);

    console.log(`[ActivityService] Found ${results.length} activities (total: ${count})`);

    return {
      activities: results,
      total: count,
      hasMore: offset + results.length < count,
    };
  }

  /**
   * Get recent activities (last 24h) - useful for dashboard widgets
   */
  async getRecentActivities(
    tenantId: string,
    environment: string = 'production',
    limit: number = 20
  ): Promise<SelectActivity[]> {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const result = await this.listActivities({
      tenantId,
      environment,
      fromDate: oneDayAgo,
      limit,
      offset: 0,
    });

    return result.activities;
  }

  /**
   * Get activity statistics for a tenant
   */
  async getActivityStats(
    tenantId: string,
    environment: string = 'production'
  ): Promise<{
    totalActivities: number;
    activitiesToday: number;
    activitiesByModule: Record<string, number>;
    activitiesByAction: Record<string, number>;
  }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const conditions = [
      eq(activities.tenantId, tenantId),
      eq(activities.environment, environment),
      eq(activities.isVisible, true),
    ];

    // Total activities
    const [{ totalActivities }] = await db
      .select({ totalActivities: sql<number>`count(*)` })
      .from(activities)
      .where(and(...conditions));

    // Activities today
    const [{ activitiesToday }] = await db
      .select({ activitiesToday: sql<number>`count(*)` })
      .from(activities)
      .where(and(...conditions, gte(activities.createdAt, today)));

    // Activities by module
    const moduleStats = await db
      .select({
        moduleId: activities.moduleId,
        count: sql<number>`count(*)`,
      })
      .from(activities)
      .where(and(...conditions))
      .groupBy(activities.moduleId);

    const activitiesByModule: Record<string, number> = {};
    moduleStats.forEach(({ moduleId, count }) => {
      activitiesByModule[moduleId] = count;
    });

    // Activities by action
    const actionStats = await db
      .select({
        action: activities.action,
        count: sql<number>`count(*)`,
      })
      .from(activities)
      .where(and(...conditions))
      .groupBy(activities.action);

    const activitiesByAction: Record<string, number> = {};
    actionStats.forEach(({ action, count }) => {
      activitiesByAction[action] = count;
    });

    return {
      totalActivities,
      activitiesToday,
      activitiesByModule,
      activitiesByAction,
    };
  }
}

export const activityService = new ActivityService();
