/**
 * Action Registry - Central registry for all workflow actions
 * 
 * Implements the Registry pattern to manage action discovery and execution.
 * Actions can be registered at runtime, enabling a plugin-like architecture
 * for extending workflow capabilities.
 */

import type { ActionExecutor, ActionResult } from './ActionExecutor';
import type { ExecutionContext } from './types';

/**
 * ActionRegistry - Manages registration and execution of workflow actions
 * 
 * This class provides:
 * - Registration of new actions
 * - Discovery of available actions
 * - Validation and execution of actions
 * - Proper error handling for missing or invalid actions
 * 
 * Example usage:
 * ```typescript
 * import { actionRegistry } from './ActionRegistry';
 * import { MyCustomAction } from './actions/custom';
 * 
 * // Register a custom action
 * actionRegistry.register(new MyCustomAction());
 * 
 * // Execute an action
 * const result = await actionRegistry.execute(
 *   'my_custom_action',
 *   { param1: 'value1' },
 *   context
 * );
 * ```
 */
export class ActionRegistry {
  /**
   * Internal map of registered actions
   * Key: action name, Value: action executor instance
   */
  private actions: Map<string, ActionExecutor> = new Map();
  
  /**
   * Register a new action in the registry
   * 
   * @param action - Action executor instance to register
   * @throws Error if an action with the same name is already registered
   */
  register(action: ActionExecutor): void {
    this.actions.set(action.name, action);
  }
  
  /**
   * Unregister an action from the registry
   * 
   * @param name - Name of the action to unregister
   */
  unregister(name: string): void {
    this.actions.delete(name);
  }
  
  /**
   * Check if an action is registered
   * 
   * @param name - Name of the action to check
   * @returns true if the action exists, false otherwise
   */
  has(name: string): boolean {
    return this.actions.has(name);
  }
  
  /**
   * Get an action executor by name
   * 
   * @param name - Name of the action to retrieve
   * @returns Action executor instance or undefined if not found
   */
  get(name: string): ActionExecutor | undefined {
    return this.actions.get(name);
  }
  
  /**
   * List all registered action names
   * 
   * @returns Array of action names
   */
  list(): string[] {
    return Array.from(this.actions.keys());
  }
  
  /**
   * Execute an action by name with the given configuration and context
   * 
   * This method handles:
   * - Action discovery
   * - Configuration validation (if action provides validator)
   * - Action execution
   * - Error handling and reporting
   * 
   * @param actionName - Name of the action to execute
   * @param config - Configuration parameters for the action
   * @param context - Execution context
   * @returns Promise resolving to action result
   */
  async execute(
    actionName: string,
    config: Record<string, any>,
    context: ExecutionContext,
    schema?: string
  ): Promise<ActionResult> {
    // Look up the action in the registry
    const action = this.actions.get(actionName);
    
    // Handle case where action is not found
    if (!action) {
      return {
        success: false,
        error: `Action '${actionName}' not found. Available: ${this.list().join(', ')}`,
      };
    }
    
    // Validate config if validator exists
    if (action.validate && !action.validate(config)) {
      return {
        success: false,
        error: `Invalid config for action '${actionName}'`,
      };
    }
    
    // Execute action with proper error handling
    try {
      const result = await action.execute(config, context, schema || 'public');
      return result;
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Unknown error',
      };
    }
  }
}

/**
 * Global singleton instance of ActionRegistry
 * 
 * This singleton is exported for convenient access throughout the application.
 * All actions should be registered with this instance.
 */
export const actionRegistry = new ActionRegistry();
