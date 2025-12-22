import { 
  warehouses,
  warehouseLocations,
  inventoryLevels,
  inventoryBatches,
  inventoryTransactions,
  inventoryCounts,
  stockAlerts,
  stockMoves,
  equipmentAllocations,
  equipmentConditions,
  pickingBatches,
  reorderingRules,
  maintenanceSchedule
} from '../../../../shared/schema';

export type Warehouse = typeof warehouses.$inferSelect;
export type WarehouseLocation = typeof warehouseLocations.$inferSelect;
export type InventoryLevel = typeof inventoryLevels.$inferSelect;
export type InventoryBatch = typeof inventoryBatches.$inferSelect;
export type InventoryTransaction = typeof inventoryTransactions.$inferSelect;
export type InventoryCount = typeof inventoryCounts.$inferSelect;
export type StockAlert = typeof stockAlerts.$inferSelect;
export type StockMove = typeof stockMoves.$inferSelect;
export type EquipmentAllocation = typeof equipmentAllocations.$inferSelect;
export type EquipmentCondition = typeof equipmentConditions.$inferSelect;
export type PickingBatch = typeof pickingBatches.$inferSelect;
export type ReorderingRule = typeof reorderingRules.$inferSelect;
export type MaintenanceSchedule = typeof maintenanceSchedule.$inferSelect;

export const logisticaEntities = {
  warehouses,
  warehouseLocations,
  inventoryLevels,
  inventoryBatches,
  inventoryTransactions,
  inventoryCounts,
  stockAlerts,
  stockMoves,
  equipmentAllocations,
  equipmentConditions,
  pickingBatches,
  reorderingRules,
  maintenanceSchedule
};

export const logisticaEntityNames = [
  'warehouses',
  'warehouseLocations',
  'inventoryLevels',
  'inventoryBatches',
  'inventoryTransactions',
  'inventoryCounts',
  'stockAlerts',
  'stockMoves',
  'equipmentAllocations',
  'equipmentConditions',
  'pickingBatches',
  'reorderingRules',
  'maintenanceSchedule'
] as const;

export type LogisticaEntityName = typeof logisticaEntityNames[number];
