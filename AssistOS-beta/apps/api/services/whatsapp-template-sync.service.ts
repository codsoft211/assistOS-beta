/**
 * WhatsApp Template Sync Service
 * Handles synchronization of templates from WhatsApp Business API to local database
 */

import { db } from '../db';
import { whatsappTemplates, whatsappAccounts } from '../../../shared/schema';
import { eq, and } from 'drizzle-orm';
import logger from '../logger';
import { whatsappAPIService } from './whatsapp-api.service';

export interface SyncSummary {
  success: boolean;
  added: number;
  updated: number;
  deleted: number;
  total: number;
  errors: string[];
}

export class WhatsAppTemplateSyncService {
  /**
   * Sync templates from WhatsApp Business API for a specific account
   * @param accountId - WhatsApp account ID
   * @param tenantId - Tenant ID
   * @returns Sync summary with statistics
   */
  async syncTemplates(accountId: string, tenantId: string): Promise<SyncSummary> {
    const summary: SyncSummary = {
      success: false,
      added: 0,
      updated: 0,
      deleted: 0,
      total: 0,
      errors: [],
    };

    try {
      logger.info({ accountId, tenantId }, '[Template Sync] Starting template sync');

      // 1. Fetch WhatsApp account details
      const account = await db.query.whatsappAccounts.findFirst({
        where: and(
          eq(whatsappAccounts.id, accountId),
          eq(whatsappAccounts.tenantId, tenantId)
        ),
      });

      if (!account) {
        throw new Error('WhatsApp account not found');
      }

      if (!account.accessToken) {
        throw new Error('WhatsApp account missing access token');
      }

      if (!account.businessAccountId) {
        throw new Error('WhatsApp account missing business account ID');
      }

      // 2. Fetch templates from WhatsApp API
      const remoteTemplates = await whatsappAPIService.getMessageTemplates(
        account.businessAccountId,
        account.accessToken
      );

      logger.info({ count: remoteTemplates.length }, '[Template Sync] Fetched remote templates');

      // 3. Fetch existing templates from database
      const localTemplates = await db.query.whatsappTemplates.findMany({
        where: and(
          eq(whatsappTemplates.accountId, accountId),
          eq(whatsappTemplates.tenantId, tenantId)
        ),
      });

      const localTemplatesMap = new Map(
        localTemplates.map(t => [`${t.name}_${t.language}`, t])
      );

      // 4. Process each remote template
      const remoteTemplateKeys = new Set<string>();

      for (const remoteTemplate of remoteTemplates) {
        try {
          const templateKey = `${remoteTemplate.name}_${remoteTemplate.language}`;
          remoteTemplateKeys.add(templateKey);

          // Extract variables from template components
          const variables = this.extractVariables(remoteTemplate.components || []);

          const templateData = {
            tenantId,
            accountId,
            name: remoteTemplate.name,
            language: remoteTemplate.language,
            category: remoteTemplate.category || 'UTILITY',
            status: remoteTemplate.status || 'PENDING',
            components: remoteTemplate.components || [],
            waTemplateId: remoteTemplate.id,
            waTemplateStatus: remoteTemplate.status,
            qualityScore: remoteTemplate.quality_score?.score,
            rejectedReason: remoteTemplate.rejected_reason,
          };

          const existingTemplate = localTemplatesMap.get(templateKey);

          if (existingTemplate) {
            // Update existing template
            await db
              .update(whatsappTemplates)
              .set({
                ...templateData,
                updatedAt: new Date(),
              })
              .where(eq(whatsappTemplates.id, existingTemplate.id));

            summary.updated++;
            logger.info({ name: remoteTemplate.name }, '[Template Sync] Updated template');
          } else {
            // Insert new template
            await db.insert(whatsappTemplates).values(templateData);

            summary.added++;
            logger.info({ name: remoteTemplate.name }, '[Template Sync] Added new template');
          }

          summary.total++;
        } catch (error: any) {
          logger.error({ error, template: remoteTemplate.name }, '[Template Sync] Error processing template');
          summary.errors.push(`Failed to process template ${remoteTemplate.name}: ${error.message}`);
        }
      }

      // 5. Mark deleted templates (templates that exist locally but not in remote)
      for (const [key, localTemplate] of localTemplatesMap.entries()) {
        if (!remoteTemplateKeys.has(key)) {
          try {
            // Soft delete by updating status to DELETED
            await db
              .update(whatsappTemplates)
              .set({
                status: 'DELETED',
                updatedAt: new Date(),
              })
              .where(eq(whatsappTemplates.id, localTemplate.id));

            summary.deleted++;
            logger.info({ name: localTemplate.name }, '[Template Sync] Marked template as deleted');
          } catch (error: any) {
            logger.error({ error, template: localTemplate.name }, '[Template Sync] Error marking template as deleted');
            summary.errors.push(`Failed to mark template ${localTemplate.name} as deleted: ${error.message}`);
          }
        }
      }

      // 6. Update account last sync timestamp
      await db
        .update(whatsappAccounts)
        .set({ lastSyncAt: new Date() })
        .where(eq(whatsappAccounts.id, accountId));

      summary.success = summary.errors.length === 0;

      logger.info({ summary }, '[Template Sync] Sync completed');

      return summary;
    } catch (error: any) {
      logger.error({ error, accountId, tenantId }, '[Template Sync] Sync failed');
      summary.errors.push(error.message);
      return summary;
    }
  }

  /**
   * Extract variables from template components
   * Variables are placeholders in the format {{1}}, {{2}}, etc.
   */
  private extractVariables(components: any[]): string[] {
    const variables: string[] = [];

    for (const component of components) {
      if (component.type === 'BODY' && component.text) {
        // Extract {{1}}, {{2}}, etc. from body text
        const matches = component.text.match(/\{\{(\d+)\}\}/g);
        if (matches) {
          variables.push(...matches);
        }
      }

      if (component.type === 'HEADER' && component.text) {
        // Extract variables from header text
        const matches = component.text.match(/\{\{(\d+)\}\}/g);
        if (matches) {
          variables.push(...matches);
        }
      }
    }

    // Remove duplicates and sort
    return [...new Set(variables)].sort();
  }
}

export const whatsappTemplateSyncService = new WhatsAppTemplateSyncService();
