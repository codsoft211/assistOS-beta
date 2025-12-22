// AssistSettings Conversations API Routes
// User-scoped settings management via AI chat

import { Router, type Request, type Response } from "express";
import {
  assistsettingsConversations,
  assistsettingsMessages,
  insertAssistsettingsConversationSchema,
  insertAssistsettingsMessageSchema,
  assistsettingsConversationMetadataSchema,
  type InsertAssistsettingsConversation,
  type InsertAssistsettingsMessage,
  users,
} from "../../../shared/schema";
import { requireAuth } from "../middleware/auth.middleware";
import { chatRateLimiter } from "../middleware/rate-limit";
import { db } from "../db";
import { eq, and, desc } from "drizzle-orm";
import { realtimeEvents } from "../services/event-emitter";
import { AssistSettingsOrchestrator } from "../../../packages/ai/agents/assistsettings";
import type { UserContext } from "../../../packages/ai/agents/assistsettings/types";

const router = Router();

// Initialize AssistSettings orchestrator
const assistSettingsOrchestrator = new AssistSettingsOrchestrator();

// ============================================================================
// ASSISTSETTINGS CONVERSATIONS ROUTES
// Purpose: Manage user settings via AI chat (profile, preferences, notifications, team, account)
// Scope: USER-SCOPED ONLY (no tenant/platform tools)
// ============================================================================

/**
 * GET /api/assistsettings/conversations
 * List all conversations for current user
 */
router.get(
  "/conversations",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.id;

      const conversations = await db
        .select()
        .from(assistsettingsConversations)
        .where(eq(assistsettingsConversations.userId, userId))
        .orderBy(desc(assistsettingsConversations.updatedAt));

      res.json(conversations);
    } catch (error: any) {
      console.error("[AssistSettings] List conversations error:", error);
      res.status(500).json({ error: "Failed to list conversations" });
    }
  },
);

/**
 * GET /api/assistsettings/conversations/:id
 * Get conversation with all messages
 */
router.get(
  "/conversations/:id",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.id;
      const { id } = req.params;

      // Get conversation and verify ownership
      const [conversation] = await db
        .select()
        .from(assistsettingsConversations)
        .where(
          and(
            eq(assistsettingsConversations.id, id),
            eq(assistsettingsConversations.userId, userId),
          ),
        )
        .limit(1);

      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }

      // Get all messages
      const messages = await db
        .select()
        .from(assistsettingsMessages)
        .where(eq(assistsettingsMessages.conversationId, id))
        .orderBy(assistsettingsMessages.createdAt);

      res.json({
        ...conversation,
        messages,
      });
    } catch (error: any) {
      console.error("[AssistSettings] Get conversation error:", error);
      res.status(500).json({ error: "Failed to get conversation" });
    }
  },
);

/**
 * GET /api/assistsettings/conversations/:id/messages
 * Get all messages for a conversation
 */
router.get(
  "/conversations/:id/messages",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.id;
      const { id: conversationId } = req.params;

      // Verify conversation ownership
      const [conversation] = await db
        .select()
        .from(assistsettingsConversations)
        .where(
          and(
            eq(assistsettingsConversations.id, conversationId),
            eq(assistsettingsConversations.userId, userId),
          ),
        )
        .limit(1);

      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }

      // Get all messages
      const messages = await db
        .select()
        .from(assistsettingsMessages)
        .where(eq(assistsettingsMessages.conversationId, conversationId))
        .orderBy(assistsettingsMessages.createdAt);

      res.json(messages);
    } catch (error: any) {
      console.error("[AssistSettings] Get messages error:", error);
      res.status(500).json({ error: "Failed to get messages" });
    }
  },
);

/**
 * POST /api/assistsettings/conversations
 * Create new conversation
 */
router.post(
  "/conversations",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.id;

      const validatedData = insertAssistsettingsConversationSchema.parse({
        ...req.body,
        userId,
      });

      const [conversation] = await db
        .insert(assistsettingsConversations)
        .values(validatedData)
        .returning();

      res.status(201).json(conversation);
    } catch (error: any) {
      console.error("[AssistSettings] Create conversation error:", error);
      res.status(400).json({
        error: "Failed to create conversation",
        details: error.message,
      });
    }
  },
);

/**
 * PATCH /api/assistsettings/conversations/:id
 * Update conversation (title, metadata, status)
 */
router.patch(
  "/conversations/:id",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.id;
      const { id } = req.params;
      const { title, metadata, status } = req.body;

      // Verify ownership
      const [existing] = await db
        .select()
        .from(assistsettingsConversations)
        .where(
          and(
            eq(assistsettingsConversations.id, id),
            eq(assistsettingsConversations.userId, userId),
          ),
        )
        .limit(1);

      if (!existing) {
        return res.status(404).json({ error: "Conversation not found" });
      }

      // Validate metadata if provided
      if (metadata) {
        assistsettingsConversationMetadataSchema.parse(metadata);
      }

      const updateData: Partial<InsertAssistsettingsConversation> = {};
      if (title !== undefined) updateData.title = title;
      if (metadata !== undefined) updateData.metadata = metadata;
      if (status !== undefined) updateData.status = status;

      const [updated] = await db
        .update(assistsettingsConversations)
        .set(updateData)
        .where(eq(assistsettingsConversations.id, id))
        .returning();

      res.json(updated);
    } catch (error: any) {
      console.error("[AssistSettings] Update conversation error:", error);
      res.status(400).json({
        error: "Failed to update conversation",
        details: error.message,
      });
    }
  },
);

/**
 * DELETE /api/assistsettings/conversations/:id
 * Delete conversation and all messages
 */
router.delete(
  "/conversations/:id",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.id;
      const { id } = req.params;

      // Verify ownership
      const [existing] = await db
        .select()
        .from(assistsettingsConversations)
        .where(
          and(
            eq(assistsettingsConversations.id, id),
            eq(assistsettingsConversations.userId, userId),
          ),
        )
        .limit(1);

      if (!existing) {
        return res.status(404).json({ error: "Conversation not found" });
      }

      // Delete conversation (cascades to messages)
      await db
        .delete(assistsettingsConversations)
        .where(eq(assistsettingsConversations.id, id));

      res.status(204).send();
    } catch (error: any) {
      console.error("[AssistSettings] Delete conversation error:", error);
      res.status(500).json({ error: "Failed to delete conversation" });
    }
  },
);

/**
 * POST /api/assistsettings/conversations/:id/messages
 * Send message and stream AI response (SSE)
 */
router.post(
  "/conversations/:id/messages",
  requireAuth,
  chatRateLimiter,
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.id;
      const { id: conversationId } = req.params;
      const { content } = req.body;

      if (!content || typeof content !== "string") {
        return res.status(400).json({ error: "Content is required" });
      }

      // Verify conversation ownership
      const [conversation] = await db
        .select()
        .from(assistsettingsConversations)
        .where(
          and(
            eq(assistsettingsConversations.id, conversationId),
            eq(assistsettingsConversations.userId, userId),
          ),
        )
        .limit(1);

      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }

      // Save user message
      const [userMessage] = await db
        .insert(assistsettingsMessages)
        .values({
          conversationId,
          authorType: "user",
          role: "user",
          content: content.trim(),
        })
        .returning();

      // Emit real-time event for user message
      realtimeEvents.emit("assistsettings:message:created", {
        userId,
        conversationId,
        message: userMessage,
      });

      // Update conversation timestamp
      await db
        .update(assistsettingsConversations)
        .set({ updatedAt: new Date() })
        .where(eq(assistsettingsConversations.id, conversationId));

      // Set up SSE streaming
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders(); // Ensure headers are sent immediately

      let assistantContent = "";

      try {
        // ✅ SEND INITIAL PROGRESS IMMEDIATELY (before any processing)
        res.write(
          `data: ${JSON.stringify({ type: "progress", content: "⚙️ Preparando AssistSettings\n" })}\n\n`,
        );

        // Force Node.js to send this chunk immediately
        if (typeof (res as any).flush === "function") {
          (res as any).flush();
        }

        // Small delay to ensure client receives initial progress
        await new Promise((resolve) => setTimeout(resolve, 50));

        // Get conversation history
        const messages = await db
          .select()
          .from(assistsettingsMessages)
          .where(eq(assistsettingsMessages.conversationId, conversationId))
          .orderBy(assistsettingsMessages.createdAt);

        const conversationHistory = messages.slice(-10).map((msg) => ({
          role: msg.role as "user" | "assistant",
          content: msg.content,
        }));

        // Get user info for context
        const user = (req as any).user;
        const [userRecord] = await db
          .select()
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);

        // Build user context
        const userName = userRecord
          ? `${userRecord.firstName || ""} ${userRecord.lastName || ""}`.trim() ||
            undefined
          : undefined;

        const userContext: UserContext = {
          userId,
          userEmail: userRecord?.email,
          userName,
          userRole: undefined, // Role is determined from tenantMemberships, not user table
          isPlatformAdmin: false, // Will be determined from tenant memberships if needed
          tenantId: (req as any).session?.activeTenantId || "",
          environment: (req as any).environment || "production",
          selectedMenu: conversation.metadata?.settingCategory as any,
        };

        // ✅ SEND SECOND PROGRESS UPDATE
        res.write(
          `data: ${JSON.stringify({ type: "progress", content: "🤖 Processando pedido\n" })}\n\n`,
        );
        if (typeof (res as any).flush === "function") {
          console.log("Flushing response");

          (res as any).flush();
        }
        await new Promise((resolve) => setTimeout(resolve, 50));

        // Stream response from AssistSettings orchestrator
        const response = await assistSettingsOrchestrator.processMessage(
          content.trim(),
          userContext,
          (progress) => {
            // Send progress updates via SSE (now won't send duplicates)
            // Skip the initial progress messages since we already sent them
            if (
              !progress.includes("Preparando") &&
              !progress.includes("Processando pedido")
            ) {
              res.write(
                `data: ${JSON.stringify({ type: "progress", content: progress })}\n\n`,
              );
              console.log(`[${new Date().toISOString()}] Sent: "${progress}"`);
            }
          },
          conversationHistory,
          (chunk) => {
            // Stream text chunks via SSE
            assistantContent += chunk;
            res.write(
              `data: ${JSON.stringify({ type: "chunk", content: chunk })}\n\n`,
            );
            console.log(`[${new Date().toISOString()}] Sent: "${chunk}"`);
          },
        );

        // Use final response if streaming didn't capture everything
        if (!assistantContent && response) {
          assistantContent = response;
          res.write(
            `data: ${JSON.stringify({ type: "content", text: response })}\n\n`,
          );
        }

        // Save assistant message
        const [assistantMessage] = await db
          .insert(assistsettingsMessages)
          .values({
            conversationId,
            authorType: "assistant",
            role: "assistant",
            content: assistantContent,
          })
          .returning();

        // Send completion event
        res.write(
          `data: ${JSON.stringify({ type: "done", message: assistantMessage })}\n\n`,
        );
        res.end();

        // Emit real-time event for assistant message
        realtimeEvents.emit("assistsettings:message:created", {
          userId,
          conversationId,
          message: assistantMessage,
        });
      } catch (streamError: any) {
        console.error("[AssistSettings] Streaming error:", streamError);
        res.write(
          `data: ${JSON.stringify({ type: "error", error: streamError.message })}\n\n`,
        );
        res.end();
      }
    } catch (error: any) {
      console.error("[AssistSettings] Send message error:", error);
      if (!res.headersSent) {
        res
          .status(500)
          .json({ error: "Failed to send message", details: error.message });
      }
    }
  },
);

export default router;
