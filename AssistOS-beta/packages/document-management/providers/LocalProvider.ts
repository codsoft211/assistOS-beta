import { promises as fs } from 'fs';
import path from 'path';
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
 * Local File System Storage Provider
 * 
 * Stores files on the local filesystem.
 * Useful for development and simple deployments.
 */
export class LocalProvider implements IStorageProvider {
  readonly type = 'local';
  readonly name = 'Local File System';
  private basePath: string;

  constructor(config: ProviderConfig) {
    this.basePath = config.rootPath || './storage';
  }

  /**
   * Upload a file to local storage
   */
  async upload(
    buffer: Buffer,
    filePath: string,
    options?: UploadOptions
  ): Promise<FileMetadata> {
    try {
      const fullPath = path.join(this.basePath, filePath);
      const dir = path.dirname(fullPath);

      // Create directory if it doesn't exist
      await fs.mkdir(dir, { recursive: true });

      // Write file
      await fs.writeFile(fullPath, buffer);

      // Calculate checksum
      const checksum = crypto.createHash('md5').update(buffer).digest('hex');

      // Get file stats
      const stats = await fs.stat(fullPath);

      return {
        name: path.basename(filePath),
        path: filePath,
        size: stats.size,
        contentType: options?.contentType || 'application/octet-stream',
        checksum,
        createdAt: stats.birthtime,
        updatedAt: stats.mtime,
        metadata: options?.metadata,
      };
    } catch (error) {
      throw new UploadError(filePath, this.type, error as Error);
    }
  }

  /**
   * Download a file from local storage
   */
  async download(
    filePath: string,
    options?: DownloadOptions
  ): Promise<Buffer> {
    try {
      const fullPath = path.join(this.basePath, filePath);

      // Check if file exists
      try {
        await fs.access(fullPath);
      } catch {
        throw new FileNotFoundError(filePath, this.type);
      }

      // Read file
      const buffer = await fs.readFile(fullPath);

      // Handle range request if specified
      if (options?.range) {
        const { start, end } = options.range;
        return buffer.slice(start, end + 1);
      }

      return buffer;
    } catch (error) {
      if (error instanceof FileNotFoundError) {
        throw error;
      }
      throw new DownloadError(filePath, this.type, error as Error);
    }
  }

  /**
   * Delete a file from local storage
   */
  async delete(filePath: string): Promise<void> {
    try {
      const fullPath = path.join(this.basePath, filePath);

      // Check if file exists
      try {
        await fs.access(fullPath);
      } catch {
        throw new FileNotFoundError(filePath, this.type);
      }

      await fs.unlink(fullPath);
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
   * Check if a file exists
   */
  async exists(filePath: string): Promise<boolean> {
    try {
      const fullPath = path.join(this.basePath, filePath);
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get file metadata
   */
  async getMetadata(filePath: string): Promise<FileMetadata> {
    try {
      const fullPath = path.join(this.basePath, filePath);

      // Check if file exists
      try {
        await fs.access(fullPath);
      } catch {
        throw new FileNotFoundError(filePath, this.type);
      }

      const stats = await fs.stat(fullPath);
      const buffer = await fs.readFile(fullPath);
      const checksum = crypto.createHash('md5').update(buffer).digest('hex');

      return {
        name: path.basename(filePath),
        path: filePath,
        size: stats.size,
        contentType: 'application/octet-stream',
        checksum,
        createdAt: stats.birthtime,
        updatedAt: stats.mtime,
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
   * List files in a directory
   */
  async list(options?: ListOptions): Promise<ListResult> {
    try {
      const prefix = options?.prefix || '';
      const searchPath = path.join(this.basePath, prefix);

      let files: FileMetadata[] = [];
      const prefixes: string[] = [];

      // Check if directory exists
      try {
        await fs.access(searchPath);
      } catch {
        // Directory doesn't exist, return empty result
        return { files: [], prefixes: [] };
      }

      const entries = await fs.readdir(searchPath, { withFileTypes: true });

      for (const entry of entries) {
        const entryPath = path.join(prefix, entry.name);

        if (entry.isDirectory()) {
          if (options?.delimiter) {
            prefixes.push(entryPath + '/');
          } else {
            // Recursively list subdirectories if no delimiter
            const subResult = await this.list({
              ...options,
              prefix: entryPath,
            });
            files = files.concat(subResult.files);
          }
        } else if (entry.isFile()) {
          const metadata = await this.getMetadata(entryPath);
          files.push(metadata);
        }
      }

      // Apply maxResults limit
      if (options?.maxResults && files.length > options.maxResults) {
        files = files.slice(0, options.maxResults);
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
   * Generate a signed URL
   * Not supported for local storage
   */
  async getSignedUrl(
    filePath: string,
    options: SignedUrlOptions
  ): Promise<string> {
    throw new StorageError(
      'Signed URLs are not supported for local storage',
      'NOT_SUPPORTED',
      this.type
    );
  }

  /**
   * Sync changed files
   * Not applicable for local storage
   */
  async sync(cursor?: string): Promise<SyncResult> {
    return {
      cursor: undefined,
      hasMore: false,
      entries: [],
    };
  }

  /**
   * Validate credentials
   * For local storage, check if base path is writable
   */
  async validateCredentials(): Promise<boolean> {
    try {
      // Ensure base path exists
      await fs.mkdir(this.basePath, { recursive: true });

      // Try to write a test file
      const testPath = path.join(this.basePath, '.test');
      await fs.writeFile(testPath, 'test');
      await fs.unlink(testPath);

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Copy a file within local storage
   */
  async copy(sourcePath: string, destPath: string): Promise<FileMetadata> {
    try {
      const sourceFullPath = path.join(this.basePath, sourcePath);
      const destFullPath = path.join(this.basePath, destPath);

      // Check if source exists
      try {
        await fs.access(sourceFullPath);
      } catch {
        throw new FileNotFoundError(sourcePath, this.type);
      }

      // Create destination directory
      const destDir = path.dirname(destFullPath);
      await fs.mkdir(destDir, { recursive: true });

      // Copy file
      await fs.copyFile(sourceFullPath, destFullPath);

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
   * Move/rename a file within local storage
   */
  async move(sourcePath: string, destPath: string): Promise<FileMetadata> {
    try {
      const sourceFullPath = path.join(this.basePath, sourcePath);
      const destFullPath = path.join(this.basePath, destPath);

      // Check if source exists
      try {
        await fs.access(sourceFullPath);
      } catch {
        throw new FileNotFoundError(sourcePath, this.type);
      }

      // Create destination directory
      const destDir = path.dirname(destFullPath);
      await fs.mkdir(destDir, { recursive: true });

      // Move file
      await fs.rename(sourceFullPath, destFullPath);

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
