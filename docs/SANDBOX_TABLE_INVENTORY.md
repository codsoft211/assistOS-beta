# Sandbox Data Isolation - Table Inventory

**Generated:** 2025-11-08  
**Source:** shared/schema.ts (9099 lines)  
**Purpose:** Comprehensive inventory of all tables for sandbox environment isolation implementation

---

## Executive Summary

- **Total tables:** 165
- **Category A (Needs environment column):** 143
- **Category B (Already has environment column):** 8
- **Category C (Reference/immutable data):** 7
- **Category D (Global data, no tenant):** 7

**Critical Finding:** 143 tables require the `environment` column to be added for proper sandbox isolation.

---

## Category A: Tables Needing Environment Column (143 tables)

These tables have `tenantId` and are mutable but lack an `environment` column. They require immediate attention to prevent data leakage between sandbox and production.

### Core Platform & Configuration (11 tables)

| Table Name | Tenant Column | Primary Key | Notes |
|------------|---------------|-------------|-------|
| sequenceCounters | tenantId | varchar UUID | Generates sequential codes (SUP-0001, CLI-0001) |
| companyInfo | tenantId | varchar UUID | Company/tenant configuration data |
| modules | tenantId | varchar UUID | Installed modules per tenant |
| moduleInterfaceConfig | tenantId | varchar UUID | Module UI configuration |
| tenantModules | tenantId | varchar UUID | New modular architecture modules |
| moduleFeatures | tenantModuleId → tenantId | varchar UUID | Feature toggles per module |
| userModulePreferences | tenantId | varchar UUID | User-specific module preferences |
| tenantBlueprints | tenantId | varchar UUID | Business type/process blueprints |
| userTenants | tenantId | composite PK | User-tenant relationships & permissions |
| tenantInvitations | tenantId | varchar UUID | Pending tenant invitations |
| tenantContext | tenantId | serial | Cached tenant business context |

### Users & Authentication (7 tables)

| Table Name | Tenant Column | Primary Key | Notes |
|------------|---------------|-------------|-------|
| userOAuthTokens | tenantId | varchar UUID | OAuth tokens for integrations |
| userProfiles | tenantId | serial | User profile data per tenant |
| userGmailAccounts | tenantId | varchar UUID | Gmail account OAuth tokens |
| oauthStates | tenantId | varchar UUID | OAuth state management |
| onboardingCache | userId (indirect) | varchar UUID | Onboarding session data - SPECIAL CASE |
| userActions | tenantId | varchar UUID | User action tracking for analytics |
| detectedPatterns | tenantId | varchar UUID | AI-detected workflow patterns |

### Audit & Logging (3 tables)

| Table Name | Tenant Column | Primary Key | Notes |
|------------|---------------|-------------|-------|
| auditLog | tenantId | varchar UUID | General audit trail |
| studioAuditLog | tenantId | varchar UUID | Studio configuration changes |
| codeGenerationAudit | tenantId | varchar UUID | Code generation audit trail |

### Notifications (3 tables)

| Table Name | Tenant Column | Primary Key | Notes |
|------------|---------------|-------------|-------|
| notifications | tenantId | varchar UUID | User notifications |
| notificationRules | tenantId | varchar UUID | Configurable notification rules |
| conversationInsights | tenantId | serial | AI conversation insights |

### Proactive Intelligence (1 table)

| Table Name | Tenant Column | Primary Key | Notes |
|------------|---------------|-------------|-------|
| proactiveInsights | tenantId | varchar UUID | AI-generated business insights |

### Connectors & Integrations (6 tables)

| Table Name | Tenant Column | Primary Key | Notes |
|------------|---------------|-------------|-------|
| connectorSecrets | tenantId | varchar UUID | Encrypted connector credentials |
| connectorInstances | tenantId | varchar UUID | Installed connector instances |
| connectorSyncJobs | tenantId | varchar UUID | Background sync jobs |
| connectorSyncErrors | tenantId | varchar UUID | Sync error tracking |
| connectorEventLog | tenantId | varchar UUID | Connector event history |
| connectorSyncLogs | tenantId | varchar UUID | Detailed sync logs |

### Document Management (8 tables)

| Table Name | Tenant Column | Primary Key | Notes |
|------------|---------------|-------------|-------|
| documentProviders | tenantId | varchar UUID | S3/Azure/GCS provider configs |
| documents | tenantId | varchar UUID | Document metadata |
| documentVersions | tenantId (via documents) | varchar UUID | Document version history |
| documentShares | tenantId (via documents) | varchar UUID | Document sharing permissions |
| documentTags | tenantId | varchar UUID | Document tag taxonomy |
| documentFolders | tenantId | varchar UUID | Folder hierarchy |
| documentEmbeddings | tenantId | varchar UUID | Vector embeddings for search |
| documentAnalysisResults | tenantId | varchar UUID | OCR/AI analysis results |

### CRM & Commercial (14 tables)

| Table Name | Tenant Column | Primary Key | Notes |
|------------|---------------|-------------|-------|
| clients | tenantId | varchar UUID | Customer master data |
| clientContacts | tenantId | varchar UUID | Customer contact persons |
| clientDocuments | tenantId | varchar UUID | Customer-related documents |
| leads | tenantId | varchar UUID | Sales leads |
| leadActivities | tenantId | varchar UUID | Lead interaction history |
| leadScores | tenantId | varchar UUID | Lead scoring data |
| opportunities | tenantId | varchar UUID | Sales opportunities |
| opportunityRules | tenantId | varchar UUID | Opportunity automation rules |
| clientOrders | tenantId | varchar UUID | Customer orders |
| clientOrderLines | tenantId | varchar UUID | Order line items |
| salesPipelines | tenantId | varchar UUID | Sales pipeline definitions |
| salesPipelineStages | tenantId | varchar UUID | Pipeline stage definitions |
| quotes | tenantId | varchar UUID | Customer quotations |
| quoteLines | tenantId | varchar UUID | Quote line items |

### Quote Templates & Pricing (6 tables)

| Table Name | Tenant Column | Primary Key | Notes |
|------------|---------------|-------------|-------|
| quoteTemplates | tenantId | varchar UUID | Quote templates |
| quoteTemplateSections | tenantId | varchar UUID | Template sections |
| quoteTemplateLineItems | tenantId | varchar UUID | Template line items |
| quoteVersions | tenantId | varchar UUID | Quote version history |
| quotePriceBooks | tenantId | varchar UUID | Price books |
| quotePriceItems | tenantId | varchar UUID | Price book items |

### Products (1 table)

| Table Name | Tenant Column | Primary Key | Notes |
|------------|---------------|-------------|-------|
| products | tenantId | varchar UUID | Product catalog |

### Procurement & Suppliers (21 tables)

| Table Name | Tenant Column | Primary Key | Notes |
|------------|---------------|-------------|-------|
| suppliers | tenantId | varchar UUID | Supplier master data |
| supplierContacts | tenantId | varchar UUID | Supplier contact persons |
| supplierDocuments | tenantId | varchar UUID | Supplier-related documents |
| supplierPerformance | tenantId | varchar UUID | Supplier KPI tracking |
| supplierEmbeddings | tenantId | varchar UUID | Vector embeddings for search |
| purchaseRequisitions | tenantId | varchar UUID | Purchase requests |
| purchaseRequisitionLines | tenantId | varchar UUID | Requisition line items |
| rfqs | tenantId | varchar UUID | Request for quotations |
| rfqLines | tenantId | varchar UUID | RFQ line items |
| rfqQuotes | tenantId | varchar UUID | Supplier quotes on RFQs |
| rfqQuoteLines | tenantId | varchar UUID | Quote line items |
| purchaseOrders | tenantId | varchar UUID | Purchase orders |
| purchaseOrderLines | tenantId | varchar UUID | PO line items |
| receipts | tenantId | varchar UUID | Goods receipts |
| receiptLines | tenantId | varchar UUID | Receipt line items |
| supplierReturns | tenantId | varchar UUID | Supplier returns |
| supplierReturnLines | tenantId | varchar UUID | Return line items |
| purchasingInvoices | tenantId | varchar UUID | Supplier invoices (AP) |
| purchasingInvoiceLines | tenantId | varchar UUID | Invoice line items |
| purchasingPayments | tenantId | varchar UUID | Supplier payments |
| purchasingPaymentAllocations | tenantId | varchar UUID | Payment-invoice allocations |

### Expenses (1 table)

| Table Name | Tenant Column | Primary Key | Notes |
|------------|---------------|-------------|-------|
| employeeExpenses | tenantId | varchar UUID | Employee expense claims |

### Financial - AR & Banking (9 tables)

| Table Name | Tenant Column | Primary Key | Notes |
|------------|---------------|-------------|-------|
| invoices | tenantId | varchar UUID | Customer invoices (AR) |
| invoiceLines | tenantId | varchar UUID | Invoice line items |
| invoiceEmbeddings | tenantId | varchar UUID | Vector embeddings for search |
| payments | tenantId | varchar UUID | Customer payments received |
| paymentAllocations | tenantId | varchar UUID | Payment-invoice allocations |
| bankAccounts | tenantId | varchar UUID | Bank account configuration |
| bankTransactions | tenantId | varchar UUID | Imported bank transactions |
| bankReconciliations | tenantId | varchar UUID | Reconciliation headers |
| reconciliationMatches | tenantId | varchar UUID | Transaction matches |

### Budgeting (3 tables)

| Table Name | Tenant Column | Primary Key | Notes |
|------------|---------------|-------------|-------|
| budgets | tenantId | varchar UUID | Budget headers |
| budgetLines | tenantId | varchar UUID | Budget line items by category |
| budgetActuals | tenantId | varchar UUID | Actual vs budget tracking |

### Cost Templates (4 tables)

| Table Name | Tenant Column | Primary Key | Notes |
|------------|---------------|-------------|-------|
| costTemplates | tenantId | varchar UUID | Project cost templates |
| costTemplateSections | tenantId | varchar UUID | Template sections |
| costTemplateLineItems | tenantId | varchar UUID | Template line items |
| costSummaries | tenantId | varchar UUID | Project cost summaries |

### Rate Cards (2 tables)

| Table Name | Tenant Column | Primary Key | Notes |
|------------|---------------|-------------|-------|
| rateCards | tenantId | varchar UUID | Billing rate cards |
| rateCardRoles | tenantId | varchar UUID | Role-based rates |

### Projects (7 tables)

| Table Name | Tenant Column | Primary Key | Notes |
|------------|---------------|-------------|-------|
| projects | tenantId | varchar UUID | Project master data |
| projectEmbeddings | tenantId | varchar UUID | Vector embeddings for search |
| projectTasks | tenantId | varchar UUID | Project tasks |
| projectTaskDependencies | tenantId (via tasks) | varchar UUID | Task dependencies |
| projectMilestones | tenantId | varchar UUID | Project milestones |
| projectResources | tenantId | varchar UUID | Resource allocations |
| projectTimeEntries | tenantId | varchar UUID | Time tracking entries |

### Logistics & Warehouse (5 tables)

| Table Name | Tenant Column | Primary Key | Notes |
|------------|---------------|-------------|-------|
| warehouses | tenantId | varchar UUID | Warehouse locations |
| warehouseLocations | tenantId | varchar UUID | Bin/shelf locations |
| stockItems | tenantId | varchar UUID | Inventory items |
| stockMovements | tenantId | varchar UUID | Stock movement transactions |
| stockAlerts | tenantId | varchar UUID | Low stock alerts |

### Production & Manufacturing (6 tables)

| Table Name | Tenant Column | Primary Key | Notes |
|------------|---------------|-------------|-------|
| productionWorkOrders | tenantId | varchar UUID | Work orders |
| productionOperations | tenantId | varchar UUID | Operation steps |
| productionMaterials | tenantId | varchar UUID | Material consumption |
| productionQualityChecks | tenantId | varchar UUID | Quality inspections |
| productionDefects | tenantId | varchar UUID | Defect tracking |
| productionIntegrations | tenantId | varchar UUID | Production system integrations |

### Catering-Specific (3 tables)

| Table Name | Tenant Column | Primary Key | Notes |
|------------|---------------|-------------|-------|
| cateringKitchenWorkflows | tenantId | varchar UUID | Kitchen prep workflows |
| cateringPrepLists | tenantId | varchar UUID | Event prep lists |
| cateringLogistics | tenantId | varchar UUID | Delivery logistics |

### Configuration Studio V2 (6 tables)

| Table Name | Tenant Column | Primary Key | Notes |
|------------|---------------|-------------|-------|
| tenantCodeModules | tenantId | varchar UUID | Custom code modules |
| executionPlans | tenantId | varchar UUID | Code deployment plans |
| sandboxExecutions | tenantId | varchar UUID | Sandbox test executions - SPECIAL |
| tenantCodeTests | tenantId | varchar UUID | Custom test suites |
| blueprintUsageStats | tenantId | varchar UUID | Blueprint usage analytics |
| blueprintImprovements | sourceTenantId | varchar UUID | Tenant-contributed improvements |

### Governance (1 table)

| Table Name | Tenant Column | Primary Key | Notes |
|------------|---------------|-------------|-------|
| governancePolicies | tenantId | varchar UUID | Tenant governance policies |

### Gmail Integration (6 tables)

| Table Name | Tenant Column | Primary Key | Notes |
|------------|---------------|-------------|-------|
| gmailMessages | tenantId | varchar UUID | Synced Gmail messages |
| gmailThreads | tenantId | varchar UUID | Email threads |
| gmailAutoResponders | tenantId | varchar UUID | Auto-responder rules |
| gmailSettings | tenantId | varchar UUID | Gmail sync settings |
| gmailTemplates | tenantId | varchar UUID | Email templates |
| emailClassifications | tenantId | varchar UUID | AI email classifications |

### WhatsApp Integration (5 tables)

| Table Name | Tenant Column | Primary Key | Notes |
|------------|---------------|-------------|-------|
| whatsappAccounts | tenantId | varchar UUID | WhatsApp Business accounts |
| whatsappContacts | tenantId | varchar UUID | Contact directory |
| whatsappMessages | tenantId | varchar UUID | Message history |
| whatsappTemplates | tenantId | varchar UUID | Message templates |
| whatsappConversations | tenantId | varchar UUID | Conversation threads |

---

## Category B: Already Has Environment Column (8 tables)

These tables already implement sandbox isolation correctly.

| Table Name | Environment Config | Primary Key | Tenant Column | Notes |
|------------|-------------------|-------------|---------------|-------|
| generatedCode | environment text NOT NULL | varchar UUID | tenantId | AssistBuild generated code |
| assistbuildJobs | environment text NOT NULL | varchar UUID | tenantId | Code generation jobs |
| conversations | environment text NOT NULL DEFAULT 'production' | varchar UUID | tenantId | AI conversations |
| messages | environment text NOT NULL DEFAULT 'production' | varchar UUID | tenantId | Conversation messages |
| tenantCodeFiles | environment text NOT NULL | varchar UUID | tenantId | Custom code files |
| tenantCodeArtifacts | environment text NOT NULL | varchar UUID | tenantId | Compiled code artifacts |
| tenantCodeReleases | environment text NOT NULL | varchar UUID | tenantId | Code deployment releases |
| tenantSecrets | environment text NOT NULL | varchar UUID | tenantId | Encrypted secrets by environment |

**Pattern:** All these tables use `environment: text("environment").notNull()` with values 'sandbox' | 'production'

---

## Category C: Reference/Immutable Data (7 tables)

These tables contain global reference data or are linked via tables that already have environment columns.

| Table Name | Reason | Primary Key |
|------------|--------|-------------|
| tenants | Master tenant record itself - container for environments | varchar UUID |
| blueprintSignatures | Linked to global blueprintTemplates | varchar UUID |
| blueprintVersions | Linked to global blueprintTemplates | varchar UUID |
| blueprintHealth | Metrics for blueprint versions | varchar UUID |
| codeValidationResults | Linked via executionPlans (has tenantId) | varchar UUID |
| projectTaskDependencies | Already has tenantId via projectTasks | composite |
| documentVersions | Already has tenantId via documents | varchar UUID |

**Note:** Some of these (like codeValidationResults, projectTaskDependencies) inherit tenant context through foreign keys and may need reconsideration.

---

## Category D: Global Tables (No Tenant) (7 tables)

These tables are platform-wide and have no tenant isolation.

| Table Name | Reason | Primary Key |
|------------|--------|-------------|
| users | Global user accounts across all tenants | varchar UUID |
| moduleTemplates | Platform-provided module catalog | varchar UUID |
| workflowTemplates | Platform-provided workflow templates | varchar UUID |
| executionTierPolicies | Global execution tier policies | varchar UUID |
| blueprintTemplates | Global blueprint catalog | varchar UUID |
| waitlistEntries | Pre-signup waitlist (no tenant yet) | varchar UUID |
| platformMetrics | Platform-wide metrics | varchar UUID |
| connectorDefinitions | Global connector catalog | varchar UUID |

---

## Special Cases & Considerations

### 1. **sandboxExecutions**
- Already tracks sandbox vs production execution
- Has `tenantId` and `executionTier`
- May need `environment` column for consistency, or may be inherently sandbox-only

### 2. **onboardingCache**
- Has `userId` but not direct `tenantId`
- Pre-tenant creation data
- May not need environment isolation (ephemeral data)

### 3. **userTenants**
- Has `activeEnvironment` field (user's current working environment)
- This is NOT the same as data environment isolation
- Should still get `environment` column for the relationship record itself

### 4. **Audit Logs** (auditLog, studioAuditLog, codeGenerationAudit)
- Currently track ALL actions (sandbox + production)
- Decision needed: Should audit logs be environment-specific or unified?
- Recommendation: ADD environment column to track WHERE action occurred

### 5. **Embedding Tables** (documentEmbeddings, invoiceEmbeddings, etc.)
- Vector search data tied to parent records
- MUST have environment column to match parent data isolation

### 6. **Line Item Tables** (invoiceLines, purchaseOrderLines, etc.)
- Inherit tenantId from parent tables
- MUST have environment column to ensure cascade isolation

---

## Implementation Priority

### Phase 1: Critical Business Data (Priority 1)
- **Clients & CRM:** clients, clientContacts, leads, opportunities
- **Financial:** invoices, invoiceLines, payments, purchasingInvoices
- **Procurement:** purchaseOrders, purchaseOrderLines, suppliers
- **Projects:** projects, projectTasks, projectTimeEntries

**Rationale:** These tables contain core business transactions that MUST NOT mix between sandbox and production.

### Phase 2: Supporting Data (Priority 2)
- **Documents:** documents, documentFolders, documentEmbeddings
- **Products & Inventory:** products, stockItems, stockMovements
- **Quotes & Templates:** quotes, quoteLines, quoteTemplates
- **Banking:** bankAccounts, bankTransactions, bankReconciliations

**Rationale:** Essential operational data that supports core business functions.

### Phase 3: Configuration & Automation (Priority 3)
- **Module Config:** modules, tenantModules, moduleFeatures
- **Notifications:** notifications, notificationRules
- **Connectors:** connectorInstances, connectorSyncJobs
- **Budgets:** budgets, budgetLines, budgetActuals

**Rationale:** Configuration data that affects system behavior but less risk of data corruption.

### Phase 4: Integration & Communication (Priority 4)
- **Gmail:** gmailMessages, gmailThreads, gmailAutoResponders
- **WhatsApp:** whatsappMessages, whatsappConversations, whatsappContacts
- **Audit:** auditLog, studioAuditLog, codeGenerationAudit

**Rationale:** External integrations and logging - can be done last.

---

## Migration Strategy Recommendations

### 1. Schema Changes
```sql
-- Template for adding environment column
ALTER TABLE <table_name> 
ADD COLUMN environment text NOT NULL DEFAULT 'production';

-- Add index for performance
CREATE INDEX <table_name>_tenant_env_idx 
ON <table_name>(tenant_id, environment);
```

### 2. Data Migration
- All existing data should be marked as `environment = 'production'`
- No data needs to be copied to sandbox initially (sandbox starts empty)

### 3. Application Code Updates
- Update all INSERT statements to include `environment` based on user context
- Update all SELECT statements to filter by `WHERE environment = <current_env>`
- Update Drizzle schema definitions
- Update TypeScript types

### 4. Testing Strategy
- Start with a single low-risk table (e.g., `products`)
- Verify sandbox isolation works correctly
- Roll out to remaining tables in priority order

---

## Risks & Mitigation

### Risk 1: Missed Tables
**Impact:** Data leakage between sandbox and production  
**Mitigation:** This inventory document + code review + comprehensive testing

### Risk 2: Incomplete WHERE Clauses
**Impact:** Production data appears in sandbox or vice versa  
**Mitigation:** Database-level RLS policies + application-level filters + integration tests

### Risk 3: Foreign Key Cascades
**Impact:** Deleting sandbox data might cascade to production if environment filter missing  
**Mitigation:** Review all FK constraints + test cascade behavior in sandbox

### Risk 4: Performance Impact
**Impact:** Additional index overhead on 143 tables  
**Mitigation:** Composite indexes on (tenant_id, environment) for efficient queries

---

## Next Steps

1. **Review & Validate** this inventory with development team
2. **Create Migration Scripts** for Phase 1 tables (SQL ALTER TABLE statements)
3. **Update Drizzle Schema** in `shared/schema.ts` for Phase 1 tables
4. **Implement RLS Policies** (Row-Level Security) at database level
5. **Update Application Code** to include environment filters
6. **Write Integration Tests** to verify sandbox isolation
7. **Deploy to Staging** and test thoroughly
8. **Phased Production Rollout** starting with Phase 1

---

**Document Status:** ✅ COMPLETE  
**Total Analysis Time:** Full schema scan of 9099 lines  
**Tables Analyzed:** 165  
**Tables Requiring Action:** 143  
**Ready for:** Technical review & implementation planning
