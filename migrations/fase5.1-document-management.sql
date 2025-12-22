-- FASE 5.1: Document Management System
-- Migration to create 10 new tables for centralized document management
-- Created: 2025-10-31

-- ============================================================================
-- 1. TENANT STORAGE PROVIDERS
-- Manages multi-provider configuration (GCS, S3, Azure, Dropbox, etc.)
-- ============================================================================
CREATE TABLE IF NOT EXISTS tenant_storage_providers (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  provider_type TEXT NOT NULL, -- gcs, s3, azure, dropbox, google_drive, sharepoint, box, webdav, minio, local
  provider_name TEXT NOT NULL,
  
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  priority INTEGER NOT NULL DEFAULT 0,
  
  config JSONB,
  capabilities JSONB,
  
  last_sync_at TIMESTAMP,
  last_sync_status TEXT,
  sync_cursor TEXT,
  
  credential_id VARCHAR, -- FK added after provider_credentials is created
  
  created_by VARCHAR REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tenant_storage_providers_tenant_idx ON tenant_storage_providers(tenant_id);
CREATE INDEX IF NOT EXISTS tenant_storage_providers_type_idx ON tenant_storage_providers(provider_type);
CREATE INDEX IF NOT EXISTS tenant_storage_providers_default_idx ON tenant_storage_providers(tenant_id, is_default);

-- ============================================================================
-- 2. PROVIDER CREDENTIALS
-- Encrypted credentials (AES-256, tenant-scoped KMS)
-- ============================================================================
CREATE TABLE IF NOT EXISTS provider_credentials (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  provider_type TEXT NOT NULL,
  
  encrypted_data TEXT NOT NULL,
  encryption_key_id TEXT NOT NULL,
  
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMP,
  
  last_validated_at TIMESTAMP,
  is_valid BOOLEAN NOT NULL DEFAULT true,
  
  created_by VARCHAR REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS provider_credentials_tenant_idx ON provider_credentials(tenant_id);

-- Add FK from tenant_storage_providers to provider_credentials now
ALTER TABLE tenant_storage_providers 
  ADD CONSTRAINT tenant_storage_providers_credential_fk 
  FOREIGN KEY (credential_id) REFERENCES provider_credentials(id);

-- ============================================================================
-- 3. DOCUMENTS (Core table)
-- Central document table with type classification, fiscal compliance, versioning
-- ============================================================================
CREATE TABLE IF NOT EXISTS documents (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  filename TEXT NOT NULL,
  original_name TEXT NOT NULL,
  title TEXT,
  description TEXT,
  
  document_type TEXT NOT NULL, -- invoice, contract, receipt, fiscal_note, purchase_order, quote, email, image, spreadsheet, presentation, pdf, other
  mime_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  
  status TEXT NOT NULL DEFAULT 'active', -- uploading, processing, active, archived, deleted
  
  provider_id VARCHAR REFERENCES tenant_storage_providers(id),
  storage_path TEXT NOT NULL,
  external_id TEXT,
  
  current_version_id VARCHAR,
  version_number INTEGER NOT NULL DEFAULT 1,
  
  fiscal_year INTEGER,
  fiscal_month INTEGER,
  fiscal_period TEXT,
  retention_until TIMESTAMP,
  
  checksum TEXT NOT NULL,
  
  tags JSONB,
  metadata JSONB,
  
  deleted_at TIMESTAMP,
  deleted_by VARCHAR REFERENCES users(id),
  
  uploaded_by VARCHAR REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS documents_tenant_idx ON documents(tenant_id);
CREATE INDEX IF NOT EXISTS documents_type_idx ON documents(document_type);
CREATE INDEX IF NOT EXISTS documents_status_idx ON documents(status);
CREATE INDEX IF NOT EXISTS documents_fiscal_year_idx ON documents(fiscal_year);
CREATE INDEX IF NOT EXISTS documents_provider_idx ON documents(provider_id);
CREATE INDEX IF NOT EXISTS documents_deleted_at_idx ON documents(deleted_at);
CREATE INDEX IF NOT EXISTS documents_retention_idx ON documents(retention_until);

-- ============================================================================
-- 4. DOCUMENT VERSIONS
-- Immutable version history (NEW - for Document Management System)
-- First, rename legacy document_versions table to preserve data
-- ============================================================================

-- Rename legacy table if it exists
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'document_versions') THEN
    ALTER TABLE document_versions RENAME TO document_versions_legacy;
    ALTER INDEX IF EXISTS document_versions_pkey RENAME TO document_versions_legacy_pkey;
    ALTER INDEX IF EXISTS document_versions_original_file_idx RENAME TO document_versions_legacy_original_file_idx;
    ALTER INDEX IF EXISTS document_versions_version_idx RENAME TO document_versions_legacy_version_idx;
  END IF;
END $$;

-- Create NEW document_versions table for Document Management System
CREATE TABLE IF NOT EXISTS document_versions (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id VARCHAR NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  tenant_id VARCHAR NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  version_number INTEGER NOT NULL,
  
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  
  storage_path TEXT NOT NULL,
  checksum TEXT NOT NULL,
  
  change_description TEXT,
  changed_by VARCHAR REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS document_versions_document_idx ON document_versions(document_id);
CREATE INDEX IF NOT EXISTS document_versions_tenant_idx ON document_versions(tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS document_versions_doc_version_idx ON document_versions(document_id, version_number);

-- Add FK from documents to document_versions now
ALTER TABLE documents
  ADD CONSTRAINT documents_current_version_fk
  FOREIGN KEY (current_version_id) REFERENCES document_versions(id);

-- ============================================================================
-- 5. DOCUMENT CLASSIFICATIONS
-- AI/OCR results with structured data extraction
-- ============================================================================
CREATE TABLE IF NOT EXISTS document_classifications (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id VARCHAR NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version_id VARCHAR REFERENCES document_versions(id) ON DELETE CASCADE,
  tenant_id VARCHAR NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  status TEXT NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed, manual_review
  
  detected_type TEXT,
  confidence REAL,
  
  extracted_text TEXT,
  extracted_data JSONB,
  insights JSONB,
  
  processing_time_ms INTEGER,
  error_message TEXT,
  
  classified_by VARCHAR REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS document_classifications_document_idx ON document_classifications(document_id);
CREATE INDEX IF NOT EXISTS document_classifications_tenant_idx ON document_classifications(tenant_id);
CREATE INDEX IF NOT EXISTS document_classifications_status_idx ON document_classifications(status);

-- ============================================================================
-- 6. DOCUMENT ENTITY LINKS
-- Generic entity linking system
-- ============================================================================
CREATE TABLE IF NOT EXISTS document_entity_links (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id VARCHAR NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  tenant_id VARCHAR NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  entity_type TEXT NOT NULL,
  entity_id VARCHAR NOT NULL,
  
  link_type TEXT NOT NULL DEFAULT 'attachment',
  metadata JSONB,
  
  created_by VARCHAR REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS document_entity_links_document_idx ON document_entity_links(document_id);
CREATE INDEX IF NOT EXISTS document_entity_links_entity_idx ON document_entity_links(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS document_entity_links_tenant_idx ON document_entity_links(tenant_id);

-- ============================================================================
-- 7. DOCUMENT PERMISSIONS
-- Granular RBAC (view, edit, delete, share)
-- ============================================================================
CREATE TABLE IF NOT EXISTS document_permissions (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id VARCHAR NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  tenant_id VARCHAR NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  user_id VARCHAR REFERENCES users(id) ON DELETE CASCADE,
  role_id VARCHAR,
  
  can_view BOOLEAN NOT NULL DEFAULT true,
  can_edit BOOLEAN NOT NULL DEFAULT false,
  can_delete BOOLEAN NOT NULL DEFAULT false,
  can_share BOOLEAN NOT NULL DEFAULT false,
  
  granted_by VARCHAR REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  expires_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS document_permissions_document_idx ON document_permissions(document_id);
CREATE INDEX IF NOT EXISTS document_permissions_user_idx ON document_permissions(user_id);
CREATE INDEX IF NOT EXISTS document_permissions_tenant_idx ON document_permissions(tenant_id);

-- ============================================================================
-- 8. DOCUMENT EMAIL LINKS
-- Email attachment metadata
-- ============================================================================
CREATE TABLE IF NOT EXISTS document_email_links (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id VARCHAR NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  tenant_id VARCHAR NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  email_message_id TEXT,
  email_from TEXT,
  email_to TEXT,
  email_subject TEXT,
  email_date TIMESTAMP,
  
  email_body TEXT,
  email_body_html TEXT,
  
  attachment_index INTEGER,
  
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS document_email_links_document_idx ON document_email_links(document_id);
CREATE INDEX IF NOT EXISTS document_email_links_tenant_idx ON document_email_links(tenant_id);
CREATE INDEX IF NOT EXISTS document_email_links_message_idx ON document_email_links(email_message_id);

-- ============================================================================
-- 9. DOCUMENT EMBEDDINGS
-- Semantic search vectors (1536 dimensions)
-- ============================================================================
CREATE TABLE IF NOT EXISTS document_embeddings (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id VARCHAR NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  tenant_id VARCHAR NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  embedding TEXT NOT NULL,
  embedding_source TEXT NOT NULL,
  
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS document_embeddings_document_idx ON document_embeddings(document_id);
CREATE INDEX IF NOT EXISTS document_embeddings_tenant_idx ON document_embeddings(tenant_id);

-- ============================================================================
-- 10. PROVIDER SYNC JOBS
-- Background sync tracking
-- ============================================================================
CREATE TABLE IF NOT EXISTS provider_sync_jobs (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id VARCHAR NOT NULL REFERENCES tenant_storage_providers(id) ON DELETE CASCADE,
  tenant_id VARCHAR NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  sync_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  
  files_scanned INTEGER DEFAULT 0,
  files_created INTEGER DEFAULT 0,
  files_updated INTEGER DEFAULT 0,
  files_deleted INTEGER DEFAULT 0,
  files_errored INTEGER DEFAULT 0,
  
  error_message TEXT,
  
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS provider_sync_jobs_provider_idx ON provider_sync_jobs(provider_id);
CREATE INDEX IF NOT EXISTS provider_sync_jobs_tenant_idx ON provider_sync_jobs(tenant_id);
CREATE INDEX IF NOT EXISTS provider_sync_jobs_status_idx ON provider_sync_jobs(status);

-- ============================================================================
-- 11. LEGACY DOCUMENT MAPPINGS
-- Migration bridge for backward compatibility
-- ============================================================================
CREATE TABLE IF NOT EXISTS legacy_document_mappings (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  document_id VARCHAR NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  
  legacy_table TEXT NOT NULL,
  legacy_id VARCHAR NOT NULL,
  
  migrated_at TIMESTAMP NOT NULL DEFAULT now(),
  migration_batch TEXT,
  
  checksum_matches BOOLEAN,
  validated BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS legacy_document_mappings_document_idx ON legacy_document_mappings(document_id);
CREATE UNIQUE INDEX IF NOT EXISTS legacy_document_mappings_legacy_idx ON legacy_document_mappings(legacy_table, legacy_id);
CREATE INDEX IF NOT EXISTS legacy_document_mappings_tenant_idx ON legacy_document_mappings(tenant_id);

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- Summary: Created 11 tables for FASE 5.1 Document Management System
-- 
-- RENAMED:
-- - document_versions → document_versions_legacy (preserves old data)
--
-- CREATED:
-- - tenant_storage_providers: Multi-provider config (GCS, S3, Azure, Dropbox, etc.)
-- - provider_credentials: Encrypted credential storage (AES-256, tenant-scoped KMS)
-- - documents: Core document table with fiscal compliance
-- - document_versions: Immutable version history (NEW for Document Management)
-- - document_classifications: AI/OCR results with structured data
-- - document_entity_links: Generic entity linking system
-- - document_permissions: Granular RBAC (view/edit/delete/share)
-- - document_email_links: Email attachment metadata
-- - document_embeddings: Semantic search vectors (1536D)
-- - provider_sync_jobs: Background sync tracking
-- - legacy_document_mappings: Migration bridge for backward compatibility
-- ============================================================================
