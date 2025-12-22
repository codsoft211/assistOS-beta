// Migrated from AssistOS legacy - Phase 3
// Source: /tmp/assistos-legacy/server/_legacy/ai-tools-financial.ts (363 lines, 11KB)

/**
 * Financial Grid AI Tools
 * AI-accessible tools for financial calculations, budgeting, and analysis
 */

import { db } from "../../../../apps/api/db";

// Import schema tables
import { financialModels, financialCalculations } from "../../../../shared/schema";
import { eq } from "drizzle-orm";

// Financial Grid Service - Now available!
import { 
  financialGridService,
  type CalculationOptions,
} from "../../../../packages/platform/services/financial-grid";

export const financialGridTools = [
  {
    type: "function" as const,
    function: {
      name: "calculate_project_budget",
      description: "Calcula o orçamento de um projeto utilizando o modelo de orçamentação. Retorna o custo total, margem, preço de venda, e breakdown detalhado. Usa padrões aprendidos automaticamente para ajustar estimativas.",
      parameters: {
        type: "object",
        properties: {
          projectName: {
            type: "string",
            description: "Nome do projeto (para contexto)",
          },
          laborHours: {
            type: "number",
            description: "Horas de mão-de-obra estimadas",
          },
          laborRate: {
            type: "number",
            description: "Taxa horária de mão-de-obra (€/hora)",
          },
          materials: {
            type: "number",
            description: "Custo de materiais (€)",
          },
          overhead: {
            type: "number",
            description: "Custos indiretos/overhead (€)",
          },
          marginPercent: {
            type: "number",
            description: "Margem de lucro desejada (%)",
          },
          taxRate: {
            type: "number",
            description: "Taxa de IVA (decimal, ex: 0.23 para 23%)",
          },
          applyPatterns: {
            type: "boolean",
            description: "Se deve aplicar padrões aprendidos (ajustes automáticos baseados em histórico). Default: true",
          },
        },
        required: ["laborHours", "laborRate", "materials", "overhead", "marginPercent", "taxRate"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "explain_financial_result",
      description: "Gera uma explicação legível e detalhada de um cálculo financeiro anterior. Mostra inputs, fórmulas usadas, breakdown passo-a-passo, e resultados finais.",
      parameters: {
        type: "object",
        properties: {
          calculationId: {
            type: "string",
            description: "ID do cálculo financeiro a explicar",
          },
        },
        required: ["calculationId"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "record_actual_outcome",
      description: "Regista o resultado real de um cálculo financeiro (para machine learning). Permite ao sistema aprender com a diferença entre predição e realidade.",
      parameters: {
        type: "object",
        properties: {
          calculationId: {
            type: "string",
            description: "ID do cálculo original",
          },
          actualCost: {
            type: "number",
            description: "Custo real final do projeto (€)",
          },
          actualRevenue: {
            type: "number",
            description: "Receita real final (€)",
          },
          actualMargin: {
            type: "number",
            description: "Margem real alcançada (%)",
          },
          notes: {
            type: "string",
            description: "Notas sobre desvios ou aprendizados",
          },
        },
        required: ["calculationId", "actualCost"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_recent_budgets",
      description: "Lista orçamentos/cálculos financeiros recentes do tenant. Útil para referência ou comparação.",
      parameters: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Número máximo de resultados (default: 10)",
          },
          modelType: {
            type: "string",
            description: "Filtrar por tipo de modelo (ex: 'budget', 'margin'). Opcional.",
          },
        },
      },
    },
  },
];

/**
 * Execute a financial tool based on tool call from AI
 */
export async function executeFinancialTool(
  toolName: string,
  args: any,
  context: { tenantId: string; userId?: string }
): Promise<any> {
  console.log(`[Financial Tools] Executing: ${toolName}`, args);
  
  switch (toolName) {
    case "calculate_project_budget":
      return await handleCalculateProjectBudget(args, context);
      
    case "explain_financial_result":
      return await handleExplainFinancialResult(args, context);
      
    case "record_actual_outcome":
      return await handleRecordActualOutcome(args, context);
      
    case "get_recent_budgets":
      return await handleGetRecentBudgets(args, context);
      
    default:
      throw new Error(`Unknown financial tool: ${toolName}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tool Handlers
// ═══════════════════════════════════════════════════════════════════════════════

async function handleCalculateProjectBudget(
  args: {
    projectName?: string;
    laborHours: number;
    laborRate: number;
    materials: number;
    overhead: number;
    marginPercent: number;
    taxRate: number;
    applyPatterns?: boolean;
  },
  context: { tenantId: string; userId?: string }
): Promise<any> {
  // Find budget model (built-in template)
  const budgetModel = await db.query.financialModels.findFirst({
    where: eq(financialModels.slug, "budget-template-v1"),
  });
  
  if (!budgetModel) {
    throw new Error("Budget model not found. Please ensure built-in models are initialized.");
  }
  
  // Execute calculation
  const result = await financialGridService.executeCalculation({
    tenantId: context.tenantId,
    modelId: budgetModel.id,
    inputs: {
      laborHours: args.laborHours,
      laborRate: args.laborRate,
      materials: args.materials,
      overhead: args.overhead,
      marginPercent: args.marginPercent,
      taxRate: args.taxRate,
    },
    userId: context.userId,
    units: {
      currency: "EUR",
      taxRate: args.taxRate,
      locale: "pt-PT",
    },
    lineage: {
      source: "ai_tool",
      context: {
        projectName: args.projectName,
        tool: "calculate_project_budget",
      },
    },
    applyPatterns: args.applyPatterns !== false, // default true
  });
  
  // Get preferred presentation format
  const preferredFormat = await financialGridService.getPreferredFormat(
    context.tenantId,
    "budget",
    "project_budget"
  );
  
  return {
    success: true,
    calculationId: result.calculationId,
    runId: result.runId,
    results: result.outputs,
    patternsApplied: result.patternsApplied,
    preferredFormat,
    message: args.applyPatterns 
      ? "Orçamento calculado com ajustes automáticos baseados em padrões aprendidos."
      : "Orçamento calculado sem ajustes automáticos.",
  };
}

async function handleExplainFinancialResult(
  args: { calculationId: string },
  context: { tenantId: string; userId?: string }
): Promise<any> {
  // Verify calculation belongs to tenant
  const calculation = await db.query.financialCalculations.findFirst({
    where: eq(financialCalculations.id, args.calculationId),
  });
  
  if (!calculation) {
    throw new Error(`Calculation ${args.calculationId} not found`);
  }
  
  if (calculation.tenantId !== context.tenantId) {
    throw new Error("Calculation not found");
  }
  
  // Generate explanation
  const explanation = await financialGridService.explain(args.calculationId, context.tenantId);
  
  return {
    success: true,
    calculationId: args.calculationId,
    explanation,
  };
}

async function handleRecordActualOutcome(
  args: {
    calculationId: string;
    actualCost: number;
    actualRevenue?: number;
    actualMargin?: number;
    notes?: string;
  },
  context: { tenantId: string; userId?: string }
): Promise<any> {
  // Verify calculation belongs to tenant
  const calculation = await db.query.financialCalculations.findFirst({
    where: eq(financialCalculations.id, args.calculationId),
  });
  
  if (!calculation) {
    throw new Error(`Calculation ${args.calculationId} not found`);
  }
  
  if (calculation.tenantId !== context.tenantId) {
    throw new Error("Calculation not found");
  }
  
  // Build actual outcome object
  const actualOutcome: Record<string, any> = {
    totalCost: args.actualCost,
  };
  
  if (args.actualRevenue !== undefined) {
    actualOutcome.totalRevenue = args.actualRevenue;
  }
  
  if (args.actualMargin !== undefined) {
    actualOutcome.margin = args.actualMargin;
  }
  
  if (args.notes) {
    actualOutcome.notes = args.notes;
  }
  
  // Record outcome
  await financialGridService.recordActualOutcome(
    args.calculationId,
    context.tenantId,
    actualOutcome
  );
  
  return {
    success: true,
    calculationId: args.calculationId,
    message: "Resultado real registado com sucesso. O sistema vai aprender com este feedback.",
  };
}

async function handleGetRecentBudgets(
  args: { limit?: number; modelType?: string },
  context: { tenantId: string; userId?: string }
): Promise<any> {
  const limit = args.limit || 10;
  
  // Build query
  const calculations = await db.query.financialCalculations.findMany({
    where: eq(financialCalculations.tenantId, context.tenantId),
    limit,
    orderBy: (calculations, { desc }) => [desc(calculations.executedAt)],
  });
  
  // Load models separately
  const modelIdsSet = new Set(calculations.map(c => c.modelId));
  const modelIds = Array.from(modelIdsSet);
  const models = await db.query.financialModels.findMany({
    where: (models, { inArray }) => inArray(models.id, modelIds),
  });
  const modelMap = new Map(models.map(m => [m.id, m]));
  
  // Filter by model type if specified
  const filtered = args.modelType
    ? calculations.filter((calc: any) => {
        const model = modelMap.get(calc.modelId);
        return model?.type === args.modelType;
      })
    : calculations;
  
  return {
    success: true,
    count: filtered.length,
    calculations: filtered.map((calc: any) => {
      const model = modelMap.get(calc.modelId);
      return {
        id: calc.id,
        runId: calc.runId,
        modelName: model?.name,
        modelType: model?.type,
        inputs: calc.inputs,
        outputs: calc.outputs,
        executedAt: calc.executedAt,
        hasActualOutcome: !!calc.actualOutcome,
      };
    }),
  };
}
