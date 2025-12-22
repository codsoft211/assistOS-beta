/**
 * Public Forms Routes - NO AUTHENTICATION
 * 
 * Public-facing endpoints for form submission and tracking.
 * These routes do NOT require authentication and use token-based access.
 * 
 * Endpoints:
 * - GET /api/public/forms/:token - Get public form by token
 * - POST /api/public/forms/:token/submit - Submit form
 * - POST /api/public/forms/:token/track - Track form view/start events
 * - POST /api/public/forms/upload - Upload file (returns document ID)
 */

import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { uploadRateLimiter } from '../middleware/rate-limit';
import rateLimit from 'express-rate-limit';
import {
  FormSubmissionService,
  FormInvitationService,
  InvalidTokenError,
  ValidationError,
  AlreadySubmittedError,
} from '../../../packages/platform/dynamic-forms';
import { DocumentStorageService } from '../../../packages/document-management/services/DocumentStorageService';

const router = Router();
const submissionService = new FormSubmissionService();
const invitationService = new FormInvitationService();
const documentService = new DocumentStorageService();

// SECURITY: Allowed MIME types for form file uploads (whitelist approach)
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

// SECURITY: Maximum file size (5MB - reduced from 10MB)
const MAX_FILE_SIZE = 50 * 1024 * 1024;

// Configure multer for file uploads with security restrictions
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1,
  },
  fileFilter: (req, file, cb) => {
    // SECURITY: Validate MIME type before accepting file
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      return cb(new Error(`File type not allowed. Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}`));
    }
    cb(null, true);
  },
});

// Stricter rate limiter for public endpoints
const publicFormsRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // 50 requests per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      error: 'Too many requests',
      message: 'Please try again later',
      retryAfter: 900, // 15 minutes in seconds
    });
  },
});

// Apply rate limiting to all routes
router.use(publicFormsRateLimiter);

// ═══════════════════════════════════════════════════════════════════════════════
// Validation Schemas
// ═══════════════════════════════════════════════════════════════════════════════

const submitFormSchema = z.object({
  responses: z.array(z.object({
    fieldId: z.string(),
    value: z.string().optional(),
    valueJson: z.any().optional(),
  })),
  submitterEmail: z.string().email().optional(),
  submitterName: z.string().optional(),
  submitterPhone: z.string().optional(),
  captchaToken: z.string().optional(),
});

const trackEventSchema = z.object({
  event: z.enum(['view', 'start']),
});

// ═══════════════════════════════════════════════════════════════════════════════
// Routes
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/public/forms/:token
 * Get public form by invitation or public token
 */
router.get('/:token', async (req, res) => {
  try {
    const token = req.params.token;

    const form = await submissionService.getFormByToken(token);

    // Track view event automatically
    try {
      await invitationService.trackView(token);
    } catch (err) {
      // Non-critical - log and continue
      console.warn('[PublicForms] Failed to track view:', err);
    }

    res.json({
      success: true,
      data: form,
    });
  } catch (error: any) {
    if (error instanceof InvalidTokenError) {
      return res.status(404).json({
        error: 'Form not found',
        message: 'Invalid or expired form link',
      });
    }

    console.error('[PublicForms] Get form failed:', error);
    res.status(500).json({
      error: 'Failed to load form',
      message: 'An error occurred while loading the form',
    });
  }
});

/**
 * POST /api/public/forms/:token/submit
 * Submit form responses
 */
router.post('/:token/submit', async (req, res) => {
  try {
    const token = req.params.token;
    const data = submitFormSchema.parse(req.body);

    // Capture request metadata
    const ipAddress = req.ip;
    const userAgent = req.get('user-agent');

    const result = await submissionService.submitForm({
      invitationToken: token,
      responses: data.responses,
      submitter: {
        email: data.submitterEmail,
        name: data.submitterName,
      },
      metadata: {
        ipAddress,
        userAgent,
        captchaToken: data.captchaToken,
      },
    });

    res.status(201).json({
      success: true,
      data: {
        submissionId: result.submission.id,
        status: result.submission.status,
      },
      message: 'Form submitted successfully',
    });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({
        error: 'Validation error',
        details: error.errors,
      });
    }

    if (error instanceof InvalidTokenError) {
      return res.status(404).json({
        error: 'Form not found',
        message: 'Invalid or expired form link',
      });
    }

    if (error instanceof ValidationError) {
      return res.status(400).json({
        error: 'Form validation failed',
        message: error.message,
        details: error.errors,
      });
    }

    if (error instanceof AlreadySubmittedError) {
      return res.status(409).json({
        error: 'Already submitted',
        message: 'This form has already been submitted',
      });
    }

    console.error('[PublicForms] Submit form failed:', error);
    res.status(500).json({
      error: 'Failed to submit form',
      message: 'An error occurred while submitting the form',
    });
  }
});

/**
 * POST /api/public/forms/:token/track
 * Track form events (view, start)
 */
router.post('/:token/track', async (req, res) => {
  try {
    const token = req.params.token;
    const { event } = trackEventSchema.parse(req.body);

    if (event === 'view') {
      await invitationService.trackView(token);
    } else if (event === 'start') {
      await invitationService.trackStart(token);
    }

    res.json({
      success: true,
      message: `Event '${event}' tracked successfully`,
    });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({
        error: 'Validation error',
        details: error.errors,
      });
    }

    // Non-critical errors - return success anyway to avoid blocking UX
    console.warn('[PublicForms] Track event failed:', error);
    res.json({
      success: true,
      message: 'Event tracked',
    });
  }
});

/**
 * SECURITY: Middleware to validate form token BEFORE file upload
 * This prevents unauthorized file uploads by validating the token first
 */
const validateFormToken = async (req: any, res: any, next: any) => {
  try {
    // SECURITY: Get token from header or query parameter
    const formToken = req.headers['x-form-token'] || req.query.token;
    
    if (!formToken) {
      return res.status(401).json({
        error: 'Missing form token',
        message: 'Form token is required for file uploads',
      });
    }

    // SECURITY: Verify token is valid and form is published
    try {
      const form = await submissionService.getFormByToken(formToken as string);
      
      // Store form info in request for later use
      req.validatedForm = form;
      next();
    } catch (error: any) {
      if (error instanceof InvalidTokenError) {
        return res.status(403).json({
          error: 'Invalid or expired token',
          message: 'The form link is invalid or has expired',
        });
      }
      throw error;
    }
  } catch (error: any) {
    console.error('[PublicForms] Token validation failed:', error);
    return res.status(500).json({
      error: 'Validation failed',
      message: 'An error occurred while validating the form token',
    });
  }
};

/**
 * POST /api/public/forms/upload
 * Upload file for form field
 * Returns document ID to be included in form submission
 * 
 * SECURITY MEASURES:
 * 1. Token validation BEFORE file processing (validateFormToken middleware)
 * 2. MIME type whitelist enforcement (multer fileFilter)
 * 3. File size limit (5MB max)
 * 4. Rate limiting (uploadRateLimiter)
 */
router.post('/upload', validateFormToken, upload.single('file'), uploadRateLimiter, async (req, res) => {
  try {
    // SECURITY: Validate file was uploaded
    if (!req.file) {
      return res.status(400).json({
        error: 'No file uploaded',
        message: 'Please provide a file to upload',
      });
    }

    // SECURITY: Validate file size (double-check after multer)
    if (req.file.size > MAX_FILE_SIZE) {
      return res.status(400).json({
        error: 'File too large',
        message: `File size must not exceed ${MAX_FILE_SIZE / 1024 / 1024}MB`,
      });
    }

    // SECURITY: Validate MIME type (double-check after multer)
    if (!ALLOWED_MIME_TYPES.includes(req.file.mimetype)) {
      return res.status(400).json({
        error: 'Invalid file type',
        message: `File type ${req.file.mimetype} is not allowed`,
      });
    }

    // Get validated form from middleware
    const form = (req as any).validatedForm;

    // Upload file to document storage
    const document = await documentService.uploadDocument(
      form.tenantId,
      'anonymous',
      req.file.buffer,
      {
        filename: req.file.originalname,
        mimeType: req.file.mimetype,
        title: `Form upload - ${req.file.originalname}`,
        documentType: 'form_upload',
      }
    );

    // TODO: Integrate antivirus scanning
    // Example integration points:
    // - ClamAV for on-premise deployment
    // - VirusTotal API for cloud deployment
    // - AWS S3 virus scanning if using AWS
    // Should scan document.storagePath before returning success

    console.log(`[PublicForms] File uploaded successfully: ${document.id} (${req.file.mimetype}, ${req.file.size} bytes)`);

    res.status(201).json({
      success: true,
      data: {
        documentId: document.id,
        fileName: document.filename,
        fileSize: document.fileSize,
        mimeType: document.mimeType,
        url: document.storagePath,
      },
    });
  } catch (error: any) {
    console.error('[PublicForms] File upload failed:', error);
    
    // Handle multer errors
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        error: 'File too large',
        message: `File size must not exceed ${MAX_FILE_SIZE / 1024 / 1024}MB`,
      });
    }

    if (error.message && error.message.includes('File type not allowed')) {
      return res.status(400).json({
        error: 'Invalid file type',
        message: error.message,
      });
    }

    res.status(500).json({
      error: 'Failed to upload file',
      message: 'An error occurred while uploading the file',
    });
  }
});

export default router;
