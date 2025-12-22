import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { warehouses } from 'shared/schema';

export class CreateWarehouseTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'create_warehouse',
    category: 'logistics' as const,
    scope: 'tenant' as const,
    description: 'Cria um novo armazém no sistema',
    parameters: [
      {
        name: 'name',
        type: 'string',
        description: 'Nome do armazém',
        required: true
      },
      {
        name: 'location',
        type: 'string',
        description: 'Localização/morada',
        required: true
      },
      {
        name: 'type',
        type: 'string',
        description: 'Tipo (main/regional/secondary)',
        required: false,
        default: 'regional'
      },
      {
        name: 'capacity',
        type: 'number',
        description: 'Capacidade em m² ou unidades',
        required: false
      }
    ],
    outputSchema: z.object({
      warehouseId: z.string(),
      name: z.string(),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: { 
      name: string;
      location: string;
      type?: string;
      capacity?: number;
    },
    context: ToolExecutionContext
  ) {
    const [warehouse] = await db.insert(warehouses).values({
      tenantId: context.tenantId,
      name: input.name,
      address: input.location,
      type: input.type || 'regional',
      capacity: input.capacity?.toString(),
      isActive: true
    }).returning();
    
    return {
      warehouseId: warehouse.id,
      name: warehouse.name,
      message: `Armazém ${warehouse.name} (${warehouse.id}) criado com sucesso em ${input.location}. Tipo: ${warehouse.type}`
    };
  }
}
