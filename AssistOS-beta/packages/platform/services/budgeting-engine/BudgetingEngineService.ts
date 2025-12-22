/**
 * Budgeting Engine Service
 * 
 * Multi-dimensional budgeting and forecasting service.
 * Extends Financial Grid with advanced allocation and forecasting capabilities.
 * 
 * Features:
 * - Multi-dimensional budget allocation (department, project, category, period)
 * - Rolling forecasts
 * - Variance analysis
 * - Budget vs Actual tracking
 * - Scenario planning
 */

import { db } from '@api/db';
import { budgets, invoices } from '@shared/schema';
import { eq, and, gte, lte, sql, sum, desc } from 'drizzle-orm';
import { financialGridService } from '../financial-grid';

export interface BudgetAllocation {
  dimension: 'department' | 'project' | 'category' | 'cost_center';
  dimensionValue: string;
  amount: number;
  period: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  startDate: Date;
  endDate?: Date;
}

export interface BudgetForecast {
  period: {
    start: Date;
    end: Date;
  };
  forecastedRevenue: number;
  forecastedCosts: number;
  forecastedMargin: number;
  confidence: 'low' | 'medium' | 'high';
  assumptions: string[];
}

export interface VarianceAnalysis {
  budgetId: string;
  period: {
    start: Date;
    end: Date;
  };
  budgeted: number;
  actual: number;
  variance: number;
  variancePercentage: number;
  status: 'on_track' | 'warning' | 'exceeded';
  breakdown: Array<{
    dimension: string;
    dimensionValue: string;
    budgeted: number;
    actual: number;
    variance: number;
  }>;
}

export interface ScenarioPlan {
  scenarioId: string;
  name: string;
  description: string;
  assumptions: Record<string, any>;
  budgets: Array<{
    dimension: string;
    dimensionValue: string;
    amount: number;
  }>;
  forecast: BudgetForecast;
}

/**
 * Budgeting Engine Service
 * 
 * Provides advanced budgeting and forecasting capabilities
 */
export class BudgetingEngineService {
  /**
   * Create multi-dimensional budget allocation
   */
  async allocateBudget(
    tenantId: string,
    allocations: BudgetAllocation[],
    userId: string
  ): Promise<{
    budgets: Array<{ id: string; allocation: BudgetAllocation }>;
  }> {
    const createdBudgets = [];

    for (const allocation of allocations) {
      const budget = await financialGridService.createBudget(
        tenantId,
        {
          name: `${allocation.dimension}: ${allocation.dimensionValue} - ${allocation.period}`,
          category: `${allocation.dimension}:${allocation.dimensionValue}`,
          period: allocation.period,
          amount: allocation.amount,
        },
        userId
      );

      createdBudgets.push({
        id: budget.id,
        allocation,
      });
    }

    return { budgets: createdBudgets };
  }

  /**
   * Generate rolling forecast
   */
  async generateForecast(
    tenantId: string,
    period: {
      start: Date;
      end: Date;
    },
    lookbackMonths: number = 12,
    modules?: string[]
  ): Promise<BudgetForecast> {
    // 1. Get historical data
    const historical = await this.getHistoricalData(
      tenantId,
      period.start,
      lookbackMonths,
      modules
    );

    // 2. Calculate trends
    const trends = this.calculateTrends(historical);

    // 3. Generate forecast
    const forecast = this.projectForecast(trends, period);

    return forecast;
  }

  /**
   * Analyze variance between budget and actual
   */
  async analyzeVariance(
    tenantId: string,
    budgetId: string,
    period: {
      start: Date;
      end: Date;
    }
  ): Promise<VarianceAnalysis> {
    // 1. Get budget
    const budget = await db.query.budgets.findFirst({
      where: and(
        eq(budgets.id, budgetId),
        eq(budgets.tenantId, tenantId)
      )
    });

    if (!budget) {
      throw new Error(`Budget ${budgetId} not found`);
    }

    // 2. Get actual spending
    const actual = await this.getActualSpending(
      tenantId,
      budget.category || '',
      period
    );

    // 3. Calculate variance
    const budgeted = parseFloat(budget.amount);
    const variance = actual - budgeted;
    const variancePercentage = budgeted !== 0 ? (variance / budgeted) * 100 : 0;

    // 4. Determine status
    let status: 'on_track' | 'warning' | 'exceeded';
    if (variancePercentage > 10) {
      status = 'exceeded';
    } else if (variancePercentage > 5) {
      status = 'warning';
    } else {
      status = 'on_track';
    }

    // 5. Get breakdown by dimension
    const breakdown = await this.getVarianceBreakdown(
      tenantId,
      budget.category || '',
      period
    );

    return {
      budgetId,
      period,
      budgeted,
      actual,
      variance,
      variancePercentage,
      status,
      breakdown,
    };
  }

  /**
   * Create scenario plan
   */
  async createScenario(
    tenantId: string,
    scenario: {
      name: string;
      description: string;
      assumptions: Record<string, any>;
      budgets: Array<{
        dimension: string;
        dimensionValue: string;
        amount: number;
      }>;
    },
    userId: string
  ): Promise<ScenarioPlan> {
    // 1. Generate forecast for scenario
    const forecast = await this.generateForecast(
      tenantId,
      {
        start: new Date(),
        end: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
      }
    );

    // 2. Create scenario plan
    const scenarioPlan: ScenarioPlan = {
      scenarioId: `scenario_${Date.now()}`,
      name: scenario.name,
      description: scenario.description,
      assumptions: scenario.assumptions,
      budgets: scenario.budgets,
      forecast,
    };

    // TODO: Save scenario to database

    return scenarioPlan;
  }

  /**
   * Compare multiple scenarios
   */
  async compareScenarios(
    tenantId: string,
    scenarioIds: string[]
  ): Promise<{
    scenarios: Array<{
      scenarioId: string;
      name: string;
      forecast: BudgetForecast;
      keyMetrics: {
        totalRevenue: number;
        totalCosts: number;
        margin: number;
        marginPercentage: number;
      };
    }>;
    recommendations: string[];
  }> {
    const scenarios = [];

    for (const scenarioId of scenarioIds) {
      // TODO: Load scenario from database
      // For now, generate placeholder
      const forecast = await this.generateForecast(
        tenantId,
        {
          start: new Date(),
          end: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        }
      );

      scenarios.push({
        scenarioId,
        name: `Scenario ${scenarioId}`,
        forecast,
        keyMetrics: {
          totalRevenue: forecast.forecastedRevenue,
          totalCosts: forecast.forecastedCosts,
          margin: forecast.forecastedMargin,
          marginPercentage: forecast.forecastedRevenue !== 0
            ? (forecast.forecastedMargin / forecast.forecastedRevenue) * 100
            : 0,
        },
      });
    }

    // Generate recommendations
    const recommendations = this.generateRecommendations(scenarios);

    return {
      scenarios,
      recommendations,
    };
  }

  /**
   * Track spending against budgets
   */
  async trackSpending(
    tenantId: string,
    period?: {
      start: Date;
      end: Date;
    }
  ): Promise<{
    budgets: Array<{
      id: string;
      name: string;
      category: string;
      allocated: number;
      spent: number;
      remaining: number;
      percentageUsed: number;
      status: 'on_track' | 'warning' | 'exceeded';
    }>;
    totalAllocated: number;
    totalSpent: number;
    totalRemaining: number;
  }> {
    // Get all budgets for tenant
    const allBudgets = await db.query.budgets.findMany({
      where: eq(budgets.tenantId, tenantId),
      orderBy: [desc(budgets.createdAt)],
    });

    const budgetTracking = [];

    for (const budget of allBudgets) {
      const allocated = parseFloat(budget.amount);
      const spent = parseFloat(budget.spent || '0');
      const remaining = allocated - spent;
      const percentageUsed = allocated !== 0 ? (spent / allocated) * 100 : 0;

      let status: 'on_track' | 'warning' | 'exceeded';
      if (percentageUsed > 100) {
        status = 'exceeded';
      } else if (percentageUsed > 80) {
        status = 'warning';
      } else {
        status = 'on_track';
      }

      budgetTracking.push({
        id: budget.id,
        name: budget.name,
        category: budget.category || '',
        allocated,
        spent,
        remaining,
        percentageUsed,
        status,
      });
    }

    const totalAllocated = budgetTracking.reduce((sum, b) => sum + b.allocated, 0);
    const totalSpent = budgetTracking.reduce((sum, b) => sum + b.spent, 0);
    const totalRemaining = totalAllocated - totalSpent;

    return {
      budgets: budgetTracking,
      totalAllocated,
      totalSpent,
      totalRemaining,
    };
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  /**
   * Get historical financial data from invoices
   * 
   * @stub Basic implementation using invoices table. Full cross-module aggregation pending.
   */
  private async getHistoricalData(
    tenantId: string,
    startDate: Date,
    lookbackMonths: number,
    modules?: string[]
  ): Promise<Array<{
    period: Date;
    revenue: number;
    costs: number;
  }>> {
    // Calculate end date (now)
    const endDate = new Date();
    const historicalData: Array<{ period: Date; revenue: number; costs: number }> = [];

    // Get revenue from receivable invoices
    const receivableInvoices = await db
      .select({
        issueDate: invoices.issueDate,
        totalAmount: invoices.totalAmount,
      })
      .from(invoices)
      .where(
        and(
          eq(invoices.tenantId, tenantId),
          eq(invoices.invoiceType, 'receivable'),
          gte(invoices.issueDate, startDate),
          lte(invoices.issueDate, endDate)
        )
      );

    // Get costs from payable invoices
    const payableInvoices = await db
      .select({
        issueDate: invoices.issueDate,
        totalAmount: invoices.totalAmount,
      })
      .from(invoices)
      .where(
        and(
          eq(invoices.tenantId, tenantId),
          eq(invoices.invoiceType, 'payable'),
          gte(invoices.issueDate, startDate),
          lte(invoices.issueDate, endDate)
        )
      );

    // Group by month
    const monthlyData: Record<string, { revenue: number; costs: number }> = {};

    receivableInvoices.forEach(inv => {
      const monthKey = `${inv.issueDate?.getFullYear()}-${String(inv.issueDate?.getMonth() || 0).padStart(2, '0')}`;
      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = { revenue: 0, costs: 0 };
      }
      monthlyData[monthKey].revenue += parseFloat(inv.totalAmount?.toString() || '0');
    });

    payableInvoices.forEach(inv => {
      const monthKey = `${inv.issueDate?.getFullYear()}-${String(inv.issueDate?.getMonth() || 0).padStart(2, '0')}`;
      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = { revenue: 0, costs: 0 };
      }
      monthlyData[monthKey].costs += parseFloat(inv.totalAmount?.toString() || '0');
    });

    // Convert to array
    Object.entries(monthlyData).forEach(([monthKey, data]) => {
      const [year, month] = monthKey.split('-');
      historicalData.push({
        period: new Date(parseInt(year), parseInt(month) - 1, 1),
        revenue: data.revenue,
        costs: data.costs,
      });
    });

    return historicalData.sort((a, b) => a.period.getTime() - b.period.getTime());
  }

  /**
   * Calculate trends from historical data
   * 
   * Calculates average percentage change per period and basic seasonality.
   */
  private calculateTrends(
    historical: Array<{ period: Date; revenue: number; costs: number }>
  ): {
    revenueTrend: number; // percentage change per period
    costTrend: number; // percentage change per period
    seasonality: Record<string, number>; // seasonal adjustments
  } {
    if (historical.length < 2) {
      return {
        revenueTrend: 0,
        costTrend: 0,
        seasonality: {},
      };
    }

    // Calculate average percentage change
    let revenueChanges: number[] = [];
    let costChanges: number[] = [];

    for (let i = 1; i < historical.length; i++) {
      const prev = historical[i - 1];
      const curr = historical[i];

      if (prev.revenue > 0) {
        revenueChanges.push(((curr.revenue - prev.revenue) / prev.revenue) * 100);
      }
      if (prev.costs > 0) {
        costChanges.push(((curr.costs - prev.costs) / prev.costs) * 100);
      }
    }

    const revenueTrend = revenueChanges.length > 0
      ? revenueChanges.reduce((sum, val) => sum + val, 0) / revenueChanges.length
      : 0;

    const costTrend = costChanges.length > 0
      ? costChanges.reduce((sum, val) => sum + val, 0) / costChanges.length
      : 0;

    // Basic seasonality: calculate average by month
    const seasonality: Record<string, number> = {};
    const monthlyRevenue: Record<number, number[]> = {};

    historical.forEach(data => {
      const month = data.period.getMonth();
      if (!monthlyRevenue[month]) {
        monthlyRevenue[month] = [];
      }
      monthlyRevenue[month].push(data.revenue);
    });

    Object.entries(monthlyRevenue).forEach(([month, revenues]) => {
      const avgRevenue = revenues.reduce((sum, val) => sum + val, 0) / revenues.length;
      const overallAvg = historical.reduce((sum, d) => sum + d.revenue, 0) / historical.length;
      if (overallAvg > 0) {
        seasonality[month] = ((avgRevenue - overallAvg) / overallAvg) * 100;
      }
    });

    return {
      revenueTrend,
      costTrend,
      seasonality,
    };
  }

  /**
   * Project forecast based on trends
   * 
   * Uses linear trend projection with seasonality adjustments.
   */
  private projectForecast(
    trends: {
      revenueTrend: number;
      costTrend: number;
      seasonality: Record<string, number>;
    },
    period: { start: Date; end: Date }
  ): BudgetForecast {
    const daysDiff = Math.ceil((period.end.getTime() - period.start.getTime()) / (1000 * 60 * 60 * 24));
    const monthsDiff = daysDiff / 30;

    // Base forecast: apply trend over period
    // Simplified: assume current month average, then apply trend
    const baseRevenue = 10000; // @stub: Should come from last period's actual
    const baseCosts = 5000; // @stub: Should come from last period's actual

    // Apply trend (compounded monthly)
    const revenueMultiplier = Math.pow(1 + trends.revenueTrend / 100, monthsDiff);
    const costMultiplier = Math.pow(1 + trends.costTrend / 100, monthsDiff);

    let forecastedRevenue = baseRevenue * revenueMultiplier;
    let forecastedCosts = baseCosts * costMultiplier;

    // Apply seasonality adjustment (if available for target month)
    const targetMonth = period.start.getMonth();
    if (trends.seasonality[targetMonth] !== undefined) {
      const seasonalAdjustment = 1 + (trends.seasonality[targetMonth] / 100);
      forecastedRevenue *= seasonalAdjustment;
      forecastedCosts *= seasonalAdjustment;
    }

    const forecastedMargin = forecastedRevenue - forecastedCosts;

    // Determine confidence based on data quality
    const confidence = monthsDiff > 3 ? 'low' : monthsDiff > 1 ? 'medium' : 'high';

    const assumptions = [
      `Revenue trend: ${trends.revenueTrend.toFixed(2)}% per period`,
      `Cost trend: ${trends.costTrend.toFixed(2)}% per period`,
      `Forecast period: ${monthsDiff.toFixed(1)} months`,
    ];

    return {
      period,
      forecastedRevenue,
      forecastedCosts,
      forecastedMargin,
      confidence,
      assumptions,
    };
  }

  /**
   * Get actual spending for a category
   * 
   * @stub Basic implementation using invoices. Full cross-module aggregation pending.
   */
  private async getActualSpending(
    tenantId: string,
    category: string,
    period: { start: Date; end: Date }
  ): Promise<number> {
    // Get payable invoices (costs) in the period
    // Note: category matching is simplified - would need proper category mapping
    const payableInvoices = await db
      .select({
        totalAmount: invoices.totalAmount,
      })
      .from(invoices)
      .where(
        and(
          eq(invoices.tenantId, tenantId),
          eq(invoices.invoiceType, 'payable'),
          gte(invoices.issueDate, period.start),
          lte(invoices.issueDate, period.end)
        )
      );

    // Sum all payable amounts
    const totalSpending = payableInvoices.reduce(
      (sum, inv) => sum + parseFloat(inv.totalAmount?.toString() || '0'),
      0
    );

    return totalSpending;
  }

  /**
   * Get variance breakdown by dimension
   * 
   * @stub Basic implementation. Full multi-dimensional breakdown pending.
   */
  private async getVarianceBreakdown(
    tenantId: string,
    category: string,
    period: { start: Date; end: Date }
  ): Promise<Array<{
    dimension: string;
    dimensionValue: string;
    budgeted: number;
    actual: number;
    variance: number;
  }>> {
    // Get budget for category
    const budget = await db.query.budgets.findFirst({
      where: and(
        eq(budgets.tenantId, tenantId),
        eq(budgets.category, category)
      ),
    });

    if (!budget) {
      return [];
    }

    const budgeted = parseFloat(budget.amount.toString());
    const actual = await this.getActualSpending(tenantId, category, period);
    const variance = actual - budgeted;

    // Basic breakdown: by category only
    // Full implementation would break down by department, project, etc.
    return [
      {
        dimension: 'category',
        dimensionValue: category,
        budgeted,
        actual,
        variance,
      },
    ];
  }

  /**
   * Generate recommendations from scenario comparison
   */
  private generateRecommendations(
    scenarios: Array<{
      scenarioId: string;
      name: string;
      forecast: BudgetForecast;
      keyMetrics: {
        totalRevenue: number;
        totalCosts: number;
        margin: number;
        marginPercentage: number;
      };
    }>
  ): string[] {
    const recommendations: string[] = [];

    // Find best scenario
    const bestScenario = scenarios.reduce((best, current) => {
      return current.keyMetrics.marginPercentage > best.keyMetrics.marginPercentage
        ? current
        : best;
    }, scenarios[0]);

    recommendations.push(
      `Best scenario: ${bestScenario.name} with ${bestScenario.keyMetrics.marginPercentage.toFixed(2)}% margin`
    );

    // Add other recommendations
    if (scenarios.length > 1) {
      recommendations.push('Consider implementing cost optimization measures');
      recommendations.push('Monitor revenue trends closely');
    }

    return recommendations;
  }
}

// Export singleton instance
export const budgetingEngineService = new BudgetingEngineService();

