import { toolRegistry } from '../../kernel/registry';

// Import all ToolBase classes
import { CheckStockTool } from './check-stock';
import { ListStockItemsTool } from './list-stock-items';
import { CreateStockMovementTool } from './create-stock-movement';
import { TransferStockTool } from './transfer-stock';
import { ListWarehousesTool } from './list-warehouses';
import { CreateWarehouseTool } from './create-warehouse';
import { StockAlertTool } from './stock-alert';
import { StockValuationTool } from './stock-valuation';
import { CreatePickingListTool } from './create-picking-list';
import { ReceiveGoodsTool } from './receive-goods';
import { ShipOrderTool } from './ship-order';
import { StockCountTool } from './stock-count';
import { AdjustStockTool } from './adjust-stock';
import { TrackLotTool } from './track-lot';
import { StockForecastTool } from './stock-forecast';
import { ListProductsTool } from './list-products';
import { ListJobSitesTool } from './list-job-sites';

// Instantiate ToolBase classes
const logisticsTools = [
  new CheckStockTool(),
  new ListStockItemsTool(),
  new CreateStockMovementTool(),
  new TransferStockTool(),
  new ListWarehousesTool(),
  new CreateWarehouseTool(),
  new StockAlertTool(),
  new StockValuationTool(),
  new CreatePickingListTool(),
  new ReceiveGoodsTool(),
  new ShipOrderTool(),
  new StockCountTool(),
  new AdjustStockTool(),
  new TrackLotTool(),
  new StockForecastTool(),
  new ListProductsTool(),
  new ListJobSitesTool(),
];

// Auto-register all tools
for (const tool of logisticsTools) {
  toolRegistry.register(tool);
}

console.log(`[Logistics] Registered ${logisticsTools.length} tools`);

// Export for direct usage if needed
export { CheckStockTool } from './check-stock';
export { ListStockItemsTool } from './list-stock-items';
export { CreateStockMovementTool } from './create-stock-movement';
export { TransferStockTool } from './transfer-stock';
export { ListWarehousesTool } from './list-warehouses';
export { CreateWarehouseTool } from './create-warehouse';
export { StockAlertTool } from './stock-alert';
export { StockValuationTool } from './stock-valuation';
export { CreatePickingListTool } from './create-picking-list';
export { ReceiveGoodsTool } from './receive-goods';
export { ShipOrderTool } from './ship-order';
export { StockCountTool } from './stock-count';
export { AdjustStockTool } from './adjust-stock';
export { TrackLotTool } from './track-lot';
export { StockForecastTool } from './stock-forecast';
export { ListProductsTool } from './list-products';
export { ListJobSitesTool } from './list-job-sites';
