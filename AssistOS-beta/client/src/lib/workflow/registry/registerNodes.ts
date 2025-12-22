import { nodeRegistry } from './NodeRegistry';
import {
  scheduleTriggerDefinition,
  fetchInvoiceDefinition,
  sendEmailDefinition
} from './invoiceNodeDefinitions';
import {
  manualTriggerDefinition,
  crudRecordDefinition,
  httpRequestDefinition,
  conditionDefinition,
  setNodeDefinition,
  waitNodeDefinition,
  codeNodeDefinition,
  jsonNodeDefinition,
  aiChatNodeDefinition,
  mergeNodeDefinition,
  postgresNodeDefinition
} from './nodeDefinitions';
import {
  webhookTriggerDefinition,
  slackNodeDefinition,
  discordNodeDefinition,
  telegramNodeDefinition,
  whatsappNodeDefinition,
  twitterNodeDefinition,
  linkedinNodeDefinition,
  youtubeNodeDefinition,
  rssTriggerDefinition,
  facebookNodeDefinition,
  instagramNodeDefinition,
  twilioNodeDefinition,
  redditNodeDefinition,
  pinterestNodeDefinition,
  tiktokNodeDefinition,
  mattermostNodeDefinition,
  rocketChatNodeDefinition
} from './socialNodeDefinitions';

/**
 * Register all available node types
 * This is called once when the application starts
 */
export function registerAllNodes() {
  // Register Invoice Workflow nodes
  nodeRegistry.register(scheduleTriggerDefinition);
  nodeRegistry.register(fetchInvoiceDefinition);
  nodeRegistry.register(sendEmailDefinition);

  // Register Core / Utility nodes
  nodeRegistry.register(manualTriggerDefinition);
  nodeRegistry.register(crudRecordDefinition);
  nodeRegistry.register(httpRequestDefinition);
  nodeRegistry.register(conditionDefinition);
  nodeRegistry.register(setNodeDefinition);
  nodeRegistry.register(waitNodeDefinition);
  nodeRegistry.register(codeNodeDefinition);
  nodeRegistry.register(jsonNodeDefinition);
  nodeRegistry.register(aiChatNodeDefinition);
  nodeRegistry.register(mergeNodeDefinition);
  nodeRegistry.register(postgresNodeDefinition);

  // Register Social / Messaging nodes
  nodeRegistry.register(webhookTriggerDefinition);
  nodeRegistry.register(slackNodeDefinition);
  nodeRegistry.register(discordNodeDefinition);
  nodeRegistry.register(telegramNodeDefinition);
  nodeRegistry.register(whatsappNodeDefinition);
  nodeRegistry.register(twitterNodeDefinition);
  nodeRegistry.register(linkedinNodeDefinition);
  nodeRegistry.register(youtubeNodeDefinition);
  nodeRegistry.register(rssTriggerDefinition);
  nodeRegistry.register(facebookNodeDefinition);
  nodeRegistry.register(instagramNodeDefinition);
  nodeRegistry.register(twilioNodeDefinition);
  nodeRegistry.register(redditNodeDefinition);
  nodeRegistry.register(pinterestNodeDefinition);
  nodeRegistry.register(tiktokNodeDefinition);
  nodeRegistry.register(mattermostNodeDefinition);
  nodeRegistry.register(rocketChatNodeDefinition);
}

// Auto-register on import
registerAllNodes();
