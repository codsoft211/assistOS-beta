/**
 * ComprasQueryBuilder
 * 
 * Query builder for Purchasing/Procurement module with comprehensive data access methods.
 * Implements tenant isolation and supports complex filtering, sorting, and aggregations.
 */

import { db } from '../../../apps/api/db';
import {
  suppliers,
  productSuppliers,
  supplierPriceHistory,
  purchaseRequisitions,
  purchaseRequisitionLines,
  rfqs,
  rfqLines,
  rfqQuotes,
  rfqQuoteLines,
  purchaseOrders,
  purchaseOrderLines,
  receipts,
  receiptLines,
  supplierReturns,
  supplierReturnLines,
  purchasingInvoices,
  purchasingInvoiceLines,
  purchasingPayments,
  purchasingPaymentAllocations,
  employeeExpenses,
} from '../../../shared/schema';
import { eq, and, or, gte, lte, like, ilike, desc, asc, sql, isNull, inArray } from 'drizzle-orm';

// ==================== INTERFACES ====================

export interface QueryOptions {
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDirection?: 'asc' | 'desc';
  includes?: string[];
}

export interface SupplierFilters {
  type?: string;
  status?: boolean;
  overallScore?: number;
  search?: string;
  category?: string;
}

export interface ProductSupplierFilters {
  productId?: string;
  supplierId?: string;
  isPreferred?: boolean;
  isActive?: boolean;
}

export interface SupplierPriceHistoryFilters {
  productSupplierId?: string;
  validFrom?: Date;
  validTo?: Date;
}

export interface PurchaseRequisitionFilters {
  status?: string;
  requestedBy?: string;
  priority?: string;
  neededByDate?: Date;
  source?: string;
}

export interface RequisitionLineFilters {
  requisitionId?: string;
  productId?: string;
}

export interface RfqFilters {
  status?: string;
  requisitionId?: string;
  rfqDate?: Date;
}

export interface RfqLineFilters {
  rfqId?: string;
  productId?: string;
}

export interface RfqQuoteFilters {
  rfqId?: string;
  supplierId?: string;
  recommendation?: string;
}

export interface PurchaseOrderFilters {
  status?: string;
  supplierId?: string;
  orderDate?: Date;
  source?: string;
  projectId?: string;
}

export interface PurchaseOrderLineFilters {
  poId?: string;
  productId?: string;
}

export interface ReceiptFilters {
  status?: string;
  poId?: string;
  receiptDate?: Date;
  inspectionStatus?: string;
}

export interface ReceiptLineFilters {
  receiptId?: string;
  productId?: string;
}

export interface SupplierReturnFilters {
  status?: string;
  supplierId?: string;
  returnReason?: string;
  returnDate?: Date;
}

export interface SupplierReturnLineFilters {
  returnId?: string;
  productId?: string;
}

export interface PurchasingInvoiceFilters {
  status?: string;
  supplierId?: string;
  threeWayMatchStatus?: string;
  dueDate?: Date;
  invoiceDate?: Date;
}

export interface PurchasingInvoiceLineFilters {
  invoiceId?: string;
  productId?: string;
}

export interface PurchasingPaymentFilters {
  status?: string;
  supplierId?: string;
  paymentMethod?: string;
  paymentDate?: Date;
}

export interface PaymentAllocationFilters {
  paymentId?: string;
  invoiceId?: string;
}

export interface EmployeeExpenseFilters {
  status?: string;
  employeeId?: string;
  projectId?: string;
  category?: string;
  expenseDate?: Date;
}

export interface TotalOrdersFilters {
  supplierId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  status?: string;
}

export interface TotalSpendFilters {
  dateFrom?: Date;
  dateTo?: Date;
  supplierId?: string;
}

// ==================== QUERY BUILDER CLASS ====================

export class ComprasQueryBuilder {
  constructor(private tenantId: string) {}

  // ==================== SUPPLIERS ====================

  /**
   * List suppliers with filtering and pagination
   */
  async listSuppliers(filters: SupplierFilters = {}, options: QueryOptions = {}) {
    const whereConditions: any[] = [eq(suppliers.tenantId, this.tenantId)];

    if (filters.type) {
      whereConditions.push(eq(suppliers.type, filters.type));
    }

    if (filters.status !== undefined) {
      whereConditions.push(eq(suppliers.isActive, filters.status));
    }

    if (filters.overallScore !== undefined) {
      whereConditions.push(gte(suppliers.overallScore, String(filters.overallScore)));
    }

    if (filters.category) {
      whereConditions.push(eq(suppliers.category, filters.category));
    }

    if (filters.search) {
      whereConditions.push(
        or(
          ilike(suppliers.name, `%${filters.search}%`),
          ilike(suppliers.code, `%${filters.search}%`),
          ilike(suppliers.taxId, `%${filters.search}%`)
        )!
      );
    }

    let query = db
      .select()
      .from(suppliers)
      .where(and(...whereConditions));

    // Apply ordering
    if (options.orderBy && (suppliers as any)[options.orderBy]) {
      const field = (suppliers as any)[options.orderBy];
      query = options.orderDirection === 'desc'
        ? query.orderBy(desc(field))
        : query.orderBy(asc(field));
    } else {
      query = query.orderBy(desc(suppliers.createdAt));
    }

    // Apply pagination
    if (options.limit) {
      query = query.limit(options.limit);
    }
    if (options.offset) {
      query = query.offset(options.offset);
    }

    return await query;
  }

  /**
   * Get a single supplier by ID
   */
  async getSupplier(id: string) {
    const result = await db
      .select()
      .from(suppliers)
      .where(and(eq(suppliers.id, id), eq(suppliers.tenantId, this.tenantId)))
      .limit(1);

    return result[0] || null;
  }

  /**
   * List product-supplier relationships
   */
  async listProductSuppliers(filters: ProductSupplierFilters = {}, options: QueryOptions = {}) {
    const whereConditions: any[] = [eq(productSuppliers.tenantId, this.tenantId)];

    if (filters.productId) {
      whereConditions.push(eq(productSuppliers.productId, filters.productId));
    }

    if (filters.supplierId) {
      whereConditions.push(eq(productSuppliers.supplierId, filters.supplierId));
    }

    if (filters.isPreferred !== undefined) {
      whereConditions.push(eq(productSuppliers.isPreferred, filters.isPreferred));
    }

    if (filters.isActive !== undefined) {
      whereConditions.push(eq(productSuppliers.isActive, filters.isActive));
    }

    let query = db
      .select()
      .from(productSuppliers)
      .where(and(...whereConditions));

    // Apply ordering
    if (options.orderBy && (productSuppliers as any)[options.orderBy]) {
      const field = (productSuppliers as any)[options.orderBy];
      query = options.orderDirection === 'desc'
        ? query.orderBy(desc(field))
        : query.orderBy(asc(field));
    } else {
      query = query.orderBy(desc(productSuppliers.priority));
    }

    if (options.limit) query = query.limit(options.limit);
    if (options.offset) query = query.offset(options.offset);

    return await query;
  }

  /**
   * List supplier price history
   */
  async listSupplierPriceHistory(filters: SupplierPriceHistoryFilters = {}, options: QueryOptions = {}) {
    const whereConditions: any[] = [eq(supplierPriceHistory.tenantId, this.tenantId)];

    if (filters.productSupplierId) {
      whereConditions.push(eq(supplierPriceHistory.productSupplierId, filters.productSupplierId));
    }

    if (filters.validFrom) {
      whereConditions.push(gte(supplierPriceHistory.validFrom, filters.validFrom.toISOString().split('T')[0]));
    }

    if (filters.validTo) {
      whereConditions.push(lte(supplierPriceHistory.validTo, filters.validTo.toISOString().split('T')[0]));
    }

    let query = db
      .select()
      .from(supplierPriceHistory)
      .where(and(...whereConditions));

    if (options.orderBy && (supplierPriceHistory as any)[options.orderBy]) {
      const field = (supplierPriceHistory as any)[options.orderBy];
      query = options.orderDirection === 'desc'
        ? query.orderBy(desc(field))
        : query.orderBy(asc(field));
    } else {
      query = query.orderBy(desc(supplierPriceHistory.validFrom));
    }

    if (options.limit) query = query.limit(options.limit);
    if (options.offset) query = query.offset(options.offset);

    return await query;
  }

  // ==================== REQUISITIONS ====================

  /**
   * List purchase requisitions
   */
  async listPurchaseRequisitions(filters: PurchaseRequisitionFilters = {}, options: QueryOptions = {}) {
    const whereConditions: any[] = [eq(purchaseRequisitions.tenantId, this.tenantId)];

    if (filters.status) {
      whereConditions.push(eq(purchaseRequisitions.status, filters.status));
    }

    if (filters.requestedBy) {
      whereConditions.push(eq(purchaseRequisitions.requestedBy, filters.requestedBy));
    }

    if (filters.priority) {
      whereConditions.push(eq(purchaseRequisitions.priority, filters.priority));
    }

    if (filters.neededByDate) {
      whereConditions.push(lte(purchaseRequisitions.neededByDate, filters.neededByDate.toISOString().split('T')[0]));
    }

    if (filters.source) {
      whereConditions.push(eq(purchaseRequisitions.source, filters.source));
    }

    let query = db
      .select()
      .from(purchaseRequisitions)
      .where(and(...whereConditions));

    if (options.orderBy && (purchaseRequisitions as any)[options.orderBy]) {
      const field = (purchaseRequisitions as any)[options.orderBy];
      query = options.orderDirection === 'desc'
        ? query.orderBy(desc(field))
        : query.orderBy(asc(field));
    } else {
      query = query.orderBy(desc(purchaseRequisitions.requestDate));
    }

    if (options.limit) query = query.limit(options.limit);
    if (options.offset) query = query.offset(options.offset);

    return await query;
  }

  /**
   * Get a single requisition by ID
   */
  async getPurchaseRequisition(id: string) {
    const result = await db
      .select()
      .from(purchaseRequisitions)
      .where(and(eq(purchaseRequisitions.id, id), eq(purchaseRequisitions.tenantId, this.tenantId)))
      .limit(1);

    return result[0] || null;
  }

  /**
   * List requisition lines
   */
  async listRequisitionLines(filters: RequisitionLineFilters = {}, options: QueryOptions = {}) {
    const whereConditions: any[] = [eq(purchaseRequisitionLines.tenantId, this.tenantId)];

    if (filters.requisitionId) {
      whereConditions.push(eq(purchaseRequisitionLines.requisitionId, filters.requisitionId));
    }

    if (filters.productId) {
      whereConditions.push(eq(purchaseRequisitionLines.productId, filters.productId));
    }

    let query = db
      .select()
      .from(purchaseRequisitionLines);

    if (whereConditions.length > 0) {
      query = query.where(and(...whereConditions));
    }

    if (options.limit) query = query.limit(options.limit);
    if (options.offset) query = query.offset(options.offset);

    return await query;
  }

  // ==================== RFQs ====================

  /**
   * List RFQs (Request for Quotations)
   */
  async listRfqs(filters: RfqFilters = {}, options: QueryOptions = {}) {
    const whereConditions: any[] = [eq(rfqs.tenantId, this.tenantId)];

    if (filters.status) {
      whereConditions.push(eq(rfqs.status, filters.status));
    }

    if (filters.requisitionId) {
      whereConditions.push(eq(rfqs.requisitionId, filters.requisitionId));
    }

    if (filters.rfqDate) {
      whereConditions.push(eq(rfqs.rfqDate, filters.rfqDate.toISOString().split('T')[0]));
    }

    let query = db
      .select()
      .from(rfqs)
      .where(and(...whereConditions));

    if (options.orderBy && (rfqs as any)[options.orderBy]) {
      const field = (rfqs as any)[options.orderBy];
      query = options.orderDirection === 'desc'
        ? query.orderBy(desc(field))
        : query.orderBy(asc(field));
    } else {
      query = query.orderBy(desc(rfqs.rfqDate));
    }

    if (options.limit) query = query.limit(options.limit);
    if (options.offset) query = query.offset(options.offset);

    return await query;
  }

  /**
   * Get a single RFQ by ID
   */
  async getRfq(id: string) {
    const result = await db
      .select()
      .from(rfqs)
      .where(and(eq(rfqs.id, id), eq(rfqs.tenantId, this.tenantId)))
      .limit(1);

    return result[0] || null;
  }

  /**
   * List RFQ lines
   */
  async listRfqLines(filters: RfqLineFilters = {}, options: QueryOptions = {}) {
    const whereConditions: any[] = [eq(rfqLines.tenantId, this.tenantId)];

    if (filters.rfqId) {
      whereConditions.push(eq(rfqLines.rfqId, filters.rfqId));
    }

    if (filters.productId) {
      whereConditions.push(eq(rfqLines.productId, filters.productId));
    }

    let query = db
      .select()
      .from(rfqLines);

    if (whereConditions.length > 0) {
      query = query.where(and(...whereConditions));
    }

    if (options.limit) query = query.limit(options.limit);
    if (options.offset) query = query.offset(options.offset);

    return await query;
  }

  /**
   * List RFQ quotes from suppliers
   */
  async listRfqQuotes(filters: RfqQuoteFilters = {}, options: QueryOptions = {}) {
    const whereConditions: any[] = [eq(rfqQuotes.tenantId, this.tenantId)];

    if (filters.rfqId) {
      whereConditions.push(eq(rfqQuotes.rfqId, filters.rfqId));
    }

    if (filters.supplierId) {
      whereConditions.push(eq(rfqQuotes.supplierId, filters.supplierId));
    }

    if (filters.recommendation) {
      whereConditions.push(eq(rfqQuotes.recommendation, filters.recommendation));
    }

    let query = db
      .select()
      .from(rfqQuotes);

    if (whereConditions.length > 0) {
      query = query.where(and(...whereConditions));
    }

    if (options.orderBy && (rfqQuotes as any)[options.orderBy]) {
      const field = (rfqQuotes as any)[options.orderBy];
      query = options.orderDirection === 'desc'
        ? query.orderBy(desc(field))
        : query.orderBy(asc(field));
    } else {
      query = query.orderBy(desc(rfqQuotes.overallScore));
    }

    if (options.limit) query = query.limit(options.limit);
    if (options.offset) query = query.offset(options.offset);

    return await query;
  }

  // ==================== PURCHASE ORDERS ====================

  /**
   * List purchase orders
   */
  async listPurchaseOrders(filters: PurchaseOrderFilters = {}, options: QueryOptions = {}) {
    const whereConditions: any[] = [eq(purchaseOrders.tenantId, this.tenantId)];

    if (filters.status) {
      whereConditions.push(eq(purchaseOrders.status, filters.status));
    }

    if (filters.supplierId) {
      whereConditions.push(eq(purchaseOrders.supplierId, filters.supplierId));
    }

    if (filters.orderDate) {
      whereConditions.push(eq(purchaseOrders.orderDate, filters.orderDate.toISOString().split('T')[0]));
    }

    if (filters.source) {
      whereConditions.push(eq(purchaseOrders.source, filters.source));
    }

    if (filters.projectId) {
      whereConditions.push(eq(purchaseOrders.projectId, filters.projectId));
    }

    let query = db
      .select()
      .from(purchaseOrders)
      .where(and(...whereConditions));

    if (options.orderBy && (purchaseOrders as any)[options.orderBy]) {
      const field = (purchaseOrders as any)[options.orderBy];
      query = options.orderDirection === 'desc'
        ? query.orderBy(desc(field))
        : query.orderBy(asc(field));
    } else {
      query = query.orderBy(desc(purchaseOrders.orderDate));
    }

    if (options.limit) query = query.limit(options.limit);
    if (options.offset) query = query.offset(options.offset);

    return await query;
  }

  /**
   * Get a single purchase order by ID
   */
  async getPurchaseOrder(id: string) {
    const result = await db
      .select()
      .from(purchaseOrders)
      .where(and(eq(purchaseOrders.id, id), eq(purchaseOrders.tenantId, this.tenantId)))
      .limit(1);

    return result[0] || null;
  }

  /**
   * List purchase order lines
   */
  async listPurchaseOrderLines(filters: PurchaseOrderLineFilters = {}, options: QueryOptions = {}) {
    const whereConditions: any[] = [eq(purchaseOrderLines.tenantId, this.tenantId)];

    if (filters.poId) {
      whereConditions.push(eq(purchaseOrderLines.poId, filters.poId));
    }

    if (filters.productId) {
      whereConditions.push(eq(purchaseOrderLines.productId, filters.productId));
    }

    let query = db
      .select()
      .from(purchaseOrderLines);

    if (whereConditions.length > 0) {
      query = query.where(and(...whereConditions));
    }

    if (options.limit) query = query.limit(options.limit);
    if (options.offset) query = query.offset(options.offset);

    return await query;
  }

  // ==================== RECEIPTS ====================

  /**
   * List receipts
   */
  async listReceipts(filters: ReceiptFilters = {}, options: QueryOptions = {}) {
    const whereConditions: any[] = [eq(receipts.tenantId, this.tenantId)];

    if (filters.status) {
      whereConditions.push(eq(receipts.status, filters.status));
    }

    if (filters.poId) {
      whereConditions.push(eq(receipts.poId, filters.poId));
    }

    if (filters.receiptDate) {
      whereConditions.push(eq(receipts.receiptDate, filters.receiptDate.toISOString().split('T')[0]));
    }

    if (filters.inspectionStatus) {
      whereConditions.push(eq(receipts.inspectionStatus, filters.inspectionStatus));
    }

    let query = db
      .select()
      .from(receipts)
      .where(and(...whereConditions));

    if (options.orderBy && (receipts as any)[options.orderBy]) {
      const field = (receipts as any)[options.orderBy];
      query = options.orderDirection === 'desc'
        ? query.orderBy(desc(field))
        : query.orderBy(asc(field));
    } else {
      query = query.orderBy(desc(receipts.receiptDate));
    }

    if (options.limit) query = query.limit(options.limit);
    if (options.offset) query = query.offset(options.offset);

    return await query;
  }

  /**
   * Get a single receipt by ID
   */
  async getReceipt(id: string) {
    const result = await db
      .select()
      .from(receipts)
      .where(and(eq(receipts.id, id), eq(receipts.tenantId, this.tenantId)))
      .limit(1);

    return result[0] || null;
  }

  /**
   * List receipt lines
   */
  async listReceiptLines(filters: ReceiptLineFilters = {}, options: QueryOptions = {}) {
    const whereConditions: any[] = [eq(receiptLines.tenantId, this.tenantId)];

    if (filters.receiptId) {
      whereConditions.push(eq(receiptLines.receiptId, filters.receiptId));
    }

    if (filters.productId) {
      whereConditions.push(eq(receiptLines.productId, filters.productId));
    }

    let query = db
      .select()
      .from(receiptLines);

    if (whereConditions.length > 0) {
      query = query.where(and(...whereConditions));
    }

    if (options.limit) query = query.limit(options.limit);
    if (options.offset) query = query.offset(options.offset);

    return await query;
  }

  // ==================== SUPPLIER RETURNS ====================

  /**
   * List supplier returns
   */
  async listSupplierReturns(filters: SupplierReturnFilters = {}, options: QueryOptions = {}) {
    const whereConditions: any[] = [eq(supplierReturns.tenantId, this.tenantId)];

    if (filters.status) {
      whereConditions.push(eq(supplierReturns.status, filters.status));
    }

    if (filters.supplierId) {
      whereConditions.push(eq(supplierReturns.supplierId, filters.supplierId));
    }

    if (filters.returnReason) {
      whereConditions.push(eq(supplierReturns.returnReason, filters.returnReason));
    }

    if (filters.returnDate) {
      whereConditions.push(eq(supplierReturns.returnDate, filters.returnDate.toISOString().split('T')[0]));
    }

    let query = db
      .select()
      .from(supplierReturns)
      .where(and(...whereConditions));

    if (options.orderBy && (supplierReturns as any)[options.orderBy]) {
      const field = (supplierReturns as any)[options.orderBy];
      query = options.orderDirection === 'desc'
        ? query.orderBy(desc(field))
        : query.orderBy(asc(field));
    } else {
      query = query.orderBy(desc(supplierReturns.returnDate));
    }

    if (options.limit) query = query.limit(options.limit);
    if (options.offset) query = query.offset(options.offset);

    return await query;
  }

  /**
   * Get a single supplier return by ID
   */
  async getSupplierReturn(id: string) {
    const result = await db
      .select()
      .from(supplierReturns)
      .where(and(eq(supplierReturns.id, id), eq(supplierReturns.tenantId, this.tenantId)))
      .limit(1);

    return result[0] || null;
  }

  /**
   * List supplier return lines
   */
  async listSupplierReturnLines(filters: SupplierReturnLineFilters = {}, options: QueryOptions = {}) {
    const whereConditions: any[] = [eq(supplierReturnLines.tenantId, this.tenantId)];

    if (filters.returnId) {
      whereConditions.push(eq(supplierReturnLines.returnId, filters.returnId));
    }

    if (filters.productId) {
      whereConditions.push(eq(supplierReturnLines.productId, filters.productId));
    }

    let query = db
      .select()
      .from(supplierReturnLines);

    if (whereConditions.length > 0) {
      query = query.where(and(...whereConditions));
    }

    if (options.limit) query = query.limit(options.limit);
    if (options.offset) query = query.offset(options.offset);

    return await query;
  }

  // ==================== PURCHASING INVOICES ====================

  /**
   * List purchasing invoices
   */
  async listPurchasingInvoices(filters: PurchasingInvoiceFilters = {}, options: QueryOptions = {}) {
    const whereConditions: any[] = [eq(purchasingInvoices.tenantId, this.tenantId)];

    if (filters.status) {
      whereConditions.push(eq(purchasingInvoices.status, filters.status));
    }

    if (filters.supplierId) {
      whereConditions.push(eq(purchasingInvoices.supplierId, filters.supplierId));
    }

    if (filters.threeWayMatchStatus) {
      whereConditions.push(eq(purchasingInvoices.threeWayMatchStatus, filters.threeWayMatchStatus));
    }

    if (filters.dueDate) {
      whereConditions.push(lte(purchasingInvoices.dueDate, filters.dueDate.toISOString().split('T')[0]));
    }

    if (filters.invoiceDate) {
      whereConditions.push(eq(purchasingInvoices.invoiceDate, filters.invoiceDate.toISOString().split('T')[0]));
    }

    let query = db
      .select()
      .from(purchasingInvoices)
      .where(and(...whereConditions));

    if (options.orderBy && (purchasingInvoices as any)[options.orderBy]) {
      const field = (purchasingInvoices as any)[options.orderBy];
      query = options.orderDirection === 'desc'
        ? query.orderBy(desc(field))
        : query.orderBy(asc(field));
    } else {
      query = query.orderBy(desc(purchasingInvoices.invoiceDate));
    }

    if (options.limit) query = query.limit(options.limit);
    if (options.offset) query = query.offset(options.offset);

    return await query;
  }

  /**
   * Get a single purchasing invoice by ID
   */
  async getPurchasingInvoice(id: string) {
    const result = await db
      .select()
      .from(purchasingInvoices)
      .where(and(eq(purchasingInvoices.id, id), eq(purchasingInvoices.tenantId, this.tenantId)))
      .limit(1);

    return result[0] || null;
  }

  /**
   * List purchasing invoice lines
   */
  async listPurchasingInvoiceLines(filters: PurchasingInvoiceLineFilters = {}, options: QueryOptions = {}) {
    const whereConditions: any[] = [eq(purchasingInvoiceLines.tenantId, this.tenantId)];

    if (filters.invoiceId) {
      whereConditions.push(eq(purchasingInvoiceLines.invoiceId, filters.invoiceId));
    }

    if (filters.productId) {
      whereConditions.push(eq(purchasingInvoiceLines.productId, filters.productId));
    }

    let query = db
      .select()
      .from(purchasingInvoiceLines);

    if (whereConditions.length > 0) {
      query = query.where(and(...whereConditions));
    }

    if (options.limit) query = query.limit(options.limit);
    if (options.offset) query = query.offset(options.offset);

    return await query;
  }

  // ==================== PURCHASING PAYMENTS ====================

  /**
   * List purchasing payments
   */
  async listPurchasingPayments(filters: PurchasingPaymentFilters = {}, options: QueryOptions = {}) {
    const whereConditions: any[] = [eq(purchasingPayments.tenantId, this.tenantId)];

    if (filters.status) {
      whereConditions.push(eq(purchasingPayments.status, filters.status));
    }

    if (filters.supplierId) {
      whereConditions.push(eq(purchasingPayments.supplierId, filters.supplierId));
    }

    if (filters.paymentMethod) {
      whereConditions.push(eq(purchasingPayments.paymentMethod, filters.paymentMethod));
    }

    if (filters.paymentDate) {
      whereConditions.push(eq(purchasingPayments.paymentDate, filters.paymentDate.toISOString().split('T')[0]));
    }

    let query = db
      .select()
      .from(purchasingPayments)
      .where(and(...whereConditions));

    if (options.orderBy && (purchasingPayments as any)[options.orderBy]) {
      const field = (purchasingPayments as any)[options.orderBy];
      query = options.orderDirection === 'desc'
        ? query.orderBy(desc(field))
        : query.orderBy(asc(field));
    } else {
      query = query.orderBy(desc(purchasingPayments.paymentDate));
    }

    if (options.limit) query = query.limit(options.limit);
    if (options.offset) query = query.offset(options.offset);

    return await query;
  }

  /**
   * Get a single payment by ID
   */
  async getPurchasingPayment(id: string) {
    const result = await db
      .select()
      .from(purchasingPayments)
      .where(and(eq(purchasingPayments.id, id), eq(purchasingPayments.tenantId, this.tenantId)))
      .limit(1);

    return result[0] || null;
  }

  /**
   * List payment allocations to invoices
   */
  async listPaymentAllocations(filters: PaymentAllocationFilters = {}, options: QueryOptions = {}) {
    const whereConditions: any[] = [eq(purchasingPaymentAllocations.tenantId, this.tenantId)];

    if (filters.paymentId) {
      whereConditions.push(eq(purchasingPaymentAllocations.paymentId, filters.paymentId));
    }

    if (filters.invoiceId) {
      whereConditions.push(eq(purchasingPaymentAllocations.invoiceId, filters.invoiceId));
    }

    let query = db
      .select()
      .from(purchasingPaymentAllocations)
      .where(and(...whereConditions));

    if (options.orderBy && (purchasingPaymentAllocations as any)[options.orderBy]) {
      const field = (purchasingPaymentAllocations as any)[options.orderBy];
      query = options.orderDirection === 'desc'
        ? query.orderBy(desc(field))
        : query.orderBy(asc(field));
    } else {
      query = query.orderBy(desc(purchasingPaymentAllocations.allocationDate));
    }

    if (options.limit) query = query.limit(options.limit);
    if (options.offset) query = query.offset(options.offset);

    return await query;
  }

  // ==================== EMPLOYEE EXPENSES ====================

  /**
   * List employee expenses
   */
  async listEmployeeExpenses(filters: EmployeeExpenseFilters = {}, options: QueryOptions = {}) {
    const whereConditions: any[] = [eq(employeeExpenses.tenantId, this.tenantId)];

    if (filters.status) {
      whereConditions.push(eq(employeeExpenses.status, filters.status));
    }

    if (filters.employeeId) {
      whereConditions.push(eq(employeeExpenses.employeeId, filters.employeeId));
    }

    if (filters.projectId) {
      whereConditions.push(eq(employeeExpenses.projectId, filters.projectId));
    }

    if (filters.category) {
      whereConditions.push(eq(employeeExpenses.category, filters.category));
    }

    if (filters.expenseDate) {
      whereConditions.push(eq(employeeExpenses.expenseDate, filters.expenseDate.toISOString().split('T')[0]));
    }

    let query = db
      .select()
      .from(employeeExpenses)
      .where(and(...whereConditions));

    if (options.orderBy && (employeeExpenses as any)[options.orderBy]) {
      const field = (employeeExpenses as any)[options.orderBy];
      query = options.orderDirection === 'desc'
        ? query.orderBy(desc(field))
        : query.orderBy(asc(field));
    } else {
      query = query.orderBy(desc(employeeExpenses.expenseDate));
    }

    if (options.limit) query = query.limit(options.limit);
    if (options.offset) query = query.offset(options.offset);

    return await query;
  }

  /**
   * Get a single employee expense by ID
   */
  async getEmployeeExpense(id: string) {
    const result = await db
      .select()
      .from(employeeExpenses)
      .where(and(eq(employeeExpenses.id, id), eq(employeeExpenses.tenantId, this.tenantId)))
      .limit(1);

    return result[0] || null;
  }

  // ==================== AGGREGATIONS ====================

  /**
   * Get total orders statistics
   */
  async getTotalOrders(filters: TotalOrdersFilters = {}): Promise<{ count: number; totalValue: number }> {
    const whereConditions: any[] = [eq(purchaseOrders.tenantId, this.tenantId)];

    if (filters.supplierId) {
      whereConditions.push(eq(purchaseOrders.supplierId, filters.supplierId));
    }

    if (filters.dateFrom) {
      whereConditions.push(gte(purchaseOrders.orderDate, filters.dateFrom.toISOString().split('T')[0]));
    }

    if (filters.dateTo) {
      whereConditions.push(lte(purchaseOrders.orderDate, filters.dateTo.toISOString().split('T')[0]));
    }

    if (filters.status) {
      whereConditions.push(eq(purchaseOrders.status, filters.status));
    }

    const result = await db
      .select({
        count: sql<number>`count(*)::int`,
        totalValue: sql<number>`COALESCE(sum(${purchaseOrders.totalAmount}), 0)::numeric`,
      })
      .from(purchaseOrders)
      .where(and(...whereConditions));

    return {
      count: Number(result[0]?.count || 0),
      totalValue: Number(result[0]?.totalValue || 0),
    };
  }

  /**
   * Get total spend statistics
   */
  async getTotalSpend(filters: TotalSpendFilters = {}): Promise<{
    totalAmount: number;
    bySupplier: Array<{ supplierId: string; supplierName: string; totalAmount: number }>;
  }> {
    const whereConditions: any[] = [eq(purchaseOrders.tenantId, this.tenantId)];

    if (filters.dateFrom) {
      whereConditions.push(gte(purchaseOrders.orderDate, filters.dateFrom.toISOString().split('T')[0]));
    }

    if (filters.dateTo) {
      whereConditions.push(lte(purchaseOrders.orderDate, filters.dateTo.toISOString().split('T')[0]));
    }

    if (filters.supplierId) {
      whereConditions.push(eq(purchaseOrders.supplierId, filters.supplierId));
    }

    // Get total amount
    const totalResult = await db
      .select({
        totalAmount: sql<number>`COALESCE(sum(${purchaseOrders.totalAmount}), 0)::numeric`,
      })
      .from(purchaseOrders)
      .where(and(...whereConditions));

    // Get by supplier
    const bySupplierResult = await db
      .select({
        supplierId: purchaseOrders.supplierId,
        supplierName: suppliers.name,
        totalAmount: sql<number>`COALESCE(sum(${purchaseOrders.totalAmount}), 0)::numeric`,
      })
      .from(purchaseOrders)
      .leftJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
      .where(and(...whereConditions))
      .groupBy(purchaseOrders.supplierId, suppliers.name)
      .orderBy(desc(sql`sum(${purchaseOrders.totalAmount})`));

    return {
      totalAmount: Number(totalResult[0]?.totalAmount || 0),
      bySupplier: bySupplierResult.map((r: any) => ({
        supplierId: r.supplierId,
        supplierName: r.supplierName || 'Unknown',
        totalAmount: Number(r.totalAmount || 0),
      })),
    };
  }

  /**
   * Get pending invoices summary
   */
  async getPendingInvoices(supplierId?: string): Promise<{ count: number; totalAmount: number }> {
    const whereConditions: any[] = [
      eq(purchasingInvoices.tenantId, this.tenantId),
      eq(purchasingInvoices.status, 'approved'),
    ];

    if (supplierId) {
      whereConditions.push(eq(purchasingInvoices.supplierId, supplierId));
    }

    // Invoices that are not fully paid
    whereConditions.push(sql`${purchasingInvoices.remainingAmount} > 0`);

    const result = await db
      .select({
        count: sql<number>`count(*)::int`,
        totalAmount: sql<number>`COALESCE(sum(${purchasingInvoices.remainingAmount}), 0)::numeric`,
      })
      .from(purchasingInvoices)
      .where(and(...whereConditions));

    return {
      count: Number(result[0]?.count || 0),
      totalAmount: Number(result[0]?.totalAmount || 0),
    };
  }

  /**
   * Get payables summary (accounts payable)
   */
  async getReceivablesSummary(): Promise<{ total: number; overdue: number }> {
    const whereConditions: any[] = [
      eq(purchasingInvoices.tenantId, this.tenantId),
      eq(purchasingInvoices.status, 'approved'),
      sql`${purchasingInvoices.remainingAmount} > 0`,
    ];

    // Total payables
    const totalResult = await db
      .select({
        total: sql<number>`COALESCE(sum(${purchasingInvoices.remainingAmount}), 0)::numeric`,
      })
      .from(purchasingInvoices)
      .where(and(...whereConditions));

    // Overdue payables
    const overdueResult = await db
      .select({
        overdue: sql<number>`COALESCE(sum(${purchasingInvoices.remainingAmount}), 0)::numeric`,
      })
      .from(purchasingInvoices)
      .where(
        and(
          ...whereConditions,
          sql`${purchasingInvoices.dueDate} < CURRENT_DATE`
        )
      );

    return {
      total: Number(totalResult[0]?.total || 0),
      overdue: Number(overdueResult[0]?.overdue || 0),
    };
  }

  /**
   * Get supplier performance metrics
   */
  async getSupplierPerformance(supplierId: string): Promise<{
    overallScore: number;
    qualityScore: number;
    onTimeDeliveryRate: number;
    priceCompetitiveness: number;
    communicationScore: number;
    totalOrders: number;
    totalOrdersValue: number;
    defectRate: number;
    returnRate: number;
  }> {
    const supplier = await this.getSupplier(supplierId);

    if (!supplier) {
      return {
        overallScore: 0,
        qualityScore: 0,
        onTimeDeliveryRate: 0,
        priceCompetitiveness: 0,
        communicationScore: 0,
        totalOrders: 0,
        totalOrdersValue: 0,
        defectRate: 0,
        returnRate: 0,
      };
    }

    return {
      overallScore: Number(supplier.overallScore || 0),
      qualityScore: Number(supplier.qualityScore || 0),
      onTimeDeliveryRate: Number(supplier.onTimeDeliveryRate || 0),
      priceCompetitiveness: Number(supplier.priceCompetitiveness || 0),
      communicationScore: Number(supplier.communicationScore || 0),
      totalOrders: Number(supplier.totalOrdersCount || 0),
      totalOrdersValue: Number(supplier.totalOrdersValue || 0),
      defectRate: Number(supplier.defectRate || 0),
      returnRate: Number(supplier.returnRate || 0),
    };
  }

  /**
   * Get expenses by project
   */
  async getExpensesByProject(projectId?: string): Promise<
    Array<{
      projectId: string | null;
      totalAmount: number;
      count: number;
      categories: Array<{ category: string; amount: number }>;
    }>
  > {
    const whereConditions: any[] = [eq(employeeExpenses.tenantId, this.tenantId)];

    if (projectId) {
      whereConditions.push(eq(employeeExpenses.projectId, projectId));
    }

    // Get totals by project
    const projectTotals = await db
      .select({
        projectId: employeeExpenses.projectId,
        totalAmount: sql<number>`COALESCE(sum(${employeeExpenses.amount}), 0)::numeric`,
        count: sql<number>`count(*)::int`,
      })
      .from(employeeExpenses)
      .where(and(...whereConditions))
      .groupBy(employeeExpenses.projectId);

    // For each project, get breakdown by category
    const result = await Promise.all(
      projectTotals.map(async (project: any) => {
        const categoryConditions = [...whereConditions];
        if (project.projectId) {
          categoryConditions.push(eq(employeeExpenses.projectId, project.projectId));
        } else {
          categoryConditions.push(isNull(employeeExpenses.projectId));
        }

        const categories = await db
          .select({
            category: employeeExpenses.category,
            amount: sql<number>`COALESCE(sum(${employeeExpenses.amount}), 0)::numeric`,
          })
          .from(employeeExpenses)
          .where(and(...categoryConditions))
          .groupBy(employeeExpenses.category);

        return {
          projectId: project.projectId,
          totalAmount: Number(project.totalAmount || 0),
          count: Number(project.count || 0),
          categories: categories.map((c: any) => ({
            category: c.category,
            amount: Number(c.amount || 0),
          })),
        };
      })
    );

    return result;
  }
}
