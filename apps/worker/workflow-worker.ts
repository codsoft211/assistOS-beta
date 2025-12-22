#!/usr/bin/env node

/**
 * Dedicated Workflow Execution Worker
 * 
 * Processes only workflow execution jobs from the 'assistbuild-workflows' queue.
 * Separate from main worker for better isolation and debugging.
 * 
 * Run with: npm run worker:workflows
 * or: tsx apps/worker/workflow-worker.ts
 */

import { Worker, Job } from 'bullmq';
import { redisConnection, checkRedisConnection } from './config/redis.js';
import { ExecutionEngine } from './jobs/workflow-execution/execution-engine.js';
import type { WorkflowExecutionJobData } from './queues/workflow-execution.js';

// Color codes for better terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function log(level: 'INFO' | 'SUCCESS' | 'ERROR' | 'WARN', message: string, data?: any) {
  const timestamp = new Date().toISOString();
  const color = {
    INFO: colors.blue,
    SUCCESS: colors.green,
    ERROR: colors.red,
    WARN: colors.yellow,
  }[level];

  console.log(
    `${colors.bright}[${timestamp}]${colors.reset} ${color}[${level}]${colors.reset} ${message}`
  );
  
  if (data) {
    console.log(JSON.stringify(data, null, 2));
  }
}

/**
 * Process a workflow execution job with detailed logging
 */
async function processWorkflowExecution(job: Job<WorkflowExecutionJobData>) {
  const { workflowId, executionId, tenantId, userId, environment } = job.data;
  const startTime = Date.now();

  log('INFO', '🚀 Starting workflow execution', {
    jobId: job.id,
    workflowId: workflowId.substring(0, 8) + '...',
    executionId: executionId.substring(0, 8) + '...',
    tenantId: tenantId.substring(0, 8) + '...',
    environment,
    attempt: job.attemptsMade + 1,
  });

  try {
    // Initialize execution engine
    const engine = new ExecutionEngine();

    // Execute workflow
    await engine.execute({
      workflowId,
      executionId,
      tenantId,
      userId,
      environment,
      triggerData: job.data.triggerData,
      variables: {},
    });

    const duration = Date.now() - startTime;
    
    log('SUCCESS', `✅ Workflow completed in ${duration}ms`, {
      jobId: job.id,
      executionId: executionId.substring(0, 8) + '...',
      duration: `${duration}ms`,
    });

    return {
      success: true,
      executionId,
      duration,
    };
  } catch (error: any) {
    const duration = Date.now() - startTime;
    
    log('ERROR', `❌ Workflow failed after ${duration}ms`, {
      jobId: job.id,
      executionId: executionId.substring(0, 8) + '...',
      error: error.message,
      stack: error.stack?.split('\n').slice(0, 3).join('\n'),
    });
    
    throw error;
  }
}

/**
 * Initialize and start the workflow worker
 */
async function startWorker() {
  console.log('\n' + '='.repeat(80));
  log('INFO', '🔧 Initializing Workflow Execution Worker');
  console.log('='.repeat(80) + '\n');

  // Check Redis connection
  const isRedisAvailable = await checkRedisConnection();
  
  if (!isRedisAvailable) {
    log('ERROR', '❌ Redis is not available. Cannot start workflow worker.');
    log('WARN', 'Make sure Redis is running:');
    console.log('  - Docker: docker ps | grep redis');
    console.log('  - Local: brew services start redis (macOS)');
    console.log('  - Linux: sudo systemctl start redis');
    process.exit(1);
  }

  log('SUCCESS', '✅ Redis connection established');

  // Create worker
  const worker = new Worker<WorkflowExecutionJobData>(
    'assistbuild-workflows',
    processWorkflowExecution,
    {
      connection: redisConnection,
      concurrency: 3, // Process up to 3 workflows concurrently
      limiter: {
        max: 5, // Max 5 jobs
        duration: 1000, // per second
      },
    }
  );

  // Worker event handlers
  worker.on('ready', () => {
    log('SUCCESS', '✅ Worker ready to process jobs');
    log('INFO', 'Listening on queue: assistbuild-workflows');
    log('INFO', 'Concurrency: 3 jobs');
    console.log('\n' + '='.repeat(80));
    console.log(`${colors.bright}Waiting for workflow execution jobs...${colors.reset}`);
    console.log('='.repeat(80) + '\n');
  });

  worker.on('completed', (job, result) => {
    log('SUCCESS', `✅ Job completed: ${job.id}`, {
      executionId: result.executionId?.substring(0, 8) + '...',
      duration: result.duration,
    });
  });

  worker.on('failed', (job, error) => {
    if (job) {
      log('ERROR', `❌ Job failed: ${job.id}`, {
        executionId: job.data.executionId?.substring(0, 8) + '...',
        attempt: job.attemptsMade,
        maxAttempts: job.opts.attempts || 3,
        error: error.message,
      });
    } else {
      log('ERROR', '❌ Job failed with unknown job', { error: error.message });
    }
  });

  worker.on('error', (error) => {
    log('ERROR', '❌ Worker error', { error: error.message });
  });

  worker.on('stalled', (jobId) => {
    log('WARN', `⚠️  Job stalled: ${jobId}`);
  });

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    log('WARN', '⚠️  Received SIGTERM, shutting down gracefully...');
    await worker.close();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    log('WARN', '⚠️  Received SIGINT, shutting down gracefully...');
    await worker.close();
    process.exit(0);
  });

  return worker;
}

// Start the worker
startWorker().catch((error) => {
  log('ERROR', '❌ Failed to start worker', {
    error: error.message,
    stack: error.stack,
  });
  process.exit(1);
});
