/**
 * Activity Feed API Routes
 * 
 * Provides REST endpoints for activity feed with real-time SSE updates
 */

import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware";
import { hardTenantGuard } from "../middleware/hard-tenant-guard";
import { activityService } from "../services/activity.service";
import { realtimeEvents } from "../services/event-emitter";

const router = Router();

// Apply authentication and tenant isolation
router.use(requireAuth);
router.use(hardTenantGuard);

/**
 * GET /api/activities
 * List activities with optional filters
 * 
 * Query params:
 * - moduleIds: string[] - Filter by modules (comma-separated)
 * - userIds: string[] - Filter by users (comma-separated)
 * - actions: string[] - Filter by actions (comma-separated)
 * - entityTypes: string[] - Filter by entity types (comma-separated)
 * - fromDate: string (ISO date) - Filter from date
 * - toDate: string (ISO date) - Filter to date
 * - limit: number - Max results (default: 50)
 * - offset: number - Pagination offset (default: 0)
 */
router.get("/", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const environment = (req as any).environment || "production";

    // Parse query params
    const {
      moduleIds: moduleIdsParam,
      userIds: userIdsParam,
      actions: actionsParam,
      entityTypes: entityTypesParam,
      fromDate: fromDateParam,
      toDate: toDateParam,
      limit: limitParam,
      offset: offsetParam,
    } = req.query;

    // Parse array params (comma-separated)
    const moduleIds = moduleIdsParam ? String(moduleIdsParam).split(',') : undefined;
    const userIds = userIdsParam ? String(userIdsParam).split(',') : undefined;
    const actions = actionsParam ? String(actionsParam).split(',') : undefined;
    const entityTypes = entityTypesParam ? String(entityTypesParam).split(',') : undefined;

    // Parse date params
    const fromDate = fromDateParam ? new Date(String(fromDateParam)) : undefined;
    const toDate = toDateParam ? new Date(String(toDateParam)) : undefined;

    // Parse pagination
    const limit = limitParam ? parseInt(String(limitParam), 10) : 50;
    const offset = offsetParam ? parseInt(String(offsetParam), 10) : 0;

    console.log(`[Activities API] GET / - tenant: ${tenantId}, env: ${environment}, limit: ${limit}, offset: ${offset}`);

    const result = await activityService.listActivities({
      tenantId,
      environment,
      moduleIds,
      userIds,
      actions,
      entityTypes,
      fromDate,
      toDate,
      limit,
      offset,
    });

    res.json(result);
  } catch (error: any) {
    console.error("[Activities API] List error:", error);
    res.status(500).json({
      error: "Failed to list activities",
      message: error.message,
    });
  }
});

/**
 * GET /api/activities/recent
 * Get recent activities (last 24h) - useful for dashboard widgets
 * 
 * Query params:
 * - limit: number - Max results (default: 20)
 */
router.get("/recent", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const environment = (req as any).environment || "production";
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 20;

    console.log(`[Activities API] GET /recent - tenant: ${tenantId}, env: ${environment}, limit: ${limit}`);

    const activities = await activityService.getRecentActivities(
      tenantId,
      environment,
      limit
    );

    res.json({
      activities,
      total: activities.length,
    });
  } catch (error: any) {
    console.error("[Activities API] Recent activities error:", error);
    res.status(500).json({
      error: "Failed to get recent activities",
      message: error.message,
    });
  }
});

/**
 * GET /api/activities/stats
 * Get activity statistics for the tenant
 */
router.get("/stats", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const environment = (req as any).environment || "production";

    console.log(`[Activities API] GET /stats - tenant: ${tenantId}, env: ${environment}`);

    const stats = await activityService.getActivityStats(tenantId, environment);

    res.json(stats);
  } catch (error: any) {
    console.error("[Activities API] Stats error:", error);
    res.status(500).json({
      error: "Failed to get activity statistics",
      message: error.message,
    });
  }
});

/**
 * GET /api/activities/stream
 * Real-time SSE stream for new activities
 * Client receives live updates as activities are created
 */
router.get("/stream", (req, res) => {
  const tenantId = (req as any).tenantId;
  const environment = (req as any).environment || "production";

  console.log(`[Activities API] SSE stream opened - tenant: ${tenantId}, env: ${environment}`);

  // Set up SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  // Send initial connection event
  res.write(`data: ${JSON.stringify({ event: "connected", tenantId, environment })}\n\n`);

  // Listen for activity:created events
  const handleActivityCreated = (data: any) => {
    // Only send if activity belongs to this tenant/environment
    if (data.tenantId === tenantId && data.environment === environment) {
      res.write(`data: ${JSON.stringify({ event: "activity:created", activity: data.activity })}\n\n`);
    }
  };

  realtimeEvents.on("activity:created", handleActivityCreated);

  // Clean up on client disconnect
  req.on("close", () => {
    console.log(`[Activities API] SSE stream closed - tenant: ${tenantId}`);
    realtimeEvents.off("activity:created", handleActivityCreated);
    res.end();
  });
});

export default router;
