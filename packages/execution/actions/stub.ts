/**
 * Stub Action - Example action for testing and demonstration
 * 
 * This is a minimal action implementation that shows how to create
 * custom actions for the workflow execution engine.
 */

import type { ActionExecutor, ActionResult } from '../ActionExecutor';
import type { ExecutionContext } from '../types';

/**
 * StubAction - A simple test action that always succeeds
 * 
 * This action demonstrates:
 * - How to implement the ActionExecutor interface
 * - Accessing configuration parameters
 * - Using execution context
 * - Returning structured results
 * 
 * Example usage in a workflow:
 * ```typescript
 * {
 *   id: 'step1',
 *   name: 'Test step',
 *   action: 'stub',
 *   config: { testParam: 'value' }
 * }
 * ```
 */
export class StubAction implements ActionExecutor {
  readonly name = 'stub';
  readonly description = 'Stub action for testing';
  
  /**
   * Execute the stub action
   * 
   * Simply returns a success result with the configuration
   * and execution context ID for verification.
   * 
   * @param config - Configuration passed to the action
   * @param context - Execution context with workflow information
   * @returns Success result with test data
   */
  async execute(
    config: Record<string, any>,
    context: ExecutionContext
  ): Promise<ActionResult> {
    return {
      success: true,
      output: {
        message: 'Stub action executed',
        config,
        contextId: context.executionId,
      },
    };
  }
}
