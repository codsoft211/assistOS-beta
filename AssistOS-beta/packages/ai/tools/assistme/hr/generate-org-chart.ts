import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { employees } from 'shared/schema';
import { eq, and, sql } from 'drizzle-orm';

export class GenerateOrgChartTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'generate_org_chart',
    category: 'hr' as const,
    scope: 'tenant' as const,
    description: 'Gera organograma da equipa com hierarquia de reportes',
    parameters: [
      {
        name: 'department',
        type: 'string',
        description: 'Filtrar por departamento específico',
        required: false
      }
    ],
    outputSchema: z.object({
      orgChart: z.record(z.array(z.object({
        id: z.string(),
        name: z.string(),
        position: z.string(),
        email: z.string()
      }))),
      totalEmployees: z.number(),
      departments: z.array(z.string()),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: { 
      department?: string;
    },
    context: ToolExecutionContext
  ) {
    const conditions = [eq(employees.tenantId, context.tenantId)];
    
    if (input.department) {
      conditions.push(eq(employees.department, input.department));
    }
    
    // Get all employees grouped by department
    const employeeList = await db
      .select({
        id: employees.id,
        name: employees.fullName,
        email: employees.email,
        position: employees.position,
        department: employees.department
      })
      .from(employees)
      .where(and(...conditions));

    // Group employees by department
    const orgChart: Record<string, any[]> = {};
    const departments = new Set<string>();
    
    employeeList.forEach(emp => {
      const dept = emp.department || 'Sem Departamento';
      departments.add(dept);
      
      if (!orgChart[dept]) {
        orgChart[dept] = [];
      }
      
      orgChart[dept].push({
        id: emp.id,
        name: emp.name,
        position: emp.position,
        email: emp.email
      });
    });

    return {
      orgChart,
      totalEmployees: employeeList.length,
      departments: Array.from(departments),
      message: `Organograma gerado com ${employeeList.length} colaborador(es) em ${departments.size} departamento(s)`
    };
  }
}
