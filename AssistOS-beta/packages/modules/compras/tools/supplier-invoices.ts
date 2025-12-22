/**
 * ComprasModule - Supplier Invoice Registration Tool
 * Ferramenta para REGISTAR faturas RECEBIDAS de fornecedores (payable invoices)
 * NÃO é para emitir faturas a clientes!
 */

import { db } from "../../../../apps/api/db";
import { invoices, invoiceLines, suppliers } from "../../../../shared/schema";
import { eq, and } from "drizzle-orm";
import { nanoid } from "nanoid";

export const supplierInvoiceTools = [
  {
    type: "function" as const,
    function: {
      name: "register_supplier_invoice",
      description: "REGISTA uma fatura RECEBIDA de um fornecedor (não emite fatura a cliente). Cria a fatura como 'payable' e adiciona os lineItems/produtos. Use quando receber faturas de fornecedores para registar no sistema.",
      parameters: {
        type: "object",
        properties: {
          supplierId: {
            type: "string",
            description: "ID do fornecedor que emitiu a fatura (obrigatório). Use list_suppliers ou create_supplier primeiro.",
          },
          invoiceNumber: {
            type: "string",
            description: "Número da fatura do fornecedor (obrigatório). Ex: 'FT 2024/123'",
          },
          issueDate: {
            type: "string",
            description: "Data de emissão da fatura no formato YYYY-MM-DD (obrigatório). Ex: '2024-11-05'",
          },
          dueDate: {
            type: "string",
            description: "Data de vencimento no formato YYYY-MM-DD. Opcional.",
          },
          subtotal: {
            type: "number",
            description: "Subtotal sem IVA (obrigatório)",
          },
          taxAmount: {
            type: "number",
            description: "Valor total de IVA (obrigatório)",
          },
          totalAmount: {
            type: "number",
            description: "Valor total da fatura COM IVA (obrigatório)",
          },
          paymentStatus: {
            type: "string",
            enum: ["pending", "paid", "partially_paid", "overdue"],
            description: "Status de pagamento. Default: 'pending'",
          },
          paymentMethod: {
            type: "string",
            description: "Método de pagamento usado (ex: 'Transferência', 'Multibanco'). Opcional.",
          },
          currency: {
            type: "string",
            description: "Moeda da fatura. Default: 'EUR'",
          },
          lineItems: {
            type: "array",
            description: "Array de produtos/serviços da fatura (obrigatório)",
            items: {
              type: "object",
              properties: {
                description: {
                  type: "string",
                  description: "Descrição do produto/serviço (obrigatório)",
                },
                quantity: {
                  type: "number",
                  description: "Quantidade (obrigatório)",
                },
                unitPrice: {
                  type: "number",
                  description: "Preço unitário SEM IVA (obrigatório)",
                },
                taxRate: {
                  type: "number",
                  description: "Taxa de IVA em % (obrigatório). Ex: 23 para 23%",
                },
                unit: {
                  type: "string",
                  description: "Unidade de medida. Default: 'un'",
                },
              },
              required: ["description", "quantity", "unitPrice", "taxRate"],
            },
          },
          notes: {
            type: "string",
            description: "Notas/observações sobre a fatura. Opcional.",
          },
        },
        required: ["supplierId", "invoiceNumber", "issueDate", "subtotal", "taxAmount", "totalAmount", "lineItems"],
      },
    },
  },
];

/**
 * Execute supplier invoice tool
 */
export async function executeSupplierInvoiceTool(
  toolName: string,
  args: any,
  context: { tenantId: string; userId?: string }
): Promise<any> {
  console.log(`[Supplier Invoice Tools] Executing: ${toolName}`, args);
  
  switch (toolName) {
    case "register_supplier_invoice":
      return await handleRegisterSupplierInvoice(args, context);
      
    default:
      throw new Error(`Unknown supplier invoice tool: ${toolName}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tool Handler
// ═══════════════════════════════════════════════════════════════════════════════

async function handleRegisterSupplierInvoice(
  args: {
    supplierId: string;
    invoiceNumber: string;
    issueDate: string;
    dueDate?: string;
    subtotal: number;
    taxAmount: number;
    totalAmount: number;
    paymentStatus?: string;
    paymentMethod?: string;
    currency?: string;
    lineItems: Array<{
      description: string;
      quantity: number;
      unitPrice: number;
      taxRate: number;
      unit?: string;
    }>;
    notes?: string;
  },
  context: { tenantId: string; userId?: string }
): Promise<any> {
  const { tenantId, userId } = context;
  const {
    supplierId,
    invoiceNumber,
    issueDate,
    dueDate,
    subtotal,
    taxAmount,
    totalAmount,
    paymentStatus = 'pending',
    paymentMethod,
    currency = 'EUR',
    lineItems,
    notes,
  } = args;

  // Validate supplier exists
  const supplier = await db
    .select()
    .from(suppliers)
    .where(and(
      eq(suppliers.id, supplierId),
      eq(suppliers.tenantId, tenantId)
    ))
    .limit(1);

  if (supplier.length === 0) {
    return {
      success: false,
      error: `Fornecedor com ID ${supplierId} não encontrado`,
    };
  }

  // Validate lineItems
  if (!lineItems || lineItems.length === 0) {
    return {
      success: false,
      error: "É obrigatório fornecer pelo menos 1 lineItem",
    };
  }

  try {
    // Create the invoice (PAYABLE - recebida de fornecedor)
    const [createdInvoice] = await db
      .insert(invoices)
      .values({
        id: nanoid(),
        tenantId,
        invoiceType: 'payable', // CRÍTICO: isto é uma fatura RECEBIDA, não emitida
        invoiceNumber,
        supplierId,
        supplierName: supplier[0].name,
        supplierNif: supplier[0].taxId,
        issueDate: new Date(issueDate),
        dueDate: dueDate ? new Date(dueDate) : undefined,
        status: 'pending_approval',
        paymentStatus: paymentStatus as any,
        paymentMethod,
        currency,
        subtotal: subtotal.toString(),
        taxAmount: taxAmount.toString(),
        totalAmount: totalAmount.toString(),
        paidAmount: paymentStatus === 'paid' ? totalAmount.toString() : '0',
        notes,
        createdBy: userId,
      })
      .returning();

    console.log(`[Supplier Invoice] Created invoice ${createdInvoice.id} for supplier ${supplier[0].name}`);

    // Create invoice lines
    const createdLines = [];
    for (let i = 0; i < lineItems.length; i++) {
      const item = lineItems[i];
      
      const netAmount = item.quantity * item.unitPrice;
      const itemTaxAmount = netAmount * (item.taxRate / 100);
      const itemTotal = netAmount + itemTaxAmount;

      const [line] = await db
        .insert(invoiceLines)
        .values({
          id: nanoid(),
          tenantId,
          invoiceId: createdInvoice.id,
          lineNumber: i + 1,
          description: item.description,
          quantity: item.quantity.toString(),
          unit: item.unit || 'un',
          unitPrice: item.unitPrice.toString(),
          discountRate: '0',
          discountAmount: '0',
          netAmount: netAmount.toString(),
          taxRate: item.taxRate.toString(),
          taxAmount: itemTaxAmount.toString(),
          totalAmount: itemTotal.toString(),
        })
        .returning();

      createdLines.push(line);
    }

    console.log(`[Supplier Invoice] Created ${createdLines.length} line items`);

    return {
      success: true,
      message: `Fatura ${invoiceNumber} de ${supplier[0].name} registada com sucesso`,
      invoice: {
        id: createdInvoice.id,
        invoiceNumber: createdInvoice.invoiceNumber,
        supplierName: supplier[0].name,
        issueDate: createdInvoice.issueDate,
        totalAmount: createdInvoice.totalAmount,
        status: createdInvoice.status,
        paymentStatus: createdInvoice.paymentStatus,
        lineItemsCount: createdLines.length,
      },
      lineItems: createdLines.map(l => ({
        description: l.description,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        taxRate: l.taxRate,
        totalAmount: l.totalAmount,
      })),
    };

  } catch (error: any) {
    console.error('[Supplier Invoice] Error creating invoice:', error);
    return {
      success: false,
      error: `Erro ao criar fatura: ${error.message}`,
    };
  }
}
