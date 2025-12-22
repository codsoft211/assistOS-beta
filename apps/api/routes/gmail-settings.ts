import { Router } from "express";
import { GmailSettingsService } from '../services/gmail-settings.service';
import { gmailSyncSettingsSchema } from '../../../shared/schema';
import { requireRole } from '../middleware/auth.middleware';

const router = Router();

// GET /api/gmail/settings
// Get Gmail sync settings for current tenant (all authenticated users)
router.get("/", async (req: any, res) => {
  if (!req.user || !req.user.activeTenantId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const settings = await GmailSettingsService.getSettings(req.user.activeTenantId);
    res.json(settings);
  } catch (error) {
    console.error('[Gmail Settings] Get error:', error);
    res.status(500).json({ error: "Failed to get Gmail settings" });
  }
});

// POST /api/gmail/settings
// Update Gmail sync settings for current tenant (owner/admin only)
router.post("/", requireRole(['owner', 'admin']), async (req: any, res) => {
  try {
    // Validate request body
    const validatedSettings = gmailSyncSettingsSchema.partial().parse(req.body);
    
    const updatedSettings = await GmailSettingsService.updateSettings(
      req.user.activeTenantId, 
      validatedSettings
    );
    
    res.json(updatedSettings);
  } catch (error: any) {
    console.error('[Gmail Settings] Update error:', error);
    
    if (error.name === 'ZodError') {
      return res.status(400).json({ 
        error: "Invalid settings data", 
        details: error.errors 
      });
    }
    
    res.status(500).json({ error: "Failed to update Gmail settings" });
  }
});

// POST /api/gmail/settings/reset
// Reset Gmail sync settings to defaults (owner/admin only)
router.post("/reset", requireRole(['owner', 'admin']), async (req: any, res) => {
  try {
    const resetSettings = await GmailSettingsService.resetSettings(req.user.activeTenantId);
    res.json(resetSettings);
  } catch (error) {
    console.error('[Gmail Settings] Reset error:', error);
    res.status(500).json({ error: "Failed to reset Gmail settings" });
  }
});

export default router;
