// Migrated from AssistOS legacy - Phase 4.1
// Source: /tmp/assistos-legacy/server/routes/tenants.ts

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import * as tenantService from '../services/tenant.service';
import { generateUniqueSlug } from '../utils/slug';

const router = Router();

const createTenantSchema = z.object({
  name: z.string().min(1).max(100),
  industry: z.string().optional(),
});

const updateEnvironmentSchema = z.object({
  environment: z.enum(['sandbox', 'production']),
});

router.post('/', async (req: Request, res: Response) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const data = createTenantSchema.parse(req.body);

    const baseSlug = data.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const uniqueSlug = await generateUniqueSlug(baseSlug);

    const tenant = await tenantService.createTenant({
      name: data.name,
      slug: uniqueSlug,
      industry: data.industry,
      ownerId: req.session.userId,
    });

    req.session.activeTenantId = tenant.id;

    res.status(201).json({
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      role: 'owner',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request data', details: error.errors });
    }
    console.error('Create tenant error:', error);
    res.status(500).json({ error: 'Failed to create organization' });
  }
});

router.get('/', async (req: Request, res: Response) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const userTenants = await tenantService.getUserTenants(req.session.userId);
    res.json(userTenants);
  } catch (error) {
    console.error('Get tenants error:', error);
    res.status(500).json({ error: 'Failed to get organizations' });
  }
});

router.patch('/:tenantId/environment', async (req: Request, res: Response) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const { tenantId } = req.params;
    const data = updateEnvironmentSchema.parse(req.body);

    // Check if user has permission to change environment (RBAC)
    const { canChange } = await tenantService.canUserChangeEnvironment(
      req.session.userId,
      tenantId
    );

    if (!canChange) {
      return res.status(403).json({
        error: 'Insufficient permissions. Only owners and configurators can change environment.',
      });
    }

    // Get current environment for audit logging
    const currentEnvironment = await tenantService.getUserCurrentEnvironment(
      req.session.userId,
      tenantId
    );

    // Update environment
    await tenantService.updateUserEnvironment(req.session.userId, tenantId, data.environment);

    // Audit log the environment change
    await tenantService.logEnvironmentChange({
      tenantId,
      userId: req.session.userId,
      fromEnvironment: currentEnvironment,
      toEnvironment: data.environment,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({
      success: true,
      environment: data.environment,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request data', details: error.errors });
    }
    console.error('Update environment error:', error);
    res.status(500).json({ error: 'Failed to update environment' });
  }
});

export default router;
