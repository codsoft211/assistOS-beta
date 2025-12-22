// Migrated from AssistOS legacy - Phase 4.0
// Source: /tmp/assistos-legacy/server/agents/tool-registry.ts

/**
 * Tool Registry - Smart Tool Filtering System
 * 
 * Categoriza todas as tools do Assist Me por módulo e funcionalidade.
 * Permite filtrar dynamicamente quais tools passar ao GPT baseado na intenção do user.
 * 
 * Estratégia: Passar apenas 5-15 tools relevantes em vez de 50+
 * Resultado: Respostas mais rápidas, menor token usage, melhor precisão
 */

export type ToolCategory = 
  | 'core'                    // Sempre disponível
  | 'financial-receivables'   // Faturas a clientes, recebimentos
  | 'financial-payables'      // Fornecedores, faturas de fornecedores, pagamentos
  | 'financial-accounting'    // Contabilidade, plano de contas, lançamentos
  | 'financial-banking'       // Contas bancárias, reconciliação
  | 'financial-tax'           // IVA, impostos, obrigações fiscais
  | 'financial-analytics'     // Cashflow, analytics financeiros
  | 'purchasing'              // Encomendas de compra
  | 'sales-orders'            // Encomendas de venda
  | 'inventory'               // Produtos, stock
  | 'tasks'                   // Gestão de tarefas
  | 'documents'               // Pesquisa documental
  | 'config';                 // Configuração tenant

export interface ToolMetadata {
  name: string;
  categories: ToolCategory[];
  requiredModule?: string;    // ex: "financeiro", "compras"
  requiredPermission?: string; // ex: "viewFinancialData"
}

/**
 * Registry de todas as tools com suas categorias
 */
export const TOOL_REGISTRY: ToolMetadata[] = [
  // ============ CORE TOOLS (sempre disponível) ============
  {
    name: "query_user_data",
    categories: ['core'],
  },
  
  // ============ TASKS ============
  {
    name: "create_personal_task",
    categories: ['core', 'tasks'],
  },
  {
    name: "create_team_task",
    categories: ['core', 'tasks'],
  },
  {
    name: "update_task_status",
    categories: ['core', 'tasks'],
  },
  
  // ============ SALES ORDERS ============
  {
    name: "search_products",
    categories: ['sales-orders', 'inventory'],
  },
  {
    name: "check_stock",
    categories: ['sales-orders', 'inventory'],
  },
  {
    name: "list_clients",
    categories: ['sales-orders', 'financial-receivables'],
  },
  {
    name: "create_order",
    categories: ['sales-orders'],
  },
  {
    name: "list_orders",
    categories: ['sales-orders'],
  },
  
  // ============ DOCUMENTS & DISCOVERY ============
  {
    name: "search_documents",
    categories: ['core', 'documents'],
  },
  {
    name: "universal_search",
    categories: ['core', 'documents'],
  },
  {
    name: "get_active_modules",
    categories: ['core'],
  },
  
  // ============ FINANCIAL - RECEIVABLES ============
  {
    name: "get_receivables_summary",
    categories: ['financial-receivables', 'financial-analytics'],
    requiredModule: "financial",
    requiredPermission: "viewFinancialData",
  },
  
  // ============ FINANCIAL - ANALYTICS ============
  {
    name: "get_analytics",
    categories: ['core', 'financial-analytics'],
  },
  {
    name: "get_cash_flow_analysis",
    categories: ['financial-analytics', 'financial-banking'],
    requiredModule: "financial",
    requiredPermission: "viewFinancialData",
  },
  {
    name: "analyze_bank_reconciliation",
    categories: ['financial-banking', 'financial-analytics'],
    requiredModule: "financial",
    requiredPermission: "viewFinancialData",
  },
  
  // ============ FINANCIAL - BUDGETS & FORECASTING ============
  {
    name: "create_budget",
    categories: ['financial-analytics'],
    requiredModule: "financial",
    requiredPermission: "viewFinancialData",
  },
  {
    name: "track_budget",
    categories: ['financial-analytics'],
    requiredModule: "financial",
    requiredPermission: "viewFinancialData",
  },
  {
    name: "get_budget_vs_actual",
    categories: ['financial-analytics'],
    requiredModule: "financial",
    requiredPermission: "viewFinancialData",
  },
  {
    name: "generate_forecast",
    categories: ['financial-analytics'],
    requiredModule: "financial",
    requiredPermission: "viewFinancialData",
  },
  {
    name: "compare_scenarios",
    categories: ['financial-analytics'],
    requiredModule: "financial",
    requiredPermission: "viewFinancialData",
  },
  
  // ============ FINANCIAL - PAYABLES (NOVOS) ============
  {
    name: "list_suppliers",
    categories: ['financial-payables', 'purchasing'],
    requiredModule: "financial",
    requiredPermission: "viewFinancialData",
  },
  {
    name: "create_supplier_invoice",
    categories: ['financial-payables'],
    requiredModule: "financial",
    requiredPermission: "viewFinancialData",
  },
  {
    name: "list_payables",
    categories: ['financial-payables', 'financial-analytics'],
    requiredModule: "financial",
    requiredPermission: "viewFinancialData",
  },
  {
    name: "approve_payment",
    categories: ['financial-payables'],
    requiredModule: "financial",
    requiredPermission: "viewFinancialData",
  },
  {
    name: "update_payable_status",
    categories: ['financial-payables'],
    requiredModule: "financial",
    requiredPermission: "viewFinancialData",
  },
  
  // ============ DOCUMENT PROCESSING (OCR) ============
  {
    name: "analyze_document",
    categories: ['core', 'financial-payables', 'documents'],
    requiredModule: "financial",
    requiredPermission: "viewFinancialData",
  },
  
  // ============ PURCHASING (NOVOS) ============
  {
    name: "create_purchase_order",
    categories: ['purchasing', 'financial-payables'],
    requiredModule: "purchasing",
  },
  {
    name: "list_purchase_orders",
    categories: ['purchasing', 'financial-payables'],
    requiredModule: "purchasing",
  },
  {
    name: "approve_purchase_order",
    categories: ['purchasing'],
    requiredModule: "purchasing",
  },
  {
    name: "receive_goods",
    categories: ['purchasing'],
    requiredModule: "purchasing",
  },
  
  // ============ ACCOUNTING (NOVOS) ============
  {
    name: "view_chart_of_accounts",
    categories: ['financial-accounting'],
    requiredModule: "financial",
    requiredPermission: "viewFinancialData",
  },
  {
    name: "query_account_balance",
    categories: ['financial-accounting', 'financial-analytics'],
    requiredModule: "financial",
    requiredPermission: "viewFinancialData",
  },
  {
    name: "view_journal_entries",
    categories: ['financial-accounting'],
    requiredModule: "financial",
    requiredPermission: "viewFinancialData",
  },
  
  // ============ BANKING (NOVOS) ============
  {
    name: "list_bank_accounts",
    categories: ['financial-banking'],
    requiredModule: "financial",
    requiredPermission: "viewFinancialData",
  },
  {
    name: "view_bank_balance",
    categories: ['financial-banking', 'financial-analytics'],
    requiredModule: "financial",
    requiredPermission: "viewFinancialData",
  },
  {
    name: "list_unreconciled_transactions",
    categories: ['financial-banking'],
    requiredModule: "financial",
    requiredPermission: "viewFinancialData",
  },
  
  // ============ TAX (NOVOS) ============
  {
    name: "calculate_vat_summary",
    categories: ['financial-tax', 'financial-analytics'],
    requiredModule: "financial",
    requiredPermission: "viewFinancialData",
  },
  
  // ============ CONFIG ============
  {
    name: "create_config_request",
    categories: ['core', 'config'],
  },
  
  // ============ DYNAMIC TOOLS ============
  {
    name: "get_database_schema",
    categories: ['core'],
  },
  {
    name: "execute_dynamic_sql",
    categories: ['core'],
  },
  {
    name: "analyze_data_dynamically",
    categories: ['core'],
  },
  {
    name: "trace_document_flow",
    categories: ['core', 'documents'],
  },
  
  // ============ CONNECTOR CONFIGURATION (AssistBuild only) ============
  {
    name: "list_available_connectors",
    categories: ['config'],
    requiredPermission: "admin",
  },
  {
    name: "configure_tenant_connector",
    categories: ['config'],
    requiredPermission: "admin",
  },
  {
    name: "test_connector_connection",
    categories: ['config'],
    requiredPermission: "admin",
  },
  {
    name: "get_tenant_connectors",
    categories: ['config'],
    requiredPermission: "admin",
  },
  {
    name: "update_tenant_connector",
    categories: ['config'],
    requiredPermission: "admin",
  },
  {
    name: "remove_tenant_connector",
    categories: ['config'],
    requiredPermission: "admin",
  },
];

/**
 * Keywords que indicam qual categoria de tools usar
 */
export const CATEGORY_KEYWORDS: Record<ToolCategory, string[]> = {
  'core': [],  // Sempre incluído
  
  'financial-receivables': [
    'cliente', 'clientes', 'fatura', 'faturas', 'invoice', 'receber', 'recebimento',
    'cobrar', 'cobrança', 'dívida', 'devedor', 'receivable', 'ar'
  ],
  
  'financial-payables': [
    'fornecedor', 'fornecedores', 'supplier', 'pagar', 'pagamento', 'payable',
    'ap', 'devo', 'divida', 'credor', 'fatura', 'faturas', 'fatura do fornecedor', 'fatura de fornecedor',
    'adiciona', 'processa', 'regista', 'anexo', 'anexei', 'anexado'
  ],
  
  'financial-accounting': [
    'contabilidade', 'conta', 'contas', 'plano de contas', 'lançamento', 'diário',
    'accounting', 'ledger', 'journal', 'balance', 'balanço'
  ],
  
  'financial-banking': [
    'banco', 'banca', 'bancário', 'conta bancária', 'reconciliação', 'extrato',
    'bank', 'banking', 'reconciliation', 'statement', 'iban'
  ],
  
  'financial-tax': [
    'iva', 'vat', 'imposto', 'impostos', 'tax', 'fiscal', 'declaração',
    'obrigação fiscal', 'at', 'finanças'
  ],
  
  'financial-analytics': [
    'cashflow', 'análise', 'analytics', 'métricas', 'kpi', 'dashboard',
    'performance', 'dinheiro', 'liquidez', 'tesouraria',
    'budget', 'orçamento', 'previsão', 'forecast', 'cenário', 'cenários',
    'variância', 'variance', 'gasto', 'gastos', 'spending', 'tracking'
  ],
  
  'purchasing': [
    'compra', 'compras', 'encomenda de compra', 'purchase order', 'po',
    'requisição', 'procurement', 'aprovação de compra', 'encomendar',
    'mercadoria', 'recebi', 'receber mercadoria', 'goods received'
  ],
  
  'sales-orders': [
    'encomenda', 'pedido', 'order', 'venda', 'vendas', 'sales'
  ],
  
  'inventory': [
    'stock', 'inventário', 'produto', 'produtos', 'armazém', 'warehouse'
  ],
  
  'tasks': [
    'tarefa', 'tarefas', 'task', 'todo', 'fazer', 'lembrete'
  ],
  
  'documents': [
    'documento', 'documentos', 'ficheiro', 'pdf', 'contract', 'contrato',
    'anexo', 'anexei', 'anexado', 'attachment', 'ocr', 'scan', 'digitalizado'
  ],
  
  'config': [
    'configurar', 'configuração', 'setup', 'agent', 'workflow', 'integração'
  ],
};

/**
 * Analisa mensagem do user e identifica categorias relevantes
 */
export function detectRelevantCategories(userMessage: string): ToolCategory[] {
  const messageLower = userMessage.toLowerCase();
  const detectedCategories = new Set<ToolCategory>(['core']); // Core sempre incluído
  
  // Verifica cada categoria
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (category === 'core') continue; // Já adicionado
    
    // Se qualquer keyword match, adiciona a categoria
    const hasMatch = keywords.some(keyword => messageLower.includes(keyword.toLowerCase()));
    if (hasMatch) {
      detectedCategories.add(category as ToolCategory);
    }
  }
  
  // Se nenhuma categoria específica foi detectada, incluir algumas defaults
  if (detectedCategories.size === 1) { // Só tem 'core'
    detectedCategories.add('tasks');
    detectedCategories.add('financial-analytics');
    detectedCategories.add('sales-orders');
  }
  
  return Array.from(detectedCategories);
}

/**
 * Filtra tools baseado nas categorias detectadas
 */
export function getToolsByCategories(categories: ToolCategory[]): string[] {
  const categorySet = new Set(categories);
  
  return TOOL_REGISTRY
    .filter(tool => {
      // Verifica se a tool pertence a alguma das categorias solicitadas
      return tool.categories.some(cat => categorySet.has(cat));
    })
    .map(tool => tool.name);
}

/**
 * Obtém metadata de uma tool específica
 */
export function getToolMetadata(toolName: string): ToolMetadata | undefined {
  return TOOL_REGISTRY.find(t => t.name === toolName);
}

/**
 * Filtra tools baseado em permissões do user
 */
export function filterToolsByPermissions(
  toolNames: string[],
  userPermissions: {
    role: string;
    modules: string[];
    permissions: any;
  }
): string[] {
  return toolNames.filter(toolName => {
    const metadata = getToolMetadata(toolName);
    if (!metadata) return true; // Tool não registada, permite
    
    // Verifica se módulo necessário está ativo
    if (metadata.requiredModule) {
      if (!userPermissions.modules.includes(metadata.requiredModule)) {
        return false;
      }
    }
    
    // Verifica permissão específica
    if (metadata.requiredPermission) {
      // Owner e Configurador têm acesso total
      if (userPermissions.role === 'owner' || userPermissions.role === 'configurador') {
        return true;
      }
      
      // Outros roles verificam permissão
      if (!userPermissions.permissions?.[metadata.requiredPermission]) {
        return false;
      }
    }
    
    return true;
  });
}
