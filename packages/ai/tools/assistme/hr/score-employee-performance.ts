import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { employees, performanceReviews, attendance } from 'shared/schema';
import { eq, and, gte } from 'drizzle-orm';

export class ScoreEmployeePerformanceTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'score_employee_performance',
    category: 'hr' as const,
    scope: 'tenant' as const,
    description: 'Calcula score de desempenho do colaborador baseado em reviews e presença',
    parameters: [
      {
        name: 'employeeId',
        type: 'string',
        description: 'ID do colaborador',
        required: true
      },
      {
        name: 'period',
        type: 'string',
        description: 'Período de avaliação (last_year, last_6_months, last_3_months)',
        required: false
      }
    ],
    outputSchema: z.object({
      employeeId: z.string(),
      employeeName: z.string(),
      score: z.number(),
      breakdown: z.object({
        reviews: z.object({
          score: z.number(),
          weight: z.number(),
          count: z.number()
        }),
        attendance: z.object({
          score: z.number(),
          weight: z.number(),
          rate: z.number()
        })
      }),
      recommendations: z.array(z.string()),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: { 
      employeeId: string;
      period?: string;
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

    const periodMonths = input.period === 'last_3_months' ? 3 
                       : input.period === 'last_6_months' ? 6 
                       : 12;
    
    const periodStart = new Date();
    periodStart.setMonth(periodStart.getMonth() - periodMonths);

    const reviews = await db
      .select({ rating: performanceReviews.rating })
      .from(performanceReviews)
      .where(
        and(
          eq(performanceReviews.employeeId, input.employeeId),
          eq(performanceReviews.tenantId, context.tenantId),
          gte(performanceReviews.createdAt, periodStart)
        )
      );

    const avgRating = reviews.length > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
      : 0;
    
    const reviewScore = (avgRating / 5) * 100;

    const attendanceRecords = await db
      .select({ status: attendance.status })
      .from(attendance)
      .where(
        and(
          eq(attendance.employeeId, input.employeeId),
          eq(attendance.tenantId, context.tenantId),
          gte(attendance.date, periodStart.toISOString().split('T')[0])
        )
      );

    const presentCount = attendanceRecords.filter(a => a.status === 'Presente').length;
    const attendanceRate = attendanceRecords.length > 0
      ? (presentCount / attendanceRecords.length) * 100
      : 0;

    const finalScore = Math.round(
      (reviewScore * 0.5) + 
      (attendanceRate * 0.5)
    );

    const recommendations: string[] = [];
    if (reviewScore < 60) {
      recommendations.push('Melhorar desempenho nas avaliações periódicas');
    }
    if (attendanceRate < 90) {
      recommendations.push('Melhorar taxa de presença');
    }
    if (finalScore >= 80) {
      recommendations.push('Desempenho excelente! Considerar promoção ou bónus');
    }

    return {
      employeeId: input.employeeId,
      employeeName: employee[0].fullName,
      score: finalScore,
      breakdown: {
        reviews: {
          score: Math.round(reviewScore),
          weight: 50,
          count: reviews.length
        },
        attendance: {
          score: Math.round(attendanceRate),
          weight: 50,
          rate: Math.round(attendanceRate * 10) / 10
        }
      },
      recommendations,
      message: `Score de desempenho calculado: ${finalScore}/100`
    };
  }
}
