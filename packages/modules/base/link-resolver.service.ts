/**
 * LinkResolverService - Cross-Module Field Linking
 * 
 * Permite ligar custom fields a entidades de outros módulos:
 * - Campo "Fatura" → Liga a invoices (Financial)
 * - Campo "Cliente" → Liga a clients (CRM)
 * - Campo "Purchase Order" → Liga a purchase_orders (Compras)
 * 
 * Features:
 * - Search linkable entities across modules
 * - Attach/detach links
 * - Resolve linked values with caching
 * - Permission-aware queries
 */

import { db } from '../../../apps/api/db';
import { 
  customFieldLinks,
  customFields,
  customEntities,
  clients,
  invoices,
  purchaseOrders,
  projects,
  crmContracts
} from '../../../shared/schema';
import { eq, and, like, or, sql } from 'drizzle-orm';
import type { ModuleRegistryService } from './module-registry.service';

// ============================================================================
// LINKABLE ENTITY CONFIGURATION
// ============================================================================

export interface LinkableEntity {
  moduleId: string;
  moduleName: string;
  entityKey: string;
  entityName: string;
  table: any; // Drizzle table
  displayField: string; // Field to show in UI (e.g., 'name', 'number')
  searchFields: string[]; // Fields to search
  requiredPermission?: string;
}

// Map of all linkable entities in the system
const LINKABLE_ENTITIES: LinkableEntity[] = [
  // CRM Module
  {
    moduleId: 'crm',
    moduleName: 'CRM',
    entityKey: 'clients',
    entityName: 'Clientes',
    table: clients,
    displayField: 'name',
    searchFields: ['name', 'email', 'nif'],
    requiredPermission: 'crm.read'
  },
  {
    moduleId: 'crm',
    moduleName: 'CRM',
    entityKey: 'contracts',
    entityName: 'Contratos',
    table: crmContracts,
    displayField: 'contractNumber',
    searchFields: ['contractNumber', 'description'],
    requiredPermission: 'crm.read'
  },
  
  // Financial Module
  {
    moduleId: 'financial',
    moduleName: 'Financial',
    entityKey: 'invoices',
    entityName: 'Faturas',
    table: invoices,
    displayField: 'invoiceNumber',
    searchFields: ['invoiceNumber', 'clientName'],
    requiredPermission: 'financial.read'
  },
  
  // Compras Module
  {
    moduleId: 'compras',
    moduleName: 'Compras',
    entityKey: 'purchase_orders',
    entityName: 'Ordens de Compra',
    table: purchaseOrders,
    displayField: 'orderNumber',
    searchFields: ['orderNumber', 'supplierName'],
    requiredPermission: 'purchasing.read'
  },
  
  // Projects Module (self-linking)
  {
    moduleId: 'projetos',
    moduleName: 'Projetos',
    entityKey: 'projects',
    entityName: 'Projetos',
    table: projects,
    displayField: 'name',
    searchFields: ['name', 'projectCode'],
    requiredPermission: 'projects.read'
  }
];

// ============================================================================
// LINK RESOLVER SERVICE
// ============================================================================

export class LinkResolverService {
  private tenantId: string;
  private userId: string;
  private environment: string;
  private userPermissions: string[];
  
  constructor(
    tenantId: string, 
    userId: string,
    environment: string,
    userPermissions: string[] = []
  ) {
    this.tenantId = tenantId;
    this.userId = userId;
    this.environment = environment;
    this.userPermissions = userPermissions;
    
    // Validate environment
    if (!environment || !['production', 'sandbox'].includes(environment)) {
      throw new Error(`Invalid environment: ${environment}. Must be 'production' or 'sandbox'`);
    }
  }
  
  // ==========================================================================
  // DISCOVERY - Find linkable entities
  // ==========================================================================
  
  /**
   * Get all linkable entities that user has permission to access
   */
  async getAvailableLinkableEntities(): Promise<LinkableEntity[]> {
    return LINKABLE_ENTITIES.filter(entity => {
      // Check permission if required
      if (entity.requiredPermission) {
        return this.hasPermission(entity.requiredPermission);
      }
      return true;
    });
  }
  
  /**
   * Get linkable entities for a specific module
   */
  async getLinkableEntitiesByModule(moduleId: string): Promise<LinkableEntity[]> {
    const all = await this.getAvailableLinkableEntities();
    return all.filter(e => e.moduleId === moduleId);
  }
  
  /**
   * Get a specific linkable entity
   */
  getLinkableEntity(moduleId: string, entityKey: string): LinkableEntity | null {
    return LINKABLE_ENTITIES.find(
      e => e.moduleId === moduleId && e.entityKey === entityKey
    ) || null;
  }
  
  // ==========================================================================
  // SEARCH - Find records to link
  // ==========================================================================
  
  /**
   * Search for linkable records in a specific entity
   */
  async searchLinkableRecords(
    moduleId: string,
    entityKey: string,
    searchTerm: string,
    limit: number = 10
  ): Promise<any[]> {
    const linkableEntity = this.getLinkableEntity(moduleId, entityKey);
    
    if (!linkableEntity) {
      throw new Error(`Unknown linkable entity: ${moduleId}.${entityKey}`);
    }
    
    // Check permission
    if (linkableEntity.requiredPermission && !this.hasPermission(linkableEntity.requiredPermission)) {
      throw new Error(`Permission denied: ${linkableEntity.requiredPermission}`);
    }
    
    const table = linkableEntity.table;
    
    // Build search conditions
    const searchConditions = linkableEntity.searchFields.map(field =>
      like((table as any)[field], `%${searchTerm}%`)
    );
    
    // Query with tenant + environment isolation
    const results = await db
      .select()
      .from(table)
      .where(
        and(
          eq((table as any).tenantId, this.tenantId),
          eq((table as any).environment, this.environment),
          or(...searchConditions)
        )
      )
      .limit(limit);
    
    // Format for UI
    return results.map((record: any) => ({
      id: record.id,
      displayValue: record[linkableEntity.displayField],
      record: record // Full record for reference
    }));
  }
  
  /**
   * Get a single linkable record by ID (used by LinkFieldPicker to resolve display values)
   */
  async getLinkableRecordById(
    moduleId: string,
    entityKey: string,
    targetRecordId: string
  ): Promise<any | null> {
    const linkableEntity = this.getLinkableEntity(moduleId, entityKey);
    
    if (!linkableEntity) {
      throw new Error(`Unknown linkable entity: ${moduleId}.${entityKey}`);
    }
    
    // Check permission
    if (linkableEntity.requiredPermission && !this.hasPermission(linkableEntity.requiredPermission)) {
      throw new Error(`Permission denied: ${linkableEntity.requiredPermission}`);
    }
    
    const table = linkableEntity.table;
    
    // Query with tenant + environment isolation
    const results = await db
      .select()
      .from(table)
      .where(
        and(
          eq((table as any).id, targetRecordId),
          eq((table as any).tenantId, this.tenantId),
          eq((table as any).environment, this.environment)
        )
      )
      .limit(1);
    
    if (!results.length) {
      return null;
    }
    
    const record = results[0];
    
    // Format for UI
    return {
      id: record.id,
      displayValue: record[linkableEntity.displayField],
      metadata: {
        module: moduleId,
        entity: entityKey,
        // Include a few useful fields but not full record
        ...(record.email && { email: record.email }),
        ...(record.nif && { nif: record.nif })
      }
    };
  }
  
  // ==========================================================================
  // LINKING - Create and manage links
  // ==========================================================================
  
  /**
   * Create a link between a custom field and an entity record
   */
  async createLink(
    sourceFieldId: string,
    sourceRecordId: string,
    targetModule: string,
    targetEntity: string,
    targetRecordId: string,
    displayValue?: string
  ): Promise<any> {
    // Verify field exists and belongs to tenant
    const field = await db
      .select()
      .from(customFields)
      .where(
        and(
          eq(customFields.id, sourceFieldId),
          eq(customFields.tenantId, this.tenantId)
        )
      )
      .limit(1);
    
    if (!field.length) {
      throw new Error('Field not found or access denied');
    }
    
    // 🔒 SECURITY: Require write permission for creating links
    if (!this.hasPermission('projects.write')) {
      throw new Error('Permission denied: projects.write required to create links');
    }
    
    // Verify target entity exists
    const linkableEntity = this.getLinkableEntity(targetModule, targetEntity);
    if (!linkableEntity) {
      throw new Error(`Unknown target entity: ${targetModule}.${targetEntity}`);
    }
    
    // 🔒 SECURITY: Check target entity read permission
    if (linkableEntity.requiredPermission && !this.hasPermission(linkableEntity.requiredPermission)) {
      throw new Error(`Permission denied for target module: ${linkableEntity.requiredPermission}`);
    }
    
    // Verify target record exists with environment isolation
    const targetRecord = await db
      .select()
      .from(linkableEntity.table)
      .where(
        and(
          eq((linkableEntity.table as any).id, targetRecordId),
          eq((linkableEntity.table as any).tenantId, this.tenantId),
          eq((linkableEntity.table as any).environment, this.environment)
        )
      )
      .limit(1);
    
    if (!targetRecord.length) {
      throw new Error('Target record not found');
    }
    
    // Auto-resolve display value if not provided
    if (!displayValue) {
      displayValue = targetRecord[0][linkableEntity.displayField];
    }
    
    // Create link with environment isolation
    const [link] = await db
      .insert(customFieldLinks)
      .values({
        tenantId: this.tenantId,
        environment: this.environment,
        sourceFieldId,
        sourceRecordId,
        targetModule,
        targetEntity,
        targetRecordId,
        linkType: 'reference',
        linkMetadata: {
          displayValue,
          // 🔒 SECURITY: cachedData NOT stored to prevent residual data leakage
          syncedAt: new Date().toISOString()
        },
        createdBy: this.userId
      })
      .returning();
    
    console.log(`[LinkResolver] Created link: ${sourceFieldId}/${sourceRecordId} → ${targetModule}.${targetEntity}/${targetRecordId}`);
    
    return link;
  }
  
  /**
   * Remove a link
   */
  async removeLink(linkId: string): Promise<void> {
    // 🔒 SECURITY: Require write permission for removing links
    if (!this.hasPermission('projects.write')) {
      throw new Error('Permission denied: projects.write required to remove links');
    }
    
    await db
      .delete(customFieldLinks)
      .where(
        and(
          eq(customFieldLinks.id, linkId),
          eq(customFieldLinks.tenantId, this.tenantId),
          eq(customFieldLinks.environment, this.environment)
        )
      );
    
    console.log(`[LinkResolver] Removed link: ${linkId}`);
  }
  
  /**
   * Get all links for a source record
   * 
   * 🔒 SECURITY NOTE: Returns link metadata WITHOUT cachedData to prevent
   * unauthorized access to target module records. Use resolveLink() to get
   * target record data (which validates target module permissions).
   */
  async getLinksForRecord(sourceRecordId: string): Promise<any[]> {
    // 🔒 SECURITY: Require read permission to view links
    if (!this.hasPermission('projects.read')) {
      throw new Error('Permission denied: projects.read required to view links');
    }
    
    const links = await db
      .select()
      .from(customFieldLinks)
      .where(
        and(
          eq(customFieldLinks.sourceRecordId, sourceRecordId),
          eq(customFieldLinks.tenantId, this.tenantId),
          eq(customFieldLinks.environment, this.environment)
        )
      );
    
    // 🔒 SECURITY: Strip cachedData to prevent data leakage
    // Users must call resolveLink() which validates target module permissions
    return links.map(link => ({
      ...link,
      linkMetadata: link.linkMetadata ? {
        displayValue: (link.linkMetadata as any).displayValue,
        syncedAt: (link.linkMetadata as any).syncedAt
        // cachedData intentionally omitted - use resolveLink() instead
      } : null
    }));
  }
  
  /**
   * Get a specific link
   * 
   * 🔒 SECURITY NOTE: Returns link metadata WITHOUT cachedData to prevent
   * unauthorized access to target module records. Use resolveLink() to get
   * target record data (which validates target module permissions).
   */
  async getLink(
    sourceFieldId: string,
    sourceRecordId: string
  ): Promise<any | null> {
    // 🔒 SECURITY: Require read permission to view link
    if (!this.hasPermission('projects.read')) {
      throw new Error('Permission denied: projects.read required to view link');
    }
    
    const links = await db
      .select()
      .from(customFieldLinks)
      .where(
        and(
          eq(customFieldLinks.sourceFieldId, sourceFieldId),
          eq(customFieldLinks.sourceRecordId, sourceRecordId),
          eq(customFieldLinks.tenantId, this.tenantId),
          eq(customFieldLinks.environment, this.environment)
        )
      )
      .limit(1);
    
    if (links.length === 0) {
      return null;
    }
    
    const linkData = links[0];
    
    // 🔒 SECURITY: Strip cachedData to prevent data leakage
    return {
      ...linkData,
      linkMetadata: linkData.linkMetadata ? {
        displayValue: (linkData.linkMetadata as any).displayValue,
        syncedAt: (linkData.linkMetadata as any).syncedAt
        // cachedData intentionally omitted - use resolveLink() instead
      } : null
    };
  }
  
  // ==========================================================================
  // RESOLUTION - Resolve linked values
  // ==========================================================================
  
  /**
   * Resolve a link to get the current target record data
   * Uses cache if recent, otherwise queries fresh
   */
  async resolveLink(linkId: string, useCache: boolean = true): Promise<any> {
    // 🔒 SECURITY: Require read permission to resolve links
    if (!this.hasPermission('projects.read')) {
      throw new Error('Permission denied: projects.read required to resolve links');
    }
    
    const link = await db
      .select()
      .from(customFieldLinks)
      .where(
        and(
          eq(customFieldLinks.id, linkId),
          eq(customFieldLinks.tenantId, this.tenantId),
          eq(customFieldLinks.environment, this.environment)
        )
      )
      .limit(1);
    
    if (!link.length) {
      throw new Error('Link not found');
    }
    
    const linkData = link[0];
    
    // 🔒 SECURITY: Always fetch fresh data (no caching) to prevent residual data leakage
    // This ensures permission checks are always enforced at resolution time
    const linkableEntity = this.getLinkableEntity(
      linkData.targetModule,
      linkData.targetEntity
    );
    
    if (!linkableEntity) {
      throw new Error(`Unknown target entity: ${linkData.targetModule}.${linkData.targetEntity}`);
    }
    
    // 🔒 SECURITY: Require target module read permission to resolve
    if (linkableEntity.requiredPermission && !this.hasPermission(linkableEntity.requiredPermission)) {
      throw new Error(`Permission denied for target module: ${linkableEntity.requiredPermission}`);
    }
    
    const targetRecord = await db
      .select()
      .from(linkableEntity.table)
      .where(
        and(
          eq((linkableEntity.table as any).id, linkData.targetRecordId),
          eq((linkableEntity.table as any).tenantId, this.tenantId),
          eq((linkableEntity.table as any).environment, this.environment)
        )
      )
      .limit(1);
    
    if (!targetRecord.length) {
      throw new Error('Target record no longer exists');
    }
    
    // Update sync timestamp (no cachedData storage for security)
    await db
      .update(customFieldLinks)
      .set({
        linkMetadata: {
          displayValue: targetRecord[0][linkableEntity.displayField],
          // 🔒 SECURITY: cachedData NOT stored to prevent residual data leakage
          syncedAt: new Date().toISOString()
        },
        updatedAt: new Date()
      })
      .where(eq(customFieldLinks.id, linkId));
    
    return targetRecord[0];
  }
  
  // ==========================================================================
  // HELPERS
  // ==========================================================================
  
  private hasPermission(permission: string): boolean {
    // Check if user has the required permission
    // Permission format: "module.action" (e.g., "crm.read", "financial.write")
    
    if (!this.userPermissions || this.userPermissions.length === 0) {
      // No permissions provided - deny by default
      return false;
    }
    
    // Check for exact permission match
    if (this.userPermissions.includes(permission)) {
      return true;
    }
    
    // Check for wildcard permissions (e.g., "crm.*" grants all CRM permissions)
    const [module, action] = permission.split('.');
    const wildcardPermission = `${module}.*`;
    if (this.userPermissions.includes(wildcardPermission)) {
      return true;
    }
    
    // Check for admin wildcard (e.g., "*.*" grants all permissions)
    if (this.userPermissions.includes('*.*') || this.userPermissions.includes('admin.*')) {
      return true;
    }
    
    return false;
  }
}

// ============================================================================
// FACTORY
// ============================================================================

export function createLinkResolver(
  tenantId: string,
  userId: string,
  environment: string,
  userPermissions: string[] = []
): LinkResolverService {
  // CRITICAL: Never cache/singleton - each request needs fresh instance with its own environment context
  return new LinkResolverService(tenantId, userId, environment, userPermissions);
}
