import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { db } from '../db';
import { whatsappAccounts, whatsappWebSessions } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import axios from 'axios';

const router = Router();

router.post('/connect', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const tenantId = (req as any).tenantId || req.session?.activeTenantId;
    const { displayName } = req.body;

    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant not found' });
    }

    if (!displayName) {
      return res.status(400).json({ error: 'Display name is required' });
    }

    // Generate a unique placeholder phone number to avoid constraint violation
    const tempPhoneNumber = `pending-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const [account] = await db.insert(whatsappAccounts)
      .values({
        tenantId,
        environment: process.env.NODE_ENV || 'development',
        userId,
        connectionType: 'web-connector',
        phoneNumber: tempPhoneNumber, // Unique placeholder, will be updated after QR scan
        displayName,
        isActive: false,
      })
      .returning();

    const workerUrl = process.env.WORKER_URL || 'http://localhost:3001';
    
    try {
      await axios.post(`${workerUrl}/whatsapp-web/session`, {
        accountId: account.id,
        userId,
        tenantId,
        environment: process.env.NODE_ENV || 'development',
      });
    } catch (error) {
      console.error('[WhatsApp Web] Failed to create session in worker:', error);
      await db.delete(whatsappAccounts).where(eq(whatsappAccounts.id, account.id));
      throw new Error('Failed to initialize WhatsApp Web session. Worker might be offline.');
    }

    res.json({ 
      success: true, 
      accountId: account.id,
      message: 'WhatsApp Web session created. Scan the QR code to connect.',
    });
  } catch (error: any) {
    console.error('[WhatsApp Web API] Error creating session:', error);
    res.status(500).json({ error: error.message || 'Failed to create WhatsApp Web session' });
  }
});

router.get('/qr-stream/:accountId', requireAuth, async (req, res) => {
  try {
    const { accountId } = req.params;
    const userId = req.user!.id;
    const tenantId = (req as any).tenantId || req.session?.activeTenantId;

    const account = await db.query.whatsappAccounts.findFirst({
      where: and(
        eq(whatsappAccounts.id, accountId),
        eq(whatsappAccounts.userId, userId),
        eq(whatsappAccounts.tenantId, tenantId)
      ),
    });

    if (!account) {
      return res.status(404).json({ error: 'Account not found or unauthorized' });
    }

    const environment = account.environment;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const sendEvent = (eventType: string, data: any) => {
      res.write(`event: ${eventType}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    sendEvent('connected', { message: 'Waiting for QR code...' });

    const pollInterval = setInterval(async () => {
      try {
        // Check if the account still exists (might have been merged)
        const account = await db.query.whatsappAccounts.findFirst({
          where: eq(whatsappAccounts.id, accountId),
        });

        if (!account) {
          // Account was deleted (likely merged), try to find the session by looking for
          // a session that was recently updated for this tenant
          const recentSession = await db.query.whatsappWebSessions.findFirst({
            where: and(
              eq(whatsappWebSessions.tenantId, tenantId),
              eq(whatsappWebSessions.environment, environment)
            ),
            orderBy: (sessions, { desc }) => [desc(sessions.updatedAt)],
          });

          if (recentSession && recentSession.status === 'ready') {
            console.log(`[WhatsApp Web QR Stream] Account ${accountId} was merged, found session ${recentSession.accountId}`);
            sendEvent('authenticated', { 
              phoneNumber: recentSession.phoneNumber,
              status: 'ready',
            });
            clearInterval(pollInterval);
            res.end();
            return;
          }
        }

        const session = await db.query.whatsappWebSessions.findFirst({
          where: eq(whatsappWebSessions.accountId, accountId),
        });

        console.log(`[WhatsApp Web QR Stream] Polling for ${accountId}, found:`, session ? {
          status: session.status,
          hasQR: !!session.qrCode,
          qrLength: session.qrCode?.length
        } : 'NO SESSION');

        if (!session) {
          sendEvent('waiting', { status: 'connecting' });
          return;
        }

        if (session.qrCode) {
          console.log(`[WhatsApp Web QR Stream] Sending QR code for ${accountId}`);
          sendEvent('qr', { qr: session.qrCode });
        }

        if (session.status === 'ready') {
          sendEvent('authenticated', { 
            phoneNumber: session.phoneNumber,
            status: 'ready',
          });
          clearInterval(pollInterval);
          res.end();
        }

        if (session.status === 'error') {
          sendEvent('error', { 
            error: session.errorMessage || 'Unknown error',
          });
          clearInterval(pollInterval);
          res.end();
        }

        if (session.status === 'disconnected') {
          sendEvent('disconnected', { 
            message: 'Session disconnected',
          });
          clearInterval(pollInterval);
          res.end();
        }
      } catch (error) {
        console.error('[WhatsApp Web API] Error polling session:', error);
      }
    }, 1000);

    req.on('close', () => {
      clearInterval(pollInterval);
      res.end();
    });

  } catch (error: any) {
    console.error('[WhatsApp Web API] Error in QR stream:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/reconnect/:accountId', requireAuth, async (req, res) => {
  try {
    const { accountId } = req.params;
    const userId = req.user!.id;
    const tenantId = (req as any).tenantId || req.session?.activeTenantId;

    const account = await db.query.whatsappAccounts.findFirst({
      where: and(
        eq(whatsappAccounts.id, accountId),
        eq(whatsappAccounts.userId, userId),
        eq(whatsappAccounts.tenantId, tenantId)
      ),
    });

    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    if (account.connectionType !== 'web-connector') {
      return res.status(400).json({ error: 'Only web-connector accounts can be reconnected' });
    }

    const workerUrl = process.env.WORKER_URL || 'http://localhost:3001';
    
    try {
      await axios.post(`${workerUrl}/whatsapp-web/session`, {
        accountId: account.id,
        userId,
        tenantId,
        environment: account.environment,
      });
    } catch (error: any) {
      console.error('[WhatsApp Web] Failed to reconnect session in worker:', error);
      return res.status(500).json({ 
        error: error.response?.data?.error || error.message || 'Failed to reconnect session' 
      });
    }

    res.json({ 
      success: true, 
      accountId: account.id,
      message: 'WhatsApp Web session reconnected. Scan the QR code to connect.',
    });
  } catch (error: any) {
    console.error('[WhatsApp Web API] Error reconnecting:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/disconnect/:accountId', requireAuth, async (req, res) => {
  try {
    const { accountId } = req.params;
    const userId = req.user!.id;
    const tenantId = (req as any).tenantId || req.session?.activeTenantId;

    const account = await db.query.whatsappAccounts.findFirst({
      where: and(
        eq(whatsappAccounts.id, accountId),
        eq(whatsappAccounts.userId, userId),
        eq(whatsappAccounts.tenantId, tenantId)
      ),
    });

    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    const workerUrl = process.env.WORKER_URL || 'http://localhost:3001';
    
    try {
      await axios.post(`${workerUrl}/whatsapp-web/disconnect`, { accountId });
    } catch (error) {
      console.error('[WhatsApp Web] Failed to disconnect session in worker:', error);
    }

    await db.update(whatsappAccounts)
      .set({ 
        isActive: false,
        updatedAt: new Date(),
      })
      .where(eq(whatsappAccounts.id, accountId));

    res.json({ success: true, message: 'WhatsApp Web session disconnected' });
  } catch (error: any) {
    console.error('[WhatsApp Web API] Error disconnecting:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/status/:accountId', requireAuth, async (req, res) => {
  try {
    const { accountId } = req.params;
    const userId = req.user!.id;
    const tenantId = (req as any).tenantId || req.session?.activeTenantId;

    const account = await db.query.whatsappAccounts.findFirst({
      where: and(
        eq(whatsappAccounts.id, accountId),
        eq(whatsappAccounts.userId, userId),
        eq(whatsappAccounts.tenantId, tenantId)
      ),
    });

    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    const session = await db.query.whatsappWebSessions.findFirst({
      where: eq(whatsappWebSessions.accountId, accountId),
    });

    if (!session) {
      return res.json({ 
        accountId,
        status: 'not_connected',
        connectionType: account.connectionType,
      });
    }

    res.json({
      accountId,
      status: session.status,
      phoneNumber: session.phoneNumber,
      connectedAt: session.connectedAt,
      lastSeenAt: session.lastSeenAt,
      connectionType: account.connectionType,
      errorMessage: session.errorMessage,
    });
  } catch (error: any) {
    console.error('[WhatsApp Web API] Error getting status:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/sync/:accountId', requireAuth, async (req, res) => {
  try {
    const { accountId } = req.params;
    const userId = req.user!.id;
    const tenantId = (req as any).tenantId || req.session?.activeTenantId;
    const { phoneNumbers } = req.body; // Array of phone numbers to sync

    if (!phoneNumbers || !Array.isArray(phoneNumbers) || phoneNumbers.length === 0) {
      return res.status(400).json({ error: 'phoneNumbers array is required and must not be empty' });
    }

    const account = await db.query.whatsappAccounts.findFirst({
      where: and(
        eq(whatsappAccounts.id, accountId),
        eq(whatsappAccounts.userId, userId),
        eq(whatsappAccounts.tenantId, tenantId)
      ),
    });

    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    if (account.connectionType !== 'web-connector') {
      return res.status(400).json({ error: 'Only web-connector accounts can sync history' });
    }

    const workerUrl = process.env.WORKER_URL || 'http://localhost:3001';
    
    try {
      const response = await axios.post(`${workerUrl}/whatsapp-web/sync-history`, {
        accountId: account.id,
        phoneNumbers,
        messagesPerChat: req.body.messagesPerChat || 50, // Messages to sync per number
      });

      res.json(response.data);
    } catch (error: any) {
      console.error('[WhatsApp Web] Failed to sync history in worker:', error);
      return res.status(500).json({ 
        error: error.response?.data?.error || error.message || 'Failed to sync chat history' 
      });
    }
  } catch (error: any) {
    console.error('[WhatsApp Web API] Error syncing history:', error);
    res.status(500).json({ error: error.message });
  }
});

// Proxy route for replying to messages
router.post('/reply', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const tenantId = (req as any).tenantId || req.session?.activeTenantId;
    const { accountId, chatId, text, quotedMessageId } = req.body;

    const account = await db.query.whatsappAccounts.findFirst({
      where: and(
        eq(whatsappAccounts.id, accountId),
        eq(whatsappAccounts.userId, userId),
        eq(whatsappAccounts.tenantId, tenantId)
      ),
    });

    if (!account || account.connectionType !== 'web-connector') {
      return res.status(404).json({ error: 'Web-connector account not found' });
    }

    const workerUrl = process.env.WORKER_URL || 'http://localhost:3001';
    const response = await axios.post(`${workerUrl}/whatsapp-web/send-reply`, {
      accountId,
      chatId,
      text,
      quotedMessageId,
    });

    res.json(response.data);
  } catch (error: any) {
    console.error('[WhatsApp Web API] Error sending reply:', error);
    res.status(500).json({ error: error.message || 'Failed to send reply' });
  }
});

// Proxy route for forwarding messages
router.post('/forward', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const tenantId = (req as any).tenantId || req.session?.activeTenantId;
    const { accountId, messageId, toChatId } = req.body;

    const account = await db.query.whatsappAccounts.findFirst({
      where: and(
        eq(whatsappAccounts.id, accountId),
        eq(whatsappAccounts.userId, userId),
        eq(whatsappAccounts.tenantId, tenantId)
      ),
    });

    if (!account || account.connectionType !== 'web-connector') {
      return res.status(404).json({ error: 'Web-connector account not found' });
    }

    const workerUrl = process.env.WORKER_URL || 'http://localhost:3001';
    const response = await axios.post(`${workerUrl}/whatsapp-web/forward-message`, {
      accountId,
      messageId,
      toChatId,
    });

    res.json(response.data);
  } catch (error: any) {
    console.error('[WhatsApp Web API] Error forwarding message:', error);
    res.status(500).json({ error: error.message || 'Failed to forward message' });
  }
});

// Proxy route for starring messages
router.post('/star-message', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const tenantId = (req as any).tenantId || req.session?.activeTenantId;
    const { accountId, messageId } = req.body;

    const account = await db.query.whatsappAccounts.findFirst({
      where: and(
        eq(whatsappAccounts.id, accountId),
        eq(whatsappAccounts.userId, userId),
        eq(whatsappAccounts.tenantId, tenantId)
      ),
    });

    if (!account || account.connectionType !== 'web-connector') {
      return res.status(404).json({ error: 'Web-connector account not found' });
    }

    const workerUrl = process.env.WORKER_URL || 'http://localhost:3001';
    const response = await axios.post(`${workerUrl}/whatsapp-web/star-message`, {
      accountId,
      messageId,
    });

    res.json(response.data);
  } catch (error: any) {
    console.error('[WhatsApp Web API] Error starring message:', error);
    res.status(500).json({ error: error.message || 'Failed to star message' });
  }
});

// Proxy route for sending polls
router.post('/poll', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const tenantId = (req as any).tenantId || req.session?.activeTenantId;
    const { accountId, chatId, question, options, allowMultipleAnswers } = req.body;

    const account = await db.query.whatsappAccounts.findFirst({
      where: and(
        eq(whatsappAccounts.id, accountId),
        eq(whatsappAccounts.userId, userId),
        eq(whatsappAccounts.tenantId, tenantId)
      ),
    });

    if (!account || account.connectionType !== 'web-connector') {
      return res.status(404).json({ error: 'Web-connector account not found' });
    }

    const workerUrl = process.env.WORKER_URL || 'http://localhost:3001';
    const response = await axios.post(`${workerUrl}/whatsapp-web/send-poll`, {
      accountId,
      chatId,
      question,
      options,
      allowMultipleAnswers,
    });

    res.json(response.data);
  } catch (error: any) {
    console.error('[WhatsApp Web API] Error sending poll:', error);
    res.status(500).json({ error: error.message || 'Failed to send poll' });
  }
});

// Proxy route for deleting messages for everyone
router.delete('/message-for-everyone', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const tenantId = (req as any).tenantId || req.session?.activeTenantId;
    const { accountId, messageId } = req.body;

    const account = await db.query.whatsappAccounts.findFirst({
      where: and(
        eq(whatsappAccounts.id, accountId),
        eq(whatsappAccounts.userId, userId),
        eq(whatsappAccounts.tenantId, tenantId)
      ),
    });

    if (!account || account.connectionType !== 'web-connector') {
      return res.status(404).json({ error: 'Web-connector account not found' });
    }

    const workerUrl = process.env.WORKER_URL || 'http://localhost:3001';
    const response = await axios.delete(`${workerUrl}/whatsapp-web/message-for-everyone`, {
      data: { accountId, messageId },
    });

    res.json(response.data);
  } catch (error: any) {
    console.error('[WhatsApp Web API] Error deleting message:', error);
    res.status(500).json({ error: error.message || 'Failed to delete message' });
  }
});

// Proxy route for conversation actions (archive, mute, pin, etc.)
router.post('/conversation-action/:action', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const tenantId = (req as any).tenantId || req.session?.activeTenantId;
    const { action } = req.params;
    const { accountId, chatId, duration } = req.body;

    const account = await db.query.whatsappAccounts.findFirst({
      where: and(
        eq(whatsappAccounts.id, accountId),
        eq(whatsappAccounts.userId, userId),
        eq(whatsappAccounts.tenantId, tenantId)
      ),
    });

    if (!account || account.connectionType !== 'web-connector') {
      return res.status(404).json({ error: 'Web-connector account not found' });
    }

    const workerUrl = process.env.WORKER_URL || 'http://localhost:3001';
    
    // Map action to worker endpoint
    let endpoint = `/whatsapp-web/${action}-chat`;
    let method = 'POST';
    let data: any = { accountId, chatId, duration };
    
    // Special handling for delete action
    if (action === 'delete') {
      endpoint = `/whatsapp-web/chat/${accountId}/${chatId}`;
      method = 'DELETE';
      data = undefined;
    }
    
    const response = method === 'DELETE'
      ? await axios.delete(`${workerUrl}${endpoint}`)
      : await axios.post(`${workerUrl}${endpoint}`, data);

    res.json(response.data);
  } catch (error: any) {
    console.error('[WhatsApp Web API] Error with conversation action:', error);
    res.status(500).json({ error: error.message || 'Failed to perform action' });
  }
});

// Proxy route for typing indicator
router.post('/typing', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const tenantId = (req as any).tenantId || req.session?.activeTenantId;
    const { accountId, chatId, isTyping } = req.body;

    const account = await db.query.whatsappAccounts.findFirst({
      where: and(
        eq(whatsappAccounts.id, accountId),
        eq(whatsappAccounts.userId, userId),
        eq(whatsappAccounts.tenantId, tenantId)
      ),
    });

    if (!account || account.connectionType !== 'web-connector') {
      return res.status(404).json({ error: 'Web-connector account not found' });
    }

    const workerUrl = process.env.WORKER_URL || 'http://localhost:3001';
    const response = await axios.post(`${workerUrl}/whatsapp-web/send-typing`, {
      accountId,
      chatId,
      isTyping,
    });

    res.json(response.data);
  } catch (error: any) {
    console.error('[WhatsApp Web API] Error sending typing indicator:', error);
    res.status(500).json({ error: error.message || 'Failed to send typing indicator' });
  }
});

export default router;
