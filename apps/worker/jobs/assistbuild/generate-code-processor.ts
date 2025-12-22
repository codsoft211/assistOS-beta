import { Job } from 'bullmq';
import { JobProcessorBase, JobContext } from './base';
import { db } from '../../db';
import { generatedCode, blueprintTemplates } from '../../../../shared/schema';
import { BlueprintCompilerService } from '../../../../packages/platform/services/blueprint-compiler';
import { eq } from 'drizzle-orm';

export interface GenerateCodeInput {
  blueprintId: string;
}

export class GenerateCodeProcessor extends JobProcessorBase<GenerateCodeInput, any> {
  get jobType(): string {
    return 'generate_code';
  }

  async execute(input: GenerateCodeInput, context: JobContext, job: Job): Promise<any> {
    const { blueprintId } = input;
    const { tenantId, environment } = context;

    console.log(`[GenerateCodeProcessor] Starting code generation for blueprint ${blueprintId}`);

    await this.updateProgress(job.id!, 10, 'Loading blueprint...');

    const [blueprint] = await db
      .select()
      .from(blueprintTemplates)
      .where(eq(blueprintTemplates.id, blueprintId));

    if (!blueprint) {
      throw new Error(`Blueprint ${blueprintId} not found`);
    }

    await this.updateProgress(job.id!, 30, 'Compiling code from blueprint...');

    const compiler = new BlueprintCompilerService();
    const files = await compiler.compile(blueprint.templateCode as any);

    await this.updateProgress(job.id!, 70, 'Storing generated code...');

    const [result] = await db
      .insert(generatedCode)
      .values({
        tenantId,
        blueprintId,
        environment,
        files,
        status: 'generated'
      })
      .returning();

    await this.updateProgress(job.id!, 100, 'Code generation complete!');

    console.log(`[GenerateCodeProcessor] ✅ Successfully generated code for blueprint ${blueprintId}`);
    
    return {
      success: true,
      generatedCodeId: result.id,
      filesGenerated: Object.keys(files).length,
      files: Object.keys(files)
    };
  }
}
