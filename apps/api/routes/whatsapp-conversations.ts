/**
 * WhatsApp Conversations Routes (Authenticated)
 * Handles conversation and message management
 */

import { Router } from "express";
import { hardTenantGuard } from "../middleware/hard-tenant-guard";
import { db } from "../db";
import {
  whatsappAccounts,
  whatsappMessages,
  whatsappContacts,
  whatsappConversations,
} from "../../../shared/schema";
import { eq, and, desc, sql, or } from "drizzle-orm";
import logger from "../logger";
import { whatsappAPIService } from "../services/whatsapp-api.service";
import axios from 'axios';
import { normalizeWaConversationId } from "./whatsapp";

const router = Router();

// ============================================================================
// MULTI-TENANT SECURITY - Apply hardTenantGuard to ALL routes
// WhatsApp conversations contain private messages - CRITICAL protection
// ============================================================================
router.use(hardTenantGuard);

/**
 * GET /api/whatsapp/accounts
 * List WhatsApp accounts for the current tenant
 */
router.get("/accounts", async (req: any, res) => {
  if (!req.user || !req.user.activeTenantId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    logger.info(
      { tenantId: req.user.activeTenantId },
      "[WhatsApp Accounts] Listing accounts",
    );

    const accounts = await db.query.whatsappAccounts.findMany({
      where: eq(whatsappAccounts.tenantId, req.user.activeTenantId),
      orderBy: [desc(whatsappAccounts.createdAt)],
      columns: {
        id: true,
        tenantId: true,
        userId: true,
        phoneNumber: true,
        phoneNumberId: true,
        businessAccountId: true,
        displayName: true,
        connectionType: true, // CRITICAL: Include connectionType for web-connector filtering
        isActive: true,
        isPrimary: true,
        verificationStatus: true,
        qualityRating: true,
        messagingLimit: true,
        lastUsedAt: true,
        lastSyncAt: true,
        createdAt: true,
        updatedAt: true,
        // SECURITY: Explicitly exclude sensitive fields
        accessToken: false,
        webhookVerifyToken: false,
        webhookUrl: false,
      },
    });

    logger.info(
      { count: accounts.length },
      "[WhatsApp Accounts] Found accounts",
    );

    res.json({ accounts });
  } catch (error) {
    logger.error({ error }, "[WhatsApp Accounts] List error");
    res.status(500).json({ error: "Failed to list WhatsApp accounts" });
  }
});

/**
 * GET /api/whatsapp/conversations
 * List WhatsApp conversations for the current tenant
 */
router.get("/conversations", async (req: any, res) => {
  if (!req.user || !req.user.activeTenantId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = (page - 1) * limit;
    const status = req.query.status as string; // 'open', 'closed', or undefined for all

    logger.info(
      {
        tenantId: req.user.activeTenantId,
        page,
        limit,
        status,
      },
      "[WhatsApp Conversations] Listing conversations",
    );

    // Build where clause
    let whereClause = eq(
      whatsappConversations.tenantId,
      req.user.activeTenantId,
    );
    if (status) {
      whereClause = and(
        whereClause,
        eq(whatsappConversations.status, status),
      ) as any;
    }

    // Fetch ALL conversations first (without limit for sorting)
    const allConversations = await db.query.whatsappConversations.findMany({
      where: whereClause,
      with: {
        contact: {
          columns: {
            id: true,
            phoneNumber: true,
            waId: true,
            name: true,
            profilePicUrl: true,
            optInStatus: true,
            tags: true,
            language: true,
            messageCount: true,
            lastMessageAt: true,
            lastMessageDirection: true,
          },
        },
        account: {
          columns: {
            id: true,
            phoneNumber: true,
            displayName: true,
            connectionType: true, // Add connectionType to know if it's web-connector or cloud-api
          },
        },
      },
    });

    // Sort by most recent activity (either lastInboundMessageAt or lastOutboundMessageAt)
    allConversations.sort((a, b) => {
      const aTime = Math.max(
        a.lastInboundMessageAt?.getTime() || 0,
        a.lastOutboundMessageAt?.getTime() || 0,
        a.updatedAt?.getTime() || 0
      );
      const bTime = Math.max(
        b.lastInboundMessageAt?.getTime() || 0,
        b.lastOutboundMessageAt?.getTime() || 0,
        b.updatedAt?.getTime() || 0
      );
      return bTime - aTime; // Most recent first
    });

    // Apply pagination AFTER sorting
    const conversations = allConversations.slice(offset, offset + limit);

    // Fetch last messages for all conversations in batches to avoid connection pool exhaustion
    const batchSize = 10; // Process 10 conversations at a time
    const conversationsWithLastMessage = [];
    
    for (let i = 0; i < conversations.length; i += batchSize) {
      const batch = conversations.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(async (conv) => {
          // Only fetch last message if waConversationId exists
          const lastMessage = conv.waConversationId 
            ? await db.query.whatsappMessages.findFirst({
                where: eq(whatsappMessages.waConversationId, conv.waConversationId),
                orderBy: [desc(whatsappMessages.timestamp)],
                columns: {
                  id: true,
                  text: true,
                  type: true,
                  direction: true,
                  timestamp: true,
                },
              })
            : null;

          return {
            ...conv,
            lastMessage,
          };
        })
      );
      conversationsWithLastMessage.push(...batchResults);
    }

    // Use the sorted conversations count for total
    const totalCount = allConversations.length;

    logger.info(
      { count: conversationsWithLastMessage.length, total: totalCount },
      "[WhatsApp Conversations] Found conversations",
    );

    res.json({
      conversations: conversationsWithLastMessage,
      pagination: {
        page,
        limit,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
    });
  } catch (error) {
    console.error("-----", error);
    logger.error({ error }, "[WhatsApp Conversations] List error");
    res.status(500).json({ error: "Failed to list conversations" });
  }
});

/**
 * GET /api/whatsapp/conversations/:id/messages
 * Get messages for a specific conversation
 */
router.get("/conversations/:id/messages", async (req: any, res) => {
  if (!req.user || !req.user.activeTenantId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const conversationId = req.params.id;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 100;
    const offset = (page - 1) * limit;

    logger.info(
      {
        tenantId: req.user.activeTenantId,
        conversationId,
        page,
        limit,
      },
      "[WhatsApp Messages] Listing messages for conversation",
    );

    // Verify conversation belongs to tenant
    const conversation = await db.query.whatsappConversations.findFirst({
      where: and(
        eq(whatsappConversations.id, conversationId),
        eq(whatsappConversations.tenantId, req.user.activeTenantId),
      ),
    });

    if (!conversation) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    const messages = await db.query.whatsappMessages.findMany({
      where: and(
        eq(whatsappMessages.tenantId, req.user.activeTenantId),
        eq(whatsappMessages.waConversationId, conversation.waConversationId!),
      ),
      orderBy: [desc(whatsappMessages.timestamp)],
      limit,
      offset,
    });

    const total = await db
      .select({ count: sql<number>`count(*)` })
      .from(whatsappMessages)
      .where(
        and(
          eq(whatsappMessages.tenantId, req.user.activeTenantId),
          eq(whatsappMessages.waConversationId, conversation.waConversationId!),
        ),
      );

    const totalCount = Number(total[0]?.count || 0);

    logger.info(
      { count: messages.length, total: totalCount },
      "[WhatsApp Messages] Found messages",
    );

    res.json({
      messages,
      pagination: {
        page,
        limit,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
    });
  } catch (error) {
    logger.error({ error }, "[WhatsApp Messages] List error");
    res.status(500).json({ error: "Failed to list messages" });
  }
});

/**
 * GET /api/whatsapp/contacts
 * List WhatsApp contacts for the current tenant
 */
router.get("/contacts", async (req: any, res) => {
  if (!req.user || !req.user.activeTenantId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = (page - 1) * limit;
    const search = req.query.search as string;

    logger.info(
      {
        tenantId: req.user.activeTenantId,
        page,
        limit,
        search,
      },
      "[WhatsApp Contacts] Listing contacts",
    );

    let whereClause = eq(whatsappContacts.tenantId, req.user.activeTenantId);

    // Add search filter if provided
    if (search) {
      whereClause = and(
        whereClause,
        or(
          sql`${whatsappContacts.name} ILIKE ${`%${search}%`}`,
          sql`${whatsappContacts.phoneNumber} LIKE ${`%${search}%`}`,
        ),
      ) as any;
    }

    const contacts = await db.query.whatsappContacts.findMany({
      where: whereClause,
      orderBy: [desc(whatsappContacts.lastMessageAt)],
      limit,
      offset,
      with: {
        account: {
          columns: {
            id: true,
            phoneNumber: true,
            displayName: true,
          },
        },
      },
    });

    const total = await db
      .select({ count: sql<number>`count(*)` })
      .from(whatsappContacts)
      .where(whereClause);

    const totalCount = Number(total[0]?.count || 0);

    logger.info(
      { count: contacts.length, total: totalCount },
      "[WhatsApp Contacts] Found contacts",
    );

    res.json({
      contacts,
      pagination: {
        page,
        limit,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
    });
  } catch (error) {
    logger.error({ error }, "[WhatsApp Contacts] List error");
    res.status(500).json({ error: "Failed to list contacts" });
  }
});

/**
 * POST /api/whatsapp/messages/send
 * Send a WhatsApp message (supports both Meta API and WhatsApp Web)
 */
router.post("/messages/send", async (req: any, res) => {
  if (!req.user || !req.user.activeTenantId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const {
      accountId,
      to,
      type,
      text,
      templateName,
      templateLanguage,
      mediaId,
      mediaUrl,
      caption,
      latitude,
      longitude,
      locationName,
      locationAddress,
    } = req.body;

    logger.info(
      {
        tenantId: req.user.activeTenantId,
        accountId,
        to,
        type,
      },
      "[WhatsApp Send] Sending message",
    );

    // Get account
    const account = await db.query.whatsappAccounts.findFirst({
      where: and(
        eq(whatsappAccounts.id, accountId),
        eq(whatsappAccounts.tenantId, req.user.activeTenantId),
      ),
    });

    if (!account) {
      return res.status(404).json({ error: "WhatsApp account not found" });
    }

    let result;
    const connectionType = account.connectionType || 'meta-api';

    // Route message based on connection type
    if (connectionType === 'web-connector') {
      // Send via WhatsApp Web
      logger.info({ accountId }, "[WhatsApp Send] Routing to WhatsApp Web");
      
      try {
        const workerUrl = process.env.WORKER_URL || 'http://localhost:3001';
        
        switch (type) {
          case "text":
            const textResponse = await fetch(`${workerUrl}/whatsapp-web/send-text`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ accountId, to, text }),
            });
            
            if (!textResponse.ok) {
              throw new Error(`Worker error: ${await textResponse.text()}`);
            }
            
            const textData = await textResponse.json();
            result = {
              messages: [{ id: textData.messageId }],
              contacts: [{ wa_id: to }],
            };
            break;

          case "image":
          case "video":
          case "audio":
          case "document":
            const mediaResponse = await fetch(`${workerUrl}/whatsapp-web/send-media`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ accountId, to, mediaUrl, caption }),
            });
            
            if (!mediaResponse.ok) {
              throw new Error(`Worker error: ${await mediaResponse.text()}`);
            }
            
            const mediaData = await mediaResponse.json();
            result = {
              messages: [{ id: mediaData.messageId }],
              contacts: [{ wa_id: to }],
            };
            break;

          case "location":
            const locationResponse = await fetch(`${workerUrl}/whatsapp-web/send-location`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ accountId, to, latitude, longitude, name: locationName, address: locationAddress }),
            });
            
            if (!locationResponse.ok) {
              throw new Error(`Worker error: ${await locationResponse.text()}`);
            }
            
            const locationData = await locationResponse.json();
            result = {
              messages: [{ id: locationData.messageId }],
              contacts: [{ wa_id: to }],
            };
            break;

          case "template":
            return res.status(400).json({ error: "Templates not supported on WhatsApp Web" });

          default:
            return res.status(400).json({ error: "Invalid message type" });
        }
      } catch (error: any) {
        logger.error({ error }, "[WhatsApp Send] WhatsApp Web error");
        throw new Error(`Failed to send via WhatsApp Web: ${error.message || 'Unknown error'}`);
      }
    } else {
      // Send via Meta API (existing logic)
      logger.info({ accountId }, "[WhatsApp Send] Routing to Meta API");
      
      // Validate Cloud API credentials
      if (!account.phoneNumberId || !account.accessToken) {
        throw new Error('WhatsApp Cloud API credentials not configured for this account');
      }
      
      switch (type) {
        case "text":
          result = await whatsappAPIService.sendTextMessage({
            phoneNumberId: account.phoneNumberId!,
            accessToken: account.accessToken!,
            to,
            text,
          });
          break;

        case "template":
          result = await whatsappAPIService.sendTemplateMessage({
            phoneNumberId: account.phoneNumberId!,
            accessToken: account.accessToken!,
            to,
            templateName,
            templateLanguage: templateLanguage || "pt_BR",
          });
          break;

        case "image":
        case "video":
        case "audio":
        case "document":
          result = await whatsappAPIService.sendMediaMessage({
            phoneNumberId: account.phoneNumberId!,
            accessToken: account.accessToken!,
            to,
            type,
            mediaId,
            mediaUrl,
            caption,
          });
          break;

        case "location":
          result = await whatsappAPIService.sendLocationMessage({
            phoneNumberId: account.phoneNumberId!,
            accessToken: account.accessToken!,
            to,
            latitude,
            longitude,
            name: locationName,
            address: locationAddress,
          });
          break;

        default:
          return res.status(400).json({ error: "Invalid message type" });
      }
    }

    // Find or create contact
    let contact = await db.query.whatsappContacts.findFirst({
      where: and(
        eq(whatsappContacts.tenantId, req.user.activeTenantId),
        eq(whatsappContacts.phoneNumber, to),
      ),
    });

    if (!contact) {
      const [newContact] = await db
        .insert(whatsappContacts)
        .values({
          tenantId: req.user.activeTenantId,
          accountId: account.id,
          phoneNumber: to,
          waId: result.contacts[0].wa_id,
          optInStatus: "unknown",
          messageCount: 0,
        })
        .returning();

      contact = newContact;
    }

    // Generate waConversationId (normalized to prevent fragmentation)
    const waConversationId = normalizeWaConversationId(account.phoneNumber, to);

    // Find or create conversation
    let conversation = await db.query.whatsappConversations.findFirst({
      where: and(
        eq(whatsappConversations.tenantId, req.user.activeTenantId),
        eq(whatsappConversations.accountId, account.id),
        eq(whatsappConversations.contactId, contact.id)
      ),
    });

    const now = new Date();
    const conversationWindowExpiry = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24h window

    if (!conversation) {
      // Create new conversation
      const [newConversation] = await db.insert(whatsappConversations).values({
        tenantId: req.user.activeTenantId,
        accountId: account.id,
        contactId: contact.id,
        waConversationId,
        status: "open",
        lastOutboundMessageAt: now,
        conversationWindowExpiresAt: conversationWindowExpiry,
        messageCount: 0,
        unreadCount: 0,
      }).returning();
      
      conversation = newConversation;
      logger.info({ conversationId: conversation.id }, "[WhatsApp Send] Created new conversation");
    } else {
      // Update existing conversation (outbound does NOT increment unreadCount)
      await db.update(whatsappConversations)
        .set({
          lastOutboundMessageAt: now,
          conversationWindowExpiresAt: conversationWindowExpiry,
          messageCount: sql`${whatsappConversations.messageCount} + 1`,
          status: "open", // Reopen if closed
          updatedAt: now,
        })
        .where(eq(whatsappConversations.id, conversation.id));
    }

    // Extract consistent message ID (without serialization prefix for WhatsApp Web)
    let messageId = result.messages[0].id;
    if (connectionType === 'web-connector' && messageId.includes('_')) {
      // For WhatsApp Web, extract just the ID part (last segment after underscores)
      // Format: true_919004375151@c.us_3EB08398FF477C3970D483 → 3EB08398FF477C3970D483
      const parts = messageId.split('_');
      messageId = parts[parts.length - 1];
      console.log(`[WhatsApp Send] Normalized WhatsApp Web message ID: ${result.messages[0].id} → ${messageId}`);
    }

    // Save sent message to database with waConversationId
    await db.insert(whatsappMessages).values({
      tenantId: req.user.activeTenantId,
      accountId: account.id,
      waMessageId: messageId,
      waConversationId: conversation.waConversationId!,
      direction: "outbound",
      fromNumber: account.phoneNumber,
      toNumber: to,
      contactId: contact.id,
      type,
      text: type === "text" ? text : null,
      caption,
      mediaId,
      mediaUrl,
      latitude:
        latitude !== undefined && latitude !== null ? String(latitude) : null,
      longitude:
        longitude !== undefined && longitude !== null
          ? String(longitude)
          : null,
      locationName,
      locationAddress,
      templateName,
      templateLanguage,
      status: "sent",
      timestamp: new Date(),
      processingStatus: "completed",
    });

    logger.info(
      { messageId: result.messages[0].id },
      "[WhatsApp Send] Message sent successfully",
    );

    res.json({
      success: true,
      messageId: result.messages[0].id,
      waId: result.contacts[0].wa_id,
    });
  } catch (error) {
    logger.error({ error }, "[WhatsApp Send] Error sending message");
    res.status(500).json({ error: "Failed to send message" });
  }
});

/**
 * PATCH /api/whatsapp/messages/:id/read
 * Mark a message as read
 */
router.patch("/messages/:id/read", async (req: any, res) => {
  if (!req.user || !req.user.activeTenantId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const messageId = req.params.id;

    logger.info(
      {
        tenantId: req.user.activeTenantId,
        messageId,
      },
      "[WhatsApp Read] Marking message as read",
    );

    // Get message
    const message = await db.query.whatsappMessages.findFirst({
      where: and(
        eq(whatsappMessages.id, messageId),
        eq(whatsappMessages.tenantId, req.user.activeTenantId),
      ),
    });

    if (!message) {
      return res.status(404).json({ error: "Message not found" });
    }

    // Only mark inbound messages as read
    if (message.direction !== "inbound") {
      return res
        .status(400)
        .json({ error: "Can only mark inbound messages as read" });
    }

    // Get account
    const account = await db.query.whatsappAccounts.findFirst({
      where: eq(whatsappAccounts.id, message.accountId),
    });

    if (!account) {
      return res.status(404).json({ error: "WhatsApp account not found" });
    }

    const connectionType = account.connectionType || 'meta-api';

    // Mark as read based on connection type
    if (connectionType === 'web-connector') {
      // Send read acknowledgment via WhatsApp Web
      logger.info({ accountId: account.id, messageId }, "[WhatsApp Read] Marking as read via WhatsApp Web");
      
      try {
        const workerUrl = process.env.WORKER_URL || 'http://localhost:3001';
        const response = await fetch(`${workerUrl}/whatsapp-web/mark-read`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            accountId: account.id, 
            waMessageId: message.waMessageId 
          }),
        });
        
        if (!response.ok) {
          throw new Error(`Worker error: ${await response.text()}`);
        }
      } catch (error: any) {
        logger.error({ error }, "[WhatsApp Read] Failed to mark as read in WhatsApp Web");
        // Continue to update database even if WhatsApp Web fails
      }
    } else {
      // Mark as read in WhatsApp Cloud API
      if (!account.phoneNumberId || !account.accessToken) {
        throw new Error('WhatsApp Cloud API credentials not configured');
      }
      
      await whatsappAPIService.markAsRead({
        phoneNumberId: account.phoneNumberId!,
        accessToken: account.accessToken!,
        messageId: message.waMessageId!,
      });
    }

    // Update in database
    await db
      .update(whatsappMessages)
      .set({
        isRead: true,
        updatedAt: new Date(),
      })
      .where(eq(whatsappMessages.id, messageId));

    // Update conversation unread count
    if (message.waConversationId) {
      await db
        .update(whatsappConversations)
        .set({
          unreadCount: sql`GREATEST(${whatsappConversations.unreadCount} - 1, 0)`,
        })
        .where(eq(whatsappConversations.waConversationId, message.waConversationId));
    }

    logger.info({ messageId }, "[WhatsApp Read] Message marked as read");

    res.json({ success: true });
  } catch (error) {
    logger.error({ error }, "[WhatsApp Read] Error marking message as read");
    res.status(500).json({ error: "Failed to mark message as read" });
  }
});

export default router;
