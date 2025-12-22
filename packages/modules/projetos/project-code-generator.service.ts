import { eq, and } from "drizzle-orm";
import { db } from "../../../apps/api/db";
import { projectsConfig } from "../../../shared/schema";

/**
 * Service para geração automática de códigos de projetos
 * Suporta padrões configuráveis por tenant como:
 * - PROJ-{YYYY}-{###} → PROJ-2024-001
 * - P{YY}-{####} → P24-0001
 * - {TENANT}-{MM}-{##} → ACME-11-01
 */
export class ProjectCodeGeneratorService {
  /**
   * Gera o próximo código de projeto seguindo o padrão configurado
   * Thread-safe com transação e ON CONFLICT
   */
  async generateProjectCode(
    tenantId: string,
    environment: "production" | "sandbox" = "production"
  ): Promise<string> {
    // Executar em transação para garantir atomicidade
    return await db.transaction(async (tx) => {
      // Upsert: INSERT com ON CONFLICT para garantir apenas 1 row por tenant+env
      await tx
        .insert(projectsConfig)
        .values({
          tenantId,
          environment,
          codePattern: "{YYYY}/{###}",
          codeCounter: 0,
          statusValues: [],
          tags: [],
        })
        .onConflictDoNothing({
          target: [projectsConfig.tenantId, projectsConfig.environment]
        });

      // Buscar com lock FOR UPDATE (agora sabemos que existe)
      const [config] = await tx
        .select()
        .from(projectsConfig)
        .where(
          and(
            eq(projectsConfig.tenantId, tenantId),
            eq(projectsConfig.environment, environment)
          )
        )
        .limit(1)
        .for("update");

      if (!config) {
        throw new Error(`Failed to create/fetch config for tenant ${tenantId}`);
      }

      // Incrementar contador atomicamente usando o ID da row
      const nextCounter = config.codeCounter + 1;
      
      const [updated] = await tx
        .update(projectsConfig)
        .set({ 
          codeCounter: nextCounter,
          updatedAt: new Date()
        })
        .where(eq(projectsConfig.id, config.id))
        .returning();

      // Gerar código usando o valor COMMITTED retornado (não o calculado)
      return this.applyPattern(updated.codePattern, updated.codeCounter);
    });
  }

  /**
   * Aplica o padrão de código substituindo os placeholders
   * Placeholders suportados:
   * - {YYYY} = ano completo (2024)
   * - {YY} = ano curto (24)
   * - {MM} = mês (01-12)
   * - {DD} = dia (01-31)
   * - {###} = contador com N dígitos zerados à esquerda
   */
  private applyPattern(pattern: string, counter: number): string {
    const now = new Date();
    const year = now.getFullYear().toString();
    const yearShort = year.slice(-2);
    const month = (now.getMonth() + 1).toString().padStart(2, "0");
    const day = now.getDate().toString().padStart(2, "0");

    let result = pattern;

    // Substituir placeholders de data
    result = result.replace(/{YYYY}/g, year);
    result = result.replace(/{YY}/g, yearShort);
    result = result.replace(/{MM}/g, month);
    result = result.replace(/{DD}/g, day);

    // Substituir contador com padding
    // Ex: {###} com counter=5 → 005
    const counterMatch = result.match(/{(#+)}/);
    if (counterMatch) {
      const padding = counterMatch[1].length;
      const paddedCounter = counter.toString().padStart(padding, "0");
      result = result.replace(/{#+}/g, paddedCounter);
    }

    return result;
  }

  /**
   * Valida se um código de projeto já existe
   */
  async isCodeUnique(code: string, tenantId: string): Promise<boolean> {
    const { projects } = await import("@shared/schema");
    
    const [existing] = await db
      .select()
      .from(projects)
      .where(
        and(
          eq(projects.projectCode, code),
          eq(projects.tenantId, tenantId)
        )
      )
      .limit(1);

    return !existing;
  }

  /**
   * Obtém a configuração atual do tenant
   */
  async getConfig(
    tenantId: string,
    environment: "production" | "sandbox" = "production"
  ) {
    const [config] = await db
      .select()
      .from(projectsConfig)
      .where(
        and(
          eq(projectsConfig.tenantId, tenantId),
          eq(projectsConfig.environment, environment)
        )
      )
      .limit(1);

    return config;
  }

  /**
   * Atualiza a configuração do tenant
   */
  async updateConfig(
    tenantId: string,
    updates: {
      codePattern?: string;
      dateType?: "single" | "range";
      statusValues?: Array<{ value: string; label: string; color?: string }>;
      tags?: Array<{ value: string; label: string }>;
    },
    environment: "production" | "sandbox" = "production"
  ) {
    // Verificar se configuração existe
    const existing = await this.getConfig(tenantId, environment);

    if (!existing) {
      // Criar nova configuração
      return await db.insert(projectsConfig).values({
        tenantId,
        environment,
        ...updates,
        codeCounter: 0,
        statusValues: updates.statusValues || [],
        tags: updates.tags || [],
      }).returning();
    }

    // Atualizar configuração existente
    return await db
      .update(projectsConfig)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(projectsConfig.tenantId, tenantId),
          eq(projectsConfig.environment, environment)
        )
      )
      .returning();
  }
}

// Singleton instance
export const projectCodeGenerator = new ProjectCodeGeneratorService();
