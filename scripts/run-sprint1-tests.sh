#!/bin/bash
# Sprint 1 Test Runner
# 
# Executa todos os regression tests do Sprint 1 após resolução do BUG #1
# 
# Usage:
#   bash scripts/run-sprint1-tests.sh
# 
# Prerequisites:
#   - Migration 001 aplicada (índices únicos criados)
#   - Database acessível via DATABASE_URL

set -e  # Exit on error

echo "🧪 Sprint 1 - Regression Tests"
echo "════════════════════════════════════════════════════════════"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 1. Validar índices primeiro
echo "📋 Step 1/4: Validando índices de database..."
tsx scripts/validate-migration-001.ts
if [ $? -ne 0 ]; then
  echo -e "${RED}❌ Índices não encontrados. Execute migration 001 primeiro.${NC}"
  exit 1
fi
echo -e "${GREEN}✅ Índices validados${NC}"
echo ""

# 2. Environment Isolation Tests
echo "📋 Step 2/4: Testando isolamento de ambientes..."
npx vitest run apps/api/tests/integration/environment-isolation.test.ts --reporter=verbose
if [ $? -eq 0 ]; then
  echo -e "${GREEN}✅ Environment isolation tests passed${NC}"
else
  echo -e "${RED}❌ Environment isolation tests failed${NC}"
  exit 1
fi
echo ""

# 3. Tenant Embeddings Isolation Tests
echo "📋 Step 3/4: Testando isolamento multi-tenant..."
npx vitest run apps/api/tests/integration/tenant-embeddings-isolation.test.ts --reporter=verbose
if [ $? -eq 0 ]; then
  echo -e "${GREEN}✅ Tenant isolation tests passed${NC}"
else
  echo -e "${RED}❌ Tenant isolation tests failed${NC}"
  exit 1
fi
echo ""

# 4. Embedding Batch Service Tests
echo "📋 Step 4/4: Testando batch processing..."
npx vitest run apps/api/tests/integration/embedding-batch.service.test.ts --reporter=verbose
if [ $? -eq 0 ]; then
  echo -e "${GREEN}✅ Batch service tests passed${NC}"
else
  echo -e "${RED}❌ Batch service tests failed${NC}"
  exit 1
fi
echo ""

# Success!
echo "════════════════════════════════════════════════════════════"
echo -e "${GREEN}✅ TODOS OS TESTES PASSARAM!${NC}"
echo ""
echo "🎯 Próximos passos:"
echo "   1. ✅ BUG #1 resolvido (índices + testes)"
echo "   2. ⏳ Executar perf-baseline.ts"
echo "   3. ⏳ Avaliar BUG #2 (performance optimization)"
echo "   4. ⏳ Sprint 1 Final Review"
echo ""
echo "════════════════════════════════════════════════════════════"
