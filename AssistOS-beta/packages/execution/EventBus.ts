/**
 * Event Bus - Event-driven execution engine
 * 
 * Handles event processing, automation triggers, and agent scheduling.
 * Polls the eventLog table for pending events and executes matching automations.
 */

import { db } from '../../apps/api/db';
import { eventLog, tenantAutomations, automationExecutions } from '../../shared/schema';
import { eq, and } from 'drizzle-orm';
import { actionRegistry } from './ActionRegistry';
import type { ExecutionContext } from './types';

/**
 * EventBus - Manages event-driven automation triggers
 * 
 * Features:
 * - Polls eventLog table for pending events
 * - Matches events to automations by eventType
 * - Executes matching automations
 * - Updates event status to 'processed' or 'failed'
 * - Singleton pattern for global access
 */
export class EventBus {
  private isProcessing = false;
  private processingInterval: NodeJS.Timeout | null = null;
  
  /**
   * Start polling for pending events
   * 
   * @param intervalMs - Polling interval in milliseconds (default: 5000)
   */
  start(intervalMs: number = 5000) {
    if (this.processingInterval) {
      console.warn('[EventBus] Already running');
      return;
    }
    
    console.log(`[EventBus] Starting event processing (interval: ${intervalMs}ms)`);
    
    // Process immediately
    this.processPendingEvents();
    
    // Then poll at interval
    this.processingInterval = setInterval(() => {
      this.processPendingEvents();
    }, intervalMs);
  }
  
  /**
   * Stop polling
   */
  stop() {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
      console.log('[EventBus] Stopped');
    }
  }
  
  /**
   * Manually trigger processing of pending events
   * Useful for testing without waiting for polling interval
   * 
   * @returns Promise that resolves when processing is complete
   */
  async processNow(): Promise<void> {
    await this.processPendingEvents();
  }
  
  /**
   * Publish a new event (insert into eventLog with status='pending')
   * 
   * @param tenantId - Tenant ID
   * @param eventType - Event type (e.g., 'order.created', 'invoice.approved')
   * @param eventData - Event payload data
   * @param triggeredBy - Optional user ID who triggered the event
   * @returns Event ID
   */
  async publish(
    tenantId: string,
    eventType: string,
    eventData: any,
    triggeredBy?: string
  ): Promise<string> {
    const event = await db.insert(eventLog).values({
      tenantId,
      eventType,
      eventData,
      triggeredBy,
      status: 'pending',
    }).returning();
    
    console.log(`[EventBus] Published event: ${eventType} (${event[0].id})`);
    
    // Process immediately instead of waiting for next poll
    setImmediate(() => this.processPendingEvents());
    
    return event[0].id;
  }
  
  /**
   * Process all pending events
   * 
   * Internal method that polls for pending events and processes them.
   * Uses a lock (isProcessing) to prevent concurrent processing.
   */
  private async processPendingEvents() {
    if (this.isProcessing) {
      return; // Skip if already processing
    }
    
    this.isProcessing = true;
    
    try {
      // Get all pending events
      const pendingEvents = await db.select()
        .from(eventLog)
        .where(eq(eventLog.status, 'pending'))
        .limit(50); // Process in batches
      
      if (pendingEvents.length === 0) {
        return; // No events to process
      }
      
      console.log(`[EventBus] Processing ${pendingEvents.length} pending events`);
      
      // Process each event
      for (const event of pendingEvents) {
        await this.processEvent(event);
      }
    } catch (error) {
      console.error('[EventBus] Error processing events:', error);
    } finally {
      this.isProcessing = false;
    }
  }
  
  /**
   * Process a single event
   * 
   * Finds matching automations and triggers them.
   * Updates event status to 'processed' or 'failed'.
   * 
   * @param event - Event to process
   */
  private async processEvent(event: any) {
    try {
      console.log(`[EventBus] Processing event: ${event.eventType} (${event.id})`);
      
      let automationsTriggered = 0;
      let agentsTriggered = 0;
      
      // 1. Find matching automations
      // Get all event-triggered automations for this tenant
      const allAutomations = await db.select()
        .from(tenantAutomations)
        .where(
          and(
            eq(tenantAutomations.tenantId, event.tenantId),
            eq(tenantAutomations.isActive, true),
            eq(tenantAutomations.triggerType, 'event')
          )
        );
      
      // Filter automations where triggerConfig.eventType matches event.eventType
      const matchingAutomations = allAutomations.filter(automation => {
        const config = automation.triggerConfig as any;
        return config?.eventType === event.eventType;
      });
      
      // 2. Trigger each matching automation
      for (const automation of matchingAutomations) {
        const startTime = Date.now();
        
        try {
          // Create execution record with status='running'
          const execution = await db.insert(automationExecutions).values({
            automationId: automation.id,
            tenantId: automation.tenantId,
            status: 'running',
            triggerData: event.eventData,
            triggeredBy: 'event',
            triggeredByUserId: event.triggeredBy,
            metadata: { 
              eventId: event.id,
              eventType: event.eventType,
            },
          }).returning();
          
          const executionId = execution[0].id;
          
          try {
            // ACTUALLY EXECUTE THE AUTOMATION ACTIONS
            const executionResult = await this.executeAutomationActions(
              automation,
              event.eventData
            );
            
            const durationMs = Date.now() - startTime;
            
            // Determine final status based on action results
            const finalStatus = executionResult.allSucceeded ? 'success' 
              : executionResult.someSucceeded ? 'partial' 
              : 'failed';
            
            // Mark as completed
            await db.update(automationExecutions)
              .set({
                status: finalStatus,
                actionsExecuted: executionResult.actionsExecuted,
                completedAt: new Date(),
                durationMs,
              })
              .where(eq(automationExecutions.id, executionId));
            
            automationsTriggered++;
            
            console.log(`[EventBus] Automation ${automation.id} executed: ${finalStatus} (${durationMs}ms)`);
          } catch (error: any) {
            const durationMs = Date.now() - startTime;
            
            // Mark as failed
            await db.update(automationExecutions)
              .set({
                status: 'failed',
                errorMessage: error.message || 'Unknown error',
                errorStack: error.stack,
                completedAt: new Date(),
                durationMs,
              })
              .where(eq(automationExecutions.id, executionId));
            
            console.error(`[EventBus] Automation ${automation.id} failed:`, error);
          }
        } catch (error) {
          console.error(`[EventBus] Failed to create execution for automation ${automation.id}:`, error);
        }
      }
      
      // 3. TODO: Find and trigger matching agents
      // This will be implemented in AgentScheduler (Task 7)
      
      // 4. Mark event as processed
      await db.update(eventLog)
        .set({
          status: 'processed',
          processedAt: new Date(),
          automationsTriggered,
          agentsTriggered,
        })
        .where(eq(eventLog.id, event.id));
      
      console.log(`[EventBus] Event processed: ${event.id} (${automationsTriggered} automations, ${agentsTriggered} agents)`);
    } catch (error) {
      console.error(`[EventBus] Failed to process event ${event.id}:`, error);
      
      // Mark as failed
      await db.update(eventLog)
        .set({
          status: 'failed',
          processedAt: new Date(),
        })
        .where(eq(eventLog.id, event.id));
    }
  }
  
  /**
   * Execute all actions in an automation
   * 
   * Executes actions in order and tracks success/failure for each.
   * 
   * @param automation - Automation to execute
   * @param triggerData - Event data that triggered the automation
   * @returns Execution result with detailed action tracking
   */
  private async executeAutomationActions(
    automation: any,
    triggerData: any
  ): Promise<{
    allSucceeded: boolean;
    someSucceeded: boolean;
    actionsExecuted: Array<{
      actionType: string;
      status: 'success' | 'failed' | 'skipped';
      output?: any;
      error?: string;
      executedAt: string;
    }>;
  }> {
    const actionsExecuted: Array<{
      actionType: string;
      status: 'success' | 'failed' | 'skipped';
      output?: any;
      error?: string;
      executedAt: string;
    }> = [];
    
    // Get actions array from automation
    const actions = (automation.actions || []) as Array<{
      type: string;
      config: Record<string, any>;
      order: number;
    }>;
    
    // Sort actions by order
    const sortedActions = [...actions].sort((a, b) => a.order - b.order);
    
    let successCount = 0;
    let failureCount = 0;
    
    // Execute each action in order
    for (const action of sortedActions) {
      const executedAt = new Date().toISOString();
      
      try {
        // Build execution context
        const context: ExecutionContext = {
          workflowId: `automation-${automation.id}`,
          executionId: `exec-${Date.now()}`,
          tenantId: automation.tenantId,
          variables: triggerData,
          stepResults: {},
        };
        
        // Execute action using ActionRegistry
        const actionResult = await actionRegistry.execute(
          action.type,
          { ...action.config, triggerData },
          context
        );
        
        if (actionResult.success) {
          actionsExecuted.push({
            actionType: action.type,
            status: 'success',
            output: actionResult.output,
            executedAt,
          });
          successCount++;
        } else {
          actionsExecuted.push({
            actionType: action.type,
            status: 'failed',
            error: actionResult.error || 'Action failed',
            executedAt,
          });
          failureCount++;
          
          // Stop execution on first failure (can be made configurable)
          break;
        }
      } catch (error: any) {
        actionsExecuted.push({
          actionType: action.type,
          status: 'failed',
          error: error.message || 'Unknown error',
          executedAt,
        });
        failureCount++;
        
        // Stop execution on error
        break;
      }
    }
    
    return {
      allSucceeded: failureCount === 0 && successCount > 0,
      someSucceeded: successCount > 0,
      actionsExecuted,
    };
  }
}

// Global singleton instance
export const eventBus = new EventBus();
