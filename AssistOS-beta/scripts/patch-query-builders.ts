#!/usr/bin/env tsx
/**
 * Automated Query Builder Update Script
 * 
 * Updates all module query builders to support tenant schemas
 * 
 * Usage: npm run patch:query-builders [--dry-run]
 */

import * as fs from 'fs';
import * as path from 'path';

const QUERY_BUILDERS = [
  'packages/modules/compras/query-builder.ts',
  'packages/modules/projetos/query-builder.ts',
  'packages/modules/angariacao/query-builder.ts',
  'packages/modules/logistica/query-builder.ts',
];

interface PatchStats {
  file: string;
  alreadyUpdated: boolean;
  importAdded: boolean;
  executeUpdated: boolean;
  countUpdated: boolean;
  errors: string[];
}

function patchQueryBuilder(filePath: string, dryRun: boolean = false): PatchStats {
  const stats: PatchStats = {
    file: filePath,
    alreadyUpdated: false,
    importAdded: false,
    executeUpdated: false,
    countUpdated: false,
    errors: [],
  };

  try {
    const fullPath = path.join(process.cwd(), filePath);
    
    if (!fs.existsSync(fullPath)) {
      stats.errors.push('File not found');
      return stats;
    }

    let content = fs.readFileSync(fullPath, 'utf-8');

    // Check if already updated
    if (content.includes('tenantSchemaService')) {
      stats.alreadyUpdated = true;
      return stats;
    }

    // 1. Add import
    if (content.includes("from 'drizzle-orm'")) {
      const importToAdd = "\nimport { tenantSchemaService } from '../../../apps/api/services/tenant-schema.service';";
      content = content.replace(
        /(import .* from 'drizzle-orm';)/,
        `$1${importToAdd}`
      );
      stats.importAdded = true;
    }

    // 2. Update execute() method signature
    if (content.includes('async execute():')) {
      content = content.replace(
        /async execute\(\):/g,
        'async execute(schema?: string):'
      );
      stats.executeUpdated = true;
    }

    // 3. Update count() method signature
    if (content.includes('async count():')) {
      content = content.replace(
        /async count\(\):/g,
        'async count(schema?: string):'
      );
      stats.countUpdated = true;
    }

    // Write changes
    if (!dryRun && (stats.importAdded || stats.executeUpdated || stats.countUpdated)) {
      fs.writeFileSync(fullPath, content, 'utf-8');
    }

  } catch (error: any) {
    stats.errors.push(error.message);
  }

  return stats;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  console.log('='.repeat(80));
  console.log('QUERY BUILDER PATCH SCRIPT');
  console.log('='.repeat(80));
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE UPDATE'}`);
  console.log('='.repeat(80));
  console.log('');

  const allStats: PatchStats[] = [];

  for (const file of QUERY_BUILDERS) {
    console.log(`Processing: ${file}`);
    const stats = patchQueryBuilder(file, dryRun);
    allStats.push(stats);

    if (stats.alreadyUpdated) {
      console.log('  ✅ Already updated (tenantSchemaService import found)');
    } else if (stats.errors.length > 0) {
      console.log('  ❌ Errors:');
      for (const error of stats.errors) {
        console.log(`     - ${error}`);
      }
    } else {
      if (stats.importAdded) console.log('  ✅ Added tenantSchemaService import');
      if (stats.executeUpdated) console.log('  ✅ Updated execute() method signature');
      if (stats.countUpdated) console.log('  ✅ Updated count() method signature');
    }
    console.log('');
  }

  // Summary
  console.log('='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));
  
  const alreadyUpdated = allStats.filter(s => s.alreadyUpdated).length;
  const successful = allStats.filter(s => !s.alreadyUpdated && s.errors.length === 0).length;
  const failed = allStats.filter(s => s.errors.length > 0).length;

  console.log(`Total files: ${allStats.length}`);
  console.log(`Already updated: ${alreadyUpdated}`);
  console.log(`Successfully updated: ${successful}`);
  console.log(`Failed: ${failed}`);
  console.log('');

  if (dryRun) {
    console.log('✅ DRY RUN complete - no changes made');
    console.log('Run without --dry-run to apply changes');
  } else {
    console.log('✅ Updates applied successfully');
    console.log('');
    console.log('⚠️  MANUAL STEPS REQUIRED:');
    console.log('');
    console.log('For each updated file, you need to add schema resolution in execute() method:');
    console.log('');
    console.log('  Add this line at the start of execute():');
    console.log('  const targetSchema = schema || await tenantSchemaService.getTenantSchemaName(this.tenantId) || \'public\';');
    console.log('');
    console.log('  Then use targetSchema in your SQL queries');
    console.log('');
  }
  
  console.log('='.repeat(80));
}

main().catch(error => {
  console.error('❌ Script failed:', error);
  process.exit(1);
});

