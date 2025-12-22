// Migrated from AssistOS legacy - Phase 3
// Source: /tmp/assistos-legacy/server/_legacy/ai-tools-studio.ts (2772 lines, 96KB)

import { db } from "../../../../apps/api/db";

// TODO: These tables need to be added to schema if they don't exist
import { 
  // customEntities, 
  // customFields, 
  // customEntityRecords, 
  // configurationCheckpoints,
  // schemaVersions,
  // blueprints,
  conversations,
  // agentFeedback,
  // phaseData,
  // uploadedDataFiles,
} from "../../../../shared/schema";
import { eq, and, desc, like, or, sql } from "drizzle-orm";
import { selectOneFromTenantTable } from "../../../../apps/api/utils/tenant-db-helper";
import { financialGridTools, executeFinancialTool } from "./financial";

// Module system imports (for configurable modules)
import { ModuleRegistryService } from "../../../../packages/modules/base/module-registry.service";
import { configureModule } from "../../../../packages/modules/base/module-configuration";
import type { ModuleConfiguration, ModuleTemplate, ModuleContext } from "../../../../packages/modules/base/module.interface";

// TODO: Migrate these services when needed
// import * as blueprintValidator from "../../../../apps/api/services/blueprint-validator";
// import { codeReviewService } from "../../../../apps/api/services/code-review-service";
// import { analyzeExcelFile, analyzeCsvFile } from "../../../../apps/api/services/data-analyzer";

import * as fs from "fs/promises";
import * as path from "path";

/**
 * Pre-configured Templates for Quick Setup
 */
const SYSTEM_TEMPLATES = {
  catering: {
    name: "Catering & Eventos",
    description: "Sistema para empresas de catering corporativo e eventos",
    entities: [
      {
        key: "clientes",
        name: "Clientes",
        plural: "Clientes",
        description: "Gestão de clientes e contactos",
        fields: ["Nome", "Email", "Telefone", "Empresa", "Morada", "NIF"],
      },
      {
        key: "encomendas",
        name: "Encomenda",
        plural: "Encomendas",
        description: "Gestão de encomendas e eventos",
        fields: ["Cliente", "Data Evento", "Tipo Evento", "Nº Pessoas", "Menu", "Valor", "Estado"],
      },
      {
        key: "produtos",
        name: "Produto",
        plural: "Produtos",
        description: "Catálogo de produtos e menus",
        fields: ["Nome", "Categoria", "Descrição", "Preço Unitário", "Stock"],
      },
    ],
  },
  crm: {
    name: "CRM - Gestão Comercial",
    description: "Sistema CRM para gestão de leads e oportunidades",
    entities: [
      {
        key: "leads",
        name: "Lead",
        plural: "Leads",
        description: "Potenciais clientes",
        fields: ["Nome", "Email", "Telefone", "Empresa", "Origem", "Estado", "Responsável"],
      },
      {
        key: "oportunidades",
        name: "Oportunidade",
        plural: "Oportunidades",
        description: "Negócios em curso",
        fields: ["Lead", "Título", "Valor Estimado", "Probabilidade", "Data Fecho", "Fase"],
      },
      {
        key: "atividades",
        name: "Atividade",
        plural: "Atividades",
        description: "Interações com clientes",
        fields: ["Lead/Oportunidade", "Tipo", "Data", "Descrição", "Resultado"],
      },
    ],
  },
  stock: {
    name: "Gestão de Stock",
    description: "Controlo de inventário e fornecedores",
    entities: [
      {
        key: "produtos",
        name: "Produto",
        plural: "Produtos",
        description: "Catálogo de produtos",
        fields: ["Nome", "Referência", "Categoria", "Preço Compra", "Preço Venda", "Stock Atual", "Stock Mínimo"],
      },
      {
        key: "fornecedores",
        name: "Fornecedor",
        plural: "Fornecedores",
        description: "Gestão de fornecedores",
        fields: ["Nome", "Contacto", "Email", "NIF", "Condições Pagamento"],
      },
      {
        key: "movimentos",
        name: "Movimento Stock",
        plural: "Movimentos Stock",
        description: "Entradas e saídas de stock",
        fields: ["Produto", "Tipo", "Quantidade", "Data", "Referência", "Observações"],
      },
    ],
  },
};

/**
 * Configuration Studio AI Tools
 * Advanced tools for creating custom entities, fields, workflows, and automations
 * Only accessible to owners and configuradores in SANDBOX environment
 */

export const configurationStudioTools = [
  ...financialGridTools, // Add Financial Grid tools to studio
  {
    type: "function" as const,
    function: {
      name: "create_custom_entity",
      description: "Cria uma nova entidade/tabela personalizada no ERP (ex: 'Contratos', 'Equipamentos', 'Manutenções'). Isto permite ao utilizador guardar dados específicos do negócio.",
      parameters: {
        type: "object",
        properties: {
          entityKey: {
            type: "string",
            description: "Chave única da entidade (lowercase, sem espaços, ex: 'contratos', 'equipamentos')",
          },
          displayName: {
            type: "string",
            description: "Nome amigável para mostrar na UI (ex: 'Contratos', 'Equipamentos')",
          },
          displayNamePlural: {
            type: "string",
            description: "Nome plural (ex: 'Contratos', 'Equipamentos')",
          },
          description: {
            type: "string",
            description: "Descrição do que esta entidade representa",
          },
          icon: {
            type: "string",
            description: "Nome do ícone Lucide (ex: 'FileText', 'Wrench', 'Calendar')",
          },
          category: {
            type: "string",
            description: "Categoria/módulo onde aparece (ex: 'sales', 'operations', 'hr', 'custom')",
          },
        },
        required: ["entityKey", "displayName", "displayNamePlural"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "add_custom_field",
      description: "Adiciona um novo campo a uma entidade personalizada (ex: adicionar campo 'Valor do Contrato' à entidade Contratos)",
      parameters: {
        type: "object",
        properties: {
          entityId: {
            type: "string",
            description: "ID da entidade onde adicionar o campo",
          },
          fieldKey: {
            type: "string",
            description: "Chave única do campo (lowercase, sem espaços, ex: 'valor_contrato', 'data_inicio')",
          },
          displayName: {
            type: "string",
            description: "Nome para mostrar na UI (ex: 'Valor do Contrato', 'Data de Início')",
          },
          fieldType: {
            type: "string",
            enum: ["text", "number", "date", "boolean", "select", "multiselect", "relation", "file", "richtext"],
            description: "Tipo do campo",
          },
          isRequired: {
            type: "boolean",
            description: "Se o campo é obrigatório",
          },
          defaultValue: {
            type: "string",
            description: "Valor padrão (opcional)",
          },
          validationRules: {
            type: "object",
            description: "Regras de validação (ex: {min: 0, max: 1000000} para números)",
          },
          options: {
            type: "array",
            items: { type: "string" },
            description: "Opções para campos select/multiselect",
          },
          relationEntityId: {
            type: "string",
            description: "ID da entidade relacionada (para tipo 'relation')",
          },
        },
        required: ["entityId", "fieldKey", "displayName", "fieldType"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_custom_entities",
      description: "Lista todas as entidades personalizadas criadas",
      parameters: {
        type: "object",
        properties: {
          includeFields: {
            type: "boolean",
            description: "Se deve incluir os campos de cada entidade (default: false)",
          },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_entity_details",
      description: "Obtém detalhes completos de uma entidade incluindo todos os seus campos",
      parameters: {
        type: "object",
        properties: {
          entityId: {
            type: "string",
            description: "ID da entidade",
          },
        },
        required: ["entityId"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "edit_custom_field",
      description: "Edita propriedades de um campo existente",
      parameters: {
        type: "object",
        properties: {
          fieldId: {
            type: "string",
            description: "ID do campo a editar",
          },
          displayName: {
            type: "string",
            description: "Novo nome (opcional)",
          },
          isRequired: {
            type: "boolean",
            description: "Mudar obrigatoriedade (opcional)",
          },
          defaultValue: {
            type: "string",
            description: "Novo valor padrão (opcional)",
          },
          validationRules: {
            type: "object",
            description: "Novas regras de validação (opcional)",
          },
          options: {
            type: "array",
            items: { type: "string" },
            description: "Novas opções para select (opcional)",
          },
        },
        required: ["fieldId"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "remove_custom_field",
      description: "Remove um campo de uma entidade. ATENÇÃO: Dados existentes nesse campo serão perdidos.",
      parameters: {
        type: "object",
        properties: {
          fieldId: {
            type: "string",
            description: "ID do campo a remover",
          },
          confirmDataLoss: {
            type: "boolean",
            description: "Confirmação explícita de que dados podem ser perdidos",
          },
        },
        required: ["fieldId", "confirmDataLoss"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_checkpoint",
      description: "Cria um checkpoint da configuração atual para permitir undo/rollback posterior",
      parameters: {
        type: "object",
        properties: {
          description: {
            type: "string",
            description: "Descrição do checkpoint (ex: 'Antes de adicionar módulo contratos')",
          },
        },
        required: ["description"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_checkpoints",
      description: "Lista os checkpoints de configuração disponíveis",
      parameters: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Número máximo de checkpoints a retornar (default: 10)",
          },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "rollback_to_checkpoint",
      description: "Faz rollback da configuração para um checkpoint anterior. ATENÇÃO: Isto irá desfazer todas as alterações desde esse checkpoint.",
      parameters: {
        type: "object",
        properties: {
          checkpointId: {
            type: "string",
            description: "ID do checkpoint para onde fazer rollback",
          },
          confirmRollback: {
            type: "boolean",
            description: "Confirmação explícita do rollback",
          },
        },
        required: ["checkpointId", "confirmRollback"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "upload_data_files",
      description: "Analisa ficheiros Excel/CSV com dados reais da empresa para gerar Blueprint baseado na estrutura real. O ficheiro já deve ter sido uploaded pelo utilizador via interface. Retorna análise completa: entidades detectadas, campos, tipos de dados, relações.",
      parameters: {
        type: "object",
        properties: {
          fileId: {
            type: "string",
            description: "ID do ficheiro que foi uploaded (retornado pelo endpoint de upload)",
          },
          fileName: {
            type: "string",
            description: "Nome original do ficheiro",
          },
        },
        required: ["fileId", "fileName"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "generate_blueprint",
      description: "Gera um blueprint completo de ERP baseado no discovery/contexto do negócio. Retorna estrutura proposta (entidades, campos, relações, workflows).",
      parameters: {
        type: "object",
        properties: {
          industry: {
            type: "string",
            description: "Setor/indústria do negócio (ex: 'maintenance', 'construction', 'consulting', 'retail')",
          },
          businessSize: {
            type: "string",
            enum: ["small", "medium", "large"],
            description: "Tamanho do negócio",
          },
          processes: {
            type: "array",
            items: { type: "string" },
            description: "Processos/áreas que quer gerir (ex: ['contratos', 'manutenções', 'faturação'])",
          },
          existingSystems: {
            type: "string",
            description: "Sistemas existentes que usa atualmente (opcional)",
          },
          painPoints: {
            type: "array",
            items: { type: "string" },
            description: "Dores/problemas principais que quer resolver",
          },
        },
        required: ["industry", "processes"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "search_blueprints",
      description: "Procura blueprints de sucesso de outros tenants para aprendizagem cross-tenant. Retorna configurações de ERP que funcionaram bem em contextos similares.",
      parameters: {
        type: "object",
        properties: {
          industry: {
            type: "string",
            description: "Setor/indústria para procurar",
          },
          tags: {
            type: "array",
            items: { type: "string" },
            description: "Tags para filtrar (ex: ['manutenções', 'equipamentos'])",
          },
          limit: {
            type: "number",
            description: "Número máximo de blueprints a retornar (default: 5)",
          },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "preview_build_plan",
      description: "Mostra preview/resumo do que vai ser criado antes de executar. Use isto em Build Mode para confirmar com utilizador antes de executar.",
      parameters: {
        type: "object",
        properties: {
          planDescription: {
            type: "string",
            description: "Descrição do plano de execução (o que vai criar)",
          },
          entities: {
            type: "array",
            items: { 
              type: "object",
              properties: {
                name: { type: "string" },
                fieldsCount: { type: "number" }
              }
            },
            description: "Lista de entidades que vai criar",
          },
          estimatedTime: {
            type: "string",
            description: "Tempo estimado (ex: '~30 segundos')",
          },
        },
        required: ["planDescription", "entities"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "validate_blueprint_requirements",
      description: "🚨 OBRIGATÓRIO ANTES DE generate_blueprint! Valida se todos os requisitos necessários foram recolhidos. Bloqueia geração de Blueprint se faltarem requisitos obrigatórios (company info, data source, etc).",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "mark_requirement_collected",
      description: "Marca um requisito como recolhido com os dados fornecidos pelo utilizador. Use quando o user responder a uma pergunta sobre requisitos (ex: nome empresa, fonte dados, etc).",
      parameters: {
        type: "object",
        properties: {
          requirementId: {
            type: "string",
            enum: ["company_info", "data_source", "gmail_connector", "product_catalog"],
            description: "ID do requisito a marcar como recolhido",
          },
          collectedData: {
            type: "object",
            description: "Dados recolhidos do utilizador (ex: {name: 'Empresa X', sector: 'HORECA', source: 'primavera'})",
          },
          triggeredBy: {
            type: "string",
            description: "O que triggou este requisito (opcional, ex: 'user mentioned products')",
          },
        },
        required: ["requirementId", "collectedData"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_requirements_status",
      description: "Retorna o status atual de todos os requisitos (quantos recolhidos, quantos faltam). Use para mostrar progresso ao utilizador ou antes de validar.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "activate_conditional_requirements",
      description: "Activa requisitos condicionais baseado no que o utilizador mencionou (produtos, emails, automações, etc). Usa detecção automática de keywords para activar requisitos relevantes. Call this quando detectares que o user precisa de features que requerem configuração adicional.",
      parameters: {
        type: "object",
        properties: {
          conversationText: {
            type: "string",
            description: "O texto da conversa do utilizador para detectar requisitos (ex: 'quero gerir produtos e enviar emails automáticos')",
          },
        },
        required: ["conversationText"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "use_template",
      description: "🚀 ATALHO RÁPIDO! Usa template pré-configurado para criar sistema instantly (catering, CRM, stock, etc). Perfeito para casos comuns. Cria entidades + campos + relações em segundos!",
      parameters: {
        type: "object",
        properties: {
          templateName: {
            type: "string",
            enum: ["catering", "crm", "stock", "projects", "hr", "construction"],
            description: "Nome do template pré-configurado",
          },
          customizations: {
            type: "object",
            description: "Customizações opcionais ao template (ex: campos adicionais, nomes diferentes)",
          },
        },
        required: ["templateName"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "add_module",
      description: "➕ EXPANSÃO INCREMENTAL! Adiciona novo módulo a sistema existente (ex: adicionar 'Stock' a sistema que já tem 'Clientes'). Permite construir ERP passo a passo sem recriar tudo.",
      parameters: {
        type: "object",
        properties: {
          moduleName: {
            type: "string",
            description: "Nome do módulo a adicionar (ex: 'Stock e Inventário', 'Faturação', 'Rotas e Entregas')",
          },
          entities: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                fields: { type: "array", items: { type: "string" } },
              },
            },
            description: "Entidades que compõem este módulo",
          },
          relationsToExisting: {
            type: "array",
            items: { type: "string" },
            description: "Relações com entidades existentes (ex: 'Produto relaciona-se com Encomenda')",
          },
        },
        required: ["moduleName", "entities"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "detect_complexity",
      description: "🎯 ANÁLISE INTELIGENTE! Analisa pedido do user e determina: simples (1-3 entidades) vs complexo (4+ módulos). Ajuda a escolher fluxo adequado (rápido vs incremental).",
      parameters: {
        type: "object",
        properties: {
          userRequest: {
            type: "string",
            description: "Pedido completo do utilizador para analisar",
          },
        },
        required: ["userRequest"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "web_search",
      description: "Pesquisa na internet para obter informação atualizada sobre melhores práticas, exemplos de ERPs, estruturas de dados, integrações disponíveis, regulamentações da indústria, etc. Use quando precisar de informação externa para melhor aconselhar o utilizador.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Pergunta ou termo de pesquisa (ex: 'melhores práticas ERP para distribuidoras HORECA', 'estrutura dados gestão contratos')",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "consult_other_agent",
      description: "🤝 Consultar outro agent especializado (Finance, HR, Projects, etc.) para obter informação, validação ou expertise. Usa antes de criar entities/campos para evitar duplicação e garantir consistência entre módulos. Exemplos: Finance para orçamentos/custos, HR para salários/férias, Projects para tarefas/recursos.",
      parameters: {
        type: "object",
        properties: {
          targetModule: {
            type: "string",
            enum: ["finance", "hr", "projects", "sales"],
            description: "Módulo do agent a consultar (finance para orçamentos/custos, hr para salários/recursos humanos, projects para gestão projetos, sales para vendas)",
          },
          question: {
            type: "string",
            description: "Pergunta específica para o agent (ex: 'Que campos usas para budget?', 'Como estruturas salários?', 'Schema para orçamentos?')",
          },
          context: {
            type: "string",
            description: "Contexto relevante da conversa (ex: 'User quer adicionar campo budget aos projetos', 'Criar entity para contratos')",
          },
        },
        required: ["targetModule", "question", "context"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "detect_conflicts",
      description: "🔍 Detecta conflitos potenciais antes de criar/modificar entities ou campos. Previne duplicações, colisões de namespace, inconsistências de nomenclatura. RECOMENDADO usar antes de create_custom_entity ou add_custom_field.",
      parameters: {
        type: "object",
        properties: {
          actionType: {
            type: "string",
            enum: ["create_entity", "add_field", "modify_entity"],
            description: "Tipo de ação que vais executar",
          },
          entityKey: {
            type: "string",
            description: "Chave da entidade (obrigatório para create_entity)",
          },
          displayName: {
            type: "string",
            description: "Nome display da entidade/campo",
          },
          entityId: {
            type: "string",
            description: "ID da entidade (obrigatório para add_field)",
          },
          fieldKey: {
            type: "string",
            description: "Chave do campo (obrigatório para add_field)",
          },
        },
        required: ["actionType"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_current_phase",
      description: "🚨 OBRIGATÓRIO: Verifica em que fase estás atualmente (1=Discovery, 2=Blueprint, 3=Confirmation, 4=Build). Use ANTES de executar qualquer ação para garantir que estás na fase correta. Só funciona em new_setup scenario.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "advance_phase",
      description: "Avança para a próxima fase no workflow de 4 fases. REGRAS: Fase 1→2 requer requisitos validados, Fase 2→3 requer blueprint gerado, Fase 3→4 requer confirmação do user. Só funciona em new_setup scenario.",
      parameters: {
        type: "object",
        properties: {
          reason: {
            type: "string",
            description: "Motivo do avanço (ex: 'Requirements validated', 'Blueprint confirmed by user', 'Blueprint generated successfully')",
          },
        },
        required: ["reason"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "go_back_phase",
      description: "⬅️ Volta para a fase anterior no workflow. Permite ao user corrigir informações ou refazer decisões. REGRAS: Não pode voltar da Fase 1 (já é a primeira). Alerta o user sobre possível perda de progresso.",
      parameters: {
        type: "object",
        properties: {
          reason: {
            type: "string",
            description: "Motivo para voltar atrás (ex: 'User wants to change business description', 'Incorrect requirements collected')",
          },
        },
        required: ["reason"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "write_task_list",
      description: "Manage your internal task list for tracking implementation progress. MANDATORY: Automatically triggers code review when marking tasks as 'completed'. Use to organize complex work, track what's done, and ensure quality.",
      parameters: {
        type: "object",
        properties: {
          tasks: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: {
                  type: "string",
                  description: "Unique task ID",
                },
                content: {
                  type: "string",
                  description: "Task description",
                },
                status: {
                  type: "string",
                  enum: ["pending", "in_progress", "completed", "completed_pending_review"],
                  description: "Task status. Use 'completed' to mark done (auto-triggers code review for code changes)",
                },
                filesModified: {
                  type: "array",
                  items: { type: "string" },
                  description: "List of files modified for this task (required if marking as 'completed' with code changes)",
                },
              },
              required: ["id", "content", "status"],
            },
            description: "Array of tasks to track. When marking a task as 'completed' with code changes, the system automatically requests architect review.",
          },
        },
        required: ["tasks"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_entity_suggestions",
      description: "Obter sugestões de entidades baseadas em negócios similares (pattern learning). Use isto quando descobrires o businessType do user para acelerar o setup com entidades comuns.",
      parameters: {
        type: "object",
        properties: {
          businessType: {
            type: "string",
            description: "Tipo de negócio (ex: 'catering', 'construction', 'consulting', 'retail')",
          },
        },
        required: ["businessType"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_field_suggestions",
      description: "Obter sugestões de campos para uma entidade específica baseado em padrões de negócios similares.",
      parameters: {
        type: "object",
        properties: {
          businessType: {
            type: "string",
            description: "Tipo de negócio",
          },
          entityKey: {
            type: "string",
            description: "Chave da entidade (ex: 'events', 'projects', 'contracts')",
          },
        },
        required: ["businessType", "entityKey"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "diagnose_and_fix",
      description: "🔍 AUTO-DIAGNÓSTICO E RECUPERAÇÃO AUTOMÁTICA. Use esta tool quando: (1) Detectares um loop ou problema, (2) advance_phase falhar, (3) Suspeitas que há algo errado. Esta tool verifica o estado da conversa, identifica problemas (flags não marcadas, blueprints em falta, inconsistências) e CORRIGE AUTOMATICAMENTE. Retorna diagnóstico claro + ações tomadas.",
      parameters: {
        type: "object",
        properties: {
          reason: {
            type: "string",
            description: "Razão para fazer diagnóstico (ex: 'advance_phase failed', 'detected loop', 'user stuck')",
          },
        },
        required: ["reason"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_module_templates",
      description: "Lista templates disponíveis para um módulo configurável (ex: 'projetos' retorna construction, events, consulting). Use para mostrar ao utilizador opções de configuração rápida baseadas em indústria/caso de uso.",
      parameters: {
        type: "object",
        properties: {
          moduleId: {
            type: "string",
            description: "ID do módulo (ex: 'projetos', 'comercial', 'financeiro')",
          },
        },
        required: ["moduleId"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "apply_module_template",
      description: "Aplica um template pré-configurado a um módulo para um tenant. Isto configura automaticamente entidades personalizadas, workflows, e ferramentas específicas da indústria (ex: aplicar template 'construction' ao módulo 'projetos' adiciona entidades como site_inspections, equipment, safety_records).",
      parameters: {
        type: "object",
        properties: {
          tenantId: {
            type: "string",
            description: "ID do tenant",
          },
          moduleId: {
            type: "string",
            description: "ID do módulo a configurar (ex: 'projetos')",
          },
          templateId: {
            type: "string",
            description: "ID do template a aplicar (ex: 'construction', 'events', 'consulting')",
          },
          userId: {
            type: "string",
            description: "ID do utilizador que está a aplicar o template",
          },
        },
        required: ["tenantId", "moduleId", "templateId", "userId"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "configure_project_template",
      description: "Configura um template de projeto (Construction, Events, Software Dev) com customizações opcionais. Simplifica a aplicação de templates ao módulo Projetos.",
      parameters: {
        type: "object",
        properties: {
          templateId: {
            type: "string",
            description: "ID do template (ex: 'construction', 'events', 'software-dev')",
          },
          customizations: {
            type: "object",
            description: "Customizações opcionais ao template (ex: adicionar campos extras)",
          },
          environment: {
            type: "string",
            enum: ["sandbox", "production"],
            description: "Ambiente onde aplicar (default: sandbox)",
          },
        },
        required: ["templateId"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "link_project_field",
      description: "Liga um campo de projeto a entidades de outros módulos (CRM clients, Financial invoices, Compras purchase orders). Permite criar relações cross-module.",
      parameters: {
        type: "object",
        properties: {
          sourceFieldId: {
            type: "string",
            description: "ID do campo de projeto a linkar",
          },
          targetModule: {
            type: "string",
            enum: ["crm", "financial", "compras", "projetos"],
            description: "Módulo alvo para linking",
          },
          targetEntity: {
            type: "string",
            description: "Entidade alvo (ex: 'clients', 'invoices', 'purchase_orders')",
          },
          defaultDisplayField: {
            type: "string",
            description: "Campo para display (opcional, usa default da entidade)",
          },
          environment: {
            type: "string",
            enum: ["sandbox", "production"],
            description: "Ambiente (default: sandbox)",
          },
          dryRun: {
            type: "boolean",
            description: "Preview do link sem criar (default: false)",
          },
        },
        required: ["sourceFieldId", "targetModule", "targetEntity"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "apply_project_template",
      description: "Promove template de projetos de sandbox para production. Apenas disponível após testar em sandbox.",
      parameters: {
        type: "object",
        properties: {
          templateId: {
            type: "string",
            description: "ID do template a promover",
          },
          promotionTarget: {
            type: "string",
            enum: ["production"],
            description: "Alvo da promoção (default: production)",
          },
          environment: {
            type: "string",
            enum: ["sandbox"],
            description: "Deve ser sandbox (apenas promove de sandbox)",
          },
        },
        required: ["templateId"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "configure_module",
      description: "Configura um módulo com entidades/workflows personalizados (avançado, conversacional). Use quando o utilizador quer configuração customizada que não se encaixa num template pré-definido. Permite criar entities, fields, workflows, e tools específicos baseados em conversação com o utilizador.",
      parameters: {
        type: "object",
        properties: {
          tenantId: {
            type: "string",
            description: "ID do tenant",
          },
          moduleId: {
            type: "string",
            description: "ID do módulo a configurar (ex: 'projetos')",
          },
          configuration: {
            type: "object",
            description: "Objeto ModuleConfiguration com customEntities, customWorkflows, etc. Segue a estrutura definida em module.interface.ts",
          },
          userId: {
            type: "string",
            description: "ID do utilizador que está a configurar o módulo",
          },
        },
        required: ["tenantId", "moduleId", "configuration", "userId"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "configure_logistics_module",
      description: "Ativa e configura o módulo de Logística/Inventário com setup inicial: armazém central, produtos base, e regras de reposição. Use quando utilizador pede 'ativar gestão de inventário', 'configurar logística', 'gerir stock', etc.",
      parameters: {
        type: "object",
        properties: {
          industryType: {
            type: "string",
            enum: ["construction", "events", "retail", "manufacturing", "general"],
            description: "Tipo de indústria para template adequado (construção, eventos, retalho, manufatura, geral)",
          },
          warehouseName: {
            type: "string",
            description: "Nome do armazém central padrão (ex: 'Armazém Central Lisboa'). Default: 'Armazém Central'",
          },
          createSampleProducts: {
            type: "boolean",
            description: "Se deve criar produtos de exemplo adequados à indústria (default: true)",
          },
          enableAutoReorder: {
            type: "boolean",
            description: "Se deve configurar regras automáticas de reposição (default: true)",
          },
        },
        required: ["industryType"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_warehouse",
      description: "Cria um novo armazém (central, projeto, rental). Use quando utilizador pede 'criar armazém', 'adicionar warehouse', etc.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Nome do armazém (ex: 'Armazém Porto', 'Obra #45 - Site')",
          },
          type: {
            type: "string",
            enum: ["central", "project", "rental", "virtual"],
            description: "Tipo de armazém: central (permanente), project (temporário obra), rental (aluguer equipamentos), virtual (lógico)",
          },
          address: {
            type: "string",
            description: "Morada completa (opcional)",
          },
          city: {
            type: "string",
            description: "Cidade (opcional)",
          },
          postalCode: {
            type: "string",
            description: "Código postal (opcional)",
          },
          linkedProjectId: {
            type: "string",
            description: "ID do projeto a que está ligado (apenas para type=project)",
          },
          capacity: {
            type: "number",
            description: "Capacidade total (m² ou paletes, opcional)",
          },
        },
        required: ["name", "type"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "setup_reorder_rules",
      description: "Configura regras de reposição automática para produto específico ou múltiplos produtos. Use quando utilizador pede 'configurar reposição automática', 'alertas de stock baixo', 'reorder quando baixar de X', etc.",
      parameters: {
        type: "object",
        properties: {
          productId: {
            type: "string",
            description: "ID do produto (se configurar 1 regra específica)",
          },
          productIds: {
            type: "array",
            items: { type: "string" },
            description: "IDs dos produtos (se configurar múltiplas regras de uma vez)",
          },
          warehouseId: {
            type: "string",
            description: "ID do armazém onde aplicar regra (opcional, se omitido aplica a todos)",
          },
          minQuantity: {
            type: "number",
            description: "Quantidade mínima que dispara reposição",
          },
          maxQuantity: {
            type: "number",
            description: "Quantidade máxima a encomendar",
          },
          leadTimeDays: {
            type: "number",
            description: "Prazo de entrega em dias (default: 7)",
          },
        },
        oneOf: [
          { required: ["productId", "minQuantity", "maxQuantity"] },
          { required: ["productIds", "minQuantity", "maxQuantity"] }
        ],
      },
    },
  },
];

/**
 * Helper: Get current phase from conversations table
 */
export async function getCurrentPhaseFromDB(tenantId: string, environment: string): Promise<number> {
  const { conversations } = await import("@shared/schema");
  const { eq, and, desc } = await import("drizzle-orm");
  
  const [conv] = await db
    .select()
    .from(conversations)
    .where(and(
      eq(conversations.tenantId, tenantId),
      eq(conversations.agentType, "studio"),
      eq(conversations.environment, environment),
      eq(conversations.status, "active")
    ))
    .orderBy(desc(conversations.updatedAt))
    .limit(1);

  return conv?.currentPhase || 1;
}

/**
 * Helper: Check if tenant is in new_setup scenario
 */
async function isNewSetupScenario(tenantId: string): Promise<boolean> {
  const { userTenants, customEntities, configurationCheckpoints } = await import("@shared/schema");
  const { eq, and } = await import("drizzle-orm");
  
  const tenantWithProduction = await db
    .select()
    .from(userTenants)
    .where(and(
      eq(userTenants.tenantId, tenantId),
      eq(userTenants.activeEnvironment, "production")
    ))
    .limit(1);

  if (tenantWithProduction.length > 0) return false;

  const customEntitiesCount = await db
    .select()
    .from(customEntities)
    .where(and(
      eq(customEntities.tenantId, tenantId),
      eq(customEntities.isDeleted, false)
    ))
    .limit(1);

  if (customEntitiesCount.length > 0) return false;

  const checkpointsCount = await db
    .select()
    .from(configurationCheckpoints)
    .where(eq(configurationCheckpoints.tenantId, tenantId))
    .limit(1);

  if (checkpointsCount.length > 0) return false;

  return true;
}

/**
 * Helper: Call Architect Auto-Review
 * Automatically reviews code changes when tasks are marked as completed
 */
async function callArchitectReview(params: {
  task: string;
  filesModified: string[];
  tenantId: string;
  userId: string;
}): Promise<{ hasIssues: boolean; feedback: string; reviewId?: number; score?: number }> {
  try {
    console.log(`[Architect Auto-Review] Reviewing task: "${params.task}"`);
    console.log(`[Architect Auto-Review] Files modified: ${params.filesModified.join(', ')}`);

    // Request code review via codeReviewService
    const reviewId = await codeReviewService.requestReview({
      tenantId: params.tenantId,
      filesModified: params.filesModified,
      changeDescription: params.task,
      requestedBy: params.userId,
    });

    console.log(`[Architect Auto-Review] Review ${reviewId} created, executing...`);

    // Execute the review
    const result = await codeReviewService.executeReview(reviewId);

    console.log(`[Architect Auto-Review] Review ${reviewId} completed with score ${result.overallScore}/10`);

    // Determine if there are blocking issues (score < 7 or critical issues present)
    const hasIssues = result.overallScore < 7 || result.criticalIssues.length > 0;

    // Build feedback message
    let feedback = `**Architect Review (Score: ${result.overallScore}/10)**\n\n`;
    feedback += `**Recommendation:** ${result.recommendation}\n\n`;

    if (result.criticalIssues.length > 0) {
      feedback += `**🚨 Critical Issues (${result.criticalIssues.length}):**\n`;
      result.criticalIssues.forEach((issue, i) => {
        feedback += `${i + 1}. ${issue}\n`;
      });
      feedback += '\n';
    }

    if (result.warnings.length > 0) {
      feedback += `**⚠️ Warnings (${result.warnings.length}):**\n`;
      result.warnings.forEach((warning, i) => {
        feedback += `${i + 1}. ${warning}\n`;
      });
      feedback += '\n';
    }

    if (result.suggestions.length > 0) {
      feedback += `**💡 Suggestions (${result.suggestions.length}):**\n`;
      result.suggestions.forEach((suggestion, i) => {
        feedback += `${i + 1}. ${suggestion}\n`;
      });
      feedback += '\n';
    }

    if (hasIssues) {
      feedback += '\n**❌ Task cannot be marked as completed. Fix critical issues first.**';
    } else {
      feedback += '\n**✅ Quality check passed. Task can be completed.**';
    }

    return {
      hasIssues,
      feedback,
      reviewId,
      score: result.overallScore,
    };
  } catch (error) {
    console.error('[Architect Auto-Review] Error:', error);
    // On error, allow task to complete but log the issue
    return {
      hasIssues: false,
      feedback: `⚠️ Auto-review encountered an error: ${error instanceof Error ? error.message : 'Unknown error'}. Task marked as completed without review.`,
    };
  }
}

/**
 * Execute Configuration Studio tool
 */
export async function executeStudioTool(
  toolName: string,
  args: any,
  tenantId: string,
  environment: "sandbox" | "production",
  userId: string = "system"
): Promise<{ success: boolean; data?: any; error?: string; message?: string }> {
  
  if (environment !== "sandbox") {
    return {
      success: false,
      error: "Configuration Studio tools can only be used in SANDBOX environment. Switch to sandbox first.",
      explanation: "Por segurança, apenas podes modificar a configuração no ambiente SANDBOX. Isto protege o teu sistema em produção de alterações acidentais.",
      suggestedAction: "Muda para o ambiente SANDBOX usando o seletor de ambiente no topo da página, e depois tenta novamente."
    };
  }

  try {
    switch (toolName) {
      case "get_current_phase": {
        const isNewSetup = await isNewSetupScenario(tenantId);
        
        if (!isNewSetup) {
          return {
            success: true,
            data: { phase: 4, scenario: "live_optimization" },
            message: "Live optimization scenario - no phase restrictions",
          };
        }

        const currentPhase = await getCurrentPhaseFromDB(tenantId, environment);
        const phaseNames = ["", "Discovery", "Blueprint", "Confirmation", "Build"];
        
        return {
          success: true,
          data: { 
            phase: currentPhase, 
            phaseName: phaseNames[currentPhase],
            scenario: "new_setup"
          },
          message: `Currently in Phase ${currentPhase}: ${phaseNames[currentPhase]}`,
        };
      }

      case "advance_phase": {
        const { reason } = args;
        const isNewSetup = await isNewSetupScenario(tenantId);
        
        if (!isNewSetup) {
          return {
            success: true,
            data: { phase: 4, scenario: "live_optimization" },
            message: "Live optimization scenario - no phase restrictions, always in Phase 4",
          };
        }

        const currentPhase = await getCurrentPhaseFromDB(tenantId, environment);
        const targetPhase = currentPhase + 1;

        if (targetPhase > 4) {
          return {
            success: false,
            error: "Already in final phase (Build)",
          };
        }

        // 🔒 FIX 1: Query active conversation FIRST to get conversationId
        const [conv] = await db
          .select()
          .from(conversations)
          .where(and(
            eq(conversations.tenantId, tenantId),
            eq(conversations.agentType, "studio"),
            eq(conversations.environment, environment),
            eq(conversations.status, "active")
          ))
          .orderBy(desc(conversations.updatedAt))
          .limit(1);

        if (!conv) {
          return {
            success: false,
            error: "No active conversation found for Configuration Studio",
          };
        }

        // ⚠️ VALIDATION: Check user confirmation before advancing (Phases 2+)
        // For Phase 1→2: If validate_blueprint_requirements passed, that IS the confirmation
        // For Phase 2→3 and 3→4: Need explicit confirmation
        
        if (targetPhase > 2) {  // Only enforce strict confirmation for Phase 2→3 and 3→4
          const EXPLICIT_CONFIRMATIONS = [
            'confirm',
            'confirmo',
            'yes proceed',
            'sim avançar',
            'can proceed',
            'pode avançar',
            'approved',
            'aprovado',
            'sim',
            'yes',
            'ok',
            'avança',
            'proceed'
          ];

          const { conversationMessages } = await import("@shared/schema");
          const { gte } = await import("drizzle-orm");
          
          const [lastUserMessage] = await db
            .select()
            .from(conversationMessages)
            .where(and(
              eq(conversationMessages.tenantId, tenantId),
              eq(conversationMessages.agentType, "studio"),
              eq(conversationMessages.role, "user"),
              gte(conversationMessages.createdAt, conv.createdAt)
            ))
            .orderBy(desc(conversationMessages.createdAt))
            .limit(1);

          const userConfirmed = lastUserMessage?.content && 
            EXPLICIT_CONFIRMATIONS.some(phrase => 
              lastUserMessage.content.toLowerCase().trim().includes(phrase)
            );

          if (!userConfirmed) {
            const phaseNames = ["", "Discovery", "Blueprint", "Confirmation", "Build"];
            return {
              success: false,
              message: `⚠️ Não podes avançar de fase sem confirmação EXPLÍCITA do user. O user precisa confirmar. Pergunta: 'Posso avançar para ${phaseNames[targetPhase]}?' e aguarda resposta explícita (ex: "sim", "confirmo", "pode avançar").`
            };
          }
        }

        const phaseData = (conv?.phaseData || {}) as {
          requirementsCollected?: boolean;
          blueprintGenerated?: boolean;
          blueprintConfirmed?: boolean;
        };

        // 🔄 AUTO-RECOVERY: If validation fails, try to diagnose and fix automatically
        let validationFailed = false;
        let validationError = "";
        
        switch (targetPhase) {
          case 2:
            if (!phaseData.requirementsCollected) {
              validationFailed = true;
              validationError = "requirements not collected";
            }
            break;
          case 3:
            if (!phaseData.blueprintGenerated) {
              validationFailed = true;
              validationError = "blueprint not generated";
            }
            break;
          case 4:
            if (!phaseData.blueprintConfirmed) {
              validationFailed = true;
              validationError = "blueprint not confirmed";
            }
            break;
        }

        // If validation failed, automatically diagnose and attempt recovery
        if (validationFailed) {
          console.log(`[advance_phase] ⚠️ Validation failed: ${validationError}. Attempting auto-recovery...`);
          
          // Attempt auto-diagnosis and fix
          try {
            const diagnosisResult = await executeStudioTool({
              toolName: "diagnose_and_fix",
              args: { reason: `advance_phase failed: ${validationError}` },
              tenantId,
              environment
            });

            console.log('[advance_phase] Diagnosis result:', diagnosisResult);

            // Check if the fix was successful
            if (diagnosisResult.success && diagnosisResult.data?.fixedProblems > 0) {
              // Re-check the phaseData after fix
              const [updatedConv] = await db
                .select()
                .from(conversations)
                .where(and(
                  eq(conversations.tenantId, tenantId),
                  eq(conversations.agentType, "studio"),
                  eq(conversations.environment, environment),
                  eq(conversations.status, "active")
                ))
                .orderBy(desc(conversations.updatedAt))
                .limit(1);

              const updatedPhaseData = (updatedConv?.phaseData || {}) as {
                requirementsCollected?: boolean;
                blueprintGenerated?: boolean;
                blueprintConfirmed?: boolean;
              };

              // Re-validate after fix
              let stillFailing = false;
              switch (targetPhase) {
                case 2:
                  stillFailing = !updatedPhaseData.requirementsCollected;
                  break;
                case 3:
                  stillFailing = !updatedPhaseData.blueprintGenerated;
                  break;
                case 4:
                  stillFailing = !updatedPhaseData.blueprintConfirmed;
                  break;
              }

              if (!stillFailing) {
                console.log('[advance_phase] ✅ Auto-recovery successful! Proceeding with phase advance.');
                // Update conv reference to use updated data
                (conv as any).phaseData = updatedPhaseData;
              } else {
                return {
                  success: false,
                  error: `Auto-recovery attempted but failed to resolve: ${validationError}`,
                  data: {
                    diagnosisResult,
                    validationError
                  }
                };
              }
            } else {
              return {
                success: false,
                error: `Validation failed (${validationError}) and auto-recovery could not fix it.`,
                data: {
                  diagnosisResult,
                  validationError
                }
              };
            }
          } catch (diagError) {
            console.error('[advance_phase] Auto-recovery failed:', diagError);
            return {
              success: false,
              error: `Validation failed (${validationError}) and auto-recovery encountered an error.`,
              data: { validationError }
            };
          }
        }

        if (conv) {
          await db
            .update(conversations)
            .set({ 
              currentPhase: targetPhase,
              updatedAt: new Date()
            })
            .where(eq(conversations.id, conv.id));
        }

        const phaseNames = ["", "Discovery", "Blueprint", "Confirmation", "Build"];
        
        // 🔨 AUTO-CREATE TASK LIST when advancing to Phase 2 (Blueprint)
        // This gives immediate visual feedback to the user that work is in progress
        let taskListData = null;
        if (targetPhase === 2) {
          console.log('[advance_phase] Entering Phase 2 - auto-creating task list for Blueprint phase');
          
          // Default tasks for Phase 2 (Blueprint)
          const defaultTasks = [
            {
              id: `task-blueprint-1-${Date.now()}`,
              content: "Analisar requisitos e definir entidades principais",
              status: "in_progress"
            },
            {
              id: `task-blueprint-2-${Date.now()}`,
              content: "Criar Blueprint detalhado com entidades, campos e relações",
              status: "pending"
            },
            {
              id: `task-blueprint-3-${Date.now()}`,
              content: "Documentar automações e fluxos de trabalho",
              status: "pending"
            }
          ];
          
          taskListData = {
            tasks: defaultTasks
          };
          
          console.log('[advance_phase] Task list created with', defaultTasks.length, 'tasks');
        }
        
        return {
          success: true,
          data: { 
            phase: targetPhase, 
            phaseName: phaseNames[targetPhase],
            taskList: taskListData // Include task list in response so frontend can display it
          },
          message: `✅ Advanced to Phase ${targetPhase}: ${phaseNames[targetPhase]}. Reason: ${reason}`,
        };
      }

      case "go_back_phase": {
        const { reason } = args;
        const isNewSetup = await isNewSetupScenario(tenantId);
        
        if (!isNewSetup) {
          return {
            success: false,
            error: "⚠️ go_back_phase only works in new_setup scenario. In live_optimization, you're always in Phase 4.",
          };
        }

        const currentPhase = await getCurrentPhaseFromDB(tenantId, environment);
        
        if (currentPhase === 1) {
          return {
            success: false,
            error: "⚠️ Já estás na Fase 1 (Discovery) - é a primeira fase, não há fase anterior!",
          };
        }

        const previousPhase = currentPhase - 1;
        const phaseNames = ["", "Discovery", "Blueprint", "Confirmation", "Build"];

        // Find active conversation
        const [conv] = await db
          .select()
          .from(conversations)
          .where(and(
            eq(conversations.tenantId, tenantId),
            eq(conversations.agentType, "studio"),
            eq(conversations.environment, environment),
            eq(conversations.status, "active")
          ))
          .orderBy(desc(conversations.updatedAt))
          .limit(1);

        if (!conv) {
          return {
            success: false,
            error: "No active conversation found for Configuration Studio",
          };
        }

        // Update conversation phase
        await db
          .update(conversations)
          .set({ 
            currentPhase: previousPhase,
            updatedAt: new Date()
          })
          .where(eq(conversations.id, conv.id));
        
        return {
          success: true,
          data: { 
            phase: previousPhase, 
            phaseName: phaseNames[previousPhase],
            previousPhase: currentPhase
          },
          message: `⬅️ Voltaste para a Fase ${previousPhase}: ${phaseNames[previousPhase]}. Motivo: ${reason}`,
        };
      }

      case "create_custom_entity": {
        const isNewSetup = await isNewSetupScenario(tenantId);
        
        if (isNewSetup) {
          const currentPhase = await getCurrentPhaseFromDB(tenantId, environment);
          if (currentPhase < 4) {
            return {
              success: false,
              error: `🚨 Cannot create entities in Phase ${currentPhase}. You must complete Discovery (1), Blueprint (2), and Confirmation (3) first. Use get_current_phase to check your progress.`,
            };
          }
        }
        const { entityKey, displayName, displayNamePlural, description, icon, category } = args;

        const existing = await db
          .select()
          .from(customEntities)
          .where(and(
            eq(customEntities.tenantId, tenantId),
            eq(customEntities.entityKey, entityKey),
            eq(customEntities.isDeleted, false)
          ))
          .limit(1);

        if (existing.length > 0) {
          return {
            success: false,
            error: `Entidade '${entityKey}' já existe`,
            explanation: `A entidade '${entityKey}' já foi criada anteriormente no teu sistema. Cada entidade precisa de ter uma chave única para evitar conflitos.`,
            suggestedAction: `Podes:\n1. Usar um nome diferente (ex: '${entityKey}_v2', '${entityKey}_novo')\n2. Adicionar campos à entidade existente em vez de criar nova\n3. Ver lista de entidades existentes: use list_custom_entities\n4. Se quiseres substituir a antiga, apaga primeiro a entidade existente`
          };
        }

        const [newEntity] = await db
          .insert(customEntities)
          .values({
            tenantId,
            environment: "sandbox",
            entityKey,
            displayName,
            displayNamePlural,
            description: description || null,
            icon: icon || "Box",
            category: category || "custom",
            isActive: true,
            isDeleted: false,
            createdBy: userId,
          })
          .returning();

        return {
          success: true,
          data: newEntity,
          message: `✅ Entidade '${displayName}' criada com sucesso no sandbox!`,
          reasoning: `Criei a entidade '${displayName}' (chave: ${entityKey}) porque é necessária para estruturar os dados do teu negócio. ${description ? `Esta entidade vai servir para: ${description}.` : ''} Podes agora adicionar campos personalizados para capturar toda a informação relevante.`
        };
      }

      case "add_custom_field": {
        const isNewSetup = await isNewSetupScenario(tenantId);
        
        if (isNewSetup) {
          const currentPhase = await getCurrentPhaseFromDB(tenantId, environment);
          if (currentPhase < 4) {
            return {
              success: false,
              error: `🚨 Cannot add fields in Phase ${currentPhase}. You must complete Discovery (1), Blueprint (2), and Confirmation (3) first. Use get_current_phase to check your progress.`,
            };
          }
        }
        
        const { 
          entityId, 
          fieldKey, 
          displayName, 
          fieldType, 
          isRequired, 
          defaultValue, 
          validationRules, 
          options,
          relationEntityId 
        } = args;

        const entity = await db
          .select()
          .from(customEntities)
          .where(eq(customEntities.id, entityId))
          .limit(1);

        if (entity.length === 0) {
          return {
            success: false,
            error: "Entidade não encontrada",
            explanation: `Tentei adicionar um campo a uma entidade com ID '${entityId}', mas esta entidade não existe no sistema ou foi removida.`,
            suggestedAction: `Podes:\n1. Verificar o ID da entidade usando list_custom_entities\n2. Criar primeiro a entidade se ainda não existir\n3. Verificar se estás no ambiente correto (sandbox vs production)`
          };
        }

        const existingField = await db
          .select()
          .from(customFields)
          .where(and(
            eq(customFields.entityId, entityId),
            eq(customFields.fieldKey, fieldKey),
            eq(customFields.isDeleted, false)
          ))
          .limit(1);

        if (existingField.length > 0) {
          return {
            success: false,
            error: `Campo '${fieldKey}' já existe nesta entidade`,
            explanation: `O campo '${fieldKey}' já foi adicionado anteriormente à entidade '${entity[0].displayName}'. Cada campo precisa de ter uma chave única dentro da mesma entidade.`,
            suggestedAction: `Podes:\n1. Usar um nome diferente para o campo (ex: '${fieldKey}_2', '${fieldKey}_novo')\n2. Editar o campo existente usando edit_custom_field\n3. Ver todos os campos da entidade usando get_entity_details`
          };
        }

        const fieldOrder = await db
          .select({ maxOrder: customFields.fieldOrder })
          .from(customFields)
          .where(eq(customFields.entityId, entityId))
          .orderBy(desc(customFields.fieldOrder))
          .limit(1);

        const [newField] = await db
          .insert(customFields)
          .values({
            tenantId,
            entityId,
            fieldKey,
            displayName,
            fieldType,
            isRequired: isRequired || false,
            defaultValue: defaultValue || null,
            validationRules: validationRules || null,
            fieldOptions: options || null,
            fieldOrder: (fieldOrder[0]?.maxOrder || 0) + 1,
            isDeleted: false,
          })
          .returning();

        return {
          success: true,
          data: newField,
          message: `✅ Campo '${displayName}' adicionado à entidade '${entity[0].displayName}'!`,
          reasoning: `Adicionei o campo '${displayName}' (tipo: ${fieldType}) à entidade '${entity[0].displayName}' para capturar informação específica do teu negócio. ${isRequired ? 'Este campo é obrigatório, garantindo que nenhum registo fica incompleto.' : 'Este campo é opcional, dando flexibilidade no preenchimento.'} ${defaultValue ? `Valor padrão: ${defaultValue}.` : ''}`
        };
      }

      case "list_custom_entities": {
        const { includeFields } = args;

        const entities = await db
          .select()
          .from(customEntities)
          .where(and(
            eq(customEntities.tenantId, tenantId),
            eq(customEntities.environment, "sandbox"),
            eq(customEntities.isDeleted, false)
          ));

        if (includeFields) {
          const entitiesWithFields = await Promise.all(
            entities.map(async (entity) => {
              const fields = await db
                .select()
                .from(customFields)
                .where(and(
                  eq(customFields.entityId, entity.id),
                  eq(customFields.isDeleted, false)
                ))
                .orderBy(customFields.fieldOrder);

              return { ...entity, fields };
            })
          );

          return {
            success: true,
            data: entitiesWithFields,
          };
        }

        return {
          success: true,
          data: entities,
        };
      }

      case "get_entity_details": {
        const { entityId } = args;

        const [entity] = await db
          .select()
          .from(customEntities)
          .where(eq(customEntities.id, entityId))
          .limit(1);

        if (!entity) {
          return {
            success: false,
            error: "Entidade não encontrada",
          };
        }

        const fields = await db
          .select()
          .from(customFields)
          .where(and(
            eq(customFields.entityId, entityId),
            eq(customFields.isDeleted, false)
          ))
          .orderBy(customFields.fieldOrder);

        return {
          success: true,
          data: { ...entity, fields },
        };
      }

      case "edit_custom_field": {
        const { fieldId, displayName, isRequired, defaultValue, validationRules, options } = args;

        const updateData: any = {};
        if (displayName !== undefined) updateData.displayName = displayName;
        if (isRequired !== undefined) updateData.isRequired = isRequired;
        if (defaultValue !== undefined) updateData.defaultValue = defaultValue;
        if (validationRules !== undefined) updateData.validationRules = validationRules;
        if (options !== undefined) updateData.fieldOptions = options;

        const [updatedField] = await db
          .update(customFields)
          .set(updateData)
          .where(eq(customFields.id, fieldId))
          .returning();

        return {
          success: true,
          data: updatedField,
          message: `✅ Campo atualizado com sucesso!`,
        };
      }

      case "remove_custom_field": {
        const { fieldId, confirmDataLoss } = args;

        if (!confirmDataLoss) {
          return {
            success: false,
            error: "É necessário confirmar explicitamente que dados podem ser perdidos",
            explanation: "Remover um campo é uma ação destrutiva que pode apagar dados existentes. Preciso de confirmação explícita para garantir que compreendes o impacto.",
            suggestedAction: "Adiciona o parâmetro confirmDataLoss: true à chamada para confirmar que compreendes que dados podem ser perdidos."
          };
        }

        const [deletedField] = await db
          .update(customFields)
          .set({ isDeleted: true })
          .where(eq(customFields.id, fieldId))
          .returning();

        return {
          success: true,
          data: deletedField,
          message: `✅ Campo removido (soft delete)`,
        };
      }

      case "create_checkpoint": {
        const { description } = args;

        const entities = await db
          .select()
          .from(customEntities)
          .where(and(
            eq(customEntities.tenantId, tenantId),
            eq(customEntities.environment, "sandbox"),
            eq(customEntities.isDeleted, false)
          ));

        const allFields = await db
          .select()
          .from(customFields)
          .where(eq(customFields.isDeleted, false));

        const configSnapshot = {
          entities: entities,
          fields: allFields.filter(f => 
            entities.some(e => e.id === f.entityId)
          ),
          timestamp: new Date().toISOString(),
        };

        const lastVersion = await db
          .select({ maxVersion: configurationCheckpoints.version })
          .from(configurationCheckpoints)
          .where(and(
            eq(configurationCheckpoints.tenantId, tenantId),
            eq(configurationCheckpoints.environment, "sandbox")
          ))
          .orderBy(desc(configurationCheckpoints.version))
          .limit(1);

        const [checkpoint] = await db
          .insert(configurationCheckpoints)
          .values({
            tenantId,
            environment: "sandbox",
            version: (lastVersion[0]?.maxVersion || 0) + 1,
            changeType: "manual_checkpoint",
            changeSummary: description,
            beforeSnapshot: configSnapshot,
            afterSnapshot: configSnapshot,
            createdBy: userId,
          })
          .returning();

        return {
          success: true,
          data: checkpoint,
          message: `✅ Checkpoint criado: "${description}"`,
        };
      }

      case "list_checkpoints": {
        const { limit } = args;

        const checkpoints = await db
          .select()
          .from(configurationCheckpoints)
          .where(and(
            eq(configurationCheckpoints.tenantId, tenantId),
            eq(configurationCheckpoints.environment, "sandbox")
          ))
          .orderBy(desc(configurationCheckpoints.createdAt))
          .limit(limit || 10);

        return {
          success: true,
          data: checkpoints,
        };
      }

      case "rollback_to_checkpoint": {
        const { checkpointId, confirmRollback } = args;

        if (!confirmRollback) {
          return {
            success: false,
            error: "É necessário confirmar explicitamente o rollback",
          };
        }

        const [checkpoint] = await db
          .select()
          .from(configurationCheckpoints)
          .where(eq(configurationCheckpoints.id, checkpointId))
          .limit(1);

        if (!checkpoint) {
          return {
            success: false,
            error: "Checkpoint não encontrado",
            explanation: `O checkpoint com ID '${checkpointId}' não existe no sistema ou foi removido.`,
            suggestedAction: "Usa list_checkpoints para ver os checkpoints disponíveis e escolhe um ID válido."
          };
        }

        const snapshot = checkpoint.beforeSnapshot as any;

        await db
          .update(customEntities)
          .set({ isDeleted: true })
          .where(and(
            eq(customEntities.tenantId, tenantId),
            eq(customEntities.environment, "sandbox")
          ));

        await db
          .update(customFields)
          .set({ isDeleted: true })
          .where(eq(customFields.isDeleted, false));

        for (const entity of snapshot.entities) {
          await db.insert(customEntities).values({
            ...entity,
            id: entity.id,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        }

        for (const field of snapshot.fields) {
          await db.insert(customFields).values({
            ...field,
            id: field.id,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        }

        return {
          success: true,
          message: `✅ Rollback completo para checkpoint: "${checkpoint.changeSummary}"`,
        };
      }

      case "upload_data_files": {
        const { fileId, fileName } = args;
        
        console.log(`[upload_data_files] Analyzing file: ${fileName} (ID: ${fileId})`);
        
        // Determine file type
        const fileExtension = fileName.toLowerCase().split('.').pop();
        
        if (!['xlsx', 'xls', 'csv'].includes(fileExtension || '')) {
          return {
            success: false,
            error: `Tipo de ficheiro não suportado: ${fileExtension}. Aceito apenas Excel (.xlsx, .xls) ou CSV (.csv)`,
          };
        }
        
        // Load file from storage
        const filePath = path.join(process.cwd(), 'uploads', 'temp', fileId);
        
        try {
          const fileBuffer = await fs.readFile(filePath);
          
          // Analyze file based on type
          let analyzedData;
          if (fileExtension === 'csv') {
            analyzedData = await analyzeCsvFile(fileBuffer, fileName);
          } else {
            analyzedData = await analyzeExcelFile(fileBuffer, fileName);
          }
          
          console.log(`[upload_data_files] ✅ Analysis complete: ${analyzedData.entityKey} with ${analyzedData.columns.length} columns`);
          
          // Save to database
          const [savedFile] = await db
            .insert(uploadedDataFiles)
            .values({
              tenantId,
              fileName,
              fileType: fileExtension,
              filePath: fileId,
              analyzedSchema: analyzedData,
              uploadedBy: userId,
            })
            .returning();
          
          console.log(`[upload_data_files] ✅ Saved to database: ${savedFile.id}`);
          
          return {
            success: true,
            data: {
              fileId: savedFile.id,
              entityKey: analyzedData.entityKey,
              displayName: analyzedData.displayName,
              rowCount: analyzedData.rowCount,
              columnsCount: analyzedData.columns.length,
              columns: analyzedData.columns.map(col => ({
                name: col.name,
                displayName: col.displayName,
                type: col.type,
                isRequired: col.isRequired,
                hasRelation: !!col.possibleRelation,
              })),
              detectedRelations: analyzedData.detectedRelations,
              fullAnalysis: analyzedData,
            },
            message: `✅ Ficheiro "${fileName}" analisado com sucesso! Detectada entidade "${analyzedData.displayName}" com ${analyzedData.columns.length} campos e ${analyzedData.rowCount} registos.`,
          };
        } catch (error) {
          console.error(`[upload_data_files] Error analyzing file:`, error);
          return {
            success: false,
            error: `Erro ao analisar ficheiro: ${error instanceof Error ? error.message : 'Unknown error'}`,
          };
        }
      }

      case "generate_blueprint": {
        const { industry, businessSize, processes, existingSystems, painPoints } = args;

        console.log(`[generate_blueprint] 🚀 Delegating to Business Architect agent...`);

        // 📋 Import Business Architect Agent
        const { generateProfessionalBSP } = await import('./agents/business-architect');

        // 🔍 Get company info from tenant-specific schema (not public schema)
        const company = await selectOneFromTenantTable(
          tenantId,
          'company_info',
          sql`tenant_id = ${tenantId}`
        );

        // 🎯 Prepare diagnostic input for Business Architect
        const diagnosticInput = {
          companyName: company?.name || 'Empresa',
          sector: industry || company?.sector || 'Geral',
          companySize: businessSize || 'medium',
          painPoints: painPoints || [],
          currentTools: existingSystems ? [existingSystems] : [],
          mainGoal: processes && processes.length > 0 
            ? `Automatizar e gerir: ${processes.join(', ')}` 
            : 'Optimizar processos de gestão',
          processes: processes || [],
          additionalContext: company?.businessDescription || '',
        };

        console.log(`[generate_blueprint] Diagnostic input:`, diagnosticInput);

        // 🤖 Generate Professional BSP using Business Architect
        const professionalBSP = await generateProfessionalBSP(diagnosticInput);

        console.log(`[generate_blueprint] ✅ Professional BSP generated with ${Object.keys(professionalBSP.sections).length} sections`);

        // 🚨 GUARDAR NA BASE DE DADOS - phaseData table
        const [savedBlueprint] = await db
          .insert(phaseData)
          .values({
            tenantId,
            environment,
            phaseName: 'blueprint',
            collectedData: {
              bsp_version: professionalBSP.bsp_version,
              generatedAt: professionalBSP.generatedAt,
              sections: professionalBSP.sections,
              diagnostic: diagnosticInput,
            },
          })
          .returning();

        console.log(`[generate_blueprint] ✅ Professional BSP saved to database: ${savedBlueprint.id}`);

        // 🔥 CRITICAL: Mark blueprintGenerated flag in conversation phaseData
        // This allows advance_phase to move from Phase 2 → Phase 3
        const conv = await db
          .select()
          .from(conversations)
          .where(and(
            eq(conversations.tenantId, tenantId),
            eq(conversations.agentType, 'studio'),
            eq(conversations.environment, environment),
            eq(conversations.status, 'active')
          ))
          .orderBy(desc(conversations.updatedAt))
          .limit(1);

        if (conv.length > 0) {
          const currentPhaseData = (conv[0].phaseData || {}) as Record<string, any>;
          await db
            .update(conversations)
            .set({
              phaseData: {
                ...currentPhaseData,
                blueprintGenerated: true,
              },
              updatedAt: new Date()
            })
            .where(eq(conversations.id, conv[0].id));
          
          console.log(`[generate_blueprint] ✅ Marked blueprintGenerated=true in conversation`);
        }

        return {
          success: true,
          data: {
            bsp_version: professionalBSP.bsp_version,
            blueprintId: savedBlueprint.id,
            sectionsCount: Object.keys(professionalBSP.sections).length,
            sections: professionalBSP.sections,
            generatedAt: professionalBSP.generatedAt,
          },
          message: `✅ Business Blueprint profissional gerado! 6 secções criadas para ${diagnosticInput.companyName} (${diagnosticInput.sector})`,
        };
      }

      case "search_blueprints": {
        const { industry, tags, limit } = args;

        const conditions = [eq(blueprints.isPublic, true)];
        if (industry) {
          conditions.push(eq(blueprints.industry, industry));
        }

        const results = await db
          .select()
          .from(blueprints)
          .where(and(...conditions))
          .orderBy(desc(blueprints.successScore), desc(blueprints.useCount))
          .limit(limit || 5);

        return {
          success: true,
          data: results.map(b => ({
            id: b.id,
            name: b.name,
            description: b.description,
            industry: b.industry,
            businessSize: b.businessSize,
            tags: b.tags,
            useCount: b.useCount,
            successScore: b.successScore,
            blueprintData: b.blueprintData, // Estrutura completa
          })),
          message: `✅ Encontrados ${results.length} blueprints similares`,
        };
      }

      case "preview_build_plan": {
        const { planDescription, entities, estimatedTime} = args;

        const preview = {
          summary: planDescription,
          entities: entities,
          totalEntities: entities.length,
          totalFieldsEstimate: entities.reduce((sum: number, e: any) => sum + (e.fieldsCount || 0), 0),
          estimatedTime: estimatedTime || '~30 segundos',
          warning: '⚠️ Esta ação irá modificar a configuração do ERP no ambiente SANDBOX',
          checkpointRecommendation: 'Recomendo criar um checkpoint antes de prosseguir',
        };

        return {
          success: true,
          data: preview,
          message: `📋 Preview: Vai criar ${entities.length} entidades com ~${preview.totalFieldsEstimate} campos`,
        };
      }

      case "validate_blueprint_requirements": {
        try {
          const validation = await blueprintValidator.validateAllRequirements(tenantId);
          
          if (!validation.canProceed) {
            const missingList = validation.missing.map(m => 
              `❌ **${m.name}** (${m.type}): ${m.message}`
            ).join('\n');
            
            return {
              success: false,
              data: validation,
              error: `🚫 Não podes gerar Blueprint ainda! Faltam ${validation.missing.length} requisito(s):\n\n${missingList}\n\n💡 Recolhe estas informações primeiro e usa mark_requirement_collected.`
            };
          }
          
          // ✅ Mark requirements as collected in conversation phaseData
          const [conv] = await db
            .select()
            .from(conversations)
            .where(and(
              eq(conversations.tenantId, tenantId),
              eq(conversations.agentType, "studio"),
              eq(conversations.environment, environment),
              eq(conversations.status, "active")
            ))
            .orderBy(desc(conversations.updatedAt))
            .limit(1);

          if (conv) {
            const currentPhaseData = (conv.phaseData || {}) as Record<string, any>;
            await db
              .update(conversations)
              .set({ 
                phaseData: { ...currentPhaseData, requirementsCollected: true },
                updatedAt: new Date()
              })
              .where(eq(conversations.id, conv.id));
          }
          
          return {
            success: true,
            data: validation,
            message: `✅ Todos os requisitos validados! (${validation.collected}/${validation.totalRequirements})\n\nPodes avançar para a próxima fase com advance_phase.`
          };
        } catch (error) {
          console.error('[validate_blueprint_requirements] Error:', error);
          return {
            success: false,
            error: `Erro ao validar requisitos: ${error instanceof Error ? error.message : 'Erro desconhecido'}`
          };
        }
      }

      case "mark_requirement_collected": {
        const { requirementId, collectedData, triggeredBy } = args;
        
        try {
          await blueprintValidator.markRequirementCollected(
            tenantId,
            requirementId,
            collectedData,
            triggeredBy
          );
          
          return {
            success: true,
            data: { requirementId, collectedData },
            message: `✅ Requisito '${requirementId}' marcado como recolhido!`
          };
        } catch (error) {
          console.error('[mark_requirement_collected] Error:', error);
          return {
            success: false,
            error: `Erro ao marcar requisito: ${error instanceof Error ? error.message : 'Erro desconhecido'}`
          };
        }
      }

      case "get_requirements_status": {
        try {
          const validation = await blueprintValidator.validateAllRequirements(tenantId);
          const activeReqs = await blueprintValidator.getActiveRequirements(tenantId);
          
          const statusSummary = {
            totalActive: validation.totalRequirements,
            collected: validation.collected,
            missing: validation.missing.length,
            canProceedToBlueprint: validation.canProceed,
            requirements: validation.missing.length > 0 ? validation.missing : null,
            progress: `${validation.collected}/${validation.totalRequirements}`
          };
          
          const message = validation.canProceed
            ? `✅ Progresso: ${validation.collected}/${validation.totalRequirements} requisitos recolhidos. Pronto para Blueprint!`
            : `📊 Progresso: ${validation.collected}/${validation.totalRequirements} requisitos recolhidos. Faltam ${validation.missing.length}.`;
          
          return {
            success: true,
            data: statusSummary,
            message
          };
        } catch (error) {
          console.error('[get_requirements_status] Error:', error);
          return {
            success: false,
            error: `Erro ao obter status: ${error instanceof Error ? error.message : 'Erro desconhecido'}`
          };
        }
      }

      case "activate_conditional_requirements": {
        const { conversationText } = args;
        
        try {
          const triggeredRequirements = blueprintValidator.detectTriggeredRequirements(conversationText);
          
          if (triggeredRequirements.length === 0) {
            return {
              success: true,
              data: { triggered: [] },
              message: "Nenhum requisito condicional detectado nesta conversa."
            };
          }
          
          await blueprintValidator.activateRequirements(
            tenantId,
            triggeredRequirements,
            `Auto-detected from: "${conversationText.substring(0, 100)}..."`
          );
          
          return {
            success: true,
            data: { triggered: triggeredRequirements },
            message: `✅ Activados ${triggeredRequirements.length} requisito(s) condicional(is): ${triggeredRequirements.join(', ')}`
          };
        } catch (error) {
          console.error('[activate_conditional_requirements] Error:', error);
          return {
            success: false,
            error: `Erro ao activar requisitos: ${error instanceof Error ? error.message : 'Erro desconhecido'}`
          };
        }
      }

      case "use_template": {
        const { templateName, customizations = {} } = args;
        
        try {
          const template = SYSTEM_TEMPLATES[templateName as keyof typeof SYSTEM_TEMPLATES];
          
          if (!template) {
            return {
              success: false,
              error: `Template '${templateName}' não encontrado. Disponíveis: ${Object.keys(SYSTEM_TEMPLATES).join(', ')}`
            };
          }
          
          console.log(`[use_template] Creating system from template: ${templateName}`);
          
          // Create all entities from template
          const createdEntities = [];
          for (const entityDef of template.entities) {
            // Create entity
            const entity = await db.insert(customEntities).values({
              tenantId,
              entityKey: entityDef.key,
              displayName: entityDef.name,
              displayNamePlural: entityDef.plural,
              description: entityDef.description,
              icon: "Database",
              createdBy: userId,
            }).returning();
            
            createdEntities.push(entity[0]);
            
            // Create fields for this entity
            for (let i = 0; i < entityDef.fields.length; i++) {
              const fieldName = entityDef.fields[i];
              await db.insert(customFields).values({
                tenantId,
                entityId: entity[0].id,
                fieldKey: fieldName.toLowerCase().replace(/\s+/g, '_'),
                displayName: fieldName,
                fieldType: "text",
                isRequired: i === 0, // First field is required
                orderIndex: i,
                createdBy: userId,
              });
            }
          }
          
          return {
            success: true,
            data: {
              template: templateName,
              templateDescription: template.description,
              entitiesCreated: createdEntities.length,
              entities: createdEntities.map(e => e.displayName),
            },
            message: `🚀 Template '${template.name}' aplicado com sucesso! Criadas ${createdEntities.length} entidades: ${createdEntities.map(e => e.displayName).join(', ')}`
          };
        } catch (error) {
          console.error('[use_template] Error:', error);
          return {
            success: false,
            error: `Erro ao aplicar template: ${error instanceof Error ? error.message : 'Erro desconhecido'}`
          };
        }
      }

      case "add_module": {
        const { moduleName, entities, relationsToExisting = [] } = args;
        
        try {
          console.log(`[add_module] Adding module: ${moduleName}`);
          
          const createdEntities = [];
          for (const entityDef of entities) {
            // Create entity
            const entity = await db.insert(customEntities).values({
              tenantId,
              entityKey: entityDef.name.toLowerCase().replace(/\s+/g, '_'),
              displayName: entityDef.name,
              displayNamePlural: entityDef.name + 's',
              description: `Parte do módulo: ${moduleName}`,
              icon: "Database",
              createdBy: userId,
            }).returning();
            
            createdEntities.push(entity[0]);
            
            // Create fields
            if (entityDef.fields && Array.isArray(entityDef.fields)) {
              for (let i = 0; i < entityDef.fields.length; i++) {
                const fieldName = entityDef.fields[i];
                await db.insert(customFields).values({
                  tenantId,
                  entityId: entity[0].id,
                  fieldKey: fieldName.toLowerCase().replace(/\s+/g, '_'),
                  displayName: fieldName,
                  fieldType: "text",
                  isRequired: i === 0,
                  orderIndex: i,
                  createdBy: userId,
                });
              }
            }
          }
          
          return {
            success: true,
            data: {
              moduleName,
              entitiesAdded: createdEntities.length,
              entities: createdEntities.map(e => e.displayName),
              relations: relationsToExisting,
            },
            message: `➕ Módulo '${moduleName}' adicionado com sucesso! ${createdEntities.length} entidades criadas: ${createdEntities.map(e => e.displayName).join(', ')}`
          };
        } catch (error) {
          console.error('[add_module] Error:', error);
          return {
            success: false,
            error: `Erro ao adicionar módulo: ${error instanceof Error ? error.message : 'Erro desconhecido'}`
          };
        }
      }

      case "detect_complexity": {
        const { userRequest } = args;
        
        try {
          // Simple heuristics to detect complexity
          const lowerRequest = userRequest.toLowerCase();
          
          // Keywords that suggest complexity
          const complexityIndicators = [
            'completo', 'complexo', 'erp', 'integração', 'automação', 'workflow',
            'multi', 'vários módulos', 'departamentos', 'multi-tenant'
          ];
          
          // Count entities mentioned
          const entityKeywords = ['tabela', 'entidade', 'módulo', 'gestão de'];
          const entityMentions = entityKeywords.reduce((count, keyword) => {
            const matches = lowerRequest.match(new RegExp(keyword, 'g'));
            return count + (matches ? matches.length : 0);
          }, 0);
          
          const hasComplexityIndicators = complexityIndicators.some(indicator => 
            lowerRequest.includes(indicator)
          );
          
          const isComplex = hasComplexityIndicators || entityMentions >= 4;
          
          return {
            success: true,
            data: {
              complexity: isComplex ? 'complex' : 'simple',
              entityCount: entityMentions,
              indicators: complexityIndicators.filter(ind => lowerRequest.includes(ind)),
              recommendation: isComplex 
                ? 'Use fluxo incremental: comece por módulo core e adicione features gradualmente'
                : 'Use template rápido ou criação directa - projecto simples!'
            },
            message: isComplex
              ? `🎯 Projecto COMPLEXO detectado (${entityMentions} entidades). Recomendo abordagem incremental.`
              : `🚀 Projecto SIMPLES detectado. Perfeito para template rápido ou criação directa!`
          };
        } catch (error) {
          console.error('[detect_complexity] Error:', error);
          return {
            success: false,
            error: `Erro ao detectar complexidade: ${error instanceof Error ? error.message : 'Erro desconhecido'}`
          };
        }
      }

      // Financial Grid Tools
      case "calculate_project_budget":
      case "explain_financial_result":
      case "record_actual_outcome":
      case "get_recent_budgets": {
        // Financial tools don't require sandbox environment
        const result = await executeFinancialTool(toolName, args, { tenantId, userId });
        return result;
      }

      case "web_search": {
        const { query } = args;
        
        try {
          const apiKey = process.env.PERPLEXITY_API_KEY;
          
          if (!apiKey) {
            console.error('[web_search] PERPLEXITY_API_KEY not found');
            return {
              success: false,
              error: 'API key da Perplexity não configurada. Configure em Secrets.'
            };
          }
          
          // Call Perplexity API for rich, up-to-date web search results
          const response = await fetch('https://api.perplexity.ai/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              model: 'sonar',
              messages: [
                {
                  role: 'system',
                  content: 'You are a helpful research assistant. Provide clear, accurate information with sources.'
                },
                {
                  role: 'user',
                  content: query
                }
              ],
              temperature: 0.2,
              max_completion_tokens: 500,
              stream: false
            })
          });
          
          if (!response.ok) {
            const errorText = await response.text();
            console.error('[web_search] Perplexity API error:', response.status, errorText);
            return {
              success: false,
              error: `Erro na API Perplexity (${response.status}): ${errorText}`
            };
          }
          
          const data = await response.json();
          
          // Extract answer and citations
          const answer = data.choices?.[0]?.message?.content || 'Sem resposta disponível';
          const citations = data.citations || [];
          
          // Build formatted response with sources
          let formattedResult = answer;
          if (citations.length > 0) {
            formattedResult += '\n\n📚 Fontes:\n' + citations.map((c: string, i: number) => {
              return `${i + 1}. ${c}`;
            }).join('\n');
          }
          
          return {
            success: true,
            data: {
              query,
              answer,
              citations,
              formattedResult,
              source: 'Perplexity AI'
            },
            message: `🌐 Pesquisa concluída: ${query}\n\n${formattedResult}`
          };
        } catch (error) {
          console.error('[web_search] Error:', error);
          return {
            success: false,
            error: `Erro ao pesquisar na internet: ${error instanceof Error ? error.message : 'Erro desconhecido'}`
          };
        }
      }

      case "consult_other_agent": {
        const { targetModule, question, context } = args;
        
        try {
          console.log(`[consult_other_agent] Consulting ${targetModule} agent: "${question}"`);
          
          const { interAgentBus } = await import('./agents/inter-agent-bus');
          
          const conversationId = `config-studio-${Date.now()}`;
          
          const response = await interAgentBus.sendAndWait({
            from: {
              moduleId: "config-studio",
              agentId: "configuration-studio",
              tenantId
            },
            to: {
              moduleId: targetModule
            },
            messageType: "REQUEST",
            action: "CONSULT",
            payload: {
              question,
              context,
              requestedBy: "configuration-studio",
            },
            context: {
              conversationId,
              priority: "medium",
              timeout: 8000
            }
          }, 8000);
          
          console.log(`[consult_other_agent] ✓ Response from ${targetModule}:`, response);
          
          return {
            success: true,
            data: {
              targetModule,
              question,
              response
            },
            message: `🤝 Resposta de ${targetModule.toUpperCase()}:\n\n${JSON.stringify(response, null, 2)}`
          };
        } catch (error) {
          console.error('[consult_other_agent] Error:', error);
          
          if (error instanceof Error && error.message.includes('No handler registered')) {
            return {
              success: false,
              error: `Módulo ${targetModule} não está disponível ou não tem handler registado`,
              suggestion: `Os módulos Finance e HR estão registados. Tenta consultar "finance" ou "hr".`
            };
          }
          
          return {
            success: false,
            error: `Erro ao consultar ${targetModule}: ${error instanceof Error ? error.message : 'Erro desconhecido'}`
          };
        }
      }

      case "detect_conflicts": {
        const { actionType, entityKey, displayName, entityId, fieldKey } = args;
        
        try {
          console.log(`[detect_conflicts] Checking conflicts for ${actionType}:`, args);
          
          const { detectConflicts, formatConflicts } = await import('./services/conflict-detector');
          
          const action = {
            type: actionType,
            params: {
              entityKey,
              displayName,
              entityId,
              fieldKey,
            },
            tenantId,
            agentId: "configuration-studio",
            moduleId: "config-studio",
          };
          
          const conflicts = await detectConflicts(action);
          const formattedMessage = formatConflicts(conflicts);
          
          const hasHighPriorityConflicts = conflicts.some(c => c.severity === "high");
          
          return {
            success: true,
            data: {
              conflicts,
              count: conflicts.length,
              hasHighPriority: hasHighPriorityConflicts,
              canProceed: !hasHighPriorityConflicts
            },
            message: formattedMessage
          };
        } catch (error) {
          console.error('[detect_conflicts] Error:', error);
          return {
            success: false,
            error: `Erro ao detectar conflitos: ${error instanceof Error ? error.message : 'Erro desconhecido'}`
          };
        }
      }

      case "write_task_list": {
        const { tasks } = args;
        
        if (!tasks || !Array.isArray(tasks)) {
          return {
            success: false,
            error: "tasks parameter is required and must be an array",
          };
        }

        console.log(`[write_task_list] Processing ${tasks.length} task(s)`);

        // Process each task and trigger auto-review for completed tasks with code changes
        const processedTasks = [];
        const reviewResults = [];

        for (const task of tasks) {
          const processedTask = { ...task };
          
          // Check if task is being marked as 'completed' and has code changes
          if (task.status === 'completed' && task.filesModified && task.filesModified.length > 0) {
            console.log(`[write_task_list] Task "${task.content}" marked as completed with ${task.filesModified.length} file(s) modified - triggering auto-review`);
            
            // Trigger automatic architect review
            const reviewResult = await callArchitectReview({
              task: task.content,
              filesModified: task.filesModified,
              tenantId,
              userId,
            });

            reviewResults.push({
              taskId: task.id,
              ...reviewResult,
            });

            // If review found critical issues, force task to 'completed_pending_review'
            if (reviewResult.hasIssues) {
              console.log(`[write_task_list] Auto-review found issues for task "${task.content}" - forcing status to 'completed_pending_review'`);
              processedTask.status = 'completed_pending_review';
              processedTask.reviewFeedback = reviewResult.feedback;
              processedTask.reviewId = reviewResult.reviewId;
              processedTask.reviewScore = reviewResult.score;
            } else {
              console.log(`[write_task_list] Auto-review passed for task "${task.content}" - task can be completed`);
              processedTask.reviewFeedback = reviewResult.feedback;
              processedTask.reviewId = reviewResult.reviewId;
              processedTask.reviewScore = reviewResult.score;
            }
          }

          processedTasks.push(processedTask);
        }

        // Build response message
        let message = `✅ Task list updated with ${tasks.length} task(s)`;
        
        if (reviewResults.length > 0) {
          message += `\n\n**🔍 Auto-Review Results:**\n`;
          reviewResults.forEach((result) => {
            const taskInfo = processedTasks.find(t => t.id === result.taskId);
            message += `\n**Task: ${taskInfo?.content}**\n`;
            message += result.feedback;
            message += '\n';
          });
        }

        return {
          success: true,
          data: {
            tasks: processedTasks,
            reviewResults,
          },
          message,
        };
      }

      case "get_entity_suggestions": {
        const { businessType } = args;
        
        if (!businessType) {
          return {
            success: false,
            error: "businessType parameter is required",
          };
        }

        const { suggestEntitiesForBusiness } = await import("./services/pattern-learning-service");
        const suggestions = await suggestEntitiesForBusiness(businessType, 10);

        if (suggestions.length === 0) {
          return {
            success: true,
            data: { suggestions: [] },
            message: `Sem sugestões disponíveis para o tipo de negócio '${businessType}'. Podes criar entidades customizadas!`,
          };
        }

        return {
          success: true,
          data: {
            suggestions: suggestions.map(s => ({
              entityKey: s.entityKey,
              name: s.entityName,
              commonFields: s.fields,
              usedBy: `${s.usageCount} ${s.usageCount === 1 ? 'empresa similar' : 'empresas similares'}`,
            })),
          },
          message: `Encontradas ${suggestions.length} sugestões de entidades para negócios tipo '${businessType}'`,
        };
      }

      case "get_field_suggestions": {
        const { businessType, entityKey } = args;
        
        if (!businessType || !entityKey) {
          return {
            success: false,
            error: "businessType and entityKey parameters are required",
          };
        }

        const { suggestFieldsForEntity } = await import("./services/pattern-learning-service");
        const fields = await suggestFieldsForEntity(businessType, entityKey);

        if (fields.length === 0) {
          return {
            success: true,
            data: { fields: [] },
            message: `Sem sugestões de campos para '${entityKey}' em negócios tipo '${businessType}'`,
          };
        }

        return {
          success: true,
          data: { fields },
          message: `Encontrados ${fields.length} campos comuns para '${entityKey}' (ordenados por frequência de uso)`,
        };
      }

      case "diagnose_and_fix": {
        const { reason } = args;
        console.log(`[diagnose_and_fix] 🔍 Starting diagnosis. Reason: ${reason}`);
        
        const problems: string[] = [];
        const fixes: string[] = [];
        
        // 1. Get current conversation state
        const [conv] = await db
          .select()
          .from(conversations)
          .where(and(
            eq(conversations.tenantId, tenantId),
            eq(conversations.agentType, 'studio'),
            eq(conversations.environment, environment),
            eq(conversations.status, 'active')
          ))
          .orderBy(desc(conversations.updatedAt))
          .limit(1);

        if (!conv) {
          return {
            success: false,
            error: "No active conversation found",
          };
        }

        const currentPhase = conv.currentPhase;
        const phaseData = (conv.phaseData || {}) as Record<string, any>;
        
        console.log(`[diagnose_and_fix] Current phase: ${currentPhase}, phaseData:`, phaseData);

        // 2. Check for blueprints in database
        const { phaseData: phaseDataTable } = await import("@shared/schema");
        const blueprints = await db
          .select()
          .from(phaseDataTable)
          .where(and(
            eq(phaseDataTable.tenantId, tenantId),
            eq(phaseDataTable.environment, environment),
            eq(phaseDataTable.phaseName, 'blueprint')
          ))
          .orderBy(desc(phaseDataTable.createdAt))
          .limit(1);

        const hasBlueprintInDB = blueprints.length > 0;
        console.log(`[diagnose_and_fix] Blueprints in DB: ${hasBlueprintInDB}`);

        // 3. Diagnose problems based on current phase
        if (currentPhase === 2) {
          // Phase 2: Blueprint Planning
          
          // Check if requirements were validated
          if (!phaseData.requirementsCollected) {
            problems.push("❌ Requirements not validated");
            // Fix: Mark requirements as collected
            phaseData.requirementsCollected = true;
            fixes.push("✅ Marked requirementsCollected=true");
          }

          // Check if blueprint was generated
          if (hasBlueprintInDB && !phaseData.blueprintGenerated) {
            problems.push("❌ Blueprint exists in DB but flag not marked");
            // Fix: Mark blueprint as generated
            phaseData.blueprintGenerated = true;
            fixes.push("✅ Marked blueprintGenerated=true");
          } else if (!hasBlueprintInDB) {
            problems.push("⚠️ No blueprint found in database");
            fixes.push("💡 Agent should generate blueprint using generate_blueprint tool");
          }
        } else if (currentPhase === 3) {
          // Phase 3: Confirmation
          
          if (!phaseData.blueprintGenerated) {
            problems.push("❌ In Confirmation phase but blueprint not marked as generated");
            if (hasBlueprintInDB) {
              phaseData.blueprintGenerated = true;
              fixes.push("✅ Marked blueprintGenerated=true");
            }
          }
        }

        // 4. Apply fixes if any were made
        if (fixes.length > 0) {
          await db
            .update(conversations)
            .set({
              phaseData: phaseData,
              updatedAt: new Date()
            })
            .where(eq(conversations.id, conv.id));
          
          console.log(`[diagnose_and_fix] ✅ Applied ${fixes.length} fix(es)`);
        }

        // 5. Build diagnostic report
        const diagnosis = {
          currentPhase,
          currentPhaseName: ["", "Discovery", "Blueprint", "Confirmation", "Build"][currentPhase],
          problems: problems.length > 0 ? problems : ["✅ No problems detected"],
          fixes: fixes.length > 0 ? fixes : ["No fixes needed"],
          recommendations: [] as string[],
        };

        // 6. Add recommendations
        if (currentPhase === 2 && phaseData.blueprintGenerated) {
          diagnosis.recommendations.push("💡 Blueprint is ready. You can now advance to Confirmation phase.");
        } else if (currentPhase === 2 && !phaseData.blueprintGenerated && hasBlueprintInDB) {
          diagnosis.recommendations.push("💡 Blueprint was found and fixed. You can now advance to Confirmation phase.");
        }

        const message = `
🔍 **DIAGNÓSTICO COMPLETO**

**Fase Atual:** ${diagnosis.currentPhaseName} (Fase ${currentPhase})

**Problemas Detectados:**
${diagnosis.problems.map(p => `  ${p}`).join('\n')}

**Correções Aplicadas:**
${diagnosis.fixes.map(f => `  ${f}`).join('\n')}

${diagnosis.recommendations.length > 0 ? `\n**Recomendações:**\n${diagnosis.recommendations.map(r => `  ${r}`).join('\n')}` : ''}
        `.trim();

        return {
          success: true,
          data: diagnosis,
          message,
        };
      }

      case "get_module_templates": {
        const { moduleId } = args;
        
        try {
          // Create module registry for this tenant
          const { createModuleRegistry } = await import("../../../../packages/modules/base/module-registry.service");
          const registry = await createModuleRegistry(tenantId);
          
          // Get the module instance
          const module = registry.get(moduleId);
          
          if (!module) {
            return {
              success: false,
              error: `Módulo '${moduleId}' não encontrado ou não instalado para este tenant`,
            };
          }
          
          // Check if module is configurable
          if (!module.configurable) {
            return {
              success: false,
              error: `Módulo '${moduleId}' não é configurável`,
              explanation: `Este módulo não suporta templates de configuração. Apenas módulos configuráveis como 'projetos' têm templates disponíveis.`,
            };
          }
          
          // Get templates from module
          const templates = module.getTemplates ? module.getTemplates() : [];
          
          if (templates.length === 0) {
            return {
              success: true,
              data: {
                moduleId,
                templates: [],
                message: `Módulo '${moduleId}' não tem templates disponíveis no momento.`,
              },
            };
          }
          
          // Format templates for AI consumption
          const formattedTemplates = templates.map((t: ModuleTemplate) => ({
            id: t.id,
            name: t.name,
            description: t.description,
            suggestedFor: t.suggestedFor || [],
            icon: t.icon,
            usageCount: t.usageCount || 0,
          }));
          
          return {
            success: true,
            data: {
              moduleId,
              moduleName: module.metadata.name,
              templates: formattedTemplates,
              totalTemplates: formattedTemplates.length,
            },
            message: `Encontrados ${formattedTemplates.length} template(s) para o módulo '${module.metadata.name}': ${formattedTemplates.map((t: any) => t.name).join(', ')}`,
          };
        } catch (error) {
          console.error(`[get_module_templates] Error:`, error);
          return {
            success: false,
            error: error instanceof Error ? error.message : "Erro desconhecido ao obter templates",
          };
        }
      }

      case "apply_module_template": {
        const { tenantId: targetTenantId, moduleId, templateId, userId: applyingUserId } = args;
        
        try {
          // Create module registry for this tenant
          const { createModuleRegistry } = await import("../../../../packages/modules/base/module-registry.service");
          const registry = await createModuleRegistry(targetTenantId);
          
          // Get the module instance
          const module = registry.get(moduleId);
          
          if (!module) {
            return {
              success: false,
              error: `Módulo '${moduleId}' não encontrado ou não instalado`,
            };
          }
          
          // Check if module is configurable
          if (!module.configurable) {
            return {
              success: false,
              error: `Módulo '${moduleId}' não é configurável`,
            };
          }
          
          // Get templates
          const templates = module.getTemplates ? module.getTemplates() : [];
          const template = templates.find((t: ModuleTemplate) => t.id === templateId);
          
          if (!template) {
            return {
              success: false,
              error: `Template '${templateId}' não encontrado`,
              availableTemplates: templates.map((t: ModuleTemplate) => ({ id: t.id, name: t.name })),
            };
          }
          
          console.log(`[apply_module_template] Applying template ${templateId} to module ${moduleId} for tenant ${targetTenantId}`);
          
          // Create module context
          const context: ModuleContext = {
            tenantId: targetTenantId,
            userId: applyingUserId,
            permissions: [], // TODO: Load actual permissions
          };
          
          // Apply configuration using the configureModule helper
          await configureModule(module, targetTenantId, template.configuration, context);
          
          // Build success response with details
          const entitiesCreated = template.configuration.customEntities?.map((e: any) => e.name) || [];
          const workflowsCreated = template.configuration.customWorkflows?.map((w: any) => w.name) || [];
          const toolsCreated = template.configuration.customTools?.map((t: any) => t.name) || [];
          
          return {
            success: true,
            data: {
              moduleId,
              templateId,
              templateName: template.name,
              entitiesCreated,
              workflowsCreated,
              toolsCreated,
              totalEntities: entitiesCreated.length,
              totalWorkflows: workflowsCreated.length,
              totalTools: toolsCreated.length,
            },
            message: `✅ Template '${template.name}' aplicado com sucesso ao módulo '${module.metadata.name}'!\n\n` +
              `📦 Criado:\n` +
              (entitiesCreated.length > 0 ? `  • ${entitiesCreated.length} entidades: ${entitiesCreated.join(', ')}\n` : '') +
              (workflowsCreated.length > 0 ? `  • ${workflowsCreated.length} workflows: ${workflowsCreated.join(', ')}\n` : '') +
              (toolsCreated.length > 0 ? `  • ${toolsCreated.length} ferramentas\n` : ''),
          };
        } catch (error) {
          console.error(`[apply_module_template] Error:`, error);
          return {
            success: false,
            error: error instanceof Error ? error.message : "Erro ao aplicar template",
          };
        }
      }

      case "configure_module": {
        const { tenantId: targetTenantId, moduleId, configuration, userId: configuringUserId } = args;
        
        try {
          // Validate configuration object
          if (!configuration || typeof configuration !== 'object') {
            return {
              success: false,
              error: "Configuração inválida - deve ser um objeto ModuleConfiguration",
            };
          }
          
          // Create module registry for this tenant
          const { createModuleRegistry } = await import("../../../../packages/modules/base/module-registry.service");
          const registry = await createModuleRegistry(targetTenantId);
          
          // Get the module instance
          const module = registry.get(moduleId);
          
          if (!module) {
            return {
              success: false,
              error: `Módulo '${moduleId}' não encontrado ou não instalado`,
            };
          }
          
          // Check if module is configurable
          if (!module.configurable) {
            return {
              success: false,
              error: `Módulo '${moduleId}' não é configurável`,
            };
          }
          
          console.log(`[configure_module] Applying custom configuration to module ${moduleId} for tenant ${targetTenantId}`);
          
          // Create module context
          const context: ModuleContext = {
            tenantId: targetTenantId,
            userId: configuringUserId,
            permissions: [], // TODO: Load actual permissions
          };
          
          // Apply configuration using the configureModule helper
          await configureModule(module, targetTenantId, configuration as ModuleConfiguration, context);
          
          // Build detailed success response
          const entitiesCreated = configuration.customEntities?.map((e: any) => ({
            name: e.name,
            fieldsCount: e.schema?.fields?.length || 0,
          })) || [];
          
          const workflowsCreated = configuration.customWorkflows?.map((w: any) => ({
            name: w.name,
            statesCount: w.states?.length || 0,
          })) || [];
          
          const toolsCreated = configuration.customTools?.map((t: any) => t.name) || [];
          
          return {
            success: true,
            data: {
              moduleId,
              moduleName: module.metadata.name,
              configuration: {
                entitiesCreated,
                workflowsCreated,
                toolsCreated,
              },
              summary: {
                totalEntities: entitiesCreated.length,
                totalFields: entitiesCreated.reduce((sum: number, e: any) => sum + e.fieldsCount, 0),
                totalWorkflows: workflowsCreated.length,
                totalTools: toolsCreated.length,
              },
            },
            message: `✅ Módulo '${module.metadata.name}' configurado com sucesso!\n\n` +
              `📦 Criado:\n` +
              (entitiesCreated.length > 0 ? 
                `  • ${entitiesCreated.length} entidades personalizadas:\n` +
                entitiesCreated.map((e: any) => `    - ${e.name} (${e.fieldsCount} campos)`).join('\n') + '\n'
                : '') +
              (workflowsCreated.length > 0 ? 
                `  • ${workflowsCreated.length} workflows:\n` +
                workflowsCreated.map((w: any) => `    - ${w.name} (${w.statesCount} estados)`).join('\n') + '\n'
                : '') +
              (toolsCreated.length > 0 ? `  • ${toolsCreated.length} ferramentas AI\n` : ''),
          };
        } catch (error) {
          console.error(`[configure_module] Error:`, error);
          return {
            success: false,
            error: error instanceof Error ? error.message : "Erro ao configurar módulo",
          };
        }
      }

      case "configure_project_template": {
        const { templateId, customizations, environment = 'sandbox' } = args;
        
        try {
          console.log(`[configure_project_template] Applying template ${templateId} to Projects module (env: ${environment})`);
          
          const { createModuleRegistry } = await import("../../../../packages/modules/base/module-registry.service");
          const registry = await createModuleRegistry(tenantId);
          const module = registry.get('projetos');
          
          if (!module) {
            return {
              success: false,
              error: { code: 'MODULE_NOT_FOUND', message: 'Módulo Projetos não encontrado' },
            };
          }
          
          const templates = module.getTemplates?.() || [];
          const template = templates.find((t: any) => t.id === templateId);
          
          if (!template) {
            return {
              success: false,
              error: { code: 'TEMPLATE_NOT_FOUND', message: `Template '${templateId}' não encontrado` },
            };
          }
          
          const context: ModuleContext = { tenantId, userId, permissions: [] };
          
          // Merge template configuration with customizations
          let mergedConfig = { ...template.configuration };
          
          if (customizations) {
            // Apply customizations to entities (add extra fields, override metadata)
            if (customizations.customEntities) {
              mergedConfig.customEntities = mergedConfig.customEntities || [];
              customizations.customEntities.forEach((customEntity: any) => {
                const existingIdx = mergedConfig.customEntities.findIndex((e: any) => e.name === customEntity.name);
                if (existingIdx >= 0) {
                  // Merge fields
                  mergedConfig.customEntities[existingIdx] = {
                    ...mergedConfig.customEntities[existingIdx],
                    ...customEntity,
                    schema: {
                      ...mergedConfig.customEntities[existingIdx].schema,
                      ...customEntity.schema,
                      fields: [
                        ...(mergedConfig.customEntities[existingIdx].schema?.fields || []),
                        ...(customEntity.schema?.fields || [])
                      ],
                    },
                  };
                } else {
                  mergedConfig.customEntities.push(customEntity);
                }
              });
            }
          }
          
          await configureModule(module, tenantId, mergedConfig as ModuleConfiguration, context);
          
          const entitiesCreated = mergedConfig.customEntities?.map((e: any) => e.name) || [];
          const customFieldsAdded = customizations?.customEntities?.reduce((acc: number, e: any) => 
            acc + (e.schema?.fields?.length || 0), 0) || 0;
          
          return {
            success: true,
            appliedTemplateId: templateId,
            entitiesDelta: entitiesCreated,
            customFieldsAdded,
          };
        } catch (error) {
          console.error('[configure_project_template] Error:', error);
          return {
            success: false,
            error: { 
              code: 'CONFIGURATION_ERROR', 
              message: error instanceof Error ? error.message : 'Erro ao aplicar template',
              details: error instanceof Error ? error.stack : undefined,
            },
          };
        }
      }

      case "link_project_field": {
        const { sourceFieldId, targetModule, targetEntity, defaultDisplayField, environment = 'sandbox', dryRun = false } = args;
        
        try {
          console.log(`[link_project_field] ${dryRun ? 'Previewing' : 'Creating'} link field ${sourceFieldId} → ${targetModule}.${targetEntity} (env: ${environment})`);
          
          const { createLinkResolver } = await import("../../../../packages/modules/base/link-resolver.service");
          const linkResolver = createLinkResolver(tenantId, userId, [], environment);
          
          // Validate target entity exists and is linkable
          const linkableEntity = linkResolver.getLinkableEntity(targetModule, targetEntity);
          if (!linkableEntity) {
            return {
              success: false,
              error: { 
                code: 'ENTITY_NOT_FOUND', 
                message: `Entidade ${targetModule}.${targetEntity} não disponível para linking. Módulos suportados: crm, financial, compras, projetos.`,
              },
            };
          }
          
          // Dry run: return preview without persisting
          if (dryRun) {
            return {
              success: true,
              linkId: null,
              preview: {
                targetModule,
                targetEntity,
                availableFields: linkableEntity.searchableFields,
                displayField: defaultDisplayField || linkableEntity.displayField,
                permissionsRequired: `projects.write + ${targetModule}.read`,
              },
            };
          }
          
          // Actual link creation: persist field configuration metadata
          // Note: This creates the LINK METADATA, not an actual record link
          // Record links are created when users select specific records in the UI
          const { db } = await import("../../../../db");
          const { customFieldLinks } = await import("../../../../shared/schema");
          
          const [linkMetadata] = await db.insert(customFieldLinks).values({
            tenantId,
            environment,
            sourceModule: 'projetos',
            sourceFieldId,
            targetModule,
            targetEntity,
            displayField: defaultDisplayField || linkableEntity.displayField,
          }).returning();
          
          return {
            success: true,
            linkId: linkMetadata.id,
            metadata: {
              sourceFieldId: linkMetadata.sourceFieldId,
              targetModule: linkMetadata.targetModule,
              targetEntity: linkMetadata.targetEntity,
              displayField: linkMetadata.displayField,
            },
          };
        } catch (error) {
          console.error('[link_project_field] Error:', error);
          const message = error instanceof Error ? error.message : 'Erro ao criar link';
          const code = message.includes('Permission denied') ? 'PERMISSION_DENIED' 
                     : message.includes('duplicate') ? 'LINK_ALREADY_EXISTS'
                     : 'LINK_ERROR';
          return {
            success: false,
            error: { 
              code, 
              message,
              details: error instanceof Error ? error.stack : undefined,
            },
          };
        }
      }

      case "apply_project_template": {
        const { templateId, promotionTarget = 'production', environment = 'sandbox' } = args;
        
        try {
          console.log(`[apply_project_template] Promoting template ${templateId} from ${environment} to ${promotionTarget}`);
          
          // Validate environment requirements
          if (environment !== 'sandbox') {
            return {
              success: false,
              error: { 
                code: 'INVALID_ENVIRONMENT', 
                message: 'Promoção só pode ser feita a partir de sandbox. Ambiente atual: ' + environment,
              },
            };
          }
          
          if (promotionTarget !== 'production') {
            return {
              success: false,
              error: { 
                code: 'INVALID_TARGET', 
                message: 'Apenas promoção para production é suportada. Alvo especificado: ' + promotionTarget,
              },
            };
          }
          
          // Load sandbox configuration
          const { createModuleRegistry } = await import("../../../../packages/modules/base/module-registry.service");
          const sandboxRegistry = await createModuleRegistry(tenantId);
          const module = sandboxRegistry.get('projetos');
          
          if (!module) {
            return {
              success: false,
              error: { code: 'MODULE_NOT_FOUND', message: 'Módulo Projetos não encontrado' },
            };
          }
          
          // Get sandbox configuration
          const sandboxConfig = await module.loadCustomConfiguration?.(tenantId, 'sandbox');
          if (!sandboxConfig) {
            return {
              success: false,
              error: { 
                code: 'NO_SANDBOX_CONFIG', 
                message: `Nenhuma configuração encontrada em sandbox para template ${templateId}`,
              },
            };
          }
          
          // Promote: copy sandbox → production
          const context: ModuleContext = { tenantId, userId, permissions: [] };
          await configureModule(module, tenantId, sandboxConfig, context, 'production');
          
          // Count promoted entities/workflows
          const entitiesPromoted = sandboxConfig.customEntities?.map((e: any) => e.name) || [];
          const workflowsPromoted = sandboxConfig.customWorkflows?.map((w: any) => w.name) || [];
          
          return {
            success: true,
            activationId: `act-${Date.now()}`,
            promotedAt: new Date().toISOString(),
            summary: {
              entitiesPromoted: entitiesPromoted.length,
              workflowsPromoted: workflowsPromoted.length,
              entities: entitiesPromoted,
              workflows: workflowsPromoted,
            },
            message: `✅ Template promovido para production com sucesso!\n` +
                    `📦 ${entitiesPromoted.length} entidades, ${workflowsPromoted.length} workflows`,
          };
        } catch (error) {
          console.error('[apply_project_template] Error:', error);
          return {
            success: false,
            error: { 
              code: 'PROMOTION_ERROR', 
              message: error instanceof Error ? error.message : 'Erro ao promover template',
              details: error instanceof Error ? error.stack : undefined,
            },
          };
        }
      }

      case "configure_logistics_module": {
        const { industryType, warehouseName = "Armazém Central", createSampleProducts = true, enableAutoReorder = true } = args;
        
        try {
          console.log(`[configure_logistics_module] Configuring logistics for industry: ${industryType}`);
          
          const { warehouses, products, reorderingRules } = await import("../../../../shared/schema");
          
          // Create central warehouse
          const [warehouse] = await db.insert(warehouses).values({
            tenantId,
            name: warehouseName,
            type: "central",
            isActive: true,
            availableForProjects: true,
            environment: 'sandbox', // Studio always works in sandbox first
          }).returning();
          
          console.log(`[configure_logistics_module] Created warehouse: ${warehouse.id}`);
          
          // Industry-specific product templates
          const productTemplates: Record<string, Array<{name: string, category: string, unit: string}>> = {
            construction: [
              { name: "Cimento CP II - 50kg", category: "Materiais Construção", unit: "kg" },
              { name: "Areia Grossa - m³", category: "Materiais Construção", unit: "m3" },
              { name: "Tijolos Furados 30x20x15", category: "Materiais Construção", unit: "un" },
              { name: "Betão C20/25", category: "Materiais Construção", unit: "m3" },
              { name: "Betoneira 200L", category: "Ferramentas", unit: "un" },
            ],
            events: [
              { name: "Cadeiras Brancas", category: "Mobiliário", unit: "un" },
              { name: "Mesas Redondas 1.5m", category: "Mobiliário", unit: "un" },
              { name: "Sistema Som 500W", category: "Equipamento", unit: "un" },
              { name: "Toalhas Brancas 1.5x1.5m", category: "Têxteis", unit: "un" },
              { name: "Pratos Louça Branca", category: "Louças", unit: "un" },
            ],
            retail: [
              { name: "T-Shirt Básica Branca", category: "Vestuário", unit: "un" },
              { name: "Calças Jeans Azul", category: "Vestuário", unit: "un" },
              { name: "Sapatilhas Desportivas", category: "Calçado", unit: "par" },
            ],
            manufacturing: [
              { name: "Parafuso M8x20mm", category: "Componentes", unit: "un" },
              { name: "Chapa Aço 1mm", category: "Matérias-Primas", unit: "kg" },
              { name: "Tinta Industrial Branca", category: "Acabamentos", unit: "l" },
            ],
            general: [
              { name: "Produto Exemplo A", category: "Geral", unit: "un" },
              { name: "Produto Exemplo B", category: "Geral", unit: "un" },
              { name: "Produto Exemplo C", category: "Geral", unit: "un" },
            ],
          };
          
          const createdProducts: any[] = [];
          const createdReorderRules: any[] = [];
          
          if (createSampleProducts) {
            const templates = productTemplates[industryType] || productTemplates.general;
            
            for (const template of templates) {
              const [product] = await db.insert(products).values({
                tenantId,
                name: template.name,
                category: template.category,
                type: "product",
                isActive: true,
                environment: 'sandbox',
              }).returning();
              
              createdProducts.push(product);
              
              // Create reorder rule if enabled
              if (enableAutoReorder) {
                const [rule] = await db.insert(reorderingRules).values({
                  tenantId,
                  productId: product.id,
                  warehouseId: warehouse.id,
                  minQty: "10", // Default min
                  maxQty: "100", // Default max
                  qtyMultiple: "1",
                  leadTimeDays: 7,
                  isActive: true,
                  environment: 'sandbox',
                }).returning();
                
                createdReorderRules.push(rule);
              }
            }
            
            console.log(`[configure_logistics_module] Created ${createdProducts.length} products with ${createdReorderRules.length} reorder rules`);
          }
          
          return {
            success: true,
            warehouseId: warehouse.id,
            warehouseName: warehouse.name,
            productsCreated: createdProducts.length,
            productIds: createdProducts.map(p => p.id),
            reorderRulesCreated: createdReorderRules.length,
            message: `✅ Módulo Logística configurado!\n` +
                    `📦 Armazém: ${warehouse.name}\n` +
                    (createdProducts.length > 0 ? `🏷️  ${createdProducts.length} produtos criados\n` : '') +
                    (createdReorderRules.length > 0 ? `🔄 ${createdReorderRules.length} regras de reposição ativas\n` : '') +
                    `\n💡 Use /chat para gerir o inventário conversacionalmente!`,
          };
        } catch (error) {
          console.error('[configure_logistics_module] Error:', error);
          return {
            success: false,
            error: { 
              code: 'LOGISTICS_CONFIG_ERROR', 
              message: error instanceof Error ? error.message : 'Erro ao configurar logística',
            },
          };
        }
      }

      case "create_warehouse": {
        const { name, type, address, city, postalCode, linkedProjectId, capacity } = args;
        
        try {
          console.log(`[create_warehouse] Creating ${type} warehouse: ${name}`);
          
          const { warehouses } = await import("../../../../shared/schema");
          
          const [warehouse] = await db.insert(warehouses).values({
            tenantId,
            name,
            type,
            address,
            city,
            postalCode,
            linkedProjectId,
            capacity: capacity ? capacity.toString() : null,
            isActive: true,
            availableForProjects: type !== 'virtual', // Virtual warehouses not available for project allocation
            environment: 'sandbox',
          }).returning();
          
          console.log(`[create_warehouse] Created warehouse: ${warehouse.id}`);
          
          return {
            success: true,
            warehouseId: warehouse.id,
            warehouseName: warehouse.name,
            type: warehouse.type,
            message: `✅ Armazém '${warehouse.name}' criado com sucesso!\nTipo: ${type}\n` +
                    (linkedProjectId ? `🔗 Ligado ao projeto\n` : '') +
                    `\n💡 Pode agora alocar stock e equipamentos a este armazém.`,
          };
        } catch (error) {
          console.error('[create_warehouse] Error:', error);
          return {
            success: false,
            error: { 
              code: 'WAREHOUSE_CREATE_ERROR', 
              message: error instanceof Error ? error.message : 'Erro ao criar armazém',
            },
          };
        }
      }

      case "setup_reorder_rules": {
        const { productId, productIds, warehouseId, minQuantity, maxQuantity, leadTimeDays = 7 } = args;
        
        try {
          const targetProductIds = productId ? [productId] : (productIds || []);
          
          if (targetProductIds.length === 0) {
            return {
              success: false,
              error: { code: 'INVALID_INPUT', message: 'Deve fornecer productId ou productIds' },
            };
          }
          
          console.log(`[setup_reorder_rules] Creating reorder rules for ${targetProductIds.length} products`);
          
          const { reorderingRules, warehouses } = await import("../../../../shared/schema");
          const { eq, and } = await import("drizzle-orm");
          
          // If warehouseId specified, validate it exists
          let targetWarehouses: any[] = [];
          if (warehouseId) {
            const wh = await db.select().from(warehouses).where(
              and(
                eq(warehouses.id, warehouseId),
                eq(warehouses.tenantId, tenantId),
                eq(warehouses.environment, 'sandbox')
              )
            );
            if (wh.length === 0) {
              return {
                success: false,
                error: { code: 'WAREHOUSE_NOT_FOUND', message: `Armazém ${warehouseId} não encontrado` },
              };
            }
            targetWarehouses = wh;
          } else {
            // Get all active warehouses
            targetWarehouses = await db.select().from(warehouses).where(
              and(
                eq(warehouses.tenantId, tenantId),
                eq(warehouses.isActive, true),
                eq(warehouses.environment, 'sandbox')
              )
            );
          }
          
          const createdRules: any[] = [];
          
          for (const prodId of targetProductIds) {
            for (const wh of targetWarehouses) {
              const [rule] = await db.insert(reorderingRules).values({
                tenantId,
                productId: prodId,
                warehouseId: wh.id,
                minQty: minQuantity.toString(),
                maxQty: maxQuantity.toString(),
                qtyMultiple: "1",
                leadTimeDays,
                isActive: true,
                environment: 'sandbox',
              }).returning();
              
              createdRules.push(rule);
            }
          }
          
          console.log(`[setup_reorder_rules] Created ${createdRules.length} reorder rules`);
          
          return {
            success: true,
            rulesCreated: createdRules.length,
            ruleIds: createdRules.map(r => r.id),
            summary: {
              products: targetProductIds.length,
              warehouses: targetWarehouses.length,
              minQuantity,
              maxQuantity,
              leadTimeDays,
            },
            message: `✅ ${createdRules.length} regras de reposição configuradas!\n` +
                    `📊 ${targetProductIds.length} produtos × ${targetWarehouses.length} armazéns\n` +
                    `⚠️  Dispara quando stock < ${minQuantity}\n` +
                    `📦 Repoõe até ${maxQuantity} unidades\n` +
                    `⏱️  Prazo entrega: ${leadTimeDays} dias`,
          };
        } catch (error) {
          console.error('[setup_reorder_rules] Error:', error);
          return {
            success: false,
            error: { 
              code: 'REORDER_RULE_ERROR', 
              message: error instanceof Error ? error.message : 'Erro ao configurar regras de reposição',
            },
          };
        }
      }

      default:
        return {
          success: false,
          error: `Tool '${toolName}' não reconhecido`,
        };
    }
  } catch (error) {
    console.error(`Error executing studio tool ${toolName}:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
