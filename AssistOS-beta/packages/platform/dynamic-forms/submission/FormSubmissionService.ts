/**
 * Form Submission Service
 * 
 * Handles public form submissions, validation, file uploads, and queuing
 * for processing.
 * 
 * @example
 * ```typescript
 * const service = new FormSubmissionService();
 * 
 * // Submit a form via invitation token
 * const submission = await service.submitForm({
 *   invitationToken: 'abc123...',
 *   responses: [
 *     { fieldId: 'field-1', value: 'ACME Corp' },
 *     { fieldId: 'field-2', value: 'supplier@acme.com' }
 *   ],
 *   submitter: {
 *     email: 'supplier@acme.com',
 *     name: 'John Doe'
 *   }
 * });
 * ```
 */

import { eq, and } from 'drizzle-orm';
import { db } from '../../../../apps/api/db';
import {
  formSubmissions,
  formFieldResponses,
  formInvitations,
  formFields,
  forms,
  SelectFormSubmission,
  SelectFormFieldResponse,
} from '../../../../shared/schema';
import { DocumentStorageService } from '../../../../packages/document-management/services/DocumentStorageService';

// ═══════════════════════════════════════════════════════════════════════════════
// Error Classes
// ═══════════════════════════════════════════════════════════════════════════════

export class InvalidTokenError extends Error {
  constructor(token: string) {
    super(`Invalid or expired invitation token: ${token}`);
    this.name = 'InvalidTokenError';
  }
}

export class ValidationError extends Error {
  constructor(message: string, public errors: ValidationErrorDetail[]) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class AlreadySubmittedError extends Error {
  constructor(invitationId: string) {
    super(`Form already submitted for invitation: ${invitationId}`);
    this.name = 'AlreadySubmittedError';
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface ValidationErrorDetail {
  fieldId: string;
  fieldLabel: string;
  error: string;
  value?: any;
}

export interface FieldResponse {
  fieldId: string;
  value?: string;
  valueJson?: any;
  fileBuffer?: Buffer;
  fileName?: string;
  fileMimeType?: string;
}

export interface SubmitterInfo {
  email?: string;
  name?: string;
  userId?: string;
}

export interface SubmitFormParams {
  invitationToken?: string;
  publicToken?: string;
  responses: FieldResponse[];
  submitter?: SubmitterInfo;
  metadata?: Record<string, any>;
}

export interface SubmissionResult {
  submission: SelectFormSubmission;
  responses: SelectFormFieldResponse[];
  validationErrors?: ValidationErrorDetail[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main Service
// ═══════════════════════════════════════════════════════════════════════════════

export class FormSubmissionService {
  private documentService: DocumentStorageService;

  constructor() {
    this.documentService = new DocumentStorageService();
  }

  /**
   * Submit a form via invitation token or public token
   * 
   * @param params - Submission parameters
   * @returns Submission result with validation errors if any
   */
  async submitForm(params: SubmitFormParams): Promise<SubmissionResult> {
    try {
      console.log('[FormSubmission] Processing form submission');

      // Get form and validate token
      const { form, fields, invitation } = await this.validateAndGetForm(params);

      // Check if already submitted
      if (invitation && invitation.submittedAt) {
        throw new AlreadySubmittedError(invitation.id);
      }

      // Validate responses against field definitions
      const validationErrors = await this.validateResponses(params.responses, fields);

      if (validationErrors.length > 0) {
        console.log(`[FormSubmission] Validation failed with ${validationErrors.length} errors`);
        throw new ValidationError('Form validation failed', validationErrors);
      }

      // Create submission in transaction
      const result = await db.transaction(async (tx) => {
        // Create submission record
        const [submission] = await tx.insert(formSubmissions).values({
          formId: form.id,
          formVersion: form.version,
          tenantId: form.tenantId,
          environment: form.environment,
          submittedBy: params.submitter?.userId,
          submitterEmail: params.submitter?.email,
          submitterName: params.submitter?.name,
          invitationId: invitation?.id,
          status: 'pending',
          metadata: params.metadata,
        }).returning();

        // Process and save responses
        const savedResponses: SelectFormFieldResponse[] = [];

        for (const response of params.responses) {
          // Handle file upload if present
          let documentId: string | undefined;
          let fileUrl: string | undefined;
          let fileName: string | undefined;

          if (response.fileBuffer) {
            const document = await this.documentService.uploadDocument(
              form.tenantId,
              params.submitter?.userId || 'anonymous',
              response.fileBuffer,
              {
                filename: response.fileName || 'upload',
                mimeType: response.fileMimeType || 'application/octet-stream',
                title: `Form submission - ${response.fileName}`,
                documentType: 'form_submission',
              }
            );

            documentId = document.id;
            fileUrl = document.storagePath;
            fileName = document.filename;

            // Link document to submission
            await this.documentService.linkToEntity(
              documentId,
              'form_submission',
              submission.id,
              'attachment'
            );
          }

          // Save response
          const [savedResponse] = await tx.insert(formFieldResponses).values({
            submissionId: submission.id,
            fieldId: response.fieldId,
            value: response.value,
            valueJson: response.valueJson,
            documentId,
            fileUrl,
            fileName,
          }).returning();

          savedResponses.push(savedResponse);
        }

        return { submission, responses: savedResponses };
      });

      // Mark invitation as submitted if applicable
      if (invitation && params.invitationToken) {
        await db
          .update(formInvitations)
          .set({
            status: 'submitted',
            submittedAt: new Date(),
            submissionId: result.submission.id,
            updatedAt: new Date(),
          })
          .where(eq(formInvitations.id, invitation.id));
      }

      // Queue processing job
      await this.queueProcessing(result.submission.id);

      console.log(`[FormSubmission] Form submitted successfully: ${result.submission.id}`);
      return result;
    } catch (error: any) {
      console.error('[FormSubmission] Submit form failed:', error);
      throw error;
    }
  }

  /**
   * Get submission by ID
   * 
   * @param submissionId - Submission ID
   * @returns Submission with responses
   */
  async getSubmission(submissionId: string): Promise<SubmissionResult> {
    try {
      const [submission] = await db
        .select()
        .from(formSubmissions)
        .where(eq(formSubmissions.id, submissionId));

      if (!submission) {
        throw new Error(`Submission not found: ${submissionId}`);
      }

      const responses = await db
        .select()
        .from(formFieldResponses)
        .where(eq(formFieldResponses.submissionId, submissionId));

      return { submission, responses };
    } catch (error: any) {
      console.error('[FormSubmission] Get submission failed:', error);
      throw error;
    }
  }

  /**
   * Update submission status
   * 
   * @param submissionId - Submission ID
   * @param status - New status
   * @param processingResult - Optional processing result
   */
  async updateStatus(
    submissionId: string,
    status: string,
    processingResult?: any
  ): Promise<void> {
    try {
      await db
        .update(formSubmissions)
        .set({
          status,
          processingResult,
          processedAt: status === 'processed' ? new Date() : undefined,
        })
        .where(eq(formSubmissions.id, submissionId));

      console.log(`[FormSubmission] Status updated: ${submissionId} -> ${status}`);
    } catch (error: any) {
      console.error('[FormSubmission] Update status failed:', error);
      throw error;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // Private Helper Methods
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Validate token and get form with fields
   * 
   * SECURITY: Comprehensive validation to prevent unauthorized access:
   * - Verifies token exists and is valid
   * - Verifies form is published
   * - Verifies tenant matches (prevents cross-tenant access)
   * - Verifies environment matches (prevents cross-environment access)
   */
  private async validateAndGetForm(params: SubmitFormParams) {
    let form;
    let fields;
    let invitation = null;

    if (params.invitationToken) {
      // SECURITY: Get invitation with validation
      const [inv] = await db
        .select()
        .from(formInvitations)
        .where(eq(formInvitations.token, params.invitationToken));

      if (!inv) {
        throw new InvalidTokenError(params.invitationToken);
      }

      invitation = inv;

      // SECURITY: Get form with strict validation
      const [f] = await db
        .select()
        .from(forms)
        .where(eq(forms.id, inv.formId));

      if (!f) {
        throw new Error(`Form not found: ${inv.formId}`);
      }

      form = f;

      // SECURITY: Verify form is published
      if (form.status !== 'published') {
        throw new Error('Form is not published');
      }

      // SECURITY: Verify environment matches (prevent cross-environment access)
      if (form.environment !== invitation.environment) {
        console.error(
          `[FormSubmission] Environment mismatch: form=${form.environment}, invitation=${invitation.environment}`
        );
        throw new Error('Environment mismatch');
      }

      // SECURITY: Verify tenant matches (prevent cross-tenant access)
      if (form.tenantId !== invitation.tenantId) {
        console.error(
          `[FormSubmission] Tenant mismatch: form=${form.tenantId}, invitation=${invitation.tenantId}`
        );
        throw new Error('Tenant mismatch');
      }

      console.log(
        `[FormSubmission] Token validated: form=${form.id}, tenant=${form.tenantId}, env=${form.environment}`
      );
    } else if (params.publicToken) {
      // SECURITY: Get form by public token
      const [f] = await db
        .select()
        .from(forms)
        .where(eq(forms.publicToken, params.publicToken));

      if (!f) {
        throw new InvalidTokenError(params.publicToken);
      }

      form = f;

      // SECURITY: Verify form is published
      if (form.status !== 'published') {
        throw new Error('Form is not published');
      }

      console.log(
        `[FormSubmission] Public token validated: form=${form.id}, tenant=${form.tenantId}, env=${form.environment}`
      );
    } else {
      throw new Error('Either invitationToken or publicToken required');
    }

    // Get form fields
    fields = await db
      .select()
      .from(formFields)
      .where(eq(formFields.formId, form.id));

    return { form, fields, invitation };
  }

  /**
   * Validate responses against field definitions
   */
  private async validateResponses(
    responses: FieldResponse[],
    fields: any[]
  ): Promise<ValidationErrorDetail[]> {
    const errors: ValidationErrorDetail[] = [];
    const responseMap = new Map(responses.map(r => [r.fieldId, r]));

    for (const field of fields) {
      const response = responseMap.get(field.id);

      // Check required fields
      if (field.required && (!response || !response.value)) {
        errors.push({
          fieldId: field.id,
          fieldLabel: field.label,
          error: 'This field is required',
        });
        continue;
      }

      if (!response) continue;

      // Validate based on field type
      const value = response.value;

      switch (field.fieldType) {
        case 'email':
          if (value && !this.isValidEmail(value)) {
            errors.push({
              fieldId: field.id,
              fieldLabel: field.label,
              error: 'Invalid email format',
              value,
            });
          }
          break;

        case 'tel':
        case 'phone':
          if (value && !this.isValidPhone(value)) {
            errors.push({
              fieldId: field.id,
              fieldLabel: field.label,
              error: 'Invalid phone number',
              value,
            });
          }
          break;

        case 'number':
          if (value && isNaN(Number(value))) {
            errors.push({
              fieldId: field.id,
              fieldLabel: field.label,
              error: 'Must be a valid number',
              value,
            });
          }
          break;

        case 'nif':
          if (value && !this.isValidNIF(value)) {
            errors.push({
              fieldId: field.id,
              fieldLabel: field.label,
              error: 'Invalid NIF (Portuguese Tax ID)',
              value,
            });
          }
          break;

        case 'iban':
          if (value && !this.isValidIBAN(value)) {
            errors.push({
              fieldId: field.id,
              fieldLabel: field.label,
              error: 'Invalid IBAN',
              value,
            });
          }
          break;
      }

      // Validate custom validation rules
      if (field.validation) {
        const validation = field.validation;

        if (validation.minLength && value && value.length < validation.minLength) {
          errors.push({
            fieldId: field.id,
            fieldLabel: field.label,
            error: `Minimum length is ${validation.minLength} characters`,
            value,
          });
        }

        if (validation.maxLength && value && value.length > validation.maxLength) {
          errors.push({
            fieldId: field.id,
            fieldLabel: field.label,
            error: `Maximum length is ${validation.maxLength} characters`,
            value,
          });
        }

        if (validation.pattern && value && !new RegExp(validation.pattern).test(value)) {
          errors.push({
            fieldId: field.id,
            fieldLabel: field.label,
            error: 'Invalid format',
            value,
          });
        }
      }
    }

    return errors;
  }

  /**
   * Queue submission for processing
   */
  private async queueProcessing(submissionId: string): Promise<void> {
    try {
      console.log(`[FormSubmission] Queuing submission for processing: ${submissionId}`);

      // TODO: Integrate with BullMQ or existing job queue
      // Example:
      // await formProcessingQueue.add('process-submission', {
      //   submissionId
      // });

      console.log('[FormSubmission] Processing queue placeholder - implement job queue integration');

      // For now, just mark as queued
      await db
        .update(formSubmissions)
        .set({
          status: 'queued',
          processingStartedAt: new Date(),
        })
        .where(eq(formSubmissions.id, submissionId));
    } catch (error: any) {
      console.error('[FormSubmission] Queue processing failed:', error);
      throw error;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // Validation Helpers
  // ═══════════════════════════════════════════════════════════════════════════════

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  private isValidPhone(phone: string): boolean {
    // Simple validation - can be enhanced
    const phoneRegex = /^[\d\s\-\+\(\)]+$/;
    return phone.length >= 9 && phoneRegex.test(phone);
  }

  private isValidNIF(nif: string): boolean {
    // Portuguese NIF validation
    const clean = nif.replace(/\s/g, '');
    if (clean.length !== 9 || !/^\d+$/.test(clean)) return false;

    const digits = clean.split('').map(Number);
    const checksum = digits.slice(0, 8).reduce((sum, digit, i) => sum + digit * (9 - i), 0);
    const checkDigit = 11 - (checksum % 11);
    const expectedCheckDigit = checkDigit >= 10 ? 0 : checkDigit;

    return digits[8] === expectedCheckDigit;
  }

  private isValidIBAN(iban: string): boolean {
    // Basic IBAN validation
    const clean = iban.replace(/\s/g, '').toUpperCase();
    if (clean.length < 15 || clean.length > 34) return false;
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(clean)) return false;

    // Move first 4 characters to end
    const rearranged = clean.slice(4) + clean.slice(0, 4);
    
    // Convert letters to numbers (A=10, B=11, etc.)
    const numeric = rearranged.split('').map(char => {
      const code = char.charCodeAt(0);
      return code >= 65 && code <= 90 ? (code - 55).toString() : char;
    }).join('');

    // Perform mod 97 check
    let remainder = numeric;
    while (remainder.length > 2) {
      const block = remainder.slice(0, 9);
      remainder = (parseInt(block, 10) % 97).toString() + remainder.slice(block.length);
    }

    return parseInt(remainder, 10) % 97 === 1;
  }
}
