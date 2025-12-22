/**
 * AssistME Hybrid Intelligence Engine - Main Export
 */

// Import Communication tools to auto-register them (WhatsApp, Email, etc.)
import '../../tools/assistme/communication';
// Import Logistics tools to auto-register them
import '../../tools/assistme/logistics';
// Import Procurement tools to auto-register them
import '../../tools/assistme/procurement';
// Import Sales tools to auto-register them
import '../../tools/assistme/sales';
// Import Marketing tools to auto-register them
import '../../tools/assistme/marketing';
// Import Accounting tools to auto-register them
import '../../tools/assistme/accounting';
// Import CRM tools to auto-register them
import '../../tools/assistme/crm';
// Import Financial tools to auto-register them
import '../../tools/assistme/financial';
// Import Project tools to auto-register them
import '../../tools/assistme/projects';
// Import HR tools to auto-register them
import '../../tools/assistme/hr';
// Import Discovery tools to auto-register them
import '../../tools/assistme/discovery';

export { hybridIntelligenceOrchestrator } from './orchestrator';
export { HybridMode } from './types';
export type { 
  HybridResponse, 
  ClassificationResult, 
  TenantContext,
  StreamCallbacks 
} from './types';
