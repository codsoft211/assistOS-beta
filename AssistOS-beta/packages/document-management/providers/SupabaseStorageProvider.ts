import { createClient, SupabaseClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import {
  IStorageProvider,
  FileMetadata,
  ListResult,
  SyncResult,
  UploadOptions,
  DownloadOptions,
  ListOptions,
  SignedUrlOptions,
  ProviderConfig,
  StorageError,
  FileNotFoundError,
  UploadError,
  DownloadError,
  InvalidCredentialsError,
} from './IStorageProvider';

/**
 * Supabase Storage Provider Configuration
 */
export interface SupabaseProviderConfig extends ProviderConfig {
  type: 'supabase';
  bucketName: string;
  credentials: {
    url: string;
    key: string;
  };
}

/**
 * Supabase Storage Provider
 * 
 * Provides integration with Supabase Storage for file storage.
 * Supports all core storage operations including signed URLs for direct uploads/downloads.
 */
export class SupabaseStorageProvider implements IStorageProvider {
  readonly type = 'supabase';
  readonly name = 'Supabase Storage';
  
  private client: SupabaseClient;
  private bucketName: string;

  constructor(config: SupabaseProviderConfig) {
    if (!config.credentials?.url || !config.credentials?.key) {
      throw new InvalidCredentialsError(
        'supabase',
        new Error('Supabase URL and key are required')
      );
    }

    if (!config.bucketName) {
      throw new StorageError(
        'Bucket name is required for Supabase storage',
        'INVALID_CONFIG',
        'supabase'
      );
    }

    this.bucketName = config.bucketName;
    this.client = createClient(config.credentials.url, config.credentials.key);
  }

  /**
   * Upload a file to Supabase Storage
   */
  async upload(
    buffer: Buffer,
    filePath: string,
    options?: UploadOptions
  ): Promise<FileMetadata> {
    try {
      // Calculate checksum if not provided
      const checksum = options?.checksum || crypto.createHash('md5').update(buffer).digest('hex');

      // Prepare upload options
      const uploadOptions: any = {
        contentType: options?.contentType || 'application/octet-stream',
        cacheControl: options?.cacheControl || '3600',
        upsert: false,
      };

      // Add custom metadata if provided
      if (options?.metadata) {
        uploadOptions.metadata = options.metadata;
      }

      // Upload to Supabase Storage
      const { data, error } = await this.client.storage
        .from(this.bucketName)
        .upload(filePath, buffer, uploadOptions);

      if (error) {
        throw new UploadError(filePath, this.type, error as Error);
      }

      if (!data) {
        throw new UploadError(
          filePath,
          this.type,
          new Error('Upload returned no data')
        );
      }

      // Construct metadata from upload response and buffer
      // (More efficient than fetching it again)
      const fileName = filePath.split('/').pop() || filePath;
      
      return {
        name: fileName,
        path: data.path || filePath,
        size: buffer.length,
        contentType: options?.contentType || 'application/octet-stream',
        checksum: checksum,
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: options?.metadata,
        externalId: data.id,
      };
    } catch (error) {
      if (error instanceof UploadError) {
        throw error;
      }
      throw new UploadError(filePath, this.type, error as Error);
    }
  }

  /**
   * Download a file from Supabase Storage
   */
  async download(
    filePath: string,
    options?: DownloadOptions
  ): Promise<Buffer> {
    try {
      const { data, error } = await this.client.storage
        .from(this.bucketName)
        .download(filePath);

      if (error) {
        if (error.message?.includes('not found')) {
          throw new FileNotFoundError(filePath, this.type);
        }
        throw new DownloadError(filePath, this.type, error as Error);
      }

      if (!data) {
        throw new DownloadError(
          filePath,
          this.type,
          new Error('Download returned no data')
        );
      }

      // Convert Blob to Buffer
      const arrayBuffer = await data.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Handle range request if specified
      if (options?.range) {
        const { start, end } = options.range;
        return buffer.slice(start, end + 1);
      }

      return buffer;
    } catch (error) {
      if (error instanceof FileNotFoundError || error instanceof DownloadError) {
        throw error;
      }
      throw new DownloadError(filePath, this.type, error as Error);
    }
  }

  /**
   * Delete a file from Supabase Storage
   */
  async delete(filePath: string): Promise<void> {
    try {
      const { error } = await this.client.storage
        .from(this.bucketName)
        .remove([filePath]);

      if (error) {
        throw new StorageError(
          `Failed to delete file: ${filePath}`,
          'DELETE_FAILED',
          this.type,
          error as Error
        );
      }
    } catch (error) {
      if (error instanceof StorageError) {
        throw error;
      }
      throw new StorageError(
        `Failed to delete file: ${filePath}`,
        'DELETE_FAILED',
        this.type,
        error as Error
      );
    }
  }

  /**
   * Check if a file exists in Supabase Storage
   */
  async exists(filePath: string): Promise<boolean> {
    try {
      const { data, error } = await this.client.storage
        .from(this.bucketName)
        .list(this.getDirectoryPath(filePath), {
          search: this.getFileName(filePath),
        });

      if (error) {
        return false;
      }

      return data && data.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Get file metadata from Supabase Storage
   */
  async getMetadata(filePath: string): Promise<FileMetadata> {
    try {
      const dirPath = this.getDirectoryPath(filePath);
      const fileName = this.getFileName(filePath);

      const { data, error } = await this.client.storage
        .from(this.bucketName)
        .list(dirPath, {
          search: fileName,
        });

      if (error) {
        throw new FileNotFoundError(filePath, this.type);
      }

      if (!data || data.length === 0) {
        throw new FileNotFoundError(filePath, this.type);
      }

      const fileInfo = data[0];

      // Calculate checksum by downloading the file
      // Note: This is expensive - consider caching or storing checksum separately
      const buffer = await this.download(filePath);
      const checksum = crypto.createHash('md5').update(buffer).digest('hex');

      return {
        name: fileInfo.name,
        path: filePath,
        size: buffer.length,
        contentType: fileInfo.metadata?.mimetype || 'application/octet-stream',
        checksum,
        createdAt: new Date(fileInfo.created_at),
        updatedAt: new Date(fileInfo.updated_at || fileInfo.created_at),
        metadata: fileInfo.metadata as Record<string, string>,
      };
    } catch (error) {
      if (error instanceof FileNotFoundError) {
        throw error;
      }
      throw new StorageError(
        `Failed to get metadata for: ${filePath}`,
        'METADATA_FAILED',
        this.type,
        error as Error
      );
    }
  }

  /**
   * List files in Supabase Storage
   */
  async list(options?: ListOptions): Promise<ListResult> {
    try {
      const prefix = options?.prefix || '';
      const limit = options?.maxResults || 1000;

      const { data, error } = await this.client.storage
        .from(this.bucketName)
        .list(prefix, {
          limit,
          offset: 0,
          sortBy: { column: 'name', order: 'asc' },
        });

      if (error) {
        throw new StorageError(
          'Failed to list files',
          'LIST_FAILED',
          this.type,
          error as Error
        );
      }

      if (!data) {
        return { files: [], prefixes: [] };
      }

      const files: FileMetadata[] = [];
      const prefixes: string[] = [];

      for (const item of data) {
        const itemPath = prefix ? `${prefix}/${item.name}` : item.name;

        // Supabase returns folders with null id
        if (item.id === null) {
          if (options?.delimiter) {
            prefixes.push(itemPath + '/');
          }
        } else {
          // It's a file
          try {
            const buffer = await this.download(itemPath);
            const checksum = crypto.createHash('md5').update(buffer).digest('hex');

            files.push({
              name: item.name,
              path: itemPath,
              size: buffer.length,
              contentType: item.metadata?.mimetype || 'application/octet-stream',
              checksum,
              createdAt: new Date(item.created_at),
              updatedAt: new Date(item.updated_at || item.created_at),
              metadata: item.metadata as Record<string, string>,
            });
          } catch (err) {
            console.error(`Failed to get metadata for ${itemPath}:`, err);
            // Skip files that can't be read
            continue;
          }
        }
      }

      return {
        files,
        prefixes: prefixes.length > 0 ? prefixes : undefined,
      };
    } catch (error) {
      if (error instanceof StorageError) {
        throw error;
      }
      throw new StorageError(
        'Failed to list files',
        'LIST_FAILED',
        this.type,
        error as Error
      );
    }
  }

  /**
   * Generate a signed URL for Supabase Storage
   */
  async getSignedUrl(
    filePath: string,
    options: SignedUrlOptions
  ): Promise<string> {
    try {
      const expiresIn = options.expiresIn;

      if (options.action === 'write') {
        // For uploads, use createSignedUploadUrl
        const { data, error } = await this.client.storage
          .from(this.bucketName)
          .createSignedUploadUrl(filePath);

        if (error || !data) {
          throw new StorageError(
            'Failed to create signed upload URL',
            'SIGNED_URL_FAILED',
            this.type,
            error as Error
          );
        }

        return data.signedUrl;
      } else {
        // For downloads, use createSignedUrl
        const { data, error } = await this.client.storage
          .from(this.bucketName)
          .createSignedUrl(filePath, expiresIn);

        if (error || !data) {
          throw new StorageError(
            'Failed to create signed URL',
            'SIGNED_URL_FAILED',
            this.type,
            error as Error
          );
        }

        return data.signedUrl;
      }
    } catch (error) {
      if (error instanceof StorageError) {
        throw error;
      }
      throw new StorageError(
        'Failed to generate signed URL',
        'SIGNED_URL_FAILED',
        this.type,
        error as Error
      );
    }
  }

  /**
   * Sync - Not applicable for Supabase Storage
   * Supabase doesn't have a native delta sync API
   */
  async sync(cursor?: string): Promise<SyncResult> {
    return {
      cursor: undefined,
      hasMore: false,
      entries: [],
    };
  }

  /**
   * Validate Supabase credentials
   */
  async validateCredentials(): Promise<boolean> {
    try {
      // Try to list buckets to verify credentials
      const { data, error } = await this.client.storage.listBuckets();

      if (error) {
        return false;
      }

      // Check if our bucket exists
      const bucketExists = data?.some(bucket => bucket.name === this.bucketName);
      
      if (!bucketExists) {
        console.warn(`Bucket ${this.bucketName} does not exist`);
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Copy a file within Supabase Storage
   */
  async copy(sourcePath: string, destPath: string): Promise<FileMetadata> {
    try {
      const { data, error } = await this.client.storage
        .from(this.bucketName)
        .copy(sourcePath, destPath);

      if (error) {
        if (error.message?.includes('not found')) {
          throw new FileNotFoundError(sourcePath, this.type);
        }
        throw new StorageError(
          `Failed to copy file from ${sourcePath} to ${destPath}`,
          'COPY_FAILED',
          this.type,
          error as Error
        );
      }

      // Return metadata of destination file
      return await this.getMetadata(destPath);
    } catch (error) {
      if (error instanceof FileNotFoundError || error instanceof StorageError) {
        throw error;
      }
      throw new StorageError(
        `Failed to copy file from ${sourcePath} to ${destPath}`,
        'COPY_FAILED',
        this.type,
        error as Error
      );
    }
  }

  /**
   * Move/rename a file within Supabase Storage
   */
  async move(sourcePath: string, destPath: string): Promise<FileMetadata> {
    try {
      const { data, error } = await this.client.storage
        .from(this.bucketName)
        .move(sourcePath, destPath);

      if (error) {
        if (error.message?.includes('not found')) {
          throw new FileNotFoundError(sourcePath, this.type);
        }
        throw new StorageError(
          `Failed to move file from ${sourcePath} to ${destPath}`,
          'MOVE_FAILED',
          this.type,
          error as Error
        );
      }

      // Return metadata of destination file
      return await this.getMetadata(destPath);
    } catch (error) {
      if (error instanceof FileNotFoundError || error instanceof StorageError) {
        throw error;
      }
      throw new StorageError(
        `Failed to move file from ${sourcePath} to ${destPath}`,
        'MOVE_FAILED',
        this.type,
        error as Error
      );
    }
  }

  /**
   * Helper: Get directory path from full file path
   */
  private getDirectoryPath(filePath: string): string {
    const parts = filePath.split('/');
    if (parts.length === 1) {
      return '';
    }
    return parts.slice(0, -1).join('/');
  }

  /**
   * Helper: Get file name from full file path
   */
  private getFileName(filePath: string): string {
    const parts = filePath.split('/');
    return parts[parts.length - 1];
  }
}

