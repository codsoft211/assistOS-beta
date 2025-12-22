/**
 * Module Page Service
 * 
 * Manages hierarchical page structure for modules:
 * - Tree building for nested navigation
 * - CRUD operations with realtime updates
 * - Batch reordering with cycle detection
 */

import { db } from '../db';
import { modulePages, insertModulePageSchema, updateModulePageSchema, type InsertModulePage, type SelectModulePage, type UpdateModulePage } from '../../../shared/schema';
import { eq, and } from 'drizzle-orm';
import { realtimeEvents } from './event-emitter';
import logger from '../logger';

/**
 * Module page with nested children for tree display
 */
export interface ModulePageTree extends SelectModulePage {
  children: ModulePageTree[];
}

/**
 * Get nested tree structure of pages for a module
 * Filtered by tenant and environment
 */
export async function getModulePageTree(
  tenantId: string,
  moduleId: string,
  environment: 'production' | 'sandbox' = 'production'
): Promise<ModulePageTree[]> {
  // Fetch all pages for module
  const pages = await db
    .select()
    .from(modulePages)
    .where(
      and(
        eq(modulePages.tenantId, tenantId),
        eq(modulePages.moduleId, moduleId),
        eq(modulePages.environment, environment)
      )
    )
    .orderBy(modulePages.displayOrder);

  // Build tree structure
  const pageMap = new Map<string, ModulePageTree>();
  const rootPages: ModulePageTree[] = [];

  // First pass: create all nodes
  for (const page of pages) {
    pageMap.set(String(page.id), { ...page, children: [] });
  }

  // Second pass: link children to parents
  for (const page of pages) {
    const node = pageMap.get(String(page.id))!;
    if (page.parentPageId) {
      const parent = pageMap.get(String(page.parentPageId));
      if (parent) {
        parent.children.push(node);
      } else {
        // Parent not found - treat as root
        rootPages.push(node);
      }
    } else {
      // No parent - root page
      rootPages.push(node);
    }
  }

  return rootPages;
}

/**
 * Create a new module page
 * Emits realtime event for UI updates
 */
export async function createModulePage(data: InsertModulePage): Promise<SelectModulePage> {
  try {
    // Validate parent exists if parentPageId is provided
    if (data.parentPageId) {
      const parent = await db
        .select()
        .from(modulePages)
        .where(eq(modulePages.id, data.parentPageId))
        .limit(1);

      if (!parent[0]) {
        throw new Error('Parent page not found');
      }

      // Ensure parent is in same tenant/module/environment
      if (
        parent[0].tenantId !== data.tenantId ||
        parent[0].moduleId !== data.moduleId ||
        parent[0].environment !== data.environment
      ) {
        throw new Error('Parent page must be in same tenant/module/environment');
      }
    }

    // Create page
    const result = await db
      .insert(modulePages)
      .values(data)
      .returning();

    const created = result[0];
    if (!created) {
      throw new Error('Failed to create module page');
    }

    logger.info({
      msg: 'Module page created',
      pageId: created.id,
      moduleId: created.moduleId,
      tenantId: created.tenantId,
    });

    // Emit realtime event
    realtimeEvents.emitForTenant('modulePages.updated', data.tenantId, {
      moduleId: data.moduleId,
      action: 'created',
      pageId: created.id,
    });

    return created;
  } catch (error) {
    logger.error({ msg: 'Failed to create module page', error, data });
    throw error;
  }
}

/**
 * Update module page properties
 * Emits realtime event for UI updates
 * SECURITY: Verifies page belongs to tenant before update
 */
export async function updateModulePage(
  pageId: string,
  updates: Partial<InsertModulePage>,
  tenantId: string
): Promise<SelectModulePage> {
  try {
    // Get existing page - MUST verify tenant ownership
    const existing = await db
      .select()
      .from(modulePages)
      .where(
        and(
          eq(modulePages.id, pageId),
          eq(modulePages.tenantId, tenantId)
        )
      )
      .limit(1);

    if (!existing[0]) {
      throw new Error('Page not found or access denied');
    }

    // Check for protected fields and throw if present
    const protectedFields = ['tenantId', 'moduleId', 'environment', 'id', 'createdAt', 'updatedAt'];
    const hasProtectedField = protectedFields.some(field => field in updates);
    if (hasProtectedField) {
      logger.warn({
        msg: 'Attempted to update protected fields',
        pageId,
        tenantId,
        attemptedFields: Object.keys(updates),
      });
      throw new Error('Cannot update protected fields: tenantId, moduleId, environment, id, createdAt, updatedAt');
    }

    // Parse with schema validation
    const safeUpdates = updateModulePageSchema.parse(updates);

    // If changing parent, validate no cycles
    if (safeUpdates.parentPageId !== undefined) {
      if (safeUpdates.parentPageId === pageId) {
        throw new Error('Page cannot be its own parent');
      }

      if (safeUpdates.parentPageId) {
        const wouldCreateCycle = await checkForCycle(pageId, safeUpdates.parentPageId);
        if (wouldCreateCycle) {
          throw new Error('Operation would create a cycle in page hierarchy');
        }
      }
    }

    // Update page - MUST verify tenant ownership in WHERE clause
    const result = await db
      .update(modulePages)
      .set({
        ...safeUpdates,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(modulePages.id, pageId),
          eq(modulePages.tenantId, tenantId)
        )
      )
      .returning();

    const updated = result[0];
    if (!updated) {
      throw new Error('Failed to update module page - page not found or access denied');
    }

    logger.info({
      msg: 'Module page updated',
      pageId: updated.id,
      moduleId: updated.moduleId,
      tenantId: updated.tenantId,
    });

    // Emit realtime event
    realtimeEvents.emitForTenant('modulePages.updated', String(updated.tenantId), {
      moduleId: updated.moduleId,
      action: 'updated',
      pageId: updated.id,
    });

    return updated;
  } catch (error) {
    logger.error({ msg: 'Failed to update module page', error, pageId, updates, tenantId });
    throw error;
  }
}

/**
 * Delete a module page
 * SECURITY: Verifies page and all descendants belong to tenant before deletion
 * Note: Child pages will be orphaned (parentPageId becomes null) or cascade deleted based on DB constraints
 */
export async function deleteModulePage(pageId: string, tenantId: string): Promise<void> {
  try {
    // Get page info - MUST verify tenant ownership
    const page = await db
      .select()
      .from(modulePages)
      .where(
        and(
          eq(modulePages.id, pageId),
          eq(modulePages.tenantId, tenantId)
        )
      )
      .limit(1);

    if (!page[0]) {
      throw new Error('Page not found or access denied');
    }

    const { moduleId } = page[0];

    // Get all descendants to verify they all belong to this tenant
    const allDescendants = await getAllDescendants(pageId, tenantId);
    
    // Verify all descendants belong to the same tenant
    const invalidDescendants = allDescendants.filter(d => d.tenantId !== tenantId);
    if (invalidDescendants.length > 0) {
      logger.error({
        msg: 'Security violation: Attempted to delete page with descendants from other tenants',
        pageId,
        tenantId,
        invalidDescendantIds: invalidDescendants.map(d => d.id),
      });
      throw new Error('Cannot delete page: contains descendants from other tenants');
    }

    // Delete page - MUST verify tenant ownership in WHERE clause
    const result = await db
      .delete(modulePages)
      .where(
        and(
          eq(modulePages.id, pageId),
          eq(modulePages.tenantId, tenantId)
        )
      )
      .returning();

    if (result.length === 0) {
      throw new Error('Failed to delete module page - page not found or access denied');
    }

    logger.info({
      msg: 'Module page deleted',
      pageId,
      moduleId,
      tenantId,
      descendantsCount: allDescendants.length,
    });

    // Emit realtime event
    realtimeEvents.emitForTenant('modulePages.updated', tenantId, {
      moduleId,
      action: 'deleted',
      pageId,
    });
  } catch (error) {
    logger.error({ msg: 'Failed to delete module page', error, pageId, tenantId });
    throw error;
  }
}

/**
 * Get all descendants of a page (recursive)
 * Used for tenant verification before deletion
 */
async function getAllDescendants(pageId: string, tenantId: string): Promise<SelectModulePage[]> {
  const descendants: SelectModulePage[] = [];
  const toProcess = [pageId];
  const visited = new Set<string>();

  while (toProcess.length > 0) {
    const currentId = toProcess.shift()!;
    
    if (visited.has(currentId)) {
      continue;
    }
    visited.add(currentId);

    // Get children of current page
    const children = await db
      .select()
      .from(modulePages)
      .where(eq(modulePages.parentPageId, currentId));

    for (const child of children) {
      descendants.push(child);
      toProcess.push(String(child.id));
    }
  }

  return descendants;
}

/**
 * Batch reorder module pages
 * SECURITY: Verifies ALL pages belong to tenant and same module before reordering
 * Updates displayOrder for multiple pages atomically
 */
export async function reorderModulePages(
  reorderData: Array<{ pageId: string; displayOrder: number }>,
  tenantId: string
): Promise<void> {
  if (reorderData.length === 0) {
    return;
  }

  try {
    // SECURITY: Load ALL pages to verify they belong to this tenant
    const pageIds = reorderData.map(r => r.pageId);
    const pages = await db
      .select()
      .from(modulePages)
      .where(
        and(
          eq(modulePages.tenantId, tenantId)
        )
      );

    // Filter to only requested pages
    const requestedPages = pages.filter(p => pageIds.includes(String(p.id)));

    // Verify ALL requested pages were found
    if (requestedPages.length !== reorderData.length) {
      const foundIds = requestedPages.map(p => p.id);
      const missingIds = pageIds.filter(id => !foundIds.includes(id));
      logger.error({
        msg: 'Security violation: Attempted to reorder pages not belonging to tenant',
        tenantId,
        missingPageIds: missingIds,
      });
      throw new Error('One or more pages not found or access denied');
    }

    // Verify ALL pages belong to the same module
    const moduleIds = new Set(requestedPages.map(p => p.moduleId));
    if (moduleIds.size !== 1) {
      logger.error({
        msg: 'Security violation: Attempted to reorder pages from different modules',
        tenantId,
        moduleIds: Array.from(moduleIds),
      });
      throw new Error('All pages must belong to the same module');
    }

    const moduleId = requestedPages[0].moduleId;

    // SECURITY: Validate reorder data contains only allowed fields
    // This path only updates displayOrder - no other fields allowed
    for (const item of reorderData) {
      const itemKeys = Object.keys(item);
      const allowedKeys = ['pageId', 'displayOrder'];
      const invalidKeys = itemKeys.filter(key => !allowedKeys.includes(key));
      if (invalidKeys.length > 0) {
        logger.warn({
          msg: 'Attempted to include invalid fields in reorder operation',
          tenantId,
          invalidKeys,
          pageId: item.pageId,
        });
        throw new Error(`Invalid fields in reorder data: ${invalidKeys.join(', ')}. Only pageId and displayOrder are allowed.`);
      }
    }

    // Update each page's displayOrder - MUST verify tenant ownership in WHERE clause
    for (const { pageId, displayOrder } of reorderData) {
      const result = await db
        .update(modulePages)
        .set({
          displayOrder,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(modulePages.id, pageId),
            eq(modulePages.tenantId, tenantId)
          )
        )
        .returning();

      if (result.length === 0) {
        logger.error({
          msg: 'Failed to update page during reorder - access denied',
          pageId,
          tenantId,
        });
        throw new Error(`Failed to update page ${pageId} - access denied`);
      }
    }

    logger.info({
      msg: 'Module pages reordered',
      count: reorderData.length,
      moduleId,
      tenantId,
    });

    // Emit realtime event
    realtimeEvents.emitForTenant('modulePages.updated', tenantId, {
      moduleId,
      action: 'reordered',
      pageIds: reorderData.map(r => r.pageId),
    });
  } catch (error) {
    logger.error({ msg: 'Failed to reorder module pages', error, reorderData, tenantId });
    throw error;
  }
}

/**
 * Check if setting a new parent would create a cycle in the hierarchy
 * Traverses upwards from proposed parent to check if we hit the page being moved
 */
async function checkForCycle(pageId: string, newParentId: string): Promise<boolean> {
  let currentId: string | null = newParentId;
  const visited = new Set<string>();

  while (currentId) {
    // Found a cycle
    if (currentId === pageId) {
      return true;
    }

    // Prevent infinite loops
    if (visited.has(currentId)) {
      logger.warn({
        msg: 'Detected existing cycle in page hierarchy',
        currentId,
        visited: Array.from(visited),
      });
      return true;
    }

    visited.add(currentId);

    // Get parent of current page
    const page = await db
      .select()
      .from(modulePages)
      .where(eq(modulePages.id, currentId))
      .limit(1);

    if (!page[0]) {
      break;
    }

    currentId = page[0].parentPageId ? String(page[0].parentPageId) : null;
  }

  return false;
}

/**
 * Auto-seed default Finance module pages when activated for a tenant
 * Creates 4 flat pages: Dashboard, AR, AP, Treasury (Settings-style navigation)
 * @returns Number of pages created (0 if already exist)
 */
export async function seedFinanceiroDefaultPages(
  tenantId: string,
  environment: 'production' | 'sandbox' = 'production'
): Promise<number> {
  try {
    // Check if pages already exist
    const existing = await db
      .select()
      .from(modulePages)
      .where(
        and(
          eq(modulePages.tenantId, tenantId),
          eq(modulePages.moduleId, 'financial'),
          eq(modulePages.environment, environment)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      logger.info({
        msg: 'Financial pages already exist, skipping seed',
        tenantId,
        environment,
      });
      return 0;
    }

    logger.info({
      msg: 'Seeding default Financial pages (hierarchical collapsible structure)',
      tenantId,
      environment,
    });

    // PHASE 1: Create parent pages
    // NOTE: Labels are in English as structural base - i18n handles translation to PT/other languages
    const parentPages = [
      // 1. Dashboard (remains flat)
      {
        tenantId,
        moduleId: 'financial',
        routePath: '/financeiro',
        displayLabel: 'Dashboard',
        displayOrder: 0,
        isGroup: false,
        environment,
      },
      // 2. Catalog (flat - product/service catalog)
      {
        tenantId,
        moduleId: 'financial',
        routePath: '/financeiro/catalog',
        displayLabel: 'Catalog',
        displayOrder: 1,
        isGroup: false,
        environment,
      },
      // 3. AR (collapsible group)
      {
        tenantId,
        moduleId: 'financial',
        routePath: '/financeiro/ar',
        displayLabel: 'Accounts Receivable',
        displayOrder: 2,
        isGroup: true,
        environment,
      },
      // 4. AP (collapsible group)
      {
        tenantId,
        moduleId: 'financial',
        routePath: '/financeiro/ap',
        displayLabel: 'Accounts Payable',
        displayOrder: 3,
        isGroup: true,
        environment,
      },
      // 5. Treasury (collapsible group)
      {
        tenantId,
        moduleId: 'financial',
        routePath: '/financeiro/treasury',
        displayLabel: 'Treasury',
        displayOrder: 4,
        isGroup: true,
        environment,
      },
    ];

    const createdPages: SelectModulePage[] = [];
    
    // Create parent pages first
    for (const pageData of parentPages) {
      const [created] = await db
        .insert(modulePages)
        .values(pageData as InsertModulePage)
        .returning();
      
      if (created) {
        createdPages.push(created);
      }
    }

    // Get parent page IDs
    const arPage = createdPages.find(p => p.displayLabel === 'Accounts Receivable');
    const apPage = createdPages.find(p => p.displayLabel === 'Accounts Payable');
    const treasuryPage = createdPages.find(p => p.displayLabel === 'Treasury');

    // PHASE 2: Create child pages
    const childPages = [
      // AR Sub-pages
      {
        tenantId,
        moduleId: 'financial',
        parentPageId: arPage?.id,
        routePath: '/financeiro/ar/invoices',
        displayLabel: 'Invoices',
        displayOrder: 0,
        isGroup: false,
        environment,
      },
      {
        tenantId,
        moduleId: 'financial',
        parentPageId: arPage?.id,
        routePath: '/financeiro/ar/credit-notes',
        displayLabel: 'Credit Notes',
        displayOrder: 1,
        isGroup: false,
        environment,
      },
      {
        tenantId,
        moduleId: 'financial',
        parentPageId: arPage?.id,
        routePath: '/financeiro/ar/collections',
        displayLabel: 'Collections',
        displayOrder: 2,
        isGroup: false,
        environment,
      },
      // AP Sub-pages
      {
        tenantId,
        moduleId: 'financial',
        parentPageId: apPage?.id,
        routePath: '/financeiro/ap/bills',
        displayLabel: 'Bills',
        displayOrder: 0,
        isGroup: false,
        environment,
      },
      {
        tenantId,
        moduleId: 'financial',
        parentPageId: apPage?.id,
        routePath: '/financeiro/ap/matching',
        displayLabel: '3-Way Matching',
        displayOrder: 1,
        isGroup: false,
        environment,
      },
      {
        tenantId,
        moduleId: 'financial',
        parentPageId: apPage?.id,
        routePath: '/financeiro/ap/approvals',
        displayLabel: 'Approvals',
        displayOrder: 2,
        isGroup: false,
        environment,
      },
      // Treasury Sub-pages
      {
        tenantId,
        moduleId: 'financial',
        parentPageId: treasuryPage?.id,
        routePath: '/financeiro/treasury/accounts',
        displayLabel: 'Bank Accounts',
        displayOrder: 0,
        isGroup: false,
        environment,
      },
      {
        tenantId,
        moduleId: 'financial',
        parentPageId: treasuryPage?.id,
        routePath: '/financeiro/treasury/forecast',
        displayLabel: 'Cashflow Forecast',
        displayOrder: 1,
        isGroup: false,
        environment,
      },
      {
        tenantId,
        moduleId: 'financial',
        parentPageId: treasuryPage?.id,
        routePath: '/financeiro/treasury/reconciliation',
        displayLabel: 'Reconciliation',
        displayOrder: 2,
        isGroup: false,
        environment,
      },
    ];

    // Create child pages
    for (const pageData of childPages) {
      const [created] = await db
        .insert(modulePages)
        .values(pageData as InsertModulePage)
        .returning();
      
      if (created) {
        createdPages.push(created);
      }
    }

    const createdCount = createdPages.length;
    
    logger.info({
      msg: 'Financeiro default pages seeded successfully',
      tenantId,
      environment,
      pagesCreated: createdCount,
    });

    // Emit realtime event for UI refresh
    realtimeEvents.emitForTenant('modulePages.updated', tenantId, {
      moduleId: 'financial',
      action: 'bulk_created',
      count: createdCount,
    });

    return createdCount;
  } catch (error) {
    logger.error({
      msg: 'Failed to seed Financeiro pages',
      tenantId,
      environment,
      error,
    });
    throw error;
  }
}
