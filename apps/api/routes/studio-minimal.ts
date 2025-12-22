// Migrated from AssistOS legacy - Phase 4.3
// Source: /tmp/assistos-legacy/server/routes/studio-minimal.ts (1,003 lines)

/**
 * Minimal Configuration Studio Routes
 * Provides essential endpoints without legacy dependencies
 * 
 * TODO: Migrate the following services to complete this route:
 * - ConfigurationStudioAgent class (agents/configuration-studio.ts)
 * - AgentInteractionLogger service
 * - Task executor service
 * - Execution plans schema and storage
 * - User agent interactions schema
 */

import { Router } from "express";
import { db } from "../db";
import { userTenants } from "../../../shared/schema";
import { eq, and } from "drizzle-orm";

const router = Router();

// TODO: Import from services when migrated
// import { getUserPermissions } from "../services/permissions";
// import { ConfigurationStudioAgent } from "../agents/configuration-studio";
// import { AgentInteractionLogger } from "../services/agent-interaction-logger";
// import { executeTasks, type Task } from "../services/task-executor";

// STUB: Permissions service
async function getUserPermissions(userId: string, tenantId: string) {
  console.log(`[Permissions STUB] Getting permissions for user ${userId} in tenant ${tenantId}`);
  // TODO: Implement actual permissions logic
  return {
    role: "owner", // Stub: assume owner for now
    canConfigureEntities: true,
    canConfigureWorkflows: true,
    canAccessSandbox: true,
    canAccessProduction: true,
    canPromoteToProduction: true,
    canManageUsers: true,
  };
}

/**
 * GET /api/studio/status
 * Get current Configuration Studio status (mode, environment, permissions)
 */
router.get("/status", async (req, res) => {
  const userId = req.session?.userId;
  const tenantId = req.session?.activeTenantId;

  console.log("[ConfigStudio /status] Request from:", { userId, tenantId });

  if (!userId || !tenantId) {
    console.log("[ConfigStudio /status] ❌ Not authenticated");
    return res.status(401).json({ error: "Not authenticated" });
  }

  try {
    const permissions = await getUserPermissions(userId, tenantId);
    console.log("[ConfigStudio /status] Permissions:", JSON.stringify(permissions));
    
    if (!permissions) {
      console.log("[ConfigStudio /status] ❌ No permissions found");
      return res.status(403).json({ error: "Access denied" });
    }

    const userTenant = await db
      .select()
      .from(userTenants)
      .where(and(eq(userTenants.userId, userId), eq(userTenants.tenantId, tenantId)))
      .limit(1);

    const environment = userTenant[0]?.activeEnvironment as "sandbox" | "production" || "sandbox";
    const studioMode = (userTenant[0]?.studioMode as "plan" | "build") || "build";

    const response = {
      canAccess: permissions.canConfigureEntities,
      role: permissions.role,
      currentEnvironment: environment,
      currentMode: studioMode,
      currentPhase: null, // No phase tracking in minimal version
      isAvailable: permissions.canConfigureEntities && environment === "sandbox",
      permissions: {
        canAccessSandbox: permissions.canAccessSandbox,
        canAccessProduction: permissions.canAccessProduction,
        canConfigureEntities: permissions.canConfigureEntities,
        canConfigureWorkflows: permissions.canConfigureWorkflows,
        canPromoteToProduction: permissions.canPromoteToProduction,
        canManageUsers: permissions.canManageUsers,
      },
      message: !permissions.canConfigureEntities 
        ? "Configuration Studio requires owner or configurador role"
        : environment !== "sandbox"
        ? "Switch to SANDBOX environment to use Configuration Studio"
        : "Configuration Studio ready",
    };

    console.log("[ConfigStudio /status] ✅ Returning:", JSON.stringify({
      canAccess: response.canAccess,
      role: response.role,
      environment: response.currentEnvironment,
      canConfigureEntities: permissions.canConfigureEntities,
    }));

    // Add no-cache headers to prevent 304 responses
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    res.json(response);
  } catch (error) {
    console.error("[ConfigStudio] Error getting status:", error);
    res.status(500).json({ error: "Failed to get status" });
  }
});

/**
 * POST /api/studio/set-mode
 * Set Configuration Studio mode (plan or build)
 */
router.post("/set-mode", async (req, res) => {
  const userId = req.session?.userId;
  const tenantId = req.session?.activeTenantId;
  const { mode } = req.body;

  if (!userId || !tenantId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  if (!mode || !["plan", "build"].includes(mode)) {
    return res.status(400).json({ error: "Invalid mode. Must be 'plan' or 'build'" });
  }

  try {
    await db
      .update(userTenants)
      .set({ studioMode: mode })
      .where(and(eq(userTenants.userId, userId), eq(userTenants.tenantId, tenantId)));

    console.log(`[ConfigStudio] Set mode to ${mode} for user ${userId}`);
    res.json({ success: true, mode });
  } catch (error) {
    console.error("[ConfigStudio] Error setting mode:", error);
    res.status(500).json({ error: "Failed to set mode" });
  }
});

/**
 * GET /api/studio/is-configured
 * Check if Configuration Studio is properly configured
 */
router.get("/is-configured", async (req, res) => {
  // TODO: Implement actual configuration check
  res.json({ isConfigured: true });
});

/**
 * GET /api/studio/messages
 * Get conversation history for Configuration Studio agent
 */
router.get("/messages", async (req, res) => {
  const userId = req.session?.userId;
  const tenantId = req.session?.activeTenantId;

  if (!userId || !tenantId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  // TODO: Implement message retrieval from user_agent_interactions table
  console.log("[ConfigStudio] Getting messages (STUB)");
  res.json([]);
});

/**
 * POST /api/studio/message
 * Send message to Configuration Studio agent (non-streaming)
 */
router.post("/message", async (req, res) => {
  const userId = req.session?.userId;
  const tenantId = req.session?.activeTenantId;
  const { message } = req.body;

  if (!userId || !tenantId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  if (!message) {
    return res.status(400).json({ error: "Message is required" });
  }

  // TODO: Implement ConfigurationStudioAgent integration
  console.log("[ConfigStudio] Message received (STUB):", message);
  
  res.json({
    success: true,
    response: "Configuration Studio agent not yet migrated. This is a stub response.",
    actions: [],
  });
});

/**
 * POST /api/studio/message-stream
 * Send message to Configuration Studio agent with streaming response
 */
router.post("/message-stream", async (req, res) => {
  const userId = req.session?.userId;
  const tenantId = req.session?.activeTenantId;
  const { message } = req.body;

  if (!userId || !tenantId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  if (!message) {
    return res.status(400).json({ error: "Message is required" });
  }

  // Setup SSE streaming
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  // TODO: Implement ConfigurationStudioAgent streaming
  console.log("[ConfigStudio] Message stream received (STUB):", message);
  
  const stubResponse = "Configuration Studio agent not yet migrated. This is a stub streaming response.";
  const words = stubResponse.split(' ');
  
  for (const word of words) {
    res.write(`data: ${JSON.stringify({ content: word + ' ' })}\n\n`);
  }
  
  res.write('data: [DONE]\n\n');
  res.end();
});

/**
 * POST /api/studio/sync-from-production
 * Sync configuration from production to sandbox
 */
router.post("/sync-from-production", async (req, res) => {
  const userId = req.session?.userId;
  const tenantId = req.session?.activeTenantId;

  if (!userId || !tenantId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  // TODO: Implement production sync logic
  console.log("[ConfigStudio] Sync from production (STUB)");
  res.json({ success: true, message: "Sync not yet implemented" });
});

/**
 * POST /api/studio/deploy-to-production
 * Deploy sandbox configuration to production
 */
router.post("/deploy-to-production", async (req, res) => {
  const userId = req.session?.userId;
  const tenantId = req.session?.activeTenantId;

  if (!userId || !tenantId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  // TODO: Implement production deployment logic
  console.log("[ConfigStudio] Deploy to production (STUB)");
  res.json({ success: true, message: "Deploy not yet implemented" });
});

/**
 * GET /api/studio/welcome
 * Get welcome message for Configuration Studio
 */
router.get("/welcome", async (req, res) => {
  res.json({
    message: "Welcome to Configuration Studio!",
    mode: "build",
  });
});

/**
 * POST /api/studio/mode
 * Set studio mode (alias for set-mode)
 */
router.post("/mode", async (req, res) => {
  const userId = req.session?.userId;
  const tenantId = req.session?.activeTenantId;
  const { mode } = req.body;

  if (!userId || !tenantId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  if (!mode || !["plan", "build"].includes(mode)) {
    return res.status(400).json({ error: "Invalid mode" });
  }

  try {
    await db
      .update(userTenants)
      .set({ studioMode: mode })
      .where(and(eq(userTenants.userId, userId), eq(userTenants.tenantId, tenantId)));

    res.json({ success: true, mode });
  } catch (error) {
    console.error("[ConfigStudio] Error setting mode:", error);
    res.status(500).json({ error: "Failed to set mode" });
  }
});

/**
 * DELETE /api/studio/history
 * Clear conversation history
 */
router.delete("/history", async (req, res) => {
  const userId = req.session?.userId;
  const tenantId = req.session?.activeTenantId;

  if (!userId || !tenantId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  // TODO: Implement history deletion from user_agent_interactions
  console.log("[ConfigStudio] Clear history (STUB)");
  res.json({ success: true });
});

/**
 * POST /api/studio/plans/:id/approve
 * Approve an execution plan
 */
router.post("/plans/:id/approve", async (req, res) => {
  const userId = req.session?.userId;
  const tenantId = req.session?.activeTenantId;
  const { id } = req.params;

  if (!userId || !tenantId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  // TODO: Implement execution plan approval logic
  console.log(`[ConfigStudio] Approve plan ${id} (STUB)`);
  res.json({ success: true, message: "Plan approval not yet implemented" });
});

/**
 * POST /api/studio/feedback
 * Submit feedback about studio interactions
 */
router.post("/feedback", async (req, res) => {
  const userId = req.session?.userId;
  const tenantId = req.session?.activeTenantId;
  const { feedback, rating } = req.body;

  if (!userId || !tenantId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  // TODO: Store feedback for pattern learning
  console.log("[ConfigStudio] Feedback received (STUB):", { feedback, rating });
  res.json({ success: true, message: "Thank you for your feedback!" });
});

export default router;
