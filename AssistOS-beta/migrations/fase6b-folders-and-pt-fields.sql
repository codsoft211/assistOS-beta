-- Migration: Fase 6B - Document Folders and Portuguese Fiscal Compliance
-- Description: Adds hierarchical folder system and Portuguese fiscal compliance fields to document management
-- Created: 2025-10-31

-- ═══════════════════════════════════════════════════════════════════════════════
-- PART 1: Add Portuguese Fiscal Fields to Documents Table
-- ═══════════════════════════════════════════════════════════════════════════════

-- Add Portuguese fiscal compliance fields
ALTER TABLE documents 
  ADD COLUMN IF NOT EXISTS nif_emissor VARCHAR(9),
  ADD COLUMN IF NOT EXISTS nif_destinatario VARCHAR(9),
  ADD COLUMN IF NOT EXISTS atcud VARCHAR(100),
  ADD COLUMN IF NOT EXISTS codigo_validacao_at VARCHAR(100),
  ADD COLUMN IF NOT EXISTS numero_serie_certificado VARCHAR(100),
  ADD COLUMN IF NOT EXISTS hash_documento VARCHAR(255),
  ADD COLUMN IF NOT EXISTS data_documento DATE,
  ADD COLUMN IF NOT EXISTS is_fiscal_compliant BOOLEAN DEFAULT false;

-- Create indexes for Portuguese fiscal fields
CREATE INDEX IF NOT EXISTS idx_documents_nif_emissor ON documents(nif_emissor);
CREATE INDEX IF NOT EXISTS idx_documents_atcud ON documents(atcud);

-- ═══════════════════════════════════════════════════════════════════════════════
-- PART 2: Create Document Folders Table (Hierarchical Structure)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS document_folders (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  parent_folder_id VARCHAR REFERENCES document_folders(id) ON DELETE CASCADE,
  
  -- Folder details
  name VARCHAR(255) NOT NULL,
  path VARCHAR(1000) NOT NULL,  -- Full path: /Fiscal/2025/Faturas
  description TEXT,
  
  -- Type and configuration
  folder_type VARCHAR(50),  -- 'fiscal', 'project', 'client', 'custom'
  metadata JSONB DEFAULT '{}',
  is_template BOOLEAN DEFAULT false,
  
  -- Audit fields
  created_by VARCHAR REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- Ensure unique paths per tenant
  CONSTRAINT unique_tenant_path UNIQUE(tenant_id, path)
);

-- Create indexes for document_folders
CREATE INDEX IF NOT EXISTS idx_folders_tenant ON document_folders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_folders_parent ON document_folders(parent_folder_id);
CREATE INDEX IF NOT EXISTS idx_folders_path ON document_folders(path);

-- ═══════════════════════════════════════════════════════════════════════════════
-- PART 3: Create Document Folder Links Table (Many-to-Many)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS document_folder_links (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  document_id VARCHAR NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  folder_id VARCHAR NOT NULL REFERENCES document_folders(id) ON DELETE CASCADE,
  
  -- Link metadata
  is_primary BOOLEAN DEFAULT false,  -- One primary folder per document
  
  created_at TIMESTAMP DEFAULT NOW(),
  
  -- Prevent duplicate links
  CONSTRAINT unique_doc_folder UNIQUE(document_id, folder_id)
);

-- Create indexes for document_folder_links
CREATE INDEX IF NOT EXISTS idx_folder_links_document ON document_folder_links(document_id);
CREATE INDEX IF NOT EXISTS idx_folder_links_folder ON document_folder_links(folder_id);
CREATE INDEX IF NOT EXISTS idx_folder_links_tenant ON document_folder_links(tenant_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- PART 4: Add Comments for Documentation
-- ═══════════════════════════════════════════════════════════════════════════════

COMMENT ON TABLE document_folders IS 'Hierarchical folder structure for organizing documents';
COMMENT ON TABLE document_folder_links IS 'Many-to-many relationship between documents and folders';

COMMENT ON COLUMN documents.nif_emissor IS 'NIF do emissor do documento (9 dígitos)';
COMMENT ON COLUMN documents.nif_destinatario IS 'NIF do destinatário do documento (9 dígitos)';
COMMENT ON COLUMN documents.atcud IS 'Código Único do Documento AT (Autoridade Tributária)';
COMMENT ON COLUMN documents.codigo_validacao_at IS 'Código de validação da Autoridade Tributária';
COMMENT ON COLUMN documents.numero_serie_certificado IS 'Número de série do certificado digital';
COMMENT ON COLUMN documents.hash_documento IS 'Hash de assinatura do documento';
COMMENT ON COLUMN documents.data_documento IS 'Data oficial do documento (distinta da data de upload)';
COMMENT ON COLUMN documents.is_fiscal_compliant IS 'Indica se o documento cumpre os requisitos fiscais portugueses';

-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration Complete
-- ═══════════════════════════════════════════════════════════════════════════════
