// Migrated from AssistOS legacy - Phase 3
// Source: /tmp/assistos-legacy/server/_legacy/ai-tools.ts (5320 lines, 176KB)

// TODO: Migrate storage service
// import { storage } from "../../../../apps/api/services/storage.service";

// TODO: Migrate tenant-storage service
// import { getTenantStorage } from "../../../../apps/api/services/tenant-storage";

// TODO: Add these types to schema if they don't exist
// import type { Product, Client, InsertOrder, InsertTask } from "../../../../shared/schema";
// import { invoices, invoiceItems, payments, payables, conversionAgents, connectors, erpConnections, erpFieldMappings, erpSyncLogs } from "../../../../shared/schema";

import { db } from "../../../../apps/api/db";
import { and, eq, gte, lte, desc, ilike, or, sql } from "drizzle-orm";

// TODO: Migrate ERP services when needed
// import { createPrimaveraClient } from "../../../../apps/api/services/primavera-client";
// import { createERPMapper } from "../../../../apps/api/services/erp-mapper";
// import { reviewQueueService } from "../../../../apps/api/services/review-queue";
// import { documentManagementService } from "../../../../apps/api/services/document-management";
// import { contractLifecycleService } from "../../../../apps/api/services/contract-lifecycle";
// import { complianceMonitorService } from "../../../../apps/api/services/compliance-monitor";

import { projectConfigTools, executeConfigTool } from "../config";

export const aiTools = [
  {
    type: "function" as const,
    function: {
      name: "search_products",
      description: "Procura produtos na base de dados por nome, categoria ou código. IMPORTANTE: Se não encontrar resultados, tenta com termos mais simples ou parciais (ex: 'brioche' em vez de 'pão brioche'). A pesquisa é case-insensitive e aceita palavras parciais.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Termo de pesquisa (pode ser nome, categoria ou código do produto). Use termos simples para resultados mais abrangentes.",
          },
          category: {
            type: "string",
            description: "Filtrar por categoria específica (opcional)",
          },
          limit: {
            type: "number",
            description: "Número máximo de resultados (default: 10)",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_product_details",
      description: "Obtém detalhes completos de um produto específico pelo código",
      parameters: {
        type: "object",
        properties: {
          code: {
            type: "string",
            description: "Código do produto",
          },
        },
        required: ["code"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "check_stock",
      description: "Verifica o stock disponível de um ou mais produtos",
      parameters: {
        type: "object",
        properties: {
          productCodes: {
            type: "array",
            items: { type: "string" },
            description: "Lista de códigos de produtos para verificar stock",
          },
        },
        required: ["productCodes"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_clients",
      description: "Lista clientes existentes. Use para encontrar informação de clientes.",
      parameters: {
        type: "object",
        properties: {
          search: {
            type: "string",
            description: "Termo de pesquisa (nome, email ou empresa)",
          },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_client_details",
      description: "Obtém detalhes completos de um cliente específico",
      parameters: {
        type: "object",
        properties: {
          clientId: {
            type: "string",
            description: "ID do cliente",
          },
        },
        required: ["clientId"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_order",
      description: "Cria um novo pedido para um cliente. Use depois de confirmar os produtos e quantidades com o cliente.",
      parameters: {
        type: "object",
        properties: {
          clientId: {
            type: "string",
            description: "ID do cliente",
          },
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                productCode: { type: "string" },
                quantity: { type: "number" },
                price: { type: "number" },
              },
            },
            description: "Lista de produtos no pedido",
          },
          source: {
            type: "string",
            description: "Origem do pedido (chat, email, whatsapp, manual)",
          },
          conversationId: {
            type: "string",
            description: "ID da conversa (para linkar encomenda à conversa)",
          },
        },
        required: ["clientId", "items", "source"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_task",
      description: "Cria uma nova tarefa de follow-up ou ação necessária",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Título da tarefa",
          },
          description: {
            type: "string",
            description: "Descrição detalhada da tarefa",
          },
          priority: {
            type: "string",
            enum: ["low", "medium", "high"],
            description: "Prioridade da tarefa",
          },
          clientId: {
            type: "string",
            description: "ID do cliente relacionado (opcional)",
          },
          conversationId: {
            type: "string",
            description: "ID da conversa relacionada (opcional)",
          },
        },
        required: ["title", "description"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_orders",
      description: "Lista encomendas/pedidos. Pode filtrar por cliente, status ou data.",
      parameters: {
        type: "object",
        properties: {
          clientId: {
            type: "string",
            description: "ID do cliente (opcional - para ver só encomendas desse cliente)",
          },
          status: {
            type: "string",
            enum: ["pending", "processing", "shipped", "completed", "cancelled"],
            description: "Filtrar por status (opcional)",
          },
          limit: {
            type: "number",
            description: "Número máximo de resultados (default: 20)",
          },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_order_details",
      description: "Obtém detalhes completos de uma encomenda específica",
      parameters: {
        type: "object",
        properties: {
          orderId: {
            type: "string",
            description: "ID da encomenda",
          },
        },
        required: ["orderId"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_client_orders",
      description: "Obtém histórico de encomendas de um cliente específico",
      parameters: {
        type: "object",
        properties: {
          clientId: {
            type: "string",
            description: "ID do cliente",
          },
        },
        required: ["clientId"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "query_sales_analytics",
      description: "Analisa vendas por período de tempo. Use para responder a perguntas como 'quantos clientes compraram hoje', 'vendas desta semana', 'total de vendas do mês'. Retorna estatísticas agregadas incluindo número de clientes únicos, total de vendas, número de encomendas.",
      parameters: {
        type: "object",
        properties: {
          period: {
            type: "string",
            enum: ["today", "this_week", "this_month", "last_7_days", "last_30_days"],
            description: "Período de análise: 'today' (hoje), 'this_week' (esta semana), 'this_month' (este mês), 'last_7_days' (últimos 7 dias), 'last_30_days' (últimos 30 dias)",
          },
          startDate: {
            type: "string",
            description: "Data de início (formato ISO: YYYY-MM-DD) - opcional, use se 'period' não for suficiente",
          },
          endDate: {
            type: "string",
            description: "Data de fim (formato ISO: YYYY-MM-DD) - opcional, use se 'period' não for suficiente",
          },
        },
        required: ["period"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_available_modules",
      description: "Lista todos os módulos disponíveis na plataforma com informações sobre estado de ativação. Use para recomendar módulos ao utilizador.",
      parameters: {
        type: "object",
        properties: {
          category: {
            type: "string",
            description: "Filtrar por categoria (vendas, financas, operacoes, gestao, etc.) - opcional",
          },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_module_details",
      description: "Obtém detalhes completos de um módulo específico incluindo features e agentes disponíveis",
      parameters: {
        type: "object",
        properties: {
          slug: {
            type: "string",
            description: "Slug do módulo (comercial, financeiro, rh, producao, compras, administrativo, logistica, projetos)",
          },
        },
        required: ["slug"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_active_modules",
      description: "Lista apenas os módulos atualmente ativos/instalados para este tenant",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "install_module",
      description: "Instala e ativa um módulo para o tenant. Use após confirmar que o módulo está disponível (is_active=true). Retorna sucesso ou erro se já instalado.",
      parameters: {
        type: "object",
        properties: {
          slug: {
            type: "string",
            description: "Slug do módulo a instalar (ex: 'comercial', 'financeiro', 'logistica')",
          },
        },
        required: ["slug"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_platform_overview",
      description: "Obtém visão geral completa da plataforma incluindo módulos ativos, quantidade de clientes, produtos, encomendas, informação da empresa e capacidades disponíveis. Use APENAS quando o utilizador faz perguntas genéricas sobre o que pode fazer, estado geral da plataforma, ou capacidades. NÃO use para perguntas específicas (ex: 'stock produto X' → use search_products direto).",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_module_documentation",
      description: "Obtém documentação técnica completa de um módulo incluindo agentes, system prompts, data model e guia de configuração. Use isto para entender como configurar módulos corretamente baseado em módulos existentes (ex: comercial)",
      parameters: {
        type: "object",
        properties: {
          slug: {
            type: "string",
            description: "Slug do módulo para obter documentação (ex: 'comercial')",
          },
        },
        required: ["slug"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_company_info",
      description: "Obtém as informações da empresa já guardadas. Use isto SEMPRE no início da conversa de configuração para verificar se o NOME da empresa já existe. O nome é o único campo obrigatório - todos os outros campos são opcionais.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "save_company_info",
      description: "Guarda informações completas da empresa. Use quando o utilizador fornecer os dados durante o onboarding ou após pesquisa web. Campo 'brandName' é obrigatório. legalName é opcional (nome fiscal/legal da empresa).",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Nome da empresa (DEPRECADO - usar brandName)",
          },
          brandName: {
            type: "string",
            description: "Nome comercial/marca da empresa usado em comunicações externas (OBRIGATÓRIO se name não fornecido)",
          },
          legalName: {
            type: "string",
            description: "Nome legal/fiscal da empresa (ex: 'Clever Ingredients Lda') - usado em documentos oficiais",
          },
          nif: {
            type: "string",
            description: "NIF da empresa",
          },
          address: {
            type: "string",
            description: "Morada completa da empresa",
          },
          sector: {
            type: "string",
            description: "Sector/Indústria (ex: construção, tecnologia, restauração)",
          },
          businessType: {
            type: "string",
            description: "Tipo de negócio (ex: B2B, B2C, serviços, produção)",
          },
          businessDescription: {
            type: "string",
            description: "Descrição da atividade da empresa",
          },
          phone: {
            type: "string",
            description: "Telefone da empresa",
          },
          email: {
            type: "string",
            description: "Email da empresa",
          },
          website: {
            type: "string",
            description: "Website da empresa",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "save_company_context",
      description: "Guarda o contexto de negócio da empresa. Use quando o utilizador partilhar informações sobre o setor, tipo de negócio ou descrição da atividade da empresa. Isto ajuda a personalizar a plataforma.",
      parameters: {
        type: "object",
        properties: {
          sector: {
            type: "string",
            description: "Setor/Indústria da empresa (ex: restauracao, construcao, tecnologia, retalho, servicos, industria, saude, educacao)",
          },
          businessType: {
            type: "string",
            description: "Tipo de negócio (ex: producao, servicos, comercio, b2b, b2c, misto)",
          },
          businessDescription: {
            type: "string",
            description: "Descrição detalhada da atividade da empresa (o que faz, principais produtos/serviços)",
          },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "web_search",
      description: "Pesquisa informações na internet. Use para pesquisar sobre ERPs, APIs, integrações, melhores práticas, documentação técnica, ou qualquer informação atualizada que não tenha na base de dados local.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Pergunta ou termo de pesquisa (ex: 'Como integrar com SAP API', 'Jasmin ERP tem API REST?', 'Melhores práticas gestão stock distribuição')",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "show_register_form",
      description: "Mostra formulário de registo inline no chat. CHAMA quando user quer criar conta. Extrai nome da conversa se mencionado, senão deixa vazio.",
      parameters: {
        type: "object",
        properties: {
          firstName: {
            type: "string",
            description: "Primeiro nome extraído da conversa (ou vazio se não mencionou)",
          },
          lastName: {
            type: "string",
            description: "Apelido extraído da conversa (ou vazio se não mencionou)",
          },
        },
        required: ["firstName", "lastName"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_databases",
      description: "Lista todas as bases de dados existentes do tenant. Use para ver o contexto atual antes de sugerir soluções.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_database",
      description: "Cria uma nova base de dados personalizada para o tenant. Use quando o utilizador pedir para criar uma base de dados para armazenar informações específicas (ex: Contratos, Projetos, Equipamentos, etc.).",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Nome da base de dados (ex: 'Contratos', 'Projetos')",
          },
          slug: {
            type: "string",
            description: "Identificador único em minúsculas sem espaços (ex: 'contratos', 'projetos')",
          },
          description: {
            type: "string",
            description: "Descrição do que esta base de dados armazena",
          },
          icon: {
            type: "string",
            description: "Nome do ícone Lucide (ex: 'FileText', 'Briefcase', 'Package', 'Database')",
          },
        },
        required: ["name", "slug", "description"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_agent",
      description: "Cria um agente especializado para operar sobre uma base de dados. Use após criar uma base de dados para adicionar inteligência conversacional.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Nome do agente (ex: 'Inventário de Equipamentos', 'Gestor de Contratos')",
          },
          agentType: {
            type: "string",
            description: "Tipo único do agente em snake_case (ex: 'equipment_inventory', 'contract_manager')",
          },
          description: {
            type: "string",
            description: "Breve descrição do que o agente faz",
          },
          databaseSlug: {
            type: "string",
            description: "Slug da base de dados que este agente opera (ex: 'equipamentos', 'contratos')",
          },
          capabilities: {
            type: "array",
            items: { type: "string" },
            description: "Lista de capacidades do agente (ex: ['Consultar equipamentos', 'Registar novos equipamentos'])",
          },
          maxTokens: {
            type: "number",
            description: "Máximo de tokens para respostas do agente. Valores sugeridos: 4000 (simples), 16384 (padrão), 32000 (complexo)",
          },
        },
        required: ["name", "agentType", "description", "databaseSlug", "capabilities"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "reconcile_orders",
      description: "Reconcilia encomendas existentes que não estão ligadas a clientes. Procura clientes pelo nome e atualiza automaticamente. Use quando vires que há encomendas sem client_id.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_invoice",
      description: "Cria uma nova fatura para um cliente. Valida dados fiscais, calcula IVA e totais automaticamente. Use após confirmar todos os dados com o utilizador.",
      parameters: {
        type: "object",
        properties: {
          clientId: {
            type: "string",
            description: "ID do cliente (obrigatório - buscar com list_clients primeiro)",
          },
          invoiceNumber: {
            type: "string",
            description: "Número da fatura (ex: 'FT 2025/001')",
          },
          issueDate: {
            type: "string",
            description: "Data de emissão (formato ISO: YYYY-MM-DD)",
          },
          dueDate: {
            type: "string",
            description: "Data de vencimento (formato ISO: YYYY-MM-DD, opcional)",
          },
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                description: {
                  type: "string",
                  description: "Descrição do item",
                },
                quantity: {
                  type: "number",
                  description: "Quantidade",
                },
                unitPrice: {
                  type: "number",
                  description: "Preço unitário",
                },
                taxRate: {
                  type: "number",
                  description: "Taxa de IVA (23, 13, 6, 0)",
                },
                productId: {
                  type: "string",
                  description: "ID do produto (opcional)",
                },
              },
            },
            description: "Lista de itens da fatura",
          },
          paymentMethod: {
            type: "string",
            description: "Método de pagamento: transfer, check, cash, card, mb_way",
          },
          notes: {
            type: "string",
            description: "Observações (opcional)",
          },
        },
        required: ["clientId", "invoiceNumber", "issueDate", "items"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_invoices",
      description: "Lista faturas existentes. Pode filtrar por cliente, status, período, etc.",
      parameters: {
        type: "object",
        properties: {
          clientId: {
            type: "string",
            description: "Filtrar por ID de cliente (opcional)",
          },
          status: {
            type: "string",
            description: "Filtrar por status: draft, sent, paid, overdue, cancelled (opcional)",
          },
          paymentStatus: {
            type: "string",
            description: "Filtrar por status de pagamento: pending, partial, paid (opcional)",
          },
          startDate: {
            type: "string",
            description: "Data inicial (formato ISO: YYYY-MM-DD, opcional)",
          },
          endDate: {
            type: "string",
            description: "Data final (formato ISO: YYYY-MM-DD, opcional)",
          },
          limit: {
            type: "number",
            description: "Número máximo de resultados (default: 20)",
          },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "record_payment",
      description: "Regista um pagamento recebido ou efetuado. Associa automaticamente à fatura e atualiza o status.",
      parameters: {
        type: "object",
        properties: {
          invoiceId: {
            type: "string",
            description: "ID da fatura (opcional se pagamento não associado a fatura)",
          },
          type: {
            type: "string",
            description: "Tipo: received (recebido) ou paid (efetuado)",
          },
          paymentMethod: {
            type: "string",
            description: "Método: transfer, check, cash, card, mb_way",
          },
          paymentDate: {
            type: "string",
            description: "Data do pagamento (formato ISO: YYYY-MM-DD)",
          },
          amount: {
            type: "number",
            description: "Valor do pagamento",
          },
          reference: {
            type: "string",
            description: "Referência bancária, número de cheque, etc (opcional)",
          },
          notes: {
            type: "string",
            description: "Observações (opcional)",
          },
        },
        required: ["type", "paymentMethod", "paymentDate", "amount"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_financial_analysis",
      description: "Obtém análise financeira: cashflow, faturas pendentes, pagamentos vencidos, análise por período.",
      parameters: {
        type: "object",
        properties: {
          analysisType: {
            type: "string",
            description: "Tipo de análise: cashflow, overdue_invoices, payment_summary, monthly_analysis",
          },
          startDate: {
            type: "string",
            description: "Data inicial para análise (formato ISO: YYYY-MM-DD, opcional)",
          },
          endDate: {
            type: "string",
            description: "Data final para análise (formato ISO: YYYY-MM-DD, opcional)",
          },
        },
        required: ["analysisType"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_payable",
      description: "Cria um novo pagamento a fornecedor (payable). Valida IBAN português e NIF antes de criar. Use após confirmar todos os dados.",
      parameters: {
        type: "object",
        properties: {
          supplierName: {
            type: "string",
            description: "Nome do fornecedor/prestador",
          },
          nif: {
            type: "string",
            description: "NIF do fornecedor (9 dígitos, opcional)",
          },
          iban: {
            type: "string",
            description: "IBAN português (formato: PT50 XXXX XXXX XXXX XXXX XXXX X)",
          },
          amount: {
            type: "number",
            description: "Valor a pagar",
          },
          dueDate: {
            type: "string",
            description: "Data de vencimento (formato ISO: YYYY-MM-DD)",
          },
          description: {
            type: "string",
            description: "Descrição do pagamento (motivo, serviço, etc)",
          },
          receiptFileUrl: {
            type: "string",
            description: "URL do recibo/fatura (opcional)",
          },
          notes: {
            type: "string",
            description: "Observações adicionais (opcional)",
          },
        },
        required: ["supplierName", "iban", "amount", "dueDate", "description"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_payables",
      description: "Lista pagamentos a fornecedores. Pode filtrar por status, fornecedor, período, etc.",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "string",
            description: "Filtrar por status: pending, paid, overdue (opcional)",
          },
          supplierName: {
            type: "string",
            description: "Filtrar por nome do fornecedor (opcional, busca parcial)",
          },
          startDate: {
            type: "string",
            description: "Data inicial de vencimento (formato ISO: YYYY-MM-DD, opcional)",
          },
          endDate: {
            type: "string",
            description: "Data final de vencimento (formato ISO: YYYY-MM-DD, opcional)",
          },
          limit: {
            type: "number",
            description: "Número máximo de resultados (default: 20)",
          },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "mark_payable_as_paid",
      description: "Marca um payable como pago após transferência bancária. Regista data de pagamento.",
      parameters: {
        type: "object",
        properties: {
          payableId: {
            type: "string",
            description: "ID do payable",
          },
          paymentDate: {
            type: "string",
            description: "Data em que o pagamento foi efetuado (formato ISO: YYYY-MM-DD)",
          },
          paymentBatchId: {
            type: "string",
            description: "ID do lote SEPA usado (opcional)",
          },
          notes: {
            type: "string",
            description: "Observações sobre o pagamento (opcional)",
          },
        },
        required: ["payableId", "paymentDate"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "generate_sepa_csv",
      description: "Gera ficheiro CSV com pagamentos pendentes para upload bancário. Agrupa por lote.",
      parameters: {
        type: "object",
        properties: {
          payableIds: {
            type: "array",
            items: { type: "string" },
            description: "IDs dos payables a incluir no ficheiro (opcional, senão inclui todos pending)",
          },
          batchName: {
            type: "string",
            description: "Nome do lote de pagamentos (ex: 'Pagamentos Janeiro 2025')",
          },
        },
        required: ["batchName"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "check_gmail_invoices",
      description: "Verifica se há emails com faturas pendentes na caixa de correio Gmail conectada. Retorna lista de emails com faturas recebidas.",
      parameters: {
        type: "object",
        properties: {
          maxResults: {
            type: "number",
            description: "Número máximo de emails a verificar (default: 10)",
          },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "check_gmail_webhook_status",
      description: "Verifica o estado da configuração de notificações automáticas do Gmail (webhook). Mostra se está configurado, ativo, e quando expira.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "activate_gmail_webhook",
      description: "Ativa notificações automáticas do Gmail. Quando ativado, o sistema processa faturas automaticamente quando chegam por email.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_gmail_webhook_setup_guide",
      description: "Retorna guia passo-a-passo personalizado para configurar notificações automáticas do Gmail. Use quando user perguntar como configurar ou ativar processamento automático de faturas por email.",
      parameters: {
        type: "object",
        properties: {
          includeImages: {
            type: "boolean",
            description: "Se deve incluir links para imagens/screenshots (default: false)",
          },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "send_email",
      description: "Envia um email através do Gmail do utilizador. Use quando o utilizador pedir para enviar email, responder a alguém, ou contactar cliente/fornecedor. SEMPRE peça confirmação antes de enviar.",
      parameters: {
        type: "object",
        properties: {
          to: {
            type: "string",
            description: "Endereço de email do destinatário (ex: cliente@example.com)",
          },
          subject: {
            type: "string",
            description: "Assunto do email",
          },
          body: {
            type: "string",
            description: "Corpo do email em texto simples",
          },
          html: {
            type: "boolean",
            description: "Se o corpo é HTML (default: false)",
          },
        },
        required: ["to", "subject", "body"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "learn_from_email_response",
      description: "Guarda uma correção/modificação do utilizador como aprendizado para melhorar futuras sugestões de email. Use SEMPRE que o utilizador modificar ou corrigir uma resposta sugerida de email alert.",
      parameters: {
        type: "object",
        properties: {
          emailAlertId: {
            type: "string",
            description: "ID do alerta de email (obtido do metadata da mensagem anterior)",
          },
          emailType: {
            type: "string",
            description: "Tipo do email (pedido_info, encomenda, fatura, lead, urgent)",
          },
          originalSuggestion: {
            type: "string",
            description: "Sugestão original que foi gerada pelo AI",
          },
          userCorrection: {
            type: "string",
            description: "Versão corrigida/modificada pelo utilizador",
          },
          emailSubject: {
            type: "string",
            description: "Assunto do email (para contexto)",
          },
          emailFromName: {
            type: "string",
            description: "Nome do remetente (para contexto)",
          },
        },
        required: ["emailType", "originalSuggestion", "userCorrection"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_emails",
      description: "Lista emails recebidos e guardados na base de dados. Use para mostrar emails, pesquisar mensagens, ou encontrar emails específicos. Mostra: remetente, assunto, data, corpo (snippet).",
      parameters: {
        type: "object",
        properties: {
          category: {
            type: "string",
            description: "Filtrar por categoria: 'invoice' (faturas), 'order' (encomendas), 'lead' (comercial), ou null para todos",
          },
          limit: {
            type: "number",
            description: "Número máximo de emails a retornar (default: 20)",
          },
          search: {
            type: "string",
            description: "Pesquisar por palavra-chave no assunto ou remetente",
          },
          unreadOnly: {
            type: "boolean",
            description: "Mostrar apenas emails não lidos (default: false)",
          },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "read_email",
      description: "Lê o conteúdo completo de um email específico (corpo completo, anexos, metadados). Use quando precisar ver detalhes de um email.",
      parameters: {
        type: "object",
        properties: {
          emailId: {
            type: "string",
            description: "ID do email (obtido via list_emails)",
          },
        },
        required: ["emailId"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "sync_gmail_inbox",
      description: "Sincroniza emails recentes do Gmail para a base de dados. Use quando utilizador pedir para 'verificar novos emails', 'atualizar inbox', ou 'ver emails recentes'.",
      parameters: {
        type: "object",
        properties: {
          maxResults: {
            type: "number",
            description: "Número de emails a sincronizar (default: 50, máximo: 100)",
          },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "reprocess_failed_emails",
      description: "Reprocessa emails que falharam no processamento inicial. Útil quando emails com faturas não foram classificados corretamente. Usa AI classifier + agents para tentar novamente. Retorna quantos foram processados e quantos falharam.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "import_inventory_data",
      description: "Importa dados de inventário de ficheiro CSV/Excel. Processa produtos, cria armazéns automaticamente e atualiza stock por armazém. Use quando o utilizador fizer upload de ficheiro com inventário ou stock.",
      parameters: {
        type: "object",
        properties: {
          filePath: {
            type: "string",
            description: "Caminho do ficheiro para importar (ex: uploads/produtos_com_inventario_por_armazem_76.xlsx)",
          },
        },
        required: ["filePath"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "analyze_document",
      description: "Analisa um documento (fatura, recibo, contrato) e sugere configuração de agente personalizado. Use quando utilizador diz 'quero processar faturas da EDP' ou similar.",
      parameters: {
        type: "object",
        properties: {
          documentType: {
            type: "string",
            description: "Tipo de documento: 'invoice', 'receipt', 'contract', ou 'custom'",
          },
          supplierName: {
            type: "string",
            description: "Nome do fornecedor (opcional, ex: 'EDP', 'Vodafone')",
          },
          description: {
            type: "string",
            description: "Descrição do que o utilizador quer fazer",
          },
        },
        required: ["documentType", "description"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_conversion_agent",
      description: "Cria um agente personalizado para conversão automática de documentos. Use após analyze_document quando utilizador confirmar a criação.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Nome do agente (ex: 'Processador Faturas EDP')",
          },
          documentType: {
            type: "string",
            description: "Tipo de documento a processar",
          },
          supplierFilter: {
            type: "string",
            description: "Filtro de fornecedor (opcional)",
          },
          autoActions: {
            type: "array",
            items: { type: "string" },
            description: "Ações automáticas após extração (ex: 'create_payable', 'send_notification')",
          },
        },
        required: ["name", "documentType"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_review_queue",
      description: "Consulta documentos na fila de revisão que precisam de validação manual. Use quando utilizador perguntar 'há documentos para rever?'",
      parameters: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Número máximo de itens (default: 10)",
          },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_conversion_agents",
      description: "Lista agentes de conversão criados. Use quando utilizador perguntar 'que agentes tenho?' ou 'mostrar agentes criados'",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "search_documents",
      description: "Pesquisa documentos administrativos (contratos, certificações, documentos RGPD, etc). Use quando o utilizador pedir para procurar ou listar documentos.",
      parameters: {
        type: "object",
        properties: {
          search: {
            type: "string",
            description: "Termo de pesquisa (procura no título, descrição e conteúdo OCR)",
          },
          documentType: {
            type: "string",
            description: "Tipo de documento: 'contract', 'certificate', 'compliance', 'internal', 'external'",
          },
          categorySlug: {
            type: "string",
            description: "Slug da categoria (ex: 'contracts', 'certifications', 'gdpr')",
          },
          status: {
            type: "string",
            description: "Status: 'active', 'archived', 'expired', 'pending'",
          },
          limit: {
            type: "number",
            description: "Número máximo de resultados (default: 10)",
          },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "manage_contract",
      description: "Cria ou renova contratos. Use quando o utilizador mencionar 'criar contrato', 'novo contrato', 'renovar contrato'.",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["create", "renew", "list_expiring"],
            description: "Ação: 'create' para novo contrato, 'renew' para renovação, 'list_expiring' para listar contratos a expirar",
          },
          contractNumber: {
            type: "string",
            description: "Número do contrato (obrigatório para criar)",
          },
          title: {
            type: "string",
            description: "Título/descrição do contrato",
          },
          contractType: {
            type: "string",
            description: "Tipo: 'client', 'supplier', 'employee', 'service', 'rental'",
          },
          partyName: {
            type: "string",
            description: "Nome da contraparte do contrato",
          },
          partyType: {
            type: "string",
            description: "Tipo de contraparte: 'client', 'supplier', 'employee', 'other'",
          },
          value: {
            type: "number",
            description: "Valor do contrato",
          },
          startDate: {
            type: "string",
            description: "Data de início (formato YYYY-MM-DD)",
          },
          endDate: {
            type: "string",
            description: "Data de fim (formato YYYY-MM-DD)",
          },
          autoRenew: {
            type: "boolean",
            description: "Renovação automática",
          },
          contractId: {
            type: "string",
            description: "ID do contrato (para renovação)",
          },
          newEndDate: {
            type: "string",
            description: "Nova data de fim na renovação (formato YYYY-MM-DD)",
          },
          daysToExpiry: {
            type: "number",
            description: "Dias até expiração para listar (default: 60)",
          },
        },
        required: ["action"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "check_compliance",
      description: "Verifica compliance, certificações e items de regulamentação (ISO, HACCP, RGPD, etc). Use quando o utilizador perguntar sobre certificações, auditorias ou compliance.",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["list_expiring", "list_all", "check_status", "record_audit"],
            description: "Ação: 'list_expiring' para listar itens a expirar, 'list_all' para listar todos, 'check_status' para verificar status, 'record_audit' para registar auditoria",
          },
          complianceType: {
            type: "string",
            description: "Tipo: 'certification', 'license', 'gdpr', 'audit', 'regulation'",
          },
          category: {
            type: "string",
            description: "Categoria (ex: 'ISO', 'HACCP', 'GDPR', 'Financial')",
          },
          daysToExpiry: {
            type: "number",
            description: "Dias até expiração (default: 90)",
          },
          criticalOnly: {
            type: "boolean",
            description: "Mostrar apenas items críticos",
          },
          itemId: {
            type: "string",
            description: "ID do item de compliance (para record_audit)",
          },
          auditDate: {
            type: "string",
            description: "Data da auditoria (formato YYYY-MM-DD)",
          },
          auditNotes: {
            type: "string",
            description: "Notas da auditoria",
          },
        },
        required: ["action"],
      },
    },
  },
  
  // ERP Integration Tools
  {
    type: "function" as const,
    function: {
      name: "list_erp_connectors",
      description: "Lista conectores ERP disponíveis com documentação base (Primavera, SAP Business One, PHC, etc.)",
      parameters: {
        type: "object",
        properties: {
          type: {
            type: "string",
            description: "Filtrar por tipo: 'erp', 'all' (opcional)",
          },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_connector_docs",
      description: "Obtém documentação base de um conector ERP específico (endpoints, exemplos, mappings default)",
      parameters: {
        type: "object",
        properties: {
          connectorSlug: {
            type: "string",
            description: "Slug do conector: 'primavera-v10', 'sap-business-one', etc.",
          },
        },
        required: ["connectorSlug"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_erp_connection",
      description: "Cria uma conexão ERP específica para o tenant atual. Guarda credenciais e configuração. IMPORTANTE: Deves chamar list_erp_connectors primeiro para obter o connectorId (UUID) correto.",
      parameters: {
        type: "object",
        properties: {
          connectorId: {
            type: "string",
            description: "ID UUID do conector (obtido de list_erp_connectors). Exemplo: 'bc5c7912-43e7-4e80-be86-f63ae4858f64' para Primavera V10. NUNCA uses o slug, sempre o id UUID.",
          },
          connectionName: {
            type: "string",
            description: "Nome desta conexão (ex: 'Primavera Produção', 'SAP Testes')",
          },
          baseUrl: {
            type: "string",
            description: "URL base da API do ERP (ex: https://erp.empresa.pt/api)",
          },
          credentials: {
            type: "object",
            description: `Objeto com credenciais de acesso. ESTRUTURA OBRIGATÓRIA:
            
Para Primavera V10:
{
  "token": "xxx",           // Token OAuth do Primavera (obrigatório)
  "codEmpresa": "QHTESTE"   // Código da empresa no Primavera (obrigatório)
}

Para SAP Business One:
{
  "username": "xxx",
  "password": "xxx",
  "companyDB": "xxx"
}

NUNCA envies credenciais vazias! Sempre pede ao utilizador se faltarem dados.`,
          },
          customDocs: {
            type: "object",
            description: "Documentação customizada (opcional) - URL ou dados parseados",
          },
        },
        required: ["connectorId", "connectionName", "baseUrl", "credentials"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "test_erp_connection",
      description: "Testa conexão ERP - autentica e valida endpoints básicos. Retorna endpoints funcionais.",
      parameters: {
        type: "object",
        properties: {
          connectionId: {
            type: "string",
            description: "ID da conexão ERP a testar",
          },
        },
        required: ["connectionId"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "map_erp_fields",
      description: "Configura mapeamento de campos entre nosso sistema e o ERP (ex: name → Nome, taxId → NumContribuinte)",
      parameters: {
        type: "object",
        properties: {
          connectionId: {
            type: "string",
            description: "ID da conexão ERP",
          },
          entityType: {
            type: "string",
            enum: ["client", "product", "order", "invoice"],
            description: "Tipo de entidade a mapear",
          },
          mappings: {
            type: "object",
            description: "Objeto com mapeamentos: {ourField: 'erpField'}",
          },
        },
        required: ["connectionId", "entityType", "mappings"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "sync_erp_data",
      description: "Sincroniza dados entre assistOS e ERP. Pode puxar (pull) ou enviar (push) dados.",
      parameters: {
        type: "object",
        properties: {
          connectionId: {
            type: "string",
            description: "ID da conexão ERP",
          },
          syncType: {
            type: "string",
            enum: ["pull_clients", "pull_products", "push_invoice", "push_order", "check_stock"],
            description: "Tipo de sincronização",
          },
          filters: {
            type: "object",
            description: "Filtros opcionais (ex: lastModified, category)",
          },
        },
        required: ["connectionId", "syncType"],
      },
    },
  },
  
  {
    type: "function" as const,
    function: {
      name: "get_primavera_stock",
      description: "Obtém stock de um artigo no Primavera V10. Retorna quantidade disponível, armazém, lote, etc.",
      parameters: {
        type: "object",
        properties: {
          connectionId: {
            type: "string",
            description: "ID da conexão Primavera",
          },
          productCode: {
            type: "string",
            description: "Código do artigo no Primavera (CodigoArtigo)",
          },
          warehouse: {
            type: "string",
            description: "Armazém opcional (se não fornecido, retorna todos)",
          },
        },
        required: ["connectionId", "productCode"],
      },
    },
  },
  
  {
    type: "function" as const,
    function: {
      name: "create_primavera_document",
      description: "Cria documento comercial no Primavera V10 (Encomenda Cliente, Fatura, Orçamento). IMPORTANTE: usa isto para enviar encomendas criadas no assistOS para o Primavera.",
      parameters: {
        type: "object",
        properties: {
          connectionId: {
            type: "string",
            description: "ID da conexão Primavera",
          },
          documentType: {
            type: "string",
            enum: ["ECL", "FAT", "ORC"],
            description: "Tipo documento: ECL=Encomenda Cliente, FAT=Fatura, ORC=Orçamento",
          },
          orderId: {
            type: "string",
            description: "ID da encomenda no assistOS (será convertida para formato Primavera)",
          },
          customerCode: {
            type: "string",
            description: "Código do cliente no Primavera (Entidade)",
          },
        },
        required: ["connectionId", "documentType", "orderId", "customerCode"],
      },
    },
  },
  
  // Onboarding Tools
  {
    type: "function" as const,
    function: {
      name: "save_onboarding_context",
      description: "Save structured summary of onboarding conversation to cache (works BEFORE account creation). Call this when user has shared key information about their business during onboarding. This data will be automatically transferred when they create their account.",
      parameters: {
        type: "object",
        properties: {
          companyName: {
            type: "string",
            description: "Name of the company (if mentioned by user)",
          },
          industry: {
            type: "string",
            description: "Industry/sector (e.g., 'Catering', 'Construção', 'Tecnologia', 'Retalho')",
          },
          businessType: {
            type: "string",
            description: "Type of business (e.g., 'B2B', 'B2C', 'Serviços', 'Produção')",
          },
          mainChallenges: {
            type: "array",
            items: { type: "string" },
            description: "Array of main challenges mentioned by the user",
          },
          currentProcess: {
            type: "string",
            description: "Description of their current business process",
          },
          goals: {
            type: "array",
            items: { type: "string" },
            description: "Array of goals the user wants to achieve",
          },
          teamSize: {
            type: "number",
            description: "Size of the team (optional)",
          },
          conversationSummary: {
            type: "string",
            description: "Brief summary of the onboarding conversation",
          },
        },
        required: ["conversationSummary"],
      },
    },
  },
  
  // Configuration Tools (for Configuration Agent)
  ...projectConfigTools,
];

interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
}

// Helper: Normalize string for fuzzy search (remove accents, lowercase)
function normalizeString(str: string): string {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

// Helper: Calculate fuzzy match score
function getFuzzyScore(productName: string, searchQuery: string): number {
  const normalizedProduct = normalizeString(productName);
  const normalizedQuery = normalizeString(searchQuery);
  
  // Exact match = highest score
  if (normalizedProduct === normalizedQuery) return 100;
  
  // Contains full query = high score
  if (normalizedProduct.includes(normalizedQuery)) return 80;
  
  // Check if all query words are in product name
  const queryWords = normalizedQuery.split(/\s+/);
  const matchedWords = queryWords.filter(word => normalizedProduct.includes(word));
  
  if (matchedWords.length === queryWords.length) {
    return 60; // All words match
  } else if (matchedWords.length > 0) {
    return 40 * (matchedWords.length / queryWords.length); // Partial match
  }
  
  return 0; // No match
}

export interface AIToolContext {
  tenantId?: string;
  userId?: string;
  sessionId?: string;
}

export async function executeAITool(
  toolName: string,
  args: any,
  context?: string | AIToolContext // Support legacy string tenantId OR new context object
): Promise<ToolResult> {
  // Handle legacy calls with just tenantId string
  const tenantId = typeof context === 'string' ? context : context?.tenantId;
  const userId = typeof context === 'object' ? context?.userId : undefined;
  const sessionId = typeof context === 'object' ? context?.sessionId : undefined;
  try {
    switch (toolName) {
      case "search_products": {
        const { query, category, limit = 10 } = args;
        const allProducts = await storage.getProducts();
        
        // Fuzzy search with scoring
        let productsWithScore = allProducts.map((p: Product) => {
          const nameScore = getFuzzyScore(p.name, query);
          const codeScore = normalizeString(p.code).includes(normalizeString(query)) ? 90 : 0;
          const categoryScore = p.category ? getFuzzyScore(p.category, query) * 0.5 : 0;
          
          const totalScore = Math.max(nameScore, codeScore, categoryScore);
          
          return { product: p, score: totalScore };
        });
        
        // Filter by category if provided
        if (category) {
          productsWithScore = productsWithScore.filter(({ product }) => 
            normalizeString(product.category || "").includes(normalizeString(category))
          );
        }
        
        // Filter only products with score > 0 and sort by score
        let filtered = productsWithScore
          .filter(({ score }) => score > 0)
          .sort((a, b) => b.score - a.score)
          .map(({ product }) => product)
          .slice(0, limit);
        
        return {
          success: true,
          data: filtered.map((p: Product) => ({
            code: p.code,
            name: p.name,
            category: p.category,
            stock: p.stock,
            stockStatus: p.stockStatus,
            price: p.price,
            conservacao: p.conservacao,
            unidVenda: p.unidVenda,
          })),
        };
      }

      case "get_product_details": {
        const { code } = args;
        const allProducts = await storage.getProducts();
        const product = allProducts.find(
          (p: Product) => p.code.toLowerCase() === code.toLowerCase()
        );
        
        if (!product) {
          return { success: false, error: "Produto não encontrado" };
        }
        
        return { success: true, data: product };
      }

      case "check_stock": {
        const { productCodes } = args;
        const allProducts = await storage.getProducts();
        
        const stockInfo = productCodes.map((code: string) => {
          const product = allProducts.find(
            (p: Product) => p.code.toLowerCase() === code.toLowerCase()
          );
          
          if (!product) {
            return { code, available: false, message: "Produto não encontrado" };
          }
          
          return {
            code: product.code,
            name: product.name,
            stock: product.stock,
            stockStatus: product.stockStatus,
            available: product.stock > 0,
          };
        });
        
        return { success: true, data: stockInfo };
      }

      case "list_clients": {
        const { search } = args;
        const clients = await storage.getClients(search);
        
        return {
          success: true,
          data: clients.map((c) => ({
            id: c.id,
            name: c.name,
            email: c.email,
            company: c.company,
            phone: c.phone,
          })),
        };
      }

      case "get_client_details": {
        const { clientId } = args;
        const client = await storage.getClient(clientId);
        
        if (!client) {
          return { success: false, error: "Cliente não encontrado" };
        }
        
        return { success: true, data: client };
      }

      case "create_order": {
        const { clientId, items, source, conversationId } = args;
        
        console.log('[create_order] Input args:', { clientId, items, source, conversationId });
        
        // VALIDATION: Verify all products exist and get real prices from DB
        const validatedItems = [];
        for (const item of items) {
          const product = await storage.getProductByCode(item.productCode);
          
          if (!product) {
            console.error('[create_order] Product not found:', item.productCode);
            return {
              success: false,
              error: `Produto '${item.productCode}' não encontrado no sistema. Verifica o código do produto e tenta novamente.`,
            };
          }
          
          // Use real price from database (don't trust AI-provided price)
          const realPrice = parseFloat(product.price) || 0;
          
          // Reject products with zero or negative price
          if (realPrice <= 0) {
            console.error('[create_order] Product has invalid price:', product.code, realPrice);
            return {
              success: false,
              error: `Produto '${product.name}' (${product.code}) não tem preço definido no sistema (€${realPrice}). Contacta o gestor de produtos para corrigir o preço antes de criar a encomenda.`,
            };
          }
          
          validatedItems.push({
            productCode: product.code,
            productName: product.name,
            quantity: item.quantity,
            unitPrice: realPrice,
            total: realPrice * item.quantity,
          });
          
          console.log(`[create_order] Validated: ${product.code} - ${product.name} @ €${realPrice} x ${item.quantity}`);
        }
        
        const totalAmount = validatedItems.reduce(
          (sum, item) => sum + item.total,
          0
        );
        
        const orderData: InsertOrder = {
          clientId,
          status: "pending",
          totalAmount: totalAmount.toString(),
          source,
          items: validatedItems,
        };
        
        console.log('[create_order] Order data before DB insert:', orderData);
        
        try {
          const order = await storage.createOrder(orderData);
          console.log('[create_order] Order created successfully:', order.id);
          
          if (conversationId) {
            console.log('[create_order] Linking conversation to order:', conversationId, '→', order.id);
            await storage.updateConversationOrderId(conversationId, order.id);
            console.log('[create_order] ✓ Conversation linked successfully');
          } else {
            console.warn('[create_order] WARNING: No conversationId provided - order not linked to conversation');
          }
          
          return {
            success: true,
            data: {
              orderId: order.id,
              totalAmount,
              status: order.status,
              message: conversationId 
                ? "Pedido criado com sucesso e linkado à conversa" 
                : "Pedido criado com sucesso (sem link à conversa)",
            },
          };
        } catch (error: any) {
          console.error('[create_order] Database error:', error);
          return {
            success: false,
            error: `Erro ao criar encomenda: ${error.message || error}. ClientId usado: ${clientId}`,
          };
        }
      }

      case "create_task": {
        const { title, description, priority = "medium", clientId, conversationId } = args;
        
        const taskData: InsertTask = {
          title,
          description,
          status: "todo",
          priority,
          clientId: clientId || undefined,
          conversationId: conversationId || undefined,
        };
        
        const task = await storage.createTask(taskData);
        
        return {
          success: true,
          data: {
            taskId: task.id,
            title: task.title,
            message: "Tarefa criada com sucesso",
          },
        };
      }

      case "list_orders": {
        const { clientId, status, limit = 20 } = args;
        const allOrders = await storage.getOrders();
        
        let filtered = allOrders;
        
        if (clientId) {
          filtered = filtered.filter((o) => o.clientId === clientId);
        }
        
        if (status) {
          filtered = filtered.filter((o) => o.status === status);
        }
        
        filtered = filtered.slice(0, limit);
        
        return {
          success: true,
          data: filtered.map((o) => ({
            id: o.id,
            clientId: o.clientId,
            status: o.status,
            totalAmount: o.totalAmount,
            source: o.source,
            createdAt: o.createdAt,
            items: o.items,
          })),
        };
      }

      case "get_order_details": {
        const { orderId } = args;
        const order = await storage.getOrder(orderId);
        
        if (!order) {
          return { success: false, error: "Encomenda não encontrada" };
        }
        
        return { success: true, data: order };
      }

      case "get_client_orders": {
        const { clientId } = args;
        const allOrders = await storage.getOrders();
        const clientOrders = allOrders.filter((o) => o.clientId === clientId);
        
        return {
          success: true,
          data: clientOrders.map((o) => ({
            id: o.id,
            status: o.status,
            totalAmount: o.totalAmount,
            source: o.source,
            createdAt: o.createdAt,
            items: o.items,
          })),
        };
      }

      case "query_sales_analytics": {
        const { period, startDate, endDate } = args;
        
        const allOrders = await storage.getOrders();
        
        const now = new Date();
        let filterStartDate: Date;
        let filterEndDate: Date = now;
        
        switch (period) {
          case "today":
            filterStartDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
            break;
          case "this_week":
            const dayOfWeek = now.getDay();
            const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
            filterStartDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff, 0, 0, 0);
            break;
          case "this_month":
            filterStartDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
            break;
          case "last_7_days":
            filterStartDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7, 0, 0, 0);
            break;
          case "last_30_days":
            filterStartDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30, 0, 0, 0);
            break;
          default:
            if (startDate) {
              filterStartDate = new Date(startDate);
            } else {
              filterStartDate = new Date(0);
            }
            if (endDate) {
              filterEndDate = new Date(endDate);
            }
        }
        
        const filteredOrders = allOrders.filter((order) => {
          const orderDate = new Date(order.createdAt);
          return orderDate >= filterStartDate && orderDate <= filterEndDate;
        });
        
        const uniqueClients = new Set(filteredOrders.map((o) => o.clientId));
        const totalRevenue = filteredOrders.reduce((sum, o) => sum + Number(o.totalAmount || 0), 0);
        const totalOrders = filteredOrders.length;
        
        const ordersByStatus = filteredOrders.reduce((acc, order) => {
          acc[order.status] = (acc[order.status] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);
        
        return {
          success: true,
          data: {
            period,
            startDate: filterStartDate.toISOString(),
            endDate: filterEndDate.toISOString(),
            uniqueClients: uniqueClients.size,
            totalOrders,
            totalRevenue: totalRevenue.toFixed(2),
            averageOrderValue: totalOrders > 0 ? (totalRevenue / totalOrders).toFixed(2) : "0.00",
            ordersByStatus,
            orders: filteredOrders.map((o) => ({
              id: o.id,
              clientId: o.clientId,
              status: o.status,
              totalAmount: o.totalAmount,
              createdAt: o.createdAt,
            })),
          },
        };
      }

      case "list_available_modules": {
        if (!tenantId) {
          return { success: false, error: "TenantId é necessário para listar módulos" };
        }
        
        const { category } = args;
        const tenantStorage = await getTenantStorage(tenantId);
        const modules = await tenantStorage.getAvailableModules();
        
        let filtered = modules;
        if (category) {
          filtered = modules.filter((m: any) => m.category?.toLowerCase() === category.toLowerCase());
        }
        
        return {
          success: true,
          data: filtered.map((m: any) => ({
            id: m.id,
            name: m.name,
            slug: m.slug,
            description: m.description,
            icon: m.icon,
            category: m.category,
            features: m.features,
            agentTypes: m.agentTypes,
            isInstalled: m.isInstalled,
            isActive: m.isActive,
          })),
        };
      }

      case "get_module_details": {
        if (!tenantId) {
          return { success: false, error: "TenantId é necessário para obter detalhes do módulo" };
        }
        
        const { slug } = args;
        const tenantStorage = await getTenantStorage(tenantId);
        const modules = await tenantStorage.getAvailableModules();
        const module = modules.find((m: any) => m.slug === slug);
        
        if (!module) {
          return { success: false, error: `Módulo '${slug}' não encontrado` };
        }
        
        return {
          success: true,
          data: {
            id: module.id,
            name: module.name,
            slug: module.slug,
            description: module.description,
            icon: module.icon,
            category: module.category,
            features: module.features,
            agentTypes: module.agentTypes,
            isInstalled: module.isInstalled,
            isActive: module.isActive,
            activationInstructions: module.isActive 
              ? "Este módulo já está ativo! Podes acedê-lo pela barra lateral." 
              : module.isInstalled
              ? "Este módulo está instalado mas inativo. Para ativar, vai ao Hub de Módulos → clica em 'Ativar'."
              : "Este módulo ainda não está instalado. Para instalar, vai ao Hub de Módulos → clica em 'Ativar'.",
          },
        };
      }

      case "get_active_modules": {
        if (!tenantId) {
          return { success: false, error: "TenantId é necessário para listar módulos ativos" };
        }
        
        const tenantStorage = await getTenantStorage(tenantId);
        const modules = await tenantStorage.getActiveModules();
        
        return {
          success: true,
          data: modules.map((m: any) => ({
            id: m.id,
            name: m.name,
            slug: m.slug,
            description: m.description,
            icon: m.icon,
            features: m.features,
            agentTypes: m.agentTypes,
          })),
        };
      }

      case "install_module": {
        if (!tenantId) {
          return { success: false, error: "TenantId é necessário para instalar módulo" };
        }
        
        const { slug } = args;
        const { db } = await import("./db");
        const { moduleTemplates, modules } = await import("@shared/schema");
        const { eq, and } = await import("drizzle-orm");
        
        // Check if template exists and is active
        const [template] = await db
          .select()
          .from(moduleTemplates)
          .where(and(
            eq(moduleTemplates.slug, slug),
            eq(moduleTemplates.isActive, true)
          ))
          .limit(1);
        
        if (!template) {
          return { 
            success: false, 
            error: `Módulo '${slug}' não está disponível ou ainda não foi lançado. Está marcado como "Em breve".` 
          };
        }
        
        // Check if already installed
        const [existing] = await db
          .select()
          .from(modules)
          .where(and(
            eq(modules.tenantId, tenantId),
            eq(modules.slug, slug)
          ))
          .limit(1);
        
        if (existing) {
          return { 
            success: false, 
            error: `O módulo ${template.name} já está instalado e ativo!` 
          };
        }
        
        // Install module
        const [newModule] = await db
          .insert(modules)
          .values({
            tenantId,
            templateId: template.id,
            name: template.name,
            slug: template.slug,
            isActive: true,
          })
          .returning();
        
        return {
          success: true,
          data: {
            id: newModule.id,
            name: newModule.name,
            slug: newModule.slug,
            message: `✅ Módulo ${newModule.name} instalado e ativado com sucesso!`,
          },
        };
      }

      case "get_platform_overview": {
        if (!tenantId) {
          return { success: false, error: "TenantId é necessário" };
        }

        // Execute all checks in parallel for efficiency
        const [modulesResult, clientsResult, productsResult, salesResult, companyResult] = await Promise.all([
          executeAITool("get_active_modules", {}, tenantId),
          executeAITool("list_clients", { search: "" }, tenantId),
          executeAITool("search_products", { query: "", limit: 1000 }, tenantId),
          executeAITool("query_sales_analytics", { period: "today" }, tenantId),
          executeAITool("get_company_info", {}, tenantId),
        ]);

        const activeModules = modulesResult.success ? modulesResult.data : [];
        const clients = clientsResult.success ? clientsResult.data : [];
        const products = productsResult.success ? productsResult.data : [];
        const salesData = salesResult.success ? salesResult.data : null;
        const companyInfo = companyResult.success ? companyResult.data : null;

        // Calculate counts
        const modulesCount = activeModules.length;
        const clientsCount = clients.length;
        const productsCount = products.length;
        const ordersToday = salesData?.totalOrders || 0;

        // Check if specific modules are active
        const hasComercialModule = activeModules.some((m: any) => m.slug === "comercial");
        const hasFinanceiroModule = activeModules.some((m: any) => m.slug === "financeiro");

        // Calculate capabilities based on available data and modules
        const capabilities = [];
        
        if (clientsCount > 0) {
          capabilities.push("can_query_clients");
          capabilities.push("can_view_client_details");
        }
        
        if (productsCount > 0) {
          capabilities.push("can_query_products");
          capabilities.push("can_check_stock");
        }
        
        if (clientsCount > 0 && productsCount > 0 && hasComercialModule) {
          capabilities.push("can_create_orders");
        }
        
        if (ordersToday > 0 || (salesData && salesData.totalOrders > 0)) {
          capabilities.push("can_analyze_sales");
          capabilities.push("can_view_order_history");
        }

        capabilities.push("can_create_tasks"); // Always available

        // Platform status summary
        const platformStatus = modulesCount === 0 && clientsCount === 0 && productsCount === 0 
          ? "empty" 
          : modulesCount > 0 && clientsCount > 0 && productsCount > 0
          ? "configured"
          : "partial";

        return {
          success: true,
          data: {
            platformStatus,
            modules: {
              active: activeModules.map((m: any) => ({ name: m.name, slug: m.slug, icon: m.icon })),
              count: modulesCount,
              hasComercial: hasComercialModule,
              hasFinanceiro: hasFinanceiroModule,
            },
            data: {
              clients: clientsCount,
              products: productsCount,
              ordersToday: ordersToday,
            },
            company: companyInfo ? {
              name: companyInfo.name,
              sector: companyInfo.sector,
              businessType: companyInfo.businessType,
              configured: !!companyInfo.name,
            } : {
              configured: false,
            },
            capabilities,
            summary: `Plataforma ${platformStatus === 'empty' ? 'vazia' : platformStatus === 'configured' ? 'configurada' : 'parcialmente configurada'}: ${modulesCount} módulos ativos, ${clientsCount} clientes, ${productsCount} produtos, ${ordersToday} encomendas hoje.`
          },
        };
      }

      case "get_module_documentation": {
        const { slug } = args;
        const { getModuleDocumentation, generateModuleConfigGuide } = await import("@shared/module-docs");
        
        const docs = getModuleDocumentation(slug);
        if (!docs) {
          return {
            success: false,
            error: `Módulo '${slug}' não tem documentação disponível. Módulos documentados: comercial`
          };
        }
        
        const guide = generateModuleConfigGuide(slug);
        
        return {
          success: true,
          data: {
            moduleSlug: docs.moduleSlug,
            moduleName: docs.moduleName,
            category: docs.category,
            description: docs.description,
            agents: docs.agents.map(a => ({
              type: a.type,
              name: a.name,
              description: a.description,
              capabilities: a.capabilities,
              tools: a.tools
            })),
            features: docs.features,
            setupSteps: docs.setupSteps,
            configurationTips: docs.configurationTips,
            fullGuide: guide
          }
        };
      }

      case "list_databases": {
        if (!tenantId) {
          return { success: false, error: "TenantId é necessário" };
        }

        const { db } = await import("./db");
        const { dataSources } = await import("../shared/schema");
        const { eq } = await import("drizzle-orm");

        try {
          const databases = await db
            .select()
            .from(dataSources)
            .where(eq(dataSources.tenantId, tenantId));

          // Include default databases
          const defaultDatabases = [
            { name: "Clientes", slug: "clients", description: "Base de dados de clientes", isDefault: true },
            { name: "Produtos", slug: "products", description: "Catálogo de produtos", isDefault: true },
            { name: "Fornecedores", slug: "suppliers", description: "Gestão de fornecedores", isDefault: true },
            { name: "Documentos", slug: "documents", description: "Gestão documental", isDefault: true },
          ];

          const customDatabases = databases.map(db => ({
            name: db.name,
            slug: db.slug,
            description: db.description,
            icon: db.icon,
            isDefault: false,
            isActive: db.isActive,
          }));

          return {
            success: true,
            data: {
              total: defaultDatabases.length + customDatabases.length,
              default: defaultDatabases,
              custom: customDatabases,
              message: customDatabases.length > 0 
                ? `Tens ${defaultDatabases.length} bases padrão e ${customDatabases.length} personalizadas.`
                : `Tens ${defaultDatabases.length} bases padrão. Ainda não criaste bases personalizadas.`
            }
          };
        } catch (error: any) {
          console.error('[list_databases] Error:', error);
          return {
            success: false,
            error: `Erro ao listar bases de dados: ${error.message}`
          };
        }
      }

      case "create_database": {
        if (!tenantId) {
          return { success: false, error: "TenantId é necessário para criar base de dados" };
        }

        const { name, slug, description, icon = "Database" } = args;
        
        // Import here to avoid circular dependencies
        const { db } = await import("./db");
        const { dataSources } = await import("../shared/schema");
        const { eq, and } = await import("drizzle-orm");

        try {
          // Check if database with this slug already exists for tenant
          const existing = await db
            .select()
            .from(dataSources)
            .where(and(
              eq(dataSources.tenantId, tenantId),
              eq(dataSources.slug, slug)
            ))
            .limit(1);

          if (existing.length > 0) {
            return {
              success: false,
              error: `Já existe uma base de dados com o identificador "${slug}". Escolhe outro identificador único.`
            };
          }

          // Create the new data source
          const [newDatabase] = await db
            .insert(dataSources)
            .values({
              tenantId,
              name,
              slug,
              description,
              icon,
              sourceType: "internal",
              isActive: true,
              syncStrategy: "real_time",
            })
            .returning();

          return {
            success: true,
            data: {
              id: newDatabase.id,
              name: newDatabase.name,
              slug: newDatabase.slug,
              message: `✅ Base de dados "${name}" criada com sucesso! Já podes vê-la na página de Bases de Dados.`
            }
          };
        } catch (error: any) {
          console.error('[create_database] Error:', error);
          return {
            success: false,
            error: `Erro ao criar base de dados: ${error.message}`
          };
        }
      }

      case "create_agent": {
        if (!tenantId) {
          return { success: false, error: "TenantId é necessário para criar agente" };
        }

        const { name, agentType, description, databaseSlug, capabilities, maxTokens } = args;
        
        const { db } = await import("./db");
        const { customAgents, dataSources } = await import("../shared/schema");
        const { eq, and } = await import("drizzle-orm");

        try {
          // Check if agent with this type already exists
          const existingAgent = await db
            .select()
            .from(customAgents)
            .where(and(
              eq(customAgents.tenantId, tenantId),
              eq(customAgents.agentType, agentType)
            ))
            .limit(1);

          if (existingAgent.length > 0) {
            return {
              success: false,
              error: `Já existe um agente com o tipo "${agentType}". Usa outro identificador único.`
            };
          }

          // Verify database exists
          const database = await db
            .select()
            .from(dataSources)
            .where(and(
              eq(dataSources.tenantId, tenantId),
              eq(dataSources.slug, databaseSlug)
            ))
            .limit(1);

          if (database.length === 0) {
            return {
              success: false,
              error: `Base de dados "${databaseSlug}" não encontrada. Cria a base de dados primeiro.`
            };
          }

          // Generate system prompt based on capabilities
          const systemPrompt = `És parte do assistOS - um agente especializado "${name}".

**Descrição:**
${description}

**Base de Dados:**
Opera sobre a base de dados "${database[0].name}" (${databaseSlug}).

**Capacidades:**
${Array.isArray(capabilities) ? capabilities.map((c: string) => `- ${c}`).join('\n') : ''}

**Instruções:**
- Responde de forma clara e profissional
- Usa as ferramentas disponíveis para consultar e manipular dados
- Sugere próximas ações quando apropriado
- Cria tarefas quando identificares oportunidades
- Sempre avisa: "✅ Tarefa criada! Vê na página Tarefas" quando crias uma tarefa`;

          // Create the custom agent
          const [newAgent] = await db
            .insert(customAgents)
            .values({
              tenantId,
              name,
              agentType,
              description,
              databaseSlug,
              systemPrompt,
              capabilities: capabilities || [],
              maxTokens: maxTokens || 16384,
              isActive: true,
            })
            .returning();

          return {
            success: true,
            data: {
              id: newAgent.id,
              name: newAgent.name,
              agentType: newAgent.agentType,
              message: `✅ Agente "${name}" criado com sucesso! Já podes começar a usar no módulo de ${database[0].name}.`
            }
          };
        } catch (error: any) {
          console.error('[create_agent] Error:', error);
          return {
            success: false,
            error: `Erro ao criar agente: ${error.message}`
          };
        }
      }

      case "reconcile_orders": {
        if (!tenantId) {
          return { success: false, error: "TenantId é necessário" };
        }

        const { db } = await import("./db");
        const { orders, clients } = await import("../shared/schema");
        const { eq, and, isNull } = await import("drizzle-orm");

        try {
          const storage = await getTenantStorage(tenantId);
          
          // Get all orders without client_id
          const orphanOrders = await db
            .select()
            .from(orders)
            .where(and(
              eq(orders.tenantId, tenantId),
              isNull(orders.clientId)
            ));
          
          if (orphanOrders.length === 0) {
            return {
              success: true,
              data: {
                message: "✅ Todas as encomendas já estão ligadas a clientes",
                reconciled: 0,
                total: 0,
              }
            };
          }

          // Get all clients for matching
          const allClients = await storage.getClients();
          
          let reconciled = 0;
          const notFound: string[] = [];
          
          for (const order of orphanOrders) {
            if (!order.clientName) {
              continue;
            }
            
            // Find matching client by name
            const matchingClient = allClients.find((c: any) => 
              c.name?.toLowerCase().trim() === order.clientName?.toLowerCase().trim()
            );
            
            if (matchingClient) {
              // Update order with client_id
              await db
                .update(orders)
                .set({ clientId: matchingClient.id })
                .where(eq(orders.id, order.id));
              
              reconciled++;
            } else {
              notFound.push(order.clientName);
            }
          }
          
          const uniqueNotFound = Array.from(new Set(notFound));
          
          return {
            success: true,
            data: {
              message: `✅ ${reconciled} encomendas reconciliadas de ${orphanOrders.length} total`,
              reconciled,
              total: orphanOrders.length,
              clientsNotFound: uniqueNotFound.length > 0 ? uniqueNotFound.slice(0, 5) : null,
            }
          };
        } catch (error: any) {
          console.error('[reconcile_orders] Error:', error);
          return {
            success: false,
            error: `Erro ao reconciliar encomendas: ${error.message}`
          };
        }
      }

      case "get_company_info": {
        if (!tenantId) {
          return { success: false, error: "TenantId é necessário" };
        }

        const tenantStorage = await getTenantStorage(tenantId);
        const companyInfo = await tenantStorage.getCompanyInfo();
        
        if (!companyInfo || !companyInfo.name) {
          return {
            success: true,
            data: {
              exists: false,
              hasName: false,
              message: "Nenhuma informação da empresa guardada ainda"
            }
          };
        }

        return {
          success: true,
          data: {
            exists: true,
            hasName: true,
            info: {
              name: companyInfo.name,
              brandName: companyInfo.brandName || companyInfo.name,
              legalName: companyInfo.legalName || null,
              nif: companyInfo.nif || null,
              address: companyInfo.address || null,
              sector: companyInfo.sector || null,
              businessType: companyInfo.businessType || null,
              businessDescription: companyInfo.businessDescription || null,
              phone: companyInfo.phone || null,
              email: companyInfo.email || null,
              website: companyInfo.website || null,
            }
          }
        };
      }

      case "save_company_info": {
        const { name, brandName, legalName, nif, address, sector, businessType, businessDescription, phone, email, website } = args;
        
        const finalBrandName = brandName || name;
        if (!finalBrandName) {
          return { success: false, error: "Nome da empresa (brandName ou name) é obrigatório" };
        }

        // ONBOARDING MODE: Save to temporary cache if no tenant exists yet
        if (!tenantId) {
          const { onboardingCache } = await import("../shared/schema");
          const { eq, and, isNull, or } = await import("drizzle-orm");
          
          const companyData: any = { 
            name: finalBrandName,
            brandName: finalBrandName
          };
          if (legalName) companyData.legalName = legalName;
          if (nif) companyData.nif = nif;
          if (address) companyData.address = address;
          if (sector) companyData.sector = sector;
          if (businessType) companyData.businessType = businessType;
          if (businessDescription) companyData.businessDescription = businessDescription;
          if (phone) companyData.phone = phone;
          if (email) companyData.email = email;
          if (website) companyData.website = website;
          
          // Use REAL sessionId from request context (not random!)
          if (!sessionId && !userId) {
            console.error('[save_company_info] ERROR: No sessionId or userId available!');
            return {
              success: false,
              error: "Sessão não disponível. Por favor, recarrega a página."
            };
          }
          
          // Try to find existing cache entry by sessionId or userId
          let existingCache = null;
          if (userId) {
            // Prefer userId lookup (authenticated users)
            const results = await db.select()
              .from(onboardingCache)
              .where(and(
                eq(onboardingCache.userId, userId),
                isNull(onboardingCache.convertedToTenantId)
              ))
              .limit(1);
            existingCache = results[0];
          } else if (sessionId) {
            // Fallback to sessionId lookup (unauthenticated users)
            const results = await db.select()
              .from(onboardingCache)
              .where(and(
                eq(onboardingCache.sessionId, sessionId),
                isNull(onboardingCache.convertedToTenantId)
              ))
              .limit(1);
            existingCache = results[0];
          }
          
          if (existingCache) {
            // UPDATE existing cache entry
            const updatedCompanyInfo = {
              ...(existingCache.companyInfo as any || {}),
              ...companyData
            };
            
            await db.update(onboardingCache)
              .set({
                companyInfo: updatedCompanyInfo,
                updatedAt: new Date()
              })
              .where(eq(onboardingCache.id, existingCache.id));
            
            console.log('[save_company_info] Updated onboarding cache:', { 
              id: existingCache.id,
              sessionId, 
              userId,
              companyData: updatedCompanyInfo 
            });
            
            return {
              success: true,
              data: {
                message: "✅ Informações atualizadas! Vou lembrar-me disto quando criares a tua conta.",
                company: updatedCompanyInfo,
                cached: true,
                updated: true
              }
            };
          } else {
            // CREATE new cache entry
            await db.insert(onboardingCache).values({
              sessionId: sessionId || undefined,
              userId: userId || undefined,
              companyInfo: companyData,
            });
            
            console.log('[save_company_info] Created onboarding cache:', { sessionId, userId, companyData });
            
            return {
              success: true,
              data: {
                message: "✅ Informações guardadas! Vou lembrar-me disto quando criares a tua conta.",
                company: companyData,
                cached: true
              }
            };
          }
        }

        // TENANT MODE: Save to tenant company_info (standard flow)
        const tenantStorage = await getTenantStorage(tenantId);
        
        const dataToSave: any = { 
          name: finalBrandName,
          brandName: finalBrandName
        };
        if (legalName) dataToSave.legalName = legalName;
        if (nif) dataToSave.nif = nif;
        if (address) dataToSave.address = address;
        if (sector) dataToSave.sector = sector;
        if (businessType) dataToSave.businessType = businessType;
        if (businessDescription) dataToSave.businessDescription = businessDescription;
        if (phone) dataToSave.phone = phone;
        if (email) dataToSave.email = email;
        if (website) dataToSave.website = website;
        
        const updated = await tenantStorage.upsertCompanyInfo(dataToSave);
        
        return {
          success: true,
          data: {
            message: "✅ Informações da empresa guardadas com sucesso!",
            company: {
              name: updated.name,
              nif: updated.nif,
              address: updated.address,
              sector: updated.sector,
              businessType: updated.businessType,
              businessDescription: updated.businessDescription,
              phone: updated.phone,
              email: updated.email,
              website: updated.website,
            }
          }
        };
      }

      case "save_company_context": {
        if (!tenantId) {
          return { success: false, error: "TenantId é necessário para guardar contexto da empresa" };
        }

        const { sector, businessType, businessDescription } = args;
        const tenantStorage = await getTenantStorage(tenantId);
        
        // Get or create company info
        let companyInfo = await tenantStorage.getCompanyInfo();
        
        const dataToUpdate: any = {};
        if (sector) dataToUpdate.sector = sector;
        if (businessType) dataToUpdate.businessType = businessType;
        if (businessDescription) dataToUpdate.businessDescription = businessDescription;
        
        const updated = await tenantStorage.upsertCompanyInfo(dataToUpdate);
        
        return {
          success: true,
          data: {
            message: "✅ Contexto da empresa guardado com sucesso!",
            sector: updated.sector,
            businessType: updated.businessType,
            businessDescription: updated.businessDescription,
          }
        };
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
                  content: 'Responde de forma concisa e informativa em português. Fornece informação factual e atualizada.'
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
          let formattedResult = `📝 ${answer}`;
          
          if (citations.length > 0) {
            formattedResult += `\n\n🔗 Fontes:`;
            citations.slice(0, 3).forEach((url: string, index: number) => {
              formattedResult += `\n${index + 1}. ${url}`;
            });
          }
          
          return {
            success: true,
            data: {
              query,
              answer,
              citations,
              formattedResult,
              source: 'Perplexity AI'
            }
          };
        } catch (error) {
          console.error('[web_search] Error:', error);
          return {
            success: false,
            error: `Erro ao pesquisar na internet: ${error instanceof Error ? error.message : 'Erro desconhecido'}`
          };
        }
      }

      case "show_register_form": {
        const { firstName, lastName } = args;
        
        // Return structured data to show the registration form in the frontend
        return {
          success: true,
          data: {
            action: "SHOW_REGISTER_FORM",
            prefill: {
              firstName: firstName || "",
              lastName: lastName || ""
            }
          }
        };
      }

      case "create_invoice": {
        if (!tenantId) {
          return { success: false, error: "TenantId é necessário" };
        }

        const { clientId, invoiceNumber, issueDate, dueDate, items, paymentMethod, notes } = args;

        try {
          const tenantStorage = await getTenantStorage(tenantId);
          const client = await tenantStorage.getClient(clientId);
          
          if (!client) {
            return {
              success: false,
              error: `Cliente com ID ${clientId} não encontrado. Use list_clients primeiro.`
            };
          }

          let subtotal = 0;
          let taxAmount = 0;

          const invoiceItemsData = items.map((item: any) => {
            const itemTotal = item.quantity * item.unitPrice;
            const itemTax = (itemTotal * item.taxRate) / 100;
            subtotal += itemTotal;
            taxAmount += itemTax;
            
            return {
              description: item.description,
              quantity: item.quantity.toString(),
              unitPrice: item.unitPrice.toString(),
              taxRate: item.taxRate.toString(),
              totalAmount: (itemTotal + itemTax).toString(),
              productId: item.productId || null,
            };
          });

          const totalAmount = subtotal + taxAmount;

          const [invoice] = await db.insert(invoices).values({
            tenantId,
            invoiceNumber,
            clientId,
            clientName: client.name,
            clientNif: client.nif || null,
            clientAddress: client.address || null,
            issueDate: new Date(issueDate),
            dueDate: dueDate ? new Date(dueDate) : null,
            status: "draft",
            paymentStatus: "pending",
            paymentMethod: paymentMethod || null,
            subtotal: subtotal.toString(),
            taxAmount: taxAmount.toString(),
            totalAmount: totalAmount.toString(),
            paidAmount: "0",
            notes: notes || null,
          }).returning();

          await db.insert(invoiceItems).values(
            invoiceItemsData.map((item: any) => ({
              ...item,
              invoiceId: invoice.id,
            }))
          );

          return {
            success: true,
            data: {
              message: `✅ Fatura ${invoiceNumber} criada com sucesso!`,
              invoice: {
                id: invoice.id,
                number: invoice.invoiceNumber,
                client: invoice.clientName,
                issueDate: invoice.issueDate,
                dueDate: invoice.dueDate,
                subtotal: `€${subtotal.toFixed(2)}`,
                tax: `€${taxAmount.toFixed(2)}`,
                total: `€${totalAmount.toFixed(2)}`,
                status: invoice.status,
                items: items.length,
              }
            }
          };
        } catch (error: any) {
          console.error('[create_invoice] Error:', error);
          return {
            success: false,
            error: `Erro ao criar fatura: ${error.message}`
          };
        }
      }

      case "list_invoices": {
        if (!tenantId) {
          return { success: false, error: "TenantId é necessário" };
        }

        const { clientId, status, paymentStatus, startDate, endDate, limit = 20 } = args;

        try {
          const conditions = [eq(invoices.tenantId, tenantId)];
          
          if (clientId) conditions.push(eq(invoices.clientId, clientId));
          if (status) conditions.push(eq(invoices.status, status));
          if (paymentStatus) conditions.push(eq(invoices.paymentStatus, paymentStatus));
          if (startDate) conditions.push(gte(invoices.issueDate, new Date(startDate)));
          if (endDate) conditions.push(lte(invoices.issueDate, new Date(endDate)));

          const results = await db
            .select()
            .from(invoices)
            .where(and(...conditions))
            .orderBy(desc(invoices.issueDate))
            .limit(limit);

          const formattedResults = results.map(inv => ({
            id: inv.id,
            number: inv.invoiceNumber,
            client: inv.clientName,
            issueDate: inv.issueDate?.toISOString().split('T')[0],
            dueDate: inv.dueDate?.toISOString().split('T')[0] || null,
            total: `€${parseFloat(inv.totalAmount).toFixed(2)}`,
            paid: `€${parseFloat(inv.paidAmount).toFixed(2)}`,
            status: inv.status,
            paymentStatus: inv.paymentStatus,
          }));

          return {
            success: true,
            data: {
              count: formattedResults.length,
              invoices: formattedResults,
            }
          };
        } catch (error: any) {
          console.error('[list_invoices] Error:', error);
          return {
            success: false,
            error: `Erro ao listar faturas: ${error.message}`
          };
        }
      }

      case "record_payment": {
        if (!tenantId) {
          return { success: false, error: "TenantId é necessário" };
        }

        const { invoiceId, type, paymentMethod, paymentDate, amount, reference, notes } = args;

        try {
          const [payment] = await db.insert(payments).values({
            tenantId,
            invoiceId: invoiceId || null,
            type,
            paymentMethod,
            paymentDate: new Date(paymentDate),
            amount: amount.toString(),
            reference: reference || null,
            status: "completed",
            notes: notes || null,
          }).returning();

          if (invoiceId) {
            const [invoice] = await db
              .select()
              .from(invoices)
              .where(eq(invoices.id, invoiceId))
              .limit(1);

            if (invoice) {
              const newPaidAmount = parseFloat(invoice.paidAmount) + amount;
              const totalAmount = parseFloat(invoice.totalAmount);
              
              let newPaymentStatus: string;
              if (newPaidAmount >= totalAmount) {
                newPaymentStatus = "paid";
              } else if (newPaidAmount > 0) {
                newPaymentStatus = "partial";
              } else {
                newPaymentStatus = "pending";
              }

              await db
                .update(invoices)
                .set({
                  paidAmount: newPaidAmount.toString(),
                  paymentStatus: newPaymentStatus,
                  updatedAt: new Date(),
                })
                .where(eq(invoices.id, invoiceId));

              return {
                success: true,
                data: {
                  message: `✅ Pagamento de €${amount.toFixed(2)} registado com sucesso!`,
                  payment: {
                    id: payment.id,
                    invoice: invoice.invoiceNumber,
                    amount: `€${amount.toFixed(2)}`,
                    method: paymentMethod,
                    date: payment.paymentDate?.toISOString().split('T')[0],
                    reference: reference || null,
                  },
                  invoice: {
                    total: `€${totalAmount.toFixed(2)}`,
                    paid: `€${newPaidAmount.toFixed(2)}`,
                    remaining: `€${(totalAmount - newPaidAmount).toFixed(2)}`,
                    status: newPaymentStatus,
                  }
                }
              };
            }
          }

          return {
            success: true,
            data: {
              message: `✅ Pagamento de €${amount.toFixed(2)} registado com sucesso!`,
              payment: {
                id: payment.id,
                amount: `€${amount.toFixed(2)}`,
                method: paymentMethod,
                date: payment.paymentDate?.toISOString().split('T')[0],
              }
            }
          };
        } catch (error: any) {
          console.error('[record_payment] Error:', error);
          return {
            success: false,
            error: `Erro ao registar pagamento: ${error.message}`
          };
        }
      }

      case "get_financial_analysis": {
        if (!tenantId) {
          return { success: false, error: "TenantId é necessário" };
        }

        const { analysisType, startDate, endDate } = args;

        try {
          switch (analysisType) {
            case "cashflow": {
              const conditions = [eq(invoices.tenantId, tenantId)];
              if (startDate) conditions.push(gte(invoices.issueDate, new Date(startDate)));
              if (endDate) conditions.push(lte(invoices.issueDate, new Date(endDate)));

              const allInvoices = await db
                .select()
                .from(invoices)
                .where(and(...conditions));

              const totalInvoiced = allInvoices.reduce((sum, inv) => sum + parseFloat(inv.totalAmount), 0);
              const totalReceived = allInvoices.reduce((sum, inv) => sum + parseFloat(inv.paidAmount), 0);
              const totalPending = totalInvoiced - totalReceived;

              return {
                success: true,
                data: {
                  type: "cashflow",
                  period: { startDate, endDate },
                  summary: {
                    totalInvoiced: `€${totalInvoiced.toFixed(2)}`,
                    totalReceived: `€${totalReceived.toFixed(2)}`,
                    totalPending: `€${totalPending.toFixed(2)}`,
                    receivedPercentage: `${((totalReceived / totalInvoiced) * 100).toFixed(1)}%`,
                  }
                }
              };
            }

            case "overdue_invoices": {
              const overdueInvoices = await db
                .select()
                .from(invoices)
                .where(
                  and(
                    eq(invoices.tenantId, tenantId),
                    eq(invoices.paymentStatus, "pending"),
                    lte(invoices.dueDate, new Date())
                  )
                )
                .orderBy(desc(invoices.dueDate));

              const totalOverdue = overdueInvoices.reduce(
                (sum, inv) => sum + (parseFloat(inv.totalAmount) - parseFloat(inv.paidAmount)),
                0
              );

              return {
                success: true,
                data: {
                  type: "overdue_invoices",
                  count: overdueInvoices.length,
                  totalOverdue: `€${totalOverdue.toFixed(2)}`,
                  invoices: overdueInvoices.map(inv => ({
                    number: inv.invoiceNumber,
                    client: inv.clientName,
                    dueDate: inv.dueDate?.toISOString().split('T')[0],
                    amount: `€${(parseFloat(inv.totalAmount) - parseFloat(inv.paidAmount)).toFixed(2)}`,
                  }))
                }
              };
            }

            default:
              return {
                success: false,
                error: "Tipo de análise não suportado"
              };
          }
        } catch (error: any) {
          console.error('[get_financial_analysis] Error:', error);
          return {
            success: false,
            error: `Erro na análise financeira: ${error.message}`
          };
        }
      }

      case "create_payable": {
        if (!tenantId) {
          return { success: false, error: "TenantId é necessário" };
        }

        const { supplierName, nif, iban, amount, dueDate, description, receiptFileUrl, notes } = args;

        try {
          // Validação IBAN português (formato: PT50 XXXX XXXX XXXX XXXX XXXX X)
          const ibanClean = iban.replace(/\s/g, '').toUpperCase();
          const validationErrors: string[] = [];

          if (!ibanClean.startsWith('PT') || ibanClean.length !== 25) {
            validationErrors.push("IBAN inválido - deve começar com PT e ter 25 caracteres");
          }

          // Validação NIF (9 dígitos)
          if (nif && !/^\d{9}$/.test(nif)) {
            validationErrors.push("NIF inválido - deve ter 9 dígitos");
          }

          // Validação valor
          if (amount <= 0) {
            validationErrors.push("Valor deve ser positivo");
          }

          // Validação data vencimento
          const dueDateObj = new Date(dueDate);
          if (isNaN(dueDateObj.getTime())) {
            validationErrors.push("Data de vencimento inválida");
          }

          const [payable] = await db.insert(payables).values({
            tenantId,
            supplierName,
            nif: nif || null,
            iban: ibanClean,
            amount: amount.toString(),
            dueDate: dueDateObj,
            description,
            receiptFileUrl: receiptFileUrl || null,
            notes: notes || null,
            status: "pending",
            validationErrors: validationErrors.length > 0 ? validationErrors : null,
          }).returning();

          return {
            success: true,
            data: {
              message: validationErrors.length > 0 
                ? `⚠️ Payable criado com avisos de validação`
                : `✅ Payable criado com sucesso!`,
              payable: {
                id: payable.id,
                supplier: payable.supplierName,
                amount: `€${parseFloat(payable.amount).toFixed(2)}`,
                dueDate: payable.dueDate.toISOString().split('T')[0],
                status: payable.status,
                iban: payable.iban,
              },
              validationErrors: validationErrors.length > 0 ? validationErrors : undefined,
            }
          };
        } catch (error: any) {
          console.error('[create_payable] Error:', error);
          return {
            success: false,
            error: `Erro ao criar payable: ${error.message}`
          };
        }
      }

      case "list_payables": {
        if (!tenantId) {
          return { success: false, error: "TenantId é necessário" };
        }

        const { status, supplierName, startDate, endDate, limit = 20 } = args;

        try {
          const conditions = [eq(payables.tenantId, tenantId)];

          if (status) conditions.push(eq(payables.status, status));
          if (supplierName) conditions.push(ilike(payables.supplierName, `%${supplierName}%`));
          if (startDate) conditions.push(gte(payables.dueDate, new Date(startDate)));
          if (endDate) conditions.push(lte(payables.dueDate, new Date(endDate)));

          const results = await db
            .select()
            .from(payables)
            .where(and(...conditions))
            .orderBy(desc(payables.dueDate))
            .limit(limit);

          const totalAmount = results.reduce((sum, p) => sum + parseFloat(p.amount), 0);

          return {
            success: true,
            data: {
              count: results.length,
              totalAmount: `€${totalAmount.toFixed(2)}`,
              payables: results.map(p => ({
                id: p.id,
                supplier: p.supplierName,
                nif: p.nif,
                iban: p.iban,
                amount: `€${parseFloat(p.amount).toFixed(2)}`,
                dueDate: p.dueDate.toISOString().split('T')[0],
                status: p.status,
                description: p.description,
                hasValidationErrors: p.validationErrors ? true : false,
              }))
            }
          };
        } catch (error: any) {
          console.error('[list_payables] Error:', error);
          return {
            success: false,
            error: `Erro ao listar payables: ${error.message}`
          };
        }
      }

      case "mark_payable_as_paid": {
        if (!tenantId) {
          return { success: false, error: "TenantId é necessário" };
        }

        const { payableId, paymentDate, paymentBatchId, notes } = args;

        try {
          const [payable] = await db
            .select()
            .from(payables)
            .where(and(eq(payables.id, payableId), eq(payables.tenantId, tenantId)))
            .limit(1);

          if (!payable) {
            return {
              success: false,
              error: `Payable com ID ${payableId} não encontrado`
            };
          }

          if (payable.status === "paid") {
            return {
              success: false,
              error: "Payable já está marcado como pago"
            };
          }

          const [updated] = await db
            .update(payables)
            .set({
              status: "paid",
              paymentDate: new Date(paymentDate),
              paymentBatchId: paymentBatchId || null,
              notes: notes ? `${payable.notes || ''}\n${notes}`.trim() : payable.notes,
              updatedAt: new Date(),
            })
            .where(eq(payables.id, payableId))
            .returning();

          return {
            success: true,
            data: {
              message: `✅ Payable marcado como pago!`,
              payable: {
                id: updated.id,
                supplier: updated.supplierName,
                amount: `€${parseFloat(updated.amount).toFixed(2)}`,
                paymentDate: updated.paymentDate?.toISOString().split('T')[0],
                status: updated.status,
              }
            }
          };
        } catch (error: any) {
          console.error('[mark_payable_as_paid] Error:', error);
          return {
            success: false,
            error: `Erro ao marcar payable como pago: ${error.message}`
          };
        }
      }

      case "generate_sepa_csv": {
        if (!tenantId) {
          return { success: false, error: "TenantId é necessário" };
        }

        const { payableIds, batchName } = args;

        try {
          let conditions;
          
          if (payableIds && payableIds.length > 0) {
            conditions = and(
              eq(payables.tenantId, tenantId),
              or(...payableIds.map((id: string) => eq(payables.id, id)))!
            );
          } else {
            conditions = and(eq(payables.tenantId, tenantId), eq(payables.status, "pending"));
          }

          const pendingPayables = await db
            .select()
            .from(payables)
            .where(conditions);

          if (pendingPayables.length === 0) {
            return {
              success: false,
              error: "Nenhum payable pendente encontrado"
            };
          }

          // Gerar CSV simples (Nome,IBAN,Valor,Referência)
          const csvHeader = "Nome Beneficiário,IBAN,Valor (EUR),Referência\n";
          const csvRows = pendingPayables.map(p => {
            const ref = `PAY-${p.id.substring(0, 8)}`;
            return `"${p.supplierName}","${p.iban}",${parseFloat(p.amount).toFixed(2)},"${ref}"`;
          }).join('\n');

          const csvContent = csvHeader + csvRows;
          const totalAmount = pendingPayables.reduce((sum, p) => sum + parseFloat(p.amount), 0);

          // Gerar batch ID único
          const batchId = `BATCH-${Date.now()}`;

          // Atualizar payables com batch ID (para rastreamento)
          await db
            .update(payables)
            .set({ paymentBatchId: batchId, updatedAt: new Date() })
            .where(or(...pendingPayables.map(p => eq(payables.id, p.id))));

          return {
            success: true,
            data: {
              message: `✅ Ficheiro CSV gerado com ${pendingPayables.length} pagamentos!`,
              batchId,
              batchName,
              summary: {
                count: pendingPayables.length,
                totalAmount: `€${totalAmount.toFixed(2)}`,
              },
              csvContent,
              fileName: `pagamentos_${batchId}.csv`,
              instructions: [
                "1. Copiar o conteúdo CSV abaixo",
                "2. Guardar como ficheiro .csv",
                "3. Importar no homebanking",
                "4. Processar transferências",
                "5. Marcar payables como pagos após confirmação"
              ]
            }
          };
        } catch (error: any) {
          console.error('[generate_sepa_csv] Error:', error);
          return {
            success: false,
            error: `Erro ao gerar ficheiro SEPA: ${error.message}`
          };
        }
      }

      case "check_gmail_invoices": {
        try {
          if (!tenantId) {
            return {
              success: false,
              error: "Tenant ID necessário para verificar emails"
            };
          }

          const { maxResults = 10 } = args;

          // Importar serviço Gmail
          const { fetchEmailsWithInvoices } = await import('./services/gmail');
          const storage = await getTenantStorage(tenantId);

          // Obter todos os users do tenant (simplificado - pega o primeiro user)
          const { db } = await import('./db');

          // Buscar primeiro user do tenant (simplificado)
          const userTenants = await db.query.userTenants.findFirst({
            where: (userTenants, { eq }) => eq(userTenants.tenantId, tenantId),
          });

          if (!userTenants) {
            return {
              success: false,
              error: "Nenhum utilizador encontrado para este tenant"
            };
          }

          const userId = userTenants.userId;

          // Verificar se tem token OAuth
          const token = await storage.getUserOAuthToken(userId, 'gmail');
          
          if (!token) {
            return {
              success: true,
              data: {
                message: "Gmail não conectado. Por favor, configure a conexão Gmail nos Conectores.",
                hasGmailConnection: false,
                emails: []
              }
            };
          }

          // Buscar emails com faturas
          const emails = await fetchEmailsWithInvoices(userId, tenantId, maxResults);

          return {
            success: true,
            data: {
              message: `Encontrados ${emails.length} email(s) com faturas nos últimos 30 dias.`,
              hasGmailConnection: true,
              emails: emails.map((e: any) => ({
                id: e.id,
                subject: e.subject,
                from: e.sender,
                receivedAt: e.receivedDate,
                snippet: e.snippet
              }))
            }
          };
        } catch (error: any) {
          console.error('[check_gmail_invoices] Error:', error);
          return {
            success: false,
            error: `Erro ao verificar emails: ${error.message}`
          };
        }
      }

      case "check_gmail_webhook_status": {
        try {
          if (!tenantId) {
            return {
              success: false,
              error: "Tenant ID necessário"
            };
          }

          const storage = await getTenantStorage(tenantId);
          const { db } = await import('./db');

          // Buscar primeiro user do tenant
          const userTenants = await db.query.userTenants.findFirst({
            where: (userTenants, { eq }) => eq(userTenants.tenantId, tenantId),
          });

          if (!userTenants) {
            return {
              success: false,
              error: "Nenhum utilizador encontrado"
            };
          }

          const userId = userTenants.userId;
          const token = await storage.getUserOAuthToken(userId, 'gmail');

          if (!token) {
            return {
              success: true,
              data: {
                configured: false,
                message: "❌ Gmail não conectado. Configure primeiro a conexão Gmail nos Conectores.",
                steps: [
                  "1. Ir aos Conectores",
                  "2. Conectar Gmail",
                  "3. Voltar e ativar notificações automáticas"
                ]
              }
            };
          }

          // Verificar se Pub/Sub está configurado
          const pubsubTopic = process.env.GMAIL_PUBSUB_TOPIC;

          return {
            success: true,
            data: {
              configured: !!pubsubTopic,
              gmailConnected: true,
              pubsubConfigured: !!pubsubTopic,
              message: pubsubTopic 
                ? "✅ Sistema pronto! Use 'activate_gmail_webhook' para ativar notificações automáticas."
                : "⚠️ Configuração incompleta. É necessário configurar Google Cloud Pub/Sub.",
              missingSteps: pubsubTopic ? [] : [
                "Configurar Google Cloud Pub/Sub (guia disponível com 'get_gmail_webhook_setup_guide')"
              ]
            }
          };
        } catch (error: any) {
          console.error('[check_gmail_webhook_status] Error:', error);
          return {
            success: false,
            error: `Erro: ${error.message}`
          };
        }
      }

      case "activate_gmail_webhook": {
        try {
          if (!tenantId) {
            return {
              success: false,
              error: "Tenant ID necessário"
            };
          }

          const storage = await getTenantStorage(tenantId);
          const { db } = await import('./db');

          const userTenants = await db.query.userTenants.findFirst({
            where: (userTenants, { eq }) => eq(userTenants.tenantId, tenantId),
          });

          if (!userTenants) {
            return {
              success: false,
              error: "Utilizador não encontrado"
            };
          }

          const userId = userTenants.userId;
          const token = await storage.getUserOAuthToken(userId, 'gmail');

          if (!token) {
            return {
              success: false,
              error: "Gmail não conectado. Configure primeiro a conexão Gmail."
            };
          }

          const pubsubTopic = process.env.GMAIL_PUBSUB_TOPIC;
          if (!pubsubTopic) {
            return {
              success: false,
              error: "Google Cloud Pub/Sub não configurado. Use 'get_gmail_webhook_setup_guide' para obter instruções."
            };
          }

          // Ativar watch
          const { startGmailWatch } = await import('./services/gmail');
          const result = await startGmailWatch(userId, tenantId);

          return {
            success: true,
            data: {
              activated: true,
              historyId: result.historyId,
              expiration: result.expiration,
              message: "🎉 Notificações automáticas ativadas! A partir de agora, quando receber um email com fatura, o sistema processa automaticamente e cria a conta a pagar.",
              expiresIn: "7 dias (renovação automática recomendada)"
            }
          };
        } catch (error: any) {
          console.error('[activate_gmail_webhook] Error:', error);
          return {
            success: false,
            error: `Erro ao ativar: ${error.message}`
          };
        }
      }

      case "get_gmail_webhook_setup_guide": {
        try {
          const domain = process.env.REPLIT_DEV_DOMAIN || 'sua-app.repl.co';
          
          return {
            success: true,
            data: {
              title: "📋 Configuração de Notificações Automáticas do Gmail",
              subtitle: "3 passos simples (5 minutos)",
              steps: [
                {
                  number: 1,
                  title: "Criar Tópico no Google Cloud Pub/Sub",
                  instructions: [
                    "Vá a https://console.cloud.google.com/cloudpubsub/topic",
                    "Clique em 'CREATE TOPIC'",
                    "Topic ID: gmail-notifications",
                    "Clique em 'CREATE'",
                    "COPIE o nome completo que aparece (ex: projects/seu-projeto/topics/gmail-notifications)"
                  ],
                  tip: "💡 Se pedir para 'Enable API', clique em ENABLE e aguarde 10-20 segundos"
                },
                {
                  number: 2,
                  title: "Criar Subscription (modo Pull)",
                  instructions: [
                    "Vá a https://console.cloud.google.com/cloudpubsub/subscription",
                    "Clique em 'CREATE SUBSCRIPTION'",
                    "Subscription ID: gmail-pull-sub",
                    "Topic: Selecione 'gmail-notifications'",
                    "Delivery type: Escolha PULL (não Push!)",
                    "Clique em 'CREATE'"
                  ],
                  tip: "⚠️ Use PULL para evitar problemas de permissões"
                },
                {
                  number: 3,
                  title: "Adicionar Secret no Replit",
                  instructions: [
                    "No Replit, clique no ícone do cadeado 🔒 (Secrets)",
                    "Clique em '+ New Secret'",
                    "Key: GMAIL_PUBSUB_TOPIC",
                    `Value: Cole o nome completo do Passo 1`,
                    "Clique em 'Add Secret'"
                  ]
                },
                {
                  number: 4,
                  title: "Ativar no assistOS",
                  instructions: [
                    "Volte ao chat",
                    "Diga: 'Ativar notificações automáticas do Gmail'",
                    "Pronto! ✅"
                  ]
                }
              ],
              testing: {
                title: "🧪 Como Testar",
                steps: [
                  "Envie email para a conta Gmail conectada",
                  "Assunto: 'Fatura Fornecedor Teste'",
                  "Anexe qualquer PDF",
                  "Aguarde 10-15 segundos",
                  "Pergunte ao assistente: 'Mostrar últimas contas a pagar'",
                  "Se aparecer a fatura → Funcionou! 🎉"
                ]
              },
              troubleshooting: [
                {
                  error: "Topic not configured",
                  solution: "Verificar que adicionou o secret GMAIL_PUBSUB_TOPIC corretamente"
                },
                {
                  error: "Gmail not connected",
                  solution: "Conectar Gmail primeiro nos Conectores"
                }
              ]
            }
          };
        } catch (error: any) {
          console.error('[get_gmail_webhook_setup_guide] Error:', error);
          return {
            success: false,
            error: `Erro: ${error.message}`
          };
        }
      }

      case "list_emails": {
        try {
          if (!tenantId) {
            return {
              success: false,
              error: "Tenant ID necessário"
            };
          }

          const { category, limit = 20, search, unreadOnly = false } = args;
          const storage = await getTenantStorage(tenantId);

          // Buscar emails da BD com filtros
          const allEmails = await storage.getEmailInbox({ category });

          // Filtrar por search term
          let filteredEmails = allEmails;
          if (search) {
            const searchLower = search.toLowerCase();
            filteredEmails = allEmails.filter((email: any) => 
              (email.subject || '').toLowerCase().includes(searchLower) ||
              email.fromAddress.toLowerCase().includes(searchLower) ||
              email.fromName?.toLowerCase().includes(searchLower)
            );
          }

          // Filtrar por unread
          if (unreadOnly) {
            filteredEmails = filteredEmails.filter((email: any) => !email.isRead);
          }

          // Aplicar limite
          const limitedEmails = filteredEmails.slice(0, Math.min(limit, 100));

          // Formatar resposta
          const formattedEmails = limitedEmails.map((email: any) => ({
            id: email.id,
            from: email.fromName ? `${email.fromName} <${email.fromAddress}>` : email.fromAddress,
            subject: email.subject || '(sem assunto)',
            snippet: email.snippet || email.bodyText?.substring(0, 150) || '',
            date: new Date(email.receivedAt).toLocaleString('pt-PT'),
            isRead: email.isRead,
            isStarred: email.isStarred,
            category: email.category,
            hasAttachments: Array.isArray(email.attachments) && email.attachments.length > 0
          }));

          return {
            success: true,
            data: {
              emails: formattedEmails,
              total: formattedEmails.length,
              message: `Encontrados ${formattedEmails.length} emails${category ? ` (categoria: ${category})` : ''}`
            }
          };

        } catch (error: any) {
          console.error('[list_emails] Error:', error);
          return {
            success: false,
            error: `Erro ao listar emails: ${error.message}`
          };
        }
      }

      case "read_email": {
        try {
          if (!tenantId) {
            return {
              success: false,
              error: "Tenant ID necessário"
            };
          }

          const { emailId } = args;

          if (!emailId) {
            return {
              success: false,
              error: "ID do email é obrigatório"
            };
          }

          const storage = await getTenantStorage(tenantId);
          const email = await storage.getEmailInboxItem(emailId);

          if (!email) {
            return {
              success: false,
              error: `Email com ID ${emailId} não encontrado`
            };
          }

          // Formatar corpo do email
          const body = email.bodyText || email.bodyHtml || email.snippet || "Corpo do email não disponível";

          return {
            success: true,
            data: {
              id: email.id,
              from: email.fromName ? `${email.fromName} <${email.fromAddress}>` : email.fromAddress,
              to: email.toAddress,
              subject: email.subject,
              body: body,
              date: new Date(email.receivedAt).toLocaleString('pt-PT'),
              isRead: email.isRead,
              isStarred: email.isStarred,
              category: email.category,
              attachments: email.attachments || [],
              threadId: email.threadId,
              gmailMessageId: email.gmailMessageId
            }
          };

        } catch (error: any) {
          console.error('[read_email] Error:', error);
          return {
            success: false,
            error: `Erro ao ler email: ${error.message}`
          };
        }
      }

      case "sync_gmail_inbox": {
        try {
          if (!tenantId) {
            return {
              success: false,
              error: "Tenant ID necessário"
            };
          }

          const { maxResults = 50 } = args;

          // Buscar userId do tenant
          const { db } = await import('./db');
          const userTenants = await db.query.userTenants.findFirst({
            where: (userTenants, { eq }) => eq(userTenants.tenantId, tenantId),
          });

          if (!userTenants) {
            return {
              success: false,
              error: "Utilizador não encontrado"
            };
          }

          const userId = userTenants.userId;

          // Verificar se Gmail está conectado
          const storage = await getTenantStorage(tenantId);
          const token = await storage.getUserOAuthToken(userId, 'gmail');

          if (!token) {
            return {
              success: false,
              error: "Gmail não conectado. Configure primeiro a conexão Gmail nos Conectores."
            };
          }

          // Sincronizar emails
          const { syncGmailEmailsToDB } = await import('./services/gmail');
          const syncedEmails = await syncGmailEmailsToDB(userId, tenantId, Math.min(maxResults, 100));

          return {
            success: true,
            data: {
              message: `✅ Sincronizados ${syncedEmails.length} emails do Gmail`,
              count: syncedEmails.length
            }
          };

        } catch (error: any) {
          console.error('[sync_gmail_inbox] Error:', error);
          return {
            success: false,
            error: `Erro ao sincronizar Gmail: ${error.message}`
          };
        }
      }

      case "reprocess_failed_emails": {
        try {
          // Call the existing HTTP route
          const response = await fetch(`http://localhost:5000/api/email-inbox/reprocess-failed`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Falha ao reprocessar emails');
          }

          const data = await response.json();

          return {
            success: true,
            data: {
              message: `✅ Reprocessados ${data.processed} emails de ${data.processed + data.failed} falhados. ${data.failed > 0 ? `${data.failed} continuam falhados.` : ''}`,
              processed: data.processed,
              failed: data.failed,
              details: data
            }
          };

        } catch (error: any) {
          console.error('[reprocess_failed_emails] Error:', error);
          return {
            success: false,
            error: `Erro ao reprocessar emails: ${error.message}`
          };
        }
      }

      case "send_email": {
        try {
          if (!tenantId) {
            return {
              success: false,
              error: "Tenant ID necessário para enviar email"
            };
          }

          const { to, subject, body, html = false } = args;

          if (!to || !subject || !body) {
            return {
              success: false,
              error: "Campos obrigatórios: to, subject, body"
            };
          }

          // Buscar userId do tenant
          const { db } = await import('./db');
          const userTenants = await db.query.userTenants.findFirst({
            where: (userTenants, { eq }) => eq(userTenants.tenantId, tenantId),
          });

          if (!userTenants) {
            return {
              success: false,
              error: "Utilizador não encontrado"
            };
          }

          const userId = userTenants.userId;

          // Verificar se Gmail está conectado
          const storage = await getTenantStorage(tenantId);
          const token = await storage.getUserOAuthToken(userId, 'gmail');

          if (!token) {
            return {
              success: false,
              error: "Gmail não conectado. Configure primeiro a conexão Gmail nos Conectores."
            };
          }

          // Enviar email
          const { sendGmailEmail } = await import('./services/gmail');
          const result = await sendGmailEmail({
            userId,
            tenantId,
            to,
            subject,
            body,
            html
          });

          console.log(`[send_email] Email enviado para ${to}:`, result);

          return {
            success: true,
            data: {
              message: `✅ Email enviado com sucesso para ${to}`,
              messageId: result.id,
              threadId: result.threadId,
              to,
              subject
            }
          };

        } catch (error: any) {
          console.error('[send_email] Error:', error);
          return {
            success: false,
            error: `Erro ao enviar email: ${error.message}`
          };
        }
      }

      case "learn_from_email_response": {
        try {
          if (!tenantId) {
            return {
              success: false,
              error: "Tenant ID necessário"
            };
          }

          const { 
            emailAlertId, 
            emailType, 
            originalSuggestion, 
            userCorrection,
            emailSubject,
            emailFromName
          } = args;

          if (!emailType || !originalSuggestion || !userCorrection) {
            return {
              success: false,
              error: "Campos obrigatórios: emailType, originalSuggestion, userCorrection"
            };
          }

          // Buscar userId do tenant
          const { db } = await import('./db');
          const userTenants = await db.query.userTenants.findFirst({
            where: (userTenants, { eq }) => eq(userTenants.tenantId, tenantId),
          });

          if (!userTenants) {
            return {
              success: false,
              error: "Utilizador não encontrado"
            };
          }

          const userId = userTenants.userId;

          // Salvar aprendizado
          const { saveEmailResponseLearning } = await import('./services/email-alerts');
          await saveEmailResponseLearning(
            tenantId,
            userId,
            emailAlertId || '',
            emailType,
            originalSuggestion,
            userCorrection,
            {
              subject: emailSubject,
              fromName: emailFromName
            }
          );

          return {
            success: true,
            data: {
              message: `✅ Aprendizado guardado! Futuras sugestões para emails tipo "${emailType}" vão usar este exemplo.`,
              emailType,
              learned: true
            }
          };

        } catch (error: any) {
          console.error('[learn_from_email_response] Error:', error);
          return {
            success: false,
            error: `Erro ao guardar aprendizado: ${error.message}`
          };
        }
      }

      case "import_inventory_data": {
        try {
          if (!tenantId) {
            return {
              success: false,
              error: "Tenant ID necessário para importar inventário"
            };
          }

          const { filePath } = args;
          
          if (!filePath) {
            return {
              success: false,
              error: "Caminho do ficheiro é obrigatório"
            };
          }

          // Process file
          const { processCSVFile } = await import('./utils/file-processor');
          const result = await processCSVFile(filePath);

          if (!result.data || result.data.length === 0) {
            return {
              success: false,
              error: `Nenhum dado válido encontrado no ficheiro. ${result.errors?.join(', ') || ''}`
            };
          }

          if (result.type !== 'inventory') {
            return {
              success: false,
              error: `Ficheiro não contém dados de inventário. Tipo detetado: ${result.type || 'desconhecido'}`
            };
          }

          const storage = await getTenantStorage(tenantId);
          
          // Get existing warehouses
          const existingWarehouses = await storage.getWarehouses();
          const warehouseMap = new Map(existingWarehouses.map((w: any) => [w.name.toLowerCase(), w]));
          
          let productsCreated = 0;
          let productsUpdated = 0;
          let warehousesCreated = 0;
          let inventoryUpdates = 0;

          // Process each inventory record
          for (const record of result.data) {
            const { product, warehouses } = record;
            
            // Create or update product
            let productRecord = await storage.getProductByCode(product.code);
            
            if (!productRecord) {
              productRecord = await storage.createProduct({
                tenantId,
                code: product.code,
                name: product.name,
                category: product.category,
                price: parseFloat(product.price) || 0,
                description: product.description || null,
                billingUnit: product.billingUnit || null,
                conservation: product.conservation || null,
                sellingUnit: product.sellingUnit || null,
                packaging: product.packaging || null,
              } as any);
              productsCreated++;
            } else {
              // Update if necessary
              await storage.updateProduct(productRecord.id, {
                name: product.name,
                category: product.category,
                price: String(parseFloat(product.price) || 0),
                description: product.description || null,
              });
              productsUpdated++;
            }

            // Process warehouse stock
            for (const [warehouseName, stock] of Object.entries(warehouses)) {
              const normalizedName = warehouseName.trim();
              const key = normalizedName.toLowerCase();
              
              // Create warehouse if doesn't exist
              let warehouse: any = warehouseMap.get(key);
              if (!warehouse) {
                warehouse = await storage.createWarehouse({
                  tenantId,
                  name: normalizedName,
                  code: normalizedName.substring(0, 3).toUpperCase(),
                  address: null,
                  city: normalizedName,
                  country: 'Portugal',
                  isActive: true,
                } as any);
                warehouseMap.set(key, warehouse);
                warehousesCreated++;
              }

              // Update inventory
              await storage.updateInventoryQuantity(
                tenantId,
                productRecord.id,
                warehouse.id,
                stock as number,
                'adjustment',
                'Importação de inventário'
              );
              inventoryUpdates++;
            }
          }

          return {
            success: true,
            data: {
              message: `✅ Inventário importado com sucesso!\n\n📦 Produtos: ${productsCreated} criados, ${productsUpdated} atualizados\n🏪 Armazéns: ${warehousesCreated} criados\n📊 Stock: ${inventoryUpdates} atualizações`,
              productsCreated,
              productsUpdated,
              warehousesCreated,
              inventoryUpdates,
              warnings: result.warnings || [],
              errors: result.errors || []
            }
          };

        } catch (error: any) {
          console.error('[import_inventory_data] Error:', error);
          return {
            success: false,
            error: `Erro ao importar inventário: ${error.message}`
          };
        }
      }

      case "analyze_document": {
        try {
          const { documentType, supplierName, description } = args;
          
          return {
            success: true,
            data: {
              suggestion: {
                agentName: supplierName 
                  ? `Processador ${documentType === 'invoice' ? 'Faturas' : 'Documentos'} ${supplierName}`
                  : `Processador ${documentType === 'invoice' ? 'Faturas' : 'Documentos'}`,
                documentType,
                supplierFilter: supplierName || null,
                capabilities: [
                  "Extração automática de dados",
                  "Validação cruzada de valores",
                  "Aprendizagem contínua",
                  "Criação automática de registos"
                ],
                recommendedActions: documentType === 'invoice' 
                  ? ['create_payable', 'notify_accounting']
                  : ['store_document', 'notify_relevant_team'],
                description: `Agente que processa automaticamente ${documentType === 'invoice' ? 'faturas' : 'documentos'}${supplierName ? ` da ${supplierName}` : ''} com extração inteligente e aprendizagem contínua.`
              }
            }
          };
        } catch (error: any) {
          return {
            success: false,
            error: `Erro ao analisar documento: ${error.message}`
          };
        }
      }

      case "create_conversion_agent": {
        try {
          if (!tenantId) {
            return { success: false, error: "Tenant ID não fornecido" };
          }
          
          const { name, documentType, supplierFilter, autoActions } = args;
          
          const [agent] = await db.insert(conversionAgents).values({
            tenantId,
            name,
            documentType,
            supplierFilter: supplierFilter || null,
            autoActions: autoActions || null,
            isActive: true,
            learningEnabled: true,
            createdBy: tenantId,
          }).returning();
          
          return {
            success: true,
            data: {
              agent: {
                id: agent.id,
                name: agent.name,
                documentType: agent.documentType,
                supplierFilter: agent.supplierFilter,
                status: 'active',
              },
              message: `✅ Agente "${name}" criado com sucesso! Agora vai processar automaticamente documentos do tipo "${documentType}"${supplierFilter ? ` da ${supplierFilter}` : ''}.`
            }
          };
        } catch (error: any) {
          return {
            success: false,
            error: `Erro ao criar agente: ${error.message}`
          };
        }
      }

      case "get_review_queue": {
        try {
          if (!tenantId) {
            return { success: false, error: "Tenant ID não fornecido" };
          }
          
          const { limit = 10 } = args;
          
          const reviews = await reviewQueueService.getPendingReviews(tenantId);
          const limitedReviews = reviews.slice(0, limit);
          
          return {
            success: true,
            data: {
              count: limitedReviews.length,
              total: reviews.length,
              reviews: limitedReviews.map(r => ({
                id: r.id,
                documentType: r.documentType,
                confidence: r.confidence,
                priority: r.priority,
                reason: r.reason,
                warnings: r.validationWarnings,
                createdAt: r.createdAt,
              })),
              message: limitedReviews.length > 0
                ? `📋 ${limitedReviews.length} documento(s) aguardam revisão (${reviews.length} total)`
                : "✅ Não há documentos pendentes de revisão"
            }
          };
        } catch (error: any) {
          return {
            success: false,
            error: `Erro ao consultar fila de revisão: ${error.message}`
          };
        }
      }

      case "get_conversion_agents": {
        try {
          if (!tenantId) {
            return { success: false, error: "Tenant ID não fornecido" };
          }
          
          const agents = await db
            .select()
            .from(conversionAgents)
            .where(eq(conversionAgents.tenantId, tenantId))
            .orderBy(desc(conversionAgents.createdAt));
          
          return {
            success: true,
            data: {
              count: agents.length,
              agents: agents.map(a => ({
                id: a.id,
                name: a.name,
                documentType: a.documentType,
                supplierFilter: a.supplierFilter,
                accuracy: a.accuracy ? `${a.accuracy}%` : 'N/A',
                executionCount: a.executionCount,
                successCount: a.successCount,
                isActive: a.isActive,
                createdAt: a.createdAt,
              })),
              message: agents.length > 0
                ? `🤖 ${agents.length} agente(s) de conversão criado(s)`
                : "Ainda não há agentes criados. Use 'analyze_document' para começar!"
            }
          };
        } catch (error: any) {
          return {
            success: false,
            error: `Erro ao listar agentes: ${error.message}`
          };
        }
      }

      case "search_documents": {
        try {
          if (!tenantId) {
            return { success: false, error: "Tenant ID não fornecido" };
          }

          const { search, documentType, categorySlug, status, limit = 10 } = args;

          const documents = await documentManagementService.getDocuments({
            tenantId,
            documentType,
            status,
            search,
          });

          const limited = documents.slice(0, limit);

          return {
            success: true,
            data: {
              count: limited.length,
              total: documents.length,
              documents: limited.map(d => ({
                id: d.id,
                title: d.title,
                documentType: d.documentType,
                status: d.status,
                fileName: d.fileName,
                expiryDate: d.expiryDate,
                createdAt: d.createdAt,
              })),
              message: limited.length > 0
                ? `📄 ${limited.length} documento(s) encontrado(s)`
                : "Nenhum documento encontrado com esses critérios"
            }
          };
        } catch (error: any) {
          return {
            success: false,
            error: `Erro ao pesquisar documentos: ${error.message}`
          };
        }
      }

      case "manage_contract": {
        try {
          if (!tenantId) {
            return { success: false, error: "Tenant ID não fornecido" };
          }
          
          const userId = (typeof context === 'object' && context?.userId) || 'system';

          const { action } = args;

          switch (action) {
            case "create": {
              const {
                contractNumber,
                title,
                contractType,
                partyName,
                partyType,
                value,
                startDate,
                endDate,
                autoRenew
              } = args;

              if (!contractNumber || !title || !partyName) {
                return {
                  success: false,
                  error: "Campos obrigatórios em falta: contractNumber, title, partyName"
                };
              }

              const contract = await contractLifecycleService.createContract({
                tenantId,
                userId,
                contractNumber,
                title,
                contractType: contractType || 'service',
                partyType: partyType || 'other',
                partyName,
                value,
                startDate: new Date(startDate),
                endDate: endDate ? new Date(endDate) : undefined,
                autoRenew,
              });

              return {
                success: true,
                data: {
                  contract: {
                    id: contract.id,
                    contractNumber: contract.contractNumber,
                    title: contract.title,
                    partyName: contract.partyName,
                    value: contract.value,
                    startDate: contract.startDate,
                    endDate: contract.endDate,
                  },
                  message: `✅ Contrato "${title}" criado com sucesso!`
                }
              };
            }

            case "renew": {
              const { contractId, newEndDate } = args;

              if (!contractId || !newEndDate) {
                return {
                  success: false,
                  error: "Campos obrigatórios: contractId, newEndDate"
                };
              }

              const renewal = await contractLifecycleService.renewContract({
                tenantId,
                userId,
                contractId,
                newEndDate: new Date(newEndDate),
              });

              return {
                success: true,
                data: {
                  renewal,
                  message: `✅ Renovação do contrato criada. Aguarda aprovação.`
                }
              };
            }

            case "list_expiring": {
              const { daysToExpiry = 60 } = args;

              const expiring = await contractLifecycleService.checkExpiringContracts(
                tenantId,
                daysToExpiry
              );

              return {
                success: true,
                data: {
                  count: expiring.length,
                  contracts: expiring.map(c => ({
                    id: c.id,
                    title: c.title,
                    partyName: c.partyName,
                    endDate: c.endDate,
                    daysRemaining: c.endDate
                      ? Math.ceil((new Date(c.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                      : null,
                  })),
                  message: expiring.length > 0
                    ? `⚠️ ${expiring.length} contrato(s) a expirar nos próximos ${daysToExpiry} dias`
                    : `✅ Nenhum contrato a expirar nos próximos ${daysToExpiry} dias`
                }
              };
            }

            default:
              return { success: false, error: "Ação desconhecida" };
          }
        } catch (error: any) {
          return {
            success: false,
            error: `Erro ao gerir contrato: ${error.message}`
          };
        }
      }

      case "check_compliance": {
        try {
          if (!tenantId) {
            return { success: false, error: "Tenant ID não fornecido" };
          }

          const { action } = args;

          switch (action) {
            case "list_expiring": {
              const { daysToExpiry = 90, criticalOnly = false } = args;

              const expiring = await complianceMonitorService.checkExpiringCompliance({
                tenantId,
                days: daysToExpiry,
                criticalOnly,
              });

              return {
                success: true,
                data: {
                  count: expiring.length,
                  items: expiring.map(item => ({
                    id: item.id,
                    title: item.title,
                    complianceType: item.complianceType,
                    category: item.category,
                    expiryDate: item.expiryDate,
                    critical: item.criticalAlert,
                    daysRemaining: item.expiryDate
                      ? Math.ceil((new Date(item.expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                      : null,
                  })),
                  message: expiring.length > 0
                    ? `⚠️ ${expiring.length} item(s) de compliance a expirar${criticalOnly ? ' (críticos)' : ''}`
                    : `✅ Nenhum item de compliance a expirar nos próximos ${daysToExpiry} dias`
                }
              };
            }

            case "list_all": {
              const { complianceType, category } = args;

              const items = await complianceMonitorService.getComplianceItems({
                tenantId,
                complianceType,
                category,
              });

              return {
                success: true,
                data: {
                  count: items.length,
                  items: items.map(item => ({
                    id: item.id,
                    title: item.title,
                    complianceType: item.complianceType,
                    category: item.category,
                    status: item.status,
                    expiryDate: item.expiryDate,
                  })),
                  message: `📋 ${items.length} item(s) de compliance`
                }
              };
            }

            case "check_status": {
              const stats = await complianceMonitorService.getComplianceStats(tenantId);

              return {
                success: true,
                data: {
                  stats,
                  message: `📊 Total: ${stats.total} | Ativos: ${stats.active} | Expirados: ${stats.expired} | A expirar: ${stats.expiringSoon} | Críticos: ${stats.critical}`
                }
              };
            }

            case "record_audit": {
              const { itemId, auditDate, auditNotes } = args;

              if (!itemId || !auditDate) {
                return {
                  success: false,
                  error: "Campos obrigatórios: itemId, auditDate"
                };
              }

              const updated = await complianceMonitorService.recordAudit({
                tenantId,
                itemId,
                auditDate: new Date(auditDate),
                notes: auditNotes,
              });

              return {
                success: true,
                data: {
                  item: {
                    id: updated.id,
                    title: updated.title,
                    lastAuditDate: updated.lastAuditDate,
                    nextAuditDate: updated.nextAuditDate,
                  },
                  message: `✅ Auditoria registada para "${updated.title}"`
                }
              };
            }

            default:
              return { success: false, error: "Ação desconhecida" };
          }
        } catch (error: any) {
          return {
            success: false,
            error: `Erro ao verificar compliance: ${error.message}`
          };
        }
      }
      
      // ERP Integration Tools
      case "list_erp_connectors": {
        const { type = 'erp' } = args;
        
        const tenantStorage = await getTenantStorage(tenantId!);
        const allConnectors: any[] = await db.select().from(connectors).where(
          type === 'all' ? sql`1=1` : eq(connectors.type, type)
        );
        
        return {
          success: true,
          data: allConnectors.map((c: any) => {
            const endpoints = typeof c.commonEndpoints === 'string' 
              ? JSON.parse(c.commonEndpoints) 
              : c.commonEndpoints;
            
            return {
              id: c.id,
              name: c.name,
              slug: c.slug,
              type: c.type,
              description: c.description,
              apiVersion: c.apiVersion,
              documentationUrl: c.documentationUrl,
              numEndpoints: endpoints ? endpoints.length : 0,
              status: c.status,
            };
          })
        };
      }
      
      case "get_connector_docs": {
        const { connectorSlug } = args;
        
        const connector: any[] = await db.select().from(connectors).where(
          eq(connectors.slug, connectorSlug)
        ).limit(1);
        
        if (!connector || connector.length === 0) {
          return { success: false, error: `Conector '${connectorSlug}' não encontrado` };
        }
        
        const docs = connector[0];
        
        const parseField = (field: any) => {
          if (!field) return null;
          return typeof field === 'string' ? JSON.parse(field) : field;
        };
        
        return {
          success: true,
          data: {
            name: docs.name,
            version: docs.apiVersion,
            docUrl: docs.documentationUrl,
            authType: docs.authType,
            commonEndpoints: parseField(docs.commonEndpoints) || [],
            examplePayloads: parseField(docs.examplePayloads) || {},
            defaultFieldMappings: parseField(docs.defaultFieldMappings) || {},
          }
        };
      }
      
      case "create_erp_connection": {
        const { connectorId, connectionName, baseUrl, credentials, customDocs } = args;
        
        if (!tenantId) {
          return { success: false, error: "Tenant ID não fornecido" };
        }
        
        // Convert slug to UUID if needed (support both formats)
        let finalConnectorId = connectorId;
        
        // Check if it's a slug (not a UUID pattern)
        if (!connectorId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
          const connector: any[] = await db.select({ id: connectors.id })
            .from(connectors)
            .where(eq(connectors.slug, connectorId))
            .limit(1);
          
          if (connector.length === 0) {
            return { success: false, error: `Conector '${connectorId}' não encontrado. Use list_erp_connectors para ver conectores disponíveis.` };
          }
          
          finalConnectorId = connector[0].id;
        }
        
        const newConnection: any[] = await db.insert(erpConnections).values({
          tenantId: tenantId,
          connectorId: finalConnectorId,
          connectionName,
          baseUrl,
          credentials: JSON.stringify(credentials),
          hasCustomDocs: !!customDocs,
          customApiDocs: customDocs ? JSON.stringify(customDocs) : null,
          customDocSource: customDocs ? 'user_provided' : null,
          status: 'pending',
        }).returning();
        
        const created = newConnection[0];
        
        return {
          success: true,
          data: {
            id: created.id,
            name: connectionName,
            baseUrl,
            status: 'pending',
            message: `✅ Conexão '${connectionName}' criada! ID: ${created.id}. Agora vamos testá-la.`
          }
        };
      }
      
      case "test_erp_connection": {
        const { connectionId } = args;
        
        if (!tenantId) {
          return { success: false, error: "Tenant ID não fornecido" };
        }
        
        // Get connection to determine which ERP type
        const connection = await db.query.erpConnections.findFirst({
          where: eq(erpConnections.id, connectionId),
          with: {
            connector: true,
          },
        });
        
        if (!connection) {
          return { success: false, error: 'Conexão não encontrada' };
        }
        
        let testResult: any;
        const erpType = (connection.connector as any)?.slug || '';
        
        if (erpType === 'primavera-v10') {
          // Create Primavera client
          const { createPrimaveraClient } = await import('./services/primavera-client');
          const client = await createPrimaveraClient(connectionId, tenantId);
          
          if (!client) {
            await db.update(erpConnections)
              .set({
                status: 'error',
                lastTestAt: new Date(),
                testResult: 'failed',
              })
              .where(eq(erpConnections.id, connectionId));
            
            return {
              success: false,
              error: 'Erro ao criar cliente Primavera. Verifique as credenciais.'
            };
          }
          
          testResult = await client.testConnection();
        } else if (erpType === 'sap-business-one') {
          // Create SAP B1 client
          const { createSAPClient } = await import('./services/sap-client');
          const client = await createSAPClient(connectionId, tenantId);
          
          if (!client) {
            await db.update(erpConnections)
              .set({
                status: 'error',
                lastTestAt: new Date(),
                testResult: 'failed',
              })
              .where(eq(erpConnections.id, connectionId));
            
            return {
              success: false,
              error: 'Erro ao criar cliente SAP Business One. Verifique as credenciais.'
            };
          }
          
          testResult = await client.testConnection();
        } else {
          return {
            success: false,
            error: `Tipo de ERP '${erpType}' ainda não suportado para testes automáticos.`
          };
        }
        
        // Update connection status based on test result
        if (testResult.success) {
          await db.update(erpConnections)
            .set({
              status: 'ready',
              lastTestAt: new Date(),
              testResult: 'success',
            })
            .where(eq(erpConnections.id, connectionId));
          
          return {
            success: true,
            data: {
              status: 'success',
              endpoints: testResult.data?.endpoints || {},
              message: testResult.data?.message || '✅ Conexão testada com sucesso!'
            }
          };
        } else {
          await db.update(erpConnections)
            .set({
              status: 'error',
              lastTestAt: new Date(),
              testResult: 'failed',
            })
            .where(eq(erpConnections.id, connectionId));
          
          return {
            success: false,
            error: testResult.error || 'Falha ao testar conexão'
          };
        }
      }
      
      case "map_erp_fields": {
        const { connectionId, entityType, mappings } = args;
        
        // Delete existing mappings for this entity
        await db.delete(erpFieldMappings as any).where(
          and(
            eq((erpFieldMappings as any).erpConnectionId, connectionId),
            eq((erpFieldMappings as any).entityType, entityType)
          )
        );
        
        // Insert new mappings
        const mappingEntries = Object.entries(mappings).map(([ourField, erpField]) => ({
          erpConnectionId: connectionId,
          entityType,
          ourField,
          erpField,
          source: 'user_defined',
          isValidated: false,
        }));
        
        await db.insert(erpFieldMappings as any).values(mappingEntries);
        
        return {
          success: true,
          data: {
            entityType,
            mappingsCount: mappingEntries.length,
            message: `✅ ${mappingEntries.length} mapeamentos configurados para '${entityType}'`
          }
        };
      }
      
      case "sync_erp_data": {
        const { connectionId, syncType, filters = {} } = args;
        
        if (!tenantId) {
          return { success: false, error: "Tenant ID não fornecido" };
        }
        
        const client = await createPrimaveraClient(connectionId, tenantId);
        
        if (!client) {
          return { success: false, error: 'Erro ao criar cliente Primavera' };
        }
        
        const tenantStorage = await getTenantStorage(tenantId);
        const mapper = createERPMapper(connectionId);
        
        try {
          if (syncType === 'pull_clients') {
            // Import clients from Primavera
            const result = await client.getClientes(filters.limit || 100, filters.skip || 0);
            
            if (!result.success) {
              return { success: false, error: result.error };
            }
            
            const clientes = result.data?.value || [];
            let imported = 0;
            let failed = 0;
            
            for (const cliente of clientes) {
              try {
                const newClient = await tenantStorage.createClient({
                  name: cliente.Nome || cliente.Entidade,
                  email: cliente.Email || '',
                  phone: cliente.Telefone || '',
                  nif: cliente.NumContribuinte || '',
                  address: cliente.Morada || '',
                  city: cliente.Localidade || '',
                  postalCode: cliente.CodigoPostal || '',
                  country: cliente.Pais || 'Portugal',
                });
                
                // Save mapping: our client.id → Primavera Entidade
                if (newClient && newClient.id) {
                  await mapper.saveClientMapping(newClient.id, cliente.Entidade);
                }
                
                imported++;
              } catch (err) {
                console.error(`[Sync] Failed to import client ${cliente.Entidade}:`, err);
                failed++;
              }
            }
            
            return {
              success: true,
              data: {
                syncType,
                recordsProcessed: clientes.length,
                recordsImported: imported,
                recordsFailed: failed,
                message: `✅ Importados ${imported} clientes do Primavera`
              }
            };
          }
          
          if (syncType === 'pull_products') {
            // Import products from Primavera
            const result = await client.getArtigos(filters.limit || 100, filters.skip || 0);
            
            if (!result.success) {
              return { success: false, error: result.error };
            }
            
            const artigos = result.data?.value || [];
            let imported = 0;
            let failed = 0;
            
            for (const artigo of artigos) {
              try {
                const newProduct = await tenantStorage.createProduct({
                  code: artigo.Artigo || artigo.CodigoArtigo,
                  name: artigo.Descricao || artigo.Artigo,
                  price: (parseFloat(artigo.PVP1 || artigo.Preco || '0')).toString(),
                  unidFaturacao: artigo.Unidade || 'un',
                  description: artigo.DescricaoDetalhada || '',
                });
                
                // Save mapping: our product.id → Primavera CodigoArtigo
                if (newProduct && newProduct.id) {
                  await mapper.saveProductMapping(newProduct.id, artigo.Artigo || artigo.CodigoArtigo);
                }
                
                imported++;
              } catch (err) {
                console.error(`[Sync] Failed to import product ${artigo.Artigo}:`, err);
                failed++;
              }
            }
            
            return {
              success: true,
              data: {
                syncType,
                recordsProcessed: artigos.length,
                recordsImported: imported,
                recordsFailed: failed,
                message: `✅ Importados ${imported} produtos do Primavera`
              }
            };
          }
          
          if (syncType === 'push_orders') {
            // Export orders to Primavera as ECL (Encomenda Cliente)
            // TODO: Implement order export
            // Need to:
            // 1. Get pending orders from our system
            // 2. Transform to DocumentoVenda format
            // 3. Call client.createDocumento()
            
            return {
              success: false,
              error: 'Push orders ainda não implementado - precisa de transformador de dados'
            };
          }
          
          return {
            success: false,
            error: `Tipo de sincronização '${syncType}' não suportado`
          };
          
        } catch (error: any) {
          console.error('[Sync] Error:', error);
          return {
            success: false,
            error: error.message || 'Erro na sincronização'
          };
        }
      }
      
      case "get_primavera_stock": {
        const { connectionId, productCode, warehouse } = args;
        
        if (!tenantId) {
          return { success: false, error: "Tenant ID não fornecido" };
        }
        
        const client = await createPrimaveraClient(connectionId, tenantId);
        
        if (!client) {
          return { success: false, error: 'Erro ao criar cliente Primavera' };
        }
        
        try {
          const result = await client.getStocks(productCode);
          
          if (!result.success) {
            return { success: false, error: result.error };
          }
          
          const stocks = result.data?.value || [];
          
          return {
            success: true,
            data: {
              productCode,
              warehouse: warehouse || 'todos',
              stocks: stocks.map((s: any) => ({
                armazem: s.Armazem,
                quantidade: s.StkActual || s.Quantidade,
                lote: s.Lote || '',
                localizacao: s.Localizacao || '',
              })),
              totalQuantity: stocks.reduce((sum: number, s: any) => sum + (parseFloat(s.StkActual || s.Quantidade || '0')), 0),
              message: `📦 Stock de ${productCode}: ${stocks.length} registos encontrados`
            }
          };
        } catch (error: any) {
          console.error('[Primavera Stock] Error:', error);
          return {
            success: false,
            error: error.message || 'Erro ao consultar stock'
          };
        }
      }
      
      case "create_primavera_document": {
        const { connectionId, documentType, orderId, customerCode } = args;
        
        if (!tenantId) {
          return { success: false, error: "Tenant ID não fornecido" };
        }
        
        const client = await createPrimaveraClient(connectionId, tenantId);
        
        if (!client) {
          return { success: false, error: 'Erro ao criar cliente Primavera' };
        }
        
        try {
          // Use transformer to convert order to DocumentoVenda
          const { createPrimaveraTransformer } = await import('./services/primavera-transformer');
          const transformer = createPrimaveraTransformer(connectionId, tenantId);
          
          const documento = await transformer.orderToDocumentoVenda(orderId, documentType, {
            observacoes: `Criado via assistOS`
          });
          
          // Override Entidade if provided explicitly
          if (customerCode) {
            documento.Entidade = customerCode;
          }
          
          const result = await client.createDocumento(documento as any);
          
          if (!result.success) {
            return { success: false, error: result.error };
          }
          
          return {
            success: true,
            data: {
              documentType,
              orderId,
              primaveraDoc: result.data,
              message: `✅ Documento ${documentType} criado no Primavera com ${documento.Linhas.length} linhas`
            }
          };
        } catch (error: any) {
          console.error('[Primavera Document] Error:', error);
          return {
            success: false,
            error: error.message || 'Erro ao criar documento'
          };
        }
      }
      
      // Onboarding Tools
      case "save_onboarding_context": {
        const { businessType, mainChallenges, currentProcess, goals, teamSize, conversationSummary, companyName, industry } = args;
        
        // Onboarding can work WITHOUT tenantId (before account creation)
        // Use sessionId for unauthenticated users, userId for authenticated
        
        if (!sessionId && !userId) {
          return { success: false, error: "Session ID ou User ID necessário" };
        }
        
        try {
          const { onboardingCache } = await import("@shared/schema");
          const { eq, and, isNull } = await import("drizzle-orm");
          
          // Build company info from context
          const companyInfoData = {
            name: companyName,
            industry: industry || businessType,
            businessType,
            businessDescription: conversationSummary,
            services: goals,
          };
          
          // Build preferences from context
          const preferencesData = {
            mainChallenges,
            currentProcess,
            goals,
            teamSize,
            conversationSummary,
            savedAt: new Date().toISOString(),
          };
          
          // Try to find existing cache entry
          let existingCache = null;
          
          if (userId) {
            // Authenticated user: find by userId
            const results = await db.select()
              .from(onboardingCache)
              .where(and(
                eq(onboardingCache.userId, userId),
                isNull(onboardingCache.convertedToTenantId)
              ))
              .limit(1);
            existingCache = results[0];
          } else if (sessionId) {
            // Unauthenticated user: find by sessionId
            const results = await db.select()
              .from(onboardingCache)
              .where(and(
                eq(onboardingCache.sessionId, sessionId),
                isNull(onboardingCache.convertedToTenantId)
              ))
              .limit(1);
            existingCache = results[0];
          }
          
          if (existingCache) {
            // Update existing cache
            await db
              .update(onboardingCache)
              .set({
                companyInfo: companyInfoData,
                preferences: preferencesData,
                updatedAt: new Date(),
              })
              .where(eq(onboardingCache.id, existingCache.id));
            
            console.log('[Onboarding] ✅ Cache updated:', {
              cacheId: existingCache.id,
              sessionId,
              userId,
              companyName,
              businessType,
            });
          } else {
            // Create new cache entry
            await db
              .insert(onboardingCache)
              .values({
                sessionId: userId ? null : sessionId, // Use sessionId ONLY if not authenticated
                userId: userId || null,
                companyInfo: companyInfoData,
                preferences: preferencesData,
              });
            
            console.log('[Onboarding] ✅ Cache created:', {
              sessionId,
              userId,
              companyName,
              businessType,
            });
          }
          
          return {
            success: true,
            data: {
              message: "✅ Contexto de onboarding guardado com sucesso!",
              companyInfo: companyInfoData,
              preferences: preferencesData,
            },
          };
        } catch (error: any) {
          console.error('[Onboarding] Error saving cache:', error);
          return {
            success: false,
            error: error.message || 'Erro ao guardar contexto de onboarding',
          };
        }
      }

      // Configuration Tools
      case "list_project_states":
      case "add_project_state":
      case "edit_project_state":
      case "remove_project_state": {
        if (!tenantId) {
          return { success: false, error: "Tenant ID não fornecido" };
        }
        return await executeConfigTool(toolName, args, tenantId);
      }

      default:
        return { success: false, error: "Ferramenta desconhecida" };
    }
  } catch (error) {
    console.error("Error executing AI tool:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao executar ferramenta",
    };
  }
}
