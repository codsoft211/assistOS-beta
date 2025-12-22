/**
 * Dynamic Forms Service - Main Exports
 * 
 * A comprehensive service for building, distributing, and processing dynamic forms.
 * 
 * @module dynamic-forms
 * 
 * @example
 * ```typescript
 * import {
 *   DynamicFormsService,
 *   FieldMappingService,
 *   FormInvitationService,
 *   FormSubmissionService,
 *   FormProcessingService
 * } from '@/packages/platform/dynamic-forms';
 * 
 * // Create and publish a form
 * const formsService = new DynamicFormsService();
 * const form = await formsService.createForm(tenantId, userId, {
 *   name: 'Supplier Onboarding',
 *   targetEntity: 'supplier'
 * });
 * 
 * // Add fields
 * await formsService.addField(form.id, {
 *   label: 'Company Name',
 *   fieldType: 'text',
 *   required: true,
 *   order: 1
 * });
 * 
 * // Get AI mapping suggestions
 * const mappingService = new FieldMappingService();
 * const suggestion = await mappingService.suggestMapping(
 *   { targetEntity: 'supplier' },
 *   { label: 'NIF', fieldType: 'text' }
 * );
 * 
 * // Publish form
 * await formsService.publishForm(form.id, userId);
 * 
 * // Send invitation
 * const invitationService = new FormInvitationService();
 * await invitationService.sendInvitation({
 *   formId: form.id,
 *   recipient: { email: 'supplier@example.com' },
 *   channel: 'email',
 *   sentBy: userId
 * });
 * 
 * // Process submission
 * const processingService = new FormProcessingService();
 * const result = await processingService.processSubmission(submissionId);
 * ```
 */

// Import all service classes for internal use
import { DynamicFormsService } from './builder/DynamicFormsService';
import { FieldMappingService } from './builder/FieldMappingService';
import { FormInvitationService } from './distribution/FormInvitationService';
import { FormSubmissionService } from './submission/FormSubmissionService';
import { FormProcessingService } from './processing/FormProcessingService';

// ═══════════════════════════════════════════════════════════════════════════════
// Builder Services
// ═══════════════════════════════════════════════════════════════════════════════

export {
  DynamicFormsService,
  FormNotFoundError,
  FormAlreadyPublishedError,
  FieldNotFoundError,
  InvalidFormStatusError,
} from './builder/DynamicFormsService';
export type {
  CreateFormData,
  UpdateFormData,
  CreateFieldData,
  UpdateFieldData,
  ListFormsFilters,
  FormWithFields,
} from './builder/DynamicFormsService';

export { FieldMappingService } from './builder/FieldMappingService';
export type {
  FormContext,
  FieldInfo,
  MappingSuggestion,
} from './builder/FieldMappingService';

// ═══════════════════════════════════════════════════════════════════════════════
// Distribution Services
// ═══════════════════════════════════════════════════════════════════════════════

export {
  FormInvitationService,
  InvitationNotFoundError,
  FormNotPublishedError,
  InvalidChannelError,
  MissingRecipientInfoError,
} from './distribution/FormInvitationService';
export type {
  RecipientInfo,
  InvitationContext,
  SendInvitationParams,
  InvitationStats,
} from './distribution/FormInvitationService';

// ═══════════════════════════════════════════════════════════════════════════════
// Submission Services
// ═══════════════════════════════════════════════════════════════════════════════

export {
  FormSubmissionService,
  InvalidTokenError,
  ValidationError,
  AlreadySubmittedError,
} from './submission/FormSubmissionService';
export type {
  ValidationErrorDetail,
  FieldResponse,
  SubmitterInfo,
  SubmitFormParams,
  SubmissionResult,
} from './submission/FormSubmissionService';

// ═══════════════════════════════════════════════════════════════════════════════
// Processing Services
// ═══════════════════════════════════════════════════════════════════════════════

export {
  FormProcessingService,
  SubmissionNotFoundError,
  ProcessingConfigError,
  EntityCreationError,
  MappingError,
} from './processing/FormProcessingService';
export type {
  ProcessingResult,
  FieldMapping,
  ProcessingConfig,
} from './processing/FormProcessingService';

// ═══════════════════════════════════════════════════════════════════════════════
// Convenience Exports
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create all form services at once
 * 
 * @returns Object with all form services instantiated
 * 
 * @example
 * ```typescript
 * const services = createFormServices();
 * 
 * // Use any service
 * const form = await services.forms.createForm(...);
 * await services.invitations.sendInvitation(...);
 * await services.processing.processSubmission(...);
 * ```
 */
export function createFormServices() {
  return {
    forms: new DynamicFormsService(),
    mapping: new FieldMappingService(),
    invitations: new FormInvitationService(),
    submissions: new FormSubmissionService(),
    processing: new FormProcessingService(),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Default Export
// ═══════════════════════════════════════════════════════════════════════════════

export default {
  DynamicFormsService,
  FieldMappingService,
  FormInvitationService,
  FormSubmissionService,
  FormProcessingService,
  createFormServices,
};
