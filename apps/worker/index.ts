#!/usr/bin/env node

// CRITICAL: Initialize Sentry FIRST (before any other imports)
import { Sentry } from './sentry.js';
import path from 'path';
import fs from 'fs';

console.log('[Worker] Starting AssistOS worker process...');
console.log('[Worker] To run worker: tsx apps/worker/index.ts');
console.log('[Worker] Redis required - install with: brew install redis (Mac) or apt install redis (Linux)');
console.log('');

import './queues/assistbuild';
import './queues/workflow-execution';
import './queues/scheduled-workflow';
import './queues/analysis';
import './queues/connector-sync';
import './queues/promotion';
import './queues/pattern-aggregation';
import './queues/finance-dunning';

import './jobs/assistbuild';
import './jobs/workflow-execution';
import './jobs/scheduled-workflow';
import './jobs/analyze-patterns';
import './jobs/connector-sync/process-event';
import './jobs/backfill-environment.job';
import './jobs/promotion.job';
import './jobs/apply-migration.job';
import './jobs/aggregate-cross-tenant-patterns.worker';
import './jobs/finance/dunning-automation';
import './jobs/finance/cashflow-refresh';
import './jobs/finance/kpi-cache';

import { startScheduler } from './scheduler';
import { sessionManager } from './whatsapp-web/session-manager';
import { startMessageListener } from './whatsapp-web/message-listener';
import { startWhatsAppWebServer } from './whatsapp-web/server';

// CRITICAL: Import all AssistME tools to register them in the global toolRegistry
// This is needed for WhatsApp automation context-aware responses
import '../../packages/ai/tools/assistme/communication';
import '../../packages/ai/tools/assistme/sales';
import '../../packages/ai/tools/assistme/procurement';
import '../../packages/ai/tools/assistme/logistics';
import '../../packages/ai/tools/assistme/discovery';
import '../../packages/ai/tools/assistme/projects';
import '../../packages/ai/tools/assistme/marketing';
import '../../packages/ai/tools/assistme/hr';
import '../../packages/ai/tools/assistme/financial';
import '../../packages/ai/tools/assistme/document-analysis';
import '../../packages/ai/tools/assistme/crm';
import '../../packages/ai/tools/assistme/accounting';

console.log('[Worker] ✅ AssistME tools loaded and registered');

// Connect CDC queue to publisher (async initialization)
async function initializeCDCQueue() {
  // Wait a bit for queue to initialize
  setTimeout(async () => {
    try {
      const connectorSync = await import('./queues/connector-sync.js');
      if (connectorSync.connectorSyncQueue) {
        const cdc = await import('../../packages/cdc/index.js');
        cdc.setConnectorSyncQueue(connectorSync.connectorSyncQueue);
      console.log('[Worker] ✅ CDC queue connected to publisher');
    } else {
      console.warn('[Worker] ⚠️  CDC queue not available');
      }
    } catch (error) {
      console.warn('[Worker] ⚠️  Failed to initialize CDC queue:', error);
    }
  }, 1000);
}

initializeCDCQueue();

async function initializeWhatsAppWeb() {
  try {
    console.log('[Worker] Initializing WhatsApp Web...');
    startWhatsAppWebServer();
    startMessageListener();
    await sessionManager.recoverSessions();
    console.log('[Worker] ✅ WhatsApp Web initialized');
  } catch (error) {
    console.error('[Worker] ⚠️  Failed to initialize WhatsApp Web:', error);
  }
}

initializeWhatsAppWeb();

console.log('');
console.log('[Worker] ✅ All workers initialized');

startScheduler();

process.on('SIGTERM', async () => {
  console.log('[Worker] Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[Worker] Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

// Capture unhandled promise rejections
process.on('unhandledRejection', (error: Error) => {
  // Handle RemoteAuth ZIP file errors gracefully
  if ((error as any).code === 'ENOENT' && (error as any).path && String((error as any).path).includes('.zip')) {
    const zipPath = (error as any).path;
    console.warn(`[Worker] ⚠️  RemoteAuth ZIP file missing: ${zipPath}`);
    console.warn(
      `[Worker]   This is normal after restart. RemoteAuth will create it on next sync. ` +
      `However, reconnection may fail without the ZIP file.`
    );
    
    // Try to find where the ZIP should be
    if (zipPath) {
      try {
        const expectedDir = path.dirname(zipPath);
        const zipFileName = path.basename(zipPath);
        console.warn(`[Worker]   Expected ZIP location: ${zipPath}`);
        console.warn(`[Worker]   Directory exists: ${fs.existsSync(expectedDir)}`);
        if (fs.existsSync(expectedDir)) {
          const files = fs.readdirSync(expectedDir);
          console.warn(`[Worker]   Files in directory (${files.length}): ${files.slice(0, 10).join(', ')}${files.length > 10 ? '...' : ''}`);
          console.warn(`[Worker]   Looking for: ${zipFileName}`);
        } else {
          console.warn(`[Worker]   ⚠️  Directory does not exist: ${expectedDir}`);
        }
      } catch (err: any) {
        console.warn(`[Worker]   Error checking ZIP path: ${err.message}`);
      }
    }
    
    return; // Don't crash on this error
  }
  
  console.error('[Worker] Unhandled promise rejection:', error);
  Sentry.captureException(error);
});

// Capture uncaught exceptions
process.on('uncaughtException', (error: Error) => {
  // Handle RemoteAuth ZIP file errors gracefully
  if ((error as any).code === 'ENOENT' && (error as any).path && String((error as any).path).includes('.zip')) {
    console.warn(
      `[Worker] ⚠️  RemoteAuth ZIP file missing: ${(error as any).path}. ` +
      `This is normal after restart. RemoteAuth will create it automatically. ` +
      `Continuing...`
    );
    return; // Don't crash on this error
  }
  
  console.error('[Worker] Uncaught exception:', error);
  Sentry.captureException(error);
  process.exit(1);
});
