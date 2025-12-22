import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { assistbuildJobs } from '../../../shared/schema';
import { eq, and } from 'drizzle-orm';
import { assistbuildQueue } from '../queues/assistbuild';
import { AssistBuildOrchestrator } from '../../../packages/ai/agents/assistbuild/orchestrator';
import { buildAssistBuildTenantContext } from '../services/assistbuild-context.service';

const router = Router();
const orchestrator = new AssistBuildOrchestrator();

const createJobSchema = z.object({
  type: z.enum(['test_job', 'module_creation', 'bulk_import', 'migration', 'agent_creation', 'workflow_creation']),
  input: z.record(z.any()),
  environment: z.enum(['sandbox', 'production']).optional().default('sandbox'),
});

router.post('/jobs', async (req, res) => {
  try {
    const { type, input, environment } = createJobSchema.parse(req.body);
    const tenantId = (req as any).tenantId;
    const userId = (req as any).userId;
    
    if (!tenantId || !userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const [job] = await db.insert(assistbuildJobs).values({
      tenantId,
      userId,
      environment: environment || 'sandbox',
      jobType: type,
      input,
      status: 'pending',
      progress: 0,
    }).returning();
    
    if (!assistbuildQueue) {
      await db.update(assistbuildJobs)
        .set({
          status: 'failed',
          error: { message: 'Job queue unavailable - Redis is not connected' },
          failedAt: new Date(),
        })
        .where(eq(assistbuildJobs.id, job.id));
      
      return res.status(503).json({ 
        error: 'Job queue unavailable',
        message: 'Redis is not connected. Please ensure Redis is running and try again.',
      });
    }
    
    await assistbuildQueue.add(type, {
      jobId: job.id,
      tenantId,
      userId,
      environment,
      type,
      input,
    }, {
      jobId: job.id,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000, // 1s, 5s, 30s
      },
      // Note: BullMQ doesn't have timeout in JobsOptions, it's handled differently
    });
    
    console.log(`[AssistBuild Jobs] Created job ${job.id} of type ${type}`);
    
    res.status(201).json({
      jobId: job.id,
      status: job.status,
      streamUrl: `/api/assistbuild/jobs/${job.id}/stream`,
    });
    
  } catch (error: any) {
    console.error('[AssistBuild Jobs] Create error:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: error.errors });
    }
    
    res.status(500).json({ error: 'Failed to create job' });
  }
});

// GET /jobs - List all jobs for the tenant
router.get('/jobs', async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    
    if (!tenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    // Query all jobs for this tenant, ordered by creation date (newest first)
    const jobs = await db.query.assistbuildJobs.findMany({
      where: eq(assistbuildJobs.tenantId, tenantId),
      orderBy: (assistbuildJobs, { desc }) => [desc(assistbuildJobs.createdAt)],
      limit: 100, // Limit to last 100 jobs
    });
    
    // Return simplified job list
    res.json({
      jobs: jobs.map(job => ({
        id: job.id,
        type: job.jobType,
        status: job.status,
        progress: job.progress,
        progressMessage: job.progressMessage,
        createdAt: job.createdAt,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
        failedAt: job.failedAt,
      })),
      total: jobs.length,
    });
    
  } catch (error) {
    console.error('[AssistBuild Jobs] List error:', error);
    res.status(500).json({ error: 'Failed to list jobs' });
  }
});

router.get('/jobs/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = (req as any).tenantId;
    
    if (!tenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const job = await db.query.assistbuildJobs.findFirst({
      where: and(
        eq(assistbuildJobs.id, id),
        eq(assistbuildJobs.tenantId, tenantId)
      ),
    });
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    res.json({
      id: job.id,
      type: job.jobType,
      status: job.status,
      progress: job.progress,
      progressMessage: job.progressMessage,
      output: job.output,
      error: job.error,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
    });
    
  } catch (error) {
    console.error('[AssistBuild Jobs] Status error:', error);
    res.status(500).json({ error: 'Failed to get job status' });
  }
});

router.post('/jobs/:id/cancel', async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = (req as any).tenantId;
    
    if (!tenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const job = await db.query.assistbuildJobs.findFirst({
      where: and(
        eq(assistbuildJobs.id, id),
        eq(assistbuildJobs.tenantId, tenantId)
      ),
    });
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    if (job.status !== 'pending' && job.status !== 'active') {
      return res.status(400).json({ error: `Cannot cancel job with status: ${job.status}` });
    }
    
    if (assistbuildQueue) {
      const bullMQJob = await assistbuildQueue.getJob(id);
      if (bullMQJob) {
        await bullMQJob.remove();
      }
    }
    
    await db.update(assistbuildJobs)
      .set({
        status: 'cancelled',
        failedAt: new Date(), // Use failedAt instead of cancelledAt
      })
      .where(eq(assistbuildJobs.id, id));
    
    console.log(`[AssistBuild Jobs] Cancelled job ${id}`);
    
    res.json({ success: true });
    
  } catch (error) {
    console.error('[AssistBuild Jobs] Cancel error:', error);
    res.status(500).json({ error: 'Failed to cancel job' });
  }
});

router.get('/jobs/:id/stream', async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = (req as any).tenantId;
    
    if (!tenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const job = await db.query.assistbuildJobs.findFirst({
      where: and(
        eq(assistbuildJobs.id, id),
        eq(assistbuildJobs.tenantId, tenantId)
      ),
    });
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    
    res.write(`data: ${JSON.stringify({
      status: job.status,
      progress: job.progress,
      message: job.progressMessage,
    })}\n\n`);
    
    const intervalId = setInterval(async () => {
      try {
        const updatedJob = await db.query.assistbuildJobs.findFirst({
          where: eq(assistbuildJobs.id, id),
        });
        
        if (!updatedJob) {
          clearInterval(intervalId);
          res.end();
          return;
        }
        
        res.write(`data: ${JSON.stringify({
          status: updatedJob.status,
          progress: updatedJob.progress,
          message: updatedJob.progressMessage,
          output: updatedJob.output,
          error: updatedJob.error,
        })}\n\n`);
        
        if (['completed', 'failed', 'cancelled'].includes(updatedJob.status)) {
          clearInterval(intervalId);
          res.write('data: [DONE]\n\n');
          res.end();
        }
      } catch (error) {
        console.error('[AssistBuild Jobs] Stream poll error:', error);
        clearInterval(intervalId);
        res.end();
      }
    }, 500);
    
    req.on('close', () => {
      clearInterval(intervalId);
      console.log(`[AssistBuild Jobs] Client disconnected from stream ${id}`);
    });
    
  } catch (error) {
    console.error('[AssistBuild Jobs] Stream error:', error);
    res.status(500).json({ error: 'Failed to stream job progress' });
  }
});

/**
 * POST /api/assistbuild/chat
 * Conversational interface for AssistBuild orchestrator
 * Used for Quote Configuration and other conversational workflows
 */
const chatSchema = z.object({
  message: z.string().min(1),
  conversationHistory: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string()
  })).optional(),
  environment: z.enum(['sandbox', 'production']).optional()
});

router.post('/chat', async (req, res) => {
  try {
    const { message, conversationHistory, environment } = chatSchema.parse(req.body);
    const tenantId = (req as any).tenantId;
    const userId = (req as any).userId;
    
    if (!tenantId || !userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    console.log(`[AssistBuild Chat] Processing message for tenant ${tenantId}`);
    
    const context = await buildAssistBuildTenantContext(
      tenantId,
      userId,
      environment || 'sandbox'
    );
    
    // SSE streaming response
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    
    // Progress callback for SSE streaming
    const onProgress = (message: string) => {
      res.write(`data: ${JSON.stringify({ type: 'progress', message })}\n\n`);
    };
    
    // Chunk callback for SSE streaming
    const onStreamChunk = (chunk: string) => {
      res.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`);
    };
    
    try {
      const response = await orchestrator.processMessage(
        message,
        context,
        onProgress,
        conversationHistory,
        onStreamChunk
      );
      
      // Send final response
      res.write(`data: ${JSON.stringify({ 
        type: 'complete', 
        response,
        usage: { /* usage stats if available */ }
      })}\n\n`);
      
      res.write('data: [DONE]\n\n');
      res.end();
      
    } catch (error: any) {
      console.error('[AssistBuild Chat] Processing error:', error);
      res.write(`data: ${JSON.stringify({ 
        type: 'error', 
        message: error.message || 'Failed to process message' 
      })}\n\n`);
      res.end();
    }
    
  } catch (error: any) {
    console.error('[AssistBuild Chat] Request error:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: error.errors });
    }
    
    res.status(500).json({ error: 'Failed to process chat message' });
  }
});

export default router;
