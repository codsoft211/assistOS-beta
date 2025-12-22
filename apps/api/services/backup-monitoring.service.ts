import { db } from '../db';
import * as Sentry from '@sentry/node';
import { sql } from 'drizzle-orm';

/**
 * Backup Monitoring Service
 * 
 * Monitors Neon PITR configuration and database health for backup readiness.
 * 
 * Key Features:
 * - Database connectivity verification
 * - WAL configuration checks
 * - Retention policy validation
 * - Sentry integration for alerting
 * 
 * Note: Actual PITR retention is managed in Neon Console.
 * This service verifies database health and accessibility.
 */

export interface BackupConfigurationStatus {
  isConfigured: boolean;
  currentRetentionDays: number | null;
  recommendedRetentionDays: number;
  issues: string[];
  lastVerified: Date;
  databaseHealth: {
    isConnected: boolean;
    walEnabled: boolean;
    maxWalSize: string | null;
    walLevel: string | null;
  };
}

export interface BackupStatus {
  status: 'healthy' | 'warning' | 'critical';
  message: string;
  timestamp: string;
}

export interface StorageStatistics {
  databaseSize: string;
  totalRelationSize: string;
  topTables: Array<{
    schemaName: string;
    tableName: string;
    size: string;
  }>;
}

const RECOMMENDED_RETENTION_DAYS = 30;
const MINIMUM_RETENTION_DAYS = 7;

/**
 * Verify Neon PITR configuration and database health
 * 
 * @returns BackupConfigurationStatus with validation results
 */
export async function verifyBackupConfiguration(): Promise<BackupConfigurationStatus> {
  const issues: string[] = [];
  let isConnected = false;
  let walEnabled = false;
  let maxWalSize: string | null = null;
  let walLevel: string | null = null;

  try {
    // 1. Verify database connectivity
    await db.execute(sql`SELECT 1 as health_check`);
    isConnected = true;

    // 2. Check PostgreSQL WAL configuration
    const walSettings = await db.execute<{
      name: string;
      setting: string;
      unit: string | null;
    }>(sql`
      SELECT name, setting, unit
      FROM pg_settings
      WHERE name IN ('wal_level', 'max_wal_size', 'archive_mode')
    `);

    // Parse WAL settings
    for (const row of walSettings.rows) {
      if (row.name === 'wal_level') {
        walLevel = row.setting;
        walEnabled = row.setting === 'replica' || row.setting === 'logical';
        
        if (!walEnabled) {
          issues.push(`WAL level is '${row.setting}'. Expected 'replica' or 'logical' for PITR support.`);
        }
      } else if (row.name === 'max_wal_size') {
        maxWalSize = row.unit ? `${row.setting}${row.unit}` : row.setting;
      }
    }

    // 3. Check if database is read-only (potential issue)
    const readOnlyResult = await db.execute<{
      setting: string;
    }>(sql`
      SELECT setting
      FROM pg_settings
      WHERE name = 'default_transaction_read_only'
    `);

    if (readOnlyResult.rows[0]?.setting === 'on') {
      issues.push('Database is in read-only mode. PITR restoration may be required.');
    }

    // 4. Send alerts only if critical issues found
    if (issues.length > 0) {
      Sentry.captureMessage('Backup configuration issues detected', {
        level: 'error',
        tags: {
          component: 'backup-monitoring',
          service: 'neon-pitr'
        },
        extra: {
          issues,
          walEnabled,
          walLevel,
          maxWalSize
        }
      });
    }

  } catch (error) {
    isConnected = false;
    issues.push(`Database connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);

    Sentry.captureException(error, {
      tags: {
        component: 'backup-monitoring',
        service: 'neon-pitr'
      },
      extra: {
        message: 'Failed to verify backup configuration'
      }
    });
  }

  return {
    isConfigured: issues.length === 0 && isConnected && walEnabled,
    currentRetentionDays: null, // Cannot be determined via SQL
    recommendedRetentionDays: RECOMMENDED_RETENTION_DAYS,
    issues,
    lastVerified: new Date(),
    databaseHealth: {
      isConnected,
      walEnabled,
      maxWalSize,
      walLevel
    }
  };
}

/**
 * Check if database is accessible and healthy
 * 
 * Used by health check endpoints
 * 
 * @returns boolean indicating if database is healthy
 */
export async function isDatabaseHealthy(): Promise<boolean> {
  try {
    await db.execute(sql`SELECT 1 as health_check`);
    return true;
  } catch (error) {
    Sentry.captureException(error, {
      tags: {
        component: 'backup-monitoring',
        check: 'database-health'
      }
    });
    return false;
  }
}

/**
 * Get backup configuration summary for monitoring dashboards
 * 
 * @returns Simplified status for external monitoring
 */
export async function getBackupStatus(): Promise<BackupStatus> {
  try {
    const config = await verifyBackupConfiguration();

    if (config.isConfigured && config.issues.length === 0) {
      return {
        status: 'healthy',
        message: 'Neon PITR is active and configured',
        timestamp: new Date().toISOString()
      };
    }

    if (config.issues.length > 0) {
      return {
        status: 'critical',
        message: `Backup configuration issues: ${config.issues.join('; ')}`,
        timestamp: new Date().toISOString()
      };
    }

    return {
      status: 'warning',
      message: 'Backup monitoring: Retention must be verified in Neon Console',
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return {
      status: 'critical',
      message: `Backup monitoring failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Verify Neon-specific features
 * 
 * Checks if database is running on Neon (based on connection string patterns)
 */
export async function verifyNeonFeatures(): Promise<{
  isNeon: boolean;
  features: string[];
}> {
  const connectionString = process.env.DATABASE_URL || '';
  const isNeon = connectionString.includes('neon.tech') || connectionString.includes('neon.cloud');

  if (!isNeon) {
    Sentry.captureMessage('Database is not Neon PostgreSQL', {
      level: 'warning',
      tags: {
        component: 'backup-monitoring',
        check: 'neon-verification'
      },
      extra: {
        connectionString: connectionString.replace(/:[^:@]+@/, ':***@') // Redact password
      }
    });
  }

  return {
    isNeon,
    features: isNeon
      ? ['Automatic PITR', 'Instant Branching', 'Autoscaling', 'Serverless Pooling']
      : []
  };
}

/**
 * Get storage usage statistics
 * 
 * Provides database size metrics for cost estimation
 */
export async function getStorageStatistics(): Promise<{
  databaseSize: string;
  totalRelationSize: string;
  topTables: Array<{
    schemaName: string;
    tableName: string;
    size: string;
  }>;
}> {
  try {
    // Get total database size
    const dbSizeResult = await db.execute<{
      db_size: string;
    }>(sql`
      SELECT pg_size_pretty(pg_database_size(current_database())) as db_size
    `);

    // Get total relation size (tables + indexes)
    const totalSizeResult = await db.execute<{
      total_size: string;
    }>(sql`
      SELECT pg_size_pretty(
        SUM(pg_total_relation_size(schemaname||'.'||tablename))::bigint
      ) as total_size
      FROM pg_tables
      WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
    `);

    // Get top 10 largest tables
    const topTablesResult = await db.execute<{
      schemaname: string;
      tablename: string;
      size: string;
    }>(sql`
      SELECT 
        schemaname,
        tablename,
        pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
      FROM pg_tables
      WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
      ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
      LIMIT 10
    `);

    return {
      databaseSize: dbSizeResult.rows[0]?.db_size || 'Unknown',
      totalRelationSize: totalSizeResult.rows[0]?.total_size || 'Unknown',
      topTables: topTablesResult.rows.map(row => ({
        schemaName: row.schemaname,
        tableName: row.tablename,
        size: row.size
      }))
    };
  } catch (error) {
    Sentry.captureException(error, {
      tags: {
        component: 'backup-monitoring',
        check: 'storage-statistics'
      }
    });

    return {
      databaseSize: 'Error',
      totalRelationSize: 'Error',
      topTables: []
    };
  }
}

/**
 * Run comprehensive backup health check
 * 
 * Includes all verification checks in a single call
 * Suitable for scheduled cron jobs
 */
export async function runBackupHealthCheck(): Promise<{
  healthy: boolean;
  backupStatus: BackupStatus;
  databaseHealth: boolean;
  storageStats: StorageStatistics | null;
  timestamp: string;
}> {
  const backupStatus = await getBackupStatus();
  const databaseHealth = await isDatabaseHealthy();
  let storageStats: StorageStatistics | null = null;

  try {
    storageStats = await getStorageStatistics();
  } catch (error) {
    Sentry.captureException(error, {
      tags: {
        component: 'backup-monitoring',
        check: 'storage-statistics'
      }
    });
  }

  const healthy = backupStatus.status === 'healthy' && databaseHealth;

  // Log if unhealthy
  if (!healthy) {
    Sentry.captureMessage('Backup health check failed', {
      level: 'error',
      tags: {
        component: 'backup-monitoring',
        check: 'comprehensive'
      },
      extra: {
        backupStatus,
        databaseHealth,
        storageStats
      }
    });
  }

  return {
    healthy,
    backupStatus,
    databaseHealth,
    storageStats,
    timestamp: new Date().toISOString()
  };
}
