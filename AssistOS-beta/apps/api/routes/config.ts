/**
 * Public Configuration API
 * Serves public configuration values to the frontend
 */

import { Router, Request, Response } from "express";

const router = Router();

/**
 * GET /api/config/public
 * Get public configuration values (no authentication required)
 */
router.get("/public", async (req: Request, res: Response) => {
  try {
    // Only expose public/publishable keys, never secret keys
    const config = {
      stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
      environment: process.env.NODE_ENV || 'development',
    };

    res.json(config);
  } catch (error: any) {
    console.error("[Config API] Error:", error);
    res.status(500).json({ 
      error: "Failed to fetch configuration",
      details: error.message 
    });
  }
});

export default router;

