/**
 * Link Routes - Cross-Module Field Linking APIs
 * 
 * Endpoints para configurar e gerir links entre custom fields e entidades de outros módulos
 */

import { Router } from 'express';
import { createLinkResolver } from '../../base/link-resolver.service';

export const linkRoutes = Router();

// ============================================================================
// GET LINKABLE ENTITIES
// ============================================================================

/**
 * GET /api/projects/linkable-entities
 * Get all linkable entities available for cross-module linking
 */
linkRoutes.get('/linkable-entities', async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id;
    const environment = (req as any).activeTenant?.environment || 'production';
    const userPermissions = (req as any).userPermissions || [];
    
    if (!tenantId || !userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const linkResolver = createLinkResolver(tenantId, userId, environment, userPermissions);
    const entities = await linkResolver.getAvailableLinkableEntities();
    
    res.json({
      success: true,
      entities
    });
  } catch (error) {
    console.error('[LinkRoutes] Error getting linkable entities:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to get linkable entities';
    
    // Map permission errors to 403
    if (errorMessage.includes('Permission denied')) {
      return res.status(403).json({ error: errorMessage });
    }
    
    res.status(500).json({ error: errorMessage });
  }
});

/**
 * GET /api/projects/linkable-entities/:module
 * Get linkable entities for a specific module
 */
linkRoutes.get('/linkable-entities/:module', async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id;
    const environment = (req as any).activeTenant?.environment || 'production';
    const userPermissions = (req as any).userPermissions || [];
    const { module } = req.params;
    
    if (!tenantId || !userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const linkResolver = createLinkResolver(tenantId, userId, environment, userPermissions);
    const entities = await linkResolver.getLinkableEntitiesByModule(module);
    
    res.json({
      success: true,
      module,
      entities
    });
  } catch (error) {
    console.error('[LinkRoutes] Error getting linkable entities by module:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to get linkable entities';
    
    // Map permission errors to 403
    if (errorMessage.includes('Permission denied')) {
      return res.status(403).json({ error: errorMessage });
    }
    
    res.status(500).json({ error: errorMessage });
  }
});

// ============================================================================
// SEARCH LINKABLE RECORDS
// ============================================================================

/**
 * GET /api/projects/linkable-entities/search?targetModule=...&targetEntity=...&displayField=...&search=...
 * Search for records in a linkable entity (used by LinkFieldPicker)
 */
linkRoutes.get('/linkable-entities/search', async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id;
    const environment = (req as any).activeTenant?.environment || 'production';
    const userPermissions = (req as any).userPermissions || [];
    const { targetModule, targetEntity, displayField, search, limit } = req.query;
    
    if (!tenantId || !userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    if (!targetModule || !targetEntity || !displayField) {
      return res.status(400).json({ 
        error: 'Missing required query params: targetModule, targetEntity, displayField' 
      });
    }
    
    const searchTerm = (search as string) || '';
    const searchLimit = limit ? parseInt(limit as string) : 20;
    
    const linkResolver = createLinkResolver(tenantId, userId, environment, userPermissions);
    const results = await linkResolver.searchLinkableRecords(
      targetModule as string,
      targetEntity as string,
      searchTerm,
      searchLimit
    );
    
    res.json({
      success: true,
      records: results.map(r => ({
        id: r.id,
        displayValue: r.displayValue,
        metadata: r.metadata
      }))
    });
  } catch (error) {
    console.error('[LinkRoutes] Error searching linkable records:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to search records';
    
    // Map permission errors to 403
    if (errorMessage.includes('Permission denied')) {
      return res.status(403).json({ error: errorMessage });
    }
    
    res.status(500).json({ error: errorMessage });
  }
});

/**
 * GET /api/projects/linkable-entities/resolve?targetModule=...&targetEntity=...&targetRecordId=...
 * Resolve a single linkable record to get its display value (used by LinkFieldPicker)
 */
linkRoutes.get('/linkable-entities/resolve', async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id;
    const environment = (req as any).activeTenant?.environment || 'production';
    const userPermissions = (req as any).userPermissions || [];
    const { targetModule, targetEntity, targetRecordId } = req.query;
    
    if (!tenantId || !userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    if (!targetModule || !targetEntity || !targetRecordId) {
      return res.status(400).json({ 
        error: 'Missing required query params: targetModule, targetEntity, targetRecordId' 
      });
    }
    
    const linkResolver = createLinkResolver(tenantId, userId, environment, userPermissions);
    const record = await linkResolver.getLinkableRecordById(
      targetModule as string,
      targetEntity as string,
      targetRecordId as string
    );
    
    if (!record) {
      return res.status(404).json({ 
        error: 'Record not found or access denied',
        targetModule,
        targetEntity,
        targetRecordId
      });
    }
    
    res.json({
      success: true,
      record
    });
  } catch (error) {
    console.error('[LinkRoutes] Error resolving linkable record:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to resolve record';
    
    // Map permission errors to 403
    if (errorMessage.includes('Permission denied')) {
      return res.status(403).json({ error: errorMessage });
    }
    
    res.status(500).json({ error: errorMessage });
  }
});

/**
 * GET /api/projects/linkable-entities/:module/:entity/search?q=searchTerm
 * Search for records in a linkable entity (legacy endpoint)
 */
linkRoutes.get('/linkable-entities/:module/:entity/search', async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id;
    const environment = (req as any).activeTenant?.environment || 'production';
    const userPermissions = (req as any).userPermissions || [];
    const { module, entity } = req.params;
    const { q, limit } = req.query;
    
    if (!tenantId || !userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const searchTerm = q as string || '';
    const searchLimit = limit ? parseInt(limit as string) : 10;
    
    const linkResolver = createLinkResolver(tenantId, userId, environment, userPermissions);
    const results = await linkResolver.searchLinkableRecords(
      module,
      entity,
      searchTerm,
      searchLimit
    );
    
    res.json({
      success: true,
      module,
      entity,
      searchTerm,
      results
    });
  } catch (error) {
    console.error('[LinkRoutes] Error searching linkable records:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to search records';
    
    // Map permission errors to 403
    if (errorMessage.includes('Permission denied')) {
      return res.status(403).json({ error: errorMessage });
    }
    
    res.status(500).json({ error: errorMessage });
  }
});

// ============================================================================
// CREATE LINK
// ============================================================================

/**
 * POST /api/projects/fields/:fieldId/link
 * Create a link between a custom field and an entity record
 * 
 * Body:
 * {
 *   sourceRecordId: string,
 *   targetModule: string,
 *   targetEntity: string,
 *   targetRecordId: string,
 *   displayValue?: string
 * }
 */
linkRoutes.post('/fields/:fieldId/link', async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id;
    const environment = (req as any).activeTenant?.environment || 'production';
    const userPermissions = (req as any).userPermissions || [];
    const { fieldId } = req.params;
    const { sourceRecordId, targetModule, targetEntity, targetRecordId, displayValue } = req.body;
    
    if (!tenantId || !userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    // Validate required fields
    if (!sourceRecordId || !targetModule || !targetEntity || !targetRecordId) {
      return res.status(400).json({ 
        error: 'Missing required fields: sourceRecordId, targetModule, targetEntity, targetRecordId' 
      });
    }
    
    const linkResolver = createLinkResolver(tenantId, userId, environment, userPermissions);
    const link = await linkResolver.createLink(
      fieldId,
      sourceRecordId,
      targetModule,
      targetEntity,
      targetRecordId,
      displayValue
    );
    
    res.status(201).json({
      success: true,
      link
    });
  } catch (error) {
    console.error('[LinkRoutes] Error creating link:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to create link';
    
    // Map permission errors to 403
    if (errorMessage.includes('Permission denied')) {
      return res.status(403).json({ error: errorMessage });
    }
    
    res.status(500).json({ error: errorMessage });
  }
});

// ============================================================================
// DELETE LINK
// ============================================================================

/**
 * DELETE /api/projects/fields/links/:linkId
 * Remove a link
 */
linkRoutes.delete('/fields/links/:linkId', async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id;
    const environment = (req as any).activeTenant?.environment || 'production';
    const userPermissions = (req as any).userPermissions || [];
    const { linkId } = req.params;
    
    if (!tenantId || !userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const linkResolver = createLinkResolver(tenantId, userId, environment, userPermissions);
    await linkResolver.removeLink(linkId);
    
    res.json({
      success: true,
      message: 'Link removed successfully'
    });
  } catch (error) {
    console.error('[LinkRoutes] Error removing link:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to remove link';
    
    // Map permission errors to 403
    if (errorMessage.includes('Permission denied')) {
      return res.status(403).json({ error: errorMessage });
    }
    
    res.status(500).json({ error: errorMessage });
  }
});

// ============================================================================
// GET LINKS FOR RECORD
// ============================================================================

/**
 * GET /api/projects/records/:recordId/links
 * Get all links for a source record
 */
linkRoutes.get('/records/:recordId/links', async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id;
    const environment = (req as any).activeTenant?.environment || 'production';
    const userPermissions = (req as any).userPermissions || [];
    const { recordId } = req.params;
    
    if (!tenantId || !userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const linkResolver = createLinkResolver(tenantId, userId, environment, userPermissions);
    const links = await linkResolver.getLinksForRecord(recordId);
    
    res.json({
      success: true,
      recordId,
      links
    });
  } catch (error) {
    console.error('[LinkRoutes] Error getting links for record:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to get links';
    
    // Map permission errors to 403
    if (errorMessage.includes('Permission denied')) {
      return res.status(403).json({ error: errorMessage });
    }
    
    res.status(500).json({ error: errorMessage });
  }
});

// ============================================================================
// RESOLVE LINK
// ============================================================================

/**
 * GET /api/projects/fields/links/:linkId/resolve
 * Resolve a link to get the current target record data
 */
linkRoutes.get('/fields/links/:linkId/resolve', async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id;
    const environment = (req as any).activeTenant?.environment || 'production';
    const userPermissions = (req as any).userPermissions || [];
    const { linkId } = req.params;
    const { useCache } = req.query;
    
    if (!tenantId || !userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const shouldUseCache = useCache !== 'false';
    
    const linkResolver = createLinkResolver(tenantId, userId, environment, userPermissions);
    const resolvedData = await linkResolver.resolveLink(linkId, shouldUseCache);
    
    res.json({
      success: true,
      linkId,
      data: resolvedData
    });
  } catch (error) {
    console.error('[LinkRoutes] Error resolving link:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to resolve link';
    
    // Map permission errors to 403
    if (errorMessage.includes('Permission denied')) {
      return res.status(403).json({ error: errorMessage });
    }
    
    res.status(500).json({ error: errorMessage });
  }
});
