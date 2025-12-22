/**
 * Production Module - API Routes
 */

export const productionRoutes = [
  // Production Orders
  { method: 'GET', path: '/api/production/orders', handler: 'listProductionOrders' },
  { method: 'POST', path: '/api/production/orders', handler: 'createProductionOrder' },
  { method: 'GET', path: '/api/production/orders/:id', handler: 'getProductionOrder' },
  { method: 'PATCH', path: '/api/production/orders/:id', handler: 'updateProductionOrder' },
  { method: 'DELETE', path: '/api/production/orders/:id', handler: 'deleteProductionOrder' },
  { method: 'POST', path: '/api/production/orders/:id/start', handler: 'startProductionOrder' },
  { method: 'POST', path: '/api/production/orders/:id/complete', handler: 'completeProductionOrder' },
  { method: 'POST', path: '/api/production/orders/:id/cancel', handler: 'cancelProductionOrder' },
  
  // Work Orders
  { method: 'GET', path: '/api/production/work-orders', handler: 'listWorkOrders' },
  { method: 'POST', path: '/api/production/work-orders', handler: 'createWorkOrder' },
  { method: 'GET', path: '/api/production/work-orders/:id', handler: 'getWorkOrder' },
  { method: 'PATCH', path: '/api/production/work-orders/:id', handler: 'updateWorkOrder' },
  { method: 'POST', path: '/api/production/work-orders/:id/start', handler: 'startWorkOrder' },
  { method: 'POST', path: '/api/production/work-orders/:id/complete', handler: 'completeWorkOrder' },
  { method: 'POST', path: '/api/production/work-orders/:id/pause', handler: 'pauseWorkOrder' },
  
  // Bill of Materials (BOM)
  { method: 'GET', path: '/api/production/bom', handler: 'listBOMs' },
  { method: 'POST', path: '/api/production/bom', handler: 'createBOM' },
  { method: 'GET', path: '/api/production/bom/:id', handler: 'getBOM' },
  { method: 'PATCH', path: '/api/production/bom/:id', handler: 'updateBOM' },
  { method: 'DELETE', path: '/api/production/bom/:id', handler: 'deleteBOM' },
  
  // BOM Lines
  { method: 'GET', path: '/api/production/bom/:bomId/lines', handler: 'listBOMLines' },
  { method: 'POST', path: '/api/production/bom/:bomId/lines', handler: 'addBOMLine' },
  { method: 'PATCH', path: '/api/production/bom/:bomId/lines/:lineId', handler: 'updateBOMLine' },
  { method: 'DELETE', path: '/api/production/bom/:bomId/lines/:lineId', handler: 'deleteBOMLine' },
  
  // Work Centers
  { method: 'GET', path: '/api/production/work-centers', handler: 'listWorkCenters' },
  { method: 'POST', path: '/api/production/work-centers', handler: 'createWorkCenter' },
  { method: 'GET', path: '/api/production/work-centers/:id', handler: 'getWorkCenter' },
  { method: 'PATCH', path: '/api/production/work-centers/:id', handler: 'updateWorkCenter' },
  
  // Production Operations
  { method: 'GET', path: '/api/production/operations', handler: 'listOperations' },
  { method: 'POST', path: '/api/production/operations', handler: 'createOperation' },
  { method: 'GET', path: '/api/production/operations/:id', handler: 'getOperation' },
  
  // Quality Checks
  { method: 'GET', path: '/api/production/quality-checks', handler: 'listQualityChecks' },
  { method: 'POST', path: '/api/production/quality-checks', handler: 'createQualityCheck' },
  { method: 'PATCH', path: '/api/production/quality-checks/:id', handler: 'updateQualityCheck' },
  
  // Material Requisitions
  { method: 'GET', path: '/api/production/material-requisitions', handler: 'listMaterialRequisitions' },
  { method: 'POST', path: '/api/production/material-requisitions', handler: 'createMaterialRequisition' },
  { method: 'PATCH', path: '/api/production/material-requisitions/:id/fulfill', handler: 'fulfillMaterialRequisition' },
  
  // Scheduling
  { method: 'GET', path: '/api/production/schedule', handler: 'getProductionSchedule' },
  { method: 'POST', path: '/api/production/schedule', handler: 'scheduleProduction' },
  { method: 'GET', path: '/api/production/schedule/capacity', handler: 'getCapacity' },
  
  // Analytics
  { method: 'GET', path: '/api/production/analytics/oee', handler: 'getOEE' },
  { method: 'GET', path: '/api/production/analytics/throughput', handler: 'getThroughput' },
  { method: 'GET', path: '/api/production/analytics/efficiency', handler: 'getEfficiency' },
];

