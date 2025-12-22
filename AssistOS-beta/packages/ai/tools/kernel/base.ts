import { z } from 'zod';
import type { ToolManifest, ToolExecutionContext, ToolExecutionResult, ToolError } from './types';

export abstract class ToolBase<TInput = any, TOutput = any> {
  abstract manifest: ToolManifest;
  
  async execute(
    input: TInput,
    context: ToolExecutionContext,
    onProgress?: (progress: number, message: string) => void
  ): Promise<ToolExecutionResult<TOutput>> {
    const startTime = Date.now();
    
    try {
      const validatedInput = await this.validateInput(input);
      
      await this.checkPermissions(context);
      
      const result = await this.executeInternal(validatedInput, context, onProgress);
      
      if (this.manifest.outputSchema) {
        this.manifest.outputSchema.parse(result);
      }
      
      const duration = Date.now() - startTime;
      
      return {
        success: true,
        data: result,
        metadata: { duration }
      };
      
    } catch (error) {
      return {
        success: false,
        error: this.handleError(error),
        metadata: { duration: Date.now() - startTime }
      };
    }
  }
  
  protected abstract executeInternal(
    input: TInput,
    context: ToolExecutionContext,
    onProgress?: (progress: number, message: string) => void
  ): Promise<TOutput>;
  
  protected validateInput(input: TInput): TInput {
    const schema = this.buildInputSchema();
    return schema.parse(input);
  }
  
  protected async checkPermissions(context: ToolExecutionContext): Promise<void> {
    if (!context.tenantId || !context.userId) {
      throw new Error('Missing required context: tenantId and userId are required');
    }
  }
  
  protected handleError(error: unknown): ToolError {
    if (error instanceof z.ZodError) {
      return {
        code: 'VALIDATION_ERROR',
        message: 'Input validation failed',
        details: error.errors,
        recoverable: true
      };
    }
    
    return {
      code: 'EXECUTION_ERROR',
      message: error instanceof Error ? error.message : 'Unknown error',
      details: error,
      recoverable: false
    };
  }
  
  private buildInputSchema(): z.ZodType<any> {
    const shape: Record<string, z.ZodType<any>> = {};
    
    for (const param of this.manifest.parameters) {
      let paramSchema = param.schema || this.getDefaultSchema(param.type);
      
      if (!param.required) {
        paramSchema = paramSchema.optional();
      }
      
      if (param.default !== undefined) {
        paramSchema = paramSchema.default(param.default);
      }
      
      shape[param.name] = paramSchema;
    }
    
    return z.object(shape);
  }
  
  private getDefaultSchema(type: string): z.ZodType<any> {
    switch (type) {
      case 'string': return z.string();
      case 'number': return z.number();
      case 'boolean': return z.boolean();
      case 'object': return z.record(z.any());
      case 'array': return z.array(z.any());
      default: return z.any();
    }
  }
}
