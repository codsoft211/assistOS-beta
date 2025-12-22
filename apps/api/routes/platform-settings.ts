/**
 * Platform Settings API Routes
 * 
 * Provides endpoints for managing platform-wide configuration settings.
 * Access restricted to platform administrators only.
 */

import { Router } from 'express';
import { 
  getPlatformSetting, 
  getPlatformSettings,
  updatePlatformSetting,
  resetPlatformSetting,
  getSettingsByCategory,
  clearSettingsCache
} from '../../../packages/services/platform-settings';
import { db } from '../db';
import { platformSettings } from '../../../shared/schema';
import { eq } from 'drizzle-orm';
import { requireAuth, requirePlatformAdmin } from '../middleware/auth.middleware';

const router = Router();

/**
 * GET /api/platform-settings
 * Get all platform settings (admin only)
 */
router.get('/', requireAuth, requirePlatformAdmin, async (req, res) => {
  try {
    const settings = await db.select().from(platformSettings);
    
    // Format response
    const formattedSettings = settings.map(setting => {
      const value = setting.value as any;
      let extractedValue: any;
      
      switch (setting.dataType) {
        case 'number':
          extractedValue = value.numericValue;
          break;
        case 'string':
          extractedValue = value.stringValue;
          break;
        case 'boolean':
          extractedValue = value.booleanValue;
          break;
        case 'object':
          extractedValue = value.objectValue;
          break;
        default:
          extractedValue = value;
      }
      
      return {
        id: setting.id,
        settingKey: setting.settingKey,
        category: setting.settingCategory,
        value: extractedValue,
        displayName: setting.displayName,
        description: setting.description,
        dataType: setting.dataType,
        constraints: setting.constraints,
        defaultValue: setting.defaultValue,
        isEditable: setting.isEditable,
        requiresRestart: setting.requiresRestart,
        lastModifiedBy: setting.lastModifiedBy,
        lastModifiedAt: setting.lastModifiedAt,
        updatedAt: setting.updatedAt,
      };
    });
    
    res.json({ settings: formattedSettings });
  } catch (error: any) {
    console.error('[platform-settings] Error fetching all settings:', error);
    res.status(500).json({ 
      error: 'Internal Server Error', 
      message: error.message 
    });
  }
});

/**
 * GET /api/platform-settings/category/:category
 * Get settings by category
 */
router.get('/category/:category', requireAuth, requirePlatformAdmin, async (req, res) => {
  try {
    const { category } = req.params;
    const settings = await getSettingsByCategory(category);
    
    res.json({ 
      category,
      count: settings.length,
      settings 
    });
  } catch (error: any) {
    console.error(`[platform-settings] Error fetching category ${req.params.category}:`, error);
    res.status(500).json({ 
      error: 'Internal Server Error', 
      message: error.message 
    });
  }
});

/**
 * GET /api/platform-settings/:key
 * Get a specific setting
 */
router.get('/:key', requireAuth, requirePlatformAdmin, async (req, res) => {
  try {
    const { key } = req.params;
    
    const [setting] = await db
      .select()
      .from(platformSettings)
      .where(eq(platformSettings.settingKey, key))
      .limit(1);
    
    if (!setting) {
      return res.status(404).json({ 
        error: 'Not Found', 
        message: `Setting '${key}' not found` 
      });
    }
    
    // Extract value based on data type
    const value = setting.value as any;
    let extractedValue: any;
    
    switch (setting.dataType) {
      case 'number':
        extractedValue = value.numericValue;
        break;
      case 'string':
        extractedValue = value.stringValue;
        break;
      case 'boolean':
        extractedValue = value.booleanValue;
        break;
      case 'object':
        extractedValue = value.objectValue;
        break;
      default:
        extractedValue = value;
    }
    
    res.json({
      settingKey: setting.settingKey,
      category: setting.settingCategory,
      value: extractedValue,
      displayName: setting.displayName,
      description: setting.description,
      dataType: setting.dataType,
      constraints: setting.constraints,
      defaultValue: setting.defaultValue,
      isEditable: setting.isEditable,
      requiresRestart: setting.requiresRestart,
      lastModifiedBy: setting.lastModifiedBy,
      lastModifiedAt: setting.lastModifiedAt,
    });
  } catch (error: any) {
    console.error(`[platform-settings] Error fetching setting ${req.params.key}:`, error);
    res.status(500).json({ 
      error: 'Internal Server Error', 
      message: error.message 
    });
  }
});

/**
 * PUT /api/platform-settings/:key
 * Update a setting (admin only)
 */
router.put('/:key', requireAuth, requirePlatformAdmin, async (req, res) => {
  try {
    const { key } = req.params;
    const { value } = req.body;
    
    if (value === undefined) {
      return res.status(400).json({ 
        error: 'Bad Request', 
        message: 'Value is required' 
      });
    }
    
    // Check if setting exists and is editable
    const [setting] = await db
      .select()
      .from(platformSettings)
      .where(eq(platformSettings.settingKey, key))
      .limit(1);
    
    if (!setting) {
      return res.status(404).json({ 
        error: 'Not Found', 
        message: `Setting '${key}' not found` 
      });
    }
    
    if (!setting.isEditable) {
      return res.status(403).json({ 
        error: 'Forbidden', 
        message: `Setting '${key}' is not editable` 
      });
    }
    
    // Update the setting
    // req.user is guaranteed by requireAuth middleware
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized', message: 'User not authenticated' });
    }
    const userId = req.user.id;
    await updatePlatformSetting(key, value, userId);
    
    // Get updated value
    const updatedValue = await getPlatformSetting(key, false); // Skip cache
    
    res.json({
      success: true,
      message: `Setting '${key}' updated successfully`,
      settingKey: key,
      oldValue: (setting.value as any)[`${setting.dataType}Value`],
      newValue: updatedValue,
      requiresRestart: setting.requiresRestart,
    });
  } catch (error: any) {
    console.error(`[platform-settings] Error updating setting ${req.params.key}:`, error);
    res.status(500).json({ 
      error: 'Internal Server Error', 
      message: error.message 
    });
  }
});

/**
 * POST /api/platform-settings/:key/reset
 * Reset a setting to its default value (admin only)
 */
router.post('/:key/reset', requireAuth, requirePlatformAdmin, async (req, res) => {
  try {
    const { key } = req.params;
    
    // Check if setting exists
    const [setting] = await db
      .select()
      .from(platformSettings)
      .where(eq(platformSettings.settingKey, key))
      .limit(1);
    
    if (!setting) {
      return res.status(404).json({ 
        error: 'Not Found', 
        message: `Setting '${key}' not found` 
      });
    }
    
    // Reset to default
    // req.user is guaranteed by requireAuth middleware
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized', message: 'User not authenticated' });
    }
    const userId = req.user.id;
    await resetPlatformSetting(key, userId);
    
    // Get default value
    const defaultValue = (setting.defaultValue as any)[`${setting.dataType}Value`];
    
    res.json({
      success: true,
      message: `Setting '${key}' reset to default value`,
      settingKey: key,
      defaultValue: defaultValue,
    });
  } catch (error: any) {
    console.error(`[platform-settings] Error resetting setting ${req.params.key}:`, error);
    res.status(500).json({ 
      error: 'Internal Server Error', 
      message: error.message 
    });
  }
});

/**
 * POST /api/platform-settings/cache/clear
 * Clear the settings cache (admin only)
 */
router.post('/cache/clear', requireAuth, requirePlatformAdmin, async (req, res) => {
  try {
    clearSettingsCache();
    
    res.json({
      success: true,
      message: 'Settings cache cleared successfully',
    });
  } catch (error: any) {
    console.error('[platform-settings] Error clearing cache:', error);
    res.status(500).json({ 
      error: 'Internal Server Error', 
      message: error.message 
    });
  }
});

export default router;

