import { Worker, Job } from 'bullmq';
import { redisConnection, checkRedisConnection } from '../config/redis';
import { SchemaEvolutionService } from '../../api/services/schema-evolution.service';
import { calculateSqlHash } from '../../api/services/migration-hash.service';
import { db } from '../db';
import { migrations, migrationExecutions } from '../../../shared/schema';
import { eq, and } from 'drizzle-orm';
import type { BaseJobPayload } from '../../api/services/context.service';
import { scopedFilter } from '../../api/utils/environment-query.utils';

const schemaEvolutionService = new SchemaEvolutionService();

interface ApplyMigrationJobData extends BaseJobPayload {
  // BaseJobPayload includes: tenantId, environment, userId
  migrationId: string;
}

// Migration type for applyMigration() method (from SchemaEvolutionService)
interface Migration {
  id: string;
  tenantId: string;
  fromVersion?: number;
  version: number;
  description: string;
  upSql: string[];
  downSql: string[];
  estimatedDuration: number;
  requiresDowntime: boolean;
  createdAt: Date;
  appliedAt?: Date;
  rolledBackAt?: Date;
  status: 'pending' | 'applied' | 'rolled_back' | 'failed';
}

/**
 * Process migration application job
 * 
 * Executes schema migration asynchronously to avoid blocking API requests.
 * Long-running migrations (ALTER TABLE, CREATE INDEX, etc.) are handled
 * gracefully with progress tracking and automatic rollback on failure.
 * 
 * @param job - BullMQ job with migration ID to apply
 */
async function processApplyMigration(job: Job<ApplyMigrationJobData>) {
  const { tenantId, environment, userId, migrationId } = job.data;
  
  console.log(`[Migration Job ${job.id}] Starting migration ${migrationId} for tenant ${tenantId} in ${environment}`);
  
  // Hoist variables outside try block for use in catch
  let upSqlHash = '';
  let startTime = 0;
  
  try {
    await job.updateProgress(10);
    await job.log(`Fetching migration ${migrationId}...`);
    
    // Fetch migration from database
    const [migrationRecord] = await db
      .select()
      .from(migrations)
      .where(and(
        eq(migrations.id, migrationId),
        scopedFilter(migrations, tenantId, environment)
      ));
    
    if (!migrationRecord) {
      throw new Error(`Migration ${migrationId} not found for tenant ${tenantId} in ${environment}`);
    }
    
    // Calculate SQL hash for execution tracking (needed for both success and failure)
    const upSql = migrationRecord.upSql as string[];
    upSqlHash = calculateSqlHash(upSql);
    
    await job.updateProgress(20);
    await job.log(`Applying migration v${migrationRecord.toVersion}... (hash: ${upSqlHash.substring(0, 8)}...)`);
    
    // Convert DB record to Migration type
    const migration: Migration = {
      id: migrationRecord.id,
      tenantId: migrationRecord.tenantId,
      version: migrationRecord.toVersion,
      fromVersion: migrationRecord.fromVersion,
      description: migrationRecord.description,
      upSql: migrationRecord.upSql,
      downSql: migrationRecord.downSql,
      estimatedDuration: migrationRecord.estimatedDuration,
      requiresDowntime: migrationRecord.requiresDowntime || false,
      createdAt: migrationRecord.createdAt,
      appliedAt: migrationRecord.appliedAt || undefined,
      rolledBackAt: migrationRecord.rolledBackAt || undefined,
      status: migrationRecord.status as 'pending' | 'applied' | 'rolled_back' | 'failed'
    };
    
    // Track execution start time
    startTime = Date.now();
    
    // Execute migration with transaction support in correct environment
    await schemaEvolutionService.applyMigration(tenantId, migration, environment);
    
    const executionDuration = Date.now() - startTime;
    
    await job.updateProgress(80);
    await job.log(`Migration applied successfully - ${executionDuration}ms`);
    
    // Create execution record for audit trail and sandbox safety checks
    // userId should always be present for migrations, but provide fallback for safety
    if (!userId) {
      throw new Error('Migration execution requires a userId');
    }
    
    await db.insert(migrationExecutions).values({
      migrationId,
      tenantId,
      environment,
      upSqlHash,
      status: 'applied',
      executedBy: userId,
      executedAt: new Date(),
      executionDuration: executionDuration,
    });
    
    await job.updateProgress(90);
    await job.log(`Execution record created`);
    
    console.log(`[Migration Job ${job.id}] Completed - migration ${migrationId} applied (${executionDuration}ms)`);
    
    await job.updateProgress(100);
    
    return {
      success: true,
      migrationId,
      version: migrationRecord.toVersion,
      appliedBy: userId,
      executionDuration
    };
    
  } catch (error) {
    console.error(`[Migration Job ${job.id}] Failed:`, error);
    await job.log(`ERROR: ${(error as Error).message}`);
    
    // Record failed execution for audit trail
    try {
      // Only log if we have userId (required field)
      if (userId) {
        const failureRecord: any = {
          migrationId,
          tenantId,
          environment,
          upSqlHash: upSqlHash || '', // Use calculated hash if migration was fetched
          status: 'failed',
          executedBy: userId,
          executedAt: new Date(),
          errorMessage: (error as Error).message,
        };
        
        // Only include executionDuration if migration execution actually started
        if (startTime > 0) {
          failureRecord.executionDuration = Date.now() - startTime;
        }
        
        await db.insert(migrationExecutions).values(failureRecord);
      }
    } catch (logError) {
      console.error(`[Migration Job ${job.id}] Failed to log execution:`, logError);
    }
    
    throw error;
  }
}

// Initialize worker only if Redis is available
checkRedisConnection().then(async (isAvailable) => {
  if (isAvailable) {
    // Dynamic imports to avoid circular dependencies
    const { addToDeadLetterQueue } = await import('../queues/dlq');
    const { logJobStarted, logJobCompleted, logJobFailed } = await import('../utils/job-monitoring');
    const { defaultJobOptions } = await import('../config/redis');
    
    const worker = new Worker<ApplyMigrationJobData>('apply-migration', processApplyMigration, {
      connection: redisConnection,
      concurrency: 1, // Only one migration at a time per worker instance
      limiter: {
        max: 2, // Max 2 migrations per minute (safety limit)
        duration: 60000,
      },
    });
    
    // Job Lifecycle Events with Enhanced Monitoring
    
    worker.on('active', (job) => {
      logJobStarted(job);
    });
    
    worker.on('completed', (job) => {
      logJobCompleted(job);
      console.log(`[Migration Worker] ✅ Migration ${job.data.migrationId} completed successfully`);
    });
    
    worker.on('failed', async (job, error) => {
      logJobFailed(job, error, 'apply-migration');
      
      // Move to DLQ if all retries exhausted
      const maxAttempts = job?.opts?.attempts || defaultJobOptions.attempts || 3;
      if (job && job.attemptsMade >= maxAttempts) {
        await addToDeadLetterQueue({
          originalQueue: job.queueName,
          jobId: job.id,
          jobName: job.name,
          jobData: job.data,
          error: error.message,
          stackTrace: error.stack,
          failedAt: new Date(),
          attemptsMade: job.attemptsMade,
          tenantId: job.data.tenantId,
          environment: job.data.environment,
          userId: job.data.userId,
          processedOn: job.processedOn,
          finishedOn: job.finishedOn,
          duration: job.finishedOn && job.processedOn ? job.finishedOn - job.processedOn : undefined,
        });
        
        console.log(`[Migration Worker] 📦 Job ${job.id} moved to DLQ - Migration ${job.data.migrationId} permanently failed`);
      }
    });
    
    worker.on('stalled', (jobId) => {
      console.warn(`[Migration Worker] ⚠️  Job ${jobId} stalled - migration may be hanging`);
    });
    
    worker.on('error', (error) => {
      console.error('[Migration Worker] Worker error:', error);
    });
    
    console.log('[Migration Worker] ✅ Worker initialized with DLQ and enhanced monitoring');
  } else {
    console.warn('[Migration Worker] ⚠️  Redis unavailable - worker disabled');
  }
});
