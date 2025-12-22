import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { projectTemplates } from 'shared/schema';
import { eq } from 'drizzle-orm';

export class CreateProjectTemplateTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'create_project_template',
    category: 'projects' as const,
    scope: 'tenant' as const,
    description: 'Cria um template de projeto reutilizável com fases e tarefas pré-definidas',
    parameters: [
      {
        name: 'name',
        type: 'string',
        description: 'Nome do template',
        required: true
      },
      {
        name: 'description',
        type: 'string',
        description: 'Descrição do template',
        required: false
      },
      {
        name: 'industry',
        type: 'string',
        description: 'Indústria/categoria do template (ex: "construção", "consultoria", "software")',
        required: true
      },
      {
        name: 'defaultPhases',
        type: 'array',
        description: 'Array de fases pré-definidas [{ name, duration, description }]',
        required: false
      },
      {
        name: 'defaultTasks',
        type: 'array',
        description: 'Array de tarefas pré-definidas [{ name, phase, estimatedHours, description }]',
        required: false
      },
      {
        name: 'icon',
        type: 'string',
        description: 'Ícone do template',
        required: false
      }
    ],
    outputSchema: z.object({
      templateId: z.string(),
      name: z.string(),
      phasesCount: z.number(),
      tasksCount: z.number(),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: { 
      name: string;
      description?: string;
      industry: string;
      defaultPhases?: Array<{ name: string; duration?: number; description?: string }>;
      defaultTasks?: Array<{ name: string; phase?: string; estimatedHours?: number; description?: string }>;
      icon?: string;
    },
    context: ToolExecutionContext
  ) {
    const phasesCount = input.defaultPhases?.length || 0;
    const tasksCount = input.defaultTasks?.length || 0;

    // Build wbsStructure combining phases and tasks
    const wbsStructure = {
      phases: input.defaultPhases || [],
      tasks: input.defaultTasks || []
    };

    const [newTemplate] = await db.insert(projectTemplates).values({
      tenantId: context.tenantId,
      name: input.name,
      description: input.description,
      industry: input.industry,
      icon: input.icon,
      wbsStructure,
      isGlobal: false,
      isActive: true,
      createdBy: context.userId,
      usageCount: 0
    }).returning() as any[];

    return {
      templateId: newTemplate.id,
      name: newTemplate.name,
      phasesCount,
      tasksCount,
      message: `Template "${newTemplate.name}" criado com sucesso! ${phasesCount} fases e ${tasksCount} tarefas pré-definidas.`
    };
  }
}
