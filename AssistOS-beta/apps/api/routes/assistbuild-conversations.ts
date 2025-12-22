// AssistBuild Configuration Studio - Conversation Management
// Dedicated router for AssistBuild chat system with isolated namespace

import { Router } from "express";
import { fromZodError } from "zod-validation-error";
import {
  insertAssistbuildConversationSchema,
  insertAssistbuildMessageSchema,
  assistbuildConversations,
  assistbuildMessages,
  assistbuildSnapshots,
  assistbuildWorkflowInstances,
} from "../../../shared/schema";
import { assistBuildOrchestrator } from "../../../packages/ai/agents/assistbuild";
import { requireAuth } from "../middleware/auth.middleware";
import { hardTenantGuard } from "../middleware/hard-tenant-guard";
import {
  requireConfigurator,
  requireCapability,
} from "../middleware/require-configurator";
import { chatRateLimiter } from "../middleware/rate-limit";
import { db } from "../db";
import { eq, and, desc, sql } from "drizzle-orm";
import { realtimeEvents } from "../services/event-emitter";
import { buildAssistBuildTenantContext } from "../services/assistbuild-context.service";
import { generateConversationTitle } from "../services/openai.service";
import multer from "multer";
import crypto from "crypto";
import * as xlsx from "xlsx";

const router = Router();

// ============================================================================
// FILE UPLOAD CONFIGURATION
// Configure multer for file attachments (CSV, XLSX, XLS, JSON)
// ============================================================================
const attachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { 
    fileSize: 10 * 1024 * 1024, // 10MB max
    files: 5, // Max 5 files per request
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      "text/csv",
      "text/plain",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/json",
    ];
    const allowedExtensions = /\.(csv|xlsx|xls|json|txt)$/i;

    if (
      allowedTypes.includes(file.mimetype) ||
      file.originalname.match(allowedExtensions)
    ) {
      cb(null, true);
    } else {
      cb(
        new Error(
          `Invalid file type: ${file.mimetype}. Allowed: CSV, Excel (XLSX/XLS), JSON`,
        ),
      );
    }
  },
}).array("files", 5);

// Wrapper to make file upload optional (handles both JSON and multipart)
const optionalAttachmentUpload = (req: any, res: any, next: any) => {
  const contentType = req.headers["content-type"] || "";
  if (contentType.includes("multipart/form-data")) {
    return attachmentUpload(req, res, (err: any) => {
      if (err instanceof multer.MulterError) {
        return res.status(400).json({ error: `Upload error: ${err.message}` });
      }
      if (err) {
        return res.status(400).json({ error: err.message });
      }
      next();
    });
  }
  next();
};

// Helper to parse file content
function parseFileContent(buffer: Buffer, filename: string, mimetype: string): {
  success: boolean;
  data?: any[];
  headers?: string[];
  error?: string;
} {
  try {
    const ext = filename.toLowerCase().split('.').pop() || '';
    
    // JSON files
    if (ext === 'json' || mimetype === 'application/json') {
      const content = buffer.toString('utf-8');
      const parsed = JSON.parse(content);
      
      if (Array.isArray(parsed)) {
        const headers = parsed.length > 0 ? Object.keys(parsed[0]) : [];
        return { success: true, data: parsed, headers };
      }
      
      // Handle object with array property
      for (const key of Object.keys(parsed)) {
        if (Array.isArray(parsed[key])) {
          const headers = parsed[key].length > 0 ? Object.keys(parsed[key][0]) : [];
          return { success: true, data: parsed[key], headers };
        }
      }
      
      return { success: true, data: [parsed], headers: Object.keys(parsed) };
    }
    
    // CSV/Excel files
    const workbook = xlsx.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(worksheet, { raw: false, defval: null });
    
    if (data.length === 0) {
      return { success: false, error: 'Empty file or no data' };
    }
    
    const headers = Object.keys(data[0] as object);
    return { success: true, data, headers };
  } catch (error: any) {
    return { success: false, error: `Failed to parse file: ${error.message}` };
  }
}

// ============================================================================
// MULTI-TENANT SECURITY - Apply full security stack
// AssistBuild contains sensitive configuration data - CRITICAL protection
// NOTE: requireAuth and tenantMiddleware already applied in routes.ts
// ============================================================================
// 🔓 SANDBOX EXEMPTION: Disable rate limiting for sandbox environment to enable rapid testing
router.use((req, res, next) => {
  const environment = (req as any).environment;
  if (environment === "sandbox") {
    return next(); // Skip rate limiting in sandbox
  }
  return chatRateLimiter(req, res, next);
});
router.use(hardTenantGuard);
router.use(requireConfigurator); // Owner/configurator only

// ============================================================================
// CONVERSATION MANAGEMENT
// ============================================================================

/**
 * GET /api/assistbuild/conversations
 * List all AssistBuild conversations for the user
 * UPDATED: Now user-scoped instead of tenant-scoped
 */
router.get("/conversations", async (req, res) => {
  try {
    const userId = (req as any).userId || req.session?.userId;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    console.log(
      `[AssistBuild] GET /conversations - user: ${userId}`,
    );

    const conversations = await db
      .select()
      .from(assistbuildConversations)
      .where(eq(assistbuildConversations.userId, userId))
      .orderBy(desc(assistbuildConversations.updatedAt));

    console.log(
      `[AssistBuild] Found ${conversations.length} conversations for user ${userId}`,
    );

    res.json({
      conversations,
      total: conversations.length,
    });
  } catch (error: any) {
    console.error("[AssistBuild] List conversations error:", error);
    res.status(500).json({
      error: "Failed to list conversations",
      message: error.message,
    });
  }
});

/**
 * POST /api/assistbuild/conversations
 * Create a new AssistBuild conversation
 * UPDATED: Now user-scoped instead of tenant-scoped
 */
router.post("/conversations", async (req, res) => {
  try {
    const userId = (req as any).userId || req.session?.userId;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const parsed = insertAssistbuildConversationSchema.safeParse({
      ...req.body,
      userId, // Changed from tenantId + environment
    });

    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid request",
        details: fromZodError(parsed.error).toString(),
      });
    }

    const [conversation] = await db
      .insert(assistbuildConversations)
      .values([parsed.data])
      .returning();

    // Emit real-time event (still use tenantId for event routing if available)
    const tenantId = (req as any).tenantId || req.session?.activeTenantId;
    if (tenantId) {
      realtimeEvents.emit("assistbuild:conversation:created", {
        tenantId,
        conversation,
      });
    }

    res.status(201).json({ conversation });
  } catch (error: any) {
    console.error("[AssistBuild] Create conversation error:", error);
    res.status(500).json({
      error: "Failed to create conversation",
      message: error.message,
    });
  }
});

/**
 * GET /api/assistbuild/conversations/:id
 * Get a specific conversation with messages
 * UPDATED: Now user-scoped instead of tenant-scoped
 */
router.get("/conversations/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const userId = (req as any).userId || req.session?.userId;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const [conversation] = await db
      .select()
      .from(assistbuildConversations)
      .where(
        and(
          eq(assistbuildConversations.id, id),
          eq(assistbuildConversations.userId, userId),
        ),
      )
      .limit(1);

    if (!conversation) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    // Get all messages for this conversation
    const messages = await db
      .select()
      .from(assistbuildMessages)
      .where(eq(assistbuildMessages.conversationId, id))
      .orderBy(assistbuildMessages.createdAt);

    // Get associated snapshots
    const snapshots = await db
      .select()
      .from(assistbuildSnapshots)
      .where(eq(assistbuildSnapshots.conversationId, id))
      .orderBy(desc(assistbuildSnapshots.createdAt));

    // Get workflow instance if linked
    let workflowInstance = null;
    if (conversation.workflowInstanceId) {
      const [instance] = await db
        .select()
        .from(assistbuildWorkflowInstances)
        .where(
          eq(assistbuildWorkflowInstances.id, conversation.workflowInstanceId),
        )
        .limit(1);
      workflowInstance = instance || null;
    }

    res.json({
      conversation,
      messages,
      snapshots,
      workflowInstance,
    });
  } catch (error: any) {
    console.error("[AssistBuild] Get conversation error:", error);
    res.status(500).json({
      error: "Failed to get conversation",
      message: error.message,
    });
  }
});

/**
 * GET /api/assistbuild/conversations/:id/messages
 * Get messages for a specific conversation
 * UPDATED: Now user-scoped instead of tenant-scoped
 */
router.get("/conversations/:id/messages", async (req, res) => {
  try {
    const { id } = req.params;
    const userId = (req as any).userId || req.session?.userId;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    // Verify conversation exists and belongs to user
    const [conversation] = await db
      .select()
      .from(assistbuildConversations)
      .where(
        and(
          eq(assistbuildConversations.id, id),
          eq(assistbuildConversations.userId, userId),
        ),
      )
      .limit(1);

    if (!conversation) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    // Get all messages for this conversation
    const messages = await db
      .select()
      .from(assistbuildMessages)
      .where(eq(assistbuildMessages.conversationId, id))
      .orderBy(assistbuildMessages.createdAt);

    res.json(messages);
  } catch (error: any) {
    console.error("[AssistBuild] Get messages error:", error);
    res.status(500).json({
      error: "Failed to get messages",
      message: error.message,
    });
  }
});

/**
 * PATCH /api/assistbuild/conversations/:id
 * Update conversation (title, status, metadata)
 * UPDATED: Now user-scoped instead of tenant-scoped
 */
router.patch("/conversations/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const userId = (req as any).userId || req.session?.userId;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }
    const { title, status, metadata, summaryDraft } = req.body;

    const updateData: any = { updatedAt: new Date() };
    if (title !== undefined) updateData.title = title;
    if (status !== undefined) updateData.status = status;
    if (metadata !== undefined) updateData.metadata = metadata;
    if (summaryDraft !== undefined) updateData.summaryDraft = summaryDraft;

    const [conversation] = await db
      .update(assistbuildConversations)
      .set(updateData)
      .where(
        and(
          eq(assistbuildConversations.id, id),
          eq(assistbuildConversations.userId, userId),
        ),
      )
      .returning();

    if (!conversation) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    // Emit real-time event (still use tenantId for event routing if available)
    const tenantId = (req as any).tenantId || req.session?.activeTenantId;
    if (tenantId) {
      realtimeEvents.emit("assistbuild:conversation:updated", {
        tenantId,
        conversation,
      });
    }

    res.json({ conversation });
  } catch (error: any) {
    console.error("[AssistBuild] Update conversation error:", error);
    res.status(500).json({
      error: "Failed to update conversation",
      message: error.message,
    });
  }
});

/**
 * POST /api/assistbuild/conversations/:id/generate-title
 * Generate AI-powered conversation title based on first message
 * UPDATED: Now user-scoped instead of tenant-scoped
 */
router.post("/conversations/:id/generate-title", async (req, res) => {
  try {
    const { id } = req.params;
    const userId = (req as any).userId || req.session?.userId;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    console.log(
      `[AssistBuild] POST /conversations/${id}/generate-title - user: ${userId}`,
    );

    // Verify conversation exists and belongs to user
    const [conversation] = await db
      .select()
      .from(assistbuildConversations)
      .where(
        and(
          eq(assistbuildConversations.id, id),
          eq(assistbuildConversations.userId, userId),
        ),
      )
      .limit(1);

    if (!conversation) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    // Get first user message
    const messages = await db
      .select()
      .from(assistbuildMessages)
      .where(
        and(
          eq(assistbuildMessages.conversationId, id),
          eq(assistbuildMessages.role, "user"),
        ),
      )
      .orderBy(assistbuildMessages.createdAt)
      .limit(1);

    if (messages.length === 0) {
      return res.status(400).json({
        error: "No messages found",
        message: "Cannot generate title for conversation without messages",
      });
    }

    const firstMessage = messages[0];
    const generatedTitle = await generateConversationTitle(
      firstMessage.content,
    );

    // Update conversation with generated title
    const [updatedConversation] = await db
      .update(assistbuildConversations)
      .set({
        title: generatedTitle,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(assistbuildConversations.id, id),
          eq(assistbuildConversations.userId, userId),
        ),
      )
      .returning();

    console.log(
      `[AssistBuild] Generated title for conversation ${id}: "${generatedTitle}"`,
    );

    // Emit real-time event (still use tenantId for event routing if available)
    const tenantId = (req as any).tenantId || req.session?.activeTenantId;
    if (tenantId) {
      realtimeEvents.emit("assistbuild:conversation:updated", {
        tenantId,
        conversation: updatedConversation,
      });
    }

    res.json({
      title: generatedTitle,
      conversation: updatedConversation,
    });
  } catch (error: any) {
    console.error(
      `[AssistBuild] Error generating title for conversation:`,
      error,
    );
    res.status(500).json({
      error: "Failed to generate title",
      message: error.message,
    });
  }
});

/**
 * DELETE /api/assistbuild/conversations/cleanup
 * Remove empty conversations (no messages) older than specified age
 * ⚠️ IMPORTANT: Must be BEFORE /conversations/:id to avoid route collision
 * UPDATED: Now user-scoped instead of tenant-scoped
 * Query params:
 *   - minAgeMinutes: Minimum age in minutes (default: 60)
 */
router.delete("/conversations/cleanup", async (req, res) => {
  try {
    const userId = (req as any).userId || req.session?.userId;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }
    const minAgeMinutes = parseInt(req.query.minAgeMinutes as string) || 60;

    console.log(
      `[AssistBuild] Cleanup starting - user: ${userId}, minAge: ${minAgeMinutes}min`,
    );

    // Calculate cutoff time
    const cutoffTime = new Date(Date.now() - minAgeMinutes * 60 * 1000);

    // Get all conversations for this user older than cutoff
    const conversations = await db
      .select()
      .from(assistbuildConversations)
      .where(
        and(
          eq(assistbuildConversations.userId, userId),
          sql`${assistbuildConversations.createdAt} < ${cutoffTime}`,
        ),
      );

    console.log(
      `[AssistBuild] Found ${conversations.length} conversations older than ${minAgeMinutes} minutes`,
    );

    // Check each conversation for messages and delete if empty
    // BUT: Protect conversations created in the last 2 minutes to avoid race conditions
    const protectionCutoff = new Date(Date.now() - 2 * 60 * 1000); // 2 minutes ago
    let deletedCount = 0;
    const deletedIds: string[] = [];

    for (const conversation of conversations) {
      // Skip conversations created less than 2 minutes ago (race condition protection)
      if (new Date(conversation.createdAt) > protectionCutoff) {
        console.log(
          `[AssistBuild] Skipping recently created conversation: ${conversation.id} (created ${conversation.createdAt})`,
        );
        continue;
      }

      const messages = await db
        .select()
        .from(assistbuildMessages)
        .where(eq(assistbuildMessages.conversationId, conversation.id))
        .limit(1);

      if (messages.length === 0) {
        // Delete empty conversation
        await db
          .delete(assistbuildConversations)
          .where(eq(assistbuildConversations.id, conversation.id));

        deletedIds.push(conversation.id);
        deletedCount++;

        console.log(
          `[AssistBuild] Deleted empty conversation: ${conversation.id} (created: ${conversation.createdAt})`,
        );
      }
    }

    console.log(
      `[AssistBuild] Cleanup complete - deleted ${deletedCount} empty conversations`,
    );

    res.json({
      success: true,
      deletedCount,
      deletedIds,
      checkedCount: conversations.length,
      minAgeMinutes,
    });
  } catch (error: any) {
    console.error("[AssistBuild] Cleanup error:", error);
    res.status(500).json({
      error: "Failed to cleanup conversations",
      message: error.message,
    });
  }
});

/**
 * DELETE /api/assistbuild/conversations/:id
 * Delete a conversation (cascade deletes messages)
 * UPDATED: Now user-scoped instead of tenant-scoped
 */
router.delete("/conversations/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const userId = (req as any).userId || req.session?.userId;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const [conversation] = await db
      .delete(assistbuildConversations)
      .where(
        and(
          eq(assistbuildConversations.id, id),
          eq(assistbuildConversations.userId, userId),
        ),
      )
      .returning();

    if (!conversation) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    // Emit real-time event (still use tenantId for event routing if available)
    const tenantId = (req as any).tenantId || req.session?.activeTenantId;
    if (tenantId) {
      realtimeEvents.emit("assistbuild:conversation:deleted", {
        tenantId,
        conversationId: id,
      });
    }

    res.json({
      success: true,
      message: "Conversation deleted successfully",
    });
  } catch (error: any) {
    console.error("[AssistBuild] Delete conversation error:", error);
    res.status(500).json({
      error: "Failed to delete conversation",
      message: error.message,
    });
  }
});

// ============================================================================
// MESSAGE MANAGEMENT
// ============================================================================

/**
 * POST /api/assistbuild/conversations/:id/messages
 * Send a message in AssistBuild chat (with streaming response)
 * Supports file attachments: CSV, XLSX, XLS, JSON
 * 🔒 SECURITY: Explicitly require auth + configurator role (belt-and-suspenders)
 */
router.post(
  "/conversations/:id/messages",
  requireAuth,
  requireConfigurator,
  optionalAttachmentUpload,
  async (req, res) => {
    try {
      const { id: conversationId } = req.params;
      const userId = (req as any).userId || req.session?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      console.log(
        `[AssistBuild] POST /conversations/${conversationId}/messages - user: ${userId}`,
      );

      // Verify conversation exists and belongs to user
      const [conversation] = await db
        .select()
        .from(assistbuildConversations)
        .where(
          and(
            eq(assistbuildConversations.id, conversationId),
            eq(assistbuildConversations.userId, userId),
          ),
        )
        .limit(1);

      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }

      // Handle both JSON and multipart/form-data
      const content = req.body.content || req.body.message || '';
      const existingAttachments = req.body.attachments ? JSON.parse(req.body.attachments || '[]') : [];

      if (!content || !content.trim()) {
        return res.status(400).json({ error: "Message content is required" });
      }

      // Process uploaded files if any
      const uploadedFiles = (req as any).files as Express.Multer.File[] || [];
      const processedAttachments: Array<{
        id: string;
        name: string;
        type: string;
        url: string;
        size: number;
        parsed?: boolean;
        rowCount?: number;
        columns?: string[];
        preview?: any[];
        base64Content?: string;
      }> = [...existingAttachments];

      // Build enriched message content with file data for AI
      let enrichedContent = content.trim();
      const fileDataForAI: string[] = [];

      for (const file of uploadedFiles) {
        const attachmentId = crypto.randomUUID();
        console.log(`[AssistBuild] Processing attachment: ${file.originalname} (${file.size} bytes, ${file.mimetype})`);

        // Parse file content
        const parseResult = parseFileContent(file.buffer, file.originalname, file.mimetype);
        
        const attachment: any = {
          id: attachmentId,
          name: file.originalname,
          type: file.mimetype,
          url: `data:${file.mimetype};base64,${file.buffer.toString('base64').substring(0, 100)}...`, // Truncated for storage
          size: file.size,
          parsed: parseResult.success,
          base64Content: file.buffer.toString('base64'), // Full content for AI tool
        };

        if (parseResult.success && parseResult.data) {
          attachment.rowCount = parseResult.data.length;
          attachment.columns = parseResult.headers;
          attachment.preview = parseResult.data.slice(0, 5); // First 5 rows as preview

          // Build file context for AI
          const columnList = parseResult.headers?.join(', ') || 'unknown';
          const sampleData = JSON.stringify(parseResult.data.slice(0, 3), null, 2);
          
          fileDataForAI.push(`
📎 **Attached File: ${file.originalname}**
- **Type:** ${file.mimetype}
- **Size:** ${(file.size / 1024).toFixed(1)} KB
- **Rows:** ${parseResult.data.length}
- **Columns:** ${columnList}

**Sample Data (first 3 rows):**
\`\`\`json
${sampleData}
\`\`\`

To use this file data, call the \`parse_attached_file\` tool with:
- fileContent: "${attachmentId}" (use attachment ID)
- fileName: "${file.originalname}"
- mimeType: "${file.mimetype}"
`);
        } else {
          fileDataForAI.push(`
📎 **Attached File: ${file.originalname}**
- **Type:** ${file.mimetype}
- **Size:** ${(file.size / 1024).toFixed(1)} KB
- **Status:** ⚠️ Could not parse (${parseResult.error})
`);
        }

        processedAttachments.push(attachment);
      }

      // Enrich content with file information if files were attached
      if (fileDataForAI.length > 0) {
        enrichedContent = `${content.trim()}

---
**📂 FILE ATTACHMENTS (${fileDataForAI.length} file${fileDataForAI.length > 1 ? 's' : ''}):**
${fileDataForAI.join('\n')}
---

**IMPORTANT:** The user has attached files. Use the \`parse_attached_file\` tool to analyze the data structure and use it for configuration tasks like creating custom tables, importing data, or configuring entities.`;
      }

      // Save user message (userId required)
      const [userMessage] = await db
        .insert(assistbuildMessages)
        .values({
          conversationId,
          userId, // Explicitly set userId
          authorType: "user",
          role: "user",
          content: content.trim(), // Store original content
          attachments: processedAttachments,
        })
        .returning();

      // Update conversation timestamp (title will be generated after AI responds)
      await db
        .update(assistbuildConversations)
        .set({ updatedAt: new Date() })
        .where(eq(assistbuildConversations.id, conversationId));

      // Emit real-time event for new user message (still use tenantId for event routing if available)
      const tenantId = (req as any).tenantId || req.session?.activeTenantId;
      if (tenantId) {
        realtimeEvents.emit("assistbuild:message:created", {
          tenantId,
          conversationId,
          message: userMessage,
        });
      }

      // Set up SSE for streaming AI response
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      let assistantContent = "";
      let assistantMessage: any = null;

      try {
        console.log(`[AssistBuild] 🚀 Starting orchestrator for conversation ${conversationId}`);
        console.log(`[AssistBuild] 📎 Attachments: ${processedAttachments.length} files`);
        
        // Get conversation history
        const messages = await db
          .select()
          .from(assistbuildMessages)
          .where(eq(assistbuildMessages.conversationId, conversationId))
          .orderBy(assistbuildMessages.createdAt);

        const conversationHistory = messages.slice(-10).map((msg) => ({
          role: msg.role as "user" | "assistant",
          content: msg.content,
        }));

        // Build complete tenant context for orchestrator
        // Note: tenantId and environment still needed for orchestrator context
        const tenantIdForContext = (req as any).tenantId || req.session?.activeTenantId;
        const environment = (req as any).environment || "sandbox";
        const tenantContext = await buildAssistBuildTenantContext(
          tenantIdForContext || "", // Orchestrator may need tenant context
          userId,
          environment,
        );

        // Add file data to context metadata for the AI
        (tenantContext as any).attachments = processedAttachments.map(att => ({
          id: att.id,
          name: att.name,
          type: att.type,
          size: att.size,
          rowCount: att.rowCount,
          columns: att.columns,
          preview: att.preview,
          base64Content: att.base64Content,
        }));

        console.log(`[AssistBuild] 🔑 OpenAI API Key configured: ${process.env.OPENAI_API_KEY ? 'YES' : 'NO'}`);
        console.log(`[AssistBuild] 📨 Calling orchestrator.processMessage...`);

        // Stream response from AssistBuild orchestrator (use enriched content with file info)
        const response = await assistBuildOrchestrator.processMessage(
          enrichedContent,
          tenantContext,
          (progress) => {
            // Send progress updates via SSE
            res.write(
              `data: ${JSON.stringify({ type: "progress", content: progress })}\n\n`,
            );
            // ✅ CRITICAL: Force flush to ensure chunks are sent immediately
            if (typeof (res as any).flush === 'function') {
              (res as any).flush();
            }
          },
          conversationHistory,
          (chunk) => {
            // Stream text chunks via SSE
            assistantContent += chunk;
            res.write(
              `data: ${JSON.stringify({ type: "chunk", content: chunk })}\n\n`,
            );
            // ✅ CRITICAL: Force flush to ensure chunks are sent immediately
            if (typeof (res as any).flush === 'function') {
              (res as any).flush();
            }
          },
        );

        console.log(`[AssistBuild] ✅ Orchestrator completed. Response length: ${response?.length || 0}, streamed length: ${assistantContent.length}`);

        // Use final response if streaming didn't capture everything
        if (!assistantContent && response) {
          assistantContent = response;
        }

        // ⚠️ CRITICAL: If no content received, create error message
        if (!assistantContent || assistantContent.trim().length === 0) {
          console.error('[AssistBuild] ❌ CRITICAL: Orchestrator returned empty response! This should never happen.');
          assistantContent = `## ❌ Communication Error

Sorry, an error occurred while processing your order. The AI ​​system was unable to generate a response.

**Possible causes:**
- ⚠️ Connectivity issue with OpenAI API
- ⚠️ Timeout during streaming (SSE connection lost)
- ⚠️ Temporary API rate limit

**How to solve:**
1. **Try again** - Send the same message again
2. **Simplify the order** - Make smaller, more specific requests
3. **Wait 30 seconds** - There may be temporary rate limiting

If the problem persists, contact technical support with this conversation ID: \`${conversationId}\``;
        }

        // Save assistant message (even if it's an error message)
        // userId will be derived from conversation
        [assistantMessage] = await db
          .insert(assistbuildMessages)
          .values({
            conversationId,
            userId, // Explicitly set userId
            authorType: "assistant",
            role: "assistant",
            content: assistantContent,
          })
          .returning();

        console.log(`[AssistBuild] 💾 Assistant message saved: ${assistantMessage.id}`);

        // Send completion event
        res.write(
          `data: ${JSON.stringify({ type: "done", message: assistantMessage })}\n\n`,
        );
        res.end();

        // Emit real-time event for assistant message (still use tenantId for event routing if available)
        const tenantIdForEvent = (req as any).tenantId || req.session?.activeTenantId;
        if (tenantIdForEvent) {
          realtimeEvents.emit("assistbuild:message:created", {
            tenantId: tenantIdForEvent,
            conversationId,
            message: assistantMessage,
          });
        }
      } catch (streamError: any) {
        console.error("[AssistBuild] ❌ Streaming error:", streamError);
        console.error("[AssistBuild] Stack trace:", streamError.stack);
        
        // Create error message for user
        const errorMessage = `## ❌ Technical Error

An unexpected error occurred while processing your order.

**Error details:**
\`\`\`
${streamError.message}
\`\`\`

**How to solve:**
1. **Try again** - This error may be temporary
2. **Reload the page** - Sometimes resolves connection issues
3. **Contact support** - If it persists, send this ID: \`${conversationId}\`

**Technical information:**
- Type: ${streamError.name || 'UnknownError'}
- Timestamp: ${new Date().toISOString()}`;


        try {
          // Try to save error message to database
          // userId is in scope from the outer try block
          [assistantMessage] = await db
            .insert(assistbuildMessages)
            .values({
              conversationId,
              userId, // userId is in scope from line 568
              authorType: "assistant",
              role: "assistant",
              content: errorMessage,
            })
            .returning();

          console.log(`[AssistBuild] 💾 Error message saved to database: ${assistantMessage.id}`);

          // Send error message via SSE
          res.write(
            `data: ${JSON.stringify({ type: "done", message: assistantMessage })}\n\n`,
          );
        } catch (dbError: any) {
          console.error("[AssistBuild] ❌ Failed to save error message to database:", dbError);
          // Send error via SSE even if DB save failed
          res.write(
            `data: ${JSON.stringify({ type: "error", error: streamError.message })}\n\n`,
          );
        }
        
        res.end();

        // Emit event if we managed to save the message (still use tenantId for event routing if available)
        if (assistantMessage) {
          const tenantIdForEvent = (req as any).tenantId || req.session?.activeTenantId;
          if (tenantIdForEvent) {
            realtimeEvents.emit("assistbuild:message:created", {
              tenantId: tenantIdForEvent,
              conversationId,
              message: assistantMessage,
            });
          }
        }
      }
    } catch (error: any) {
      console.error("[AssistBuild] Send message error:", error);
      if (!res.headersSent) {
        res.status(500).json({
          error: "Failed to send message",
          message: error.message,
        });
      }
    }
  },
);

/**
 * GET /api/assistbuild/conversations/:id/snapshots
 * Get configuration snapshots for a conversation
 * UPDATED: Now user-scoped (snapshots are linked to conversation, which is user-scoped)
 */
router.get("/conversations/:id/snapshots", async (req, res) => {
  try {
    const { id: conversationId } = req.params;
    const userId = (req as any).userId || req.session?.userId;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    // Verify conversation belongs to user
    const [conversation] = await db
      .select()
      .from(assistbuildConversations)
      .where(
        and(
          eq(assistbuildConversations.id, conversationId),
          eq(assistbuildConversations.userId, userId),
        ),
      )
      .limit(1);

    if (!conversation) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    const snapshots = await db
      .select()
      .from(assistbuildSnapshots)
      .where(eq(assistbuildSnapshots.conversationId, conversationId))
      .orderBy(desc(assistbuildSnapshots.createdAt));

    res.json({ snapshots });
  } catch (error: any) {
    console.error("[AssistBuild] Get snapshots error:", error);
    res.status(500).json({
      error: "Failed to get snapshots",
      message: error.message,
    });
  }
});

export default router;
