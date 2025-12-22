/**
 * WhatsApp Media Routes
 * Handles media download/upload with GCS integration
 * Provides signed URLs for secure media access
 */

import { Router } from 'express';
import { db } from '../db';
import { whatsappMessages, whatsappAccounts } from '../../../shared/schema';
import { eq, and } from 'drizzle-orm';
import logger from '../logger';
import { whatsappAPIService } from '../services/whatsapp-api.service';
import { whatsappMediaStorageService } from '../services/whatsapp-media-storage.service';

const router = Router();

/**
 * GET /api/whatsapp/media/:messageId/url
 * Get signed URL for WhatsApp media
 * 
 * Flow:
 * 1. Verify message belongs to user's tenant
 * 2. If mediaUrl is absolute URL (legacy) → return it directly
 * 3. If mediaUrl is GCS path → check GCS and generate signed URL
 * 4. If no mediaUrl but has mediaId → download from WhatsApp, upload to GCS
 * 5. If no mediaUrl and no mediaId → return 400 error
 * 
 * Security: Never logs accessToken or sensitive credentials
 */
router.get('/media/:messageId/url', async (req: any, res) => {
  if (!req.user || !req.user.activeTenantId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { messageId } = req.params;
  const tenantId = req.user.activeTenantId;

  try {
    logger.info({
      tenantId,
      messageId,
      userId: req.user.id,
    }, '[WhatsApp Media] Getting signed URL for media');

    // Step 1: Verify message belongs to tenant
    const message = await db.query.whatsappMessages.findFirst({
      where: and(
        eq(whatsappMessages.id, messageId),
        eq(whatsappMessages.tenantId, tenantId)
      ),
    });

    if (!message) {
      logger.warn({ tenantId, messageId }, '[WhatsApp Media] Message not found or access denied');
      return res.status(404).json({ error: 'Message not found' });
    }

    // Check if message has any media reference
    if (!message.mediaId && !message.mediaUrl) {
      logger.warn({ tenantId, messageId }, '[WhatsApp Media] Message has no media');
      return res.status(400).json({ error: 'Message has no media' });
    }

    const mediaUrl = message.mediaUrl;

    // Step 2: If mediaUrl is absolute URL (legacy/external), return it directly
    if (mediaUrl && (mediaUrl.startsWith('http://') || mediaUrl.startsWith('https://'))) {
      logger.info({ 
        tenantId, 
        messageId,
        urlType: 'absolute',
      }, '[WhatsApp Media] Returning absolute/legacy URL directly');

      return res.json({
        url: mediaUrl,
        cached: true,
        legacy: true,
        mimeType: message.mediaMimeType,
        filename: message.mediaFilename,
      });
    }

    // Step 2.5: If mediaUrl is local storage path (WhatsApp Web), serve it directly
    if (mediaUrl && mediaUrl.startsWith('/storage/')) {
      logger.info({ 
        tenantId, 
        messageId,
        urlType: 'local-storage',
        path: mediaUrl,
      }, '[WhatsApp Media] Returning local storage URL');

      // Return the relative path - the browser will resolve it correctly
      // No need to construct full URL since static middleware serves it
      return res.json({
        url: mediaUrl, // Keep as relative path like /storage/...
        cached: true,
        local: true,
        mimeType: message.mediaMimeType,
        filename: message.mediaFilename,
      });
    }

    // Determine filename from message
    const filename = message.mediaFilename || 
      `${message.type}_${message.id}.${getExtensionFromMimeType(message.mediaMimeType || 'application/octet-stream')}`;

    // Step 3: If mediaUrl is GCS path, check GCS and generate signed URL
    const isGcsUrl = mediaUrl && mediaUrl.startsWith('/whatsapp-media/');

    if (isGcsUrl) {
      logger.info({ 
        tenantId, 
        messageId,
        accountId: message.accountId,
      }, '[WhatsApp Media] Media already cached in GCS');
      
      // Check if file still exists in GCS
      const mediaMetadata = await whatsappMediaStorageService.checkMediaExists(
        tenantId,
        messageId,
        filename
      );

      if (mediaMetadata.exists) {
        // Generate signed URL for existing media
        const signedUrl = await whatsappMediaStorageService.getSignedUrl(
          tenantId,
          messageId,
          filename,
          86400 // 24 hours
        );

        return res.json({
          url: signedUrl,
          cached: true,
          mimeType: message.mediaMimeType,
          filename: filename,
          size: mediaMetadata.size,
        });
      } else {
        logger.warn({ 
          tenantId, 
          messageId,
          accountId: message.accountId,
        }, '[WhatsApp Media] Cached media not found in GCS, will re-download');
      }
    }

    // Step 4: Need to download from WhatsApp - require mediaId and account
    if (!message.mediaId) {
      logger.error({ 
        tenantId, 
        messageId,
        accountId: message.accountId,
        hasMediaUrl: !!mediaUrl,
      }, '[WhatsApp Media] Cannot download - message missing mediaId');
      return res.status(400).json({ error: 'Media not available - no mediaId to download from WhatsApp' });
    }

    // Get account for WhatsApp API access (only when we need to download)
    const account = await db.query.whatsappAccounts.findFirst({
      where: eq(whatsappAccounts.id, message.accountId),
      columns: {
        id: true,
        accessToken: true,
        phoneNumberId: true,
      },
    });

    if (!account || !account.accessToken) {
      logger.error({ 
        tenantId, 
        messageId,
        accountId: message.accountId,
      }, '[WhatsApp Media] WhatsApp account not found or missing access token');
      return res.status(500).json({ error: 'WhatsApp account configuration error' });
    }

    logger.info({ 
      tenantId, 
      messageId,
      accountId: message.accountId,
      mediaId: message.mediaId,
      phoneNumberId: account.phoneNumberId,
    }, '[WhatsApp Media] Downloading media from WhatsApp');

    const mediaBuffer = await whatsappAPIService.downloadMediaById(
      message.mediaId,
      account.phoneNumberId,
      account.accessToken
    );

    logger.info({
      tenantId,
      messageId,
      accountId: message.accountId,
      size: mediaBuffer.length,
    }, '[WhatsApp Media] Media downloaded from WhatsApp');

    // Step 5: Upload to GCS
    const gcsPath = await whatsappMediaStorageService.uploadMedia({
      tenantId,
      messageId,
      filename,
      mimeType: message.mediaMimeType || 'application/octet-stream',
      buffer: mediaBuffer,
    });

    logger.info({
      tenantId,
      messageId,
      accountId: message.accountId,
      gcsPath,
    }, '[WhatsApp Media] Media uploaded to GCS');

    // Step 6: Update message record with GCS path
    await db
      .update(whatsappMessages)
      .set({
        mediaUrl: gcsPath,
        updatedAt: new Date(),
      })
      .where(eq(whatsappMessages.id, messageId));

    logger.info({ 
      tenantId, 
      messageId,
      accountId: message.accountId,
    }, '[WhatsApp Media] Message updated with GCS path');

    // Step 7: Generate signed URL
    const signedUrl = await whatsappMediaStorageService.getSignedUrl(
      tenantId,
      messageId,
      filename,
      86400 // 24 hours
    );

    logger.info({ 
      tenantId, 
      messageId,
      accountId: message.accountId,
    }, '[WhatsApp Media] Signed URL generated');

    return res.json({
      url: signedUrl,
      cached: false,
      mimeType: message.mediaMimeType,
      filename: filename,
      size: mediaBuffer.length,
    });

  } catch (error: any) {
    logger.error({
      error: error.message,
      stack: error.stack,
      tenantId,
      messageId,
    }, '[WhatsApp Media] Failed to get media URL');

    if (error.message.includes('not found')) {
      return res.status(404).json({ error: 'Media not found' });
    }

    return res.status(500).json({ 
      error: 'Failed to retrieve media URL',
      details: error.message,
    });
  }
});

/**
 * Helper: Get file extension from MIME type
 */
function getExtensionFromMimeType(mimeType: string): string {
  const mimeMap: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'video/mp4': 'mp4',
    'video/3gpp': '3gp',
    'audio/mpeg': 'mp3',
    'audio/ogg': 'ogg',
    'audio/aac': 'aac',
    'audio/amr': 'amr',
    'application/pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'text/plain': 'txt',
  };

  return mimeMap[mimeType] || 'bin';
}

export default router;
