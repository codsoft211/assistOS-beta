/**
 * Módulo Compras - Procurement Module
 * 
 * Complete procurement module with suppliers, requisitions, RFQs, POs,
 * receipts, invoices, payments, and employee expenses.
 * 
 * Entidades principais:
 * - Suppliers & Product Suppliers
 * - Purchase Requisitions & RFQs
 * - Purchase Orders & Receipts
 * - Purchasing Invoices & Payments
 * - Employee Expenses
 */

import type {
  IModule,
  ModuleMetadata,
  EntityDefinition,
  WorkflowDefinition,
  ModuleTool,
  RouteDefinition,
  ModuleHooks,
  ModuleDataInterface,
  ModuleContext,
  Filter
} from '../base/module.interface';

import { db } from '../../../apps/api/db';
import { eq, and } from 'drizzle-orm';
import { comprasWorkflows } from './workflows/index.js';
import { comprasRoutes } from './routes/index.js';
import { comprasTools } from './tools/index.js';

// ============================================================================
// COMPRAS MODULE
// ============================================================================

export class ComprasModule implements IModule {
  private tenantId?: string;
  
  metadata: ModuleMetadata = {
    id: 'purchasing',
    name: 'Purchasing',
    version: '1.0.0',
    category: 'purchasing',
    description: 'Complete procurement: suppliers, requisitions, RFQs, POs, receipts, invoices, payments, expenses',
    icon: 'ShoppingCart',
    dependencies: [],
    permissions: [
      { key: 'purchasing.read', name: 'View purchasing data' },
      { key: 'purchasing.write', name: 'Create/edit purchasing data' },
      { key: 'purchasing.delete', name: 'Delete purchasing data' },
      { key: 'purchasing.approve', name: 'Approve requisitions and invoices' },
      { key: 'purchasing.payments', name: 'Manage supplier payments' }
    ]
  };
  
  // ============================================================================
  // ENTITIES (20 procurement tables)
  // ============================================================================
  
  entities: EntityDefinition[] = [
    // ========== SUPPLIERS ==========
    {
      name: 'suppliers',
      schema: {
        fields: [
          { name: 'id', type: 'text', required: true },
          { name: 'code', type: 'text', required: true, unique: true },
          { name: 'name', type: 'text', required: true },
          { name: 'legalName', type: 'text' },
          { name: 'taxId', type: 'text' },
          { name: 'address', type: 'text' },
          { name: 'city', type: 'text' },
          { name: 'postalCode', type: 'text' },
          { name: 'country', type: 'text', default: 'PT' },
          { name: 'email', type: 'email' },
          { name: 'phone', type: 'phone' },
          { name: 'website', type: 'url' },
          { name: 'primaryContactName', type: 'text' },
          { name: 'primaryContactEmail', type: 'email' },
          { name: 'primaryContactPhone', type: 'phone' },
          { name: 'category', type: 'text' },
          { name: 'type', type: 'enum', options: ['preferred', 'approved', 'trial', 'blocked'], default: 'approved' },
          { name: 'paymentTerms', type: 'text' },
          { name: 'deliveryTerms', type: 'text' },
          { name: 'currency', type: 'text', default: 'EUR' },
          { name: 'minimumOrderValue', type: 'decimal' },
          { name: 'averageLeadTimeDays', type: 'number' },
          { name: 'onTimeDeliveryRate', type: 'decimal' },
          { name: 'qualityScore', type: 'decimal' },
          { name: 'priceCompetitiveness', type: 'decimal' },
          { name: 'communicationScore', type: 'decimal' },
          { name: 'overallScore', type: 'decimal' },
          { name: 'totalOrdersCount', type: 'number', default: 0 },
          { name: 'totalOrdersValue', type: 'decimal', default: 0 },
          { name: 'averageOrderValue', type: 'decimal' },
          { name: 'lastOrderDate', type: 'date' },
          { name: 'defectRate', type: 'decimal', default: 0 },
          { name: 'returnRate', type: 'decimal', default: 0 },
          { name: 'complaintCount', type: 'number', default: 0 },
          { name: 'bankName', type: 'text' },
          { name: 'iban', type: 'text' },
          { name: 'swiftBic', type: 'text' },
          { name: 'isActive', type: 'boolean', default: true },
          { name: 'blockedReason', type: 'text' },
          { name: 'notes', type: 'text' },
          { name: 'createdBy', type: 'relation', ref: 'users' },
          { name: 'updatedBy', type: 'relation', ref: 'users' }
        ],
        timestamps: true,
        tenantIsolation: true
      },
      relationships: [
        { type: 'hasMany', target: 'product_suppliers', foreignKey: 'supplierId' },
        { type: 'hasMany', target: 'purchase_orders', foreignKey: 'supplierId' },
        { type: 'hasMany', target: 'rfqs', foreignKey: 'supplierId' },
        { type: 'hasMany', target: 'purchasing_invoices', foreignKey: 'supplierId' },
        { type: 'hasMany', target: 'purchasing_payments', foreignKey: 'supplierId' }
      ],
      indexes: [
        { fields: ['tenantId'] },
        { fields: ['type'] },
        { fields: ['overallScore'] }
      ],
      softDelete: false
    },
    
    // ========== PRODUCT SUPPLIERS ==========
    {
      name: 'product_suppliers',
      schema: {
        fields: [
          { name: 'id', type: 'text', required: true },
          { name: 'productId', type: 'relation', ref: 'products', required: true },
          { name: 'supplierId', type: 'relation', ref: 'suppliers', required: true },
          { name: 'supplierProductCode', type: 'text' },
          { name: 'supplierProductName', type: 'text' },
          { name: 'currentPrice', type: 'decimal', required: true },
          { name: 'currency', type: 'text', default: 'EUR' },
          { name: 'priceValidFrom', type: 'date' },
          { name: 'priceValidTo', type: 'date' },
          { name: 'minimumOrderQuantity', type: 'decimal' },
          { name: 'quantityMultiple', type: 'decimal' },
          { name: 'leadTimeDays', type: 'number', required: true },
          { name: 'leadTimeVariance', type: 'number' },
          { name: 'isPreferred', type: 'boolean', default: false },
          { name: 'priority', type: 'number', default: 0 },
          { name: 'orderCount', type: 'number', default: 0 },
          { name: 'lastOrderDate', type: 'date' },
          { name: 'averageDeliveryDays', type: 'decimal' },
          { name: 'onTimeRate', type: 'decimal' },
          { name: 'isActive', type: 'boolean', default: true },
          { name: 'notes', type: 'text' }
        ],
        timestamps: true,
        tenantIsolation: true
      },
      relationships: [
        { type: 'belongsTo', target: 'products', foreignKey: 'productId' },
        { type: 'belongsTo', target: 'suppliers', foreignKey: 'supplierId' },
        { type: 'hasMany', target: 'supplier_price_history', foreignKey: 'productSupplierId' }
      ],
      indexes: [
        { fields: ['productId'] },
        { fields: ['supplierId'] },
        { fields: ['isPreferred'] }
      ],
      softDelete: false
    },
    
    // ========== SUPPLIER PRICE HISTORY ==========
    {
      name: 'supplier_price_history',
      schema: {
        fields: [
          { name: 'id', type: 'text', required: true },
          { name: 'productSupplierId', type: 'relation', ref: 'product_suppliers', required: true },
          { name: 'price', type: 'decimal', required: true },
          { name: 'currency', type: 'text', default: 'EUR' },
          { name: 'validFrom', type: 'date', required: true },
          { name: 'validTo', type: 'date' },
          { name: 'changeReason', type: 'enum', options: ['supplier_increase', 'negotiation', 'market_change', 'volume_discount', 'other'] },
          { name: 'changePercentage', type: 'decimal' },
          { name: 'notes', type: 'text' }
        ],
        timestamps: true,
        tenantIsolation: true
      },
      relationships: [
        { type: 'belongsTo', target: 'product_suppliers', foreignKey: 'productSupplierId' }
      ],
      indexes: [
        { fields: ['productSupplierId'] },
        { fields: ['validFrom'] }
      ],
      softDelete: false
    },
    
    // ========== PURCHASE REQUISITIONS ==========
    {
      name: 'purchase_requisitions',
      schema: {
        fields: [
          { name: 'id', type: 'text', required: true },
          { name: 'code', type: 'text', required: true, unique: true },
          { name: 'requestDate', type: 'date', required: true },
          { name: 'requestedBy', type: 'relation', ref: 'users', required: true },
          { name: 'departmentId', type: 'text' },
          { name: 'projectId', type: 'text' },
          { name: 'source', type: 'enum', options: ['manual', 'auto_reorder', 'forecast', 'project_need'], required: true },
          { name: 'sourceAgentId', type: 'text' },
          { name: 'priority', type: 'enum', options: ['low', 'normal', 'high', 'urgent'], default: 'normal', required: true },
          { name: 'neededByDate', type: 'date' },
          { name: 'justification', type: 'text' },
          { name: 'status', type: 'enum', options: ['draft', 'pending_approval', 'approved', 'rejected', 'converted_to_po'], default: 'draft', required: true },
          { name: 'approvedBy', type: 'relation', ref: 'users' },
          { name: 'approvalDate', type: 'datetime' },
          { name: 'rejectionReason', type: 'text' },
          { name: 'estimatedTotal', type: 'decimal' },
          { name: 'budgetId', type: 'text' },
          { name: 'convertedToPoId', type: 'text' },
          { name: 'conversionDate', type: 'datetime' },
          { name: 'notes', type: 'text' }
        ],
        timestamps: true,
        tenantIsolation: true
      },
      relationships: [
        { type: 'belongsTo', target: 'users', foreignKey: 'requestedBy' },
        { type: 'belongsTo', target: 'users', foreignKey: 'approvedBy' },
        { type: 'hasMany', target: 'purchase_requisition_lines', foreignKey: 'requisitionId' }
      ],
      indexes: [
        { fields: ['tenantId'] },
        { fields: ['status'] },
        { fields: ['requestDate'] }
      ],
      softDelete: false
    },
    
    // ========== PURCHASE REQUISITION LINES ==========
    {
      name: 'purchase_requisition_lines',
      schema: {
        fields: [
          { name: 'id', type: 'text', required: true },
          { name: 'tenantId', type: 'text', required: true },
          { name: 'requisitionId', type: 'relation', ref: 'purchase_requisitions', required: true },
          { name: 'productId', type: 'relation', ref: 'products', required: true },
          { name: 'description', type: 'text' },
          { name: 'quantity', type: 'decimal', required: true },
          { name: 'uom', type: 'text' },
          { name: 'estimatedPrice', type: 'decimal' },
          { name: 'estimatedTotal', type: 'decimal' },
          { name: 'suggestedSupplierId', type: 'relation', ref: 'suppliers' },
          { name: 'suggestionReason', type: 'text' },
          { name: 'suggestionConfidence', type: 'decimal' },
          { name: 'notes', type: 'text' }
        ],
        timestamps: false,
        tenantIsolation: true
      },
      relationships: [
        { type: 'belongsTo', target: 'tenants', foreignKey: 'tenantId' },
        { type: 'belongsTo', target: 'purchase_requisitions', foreignKey: 'requisitionId' },
        { type: 'belongsTo', target: 'products', foreignKey: 'productId' },
        { type: 'belongsTo', target: 'suppliers', foreignKey: 'suggestedSupplierId' }
      ],
      indexes: [
        { fields: ['tenantId'] },
        { fields: ['requisitionId'] }
      ],
      softDelete: false
    },
    
    // ========== RFQS ==========
    {
      name: 'rfqs',
      schema: {
        fields: [
          { name: 'id', type: 'text', required: true },
          { name: 'code', type: 'text', required: true, unique: true },
          { name: 'rfqDate', type: 'date', required: true },
          { name: 'requisitionId', type: 'relation', ref: 'purchase_requisitions' },
          { name: 'supplierIds', type: 'json' },
          { name: 'responseDeadline', type: 'date' },
          { name: 'status', type: 'enum', options: ['draft', 'sent', 'responses_received', 'evaluated', 'converted_to_po', 'cancelled'], default: 'draft', required: true },
          { name: 'createdBy', type: 'enum', options: ['user', 'agent'], default: 'user', required: true },
          { name: 'createdByAgentId', type: 'text' },
          { name: 'selectedQuoteId', type: 'text' },
          { name: 'selectionReason', type: 'text' },
          { name: 'convertedToPoId', type: 'text' },
          { name: 'notes', type: 'text' }
        ],
        timestamps: true,
        tenantIsolation: true
      },
      relationships: [
        { type: 'belongsTo', target: 'purchase_requisitions', foreignKey: 'requisitionId' },
        { type: 'hasMany', target: 'rfq_lines', foreignKey: 'rfqId' },
        { type: 'hasMany', target: 'rfq_quotes', foreignKey: 'rfqId' }
      ],
      indexes: [
        { fields: ['tenantId'] },
        { fields: ['status'] },
        { fields: ['rfqDate'] }
      ],
      softDelete: false
    },
    
    // ========== RFQ LINES ==========
    {
      name: 'rfq_lines',
      schema: {
        fields: [
          { name: 'id', type: 'text', required: true },
          { name: 'tenantId', type: 'text', required: true },
          { name: 'rfqId', type: 'relation', ref: 'rfqs', required: true },
          { name: 'productId', type: 'relation', ref: 'products', required: true },
          { name: 'description', type: 'text' },
          { name: 'quantity', type: 'decimal', required: true },
          { name: 'uom', type: 'text' },
          { name: 'specifications', type: 'text' },
          { name: 'neededByDate', type: 'date' }
        ],
        timestamps: false,
        tenantIsolation: true
      },
      relationships: [
        { type: 'belongsTo', target: 'tenants', foreignKey: 'tenantId' },
        { type: 'belongsTo', target: 'rfqs', foreignKey: 'rfqId' },
        { type: 'belongsTo', target: 'products', foreignKey: 'productId' }
      ],
      indexes: [
        { fields: ['tenantId'] },
        { fields: ['rfqId'] }
      ],
      softDelete: false
    },
    
    // ========== RFQ QUOTES ==========
    {
      name: 'rfq_quotes',
      schema: {
        fields: [
          { name: 'id', type: 'text', required: true },
          { name: 'tenantId', type: 'text', required: true },
          { name: 'rfqId', type: 'relation', ref: 'rfqs', required: true },
          { name: 'supplierId', type: 'relation', ref: 'suppliers', required: true },
          { name: 'quoteDate', type: 'date' },
          { name: 'validUntil', type: 'date' },
          { name: 'totalAmount', type: 'decimal' },
          { name: 'currency', type: 'text', default: 'EUR' },
          { name: 'deliveryLeadTime', type: 'number' },
          { name: 'paymentTerms', type: 'text' },
          { name: 'deliveryTerms', type: 'text' },
          { name: 'priceScore', type: 'decimal' },
          { name: 'leadTimeScore', type: 'decimal' },
          { name: 'supplierScore', type: 'decimal' },
          { name: 'overallScore', type: 'decimal' },
          { name: 'recommendation', type: 'enum', options: ['recommended', 'acceptable', 'not_recommended'] },
          { name: 'notes', type: 'text' },
          { name: 'attachments', type: 'json' }
        ],
        timestamps: true,
        tenantIsolation: true
      },
      relationships: [
        { type: 'belongsTo', target: 'tenants', foreignKey: 'tenantId' },
        { type: 'belongsTo', target: 'rfqs', foreignKey: 'rfqId' },
        { type: 'belongsTo', target: 'suppliers', foreignKey: 'supplierId' },
        { type: 'hasMany', target: 'rfq_quote_lines', foreignKey: 'quoteId' }
      ],
      indexes: [
        { fields: ['tenantId'] },
        { fields: ['rfqId'] },
        { fields: ['supplierId'] }
      ],
      softDelete: false
    },
    
    // ========== RFQ QUOTE LINES ==========
    {
      name: 'rfq_quote_lines',
      schema: {
        fields: [
          { name: 'id', type: 'text', required: true },
          { name: 'tenantId', type: 'text', required: true },
          { name: 'quoteId', type: 'relation', ref: 'rfq_quotes', required: true },
          { name: 'rfqLineId', type: 'relation', ref: 'rfq_lines', required: true },
          { name: 'unitPrice', type: 'decimal' },
          { name: 'quantity', type: 'decimal' },
          { name: 'lineTotal', type: 'decimal' },
          { name: 'leadTimeDays', type: 'number' },
          { name: 'notes', type: 'text' }
        ],
        timestamps: false,
        tenantIsolation: true
      },
      relationships: [
        { type: 'belongsTo', target: 'tenants', foreignKey: 'tenantId' },
        { type: 'belongsTo', target: 'rfq_quotes', foreignKey: 'quoteId' },
        { type: 'belongsTo', target: 'rfq_lines', foreignKey: 'rfqLineId' }
      ],
      indexes: [
        { fields: ['tenantId'] },
        { fields: ['quoteId'] },
        { fields: ['rfqLineId'] }
      ],
      softDelete: false
    },
    
    // ========== PURCHASE ORDERS ==========
    {
      name: 'purchase_orders',
      schema: {
        fields: [
          { name: 'id', type: 'text', required: true },
          { name: 'code', type: 'text', required: true, unique: true },
          { name: 'orderDate', type: 'date', required: true },
          { name: 'expectedDeliveryDate', type: 'date' },
          { name: 'supplierId', type: 'relation', ref: 'suppliers', required: true },
          { name: 'supplierContactName', type: 'text' },
          { name: 'supplierContactEmail', type: 'email' },
          { name: 'requisitionId', type: 'relation', ref: 'purchase_requisitions' },
          { name: 'rfqId', type: 'relation', ref: 'rfqs' },
          { name: 'rfqQuoteId', type: 'relation', ref: 'rfq_quotes' },
          { name: 'source', type: 'enum', options: ['manual', 'requisition', 'rfq', 'auto_quick_purchase'], default: 'manual', required: true },
          { name: 'createdByAgentId', type: 'text' },
          { name: 'status', type: 'enum', options: ['draft', 'pending_approval', 'approved', 'sent_to_supplier', 'acknowledged_by_supplier', 'partially_received', 'fully_received', 'cancelled'], default: 'draft', required: true },
          { name: 'approvedBy', type: 'relation', ref: 'users' },
          { name: 'approvalDate', type: 'datetime' },
          { name: 'rejectionReason', type: 'text' },
          { name: 'supplierAcknowledgedAt', type: 'datetime' },
          { name: 'supplierExpectedDelivery', type: 'date' },
          { name: 'supplierComments', type: 'text' },
          { name: 'subtotal', type: 'decimal' },
          { name: 'taxTotal', type: 'decimal' },
          { name: 'shippingCost', type: 'decimal' },
          { name: 'totalAmount', type: 'decimal' },
          { name: 'currency', type: 'text', default: 'EUR' },
          { name: 'deliveryAddress', type: 'text' },
          { name: 'deliveryCity', type: 'text' },
          { name: 'deliveryPostalCode', type: 'text' },
          { name: 'deliveryCountry', type: 'text', default: 'PT' },
          { name: 'paymentTerms', type: 'text' },
          { name: 'deliveryTerms', type: 'text' },
          { name: 'budgetId', type: 'text' },
          { name: 'projectId', type: 'relation', ref: 'projects' },
          { name: 'emailSentAt', type: 'datetime' },
          { name: 'emailSentTo', type: 'email' },
          { name: 'invoiceFormUrl', type: 'text' },
          { name: 'notes', type: 'text' },
          { name: 'createdBy', type: 'relation', ref: 'users' },
          { name: 'updatedBy', type: 'relation', ref: 'users' }
        ],
        timestamps: true,
        tenantIsolation: true
      },
      relationships: [
        { type: 'belongsTo', target: 'suppliers', foreignKey: 'supplierId' },
        { type: 'belongsTo', target: 'purchase_requisitions', foreignKey: 'requisitionId' },
        { type: 'belongsTo', target: 'rfqs', foreignKey: 'rfqId' },
        { type: 'belongsTo', target: 'rfq_quotes', foreignKey: 'rfqQuoteId' },
        { type: 'belongsTo', target: 'projects', foreignKey: 'projectId' },
        { type: 'hasMany', target: 'purchase_order_lines', foreignKey: 'poId' },
        { type: 'hasMany', target: 'receipts', foreignKey: 'poId' }
      ],
      indexes: [
        { fields: ['tenantId'] },
        { fields: ['status'] },
        { fields: ['supplierId'] },
        { fields: ['orderDate'] }
      ],
      softDelete: false
    },
    
    // ========== PURCHASE ORDER LINES ==========
    {
      name: 'purchase_order_lines',
      schema: {
        fields: [
          { name: 'id', type: 'text', required: true },
          { name: 'tenantId', type: 'text', required: true },
          { name: 'poId', type: 'relation', ref: 'purchase_orders', required: true },
          { name: 'requisitionLineId', type: 'relation', ref: 'purchase_requisition_lines' },
          { name: 'rfqQuoteLineId', type: 'relation', ref: 'rfq_quote_lines' },
          { name: 'productId', type: 'relation', ref: 'products' },
          { name: 'description', type: 'text' },
          { name: 'quantity', type: 'decimal', required: true },
          { name: 'uom', type: 'text' },
          { name: 'unitPrice', type: 'decimal' },
          { name: 'lineTotal', type: 'decimal' },
          { name: 'receivedQuantity', type: 'decimal', default: 0 },
          { name: 'remainingQuantity', type: 'decimal' },
          { name: 'notes', type: 'text' }
        ],
        timestamps: false,
        tenantIsolation: true
      },
      relationships: [
        { type: 'belongsTo', target: 'tenants', foreignKey: 'tenantId' },
        { type: 'belongsTo', target: 'purchase_orders', foreignKey: 'poId' },
        { type: 'belongsTo', target: 'purchase_requisition_lines', foreignKey: 'requisitionLineId' },
        { type: 'belongsTo', target: 'rfq_quote_lines', foreignKey: 'rfqQuoteLineId' },
        { type: 'belongsTo', target: 'products', foreignKey: 'productId' }
      ],
      indexes: [
        { fields: ['tenantId'] },
        { fields: ['poId'] }
      ],
      softDelete: false
    },
    
    // ========== RECEIPTS ==========
    {
      name: 'receipts',
      schema: {
        fields: [
          { name: 'id', type: 'text', required: true },
          { name: 'code', type: 'text', required: true, unique: true },
          { name: 'receiptDate', type: 'date', required: true },
          { name: 'poId', type: 'relation', ref: 'purchase_orders', required: true },
          { name: 'warehouseId', type: 'relation', ref: 'warehouses' },
          { name: 'locationId', type: 'relation', ref: 'warehouse_locations' },
          { name: 'receivedBy', type: 'relation', ref: 'users', required: true },
          { name: 'receivedAt', type: 'datetime', required: true },
          { name: 'inspectionStatus', type: 'enum', options: ['pending', 'passed', 'failed', 'partial'], default: 'pending', required: true },
          { name: 'inspectionNotes', type: 'text' },
          { name: 'qualityIssues', type: 'json' },
          { name: 'rejectedQuantity', type: 'decimal' },
          { name: 'acceptedQuantity', type: 'decimal' },
          { name: 'status', type: 'enum', options: ['draft', 'completed', 'partially_accepted', 'rejected'], default: 'draft', required: true },
          { name: 'discrepancyReported', type: 'boolean', default: false, required: true },
          { name: 'discrepancyReason', type: 'text' },
          { name: 'notes', type: 'text' }
        ],
        timestamps: true,
        tenantIsolation: true
      },
      relationships: [
        { type: 'belongsTo', target: 'purchase_orders', foreignKey: 'poId' },
        { type: 'belongsTo', target: 'warehouses', foreignKey: 'warehouseId' },
        { type: 'belongsTo', target: 'warehouse_locations', foreignKey: 'locationId' },
        { type: 'belongsTo', target: 'users', foreignKey: 'receivedBy' },
        { type: 'hasMany', target: 'receipt_lines', foreignKey: 'receiptId' }
      ],
      indexes: [
        { fields: ['tenantId'] },
        { fields: ['poId'] },
        { fields: ['receiptDate'] },
        { fields: ['status'] }
      ],
      softDelete: false
    },
    
    // ========== RECEIPT LINES ==========
    {
      name: 'receipt_lines',
      schema: {
        fields: [
          { name: 'id', type: 'text', required: true },
          { name: 'tenantId', type: 'text', required: true },
          { name: 'receiptId', type: 'relation', ref: 'receipts', required: true },
          { name: 'poLineId', type: 'relation', ref: 'purchase_order_lines' },
          { name: 'productId', type: 'relation', ref: 'products' },
          { name: 'orderedQuantity', type: 'decimal', required: true },
          { name: 'receivedQuantity', type: 'decimal', required: true },
          { name: 'acceptedQuantity', type: 'decimal', required: true },
          { name: 'rejectedQuantity', type: 'decimal', default: 0, required: true },
          { name: 'uom', type: 'text' },
          { name: 'discrepancyReason', type: 'text' },
          { name: 'qualityIssue', type: 'text' },
          { name: 'batchNumber', type: 'text' },
          { name: 'expiryDate', type: 'date' },
          { name: 'locationId', type: 'relation', ref: 'warehouse_locations' },
          { name: 'notes', type: 'text' }
        ],
        timestamps: false,
        tenantIsolation: true
      },
      relationships: [
        { type: 'belongsTo', target: 'tenants', foreignKey: 'tenantId' },
        { type: 'belongsTo', target: 'receipts', foreignKey: 'receiptId' },
        { type: 'belongsTo', target: 'purchase_order_lines', foreignKey: 'poLineId' },
        { type: 'belongsTo', target: 'products', foreignKey: 'productId' },
        { type: 'belongsTo', target: 'warehouse_locations', foreignKey: 'locationId' }
      ],
      indexes: [
        { fields: ['tenantId'] },
        { fields: ['receiptId'] }
      ],
      softDelete: false
    },
    
    // ========== SUPPLIER RETURNS ==========
    {
      name: 'supplier_returns',
      schema: {
        fields: [
          { name: 'id', type: 'text', required: true },
          { name: 'code', type: 'text', required: true, unique: true },
          { name: 'returnDate', type: 'date', required: true },
          { name: 'supplierId', type: 'relation', ref: 'suppliers', required: true },
          { name: 'poId', type: 'relation', ref: 'purchase_orders' },
          { name: 'receiptId', type: 'relation', ref: 'receipts' },
          { name: 'returnReason', type: 'enum', options: ['defective', 'wrong_item', 'excess_quantity', 'damaged', 'expired', 'other'], default: 'defective', required: true },
          { name: 'returnReasonDetails', type: 'text' },
          { name: 'totalReturnValue', type: 'decimal' },
          { name: 'currency', type: 'text', default: 'EUR' },
          { name: 'status', type: 'enum', options: ['draft', 'pending_supplier_approval', 'approved_by_supplier', 'shipped_back', 'received_by_supplier', 'credit_issued', 'completed'], default: 'draft', required: true },
          { name: 'supplierApprovedAt', type: 'datetime' },
          { name: 'creditNoteNumber', type: 'text' },
          { name: 'creditNoteDate', type: 'date' },
          { name: 'creditNoteAmount', type: 'decimal' },
          { name: 'shippingMethod', type: 'text' },
          { name: 'trackingNumber', type: 'text' },
          { name: 'shippedAt', type: 'datetime' },
          { name: 'receivedBySupplierAt', type: 'datetime' },
          { name: 'notes', type: 'text' },
          { name: 'createdBy', type: 'relation', ref: 'users' }
        ],
        timestamps: true,
        tenantIsolation: true
      },
      relationships: [
        { type: 'belongsTo', target: 'suppliers', foreignKey: 'supplierId' },
        { type: 'belongsTo', target: 'purchase_orders', foreignKey: 'poId' },
        { type: 'belongsTo', target: 'receipts', foreignKey: 'receiptId' },
        { type: 'hasMany', target: 'supplier_return_lines', foreignKey: 'returnId' }
      ],
      indexes: [
        { fields: ['tenantId'] },
        { fields: ['supplierId'] },
        { fields: ['status'] },
        { fields: ['returnDate'] }
      ],
      softDelete: false
    },
    
    // ========== SUPPLIER RETURN LINES ==========
    {
      name: 'supplier_return_lines',
      schema: {
        fields: [
          { name: 'id', type: 'text', required: true },
          { name: 'tenantId', type: 'text', required: true },
          { name: 'returnId', type: 'relation', ref: 'supplier_returns', required: true },
          { name: 'receiptLineId', type: 'relation', ref: 'receipt_lines' },
          { name: 'poLineId', type: 'relation', ref: 'purchase_order_lines' },
          { name: 'productId', type: 'relation', ref: 'products' },
          { name: 'quantity', type: 'decimal', required: true },
          { name: 'uom', type: 'text' },
          { name: 'returnReason', type: 'text' },
          { name: 'qualityIssue', type: 'text' },
          { name: 'unitPrice', type: 'decimal' },
          { name: 'lineTotal', type: 'decimal' },
          { name: 'batchNumber', type: 'text' },
          { name: 'expiryDate', type: 'date' },
          { name: 'notes', type: 'text' }
        ],
        timestamps: false,
        tenantIsolation: true
      },
      relationships: [
        { type: 'belongsTo', target: 'tenants', foreignKey: 'tenantId' },
        { type: 'belongsTo', target: 'supplier_returns', foreignKey: 'returnId' },
        { type: 'belongsTo', target: 'receipt_lines', foreignKey: 'receiptLineId' },
        { type: 'belongsTo', target: 'purchase_order_lines', foreignKey: 'poLineId' },
        { type: 'belongsTo', target: 'products', foreignKey: 'productId' }
      ],
      indexes: [
        { fields: ['tenantId'] },
        { fields: ['returnId'] }
      ],
      softDelete: false
    },
    
    // ========== PURCHASING INVOICES ==========
    {
      name: 'purchasing_invoices',
      schema: {
        fields: [
          { name: 'id', type: 'text', required: true },
          { name: 'code', type: 'text', required: true, unique: true },
          { name: 'invoiceNumber', type: 'text' },
          { name: 'invoiceDate', type: 'date', required: true },
          { name: 'supplierId', type: 'relation', ref: 'suppliers', required: true },
          { name: 'poId', type: 'relation', ref: 'purchase_orders' },
          { name: 'receiptId', type: 'relation', ref: 'receipts' },
          { name: 'submissionSource', type: 'enum', options: ['manual', 'email', 'web_form', 'api'], default: 'manual', required: true },
          { name: 'ocrExtracted', type: 'boolean', default: false, required: true },
          { name: 'ocrData', type: 'json' },
          { name: 'ocrConfidence', type: 'decimal' },
          { name: 'ocrValidatedBy', type: 'relation', ref: 'users' },
          { name: 'ocrValidatedAt', type: 'datetime' },
          { name: 'subtotal', type: 'decimal', required: true },
          { name: 'taxTotal', type: 'decimal', required: true },
          { name: 'shippingCost', type: 'decimal', default: 0 },
          { name: 'otherCharges', type: 'decimal', default: 0 },
          { name: 'totalAmount', type: 'decimal', required: true },
          { name: 'currency', type: 'text', default: 'EUR' },
          { name: 'paymentTerms', type: 'text' },
          { name: 'dueDate', type: 'date' },
          { name: 'threeWayMatchStatus', type: 'enum', options: ['pending', 'matched', 'discrepancy', 'override'], default: 'pending', required: true },
          { name: 'matchedByAgentId', type: 'text' },
          { name: 'matchedAt', type: 'datetime' },
          { name: 'poDiscrepancy', type: 'boolean', default: false, required: true },
          { name: 'poDiscrepancyAmount', type: 'decimal' },
          { name: 'receiptDiscrepancy', type: 'boolean', default: false, required: true },
          { name: 'receiptDiscrepancyDetails', type: 'json' },
          { name: 'priceDiscrepancy', type: 'boolean', default: false, required: true },
          { name: 'priceDiscrepancyAmount', type: 'decimal' },
          { name: 'overrideReason', type: 'text' },
          { name: 'overrideApprovedBy', type: 'relation', ref: 'users' },
          { name: 'overrideApprovedAt', type: 'datetime' },
          { name: 'status', type: 'enum', options: ['draft', 'pending_approval', 'approved', 'rejected', 'paid', 'partially_paid'], default: 'draft', required: true },
          { name: 'approvedBy', type: 'relation', ref: 'users' },
          { name: 'approvalDate', type: 'date' },
          { name: 'rejectionReason', type: 'text' },
          { name: 'paidAmount', type: 'decimal', default: 0, required: true },
          { name: 'remainingAmount', type: 'decimal' },
          { name: 'notes', type: 'text' },
          { name: 'attachments', type: 'json' },
          { name: 'createdBy', type: 'relation', ref: 'users' }
        ],
        timestamps: true,
        tenantIsolation: true
      },
      relationships: [
        { type: 'belongsTo', target: 'suppliers', foreignKey: 'supplierId' },
        { type: 'belongsTo', target: 'purchase_orders', foreignKey: 'poId' },
        { type: 'belongsTo', target: 'receipts', foreignKey: 'receiptId' },
        { type: 'hasMany', target: 'purchasing_invoice_lines', foreignKey: 'invoiceId' },
        { type: 'hasMany', target: 'purchasing_payment_allocations', foreignKey: 'invoiceId' }
      ],
      indexes: [
        { fields: ['tenantId'] },
        { fields: ['supplierId'] },
        { fields: ['status'] },
        { fields: ['invoiceDate'] },
        { fields: ['threeWayMatchStatus'] }
      ],
      softDelete: false
    },
    
    // ========== PURCHASING INVOICE LINES ==========
    {
      name: 'purchasing_invoice_lines',
      schema: {
        fields: [
          { name: 'id', type: 'text', required: true },
          { name: 'tenantId', type: 'text', required: true },
          { name: 'invoiceId', type: 'relation', ref: 'purchasing_invoices', required: true },
          { name: 'poLineId', type: 'relation', ref: 'purchase_order_lines' },
          { name: 'receiptLineId', type: 'relation', ref: 'receipt_lines' },
          { name: 'productId', type: 'relation', ref: 'products' },
          { name: 'description', type: 'text' },
          { name: 'quantity', type: 'decimal', required: true },
          { name: 'uom', type: 'text' },
          { name: 'unitPrice', type: 'decimal', required: true },
          { name: 'lineTotal', type: 'decimal', required: true },
          { name: 'taxRate', type: 'decimal', required: true },
          { name: 'taxAmount', type: 'decimal', required: true },
          { name: 'quantityDiscrepancy', type: 'decimal' },
          { name: 'priceDiscrepancy', type: 'decimal' },
          { name: 'discrepancyReason', type: 'text' },
          { name: 'notes', type: 'text' }
        ],
        timestamps: false,
        tenantIsolation: true
      },
      relationships: [
        { type: 'belongsTo', target: 'tenants', foreignKey: 'tenantId' },
        { type: 'belongsTo', target: 'purchasing_invoices', foreignKey: 'invoiceId' },
        { type: 'belongsTo', target: 'purchase_order_lines', foreignKey: 'poLineId' },
        { type: 'belongsTo', target: 'receipt_lines', foreignKey: 'receiptLineId' },
        { type: 'belongsTo', target: 'products', foreignKey: 'productId' }
      ],
      indexes: [
        { fields: ['tenantId'] },
        { fields: ['invoiceId'] }
      ],
      softDelete: false
    },
    
    // ========== PURCHASING PAYMENTS ==========
    {
      name: 'purchasing_payments',
      schema: {
        fields: [
          { name: 'id', type: 'text', required: true },
          { name: 'code', type: 'text', required: true, unique: true },
          { name: 'paymentDate', type: 'date', required: true },
          { name: 'supplierId', type: 'relation', ref: 'suppliers', required: true },
          { name: 'amount', type: 'decimal', required: true },
          { name: 'currency', type: 'text', default: 'EUR' },
          { name: 'paymentMethod', type: 'enum', options: ['bank_transfer', 'check', 'credit_card', 'cash', 'other'], default: 'bank_transfer', required: true },
          { name: 'bankAccountId', type: 'relation', ref: 'bank_accounts' },
          { name: 'referenceNumber', type: 'text' },
          { name: 'checkNumber', type: 'text' },
          { name: 'status', type: 'enum', options: ['draft', 'pending', 'processed', 'completed', 'failed', 'cancelled'], default: 'draft', required: true },
          { name: 'processedAt', type: 'datetime' },
          { name: 'processedBy', type: 'relation', ref: 'users' },
          { name: 'reconciledAt', type: 'datetime' },
          { name: 'reconciliationReference', type: 'text' },
          { name: 'allocatedAmount', type: 'decimal', default: 0, required: true },
          { name: 'unappliedAmount', type: 'decimal' },
          { name: 'notes', type: 'text' },
          { name: 'createdBy', type: 'relation', ref: 'users' }
        ],
        timestamps: true,
        tenantIsolation: true
      },
      relationships: [
        { type: 'belongsTo', target: 'suppliers', foreignKey: 'supplierId' },
        { type: 'belongsTo', target: 'bank_accounts', foreignKey: 'bankAccountId' },
        { type: 'hasMany', target: 'purchasing_payment_allocations', foreignKey: 'paymentId' }
      ],
      indexes: [
        { fields: ['tenantId'] },
        { fields: ['supplierId'] },
        { fields: ['paymentDate'] },
        { fields: ['status'] }
      ],
      softDelete: false
    },
    
    // ========== PURCHASING PAYMENT ALLOCATIONS ==========
    {
      name: 'purchasing_payment_allocations',
      schema: {
        fields: [
          { name: 'id', type: 'text', required: true },
          { name: 'tenantId', type: 'text', required: true },
          { name: 'paymentId', type: 'relation', ref: 'purchasing_payments', required: true },
          { name: 'invoiceId', type: 'relation', ref: 'purchasing_invoices', required: true },
          { name: 'allocatedAmount', type: 'decimal', required: true },
          { name: 'allocationDate', type: 'date', required: true },
          { name: 'createdBy', type: 'relation', ref: 'users' }
        ],
        timestamps: true,
        tenantIsolation: true
      },
      relationships: [
        { type: 'belongsTo', target: 'tenants', foreignKey: 'tenantId' },
        { type: 'belongsTo', target: 'purchasing_payments', foreignKey: 'paymentId' },
        { type: 'belongsTo', target: 'purchasing_invoices', foreignKey: 'invoiceId' }
      ],
      indexes: [
        { fields: ['tenantId'] },
        { fields: ['paymentId'] },
        { fields: ['invoiceId'] }
      ],
      softDelete: false
    },
    
    // ========== EMPLOYEE EXPENSES ==========
    {
      name: 'employee_expenses',
      schema: {
        fields: [
          { name: 'id', type: 'text', required: true },
          { name: 'code', type: 'text', required: true, unique: true },
          { name: 'expenseDate', type: 'date', required: true },
          { name: 'employeeId', type: 'relation', ref: 'users', required: true },
          { name: 'departmentId', type: 'text' },
          { name: 'category', type: 'enum', options: ['travel', 'meals', 'accommodation', 'supplies', 'fuel', 'parking', 'other'], default: 'other', required: true },
          { name: 'subcategory', type: 'text' },
          { name: 'description', type: 'text' },
          { name: 'merchantName', type: 'text' },
          { name: 'merchantAddress', type: 'text' },
          { name: 'amount', type: 'decimal', required: true },
          { name: 'currency', type: 'text', default: 'EUR' },
          { name: 'taxAmount', type: 'decimal' },
          { name: 'taxRate', type: 'decimal' },
          { name: 'receiptAttached', type: 'boolean', default: false },
          { name: 'receiptUrl', type: 'text' },
          { name: 'receiptOcrData', type: 'json' },
          { name: 'projectId', type: 'relation', ref: 'projects' },
          { name: 'allocatedToProject', type: 'boolean', default: false },
          { name: 'allocationDate', type: 'date' },
          { name: 'allocationPercentage', type: 'decimal' },
          { name: 'allocatedToPerson', type: 'boolean', default: false },
          { name: 'personId', type: 'relation', ref: 'users' },
          { name: 'billingCode', type: 'text' },
          { name: 'paymentMethod', type: 'enum', options: ['company_card', 'personal_reimbursement', 'petty_cash'], default: 'personal_reimbursement', required: true },
          { name: 'companyCardId', type: 'text' },
          { name: 'personalReimbursement', type: 'boolean', default: true },
          { name: 'status', type: 'enum', options: ['draft', 'pending_approval', 'approved', 'rejected', 'reimbursed'], default: 'draft', required: true },
          { name: 'submittedAt', type: 'datetime' },
          { name: 'approvedBy', type: 'relation', ref: 'users' },
          { name: 'approvalDate', type: 'datetime' },
          { name: 'rejectionReason', type: 'text' },
          { name: 'reimbursedAt', type: 'datetime' },
          { name: 'reimbursementPaymentId', type: 'relation', ref: 'purchasing_payments' },
          { name: 'reimbursementAmount', type: 'decimal' },
          { name: 'mileageKm', type: 'decimal' },
          { name: 'mileageRate', type: 'decimal' },
          { name: 'mileageReimbursement', type: 'decimal' },
          { name: 'mileageFrom', type: 'text' },
          { name: 'mileageTo', type: 'text' },
          { name: 'advanceAmount', type: 'decimal' },
          { name: 'advanceDate', type: 'date' },
          { name: 'advanceReconciled', type: 'boolean', default: false },
          { name: 'notes', type: 'text' }
        ],
        timestamps: true,
        tenantIsolation: true
      },
      relationships: [
        { type: 'belongsTo', target: 'users', foreignKey: 'employeeId' },
        { type: 'belongsTo', target: 'users', foreignKey: 'approvedBy' },
        { type: 'belongsTo', target: 'users', foreignKey: 'personId' },
        { type: 'belongsTo', target: 'projects', foreignKey: 'projectId' },
        { type: 'belongsTo', target: 'purchasing_payments', foreignKey: 'reimbursementPaymentId' }
      ],
      indexes: [
        { fields: ['tenantId'] },
        { fields: ['employeeId'] },
        { fields: ['status'] },
        { fields: ['expenseDate'] },
        { fields: ['projectId'] },
        { fields: ['personId'] }
      ],
      softDelete: false
    }
  ];
  
  // ============================================================================
  // WORKFLOWS (8 procurement automation workflows)
  // ============================================================================
  
  workflows: WorkflowDefinition[] = comprasWorkflows;
  
  // ============================================================================
  // TOOLS (33 AI procurement automation tools)
  // ============================================================================
  
  tools: ModuleTool[] = comprasTools;
  
  // ============================================================================
  // ROUTES (111 RESTful API routes)
  // ============================================================================
  
  routes: RouteDefinition[] = comprasRoutes;
  
  // ============================================================================
  // HOOKS (lifecycle events)
  // ============================================================================
  
  hooks: ModuleHooks = {
    onInstall: async (tenantId: string) => {
      console.log(`[ComprasModule] Installing for tenant ${tenantId}`);
      // TODO: Initialize default supplier categories, payment terms, etc
    },
    
    onUninstall: async (tenantId: string) => {
      console.log(`[ComprasModule] Uninstalling from tenant ${tenantId}`);
      // TODO: Archive procurement data
    },
    
    onActivate: async (tenantId: string) => {
      console.log(`[ComprasModule] Activating for tenant ${tenantId}`);
    },
    
    onDeactivate: async (tenantId: string) => {
      console.log(`[ComprasModule] Deactivating for tenant ${tenantId}`);
    }
  };
  
  // ============================================================================
  // INVOICE HANDLERS (assistDOCS Integration)
  // ============================================================================
  
  /**
   * Handler: POST /api/compras/invoices/analyze
   * Analyzes uploaded invoice using assistDOCS and creates draft invoice
   * 
   * CRITICAL FIX: All decimal fields MUST be converted to strings
   */
  async analyzeInvoice(context: ModuleContext): Promise<any> {
    const { fileId } = context.body;
    const { tenantId, db } = context;
    
    console.log(`[ComprasModule] 📄 Analyzing invoice for fileId: ${fileId}`);
    
    try {
      // 1. Fetch file from fileAttachments table
      const { fileAttachments } = await import('../../../shared/schema');
      const [file] = await db
        .select()
        .from(fileAttachments)
        .where(and(
          eq(fileAttachments.id, fileId),
          eq(fileAttachments.tenantId, tenantId)
        ))
        .limit(1);
      
      if (!file) {
        throw new Error(`File not found: ${fileId}`);
      }
      
      console.log(`[ComprasModule]   File found: ${file.originalName} (${file.mimeType})`);
      
      // 2. Read file buffer from storage (Supabase, local, or GCS)
      const { getFileBuffer } = await import('../../../apps/api/services/file-storage.service');
      const fileBuffer = await getFileBuffer(file);
      
      // 3. Call assistDOCS Orchestrator
      const { AssistDOCSOrchestrator } = await import('../../ai/agents/assistdocs/assistdocs-orchestrator.js');
      const assistDocsOrchestrator = new AssistDOCSOrchestrator();
      
      const result = await assistDocsOrchestrator.analyzeDocument({
        fileBuffer,
        fileName: file.originalName,
        mimeType: file.mimeType,
        documentTypeHint: 'invoice',
        tenantId,
        userId: context.user.id
      });
      
      if (!result.success || !result.document) {
        throw new Error(result.error || 'Document analysis failed');
      }
      
      const { document } = result;
      const { extractedData } = document;
      
      console.log(`[ComprasModule]   ✅ Analysis complete - Confidence: ${document.confidence}%`);
      
      // 4. Try to find existing supplier by NIF
      let supplierId = null;
      if (extractedData.issuerNIF) {
        const { suppliers } = await import('../../../shared/schema');
        const [supplier] = await db
          .select()
          .from(suppliers)
          .where(and(
            eq(suppliers.taxId, extractedData.issuerNIF),
            eq(suppliers.tenantId, tenantId)
          ))
          .limit(1);
        
        if (supplier) {
          supplierId = supplier.id;
          console.log(`[ComprasModule]   ✓ Found existing supplier: ${supplier.name} (${supplier.code})`);
        } else {
          console.log(`[ComprasModule]   ⚠ No supplier found for NIF: ${extractedData.issuerNIF}`);
        }
      }
      
      // 5. Create draft invoice in supplierInvoices table with all 67 fields
      // CRITICAL: Convert ALL decimal fields to strings
      const { supplierInvoices } = await import('../../../shared/schema');
      
      const [invoice] = await db.insert(supplierInvoices).values({
        tenantId,
        fileId,
        supplierId,
        
        // Core invoice data (decimal fields converted to strings)
        supplierName: extractedData.issuer || 'Unknown Supplier',
        nif: extractedData.issuerNIF,
        receiverTaxId: extractedData.recipientNIF,
        invoiceNumber: extractedData.invoiceNumber || extractedData.documentNumber,
        invoiceType: extractedData.invoiceType || 'invoice',
        invoiceDate: extractedData.date ? new Date(extractedData.date) : null,
        dueDate: extractedData.dueDate ? new Date(extractedData.dueDate) : null,
        paymentStatus: extractedData.paymentStatus || 'pending',
        paymentDate: extractedData.paymentDate ? new Date(extractedData.paymentDate) : null,
        totalAmount: extractedData.totalAmount != null ? String(extractedData.totalAmount) : '0',
        taxAmount: extractedData.taxAmount != null ? String(extractedData.taxAmount) : null,
        netAmount: (extractedData.netAmount || extractedData.subtotal) != null ? String(extractedData.netAmount || extractedData.subtotal) : null,
        currency: extractedData.currency || 'EUR',
        lineItems: extractedData.items,
        
        // Supplier details
        supplierAddress: extractedData.issuerAddress,
        supplierCity: extractedData.issuerCity,
        supplierCountry: extractedData.issuerCountry,
        supplierPostalCode: extractedData.issuerPostalCode,
        supplierEmail: extractedData.issuerEmail,
        supplierPhone: extractedData.issuerPhone,
        supplierIban: extractedData.issuerIban,
        supplierWebsite: extractedData.issuerWebsite,
        
        // Receiver details
        receiverName: extractedData.recipient,
        receiverAddress: extractedData.recipientAddress,
        receiverCity: extractedData.recipientCity,
        receiverCountry: extractedData.recipientCountry,
        receiverPostalCode: extractedData.recipientPostalCode,
        
        // Payment & amounts (decimal fields converted to strings)
        amountDue: extractedData.amountDue != null ? String(extractedData.amountDue) : null,
        amountPaidSinceLastInvoice: extractedData.amountPaidSinceLastInvoice != null ? String(extractedData.amountPaidSinceLastInvoice) : null,
        paymentAmount: extractedData.paymentAmount != null ? String(extractedData.paymentAmount) : null,
        paymentTerms: extractedData.paymentTerms,
        paymentMethod: extractedData.paymentMethod,
        
        // Shipping & Delivery (decimal fields converted to strings)
        freightAmount: extractedData.freightAmount != null ? String(extractedData.freightAmount) : null,
        carrier: extractedData.carrier,
        deliveryDate: extractedData.deliveryDate ? new Date(extractedData.deliveryDate) : null,
        
        // Additional Financial (decimal fields converted to strings)
        totalNetAmount: extractedData.totalNetAmount != null ? String(extractedData.totalNetAmount) : null,
        currencyExchangeRate: extractedData.currencyExchangeRate != null ? String(extractedData.currencyExchangeRate) : null,
        
        // Additional references
        purchaseOrder: extractedData.purchaseOrder,
        
        // HITL (Human-in-the-Loop) tracking
        extractionStatus: 'pending_validation',
        extractionConfidence: document.confidence,
        extractionProcessor: document.processorUsed,
        extractionMetadata: {
          documentType: document.documentType,
          documentSubType: document.documentSubType,
          processingTimeMs: document.processingTimeMs,
          rawResponse: document.rawResponse,
          extractedData: document.extractedData
        },
        
        // Status
        status: 'received'
      }).returning();
      
      console.log(`[ComprasModule]   ✓ Created draft invoice: ${invoice.id}`);
      
      // 6. Return response
      return {
        invoiceId: invoice.id,
        extractedData: document.extractedData,
        confidence: document.confidence,
        needsValidation: true,
        supplierId,
        processorUsed: document.processorUsed,
        message: supplierId 
          ? `Fatura analisada e associada ao fornecedor existente. Por favor valide os dados extraídos.`
          : `Fatura analisada mas não foi encontrado fornecedor com NIF ${extractedData.issuerNIF}. Por favor valide e crie o fornecedor se necessário.`
      };
      
    } catch (error) {
      console.error('[ComprasModule] ❌ Error analyzing invoice:', error);
      throw error;
    }
  }
  
  /**
   * Handler: GET /api/compras/invoices/:id
   * Gets a single invoice by ID
   */
  async getInvoice(context: ModuleContext): Promise<any> {
    const { id } = context.params;
    const { tenantId, db } = context;
    const { supplierInvoices } = await import('../../../shared/schema');
    
    try {
      const [invoice] = await db
        .select()
        .from(supplierInvoices)
        .where(and(
          eq(supplierInvoices.id, id),
          eq(supplierInvoices.tenantId, tenantId)
        ))
        .limit(1);
      
      if (!invoice) {
        throw new Error(`Invoice not found: ${id}`);
      }
      
      return invoice;
      
    } catch (error) {
      console.error('[ComprasModule] ❌ Error getting invoice:', error);
      throw error;
    }
  }
  
  /**
   * Handler: GET /api/compras/invoices/pending-validation
   * Lists all invoices with extractionStatus = 'pending_validation'
   * Returns invoices sorted by createdAt DESC
   */
  async listPendingInvoices(context: ModuleContext): Promise<any> {
    const { tenantId, db } = context;
    const { supplierInvoices } = await import('../../../shared/schema');
    const { desc } = await import('drizzle-orm');
    
    console.log(`[ComprasModule] 📋 Listing pending validation invoices`);
    
    try {
      const pendingInvoices = await db
        .select({
          id: supplierInvoices.id,
          supplierName: supplierInvoices.supplierName,
          invoiceNumber: supplierInvoices.invoiceNumber,
          invoiceDate: supplierInvoices.invoiceDate,
          totalAmount: supplierInvoices.totalAmount,
          currency: supplierInvoices.currency,
          extractionConfidence: supplierInvoices.extractionConfidence,
          extractionProcessor: supplierInvoices.extractionProcessor,
          fileId: supplierInvoices.fileId,
          supplierId: supplierInvoices.supplierId,
        })
        .from(supplierInvoices)
        .where(and(
          eq(supplierInvoices.tenantId, tenantId),
          eq(supplierInvoices.extractionStatus, 'pending_validation')
        ))
        .orderBy(desc(supplierInvoices.createdAt));
      
      console.log(`[ComprasModule]   ✓ Found ${pendingInvoices.length} pending invoices`);
      
      return { invoices: pendingInvoices };
      
    } catch (error) {
      console.error('[ComprasModule] ❌ Error listing pending invoices:', error);
      throw error;
    }
  }
  
  /**
   * Handler: PATCH /api/compras/invoices/:id/validate
   * Validates and optionally edits extracted invoice data
   * 
   * CRITICAL FIXES:
   * 1. Discard HITL readonly fields from user input (extractionStatus, extractionConfidence, extractionProcessor, extractionMetadata)
   * 2. Derive extractionStatus ONLY from `approved` flag
   * 3. Only set HITL tracking fields when `approved` is explicitly true or false
   * 4. When approved===undefined, only apply field edits, DO NOT touch HITL metadata
   */
  async validateInvoice(context: ModuleContext): Promise<any> {
    const { id } = context.params;
    const { tenantId, db, user } = context;
    
    // CRITICAL: Destructure and DISCARD readonly HITL fields from user input
    const { 
      approved, 
      rejectionReason, 
      notes,
      extractionStatus: _discardExtractStatus,
      extractionConfidence: _discardExtractConfidence,
      extractionProcessor: _discardExtractProcessor,
      extractionMetadata: _discardExtractMetadata,
      ...editableFields 
    } = context.body;
    
    console.log(`[ComprasModule] ✓ Validating invoice: ${id} (approved=${approved})`);
    
    try {
      // 1. Fetch existing invoice
      const { supplierInvoices } = await import('../../../shared/schema');
      const [existingInvoice] = await db
        .select()
        .from(supplierInvoices)
        .where(and(
          eq(supplierInvoices.id, id),
          eq(supplierInvoices.tenantId, tenantId)
        ))
        .limit(1);
      
      if (!existingInvoice) {
        throw new Error(`Invoice not found: ${id}`);
      }
      
      if (existingInvoice.extractionStatus === 'validated') {
        console.log(`[ComprasModule]   ⚠ Invoice already validated`);
      }
      
      // 2. Prepare update data from editable fields only
      const updateData: any = {};
      
      // Process all editable fields with proper type conversions
      // Core Invoice Data
      if (editableFields.supplierName !== undefined) updateData.supplierName = editableFields.supplierName;
      if (editableFields.nif !== undefined) updateData.nif = editableFields.nif;
      if (editableFields.invoiceNumber !== undefined) updateData.invoiceNumber = editableFields.invoiceNumber;
      if (editableFields.invoiceType !== undefined) updateData.invoiceType = editableFields.invoiceType;
      if (editableFields.invoiceDate !== undefined) updateData.invoiceDate = new Date(editableFields.invoiceDate);
      if (editableFields.dueDate !== undefined) updateData.dueDate = new Date(editableFields.dueDate);
      if (editableFields.paymentStatus !== undefined) updateData.paymentStatus = editableFields.paymentStatus;
      if (editableFields.paymentDate !== undefined) updateData.paymentDate = new Date(editableFields.paymentDate);
      if (editableFields.totalAmount !== undefined) updateData.totalAmount = String(editableFields.totalAmount);
      if (editableFields.taxAmount !== undefined) updateData.taxAmount = String(editableFields.taxAmount);
      if (editableFields.netAmount !== undefined) updateData.netAmount = String(editableFields.netAmount);
      if (editableFields.currency !== undefined) updateData.currency = editableFields.currency;
      if (editableFields.description !== undefined) updateData.description = editableFields.description;
      if (editableFields.lineItems !== undefined) updateData.lineItems = editableFields.lineItems;
      
      // Supplier/Issuer Details
      if (editableFields.supplierAddress !== undefined) updateData.supplierAddress = editableFields.supplierAddress;
      if (editableFields.supplierCity !== undefined) updateData.supplierCity = editableFields.supplierCity;
      if (editableFields.supplierCountry !== undefined) updateData.supplierCountry = editableFields.supplierCountry;
      if (editableFields.supplierPostalCode !== undefined) updateData.supplierPostalCode = editableFields.supplierPostalCode;
      if (editableFields.supplierEmail !== undefined) updateData.supplierEmail = editableFields.supplierEmail;
      if (editableFields.supplierPhone !== undefined) updateData.supplierPhone = editableFields.supplierPhone;
      if (editableFields.supplierIban !== undefined) updateData.supplierIban = editableFields.supplierIban;
      if (editableFields.supplierWebsite !== undefined) updateData.supplierWebsite = editableFields.supplierWebsite;
      if (editableFields.supplierRegistration !== undefined) updateData.supplierRegistration = editableFields.supplierRegistration;
      if (editableFields.supplierPaymentRef !== undefined) updateData.supplierPaymentRef = editableFields.supplierPaymentRef;
      
      // Receiver Details
      if (editableFields.receiverName !== undefined) updateData.receiverName = editableFields.receiverName;
      if (editableFields.receiverAddress !== undefined) updateData.receiverAddress = editableFields.receiverAddress;
      if (editableFields.receiverCity !== undefined) updateData.receiverCity = editableFields.receiverCity;
      if (editableFields.receiverCountry !== undefined) updateData.receiverCountry = editableFields.receiverCountry;
      if (editableFields.receiverPostalCode !== undefined) updateData.receiverPostalCode = editableFields.receiverPostalCode;
      if (editableFields.receiverEmail !== undefined) updateData.receiverEmail = editableFields.receiverEmail;
      if (editableFields.receiverPhone !== undefined) updateData.receiverPhone = editableFields.receiverPhone;
      if (editableFields.receiverWebsite !== undefined) updateData.receiverWebsite = editableFields.receiverWebsite;
      if (editableFields.receiverTaxId !== undefined) updateData.receiverTaxId = editableFields.receiverTaxId;
      
      // Remit-To & Ship-To Information
      if (editableFields.remitToAddress !== undefined) updateData.remitToAddress = editableFields.remitToAddress;
      if (editableFields.remitToName !== undefined) updateData.remitToName = editableFields.remitToName;
      if (editableFields.shipFromAddress !== undefined) updateData.shipFromAddress = editableFields.shipFromAddress;
      if (editableFields.shipFromName !== undefined) updateData.shipFromName = editableFields.shipFromName;
      if (editableFields.shipToAddress !== undefined) updateData.shipToAddress = editableFields.shipToAddress;
      if (editableFields.shipToName !== undefined) updateData.shipToName = editableFields.shipToName;
      
      // Payment & Amounts (convert to strings)
      if (editableFields.amountDue !== undefined) updateData.amountDue = String(editableFields.amountDue);
      if (editableFields.amountPaidSinceLastInvoice !== undefined) updateData.amountPaidSinceLastInvoice = String(editableFields.amountPaidSinceLastInvoice);
      if (editableFields.paymentAmount !== undefined) updateData.paymentAmount = String(editableFields.paymentAmount);
      if (editableFields.paymentTerms !== undefined) updateData.paymentTerms = editableFields.paymentTerms;
      if (editableFields.paymentMethod !== undefined) updateData.paymentMethod = editableFields.paymentMethod;
      
      // Shipping & Delivery
      if (editableFields.freightAmount !== undefined) updateData.freightAmount = String(editableFields.freightAmount);
      if (editableFields.carrier !== undefined) updateData.carrier = editableFields.carrier;
      if (editableFields.deliveryDate !== undefined) updateData.deliveryDate = new Date(editableFields.deliveryDate);
      
      // Additional Financial (convert to strings)
      if (editableFields.totalDiscount !== undefined) updateData.totalDiscount = editableFields.totalDiscount;
      if (editableFields.totalNetAmount !== undefined) updateData.totalNetAmount = String(editableFields.totalNetAmount);
      if (editableFields.currencyExchangeRate !== undefined) updateData.currencyExchangeRate = String(editableFields.currencyExchangeRate);
      
      // Purchase Orders & References
      if (editableFields.purchaseOrder !== undefined) updateData.purchaseOrder = editableFields.purchaseOrder;
      if (editableFields.customerTaxId !== undefined) updateData.customerTaxId = editableFields.customerTaxId;
      
      // Business Context
      if (editableFields.category !== undefined) updateData.category = editableFields.category;
      if (editableFields.costCenter !== undefined) updateData.costCenter = editableFields.costCenter;
      if (editableFields.projectId !== undefined) updateData.projectId = editableFields.projectId;
      if (editableFields.purchaseOrderId !== undefined) updateData.purchaseOrderId = editableFields.purchaseOrderId;
      if (editableFields.emailInboxId !== undefined) updateData.emailInboxId = editableFields.emailInboxId;
      if (editableFields.status !== undefined) updateData.status = editableFields.status;
      if (editableFields.validationStatus !== undefined) updateData.validationStatus = editableFields.validationStatus;
      if (editableFields.validationErrors !== undefined) updateData.validationErrors = editableFields.validationErrors;
      if (editableFields.metadata !== undefined) updateData.metadata = editableFields.metadata;
      
      // Notes (allowed)
      if (notes !== undefined) updateData.notes = notes;
      
      // 3. CRITICAL: Handle HITL tracking fields based on `approved` flag
      if (approved === true) {
        // Explicit approval
        updateData.extractionStatus = 'validated';
        updateData.validatedAt = new Date();
        updateData.validatedBy = user.id;
        // CLEAR rejection fields
        updateData.rejectedAt = null;
        updateData.rejectedBy = null;
        updateData.rejectionReason = null;
        console.log(`[ComprasModule]   ✓ Approving invoice - status: validated`);
      } else if (approved === false) {
        // Explicit rejection
        updateData.extractionStatus = 'rejected';
        updateData.rejectedAt = new Date();
        updateData.rejectedBy = user.id;
        if (rejectionReason) {
          updateData.rejectionReason = rejectionReason;
        }
        // CLEAR validation fields
        updateData.validatedAt = null;
        updateData.validatedBy = null;
        console.log(`[ComprasModule]   ✓ Rejecting invoice - status: rejected`);
      } else {
        // approved is undefined - only editing fields, NO HITL changes
        // Keep extractionStatus as 'pending_validation'
        // DO NOT set validatedAt/validatedBy/rejectedAt/rejectedBy
        console.log(`[ComprasModule]   ✓ Updating fields only, keeping pending_validation status`);
        // Note: We explicitly do NOT set extractionStatus here - it stays as is in DB
      }
      
      // 4. Update invoice
      const [updatedInvoice] = await db
        .update(supplierInvoices)
        .set(updateData)
        .where(and(
          eq(supplierInvoices.id, id),
          eq(supplierInvoices.tenantId, tenantId)
        ))
        .returning();
      
      console.log(`[ComprasModule]   ✓ Invoice updated successfully`);
      
      return updatedInvoice;
      
    } catch (error) {
      console.error('[ComprasModule] ❌ Error validating invoice:', error);
      throw error;
    }
  }
  
  // ============================================================================
  // DATA EXPOSURE (para cross-module tools)
  // ============================================================================
  
  exposeData(): ModuleDataInterface {
    if (!this.tenantId) {
      throw new Error('ComprasModule not initialized - call initialize() first');
    }
    
    const tenantId = this.tenantId;
    
    return {
      createQuery: () => {
        throw new Error('QueryBuilder not implemented yet - Task 10');
      },
      
      aggregate: async (metric: string, filters?: Filter[]) => {
        // TODO: Implement aggregations
        console.warn(`[ComprasModule] Aggregate not implemented: ${metric}`);
        return 0;
      },
      
      export: async (format: 'json' | 'csv' | 'excel', filters?: Filter[]) => {
        // TODO: Implement export
        return Buffer.from('');
      },
      
      getSchema: () => ({
        entities: this.entities,
        workflows: this.workflows,
        relationships: this.entities.flatMap(e => e.relationships || [])
      }),
      
      getEntity: async (entityName: string, id: string) => {
        const table = this.getTableForEntity(entityName);
        if (!table) {
          throw new Error(`Unknown entity: ${entityName}`);
        }
        
        const results = await db
          .select()
          .from(table)
          .where(and(
            eq((table as any).id, id),
            eq((table as any).tenantId, tenantId)
          ))
          .limit(1);
        
        return results[0] || null;
      },
      
      listEntities: async (entityName: string, filters?: Filter[]) => {
        const table = this.getTableForEntity(entityName);
        if (!table) {
          throw new Error(`Unknown entity: ${entityName}`);
        }
        
        // Basic implementation - TODO: Add filter support
        return await db
          .select()
          .from(table)
          .where(eq((table as any).tenantId, tenantId));
      },
      
      createEntity: async (entityName: string, data: any) => {
        const table = this.getTableForEntity(entityName);
        if (!table) {
          throw new Error(`Unknown entity: ${entityName}`);
        }
        
        const result = await db.insert(table).values({
          ...data,
          tenantId
        }).returning();
        
        return Array.isArray(result) ? result[0] : result;
      },
      
      updateEntity: async (entityName: string, id: string, data: any) => {
        const table = this.getTableForEntity(entityName);
        if (!table) {
          throw new Error(`Unknown entity: ${entityName}`);
        }
        
        const result = await db
          .update(table)
          .set(data)
          .where(and(
            eq((table as any).id, id),
            eq((table as any).tenantId, tenantId)
          ))
          .returning();
        
        return Array.isArray(result) ? result[0] : result;
      },
      
      deleteEntity: async (entityName: string, id: string) => {
        const table = this.getTableForEntity(entityName);
        if (!table) {
          throw new Error(`Unknown entity: ${entityName}`);
        }
        
        await db
          .delete(table)
          .where(and(
            eq((table as any).id, id),
            eq((table as any).tenantId, tenantId)
          ));
      }
    };
  }
  
  // ============================================================================
  // INITIALIZATION
  // ============================================================================
  
  async initialize(tenantId: string): Promise<void> {
    this.tenantId = tenantId;
    console.log(`[ComprasModule] Initialized for tenant ${tenantId}`);
  }
  
  async healthCheck(): Promise<boolean> {
    return true; // TODO: Verify DB connection, etc
  }
  
  /**
   * Helper to get table for entity name
   */
  private getTableForEntity(entityName: string): any {
    // Import tables dynamically to avoid circular deps
    const schema = require('../../../shared/schema');
    
    switch (entityName) {
      case 'suppliers':
        return schema.suppliers;
      case 'product_suppliers':
        return schema.productSuppliers;
      case 'supplier_price_history':
        return schema.supplierPriceHistory;
      case 'purchase_requisitions':
        return schema.purchaseRequisitions;
      case 'purchase_requisition_lines':
        return schema.purchaseRequisitionLines;
      case 'rfqs':
        return schema.rfqs;
      case 'rfq_lines':
        return schema.rfqLines;
      case 'rfq_quotes':
        return schema.rfqQuotes;
      case 'rfq_quote_lines':
        return schema.rfqQuoteLines;
      case 'purchase_orders':
        return schema.purchaseOrders;
      case 'purchase_order_lines':
        return schema.purchaseOrderLines;
      case 'receipts':
        return schema.receipts;
      case 'receipt_lines':
        return schema.receiptLines;
      case 'supplier_returns':
        return schema.supplierReturns;
      case 'supplier_return_lines':
        return schema.supplierReturnLines;
      case 'purchasing_invoices':
        return schema.purchasingInvoices;
      case 'purchasing_invoice_lines':
        return schema.purchasingInvoiceLines;
      case 'purchasing_payments':
        return schema.purchasingPayments;
      case 'purchasing_payment_allocations':
        return schema.purchasingPaymentAllocations;
      case 'employee_expenses':
        return schema.employeeExpenses;
      default:
        return null;
    }
  }
}

// Export singleton factory
export function createComprasModule(): IModule {
  return new ComprasModule();
}
