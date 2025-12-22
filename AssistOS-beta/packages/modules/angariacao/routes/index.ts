/**
 * Angariação Module Routes
 * 
 * API routes para gestão de leads, fontes, scoring e funil de conversão.
 */

import type { RouteDefinition } from '../../base/module.interface';
import { z } from 'zod';

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const createLeadSchema = z.object({
  // Contacto
  email: z.string().email(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  phone: z.string().optional(),
  company: z.string().optional(),
  nif: z.string().optional(),
  // Evento
  eventDate: z.string().optional(),
  eventType: z.string().optional(),
  location: z.string().optional(),
  numPax: z.coerce.number().int().positive().optional(),
  // Comercial
  valuePerPax: z.coerce.number().positive().optional(),
  budgetTotal: z.coerce.number().positive().optional(),
  leadSource: z.string().optional(),
  ownerId: z.string().optional(),
  // Outros
  campaign: z.string().optional(),
  customFields: z.record(z.any()).optional(),
  notes: z.string().optional()
});

const updateLeadSchema = createLeadSchema.partial();

const createLeadSourceSchema = z.object({
  sourceType: z.enum(['instantly', 'facebook_ads', 'linkedin', 'web_form', 'manual', 'referral', 'other']),
  sourceName: z.string(),
  isActive: z.boolean().optional(),
  autoAssignToUserId: z.string().optional(),
  autoApplyTags: z.array(z.string()).optional(),
  defaultScore: z.number().optional(),
  apiConfig: z.record(z.any()).optional()
});

const createScoringRuleSchema = z.object({
  ruleName: z.string(),
  ruleType: z.enum(['demographic', 'behavior', 'engagement', 'firmographic']),
  condition: z.object({
    field: z.string(),
    operator: z.enum(['equals', 'contains', 'exists', 'greater_than', 'less_than']),
    value: z.any()
  }),
  scoreValue: z.number(),
  isActive: z.boolean().optional(),
  priority: z.number().optional(),
  description: z.string().optional()
});

// ============================================================================
// ROUTES
// ============================================================================

export const angariacaoRoutes: RouteDefinition[] = [
  // ========== LEADS ==========
  {
    method: 'GET',
    path: '/api/lead-generation/leads',
    handler: 'listLeads',
    permissions: ['lead-generation.read'],
    validation: {
      query: z.object({
        status: z.string().optional(),
        leadSource: z.string().optional(),
        minScore: z.coerce.number().optional(),
        assignedToUserId: z.string().optional(),
        search: z.string().optional(),
        limit: z.coerce.number().optional(),
        offset: z.coerce.number().optional()
      }).optional()
    }
  },
  
  {
    method: 'POST',
    path: '/api/lead-generation/leads',
    handler: 'createLead',
    permissions: ['lead-generation.write'],
    validation: {
      body: createLeadSchema
    }
  },
  
  {
    method: 'GET',
    path: '/api/lead-generation/leads/:id',
    handler: 'getLead',
    permissions: ['lead-generation.read'],
    validation: {
      params: z.object({
        id: z.string()
      })
    }
  },
  
  {
    method: 'PATCH',
    path: '/api/lead-generation/leads/:id',
    handler: 'updateLead',
    permissions: ['lead-generation.write'],
    validation: {
      params: z.object({
        id: z.string()
      }),
      body: updateLeadSchema
    }
  },
  
  {
    method: 'DELETE',
    path: '/api/lead-generation/leads/:id',
    handler: 'deleteLead',
    permissions: ['lead-generation.delete'],
    validation: {
      params: z.object({
        id: z.string()
      })
    }
  },
  
  {
    method: 'POST',
    path: '/api/lead-generation/leads/:id/qualify',
    handler: 'qualifyLead',
    permissions: ['lead-generation.qualify'],
    validation: {
      params: z.object({
        id: z.string()
      })
    }
  },
  
  {
    method: 'POST',
    path: '/api/lead-generation/leads/:id/assign',
    handler: 'assignLead',
    permissions: ['lead-generation.qualify'],
    validation: {
      params: z.object({
        id: z.string()
      }),
      body: z.object({
        userId: z.string()
      })
    }
  },
  
  {
    method: 'POST',
    path: '/api/lead-generation/leads/:id/convert',
    handler: 'convertLead',
    permissions: ['lead-generation.convert'],
    validation: {
      params: z.object({
        id: z.string()
      })
    }
  },
  
  {
    method: 'GET',
    path: '/api/lead-generation/leads/:id/activities',
    handler: 'getLeadActivities',
    permissions: ['lead-generation.read'],
    validation: {
      params: z.object({
        id: z.string()
      }),
      query: z.object({
        limit: z.coerce.number().optional()
      }).optional()
    }
  },
  
  // ========== LEAD SOURCES ==========
  {
    method: 'GET',
    path: '/api/lead-generation/sources',
    handler: 'listLeadSources',
    permissions: ['lead-generation.read'],
    validation: {
      query: z.object({
        sourceType: z.string().optional(),
        isActive: z.coerce.boolean().optional()
      }).optional()
    }
  },
  
  {
    method: 'POST',
    path: '/api/lead-generation/sources',
    handler: 'createLeadSource',
    permissions: ['lead-generation.manage_sources'],
    validation: {
      body: createLeadSourceSchema
    }
  },
  
  {
    method: 'GET',
    path: '/api/lead-generation/sources/:id',
    handler: 'getLeadSource',
    permissions: ['lead-generation.read'],
    validation: {
      params: z.object({
        id: z.string()
      })
    }
  },
  
  {
    method: 'PATCH',
    path: '/api/lead-generation/sources/:id',
    handler: 'updateLeadSource',
    permissions: ['lead-generation.manage_sources'],
    validation: {
      params: z.object({
        id: z.string()
      }),
      body: createLeadSourceSchema.partial()
    }
  },
  
  {
    method: 'DELETE',
    path: '/api/lead-generation/sources/:id',
    handler: 'deleteLeadSource',
    permissions: ['lead-generation.manage_sources'],
    validation: {
      params: z.object({
        id: z.string()
      })
    }
  },
  
  // ========== SCORING RULES ==========
  {
    method: 'GET',
    path: '/api/lead-generation/scoring-rules',
    handler: 'listScoringRules',
    permissions: ['lead-generation.read'],
    validation: {
      query: z.object({
        ruleType: z.string().optional(),
        isActive: z.coerce.boolean().optional()
      }).optional()
    }
  },
  
  {
    method: 'POST',
    path: '/api/lead-generation/scoring-rules',
    handler: 'createScoringRule',
    permissions: ['lead-generation.manage_scoring'],
    validation: {
      body: createScoringRuleSchema
    }
  },
  
  {
    method: 'GET',
    path: '/api/lead-generation/scoring-rules/:id',
    handler: 'getScoringRule',
    permissions: ['lead-generation.read'],
    validation: {
      params: z.object({
        id: z.string()
      })
    }
  },
  
  {
    method: 'PATCH',
    path: '/api/lead-generation/scoring-rules/:id',
    handler: 'updateScoringRule',
    permissions: ['lead-generation.manage_scoring'],
    validation: {
      params: z.object({
        id: z.string()
      }),
      body: createScoringRuleSchema.partial()
    }
  },
  
  {
    method: 'DELETE',
    path: '/api/lead-generation/scoring-rules/:id',
    handler: 'deleteScoringRule',
    permissions: ['lead-generation.manage_scoring'],
    validation: {
      params: z.object({
        id: z.string()
      })
    }
  },
  
  // ========== ANALYTICS & FUNNEL ==========
  {
    method: 'GET',
    path: '/api/lead-generation/funil',
    handler: 'getFunnelMetrics',
    permissions: ['lead-generation.read'],
    validation: {
      query: z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        leadSource: z.string().optional()
      }).optional()
    }
  },
  
  {
    method: 'GET',
    path: '/api/lead-generation/analytics',
    handler: 'getAnalytics',
    permissions: ['lead-generation.read'],
    validation: {
      query: z.object({
        metric: z.enum(['conversion_rate', 'average_score', 'leads_by_status', 'leads_by_source', 'timeline']).optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        groupBy: z.enum(['day', 'week', 'month']).optional()
      }).optional()
    }
  },
  
  {
    method: 'GET',
    path: '/api/lead-generation/dashboard',
    handler: 'getDashboard',
    permissions: ['lead-generation.read'],
    validation: {
      query: z.object({
        period: z.enum(['today', 'week', 'month', 'quarter', 'year']).optional()
      }).optional()
    }
  },
  
  // ========== AD CAMPAIGNS ==========
  {
    method: 'GET',
    path: '/api/lead-generation/campaigns',
    handler: 'listCampaigns',
    permissions: ['lead-generation.read'],
    validation: {
      query: z.object({
        status: z.string().optional(),
        campaignType: z.string().optional(),
        limit: z.coerce.number().optional(),
        offset: z.coerce.number().optional()
      }).optional()
    }
  },
  
  {
    method: 'POST',
    path: '/api/lead-generation/campaigns',
    handler: 'createCampaign',
    permissions: ['lead-generation.write'],
    validation: {
      body: z.object({
        googleCampaignId: z.string().optional(),
        googleAccountId: z.string().optional(),
        campaignName: z.string(),
        campaignType: z.string().optional(),
        campaignStatus: z.string().optional(),
        budgetAmount: z.number().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional()
      })
    }
  },
  
  {
    method: 'GET',
    path: '/api/lead-generation/campaigns/:id',
    handler: 'getCampaign',
    permissions: ['lead-generation.read'],
    validation: {
      params: z.object({
        id: z.string()
      })
    }
  },
  
  {
    method: 'PATCH',
    path: '/api/lead-generation/campaigns/:id',
    handler: 'updateCampaign',
    permissions: ['lead-generation.write'],
    validation: {
      params: z.object({
        id: z.string()
      }),
      body: z.object({
        campaignName: z.string().optional(),
        campaignStatus: z.string().optional(),
        budgetAmount: z.number().optional(),
        endDate: z.string().optional()
      })
    }
  },
  
  {
    method: 'DELETE',
    path: '/api/lead-generation/campaigns/:id',
    handler: 'deleteCampaign',
    permissions: ['lead-generation.delete'],
    validation: {
      params: z.object({
        id: z.string()
      })
    }
  },
  
  {
    method: 'GET',
    path: '/api/lead-generation/campaigns/:id/performance',
    handler: 'getCampaignPerformance',
    permissions: ['lead-generation.read'],
    validation: {
      params: z.object({
        id: z.string()
      }),
      query: z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        groupBy: z.enum(['hour', 'day', 'week', 'month']).optional()
      }).optional()
    }
  },
  
  {
    method: 'GET',
    path: '/api/lead-generation/campaigns/:id/leads',
    handler: 'getCampaignLeads',
    permissions: ['lead-generation.read'],
    validation: {
      params: z.object({
        id: z.string()
      }),
      query: z.object({
        status: z.string().optional(),
        limit: z.coerce.number().optional(),
        offset: z.coerce.number().optional()
      }).optional()
    }
  },
  
  {
    method: 'POST',
    path: '/api/lead-generation/campaigns/sync',
    handler: 'syncCampaigns',
    permissions: ['lead-generation.write'],
    validation: {
      body: z.object({
        googleAccountId: z.string().optional()
      }).optional()
    }
  }
];
