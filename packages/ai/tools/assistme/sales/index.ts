import { ToolDefinitionAdapter } from '../../kernel/adapters';
import { toolRegistry } from '../../kernel/registry';

// Import all tools
import { CreateSalesLeadTool } from './create-sales-lead';
import { UpdateLeadStatusTool } from './update-lead-status';
import { CreateBudgetQuoteTool } from './create-budget-quote';
import { UpdateQuoteStatusTool } from './update-quote-status';
import { AssignLeadTool } from './assign-lead';
import { ScoreLeadTool } from './score-lead';
import { ConvertCommercialLeadTool } from './convert-lead';
import { LogSalesActivityTool } from './log-sales-activity';
import { GetPipelineMetricsTool } from './get-pipeline-metrics';
import { ForecastSalesRevenueTool } from './forecast-revenue';
import { ListLeadsTool } from './list-leads';
import { ListLeadActivitiesTool } from './list-lead-activities';

// Wrap ToolDefinition tools with adapter
const salesTools = [
  new ToolDefinitionAdapter(CreateSalesLeadTool),
  new ToolDefinitionAdapter(UpdateLeadStatusTool),
  new ToolDefinitionAdapter(CreateBudgetQuoteTool),
  new ToolDefinitionAdapter(UpdateQuoteStatusTool),
  new ToolDefinitionAdapter(AssignLeadTool),
  new ToolDefinitionAdapter(ScoreLeadTool),
  new ToolDefinitionAdapter(ConvertCommercialLeadTool),
  new ToolDefinitionAdapter(LogSalesActivityTool),
  new ToolDefinitionAdapter(GetPipelineMetricsTool),
  new ToolDefinitionAdapter(ForecastSalesRevenueTool),
  new ToolDefinitionAdapter(ListLeadsTool),
  new ToolDefinitionAdapter(ListLeadActivitiesTool),
];

// Auto-register all tools
for (const tool of salesTools) {
  toolRegistry.register(tool);
}

console.log(`[Sales] Registered ${salesTools.length} tools`);

// Export for direct usage if needed
export { CreateSalesLeadTool } from './create-sales-lead';
export { UpdateLeadStatusTool } from './update-lead-status';
export { CreateBudgetQuoteTool } from './create-budget-quote';
export { UpdateQuoteStatusTool } from './update-quote-status';
export { AssignLeadTool } from './assign-lead';
export { ScoreLeadTool } from './score-lead';
export { ConvertCommercialLeadTool } from './convert-lead';
export { LogSalesActivityTool } from './log-sales-activity';
export { GetPipelineMetricsTool } from './get-pipeline-metrics';
export { ForecastSalesRevenueTool } from './forecast-revenue';
export { ListLeadsTool } from './list-leads';
export { ListLeadActivitiesTool } from './list-lead-activities';
