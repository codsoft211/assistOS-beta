import { nodeRegistry } from './NodeRegistry';
import {
  scheduleTriggerDefinition,
  fetchInvoiceDefinition,
  sendEmailDefinition
} from './invoiceNodeDefinitions';

/**
 * Register all available node types
 * This is called once when the application starts
 */
export function registerAllNodes() {
  // Register Invoice Workflow nodes only
  nodeRegistry.register(scheduleTriggerDefinition);
  nodeRegistry.register(fetchInvoiceDefinition);
  nodeRegistry.register(sendEmailDefinition);
}

// Auto-register on import
registerAllNodes();
