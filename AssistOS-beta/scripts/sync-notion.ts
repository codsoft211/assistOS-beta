#!/usr/bin/env node

import { NotionSyncService } from '../apps/api/services/notion-sync.service';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('🔄 AssistOS - Notion Sync (Bidirectional)');
  console.log('═══════════════════════════════════════════════════════\n');

  const syncService = new NotionSyncService();

  try {
    const result = await syncService.syncBidirectional();

    console.log('\n═══════════════════════════════════════════════════════');
    console.log('✅ Sync Completed!');
    console.log('═══════════════════════════════════════════════════════');

    if (result.errors.length > 0) {
      console.error('\n⚠️  Errors encountered:');
      result.errors.forEach(err => console.error(`   - ${err}`));
      process.exit(1);
    }

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  }
}

main();
