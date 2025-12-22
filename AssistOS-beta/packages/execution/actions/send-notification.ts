import type { ActionExecutor, ActionResult } from '../ActionExecutor';
import type { ExecutionContext } from '../types';
import { db } from '../../../apps/api/db';
import { notifications } from '@shared/schema';

export class SendNotificationAction implements ActionExecutor {
  readonly name = 'send_notification';
  readonly description = 'Create a system notification';
  
  validate(config: Record<string, any>): boolean {
    return !!(config.userId && config.message);
  }
  
  async execute(
    config: Record<string, any>,
    context: ExecutionContext
  ): Promise<ActionResult> {
    try {
      const notification = await db.insert(notifications).values({
        tenantId: context.tenantId,
        userId: config.userId,
        title: config.title || 'Automation Notification',
        message: config.message,
        type: config.type || 'info',
        read: false,
      }).returning();
      
      return {
        success: true,
        output: notification[0],
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to send notification: ${error.message}`,
      };
    }
  }
}
