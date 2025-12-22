import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { projectTasks, users, userTenants } from 'shared/schema';
import { and, eq } from 'drizzle-orm';

export class AssignTaskTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'assign_task',
    category: 'projects' as const,
    scope: 'tenant' as const,
    description: 'Atribui uma tarefa do projeto a um membro da equipa',
    parameters: [
      {
        name: 'taskId',
        type: 'string',
        description: 'ID da tarefa a atribuir',
        required: true
      },
      {
        name: 'userId',
        type: 'string',
        description: 'ID do utilizador a quem atribuir a tarefa',
        required: true
      },
      {
        name: 'dueDate',
        type: 'string',
        description: 'Data de conclusão prevista (YYYY-MM-DD)',
        required: false
      }
    ],
    outputSchema: z.object({
      taskId: z.string(),
      assignedTo: z.string(),
      userName: z.string(),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: { 
      taskId: string;
      userId: string;
      dueDate?: string;
    },
    context: ToolExecutionContext
  ) {
    // SECURITY: Verify user belongs to tenant
    const userTenant = await db.query.userTenants.findFirst({
      where: and(
        eq(userTenants.userId, input.userId),
        eq(userTenants.tenantId, context.tenantId)
      )
    });

    if (!userTenant) {
      throw new Error('Utilizador não pertence a este tenant');
    }

    const user = await db.query.users.findFirst({
      where: eq(users.id, input.userId)
    });

    if (!user) {
      throw new Error('Utilizador não encontrado ou sem permissão');
    }

    const updateData: any = {
      assignedTo: input.userId,
      updatedAt: new Date()
    };

    if (input.dueDate) {
      updateData.dueDate = new Date(input.dueDate);
    }

    // SECURITY: Update only tasks that belong to tenant
    const [updatedTask] = await db
      .update(projectTasks)
      .set(updateData)
      .where(
        and(
          eq(projectTasks.id, input.taskId),
          eq(projectTasks.tenantId, context.tenantId)
        )
      )
      .returning();

    if (!updatedTask) {
      throw new Error('Tarefa não encontrada ou sem permissão');
    }

    return {
      taskId: updatedTask.id,
      assignedTo: input.userId,
      userName: `${user.firstName} ${user.lastName}`,
      message: `Tarefa "${updatedTask.name}" atribuída a ${user.firstName} ${user.lastName} com sucesso!`
    };
  }
}
