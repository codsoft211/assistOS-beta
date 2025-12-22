import { Job } from 'bullmq';
import { JobProcessorBase, JobContext } from './base';

export class TestProcessor extends JobProcessorBase<any, any> {
  get jobType(): string {
    return 'test_job';
  }
  
  async execute(input: any, context: JobContext, job: Job): Promise<any> {
    console.log(`[TestProcessor] Starting test job for tenant ${context.tenantId}`);
    
    // Simulate progress
    await this.updateProgress(job.id!, 25, 'Starting test...');
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    await this.updateProgress(job.id!, 50, 'Processing...');
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    await this.updateProgress(job.id!, 75, 'Almost done...');
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    await this.updateProgress(job.id!, 100, 'Completed!');
    
    return { success: true, message: 'Test job completed successfully' };
  }
}
