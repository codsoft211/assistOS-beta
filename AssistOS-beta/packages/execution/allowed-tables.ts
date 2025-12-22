/**
 * Allowed Tables Whitelist for Workflow Actions
 * 
 * SECURITY: This file defines the ONLY tables that can be accessed via
 * create_record and update_record actions. This prevents SQL injection
 * and unauthorized table access.
 * 
 * All tables MUST have a tenantId column for multi-tenant security.
 */

import {
  documents,
  invoices,
  notifications,
  customEntityRecords,
  eventLog,
  workflowExecutions,
  automationExecutions,
  clients,
  commercialLeads,
  suppliers,
  purchaseOrders,
  messages,
  conversations,
  tasks,
  projects,
} from '../../shared/schema';

/**
 * Per-Table Updatable Columns Allowlist
 * 
 * CRITICAL SECURITY: Defines which columns can be updated for each table.
 * This prevents:
 * 1. Tenant escalation via snake_case tenant_id updates
 * 2. Cross-tenant attacks via foreign key manipulation (clientId, supplierId, etc.)
 * 3. Audit trail tampering (createdAt, createdBy, updatedAt)
 * 4. Primary key manipulation
 * 
 * RULES:
 * - ONLY business-logic fields should be in these allowlists
 * - NEVER include: id, tenantId, tenant_id, createdAt, createdBy, updatedAt, updatedBy
 * - NEVER include: Foreign keys that link to other tenant resources
 * - NEVER include: Computed/system fields
 */
export const UPDATABLE_COLUMNS: Record<string, string[]> = {
  // Document Management - Only metadata and status
  'documents': [
    'title',           // User-editable title
    'description',     // User-editable description
    'status',          // Document status (active, archived, etc.)
    'tags',            // Document tags
    'metadata',        // Additional metadata
  ],
  
  // Financial - Only status and notes
  'invoices': [
    'status',          // Invoice status
    'paymentStatus',   // Payment status
    'paymentMethod',   // Payment method
    'notes',           // Notes
    'metadata',        // Additional metadata
    'category',        // Category
    'costCenter',      // Cost center
  ],
  
  // Communication - Only read status and metadata
  'notifications': [
    'read',            // Read status (ONLY updatable field for notifications)
    'readAt',          // Read timestamp
    'metadata',        // Additional metadata
  ],
  
  'messages': [
    'isRead',          // Read status
    'readAt',          // Read timestamp
    'metadata',        // Additional metadata
  ],
  
  'conversations': [
    'title',           // Conversation title
    'tags',            // Tags
    'isRead',          // Read status
    'readAt',          // Read timestamp
    'priority',        // Priority
    'status',          // Status
    'moduleSlug',      // Module slug
    'module',          // Module
    'type',            // Type
    'phaseData',       // Phase data
  ],
  
  // Workflow Execution - Only status tracking
  'event_log': [
    'status',          // Processing status (pending → processed → failed)
    'metadata',        // Additional metadata
  ],
  
  'workflow_executions': [
    'status',          // Execution status
    'errorMessage',    // Error message (for manual error logging)
  ],
  
  'automation_executions': [
    'status',          // Execution status
    'errorMessage',    // Error message (for manual error logging)
  ],
  
  // Generic Entities
  'custom_entity_records': [
    'data',            // Entity data (JSON)
    'status',          // Record status
  ],
  
  // CRM - Contact information and status (NO foreign keys like ownerId)
  'clients': [
    'name',            // Client name
    'email',           // Email
    'phone',           // Phone
    'company',         // Company name
    'nif',             // Tax ID
    'address',         // Address
    'city',            // City
    'postalCode',      // Postal code
    'country',         // Country
    'district',        // District
    'website',         // Website
    'otherInfo',       // Other information (JSON)
    'status',          // Client status (Ativo, Inativo, etc.)
  ],
  
  'commercial_leads': [
    'description',     // Lead description
    'originalRequest', // Original request
    'contactName',     // Contact name
    'contactPhone',    // Contact phone
    'contactEmail',    // Contact email
    'status',          // Lead status
    'leadSource',      // Lead source
    'eventType',       // Event type
    'location',        // Location
    'eventDate',       // Event date
    'numPax',          // Number of people
    'valuePerPax',     // Value per person
    'budgetTotal',     // Budget total
    'comments',        // Comments
  ],
  
  // Procurement - Contact and terms (NO foreign keys, NO metrics)
  'suppliers': [
    'name',                    // Supplier name
    'legalName',               // Legal name
    'taxId',                   // Tax ID
    'address',                 // Address
    'city',                    // City
    'postalCode',              // Postal code
    'country',                 // Country
    'email',                   // Email
    'phone',                   // Phone
    'website',                 // Website
    'primaryContactName',      // Primary contact name
    'primaryContactEmail',     // Primary contact email
    'primaryContactPhone',     // Primary contact phone
    'category',                // Category
    'type',                    // Type (preferred, approved, trial, blocked)
    'paymentTerms',            // Payment terms
    'deliveryTerms',           // Delivery terms
    'currency',                // Currency
    'minimumOrderValue',       // Minimum order value
    'averageLeadTimeDays',     // Average lead time
    'bankName',                // Bank name
    'iban',                    // IBAN
    'swiftBic',                // SWIFT/BIC
    'isActive',                // Active status
    'blockedReason',           // Blocked reason
    'notes',                   // Notes
  ],
  
  'purchase_orders': [
    'status',                  // Order status
    'supplierContactName',     // Supplier contact name
    'supplierContactEmail',    // Supplier contact email
    'supplierComments',        // Supplier comments
    'notes',                   // Notes
    'deliveryAddress',         // Delivery address
    'deliveryCity',            // Delivery city
    'deliveryPostalCode',      // Delivery postal code
    'deliveryCountry',         // Delivery country
    'paymentTerms',            // Payment terms
    'deliveryTerms',           // Delivery terms
  ],
  
  // Project Management - Only business fields (NO foreign keys)
  'tasks': [
    'title',           // Task title
    'description',     // Description
    'status',          // Status (todo, in_progress, done, etc.)
    'priority',        // Priority
    'dueDate',         // Due date
    'tags',            // Tags
  ],
  
  'projects': [
    'name',            // Project name
    'description',     // Description
    'status',          // Status
    'startDate',       // Start date
    'endDate',         // End date
    'eventDate',       // Event date
    'plannedBudget',   // Planned budget
    'estimatedBudget', // Estimated budget
    'priority',        // Priority
    'projectType',     // Project type
    'tags',            // Tags
    'notes',           // Notes
    'cateringPhase',   // Catering phase
    'baselineData',    // Baseline data
    'metadata',        // Metadata
  ],
};

/**
 * Whitelist of tables permitted for workflow actions.
 * 
 * Key: Table name (string) used in workflow configs
 * Value: Drizzle table schema object
 * 
 * IMPORTANT: Only add tables that:
 * 1. Have a tenantId column
 * 2. Should be accessible via workflows/automations
 * 3. Are safe for tenant-scoped CRUD operations
 */
export const ALLOWED_TABLES = {
  // Document Management
  'documents': documents,
  
  // Financial
  'invoices': invoices,
  
  // Communication
  'notifications': notifications,
  'messages': messages,
  'conversations': conversations,
  
  // Workflow Execution
  'event_log': eventLog,
  'workflow_executions': workflowExecutions,
  'automation_executions': automationExecutions,
  
  // Generic Entities
  'custom_entity_records': customEntityRecords,
  
  // CRM
  'clients': clients,
  'commercial_leads': commercialLeads,
  
  // Procurement
  'suppliers': suppliers,
  'purchase_orders': purchaseOrders,
  
  // Project Management
  'tasks': tasks,
  'projects': projects,
} as const;

/**
 * Type-safe table name type
 */
export type AllowedTableName = keyof typeof ALLOWED_TABLES;

/**
 * Get list of allowed table names
 */
export function getAllowedTableNames(): string[] {
  return Object.keys(ALLOWED_TABLES);
}

/**
 * Check if a table name is allowed
 */
export function isTableAllowed(tableName: string): tableName is AllowedTableName {
  return tableName in ALLOWED_TABLES;
}

/**
 * Get per-table allowlist of updatable columns
 * 
 * Returns the list of columns that are safe to update for a given table.
 * Returns empty array if table is not in the allowlist (which should never happen
 * if isTableAllowed is checked first).
 */
export function getUpdatableColumns(tableName: string): string[] {
  return UPDATABLE_COLUMNS[tableName] || [];
}
