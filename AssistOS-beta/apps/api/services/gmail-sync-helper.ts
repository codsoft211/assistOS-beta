/**
 * Gmail Sync Helper (FASE 3.7)
 * 
 * Shared helper function for syncing Gmail emails.
 * Used by both the route handler and cron service to avoid code duplication.
 */

import { google } from "googleapis";
import { db } from "../db";
import { emailInbox, userGmailAccounts } from "../../../shared/schema";
import { eq, and } from "drizzle-orm";
import { deserializeEncryptedData, decryptCredentials } from "../../../packages/document-management/utils/encryption";
import logger from "../logger";

export interface SyncGmailAccountParams {
  tenantId: string;
  userId: string;
  account: any; // userGmailAccount record with tokens
  filterPeriodHours: number;
  maxResults?: number; // default 100
}

export interface SyncGmailAccountResult {
  synced: number;
  total: number;
  error?: string;
}

/**
 * Sync a single Gmail account
 * 
 * @param params - Sync parameters
 * @returns Result containing synced count, total messages, and optional error
 */
export async function syncGmailAccount(params: SyncGmailAccountParams): Promise<SyncGmailAccountResult> {
  const { tenantId, userId, account, filterPeriodHours, maxResults = 100 } = params;

  try {
    logger.info({ email: account.email, userId, tenantId }, '[Gmail Sync Helper] Syncing account');

    // Decrypt tokens
    const encryptedAccessToken = deserializeEncryptedData(account.accessToken);
    const encryptedRefreshToken = deserializeEncryptedData(account.refreshToken);
    
    const accessTokenData = decryptCredentials(encryptedAccessToken, tenantId);
    const refreshTokenData = decryptCredentials(encryptedRefreshToken, tenantId);

    // Check if token is expired
    const now = new Date();
    const needsRefresh = account.expiresAt < now;

    // Create OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );

    if (needsRefresh) {
      logger.info({ email: account.email }, '[Gmail Sync Helper] Token expired, refreshing...');
      oauth2Client.setCredentials({
        refresh_token: refreshTokenData.token,
      });

      // Refresh will happen automatically on first API call
    } else {
      oauth2Client.setCredentials({
        access_token: accessTokenData.token,
        refresh_token: refreshTokenData.token,
      });
    }

    // Initialize Gmail API
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    // Convert hours to date filter
    const afterDate = new Date();
    afterDate.setHours(afterDate.getHours() - filterPeriodHours);
    const afterDateStr = afterDate.toISOString().split('T')[0].replace(/-/g, '/'); // Format: YYYY/MM/DD
    
    logger.info({ 
      email: account.email, 
      maxResults, 
      filterPeriodHours, 
      afterDate: afterDateStr 
    }, '[Gmail Sync Helper] Fetching messages from Gmail API');

    const listResponse = await gmail.users.messages.list({
      userId: 'me',
      maxResults,
      labelIds: ['INBOX'],
      q: `after:${afterDateStr}`,
    });

    const messages = listResponse.data.messages || [];
    logger.info({ 
      email: account.email, 
      messageCount: messages.length 
    }, '[Gmail Sync Helper] Found messages in Gmail inbox');

    let accountSynced = 0;

    for (const message of messages) {
      try {
        // Check if message already exists
        const existing = await db.query.emailInbox.findFirst({
          where: and(
            eq(emailInbox.tenantId, tenantId),
            eq(emailInbox.gmailMessageId, message.id!)
          ),
        });

        if (existing) {
          logger.debug({ 
            email: account.email, 
            messageId: message.id 
          }, '[Gmail Sync Helper] Message already exists, skipping');
          continue;
        }

        // Fetch full message details
        const fullMessage = await gmail.users.messages.get({
          userId: 'me',
          id: message.id!,
          format: 'full',
        });

        const messageData = fullMessage.data;
        const headers = messageData.payload?.headers || [];
        
        // Extract headers
        const getHeader = (name: string) => headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value || null;
        
        const fromHeader = getHeader('From');
        const toHeader = getHeader('To');
        const ccHeader = getHeader('Cc');
        const bccHeader = getHeader('Bcc');
        const subjectHeader = getHeader('Subject');
        const dateHeader = getHeader('Date');

        // Parse "From" header to extract email and name
        let fromAddress = fromHeader || '';
        let fromName = null;
        if (fromHeader) {
          const match = fromHeader.match(/^(.*?)\s*<(.+?)>$/);
          if (match) {
            fromName = match[1].replace(/"/g, '').trim();
            fromAddress = match[2];
          }
        }

        // Extract body
        let bodyText = '';
        let bodyHtml = '';

        const extractBody = (part: any): void => {
          if (part.mimeType === 'text/plain' && part.body?.data) {
            bodyText += Buffer.from(part.body.data, 'base64').toString('utf-8');
          } else if (part.mimeType === 'text/html' && part.body?.data) {
            bodyHtml += Buffer.from(part.body.data, 'base64').toString('utf-8');
          }
          
          if (part.parts) {
            part.parts.forEach(extractBody);
          }
        };

        if (messageData.payload) {
          extractBody(messageData.payload);
        }

        // Extract attachments metadata
        const attachments: any[] = [];
        const extractAttachments = (part: any): void => {
          if (part.filename && part.body?.attachmentId) {
            attachments.push({
              filename: part.filename,
              mimeType: part.mimeType,
              size: part.body.size,
              attachmentId: part.body.attachmentId,
            });
          }
          
          if (part.parts) {
            part.parts.forEach(extractAttachments);
          }
        };

        if (messageData.payload) {
          extractAttachments(messageData.payload);
        }

        // Parse date
        let receivedAt = new Date();
        if (dateHeader) {
          const parsedDate = new Date(dateHeader);
          if (!isNaN(parsedDate.getTime())) {
            receivedAt = parsedDate;
          }
        }

        // Insert into database
        await db.insert(emailInbox).values({
          tenantId,
          gmailMessageId: message.id!,
          threadId: messageData.threadId || null,
          fromAddress,
          fromName,
          toAddress: toHeader,
          ccAddresses: ccHeader ? ccHeader.split(',').map(e => e.trim()) : null,
          bccAddresses: bccHeader ? bccHeader.split(',').map(e => e.trim()) : null,
          subject: subjectHeader,
          snippet: messageData.snippet || null,
          bodyText: bodyText || null,
          bodyHtml: bodyHtml || null,
          labels: messageData.labelIds || null,
          attachments: attachments.length > 0 ? attachments : null,
          isRead: !messageData.labelIds?.includes('UNREAD'),
          isStarred: messageData.labelIds?.includes('STARRED') || false,
          receivedAt,
          processingStatus: 'pending',
        });

        accountSynced++;
        logger.debug({ 
          email: account.email, 
          messageId: message.id 
        }, '[Gmail Sync Helper] Synced message');
      } catch (error) {
        logger.error({ 
          email: account.email, 
          messageId: message.id, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        }, '[Gmail Sync Helper] Error syncing message');
      }
    }

    // Update lastUsedAt
    await db.update(userGmailAccounts)
      .set({ lastUsedAt: new Date() })
      .where(eq(userGmailAccounts.id, account.id));

    logger.info({ 
      email: account.email, 
      synced: accountSynced, 
      total: messages.length 
    }, '[Gmail Sync Helper] Account sync completed');

    return {
      synced: accountSynced,
      total: messages.length,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ 
      email: account.email, 
      error: errorMessage 
    }, '[Gmail Sync Helper] Error syncing account');
    
    return {
      synced: 0,
      total: 0,
      error: errorMessage,
    };
  }
}
