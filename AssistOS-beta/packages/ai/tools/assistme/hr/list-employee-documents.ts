import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { employees, documents, documentEntityLinks } from 'shared/schema';
import { eq, and } from 'drizzle-orm';

export class ListEmployeeDocumentsTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'list_employee_documents',
    category: 'hr' as const,
    scope: 'tenant' as const,
    description: 'Lista todos os documentos vinculados a um colaborador (contratos, certificados, políticas)',
    parameters: [
      {
        name: 'employeeId',
        type: 'string',
        description: 'ID do colaborador',
        required: true
      },
      {
        name: 'documentType',
        type: 'string',
        description: 'Tipo de documento (contract, certificate, policy, other)',
        required: false
      }
    ],
    outputSchema: z.object({
      employeeId: z.string(),
      employeeName: z.string(),
      documents: z.array(z.object({
        id: z.string(),
        filename: z.string(),
        documentType: z.string(),
        uploadedAt: z.date(),
        size: z.number()
      })),
      count: z.number(),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: { 
      employeeId: string;
      documentType?: string;
    },
    context: ToolExecutionContext
  ) {
    // 1. Validate employee exists and belongs to tenant
    const employee = await db.query.employees.findFirst({
      where: and(
        eq(employees.id, input.employeeId),
        eq(employees.tenantId, context.tenantId)
      )
    });

    if (!employee) {
      throw new Error('Colaborador não encontrado');
    }

    // 2. Query documentEntityLinks and join with documents
    const linkConditions = [
      eq(documentEntityLinks.entityType, 'employee'),
      eq(documentEntityLinks.entityId, input.employeeId),
      eq(documentEntityLinks.tenantId, context.tenantId)
    ];

    const result = await db
      .select({
        documentId: documentEntityLinks.documentId,
        id: documents.id,
        filename: documents.filename,
        documentType: documents.documentType,
        createdAt: documents.createdAt,
        size: documents.size
      })
      .from(documentEntityLinks)
      .innerJoin(documents, eq(documentEntityLinks.documentId, documents.id))
      .where(and(...linkConditions));

    // 3. Filter by documentType if provided
    let filteredDocs = result;
    
    if (input.documentType) {
      filteredDocs = result.filter(d => d.documentType === input.documentType);
    }

    // 4. Return formatted results
    return {
      employeeId: input.employeeId,
      employeeName: employee.fullName,
      documents: filteredDocs.map(d => ({
        id: d.id,
        filename: d.filename,
        documentType: d.documentType,
        uploadedAt: d.createdAt,
        size: d.size
      })),
      count: filteredDocs.length,
      message: `Encontrados ${filteredDocs.length} documentos para ${employee.fullName}`
    };
  }
}
