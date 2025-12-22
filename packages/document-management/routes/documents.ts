/**
 * Document Management Routes
 * 
 * RESTful API routes for document upload, download, versioning, 
 * classification, search, permissions, and entity linking.
 * 
 * Mounted at: /api/documents
 */

import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { eq, and, desc, inArray, or, ilike } from 'drizzle-orm';
import { db } from '../../../apps/api/db';
import {
  documents,
  documentVersions,
  documentClassifications,
  documentPermissions,
  documentEntityLinks,
  documentFolderLinks,
} from '../../../shared/schema';
import { DocumentStorageService } from '../services/DocumentStorageService';
import { DocumentClassificationService } from '../services/DocumentClassificationService';
import { FolderService } from '../services/FolderService';

const router = Router();

// ═══════════════════════════════════════════════════════════════════════════════
// Services
// ═══════════════════════════════════════════════════════════════════════════════

const storageService = new DocumentStorageService();
const classificationService = new DocumentClassificationService();
const folderService = new FolderService();

// ═══════════════════════════════════════════════════════════════════════════════
// Multer Configuration
// ═══════════════════════════════════════════════════════════════════════════════

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/csv',
  'application/zip',
  'application/x-zip-compressed',
];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
  },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type: ${file.mimetype}. Allowed types: PDF, Images, Office documents, Text, CSV, ZIP`));
    }
  },
});

// ═══════════════════════════════════════════════════════════════════════════════
// Validation Schemas
// ═══════════════════════════════════════════════════════════════════════════════

const uploadMetadataSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  documentType: z.enum(['invoice', 'receipt', 'contract', 'report', 'fiscal_note', 'purchase_order', 'other']).optional(),
  tags: z.string().optional(), // Comma-separated
  fiscalYear: z.string().optional(),
  fiscalMonth: z.string().optional(),
  entityType: z.string().optional(),
  entityId: z.string().uuid().optional(),
  
  // Folder
  folderId: z.string().uuid().optional(),
  
  // Portuguese Fiscal Fields
  nifEmissor: z.string().regex(/^[0-9]{9}$/, 'NIF must be 9 digits').optional(),
  nifDestinatario: z.string().regex(/^[0-9]{9}$/, 'NIF must be 9 digits').optional(),
  atcud: z.string().optional(),
  codigoValidacaoAt: z.string().optional(),
  dataDocumento: z.string().optional(), // ISO date string
});

const listDocumentsSchema = z.object({
  page: z.string().optional().default('1'),
  limit: z.string().optional().default('20'),
  type: z.string().optional(),
  status: z.string().optional(),
  uploadedBy: z.string().uuid().optional(),
  fiscalYear: z.string().optional(),
  fiscalMonth: z.string().optional(),
  search: z.string().optional(),
  folderId: z.string().uuid().optional(), // Filter by folder
});

const setPermissionsSchema = z.object({
  userId: z.string().uuid(),
  canView: z.boolean().default(false),
  canEdit: z.boolean().default(false),
  canDelete: z.boolean().default(false),
  canShare: z.boolean().default(false),
});

const linkToEntitySchema = z.object({
  entityType: z.string().min(1),
  entityId: z.string().uuid(),
  linkType: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

const searchDocumentsSchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().positive().optional().default(10),
});

const createVersionSchema = z.object({
  changeDescription: z.string().optional(),
});

// ═══════════════════════════════════════════════════════════════════════════════
// Middleware
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get authenticated user's tenant ID
 * Checks multiple sources in priority order:
 * 1. req.tenantId (set by tenantMiddleware from x-tenant-slug header)
 * 2. req.session.activeTenantId (set during login/tenant switching)
 */
function getTenantId(req: Request): string {
  const tenantId = (req as any).tenantId || (req as any).session?.activeTenantId;
  if (!tenantId) {
    throw new Error('No active tenant');
  }
  return tenantId;
}

/**
 * Get authenticated user ID
 * Checks multiple sources in priority order:
 * 1. req.userId (set by tenantMiddleware if user has tenant access)
 * 2. req.user.id (set by requireAuth middleware)
 */
function getUserId(req: Request): string {
  const userId = (req as any).userId || (req as any).user?.id;
  if (!userId) {
    throw new Error('Not authenticated');
  }
  return userId;
}

/**
 * Check if user has permission to access document
 */
async function checkDocumentAccess(
  documentId: string,
  userId: string,
  tenantId: string,
  requiredPermission: 'view' | 'edit' | 'delete' = 'view'
): Promise<boolean> {
  try {
    // Get document
    const [document] = await db
      .select()
      .from(documents)
      .where(eq(documents.id, documentId))
      .limit(1);

    if (!document) {
      return false;
    }

    // Check tenant match
    if (document.tenantId !== tenantId) {
      return false;
    }

    // Owner has all permissions
    if (document.uploadedBy === userId) {
      return true;
    }

    // Check explicit permissions
    const [permission] = await db
      .select()
      .from(documentPermissions)
      .where(
        and(
          eq(documentPermissions.documentId, documentId),
          eq(documentPermissions.userId, userId)
        )
      )
      .limit(1);

    if (!permission) {
      return false;
    }

    // Check specific permission
    if (requiredPermission === 'view' && permission.canView) return true;
    if (requiredPermission === 'edit' && permission.canEdit) return true;
    if (requiredPermission === 'delete' && permission.canDelete) return true;

    return false;
  } catch (error) {
    console.error('[DocumentAccess] Error checking access:', error);
    return false;
  }
}

/**
 * Rate limiter for classification endpoint (5 req/min per user)
 */
const classificationRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5,
  keyGenerator: (req) => {
    const userId = (req as any).user?.id || 'anonymous';
    return `classify_${userId}`;
  },
  message: { error: 'Too many classification requests. Please try again in a minute.' },
});

// ═══════════════════════════════════════════════════════════════════════════════
// Routes: Document Management
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/documents
 * Upload new document
 */
router.post('/', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const file = (req as any).file;

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Validate metadata
    const metadataValidation = uploadMetadataSchema.safeParse(req.body);
    if (!metadataValidation.success) {
      return res.status(400).json({
        error: 'Invalid metadata',
        details: metadataValidation.error.errors,
      });
    }

    const metadata = metadataValidation.data;

    // Parse tags
    const tags = metadata.tags
      ? metadata.tags.split(',').map((t) => t.trim()).filter((t) => t)
      : undefined;

    // Upload document
    const document = await storageService.uploadDocument(
      tenantId,
      userId,
      file.buffer,
      {
        filename: file.originalname,
        mimeType: file.mimetype,
        title: metadata.title,
        description: metadata.description,
        documentType: metadata.documentType as any,
        tags,
        fiscalYear: metadata.fiscalYear ? parseInt(metadata.fiscalYear) : undefined,
        fiscalMonth: metadata.fiscalMonth ? parseInt(metadata.fiscalMonth) : undefined,
      }
    );

    // Update document with Portuguese fiscal fields
    if (metadata.nifEmissor || metadata.nifDestinatario || metadata.atcud || metadata.codigoValidacaoAt || metadata.dataDocumento) {
      await db.update(documents)
        .set({
          nifEmissor: metadata.nifEmissor || null,
          nifDestinatario: metadata.nifDestinatario || null,
          atcud: metadata.atcud || null,
          codigoValidacaoAt: metadata.codigoValidacaoAt || null,
          dataDocumento: metadata.dataDocumento || null,
          updatedAt: new Date(),
        })
        .where(eq(documents.id, document.id));
    }

    // Get the initial version
    const [version] = await db
      .select()
      .from(documentVersions)
      .where(eq(documentVersions.documentId, document.id))
      .limit(1);

    // Link to entity if provided
    let entityLink = null;
    if (metadata.entityType && metadata.entityId) {
      entityLink = await storageService.linkToEntity(
        document.id,
        userId,
        metadata.entityType,
        metadata.entityId
      );
    }

    // Link to folder if provided
    if (metadata.folderId) {
      try {
        await folderService.addDocumentsToFolder(
          metadata.folderId,
          tenantId,
          [document.id],
          true // Set as primary folder
        );
      } catch (error: any) {
        console.error('[Documents] Failed to link to folder:', error);
        // Don't fail the upload if folder linking fails
      }
    }

    res.status(201).json({
      document,
      version,
      entityLink,
    });
  } catch (error: any) {
    console.error('[Documents] Upload error:', error);
    res.status(500).json({
      error: 'Failed to upload document',
      details: error.message,
    });
  }
});

/**
 * GET /api/documents
 * List documents with filters
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);

    // Validate query params
    const queryValidation = listDocumentsSchema.safeParse(req.query);
    if (!queryValidation.success) {
      return res.status(400).json({
        error: 'Invalid query parameters',
        details: queryValidation.error.errors,
      });
    }

    const query = queryValidation.data;
    const page = parseInt(query.page);
    const limit = parseInt(query.limit);
    const offset = (page - 1) * limit;

    // Build filters
    const filters: any = {
      limit,
      offset,
    };

    if (query.type) filters.documentType = query.type as any;
    if (query.status) filters.status = query.status as any;
    if (query.uploadedBy) filters.uploadedBy = query.uploadedBy;
    if (query.fiscalYear) filters.fiscalYear = parseInt(query.fiscalYear);
    if (query.fiscalMonth) filters.fiscalMonth = parseInt(query.fiscalMonth);
    if (query.search) filters.search = query.search;

    // Filter by folder if specified
    let documentsList;
    let totalCount;

    if (query.folderId) {
      // Get documents in folder
      const documentIds = await folderService.getDocumentsInFolder(
        query.folderId,
        tenantId,
        false // Don't include subfolders
      );

      if (documentIds.length === 0) {
        return res.json({
          documents: [],
          total: 0,
          page,
          limit,
          hasMore: false,
          totalPages: 0,
        });
      }

      // Fetch documents by IDs with other filters
      const whereConditions = [
        eq(documents.tenantId, tenantId),
        inArray(documents.id, documentIds),
      ];

      if (query.type) whereConditions.push(eq(documents.documentType, query.type as any));
      if (query.status) whereConditions.push(eq(documents.status, query.status as any));
      if (query.uploadedBy) whereConditions.push(eq(documents.uploadedBy, query.uploadedBy));
      if (query.fiscalYear) whereConditions.push(eq(documents.fiscalYear, parseInt(query.fiscalYear)));
      if (query.fiscalMonth) whereConditions.push(eq(documents.fiscalMonth, parseInt(query.fiscalMonth)));
      if (query.search) {
        whereConditions.push(
          or(
            ilike(documents.title, `%${query.search}%`),
            ilike(documents.filename, `%${query.search}%`),
            ilike(documents.originalName, `%${query.search}%`)
          )!
        );
      }

      const allDocs = await db
        .select()
        .from(documents)
        .where(and(...whereConditions))
        .orderBy(desc(documents.createdAt));

      totalCount = allDocs.length;
      documentsList = allDocs.slice(offset, offset + limit);
    } else {
      // List documents using existing method
      documentsList = await storageService.listDocuments(tenantId, filters);

      // Get total count (same query without limit/offset)
      const countFilters = { ...filters };
      delete countFilters.limit;
      delete countFilters.offset;
      const allDocuments = await storageService.listDocuments(tenantId, countFilters);
      totalCount = allDocuments.length;
    }

    res.json({
      documents: documentsList,
      total: totalCount,
      page,
      limit,
      hasMore: offset + documentsList.length < totalCount,
      totalPages: Math.ceil(totalCount / limit),
    });
  } catch (error: any) {
    console.error('[Documents] List error:', error);
    res.status(500).json({
      error: 'Failed to list documents',
      details: error.message,
    });
  }
});

/**
 * GET /api/documents/:id
 * Get document metadata
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const { id } = req.params;

    // Check access
    const hasAccess = await checkDocumentAccess(id, userId, tenantId, 'view');
    if (!hasAccess) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    // Get document
    const document = await storageService.getDocument(id);

    // Get latest classification (if any)
    const [classification] = await db
      .select()
      .from(documentClassifications)
      .where(
        and(
          eq(documentClassifications.documentId, id),
          eq(documentClassifications.status, 'completed')
        )
      )
      .orderBy(desc(documentClassifications.createdAt))
      .limit(1);

    // Get versions
    const versions = await db
      .select()
      .from(documentVersions)
      .where(eq(documentVersions.documentId, id))
      .orderBy(desc(documentVersions.versionNumber));

    res.json({
      document,
      classification: classification || null,
      versions,
    });
  } catch (error: any) {
    console.error('[Documents] Get error:', error);
    
    if (error.name === 'DocumentNotFoundError') {
      return res.status(404).json({ error: 'Document not found' });
    }

    res.status(500).json({
      error: 'Failed to get document',
      details: error.message,
    });
  }
});

/**
 * GET /api/documents/:id/download
 * Download document file
 */
router.get('/:id/download', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const { id } = req.params;

    // Check access
    const hasAccess = await checkDocumentAccess(id, userId, tenantId, 'view');
    if (!hasAccess) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    // Get document
    const document = await storageService.getDocument(id);

    // Download file
    const fileBuffer = await storageService.downloadDocument(id, userId);

    // Set headers
    res.set({
      'Content-Type': document.mimeType,
      'Content-Disposition': `attachment; filename="${document.originalName}"`,
      'Content-Length': fileBuffer.length.toString(),
    });

    res.send(fileBuffer);
  } catch (error: any) {
    console.error('[Documents] Download error:', error);
    
    if (error.name === 'DocumentNotFoundError') {
      return res.status(404).json({ error: 'Document not found' });
    }
    if (error.name === 'PermissionDeniedError') {
      return res.status(403).json({ error: 'Permission denied' });
    }

    res.status(500).json({
      error: 'Failed to download document',
      details: error.message,
    });
  }
});

/**
 * DELETE /api/documents/:id
 * Soft delete document
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const { id } = req.params;

    // Check access
    const hasAccess = await checkDocumentAccess(id, userId, tenantId, 'delete');
    if (!hasAccess) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    // Delete document
    await storageService.deleteDocument(id, userId);

    res.json({ success: true });
  } catch (error: any) {
    console.error('[Documents] Delete error:', error);
    
    if (error.name === 'DocumentNotFoundError') {
      return res.status(404).json({ error: 'Document not found' });
    }
    if (error.name === 'PermissionDeniedError') {
      return res.status(403).json({ error: 'Permission denied' });
    }

    res.status(500).json({
      error: 'Failed to delete document',
      details: error.message,
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// Routes: Versioning
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/documents/:id/versions
 * Create new version
 */
router.post('/:id/versions', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const { id } = req.params;
    const file = (req as any).file;

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Check access
    const hasAccess = await checkDocumentAccess(id, userId, tenantId, 'edit');
    if (!hasAccess) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    // Validate metadata
    const metadataValidation = createVersionSchema.safeParse(req.body);
    if (!metadataValidation.success) {
      return res.status(400).json({
        error: 'Invalid metadata',
        details: metadataValidation.error.errors,
      });
    }

    const metadata = metadataValidation.data;

    // Create version
    const version = await storageService.createVersion(
      id,
      userId,
      file.buffer,
      metadata.changeDescription || 'Updated version'
    );

    res.status(201).json({ version });
  } catch (error: any) {
    console.error('[Documents] Create version error:', error);
    
    if (error.name === 'DocumentNotFoundError') {
      return res.status(404).json({ error: 'Document not found' });
    }
    if (error.name === 'PermissionDeniedError') {
      return res.status(403).json({ error: 'Permission denied' });
    }

    res.status(500).json({
      error: 'Failed to create version',
      details: error.message,
    });
  }
});

/**
 * GET /api/documents/:id/versions
 * List document versions
 */
router.get('/:id/versions', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const { id } = req.params;

    // Check access
    const hasAccess = await checkDocumentAccess(id, userId, tenantId, 'view');
    if (!hasAccess) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    // Get versions
    const versions = await db
      .select()
      .from(documentVersions)
      .where(eq(documentVersions.documentId, id))
      .orderBy(desc(documentVersions.versionNumber));

    res.json({ versions });
  } catch (error: any) {
    console.error('[Documents] List versions error:', error);
    res.status(500).json({
      error: 'Failed to list versions',
      details: error.message,
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// Routes: Classification & Search
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/documents/:id/classify
 * Trigger AI classification (rate limited)
 */
router.post('/:id/classify', classificationRateLimiter, async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const { id } = req.params;

    // Check access
    const hasAccess = await checkDocumentAccess(id, userId, tenantId, 'view');
    if (!hasAccess) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    // Classify document
    const classification = await classificationService.classifyDocument(id);

    res.json({ classification });
  } catch (error: any) {
    console.error('[Documents] Classify error:', error);
    
    if (error.name === 'DocumentNotFoundError') {
      return res.status(404).json({ error: 'Document not found' });
    }

    res.status(500).json({
      error: 'Failed to classify document',
      details: error.message,
    });
  }
});

/**
 * GET /api/documents/:id/classification
 * Get classification results
 */
router.get('/:id/classification', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const { id } = req.params;

    // Check access
    const hasAccess = await checkDocumentAccess(id, userId, tenantId, 'view');
    if (!hasAccess) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    // Get latest classification
    const [classification] = await db
      .select()
      .from(documentClassifications)
      .where(eq(documentClassifications.documentId, id))
      .orderBy(desc(documentClassifications.createdAt))
      .limit(1);

    if (!classification) {
      return res.status(404).json({ error: 'No classification found for this document' });
    }

    // Get extracted data
    let extractedData = classification.extractedData;
    if (!extractedData && classification.status === 'completed') {
      extractedData = await classificationService.extractStructuredData(id);
    }

    res.json({
      classification,
      extractedData,
    });
  } catch (error: any) {
    console.error('[Documents] Get classification error:', error);
    res.status(500).json({
      error: 'Failed to get classification',
      details: error.message,
    });
  }
});

/**
 * POST /api/documents/search
 * Semantic search
 */
router.post('/search', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);

    // Validate request body
    const bodyValidation = searchDocumentsSchema.safeParse(req.body);
    if (!bodyValidation.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        details: bodyValidation.error.errors,
      });
    }

    const { query, limit } = bodyValidation.data;

    // Search similar documents
    const results = await classificationService.searchSimilar(tenantId, query, limit, {
      userId,
      environment: ((req as any).environment || 'production') as 'production' | 'sandbox',
    });

    res.json({ results });
  } catch (error: any) {
    console.error('[Documents] Search error:', error);
    res.status(500).json({
      error: 'Failed to search documents',
      details: error.message,
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// Routes: Permissions
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/documents/:id/permissions
 * Set permissions
 */
router.post('/:id/permissions', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const { id } = req.params;

    // Check if user is document owner or has share permission
    const [document] = await db
      .select()
      .from(documents)
      .where(eq(documents.id, id))
      .limit(1);

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    if (document.tenantId !== tenantId) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    // Only owner or users with canShare permission can set permissions
    if (document.uploadedBy !== userId) {
      const [userPermission] = await db
        .select()
        .from(documentPermissions)
        .where(
          and(
            eq(documentPermissions.documentId, id),
            eq(documentPermissions.userId, userId)
          )
        )
        .limit(1);

      if (!userPermission || !userPermission.canShare) {
        return res.status(403).json({ error: 'Permission denied' });
      }
    }

    // Validate request body
    const bodyValidation = setPermissionsSchema.safeParse(req.body);
    if (!bodyValidation.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        details: bodyValidation.error.errors,
      });
    }

    const permissions = bodyValidation.data;

    // Set permissions
    await storageService.setPermissions(
      id,
      permissions.userId,
      {
        canView: permissions.canView,
        canEdit: permissions.canEdit,
        canDelete: permissions.canDelete,
        canShare: permissions.canShare,
      }
    );

    const permission = { success: true };

    res.json({ permission });
  } catch (error: any) {
    console.error('[Documents] Set permissions error:', error);
    res.status(500).json({
      error: 'Failed to set permissions',
      details: error.message,
    });
  }
});

/**
 * GET /api/documents/:id/permissions
 * Get permissions
 */
router.get('/:id/permissions', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const { id } = req.params;

    // Check access
    const hasAccess = await checkDocumentAccess(id, userId, tenantId, 'view');
    if (!hasAccess) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    // Get permissions
    const permissions = await db
      .select()
      .from(documentPermissions)
      .where(eq(documentPermissions.documentId, id));

    res.json({ permissions });
  } catch (error: any) {
    console.error('[Documents] Get permissions error:', error);
    res.status(500).json({
      error: 'Failed to get permissions',
      details: error.message,
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// Routes: Entity Linking
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/documents/:id/link
 * Link to business entity
 */
router.post('/:id/link', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const { id } = req.params;

    // Check access
    const hasAccess = await checkDocumentAccess(id, userId, tenantId, 'edit');
    if (!hasAccess) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    // Validate request body
    const bodyValidation = linkToEntitySchema.safeParse(req.body);
    if (!bodyValidation.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        details: bodyValidation.error.errors,
      });
    }

    const { entityType, entityId, linkType, metadata } = bodyValidation.data;

    // Link to entity
    await storageService.linkToEntity(
      id,
      entityType,
      entityId,
      linkType,
      metadata
    );

    const link = { success: true };

    res.json({ link });
  } catch (error: any) {
    console.error('[Documents] Link to entity error:', error);
    
    if (error.name === 'DocumentNotFoundError') {
      return res.status(404).json({ error: 'Document not found' });
    }

    res.status(500).json({
      error: 'Failed to link to entity',
      details: error.message,
    });
  }
});

/**
 * GET /api/documents/:id/links
 * Get entity links
 */
router.get('/:id/links', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const { id } = req.params;

    // Check access
    const hasAccess = await checkDocumentAccess(id, userId, tenantId, 'view');
    if (!hasAccess) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    // Get entity links
    const links = await db
      .select()
      .from(documentEntityLinks)
      .where(eq(documentEntityLinks.documentId, id));

    res.json({ links });
  } catch (error: any) {
    console.error('[Documents] Get entity links error:', error);
    res.status(500).json({
      error: 'Failed to get entity links',
      details: error.message,
    });
  }
});

export default router;
