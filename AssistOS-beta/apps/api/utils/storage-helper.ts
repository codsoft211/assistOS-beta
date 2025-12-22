// Migrated from AssistOS legacy - Phase 4.0
// Source: Pattern from /tmp/assistos-legacy/server/routes/conversations.ts

import { Request } from 'express';
import { db } from '../db';
import { eq, and, desc } from 'drizzle-orm';

/**
 * Storage Abstraction Helper
 * 
 * Provides tenant-scoped database access for routes.
 * Extracts tenantId from request session or header and ensures all queries are scoped.
 */

/**
 * Get tenant-scoped storage interface from request
 * 
 * @param req Express request with session
 * @returns Storage interface with tenant-scoped methods
 * @throws Error if no tenantId found in session
 */
export function getStorage(req: Request) {
  const tenantId = (req.session as any)?.activeTenantId || (req as any).tenantId;
  
  if (!tenantId) {
    throw new Error("TENANT_REQUIRED: No active tenant in session");
  }
  
  return {
    tenantId,
    
    /**
     * Get database instance (for custom queries)
     */
    get db() {
      return db;
    },
    
    /**
     * Helper to add tenantId filter to any query
     */
    scopeToTenant<T extends { tenantId: any }>(table: T) {
      return eq(table.tenantId, tenantId);
    },
  };
}

/**
 * Get storage for a specific tenant ID (used by services that already have tenantId)
 * 
 * @param tenantId Tenant ID to scope storage to
 * @returns Storage interface scoped to this tenant
 */
export function getTenantStorage(tenantId: string) {
  if (!tenantId) {
    throw new Error("TENANT_REQUIRED: tenantId parameter is required");
  }
  
  return {
    tenantId,
    
    get db() {
      return db;
    },
    
    scopeToTenant<T extends { tenantId: any }>(table: T) {
      return eq(table.tenantId, tenantId);
    },
  };
}

/**
 * Extract tenant ID from request without throwing error
 * 
 * @param req Express request
 * @returns tenantId or null if not found
 */
export function getTenantIdFromRequest(req: Request): string | null {
  return (req.session as any)?.activeTenantId || (req as any).tenantId || null;
}
