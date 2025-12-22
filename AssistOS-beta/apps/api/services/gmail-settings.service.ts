import { db } from '../db';
import { tenants } from '../../../shared/schema';
import { eq } from 'drizzle-orm';
import { 
  GmailSyncSettings, 
  gmailSyncSettingsSchema, 
  defaultGmailSettings 
} from '../../../shared/schema';

/**
 * GmailSettingsService
 * 
 * Manages Gmail sync configuration for tenants.
 * Settings are stored in tenant.settings JSONB field under 'gmailSync' key.
 * 
 * FASE 3: Gmail Integration UI & Settings
 */

export class GmailSettingsService {
  /**
   * Get Gmail sync settings for a tenant
   * Returns default settings if none are configured
   */
  static async getSettings(tenantId: string): Promise<GmailSyncSettings> {
    const tenant = await db.query.tenants.findFirst({
      where: eq(tenants.id, tenantId),
    });

    if (!tenant) {
      throw new Error(`Tenant ${tenantId} not found`);
    }

    // Extract gmailSync from settings JSONB
    const settings = tenant.settings as any;
    const gmailSync = settings?.gmailSync;

    if (!gmailSync) {
      return defaultGmailSettings;
    }

    // Validate and return
    try {
      return gmailSyncSettingsSchema.parse(gmailSync);
    } catch (error) {
      console.error('[GmailSettings] Invalid settings in database, returning defaults:', error);
      return defaultGmailSettings;
    }
  }

  /**
   * Update Gmail sync settings for a tenant
   * Validates settings before saving
   */
  static async updateSettings(
    tenantId: string, 
    newSettings: Partial<GmailSyncSettings>
  ): Promise<GmailSyncSettings> {
    // Get current settings
    const currentSettings = await this.getSettings(tenantId);

    // Merge with new settings
    const mergedSettings = {
      ...currentSettings,
      ...newSettings,
    };

    // Validate merged settings
    const validatedSettings = gmailSyncSettingsSchema.parse(mergedSettings);

    // Get current tenant settings
    const tenant = await db.query.tenants.findFirst({
      where: eq(tenants.id, tenantId),
    });

    if (!tenant) {
      throw new Error(`Tenant ${tenantId} not found`);
    }

    const currentTenantSettings = (tenant.settings as any) || {};

    // Update tenant.settings JSONB
    await db
      .update(tenants)
      .set({
        settings: {
          ...currentTenantSettings,
          gmailSync: validatedSettings,
        },
        updatedAt: new Date(),
      })
      .where(eq(tenants.id, tenantId));

    console.log(`[GmailSettings] Updated settings for tenant ${tenantId}:`, validatedSettings);

    return validatedSettings;
  }

  /**
   * Reset Gmail sync settings to defaults
   */
  static async resetSettings(tenantId: string): Promise<GmailSyncSettings> {
    return this.updateSettings(tenantId, defaultGmailSettings);
  }

  /**
   * Add a classification rule
   */
  static async addClassificationRule(
    tenantId: string,
    rule: GmailSyncSettings['classificationRules'][number]
  ): Promise<GmailSyncSettings> {
    const settings = await this.getSettings(tenantId);
    
    const updatedSettings = {
      ...settings,
      classificationRules: [...settings.classificationRules, rule],
    };

    return this.updateSettings(tenantId, updatedSettings);
  }

  /**
   * Remove a classification rule
   */
  static async removeClassificationRule(
    tenantId: string,
    ruleId: string
  ): Promise<GmailSyncSettings> {
    const settings = await this.getSettings(tenantId);
    
    const updatedSettings = {
      ...settings,
      classificationRules: settings.classificationRules.filter(r => r.id !== ruleId),
    };

    return this.updateSettings(tenantId, updatedSettings);
  }

  /**
   * Update a classification rule
   */
  static async updateClassificationRule(
    tenantId: string,
    ruleId: string,
    updates: Partial<GmailSyncSettings['classificationRules'][number]>
  ): Promise<GmailSyncSettings> {
    const settings = await this.getSettings(tenantId);
    
    const updatedSettings = {
      ...settings,
      classificationRules: settings.classificationRules.map(r => 
        r.id === ruleId ? { ...r, ...updates } : r
      ),
    };

    return this.updateSettings(tenantId, updatedSettings);
  }

  /**
   * Update lastSyncAt to current timestamp
   * FASE 3.8: Called by cron service after successful sync
   */
  static async updateLastSyncAt(tenantId: string): Promise<void> {
    const settings = await this.getSettings(tenantId);
    
    await this.updateSettings(tenantId, {
      ...settings,
      lastSyncAt: new Date(),
    });

    console.log(`[GmailSettings] Updated lastSyncAt for tenant ${tenantId}`);
  }
}
