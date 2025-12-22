import { ToolDefinitionAdapter } from '../../kernel/adapters';
import { toolRegistry } from '../../kernel/registry';

// Import all tools
import { CreateMarketingLeadTool } from './create-lead';
import { UpdateLeadSourceTool } from './update-lead-source';
import { ScoreLeadMarketingTool } from './score-lead-marketing';
import { TrackLeadActivityTool } from './track-lead-activity';
import { SegmentLeadsTool } from './segment-leads';
import { ConvertMarketingLeadTool } from './convert-marketing-lead';
import { GetConversionFunnelTool } from './get-conversion-funnel';
import { AnalyzeLeadSourcesTool } from './analyze-lead-sources';
import { ListCampaignsTool } from './list-campaigns';
import { GetCampaignPerformanceTool } from './get-campaign-performance';
import { UpdateCampaignStatusTool } from './update-campaign-status';
import { importLeadsFromFile } from './import-leads-from-file';

// Wrap ToolDefinition tools with adapter
const marketingTools = [
  new ToolDefinitionAdapter(CreateMarketingLeadTool),
  new ToolDefinitionAdapter(UpdateLeadSourceTool),
  new ToolDefinitionAdapter(ScoreLeadMarketingTool),
  new ToolDefinitionAdapter(TrackLeadActivityTool),
  new ToolDefinitionAdapter(SegmentLeadsTool),
  new ToolDefinitionAdapter(ConvertMarketingLeadTool),
  new ToolDefinitionAdapter(GetConversionFunnelTool),
  new ToolDefinitionAdapter(AnalyzeLeadSourcesTool),
  new ToolDefinitionAdapter(ListCampaignsTool),
  new ToolDefinitionAdapter(GetCampaignPerformanceTool),
  new ToolDefinitionAdapter(UpdateCampaignStatusTool),
  new ToolDefinitionAdapter(importLeadsFromFile),
];

// Auto-register all tools
for (const tool of marketingTools) {
  toolRegistry.register(tool);
}

console.log(`[Marketing] Registered ${marketingTools.length} tools`);

// Export for direct usage if needed
export { CreateMarketingLeadTool } from './create-lead';
export { UpdateLeadSourceTool } from './update-lead-source';
export { ScoreLeadMarketingTool } from './score-lead-marketing';
export { TrackLeadActivityTool } from './track-lead-activity';
export { SegmentLeadsTool } from './segment-leads';
export { ConvertMarketingLeadTool } from './convert-marketing-lead';
export { GetConversionFunnelTool } from './get-conversion-funnel';
export { AnalyzeLeadSourcesTool } from './analyze-lead-sources';
export { ListCampaignsTool } from './list-campaigns';
export { GetCampaignPerformanceTool } from './get-campaign-performance';
export { UpdateCampaignStatusTool } from './update-campaign-status';
export { importLeadsFromFile } from './import-leads-from-file';
