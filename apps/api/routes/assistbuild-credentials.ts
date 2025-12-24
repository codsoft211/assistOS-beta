import { Router } from 'express';
import { z } from 'zod';
import { CredentialService } from '../services/assistbuild/index.js';
import logger from '../logger.js';

const router = Router();

const createCredentialSchema = z.object({
    name: z.string().min(1).max(255),
    type: z.string().min(1).max(50),
    data: z.record(z.any()), // Raw credential data (to be encrypted)
});

/**
 * GET /api/assistbuild/credentials
 * List all credentials for the current tenant
 */
router.get('/credentials', async (req, res) => {
    try {
        const tenantId = (req as any).tenantId;
        const { type } = req.query;

        if (!tenantId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const credentials = await CredentialService.list(tenantId, type as string);
        res.json(credentials);
    } catch (error) {
        logger.error({ error }, '[Credential Routes] Failed to list credentials');
        res.status(500).json({ error: 'Failed to list credentials' });
    }
});

/**
 * POST /api/assistbuild/credentials
 * Create a new encrypted credential
 */
router.post('/credentials', async (req, res) => {
    try {
        const tenantId = (req as any).tenantId;
        if (!tenantId) return res.status(401).json({ error: 'Unauthorized' });

        const parsed = createCredentialSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: 'Invalid request', details: parsed.error.errors });
        }

        const credential = await CredentialService.create(tenantId, parsed.data);
        res.status(201).json(credential);
    } catch (error) {
        logger.error({ error }, '[Credential Routes] Failed to create credential');
        res.status(500).json({ error: 'Failed to create credential' });
    }
});

/**
 * DELETE /api/assistbuild/credentials/:id
 * Delete a specific credential
 */
router.delete('/credentials/:id', async (req, res) => {
    try {
        const tenantId = (req as any).tenantId;
        const { id } = req.params;

        if (!tenantId) return res.status(401).json({ error: 'Unauthorized' });

        const result = await CredentialService.delete(id, tenantId);
        if (!result) {
            return res.status(404).json({ error: 'Credential not found' });
        }

        res.json({ success: true, message: 'Credential deleted' });
    } catch (error) {
        logger.error({ error }, '[Credential Routes] Failed to delete credential');
        res.status(500).json({ error: 'Failed to delete credential' });
    }
});

export default router;
