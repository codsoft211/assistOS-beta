import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { employees } from 'shared/schema';

export class OnboardEmployeeTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'onboard_employee',
    category: 'hr' as const,
    scope: 'tenant' as const,
    description: 'Admite um novo funcionário ao sistema de RH',
    parameters: [
      {
        name: 'fullName',
        type: 'string',
        description: 'Nome completo do funcionário',
        required: true
      },
      {
        name: 'email',
        type: 'string',
        description: 'Email corporativo',
        required: true
      },
      {
        name: 'position',
        type: 'string',
        description: 'Cargo/função',
        required: true
      },
      {
        name: 'department',
        type: 'string',
        description: 'Departamento',
        required: true
      },
      {
        name: 'startDate',
        type: 'string',
        description: 'Data de início (YYYY-MM-DD)',
        required: true
      },
      {
        name: 'salary',
        type: 'number',
        description: 'Salário mensal',
        required: false
      }
    ],
    outputSchema: z.object({
      employeeId: z.string(),
      fullName: z.string(),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: { 
      fullName: string;
      email: string;
      position: string;
      department: string;
      startDate: string;
      salary?: number;
    },
    context: ToolExecutionContext
  ) {
    const [newEmployee] = await db.insert(employees).values({
      tenantId: context.tenantId,
      fullName: input.fullName,
      email: input.email,
      position: input.position,
      department: input.department,
      startDate: input.startDate,
      salary: input.salary?.toString(),
      status: 'Ativo',
      createdBy: context.userId
    }).returning();

    return {
      employeeId: newEmployee.id,
      fullName: newEmployee.fullName,
      message: `Funcionário ${newEmployee.fullName} admitido com sucesso!`
    };
  }
}
