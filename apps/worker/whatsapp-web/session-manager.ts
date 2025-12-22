import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
type WhatsAppClient = InstanceType<typeof Client>;
import { EventEmitter } from 'events';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { execSync } from 'child_process';
import { db } from '../db';
import { whatsappWebSessions, whatsappAccounts, whatsappContacts, whatsappConversations, whatsappMessages } from '@shared/schema';
import { eq, and, ne, or } from 'drizzle-orm';
import type { 
  SessionInfo, 
  CreateSessionOptions, 
  SessionStatus,
  SessionEventEmitter 
} from './types';

class WhatsAppWebSessionManager extends EventEmitter implements SessionEventEmitter {
  private sessions: Map<string, SessionInfo> = new Map();
  private cacheDataPath: string;

  constructor() {
    super();
    // Priority: Custom path (if writable) > Home directory > Temp directory
    // Browser cache (IndexedDB, Cache storage) is separate from session data (stored in DB)
    // Session data persists in database, but cache is needed for full reconnection
    
    if (process.env.WHATSAPP_CACHE_PATH) {
      // Production: Use explicitly set persistent path
      const customPath = process.env.WHATSAPP_CACHE_PATH;
      
      // Check if path is writable
      if (this.isPathWritable(customPath)) {
        this.cacheDataPath = customPath;
        console.log('[WhatsApp Web] Using persistent cache directory:', this.cacheDataPath);
      } else {
        console.warn(
          `[WhatsApp Web] ⚠️  WHATSAPP_CACHE_PATH (${customPath}) is not writable. ` +
          `Falling back to home directory. Please fix permissions or remove the env var.`
        );
        this.cacheDataPath = this.getHomeCachePath();
      }
    } else {
      // Development: Use home directory (persists across restarts but not system reboots)
      this.cacheDataPath = this.getHomeCachePath();
    }
    
    console.log('[WhatsApp Web] Session Manager initialized with LocalAuth');
    console.log('[WhatsApp Web] Session data will be stored locally and encrypted in PostgreSQL');
    console.log(`[WhatsApp Web] Browser cache directory: ${this.cacheDataPath}`);
  }

  private getHomeCachePath(): string {
    const homeDir = os.homedir();
    const persistentPath = path.join(homeDir, '.assistos', 'whatsapp-cache');
    
    // Ensure directory exists
    try {
      if (!fs.existsSync(persistentPath)) {
        fs.mkdirSync(persistentPath, { recursive: true });
      }
      console.log('[WhatsApp Web] Using home directory cache:', persistentPath);
      console.log('[WhatsApp Web] ⚠️  For production, set WHATSAPP_CACHE_PATH for persistent storage');
      console.log('[WhatsApp Web] ⚠️  Cache will persist across worker restarts but may be lost on system reboot');
    } catch (error: any) {
      console.error(`[WhatsApp Web] Failed to create home cache directory: ${error.message}`);
      // Fallback to temp directory as last resort
      const tempPath = path.join(os.tmpdir(), 'wwebjs_cache');
      console.warn(`[WhatsApp Web] Falling back to temp directory: ${tempPath}`);
      return tempPath;
    }
    
    return persistentPath;
  }

  private isPathWritable(pathToCheck: string): boolean {
    try {
      // Check if directory exists
      if (fs.existsSync(pathToCheck)) {
        // Try to write a test file
        const testFile = path.join(pathToCheck, '.write-test');
        try {
          fs.writeFileSync(testFile, 'test');
          fs.unlinkSync(testFile);
          return true;
        } catch {
          return false;
        }
      } else {
        // Try to create the directory
        try {
          fs.mkdirSync(pathToCheck, { recursive: true });
          // If creation succeeded, it's writable
          return true;
        } catch {
          return false;
        }
      }
    } catch {
      return false;
    }
  }

  /**
   * Validate if a name is actually a useful contact name
   * Returns true only if it's a real name (not a phone number, empty, or user's own number)
   */
  private isValidContactName(name: string | null | undefined, contactPhone: string, accountPhone: string): boolean {
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

  async createSession(options: CreateSessionOptions): Promise<SessionInfo> {
    const { accountId, userId, tenantId, environment } = options;

    if (this.sessions.has(accountId)) {
      const existing = this.sessions.get(accountId)!;
      console.log(`[WhatsApp Web] Session already exists for ${accountId} with status: ${existing.status}`);
      
      if (existing.status !== 'disconnected' && existing.status !== 'error') {
        console.error(`[WhatsApp Web] ❌ Cannot create session - already exists and is active (${existing.status})`);
        throw new Error('Session already exists and is active');
      }
      
      console.log(`[WhatsApp Web] Destroying old session before creating new one...`);
      await this.destroySession(accountId);
      console.log(`[WhatsApp Web] ✅ Old session destroyed, creating fresh session...`);
    }

    console.log(`[WhatsApp Web] Creating session for account ${accountId}`);

    const sessionInfo: SessionInfo = {
      accountId,
      userId,
      tenantId,
      environment,
      status: 'connecting',
    };

    // CRITICAL FIX: Use LocalAuth instead of RemoteAuth
    // LocalAuth stores session data directly in the local filesystem
    // This is simpler and more reliable than RemoteAuth's ZIP backup approach
    const accountCacheDir = path.resolve(path.join(this.cacheDataPath, `session-${accountId}`));
    
    // Check if session was previously disconnected - clean up old files for fresh start
    const dbSession = await db.query.whatsappWebSessions.findFirst({
      where: eq(whatsappWebSessions.accountId, accountId),
    });
    
    if (dbSession && (dbSession.status === 'disconnected' || dbSession.status === 'error')) {
      console.log(`[WhatsApp Web] Previous session was ${dbSession.status} - cleaning up old session files for fresh start...`);
      if (fs.existsSync(accountCacheDir)) {
        try {
          fs.rmSync(accountCacheDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
          console.log(`[WhatsApp Web] ✅ Old session files cleaned up`);
        } catch (error: any) {
          console.warn(`[WhatsApp Web] ⚠️  Could not clean up old session files: ${error.message}`);
        }
      }
    }
    
    if (!fs.existsSync(accountCacheDir)) {
      fs.mkdirSync(accountCacheDir, { recursive: true });
      console.log(`[WhatsApp Web] Created session directory: ${accountCacheDir}`);
    }

    // Check if session data already exists
    // LocalAuth stores in Default profile directory
    const defaultProfilePath = path.join(accountCacheDir, 'Default');
    const sessionExists = fs.existsSync(defaultProfilePath);
    console.log(`[WhatsApp Web] Session data check for ${accountId}:`);
    console.log(`[WhatsApp Web]   Session directory: ${accountCacheDir}`);
    console.log(`[WhatsApp Web]   Default profile exists: ${sessionExists}`);
    if (sessionExists) {
      try {
        const files = fs.readdirSync(defaultProfilePath);
        console.log(`[WhatsApp Web]   Default profile has ${files.length} files`);
      } catch (e) {
        // Ignore read errors
      }
    }
    
    // Use system Chromium instead of bundled puppeteer-core Chromium
    // This is required for Nix environments where bundled Chromium can't find shared libraries
    const getChromiumPath = (): string => {
      // Priority: 1. Environment variable, 2. System chromium via which, 3. Common paths
      if (process.env.PUPPETEER_EXECUTABLE_PATH) {
        return process.env.PUPPETEER_EXECUTABLE_PATH;
      }
      
      // Try to find chromium in PATH (works with Nix)
      try {
        const whichResult = execSync('which chromium 2>/dev/null || which chromium-browser 2>/dev/null || which google-chrome 2>/dev/null', { encoding: 'utf8' }).trim();
        if (whichResult && fs.existsSync(whichResult)) {
          return whichResult;
        }
      } catch {
        // Ignore errors from which command
      }
      
      // Fallback paths for common locations
      const fallbackPaths = [
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        '/usr/bin/google-chrome',
      ];
      
      for (const p of fallbackPaths) {
        if (fs.existsSync(p)) {
          return p;
        }
      }
      
      // Let puppeteer use its bundled version as last resort
      return '';
    };
    
    const chromiumPath = getChromiumPath();
    if (chromiumPath) {
      console.log(`[WhatsApp Web] Using system Chromium at: ${chromiumPath}`);
    } else {
      console.log(`[WhatsApp Web] Using bundled Puppeteer Chromium (may fail on Nix)`);
    }
    
    const client = new Client({
      authStrategy: new LocalAuth({
        clientId: accountId,
        dataPath: this.cacheDataPath, // LocalAuth will create session-{clientId} subdirectory
      }),
      puppeteer: {
        headless: true,
        ...(chromiumPath ? { executablePath: chromiumPath } : {}), // Use system Chromium for Nix compatibility
        timeout: 60000, // 60 second timeout for browser launch
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          '--disable-extensions',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
          '--disable-sync',
          '--metrics-recording-only',
          '--mute-audio',
          '--no-default-browser-check',
          '--no-pings',
          '--password-store=basic',
          '--use-mock-keychain',
          '--disable-blink-features=AutomationControlled',
        ],
      },
      // Add client-level timeouts
      authTimeoutMs: 60000, // 60 seconds for authentication
      qrMaxRetries: 3, // Max QR retries before giving up
    });

    this.setupClientEventListeners(client, sessionInfo);

    sessionInfo.client = client;
    this.sessions.set(accountId, sessionInfo);

    // Clean up .wwebjs_cache from working directory if it was created
    // RemoteAuth should use dataPath, but sometimes QR code HTML files are created in working directory
    const cleanupWwebjsCache = () => {
      const wwebjsCacheDir = path.join(process.cwd(), '.wwebjs_cache');
      if (fs.existsSync(wwebjsCacheDir)) {
        try {
          const files = fs.readdirSync(wwebjsCacheDir);
          const htmlFiles = files.filter((file) => file.endsWith('.html'));
          if (htmlFiles.length > 0) {
            console.log(`[WhatsApp Web] Cleaning up ${htmlFiles.length} QR HTML file(s) from working directory: ${wwebjsCacheDir}`);
            htmlFiles.forEach((file) => {
              const filePath = path.join(wwebjsCacheDir, file);
              fs.unlinkSync(filePath);
              console.log(`[WhatsApp Web] Removed QR HTML file: ${file}`);
            });
          }
        } catch (error: any) {
          console.warn(`[WhatsApp Web] Could not clean up .wwebjs_cache: ${error.message}`);
        }
      }
    };

    // Clean up immediately and periodically
    setTimeout(cleanupWwebjsCache, 2000);
    setInterval(cleanupWwebjsCache, 30000); // Clean up every 30 seconds

    await this.saveSessionToDatabase(sessionInfo);

    // Set a timeout to detect if initialization is stuck and auto-recover
    const initTimeoutRef = setTimeout(async () => {
      const currentStatus = this.sessions.get(accountId)?.status;
      if (currentStatus === 'connecting' || currentStatus === 'authenticated') {
        console.error(
          `[WhatsApp Web] ❌ Initialization timeout for ${accountId} after 60 seconds. ` +
          `Current status: ${currentStatus}. Session likely invalidated or browser stuck.`
        );
        
        // Auto-recovery: Destroy stuck session and clean up files
        console.log(`[WhatsApp Web] 🔄 Auto-recovery: Destroying stuck session and cleaning up...`);
        
        try {
          // Destroy the stuck session with logout
          const session = this.sessions.get(accountId);
          if (session) {
            await this.logoutAndCleanup(accountId, session);
          }
          
          // Remove from sessions map
          this.sessions.delete(accountId);
          
          // Update database status
          await db.update(whatsappWebSessions)
            .set({
              status: 'error',
              errorMessage: 'Session initialization timeout - session invalidated. Please reconnect.',
              disconnectedAt: new Date(),
              qrCode: null,
            })
            .where(eq(whatsappWebSessions.accountId, accountId));
          
          console.log(`[WhatsApp Web] ✅ Session ${accountId} marked as error - user needs to reconnect`);
          
          // Emit error event
          this.emit('error', accountId, new Error('Session initialization timeout - please reconnect'));
        } catch (recoveryError) {
          console.error(`[WhatsApp Web] ❌ Auto-recovery failed:`, recoveryError);
        }
      }
    }, 60000); // 60 second timeout (increased from 30)
    
    // Store timeout reference on session for cleanup in event handlers
    (sessionInfo as any)._initTimeout = initTimeoutRef;

    client.initialize()
      .then(() => {
        const session = this.sessions.get(accountId);
        if (session && (session as any)._initTimeout) {
          clearTimeout((session as any)._initTimeout);
          delete (session as any)._initTimeout;
        }
        console.log(`[WhatsApp Web] ✅ Client initialization completed for ${accountId} - waiting for ready event...`);
        
        // Check if session directory was created
        const sessionCacheDir = path.join(this.cacheDataPath, `session-${accountId}`);
        const defaultProfilePath = path.join(sessionCacheDir, 'Default');
        
        console.log(`[WhatsApp Web] LocalAuth session status after initialization for ${accountId}:`);
        console.log(`[WhatsApp Web]   Session directory: ${sessionCacheDir}`);
        console.log(`[WhatsApp Web]   Directory exists: ${fs.existsSync(sessionCacheDir)}`);
        
        // When recovering a session with existing session data, LocalAuth should automatically reconnect
        if (session && (session.status === 'connecting' || session.status === 'authenticated')) {
          if (fs.existsSync(defaultProfilePath)) {
            console.log(`[WhatsApp Web] ✅ Session ${accountId} has Default profile - expecting automatic reconnection...`);
          } else {
            console.log(`[WhatsApp Web] Session ${accountId} starting fresh - will create Default profile after authentication`);
          }
        }
      })
      .catch(async (error) => {
        const sessionForTimeout = this.sessions.get(accountId);
        if (sessionForTimeout && (sessionForTimeout as any)._initTimeout) {
          clearTimeout((sessionForTimeout as any)._initTimeout);
          delete (sessionForTimeout as any)._initTimeout;
        }
        console.error(`[WhatsApp Web] ❌ Failed to initialize client for ${accountId}:`, {
          error: error.message,
          stack: error.stack,
          code: error.code,
          name: error.name,
        });
        
        // Clean up session files if initialization failed
        console.log(`[WhatsApp Web] 🧹 Cleaning up after initialization failure...`);
        const session = this.sessions.get(accountId);
        if (session) {
          await this.logoutAndCleanup(accountId, session);
        }
        
        this.updateSessionStatus(accountId, 'error', `Initialization failed: ${error.message}. Please try reconnecting.`);
      });

    // Log initialization start
    console.log(`[WhatsApp Web] Client initialization started for ${accountId}. ` +
      `If session data exists, it should reconnect automatically. ` +
      `If cache is missing, QR code may be required.`);

    return sessionInfo;
  }

  private setupClientEventListeners(
    client: WhatsAppClient, 
    sessionInfo: SessionInfo
  ): void {
    const initialAccountId = sessionInfo.accountId;

    // Helper to get the current account ID (in case it was merged)
    const getCurrentAccountId = (): string => {
      // Check if session was migrated to a different account ID
      const entries = Array.from(this.sessions.entries());
      for (const [accId, sess] of entries) {
        if (sess.client === client) {
          return accId;
        }
      }
      return initialAccountId;
    };

    client.on('qr', (qr: string) => {
      const accountId = getCurrentAccountId();
      console.log(`[WhatsApp Web] QR code generated for ${accountId}`);
      console.log(`[WhatsApp Web] QR code length: ${qr?.length}, first 50 chars: ${qr?.substring(0, 50)}`);
      
      const session = this.sessions.get(accountId);
      if (!session) {
        console.error(`[WhatsApp Web] Session not found in map for ${accountId} when saving QR`);
        console.log(`[WhatsApp Web] Available sessions:`, Array.from(this.sessions.keys()));
      }
      
      this.updateSessionStatus(accountId, 'qr_ready');
      this.updateSession(accountId, { qrCode: qr });
      this.emit('qr', accountId, qr);
    });

    client.on('authenticated', async (session: any) => {
      const accountId = getCurrentAccountId();
      console.log(`[WhatsApp Web] Authenticated for ${accountId}`);
      console.log(`[WhatsApp Web] Authenticated event - session data:`, {
        hasSession: !!session,
        sessionType: typeof session,
        sessionKeys: session && typeof session === 'object' ? Object.keys(session).length : 'N/A',
      });
      
      // With LocalAuth, session data is automatically persisted to disk
      console.log(`[WhatsApp Web] Authenticated for ${accountId}. LocalAuth will save session data automatically.`);
      
      this.updateSessionStatus(accountId, 'authenticated');
      
      // Clear QR code
      this.updateSession(accountId, { 
        qrCode: undefined,
      });
      
      this.emit('authenticated', accountId, session);
    });

    // LocalAuth doesn't have a remote_session_saved event
    // Session is saved automatically to disk, so we don't need to listen for it

    client.on('ready', async () => {
      // Use initialAccountId for the merge check (before any migration)
      const accountId = initialAccountId;
      console.log(`[WhatsApp Web] Client ready for ${accountId}`);
      
      // With LocalAuth, session is automatically saved to disk
      // LocalAuth creates: session-{accountId}/Default/ (browser profile with session data)
      const sessionCacheDir = path.join(this.cacheDataPath, `session-${accountId}`);
      const defaultProfilePath = path.join(sessionCacheDir, 'Default');
      const sessionExists = fs.existsSync(defaultProfilePath);
      
      console.log(`[WhatsApp Web] ✅ LocalAuth session check for ${accountId}:`);
      console.log(`[WhatsApp Web]   Session directory: ${sessionCacheDir}`);
      console.log(`[WhatsApp Web]   Default profile path: ${defaultProfilePath}`);
      console.log(`[WhatsApp Web]   Session exists: ${sessionExists}`);
      
      if (sessionExists) {
        try {
          const files = fs.readdirSync(defaultProfilePath);
          console.log(`[WhatsApp Web] ✅ Session contains ${files.length} files - will persist across restarts`);
        } catch (e) {
          // Ignore read errors
        }
      } else {
        // Check if session directory was created but Default profile is missing
        if (fs.existsSync(sessionCacheDir)) {
          try {
            const dirContents = fs.readdirSync(sessionCacheDir);
            console.warn(`[WhatsApp Web] ⚠️  Warning: Session directory exists but Default profile not found yet. Contents: ${dirContents.join(', ')}`);
            console.warn(`[WhatsApp Web] ⚠️  LocalAuth may still be creating the session. Wait a moment and check again.`);
          } catch (e) {
            // Ignore
          }
        } else {
          console.warn(`[WhatsApp Web] ⚠️  Warning: Session directory not found. Session may not persist.`);
        }
      }
      
      const info = await client.info;
      const phoneNumber = info.wid.user;
      
      // Don't update session status yet - will do after potential merge
      
      try {
        // Get current account to check tenant/environment
        const currentAccount = await db.query.whatsappAccounts.findFirst({
          where: eq(whatsappAccounts.id, accountId),
        });

        if (!currentAccount) {
          console.error(`[WhatsApp Web] Account not found: ${accountId}`);
          return;
        }

        // Check if another account with this phone number already exists
        const existingAccount = await db.query.whatsappAccounts.findFirst({
          where: and(
            eq(whatsappAccounts.tenantId, currentAccount.tenantId),
            eq(whatsappAccounts.phoneNumber, phoneNumber),
            eq(whatsappAccounts.environment, currentAccount.environment),
            // Exclude current account
            ne(whatsappAccounts.id, accountId)
          ),
        });

        if (existingAccount) {
          console.warn(
            `[WhatsApp Web] Account with phone ${phoneNumber} already exists for tenant ${currentAccount.tenantId}. ` +
            `Merging with existing account ${existingAccount.id} instead of ${accountId}`
          );
          
          // Update the existing account instead
          await db.update(whatsappAccounts)
            .set({ 
              phoneNumber,
              isActive: true,
              lastUsedAt: new Date(),
              connectionType: 'web-connector',
            })
            .where(eq(whatsappAccounts.id, existingAccount.id));

          // Update session in database to point to the existing account BEFORE deleting
          await db.update(whatsappWebSessions)
            .set({ accountId: existingAccount.id })
            .where(eq(whatsappWebSessions.accountId, accountId));

          // Migrate in-memory session to use the existing accountId
          const sessionInfo = this.sessions.get(accountId);
          if (sessionInfo && sessionInfo.client) {
            // Update the RemoteAuth store's accountId
            try {
              const authStrategy = (sessionInfo.client as any).authStrategy;
              if (authStrategy && authStrategy.store && typeof authStrategy.store.updateAccountId === 'function') {
                authStrategy.store.updateAccountId(existingAccount.id);
                console.log(`[WhatsApp Web] Updated RemoteAuth store accountId to ${existingAccount.id}`);
              }
            } catch (error) {
              console.warn(`[WhatsApp Web] Failed to update RemoteAuth store accountId:`, error);
            }

            // Remove old session from map
            this.sessions.delete(accountId);
            // Add session with new accountId and updated info
            this.sessions.set(existingAccount.id, {
              ...sessionInfo,
              accountId: existingAccount.id,
              phoneNumber,
              connectedAt: new Date(),
              lastSeenAt: new Date(),
              clientInfo: {
                platform: info.platform,
                phoneModel: info.phone?.device_model,
                osVersion: info.phone?.os_version,
              },
            });
            console.log(`[WhatsApp Web] Migrated session from ${accountId} to ${existingAccount.id}`);
            
            // Update session status in database for the merged account
            this.updateSessionStatus(existingAccount.id, 'ready');
          }

          // Now safe to delete the duplicate account
          await db.delete(whatsappAccounts)
            .where(eq(whatsappAccounts.id, accountId));

          this.emit('ready', existingAccount.id, phoneNumber);
        } else {
          // No conflict, update normally
          await db.update(whatsappAccounts)
            .set({ 
              phoneNumber,
              isActive: true,
              lastUsedAt: new Date(),
            })
            .where(eq(whatsappAccounts.id, accountId));

          // Update session status and info
          this.updateSessionStatus(accountId, 'ready');
          this.updateSession(accountId, { 
            phoneNumber,
            connectedAt: new Date(),
            lastSeenAt: new Date(),
            clientInfo: {
              platform: info.platform,
              phoneModel: info.phone?.device_model,
              osVersion: info.phone?.os_version,
            },
          });

          this.emit('ready', accountId, phoneNumber);
        }
        
      } catch (error: any) {
        // Handle duplicate key error gracefully
        if (error.code === '23505' && error.constraint === 'whatsapp_tenant_phone_idx') {
          console.warn(
            `[WhatsApp Web] Duplicate phone number detected: ${phoneNumber}. ` +
            `This usually means the account was already connected. Skipping update.`
          );
          // Update session status anyway
          this.updateSessionStatus(accountId, 'ready');
          this.updateSession(accountId, { 
            phoneNumber,
            connectedAt: new Date(),
            lastSeenAt: new Date(),
            clientInfo: {
              platform: info.platform,
              phoneModel: info.phone?.device_model,
              osVersion: info.phone?.os_version,
            },
          });
          // Still emit ready event - connection is successful
          this.emit('ready', accountId, phoneNumber);
        } else {
          console.error(`[WhatsApp Web] Error updating account ${accountId}:`, error);
          throw error;
        }
      }
    });

    client.on('disconnected', async (reason: string) => {
      const accountId = getCurrentAccountId();
      console.log(`[WhatsApp Web] 🔌 Disconnected ${accountId}:`, reason);
      console.log(`[WhatsApp Web] Disconnection reason details:`, {
        reason,
        accountId,
        timestamp: new Date().toISOString(),
      });
      
      // If this is a logout (not just a network disconnect), clean up session files
      // Common logout reasons: 'LOGOUT', 'Logged out', etc.
      const isLogout = reason && (
        reason.includes('LOGOUT') || 
        reason.includes('Logged out') ||
        reason.includes('logout')
      );
      
      if (isLogout) {
        console.log(`[WhatsApp Web] 🚪 User logged out - cleaning up session files for ${accountId}`);
        
        // CRITICAL FIX: First destroy the client (close browser) to release file locks
        // Then delete session files after a short delay
        const session = this.sessions.get(accountId);
        if (session?.client) {
          try {
            console.log(`[WhatsApp Web] Closing browser to release file locks...`);
            await session.client.destroy();
            console.log(`[WhatsApp Web] ✅ Browser closed`);
          } catch (error: any) {
            console.warn(`[WhatsApp Web] Error closing browser:`, error.message);
          }
        }
        
        // Wait for browser to fully close and release file locks
        setTimeout(() => {
          const sessionCacheDir = path.join(this.cacheDataPath, `session-${accountId}`);
          if (fs.existsSync(sessionCacheDir)) {
            try {
              fs.rmSync(sessionCacheDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
              console.log(`[WhatsApp Web] ✅ Session files deleted after logout`);
            } catch (error: any) {
              console.error(`[WhatsApp Web] ❌ Failed to delete session files:`, error.message);
              console.error(`[WhatsApp Web] ❌ Will retry deletion on next worker restart`);
            }
          }
        }, 1000); // Wait 1 second for file locks to release
      } else {
        console.log(`[WhatsApp Web] ⚠️  Disconnected (not logout) - session files preserved for reconnection`);
      }
      
      this.updateSessionStatus(accountId, 'disconnected');
      this.updateSession(accountId, { 
        qrCode: undefined,
        client: undefined,
      });
      this.emit('disconnected', accountId, reason);
    });

    client.on('auth_failure', async (msg: string) => {
      const accountId = getCurrentAccountId();
      console.error(`[WhatsApp Web] ❌ Auth failure for ${accountId}:`, msg);
      console.error(`[WhatsApp Web] Auth failure details:`, {
        message: msg,
        accountId,
        timestamp: new Date().toISOString(),
      });
      
      // CRITICAL FIX: Delete session files on auth failure
      // This handles the case where user logged out while worker was offline
      console.log(`[WhatsApp Web] 🗑️  Auth failed - cleaning up invalid session files for ${accountId}`);
      
      // Clear any pending initialization timeout and close browser
      const session = this.sessions.get(accountId);
      if (session && (session as any)._initTimeout) {
        clearTimeout((session as any)._initTimeout);
        delete (session as any)._initTimeout;
      }
      
      // Auth already failed, so just clean up without logout
      // (can't logout if auth never succeeded)
      if (session?.client) {
        try {
          console.log(`[WhatsApp Web] Closing browser to release file locks...`);
          await session.client.destroy();
          console.log(`[WhatsApp Web] ✅ Browser closed`);
        } catch (error: any) {
          console.warn(`[WhatsApp Web] Error closing browser:`, error.message);
        }
      }
      
      // Remove from sessions map
      this.sessions.delete(accountId);
      
      // Wait for browser to fully close, then delete files
      setTimeout(() => {
        const sessionCacheDir = path.join(this.cacheDataPath, `session-${accountId}`);
        if (fs.existsSync(sessionCacheDir)) {
          try {
            fs.rmSync(sessionCacheDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
            console.log(`[WhatsApp Web] ✅ Invalid session files deleted`);
          } catch (error: any) {
            console.error(`[WhatsApp Web] ❌ Failed to delete session files:`, error.message);
            console.error(`[WhatsApp Web] ❌ Manual cleanup may be needed: ${sessionCacheDir}`);
          }
        }
      }, 2000); // Wait 2 seconds for browser to fully close
      
      this.updateSessionStatus(accountId, 'error', 'Authentication failed - session invalidated. Please reconnect and scan QR code.');
      this.emit('error', accountId, new Error(msg));
    });

    // Add logging for loading_screen event to track initialization progress
    let lastLoadingPercent = 0;
    let loadingStuckCount = 0;
    
    client.on('loading_screen', (percent: string, message: string) => {
      const accountId = getCurrentAccountId();
      const currentPercent = parseInt(percent) || 0;
      
      console.log(`[WhatsApp Web] 📱 Loading screen for ${accountId}: ${percent}% - ${message}`);
      
      // Detect if loading is stuck at same percentage
      if (currentPercent === lastLoadingPercent && currentPercent < 100) {
        loadingStuckCount++;
        if (loadingStuckCount > 5) {
          console.warn(
            `[WhatsApp Web] ⚠️  Loading stuck at ${percent}% for ${accountId}. ` +
            `This may indicate session invalidation or network issues.`
          );
        }
      } else {
        loadingStuckCount = 0;
      }
      
      lastLoadingPercent = currentPercent;
    });

    // Don't try to get state immediately - client isn't initialized yet
    // We'll check state after initialization completes

    // Add a periodic check to see if client is stuck
    const stateCheckInterval = setInterval(() => {
      const session = this.sessions.get(initialAccountId);
      if (!session || !session.client) {
        clearInterval(stateCheckInterval);
        return;
      }
      
      const status = session.status;
      if (status === 'connecting' || status === 'authenticated') {
        // Check if client has been in this state for more than 60 seconds
        const now = Date.now();
        const lastUpdate = session.lastSeenAt?.getTime() || session.connectedAt?.getTime() || now;
        const timeSinceUpdate = now - lastUpdate;
        
        if (timeSinceUpdate > 60000) {
          console.warn(
            `[WhatsApp Web] ⚠️  Client for ${initialAccountId} has been in '${status}' state for ${Math.round(timeSinceUpdate / 1000)}s. ` +
            `This might indicate a stuck connection.`
          );
        }
      } else if (status === 'ready') {
        clearInterval(stateCheckInterval);
      }
    }, 10000); // Check every 10 seconds

    // Clear interval when client is destroyed
    client.on('disconnected', () => {
      clearInterval(stateCheckInterval);
    });

    // Listen for incoming messages (from contacts TO you)
    client.on('message', (message: any) => {
      const accountId = getCurrentAccountId();
      const messageInfo = {
        id: message.id?.id || message.id?._serialized || 'unknown',
        from: message.from,
        to: message.to,
        type: message.type,
        body: message.body?.substring(0, 50) || 'no body',
        hasMedia: message.hasMedia,
      };
      console.log(`[WhatsApp Web] 📩 Message received for account ${accountId}:`, messageInfo);
      this.updateSession(accountId, { lastSeenAt: new Date() });
      this.emit('message', accountId, message);
    });

    // Listen for ALL messages including ones sent from your phone (critical for sync)
    client.on('message_create', (message: any) => {
      const accountId = getCurrentAccountId();
      
      const messageInfo = {
        id: message.id?.id || message.id?._serialized || 'unknown',
        from: message.from,
        to: message.to,
        type: message.type,
        body: message.body?.substring(0, 50) || 'no body',
        hasMedia: message.hasMedia,
        fromMe: message.fromMe,
      };
      
      console.log(`[WhatsApp Web] 📨 Message created for ${accountId}:`, messageInfo);
      
      // Only process message_create for:
      // 1. Outbound messages (fromMe: true) - these don't trigger 'message' event
      // 2. Special types (reactions) that may only come through message_create
      // This prevents duplicates since 'message' event already handles inbound regular messages
      const isOutbound = message.fromMe === true;
      const isSpecialType = message.type === 'reaction' || message.type === 'revoked';
      
      if (isOutbound || isSpecialType) {
      this.updateSession(accountId, { lastSeenAt: new Date() });
      this.emit('message', accountId, message);
      }
    });

    // Listen for message acknowledgments (delivery and read receipts for OUTBOUND messages)
    client.on('message_ack', async (message: any, ack: any) => {
      const accountId = getCurrentAccountId();
      
      // Ack levels: 1 = sent, 2 = delivered, 3 = read, 4 = played (for voice notes)
      const ackStatusMap: Record<number, string> = {
        1: 'sent',
        2: 'delivered', 
        3: 'read',
        4: 'played',
      };
      const ackStatus = ackStatusMap[ack as number] || 'unknown';
      
      console.log(`[WhatsApp Web] 📬 Message ack for ${accountId}: ${message.id?.id} → ${ackStatus} (ack: ${ack})`);
      
      // Emit event for read status updates (for outbound messages)
      if (ack >= 3) { // 3 = read, 4 = played
        this.emit('message_read', accountId, message.id?.id || message.id?._serialized, ackStatus);
      }
    });

    // Monitor chat unread counts to detect when YOU read messages on your phone
    // This is crucial for syncing read status from phone to app
    const chatUnreadCache = new Map<string, number>();
    let isFirstRun = true;
    
    const monitorChatReads = async () => {
      try {
        const currentAccountId = getCurrentAccountId();
        const chats = await client.getChats();
        
        if (isFirstRun) {
          console.log(`[WhatsApp Web] 🔍 Read status monitor: First run - initializing cache with ${chats.length} chats`);
          isFirstRun = false;
        }
        
        let unreadChatsCount = 0;
        for (const chat of chats) {
          if (chat.isGroup) continue; // Skip groups
          
          const chatAny = chat as any;
          const currentUnreadCount = chatAny.unreadCount || 0;
          const contactPhone = chat.id.user;
          const previousUnreadCount = chatUnreadCache.get(contactPhone);
          
          if (currentUnreadCount > 0) {
            unreadChatsCount++;
          }
          
          // Check if unread count decreased (you read messages on phone)
          if (previousUnreadCount !== undefined && currentUnreadCount < previousUnreadCount) {
            // Messages were read on phone
            this.emit('chat_read_on_phone', currentAccountId, contactPhone);
            console.log(`[WhatsApp Web] 📱✅ Chat read on phone detected: ${contactPhone} (unread: ${previousUnreadCount} → ${currentUnreadCount})`);
          }
          
          // Store current count for next check
          chatUnreadCache.set(contactPhone, currentUnreadCount);
        }
        
        // Periodic summary log (every 10 checks = every 20 seconds)
        if (chatUnreadCache.size % 10 === 0) {
          console.log(`[WhatsApp Web] 🔍 Read monitor status: ${chats.length} chats tracked, ${unreadChatsCount} with unread messages`);
        }
      } catch (error: any) {
        console.error(`[WhatsApp Web] ❌ Error monitoring chat reads:`, error.message);
        // Ignore errors in monitoring - don't let this break the session
      }
    };

    // Check every 2 seconds for read status changes (fast enough to feel responsive)
    const monitorInterval = setInterval(() => {
      const currentAccountId = getCurrentAccountId();
      if (this.sessions.get(currentAccountId)?.status === 'ready') {
        monitorChatReads();
      }
    }, 2000);

    // Store interval ID for cleanup
    (sessionInfo as any)._monitorInterval = monitorInterval;
    
    console.log(`[WhatsApp Web] ✅ Read status monitoring started for ${sessionInfo.accountId} (checks every 2 seconds)`);

    // Listen for typing/presence state changes
    client.on('change_state', (state: string) => {
      const accountId = getCurrentAccountId();
      console.log(`[WhatsApp Web] State changed for ${accountId}: ${state}`);
      this.emit('state_change', accountId, state);
    });

    // Listen for contact presence updates (online/offline/typing)
    // Note: This requires accessing the WhatsApp Web internal store
    const monitorPresence = async () => {
      try {
        const page = (client as any).pupPage || (client as any).page;
        if (!page) return;

        const currentAccountId = getCurrentAccountId();
        
        // Access WhatsApp Web Store to monitor presence
        const presenceData = await page.evaluate(() => {
          try {
            const Store = (window as any).Store;
            if (!Store || !Store.PresenceStore) return null;

            const presences: any[] = [];
            Store.PresenceStore.getModelsArray().forEach((presence: any) => {
              if (presence.id && presence.id._serialized) {
                presences.push({
                  id: presence.id._serialized,
                  chatId: presence.id.user,
                  isOnline: presence.isOnline || false,
                  lastSeen: presence.t || null,
                  type: presence.type || 'available', // available, unavailable, typing, recording
                });
              }
            });
            return presences;
          } catch (e) {
            return null;
          }
        });

        if (presenceData && presenceData.length > 0) {
          // Emit presence updates for contacts that are typing or changed online status
          presenceData.forEach((presence: any) => {
            if (presence.type === 'composing' || presence.type === 'recording') {
              this.emit('contact_typing', currentAccountId, presence.chatId, presence.type);
            }
            if (presence.isOnline !== undefined) {
              this.emit('contact_presence', currentAccountId, presence.chatId, presence.isOnline, presence.lastSeen);
            }
          });
        }
      } catch (error: any) {
        // Silently ignore presence monitoring errors
      }
    };

    // Monitor presence every 3 seconds (less aggressive than read monitoring)
    const presenceInterval = setInterval(() => {
      const currentAccountId = getCurrentAccountId();
      if (this.sessions.get(currentAccountId)?.status === 'ready') {
        monitorPresence();
      }
    }, 3000);

    // Store presence interval for cleanup
    (sessionInfo as any)._presenceInterval = presenceInterval;
    
    console.log(`[WhatsApp Web] ✅ Presence monitoring started for ${sessionInfo.accountId} (checks every 3 seconds)`);
  }

  private updateSessionStatus(
    accountId: string, 
    status: SessionStatus, 
    errorMessage?: string
  ): void {
    const session = this.sessions.get(accountId);
    if (!session) return;

    session.status = status;
    if (errorMessage) {
      session.errorMessage = errorMessage;
    }

    this.saveSessionToDatabase(session).catch(error => {
      console.error(`[WhatsApp Web] Failed to save session status:`, error);
    });
  }

  private updateSession(accountId: string, updates: Partial<SessionInfo>): void {
    const session = this.sessions.get(accountId);
    if (!session) {
      console.error(`[WhatsApp Web] updateSession: Session not found for ${accountId}`);
      return;
    }

    // Log if sessionData is being updated
    if (updates.sessionData !== undefined) {
      const hasSessionData = !!updates.sessionData;
      const sessionDataType = typeof updates.sessionData;
      const sessionDataKeys = updates.sessionData && typeof updates.sessionData === 'object' ? Object.keys(updates.sessionData).length : 0;
      console.log(`[WhatsApp Web] updateSession: Updating sessionData for ${accountId}:`, {
        hasSessionData,
        type: sessionDataType,
        keys: sessionDataKeys,
      });
    }

    Object.assign(session, updates);
    
    console.log(`[WhatsApp Web] updateSession: Updating ${accountId} with:`, Object.keys(updates));
    
    // Verify sessionData was actually assigned
    if (updates.sessionData !== undefined) {
      const sessionHasData = !!(session.sessionData);
      const sessionDataType = typeof session.sessionData;
      const sessionDataKeys = session.sessionData && typeof session.sessionData === 'object' ? Object.keys(session.sessionData).length : 0;
      console.log(`[WhatsApp Web] updateSession: After assignment, session.sessionData exists: ${sessionHasData}, type: ${sessionDataType}, keys: ${sessionDataKeys}`);
    }

    this.saveSessionToDatabase(session).catch(error => {
      console.error(`[WhatsApp Web] Failed to update session:`, error);
    });
  }

  private async saveSessionToDatabase(sessionInfo: SessionInfo): Promise<void> {
    const {
      accountId,
      userId,
      tenantId,
      environment,
      status,
      phoneNumber,
      qrCode,
      connectedAt,
      lastSeenAt,
      errorMessage,
      clientInfo,
    } = sessionInfo;

    // LocalAuth: Session data is stored on disk, not in database
    // Database only stores metadata for tracking and UI display

    const existing = await db.query.whatsappWebSessions.findFirst({
      where: eq(whatsappWebSessions.accountId, accountId),
    });

    const data: any = {
      tenantId,
      environment,
      userId,
      accountId,
      phoneNumber: phoneNumber || null,
      status,
      qrCode: qrCode || null,
      connectedAt: connectedAt || null,
      lastSeenAt: lastSeenAt || null,
      disconnectedAt: status === 'disconnected' ? new Date() : null,
      errorMessage: errorMessage || null,
      clientInfo: clientInfo || null,
      updatedAt: new Date(),
      // LocalAuth: sessionData column not used, set to null
      sessionData: null,
    };

    if (existing) {
      await db.update(whatsappWebSessions)
        .set(data)
        .where(eq(whatsappWebSessions.id, existing.id));
    } else {
      await db.insert(whatsappWebSessions).values(data);
    }
  }

  /**
   * Helper method to properly logout from WhatsApp and clean up session files
   * This ensures the device is removed from the user's phone
   */
  private async logoutAndCleanup(accountId: string, session: SessionInfo): Promise<void> {
    console.log(`[WhatsApp Web] 🚪 Attempting to logout from WhatsApp for ${accountId}...`);
    
    // First, try to logout from WhatsApp to remove device from phone
    if (session.client && session.status === 'ready') {
      try {
        // ENHANCED: Use direct WhatsApp Web Store access for more reliable logout
        console.log(`[WhatsApp Web] Attempting logout via WhatsApp Web Store API...`);
        
        // Try to access WhatsApp's internal logout function directly
        try {
          const pupPage = (session.client as any).pupPage || (session.client as any).page;
          if (pupPage) {
            await pupPage.evaluate(() => {
              try {
                // Access WhatsApp Web's internal Store and trigger logout
                const Store = (window as any).Store;
                if (Store && Store.AppState) {
                  console.log('[WhatsApp Web Internal] Triggering logout via Store.AppState');
                  Store.AppState.logout();
                  return true;
                }
                return false;
              } catch (e) {
                console.error('[WhatsApp Web Internal] Store.AppState.logout failed:', e);
                return false;
              }
            });
            console.log(`[WhatsApp Web] ✅ Triggered logout via WhatsApp Web Store API`);
            
            // Wait a bit for the Store logout to initiate before calling client.logout()
            // This helps avoid race conditions with browser target closing
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        } catch (storeError: any) {
          // Ignore "Target closed" errors as they indicate logout is working
          if (!storeError.message?.includes('Target closed') && !storeError.message?.includes('Protocol error')) {
            console.warn(`[WhatsApp Web] ⚠️  Direct Store logout failed: ${storeError.message}`);
          }
        }
        
        // Also call the standard logout method (backup)
        await session.client.logout();
        console.log(`[WhatsApp Web] ✅ Called client.logout()`);
        
        // IMPORTANT: Wait for logout to propagate to WhatsApp servers
        // WhatsApp needs time to process the logout signal
        console.log(`[WhatsApp Web] ⏳ Waiting 3 seconds for logout to propagate to WhatsApp servers...`);
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        console.log(`[WhatsApp Web] ✅ Logout completed - device should be removed from phone`);
      } catch (logoutError: any) {
        // Logout can fail if already disconnected, which is fine
        console.warn(`[WhatsApp Web] ⚠️  Logout failed (may already be disconnected): ${logoutError.message}`);
      }
    } else {
      console.log(`[WhatsApp Web] ⏭️  Skipping logout (session not ready or client not available)`);
    }
    
    // Then destroy the client (close browser)
    if (session.client) {
      try {
        await session.client.destroy();
        console.log(`[WhatsApp Web] ✅ Browser closed`);
      } catch (error: any) {
        console.warn(`[WhatsApp Web] Error closing browser: ${error.message}`);
      }
    }
    
    // Finally, delete session files after browser closes
    const sessionCacheDir = path.join(this.cacheDataPath, `session-${accountId}`);
    setTimeout(() => {
      if (fs.existsSync(sessionCacheDir)) {
        try {
          fs.rmSync(sessionCacheDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
          console.log(`[WhatsApp Web] ✅ Session files deleted`);
        } catch (error: any) {
          console.error(`[WhatsApp Web] ❌ Failed to delete session files: ${error.message}`);
        }
      }
    }, 2000); // Increased to 2 seconds to ensure browser fully closed
  }

  async destroySession(accountId: string, shouldLogout: boolean = true): Promise<void> {
    console.log(`[WhatsApp Web] Destroying session ${accountId}${shouldLogout ? ' (with logout)' : ''}`);
    
    const session = this.sessions.get(accountId);
    if (session) {
      // Clean up monitor intervals
      const sessionAny = session as any;
      if (sessionAny._monitorInterval) {
        clearInterval(sessionAny._monitorInterval);
        console.log(`[WhatsApp Web] ✅ Cleared monitor interval for ${accountId}`);
      }
      if (sessionAny._presenceInterval) {
        clearInterval(sessionAny._presenceInterval);
        console.log(`[WhatsApp Web] ✅ Cleared presence interval for ${accountId}`);
      }
      
      // Logout and cleanup if requested
      if (shouldLogout) {
        await this.logoutAndCleanup(accountId, session);
      } else {
        // Just destroy client without logout (user already logged out from phone)
        if (session.client) {
          try {
            await session.client.destroy();
            console.log(`[WhatsApp Web] ✅ Client destroyed (browser closed)`);
          } catch (error) {
            console.error(`[WhatsApp Web] Error destroying client:`, error);
          }
        }
        
        // Still clean up session files
        const sessionCacheDir = path.join(this.cacheDataPath, `session-${accountId}`);
        setTimeout(() => {
          if (fs.existsSync(sessionCacheDir)) {
            try {
              console.log(`[WhatsApp Web] Deleting local session directory: ${sessionCacheDir}`);
              fs.rmSync(sessionCacheDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
              console.log(`[WhatsApp Web] ✅ Local session directory deleted successfully`);
            } catch (error: any) {
              console.error(`[WhatsApp Web] ❌ Failed to delete local session directory:`, error.message);
            }
          }
        }, 1000);
      }
    }

    this.sessions.delete(accountId);

    const dbSession = await db.query.whatsappWebSessions.findFirst({
      where: eq(whatsappWebSessions.accountId, accountId),
    });

    if (dbSession) {
      await db.update(whatsappWebSessions)
        .set({
          status: 'disconnected',
          disconnectedAt: new Date(),
          updatedAt: new Date(),
          qrCode: null,
          // LocalAuth: sessionData column not used
        })
        .where(eq(whatsappWebSessions.id, dbSession.id));
    }
  }

  async recoverSessions(): Promise<void> {
    console.log('[WhatsApp Web] Recovering sessions from database...');
    console.log('[WhatsApp Web] Using LocalAuth - checking for session files on disk');

    // With LocalAuth, we look for sessions that have local session files on disk
    // Database records are just metadata - the actual session data is in filesystem
    const activeSessions = await db.query.whatsappWebSessions.findMany({
      where: and(
        or(
          eq(whatsappWebSessions.status, 'ready'),
          eq(whatsappWebSessions.status, 'authenticated')
          // Don't recover 'disconnected' sessions - they need fresh QR authentication
        ),
        eq(whatsappWebSessions.environment, process.env.NODE_ENV || 'development')
      ),
    });

    console.log(`[WhatsApp Web] Found ${activeSessions.length} active sessions in database (status: ready or authenticated)`);
    
    // Check which sessions have LocalAuth session files on disk
    // LocalAuth stores: session-{accountId}/Default/ (browser profile)
    const sessionsWithFiles: typeof activeSessions = [];
    const sessionsWithoutFiles: typeof activeSessions = [];
    
    for (const session of activeSessions) {
      const sessionCachePath = path.join(this.cacheDataPath, `session-${session.accountId}`);
      const defaultProfilePath = path.join(sessionCachePath, 'Default');
      const sessionExists = fs.existsSync(defaultProfilePath);
      
      if (sessionExists) {
        sessionsWithFiles.push(session);
      } else {
        sessionsWithoutFiles.push(session);
      }
    }
    
    console.log(`[WhatsApp Web] Sessions with local session files: ${sessionsWithFiles.length}`);
    console.log(`[WhatsApp Web] Sessions without local session files: ${sessionsWithoutFiles.length}`);
    
    if (sessionsWithoutFiles.length > 0) {
      console.warn(`[WhatsApp Web] ⚠️  Found ${sessionsWithoutFiles.length} sessions without session files:`);
      sessionsWithoutFiles.forEach(s => {
        console.warn(`[WhatsApp Web]   - ${s.accountId} (status: ${s.status}, updated: ${s.updatedAt})`);
      });
    }

    // Deduplicate by accountId - keep only the most recent session per account
    // Prioritize sessions with local session files
    const sessionsByAccount = new Map<string, typeof activeSessions[0]>();
    for (const session of sessionsWithFiles) {
      const existing = sessionsByAccount.get(session.accountId);
      if (!existing) {
        sessionsByAccount.set(session.accountId, session);
      } else {
        // Use most recent if multiple sessions for same account
        if (session.updatedAt && existing.updatedAt && session.updatedAt > existing.updatedAt) {
          sessionsByAccount.set(session.accountId, session);
        }
      }
    }

    const uniqueSessions = Array.from(sessionsByAccount.values());
    if (sessionsWithFiles.length !== uniqueSessions.length) {
      console.warn(
        `[WhatsApp Web] Found ${sessionsWithFiles.length} sessions but ${uniqueSessions.length} unique accounts. ` +
        `Deduplicating to recover only the most recent session per account.`
      );
    }
    
    console.log(`[WhatsApp Web] Will attempt to recover ${uniqueSessions.length} sessions with local session files`);
    if (sessionsWithoutFiles.length > 0) {
      console.warn(`[WhatsApp Web] Skipping ${sessionsWithoutFiles.length} sessions without local session files (will require QR re-authentication)`);
    }
    
    const sessionsToRecover = uniqueSessions;

    for (const session of sessionsToRecover) {
      try {
        // Skip if session already exists in memory (from previous recovery attempt)
        if (this.sessions.has(session.accountId)) {
          const existing = this.sessions.get(session.accountId)!;
          if (existing.status === 'ready' || existing.status === 'connecting' || existing.status === 'authenticated') {
            console.log(`[WhatsApp Web] Session ${session.accountId} already exists and is active, skipping recovery`);
            continue;
          }
        }

      // Check if LocalAuth session data exists
      // LocalAuth stores session in: {dataPath}/session-{clientId}/Default/ (browser profile)
      const sessionCachePath = path.join(this.cacheDataPath, `session-${session.accountId}`);
      const sessionExists = fs.existsSync(sessionCachePath);
      
      if (!sessionExists) {
        console.warn(
          `[WhatsApp Web] ⚠️  Session directory missing for ${session.accountId} at ${sessionCachePath}. ` +
          `Session cannot be recovered - user will need to re-authenticate via QR code. ` +
          `Skipping recovery for this session.`
        );
        continue; // Skip this session - can't recover without session data
      }
      
      // Check if session has the Default browser profile directory
      try {
        const sessionContents = fs.readdirSync(sessionCachePath);
        const hasDefaultProfile = sessionContents.includes('Default');
        
        if (hasDefaultProfile) {
          const defaultPath = path.join(sessionCachePath, 'Default');
          const defaultContents = fs.readdirSync(defaultPath);
          console.log(`[WhatsApp Web] ✅ Found session data for ${session.accountId} with Default profile (${defaultContents.length} files) - recovery should work`);
        } else {
          console.warn(
            `[WhatsApp Web] ⚠️  Session directory exists but missing Default profile for ${session.accountId}. ` +
            `Files found: ${sessionContents.join(', ')}. Recovery may fail.`
          );
        }
      } catch (error: any) {
        console.warn(`[WhatsApp Web] Could not read session contents: ${error.message}`);
      }
        
        await this.createSession({
          accountId: session.accountId,
          userId: session.userId,
          tenantId: session.tenantId,
          environment: session.environment,
        });
        
        console.log(`[WhatsApp Web] Recovered session ${session.accountId} - waiting for connection...`);
      } catch (error: any) {
        // Handle "Session already exists" error gracefully
        if (error.message === 'Session already exists and is active') {
          console.log(`[WhatsApp Web] Session ${session.accountId} already exists, skipping duplicate recovery`);
          continue;
        }
        
        console.error(`[WhatsApp Web] Failed to recover session ${session.accountId}:`, error);
        
        // Update status to disconnected to allow manual reconnection
        try {
          await db.update(whatsappWebSessions)
            .set({ 
              status: 'disconnected',
              errorMessage: error.message || 'Recovery failed after restart'
            })
            .where(eq(whatsappWebSessions.accountId, session.accountId));
          console.log(`[WhatsApp Web] Updated session ${session.accountId} status to disconnected`);
        } catch (updateError) {
          console.error(`[WhatsApp Web] Failed to update session status:`, updateError);
        }
      }
    }
  }

  getSession(accountId: string): SessionInfo | undefined {
    return this.sessions.get(accountId);
  }

  getAllSessions(): SessionInfo[] {
    return Array.from(this.sessions.values()).map(session => ({
      ...session,
      client: undefined,
      sessionData: undefined,
    }));
  }

  async getSessionStatus(accountId: string): Promise<SessionInfo | null> {
    const memorySession = this.sessions.get(accountId);
    if (memorySession) {
      return {
        ...memorySession,
        client: undefined,
        sessionData: undefined,
      };
    }

    const dbSession = await db.query.whatsappWebSessions.findFirst({
      where: eq(whatsappWebSessions.accountId, accountId),
    });

    if (!dbSession) return null;

    return {
      accountId: dbSession.accountId,
      userId: dbSession.userId,
      tenantId: dbSession.tenantId,
      environment: dbSession.environment,
      status: dbSession.status as SessionStatus,
      phoneNumber: dbSession.phoneNumber || undefined,
      qrCode: dbSession.qrCode || undefined,
      connectedAt: dbSession.connectedAt || undefined,
      lastSeenAt: dbSession.lastSeenAt || undefined,
      errorMessage: dbSession.errorMessage || undefined,
      clientInfo: dbSession.clientInfo as any,
    };
  }

  /**
   * Send a text message via WhatsApp Web
   */
  async sendTextMessage(accountId: string, to: string, text: string): Promise<{ messageId: string }> {
    const session = this.sessions.get(accountId);
    if (!session || !session.client) {
      throw new Error('Session not found or not connected');
    }

    if (session.status !== 'ready') {
      throw new Error(`Session not ready. Current status: ${session.status}`);
    }

    try {
      console.log(`[WhatsApp Web] Sending text message from ${accountId} to ${to}`);
      
      // Format phone number for WhatsApp Web (e.g., 5511999999999@c.us)
      const chatId = to.includes('@') ? to : `${to}@c.us`;
      
      const message = await session.client.sendMessage(chatId, text);
      
      console.log(`[WhatsApp Web] Message sent successfully: ${message.id._serialized}`);
      
      return { messageId: message.id._serialized };
    } catch (error) {
      console.error(`[WhatsApp Web] Failed to send message:`, error);
      throw error;
    }
  }

  /**
   * Send a media message via WhatsApp Web
   */
  async sendMediaMessage(
    accountId: string,
    to: string,
    mediaUrl: string,
    options?: { caption?: string; filename?: string }
  ): Promise<{ messageId: string }> {
    const session = this.sessions.get(accountId);
    if (!session || !session.client) {
      throw new Error('Session not found or not connected');
    }

    if (session.status !== 'ready') {
      throw new Error(`Session not ready. Current status: ${session.status}`);
    }

    try {
      console.log(`[WhatsApp Web] Sending media message from ${accountId} to ${to}`);
      
      // Format phone number for WhatsApp Web
      const chatId = to.includes('@') ? to : `${to}@c.us`;
      
      // Import MessageMedia from whatsapp-web.js
      const { MessageMedia } = await import('whatsapp-web.js');
      
      // Download and prepare media
      const media = await MessageMedia.fromUrl(mediaUrl, {
        filename: options?.filename,
      });
      
      const message = await session.client.sendMessage(chatId, media, {
        caption: options?.caption,
      });
      
      console.log(`[WhatsApp Web] Media message sent successfully: ${message.id._serialized}`);
      
      return { messageId: message.id._serialized };
    } catch (error) {
      console.error(`[WhatsApp Web] Failed to send media message:`, error);
      throw error;
    }
  }

  /**
   * Send a voice message (PTT - Push To Talk) via WhatsApp Web
   */
  async sendVoiceMessage(
    accountId: string,
    to: string,
    audioUrl: string
  ): Promise<{ messageId: string }> {
    const session = this.sessions.get(accountId);
    if (!session || !session.client) {
      throw new Error('Session not found or not connected');
    }

    if (session.status !== 'ready') {
      throw new Error(`Session not ready. Current status: ${session.status}`);
    }

    try {
      console.log(`[WhatsApp Web] Sending voice message from ${accountId} to ${to}`);
      
      // Format phone number for WhatsApp Web
      const chatId = to.includes('@') ? to : `${to}@c.us`;
      
      // Import MessageMedia from whatsapp-web.js
      const { MessageMedia } = await import('whatsapp-web.js');
      
      // Download and prepare audio media
      const media = await MessageMedia.fromUrl(audioUrl);
      
      // Send as PTT (Push To Talk / voice message)
      const message = await session.client.sendMessage(chatId, media, {
        sendAudioAsVoice: true, // This flag makes it a voice message
      });
      
      console.log(`[WhatsApp Web] Voice message sent successfully: ${message.id._serialized}`);
      
      return { messageId: message.id._serialized };
    } catch (error) {
      console.error(`[WhatsApp Web] Failed to send voice message:`, error);
      throw error;
    }
  }


  /**
   * Send a reply (quoted message) via WhatsApp Web
   */
  async sendReply(
    accountId: string, 
    chatId: string, 
    text: string, 
    quotedMessageId: string
  ): Promise<{ messageId: string }> {
    const session = this.sessions.get(accountId);
    if (!session || !session.client) {
      throw new Error('Session not found or not connected');
    }

    if (session.status !== 'ready') {
      throw new Error(`Session not ready. Current status: ${session.status}`);
    }

    try {
      console.log(`[WhatsApp Web] Sending reply to message ${quotedMessageId} in chat ${chatId}`);
      
      // Format chat ID
      const formattedChatId = chatId.includes('@') ? chatId : `${chatId}@c.us`;
      
      // Get the chat
      const chat = await session.client.getChatById(formattedChatId);
      
      // Fetch recent messages to find the quoted message
      const messages = await chat.fetchMessages({ limit: 100 });
      const quotedMessage = messages.find(m => 
        m.id.id === quotedMessageId || m.id._serialized === quotedMessageId
      );
      
      if (!quotedMessage) {
        throw new Error(`Quoted message ${quotedMessageId} not found`);
      }
      
      // Send reply with quote
      const sentMessage = await quotedMessage.reply(text);
      
      console.log(`[WhatsApp Web] ✅ Reply sent successfully: ${sentMessage.id._serialized}`);
      
      return { messageId: sentMessage.id._serialized };
    } catch (error) {
      console.error(`[WhatsApp Web] Failed to send reply:`, error);
      throw error;
    }
  }

  /**
   * Send a poll via WhatsApp Web
   */
  async sendPoll(
    accountId: string,
    chatId: string,
    question: string,
    options: string[],
    allowMultipleAnswers: boolean = false
  ): Promise<{ messageId: string }> {
    const session = this.sessions.get(accountId);
    if (!session || !session.client) {
      throw new Error('Session not found or not connected');
    }

    if (session.status !== 'ready') {
      throw new Error(`Session not ready. Current status: ${session.status}`);
    }

    try {
      console.log(`[WhatsApp Web] Sending poll to ${chatId}`);
      
      // Format chat ID
      const formattedChatId = chatId.includes('@') ? chatId : `${chatId}@c.us`;
      
      // Import Poll from whatsapp-web.js
      const pollPkg = await import('whatsapp-web.js');
      const Poll = (pollPkg as any).Poll || (pollPkg as any).default?.Poll;
      
      if (!Poll) {
        throw new Error('Poll class not found in whatsapp-web.js');
      }
      
      // Create poll
      const poll = new Poll(question, options, {
        allowMultipleAnswers,
      });
      
      // Send poll
      const message = await session.client.sendMessage(formattedChatId, poll);
      
      console.log(`[WhatsApp Web] ✅ Poll sent successfully: ${message.id._serialized}`);
      
      return { messageId: message.id._serialized };
    } catch (error) {
      console.error(`[WhatsApp Web] Failed to send poll:`, error);
      throw error;
    }
  }

  /**
   * Send a sticker via WhatsApp Web
   */
  async sendSticker(
    accountId: string,
    chatId: string,
    mediaUrl: string
  ): Promise<{ messageId: string }> {
    const session = this.sessions.get(accountId);
    if (!session || !session.client) {
      throw new Error('Session not found or not connected');
    }

    if (session.status !== 'ready') {
      throw new Error(`Session not ready. Current status: ${session.status}`);
    }

    try {
      console.log(`[WhatsApp Web] Sending sticker to ${chatId}`);
      
      // Format chat ID
      const formattedChatId = chatId.includes('@') ? chatId : `${chatId}@c.us`;
      
      // Import MessageMedia from whatsapp-web.js
      const { MessageMedia } = await import('whatsapp-web.js');
      
      // Download and prepare media
      const media = await MessageMedia.fromUrl(mediaUrl);
      
      // Send as sticker
      const message = await session.client.sendMessage(formattedChatId, media, {
        sendMediaAsSticker: true,
      });
      
      console.log(`[WhatsApp Web] ✅ Sticker sent successfully: ${message.id._serialized}`);
      
      return { messageId: message.id._serialized };
    } catch (error) {
      console.error(`[WhatsApp Web] Failed to send sticker:`, error);
      throw error;
    }
  }

  /**
   * Forward a message to another chat
   */
  async forwardMessage(
    accountId: string,
    messageId: string,
    toChatId: string
  ): Promise<{ messageId: string }> {
    const session = this.sessions.get(accountId);
    if (!session || !session.client) {
      throw new Error('Session not found or not connected');
    }

    if (session.status !== 'ready') {
      throw new Error(`Session not ready. Current status: ${session.status}`);
    }

    try {
      console.log(`[WhatsApp Web] Forwarding message ${messageId} to ${toChatId}`);
      
      // Format destination chat ID
      const formattedToChatId = toChatId.includes('@') ? toChatId : `${toChatId}@c.us`;
      
      // Get all chats to find the message
      const chats = await session.client.getChats();
      
      for (const chat of chats) {
        try {
          const messages = await chat.fetchMessages({ limit: 100 });
          const targetMessage = messages.find(m => 
            m.id.id === messageId || m.id._serialized === messageId
          );
          
          if (targetMessage) {
            // Forward the message
            await targetMessage.forward(formattedToChatId);
            console.log(`[WhatsApp Web] ✅ Message forwarded successfully`);
            return { messageId: targetMessage.id._serialized };
          }
        } catch (error) {
          // Continue searching in other chats
        }
      }
      
      throw new Error(`Message ${messageId} not found`);
    } catch (error) {
      console.error(`[WhatsApp Web] Failed to forward message:`, error);
      throw error;
    }
  }

  /**
   * Send a location message via WhatsApp Web
   */
  async sendLocationMessage(
    accountId: string,
    to: string,
    latitude: number,
    longitude: number,
    options?: { name?: string; address?: string }
  ): Promise<{ messageId: string }> {
    const session = this.sessions.get(accountId);
    if (!session || !session.client) {
      throw new Error('Session not found or not connected');
    }

    if (session.status !== 'ready') {
      throw new Error(`Session not ready. Current status: ${session.status}`);
    }

    try {
      console.log(`[WhatsApp Web] Sending location message from ${accountId} to ${to}`);
      
      // Format phone number for WhatsApp Web
      const chatId = to.includes('@') ? to : `${to}@c.us`;
      
      // Import Location from whatsapp-web.js (dynamic import to handle CommonJS)
      const locationPkg = await import('whatsapp-web.js');
      const Location = (locationPkg as any).Location || (locationPkg as any).default?.Location;
      
      if (!Location) {
        throw new Error('Location class not found in whatsapp-web.js');
      }
      
      // Location constructor: (latitude, longitude, name?)
      const locationName = options?.name || options?.address;
      const location = locationName 
        ? new Location(latitude, longitude, locationName)
        : new Location(latitude, longitude);
      
      // sendMessage accepts Location object directly - use type assertion to bypass TypeScript check
      const message = await (session.client as any).sendMessage(chatId, location as any);
      
      console.log(`[WhatsApp Web] Location message sent successfully: ${message.id._serialized}`);
      
      return { messageId: message.id._serialized };
    } catch (error) {
      console.error(`[WhatsApp Web] Failed to send location message:`, error);
      throw error;
    }
  }

  /**
   * Sync chat history for specific phone numbers
   * Fetches messages only for the specified contacts
   */
  async syncSpecificContacts(accountId: string, options: { 
    phoneNumbers: string[];
    messagesPerChat?: number;
  }): Promise<{ 
    success: boolean; 
    contactsProcessed: number; 
    messagesProcessed: number;
    errors: string[];
  }> {
    const session = this.sessions.get(accountId);
    if (!session || !session.client) {
      throw new Error('Session not found or not connected');
    }

    if (session.status !== 'ready') {
      throw new Error(`Session not ready. Current status: ${session.status}`);
    }

    const phoneNumbers = options.phoneNumbers || [];
    const messagesPerChat = options.messagesPerChat || 50;

    console.log(`[WhatsApp Web] Starting sync for ${phoneNumbers.length} specific contacts`);
    console.log(`[WhatsApp Web] Sync parameters: ${messagesPerChat} messages per contact`);

    let contactsProcessed = 0;
    let messagesProcessed = 0;
    const errors: string[] = [];

    try {
      // Get account details for tenant info
      const account = await db.query.whatsappAccounts.findFirst({
        where: eq(whatsappAccounts.id, accountId),
      });

      if (!account) {
        throw new Error(`Account not found: ${accountId}`);
      }

      const accountPhone = account.phoneNumber || '';

      // Process each phone number
      for (const phoneNumber of phoneNumbers) {
        try {
          // Normalize phone number (remove non-digits)
          const normalizedPhone = phoneNumber.replace(/\D/g, '');
          
          console.log(`[WhatsApp Web] Syncing contact: ${normalizedPhone}`);

          // Format chat ID
          const chatId = normalizedPhone.includes('@') ? normalizedPhone : `${normalizedPhone}@c.us`;

          // Get the chat
          let chat;
          try {
            chat = await session.client.getChatById(chatId);
          } catch (error: any) {
            console.warn(`[WhatsApp Web] Chat not found for ${normalizedPhone}: ${error.message}`);
            errors.push(`${normalizedPhone}: Chat not found`);
            continue;
          }

          // Get contact name
          let contactName = normalizedPhone;
          try {
            const waContact = await chat.getContact();
            if (waContact.name && this.isValidContactName(waContact.name, normalizedPhone, accountPhone)) {
              contactName = waContact.name;
            }
            console.log(`[WhatsApp Web] Contact name: ${contactName}`);
          } catch (error) {
            console.warn(`[WhatsApp Web] Could not fetch contact name for ${normalizedPhone}`);
          }

          // Ensure contact exists in database
          let contact = await db.query.whatsappContacts.findFirst({
            where: and(
              eq(whatsappContacts.accountId, accountId),
              eq(whatsappContacts.phoneNumber, normalizedPhone)
            ),
          });

          if (!contact) {
            const [newContact] = await db.insert(whatsappContacts)
              .values({
                tenantId: account.tenantId,
                accountId,
                phoneNumber: normalizedPhone,
                name: contactName,
                lastMessageAt: new Date(),
                messageCount: 0,
              })
              .returning();
            contact = newContact;
          } else {
            // Update contact name if it changed
            await db.update(whatsappContacts)
              .set({
                name: contactName,
              })
              .where(eq(whatsappContacts.id, contact.id));
          }

          // Ensure conversation exists
          const waConversationId = this.normalizeWaConversationId(accountPhone, normalizedPhone);
          let conversation = await db.query.whatsappConversations.findFirst({
            where: and(
              eq(whatsappConversations.accountId, accountId),
              eq(whatsappConversations.waConversationId, waConversationId)
            ),
          });

          if (!conversation) {
            const [newConversation] = await db.insert(whatsappConversations)
              .values({
                tenantId: account.tenantId,
                accountId,
                contactId: contact.id,
                waConversationId,
                title: contactName,
                status: 'active',
                lastInboundMessageAt: null,
                lastOutboundMessageAt: null,
                unreadCount: 0,
                messageCount: 0,
              })
              .returning();
            conversation = newConversation;
          }

          // Fetch messages for this chat
          const messages = await chat.fetchMessages({ limit: messagesPerChat });
          console.log(`[WhatsApp Web] Fetched ${messages.length} messages from ${contactName}`);

          // Process each message
          for (const message of messages) {
            try {
              // Check if message already exists
              const existingMessage = await db.query.whatsappMessages.findFirst({
                where: and(
                  eq(whatsappMessages.accountId, accountId),
                  eq(whatsappMessages.waMessageId, message.id.id)
                ),
              });

              if (existingMessage) {
                // Message already exists, skip
                continue;
              }

              const from = message.from.replace('@c.us', '').replace('@g.us', '');
              const to = message.to.replace('@c.us', '').replace('@g.us', '');
              const messageTimestamp = new Date(message.timestamp * 1000);

              // Save message to database
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
                text: message.body || null,
                status: 'delivered',
                timestamp: messageTimestamp,
                mediaUrl: null,
                mediaMimeType: null,
              });

              messagesProcessed++;
            } catch (msgError: any) {
              console.error(`[WhatsApp Web] Error processing message ${message.id.id}:`, msgError);
              errors.push(`Message ${message.id.id}: ${msgError.message}`);
            }
          }

          // Update conversation stats
          await db.update(whatsappConversations)
            .set({
              messageCount: messages.length,
            })
            .where(eq(whatsappConversations.id, conversation.id));

          // Update contact stats
          await db.update(whatsappContacts)
            .set({
              messageCount: messages.length,
              lastMessageAt: new Date(),
            })
            .where(eq(whatsappContacts.id, contact.id));

          contactsProcessed++;
          console.log(`[WhatsApp Web] ✅ Synced ${messages.length} messages for ${contactName}`);
        } catch (contactError: any) {
          console.error(`[WhatsApp Web] Error processing contact ${phoneNumber}:`, contactError);
          errors.push(`${phoneNumber}: ${contactError.message}`);
        }
      }

      console.log(`[WhatsApp Web] Sync completed: ${contactsProcessed}/${phoneNumbers.length} contacts, ${messagesProcessed} messages`);

      return {
        success: true,
        contactsProcessed,
        messagesProcessed,
        errors,
      };
    } catch (error: any) {
      console.error(`[WhatsApp Web] Fatal error during sync:`, error);
      throw error;
    }
  }

  /**
   * Sync chat history from WhatsApp Web (DEPRECATED - use syncSpecificContacts instead)
   * Fetches all chats and their messages, saving them to the database
   */
  async syncChatHistory(accountId: string, options?: { 
    limit?: number; 
    messagesPerChat?: number;
    filterByBusiness?: boolean; // Filter to sync only business-looking contacts
    excludeGroups?: boolean; // Exclude group chats (default: true)
  }): Promise<{ 
    success: boolean; 
    chatsProcessed: number; 
    messagesProcessed: number;
    errors: string[];
    skippedChats?: number;
  }> {
    const session = this.sessions.get(accountId);
    if (!session || !session.client) {
      throw new Error('Session not found or not connected');
    }

    if (session.status !== 'ready') {
      throw new Error(`Session not ready. Current status: ${session.status}`);
    }

    const limit = options?.limit || 10; // Default: sync 10 most recent chats
    const messagesPerChat = options?.messagesPerChat || 10; // Default: 10 messages per chat
    const filterByBusiness = options?.filterByBusiness || false;
    const excludeGroups = options?.excludeGroups !== false; // Default: true

    console.log(`[WhatsApp Web] Starting chat history sync for ${accountId}`);
    console.log(`[WhatsApp Web] Sync parameters: ${limit} chats, ${messagesPerChat} messages per chat`);
    console.log(`[WhatsApp Web] Filter by business: ${filterByBusiness}, Exclude groups: ${excludeGroups}`);

    let chatsProcessed = 0;
    let messagesProcessed = 0;
    let skippedChats = 0;
    const errors: string[] = [];

    try {
      // Get account details for tenant info
      const account = await db.query.whatsappAccounts.findFirst({
        where: eq(whatsappAccounts.id, accountId),
      });

      if (!account) {
        throw new Error(`Account not found: ${accountId}`);
      }

      const accountPhone = account.phoneNumber || '';

      // Fetch all chats
      console.log(`[WhatsApp Web] Fetching chats...`);
      const chats = await session.client.getChats();
      console.log(`[WhatsApp Web] Found ${chats.length} total chats`);

      // Filter and sort chats
      let filteredChats = chats;
      
      // Filter groups if requested
      if (excludeGroups) {
        filteredChats = filteredChats.filter(chat => !chat.isGroup);
        console.log(`[WhatsApp Web] Filtered out group chats`);
      }
      
      // Filter by business accounts if requested (using proper WhatsApp metadata)
      if (filterByBusiness) {
        console.log(`[WhatsApp Web] Fetching contact info to filter business accounts...`);
        const beforeBusinessFilter = filteredChats.length;
        
        // Check each chat's contact to see if it's a business account
        const businessChats = [];
        let contactFetchFailed = false;
        let failureCount = 0;
        
        for (const chat of filteredChats) {
          try {
            // Try to access business info directly from chat object without calling getContact()
            // The chat object should have contact information embedded
            const chatAny = chat as any;
            
            let isBusiness = false;
            let contactName = chat.name || chat.id.user;
            let method = 'unknown';
            
            // Method 1: Check if chat object has isBusiness property directly
            if (chatAny.isBusiness !== undefined) {
              isBusiness = chatAny.isBusiness === true;
              method = 'chat.isBusiness';
              console.log(`[WhatsApp Web] ${isBusiness ? '✅ Business' : '⏭️  Personal'} account: ${contactName} (via ${method})`);
            }
            // Method 2: Check if contact is embedded in chat object
            else if (chatAny.contact) {
              const contactAny = chatAny.contact as any;
              isBusiness = contactAny.isBusiness === true || !!contactAny.businessProfile;
              method = 'chat.contact.isBusiness';
              
              // ONLY use saved name, NOT pushname
              if (contactAny.name && this.isValidContactName(contactAny.name, chat.id.user, accountPhone)) {
                contactName = contactAny.name;
              }
              
              console.log(`[WhatsApp Web] ${isBusiness ? '✅ Business' : '⏭️  Personal'} account: ${contactName} (via ${method})`);
            }
            // Method 3: Try accessing via Puppeteer page directly
            else {
              try {
                const page = (session.client as any).pupPage || (session.client as any).page;
                if (page) {
                  const contactId = chat.id._serialized;
                  const businessInfo = await page.evaluate((id: string) => {
                    try {
                      // Access WhatsApp Web's internal store directly
                      const Store = (window as any).Store;
                      const contact = Store?.Contact?.get?.(id);
                      
                      if (contact) {
                        return {
                          isBusiness: contact.isBusiness === true,
                          isEnterprise: contact.isEnterprise === true,
                          verifiedName: contact.verifiedName,
                          name: contact.name || null, // ONLY get saved name, NOT pushname
                        };
                      }
                      return null;
                    } catch (e) {
                      return null;
                    }
                  }, contactId);
                  
                  if (businessInfo) {
                    isBusiness = businessInfo.isBusiness;
                    
                    // ONLY use saved contact name if it exists and is valid
                    if (businessInfo.name && this.isValidContactName(businessInfo.name, chat.id.user, accountPhone)) {
                      contactName = businessInfo.name;
                    }
                    
                    method = 'page.evaluate(Store.Contact)';
                    console.log(`[WhatsApp Web] ${isBusiness ? '✅ Business' : '⏭️  Personal'} account: ${contactName} (via ${method})`);
                  } else {
                    throw new Error('Could not access contact via page.evaluate');
                  }
                } else {
                  throw new Error('No puppeteer page available');
                }
              } catch (evalError: any) {
                console.warn(`[WhatsApp Web] ⚠️  Direct page evaluation failed for ${contactName}: ${evalError.message}`);
                throw evalError; // Let outer catch handle it
              }
            }
            
            // Add to business chats if it's a business account
            if (isBusiness) {
              businessChats.push(chat);
            } else {
              // Skip personal accounts when business filter is enabled
            }
          } catch (error: any) {
            failureCount++;
            
            // Only log the first failure in detail
            if (!contactFetchFailed) {
              contactFetchFailed = true;
              console.error(
                `[WhatsApp Web] ❌ Failed to determine business status for chats.` +
                ` Error: ${error.message}`
              );
              console.error(
                `[WhatsApp Web] ❌ WhatsApp Web API compatibility issue detected.` +
                ` Business filtering cannot proceed reliably.`
              );
            }
            
            // Don't include chats we can't verify - respect the business filter
            // Skip this individual chat
          }
        }
        
        if (contactFetchFailed) {
          console.error(
            `[WhatsApp Web] ❌ Business filtering failed: Could not fetch contact info for ${failureCount}/${filteredChats.length} chats.` +
            ` Only ${businessChats.length} contacts were successfully checked.` +
            ` Consider: 1) Disabling business filter, or 2) Reporting issue with wweb.js version ${require('whatsapp-web.js/package.json').version}`
          );
          
          // Return error in result so user knows filtering didn't work
          errors.push(`Business filtering partially failed: Only ${businessChats.length}/${filteredChats.length} contacts could be checked due to WhatsApp Web API issues`);
        }
        
        filteredChats = businessChats;
        const afterBusinessFilter = filteredChats.length;
        skippedChats = beforeBusinessFilter - afterBusinessFilter;
        
        if (skippedChats > 0) {
          console.log(`[WhatsApp Web] ✅ Business filter: ${afterBusinessFilter} business accounts out of ${beforeBusinessFilter} total (skipped ${skippedChats} non-business or unverifiable chats)`);
        } else if (contactFetchFailed && businessChats.length === 0) {
          console.error(`[WhatsApp Web] ❌ Business filter completely failed - no contacts could be verified`);
        } else {
          console.log(`[WhatsApp Web] ✅ Business filter: All ${afterBusinessFilter} verified chats are business accounts`);
        }
      }
      
      // Sort by last message timestamp (most recent first)
      const sortedChats = filteredChats
        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
        .slice(0, limit);

      console.log(`[WhatsApp Web] Processing ${sortedChats.length} chats`);

      // Process each chat
      for (const chat of sortedChats) {
        try {
          const contactPhone = chat.id.user;
          let contactName = chat.name || contactPhone;
          
          // Skip if this is the user's own number (shouldn't happen but check anyway)
          if (accountPhone && contactPhone === accountPhone.replace(/\D/g, '')) {
            console.log(`[WhatsApp Web] ⏭️  Skipping own number: ${contactPhone}`);
            continue;
          }
          
          // Fetch contact info to get business metadata
          let isBusiness = false;
          let isEnterprise = false;
          
          try {
            const waContact = await chat.getContact();
            // Type assertion needed as whatsapp-web.js types don't include business fields at compile time
            const contactAny = waContact as any;
            
            // ONLY use saved contact name (what user saved in their phone)
            // Do NOT use pushname - if not saved, we want to show phone number
            if (waContact.name && this.isValidContactName(waContact.name, contactPhone, accountPhone)) {
              contactName = waContact.name;
            } else {
              // Use phone number if not saved or name is invalid (e.g., own number)
              contactName = contactPhone;
              if (waContact.name && waContact.name !== contactPhone) {
                console.log(`[WhatsApp Web] ⚠️  Rejected contact name "${waContact.name}" for ${contactPhone}, using phone number`);
              }
            }
            
            isBusiness = contactAny.isBusiness === true;
            isEnterprise = contactAny.isEnterprise === true;
            
            console.log(`[WhatsApp Web] Syncing chat with ${contactName} (${contactPhone}) [Business: ${isBusiness}, Enterprise: ${isEnterprise}]`);
          } catch (error) {
            console.warn(`[WhatsApp Web] Could not fetch contact metadata for ${contactPhone}:`, error);
            console.log(`[WhatsApp Web] Syncing chat with ${contactName} (${contactPhone})`);
          }

          // Ensure contact exists in database
          let contact = await db.query.whatsappContacts.findFirst({
            where: and(
              eq(whatsappContacts.accountId, accountId),
              eq(whatsappContacts.phoneNumber, contactPhone)
            ),
          });

          if (!contact) {
            const [newContact] = await db.insert(whatsappContacts)
              .values({
                tenantId: account.tenantId,
                accountId,
                phoneNumber: contactPhone,
                name: contactName,
                lastMessageAt: new Date(),
                messageCount: 0,
              })
              .returning();
            contact = newContact;
            
            // Log if this is a business account (for info purposes)
            if (isBusiness) {
              console.log(`[WhatsApp Web] ✅ Business account: ${contactName} (${contactPhone})`);
            }
          } else {
            // Update contact name if it changed
            await db.update(whatsappContacts)
              .set({
                name: contactName,
              })
              .where(eq(whatsappContacts.id, contact.id));
          }

          // Ensure conversation exists
          const waConversationId = this.normalizeWaConversationId(accountPhone, contactPhone);
          let conversation = await db.query.whatsappConversations.findFirst({
            where: and(
              eq(whatsappConversations.accountId, accountId),
              eq(whatsappConversations.waConversationId, waConversationId)
            ),
          });

          if (!conversation) {
            const [newConversation] = await db.insert(whatsappConversations)
              .values({
                tenantId: account.tenantId,
                accountId,
                contactId: contact.id,
                waConversationId,
                title: contactName,
                status: 'active',
                lastInboundMessageAt: null,
                lastOutboundMessageAt: null,
                unreadCount: 0,
                messageCount: 0,
              })
              .returning();
            conversation = newConversation;
          }

          // Fetch messages for this chat
          const messages = await chat.fetchMessages({ limit: messagesPerChat });
          console.log(`[WhatsApp Web] Fetched ${messages.length} messages from chat with ${contactName}`);

          // Process each message
          for (const message of messages) {
            try {
              // Check if message already exists
              const existingMessage = await db.query.whatsappMessages.findFirst({
                where: and(
                  eq(whatsappMessages.accountId, accountId),
                  eq(whatsappMessages.waMessageId, message.id.id)
                ),
              });

              if (existingMessage) {
                // Message already exists, skip
                continue;
              }

              const from = message.from.replace('@c.us', '').replace('@g.us', '');
              const to = message.to.replace('@c.us', '').replace('@g.us', '');
              const isGroup = message.from.endsWith('@g.us');
              const messageTimestamp = new Date(message.timestamp * 1000);

              // Save message to database
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
                text: message.body || null,
                status: 'delivered',
                timestamp: messageTimestamp,
                mediaUrl: null,
                mediaMimeType: null,
              });

              messagesProcessed++;
            } catch (msgError: any) {
              console.error(`[WhatsApp Web] Error processing message ${message.id.id}:`, msgError);
              errors.push(`Message ${message.id.id}: ${msgError.message}`);
            }
          }

          // Update conversation stats
          await db.update(whatsappConversations)
            .set({
              messageCount: messages.length,
            })
            .where(eq(whatsappConversations.id, conversation.id));

          // Update contact stats
          await db.update(whatsappContacts)
            .set({
              messageCount: messages.length,
              lastMessageAt: new Date(),
            })
            .where(eq(whatsappContacts.id, contact.id));

          chatsProcessed++;
        } catch (chatError: any) {
          console.error(`[WhatsApp Web] Error processing chat:`, chatError);
          errors.push(`Chat error: ${chatError.message}`);
        }
      }

      console.log(`[WhatsApp Web] Sync completed: ${chatsProcessed} chats, ${messagesProcessed} messages`);
      if (filterByBusiness) {
        console.log(`[WhatsApp Web] Skipped ${skippedChats} non-business chats due to business filter`);
      }

      return {
        success: true,
        chatsProcessed,
        messagesProcessed,
        errors,
        skippedChats: filterByBusiness ? skippedChats : undefined,
      };
    } catch (error: any) {
      console.error(`[WhatsApp Web] Fatal error during sync:`, error);
      throw error;
    }
  }

  /**
   * Send typing indicator to a chat
   */
  async sendTypingIndicator(accountId: string, chatId: string, isTyping: boolean): Promise<{ success: boolean }> {
    const session = this.sessions.get(accountId);
    if (!session || !session.client) {
      throw new Error('Session not found or not connected');
    }

    if (session.status !== 'ready') {
      throw new Error(`Session not ready. Current status: ${session.status}`);
    }

    try {
      console.log(`[WhatsApp Web] Sending typing indicator to ${chatId}: ${isTyping ? 'typing' : 'stopped typing'}`);
      
      // Format chat ID
      const formattedChatId = chatId.includes('@') ? chatId : `${chatId}@c.us`;
      
      // Get the chat
      const chat = await session.client.getChatById(formattedChatId);
      
      if (isTyping) {
        // Send typing state
        await chat.sendStateTyping();
      } else {
        // Clear typing state
        await chat.clearState();
      }
      
      console.log(`[WhatsApp Web] ✅ Typing indicator sent successfully`);
      
      return { success: true };
    } catch (error) {
      console.error(`[WhatsApp Web] Failed to send typing indicator:`, error);
      throw error;
    }
  }

  /**
   * Send recording indicator to a chat (for voice messages)
   */
  async sendRecordingIndicator(accountId: string, chatId: string, isRecording: boolean): Promise<{ success: boolean }> {
    const session = this.sessions.get(accountId);
    if (!session || !session.client) {
      throw new Error('Session not found or not connected');
    }

    if (session.status !== 'ready') {
      throw new Error(`Session not ready. Current status: ${session.status}`);
    }

    try {
      console.log(`[WhatsApp Web] Sending recording indicator to ${chatId}: ${isRecording ? 'recording' : 'stopped recording'}`);
      
      // Format chat ID
      const formattedChatId = chatId.includes('@') ? chatId : `${chatId}@c.us`;
      
      // Get the chat
      const chat = await session.client.getChatById(formattedChatId);
      
      if (isRecording) {
        // Send recording state
        await chat.sendStateRecording();
      } else {
        // Clear recording state
        await chat.clearState();
      }
      
      console.log(`[WhatsApp Web] ✅ Recording indicator sent successfully`);
      
      return { success: true };
    } catch (error) {
      console.error(`[WhatsApp Web] Failed to send recording indicator:`, error);
      throw error;
    }
  }

  /**
   * Set presence as available (online)
   */
  async setPresenceAvailable(accountId: string): Promise<{ success: boolean }> {
    const session = this.sessions.get(accountId);
    if (!session || !session.client) {
      throw new Error('Session not found or not connected');
    }

    if (session.status !== 'ready') {
      throw new Error(`Session not ready. Current status: ${session.status}`);
    }

    try {
      console.log(`[WhatsApp Web] Setting presence as available for ${accountId}`);
      
      await session.client.sendPresenceAvailable();
      
      console.log(`[WhatsApp Web] ✅ Presence set to available`);
      
      return { success: true };
    } catch (error) {
      console.error(`[WhatsApp Web] Failed to set presence available:`, error);
      throw error;
    }
  }

  /**
   * Set presence as unavailable (offline/away)
   */
  async setPresenceUnavailable(accountId: string): Promise<{ success: boolean }> {
    const session = this.sessions.get(accountId);
    if (!session || !session.client) {
      throw new Error('Session not found or not connected');
    }

    if (session.status !== 'ready') {
      throw new Error(`Session not ready. Current status: ${session.status}`);
    }

    try {
      console.log(`[WhatsApp Web] Setting presence as unavailable for ${accountId}`);
      
      await session.client.sendPresenceUnavailable();
      
      console.log(`[WhatsApp Web] ✅ Presence set to unavailable`);
      
      return { success: true };
    } catch (error) {
      console.error(`[WhatsApp Web] Failed to set presence unavailable:`, error);
      throw error;
    }
  }

  /**
   * Mark a message as read in WhatsApp Web
   */
  async markMessageAsRead(accountId: string, waMessageId: string): Promise<{ success: boolean }> {
    const session = this.sessions.get(accountId);
    if (!session || !session.client) {
      throw new Error('Session not found or not connected');
    }

    if (session.status !== 'ready') {
      throw new Error(`Session not ready. Current status: ${session.status}`);
    }

    try {
      console.log(`[WhatsApp Web] Marking message as read: ${waMessageId}`);
      
      // Get the chat for this message
      const chats = await session.client.getChats();
      
      // Find the chat containing this message
      for (const chat of chats) {
        try {
          // Search for the message in this chat
          const messages = await chat.fetchMessages({ limit: 100 });
          const targetMessage = messages.find(m => m.id.id === waMessageId || m.id._serialized === waMessageId);
          
          if (targetMessage) {
            // Send read acknowledgment
            await chat.sendSeen();
            console.log(`[WhatsApp Web] ✅ Sent read acknowledgment for message ${waMessageId}`);
            return { success: true };
          }
        } catch (error) {
          // Continue searching in other chats
        }
      }
      
      console.warn(`[WhatsApp Web] ⚠️  Message ${waMessageId} not found in any chat`);
      return { success: false };
    } catch (error) {
      console.error(`[WhatsApp Web] Failed to mark message as read:`, error);
      throw error;
    }
  }

  /**
   * Create a new group
   */
  async createGroup(
    accountId: string,
    name: string,
    participants: string[]
  ): Promise<{ groupId: string; success: boolean }> {
    const session = this.sessions.get(accountId);
    if (!session || !session.client) {
      throw new Error('Session not found or not connected');
    }

    if (session.status !== 'ready') {
      throw new Error(`Session not ready. Current status: ${session.status}`);
    }

    try {
      console.log(`[WhatsApp Web] Creating group "${name}" with ${participants.length} participants`);
      
      // Format participant IDs
      const formattedParticipants = participants.map(p => 
        p.includes('@') ? p : `${p}@c.us`
      );
      
      // Create group
      const group = await session.client.createGroup(name, formattedParticipants);
      
      const groupId = typeof group === 'string' ? group : (group as any).gid?._serialized || 'unknown';
      console.log(`[WhatsApp Web] ✅ Group created successfully: ${groupId}`);
      
      return { 
        groupId,
        success: true 
      };
    } catch (error) {
      console.error(`[WhatsApp Web] Failed to create group:`, error);
      throw error;
    }
  }

  /**
   * Add participants to a group
   */
  async addGroupParticipants(
    accountId: string,
    groupId: string,
    participants: string[]
  ): Promise<{ success: boolean }> {
    const session = this.sessions.get(accountId);
    if (!session || !session.client) {
      throw new Error('Session not found or not connected');
    }

    if (session.status !== 'ready') {
      throw new Error(`Session not ready. Current status: ${session.status}`);
    }

    try {
      console.log(`[WhatsApp Web] Adding ${participants.length} participants to group ${groupId}`);
      
      // Format group ID
      const formattedGroupId = groupId.includes('@') ? groupId : `${groupId}@g.us`;
      
      // Format participant IDs
      const formattedParticipants = participants.map(p => 
        p.includes('@') ? p : `${p}@c.us`
      );
      
      // Get group chat
      const chat = await session.client.getChatById(formattedGroupId);
      
      // Add participants
      await (chat as any).addParticipants(formattedParticipants);
      
      console.log(`[WhatsApp Web] ✅ Participants added successfully`);
      
      return { success: true };
    } catch (error) {
      console.error(`[WhatsApp Web] Failed to add participants:`, error);
      throw error;
    }
  }

  /**
   * Remove participants from a group
   */
  async removeGroupParticipants(
    accountId: string,
    groupId: string,
    participants: string[]
  ): Promise<{ success: boolean }> {
    const session = this.sessions.get(accountId);
    if (!session || !session.client) {
      throw new Error('Session not found or not connected');
    }

    if (session.status !== 'ready') {
      throw new Error(`Session not ready. Current status: ${session.status}`);
    }

    try {
      console.log(`[WhatsApp Web] Removing ${participants.length} participants from group ${groupId}`);
      
      // Format group ID
      const formattedGroupId = groupId.includes('@') ? groupId : `${groupId}@g.us`;
      
      // Format participant IDs
      const formattedParticipants = participants.map(p => 
        p.includes('@') ? p : `${p}@c.us`
      );
      
      // Get group chat
      const chat = await session.client.getChatById(formattedGroupId);
      
      // Remove participants
      await (chat as any).removeParticipants(formattedParticipants);
      
      console.log(`[WhatsApp Web] ✅ Participants removed successfully`);
      
      return { success: true };
    } catch (error) {
      console.error(`[WhatsApp Web] Failed to remove participants:`, error);
      throw error;
    }
  }

  /**
   * Promote participants to admin
   */
  async promoteGroupParticipants(
    accountId: string,
    groupId: string,
    participants: string[]
  ): Promise<{ success: boolean }> {
    const session = this.sessions.get(accountId);
    if (!session || !session.client) {
      throw new Error('Session not found or not connected');
    }

    if (session.status !== 'ready') {
      throw new Error(`Session not ready. Current status: ${session.status}`);
    }

    try {
      console.log(`[WhatsApp Web] Promoting ${participants.length} participants to admin in group ${groupId}`);
      
      // Format group ID
      const formattedGroupId = groupId.includes('@') ? groupId : `${groupId}@g.us`;
      
      // Format participant IDs
      const formattedParticipants = participants.map(p => 
        p.includes('@') ? p : `${p}@c.us`
      );
      
      // Get group chat
      const chat = await session.client.getChatById(formattedGroupId);
      
      // Promote participants
      await (chat as any).promoteParticipants(formattedParticipants);
      
      console.log(`[WhatsApp Web] ✅ Participants promoted successfully`);
      
      return { success: true };
    } catch (error) {
      console.error(`[WhatsApp Web] Failed to promote participants:`, error);
      throw error;
    }
  }

  /**
   * Demote admins to regular participants
   */
  async demoteGroupParticipants(
    accountId: string,
    groupId: string,
    participants: string[]
  ): Promise<{ success: boolean }> {
    const session = this.sessions.get(accountId);
    if (!session || !session.client) {
      throw new Error('Session not found or not connected');
    }

    if (session.status !== 'ready') {
      throw new Error(`Session not ready. Current status: ${session.status}`);
    }

    try {
      console.log(`[WhatsApp Web] Demoting ${participants.length} admins in group ${groupId}`);
      
      // Format group ID
      const formattedGroupId = groupId.includes('@') ? groupId : `${groupId}@g.us`;
      
      // Format participant IDs
      const formattedParticipants = participants.map(p => 
        p.includes('@') ? p : `${p}@c.us`
      );
      
      // Get group chat
      const chat = await session.client.getChatById(formattedGroupId);
      
      // Demote participants
      await (chat as any).demoteParticipants(formattedParticipants);
      
      console.log(`[WhatsApp Web] ✅ Participants demoted successfully`);
      
      return { success: true };
    } catch (error) {
      console.error(`[WhatsApp Web] Failed to demote participants:`, error);
      throw error;
    }
  }

  /**
   * Update group subject (name)
   */
  async updateGroupSubject(
    accountId: string,
    groupId: string,
    subject: string
  ): Promise<{ success: boolean }> {
    const session = this.sessions.get(accountId);
    if (!session || !session.client) {
      throw new Error('Session not found or not connected');
    }

    if (session.status !== 'ready') {
      throw new Error(`Session not ready. Current status: ${session.status}`);
    }

    try {
      console.log(`[WhatsApp Web] Updating group subject for ${groupId} to "${subject}"`);
      
      // Format group ID
      const formattedGroupId = groupId.includes('@') ? groupId : `${groupId}@g.us`;
      
      // Get group chat
      const chat = await session.client.getChatById(formattedGroupId);
      
      // Update subject
      await (chat as any).setSubject(subject);
      
      console.log(`[WhatsApp Web] ✅ Group subject updated successfully`);
      
      return { success: true };
    } catch (error) {
      console.error(`[WhatsApp Web] Failed to update group subject:`, error);
      throw error;
    }
  }

  /**
   * Update group description
   */
  async updateGroupDescription(
    accountId: string,
    groupId: string,
    description: string
  ): Promise<{ success: boolean }> {
    const session = this.sessions.get(accountId);
    if (!session || !session.client) {
      throw new Error('Session not found or not connected');
    }

    if (session.status !== 'ready') {
      throw new Error(`Session not ready. Current status: ${session.status}`);
    }

    try {
      console.log(`[WhatsApp Web] Updating group description for ${groupId}`);
      
      // Format group ID
      const formattedGroupId = groupId.includes('@') ? groupId : `${groupId}@g.us`;
      
      // Get group chat
      const chat = await session.client.getChatById(formattedGroupId);
      
      // Update description
      await (chat as any).setDescription(description);
      
      console.log(`[WhatsApp Web] ✅ Group description updated successfully`);
      
      return { success: true };
    } catch (error) {
      console.error(`[WhatsApp Web] Failed to update group description:`, error);
      throw error;
    }
  }

  /**
   * Leave a group
   */
  async leaveGroup(
    accountId: string,
    groupId: string
  ): Promise<{ success: boolean }> {
    const session = this.sessions.get(accountId);
    if (!session || !session.client) {
      throw new Error('Session not found or not connected');
    }

    if (session.status !== 'ready') {
      throw new Error(`Session not ready. Current status: ${session.status}`);
    }

    try {
      console.log(`[WhatsApp Web] Leaving group ${groupId}`);
      
      // Format group ID
      const formattedGroupId = groupId.includes('@') ? groupId : `${groupId}@g.us`;
      
      // Get group chat
      const chat = await session.client.getChatById(formattedGroupId);
      
      // Leave group
      await (chat as any).leave();
      
      console.log(`[WhatsApp Web] ✅ Left group successfully`);
      
      return { success: true };
    } catch (error) {
      console.error(`[WhatsApp Web] Failed to leave group:`, error);
      throw error;
    }
  }

  /**
   * Get group invite link
   */
  async getGroupInviteLink(
    accountId: string,
    groupId: string
  ): Promise<{ inviteLink: string }> {
    const session = this.sessions.get(accountId);
    if (!session || !session.client) {
      throw new Error('Session not found or not connected');
    }

    if (session.status !== 'ready') {
      throw new Error(`Session not ready. Current status: ${session.status}`);
    }

    try {
      console.log(`[WhatsApp Web] Getting invite link for group ${groupId}`);
      
      // Format group ID
      const formattedGroupId = groupId.includes('@') ? groupId : `${groupId}@g.us`;
      
      // Get group chat
      const chat = await session.client.getChatById(formattedGroupId);
      
      // Get invite code
      const inviteCode = await (chat as any).getInviteCode();
      const inviteLink = `https://chat.whatsapp.com/${inviteCode}`;
      
      console.log(`[WhatsApp Web] ✅ Got invite link successfully`);
      
      return { inviteLink };
    } catch (error) {
      console.error(`[WhatsApp Web] Failed to get invite link:`, error);
      throw error;
    }
  }

  /**
   * Revoke group invite link
   */
  async revokeGroupInviteLink(
    accountId: string,
    groupId: string
  ): Promise<{ success: boolean; newInviteLink: string }> {
    const session = this.sessions.get(accountId);
    if (!session || !session.client) {
      throw new Error('Session not found or not connected');
    }

    if (session.status !== 'ready') {
      throw new Error(`Session not ready. Current status: ${session.status}`);
    }

    try {
      console.log(`[WhatsApp Web] Revoking invite link for group ${groupId}`);
      
      // Format group ID
      const formattedGroupId = groupId.includes('@') ? groupId : `${groupId}@g.us`;
      
      // Get group chat
      const chat = await session.client.getChatById(formattedGroupId);
      
      // Revoke invite code
      const newInviteCode = await (chat as any).revokeInvite();
      const newInviteLink = `https://chat.whatsapp.com/${newInviteCode}`;
      
      console.log(`[WhatsApp Web] ✅ Invite link revoked successfully`);
      
      return { success: true, newInviteLink };
    } catch (error) {
      console.error(`[WhatsApp Web] Failed to revoke invite link:`, error);
      throw error;
    }
  }

  /**
   * Get contact profile picture URL
   */
  async getContactProfilePicture(
    accountId: string,
    contactId: string
  ): Promise<{ profilePicUrl: string | null }> {
    const session = this.sessions.get(accountId);
    if (!session || !session.client) {
      throw new Error('Session not found or not connected');
    }

    if (session.status !== 'ready') {
      throw new Error(`Session not ready. Current status: ${session.status}`);
    }

    try {
      console.log(`[WhatsApp Web] Getting profile picture for ${contactId}`);
      
      // Format contact ID
      const formattedContactId = contactId.includes('@') ? contactId : `${contactId}@c.us`;
      
      // Get profile picture URL
      const profilePicUrl = await session.client.getProfilePicUrl(formattedContactId);
      
      console.log(`[WhatsApp Web] ✅ Got profile picture URL: ${profilePicUrl ? 'yes' : 'no'}`);
      
      return { profilePicUrl };
    } catch (error) {
      console.error(`[WhatsApp Web] Failed to get profile picture:`, error);
      // Return null instead of throwing - some contacts don't have profile pictures
      return { profilePicUrl: null };
    }
  }

  /**
   * Get own profile picture URL
   */
  async getOwnProfilePicture(accountId: string): Promise<{ profilePicUrl: string | null }> {
    const session = this.sessions.get(accountId);
    if (!session || !session.client) {
      throw new Error('Session not found or not connected');
    }

    if (session.status !== 'ready') {
      throw new Error(`Session not ready. Current status: ${session.status}`);
    }

    try {
      console.log(`[WhatsApp Web] Getting own profile picture`);
      
      const info = await session.client.info;
      const ownId = info.wid._serialized;
      
      // Get profile picture URL
      const profilePicUrl = await session.client.getProfilePicUrl(ownId);
      
      console.log(`[WhatsApp Web] ✅ Got own profile picture URL: ${profilePicUrl ? 'yes' : 'no'}`);
      
      return { profilePicUrl };
    } catch (error) {
      console.error(`[WhatsApp Web] Failed to get own profile picture:`, error);
      return { profilePicUrl: null };
    }
  }

  /**
   * Set own profile picture
   */
  async setOwnProfilePicture(
    accountId: string,
    imageUrl: string
  ): Promise<{ success: boolean }> {
    const session = this.sessions.get(accountId);
    if (!session || !session.client) {
      throw new Error('Session not found or not connected');
    }

    if (session.status !== 'ready') {
      throw new Error(`Session not ready. Current status: ${session.status}`);
    }

    try {
      console.log(`[WhatsApp Web] Setting own profile picture`);
      
      // Import MessageMedia from whatsapp-web.js
      const { MessageMedia } = await import('whatsapp-web.js');
      
      // Download and prepare media
      const media = await MessageMedia.fromUrl(imageUrl);
      
      // Set profile picture
      await session.client.setProfilePicture(media);
      
      console.log(`[WhatsApp Web] ✅ Profile picture set successfully`);
      
      return { success: true };
    } catch (error) {
      console.error(`[WhatsApp Web] Failed to set profile picture:`, error);
      throw error;
    }
  }

  /**
   * Delete own profile picture
   */
  async deleteOwnProfilePicture(accountId: string): Promise<{ success: boolean }> {
    const session = this.sessions.get(accountId);
    if (!session || !session.client) {
      throw new Error('Session not found or not connected');
    }

    if (session.status !== 'ready') {
      throw new Error(`Session not ready. Current status: ${session.status}`);
    }

    try {
      console.log(`[WhatsApp Web] Deleting own profile picture`);
      
      await session.client.deleteProfilePicture();
      
      console.log(`[WhatsApp Web] ✅ Profile picture deleted successfully`);
      
      return { success: true };
    } catch (error) {
      console.error(`[WhatsApp Web] Failed to delete profile picture:`, error);
      throw error;
    }
  }

  /**
   * Get own status (about text)
   */
  async getOwnStatus(accountId: string): Promise<{ status: string | null }> {
    const session = this.sessions.get(accountId);
    if (!session || !session.client) {
      throw new Error('Session not found or not connected');
    }

    if (session.status !== 'ready') {
      throw new Error(`Session not ready. Current status: ${session.status}`);
    }

    try {
      console.log(`[WhatsApp Web] Getting own status`);
      
      const status = await (session.client as any).getStatus();
      
      console.log(`[WhatsApp Web] ✅ Got own status: ${status ? 'yes' : 'no'}`);
      
      return { status };
    } catch (error) {
      console.error(`[WhatsApp Web] Failed to get own status:`, error);
      return { status: null };
    }
  }

  /**
   * Set own status (about text)
   */
  async setOwnStatus(
    accountId: string,
    status: string
  ): Promise<{ success: boolean }> {
    const session = this.sessions.get(accountId);
    if (!session || !session.client) {
      throw new Error('Session not found or not connected');
    }

    if (session.status !== 'ready') {
      throw new Error(`Session not ready. Current status: ${session.status}`);
    }

    try {
      console.log(`[WhatsApp Web] Setting own status to: ${status}`);
      
      await session.client.setStatus(status);
      
      console.log(`[WhatsApp Web] ✅ Status set successfully`);
      
      return { success: true };
    } catch (error) {
      console.error(`[WhatsApp Web] Failed to set status:`, error);
      throw error;
    }
  }

  /**
   * Block a contact
   */
  async blockContact(
    accountId: string,
    contactId: string
  ): Promise<{ success: boolean }> {
    const session = this.sessions.get(accountId);
    if (!session || !session.client) {
      throw new Error('Session not found or not connected');
    }

    if (session.status !== 'ready') {
      throw new Error(`Session not ready. Current status: ${session.status}`);
    }

    try {
      console.log(`[WhatsApp Web] Blocking contact ${contactId}`);
      
      // Format contact ID
      const formattedContactId = contactId.includes('@') ? contactId : `${contactId}@c.us`;
      
      // Get contact
      const contact = await session.client.getContactById(formattedContactId);
      
      // Block contact
      await contact.block();
      
      console.log(`[WhatsApp Web] ✅ Contact blocked successfully`);
      
      return { success: true };
    } catch (error) {
      console.error(`[WhatsApp Web] Failed to block contact:`, error);
      throw error;
    }
  }

  /**
   * Unblock a contact
   */
  async unblockContact(
    accountId: string,
    contactId: string
  ): Promise<{ success: boolean }> {
    const session = this.sessions.get(accountId);
    if (!session || !session.client) {
      throw new Error('Session not found or not connected');
    }

    if (session.status !== 'ready') {
      throw new Error(`Session not ready. Current status: ${session.status}`);
    }

    try {
      console.log(`[WhatsApp Web] Unblocking contact ${contactId}`);
      
      // Format contact ID
      const formattedContactId = contactId.includes('@') ? contactId : `${contactId}@c.us`;
      
      // Get contact
      const contact = await session.client.getContactById(formattedContactId);
      
      // Unblock contact
      await contact.unblock();
      
      console.log(`[WhatsApp Web] ✅ Contact unblocked successfully`);
      
      return { success: true };
    } catch (error) {
      console.error(`[WhatsApp Web] Failed to unblock contact:`, error);
      throw error;
    }
  }

  /**
   * Archive a chat
   */
  async archiveChat(
    accountId: string,
    chatId: string
  ): Promise<{ success: boolean }> {
    const session = this.sessions.get(accountId);
    if (!session || !session.client) {
      throw new Error('Session not found or not connected');
    }

    if (session.status !== 'ready') {
      throw new Error(`Session not ready. Current status: ${session.status}`);
    }

    try {
      console.log(`[WhatsApp Web] Archiving chat ${chatId}`);
      
      // Format chat ID
      const formattedChatId = chatId.includes('@') ? chatId : `${chatId}@c.us`;
      
      // Get chat
      const chat = await session.client.getChatById(formattedChatId);
      
      // Archive chat
      await chat.archive();
      
      console.log(`[WhatsApp Web] ✅ Chat archived successfully`);
      
      return { success: true };
    } catch (error) {
      console.error(`[WhatsApp Web] Failed to archive chat:`, error);
      throw error;
    }
  }

  /**
   * Unarchive a chat
   */
  async unarchiveChat(
    accountId: string,
    chatId: string
  ): Promise<{ success: boolean }> {
    const session = this.sessions.get(accountId);
    if (!session || !session.client) {
      throw new Error('Session not found or not connected');
    }

    if (session.status !== 'ready') {
      throw new Error(`Session not ready. Current status: ${session.status}`);
    }

    try {
      console.log(`[WhatsApp Web] Unarchiving chat ${chatId}`);
      
      // Format chat ID
      const formattedChatId = chatId.includes('@') ? chatId : `${chatId}@c.us`;
      
      // Get chat
      const chat = await session.client.getChatById(formattedChatId);
      
      // Unarchive chat
      await chat.unarchive();
      
      console.log(`[WhatsApp Web] ✅ Chat unarchived successfully`);
      
      return { success: true };
    } catch (error) {
      console.error(`[WhatsApp Web] Failed to unarchive chat:`, error);
      throw error;
    }
  }

  /**
   * Mute a chat
   */
  async muteChat(
    accountId: string,
    chatId: string,
    duration?: number // Duration in seconds, undefined for forever
  ): Promise<{ success: boolean }> {
    const session = this.sessions.get(accountId);
    if (!session || !session.client) {
      throw new Error('Session not found or not connected');
    }

    if (session.status !== 'ready') {
      throw new Error(`Session not ready. Current status: ${session.status}`);
    }

    try {
      console.log(`[WhatsApp Web] Muting chat ${chatId} for ${duration ? duration + 's' : 'forever'}`);
      
      // Format chat ID
      const formattedChatId = chatId.includes('@') ? chatId : `${chatId}@c.us`;
      
      // Get chat
      const chat = await session.client.getChatById(formattedChatId);
      
      // Mute chat
      if (duration) {
        const unmuteDate = new Date(Date.now() + duration * 1000);
        await chat.mute(unmuteDate);
      } else {
        // Mute forever (actually mutes for a very long time)
        await chat.mute(new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)); // 1 year
      }
      
      console.log(`[WhatsApp Web] ✅ Chat muted successfully`);
      
      return { success: true };
    } catch (error) {
      console.error(`[WhatsApp Web] Failed to mute chat:`, error);
      throw error;
    }
  }

  /**
   * Unmute a chat
   */
  async unmuteChat(
    accountId: string,
    chatId: string
  ): Promise<{ success: boolean }> {
    const session = this.sessions.get(accountId);
    if (!session || !session.client) {
      throw new Error('Session not found or not connected');
    }

    if (session.status !== 'ready') {
      throw new Error(`Session not ready. Current status: ${session.status}`);
    }

    try {
      console.log(`[WhatsApp Web] Unmuting chat ${chatId}`);
      
      // Format chat ID
      const formattedChatId = chatId.includes('@') ? chatId : `${chatId}@c.us`;
      
      // Get chat
      const chat = await session.client.getChatById(formattedChatId);
      
      // Unmute chat
      await chat.unmute();
      
      console.log(`[WhatsApp Web] ✅ Chat unmuted successfully`);
      
      return { success: true };
    } catch (error) {
      console.error(`[WhatsApp Web] Failed to unmute chat:`, error);
      throw error;
    }
  }

  /**
   * Pin a chat
   */
  async pinChat(
    accountId: string,
    chatId: string
  ): Promise<{ success: boolean }> {
    const session = this.sessions.get(accountId);
    if (!session || !session.client) {
      throw new Error('Session not found or not connected');
    }

    if (session.status !== 'ready') {
      throw new Error(`Session not ready. Current status: ${session.status}`);
    }

    try {
      console.log(`[WhatsApp Web] Pinning chat ${chatId}`);
      
      // Format chat ID
      const formattedChatId = chatId.includes('@') ? chatId : `${chatId}@c.us`;
      
      // Get chat
      const chat = await session.client.getChatById(formattedChatId);
      
      // Pin chat
      await chat.pin();
      
      console.log(`[WhatsApp Web] ✅ Chat pinned successfully`);
      
      return { success: true };
    } catch (error) {
      console.error(`[WhatsApp Web] Failed to pin chat:`, error);
      throw error;
    }
  }

  /**
   * Unpin a chat
   */
  async unpinChat(
    accountId: string,
    chatId: string
  ): Promise<{ success: boolean }> {
    const session = this.sessions.get(accountId);
    if (!session || !session.client) {
      throw new Error('Session not found or not connected');
    }

    if (session.status !== 'ready') {
      throw new Error(`Session not ready. Current status: ${session.status}`);
    }

    try {
      console.log(`[WhatsApp Web] Unpinning chat ${chatId}`);
      
      // Format chat ID
      const formattedChatId = chatId.includes('@') ? chatId : `${chatId}@c.us`;
      
      // Get chat
      const chat = await session.client.getChatById(formattedChatId);
      
      // Unpin chat
      await chat.unpin();
      
      console.log(`[WhatsApp Web] ✅ Chat unpinned successfully`);
      
      return { success: true };
    } catch (error) {
      console.error(`[WhatsApp Web] Failed to unpin chat:`, error);
      throw error;
    }
  }

  /**
   * Delete a chat
   */
  async deleteChat(
    accountId: string,
    chatId: string
  ): Promise<{ success: boolean }> {
    const session = this.sessions.get(accountId);
    if (!session || !session.client) {
      throw new Error('Session not found or not connected');
    }

    if (session.status !== 'ready') {
      throw new Error(`Session not ready. Current status: ${session.status}`);
    }

    try {
      console.log(`[WhatsApp Web] Deleting chat ${chatId}`);
      
      // Format chat ID
      const formattedChatId = chatId.includes('@') ? chatId : `${chatId}@c.us`;
      
      // Get chat
      const chat = await session.client.getChatById(formattedChatId);
      
      // Delete chat
      await chat.delete();
      
      console.log(`[WhatsApp Web] ✅ Chat deleted successfully`);
      
      return { success: true };
    } catch (error) {
      console.error(`[WhatsApp Web] Failed to delete chat:`, error);
      throw error;
    }
  }

  /**
   * Clear chat messages
   */
  async clearChatMessages(
    accountId: string,
    chatId: string
  ): Promise<{ success: boolean }> {
    const session = this.sessions.get(accountId);
    if (!session || !session.client) {
      throw new Error('Session not found or not connected');
    }

    if (session.status !== 'ready') {
      throw new Error(`Session not ready. Current status: ${session.status}`);
    }

    try {
      console.log(`[WhatsApp Web] Clearing messages for chat ${chatId}`);
      
      // Format chat ID
      const formattedChatId = chatId.includes('@') ? chatId : `${chatId}@c.us`;
      
      // Get chat
      const chat = await session.client.getChatById(formattedChatId);
      
      // Clear messages
      await chat.clearMessages();
      
      console.log(`[WhatsApp Web] ✅ Chat messages cleared successfully`);
      
      return { success: true };
    } catch (error) {
      console.error(`[WhatsApp Web] Failed to clear chat messages:`, error);
      throw error;
    }
  }

  /**
   * Delete a message for everyone
   */
  async deleteMessageForEveryone(
    accountId: string,
    messageId: string
  ): Promise<{ success: boolean }> {
    const session = this.sessions.get(accountId);
    if (!session || !session.client) {
      throw new Error('Session not found or not connected');
    }

    if (session.status !== 'ready') {
      throw new Error(`Session not ready. Current status: ${session.status}`);
    }

    try {
      console.log(`[WhatsApp Web] Deleting message ${messageId} for everyone`);
      
      // Get all chats to find the message
      const chats = await session.client.getChats();
      
      for (const chat of chats) {
        try {
          const messages = await chat.fetchMessages({ limit: 100 });
          const targetMessage = messages.find(m => 
            m.id.id === messageId || m.id._serialized === messageId
          );
          
          if (targetMessage) {
            // Delete for everyone
            await targetMessage.delete(true);
            console.log(`[WhatsApp Web] ✅ Message deleted for everyone successfully`);
            return { success: true };
          }
        } catch (error) {
          // Continue searching in other chats
        }
      }
      
      throw new Error(`Message ${messageId} not found`);
    } catch (error) {
      console.error(`[WhatsApp Web] Failed to delete message for everyone:`, error);
      throw error;
    }
  }

  /**
   * Star a message
   */
  async starMessage(
    accountId: string,
    messageId: string
  ): Promise<{ success: boolean }> {
    const session = this.sessions.get(accountId);
    if (!session || !session.client) {
      throw new Error('Session not found or not connected');
    }

    if (session.status !== 'ready') {
      throw new Error(`Session not ready. Current status: ${session.status}`);
    }

    try {
      console.log(`[WhatsApp Web] Starring message ${messageId}`);
      
      // Get all chats to find the message
      const chats = await session.client.getChats();
      
      for (const chat of chats) {
        try {
          const messages = await chat.fetchMessages({ limit: 100 });
          const targetMessage = messages.find(m => 
            m.id.id === messageId || m.id._serialized === messageId
          );
          
          if (targetMessage) {
            // Star message
            await targetMessage.star();
            console.log(`[WhatsApp Web] ✅ Message starred successfully`);
            return { success: true };
          }
        } catch (error) {
          // Continue searching in other chats
        }
      }
      
      throw new Error(`Message ${messageId} not found`);
    } catch (error) {
      console.error(`[WhatsApp Web] Failed to star message:`, error);
      throw error;
    }
  }

  /**
   * Unstar a message
   */
  async unstarMessage(
    accountId: string,
    messageId: string
  ): Promise<{ success: boolean }> {
    const session = this.sessions.get(accountId);
    if (!session || !session.client) {
      throw new Error('Session not found or not connected');
    }

    if (session.status !== 'ready') {
      throw new Error(`Session not ready. Current status: ${session.status}`);
    }

    try {
      console.log(`[WhatsApp Web] Unstarring message ${messageId}`);
      
      // Get all chats to find the message
      const chats = await session.client.getChats();
      
      for (const chat of chats) {
        try {
          const messages = await chat.fetchMessages({ limit: 100 });
          const targetMessage = messages.find(m => 
            m.id.id === messageId || m.id._serialized === messageId
          );
          
          if (targetMessage) {
            // Unstar message
            await targetMessage.unstar();
            console.log(`[WhatsApp Web] ✅ Message unstarred successfully`);
            return { success: true };
          }
        } catch (error) {
          // Continue searching in other chats
        }
      }
      
      throw new Error(`Message ${messageId} not found`);
    } catch (error) {
      console.error(`[WhatsApp Web] Failed to unstar message:`, error);
      throw error;
    }
  }

  /**
   * Get all starred messages
   */
  async getStarredMessages(accountId: string): Promise<{ messages: any[] }> {
    const session = this.sessions.get(accountId);
    if (!session || !session.client) {
      throw new Error('Session not found or not connected');
    }

    if (session.status !== 'ready') {
      throw new Error(`Session not ready. Current status: ${session.status}`);
    }

    try {
      console.log(`[WhatsApp Web] Getting starred messages`);
      
      const starredMessages: any[] = [];
      
      // Get all chats
      const chats = await session.client.getChats();
      
      for (const chat of chats) {
        try {
          // Fetch messages from each chat
          const messages = await chat.fetchMessages({ limit: 100 });
          
          // Filter starred messages
          const starred = messages.filter((m: any) => m.hasQuotedMsg && m.isStarred);
          
          if (starred.length > 0) {
            starredMessages.push(...starred.map((m: any) => ({
              id: m.id._serialized,
              chatId: chat.id._serialized,
              from: m.from,
              to: m.to,
              body: m.body,
              timestamp: m.timestamp,
              type: m.type,
              hasMedia: m.hasMedia,
              fromMe: m.fromMe,
            })));
          }
        } catch (error) {
          // Continue with other chats
        }
      }
      
      console.log(`[WhatsApp Web] ✅ Found ${starredMessages.length} starred messages`);
      
      return { messages: starredMessages };
    } catch (error) {
      console.error(`[WhatsApp Web] Failed to get starred messages:`, error);
      throw error;
    }
  }

  /**
   * Download message media
   */
  async downloadMessageMedia(
    accountId: string,
    messageId: string
  ): Promise<{ media: any }> {
    const session = this.sessions.get(accountId);
    if (!session || !session.client) {
      throw new Error('Session not found or not connected');
    }

    if (session.status !== 'ready') {
      throw new Error(`Session not ready. Current status: ${session.status}`);
    }

    try {
      console.log(`[WhatsApp Web] Downloading media for message ${messageId}`);
      
      // Get all chats to find the message
      const chats = await session.client.getChats();
      
      for (const chat of chats) {
        try {
          const messages = await chat.fetchMessages({ limit: 100 });
          const targetMessage = messages.find(m => 
            m.id.id === messageId || m.id._serialized === messageId
          );
          
          if (targetMessage && targetMessage.hasMedia) {
            // Download media
            const media = await targetMessage.downloadMedia();
            console.log(`[WhatsApp Web] ✅ Media downloaded successfully`);
            return { media };
          }
        } catch (error) {
          // Continue searching in other chats
        }
      }
      
      throw new Error(`Message ${messageId} not found or has no media`);
    } catch (error) {
      console.error(`[WhatsApp Web] Failed to download message media:`, error);
      throw error;
    }
  }

  /**
   * Search messages across all chats
   */
  async searchMessages(
    accountId: string,
    query: string,
    options?: {
      chatId?: string;
      limit?: number;
      page?: number;
    }
  ): Promise<{ messages: any[]; total: number }> {
    const session = this.sessions.get(accountId);
    if (!session || !session.client) {
      throw new Error('Session not found or not connected');
    }

    if (session.status !== 'ready') {
      throw new Error(`Session not ready. Current status: ${session.status}`);
    }

    try {
      console.log(`[WhatsApp Web] Searching messages for query: "${query}"`);
      
      const limit = options?.limit || 50;
      const page = options?.page || 1;
      const searchResults: any[] = [];
      
      // Get chats to search
      let chatsToSearch;
      if (options?.chatId) {
        const formattedChatId = options.chatId.includes('@') ? options.chatId : `${options.chatId}@c.us`;
        const chat = await session.client.getChatById(formattedChatId);
        chatsToSearch = [chat];
      } else {
        chatsToSearch = await session.client.getChats();
      }
      
      // Search through chats
      for (const chat of chatsToSearch) {
        try {
          const messages = await chat.fetchMessages({ limit: 100 });
          
          // Filter messages by query
          const matchingMessages = messages.filter((m: any) => 
            m.body && m.body.toLowerCase().includes(query.toLowerCase())
          );
          
          searchResults.push(...matchingMessages.map((m: any) => ({
            id: m.id._serialized,
            chatId: chat.id._serialized,
            chatName: chat.name,
            from: m.from,
            to: m.to,
            body: m.body,
            timestamp: m.timestamp,
            type: m.type,
            hasMedia: m.hasMedia,
            fromMe: m.fromMe,
          })));
        } catch (error) {
          // Continue with other chats
        }
      }
      
      // Sort by timestamp (most recent first)
      searchResults.sort((a, b) => b.timestamp - a.timestamp);
      
      // Apply pagination
      const startIndex = (page - 1) * limit;
      const paginatedResults = searchResults.slice(startIndex, startIndex + limit);
      
      console.log(`[WhatsApp Web] ✅ Found ${searchResults.length} matching messages`);
      
      return {
        messages: paginatedResults,
        total: searchResults.length,
      };
    } catch (error) {
      console.error(`[WhatsApp Web] Failed to search messages:`, error);
      throw error;
    }
  }

  /**
   * Get chat labels/tags
   */
  async getChatLabels(accountId: string): Promise<{ labels: any[] }> {
    const session = this.sessions.get(accountId);
    if (!session || !session.client) {
      throw new Error('Session not found or not connected');
    }

    if (session.status !== 'ready') {
      throw new Error(`Session not ready. Current status: ${session.status}`);
    }

    try {
      console.log(`[WhatsApp Web] Getting chat labels`);
      
      const labels = await session.client.getLabels();
      
      console.log(`[WhatsApp Web] ✅ Found ${labels.length} labels`);
      
      return {
        labels: labels.map((l: any) => ({
          id: l.id,
          name: l.name,
          color: l.hexColor,
        })),
      };
    } catch (error) {
      console.error(`[WhatsApp Web] Failed to get labels:`, error);
      return { labels: [] };
    }
  }

  /**
   * Get chat statistics
   */
  async getChatStatistics(
    accountId: string,
    chatId: string
  ): Promise<{ 
    messageCount: number;
    mediaCount: number;
    linkCount: number;
    firstMessageDate: Date | null;
    lastMessageDate: Date | null;
  }> {
    const session = this.sessions.get(accountId);
    if (!session || !session.client) {
      throw new Error('Session not found or not connected');
    }

    if (session.status !== 'ready') {
      throw new Error(`Session not ready. Current status: ${session.status}`);
    }

    try {
      console.log(`[WhatsApp Web] Getting chat statistics for ${chatId}`);
      
      // Format chat ID
      const formattedChatId = chatId.includes('@') ? chatId : `${chatId}@c.us`;
      
      // Get chat
      const chat = await session.client.getChatById(formattedChatId);
      
      // Fetch messages (limit to reasonable amount)
      const messages = await chat.fetchMessages({ limit: 1000 });
      
      let mediaCount = 0;
      let linkCount = 0;
      const urlRegex = /(https?:\/\/[^\s]+)/g;
      
      messages.forEach((m: any) => {
        if (m.hasMedia) mediaCount++;
        if (m.body && m.body.match(urlRegex)) linkCount++;
      });
      
      const timestamps = messages.map((m: any) => m.timestamp).filter(Boolean);
      const firstMessageDate = timestamps.length > 0 ? new Date(Math.min(...timestamps) * 1000) : null;
      const lastMessageDate = timestamps.length > 0 ? new Date(Math.max(...timestamps) * 1000) : null;
      
      console.log(`[WhatsApp Web] ✅ Chat statistics calculated`);
      
      return {
        messageCount: messages.length,
        mediaCount,
        linkCount,
        firstMessageDate,
        lastMessageDate,
      };
    } catch (error) {
      console.error(`[WhatsApp Web] Failed to get chat statistics:`, error);
      throw error;
    }
  }

  /**
   * Get unread message count
   */
  async getUnreadCount(accountId: string): Promise<{ unreadCount: number }> {
    const session = this.sessions.get(accountId);
    if (!session || !session.client) {
      throw new Error('Session not found or not connected');
    }

    if (session.status !== 'ready') {
      throw new Error(`Session not ready. Current status: ${session.status}`);
    }

    try {
      console.log(`[WhatsApp Web] Getting unread count`);
      
      const chats = await session.client.getChats();
      
      let totalUnread = 0;
      chats.forEach((chat: any) => {
        if (!chat.isGroup) {
          totalUnread += chat.unreadCount || 0;
        }
      });
      
      console.log(`[WhatsApp Web] ✅ Total unread count: ${totalUnread}`);
      
      return { unreadCount: totalUnread };
    } catch (error) {
      console.error(`[WhatsApp Web] Failed to get unread count:`, error);
      throw error;
    }
  }

  /**
   * Helper method to normalize WhatsApp conversation ID
   */
  private normalizeWaConversationId(phoneA: string, phoneB: string): string {
    const a = phoneA.replace(/\D/g, '');
    const b = phoneB.replace(/\D/g, '');
    return a < b ? `${a}_${b}` : `${b}_${a}`;
  }
}

export const sessionManager = new WhatsAppWebSessionManager();

