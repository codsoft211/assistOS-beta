/**
 * ModuleConfiguration - Bridge between IModule and customEntities tables
 * 
 * This system:
 * - Loads custom entities from database for a specific tenant
 * - Persists new module configurations to customEntities tables
 * - Validates configurations before applying
 * - Enforces resource quotas to prevent runaway evolution
 * - Tracks configuration history for rollback support
 */

import { db } from '../../../apps/api/db';
import { 
  customEntities, 
  customFields, 
  customEntityRecords,
  tenants
} from '../../../shared/schema';
import { eq, and, count } from 'drizzle-orm';
import type {
  IModule,
  ModuleConfiguration,
  ModuleTemplate,
  EntityDefinition,
  FieldDefinition,
  ModuleContext
} from './module.interface';

// ============================================================================
// RESOURCE QUOTAS
// ============================================================================

export interface ResourceQuotas {
  maxCustomEntities: number;
  maxCustomFields: number;
  maxWorkflows: number;
  maxCustomTools: number;
}

// Default quotas (can be overridden per tenant)
const DEFAULT_QUOTAS: ResourceQuotas = {
  maxCustomEntities: 20,
  maxCustomFields: 100,
  maxWorkflows: 15,
  maxCustomTools: 30
};

// ============================================================================
// MODULE CONFIGURATION MANAGER
// ============================================================================

export class ModuleConfigurationManager {
  private tenantId: string;
  private moduleId: string;
  private quotas: ResourceQuotas;
  
  constructor(tenantId: string, moduleId: string, quotas?: Partial<ResourceQuotas>) {
    this.tenantId = tenantId;
    this.moduleId = moduleId;
    this.quotas = { ...DEFAULT_QUOTAS, ...quotas };
  }
  
  // ==========================================================================
  // LOAD CONFIGURATION
  // ==========================================================================
  
  /**
   * Load all custom entities for this module + tenant from database
   * @param environment - Environment to load from ('sandbox' | 'production'), defaults to 'production' for backward compatibility
   */
  async loadCustomEntities(environment: 'sandbox' | 'production' = 'production'): Promise<EntityDefinition[]> {
    // Load custom entities for this tenant that belong to this module
    const entities = await db
      .select()
      .from(customEntities)
      .where(
        and(
          eq(customEntities.tenantId, this.tenantId),
          eq(customEntities.category, this.moduleId),
          eq(customEntities.environment, environment)
        )
      );
    
    if (entities.length === 0) {
      return [];
    }
    
    // Load fields for each entity
    const entityDefinitions: EntityDefinition[] = [];
    
    for (const entity of entities) {
      const fields = await db
        .select()
        .from(customFields)
        .where(
          and(
            eq(customFields.entityId, entity.id),
            eq(customFields.tenantId, this.tenantId)
          )
        )
        .orderBy(customFields.fieldOrder);
      
      // Convert DB format to EntityDefinition format
      const fieldDefinitions: FieldDefinition[] = fields.map(field => {
        const fieldDef: FieldDefinition = {
          name: field.fieldKey,
          type: this.mapFieldType(field.fieldType),
          required: field.isRequired,
          unique: field.isUnique,
          default: field.defaultValue || undefined,
          // Parse options for enums
          options: field.fieldOptions ? (field.fieldOptions as any).options : undefined,
        };
        
        // ISSUE 1 FIX: Map relationTarget to ref for relation fields
        if (field.fieldType === 'relation' && field.fieldOptions) {
          const relationTarget = (field.fieldOptions as any).relationTarget;
          if (relationTarget) {
            fieldDef.ref = relationTarget;
          }
        }
        
        return fieldDef;
      });
      
      // ISSUE 1 FIX: Restore relationships, indexes, softDelete from metadata
      const metadata = entity.metadata as any;
      entityDefinitions.push({
        name: entity.entityKey,
        schema: {
          fields: fieldDefinitions,
          timestamps: true,
          tenantIsolation: true
        },
        relationships: metadata?.relationships || [],
        indexes: metadata?.indexes || [],
        softDelete: metadata?.softDelete || false
      });
    }
    
    return entityDefinitions;
  }
  
  // ==========================================================================
  // APPLY CONFIGURATION
  // ==========================================================================
  
  /**
   * Apply a module configuration to this tenant
   * ISSUE 2 FIX: Wrapped in transaction for atomic operations with rollback support
   */
  async applyConfiguration(
    config: ModuleConfiguration,
    context: ModuleContext
  ): Promise<void> {
    const environment = context.environment || 'sandbox';
    
    // Validate resource quotas first (read-only, outside transaction)
    await this.validateQuotas(config, environment);
    
    try {
      // ISSUE 2 FIX: Wrap all database operations in a transaction
      await db.transaction(async (tx) => {
        // Apply custom entities
        if (config.customEntities && config.customEntities.length > 0) {
          const entityMapping = await this.createCustomEntities(config.customEntities, context, tx);
          // entityMapping available for future use (e.g., relation remapping)
        }
        
        // Apply custom workflows
        if (config.customWorkflows && config.customWorkflows.length > 0) {
          await this.createCustomWorkflows(config.customWorkflows, environment, tx);
        }
        
        // Store configuration metadata
        await this.saveConfigurationMetadata(config, context, environment, tx);
      });
      
      console.log(`[ModuleConfiguration] Applied configuration for module ${this.moduleId} to tenant ${this.tenantId}`);
    } catch (error) {
      console.error(`[ModuleConfiguration] Failed to apply configuration for module ${this.moduleId} to tenant ${this.tenantId}:`, error);
      throw new Error(`Configuration application failed and was rolled back: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  /**
   * Apply a template to this module
   */
  async applyTemplate(
    template: ModuleTemplate,
    context: ModuleContext
  ): Promise<void> {
    console.log(`[ModuleConfiguration] Applying template ${template.id} to module ${this.moduleId}`);
    
    // Track template usage for pattern recognition
    await this.trackTemplateUsage(template.id);
    
    // Apply the template's configuration
    await this.applyConfiguration(template.configuration, context);
  }
  
  /**
   * Promote sandbox configuration to production
   * PUBLISH FIX: Transactional delete+recreate for exact sandbox mirror
   * This ensures production is always an exact replica of sandbox configuration
   */
  async promoteFromSandbox(userId: string): Promise<{
    entitiesPromoted: number;
    fieldsPromoted: number;
    entityIdMapping: Map<string, string>;
  }> {
    console.log(`[ModuleConfiguration] Promoting sandbox to production for module ${this.moduleId}, tenant ${this.tenantId}`);
    
    // Load sandbox entities
    const sandboxEntities = await db
      .select()
      .from(customEntities)
      .where(
        and(
          eq(customEntities.tenantId, this.tenantId),
          eq(customEntities.category, this.moduleId),
          eq(customEntities.environment, 'sandbox')
        )
      );
    
    if (sandboxEntities.length === 0) {
      throw new Error('No sandbox configuration to promote');
    }
    
    // Load sandbox field IDs for this module's entities only
    const sandboxEntityIds = sandboxEntities.map(e => e.id);
    const { inArray } = await import('drizzle-orm');
    
    // Load sandbox fields ONLY for this module's entities
    const allSandboxFields = sandboxEntityIds.length > 0 
      ? await db
          .select()
          .from(customFields)
          .where(
            and(
              eq(customFields.tenantId, this.tenantId),
              eq(customFields.environment, 'sandbox'),
              inArray(customFields.entityId, sandboxEntityIds)
            )
          )
      : [];
    
    const entityIdMapping = new Map<string, string>();
    let fieldsPromotedCount = 0;
    
    try {
      await db.transaction(async (tx) => {
        // Step 1: DELETE existing production configuration for THIS MODULE ONLY
        // Load production entity IDs for this module to scope deletion
        const productionEntitiesToDelete = await tx
          .select({ id: customEntities.id })
          .from(customEntities)
          .where(
            and(
              eq(customEntities.tenantId, this.tenantId),
              eq(customEntities.category, this.moduleId),
              eq(customEntities.environment, 'production')
            )
          );
        
        const productionEntityIds = productionEntitiesToDelete.map(e => e.id);
        
        // Delete related data ONLY for this module's entities (if any exist)
        if (productionEntityIds.length > 0) {
          const { inArray } = await import('drizzle-orm');
          const { customEntityRecords } = await import('@shared/schema');
          
          // Delete entity records first (most dependent)
          await tx
            .delete(customEntityRecords)
            .where(
              and(
                eq(customEntityRecords.tenantId, this.tenantId),
                eq(customEntityRecords.environment, 'production'),
                inArray(customEntityRecords.entityId, productionEntityIds)
              )
            );
          
          // Delete custom fields (depends on entities)
          await tx
            .delete(customFields)
            .where(
              and(
                eq(customFields.tenantId, this.tenantId),
                eq(customFields.environment, 'production'),
                inArray(customFields.entityId, productionEntityIds)
              )
            );
          
          // Delete entities for this module
          await tx
            .delete(customEntities)
            .where(
              and(
                eq(customEntities.tenantId, this.tenantId),
                eq(customEntities.category, this.moduleId),
                eq(customEntities.environment, 'production')
              )
            );
        }
        
        console.log(`[Promote] Deleted existing production configuration for module ${this.moduleId}`);
        
        // Step 2: CREATE production entities and track ID mapping
        for (const sandboxEntity of sandboxEntities) {
          const [productionEntity] = await tx
            .insert(customEntities)
            .values({
              tenantId: this.tenantId,
              environment: 'production',
              entityKey: sandboxEntity.entityKey,
              displayName: sandboxEntity.displayName,
              displayNamePlural: sandboxEntity.displayNamePlural,
              description: sandboxEntity.description,
              category: sandboxEntity.category,
              enableWorkflow: sandboxEntity.enableWorkflow,
              enableComments: sandboxEntity.enableComments,
              enableAttachments: sandboxEntity.enableAttachments,
              enableHistory: sandboxEntity.enableHistory,
              isSystemEntity: sandboxEntity.isSystemEntity,
              metadata: sandboxEntity.metadata,
              createdBy: userId
              // Let createdAt auto-generate for production
            })
            .returning();
          
          entityIdMapping.set(sandboxEntity.id, productionEntity.id);
          console.log(`[Promote] Mapped ${sandboxEntity.entityKey}: ${sandboxEntity.id} -> ${productionEntity.id}`);
        }
        
        // Step 3: CREATE production fields with remapped relation targets
        for (const sandboxField of allSandboxFields) {
          const productionEntityId = entityIdMapping.get(sandboxField.entityId);
          if (!productionEntityId) {
            throw new Error(`[Promote] FATAL: Field ${sandboxField.fieldKey} references unmapped entity ${sandboxField.entityId}`);
          }
          
          // Remap relation targets in fieldOptions
          let fieldOptions = sandboxField.fieldOptions;
          if (sandboxField.fieldType === 'relation' && fieldOptions) {
            const relationTarget = (fieldOptions as any).relationTarget;
            if (relationTarget) {
              if (entityIdMapping.has(relationTarget)) {
                // Remap sandbox entity ID to production entity ID
                const newTarget = entityIdMapping.get(relationTarget)!;
                fieldOptions = {
                  ...fieldOptions,
                  relationTarget: newTarget
                };
                console.log(`[Promote] Remapped relation target: ${relationTarget} -> ${newTarget}`);
              } else {
                // ERROR: relation target not in this module's entity mapping
                // This means the relation points to an entity from another module or is invalid
                console.error(`[Promote] FATAL: Relation field ${sandboxField.fieldKey} has relationTarget ${relationTarget} which is not in this module's entity mapping. This likely indicates a cross-module relation or data corruption.`);
                throw new Error(`Relation field ${sandboxField.fieldKey} references entity ${relationTarget} which is not part of module ${this.moduleId}. Cross-module relations must be configured differently.`);
              }
            }
          }
          
          await tx.insert(customFields).values({
            tenantId: this.tenantId,
            environment: 'production',
            entityId: productionEntityId,
            fieldKey: sandboxField.fieldKey,
            displayName: sandboxField.displayName,
            description: sandboxField.description,
            fieldType: sandboxField.fieldType,
            fieldOptions: fieldOptions,
            validationRules: sandboxField.validationRules,
            defaultValue: sandboxField.defaultValue,
            fieldOrder: sandboxField.fieldOrder,
            isRequired: sandboxField.isRequired,
            isUnique: sandboxField.isUnique,
            isSearchable: sandboxField.isSearchable
            // Let createdAt auto-generate for production
          });
          
          fieldsPromotedCount++;
        }
      });
      
      console.log(`[ModuleConfiguration] Promoted ${sandboxEntities.length} entities and ${fieldsPromotedCount} fields to production`);
      
      return {
        entitiesPromoted: sandboxEntities.length,
        fieldsPromoted: fieldsPromotedCount,
        entityIdMapping
      };
    } catch (error) {
      console.error(`[ModuleConfiguration] Failed to promote from sandbox to production:`, error);
      throw new Error(`Promotion failed and was rolled back: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  // ==========================================================================
  // VALIDATION
  // ==========================================================================
  
  /**
   * Validate configuration against resource quotas
   * @param environment - Environment to validate against
   */
  private async validateQuotas(config: ModuleConfiguration, environment: 'sandbox' | 'production' = 'sandbox'): Promise<void> {
    // Count existing custom entities for this module in the target environment
    const existingEntities = await this.loadCustomEntities(environment);
    const newEntitiesCount = config.customEntities?.length || 0;
    const totalEntities = existingEntities.length + newEntitiesCount;
    
    if (totalEntities > this.quotas.maxCustomEntities) {
      throw new Error(
        `Resource quota exceeded: Maximum ${this.quotas.maxCustomEntities} custom entities allowed. ` +
        `Existing: ${existingEntities.length}, New: ${newEntitiesCount}`
      );
    }
    
    // Count total fields
    const newFieldsCount = config.customEntities?.reduce(
      (sum, entity) => sum + (entity.schema.fields?.length || 0),
      0
    ) || 0;
    
    const existingFieldsCount = existingEntities.reduce(
      (sum, entity) => sum + (entity.schema.fields?.length || 0),
      0
    );
    
    if (existingFieldsCount + newFieldsCount > this.quotas.maxCustomFields) {
      throw new Error(
        `Resource quota exceeded: Maximum ${this.quotas.maxCustomFields} custom fields allowed.`
      );
    }
    
    // Validate workflows
    const newWorkflowsCount = config.customWorkflows?.length || 0;
    if (newWorkflowsCount > this.quotas.maxWorkflows) {
      throw new Error(
        `Resource quota exceeded: Maximum ${this.quotas.maxWorkflows} custom workflows allowed.`
      );
    }
  }
  
  /**
   * Validate that custom entities have proper relations to core entities
   */
  validateEntityRelationships(
    customEntities: EntityDefinition[],
    coreEntities: EntityDefinition[]
  ): boolean {
    const coreEntityNames = new Set(coreEntities.map(e => e.name));
    
    for (const entity of customEntities) {
      // Check if entity has at least one relationship to a core entity
      const hasCoreLinkage = entity.relationships?.some(rel => 
        coreEntityNames.has(rel.target)
      ) || false;
      
      if (!hasCoreLinkage) {
        console.warn(
          `[ModuleConfiguration] Custom entity ${entity.name} has no relationship to core entities. ` +
          `This might make it isolated.`
        );
      }
    }
    
    return true;
  }
  
  // ==========================================================================
  // PERSISTENCE
  // ==========================================================================
  
  /**
   * Create custom entities in database
   * ISSUE 2 & 3 FIX: Added transaction parameter and idempotency checks
   * TEMPLATE BUG FIX: Accept context, use context.environment (default 'sandbox')
   * PUBLISH FIX: Returns entityKey -> productionEntityId mapping
   */
  private async createCustomEntities(
    entities: EntityDefinition[],
    context: ModuleContext,
    tx: any = db
  ): Promise<Map<string, string>> {
    const environment = context.environment || 'sandbox';
    const entityMapping = new Map<string, string>();
    
    for (const entityDef of entities) {
      // ISSUE 3 FIX: Check if entity already exists (idempotency)
      const existingEntity = await tx
        .select()
        .from(customEntities)
        .where(
          and(
            eq(customEntities.tenantId, this.tenantId),
            eq(customEntities.entityKey, entityDef.name),
            eq(customEntities.environment, environment)
          )
        )
        .limit(1);
      
      let entity;
      if (existingEntity.length > 0) {
        // Entity already exists, use the existing one
        entity = existingEntity[0];
        console.log(`[ModuleConfiguration] Entity ${entityDef.name} already exists in ${environment}, skipping creation`);
      } else {
        // Create new custom entity record
        // ISSUE 1 FIX: Store relationships, indexes, softDelete in metadata JSONB
        const [newEntity] = await tx
          .insert(customEntities)
          .values({
            tenantId: this.tenantId,
            environment,
            entityKey: entityDef.name,
            displayName: this.humanize(entityDef.name),
            displayNamePlural: this.pluralize(this.humanize(entityDef.name)),
            description: `Custom entity for ${this.moduleId} module`,
            category: this.moduleId,
            enableWorkflow: true,
            enableComments: true,
            enableAttachments: true,
            enableHistory: true,
            isSystemEntity: false,
            metadata: {
              relationships: entityDef.relationships || [],
              indexes: entityDef.indexes || [],
              softDelete: entityDef.softDelete || false
            },
            createdBy: context.userId
          })
          .returning();
        entity = newEntity;
        console.log(`[ModuleConfiguration] Created custom entity: ${entityDef.name} in ${environment}`);
      }
      
      // Track entityKey -> entityId mapping
      entityMapping.set(entityDef.name, entity.id);
      
      // Create fields
      if (entityDef.schema.fields) {
        for (let i = 0; i < entityDef.schema.fields.length; i++) {
          const field = entityDef.schema.fields[i];
          
          // ISSUE 3 FIX: Check if field already exists (idempotency)
          const existingField = await tx
            .select()
            .from(customFields)
            .where(
              and(
                eq(customFields.entityId, entity.id),
                eq(customFields.fieldKey, field.name),
                eq(customFields.tenantId, this.tenantId)
              )
            )
            .limit(1);
          
          if (existingField.length > 0) {
            console.log(`[ModuleConfiguration] Field ${field.name} already exists for entity ${entityDef.name}, skipping creation`);
            continue;
          }
          
          // Prepare field options for relation fields
          let fieldOptions: any = field.options ? { options: field.options } : null;
          if (field.type === 'relation' && field.ref) {
            fieldOptions = fieldOptions 
              ? { ...fieldOptions, relationTarget: field.ref }
              : { relationTarget: field.ref };
          }
          
          await tx.insert(customFields).values({
            tenantId: this.tenantId,
            environment,
            entityId: entity.id,
            fieldKey: field.name,
            displayName: this.humanize(field.name),
            description: `Field ${field.name}`,
            fieldType: this.mapFieldTypeToDb(field.type),
            fieldOptions: fieldOptions,
            validationRules: field.required ? { required: true } : null,
            defaultValue: field.default || null,
            fieldOrder: i,
            isRequired: field.required || false,
            isUnique: field.unique || false,
            isSearchable: ['text', 'email'].includes(field.type)
          });
        }
      }
    }
    
    return entityMapping;
  }
  
  /**
   * Create custom workflows (stub for now)
   * ISSUE 2 FIX: Added transaction parameter
   * TEMPLATE BUG FIX: Added environment parameter
   */
  private async createCustomWorkflows(
    workflows: any[], 
    environment: 'sandbox' | 'production' = 'sandbox',
    tx: any = db
  ): Promise<void> {
    // TODO: Implement workflow creation using entityWorkflowStates table
    console.log(`[ModuleConfiguration] Creating ${workflows.length} custom workflows in ${environment} (stub)`);
  }
  
  /**
   * Save configuration metadata for tracking and rollback
   * ISSUE 2 FIX: Added transaction parameter
   * TEMPLATE BUG FIX: Added environment parameter
   */
  private async saveConfigurationMetadata(
    config: ModuleConfiguration,
    context: ModuleContext,
    environment: 'sandbox' | 'production' = 'sandbox',
    tx: any = db
  ): Promise<void> {
    // TODO: Create a moduleConfigurations table to track:
    // - What template was applied
    // - When it was applied
    // - By which user
    // - Configuration snapshot (for rollback)
    console.log(`[ModuleConfiguration] Saving configuration metadata in ${environment} (stub)`);
  }
  
  /**
   * Track template usage for pattern recognition
   */
  private async trackTemplateUsage(templateId: string): Promise<void> {
    // TODO: Increment usage counter for this template
    // This will be used to suggest popular templates to new tenants
    console.log(`[ModuleConfiguration] Tracking template usage: ${templateId} (stub)`);
  }
  
  // ==========================================================================
  // HELPERS
  // ==========================================================================
  
  private mapFieldType(dbType: string): FieldDefinition['type'] {
    const mapping: Record<string, FieldDefinition['type']> = {
      'text': 'text',
      'email': 'email',
      'phone': 'phone',
      'url': 'url',
      'number': 'number',
      'decimal': 'decimal',
      'boolean': 'boolean',
      'date': 'date',
      'datetime': 'datetime',
      'json': 'json',
      'enum': 'enum',
      'relation': 'relation'
    };
    return mapping[dbType] || 'text';
  }
  
  private mapFieldTypeToDb(fieldType: FieldDefinition['type']): string {
    return fieldType; // Same mapping for now
  }
  
  private humanize(str: string): string {
    return str
      .replace(/([A-Z])/g, ' $1')
      .replace(/_/g, ' ')
      .replace(/^./, s => s.toUpperCase())
      .trim();
  }
  
  private pluralize(str: string): string {
    if (str.endsWith('s')) return str;
    if (str.endsWith('y')) return str.slice(0, -1) + 'ies';
    return str + 's';
  }
}

// ============================================================================
// MODULE CONFIGURATION HELPERS
// ============================================================================

/**
 * Get runtime entities for a module (core + custom)
 */
export async function getModuleEntities(
  module: IModule,
  tenantId: string
): Promise<EntityDefinition[]> {
  if (!module.configurable) {
    // Non-configurable module - just return core entities
    return module.entities;
  }
  
  // Configurable module - load core + custom
  const configManager = new ModuleConfigurationManager(tenantId, module.metadata.id);
  const customEntities = await configManager.loadCustomEntities();
  
  // Combine core entities with custom entities
  const coreEntities = module.coreEntities || module.entities;
  return [...coreEntities, ...customEntities];
}

/**
 * Configure a module for a tenant
 */
export async function configureModule(
  module: IModule,
  tenantId: string,
  config: ModuleConfiguration,
  context: ModuleContext
): Promise<void> {
  if (!module.configurable) {
    throw new Error(`Module ${module.metadata.id} is not configurable`);
  }
  
  const configManager = new ModuleConfigurationManager(tenantId, module.metadata.id);
  
  // Validate relationships if custom entities are being added
  if (config.customEntities && module.coreEntities) {
    configManager.validateEntityRelationships(config.customEntities, module.coreEntities);
  }
  
  // Apply configuration
  await configManager.applyConfiguration(config, context);
  
  // Call module's configure hook if it exists
  if (module.configure) {
    // IMPORTANT: Initialize module first (sets tenantId required by configure)
    if (typeof module.initialize === 'function') {
      await module.initialize(tenantId);
    }
    await module.configure(config, context);
  }
}
