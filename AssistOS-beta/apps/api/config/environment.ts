/**
 * Environment configuration
 * Centralizes URL and domain management for dev/production
 */

/**
 * Get the base URL for the application
 * Priority:
 * 1. Published deployment - assistos.replit.app
 * 2. Replit workspace domain
 * 3. Localhost (local development)
 */
export function getBaseUrl(): string {
  // DEBUG: Log ALL relevant environment variables
  console.log('[Environment] 🔍 REPL_SLUG:', process.env.REPL_SLUG);
  console.log('[Environment] 🔍 REPLIT_DOMAINS:', process.env.REPLIT_DOMAINS);
  console.log('[Environment] 🔍 REPL_OWNER:', process.env.REPL_OWNER);
  console.log('[Environment] 🔍 REPLIT_DEPLOYMENT:', process.env.REPLIT_DEPLOYMENT);
  console.log('[Environment] 🔍 REPLIT_DEV_DOMAIN:', process.env.REPLIT_DEV_DOMAIN);
  console.log('[Environment] 🔍 NODE_ENV:', process.env.NODE_ENV);
  
  // STRATEGY 1: Check REPLIT_DEPLOYMENT (most reliable way to detect published apps)
  // REPLIT_DEPLOYMENT is set to "1" when app is published, unset otherwise
  if (process.env.REPLIT_DEPLOYMENT === '1') {
    console.log('[Environment] ✅ DETECTED PUBLISHED MODE (REPLIT_DEPLOYMENT=1) - Using assistos.replit.app');
    return 'https://assistos.replit.app';
  }
  
  // STRATEGY 2: Use REPLIT_DEV_DOMAIN for workspace/preview (only available in dev)
  if (process.env.REPLIT_DEV_DOMAIN) {
    console.log('[Environment] ✅ DETECTED DEV MODE (REPLIT_DEV_DOMAIN) - Using it');
    return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  }
  
  // STRATEGY 3: Fallback to REPLIT_DOMAINS if available
  if (process.env.REPLIT_DOMAINS) {
    const domains = process.env.REPLIT_DOMAINS;
    console.log('[Environment] ⚠️ Using REPLIT_DOMAINS fallback:', domains);
    
    // Check if it contains assistos.replit.app
    if (domains.includes('assistos.replit.app')) {
      console.log('[Environment] ✅ Found assistos.replit.app in REPLIT_DOMAINS');
      return 'https://assistos.replit.app';
    }
    
    // Use first domain
    const firstDomain = domains.split(',')[0].trim();
    console.log('[Environment] ✅ Using first domain from REPLIT_DOMAINS:', firstDomain);
    return `https://${firstDomain}`;
  }
  
  // Local development fallback
  console.log('[Environment] ✅ DETECTED LOCAL MODE - Using localhost');
  return 'http://localhost:5000';
}

/**
 * Get OAuth callback URLs
 */
export function getOAuthCallbacks() {
  const baseUrl = getBaseUrl();
  
  return {
    google: `${baseUrl}/api/auth/google/callback`,
    gmail: `${baseUrl}/api/gmail/oauth/callback`,
  };
}

/**
 * Check if running in production (published deployment)
 */
export function isProduction(): boolean {
  return process.env.REPLIT_DEPLOYMENT === '1';
}

/**
 * Check if running in development (Replit workspace/preview)
 */
export function isDevelopment(): boolean {
  return process.env.REPLIT_DEV_DOMAIN !== undefined;
}

/**
 * Check if running locally
 */
export function isLocal(): boolean {
  return !process.env.REPL_SLUG && !process.env.REPLIT_DEV_DOMAIN && !process.env.REPLIT_DEPLOYMENT;
}
