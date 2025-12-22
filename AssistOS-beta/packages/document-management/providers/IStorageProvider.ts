/**
 * Storage Provider Interface
 * 
 * Defines the contract for all storage providers (GCS, S3, Azure, Dropbox, etc.)
 * All providers must implement this interface to ensure consistency across different storage backends.
 */

export interface UploadOptions {
  contentType?: string;
  metadata?: Record<string, string>;
  checksum?: string;
  makePublic?: boolean;
  cacheControl?: string;
}

export interface DownloadOptions {
  range?: { start: number; end: number };
}

export interface ListOptions {
  maxResults?: number;
  pageToken?: string;
  prefix?: string;
  delimiter?: string;
}

export interface FileMetadata {
  name: string;
  path: string;
  size: number;
  contentType: string;
  checksum: string;
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, string>;
  externalId?: string;
}

export interface ListResult {
  files: FileMetadata[];
  nextPageToken?: string;
  prefixes?: string[];
}

export interface SyncResult {
  cursor?: string;
  hasMore: boolean;
  entries: SyncEntry[];
}

export interface SyncEntry {
  path: string;
  type: 'file' | 'folder' | 'deleted';
  metadata?: FileMetadata;
  externalId: string;
}

export interface SignedUrlOptions {
  expiresIn: number; // seconds
  action: 'read' | 'write' | 'delete';
  contentType?: string;
}

export interface ProviderConfig {
  type: 'supabase' | 'gcs' | 's3' | 'azure' | 'dropbox' | 'google_drive' | 'sharepoint' | 'box' | 'webdav' | 'minio' | 'local';
  bucketName?: string;
  region?: string;
  endpoint?: string;
  rootPath?: string;
  credentials?: any;
  [key: string]: any;
}

/**
 * Core Storage Provider Interface
 * 
 * All storage providers must implement these methods to support:
 * - File upload/download
 * - File deletion and existence checking
 * - Directory listing
 * - Signed URL generation (for direct browser uploads)
 * - Delta sync (for external providers like Dropbox, Google Drive)
 * - Credential validation
 */
export interface IStorageProvider {
  /**
   * Provider identification
   */
  readonly type: string;
  readonly name: string;
  
  /**
   * Upload a file to storage
   */
  upload(
    buffer: Buffer,
    path: string,
    options?: UploadOptions
  ): Promise<FileMetadata>;
  
  /**
   * Download a file from storage
   */
  download(
    path: string,
    options?: DownloadOptions
  ): Promise<Buffer>;
  
  /**
   * Delete a file from storage
   */
  delete(path: string): Promise<void>;
  
  /**
   * Check if a file exists
   */
  exists(path: string): Promise<boolean>;
  
  /**
   * Get file metadata
   */
  getMetadata(path: string): Promise<FileMetadata>;
  
  /**
   * List files in a directory/prefix
   */
  list(options?: ListOptions): Promise<ListResult>;
  
  /**
   * Generate a signed URL for direct access
   * (useful for client-side uploads or temporary download links)
   */
  getSignedUrl(
    path: string,
    options: SignedUrlOptions
  ): Promise<string>;
  
  /**
   * Delta sync - get changed files since last sync
   * (for external providers that support webhooks/delta APIs)
   */
  sync(cursor?: string): Promise<SyncResult>;
  
  /**
   * Validate that credentials are valid and working
   */
  validateCredentials(): Promise<boolean>;
  
  /**
   * Copy a file within the same storage
   */
  copy(sourcePath: string, destPath: string): Promise<FileMetadata>;
  
  /**
   * Move/rename a file
   */
  move(sourcePath: string, destPath: string): Promise<FileMetadata>;
}

/**
 * Error types for storage operations
 */
export class StorageError extends Error {
  constructor(
    message: string,
    public code: string,
    public provider: string,
    public originalError?: Error
  ) {
    super(message);
    this.name = 'StorageError';
  }
}

export class FileNotFoundError extends StorageError {
  constructor(path: string, provider: string) {
    super(`File not found: ${path}`, 'FILE_NOT_FOUND', provider);
    this.name = 'FileNotFoundError';
  }
}

export class UploadError extends StorageError {
  constructor(path: string, provider: string, originalError?: Error) {
    super(`Failed to upload file: ${path}`, 'UPLOAD_FAILED', provider, originalError);
    this.name = 'UploadError';
  }
}

export class DownloadError extends StorageError {
  constructor(path: string, provider: string, originalError?: Error) {
    super(`Failed to download file: ${path}`, 'DOWNLOAD_FAILED', provider, originalError);
    this.name = 'DownloadError';
  }
}

export class InvalidCredentialsError extends StorageError {
  constructor(provider: string, originalError?: Error) {
    super('Invalid or expired credentials', 'INVALID_CREDENTIALS', provider, originalError);
    this.name = 'InvalidCredentialsError';
  }
}
