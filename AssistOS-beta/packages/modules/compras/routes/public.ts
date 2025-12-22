/**
 * Compras Module - Public Routes
 * 
 * Public routes for supplier invoice submission (no authentication required)
 * Token-based security with expiration
 */

import type { RouteDefinition } from '../../base/module.interface';
import { z } from 'zod';

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const tokenParamSchema = z.object({
  token: z.string().uuid()
});

const submitInvoiceSchema = z.object({
  invoiceNumber: z.string().min(1, 'Invoice number is required'),
  invoiceDate: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: 'Invalid date format'
  }),
  totalAmount: z.number().positive('Total amount must be positive'),
  currency: z.string().default('EUR'),
  notes: z.string().optional(),
  attachmentUrl: z.string().url('Invalid attachment URL').optional(),
  lineItems: z.array(z.object({
    description: z.string(),
    quantity: z.number().positive(),
    unitPrice: z.number().positive(),
    lineTotal: z.number().positive()
  })).optional()
});

// ============================================================================
// ROUTES
// ============================================================================

export const publicRoutes: RouteDefinition[] = [
  // Validate token - check if it's valid, not expired, and not used
  {
    method: 'GET',
    path: '/api/public/supplier-invoice/:token/validate',
    handler: 'validateInvoiceSubmissionToken',
    permissions: [], // No authentication required
    validation: {
      params: tokenParamSchema
    }
  },
  
  // Submit invoice - create invoice record and revoke token
  {
    method: 'POST',
    path: '/api/public/supplier-invoice/:token',
    handler: 'submitSupplierInvoice',
    permissions: [], // No authentication required
    validation: {
      params: tokenParamSchema,
      body: submitInvoiceSchema
    }
  }
];
