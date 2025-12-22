import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { clients, commercialActivities, opportunities } from 'shared/schema';
import { eq, and, inArray, sql, count, desc } from 'drizzle-orm';

export class ScoreContactsTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'score_contacts',
    category: 'crm' as const,
    scope: 'tenant' as const,
    description: 'Pontua contactos baseado em engagement (contagem de atividades, último contacto, valor de negócios)',
    parameters: [
      {
        name: 'contactIds',
        type: 'array',
        description: 'Array de IDs dos contactos (vazio = todos)',
        required: false
      },
      {
        name: 'scoringCriteria',
        type: 'object',
        description: 'Critérios de pontuação customizados',
        required: false,
        default: {}
      }
    ],
    outputSchema: z.object({
      scores: z.array(z.object({
        contactId: z.string(),
        contactName: z.string().nullable(),
        score: z.number(),
        factors: z.object({
          activityCount: z.number(),
          recentActivity: z.boolean(),
          opportunityValue: z.number(),
          engagementLevel: z.string()
        })
      })),
      averageScore: z.number(),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: { contactIds?: string[]; scoringCriteria?: any },
    context: ToolExecutionContext
  ) {
    const criteria = input.scoringCriteria || {
      activityWeight: 30,
      recencyWeight: 40,
      opportunityWeight: 30
    };

    let contactsToScore;

    if (input.contactIds && input.contactIds.length > 0) {
      contactsToScore = await db
        .select()
        .from(clients)
        .where(
          and(
            eq(clients.tenantId, context.tenantId),
            inArray(clients.id, input.contactIds)
          )
        );
    } else {
      contactsToScore = await db
        .select()
        .from(clients)
        .where(eq(clients.tenantId, context.tenantId))
        .limit(100);
    }

    const scores = [];
    let totalScore = 0;

    for (const contact of contactsToScore) {

      const activityCount = await db
        .select({ count: count() })
        .from(commercialActivities)
        .where(
          and(
            eq(commercialActivities.tenantId, context.tenantId),
            eq(commercialActivities.clientId, contact.id)
          )
        );

      const recentActivities = await db
        .select()
        .from(commercialActivities)
        .where(
          and(
            eq(commercialActivities.tenantId, context.tenantId),
            eq(commercialActivities.clientId, contact.id)
          )
        )
        .orderBy(desc(commercialActivities.createdAt))
        .limit(1);

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const recentActivity = recentActivities.length > 0 && 
                            recentActivities[0].createdAt > thirtyDaysAgo;

      const opps = await db
        .select()
        .from(opportunities)
        .where(
          and(
            eq(opportunities.tenantId, context.tenantId),
            eq(opportunities.clientId, contact.id)
          )
        );

      const totalOppValue = opps.reduce((sum, opp) => {
        const value = typeof opp.estimatedValue === 'string' ? parseFloat(opp.estimatedValue) : (opp.estimatedValue || 0);
        return sum + value;
      }, 0);

      const activityScore = Math.min((activityCount[0]?.count || 0) * 5, criteria.activityWeight);
      const recencyScore = recentActivity ? criteria.recencyWeight : 0;
      const opportunityScore = Math.min(totalOppValue / 1000, criteria.opportunityWeight);

      const finalScore = Math.round(activityScore + recencyScore + opportunityScore);

      let engagementLevel = 'baixo';
      if (finalScore >= 70) engagementLevel = 'alto';
      else if (finalScore >= 40) engagementLevel = 'médio';

      scores.push({
        contactId: contact.id,
        contactName: contact.name,
        score: finalScore,
        factors: {
          activityCount: activityCount[0]?.count || 0,
          recentActivity,
          opportunityValue: totalOppValue,
          engagementLevel
        }
      });

      totalScore += finalScore;
    }

    scores.sort((a, b) => b.score - a.score);

    const averageScore = scores.length > 0 ? Math.round(totalScore / scores.length) : 0;

    return {
      scores,
      averageScore,
      message: `📊 ${scores.length} contacto(s) pontuados. Pontuação média: ${averageScore}`
    };
  }
}
