import type { ActionExecutor, ActionResult } from '../ActionExecutor';
import type { ExecutionContext } from '../types';

export class WaitAction implements ActionExecutor {
  readonly name = 'wait';
  readonly description = 'Wait for a specified duration';
  
  validate(config: Record<string, any>): boolean {
    return typeof config.duration === 'number' && config.duration > 0;
  }
  
  async execute(
    config: Record<string, any>,
    context: ExecutionContext
  ): Promise<ActionResult> {
    try {
      const duration = config.duration; // in milliseconds
      const maxWait = 300000; // 5 minutes max
      
      if (duration > maxWait) {
        return {
          success: false,
          error: `Wait duration exceeds maximum (${maxWait}ms / 5 minutes)`,
        };
      }
      
      const startTime = Date.now();
      await new Promise(resolve => setTimeout(resolve, duration));
      const actualDuration = Date.now() - startTime;
      
      return {
        success: true,
        output: {
          duration,
          actualDuration,
          message: `Waited for ${actualDuration}ms`,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to wait: ${error.message}`,
      };
    }
  }
}
