import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  CopyObjectCommand,
  GetObjectCommandOutput,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
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
} from './IStorageProvider';

/**
 * AWS S3 Storage Provider
 * 
 * Compatible with AWS S3, MinIO, and other S3-compatible services.
 * Supports all standard S3 features including signed URLs and metadata.
 */
export class S3Provider implements IStorageProvider {
  readonly type = 's3';
  readonly name = 'AWS S3 / S3-Compatible Storage';
  private client: S3Client;
  private bucketName: string;

  constructor(config: ProviderConfig) {
    this.bucketName = config.bucketName || 'default-bucket';

    // Initialize S3 client
    const clientConfig: any = {
      region: config.region || 'us-east-1',
    };

    // Support custom endpoint for MinIO and other S3-compatible services
    if (config.endpoint) {
      clientConfig.endpoint = config.endpoint;
      clientConfig.forcePathStyle = true; // Required for MinIO
    }

    // Add credentials if provided
    if (config.credentials) {
      clientConfig.credentials = {
        accessKeyId: config.credentials.accessKeyId,
        secretAccessKey: config.credentials.secretAccessKey,
      };
    }

    this.client = new S3Client(clientConfig);
  }

  /**
   * Upload a file to S3
   */
  async upload(
    buffer: Buffer,
    filePath: string,
    options?: UploadOptions
  ): Promise<FileMetadata> {
    try {
      // Calculate MD5 checksum
      const checksum = crypto.createHash('md5').update(buffer).digest('base64');

      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: filePath,
        Body: buffer,
        ContentType: options?.contentType || 'application/octet-stream',
        Metadata: options?.metadata || {},
        ContentMD5: options?.checksum || checksum,
        CacheControl: options?.cacheControl,
        ACL: options?.makePublic ? 'public-read' : undefined,
      });

      await this.client.send(command);

      // Get metadata of uploaded file
      return await this.getMetadata(filePath);
    } catch (error) {
      throw new UploadError(filePath, this.type, error as Error);
    }
  }

  /**
   * Download a file from S3
   */
  async download(
    filePath: string,
    options?: DownloadOptions
  ): Promise<Buffer> {
    try {
      const commandOptions: any = {
        Bucket: this.bucketName,
        Key: filePath,
      };

      // Handle range request
      if (options?.range) {
        commandOptions.Range = `bytes=${options.range.start}-${options.range.end}`;
      }

      const command = new GetObjectCommand(commandOptions);
      const response = await this.client.send(command);

      // Convert stream to buffer
      if (!response.Body) {
        throw new DownloadError(filePath, this.type);
      }

      const chunks: Uint8Array[] = [];
      for await (const chunk of response.Body as any) {
        chunks.push(chunk);
      }

      return Buffer.concat(chunks);
    } catch (error: any) {
      if (error.name === 'NoSuchKey') {
        throw new FileNotFoundError(filePath, this.type);
      }
      throw new DownloadError(filePath, this.type, error);
    }
  }

  /**
   * Delete a file from S3
   */
  async delete(filePath: string): Promise<void> {
    try {
      // Check if file exists first
      const exists = await this.exists(filePath);
      if (!exists) {
        throw new FileNotFoundError(filePath, this.type);
      }

      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: filePath,
      });

      await this.client.send(command);
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
   * Check if a file exists in S3
   */
  async exists(filePath: string): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: filePath,
      });

      await this.client.send(command);
      return true;
    } catch (error: any) {
      if (error.name === 'NotFound' || error.name === 'NoSuchKey') {
        return false;
      }
      return false;
    }
  }

  /**
   * Get file metadata from S3
   */
  async getMetadata(filePath: string): Promise<FileMetadata> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: filePath,
      });

      const response = await this.client.send(command);

      return {
        name: filePath.split('/').pop() || filePath,
        path: filePath,
        size: response.ContentLength || 0,
        contentType: response.ContentType || 'application/octet-stream',
        checksum: response.ETag?.replace(/"/g, '') || '',
        createdAt: response.LastModified || new Date(),
        updatedAt: response.LastModified || new Date(),
        metadata: response.Metadata,
        externalId: response.ETag,
      };
    } catch (error: any) {
      if (error.name === 'NotFound' || error.name === 'NoSuchKey') {
        throw new FileNotFoundError(filePath, this.type);
      }
      throw new StorageError(
        `Failed to get metadata: ${filePath}`,
        'METADATA_FAILED',
        this.type,
        error
      );
    }
  }

  /**
   * List files in S3 bucket
   */
  async list(options?: ListOptions): Promise<ListResult> {
    try {
      const command = new ListObjectsV2Command({
        Bucket: this.bucketName,
        MaxKeys: options?.maxResults,
        ContinuationToken: options?.pageToken,
        Prefix: options?.prefix,
        Delimiter: options?.delimiter,
      });

      const response = await this.client.send(command);

      const files: FileMetadata[] = [];

      if (response.Contents) {
        for (const item of response.Contents) {
          if (item.Key) {
            files.push({
              name: item.Key.split('/').pop() || item.Key,
              path: item.Key,
              size: item.Size || 0,
              contentType: 'application/octet-stream',
              checksum: item.ETag?.replace(/"/g, '') || '',
              createdAt: item.LastModified || new Date(),
              updatedAt: item.LastModified || new Date(),
              externalId: item.ETag,
            });
          }
        }
      }

      return {
        files,
        nextPageToken: response.NextContinuationToken,
        prefixes: response.CommonPrefixes?.map((p) => p.Prefix || ''),
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
   * Generate a signed URL for S3 file
   */
  async getSignedUrl(
    filePath: string,
    options: SignedUrlOptions
  ): Promise<string> {
    try {
      let command;

      if (options.action === 'read') {
        command = new GetObjectCommand({
          Bucket: this.bucketName,
          Key: filePath,
        });
      } else if (options.action === 'write') {
        command = new PutObjectCommand({
          Bucket: this.bucketName,
          Key: filePath,
          ContentType: options.contentType,
        });
      } else if (options.action === 'delete') {
        command = new DeleteObjectCommand({
          Bucket: this.bucketName,
          Key: filePath,
        });
      } else {
        throw new Error(`Unsupported action: ${options.action}`);
      }

      const url = await getSignedUrl(this.client, command, {
        expiresIn: options.expiresIn,
      });

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
   * Not directly supported by S3, return empty result
   */
  async sync(cursor?: string): Promise<SyncResult> {
    return {
      cursor: undefined,
      hasMore: false,
      entries: [],
    };
  }

  /**
   * Validate S3 credentials
   */
  async validateCredentials(): Promise<boolean> {
    try {
      // Try to list objects (with maxKeys=1 for minimal cost)
      const command = new ListObjectsV2Command({
        Bucket: this.bucketName,
        MaxKeys: 1,
      });

      await this.client.send(command);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Copy a file within S3
   */
  async copy(sourcePath: string, destPath: string): Promise<FileMetadata> {
    try {
      // Check if source exists
      const exists = await this.exists(sourcePath);
      if (!exists) {
        throw new FileNotFoundError(sourcePath, this.type);
      }

      const command = new CopyObjectCommand({
        Bucket: this.bucketName,
        CopySource: `${this.bucketName}/${sourcePath}`,
        Key: destPath,
      });

      await this.client.send(command);

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
   * Move/rename a file within S3
   */
  async move(sourcePath: string, destPath: string): Promise<FileMetadata> {
    try {
      // Check if source exists
      const exists = await this.exists(sourcePath);
      if (!exists) {
        throw new FileNotFoundError(sourcePath, this.type);
      }

      // Copy to destination
      await this.copy(sourcePath, destPath);

      // Delete source
      const deleteCommand = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: sourcePath,
      });

      await this.client.send(deleteCommand);

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
}
