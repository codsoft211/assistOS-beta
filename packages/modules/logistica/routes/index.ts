/**
 * LogísticaModule - API Routes
 */

export const logisticaRoutes = [
  // Warehouses
  { method: 'GET', path: '/api/logistica/warehouses', handler: 'listWarehouses' },
  { method: 'POST', path: '/api/logistica/warehouses', handler: 'createWarehouse' },
  { method: 'GET', path: '/api/logistica/warehouses/:id', handler: 'getWarehouse' },
  { method: 'PATCH', path: '/api/logistica/warehouses/:id', handler: 'updateWarehouse' },
  { method: 'DELETE', path: '/api/logistica/warehouses/:id', handler: 'deleteWarehouse' },
  
  // Locations
  { method: 'GET', path: '/api/logistica/locations', handler: 'listLocations' },
  { method: 'POST', path: '/api/logistica/locations', handler: 'createLocation' },
  { method: 'GET', path: '/api/logistica/locations/:id', handler: 'getLocation' },
  
  // Inventory Levels
  { method: 'GET', path: '/api/logistica/inventory-levels', handler: 'listInventoryLevels' },
  { method: 'GET', path: '/api/logistica/inventory-levels/:id', handler: 'getInventoryLevel' },
  { method: 'PATCH', path: '/api/logistica/inventory-levels/:id', handler: 'updateInventoryLevel' },
  
  // Stock Moves
  { method: 'GET', path: '/api/logistica/stock-moves', handler: 'listStockMoves' },
  { method: 'POST', path: '/api/logistica/stock-moves', handler: 'createStockMove' },
  { method: 'GET', path: '/api/logistica/stock-moves/:id', handler: 'getStockMove' },
  { method: 'PATCH', path: '/api/logistica/stock-moves/:id/complete', handler: 'completeStockMove' },
  
  // Equipment Allocations
  { method: 'GET', path: '/api/logistica/allocations', handler: 'listAllocations' },
  { method: 'POST', path: '/api/logistica/allocations', handler: 'createAllocation' },
  { method: 'GET', path: '/api/logistica/allocations/:id', handler: 'getAllocation' },
  { method: 'POST', path: '/api/logistica/allocations/:id/checkout', handler: 'checkoutAllocation' },
  { method: 'POST', path: '/api/logistica/allocations/:id/checkin', handler: 'checkinAllocation' },
  { method: 'DELETE', path: '/api/logistica/allocations/:id', handler: 'cancelAllocation' },
  
  // Equipment Conditions
  { method: 'GET', path: '/api/logistica/equipment-conditions', handler: 'listEquipmentConditions' },
  { method: 'POST', path: '/api/logistica/equipment-conditions', handler: 'createEquipmentCondition' },
  { method: 'GET', path: '/api/logistica/equipment-conditions/:id', handler: 'getEquipmentCondition' },
  
  // Picking Batches
  { method: 'GET', path: '/api/logistica/picking-batches', handler: 'listPickingBatches' },
  { method: 'POST', path: '/api/logistica/picking-batches', handler: 'createPickingBatch' },
  { method: 'GET', path: '/api/logistica/picking-batches/:id', handler: 'getPickingBatch' },
  
  // Reordering Rules
  { method: 'GET', path: '/api/logistica/reordering-rules', handler: 'listReorderingRules' },
  { method: 'POST', path: '/api/logistica/reordering-rules', handler: 'createReorderingRule' },
  { method: 'GET', path: '/api/logistica/reordering-rules/:id', handler: 'getReorderingRule' },
  { method: 'PATCH', path: '/api/logistica/reordering-rules/:id', handler: 'updateReorderingRule' },
  
  // Maintenance Schedule
  { method: 'GET', path: '/api/logistica/maintenance', handler: 'listMaintenanceSchedule' },
  { method: 'POST', path: '/api/logistica/maintenance', handler: 'createMaintenanceSchedule' },
  { method: 'GET', path: '/api/logistica/maintenance/:id', handler: 'getMaintenanceSchedule' },
  { method: 'PATCH', path: '/api/logistica/maintenance/:id/complete', handler: 'completeMaintenanceSchedule' },
  
  // Inventory Batches
  { method: 'GET', path: '/api/logistica/inventory-batches', handler: 'listInventoryBatches' },
  { method: 'GET', path: '/api/logistica/inventory-batches/:id', handler: 'getInventoryBatch' },
  
  // Stock Alerts
  { method: 'GET', path: '/api/logistica/stock-alerts', handler: 'listStockAlerts' },
  { method: 'PATCH', path: '/api/logistica/stock-alerts/:id/acknowledge', handler: 'acknowledgeStockAlert' },
  
  // Inventory Counts
  { method: 'GET', path: '/api/logistica/inventory-counts', handler: 'listInventoryCounts' },
  { method: 'POST', path: '/api/logistica/inventory-counts', handler: 'createInventoryCount' },
  
  // Analytics & Reports
  { method: 'GET', path: '/api/logistica/analytics/stock-summary', handler: 'getStockSummary' },
  { method: 'GET', path: '/api/logistica/analytics/availability', handler: 'checkAvailability' },
  { method: 'GET', path: '/api/logistica/analytics/conflicts', handler: 'detectConflicts' },
  { method: 'GET', path: '/api/logistica/analytics/replenishment-suggestions', handler: 'getReplenishmentSuggestions' },
  { method: 'GET', path: '/api/logistica/analytics/equipment-utilization', handler: 'getEquipmentUtilization' },
];
