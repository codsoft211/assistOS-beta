import express from 'express';
import { actionTracker } from '../../../packages/ai/services/action-tracker';

const router = express.Router();

router.get('/recent', async (req, res) => {
  try {
    const user = req.user as any;
    if (!user || !user.activeTenantId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    const { days = '30' } = req.query;
    const actions = await actionTracker.getRecentActions(
      user.activeTenantId,
      user.id,
      parseInt(days as string)
    );

    res.json(actions);
  } catch (error) {
    console.error('[Actions] Erro ao buscar ações recentes:', error);
    res.status(500).json({ error: 'Falha ao buscar ações' });
  }
});

router.get('/session/:sessionId', async (req, res) => {
  try {
    const user = req.user as any;
    if (!user || !user.activeTenantId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    const { sessionId } = req.params;
    const actions = await actionTracker.getActionsBySession(
      user.activeTenantId,
      user.id,
      sessionId
    );

    res.json(actions);
  } catch (error) {
    console.error('[Actions] Erro ao buscar ações da sessão:', error);
    res.status(500).json({ error: 'Falha ao buscar ações da sessão' });
  }
});

export default router;
