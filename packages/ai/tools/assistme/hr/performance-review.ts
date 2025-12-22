import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { performanceReviews, employees } from 'shared/schema';
import { and, eq } from 'drizzle-orm';

export class PerformanceReviewTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'create_performance_review',
    category: 'hr' as const,
    scope: 'tenant' as const,
    description: 'Cria uma avaliação de desempenho para um funcionário',
    parameters: [
      {
        name: 'employeeId',
        type: 'string',
        description: 'ID do funcionário',
        required: true
      },
      {
        name: 'reviewPeriod',
        type: 'string',
        description: 'Período da avaliação (ex: Q1 2025)',
        required: true
      },
      {
        name: 'rating',
        type: 'number',
        description: 'Classificação (1-5)',
        required: true
      },
      {
        name: 'feedback',
        type: 'string',
        description: 'Feedback detalhado',
        required: true
      },
      {
        name: 'goals',
        type: 'array',
        description: 'Objetivos para o próximo período',
        required: false
      }
    ],
    outputSchema: z.object({
      reviewId: z.string(),
      employeeName: z.string(),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: { 
      employeeId: string;
      reviewPeriod: string;
      rating: number;
      feedback: string;
      goals?: string[];
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

    if (input.rating < 1 || input.rating > 5) {
      throw new Error('Classificação deve estar entre 1 e 5');
    }

    const [review] = await db.insert(performanceReviews).values({
      tenantId: context.tenantId,
      employeeId: input.employeeId,
      reviewPeriod: input.reviewPeriod,
      rating: input.rating,
      feedback: input.feedback,
      goals: input.goals,
      reviewedBy: context.userId
    }).returning();

    return {
      reviewId: review.id,
      employeeName: employee.fullName,
      message: `Avaliação de desempenho criada para ${employee.fullName} (Rating: ${input.rating}/5)`
    };
  }
}
