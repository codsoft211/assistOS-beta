/**
 * Projetos Module API Routes
 * 
 * RESTful API routes for Projects, Phases, Resources, Documents,
 * Templates, and Configuration management.
 * 
 * Pattern follows RouteDefinition interface from base module.
 */

import type { RouteDefinition } from '../../base/module.interface';
import { z } from 'zod';

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

// Project Schemas
const createProjectSchema = z.object({
  projectCode: z.string().min(1, 'Project code is required'),
  name: z.string().min(1, 'Project name is required'),
  description: z.string().optional(),
  clientId: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  eventDate: z.string().datetime().optional(),
  estimatedBudget: z.number().positive().optional(),
  plannedBudget: z.number().positive().optional(),
  status: z.enum(['planning', 'active', 'completed', 'on-hold', 'cancelled']).default('planning'),
  priority: z.enum(['Low', 'Medium', 'High', 'Critical']).default('Medium'),
  projectType: z.string().optional(),
  tags: z.string().optional(),
  notes: z.string().optional(),
  projectManagerId: z.string().optional(),
  metadata: z.record(z.any()).optional()
});

const updateProjectSchema = createProjectSchema.partial();

const updateProjectStatusSchema = z.object({
  status: z.enum(['planning', 'active', 'completed', 'on-hold', 'cancelled']),
  notes: z.string().optional()
});

const projectFiltersSchema = z.object({
  status: z.string().optional(),
  priority: z.string().optional(),
  clientId: z.string().optional(),
  projectType: z.string().optional(),
  startDateFrom: z.string().datetime().optional(),
  startDateTo: z.string().datetime().optional(),
  endDateFrom: z.string().datetime().optional(),
  endDateTo: z.string().datetime().optional(),
  limit: z.number().int().positive().optional(),
  offset: z.number().int().nonnegative().optional()
});

// Phase Schemas
const createPhaseSchema = z.object({
  name: z.string().min(1, 'Phase name is required'),
  phaseName: z.string().optional(),
  description: z.string().optional(),
  phaseOrder: z.number().int().nonnegative().default(0),
  status: z.enum(['pending', 'active', 'completed', 'cancelled']).default('pending'),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  plannedBudget: z.number().positive().optional(),
  budget: z.number().positive().optional(),
  percentComplete: z.number().min(0).max(100).optional(),
  metadata: z.record(z.any()).optional()
});

const updatePhaseSchema = createPhaseSchema.partial();

// Resource Schemas
const createResourceSchema = z.object({
  resourceType: z.enum(['Human', 'Equipment', 'Material', 'External']),
  resourceName: z.string().min(1, 'Resource name is required'),
  quantity: z.number().positive(),
  unit: z.string().optional(),
  costPerUnit: z.number().nonnegative().optional(),
  totalCost: z.number().nonnegative().optional(),
  allocationDate: z.string().optional(),
  releaseDate: z.string().optional(),
  status: z.enum(['Allocated', 'In Use', 'Released', 'Reserved']).default('Allocated')
});

const updateResourceSchema = createResourceSchema.partial();

// Document Schemas
const createDocumentSchema = z.object({
  title: z.string().min(1, 'Document title is required'),
  documentName: z.string().optional(),
  documentType: z.string().optional(),
  documentDate: z.string().optional(),
  description: z.string().optional(),
  category: z.string().min(1, 'Category is required'),
  fileUrl: z.string().url('Valid file URL is required'),
  fileName: z.string().min(1, 'File name is required'),
  fileSize: z.number().int().positive(),
  mimeType: z.string().min(1, 'MIME type is required'),
  version: z.string().default('1.0'),
  versionNumber: z.number().int().positive().default(1),
  phaseId: z.string().optional(),
  taskId: z.string().optional(),
  deliverableId: z.string().optional(),
  metadata: z.record(z.any()).optional()
});

const updateDocumentSchema = z.object({
  title: z.string().optional(),
  documentName: z.string().optional(),
  documentType: z.string().optional(),
  documentDate: z.string().optional(),
  description: z.string().optional(),
  category: z.string().optional(),
  version: z.string().optional(),
  metadata: z.record(z.any()).optional()
});

// Template Schemas
const applyTemplateSchema = z.object({
  tenantId: z.string().optional(), // Optional if using context
  customSettings: z.record(z.any()).optional()
});

// Configuration Schemas
const validateConfigurationSchema = z.object({
  templateId: z.string().optional(),
  customEntities: z.array(z.any()).optional(),
  customWorkflows: z.array(z.any()).optional(),
  customTools: z.array(z.any()).optional(),
  enabledFeatures: z.array(z.string()).optional(),
  settings: z.record(z.any()).optional()
});

// ============================================================================
// ROUTE DEFINITIONS
// ============================================================================

export const projetosRoutes: RouteDefinition[] = [
  // ============================================================================
  // PROJECTS ROUTES
  // ============================================================================
  
  {
    method: 'GET',
    path: '/api/projetos/projects',
    handler: 'listProjects',
    permissions: ['projects.read'],
    validation: {
      query: projectFiltersSchema
    }
  },
  
  {
    method: 'GET',
    path: '/api/projetos/projects/:id',
    handler: 'getProject',
    permissions: ['projects.read'],
    validation: {
      params: z.object({
        id: z.string()
      })
    }
  },
  
  {
    method: 'POST',
    path: '/api/projetos/projects',
    handler: 'createProject',
    permissions: ['projects.write'],
    validation: {
      body: createProjectSchema
    }
  },
  
  {
    method: 'PUT',
    path: '/api/projetos/projects/:id',
    handler: 'updateProject',
    permissions: ['projects.write'],
    validation: {
      params: z.object({
        id: z.string()
      }),
      body: updateProjectSchema
    }
  },
  
  {
    method: 'DELETE',
    path: '/api/projetos/projects/:id',
    handler: 'deleteProject',
    permissions: ['projects.delete'],
    validation: {
      params: z.object({
        id: z.string()
      })
    }
  },
  
  {
    method: 'PATCH',
    path: '/api/projetos/projects/:id/status',
    handler: 'updateProjectStatus',
    permissions: ['projects.write'],
    validation: {
      params: z.object({
        id: z.string()
      }),
      body: updateProjectStatusSchema
    }
  },
  
  // ============================================================================
  // PHASES ROUTES
  // ============================================================================
  
  {
    method: 'GET',
    path: '/api/projetos/projects/:projectId/phases',
    handler: 'listProjectPhases',
    permissions: ['projects.read'],
    validation: {
      params: z.object({
        projectId: z.string()
      })
    }
  },
  
  {
    method: 'POST',
    path: '/api/projetos/projects/:projectId/phases',
    handler: 'createPhase',
    permissions: ['projects.write'],
    validation: {
      params: z.object({
        projectId: z.string()
      }),
      body: createPhaseSchema
    }
  },
  
  {
    method: 'PUT',
    path: '/api/projetos/phases/:id',
    handler: 'updatePhase',
    permissions: ['projects.write'],
    validation: {
      params: z.object({
        id: z.string()
      }),
      body: updatePhaseSchema
    }
  },
  
  {
    method: 'DELETE',
    path: '/api/projetos/phases/:id',
    handler: 'deletePhase',
    permissions: ['projects.delete'],
    validation: {
      params: z.object({
        id: z.string()
      })
    }
  },
  
  // ============================================================================
  // RESOURCES ROUTES
  // ============================================================================
  
  {
    method: 'GET',
    path: '/api/projetos/projects/:projectId/resources',
    handler: 'listProjectResources',
    permissions: ['projects.read'],
    validation: {
      params: z.object({
        projectId: z.string()
      }),
      query: z.object({
        resourceType: z.string().optional(),
        status: z.string().optional()
      }).optional()
    }
  },
  
  {
    method: 'POST',
    path: '/api/projetos/projects/:projectId/resources',
    handler: 'allocateResource',
    permissions: ['projects.write'],
    validation: {
      params: z.object({
        projectId: z.string()
      }),
      body: createResourceSchema
    }
  },
  
  {
    method: 'PUT',
    path: '/api/projetos/resources/:id',
    handler: 'updateResource',
    permissions: ['projects.write'],
    validation: {
      params: z.object({
        id: z.string()
      }),
      body: updateResourceSchema
    }
  },
  
  {
    method: 'DELETE',
    path: '/api/projetos/resources/:id',
    handler: 'removeResource',
    permissions: ['projects.delete'],
    validation: {
      params: z.object({
        id: z.string()
      })
    }
  },
  
  // ============================================================================
  // DOCUMENTS ROUTES
  // ============================================================================
  
  {
    method: 'GET',
    path: '/api/projetos/projects/:projectId/documents',
    handler: 'listProjectDocuments',
    permissions: ['projects.read'],
    validation: {
      params: z.object({
        projectId: z.string()
      }),
      query: z.object({
        category: z.string().optional(),
        phaseId: z.string().optional(),
        documentType: z.string().optional()
      }).optional()
    }
  },
  
  {
    method: 'POST',
    path: '/api/projetos/projects/:projectId/documents',
    handler: 'uploadDocument',
    permissions: ['projects.write'],
    validation: {
      params: z.object({
        projectId: z.string()
      }),
      body: createDocumentSchema
    }
  },
  
  {
    method: 'PUT',
    path: '/api/projetos/documents/:id',
    handler: 'updateDocumentMetadata',
    permissions: ['projects.write'],
    validation: {
      params: z.object({
        id: z.string()
      }),
      body: updateDocumentSchema
    }
  },
  
  {
    method: 'DELETE',
    path: '/api/projetos/documents/:id',
    handler: 'deleteDocument',
    permissions: ['projects.delete'],
    validation: {
      params: z.object({
        id: z.string()
      })
    }
  },
  
  // ============================================================================
  // TEMPLATE MANAGEMENT ROUTES
  // ============================================================================
  
  {
    method: 'GET',
    path: '/api/projetos/templates',
    handler: 'listTemplates',
    permissions: ['projects.read'],
    validation: {
      query: z.object({
        category: z.string().optional(),
        industry: z.string().optional()
      }).optional()
    }
  },
  
  {
    method: 'GET',
    path: '/api/projetos/templates/:templateId',
    handler: 'getTemplate',
    permissions: ['projects.read'],
    validation: {
      params: z.object({
        templateId: z.string()
      })
    }
  },
  
  {
    method: 'POST',
    path: '/api/projetos/templates/:templateId/apply',
    handler: 'applyTemplate',
    permissions: ['projetos.admin'],
    validation: {
      params: z.object({
        templateId: z.string()
      }),
      body: applyTemplateSchema
    }
  },
  
  // ============================================================================
  // CONFIGURATION MANAGEMENT ROUTES
  // ============================================================================
  
  {
    method: 'GET',
    path: '/api/projetos/configuration',
    handler: 'getConfiguration',
    permissions: ['projects.read']
  },
  
  {
    method: 'POST',
    path: '/api/projetos/configuration/validate',
    handler: 'validateConfiguration',
    permissions: ['projetos.admin'],
    validation: {
      body: validateConfigurationSchema
    }
  },
  
  {
    method: 'GET',
    path: '/api/projetos/entities',
    handler: 'listEntities',
    permissions: ['projects.read'],
    validation: {
      query: z.object({
        type: z.enum(['core', 'custom', 'all']).default('all')
      }).optional()
    }
  }
];
