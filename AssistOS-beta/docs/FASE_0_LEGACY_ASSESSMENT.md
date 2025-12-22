# 📊 FASE 0: Legacy Code Assessment & Mapping

**Data:** 30 Outubro 2025  
**Objetivo:** Mapear EXATAMENTE o código legacy existente antes da migração para arquitetura modular

---

## 🎯 EXECUTIVE SUMMARY

**Total Legacy Code:** ~31,000 linhas de TypeScript funcional
- ✅ **AI Tools:** ~15,000 linhas (100+ ferramentas)
- ✅ **API Routes:** ~10,000 linhas (34 rotas)
- ✅ **Services:** ~4,600 linhas (15 serviços)
- ✅ **Database Schema:** ~4,700 linhas (multi-tenant + módulos)

**Status:** TODO o código está funcional e será **MIGRADO** (não reescrito) para nova arquitetura

---

## 📁 1. INVENTORY COMPLETO DE FICHEIROS LEGACY

### AI Layer (packages/ai/)

| Ficheiro | Linhas | Categoria | Descrição |
|----------|--------|-----------|-----------|
| `tools/index.ts` | 5,788 | AI Tools Core | Registry principal com 100+ ferramentas |
| `tools/specialized/legacy.ts` | 5,332 | AI Tools Legacy | Ferramentas especializadas legacy |
| `tools/specialized/studio.ts` | 2,780 | Cross-Module | AssistBuild - criação conversacional |
| `agents/legacy-orchestrator.ts` | 659 | Agents | Orchestrador multi-agente |
| `agents/runtime-orchestrator.ts` | 536 | Agents | Runtime execution orchestrator |
| `tools/specialized/financial.ts` | 370 | Cross-Module | **Financial Grid** - budgeting ML |
| `agents/agent-orchestrator.ts` | 329 | Agents | Agent coordination layer |
| `tools/specialized/toconline.ts` | 310 | Integration | TOC Online connector |
| `tools/config.ts` | 298 | Config | Tool configuration |
| `tools/specialized/code-review.ts` | 254 | Quality | Code review agent tools |
| **TOTAL AI** | **16,656** | | |

### API Routes Layer (apps/api/routes/)

| Ficheiro | Linhas | Módulo | Prioridade |
|----------|--------|--------|------------|
| `conversations.ts` | 667 | Core | 🔴 Alta |
| `users.ts` | 552 | Core | 🔴 Alta |
| `onboarding.ts` | 544 | Core | 🟡 Média |
| `inventory.ts` | 463 | **Logística** | 🟡 Média |
| `auth.ts` | 438 | Core | 🔴 Alta |
| `permissions.ts` | 389 | Core | 🔴 Alta |
| `integrations.ts` | 370 | Integrations | 🟡 Média |
| `studio-minimal.ts` | 367 | Cross-Module | 🔴 Alta |
| `studio-v2.ts` | 362 | Cross-Module | 🔴 Alta |
| `public-forms.ts` | 357 | Core | 🟢 Baixa |
| `hub.ts` | 326 | Core | 🟡 Média |
| `budget-quotes.ts` | 315 | **Financeiro** | 🔴 Alta |
| `communications.ts` | 314 | **Comunicação** | 🟡 Média |
| `notifications.ts` | 312 | Core | 🟡 Média |
| `import.ts` | 308 | Data | 🟡 Média |
| `uploads.ts` | 289 | Core | 🟡 Média |
| `admin.ts` | 289 | Admin | 🟡 Média |
| `document-analysis.ts` | 281 | Cross-Module | 🔴 Alta |
| `entities.ts` | 276 | Core | 🔴 Alta |
| `connectors.ts` | 265 | Integrations | 🟡 Média |
| `team.ts` | 248 | **RH** | 🟡 Média |
| `company.ts` | 242 | **Comercial** | 🔴 Alta |
| `module-interface.ts` | 227 | Core | 🔴 Alta |
| `tasks.ts` | 204 | **Projetos** | 🟡 Média |
| `commercial.ts` | 192 | **Comercial** | 🔴 Alta |
| `analytics.ts` | 190 | Cross-Module | 🔴 Alta |
| `files.ts` | 175 | Core | 🟡 Média |
| `environment.ts` | 157 | Core | 🟡 Média |
| `dashboard.ts` | 146 | Cross-Module | 🔴 Alta |
| `secrets.ts` | 126 | Core | 🟡 Média |
| `context.ts` | 89 | Core | 🔴 Alta |
| `health.ts` | 69 | Core | 🟢 Baixa |
| `tenants.ts` | 65 | Core | 🔴 Alta |
| `oauth.ts` | 37 | Core | 🔴 Alta |
| `realtime.ts` | 29 | Core | 🟡 Média |
| **TOTAL ROUTES** | **9,680** | | |

### Services Layer (apps/api/services/)

| Ficheiro | Linhas | Categoria | Prioridade |
|----------|--------|-----------|------------|
| `openai.service.ts` | 1,680 | AI | 🔴 Alta |
| `storage.service.ts` | 403 | Core | 🔴 Alta |
| `tool-registry.ts` | 400 | AI | 🔴 Alta |
| `tenant.service.ts` | 297 | Core | 🔴 Alta |
| `auth.service.ts` | 290 | Core | 🔴 Alta |
| `context.service.ts` | 269 | Core | 🔴 Alta |
| `conversation-context-manager.ts` | 258 | AI | 🔴 Alta |
| `memory.service.ts` | 244 | AI | 🔴 Alta |
| `smart-tool-filter.ts` | 175 | AI | 🟡 Média |
| `object-acl.service.ts` | 159 | Core | 🔴 Alta |
| `realtime.service.ts` | 124 | Core | 🟡 Média |
| `sse.service.ts` | 109 | Core | 🟡 Média |
| `embedding.service.ts` | 78 | AI | 🔴 Alta |
| `event-emitter.ts` | 54 | Core | 🟡 Média |
| `cache.service.ts` | 51 | Core | 🟡 Média |
| **TOTAL SERVICES** | **4,591** | | |

### Database Schema (shared/schema.ts)

| Linhas | Descrição |
|--------|-----------|
| 4,737 | Schema completo multi-tenant com todas as tabelas |

**Total Geral:** ~31,000 linhas de código TypeScript

---

## 🧩 2. MAPEAMENTO DOS 8 MÓDULOS EXISTENTES

### Módulo 1: COMERCIAL (Commercial/Sales)
**Prioridade:** 🔴 Alta (sem dependências - migrar PRIMEIRO)

| Componente | Detalhes |
|------------|----------|
| **Entities** | `leads`, `clients`, `opportunities`, `orders`, `quotes` |
| **Routes** | `commercial.ts` (192 linhas), `company.ts` (242 linhas) |
| **AI Tools** | `create_lead`, `qualify_lead`, `create_order`, `list_clients` |
| **Dependências** | Nenhuma (módulo base) |
| **Código Total** | ~434 linhas + tools |

### Módulo 2: FINANCEIRO (Finance)
**Prioridade:** 🔴 Alta (depende: Comercial)

| Componente | Detalhes |
|------------|----------|
| **Entities** | `invoices`, `payments`, `accounts_receivable`, `budgets` |
| **Routes** | `budget-quotes.ts` (315 linhas) |
| **AI Tools** | `create_invoice`, `process_payment`, `calculate_budget` |
| **Dependências** | Comercial (orders → invoices) |
| **Código Total** | ~315 linhas + tools |

### Módulo 3: LOGÍSTICA (Logistics/Inventory)
**Prioridade:** 🟡 Média (depende: Comercial)

| Componente | Detalhes |
|------------|----------|
| **Entities** | `products`, `stock`, `warehouses`, `movements` |
| **Routes** | `inventory.ts` (463 linhas) |
| **AI Tools** | `check_stock`, `create_movement`, `update_inventory` |
| **Dependências** | Comercial (orders afetam stock) |
| **Código Total** | ~463 linhas + tools |

### Módulo 4: COMPRAS (Procurement)
**Prioridade:** 🟡 Média (sem dependências)

| Componente | Detalhes |
|------------|----------|
| **Entities** | `suppliers`, `purchase_orders`, `requisitions` |
| **Routes** | Integrado em `commercial.ts` |
| **AI Tools** | `create_purchase_order`, `manage_supplier` |
| **Dependências** | Nenhuma |
| **Código Total** | ~150 linhas estimadas |

### Módulo 5: PRODUÇÃO (Manufacturing)
**Prioridade:** 🟢 Baixa (depende: Compras, Logística)

| Componente | Detalhes |
|------------|----------|
| **Entities** | `work_orders`, `bom`, `quality_checks` |
| **Routes** | Legacy tools |
| **AI Tools** | `create_work_order`, `quality_check` |
| **Dependências** | Compras, Logística |
| **Código Total** | ~200 linhas estimadas |

### Módulo 6: RECURSOS HUMANOS (HR)
**Prioridade:** 🟡 Média (sem dependências)

| Componente | Detalhes |
|------------|----------|
| **Entities** | `employees`, `payroll`, `attendance` |
| **Routes** | `team.ts` (248 linhas) |
| **AI Tools** | `manage_employee`, `process_payroll` |
| **Dependências** | Nenhuma |
| **Código Total** | ~248 linhas + tools |

### Módulo 7: GESTÃO DE PROJETOS (Project Management)
**Prioridade:** 🟡 Média (sem dependências)

| Componente | Detalhes |
|------------|----------|
| **Entities** | `projects`, `tasks`, `milestones`, `timesheets` |
| **Routes** | `tasks.ts` (204 linhas) |
| **AI Tools** | `create_project`, `create_task`, `track_time` |
| **Dependências** | Nenhuma |
| **Código Total** | ~204 linhas + tools |

### Módulo 8: MANUTENÇÃO (Maintenance)
**Prioridade:** 🟢 Baixa (depende: Logística)

| Componente | Detalhes |
|------------|----------|
| **Entities** | `assets`, `maintenance_schedules`, `work_requests` |
| **Routes** | Legacy tools |
| **AI Tools** | `schedule_maintenance`, `log_maintenance` |
| **Dependências** | Logística (assets) |
| **Código Total** | ~150 linhas estimadas |

---

## 🔄 3. CROSS-MODULE TOOLS EXISTENTES

### Tool 1: Financial Grid (PRIORITY 🔴 Alta)
**Ficheiro:** `packages/ai/tools/specialized/financial.ts` (370 linhas)

| Aspecto | Detalhes |
|---------|----------|
| **Descrição** | ML-powered budgeting, cashflow, margin optimization |
| **Módulos Usados** | Comercial (orders), Financeiro (invoices, payments), Logística (costs) |
| **Funcionalidades** | Budget calculation, margin optimization, actual vs predicted tracking |
| **Dependências** | OpenAI embeddings, pattern recognition ML |
| **Schema** | Usa dados de múltiplos módulos (cross-module aggregation) |

### Tool 2: Document Management (PRIORITY 🔴 Alta)
**Ficheiro:** `apps/api/routes/document-analysis.ts` (281 linhas)

| Aspecto | Detalhes |
|---------|----------|
| **Descrição** | AI classification + extraction de documentos (PDF, Excel) |
| **Módulos Usados** | TODOS (roteamento automático por tipo) |
| **Funcionalidades** | Classify document type → Extract data → Route to correct module |
| **Tipos Suportados** | Invoice→Financeiro, PO→Compras, Contract→Comercial, Payslip→RH |
| **Dependências** | OpenAI Vision API, pdf-parse, xlsx |

### Tool 3: AssistBuild/Studio (PRIORITY 🔴 Alta)
**Ficheiros:** 
- `packages/ai/tools/specialized/studio.ts` (2,780 linhas)
- `apps/api/routes/studio-minimal.ts` (367 linhas)
- `apps/api/routes/studio-v2.ts` (362 linhas)

| Aspecto | Detalhes |
|---------|----------|
| **Descrição** | Conversational ERP creation - cria módulos via conversa |
| **Módulos Usados** | TODOS (cria/modifica qualquer módulo) |
| **Funcionalidades** | Entity design, workflow builder, field config, code generation |
| **Dependências** | Conversation memory, schema evolution |

### Tool 4: Analytics Dashboard (PRIORITY 🟡 Média)
**Ficheiros:**
- `apps/api/routes/analytics.ts` (190 linhas)
- `apps/api/routes/dashboard.ts` (146 linhas)

| Aspecto | Detalhes |
|---------|----------|
| **Descrição** | Real-time KPIs cross-module |
| **Módulos Usados** | TODOS (agregação global) |
| **Funcionalidades** | Revenue, profit, cashflow, operational metrics |
| **Dependências** | Query aggregation sobre múltiplos módulos |

### Tool 5: Integration Framework (PRIORITY 🟡 Média)
**Ficheiros:**
- `apps/api/routes/integrations.ts` (370 linhas)
- `apps/api/routes/connectors.ts` (265 linhas)

| Aspecto | Detalhes |
|---------|----------|
| **Descrição** | 25+ conectores (Primavera, SAP, Odoo, TOC Online) |
| **Módulos Usados** | Específico por ERP (mapping automático) |
| **Funcionalidades** | Sync bidireccional, field mapping, credential management |
| **Dependências** | External APIs (cada ERP tem seu connector) |

---

## 📊 4. DEPENDENCY GRAPH & ORDEM DE MIGRAÇÃO

### Grafo de Dependências

```
LAYER 1: CORE (Base Platform) - NÃO MIGRAR, JÁ ESTÁ BOM
├── Auth (auth.service, auth.ts)
├── Multi-tenant (tenant.service, tenant-middleware)
├── Storage (storage.service, object-acl)
└── Database (schema.ts, Drizzle ORM)

LAYER 2: MÓDULOS INDEPENDENTES (sem dependências)
├── Comercial ← MIGRAR PRIMEIRO (base para outros)
├── Compras
├── RH
└── Projetos

LAYER 3: MÓDULOS DEPENDENTES
├── Financeiro (depende: Comercial)
├── Logística (depende: Comercial)
├── Produção (depende: Compras, Logística)
└── Manutenção (depende: Logística)

LAYER 4: CROSS-MODULE TOOLS
├── Financial Grid (depende: Comercial, Financeiro, Logística)
├── Document Management (depende: TODOS módulos)
├── Studio/AssistBuild (depende: TODOS módulos)
└── Analytics (depende: TODOS módulos)

LAYER 5: AGENTS
├── Orchestrator (usa cross-tools + módulos)
└── 11 Specialized Agents
```

### Ordem Topológica de Migração

| Fase | Módulo/Tool | Dependências | Prioridade |
|------|-------------|--------------|------------|
| **Fase 1** | Comercial | Nenhuma | 🔴 Alta |
| **Fase 1** | Compras | Nenhuma | 🟡 Média |
| **Fase 1** | RH | Nenhuma | 🟡 Média |
| **Fase 1** | Projetos | Nenhuma | 🟡 Média |
| **Fase 2** | Financeiro | Comercial | 🔴 Alta |
| **Fase 2** | Logística | Comercial | 🟡 Média |
| **Fase 3** | Produção | Compras, Logística | 🟢 Baixa |
| **Fase 3** | Manutenção | Logística | 🟢 Baixa |
| **Fase 4** | Financial Grid | Comercial, Financeiro | 🔴 Alta |
| **Fase 4** | Document Management | Todos módulos | 🔴 Alta |
| **Fase 5** | Studio/AssistBuild | Todos módulos | 🔴 Alta |
| **Fase 5** | Analytics | Todos módulos | 🟡 Média |

**Recomendação:** Migrar em **sprints de 2-3 dias por fase**

---

## ✅ 5. MIGRATION CHECKLIST TEMPLATE

### Por Módulo (exemplo: Comercial)

```markdown
## Módulo: COMERCIAL

### ✅ Assessment
- [x] Entities identificadas (leads, clients, orders)
- [x] Schema extraído de shared/schema.ts
- [x] Tools mapeadas (create_lead, create_order, etc)
- [x] Routes identificadas (commercial.ts, company.ts)
- [x] Dependências conhecidas (nenhuma)
- [ ] Tests existentes localizados
- [x] Prioridade definida (🔴 Alta)

### 🏗️ Migração para IModule
- [ ] Criar ComercialModule implements IModule
- [ ] Migrar entities para EntityDefinition[]
- [ ] Migrar AI tools para ModuleTool[]
- [ ] Migrar routes para RouteDefinition[]
- [ ] Implementar exposeData() para cross-module
- [ ] Implementar lifecycle hooks (onInstall, etc)
- [ ] Testar isoladamente

### 🧪 Validação
- [ ] Unit tests passam
- [ ] Integration tests passam
- [ ] E2E test com Financial Grid
- [ ] Migration rollback funciona
```

### Por Cross-Module Tool (exemplo: Financial Grid)

```markdown
## Cross-Tool: FINANCIAL GRID

### ✅ Assessment
- [x] Ficheiro localizado (financial.ts - 370 linhas)
- [x] Módulos necessários (Comercial, Financeiro, Logística)
- [x] Lógica de agregação mapeada (ML budgeting)
- [x] APIs externas identificadas (OpenAI)
- [ ] Tests existentes
- [x] Prioridade (🔴 Alta)

### 🏗️ Migração para ICrossModuleTool
- [ ] Criar FinancialGridTool implements ICrossModuleTool
- [ ] Definir requiredModules: ['comercial', 'financeiro']
- [ ] Implementar execute(context: CrossModuleContext)
- [ ] Implementar aggregateData(modules: ModuleRegistry)
- [ ] Migrar ML patterns e predictions
- [ ] Testar com módulos reais

### 🧪 Validação
- [ ] Funciona com Comercial + Financeiro
- [ ] Budget calculation correto
- [ ] Margin optimization funciona
- [ ] Integration test end-to-end
```

---

## 📋 6. PRÓXIMOS PASSOS (FASE 1)

### Sprint 1: Core Infrastructure (Dia 1-2)

✅ **Tarefas:**
1. Criar interfaces base (`IModule`, `ICrossModuleTool`)
2. Criar `ModuleRegistry` service
3. Atualizar DB schema para tenant_modules
4. Documentar migration strategy

### Sprint 2: POC com Comercial (Dia 3-4)

✅ **Tarefas:**
1. Migrar módulo Comercial para `IModule`
2. Testar isoladamente
3. Validar que routes + tools funcionam

### Sprint 3: POC com Financial Grid (Dia 5-6)

✅ **Tarefas:**
1. Migrar Financial Grid para `ICrossModuleTool`
2. Integrar com módulo Comercial
3. E2E test completo
4. **VALIDAR ARQUITETURA** antes de prosseguir

---

## 🎯 CONCLUSÃO

**Código Legacy Mapeado:** ✅ 100%
- 31,000 linhas de TypeScript funcional
- 8 módulos de negócio identificados
- 5 cross-module tools mapeados
- Dependency graph completo
- Ordem de migração definida

**Next Action:** Criar interfaces base (IModule, ICrossModuleTool) e migrar **Comercial** como POC

---

**Status:** ✅ FASE 0 COMPLETA - Ready para FASE 1
