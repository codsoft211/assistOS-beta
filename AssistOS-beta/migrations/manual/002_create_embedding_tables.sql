-- Manual Migration 002: Create Embedding Tables
-- 
-- IMPORTANTE: Execute este SQL manualmente via Replit Database tab
-- 
-- Por quê manual? db:push tem timeouts + prompts interativos
-- 
-- Cria APENAS as 5 tabelas de embeddings necessárias para Sprint 1
-- 
-- Data: 2025-11-10
-- Owner: User (execução manual necessária)
-- Estimativa: 2 minutos
-- 
-- ============================================================================

-- 1. SUPPLIER EMBEDDINGS
CREATE TABLE IF NOT EXISTS supplier_embeddings (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id VARCHAR NOT NULL,
  tenant_id VARCHAR NOT NULL,
  embedding_source TEXT NOT NULL DEFAULT 'openai',
  embedding VECTOR(1536) NOT NULL,
  environment TEXT NOT NULL DEFAULT 'production',
  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 2. INVOICE EMBEDDINGS
CREATE TABLE IF NOT EXISTS invoice_embeddings (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id VARCHAR NOT NULL,
  tenant_id VARCHAR NOT NULL,
  embedding_source TEXT NOT NULL DEFAULT 'openai',
  embedding VECTOR(1536) NOT NULL,
  environment TEXT NOT NULL DEFAULT 'production',
  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 3. PROJECT EMBEDDINGS
CREATE TABLE IF NOT EXISTS project_embeddings (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id VARCHAR NOT NULL,
  tenant_id VARCHAR NOT NULL,
  embedding_source TEXT NOT NULL DEFAULT 'openai',
  embedding VECTOR(1536) NOT NULL,
  environment TEXT NOT NULL DEFAULT 'production',
  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 4. CLIENT EMBEDDINGS
CREATE TABLE IF NOT EXISTS client_embeddings (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id VARCHAR NOT NULL,
  tenant_id VARCHAR NOT NULL,
  embedding_source TEXT NOT NULL DEFAULT 'openai',
  embedding VECTOR(1536) NOT NULL,
  environment TEXT NOT NULL DEFAULT 'production',
  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 5. PRODUCT EMBEDDINGS
CREATE TABLE IF NOT EXISTS product_embeddings (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id VARCHAR NOT NULL,
  tenant_id VARCHAR NOT NULL,
  embedding_source TEXT NOT NULL DEFAULT 'openai',
  embedding VECTOR(1536) NOT NULL,
  environment TEXT NOT NULL DEFAULT 'production',
  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- CRIAR ÍNDICES ÚNICOS
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS supplier_embeddings_unique 
ON supplier_embeddings(supplier_id, tenant_id, embedding_source, environment);

CREATE UNIQUE INDEX IF NOT EXISTS invoice_embeddings_unique 
ON invoice_embeddings(invoice_id, tenant_id, embedding_source, environment);

CREATE UNIQUE INDEX IF NOT EXISTS project_embeddings_unique 
ON project_embeddings(project_id, tenant_id, embedding_source, environment);

CREATE UNIQUE INDEX IF NOT EXISTS client_embeddings_unique 
ON client_embeddings(client_id, tenant_id, embedding_source, environment);

CREATE UNIQUE INDEX IF NOT EXISTS product_embeddings_unique 
ON product_embeddings(product_id, tenant_id, embedding_source, environment);

-- ============================================================================
-- VALIDAÇÃO
-- ============================================================================

-- Verificar tabelas criadas
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name LIKE '%embeddings%'
ORDER BY table_name;

-- Expected output: 5 rows

-- Verificar índices criados
SELECT indexname, tablename 
FROM pg_indexes 
WHERE indexname LIKE '%embeddings_unique%'
ORDER BY tablename;

-- Expected output: 5 rows

-- ============================================================================
-- PRÓXIMOS PASSOS
-- ============================================================================
-- 
-- Após execução bem-sucedida:
-- 1. Executar regression tests
-- 2. Executar performance baselines
-- 3. Completar Sprint 1
-- 
-- ============================================================================
