/**
 * CRUD Record Node Executor
 * 
 * Performs CRUD operations on database records.
 * Phase 1 supports: CREATE, READ, UPDATE, DELETE
 * 
 * Configuration:
 * - operation: 'create' | 'read' | 'update' | 'delete'
 * - moduleId: Target module/table
 * - recordData: Data for create/update
 * - filters: Conditions for read/update/delete
 * - recordId: Direct record ID (optional)
 */

import { db, pool } from '../../../db.js';
import { tenantSchemas } from '../../../../../shared/schema.js';
import { eq } from 'drizzle-orm';
import type { AssistBuildNode } from '../../../../../shared/schema.js';
import logger from '../../../../api/logger.js';

interface ExecutionContext {
  workflowId: string;
  executionId: string;
  tenantId: string;
  userId: string;
  environment: 'sandbox' | 'production';
  variables: Record<string, any>;
  triggerData?: any;
}

interface CrudRecordConfig {
  operation: 'create' | 'read' | 'update' | 'delete';
  moduleId: string;
  recordData?: Record<string, any>;
  filters?: Record<string, any>;
  recordId?: string;
  outputVariable?: string;
}

export class CrudRecordExecutor {
  /**
   * Get tenant schema name from tenant_schemas table
   */
  private async getTenantSchemaName(tenantId: string): Promise<string> {
    const [schema] = await db
      .select({ schemaName: tenantSchemas.schemaName })
      .from(tenantSchemas)
      .where(eq(tenantSchemas.tenantId, tenantId))
      .limit(1);

    if (!schema) {
      // Fallback to public schema for testing/development
      logger.warn({ tenantId }, '[CrudRecordExecutor] No schema found, using public');
      return 'public';
    }

    return schema.schemaName;
  }

  async execute(
    node: AssistBuildNode,
    context: ExecutionContext
  ): Promise<{ success: boolean; output?: any; error?: string }> {
    const { executionId, tenantId, environment } = context;
    const config = node.config as CrudRecordConfig;

    logger.info(
      {
        executionId,
        nodeId: node.id,
        rawConfig: node.config,
        contextVariables: context.variables,
        triggerData: context.triggerData,
        hasRecordData: !!(node.config as any).recordData,
        hasData: !!(node.config as any).data
      },
      '[CrudRecordExecutor] 🚨 DEBUG: Node config and context'
    );
    
    logger.info(
      { 
        executionId, 
        nodeId: node.id, 
        operation: config.operation,
        moduleId: config.moduleId,
        environment,
        rawConfig: node.config,
        contextVariables: context.variables
      },
      '[CrudRecordExecutor] Executing CRUD operation'
    );

    try {
      // Get tenant schema name
      const schemaName = await this.getTenantSchemaName(tenantId);
      
      let result: any;

      switch (config.operation) {
        case 'create':
          result = await this.createRecord(config, tenantId, schemaName);
          break;
        case 'read':
          result = await this.readRecord(config, tenantId, schemaName);
          break;
        case 'update':
          result = await this.updateRecord(config, tenantId, schemaName);
          break;
        case 'delete':
          result = await this.deleteRecord(config, tenantId, schemaName);
          break;
        default:
          throw new Error(`Unsupported operation: ${config.operation}`);
      }

      // Store result in context variables if outputVariable is specified
      if (config.outputVariable) {
        context.variables[config.outputVariable] = result;
      }

      logger.info(
        { 
          executionId, 
          nodeId: node.id, 
          operation: config.operation,
          recordCount: Array.isArray(result) ? result.length : 1,
        },
        '[CrudRecordExecutor] ✅ CRUD operation completed'
      );

      return {
        success: true,
        output: result,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorDetails = error instanceof Error && (error as any).detail 
        ? (error as any).detail 
        : undefined;
      
      logger.error(
        { 
          error: {
            message: errorMessage,
            detail: errorDetails,
            code: (error as any).code,
            constraint: (error as any).constraint,
          },
          executionId, 
          nodeId: node.id, 
          operation: config.operation,
        },
        '[CrudRecordExecutor] ❌ CRUD operation failed'
      );

      return {
        success: false,
        error: errorDetails ? `${errorMessage}: ${errorDetails}` : errorMessage,
      };
    }
  }

  /**
   * CREATE operation - Insert new record
   */
  private async createRecord(config: CrudRecordConfig, tenantId: string, schemaName: string): Promise<any> {
    // Support both 'recordData' and 'data' field names
    let recordData = config.recordData || (config as any).data;
    
    if (!recordData) {
      throw new Error('recordData is required for create operation');
    }

    // Get table info to determine schema
    const { tableName, isPublicSchema } = this.getTableInfo(config.moduleId || (config as any).entity);
    const fullTableName = isPublicSchema 
      ? `"public"."${tableName}"` 
      : `"${schemaName}"."${tableName}"`;
    
    // Only add tenant_id for tenant schema tables
    const data = isPublicSchema 
      ? { ...recordData }
      : { ...recordData, tenant_id: tenantId };

    const columns = Object.keys(data).map(c => `"${c}"`).join(', ');
    const values = Object.values(data);
    const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');

    const queryText = `
      INSERT INTO ${fullTableName} (${columns})
      VALUES (${placeholders})
      RETURNING *
    `;

    const result = await pool.query(queryText, values);
    return result.rows[0];
  }

  /**
   * READ operation - Query records
   */
  private async readRecord(config: CrudRecordConfig, tenantId: string, schemaName: string): Promise<any> {
    const { tableName, isPublicSchema } = this.getTableInfo(config.moduleId || (config as any).entity);
    const fullTableName = isPublicSchema 
      ? `"public"."${tableName}"` 
      : `"${schemaName}"."${tableName}"`;

    if (config.recordId) {
      // Read single record by ID
      let queryText: string;
      let params: any[];
      
      if (isPublicSchema) {
        queryText = `SELECT * FROM ${fullTableName} WHERE id = $1 LIMIT 1`;
        params = [config.recordId];
      } else {
        queryText = `SELECT * FROM ${fullTableName} WHERE id = $1 AND tenant_id = $2 LIMIT 1`;
        params = [config.recordId, tenantId];
      }
      
      const result = await pool.query(queryText, params);
      return result.rows[0] || null;
    }

    // Read multiple records with filters
    let whereClause = '';
    const params: any[] = [];
    let paramIndex = 1;

    // Add tenant_id filter only for tenant schema tables
    if (!isPublicSchema) {
      whereClause = 'tenant_id = $1';
      params.push(tenantId);
      paramIndex = 2;
    }

    if (config.filters) {
      for (const [key, value] of Object.entries(config.filters)) {
        const condition = `"${key}" = $${paramIndex}`;
        whereClause = whereClause ? `${whereClause} AND ${condition}` : condition;
        params.push(value);
        paramIndex++;
      }
    }

    const queryText = `
      SELECT * FROM ${fullTableName}
      ${whereClause ? `WHERE ${whereClause}` : ''}
      LIMIT 100
    `;

    const result = await pool.query(queryText, params);
    return result.rows;
  }

  /**
   * UPDATE operation - Modify existing record
   */
  private async updateRecord(config: CrudRecordConfig, tenantId: string, schemaName: string): Promise<any> {
    // Support both 'recordData' and 'data' field names
    const recordData = config.recordData || (config as any).data;
    if (!recordData) {
      throw new Error('recordData is required for update operation');
    }

    const { tableName, isPublicSchema } = this.getTableInfo(config.moduleId || (config as any).entity);
    const fullTableName = isPublicSchema 
      ? `"public"."${tableName}"` 
      : `"${schemaName}"."${tableName}"`;
    
    if (config.recordId) {
      // Update single record by ID
      const updates = Object.entries(recordData)
        .map(([key, _], i) => `"${key}" = $${i + 1}`)
        .join(', ');
      
      let queryText: string;
      let values: any[];
      
      if (isPublicSchema) {
        values = [...Object.values(recordData), config.recordId];
        queryText = `
          UPDATE ${fullTableName}
          SET ${updates}, updated_at = NOW()
          WHERE id = $${values.length}
          RETURNING *
        `;
      } else {
        values = [...Object.values(recordData), config.recordId, tenantId];
        queryText = `
          UPDATE ${fullTableName}
          SET ${updates}, updated_at = NOW()
          WHERE id = $${values.length - 1} AND tenant_id = $${values.length}
          RETURNING *
        `;
      }

      const result = await pool.query(queryText, values);
      return result.rows[0];
    }

    throw new Error('recordId is required for update operation');
  }

  /**
   * DELETE operation - Remove record
   */
  private async deleteRecord(config: CrudRecordConfig, tenantId: string, schemaName: string): Promise<any> {
    const { tableName, isPublicSchema } = this.getTableInfo(config.moduleId || (config as any).entity);
    const fullTableName = isPublicSchema 
      ? `"public"."${tableName}"` 
      : `"${schemaName}"."${tableName}"`;

    if (config.recordId) {
      // Delete single record by ID
      let queryText: string;
      let params: any[];
      
      if (isPublicSchema) {
        queryText = `DELETE FROM ${fullTableName} WHERE id = $1 RETURNING *`;
        params = [config.recordId];
      } else {
        queryText = `DELETE FROM ${fullTableName} WHERE id = $1 AND tenant_id = $2 RETURNING *`;
        params = [config.recordId, tenantId];
      }

      const result = await pool.query(queryText, params);
      return result.rows[0];
    }

    throw new Error('recordId is required for delete operation');
  }

  /**
   * Map moduleId to actual table name and determine if it's in public or tenant schema
   */
  private getTableInfo(moduleId: string): { tableName: string; isPublicSchema: boolean } {
    // Tables that exist in public schema (global/platform-wide)
    const publicTables = {
      'users': 'users',
      'tenants': 'tenants',
      'conversations': 'conversations',
      'messages': 'messages',
    };

    // Tables that exist in tenant schemas
    const tenantTables = {
      'clients': 'clients',
      'suppliers': 'suppliers', 
      'orders': 'orders',
      'products': 'products',
      'invoices': 'invoices',
      'projects': 'projects',
      'commercial_leads': 'commercial_leads',
    };

    if (publicTables[moduleId]) {
      return { tableName: publicTables[moduleId], isPublicSchema: true };
    }

    if (tenantTables[moduleId]) {
      return { tableName: tenantTables[moduleId], isPublicSchema: false };
    }

    throw new Error(`Unknown moduleId: ${moduleId}`);
  }
}