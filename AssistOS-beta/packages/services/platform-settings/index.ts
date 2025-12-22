/**
 * Platform Settings Service
 * 
 * Manages platform-wide configuration settings stored in the database.
 * Provides caching layer for performance.
 */

import { db } from '../../../apps/api/db';
import { platformSettings } from '../../../shared/schema';
import { eq } from 'drizzle-orm';

// In-memory cache with TTL
interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

class PlatformSettingsCache {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private defaultTTL = 5 * 60 * 1000; // 5 minutes

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlMs?: number): void {
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + (ttlMs || this.defaultTTL),
    });
  }

  invalidate(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }
}

const settingsCache = new PlatformSettingsCache();

/**
 * Get a platform setting by key
 * Uses in-memory cache for performance
 */
export async function getPlatformSetting<T = any>(
  settingKey: string,
  useCache: boolean = true
): Promise<T | null> {
  // Check cache first
  if (useCache) {
    const cached = settingsCache.get<T>(settingKey);
    if (cached !== null) {
      return cached;
    }
  }

  try {
    const [setting] = await db
      .select()
      .from(platformSettings)
      .where(eq(platformSettings.settingKey, settingKey))
      .limit(1);

    if (!setting) {
      console.warn(`[platform-settings] Setting not found: ${settingKey}`);
      return null;
    }

    // Extract value based on data type
    let value: any = null;
    const settingValue = setting.value as any;

    switch (setting.dataType) {
      case 'number':
        value = settingValue.numericValue;
        break;
      case 'string':
        value = settingValue.stringValue;
        break;
      case 'boolean':
        value = settingValue.booleanValue;
        break;
      case 'object':
        value = settingValue.objectValue;
        break;
      default:
        value = settingValue;
    }

    // Cache the value
    if (useCache) {
      settingsCache.set(settingKey, value);
    }

    return value as T;
  } catch (error) {
    console.error(`[platform-settings] Error fetching setting ${settingKey}:`, error);
    return null;
  }
}

/**
 * Get multiple platform settings at once
 */
export async function getPlatformSettings(
  settingKeys: string[],
  useCache: boolean = true
): Promise<Record<string, any>> {
  const results: Record<string, any> = {};

  await Promise.all(
    settingKeys.map(async (key) => {
      const value = await getPlatformSetting(key, useCache);
      if (value !== null) {
        results[key] = value;
      }
    })
  );

  return results;
}

/**
 * Update a platform setting
 */
export async function updatePlatformSetting(
  settingKey: string,
  newValue: any,
  modifiedBy?: string
): Promise<void> {
  try {
    // Get current setting to determine data type
    const [currentSetting] = await db
      .select()
      .from(platformSettings)
      .where(eq(platformSettings.settingKey, settingKey))
      .limit(1);

    if (!currentSetting) {
      throw new Error(`Setting not found: ${settingKey}`);
    }

    // Validate constraints
    if (currentSetting.constraints) {
      const constraints = currentSetting.constraints as any;
      
      if (typeof newValue === 'number') {
        if (constraints.min !== undefined && newValue < constraints.min) {
          throw new Error(`Value ${newValue} is below minimum ${constraints.min}`);
        }
        if (constraints.max !== undefined && newValue > constraints.max) {
          throw new Error(`Value ${newValue} is above maximum ${constraints.max}`);
        }
      }
      
      if (constraints.allowedValues && !constraints.allowedValues.includes(newValue)) {
        throw new Error(`Value ${newValue} is not in allowed values`);
      }
    }

    // Format value based on data type
    let formattedValue: any = {};
    switch (currentSetting.dataType) {
      case 'number':
        formattedValue = { numericValue: Number(newValue) };
        break;
      case 'string':
        formattedValue = { stringValue: String(newValue) };
        break;
      case 'boolean':
        formattedValue = { booleanValue: Boolean(newValue) };
        break;
      case 'object':
        formattedValue = { objectValue: newValue };
        break;
    }

    // Update in database
    await db
      .update(platformSettings)
      .set({
        value: formattedValue as any,
        lastModifiedBy: modifiedBy,
        lastModifiedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(platformSettings.settingKey, settingKey));

    // Invalidate cache
    settingsCache.invalidate(settingKey);

    console.info(`[platform-settings] Updated setting: ${settingKey} = ${newValue}`);
  } catch (error) {
    console.error(`[platform-settings] Error updating setting ${settingKey}:`, error);
    throw error;
  }
}

/**
 * Reset a setting to its default value
 */
export async function resetPlatformSetting(
  settingKey: string,
  modifiedBy?: string
): Promise<void> {
  const [setting] = await db
    .select()
    .from(platformSettings)
    .where(eq(platformSettings.settingKey, settingKey))
    .limit(1);

  if (!setting) {
    throw new Error(`Setting not found: ${settingKey}`);
  }

  await db
    .update(platformSettings)
    .set({
      value: setting.defaultValue as any,
      lastModifiedBy: modifiedBy,
      lastModifiedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(platformSettings.settingKey, settingKey));

  settingsCache.invalidate(settingKey);
}

/**
 * Get all settings in a category
 */
export async function getSettingsByCategory(category: string): Promise<any[]> {
  return await db
    .select()
    .from(platformSettings)
    .where(eq(platformSettings.settingCategory, category));
}

/**
 * Clear the entire settings cache
 */
export function clearSettingsCache(): void {
  settingsCache.clear();
  console.info('[platform-settings] Cache cleared');
}

/**
 * Credit-specific helper functions
 */
export async function getCreditMargin(): Promise<number> {
  const margin = await getPlatformSetting<number>('credit_margin');
  return margin ?? 0.70; // Fallback to 70% if not found
}

export async function getCreditPriceEur(): Promise<number> {
  const price = await getPlatformSetting<number>('credit_price_eur');
  return price ?? 0.10; // Fallback to €0.10 if not found
}


/**
 * Calculate cost per credit based on margin and price
 * Formula: CREDIT_PRICE_EUR × (1 - MARGIN)
 * 
 * This is the PRIMARY method - use this instead of getCostPerCreditUsd()
 * Example: €0.10 × (1 - 0.70) = €0.03
 */
export async function calculateCostPerCredit(): Promise<number> {
  const price = await getCreditPriceEur();
  const margin = await getCreditMargin();
  return price * (1 - margin);
}

/**
 * Get cost per credit (calculated from margin)
 * 
 * DEPRECATED: This now calculates from margin instead of reading from DB
 * Use calculateCostPerCredit() for clarity
 */
export async function getCostPerCreditUsd(): Promise<number> {
  return await calculateCostPerCredit();
}

