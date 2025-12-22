/**
 * Cross-Tenant Query Helper
 * 
 * Handles queries that need to span multiple tenant schemas.
 * Used for tables like user_tenants that are tenant-scoped but need
 * cross-tenant queries (e.g., "get all tenants for a user").
 * 
 * @module apps/api/utils/cross-tenant-query.helper
 */

import { db } from '../db';
import { tenantSchemaService } from '../services/tenant-schema.service';
import { tenants } from '../../../shared/schema';
import { sql, eq } from 'drizzle-orm';
import { Pool } from 'pg';

// Singleton connection pool for cross-tenant queries (performance optimization)
let sharedPool: Pool | null = null;

function getSharedPool(): Pool {
  if (!sharedPool) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL must be set');
    }
    sharedPool = new Pool({ 
      connectionString: process.env.DATABASE_URL,
      max: 20, // Max connections in pool
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000, // Increased to 10s for slow queries
    });
    
    // Handle pool errors gracefully
    sharedPool.on('error', (err) => {
      console.error('[SharedPool] Unexpected pool error:', err);
    });
  }
  return sharedPool;
}

/**
 * Get all tenants for a user by querying across all tenant schemas
 * 
 * This is needed because user_tenants is stored in each tenant's schema,
 * but we need to find all tenants a user belongs to.
 * 
 * Uses parallel queries instead of UNION ALL for better performance and resilience.
 * 
 * @param userId - User ID
 * @param environment - Environment filter (optional)
 * @returns Array of tenant IDs and user roles
 */
export async function getUserTenantsAcrossSchemas(
  userId: string,
  environment?: string
): Promise<Array<{ tenantId: string; role: string; activeEnvironment: string; joinedAt: Date }>> {
  const pool = getSharedPool();

  try {
    // Get all tenant schemas with timeout
    const schemaQuery = `
      SELECT tenant_id, schema_name
      FROM tenant_schemas
      ORDER BY created_at;
    `;
    
    const schemasResult = await Promise.race([
      pool.query(schemaQuery),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Schema query timeout')), 5000)
      )
    ]) as { rows: Array<{ tenant_id: string; schema_name: string }> };
    
    const schemas = schemasResult.rows;

    if (schemas.length === 0) {
      return [];
    }

    // Use parallel queries instead of UNION ALL for better performance
    // Each query runs independently, so one slow schema doesn't block others
    const queryPromises = schemas.map(async (schema: { tenant_id: string; schema_name: string }) => {
      try {
        let query: string;
        let params: any[];
        
        if (environment) {
          // Query with environment filter
          query = `
            SELECT 
              $3::varchar as tenant_id,
              role,
              active_environment,
              joined_at
            FROM "${schema.schema_name}"."user_tenants"
            WHERE user_id = $1
              AND environment = $2;
          `;
          params = [userId, environment, schema.tenant_id];
        } else {
          // Query without environment filter
          query = `
            SELECT 
              $2::varchar as tenant_id,
              role,
              active_environment,
              joined_at
            FROM "${schema.schema_name}"."user_tenants"
            WHERE user_id = $1;
          `;
          params = [userId, schema.tenant_id];
        }
        
        // Add query timeout (15 seconds per schema)
        const result = await Promise.race([
          pool.query(query, params),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error(`Query timeout for schema ${schema.schema_name}`)), 15000)
          )
        ]) as { rows: Array<any> };
        
        // Return all matching rows (user might have multiple entries per tenant in different environments)
        return result.rows.map((row: any) => ({
          tenantId: schema.tenant_id,
          role: row.role,
          activeEnvironment: row.active_environment,
          joinedAt: row.joined_at,
        }));
      } catch (error) {
        // Log but don't fail - one schema failure shouldn't block others
        console.warn(`[getUserTenantsAcrossSchemas] Error querying schema ${schema.schema_name}:`, error);
        return []; // Return empty array instead of null
      }
    });

    // Wait for all queries with overall timeout (20 seconds total)
    const results = await Promise.race([
      Promise.all(queryPromises),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Overall query timeout')), 20000)
      )
    ]) as Array<Array<{ tenantId: string; role: string; activeEnvironment: string; joinedAt: Date }>>;

    // Flatten results (each schema query returns an array of rows)
    return results.flat();
  } catch (error) {
    console.error('[getUserTenantsAcrossSchemas] Error:', error);
    throw error;
  }
  // Note: Don't end the pool - it's shared and reused
}

/**
 * Get user's role in a specific tenant
 * 
 * @param userId - User ID
 * @param tenantId - Tenant ID
 * @param environment - Environment (defaults to 'production'). If not specified, checks all environments.
 * @returns User role or null if not found
 */
export async function getUserRoleInTenantSchema(
  userId: string,
  tenantId: string,
  environment?: string
): Promise<{ role: string; activeEnvironment: string; joinedAt: Date; environment: string } | null> {
  const schemaName = await tenantSchemaService.getTenantSchemaName(tenantId);
  if (!schemaName) {
    return null;
  }

  const pool = getSharedPool();

  try {
    // If environment is specified, query for that specific environment
    // Otherwise, find the user in ANY environment (for access checks)
    const envFilter = environment ? 'AND environment = $3' : '';
    const params = environment ? [userId, tenantId, environment] : [userId, tenantId];
    
    const query = `
      SELECT role, active_environment, joined_at, environment
      FROM "${schemaName}"."user_tenants"
      WHERE user_id = $1
        AND tenant_id = $2
        ${envFilter}
      ORDER BY joined_at DESC
      LIMIT 1;
    `;

    const result = await pool.query(query, params);
    
    if (result.rows.length === 0) {
      return null;
    }

    return {
      role: result.rows[0].role,
      activeEnvironment: result.rows[0].active_environment,
      joinedAt: result.rows[0].joined_at,
      environment: result.rows[0].environment,
    };
  } catch (error) {
    throw error;
  }
  // Note: Don't end the pool - it's shared and reused
}

/**
 * Get all users in a tenant
 * 
 * @param tenantId - Tenant ID
 * @param environment - Environment (defaults to 'production'). If undefined, queries all environments.
 * @returns Array of user IDs and roles
 */
export async function getTenantUsersFromSchema(
  tenantId: string,
  environment?: string
): Promise<Array<{ userId: string; role: string; joinedAt: Date; invitedBy: string | null; isPaying: boolean }>> {
  const schemaName = await tenantSchemaService.getTenantSchemaName(tenantId);
  if (!schemaName) {
    return [];
  }

  const pool = getSharedPool();

  try {
    // If environment is provided, filter by it. Otherwise, query all environments.
    const envFilter = environment ? 'AND environment = $2' : '';
    const params = environment ? [tenantId, environment] : [tenantId];
    
    const query = `
      SELECT user_id, role, joined_at, invited_by, is_paying
      FROM "${schemaName}"."user_tenants"
      WHERE tenant_id = $1
        ${envFilter}
      ORDER BY joined_at;
    `;

    const result = await pool.query(query, params);
    
    return result.rows.map((row: any) => {
      // Ensure is_paying is properly converted to boolean
      // PostgreSQL returns booleans as true/false, but handle string 'true'/'false' or null
      let isPaying = false;
      if (row.is_paying !== null && row.is_paying !== undefined) {
        isPaying = row.is_paying === true || row.is_paying === 'true' || row.is_paying === 't';
      }
      
      return {
      userId: row.user_id,
      role: row.role,
      joinedAt: row.joined_at,
      invitedBy: row.invited_by,
        isPaying,
      };
    });
  } catch (error) {
    throw error;
  }
  // Note: Don't end the pool - it's shared and reused
}

