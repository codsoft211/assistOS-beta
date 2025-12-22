import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { timeOffRequests, employees } from 'shared/schema';
import { and, eq } from 'drizzle-orm';

export class RequestTimeoffTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'request_timeoff',
    category: 'hr' as const,
    scope: 'tenant' as const,
    description: 'Cria um pedido de férias ou ausência para um funcionário',
    parameters: [
      {
        name: 'employeeId',
        type: 'string',
        description: 'ID do funcionário',
        required: true
      },
      {
        name: 'requestType',
        type: 'string',
        description: 'Tipo de ausência (Férias/Doença/Pessoal)',
        required: true
      },
      {
        name: 'startDate',
        type: 'string',
        description: 'Data de início (YYYY-MM-DD)',
        required: true
      },
      {
        name: 'endDate',
        type: 'string',
        description: 'Data de fim (YYYY-MM-DD)',
        required: true
      },
      {
        name: 'reason',
        type: 'string',
        description: 'Motivo do pedido',
        required: false
      }
    ],
    outputSchema: z.object({
      requestId: z.string(),
      employeeName: z.string(),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: { 
      employeeId: string;
      requestType: string;
      startDate: string;
      endDate: string;
      reason?: string;
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

    const start = new Date(input.startDate);
    const end = new Date(input.endDate);
    const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    const [request] = await db.insert(timeOffRequests).values({
      tenantId: context.tenantId,
      employeeId: input.employeeId,
      requestType: input.requestType,
      startDate: start,
      endDate: end,
      days,
      reason: input.reason,
      status: 'Pendente'
    }).returning();

    return {
      requestId: request.id,
      employeeName: employee.fullName,
      message: `Pedido de ${input.requestType} criado para ${employee.fullName} (${days} dias)`
    };
  }
}
