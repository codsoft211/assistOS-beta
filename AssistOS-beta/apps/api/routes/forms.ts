/**
 * Dynamic Forms Routes - Authenticated
 * 
 * Form management endpoints for creating, publishing, and managing dynamic forms.
 * All routes require authentication and tenant context.
 * 
 * Endpoints:
 * - POST /api/forms - Create new form
 * - GET /api/forms - List tenant's forms (with filters)
 * - GET /api/forms/:id - Get form with fields
 * - PATCH /api/forms/:id - Update draft form
 * - DELETE /api/forms/:id - Delete draft form
 * - POST /api/forms/:id/fields - Add field to form
 * - PATCH /api/forms/:id/fields/:fieldId - Update field
 * - DELETE /api/forms/:id/fields/:fieldId - Delete field
 * - POST /api/forms/:id/fields/reorder - Reorder fields
 * - POST /api/forms/:id/publish - Publish form (generates public token)
 * - POST /api/forms/:id/archive - Archive form
 * - GET /api/forms/:id/submissions - List form submissions
 * - GET /api/forms/:id/stats - Get form statistics
 * - POST /api/forms/:id/send - Send form invitation
 */

import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.middleware';
import { uxRateLimiter } from '../middleware/rate-limit';
import { tenantMiddleware } from '../middleware/tenant-middleware';
import {
  DynamicFormsService,
  FieldMappingService,
  FormInvitationService,
  FormNotFoundError,
  FormAlreadyPublishedError,
  FieldNotFoundError,
  InvalidFormStatusError,
  FormNotPublishedError,
  InvalidChannelError,
  MissingRecipientInfoError,
} from '../../../packages/platform/dynamic-forms';

const router = Router();
const formsService = new DynamicFormsService();
const mappingService = new FieldMappingService();
const invitationService = new FormInvitationService();

// Apply authentication and tenant middleware to all routes
router.use(requireAuth);
router.use(tenantMiddleware);
router.use(uxRateLimiter);

// ═══════════════════════════════════════════════════════════════════════════════
// Validation Schemas
// ═══════════════════════════════════════════════════════════════════════════════

const createFormSchema = z.object({
  name: z.string().min(1, 'Form name is required'),
  description: z.string().optional(),
  targetModule: z.string().optional(),
  targetEntity: z.string().optional(),
  processingConfig: z.record(z.any()).optional(),
  settings: z.record(z.any()).optional(),
});

const updateFormSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  targetModule: z.string().optional(),
  targetEntity: z.string().optional(),
  processingConfig: z.record(z.any()).optional(),
  settings: z.record(z.any()).optional(),
});

const createFieldSchema = z.object({
  label: z.string().min(1, 'Field label is required'),
  fieldType: z.string().min(1, 'Field type is required'),
  placeholder: z.string().optional(),
  helpText: z.string().optional(),
  defaultValue: z.string().optional(),
  required: z.boolean().optional(),
  validation: z.record(z.any()).optional(),
  options: z.array(z.any()).optional(),
  conditionalLogic: z.record(z.any()).optional(),
  order: z.number().int().min(0),
  width: z.string().optional(),
});

const updateFieldSchema = z.object({
  label: z.string().min(1).optional(),
  placeholder: z.string().optional(),
  helpText: z.string().optional(),
  defaultValue: z.string().optional(),
  required: z.boolean().optional(),
  validation: z.record(z.any()).optional(),
  options: z.array(z.any()).optional(),
  conditionalLogic: z.record(z.any()).optional(),
  order: z.number().int().min(0).optional(),
  width: z.string().optional(),
});

const reorderFieldsSchema = z.object({
  fieldOrders: z.array(z.object({
    fieldId: z.string(),
    order: z.number().int().min(0),
  })),
});

const sendInvitationSchema = z.object({
  recipientEmail: z.string().email().optional(),
  recipientPhone: z.string().optional(),
  recipientName: z.string().optional(),
  channel: z.enum(['email', 'whatsapp']),
  context: z.record(z.any()).optional(),
});

// ═══════════════════════════════════════════════════════════════════════════════
// Routes
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/forms
 * Create a new draft form
 */
router.post('/', async (req, res) => {
  try {
    const data = createFormSchema.parse(req.body);
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user.id;
    const environment = (req as any).environment || 'production';

    const form = await formsService.createForm(tenantId, userId, {
      ...data,
      environment,
    });

    res.status(201).json({
      success: true,
      data: form,
    });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({
        error: 'Validation error',
        details: error.errors,
      });
    }

    console.error('[Forms] Create form failed:', error);
    res.status(500).json({
      error: 'Failed to create form',
      message: error.message,
    });
  }
});

/**
 * GET /api/forms
 * List tenant's forms with optional filters
 */
router.get('/', async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const environment = (req as any).environment || 'production';
    
    const filters = {
      status: req.query.status as 'draft' | 'published' | 'archived' | undefined,
      targetModule: req.query.module as string | undefined,
      targetEntity: req.query.entity as string | undefined,
      search: req.query.search as string | undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
      offset: req.query.offset ? parseInt(req.query.offset as string) : 0,
    };

    const forms = await formsService.listForms(tenantId, environment, filters);

    res.json({
      success: true,
      data: forms,
      meta: {
        limit: filters.limit,
        offset: filters.offset,
      },
    });
  } catch (error: any) {
    console.error('[Forms] List forms failed:', error);
    res.status(500).json({
      error: 'Failed to list forms',
      message: error.message,
    });
  }
});

/**
 * GET /api/forms/:id
 * Get form with all fields
 */
router.get('/:id', async (req, res) => {
  try {
    const formId = req.params.id;
    const tenantId = (req as any).tenantId;

    const form = await formsService.getFormWithFields(formId);

    // Verify tenant access
    if (form.tenantId !== tenantId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You do not have access to this form',
      });
    }

    res.json({
      success: true,
      data: form,
    });
  } catch (error: any) {
    if (error instanceof FormNotFoundError) {
      return res.status(404).json({
        error: 'Form not found',
        message: error.message,
      });
    }

    console.error('[Forms] Get form failed:', error);
    res.status(500).json({
      error: 'Failed to get form',
      message: error.message,
    });
  }
});

/**
 * PATCH /api/forms/:id
 * Update a draft form
 */
router.patch('/:id', async (req, res) => {
  try {
    const formId = req.params.id;
    const tenantId = (req as any).tenantId;
    const data = updateFormSchema.parse(req.body);

    // Verify tenant access
    const form = await formsService.getForm(formId);
    if (form.tenantId !== tenantId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You do not have access to this form',
      });
    }

    const updated = await formsService.updateForm(formId, data);

    res.json({
      success: true,
      data: updated,
    });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({
        error: 'Validation error',
        details: error.errors,
      });
    }

    if (error instanceof FormNotFoundError) {
      return res.status(404).json({
        error: 'Form not found',
        message: error.message,
      });
    }

    if (error instanceof FormAlreadyPublishedError) {
      return res.status(400).json({
        error: 'Cannot modify published form',
        message: error.message,
      });
    }

    console.error('[Forms] Update form failed:', error);
    res.status(500).json({
      error: 'Failed to update form',
      message: error.message,
    });
  }
});

/**
 * DELETE /api/forms/:id
 * Delete a draft form
 */
router.delete('/:id', async (req, res) => {
  try {
    const formId = req.params.id;
    const tenantId = (req as any).tenantId;

    // Verify tenant access
    const form = await formsService.getForm(formId);
    if (form.tenantId !== tenantId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You do not have access to this form',
      });
    }

    await formsService.deleteForm(formId);

    res.json({
      success: true,
      message: 'Form deleted successfully',
    });
  } catch (error: any) {
    if (error instanceof FormNotFoundError) {
      return res.status(404).json({
        error: 'Form not found',
        message: error.message,
      });
    }

    if (error instanceof FormAlreadyPublishedError) {
      return res.status(400).json({
        error: 'Cannot delete published form',
        message: error.message,
      });
    }

    console.error('[Forms] Delete form failed:', error);
    res.status(500).json({
      error: 'Failed to delete form',
      message: error.message,
    });
  }
});

/**
 * POST /api/forms/:id/fields
 * Add a field to a form
 */
router.post('/:id/fields', async (req, res) => {
  try {
    const formId = req.params.id;
    const tenantId = (req as any).tenantId;
    const data = createFieldSchema.parse(req.body);

    // Verify tenant access
    const form = await formsService.getForm(formId);
    if (form.tenantId !== tenantId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You do not have access to this form',
      });
    }

    const field = await formsService.addField(formId, data);

    // Get AI mapping suggestion if form has target entity
    let suggestion;
    if (form.targetEntity) {
      try {
        suggestion = await mappingService.suggestMapping(
          { targetEntity: form.targetEntity, targetModule: form.targetModule },
          { label: data.label, fieldType: data.fieldType }
        );
      } catch (err) {
        console.warn('[Forms] Failed to get AI mapping suggestion:', err);
      }
    }

    res.status(201).json({
      success: true,
      data: field,
      aiSuggestion: suggestion,
    });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({
        error: 'Validation error',
        details: error.errors,
      });
    }

    if (error instanceof FormNotFoundError) {
      return res.status(404).json({
        error: 'Form not found',
        message: error.message,
      });
    }

    if (error instanceof FormAlreadyPublishedError) {
      return res.status(400).json({
        error: 'Cannot modify published form',
        message: error.message,
      });
    }

    console.error('[Forms] Add field failed:', error);
    res.status(500).json({
      error: 'Failed to add field',
      message: error.message,
    });
  }
});

/**
 * PATCH /api/forms/:id/fields/:fieldId
 * Update a form field
 */
router.patch('/:id/fields/:fieldId', async (req, res) => {
  try {
    const { id: formId, fieldId } = req.params;
    const tenantId = (req as any).tenantId;
    const data = updateFieldSchema.parse(req.body);

    // Verify tenant access
    const form = await formsService.getForm(formId);
    if (form.tenantId !== tenantId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You do not have access to this form',
      });
    }

    const field = await formsService.updateField(fieldId, data);

    res.json({
      success: true,
      data: field,
    });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({
        error: 'Validation error',
        details: error.errors,
      });
    }

    if (error instanceof FieldNotFoundError) {
      return res.status(404).json({
        error: 'Field not found',
        message: error.message,
      });
    }

    if (error instanceof FormAlreadyPublishedError) {
      return res.status(400).json({
        error: 'Cannot modify published form',
        message: error.message,
      });
    }

    console.error('[Forms] Update field failed:', error);
    res.status(500).json({
      error: 'Failed to update field',
      message: error.message,
    });
  }
});

/**
 * DELETE /api/forms/:id/fields/:fieldId
 * Delete a form field
 */
router.delete('/:id/fields/:fieldId', async (req, res) => {
  try {
    const { id: formId, fieldId } = req.params;
    const tenantId = (req as any).tenantId;

    // Verify tenant access
    const form = await formsService.getForm(formId);
    if (form.tenantId !== tenantId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You do not have access to this form',
      });
    }

    await formsService.deleteField(fieldId);

    res.json({
      success: true,
      message: 'Field deleted successfully',
    });
  } catch (error: any) {
    if (error instanceof FieldNotFoundError) {
      return res.status(404).json({
        error: 'Field not found',
        message: error.message,
      });
    }

    if (error instanceof FormAlreadyPublishedError) {
      return res.status(400).json({
        error: 'Cannot modify published form',
        message: error.message,
      });
    }

    console.error('[Forms] Delete field failed:', error);
    res.status(500).json({
      error: 'Failed to delete field',
      message: error.message,
    });
  }
});

/**
 * POST /api/forms/:id/fields/reorder
 * Reorder form fields
 */
router.post('/:id/fields/reorder', async (req, res) => {
  try {
    const formId = req.params.id;
    const tenantId = (req as any).tenantId;
    const { fieldOrders } = reorderFieldsSchema.parse(req.body);

    // Verify tenant access
    const form = await formsService.getForm(formId);
    if (form.tenantId !== tenantId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You do not have access to this form',
      });
    }

    await formsService.reorderFields(formId, fieldOrders);

    res.json({
      success: true,
      message: 'Fields reordered successfully',
    });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({
        error: 'Validation error',
        details: error.errors,
      });
    }

    if (error instanceof FormNotFoundError) {
      return res.status(404).json({
        error: 'Form not found',
        message: error.message,
      });
    }

    if (error instanceof FormAlreadyPublishedError) {
      return res.status(400).json({
        error: 'Cannot modify published form',
        message: error.message,
      });
    }

    console.error('[Forms] Reorder fields failed:', error);
    res.status(500).json({
      error: 'Failed to reorder fields',
      message: error.message,
    });
  }
});

/**
 * POST /api/forms/:id/publish
 * Publish a form (makes it immutable, generates public token)
 */
router.post('/:id/publish', async (req, res) => {
  try {
    const formId = req.params.id;
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user.id;

    // Verify tenant access
    const form = await formsService.getForm(formId);
    if (form.tenantId !== tenantId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You do not have access to this form',
      });
    }

    const published = await formsService.publishForm(formId, userId);

    res.json({
      success: true,
      data: published,
      publicUrl: `/api/public/forms/${published.publicToken}`,
    });
  } catch (error: any) {
    if (error instanceof FormNotFoundError) {
      return res.status(404).json({
        error: 'Form not found',
        message: error.message,
      });
    }

    if (error instanceof InvalidFormStatusError) {
      return res.status(400).json({
        error: 'Cannot publish form',
        message: error.message,
      });
    }

    console.error('[Forms] Publish form failed:', error);
    res.status(500).json({
      error: 'Failed to publish form',
      message: error.message,
    });
  }
});

/**
 * POST /api/forms/:id/archive
 * Archive a form (soft delete)
 */
router.post('/:id/archive', async (req, res) => {
  try {
    const formId = req.params.id;
    const tenantId = (req as any).tenantId;

    // Verify tenant access
    const form = await formsService.getForm(formId);
    if (form.tenantId !== tenantId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You do not have access to this form',
      });
    }

    const archived = await formsService.archiveForm(formId);

    res.json({
      success: true,
      data: archived,
      message: 'Form archived successfully',
    });
  } catch (error: any) {
    if (error instanceof FormNotFoundError) {
      return res.status(404).json({
        error: 'Form not found',
        message: error.message,
      });
    }

    console.error('[Forms] Archive form failed:', error);
    res.status(500).json({
      error: 'Failed to archive form',
      message: error.message,
    });
  }
});

/**
 * GET /api/forms/:id/submissions
 * List form submissions
 */
router.get('/:id/submissions', async (req, res) => {
  try {
    const formId = req.params.id;
    const tenantId = (req as any).tenantId;
    
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
    const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;

    // Verify tenant access
    const form = await formsService.getForm(formId);
    if (form.tenantId !== tenantId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You do not have access to this form',
      });
    }

    const submissions = await formsService.getSubmissions(formId, { limit, offset });

    res.json({
      success: true,
      data: submissions,
      meta: {
        limit,
        offset,
      },
    });
  } catch (error: any) {
    if (error instanceof FormNotFoundError) {
      return res.status(404).json({
        error: 'Form not found',
        message: error.message,
      });
    }

    console.error('[Forms] List submissions failed:', error);
    res.status(500).json({
      error: 'Failed to list submissions',
      message: error.message,
    });
  }
});

/**
 * GET /api/forms/:id/stats
 * Get form statistics
 */
router.get('/:id/stats', async (req, res) => {
  try {
    const formId = req.params.id;
    const tenantId = (req as any).tenantId;

    // Verify tenant access
    const form = await formsService.getForm(formId);
    if (form.tenantId !== tenantId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You do not have access to this form',
      });
    }

    const stats = await invitationService.getInvitationStats(formId);

    res.json({
      success: true,
      data: {
        submissionCount: form.submissionCount || 0,
        lastSubmissionAt: form.lastSubmissionAt,
        invitations: stats,
      },
    });
  } catch (error: any) {
    if (error instanceof FormNotFoundError) {
      return res.status(404).json({
        error: 'Form not found',
        message: error.message,
      });
    }

    console.error('[Forms] Get stats failed:', error);
    res.status(500).json({
      error: 'Failed to get form statistics',
      message: error.message,
    });
  }
});

/**
 * POST /api/forms/:id/send
 * Send form invitation via email or WhatsApp
 */
router.post('/:id/send', async (req, res) => {
  try {
    const formId = req.params.id;
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user.id;
    const environment = (req as any).environment || 'production';
    
    const data = sendInvitationSchema.parse(req.body);

    // Verify tenant access
    const form = await formsService.getForm(formId);
    if (form.tenantId !== tenantId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You do not have access to this form',
      });
    }

    const invitation = await invitationService.sendInvitation({
      formId,
      recipient: {
        email: data.recipientEmail,
        phone: data.recipientPhone,
        name: data.recipientName,
      },
      channel: data.channel,
      context: data.context,
      sentBy: userId,
      environment,
    });

    res.status(201).json({
      success: true,
      data: invitation,
      invitationUrl: `/api/public/forms/${invitation.invitationToken}`,
    });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({
        error: 'Validation error',
        details: error.errors,
      });
    }

    if (error instanceof FormNotFoundError) {
      return res.status(404).json({
        error: 'Form not found',
        message: error.message,
      });
    }

    if (error instanceof FormNotPublishedError) {
      return res.status(400).json({
        error: 'Form not published',
        message: error.message,
      });
    }

    if (error instanceof InvalidChannelError || error instanceof MissingRecipientInfoError) {
      return res.status(400).json({
        error: 'Invalid request',
        message: error.message,
      });
    }

    console.error('[Forms] Send invitation failed:', error);
    res.status(500).json({
      error: 'Failed to send invitation',
      message: error.message,
    });
  }
});

export default router;
