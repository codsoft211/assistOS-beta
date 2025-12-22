/**
 * Compras Module - Reusable Validation Schemas
 * 
 * Common Zod schemas used across procurement routes
 */

import { z } from 'zod';

// ============================================================================
// COMMON PARAMETER SCHEMAS
// ============================================================================

export const idParamSchema = z.object({
  id: z.string().uuid()
});

export const paginationSchema = z.object({
  limit: z.coerce.number().int().positive().max(1000).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(1000).optional()
});

export const dateRangeSchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional()
});

export const searchSchema = z.object({
  search: z.string().optional(),
  searchFields: z.array(z.string()).optional()
});

export const sortSchema = z.object({
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional()
});

// ============================================================================
// STATUS ENUMS
// ============================================================================

export const supplierTypeEnum = z.enum(['preferred', 'approved', 'trial', 'blocked']);

export const requisitionStatusEnum = z.enum([
  'draft',
  'pending_approval',
  'approved',
  'rejected',
  'converted_to_po'
]);

export const rfqStatusEnum = z.enum([
  'draft',
  'sent',
  'responses_received',
  'evaluated',
  'awarded',
  'cancelled'
]);

export const purchaseOrderStatusEnum = z.enum([
  'draft',
  'sent',
  'confirmed',
  'partially_received',
  'fully_received',
  'cancelled'
]);

export const receiptStatusEnum = z.enum([
  'draft',
  'received',
  'inspected',
  'accepted',
  'partially_accepted',
  'rejected'
]);

export const returnStatusEnum = z.enum([
  'draft',
  'sent',
  'acknowledged',
  'received_by_supplier',
  'refunded',
  'replaced',
  'cancelled'
]);

export const invoiceStatusEnum = z.enum([
  'draft',
  'pending_match',
  'matched',
  'mismatch',
  'pending_approval',
  'approved',
  'rejected',
  'paid',
  'partially_paid',
  'cancelled'
]);

export const paymentStatusEnum = z.enum([
  'pending',
  'scheduled',
  'processing',
  'completed',
  'failed',
  'cancelled'
]);

export const expenseStatusEnum = z.enum([
  'draft',
  'submitted',
  'pending_approval',
  'approved',
  'rejected',
  'reimbursed',
  'cancelled'
]);

export const priorityEnum = z.enum(['low', 'normal', 'high', 'urgent']);

// ============================================================================
// QUERY SCHEMAS
// ============================================================================

export const listQuerySchema = paginationSchema.merge(searchSchema).merge(sortSchema).merge(z.object({
  status: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional()
}));

export const supplierQuerySchema = listQuerySchema.merge(z.object({
  type: supplierTypeEnum.optional(),
  category: z.string().optional(),
  minScore: z.coerce.number().min(0).max(100).optional(),
  isActive: z.coerce.boolean().optional()
}));

export const requisitionQuerySchema = listQuerySchema.merge(z.object({
  status: requisitionStatusEnum.optional(),
  requestedBy: z.string().optional(),
  priority: priorityEnum.optional(),
  projectId: z.string().optional()
}));

export const rfqQuerySchema = listQuerySchema.merge(z.object({
  status: rfqStatusEnum.optional(),
  supplierId: z.string().optional()
}));

export const purchaseOrderQuerySchema = listQuerySchema.merge(z.object({
  status: purchaseOrderStatusEnum.optional(),
  supplierId: z.string().optional(),
  expectedStartDate: z.string().optional(),
  expectedEndDate: z.string().optional()
}));

export const invoiceQuerySchema = listQuerySchema.merge(z.object({
  status: invoiceStatusEnum.optional(),
  supplierId: z.string().optional(),
  isPaid: z.coerce.boolean().optional()
}));

export const paymentQuerySchema = listQuerySchema.merge(z.object({
  status: paymentStatusEnum.optional(),
  supplierId: z.string().optional(),
  paymentMethod: z.string().optional()
}));

export const expenseQuerySchema = listQuerySchema.merge(z.object({
  status: expenseStatusEnum.optional(),
  employeeId: z.string().optional(),
  category: z.string().optional()
}));
