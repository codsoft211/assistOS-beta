import { Job } from 'bullmq';
import { db } from '../../db';
import { assistbuildJobs } from '../../../../shared/schema';
import { eq } from 'drizzle-orm';
import type { Environment } from '../../../../shared/types/environment';

/**
 * Job Context - Passed to all worker jobs
 * 
 * This context ensures environment isolation and type-safe access
 * to tenant and user information in async job processing.
 * 
 * @see RequestContext in apps/api/services/context.service.ts for API equivalent
 */
export interface JobContext {
  tenantId: string;
  userId: string;
  environment: Environment;
}

export abstract class JobProcessorBase<TInput = any, TOutput = any> {
  abstract get jobType(): string;
  
  abstract execute(input: TInput, context: JobContext, job: Job): Promise<TOutput>;
  
  async process(job: Job): Promise<TOutput> {
    const { tenantId, userId, environment, input } = job.data;
    
    try {
      console.log(`[${this.jobType}] Starting job ${job.id} for tenant ${tenantId}`);
      
      await this.updateJobStatus(job.id!, 'active', { startedAt: new Date() });
      
      const output = await this.execute(input, { tenantId, userId, environment }, job);
      
      await this.updateJobStatus(job.id!, 'completed', {
        output,
        progress: 100,
        completedAt: new Date(),
      });
      
      console.log(`[${this.jobType}] ✅ Completed job ${job.id}`);
      return output;
      
    } catch (error: any) {
      console.error(`[${this.jobType}] ❌ Failed job ${job.id}:`, error);
      
      await this.updateJobStatus(job.id!, 'failed', {
        error: {
          message: error.message,
          stack: error.stack,
          name: error.name,
        },
        failedAt: new Date(),
      });
      
      throw error;
    }
  }
  
  protected async updateProgress(jobId: string, progress: number, message?: string) {
    await db.update(assistbuildJobs)
      .set({
        progress,
        progressMessage: message,
      })
      .where(eq(assistbuildJobs.id, jobId));
  }
  
  private async updateJobStatus(jobId: string, status: string, updates: any = {}) {
    const updateData: any = { status, ...updates };
    
    if (status === 'active') {
      const job = await db.query.assistbuildJobs.findFirst({
        where: eq(assistbuildJobs.id, jobId),
      });
      updateData.attempts = (job?.attempts || 0) + 1;
    }
    
    await db.update(assistbuildJobs)
      .set(updateData)
      .where(eq(assistbuildJobs.id, jobId));
  }
}
