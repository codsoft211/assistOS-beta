import { Job } from 'bullmq';
import { JobProcessorBase, JobContext } from './base';
import { db } from '../../db';
import { generatedCode, sandboxExecutions, codeGenerationValidations } from '../../../../shared/schema';
import { SandboxTestRunner } from '../../../../packages/platform/services/sandbox-test-runner';
import { eq } from 'drizzle-orm';

export interface SandboxTestInput {
  generatedCodeId: string;
}

export class SandboxTestProcessor extends JobProcessorBase<SandboxTestInput, any> {
  get jobType(): string {
    return 'sandbox_test';
  }

  async execute(input: SandboxTestInput, context: JobContext, job: Job): Promise<any> {
    const { generatedCodeId } = input;
    const { tenantId, environment } = context;

    console.log(`[SandboxTestProcessor] Starting sandbox testing for generatedCode ${generatedCodeId}`);

    await this.updateProgress(job.id!, 10, 'Loading generated code...');

    // Load generated code
    const [codeRecord] = await db
      .select()
      .from(generatedCode)
      .where(eq(generatedCode.id, generatedCodeId));

    if (!codeRecord) {
      throw new Error(`Generated code ${generatedCodeId} not found`);
    }

    if (!codeRecord.files || Object.keys(codeRecord.files).length === 0) {
      throw new Error(`No files found in generated code ${generatedCodeId}`);
    }

    // Create pending validation record
    await this.updateProgress(job.id!, 20, 'Creating validation record...');
    
    const [validationRecord] = await db
      .insert(codeGenerationValidations)
      .values({
        generatedCodeId,
        validationType: 'sandbox_test',
        status: 'running',
        startedAt: new Date(),
      })
      .returning();

    console.log(`[SandboxTestProcessor] Created validation record ${validationRecord.id}`);

    try {
      // Update generatedCode status to testing
      await db
        .update(generatedCode)
        .set({ status: 'testing' })
        .where(eq(generatedCode.id, generatedCodeId));

      await this.updateProgress(job.id!, 30, 'Running sandbox tests...');

      // Execute sandbox tests
      const runner = new SandboxTestRunner();
      const testResults = await runner.runTests(codeRecord.files as Record<string, string>);

      await this.updateProgress(job.id!, 70, 'Storing test results...');

      // Insert into sandboxExecutions table with correct executionTier
      const [execution] = await db
        .insert(sandboxExecutions)
        .values({
          executionPlanId: codeRecord.executionPlanId || null,
          tenantId,
          environment,
          moduleName: codeRecord.blueprintId || 'unknown',
          executionTier: 'worker_threads', // Correct tier - uses Node.js worker_threads
          inputData: { 
            filesCount: Object.keys(codeRecord.files).length,
            fileTypes: Object.keys(codeRecord.files).map(f => f.split('.').pop()).filter((v, i, a) => a.indexOf(v) === i),
          },
          outputData: {
            ...testResults.metadata,
            stdout: testResults.stdout,
            stderr: testResults.stderr,
            testsRun: testResults.testsRun,
            testsPassed: testResults.testsPassed,
            testsFailed: testResults.testsFailed,
          },
          success: testResults.passed,
          errorMessage: testResults.errors.length > 0 ? testResults.errors.join('; ') : null,
          cpuMs: testResults.executionTimeMs,
          memoryMb: testResults.memoryUsedMb,
          latencyMs: testResults.executionTimeMs,
        })
        .returning();

      console.log(`[SandboxTestProcessor] Created sandbox execution record ${execution.id}`);

      await this.updateProgress(job.id!, 80, 'Updating validation results...');

      // Update validation record
      await db
        .update(codeGenerationValidations)
        .set({
          status: 'completed',
          passed: testResults.passed,
          results: {
            errors: testResults.errors.map(err => ({
              message: err,
              severity: 'error' as const,
            })),
            metadata: {
              testsRun: testResults.testsRun,
              testsPassed: testResults.testsPassed,
              testsFailed: testResults.testsFailed,
              executionTimeMs: testResults.executionTimeMs,
              memoryUsedMb: testResults.memoryUsedMb,
              executionTier: 'worker_threads',
              stdout: testResults.stdout,
              stderr: testResults.stderr,
            },
          },
          completedAt: new Date(),
        })
        .where(eq(codeGenerationValidations.id, validationRecord.id));

      // Update generatedCode with test results and final status
      const finalStatus = testResults.passed ? 'pending_approval' : 'validation_failed';

      await db
        .update(generatedCode)
        .set({
          status: finalStatus,
          sandboxTestResults: {
            passed: testResults.passed,
            testsRun: testResults.testsRun,
            testsPassed: testResults.testsPassed,
            testsFailed: testResults.testsFailed,
            errors: testResults.errors,
          },
        })
        .where(eq(generatedCode.id, generatedCodeId));

      await this.updateProgress(job.id!, 100, 'Sandbox testing complete!');

      if (testResults.passed) {
        console.log(`[SandboxTestProcessor] ✅ Sandbox tests passed - code ready for approval`);
      } else {
        console.log(`[SandboxTestProcessor] ❌ Sandbox tests failed - ${testResults.testsFailed}/${testResults.testsRun} tests failed`);
      }

      return {
        success: true,
        generatedCodeId,
        finalStatus,
        testResults: {
          passed: testResults.passed,
          testsRun: testResults.testsRun,
          testsPassed: testResults.testsPassed,
          testsFailed: testResults.testsFailed,
          errors: testResults.errors,
        },
        executionId: execution.id,
      };
    } catch (error: any) {
      console.error(`[SandboxTestProcessor] ❌ Error during sandbox testing:`, error);

      // Update validation record as failed
      await db
        .update(codeGenerationValidations)
        .set({
          status: 'failed',
          passed: false,
          results: {
            errors: [{
              message: error.message,
              severity: 'error' as const,
            }],
          },
          completedAt: new Date(),
        })
        .where(eq(codeGenerationValidations.id, validationRecord.id));

      // Update generatedCode status
      await db
        .update(generatedCode)
        .set({
          status: 'validation_failed',
          sandboxTestResults: {
            passed: false,
            testsRun: 0,
            testsPassed: 0,
            testsFailed: 1,
            errors: [error.message],
          },
        })
        .where(eq(generatedCode.id, generatedCodeId));

      throw error;
    }
  }
}
