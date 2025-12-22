// Migrated from AssistOS legacy - Phase 4.6
// Budget and quote management routes

import { Router } from "express";
import { db } from "../db";
import { z } from "zod";

const router = Router();

// TODO: Import from schema when budget/quote tables are defined
// TODO: Tables needed: quotes, quote_items, budgets, budget_categories

const createQuoteSchema = z.object({
  clientId: z.string().min(1, "Client ID is required"),
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  validUntil: z.string().optional(), // ISO date
  items: z.array(z.object({
    description: z.string().min(1),
    quantity: z.number().positive(),
    unitPrice: z.number().positive(),
    discount: z.number().min(0).max(100).default(0), // Percentage
    taxRate: z.number().min(0).max(100).default(0), // Percentage
  })),
  notes: z.string().optional(),
  terms: z.string().optional(),
});

const createBudgetSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  period: z.enum(["monthly", "quarterly", "yearly"]),
  startDate: z.string(), // ISO date
  endDate: z.string(), // ISO date
  categories: z.array(z.object({
    name: z.string(),
    allocated: z.number().positive(),
    spent: z.number().default(0),
  })),
});

/**
 * GET /api/budget-quotes/quotes
 * List quotes
 * Query params: ?status=pending&clientId=xxx
 */
router.get("/quotes", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;

    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // TODO: Query quotes table
    // TODO: Support filters: status, client, date range
    // TODO: Calculate totals for each quote
    // TODO: Support pagination

    res.json({
      quotes: [],
      total: 0,
      message: "Quote listing not yet implemented - quote tables pending migration"
    });
  } catch (error: any) {
    console.error("[Budget/Quotes API] Error listing quotes:", error);
    res.status(500).json({ 
      error: "Failed to list quotes",
      details: error.message 
    });
  }
});

/**
 * GET /api/budget-quotes/quotes/:id
 * Get quote details
 */
router.get("/quotes/:id", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const { id } = req.params;

    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // TODO: Fetch quote by ID
    // TODO: Include quote items
    // TODO: Calculate subtotal, tax, total
    // TODO: Include client information

    res.status(404).json({
      error: "Quote not found",
      message: "Quote tables not yet migrated"
    });
  } catch (error: any) {
    console.error("[Budget/Quotes API] Error fetching quote:", error);
    res.status(500).json({ 
      error: "Failed to fetch quote",
      details: error.message 
    });
  }
});

/**
 * POST /api/budget-quotes/quotes
 * Create a new quote
 */
router.post("/quotes", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id || (req.session as any)?.userId;

    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const quoteData = createQuoteSchema.parse(req.body);

    // TODO: Create quote record
    // TODO: Create quote items
    // TODO: Generate quote number
    // TODO: Calculate totals
    // TODO: Send notification to client if configured
    // TODO: Create audit log entry

    res.status(201).json({
      success: false,
      message: "Quote creation not yet implemented - quote tables pending migration"
    });
  } catch (error: any) {
    console.error("[Budget/Quotes API] Error creating quote:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: "Validation error",
        details: error.errors 
      });
    }
    res.status(500).json({ 
      error: "Failed to create quote",
      details: error.message 
    });
  }
});

/**
 * POST /api/budget-quotes/quotes/:id/send
 * Send quote to client via email
 */
router.post("/quotes/:id/send", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id || (req.session as any)?.userId;
    const { id } = req.params;

    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // TODO: Fetch quote
    // TODO: Generate PDF
    // TODO: Send email with quote attachment
    // TODO: Update quote status to "sent"
    // TODO: Create audit log entry

    res.json({
      success: false,
      message: "Quote sending not yet implemented - email service pending migration"
    });
  } catch (error: any) {
    console.error("[Budget/Quotes API] Error sending quote:", error);
    res.status(500).json({ 
      error: "Failed to send quote",
      details: error.message 
    });
  }
});

/**
 * POST /api/budget-quotes/quotes/:id/convert
 * Convert quote to order/invoice
 */
router.post("/quotes/:id/convert", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id || (req.session as any)?.userId;
    const { id } = req.params;

    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { convertTo } = req.body; // "order" or "invoice"

    // TODO: Fetch quote
    // TODO: Create order or invoice from quote
    // TODO: Update quote status to "accepted"
    // TODO: Create audit log entry

    res.json({
      success: false,
      message: "Quote conversion not yet implemented - order/invoice tables pending migration"
    });
  } catch (error: any) {
    console.error("[Budget/Quotes API] Error converting quote:", error);
    res.status(500).json({ 
      error: "Failed to convert quote",
      details: error.message 
    });
  }
});

/**
 * GET /api/budget-quotes/budgets
 * List budgets
 */
router.get("/budgets", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;

    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // TODO: Query budgets table
    // TODO: Include current spending vs allocated
    // TODO: Calculate budget health (on track, over budget, etc.)

    res.json({
      budgets: [],
      message: "Budget listing not yet implemented - budget tables pending migration"
    });
  } catch (error: any) {
    console.error("[Budget/Quotes API] Error listing budgets:", error);
    res.status(500).json({ 
      error: "Failed to list budgets",
      details: error.message 
    });
  }
});

/**
 * POST /api/budget-quotes/budgets
 * Create a new budget
 */
router.post("/budgets", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id || (req.session as any)?.userId;

    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const budgetData = createBudgetSchema.parse(req.body);

    // TODO: Create budget record
    // TODO: Create budget categories
    // TODO: Set up alerts for overspending
    // TODO: Create audit log entry

    res.status(201).json({
      success: false,
      message: "Budget creation not yet implemented - budget tables pending migration"
    });
  } catch (error: any) {
    console.error("[Budget/Quotes API] Error creating budget:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: "Validation error",
        details: error.errors 
      });
    }
    res.status(500).json({ 
      error: "Failed to create budget",
      details: error.message 
    });
  }
});

/**
 * GET /api/budget-quotes/budgets/:id/report
 * Get budget report (actual vs allocated)
 */
router.get("/budgets/:id/report", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const { id } = req.params;

    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // TODO: Fetch budget
    // TODO: Calculate spending by category
    // TODO: Compare against allocated amounts
    // TODO: Identify overspending categories
    // TODO: Calculate budget utilization percentage

    res.json({
      budget: null,
      categories: [],
      utilization: 0,
      message: "Budget reporting not yet implemented - budget tables pending migration"
    });
  } catch (error: any) {
    console.error("[Budget/Quotes API] Error generating report:", error);
    res.status(500).json({ 
      error: "Failed to generate report",
      details: error.message 
    });
  }
});

export default router;
