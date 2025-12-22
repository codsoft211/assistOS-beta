#!/usr/bin/env tsx

/**
 * Backfill Migration Hashes Script
 * 
 * Populates upSqlHash for existing migrations that don't have it.
 * This ensures sandbox protection works for all migrations, including legacy ones.
 * 
 * Usage: npm run backfill:migration-hashes
 * 
 * Safety: Only updates migrations with NULL upSqlHash (idempotent)
 */

import { db } from '../db';
import { migrations } from '../../../shared/schema';
import { isNull, sql } from 'drizzle-orm';
import { calculateSqlHash } from '../services/migration-hash.service';

async function backfillMigrationHashes() {
  console.log('🔍 Starting migration hash backfill...');
  
  try {
    // Find migrations without hash
    const migrationsWithoutHash = await db.query.migrations.findMany({
      where: isNull(migrations.upSqlHash),
    });

    if (migrationsWithoutHash.length === 0) {
      console.log('✅ No migrations need backfill. All migrations have hashes.');
      return;
    }

    console.log(`📝 Found ${migrationsWithoutHash.length} migrations without hash`);

    let updated = 0;
    let failed = 0;

    for (const migration of migrationsWithoutHash) {
      try {
        const upSql = migration.upSql as string[];
        const hash = calculateSqlHash(upSql);

        await db.update(migrations)
          .set({ upSqlHash: hash })
          .where(sql`id = ${migration.id}`);

        console.log(`  ✓ Updated migration ${migration.id.substring(0, 8)}... with hash ${hash.substring(0, 8)}...`);
        updated++;
      } catch (error) {
        console.error(`  ✗ Failed to update migration ${migration.id}:`, error);
        failed++;
      }
    }

    console.log(`\n✅ Backfill complete!`);
    console.log(`   Updated: ${updated}`);
    console.log(`   Failed: ${failed}`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Backfill failed:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  backfillMigrationHashes();
}

export { backfillMigrationHashes };
