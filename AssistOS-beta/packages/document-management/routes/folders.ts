/**
 * Document Folders Routes
 * 
 * RESTful API routes for folder management, including CRUD operations,
 * document linking, and fiscal year template generation.
 * 
 * Mounted at: /api/folders
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { FolderService } from '../services/FolderService';

const router = Router();
const folderService = new FolderService();

// ═══════════════════════════════════════════════════════════════════════════════
// Middleware
// ═══════════════════════════════════════════════════════════════════════════════

function getTenantId(req: Request): string {
  const tenantId = (req as any).tenantId || (req as any).session?.activeTenantId;
  if (!tenantId) {
    throw new Error('No active tenant');
  }
  return tenantId;
}

function getUserId(req: Request): string {
  const userId = (req as any).userId || (req as any).user?.id;
  if (!userId) {
    throw new Error('Not authenticated');
  }
  return userId;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Validation Schemas
// ═══════════════════════════════════════════════════════════════════════════════

const createFolderSchema = z.object({
  name: z.string().min(1).max(255),
  parentFolderId: z.string().uuid().optional().nullable(),
  description: z.string().optional(),
  folderType: z.enum(['fiscal', 'project', 'client', 'custom']).optional(),
  metadata: z.record(z.any()).optional(),
});

const updateFolderSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  parentFolderId: z.string().uuid().optional().nullable(),
  description: z.string().optional(),
  folderType: z.enum(['fiscal', 'project', 'client', 'custom']).optional(),
  metadata: z.record(z.any()).optional(),
});

const addDocumentsSchema = z.object({
  documentIds: z.array(z.string().uuid()).min(1),
  isPrimary: z.boolean().optional().default(false),
});

const removeDocumentsSchema = z.object({
  documentIds: z.array(z.string().uuid()).min(1),
});

const moveDocumentsSchema = z.object({
  sourceFolderId: z.string().uuid(),
  targetFolderId: z.string().uuid(),
  documentIds: z.array(z.string().uuid()).min(1),
});

const createFiscalTemplateSchema = z.object({
  year: z.number().int().min(2000).max(2100),
});

// ═══════════════════════════════════════════════════════════════════════════════
// Routes
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/folders
 * List all folders (tree or flat structure)
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const format = req.query.format as string || 'tree'; // 'tree' or 'flat'

    if (format === 'tree') {
      const tree = await folderService.getFolderTree(tenantId);
      return res.json({ folders: tree, format: 'tree' });
    } else {
      const folders = await folderService.getFoldersByTenant(tenantId);
      return res.json({ folders, format: 'flat' });
    }
  } catch (error: any) {
    console.error('Error listing folders:', error);
    return res.status(500).json({ error: error.message || 'Failed to list folders' });
  }
});

/**
 * POST /api/folders
 * Create a new folder
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);

    const validatedData = createFolderSchema.parse(req.body);

    const folder = await folderService.createFolder(tenantId, userId, validatedData);

    return res.status(201).json({
      message: 'Folder created successfully',
      folder,
    });
  } catch (error: any) {
    console.error('Error creating folder:', error);
    
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }
    
    if (error.name === 'FolderPathConflictError') {
      return res.status(409).json({ error: error.message });
    }
    
    return res.status(500).json({ error: error.message || 'Failed to create folder' });
  }
});

/**
 * GET /api/folders/:id
 * Get a specific folder with its details
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const folderId = req.params.id;

    const folder = await folderService.getFolderById(folderId, tenantId);

    // Get documents in folder
    const documentIds = await folderService.getDocumentsInFolder(
      folderId,
      tenantId,
      false // Don't include subfolders by default
    );

    return res.json({
      folder,
      documentCount: documentIds.length,
      documentIds,
    });
  } catch (error: any) {
    console.error('Error getting folder:', error);
    
    if (error.name === 'FolderNotFoundError') {
      return res.status(404).json({ error: error.message });
    }
    
    return res.status(500).json({ error: error.message || 'Failed to get folder' });
  }
});

/**
 * PATCH /api/folders/:id
 * Update a folder
 */
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const folderId = req.params.id;

    const validatedData = updateFolderSchema.parse(req.body);

    const folder = await folderService.updateFolder(
      folderId,
      tenantId,
      userId,
      validatedData
    );

    return res.json({
      message: 'Folder updated successfully',
      folder,
    });
  } catch (error: any) {
    console.error('Error updating folder:', error);
    
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }
    
    if (error.name === 'FolderNotFoundError') {
      return res.status(404).json({ error: error.message });
    }
    
    if (error.name === 'InvalidFolderOperationError') {
      return res.status(400).json({ error: error.message });
    }
    
    return res.status(500).json({ error: error.message || 'Failed to update folder' });
  }
});

/**
 * DELETE /api/folders/:id
 * Delete a folder
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const folderId = req.params.id;
    const deleteDocuments = req.query.deleteDocuments === 'true';

    await folderService.deleteFolder(folderId, tenantId, deleteDocuments);

    return res.json({
      message: 'Folder deleted successfully',
      deletedDocuments: deleteDocuments,
    });
  } catch (error: any) {
    console.error('Error deleting folder:', error);
    
    if (error.name === 'FolderNotFoundError') {
      return res.status(404).json({ error: error.message });
    }
    
    return res.status(500).json({ error: error.message || 'Failed to delete folder' });
  }
});

/**
 * POST /api/folders/:id/documents
 * Add documents to a folder
 */
router.post('/:id/documents', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const folderId = req.params.id;

    const validatedData = addDocumentsSchema.parse(req.body);

    await folderService.addDocumentsToFolder(
      folderId,
      tenantId,
      validatedData.documentIds,
      validatedData.isPrimary
    );

    return res.json({
      message: 'Documents added to folder successfully',
      count: validatedData.documentIds.length,
    });
  } catch (error: any) {
    console.error('Error adding documents to folder:', error);
    
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }
    
    if (error.name === 'FolderNotFoundError') {
      return res.status(404).json({ error: error.message });
    }
    
    return res.status(500).json({ error: error.message || 'Failed to add documents to folder' });
  }
});

/**
 * DELETE /api/folders/:id/documents
 * Remove documents from a folder
 */
router.delete('/:id/documents', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const folderId = req.params.id;

    const validatedData = removeDocumentsSchema.parse(req.body);

    await folderService.removeDocumentsFromFolder(
      folderId,
      tenantId,
      validatedData.documentIds
    );

    return res.json({
      message: 'Documents removed from folder successfully',
      count: validatedData.documentIds.length,
    });
  } catch (error: any) {
    console.error('Error removing documents from folder:', error);
    
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }
    
    return res.status(500).json({ error: error.message || 'Failed to remove documents from folder' });
  }
});

/**
 * POST /api/folders/move
 * Move documents between folders
 */
router.post('/move', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);

    const validatedData = moveDocumentsSchema.parse(req.body);

    await folderService.moveDocuments(
      validatedData.sourceFolderId,
      validatedData.targetFolderId,
      tenantId,
      validatedData.documentIds
    );

    return res.json({
      message: 'Documents moved successfully',
      count: validatedData.documentIds.length,
      from: validatedData.sourceFolderId,
      to: validatedData.targetFolderId,
    });
  } catch (error: any) {
    console.error('Error moving documents:', error);
    
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }
    
    if (error.name === 'FolderNotFoundError') {
      return res.status(404).json({ error: error.message });
    }
    
    return res.status(500).json({ error: error.message || 'Failed to move documents' });
  }
});

/**
 * POST /api/folders/templates/fiscal-year
 * Create Portuguese fiscal year template structure
 */
router.post('/templates/fiscal-year', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);

    const validatedData = createFiscalTemplateSchema.parse(req.body);

    const rootFolder = await folderService.createFiscalYearTemplate(
      tenantId,
      userId,
      validatedData.year
    );

    return res.status(201).json({
      message: 'Fiscal year template created successfully',
      rootFolder,
      year: validatedData.year,
    });
  } catch (error: any) {
    console.error('Error creating fiscal year template:', error);
    
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }
    
    if (error.name === 'FolderPathConflictError') {
      return res.status(409).json({ 
        error: 'Fiscal year template already exists for this year',
      });
    }
    
    return res.status(500).json({ error: error.message || 'Failed to create fiscal year template' });
  }
});

/**
 * GET /api/folders/templates
 * List available folder templates
 */
router.get('/templates', async (req: Request, res: Response) => {
  try {
    const templates = [
      {
        id: 'fiscal-year',
        name: 'Portuguese Fiscal Year',
        description: 'Standard folder structure for Portuguese fiscal documents',
        structure: [
          'Faturas',
          'Notas de Crédito',
          'Recibos',
          'Contratos',
          'Comprovantes',
          'Outros Documentos Fiscais',
        ],
      },
    ];

    return res.json({ templates });
  } catch (error: any) {
    console.error('Error listing templates:', error);
    return res.status(500).json({ error: error.message || 'Failed to list templates' });
  }
});

export default router;
