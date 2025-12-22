// Migrated from AssistOS legacy - Phase 2
import { db } from "../db";
import { 
  userProfiles, 
  tenantContext, 
  conversationInsights
} from "../../../shared/schema";
import { eq, and, desc, count, sql } from "drizzle-orm";
import { cache } from "./cache.service";
import type { Environment } from "../../../shared/types/environment";

/**
 * Request Context - Available on all API requests
 * 
 * This context is injected by middleware and contains:
 * - tenantId: Current tenant identifier
 * - environment: Current environment (production/sandbox)
 * - userId: Authenticated user ID (if available)
 * 
 * @example
 * ```typescript
 * async function handler(req: Request, res: Response) {
 *   const { tenantId, environment, userId } = req;
 *   await someService.doWork(tenantId, environment);
 * }
 * ```
 */
export interface RequestContext {
  tenantId: string;
  environment: Environment;
  userId?: string;
}

/**
 * Worker Job Context - Passed to all worker jobs
 * 
 * This context is included in every job payload and ensures:
 * - Environment isolation in async processing
 * - Type-safe access to tenant and environment
 * - Audit trail with userId
 * 
 * @example
 * ```typescript
 * export interface MyJobPayload extends BaseJobPayload {
 *   customData: string;
 * }
 * 
 * async function processJob(job: Job<MyJobPayload>) {
 *   const { tenantId, environment, userId } = job.data;
 *   // Job respects environment boundaries
 * }
 * ```
 */
export interface WorkerJobContext {
  tenantId: string;
  environment: Environment;
  userId?: string;
  jobId?: string;
}

/**
 * Base Job Payload - Extend this for all worker jobs
 * 
 * All worker jobs should extend this interface to ensure
 * consistent context propagation.
 */
export interface BaseJobPayload {
  tenantId: string;
  environment: Environment;
  userId?: string;
}

/**
 * User Context - Session and operational data
 * 
 * This is a richer context object used for agent orchestration
 * and user session management. Different from RequestContext.
 */
export interface UserContext {
  profile: {
    role?: string | null;
    department?: string | null;
    seniority?: string | null;
    preferences?: any;
  };
  business: {
    industry?: string;
    employeeCount?: number;
    revenue?: string;
    painPoints?: string[];
  };
  activeModules: string[];
  recentInsights: string[];
  configurationState: any;
  operationalData?: {
    projects: {
      total: number;
      byStatus: Record<string, number>;
      recent: Array<{id: string; name: string; status: string}>;
    };
    leads: {
      total: number;
      byStatus: Record<string, number>;
    };
    tasks: {
      total: number;
      pending: number;
      overdue: number;
    };
  };
}

export class ContextService {
  /**
   * Invalidate all cache entries for a tenant
   */
  private invalidateTenantCache(tenantId: string) {
    // Strategy: Track all cache keys for this tenant
    // Since we use simple in-memory cache, iterate and delete matching keys
    
    const keysToDelete: string[] = [];
    
    // Scan cache for tenant keys
    for (const key of cache.keys()) {
      if (key.includes(`:${tenantId}`)) {
        keysToDelete.push(key);
      }
    }
    
    // Delete all
    for (const key of keysToDelete) {
      cache.delete(key);
    }
    
    console.log(`[Context] Invalidated ${keysToDelete.length} cache entries for tenant ${tenantId}`);
  }

  /**
   * GET /api/context/session
   * Carrega contexto completo do utilizador
   */
  async getSession(userId: string, tenantId: string): Promise<UserContext> {
    const cacheKey = `context:session:${userId}:${tenantId}`;
    
    // Try cache first
    const cached = cache.get(cacheKey);
    if (cached) {
      console.log("[Context] Cache HIT:", cacheKey);
      return cached;
    }
    
    console.log("[Context] Cache MISS:", cacheKey);
    
    // 1. Get user profile
    const profile = await db.query.userProfiles.findFirst({
      where: and(
        eq(userProfiles.userId, userId),
        eq(userProfiles.tenantId, tenantId)
      ),
    });

    // 2. Get tenant context
    const tenant = await db.query.tenantContext.findFirst({
      where: eq(tenantContext.tenantId, tenantId),
    });

    // 3. Get recent insights (last 10) - now user-scoped
    const insights = await db.query.conversationInsights.findMany({
      where: eq(conversationInsights.userId, userId),
      orderBy: [desc(conversationInsights.createdAt)],
      limit: 10,
    });

    // 4. Get operational data with SQL aggregates for better performance
    // NOTE: Operational data disabled - missing tables (pricingProjects, commercialLeads, tasks) from clean schema
    let operationalData = undefined;

    const context = {
      profile: {
        role: profile?.role,
        department: profile?.department,
        seniority: profile?.seniority,
        preferences: profile?.preferences,
      },
      business: (tenant?.businessAttributes as any) || {},
      activeModules: (tenant?.activeModules as string[]) || [],
      recentInsights: insights.map((i) => i.insight),
      configurationState: tenant?.configurationState || {},
      operationalData,
    };
    
    // Cache for 300s (5 minutes) - shorter cache because operational data changes frequently
    cache.set(cacheKey, context, 300);
    console.log("[Context] Cache MISS, setting with TTL 300s");
    
    return context;
  }

  /**
   * PATCH /api/context/profile
   * Atualiza perfil do utilizador
   */
  async updateProfile(
    userId: string,
    tenantId: string,
    updates: Partial<{
      role: string;
      department: string;
      seniority: string;
      preferences: any;
    }>
  ) {
    const existing = await db.query.userProfiles.findFirst({
      where: and(
        eq(userProfiles.userId, userId),
        eq(userProfiles.tenantId, tenantId)
      ),
    });

    let result;
    if (existing) {
      result = await db
        .update(userProfiles)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(userProfiles.id, existing.id))
        .returning();
    } else {
      result = await db.insert(userProfiles).values({
        userId,
        tenantId,
        ...updates,
      }).returning();
    }
    
    // Invalidate cache
    cache.delete(`context:session:${userId}:${tenantId}`);
    
    return result;
  }

  /**
   * PATCH /api/context/business
   * Atualiza contexto da empresa
   */
  async updateBusiness(
    tenantId: string,
    updates: {
      businessAttributes?: any;
      activeModules?: string[];
      configurationState?: any;
    }
  ) {
    const existing = await db.query.tenantContext.findFirst({
      where: eq(tenantContext.tenantId, tenantId),
    });

    let result;
    if (existing) {
      result = await db
        .update(tenantContext)
        .set({
          ...updates,
          version: (existing.version || 0) + 1,
          updatedAt: new Date(),
        })
        .where(eq(tenantContext.id, existing.id))
        .returning();
    } else {
      result = await db.insert(tenantContext).values({
        tenantId,
        ...updates,
      }).returning();
    }
    
    // Invalidate ALL users in this tenant
    this.invalidateTenantCache(tenantId);
    
    return result;
  }

  /**
   * POST /api/context/insights
   * Adiciona novo insight
   */
  async addInsight(
    tenantId: string,
    insight: {
      userId?: string;
      agentType: string;
      insight: string;
      category?: string;
      confidence?: number;
      metadata?: any;
    }
  ) {
    return await db.insert(conversationInsights).values({
      tenantId,
      ...insight,
    }).returning();
  }

  /**
   * POST /api/context/handoff
   * Regista transição entre agents usando existing agentHandoffs table
   */
  async createHandoff(
    tenantId: string,
    userId: string,
    handoff: {
      conversationId: string;
      fromAgent: string;
      toAgent: string;
      summary: string;
      contextSnapshot?: any;
    }
  ) {
    console.log("[Context Service] Handoff tracking not yet implemented - using insights instead");
    
    // Track as insight for now since we're using the existing agentHandoffs table
    // which requires specialized agent IDs
    await this.addInsight(tenantId, {
      userId,
      agentType: handoff.toAgent,
      insight: `Handoff from ${handoff.fromAgent}: ${handoff.summary}`,
      category: "handoff",
      metadata: {
        fromAgent: handoff.fromAgent,
        toAgent: handoff.toAgent,
        contextSnapshot: handoff.contextSnapshot,
      },
    });
    
    return { success: true };
  }
}

export const contextService = new ContextService();
