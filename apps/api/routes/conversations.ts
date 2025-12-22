// Migrated from AssistOS legacy - Phase 4.3
// Source: /tmp/assistos-legacy/server/routes/conversations.ts (761 lines)

/**
 * Conversations & Messages Routes
 * Extracted from routes.old.ts - Chat functionality for Assist Me / Assist Settings
 */

import { Router } from "express";
import { fromZodError } from "zod-validation-error";
import {
  insertConversationSchema,
  insertMessageSchema,
  conversations,
  messages,
  users,
} from "../../../shared/schema";
import {
  streamChatWithAgent,
  type AgentType,
  isOpenAIAvailable,
  getOpenAIStatus,
} from "../services/openai.service";
import { realtimeEvents } from "../services/event-emitter";
import { REALTIME_CHANNELS } from "../../../shared/realtime";
import { chatRateLimiter, uxRateLimiter } from "../middleware/rate-limit";
import { generateConversationTitle as generateConversationTitleAI } from "../../../packages/platform/services/conversation-title-generator";
import { generateConversationTags } from "../../../packages/platform/services/conversation-tags-generator";
import { requireAuth } from "../middleware/auth.middleware";
import { hardTenantGuard } from "../middleware/hard-tenant-guard";
import { getUserRoleInTenant } from "../services/tenant.service";
import { filterRelevantTools } from "../services/smart-tool-filter";
import { db } from "../db";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import multer from "multer";
import path from "path";
import crypto from "crypto";
import { assistBuildOrchestrator } from "../../../packages/ai/agents/assistbuild";
import { AssistSettingsOrchestrator } from "../../../packages/ai/agents/assistsettings";
import { hybridIntelligenceOrchestrator } from "../../../packages/ai/agents/assistme";
import { createTokenStreamOptimizer } from "../../../packages/ai/agents/assistme/utils/token-stream-optimizer";
import { withDbRetry } from "../../shared/utils/db-retry";
import { SupabaseStorageProvider } from "../../../packages/document-management/providers/SupabaseStorageProvider";

// Initialize AssistSettings orchestrator
const assistSettingsOrchestrator = new AssistSettingsOrchestrator();

const router = Router();

// ============================================================================
// MULTI-TENANT SECURITY - Apply hardTenantGuard to ALL routes
// Conversations contain private chat data - CRITICAL protection required
// ============================================================================
router.use(hardTenantGuard);

// Configure multer for file uploads (OPTIONAL - only validates if file is present)
const messageUpload = multer({
  storage: multer.memoryStorage(), // Use memory storage for Supabase uploads
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    // Allow CSV, Excel, images (JPEG, PNG, GIF, WebP), and PDFs
    const allowedTypes = [
      "text/csv",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/gif",
      "image/webp",
      "application/pdf",
    ];
    const allowedExtensions = /\.(csv|xlsx|xls|jpg|jpeg|png|gif|webp|pdf)$/i;

    if (
      allowedTypes.includes(file.mimetype) ||
      file.originalname.match(allowedExtensions)
    ) {
      cb(null, true);
    } else {
      cb(
        new Error(
          "Invalid file type. Allowed: CSV, Excel, images (JPEG, PNG, GIF, WebP), and PDF.",
        ),
      );
    }
  },
}).single("file");

// Wrapper middleware to make file upload optional
const optionalFileUpload = (req: any, res: any, next: any) => {
  // Only apply multer if there's actually multipart/form-data content
  const contentType = req.headers["content-type"] || "";
  if (contentType.includes("multipart/form-data")) {
    return messageUpload(req, res, next);
  }
  // Skip multer for regular JSON requests
  next();
};

// Simplified storage interface (no legacy dependency)
// UPDATED: Now uses userId instead of tenantId (user-scoped, not tenant-scoped)
function getStorage(req: any) {
  const userId = req.session?.userId;

  if (!userId) {
    throw new Error("USER_REQUIRED");
  }

  return {
    async getConversations() {
      return await db
        .select()
        .from(conversations)
        .where(eq(conversations.userId, userId))
        .orderBy(desc(conversations.updatedAt));
    },
    async getConversationsByScope(scope: string, moduleSlug?: string) {
      const conditions = [
        eq(conversations.userId, userId),
        eq(conversations.scope, scope),
      ];
      if (moduleSlug) {
        conditions.push(eq(conversations.module, moduleSlug));
      }
      return await db
        .select()
        .from(conversations)
        .where(and(...conditions))
        .orderBy(desc(conversations.updatedAt));
    },
    async getConversation(id: string) {
      const result = await db
        .select()
        .from(conversations)
        .where(
          and(eq(conversations.id, id), eq(conversations.userId, userId)),
        )
        .limit(1);
      return result[0] || null;
    },
    async createConversation(data: any) {
      const result = await db
        .insert(conversations)
        .values({ ...data, userId })
        .returning();
      return result[0];
    },
    async updateConversation(id: string, data: any) {
      const result = await db
        .update(conversations)
        .set(data)
        .where(
          and(eq(conversations.id, id), eq(conversations.userId, userId)),
        )
        .returning();
      return result[0] || null;
    },
    async getMessagesByConversation(conversationId: string) {
      return await db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, conversationId))
        .orderBy(messages.createdAt);
    },
    async createMessage(data: any) {
      // Ensure userId is set (derived from conversation if not provided)
      if (!data.userId) {
        const [conversation] = await db
          .select({ userId: conversations.userId })
          .from(conversations)
          .where(eq(conversations.id, data.conversationId))
          .limit(1);
        if (conversation) {
          data.userId = conversation.userId;
        } else {
          data.userId = userId; // Fallback to current user
        }
      }
      const result = await db.insert(messages).values(data).returning();
      return result[0];
    },
    async markMessagesAsRead(conversationId: string) {
      await db
        .update(messages)
        .set({ isRead: true })
        .where(eq(messages.conversationId, conversationId));
    },
    async getUnreadMessageCount(conversationId: string) {
      const result = await db
        .select()
        .from(messages)
        .where(
          and(
            eq(messages.conversationId, conversationId),
            eq(messages.role, "assistant"),
            eq(messages.isRead, false),
          ),
        );
      return result.length;
    },
  };
}

// Helper functions
async function generateConversationTitle(
  firstMessage: string,
): Promise<string> {
  const keywords = firstMessage.toLowerCase().split(" ").slice(0, 5);
  return keywords.join(" ").substring(0, 50) || "Nova Conversa";
}

async function detectAgentType(message: string): Promise<string> {
  const lower = message.toLowerCase();

  // Assist Me - Operational ERP assistant with 19+ tools (default for operations)
  // Handles: tasks, orders, analytics, cash flow, receivables, products, stock, clients
  if (
    lower.includes("tarefa") ||
    lower.includes("task") ||
    lower.includes("encomenda") ||
    lower.includes("pedido") ||
    lower.includes("order") ||
    lower.includes("analytics") ||
    lower.includes("métrica") ||
    lower.includes("cash flow") ||
    lower.includes("fluxo de caixa") ||
    lower.includes("contas a receber") ||
    lower.includes("fatura") ||
    lower.includes("produto") ||
    lower.includes("stock") ||
    lower.includes("cliente") ||
    lower.includes("client") ||
    lower.includes("análise") ||
    lower.includes("relatório") ||
    lower.includes("criar") ||
    lower.includes("consultar") ||
    lower.includes("verificar") ||
    lower.includes("quanto") ||
    lower.includes("quem") ||
    lower.includes("quais") ||
    lower.includes("mostrar") ||
    lower.includes("listar")
  ) {
    return "assist_me";
  }

  // Fallback to specialized agents for specific cases
  if (lower.includes("prospecto") || lower.includes("lead"))
    return "prospection";
  if (lower.includes("pagamento")) return "financial";

  // Default to Assist Me for operational queries
  return "assist_me";
}

async function extractClientName(message: string): Promise<string | null> {
  return null; // Simplified
}

// ==================== ROUTES ====================

// GET /api/conversations - List conversations with search and filters
router.get("/", uxRateLimiter, async (req, res) => {
  try {
    // Security: Verify user authentication
    const userId = req.session?.userId;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const { scope, moduleSlug, q, tags, entityType, agentType } = req.query;

    // RECOMMENDED: agentType filter prevents cross-agent conversation leakage
    // TODO: Once all consumers updated, make this REQUIRED (return 400 if missing)
    if (agentType && typeof agentType !== "string") {
      return res.status(400).json({
        error:
          "agentType must be a valid string (assistme, assistbuild, or assistsettings)",
      });
    }

    // Log warning if agentType missing (helps identify unconverted callers)
    if (!agentType) {
      console.warn(
        "[GET /api/conversations] WARN: agentType not provided - returning ALL conversations (legacy behavior). Update caller to specify agentType for better isolation.",
      );
    }

    // Disable HTTP cache
    res.set(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, proxy-revalidate",
    );
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");

    const storage = getStorage(req);
    let conversationsList;

    // Build query conditions - now user-scoped
    const conditions: any[] = [eq(conversations.userId, userId)];

    if (scope && typeof scope === "string") {
      conditions.push(eq(conversations.scope, scope));
      if (moduleSlug) {
        conditions.push(eq(conversations.module, moduleSlug as string));
      }
    }

    // Filter by entity type
    if (entityType && typeof entityType === "string") {
      conditions.push(eq(conversations.relatedEntityType, entityType));
    }

    // Only filter by agentType if provided
    if (agentType && typeof agentType === "string") {
      conditions.push(eq(conversations.agentType, agentType));
    }

    // Filter by tags (JSONB contains check)
    if (tags) {
      const tagList = Array.isArray(tags) ? tags : [tags];
      // For now, we'll filter in-memory (TODO: optimize with JSONB operators)
    }

    // Base query
    conversationsList = await db
      .select()
      .from(conversations)
      .where(and(...conditions))
      .orderBy(desc(conversations.updatedAt));

    // WhatsApp-style search: search in title, relatedEntityName, and message content
    if (q && typeof q === "string" && q.trim()) {
      const searchTerm = q.trim().toLowerCase();

      // Get all message IDs that match the search term
      const matchingMessages = await db
        .select({ conversationId: messages.conversationId })
        .from(messages)
        .where(
          and(
            eq(messages.userId, userId),
            sql`LOWER(${messages.content}) LIKE ${`%${searchTerm}%`}`,
          ),
        );

      const matchingConvIds = new Set(
        matchingMessages.map((m) => m.conversationId),
      );

      // Filter conversations by search term
      conversationsList = conversationsList.filter((conv) => {
        const titleMatch = conv.title?.toLowerCase().includes(searchTerm);
        const entityMatch = conv.relatedEntityName
          ?.toLowerCase()
          .includes(searchTerm);
        const messageMatch = matchingConvIds.has(conv.id);

        return titleMatch || entityMatch || messageMatch;
      });
    }

    // Filter by tags (in-memory for now)
    if (tags) {
      const tagList = Array.isArray(tags) ? tags : [tags];
      conversationsList = conversationsList.filter((conv) => {
        if (!conv.tags || !Array.isArray(conv.tags)) return false;
        return tagList.some((tag) =>
          (conv.tags as string[]).includes(tag as string),
        );
      });
    }

    // Add unread count (with graceful fallback to avoid blocking if DB is slow)
    const conversationsWithUnread = await Promise.all(
      conversationsList.map(async (conv: any) => {
        try {
          const unreadCount = await Promise.race([
            storage.getUnreadMessageCount(conv.id),
            new Promise<number>((resolve) => setTimeout(() => resolve(0), 2000)) // 2s timeout
          ]);
          return { ...conv, unreadCount };
        } catch {
          return { ...conv, unreadCount: 0 };
        }
      }),
    );

    res.json(conversationsWithUnread);
  } catch (error: any) {
    console.error("[GET /api/conversations] Error:", error);
    res
      .status(500)
      .json({ error: error.message || "Failed to fetch conversations" });
  }
});

// GET /api/conversations/:id - Get single conversation
router.get("/:id", async (req, res) => {
  try {
    const userId = req.session?.userId;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const storage = getStorage(req);
    const conversation = await storage.getConversation(req.params.id);
    if (!conversation) {
      return res.status(404).json({ error: "Conversation not found" });
    }
    res.json(conversation);
  } catch (error: any) {
    res
      .status(500)
      .json({ error: error.message || "Failed to fetch conversation" });
  }
});

// POST /api/conversations - Create conversation
router.post("/", async (req, res) => {
  try {
    const userId = req.session?.userId;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }
    
    // Inject userId from session into request body for validation
    const conversationData = {
      ...req.body,
      userId,  // Add userId from session
    };
    
    const result = insertConversationSchema.safeParse(conversationData);
    if (!result.success) {
      const validationError = fromZodError(result.error);
      return res.status(400).json({ error: validationError.message });
    }

    const storage = await getStorage(req);
    const conversation = await storage.createConversation(result.data);
    res.status(201).json(conversation);
  } catch (error: any) {
    res
      .status(500)
      .json({ error: error.message || "Failed to create conversation" });
  }
});

// POST /api/conversations/auto - Auto-create conversation with first message and AI response
router.post("/auto", requireAuth, chatRateLimiter, async (req, res) => {
  try {
    const userId = req.session?.userId;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const {
      content,
      scope = "module",
      moduleSlug,
      attachmentIds = [],
    } = req.body;

    if (!content) {
      return res.status(400).json({ error: "Message content is required" });
    }

    // Get tenant context for file attachments (still tenant-scoped)
    const tenantId = (req as any).tenantId || req.session?.activeTenantId;
    const userRole = tenantId ? await getUserRoleInTenant(userId, tenantId) : null;

    console.log(
      `[POST /auto] User: ${userId}, Tenant: ${tenantId}, Role: ${userRole}, Attachments: ${attachmentIds.length}`,
    );

    // ✅ FETCH ATTACHMENT METADATA IF PROVIDED
    let attachmentMetadata: Array<{
      id: string;
      type: string;
      url: string;
      originalName?: string;
      mimeType?: string;
      size?: number;
    }> = [];
    if (attachmentIds && attachmentIds.length > 0) {
      const { fileAttachments } = await import("../../../shared/schema");
      const attachments = await db
        .select()
        .from(fileAttachments)
        .where(
          and(
            eq(fileAttachments.tenantId, tenantId),
            // @ts-ignore - inArray type issue
            fileAttachments.id.in(attachmentIds),
          ),
        );

      attachmentMetadata = attachments.map((att) => ({
        id: att.id,
        type: att.entityType || "document",
        url: att.path,
        originalName: att.originalName || undefined,
        mimeType: att.mimeType || undefined,
        size: att.size || undefined,
      }));

      console.log(
        `[POST /auto] Fetched ${attachmentMetadata.length} attachments:`,
        attachmentMetadata.map((a) => ({ id: a.id, name: a.originalName })),
      );
    }

    // AI generates metadata
    const [title, detectedAgentType, clientName] = await Promise.all([
      generateConversationTitle(content),
      detectAgentType(content),
      extractClientName(content),
    ]);

    const agentType = detectedAgentType;
    const storage = await getStorage(req);

    // Create conversation
    const conversation = await storage.createConversation({
      title,
      scope,
      module: moduleSlug || null,
      agentType,
    });

    // Create initial user message (userId will be set automatically by storage.createMessage)
    const userMessage = await storage.createMessage({
      conversationId: conversation.id,
      role: "user",
      content,
      userId, // Explicitly set userId
    });

    // Emit real-time event
    if ((req as any).tenantId) {
      realtimeEvents.emitForTenant("message.created", (req as any).tenantId, {
        conversationId: conversation.id,
        message: userMessage,
      });
    }

    // Setup SSE streaming for AI response
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    // ⭐ CRITICAL: Disable TCP buffering for real-time streaming!
    if (res.socket) {
      res.socket.setNoDelay(true);
    }

    res.flushHeaders();

    // Helper to send structured SSE events
    const sendEvent = (eventType: string, data: any) => {
      res.write(`event: ${eventType}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
      if ("flush" in res && typeof res.flush === "function") {
        (res as any).flush();
      }
    };

    try {
      // 🚀 HYBRID INTELLIGENCE ENGINE
      // Routes queries through 4 modes: Trivial/Simple/Moderate/Complex
      // Optimizes for <2s latency and 60%+ cost reduction

      console.log(
        "[POST /auto] 🚀 Using Hybrid Intelligence Engine with Adaptive Token Streaming",
      );

      let fullResponse = "";
      let hybridMetadata: any = {};

      // ⚡ ADAPTIVE TOKEN STREAMING OPTIMIZATION
      // Reduces HTTP overhead by 60-80% while maintaining perceived speed
      // NOTE: Only 'message' events are emitted (via optimizer callback).
      // Legacy 'token' events were removed to eliminate duplication and achieve batching efficiency.
      const tokenOptimizer = createTokenStreamOptimizer(
        (chunk: string) => {
          // Emit optimized 'message' event (batched chunks)
          sendEvent("message", { content: chunk, delta: true });
        },
        {
          maxBufferSize: 50, // ~10 words
          maxBufferTimeMs: 100, // Sub-200ms latency
          immediateSendThreshold: 10, // Long words sent immediately
          enableBackpressure: true, // Protect against slow clients
        },
      );

      // 📊 GRANULAR PROGRESS TRACKING
      // Wraps orchestrator progress events with percentages and ETA
      const { createProgressTracker } = await import(
        "../../../packages/ai/agents/assistme/utils/progress-tracker"
      );
      const progressTracker = createProgressTracker(
        (snapshot) => {
          // Emit enhanced progress with percentages and ETA
          sendEvent("progress", {
            stage: snapshot.currentStage,
            message: snapshot.message,
            percentage: snapshot.percentage,
            eta_seconds: snapshot.eta_seconds,
          });
        },
        "moderate", // Default to moderate complexity
        "conversation_message",
      );

      // Process message through Hybrid Intelligence with attachments
      const hybridResponse =
        await hybridIntelligenceOrchestrator.processMessage(
          content,
          {
            tenantId,
            userId,
            conversationId: conversation.id,
            userRole: userRole || "user",
            environment: (req as any).environment || "production",
            attachments:
              attachmentMetadata.length > 0 ? attachmentMetadata : undefined,
          },
          {
            onStageProgress: (stage, message) => {
              // Update progress tracker and emit enhanced progress
              // FIX: Prevent double-counting by properly handling stage transitions
              if (stage === "analyzing") {
                progressTracker.startStage("analyzing", message);
              } else if (stage === "routing") {
                // Routing = transition from analyzing to planning
                progressTracker.completeStage();
                progressTracker.startStage("planning", message);
              } else if (stage === "planning") {
                // Planning stage already started by routing, just update
                progressTracker.updateProgress(message);
              } else if (stage === "executing") {
                progressTracker.completeStage();
                progressTracker.startStage("executing", message);
              } else if (stage === "synthesizing") {
                progressTracker.completeStage();
                progressTracker.startStage("synthesizing", message);
              } else if (stage === "formatting") {
                // Treat formatting as sub-stage of synthesizing (no double count)
                progressTracker.updateProgress(message);
              } else {
                // Generic stage update
                progressTracker.updateProgress(message);
              }
            },
            onToolStart: (toolName, params) => {
              // Stream tool start event
              sendEvent("tool_start", { tool: toolName, params });
            },
            onToolProgress: (toolName, progress) => {
              // Stream tool progress event
              sendEvent("tool_progress", { tool: toolName, progress });
            },
            onToolComplete: (toolName, result) => {
              // Stream tool complete event
              sendEvent("tool_complete", { tool: toolName, result });
            },
            onToken: (token) => {
              // Accumulate response and stream via optimizer (emits 'message' events)
              fullResponse += token;

              // Fire-and-forget with error handling to prevent unhandled rejections
              tokenOptimizer.addToken(token).catch((err) => {
                console.error("[TokenOptimizer] Error adding token:", err);
              });
            },
            onStreamChunk: (chunk) => {
              // Accumulate response and stream via optimizer (emits 'message' events)
              fullResponse += chunk;

              // Fire-and-forget with error handling to prevent unhandled rejections
              tokenOptimizer.addToken(chunk).catch((err) => {
                console.error("[TokenOptimizer] Error adding chunk:", err);
              });
            },
            onComplete: async () => {
              // Complete progress tracking
              progressTracker.complete("✅ Resposta completa");

              // Flush any remaining tokens before completion
              await tokenOptimizer.complete();

              // Log optimizer performance
              const stats = tokenOptimizer.getStats();
              console.log(
                `[POST /auto] 📊 Token Streaming Stats: ` +
                  `${stats.tokensReceived} tokens → ${stats.chunksEmitted} chunks ` +
                  `(${stats.reductionPercent}% reduction, ${stats.avgChunkSize} avg size, ` +
                  `${stats.avgLatencyMs}ms avg latency, ${stats.backpressureEvents} backpressure events)`,
              );

              // Stream completion event
              sendEvent("complete", {});
            },
            onError: async (error) => {
              // Flush on error
              await tokenOptimizer.complete();
              // Stream error event
              sendEvent("error", { message: error.message });
            },
          },
          [], // No conversation history for first message (this is the first message in a new conversation)
        );

      // Use response from Hybrid Intelligence
      if (!fullResponse) {
        fullResponse = hybridResponse.content;
      }

      // Capture metadata
      hybridMetadata = {
        mode: hybridResponse.mode,
        duration_ms: hybridResponse.duration_ms,
        cost_usd: hybridResponse.cost_usd || 0,
        cached: hybridResponse.cached || false,
        tools_used: hybridResponse.tools_used || [],
        classification_confidence:
          hybridResponse.metadata?.classification_confidence,
      };

      console.log(
        `[POST /auto] ✅ Hybrid Intelligence completed: ` +
          `mode=${hybridMetadata.mode}, ` +
          `duration=${hybridMetadata.duration_ms}ms, ` +
          `cost=$${hybridMetadata.cost_usd.toFixed(4)}, ` +
          `cached=${hybridMetadata.cached}`,
      );

      // Save assistant message (userId will be set automatically by storage.createMessage)
      const assistantMessage = await storage.createMessage({
        conversationId: conversation.id,
        role: "assistant",
        content: fullResponse,
        userId, // Explicitly set userId
      });

      // Update conversation's updatedAt to reflect latest message timestamp
      await db
        .update(conversations)
        .set({ updatedAt: new Date() })
        .where(eq(conversations.id, conversation.id));

      // Emit real-time event
      if ((req as any).tenantId) {
        realtimeEvents.emitForTenant("message.created", (req as any).tenantId, {
          conversationId: conversation.id,
          message: assistantMessage,
          hybridMetadata,
        });
      }

      // Send conversation info, metadata, and done event
      res.write(
        `data: ${JSON.stringify({
          conversation,
          userMessage,
          assistantMessage,
          hybrid: hybridMetadata,
        })}\n\n`,
      );
      sendEvent("done", {});
      res.end();

      // 🎯 AUTO-GENERATE intelligent title and tags in background (non-blocking)
      // This analyzes the conversation content and detects the related module
      (async () => {
        try {
          const [titleResult, tagsResult] = await Promise.all([
            generateConversationTitleAI(conversation.id),
            generateConversationTags(conversation.id),
          ]);

          await storage.updateConversation(conversation.id, {
            title: titleResult.title,
            tags: tagsResult.tags,
          });

          console.log(
            `[AUTO-METADATA] ✅ Generated: title="${titleResult.title}", tags=${JSON.stringify(tagsResult.tags)} for conversation ${conversation.id}`,
          );

          // Emit real-time update for title and tags change
          if ((req as any).tenantId) {
            realtimeEvents.emitForTenant(
              "conversation.updated",
              (req as any).tenantId,
              {
                conversationId: conversation.id,
                title: titleResult.title,
                tags: tagsResult.tags,
              },
            );
          }
        } catch (error) {
          console.error("[AUTO-METADATA] Failed to generate metadata:", error);
          // Non-critical, conversation still works with defaults
        }
      })();
    } catch (aiError) {
      console.error("[AI] Streaming error in /auto:", aiError);
      res.write(
        `data: ${JSON.stringify({ error: "Failed to generate response" })}\n\n`,
      );
      res.end();
    }
  } catch (error: any) {
    console.error("[POST /api/conversations/auto] Error:", error);
    if (!res.headersSent) {
      res
        .status(500)
        .json({ error: error.message || "Failed to create conversation" });
    }
  }
});

// GET /api/conversations/:conversationId/messages - Get messages
router.get("/:conversationId/messages", async (req, res) => {
  try {
    const userId = req.session?.userId;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const storage = getStorage(req);
    const conversationId = req.params.conversationId;
    
    // First verify conversation exists and belongs to tenant (with retry for pool exhaustion)
    const conversation = await withDbRetry(
      () => storage.getConversation(conversationId),
      { maxRetries: 3, baseDelay: 200 }
    );
    if (!conversation) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    // Then get messages (with retry for pool exhaustion)
    const messagesList = await withDbRetry(
      () => storage.getMessagesByConversation(conversationId),
      { maxRetries: 3, baseDelay: 200 }
    );
    res.json(messagesList);
  } catch (error: any) {
    console.error("[GET /api/conversations/:conversationId/messages] Error:", error);
    res
      .status(500)
      .json({ error: error.message || "Failed to fetch messages" });
  }
});

// POST /api/conversations/:id/messages/mark-read - Mark messages as read
router.post("/:id/messages/mark-read", uxRateLimiter, async (req, res) => {
  try {
    const userId = req.session?.userId;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const storage = getStorage(req);
    const conversation = await storage.getConversation(req.params.id);
    if (!conversation) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    await storage.markMessagesAsRead(req.params.id);
    res.json({ success: true });
  } catch (error: any) {
    console.error(
      "[POST /api/conversations/:id/messages/mark-read] Error:",
      error,
    );
    res
      .status(500)
      .json({ error: error.message || "Failed to mark messages as read" });
  }
});

// POST /api/conversations/:id/messages - Send message (STREAMING)
router.post(
  "/:id/messages",
  requireAuth,
  chatRateLimiter,
  (req, res, next) => {
    optionalFileUpload(req, res, async (err: any) => {
      if (err) {
        // Multer error (file validation failed)
        return res.status(400).json({ error: err.message });
      }
      next();
    });
  },
  async (req, res) => {
    // ⏱️ TIMING: Request start
    const timingStart = Date.now();
    const timings: Record<string, number> = {};

    try {
      const userId = req.session?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const conversationId = req.params.id;
      const { content, attachmentIds: bodyAttachmentIds, metadata } = req.body;
      const file = (req as any).file;

      // Require at least one of: content, file, or pre-uploaded attachments
      if (
        !content &&
        !file &&
        (!bodyAttachmentIds || bodyAttachmentIds.length === 0)
      ) {
        return res
          .status(400)
          .json({ error: "Message content or file is required" });
      }

      const storage = getStorage(req);
      const conversation = await storage.getConversation(conversationId);
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }

      // Get tenant context for file attachments (still tenant-scoped)
      const tenantId = (req as any).tenantId || req.session?.activeTenantId;
      const userRole = tenantId ? await getUserRoleInTenant(userId, tenantId) : null;

      timings.initialization = Date.now() - timingStart;
      console.log(
        `[POST /messages] User: ${userId}, Tenant: ${tenantId}, Role: ${userRole}, File: ${file?.originalname}, AttachmentIds from body: ${bodyAttachmentIds ? JSON.stringify(bodyAttachmentIds) : "none"}`,
      );

      // ✅ PROCESS FILE ATTACHMENTS (from body IDs or Multer upload)
      const attachmentStart = Date.now();
      let attachmentIds: string[] = [];

      // PRIORITY 1: Use pre-uploaded file IDs from frontend
      if (
        bodyAttachmentIds &&
        Array.isArray(bodyAttachmentIds) &&
        bodyAttachmentIds.length > 0
      ) {
        attachmentIds = bodyAttachmentIds;
        console.log(
          `[POST /messages] Using ${attachmentIds.length} pre-uploaded attachments from body`,
        );
      }
      // PRIORITY 2: Process direct Multer upload (legacy path)
      else if (file) {
        console.log(
          `[POST /messages] Processing direct Multer upload: ${file.originalname}`,
        );
        const { fileAttachments } = await import("../../../shared/schema");

        // Get file buffer from multer (it's in memory now)
        const fileBuffer = file.buffer;
        const sha256Hash = crypto.createHash("sha256")
          .update(fileBuffer)
          .digest("hex");

        // Generate Supabase storage path
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const uniqueId = crypto.randomUUID();
        const storagePath = `${tenantId}/${year}/${month}/${uniqueId}_${file.originalname}`;

        // Upload to Supabase Storage
        // Check if Supabase is configured
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
        const bucketName = process.env.SUPABASE_BUCKET_NAME || 'assistos-attachments';

        if (!supabaseUrl || !supabaseKey) {
          console.error('[POST /messages] Supabase credentials not configured');
          return res.status(503).json({
            error: "File storage not configured",
            details: "Supabase Storage credentials are missing. Please configure SUPABASE_URL and SUPABASE_SERVICE_KEY in your environment variables."
          });
        }

        try {
          const supabaseProvider = new SupabaseStorageProvider({
            type: 'supabase',
            bucketName,
            credentials: {
              url: supabaseUrl,
              key: supabaseKey,
            },
          });

          console.log(`[POST /messages] Uploading to Supabase: ${storagePath}`);

          const uploadResult = await supabaseProvider.upload(fileBuffer, storagePath, {
            contentType: file.mimetype,
            metadata: {
              originalName: file.originalname,
              tenantId,
              uploadedBy: userId,
              entityType: 'message',
            },
            checksum: sha256Hash,
          });

          console.log(`[POST /messages] ✅ Uploaded to Supabase successfully:`, {
            path: uploadResult.path,
            size: uploadResult.size,
            externalId: uploadResult.externalId,
          });

          // Save to database ONLY after successful upload
          const [attachment] = await db
            .insert(fileAttachments)
            .values({
              tenantId,
              filename: `${uniqueId}_${file.originalname}`,
              originalName: file.originalname,
              path: storagePath,  // Supabase path
              mimeType: file.mimetype,
              size: file.size,
              checksum: sha256Hash,
              sourceSystem: 'supabase',  // Important: indicates Supabase storage
              entityType: "message",
              entityId: null,
              uploadedBy: userId,
            })
            .returning();

          attachmentIds.push(attachment.id);
          console.log(`[POST /messages] ✅ Stored attachment in database:`, {
            id: attachment.id,
            originalName: attachment.originalName,
            storagePath,
            sha256: sha256Hash.substring(0, 16) + "...",
            size: (file.size / 1024).toFixed(2) + " KB",
          });
        } catch (uploadError) {
          console.error('[POST /messages] Failed to upload to Supabase:', uploadError);
          
          // Return specific error instead of throwing (prevents "request userid" error)
          return res.status(500).json({
            error: "Failed to upload attachment",
            details: uploadError instanceof Error ? uploadError.message : 'Unknown storage error',
            suggestion: "Please verify Supabase Storage is configured correctly and the bucket exists"
          });
        }
      }

      timings.attachment_processing = Date.now() - attachmentStart;

      // Create user message with attachmentIds
      const messageDbStart = Date.now();
      const userMessage = await storage.createMessage({
        conversationId,
        role: "user",
        content,
        userId, // Explicitly set userId
        attachmentIds: attachmentIds.length > 0 ? attachmentIds : undefined,
        metadata: metadata || null,
      });

      // Update conversation's updatedAt to reflect latest message timestamp
      await db
        .update(conversations)
        .set({ updatedAt: new Date() })
        .where(eq(conversations.id, conversationId));

      // Link attachment to message if attachment was uploaded
      if (attachmentIds.length > 0) {
        const { fileAttachments } = await import("../../../shared/schema");
        for (const attachmentId of attachmentIds) {
          await db
            .update(fileAttachments)
            .set({ entityId: userMessage.id })
            .where(eq(fileAttachments.id, attachmentId));
          console.log(
            `[POST /messages] Linked attachment ${attachmentId} to message ${userMessage.id}`,
          );
        }
      }

      // Emit real-time event
      if ((req as any).tenantId) {
        realtimeEvents.emitForTenant("message.created", (req as any).tenantId, {
          conversationId,
          message: userMessage,
        });
      }

      timings.message_db_operations = Date.now() - messageDbStart;

      // Get previous messages for context (filter out messages with null/empty content)
      const historyStart = Date.now();
      const previousMessages =
        await storage.getMessagesByConversation(conversationId);
      const messagesToSend = previousMessages
        .slice(-10)
        .filter(
          (m: any) =>
            m.content &&
            typeof m.content === "string" &&
            m.content.trim().length > 0,
        )
        .filter((m: any) => m.role === "user" || m.role === "assistant") // Filter out system messages
        .map((m: any) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        }));

      timings.history_fetch = Date.now() - historyStart;

      console.log(`[⏱️ POST /messages] Pre-processing timings:`, {
        initialization: `${timings.initialization}ms`,
        attachment_processing: `${timings.attachment_processing}ms`,
        message_db_operations: `${timings.message_db_operations}ms`,
        history_fetch: `${timings.history_fetch}ms`,
        total_pre_processing: `${Date.now() - timingStart}ms`,
      });

      // Setup SSE streaming
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");

      // ⭐ CRITICAL: Disable TCP buffering for real-time streaming!
      if (res.socket) {
        res.socket.setNoDelay(true);
      }

      res.flushHeaders();
      res.write(": connected\n\n");

      // Helper to send structured SSE events
      const sendEvent = (eventType: string, data: any) => {
        res.write(`event: ${eventType}\n`);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
        if ("flush" in res && typeof res.flush === "function") {
          (res as any).flush();
        }
      };

      let fullResponse = "";

      try {
        // Use conversation's agentType directly
        const selectedAgentType = conversation.agentType as AgentType;

        // Handle assistbuild and assistsettings agent types in dedicated routes
        if (
          selectedAgentType === "assistbuild" ||
          selectedAgentType === "assistsettings"
        ) {
          return;
        }
        // 🚀 FOR OTHER AGENT TYPES: Use Hybrid Intelligence Engine
        console.log(
          `[POST /messages] Using Hybrid Intelligence Engine for agentType: ${selectedAgentType}`,
        );

        // ✅ FETCH ATTACHMENT METADATA IF FILE WAS UPLOADED
        let attachmentMetadata: Array<{
          id: string;
          type: string;
          url: string;
          originalName?: string;
          mimeType?: string;
          size?: number;
        }> = [];
        if (attachmentIds && attachmentIds.length > 0) {
          const { fileAttachments } = await import("../../../shared/schema");
          const attachments = await db
            .select()
            .from(fileAttachments)
            .where(
              and(
                eq(fileAttachments.tenantId, tenantId),
                inArray(fileAttachments.id, attachmentIds),
              ),
            );

          attachmentMetadata = attachments.map((att) => ({
            id: att.id,
            type: att.entityType || "document",
            url: att.path,
            originalName: att.originalName || undefined,
            mimeType: att.mimeType || undefined,
            size: att.size || undefined,
          }));

          console.log(
            `[POST /messages] Fetched ${attachmentMetadata.length} attachments:`,
            attachmentMetadata.map((a) => ({ id: a.id, name: a.originalName })),
          );
        }

        // ✅ PREPARE CONVERSATION HISTORY (already fetched above as messagesToSend)
        // Remove current message from history to avoid duplication
        const historyWithoutCurrent = messagesToSend.slice(0, -1);

        console.log(
          `[POST /messages] Conversation history: ${historyWithoutCurrent.length} messages`,
        );

        let hybridMetadata: any = {};

        // ⚡ ADAPTIVE TOKEN STREAMING OPTIMIZATION
        // Reduces HTTP overhead by 60-80% while maintaining perceived speed
        // NOTE: Only 'message' events are emitted (via optimizer callback).
        // Legacy 'token' events were removed to eliminate duplication and achieve batching efficiency.
        const tokenOptimizer = createTokenStreamOptimizer(
          (chunk: string) => {
            // Emit optimized 'message' event (batched chunks)
            sendEvent("message", { content: chunk, delta: true });
          },
          {
            maxBufferSize: 50, // ~10 words
            maxBufferTimeMs: 100, // Sub-200ms latency
            immediateSendThreshold: 10, // Long words sent immediately
            enableBackpressure: true, // Protect against slow clients
          },
        );

        // 📊 GRANULAR PROGRESS TRACKING
        // Wraps orchestrator progress events with percentages and ETA
        const { createProgressTracker: createProgressTracker2 } = await import(
          "../../../packages/ai/agents/assistme/utils/progress-tracker"
        );
        const progressTracker2 = createProgressTracker2(
          (snapshot) => {
            // Emit enhanced progress with percentages and ETA
            sendEvent("progress", {
              stage: snapshot.currentStage,
              message: snapshot.message,
              percentage: snapshot.percentage,
              eta_seconds: snapshot.eta_seconds,
            });
          },
          "moderate", // Default to moderate complexity
          "conversation_continue",
        );

        // 🚀 SEND IMMEDIATE INITIAL FEEDBACK
        // User should NEVER see just loading dots - always show what's happening!
        sendEvent("progress", {
          stage: "analyzing",
          message: "🔍 A analisar pedido...",
          percentage: 0,
          eta_seconds: 4,
        });

        // 📢 EMIT GLOBAL AI_RESPONSE_STARTED EVENT (for notifications)
        if ((req as any).tenantId) {
          realtimeEvents.emitForTenant(
            REALTIME_CHANNELS.AI_RESPONSE_STARTED,
            (req as any).tenantId,
            {
              conversationId,
              messagePreview: content.substring(0, 100),
              timestamp: new Date().toISOString(),
            },
          );
        }

        // ⏱️ TIMING: Start AI orchestrator call
        const orchestratorStart = Date.now();
        console.log(
          `[⏱️ POST /messages] Starting Hybrid Intelligence orchestrator (${Date.now() - timingStart}ms since request start)`,
        );

        // Process message through Hybrid Intelligence with attachments and history
        const hybridResponse =
          await hybridIntelligenceOrchestrator.processMessage(
            content,
            {
              tenantId,
              userId,
              conversationId,
              userRole: userRole || "user",
              environment: (req as any).environment || "production",
              attachments:
                attachmentMetadata.length > 0 ? attachmentMetadata : undefined,
            },
            {
              onStageProgress: (stage, message) => {
                // Update progress tracker and emit enhanced progress
                // FIX: Prevent double-counting by properly handling stage transitions
                if (stage === "analyzing") {
                  progressTracker2.startStage("analyzing", message);
                } else if (stage === "routing") {
                  // Routing = transition from analyzing to planning
                  progressTracker2.completeStage();
                  progressTracker2.startStage("planning", message);
                } else if (stage === "planning") {
                  // Planning stage already started by routing, just update
                  progressTracker2.updateProgress(message);
                } else if (stage === "executing") {
                  progressTracker2.completeStage();
                  progressTracker2.startStage("executing", message);
                } else if (stage === "synthesizing") {
                  progressTracker2.completeStage();
                  progressTracker2.startStage("synthesizing", message);
                } else if (stage === "formatting") {
                  // Treat formatting as sub-stage of synthesizing (no double count)
                  progressTracker2.updateProgress(message);
                } else {
                  // Generic stage update
                  progressTracker2.updateProgress(message);
                }
              },
              onToolStart: (toolName, params) => {
                // Stream tool start event
                sendEvent("tool_start", { tool: toolName, params });
              },
              onToolProgress: (toolName, progress) => {
                // Stream tool progress event
                sendEvent("tool_progress", { tool: toolName, progress });
              },
              onToolComplete: (toolName, result) => {
                // Stream tool complete event
                sendEvent("tool_complete", { tool: toolName, result });
              },
              onToken: (token) => {
                // Accumulate response and stream via optimizer (emits 'message' events)
                fullResponse += token;

                // Fire-and-forget with error handling to prevent unhandled rejections
                tokenOptimizer.addToken(token).catch((err) => {
                  console.error("[TokenOptimizer] Error adding token:", err);
                });
              },
              onStreamChunk: (chunk) => {
                // Accumulate response and stream via optimizer (emits 'message' events)
                fullResponse += chunk;

                // Fire-and-forget with error handling to prevent unhandled rejections
                tokenOptimizer.addToken(chunk).catch((err) => {
                  console.error("[TokenOptimizer] Error adding chunk:", err);
                });
              },
              onComplete: async () => {
                // Complete progress tracking
                progressTracker2.complete("✅ Resposta completa");

                // Flush any remaining tokens before completion
                await tokenOptimizer.complete();

                // Log optimizer performance
                const stats = tokenOptimizer.getStats();
                console.log(
                  `[POST /messages] 📊 Token Streaming Stats: ` +
                    `${stats.tokensReceived} tokens → ${stats.chunksEmitted} chunks ` +
                    `(${stats.reductionPercent}% reduction, ${stats.avgChunkSize} avg size, ` +
                    `${stats.avgLatencyMs}ms avg latency, ${stats.backpressureEvents} backpressure events)`,
                );

                // Stream completion event
                sendEvent("complete", {});
              },
              onError: async (error) => {
                // Flush on error
                await tokenOptimizer.complete();
                // Stream error event
                sendEvent("error", { message: error.message });
              },
            },
            historyWithoutCurrent, // ✅ PASS REAL CONVERSATION HISTORY
          );

        // ⏱️ TIMING: Orchestrator completed
        timings.orchestrator_execution = Date.now() - orchestratorStart;

        // Use response from Hybrid Intelligence
        if (!fullResponse) {
          fullResponse = hybridResponse.content;
        }

        // Capture metadata
        hybridMetadata = {
          mode: hybridResponse.mode,
          duration_ms: hybridResponse.duration_ms,
          cost_usd: hybridResponse.cost_usd || 0,
          cached: hybridResponse.cached || false,
          tools_used: hybridResponse.tools_used || [],
          classification_confidence:
            hybridResponse.metadata?.classification_confidence,
        };

        console.log(
          `[POST /messages] ✅ Hybrid Intelligence completed: ` +
            `mode=${hybridMetadata.mode}, ` +
            `duration=${hybridMetadata.duration_ms}ms, ` +
            `cost=$${hybridMetadata.cost_usd.toFixed(4)}, ` +
            `cached=${hybridMetadata.cached}`,
        );

        console.log(`[⏱️ POST /messages] TOTAL ROUTE TIMINGS:`, {
          initialization: `${timings.initialization}ms`,
          attachment_processing: `${timings.attachment_processing}ms`,
          message_db_operations: `${timings.message_db_operations}ms`,
          history_fetch: `${timings.history_fetch}ms`,
          orchestrator_execution: `${timings.orchestrator_execution}ms`,
          total_time: `${Date.now() - timingStart}ms`,
        });

        // Save assistant message
        const assistantMessage = await storage.createMessage({
          conversationId,
          role: "assistant",
          content: fullResponse,
          userId, // userId will be derived from conversation by storage.createMessage
        });

        // Update conversation's updatedAt to reflect latest message timestamp
        await db
          .update(conversations)
          .set({ updatedAt: new Date() })
          .where(eq(conversations.id, conversationId));

        // Emit real-time event
        if ((req as any).tenantId) {
          realtimeEvents.emitForTenant(
            "message.created",
            (req as any).tenantId,
            {
              conversationId,
              message: assistantMessage,
              hybridMetadata,
            },
          );

          // 📢 EMIT GLOBAL AI_RESPONSE_COMPLETED EVENT (for notifications)
          // Check if this is an automation notification conversation and include client info
          const conversation = await db.query.conversations.findFirst({
            where: eq(conversations.id, conversationId),
            columns: {
              type: true,
              relatedEntityName: true,
            },
          });

          const eventData: any = {
            conversationId,
            messageId: assistantMessage.id,
            responsePreview: fullResponse.substring(0, 150),
            timestamp: new Date().toISOString(),
          };

          // If this is an automation notification conversation, include client name
          if (conversation?.type === 'automation_notifications' && conversation.relatedEntityName) {
            eventData.clientName = conversation.relatedEntityName;
            eventData.isAutomationNotification = true;
          }

          realtimeEvents.emitForTenant(
            REALTIME_CHANNELS.AI_RESPONSE_COMPLETED,
            (req as any).tenantId,
            eventData,
          );
        }

        // Send completion info
        res.write(
          `data: ${JSON.stringify({
            assistantMessage,
            hybrid: hybridMetadata,
          })}\n\n`,
        );
        sendEvent("done", {});
        res.end();

        // 🎯 AUTO-GENERATE intelligent title and tags in background if this is early in conversation
        // Check if we should update metadata (first few messages)
        const messageCount = previousMessages.length + 2; // +2 for user message and assistant response just sent
        if (messageCount <= 4) {
          // Only auto-generate for first 2 exchanges
          (async () => {
            try {
              const [titleResult, tagsResult] = await Promise.all([
                generateConversationTitleAI(conversationId),
                generateConversationTags(conversationId),
              ]);

              await storage.updateConversation(conversationId, {
                title: titleResult.title,
                tags: tagsResult.tags,
              });

              console.log(
                `[AUTO-METADATA] ✅ Generated: title="${titleResult.title}", tags=${JSON.stringify(tagsResult.tags)} for conversation ${conversationId}`,
              );

              // Emit real-time update for title and tags change
              if ((req as any).tenantId) {
                realtimeEvents.emitForTenant(
                  "conversation.updated",
                  (req as any).tenantId,
                  {
                    conversationId,
                    title: titleResult.title,
                    tags: tagsResult.tags,
                  },
                );
              }
            } catch (error) {
              console.error(
                "[AUTO-METADATA] Failed to generate metadata:",
                error,
              );
              // Non-critical, conversation still works
            }
          })();
        }
      } catch (aiError: any) {
        console.error("[AI] Streaming error:", aiError);
        
        // 📢 EMIT GLOBAL AI_RESPONSE_ERROR EVENT (for notifications)
        if ((req as any).tenantId) {
          realtimeEvents.emitForTenant(
            REALTIME_CHANNELS.AI_RESPONSE_ERROR,
            (req as any).tenantId,
            {
              conversationId,
              error: aiError?.message || "Failed to generate response",
              timestamp: new Date().toISOString(),
            },
          );
        }
        
        res.write(
          `data: ${JSON.stringify({ error: "Failed to generate response" })}\n\n`,
        );
        res.end();
      }
    } catch (error: any) {
      console.error("[POST /api/conversations/:id/messages] Error:", error);
      if (!res.headersSent) {
        res
          .status(500)
          .json({ error: error.message || "Failed to send message" });
      }
    }
  },
);

// POST /api/conversations/:id/generate-title - Generate AI-powered conversation title
router.post(
  "/:id/generate-title",
  requireAuth,
  uxRateLimiter,
  async (req, res) => {
    try {
      const userId = req.session?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const conversationId = req.params.id;
      const storage = getStorage(req);

      // Verify conversation exists and belongs to tenant
      const conversation = await storage.getConversation(conversationId);
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }

      // Generate title using AI
      const { title, confidence } =
        await generateConversationTitleAI(conversationId);

      // Update conversation with new title
      const updated = await storage.updateConversation(conversationId, {
        title,
      });

      res.json({
        success: true,
        title,
        confidence,
        conversation: updated,
      });
    } catch (error: any) {
      console.error(
        "[POST /api/conversations/:id/generate-title] Error:",
        error,
      );
      res
        .status(500)
        .json({ error: error.message || "Failed to generate title" });
    }
  },
);

// PATCH /api/conversations/:id/link-entity - Link a related entity (client/lead/deal) to conversation
router.patch(
  "/:id/link-entity",
  requireAuth,
  uxRateLimiter,
  async (req, res) => {
    try {
      const userId = req.session?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const conversationId = req.params.id;
      const { entityType, entityId, entityName } = req.body;

      if (!entityType || !entityId) {
        return res
          .status(400)
          .json({ error: "entityType and entityId are required" });
      }

      const storage = getStorage(req);

      // Verify conversation exists and belongs to tenant
      const conversation = await storage.getConversation(conversationId);
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }

      // Update conversation with related entity
      const updated = await storage.updateConversation(conversationId, {
        relatedEntityType: entityType,
        relatedEntityId: entityId,
        relatedEntityName: entityName || null,
      });

      res.json({
        success: true,
        conversation: updated,
      });
    } catch (error: any) {
      console.error("[PATCH /api/conversations/:id/link-entity] Error:", error);
      res.status(500).json({ error: error.message || "Failed to link entity" });
    }
  },
);

// PATCH /api/conversations/:id/title - Update conversation title
router.patch("/:id/title", requireAuth, uxRateLimiter, async (req, res) => {
  try {
    const userId = req.session?.userId;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const conversationId = req.params.id;
    const { title } = req.body;

    if (!title || typeof title !== "string" || !title.trim()) {
      return res.status(400).json({ error: "Valid title is required" });
    }

    const storage = getStorage(req);

    // Verify conversation exists and belongs to tenant
    const conversation = await storage.getConversation(conversationId);
    if (!conversation) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    // Update conversation title
    const updated = await storage.updateConversation(conversationId, {
      title: title.trim(),
    });

    res.json({
      success: true,
      conversation: updated,
    });
  } catch (error: any) {
    console.error("[PATCH /api/conversations/:id/title] Error:", error);
    res.status(500).json({ error: error.message || "Failed to update title" });
  }
});

// PATCH /api/conversations/:id/tags - Add or remove tags
router.patch("/:id/tags", requireAuth, uxRateLimiter, async (req, res) => {
  try {
    const userId = req.session?.userId;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const conversationId = req.params.id;
    const { tags } = req.body;

    if (!Array.isArray(tags)) {
      return res.status(400).json({ error: "Tags must be an array" });
    }

    // Validate and sanitize tags
    const sanitizedTags = tags
      .filter((tag) => typeof tag === "string" && tag.trim())
      .map((tag) => tag.trim())
      .slice(0, 10); // Maximum 10 tags

    const storage = getStorage(req);

    // Verify conversation exists and belongs to tenant
    const conversation = await storage.getConversation(conversationId);
    if (!conversation) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    // Update conversation tags
    const updated = await storage.updateConversation(conversationId, {
      tags: sanitizedTags.length > 0 ? sanitizedTags : null,
    });

    res.json({
      success: true,
      conversation: updated,
    });
  } catch (error: any) {
    console.error("[PATCH /api/conversations/:id/tags] Error:", error);
    res.status(500).json({ error: error.message || "Failed to update tags" });
  }
});

// GET /api/conversations/tags/all - Get all unique tags from user's conversations
router.get("/tags/all", requireAuth, uxRateLimiter, async (req, res) => {
  try {
    const userId = req.session?.userId;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    // Get all conversations for this user
    const allConversations = await db
      .select({ tags: conversations.tags })
      .from(conversations)
      .where(eq(conversations.userId, userId));

    // Extract and deduplicate all tags
    const tagsSet = new Set<string>();
    allConversations.forEach((conv) => {
      if (Array.isArray(conv.tags)) {
        conv.tags.forEach((tag) => tagsSet.add(tag));
      }
    });

    const uniqueTags = Array.from(tagsSet).sort();

    res.json({ tags: uniqueTags });
  } catch (error: any) {
    console.error("[GET /api/conversations/tags/all] Error:", error);
    res.status(500).json({ error: error.message || "Failed to fetch tags" });
  }
});

// DELETE /api/conversations/:id - Delete a conversation
router.delete("/:id", requireAuth, uxRateLimiter, async (req, res) => {
  try {
    const userId = req.session?.userId;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const conversationId = req.params.id;
    const storage = getStorage(req);

    // Verify conversation exists and belongs to tenant
    const conversation = await storage.getConversation(conversationId);
    if (!conversation) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    // Delete all messages first
    await db
      .delete(messages)
      .where(eq(messages.conversationId, conversationId));

    // Delete the conversation
    await db
      .delete(conversations)
      .where(
        and(
          eq(conversations.id, conversationId),
          eq(conversations.userId, userId),
        ),
      );

    res.json({ success: true });
  } catch (error: any) {
    console.error("[DELETE /api/conversations/:id] Error:", error);
    res
      .status(500)
      .json({ error: error.message || "Failed to delete conversation" });
  }
});

export default router;
