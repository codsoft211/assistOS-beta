// Migrated from AssistOS legacy - Phase 4.3
// Source: /tmp/assistos-legacy/server/routes/realtime.ts (26 lines)

import { Router } from "express";
import { streamRealtimeEvents } from "../services/sse.service";
import { getDeltaUpdates } from "../services/realtime.service";

const router = Router();

/**
 * Realtime Routes
 * 
 * Two approaches for real-time updates:
 * 1. SSE (Server-Sent Events) - Preferred, push-based
 * 2. Delta API - Fallback for environments where SSE is blocked
 */

// Test endpoint
router.get("/test", (req, res) => {
  res.json({ message: "Realtime routes working!" });
});

// SSE endpoint - Real-time push updates
router.get("/stream", streamRealtimeEvents);

// Delta API - Polling fallback for environments where SSE is blocked
router.get("/updates", getDeltaUpdates);

export default router;
