import type { ActionExecutor, ActionResult } from '../ActionExecutor';
import type { ExecutionContext } from '../types';
import { db } from '../../../apps/api/db';
import { eventLog } from '@shared/schema';

export class LogEventAction implements ActionExecutor {
  readonly name = 'log_event';
  readonly description = 'Log an event to the event log';
  
  validate(config: Record<string, any>): boolean {
    return !!(config.eventType && config.eventData);
  }
  
  async execute(
    config: Record<string, any>,
    context: ExecutionContext
  ): Promise<ActionResult> {
    try {
      const event = await db.insert(eventLog).values({
        tenantId: context.tenantId,
        eventType: config.eventType,
        eventData: config.eventData,
        triggeredBy: config.triggeredBy,
        status: 'processed',
        processedAt: new Date(),
      }).returning();
      
      return {
        success: true,
        output: event[0],
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to log event: ${error.message}`,
      };
    }
  }
}
