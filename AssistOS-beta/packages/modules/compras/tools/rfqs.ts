/**
 * ComprasModule - RFQs (Request for Quotation) AI Tools
 * 3 tools for RFQ creation, quote evaluation, and supplier selection
 */

import { db } from "../../../../apps/api/db";
import { rfqs, rfqLines, rfqQuotes, rfqQuoteLines, suppliers, products } from "../../../../shared/schema";
import { eq, and, desc, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";

export const rfqTools = [
  {
    type: "function" as const,
    function: {
      name: "create_rfq",
      description: "Cria Request for Quotation (RFQ) para múltiplos fornecedores. Envia pedidos de cotação, define deadline. Retorna RFQ criado com linhas.",
      parameters: {
        type: "object",
        properties: {
          supplierIds: {
            type: "array",
            items: { type: "string" },
            description: "IDs dos fornecedores que receberão o RFQ (obrigatório)",
          },
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                productId: {
                  type: "string",
                  description: "ID do produto",
                },
                quantity: {
                  type: "number",
                  description: "Quantidade necessária",
                },
                specifications: {
                  type: "string",
                  description: "Especificações técnicas ou requisitos",
                },
              },
              required: ["productId", "quantity"],
            },
            description: "Lista de itens do RFQ (obrigatório)",
          },
          daysUntilDeadline: {
            type: "number",
            description: "Dias até deadline de resposta (default: 7)",
          },
          notes: {
            type: "string",
            description: "Notas gerais do RFQ",
          },
        },
        required: ["supplierIds", "items"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "evaluate_rfq_quotes",
      description: "Avalia quotes recebidos de um RFQ. Calcula scores (preço, lead time, supplier rating), rankeia quotes. Retorna análise comparativa.",
      parameters: {
        type: "object",
        properties: {
          rfqId: {
            type: "string",
            description: "ID do RFQ a avaliar (obrigatório)",
          },
          priceWeight: {
            type: "number",
            description: "Peso do preço na avaliação (0-1, default: 0.6)",
          },
          leadTimeWeight: {
            type: "number",
            description: "Peso do lead time na avaliação (0-1, default: 0.2)",
          },
          supplierScoreWeight: {
            type: "number",
            description: "Peso do rating do fornecedor (0-1, default: 0.2)",
          },
        },
        required: ["rfqId"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "select_best_quote",
      description: "Seleciona o melhor quote de um RFQ e marca como 'winner'. Atualiza status do RFQ, registra decisão. Permite override manual.",
      parameters: {
        type: "object",
        properties: {
          rfqId: {
            type: "string",
            description: "ID do RFQ (obrigatório)",
          },
          quoteId: {
            type: "string",
            description: "ID do quote selecionado (obrigatório)",
          },
          reason: {
            type: "string",
            description: "Razão da seleção (opcional)",
          },
        },
        required: ["rfqId", "quoteId"],
      },
    },
  },
];

/**
 * Execute an RFQ tool based on tool call from AI
 */
export async function executeRfqTool(
  toolName: string,
  args: any,
  context: { tenantId: string; userId?: string }
): Promise<any> {
  console.log(`[RFQ Tools] Executing: ${toolName}`, args);
  
  switch (toolName) {
    case "create_rfq":
      return await handleCreateRfq(args, context);
      
    case "evaluate_rfq_quotes":
      return await handleEvaluateRfqQuotes(args, context);
      
    case "select_best_quote":
      return await handleSelectBestQuote(args, context);
      
    default:
      throw new Error(`Unknown RFQ tool: ${toolName}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tool Handlers
// ═══════════════════════════════════════════════════════════════════════════════

async function handleCreateRfq(
  args: {
    supplierIds: string[];
    items: Array<{
      productId: string;
      quantity: number;
      specifications?: string;
    }>;
    daysUntilDeadline?: number;
    notes?: string;
  },
  context: { tenantId: string; userId?: string }
): Promise<any> {
  const { tenantId, userId } = context;
  const { supplierIds, items, daysUntilDeadline = 7, notes } = args;

  // Validate suppliers
  const suppliersData = await db
    .select()
    .from(suppliers)
    .where(and(
      eq(suppliers.tenantId, tenantId),
      inArray(suppliers.id, supplierIds)
    ));

  if (suppliersData.length !== supplierIds.length) {
    return {
      success: false,
      error: `Alguns fornecedores não foram encontrados. Esperados: ${supplierIds.length}, Encontrados: ${suppliersData.length}`,
    };
  }

  // Validate products
  const productIds = items.map(i => i.productId);
  const productsData = await db
    .select()
    .from(products)
    .where(and(
      eq(products.tenantId, tenantId),
      inArray(products.id, productIds)
    ));

  if (productsData.length !== items.length) {
    return {
      success: false,
      error: `Alguns produtos não foram encontrados`,
    };
  }

  // Create RFQ
  const rfqCode = `RFQ-${Date.now()}`;
  const deadline = new Date();
  deadline.setDate(deadline.getDate() + daysUntilDeadline);

  const rfq = await db.insert(rfqs).values({
    id: nanoid(),
    tenantId,
    code: rfqCode,
    issueDate: new Date(),
    deadline,
    status: 'draft',
    notes: notes || `RFQ para ${supplierIds.length} fornecedores`,
    createdBy: userId || nanoid(),
    createdAt: new Date(),
    updatedAt: new Date(),
  }).returning();

  // Create RFQ lines
  const lines = [];
  for (const item of items) {
    const product = productsData.find(p => p.id === item.productId);
    if (!product) continue;

    const line = await db.insert(rfqLines).values({
      id: nanoid(),
      tenantId,
      rfqId: rfq[0].id,
      productId: item.productId,
      quantity: item.quantity.toString(),
      uom: product.uom || 'UN',
      specifications: item.specifications,
    }).returning();

    lines.push(line[0]);
  }

  return {
    success: true,
    message: `RFQ ${rfqCode} criado com ${lines.length} itens para ${supplierIds.length} fornecedores`,
    rfq: {
      ...rfq[0],
      lines,
      suppliers: suppliersData,
    },
  };
}

async function handleEvaluateRfqQuotes(
  args: {
    rfqId: string;
    priceWeight?: number;
    leadTimeWeight?: number;
    supplierScoreWeight?: number;
  },
  context: { tenantId: string }
): Promise<any> {
  const { tenantId } = context;
  const { 
    rfqId, 
    priceWeight = 0.6, 
    leadTimeWeight = 0.2, 
    supplierScoreWeight = 0.2 
  } = args;

  // Verify RFQ belongs to tenant
  const rfq = await db
    .select()
    .from(rfqs)
    .where(and(
      eq(rfqs.id, rfqId),
      eq(rfqs.tenantId, tenantId)
    ))
    .limit(1);

  if (rfq.length === 0) {
    return {
      success: false,
      error: "RFQ não encontrado",
    };
  }

  // Get quotes
  const quotes = await db
    .select()
    .from(rfqQuotes)
    .where(and(
      eq(rfqQuotes.rfqId, rfqId),
      eq(rfqQuotes.tenantId, tenantId)
    ));

  if (quotes.length === 0) {
    return {
      success: false,
      error: "Nenhum quote recebido ainda",
    };
  }

  // Get supplier data
  const supplierIds = quotes.map(q => q.supplierId);
  const suppliersData = await db
    .select()
    .from(suppliers)
    .where(and(
      eq(suppliers.tenantId, tenantId),
      inArray(suppliers.id, supplierIds)
    ));

  const supplierMap = new Map(suppliersData.map(s => [s.id, s]));

  // Calculate scores
  const prices = quotes.map(q => parseFloat(q.totalAmount || '0')).filter(p => p > 0);
  const minPrice = Math.min(...prices);
  const leadTimes = quotes.map(q => q.deliveryLeadTime || 30);
  const minLeadTime = Math.min(...leadTimes);

  const evaluatedQuotes = quotes.map(quote => {
    const supplier = supplierMap.get(quote.supplierId);
    const price = parseFloat(quote.totalAmount || '0');
    const leadTime = quote.deliveryLeadTime || 30;
    const supplierRating = supplier?.rating || 3;

    // Normalize scores (0-5 scale)
    const priceScore = minPrice > 0 ? (minPrice / price) * 5 : 0;
    const leadTimeScore = (minLeadTime / leadTime) * 5;
    const supplierScore = supplierRating;

    // Weighted overall score
    const overallScore = 
      (priceScore * priceWeight) +
      (leadTimeScore * leadTimeWeight) +
      (supplierScore * supplierScoreWeight);

    return {
      ...quote,
      supplierName: supplier?.name || 'Unknown',
      scores: {
        priceScore: Number(priceScore.toFixed(2)),
        leadTimeScore: Number(leadTimeScore.toFixed(2)),
        supplierScore: Number(supplierScore.toFixed(2)),
        overallScore: Number(overallScore.toFixed(2)),
      },
    };
  });

  // Sort by overall score
  evaluatedQuotes.sort((a, b) => b.scores.overallScore - a.scores.overallScore);

  // Update quote scores in database (WITH TENANT ISOLATION)
  for (const quote of evaluatedQuotes) {
    await db
      .update(rfqQuotes)
      .set({
        priceScore: quote.scores.priceScore.toString(),
        leadTimeScore: quote.scores.leadTimeScore.toString(),
        supplierScore: quote.scores.supplierScore.toString(),
        overallScore: quote.scores.overallScore.toString(),
        recommendation: quote.scores.overallScore >= 4 ? 'recommended' :
                       quote.scores.overallScore >= 3 ? 'acceptable' : 'not_recommended',
      })
      .where(and(
        eq(rfqQuotes.id, quote.id),
        eq(rfqQuotes.tenantId, tenantId)
      ));
  }

  return {
    success: true,
    rfqId,
    quotesEvaluated: evaluatedQuotes.length,
    quotes: evaluatedQuotes,
    bestQuote: evaluatedQuotes[0],
  };
}

async function handleSelectBestQuote(
  args: {
    rfqId: string;
    quoteId: string;
    reason?: string;
  },
  context: { tenantId: string; userId?: string }
): Promise<any> {
  const { tenantId, userId } = context;
  const { rfqId, quoteId, reason } = args;

  // Verify RFQ
  const rfq = await db
    .select()
    .from(rfqs)
    .where(and(
      eq(rfqs.id, rfqId),
      eq(rfqs.tenantId, tenantId)
    ))
    .limit(1);

  if (rfq.length === 0) {
    return {
      success: false,
      error: "RFQ não encontrado",
    };
  }

  // Verify quote belongs to RFQ
  const quote = await db
    .select()
    .from(rfqQuotes)
    .where(and(
      eq(rfqQuotes.id, quoteId),
      eq(rfqQuotes.rfqId, rfqId),
      eq(rfqQuotes.tenantId, tenantId)
    ))
    .limit(1);

  if (quote.length === 0) {
    return {
      success: false,
      error: "Quote não encontrado ou não pertence a este RFQ",
    };
  }

  // Update RFQ status (WITH TENANT ISOLATION)
  await db
    .update(rfqs)
    .set({
      status: 'quote_selected',
      selectedQuoteId: quoteId,
      updatedAt: new Date(),
    })
    .where(and(
      eq(rfqs.id, rfqId),
      eq(rfqs.tenantId, tenantId)
    ));

  return {
    success: true,
    message: `Quote selecionado para RFQ ${rfq[0].code}`,
    rfq: rfq[0],
    selectedQuote: quote[0],
    reason: reason || 'Melhor score geral',
  };
}
