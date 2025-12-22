/**
 * Financial Grid API Routes
 * 
 * Provides endpoints for financial planning, budgeting, and forecasting
 */

import { Router } from 'express';
import { z } from 'zod';
import { fromZodError } from 'zod-validation-error';
import { requireAuth } from '../middleware/auth.middleware';
import { hardTenantGuard } from '../middleware/hard-tenant-guard';
import { financialGridService } from '../../../packages/platform/services/financial-grid';
import { budgetingEngineService } from '../../../packages/platform/services/budgeting-engine';

const router = Router();

// All routes require authentication and tenant context
router.use(requireAuth);
router.use(hardTenantGuard);

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const calculateSchema = z.object({
  modelId: z.string().min(1, 'Model ID is required'),
  inputs: z.record(z.any()),
  scenarioId: z.string().optional(),
  units: z.object({
    currency: z.string().optional(),
    taxRate: z.number().optional(),
    locale: z.string().optional(),
  }).optional(),
  lineage: z.object({
    source: z.string().optional(),
    sourceId: z.string().optional(),
    fxDate: z.string().optional(),
    context: z.record(z.any()).optional(),
  }).optional(),
  applyPatterns: z.boolean().optional(),
});

const createBudgetSchema = z.object({
  name: z.string().min(1, 'Budget name is required'),
  category: z.string().optional(),
  period: z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'yearly']),
  amount: z.number().positive('Amount must be positive'),
});

const compareScenariosSchema = z.object({
  baseScenarioId: z.string().min(1, 'Base scenario ID is required'),
  comparisonScenarioIds: z.array(z.string()).min(1, 'At least one comparison scenario is required'),
});

const recordOutcomeSchema = z.object({
  actualOutcome: z.record(z.any()),
});

/**
 * POST /api/financial-grid/calculate
 * Execute a financial calculation
 */
router.post('/calculate', async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id || (req.session as any)?.userId;
    const environment = (req as any).environment || 'production';

    // Validate request body
    const validated = calculateSchema.parse(req.body);

    const result = await financialGridService.executeCalculation({
      tenantId,
      modelId: validated.modelId,
      inputs: validated.inputs,
      userId,
      environment,
      scenarioId: validated.scenarioId,
      units: validated.units,
      lineage: validated.lineage,
      applyPatterns: validated.applyPatterns !== false,
    });

    res.json(result);
  } catch (error: any) {
    console.error('[Financial Grid] Error executing calculation:', error);
    if (error.name === 'ZodError') {
      return res.status(400).json({ 
        error: 'Invalid request data', 
        details: fromZodError(error).message 
      });
    }
    res.status(500).json({ error: error.message || 'Failed to execute calculation' });
  }
});

/**
 * GET /api/financial-grid/calculations/:id/explain
 * Get explanation for a calculation
 */
router.get('/calculations/:id/explain', async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const explanation = await financialGridService.explain(req.params.id, tenantId);
    res.json({ explanation });
  } catch (error: any) {
    console.error('[Financial Grid] Error explaining calculation:', error);
    res.status(500).json({ error: error.message || 'Failed to explain calculation' });
  }
});

/**
 * POST /api/financial-grid/calculations/:id/record-outcome
 * Record actual outcome for learning
 */
router.post('/calculations/:id/record-outcome', async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    
    // Validate request body
    const validated = recordOutcomeSchema.parse(req.body);
    
    await financialGridService.recordActualOutcome(
      req.params.id,
      tenantId,
      validated.actualOutcome
    );
    res.json({ success: true });
  } catch (error: any) {
    console.error('[Financial Grid] Error recording outcome:', error);
    if (error.name === 'ZodError') {
      return res.status(400).json({ 
        error: 'Invalid request data', 
        details: fromZodError(error).message 
      });
    }
    res.status(500).json({ error: error.message || 'Failed to record outcome' });
  }
});

/**
 * POST /api/financial-grid/scenarios/compare
 * Compare multiple scenarios
 */
router.post('/scenarios/compare', async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    
    // Validate request body
    const validated = compareScenariosSchema.parse(req.body);
    
    const comparison = await financialGridService.compareScenarios(
      tenantId,
      validated.baseScenarioId,
      validated.comparisonScenarioIds
    );
    res.json(comparison);
  } catch (error: any) {
    console.error('[Financial Grid] Error comparing scenarios:', error);
    if (error.name === 'ZodError') {
      return res.status(400).json({ 
        error: 'Invalid request data', 
        details: fromZodError(error).message 
      });
    }
    res.status(500).json({ error: error.message || 'Failed to compare scenarios' });
  }
});

/**
 * POST /api/financial-grid/budgets
 * Create a budget
 */
router.post('/budgets', async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id || (req.session as any)?.userId;
    const environment = (req as any).environment || 'production';

    // Validate request body
    const validated = createBudgetSchema.parse(req.body);

    const budget = await financialGridService.createBudget(
      tenantId,
      validated,
      userId,
      environment
    );

    res.status(201).json(budget);
  } catch (error: any) {
    console.error('[Financial Grid] Error creating budget:', error);
    if (error.name === 'ZodError') {
      return res.status(400).json({ 
        error: 'Invalid request data', 
        details: fromZodError(error).message 
      });
    }
    res.status(500).json({ error: error.message || 'Failed to create budget' });
  }
});

/**
 * GET /api/financial-grid/forecast
 * Get financial forecast
 */
router.get('/forecast', async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const start = req.query.start ? new Date(req.query.start as string) : new Date();
    const end = req.query.end ? new Date(req.query.end as string) : new Date();
    const modules = req.query.modules ? (req.query.modules as string).split(',') : undefined;

    const forecast = await financialGridService.forecast(
      tenantId,
      { start, end },
      modules
    );

    res.json(forecast);
  } catch (error: any) {
    console.error('[Financial Grid] Error getting forecast:', error);
    res.status(500).json({ error: error.message || 'Failed to get forecast' });
  }
});

/**
 * GET /api/financial-grid/spending
 * Track spending against budgets
 * 
 * @note This endpoint uses BudgetingEngineService.trackSpending() for the actual implementation.
 */
router.get('/spending', async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const start = req.query.start ? new Date(req.query.start as string) : undefined;
    const end = req.query.end ? new Date(req.query.end as string) : undefined;

    const spending = await budgetingEngineService.trackSpending(
      tenantId,
      start && end ? { start, end } : undefined
    );

    res.json(spending);
  } catch (error: any) {
    console.error('[Financial Grid] Error tracking spending:', error);
    res.status(500).json({ error: error.message || 'Failed to track spending' });
  }
});

/**
 * POST /api/financial-grid/aggregate
 * Aggregate financials across modules
 */
router.post('/aggregate', async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const start = req.body.start ? new Date(req.body.start) : undefined;
    const end = req.body.end ? new Date(req.body.end) : undefined;

    const aggregated = await financialGridService.aggregateFinancials(
      tenantId,
      req.body.modules || [],
      start && end ? { start, end } : undefined
    );

    res.json(aggregated);
  } catch (error: any) {
    console.error('[Financial Grid] Error aggregating financials:', error);
    res.status(500).json({ error: error.message || 'Failed to aggregate financials' });
  }
});

export default router;

