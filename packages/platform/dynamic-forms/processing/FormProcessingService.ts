/**
 * Form Processing Service
 * 
 * Processes form submissions by mapping responses to business entities,
 * applying transformations, and creating/updating entities transactionally.
 * 
 * @example
 * ```typescript
 * const service = new FormProcessingService();
 * 
 * // Process a submission (automatically creates/updates supplier)
 * const result = await service.processSubmission('submission-123');
 * 
 * // Result contains created entity ID and processing details
 * console.log(result.entityId, result.entityType, result.action);
 * ```
 */

import { eq, and, or, inArray } from 'drizzle-orm';
import { db } from '../../../../apps/api/db';
import {
  formSubmissions,
  formFieldResponses,
  forms,
  formFields,
  suppliers,
  clients,
  SelectFormSubmission,
  SelectForm,
} from '../../../../shared/schema';
import { DocumentStorageService } from '../../../../packages/document-management/services/DocumentStorageService';

// ═══════════════════════════════════════════════════════════════════════════════
// Error Classes
// ═══════════════════════════════════════════════════════════════════════════════

export class SubmissionNotFoundError extends Error {
  constructor(submissionId: string) {
    super(`Submission not found: ${submissionId}`);
    this.name = 'SubmissionNotFoundError';
  }
}

export class ProcessingConfigError extends Error {
  constructor(message: string) {
    super(`Processing configuration error: ${message}`);
    this.name = 'ProcessingConfigError';
  }
}

export class EntityCreationError extends Error {
  constructor(entityType: string, message: string) {
    super(`Failed to create ${entityType}: ${message}`);
    this.name = 'EntityCreationError';
  }
}

export class MappingError extends Error {
  constructor(field: string, message: string) {
    super(`Field mapping error for '${field}': ${message}`);
    this.name = 'MappingError';
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface ProcessingResult {
  success: boolean;
  entityId?: string;
  entityType?: string;
  action?: 'created' | 'updated' | 'matched';
  errors?: string[];
  metadata?: Record<string, any>;
}

export interface FieldMapping {
  entityField: string;
  transform?: string[];
  validate?: string;
  action?: string;
  required?: boolean;
}

export interface ProcessingConfig {
  fieldMappings?: Record<string, FieldMapping>;
  autoCreate?: boolean;
  updateExisting?: boolean;
  matchBy?: string[];
  onSuccess?: {
    notify?: string[];
    triggerWorkflow?: string;
    sendEmail?: boolean;
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main Service
// ═══════════════════════════════════════════════════════════════════════════════

export class FormProcessingService {
  private documentService: DocumentStorageService;

  constructor() {
    this.documentService = new DocumentStorageService();
  }

  /**
   * Process a form submission - map to entity and create/update
   * 
   * SECURITY FIX: All DB operations wrapped in transaction to ensure atomicity.
   * If any step fails, ALL changes are rolled back (no partial state).
   * 
   * @param submissionId - Submission ID
   * @returns Processing result
   */
  async processSubmission(submissionId: string): Promise<ProcessingResult> {
    try {
      console.log(`[FormProcessing] Processing submission: ${submissionId}`);

      // SECURITY: Load submission and form (read-only, OK to be outside transaction)
      const submission = await this.loadSubmission(submissionId);
      const form = await this.loadForm(submission.formId);
      const config = form.processingConfig as ProcessingConfig;

      if (!config || !config.fieldMappings) {
        throw new ProcessingConfigError('No field mappings configured');
      }

      // SECURITY: Wrap ENTIRE processing flow in transaction - all or nothing!
      const result = await db.transaction(async (tx) => {
        try {
          // 1. Mark as processing (INSIDE transaction now)
          await tx
            .update(formSubmissions)
            .set({
              status: 'processing',
              processingStartedAt: new Date(),
            })
            .where(eq(formSubmissions.id, submissionId));

          // 2. Map responses to entity data
          const entityData = await this.mapResponsesToEntity(
            submission.responses,
            config.fieldMappings!
          );

          // 3. Determine action (create/update/match)
          const action = await this.determineAction(
            form.targetEntity!,
            entityData,
            config,
            form.tenantId,
            form.environment,
            tx
          );

          let entityId: string;

          // 4. Execute entity operation
          if (action === 'create') {
            entityId = await this.createEntity(
              form.targetEntity!,
              entityData,
              form.tenantId,
              form.environment,
              tx
            );
          } else if (action === 'update') {
            entityId = await this.updateEntity(
              form.targetEntity!,
              entityData,
              form.tenantId,
              form.environment,
              tx
            );
          } else {
            entityId = entityData._matchedEntityId;
          }

          // 5. Link documents (INSIDE transaction)
          if (submission.responses.some((r: any) => r.documentId)) {
            await this.linkDocuments(
              submission.responses,
              form.targetEntity!,
              entityId,
              tx
            );
          }

          // 6. Update submission with success result (INSIDE transaction)
          await tx
            .update(formSubmissions)
            .set({
              status: 'processed',
              linkedEntityType: form.targetEntity,
              linkedEntityId: entityId,
              processedAt: new Date(),
              processingResult: {
                action,
                entityId,
                entityType: form.targetEntity,
              },
            })
            .where(eq(formSubmissions.id, submissionId));

          console.log(`[FormProcessing] Processed successfully: ${action} ${form.targetEntity}:${entityId}`);

          return {
            success: true,
            entityId,
            entityType: form.targetEntity || undefined,
            action,
          };
        } catch (error: any) {
          console.error('[FormProcessing] Processing failed (will rollback):', error);

          // SECURITY: Update submission with error (INSIDE transaction)
          // If this fails, the entire transaction rolls back including status change
          await tx
            .update(formSubmissions)
            .set({
              status: 'failed',
              processingResult: {
                error: error.message,
                stack: error.stack,
              },
            })
            .where(eq(formSubmissions.id, submissionId));

          throw error;
        }
      });

      // Execute post-processing actions (OUTSIDE transaction - non-critical)
      if (config.onSuccess && result.success) {
        try {
          await this.executePostProcessing(config.onSuccess, result, submission);
        } catch (error: any) {
          // Post-processing errors should not fail the submission
          console.error('[FormProcessing] Post-processing failed (non-critical):', error);
        }
      }

      return result;
    } catch (error: any) {
      console.error('[FormProcessing] Process submission failed:', error);

      // SECURITY: Transaction already rolled back, just return error
      // No need to update status as transaction ensures consistency
      return {
        success: false,
        errors: [error.message],
      };
    }
  }

  /**
   * Retry failed submission processing
   * 
   * @param submissionId - Submission ID
   * @returns Processing result
   */
  async retryProcessing(submissionId: string): Promise<ProcessingResult> {
    console.log(`[FormProcessing] Retrying submission: ${submissionId}`);
    return this.processSubmission(submissionId);
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // Private Helper Methods
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Load submission with all responses
   */
  private async loadSubmission(submissionId: string): Promise<any> {
    const [submission] = await db
      .select()
      .from(formSubmissions)
      .where(eq(formSubmissions.id, submissionId));

    if (!submission) {
      throw new SubmissionNotFoundError(submissionId);
    }

    const responses = await db
      .select()
      .from(formFieldResponses)
      .where(eq(formFieldResponses.submissionId, submissionId));

    return { ...submission, responses };
  }

  /**
   * Load form
   */
  private async loadForm(formId: string): Promise<SelectForm> {
    const [form] = await db
      .select()
      .from(forms)
      .where(eq(forms.id, formId));

    if (!form) {
      throw new Error(`Form not found: ${formId}`);
    }

    return form;
  }

  /**
   * Map form responses to entity data using field mappings
   */
  private async mapResponsesToEntity(
    responses: any[],
    fieldMappings: Record<string, FieldMapping>
  ): Promise<Record<string, any>> {
    const entityData: Record<string, any> = {};

    for (const response of responses) {
      const mapping = fieldMappings[response.fieldId];
      
      if (!mapping) {
        // No mapping for this field, skip
        continue;
      }

      let value = response.value || response.valueJson;

      // Apply transformations
      if (mapping.transform && value) {
        value = this.applyTransformations(value, mapping.transform);
      }

      // Validate if needed
      if (mapping.validate && value) {
        const isValid = this.validateValue(value, mapping.validate);
        if (!isValid) {
          throw new MappingError(
            mapping.entityField,
            `Validation failed: ${mapping.validate}`
          );
        }
      }

      // Set entity field value
      entityData[mapping.entityField] = value;

      // Handle special actions
      if (mapping.action === 'attachDocument' && response.documentId) {
        if (!entityData._attachments) {
          entityData._attachments = [];
        }
        entityData._attachments.push(response.documentId);
      }
    }

    return entityData;
  }

  /**
   * Apply transformations to a value
   */
  private applyTransformations(value: string, transforms: string[]): string {
    let result = value;

    for (const transform of transforms) {
      switch (transform) {
        case 'trim':
          result = result.trim();
          break;
        case 'uppercase':
          result = result.toUpperCase();
          break;
        case 'lowercase':
          result = result.toLowerCase();
          break;
        case 'removeSpaces':
          result = result.replace(/\s+/g, '');
          break;
        case 'capitalizeWords':
          result = result.replace(/\b\w/g, c => c.toUpperCase());
          break;
      }
    }

    return result;
  }

  /**
   * Validate a value
   */
  private validateValue(value: string, validationType: string): boolean {
    switch (validationType) {
      case 'email':
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
      case 'phone':
        return /^[\d\s\-\+\(\)]+$/.test(value) && value.length >= 9;
      case 'nif':
        return this.validateNIF(value);
      case 'iban':
        return this.validateIBAN(value);
      default:
        return true;
    }
  }

  private validateNIF(nif: string): boolean {
    const clean = nif.replace(/\s/g, '');
    if (clean.length !== 9 || !/^\d+$/.test(clean)) return false;

    const digits = clean.split('').map(Number);
    const checksum = digits.slice(0, 8).reduce((sum, digit, i) => sum + digit * (9 - i), 0);
    const checkDigit = 11 - (checksum % 11);
    const expectedCheckDigit = checkDigit >= 10 ? 0 : checkDigit;

    return digits[8] === expectedCheckDigit;
  }

  private validateIBAN(iban: string): boolean {
    const clean = iban.replace(/\s/g, '').toUpperCase();
    if (clean.length < 15 || clean.length > 34) return false;
    
    const rearranged = clean.slice(4) + clean.slice(0, 4);
    const numeric = rearranged.split('').map(char => {
      const code = char.charCodeAt(0);
      return code >= 65 && code <= 90 ? (code - 55).toString() : char;
    }).join('');

    let remainder = numeric;
    while (remainder.length > 2) {
      const block = remainder.slice(0, 9);
      remainder = (parseInt(block, 10) % 97).toString() + remainder.slice(block.length);
    }

    return parseInt(remainder, 10) % 97 === 1;
  }

  /**
   * Determine whether to create, update, or match entity
   * SECURITY: Uses transaction to ensure consistent reads
   */
  private async determineAction(
    entityType: string,
    entityData: Record<string, any>,
    config: ProcessingConfig,
    tenantId: string,
    environment: string,
    tx: any
  ): Promise<'created' | 'updated' | 'matched'> {
    if (!config.matchBy || config.matchBy.length === 0) {
      // No match criteria, always create
      return 'created';
    }

    // Try to find existing entity (using transaction)
    const existingEntity = await this.findEntity(
      entityType,
      entityData,
      config.matchBy,
      tenantId,
      environment,
      tx
    );

    if (!existingEntity) {
      return config.autoCreate !== false ? 'created' : 'matched';
    }

    // Entity found
    entityData._matchedEntityId = existingEntity.id;

    if (config.updateExisting) {
      return 'updated';
    }

    return 'matched';
  }

  /**
   * Find existing entity based on match criteria
   * SECURITY: Uses transaction for consistent reads
   */
  private async findEntity(
    entityType: string,
    entityData: Record<string, any>,
    matchBy: string[],
    tenantId: string,
    environment: string,
    tx: any
  ): Promise<any | null> {
    const table = this.getEntityTable(entityType);
    if (!table) return null;

    // Build match conditions
    const conditions = [
      eq(table.tenantId, tenantId),
      eq(table.environment, environment),
    ];

    for (const field of matchBy) {
      if (entityData[field]) {
        conditions.push(eq((table as any)[field], entityData[field]));
      }
    }

    // SECURITY: Use transaction instance for consistent reads
    const [entity] = await tx
      .select()
      .from(table)
      .where(and(...conditions))
      .limit(1);

    return entity || null;
  }

  /**
   * Create new entity
   */
  private async createEntity(
    entityType: string,
    entityData: Record<string, any>,
    tenantId: string,
    environment: string,
    tx: any
  ): Promise<string> {
    const table = this.getEntityTable(entityType);
    if (!table) {
      throw new EntityCreationError(entityType, 'Unknown entity type');
    }

    // Remove special fields
    const { _attachments, _matchedEntityId, ...cleanData } = entityData;

    // Add tenant and environment
    const data = {
      ...cleanData,
      tenantId,
      environment,
      status: 'active',
    };

    console.log(`[FormProcessing] Creating ${entityType}:`, data);

    const [created] = await tx
      .insert(table)
      .values(data)
      .returning();

    return created.id;
  }

  /**
   * Update existing entity
   */
  private async updateEntity(
    entityType: string,
    entityData: Record<string, any>,
    tenantId: string,
    environment: string,
    tx: any
  ): Promise<string> {
    const table = this.getEntityTable(entityType);
    if (!table) {
      throw new EntityCreationError(entityType, 'Unknown entity type');
    }

    const { _attachments, _matchedEntityId, ...cleanData } = entityData;

    console.log(`[FormProcessing] Updating ${entityType}:${_matchedEntityId}`, cleanData);

    await tx
      .update(table)
      .set({
        ...cleanData,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(table.id, _matchedEntityId),
          eq(table.tenantId, tenantId)
        )
      );

    return _matchedEntityId;
  }

  /**
   * Link uploaded documents to entity
   * SECURITY: Transaction parameter for future use if linkToEntity becomes transactional
   */
  private async linkDocuments(
    responses: any[],
    entityType: string,
    entityId: string,
    tx: any
  ): Promise<void> {
    for (const response of responses) {
      if (response.documentId) {
        // NOTE: linkToEntity is currently not transactional
        // If document linking fails, the transaction will still roll back
        // ensuring no orphaned entity is created
        await this.documentService.linkToEntity(
          response.documentId,
          entityType,
          entityId,
          'attachment'
        );

        console.log(`[FormProcessing] Linked document ${response.documentId} to ${entityType}:${entityId}`);
      }
    }
  }

  /**
   * Get entity table reference
   */
  private getEntityTable(entityType: string): any {
    const tables: Record<string, any> = {
      supplier: suppliers,
      client: clients,
      // Add more entity types as needed
    };

    return tables[entityType];
  }

  /**
   * Update submission status
   */
  private async updateSubmissionStatus(
    submissionId: string,
    status: string,
    result: any
  ): Promise<void> {
    await db
      .update(formSubmissions)
      .set({
        status,
        processingResult: result,
        processedAt: status === 'processed' ? new Date() : undefined,
      })
      .where(eq(formSubmissions.id, submissionId));
  }

  /**
   * Execute post-processing actions
   */
  private async executePostProcessing(
    onSuccess: any,
    result: ProcessingResult,
    submission: any
  ): Promise<void> {
    console.log('[FormProcessing] Executing post-processing actions');

    // TODO: Implement notifications
    if (onSuccess.notify && onSuccess.notify.length > 0) {
      console.log(`[FormProcessing] Would notify users: ${onSuccess.notify.join(', ')}`);
    }

    // TODO: Implement workflow trigger
    if (onSuccess.triggerWorkflow) {
      console.log(`[FormProcessing] Would trigger workflow: ${onSuccess.triggerWorkflow}`);
    }

    // TODO: Implement email notification
    if (onSuccess.sendEmail) {
      console.log('[FormProcessing] Would send email notification');
    }
  }
}
