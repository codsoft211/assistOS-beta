import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { employees } from 'shared/schema';
import { eq, and, sql } from 'drizzle-orm';

export class ListEmployeesTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'list_employees',
    category: 'hr' as const,
    scope: 'tenant' as const,
    description: 'Lista todos os colaboradores com filtros (departamento, cargo, status)',
    parameters: [
      {
        name: 'department',
        type: 'string',
        description: 'Filtrar por departamento',
        required: false
      },
      {
        name: 'position',
        type: 'string',
        description: 'Filtrar por cargo/função',
        required: false
      },
      {
        name: 'status',
        type: 'string',
        description: 'Filtrar por status (Ativo, Inativo)',
        required: false
      }
    ],
    outputSchema: z.object({
      employees: z.array(z.object({
        id: z.string(),
        name: z.string(),
        email: z.string(),
        department: z.string(),
        position: z.string(),
        status: z.string()
      })),
      count: z.number(),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: { 
      department?: string;
      position?: string;
      status?: string;
    },
    context: ToolExecutionContext
  ) {
    const conditions = [eq(employees.tenantId, context.tenantId)];
    
    if (input.department) {
      conditions.push(eq(employees.department, input.department));
    }
    
    if (input.position) {
      conditions.push(eq(employees.position, input.position));
    }
    
    if (input.status) {
      conditions.push(eq(employees.status, input.status));
    }
    
    const employeeList = await db
      .select({
        id: employees.id,
        name: employees.fullName,
        email: employees.email,
        department: employees.department,
        position: employees.position,
        status: employees.status
      })
      .from(employees)
      .where(and(...conditions));

    return {
      employees: employeeList,
      count: employeeList.length,
      message: `Encontrados ${employeeList.length} colaborador(es)`
    };
  }
}
