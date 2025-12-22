/**
 * Storage Provider Factory
 * 
 * Creates storage provider instances based on configuration.
 * Supports all provider types: GCS, S3, Azure, Dropbox, Google Drive, SharePoint, Box, WebDAV, MinIO, Local.
 */

import { IStorageProvider, ProviderConfig, StorageError } from './IStorageProvider';
import { GCSProvider } from './GCSProvider';
import { S3Provider } from './S3Provider';
import { AzureBlobProvider } from './AzureBlobProvider';
import { LocalProvider } from './LocalProvider';
import { SupabaseStorageProvider } from './SupabaseStorageProvider';

/**
 * Factory class for creating storage provider instances
 */
export class StorageProviderFactory {
  /**
   * Create a storage provider based on configuration
   * 
   * @param config - Provider configuration
   * @returns IStorageProvider instance
   * @throws StorageError if provider type is not supported
   */
  static createProvider(config: ProviderConfig): IStorageProvider {
    switch (config.type) {
      case 'supabase':
        return new SupabaseStorageProvider(config as any);
      
      case 'gcs':
        return new GCSProvider(config);
      
      case 's3':
      case 'minio': // MinIO is S3-compatible
        return new S3Provider(config);
      
      case 'azure':
        return new AzureBlobProvider(config);
      
      case 'local':
        return new LocalProvider(config);
      
      // External providers (not yet implemented - to be added in future phases)
      case 'dropbox':
        throw new StorageError(
          'Dropbox provider not yet implemented. Coming in FASE 5.6',
          'NOT_IMPLEMENTED',
          'dropbox'
        );
      
      case 'google_drive':
        throw new StorageError(
          'Google Drive provider not yet implemented. Coming in FASE 5.6',
          'NOT_IMPLEMENTED',
          'google_drive'
        );
      
      case 'sharepoint':
        throw new StorageError(
          'SharePoint provider not yet implemented. Coming in FASE 5.6',
          'NOT_IMPLEMENTED',
          'sharepoint'
        );
      
      case 'box':
        throw new StorageError(
          'Box provider not yet implemented. Coming in FASE 5.6',
          'NOT_IMPLEMENTED',
          'box'
        );
      
      case 'webdav':
        throw new StorageError(
          'WebDAV provider not yet implemented. Coming in FASE 5.6',
          'NOT_IMPLEMENTED',
          'webdav'
        );
      
      default:
        throw new StorageError(
          `Unsupported storage provider type: ${config.type}`,
          'UNSUPPORTED_PROVIDER',
          config.type
        );
    }
  }

  /**
   * Validate provider configuration
   * 
   * @param config - Provider configuration
   * @returns true if valid, throws error otherwise
   */
  static validateConfig(config: ProviderConfig): boolean {
    if (!config.type) {
      throw new StorageError(
        'Provider type is required',
        'INVALID_CONFIG',
        'unknown'
      );
    }

    // Type-specific validation
    switch (config.type) {
      case 'supabase':
        if (!config.bucketName) {
          throw new StorageError(
            'Supabase requires bucketName in config',
            'INVALID_CONFIG',
            'supabase'
          );
        }
        if (!config.credentials || !config.credentials.url || !config.credentials.key) {
          throw new StorageError(
            'Supabase requires credentials.url and credentials.key in config',
            'INVALID_CONFIG',
            'supabase'
          );
        }
        break;

      case 'gcs':
        if (!config.bucketName) {
          throw new StorageError(
            'GCS requires bucketName in config',
            'INVALID_CONFIG',
            'gcs'
          );
        }
        break;

      case 's3':
      case 'minio':
        if (!config.bucketName) {
          throw new StorageError(
            'S3/MinIO requires bucketName in config',
            'INVALID_CONFIG',
            config.type
          );
        }
        if (config.type === 'minio' && !config.endpoint) {
          throw new StorageError(
            'MinIO requires endpoint in config',
            'INVALID_CONFIG',
            'minio'
          );
        }
        break;

      case 'azure':
        if (!config.bucketName && !config.containerName) {
          throw new StorageError(
            'Azure requires bucketName or containerName in config',
            'INVALID_CONFIG',
            'azure'
          );
        }
        break;

      case 'local':
        // Local provider doesn't require specific config
        break;

      default:
        // Other providers (not yet implemented) are allowed but will throw when creating
        break;
    }

    return true;
  }

  /**
   * Get list of supported provider types
   */
  static getSupportedProviders(): string[] {
    return [
      'supabase',
      'gcs',
      's3',
      'minio',
      'azure',
      'local',
      // Coming soon:
      // 'dropbox',
      // 'google_drive',
      // 'sharepoint',
      // 'box',
      // 'webdav',
    ];
  }

  /**
   * Check if a provider type is supported
   */
  static isProviderSupported(providerType: string): boolean {
    const supported = this.getSupportedProviders();
    return supported.includes(providerType);
  }
}

/**
 * Helper function to create a provider (shorthand)
 */
export function createStorageProvider(config: ProviderConfig): IStorageProvider {
  StorageProviderFactory.validateConfig(config);
  return StorageProviderFactory.createProvider(config);
}
