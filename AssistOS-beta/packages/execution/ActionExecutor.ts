/**
 * Action Executor - Base interface for all workflow actions
 * 
 * This file defines the core interfaces that all actions must implement.
 * Actions are the building blocks of workflows - each step in a workflow
 * executes a specific action through this interface.
 */

import type { ExecutionContext } from './types';

/**
 * ActionResult - Result of executing an action
 * 
 * Represents the outcome of an action execution, including:
 * - success: Whether the action completed successfully
 * - output: Any data produced by the action
 * - error: Error message if the action failed
 */
export interface ActionResult {
  success: boolean;
  output?: any;
  error?: string;
}

/**
 * ActionExecutor - Base interface for all actions
 * 
 * All workflow actions must implement this interface.
 * This enables a plugin-like architecture where new actions can be
 * registered and discovered at runtime.
 * 
 * Example usage:
 * ```typescript
 * class SendEmailAction implements ActionExecutor {
 *   readonly name = 'send_email';
 *   readonly description = 'Sends an email to specified recipients';
 *   
 *   async execute(config, context) {
 *     const { to, subject, body } = config;
 *     // Send email logic here
 *     return { success: true, output: { messageId: '...' } };
 *   }
 *   
 *   validate(config) {
 *     return !!config.to && !!config.subject && !!config.body;
 *   }
 * }
 * ```
 */
export interface ActionExecutor {
  /**
   * Unique name for this action
   * Used to reference the action in workflow definitions
   */
  readonly name: string;
  
  /**
   * Human-readable description of what this action does
   * Used for documentation and UI purposes
   */
  readonly description: string;
  
  /**
   * Execute the action with the given configuration and context
   * 
   * @param config - Action-specific configuration (varies by action type)
   * @param context - Execution context with workflow and tenant information
   * @returns Promise resolving to action result
   */
  execute(
    config: Record<string, any>,
    context: ExecutionContext,
    schema?: string  // Add schema parameter
  ): Promise<ActionResult>;
  
  /**
   * Optional validation method for configuration
   * 
   * If provided, this will be called before execute() to validate
   * that the config contains all required parameters.
   * 
   * @param config - Configuration to validate
   * @returns true if config is valid, false otherwise
   */
  validate?(config: Record<string, any>): boolean;
}
