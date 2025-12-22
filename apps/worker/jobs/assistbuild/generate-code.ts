import { Job, Queue } from 'bullmq';
import { db } from '../../db';
import { generatedCode, blueprintTemplates, codeGenerationValidations, assistbuildJobs } from '../../../../shared/schema';
import { BlueprintCompilerService } from '../../../../packages/platform/services/blueprint-compiler';
import { ValidationService } from '../../../../packages/platform/services/validation.service';
import { redisConnection } from '../../config/redis';
import { eq } from 'drizzle-orm';

export interface GenerateCodeJobData {
  blueprintId: string;
  tenantId: string;
  environment: 'sandbox' | 'production';
}

export async function generateCodeJob(job: Job<GenerateCodeJobData>) {
  const { blueprintId, tenantId, environment } = job.data;
  const validationService = new ValidationService();
  let codeRecordId: string | null = null; // Track generated_code ID for error handling

  try {
    await job.updateProgress(10);
    await job.log('Loading blueprint...');

    const [blueprint] = await db
      .select()
      .from(blueprintTemplates)
      .where(eq(blueprintTemplates.id, blueprintId));

    if (!blueprint) {
      throw new Error(`Blueprint ${blueprintId} not found`);
    }

    await job.updateProgress(20);
    await job.log('Compiling code from blueprint...');

    const compiler = new BlueprintCompilerService();
    const files = await compiler.compile(blueprint.templateCode as any);

    await job.updateProgress(40);
    await job.log('Storing generated code...');

    const [codeRecord] = await db
      .insert(generatedCode)
      .values({
        tenantId,
        blueprintId,
        environment,
        files,
        status: 'generated'
      })
      .returning();

    codeRecordId = codeRecord.id; // Save ID for error handling

    // ========== AUTOMATIC VALIDATION ==========
    await job.updateProgress(50);
    await job.log('Validating generated code...');

    // Update status to 'validating'
    await db
      .update(generatedCode)
      .set({ status: 'validating' })
      .where(eq(generatedCode.id, codeRecord.id));

    // Run validations
    const validationResults = await validationService.validateAll(files, {
      skipConflicts: environment === 'sandbox' // Skip conflict detection in sandbox
    });

    await job.updateProgress(80);
    await job.log('Processing validation results...');

    // Store detailed validation records
    const validationTypes: Array<'syntax' | 'conflicts'> = ['syntax'];
    if (validationResults.conflicts) {
      validationTypes.push('conflicts');
    }

    for (const validationType of validationTypes) {
      const typeResult = validationType === 'syntax' 
        ? validationResults.syntax 
        : validationResults.conflicts;

      if (typeResult) {
        await db.insert(codeGenerationValidations).values({
          generatedCodeId: codeRecord.id,
          validationType,
          status: 'completed',
          passed: typeResult.passed,
          results: {
            errors: typeResult.errors,
            warnings: typeResult.warnings,
          },
          startedAt: new Date(),
          completedAt: new Date(),
        });
      }
    }

    // Update generatedCode with final validation results
    const finalStatus = validationResults.passed ? 'validated' : 'validation_failed';
    
    await db
      .update(generatedCode)
      .set({
        status: finalStatus,
        validationResults: {
          passed: validationResults.passed,
          syntax: validationResults.syntax.syntax,
          conflicts: validationResults.conflicts?.conflicts,
          warnings: validationResults.syntax.warnings,
        }
      })
      .where(eq(generatedCode.id, codeRecord.id));

    await job.updateProgress(100);
    
    if (validationResults.passed) {
      await job.log('✅ Code generation and validation complete!');
      console.log(`[GenerateCodeJob] ✅ Code validated successfully for blueprint ${blueprintId}`);
      
      // ========== FASE 3: AUTOMATIC SANDBOX TESTING ==========
      // Enqueue sandbox test job after successful validation
      await job.log('📋 Enqueueing sandbox test job...');
      
      try {
        // Create assistbuild job record for sandbox testing
        const [sandboxJobRecord] = await db.insert(assistbuildJobs).values({
          tenantId,
          userId: job.data.userId || 'system', // Use userId from job data or fallback to 'system'
          jobType: 'sandbox-test',
          environment,
          input: { generatedCodeId: codeRecord.id },
          status: 'pending',
        }).returning();

        // Enqueue the job in BullMQ
        const queue = new Queue('assistbuild', { connection: redisConnection });
        await queue.add(
          'sandbox_test',
          {
            type: 'sandbox_test',
            tenantId,
            userId: job.data.userId || 'system',
            environment,
            input: { generatedCodeId: codeRecord.id },
          },
          {
            jobId: sandboxJobRecord.id,
            removeOnComplete: { count: 100 },
            removeOnFail: { count: 100 },
          }
        );
        
        await queue.close();
        
        console.log(`[GenerateCodeJob] ✅ Sandbox test job enqueued: ${sandboxJobRecord.id}`);
        await job.log(`✅ Sandbox test job enqueued: ${sandboxJobRecord.id}`);
      } catch (queueError: any) {
        console.error(`[GenerateCodeJob] ⚠️  Failed to enqueue sandbox test:`, queueError);
        await job.log(`⚠️  Warning: Failed to enqueue sandbox test - ${queueError.message}`);
        // Don't fail the job if sandbox enqueueing fails - code is still validated
      }
    } else {
      await job.log('⚠️  Code generated but validation failed. Review errors before deploying.');
      console.log(`[GenerateCodeJob] ⚠️  Validation failed for blueprint ${blueprintId}`);
    }

    return { ...codeRecord, status: finalStatus, validationResults };
  } catch (error: any) {
    console.error(`[GenerateCodeJob] ❌ Error:`, error);
    await job.log(`Error: ${error.message}`);

    // Update existing record if it was created, otherwise insert new failed record
    if (codeRecordId) {
      await db
        .update(generatedCode)
        .set({
          status: 'failed',
          validationResults: {
            passed: false,
            syntax: { passed: false, errors: [error.message] }
          }
        })
        .where(eq(generatedCode.id, codeRecordId));
    } else {
      // Only insert if no record was created yet
      await db.insert(generatedCode).values({
        tenantId,
        blueprintId,
        executionPlanId: undefined,
        environment,
        files: {},
        status: 'failed',
        validationResults: {
          passed: false,
          syntax: { passed: false, errors: [error.message] }
        },
        sandboxTestResults: undefined,
        approvedBy: undefined,
        approvedAt: undefined,
        rejectedBy: undefined,
        rejectedAt: undefined,
        rejectionReason: undefined,
        deployedAt: undefined
      });
    }

    throw error;
  }
}
