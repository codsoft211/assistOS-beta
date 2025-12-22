/**
 * Core Assets Bootstrap
 * 
 * Auto-registers core assets on application startup if coreAssets table is empty.
 * Ensures platform-level core assets are always protected.
 */

import { db } from '../db';
import { coreAssets } from '../../../shared/schema';
import { 
  getAllCoreAssets,
  MANIFEST_VERSION,
  type CoreAssetDefinition 
} from '../../../packages/core/core-assets.manifest';
import { eq, and } from 'drizzle-orm';
import logger from '../logger';

/**
 * Register core assets if not already present (idempotent)
 */
async function ensureCoreAssetsRegistered(): Promise<void> {
  logger.info('Starting core assets sync from manifest (idempotent)');

  const assets = getAllCoreAssets();
  let synced = 0;
  let errors = 0;

  for (const asset of assets) {
    try {
      await db
        .insert(coreAssets)
        .values({
          assetType: asset.assetType,
          assetId: asset.assetId,
          ownerService: 'platform',
          isCore: asset.isCore,
          mutabilityPolicy: asset.mutabilityPolicy,
          parentAssetId: null,
          metadata: {
            version: MANIFEST_VERSION,
            description: asset.description,
            name: asset.name,
            ...asset.metadata,
          },
        })
        .onConflictDoUpdate({
          target: [coreAssets.assetType, coreAssets.assetId, coreAssets.ownerService],
          set: {
            mutabilityPolicy: asset.mutabilityPolicy,
            isCore: asset.isCore,
            metadata: {
              version: MANIFEST_VERSION,
              description: asset.description,
              name: asset.name,
              ...asset.metadata,
            },
          },
        });
      synced++;
    } catch (error: any) {
      logger.error(
        { assetType: asset.assetType, assetId: asset.assetId, error: error.message },
        'Failed to sync core asset during bootstrap'
      );
      errors++;
    }
  }

  if (errors > 0) {
    const errorMsg = `Core assets sync incomplete: ${errors}/${assets.length} assets failed to register`;
    logger.fatal({ errors, synced, total: assets.length }, errorMsg);
    throw new Error(errorMsg);
  }

  logger.info(
    { synced, total: assets.length, manifestVersion: MANIFEST_VERSION },
    'Core assets sync completed successfully'
  );
}

/**
 * Run bootstrap on import
 */
export async function bootstrapCoreAssets(): Promise<void> {
  logger.info('Starting core assets bootstrap check');
  await ensureCoreAssetsRegistered();
}
