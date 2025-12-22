/**
 * Sentry Configuration for AssistOS Workers
 * Error tracking for BullMQ background jobs
 */

import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

const isProduction = process.env.NODE_ENV === 'production';
const sentryDsn = process.env.SENTRY_DSN;

if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: process.env.NODE_ENV || 'development',
    
    // Environment-tagged release tracking
    // Format: assistos-<service>@<version>-<environment>
    // Examples: assistos-worker@1.2.3-production, assistos-worker@dev-development
    release: `assistos-${process.env.SERVICE_NAME || 'worker'}@${process.env.APP_VERSION || process.env.COMMIT_SHA || 'dev'}-${process.env.NODE_ENV || 'development'}`,
    
    integrations: [
      nodeProfilingIntegration(),
    ],

    // Performance Monitoring (aligned with API: 10% prod)
    tracesSampleRate: isProduction ? 0.1 : 1.0,
    
    // Profiling (aligned with API: 10% prod)
    profilesSampleRate: isProduction ? 0.1 : 1.0,

    // Context enrichment for jobs
    beforeSend(event, hint) {
      // Add job context if available
      const error = hint.originalException as any;
      if (error?.jobId) {
        event.tags = {
          ...event.tags,
          jobId: error.jobId,
          jobName: error.jobName,
        };
      }
      return event;
    },
  });

  console.log(`[Sentry] Worker initialized for ${process.env.NODE_ENV} environment`);
} else {
  console.warn('[Sentry] SENTRY_DSN not found, error tracking disabled');
}

export { Sentry };
