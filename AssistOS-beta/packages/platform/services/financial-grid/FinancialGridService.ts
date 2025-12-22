/**
 * Financial Grid Service
 * 
 * Centralized budgeting, forecasting, and financial planning engine.
 * Cross-module service that aggregates financial data from multiple modules.
 * 
 * Features:
 * - Budget calculation and tracking
 * - Financial forecasting
 * - Cross-module financial aggregation
 * - Pattern-based learning for budget adjustments
 * - Scenario comparison
 */

import { db } from '@api/db';
import {
  financialModels,
  financialScenarios,
  financialCalculations,
  budgets,
  tenants,
} from '@shared/schema';
import { eq, and, desc, sql } from 'drizzle-orm';

export interface CalculationInputs {
  [key: string]: any;
}

export interface CalculationOutputs {
  [key: string]: any;
}

export interface CalculationOptions {
  tenantId: string;
  modelId: string;
  inputs: CalculationInputs;
  userId?: string;
  scenarioId?: string;
  environment?: 'production' | 'sandbox'; // Environment from request context
  units?: {
    currency?: string;
    taxRate?: number;
    locale?: string;
  };
  lineage?: {
    source?: string;
    sourceId?: string;
    fxDate?: string;
    context?: Record<string, any>;
  };
  applyPatterns?: boolean;
}

export interface CalculationResult {
  calculationId: string;
  runId: string;
  outputs: CalculationOutputs;
  patternsApplied?: string[];
  executionTimeMs?: number;
}

export interface ScenarioComparison {
  baseScenario: {
    scenarioId: string;
    results: CalculationOutputs;
  };
  comparisonScenarios: Array<{
    scenarioId: string;
    name: string;
    results: CalculationOutputs;
    differences: Record<string, number>;
  }>;
}

export interface PreferredFormat {
  format: 'table' | 'chart' | 'summary' | 'detailed';
  currency?: string;
  locale?: string;
  precision?: number;
}

/**
 * Financial Grid Service
 * 
 * Provides centralized financial planning and budgeting capabilities
 */
export class FinancialGridService {
  /**
   * Execute a financial calculation using a financial model
   */
  async executeCalculation(options: CalculationOptions): Promise<CalculationResult> {
    const { tenantId, modelId, inputs, userId, scenarioId, environment = 'production', units, lineage, applyPatterns = true } = options;

    // 1. Get financial model
    const model = await db.query.financialModels.findFirst({
      where: and(
        eq(financialModels.id, modelId),
        eq(financialModels.tenantId, tenantId),
        eq(financialModels.isActive, true)
      )
    });

    if (!model) {
      throw new Error(`Financial model ${modelId} not found or inactive`);
    }

    // 2. Generate run ID
    const runId = `calc_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    // 3. Calculate outputs based on model formula
    const outputs = this.calculateOutputs(model.formula, inputs);

    // 4. Apply learned patterns if enabled
    let patternsApplied: string[] = [];
    if (applyPatterns) {
      const patternAdjustments = await this.applyLearnedPatterns(tenantId, modelId, inputs, outputs);
      Object.assign(outputs, patternAdjustments.adjustedOutputs);
      patternsApplied = patternAdjustments.patternsApplied;
    }

    // 5. Generate predicted outcome (for tracking accuracy)
    const predictedOutcome = this.generatePredictedOutcome(outputs, units);

    // 6. Save calculation
    const [calculation] = await db.insert(financialCalculations).values({
      tenantId,
      environment, // Use environment from context
      modelId,
      scenarioId,
      modelVersion: model.version,
      runId,
      inputsHash: this.hashInputs(inputs),
      inputs,
      outputs,
      predictedOutcome,
      units,
      lineage,
      status: 'completed',
      executedBy: userId,
    }).returning();

    return {
      calculationId: calculation.id,
      runId,
      outputs,
      patternsApplied,
      executionTimeMs: calculation.executionTimeMs || undefined,
    };
  }

  /**
   * Explain a financial calculation result
   */
  async explain(calculationId: string, tenantId: string): Promise<string> {
    const calculation = await db.query.financialCalculations.findFirst({
      where: and(
        eq(financialCalculations.id, calculationId),
        eq(financialCalculations.tenantId, tenantId)
      )
    });

    if (!calculation) {
      throw new Error(`Calculation ${calculationId} not found`);
    }

    const model = await db.query.financialModels.findFirst({
      where: eq(financialModels.id, calculation.modelId)
    });

    if (!model) {
      throw new Error(`Model ${calculation.modelId} not found`);
    }

    // Generate explanation based on model and outputs
    const explanation = this.generateExplanation(model, calculation.inputs, calculation.outputs);

    return explanation;
  }

  /**
   * Record actual outcome for a calculation (for learning)
   */
  async recordActualOutcome(
    calculationId: string,
    tenantId: string,
    actualOutcome: CalculationOutputs
  ): Promise<void> {
    const calculation = await db.query.financialCalculations.findFirst({
      where: and(
        eq(financialCalculations.id, calculationId),
        eq(financialCalculations.tenantId, tenantId)
      )
    });

    if (!calculation) {
      throw new Error(`Calculation ${calculationId} not found`);
    }

    // Calculate deviation
    const deviation = this.calculateDeviation(calculation.outputs, actualOutcome);

    // Update calculation with actual outcome and deviation
    await db.update(financialCalculations)
      .set({
        actualOutcome,
        deviation,
      })
      .where(eq(financialCalculations.id, calculationId));

    // Learn from this outcome (update patterns)
    await this.learnFromOutcome(tenantId, calculation.modelId, calculation.inputs, actualOutcome, calculation.outputs);
  }

  /**
   * Compare multiple scenarios
   */
  async compareScenarios(
    tenantId: string,
    baseScenarioId: string,
    comparisonScenarioIds: string[]
  ): Promise<ScenarioComparison> {
    // Get base scenario
    const baseScenario = await db.query.financialScenarios.findFirst({
      where: and(
        eq(financialScenarios.id, baseScenarioId),
        eq(financialScenarios.tenantId, tenantId)
      )
    });

    if (!baseScenario) {
      throw new Error(`Base scenario ${baseScenarioId} not found`);
    }

    // Get base calculation results
    const baseCalculation = await db.query.financialCalculations.findFirst({
      where: and(
        eq(financialCalculations.scenarioId, baseScenarioId),
        eq(financialCalculations.tenantId, tenantId)
      ),
      orderBy: [desc(financialCalculations.executedAt)]
    });

    if (!baseCalculation) {
      throw new Error(`No calculation found for base scenario ${baseScenarioId}`);
    }

    // Get comparison scenarios
    const comparisonScenarios = await Promise.all(
      comparisonScenarioIds.map(async (scenarioId) => {
        const scenario = await db.query.financialScenarios.findFirst({
          where: and(
            eq(financialScenarios.id, scenarioId),
            eq(financialScenarios.tenantId, tenantId)
          )
        });

        if (!scenario) {
          throw new Error(`Scenario ${scenarioId} not found`);
        }

        const calculation = await db.query.financialCalculations.findFirst({
          where: and(
            eq(financialCalculations.scenarioId, scenarioId),
            eq(financialCalculations.tenantId, tenantId)
          ),
          orderBy: [desc(financialCalculations.executedAt)]
        });

        if (!calculation) {
          throw new Error(`No calculation found for scenario ${scenarioId}`);
        }

        // Calculate differences
        const differences = this.calculateDifferences(baseCalculation.outputs, calculation.outputs);

        return {
          scenarioId,
          name: scenario.name,
          results: calculation.outputs,
          differences,
        };
      })
    );

    return {
      baseScenario: {
        scenarioId: baseScenarioId,
        results: baseCalculation.outputs,
      },
      comparisonScenarios,
    };
  }

  /**
   * Get preferred format for displaying financial data
   */
  async getPreferredFormat(
    tenantId: string,
    category: string,
    subcategory: string
  ): Promise<PreferredFormat> {
    // Load from tenant preferences
    try {
      const tenant = await db.query.tenants.findFirst({
        where: eq(tenants.id, tenantId),
        columns: { currency: true, timezone: true }
      });

      // Map timezone to locale (default to en-US if not Portuguese timezone)
      let locale = 'en-US';
      if (tenant?.timezone?.includes('Lisbon') || tenant?.timezone?.includes('Portugal')) {
        locale = 'pt-PT';
      } else if (tenant?.timezone?.includes('Brazil') || tenant?.timezone?.includes('America/Sao_Paulo')) {
        locale = 'pt-BR';
      }

      return {
        format: 'table',
        currency: tenant?.currency || 'EUR',
        locale,
        precision: 2,
      };
    } catch (error) {
      // Fallback to default format
      return {
        format: 'table',
        currency: 'EUR',
        locale: 'en-US',
        precision: 2,
      };
    }
  }

  /**
   * Create a budget
   */
  async createBudget(
    tenantId: string,
    budget: {
      name: string;
      category?: string;
      period: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';
      amount: number;
    },
    userId: string,
    environment: 'production' | 'sandbox' = 'production' // Environment from request context
  ) {
    const [newBudget] = await db.insert(budgets).values({
      tenantId,
      environment, // Use environment from context
      name: budget.name,
      category: budget.category || null,
      period: budget.period,
      amount: budget.amount.toString(),
      createdBy: userId,
    }).returning();

    return newBudget;
  }

  /**
   * Forecast financials for a period
   * 
   * @stub This method is a placeholder. Implementation pending cross-module aggregation.
   * Use BudgetingEngineService.generateForecast() for actual forecasting.
   */
  async forecast(
    tenantId: string,
    period: {
      start: Date;
      end: Date;
    },
    modules?: string[]
  ): Promise<{
    revenue: number;
    costs: number;
    margin: number;
    marginPercentage: number;
    breakdown: Record<string, number>;
  }> {
    // @stub: Aggregate from multiple modules - pending implementation
    // For now, return placeholder
    return {
      revenue: 0,
      costs: 0,
      margin: 0,
      marginPercentage: 0,
      breakdown: {},
    };
  }

  /**
   * @deprecated Use BudgetingEngineService.trackSpending() instead.
   * This method has been removed to avoid duplication.
   * Budgeting Engine provides the full implementation.
   */

  /**
   * Aggregate financials across multiple modules
   */
  async aggregateFinancials(
    tenantId: string,
    modules: string[],
    period?: {
      start: Date;
      end: Date;
    }
  ): Promise<{
    revenue: number;
    costs: number;
    margin: number;
    breakdown: Record<string, {
      revenue: number;
      costs: number;
      margin: number;
    }>;
  }> {
    // TODO: Implement cross-module aggregation
    // For now, return placeholder
    return {
      revenue: 0,
      costs: 0,
      margin: 0,
      breakdown: {},
    };
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  /**
   * Calculate outputs based on model formula
   */
  private calculateOutputs(
    formula: {
      inputs: Array<{ name: string; type: string; required: boolean; default?: any }>;
      operations: Array<{ operation: string; operands: any[]; helpers?: string[] }>;
      outputs: Array<{ name: string; type: string; unit?: string }>;
    },
    inputs: CalculationInputs
  ): CalculationOutputs {
    const outputs: CalculationOutputs = {};
    const context: Record<string, any> = { ...inputs };

    // Execute operations
    for (const op of formula.operations) {
      const result = this.executeOperation(op.operation, op.operands, context);
      if (op.helpers && op.helpers.length > 0) {
        op.helpers.forEach((helper, index) => {
          context[helper] = Array.isArray(result) ? result[index] : result;
        });
      }
    }

    // Extract outputs
    for (const output of formula.outputs) {
      outputs[output.name] = context[output.name] || 0;
    }

    return outputs;
  }

  /**
   * Execute a single operation
   */
  private executeOperation(operation: string, operands: any[], context: Record<string, any>): any {
    // Resolve operands (can be values or variable names)
    const resolved = operands.map(op => {
      if (typeof op === 'string' && context[op] !== undefined) {
        return context[op];
      }
      return op;
    });

    switch (operation) {
      case 'add':
        return resolved.reduce((a, b) => a + b, 0);
      case 'subtract':
        return resolved[0] - resolved.slice(1).reduce((a, b) => a + b, 0);
      case 'multiply':
        return resolved.reduce((a, b) => a * b, 1);
      case 'divide':
        return resolved[0] / resolved.slice(1).reduce((a, b) => a * b, 1);
      case 'sum':
        return resolved.reduce((a, b) => a + b, 0);
      default:
        throw new Error(`Unknown operation: ${operation}`);
    }
  }

  /**
   * Apply learned patterns to adjust outputs
   */
  private async applyLearnedPatterns(
    tenantId: string,
    modelId: string,
    inputs: CalculationInputs,
    outputs: CalculationOutputs
  ): Promise<{
    adjustedOutputs: CalculationOutputs;
    patternsApplied: string[];
  }> {
    // TODO: Implement pattern-based learning
    // For now, return original outputs
    return {
      adjustedOutputs: outputs,
      patternsApplied: [],
    };
  }

  /**
   * Generate predicted outcome
   */
  private generatePredictedOutcome(
    outputs: CalculationOutputs,
    units?: { currency?: string; taxRate?: number; locale?: string }
  ): Record<string, any> {
    return {
      ...outputs,
      currency: units?.currency || 'EUR',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Hash inputs for deduplication
   */
  private hashInputs(inputs: CalculationInputs): string {
    const crypto = require('crypto');
    const inputString = JSON.stringify(inputs);
    return crypto.createHash('sha256').update(inputString).digest('hex');
  }

  /**
   * Generate explanation for calculation
   */
  private generateExplanation(
    model: any,
    inputs: CalculationInputs,
    outputs: CalculationOutputs
  ): string {
    // Generate human-readable explanation
    const explanation = `Calculation using model "${model.name}":\n\n`;
    const inputDesc = Object.entries(inputs)
      .map(([key, value]) => `  ${key}: ${value}`)
      .join('\n');
    const outputDesc = Object.entries(outputs)
      .map(([key, value]) => `  ${key}: ${value}`)
      .join('\n');

    return `${explanation}Inputs:\n${inputDesc}\n\nOutputs:\n${outputDesc}`;
  }

  /**
   * Calculate deviation between predicted and actual
   */
  private calculateDeviation(
    predicted: CalculationOutputs,
    actual: CalculationOutputs
  ): Record<string, any> {
    const deviation: Record<string, any> = {};

    for (const key in predicted) {
      if (actual[key] !== undefined) {
        const diff = actual[key] - predicted[key];
        const percentage = predicted[key] !== 0 ? (diff / predicted[key]) * 100 : 0;
        deviation[key] = {
          absolute: diff,
          percentage,
        };
      }
    }

    return deviation;
  }

  /**
   * Learn from outcome (update patterns)
   */
  private async learnFromOutcome(
    tenantId: string,
    modelId: string,
    inputs: CalculationInputs,
    actualOutcome: CalculationOutputs,
    predictedOutcome: CalculationOutputs
  ): Promise<void> {
    // TODO: Implement pattern learning
    // Store patterns for future use
  }

  /**
   * Calculate differences between two output sets
   */
  private calculateDifferences(
    base: CalculationOutputs,
    comparison: CalculationOutputs
  ): Record<string, number> {
    const differences: Record<string, number> = {};

    for (const key in base) {
      if (comparison[key] !== undefined) {
        differences[key] = comparison[key] - base[key];
      }
    }

    return differences;
  }
}

// Export singleton instance
export const financialGridService = new FinancialGridService();

