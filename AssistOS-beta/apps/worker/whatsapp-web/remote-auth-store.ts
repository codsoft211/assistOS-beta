import { db } from '../db';
import { whatsappWebSessions } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { encryptSessionData, decryptSessionData } from './crypto';

/**
 * RemoteAuth Store Implementation for whatsapp-web.js
 * 
 * This store saves WhatsApp Web session data to PostgreSQL database
 * instead of the filesystem. Session data is encrypted before storage.
 * 
 * Benefits:
 * - Secure: Session data is encrypted using AES-256-GCM
 * - Portable: Works across servers and environments
 * - Scalable: Multiple workers can share sessions
 * - Persistent: Survives server restarts and deployments
 */
export class DatabaseAuthStore {
  private originalAccountId: string;
  private currentAccountId: string | null = null; // Updated after migration
  private clientRef: any = null; // Reference to the WhatsApp client to extract real session data
  
  constructor(accountId: string) {
    this.originalAccountId = accountId;
    this.currentAccountId = accountId;
    console.log(`[RemoteAuth Store] Initialized for account ${accountId}`);
  }

  /**
   * Set the client reference so we can extract actual session data when RemoteAuth passes invalid data
   */
  setClient(client: any): void {
    this.clientRef = client;
  }

  /**
   * Update the accountId after migration
   */
  updateAccountId(newAccountId: string): void {
    console.log(`[RemoteAuth Store] Updating accountId from ${this.currentAccountId} to ${newAccountId}`);
    this.currentAccountId = newAccountId;
  }

  /**
   * Get the current accountId (may have changed after migration)
   */
  private getCurrentAccountId(): string {
    return this.currentAccountId || this.originalAccountId;
  }

  /**
   * Check if session exists in database
   * Called by whatsapp-web.js to verify session availability
   * According to RemoteAuth docs: await store.sessionExists({session: 'yourSessionName'});
   */
  async sessionExists(options?: { session?: string }): Promise<boolean> {
    try {
      // RemoteAuth passes {session: 'RemoteAuth-{accountId}'}, but we store by accountId
      // Extract the accountId by removing the "RemoteAuth-" prefix if present
      let currentAccountId: string;
      if (options?.session) {
        // Remove "RemoteAuth-" prefix if present
        currentAccountId = options.session.startsWith('RemoteAuth-') 
          ? options.session.substring('RemoteAuth-'.length)
          : options.session;
      } else {
        currentAccountId = await this.getCurrentAccountId();
      }
      console.log(`[RemoteAuth Store] 🔎 Checking if session exists for ${currentAccountId} (from session: ${options?.session || 'N/A'})`);
      
      const session = await db.query.whatsappWebSessions.findFirst({
        where: eq(whatsappWebSessions.accountId, currentAccountId),
      });

      console.log(`[RemoteAuth Store] Session query result:`, {
        found: !!session,
        sessionId: session?.id,
        accountId: session?.accountId,
        status: session?.status,
        sessionDataType: typeof session?.sessionData,
        sessionDataIsNull: session?.sessionData === null,
        sessionDataIsUndefined: session?.sessionData === undefined,
        sessionDataValue: session?.sessionData ? (typeof session.sessionData === 'object' ? Object.keys(session.sessionData).length + ' keys' : String(session.sessionData).substring(0, 50)) : 'null/empty',
      });

      const exists = !!(session && session.sessionData);
      console.log(`[RemoteAuth Store] Session exists check result: ${exists}`);

      return exists;
    } catch (error: any) {
      console.error(`[RemoteAuth Store] ❌ Failed to check session existence:`, {
        error: error.message,
        stack: error.stack,
      });
      return false;
    }
  }

  /**
   * Extract (load) session data from database
   * Called by whatsapp-web.js when initializing a client
   * According to RemoteAuth docs: await store.extract({session: 'yourSessionName'});
   */
  async extract(options?: { session?: string }): Promise<any> {
    // RemoteAuth passes {session: 'RemoteAuth-{accountId}'}, but we store by accountId
    // Extract the accountId by removing the "RemoteAuth-" prefix if present
    let currentAccountId: string;
    if (options?.session) {
      // Remove "RemoteAuth-" prefix if present
      currentAccountId = options.session.startsWith('RemoteAuth-') 
        ? options.session.substring('RemoteAuth-'.length)
        : options.session;
    } else {
      currentAccountId = await this.getCurrentAccountId();
    }
    console.log(`[RemoteAuth Store] 📥 EXTRACT METHOD CALLED for account ${currentAccountId} (from session: ${options?.session || 'N/A'}, original: ${this.originalAccountId})`);
    try {
      console.log(`[RemoteAuth Store] 🔍 Extracting session for ${currentAccountId} (original: ${this.originalAccountId})`);
      
      // Note: RemoteAuth also needs the ZIP file at dataPath/RemoteAuth-{clientId}.zip
      // The ZIP file is managed by RemoteAuth itself, not by this store
      // This store only handles the session data (auth tokens)
      
      const session = await db.query.whatsappWebSessions.findFirst({
        where: eq(whatsappWebSessions.accountId, currentAccountId),
      });

      console.log(`[RemoteAuth Store] Database query result:`, {
        found: !!session,
        hasSessionData: !!(session?.sessionData),
        status: session?.status,
        sessionDataType: typeof session?.sessionData,
      });

      if (!session || !session.sessionData) {
        console.log(`[RemoteAuth Store] ❌ No session data found for ${currentAccountId} - will require QR authentication`);
        return null;
      }

      // Decrypt session data
      try {
        console.log(`[RemoteAuth Store] 🔓 Attempting to decrypt session data for ${currentAccountId}...`);
        const decrypted = decryptSessionData(session.sessionData as string);
        console.log(`[RemoteAuth Store] Decryption result:`, {
          isObject: typeof decrypted === 'object',
          isNull: decrypted === null,
          hasKeys: decrypted && typeof decrypted === 'object' ? Object.keys(decrypted).length : 0,
          keys: decrypted && typeof decrypted === 'object' ? Object.keys(decrypted) : [],
        });
        
        if (!decrypted || typeof decrypted !== 'object') {
          console.warn(`[RemoteAuth Store] ⚠️  Session data for ${currentAccountId} appears invalid (not an object) - may require QR authentication`);
          return null;
        }
        
        // RemoteAuth may have saved the session wrapped in a 'session' key
        // Unwrap it if present to return the actual session data
        let sessionData: any = decrypted;
        console.log(`[RemoteAuth Store] Before unwrapping in extract:`, {
          isObject: typeof decrypted === 'object',
          isNull: decrypted === null,
          keysCount: decrypted && typeof decrypted === 'object' ? Object.keys(decrypted).length : 'N/A',
          keys: decrypted && typeof decrypted === 'object' ? Object.keys(decrypted) : 'N/A',
          hasSessionKey: decrypted && typeof decrypted === 'object' && 'session' in decrypted,
        });
        
        if (decrypted && typeof decrypted === 'object' && decrypted !== null && Object.keys(decrypted).length === 1 && 'session' in decrypted) {
          const innerSession = (decrypted as any).session;
          if (innerSession && typeof innerSession === 'object' && innerSession !== null) {
            console.log(`[RemoteAuth Store] Unwrapping session data from 'session' key`);
            console.log(`[RemoteAuth Store] Inner session keys: ${Object.keys(innerSession).join(', ')}`);
            sessionData = innerSession;
          } else {
            console.warn(`[RemoteAuth Store] Session key exists but inner value is not a valid object:`, typeof innerSession);
          }
        }
        
        // Check if we have valid WhatsApp session credentials
        const hasValidCredentials = sessionData && typeof sessionData === 'object' && sessionData !== null && (
          'clientId' in sessionData || 
          'serverToken' in sessionData || 
          'clientToken' in sessionData ||
          'encKey' in sessionData ||
          'macKey' in sessionData
        );
        
        if (hasValidCredentials) {
          console.log(`[RemoteAuth Store] ✅ Successfully extracted session for ${currentAccountId} - should reconnect automatically`);
          console.log(`[RemoteAuth Store] Session data structure:`, {
            hasClientId: 'clientId' in sessionData,
            hasServerToken: 'serverToken' in sessionData,
            hasClientToken: 'clientToken' in sessionData,
            hasEncKey: 'encKey' in sessionData,
            hasMacKey: 'macKey' in sessionData,
            actualKeys: Object.keys(sessionData),
          });
          return sessionData;
        } else if (sessionData && typeof sessionData === 'object' && Object.keys(sessionData).length > 0) {
          // Session data exists but doesn't have WhatsApp credentials - might be double-wrapped
          console.warn(`[RemoteAuth Store] ⚠️  Session data exists but missing WhatsApp credentials. Keys: ${Object.keys(sessionData).join(', ')}`);
          // Try unwrapping again if it's still wrapped
          if (Object.keys(sessionData).length === 1 && 'session' in sessionData && typeof (sessionData as any).session === 'object') {
            console.log(`[RemoteAuth Store] Attempting second unwrap - session data appears double-wrapped`);
            const doubleUnwrapped = (sessionData as any).session;
            if (doubleUnwrapped && typeof doubleUnwrapped === 'object' && (
              'clientId' in doubleUnwrapped || 'serverToken' in doubleUnwrapped
            )) {
              console.log(`[RemoteAuth Store] ✅ Double-unwrapped successfully! Keys: ${Object.keys(doubleUnwrapped).join(', ')}`);
              return doubleUnwrapped;
            }
          }
          return null;
        } else {
          console.warn(`[RemoteAuth Store] ⚠️  Session data for ${currentAccountId} appears empty - may require QR authentication`);
          return null;
        }
      } catch (decryptError: any) {
        console.error(`[RemoteAuth Store] ❌ Failed to decrypt session data for ${currentAccountId}:`, {
          error: decryptError.message,
          stack: decryptError.stack,
        });
        return null;
      }
    } catch (error: any) {
      console.error(`[RemoteAuth Store] ❌ Failed to extract session:`, {
        error: error.message,
        stack: error.stack,
      });
      return null;
    }
  }

  /**
   * Save session data to database
   * Called by whatsapp-web.js RemoteAuth automatically after authentication and periodically
   * RemoteAuth calls this with the session data object directly (not {session: name})
   * The session data contains: clientId, serverToken, clientToken, encKey, macKey, etc.
   */
  async save(sessionData: any): Promise<void> {
    try {
      // RemoteAuth passes the session data object directly
      const currentAccountId = await this.getCurrentAccountId();
      
      console.log(`[RemoteAuth Store] 🔄 save() method called for ${currentAccountId}`);
      console.log(`[RemoteAuth Store] Session parameter:`, {
        isNull: sessionData === null,
        isUndefined: sessionData === undefined,
        type: typeof sessionData,
        isObject: typeof sessionData === 'object',
        keys: sessionData && typeof sessionData === 'object' ? Object.keys(sessionData).length : 'N/A',
        keyNames: sessionData && typeof sessionData === 'object' ? Object.keys(sessionData) : 'N/A',
        hasValue: !!sessionData,
      });
      
      // CRITICAL FIX: Be more lenient with session data validation
      // Sometimes RemoteAuth passes partial data that's still valid
      if (!sessionData) {
        console.warn(`[RemoteAuth Store] ⚠️  Attempted to save null/undefined session for ${currentAccountId}. Skipping save.`);
        return;
      }
      
      // Accept any non-empty object, even if it doesn't have the expected WhatsApp keys yet
      // RemoteAuth might save data in multiple calls
      if (typeof sessionData === 'object' && Object.keys(sessionData).length === 0) {
        console.warn(`[RemoteAuth Store] ⚠️  Attempted to save empty session object for ${currentAccountId}. Skipping save.`);
        return;
      }
      
      // If it's a string, it might be a session name - try to extract from client
      if (typeof sessionData === 'string') {
        console.log(`[RemoteAuth Store] 📝 Received string session data: "${sessionData}"`);
        if (sessionData.startsWith('RemoteAuth-')) {
          console.warn(`[RemoteAuth Store] ⚠️  Received session name instead of session data. Attempting to extract real data...`);
          // Try to get actual session data from client
          if (this.clientRef) {
            const extractedData = await this.extractSessionFromClient();
            if (extractedData) {
              console.log(`[RemoteAuth Store] ✅ Extracted session data from client!`);
              sessionData = extractedData;
            } else {
              console.warn(`[RemoteAuth Store] ⚠️  Could not extract session data from client. Skipping save.`);
              return;
            }
          } else {
            console.warn(`[RemoteAuth Store] ⚠️  No client reference available. Skipping save.`);
            return;
          }
        }
      }
      
      // RemoteAuth may pass the session wrapped in a 'session' key: {session: {clientId, serverToken, ...}}
      // We need to unwrap it to save the actual session data
      let actualSessionData = sessionData;
      console.log(`[RemoteAuth Store] Before unwrapping check:`, {
        isObject: typeof sessionData === 'object',
        isNull: sessionData === null,
        keysCount: typeof sessionData === 'object' && sessionData !== null ? Object.keys(sessionData).length : 'N/A',
        allKeys: typeof sessionData === 'object' && sessionData !== null ? Object.keys(sessionData) : 'N/A',
        hasSessionKey: typeof sessionData === 'object' && sessionData !== null && 'session' in sessionData,
        sessionValueType: typeof sessionData === 'object' && sessionData !== null && 'session' in sessionData ? typeof (sessionData as any).session : 'N/A',
        sessionValueIsObject: typeof sessionData === 'object' && sessionData !== null && 'session' in sessionData && typeof (sessionData as any).session === 'object',
      });
      
      // Check if wrapped: {session: {...}}
      if (typeof sessionData === 'object' && sessionData !== null) {
        const keys = Object.keys(sessionData);
        if (keys.length === 1 && keys[0] === 'session') {
          const innerSession = (sessionData as any).session;
          console.log(`[RemoteAuth Store] Found wrapped session. Inner value:`, {
            type: typeof innerSession,
            isNull: innerSession === null,
            isObject: typeof innerSession === 'object',
            keys: typeof innerSession === 'object' && innerSession !== null ? Object.keys(innerSession) : 'N/A',
          });
          
          if (innerSession && typeof innerSession === 'object' && innerSession !== null) {
            console.log(`[RemoteAuth Store] ✅ Unwrapping session data from 'session' key before saving`);
            console.log(`[RemoteAuth Store] Inner session keys: ${Object.keys(innerSession).join(', ')}`);
            actualSessionData = innerSession;
          } else {
            // RemoteAuth is passing {session: "string"} where string is the session name, not credentials
            // Try to get the actual session data from the client's internal state
            console.warn(`[RemoteAuth Store] ⚠️  Session key exists but inner value is not a valid object:`, typeof innerSession, innerSession === null ? '(null)' : '');
            console.warn(`[RemoteAuth Store] ⚠️  RemoteAuth passed session name "${innerSession}" instead of credentials. Attempting to extract real session data from client...`);
            
            // Try to get actual session data from client's authStrategy or page
            if (this.clientRef) {
              try {
                const authStrategy = (this.clientRef as any).authStrategy;
                console.log(`[RemoteAuth Store] 🔍 Debugging authStrategy:`, {
                  hasAuthStrategy: !!authStrategy,
                  authStrategyKeys: authStrategy ? Object.keys(authStrategy).slice(0, 20) : 'N/A',
                  hasSessionData: authStrategy && 'sessionData' in authStrategy,
                  has_sessionData: authStrategy && '_sessionData' in authStrategy,
                  hasData: authStrategy && 'data' in authStrategy,
                });
                
                if (authStrategy) {
                  // Try multiple ways to get session data from authStrategy
                  let sessionData = (authStrategy as any).sessionData || 
                                   (authStrategy as any)._sessionData || 
                                   (authStrategy as any).data ||
                                   (authStrategy as any).session ||
                                   (authStrategy as any)._session;
                  
                  // Try to get from client's page localStorage
                  if (!sessionData || typeof sessionData !== 'object' || !('clientId' in sessionData)) {
                    try {
                      const page = (this.clientRef as any).pupPage || (this.clientRef as any).page;
                      if (page) {
                        console.log(`[RemoteAuth Store] 🔍 Attempting to extract session from page localStorage...`);
                        const localStorageData = await page.evaluate(() => {
                          try {
                            // Try to get from localStorage
                            const keys = Object.keys(localStorage);
                            const sessionKey = keys.find(k => k.includes('session') || k.includes('WASecretBundle'));
                            if (sessionKey) {
                              const data = localStorage.getItem(sessionKey);
                              if (data) {
                                try {
                                  return JSON.parse(data);
                                } catch {
                                  return data;
                                }
                              }
                            }
                            // Try indexedDB
                            return null;
                          } catch (e) {
                            return null;
                          }
                        });
                        
                        if (localStorageData && typeof localStorageData === 'object' && (
                          'clientId' in localStorageData || 'serverToken' in localStorageData
                        )) {
                          console.log(`[RemoteAuth Store] ✅ Found session data in page localStorage! Keys: ${Object.keys(localStorageData).join(', ')}`);
                          sessionData = localStorageData;
                        }
                      }
                    } catch (pageError: any) {
                      console.warn(`[RemoteAuth Store] Could not access page: ${pageError.message}`);
                    }
                  }
                  
                  if (sessionData && typeof sessionData === 'object' && (
                    'clientId' in sessionData || 'serverToken' in sessionData || 'clientToken' in sessionData
                  )) {
                    console.log(`[RemoteAuth Store] ✅ Found actual session data! Keys: ${Object.keys(sessionData).join(', ')}`);
                    actualSessionData = sessionData;
                  } else {
                    // Try to get from client's internal state
                    const clientState = (this.clientRef as any).state || (this.clientRef as any)._state;
                    console.log(`[RemoteAuth Store] 🔍 Checking client state:`, {
                      hasState: !!clientState,
                      has_state: !!(this.clientRef as any)._state,
                      stateKeys: clientState ? Object.keys(clientState).slice(0, 10) : 'N/A',
                    });
                    
                    if (clientState && typeof clientState === 'object' && (
                      'clientId' in clientState || 'serverToken' in clientState
                    )) {
                      console.log(`[RemoteAuth Store] ✅ Found actual session data in client's state! Keys: ${Object.keys(clientState).join(', ')}`);
                      actualSessionData = clientState;
                    } else {
                      console.warn(`[RemoteAuth Store] ⚠️  Could not find actual session data in client. Available authStrategy keys: ${authStrategy ? Object.keys(authStrategy).slice(0, 10).join(', ') : 'N/A'}`);
                      console.warn(`[RemoteAuth Store] ⚠️  Skipping save to preserve existing session data.`);
                      return;
                    }
                  }
                } else {
                  console.warn(`[RemoteAuth Store] ⚠️  Client has no authStrategy. Skipping save to preserve existing session data.`);
                  return;
                }
              } catch (error: any) {
                console.error(`[RemoteAuth Store] ❌ Error extracting session data from client:`, error.message, error.stack);
                console.warn(`[RemoteAuth Store] ⚠️  Skipping save to preserve existing session data.`);
                return;
              }
            } else {
              console.warn(`[RemoteAuth Store] ⚠️  No client reference available. Skipping save to preserve existing session data.`);
              return;
            }
          }
        } else {
          console.log(`[RemoteAuth Store] Session data is not wrapped (has ${keys.length} keys: ${keys.join(', ')})`);
        }
      }
      
      console.log(`[RemoteAuth Store] Saving session for ${currentAccountId} (original: ${this.originalAccountId})`);
      console.log(`[RemoteAuth Store] Final session data type: ${typeof actualSessionData}, isObject: ${typeof actualSessionData === 'object'}, keys: ${typeof actualSessionData === 'object' && actualSessionData !== null ? Object.keys(actualSessionData).length : 'N/A'}`);
      console.log(`[RemoteAuth Store] Final session data keys: ${typeof actualSessionData === 'object' && actualSessionData !== null ? Object.keys(actualSessionData).join(', ') : 'N/A'}`);
      
      // Validate that we have actual WhatsApp credentials before saving
      if (actualSessionData && typeof actualSessionData === 'object' && actualSessionData !== null) {
        const hasCredentials = 'clientId' in actualSessionData || 'serverToken' in actualSessionData || 'clientToken' in actualSessionData;
        if (!hasCredentials) {
          console.error(`[RemoteAuth Store] ❌ CRITICAL: Session data does not contain WhatsApp credentials! Keys: ${Object.keys(actualSessionData).join(', ')}`);
          console.error(`[RemoteAuth Store] ❌ RemoteAuth passed invalid session data. Skipping save to preserve existing valid session data.`);
          console.error(`[RemoteAuth Store] ❌ Original data had keys: ${typeof sessionData === 'object' && sessionData !== null ? Object.keys(sessionData).join(', ') : 'N/A'}`);
          // Skip saving invalid data - preserve existing valid session data
          return;
        } else {
          console.log(`[RemoteAuth Store] ✅ Session data contains WhatsApp credentials - will work on restart`);
        }
      } else {
        console.error(`[RemoteAuth Store] ❌ CRITICAL: Session data is not a valid object! Type: ${typeof actualSessionData}, Value: ${actualSessionData}`);
        console.error(`[RemoteAuth Store] ❌ Skipping save to preserve existing valid session data.`);
        return;
      }
      
      // Encrypt session data before saving
      const encrypted = encryptSessionData(actualSessionData);
      console.log(`[RemoteAuth Store] Encrypted session data length: ${encrypted.length} chars`);
      
      // Check if session exists first
      const existingSession = await db.query.whatsappWebSessions.findFirst({
        where: eq(whatsappWebSessions.accountId, currentAccountId),
      });

      if (!existingSession) {
        console.error(`[RemoteAuth Store] ❌ Session not found in database for ${currentAccountId}. Cannot save session data.`);
        throw new Error(`Session not found for accountId ${currentAccountId}`);
      }

      // Try to update by current accountId first
      const result = await db.update(whatsappWebSessions)
        .set({
          sessionData: encrypted as any, // Cast to any since jsonb can store strings
          updatedAt: new Date(),
        })
        .where(eq(whatsappWebSessions.accountId, currentAccountId))
        .returning();

      // If no rows updated, try the original accountId (in case migration hasn't updated the store yet)
      if (result.length === 0 && currentAccountId !== this.originalAccountId) {
        console.warn(`[RemoteAuth Store] Session not found for ${currentAccountId}, trying original ${this.originalAccountId}...`);
        const fallbackSession = await db.query.whatsappWebSessions.findFirst({
          where: eq(whatsappWebSessions.accountId, this.originalAccountId),
        });
        
        if (!fallbackSession) {
          throw new Error(`Session not found for accountId ${currentAccountId} or ${this.originalAccountId}`);
        }
        
        const fallbackResult = await db.update(whatsappWebSessions)
          .set({
            sessionData: encrypted as any,
            updatedAt: new Date(),
          })
          .where(eq(whatsappWebSessions.accountId, this.originalAccountId))
          .returning();
        
        if (fallbackResult.length > 0) {
          console.log(`[RemoteAuth Store] Successfully saved session for ${this.originalAccountId} (fallback)`);
          // Verify the save immediately after
          await this.verifySessionSaved(this.originalAccountId, encrypted);
        } else {
          throw new Error(`Failed to update session for accountId ${this.originalAccountId}`);
        }
      } else if (result.length > 0) {
        console.log(`[RemoteAuth Store] Successfully saved session for ${currentAccountId}`);
        // Verify the save immediately after - this will confirm it's actually in the database
        await this.verifySessionSaved(currentAccountId, encrypted);
      } else {
        throw new Error(`Failed to update session for accountId ${currentAccountId} - no rows updated`);
      }
    } catch (error) {
      console.error(`[RemoteAuth Store] Failed to save session:`, error);
      throw error;
    }
  }

  /**
   * Extract session data from the WhatsApp Web client
   * This is a fallback when RemoteAuth doesn't provide session data
   */
  private async extractSessionFromClient(): Promise<any> {
    if (!this.clientRef) {
      console.warn(`[RemoteAuth Store] No client reference available for session extraction`);
      return null;
    }

    try {
      console.log(`[RemoteAuth Store] 🔍 Attempting to extract session data from client...`);
      
      // Try to get the page object
      const page = (this.clientRef as any).pupPage || (this.clientRef as any).page;
      if (!page) {
        console.warn(`[RemoteAuth Store] No page object available in client`);
        return null;
      }

      // Extract session data from the browser page
      const sessionData = await page.evaluate(() => {
        try {
          // Try window.Store.Conn first (most reliable)
          if ((window as any).Store && (window as any).Store.Conn) {
            const conn = (window as any).Store.Conn;
            if (conn.clientToken && conn.serverToken) {
              return {
                clientId: conn.wid?.user || conn.me?.user || conn.clientId,
                serverToken: conn.serverToken,
                clientToken: conn.clientToken,
                encKey: conn.encKey,
                macKey: conn.macKey,
                wid: conn.wid,
                me: conn.me,
              };
            }
          }

          // Try localStorage as fallback
          const keys = Object.keys(localStorage);
          for (const key of keys) {
            if (key.includes('WASecretBundle') || key.includes('session') || key.includes('WAToken')) {
              const data = localStorage.getItem(key);
              if (data) {
                try {
                  const parsed = JSON.parse(data);
                  if (parsed && typeof parsed === 'object' && (
                    parsed.clientToken || parsed.serverToken || parsed.encKey
                  )) {
                    return parsed;
                  }
                } catch {
                  // Not JSON, might be a token string
                  if (data.length > 50) {
                    return { [key]: data };
                  }
                }
              }
            }
          }

          return null;
        } catch (e) {
          console.error('Error in page.evaluate:', e);
          return null;
        }
      });

      if (sessionData && typeof sessionData === 'object' && (
        'clientId' in sessionData || 'serverToken' in sessionData || 'clientToken' in sessionData
      )) {
        console.log(`[RemoteAuth Store] ✅ Successfully extracted session data from client`);
        console.log(`[RemoteAuth Store] Session keys: ${Object.keys(sessionData).join(', ')}`);
        return sessionData;
      } else {
        console.warn(`[RemoteAuth Store] ⚠️  Could not extract valid session data from client`);
        return null;
      }
    } catch (error: any) {
      console.error(`[RemoteAuth Store] ❌ Error extracting session from client: ${error.message}`);
      return null;
    }
  }

  /**
   * Verify that session data was actually saved to the database
   */
  private async verifySessionSaved(accountId: string, expectedEncrypted: string): Promise<void> {
    try {
      const session = await db.query.whatsappWebSessions.findFirst({
        where: eq(whatsappWebSessions.accountId, accountId),
      });

      if (!session) {
        console.error(`[RemoteAuth Store] ❌ Verification failed: Session not found for ${accountId}`);
        return;
      }

      const savedData = session.sessionData;
      if (!savedData) {
        console.error(`[RemoteAuth Store] ❌ Verification failed: sessionData is null/undefined for ${accountId}`);
        return;
      }

      // Compare the saved data with what we tried to save
      const savedString = typeof savedData === 'string' ? savedData : JSON.stringify(savedData);
      if (savedString === expectedEncrypted) {
        console.log(`[RemoteAuth Store] ✅ Verification passed: Session data correctly saved for ${accountId}`);
      } else {
        console.warn(`[RemoteAuth Store] ⚠️  Verification warning: Saved data doesn't match expected for ${accountId}`);
        console.log(`[RemoteAuth Store] Expected length: ${expectedEncrypted.length}, Saved length: ${savedString.length}`);
      }
    } catch (error: any) {
      console.error(`[RemoteAuth Store] ❌ Verification error for ${accountId}:`, error.message);
    }
  }

  /**
   * Delete session data from database
   * Called when user disconnects or session is invalidated
   */
  async delete(options?: { session?: string }): Promise<void> {
    try {
      // RemoteAuth passes {session: 'RemoteAuth-{accountId}'}, but we store by accountId
      // Extract the accountId by removing the "RemoteAuth-" prefix if present
      let currentAccountId: string;
      if (options?.session) {
        // Remove "RemoteAuth-" prefix if present
        currentAccountId = options.session.startsWith('RemoteAuth-') 
          ? options.session.substring('RemoteAuth-'.length)
          : options.session;
      } else {
        currentAccountId = await this.getCurrentAccountId();
      }
      console.log(`[RemoteAuth Store] Deleting session for ${currentAccountId} (from session: ${options?.session || 'N/A'}, original: ${this.originalAccountId})`);
      
      await db.update(whatsappWebSessions)
        .set({
          sessionData: null,
          status: 'disconnected',
          disconnectedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(whatsappWebSessions.accountId, currentAccountId));

      console.log(`[RemoteAuth Store] Successfully deleted session for ${currentAccountId}`);
    } catch (error) {
      console.error(`[RemoteAuth Store] Failed to delete session:`, error);
      throw error;
    }
  }
}

