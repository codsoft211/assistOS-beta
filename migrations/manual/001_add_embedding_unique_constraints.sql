-- Manual Migration: Add Unique Constraints to Embedding Tables
-- BUG #1 Resolution - Sprint 1
-- 
-- IMPORTANTE: Execute este SQL manualmente via Replit Database tab
-- 
-- Por quê manual? O comando `npm run db:push --force` está com timeout
-- devido a latência alta no database Neon. Esta migration manual resolve
-- o blocker do Sprint 1.
--
-- IMPACTO: Permite execução de 30+ regression tests e baseline scripts
-- 
-- SAFE: Constraints apenas garantem unicidade, não alteram dados existentes
-- 
-- Data: 2025-11-10
-- Owner: User (execução manual necessária)
-- Estimativa: 15 minutos
-- 
-- ============================================================================

-- 1. SUPPLIER EMBEDDINGS
-- Garante que cada supplier tem apenas 1 embedding por source/environment
CREATE UNIQUE INDEX IF NOT EXISTS supplier_embeddings_unique 
ON supplier_embeddings(supplier_id, tenant_id, embedding_source, environment);

-- 2. INVOICE EMBEDDINGS
-- Garante que cada invoice tem apenas 1 embedding por source/environment
CREATE UNIQUE INDEX IF NOT EXISTS invoice_embeddings_unique 
ON invoice_embeddings(invoice_id, tenant_id, embedding_source, environment);

-- 3. PROJECT EMBEDDINGS
-- Garante que cada project tem apenas 1 embedding por source/environment
CREATE UNIQUE INDEX IF NOT EXISTS project_embeddings_unique 
ON project_embeddings(project_id, tenant_id, embedding_source, environment);

-- 4. CLIENT EMBEDDINGS
-- Garante que cada client tem apenas 1 embedding por source/environment
CREATE UNIQUE INDEX IF NOT EXISTS client_embeddings_unique 
ON client_embeddings(client_id, tenant_id, embedding_source, environment);

-- 5. PRODUCT EMBEDDINGS
-- Garante que cada product tem apenas 1 embedding por source/environment
CREATE UNIQUE INDEX IF NOT EXISTS product_embeddings_unique 
ON product_embeddings(product_id, tenant_id, embedding_source, environment);

-- ============================================================================
-- VALIDAÇÃO (opcional - executar após criar indices)
-- ============================================================================

-- Verificar que todos os indices foram criados
SELECT 
    schemaname,
    tablename,
    indexname
FROM pg_indexes
WHERE indexname IN (
    'supplier_embeddings_unique',
    'invoice_embeddings_unique',
    'project_embeddings_unique',
    'client_embeddings_unique',
    'product_embeddings_unique'
)
ORDER BY tablename;

-- Expected output: 5 rows (1 por tabela)

-- ============================================================================
-- PRÓXIMOS PASSOS APÓS EXECUÇÃO
-- ============================================================================
-- 
-- 1. Executar regression tests:
--    npx vitest run apps/api/tests/integration/environment-isolation.test.ts
--    npx vitest run apps/api/tests/integration/tenant-embeddings-isolation.test.ts
--    npx vitest run apps/api/tests/integration/embedding-batch.service.test.ts
-- 
-- 2. Seed test data (se necessário):
--    tsx scripts/seed-test-data.ts
-- 
-- 3. Executar baseline script:
--    tsx scripts/observability/perf-baseline.ts
-- 
-- 4. Validar SLOs e decidir sobre BUG #2 (performance optimization)
-- 
-- ============================================================================
