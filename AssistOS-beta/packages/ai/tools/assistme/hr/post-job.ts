import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { recruitmentJobs } from 'shared/schema';

export class PostJobTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'post_job',
    category: 'hr' as const,
    scope: 'tenant' as const,
    description: 'Publica uma nova vaga de emprego',
    parameters: [
      {
        name: 'title',
        type: 'string',
        description: 'Título da vaga',
        required: true
      },
      {
        name: 'department',
        type: 'string',
        description: 'Departamento',
        required: true
      },
      {
        name: 'description',
        type: 'string',
        description: 'Descrição da vaga',
        required: true
      },
      {
        name: 'requirements',
        type: 'array',
        description: 'Requisitos da vaga',
        required: false
      },
      {
        name: 'salaryRange',
        type: 'string',
        description: 'Faixa salarial (ex: 2000-3000)',
        required: false
      },
      {
        name: 'openings',
        type: 'number',
        description: 'Número de vagas',
        required: false,
        default: 1
      }
    ],
    outputSchema: z.object({
      jobId: z.string(),
      title: z.string(),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: { 
      title: string;
      department: string;
      description: string;
      requirements?: string[];
      salaryRange?: string;
      openings?: number;
    },
    context: ToolExecutionContext
  ) {
    const [job] = await db.insert(recruitmentJobs).values({
      tenantId: context.tenantId,
      title: input.title,
      department: input.department,
      description: input.description,
      requirements: input.requirements,
      salaryRange: input.salaryRange,
      openings: input.openings || 1,
      status: 'Aberta',
      postedBy: context.userId
    }).returning();

    return {
      jobId: job.id,
      title: job.title,
      message: `Vaga "${job.title}" publicada com sucesso (${job.openings} vaga${job.openings > 1 ? 's' : ''})`
    };
  }
}
