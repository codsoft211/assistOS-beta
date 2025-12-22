#!/usr/bin/env tsx

/**
 * Core Assets Registration Script
 * 
 * Registers platform-level core assets into the core_assets table
 * to enable Core Protection enforcement.
 * 
 * Usage:
 *   npm run register-core-assets           # Execute registration
 *   npm run register-core-assets --dry-run # Preview without changes
 * 
 * This script is idempotent - safe to run multiple times.
 */

import { db } from '../db';
import { coreAssets } from '../../../shared/schema';
import { 
  getAllCoreAssets,
  MANIFEST_VERSION,
  type CoreAssetDefinition 
} from '../../../packages/core/core-assets.manifest';
import { eq, and } from 'drizzle-orm';

const isDryRun = process.argv.includes('--dry-run');

interface RegistrationStats {
  registered: number;
  skipped: number;
  errors: number;
}

/**
 * Register a single core asset (idempotent)
 */
async function registerCoreAsset(
  asset: CoreAssetDefinition,
  stats: RegistrationStats
): Promise<void> {
  try {
    // Check if asset already exists
    const existing = await db
      .select()
      .from(coreAssets)
      .where(
        and(
          eq(coreAssets.assetType, asset.assetType),
          eq(coreAssets.assetId, asset.assetId)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      // Asset already registered - check for drift
      const existingAsset = existing[0];
      const hasDrift = 
        existingAsset.mutabilityPolicy !== asset.mutabilityPolicy ||
        existingAsset.isCore !== asset.isCore;

      if (hasDrift) {
        console.warn(`⚠️  Drift detected for ${asset.assetType}:${asset.assetId}`);
        console.warn(`   Expected: policy=${asset.mutabilityPolicy}, isCore=${asset.isCore}`);
        console.warn(`   Found:    policy=${existingAsset.mutabilityPolicy}, isCore=${existingAsset.isCore}`);
        console.warn(`   Skipping update - manual review required`);
      } else {
        console.log(`✓  Already registered: ${asset.assetType}:${asset.assetId}`);
      }
      
      stats.skipped++;
      return;
    }

    // Register new asset
    if (isDryRun) {
      console.log(`[DRY RUN] Would register: ${asset.assetType}:${asset.assetId}`);
      console.log(`          policy=${asset.mutabilityPolicy}, isCore=${asset.isCore}`);
      stats.registered++;
      return;
    }

    await db.insert(coreAssets).values({
      assetType: asset.assetType,
      assetId: asset.assetId,
      ownerService: 'platform',
      isCore: asset.isCore,
      mutabilityPolicy: asset.mutabilityPolicy,
      parentAssetId: null, // Core assets have no parent
      metadata: {
        version: MANIFEST_VERSION,
        description: asset.description,
        name: asset.name,
        ...asset.metadata,
      },
    });

    console.log(`✓  Registered: ${asset.assetType}:${asset.assetId} (${asset.mutabilityPolicy})`);
    stats.registered++;
  } catch (error: any) {
    console.error(`✗  Failed to register ${asset.assetType}:${asset.assetId}:`, error.message);
    stats.errors++;
  }
}

/**
 * Main registration function
 */
async function registerAllCoreAssets(): Promise<void> {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║         Core Assets Registration Script                       ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
  
  if (isDryRun) {
    console.log('🔍 Running in DRY RUN mode - no changes will be made\n');
  }

  const assets = getAllCoreAssets();
  const stats: RegistrationStats = {
    registered: 0,
    skipped: 0,
    errors: 0,
  };

  console.log(`📋 Found ${assets.length} core assets to register\n`);

  // Group by asset type for cleaner output
  const assetsByType = assets.reduce((acc, asset) => {
    if (!acc[asset.assetType]) {
      acc[asset.assetType] = [];
    }
    acc[asset.assetType].push(asset);
    return acc;
  }, {} as Record<string, CoreAssetDefinition[]>);

  // Register each type
  for (const [assetType, typeAssets] of Object.entries(assetsByType)) {
    console.log(`\n📦 Registering ${assetType} assets (${typeAssets.length}):`);
    console.log('─'.repeat(70));
    
    for (const asset of typeAssets) {
      await registerCoreAsset(asset, stats);
    }
  }

  // Print summary
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║                    Registration Summary                       ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
  console.log(`✓  Registered: ${stats.registered}`);
  console.log(`⊘  Skipped:    ${stats.skipped} (already exist)`);
  console.log(`✗  Errors:     ${stats.errors}`);
  console.log(`\n📊 Total:      ${assets.length}`);
  
  if (isDryRun) {
    console.log('\n💡 This was a DRY RUN. Run without --dry-run to apply changes.\n');
  } else {
    console.log('\n✅ Registration complete!\n');
  }

  if (stats.errors > 0) {
    console.error('\n⚠️  Some assets failed to register. Please review errors above.\n');
    process.exit(1);
  }
}

// Execute
registerAllCoreAssets()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  });
