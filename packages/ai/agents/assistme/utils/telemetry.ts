/**
 * Telemetry Service - Metrics tracking for Hybrid Intelligence
 * 
 * Tracks:
 * - Queries per mode
 * - Latency per mode
 * - Mode selection accuracy
 * - Cost tracking
 * - Success/failure rates
 */

import type { TelemetryEvent, HybridMode } from '../types';
import { HybridMode as Mode } from '../types';

export class TelemetryService {
  private events: TelemetryEvent[] = [];
  private readonly MAX_EVENTS = 10000; // Keep last 10k events in memory

  /**
   * Log a telemetry event
   */
  logEvent(event: TelemetryEvent): void {
    this.events.push(event);

    // Limit memory usage
    if (this.events.length > this.MAX_EVENTS) {
      this.events = this.events.slice(-this.MAX_EVENTS);
    }

    // Console log for debugging
    console.log(
      `[Telemetry] ${event.mode.toUpperCase()} | ` +
      `${event.duration_ms}ms | ` +
      `${event.success ? '✅' : '❌'} | ` +
      `conf: ${(event.classification_confidence * 100).toFixed(0)}%` +
      (event.cost_usd ? ` | $${event.cost_usd.toFixed(4)}` : '')
    );
  }

  /**
   * Get statistics for all modes
   */
  getStats(options?: {
    tenantId?: string;
    since?: Date;
    mode?: HybridMode;
  }): {
    total_queries: number;
    by_mode: Record<HybridMode, {
      count: number;
      percentage: number;
      avg_duration_ms: number;
      p95_duration_ms: number;
      success_rate: number;
      total_cost_usd: number;
      avg_confidence: number;
    }>;
    overall: {
      avg_duration_ms: number;
      p95_duration_ms: number;
      total_cost_usd: number;
      success_rate: number;
    };
  } {
    // Filter events
    let filtered = this.events;

    if (options?.tenantId) {
      filtered = filtered.filter(e => e.tenantId === options.tenantId);
    }

    if (options?.since) {
      filtered = filtered.filter(e => e.timestamp >= options.since!);
    }

    if (options?.mode) {
      filtered = filtered.filter(e => e.mode === options.mode);
    }

    const total = filtered.length;

    // Calculate stats by mode
    const byMode: Record<HybridMode, any> = {
      [Mode.TRIVIAL]: this.calculateModeStats(filtered, Mode.TRIVIAL, total),
      [Mode.SIMPLE]: this.calculateModeStats(filtered, Mode.SIMPLE, total),
      [Mode.MODERATE]: this.calculateModeStats(filtered, Mode.MODERATE, total),
      [Mode.COMPLEX]: this.calculateModeStats(filtered, Mode.COMPLEX, total)
    };

    // Calculate overall stats
    const allDurations = filtered.map(e => e.duration_ms);
    const overall = {
      avg_duration_ms: this.average(allDurations),
      p95_duration_ms: this.percentile(allDurations, 95),
      total_cost_usd: filtered.reduce((sum, e) => sum + (e.cost_usd || 0), 0),
      success_rate: filtered.filter(e => e.success).length / (total || 1)
    };

    return {
      total_queries: total,
      by_mode: byMode,
      overall
    };
  }

  /**
   * Calculate statistics for a specific mode
   */
  private calculateModeStats(
    events: TelemetryEvent[],
    mode: HybridMode,
    totalEvents: number
  ): {
    count: number;
    percentage: number;
    avg_duration_ms: number;
    p95_duration_ms: number;
    success_rate: number;
    total_cost_usd: number;
    avg_confidence: number;
  } {
    const modeEvents = events.filter(e => e.mode === mode);
    const count = modeEvents.length;

    if (count === 0) {
      return {
        count: 0,
        percentage: 0,
        avg_duration_ms: 0,
        p95_duration_ms: 0,
        success_rate: 0,
        total_cost_usd: 0,
        avg_confidence: 0
      };
    }

    const durations = modeEvents.map(e => e.duration_ms);
    const confidences = modeEvents.map(e => e.classification_confidence);

    return {
      count,
      percentage: (count / totalEvents) * 100,
      avg_duration_ms: this.average(durations),
      p95_duration_ms: this.percentile(durations, 95),
      success_rate: modeEvents.filter(e => e.success).length / count,
      total_cost_usd: modeEvents.reduce((sum, e) => sum + (e.cost_usd || 0), 0),
      avg_confidence: this.average(confidences)
    };
  }

  /**
   * Get recent events (for debugging)
   */
  getRecentEvents(limit: number = 50): TelemetryEvent[] {
    return this.events.slice(-limit);
  }

  /**
   * Generate summary report
   */
  generateReport(options?: { tenantId?: string; since?: Date }): string {
    const stats = this.getStats(options);

    let report = `# Hybrid Intelligence Telemetry Report\n\n`;

    report += `**Total Queries:** ${stats.total_queries}\n\n`;

    report += `## Distribution by Mode\n\n`;
    report += `| Mode | Count | % | Avg Latency | P95 Latency | Success Rate | Total Cost |\n`;
    report += `|------|-------|---|-------------|-------------|--------------|------------|\n`;

    for (const [mode, modeStats] of Object.entries(stats.by_mode)) {
      report += `| ${mode.toUpperCase()} | ${modeStats.count} | ${modeStats.percentage.toFixed(1)}% | ${modeStats.avg_duration_ms.toFixed(0)}ms | ${modeStats.p95_duration_ms.toFixed(0)}ms | ${(modeStats.success_rate * 100).toFixed(1)}% | $${modeStats.total_cost_usd.toFixed(4)} |\n`;
    }

    report += `\n## Overall Performance\n\n`;
    report += `- **Average Latency:** ${stats.overall.avg_duration_ms.toFixed(0)}ms\n`;
    report += `- **P95 Latency:** ${stats.overall.p95_duration_ms.toFixed(0)}ms\n`;
    report += `- **Total Cost:** $${stats.overall.total_cost_usd.toFixed(4)}\n`;
    report += `- **Success Rate:** ${(stats.overall.success_rate * 100).toFixed(1)}%\n`;

    report += `\n## Target Achievement\n\n`;

    const trivialSimple = stats.by_mode[Mode.TRIVIAL].percentage + stats.by_mode[Mode.SIMPLE].percentage;
    const targetP95 = stats.overall.p95_duration_ms < 2000;

    report += `- ✅ **80%+ in Trivial/Simple:** ${trivialSimple >= 80 ? 'YES' : 'NO'} (${trivialSimple.toFixed(1)}%)\n`;
    report += `- ${targetP95 ? '✅' : '❌'} **P95 Latency <2s:** ${targetP95 ? 'YES' : 'NO'} (${stats.overall.p95_duration_ms.toFixed(0)}ms)\n`;

    return report;
  }

  /**
   * Calculate average of array
   */
  private average(arr: number[]): number {
    if (arr.length === 0) return 0;
    return arr.reduce((sum, val) => sum + val, 0) / arr.length;
  }

  /**
   * Calculate percentile
   */
  private percentile(arr: number[], p: number): number {
    if (arr.length === 0) return 0;

    const sorted = [...arr].sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;

    return sorted[Math.max(0, index)];
  }

  /**
   * Clear all events (for testing)
   */
  clear(): void {
    this.events = [];
    console.log('[Telemetry] Cleared all events');
  }
}

export const telemetry = new TelemetryService();
