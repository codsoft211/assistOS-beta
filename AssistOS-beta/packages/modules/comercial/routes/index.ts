/**
 * Comercial Module Routes
 * 
 * Complete CRM routes: Clientes, Encomendas, Oportunidades, Analytics
 * 
 * NOTE: Routes are relative to the mount point /api/commercial (see apps/api/routes.ts)
 * Actual URLs: /api/commercial/clientes, /api/commercial/encomendas, etc.
 */

import type { RouteDefinition } from '../../base/module.interface';
import { z } from 'zod';

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

// Leads
const createLeadSchema = z.object({
  contactName: z.string(),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().optional(),
  description: z.string().optional(),
  leadSource: z.string().optional()
});

// Quotes
const createQuoteSchema = z.object({
  leadId: z.string(),
  numPax: z.number().int().positive(),
  eventLocation: z.string().optional(),
  notes: z.string().optional()
});

// Clients
const createClientSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  company: z.string().optional(),
  nif: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().default('Portugal'),
  status: z.enum(['Ativo', 'Inativo']).default('Ativo')
});

// Sales Orders (Encomendas)
const createSalesOrderSchema = z.object({
  clientId: z.string(),
  expectedDeliveryDate: z.string().optional(),
  deliveryAddress: z.string().optional(),
  paymentMethod: z.string().optional(),
  paymentTerms: z.string().optional(),
  notes: z.string().optional(),
  lines: z.array(z.object({
    description: z.string(),
    quantity: z.number().positive(),
    unitPrice: z.number().positive(),
    taxRate: z.number().default(23),
    productId: z.string().optional()
  })).min(1)
});

// Opportunities
const createOpportunitySchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  clientId: z.string().optional(),
  clientName: z.string().optional(),
  type: z.string(),
  source: z.string().default('manual'),
  stage: z.string().default('prospecting'),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  estimatedValue: z.number().positive().optional(),
  probability: z.number().min(0).max(100).default(50),
  expectedCloseDate: z.string().optional(),
  assignedTo: z.string().optional(),
  notes: z.string().optional()
});

// ============================================================================
// ROUTE DEFINITIONS (relative to /api/commercial mount point)
// ============================================================================

export const comercialRoutes: RouteDefinition[] = [
  // ==================== CLIENTES (360° View) ====================
  {
    method: 'GET',
    path: '/clientes',
    handler: 'listClients',
    permissions: ['comercial.clientes.view'],
    validation: {
      query: z.object({
        search: z.string().optional(),
        status: z.string().optional(),
        limit: z.number().int().optional(),
        offset: z.number().int().optional()
      }).optional()
    }
  },
  
  {
    method: 'GET',
    path: '/clientes/:id',
    handler: 'getClient360',
    permissions: ['comercial.clientes.view'],
    validation: {
      params: z.object({
        id: z.string()
      })
    }
  },
  
  {
    method: 'POST',
    path: '/clientes',
    handler: 'createClient',
    permissions: ['comercial.clientes.create'],
    validation: {
      body: createClientSchema
    }
  },
  
  {
    method: 'PATCH',
    path: '/clientes/:id',
    handler: 'updateClient',
    permissions: ['comercial.clientes.create'],
    validation: {
      params: z.object({
        id: z.string()
      }),
      body: createClientSchema.partial()
    }
  },
  
  {
    method: 'DELETE',
    path: '/clientes/:id',
    handler: 'deleteClient',
    permissions: ['comercial.clientes.create'],
    validation: {
      params: z.object({
        id: z.string()
      })
    }
  },
  
  // ==================== ENCOMENDAS (Sales Orders) ====================
  {
    method: 'GET',
    path: '/encomendas',
    handler: 'listSalesOrders',
    permissions: ['comercial.encomendas.view'],
    validation: {
      query: z.object({
        clientId: z.string().optional(),
        status: z.string().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        limit: z.number().int().optional(),
        offset: z.number().int().optional()
      }).optional()
    }
  },
  
  {
    method: 'GET',
    path: '/encomendas/:id',
    handler: 'getSalesOrder',
    permissions: ['comercial.encomendas.view'],
    validation: {
      params: z.object({
        id: z.string()
      })
    }
  },
  
  {
    method: 'POST',
    path: '/encomendas',
    handler: 'createSalesOrder',
    permissions: ['comercial.encomendas.create'],
    validation: {
      body: createSalesOrderSchema
    }
  },
  
  {
    method: 'PATCH',
    path: '/encomendas/:id',
    handler: 'updateSalesOrder',
    permissions: ['comercial.encomendas.create'],
    validation: {
      params: z.object({
        id: z.string()
      }),
      body: createSalesOrderSchema.partial()
    }
  },
  
  {
    method: 'DELETE',
    path: '/encomendas/:id',
    handler: 'cancelSalesOrder',
    permissions: ['comercial.encomendas.create'],
    validation: {
      params: z.object({
        id: z.string()
      })
    }
  },
  
  {
    method: 'POST',
    path: '/encomendas/:id/gerar-fatura',
    handler: 'generateInvoiceFromOrder',
    permissions: ['comercial.encomendas.gerar_fatura'],
    validation: {
      params: z.object({
        id: z.string()
      })
    }
  },
  
  // ==================== OPORTUNIDADES ====================
  {
    method: 'GET',
    path: '/oportunidades',
    handler: 'listOpportunities',
    permissions: ['comercial.oportunidades.view'],
    validation: {
      query: z.object({
        type: z.string().optional(),
        priority: z.string().optional(),
        status: z.string().optional(),
        stage: z.string().optional(),
        clientId: z.string().optional(),
        assignedTo: z.string().optional(),
        limit: z.number().int().optional(),
        offset: z.number().int().optional()
      }).optional()
    }
  },
  
  {
    method: 'GET',
    path: '/oportunidades/:id',
    handler: 'getOpportunity',
    permissions: ['comercial.oportunidades.view'],
    validation: {
      params: z.object({
        id: z.string()
      })
    }
  },
  
  {
    method: 'POST',
    path: '/oportunidades',
    handler: 'createOpportunity',
    permissions: ['comercial.oportunidades.create'],
    validation: {
      body: createOpportunitySchema
    }
  },
  
  {
    method: 'PATCH',
    path: '/oportunidades/:id',
    handler: 'updateOpportunity',
    permissions: ['comercial.oportunidades.create'],
    validation: {
      params: z.object({
        id: z.string()
      }),
      body: createOpportunitySchema.partial()
    }
  },
  
  {
    method: 'DELETE',
    path: '/oportunidades/:id',
    handler: 'cancelOpportunity',
    permissions: ['comercial.oportunidades.create'],
    validation: {
      params: z.object({
        id: z.string()
      })
    }
  },
  
  {
    method: 'POST',
    path: '/oportunidades/:id/converter',
    handler: 'convertOpportunity',
    permissions: ['comercial.oportunidades.create'],
    validation: {
      params: z.object({
        id: z.string()
      })
    }
  },
  
  // ==================== ANALYTICS CRM ====================
  {
    method: 'GET',
    path: '/dashboard',
    handler: 'getDashboard',
    permissions: ['comercial.dashboard']
  },
  
  {
    method: 'GET',
    path: '/pipeline',
    handler: 'getPipeline',
    permissions: ['comercial.dashboard']
  },
  
  // ==================== LEGACY ROUTES (backwards compatibility) ====================
  {
    method: 'GET',
    path: '/leads',
    handler: 'listLeads',
    permissions: ['sales.read'],
    validation: {
      query: z.object({
        status: z.string().optional(),
        ownerId: z.string().optional(),
        limit: z.number().int().optional()
      }).optional()
    }
  },
  
  {
    method: 'POST',
    path: '/leads',
    handler: 'createLead',
    permissions: ['sales.write'],
    validation: {
      body: createLeadSchema
    }
  },
  
  {
    method: 'GET',
    path: '/leads/:id',
    handler: 'getLead',
    permissions: ['sales.read'],
    validation: {
      params: z.object({
        id: z.string()
      })
    }
  },
  
  {
    method: 'PATCH',
    path: '/leads/:id',
    handler: 'updateLead',
    permissions: ['sales.write'],
    validation: {
      params: z.object({
        id: z.string()
      }),
      body: createLeadSchema.partial()
    }
  },
  
  {
    method: 'DELETE',
    path: '/leads/:id',
    handler: 'deleteLead',
    permissions: ['sales.delete'],
    validation: {
      params: z.object({
        id: z.string()
      })
    }
  },
  
  {
    method: 'GET',
    path: '/clients',
    handler: 'listClients',
    permissions: ['sales.read'],
    validation: {
      query: z.object({
        search: z.string().optional(),
        status: z.string().optional(),
        limit: z.number().int().optional()
      }).optional()
    }
  },
  
  {
    method: 'GET',
    path: '/orders',
    handler: 'listOrders',
    permissions: ['sales.read'],
    validation: {
      query: z.object({
        clientId: z.string().optional(),
        status: z.string().optional(),
        limit: z.number().int().optional()
      }).optional()
    }
  },
  
  {
    method: 'GET',
    path: '/quotes',
    handler: 'listQuotes',
    permissions: ['comercial.quotes'],
    validation: {
      query: z.object({
        leadId: z.string().optional(),
        status: z.string().optional(),
        limit: z.number().int().optional()
      }).optional()
    }
  },
  
  {
    method: 'POST',
    path: '/quotes',
    handler: 'createQuote',
    permissions: ['comercial.quotes'],
    validation: {
      body: createQuoteSchema
    }
  },
  
  {
    method: 'GET',
    path: '/quotes/:id',
    handler: 'getQuote',
    permissions: ['comercial.quotes'],
    validation: {
      params: z.object({
        id: z.string()
      })
    }
  },
  
  {
    method: 'POST',
    path: '/quotes/:id/send',
    handler: 'sendQuote',
    permissions: ['comercial.quotes'],
    validation: {
      params: z.object({
        id: z.string()
      })
    }
  },
  
  {
    method: 'POST',
    path: '/quotes/:id/convert',
    handler: 'convertQuote',
    permissions: ['comercial.quotes'],
    validation: {
      params: z.object({
        id: z.string()
      }),
      body: z.object({
        convertTo: z.enum(['order', 'invoice'])
      })
    }
  }
];
