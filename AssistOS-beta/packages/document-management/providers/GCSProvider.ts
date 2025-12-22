import { Storage, Bucket, File } from '@google-cloud/storage';
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
 * Google Cloud Storage Provider
 * 
 * Provides integration with Google Cloud Storage.
 * Supports all standard GCS features including signed URLs and metadata.
 */
export class GCSProvider implements IStorageProvider {
  readonly type = 'gcs';
  readonly name = 'Google Cloud Storage';
  private storage: Storage;
  private bucket: Bucket;
  private bucketName: string;

  constructor(config: ProviderConfig) {
    this.bucketName = config.bucketName || 'default-bucket';
    
    // Initialize GCS client with credentials if provided
    this.storage = new Storage(config.credentials ? {
      credentials: config.credentials,
      projectId: config.credentials.project_id,
    } : undefined);
    
    this.bucket = this.storage.bucket(this.bucketName);
  }

  /**
   * Upload a file to GCS
   */
  async upload(
    buffer: Buffer,
    filePath: string,
    options?: UploadOptions
  ): Promise<FileMetadata> {
    try {
      const file = this.bucket.file(filePath);

      // Calculate MD5 checksum
      const checksum = crypto.createHash('md5').update(buffer).digest('base64');

      // Upload options
      const uploadOptions: any = {
        metadata: {
          contentType: options?.contentType || 'application/octet-stream',
          metadata: options?.metadata || {},
        },
        validation: 'md5',
      };

      if (options?.checksum) {
        uploadOptions.metadata.md5Hash = options.checksum;
      }

      if (options?.cacheControl) {
        uploadOptions.metadata.cacheControl = options.cacheControl;
      }

      // Upload the file
      await file.save(buffer, uploadOptions);

      // Make public if requested
      if (options?.makePublic) {
        await file.makePublic();
      }

      // Get metadata
      const [metadata] = await file.getMetadata();

      return this.convertMetadata(filePath, metadata);
    } catch (error) {
      throw new UploadError(filePath, this.type, error as Error);
    }
  }

  /**
   * Download a file from GCS
   */
  async download(
    filePath: string,
    options?: DownloadOptions
  ): Promise<Buffer> {
    try {
      const file = this.bucket.file(filePath);

      // Check if file exists
      const [exists] = await file.exists();
      if (!exists) {
        throw new FileNotFoundError(filePath, this.type);
      }

      // Download options
      const downloadOptions: any = {};
      if (options?.range) {
        downloadOptions.start = options.range.start;
        downloadOptions.end = options.range.end;
      }

      // Download the file
      const [buffer] = await file.download(downloadOptions);

      return buffer;
    } catch (error) {
      if (error instanceof FileNotFoundError) {
        throw error;
      }
      throw new DownloadError(filePath, this.type, error as Error);
    }
  }

  /**
   * Delete a file from GCS
   */
  async delete(filePath: string): Promise<void> {
    try {
      const file = this.bucket.file(filePath);

      // Check if file exists
      const [exists] = await file.exists();
      if (!exists) {
        throw new FileNotFoundError(filePath, this.type);
      }

      await file.delete();
    } catch (error) {
      if (error instanceof FileNotFoundError) {
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
   * Check if a file exists in GCS
   */
  async exists(filePath: string): Promise<boolean> {
    try {
      const file = this.bucket.file(filePath);
      const [exists] = await file.exists();
      return exists;
    } catch {
      return false;
    }
  }

  /**
   * Get file metadata from GCS
   */
  async getMetadata(filePath: string): Promise<FileMetadata> {
    try {
      const file = this.bucket.file(filePath);

      // Check if file exists
      const [exists] = await file.exists();
      if (!exists) {
        throw new FileNotFoundError(filePath, this.type);
      }

      const [metadata] = await file.getMetadata();

      return this.convertMetadata(filePath, metadata);
    } catch (error) {
      if (error instanceof FileNotFoundError) {
        throw error;
      }
      throw new StorageError(
        `Failed to get metadata: ${filePath}`,
        'METADATA_FAILED',
        this.type,
        error as Error
      );
    }
  }

  /**
   * List files in GCS bucket
   */
  async list(options?: ListOptions): Promise<ListResult> {
    try {
      const gcsOptions: any = {};

      if (options?.maxResults) {
        gcsOptions.maxResults = options.maxResults;
      }

      if (options?.pageToken) {
        gcsOptions.pageToken = options.pageToken;
      }

      if (options?.prefix) {
        gcsOptions.prefix = options.prefix;
      }

      if (options?.delimiter) {
        gcsOptions.delimiter = options.delimiter;
      }

      const [files, , apiResponse] = await this.bucket.getFiles(gcsOptions);

      const fileMetadata: FileMetadata[] = await Promise.all(
        files.map(async (file) => {
          const [metadata] = await file.getMetadata();
          return this.convertMetadata(file.name, metadata);
        })
      );

      return {
        files: fileMetadata,
        nextPageToken: (apiResponse as any)?.nextPageToken,
        prefixes: (apiResponse as any)?.prefixes,
      };
    } catch (error) {
      throw new StorageError(
        'Failed to list files',
        'LIST_FAILED',
        this.type,
        error as Error
      );
    }
  }

  /**
   * Generate a signed URL for GCS file
   */
  async getSignedUrl(
    filePath: string,
    options: SignedUrlOptions
  ): Promise<string> {
    try {
      const file = this.bucket.file(filePath);

      // Map action to GCS action
      let action: 'read' | 'write' | 'delete' = 'read';
      if (options.action === 'write') {
        action = 'write';
      } else if (options.action === 'delete') {
        action = 'delete';
      }

      const signedUrlOptions: any = {
        version: 'v4',
        action,
        expires: Date.now() + options.expiresIn * 1000,
      };

      if (options.contentType) {
        signedUrlOptions.contentType = options.contentType;
      }

      const [url] = await file.getSignedUrl(signedUrlOptions);

      return url;
    } catch (error) {
      throw new StorageError(
        `Failed to generate signed URL: ${filePath}`,
        'SIGNED_URL_FAILED',
        this.type,
        error as Error
      );
    }
  }

  /**
   * Sync changed files
   * Not directly supported by GCS, return empty result
   */
  async sync(cursor?: string): Promise<SyncResult> {
    return {
      cursor: undefined,
      hasMore: false,
      entries: [],
    };
  }

  /**
   * Validate GCS credentials
   */
  async validateCredentials(): Promise<boolean> {
    try {
      // Try to get bucket metadata
      await this.bucket.getMetadata();
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Copy a file within GCS
   */
  async copy(sourcePath: string, destPath: string): Promise<FileMetadata> {
    try {
      const sourceFile = this.bucket.file(sourcePath);

      // Check if source exists
      const [exists] = await sourceFile.exists();
      if (!exists) {
        throw new FileNotFoundError(sourcePath, this.type);
      }

      const destFile = this.bucket.file(destPath);

      // Copy the file
      await sourceFile.copy(destFile);

      // Return metadata of destination file
      return await this.getMetadata(destPath);
    } catch (error) {
      if (error instanceof FileNotFoundError) {
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
   * Move/rename a file within GCS
   */
  async move(sourcePath: string, destPath: string): Promise<FileMetadata> {
    try {
      const sourceFile = this.bucket.file(sourcePath);

      // Check if source exists
      const [exists] = await sourceFile.exists();
      if (!exists) {
        throw new FileNotFoundError(sourcePath, this.type);
      }

      const destFile = this.bucket.file(destPath);

      // Move is copy + delete
      await sourceFile.copy(destFile);
      await sourceFile.delete();

      // Return metadata of destination file
      return await this.getMetadata(destPath);
    } catch (error) {
      if (error instanceof FileNotFoundError) {
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
   * Convert GCS metadata to FileMetadata format
   */
  private convertMetadata(filePath: string, gcsMetadata: any): FileMetadata {
    return {
      name: gcsMetadata.name || filePath.split('/').pop() || filePath,
      path: filePath,
      size: parseInt(gcsMetadata.size) || 0,
      contentType: gcsMetadata.contentType || 'application/octet-stream',
      checksum: gcsMetadata.md5Hash || '',
      createdAt: new Date(gcsMetadata.timeCreated),
      updatedAt: new Date(gcsMetadata.updated),
      metadata: gcsMetadata.metadata,
      externalId: gcsMetadata.id,
    };
  }
}
