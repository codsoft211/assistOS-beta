import "../load-env";
import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import pg from "pg";
import passport from "../apps/api/config/passport";
import { tenantMiddleware } from "../apps/api/middleware/tenant-middleware";
import pinoHttp from "pino-http";
import logger from "../apps/api/logger";
import { randomUUID } from "crypto";
import { setupVite, serveStatic, log } from "./vite";
import { registerRoutes } from "./routes";
import "../packages/modules/register-modules.js";
import { syncAllCatalogs } from "../packages/platform/startup/sync-catalogs";
import { bootstrapCoreAssets } from "../apps/api/bootstrap/core-assets-bootstrap";
import { startRedisEventBridge } from "../apps/api/services/redis-event-bus";

const app = express();

app.set('trust proxy', true);

// Request ID middleware
app.use((req, res, next) => {
  req.id = req.headers['x-request-id'] as string || randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
});

// Pino HTTP logger
app.use(pinoHttp({
  logger,
  genReqId: (req) => req.id,
  customLogLevel: (req, res, err) => {
    if (res.statusCode >= 500 || err) {
      return 'error';
    } else if (res.statusCode >= 400) {
      return 'warn';
    }
    return 'info';
  },
  customSuccessMessage: (req, res) => {
    return `${req.method} ${req.url} ${res.statusCode}`;
  },
  customErrorMessage: (req, res, err) => {
    return `${req.method} ${req.url} ${res.statusCode} - ${err.message}`;
  },
  serializers: {
    req: (req) => ({
      id: req.id,
      method: req.method,
      url: req.url,
      headers: {
        host: req.headers.host,
        'user-agent': req.headers['user-agent'],
      },
    }),
    res: (res) => ({
      statusCode: res.statusCode,
    }),
  },
}));

// IMPORTANT: Stripe webhook needs raw body BEFORE JSON parsing and BEFORE tenant middleware
// Register webhook route first (it has its own raw body middleware)
// Also register at /api/stripe/webhook for Stripe CLI compatibility
import stripeWebhookRoutes from "../apps/api/routes/billing/stripe-webhook";
app.use("/api/billing/stripe", stripeWebhookRoutes);
app.use("/api/stripe", stripeWebhookRoutes); // Also register at /api/stripe for Stripe CLI

// Now register body parsers for all other routes
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Serve WhatsApp Web media files from local storage
// IMPORTANT: Register BEFORE routes to avoid conflicts
import path from "path";
const storagePath = path.join(process.cwd(), 'storage');
log(`[Server] Serving static files from: ${storagePath}`);
app.use('/storage', express.static(storagePath));

// Security: Require strong session secret in production
if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
  throw new Error(
    'SESSION_SECRET must be set in production. Generate a strong secret: openssl rand -base64 32'
  );
}

const sessionSecret = process.env.SESSION_SECRET || 'dev-secret-key-only-for-development';

// Configure PostgreSQL session store
// Use SUPABASE_DATABASE_URL with priority to avoid Replit's automatic DATABASE_URL injection
const databaseUrl = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;
const PgSession = connectPgSimple(session);
const sessionPool = new pg.Pool({
  connectionString: databaseUrl,
});

// Detect if running in Replit
const isReplit = !!process.env.REPL_ID || !!process.env.REPL_SLUG;
const isProduction = process.env.NODE_ENV === 'production';

const cookieDomain = process.env.SESSION_COOKIE_DOMAIN || undefined;

if (cookieDomain) {
  logger.info({ cookieDomain }, 'Session cookie domain configured');
}

app.use(
  session({
    store: new PgSession({
      pool: sessionPool,
      tableName: 'user_sessions',
      createTableIfMissing: true,
    }),
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: isProduction || isReplit,
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
      sameSite: isReplit ? 'none' : 'lax',
      domain: cookieDomain,
    },
  })
);

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// Apply tenant middleware to all API routes EXCEPT webhooks and public invitation routes
// Webhooks are handled by Stripe signature verification, not session auth
// Invitation routes are public (users need to view/accept invites before registering)
app.use("/api", (req, res, next) => {
  console.log('[Server Middleware] Checking path:', req.path, 'URL:', req.url);
  // Skip tenant middleware for Stripe webhooks
  if (req.path.startsWith("/billing/stripe/webhook") || req.path.startsWith("/stripe/webhook")) {
    console.log('[Server Middleware] Skipping for webhook');
    return next();
  }
  // Skip tenant middleware for public invitation routes (GET details, GET by token, POST accept, POST decline)
  // Note: DELETE /invitations/:id/revoke requires auth and is handled in the route itself
  if (req.path.startsWith("/invitations/") && (req.method === 'GET' || req.method === 'POST')) {
    console.log('[Server Middleware] Skipping tenantMiddleware for public invitation route:', req.path);
    return next();
  }
  console.log('[Server Middleware] Applying tenantMiddleware to:', req.path);
  return tenantMiddleware(req, res, next);
});

// Placeholder for routes (will be migrated)
app.get("/api", (req, res) => {
  res.json({ 
    message: "AssistOS API - Migration in Progress",
    version: "2.0.0-alpha",
    pillars: ["AssistME", "AssistBuild", "Self-Evolving Platform"]
  });
});

// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  logger.error({ err, req: { id: req.id, method: req.method, url: req.url } }, 'Unhandled error');
  res.status(500).json({ error: 'Internal server error', requestId: req.id });
});

// Register API routes and setup Vite
(async () => {
  const server = await registerRoutes(app);
  
  // Setup Vite dev server or serve static files
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const PORT = process.env.PORT || 5000;
  
  // 🛡️ GRACEFUL SHUTDOWN - Prevents EADDRINUSE on restart
  let gmailSyncServiceInstance: any = null;
  let opportunityRulesCronInstance: any = null;
  
  const shutdown = async (signal: string) => {
    logger.info({ signal }, '🛑 Received shutdown signal - starting graceful shutdown');
    
    try {
      // 1. Stop accepting new connections
      logger.info('🛑 Closing HTTP server...');
      server.close(() => {
        logger.info('✅ HTTP server closed');
      });
      
      // 2. Stop cron jobs
      if (gmailSyncServiceInstance) {
        logger.info('🛑 Stopping Gmail sync cron job...');
        gmailSyncServiceInstance.stop();
      }
      
      if (opportunityRulesCronInstance) {
        logger.info('🛑 Stopping Opportunity Rules cron job...');
        opportunityRulesCronInstance.stop();
      }
      
      // 3. Close database connections (Drizzle closes automatically on process exit)
      logger.info('✅ Database connections will close automatically');
      
      // 4. Wait briefly for pending requests to complete
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      logger.info('✅ Graceful shutdown complete');
      process.exit(0);
    } catch (error) {
      logger.error({ error }, '❌ Error during shutdown');
      process.exit(1);
    }
  };
  
  // Register shutdown handlers
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  
  server.listen(PORT, async () => {
    logger.info({ port: PORT, env: app.get("env") }, 'AssistOS server started');

    // 🛡️ CORE PROTECTION: Bootstrap core assets (non-blocking)
    bootstrapCoreAssets()
      .then(() => logger.info('[Bootstrap] Core assets protection active ✅'))
      .catch((error) => logger.error({ error }, '[Bootstrap] Core assets failed - non-critical'));
    
    // Sync platform catalogs (modules, agents, workflows) - non-blocking
    syncAllCatalogs()
      .then(() => logger.info('[Catalogs] Platform catalogs synced ✅'))
      .catch((error) => logger.error({ error }, '[Catalogs] Failed to sync - non-critical'));
    
    // FASE 3.5-3.8: Start Gmail auto-sync cron job with dynamic tenant settings
    try {
      logger.info('[Gmail Sync] Loading gmail-sync service...');
      const module = await import('../apps/api/services/cron/gmail-sync.service.js');
      logger.info({ module: Object.keys(module) }, '[Gmail Sync] Module loaded');
      
      const { gmailSyncService } = module;
      if (!gmailSyncService) {
        throw new Error('gmailSyncService not found in module exports');
      }
      
      gmailSyncServiceInstance = gmailSyncService;
      gmailSyncService.start('*/5 * * * *'); // FASE 3.8: Every 5 minutes - respects per-tenant interval
      logger.info('[Gmail Sync] Auto-sync cron job started (5 min check) - respects per-tenant sync intervals');
    } catch (error: unknown) {
      const err = error as Error;
      logger.error({ error: err.message, stack: err.stack }, '[Gmail Sync] Failed to start cron job');
    }

    // CRM Module: Start Opportunity Rules auto-evaluation cron job
    try {
      logger.info('[OpportunityRules] Loading opportunity-rules service...');
      const module = await import('../apps/api/services/cron/opportunity-rules.service.js');
      
      const { opportunityRulesCron } = module;
      if (!opportunityRulesCron) {
        throw new Error('opportunityRulesCron not found in module exports');
      }
      
      opportunityRulesCronInstance = opportunityRulesCron;
      opportunityRulesCron.start('0 2 * * *'); // Daily at 2:00 AM
      logger.info('[OpportunityRules] Auto-evaluation cron job started (daily at 2:00 AM)');
    } catch (error: unknown) {
      const err = error as Error;
      logger.error({ error: err.message, stack: err.stack }, '[OpportunityRules] Failed to start cron job');
    }

    // Start Redis Event Bridge for cross-process real-time events
    // This allows worker process to publish events that reach API server SSE connections
    console.log('[Server] Starting Redis Event Bridge...');
    startRedisEventBridge();
    console.log('[Server] Redis Event Bridge initialization called');
  });
})();

export default app;
