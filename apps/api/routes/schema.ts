import { Router } from "express";
import { Queue } from "bullmq";
import { redisConnection } from "../../worker/config/redis";
import { requireAuth } from "../middleware/auth.middleware";
import { tenantMiddleware } from "../middleware/tenant-middleware";
import { quotaMiddleware } from "../middleware/quota.middleware";
import { RollbackSnapshots } from "../middleware/rollback-snapshot.middleware";
import { SchemaEvolutionService } from "../services/schema-evolution.service";
import { calculateSqlHash } from "../services/migration-hash.service";
import { db } from "../db";
import { migrations, migrationExecutions } from "../../../shared/schema";
import { eq, and, desc } from "drizzle-orm";
import type { Environment } from "../../../shared/types/environment";

const router = Router();

// Create queue for async migration jobs
const migrationQueue = new Queue('apply-migration', { connection: redisConnection });

/**
 * Schema Evolution API Routes
 * 
 * Provides RESTful endpoints for schema operations:
 * - Snapshot capture
 * - Version comparison
 * - Migration generation and application
 * - Rollback operations
 */

router.use(requireAuth);
router.use(tenantMiddleware);

/**
 * POST /api/schema/snapshot
 * Capture current schema snapshot
 */
router.post("/snapshot", async (req, res) => {
  try {
    const { description } = req.body;
    const tenantId = (req as any).tenantId;
    const userId = (req as any).userId;

    if (!tenantId || !userId) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized"
      });
    }

    if (!description) {
      return res.status(400).json({
        success: false,
        error: "description é obrigatório"
      });
    }

    const service = new SchemaEvolutionService();
    const snapshot = await service.captureSnapshot(tenantId, userId, description);

    res.json({
      success: true,
      data: {
        version: snapshot.version,
        description: snapshot.metadata.description,
        capturedBy: snapshot.metadata.capturedBy,
        capturedAt: snapshot.timestamp,
        tablesCount: snapshot.tables?.length || 0
      }
    });
  } catch (error: any) {
    console.error("Error capturing snapshot:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/schema/diff
 * Compare two schema versions
 */
router.post("/diff", async (req, res) => {
  try {
    const { fromVersion, toVersion } = req.body;
    const tenantId = (req as any).tenantId;

    if (!tenantId) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized"
      });
    }

    if (typeof fromVersion !== 'number' || typeof toVersion !== 'number') {
      return res.status(400).json({
        success: false,
        error: "fromVersion e toVersion devem ser números"
      });
    }

    const service = new SchemaEvolutionService();
    const diff = await service.diff(tenantId, fromVersion, toVersion);

    res.json({
      success: true,
      data: {
        fromVersion,
        toVersion,
        changes: diff.changes,
        summary: {
          addedTables: diff.changes.filter(c => c.type === 'table_add').length,
          modifiedTables: diff.changes.filter(c => c.type === 'table_rename').length,
          removedTables: diff.changes.filter(c => c.type === 'table_drop').length,
          addedColumns: diff.changes.filter(c => c.type === 'column_add').length,
          modifiedColumns: diff.changes.filter(c => c.type === 'column_modify').length,
          removedColumns: diff.changes.filter(c => c.type === 'column_drop').length,
        }
      }
    });
  } catch (error: any) {
    console.error("Error comparing versions:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/schema/migrations
 * Generate migration from diff
 * 
 * GAP #5: Enforces schema quota limits via quotaMiddleware
 * GAP #6: Auto-snapshot before migration generation
 */
router.post("/migrations", quotaMiddleware('schemas'), RollbackSnapshots.schemaMigration, async (req, res) => {
  try {
    const { fromVersion, toVersion, description } = req.body;
    const tenantId = (req as any).tenantId;
    const environment = (req.headers['x-environment'] as Environment) || 'production';

    if (!tenantId) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized"
      });
    }

    if (typeof fromVersion !== 'number' || typeof toVersion !== 'number') {
      return res.status(400).json({
        success: false,
        error: "fromVersion e toVersion devem ser números"
      });
    }

    const service = new SchemaEvolutionService();
    
    // Generate diff and impact analysis
    const diff = await service.diff(tenantId, fromVersion, toVersion);
    const impact = await service.analyzeImpact(diff);
    
    // Generate migration
    const migration = await service.generateMigration(tenantId, diff, impact);

    // Calculate and store SQL hash
    const upSqlHash = calculateSqlHash(migration.upSql);
    await db.update(migrations)
      .set({ upSqlHash })
      .where(eq(migrations.id, migration.id));

    res.json({
      success: true,
      data: {
        migrationId: migration.id,
        version: migration.version,
        description: migration.description,
        estimatedDuration: migration.estimatedDuration,
        requiresDowntime: migration.requiresDowntime,
        upSqlHash,
        upSqlPreview: migration.upSql[0]?.substring(0, 500),
        downSqlPreview: migration.downSql[0]?.substring(0, 500),
      }
    });
  } catch (error: any) {
    console.error("Error generating migration:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/schema/migrations
 * List migrations for tenant
 */
router.get("/migrations", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;

    if (!tenantId) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized"
      });
    }
    const environment = (req.query.environment as Environment) || 'production';
    const limit = parseInt(req.query.limit as string) || 50;

    const migrationList = await db.query.migrations.findMany({
      where: and(
        eq(migrations.tenantId, tenantId),
        eq(migrations.environment, environment)
      ),
      orderBy: [desc(migrations.createdAt)],
      limit,
    });

    res.json({
      success: true,
      data: migrationList.map(m => ({
        id: m.id,
        fromVersion: m.fromVersion,
        toVersion: m.toVersion,
        description: m.description,
        status: m.status,
        createdAt: m.createdAt,
        appliedAt: m.appliedAt,
        requiresDowntime: m.requiresDowntime,
        estimatedDuration: m.estimatedDuration,
      }))
    });
  } catch (error: any) {
    console.error("Error listing migrations:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/schema/migrations/:id
 * Get migration details
 */
router.get("/migrations/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = (req as any).tenantId;

    if (!tenantId) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized"
      });
    }

    const migration = await db.query.migrations.findFirst({
      where: and(
        eq(migrations.id, id),
        eq(migrations.tenantId, tenantId)
      )
    });

    if (!migration) {
      return res.status(404).json({
        success: false,
        error: "Migration não encontrada"
      });
    }

    // Get execution history
    const executions = await db.query.migrationExecutions.findMany({
      where: and(
        eq(migrationExecutions.migrationId, id),
        eq(migrationExecutions.tenantId, tenantId)
      ),
      orderBy: [desc(migrationExecutions.executedAt)],
    });

    res.json({
      success: true,
      data: {
        ...migration,
        executions: executions.map(e => ({
          environment: e.environment,
          status: e.status,
          executedAt: e.executedAt,
          executedBy: e.executedBy,
          executionDuration: e.executionDuration,
          upSqlHash: e.upSqlHash,
        }))
      }
    });
  } catch (error: any) {
    console.error("Error getting migration:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/schema/migrations/:id/apply
 * Apply migration
 */
router.post("/migrations/:id/apply", async (req, res) => {
  try {
    const { id } = req.params;
    const { confirmProduction = false } = req.body;
    const tenantId = (req as any).tenantId;
    const userId = (req as any).userId;
    const environment = (req.headers['x-environment'] as Environment) || 'production';

    // Production safety check
    if (environment === 'production' && !confirmProduction) {
      return res.status(400).json({
        success: false,
        error: "AVISO: Aplicar migration em produção requer confirmProduction: true. Teste em sandbox primeiro!"
      });
    }

    const migration = await db.query.migrations.findFirst({
      where: and(
        eq(migrations.id, id),
        eq(migrations.tenantId, tenantId)
      )
    });

    if (!migration) {
      return res.status(404).json({
        success: false,
        error: "Migration não encontrada"
      });
    }

    // Calculate current SQL hash
    const upSql = migration.upSql as string[];
    const currentHash = calculateSqlHash(upSql);

    // SANDBOX VALIDATION: If applying to production, verify it was tested in sandbox first
    if (environment === 'production') {
      const sandboxExecution = await db.query.migrationExecutions.findFirst({
        where: and(
          eq(migrationExecutions.migrationId, id),
          eq(migrationExecutions.tenantId, tenantId),
          eq(migrationExecutions.environment, 'sandbox'),
          eq(migrationExecutions.status, 'applied')
        ),
        orderBy: [desc(migrationExecutions.executedAt)]
      });

      if (!sandboxExecution) {
        return res.status(400).json({
          success: false,
          error: "SANDBOX PROTECTION: Migration deve ser testada em sandbox antes de production. " +
                 "Aplique primeiro em sandbox, valide que funciona, e então aplique em production."
        });
      }

      // SQL HASH VALIDATION
      if (sandboxExecution.upSqlHash !== currentHash) {
        return res.status(400).json({
          success: false,
          error: "SQL MUTATION DETECTED: O SQL da migration foi modificado após testing em sandbox. " +
                 `Hash sandbox: ${sandboxExecution.upSqlHash.substring(0, 8)}... ` +
                 `Hash atual: ${currentHash.substring(0, 8)}... ` +
                 "Por segurança, você deve re-testar em sandbox antes de aplicar em production."
        });
      }
    }

    // Enqueue migration job for async execution
    const job = await migrationQueue.add('apply-migration', {
      tenantId,
      environment,
      userId,
      migrationId: id,
    }, {
      attempts: 1, // Single attempt (migrations are critical, no auto-retry)
      removeOnComplete: {
        age: 24 * 3600, // Keep completed jobs for 24 hours
        count: 100
      },
      removeOnFail: false, // Keep failed jobs indefinitely for debugging
    });

    res.json({
      success: true,
      data: {
        jobId: job.id,
        migrationId: id,
        environment,
        status: 'queued',
        message: `Migration ${id} enfileirada para execução assíncrona. Use GET /api/schema/jobs/${job.id} para verificar status.`
      }
    });
  } catch (error: any) {
    console.error("Error applying migration:", error);
    
    // Record failed execution
    try {
      const tenantId = (req as any).tenantId;
      const userId = (req as any).userId;
      if (tenantId && userId) {
        await db.insert(migrationExecutions).values({
          migrationId: req.params.id,
          tenantId,
          environment: (req.headers['x-environment'] as Environment) || 'production',
          upSqlHash: '',
          status: 'failed',
          executedBy: userId,
          executedAt: new Date(),
          errorMessage: error.message,
        });
      }
    } catch (logError) {
      console.error("Error logging failed execution:", logError);
    }

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/schema/rollback
 * Rollback to target version
 */
router.post("/rollback", async (req, res) => {
  try {
    const { targetVersion, confirmRollback = false } = req.body;
    const tenantId = (req as any).tenantId;
    const environment = (req.headers['x-environment'] as Environment) || 'production';

    if (!tenantId) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized"
      });
    }

    if (typeof targetVersion !== 'number') {
      return res.status(400).json({
        success: false,
        error: "targetVersion deve ser um número"
      });
    }

    if (environment === 'production' && !confirmRollback) {
      return res.status(400).json({
        success: false,
        error: "AVISO: Rollback em produção requer confirmRollback: true"
      });
    }

    const service = new SchemaEvolutionService();
    await service.rollback(tenantId, targetVersion);

    res.json({
      success: true,
      data: {
        targetVersion,
        environment,
        message: `Schema rolled back para versão ${targetVersion} em ${environment}`
      }
    });
  } catch (error: any) {
    console.error("Error rolling back schema:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/schema/jobs/:jobId
 * Check migration job status
 */
router.get("/jobs/:jobId", async (req, res) => {
  try {
    const { jobId } = req.params;
    const tenantId = (req as any).tenantId;

    if (!tenantId) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized"
      });
    }

    // Get job from queue
    const job = await migrationQueue.getJob(jobId);

    if (!job) {
      return res.status(404).json({
        success: false,
        error: "Job não encontrado"
      });
    }

    // Verify job belongs to this tenant
    if (job.data.tenantId !== tenantId) {
      return res.status(403).json({
        success: false,
        error: "Acesso negado"
      });
    }

    // Get job state and progress
    const state = await job.getState();
    const progress = job.progress || 0;
    const logs = await job.getLogEntries();

    res.json({
      success: true,
      data: {
        jobId: job.id,
        migrationId: job.data.migrationId,
        environment: job.data.environment,
        state,
        progress,
        logs: logs?.map(log => log.text) || [],
        result: job.returnvalue,
        failedReason: job.failedReason,
        processedOn: job.processedOn,
        finishedOn: job.finishedOn,
      }
    });
  } catch (error: any) {
    console.error("Error checking job status:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
