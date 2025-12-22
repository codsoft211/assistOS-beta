// AssistBuild Schema Evolution Tools (Gap #3)
// Tools for database schema evolution via AssistBuild conversational UI

import { SchemaEvolutionService } from "../../../apps/api/services/schema-evolution.service";

/**
 * CORE PROTECTION: Platform-level tables that MUST NOT be modified via schema evolution
 * These tables are critical to AssistOS infrastructure and managed via controlled migrations only.
 * 
 * IMPORTANT: All names are normalized to lowercase for case-insensitive comparison.
 */
const PROTECTED_TABLES = new Set([
  'users',
  'tenants',
  'sessions',
  'migrations',
  'schemasnapshots',      // Normalized: schemaSnapshots
  'coreassets',           // Normalized: coreAssets
  'coreassetversions',    // Normalized: coreAssetVersions
  'permissions',
  'roles',
  'userpermissions',      // Normalized: userPermissions
  'userroles',            // Normalized: userRoles
  'apikeys',              // Normalized: apiKeys
  'auditlogs',            // Normalized: auditLogs
]);

/**
 * Validates that schema changes do not affect protected platform tables.
 * Returns error message if protected tables are detected, null otherwise.
 * 
 * CRITICAL: Normalizes table names to lowercase for case-insensitive comparison.
 */
function validateProtectedTables(changes: any[]): string | null {
  const affectedTables = new Set<string>();
  
  for (const change of changes) {
    if (change.tableName) {
      // Normalize to lowercase for case-insensitive comparison
      affectedTables.add(change.tableName.toLowerCase());
    }
  }
  
  const protectedAffected = Array.from(affectedTables).filter(t => PROTECTED_TABLES.has(t));
  
  if (protectedAffected.length > 0) {
    return `CORE PROTECTION VIOLATION: Cannot modify platform tables: ${protectedAffected.join(', ')}. ` +
           `These tables are immutable and managed via controlled migrations only. ` +
           `Contact platform administrators for schema changes to core infrastructure.`;
  }
  
  return null;
}

/**
 * Extracts table names from SQL migration strings.
 * Returns error message if protected tables are detected, null otherwise.
 * 
 * CRITICAL: This is the FINAL protection gate before database mutation.
 * Even if migrations bypass earlier validation (manual insertion, pre-existing migrations),
 * this check prevents core platform tables from being modified.
 */
function validateProtectedTablesInSQL(sqlStatements: string[]): string | null {
  const affectedTables = new Set<string>();
  
  // Regex patterns to extract table names from various SQL operations
  const patterns = [
    /(?:CREATE|ALTER|DROP)\s+TABLE\s+(?:IF\s+(?:NOT\s+)?EXISTS\s+)?["']?(\w+)["']?/gi,
    /(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+["']?(\w+)["']?/gi,
    /(?:TRUNCATE|RENAME)\s+TABLE\s+["']?(\w+)["']?/gi,
  ];
  
  for (const sql of sqlStatements) {
    for (const pattern of patterns) {
      let match;
      pattern.lastIndex = 0; // Reset regex state
      while ((match = pattern.exec(sql)) !== null) {
        if (match[1]) {
          affectedTables.add(match[1].toLowerCase());
        }
      }
    }
  }
  
  const protectedAffected = Array.from(affectedTables).filter(t => PROTECTED_TABLES.has(t));
  
  if (protectedAffected.length > 0) {
    return `CORE PROTECTION VIOLATION: Migration SQL attempts to modify platform tables: ${protectedAffected.join(', ')}. ` +
           `These tables are immutable and managed via controlled migrations only. ` +
           `This migration cannot be applied. Contact platform administrators for core schema changes.`;
  }
  
  return null;
}

/**
 * Schema Evolution Tools for AssistBuild
 * These tools enable AssistBuild to evolve database schemas conversationally
 * 
 * CRITICAL: These tools are ONLY available when Core Protection allows schema changes
 * All schema modifications are tracked, versioned, and reversible
 */
export const schemaEvolutionTools = [
  {
    type: "function" as const,
    function: {
      name: "capture_schema_snapshot",
      description: "Captura um snapshot do schema atual do banco de dados do tenant. Use ANTES de fazer qualquer mudança no schema para criar um ponto de restauro. Retorna informação sobre o schema capturado (versão, timestamp, estatísticas).",
      parameters: {
        type: "object",
        properties: {
          description: {
            type: "string",
            description: "Descrição opcional do snapshot (ex: 'Antes de adicionar módulo CRM')"
          }
        }
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "compare_schema_versions",
      description: "Compara duas versões do schema e retorna as diferenças detalhadas. Use para preview de mudanças antes de aplicar migration. Retorna: tabelas adicionadas/removidas, colunas modificadas, índices alterados, constraints mudados.",
      parameters: {
        type: "object",
        properties: {
          fromVersion: {
            type: "number",
            description: "Versão inicial do schema (número da versão)"
          },
          toVersion: {
            type: "number",
            description: "Versão final do schema para comparação (número da versão)"
          }
        },
        required: ["fromVersion", "toVersion"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "analyze_schema_impact",
      description: "Analisa o impacto de mudanças no schema. Detecta: breaking changes, risco de perda de dados, tempo estimado de downtime, operações de backfill necessárias. Use SEMPRE antes de gerar migration.",
      parameters: {
        type: "object",
        properties: {
          fromVersion: {
            type: "number",
            description: "Versão inicial do schema"
          },
          toVersion: {
            type: "number",
            description: "Versão alvo do schema"
          }
        },
        required: ["fromVersion", "toVersion"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "generate_schema_migration",
      description: "Gera SQL migration (up e down) entre duas versões do schema. IMPORTANTE: Sempre analise o impacto ANTES de gerar migration. Retorna: upSQL (DDL para aplicar), downSQL (DDL para rollback), estimativa de tempo.",
      parameters: {
        type: "object",
        properties: {
          fromVersion: {
            type: "number",
            description: "Versão inicial do schema"
          },
          toVersion: {
            type: "number",
            description: "Versão alvo do schema"
          },
          description: {
            type: "string",
            description: "Descrição da migration (ex: 'Adicionar coluna email à tabela users')"
          }
        },
        required: ["fromVersion", "toVersion"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "apply_schema_migration",
      description: "Aplica uma migration gerada ao banco de dados. WORKFLOW RECOMENDADO: (1) Aplique em SANDBOX primeiro para testar, (2) Valide que funciona corretamente, (3) Aplique em PRODUCTION com confirmProduction: true. SANDBOX PROTECTION ativa: migrations devem ser testadas em sandbox antes de production.",
      parameters: {
        type: "object",
        properties: {
          migrationId: {
            type: "string",
            description: "ID da migration a aplicar (UUID retornado por generate_schema_migration)"
          },
          confirmProduction: {
            type: "boolean",
            description: "Confirmação explícita para aplicar em produção (default: false). OBRIGATÓRIO para production. Migration deve ter sido aplicada com sucesso em sandbox primeiro."
          }
        },
        required: ["migrationId"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "rollback_schema",
      description: "Reverte o schema para uma versão anterior. Executa downSQL das migrations aplicadas. CUIDADO: Pode causar perda de dados se rolling back após inserções. Use apenas se necessário.",
      parameters: {
        type: "object",
        properties: {
          targetVersion: {
            type: "number",
            description: "Versão alvo para rollback (número da versão)"
          },
          confirmRollback: {
            type: "boolean",
            description: "Confirmação explícita para rollback (default: false)"
          }
        },
        required: ["targetVersion"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_schema_version_history",
      description: "Lista o histórico de versões do schema do tenant. Mostra: versão, timestamp, descrição, migrations aplicadas. Use para ver evolução do schema ao longo do tempo.",
      parameters: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Número máximo de versões a retornar (default: 10)"
          }
        }
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_pending_migrations",
      description: "Lista migrations que foram geradas mas ainda não aplicadas. Use para ver migrations em 'pending' status.",
      parameters: {
        type: "object",
        properties: {}
      },
    },
  },
];

/**
 * Helper: Fetch schema snapshot by version number
 */
async function getSnapshotByVersion(
  schemaService: SchemaEvolutionService,
  tenantId: string,
  version: number
) {
  const snapshot = await schemaService.getSnapshot(tenantId, version);
  if (!snapshot) {
    throw new Error(`Snapshot versão ${version} não encontrado para tenant ${tenantId}`);
  }
  return snapshot;
}

/**
 * Execute Schema Evolution Tool
 * Handles execution of schema evolution tools with proper error handling
 * 
 * @param toolName - Name of the schema evolution tool to execute
 * @param args - Tool arguments
 * @param context - Execution context (tenantId, userId, environment)
 */
export async function executeSchemaEvolutionTool(
  toolName: string,
  args: any,
  context: {
    tenantId: string;
    userId: string;
    environment?: 'production' | 'sandbox';
  }
): Promise<any> {
  const { tenantId, userId, environment = 'production' } = context;
  
  // Initialize service
  const schemaService = new SchemaEvolutionService();

  try {
    switch (toolName) {
      case "capture_schema_snapshot": {
        const { description } = args;
        
        // Service requires userId parameter
        const snapshot = await schemaService.captureSnapshot(tenantId, userId, description);
        
        return {
          success: true,
          data: {
            version: snapshot.version,
            timestamp: snapshot.timestamp,
            description: snapshot.metadata?.description,
            tableCount: snapshot.tables.length,
            message: `Schema snapshot v${snapshot.version} capturado com sucesso`,
          }
        };
      }

      case "compare_schema_versions": {
        const { fromVersion, toVersion } = args;
        
        if (typeof fromVersion !== 'number' || typeof toVersion !== 'number') {
          return {
            success: false,
            error: "fromVersion e toVersion devem ser números"
          };
        }

        // Call diff() directly - it loads snapshots internally
        const diff = await schemaService.diff(tenantId, fromVersion, toVersion);
        
        return {
          success: true,
          data: {
            fromVersion: diff.fromVersion,
            toVersion: diff.toVersion,
            summary: diff.summary,
            changes: diff.changes, // CRITICAL: Full change details for AssistBuild
            changesCount: diff.changes.length,
          }
        };
      }

      case "analyze_schema_impact": {
        const { fromVersion, toVersion } = args;
        
        if (typeof fromVersion !== 'number' || typeof toVersion !== 'number') {
          return {
            success: false,
            error: "fromVersion e toVersion devem ser números"
          };
        }

        // Get diff, then analyze impact
        const diff = await schemaService.diff(tenantId, fromVersion, toVersion);
        
        // CORE PROTECTION: Validate no protected tables are affected
        const protectionError = validateProtectedTables(diff.changes);
        if (protectionError) {
          return {
            success: false,
            error: protectionError
          };
        }
        
        const impact = await schemaService.analyzeImpact(diff);
        
        return {
          success: true,
          data: {
            breakingChanges: impact.breakingChanges,
            dataLossRisk: impact.dataLossRisk,
            estimatedDowntime: impact.estimatedDowntime,
            risks: impact.risks, // CRITICAL: Detailed risk analysis for AssistBuild
            recommendations: impact.recommendations, // CRITICAL: Safety recommendations
            affectedQueries: impact.affectedQueries, // CRITICAL: Query impact analysis
            changes: impact.changes, // CRITICAL: Full change details
            recommendedAction: impact.breakingChanges 
              ? "CUIDADO: Esta migration contém breaking changes. Teste em sandbox primeiro!"
              : "Migration parece segura. Considere testar em sandbox antes de produção.",
          }
        };
      }

      case "generate_schema_migration": {
        const { fromVersion, toVersion, description } = args;
        
        if (typeof fromVersion !== 'number' || typeof toVersion !== 'number') {
          return {
            success: false,
            error: "fromVersion e toVersion devem ser números"
          };
        }

        // Full workflow: diff → impact → migration
        const diff = await schemaService.diff(tenantId, fromVersion, toVersion);
        
        // CORE PROTECTION: Validate no protected tables are affected
        const protectionError = validateProtectedTables(diff.changes);
        if (protectionError) {
          return {
            success: false,
            error: protectionError
          };
        }
        
        const impact = await schemaService.analyzeImpact(diff);
        
        const migration = await schemaService.generateMigration(
          tenantId,
          diff,
          impact
        );

        // Calculate SQL hash for integrity verification
        const { calculateSqlHash } = await import("../../../apps/api/services/migration-hash.service");
        const upSqlHash = calculateSqlHash(migration.upSql);
        
        // Update migration with hash
        const { db } = await import("../../../apps/api/db");
        const { migrations } = await import("../../../shared/schema");
        const { eq } = await import("drizzle-orm");
        
        await db.update(migrations)
          .set({ upSqlHash })
          .where(eq(migrations.id, migration.id));
        
        return {
          success: true,
          data: {
            migrationId: migration.id,
            version: migration.version,
            description: migration.description,
            estimatedDuration: migration.estimatedDuration,
            requiresDowntime: migration.requiresDowntime,
            upSqlHash,
            upSqlPreview: migration.upSql[0].substring(0, 500) + '...',
            downSqlPreview: migration.downSql[0].substring(0, 500) + '...',
            message: `Migration ${migration.id} gerada com SQL hash ${upSqlHash.substring(0, 8)}... Use apply_schema_migration para aplicar.`
          }
        };
      }

      case "apply_schema_migration": {
        const { migrationId, confirmProduction = false } = args;
        
        if (!migrationId) {
          return {
            success: false,
            error: "migrationId é obrigatório"
          };
        }

        // Production safety check
        if (environment === 'production' && !confirmProduction) {
          return {
            success: false,
            error: "AVISO: Aplicar migration em produção requer confirmProduction: true. Teste em sandbox primeiro!"
          };
        }

        // Get migration from database
        const { migrations, migrationExecutions } = await import("../../../shared/schema");
        const { db } = await import("../../../apps/api/db");
        const { eq, and } = await import("drizzle-orm");
        
        const migrationRecord = await db.query.migrations.findFirst({
          where: and(
            eq(migrations.id, migrationId),
            eq(migrations.tenantId, tenantId)
          )
        });

        if (!migrationRecord) {
          return {
            success: false,
            error: `Migration ${migrationId} não encontrada`
          };
        }

        // Calculate current SQL hash
        const { calculateSqlHash } = await import("../../../apps/api/services/migration-hash.service");
        const upSql = migrationRecord.upSql as string[];
        const currentHash = calculateSqlHash(upSql);

        // SANDBOX VALIDATION: If applying to production, verify it was tested in sandbox first
        if (environment === 'production') {
          // Check if migration was successfully applied in sandbox
          const sandboxExecution = await db.query.migrationExecutions.findFirst({
            where: and(
              eq(migrationExecutions.migrationId, migrationId),
              eq(migrationExecutions.tenantId, tenantId),
              eq(migrationExecutions.environment, 'sandbox'),
              eq(migrationExecutions.status, 'applied')
            ),
            orderBy: (exec, { desc }) => [desc(exec.executedAt)]
          });

          if (!sandboxExecution) {
            return {
              success: false,
              error: "SANDBOX PROTECTION: Migration deve ser testada em sandbox antes de production. " +
                     "Aplique primeiro em sandbox com environment='sandbox', valide que funciona, " +
                     "e então aplique em production."
            };
          }

          // SQL HASH VALIDATION: Verify SQL wasn't modified after sandbox testing
          if (sandboxExecution.upSqlHash !== currentHash) {
            return {
              success: false,
              error: "SQL MUTATION DETECTED: O SQL da migration foi modificado após testing em sandbox. " +
                     `Hash sandbox: ${sandboxExecution.upSqlHash.substring(0, 8)}... ` +
                     `Hash atual: ${currentHash.substring(0, 8)}... ` +
                     "Por segurança, você deve re-testar em sandbox antes de aplicar em production."
            };
          }
        }

        // CORE PROTECTION: FINAL GATE - Validate migration SQL doesn't touch protected tables
        const protectionError = validateProtectedTablesInSQL(upSql);
        if (protectionError) {
          return {
            success: false,
            error: protectionError
          };
        }

        // Apply migration in correct environment
        await schemaService.applyMigration(tenantId, migrationRecord as any, environment);

        // Create execution record
        await db.insert(migrationExecutions).values({
          migrationId,
          tenantId,
          environment,
          upSqlHash: currentHash,
          status: 'applied',
          executedBy: userId,
          executedAt: new Date(),
        });
        
        return {
          success: true,
          data: {
            migrationId,
            appliedAt: new Date(),
            environment,
            sqlHash: currentHash,
            message: `Migration ${migrationId} aplicada com sucesso em ${environment}`,
            nextSteps: environment === 'sandbox' 
              ? "Valide que a migration funciona corretamente em sandbox. Quando estiver pronto, aplique em production com confirmProduction: true."
              : "Migration aplicada em production. Monitore a aplicação para garantir que está funcionando corretamente."
          }
        };
      }

      case "rollback_schema": {
        const { targetVersion, confirmRollback = false } = args;
        
        if (typeof targetVersion !== 'number') {
          return {
            success: false,
            error: "targetVersion deve ser um número"
          };
        }

        if (!confirmRollback) {
          return {
            success: false,
            error: "AVISO: Rollback pode causar perda de dados. Confirme com confirmRollback: true"
          };
        }

        await schemaService.rollback(tenantId, targetVersion);
        
        return {
          success: true,
          data: {
            targetVersion,
            rolledBackAt: new Date(),
            message: `Schema revertido para versão ${targetVersion}`
          }
        };
      }

      case "get_schema_version_history": {
        const { limit = 10 } = args;
        
        // getVersionHistory returns VersionHistoryEntry[] without limit param
        const history = await schemaService.getVersionHistory(tenantId);
        
        // Manually limit results
        const limitedHistory = history.slice(0, limit);
        
        return {
          success: true,
          data: {
            versions: limitedHistory.map(v => ({
              version: v.version,
              migrationsCount: v.appliedMigrations,
            }))
          }
        };
      }

      case "list_pending_migrations": {
        const { migrations } = await import("../../../shared/schema");
        const { db } = await import("../../../apps/api/db");
        const { eq, and } = await import("drizzle-orm");
        
        const pending = await db.query.migrations.findMany({
          where: and(
            eq(migrations.tenantId, tenantId),
            eq(migrations.status, 'pending')
          )
        });
        
        return {
          success: true,
          data: {
            count: pending.length,
            migrations: pending.map(m => ({
              id: m.id,
              version: m.toVersion,
              description: m.description,
              estimatedDuration: m.estimatedDuration,
              requiresDowntime: m.requiresDowntime,
            }))
          }
        };
      }

      default:
        return {
          success: false,
          error: `Schema evolution tool desconhecida: ${toolName}`
        };
    }
  } catch (error) {
    console.error(`[Schema Evolution Tool: ${toolName}] Error:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao executar schema evolution tool"
    };
  }
}
