// CDC Package - Change Data Capture Infrastructure
// Standardized event emission and sync orchestration for connectors

export * from "./types";
export * from "./publisher";
export * from "./recorder";
export * from "./dispatcher";

// Re-export commonly used items
export { getEventPublisher, setConnectorSyncQueue } from "./publisher";
export { recordChange, recordChangeBatch } from "./recorder";
export { dispatchToQueue, dispatchBatchToQueue, cdcEventEmitter, CDC_EVENTS } from "./dispatcher";
