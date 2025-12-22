import { Router } from "express";
import { google } from "googleapis";
import { db } from "../db";
import { userGmailAccounts, oauthStates, users } from "../../../shared/schema";
import { eq, and, gt, lt } from "drizzle-orm";
import { encryptCredentials, serializeEncryptedData } from "../../../packages/document-management/utils/encryption";
import crypto from "crypto";
import { getOAuthCallbacks } from "../config/environment";

const router = Router();

// 🔧 FIX: Create OAuth client dynamically to get correct redirect URI for each environment
function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    getOAuthCallbacks().gmail
  );
}

const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];

// Import middleware
import { requireAuth } from "../middleware/auth.middleware";
import { tenantMiddleware } from "../middleware/tenant-middleware";

// 🔍 DEBUG ENDPOINT: Check current redirect URI configuration
router.get("/debug/config", async (req: any, res) => {
  const config = {
    currentRedirectUri: getOAuthCallbacks().gmail,
    googleRedirectUri: getOAuthCallbacks().google,
    replitDomains: process.env.REPLIT_DOMAINS || 'not set',
    replSlug: process.env.REPL_SLUG || 'not set',
    hasGoogleClientId: !!process.env.GOOGLE_CLIENT_ID,
    hasGoogleClientSecret: !!process.env.GOOGLE_CLIENT_SECRET,
  };
  
  res.json({
    message: "⚠️ IMPORTANTE: Adicione este Redirect URI exato no Google Cloud Console",
    redirectUri: config.currentRedirectUri,
    fullConfig: config,
  });
});

// GET /api/gmail/oauth/authorize
// Note: Requires authentication
router.get("/authorize", requireAuth, tenantMiddleware, async (req: any, res) => {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // ✅ Validate activeTenantId exists
  if (!req.user.activeTenantId) {
    console.error('[Gmail OAuth] Missing activeTenantId for user:', req.user.id);
    return res.status(400).json({ error: "No active tenant. Please select a company first." });
  }

  // ✅ Validate Google OAuth credentials are configured
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    console.error('[Gmail OAuth] Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET');
    return res.status(500).json({ error: "Gmail integration not configured. Please contact support." });
  }

  try {
    console.log('[Gmail OAuth] Generating authorization URL for user:', req.user.id, 'tenant:', req.user.activeTenantId);
    
    // 🔍 DEBUG: Log current redirect URI configuration
    const currentRedirectUri = getOAuthCallbacks().gmail;
    console.log('[Gmail OAuth] 🔍 CURRENT REDIRECT URI:', currentRedirectUri);
    console.log('[Gmail OAuth] 🔍 REPLIT_DOMAINS:', process.env.REPLIT_DOMAINS);
    console.log('[Gmail OAuth] 🔍 REPL_SLUG:', process.env.REPL_SLUG);
    
    // Generate cryptographically secure random state
    const stateToken = crypto.randomBytes(32).toString('base64url');
    
    // Store state in database with 10min expiration
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    
    await db.insert(oauthStates).values({
      userId: req.user.id,
      tenantId: req.user.activeTenantId,
      provider: 'gmail',
      state: stateToken,
      expiresAt,
    });

    console.log('[Gmail OAuth] State token stored:', stateToken.substring(0, 10) + '...');

    // Generate OAuth URL with secure state (using dynamic client for correct redirect URI)
    const oauth2Client = getOAuth2Client();
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: GMAIL_SCOPES,
      prompt: 'consent',
      state: stateToken,
    });

    console.log('[Gmail OAuth] 🔍 Full Auth URL:', authUrl);
    console.log('[Gmail OAuth] Authorization URL generated successfully');
    res.json({ authUrl });
  } catch (error) {
    console.error('[Gmail OAuth] Authorize error:', error);
    res.status(500).json({ error: "Failed to generate authorization URL" });
  }
});

// GET /api/gmail/oauth/callback
// Note: Public endpoint (Google redirects here, no session cookies)
router.get("/callback", async (req: any, res) => {
  console.log('[Gmail OAuth] ✅ CALLBACK RECEIVED');
  console.log('[Gmail OAuth] Query params:', req.query);
  console.log('[Gmail OAuth] Headers:', { host: req.headers.host, referer: req.headers.referer });
  
  const { code, state, error } = req.query;

  if (error) {
    console.error('[Gmail OAuth] Google returned error:', error);
    return res.redirect(`/comunicacoes?gmail=error&reason=${error}`);
  }

  if (!code || !state) {
    console.error('[Gmail OAuth] Missing code or state. Code:', !!code, 'State:', !!state);
    return res.redirect('/comunicacoes?gmail=error&reason=missing_params');
  }

  try {
    // Validate state token from database
    console.log('[Gmail OAuth] Looking for state in database:', state?.substring(0, 20) + '...');
    console.log('[Gmail OAuth] Current time:', new Date().toISOString());
    
    // First, check all states in the database for debugging
    const allStates = await db.query.oauthStates.findMany({
      where: eq(oauthStates.provider, 'gmail'),
      orderBy: (states, { desc }) => [desc(states.createdAt)],
      limit: 5,
    });
    console.log('[Gmail OAuth] Total Gmail states in DB:', allStates.length);
    allStates.forEach((s, i) => {
      console.log(`[Gmail OAuth] State ${i + 1}:`, {
        statePreview: s.state.substring(0, 20) + '...',
        expiresAt: s.expiresAt.toISOString(),
        createdAt: s.createdAt.toISOString(),
        userId: s.userId,
        isExpired: s.expiresAt < new Date()
      });
    });
    
    const stateRecord = await db.query.oauthStates.findFirst({
      where: and(
        eq(oauthStates.state, state as string),
        gt(oauthStates.expiresAt, new Date())
      ),
    });

    if (!stateRecord) {
      console.error('[Gmail OAuth] ❌ State not found or expired');
      console.error('[Gmail OAuth] Searched for state:', state?.substring(0, 20) + '...');
      
      // Check if state exists but is expired
      const expiredState = await db.query.oauthStates.findFirst({
        where: eq(oauthStates.state, state as string),
      });
      
      if (expiredState) {
        console.error('[Gmail OAuth] State exists but is EXPIRED:', {
          expiresAt: expiredState.expiresAt.toISOString(),
          now: new Date().toISOString(),
          diff: (new Date().getTime() - expiredState.expiresAt.getTime()) / 1000 + ' seconds'
        });
      } else {
        console.error('[Gmail OAuth] State does NOT exist in database at all');
      }
      
      return res.redirect('/comunicacoes?gmail=error&reason=invalid_state');
    }
    
    console.log('[Gmail OAuth] ✅ State validated successfully');

    // Verify user still exists and is active
    const user = await db.query.users.findFirst({
      where: eq(users.id, stateRecord.userId),
    });

    if (!user || !user.isActive) {
      console.error('[Gmail OAuth] User not found or inactive:', stateRecord.userId, 'isActive:', user?.isActive);
      await db.delete(oauthStates).where(eq(oauthStates.id, stateRecord.id));
      return res.redirect('/comunicacoes?gmail=error&reason=user_not_found');
    }

    // Exchange code for tokens (using dynamic client for correct redirect URI)
    const oauth2Client = getOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code as string);
    
    if (!tokens.access_token || !tokens.refresh_token) {
      throw new Error("Failed to get tokens from Google");
    }

    // Get user info
    oauth2Client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();

    const email = userInfo.data.email!;
    const displayName = userInfo.data.name || email;

    // Encrypt tokens
    const encryptedAccessToken = serializeEncryptedData(
      encryptCredentials({ token: tokens.access_token }, stateRecord.tenantId)
    );
    const encryptedRefreshToken = serializeEncryptedData(
      encryptCredentials({ token: tokens.refresh_token }, stateRecord.tenantId)
    );
    const expiresAt = new Date(Date.now() + (tokens.expiry_date || 3600 * 1000));

    // Check if account already exists for THIS user (tenant-isolated)
    const existing = await db.query.userGmailAccounts.findFirst({
      where: and(
        eq(userGmailAccounts.userId, stateRecord.userId),
        eq(userGmailAccounts.tenantId, stateRecord.tenantId),
        eq(userGmailAccounts.email, email)
      ),
    });

    if (existing) {
      // Update existing account
      await db.update(userGmailAccounts)
        .set({
          accessToken: encryptedAccessToken,
          refreshToken: encryptedRefreshToken,
          expiresAt,
          isActive: true,
          updatedAt: new Date(),
        })
        .where(eq(userGmailAccounts.id, existing.id));
    } else {
      // Check if user already has 2 accounts
      const userAccounts = await db.query.userGmailAccounts.findMany({
        where: and(
          eq(userGmailAccounts.userId, stateRecord.userId),
          eq(userGmailAccounts.tenantId, stateRecord.tenantId)
        ),
      });

      if (userAccounts.length >= 2) {
        await db.delete(oauthStates).where(eq(oauthStates.id, stateRecord.id));
        return res.redirect('/comunicacoes?gmail=error&reason=max_accounts');
      }

      // Insert new account
      await db.insert(userGmailAccounts).values({
        userId: stateRecord.userId,
        tenantId: stateRecord.tenantId,
        email,
        displayName,
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        expiresAt,
        scopes: GMAIL_SCOPES,
        isPrimary: userAccounts.length === 0,
      });
    }

    // Clean up used state
    await db.delete(oauthStates).where(eq(oauthStates.id, stateRecord.id));

    // Return HTML that closes popup and notifies parent window
    // This works for both popup AND full-page OAuth flows
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Gmail Connected</title>
        <style>
          body {
            font-family: system-ui, -apple-system, sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
          }
          .container {
            text-align: center;
            padding: 2rem;
          }
          .success-icon {
            font-size: 4rem;
            margin-bottom: 1rem;
          }
          h1 { margin: 0 0 0.5rem; }
          p { margin: 0; opacity: 0.9; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="success-icon">✓</div>
          <h1>Gmail Conectado!</h1>
          <p>A conta foi conectada com sucesso. Esta janela irá fechar...</p>
        </div>
        <script>
          // Notify parent window (if opened as popup)
          if (window.opener) {
            window.opener.postMessage({ type: 'gmail-oauth-success' }, '*');
            setTimeout(() => window.close(), 1500);
          } else {
            // Not a popup - redirect normally
            setTimeout(() => window.location.href = '/comunicacoes?gmail=connected', 1500);
          }
        </script>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('[Gmail OAuth] Callback error:', error);
    
    // Return HTML with error message
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Erro Gmail OAuth</title>
        <style>
          body {
            font-family: system-ui, -apple-system, sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
            color: white;
          }
          .container {
            text-align: center;
            padding: 2rem;
          }
          .error-icon {
            font-size: 4rem;
            margin-bottom: 1rem;
          }
          h1 { margin: 0 0 0.5rem; }
          p { margin: 0; opacity: 0.9; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="error-icon">✗</div>
          <h1>Erro ao Conectar Gmail</h1>
          <p>Ocorreu um erro. Esta janela irá fechar...</p>
        </div>
        <script>
          // Notify parent window (if opened as popup)
          if (window.opener) {
            window.opener.postMessage({ type: 'gmail-oauth-error', error: 'server_error' }, '*');
            setTimeout(() => window.close(), 2000);
          } else {
            // Not a popup - redirect normally
            setTimeout(() => window.location.href = '/comunicacoes?gmail=error&reason=server_error', 2000);
          }
        </script>
      </body>
      </html>
    `);
  }
});

// Cleanup expired states periodically (call this via cron or background job)
export async function cleanupExpiredOAuthStates() {
  try {
    const deleted = await db.delete(oauthStates)
      .where(lt(oauthStates.expiresAt, new Date()));
    console.log(`[OAuth] Cleaned up ${deleted.rowCount || 0} expired states`);
  } catch (error) {
    console.error('[OAuth] Cleanup error:', error);
  }
}

export default router;
