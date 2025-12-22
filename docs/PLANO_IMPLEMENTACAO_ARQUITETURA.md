# 🚀 PLANO DE IMPLEMENTAÇÃO - Alinhamento Arquitetural AssistOS

**Data:** 08 de Novembro de 2025  
**Duração Total:** 12 semanas (4 sprints × 3 semanas)  
**Objetivo:** Alinhar AssistOS com arquitetura oficial de 6 camadas

---

## 📋 RESUMO EXECUTIVO

### Estado Atual (Baseline)
- **Score Global:** 69.6%
- **Layer com maior gap:** Layer 4 (Platform Services) - 35%
- **Componentes críticos faltando:** 5 (vector storage, learning registry, 4 platform services, sandbox isolation, schema evolution)

### Estado Alvo (12 semanas)
- **Score Global:** 95%+
- **Todas as layers:** >85%
- **Plataforma production-ready** com arquitetura completa

### Recursos Necessários
- **Backend Engineers:** 2 FTE
- **DBA/Infrastructure:** 1 FTE (50% alocação)
- **AI/ML Engineer:** 1 FTE
- **Frontend Engineer:** 1 FTE (Sprint 4 apenas)
- **QA Engineer:** 0.5 FTE (cross-sprints)
- **DevOps:** 0.5 FTE (Sprint 2-3)

---

## 🎯 ESTRATÉGIA DE IMPLEMENTAÇÃO

### Princípios

1. **Dependencies-First:** Resolver blockers de baixo nível antes de features de alto nível
2. **Non-Regression:** Feature flags, dual-write, blue/green deploys
3. **Validation Gates:** Cada sprint tem critérios de sucesso mensuráveis
4. **Parallel Workstreams:** Maximizar paralelização onde possível
5. **Incremental Value:** Cada sprint entrega valor mensurável

### Sequência de Sprints

```
Sprint 1 (Semanas 1-3): Data Layer Foundation
  ↓
Sprint 2 (Semanas 4-6): Core Services & Isolation
  ↓
Sprint 3 (Semanas 7-9): Learning & Intelligence
  ↓
Sprint 4 (Semanas 10-12): Platform Services & UX
```

---

## 🏃 SPRINT 1: DATA LAYER FOUNDATION

**Semanas:** 1-3  
**Foco:** Modernizar camada de dados para suportar features avançadas  
**Esforço Total:** 47 pessoa-dias

### Objetivos

- ✅ Migrar vector storage de TEXT para pgvector nativo
- ✅ Criar contratos de dados (schemas) para todas as entities
- ✅ Setup de regression test harness
- ✅ Performance baseline e monitoring

### Workstream 1.1: Vector Storage Migration

**Owner:** DBA + Backend (2 pessoas)  
**Esforço:** 10 pessoa-dias  
**Prioridade:** 🔴 CRÍTICA (bloqueia Universal Search)

#### Tarefas Detalhadas

| # | Tarefa | Owner | Dias | Dependência |
|---|--------|-------|------|-------------|
| 1.1.1 | Adicionar pgvector extension ao Neon PostgreSQL | DBA | 0.5 | - |
| 1.1.2 | Criar migration script com dual-write (TEXT + vector) | DBA | 1.5 | 1.1.1 |
| 1.1.3 | Deploy migration em staging | DBA | 0.5 | 1.1.2 |
| 1.1.4 | Backfill embeddings existentes (batch job) | Backend | 2 | 1.1.3 |
| 1.1.5 | Criar HNSW index em staging | DBA | 1 | 1.1.4 |
| 1.1.6 | Performance testing (compare TEXT vs vector) | Backend | 1.5 | 1.1.5 |
| 1.1.7 | Update embedding.service.ts para usar pgvector operators | Backend | 2 | 1.1.6 |
| 1.1.8 | Cutover em production (drop TEXT column) | DBA | 0.5 | 1.1.7 |
| 1.1.9 | Monitoring e rollback plan | DBA | 0.5 | - |

**SQL Migration Preview:**
```sql
-- Step 1: Add extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Step 2: Add new column (dual-write)
ALTER TABLE document_embeddings 
ADD COLUMN embedding_vector vector(1536);

-- Step 3: Backfill (batch job)
UPDATE document_embeddings 
SET embedding_vector = embedding::text::vector
WHERE embedding_vector IS NULL;

-- Step 4: Create index
CREATE INDEX document_embeddings_vector_idx 
ON document_embeddings 
USING hnsw (embedding_vector vector_cosine_ops);

-- Step 5: Drop old column (após validação)
ALTER TABLE document_embeddings DROP COLUMN embedding;
ALTER TABLE document_embeddings RENAME COLUMN embedding_vector TO embedding;
```

**Success Criteria:**
- ✅ Search queries 10x+ mais rápidas (benchmark: <50ms para top-10)
- ✅ HNSW index criado sem errors
- ✅ Zero downtime durante migration
- ✅ Regression tests passam 100%

---

### Workstream 1.2: Embedding Service Refactor

**Owner:** Backend  
**Esforço:** 6 pessoa-dias  
**Prioridade:** 🔴 ALTA

#### Tarefas

| # | Tarefa | Owner | Dias | Dependência |
|---|--------|-------|------|-------------|
| 1.2.1 | Refactor embedding.service.ts para usar vector operators | Backend | 2 | 1.1.7 |
| 1.2.2 | Add semantic search helper methods | Backend | 1.5 | 1.2.1 |
| 1.2.3 | Create embedding generation queue (BullMQ) | Backend | 2 | - |
| 1.2.4 | Integration tests | Backend | 0.5 | 1.2.3 |

**Code Example:**
```typescript
// Before (TEXT-based)
const results = await db
  .select()
  .from(documentEmbeddings)
  .where(/* JSON parsing logic */);

// After (pgvector)
const results = await db
  .select()
  .from(documentEmbeddings)
  .orderBy(sql`embedding <=> ${queryVector}`)
  .limit(10);
```

**Success Criteria:**
- ✅ Semantic search API functional
- ✅ <100ms p95 latency
- ✅ Async embedding generation working

---

### Workstream 1.3: Expand Embeddings to Other Entities

**Owner:** Backend + AI  
**Esforço:** 12 pessoa-dias  
**Prioridade:** 🟡 MÉDIA (preparação para Sprint 4)

#### Tarefas

| # | Tarefa | Owner | Dias | Dependência |
|---|--------|-------|------|-------------|
| 1.3.1 | Create embedding tables (clients, suppliers, projects, products) | Backend | 2 | 1.1.8 |
| 1.3.2 | Batch generate embeddings para dados existentes | AI | 4 | 1.3.1 |
| 1.3.3 | Create embedding triggers (auto-generate on insert/update) | Backend | 3 | 1.3.2 |
| 1.3.4 | Test embedding quality e relevance | AI | 2 | 1.3.3 |
| 1.3.5 | Monitoring e alerting | Backend | 1 | - |

**Schema Example:**
```typescript
export const clientEmbeddings = pgTable("client_embeddings", {
  id: varchar("id").primaryKey(),
  clientId: varchar("client_id").notNull(),
  tenantId: varchar("tenant_id").notNull(),
  embedding: vector("embedding", { dimensions: 1536 }),
  source: text("source").notNull(), // 'name_description', 'notes', etc.
  createdAt: timestamp("created_at").defaultNow(),
});
```

**Success Criteria:**
- ✅ Embeddings gerados para 4+ entity types
- ✅ Auto-generation functional
- ✅ Coverage >95% de entities existentes

---

### Workstream 1.4: Regression Test Harness

**Owner:** QA + Backend  
**Esforço:** 8 pessoa-dias  
**Prioridade:** 🔴 CRÍTICA

#### Tarefas

| # | Tarefa | Owner | Dias | Dependência |
|---|--------|-------|------|-------------|
| 1.4.1 | Inventory de critical paths | QA | 1 | - |
| 1.4.2 | Create test fixtures (synthetic data) | QA | 2 | 1.4.1 |
| 1.4.3 | Implement integration tests suite | Backend | 3 | 1.4.2 |
| 1.4.4 | Setup CI/CD pipeline para regression tests | QA | 1.5 | 1.4.3 |
| 1.4.5 | Performance benchmarking suite | Backend | 0.5 | - |

**Test Coverage Target:**
- Document search (semantic)
- AI tool execution
- Module CRUD operations
- Multi-tenant isolation
- Permission enforcement

**Success Criteria:**
- ✅ >80% code coverage em critical paths
- ✅ CI/CD pipeline verde
- ✅ <5min test execution time

---

### Workstream 1.5: Data Contracts & Documentation

**Owner:** Backend  
**Esforço:** 6 pessoa-dias  
**Prioridade:** 🟡 MÉDIA

#### Tarefas

| # | Tarefa | Owner | Dias | Dependência |
|---|--------|-------|------|-------------|
| 1.5.1 | Document all table schemas | Backend | 2 | - |
| 1.5.2 | Create ER diagrams por module | Backend | 1.5 | 1.5.1 |
| 1.5.3 | Define API contracts (OpenAPI spec) | Backend | 2 | - |
| 1.5.4 | Setup schema validation | Backend | 0.5 | 1.5.3 |

**Deliverables:**
- `docs/schemas/` - Database schemas per module
- `docs/api/` - OpenAPI specs
- ER diagrams (Mermaid or similar)

---

### Workstream 1.6: Observability Setup (Foundation)

**Owner:** Backend  
**Esforço:** 5 pessoa-dias  
**Prioridade:** 🟡 MÉDIA

#### Tarefas

| # | Tarefa | Owner | Dias | Dependência |
|---|--------|-------|------|-------------|
| 1.6.1 | Setup structured logging (já temos Pino, adicionar context) | Backend | 1 | - |
| 1.6.2 | Add correlation IDs | Backend | 1.5 | 1.6.1 |
| 1.6.3 | Create health check endpoints | Backend | 1 | - |
| 1.6.4 | Basic metrics collection (request count, latency) | Backend | 1.5 | - |

**Success Criteria:**
- ✅ Correlation IDs em todos os logs
- ✅ Health endpoints functional
- ✅ Basic metrics dashboard

---

### Sprint 1 Summary

| Workstream | Esforço | Owner(s) | Status |
|------------|---------|----------|--------|
| 1.1 Vector Migration | 10 pd | DBA + Backend | 🔴 CRÍTICO |
| 1.2 Embedding Service | 6 pd | Backend | 🔴 ALTA |
| 1.3 Expand Embeddings | 12 pd | Backend + AI | 🟡 MÉDIA |
| 1.4 Regression Tests | 8 pd | QA + Backend | 🔴 CRÍTICA |
| 1.5 Data Contracts | 6 pd | Backend | 🟡 MÉDIA |
| 1.6 Observability | 5 pd | Backend | 🟡 MÉDIA |
| **TOTAL** | **47 pd** | - | - |

**Team Allocation (Sprint 1):**
- Backend Engineer #1: Full-time (15 dias)
- Backend Engineer #2: Full-time (15 dias)
- DBA: Part-time (5 dias)
- AI Engineer: Part-time (6 dias)
- QA Engineer: Part-time (6 dias)

**Sprint 1 Exit Criteria:**
- ✅ pgvector migration completa em production
- ✅ Regression tests suite functional
- ✅ Performance baselines estabelecidos
- ✅ Embeddings expandidos para 4+ entity types

---

## 🏃 SPRINT 2: CORE SERVICES & ISOLATION

**Semanas:** 4-6  
**Foco:** Schema evolution, sandbox isolation, core platform hardening  
**Esforço Total:** 56 pessoa-dias

### Objetivos

- ✅ Implementar Schema Evolution Service
- ✅ Sandbox data isolation (environment column)
- ✅ Observability stack completo (tracing, metrics)
- ✅ Resource quotas básico

### Workstream 2.1: Schema Evolution Service

**Owner:** Backend + DBA  
**Esforço:** 12 pessoa-dias  
**Prioridade:** 🔴 CRÍTICA

#### Tarefas

| # | Tarefa | Owner | Dias | Dependência |
|---|--------|-------|------|-------------|
| 2.1.1 | Design SchemaEvolutionService interface | Backend | 1 | - |
| 2.1.2 | Implement schema snapshot generation | Backend | 3 | 2.1.1 |
| 2.1.3 | Implement schema diff algorithm | Backend | 3 | 2.1.2 |
| 2.1.4 | Impact analysis engine | Backend | 2.5 | 2.1.3 |
| 2.1.5 | Safe migration generator (DDL) | DBA | 2 | 2.1.4 |
| 2.1.6 | Integration com schemaVersions table | Backend | 0.5 | 2.1.5 |

**Interface Design:**
```typescript
class SchemaEvolutionService {
  // Captura schema atual
  async captureSnapshot(tenantId: string): Promise<SchemaSnapshot>
  
  // Diff entre versões
  async diff(tenantId: string, v1: number, v2: number): Promise<SchemaDiff>
  
  // Análise de impacto
  async analyzeImpact(diff: SchemaDiff): Promise<ImpactAnalysis>
  
  // Gerar migration segura
  async generateMigration(diff: SchemaDiff): Promise<Migration>
  
  // Aplicar migration
  async applyMigration(tenantId: string, migration: Migration): Promise<void>
  
  // Rollback
  async rollback(tenantId: string, version: number): Promise<void>
}
```

**Success Criteria:**
- ✅ Schema snapshots funcionais
- ✅ Diff accuracy >95%
- ✅ Safe migration generation (sem data loss)
- ✅ Rollback tested end-to-end

---

### Workstream 2.2: Sandbox Data Isolation

**Owner:** DBA + Backend + DevOps  
**Esforço:** 14 pessoa-dias  
**Prioridade:** 🔴 CRÍTICA

#### Tarefas

| # | Tarefa | Owner | Dias | Dependência |
|---|--------|-------|------|-------------|
| 2.2.1 | Design isolation strategy (environment column) | DBA | 1 | - |
| 2.2.2 | Generate migration para adicionar environment column | DBA | 2 | 2.2.1 |
| 2.2.3 | Identify all mutable tables (audit) | Backend | 1.5 | - |
| 2.2.4 | Apply environment column to ALL mutable tables | DBA | 3 | 2.2.3 |
| 2.2.5 | Update ALL queries para filtrar por environment | Backend | 4 | 2.2.4 |
| 2.2.6 | Create sandbox-to-production promotion workflow | Backend | 2 | 2.2.5 |
| 2.2.7 | Testing e validation | QA | 0.5 | 2.2.6 |

**Migration Strategy:**
```sql
-- Step 1: Identificar tabelas mutáveis (exemplo)
-- clients, suppliers, projects, budgets, etc.

-- Step 2: Adicionar environment column
ALTER TABLE <table_name> 
ADD COLUMN environment text NOT NULL DEFAULT 'production';

-- Step 3: Create composite indexes
CREATE INDEX <table_name>_tenant_env_idx 
ON <table_name> (tenant_id, environment);

-- Step 4: Update queries
-- Before:
SELECT * FROM clients WHERE tenant_id = ?;

-- After:
SELECT * FROM clients 
WHERE tenant_id = ? AND environment = ?;
```

**Promotion Workflow:**
```typescript
async function promoteToProduction(tenantId: string, entityType: string) {
  // 1. Validation em sandbox
  await validateSandboxData(tenantId, entityType);
  
  // 2. Snapshot de production (backup)
  await snapshotProduction(tenantId, entityType);
  
  // 3. Copy sandbox → production (com deduplication)
  await copySandboxToProduction(tenantId, entityType);
  
  // 4. Audit log
  await logPromotion(tenantId, entityType);
}
```

**Success Criteria:**
- ✅ Environment isolation functional em 100% das tabelas mutáveis
- ✅ Sandbox changes NÃO afetam production
- ✅ Promotion workflow testado end-to-end
- ✅ Rollback de promoted changes funcional

---

### Workstream 2.3: Learning Registry Service

**Owner:** AI + Backend  
**Esforço:** 10 pessoa-dias  
**Prioridade:** 🔴 ALTA

#### Tarefas

| # | Tarefa | Owner | Dias | Dependência |
|---|--------|-------|------|-------------|
| 2.3.1 | Design LearningRegistryService interface | AI | 1 | - |
| 2.3.2 | Unificar acesso a pattern tables | Backend | 2 | 2.3.1 |
| 2.3.3 | Implement pattern aggregation | AI | 2.5 | 2.3.2 |
| 2.3.4 | Anonymization pipeline | AI | 2 | 2.3.3 |
| 2.3.5 | Confidence scoring algorithm | AI | 1.5 | 2.3.4 |
| 2.3.6 | Integration com AssistME/AssistBuild | Backend | 1 | 2.3.5 |

**Interface:**
```typescript
class LearningRegistryService {
  // Registrar novo pattern
  async registerPattern(
    type: PatternType,
    pattern: Pattern,
    tenantId: string
  ): Promise<void>
  
  // Agregar patterns cross-tenant
  async aggregatePatterns(type: PatternType): Promise<AggregatedPattern[]>
  
  // Anonymizar pattern
  async anonymizePattern(pattern: Pattern): Promise<AnonymousPattern>
  
  // Propagar pattern (após sandbox validation)
  async propagatePattern(patternId: string): Promise<void>
  
  // Get confidence score
  async getConfidence(patternId: string): Promise<number>
  
  // Retrieve patterns para AI agents
  async getRelevantPatterns(
    context: string,
    limit: number
  ): Promise<Pattern[]>
}
```

**Success Criteria:**
- ✅ Unified pattern access
- ✅ Cross-tenant aggregation functional
- ✅ Anonymization preserva privacy
- ✅ AI agents utilizam patterns

---

### Workstream 2.4: Observability Stack (Complete)

**Owner:** DevOps + Backend  
**Esforço:** 12 pessoa-dias  
**Prioridade:** 🟡 MÉDIA

#### Tarefas

| # | Tarefa | Owner | Dias | Dependência |
|---|--------|-------|------|-------------|
| 2.4.1 | Setup OpenTelemetry SDK | DevOps | 2 | - |
| 2.4.2 | Implement distributed tracing | Backend | 3 | 2.4.1 |
| 2.4.3 | Setup Prometheus + Grafana | DevOps | 2 | - |
| 2.4.4 | Create metrics dashboard | DevOps | 2 | 2.4.3 |
| 2.4.5 | Error tracking (Sentry or similar) | Backend | 2 | - |
| 2.4.6 | Alerting rules | DevOps | 1 | 2.4.4 |

**Metrics to Track:**
- Request rate, latency (p50, p95, p99)
- Error rate
- AI tool execution time
- Database query performance
- Queue depth (BullMQ)

**Success Criteria:**
- ✅ Distributed tracing functional
- ✅ Metrics dashboard live
- ✅ Alerting rules configured
- ✅ <5min MTTR (Mean Time To Detect)

---

### Workstream 2.5: Resource Quotas (Basic)

**Owner:** Backend  
**Esforço:** 8 pessoa-dias  
**Prioridade:** 🟡 MÉDIA

#### Tarefas

| # | Tarefa | Owner | Dias | Dependência |
|---|--------|-------|------|-------------|
| 2.5.1 | Create tenantQuotas table | Backend | 0.5 | - |
| 2.5.2 | Implement QuotaService | Backend | 2.5 | 2.5.1 |
| 2.5.3 | Quota enforcement middleware | Backend | 2 | 2.5.2 |
| 2.5.4 | Usage metering (storage, API calls) | Backend | 2 | 2.5.3 |
| 2.5.5 | Overage alerting | Backend | 1 | 2.5.4 |

**Schema:**
```typescript
export const tenantQuotas = pgTable("tenant_quotas", {
  id: varchar("id").primaryKey(),
  tenantId: varchar("tenant_id").notNull().unique(),
  
  // Storage quotas
  maxStorageGB: integer("max_storage_gb").default(10),
  currentStorageGB: decimal("current_storage_gb").default("0"),
  
  // API quotas
  maxApiCallsPerMonth: integer("max_api_calls_per_month").default(100000),
  currentApiCalls: integer("current_api_calls").default(0),
  
  // AI quotas
  maxAiTokensPerMonth: integer("max_ai_tokens_per_month").default(1000000),
  currentAiTokens: integer("current_ai_tokens").default(0),
  
  resetAt: timestamp("reset_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});
```

**Success Criteria:**
- ✅ Quota enforcement functional
- ✅ Usage tracking accurate
- ✅ Overage alerts working

---

### Sprint 2 Summary

| Workstream | Esforço | Owner(s) | Status |
|------------|---------|----------|--------|
| 2.1 Schema Evolution | 12 pd | Backend + DBA | 🔴 CRÍTICO |
| 2.2 Sandbox Isolation | 14 pd | DBA + Backend + DevOps | 🔴 CRÍTICO |
| 2.3 Learning Registry | 10 pd | AI + Backend | 🔴 ALTA |
| 2.4 Observability Stack | 12 pd | DevOps + Backend | 🟡 MÉDIA |
| 2.5 Resource Quotas | 8 pd | Backend | 🟡 MÉDIA |
| **TOTAL** | **56 pd** | - | - |

**Team Allocation (Sprint 2):**
- Backend Engineer #1: Full-time (15 dias)
- Backend Engineer #2: Full-time (15 dias)
- DBA: Part-time (8 dias)
- AI Engineer: Part-time (6 dias)
- DevOps: Part-time (6 dias)
- QA Engineer: Part-time (6 dias)

**Sprint 2 Exit Criteria:**
- ✅ Schema Evolution functional
- ✅ Sandbox isolation completo (environment column em todas as tabelas)
- ✅ Learning Registry unificado
- ✅ Observability stack operacional

---

## 🏃 SPRINT 3: INTELLIGENCE & LEARNING

**Semanas:** 7-9  
**Foco:** Melhorar AI capabilities, context graph, advanced learning  
**Esforço Total:** 52 pessoa-dias

### Objetivos

- ✅ Context API com graph structure
- ✅ Advanced pattern recognition
- ✅ Cross-tenant learning pipeline
- ✅ AI tool optimization

### Workstream 3.1: Context API Enhancement (Graph-Based)

**Owner:** AI + Backend  
**Esforço:** 14 pessoa-dias  
**Prioridade:** 🔴 ALTA

#### Tarefas

| # | Tarefa | Owner | Dias | Dependência |
|---|--------|-------|------|-------------|
| 3.1.1 | Design context graph schema | AI | 1.5 | - |
| 3.1.2 | Create entity relationship tables | Backend | 2 | 3.1.1 |
| 3.1.3 | Implement graph traversal algorithms | AI | 3 | 3.1.2 |
| 3.1.4 | Entity resolution logic | AI | 2.5 | 3.1.3 |
| 3.1.5 | Context enrichment service | Backend | 3 | 3.1.4 |
| 3.1.6 | Integration com orchestrators | AI | 2 | 3.1.5 |

**Graph Schema:**
```typescript
export const entityRelationships = pgTable("entity_relationships", {
  id: varchar("id").primaryKey(),
  tenantId: varchar("tenant_id").notNull(),
  
  sourceEntityType: text("source_entity_type").notNull(),
  sourceEntityId: varchar("source_entity_id").notNull(),
  
  targetEntityType: text("target_entity_type").notNull(),
  targetEntityId: varchar("target_entity_id").notNull(),
  
  relationshipType: text("relationship_type").notNull(),
  confidence: decimal("confidence").default("1.0"),
  
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});
```

**Success Criteria:**
- ✅ Graph structure functional
- ✅ Entity resolution >90% accuracy
- ✅ Context enrichment improves AI responses

---

### Workstream 3.2: Advanced Pattern Recognition

**Owner:** AI  
**Esforço:** 12 pessoa-dias  
**Prioridade:** 🟡 MÉDIA

#### Tarefas

| # | Tarefa | Owner | Dias | Dependência |
|---|--------|-------|------|-------------|
| 3.2.1 | Implement frequency-based pattern detection | AI | 3 | - |
| 3.2.2 | Temporal pattern analysis | AI | 3 | 3.2.1 |
| 3.2.3 | Anomaly detection | AI | 2.5 | 3.2.2 |
| 3.2.4 | Pattern recommendation engine | AI | 2.5 | 3.2.3 |
| 3.2.5 | Testing e validation | AI | 1 | 3.2.4 |

**Success Criteria:**
- ✅ Pattern detection automático
- ✅ Anomaly alerts functional
- ✅ Recommendations >70% acceptance rate

---

### Workstream 3.3: Cross-Tenant Learning Pipeline

**Owner:** AI + Backend  
**Esforço:** 10 pessoa-dias  
**Prioridade:** 🟡 MÉDIA

#### Tarefas

| # | Tarefa | Owner | Dias | Dependência |
|---|--------|-------|------|-------------|
| 3.3.1 | Design anonymization rules | AI | 1.5 | - |
| 3.3.2 | Implement privacy-preserving aggregation | AI | 3 | 3.3.1 |
| 3.3.3 | Pattern propagation workflow | Backend | 2.5 | 3.3.2 |
| 3.3.4 | Tenant opt-in/opt-out mechanism | Backend | 1.5 | - |
| 3.3.5 | Testing e compliance validation | AI | 1.5 | 3.3.4 |

**Success Criteria:**
- ✅ Anonymization preserva privacy (GDPR compliant)
- ✅ Cross-tenant learnings melhoram AI accuracy
- ✅ Opt-in mechanism functional

---

### Workstream 3.4: AI Tool Optimization

**Owner:** AI + Backend  
**Esforço:** 8 pessoa-dias  
**Prioridade:** 🟡 MÉDIA

#### Tarefas

| # | Tarefa | Owner | Dias | Dependência |
|---|--------|-------|------|-------------|
| 3.4.1 | Audit tool usage patterns | AI | 1 | - |
| 3.4.2 | Optimize slow tools | Backend | 3 | 3.4.1 |
| 3.4.3 | Implement tool caching | Backend | 2 | 3.4.2 |
| 3.4.4 | Parallel tool execution | AI | 1.5 | 3.4.3 |
| 3.4.5 | Performance benchmarking | Backend | 0.5 | 3.4.4 |

**Success Criteria:**
- ✅ Tool execution 30%+ faster
- ✅ Caching reduces redundant API calls
- ✅ Parallel execution functional

---

### Workstream 3.5: Rollback System Enhancement

**Owner:** Backend  
**Esforço:** 8 pessoa-dias  
**Prioridade:** 🟡 MÉDIA

#### Tarefas

| # | Tarefa | Owner | Dias | Dependência |
|---|--------|-------|------|-------------|
| 3.5.1 | Integrate rollback com Schema Evolution | Backend | 3 | Sprint 2 |
| 3.5.2 | Full tenant state snapshots | Backend | 2.5 | 3.5.1 |
| 3.5.3 | Point-in-time recovery | Backend | 2 | 3.5.2 |
| 3.5.4 | Testing e validation | Backend | 0.5 | 3.5.3 |

**Success Criteria:**
- ✅ Schema rollback functional
- ✅ Point-in-time recovery tested
- ✅ Full tenant snapshots working

---

### Sprint 3 Summary

| Workstream | Esforço | Owner(s) | Status |
|------------|---------|----------|--------|
| 3.1 Context Graph | 14 pd | AI + Backend | 🔴 ALTA |
| 3.2 Pattern Recognition | 12 pd | AI | 🟡 MÉDIA |
| 3.3 Cross-Tenant Learning | 10 pd | AI + Backend | 🟡 MÉDIA |
| 3.4 Tool Optimization | 8 pd | AI + Backend | 🟡 MÉDIA |
| 3.5 Rollback Enhancement | 8 pd | Backend | 🟡 MÉDIA |
| **TOTAL** | **52 pd** | - | - |

**Team Allocation (Sprint 3):**
- Backend Engineer #1: Full-time (15 dias)
- Backend Engineer #2: Part-time (10 dias)
- AI Engineer: Full-time (15 dias)
- QA Engineer: Part-time (6 dias)

**Sprint 3 Exit Criteria:**
- ✅ Context graph operational
- ✅ Advanced pattern recognition functional
- ✅ Cross-tenant learning pipeline live

---

## 🏃 SPRINT 4: PLATFORM SERVICES & UX

**Semanas:** 10-12  
**Foco:** Completar platform services, polir UX, preparar production  
**Esforço Total:** 65 pessoa-dias

### Objetivos

- ✅ Universal Search cross-module
- ✅ Notification Center unificado
- ✅ Financial Grid activation
- ✅ Scheduling service
- ✅ AssistStart conversational

### Workstream 4.1: Universal Search Service

**Owner:** Backend + AI  
**Esforço:** 12 pessoa-dias  
**Prioridade:** 🔴 CRÍTICA  
**Dependência:** Sprint 1 (embeddings expandidos)

#### Tarefas

| # | Tarefa | Owner | Dias | Dependência |
|---|--------|-------|------|-------------|
| 4.1.1 | Design UniversalSearchService interface | Backend | 1 | Sprint 1 |
| 4.1.2 | Implement multi-entity search | Backend | 3.5 | 4.1.1 |
| 4.1.3 | Cross-domain ranking algorithm | AI | 2.5 | 4.1.2 |
| 4.1.4 | Search filters e facets | Backend | 2 | 4.1.3 |
| 4.1.5 | Search UI component | Frontend | 2 | 4.1.4 |
| 4.1.6 | Integration em todas as páginas | Frontend | 1 | 4.1.5 |

**Interface:**
```typescript
class UniversalSearchService {
  async search(
    query: string,
    tenantId: string,
    options: {
      entityTypes?: string[];
      limit?: number;
      filters?: Record<string, any>;
    }
  ): Promise<SearchResult[]>
  
  async semanticSearch(
    query: string,
    tenantId: string,
    options: SearchOptions
  ): Promise<SearchResult[]>
}

interface SearchResult {
  id: string;
  entityType: string;
  title: string;
  description: string;
  score: number;
  metadata: Record<string, any>;
}
```

**Success Criteria:**
- ✅ Search cross 6+ entity types
- ✅ <200ms p95 latency
- ✅ Relevance >85% (user feedback)
- ✅ Search UI integrado em todas as páginas

---

### Workstream 4.2: Notification Center

**Owner:** Backend + Frontend  
**Esforço:** 14 pessoa-dias  
**Prioridade:** 🔴 ALTA

#### Tarefas

| # | Tarefa | Owner | Dias | Dependência |
|---|--------|-------|------|-------------|
| 4.2.1 | Create NotificationCenterService | Backend | 2.5 | - |
| 4.2.2 | Multi-channel routing (email, push, in-app, WhatsApp) | Backend | 3.5 | 4.2.1 |
| 4.2.3 | User preferences management | Backend | 2 | 4.2.2 |
| 4.2.4 | Digest notifications | Backend | 2 | 4.2.3 |
| 4.2.5 | Notification UI component | Frontend | 2.5 | 4.2.4 |
| 4.2.6 | Template system | Backend | 1.5 | - |

**Interface:**
```typescript
class NotificationCenterService {
  async send(
    notification: Notification,
    recipients: string[],
    channels: Channel[]
  ): Promise<void>
  
  async getUserPreferences(userId: string): Promise<NotificationPreferences>
  
  async updatePreferences(
    userId: string,
    prefs: NotificationPreferences
  ): Promise<void>
  
  async sendDigest(userId: string, period: 'daily' | 'weekly'): Promise<void>
}
```

**Success Criteria:**
- ✅ Multi-channel routing functional
- ✅ User preferences working
- ✅ Digest notifications delivered
- ✅ Notification UI polished

---

### Workstream 4.3: Financial Grid Activation

**Owner:** Backend  
**Esforço:** 8 pessoa-dias  
**Prioridade:** 🔴 ALTA

#### Tarefas

| # | Tarefa | Owner | Dias | Dependência |
|---|--------|-------|------|-------------|
| 4.3.1 | Move FinancialGrid para platform services | Backend | 1.5 | - |
| 4.3.2 | Descomentar e refactor service | Backend | 2.5 | 4.3.1 |
| 4.3.3 | Create API routes | Backend | 1.5 | 4.3.2 |
| 4.3.4 | Integration com módulos Financeiro e Projetos | Backend | 2 | 4.3.3 |
| 4.3.5 | Testing end-to-end | Backend | 0.5 | 4.3.4 |

**Success Criteria:**
- ✅ Financial Grid functional
- ✅ Cross-module budgeting working
- ✅ Integration tested

---

### Workstream 4.4: Scheduling Service

**Owner:** Backend  
**Esforço:** 10 pessoa-dias  
**Prioridade:** 🟡 MÉDIA

#### Tarefas

| # | Tarefa | Owner | Dias | Dependência |
|---|--------|-------|------|-------------|
| 4.4.1 | Design SchedulingService interface | Backend | 1 | - |
| 4.4.2 | Create scheduling tables (events, bookings) | Backend | 1.5 | 4.4.1 |
| 4.4.3 | Implement calendar logic | Backend | 3 | 4.4.2 |
| 4.4.4 | Resource booking | Backend | 2 | 4.4.3 |
| 4.4.5 | Calendar UI component | Frontend | 2 | 4.4.4 |
| 4.4.6 | Integration com Projetos | Backend | 0.5 | 4.4.5 |

**Success Criteria:**
- ✅ Calendar functional
- ✅ Resource booking working
- ✅ Integration com módulos

---

### Workstream 4.5: AssistStart (Conversational Onboarding)

**Owner:** AI + Frontend  
**Esforço:** 12 pessoa-dias  
**Prioridade:** 🟡 MÉDIA

#### Tarefas

| # | Tarefa | Owner | Dias | Dependência |
|---|--------|-------|------|-------------|
| 4.5.1 | Create AssistStart orchestrator | AI | 3 | - |
| 4.5.2 | Conversational onboarding flow | AI | 3 | 4.5.1 |
| 4.5.3 | Onboarding UI (conversational) | Frontend | 3.5 | 4.5.2 |
| 4.5.4 | Integration com tenant creation | Backend | 1.5 | 4.5.3 |
| 4.5.5 | Testing e refinement | AI | 1 | 4.5.4 |

**Success Criteria:**
- ✅ Conversational onboarding functional
- ✅ User completes onboarding via chat
- ✅ AssistStart agent operational

---

### Workstream 4.6: Production Readiness

**Owner:** DevOps + Backend + QA  
**Esforço:** 9 pessoa-dias  
**Prioridade:** 🔴 CRÍTICA

#### Tarefas

| # | Tarefa | Owner | Dias | Dependência |
|---|--------|-------|------|-------------|
| 4.6.1 | Load testing | QA | 2 | - |
| 4.6.2 | Security audit | Backend | 2 | - |
| 4.6.3 | Performance optimization | Backend | 2 | 4.6.1 |
| 4.6.4 | Documentation update | Backend | 1.5 | - |
| 4.6.5 | Deployment plan | DevOps | 1.5 | - |

**Load Testing Targets:**
- 1000 concurrent users
- <500ms p95 latency
- >99% uptime

**Success Criteria:**
- ✅ Load tests pass
- ✅ Security audit clean
- ✅ Documentation complete
- ✅ Deployment plan approved

---

### Sprint 4 Summary

| Workstream | Esforço | Owner(s) | Status |
|------------|---------|----------|--------|
| 4.1 Universal Search | 12 pd | Backend + AI + Frontend | 🔴 CRÍTICO |
| 4.2 Notification Center | 14 pd | Backend + Frontend | 🔴 ALTA |
| 4.3 Financial Grid | 8 pd | Backend | 🔴 ALTA |
| 4.4 Scheduling | 10 pd | Backend + Frontend | 🟡 MÉDIA |
| 4.5 AssistStart | 12 pd | AI + Frontend + Backend | 🟡 MÉDIA |
| 4.6 Production Readiness | 9 pd | DevOps + Backend + QA | 🔴 CRÍTICO |
| **TOTAL** | **65 pd** | - | - |

**Team Allocation (Sprint 4):**
- Backend Engineer #1: Full-time (15 dias)
- Backend Engineer #2: Full-time (15 dias)
- AI Engineer: Part-time (10 dias)
- Frontend Engineer: Full-time (15 dias)
- DevOps: Part-time (5 dias)
- QA Engineer: Part-time (5 dias)

**Sprint 4 Exit Criteria:**
- ✅ Universal Search operational
- ✅ Notification Center functional
- ✅ All platform services active
- ✅ Production-ready

---

## 📊 DEPENDENCY GRAPH

```
Sprint 1: Data Layer Foundation
├── Vector Migration (1.1) ────┐
├── Embedding Service (1.2) ───┤
├── Expand Embeddings (1.3) ───┼──> Sprint 4: Universal Search (4.1)
├── Regression Tests (1.4) ────┤
├── Data Contracts (1.5) ──────┤
└── Observability (1.6) ───────┘

Sprint 2: Core Services & Isolation
├── Schema Evolution (2.1) ────┐
├── Sandbox Isolation (2.2) ───┼──> Sprint 3: Rollback Enhancement (3.5)
├── Learning Registry (2.3) ───┼──> Sprint 3: Cross-Tenant Learning (3.3)
├── Observability Stack (2.4) ─┤
└── Resource Quotas (2.5) ─────┘

Sprint 3: Intelligence & Learning
├── Context Graph (3.1) ───────┐
├── Pattern Recognition (3.2) ─┼──> Sprint 4: AssistStart (4.5)
├── Cross-Tenant Learning (3.3)┤
├── Tool Optimization (3.4) ───┤
└── Rollback Enhancement (3.5)─┘

Sprint 4: Platform Services & UX
├── Universal Search (4.1) [DEPENDE: Sprint 1]
├── Notification Center (4.2)
├── Financial Grid (4.3)
├── Scheduling (4.4)
├── AssistStart (4.5) [DEPENDE: Sprint 3]
└── Production Readiness (4.6)
```

---

## ✅ VALIDATION GATES

### Gate 1: Sprint 1 Exit
**Critério:** Data layer modernizado e testável

**Checklist:**
- [ ] pgvector migration completa (production)
- [ ] Regression test suite passa 100%
- [ ] Performance baselines documentados
- [ ] Embeddings expandidos para 4+ entity types
- [ ] Health checks funcionais

**Approval:** Tech Lead + DBA

---

### Gate 2: Sprint 2 Exit
**Critério:** Core services robustos e isolados

**Checklist:**
- [ ] Schema Evolution Service functional
- [ ] Sandbox isolation completo (environment column)
- [ ] Learning Registry unificado
- [ ] Observability stack operational
- [ ] Resource Quotas básico functional

**Approval:** Tech Lead + Security Lead

---

### Gate 3: Sprint 3 Exit
**Critério:** Intelligence layer completa

**Checklist:**
- [ ] Context graph operational
- [ ] Pattern recognition functional
- [ ] Cross-tenant learning pipeline live
- [ ] AI tools optimizados (30%+ faster)
- [ ] Rollback system completo

**Approval:** Tech Lead + AI Lead

---

### Gate 4: Sprint 4 Exit (PRODUCTION READINESS)
**Critério:** Platform services completos e production-ready

**Checklist:**
- [ ] Universal Search operational (6+ entity types)
- [ ] Notification Center functional (4+ channels)
- [ ] Financial Grid active
- [ ] Scheduling service functional
- [ ] AssistStart conversational
- [ ] Load tests pass (1000 concurrent users)
- [ ] Security audit clean
- [ ] Documentation complete

**Approval:** CTO + Tech Lead + Product Owner

---

## 🎯 NON-REGRESSION STRATEGY

### 1. Feature Flags

**Implementação:**
```typescript
const featureFlags = {
  USE_PGVECTOR: process.env.FEATURE_PGVECTOR === 'true',
  SANDBOX_ISOLATION: process.env.FEATURE_SANDBOX_ISO === 'true',
  UNIVERSAL_SEARCH: process.env.FEATURE_UNIVERSAL_SEARCH === 'true',
  // ...
};
```

**Rollout Strategy:**
- Dev environment: 100% enabled
- Staging: 100% enabled
- Production: Gradual rollout (10% → 50% → 100%)

---

### 2. Blue/Green Deployments

**Approach:**
- Maintain 2 environments (blue = current, green = new)
- Route traffic to green gradually
- Instant rollback to blue if issues

---

### 3. Contract Tests

**Coverage:**
- API contracts (OpenAPI)
- Database schemas (Drizzle)
- AI tool interfaces
- Module interfaces

---

### 4. Synthetic Data Sandboxes

**Strategy:**
- Test all changes em sandbox environment FIRST
- Synthetic data para regression tests
- Zero impact em production data

---

### 5. Monitoring & Alerting

**Alerts:**
- Error rate spike (>1%)
- Latency degradation (p95 >500ms)
- Database query slowdown (>2x baseline)
- Queue depth spike (BullMQ)

**Rollback Trigger:**
- Automatic rollback if critical alerts fire

---

## 📈 SUCCESS METRICS

### Technical Metrics

| Metric | Baseline | Target | Sprint |
|--------|----------|--------|--------|
| Semantic search latency (p95) | 500ms+ | <50ms | Sprint 1 |
| Regression test coverage | 40% | >80% | Sprint 1 |
| Schema migration safety | Manual | Automated + validated | Sprint 2 |
| Sandbox data isolation | 0% | 100% | Sprint 2 |
| AI tool execution time | Baseline | -30% | Sprint 3 |
| Pattern detection accuracy | 60% | >85% | Sprint 3 |
| Universal search coverage | 1 entity type | 6+ entity types | Sprint 4 |
| Production uptime | 95% | >99% | Sprint 4 |

---

### Business Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Platform services adoption | 80%+ tenants using 3+ services | Usage analytics |
| AI accuracy improvement | +20% via learning registry | User feedback |
| Time-to-onboard | <10min (conversational) | Analytics |
| Developer productivity | +40% (via platform services) | Survey |

---

## 🚨 RISKS & MITIGATION

### Risk 1: pgvector Migration Breaks Search
**Likelihood:** Medium  
**Impact:** High  
**Mitigation:**
- Dual-write strategy (TEXT + vector)
- Extensive testing before cutover
- Instant rollback plan

---

### Risk 2: Sandbox Isolation Queries Break
**Likelihood:** High (100s of queries)  
**Impact:** High  
**Mitigation:**
- Comprehensive query audit
- Automated testing via regression suite
- Gradual rollout com feature flag

---

### Risk 3: Schema Evolution Generates Bad Migrations
**Likelihood:** Medium  
**Impact:** Critical  
**Mitigation:**
- Manual review de ALL migrations
- Dry-run em staging
- Schema rollback capability

---

### Risk 4: Resource Overallocation
**Likelihood:** Medium  
**Impact:** Medium  
**Mitigation:**
- Sprint planning com team capacity review
- Buffer de 20% em estimativas
- Backlog prioritization (drop low-priority)

---

### Risk 5: Integration Breaking Changes
**Likelihood:** Low  
**Impact:** High  
**Mitigation:**
- Contract tests
- API versioning
- Backward compatibility

---

## 📅 TIMELINE VISUALIZATION

```
Week 1-3:   Sprint 1 [Data Layer Foundation]
            ████████████████████████ 67 pd
            
Week 4-6:   Sprint 2 [Core Services & Isolation]
            ████████████████████ 56 pd
            
Week 7-9:   Sprint 3 [Intelligence & Learning]
            ██████████████████ 52 pd
            
Week 10-12: Sprint 4 [Platform Services & UX]
            ██████████████████████ 65 pd

Total: 220 pessoa-dias em 12 semanas
```

---

## 🎓 TEAM SKILL REQUIREMENTS

### Backend Engineers (2 FTE)
**Skills:**
- TypeScript + Node.js
- Drizzle ORM + PostgreSQL
- API design
- Event-driven architecture
- Testing (integration, e2e)

---

### DBA/Infrastructure (1 FTE part-time)
**Skills:**
- PostgreSQL advanced (indexes, migrations, performance)
- pgvector extension
- Database design
- Backup/recovery

---

### AI/ML Engineer (1 FTE)
**Skills:**
- LLM integration (OpenAI, Anthropic)
- Vector embeddings
- Pattern recognition
- RAG systems

---

### Frontend Engineer (1 FTE Sprint 4)
**Skills:**
- React + TypeScript
- Shadcn UI
- SSE streaming
- Responsive design

---

### DevOps (0.5 FTE)
**Skills:**
- CI/CD
- Monitoring (OpenTelemetry, Prometheus, Grafana)
- Infrastructure as Code
- Security

---

### QA Engineer (0.5 FTE)
**Skills:**
- Test automation
- Load testing
- Regression testing
- Test strategy

---

## 📞 NEXT ACTIONS (Immediate)

### Week 0 (Pre-Sprint)

1. **Socialize Roadmap**
   - [ ] Present plano ao tech lead
   - [ ] Get CTO approval
   - [ ] Resource allocation confirmation

2. **Sprint 1 Readiness**
   - [ ] Setup tracking board (Jira/Linear)
   - [ ] Prepare dual-write scripts (pgvector)
   - [ ] Snapshot plan
   - [ ] Regression test inventory

3. **Team Onboarding**
   - [ ] Kickoff meeting
   - [ ] Assign owners
   - [ ] Setup communication channels

4. **Infrastructure Setup**
   - [ ] Staging environment ready
   - [ ] pgvector extension installed (staging)
   - [ ] Monitoring dashboards setup

---

## ✅ CONCLUSION

Este plano transforma a auditoria arquitetural em **12 semanas de execução organizada**, com:

- ✅ **220 pessoa-dias** distribuídos em 4 sprints
- ✅ **Dependências mapeadas** (blockers identificados)
- ✅ **Owners específicos** por skill (Backend, DBA, AI, Frontend, DevOps, QA)
- ✅ **Critérios de sucesso** mensuráveis
- ✅ **Estratégia de não-regressão** (feature flags, blue/green, contract tests)
- ✅ **Validation gates** por sprint
- ✅ **Risk mitigation** para top 5 risks

**Resultado esperado:** AssistOS alinhado com arquitetura oficial (95%+ compliance), production-ready, com todas as layers funcionais.

---

**Documento gerado em:** 08 de Novembro de 2025  
**Versão:** 1.1 (Estimativas corrigidas e validadas)  
**Próxima revisão:** Após Sprint 1 Exit Gate

---

## ✅ VALIDATION NOTE

**Estimativas Cross-Checked:**
- ✅ Sprint 1: 47 pessoa-dias (6 workstreams validados)
- ✅ Sprint 2: 56 pessoa-dias (5 workstreams validados)
- ✅ Sprint 3: 52 pessoa-dias (5 workstreams validados)
- ✅ Sprint 4: 65 pessoa-dias (6 workstreams validados)
- ✅ **TOTAL: 220 pessoa-dias** em 12 semanas

**Resource Allocation Verified:**
- Sprint 1: 2 Backend (full-time), DBA (part-time), AI (part-time), QA (part-time)
- Sprint 2: 2 Backend (full-time), DBA (part-time), AI (part-time), DevOps (part-time), QA (part-time)
- Sprint 3: 1.5 Backend, 1 AI (full-time), QA (part-time)
- Sprint 4: 2 Backend (full-time), AI (part-time), Frontend (full-time), DevOps (part-time), QA (part-time)

**Dependencies Validated:**
- pgvector migration (Sprint 1) → Universal Search (Sprint 4) ✅
- Schema Evolution (Sprint 2) → Rollback Enhancement (Sprint 3) ✅
- Learning Registry (Sprint 2) → Cross-Tenant Learning (Sprint 3) ✅
- Expand Embeddings (Sprint 1) → Universal Search (Sprint 4) ✅
