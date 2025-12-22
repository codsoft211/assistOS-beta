import {
  BlobServiceClient,
  ContainerClient,
  BlockBlobClient,
  BlobSASPermissions,
  generateBlobSASQueryParameters,
  StorageSharedKeyCredential,
  BlobItem,
} from '@azure/storage-blob';
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
 * Azure Blob Storage Provider
 * 
 * Provides integration with Azure Blob Storage.
 * Supports all standard Azure Blob features including SAS URLs and metadata.
 */
export class AzureBlobProvider implements IStorageProvider {
  readonly type = 'azure';
  readonly name = 'Azure Blob Storage';
  private containerClient: ContainerClient;
  private containerName: string;
  private accountName?: string;
  private accountKey?: string;

  constructor(config: ProviderConfig) {
    this.containerName = config.containerName || config.bucketName || 'default-container';

    // Initialize Azure Blob client
    if (config.credentials?.connectionString) {
      // Using connection string
      const blobServiceClient = BlobServiceClient.fromConnectionString(
        config.credentials.connectionString
      );
      this.containerClient = blobServiceClient.getContainerClient(this.containerName);
    } else if (config.credentials?.accountName && config.credentials?.accountKey) {
      // Using account name and key
      this.accountName = config.credentials.accountName;
      this.accountKey = config.credentials.accountKey;
      
      const credential = new StorageSharedKeyCredential(
        this.accountName!,
        this.accountKey!
      );
      
      const blobServiceClient = new BlobServiceClient(
        `https://${this.accountName}.blob.core.windows.net`,
        credential
      );
      
      this.containerClient = blobServiceClient.getContainerClient(this.containerName);
    } else {
      throw new StorageError(
        'Azure credentials not provided',
        'INVALID_CONFIG',
        this.type
      );
    }
  }

  /**
   * Upload a file to Azure Blob Storage
   */
  async upload(
    buffer: Buffer,
    filePath: string,
    options?: UploadOptions
  ): Promise<FileMetadata> {
    try {
      const blockBlobClient = this.containerClient.getBlockBlobClient(filePath);

      // Calculate MD5 checksum
      const checksum = crypto.createHash('md5').update(buffer).digest('base64');

      const uploadOptions: any = {
        blobHTTPHeaders: {
          blobContentType: options?.contentType || 'application/octet-stream',
          blobCacheControl: options?.cacheControl,
        },
        metadata: options?.metadata || {},
      };

      // Upload the blob
      await blockBlobClient.upload(buffer, buffer.length, uploadOptions);

      // Make public if requested
      if (options?.makePublic) {
        await blockBlobClient.setAccessTier('Hot');
      }

      // Get metadata of uploaded file
      return await this.getMetadata(filePath);
    } catch (error) {
      throw new UploadError(filePath, this.type, error as Error);
    }
  }

  /**
   * Download a file from Azure Blob Storage
   */
  async download(
    filePath: string,
    options?: DownloadOptions
  ): Promise<Buffer> {
    try {
      const blobClient = this.containerClient.getBlobClient(filePath);

      // Check if blob exists
      const exists = await blobClient.exists();
      if (!exists) {
        throw new FileNotFoundError(filePath, this.type);
      }

      // Download options
      const downloadOptions: any = {};
      if (options?.range) {
        downloadOptions.range = {
          offset: options.range.start,
          count: options.range.end - options.range.start + 1,
        };
      }

      const downloadResponse = await blobClient.download(0, undefined, downloadOptions);

      if (!downloadResponse.readableStreamBody) {
        throw new DownloadError(filePath, this.type);
      }

      // Convert stream to buffer
      const chunks: Uint8Array[] = [];
      for await (const chunk of downloadResponse.readableStreamBody) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }

      return Buffer.concat(chunks);
    } catch (error) {
      if (error instanceof FileNotFoundError) {
        throw error;
      }
      throw new DownloadError(filePath, this.type, error as Error);
    }
  }

  /**
   * Delete a file from Azure Blob Storage
   */
  async delete(filePath: string): Promise<void> {
    try {
      const blobClient = this.containerClient.getBlobClient(filePath);

      // Check if blob exists
      const exists = await blobClient.exists();
      if (!exists) {
        throw new FileNotFoundError(filePath, this.type);
      }

      await blobClient.delete();
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
   * Check if a file exists in Azure Blob Storage
   */
  async exists(filePath: string): Promise<boolean> {
    try {
      const blobClient = this.containerClient.getBlobClient(filePath);
      return await blobClient.exists();
    } catch {
      return false;
    }
  }

  /**
   * Get file metadata from Azure Blob Storage
   */
  async getMetadata(filePath: string): Promise<FileMetadata> {
    try {
      const blobClient = this.containerClient.getBlobClient(filePath);

      // Check if blob exists
      const exists = await blobClient.exists();
      if (!exists) {
        throw new FileNotFoundError(filePath, this.type);
      }

      const properties = await blobClient.getProperties();

      return {
        name: filePath.split('/').pop() || filePath,
        path: filePath,
        size: properties.contentLength || 0,
        contentType: properties.contentType || 'application/octet-stream',
        checksum: properties.contentMD5
          ? Buffer.from(properties.contentMD5).toString('base64')
          : '',
        createdAt: properties.createdOn || new Date(),
        updatedAt: properties.lastModified || new Date(),
        metadata: properties.metadata,
        externalId: properties.etag,
      };
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
   * List files in Azure Blob Storage container
   */
  async list(options?: ListOptions): Promise<ListResult> {
    try {
      const listOptions: any = {
        prefix: options?.prefix,
      };

      const files: FileMetadata[] = [];
      const prefixes: string[] = [];
      let resultCount = 0;

      // List blobs
      const iter = this.containerClient.listBlobsFlat(listOptions);

      for await (const blob of iter) {
        if (options?.maxResults && resultCount >= options.maxResults) {
          break;
        }

        files.push({
          name: blob.name.split('/').pop() || blob.name,
          path: blob.name,
          size: blob.properties.contentLength || 0,
          contentType: blob.properties.contentType || 'application/octet-stream',
          checksum: blob.properties.contentMD5
            ? Buffer.from(blob.properties.contentMD5).toString('base64')
            : '',
          createdAt: blob.properties.createdOn || new Date(),
          updatedAt: blob.properties.lastModified || new Date(),
          metadata: blob.metadata,
          externalId: blob.properties.etag,
        });

        resultCount++;
      }

      // Handle delimiter for hierarchical listing
      if (options?.delimiter) {
        const hierarchyIter = this.containerClient.listBlobsByHierarchy(
          options.delimiter,
          { prefix: options.prefix }
        );

        for await (const item of hierarchyIter) {
          if (item.kind === 'prefix') {
            prefixes.push(item.name);
          }
        }
      }

      return {
        files,
        prefixes: prefixes.length > 0 ? prefixes : undefined,
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
   * Generate a SAS URL for Azure Blob
   */
  async getSignedUrl(
    filePath: string,
    options: SignedUrlOptions
  ): Promise<string> {
    try {
      const blobClient = this.containerClient.getBlobClient(filePath);

      // Check if we have the necessary credentials
      if (!this.accountName || !this.accountKey) {
        throw new StorageError(
          'Account name and key required for SAS URL generation',
          'INVALID_CONFIG',
          this.type
        );
      }

      const credential = new StorageSharedKeyCredential(
        this.accountName,
        this.accountKey
      );

      // Set permissions based on action
      const permissions = new BlobSASPermissions();
      if (options.action === 'read') {
        permissions.read = true;
      } else if (options.action === 'write') {
        permissions.write = true;
        permissions.create = true;
      } else if (options.action === 'delete') {
        permissions.delete = true;
      }

      // Generate SAS token
      const sasToken = generateBlobSASQueryParameters(
        {
          containerName: this.containerName,
          blobName: filePath,
          permissions,
          startsOn: new Date(),
          expiresOn: new Date(Date.now() + options.expiresIn * 1000),
          contentType: options.contentType,
        },
        credential
      ).toString();

      return `${blobClient.url}?${sasToken}`;
    } catch (error) {
      throw new StorageError(
        `Failed to generate SAS URL: ${filePath}`,
        'SIGNED_URL_FAILED',
        this.type,
        error as Error
      );
    }
  }

  /**
   * Sync changed files
   * Not directly supported by Azure Blob, return empty result
   */
  async sync(cursor?: string): Promise<SyncResult> {
    return {
      cursor: undefined,
      hasMore: false,
      entries: [],
    };
  }

  /**
   * Validate Azure credentials
   */
  async validateCredentials(): Promise<boolean> {
    try {
      // Try to get container properties
      await this.containerClient.getProperties();
      return true;
    } catch {
      // If container doesn't exist, try to create it (with minimal permissions check)
      try {
        await this.containerClient.exists();
        return true;
      } catch {
        return false;
      }
    }
  }

  /**
   * Copy a file within Azure Blob Storage
   */
  async copy(sourcePath: string, destPath: string): Promise<FileMetadata> {
    try {
      const sourceBlobClient = this.containerClient.getBlobClient(sourcePath);

      // Check if source exists
      const exists = await sourceBlobClient.exists();
      if (!exists) {
        throw new FileNotFoundError(sourcePath, this.type);
      }

      const destBlobClient = this.containerClient.getBlobClient(destPath);

      // Start copy operation
      const copyPoller = await destBlobClient.beginCopyFromURL(sourceBlobClient.url);

      // Wait for copy to complete
      await copyPoller.pollUntilDone();

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
   * Move/rename a file within Azure Blob Storage
   */
  async move(sourcePath: string, destPath: string): Promise<FileMetadata> {
    try {
      const sourceBlobClient = this.containerClient.getBlobClient(sourcePath);

      // Check if source exists
      const exists = await sourceBlobClient.exists();
      if (!exists) {
        throw new FileNotFoundError(sourcePath, this.type);
      }

      // Copy to destination
      await this.copy(sourcePath, destPath);

      // Delete source
      await sourceBlobClient.delete();

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
