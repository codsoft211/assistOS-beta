// Migrated from AssistOS legacy - Phase 4.3
// Source: /tmp/assistos-legacy/server/sse.ts

import { Request, Response } from "express";
import { realtimeEvents } from "./event-emitter";
import { logger } from "../logger";
import { REALTIME_CHANNELS } from "../../../shared/realtime";

/**
 * SSE STREAMING ENDPOINT - GET /api/realtime/stream
 * 
 * Server-Sent Events connection for real-time push updates.
 * Replaces polling entirely - server pushes updates when they happen.
 * 
 * Features:
 * - Heartbeat every 30s to keep connection alive
 * - Per-tenant event isolation
 * - Auto-cleanup on disconnect
 * - Event IDs for resume capability
 * 
 * Usage:
 * const eventSource = new EventSource('/api/realtime/stream');
 * eventSource.addEventListener('message.created', (e) => {
 *   const data = JSON.parse(e.data);
 *   // Handle new message
 * });
 */

let eventId = 0; // Global event ID counter

export function streamRealtimeEvents(req: Request, res: Response) {
  // tenantId is set by requireAuth + tenantMiddleware
  const tenantId = (req as any).tenantId;
  
  console.log("🔌 [SSE] Connection attempt - tenantId:", tenantId);
  
  if (!tenantId) {
    console.log("❌ [SSE] No tenant found - returning 401");
    return res.status(401).json({ error: "Unauthorized - No tenant found" });
  }

  // Set SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // Disable nginx buffering

  // Send initial connection success message
  res.write(`data: ${JSON.stringify({ type: "connected", tenantId })}\n\n`);

  logger.info({
    msg: "SSE connection established",
    tenantId,
    clientIp: req.ip,
  });
  
  console.log(`✅ [SSE] Connection established for tenant: ${tenantId}`);

  // Heartbeat to keep connection alive (every 30s)
  const heartbeatInterval = setInterval(() => {
    res.write(`: heartbeat\n\n`);
  }, 30000);

  // Event handlers - subscribe to all real-time events for this tenant
  const eventHandlers = [
    {
      event: REALTIME_CHANNELS.MESSAGE_CREATED,
      callback: (data: any) => {
        eventId++;
        const message = `id: ${eventId}\nevent: ${REALTIME_CHANNELS.MESSAGE_CREATED}\ndata: ${JSON.stringify(data)}\n\n`;
        res.write(message);
      },
    },
    {
      event: REALTIME_CHANNELS.CONVERSATION_UPDATED,
      callback: (data: any) => {
        eventId++;
        const message = `id: ${eventId}\nevent: ${REALTIME_CHANNELS.CONVERSATION_UPDATED}\ndata: ${JSON.stringify(data)}\n\n`;
        res.write(message);
      },
    },
    {
      event: REALTIME_CHANNELS.CONVERSATION_CREATED,
      callback: (data: any) => {
        eventId++;
        const message = `id: ${eventId}\nevent: ${REALTIME_CHANNELS.CONVERSATION_CREATED}\ndata: ${JSON.stringify(data)}\n\n`;
        res.write(message);
      },
    },
    {
      event: REALTIME_CHANNELS.CONVERSATION_READ,
      callback: (data: any) => {
        eventId++;
        const message = `id: ${eventId}\nevent: ${REALTIME_CHANNELS.CONVERSATION_READ}\ndata: ${JSON.stringify(data)}\n\n`;
        res.write(message);
      },
    },
    {
      event: REALTIME_CHANNELS.MODULES_UPDATED,
      callback: (data: any) => {
        eventId++;
        const message = `id: ${eventId}\nevent: ${REALTIME_CHANNELS.MODULES_UPDATED}\ndata: ${JSON.stringify(data)}\n\n`;
        res.write(message);
      },
    },
    // Custom tables events (for AssistBuild)
    {
      event: REALTIME_CHANNELS.CUSTOM_TABLES_UPDATED,
      callback: (data: any) => {
        eventId++;
        const message = `id: ${eventId}\nevent: ${REALTIME_CHANNELS.CUSTOM_TABLES_UPDATED}\ndata: ${JSON.stringify(data)}\n\n`;
        res.write(message);
      },
    },
    {
      event: REALTIME_CHANNELS.SCHEMA_UPDATED,
      callback: (data: any) => {
        eventId++;
        const message = `id: ${eventId}\nevent: ${REALTIME_CHANNELS.SCHEMA_UPDATED}\ndata: ${JSON.stringify(data)}\n\n`;
        res.write(message);
      },
    },
    // Company events
    {
      event: REALTIME_CHANNELS.COMPANY_UPDATED,
      callback: (data: any) => {
        eventId++;
        const message = `id: ${eventId}\nevent: ${REALTIME_CHANNELS.COMPANY_UPDATED}\ndata: ${JSON.stringify(data)}\n\n`;
        res.write(message);
      },
    },
    // Settings events (Phase 4.3 - NEW)
    {
      event: REALTIME_CHANNELS.SETTINGS_USER_PREFERENCES_UPDATED,
      callback: (data: any) => {
        eventId++;
        const message = `id: ${eventId}\nevent: ${REALTIME_CHANNELS.SETTINGS_USER_PREFERENCES_UPDATED}\ndata: ${JSON.stringify(data)}\n\n`;
        res.write(message);
      },
    },
    {
      event: REALTIME_CHANNELS.SETTINGS_USER_PROFILE_UPDATED,
      callback: (data: any) => {
        eventId++;
        const message = `id: ${eventId}\nevent: ${REALTIME_CHANNELS.SETTINGS_USER_PROFILE_UPDATED}\ndata: ${JSON.stringify(data)}\n\n`;
        res.write(message);
      },
    },
    {
      event: REALTIME_CHANNELS.SETTINGS_TENANT_UPDATED,
      callback: (data: any) => {
        eventId++;
        const message = `id: ${eventId}\nevent: ${REALTIME_CHANNELS.SETTINGS_TENANT_UPDATED}\ndata: ${JSON.stringify(data)}\n\n`;
        res.write(message);
      },
    },
    {
      event: REALTIME_CHANNELS.SETTINGS_TEAM_MEMBER_CHANGED,
      callback: (data: any) => {
        eventId++;
        const message = `id: ${eventId}\nevent: ${REALTIME_CHANNELS.SETTINGS_TEAM_MEMBER_CHANGED}\ndata: ${JSON.stringify(data)}\n\n`;
        res.write(message);
      },
    },
    // AI Response events (Phase 4.4 - Chat Notifications)
    {
      event: REALTIME_CHANNELS.AI_RESPONSE_STARTED,
      callback: (data: any) => {
        eventId++;
        const message = `id: ${eventId}\nevent: ${REALTIME_CHANNELS.AI_RESPONSE_STARTED}\ndata: ${JSON.stringify(data)}\n\n`;
        res.write(message);
      },
    },
    {
      event: REALTIME_CHANNELS.AI_RESPONSE_COMPLETED,
      callback: (data: any) => {
        eventId++;
        console.log(`[SSE] 📨 Writing AI_RESPONSE_COMPLETED event to SSE stream (tenant: ${tenantId}):`, {
          eventId,
          conversationId: data.conversationId,
          messageId: data.messageId,
          clientName: data.clientName,
          isAutomationNotification: data.isAutomationNotification,
          isNewNotification: data.isNewNotification,
        });
        const message = `id: ${eventId}\nevent: ${REALTIME_CHANNELS.AI_RESPONSE_COMPLETED}\ndata: ${JSON.stringify(data)}\n\n`;
        res.write(message);
        console.log(`[SSE] ✅ AI_RESPONSE_COMPLETED event written to SSE stream`);
      },
    },
    {
      event: REALTIME_CHANNELS.AI_RESPONSE_ERROR,
      callback: (data: any) => {
        eventId++;
        const message = `id: ${eventId}\nevent: ${REALTIME_CHANNELS.AI_RESPONSE_ERROR}\ndata: ${JSON.stringify(data)}\n\n`;
        res.write(message);
      },
    },
  ];

  // Subscribe to all events
  const unsubscribers = eventHandlers.map(({ event, callback }) =>
    realtimeEvents.subscribeForTenant(event, tenantId, callback)
  );
  
  console.log(`✅ [SSE] Subscribed to ${eventHandlers.length} event types for tenant: ${tenantId}`);
  console.log(`✅ [SSE] Event types:`, eventHandlers.map(h => h.event));

  // Cleanup on client disconnect
  req.on("close", () => {
    clearInterval(heartbeatInterval);
    unsubscribers.forEach((unsubscribe) => unsubscribe());
    
    logger.info({
      msg: "SSE connection closed",
      tenantId,
      clientIp: req.ip,
    });
    
    console.log(`🔌 [SSE] Connection closed for tenant: ${tenantId}`);
  });
}
