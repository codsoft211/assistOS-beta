import type { ActionExecutor, ActionResult } from '../ActionExecutor';
import type { ExecutionContext } from '../types';

export class ConditionalAction implements ActionExecutor {
  readonly name = 'conditional';
  readonly description = 'Conditional branching based on conditions';
  
  validate(config: Record<string, any>): boolean {
    return !!(config.condition);
  }
  
  async execute(
    config: Record<string, any>,
    context: ExecutionContext
  ): Promise<ActionResult> {
    try {
      const condition = config.condition;
      const result = this.evaluateCondition(condition, context);
      
      return {
        success: true,
        output: {
          conditionMet: result,
          condition,
          message: result ? 'Condition is true' : 'Condition is false',
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to evaluate condition: ${error.message}`,
      };
    }
  }
  
  private evaluateCondition(condition: any, context: ExecutionContext): boolean {
    // Support different condition types
    if (typeof condition === 'boolean') {
      return condition;
    }
    
    if (typeof condition === 'object' && condition !== null) {
      // Support comparison operators
      if (condition.operator && condition.left !== undefined && condition.right !== undefined) {
        const left = this.resolveValue(condition.left, context);
        const right = this.resolveValue(condition.right, context);
        
        switch (condition.operator) {
          case '==': return left == right;
          case '===': return left === right;
          case '!=': return left != right;
          case '!==': return left !== right;
          case '>': return left > right;
          case '>=': return left >= right;
          case '<': return left < right;
          case '<=': return left <= right;
          case 'contains': return String(left).includes(String(right));
          case 'startsWith': return String(left).startsWith(String(right));
          case 'endsWith': return String(left).endsWith(String(right));
          default: return false;
        }
      }
      
      // Support logical operators
      if (condition.and && Array.isArray(condition.and)) {
        return condition.and.every((c: any) => this.evaluateCondition(c, context));
      }
      
      if (condition.or && Array.isArray(condition.or)) {
        return condition.or.some((c: any) => this.evaluateCondition(c, context));
      }
      
      if (condition.not) {
        return !this.evaluateCondition(condition.not, context);
      }
    }
    
    return false;
  }
  
  private resolveValue(value: any, context: ExecutionContext): any {
    if (typeof value === 'string') {
      // Support context variables
      if (value.startsWith('$context.')) {
        const path = value.substring(9);
        return this.getNestedValue(context.variables, path);
      }
      
      // Support step results
      if (value.startsWith('$step.')) {
        const path = value.substring(6);
        return this.getNestedValue(context.stepResults, path);
      }
    }
    
    return value;
  }
  
  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }
}
