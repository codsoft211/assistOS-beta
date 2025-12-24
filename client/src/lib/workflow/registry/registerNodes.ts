import { nodeRegistry } from './NodeRegistry';
import {
  manualTriggerDefinition,
  crudRecordDefinition,
  httpRequestDefinition,
  conditionDefinition
} from './nodeDefinitions';
import {
  scheduleTriggerDefinition,
  fetchInvoiceDefinition,
  sendEmailDefinition
} from './invoiceNodeDefinitions';
import {
  openAITextDefinition,
  openAIImageDefinition,
  anthropicTextDefinition,
  googleGeminiDefinition,
  aiSentimentDefinition,
  aiSummaryDefinition
} from './aiNodeDefinitions';
import {
  filterNodeDefinition,
  sortNodeDefinition,
  aggregateNodeDefinition,
  slackNodeDefinition,
  whatsappNodeDefinition,
  discordNodeDefinition
} from './dataNodeDefinitions';
import {
  delayNodeDefinition,
  webhookListenerDefinition,
  mergeNodeDefinition
} from './utilityNodeDefinitions';
import { allEnterpriseNodes } from './enterpriseNodes';

/**
 * Node Registration Registry
 * Registers all available node types in the system
 */

// Core Nodes
nodeRegistry.register(manualTriggerDefinition);
nodeRegistry.register(crudRecordDefinition);
nodeRegistry.register(httpRequestDefinition);
nodeRegistry.register(conditionDefinition);

// Invoice Nodes
nodeRegistry.register(scheduleTriggerDefinition);
nodeRegistry.register(fetchInvoiceDefinition);
nodeRegistry.register(sendEmailDefinition);

// AI Nodes
nodeRegistry.register(openAITextDefinition);
nodeRegistry.register(openAIImageDefinition);
nodeRegistry.register(anthropicTextDefinition);
nodeRegistry.register(googleGeminiDefinition);
nodeRegistry.register(aiSentimentDefinition);
nodeRegistry.register(aiSummaryDefinition);

// Data & Communication Nodes
nodeRegistry.register(filterNodeDefinition);
nodeRegistry.register(sortNodeDefinition);
nodeRegistry.register(aggregateNodeDefinition);
nodeRegistry.register(slackNodeDefinition);
nodeRegistry.register(whatsappNodeDefinition);
nodeRegistry.register(discordNodeDefinition);

// Utility Nodes
nodeRegistry.register(delayNodeDefinition);
nodeRegistry.register(webhookListenerDefinition);
nodeRegistry.register(mergeNodeDefinition);

// 🚀 Enterprise Expansion Nodes (100+)
allEnterpriseNodes.forEach(node => {
  nodeRegistry.register(node);
});
