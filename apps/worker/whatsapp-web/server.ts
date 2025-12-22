import express from 'express';
import { sessionManager } from './session-manager';
import whatsappWebApiRoutes from './api';

const app = express();
app.use(express.json());

const PORT = process.env.WORKER_PORT || 3001;

// Mount WhatsApp Web API routes
app.use('/whatsapp-web', whatsappWebApiRoutes);

app.post('/whatsapp-web/session', async (req, res) => {
  try {
    const { accountId, userId, tenantId, environment } = req.body;

    if (!accountId || !userId || !tenantId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const session = await sessionManager.createSession({
      accountId,
      userId,
      tenantId,
      environment: environment || 'development',
    });

    res.json({ 
      success: true, 
      session: {
        accountId: session.accountId,
        status: session.status,
      },
    });
  } catch (error: any) {
    console.error('[Worker Server] Error creating session:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/whatsapp-web/disconnect', async (req, res) => {
  try {
    const { accountId } = req.body;

    if (!accountId) {
      return res.status(400).json({ error: 'accountId is required' });
    }

    await sessionManager.destroySession(accountId);

    res.json({ success: true });
  } catch (error: any) {
    console.error('[Worker Server] Error disconnecting session:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/whatsapp-web/status/:accountId', async (req, res) => {
  try {
    const { accountId } = req.params;

    const status = await sessionManager.getSessionStatus(accountId);

    if (!status) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json(status);
  } catch (error: any) {
    console.error('[Worker Server] Error getting status:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/whatsapp-web/force-recover/:accountId', async (req, res) => {
  try {
    const { accountId } = req.params;

    console.log(`[Worker Server] Force recovery requested for ${accountId}`);

    // Destroy existing session if any
    await sessionManager.destroySession(accountId);

    // Wait a moment for cleanup
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Get session details from database
    const { db } = await import('../db');
    const { whatsappWebSessions } = await import('@shared/schema');
    const { eq } = await import('drizzle-orm');

    const session = await db.query.whatsappWebSessions.findFirst({
      where: eq(whatsappWebSessions.accountId, accountId),
    });

    if (!session) {
      return res.status(404).json({ error: 'Session not found in database' });
    }

    // Recreate session (will start fresh)
    const newSession = await sessionManager.createSession({
      accountId: session.accountId,
      userId: session.userId,
      tenantId: session.tenantId,
      environment: session.environment,
    });

    res.json({ 
      success: true, 
      message: 'Session force-recovered. Scan QR code to reconnect.',
      session: {
        accountId: newSession.accountId,
        status: newSession.status,
      },
    });
  } catch (error: any) {
    console.error('[Worker Server] Error force-recovering session:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/whatsapp-web/metrics', (req, res) => {
  const sessions = sessionManager.getAllSessions();
  const memoryUsage = process.memoryUsage();
  
  res.json({
    sessions: {
      total: sessions.length,
      active: sessions.filter(s => s.status === 'ready').length,
      connecting: sessions.filter(s => s.status === 'connecting').length,
      error: sessions.filter(s => s.status === 'error').length,
      statuses: sessions.reduce((acc: Record<string, number>, s) => {
        acc[s.status] = (acc[s.status] || 0) + 1;
        return acc;
      }, {})
    },
    memory: {
      heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024) + ' MB',
      heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024) + ' MB',
      rss: Math.round(memoryUsage.rss / 1024 / 1024) + ' MB',
      external: Math.round(memoryUsage.external / 1024 / 1024) + ' MB',
    },
    cpu: process.cpuUsage(),
    uptime: Math.round(process.uptime()) + ' seconds',
    timestamp: new Date().toISOString(),
  });
});

export function startWhatsAppWebServer(): void {
  app.listen(PORT, () => {
    console.log(`[Worker Server] WhatsApp Web server listening on port ${PORT}`);
  });
}
