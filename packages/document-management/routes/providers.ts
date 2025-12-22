/**
 * Storage Provider Routes
 * 
 * RESTful API routes for managing external storage providers
 * (S3, Azure Blob, Google Cloud Storage, Dropbox, etc.)
 * 
 * Mounted at: /api/storage-providers
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '../../../apps/api/db';
import {
  tenantStorageProviders,
  providerCredentials,
  providerSyncJobs,
} from '../../../shared/schema';
import { StorageProviderFactory } from '../providers/StorageProviderFactory';
import { ProviderSyncService } from '../services/ProviderSyncService';
import {
  encryptCredentials as encryptCredentialsUtil,
  serializeEncryptedData,
  KeyNotConfiguredError,
  EncryptionError,
} from '../utils/encryption';

const router = Router();

// ═══════════════════════════════════════════════════════════════════════════════
// Services
// ═══════════════════════════════════════════════════════════════════════════════

const syncService = new ProviderSyncService();

// ═══════════════════════════════════════════════════════════════════════════════
// Validation Schemas
// ═══════════════════════════════════════════════════════════════════════════════

const addProviderSchema = z.object({
  providerType: z.enum(['gcs', 's3', 'azure', 'minio', 'dropbox', 'google_drive', 'sharepoint', 'box', 'webdav', 'local']),
  providerName: z.string().min(1),
  config: z.record(z.any()),
  credentials: z.record(z.string()),
  isDefault: z.boolean().optional().default(false),
});

const updateProviderSchema = z.object({
  providerName: z.string().min(1).optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
  config: z.record(z.any()).optional(),
});

// ═══════════════════════════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get authenticated user's tenant ID
 * Checks multiple sources in priority order:
 * 1. req.tenantId (set by tenantMiddleware from x-tenant-slug header)
 * 2. req.session.activeTenantId (set during login/tenant switching)
 */
function getTenantId(req: Request): string {
  const tenantId = (req as any).tenantId || (req as any).session?.activeTenantId;
  if (!tenantId) {
    throw new Error('No active tenant');
  }
  return tenantId;
}

/**
 * Get authenticated user ID
 * Checks multiple sources in priority order:
 * 1. req.userId (set by tenantMiddleware if user has tenant access)
 * 2. req.user.id (set by requireAuth middleware)
 */
function getUserId(req: Request): string {
  const userId = (req as any).userId || (req as any).user?.id;
  if (!userId) {
    throw new Error('Not authenticated');
  }
  return userId;
}

/**
 * Encrypt credentials using AES-256-GCM encryption
 * Wraps the encryption utility with error handling
 */
function encryptCredentials(credentials: Record<string, string>, tenantId: string): string {
  try {
    const encrypted = encryptCredentialsUtil(credentials, tenantId);
    return serializeEncryptedData(encrypted);
  } catch (error: any) {
    if (error instanceof KeyNotConfiguredError) {
      console.error('[Providers] ENCRYPTION_KEY not configured - cannot encrypt credentials');
      throw new Error('Server encryption not configured. Please contact administrator.');
    }
    throw error;
  }
}

/**
 * Sanitize provider data for API response (remove sensitive credentials)
 */
function sanitizeProvider(provider: any): any {
  return {
    id: provider.id,
    tenantId: provider.tenantId,
    providerType: provider.providerType,
    providerName: provider.providerName,
    providerId: provider.providerId,
    isDefault: provider.isDefault,
    isActive: provider.isActive,
    config: provider.config,
    capabilities: provider.capabilities,
    syncCursor: provider.syncCursor,
    lastSyncAt: provider.lastSyncAt,
    lastSyncStatus: provider.lastSyncStatus,
    createdAt: provider.createdAt,
    updatedAt: provider.updatedAt,
    // Credentials are intentionally excluded
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Routes
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/storage-providers
 * List tenant's storage providers
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);

    // Get all providers for tenant
    const providers = await db
      .select()
      .from(tenantStorageProviders)
      .where(eq(tenantStorageProviders.tenantId, tenantId))
      .orderBy(desc(tenantStorageProviders.isDefault), desc(tenantStorageProviders.createdAt));

    // Sanitize providers (remove credentials)
    const sanitizedProviders = providers.map(sanitizeProvider);

    res.json({ providers: sanitizedProviders });
  } catch (error: any) {
    console.error('[Providers] List error:', error);
    res.status(500).json({
      error: 'Failed to list storage providers',
      details: error.message,
    });
  }
});

/**
 * POST /api/storage-providers
 * Add new storage provider
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);

    // Validate request body
    const bodyValidation = addProviderSchema.safeParse(req.body);
    if (!bodyValidation.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        details: bodyValidation.error.errors,
      });
    }

    const { providerType, providerName, config, credentials, isDefault } = bodyValidation.data;

    // Validate provider configuration using factory
    try {
      StorageProviderFactory.validateConfig({ type: providerType, ...config });
    } catch (error: any) {
      return res.status(400).json({
        error: 'Invalid provider configuration',
        details: error.message,
      });
    }

    // Use transaction to create provider and credentials atomically
    const provider = await db.transaction(async (tx) => {
      // If setting as default, unset other defaults
      if (isDefault) {
        await tx
          .update(tenantStorageProviders)
          .set({ isDefault: false })
          .where(eq(tenantStorageProviders.tenantId, tenantId));
      }

      // Create provider record
      // Define default capabilities based on provider type
      const capabilities = {
        supportsVersioning: ['s3', 'azure', 'gcs', 'minio'].includes(providerType),
        supportsWebhooks: ['dropbox', 'google_drive', 'sharepoint'].includes(providerType),
        supportsDeltaSync: ['dropbox', 'google_drive', 'sharepoint', 'box'].includes(providerType),
        maxFileSize: 50 * 1024 * 1024, // 50MB default
        allowedMimeTypes: undefined, // No restrictions by default
      };

      const [newProvider] = await tx
        .insert(tenantStorageProviders)
        .values({
          tenantId,
          providerType: providerType as any,
          providerName,
          isDefault: isDefault || false,
          isActive: true,
          config,
          capabilities,
        })
        .returning();

      // Encrypt and store credentials using AES-256-GCM
      const encryptedData = encryptCredentials(credentials, tenantId);
      
      // Extract encryption key ID from encrypted data
      const encryptedObj = JSON.parse(encryptedData);
      
      await tx.insert(providerCredentials).values({
        tenantId,
        providerType: providerType as any,
        encryptedData,
        encryptionKeyId: encryptedObj.keyId,
        isValid: true,
      });

      return newProvider;
    });

    console.log(`[Providers] Created provider: ${provider.id} (${provider.providerType})`);

    res.status(201).json({ provider: sanitizeProvider(provider) });
  } catch (error: any) {
    console.error('[Providers] Create error:', error);
    res.status(500).json({
      error: 'Failed to create storage provider',
      details: error.message,
    });
  }
});

/**
 * PUT /api/storage-providers/:id
 * Update storage provider
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const { id } = req.params;

    // Validate request body
    const bodyValidation = updateProviderSchema.safeParse(req.body);
    if (!bodyValidation.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        details: bodyValidation.error.errors,
      });
    }

    const updates = bodyValidation.data;

    // Get existing provider
    const [existingProvider] = await db
      .select()
      .from(tenantStorageProviders)
      .where(
        and(
          eq(tenantStorageProviders.id, id),
          eq(tenantStorageProviders.tenantId, tenantId)
        )
      )
      .limit(1);

    if (!existingProvider) {
      return res.status(404).json({ error: 'Storage provider not found' });
    }

    // If setting as default, unset other defaults
    if (updates.isDefault) {
      await db
        .update(tenantStorageProviders)
        .set({ isDefault: false })
        .where(
          and(
            eq(tenantStorageProviders.tenantId, tenantId),
            eq(tenantStorageProviders.id, id)
          )
        );
    }

    // Update provider
    const [updatedProvider] = await db
      .update(tenantStorageProviders)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(tenantStorageProviders.id, id))
      .returning();

    console.log(`[Providers] Updated provider: ${updatedProvider.id}`);

    res.json({ provider: sanitizeProvider(updatedProvider) });
  } catch (error: any) {
    console.error('[Providers] Update error:', error);
    res.status(500).json({
      error: 'Failed to update storage provider',
      details: error.message,
    });
  }
});

/**
 * POST /api/storage-providers/:id/sync
 * Trigger manual sync from external provider
 * 
 * NOTE: Currently uses basic list-and-compare approach
 * TODO (FASE 5.6): Use delta-sync when providers implement it
 */
router.post('/:id/sync', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const { id } = req.params;

    // Get provider
    const [provider] = await db
      .select()
      .from(tenantStorageProviders)
      .where(
        and(
          eq(tenantStorageProviders.id, id),
          eq(tenantStorageProviders.tenantId, tenantId)
        )
      )
      .limit(1);

    if (!provider) {
      return res.status(404).json({ error: 'Storage provider not found' });
    }

    if (!provider.isActive) {
      return res.status(400).json({ error: 'Provider is not active' });
    }

    // NOTE: Removed delta-sync capability check - all providers now support basic sync via list()
    // The sync service will use list() API to enumerate and compare files

    // Trigger sync (this will run in background)
    // For now, run synchronously but in production should use queue
    try {
      const syncResult = await syncService.syncProvider(id, false);

      res.json({
        syncJob: {
          providerId: id,
          status: syncResult.status,
          filesScanned: syncResult.filesScanned,
          filesCreated: syncResult.filesCreated,
          filesUpdated: syncResult.filesUpdated,
          filesDeleted: syncResult.filesDeleted,
          filesErrored: syncResult.filesErrored,
        },
      });
    } catch (syncError: any) {
      // Handle sync errors gracefully
      console.error('[Providers] Sync execution error:', syncError);
      return res.status(500).json({
        error: 'Sync failed',
        details: syncError.message,
      });
    }
  } catch (error: any) {
    console.error('[Providers] Sync error:', error);
    res.status(500).json({
      error: 'Failed to trigger sync',
      details: error.message,
    });
  }
});

/**
 * GET /api/storage-providers/:id/sync-jobs
 * List sync jobs for provider
 */
router.get('/:id/sync-jobs', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const { id } = req.params;

    // Verify provider belongs to tenant
    const [provider] = await db
      .select()
      .from(tenantStorageProviders)
      .where(
        and(
          eq(tenantStorageProviders.id, id),
          eq(tenantStorageProviders.tenantId, tenantId)
        )
      )
      .limit(1);

    if (!provider) {
      return res.status(404).json({ error: 'Storage provider not found' });
    }

    // Get sync jobs
    const jobs = await db
      .select()
      .from(providerSyncJobs)
      .where(eq(providerSyncJobs.providerId, id))
      .orderBy(desc(providerSyncJobs.createdAt))
      .limit(50);

    res.json({ jobs });
  } catch (error: any) {
    console.error('[Providers] List sync jobs error:', error);
    res.status(500).json({
      error: 'Failed to list sync jobs',
      details: error.message,
    });
  }
});

export default router;
