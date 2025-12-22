/**
 * Projetos CRUD Routes
 * 
 * Handles project records and entity management:
 * - GET /api/projetos/records - List all project records
 * - GET /api/projetos/records/:id - Get single project record
 * - POST /api/projetos/records - Create project record
 * - PATCH /api/projetos/records/:id - Update project record
 * - DELETE /api/projetos/records/:id - Delete project record
 * - GET /api/projetos/templates - List available templates
 * - POST /api/projetos/templates/:id/apply - Apply template
 * - POST /api/projetos/templates/publish - Publish sandbox to production
 * - GET /api/projetos/entities - List custom entities
 */

import { Router, Request, Response } from 'express';
import { db } from '../../../../apps/api/db';
import { customEntities, customEntityRecords, customFields } from '../../../../shared/schema';
import { and, eq } from 'drizzle-orm';
import { configureModule, getModuleEntities } from '../../base/module-configuration';
import { templates, getTemplate } from '../templates';
import { ProjetosModule } from '../index';

const router = Router();

// ============================================================================
// RECORDS CRUD
// ============================================================================

/**
 * GET /api/projetos/records
 * List all project records for the tenant
 */
router.get('/records', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const environment = (req.query.env as string) || 'production';

    if (!tenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get all projects entities IDs first
    const projectEntities = await db
      .select({ id: customEntities.id })
      .from(customEntities)
      .where(
        and(
          eq(customEntities.tenantId, tenantId),
          eq(customEntities.category, 'projects'),
          eq(customEntities.environment, environment)
        )
      );

    const entityIds = projectEntities.map(e => e.id);

    if (entityIds.length === 0) {
      return res.json({ records: [] });
    }

    // Fetch records for those entities
    const records = await db
      .select()
      .from(customEntityRecords)
      .where(
        and(
          eq(customEntityRecords.tenantId, tenantId),
          eq(customEntityRecords.environment, environment)
        )
      );

    // Filter records that belong to projects entities
    const projectRecords = records.filter(r => entityIds.includes(r.entityId));

    res.json({ records: projectRecords });
  } catch (error: any) {
    console.error('[Projetos] Error fetching records:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/projetos/records/:id
 * Get single project record
 */
router.get('/records/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const { id } = req.params;
    const environment = (req.query.env as string) || 'production';

    if (!tenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Join with customEntities to verify it's a projects entity
    const [record] = await db
      .select({
        record: customEntityRecords,
        entity: customEntities,
      })
      .from(customEntityRecords)
      .innerJoin(
        customEntities,
        and(
          eq(customEntityRecords.entityId, customEntities.id),
          eq(customEntities.category, 'projects'),
          eq(customEntities.environment, environment)
        )
      )
      .where(
        and(
          eq(customEntityRecords.id, id),
          eq(customEntityRecords.tenantId, tenantId),
          eq(customEntityRecords.environment, environment)
        )
      );

    if (!record) {
      return res.status(404).json({ error: 'Record not found or not a projects record' });
    }

    res.json({ record: record.record });
  } catch (error: any) {
    console.error('[Projetos] Error fetching record:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/projetos/records
 * Create new project record
 */
router.post('/records', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).userId;
    const environment = (req.body.environment as string) || 'production';
    const { entityId, data } = req.body;

    if (!tenantId || !userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!entityId || !data) {
      return res.status(400).json({ error: 'entityId and data are required' });
    }

    // Verify entity exists, belongs to tenant AND is a projects entity
    const [entity] = await db
      .select()
      .from(customEntities)
      .where(
        and(
          eq(customEntities.id, entityId),
          eq(customEntities.tenantId, tenantId),
          eq(customEntities.category, 'projects')
        )
      );

    if (!entity) {
      return res.status(404).json({ error: 'Entity not found or not a projects entity' });
    }

    // Create record
    const [record] = await db
      .insert(customEntityRecords)
      .values({
        tenantId,
        entityId,
        data,
        environment,
        createdBy: userId,
        updatedBy: userId,
      })
      .returning();

    res.status(201).json({ record });
  } catch (error: any) {
    console.error('[Projetos] Error creating record:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /api/projetos/records/:id
 * Update project record
 */
router.patch('/records/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).userId;
    const { id } = req.params;
    const { data } = req.body;

    if (!tenantId || !userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!data) {
      return res.status(400).json({ error: 'data is required' });
    }

    // Update record
    const [record] = await db
      .update(customEntityRecords)
      .set({ data, updatedBy: userId, updatedAt: new Date() })
      .where(
        and(
          eq(customEntityRecords.id, id),
          eq(customEntityRecords.tenantId, tenantId)
        )
      )
      .returning();

    if (!record) {
      return res.status(404).json({ error: 'Record not found' });
    }

    res.json({ record });
  } catch (error: any) {
    console.error('[Projetos] Error updating record:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/projetos/records/:id
 * Delete project record
 */
router.delete('/records/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const { id } = req.params;

    if (!tenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const [deleted] = await db
      .delete(customEntityRecords)
      .where(
        and(
          eq(customEntityRecords.id, id),
          eq(customEntityRecords.tenantId, tenantId)
        )
      )
      .returning();

    if (!deleted) {
      return res.status(404).json({ error: 'Record not found' });
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error('[Projetos] Error deleting record:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// TEMPLATES & ENTITIES
// ============================================================================

/**
 * GET /api/projetos/templates
 * List available project templates
 */
router.get('/templates', async (req: Request, res: Response) => {
  try {
    res.json({ templates });
  } catch (error: any) {
    console.error('[Projetos] Error fetching templates:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/projetos/templates/:id/apply
 * Apply template configuration to sandbox
 */
router.post('/templates/:id/apply', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).userId;
    const { id: templateId } = req.params;

    if (!tenantId || !userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const template = getTemplate(templateId);
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // Apply configuration via configureModule helper
    const projetosModule = new ProjetosModule();
    await configureModule(
      projetosModule,
      tenantId,
      template.configuration,
      { 
        tenantId, 
        userId, 
        permissions: [],
        environment: 'sandbox'
      }
    );

    res.json({ success: true, templateId, environment: 'sandbox' });
  } catch (error: any) {
    console.error('[Projetos] Error applying template:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/projetos/templates/publish
 * Publish sandbox configuration to production
 * REFACTORED: Uses ModuleConfigurationManager.promoteFromSandbox for transactional safety
 */
router.post('/templates/publish', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).userId;

    if (!tenantId || !userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Use ModuleConfigurationManager for transactional promotion
    const manager = new (await import('../../base/module-configuration')).ModuleConfigurationManager(
      tenantId,
      'projects'
    );
    
    const result = await manager.promoteFromSandbox(userId);

    res.json({ 
      success: true, 
      environment: 'production', 
      entitiesPublished: result.entitiesPromoted,
      fieldsPublished: result.fieldsPromoted
    });
  } catch (error: any) {
    console.error('[Projetos] Error publishing template:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/projetos/entities
 * List custom entities for projects module
 */
router.get('/entities', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const environment = (req.query.env as string) || 'production';

    if (!tenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Query entities directly from database
    const entities = await db
      .select()
      .from(customEntities)
      .where(
        and(
          eq(customEntities.tenantId, tenantId),
          eq(customEntities.category, 'projects'),
          eq(customEntities.environment, environment)
        )
      );

    res.json({ entities });
  } catch (error: any) {
    console.error('[Projetos] Error fetching entities:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/projetos/entities/:id
 * Get single entity by ID
 */
router.get('/entities/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const { id } = req.params;
    const environment = (req.query.env as string) || 'production';

    if (!tenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const [entity] = await db
      .select()
      .from(customEntities)
      .where(
        and(
          eq(customEntities.id, id),
          eq(customEntities.tenantId, tenantId),
          eq(customEntities.category, 'projects'),
          eq(customEntities.environment, environment)
        )
      );

    if (!entity) {
      return res.status(404).json({ error: 'Entity not found' });
    }

    res.json({ entity });
  } catch (error: any) {
    console.error('[Projetos] Error fetching entity:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/modules/projects/entities
 * Create new custom entity (for Page Builder)
 */
router.post('/entities', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id;
    const { 
      entityKey, 
      displayName,
      displayNamePlural,
      description,
      icon,
      color,
      environment = 'sandbox',
      metadata
    } = req.body;

    if (!tenantId || !userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!entityKey || !displayName) {
      return res.status(400).json({ error: 'entityKey and displayName are required' });
    }

    // Create entity with proper schema fields
    const [entity] = await db
      .insert(customEntities)
      .values({
        tenantId,
        entityKey,
        displayName,
        displayNamePlural: displayNamePlural || displayName + 's',
        description,
        icon,
        color,
        environment,
        category: 'projects',
        createdBy: userId,
        metadata: metadata || {},
      })
      .returning();

    res.status(201).json({ 
      success: true,
      entity 
    });
  } catch (error: any) {
    console.error('[Projetos] Error creating entity:', error);
    res.status(500).json({ error: error.message });
  }
});

export { router as crudRoutes };
