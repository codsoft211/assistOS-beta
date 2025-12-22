/**
 * Fetch Invoice Node Executor
 * 
 * Fetches invoices from the invoice_workflow_schema based on filters.
 * Supports filtering by status, due date, and amount range.
 * 
 * Input: Filter configuration
 * Output: Array of invoices with customer data
 */

import { pool } from '../../../db.js';
import type { AssistBuildNode } from '../../../../../shared/schema.js';
import logger from '../../../../api/logger.js';

interface ExecutionContext {
  workflowId: string;
  executionId: string;
  tenantId: string;
  userId: string;
  environment: 'sandbox' | 'production';
  variables: Record<string, any>;
  triggerData?: any;
}

interface FetchInvoiceConfig {
  status: 'pending' | 'sent' | 'paid' | 'overdue' | 'cancelled' | 'any';
  dueDateRange: 'past' | 'today' | 'this_week' | 'this_month' | 'custom';
  dueDateFrom?: string;
  dueDateTo?: string;
  minAmount?: number;
  maxAmount?: number;
  limit: number;
}

interface Invoice {
  id: string;
  invoice_number: string;
  customer_id: string;
  customer_name: string;
  customer_email: string;
  amount: number;
  currency: string;
  status: string;
  due_date: string;
  issued_date: string;
  description: string;
  days_overdue?: number;
}

export class FetchInvoiceExecutor {
  async execute(
    node: AssistBuildNode,
    context: ExecutionContext
  ): Promise<{ success: boolean; output?: any; error?: string }> {
    const { executionId } = context;
    const config = node.config as FetchInvoiceConfig;

    logger.info(
      { 
        executionId, 
        nodeId: node.id, 
        nodeType: 'fetch_invoice',
        status: config.status,
        dueDateRange: config.dueDateRange,
        limit: config.limit
      },
      '[FetchInvoiceExecutor] Fetching invoices'
    );

    try {
      // Build the SQL query dynamically
      const conditions: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      // Status filter
      if (config.status && config.status !== 'any') {
        conditions.push(`i.status = $${paramIndex++}`);
        params.push(config.status);
      }

      // Due date range filter
      const now = new Date();
      const today = now.toISOString().split('T')[0];
      
      switch (config.dueDateRange) {
        case 'past':
          conditions.push(`i.due_date < $${paramIndex++}`);
          params.push(today);
          break;
        case 'today':
          conditions.push(`i.due_date = $${paramIndex++}`);
          params.push(today);
          break;
        case 'this_week':
          const weekEnd = new Date(now);
          weekEnd.setDate(weekEnd.getDate() + (7 - weekEnd.getDay()));
          conditions.push(`i.due_date <= $${paramIndex++}`);
          params.push(weekEnd.toISOString().split('T')[0]);
          break;
        case 'this_month':
          const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
          conditions.push(`i.due_date <= $${paramIndex++}`);
          params.push(monthEnd.toISOString().split('T')[0]);
          break;
        case 'custom':
          if (config.dueDateFrom) {
            conditions.push(`i.due_date >= $${paramIndex++}`);
            params.push(config.dueDateFrom);
          }
          if (config.dueDateTo) {
            conditions.push(`i.due_date <= $${paramIndex++}`);
            params.push(config.dueDateTo);
          }
          break;
      }

      // Amount range filters
      if (config.minAmount !== undefined) {
        conditions.push(`i.amount >= $${paramIndex++}`);
        params.push(config.minAmount);
      }
      if (config.maxAmount !== undefined) {
        conditions.push(`i.amount <= $${paramIndex++}`);
        params.push(config.maxAmount);
      }

      // Limit
      const limit = config.limit || 100;
      params.push(limit);

      const whereClause = conditions.length > 0 
        ? `WHERE ${conditions.join(' AND ')}` 
        : '';

      const query = `
        SELECT 
          i.id,
          i.invoice_number,
          i.customer_id,
          c.name as customer_name,
          c.email as customer_email,
          c.company as customer_company,
          c.phone as customer_phone,
          i.amount,
          i.currency,
          i.status,
          i.due_date,
          i.issued_date,
          i.description,
          i.line_items,
          CASE 
            WHEN i.due_date < CURRENT_DATE THEN CURRENT_DATE - i.due_date
            ELSE 0
          END as days_overdue
        FROM invoice_workflow_schema.invoices i
        JOIN invoice_workflow_schema.customers c ON i.customer_id = c.id
        ${whereClause}
        ORDER BY i.due_date ASC, i.amount DESC
        LIMIT $${paramIndex}
      `;

      logger.debug(
        { query, params, executionId, nodeId: node.id },
        '[FetchInvoiceExecutor] Executing query'
      );

      const result = await pool.query(query, params);
      const invoices: Invoice[] = result.rows.map(row => ({
        id: row.id,
        invoice_number: row.invoice_number,
        customer_id: row.customer_id,
        customer_name: row.customer_name,
        customer_email: row.customer_email,
        customer_company: row.customer_company,
        customer_phone: row.customer_phone,
        amount: parseFloat(row.amount),
        currency: row.currency,
        status: row.status,
        due_date: row.due_date instanceof Date 
          ? row.due_date.toISOString().split('T')[0]
          : row.due_date,
        issued_date: row.issued_date instanceof Date 
          ? row.issued_date.toISOString().split('T')[0]
          : row.issued_date,
        description: row.description,
        line_items: row.line_items,
        days_overdue: parseInt(row.days_overdue) || 0,
      }));

      // Calculate summary stats
      const totalAmount = invoices.reduce((sum, inv) => sum + inv.amount, 0);
      const avgDaysOverdue = invoices.length > 0
        ? invoices.reduce((sum, inv) => sum + (inv.days_overdue || 0), 0) / invoices.length
        : 0;

      const output = {
        invoices,
        count: invoices.length,
        totalAmount,
        avgDaysOverdue: Math.round(avgDaysOverdue),
        fetchedAt: new Date().toISOString(),
        filters: {
          status: config.status,
          dueDateRange: config.dueDateRange,
          limit: config.limit,
        },
      };

      // Store in context variables for downstream nodes
      context.variables['invoices'] = output.invoices;
      context.variables['invoiceCount'] = output.count;
      context.variables['totalAmount'] = output.totalAmount;
      context.variables['fetchResult'] = output;

      logger.info(
        { 
          executionId, 
          nodeId: node.id, 
          invoiceCount: invoices.length,
          totalAmount,
          avgDaysOverdue: output.avgDaysOverdue
        },
        '[FetchInvoiceExecutor] ✅ Invoices fetched successfully'
      );

      return {
        success: true,
        output,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      logger.error(
        { 
          error: {
            message: errorMessage,
            code: (error as any).code,
            detail: (error as any).detail,
          },
          executionId, 
          nodeId: node.id 
        },
        '[FetchInvoiceExecutor] ❌ Failed to fetch invoices'
      );

      return {
        success: false,
        error: `Failed to fetch invoices: ${errorMessage}`,
      };
    }
  }
}
