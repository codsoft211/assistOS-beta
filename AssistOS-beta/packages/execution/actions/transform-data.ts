import type { ActionExecutor, ActionResult } from '../ActionExecutor';
import type { ExecutionContext } from '../types';

export class TransformDataAction implements ActionExecutor {
  readonly name = 'transform_data';
  readonly description = 'Transform data using templates and mapping';
  
  validate(config: Record<string, any>): boolean {
    return !!(config.input && config.mapping);
  }
  
  async execute(
    config: Record<string, any>,
    context: ExecutionContext
  ): Promise<ActionResult> {
    try {
      const input = config.input;
      const mapping = config.mapping;
      
      // Support different transformation modes
      if (Array.isArray(input)) {
        // Transform array of items
        const transformed = input.map(item => this.applyMapping(item, mapping, context));
        return {
          success: true,
          output: transformed,
        };
      } else {
        // Transform single object
        const transformed = this.applyMapping(input, mapping, context);
        return {
          success: true,
          output: transformed,
        };
      }
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to transform data: ${error.message}`,
      };
    }
  }
  
  private applyMapping(input: any, mapping: Record<string, any>, context: ExecutionContext): any {
    const result: any = {};
    
    for (const [key, value] of Object.entries(mapping)) {
      if (typeof value === 'string') {
        // Simple field mapping: { "newField": "oldField" }
        result[key] = this.resolveValue(value, input, context);
      } else if (typeof value === 'function') {
        // Custom transform function
        result[key] = value(input, context);
      } else if (typeof value === 'object' && value !== null) {
        // Nested mapping
        result[key] = this.applyMapping(input, value, context);
      } else {
        // Static value
        result[key] = value;
      }
    }
    
    return result;
  }
  
  private resolveValue(path: string, input: any, context: ExecutionContext): any {
    // Support special syntax for accessing context variables
    if (path.startsWith('$context.')) {
      const contextPath = path.substring(9); // Remove "$context."
      return this.getNestedValue(context.variables, contextPath);
    }
    
    // Support special syntax for previous step results
    if (path.startsWith('$step.')) {
      const stepPath = path.substring(6); // Remove "$step."
      return this.getNestedValue(context.stepResults, stepPath);
    }
    
    // Support literal strings with '@' prefix
    // Ex: "@approved" returns literal "approved"
    if (path.startsWith('@')) {
      return path.substring(1); // Remove "@" and return literal
    }
    
    // Default: get value from input
    return this.getNestedValue(input, path);
  }
  
  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }
}
