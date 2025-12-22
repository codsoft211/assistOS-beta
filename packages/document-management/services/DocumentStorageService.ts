/**
 * Document Storage Service
 * 
 * Main service that orchestrates document lifecycle using storage providers.
 * Integrates with Drizzle ORM for database operations and manages document uploads,
 * downloads, versions, entity links, and permissions.
 * 
 * @example
 * ```typescript
 * const service = new DocumentStorageService();
 * 
 * // Upload a document
 * const document = await service.uploadDocument(
 *   tenantId,
 *   userId,
 *   fileBuffer,
 *   {
 *     filename: 'invoice.pdf',
 *     mimeType: 'application/pdf',
 *     title: 'Invoice #12345',
 *     documentType: 'invoice'
 *   }
 * );
 * 
 * // Download a document
 * const fileBuffer = await service.downloadDocument(documentId, userId);
 * ```
 */

import crypto from 'crypto';
import { eq, and, sql, desc, isNull, or, ilike } from 'drizzle-orm';
import { db } from '../../../apps/api/db';
import {
  documents,
  documentVersions,
  documentEntityLinks,
  documentPermissions,
  tenantStorageProviders,
  providerCredentials,
  SelectDocument,
  InsertDocument,
  InsertDocumentVersion,
  InsertDocumentEntityLink,
  InsertDocumentPermission,
  SelectTenantStorageProvider,
  DocumentType,
  DocumentStatus,
} from '../../../shared/schema';
import { StorageProviderFactory } from '../providers/StorageProviderFactory';
import { IStorageProvider } from '../providers/IStorageProvider';
import {
  decryptCredentials,
  deserializeEncryptedData,
  isLegacyEncryption,
  decryptLegacyCredentials,
  migrateLegacyCredentials,
  serializeEncryptedData,
  DecryptionError,
} from '../utils/encryption';

// ═══════════════════════════════════════════════════════════════════════════════
// Error Classes
// ═══════════════════════════════════════════════════════════════════════════════

export class DocumentNotFoundError extends Error {
  constructor(documentId: string) {
    super(`Document not found: ${documentId}`);
    this.name = 'DocumentNotFoundError';
  }
}

export class PermissionDeniedError extends Error {
  constructor(userId: string, documentId: string, action: string) {
    super(`User ${userId} does not have permission to ${action} document ${documentId}`);
    this.name = 'PermissionDeniedError';
  }
}

export class ProviderNotFoundError extends Error {
  constructor(tenantId: string) {
    super(`No storage provider configured for tenant ${tenantId}`);
    this.name = 'ProviderNotFoundError';
  }
}

export class DocumentUploadError extends Error {
  constructor(message: string, public originalError?: Error) {
    super(`Document upload failed: ${message}`);
    this.name = 'DocumentUploadError';
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface UploadDocumentMetadata {
  filename: string;
  mimeType: string;
  title?: string;
  description?: string;
  documentType?: DocumentType;
  tags?: string[];
  metadata?: Record<string, any>;
  fiscalYear?: number;
  fiscalMonth?: number;
}

export interface ListDocumentsFilters {
  documentType?: DocumentType;
  status?: DocumentStatus;
  uploadedBy?: string;
  fiscalYear?: number;
  fiscalMonth?: number;
  tags?: string[];
  search?: string;
  limit?: number;
  offset?: number;
}

export interface DocumentPermissionSet {
  canView: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canShare: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main Service
// ═══════════════════════════════════════════════════════════════════════════════

export class DocumentStorageService {
  /**
   * Upload a document to storage and create database record
   * 
   * @param tenantId - Tenant ID
   * @param userId - User ID performing the upload
   * @param fileBuffer - File content as Buffer
   * @param metadata - Document metadata
   * @returns Created document record
   * 
   * @example
   * ```typescript
   * const document = await service.uploadDocument(
   *   'tenant-123',
   *   'user-456',
   *   fileBuffer,
   *   {
   *     filename: 'invoice.pdf',
   *     mimeType: 'application/pdf',
   *     title: 'Invoice #12345'
   *   }
   * );
   * ```
   */
  async uploadDocument(
    tenantId: string,
    userId: string,
    fileBuffer: Buffer,
    metadata: UploadDocumentMetadata
  ): Promise<SelectDocument> {
    try {
      // 1. Get storage provider for tenant
      const provider = await this.getProviderForTenant(tenantId);

      // 2. Calculate checksum
      const checksum = this.calculateChecksum(fileBuffer);

      // 3. Auto-detect document type from MIME type if not provided
      const documentType = metadata.documentType || this.detectDocumentType(metadata.mimeType);

      // 4. Use transaction for atomic operation
      const document = await db.transaction(async (tx) => {
        // Create document record
        const [doc] = await tx.insert(documents).values({
          tenantId,
          filename: this.sanitizeFilename(metadata.filename),
          originalName: metadata.filename,
          title: metadata.title || metadata.filename,
          description: metadata.description,
          documentType,
          mimeType: metadata.mimeType,
          size: fileBuffer.length,
          status: 'uploading',
          providerId: provider.providerId,
          storagePath: '', // Will be set after upload
          checksum,
          tags: metadata.tags || [],
          metadata: metadata.metadata || {},
          fiscalYear: metadata.fiscalYear,
          fiscalMonth: metadata.fiscalMonth,
          uploadedBy: userId,
          versionNumber: 1,
        }).returning();

        if (!doc) {
          throw new DocumentUploadError('Failed to create document record');
        }

        // Generate storage path: {tenantId}/documents/{year}/{month}/{documentId}-{filename}
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const storagePath = `${tenantId}/documents/${year}/${month}/${doc.id}-${doc.filename}`;

        // Upload to storage provider
        const fileMetadata = await provider.storage.upload(fileBuffer, storagePath, {
          contentType: metadata.mimeType,
          checksum,
          metadata: {
            documentId: doc.id,
            tenantId,
            uploadedBy: userId,
          },
        });

        // Update document with storage path and external ID
        const [updatedDoc] = await tx
          .update(documents)
          .set({
            storagePath: fileMetadata.path,
            externalId: fileMetadata.externalId,
            status: 'active',
          })
          .where(eq(documents.id, doc.id))
          .returning();

        // Create initial version
        await tx.insert(documentVersions).values({
          documentId: doc.id,
          tenantId,
          versionNumber: 1,
          filename: doc.filename,
          mimeType: doc.mimeType,
          size: doc.size,
          storagePath: fileMetadata.path,
          checksum,
          changeDescription: 'Initial upload',
          changedBy: userId,
        });

        // Update document with currentVersionId
        const [version] = await tx
          .select()
          .from(documentVersions)
          .where(
            and(
              eq(documentVersions.documentId, doc.id),
              eq(documentVersions.versionNumber, 1)
            )
          );

        await tx
          .update(documents)
          .set({ currentVersionId: version.id })
          .where(eq(documents.id, doc.id));

        return updatedDoc;
      });

      console.log(`[DocumentStorage] Document uploaded: ${document.id} (${document.filename})`);
      return document;
    } catch (error: any) {
      console.error('[DocumentStorage] Upload failed:', error);
      throw new DocumentUploadError(error.message, error);
    }
  }

  /**
   * Download a document from storage
   * 
   * @param documentId - Document ID
   * @param userId - User ID requesting download
   * @returns File buffer
   */
  async downloadDocument(documentId: string, userId: string): Promise<Buffer> {
    try {
      // 1. Get document and check permissions
      const document = await this.getDocument(documentId);
      await this.checkPermission(documentId, userId, 'view');

      // 2. Get storage provider
      const provider = await this.getProviderById(document.providerId!);

      // 3. Download from storage
      const fileBuffer = await provider.storage.download(document.storagePath);

      console.log(`[DocumentStorage] Document downloaded: ${documentId} by user ${userId}`);
      return fileBuffer;
    } catch (error: any) {
      console.error('[DocumentStorage] Download failed:', error);
      throw error;
    }
  }

  /**
   * Soft delete a document
   * 
   * @param documentId - Document ID
   * @param userId - User ID performing deletion
   */
  async deleteDocument(documentId: string, userId: string): Promise<void> {
    try {
      // 1. Check permissions
      await this.checkPermission(documentId, userId, 'delete');

      // 2. Soft delete (set deletedAt, deletedBy)
      await db
        .update(documents)
        .set({
          status: 'deleted',
          deletedAt: new Date(),
          deletedBy: userId,
          updatedAt: new Date(),
        })
        .where(eq(documents.id, documentId));

      console.log(`[DocumentStorage] Document deleted: ${documentId} by user ${userId}`);
    } catch (error: any) {
      console.error('[DocumentStorage] Delete failed:', error);
      throw error;
    }
  }

  /**
   * Get document metadata from database
   * 
   * @param documentId - Document ID
   * @returns Document record
   */
  async getDocument(documentId: string): Promise<SelectDocument> {
    const [document] = await db
      .select()
      .from(documents)
      .where(eq(documents.id, documentId));

    if (!document) {
      throw new DocumentNotFoundError(documentId);
    }

    return document;
  }

  /**
   * List documents with filtering and pagination
   * 
   * @param tenantId - Tenant ID
   * @param filters - Optional filters
   * @returns Array of documents
   */
  async listDocuments(
    tenantId: string,
    filters: ListDocumentsFilters = {}
  ): Promise<SelectDocument[]> {
    try {
      // Build conditions
      const conditions = [
        eq(documents.tenantId, tenantId),
        isNull(documents.deletedAt),
      ];

      if (filters.documentType) {
        conditions.push(eq(documents.documentType, filters.documentType));
      }

      if (filters.status) {
        conditions.push(eq(documents.status, filters.status));
      }

      if (filters.uploadedBy) {
        conditions.push(eq(documents.uploadedBy, filters.uploadedBy));
      }

      if (filters.fiscalYear) {
        conditions.push(eq(documents.fiscalYear, filters.fiscalYear));
      }

      if (filters.fiscalMonth) {
        conditions.push(eq(documents.fiscalMonth, filters.fiscalMonth));
      }

      if (filters.search) {
        conditions.push(
          or(
            ilike(documents.title, `%${filters.search}%`),
            ilike(documents.filename, `%${filters.search}%`),
            ilike(documents.originalName, `%${filters.search}%`)
          )!
        );
      }

      // Build query with all conditions
      let query = db
        .select()
        .from(documents)
        .where(and(...conditions))
        .orderBy(desc(documents.createdAt))
        .$dynamic();

      if (filters.limit) {
        query = query.limit(filters.limit);
      }

      if (filters.offset) {
        query = query.offset(filters.offset);
      }

      const results = await query;
      return results;
    } catch (error: any) {
      console.error('[DocumentStorage] List failed:', error);
      throw error;
    }
  }

  /**
   * Create a new version of a document
   * 
   * @param documentId - Document ID
   * @param userId - User ID creating version
   * @param fileBuffer - New file content
   * @param changeDescription - Description of changes
   * @returns Updated document
   */
  async createVersion(
    documentId: string,
    userId: string,
    fileBuffer: Buffer,
    changeDescription: string
  ): Promise<SelectDocument> {
    try {
      // 1. Check permissions
      await this.checkPermission(documentId, userId, 'edit');

      // 2. Get current document
      const document = await this.getDocument(documentId);

      // 3. Get storage provider
      const provider = await this.getProviderById(document.providerId!);

      // 4. Calculate checksum
      const checksum = this.calculateChecksum(fileBuffer);

      // 5. Use transaction
      const updatedDoc = await db.transaction(async (tx) => {
        // Get next version number
        const nextVersion = document.versionNumber + 1;

        // Generate new storage path
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const storagePath = `${document.tenantId}/documents/${year}/${month}/${document.id}-v${nextVersion}-${document.filename}`;

        // Upload new version to storage
        const fileMetadata = await provider.storage.upload(fileBuffer, storagePath, {
          contentType: document.mimeType,
          checksum,
        });

        // Create version record
        const [version] = await tx.insert(documentVersions).values({
          documentId,
          tenantId: document.tenantId,
          versionNumber: nextVersion,
          filename: document.filename,
          mimeType: document.mimeType,
          size: fileBuffer.length,
          storagePath: fileMetadata.path,
          checksum,
          changeDescription,
          changedBy: userId,
        }).returning();

        // Update document
        const [updated] = await tx
          .update(documents)
          .set({
            currentVersionId: version.id,
            versionNumber: nextVersion,
            size: fileBuffer.length,
            checksum,
            storagePath: fileMetadata.path,
            updatedAt: new Date(),
          })
          .where(eq(documents.id, documentId))
          .returning();

        return updated;
      });

      console.log(`[DocumentStorage] Version created: ${documentId} v${updatedDoc.versionNumber}`);
      return updatedDoc;
    } catch (error: any) {
      console.error('[DocumentStorage] Create version failed:', error);
      throw error;
    }
  }

  /**
   * Link document to business entity
   * 
   * @param documentId - Document ID
   * @param entityType - Entity type (invoice, purchase_order, etc.)
   * @param entityId - Entity ID
   * @param linkType - Link type (attachment, reference, source)
   * @param metadata - Optional metadata
   */
  async linkToEntity(
    documentId: string,
    entityType: string,
    entityId: string,
    linkType: string = 'attachment',
    metadata?: Record<string, any>
  ): Promise<void> {
    try {
      // Verify document exists
      await this.getDocument(documentId);

      // Create link
      await db.insert(documentEntityLinks).values({
        documentId,
        tenantId: (await this.getDocument(documentId)).tenantId,
        entityType,
        entityId,
        linkType,
        metadata,
      });

      console.log(`[DocumentStorage] Document linked: ${documentId} -> ${entityType}:${entityId}`);
    } catch (error: any) {
      console.error('[DocumentStorage] Link entity failed:', error);
      throw error;
    }
  }

  /**
   * Set RBAC permissions for a document
   * 
   * @param documentId - Document ID
   * @param userId - User ID to grant permissions to
   * @param permissions - Permission set
   */
  async setPermissions(
    documentId: string,
    userId: string,
    permissions: DocumentPermissionSet
  ): Promise<void> {
    try {
      const document = await this.getDocument(documentId);

      // Check if permission already exists
      const [existing] = await db
        .select()
        .from(documentPermissions)
        .where(
          and(
            eq(documentPermissions.documentId, documentId),
            eq(documentPermissions.userId, userId)
          )
        );

      if (existing) {
        // Update existing permission
        await db
          .update(documentPermissions)
          .set({
            canView: permissions.canView,
            canEdit: permissions.canEdit,
            canDelete: permissions.canDelete,
            canShare: permissions.canShare,
          })
          .where(eq(documentPermissions.id, existing.id));
      } else {
        // Create new permission
        await db.insert(documentPermissions).values({
          documentId,
          tenantId: document.tenantId,
          userId,
          canView: permissions.canView,
          canEdit: permissions.canEdit,
          canDelete: permissions.canDelete,
          canShare: permissions.canShare,
        });
      }

      console.log(`[DocumentStorage] Permissions set: ${documentId} for user ${userId}`);
    } catch (error: any) {
      console.error('[DocumentStorage] Set permissions failed:', error);
      throw error;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // Helper Methods
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Get storage provider for tenant
   */
  private async getProviderForTenant(tenantId: string): Promise<{
    providerId: string;
    storage: IStorageProvider;
  }> {
    // Get default provider for tenant
    const [provider] = await db
      .select()
      .from(tenantStorageProviders)
      .where(
        and(
          eq(tenantStorageProviders.tenantId, tenantId),
          eq(tenantStorageProviders.isDefault, true),
          eq(tenantStorageProviders.isActive, true)
        )
      );

    if (!provider) {
      throw new ProviderNotFoundError(tenantId);
    }

    // Get credentials
    let credentials: any = {};
    if (provider.credentialId) {
      const [cred] = await db
        .select()
        .from(providerCredentials)
        .where(eq(providerCredentials.id, provider.credentialId));

      if (cred) {
        credentials = await this.decryptProviderCredentials(cred.encryptedData, tenantId, cred.id);
      }
    }

    // Create provider instance
    const storageProvider = StorageProviderFactory.createProvider({
      type: provider.providerType as any,
      ...provider.config,
      credentials,
    });

    return {
      providerId: provider.id,
      storage: storageProvider,
    };
  }

  /**
   * Get storage provider by ID
   */
  private async getProviderById(providerId: string): Promise<{
    providerId: string;
    storage: IStorageProvider;
  }> {
    const [provider] = await db
      .select()
      .from(tenantStorageProviders)
      .where(eq(tenantStorageProviders.id, providerId));

    if (!provider) {
      throw new Error(`Storage provider not found: ${providerId}`);
    }

    // Get credentials
    let credentials: any = {};
    if (provider.credentialId) {
      const [cred] = await db
        .select()
        .from(providerCredentials)
        .where(eq(providerCredentials.id, provider.credentialId));

      if (cred) {
        credentials = await this.decryptProviderCredentials(cred.encryptedData, provider.tenantId, cred.id);
      }
    }

    // Create provider instance
    const storageProvider = StorageProviderFactory.createProvider({
      type: provider.providerType as any,
      ...provider.config,
      credentials,
    });

    return {
      providerId: provider.id,
      storage: storageProvider,
    };
  }

  /**
   * Decrypt provider credentials with support for legacy base64 format
   * Automatically migrates legacy credentials to new encryption format
   * 
   * @param encryptedData - Encrypted credentials string
   * @param tenantId - Tenant ID for key derivation
   * @param credentialId - Credential record ID for migration
   * @returns Decrypted credentials object
   */
  private async decryptProviderCredentials(
    encryptedData: string,
    tenantId: string,
    credentialId: string
  ): Promise<Record<string, string>> {
    try {
      // Check if this is legacy base64 encryption
      if (isLegacyEncryption(encryptedData)) {
        console.warn(`[DocumentStorage] Migrating legacy credentials for credential ${credentialId}`);
        
        // Decrypt legacy format
        const credentials = decryptLegacyCredentials(encryptedData);
        
        // Migrate to new encryption format
        const newEncrypted = migrateLegacyCredentials(encryptedData, tenantId);
        const serialized = serializeEncryptedData(newEncrypted);
        
        // Update database with new encryption (async, don't wait)
        db.update(providerCredentials)
          .set({
            encryptedData: serialized,
            encryptionKeyId: newEncrypted.keyId,
            updatedAt: new Date(),
          })
          .where(eq(providerCredentials.id, credentialId))
          .then(() => {
            console.log(`[DocumentStorage] Migrated credentials ${credentialId} to AES-256-GCM`);
          })
          .catch((error) => {
            console.error(`[DocumentStorage] Failed to migrate credentials ${credentialId}:`, error);
          });
        
        return credentials;
      }
      
      // Decrypt using AES-256-GCM
      const encryptedObj = deserializeEncryptedData(encryptedData);
      return decryptCredentials(encryptedObj, tenantId);
    } catch (error: any) {
      if (error instanceof DecryptionError) {
        console.error(`[DocumentStorage] Failed to decrypt credentials for tenant ${tenantId}:`, error.message);
        throw new Error('Failed to decrypt provider credentials. Please check encryption configuration.');
      }
      throw error;
    }
  }

  /**
   * Check if user has permission to perform action
   */
  private async checkPermission(
    documentId: string,
    userId: string,
    action: 'view' | 'edit' | 'delete'
  ): Promise<void> {
    // Get document
    const document = await this.getDocument(documentId);

    // Owner has all permissions
    if (document.uploadedBy === userId) {
      return;
    }

    // Check explicit permissions
    const [permission] = await db
      .select()
      .from(documentPermissions)
      .where(
        and(
          eq(documentPermissions.documentId, documentId),
          eq(documentPermissions.userId, userId)
        )
      );

    if (!permission) {
      throw new PermissionDeniedError(userId, documentId, action);
    }

    // Check action-specific permission
    const hasPermission =
      (action === 'view' && permission.canView) ||
      (action === 'edit' && permission.canEdit) ||
      (action === 'delete' && permission.canDelete);

    if (!hasPermission) {
      throw new PermissionDeniedError(userId, documentId, action);
    }
  }

  /**
   * Calculate MD5 checksum
   */
  private calculateChecksum(buffer: Buffer): string {
    return crypto.createHash('md5').update(buffer).digest('hex');
  }

  /**
   * Sanitize filename for storage
   */
  private sanitizeFilename(filename: string): string {
    return filename
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/_{2,}/g, '_')
      .toLowerCase();
  }

  /**
   * Auto-detect document type from MIME type
   */
  private detectDocumentType(mimeType: string): DocumentType {
    if (mimeType.includes('pdf')) return 'pdf';
    if (mimeType.includes('image')) return 'image';
    if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return 'spreadsheet';
    if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return 'presentation';
    return 'other';
  }
}
