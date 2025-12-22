# 🚀 PLANO DE IMPLEMENTAÇÃO HÍBRIDO - AssistOS

**Data:** 08 de Novembro de 2025  
**Duração:** 9 sprints (45 dias úteis / ~11 semanas)  
**Team:** 4-5 pessoas  
**Objetivo:** Alinhar AssistOS com arquitetura oficial de 6 camadas

---

## 📊 ANÁLISE COMPARATIVA DOS PLANOS

### Plano Original (fornecido)
✅ **Pontos Fortes:**
- Muito pragmático e direto
- Estimativas realistas (45 dias úteis)
- Breakdown de custos (€76k)
- Identificou paralelização
- Análise de riscos

❌ **Gaps:**
- Falta decomposição detalhada de tarefas
- Sem validation gates
- Testing muito tarde (Sprint 7)
- Sem non-regression strategy explícita

### Plano Replit Agent (220 pessoa-dias)
✅ **Pontos Fortes:**
- Tarefas extremamente detalhadas
- Validation gates por sprint
- Regression tests desde Sprint 1
- Non-regression strategy robusta
- Dependency mapping visual

❌ **Gaps:**
- Muito verboso (1380 linhas)
- Sem breakdown de custos
- Estimativa conservadora (12 semanas)

---

## 🎯 PLANO HÍBRIDO (MELHOR DE AMBOS)

**Abordagem:**
- ✅ **Duração:** 9 sprints (realista e agressivo)
- ✅ **Estrutura:** 3 fases pragmáticas
- ✅ **Detalhe:** Sub-tasks decompostas
- ✅ **Custos:** Breakdown financeiro
- ✅ **Qualidade:** Validation gates + non-regression
- ✅ **Testing:** Early & continuous (não só no final)

---

## 📋 RESUMO EXECUTIVO

### Estado Atual → Alvo
- **Baseline:** 69.6% compliance com arquitetura
- **Alvo (9 sprints):** 95%+ compliance, production-ready

### Recursos & Custos
- **Team:** 2 Backend, 1 Frontend, 1 DevOps, 1 AI/ML (4-5 FTE)
- **Budget:** €76k (salários + infra + contingência)
- **Timeline:** 45 dias úteis (~11 semanas)

### Milestones
1. **Sprint 3:** Fundação crítica completa (data layer + core services)
2. **Sprint 6:** Platform maturity (services + intelligence)
3. **Sprint 9:** Production-ready (tested, optimized, documented)

---

## 🔴 FASE 1: FUNDAÇÃO CRÍTICA (Sprints 1-3)

**Objetivo:** Resolver blockers de baixo nível antes de features avançadas  
**Duração:** 15 dias úteis  
**Esforço:** 60 pessoa-dias

---

### SPRINT 1: Data Layer Foundation (5 dias úteis / 20 pd)

**Foco:** pgvector migration + regression testing base

#### 1.1 Vector Storage Migration → pgvector
**Owner:** DBA + Backend | **Esforço:** 3 dias | **Prioridade:** 🔴 CRÍTICA

**Sub-tasks:**
- [ ] **Dia 1 (DBA):** 
  - Adicionar pgvector extension ao Neon PostgreSQL
  - Criar migration script com dual-write (TEXT + vector)
  - Deploy migration em staging
  - Criar HNSW index em staging
  
- [ ] **Dia 2 (Backend):**
  - Backfill embeddings existentes (batch job)
  - Performance testing (compare TEXT vs vector)
  - Target: <50ms para top-10 results em 10k documentos
  
- [ ] **Dia 3 (Backend + DBA):**
  - Update embedding.service.ts para usar pgvector operators (`<=>`)
  - Cutover em production
  - Monitoring e rollback plan
  - Validação: regression tests passam 100%

**SQL Preview:**
```sql
CREATE EXTENSION IF NOT EXISTS vector;
ALTER TABLE document_embeddings ADD COLUMN embedding_vector vector(1536);
UPDATE document_embeddings SET embedding_vector = embedding::text::vector;
CREATE INDEX document_embeddings_vector_idx ON document_embeddings 
  USING hnsw (embedding_vector vector_cosine_ops);
```

**Success Criteria:**
- ✅ Search queries 10x+ faster
- ✅ HNSW index operational
- ✅ Zero downtime durante migration

---

#### 1.2 Regression Test Harness
**Owner:** QA + Backend | **Esforço:** 2 dias | **Prioridade:** 🔴 CRÍTICA

**Sub-tasks:**
- [ ] **Dia 1 (QA):**
  - Inventory de critical paths (document search, AI tools, module CRUD, multi-tenant)
  - Criar test fixtures (synthetic data)
  
- [ ] **Dia 2 (Backend):**
  - Implement integration test suite
  - Setup CI/CD pipeline
  - Performance benchmarking suite

**Success Criteria:**
- ✅ >80% code coverage em critical paths
- ✅ CI/CD pipeline verde
- ✅ <5min test execution time

**⚠️ MUDANÇA vs Plano Original:** Testing EARLY (Sprint 1), não Sprint 7

---

### SPRINT 2: Core Services & Isolation (5 dias úteis / 20 pd)

**Foco:** Sandbox isolation + Schema Evolution

#### 2.1 Sandbox Data Isolation
**Owner:** DBA + Backend | **Esforço:** 4 dias | **Prioridade:** 🔴 CRÍTICA

**Sub-tasks:**
- [ ] **Dia 1 (DBA):**
  - Audit de tabelas mutáveis (~50 tabelas)
  - Design isolation strategy (environment column)
  - Generate migration para adicionar environment column
  
- [ ] **Dia 2 (DBA):**
  - Apply environment column to ALL mutable tables
  - Create composite indexes (tenant_id, environment)
  
- [ ] **Dia 3 (Backend):**
  - Criar EnvironmentFilter middleware (auto-filtra queries)
  - Update ALL queries para considerar environment
  - Automated query update script onde possível
  
- [ ] **Dia 4 (Backend):**
  - Implementar SandboxPromotionService:
    - Detect changes entre sandbox e production
    - Validation pipeline
    - Impact analysis
    - Promote to production (transactional)
    - Rollback capability
  - Tests de isolação

**Success Criteria:**
- ✅ Environment isolation functional em 100% das tabelas
- ✅ Sandbox changes NÃO afetam production
- ✅ Promotion workflow testado end-to-end

---

#### 2.2 Schema Evolution Engine
**Owner:** Backend + DBA | **Esforço:** 3 dias | **Prioridade:** 🔴 CRÍTICA

**Sub-tasks:**
- [ ] **Dia 1 (Backend):**
  - Criar `packages/platform/services/schema-evolution.service.ts`
  - Schema introspection (tables, columns, indexes, constraints)
  - Capture snapshot functionality
  
- [ ] **Dia 2 (Backend):**
  - Schema diff calculation entre versões
  - Impact analysis (affected queries, services, data loss risk)
  - Migration SQL generation (up + down statements)
  
- [ ] **Dia 3 (DBA + Backend):**
  - Apply migration com rollback automático em erro
  - Version rollback para ponto anterior
  - Integration com tabela `schemaVersions`
  - Testing end-to-end em staging

**Interface:**
```typescript
class SchemaEvolutionService {
  async captureSnapshot(tenantId: string): Promise<SchemaSnapshot>
  async diff(tenantId: string, v1: number, v2: number): Promise<SchemaDiff>
  async analyzeImpact(diff: SchemaDiff): Promise<ImpactAnalysis>
  async generateMigration(diff: SchemaDiff): Promise<Migration>
  async applyMigration(tenantId: string, migration: Migration): Promise<void>
  async rollback(tenantId: string, version: number): Promise<void>
}
```

**Success Criteria:**
- ✅ Schema snapshots funcionais
- ✅ Diff accuracy >95%
- ✅ Safe migration generation (sem data loss)
- ✅ Rollback tested

---

### SPRINT 3: Platform Services Base (5 dias úteis / 20 pd)

**Foco:** Universal Search + Notification Center + Learning Registry

#### 3.1 Learning Registry Service Unificado
**Owner:** AI + Backend | **Esforço:** 3 dias | **Prioridade:** 🔴 CRÍTICA

**Sub-tasks:**
- [ ] **Dia 1 (Backend):**
  - Criar `packages/platform/services/learning-registry.service.ts`
  - Unificar acesso às 13 pattern tables dispersas
  - API para pattern retrieval
  
- [ ] **Dia 2 (AI):**
  - Implementar anonymization pipeline (remover PII, GDPR compliant)
  - Pattern aggregation cross-tenant
  - Confidence scoring algorithm
  
- [ ] **Dia 3 (AI + Backend):**
  - Pattern propagation com sandbox testing
  - Integration com AssistME/AssistBuild orchestrators
  - Testing e validation

**Success Criteria:**
- ✅ Unified pattern access
- ✅ Cross-tenant aggregation functional
- ✅ Anonymization preserva privacy
- ✅ AI agents utilizam patterns

---

#### 3.2 Universal Search Service
**Owner:** Backend + AI | **Esforço:** 3 dias | **Prioridade:** 🔴 ALTA

**Sub-tasks:**
- [ ] **Dia 1 (Backend):**
  - Criar `packages/platform/services/universal-search.service.ts`
  - Adicionar embedding tables para entities principais:
    - Clientes, Fornecedores, Produtos, Projetos
    - Ordens de Compra, Invoices, Quotes
  - Batch generate embeddings para dados existentes
  
- [ ] **Dia 2 (Backend + AI):**
  - Implement multi-entity search
  - Cross-domain ranking algorithm
  - Search filters e facets
  
- [ ] **Dia 3 (Frontend + Backend):**
  - Search UI component
  - Integration em páginas relevantes
  - Testing e refinement

**Success Criteria:**
- ✅ Search cross 6+ entity types
- ✅ <200ms p95 latency
- ✅ Relevance >85%

---

#### 3.3 Notification Center Service
**Owner:** Backend | **Esforço:** 2 dias | **Prioridade:** 🔴 ALTA

**Sub-tasks:**
- [ ] **Dia 1 (Backend):**
  - Criar `packages/platform/services/notification-center.service.ts`
  - Unified notification API
  - Multi-channel routing (in-app, email, push, WhatsApp)
  - User preferences management
  
- [ ] **Dia 2 (Backend + Frontend):**
  - Digest notifications (daily/weekly summaries)
  - Template system
  - Notification UI component
  - Consolidar lógica dispersa nos módulos

**Success Criteria:**
- ✅ Multi-channel routing functional
- ✅ User preferences working
- ✅ Digest notifications delivered

---

#### 3.4 Financial Grid Activation
**Owner:** Backend | **Esforço:** 1 dia | **Prioridade:** 🟡 MÉDIA

**Sub-tasks:**
- [ ] **Dia 1 (Backend):**
  - Descomentar código existente
  - Mover para `packages/platform/services/financial-grid.service.ts`
  - Criar API routes
  - Integration com módulos Financeiro e Projetos
  - Tests end-to-end

---

### VALIDATION GATE 1: Fundação Crítica Completa

**Checklist (Sprint 3 Exit):**
- [ ] pgvector migration completa em production
- [ ] Regression test suite passa 100%
- [ ] Sandbox isolation functional (environment column em todas as tabelas)
- [ ] Schema Evolution Service operational
- [ ] Learning Registry unificado
- [ ] Universal Search functional (6+ entity types)
- [ ] Notification Center ativo

**Approval:** Tech Lead + DBA + Security Lead

---

## 🟡 FASE 2: PLATFORM MATURITY (Sprints 4-6)

**Objetivo:** Intelligence layer + platform services completos  
**Duração:** 15 dias úteis  
**Esforço:** 60 pessoa-dias

---

### SPRINT 4: Learning & Context (5 dias úteis / 20 pd)

**Foco:** Context graph + AI optimization

#### 4.1 Context API com Graph Structure
**Owner:** AI + Backend | **Esforço:** 3 dias | **Prioridade:** 🔴 ALTA

**Sub-tasks:**
- [ ] **Dia 1 (AI):**
  - Design context graph schema
  - Create entity relationship tables
  - Define node types: Entity, Conversation, Pattern, Tool, Outcome
  
- [ ] **Dia 2 (AI + Backend):**
  - Implement graph traversal algorithms
  - Entity resolution logic (deduplication, linking)
  - Context enrichment service
  
- [ ] **Dia 3 (AI):**
  - Integration com orchestrators (AssistME/AssistBuild)
  - Semantic relationship inference
  - Testing

**Schema:**
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
});
```

**Success Criteria:**
- ✅ Graph structure functional
- ✅ Entity resolution >90% accuracy
- ✅ Context enrichment improves AI responses

---

#### 4.2 Learning Graph Implementation
**Owner:** AI | **Esforço:** 2 dias | **Prioridade:** 🟡 MÉDIA

**Sub-tasks:**
- [ ] **Dia 1 (AI):**
  - Criar graph representation de patterns
  - Node types: Pattern, Entity, Action, Outcome
  - Edge types: triggers, improves, conflicts_with, depends_on
  
- [ ] **Dia 2 (AI):**
  - Graph traversal algorithms
  - Pattern recommendation engine
  - Visualization endpoint para debugging

**Success Criteria:**
- ✅ Graph representation functional
- ✅ Pattern recommendations >70% acceptance

---

### SPRINT 5: Scheduling & Budgeting (5 dias úteis / 20 pd)

**Foco:** Completar platform services

#### 5.1 Scheduling Service
**Owner:** Backend + Frontend | **Esforço:** 3 dias | **Prioridade:** 🟡 MÉDIA

**Sub-tasks:**
- [ ] **Dia 1 (Backend):**
  - Criar `packages/platform/services/scheduling.service.ts`
  - Create scheduling tables (events, bookings)
  - Implement calendar logic
  
- [ ] **Dia 2 (Backend):**
  - Resource booking system
  - Conflict detection
  - Timeline management para Projetos
  - Recurring events
  
- [ ] **Dia 3 (Frontend + Backend):**
  - Calendar UI component
  - Notification integration
  - Integration com módulos

**Success Criteria:**
- ✅ Calendar functional
- ✅ Resource booking working
- ✅ Integration com Projetos

---

#### 5.2 Budgeting Engine
**Owner:** Backend | **Esforço:** 2 dias | **Prioridade:** 🟡 MÉDIA

**Sub-tasks:**
- [ ] **Dia 1 (Backend):**
  - Criar `packages/platform/services/budgeting-engine.service.ts`
  - Multi-dimensional allocation (project, department, category, time)
  - Budget forecasting
  
- [ ] **Dia 2 (Backend):**
  - Variance analysis
  - Budget scenarios (best/worst/expected)
  - Approval workflows
  - Integration com Financial Grid
  - Dashboard widgets

**Success Criteria:**
- ✅ Multi-dimensional budgeting functional
- ✅ Forecasting accuracy >80%
- ✅ Integration com Financial Grid

---

### SPRINT 6: Observability & Quotas (5 dias úteis / 20 pd)

**Foco:** Production readiness - monitoring + quotas

#### 6.1 Observability Stack
**Owner:** DevOps + Backend | **Esforço:** 3 dias | **Prioridade:** 🟡 MÉDIA

**Sub-tasks:**
- [ ] **Dia 1 (DevOps):**
  - OpenTelemetry integration
  - Setup Prometheus + Grafana
  - Basic metrics collection
  
- [ ] **Dia 2 (Backend):**
  - Distributed tracing setup
  - Span instrumentation em services críticos
  - Logging correlation (trace IDs)
  
- [ ] **Dia 3 (DevOps + Backend):**
  - APM (Application Performance Monitoring)
  - Error tracking integration (Sentry)
  - Grafana dashboards
  - Alerting rules

**Metrics to Track:**
- Request rate, latency (p50, p95, p99), error rate
- AI tool execution time
- Database query performance
- Queue depth (BullMQ)

**Success Criteria:**
- ✅ Distributed tracing functional
- ✅ Metrics dashboard live
- ✅ Alerting configured
- ✅ <5min MTTR

---

#### 6.2 Resource Quotas System
**Owner:** Backend | **Esforço:** 2 dias | **Prioridade:** 🟡 MÉDIA

**Sub-tasks:**
- [ ] **Dia 1 (Backend):**
  - Criar tabela `tenantQuotas`
  - Definir quota types (API calls, AI tokens, storage, users, documents)
  - QuotaService implementation
  - Quota enforcement middleware
  
- [ ] **Dia 2 (Backend + Frontend):**
  - Usage metering e tracking
  - Overage alerts
  - Quota upgrade flows
  - Admin dashboard para quota management

**Success Criteria:**
- ✅ Quota enforcement functional
- ✅ Usage tracking accurate
- ✅ Overage alerts working

---

### VALIDATION GATE 2: Platform Maturity

**Checklist (Sprint 6 Exit):**
- [ ] Context graph operational
- [ ] Learning Graph functional
- [ ] Scheduling service ativo
- [ ] Budgeting Engine operational
- [ ] Observability stack completo (tracing, metrics, alerting)
- [ ] Resource Quotas system functional

**Approval:** Tech Lead + Product Owner

---

## 🟢 FASE 3: POLISH & PRODUCTION READINESS (Sprints 7-9)

**Objetivo:** Testing, optimization, documentation  
**Duração:** 15 dias úteis  
**Esforço:** 60 pessoa-dias

---

### SPRINT 7: Integration Testing (5 dias úteis / 20 pd)

**Foco:** End-to-end testing completo

#### 7.1 End-to-End Testing Suite
**Owner:** QA + Backend | **Esforço:** 5 dias | **Prioridade:** 🔴 CRÍTICA

**Sub-tasks:**
- [ ] **Dia 1 (QA):**
  - Testes de integração Layer 1 ↔ Layer 2
  - Testes de integração Layer 2 ↔ Layer 3 (modules)
  
- [ ] **Dia 2 (QA):**
  - Testes de integração Layer 3 ↔ Layer 5 (orchestrator)
  - Testes cross-tenant (isolation, learning)
  
- [ ] **Dia 3 (QA):**
  - Testes de sandbox → production promotion
  - Testes de schema evolution + rollback
  
- [ ] **Dia 4 (Backend):**
  - Performance tests (load testing)
  - Target: 1000 concurrent users, <500ms p95
  
- [ ] **Dia 5 (Backend + QA):**
  - Stress tests (quota limits, rate limiting)
  - Security testing
  - Regression test suite validation

**Success Criteria:**
- ✅ All integration tests pass
- ✅ Load tests pass (1000 concurrent users)
- ✅ Security audit clean
- ✅ Zero critical bugs

---

### SPRINT 8: Performance Optimization (5 dias úteis / 20 pd)

**Foco:** Performance tuning + caching

#### 8.1 Performance Audit & Optimization
**Owner:** Backend + DevOps | **Esforço:** 5 dias | **Prioridade:** 🔴 ALTA

**Sub-tasks:**
- [ ] **Dia 1 (Backend):**
  - Database query optimization:
    - Índices missing (identify via slow query log)
    - N+1 queries (identify e fix)
    - Slow queries analysis
  
- [ ] **Dia 2 (Backend + DBA):**
  - Vector search optimization (pgvector tuning)
  - HNSW index parameters adjustment
  - Query plan analysis
  
- [ ] **Dia 3 (Backend):**
  - API response time optimization:
    - Caching layer (Redis)
    - Query result caching
    - Pagination optimization
  
- [ ] **Dia 4 (Frontend):**
  - Frontend performance:
    - Code splitting
    - Lazy loading
    - Bundle size reduction
    - Image optimization
  
- [ ] **Dia 5 (AI):**
  - AI orchestrator optimization:
    - Tool selection speed
    - Context window management
    - Streaming optimization
  - Performance benchmarking (before/after)

**Success Criteria:**
- ✅ API latency <200ms p95
- ✅ Search latency <50ms
- ✅ Frontend load time <2s
- ✅ AI tool execution 30%+ faster

---

### SPRINT 9: Documentation & Training (5 dias úteis / 20 pd)

**Foco:** Documentation completa + knowledge transfer

#### 9.1 Documentation Completa
**Owner:** Backend + Tech Writer | **Esforço:** 3 dias | **Prioridade:** 🟡 MÉDIA

**Sub-tasks:**
- [ ] **Dia 1 (Backend):**
  - Architecture documentation atualizada
  - API documentation (OpenAPI/Swagger)
  - Database schema docs (ER diagrams)
  
- [ ] **Dia 2 (Backend):**
  - Developer guide:
    - Como adicionar novo módulo
    - Como criar custom tools
    - Como configurar sandbox
    - Troubleshooting guides
  
- [ ] **Dia 3 (Backend):**
  - Admin guide:
    - Schema evolution workflows
    - Sandbox promotion procedures
    - Quota management
    - Monitoring & alerting
  - User guide:
    - Onboarding tutorials
    - Module-specific guides
    - Best practices

**Success Criteria:**
- ✅ Documentation completa e atualizada
- ✅ API docs gerados automaticamente
- ✅ Developer onboarding <1 dia

---

#### 9.2 Internal Training & Knowledge Transfer
**Owner:** Tech Lead | **Esforço:** 2 dias | **Prioridade:** 🟡 MÉDIA

**Sub-tasks:**
- [ ] **Dia 1 (Tech Lead):**
  - Training sessions para team:
    - New architecture components
    - Troubleshooting guides
    - Incident response procedures
  
- [ ] **Dia 2 (Tech Lead + DevOps):**
  - Runbooks:
    - Deployment procedures
    - Rollback procedures
    - Monitoring & alerting
  - Knowledge base setup

**Success Criteria:**
- ✅ Team treinada
- ✅ Runbooks completos
- ✅ Knowledge base operational

---

### VALIDATION GATE 3: Production Ready

**Checklist (Sprint 9 Exit):**
- [ ] All integration tests pass (100%)
- [ ] Load tests pass (1000 concurrent users)
- [ ] Performance targets met (<200ms p95 API, <50ms search)
- [ ] Security audit clean (zero critical vulnerabilities)
- [ ] Documentation completa
- [ ] Team treinada
- [ ] Monitoring & alerting operational
- [ ] Runbooks completos

**Approval:** CTO + Tech Lead + Product Owner

**GO/NO-GO Decision:** Production deployment

---

## 📊 NON-REGRESSION STRATEGY

### 1. Feature Flags
```typescript
const featureFlags = {
  USE_PGVECTOR: process.env.FEATURE_PGVECTOR === 'true',
  SANDBOX_ISOLATION: process.env.FEATURE_SANDBOX_ISO === 'true',
  UNIVERSAL_SEARCH: process.env.FEATURE_UNIVERSAL_SEARCH === 'true',
  SCHEMA_EVOLUTION: process.env.FEATURE_SCHEMA_EVO === 'true',
};
```

**Rollout:**
- Dev: 100% enabled
- Staging: 100% enabled
- Production: Gradual (10% → 50% → 100%)

---

### 2. Blue/Green Deployments
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

### 4. Regression Test Suite
**Runs:**
- On every PR (CI/CD)
- Before each deployment
- Daily em production

**Coverage:**
- >80% code coverage
- All critical paths
- Multi-tenant scenarios

---

## ⚠️ RISKS & MITIGATION

### Risk 1: Sandbox Isolation Breaks Queries
**Likelihood:** Alto  
**Impact:** Alto

**Mitigação:**
- Automated query update script
- Extensive regression testing
- Gradual rollout com feature flag
- Rollback plan ready

---

### Risk 2: Performance Regression após Changes
**Likelihood:** Médio  
**Impact:** Alto

**Mitigação:**
- Performance benchmarks desde Sprint 1
- Load testing em staging antes de production
- Monitoring dashboards (instant detection)
- Rollback automático se latency spike

---

### Risk 3: Schema Evolution Generates Bad Migrations
**Likelihood:** Médio  
**Impact:** Crítico

**Mitigação:**
- Manual review de ALL migrations
- Dry-run em staging
- Schema rollback capability
- Database backups antes de apply

---

### Risk 4: Integration Testing Discovers Major Bugs
**Likelihood:** Médio  
**Impact:** Médio

**Mitigação:**
- Regression tests desde Sprint 1 (early detection)
- Buffer de 1 sprint para fixes
- Continuous testing (não só Sprint 7)

---

### Risk 5: Team Availability
**Likelihood:** Médio  
**Impact:** Alto

**Mitigação:**
- Cross-training (knowledge sharing)
- Documentation desde início
- Backup resources identified
- Sprint planning com capacity review

---

## 💰 BREAKDOWN DE CUSTOS

### Salários (9 sprints / 2.25 meses)
| Recurso | Rate/mês | Meses | Total |
|---------|----------|-------|-------|
| 2 Backend Seniors | €6k | 2.25 | €27k |
| 1 Frontend Senior | €5k | 2.25 | €11.25k |
| 1 DevOps | €5k | 2.25 | €11.25k |
| 1 AI/ML Engineer | €6k | 2.25 | €13.5k |
| **Subtotal Salários** | | | **€63k** |

### Infraestrutura & Ferramentas
| Item | Custo |
|------|-------|
| Infra (dev/staging) | €2k |
| Ferramentas (Sentry, monitoring) | €1k |
| Contingência (15%) | €10k |
| **Subtotal** | **€13k** |

### **TOTAL PROJETO: €76k**

---

## 📅 DEPENDENCY GRAPH

```
Sprint 1: pgvector + Regression Tests
  ↓
Sprint 2: Sandbox Isolation + Schema Evolution
  ↓
Sprint 3: Universal Search (depende Sprint 1) + Notification + Learning Registry
  ↓
Sprint 4: Context Graph + Learning Graph
  ↓
Sprint 5: Scheduling + Budgeting
  ↓
Sprint 6: Observability + Quotas
  ↓
Sprint 7: Integration Testing (valida TUDO)
  ↓
Sprint 8: Performance Optimization
  ↓
Sprint 9: Documentation + Training
```

**Paralelizável:**
- Sprint 3: Universal Search ∥ Notification Center ∥ Learning Registry ∥ Financial Grid
- Sprint 4: Context Graph ∥ Learning Graph
- Sprint 5: Scheduling ∥ Budgeting
- Sprint 6: Observability ∥ Quotas

**NÃO Paralelizável (sequencial):**
- Sprint 1 → Sprint 3 (pgvector migration bloqueia Universal Search)
- Sprint 2 → Sprint 7 (Sandbox isolation precisa estar antes de testing)

---

## 📈 SUCCESS METRICS

### Technical Metrics

| Metric | Baseline | Target | Sprint |
|--------|----------|--------|--------|
| Search latency (p95) | 500ms+ | <50ms | Sprint 1 |
| API latency (p95) | - | <200ms | Sprint 8 |
| Test coverage | 40% | >80% | Sprint 1 |
| Sandbox isolation | 0% | 100% | Sprint 2 |
| Schema evolution | Manual | Automated | Sprint 2 |
| Platform services | 35% | 100% | Sprint 6 |
| Production uptime | 95% | >99.5% | Sprint 9 |

### Business Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Platform compliance | 95%+ | Architecture audit |
| Developer productivity | +40% | Survey |
| Time-to-onboard | <10min | Analytics |
| AI accuracy | +20% | User feedback |

---

## 📋 DAILY STANDUP FORMAT

**Template (cada sprint):**

### Today's Goals
- [ ] Task 1 (Owner)
- [ ] Task 2 (Owner)

### Blockers
- Issue 1 → Solution
- Issue 2 → Needs escalation

### Risks
- Risk X → Mitigação Y

---

## 🚀 ORDEM DE EXECUÇÃO OTIMIZADA

### Sprints 1-3 (FASE 1 - Sequencial)
1. **Sprint 1:** pgvector + Regression Tests (FOUNDATION)
2. **Sprint 2:** Sandbox + Schema Evolution (CORE)
3. **Sprint 3:** Universal Search + Notification + Learning Registry (SERVICES)

### Sprints 4-6 (FASE 2 - Paralelo)
4. **Sprint 4:** Context Graph ∥ Learning Graph
5. **Sprint 5:** Scheduling ∥ Budgeting
6. **Sprint 6:** Observability ∥ Quotas

### Sprints 7-9 (FASE 3 - Qualidade)
7. **Sprint 7:** Integration Testing
8. **Sprint 8:** Performance Optimization
9. **Sprint 9:** Documentation + Training

---

## ✅ DIFERENÇAS vs PLANO ORIGINAL

### Melhorias Incorporadas

1. ✅ **Regression Tests Early** (Sprint 1 vs Sprint 7)
   - **Porquê:** Detect bugs early, não no final
   
2. ✅ **Validation Gates** por fase
   - **Porquê:** Quality checkpoints, não "big bang" no final
   
3. ✅ **Non-Regression Strategy** explícita
   - **Porquê:** Feature flags, blue/green, contract tests
   
4. ✅ **Sub-tasks Decompostas**
   - **Porquê:** Clarity sobre o que fazer cada dia
   
5. ✅ **Success Criteria** por tarefa
   - **Porquê:** Measurable outcomes

### Mantido do Plano Original

1. ✅ **9 sprints** (realista e agressivo)
2. ✅ **3 fases** pragmáticas
3. ✅ **Breakdown de custos** (€76k)
4. ✅ **Análise de riscos**
5. ✅ **Paralelização** identificada

---

## 🎯 CONCLUSÃO

Este plano híbrido combina:

- ✅ **Pragmatismo** do plano original (9 sprints, custos, riscos)
- ✅ **Rigor** do plano Replit Agent (sub-tasks, validation gates, non-regression)
- ✅ **Testing early** em vez de final (Sprint 1 vs Sprint 7)
- ✅ **Qualidade** sem sacrificar velocidade

**Resultado:** 45 dias úteis para alinhar AssistOS com arquitetura oficial (95%+ compliance), production-ready, testado, otimizado e documentado.

---

**Próximo Passo:** Socializar com tech lead → Obter approval → Começar Sprint 1

---

**Documento gerado em:** 08 de Novembro de 2025  
**Versão:** 1.0 HÍBRIDO (Melhor de ambos os planos)  
**Autores:** Plano Original + Replit Agent Analysis
