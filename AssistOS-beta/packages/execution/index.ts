/**
 * Execution Engine - Main Entry Point
 * 
 * Exports all core execution engine components and registers default actions.
 */

export * from './types';
export * from './WorkflowExecutor';
export * from './ActionExecutor';
export * from './ActionRegistry';
export * from './EventBus';
export * from './AgentScheduler';
export { workflowScheduler } from './WorkflowScheduler';

// Register default actions
import { actionRegistry } from './ActionRegistry';
import { StubAction } from './actions/stub';
import { SendEmailAction } from './actions/send-email';
import { CreateRecordAction } from './actions/create-record';
import { UpdateRecordAction } from './actions/update-record';
import { SendNotificationAction } from './actions/send-notification';
import { LogEventAction } from './actions/log-event';
import { OcrExtractAction } from './actions/ocr-extract';
import { CallApiAction } from './actions/call-api';
import { TransformDataAction } from './actions/transform-data';
import { WaitAction } from './actions/wait';
import { ConditionalAction } from './actions/conditional';
import { RunAgentAction } from './actions/run-agent';
import { SendEmailGmailAction } from './actions/send-email-gmail';

actionRegistry.register(new StubAction());
actionRegistry.register(new SendEmailAction());
actionRegistry.register(new CreateRecordAction());
actionRegistry.register(new UpdateRecordAction());
actionRegistry.register(new SendNotificationAction());
actionRegistry.register(new LogEventAction());
actionRegistry.register(new OcrExtractAction());
actionRegistry.register(new CallApiAction());
actionRegistry.register(new TransformDataAction());
actionRegistry.register(new WaitAction());
actionRegistry.register(new ConditionalAction());
actionRegistry.register(new RunAgentAction());
actionRegistry.register(new SendEmailGmailAction());
