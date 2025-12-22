// Migrated from AssistOS legacy - Phase 4.3
// Source: /tmp/assistos-legacy/server/realtime.ts

import { Request, Response } from "express";
import { db } from "../db";
import { conversations, messages } from "../../../shared/schema";
import { and, eq, gte, desc } from "drizzle-orm";
import { logger } from "../logger";

/**
 * DELTA API - GET /api/realtime/updates?since=<cursor>&conversationId=<id>
 * 
 * Consolidates multiple polling endpoints into a single delta query.
 * Returns only data that changed since the cursor timestamp.
 * 
 * Query Parameters:
 * - since: ISO timestamp cursor (required) - returns data updated/created after this time
 * - conversationId: Optional - if provided, includes messages for this conversation
 * - scope: "general" or "module" (optional)
 * - moduleSlug: required if scope="module"
 * 
 * Response:
 * - conversations: Array of conversations updated since cursor (with unread counts)
 * - messages: Array of messages for conversationId created since cursor (if conversationId provided)
 * - cursor: New cursor timestamp (current server time)
 */
export async function getDeltaUpdates(req: Request, res: Response) {
  const userId = (req as any).userId || req.session?.userId;
  if (!userId) {
    return res.status(401).json({ error: "Authentication required" });
  }
  if (!tenantId) {
    return res.status(401).json({ error: "Unauthorized - No tenant found" });
  }

  const { since, conversationId, scope, moduleSlug } = req.query;

  // Validate required parameters
  if (!since || typeof since !== "string") {
    return res.status(400).json({ error: "Missing or invalid 'since' parameter" });
  }

  // Parse cursor timestamp
  const cursorDate = new Date(since);
  if (isNaN(cursorDate.getTime())) {
    return res.status(400).json({ error: "Invalid 'since' timestamp format" });
  }

  try {
    // Generate new cursor (current server time)
    const newCursor = new Date().toISOString();

    // Build conversations query conditions - now user-scoped
    const conversationConditions = [
      eq(conversations.userId, userId),
      gte(conversations.updatedAt, cursorDate),
    ];

    if (scope === "general") {
      conversationConditions.push(eq(conversations.scope, "general"));
    } else if (scope === "module" && moduleSlug) {
      conversationConditions.push(eq(conversations.scope, "module"));
      conversationConditions.push(eq(conversations.module, moduleSlug as string));
    }

    // Fetch conversations updated since cursor
    const updatedConversations = await db
      .select()
      .from(conversations)
      .where(and(...conversationConditions))
      .orderBy(desc(conversations.updatedAt));

    // TODO: Add unread counts calculation here
    // For now, return conversations without unread counts
    const conversationsWithUnread = updatedConversations.map(conv => ({
      ...conv,
      unreadCount: 0, // Placeholder - implement unread count logic later
    }));

    // If conversationId provided, fetch messages for that conversation
    let newMessages: any[] = [];
    if (conversationId && typeof conversationId === "string") {
      // INITIAL LOAD: If cursor is very old (before 2021), fetch ALL messages (initial load)
      // DELTA LOAD: If cursor is recent, fetch only new messages since cursor
      const isInitialLoad = cursorDate < new Date('2021-01-01');
      
      if (isInitialLoad) {
        // Fetch ALL messages for initial load
        newMessages = await db
          .select()
          .from(messages)
          .where(eq(messages.conversationId, conversationId))
          .orderBy(messages.createdAt);
      } else {
        // Fetch only NEW messages created since cursor (delta update)
        newMessages = await db
          .select()
          .from(messages)
          .where(
            and(
              eq(messages.conversationId, conversationId),
              gte(messages.createdAt, cursorDate)
            )
          )
          .orderBy(messages.createdAt);
      }
    }

    logger.info({
      msg: "Delta API query",
      since: cursorDate.toISOString(),
      newCursor,
      conversationsUpdated: conversationsWithUnread.length,
      messagesReturned: newMessages.length,
      conversationId: conversationId || null,
    });

    return res.json({
      conversations: conversationsWithUnread,
      messages: newMessages,
      cursor: newCursor,
    });
  } catch (error) {
    logger.error({ msg: "Error in delta API", error });
    return res.status(500).json({ error: "Failed to fetch delta updates" });
  }
}
