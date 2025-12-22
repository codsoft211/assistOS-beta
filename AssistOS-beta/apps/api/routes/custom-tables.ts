/**
 * Custom Tables API
 * CRUD operations for tenant-scoped custom tables
 * Records are stored in tenant's own schema (e.g., tenant_acme.custom_tables)
 * Also creates/alters/drops actual database tables in tenant schema
 * Syncs with customTables schema in shared/schema.ts
 */

import { Router } from "express";
import { db } from "../db";
import { customTables, tenantSchemas } from "../../../shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { z } from "zod";
import { Pool } from "pg";
import { CustomTableSqlService, ColumnDefinition } from "../../../packages/modules/base/custom-table-sql.service";

// Create a pool for raw SQL queries to tenant schemas
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/**
 * Get tenant's schema name
 */
async function getTenantSchemaName(tenantId: string): Promise<string | null> {
  const [schema] = await db
    .select({ schemaName: tenantSchemas.schemaName })
    .from(tenantSchemas)
    .where(eq(tenantSchemas.tenantId, tenantId))
    .limit(1);
  
  return schema?.schemaName || null;
}

const router = Router();

// Column definition schema (matches shared/schema.ts)
const columnSchema = z.object({
  name: z.string(),
  type: z.string(),
  nullable: z.boolean().optional(),
  unique: z.boolean().optional(),
  isArray: z.boolean().optional(), // Define as array type (e.g., text[], integer[])
  default: z.any().optional(),
  primaryKey: z.boolean().optional(),
  foreignKey: z.object({
    table: z.string(),
    column: z.string(),
    onDelete: z.string().optional(),
  }).optional(),
});

// Validation schemas
const createTableSchema = z.object({
  tableName: z.string().min(1, "Table name is required").regex(/^[a-z][a-z0-9_]*$/, "Table name must be lowercase, start with a letter, and contain only letters, numbers, and underscores"),
  description: z.string().optional(),
  category: z.string().optional().default("custom"),
  columns: z.array(columnSchema).optional(),
  metadata: z.record(z.any()).optional(),
  // If true, creates the actual SQL table in tenant schema
  syncToDatabase: z.boolean().optional().default(true),
});

const updateTableSchema = z.object({
  description: z.string().optional(),
  category: z.string().optional(),
  columns: z.array(columnSchema).optional(),
  metadata: z.record(z.any()).optional(),
  isActive: z.boolean().optional(),
  // If true, alters the actual SQL table in tenant schema
  syncToDatabase: z.boolean().optional().default(true),
});

/**
 * GET /api/custom-tables
 * List all custom tables for tenant (from tenant's schema)
 * Query params: ?category=crm&search=orders
 */
router.get("/", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;

    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Get tenant's schema name
    const schemaName = await getTenantSchemaName(tenantId);
    
    if (!schemaName) {
      // Fallback to public schema if no tenant schema exists
      console.warn(`[Custom Tables API] No schema found for tenant ${tenantId}, using public schema`);
    }

    const { category, search } = req.query;
    const tableName = schemaName ? `"${schemaName}"."custom_tables"` : "public.custom_tables";

    // Build WHERE clause (no environment filter - show all tables for tenant)
    let whereClause = `tenant_id = $1`;
    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (category && category !== "all") {
      whereClause += ` AND category = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }

    // Query tenant's schema
    const result = await pool.query(`
      SELECT 
        id, table_name as "tableName", description, category, columns,
        is_editable as "isEditable", is_system_table as "isSystemTable",
        is_active as "isActive", metadata, created_by as "createdBy",
        created_at as "createdAt", updated_at as "updatedAt"
      FROM ${tableName}
      WHERE ${whereClause}
      ORDER BY created_at
    `, params);

    let tables = result.rows;

    // Apply search filter in memory (for tableName and description)
    if (search) {
      const searchLower = (search as string).toLowerCase();
      tables = tables.filter(t => 
        t.tableName?.toLowerCase().includes(searchLower) ||
        t.description?.toLowerCase().includes(searchLower) ||
        (t.metadata as any)?.displayName?.toLowerCase().includes(searchLower)
      );
    }

    res.json({
      tables,
      total: tables.length,
    });
  } catch (error: any) {
    console.error("[Custom Tables API] Error listing tables:", error);
    res.status(500).json({ 
      error: "Failed to list custom tables",
      details: error.message 
    });
  }
});

/**
 * GET /api/custom-tables/:id
 * Get a specific custom table (from tenant's schema)
 */
router.get("/:id", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const { id } = req.params;

    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Get tenant's schema name
    const schemaName = await getTenantSchemaName(tenantId);
    const tableName = schemaName ? `"${schemaName}"."custom_tables"` : "public.custom_tables";

    const result = await pool.query(`
      SELECT 
        id, table_name as "tableName", description, category, columns,
        is_editable as "isEditable", is_system_table as "isSystemTable",
        is_active as "isActive", is_deleted as "isDeleted", metadata,
        created_by as "createdBy", updated_by as "updatedBy",
        created_at as "createdAt", updated_at as "updatedAt",
        tenant_id as "tenantId", environment
      FROM ${tableName}
      WHERE id = $1 AND tenant_id = $2
      LIMIT 1
    `, [id, tenantId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Custom table not found" });
    }

    res.json({ table: result.rows[0] });
  } catch (error: any) {
    console.error("[Custom Tables API] Error fetching table:", error);
    res.status(500).json({ 
      error: "Failed to fetch custom table",
      details: error.message 
    });
  }
});

/**
 * POST /api/custom-tables
 * Create a new custom table (in tenant's schema)
 * Also creates the actual SQL table if syncToDatabase is true
 */
router.post("/", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const environment = (req as any).environment || "sandbox";
    const userId = (req as any).user?.id || (req.session as any)?.userId;

    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const data = createTableSchema.parse(req.body);

    // Get tenant's schema name
    const schemaName = await getTenantSchemaName(tenantId);
    
    if (!schemaName) {
      return res.status(400).json({ 
        error: "Tenant schema not found",
        details: "Please contact support to set up your tenant schema."
      });
    }

    const metadataTableName = `"${schemaName}"."custom_tables"`;

    // Check if table name already exists for this tenant (no environment filter)
    const existingCheck = await pool.query(`
      SELECT id, is_deleted as "isDeleted" FROM ${metadataTableName}
      WHERE tenant_id = $1 AND table_name = $2
      LIMIT 1
    `, [tenantId, data.tableName]);

    if (existingCheck.rows.length > 0) {
      const existing = existingCheck.rows[0];
      
      if (!existing.isDeleted) {
        // Active table with same name exists
        return res.status(400).json({ error: "A table with this name already exists" });
      }
      
      // Soft-deleted table with same name exists - hard delete it first
      console.log(`[Custom Tables API] Removing soft-deleted record for "${data.tableName}" before creating new table`);
      await pool.query(`
        DELETE FROM ${metadataTableName}
        WHERE id = $1
      `, [existing.id]);
    }

    // Validate and create actual SQL table if syncToDatabase is enabled
    const columns = data.columns || [];
    if (data.syncToDatabase !== false && columns.length > 0) {
      const sqlService = new CustomTableSqlService(schemaName);
      
      // Validate columns
      const validation = sqlService.validateColumns(columns as ColumnDefinition[]);
      if (!validation.valid) {
        return res.status(400).json({
          error: "Column validation failed",
          details: validation.errors,
        });
      }
      
      // Check if physical table already exists
      const tableExists = await sqlService.tableExists(data.tableName);
      if (tableExists) {
        return res.status(400).json({
          error: "A physical table with this name already exists in the database",
        });
      }
      
      // Create the actual SQL table
      try {
        await sqlService.createTable(data.tableName, columns as ColumnDefinition[]);
        console.log(`[Custom Tables API] Created SQL table "${data.tableName}" in schema "${schemaName}"`);
      } catch (sqlError: any) {
        console.error("[Custom Tables API] Error creating SQL table:", sqlError);
        return res.status(500).json({
          error: "Failed to create database table",
          details: sqlError.message,
        });
      }
    }

    // Create custom table metadata record in tenant's schema
    const result = await pool.query(`
      INSERT INTO ${metadataTableName} (
        id, tenant_id, environment, table_name, description, category,
        columns, metadata, is_editable, is_system_table, is_active, is_deleted,
        created_by, created_at, updated_at
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4, $5,
        $6, $7, true, false, true, false,
        $8, NOW(), NOW()
      )
      RETURNING 
        id, table_name as "tableName", description, category, columns,
        is_editable as "isEditable", is_system_table as "isSystemTable",
        is_active as "isActive", metadata, created_by as "createdBy",
        created_at as "createdAt", updated_at as "updatedAt"
    `, [
      tenantId,
      environment,
      data.tableName,
      data.description || null,
      data.category || "custom",
      JSON.stringify(columns),
      JSON.stringify(data.metadata || {}),
      userId,
    ]);

    const table = result.rows[0];

    console.log(`[Custom Tables API] Created table metadata "${data.tableName}" in schema "${schemaName}" for tenant ${tenantId}`);

    res.status(201).json({ 
      table,
      sqlTableCreated: data.syncToDatabase !== false && columns.length > 0,
    });
  } catch (error: any) {
    console.error("[Custom Tables API] Error creating table:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: "Validation error",
        details: error.errors 
      });
    }
    
    // Handle network/DNS errors
    if (error.code === 'EAI_AGAIN' || error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
      return res.status(503).json({
        error: "Database connection failed",
        details: "Unable to connect to the database. Please check your network connection and try again.",
        code: error.code,
      });
    }
    
    res.status(500).json({ 
      error: "Failed to create custom table",
      details: error.message 
    });
  }
});

/**
 * PATCH /api/custom-tables/:id
 * Update a custom table (in tenant's schema)
 * Also alters the actual SQL table if columns are changed and syncToDatabase is true
 */
router.patch("/:id", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id || (req.session as any)?.userId;
    const { id } = req.params;

    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const data = updateTableSchema.parse(req.body);

    // Get tenant's schema name
    const schemaName = await getTenantSchemaName(tenantId);
    
    if (!schemaName) {
      return res.status(400).json({ error: "Tenant schema not found" });
    }

    const metadataTableName = `"${schemaName}"."custom_tables"`;

    // Check if table exists and is editable (no environment filter)
    const existingCheck = await pool.query(`
      SELECT id, table_name as "tableName", columns, is_editable as "isEditable", is_system_table as "isSystemTable"
      FROM ${metadataTableName}
      WHERE id = $1 AND tenant_id = $2
      LIMIT 1
    `, [id, tenantId]);

    if (existingCheck.rows.length === 0) {
      return res.status(404).json({ error: "Custom table not found" });
    }

    const existing = existingCheck.rows[0];

    if (!existing.isEditable || existing.isSystemTable) {
      return res.status(403).json({ error: "This table cannot be edited" });
    }

    // If columns are being updated and syncToDatabase is enabled, alter the SQL table
    let sqlTableAltered = false;
    if (data.columns !== undefined && data.syncToDatabase !== false) {
      const sqlService = new CustomTableSqlService(schemaName);
      
      // Validate new columns
      const validation = sqlService.validateColumns(data.columns as ColumnDefinition[]);
      if (!validation.valid) {
        return res.status(400).json({
          error: "Column validation failed",
          details: validation.errors,
        });
      }
      
      // Check if physical table exists
      const tableExists = await sqlService.tableExists(existing.tableName);
      
      if (tableExists) {
        // Alter existing table
        try {
          const existingColumns = existing.columns || [];
          await sqlService.alterTable(
            existing.tableName, 
            data.columns as ColumnDefinition[],
            existingColumns as ColumnDefinition[]
          );
          sqlTableAltered = true;
          console.log(`[Custom Tables API] Altered SQL table "${existing.tableName}" in schema "${schemaName}"`);
        } catch (sqlError: any) {
          console.error("[Custom Tables API] Error altering SQL table:", sqlError);
          return res.status(500).json({
            error: "Failed to alter database table",
            details: sqlError.message,
            hint: "The metadata will not be updated. Please fix the column definitions.",
          });
        }
      } else if (data.columns.length > 0) {
        // Create new table if it doesn't exist
        try {
          await sqlService.createTable(existing.tableName, data.columns as ColumnDefinition[]);
          sqlTableAltered = true;
          console.log(`[Custom Tables API] Created SQL table "${existing.tableName}" in schema "${schemaName}" (was missing)`);
        } catch (sqlError: any) {
          console.error("[Custom Tables API] Error creating SQL table:", sqlError);
          return res.status(500).json({
            error: "Failed to create database table",
            details: sqlError.message,
          });
        }
      }
    }

    // Build dynamic SET clause
    const setClauses: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (data.description !== undefined) {
      setClauses.push(`description = $${paramIndex++}`);
      params.push(data.description);
    }
    if (data.category !== undefined) {
      setClauses.push(`category = $${paramIndex++}`);
      params.push(data.category);
    }
    if (data.columns !== undefined) {
      setClauses.push(`columns = $${paramIndex++}`);
      params.push(JSON.stringify(data.columns));
    }
    if (data.metadata !== undefined) {
      setClauses.push(`metadata = $${paramIndex++}`);
      params.push(JSON.stringify(data.metadata));
    }
    if (data.isActive !== undefined) {
      setClauses.push(`is_active = $${paramIndex++}`);
      params.push(data.isActive);
    }

    // Always update these
    setClauses.push(`updated_by = $${paramIndex++}`);
    params.push(userId);
    setClauses.push(`updated_at = NOW()`);

    // Add id to params for WHERE clause
    params.push(id);

    const result = await pool.query(`
      UPDATE ${metadataTableName}
      SET ${setClauses.join(", ")}
      WHERE id = $${paramIndex}
      RETURNING 
        id, table_name as "tableName", description, category, columns,
        is_editable as "isEditable", is_system_table as "isSystemTable",
        is_active as "isActive", metadata, created_by as "createdBy",
        updated_by as "updatedBy", created_at as "createdAt", updated_at as "updatedAt"
    `, params);

    const table = result.rows[0];

    console.log(`[Custom Tables API] Updated table metadata ${id} in schema "${schemaName}" for tenant ${tenantId}`);

    res.json({ 
      table,
      sqlTableAltered,
    });
  } catch (error: any) {
    console.error("[Custom Tables API] Error updating table:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: "Validation error",
        details: error.errors 
      });
    }
    res.status(500).json({ 
      error: "Failed to update custom table",
      details: error.message 
    });
  }
});

/**
 * DELETE /api/custom-tables/:id
 * Delete a custom table (in tenant's schema)
 * By default, hard deletes: drops the SQL table and removes metadata
 * Query params: ?softDelete=true to archive instead (rename table, mark as deleted)
 */
router.delete("/:id", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id || (req.session as any)?.userId;
    const { id } = req.params;
    // Default to hard delete (drop table + remove metadata)
    const softDelete = req.query.softDelete === "true";
    const hardDelete = !softDelete;

    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Get tenant's schema name
    const schemaName = await getTenantSchemaName(tenantId);
    
    if (!schemaName) {
      return res.status(400).json({ error: "Tenant schema not found" });
    }

    const metadataTableName = `"${schemaName}"."custom_tables"`;

    // Check if table exists and is deletable (no environment filter)
    const existingCheck = await pool.query(`
      SELECT id, table_name as "tableName", is_editable as "isEditable", is_system_table as "isSystemTable"
      FROM ${metadataTableName}
      WHERE id = $1 AND tenant_id = $2
      LIMIT 1
    `, [id, tenantId]);

    if (existingCheck.rows.length === 0) {
      return res.status(404).json({ error: "Custom table not found" });
    }

    const existing = existingCheck.rows[0];

    // Always drop the physical SQL table (for both soft and hard delete)
    // Soft delete keeps metadata, hard delete removes metadata
    let sqlTableDropped = false;
    const sqlService = new CustomTableSqlService(schemaName);
    const tableExists = await sqlService.tableExists(existing.tableName);
    
    if (tableExists) {
      try {
        await sqlService.dropTable(existing.tableName);
        sqlTableDropped = true;
        console.log(`[Custom Tables API] Dropped SQL table "${existing.tableName}" in schema "${schemaName}"`);
      } catch (sqlError: any) {
        console.error("[Custom Tables API] Error dropping SQL table:", sqlError);
        // Continue with metadata operation even if SQL table drop fails
        // The table might have dependencies or other issues
      }
    }

    // Soft delete or hard delete metadata
    if (hardDelete) {
      await pool.query(`
        DELETE FROM ${metadataTableName}
        WHERE id = $1
      `, [id]);
    } else {
      await pool.query(`
        UPDATE ${metadataTableName}
        SET is_deleted = true, is_active = false, updated_by = $1, updated_at = NOW()
        WHERE id = $2
      `, [userId, id]);
    }

    console.log(`[Custom Tables API] ${hardDelete ? "Hard deleted" : "Archived"} table "${existing.tableName}" (${id}) - SQL dropped: ${sqlTableDropped}, Metadata: ${hardDelete ? "removed" : "kept"}`);

    res.json({ 
      success: true,
      sqlTableDropped,
      metadataKept: !hardDelete, // For soft delete, metadata is preserved
      hardDelete,
      tableName: existing.tableName,
      message: hardDelete 
        ? `Table "${existing.tableName}" permanently deleted` 
        : `Table "${existing.tableName}" archived (SQL dropped, metadata preserved for restore)`,
    });
  } catch (error: any) {
    console.error("[Custom Tables API] Error deleting table:", error);
    res.status(500).json({ 
      error: "Failed to delete custom table",
      details: error.message 
    });
  }
});

/**
 * GET /api/custom-tables/:id/structure
 * Get the actual SQL table structure (columns from PostgreSQL)
 */
router.get("/:id/structure", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const { id } = req.params;

    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Get tenant's schema name
    const schemaName = await getTenantSchemaName(tenantId);
    
    if (!schemaName) {
      return res.status(400).json({ error: "Tenant schema not found" });
    }

    const metadataTableName = `"${schemaName}"."custom_tables"`;

    // Get table metadata (no environment filter)
    const metadataResult = await pool.query(`
      SELECT table_name as "tableName", columns
      FROM ${metadataTableName}
      WHERE id = $1 AND tenant_id = $2
      LIMIT 1
    `, [id, tenantId]);

    if (metadataResult.rows.length === 0) {
      return res.status(404).json({ error: "Custom table not found" });
    }

    const metadata = metadataResult.rows[0];
    const sqlService = new CustomTableSqlService(schemaName);
    
    // Check if physical table exists
    const tableExists = await sqlService.tableExists(metadata.tableName);
    
    if (!tableExists) {
      return res.json({
        tableName: metadata.tableName,
        exists: false,
        metadataColumns: metadata.columns || [],
        sqlColumns: [],
      });
    }

    // Get actual SQL table structure
    const sqlColumns = await sqlService.getTableStructure(metadata.tableName);

    res.json({
      tableName: metadata.tableName,
      exists: true,
      metadataColumns: metadata.columns || [],
      sqlColumns,
    });
  } catch (error: any) {
    console.error("[Custom Tables API] Error getting table structure:", error);
    res.status(500).json({ 
      error: "Failed to get table structure",
      details: error.message 
    });
  }
});

/**
 * POST /api/custom-tables/:id/sync
 * Sync the SQL table structure with metadata
 * Creates or alters the SQL table to match metadata columns
 */
router.post("/:id/sync", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id || (req.session as any)?.userId;
    const { id } = req.params;

    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Get tenant's schema name
    const schemaName = await getTenantSchemaName(tenantId);
    
    if (!schemaName) {
      return res.status(400).json({ error: "Tenant schema not found" });
    }

    const metadataTableName = `"${schemaName}"."custom_tables"`;

    // Get table metadata (no environment filter)
    const metadataResult = await pool.query(`
      SELECT table_name as "tableName", columns, is_editable as "isEditable", is_system_table as "isSystemTable"
      FROM ${metadataTableName}
      WHERE id = $1 AND tenant_id = $2
      LIMIT 1
    `, [id, tenantId]);

    if (metadataResult.rows.length === 0) {
      return res.status(404).json({ error: "Custom table not found" });
    }

    const metadata = metadataResult.rows[0];

    if (!metadata.isEditable || metadata.isSystemTable) {
      return res.status(403).json({ error: "This table cannot be synced" });
    }

    const columns = metadata.columns || [];
    if (columns.length === 0) {
      return res.status(400).json({ error: "No columns defined in metadata" });
    }

    const sqlService = new CustomTableSqlService(schemaName);
    
    // Validate columns
    const validation = sqlService.validateColumns(columns as ColumnDefinition[]);
    if (!validation.valid) {
      return res.status(400).json({
        error: "Column validation failed",
        details: validation.errors,
      });
    }

    const tableExists = await sqlService.tableExists(metadata.tableName);
    
    let action: "created" | "altered";
    if (tableExists) {
      await sqlService.alterTable(metadata.tableName, columns as ColumnDefinition[]);
      action = "altered";
    } else {
      await sqlService.createTable(metadata.tableName, columns as ColumnDefinition[]);
      action = "created";
    }

    // Get updated structure
    const sqlColumns = await sqlService.getTableStructure(metadata.tableName);

    console.log(`[Custom Tables API] Synced SQL table "${metadata.tableName}" (${action}) in schema "${schemaName}" for tenant ${tenantId}`);

    res.json({
      success: true,
      action,
      tableName: metadata.tableName,
      sqlColumns,
    });
  } catch (error: any) {
    console.error("[Custom Tables API] Error syncing table:", error);
    res.status(500).json({ 
      error: "Failed to sync table",
      details: error.message 
    });
  }
});

/**
 * POST /api/custom-tables/:id/restore
 * Restore an archived table (is_active = false) back to active state
 * Also recreates the physical SQL table from stored column definitions
 * Works for both editable and system tables (module tables)
 */
router.post("/:id/restore", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id;
    const { id } = req.params;

    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Get tenant's schema name
    const schemaName = await getTenantSchemaName(tenantId);
    
    if (!schemaName) {
      return res.status(400).json({ 
        error: "Tenant schema not found",
        details: "Please contact support to set up your tenant schema."
      });
    }

    const metadataTableName = `"${schemaName}"."custom_tables"`;

    // Get table metadata (including archived tables)
    const metadataResult = await pool.query(`
      SELECT 
        id, table_name as "tableName", columns, 
        is_active as "isActive", is_deleted as "isDeleted",
        is_editable as "isEditable", is_system_table as "isSystemTable",
        description, category, metadata
      FROM ${metadataTableName}
      WHERE id = $1 AND tenant_id = $2
      LIMIT 1
    `, [id, tenantId]);

    if (metadataResult.rows.length === 0) {
      return res.status(404).json({ error: "Custom table not found" });
    }

    const tableRecord = metadataResult.rows[0];

    // Check if table is actually archived
    if (tableRecord.isActive && !tableRecord.isDeleted) {
      return res.status(400).json({ error: "This table is already active" });
    }

    const columns = tableRecord.columns || [];
    if (columns.length === 0) {
      return res.status(400).json({ error: "No columns defined - cannot restore SQL table" });
    }

    const sqlService = new CustomTableSqlService(schemaName);
    
    // Validate columns
    const validation = sqlService.validateColumns(columns as ColumnDefinition[]);
    if (!validation.valid) {
      return res.status(400).json({
        error: "Column validation failed",
        details: validation.errors,
      });
    }

    // Check if physical table exists (might have been renamed with _deleted suffix)
    const tableExists = await sqlService.tableExists(tableRecord.tableName);
    
    let sqlAction: "created" | "restored" = "created";
    if (!tableExists) {
      // Create the SQL table
      await sqlService.createTable(tableRecord.tableName, columns as ColumnDefinition[]);
      sqlAction = "created";
      console.log(`[Custom Tables API] Created SQL table "${tableRecord.tableName}" for restore`);
    } else {
      // Table exists - just sync columns
      await sqlService.alterTable(tableRecord.tableName, columns as ColumnDefinition[]);
      sqlAction = "restored";
      console.log(`[Custom Tables API] SQL table "${tableRecord.tableName}" already exists, synced columns`);
    }

    // Update metadata to mark as active
    const updateResult = await pool.query(`
      UPDATE ${metadataTableName}
      SET is_active = true, is_deleted = false, updated_at = NOW(), updated_by = $1
      WHERE id = $2
      RETURNING 
        id, table_name as "tableName", description, category, columns,
        is_editable as "isEditable", is_system_table as "isSystemTable",
        is_active as "isActive", metadata, created_by as "createdBy",
        updated_by as "updatedBy", created_at as "createdAt", updated_at as "updatedAt"
    `, [userId, id]);

    const restoredTable = updateResult.rows[0];

    console.log(`[Custom Tables API] Restored table "${tableRecord.tableName}" (SQL ${sqlAction}) for tenant ${tenantId}`);

    res.json({
      success: true,
      table: restoredTable,
      tableName: tableRecord.tableName,
      sqlAction,
      message: `Table "${tableRecord.tableName}" has been restored`,
    });
  } catch (error: any) {
    console.error("[Custom Tables API] Error restoring table:", error);
    res.status(500).json({ 
      error: "Failed to restore table",
      details: error.message 
    });
  }
});

export default router;
