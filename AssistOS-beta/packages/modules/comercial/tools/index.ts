/**
 * Comercial Module Tools
 * 
 * AI tools migradas do legacy code para o novo sistema modular.
 * Estas tools SÃO AS MESMAS que estavam em packages/ai/tools/index.ts,
 * apenas adaptadas para o pattern ModuleTool.
 */

import type { ModuleTool } from '../../base/module.interface';
import { db } from '../../../../apps/api/db';
import { commercialLeads, budgetQuotes, salesOrders, clients } from '../../../../shared/schema';
import { eq, and, ilike, or } from 'drizzle-orm';

export const comercialTools: ModuleTool[] = [
  {
    name: 'list_leads',
    description: 'List all sales leads with optional filters (status, owner, source)',
    parameters: [
      {
        name: 'status',
        type: 'string',
        description: 'Filter by status (New, Contacted, Qualified, etc)',
        required: false
      },
      {
        name: 'ownerId',
        type: 'string',
        description: 'Filter by owner',
        required: false
      },
      {
        name: 'limit',
        type: 'number',
        description: 'Maximum number of results',
        required: false,
        default: 50
      }
    ],
    execute: async (params: any, context) => {
      const { status, ownerId, limit = 50 } = params;
      
      const conditions: any[] = [
        eq(commercialLeads.tenantId, context.tenantId)
      ];
      
      if (status) {
        conditions.push(eq(commercialLeads.status, status));
      }
      
      if (ownerId) {
        conditions.push(eq(commercialLeads.ownerId, ownerId));
      }
      
      const leads = await db
        .select()
        .from(commercialLeads)
        .where(and(...conditions))
        .limit(limit);
      
      return { leads, total: leads.length };
    }
  },
  
  {
    name: 'create_lead',
    description: 'Create a new sales lead',
    parameters: [
      {
        name: 'contactName',
        type: 'string',
        description: 'Contact name',
        required: true
      },
      {
        name: 'contactEmail',
        type: 'string',
        description: 'Contact email',
        required: false
      },
      {
        name: 'contactPhone',
        type: 'string',
        description: 'Contact phone',
        required: false
      },
      {
        name: 'description',
        type: 'string',
        description: 'Lead description',
        required: false
      },
      {
        name: 'leadSource',
        type: 'string',
        description: 'Lead source (website, email, phone, etc)',
        required: false
      }
    ],
    execute: async (params: any, context) => {
      const leadResult = await db
        .insert(commercialLeads)
        .values({
          tenantId: context.tenantId,
          contactName: params.contactName,
          contactEmail: params.contactEmail,
          contactPhone: params.contactPhone,
          description: params.description,
          leadSource: params.leadSource,
          status: 'New',
          ownerId: context.userId
        })
        .returning();
      
      const lead = Array.isArray(leadResult) ? leadResult[0] : leadResult;
      return { success: true, lead };
    }
  },
  
  {
    name: 'list_clients',
    description: 'List clients with optional search by name, email or company',
    parameters: [
      {
        name: 'search',
        type: 'string',
        description: 'Search term (name, email or company)',
        required: false
      },
      {
        name: 'status',
        type: 'string',
        description: 'Filter by status (Active, Inactive)',
        required: false
      },
      {
        name: 'limit',
        type: 'number',
        description: 'Maximum number of results',
        required: false,
        default: 50
      }
    ],
    execute: async (params: any, context) => {
      const { search, status, limit = 50 } = params;
      
      const conditions: any[] = [
        eq(clients.tenantId, context.tenantId)
      ];
      
      if (search) {
        conditions.push(
          or(
            ilike(clients.name, `%${search}%`),
            ilike(clients.email, `%${search}%`),
            ilike(clients.company, `%${search}%`)
          )
        );
      }
      
      if (status) {
        conditions.push(eq(clients.status, status));
      }
      
      const clientsList = await db
        .select()
        .from(clients)
        .where(and(...conditions as any))
        .limit(limit);
      
      return { clients: clientsList, total: clientsList.length };
    }
  },
  
  {
    name: 'create_order',
    description: 'Create a new order with complete product and price validation',
    parameters: [
      {
        name: 'clientId',
        type: 'string',
        description: 'Client ID',
        required: true
      },
      {
        name: 'items',
        type: 'array',
        description: 'Order items (array of {productCode, quantity})',
        required: true
      },
      {
        name: 'source',
        type: 'string',
        description: 'Order source (conversation, phone, email, etc)',
        required: false
      },
      {
        name: 'conversationId',
        type: 'string',
        description: 'Conversation ID (context only, not persisted)',
        required: false
      },
      {
        name: 'notes',
        type: 'string',
        description: 'Additional notes about the order',
        required: false
      }
    ],
    execute: async (params: any, context) => {
      const { clientId, items, source = 'manual', conversationId, notes } = params;
      
      console.log('[create_order] Input args:', { clientId, items, source, conversationId, notes });
      
      // Validate items array
      if (!items || !Array.isArray(items) || items.length === 0) {
        return {
          success: false,
          error: 'Empty or invalid items list. The order must contain at least one product.',
        };
      }
      
      // SECURITY: Validate client belongs to tenant (prevent cross-tenant data leakage)
      const clientResult = await db
        .select({ id: clients.id })
        .from(clients)
        .where(and(
          eq(clients.id, clientId),
          eq(clients.tenantId, context.tenantId)
        ))
        .limit(1);
      
      if (!clientResult || clientResult.length === 0) {
        console.error('[create_order] Client not found or belongs to different tenant:', clientId);
        return {
          success: false,
          error: `Client '${clientId}' not found or does not belong to your tenant. Check the client ID and try again.`,
        };
      }
      
      // Import products table for validation
      const { products } = await import('../../../../shared/schema.js');
      
      // VALIDATION: Verify all products exist and get real prices from DB
      const validatedItems = [];
      for (const item of items) {
        // Validate quantity is positive
        if (!item.quantity || item.quantity <= 0) {
          return {
            success: false,
            error: `Invalid quantity for product '${item.productCode}': ${item.quantity}. Quantity must be greater than zero.`,
          };
        }
        
        // SECURITY: Scope product lookup to tenant (prevent cross-tenant product leakage)
        const productResult = await db
          .select()
          .from(products)
          .where(and(
            eq(products.code, item.productCode),
            eq(products.tenantId, context.tenantId)
          ))
          .limit(1);
        
        const product = productResult[0];
        
        if (!product) {
          console.error('[create_order] Product not found:', item.productCode);
          return {
            success: false,
            error: `Product '${item.productCode}' not found in the system. Check the product code and try again.`,
          };
        }
        
        // Use real price from database (don't trust AI-provided price)
        const realPrice = parseFloat(product.price) || 0;
        
        // Reject products with zero or negative price
        if (realPrice <= 0) {
          console.error('[create_order] Product has invalid price:', product.code, realPrice);
          return {
            success: false,
            error: `Product '${product.name}' (${product.code}) has no price defined in the system (€${realPrice}). Contact the product manager to fix the price before creating the order.`,
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
      
      console.log('[create_order] Order data before DB insert:', { clientId, totalAmount, items: validatedItems });
      
      try {
        // Create the order (Drizzle converts number to decimal automatically)
        const orderResult = await db
          .insert(salesOrders)
          .values({
            tenantId: context.tenantId,
            clientId,
            status: 'pending',
            totalAmount: totalAmount as any, // Drizzle handles numeric → decimal conversion
            source,
            items: validatedItems,
            notes: notes || null,
          })
          .returning();
        
        const order = Array.isArray(orderResult) ? orderResult[0] : orderResult;
        console.log('[create_order] Order created successfully:', order.id);
        
        // Note: conversationId provided as context only - not persisted to DB
        // (conversations table does not have orderId field for bidirectional linking)
        if (conversationId) {
          console.log('[create_order] Order created in context of conversation:', conversationId);
        }
        
        return {
          success: true,
          data: {
            orderId: order.id,
            totalAmount,
            status: order.status,
            message: "Order created successfully",
          },
        };
      } catch (error: any) {
        console.error('[create_order] Database error:', error);
        return {
          success: false,
          error: `Error creating order: ${error.message || error}. ClientId used: ${clientId}`,
        };
      }
    }
  },
  
  {
    name: 'list_orders',
    description: 'List orders with optional filters',
    parameters: [
      {
        name: 'clientId',
        type: 'string',
        description: 'Filter by client',
        required: false
      },
      {
        name: 'status',
        type: 'string',
        description: 'Filter by status',
        required: false
      },
      {
        name: 'limit',
        type: 'number',
        description: 'Maximum number of results',
        required: false,
        default: 50
      }
    ],
    execute: async (params: any, context) => {
      const { clientId, status, limit = 50 } = params;
      
      const conditions: any[] = [
        eq(salesOrders.tenantId, context.tenantId)
      ];
      
      if (clientId) {
        conditions.push(eq(salesOrders.clientId, clientId));
      }
      
      if (status) {
        conditions.push(eq(salesOrders.status, status));
      }
      
      const orders = await db
        .select()
        .from(salesOrders)
        .where(and(...conditions))
        .limit(limit);
      
      return { orders, total: orders.length };
    }
  },
  
  {
    name: 'query_sales_analytics',
    description: 'Analyze sales data: leads, conversions, revenue, etc',
    parameters: [
      {
        name: 'startDate',
        type: 'string',
        description: 'Start date (YYYY-MM-DD)',
        required: false
      },
      {
        name: 'endDate',
        type: 'string',
        description: 'End date (YYYY-MM-DD)',
        required: false
      },
      {
        name: 'metric',
        type: 'string',
        description: 'Specific metric (leads_count, conversion_rate, revenue)',
        required: false
      }
    ],
    execute: async (params: any, context) => {
      // TODO: Implementar analytics completos
      return {
        leads: { total: 0, new: 0, qualified: 0, won: 0, lost: 0 },
        conversion_rate: 0,
        revenue: 0,
        message: 'Analytics not yet fully implemented in module migration'
      };
    }
  },
  
  {
    name: 'create_sales_order',
    description: 'Create customer order with product lines',
    parameters: [
      {
        name: 'clientId',
        type: 'string',
        description: 'Client ID',
        required: true
      },
      {
        name: 'lines',
        type: 'array',
        description: 'Order lines: array of { description, quantity, unitPrice, taxRate?, productId? }',
        required: true
      },
      {
        name: 'notes',
        type: 'string',
        description: 'Notes about the order',
        required: false
      },
      {
        name: 'deliveryAddress',
        type: 'string',
        description: 'Delivery address',
        required: false
      },
      {
        name: 'expectedDeliveryDate',
        type: 'string',
        description: 'Expected delivery date (YYYY-MM-DD)',
        required: false
      }
    ],
    execute: async (params: any, context) => {
      const { clientId, lines, notes, deliveryAddress, expectedDeliveryDate } = params;
      
      if (!lines || !Array.isArray(lines) || lines.length === 0) {
        return {
          success: false,
          error: 'Empty or invalid lines list'
        };
      }
      
      const clientCheck = await db
        .select({ id: clients.id })
        .from(clients)
        .where(and(
          eq(clients.id, clientId),
          eq(clients.tenantId, context.tenantId)
        ))
        .limit(1);
      
      if (!clientCheck || clientCheck.length === 0) {
        return {
          success: false,
          error: `Client '${clientId}' not found`
        };
      }
      
      const code = `SO-${Date.now()}`;
      let subtotal = 0;
      let taxTotal = 0;
      
      lines.forEach((line: any) => {
        const lineTotal = line.quantity * line.unitPrice;
        const lineTax = lineTotal * ((line.taxRate || 23) / 100);
        subtotal += lineTotal;
        taxTotal += lineTax;
      });
      
      const totalAmount = subtotal + taxTotal;
      
      const { salesOrderLines: salesOrderLinesTable } = await import('../../../../shared/schema.js');
      
      const orderResult = await db
        .insert(salesOrders)
        .values({
          tenantId: context.tenantId,
          code,
          clientId,
          orderDate: new Date().toISOString().split('T')[0],
          expectedDeliveryDate,
          deliveryAddress,
          notes,
          subtotal: subtotal.toString(),
          taxTotal: taxTotal.toString(),
          totalAmount: totalAmount.toString(),
          status: 'draft',
          createdBy: context.userId
        })
        .returning();
      
      const order = orderResult[0];
      
      const linesData = lines.map((line: any) => {
        const lineTotal = line.quantity * line.unitPrice;
        const taxAmount = lineTotal * ((line.taxRate || 23) / 100);
        
        return {
          tenantId: context.tenantId,
          orderId: order.id,
          description: line.description,
          quantity: line.quantity.toString(),
          unitPrice: line.unitPrice.toString(),
          lineTotal: lineTotal.toString(),
          taxRate: (line.taxRate || 23).toString(),
          taxAmount: taxAmount.toString(),
          productId: line.productId
        };
      });
      
      await db.insert(salesOrderLinesTable).values(linesData);
      
      return {
        success: true,
        data: {
          orderId: order.id,
          code: order.code,
          totalAmount,
          status: order.status
        }
      };
    }
  },
  
  {
    name: 'create_opportunity',
    description: 'Create sales opportunity for sales pipeline',
    parameters: [
      {
        name: 'title',
        type: 'string',
        description: 'Opportunity title',
        required: true
      },
      {
        name: 'clientId',
        type: 'string',
        description: 'Client ID (optional if not yet a client)',
        required: false
      },
      {
        name: 'clientName',
        type: 'string',
        description: 'Potential client name',
        required: false
      },
      {
        name: 'type',
        type: 'string',
        description: 'Opportunity type (new_business, upsell, renewal, etc)',
        required: true
      },
      {
        name: 'estimatedValue',
        type: 'number',
        description: 'Estimated opportunity value',
        required: false
      },
      {
        name: 'priority',
        type: 'string',
        description: 'Priority: low, medium, high, urgent',
        required: false
      },
      {
        name: 'description',
        type: 'string',
        description: 'Opportunity description',
        required: false
      },
      {
        name: 'notes',
        type: 'string',
        description: 'Additional notes',
        required: false
      }
    ],
    execute: async (params: any, context) => {
      const { title, clientId, clientName, type, estimatedValue, priority, description, notes } = params;
      
      const { opportunities: opportunitiesTable } = await import('../../../../shared/schema.js');
      
      const oppResult = await db
        .insert(opportunitiesTable)
        .values({
          tenantId: context.tenantId,
          title,
          description,
          clientId,
          clientName,
          type,
          source: 'manual',
          stage: 'prospecting',
          priority: priority || 'medium',
          estimatedValue: estimatedValue ? estimatedValue.toString() : null,
          probability: 50,
          status: 'open',
          createdBy: context.userId,
          notes
        })
        .returning();
      
      const opportunity = oppResult[0];
      
      return {
        success: true,
        data: {
          opportunityId: opportunity.id,
          title: opportunity.title,
          stage: opportunity.stage,
          status: opportunity.status
        }
      };
    }
  },
  
  {
    name: 'get_client_360',
    description: 'View complete client history (360° view): leads, opportunities, orders, invoices and payments',
    parameters: [
      {
        name: 'clientId',
        type: 'string',
        description: 'Client ID',
        required: true
      }
    ],
    execute: async (params: any, context) => {
      const { clientId } = params;
      
      const { opportunities: opportunitiesTable, invoices: invoicesTable, payments: paymentsTable, paymentAllocations } = await import('../../../../shared/schema.js');
      
      const clientData = await db
        .select()
        .from(clients)
        .where(and(
          eq(clients.id, clientId),
          eq(clients.tenantId, context.tenantId)
        ))
        .limit(1);
      
      if (!clientData || clientData.length === 0) {
        return {
          success: false,
          error: 'Client not found'
        };
      }
      
      const client = clientData[0];
      
      const orders = await db
        .select()
        .from(salesOrders)
        .where(and(
          eq(salesOrders.clientId, clientId),
          eq(salesOrders.tenantId, context.tenantId)
        ))
        .limit(50);
      
      const opportunities = await db
        .select()
        .from(opportunitiesTable)
        .where(and(
          eq(opportunitiesTable.clientId, clientId),
          eq(opportunitiesTable.tenantId, context.tenantId)
        ))
        .limit(50);
      
      const invoices = await db
        .select()
        .from(invoicesTable)
        .where(and(
          eq(invoicesTable.clientId, clientId),
          eq(invoicesTable.tenantId, context.tenantId)
        ))
        .limit(50);
      
      const totalOrders = orders.length;
      const totalRevenue = orders.reduce((sum, o) => sum + Number(o.totalAmount || 0), 0);
      const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
      
      return {
        success: true,
        data: {
          client,
          stats: {
            totalOrders,
            totalRevenue,
            avgOrderValue,
            lifetimeValue: totalRevenue,
            totalOpportunities: opportunities.length,
            totalInvoices: invoices.length
          },
          recentOrders: orders.slice(0, 10),
          recentOpportunities: opportunities.slice(0, 10),
          recentInvoices: invoices.slice(0, 10)
        }
      };
    }
  },
  
  {
    name: 'analyze_churn_risk',
    description: 'Identify clients at risk of churn (no purchases for X days)',
    parameters: [
      {
        name: 'daysThreshold',
        type: 'number',
        description: 'Number of days without purchases to consider churn risk',
        required: false
      }
    ],
    execute: async (params: any, context) => {
      const { daysThreshold = 60 } = params;
      
      const thresholdDate = new Date();
      thresholdDate.setDate(thresholdDate.getDate() - daysThreshold);
      
      const { sql: sqlTemplate } = await import('drizzle-orm');
      
      const allClients = await db
        .select()
        .from(clients)
        .where(and(
          eq(clients.tenantId, context.tenantId),
          eq(clients.status, 'Ativo')
        ))
        .limit(100);
      
      const atRiskClients = [];
      
      for (const client of allClients) {
        const recentOrders = await db
          .select()
          .from(salesOrders)
          .where(and(
            eq(salesOrders.clientId, client.id),
            eq(salesOrders.tenantId, context.tenantId)
          ))
          .limit(1);
        
        const lastOrder = recentOrders[0];
        
        if (!lastOrder || new Date(lastOrder.orderDate) < thresholdDate) {
          const daysSinceLastOrder = lastOrder
            ? Math.floor((Date.now() - new Date(lastOrder.orderDate).getTime()) / (1000 * 60 * 60 * 24))
            : 999;
          
          atRiskClients.push({
            clientId: client.id,
            clientName: client.name,
            lastOrderDate: lastOrder?.orderDate || null,
            daysSinceLastOrder,
            riskLevel: daysSinceLastOrder > daysThreshold * 2 ? 'high' : 'medium'
          });
        }
      }
      
      return {
        success: true,
        data: {
          daysThreshold,
          atRiskCount: atRiskClients.length,
          totalActiveClients: allClients.length,
          churnRiskPercentage: allClients.length > 0 
            ? ((atRiskClients.length / allClients.length) * 100).toFixed(2)
            : 0,
          atRiskClients: atRiskClients.slice(0, 20)
        }
      };
    }
  }
];
