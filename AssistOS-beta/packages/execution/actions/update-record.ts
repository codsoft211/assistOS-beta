import type { ActionExecutor, ActionResult } from '../ActionExecutor';
import type { ExecutionContext } from '../types';
import { db } from '../../../apps/api/db';
import { eq, and } from 'drizzle-orm';
import { ALLOWED_TABLES, getAllowedTableNames, getUpdatableColumns } from '../allowed-tables';

/**
 * Update Record Action - SECURE IMPLEMENTATION WITH PER-TABLE ALLOWLISTS
 * 
 * Uses Drizzle query builder instead of raw SQL to prevent SQL injection.
 * Enforces tenant scoping on ALL updates.
 * Uses per-table column allowlists to prevent security vulnerabilities.
 * 
 * SECURITY FEATURES:
 * - NO raw SQL
 * - Whitelist of allowed tables
 * - Per-table column allowlists (CRITICAL - prevents tenant escalation)
 * - Automatic tenant ID enforcement in WHERE clause (handles both camelCase and snake_case)
 * - Blocks ALL foreign key updates (clientId, supplierId, etc.)
 * - Blocks ALL ID fields (id, tenantId, tenant_id)
 * - Blocks ALL audit fields (createdAt, createdBy, updatedAt, updatedBy)
 * - Type-safe Drizzle operations
 * 
 * SECURITY IMPROVEMENTS OVER PREVIOUS VERSION:
 * - Previous: IMMUTABLE_FIELDS only blocked camelCase (tenantId), allowing tenant_id updates
 * - Current: Per-table allowlists ONLY permit explicitly safe columns
 * - Previous: Foreign keys could be changed (e.g., change clientId to access other tenant's data)
 * - Current: NO foreign keys in allowlists - prevents cross-tenant escalation
 * 
 * CRITICAL SECURITY FIX:
 * This implementation fixes CVE-level vulnerabilities where:
 * 1. Attacker could update tenant_id (snake_case) to hijack records
 * 2. Attacker could update foreign keys (clientId, supplierId) to access other tenant's resources
 * 3. Mixed camelCase/snake_case schemas allowed bypass of IMMUTABLE_FIELDS protection
 */
export class UpdateRecordAction implements ActionExecutor {
  readonly name = 'update_record';
  readonly description = 'Update a database record (secure - per-table allowlist enforced)';
  
  validate(config: Record<string, any>): boolean {
    if (!config.table || !config.where || !config.data) {
      return false;
    }
    
    // Validate table is in whitelist
    if (!(config.table in ALLOWED_TABLES)) {
      return false;
    }
    
    return true;
  }
  
  async execute(
    config: Record<string, any>,
    context: ExecutionContext
  ): Promise<ActionResult> {
    try {
      // Get table from whitelist - SAFE
      const table = ALLOWED_TABLES[config.table as keyof typeof ALLOWED_TABLES];
      
      if (!table) {
        return {
          success: false,
          error: `Table '${config.table}' not allowed. Allowed tables: ${getAllowedTableNames().join(', ')}`,
        };
      }
      
      // CRITICAL: Get per-table allowlist of updatable columns
      // This is the KEY security fix - only columns in this allowlist can be updated
      const updatableColumns = getUpdatableColumns(config.table);
      
      if (updatableColumns.length === 0) {
        return {
          success: false,
          error: `No columns are configured as updatable for table '${config.table}'. This table cannot be updated via workflows.`,
        };
      }
      
      // Filter to ONLY columns in the per-table allowlist
      // This BLOCKS:
      // - id, tenantId, tenant_id (prevents tenant escalation)
      // - clientId, supplierId, etc. (prevents cross-tenant foreign key attacks)
      // - createdAt, createdBy, updatedAt, updatedBy (prevents audit trail tampering)
      // - Any computed/system fields not in the allowlist
      const safeData = Object.keys(config.data)
        .filter(key => updatableColumns.includes(key))
        .reduce((obj, key) => {
          obj[key] = config.data[key];
          return obj;
        }, {} as Record<string, any>);
      
      // Verify we have data to update after filtering
      if (Object.keys(safeData).length === 0) {
        const attemptedFields = Object.keys(config.data).join(', ');
        const allowedFields = updatableColumns.join(', ');
        return {
          success: false,
          error: `No valid fields to update. Attempted to update: [${attemptedFields}]. Allowed fields for ${config.table}: [${allowedFields}]`,
        };
      }
      
      // Build WHERE conditions using Drizzle - SAFE from SQL injection
      const whereConditions = Object.keys(config.where).map(key => 
        eq(table[key], config.where[key])
      );
      
      // CRITICAL: ALWAYS enforce tenant scoping
      // Handle BOTH camelCase (tenantId) AND snake_case (tenant_id) schemas
      // This ensures tenant isolation regardless of schema naming convention
      const tenantCondition = table.tenantId 
        ? eq(table.tenantId, context.tenantId)
        : eq(table['tenant_id' as any], context.tenantId);
      
      const fullWhere = and(
        tenantCondition, // Tenant enforcement (works for both naming conventions)
        ...whereConditions
      );
      
      // Use Drizzle update with PER-TABLE ALLOWLIST - SAFE!
      // Only columns in the allowlist can be updated
      // All dangerous fields are blocked by the allowlist filter
      const result = await db
        .update(table)
        .set(safeData) // Use allowlist-filtered data, NOT config.data
        .where(fullWhere!)
        .returning();
      
      return {
        success: true,
        output: result[0] || { 
          updated: true, 
          rowsAffected: result.length 
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to update record: ${error.message}`,
      };
    }
  }
}
