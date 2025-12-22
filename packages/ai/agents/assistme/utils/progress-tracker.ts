/**
 * Progress Tracker
 * 
 * Provides granular progress tracking with percentages, operation stages,
 * and estimated time remaining based on historical performance data.
 * 
 * Features:
 * - Automatic progress calculation (0-100%)
 * - Operation stage tracking (parsing → executing → formatting)
 * - ETA based on historical averages
 * - Sub-operation tracking
 * - Real-time progress updates
 */

export interface ProgressStage {
  name: string;
  weight: number; // Relative weight (0-1)
  status: 'pending' | 'active' | 'completed';
  startTime?: number;
  endTime?: number;
  subStages?: ProgressStage[];
}

export interface ProgressSnapshot {
  percentage: number;
  currentStage: string;
  message: string;
  eta_seconds?: number;
  stages: ProgressStage[];
  metadata?: Record<string, any>;
}

export interface ProgressConfig {
  /**
   * Define operation stages with weights
   * Weights should sum to 1.0
   */
  stages: Array<{ name: string; weight: number }>;

  /**
   * Historical average duration for ETA calculation (ms)
   */
  historicalDurationMs?: number;

  /**
   * Enable ETA calculation
   * Default: true
   */
  enableETA?: boolean;
}

export class ProgressTracker {
  private stages: ProgressStage[] = [];
  private currentStageIndex: number = 0;
  private startTime: number = Date.now();
  private historicalDurationMs: number;
  private enableETA: boolean;
  private completedWeight: number = 0;

  // Historical data for ETA (simple moving average)
  private static durationHistory: Map<string, number[]> = new Map();
  private operationKey: string;

  constructor(
    private readonly onProgress: (snapshot: ProgressSnapshot) => void,
    config: ProgressConfig,
    operationKey: string = 'default'
  ) {
    this.operationKey = operationKey;
    this.historicalDurationMs = config.historicalDurationMs || 0;
    this.enableETA = config.enableETA ?? true;

    // Initialize stages
    this.stages = config.stages.map(s => ({
      name: s.name,
      weight: s.weight,
      status: 'pending'
    }));

    // Load historical duration if available
    if (!this.historicalDurationMs && this.enableETA) {
      const history = ProgressTracker.durationHistory.get(this.operationKey) || [];
      if (history.length > 0) {
        this.historicalDurationMs = Math.round(
          history.reduce((sum, d) => sum + d, 0) / history.length
        );
      }
    }
  }

  /**
   * Start a specific stage
   */
  startStage(stageName: string, message?: string): void {
    const stage = this.stages.find(s => s.name === stageName);
    if (!stage) {
      console.warn(`[ProgressTracker] Stage not found: ${stageName}`);
      return;
    }

    // Mark previous stages as completed
    for (let i = 0; i < this.stages.length; i++) {
      if (this.stages[i].name === stageName) {
        this.currentStageIndex = i;
        break;
      }
      if (this.stages[i].status !== 'completed') {
        this.stages[i].status = 'completed';
        this.stages[i].endTime = Date.now();
        this.completedWeight += this.stages[i].weight;
      }
    }

    stage.status = 'active';
    stage.startTime = Date.now();

    this.emitProgress(message || `${stageName}...`);
  }

  /**
   * Update progress within current stage
   */
  updateProgress(message: string, subProgress?: number): void {
    const currentStage = this.stages[this.currentStageIndex];
    if (!currentStage) {
      return;
    }

    // Calculate progress including sub-progress
    let additionalProgress = 0;
    if (subProgress !== undefined && subProgress >= 0 && subProgress <= 1) {
      additionalProgress = currentStage.weight * subProgress;
    }

    this.emitProgress(message, additionalProgress);
  }

  /**
   * Complete current stage
   */
  completeStage(message?: string): void {
    const currentStage = this.stages[this.currentStageIndex];
    if (!currentStage) {
      return;
    }

    currentStage.status = 'completed';
    currentStage.endTime = Date.now();
    this.completedWeight += currentStage.weight;

    this.emitProgress(message || `${currentStage.name} complete`);
  }

  /**
   * Complete all stages and finish tracking
   */
  complete(message?: string): void {
    // Mark all remaining stages as completed
    for (const stage of this.stages) {
      if (stage.status !== 'completed') {
        stage.status = 'completed';
        stage.endTime = Date.now();
        this.completedWeight += stage.weight;
      }
    }

    const totalDuration = Date.now() - this.startTime;

    // Update historical data for future ETA calculations
    this.recordDuration(totalDuration);

    this.emitProgress(message || 'Completed', 0, true);
  }

  /**
   * Emit progress update
   */
  private emitProgress(message: string, additionalProgress: number = 0, isComplete: boolean = false): void {
    const currentStage = this.stages[this.currentStageIndex];
    
    // Calculate total progress (0-100)
    const percentage = isComplete 
      ? 100 
      : Math.min(99, Math.round((this.completedWeight + additionalProgress) * 100));

    // Calculate ETA
    let eta_seconds: number | undefined;
    if (this.enableETA && !isComplete && this.historicalDurationMs > 0) {
      const elapsedMs = Date.now() - this.startTime;
      const estimatedTotalMs = this.historicalDurationMs;
      const remainingMs = Math.max(0, estimatedTotalMs - elapsedMs);
      eta_seconds = Math.round(remainingMs / 1000);
    }

    const snapshot: ProgressSnapshot = {
      percentage,
      currentStage: currentStage?.name || 'unknown',
      message,
      eta_seconds,
      stages: this.stages,
      metadata: isComplete ? {
        totalDuration: Date.now() - this.startTime,
        completed: true
      } : undefined
    };

    this.onProgress(snapshot);
  }

  /**
   * Record operation duration for historical tracking
   */
  private recordDuration(durationMs: number): void {
    if (!ProgressTracker.durationHistory.has(this.operationKey)) {
      ProgressTracker.durationHistory.set(this.operationKey, []);
    }

    const history = ProgressTracker.durationHistory.get(this.operationKey)!;
    history.push(durationMs);

    // Keep only last 20 durations
    if (history.length > 20) {
      history.shift();
    }
  }

  /**
   * Get current progress snapshot
   */
  getSnapshot(): ProgressSnapshot {
    const currentStage = this.stages[this.currentStageIndex];
    const percentage = Math.round(this.completedWeight * 100);

    let eta_seconds: number | undefined;
    if (this.enableETA && this.historicalDurationMs > 0) {
      const elapsedMs = Date.now() - this.startTime;
      const estimatedTotalMs = this.historicalDurationMs;
      const remainingMs = Math.max(0, estimatedTotalMs - elapsedMs);
      eta_seconds = Math.round(remainingMs / 1000);
    }

    return {
      percentage,
      currentStage: currentStage?.name || 'unknown',
      message: currentStage ? `${currentStage.name} in progress` : 'Starting...',
      eta_seconds,
      stages: this.stages
    };
  }

  /**
   * Get historical average duration for an operation
   */
  static getHistoricalDuration(operationKey: string): number | undefined {
    const history = this.durationHistory.get(operationKey);
    if (!history || history.length === 0) {
      return undefined;
    }

    return Math.round(history.reduce((sum, d) => sum + d, 0) / history.length);
  }

  /**
   * Clear historical data
   */
  static clearHistory(operationKey?: string): void {
    if (operationKey) {
      this.durationHistory.delete(operationKey);
    } else {
      this.durationHistory.clear();
    }
  }
}

/**
 * Create a progress tracker for common operation types
 */
export function createProgressTracker(
  onProgress: (snapshot: ProgressSnapshot) => void,
  operationType: 'simple' | 'moderate' | 'complex' = 'moderate',
  operationKey?: string
): ProgressTracker {
  const configs = {
    simple: {
      stages: [
        { name: 'analyzing', weight: 0.2 },
        { name: 'executing', weight: 0.6 },
        { name: 'formatting', weight: 0.2 }
      ],
      historicalDurationMs: 2000 // 2 seconds
    },
    moderate: {
      stages: [
        { name: 'analyzing', weight: 0.15 },
        { name: 'planning', weight: 0.15 },
        { name: 'executing', weight: 0.5 },
        { name: 'synthesizing', weight: 0.2 }
      ],
      historicalDurationMs: 4000 // 4 seconds
    },
    complex: {
      stages: [
        { name: 'analyzing', weight: 0.1 },
        { name: 'planning', weight: 0.15 },
        { name: 'orchestrating', weight: 0.15 },
        { name: 'executing', weight: 0.4 },
        { name: 'synthesizing', weight: 0.15 },
        { name: 'validating', weight: 0.05 }
      ],
      historicalDurationMs: 8000 // 8 seconds
    }
  };

  return new ProgressTracker(
    onProgress,
    configs[operationType],
    operationKey || `operation_${operationType}`
  );
}

/**
 * Helper to format ETA into human-readable string
 */
export function formatETA(seconds: number): string {
  if (seconds < 1) {
    return 'less than a second';
  } else if (seconds < 60) {
    return `${seconds}s`;
  } else {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return remainingSeconds > 0 
      ? `${minutes}m ${remainingSeconds}s`
      : `${minutes}m`;
  }
}
