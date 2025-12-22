/**
 * FinanceiroModule - AI Tools
 * 
 * Core financial tools with full validation and security
 */

import type { ModuleTool } from '../../base/module.interface';
import { db } from '../../../../apps/api/db';
import { invoices, payments, bankAccounts, taxRates, clients } from '../../../../shared/schema';
import { eq, and, gte, lte, desc, sql } from 'drizzle-orm';

export const financeiroTools: ModuleTool[] = [
  {
    name: 'list_invoices',
    description: 'Lista faturas com filtros opcionais (status, cliente, datas)',
    parameters: [
      {
        name: 'clientId',
        type: 'string',
        description: 'Filtrar por cliente',
        required: false
      },
      {
        name: 'status',
        type: 'string',
        description: 'Filtrar por status (draft, sent, paid, overdue, cancelled)',
        required: false
      },
      {
        name: 'startDate',
        type: 'string',
        description: 'Data inicial (YYYY-MM-DD)',
        required: false
      },
      {
        name: 'endDate',
        type: 'string',
        description: 'Data final (YYYY-MM-DD)',
        required: false
      },
      {
        name: 'limit',
        type: 'number',
        description: 'Número máximo de resultados',
        required: false,
        default: 50
      }
    ],
    execute: async (params: any, context) => {
      const { clientId, status, startDate, endDate, limit = 50 } = params;
      
      const conditions: any[] = [
        eq(invoices.tenantId, context.tenantId)
      ];
      
      if (clientId) {
        conditions.push(eq(invoices.clientId, clientId));
      }
      
      if (status) {
        conditions.push(eq(invoices.status, status));
      }
      
      if (startDate) {
        conditions.push(gte(invoices.issueDate, new Date(startDate)));
      }
      
      if (endDate) {
        conditions.push(lte(invoices.issueDate, new Date(endDate)));
      }
      
      const invoicesList = await db
        .select()
        .from(invoices)
        .where(and(...conditions))
        .orderBy(desc(invoices.issueDate))
        .limit(limit);
      
      return { invoices: invoicesList, total: invoicesList.length };
    }
  },
  
  {
    name: 'create_invoice',
    description: 'Cria nova fatura com validação completa de items e cálculos',
    parameters: [
      {
        name: 'clientId',
        type: 'string',
        description: 'ID do cliente',
        required: true
      },
      {
        name: 'items',
        type: 'array',
        description: 'Items da fatura (description, quantity, unitPrice)',
        required: true
      },
      {
        name: 'issueDate',
        type: 'string',
        description: 'Data de emissão (YYYY-MM-DD)',
        required: true
      },
      {
        name: 'dueDate',
        type: 'string',
        description: 'Data de vencimento (YYYY-MM-DD)',
        required: true
      },
      {
        name: 'taxRate',
        type: 'number',
        description: 'Taxa de IVA (decimal, ex: 0.23 para 23%)',
        required: false,
        default: 0.23
      },
      {
        name: 'notes',
        type: 'string',
        description: 'Notas adicionais',
        required: false
      }
    ],
    execute: async (params: any, context) => {
      const { clientId, items, issueDate, dueDate, taxRate = 0.23, notes } = params;
      
      console.log('[create_invoice] Input args:', { clientId, items, issueDate, dueDate, taxRate });
      
      // Validate items array
      if (!items || !Array.isArray(items) || items.length === 0) {
        return {
          success: false,
          error: 'Lista de items vazia ou inválida. A fatura deve conter pelo menos um item.',
        };
      }
      
      // SECURITY: Validate client belongs to tenant
      const clientResult = await db
        .select({ id: clients.id })
        .from(clients)
        .where(and(
          eq(clients.id, clientId),
          eq(clients.tenantId, context.tenantId)
        ))
        .limit(1);
      
      if (!clientResult || clientResult.length === 0) {
        console.error('[create_invoice] Client not found or belongs to different tenant:', clientId);
        return {
          success: false,
          error: `Cliente '${clientId}' não encontrado ou não pertence ao seu tenant.`,
        };
      }
      
      // Validate and calculate items
      const validatedItems = [];
      let subtotal = 0;
      
      for (const item of items) {
        // Validate required fields
        if (!item.description || !item.quantity || !item.unitPrice) {
          return {
            success: false,
            error: 'Cada item deve ter description, quantity e unitPrice.',
          };
        }
        
        // Validate quantity > 0
        if (item.quantity <= 0) {
          return {
            success: false,
            error: `Quantidade inválida: ${item.quantity}. Deve ser maior que zero.`,
          };
        }
        
        // Validate unitPrice >= 0
        if (item.unitPrice < 0) {
          return {
            success: false,
            error: `Preço unitário inválido: ${item.unitPrice}. Não pode ser negativo.`,
          };
        }
        
        const itemTotal = item.quantity * item.unitPrice;
        subtotal += itemTotal;
        
        validatedItems.push({
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          total: itemTotal,
        });
      }
      
      const taxAmount = subtotal * taxRate;
      const total = subtotal + taxAmount;
      
      console.log('[create_invoice] Calculated totals:', { subtotal, taxAmount, total });
      
      try {
        // Generate invoice number (simple sequential)
        const lastInvoice = await db
          .select({ invoiceNumber: invoices.invoiceNumber })
          .from(invoices)
          .where(eq(invoices.tenantId, context.tenantId))
          .orderBy(desc(invoices.createdAt))
          .limit(1);
        
        const lastNumber = lastInvoice[0]?.invoiceNumber?.match(/\d+$/)?.[0] || '0';
        const invoiceNumber = `INV-${String(parseInt(lastNumber) + 1).padStart(6, '0')}`;
        
        // Create invoice
        const invoiceResult = await db
          .insert(invoices)
          .values({
            tenantId: context.tenantId,
            invoiceType: 'receivable',
            clientId,
            invoiceNumber,
            issueDate: new Date(issueDate),
            dueDate: new Date(dueDate),
            subtotal: subtotal.toString(),
            taxAmount: taxAmount.toString(),
            totalAmount: total.toString(),
            status: 'draft',
            notes: notes || null,
          })
          .returning();
        
        const invoice = Array.isArray(invoiceResult) ? invoiceResult[0] : invoiceResult;
        console.log('[create_invoice] Invoice created successfully:', invoice.id);
        
        return {
          success: true,
          data: {
            invoiceId: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            subtotal,
            taxAmount,
            total,
            status: invoice.status,
            message: 'Fatura criada com sucesso',
          },
        };
      } catch (error: any) {
        console.error('[create_invoice] Database error:', error);
        return {
          success: false,
          error: `Erro ao criar fatura: ${error.message || error}`,
        };
      }
    }
  },
  
  {
    name: 'list_payments',
    description: 'Lista pagamentos com filtros opcionais',
    parameters: [
      {
        name: 'invoiceId',
        type: 'string',
        description: 'Filtrar por fatura',
        required: false
      },
      {
        name: 'status',
        type: 'string',
        description: 'Filtrar por status',
        required: false
      },
      {
        name: 'limit',
        type: 'number',
        description: 'Número máximo de resultados',
        required: false,
        default: 50
      }
    ],
    execute: async (params: any, context) => {
      const { invoiceId, status, limit = 50 } = params;
      
      const conditions: any[] = [
        eq(payments.tenantId, context.tenantId)
      ];
      
      if (invoiceId) {
        conditions.push(eq(payments.invoiceId, invoiceId));
      }
      
      if (status) {
        conditions.push(eq(payments.status, status));
      }
      
      const paymentsList = await db
        .select()
        .from(payments)
        .where(and(...conditions))
        .orderBy(desc(payments.paymentDate))
        .limit(limit);
      
      return { payments: paymentsList, total: paymentsList.length };
    }
  },
  
  {
    name: 'create_payment',
    description: 'Regista um novo pagamento',
    parameters: [
      {
        name: 'invoiceId',
        type: 'string',
        description: 'ID da fatura (opcional se pagamento avulso)',
        required: false
      },
      {
        name: 'amount',
        type: 'number',
        description: 'Montante do pagamento',
        required: true
      },
      {
        name: 'paymentDate',
        type: 'string',
        description: 'Data do pagamento (YYYY-MM-DD)',
        required: true
      },
      {
        name: 'method',
        type: 'string',
        description: 'Método de pagamento (bank_transfer, cash, card, check)',
        required: true
      },
      {
        name: 'reference',
        type: 'string',
        description: 'Referência do pagamento',
        required: false
      },
      {
        name: 'notes',
        type: 'string',
        description: 'Notas adicionais',
        required: false
      }
    ],
    execute: async (params: any, context) => {
      const { invoiceId, amount, paymentDate, method, reference, notes } = params;
      
      // Validate amount > 0
      if (amount <= 0) {
        return {
          success: false,
          error: 'Montante inválido. Deve ser maior que zero.',
        };
      }
      
      // If invoiceId provided, validate it belongs to tenant
      if (invoiceId) {
        const invoiceResult = await db
          .select({ id: invoices.id, totalAmount: invoices.totalAmount })
          .from(invoices)
          .where(and(
            eq(invoices.id, invoiceId),
            eq(invoices.tenantId, context.tenantId)
          ))
          .limit(1);
        
        if (!invoiceResult || invoiceResult.length === 0) {
          return {
            success: false,
            error: `Fatura '${invoiceId}' não encontrada ou não pertence ao seu tenant.`,
          };
        }
      }
      
      try {
        const paymentResult = await db
          .insert(payments)
          .values({
            tenantId: context.tenantId,
            invoiceId: invoiceId || null,
            type: 'received',
            amount: amount.toString(),
            paymentDate: new Date(paymentDate),
            paymentMethod: method,
            reference: reference || null,
            status: 'completed',
            notes: notes || null,
          })
          .returning();
        
        const payment = Array.isArray(paymentResult) ? paymentResult[0] : paymentResult;
        console.log('[create_payment] Payment created successfully:', payment.id);
        
        return {
          success: true,
          data: {
            paymentId: payment.id,
            amount,
            method,
            status: payment.status,
            message: 'Pagamento registado com sucesso',
          },
        };
      } catch (error: any) {
        console.error('[create_payment] Database error:', error);
        return {
          success: false,
          error: `Erro ao registar pagamento: ${error.message || error}`,
        };
      }
    }
  },
  
  {
    name: 'get_receivables_summary',
    description: 'Resumo de valores a receber (faturas pendentes)',
    parameters: [],
    execute: async (params: any, context) => {
      const result = await db
        .select({
          status: invoices.status,
          count: sql<number>`count(*)`,
          total: sql<number>`sum(CAST(${invoices.totalAmount} AS DECIMAL))`,
        })
        .from(invoices)
        .where(eq(invoices.tenantId, context.tenantId))
        .groupBy(invoices.status);
      
      const summary = {
        draft: { count: 0, total: 0 },
        sent: { count: 0, total: 0 },
        paid: { count: 0, total: 0 },
        overdue: { count: 0, total: 0 },
        cancelled: { count: 0, total: 0 },
      };
      
      for (const row of result) {
        const status = row.status as keyof typeof summary;
        if (summary[status]) {
          summary[status] = {
            count: Number(row.count),
            total: Number(row.total || 0),
          };
        }
      }
      
      return { success: true, data: summary };
    }
  },
  
  {
    name: 'get_cash_flow_analysis',
    description: 'Análise de fluxo de caixa (pagamentos recebidos vs período)',
    parameters: [
      {
        name: 'startDate',
        type: 'string',
        description: 'Data inicial (YYYY-MM-DD)',
        required: false
      },
      {
        name: 'endDate',
        type: 'string',
        description: 'Data final (YYYY-MM-DD)',
        required: false
      }
    ],
    execute: async (params: any, context) => {
      const { startDate, endDate } = params;
      
      const conditions: any[] = [
        eq(payments.tenantId, context.tenantId),
        eq(payments.status, 'completed')
      ];
      
      if (startDate) {
        conditions.push(gte(payments.paymentDate, new Date(startDate)));
      }
      
      if (endDate) {
        conditions.push(lte(payments.paymentDate, new Date(endDate)));
      }
      
      const result = await db
        .select({
          count: sql<number>`count(*)`,
          total: sql<number>`sum(CAST(${payments.amount} AS DECIMAL))`,
        })
        .from(payments)
        .where(and(...conditions));
      
      const data = result[0];
      
      return {
        success: true,
        data: {
          totalPayments: Number(data.count || 0),
          totalAmount: Number(data.total || 0),
          period: {
            start: startDate || 'início',
            end: endDate || 'hoje',
          },
        },
      };
    }
  },
];
