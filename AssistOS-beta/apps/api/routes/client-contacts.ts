import { Router } from 'express';
import { db } from '../db';
import { clientContacts, clients, insertClientContactSchema } from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';

const router = Router();

/**
 * GET /api/clients/:clientId/contacts
 * List all contacts for a specific client
 */
router.get('/:clientId/contacts', async (req, res) => {
  try {
    const tenantId = (req as any).tenantId || req.session?.activeTenantId;
    const environment = (req as any).environment || 'production';
    const { clientId } = req.params;

    if (!tenantId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const [client] = await db
      .select()
      .from(clients)
      .where(and(
        eq(clients.id, clientId),
        eq(clients.tenantId, tenantId)
      ));

    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const contactsList = await db
      .select()
      .from(clientContacts)
      .where(and(
        eq(clientContacts.clientId, clientId),
        eq(clientContacts.tenantId, tenantId),
        eq(clientContacts.environment, environment)
      ))
      .orderBy(desc(clientContacts.isPrimary), clientContacts.lastName, clientContacts.firstName);

    res.json({ contacts: contactsList });
  } catch (error: any) {
    console.error('[Client Contacts API] Error listing contacts:', error);
    res.status(500).json({ error: 'Failed to list contacts', details: error.message });
  }
});

/**
 * POST /api/clients/:clientId/contacts
 * Create a new contact for a client
 */
router.post('/:clientId/contacts', async (req, res) => {
  try {
    const tenantId = (req as any).tenantId || req.session?.activeTenantId;
    const environment = (req as any).environment || 'production';
    const userId = req.session?.userId;
    const { clientId } = req.params;

    if (!tenantId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const [client] = await db
      .select()
      .from(clients)
      .where(and(
        eq(clients.id, clientId),
        eq(clients.tenantId, tenantId)
      ));

    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const { firstName, lastName, ...rest } = req.body;
    const fullName = [firstName, lastName].filter(Boolean).join(' ').trim() || null;

    const parsed = insertClientContactSchema.safeParse({
      ...rest,
      firstName,
      lastName,
      fullName,
      clientId,
      tenantId,
      environment,
      createdBy: userId,
    });

    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid data', details: parsed.error.errors });
    }

    if (parsed.data.isPrimary) {
      await db
        .update(clientContacts)
        .set({ isPrimary: false, updatedAt: new Date() })
        .where(and(
          eq(clientContacts.clientId, clientId),
          eq(clientContacts.tenantId, tenantId),
          eq(clientContacts.isPrimary, true)
        ));
    }

    const [newContact] = await db.insert(clientContacts).values(parsed.data).returning();

    res.status(201).json({ contact: newContact });
  } catch (error: any) {
    console.error('[Client Contacts API] Error creating contact:', error);
    res.status(500).json({ error: 'Failed to create contact', details: error.message });
  }
});

/**
 * GET /api/clients/:clientId/contacts/:id
 * Get a single contact by ID
 */
router.get('/:clientId/contacts/:id', async (req, res) => {
  try {
    const tenantId = (req as any).tenantId || req.session?.activeTenantId;
    const environment = (req as any).environment || 'production';
    const { clientId, id } = req.params;

    if (!tenantId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const [contact] = await db
      .select()
      .from(clientContacts)
      .where(and(
        eq(clientContacts.id, id),
        eq(clientContacts.clientId, clientId),
        eq(clientContacts.tenantId, tenantId),
        eq(clientContacts.environment, environment)
      ));

    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    res.json({ contact });
  } catch (error: any) {
    console.error('[Client Contacts API] Error fetching contact:', error);
    res.status(500).json({ error: 'Failed to fetch contact', details: error.message });
  }
});

/**
 * PATCH /api/clients/:clientId/contacts/:id
 * Update a contact
 */
router.patch('/:clientId/contacts/:id', async (req, res) => {
  try {
    const tenantId = (req as any).tenantId || req.session?.activeTenantId;
    const environment = (req as any).environment || 'production';
    const { clientId, id } = req.params;

    if (!tenantId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const [existing] = await db
      .select()
      .from(clientContacts)
      .where(and(
        eq(clientContacts.id, id),
        eq(clientContacts.clientId, clientId),
        eq(clientContacts.tenantId, tenantId),
        eq(clientContacts.environment, environment)
      ));

    if (!existing) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    const updates: any = { ...req.body, updatedAt: new Date() };
    
    if (updates.firstName !== undefined || updates.lastName !== undefined) {
      const firstName = updates.firstName ?? existing.firstName;
      const lastName = updates.lastName ?? existing.lastName;
      updates.fullName = [firstName, lastName].filter(Boolean).join(' ').trim() || null;
    }

    if (updates.isPrimary === true) {
      await db
        .update(clientContacts)
        .set({ isPrimary: false, updatedAt: new Date() })
        .where(and(
          eq(clientContacts.clientId, clientId),
          eq(clientContacts.tenantId, tenantId),
          eq(clientContacts.isPrimary, true)
        ));
    }

    const [updated] = await db
      .update(clientContacts)
      .set(updates)
      .where(and(
        eq(clientContacts.id, id),
        eq(clientContacts.clientId, clientId),
        eq(clientContacts.tenantId, tenantId),
        eq(clientContacts.environment, environment)
      ))
      .returning();

    res.json({ contact: updated });
  } catch (error: any) {
    console.error('[Client Contacts API] Error updating contact:', error);
    res.status(500).json({ error: 'Failed to update contact', details: error.message });
  }
});

/**
 * DELETE /api/clients/:clientId/contacts/:id
 * Delete a contact
 */
router.delete('/:clientId/contacts/:id', async (req, res) => {
  try {
    const tenantId = (req as any).tenantId || req.session?.activeTenantId;
    const environment = (req as any).environment || 'production';
    const { clientId, id } = req.params;

    if (!tenantId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const [existing] = await db
      .select()
      .from(clientContacts)
      .where(and(
        eq(clientContacts.id, id),
        eq(clientContacts.clientId, clientId),
        eq(clientContacts.tenantId, tenantId),
        eq(clientContacts.environment, environment)
      ));

    if (!existing) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    await db
      .delete(clientContacts)
      .where(and(
        eq(clientContacts.id, id),
        eq(clientContacts.clientId, clientId),
        eq(clientContacts.tenantId, tenantId),
        eq(clientContacts.environment, environment)
      ));

    res.json({ success: true, message: 'Contact deleted' });
  } catch (error: any) {
    console.error('[Client Contacts API] Error deleting contact:', error);
    res.status(500).json({ error: 'Failed to delete contact', details: error.message });
  }
});

/**
 * PATCH /api/clients/:clientId/contacts/:id/set-primary
 * Set a contact as primary
 */
router.patch('/:clientId/contacts/:id/set-primary', async (req, res) => {
  try {
    const tenantId = (req as any).tenantId || req.session?.activeTenantId;
    const environment = (req as any).environment || 'production';
    const { clientId, id } = req.params;

    if (!tenantId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const [existing] = await db
      .select()
      .from(clientContacts)
      .where(and(
        eq(clientContacts.id, id),
        eq(clientContacts.clientId, clientId),
        eq(clientContacts.tenantId, tenantId),
        eq(clientContacts.environment, environment)
      ));

    if (!existing) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    await db
      .update(clientContacts)
      .set({ isPrimary: false, updatedAt: new Date() })
      .where(and(
        eq(clientContacts.clientId, clientId),
        eq(clientContacts.tenantId, tenantId),
        eq(clientContacts.isPrimary, true)
      ));

    const [updated] = await db
      .update(clientContacts)
      .set({ isPrimary: true, updatedAt: new Date() })
      .where(and(
        eq(clientContacts.id, id),
        eq(clientContacts.clientId, clientId),
        eq(clientContacts.tenantId, tenantId),
        eq(clientContacts.environment, environment)
      ))
      .returning();

    res.json({ contact: updated });
  } catch (error: any) {
    console.error('[Client Contacts API] Error setting primary contact:', error);
    res.status(500).json({ error: 'Failed to set primary contact', details: error.message });
  }
});

export default router;
