/**
 * ProjetosQueryBuilder - Cross-module data access for projects
 * 
 * Implements ModuleQueryBuilder with support for:
 * - Project filtering by status, priority, client
 * - Phase tracking and progress queries
 * - Resource allocation queries
 * - Document management queries
 * - Custom entities via customEntityRecords
 */

import type { ModuleQueryBuilder, Filter } from '../base/module.interface';
import { db } from '../../../apps/api/db';
import { 
  projects, 
  projectPhases, 
  projectResources, 
  projectDocuments,
  customEntityRecords 
} from '../../../shared/schema';
import { eq, and, or, gt, gte, lt, lte, inArray, like, ilike, sql } from 'drizzle-orm';
import { tenantSchemaService } from '../../../apps/api/services/tenant-schema.service';

export class ProjetosQueryBuilder implements ModuleQueryBuilder {
  private tenantId: string;
  private entityName?: string;
  private filters: Filter[] = [];
  private orderField?: string;
  private orderDirection: 'asc' | 'desc' = 'asc';
  private limitValue?: number;
  private offsetValue?: number;

  constructor(tenantId: string) {
    this.tenantId = tenantId;
  }

  select(entityName: string): this {
    this.entityName = entityName;
    return this;
  }

  where(filters: Filter[]): this {
    this.filters = filters;
    return this;
  }

  orderBy(field: string, direction: 'asc' | 'desc' = 'asc'): this {
    this.orderField = field;
    this.orderDirection = direction;
    return this;
  }

  limit(limit: number): this {
    this.limitValue = limit;
    return this;
  }

  offset(offset: number): this {
    this.offsetValue = offset;
    return this;
  }

  /**
   * Map entity name to table name
   * Complete mapping for all 23 Projects module tables
   */
  private getTableInfo(): { tableName: string; isCustom: boolean } {
    const mapping: Record<string, string> = {
      // Core Projects (5)
      'projects': 'projects',
      'projects_config': 'projects_config',
      'project_states': 'project_states',
      'project_templates': 'project_templates',
      'project_embeddings': 'project_embeddings',
      
      // Project Structure (4)
      'project_phases': 'project_phases',
      'phases': 'project_phases', // alias
      'project_tasks': 'project_tasks',
      'tasks': 'project_tasks', // alias
      'project_milestones': 'project_milestones',
      'milestones': 'project_milestones', // alias
      'project_deliverables': 'project_deliverables',
      'deliverables': 'project_deliverables', // alias
      
      // Project Resources & Team (4)
      'project_team_members': 'project_team_members',
      'team': 'project_team_members', // alias
      'project_resource_allocations': 'project_resource_allocations',
      'resources': 'project_resource_allocations', // alias
      'project_time_entries': 'project_time_entries',
      'time_entries': 'project_time_entries', // alias
      'project_expenses': 'project_expenses',
      'expenses': 'project_expenses', // alias
      
      // Project Documents & Approvals (3)
      'project_documents': 'project_documents',
      'documents': 'project_documents', // alias
      'project_approvals': 'project_approvals',
      'approvals': 'project_approvals', // alias
      'project_activity_logs': 'project_activity_logs',
      'activity_logs': 'project_activity_logs', // alias
      
      // Project Governance (4)
      'project_risks': 'project_risks',
      'risks': 'project_risks', // alias
      'project_issues': 'project_issues',
      'issues': 'project_issues', // alias
      'project_change_requests': 'project_change_requests',
      'change_requests': 'project_change_requests', // alias
      'project_decisions': 'project_decisions',
      'decisions': 'project_decisions', // alias
      
      // Project Commercial (3)
      'project_contracts': 'project_contracts',
      'project_purchases': 'project_purchases',
      'project_menu_items': 'project_menu_items',
    };
    
    const tableName = mapping[this.entityName!];
    
    if (tableName) {
      return { tableName, isCustom: false };
    }
    
    // Default to custom entities for unknown tables
    return { tableName: 'custom_entity_records', isCustom: true };
  }

  private buildSQLCondition(filter: Filter, isCustom: boolean): string | null {
    // Validate field name to prevent SQL injection
    if (!/^[a-zA-Z0-9_-]+$/.test(filter.field)) {
      console.error(`[ProjetosQueryBuilder] Invalid field name: ${filter.field}`);
      return null;
    }

    if (isCustom) {
      // For custom entities, query the JSONB data field
      const jsonValue = typeof filter.value === 'string' 
        ? `'${filter.value.replace(/'/g, "''")}'` 
        : filter.value;

      switch (filter.operator) {
        case 'eq':
          return `(data->>'${filter.field}') = ${jsonValue}`;
        case 'like':
        case 'ilike':
          return `(data->>'${filter.field}') ILIKE '%${filter.value}%'`;
        case 'gt':
          return `(data->>'${filter.field}')::numeric > ${filter.value}`;
        case 'gte':
          return `(data->>'${filter.field}')::numeric >= ${filter.value}`;
        case 'lt':
          return `(data->>'${filter.field}')::numeric < ${filter.value}`;
        case 'lte':
          return `(data->>'${filter.field}')::numeric <= ${filter.value}`;
        default:
          return null;
      }
    } else {
      // For core entities, standard field queries
      const value = typeof filter.value === 'string' 
        ? `'${filter.value.replace(/'/g, "''")}'` 
        : filter.value;

      switch (filter.operator) {
        case 'eq':
          return `${filter.field} = ${value}`;
        case 'ne':
          return `${filter.field} != ${value}`;
        case 'gt':
          return `${filter.field} > ${value}`;
        case 'gte':
          return `${filter.field} >= ${value}`;
        case 'lt':
          return `${filter.field} < ${value}`;
        case 'lte':
          return `${filter.field} <= ${value}`;
        case 'like':
        case 'ilike':
          return `${filter.field} ILIKE '%${filter.value}%'`;
        case 'in':
          const values = Array.isArray(filter.value) ? filter.value : [filter.value];
          const escapedValues = values.map(v => 
            typeof v === 'string' ? `'${v.replace(/'/g, "''")}'` : v
          ).join(', ');
          return `${filter.field} IN (${escapedValues})`;
        default:
          return null;
      }
    }
  }
  

  async execute(schema?: string): Promise<any[]> {
    if (!this.entityName) {
      throw new Error('Entity name not specified. Call select() first.');
    }

    // Auto-resolve tenant schema if not provided
    const targetSchema = schema || await tenantSchemaService.getTenantSchemaName(this.tenantId) || 'public';
    const { tableName, isCustom } = this.getTableInfo();
    
    // Build WHERE conditions
    const conditions = [`tenant_id = '${this.tenantId}'`];
    
    // For custom entities, also filter by category and entityKey
    if (isCustom) {
      conditions.push(`category = 'projetos'`);
      conditions.push(`entity_key = '${this.entityName}'`);
    }
    
    // Apply filters
    for (const filter of this.filters) {
      const condition = this.buildSQLCondition(filter, isCustom);
      if (condition) {
        conditions.push(condition);
      }
    }
    
    // Build query
    let query = `SELECT * FROM "${targetSchema}"."${tableName}"`;
    
    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }
    
    // Apply ORDER BY
    if (this.orderField) {
      if (isCustom) {
        // For custom entities, order by JSONB field
        query += ` ORDER BY (data->>'${this.orderField}') ${this.orderDirection.toUpperCase()}`;
      } else {
        // For core entities, order by column
        query += ` ORDER BY ${this.orderField} ${this.orderDirection.toUpperCase()}`;
      }
    }
    
    // Apply LIMIT
    if (this.limitValue !== undefined && this.limitValue > 0) {
      query += ` LIMIT ${this.limitValue}`;
    }
    
    // Apply OFFSET
    if (this.offsetValue !== undefined && this.offsetValue > 0) {
      query += ` OFFSET ${this.offsetValue}`;
    }
    
    const result = await db.execute(sql.raw(query));
    return result.rows as any[];
  }

  async count(schema?: string): Promise<number> {
    if (!this.entityName) {
      throw new Error('Entity name not specified. Call select() first.');
    }

    // Auto-resolve tenant schema if not provided
    const targetSchema = schema || await tenantSchemaService.getTenantSchemaName(this.tenantId) || 'public';
    const { tableName, isCustom } = this.getTableInfo();
    
    // Build WHERE conditions
    const conditions = [`tenant_id = '${this.tenantId}'`];
    
    // For custom entities, also filter by category and entityKey
    if (isCustom) {
      conditions.push(`category = 'projetos'`);
      conditions.push(`entity_key = '${this.entityName}'`);
    }
    
    // Apply filters
    for (const filter of this.filters) {
      const condition = this.buildSQLCondition(filter, isCustom);
      if (condition) {
        conditions.push(condition);
      }
    }
    
    let query = `SELECT COUNT(*) as count FROM "${targetSchema}"."${tableName}"`;
    
    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }
    
    return Number(result[0]?.count || 0);
  }
}
