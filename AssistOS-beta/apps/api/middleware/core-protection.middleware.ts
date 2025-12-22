import { Request, Response, NextFunction } from 'express';
import { coreProtectionService, AssetType } from '../services/core-protection.service';
import { getUserPermissions } from '../permissions';
import logger from '../logger';

export interface CoreProtectionRequest extends Request {
  coreAssetType?: AssetType;
  coreAssetId?: string;
}

export function requireCorePrivilege(assetType: AssetType) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.session.userId;
    const tenantId = req.session.activeTenantId;

    if (!userId || !tenantId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const userPerms = await getUserPermissions(userId, tenantId);
    if (!userPerms) {
      return res.status(403).json({ error: 'User permissions not found' });
    }

    if (userPerms.role !== 'owner') {
      logger.warn({
        userId,
        role: userPerms.role,
        assetType,
      }, '[CoreProtection] Non-owner attempted core modification');
      
      return res.status(403).json({
        error: 'Core modifications require owner role',
        suggestedAction: 'Contact your organization owner for assistance',
      });
    }

    logger.info({
      userId,
      assetType,
    }, '[CoreProtection] Owner privilege granted');

    next();
  };
}

export function validateCoreMutation(
  assetType: AssetType,
  action: 'create' | 'update' | 'delete' | 'clone',
  options?: {
    assetIdParam?: string; // Custom param name (e.g., 'moduleId', 'workflowId')
  }
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.session.userId;
    const tenantId = req.session.activeTenantId;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const userPerms = tenantId ? await getUserPermissions(userId, tenantId) : null;
    const role = userPerms?.role || 'user';

    // Try multiple sources for assetId
    const paramName = options?.assetIdParam || 'id';
    const assetId = req.params[paramName] || req.params.id || req.body.id || req.body.assetId;
    
    if (!assetId && action !== 'create') {
      return res.status(400).json({ error: 'Asset ID required' });
    }

    try {
      const validation = await coreProtectionService.validateMutation({
        assetType,
        assetId: assetId || 'new',
        action,
        userId,
        role,
        tenantId: tenantId || undefined,
        payload: req.body,
      });

      if (!validation.allowed) {
        logger.warn({
          assetType,
          assetId,
          action,
          userId,
          role,
          reason: validation.reason,
        }, '[CoreProtection] Mutation blocked');

        return res.status(403).json({
          error: validation.reason || 'Core protection violation',
          suggestedAction: validation.suggestedAction,
        });
      }

      next();
    } catch (error) {
      logger.error({
        error,
        assetType,
        assetId,
        action,
      }, '[CoreProtection] Validation error');
      
      return res.status(500).json({ 
        error: 'Failed to validate core mutation' 
      });
    }
  };
}

export function recordMutationMiddleware(
  assetType: AssetType,
  changeType: 'create' | 'update' | 'delete'
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.session.userId;
    const tenantId = req.session.activeTenantId || undefined;
    const environment = (req.query.environment as 'production' | 'sandbox') || 'production';

    if (!userId) {
      return next();
    }

    const assetId = req.params.id || res.locals.createdAssetId;
    const snapshot = res.locals.assetSnapshot || req.body;

    if (!assetId || !snapshot) {
      return next();
    }

    try {
      await coreProtectionService.recordMutation(
        assetType,
        assetId,
        changeType,
        userId,
        snapshot,
        {
          tenantId,
          environment,
          changeReason: req.body.changeReason,
        }
      );

      logger.info({
        assetType,
        assetId,
        changeType,
        userId,
      }, '[CoreProtection] Mutation recorded');
    } catch (error) {
      logger.error({
        error,
        assetType,
        assetId,
        changeType,
      }, '[CoreProtection] Failed to record mutation');
    }

    next();
  };
}
