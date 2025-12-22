# TASK 2.2.7.1 - Service Inventory & Risk Triage

**Status:** ✅ COMPLETE  
**Created:** 2025-11-08  
**Objective:** Catalog all services hitting tables with `environment` column, classify by data-criticality, document owner files

---

## Executive Summary

**Total Services Analyzed:** 24  
**Total Worker Jobs Analyzed:** 9  
**Total Tables with Environment Column:** 120+  
**Services Requiring Environment Filtering:** 18 (75%)  
**High Criticality Services:** 8  
**Medium Criticality Services:** 7  
**Low Criticality Services:** 3  

**Critical Finding:** Most domain services (financial, procurement, projects, communications) currently lack explicit environment filtering in queries, creating cross-environment data leakage risk.

---

## 1. Complete Service Inventory

### 1.1 Core Platform Services (apps/api/services/)

| # | Service File | Tables with Environment Column | Operations | Criticality | Priority | Effort |
|---|--------------|-------------------------------|------------|-------------|----------|--------|
| 1 | **auth.service.ts** | - | None | LOW | N/A | - |
| | | *Uses: users (no env), userTenants (HAS env)* | SELECT | | | |
| | | *Issue: userTenants queries missing environment filter* | | | | |
| 2 | **sequence.service.ts** | sequenceCounters | SELECT, INSERT, UPDATE, DELETE | MEDIUM | 15 | S |
| | | *Issue: All queries missing environment filter* | | | | |
| 3 | **context.service.ts** | userProfiles, tenantContext, conversationInsights | SELECT, INSERT, UPDATE | LOW | 20 | S |
| | | *Issue: All 3 tables missing environment filter* | | | | |
| 4 | **module.service.ts** | tenantModules, userModulePreferences | SELECT, INSERT, UPDATE | MEDIUM | 12 | M |
| | | *Issue: Module activation/deactivation not environment-aware* | | | | |
| 5 | **tenant.service.ts** | userTenants, tenantInvitations, tenantStorageProviders, auditLog | SELECT, INSERT, UPDATE, DELETE | HIGH | 4 | M |
| | | *Issue: Invitations, storage providers, audit log not filtered by environment* | | | | |
| 6 | **gmail-sync-helper.ts** | emailInbox, userGmailAccounts | SELECT, INSERT, UPDATE | MEDIUM | 10 | M |
| | | *Issue: Email inbox not environment-isolated* | | | | |
| 7 | **whatsapp-api.service.ts** | - | None (API wrapper only) | N/A | N/A | - |
| 8 | **embedding.service.ts** | supplierEmbeddings, invoiceEmbeddings, projectEmbeddings, suppliers, purchasingInvoices, projects | SELECT, INSERT, UPDATE | HIGH | 2 | L |
| | | *Issue: All embedding operations missing environment filter* | | | | |
| 9 | **memory.service.ts** | learnedPreferences | SELECT, INSERT, UPDATE | LOW | 18 | S |
| | | *Issue: Preferences not environment-isolated* | | | | |
| 10 | **storage.service.ts** | - | None (GCS wrapper only) | N/A | N/A | - |
| 11 | **backfill-orchestrator.service.ts** | (Meta-service - triggers backfill jobs) | - | MEDIUM | - | - |
| 12 | **cache.service.ts** | - | None (in-memory cache) | N/A | N/A | - |
| 13 | **event-emitter.ts** | - | None (event bus) | N/A | N/A | - |
| 14 | **gmail-settings.service.ts** | userGmailAccounts, gmailSettings | SELECT, INSERT, UPDATE | MEDIUM | 11 | S |
| 15 | **gmail-threads.service.ts** | emailInbox | SELECT | MEDIUM | 10 | S |
| 16 | **health.service.ts** | - | None (health checks) | N/A | N/A | - |
| 17 | **object-acl.service.ts** | - | None (GCS ACL) | N/A | N/A | - |
| 18 | **openai.service.ts** | - | None (API wrapper) | N/A | N/A | - |
| 19 | **realtime.service.ts** | - | None (SSE/WebSocket) | N/A | N/A | - |
| 20 | **schema-evolution.service.ts** | schemaVersions, migrations | SELECT, INSERT | LOW | 22 | S |
| 21 | **sse.service.ts** | - | None (SSE transport) | N/A | N/A | - |
| 22 | **whatsapp-media-storage.service.ts** | whatsappMessages (indirectly) | - | MEDIUM | 13 | S |
| 23 | **whatsapp-message-classifier.service.ts** | whatsappMessages, whatsappConversations | SELECT | MEDIUM | 14 | M |
| 24 | **whatsapp-template-sync.service.ts** | whatsappTemplates | SELECT, INSERT, UPDATE | MEDIUM | 16 | S |

### 1.2 Module Domain Services (packages/modules/*/services/)

| # | Service File | Tables with Environment Column | Operations | Criticality | Priority | Effort |
|---|--------------|-------------------------------|------------|-------------|----------|--------|
| 1 | **compras/supplier-sync.service.ts** | suppliers | SELECT, INSERT, UPDATE | HIGH | 1 | M |
| | | *Issue: Supplier creation/update missing environment filter* | | | | |
| 2 | **compras/invoice-ocr.service.ts** | - | None (OCR processing) | N/A | N/A | - |

### 1.3 Worker Jobs (apps/worker/jobs/)

| # | Job File | Tables with Environment Column | Operations | Criticality | Priority | Effort |
|---|----------|-------------------------------|------------|-------------|----------|--------|
| 1 | **backfill-environment.job.ts** | ALL tables with environment column | UPDATE | HIGH | - | - |
| | | *Purpose: Backfills NULL environment values to 'production'* | | | | |
| 2 | **analyze-patterns.ts** | detectedPatterns, userActions | SELECT, INSERT, UPDATE | LOW | 19 | S |
| | | *Issue: Pattern detection not environment-aware* | | | | |
| 3 | **assistbuild/*.ts** | generatedCode, codeGenerationValidations, assistbuildJobs | SELECT, INSERT, UPDATE | MEDIUM | 17 | M |
| | | *Issue: Code generation not environment-isolated* | | | | |
| 4 | **connector-sync/process-event.ts** | connectorSyncState, connectorChangeEvents | SELECT, INSERT, UPDATE | MEDIUM | 8 | M |
| | | *Issue: Connector sync not environment-aware* | | | | |

---

## 2. Tables with Environment Column (Complete List)

**Total: 120+ tables identified**

### 2.1 Financial Domain (HIGH CRITICALITY)

```
✓ invoices
✓ invoiceLines
✓ invoiceTaxes
✓ invoiceValidations
✓ purchasingInvoices
✓ purchasingInvoiceLines
✓ payments
✓ purchasingPayments
✓ paymentAllocations
✓ purchasingPaymentAllocations
✓ paymentReminders
✓ payables
✓ bankAccounts
✓ bankReconciliations
✓ bankStatementTransactions
✓ journalEntries
✓ chartOfAccounts
✓ fiscalPeriods
✓ taxCategories
✓ taxRates
✓ taxObligations
✓ vatReturns
✓ budgets
✓ financialModels
✓ financialCalculations
✓ financialScenarios
✓ rateCards
✓ costComponents
✓ costTemplates
✓ quotes
```

### 2.2 Procurement Domain (HIGH CRITICALITY)

```
✓ suppliers
✓ supplierInvoices
✓ supplierPriceHistory
✓ supplierReturns
✓ supplierReturnLines
✓ productSuppliers
✓ purchaseOrders
✓ purchaseOrderLines
✓ purchaseRequisitions
✓ purchaseRequisitionLines
✓ rfqs
✓ rfqLines
✓ rfqQuoteLines
✓ receipts
✓ receiptLines
```

### 2.3 Projects Domain (HIGH CRITICALITY)

```
✓ projects
✓ projectTasks
✓ projectMilestones
✓ projectPhases
✓ projectDeliverables
✓ projectStates
✓ projectTeamMembers
✓ projectResources
✓ projectResourceAllocations
✓ projectTimeEntries
✓ projectExpenses
✓ projectDocuments
✓ projectContracts
✓ projectApprovals
✓ projectChangeRequests
✓ projectRisks
✓ projectIssues
✓ projectDecisions
✓ projectActivityLogs
✓ projectPurchases
✓ projectExternalMappings
✓ projectTemplates
```

### 2.4 Commercial/Sales Domain (MEDIUM CRITICALITY)

```
✓ commercialLeads
✓ leadActivities
✓ opportunities
✓ opportunityRules
✓ salesOrders
✓ salesOrderLines
```

### 2.5 Communications Domain (MEDIUM CRITICALITY)

```
✓ whatsappAccounts
✓ whatsappMessages
✓ whatsappConversations
✓ whatsappContacts
✓ whatsappTemplates
✓ emailInbox
✓ emailAlerts
✓ emailResponseLearnings
```

### 2.6 Document Management (HIGH CRITICALITY)

```
✓ documents
✓ documentFolders
✓ documentAnalyses
✓ documentInsights
✓ documentTemplates
✓ documentIntegrations
✓ tenantStorageProviders
✓ legacyDocumentMappings
```

### 2.7 HR & Logistics (MEDIUM CRITICALITY)

```
✓ departments
✓ teams
✓ employeeExpenses
(Logistics tables - to be added as modules develop)
```

### 2.8 Platform & Configuration (MEDIUM CRITICALITY)

```
✓ tenantModules
✓ moduleFeatures
✓ userModulePreferences
✓ moduleInterfaceConfig
✓ tenantAutomations
✓ tenantWorkflows
✓ workflowExecutions
✓ automationExecutions
✓ notificationRules
```

### 2.9 Integration & Connectors (MEDIUM CRITICALITY)

```
✓ connectors
✓ tenantConnectorConfigs
✓ userConnectorCredentials
✓ connectorSyncState
✓ connectorChangeEvents
✓ openBankingConnections
✓ tocOnlineConfig
✓ providerCredentials
```

### 2.10 AI & Learning (LOW CRITICALITY)

```
✓ agentInteractions
✓ agentLearnings
✓ agentFeedback
✓ agentHandoffs
✓ agentRuns
✓ agentRoleAssignments
✓ agentSecrets
✓ customAgents
✓ specializedAgents
✓ detectedPatterns
✓ learnedPreferences
✓ userActions
✓ proactiveInsights
✓ presentationPatterns
✓ fieldPatterns
✓ financialPatterns
✓ goldLabels
✓ modelAdjustments
✓ processOptimizations
```

### 2.11 Governance & Security (MEDIUM CRITICALITY)

```
✓ governancePolicies
✓ configRequests
✓ eventLog
✓ fileAttachments
```

### 2.12 Production & Logistics (MEDIUM CRITICALITY)

```
✓ productionBatches
✓ productionIntegrations
✓ cateringKitchenWorkflows
✓ cateringLogistics
✓ cateringPrepLists
```

### 2.13 AssistBuild & Code Generation (MEDIUM CRITICALITY)

```
✓ generatedCode
✓ codeGenerationAudit
✓ assistbuildJobs
✓ tenantCodeTests
```

### 2.14 Data & Schema Evolution (LOW CRITICALITY)

```
✓ schemaVersions
✓ migrations
✓ customEntityRecords
✓ formatAdjustments
✓ detectedGaps
```

### 2.15 Memory & Context (LOW CRITICALITY)

```
✓ tenantContext
✓ tenantMemoryFacts
✓ businessBlueprints
✓ tenantBlueprints
```

### 2.16 Invitations & Onboarding (MEDIUM CRITICALITY)

```
✓ tenantInvitations
✓ onboardingCache
✓ userProfiles
✓ conversationInsights
```

---

## 3. Risk Classification

### 3.1 HIGH CRITICALITY (8 services)

**Definition:** Financial, legal, or compliance-related data. Data corruption or cross-environment leakage could result in:
- Financial loss
- Legal liability
- Regulatory non-compliance
- Audit failures

| Service | Risk Factor | Impact if Leaked |
|---------|-------------|------------------|
| **supplier-sync.service.ts** | ⚠️ CRITICAL | Supplier data mixed between sandbox/production → incorrect invoicing |
| **embedding.service.ts** | ⚠️ CRITICAL | Embeddings mixed → incorrect semantic search → wrong financial decisions |
| **tenant.service.ts** | ⚠️ HIGH | Invitations, storage config mixed → data access violations |
| *(Domain services via routes)* | | |
| **Financial (invoices, payments)** | ⚠️ CRITICAL | Invoices/payments mixed → accounting chaos, tax errors |
| **Procurement (POs, RFQs)** | ⚠️ CRITICAL | Purchase orders mixed → incorrect procurement, supplier issues |
| **Projects (contracts, billing)** | ⚠️ HIGH | Project data mixed → billing errors, contract violations |
| **Documents (fiscal)** | ⚠️ CRITICAL | Fiscal documents mixed → tax compliance violations |
| **Banking (reconciliation)** | ⚠️ CRITICAL | Bank data mixed → reconciliation failures, fraud risk |

### 3.2 MEDIUM CRITICALITY (7 services)

**Definition:** Operational data. Issues cause workflow problems but not legal/financial liability.

| Service | Risk Factor | Impact if Leaked |
|---------|-------------|------------------|
| **sequence.service.ts** | ⚠️ MEDIUM | Sequential codes mixed → confusion, harder to track |
| **module.service.ts** | ⚠️ MEDIUM | Module config mixed → wrong features enabled |
| **gmail-sync-helper.ts** | ⚠️ MEDIUM | Emails mixed → communication confusion |
| **whatsapp services (3)** | ⚠️ MEDIUM | Messages mixed → customer communication issues |
| **connector sync** | ⚠️ MEDIUM | Sync state mixed → integration failures |
| **assistbuild jobs** | ⚠️ MEDIUM | Generated code mixed → deployment errors |

### 3.3 LOW CRITICALITY (3 services)

**Definition:** Metadata, logs, learning patterns. Issues cause minor inconvenience.

| Service | Risk Factor | Impact if Leaked |
|---------|-------------|------------------|
| **context.service.ts** | ℹ️ LOW | User profiles mixed → minor UX issues |
| **memory.service.ts** | ℹ️ LOW | Preferences mixed → suboptimal AI responses |
| **schema-evolution.service.ts** | ℹ️ LOW | Migration logs mixed → harder debugging |

---

## 4. Priority Matrix & Refactoring Roadmap

### 4.1 Wave 1: CRITICAL (Priority 1-5)

**Timeline:** Sprint 1 (Week 1-2)  
**Objective:** Eliminate financial/legal risk

| Priority | Service | Tables (env) | Criticality | Effort | Rationale |
|----------|---------|--------------|-------------|--------|-----------|
| **1** | **supplier-sync.service.ts** | suppliers | HIGH | M | Supplier creation/update happens frequently via OCR |
| **2** | **embedding.service.ts** | supplierEmbeddings, invoiceEmbeddings, projectEmbeddings | HIGH | L | Semantic search used for financial decisions |
| **3** | **Routes: compras/** | suppliers, purchaseOrders, purchasingInvoices, rfqs | HIGH | L | High-volume procurement operations |
| **4** | **tenant.service.ts** | tenantInvitations, tenantStorageProviders, auditLog | HIGH | M | Security & compliance foundation |
| **5** | **Routes: financeiro/** | invoices, payments, bankAccounts, reconciliations | HIGH | L | Core financial operations |

**Total Effort:** 3 Large + 2 Medium = ~2 weeks

### 4.2 Wave 2: OPERATIONAL (Priority 6-15)

**Timeline:** Sprint 2 (Week 3-4)  
**Objective:** Ensure operational integrity

| Priority | Service | Tables (env) | Criticality | Effort | Rationale |
|----------|---------|--------------|-------------|--------|-----------|
| **6** | **Routes: projetos/** | projects, projectTasks, projectResources | HIGH | L | Project billing & tracking |
| **7** | **Routes: documents/** | documents, documentFolders, documentAnalyses | HIGH | M | Fiscal document management |
| **8** | **connector-sync job** | connectorSyncState, connectorChangeEvents | MEDIUM | M | Integration reliability |
| **9** | **Routes: comercial/** | commercialLeads, opportunities, salesOrders | MEDIUM | M | Sales pipeline integrity |
| **10** | **gmail-sync-helper.ts** | emailInbox | MEDIUM | M | Email organization |
| **11** | **gmail-settings.service.ts** | userGmailAccounts, gmailSettings | MEDIUM | S | Email config |
| **12** | **module.service.ts** | tenantModules, userModulePreferences | MEDIUM | M | Module management |
| **13** | **whatsapp-media-storage.service.ts** | whatsappMessages (indirect) | MEDIUM | S | Media organization |
| **14** | **whatsapp-message-classifier.service.ts** | whatsappMessages, whatsappConversations | MEDIUM | M | Message routing |
| **15** | **sequence.service.ts** | sequenceCounters | MEDIUM | S | Code generation |

**Total Effort:** 2 Large + 5 Medium + 3 Small = ~2 weeks

### 4.3 Wave 3: CLEANUP (Priority 16-22)

**Timeline:** Sprint 3 (Week 5-6)  
**Objective:** Complete coverage, metadata & learning systems

| Priority | Service | Tables (env) | Criticality | Effort | Rationale |
|----------|---------|--------------|-------------|--------|-----------|
| **16** | **whatsapp-template-sync.service.ts** | whatsappTemplates | MEDIUM | S | Template management |
| **17** | **assistbuild jobs** | generatedCode, codeGenerationValidations, assistbuildJobs | MEDIUM | M | Code generation isolation |
| **18** | **memory.service.ts** | learnedPreferences | LOW | S | AI preference learning |
| **19** | **analyze-patterns job** | detectedPatterns, userActions | LOW | S | Pattern detection |
| **20** | **context.service.ts** | userProfiles, tenantContext, conversationInsights | LOW | S | User context |
| **21** | **Routes: other modules** | Various | MEDIUM | M | Remaining modules |
| **22** | **schema-evolution.service.ts** | schemaVersions, migrations | LOW | S | Schema tracking |

**Total Effort:** 1 Medium + 6 Small = ~1 week

---

## 5. Refactoring Pattern: Adding Environment Filtering

### 5.1 Standard Pattern (90% of cases)

**Before (WRONG - Cross-Environment Leak):**
```typescript
const supplier = await db.query.suppliers.findFirst({
  where: and(
    eq(suppliers.tenantId, tenantId),
    eq(suppliers.taxId, taxId)
  )
});
```

**After (CORRECT - Environment-Isolated):**
```typescript
const supplier = await db.query.suppliers.findFirst({
  where: and(
    eq(suppliers.tenantId, tenantId),
    eq(suppliers.environment, environment), // ← ADD THIS
    eq(suppliers.taxId, taxId)
  )
});
```

### 5.2 List Queries Pattern

**Before:**
```typescript
const invoices = await db
  .select()
  .from(purchasingInvoices)
  .where(eq(purchasingInvoices.tenantId, tenantId));
```

**After:**
```typescript
const invoices = await db
  .select()
  .from(purchasingInvoices)
  .where(and(
    eq(purchasingInvoices.tenantId, tenantId),
    eq(purchasingInvoices.environment, environment) // ← ADD THIS
  ));
```

### 5.3 Insert Pattern

**Before:**
```typescript
await db.insert(suppliers).values({
  tenantId,
  code,
  name,
  // ... other fields
});
```

**After:**
```typescript
await db.insert(suppliers).values({
  tenantId,
  environment, // ← ADD THIS (from req.user.activeEnvironment or context)
  code,
  name,
  // ... other fields
});
```

### 5.4 Update Pattern

**Before:**
```typescript
await db
  .update(suppliers)
  .set(updateData)
  .where(eq(suppliers.id, supplierId));
```

**After:**
```typescript
await db
  .update(suppliers)
  .set(updateData)
  .where(and(
    eq(suppliers.id, supplierId),
    eq(suppliers.tenantId, tenantId), // ← Always verify tenant
    eq(suppliers.environment, environment) // ← Always verify environment
  ));
```

---

## 6. Critical Edge Cases & Gotchas

### 6.1 Multi-Table Joins

**WRONG:**
```typescript
const invoice = await db
  .select({
    invoice: purchasingInvoices,
    supplier: suppliers
  })
  .from(purchasingInvoices)
  .leftJoin(suppliers, eq(purchasingInvoices.supplierId, suppliers.id))
  .where(eq(purchasingInvoices.tenantId, tenantId)); // ← Missing environment!
```

**CORRECT:**
```typescript
const invoice = await db
  .select({
    invoice: purchasingInvoices,
    supplier: suppliers
  })
  .from(purchasingInvoices)
  .leftJoin(suppliers, and(
    eq(purchasingInvoices.supplierId, suppliers.id),
    eq(suppliers.environment, environment) // ← Filter joined table too!
  ))
  .where(and(
    eq(purchasingInvoices.tenantId, tenantId),
    eq(purchasingInvoices.environment, environment)
  ));
```

### 6.2 Embedding & Semantic Search

**CRITICAL:** Embeddings MUST be environment-isolated or semantic search will return cross-environment results.

```typescript
// WRONG - Returns results from both sandbox AND production!
await db.insert(supplierEmbeddings).values({
  supplierId,
  tenantId,
  embedding
  // ← Missing environment!
});

// CORRECT
await db.insert(supplierEmbeddings).values({
  supplierId,
  tenantId,
  environment, // ← Must match supplier's environment
  embedding
});
```

### 6.3 Sequence Counters

**Special Case:** Sequences should be environment-specific to avoid code collisions.

```typescript
// WRONG - Sandbox and production share same sequence!
const code = await SequenceService.getNextCode({
  tenantId,
  entityType: 'supplier',
  prefix: 'SUP'
});

// CORRECT - Separate sequences per environment
const code = await SequenceService.getNextCode({
  tenantId,
  environment, // ← Sequence is environment-specific
  entityType: 'supplier',
  prefix: 'SUP'
});
```

---

## 7. Summary Statistics

### 7.1 Service Analysis

| Category | Count | Percentage |
|----------|-------|------------|
| **Total Services Analyzed** | 24 | 100% |
| Services Requiring Environment Filtering | 18 | 75% |
| Services Already Environment-Agnostic (API wrappers) | 6 | 25% |
| High Criticality Services | 8 | 33% |
| Medium Criticality Services | 7 | 29% |
| Low Criticality Services | 3 | 13% |

### 7.2 Table Analysis

| Category | Count |
|----------|-------|
| **Total Tables with Environment Column** | 120+ |
| Financial Domain Tables | ~30 |
| Procurement Domain Tables | ~15 |
| Projects Domain Tables | ~20 |
| Communications Domain Tables | ~8 |
| Document Management Tables | ~7 |
| AI/Learning Tables | ~20 |
| Other Tables | ~20 |

### 7.3 Effort Estimation

| Wave | Priority Range | Services | Estimated Effort | Timeline |
|------|---------------|----------|------------------|----------|
| **Wave 1 (Critical)** | 1-5 | 5 services | 3 Large + 2 Medium = **2 weeks** | Sprint 1 |
| **Wave 2 (Operational)** | 6-15 | 10 services | 2 Large + 5 Medium + 3 Small = **2 weeks** | Sprint 2 |
| **Wave 3 (Cleanup)** | 16-22 | 7 services | 1 Medium + 6 Small = **1 week** | Sprint 3 |
| **TOTAL** | 1-22 | 22 services | **5 weeks** | 3 Sprints |

**Note:** Excludes environment-agnostic services (6 API wrappers)

---

## 8. Next Actions

### 8.1 Immediate (This Sprint)

1. ✅ **Service Inventory Complete** - This document
2. ⏳ **Create Subtask 2.2.7.2** - Supplier Service Refactor (Priority 1)
3. ⏳ **Create Subtask 2.2.7.3** - Embedding Service Refactor (Priority 2)
4. ⏳ **Create Subtask 2.2.7.4** - Procurement Routes Refactor (Priority 3)

### 8.2 Sprint Planning

**Sprint 1 (Wave 1):**
- Subtask 2.2.7.2: Supplier Service (3 days)
- Subtask 2.2.7.3: Embedding Service (4 days)
- Subtask 2.2.7.4: Procurement Routes (5 days)
- Testing & Validation (2 days)

**Sprint 2 (Wave 2):**
- Projects, Documents, Commercial routes
- Gmail, WhatsApp, Connector services
- Module management service
- Testing & Validation

**Sprint 3 (Wave 3):**
- AssistBuild jobs
- Learning/AI services
- Context & memory services
- Final testing & documentation

---

## 9. Testing Strategy

### 9.1 Per-Service Testing Checklist

For each refactored service:

- [ ] Unit tests verify environment filtering in all queries
- [ ] Integration tests verify cross-environment isolation
- [ ] Test both `sandbox` and `production` environments
- [ ] Test environment switching (user changes activeEnvironment)
- [ ] Verify no cross-environment data leaks in:
  - [ ] SELECT queries
  - [ ] INSERT operations
  - [ ] UPDATE operations
  - [ ] DELETE operations
  - [ ] JOIN operations
  - [ ] Embedding generation & search

### 9.2 Critical Test Scenarios

1. **Supplier Creation in Sandbox:**
   - Create supplier in sandbox
   - Verify NOT visible in production queries
   - Verify embeddings NOT returned in production searches

2. **Invoice Processing:**
   - Process invoice in sandbox
   - Verify NOT affects production financial reports
   - Verify payment reconciliation isolated

3. **Module Configuration:**
   - Enable module in sandbox
   - Verify NOT enabled in production
   - Verify module data isolated

4. **Pattern Detection:**
   - User actions in sandbox
   - Verify patterns NOT detected in production context

---

## 10. Risk Mitigation

### 10.1 Known Risks

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| **Missed Query in Complex Service** | MEDIUM | HIGH | Code review + comprehensive testing |
| **JOIN without Environment Filter** | MEDIUM | HIGH | Automated linting rule (future) |
| **Embedding Cross-Contamination** | LOW | CRITICAL | Priority 2 refactor + validation tests |
| **Sequence Collision** | LOW | MEDIUM | Priority 15 refactor |

### 10.2 Validation Tools

1. **Manual Code Review Checklist:**
   - [ ] All `select()` have environment filter
   - [ ] All `insert()` include environment value
   - [ ] All `update()` filter by environment
   - [ ] All `delete()` filter by environment
   - [ ] All `leftJoin()`/`innerJoin()` filter joined tables by environment

2. **Automated Testing:**
   - Environment isolation tests per service
   - Cross-environment leak detection tests
   - Embedding search isolation tests

---

## Appendix A: Service Files Not Listed

**Services NOT analyzed (infrastructure only):**
- event-emitter.ts - Event bus, no table access
- cache.service.ts - In-memory cache
- health.service.ts - Health checks
- sse.service.ts - Server-sent events transport
- realtime.service.ts - WebSocket transport
- openai.service.ts - API wrapper
- whatsapp-api.service.ts - API wrapper
- storage.service.ts - GCS wrapper
- object-acl.service.ts - GCS ACL wrapper

These services are environment-agnostic by nature and don't require refactoring.

---

## Appendix B: Domain Route Files

**Critical route files to analyze in detail (separate subtasks):**

```
apps/api/routes/compras.ts          → Priority 3 (Procurement)
apps/api/routes/financeiro.ts       → Priority 5 (Finance)
apps/api/routes/comercial.ts        → Priority 9 (Sales)
apps/api/routes/gmail-messages.ts   → Priority 10 (Email)
apps/api/routes/whatsapp.ts         → Priority 14 (WhatsApp)
apps/api/routes/notifications.ts    → Priority 16 (Notifications)
apps/api/routes/connectors.ts       → Priority 8 (Connectors)
apps/api/routes/modules.ts          → Priority 12 (Modules)
```

Each route file may import and use multiple tables - detailed analysis needed per route.

---

**Document Status:** ✅ COMPLETE  
**Last Updated:** 2025-11-08  
**Next Review:** After Wave 1 completion
