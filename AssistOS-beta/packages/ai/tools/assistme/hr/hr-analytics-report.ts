import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { employees, timeOffRequests, attendance, trainingPrograms } from 'shared/schema';
import { eq, and, gte, lte, sql, count } from 'drizzle-orm';

export class HRAnalyticsReportTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'generate_hr_analytics',
    category: 'hr' as const,
    scope: 'tenant' as const,
    description: 'Gera relatório de analytics de RH (headcount, turnover, absentismo, formação)',
    parameters: [
      {
        name: 'startDate',
        type: 'string',
        description: 'Data de início do período (YYYY-MM-DD)',
        required: false
      },
      {
        name: 'endDate',
        type: 'string',
        description: 'Data de fim do período (YYYY-MM-DD)',
        required: false
      }
    ],
    outputSchema: z.object({
      headcount: z.object({
        total: z.number(),
        byDepartment: z.record(z.number()),
        byPosition: z.record(z.number())
      }),
      turnover: z.object({
        hires: z.number(),
        exits: z.number(),
        rate: z.number()
      }),
      absenteeism: z.object({
        totalDays: z.number(),
        rate: z.number(),
        topReasons: z.array(z.object({
          reason: z.string(),
          count: z.number()
        }))
      }),
      training: z.object({
        totalPrograms: z.number(),
        programsInPeriod: z.number()
      }),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: { 
      startDate?: string;
      endDate?: string;
    },
    context: ToolExecutionContext
  ) {
    const startDate = input.startDate ? new Date(input.startDate) : new Date(new Date().setFullYear(new Date().getFullYear() - 1));
    const endDate = input.endDate ? new Date(input.endDate) : new Date();

    // 1. HEADCOUNT
    const allEmployees = await db
      .select({
        id: employees.id,
        department: employees.department,
        position: employees.position,
        status: employees.status,
        startDate: employees.startDate,
        endDate: employees.endDate
      })
      .from(employees)
      .where(eq(employees.tenantId, context.tenantId));

    const activeEmployees = allEmployees.filter(e => e.status === 'Ativo');
    
    const byDepartment: Record<string, number> = {};
    const byPosition: Record<string, number> = {};
    
    activeEmployees.forEach(emp => {
      const dept = emp.department || 'Não Atribuído';
      const pos = emp.position || 'Não Atribuído';
      byDepartment[dept] = (byDepartment[dept] || 0) + 1;
      byPosition[pos] = (byPosition[pos] || 0) + 1;
    });

    // 2. TURNOVER
    const hires = allEmployees.filter(e => 
      e.startDate && 
      new Date(e.startDate) >= startDate && 
      new Date(e.startDate) <= endDate
    ).length;

    const exits = allEmployees.filter(e => 
      e.endDate && 
      new Date(e.endDate) >= startDate && 
      new Date(e.endDate) <= endDate
    ).length;

    const avgHeadcount = activeEmployees.length > 0 ? activeEmployees.length : 1;
    const turnoverRate = ((hires + exits) / avgHeadcount) * 100;

    // 3. ABSENTEEISM
    const absences = await db
      .select({
        days: timeOffRequests.days,
        requestType: timeOffRequests.requestType
      })
      .from(timeOffRequests)
      .where(
        and(
          eq(timeOffRequests.tenantId, context.tenantId),
          gte(timeOffRequests.startDate, startDate.toISOString().split('T')[0]),
          lte(timeOffRequests.endDate, endDate.toISOString().split('T')[0])
        )
      );

    const totalAbsenceDays = absences.reduce((sum, a) => sum + a.days, 0);
    
    const reasonCounts: Record<string, number> = {};
    absences.forEach(a => {
      const reason = a.requestType || 'Não Especificado';
      reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
    });

    const topReasons = Object.entries(reasonCounts)
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Calculate working days in period
    const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const workingDays = Math.floor(daysDiff * (5/7)); // Approximate working days
    const possibleWorkingDays = workingDays * activeEmployees.length;
    const absenteeismRate = possibleWorkingDays > 0 ? (totalAbsenceDays / possibleWorkingDays) * 100 : 0;

    const allTrainingPrograms = await db
      .select()
      .from(trainingPrograms)
      .where(eq(trainingPrograms.tenantId, context.tenantId));

    const programsInPeriod = allTrainingPrograms.filter(t => 
      new Date(t.startDate) >= startDate && new Date(t.startDate) <= endDate
    ).length;

    return {
      headcount: {
        total: activeEmployees.length,
        byDepartment,
        byPosition
      },
      turnover: {
        hires,
        exits,
        rate: Math.round(turnoverRate * 10) / 10
      },
      absenteeism: {
        totalDays: totalAbsenceDays,
        rate: Math.round(absenteeismRate * 10) / 10,
        topReasons
      },
      training: {
        totalPrograms: allTrainingPrograms.length,
        programsInPeriod
      },
      message: `Relatório de analytics gerado para período de ${startDate.toLocaleDateString('pt-PT')} a ${endDate.toLocaleDateString('pt-PT')}`
    };
  }
}
