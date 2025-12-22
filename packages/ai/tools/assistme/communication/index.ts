import { toolRegistry } from '../../kernel/registry';

// Import all ToolBase classes
import { SendWhatsAppMessageTool } from './send-whatsapp-message';
import { SendWhatsAppTemplateTool } from './send-whatsapp-template';
import { ListWhatsAppConversationsTool } from './list-whatsapp-conversations';
import { GetWhatsAppMessagesTool } from './get-whatsapp-messages';
import { SearchWhatsAppContactsTool } from './search-whatsapp-contacts';
import { HandleWhatsAppAutomationResponseTool } from './handle-whatsapp-automation-response';

// Instantiate ToolBase classes
const communicationTools = [
  new SendWhatsAppMessageTool(),
  new SendWhatsAppTemplateTool(),
  new ListWhatsAppConversationsTool(),
  new GetWhatsAppMessagesTool(),
  new SearchWhatsAppContactsTool(),
  new HandleWhatsAppAutomationResponseTool(),
];

// Auto-register all tools
for (const tool of communicationTools) {
  toolRegistry.register(tool);
}

console.log(`[Communication] Registered ${communicationTools.length} tools`);

// Export for direct usage if needed
export { SendWhatsAppMessageTool } from './send-whatsapp-message';
export { SendWhatsAppTemplateTool } from './send-whatsapp-template';
export { ListWhatsAppConversationsTool } from './list-whatsapp-conversations';
export { GetWhatsAppMessagesTool } from './get-whatsapp-messages';
export { SearchWhatsAppContactsTool } from './search-whatsapp-contacts';
export { HandleWhatsAppAutomationResponseTool } from './handle-whatsapp-automation-response';
