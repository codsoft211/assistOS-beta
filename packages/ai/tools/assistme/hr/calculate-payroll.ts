import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { payroll, employees } from 'shared/schema';
import { and, eq } from 'drizzle-orm';

export class CalculatePayrollTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'calculate_payroll',
    category: 'hr' as const,
    scope: 'tenant' as const,
    description: 'Calcula folha de pagamento para funcionários ativos',
    parameters: [
      {
        name: 'month',
        type: 'string',
        description: 'Mês (01-12)',
        required: true
      },
      {
        name: 'year',
        type: 'number',
        description: 'Ano',
        required: true
      },
      {
        name: 'employeeId',
        type: 'string',
        description: 'ID do funcionário (opcional, deixar vazio para todos)',
        required: false
      }
    ],
    outputSchema: z.object({
      processed: z.number(),
      totalAmount: z.string(),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: { 
      month: string;
      year: number;
      employeeId?: string;
    },
    context: ToolExecutionContext
  ) {
    let employeesToProcess;

    if (input.employeeId) {
      const emp = await db.query.employees.findFirst({
        where: and(
          eq(employees.id, input.employeeId),
          eq(employees.tenantId, context.tenantId),
          eq(employees.status, 'Ativo')
        )
      });

      if (!emp) {
        throw new Error('Funcionário não encontrado ou inativo');
      }
      employeesToProcess = [emp];
    } else {
      employeesToProcess = await db.query.employees.findMany({
        where: and(
          eq(employees.tenantId, context.tenantId),
          eq(employees.status, 'Ativo')
        )
      });
    }

    let totalAmount = 0;
    const payrollRecords = [];

    for (const employee of employeesToProcess) {
      const baseSalary = parseFloat(employee.salary || '0');
      const netSalary = baseSalary;

      const [record] = await db.insert(payroll).values({
        tenantId: context.tenantId,
        month: input.month,
        year: input.year,
        employeeId: employee.id,
        baseSalary: baseSalary.toString(),
        bonuses: '0',
        deductions: '0',
        netSalary: netSalary.toString(),
        status: 'Pendente',
        createdBy: context.userId
      }).returning();

      payrollRecords.push(record);
      totalAmount += netSalary;
    }

    return {
      processed: payrollRecords.length,
      totalAmount: totalAmount.toFixed(2),
      message: `Folha de pagamento calculada para ${payrollRecords.length} funcionários (Total: ${totalAmount.toFixed(2)})`
    };
  }
}
