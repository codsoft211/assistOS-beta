// Migrated from AssistOS legacy - Phase 3
// Source: /tmp/assistos-legacy/server/ai-tools-config.ts (294 lines)

import { db } from "../../../apps/api/db";
// NOTE: projectStates table doesn't exist in clean schema - disabled for Assist Start
// TODO: Add projectStates table to schema if needed
// import { projectStates } from "../../../shared/schema";
import { eq, and } from "drizzle-orm";

/**
 * AI Tools for Project Configuration
 * These tools allow the Configuration Agent to execute actions instead of just proposing them
 */

export const projectConfigTools = [
  {
    type: "function" as const,
    function: {
      name: "list_project_states",
      description: "Lista todos os estados de projeto configurados para o tenant",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "add_project_state",
      description: "Adiciona um novo estado de projeto. Use isto quando o utilizador pedir para adicionar um estado (ex: 'adiciona estado Lead').",
      parameters: {
        type: "object",
        properties: {
          stateKey: {
            type: "string",
            description: "Chave única do estado (lowercase, sem espaços, ex: 'lead', 'em_preparacao')",
          },
          displayName: {
            type: "string",
            description: "Nome para mostrar na interface (ex: 'Lead', 'Em Preparação')",
          },
          color: {
            type: "string",
            description: "Cor do estado em hex (ex: '#3b82f6', '#10b981')",
          },
          description: {
            type: "string",
            description: "Descrição do estado (opcional)",
          },
          category: {
            type: "string",
            description: "Categoria do estado: 'initial', 'active', 'completed', 'cancelled' (default: 'active')",
          },
          stateOrder: {
            type: "number",
            description: "Ordem de apresentação (opcional, default: último)",
          },
        },
        required: ["stateKey", "displayName", "color"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "edit_project_state",
      description: "Edita um estado de projeto existente",
      parameters: {
        type: "object",
        properties: {
          stateId: {
            type: "string",
            description: "ID do estado a editar",
          },
          displayName: {
            type: "string",
            description: "Novo nome para mostrar (opcional)",
          },
          color: {
            type: "string",
            description: "Nova cor em hex (opcional)",
          },
          description: {
            type: "string",
            description: "Nova descrição (opcional)",
          },
          category: {
            type: "string",
            description: "Nova categoria (opcional)",
          },
          stateOrder: {
            type: "number",
            description: "Nova ordem (opcional)",
          },
        },
        required: ["stateId"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "remove_project_state",
      description: "Remove um estado de projeto. ATENÇÃO: Só pode remover se não houver projetos nesse estado e se não for um estado do sistema.",
      parameters: {
        type: "object",
        properties: {
          stateId: {
            type: "string",
            description: "ID do estado a remover",
          },
        },
        required: ["stateId"],
      },
    },
  },
];

/**
 * Execute configuration tool
 */
export async function executeConfigTool(
  toolName: string,
  args: any,
  tenantId: string
): Promise<{ success: boolean; data?: any; error?: string; message?: string }> {
  try {
    switch (toolName) {
      case "list_project_states": {
        const states = await db.query.projectStates.findMany({
          where: eq(projectStates.tenantId, tenantId),
          orderBy: (states, { asc }) => [asc(states.stateOrder)],
        });

        return {
          success: true,
          data: states,
          message: `Encontrados ${states.length} estados configurados`,
        };
      }

      case "add_project_state": {
        const { stateKey, displayName, color, description, category, stateOrder } = args;

        // Check if state key already exists
        const existing = await db.query.projectStates.findFirst({
          where: and(
            eq(projectStates.tenantId, tenantId),
            eq(projectStates.stateKey, stateKey)
          ),
        });

        if (existing) {
          return {
            success: false,
            error: `Estado com chave '${stateKey}' já existe`,
          };
        }

        // Get max order if not provided (check for undefined, not falsy, to allow 0)
        let finalOrder = stateOrder;
        if (finalOrder === undefined) {
          const allStates = await db.query.projectStates.findMany({
            where: eq(projectStates.tenantId, tenantId),
          });
          finalOrder = allStates.length;
        }

        const [newState] = await db
          .insert(projectStates)
          .values({
            tenantId,
            stateKey,
            displayName,
            color,
            description,
            category: category || 'active',
            stateOrder: finalOrder,
            isSystemState: false,
            isActive: true,
            applicableToPhases: false,
          })
          .returning();

        return {
          success: true,
          data: newState,
          message: `✅ Estado '${displayName}' adicionado com sucesso!`,
        };
      }

      case "edit_project_state": {
        const { stateId, displayName, color, description, category, stateOrder } = args;

        const updates: any = {};
        if (displayName !== undefined) updates.displayName = displayName;
        if (color !== undefined) updates.color = color;
        if (description !== undefined) updates.description = description;
        if (category !== undefined) updates.category = category;
        if (stateOrder !== undefined) updates.stateOrder = stateOrder;

        if (Object.keys(updates).length === 0) {
          return {
            success: false,
            error: "Nenhuma alteração fornecida",
          };
        }

        const [updated] = await db
          .update(projectStates)
          .set(updates)
          .where(
            and(eq(projectStates.id, stateId), eq(projectStates.tenantId, tenantId))
          )
          .returning();

        if (!updated) {
          return {
            success: false,
            error: "Estado não encontrado",
          };
        }

        return {
          success: true,
          data: updated,
          message: `✅ Estado '${updated.displayName}' atualizado com sucesso!`,
        };
      }

      case "remove_project_state": {
        const { stateId } = args;

        // Check if it's a system state (cannot be deleted)
        const state = await db.query.projectStates.findFirst({
          where: and(
            eq(projectStates.id, stateId),
            eq(projectStates.tenantId, tenantId)
          ),
        });

        if (!state) {
          return {
            success: false,
            error: "Estado não encontrado",
          };
        }

        if (state.isSystemState) {
          return {
            success: false,
            error: "Não é possível remover estados do sistema",
          };
        }

        // Check if there are projects using this state
        const { projects } = await import("@shared/schema");
        const projectsWithState = await db.query.projects.findMany({
          where: eq(projects.status, stateId),
          limit: 1,
        });

        if (projectsWithState.length > 0) {
          return {
            success: false,
            error: "Não é possível remover este estado porque existem projetos a utilizá-lo",
          };
        }

        const [deleted] = await db
          .delete(projectStates)
          .where(
            and(eq(projectStates.id, stateId), eq(projectStates.tenantId, tenantId))
          )
          .returning();

        return {
          success: true,
          data: deleted,
          message: `✅ Estado '${deleted.displayName}' removido com sucesso!`,
        };
      }

      default:
        return {
          success: false,
          error: "Ferramenta de configuração desconhecida",
        };
    }
  } catch (error) {
    console.error("[Config Tools] Error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao executar ferramenta de configuração",
    };
  }
}
