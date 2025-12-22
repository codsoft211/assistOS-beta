import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { projectTasks } from 'shared/schema';
import { and, eq } from 'drizzle-orm';

export class AddTaskDependencyTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'add_task_dependency',
    category: 'projects' as const,
    scope: 'tenant' as const,
    description: 'Adiciona dependência entre tarefas (task A depends on task B)',
    parameters: [
      {
        name: 'taskId',
        type: 'string',
        description: 'ID da tarefa que terá a dependência',
        required: true
      },
      {
        name: 'dependsOnTaskId',
        type: 'string',
        description: 'ID da tarefa da qual depende',
        required: true
      },
      {
        name: 'dependencyType',
        type: 'string',
        description: 'Tipo de dependência: finish_to_start (padrão) ou start_to_start',
        required: false,
        default: 'finish_to_start'
      }
    ],
    outputSchema: z.object({
      taskId: z.string(),
      dependsOn: z.string(),
      type: z.string(),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: { 
      taskId: string;
      dependsOnTaskId: string;
      dependencyType?: 'finish_to_start' | 'start_to_start';
    },
    context: ToolExecutionContext
  ) {
    // Validate taskId exists and belongs to tenant
    const task = await db.query.projectTasks.findFirst({
      where: and(
        eq(projectTasks.id, input.taskId),
        eq(projectTasks.tenantId, context.tenantId)
      )
    });

    if (!task) {
      throw new Error('Tarefa não encontrada ou sem permissão');
    }

    // Validate dependsOnTaskId exists and belongs to same tenant
    const dependsOnTask = await db.query.projectTasks.findFirst({
      where: and(
        eq(projectTasks.id, input.dependsOnTaskId),
        eq(projectTasks.tenantId, context.tenantId)
      )
    });

    if (!dependsOnTask) {
      throw new Error('Tarefa de dependência não encontrada ou sem permissão');
    }

    // Validate tasks are from the same project
    if (task.projectId !== dependsOnTask.projectId) {
      throw new Error('As tarefas devem pertencer ao mesmo projeto');
    }

    // Validate no self-dependency
    if (input.taskId === input.dependsOnTaskId) {
      throw new Error('Uma tarefa não pode depender de si mesma');
    }

    const dependencyType = input.dependencyType || 'finish_to_start';

    // Get current dependencies
    const currentDependencies = (task.dependencies as any[]) || [];

    // Check if dependency already exists
    const existingDep = currentDependencies.find(
      (dep: any) => dep.taskId === input.dependsOnTaskId
    );

    if (existingDep) {
      throw new Error('Esta dependência já existe');
    }

    // Basic circular dependency check: prevent if dependsOnTask depends on current task
    const dependsOnTaskDeps = (dependsOnTask.dependencies as any[]) || [];
    const wouldCreateCycle = dependsOnTaskDeps.some(
      (dep: any) => dep.taskId === input.taskId
    );

    if (wouldCreateCycle) {
      throw new Error('Esta dependência criaria uma dependência circular');
    }

    // Add new dependency
    const updatedDependencies = [
      ...currentDependencies,
      {
        taskId: input.dependsOnTaskId,
        type: dependencyType
      }
    ];

    // Update task with new dependencies
    await db.update(projectTasks)
      .set({ 
        dependencies: updatedDependencies,
        updatedAt: new Date()
      })
      .where(eq(projectTasks.id, input.taskId));

    return {
      taskId: input.taskId,
      dependsOn: input.dependsOnTaskId,
      type: dependencyType,
      message: `Dependência adicionada com sucesso! Tarefa "${task.name}" agora depende de "${dependsOnTask.name}" (${dependencyType}).`
    };
  }
}
