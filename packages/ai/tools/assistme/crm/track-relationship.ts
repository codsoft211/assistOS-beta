import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { clients } from 'shared/schema';
import { eq, and, sql } from 'drizzle-orm';

export class TrackRelationshipTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'track_relationship',
    category: 'crm' as const,
    scope: 'tenant' as const,
    description: 'Rastreia relacionamento entre contactos (empresa-mãe, referenciador, etc)',
    parameters: [
      {
        name: 'contactId1',
        type: 'string',
        description: 'ID do primeiro contacto',
        required: true
      },
      {
        name: 'contactId2',
        type: 'string',
        description: 'ID do segundo contacto',
        required: true
      },
      {
        name: 'relationshipType',
        type: 'string',
        description: 'Tipo de relacionamento (parent_company, referrer, partner, colleague)',
        required: true
      },
      {
        name: 'notes',
        type: 'string',
        description: 'Notas sobre o relacionamento',
        required: false
      }
    ],
    outputSchema: z.object({
      relationship: z.object({
        contactId1: z.string(),
        contactId2: z.string(),
        relationshipType: z.string(),
        notes: z.string().nullable(),
        createdAt: z.string()
      }),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  private reverseRelationshipType(type: string): string {
    const reverseMap: Record<string, string> = {
      'parent_company': 'subsidiary',
      'subsidiary': 'parent_company',
      'referrer': 'referred_by',
      'referred_by': 'referrer',
      'partner': 'partner',
      'colleague': 'colleague'
    };
    return reverseMap[type] || type;
  }

  async executeInternal(
    input: { 
      contactId1: string; 
      contactId2: string; 
      relationshipType: string;
      notes?: string;
    },
    context: ToolExecutionContext
  ) {
    const contact1 = await db
      .select()
      .from(clients)
      .where(
        and(
          eq(clients.id, input.contactId1),
          eq(clients.tenantId, context.tenantId)
        )
      )
      .limit(1);

    if (contact1.length === 0) {
      throw new Error(`Cliente ${input.contactId1} não encontrado`);
    }

    const contact2 = await db
      .select()
      .from(clients)
      .where(
        and(
          eq(clients.id, input.contactId2),
          eq(clients.tenantId, context.tenantId)
        )
      )
      .limit(1);

    if (contact2.length === 0) {
      throw new Error(`Cliente ${input.contactId2} não encontrado`);
    }

    const createdAt = new Date().toISOString();

    // Update contact1 with relationship to contact2
    const otherInfo1 = (contact1[0].otherInfo as any) || {};
    const relationships1 = otherInfo1.relationships || [];
    relationships1.push({
      relatedContactId: input.contactId2,
      type: input.relationshipType,
      notes: input.notes || null,
      createdAt
    });

    await db
      .update(clients)
      .set({
        otherInfo: {
          ...otherInfo1,
          relationships: relationships1
        } as any,
        updatedAt: new Date()
      })
      .where(
        and(
          eq(clients.id, input.contactId1),
          eq(clients.tenantId, context.tenantId)
        )
      );

    // Update contact2 with BIDIRECTIONAL relationship to contact1
    const otherInfo2 = (contact2[0].otherInfo as any) || {};
    const relationships2 = otherInfo2.relationships || [];
    relationships2.push({
      relatedContactId: input.contactId1,
      type: this.reverseRelationshipType(input.relationshipType),
      notes: input.notes || null,
      createdAt
    });

    await db
      .update(clients)
      .set({
        otherInfo: {
          ...otherInfo2,
          relationships: relationships2
        } as any,
        updatedAt: new Date()
      })
      .where(
        and(
          eq(clients.id, input.contactId2),
          eq(clients.tenantId, context.tenantId)
        )
      );

    return {
      relationship: {
        contactId1: input.contactId1,
        contactId2: input.contactId2,
        relationshipType: input.relationshipType,
        notes: input.notes || null,
        createdAt
      },
      message: `✅ Relacionamento bidirectional "${input.relationshipType}" criado entre contactos`
    };
  }
}
