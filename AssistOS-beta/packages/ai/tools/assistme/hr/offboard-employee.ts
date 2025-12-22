import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { employees } from 'shared/schema';
import { and, eq } from 'drizzle-orm';

export class OffboardEmployeeTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'offboard_employee',
    category: 'hr' as const,
    scope: 'tenant' as const,
    description: 'Processa a saída de um funcionário do sistema',
    parameters: [
      {
        name: 'employeeId',
        type: 'string',
        description: 'ID do funcionário',
        required: true
      },
      {
        name: 'endDate',
        type: 'string',
        description: 'Data de saída (YYYY-MM-DD)',
        required: true
      }
    ],
    outputSchema: z.object({
      employeeId: z.string(),
      employeeName: z.string(),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: { 
      employeeId: string;
      endDate: string;
    },
    context: ToolExecutionContext
  ) {
    const employee = await db.query.employees.findFirst({
      where: and(
        eq(employees.id, input.employeeId),
        eq(employees.tenantId, context.tenantId)
      )
    });

    if (!employee) {
      throw new Error('Funcionário não encontrado ou sem permissão');
    }

    await db.update(employees)
      .set({
        status: 'Inativo',
        endDate: new Date(input.endDate)
      })
      .where(and(
        eq(employees.id, input.employeeId),
        eq(employees.tenantId, context.tenantId)
      ));

    return {
      employeeId: employee.id,
      employeeName: employee.fullName,
      message: `Saída de ${employee.fullName} processada com sucesso (Data: ${input.endDate})`
    };
  }
}
