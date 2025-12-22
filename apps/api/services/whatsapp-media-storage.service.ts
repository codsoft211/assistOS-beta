/**
 * WhatsApp Media Storage Service
 * Handles uploading and downloading WhatsApp media to/from Google Cloud Storage
 * with tenant isolation and secure signed URLs
 */

import { File } from '@google-cloud/storage';
import { objectStorageClient } from './storage.service';
import logger from '../logger';
import { randomUUID } from 'crypto';

/**
 * Parse GCS path into bucket and object name
 * Format: /<bucket_name>/<object_name>
 */
function parseObjectPath(fullPath: string): { bucketName: string; objectName: string } {
  const parts = fullPath.slice(1).split('/');
  const bucketName = parts[0];
  const objectName = parts.slice(1).join('/');
  return { bucketName, objectName };
}

/**
 * Sign a GCS object URL for temporary access
 */
async function signObjectURL(options: {
  bucketName: string;
  objectName: string;
  method: 'GET' | 'PUT';
  ttlSec: number;
}): Promise<string> {
  const { bucketName, objectName, method, ttlSec } = options;
  const bucket = objectStorageClient.bucket(bucketName);
  const file = bucket.file(objectName);

  const [signedUrl] = await file.getSignedUrl({
    version: 'v4',
    action: method === 'GET' ? 'read' : 'write',
    expires: Date.now() + ttlSec * 1000,
  });

  return signedUrl;
}

export interface UploadWhatsAppMediaParams {
  tenantId: string;
  messageId: string;
  filename: string;
  mimeType: string;
  buffer: Buffer;
}

export interface DownloadWhatsAppMediaParams {
  tenantId: string;
  messageId: string;
  filename: string;
}

export interface WhatsAppMediaMetadata {
  exists: boolean;
  gcsPath?: string;
  signedUrl?: string;
  contentType?: string;
  size?: number;
}

export class WhatsappMediaStorageService {
  private readonly WHATSAPP_MEDIA_DIR = '/whatsapp-media';

  /**
   * Get the private object directory from environment
   */
  private getPrivateObjectDir(): string {
    const dir = process.env.PRIVATE_OBJECT_DIR || '';
    if (!dir) {
      throw new Error(
        'PRIVATE_OBJECT_DIR not set. Create a bucket in Object Storage and set PRIVATE_OBJECT_DIR env var.'
      );
    }
    return dir;
  }

  /**
   * Generate GCS path for WhatsApp media with tenant isolation
   * Format: /whatsapp-media/{tenantId}/{messageId}/{filename}
   */
  private generateMediaPath(tenantId: string, messageId: string, filename: string): string {
    // Sanitize filename (remove special chars, keep extension)
    const sanitizedFilename = filename
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove accents
      .replace(/[^a-z0-9._-]/g, '-')   // Replace special chars with dashes
      .replace(/-+/g, '-')              // Replace multiple dashes with single
      .replace(/^-|-$/g, '');           // Remove leading/trailing dashes

    return `${this.WHATSAPP_MEDIA_DIR}/${tenantId}/${messageId}/${sanitizedFilename}`;
  }

  /**
   * Upload WhatsApp media to GCS with tenant isolation
   */
  async uploadMedia(params: UploadWhatsAppMediaParams): Promise<string> {
    const { tenantId, messageId, filename, mimeType, buffer } = params;

    try {
      logger.info({
        tenantId,
        messageId,
        filename,
        size: buffer.length,
      }, '[WhatsApp Media Storage] Uploading media to GCS');

      const privateObjectDir = this.getPrivateObjectDir();
      const mediaPath = this.generateMediaPath(tenantId, messageId, filename);
      const fullPath = `${privateObjectDir}${mediaPath}`;

      const { bucketName, objectName } = parseObjectPath(fullPath);
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);

      // Upload the file with metadata
      await file.save(buffer, {
        contentType: mimeType,
        metadata: {
          metadata: {
            tenantId,
            messageId,
            originalFilename: filename,
            uploadedAt: new Date().toISOString(),
          },
        },
      });

      logger.info({
        tenantId,
        messageId,
        gcsPath: fullPath,
      }, '[WhatsApp Media Storage] Media uploaded successfully');

      // Return the GCS path (relative to private object dir)
      return mediaPath;
    } catch (error: any) {
      logger.error({
        error: error.message,
        tenantId,
        messageId,
      }, '[WhatsApp Media Storage] Upload failed');
      throw new Error(`Failed to upload WhatsApp media to GCS: ${error.message}`);
    }
  }

  /**
   * Download WhatsApp media from GCS
   */
  async downloadMedia(params: DownloadWhatsAppMediaParams): Promise<Buffer> {
    const { tenantId, messageId, filename } = params;

    try {
      logger.info({
        tenantId,
        messageId,
        filename,
      }, '[WhatsApp Media Storage] Downloading media from GCS');

      const privateObjectDir = this.getPrivateObjectDir();
      const mediaPath = this.generateMediaPath(tenantId, messageId, filename);
      const fullPath = `${privateObjectDir}${mediaPath}`;

      const { bucketName, objectName } = parseObjectPath(fullPath);
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);

      // Check if file exists
      const [exists] = await file.exists();
      if (!exists) {
        throw new Error('Media not found in GCS');
      }

      // Download the file
      const [buffer] = await file.download();

      logger.info({
        tenantId,
        messageId,
        size: buffer.length,
      }, '[WhatsApp Media Storage] Media downloaded successfully');

      return buffer;
    } catch (error: any) {
      logger.error({
        error: error.message,
        tenantId,
        messageId,
      }, '[WhatsApp Media Storage] Download failed');
      throw new Error(`Failed to download WhatsApp media from GCS: ${error.message}`);
    }
  }

  /**
   * Generate a signed URL for secure media access (24h expiration)
   */
  async getSignedUrl(
    tenantId: string,
    messageId: string,
    filename: string,
    expirationSeconds: number = 86400 // 24 hours
  ): Promise<string> {
    try {
      logger.info({
        tenantId,
        messageId,
        filename,
      }, '[WhatsApp Media Storage] Generating signed URL');

      const privateObjectDir = this.getPrivateObjectDir();
      const mediaPath = this.generateMediaPath(tenantId, messageId, filename);
      const fullPath = `${privateObjectDir}${mediaPath}`;

      const { bucketName, objectName } = parseObjectPath(fullPath);

      // Check if file exists
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);
      const [exists] = await file.exists();

      if (!exists) {
        throw new Error('Media not found in GCS');
      }

      const signedUrl = await signObjectURL({
        bucketName,
        objectName,
        method: 'GET',
        ttlSec: expirationSeconds,
      });

      logger.info({
        tenantId,
        messageId,
      }, '[WhatsApp Media Storage] Signed URL generated successfully');

      return signedUrl;
    } catch (error: any) {
      logger.error({
        error: error.message,
        tenantId,
        messageId,
      }, '[WhatsApp Media Storage] Failed to generate signed URL');
      throw new Error(`Failed to generate signed URL: ${error.message}`);
    }
  }

  /**
   * Check if media exists in GCS and get metadata
   */
  async checkMediaExists(
    tenantId: string,
    messageId: string,
    filename: string
  ): Promise<WhatsAppMediaMetadata> {
    try {
      const privateObjectDir = this.getPrivateObjectDir();
      const mediaPath = this.generateMediaPath(tenantId, messageId, filename);
      const fullPath = `${privateObjectDir}${mediaPath}`;

      const { bucketName, objectName } = parseObjectPath(fullPath);
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);

      const [exists] = await file.exists();

      if (!exists) {
        return { exists: false };
      }

      const [metadata] = await file.getMetadata();

      return {
        exists: true,
        gcsPath: mediaPath,
        contentType: metadata.contentType,
        size: typeof metadata.size === 'string' ? parseInt(metadata.size, 10) : (metadata.size || 0),
      };
    } catch (error: any) {
      logger.error({
        error: error.message,
        tenantId,
        messageId,
      }, '[WhatsApp Media Storage] Failed to check media existence');
      return { exists: false };
    }
  }

  /**
   * Delete media from GCS
   */
  async deleteMedia(tenantId: string, messageId: string, filename: string): Promise<void> {
    try {
      logger.info({
        tenantId,
        messageId,
        filename,
      }, '[WhatsApp Media Storage] Deleting media from GCS');

      const privateObjectDir = this.getPrivateObjectDir();
      const mediaPath = this.generateMediaPath(tenantId, messageId, filename);
      const fullPath = `${privateObjectDir}${mediaPath}`;

      const { bucketName, objectName } = parseObjectPath(fullPath);
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);

      await file.delete();

      logger.info({
        tenantId,
        messageId,
      }, '[WhatsApp Media Storage] Media deleted successfully');
    } catch (error: any) {
      logger.error({
        error: error.message,
        tenantId,
        messageId,
      }, '[WhatsApp Media Storage] Delete failed');
      throw new Error(`Failed to delete WhatsApp media from GCS: ${error.message}`);
    }
  }
}

export const whatsappMediaStorageService = new WhatsappMediaStorageService();
