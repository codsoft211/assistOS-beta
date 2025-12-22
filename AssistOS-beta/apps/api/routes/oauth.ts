// Migrated from AssistOS legacy - Phase 4.1
// Source: /tmp/assistos-legacy/server/routes/oauth.ts
// ⚠️ QUARANTINED: getTenantStorage usage disabled (tenant-storage in _legacy/)

import { Router, type Request, Response } from "express";

const router = Router();

// QUARANTINED: OAuth routes temporarily disabled
// These routes depend on getTenantStorage which is in /tmp/assistos-legacy/server/tenant-storage.ts
// and has not been migrated to the monorepo yet
// 
// TODO Phase 4.x: Re-enable after tenant-storage migration or alternative implementation
// 
// Original endpoints:
// - GET /api/oauth/:provider/:connector/authorize - Initiate OAuth flow
// - GET /api/oauth/:provider/:connector/callback - Handle OAuth callback
// - DELETE /api/oauth/:connector/disconnect - Disconnect OAuth
// - GET /api/oauth/:connector/status - Check OAuth connection status
//
// Dependencies needed:
// - getTenantStorage() from tenant-storage.ts
// - userOAuthTokens table or equivalent storage
// - OAuth provider configurations (Google, etc.)

console.warn('[OAuth Routes] OAuth endpoints are currently disabled - awaiting tenant-storage migration');

// Temporary placeholder to prevent 404s
router.all('*', (req, res) => {
  res.status(503).json({
    error: 'OAuth functionality temporarily unavailable',
    message: 'OAuth routes are being migrated. Please check back later.',
    status: 'quarantined'
  });
});

export default router;
