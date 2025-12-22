/**
 * File Storage Service
 * 
 * Centralized service for fetching files from storage backends (Supabase, local, GCS, etc.)
 * Automatically detects storage backend based on file attachment metadata.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { SupabaseStorageProvider } from '../../../packages/document-management/providers/SupabaseStorageProvider';

export interface FileAttachment {
  id: string;
  tenantId: string;
  path: string;
  sourceSystem?: string | null;
  mimeType: string;
  originalName: string;
  size: number;
}

/**
 * Get file buffer from storage backend
 * 
 * Supports multiple storage backends:
 * - Supabase Storage (sourceSystem: 'supabase')
 * - Local filesystem (sourceSystem: null, 'local', or legacy paths)
 * - Google Cloud Storage (sourceSystem: 'gcs', 'shared_gcs')
 * 
 * @param attachment - File attachment record from database
 * @returns File buffer
 */
export async function getFileBuffer(attachment: FileAttachment): Promise<Buffer> {
  const sourceSystem = attachment.sourceSystem?.toLowerCase();

  // SUPABASE STORAGE
  if (sourceSystem === 'supabase') {
    try {
      const supabaseProvider = getSupabaseProvider();
      return await supabaseProvider.download(attachment.path);
    } catch (error) {
      console.error(`[FileStorage] Failed to fetch from Supabase: ${attachment.path}`, error);
      throw new Error(`Failed to fetch file from Supabase Storage: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // LOCAL FILESYSTEM (legacy or development)
  // Includes: null, 'local', or paths starting with 'uploads/'
  if (!sourceSystem || sourceSystem === 'local' || attachment.path.startsWith('uploads/')) {
    try {
      const fullPath = path.resolve(process.cwd(), attachment.path);
      
      // Security check: ensure path is within project directory
      const projectRoot = process.cwd();
      if (!fullPath.startsWith(projectRoot)) {
        throw new Error('Invalid file path: outside project directory');
      }

      return await fs.readFile(fullPath);
    } catch (error) {
      console.error(`[FileStorage] Failed to read local file: ${attachment.path}`, error);
      throw new Error(`Failed to read file from local filesystem: ${error instanceof Error ? error.message : 'File not found'}`);
    }
  }

  // GOOGLE CLOUD STORAGE (via ObjectStorageService)
  if (sourceSystem === 'gcs' || sourceSystem === 'shared_gcs' || sourceSystem === 'assist_me') {
    try {
      const { ObjectStorageService } = await import('./storage.service');
      const storageService = new ObjectStorageService();
      
      // Get file from GCS
      const file = await storageService.getObjectEntityFile(attachment.path);
      const [buffer] = await file.download();
      
      return buffer;
    } catch (error) {
      console.error(`[FileStorage] Failed to fetch from GCS: ${attachment.path}`, error);
      throw new Error(`Failed to fetch file from Google Cloud Storage: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // UNKNOWN SOURCE SYSTEM
  throw new Error(`Unsupported storage backend: ${sourceSystem || 'unknown'}`);
}

/**
 * Get Supabase provider instance
 * @private
 */
function getSupabaseProvider(): SupabaseStorageProvider {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  const bucketName = process.env.SUPABASE_BUCKET_NAME || 'assistos-attachments';

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      'SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables are required. ' +
      'Please set them in your .env file.'
    );
  }

  return new SupabaseStorageProvider({
    type: 'supabase',
    bucketName,
    credentials: {
      url: supabaseUrl,
      key: supabaseKey,
    },
  });
}

/**
 * Check if file exists in storage
 * 
 * @param attachment - File attachment record
 * @returns true if file exists
 */
export async function fileExists(attachment: FileAttachment): Promise<boolean> {
  const sourceSystem = attachment.sourceSystem?.toLowerCase();

  try {
    if (sourceSystem === 'supabase') {
      const supabaseProvider = getSupabaseProvider();
      return await supabaseProvider.exists(attachment.path);
    }

    if (!sourceSystem || sourceSystem === 'local' || attachment.path.startsWith('uploads/')) {
      const fullPath = path.resolve(process.cwd(), attachment.path);
      try {
        await fs.access(fullPath);
        return true;
      } catch {
        return false;
      }
    }

    if (sourceSystem === 'gcs' || sourceSystem === 'shared_gcs' || sourceSystem === 'assist_me') {
      const { ObjectStorageService } = await import('./storage.service');
      const storageService = new ObjectStorageService();
      const file = await storageService.getObjectEntityFile(attachment.path);
      const [exists] = await file.exists();
      return exists;
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Get file stream URL (for direct streaming or signed URLs)
 * 
 * @param attachment - File attachment record
 * @param expiresIn - Expiration time in seconds (default: 3600)
 * @returns Signed URL for file access
 */
export async function getFileUrl(attachment: FileAttachment, expiresIn: number = 3600): Promise<string | null> {
  const sourceSystem = attachment.sourceSystem?.toLowerCase();

  if (sourceSystem === 'supabase') {
    try {
      const supabaseProvider = getSupabaseProvider();
      return await supabaseProvider.getSignedUrl(attachment.path, {
        expiresIn,
        action: 'read',
      });
    } catch (error) {
      console.error(`[FileStorage] Failed to generate Supabase signed URL:`, error);
      return null;
    }
  }

  // Local files and GCS files don't support direct signed URLs in this implementation
  // They must be served through the API
  return null;
}

