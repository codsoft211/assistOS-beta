import type { ActionExecutor, ActionResult } from '../ActionExecutor';
import type { ExecutionContext } from '../types';
import { google } from 'googleapis';
import { db } from '../../../apps/api/db';
import { userGmailAccounts } from '../../../shared/schema';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { 
  decryptCredentials, 
  deserializeEncryptedData,
  encryptCredentials,
  serializeEncryptedData 
} from '../../document-management/utils/encryption';

// Zod schema for parameter validation
const paramsSchema = z.object({
  to: z.union([
    z.string().email().min(1),
    z.array(z.string().email()).min(1)
  ]),
  subject: z.string().min(1),
  body: z.string().optional(),
  html: z.string().optional(),
  accountId: z.string().optional(),
}).refine(
  data => data.body || data.html,
  { message: "Either 'body' or 'html' must be provided" }
);

type SendEmailParams = z.infer<typeof paramsSchema>;

export class SendEmailGmailAction implements ActionExecutor {
  readonly name = 'send_email_gmail';
  readonly description = 'Send email via Gmail OAuth account';
  
  validate(config: Record<string, any>): boolean {
    try {
      paramsSchema.parse(config);
      return true;
    } catch {
      return false;
    }
  }
  
  async execute(
    config: Record<string, any>,
    context: ExecutionContext
  ): Promise<ActionResult> {
    try {
      // Validate and normalize params with Zod
      const params = paramsSchema.parse(config);
      const { to, subject, body, html, accountId } = params;
      const { userId, tenantId } = context;

      if (!userId) {
        return {
          success: false,
          error: 'User ID is required in execution context',
        };
      }

      if (!tenantId) {
        return {
          success: false,
          error: 'Tenant ID is required in execution context',
        };
      }

      // Normalize recipients - reject empty arrays or whitespace-only strings
      const normalizedTo = Array.isArray(to) ? to : [to];
      const validRecipients = normalizedTo.filter(r => r.trim().length > 0);
      
      if (validRecipients.length === 0) {
        return {
          success: false,
          error: 'No valid recipients provided',
        };
      }

      // Get Gmail account (specific or primary)
      let account;
      if (accountId) {
        // Use specific account
        account = await db.query.userGmailAccounts.findFirst({
          where: and(
            eq(userGmailAccounts.id, accountId),
            eq(userGmailAccounts.userId, userId),
            eq(userGmailAccounts.tenantId, tenantId),
            eq(userGmailAccounts.isActive, true)
          ),
        });
      } else {
        // Use primary account
        account = await db.query.userGmailAccounts.findFirst({
          where: and(
            eq(userGmailAccounts.userId, userId),
            eq(userGmailAccounts.tenantId, tenantId),
            eq(userGmailAccounts.isPrimary, true),
            eq(userGmailAccounts.isActive, true)
          ),
        });
      }

      if (!account) {
        return {
          success: false,
          error: accountId 
            ? `Gmail account ${accountId} not found or inactive`
            : 'No primary Gmail account configured',
        };
      }

      // Decrypt tokens
      const decryptedAccessData = decryptCredentials(
        deserializeEncryptedData(account.accessToken),
        tenantId
      );
      const decryptedRefreshData = decryptCredentials(
        deserializeEncryptedData(account.refreshToken),
        tenantId
      );

      const accessToken = decryptedAccessData.token;
      const refreshToken = decryptedRefreshData.token;

      // Setup OAuth client
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
      );

      oauth2Client.setCredentials({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      // Check if token expired, refresh if needed
      if (account.expiresAt < new Date()) {
        console.log('[SendEmailGmail] Token expired, refreshing...');
        try {
          const { credentials } = await oauth2Client.refreshAccessToken();
          
          if (credentials.access_token) {
            // Prepare update data
            const updateData: any = {
              accessToken: serializeEncryptedData(
                encryptCredentials({ token: credentials.access_token }, tenantId)
              ),
              expiresAt: new Date(credentials.expiry_date || Date.now() + 3600 * 1000),
              updatedAt: new Date(),
            };

            // Google may rotate refresh_token - persist it if provided
            if (credentials.refresh_token) {
              updateData.refreshToken = serializeEncryptedData(
                encryptCredentials({ token: credentials.refresh_token }, tenantId)
              );
            }
            
            await db.update(userGmailAccounts)
              .set(updateData)
              .where(eq(userGmailAccounts.id, account.id));

            // Update client with new token
            oauth2Client.setCredentials(credentials);
          }
        } catch (refreshError) {
          console.error('[SendEmailGmail] Token refresh failed:', refreshError);
          return {
            success: false,
            error: 'Failed to refresh Gmail access token',
          };
        }
      }

      // Create Gmail API client
      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

      // Build email message with normalized recipients
      const recipients = validRecipients.join(', ');
      const emailContent = html || body;
      const contentType = html ? 'text/html' : 'text/plain';

      const message = [
        `To: ${recipients}`,
        `Subject: ${subject}`,
        `Content-Type: ${contentType}; charset=utf-8`,
        '',
        emailContent,
      ].join('\n');

      // Encode message in base64url
      const encodedMessage = Buffer.from(message)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      // Send email
      const response = await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: encodedMessage,
        },
      });

      console.log('[SendEmailGmail] Email sent successfully:', response.data.id);

      // Update lastUsedAt
      await db.update(userGmailAccounts)
        .set({ lastUsedAt: new Date() })
        .where(eq(userGmailAccounts.id, account.id));

      return {
        success: true,
        output: {
          messageId: response.data.id,
          to: recipients,
          subject,
        },
      };
    } catch (error) {
      console.error('[SendEmailGmail] Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error sending email',
      };
    }
  }
}
