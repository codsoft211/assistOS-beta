import '../load-env';
// CRITICAL: Initialize Sentry FIRST (before any other imports)
import { Sentry } from "./sentry.js";

import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import pg from "pg";
import passport from "./config/passport.js";
import { tenantMiddleware } from "./middleware/tenant-middleware.js";
import { requestContext } from "./middleware/request-context.js";
import { registerRoutes } from "./routes.js";
import healthRoutes from "./routes/health.js";
import pinoHttp from "pino-http";
import logger from "./logger.js";
import { randomUUID } from "crypto";
import { eventBus } from "../../packages/execution/index.js";
import cron from "node-cron";
import { notificationCenterService } from "../../packages/platform/notification-center/index.js";
import { digestService } from "../../packages/platform/notification-center/index.js";
import path from "path";
// CRITICAL: Register all modules on boot
import "../../packages/modules/register-modules.js";
// CRITICAL: Register all document processors on boot
import "../../packages/document-processing/registry/register-processors.js";
// CRITICAL: Initialize BullMQ queues on boot
import "./queues/assistbuild.js";
// CRITICAL: Bootstrap core assets protection on startup
import { bootstrapCoreAssets } from "./bootstrap/core-assets-bootstrap.js";
import { startRedisEventBridge } from "./services/redis-event-bus.js";

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

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Serve WhatsApp Web media files from local storage
// Use absolute path to ensure correct resolution regardless of working directory
const storagePath = path.join(process.cwd(), 'storage');
console.log(`[Server] Serving static files from: ${storagePath}`);
app.use('/storage', express.static(storagePath));

// Security: Require strong session secret in production
if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
  throw new Error(
    'SESSION_SECRET must be set in production. Generate a strong secret: openssl rand -base64 32'
  );
}

const sessionSecret = process.env.SESSION_SECRET || 'dev-secret-key-only-for-development';

// Configure PostgreSQL session store
const PgSession = connectPgSimple(session);
const sessionPool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
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

// Request Context Middleware - Enriches req.log with tenant/user context
// MUST run after passport (for user context) and will pick up tenant context from routes
app.use(requestContext);

// ==================== HEALTH CHECKS ====================
// CRITICAL: Register health routes WITHOUT any middleware (no auth, no tenant)
// Used by load balancers, monitoring systems, and K8s probes
app.use("/api/health", healthRoutes);

// Register all API routes (Phase 4.1 migration)
// NOTE: tenantMiddleware is now applied per-route in registerRoutes()
registerRoutes(app);

// Placeholder for legacy routes (being migrated)
app.get("/api", (req, res) => {
  res.json({ 
    message: "AssistOS API - Migration in Progress",
    version: "2.0.0-alpha",
    pillars: ["AssistME", "AssistBuild", "Self-Evolving Platform"]
  });
});

// Sentry error handler (MUST be before other error handlers)
// v8 API: setupExpressErrorHandler auto-captures all errors
Sentry.setupExpressErrorHandler(app);

// Custom error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  logger.error({ err, req: { id: req.id, method: req.method, url: req.url } }, 'Unhandled error');
  // Return Sentry event ID to help with debugging
  const sentryId = (res as any).sentry;
  res.status(500).json({ error: 'Internal server error', requestId: req.id, sentryId });
});

const PORT = process.env.PORT || 5000;

// Don't start server in test mode (tests will import the app without listening)
let server: any;

// DIAGNOSTIC: Verify module loads
logger.info({ nodeEnv: process.env.NODE_ENV }, '[DIAGNOSTIC] index.ts module loaded');

if (process.env.NODE_ENV !== 'test') {
  // Start server immediately - don't block on bootstrap
  server = app.listen(PORT, () => {
    logger.info({ port: PORT }, 'AssistOS API server started');
    
    // Start Event Bus for automation triggers
    eventBus.start(5000); // 5-second polling interval
    logger.info('Event Bus started');
    
    // Start Redis Event Bridge for cross-process real-time events
    // This allows worker process to publish events that reach API server SSE connections
    console.log('[API Server] Starting Redis Event Bridge...');
    startRedisEventBridge();
    console.log('[API Server] Redis Event Bridge initialization called');
    
    // Run bootstrap asynchronously (non-blocking) after server starts
    bootstrapCoreAssets()
      .then(() => logger.info('[Bootstrap] Core assets sync completed'))
      .catch((err) => logger.warn({ error: err.message }, '[Bootstrap] Core assets sync failed - non-critical'));
    
    // ==================== NOTIFICATION CENTER CRON JOBS ====================
    // CRITICAL FIX: Prevent race conditions in multi-instance deployments
    // TODO: Implement distributed locking (Redis-based) before enabling in production
    
    if (process.env.ENABLE_CRON_JOBS === 'true') {
      logger.info('[Cron] Cron jobs enabled - scheduling notification tasks');
      
      // ==================== BACKUP MONITORING CRON JOB ====================
      const { scheduleBackupMonitoring } = require('./services/cron/backup-monitoring.cron');
      scheduleBackupMonitoring();
      logger.info('[Cron] Backup monitoring cron job initialized');
      
      // ==================== QUEUE MONITORING CRON JOB ====================
      const { startQueueMonitoringCron } = require('./services/cron/queue-monitoring.cron');
      startQueueMonitoringCron();
      logger.info('[Cron] Queue monitoring cron job initialized');
      
      // Cleanup expired notifications every hour
      cron.schedule('0 * * * *', async () => {
        try {
          logger.info('[Cron] Running notification cleanup');
          const count = await notificationCenterService.cleanupExpiredNotifications();
          logger.info(`[Cron] Notification cleanup completed: ${count} expired notifications removed`);
        } catch (error: any) {
          logger.error('[Cron] Error in notification cleanup:', error);
        }
      });
      logger.info('[Cron] Notification cleanup cron job scheduled (every hour)');
      
      // Send daily digests at 8 AM
      cron.schedule('0 8 * * *', async () => {
        try {
          logger.info('[Cron] Running daily digests');
          await digestService.createDailyDigests();
          logger.info('[Cron] Daily digest generation completed');
        } catch (error: any) {
          logger.error('[Cron] Error generating daily digests:', error);
        }
      });
      logger.info('[Cron] Daily digest cron job scheduled (8 AM daily)');
      
      // Send weekly digests on Monday at 8 AM
      cron.schedule('0 8 * * 1', async () => {
        try {
          logger.info('[Cron] Running weekly digests');
          await digestService.createWeeklyDigests();
          logger.info('[Cron] Weekly digest generation completed');
        } catch (error: any) {
          logger.error('[Cron] Error generating weekly digests:', error);
        }
      });
      logger.info('[Cron] Weekly digest cron job scheduled (8 AM every Monday)');
    } else {
      logger.info('[Cron] Cron jobs disabled (ENABLE_CRON_JOBS != true)');
      logger.info('[Cron] Set ENABLE_CRON_JOBS=true on ONE instance only to enable scheduled tasks');
      logger.info('[Cron] This prevents race conditions and duplicate notifications in multi-instance deployments');
    }
  });
}

// Graceful shutdown
const shutdown = () => {
  logger.info('Shutting down gracefully...');
  
  // Stop Event Bus
  eventBus.stop();
  logger.info('Event Bus stopped');
  
  // Close server (only if it exists)
  if (server) {
    server.close(() => {
      logger.info('Server closed');
      
      // Close database pool
      sessionPool.end(() => {
        logger.info('Database pool closed');
        process.exit(0);
      });
    });
  } else {
    // No server to close (test mode)
    sessionPool.end(() => {
      logger.info('Database pool closed');
      process.exit(0);
    });
  }
  
  // Force exit after 10 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Capture unhandled promise rejections
process.on('unhandledRejection', (error: Error) => {
  logger.error({ error }, 'Unhandled promise rejection');
  Sentry.captureException(error);
});

// Capture uncaught exceptions
process.on('uncaughtException', (error: Error) => {
  logger.error({ error }, 'Uncaught exception');
  Sentry.captureException(error);
  // Exit process after capturing exception
  process.exit(1);
});

export default app;
