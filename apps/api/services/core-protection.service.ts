import { db } from '../db';
import { coreAssets, coreAssetVersions, users } from '../../../shared/schema';
import { eq, and, desc, max } from 'drizzle-orm';
import logger from '../logger';

export type AssetType = 'module' | 'workflow_template' | 'tool_manifest' | 'schema' | 'ai_parameter';
export type MutabilityPolicy = 'immutable' | 'clone_only' | 'mutable';
export type ChangeType = 'create' | 'update' | 'delete' | 'clone' | 'rollback';

export interface MutationRequest {
  assetType: AssetType;
  assetId: string;
  action: 'create' | 'update' | 'delete' | 'clone';
  tenantId?: string;
  userId: string;
  role: string;
  payload?: Record<string, any>;
  environment?: 'production' | 'sandbox';
}

export interface ValidationResult {
  allowed: boolean;
  reason?: string;
  suggestedAction?: string;
}

export class CoreProtectionService {
  
  async validateMutation(request: MutationRequest): Promise<ValidationResult> {
    const { assetType, assetId, action, tenantId, role, userId } = request;
    
    logger.info({ 
      assetType, 
      assetId, 
      action, 
      tenantId, 
      role, 
      userId 
    }, '[CoreProtection] Validating mutation');

    const asset = await this.getCoreAsset(assetType, assetId);

    if (action === 'create') {
      return this.validateCreate(request, asset);
    }

    if (!asset) {
      return {
        allowed: true,
        reason: 'Asset not registered as core, allowing mutation',
      };
    }

    if (asset.isCore && asset.mutabilityPolicy === 'immutable') {
      if (action === 'delete' || action === 'update') {
        return {
          allowed: false,
          reason: `Asset is core and immutable. Immutable assets cannot be modified or deleted.`,
          suggestedAction: action === 'update' 
            ? `Use clone/fork to create a tenant-specific version` 
            : `Core immutable assets cannot be deleted`,
        };
      }
    }

    if (asset.isCore && asset.mutabilityPolicy === 'clone_only') {
      if (action === 'update' || action === 'delete') {
        return {
          allowed: false,
          reason: 'Core asset allows only cloning',
          suggestedAction: 'Use clone/fork to create a tenant-specific version',
        };
      }
    }

    if (action === 'clone') {
      return this.validateClone(request, asset);
    }

    logger.info({ assetType, assetId, action }, '[CoreProtection] Mutation allowed');
    return { allowed: true };
  }

  private async validateCreate(
    request: MutationRequest, 
    existingAsset: any | null
  ): Promise<ValidationResult> {
    if (existingAsset) {
      return {
        allowed: false,
        reason: 'Asset already exists',
      };
    }

    return { allowed: true };
  }

  private async validateClone(
    request: MutationRequest,
    coreAsset: any | null
  ): Promise<ValidationResult> {
    if (!coreAsset) {
      return {
        allowed: false,
        reason: 'Cannot clone - source asset not found',
      };
    }

    if (!request.tenantId) {
      return {
        allowed: false,
        reason: 'Cloning requires a target tenantId',
      };
    }

    return {
      allowed: true,
      reason: 'Clone allowed - will create tenant-specific fork',
    };
  }

  async assertCoreInvariant(
    assetType: AssetType,
    assetId: string,
    action: 'create' | 'update' | 'delete' | 'clone',
    userId: string,
    role: string,
    tenantId?: string
  ): Promise<void> {
    const validation = await this.validateMutation({
      assetType,
      assetId,
      action,
      userId,
      role,
      tenantId,
    });

    if (!validation.allowed) {
      const error = new Error(validation.reason || 'Core protection violation');
      logger.error({
        assetType,
        assetId,
        action,
        userId,
        role,
        reason: validation.reason,
        suggestedAction: validation.suggestedAction,
      }, '[CoreProtection] Mutation blocked');
      throw error;
    }
  }

  async recordMutation(
    assetType: AssetType,
    assetId: string,
    changeType: ChangeType,
    userId: string,
    snapshot: Record<string, any>,
    options?: {
      tenantId?: string;
      environment?: 'production' | 'sandbox';
      changeReason?: string;
      rollbackFromVersion?: number;
    }
  ): Promise<string> {
    const coreAsset = await this.ensureCoreAssetExists(assetType, assetId, {
      isCore: false, 
      ownerService: options?.tenantId ? 'tenant' : 'platform',
      mutabilityPolicy: 'mutable',
    });

    const latestVersion = await db
      .select({ version: coreAssetVersions.version })
      .from(coreAssetVersions)
      .where(eq(coreAssetVersions.assetId, coreAsset.id))
      .orderBy(desc(coreAssetVersions.version))
      .limit(1);

    const newVersion = (latestVersion[0]?.version || 0) + 1;

    const [versionRecord] = await db
      .insert(coreAssetVersions)
      .values({
        assetId: coreAsset.id,
        tenantId: options?.tenantId || null,
        environment: options?.environment || 'production',
        version: newVersion,
        snapshot,
        changeType,
        changedBy: userId,
        changeReason: options?.changeReason,
        rollbackFromVersion: options?.rollbackFromVersion,
      })
      .returning();

    logger.info({
      assetType,
      assetId,
      changeType,
      version: newVersion,
      userId,
    }, '[CoreProtection] Mutation recorded');

    return versionRecord.id;
  }

  async registerCoreAsset(
    assetType: AssetType,
    assetId: string,
    options: {
      isCore: boolean;
      mutabilityPolicy: MutabilityPolicy;
      ownerService: 'platform' | 'tenant';
      parentAssetId?: string;
      metadata?: Record<string, any>;
    }
  ): Promise<void> {
    const existing = await this.getCoreAsset(assetType, assetId);
    
    if (existing) {
      logger.warn({ assetType, assetId }, '[CoreProtection] Asset already registered');
      return;
    }

    await db.insert(coreAssets).values({
      assetType,
      assetId,
      isCore: options.isCore,
      mutabilityPolicy: options.mutabilityPolicy,
      ownerService: options.ownerService,
      parentAssetId: options.parentAssetId,
      metadata: options.metadata,
    });

    logger.info({ 
      assetType, 
      assetId, 
      isCore: options.isCore,
      mutabilityPolicy: options.mutabilityPolicy,
    }, '[CoreProtection] Core asset registered');
  }

  private async ensureCoreAssetExists(
    assetType: AssetType,
    assetId: string,
    defaults: {
      isCore: boolean;
      ownerService: 'platform' | 'tenant';
      mutabilityPolicy: MutabilityPolicy;
    }
  ) {
    let asset = await this.getCoreAsset(assetType, assetId);
    
    if (!asset) {
      await this.registerCoreAsset(assetType, assetId, defaults);
      asset = await this.getCoreAsset(assetType, assetId);
    }
    
    return asset!;
  }

  private async getCoreAsset(assetType: AssetType, assetId: string) {
    const [asset] = await db
      .select()
      .from(coreAssets)
      .where(
        and(
          eq(coreAssets.assetType, assetType),
          eq(coreAssets.assetId, assetId)
        )
      )
      .limit(1);
    
    return asset || null;
  }

  async listCoreAssets(filters?: {
    assetType?: AssetType;
    isCore?: boolean;
    ownerService?: 'platform' | 'tenant';
  }) {
    let query = db.select().from(coreAssets);

    const conditions: any[] = [];
    if (filters?.assetType) {
      conditions.push(eq(coreAssets.assetType, filters.assetType));
    }
    if (filters?.isCore !== undefined) {
      conditions.push(eq(coreAssets.isCore, filters.isCore));
    }
    if (filters?.ownerService) {
      conditions.push(eq(coreAssets.ownerService, filters.ownerService));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    return await query;
  }

  async getAssetHistory(assetType: AssetType, assetId: string, limit: number = 10) {
    const asset = await this.getCoreAsset(assetType, assetId);
    
    if (!asset) {
      return [];
    }

    return await db
      .select()
      .from(coreAssetVersions)
      .where(eq(coreAssetVersions.assetId, asset.id))
      .orderBy(coreAssetVersions.version)
      .limit(limit);
  }
}

export const coreProtectionService = new CoreProtectionService();
