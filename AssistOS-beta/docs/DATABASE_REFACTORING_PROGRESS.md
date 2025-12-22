# Database Refactoring Progress

**Status:** In Progress  
**Last Updated:** 2025-01-XX

## ✅ Completed

### Phase 1: Infrastructure & AI Chat Systems Refactoring

#### 1.1 Table Migration Service
- ✅ Created `apps/api/services/table-migration.service.ts`
- ✅ Supports table structure introspection
- ✅ Handles data migration with tenant filtering
- ✅ Generates DDL for CREATE TABLE, INDEXES, FOREIGN KEYS
- ✅ Cross-schema foreign key support

#### 1.2 Schema-Aware Query Builder
- ✅ Created `apps/api/utils/tenant-query-builder.ts`
- ✅ Automatic schema resolution
- ✅ CRUD operations (select, insert, update, delete, count)
- ✅ Environment filtering
- ✅ Raw SQL execution support

#### 1.3 AI Chat Systems Refactoring
**Changed from tenant-scoped (T+E) to user-scoped (U):**

- ✅ `conversations` table
  - Removed: `tenant_id`, `environment`
  - Added: `user_id` (NOT NULL, FK to users)
  - Updated indexes

- ✅ `messages` table
  - Removed: `tenant_id`, `environment`
  - Added: `user_id` (NOT NULL, FK to users, derived from conversation)
  - Updated indexes

- ✅ `conversation_insights` table
  - Removed: `tenant_id`, `environment`
  - Added: `user_id` (NOT NULL, FK to users)
  - Added: `conversation_id` (FK to conversations)
  - Updated indexes

- ✅ `assistbuild_conversations` table
  - Removed: `tenant_id`, `environment`
  - Added: `user_id` (NOT NULL, FK to users)
  - Updated indexes

- ✅ `assistbuild_messages` table
  - Added: `user_id` (NOT NULL, FK to users, derived from conversation)
  - Updated indexes

#### 1.4 Schema Definitions Updated
- ✅ Updated `shared/schema.ts` for all AI chat tables
- ✅ All references changed from `tenantId` to `userId`
- ✅ Indexes updated accordingly

#### 1.5 Migration Script
- ✅ Created `apps/api/scripts/migrate-ai-chat-to-user-scoped.ts`
- ✅ Handles data migration with user assignment
- ✅ Safe migration with NULL checks
- ✅ Index updates
- ✅ Added to `package.json` as `npm run migrate:ai-chat-to-user-scoped`

---

## 🔄 In Progress

### Phase 2: Tenant Schema Migrations

#### 2.1 Core Platform Tables (Pending)
- ⏳ `user_tenants` - **CRITICAL: Must be first**
- ⏳ `tenant_invitations`
- ⏳ `company_info`
- ⏳ `departments`
- ⏳ `teams`, `team_members`
- ⏳ `user_profiles`
- ⏳ `user_actions`
- ⏳ `user_sessions`
- ⏳ `tenant_context`
- ⏳ `tenant_blueprints`
- ⏳ `sequence_counters`

#### 2.2 Module Management Tables (Pending)
- ⏳ `tenant_modules`
- ⏳ `module_pages`
- ⏳ `module_features`
- ⏳ `module_interface_config`
- ⏳ `user_module_preferences`

#### 2.3 Business Module Tables (Pending)
- ⏳ All CRM tables (~15 tables)
- ⏳ All Financial tables (~35 tables)
- ⏳ All Inventory tables (~20 tables)
- ⏳ All Commercial/Sales tables (~25 tables)
- ⏳ All Projects tables (~20 tables)
- ⏳ All Lead Generation tables (~15 tables)
- ⏳ All Logistics tables (~3 tables)
- ⏳ All Document Management tables (~15 tables)
- ⏳ All Communication tables (~10 tables)
- ⏳ All Configuration tables (~25 tables)
- ⏳ All Integration tables (~15 tables)
- ⏳ All Agent & Automation tables (~25 tables)
- ⏳ All Purchasing tables (~15 tables)
- ⏳ All Miscellaneous tables (~20 tables)

**Total Pending: ~288 tables**

---

## 📋 Next Steps

### Immediate (Next Session)
1. Create migration script for `user_tenants` table
2. Test migration on a single tenant
3. Create batch migration script for core platform tables
4. Update service layers to use `TenantQueryBuilder`

### Short Term
1. Migrate all core platform tables
2. Migrate module management tables
3. Create module template system
4. Update all service layers

### Medium Term
1. Migrate business module tables (by dependency order)
2. Update all query builders
3. Performance testing
4. Documentation updates

---

## 🎯 Migration Order (Critical Dependencies)

1. **Foundation:**
   - `user_tenants` (all other tables depend on this)

2. **Core Tenant Data:**
   - `tenant_invitations`
   - `company_info`
   - `departments`
   - `teams`, `team_members`
   - `user_profiles`
   - `user_actions`
   - `user_sessions`
   - `tenant_context`
   - `tenant_blueprints`
   - `sequence_counters`

3. **Module Management:**
   - `tenant_modules`
   - `module_pages`
   - `module_features`
   - `module_interface_config`
   - `user_module_preferences`

4. **Business Modules (by dependency):**
   - `uoms` (referenced by products)
   - `products` (referenced by many)
   - `clients` (referenced by invoices, opportunities)
   - `suppliers` (referenced by purchase orders)
   - All other module tables...

---

## 📝 Notes

- All AI chat systems are now user-scoped (no tenant_id)
- Billing tables remain in public schema (centralized management)
- Global/platform tables remain in public schema
- Each tenant gets isolated schema for business data
- Cross-schema foreign keys supported (e.g., tenant_schema.clients → public.users)

---

## 🚨 Important

**Before running migrations:**
1. Backup database
2. Test on staging tenant first
3. Verify schema creation works
4. Check data integrity after each migration

**Migration Scripts:**
- `npm run migrate:ai-chat-to-user-scoped` - Run this first
- `npm run migrate:tenant-schemas` - Already run (creates schema registry)

