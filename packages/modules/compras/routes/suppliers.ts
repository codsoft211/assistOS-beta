/**
 * Compras Module - Suppliers Routes
 * 
 * Routes for managing suppliers, product suppliers, and supplier price history
 */

import type { RouteDefinition } from '../../base/module.interface';
import { z } from 'zod';
import { idParamSchema, supplierQuerySchema, listQuerySchema } from './schemas';

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const createSupplierSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  legalName: z.string().optional(),
  taxId: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().default('PT'),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  website: z.string().url().optional(),
  primaryContactName: z.string().optional(),
  primaryContactEmail: z.string().email().optional(),
  primaryContactPhone: z.string().optional(),
  category: z.string().optional(),
  type: z.enum(['preferred', 'approved', 'trial', 'blocked']).default('approved'),
  paymentTerms: z.string().optional(),
  deliveryTerms: z.string().optional(),
  currency: z.string().default('EUR'),
  minimumOrderValue: z.number().optional(),
  averageLeadTimeDays: z.number().int().optional(),
  bankName: z.string().optional(),
  iban: z.string().optional(),
  swiftBic: z.string().optional(),
  notes: z.string().optional()
});

const updateSupplierSchema = createSupplierSchema.partial();

const createProductSupplierSchema = z.object({
  productId: z.string().uuid(),
  supplierId: z.string().uuid(),
  supplierProductCode: z.string().optional(),
  supplierProductName: z.string().optional(),
  currentPrice: z.number().positive(),
  currency: z.string().default('EUR'),
  priceValidFrom: z.string().datetime().optional(),
  priceValidTo: z.string().datetime().optional(),
  minimumOrderQuantity: z.number().positive().optional(),
  quantityMultiple: z.number().positive().optional(),
  leadTimeDays: z.number().int().positive(),
  leadTimeVariance: z.number().int().optional(),
  isPreferred: z.boolean().default(false),
  priority: z.number().int().default(0),
  notes: z.string().optional()
});

const updateProductSupplierSchema = createProductSupplierSchema.partial();

const scoreSupplierSchema = z.object({
  supplierId: z.string().uuid(),
  criteria: z.object({
    onTimeDeliveryRate: z.number().min(0).max(100).optional(),
    qualityScore: z.number().min(0).max(100).optional(),
    priceCompetitiveness: z.number().min(0).max(100).optional(),
    communicationScore: z.number().min(0).max(100).optional(),
    defectRate: z.number().min(0).max(100).optional(),
    returnRate: z.number().min(0).max(100).optional()
  }).optional()
});

// ============================================================================
// ROUTES
// ============================================================================

export const suppliersRoutes: RouteDefinition[] = [
  // ========== SUPPLIERS ==========
  {
    method: 'GET',
    path: '/api/compras/suppliers',
    handler: 'listSuppliers',
    permissions: ['purchasing.read'],
    validation: {
      query: supplierQuerySchema.optional()
    }
  },
  
  {
    method: 'POST',
    path: '/api/compras/suppliers',
    handler: 'createSupplier',
    permissions: ['purchasing.write'],
    validation: {
      body: createSupplierSchema
    }
  },
  
  {
    method: 'GET',
    path: '/api/compras/suppliers/:id',
    handler: 'getSupplier',
    permissions: ['purchasing.read'],
    validation: {
      params: idParamSchema
    }
  },
  
  {
    method: 'PATCH',
    path: '/api/compras/suppliers/:id',
    handler: 'updateSupplier',
    permissions: ['purchasing.write'],
    validation: {
      params: idParamSchema,
      body: updateSupplierSchema
    }
  },
  
  {
    method: 'DELETE',
    path: '/api/compras/suppliers/:id',
    handler: 'deleteSupplier',
    permissions: ['purchasing.write'],
    validation: {
      params: idParamSchema
    }
  },
  
  // ========== SUPPLIER SCORING ==========
  {
    method: 'POST',
    path: '/api/compras/suppliers/:id/score',
    handler: 'scoreSupplier',
    permissions: ['purchasing.write'],
    validation: {
      params: idParamSchema,
      body: scoreSupplierSchema
    }
  },
  
  // ========== PRODUCT SUPPLIERS ==========
  {
    method: 'GET',
    path: '/api/compras/product-suppliers',
    handler: 'listProductSuppliers',
    permissions: ['purchasing.read'],
    validation: {
      query: listQuerySchema.merge(z.object({
        productId: z.string().uuid().optional(),
        supplierId: z.string().uuid().optional(),
        isPreferred: z.coerce.boolean().optional()
      })).optional()
    }
  },
  
  {
    method: 'POST',
    path: '/api/compras/product-suppliers',
    handler: 'createProductSupplier',
    permissions: ['purchasing.write'],
    validation: {
      body: createProductSupplierSchema
    }
  },
  
  {
    method: 'GET',
    path: '/api/compras/product-suppliers/:id',
    handler: 'getProductSupplier',
    permissions: ['purchasing.read'],
    validation: {
      params: idParamSchema
    }
  },
  
  {
    method: 'PATCH',
    path: '/api/compras/product-suppliers/:id',
    handler: 'updateProductSupplier',
    permissions: ['purchasing.write'],
    validation: {
      params: idParamSchema,
      body: updateProductSupplierSchema
    }
  },
  
  {
    method: 'DELETE',
    path: '/api/compras/product-suppliers/:id',
    handler: 'deleteProductSupplier',
    permissions: ['purchasing.write'],
    validation: {
      params: idParamSchema
    }
  },
  
  // ========== SUPPLIER PRICE HISTORY ==========
  {
    method: 'GET',
    path: '/api/compras/supplier-price-history',
    handler: 'listSupplierPriceHistory',
    permissions: ['purchasing.read'],
    validation: {
      query: listQuerySchema.merge(z.object({
        productSupplierId: z.string().uuid().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional()
      })).optional()
    }
  },
  
  {
    method: 'GET',
    path: '/api/compras/supplier-price-history/:id',
    handler: 'getSupplierPriceHistory',
    permissions: ['purchasing.read'],
    validation: {
      params: idParamSchema
    }
  }
];
