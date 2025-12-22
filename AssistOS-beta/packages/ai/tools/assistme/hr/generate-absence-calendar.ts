import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { timeOffRequests, employees } from 'shared/schema';
import { eq, and, gte, lte, sql } from 'drizzle-orm';

export class GenerateAbsenceCalendarTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'generate_absence_calendar',
    category: 'hr' as const,
    scope: 'tenant' as const,
    description: 'Gera calendário de ausências da equipa (férias, baixas) para um período',
    parameters: [
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
        name: 'department',
        type: 'string',
        description: 'Filtrar por departamento',
        required: false
      }
    ],
    outputSchema: z.object({
      absences: z.array(z.object({
        employeeName: z.string(),
        type: z.string(),
        startDate: z.string(),
        endDate: z.string(),
        days: z.number(),
        status: z.string()
      })),
      totalDays: z.number(),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: { 
      startDate: string;
      endDate: string;
      department?: string;
    },
    context: ToolExecutionContext
  ) {
    // Build query conditions
    const conditions = [
      eq(timeOffRequests.tenantId, context.tenantId),
      gte(timeOffRequests.startDate, input.startDate),
      lte(timeOffRequests.endDate, input.endDate)
    ];

    // Get time off requests with employee info
    const absenceList = await db
      .select({
        employeeName: employees.fullName,
        department: employees.department,
        type: timeOffRequests.requestType,
        startDate: timeOffRequests.startDate,
        endDate: timeOffRequests.endDate,
        days: timeOffRequests.days,
        status: timeOffRequests.status
      })
      .from(timeOffRequests)
      .innerJoin(employees, eq(timeOffRequests.employeeId, employees.id))
      .where(and(...conditions));

    // Filter by department if provided
    const filteredAbsences = input.department
      ? absenceList.filter(a => a.department === input.department)
      : absenceList;

    // Calculate total days
    const totalDays = filteredAbsences.reduce((sum, absence) => sum + absence.days, 0);

    // Format response
    const formattedAbsences = filteredAbsences.map(a => ({
      employeeName: a.employeeName,
      type: a.type,
      startDate: a.startDate,
      endDate: a.endDate,
      days: a.days,
      status: a.status
    }));

    return {
      absences: formattedAbsences,
      totalDays,
      message: `Calendário gerado com ${formattedAbsences.length} ausência(s) totalizando ${totalDays} dia(s)`
    };
  }
}
