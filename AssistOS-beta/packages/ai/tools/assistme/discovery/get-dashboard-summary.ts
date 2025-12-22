import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { 
  commercialLeads, 
  clients, 
  invoices, 
  purchasingInvoices,
  employees,
  products,
  suppliers
} from 'shared/schema';
import { eq, and, count, sum, gte, sql } from 'drizzle-orm';

export class GetDashboardSummaryTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'get_dashboard_summary',
    category: 'discovery' as const,
    scope: 'tenant' as const,
    description: 'Obtem resumo geral do negocio com KPIs principais de todos os modulos. Use quando user perguntar "como esta o negocio?", "resumo geral", "dashboard", "metricas principais", etc.',
    parameters: [],
    outputSchema: z.object({
      sales: z.object({
        totalLeads: z.number(),
        newLeads: z.number(),
        upcomingEvents: z.number()
      }),
      customers: z.object({
        total: z.number(),
        active: z.number()
      }),
      financial: z.object({
        pendingInvoices: z.number(),
        pendingInvoicesValue: z.number(),
        pendingExpenses: z.number(),
        pendingExpensesValue: z.number()
      }),
      hr: z.object({
        totalEmployees: z.number(),
        activeEmployees: z.number()
      }),
      inventory: z.object({
        totalProducts: z.number(),
        totalSuppliers: z.number()
      }),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: {},
    context: ToolExecutionContext
  ) {
    const today = new Date();
    const env = context.environment;
    
    const leadsConditions: any[] = [eq(commercialLeads.tenantId, context.tenantId)];
    if (env) leadsConditions.push(eq(commercialLeads.environment, env));
    
    const [leadsStats] = await db
      .select({
        totalLeads: count(commercialLeads.id),
      })
      .from(commercialLeads)
      .where(and(...leadsConditions));

    const newLeadsConditions: any[] = [
      eq(commercialLeads.tenantId, context.tenantId),
      eq(commercialLeads.status, 'new')
    ];
    if (env) newLeadsConditions.push(eq(commercialLeads.environment, env));
    
    const [newLeadsStats] = await db
      .select({
        newLeads: count(commercialLeads.id),
      })
      .from(commercialLeads)
      .where(and(...newLeadsConditions));

    const upcomingConditions: any[] = [
      eq(commercialLeads.tenantId, context.tenantId),
      gte(commercialLeads.eventDate, today)
    ];
    if (env) upcomingConditions.push(eq(commercialLeads.environment, env));
    
    const [upcomingEventsStats] = await db
      .select({
        upcomingEvents: count(commercialLeads.id),
      })
      .from(commercialLeads)
      .where(and(...upcomingConditions));

    const clientsConditions: any[] = [eq(clients.tenantId, context.tenantId)];
    
    const [customersStats] = await db
      .select({
        total: count(clients.id),
      })
      .from(clients)
      .where(and(...clientsConditions));

    const activeClientsConditions: any[] = [
      eq(clients.tenantId, context.tenantId),
      eq(clients.status, 'Ativo')
    ];
    
    const [activeCustomersStats] = await db
      .select({
        active: count(clients.id),
      })
      .from(clients)
      .where(and(...activeClientsConditions));

    const invoicesConditions: any[] = [
      eq(invoices.tenantId, context.tenantId),
      eq(invoices.paymentStatus, 'pending')
    ];
    if (env) invoicesConditions.push(eq(invoices.environment, env));
    
    const [pendingInvoicesStats] = await db
      .select({
        count: count(invoices.id),
        total: sum(sql`CAST(${invoices.totalAmount} AS DECIMAL)`),
      })
      .from(invoices)
      .where(and(...invoicesConditions));

    const expensesConditions: any[] = [
      eq(purchasingInvoices.tenantId, context.tenantId),
      eq(purchasingInvoices.threeWayMatchStatus, 'pending')
    ];
    if (env) expensesConditions.push(eq(purchasingInvoices.environment, env));
    
    const [pendingExpensesStats] = await db
      .select({
        count: count(purchasingInvoices.id),
        total: sum(sql`CAST(${purchasingInvoices.totalAmount} AS DECIMAL)`),
      })
      .from(purchasingInvoices)
      .where(and(...expensesConditions));

    const employeesConditions: any[] = [eq(employees.tenantId, context.tenantId)];
    
    const [employeesStats] = await db
      .select({
        total: count(employees.id),
      })
      .from(employees)
      .where(and(...employeesConditions));

    const activeEmployeesConditions: any[] = [
      eq(employees.tenantId, context.tenantId),
      eq(employees.status, 'Ativo')
    ];
    
    const [activeEmployeesStats] = await db
      .select({
        active: count(employees.id),
      })
      .from(employees)
      .where(and(...activeEmployeesConditions));

    const productsConditions: any[] = [eq(products.tenantId, context.tenantId)];
    if (env) productsConditions.push(eq(products.environment, env));
    
    const [productsStats] = await db
      .select({
        total: count(products.id),
      })
      .from(products)
      .where(and(...productsConditions));

    const suppliersConditions: any[] = [eq(suppliers.tenantId, context.tenantId)];
    if (env) suppliersConditions.push(eq(suppliers.environment, env));
    
    const [suppliersStats] = await db
      .select({
        total: count(suppliers.id),
      })
      .from(suppliers)
      .where(and(...suppliersConditions));

    return {
      sales: {
        totalLeads: leadsStats?.totalLeads || 0,
        newLeads: newLeadsStats?.newLeads || 0,
        upcomingEvents: upcomingEventsStats?.upcomingEvents || 0
      },
      customers: {
        total: customersStats?.total || 0,
        active: activeCustomersStats?.active || 0
      },
      financial: {
        pendingInvoices: pendingInvoicesStats?.count || 0,
        pendingInvoicesValue: parseFloat(pendingInvoicesStats?.total?.toString() || '0'),
        pendingExpenses: pendingExpensesStats?.count || 0,
        pendingExpensesValue: parseFloat(pendingExpensesStats?.total?.toString() || '0')
      },
      hr: {
        totalEmployees: employeesStats?.total || 0,
        activeEmployees: activeEmployeesStats?.active || 0
      },
      inventory: {
        totalProducts: productsStats?.total || 0,
        totalSuppliers: suppliersStats?.total || 0
      },
      message: `Resumo do negocio: ${leadsStats?.totalLeads || 0} leads, ${customersStats?.total || 0} clientes, ${pendingInvoicesStats?.count || 0} faturas pendentes`
    };
  }
}
