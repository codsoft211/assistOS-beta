/**
 * Workflow Executor - Core execution engine for workflows
 * 
 * Handles sequential execution of workflow steps with proper error handling
 * and database tracking.
 */

import { db } from '../../apps/api/db';
import { workflowExecutions } from '../../shared/schema';
import { eq } from 'drizzle-orm';
import { CredentialService } from '../../apps/api/services/assistbuild/credential.service.js';
import type {
  ExecutionContext,
  WorkflowDefinition,
  ExecutionResult,
  WorkflowStep
} from './types';
import { actionRegistry, ActionResult } from './ActionRegistry';
import { interpolateConfig, hasUnresolvedExpressions } from './interpolation';
import { evaluateCondition } from './conditionEvaluator';

/**
 * WorkflowExecutor - Main class for executing workflows
 * 
 * Manages the lifecycle of workflow execution from creation through completion,
 * including error handling and step-by-step tracking in the database.
 */
export class WorkflowExecutor {
  /**
   * Execute a workflow with the given definition
   * 
   * @param workflow - Workflow definition to execute
   * @param tenantId - Tenant ID for multi-tenancy
   * @param triggerData - Optional data that triggered this workflow
   * @returns Execution ID for tracking
   */
  async execute(
    workflow: WorkflowDefinition,
    tenantId: string,
    triggerData?: any,
    schema: string = 'public'
  ): Promise<string> {
    // Create execution record in database
    const execution = await db.insert(workflowExecutions).values({
      workflowId: workflow.id,
      tenantId,
      status: 'running',
      triggerData,
      stepsExecuted: [],
    }).returning();

    const executionId = execution[0].id;

    // Initialize execution context as local variable (not instance variable)
    const context: ExecutionContext = {
      workflowId: workflow.id,
      executionId,
      tenantId,
      variables: triggerData || {},
      stepResults: {},
      schema,
    };

    try {
      // Execute steps sequentially
      for (const step of workflow.steps) {
        // Check if step should be executed based on edge conditions
        // Find all incoming edges to this step
        const incomingEdges = workflow.edges.filter(e => e.target === step.id);

        if (incomingEdges.length > 0) {
          // A step executes if AT LEAST ONE incoming edge condition is true
          // If edge has no condition, it's considered true
          const shouldExecute = incomingEdges.some(edge => {
            if (!edge.condition) return true;
            return evaluateCondition(edge.condition, context);
          });

          if (!shouldExecute) {
            console.log(`Skipping step ${step.id} due to truthy condition not found`);
            continue;
          }
        }

        try {
          await this.executeStep(step, context);
        } catch (error: any) {
          // Log failed step
          await this.logStepExecution(step, {
            success: false,
            stepId: step.id,
            error: error.message,
            executedAt: new Date(),
          }, context);

          // Handle onError policy
          if (step.onError === 'stop' || !step.onError) {
            throw error;
          }
          // If 'continue' or 'retry', continue to next step
        }
      }

      // Mark execution as completed
      await db.update(workflowExecutions)
        .set({
          status: 'completed',
          completedAt: new Date(),
        })
        .where(eq(workflowExecutions.id, executionId));

      return executionId;
    } catch (error: any) {
      // Mark execution as failed with error details
      await db.update(workflowExecutions)
        .set({
          status: 'failed',
          errorMessage: error.message,
          errorStack: error.stack,
          completedAt: new Date(),
        })
        .where(eq(workflowExecutions.id, executionId));

      throw error;
    }
  }

  /**
   * Execute a single workflow step
   * 
   * Executes the step's action via the ActionRegistry, handling validation,
   * execution, and result storage.
   * 
   * @param step - Step to execute
   * @param context - Execution context
   * @returns Execution result
   */
  private async executeStep(step: WorkflowStep, context: ExecutionContext): Promise<ExecutionResult> {
    // Interpolate config variables
    const interpolatedConfig = interpolateConfig(step.config, context);

    // Strict Validation: Ensure no unresolved expressions remain
    const unresolved = hasUnresolvedExpressions(interpolatedConfig);
    if (unresolved) {
      throw new Error(`Execution failed: Expression '${unresolved}' in configuration for step '${step.name}' could not be resolved.`);
    }

    console.log(`[WorkflowExecutor] Step '${step.name}' (${step.id}) resolved config:`, JSON.stringify(interpolatedConfig, null, 2));

    // Credential Injection
    const action = actionRegistry.get(step.action);
    if (action?.requiresCredentials) {
      const credentialId = step.config.credentialId;
      if (!credentialId) {
        throw new Error(`Action '${step.action}' requires a credential, but none was provided (credentialId is missing in config).`);
      }

      // We need to import CredentialService dynamically or at the top
      // For now, I'll assume it's imported at the top
      const decryptedCredential = await CredentialService.getDecrypted(credentialId, context.tenantId);
      if (!decryptedCredential) {
        throw new Error(`Required credential ('${credentialId}') for action '${step.action}' was not found or is inaccessible.`);
      }

      // Inject decrypted fields (api_key, password, etc.) into the interpolated config
      // This happens ONLY in memory during execution
      Object.assign(interpolatedConfig, decryptedCredential.data);
    }

    // Execute action via registry
    const actionResult: ActionResult = await actionRegistry.execute(
      step.action,
      interpolatedConfig,
      context,
      context.schema || 'public'
    );

    // Convert ActionResult to ExecutionResult
    const executionResult: ExecutionResult = {
      success: actionResult.success,
      stepId: step.id,
      output: actionResult.output,
      error: actionResult.error,
      executedAt: new Date(),
    };

    // Store result in context if successful
    if (actionResult.success && actionResult.output) {
      context.stepResults[step.id] = actionResult.output;
    }

    // Throw if action failed so onError policy can be applied
    if (!actionResult.success) {
      throw new Error(actionResult.error || `Action '${step.action}' failed`);
    }

    // Log step execution to database
    await this.logStepExecution(step, executionResult, context);

    return executionResult;
  }

  /**
   * Log step execution details to database
   * 
   * Updates the workflow execution record with step results
   * 
   * @param step - Step that was executed
   * @param result - Result of step execution
   * @param context - Execution context
   */
  private async logStepExecution(step: WorkflowStep, result: ExecutionResult, context: ExecutionContext): Promise<void> {
    // Fetch current execution data
    const executionData = await db.select()
      .from(workflowExecutions)
      .where(eq(workflowExecutions.id, context.executionId))
      .limit(1);

    const stepsExecuted = executionData[0].stepsExecuted || [];

    // Add new step execution record
    stepsExecuted.push({
      stepId: step.id,
      stepName: step.name,
      status: result.success ? 'success' : 'failed',
      output: result.output,
      error: result.error,
      executedAt: result.executedAt.toISOString(),
    });

    // Update database with new steps executed
    await db.update(workflowExecutions)
      .set({ stepsExecuted })
      .where(eq(workflowExecutions.id, context.executionId));
  }
}
