import { db } from '../db';
import { promotionLogs } from '../../../shared/schema';
import { ENVIRONMENTS, validatePromotion, type Environment } from '../../../shared/types/environment';
import { scopedFilter, withEnvironment } from '../utils/environment-query.utils';
import { eq, and, inArray, sql, SQL } from 'drizzle-orm';
import type { PromotionManifest, PromotionResult, PromotionEntityResult } from '../types/promotion.types';
import logger from '../logger';
import { getTenantTableRef } from '../utils/tenant-db-helper';

// Tables that exist in tenant schema (not public)
const TENANT_SCOPED_TABLES = ['tenant_modules'];

/**
 * SandboxPromotionService
 * 
 * Handles promotion of records from sandbox to production environment.
 * 
 * Workflow:
 * 1. Snapshot: Extract records from sandbox
 * 2. Diff: Check which records don't exist in production
 * 3. Dedupe: Remove duplicates
 * 4. Apply: Insert into production with environment='production'
 * 5. Audit: Log promotion to promotionLogs table
 * 
 * Security:
 * - Only allows sandbox → production promotion
 * - Validates tenant access
 * - Preserves foreign key relationships
 * - Creates audit trail
 */
export class SandboxPromotionService {
  /**
   * Snapshot: Extract records from sandbox
   * 
   * @param manifest - Promotion manifest with table names and record IDs
   * @returns Array of records to promote
   */
  async snapshot(manifest: PromotionManifest): Promise<Map<string, any[]>> {
    const startTime = Date.now();
    
    // Validate environment is sandbox
    if (manifest.environment !== ENVIRONMENTS.SANDBOX) {
      throw new Error(`Invalid source environment: ${manifest.environment}. Only sandbox records can be promoted.`);
    }
    
    logger.info({
      tenantId: manifest.tenantId,
      environment: manifest.environment,
      entityCount: manifest.entities.length,
    }, 'Starting snapshot of sandbox records');
    
    const recordsMap = new Map<string, any[]>();
    
    for (const entity of manifest.entities) {
      const { tableName, recordIds } = entity;
      
      if (recordIds.length === 0) {
        logger.warn({ tableName }, 'No record IDs provided for table');
        continue;
      }
      
      try {
        // Get table reference (tenant-scoped or public based on table)
        const tableRef = TENANT_SCOPED_TABLES.includes(tableName)
          ? await getTenantTableRef(manifest.tenantId, tableName)
          : sql.identifier(tableName);

        // Dynamically query the table
        // Note: In production, this would use a table registry for safety
        const records = await db.execute(sql`
          SELECT * FROM ${tableRef}
          WHERE id = ANY(ARRAY[${sql.join(recordIds.map(id => sql`${id}`), sql`, `)}])
          AND tenant_id = ${manifest.tenantId}
          AND environment = ${manifest.environment}
        `);
        
        recordsMap.set(tableName, records.rows);
        
        logger.info({
          tableName,
          recordCount: records.rows.length,
          requestedCount: recordIds.length,
        }, 'Snapshotted records from table');
        
      } catch (error) {
        logger.error({
          tableName,
          error: error instanceof Error ? error.message : 'Unknown error',
        }, 'Failed to snapshot records from table');
        
        throw new Error(`Failed to snapshot records from ${tableName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
    
    const duration = Date.now() - startTime;
    const totalRecords = Array.from(recordsMap.values()).reduce((sum, records) => sum + records.length, 0);
    
    logger.info({
      tenantId: manifest.tenantId,
      totalRecords,
      duration,
    }, 'Snapshot completed');
    
    return recordsMap;
  }
  
  /**
   * Diff: Check which records already exist in production
   * 
   * @param recordsMap - Map of table names to records
   * @param tenantId - Tenant ID
   * @returns Map of records that don't exist in production
   */
  async diff(
    recordsMap: Map<string, any[]>,
    tenantId: string
  ): Promise<Map<string, any[]>> {
    const startTime = Date.now();
    
    logger.info({
      tenantId,
      tableCount: recordsMap.size,
    }, 'Starting diff against production');
    
    const newRecordsMap = new Map<string, any[]>();
    
    for (const [tableName, records] of Array.from(recordsMap.entries())) {
      if (records.length === 0) {
        newRecordsMap.set(tableName, []);
        continue;
      }
      
      try {
        const recordIds = records.map((r: any) => r.id);
        
        // Get table reference (tenant-scoped or public based on table)
        const tableRef = TENANT_SCOPED_TABLES.includes(tableName)
          ? await getTenantTableRef(tenantId, tableName)
          : sql.identifier(tableName);
        
        // Check which records exist in production
        const existingRecords = await db.execute(sql`
          SELECT id FROM ${tableRef}
          WHERE id = ANY(ARRAY[${sql.join(recordIds.map((id: string) => sql`${id}`), sql`, `)}])
          AND tenant_id = ${tenantId}
          AND environment = ${ENVIRONMENTS.PRODUCTION}
        `);
        
        const existingIds = new Set(existingRecords.rows.map((r: any) => r.id));
        
        // Filter to only new records
        const newRecords = records.filter((r: any) => !existingIds.has(r.id));
        
        newRecordsMap.set(tableName, newRecords);
        
        logger.info({
          tableName,
          totalRecords: records.length,
          existingRecords: existingIds.size,
          newRecords: newRecords.length,
        }, 'Diff completed for table');
        
      } catch (error) {
        logger.error({
          tableName,
          error: error instanceof Error ? error.message : 'Unknown error',
        }, 'Failed to diff table');
        
        throw new Error(`Failed to diff ${tableName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
    
    const duration = Date.now() - startTime;
    const totalNewRecords = Array.from(newRecordsMap.values()).reduce((sum, records) => sum + records.length, 0);
    
    logger.info({
      tenantId,
      totalNewRecords,
      duration,
    }, 'Diff completed');
    
    return newRecordsMap;
  }
  
  /**
   * Dedupe: Remove duplicate records within the promotion set
   * 
   * @param recordsMap - Map of table names to records
   * @returns Deduplicated map
   */
  async dedupe(recordsMap: Map<string, any[]>): Promise<Map<string, any[]>> {
    const startTime = Date.now();
    
    logger.info({
      tableCount: recordsMap.size,
    }, 'Starting deduplication');
    
    const dedupedMap = new Map<string, any[]>();
    
    for (const [tableName, records] of Array.from(recordsMap.entries())) {
      // Use Set to track unique IDs
      const seen = new Set<string>();
      const uniqueRecords = records.filter((r: any) => {
        if (seen.has(r.id)) {
          logger.warn({ tableName, recordId: r.id }, 'Duplicate record found, skipping');
          return false;
        }
        seen.add(r.id);
        return true;
      });
      
      dedupedMap.set(tableName, uniqueRecords);
      
      if (uniqueRecords.length < records.length) {
        logger.info({
          tableName,
          originalCount: records.length,
          dedupedCount: uniqueRecords.length,
          removedCount: records.length - uniqueRecords.length,
        }, 'Deduplication removed records');
      }
    }
    
    const duration = Date.now() - startTime;
    
    logger.info({
      duration,
    }, 'Deduplication completed');
    
    return dedupedMap;
  }
  
  /**
   * Apply: Insert records into production
   * 
   * @param recordsMap - Map of table names to records
   * @param tenantId - Tenant ID
   * @returns Promotion result
   */
  async apply(
    recordsMap: Map<string, any[]>,
    tenantId: string
  ): Promise<PromotionResult> {
    const startTime = Date.now();
    
    logger.info({
      tenantId,
      tableCount: recordsMap.size,
    }, 'Starting apply to production');
    
    let promotedCount = 0;
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Use transaction for atomicity
    await db.transaction(async (tx) => {
      for (const [tableName, records] of Array.from(recordsMap.entries())) {
        if (records.length === 0) {
          continue;
        }
        
        try {
          // Get table reference (tenant-scoped or public based on table)
          // Note: We need to get this for each table in the loop
          const isTenantScoped = TENANT_SCOPED_TABLES.includes(tableName);
          // For tenant-scoped tables, we need to get the tenant ID from the first record
          const firstTenantId = records[0]?.tenant_id;
          const tableRef = isTenantScoped && firstTenantId
            ? await getTenantTableRef(firstTenantId, tableName)
            : sql.identifier(tableName);

          for (const record of records) {
            // Convert camelCase to snake_case for database columns
            const toSnakeCase = (str: string) => 
              str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
            
            // Transform record with snake_case column names
            const snakeCaseRecord: Record<string, any> = {};
            for (const [key, value] of Object.entries(record)) {
              const snakeKey = toSnakeCase(key);
              snakeCaseRecord[snakeKey] = value;
            }
            
            // Transform record: change environment to production
            const productionRecord: Record<string, any> = {
              ...snakeCaseRecord,
              environment: ENVIRONMENTS.PRODUCTION,
            };
            
            // Remove auto-generated fields that shouldn't be copied
            // Keep created_at as it should be preserved from sandbox
            delete productionRecord.updated_at; // Some tables have this, some don't
            
            // Build column names and values
            const columns = Object.keys(productionRecord);
            const values = Object.values(productionRecord);
            
            // Insert into production or update environment if exists
            // ON CONFLICT DO UPDATE is necessary because the PK is just 'id', not (id, environment)
            await tx.execute(sql`
              INSERT INTO ${tableRef} 
              (${sql.join(columns.map(c => sql.identifier(c)), sql`, `)})
              VALUES (${sql.join(values.map(v => sql`${v}`), sql`, `)})
              ON CONFLICT (id) DO UPDATE SET environment = ${ENVIRONMENTS.PRODUCTION}
            `);
            
            promotedCount++;
          }
          
          logger.info({
            tableName,
            recordCount: records.length,
          }, 'Applied records to production');
          
        } catch (error) {
          const errorMsg = `Failed to apply ${tableName}: ${error instanceof Error ? error.message : 'Unknown error'}`;
          logger.error({
            tableName,
            error: error instanceof Error ? error.message : 'Unknown error',
          }, 'Failed to apply table');
          
          errors.push(errorMsg);
          
          // Rollback transaction on first error
          throw new Error(errorMsg);
        }
      }
    });
    
    const duration = Date.now() - startTime;
    
    const result: PromotionResult = {
      success: errors.length === 0,
      promotedCount,
      errors: errors.length > 0 ? errors : undefined,
      warnings: warnings.length > 0 ? warnings : undefined,
      duration,
    };
    
    logger.info({
      tenantId,
      ...result,
    }, 'Apply completed');
    
    return result;
  }
  
  /**
   * Promote: Main orchestration method
   * 
   * Executes the full promotion workflow:
   * 1. Validate promotion is sandbox → production
   * 2. Snapshot records from sandbox
   * 3. Diff against production
   * 4. Dedupe records
   * 5. Apply to production
   * 6. Create audit log
   * 
   * @param manifest - Promotion manifest
   * @returns Promotion result with audit log ID
   */
  async promote(manifest: PromotionManifest): Promise<PromotionResult> {
    const startTime = Date.now();
    
    logger.info({
      tenantId: manifest.tenantId,
      environment: manifest.environment,
      entityCount: manifest.entities.length,
    }, 'Starting promotion workflow');
    
    // Validate promotion direction
    try {
      validatePromotion(manifest.environment, ENVIRONMENTS.PRODUCTION);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Invalid promotion';
      logger.error({ manifest, error: errorMsg }, 'Promotion validation failed');
      
      return {
        success: false,
        promotedCount: 0,
        errors: [errorMsg],
      };
    }
    
    let auditLogId: string | undefined;
    
    try {
      // 1. Snapshot
      const snapshotRecords = await this.snapshot(manifest);
      
      // 2. Diff
      const newRecords = await this.diff(snapshotRecords, manifest.tenantId);
      
      // 3. Dedupe
      const dedupedRecords = await this.dedupe(newRecords);
      
      // 4. Apply
      const result = await this.apply(dedupedRecords, manifest.tenantId);
      
      // 5. Create audit log
      const [auditLog] = await db.insert(promotionLogs).values({
        tenantId: manifest.tenantId,
        manifestJson: {
          tenantId: manifest.tenantId,
          environment: manifest.environment,
          entities: manifest.entities,
          createdAt: manifest.createdAt.toISOString(),
          createdBy: manifest.createdBy,
        },
        result: {
          success: result.success,
          promotedCount: result.promotedCount,
          errors: result.errors,
          duration: result.duration,
          warnings: result.warnings,
        },
        status: result.success ? 'completed' : 'failed',
        startedAt: new Date(startTime),
        completedAt: new Date(),
        duration: Date.now() - startTime,
        createdBy: manifest.createdBy,
      }).returning({ id: promotionLogs.id });
      
      auditLogId = auditLog.id;
      
      logger.info({
        tenantId: manifest.tenantId,
        auditLogId,
        ...result,
      }, 'Promotion workflow completed');
      
      return {
        ...result,
        auditLogId,
      };
      
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error during promotion';
      
      logger.error({
        tenantId: manifest.tenantId,
        error: errorMsg,
      }, 'Promotion workflow failed');
      
      // Try to create failed audit log
      try {
        const [auditLog] = await db.insert(promotionLogs).values({
          tenantId: manifest.tenantId,
          manifestJson: {
            tenantId: manifest.tenantId,
            environment: manifest.environment,
            entities: manifest.entities,
            createdAt: manifest.createdAt.toISOString(),
            createdBy: manifest.createdBy,
          },
          result: {
            success: false,
            promotedCount: 0,
            errors: [errorMsg],
            duration: Date.now() - startTime,
          },
          status: 'failed',
          startedAt: new Date(startTime),
          completedAt: new Date(),
          duration: Date.now() - startTime,
          createdBy: manifest.createdBy,
        }).returning({ id: promotionLogs.id });
        
        auditLogId = auditLog.id;
      } catch (auditError) {
        logger.error({
          error: auditError instanceof Error ? auditError.message : 'Unknown error',
        }, 'Failed to create audit log for failed promotion');
      }
      
      return {
        success: false,
        promotedCount: 0,
        errors: [errorMsg],
        auditLogId,
        duration: Date.now() - startTime,
      };
    }
  }
}
