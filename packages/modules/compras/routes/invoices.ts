/**
 * Compras Module - Purchasing Invoices Routes
 * 
 * Routes for managing purchasing invoices and invoice lines
 */

import type { RouteDefinition } from '../../base/module.interface';
import { z } from 'zod';
import { idParamSchema, invoiceQuerySchema } from './schemas';

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const invoiceLineSchema = z.object({
  poLineId: z.string().uuid().optional(),
  receiptLineId: z.string().uuid().optional(),
  productId: z.string().uuid().optional(),
  description: z.string().min(1),
  quantity: z.number().positive(),
  unitPrice: z.number().positive(),
  taxRate: z.number().min(0).max(100),
  taxAmount: z.number().min(0),
  totalPrice: z.number().positive(),
  accountCode: z.string().optional(),
  costCenter: z.string().optional(),
  notes: z.string().optional()
});

const createInvoiceSchema = z.object({
  supplierId: z.string().uuid(),
  purchaseOrderId: z.string().uuid().optional(),
  receiptId: z.string().uuid().optional(),
  invoiceNumber: z.string().min(1),
  invoiceDate: z.string().datetime(),
  dueDate: z.string().datetime(),
  currency: z.string().default('EUR'),
  exchangeRate: z.number().positive().default(1),
  paymentTerms: z.string().optional(),
  taxIdNumber: z.string().optional(),
  notes: z.string().optional(),
  attachments: z.array(z.string()).optional(),
  lines: z.array(invoiceLineSchema).min(1)
});

const updateInvoiceSchema = z.object({
  invoiceNumber: z.string().optional(),
  invoiceDate: z.string().datetime().optional(),
  dueDate: z.string().datetime().optional(),
  paymentTerms: z.string().optional(),
  notes: z.string().optional(),
  attachments: z.array(z.string()).optional(),
  lines: z.array(invoiceLineSchema).optional()
});

const uploadOcrSchema = z.object({
  fileUrl: z.string().url(),
  fileName: z.string(),
  supplierId: z.string().uuid().optional(),
  autoMatch: z.boolean().default(true),
  createDraft: z.boolean().default(true)
});

const threeWayMatchSchema = z.object({
  tolerance: z.object({
    quantity: z.number().min(0).max(100).default(5),
    price: z.number().min(0).max(100).default(5),
    total: z.number().min(0).max(100).default(5)
  }).optional(),
  autoApprove: z.boolean().default(false)
});

const approveInvoiceSchema = z.object({
  approved: z.boolean(),
  rejectionReason: z.string().optional(),
  paymentScheduled: z.boolean().default(false),
  paymentDate: z.string().datetime().optional(),
  notes: z.string().optional()
});

// assistDOCS integration schemas
const analyzeInvoiceSchema = z.object({
  fileId: z.string().uuid()
});

const validateInvoiceSchema = z.object({
  // Core Invoice Data (all optional for manual editing)
  supplierName: z.string().optional(),
  nif: z.string().optional(),
  receiverTaxId: z.string().optional(),
  invoiceNumber: z.string().optional(),
  invoiceType: z.string().optional(),
  invoiceDate: z.string().datetime().optional(),
  dueDate: z.string().datetime().optional(),
  paymentStatus: z.string().optional(), // pending | paid | overdue | cancelled
  paymentDate: z.string().datetime().optional(),
  totalAmount: z.number().optional(),
  taxAmount: z.number().optional(),
  netAmount: z.number().optional(),
  currency: z.string().optional(),
  description: z.string().optional(),
  lineItems: z.array(z.any()).optional(), // JSONB array of line items
  
  // Supplier/Issuer Details (Google Document AI fields)
  supplierAddress: z.string().optional(),
  supplierCity: z.string().optional(),
  supplierCountry: z.string().optional(),
  supplierPostalCode: z.string().optional(),
  supplierEmail: z.string().optional(),
  supplierPhone: z.string().optional(),
  supplierIban: z.string().optional(),
  supplierWebsite: z.string().optional(),
  supplierRegistration: z.string().optional(),
  supplierPaymentRef: z.string().optional(),
  
  // Receiver Details
  receiverName: z.string().optional(),
  receiverAddress: z.string().optional(),
  receiverCity: z.string().optional(),
  receiverCountry: z.string().optional(),
  receiverPostalCode: z.string().optional(),
  receiverEmail: z.string().optional(),
  receiverPhone: z.string().optional(),
  receiverWebsite: z.string().optional(),
  
  // Remit-To & Ship-To Information
  remitToAddress: z.string().optional(),
  remitToName: z.string().optional(),
  shipFromAddress: z.string().optional(),
  shipFromName: z.string().optional(),
  shipToAddress: z.string().optional(),
  shipToName: z.string().optional(),
  
  // Payment & Amounts
  amountDue: z.number().optional(),
  amountPaidSinceLastInvoice: z.number().optional(),
  paymentAmount: z.number().optional(),
  paymentTerms: z.string().optional(),
  paymentMethod: z.string().optional(),
  
  // Shipping & Delivery
  freightAmount: z.number().optional(),
  carrier: z.string().optional(),
  deliveryDate: z.string().datetime().optional(),
  
  // Additional Financial
  totalDiscount: z.string().optional(),
  totalNetAmount: z.number().optional(),
  currencyExchangeRate: z.number().optional(),
  
  // Purchase Orders & References
  purchaseOrder: z.string().optional(),
  customerTaxId: z.string().optional(),
  
  // Business Context
  category: z.string().optional(),
  costCenter: z.string().optional(),
  projectId: z.string().uuid().optional(),
  purchaseOrderId: z.string().uuid().optional(),
  emailInboxId: z.string().uuid().optional(),
  status: z.string().optional(), // received | processing | validated | rejected
  validationStatus: z.string().optional(),
  validationErrors: z.array(z.any()).optional(), // JSONB array
  metadata: z.record(z.any()).optional(), // JSONB metadata
  
  // Validation decision (HITL) - NO DEFAULTS, must be explicit
  // extractionStatus is DERIVED from approved flag, NOT user-settable
  // extractionConfidence/processor/metadata are READ-ONLY system fields
  approved: z.boolean().optional(), // MUST be explicitly set by user
  rejectionReason: z.string().optional(),
  notes: z.string().optional()
});

// ============================================================================
// ROUTES
// ============================================================================

export const invoicesRoutes: RouteDefinition[] = [
  // ========== PURCHASING INVOICES ==========
  {
    method: 'GET',
    path: '/api/compras/invoices/pending-validation',
    handler: 'listPendingInvoices',
    permissions: ['purchasing.read'],
    validation: {
      query: z.object({}).optional()
    }
  },
  
  {
    method: 'GET',
    path: '/api/compras/invoices',
    handler: 'listInvoices',
    permissions: ['purchasing.read'],
    validation: {
      query: invoiceQuerySchema.optional()
    }
  },
  
  {
    method: 'POST',
    path: '/api/compras/invoices',
    handler: 'createInvoice',
    permissions: ['purchasing.write'],
    validation: {
      body: createInvoiceSchema
    }
  },
  
  {
    method: 'GET',
    path: '/api/compras/invoices/:id',
    handler: 'getInvoice',
    permissions: ['purchasing.read'],
    validation: {
      params: idParamSchema
    }
  },
  
  {
    method: 'PATCH',
    path: '/api/compras/invoices/:id',
    handler: 'updateInvoice',
    permissions: ['purchasing.write'],
    validation: {
      params: idParamSchema,
      body: updateInvoiceSchema
    }
  },
  
  {
    method: 'DELETE',
    path: '/api/compras/invoices/:id',
    handler: 'deleteInvoice',
    permissions: ['purchasing.write'],
    validation: {
      params: idParamSchema
    }
  },
  
  // ========== ASSISTDOCS & HITL WORKFLOW ==========
  {
    method: 'POST',
    path: '/api/compras/invoices/analyze',
    handler: 'analyzeInvoice',
    permissions: ['purchasing.write'],
    validation: {
      body: analyzeInvoiceSchema
    }
  },
  
  {
    method: 'PATCH',
    path: '/api/compras/invoices/:id/validate',
    handler: 'validateInvoice',
    permissions: ['purchasing.write'],
    validation: {
      params: idParamSchema,
      body: validateInvoiceSchema
    }
  },
  
  // ========== OCR & AUTOMATION ==========
  {
    method: 'POST',
    path: '/api/compras/invoices/upload-ocr',
    handler: 'uploadInvoiceOcr',
    permissions: ['purchasing.write'],
    validation: {
      body: uploadOcrSchema
    }
  },
  
  {
    method: 'POST',
    path: '/api/compras/invoices/:id/extract-data',
    handler: 'extractInvoiceData',
    permissions: ['purchasing.write'],
    validation: {
      params: idParamSchema,
      body: z.object({
        fileUrl: z.string().url().optional(),
        ocrProvider: z.enum(['google_vision', 'aws_textract', 'azure_form']).default('google_vision')
      }).optional()
    }
  },
  
  // ========== WORKFLOW ACTIONS ==========
  {
    method: 'POST',
    path: '/api/compras/invoices/:id/three-way-match',
    handler: 'threeWayMatch',
    permissions: ['purchasing.write'],
    validation: {
      params: idParamSchema,
      body: threeWayMatchSchema.optional()
    }
  },
  
  {
    method: 'POST',
    path: '/api/compras/invoices/:id/approve',
    handler: 'approveInvoice',
    permissions: ['purchasing.approve'],
    validation: {
      params: idParamSchema,
      body: approveInvoiceSchema
    }
  },
  
  {
    method: 'POST',
    path: '/api/compras/invoices/:id/schedule-payment',
    handler: 'schedulePayment',
    permissions: ['compras.payments'],
    validation: {
      params: idParamSchema,
      body: z.object({
        paymentDate: z.string().datetime(),
        paymentMethod: z.enum(['bank_transfer', 'check', 'credit_card', 'other']),
        notes: z.string().optional()
      })
    }
  },
  
  // ========== INVOICE LINES ==========
  {
    method: 'GET',
    path: '/api/compras/invoices/:id/lines',
    handler: 'getInvoiceLines',
    permissions: ['purchasing.read'],
    validation: {
      params: idParamSchema
    }
  }
];
