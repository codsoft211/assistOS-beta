import { Router } from 'express';
import { db } from '../../../../apps/api/db';
import { customEntityRecords, customEntities, customFields } from '../../../../shared/schema';
import { eq, and, ilike, or, sql } from 'drizzle-orm';

const router = Router();

router.get('/entities/:entityKey/records', async (req, res) => {
  try {
    const { entityKey } = req.params;
    const { search, limit = 50, offset = 0 } = req.query;
    const tenantId = req.user?.tenantId;
    const environment = (req.query.environment as string) || 'production';

    if (!tenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const entity = await db.query.customEntities.findFirst({
      where: and(
        eq(customEntities.tenantId, tenantId),
        eq(customEntities.entityKey, entityKey),
        eq(customEntities.environment, environment),
        eq(customEntities.isActive, true)
      ),
    });

    if (!entity) {
      return res.status(404).json({ error: 'Entity not found' });
    }

    let query = db
      .select()
      .from(customEntityRecords)
      .where(
        and(
          eq(customEntityRecords.tenantId, tenantId),
          eq(customEntityRecords.entityId, entity.id),
          eq(customEntityRecords.environment, environment)
        )
      )
      .limit(Number(limit))
      .offset(Number(offset));

    if (search) {
      query = query.where(
        sql`${customEntityRecords.data}::text ILIKE ${'%' + search + '%'}`
      );
    }

    const records = await query;

    res.json({
      records: records.map(r => ({
        id: r.id,
        ...r.data as any,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
      total: records.length,
      limit: Number(limit),
      offset: Number(offset),
    });
  } catch (error: any) {
    console.error('[EntityRecords] Error fetching records:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/entities/:entityKey/records', async (req, res) => {
  try {
    const { entityKey } = req.params;
    const { data } = req.body;
    const tenantId = req.user?.tenantId;
    const userId = req.user?.id;
    const environment = (req.body.environment as string) || 'sandbox';

    if (!tenantId || !userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const entity = await db.query.customEntities.findFirst({
      where: and(
        eq(customEntities.tenantId, tenantId),
        eq(customEntities.entityKey, entityKey),
        eq(customEntities.environment, environment),
        eq(customEntities.isActive, true)
      ),
    });

    if (!entity) {
      return res.status(404).json({ error: 'Entity not found' });
    }

    const [record] = await db
      .insert(customEntityRecords)
      .values({
        tenantId,
        environment,
        entityId: entity.id,
        data: data,
        createdBy: userId,
        updatedBy: userId,
      })
      .returning();

    res.status(201).json({ record });
  } catch (error: any) {
    console.error('[EntityRecords] Error creating record:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
