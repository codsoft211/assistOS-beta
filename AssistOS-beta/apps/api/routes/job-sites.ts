import { Router } from 'express';
import { db } from '../db';
import { jobSites, warehouses, insertJobSiteSchema } from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';

const router = Router();

/**
 * GET /api/job-sites
 * List all job sites for the tenant
 */
router.get('/', async (req, res) => {
  try {
    const tenantId = (req as any).tenantId || req.session?.activeTenantId;
    const environment = (req as any).environment || 'production';

    if (!tenantId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { search, type, includeInactive } = req.query;

    const conditions: any[] = [
      eq(jobSites.tenantId, tenantId),
      eq(jobSites.environment, environment),
    ];

    if (!includeInactive) {
      conditions.push(eq(jobSites.isActive, true));
    }

    if (type && typeof type === 'string') {
      conditions.push(eq(jobSites.siteType, type));
    }

    const sitesList = await db
      .select({
        id: jobSites.id,
        name: jobSites.name,
        code: jobSites.code,
        siteType: jobSites.siteType,
        address: jobSites.address,
        locality: jobSites.locality,
        city: jobSites.city,
        postalCode: jobSites.postalCode,
        country: jobSites.country,
        contactName: jobSites.contactName,
        contactPhone: jobSites.contactPhone,
        maxCapacity: jobSites.maxCapacity,
        hasKitchen: jobSites.hasKitchen,
        hasParking: jobSites.hasParking,
        warehouseId: jobSites.warehouseId,
        isActive: jobSites.isActive,
        isFavorite: jobSites.isFavorite,
      })
      .from(jobSites)
      .where(and(...conditions))
      .orderBy(desc(jobSites.isFavorite), jobSites.name);

    let filteredSites = sitesList;
    if (search && typeof search === 'string') {
      const searchLower = search.toLowerCase();
      filteredSites = sitesList.filter((s: any) => 
        s.name?.toLowerCase().includes(searchLower) ||
        s.city?.toLowerCase().includes(searchLower) ||
        s.address?.toLowerCase().includes(searchLower)
      );
    }

    res.json({ jobSites: filteredSites });
  } catch (error: any) {
    console.error('[Job Sites API] Error listing job sites:', error);
    res.status(500).json({ error: 'Failed to list job sites', details: error.message });
  }
});

/**
 * POST /api/job-sites
 * Create a new job site
 */
router.post('/', async (req, res) => {
  try {
    const tenantId = (req as any).tenantId || req.session?.activeTenantId;
    const environment = (req as any).environment || 'production';

    if (!tenantId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const parsed = insertJobSiteSchema.safeParse({
      ...req.body,
      tenantId,
      environment,
    });

    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid data', details: parsed.error.errors });
    }

    const [newSite] = await db.insert(jobSites).values(parsed.data).returning();

    res.status(201).json({ jobSite: newSite });
  } catch (error: any) {
    console.error('[Job Sites API] Error creating job site:', error);
    res.status(500).json({ error: 'Failed to create job site', details: error.message });
  }
});

/**
 * GET /api/job-sites/:id
 * Get a single job site by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const tenantId = (req as any).tenantId || req.session?.activeTenantId;
    const environment = (req as any).environment || 'production';
    const { id } = req.params;

    if (!tenantId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const [site] = await db
      .select()
      .from(jobSites)
      .where(and(
        eq(jobSites.id, id),
        eq(jobSites.tenantId, tenantId),
        eq(jobSites.environment, environment)
      ));

    if (!site) {
      return res.status(404).json({ error: 'Job site not found' });
    }

    res.json({ jobSite: site });
  } catch (error: any) {
    console.error('[Job Sites API] Error getting job site:', error);
    res.status(500).json({ error: 'Failed to get job site', details: error.message });
  }
});

/**
 * PATCH /api/job-sites/:id
 * Update a job site
 */
router.patch('/:id', async (req, res) => {
  try {
    const tenantId = (req as any).tenantId || req.session?.activeTenantId;
    const environment = (req as any).environment || 'production';
    const { id } = req.params;

    if (!tenantId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const [existing] = await db
      .select({ id: jobSites.id })
      .from(jobSites)
      .where(and(
        eq(jobSites.id, id),
        eq(jobSites.tenantId, tenantId),
        eq(jobSites.environment, environment)
      ));

    if (!existing) {
      return res.status(404).json({ error: 'Job site not found' });
    }

    const [updated] = await db
      .update(jobSites)
      .set({
        ...req.body,
        updatedAt: new Date(),
      })
      .where(eq(jobSites.id, id))
      .returning();

    res.json({ jobSite: updated });
  } catch (error: any) {
    console.error('[Job Sites API] Error updating job site:', error);
    res.status(500).json({ error: 'Failed to update job site', details: error.message });
  }
});

/**
 * DELETE /api/job-sites/:id
 * Soft delete a job site (set isActive = false)
 */
router.delete('/:id', async (req, res) => {
  try {
    const tenantId = (req as any).tenantId || req.session?.activeTenantId;
    const environment = (req as any).environment || 'production';
    const { id } = req.params;

    if (!tenantId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const [updated] = await db
      .update(jobSites)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(
        eq(jobSites.id, id),
        eq(jobSites.tenantId, tenantId),
        eq(jobSites.environment, environment)
      ))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: 'Job site not found' });
    }

    res.json({ success: true, jobSite: updated });
  } catch (error: any) {
    console.error('[Job Sites API] Error deleting job site:', error);
    res.status(500).json({ error: 'Failed to delete job site', details: error.message });
  }
});

/**
 * GET /api/job-sites/warehouses/available
 * List warehouses available to link with job sites
 */
router.get('/warehouses/available', async (req, res) => {
  try {
    const tenantId = (req as any).tenantId || req.session?.activeTenantId;
    const environment = (req as any).environment || 'production';

    if (!tenantId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const warehousesList = await db
      .select({
        id: warehouses.id,
        name: warehouses.name,
        code: warehouses.code,
        type: warehouses.type,
        city: warehouses.city,
      })
      .from(warehouses)
      .where(and(
        eq(warehouses.tenantId, tenantId),
        eq(warehouses.environment, environment),
        eq(warehouses.isActive, true)
      ))
      .orderBy(warehouses.name);

    res.json({ warehouses: warehousesList });
  } catch (error: any) {
    console.error('[Job Sites API] Error listing warehouses:', error);
    res.status(500).json({ error: 'Failed to list warehouses', details: error.message });
  }
});

export default router;
