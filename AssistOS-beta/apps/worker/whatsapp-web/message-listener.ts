import { sessionManager } from './session-manager';
import { db } from '../db';
import { 
  whatsappMessages, 
  whatsappContacts, 
  whatsappConversations,
  whatsappAccounts,
} from '@shared/schema';
import { eq, and, sql, or } from 'drizzle-orm';
import type { Message } from 'whatsapp-web.js';

interface MessageData {
  id: string;
  from: string;
  to: string;
  body: string;
  timestamp: number;
  // Allow all possible WhatsApp Web.js message types
  type: 'chat' | 'image' | 'video' | 'audio' | 'document' | 'ptt' | 'sticker' | 
        'location' | 'vcard' | 'multi_vcard' | 'revoked' | 'order' | 'product' | 
        'payment' | 'unknown' | 'buttons_response' | 'template_buttons' | 'list' | 
        'list_response' | 'broadcast' | 'call_log' | 'ciphertext' | 'debug' | 
        'e2e_notification' | 'gp2' | 'group_notification' | 'hsm' | 'notification' | 
        'notification_template' | 'oversized' | 'protocol' | 'reaction' | 
        'poll_creation' | 'poll_vote' | string; // Allow string as fallback for future types
  hasMedia: boolean;
  isForwarded?: boolean;
  fromMe: boolean;
}

function normalizeWaConversationId(phoneA: string, phoneB: string): string {
  const a = phoneA.replace(/\D/g, '');
  const b = phoneB.replace(/\D/g, '');
  return a < b ? `${a}_${b}` : `${b}_${a}`;
}

/**
 * Validate if a name is actually a useful contact name
 * Returns true only if it's a real name (not a phone number or empty)
 */
function isValidContactName(name: string | null | undefined, contactPhone: string, accountPhone: string): boolean {
  if (!name || name.trim().length === 0) {
    return false;
  }
  
  // Normalize numbers for comparison (remove all non-digits)
  const normalizedName = name.replace(/\D/g, '');
  const normalizedContact = contactPhone.replace(/\D/g, '');
  const normalizedAccount = accountPhone.replace(/\D/g, '');
  
  // CRITICAL: Reject if this contact IS the account owner's own number
  // This prevents showing "2019 Punit Kumar Q Sec" when user messages themselves
  if (normalizedContact === normalizedAccount) {
    console.log(`[WhatsApp Web] ⚠️  Rejecting name "${name}" - contact ${contactPhone} is the account owner's own number`);
    return false;
  }
  
  // Reject if name is just the phone number itself
  if (normalizedName === normalizedContact) {
    return false;
  }
  
  // Reject if name is the account owner's number
  if (normalizedName === normalizedAccount) {
    return false;
  }
  
  // Reject if name is mostly digits (likely a phone number with formatting)
  // e.g., "+1 234 567 8900" would be rejected
  const digitRatio = normalizedName.length / name.length;
  if (digitRatio > 0.6) {
    return false;
  }
  
  return true;
}

/**
 * Robust contact name retrieval using multiple fallback methods
 * Priority: 1) Name saved in phone, 2) Display name (pushname), 3) Phone number
 */
async function getContactName(accountId: string, message: Message, contactPhone: string, accountPhone: string): Promise<string> {
  const session = sessionManager.getSession(accountId);
  
  console.log(`[WhatsApp Web] Getting contact name for ${contactPhone}, account: ${accountPhone}, fromMe: ${message.fromMe}`);
  console.log(`[WhatsApp Web] Message direction - from: ${message.from}, to: ${message.to}`);
  
  // Method 1: Try direct Puppeteer access to WhatsApp Web Store FIRST (most reliable)
  if (session?.client) {
    try {
      const page = (session.client as any).pupPage || (session.client as any).page;
      if (page) {
        const contactId = contactPhone.includes('@') ? contactPhone : `${contactPhone}@c.us`;
        console.log(`[WhatsApp Web] Attempting Store.Contact lookup for: ${contactId}`);
        
        const contactInfo = await page.evaluate((id: string) => {
          try {
            const Store = (window as any).Store;
            if (!Store || !Store.Contact) {
              return { error: 'Store.Contact not available' };
            }
            
            const contact = Store.Contact.get(id);
            
            if (contact) {
              return {
                name: contact.name || null,
                pushname: contact.pushname || null,
                formattedName: contact.formattedName || null,
                verifiedName: contact.verifiedName || null,
                shortName: contact.shortName || null,
              };
            }
            return { error: 'Contact not found in Store' };
          } catch (e: any) {
            return { error: e.message || 'Unknown error' };
          }
        }, contactId);
        
        if (contactInfo.error) {
          console.log(`[WhatsApp Web] Store.Contact lookup failed: ${contactInfo.error}`);
        } else {
          console.log(`[WhatsApp Web] Store.Contact returned - name: "${contactInfo.name}", pushname: "${contactInfo.pushname}", formattedName: "${contactInfo.formattedName}", verifiedName: "${contactInfo.verifiedName}", shortName: "${contactInfo.shortName}"`);
          
          // Try saved name first (highest priority)
          if (contactInfo.name && isValidContactName(contactInfo.name, contactPhone, accountPhone)) {
            console.log(`[WhatsApp Web] ✅ Got valid name via Store.Contact: ${contactInfo.name}`);
            return contactInfo.name;
          } else if (contactInfo.name) {
            console.log(`[WhatsApp Web] ⚠️  Rejected invalid name from Store.Contact.name: ${contactInfo.name}`);
          }
          
          // Try shortName as fallback
          if (contactInfo.shortName && isValidContactName(contactInfo.shortName, contactPhone, accountPhone)) {
            console.log(`[WhatsApp Web] ✅ Got valid shortName via Store.Contact: ${contactInfo.shortName}`);
            return contactInfo.shortName;
          } else if (contactInfo.shortName) {
            console.log(`[WhatsApp Web] ⚠️  Rejected invalid shortName from Store.Contact: ${contactInfo.shortName}`);
          }
          
          // Try formattedName as fallback
          if (contactInfo.formattedName && isValidContactName(contactInfo.formattedName, contactPhone, accountPhone)) {
            console.log(`[WhatsApp Web] ✅ Got valid formattedName via Store.Contact: ${contactInfo.formattedName}`);
            return contactInfo.formattedName;
          } else if (contactInfo.formattedName) {
            console.log(`[WhatsApp Web] ⚠️  Rejected invalid formattedName from Store.Contact: ${contactInfo.formattedName}`);
          }
        }
      }
    } catch (error: any) {
      console.warn(`[WhatsApp Web] Store.Contact access failed: ${error.message}`);
    }
    
    // Method 2: Try to get contact directly by ID
    try {
      const contactId = contactPhone.includes('@') ? contactPhone : `${contactPhone}@c.us`;
      const contact = await session.client.getContactById(contactId);
      console.log(`[WhatsApp Web] getContactById() returned - name: "${contact.name}", pushname: "${contact.pushname}" for contact: ${contactPhone}`);
      
      // ONLY use saved contact name (what user saved in their phone)
      // Do NOT use pushname - if not saved, we want to show phone number
      if (contact.name && isValidContactName(contact.name, contactPhone, accountPhone)) {
        console.log(`[WhatsApp Web] ✅ Using saved contact name: ${contact.name}`);
        return contact.name;
      } else if (contact.name) {
        console.log(`[WhatsApp Web] ⚠️  Rejected name from getContactById(): "${contact.name}" for ${contactPhone} (likely own number)`);
      }
    } catch (error: any) {
      console.warn(`[WhatsApp Web] getContactById() failed: ${error.message}`);
    }
  }
  
  // Method 3: Try to get chat and access contact info from it
  if (session?.client) {
    try {
      const chatId = contactPhone.includes('@') ? contactPhone : `${contactPhone}@c.us`;
      const chat = await session.client.getChatById(chatId);
      
      // Try embedded contact in chat first (more reliable than chat.name)
      const chatAny = chat as any;
      if (chatAny.contact) {
        console.log(`[WhatsApp Web] chat.contact returned - name: "${chatAny.contact.name}", pushname: "${chatAny.contact.pushname}" for contact: ${contactPhone}`);
        
        // ONLY use saved name, NOT pushname
        if (chatAny.contact.name && isValidContactName(chatAny.contact.name, contactPhone, accountPhone)) {
          console.log(`[WhatsApp Web] ✅ Got valid contact name from chat.contact: ${chatAny.contact.name}`);
          return chatAny.contact.name;
        } else if (chatAny.contact.name) {
          console.log(`[WhatsApp Web] ⚠️  Rejected invalid name from chat.contact: ${chatAny.contact.name}`);
        }
      }
      
      // Try chat name as last resort (least reliable)
      const chatName = (chat as any).name;
      if (chatName) {
        console.log(`[WhatsApp Web] chat.name returned: "${chatName}" for contact: ${contactPhone}`);
        if (isValidContactName(chatName, contactPhone, accountPhone)) {
          console.log(`[WhatsApp Web] ✅ Got valid contact name from chat.name: ${chatName}`);
          return chatName;
        } else {
          console.log(`[WhatsApp Web] ⚠️  Rejected invalid name from chat.name: ${chatName}`);
        }
      }
    } catch (error: any) {
      console.warn(`[WhatsApp Web] getChatById failed: ${error.message}`);
    }
  }
  
  // Fallback: use phone number
  console.log(`[WhatsApp Web] All contact name methods failed or returned invalid names, using phone number: ${contactPhone}`);
  return contactPhone;
}

async function processMessage(accountId: string, message: Message): Promise<void> {
  console.log(`[WhatsApp Web Message Listener] Processing message from ${message.from} to ${message.to}, type: ${message.type}, fromMe: ${message.fromMe}`);
  
  // 🚫 IGNORE WhatsApp Status Updates (status@broadcast)
  // Status updates should not be saved to database or storage
  if (message.from.includes('status@broadcast') || message.to.includes('status@broadcast')) {
    console.log(`[WhatsApp Web] ⏭️  Ignoring status update from ${message.from}`);
    return;
  }
  
  // Special logging for reactions
  if (message.type === 'reaction') {
    const messageAny = message as any;
    console.log(`[WhatsApp Web] 👍 REACTION MESSAGE RECEIVED:`, {
      reaction: messageAny.reaction,
      reactToMessageId: messageAny.reactToMessageId,
      fromMe: message.fromMe,
      messageId: message.id?.id,
    });
  }
  
  try {
    const from = message.from.replace('@c.us', '').replace('@g.us', '');
    const to = message.to.replace('@c.us', '').replace('@g.us', '');
    const isGroup = message.from.endsWith('@g.us');

    const account = await db.query.whatsappAccounts.findFirst({
      where: eq(whatsappAccounts.id, accountId),
    });

    if (!account) {
      console.error(`[WhatsApp Web] Account not found: ${accountId}`);
      return;
    }

    const accountPhone = account.phoneNumber || '';
    const contactPhone = message.fromMe ? to : from;
    
    // Get contact name using robust multi-method approach with validation
    const contactName = await getContactName(accountId, message, contactPhone, accountPhone);

    let contact = await db.query.whatsappContacts.findFirst({
      where: and(
        eq(whatsappContacts.accountId, accountId),
        eq(whatsappContacts.phoneNumber, contactPhone)
      ),
    });

    if (!contact) {
      try {
        const [newContact] = await db.insert(whatsappContacts)
          .values({
            tenantId: account.tenantId,
            accountId,
            phoneNumber: contactPhone,
            name: contactName,
            lastMessageAt: new Date(message.timestamp * 1000),
            messageCount: 1,
          })
          .returning();
        contact = newContact;
      } catch (error: any) {
        // Handle race condition - contact was created by another message
        if (error.code === '23505' && error.constraint === 'whatsapp_contacts_tenant_phone_idx') {
          console.log(`[WhatsApp Web] Contact ${contactPhone} already exists (race condition), fetching...`);
          contact = await db.query.whatsappContacts.findFirst({
            where: and(
              eq(whatsappContacts.accountId, accountId),
              eq(whatsappContacts.phoneNumber, contactPhone)
            ),
          });
          if (!contact) {
            throw new Error(`Contact ${contactPhone} not found after race condition`);
          }
        } else {
          throw error;
        }
      }
    }
    
    // Update contact stats and name if it changed
    const updates: any = {
      lastMessageAt: new Date(message.timestamp * 1000),
      messageCount: (contact.messageCount || 0) + 1,
    };
    
    // Update contact name if we got a better name (not just phone number)
    if (contactName !== contactPhone && contactName !== contact.name) {
      updates.name = contactName;
      console.log(`[WhatsApp Web] Updating contact name: ${contact.name || contactPhone} → ${contactName}`);
    }
    
    await db.update(whatsappContacts)
      .set(updates)
      .where(eq(whatsappContacts.id, contact.id));

    const waConversationId = normalizeWaConversationId(accountPhone, contactPhone);

    let conversation = await db.query.whatsappConversations.findFirst({
      where: and(
        eq(whatsappConversations.accountId, accountId),
        eq(whatsappConversations.waConversationId, waConversationId)
      ),
    });

    const messageTimestamp = new Date(message.timestamp * 1000);

    if (!conversation) {
      const [newConversation] = await db.insert(whatsappConversations)
        .values({
          tenantId: account.tenantId,
          accountId,
          contactId: contact.id,
          waConversationId,
          title: contactName,
          status: 'active',
          lastInboundMessageAt: message.fromMe ? null : messageTimestamp,
          lastOutboundMessageAt: message.fromMe ? messageTimestamp : null,
          unreadCount: message.fromMe ? 0 : 1,
          messageCount: 1,
        })
        .returning();
      conversation = newConversation;
    } else {
      const updates: any = {
        messageCount: (conversation.messageCount || 0) + 1,
        updatedAt: messageTimestamp, // Update timestamp for sorting
      };

      if (!message.fromMe) {
        updates.lastInboundMessageAt = messageTimestamp;
        updates.unreadCount = (conversation.unreadCount || 0) + 1;
      } else {
        updates.lastOutboundMessageAt = messageTimestamp;
      }

      // Update conversation title if we got a better name (not just phone number)
      if (contactName !== contactPhone && contactName !== conversation.title) {
        updates.title = contactName;
        console.log(`[WhatsApp Web] Updating conversation title: ${conversation.title} → ${contactName}`);
      }

      await db.update(whatsappConversations)
        .set(updates)
        .where(eq(whatsappConversations.id, conversation.id));
    }

    let mediaUrl: string | null = null;
    let mediaMimeType: string | null = null;
    let mediaId: string | null = null;
    let latitude: string | null = null;
    let longitude: string | null = null;
    let locationName: string | null = null;
    let locationAddress: string | null = null;
    let interactiveType: string | null = null;
    let interactivePayload: any = null;
    let messageText = message.body || null;
    
    // Check if this message has a quoted message (is a reply)
    const messageAny = message as any;
    if (messageAny.hasQuotedMsg) {
      try {
        const quotedMsg = await messageAny.getQuotedMessage();
        if (quotedMsg) {
          // Store quoted message info in interactivePayload
          if (!interactivePayload) {
            interactivePayload = {};
          }
          
          // Extract media info from quoted message
          const quotedMsgAny = quotedMsg as any;
          let quotedMediaUrl = null;
          
          // Try to find the quoted message in database to get its mediaUrl
          if (quotedMsg.id?.id) {
            try {
              const quotedDbMessage = await db.query.whatsappMessages.findFirst({
                where: and(
                  eq(whatsappMessages.accountId, accountId),
                  eq(whatsappMessages.waMessageId, quotedMsg.id.id)
                ),
              });
              if (quotedDbMessage?.mediaUrl) {
                quotedMediaUrl = quotedDbMessage.mediaUrl;
              }
            } catch (err) {
              // Ignore lookup errors
            }
          }
          
          interactivePayload.quotedMessage = {
            id: quotedMsg.id?.id || quotedMsg.id?._serialized,
            body: quotedMsg.body || '',
            type: quotedMsg.type,
            fromMe: quotedMsg.fromMe,
            hasMedia: quotedMsg.hasMedia || false,
            mediaUrl: quotedMediaUrl,
            mediaMimeType: quotedMsgAny._data?.mimetype || null,
          };
          console.log(`[WhatsApp Web] Message has quoted message: "${quotedMsg.body?.substring(0, 50)}" (type: ${quotedMsg.type}, hasMedia: ${quotedMsg.hasMedia})`);
        }
      } catch (error: any) {
        console.warn(`[WhatsApp Web] Failed to get quoted message: ${error.message}`);
      }
    }

    // Extract type-specific data
    try {
      const messageAny = message as any;
      const messageType = message.type as string; // Cast to string to handle all possible types
      
      switch (messageType) {
        case 'location':
          // Extract location data
          if (messageAny.location) {
            latitude = String(messageAny.location.latitude || '');
            longitude = String(messageAny.location.longitude || '');
            locationName = messageAny.location.description || null;
            messageText = locationName || 'Location';
          }
          console.log(`[WhatsApp Web] Location message: ${latitude}, ${longitude}`);
          break;

        case 'vcard':
        case 'multi_vcard':
          // Contact card(s)
          interactiveType = 'contacts';
          interactivePayload = messageAny.vCards || [messageAny.body];
          messageText = `Shared ${message.type === 'multi_vcard' ? 'contacts' : 'contact'}`;
          console.log(`[WhatsApp Web] Contact card message`);
          break;

        case 'buttons_response':
          // Response to button message
          if (messageAny.selectedButtonId) {
            interactiveType = 'button_reply';
            interactivePayload = {
              id: messageAny.selectedButtonId,
              title: message.body,
            };
            messageText = message.body;
          }
          console.log(`[WhatsApp Web] Button response: ${messageAny.selectedButtonId}`);
          break;

        case 'list_response':
          // Response to list message
          if (messageAny.selectedRowId) {
            interactiveType = 'list_reply';
            interactivePayload = {
              id: messageAny.selectedRowId,
              title: messageAny.listResponse?.title || message.body,
              description: messageAny.listResponse?.description,
            };
            messageText = messageAny.listResponse?.title || message.body;
          }
          console.log(`[WhatsApp Web] List response: ${messageAny.selectedRowId}`);
          break;

        case 'poll_creation':
          // Poll message
          interactiveType = 'poll';
          if (messageAny.pollName) {
            interactivePayload = {
              name: messageAny.pollName,
              options: messageAny.pollOptions || [],
              allowMultipleAnswers: messageAny.allowMultipleAnswers || false,
            };
            messageText = `Poll: ${messageAny.pollName}`;
          }
          console.log(`[WhatsApp Web] Poll created: ${messageAny.pollName}`);
          break;

        case 'poll_vote':
          // Poll vote
          interactiveType = 'poll_vote';
          if (messageAny.selectedOptions) {
            interactivePayload = {
              selectedOptions: messageAny.selectedOptions,
            };
            messageText = `Voted in poll`;
          }
          console.log(`[WhatsApp Web] Poll vote received`);
          break;

        case 'reaction':
          // Emoji reaction
          interactiveType = 'reaction';
          if (messageAny.reaction) {
            interactivePayload = {
              text: messageAny.reaction,
              messageId: messageAny.reactToMessageId || messageAny._data?.id?.id,
            };
            messageText = `Reacted ${messageAny.reaction}`;
            console.log(`[WhatsApp Web] 👍 Reaction details:`, {
              emoji: messageAny.reaction,
              targetMessageId: messageAny.reactToMessageId,
              fallbackId: messageAny._data?.id?.id,
              fromMe: message.fromMe,
            });
          }
          console.log(`[WhatsApp Web] Reaction: ${messageAny.reaction} to message: ${messageAny.reactToMessageId}`);
          break;

        case 'revoked':
          // Deleted message
          messageText = '[Message deleted]';
          console.log(`[WhatsApp Web] Revoked/deleted message`);
          break;

        case 'e2e_notification':
        case 'notification':
        case 'notification_template':
        case 'gp2':
        case 'group_notification':
          // System notifications - these typically don't have body text
          // Provide meaningful default messages based on type
          if (message.body) {
            messageText = message.body;
          } else {
            // Use default messages for common notification types
            const notificationDefaults: Record<string, string> = {
              'e2e_notification': 'Messages and calls are end-to-end encrypted',
              'gp2': 'Group notification',
              'group_notification': 'Group notification',
              'notification': 'Notification',
              'notification_template': 'Notification',
            };
            messageText = notificationDefaults[message.type] || 'System notification';
          }
          console.log(`[WhatsApp Web] System notification (${message.type}): ${messageText}`);
          break;

        case 'call_log':
          // Call notifications
          messageText = message.body || 'Missed call';
          console.log(`[WhatsApp Web] Call log: ${messageText}`);
          break;

        case 'order':
        case 'product':
          // Business messages
          interactiveType = message.type;
          interactivePayload = messageAny.orderInfo || messageAny.productInfo || {};
          messageText = message.body || `[${message.type} message]`;
          console.log(`[WhatsApp Web] Business message: ${message.type}`);
          break;

        case 'hsm':
        case 'template_buttons':
          // Template messages (HSM = Highly Structured Message)
          if (messageAny.title || messageAny.footer) {
            interactivePayload = {
              title: messageAny.title,
              body: message.body,
              footer: messageAny.footer,
              buttons: messageAny.buttons || [],
            };
          }
          messageText = message.body;
          console.log(`[WhatsApp Web] Template message received`);
          break;

        default:
          // For other types, just use body
          messageText = message.body || null;
          if (messageText) {
            console.log(`[WhatsApp Web] Unknown type '${message.type}' with body: ${messageText.substring(0, 100)}`);
          }
      }
    } catch (error: any) {
      console.error(`[WhatsApp Web] Error extracting message data for type ${message.type}:`, error.message);
      // Continue with default values
    }

    // Download and save media if present
    let caption: string | null = null;
    if (message.hasMedia) {
      try {
        console.log(`[WhatsApp Web] 📎 Media detected:`, {
          type: message.type,
          hasMedia: message.hasMedia,
          fromMe: message.fromMe,
          id: message.id.id
        });
        
        // Extract caption before downloading media
        const messageAny = message as any;
        caption = messageAny._data?.caption || 
                  (message.type !== 'chat' && message.body) || 
                  null;
        
        if (caption) {
          console.log(`[WhatsApp Web] 📝 Caption detected: "${caption.substring(0, 100)}${caption.length > 100 ? '...' : ''}"`);
        }
        
        console.log(`[WhatsApp Web] ⬇️  Downloading media (type: ${message.type})...`);
        const media = await message.downloadMedia();
        
        if (media) {
          console.log(`[WhatsApp Web] ✓ Media downloaded successfully (${media.data.length} base64 chars, mimetype: ${media.mimetype})`);
          
          // Save media to storage using organized structure (matching document storage)
          const { promises: fs } = await import('fs');
          const path = await import('path');
          const crypto = await import('crypto');
          
          // Generate storage path: {tenantId}/whatsapp/{year}/{month}/{messageId}-{filename}
          const now = new Date();
          const year = now.getFullYear();
          const month = String(now.getMonth() + 1).padStart(2, '0');
          
          // Generate unique filename with original extension
          const fileExtension = media.filename ? path.extname(media.filename) : 
                                (media.mimetype ? `.${media.mimetype.split('/')[1]}` : '');
          const uniqueFilename = `${message.id.id}-${crypto.randomUUID().substring(0, 8)}${fileExtension}`;
          
          // Use relative path like document storage (LocalProvider pattern)
          // Base path: ./storage (relative to project root)
          const relativePath = path.join(account.tenantId, 'whatsapp', String(year), month, uniqueFilename);
          const fullPath = path.join('./storage', relativePath);
          const dirPath = path.dirname(fullPath);
          
          // Create directory structure
          await fs.mkdir(dirPath, { recursive: true });
          console.log(`[WhatsApp Web] 📁 Storage path: ${relativePath}`);
          
          const filePath = fullPath;
          
          // Save media file (async like document storage)
          const buffer = Buffer.from(media.data, 'base64');
          await fs.writeFile(filePath, buffer);
          
          // Set media info with organized path
          mediaUrl = `/storage/${relativePath}`;
          mediaMimeType = media.mimetype;
          mediaId = uniqueFilename;
          
          console.log(`[WhatsApp Web] ✅ Media saved: ${mediaUrl} (${media.mimetype}, ${buffer.length} bytes)`);
        } else {
          console.warn('[WhatsApp Web] ⚠️  Media download returned null');
        }
      } catch (error: any) {
        console.error('[WhatsApp Web] ❌ Failed to download/save media:', error.message);
        console.error('[WhatsApp Web] Error stack:', error.stack);
        // Continue saving message even if media fails
      }
    }

    // Check if message already exists (prevents duplicates from message_create event)
    // Check both the short ID and full serialized ID
    const messageIdShort = message.id.id;
    const messageIdFull = message.id._serialized;
    
    const existingMessage = await db.query.whatsappMessages.findFirst({
      where: and(
        eq(whatsappMessages.accountId, accountId),
        or(
          eq(whatsappMessages.waMessageId, messageIdShort),
          eq(whatsappMessages.waMessageId, messageIdFull)
        )
      ),
    });

    if (existingMessage) {
      console.log(`[WhatsApp Web] Message ${messageIdShort} already exists (matched: ${existingMessage.waMessageId}), skipping duplicate`);
      return;
    }

    console.log(`[WhatsApp Web] Saving message: type=${message.type}, text="${messageText}", hasMedia=${message.hasMedia}, fromMe=${message.fromMe}`);
    
    await db.insert(whatsappMessages).values({
      tenantId: account.tenantId,
      environment: account.environment || 'development',
      accountId,
      contactId: contact.id,
      waConversationId,
      waMessageId: message.id.id,
      direction: message.fromMe ? 'outbound' : 'inbound',
      fromNumber: from,
      toNumber: to,
      contactName: contactName,
      type: message.type as any,
      text: messageText,
      caption,
      status: 'delivered',
      timestamp: messageTimestamp,
      mediaUrl,
      mediaMimeType,
      mediaId,
      latitude,
      longitude,
      locationName,
      locationAddress,
      interactiveType,
      interactivePayload,
    });

    console.log(`[WhatsApp Web] ✅ Saved ${message.fromMe ? 'outbound' : 'inbound'} message ${message.id.id} ${message.fromMe ? 'to' : 'from'} ${contactPhone}`);

    // Trigger WhatsApp automation if this is an inbound message
    if (!message.fromMe && messageText) {
      try {
        // Dynamically import the automation analyzer to avoid circular dependencies
        const { whatsappAutomationAnalyzer } = await import('../../../packages/services/whatsapp-automation-analyzer');
        
        // Fetch conversation history for context (last 10 messages with this contact)
        const { desc: descOrder, or: orOp } = await import('drizzle-orm');
        const { withDbRetry } = await import('../../../apps/shared/utils/db-retry');
        const recentMessages = await withDbRetry(async () => {
          return await db.query.whatsappMessages.findMany({
            where: and(
              eq(whatsappMessages.accountId, accountId),
              orOp(
                eq(whatsappMessages.fromNumber, contactPhone),
                eq(whatsappMessages.toNumber, contactPhone),
              ),
            ),
            orderBy: [descOrder(whatsappMessages.timestamp)],
            limit: 10, // Last 10 messages for context
          });
        });

        // Build conversation history (most recent first, so reverse for chronological order)
        const conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = recentMessages
          .reverse() // Chronological order (oldest first)
          .filter(msg => msg.text) // Only messages with text content
          .map(msg => ({
            role: msg.direction === 'outbound' ? ('assistant' as const) : ('user' as const),
            content: msg.text || '',
          }));

        console.log(`[WhatsApp Web Automation] Fetched ${conversationHistory.length} messages for conversation context`);
        
        // Analyze the message for automation trigger with conversation history
        const analysis = await whatsappAutomationAnalyzer.analyzeMessage(
          account.tenantId,
          contactPhone,
          messageText,
          conversationHistory,
          contactName, // Pass the actual contact name from WhatsApp
        );

        console.log(`[WhatsApp Web Automation] Analysis result:`, {
          shouldTrigger: analysis.shouldTrigger,
          isConfiguredClient: analysis.isConfiguredClient,
          isOrderRelated: analysis.isOrderRelated,
          category: analysis.category,
          confidence: analysis.confidence,
        });

        // If automation should trigger, create a proactive notification in AssistME
        if (analysis.shouldTrigger && analysis.clientInfo) {
          console.log(`[WhatsApp Web Automation] 🤖 Triggering AssistME notification for order inquiry from ${analysis.clientInfo.name || contactPhone}`);
          
          try {
            // Import the proactive notifier
            const { assistMEProactiveNotifier } = await import('../../../packages/services/assistme-proactive-notifier');
            
            // Send the notification to AssistME
            // Pass account.userId so conversation is created for the user who set up the WhatsApp account
            await assistMEProactiveNotifier.notifyWhatsAppOrderInquiry(
              account.tenantId,
              analysis,
              messageText,
              account.userId, // Use userId from WhatsApp account (user who created/configured it)
            );
            
            console.log(`[WhatsApp Web Automation] ✅ AssistME notification sent successfully (userId: ${account.userId})`);
          } catch (notificationError) {
            console.error('[WhatsApp Web Automation] Error sending AssistME notification:', notificationError);
          }
        }
      } catch (automationError) {
        // Don't let automation errors break message processing
        console.error('[WhatsApp Web Automation] Error in automation trigger:', automationError);
      }
    }

  } catch (error) {
    console.error('[WhatsApp Web] Error processing message:', error);
  }
}

async function handleMessageRead(accountId: string, waMessageId: string, status: string): Promise<void> {
  try {
    console.log(`[WhatsApp Web] Updating message read status: ${waMessageId} → ${status}`);
    
    // Update message status in database
    const result = await db.update(whatsappMessages)
      .set({
        status: status,
        isRead: status === 'read' || status === 'played',
        updatedAt: new Date(),
      })
      .where(eq(whatsappMessages.waMessageId, waMessageId))
      .returning();
    
    if (result.length > 0) {
      console.log(`[WhatsApp Web] ✅ Updated message ${waMessageId} to ${status}`);
      
      // If message was read, also update conversation unread count
      if (status === 'read' || status === 'played') {
        const message = result[0];
        
        // Only decrease unread count for inbound messages
        if (message.direction === 'inbound' && message.waConversationId) {
          await db.update(whatsappConversations)
            .set({
              unreadCount: sql`GREATEST(${whatsappConversations.unreadCount} - 1, 0)`,
            })
            .where(eq(whatsappConversations.waConversationId, message.waConversationId));
          
          console.log(`[WhatsApp Web] ✅ Decreased unread count for conversation ${message.waConversationId}`);
        }
      }
    } else {
      console.warn(`[WhatsApp Web] ⚠️  Message ${waMessageId} not found in database`);
    }
  } catch (error) {
    console.error('[WhatsApp Web] Error handling message read:', error);
  }
}

async function handleChatReadOnPhone(accountId: string, contactPhone: string): Promise<void> {
  try {
    console.log(`[WhatsApp Web] Chat read on phone - marking all messages as read for contact: ${contactPhone}`);
    
    // Get account to build conversation ID
    const account = await db.query.whatsappAccounts.findFirst({
      where: eq(whatsappAccounts.id, accountId),
    });

    if (!account) {
      console.error(`[WhatsApp Web] Account not found: ${accountId}`);
      return;
    }

    const accountPhone = account.phoneNumber || '';
    const waConversationId = normalizeWaConversationId(accountPhone, contactPhone);
    
    // Mark all unread inbound messages in this conversation as read
    const result = await db.update(whatsappMessages)
      .set({
        isRead: true,
        status: 'read',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(whatsappMessages.accountId, accountId),
          eq(whatsappMessages.waConversationId, waConversationId),
          eq(whatsappMessages.direction, 'inbound'),
          eq(whatsappMessages.isRead, false)
        )
      )
      .returning();
    
    if (result.length > 0) {
      console.log(`[WhatsApp Web] ✅ Marked ${result.length} messages as read for ${contactPhone}`);
      
      // Update conversation unread count to 0
      await db.update(whatsappConversations)
        .set({
          unreadCount: 0,
        })
        .where(eq(whatsappConversations.waConversationId, waConversationId));
      
      console.log(`[WhatsApp Web] ✅ Reset unread count for conversation ${waConversationId}`);
    } else {
      console.log(`[WhatsApp Web] No unread messages to update for ${contactPhone}`);
    }
  } catch (error) {
    console.error('[WhatsApp Web] Error handling chat read on phone:', error);
  }
}

export function startMessageListener(): void {
  console.log('[WhatsApp Web] Starting message listener...');

  sessionManager.on('message', (accountId: string, message: Message) => {
    processMessage(accountId, message).catch(error => {
      console.error('[WhatsApp Web] Error in message handler:', error);
    });
  });

  sessionManager.on('message_read', (accountId: string, waMessageId: string, status: string) => {
    handleMessageRead(accountId, waMessageId, status).catch(error => {
      console.error('[WhatsApp Web] Error in message_read handler:', error);
    });
  });

  sessionManager.on('chat_read_on_phone', (accountId: string, contactPhone: string) => {
    handleChatReadOnPhone(accountId, contactPhone).catch(error => {
      console.error('[WhatsApp Web] Error in chat_read_on_phone handler:', error);
    });
  });

  sessionManager.on('ready', (accountId: string, phoneNumber: string) => {
    console.log(`[WhatsApp Web] Session ready for ${accountId} (${phoneNumber})`);
  });

  sessionManager.on('disconnected', (accountId: string, reason?: string) => {
    console.log(`[WhatsApp Web] Session disconnected ${accountId}:`, reason);
  });

  sessionManager.on('error', (accountId: string, error: Error) => {
    console.error(`[WhatsApp Web] Session error ${accountId}:`, error);
  });

  console.log('[WhatsApp Web] Message listener started');
}
