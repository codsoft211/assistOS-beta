import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { employees } from 'shared/schema';
import { eq, and } from 'drizzle-orm';

export class UpdateEmployeeTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'update_employee',
    category: 'hr' as const,
    scope: 'tenant' as const,
    description: 'Atualiza informações de um colaborador (departamento, cargo, salário, status)',
    parameters: [
      {
        name: 'employeeId',
        type: 'string',
        description: 'ID do colaborador',
        required: true
      },
      {
        name: 'department',
        type: 'string',
        description: 'Novo departamento',
        required: false
      },
      {
        name: 'position',
        type: 'string',
        description: 'Novo cargo',
        required: false
      },
      {
        name: 'salary',
        type: 'string',
        description: 'Novo salário',
        required: false
      },
      {
        name: 'status',
        type: 'string',
        description: 'Novo status (Ativo, Inativo, Férias, etc)',
        required: false
      }
    ],
    outputSchema: z.object({
      employeeId: z.string(),
      updatedFields: z.record(z.any()),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: { 
      employeeId: string;
      department?: string;
      position?: string;
      salary?: string;
      status?: string;
    },
    context: ToolExecutionContext
  ) {
    const employee = await db
      .select()
      .from(employees)
      .where(
        and(
          eq(employees.id, input.employeeId),
          eq(employees.tenantId, context.tenantId)
        )
      )
      .limit(1);

    if (employee.length === 0) {
      throw new Error('Colaborador não encontrado');
    }

    const updatedFields: Record<string, any> = {};
    
    if (input.department !== undefined) {
      updatedFields.department = input.department;
    }
    if (input.position !== undefined) {
      updatedFields.position = input.position;
    }
    if (input.salary !== undefined) {
      updatedFields.salary = input.salary;
    }
    if (input.status !== undefined) {
      updatedFields.status = input.status;
    }

    if (Object.keys(updatedFields).length === 0) {
      throw new Error('Nenhum campo para atualizar fornecido');
    }

    updatedFields.updatedAt = new Date();

    await db
      .update(employees)
      .set(updatedFields)
      .where(
        and(
          eq(employees.id, input.employeeId),
          eq(employees.tenantId, context.tenantId)
        )
      );

    const fieldNames = Object.keys(updatedFields)
      .filter(k => k !== 'updatedAt')
      .join(', ');

    return {
      employeeId: input.employeeId,
      updatedFields,
      message: `Colaborador ${employee[0].fullName} atualizado com sucesso. Campos alterados: ${fieldNames}`
    };
  }
}
