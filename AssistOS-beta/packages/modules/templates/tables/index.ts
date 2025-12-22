import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// ESM equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface ColumnDefinition {
  name: string;
  type: string;
  nullable: boolean;
  primaryKey?: boolean;
  unique?: boolean;
  default?: string;
  foreignKey?: {
    table: string;
    column: string;
    onDelete?: string;
  };
}

export interface IndexDefinition {
  name: string;
  columns: string[];
  unique?: boolean;
}

export interface TableDefinition {
  tableName: string;
  description?: string;
  columns: ColumnDefinition[];
  indexes?: IndexDefinition[];
}

export interface ModuleTableDefinition {
  moduleId: string;
  displayName: string;
  // Support both old format (string[]) and new format (Record<string, TableDefinition>)
  tables: string[] | Record<string, TableDefinition>;
}

// Module ID normalization map
const MODULE_ID_ALIASES: Record<string, string> = {
  // English IDs
  'financial': 'financial',
  'finance': 'financial',
  'accounting': 'accounting',
  'purchasing': 'purchasing',
  'crm': 'crm',
  'inventory': 'inventory',
  'sales': 'sales',
  'projects': 'projects',
  'lead-generation': 'lead-generation',
  'logistics': 'logistics',
  'hr': 'hr',
  'human-resources': 'hr',
  'production': 'production',
  'manufacturing': 'production',
  // Portuguese IDs
  'financeiro': 'financial',
  'contabilidade': 'accounting',
  'compras': 'purchasing',
  'comercial': 'crm',
  'inventario': 'inventory',  // Portuguese alias for inventory
  'estoque': 'inventory',
  'vendas': 'sales',
  'projetos': 'projects',
  'logistica': 'logistics',
  'rh': 'hr',
  'recursos-humanos': 'hr',
  'producao': 'production',
};

/**
 * Normalize module ID to match JSON file name
 */
export function normalizeModuleId(moduleId: string): string {
  return MODULE_ID_ALIASES[moduleId.toLowerCase()] || moduleId.toLowerCase();
}

/**
 * Load module table definition from JSON file
 */
export function loadModuleTableDefinition(moduleId: string): ModuleTableDefinition | null {
  const normalizedId = normalizeModuleId(moduleId);
  const jsonPath = path.join(__dirname, `${normalizedId}.json`);
  
  try {
    if (fs.existsSync(jsonPath)) {
      const content = fs.readFileSync(jsonPath, 'utf-8');
      return JSON.parse(content) as ModuleTableDefinition;
    }
  } catch (error) {
    console.error(`[ModuleTableLoader] Failed to load ${normalizedId}.json:`, error);
  }
  
  return null;
}

/**
 * Get table list for a module (just table names)
 */
export function getModuleTableList(moduleId: string): string[] {
  const definition = loadModuleTableDefinition(moduleId);
  if (!definition) return [];
  
  // Handle both old format (string[]) and new format (Record<string, TableDefinition>)
  if (Array.isArray(definition.tables)) {
    return definition.tables;
  } else {
    return Object.keys(definition.tables);
  }
}

/**
 * Get full table definitions for a module
 */
export function getModuleTableDefinitions(moduleId: string): Record<string, TableDefinition> {
  const definition = loadModuleTableDefinition(moduleId);
  if (!definition) return {};
  
  // Handle both old format and new format
  if (Array.isArray(definition.tables)) {
    // Old format - return empty (tables will be copied from public schema)
    return {};
  } else {
    return definition.tables;
  }
}

/**
 * Get a specific table definition
 */
export function getTableDefinition(moduleId: string, tableName: string): TableDefinition | null {
  const definitions = getModuleTableDefinitions(moduleId);
  return definitions[tableName] || null;
}

/**
 * Check if module has full column definitions (new format)
 */
export function hasColumnDefinitions(moduleId: string): boolean {
  const definition = loadModuleTableDefinition(moduleId);
  if (!definition) return false;
  return !Array.isArray(definition.tables);
}

/**
 * Generate CREATE TABLE SQL from table definition
 */
export function generateCreateTableSQL(
  tableDef: TableDefinition, 
  schemaName: string
): string {
  const columnDefs = tableDef.columns.map(col => {
    let def = `"${col.name}" ${mapToPostgresType(col.type)}`;
    
    if (!col.nullable) {
      def += ' NOT NULL';
    }
    
    if (col.primaryKey) {
      def += ' PRIMARY KEY';
    }
    
    if (col.unique && !col.primaryKey) {
      def += ' UNIQUE';
    }
    
    if (col.default) {
      def += ` DEFAULT ${col.default}`;
    }
    
    return def;
  }).join(',\n    ');

  let sql = `CREATE TABLE IF NOT EXISTS "${schemaName}"."${tableDef.tableName}" (\n    ${columnDefs}\n)`;

  return sql;
}

/**
 * Generate CREATE INDEX SQL statements
 */
export function generateIndexSQL(
  tableDef: TableDefinition,
  schemaName: string
): string[] {
  if (!tableDef.indexes) return [];
  
  return tableDef.indexes.map(idx => {
    const unique = idx.unique ? 'UNIQUE ' : '';
    const columns = idx.columns.map(c => `"${c}"`).join(', ');
    return `CREATE ${unique}INDEX IF NOT EXISTS "${idx.name}" ON "${schemaName}"."${tableDef.tableName}" (${columns})`;
  });
}

/**
 * Map JSON type to PostgreSQL type
 */
function mapToPostgresType(type: string): string {
  const typeMap: Record<string, string> = {
    'uuid': 'UUID',
    'text': 'TEXT',
    'varchar': 'VARCHAR',
    'integer': 'INTEGER',
    'bigint': 'BIGINT',
    'boolean': 'BOOLEAN',
    'date': 'DATE',
    'timestamp': 'TIMESTAMP',
    'jsonb': 'JSONB',
    'json': 'JSON',
  };
  
  // Handle types with parameters like varchar(255), decimal(10,2)
  const match = type.match(/^(\w+)(\(.+\))?$/);
  if (match) {
    const baseType = match[1].toLowerCase();
    const params = match[2] || '';
    const mappedType = typeMap[baseType] || baseType.toUpperCase();
    return mappedType + params.toUpperCase();
  }
  
  return typeMap[type.toLowerCase()] || type.toUpperCase();
}

/**
 * Load all module table definitions
 */
export function loadAllModuleTableDefinitions(): Record<string, ModuleTableDefinition> {
  const definitions: Record<string, ModuleTableDefinition> = {};
  const tablesDir = __dirname;
  
  try {
    const files = fs.readdirSync(tablesDir).filter(f => f.endsWith('.json'));
    
    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(tablesDir, file), 'utf-8');
        const definition = JSON.parse(content) as ModuleTableDefinition;
        definitions[definition.moduleId] = definition;
      } catch (error) {
        console.error(`[ModuleTableLoader] Failed to load ${file}:`, error);
      }
    }
  } catch (error) {
    console.error('[ModuleTableLoader] Failed to read tables directory:', error);
  }
  
  return definitions;
}

/**
 * Get all module IDs that have table definitions
 */
export function getAvailableModuleIds(): string[] {
  const definitions = loadAllModuleTableDefinitions();
  return Object.keys(definitions);
}

// Pre-load all definitions for quick access
let cachedDefinitions: Record<string, ModuleTableDefinition> | null = null;

/**
 * Get cached module table definitions (loads once)
 */
export function getCachedModuleTableDefinitions(): Record<string, ModuleTableDefinition> {
  if (!cachedDefinitions) {
    cachedDefinitions = loadAllModuleTableDefinitions();
  }
  return cachedDefinitions;
}

/**
 * Clear the cached definitions (useful for testing or hot reload)
 */
export function clearModuleTableCache(): void {
  cachedDefinitions = null;
}
