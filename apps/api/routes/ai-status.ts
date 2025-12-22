import { Router } from "express";
import { getOpenAIStatus } from "../services/openai.service";

const router = Router();

router.get("/status", async (req, res) => {
  try {
    const status = getOpenAIStatus();
    res.json(status);
  } catch (error: any) {
    res.status(500).json({ 
      available: false, 
      error: error.message || "Failed to check AI status" 
    });
  }
});

// Studio-specific endpoint - checks OpenAI API (GPT-5 for AssistBuild)
// NOTE: AssistBuild was migrated from Claude to GPT-5 for unified architecture
router.get("/studio-status", async (req, res) => {
  try {
    const status = getOpenAIStatus(); // Reuse same check as AssistME
    res.json(status);
  } catch (error: any) {
    res.status(500).json({ 
      available: false, 
      error: error.message || "Failed to check OpenAI API status" 
    });
  }
});

export default router;
