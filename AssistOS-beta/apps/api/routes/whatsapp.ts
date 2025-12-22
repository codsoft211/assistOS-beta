/**
 * WhatsApp Integration Routes
 * Handles webhook verification, message receiving, and API operations
 */

import { Router } from "express";
import { hardTenantGuard } from "../middleware/hard-tenant-guard";
import { db } from "../db";
import { whatsappAccounts, whatsappMessages, whatsappContacts, whatsappConversations } from "../../../shared/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import logger from "../logger";
import crypto from "crypto";
import { whatsappClassifier } from "../services/whatsapp-message-classifier.service";

const router = Router();

/**
 * Normalize WhatsApp conversation ID
 * Ensures consistent format: accountPhone_contactPhone (both without + prefix)
 * This prevents fragmentation where same conversation gets multiple IDs
 */
export function normalizeWaConversationId(accountPhone: string, contactPhone: string): string {
  // Remove + prefix from both numbers
  const normalizedAccount = accountPhone.replace(/^\+/, '');
  const normalizedContact = contactPhone.replace(/^\+/, '');
  
  // Always format as: accountPhone_contactPhone
  return `${normalizedAccount}_${normalizedContact}`;
}

// ============================================================================
// MULTI-TENANT SECURITY
// WhatsApp webhooks GET/POST are PUBLIC (no auth) - skip hardTenantGuard
// All OTHER routes use hardTenantGuard
// ============================================================================

/**
 * GET /api/whatsapp/webhook
 * WhatsApp webhook verification endpoint
 * Meta sends a GET request with hub.mode, hub.verify_token, and hub.challenge
 */
router.get("/webhook", async (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  logger.info({
    mode,
    token: token ? "***" : undefined,
    challenge: challenge ? "received" : "missing",
  }, "[WhatsApp Webhook] Verification request received");

  if (mode === "subscribe") {
    // Find account with matching verify token
    const account = await db.query.whatsappAccounts.findFirst({
      where: eq(whatsappAccounts.webhookVerifyToken, token as string),
    });

    if (account) {
      logger.info({
        phoneNumber: account.phoneNumber,
      }, "[WhatsApp Webhook] Verification successful for account");
      
      // Respond with the challenge to complete verification
      return res.status(200).send(challenge);
    } else {
      logger.warn("[WhatsApp Webhook] Invalid verify token");
      return res.status(403).send("Forbidden");
    }
  } else {
    logger.warn({ mode }, "[WhatsApp Webhook] Invalid mode");
    return res.status(400).send("Bad Request");
  }
});

/**
 * POST /api/whatsapp/webhook
 * WhatsApp webhook endpoint for receiving messages and status updates
 */
router.post("/webhook", async (req, res) => {
  try {
    logger.info("[WhatsApp Webhook] Received POST notification");

    const body = req.body;
    const signature = req.headers["x-hub-signature-256"] as string;

    // SECURITY: Validate HMAC signature from Meta
    // Reject any webhook without a signature
    if (!signature) {
      logger.warn("[WhatsApp Webhook] No signature provided - rejecting webhook");
      return res.status(403).send("Forbidden - Signature Required");
    }

    const isValid = await validateWebhookSignature(signature, JSON.stringify(body));
    
    if (!isValid) {
      logger.warn("[WhatsApp Webhook] Invalid signature - rejecting webhook");
      return res.status(403).send("Forbidden - Invalid Signature");
    }
    
    logger.info("[WhatsApp Webhook] Signature validated successfully");

    // Immediately respond 200 OK to Meta
    res.status(200).send("EVENT_RECEIVED");

    // Process webhook payload asynchronously
    processWebhookPayload(body).catch((error) => {
      logger.error({ error }, "[WhatsApp Webhook] Error processing payload");
    });
  } catch (error) {
    logger.error({ error }, "[WhatsApp Webhook] Error");
    res.status(500).send("Internal Server Error");
  }
});

/**
 * Validate webhook signature from Meta
 * Uses app secret from environment variable WHATSAPP_APP_SECRET
 */
async function validateWebhookSignature(signature: string, body: string): Promise<boolean> {
  try {
    // Extract the signature (format: "sha256=<hash>")
    const signatureHash = signature.replace("sha256=", "");
    
    // Get app secret from environment variable
    const appSecret = process.env.WHATSAPP_APP_SECRET;
    
    if (!appSecret) {
      logger.error("[WhatsApp Webhook] WHATSAPP_APP_SECRET not configured - cannot validate signature");
      // SECURITY: Reject webhooks if app secret is not configured
      return false;
    }
    
    // Compute HMAC SHA256 of body using app secret
    const hmac = crypto.createHmac('sha256', appSecret);
    const digest = hmac.update(body).digest('hex');
    
    // Use timing-safe comparison to prevent timing attacks
    const isValid = crypto.timingSafeEqual(
      Buffer.from(digest),
      Buffer.from(signatureHash)
    );
    
    if (!isValid) {
      logger.warn({ 
        expected: digest.substring(0, 10) + "...",
        received: signatureHash.substring(0, 10) + "..."
      }, "[WhatsApp Webhook] Signature mismatch");
    }
    
    return isValid;
  } catch (error) {
    logger.error({ error }, "[WhatsApp Webhook] Error validating signature");
    return false;
  }
}

/**
 * Process WhatsApp webhook payload
 */
async function processWebhookPayload(body: any) {
  if (body.object !== "whatsapp_business_account") {
    logger.warn({ objectType: body.object }, "[WhatsApp Webhook] Unknown object type");
    return;
  }

  for (const entry of body.entry || []) {
    const businessAccountId = entry.id;

    for (const change of entry.changes || []) {
      if (change.field === "messages") {
        await processMessageChange(businessAccountId, change.value);
      } else if (change.field === "message_status") {
        await processStatusChange(businessAccountId, change.value);
      } else {
        logger.info({ field: change.field }, "[WhatsApp Webhook] Unhandled field");
      }
    }
  }
}

/**
 * Process incoming messages and status updates
 * Note: Meta sends both messages AND status updates under change.field === "messages"
 */
async function processMessageChange(businessAccountId: string, value: any) {
  const phoneNumberId = value.metadata?.phone_number_id;
  
  if (!phoneNumberId) {
    logger.warn("[WhatsApp Webhook] Missing phone_number_id");
    return;
  }

  // Find account by phone_number_id
  const account = await db.query.whatsappAccounts.findFirst({
    where: eq(whatsappAccounts.phoneNumberId, phoneNumberId),
  });

  if (!account) {
    logger.warn({ phoneNumberId }, "[WhatsApp Webhook] Account not found for phone_number_id");
    return;
  }

  // Process each incoming message
  for (const message of value.messages || []) {
    try {
      await saveIncomingMessage(account, message, value.contacts?.[0]);
    } catch (error) {
      logger.error({ error }, "[WhatsApp Webhook] Error saving message");
    }
  }

  // Process status updates (delivered, read, failed, etc.)
  // Meta sends these in the same webhook under value.statuses
  for (const status of value.statuses || []) {
    try {
      await updateMessageStatus(status);
    } catch (error) {
      logger.error({ error }, "[WhatsApp Webhook] Error updating status");
    }
  }
}

/**
 * Classify message asynchronously
 */
async function classifyMessageAsync(messageId: string, messageText: string) {
  try {
    const classification = await whatsappClassifier.classifyMessage(messageText);
    
    // Update message with classification results
    await db.update(whatsappMessages)
      .set({
        messageCategory: classification.category,
        classificationConfidence: classification.confidence,
        classifiedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(whatsappMessages.id, messageId));
    
    logger.info({
      messageId,
      category: classification.category,
      confidence: classification.confidence,
    }, "[WhatsApp Classifier] Message classified successfully");
  } catch (error) {
    logger.error({ error, messageId }, "[WhatsApp Classifier] Classification failed");
  }
}

/**
 * Save incoming message to database
 */
async function saveIncomingMessage(account: any, message: any, contact: any) {
  const tenantId = account.tenantId;
  const accountId = account.id;

  logger.info({
    messageId: message.id,
    type: message.type,
    from: message.from,
  }, "[WhatsApp Webhook] Processing message");

  // Find or create contact
  let contactRecord = await db.query.whatsappContacts.findFirst({
    where: and(
      eq(whatsappContacts.tenantId, tenantId),
      eq(whatsappContacts.phoneNumber, message.from)
    ),
  });

  if (!contactRecord) {
    const [newContact] = await db.insert(whatsappContacts).values({
      tenantId,
      accountId,
      phoneNumber: message.from,
      waId: contact?.wa_id || message.from,
      name: contact?.profile?.name || null,
      optInStatus: "unknown",
      messageCount: 0,
    }).returning();
    
    contactRecord = newContact;
    logger.info({ contactId: contactRecord.id }, "[WhatsApp Webhook] Created new contact");
  }

  // Generate waConversationId (normalized to prevent fragmentation)
  const waConversationId = normalizeWaConversationId(account.phoneNumber, message.from);

  // Find or create conversation
  let conversation = await db.query.whatsappConversations.findFirst({
    where: and(
      eq(whatsappConversations.tenantId, tenantId),
      eq(whatsappConversations.accountId, accountId),
      eq(whatsappConversations.contactId, contactRecord.id)
    ),
  });

  const now = new Date();
  const conversationWindowExpiry = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24h window

  if (!conversation) {
    // Create new conversation
    const [newConversation] = await db.insert(whatsappConversations).values({
      tenantId,
      accountId,
      contactId: contactRecord.id,
      waConversationId,
      status: "open",
      lastInboundMessageAt: now,
      conversationWindowExpiresAt: conversationWindowExpiry,
      messageCount: 0,
      unreadCount: 0,
    }).returning();
    
    conversation = newConversation;
    logger.info({ conversationId: conversation.id }, "[WhatsApp Webhook] Created new conversation");
  } else {
    // Update existing conversation
    await db.update(whatsappConversations)
      .set({
        lastInboundMessageAt: now,
        conversationWindowExpiresAt: conversationWindowExpiry,
        messageCount: sql`${whatsappConversations.messageCount} + 1`,
        unreadCount: sql`${whatsappConversations.unreadCount} + 1`,
        status: "open", // Reopen if closed
        updatedAt: now,
      })
      .where(eq(whatsappConversations.id, conversation.id));
  }

  // Extract message content based on type
  let text = null;
  let caption = null;
  let mediaId = null;
  let mediaUrl = null;
  let mediaMimeType = null;
  let mediaFilename = null;
  let latitude = null;
  let longitude = null;
  let locationName = null;
  let locationAddress = null;
  let interactiveType = null;
  let interactivePayload = null;

  switch (message.type) {
    case "text":
      text = message.text?.body;
      break;
    case "image":
      mediaId = message.image?.id;
      caption = message.image?.caption;
      mediaMimeType = message.image?.mime_type;
      break;
    case "video":
      mediaId = message.video?.id;
      caption = message.video?.caption;
      mediaMimeType = message.video?.mime_type;
      break;
    case "audio":
      mediaId = message.audio?.id;
      mediaMimeType = message.audio?.mime_type;
      break;
    case "document":
      mediaId = message.document?.id;
      caption = message.document?.caption;
      mediaFilename = message.document?.filename;
      mediaMimeType = message.document?.mime_type;
      break;
    case "sticker":
      mediaId = message.sticker?.id;
      mediaMimeType = message.sticker?.mime_type;
      break;
    case "location":
      latitude = message.location?.latitude;
      longitude = message.location?.longitude;
      locationName = message.location?.name;
      locationAddress = message.location?.address;
      break;
    case "contacts":
      // Store contact information in interactivePayload
      interactiveType = "contacts";
      interactivePayload = message.contacts;
      text = `Shared ${message.contacts?.length || 0} contact(s)`;
      break;
    case "interactive":
      // Store interactive button/list response
      interactiveType = message.interactive?.type; // "button_reply" or "list_reply"
      interactivePayload = message.interactive;
      text = message.interactive?.button_reply?.title || message.interactive?.list_reply?.title;
      break;
    case "button":
      // Legacy button format
      text = message.button?.text;
      interactivePayload = message.button;
      break;
    case "system":
      // System messages (e.g., "Customer number changed")
      text = message.system?.body;
      logger.info({ messageType: "system" }, "[WhatsApp Webhook] System message received");
      break;
    case "unsupported":
      // Explicitly unsupported message type
      text = "[Unsupported message type]";
      logger.warn({ errors: message.errors }, "[WhatsApp Webhook] Unsupported message type received");
      break;
    default:
      // Unknown/new message types
      text = `[Unknown message type: ${message.type}]`;
      logger.warn({ messageType: message.type }, "[WhatsApp Webhook] Unknown message type - may need support");
      break;
  }

  // Save message with waConversationId
  const [insertedMessage] = await db.insert(whatsappMessages).values({
    tenantId,
    accountId,
    waMessageId: message.id,
    waConversationId: conversation.waConversationId!,
    direction: "inbound",
    fromNumber: message.from,
    toNumber: account.phoneNumber,
    contactId: contactRecord.id,
    contactName: contactRecord.name,
    type: message.type,
    text,
    caption,
    mediaId,
    mediaUrl,
    mediaMimeType,
    mediaFilename,
    interactiveType,
    interactivePayload,
    latitude: latitude ? String(latitude) : null,
    longitude: longitude ? String(longitude) : null,
    locationName,
    locationAddress,
    status: "received",
    timestamp: new Date(parseInt(message.timestamp) * 1000),
    processingStatus: "pending",
  }).returning();

  // Update contact message count and last message
  await db.update(whatsappContacts)
    .set({
      messageCount: sql`${whatsappContacts.messageCount} + 1`,
      lastMessageAt: new Date(),
      lastMessageDirection: "inbound",
      updatedAt: new Date(),
    })
    .where(eq(whatsappContacts.id, contactRecord.id));

  logger.info("[WhatsApp Webhook] Message saved successfully");

  // Classify message automatically if it contains text
  if (text) {
    // Run classification asynchronously (don't block webhook response)
    classifyMessageAsync(insertedMessage.id, text).catch((error) => {
      logger.error({ error, messageId: insertedMessage.id }, "[WhatsApp Webhook] Error classifying message");
    });
  }
}

/**
 * Update message status (sent, delivered, read, failed)
 */
async function updateMessageStatus(status: any) {
  const message = await db.query.whatsappMessages.findFirst({
    where: eq(whatsappMessages.waMessageId, status.id),
  });

  if (message) {
    await db.update(whatsappMessages)
      .set({
        status: status.status,
        errorCode: status.errors?.[0]?.code || null,
        errorMessage: status.errors?.[0]?.title || null,
        updatedAt: new Date(),
      })
      .where(eq(whatsappMessages.id, message.id));

    logger.info({
      messageId: status.id,
      newStatus: status.status,
    }, "[WhatsApp Webhook] Updated message status");
  } else {
    logger.warn({
      messageId: status.id,
    }, "[WhatsApp Webhook] Message not found for status update");
  }
}

/**
 * Process status updates from change.field === "message_status"
 * Note: Meta may send status updates via this field OR via change.field === "messages"
 * We handle both cases to ensure robustness
 */
async function processStatusChange(businessAccountId: string, value: any) {
  for (const status of value.statuses || []) {
    try {
      await updateMessageStatus(status);
    } catch (error) {
      logger.error({ error }, "[WhatsApp Webhook] Error updating status in processStatusChange");
    }
  }
}

export default router;
