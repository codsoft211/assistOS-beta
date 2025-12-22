// GROUP 1: CUSTOMERS (8 tools)
import { CreateCustomerTool } from './create-customer';
import { SearchCustomersTool } from './search-customers';
import { UpdateCustomerTool } from './update-customer';
import { ListCustomersTool } from './list-customers';
import { MergeCustomersTool } from './merge-customers';
import { EnrichCustomerTool } from './enrich-customer';
import { SegmentCustomersTool } from './segment-customers';
import { ExportCustomersTool } from './export-customers';

// GROUP 2: CONTACTS (2 tools)
import { CreateContactTool } from './create-contact';
import { ListContactsTool } from './list-contacts';

// GROUP 3: LEADS (3 tools)
import { CreateLeadTool } from './create-lead';
import { QualifyLeadTool } from './qualify-lead';
import { ConvertLeadTool } from './convert-lead';

// GROUP 4: OPPORTUNITIES (3 tools)
import { CreateOpportunityTool } from './create-opportunity';
import { UpdateOpportunityTool } from './update-opportunity';
import { ListOpportunitiesTool } from './list-opportunities';

// GROUP 5: ACTIVITIES (3 tools)
import { CreateActivityTool } from './create-activity';
import { LogCallTool } from './log-call';
import { LogEmailTool } from './log-email';

// GROUP 6: PIPELINE (1 tool)
import { CreatePipelineTool } from './create-pipeline';

// GROUP 7: ADVANCED CRM (10 new tools)
import { DeduplicateContactsTool } from './deduplicate-contacts';
import { AdvancedCustomerSearchTool } from './advanced-customer-search';
import { BulkUpdateCustomersTool } from './bulk-update-customers';
import { BulkTagCustomersTool } from './bulk-tag-customers';
import { ImportContactsWorkflowTool } from './import-contacts-workflow';
import { ActivityTimelineTool } from './activity-timeline';
import { TrackRelationshipTool } from './track-relationship';
import { AssignTerritoryTool } from './assign-territory';
import { ScoreContactsTool } from './score-contacts';
import { ForecastDealsTool } from './forecast-deals';

import { toolRegistry } from '../../kernel';

// All 30 CRM tools
export const crmTools = [
  // GROUP 1: CUSTOMERS
  new CreateCustomerTool(),
  new SearchCustomersTool(),
  new UpdateCustomerTool(),
  new ListCustomersTool(),
  new MergeCustomersTool(),
  new EnrichCustomerTool(),
  new SegmentCustomersTool(),
  new ExportCustomersTool(),
  
  // GROUP 2: CONTACTS
  new CreateContactTool(),
  new ListContactsTool(),
  
  // GROUP 3: LEADS
  new CreateLeadTool(),
  new QualifyLeadTool(),
  new ConvertLeadTool(),
  
  // GROUP 4: OPPORTUNITIES
  new CreateOpportunityTool(),
  new UpdateOpportunityTool(),
  new ListOpportunitiesTool(),
  
  // GROUP 5: ACTIVITIES
  new CreateActivityTool(),
  new LogCallTool(),
  new LogEmailTool(),
  
  // GROUP 6: PIPELINE
  new CreatePipelineTool(),
  
  // GROUP 7: ADVANCED CRM
  new DeduplicateContactsTool(),
  new AdvancedCustomerSearchTool(),
  new BulkUpdateCustomersTool(),
  new BulkTagCustomersTool(),
  new ImportContactsWorkflowTool(),
  new ActivityTimelineTool(),
  new TrackRelationshipTool(),
  new AssignTerritoryTool(),
  new ScoreContactsTool(),
  new ForecastDealsTool()
];

// Auto-register all CRM tools on import
for (const tool of crmTools) {
  toolRegistry.register(tool);
}

// Export all classes
export * from './create-customer';
export * from './search-customers';
export * from './update-customer';
export * from './list-customers';
export * from './merge-customers';
export * from './enrich-customer';
export * from './segment-customers';
export * from './export-customers';
export * from './create-contact';
export * from './list-contacts';
export * from './create-lead';
export * from './qualify-lead';
export * from './convert-lead';
export * from './create-opportunity';
export * from './update-opportunity';
export * from './list-opportunities';
export * from './create-activity';
export * from './log-call';
export * from './log-email';
export * from './create-pipeline';
export * from './deduplicate-contacts';
export * from './advanced-customer-search';
export * from './bulk-update-customers';
export * from './bulk-tag-customers';
export * from './import-contacts-workflow';
export * from './activity-timeline';
export * from './track-relationship';
export * from './assign-territory';
export * from './score-contacts';
export * from './forecast-deals';
