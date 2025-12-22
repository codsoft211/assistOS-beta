/**
 * Sentry Configuration for AssistOS API
 * Error tracking, performance monitoring, and profiling
 * 
 * Using Sentry v8 API (2024)
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
    // Examples: assistos-api@1.2.3-production, assistos-api@dev-development
    release: `assistos-${process.env.SERVICE_NAME || 'api'}@${process.env.APP_VERSION || process.env.COMMIT_SHA || 'dev'}-${process.env.NODE_ENV || 'development'}`,
    
    integrations: [
      nodeProfilingIntegration(),
    ],

    // Performance Monitoring
    tracesSampleRate: isProduction ? 0.1 : 1.0, // 10% em produção, 100% em dev
    
    // Profiling
    profilesSampleRate: isProduction ? 0.1 : 1.0,

    // Capture user IP & request headers
    sendDefaultPii: true,

    // Error filtering
    beforeSend(event, hint) {
      // Don't send 404s or favicon requests to Sentry
      if (event.request?.url?.includes('/favicon.ico')) {
        return null;
      }
      return event;
    },

    // Context enrichment
    beforeBreadcrumb(breadcrumb) {
      // Filter out noisy breadcrumbs
      if (breadcrumb.category === 'console' && breadcrumb.level === 'log') {
        return null;
      }
      return breadcrumb;
    },
  });

  // Sentry initialized successfully (check /api/health/sentry-test to verify)
} else {
  console.warn('[Sentry] SENTRY_DSN not found, error tracking disabled');
}

export { Sentry };
