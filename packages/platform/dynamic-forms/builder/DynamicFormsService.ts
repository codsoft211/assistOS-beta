/**
 * Dynamic Forms Service
 * 
 * Handles CRUD operations, versioning, and publishing of dynamic forms.
 * Forms can be used to collect data from external users (suppliers, clients, etc.)
 * and map responses to business entities.
 * 
 * @example
 * ```typescript
 * const service = new DynamicFormsService();
 * 
 * // Create a draft form
 * const form = await service.createForm('tenant-123', 'user-456', {
 *   name: 'Supplier Onboarding',
 *   description: 'Collect supplier information',
 *   targetModule: 'compras',
 *   targetEntity: 'supplier'
 * });
 * 
 * // Add fields
 * await service.addField(form.id, {
 *   label: 'Company Name',
 *   fieldType: 'text',
 *   required: true,
 *   order: 1
 * });
 * 
 * // Publish (makes immutable, generates public token)
 * await service.publishForm(form.id, 'user-456');
 * ```
 */

import { eq, and, desc, or, ilike, inArray } from 'drizzle-orm';
import { db } from '../../../../apps/api/db';
import {
  forms,
  formFields,
  InsertForm,
  SelectForm,
  SelectFormField,
  environmentColumn,
} from '../../../../shared/schema';
import crypto from 'crypto';

// ═══════════════════════════════════════════════════════════════════════════════
// Error Classes
// ═══════════════════════════════════════════════════════════════════════════════

export class FormNotFoundError extends Error {
  constructor(formId: string) {
    super(`Form not found: ${formId}`);
    this.name = 'FormNotFoundError';
  }
}

export class FormAlreadyPublishedError extends Error {
  constructor(formId: string) {
    super(`Form is already published and cannot be modified: ${formId}`);
    this.name = 'FormAlreadyPublishedError';
  }
}

export class FieldNotFoundError extends Error {
  constructor(fieldId: string) {
    super(`Form field not found: ${fieldId}`);
    this.name = 'FieldNotFoundError';
  }
}

export class InvalidFormStatusError extends Error {
  constructor(status: string, action: string) {
    super(`Cannot ${action} form with status: ${status}`);
    this.name = 'InvalidFormStatusError';
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface CreateFormData {
  name: string;
  description?: string;
  targetModule?: string;
  targetEntity?: string;
  processingConfig?: any;
  settings?: any;
  environment?: string;
}

export interface UpdateFormData {
  name?: string;
  description?: string;
  targetModule?: string;
  targetEntity?: string;
  processingConfig?: any;
  settings?: any;
}

export interface CreateFieldData {
  label: string;
  fieldType: string;
  placeholder?: string;
  helpText?: string;
  defaultValue?: string;
  required?: boolean;
  validation?: any;
  options?: any[];
  conditionalLogic?: any;
  order: number;
  width?: string;
}

export interface UpdateFieldData {
  label?: string;
  placeholder?: string;
  helpText?: string;
  defaultValue?: string;
  required?: boolean;
  validation?: any;
  options?: any[];
  conditionalLogic?: any;
  order?: number;
  width?: string;
}

export interface ListFormsFilters {
  status?: 'draft' | 'published' | 'archived';
  targetModule?: string;
  targetEntity?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface FormWithFields extends SelectForm {
  fields: SelectFormField[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main Service
// ═══════════════════════════════════════════════════════════════════════════════

export class DynamicFormsService {
  /**
   * Create a new draft form
   * 
   * @param tenantId - Tenant ID
   * @param userId - User ID creating the form
   * @param data - Form data
   * @returns Created form
   */
  async createForm(
    tenantId: string,
    userId: string,
    data: CreateFormData
  ): Promise<SelectForm> {
    try {
      console.log(`[DynamicForms] Creating form: ${data.name}`);

      const [form] = await db.insert(forms).values({
        tenantId,
        environment: data.environment || 'production',
        name: data.name,
        description: data.description,
        targetModule: data.targetModule,
        targetEntity: data.targetEntity,
        processingConfig: data.processingConfig || {},
        settings: data.settings || {},
        status: 'draft',
        version: 1,
        createdBy: userId,
      }).returning();

      console.log(`[DynamicForms] Form created: ${form.id}`);
      return form;
    } catch (error: any) {
      console.error('[DynamicForms] Create form failed:', error);
      throw error;
    }
  }

  /**
   * Update a draft form
   * 
   * @param formId - Form ID
   * @param data - Updated form data
   * @returns Updated form
   */
  async updateForm(formId: string, data: UpdateFormData): Promise<SelectForm> {
    try {
      console.log(`[DynamicForms] Updating form: ${formId}`);

      // Check form exists and is draft
      const form = await this.getForm(formId);
      if (form.status !== 'draft') {
        throw new FormAlreadyPublishedError(formId);
      }

      const [updated] = await db
        .update(forms)
        .set({
          ...data,
          updatedAt: new Date(),
        })
        .where(eq(forms.id, formId))
        .returning();

      console.log(`[DynamicForms] Form updated: ${formId}`);
      return updated;
    } catch (error: any) {
      console.error('[DynamicForms] Update form failed:', error);
      throw error;
    }
  }

  /**
   * Add a field to a form
   * 
   * @param formId - Form ID
   * @param data - Field data
   * @returns Created field
   */
  async addField(formId: string, data: CreateFieldData): Promise<SelectFormField> {
    try {
      console.log(`[DynamicForms] Adding field to form: ${formId}`);

      // Check form exists and is draft
      const form = await this.getForm(formId);
      if (form.status !== 'draft') {
        throw new FormAlreadyPublishedError(formId);
      }

      const [field] = await db.insert(formFields).values({
        formId,
        formVersion: form.version,
        label: data.label,
        fieldType: data.fieldType,
        placeholder: data.placeholder,
        helpText: data.helpText,
        defaultValue: data.defaultValue,
        required: data.required || false,
        validation: data.validation,
        options: data.options,
        conditionalLogic: data.conditionalLogic,
        order: data.order,
        width: data.width || 'full',
      }).returning();

      console.log(`[DynamicForms] Field added: ${field.id}`);
      return field;
    } catch (error: any) {
      console.error('[DynamicForms] Add field failed:', error);
      throw error;
    }
  }

  /**
   * Update a field
   * 
   * @param fieldId - Field ID
   * @param data - Updated field data
   * @returns Updated field
   */
  async updateField(fieldId: string, data: UpdateFieldData): Promise<SelectFormField> {
    try {
      console.log(`[DynamicForms] Updating field: ${fieldId}`);

      // Get field and check form is draft
      const [field] = await db
        .select()
        .from(formFields)
        .where(eq(formFields.id, fieldId));

      if (!field) {
        throw new FieldNotFoundError(fieldId);
      }

      const form = await this.getForm(field.formId);
      if (form.status !== 'draft') {
        throw new FormAlreadyPublishedError(field.formId);
      }

      const [updated] = await db
        .update(formFields)
        .set(data)
        .where(eq(formFields.id, fieldId))
        .returning();

      console.log(`[DynamicForms] Field updated: ${fieldId}`);
      return updated;
    } catch (error: any) {
      console.error('[DynamicForms] Update field failed:', error);
      throw error;
    }
  }

  /**
   * Reorder fields in a form
   * 
   * @param formId - Form ID
   * @param fieldIds - Array of field IDs in desired order
   */
  async reorderFields(formId: string, fieldIds: string[]): Promise<void> {
    try {
      console.log(`[DynamicForms] Reordering fields for form: ${formId}`);

      // Check form is draft
      const form = await this.getForm(formId);
      if (form.status !== 'draft') {
        throw new FormAlreadyPublishedError(formId);
      }

      // Update order for each field
      await db.transaction(async (tx) => {
        for (let i = 0; i < fieldIds.length; i++) {
          await tx
            .update(formFields)
            .set({ order: i + 1 })
            .where(
              and(
                eq(formFields.id, fieldIds[i]),
                eq(formFields.formId, formId)
              )
            );
        }
      });

      console.log(`[DynamicForms] Fields reordered for form: ${formId}`);
    } catch (error: any) {
      console.error('[DynamicForms] Reorder fields failed:', error);
      throw error;
    }
  }

  /**
   * Publish a form (makes it immutable, generates public token)
   * 
   * @param formId - Form ID
   * @param userId - User ID publishing the form
   * @returns Published form
   */
  async publishForm(formId: string, userId: string): Promise<SelectForm> {
    try {
      console.log(`[DynamicForms] Publishing form: ${formId}`);

      const form = await this.getForm(formId);
      if (form.status !== 'draft') {
        throw new InvalidFormStatusError(form.status, 'publish');
      }

      // Generate unique public token
      const publicToken = crypto.randomBytes(32).toString('hex');

      const [published] = await db
        .update(forms)
        .set({
          status: 'published',
          publishedAt: new Date(),
          publicToken,
          updatedAt: new Date(),
        })
        .where(eq(forms.id, formId))
        .returning();

      console.log(`[DynamicForms] Form published: ${formId} (token: ${publicToken})`);
      return published;
    } catch (error: any) {
      console.error('[DynamicForms] Publish form failed:', error);
      throw error;
    }
  }

  /**
   * Archive a form
   * 
   * @param formId - Form ID
   * @returns Archived form
   */
  async archiveForm(formId: string): Promise<SelectForm> {
    try {
      console.log(`[DynamicForms] Archiving form: ${formId}`);

      const [archived] = await db
        .update(forms)
        .set({
          status: 'archived',
          updatedAt: new Date(),
        })
        .where(eq(forms.id, formId))
        .returning();

      console.log(`[DynamicForms] Form archived: ${formId}`);
      return archived;
    } catch (error: any) {
      console.error('[DynamicForms] Archive form failed:', error);
      throw error;
    }
  }

  /**
   * Get a form by ID
   * 
   * @param formId - Form ID
   * @returns Form
   */
  async getForm(formId: string): Promise<SelectForm> {
    const [form] = await db
      .select()
      .from(forms)
      .where(eq(forms.id, formId));

    if (!form) {
      throw new FormNotFoundError(formId);
    }

    return form;
  }

  /**
   * Get a form with all its fields
   * 
   * @param formId - Form ID
   * @returns Form with fields
   */
  async getFormWithFields(formId: string): Promise<FormWithFields> {
    const form = await this.getForm(formId);

    const fields = await db
      .select()
      .from(formFields)
      .where(eq(formFields.formId, formId))
      .orderBy(formFields.order);

    return {
      ...form,
      fields,
    };
  }

  /**
   * Get form by public token
   * 
   * @param publicToken - Public token
   * @returns Form with fields
   */
  async getFormByToken(publicToken: string): Promise<FormWithFields> {
    const [form] = await db
      .select()
      .from(forms)
      .where(eq(forms.publicToken, publicToken));

    if (!form) {
      throw new FormNotFoundError(`token:${publicToken}`);
    }

    if (form.status !== 'published') {
      throw new InvalidFormStatusError(form.status, 'access');
    }

    const fields = await db
      .select()
      .from(formFields)
      .where(eq(formFields.formId, form.id))
      .orderBy(formFields.order);

    return {
      ...form,
      fields,
    };
  }

  /**
   * List forms for a tenant with filters
   * 
   * @param tenantId - Tenant ID
   * @param filters - Optional filters
   * @returns Array of forms
   */
  async listForms(
    tenantId: string,
    filters: ListFormsFilters = {}
  ): Promise<SelectForm[]> {
    try {
      const conditions = [eq(forms.tenantId, tenantId)];

      if (filters.status) {
        conditions.push(eq(forms.status, filters.status));
      }

      if (filters.targetModule) {
        conditions.push(eq(forms.targetModule, filters.targetModule));
      }

      if (filters.targetEntity) {
        conditions.push(eq(forms.targetEntity, filters.targetEntity));
      }

      if (filters.search) {
        conditions.push(
          or(
            ilike(forms.name, `%${filters.search}%`),
            ilike(forms.description, `%${filters.search}%`)
          )!
        );
      }

      let query = db
        .select()
        .from(forms)
        .where(and(...conditions))
        .orderBy(desc(forms.createdAt))
        .$dynamic();

      if (filters.limit) {
        query = query.limit(filters.limit);
      }

      if (filters.offset) {
        query = query.offset(filters.offset);
      }

      const results = await query;
      return results;
    } catch (error: any) {
      console.error('[DynamicForms] List forms failed:', error);
      throw error;
    }
  }

  /**
   * Delete a field (only for draft forms)
   * 
   * @param fieldId - Field ID
   */
  async deleteField(fieldId: string): Promise<void> {
    try {
      console.log(`[DynamicForms] Deleting field: ${fieldId}`);

      // Get field and check form is draft
      const [field] = await db
        .select()
        .from(formFields)
        .where(eq(formFields.id, fieldId));

      if (!field) {
        throw new FieldNotFoundError(fieldId);
      }

      const form = await this.getForm(field.formId);
      if (form.status !== 'draft') {
        throw new FormAlreadyPublishedError(field.formId);
      }

      await db
        .delete(formFields)
        .where(eq(formFields.id, fieldId));

      console.log(`[DynamicForms] Field deleted: ${fieldId}`);
    } catch (error: any) {
      console.error('[DynamicForms] Delete field failed:', error);
      throw error;
    }
  }

  /**
   * Create a new version of a published form (for future iterations)
   * 
   * @param formId - Form ID
   * @param userId - User ID creating new version
   * @returns New draft form (copy of published)
   */
  async createNewVersion(formId: string, userId: string): Promise<SelectForm> {
    try {
      console.log(`[DynamicForms] Creating new version of form: ${formId}`);

      const form = await this.getFormWithFields(formId);
      if (form.status !== 'published') {
        throw new InvalidFormStatusError(form.status, 'create new version from');
      }

      const newForm = await db.transaction(async (tx) => {
        // Create new form with incremented version
        const [newFormRecord] = await tx.insert(forms).values({
          tenantId: form.tenantId,
          environment: form.environment,
          name: form.name,
          description: form.description,
          targetModule: form.targetModule,
          targetEntity: form.targetEntity,
          processingConfig: form.processingConfig,
          settings: form.settings,
          status: 'draft',
          version: form.version + 1,
          createdBy: userId,
        }).returning();

        // Copy all fields
        for (const field of form.fields) {
          await tx.insert(formFields).values({
            formId: newFormRecord.id,
            formVersion: newFormRecord.version,
            label: field.label,
            fieldType: field.fieldType,
            placeholder: field.placeholder,
            helpText: field.helpText,
            defaultValue: field.defaultValue,
            required: field.required,
            validation: field.validation,
            options: field.options,
            conditionalLogic: field.conditionalLogic,
            order: field.order,
            width: field.width,
          });
        }

        return newFormRecord;
      });

      console.log(`[DynamicForms] New version created: ${newForm.id} (v${newForm.version})`);
      return newForm;
    } catch (error: any) {
      console.error('[DynamicForms] Create new version failed:', error);
      throw error;
    }
  }
}
