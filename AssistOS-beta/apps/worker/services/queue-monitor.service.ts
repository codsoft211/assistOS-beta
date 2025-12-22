/**
 * Queue Monitor Service
 * 
 * Monitors BullMQ queue depth and throughput across all queues,
 * emitting Sentry alerts for queue buildup and providing health snapshots.
 */

import { Queue } from 'bullmq';
import { Sentry } from '../sentry';
import { redisConnection, checkRedisConnection } from '../config/redis';
import { dlqQueue, getDLQMetrics } from '../queues/dlq';
import { connectorSyncQueue } from '../queues/connector-sync';
import { promotionQueue } from '../queues/promotion';
import { analysisQueue } from '../queues/analysis';
import { patternAggregationQueue } from '../queues/pattern-aggregation';
import { assistbuildQueue } from '../queues/assistbuild';

const QUEUE_DEPTH_THRESHOLDS = {
  WARNING: 100,
  CRITICAL: 500,
};

const DLQ_DEPTH_THRESHOLDS = {
  WARNING: 10,
  CRITICAL: 50,
};

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export interface QueueMetrics {
  queueName: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  totalDepth: number;
  throughput: number;
  successRate: number;
  status: 'healthy' | 'warning' | 'critical';
  lastChecked: Date;
}

export interface QueueMonitorSnapshot {
  queues: QueueMetrics[];
  dlqDepth: number;
  dlqStatus: 'healthy' | 'warning' | 'critical';
  overallStatus: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: Date;
}

export class QueueMonitorService {
  private queues: Map<string, Queue | null>;
  private lastSnapshot: QueueMonitorSnapshot | null = null;
  private migrationQueue: Queue | null = null;
  private backfillQueue: Queue | null = null;

  constructor(queues?: Map<string, Queue | null>) {
    if (queues) {
      this.queues = queues;
    } else {
      this.queues = this.initializeQueues();
    }
  }

  private initializeQueues(): Map<string, Queue | null> {
    const queues = new Map<string, Queue | null>([
      ['connector-sync', connectorSyncQueue],
      ['promotion', promotionQueue],
      ['pattern-learning', analysisQueue],
      ['pattern-aggregation', patternAggregationQueue],
      ['assistbuild', assistbuildQueue],
    ]);

    checkRedisConnection().then((isAvailable) => {
      if (isAvailable) {
        this.migrationQueue = new Queue('apply-migration', {
          connection: redisConnection,
        });
        queues.set('migration', this.migrationQueue);

        this.backfillQueue = new Queue('backfill-environment', {
          connection: redisConnection,
        });
        queues.set('backfill', this.backfillQueue);

        console.log('[QueueMonitor] ✅ All queues initialized for monitoring');
      }
    });

    return queues;
  }

  async collectMetrics(): Promise<QueueMonitorSnapshot> {
    const queueMetrics: QueueMetrics[] = [];

    for (const [name, queue] of Array.from(this.queues.entries())) {
      if (!queue) {
        continue;
      }

      try {
        const metrics = await this.getQueueMetrics(name, queue);
        queueMetrics.push(metrics);

        this.checkThresholds(metrics);
      } catch (error) {
        console.error(`[QueueMonitor] Failed to collect metrics for ${name}:`, error);
      }
    }

    const dlqMetrics = await getDLQMetrics();
    const dlqDepth = dlqMetrics ? dlqMetrics.waiting + dlqMetrics.active : 0;
    const dlqStatus = this.getDLQStatus(dlqDepth);

    if (dlqStatus !== 'healthy') {
      this.emitDLQAlert(dlqDepth, dlqStatus);
    }

    const snapshot: QueueMonitorSnapshot = {
      queues: queueMetrics,
      dlqDepth,
      dlqStatus,
      overallStatus: this.calculateOverallStatus(queueMetrics, dlqStatus),
      timestamp: new Date(),
    };

    this.lastSnapshot = snapshot;
    return snapshot;
  }

  private async getQueueMetrics(name: string, queue: Queue): Promise<QueueMetrics> {
    const [waiting, active, delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getDelayedCount(),
    ]);

    const { completed, failed } = await this.get24hJobCounts(queue);

    const totalDepth = waiting + active + delayed;
    const status = this.getQueueStatus(totalDepth);

    const totalProcessed = completed + failed;
    const successRate = totalProcessed > 0 ? completed / totalProcessed : 1;

    const throughput = completed / (24 * 60);

    return {
      queueName: name,
      waiting,
      active,
      completed,
      failed,
      delayed,
      totalDepth,
      throughput,
      successRate,
      status,
      lastChecked: new Date(),
    };
  }

  private async get24hJobCounts(queue: Queue): Promise<{ completed: number; failed: number }> {
    try {
      const now = Date.now();
      const dayAgo = now - TWENTY_FOUR_HOURS_MS;

      const [completedJobs, failedJobs] = await Promise.all([
        queue.getJobs(['completed'], 0, 999),
        queue.getJobs(['failed'], 0, 999),
      ]);

      const completed = completedJobs.filter(
        (job) => job.finishedOn && job.finishedOn >= dayAgo
      ).length;

      const failed = failedJobs.filter(
        (job) => job.finishedOn && job.finishedOn >= dayAgo
      ).length;

      return { completed, failed };
    } catch (error) {
      console.error(`[QueueMonitor] Failed to get 24h job counts for ${queue.name}:`, error);
      return { completed: 0, failed: 0 };
    }
  }

  private getQueueStatus(totalDepth: number): 'healthy' | 'warning' | 'critical' {
    if (totalDepth >= QUEUE_DEPTH_THRESHOLDS.CRITICAL) {
      return 'critical';
    }
    if (totalDepth >= QUEUE_DEPTH_THRESHOLDS.WARNING) {
      return 'warning';
    }
    return 'healthy';
  }

  private getDLQStatus(dlqDepth: number): 'healthy' | 'warning' | 'critical' {
    if (dlqDepth >= DLQ_DEPTH_THRESHOLDS.CRITICAL) {
      return 'critical';
    }
    if (dlqDepth >= DLQ_DEPTH_THRESHOLDS.WARNING) {
      return 'warning';
    }
    return 'healthy';
  }

  private checkThresholds(metrics: QueueMetrics): void {
    if (metrics.totalDepth >= QUEUE_DEPTH_THRESHOLDS.CRITICAL) {
      Sentry.captureException(
        new Error(
          `Queue depth critical: ${metrics.queueName} has ${metrics.totalDepth} jobs (threshold: ${QUEUE_DEPTH_THRESHOLDS.CRITICAL})`
        ),
        {
          level: 'error',
          tags: {
            queue: metrics.queueName,
            depth: metrics.totalDepth.toString(),
            threshold: 'critical',
          },
          contexts: {
            queueMetrics: {
              waiting: metrics.waiting,
              active: metrics.active,
              delayed: metrics.delayed,
              completed24h: metrics.completed,
              failed24h: metrics.failed,
              successRate: metrics.successRate,
              throughput: metrics.throughput,
            },
          },
        }
      );
    } else if (metrics.totalDepth >= QUEUE_DEPTH_THRESHOLDS.WARNING) {
      Sentry.captureMessage(
        `Queue depth warning: ${metrics.queueName} has ${metrics.totalDepth} jobs (threshold: ${QUEUE_DEPTH_THRESHOLDS.WARNING})`,
        {
          level: 'warning',
          tags: {
            queue: metrics.queueName,
            depth: metrics.totalDepth.toString(),
            threshold: 'warning',
          },
          contexts: {
            queueMetrics: {
              waiting: metrics.waiting,
              active: metrics.active,
              delayed: metrics.delayed,
              completed24h: metrics.completed,
              failed24h: metrics.failed,
              successRate: metrics.successRate,
              throughput: metrics.throughput,
            },
          },
        }
      );
    }
  }

  private emitDLQAlert(dlqDepth: number, dlqStatus: 'warning' | 'critical'): void {
    const threshold =
      dlqStatus === 'critical' ? DLQ_DEPTH_THRESHOLDS.CRITICAL : DLQ_DEPTH_THRESHOLDS.WARNING;

    if (dlqStatus === 'critical') {
      Sentry.captureException(
        new Error(
          `DLQ depth critical: ${dlqDepth} failed jobs in dead letter queue (threshold: ${threshold})`
        ),
        {
          level: 'error',
          tags: {
            queue: 'dead-letter-queue',
            depth: dlqDepth.toString(),
            threshold: 'critical',
          },
        }
      );
    } else {
      Sentry.captureMessage(
        `DLQ depth warning: ${dlqDepth} failed jobs in dead letter queue (threshold: ${threshold})`,
        {
          level: 'warning',
          tags: {
            queue: 'dead-letter-queue',
            depth: dlqDepth.toString(),
            threshold: 'warning',
          },
        }
      );
    }
  }

  private calculateOverallStatus(
    queueMetrics: QueueMetrics[],
    dlqStatus: 'healthy' | 'warning' | 'critical'
  ): 'healthy' | 'degraded' | 'unhealthy' {
    const hasCritical = queueMetrics.some((m) => m.status === 'critical') || dlqStatus === 'critical';
    const hasWarning = queueMetrics.some((m) => m.status === 'warning') || dlqStatus === 'warning';

    if (hasCritical) {
      return 'unhealthy';
    }
    if (hasWarning) {
      return 'degraded';
    }
    return 'healthy';
  }

  getLastSnapshot(): QueueMonitorSnapshot | null {
    return this.lastSnapshot;
  }

  async close(): Promise<void> {
    if (this.migrationQueue) {
      await this.migrationQueue.close();
    }
    if (this.backfillQueue) {
      await this.backfillQueue.close();
    }
  }
}

export const queueMonitorService = new QueueMonitorService();
