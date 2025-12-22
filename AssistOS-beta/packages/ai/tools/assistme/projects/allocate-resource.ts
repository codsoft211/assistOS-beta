import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { projectResources, projects } from 'shared/schema';
import { and, eq } from 'drizzle-orm';

export class AllocateResourceTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'allocate_resource',
    category: 'projects' as const,
    scope: 'tenant' as const,
    description: 'Aloca um recurso (pessoa, equipamento, material) a um projeto',
    parameters: [
      {
        name: 'projectId',
        type: 'string',
        description: 'ID do projeto',
        required: true
      },
      {
        name: 'resourceType',
        type: 'string',
        description: 'Tipo de recurso (human/equipment/material)',
        required: true
      },
      {
        name: 'resourceName',
        type: 'string',
        description: 'Nome do recurso',
        required: true
      },
      {
        name: 'quantity',
        type: 'number',
        description: 'Quantidade do recurso',
        required: false,
        default: 1
      },
      {
        name: 'unit',
        type: 'string',
        description: 'Unidade de medida (hours/days/units)',
        required: false
      },
      {
        name: 'costPerUnit',
        type: 'number',
        description: 'Custo por unidade',
        required: false
      }
    ],
    outputSchema: z.object({
      resourceId: z.string(),
      resourceName: z.string(),
      totalCost: z.any().nullable(),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: { 
      projectId: string;
      resourceType: string;
      resourceName: string;
      quantity?: number;
      unit?: string;
      costPerUnit?: number;
    },
    context: ToolExecutionContext
  ) {
    // SECURITY: Verify project belongs to tenant before allocating resource
    const project = await db.query.projects.findFirst({
      where: and(
        eq(projects.id, input.projectId),
        eq(projects.tenantId, context.tenantId)
      )
    });

    if (!project) {
      throw new Error('Projeto não encontrado ou sem permissão');
    }

    const quantity = input.quantity || 1;
    const totalCost = input.costPerUnit ? (quantity * input.costPerUnit).toString() : null;
    const today = new Date().toISOString().split('T')[0];

    const [newResource] = await db.insert(projectResources).values({
      tenantId: context.tenantId,
      projectId: input.projectId,
      resourceType: input.resourceType,
      resourceName: input.resourceName,
      quantity: quantity.toString(),
      unit: input.unit,
      costPerUnit: input.costPerUnit?.toString(),
      totalCost,
      status: 'Allocated',
      allocationDate: today
    }).returning();

    return {
      resourceId: newResource.id,
      resourceName: newResource.resourceName,
      totalCost: newResource.totalCost,
      message: `Recurso "${newResource.resourceName}" alocado ao projeto com sucesso!`
    };
  }
}
