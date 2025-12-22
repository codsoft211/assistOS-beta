import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { clients } from 'shared/schema';
import { eq, and, or, ilike, sql } from 'drizzle-orm';

export class ImportContactsWorkflowTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'import_contacts_workflow',
    category: 'crm' as const,
    scope: 'tenant' as const,
    description: 'Importa clientes a partir de dados CSV',
    parameters: [
      {
        name: 'csvData',
        type: 'array',
        description: 'Array de objetos com dados dos contactos',
        required: true,
        items: {
          type: 'object',
          properties: {}
        }
      },
      {
        name: 'skipDuplicates',
        type: 'boolean',
        description: 'Saltar duplicados (baseado em email)',
        required: false,
        default: true
      },
      {
        name: 'mapping',
        type: 'object',
        description: 'Mapeamento de campos CSV para campos do sistema',
        required: false,
        default: {}
      }
    ],
    outputSchema: z.object({
      importedCount: z.number(),
      skippedCount: z.number(),
      errors: z.array(z.object({
        row: z.number(),
        error: z.string(),
        data: z.any()
      })),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: { csvData: any[]; skipDuplicates?: boolean; mapping?: any },
    context: ToolExecutionContext
  ) {
    const skipDuplicates = input.skipDuplicates ?? true;
    const mapping = input.mapping || {};

    let importedCount = 0;
    let skippedCount = 0;
    const errors: Array<{ row: number; error: string; data: any }> = [];

    const existingEmails = new Set<string>();

    if (skipDuplicates) {
      const existingClients = await db
        .select({ email: clients.email })
        .from(clients)
        .where(eq(clients.tenantId, context.tenantId));

      for (const client of existingClients) {
        if (client.email) {
          existingEmails.add(client.email.toLowerCase());
        }
      }
    }

    for (let i = 0; i < input.csvData.length; i++) {
      const row = input.csvData[i];
      const rowNumber = i + 1;

      try {
        const mappedData = this.applyMapping(row, mapping);

        if (skipDuplicates && mappedData.email && existingEmails.has(mappedData.email.toLowerCase())) {
          skippedCount++;
          continue;
        }

        await db.insert(clients).values({
          tenantId: context.tenantId,
          name: mappedData.name || null,
          email: mappedData.email || null,
          phone: mappedData.phone || null,
          company: mappedData.company || null,
          nif: mappedData.nif || null,
          otherInfo: mappedData.metadata || {}
        });

        importedCount++;

        if (mappedData.email) {
          existingEmails.add(mappedData.email.toLowerCase());
        }

      } catch (error) {
        errors.push({
          row: rowNumber,
          error: error instanceof Error ? error.message : 'Erro desconhecido',
          data: row
        });
      }
    }

    return {
      importedCount,
      skippedCount,
      errors,
      message: `✅ Importados ${importedCount} contacto(s). ${skippedCount} duplicados ignorados. ${errors.length} erros.`
    };
  }

  private applyMapping(row: any, mapping: any): any {
    const result: any = {};

    const defaultMapping: any = {
      name: 'name',
      email: 'email',
      phone: 'phone',
      position: 'position',
      clientId: 'clientId',
      clientEmail: 'clientEmail'
    };

    const finalMapping = { ...defaultMapping, ...mapping };

    for (const [targetField, sourceField] of Object.entries(finalMapping)) {
      if (row[sourceField as string] !== undefined) {
        result[targetField] = row[sourceField as string];
      }
    }

    return result;
  }
}
