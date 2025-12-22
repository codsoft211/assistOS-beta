import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { clients } from 'shared/schema';
import { eq, and, or, ilike, sql } from 'drizzle-orm';

export class DeduplicateContactsTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'deduplicate_contacts',
    category: 'crm' as const,
    scope: 'tenant' as const,
    description: 'Encontra contactos duplicados baseado em similaridade de email/telefone/nome',
    parameters: [
      {
        name: 'threshold',
        type: 'number',
        description: 'Limiar de similaridade (0-100%)',
        required: false,
        default: 80
      },
      {
        name: 'autoMerge',
        type: 'boolean',
        description: 'Fundir automaticamente duplicados encontrados',
        required: false,
        default: false
      }
    ],
    outputSchema: z.object({
      duplicates: z.array(z.object({
        groupId: z.string(),
        contacts: z.array(z.object({
          id: z.string(),
          name: z.string().nullable(),
          email: z.string().nullable(),
          phone: z.string().nullable(),
          clientId: z.string().nullable()
        })),
        similarityScore: z.number(),
        matchReason: z.string()
      })),
      totalGroups: z.number(),
      totalDuplicates: z.number(),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: { threshold?: number; autoMerge?: boolean },
    context: ToolExecutionContext
  ) {
    const threshold = input.threshold || 80;

    const allContacts = await db
      .select()
      .from(clients)
      .where(eq(clients.tenantId, context.tenantId));

    const duplicateGroups: Array<{
      groupId: string;
      contacts: any[];
      similarityScore: number;
      matchReason: string;
    }> = [];

    const processed = new Set<string>();

    for (let i = 0; i < allContacts.length; i++) {
      const contact1 = allContacts[i];
      if (processed.has(contact1.id)) continue;

      const group: any[] = [contact1];
      let matchReason = '';
      let similarityScore = 100;

      for (let j = i + 1; j < allContacts.length; j++) {
        const contact2 = allContacts[j];
        if (processed.has(contact2.id)) continue;

        if (contact1.email && contact2.email && contact1.email.toLowerCase() === contact2.email.toLowerCase()) {
          group.push(contact2);
          processed.add(contact2.id);
          matchReason = 'Email idêntico';
          similarityScore = 100;
        } else if (contact1.phone && contact2.phone && this.normalizePhone(contact1.phone) === this.normalizePhone(contact2.phone)) {
          group.push(contact2);
          processed.add(contact2.id);
          matchReason = 'Telefone idêntico';
          similarityScore = 100;
        } else if (contact1.name && contact2.name) {
          const nameSimilarity = this.calculateSimilarity(contact1.name, contact2.name);
          if (nameSimilarity >= threshold) {
            group.push(contact2);
            processed.add(contact2.id);
            matchReason = 'Nome similar';
            similarityScore = nameSimilarity;
          }
        }
      }

      if (group.length > 1) {
        duplicateGroups.push({
          groupId: `dup-${i}`,
          contacts: group.map(c => ({
            id: c.id,
            name: c.name,
            email: c.email,
            phone: c.phone,
            clientId: c.clientId
          })),
          similarityScore,
          matchReason
        });
        processed.add(contact1.id);
      }
    }

    const totalDuplicates = duplicateGroups.reduce((sum, g) => sum + g.contacts.length, 0);

    return {
      duplicates: duplicateGroups,
      totalGroups: duplicateGroups.length,
      totalDuplicates,
      message: `🔍 Encontrados ${duplicateGroups.length} grupos de duplicados (${totalDuplicates} contactos)`
    };
  }

  private normalizePhone(phone: string): string {
    return phone.replace(/\D/g, '');
  }

  private calculateSimilarity(str1: string, str2: string): number {
    const s1 = str1.toLowerCase().trim();
    const s2 = str2.toLowerCase().trim();
    
    if (s1 === s2) return 100;
    
    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;
    
    if (longer.length === 0) return 100;
    
    const distance = this.levenshteinDistance(s1, s2);
    return Math.round(((longer.length - distance) / longer.length) * 100);
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }
}
