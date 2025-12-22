# Credit System - Phase 1 Completed ✅

**Date:** November 20, 2025  
**Status:** COMPLETED

## Objective
Create the foundational database schema for the Credit System, supporting AI model usage tracking with extensibility for future credit types (WhatsApp, Storage, etc).

---

## ✅ Completed Tasks

### 1. Database Tables Created

All 4 core tables successfully created in production database:

#### **credit_pricing_rules** (Provider Cost Configuration)
- Stores real provider costs (OpenAI, Meta, Twilio, etc)
- Supports tenant-specific overrides (NULL tenant_id = global rule)
- Environment-isolated (production/sandbox)
- **Unique constraint:** `(tenant_id, resource_type, resource_name, unit_type, environment)`
  - ⚠️ **Fixed:** Added `unit_type` to unique index (was missing, preventing separate input/output token pricing)

**Columns:**
- `id`, `tenant_id`, `environment`
- `resource_type`, `resource_name`, `unit_type`
- `price_per_unit` (DECIMAL 15,8 - high precision for micro-pricing)
- `currency`, `description`, `is_active`
- `created_at`, `updated_at`

#### **tenant_credits** (Current Balance)
- One record per tenant per environment
- Tracks current balance + lifetime stats
- CHECK constraints prevent negative balances
- Low balance alert system ready

**Columns:**
- `id`, `tenant_id`, `environment`
- `balance`, `reserved`, `lifetime_usage`, `lifetime_purchases` (all DECIMAL 15,2)
- `low_balance_threshold`, `low_balance_notified`
- `last_purchase_at`, `last_usage_at`
- `created_at`, `updated_at`

#### **usage_events** (Detailed Usage Tracking)
- Granular tracking of every billable operation
- Links to conversations, users, orchestrators
- Flexible JSONB metadata for provider-specific data
- Status tracking (completed/failed/refunded)

**Columns:**
- `id`, `tenant_id`, `environment`
- `resource_type`, `resource_name`, `unit_type`, `quantity`
- `price_per_unit`, `total_cost`, `currency`
- `user_id`, `conversation_id`, `orchestrator_type`
- `metadata` (JSONB - AI tokens, tool execution details, etc)
- `status`, `error_message`, `created_at`

#### **credit_transactions** (Audit Trail)
- Complete financial audit trail
- Links to usage_events for consumption transactions
- Supports purchase, consumption, refund, adjustment types
- Before/after balance snapshots

**Columns:**
- `id`, `tenant_id`, `environment`
- `type`, `amount`, `balance_before`, `balance_after`, `currency`
- `usage_event_id` (FK to usage_events)
- `resource_type`, `resource_name`
- `payment_method`, `payment_reference`, `invoice_id`
- `description`, `metadata` (JSONB)
- `created_by`, `created_at`

---

### 2. Indexes Created

**Performance optimizations:**
- `tenant_credits_tenant_idx`: Fast tenant lookups
- `tenant_credits_balance_idx`: Low balance queries
- `credit_transactions_tenant_idx`: Transaction history by tenant
- `credit_transactions_type_idx`: Filter by transaction type
- `credit_transactions_usage_event_idx`: Link transactions to usage
- `usage_events_resource_idx`: Cost analysis by resource
- `usage_events_user_idx`: Per-user usage tracking
- `usage_events_conversation_idx`: Conversation-level costs

---

### 3. Seed Data: OpenAI Pricing Rules

Inserted 3 pricing rules for OpenAI GPT-5:

| Resource | Unit Type | Provider Cost (EUR) | Description |
|----------|-----------|---------------------|-------------|
| gpt-5 | input_tokens_1k | €0.009 | Input tokens (per 1K) |
| gpt-5 | output_tokens_1k | €0.027 | Output tokens (per 1K) |
| text-embedding-3-small | tokens_1k | €0.00002 | Embeddings (per 1K) |

**Note:** These are PROVIDER COSTS. The CreditUsageService will apply the 70% margin to calculate customer-facing credits.

**Conversion formula:**
```
Provider Cost → Credits Charged
€0.027 (output 1K tokens) / €0.03 (cost per credit) = 0.9 credits
```

---

### 4. Schema.ts Updated

Fixed unique index definition in `shared/schema.ts`:
```typescript
// BEFORE (WRONG): Allowed only ONE pricing rule per resource
uniquePricing: uniqueIndex("credit_pricing_rules_unique_idx")
  .on(sql`COALESCE(${table.tenantId}, '')`, table.resourceType, table.resourceName, table.environment)

// AFTER (CORRECT): Allows separate pricing for input/output tokens
uniquePricing: uniqueIndex("credit_pricing_rules_unique_idx")
  .on(sql`COALESCE(${table.tenantId}, '')`, table.resourceType, table.resourceName, table.unitType, table.environment)
```

---

## 🎯 Why This Design is Generic & Extensible

### Adding WhatsApp (Future):
```sql
-- Just insert pricing rule, NO code changes needed
INSERT INTO credit_pricing_rules VALUES
  ('production', 'external_service', 'whatsapp', 'message', 0.005, 'EUR', 'WhatsApp message cost', true);
```

### Adding Storage (Future):
```sql
INSERT INTO credit_pricing_rules VALUES
  ('production', 'storage', 'google_cloud_storage', 'gb_month', 0.020, 'EUR', 'Storage cost per GB/month', true);
```

### Adding Custom Tool Cost:
```sql
INSERT INTO credit_pricing_rules VALUES
  ('production', 'tool_execution', 'google_document_ai', 'page', 0.015, 'EUR', 'OCR cost per page', true);
```

**The CreditUsageService will use the SAME API for all of these!**

---

## 📊 Database Verification

```sql
-- Verify tables exist
SELECT table_name FROM information_schema.tables 
WHERE table_name IN ('tenant_credits', 'credit_transactions', 'usage_events', 'credit_pricing_rules');

-- Result: ✅ All 4 tables present

-- Verify pricing rules
SELECT resource_name, unit_type, price_per_unit FROM credit_pricing_rules;

-- Result: ✅ 3 rules (gpt-5 input/output + embeddings)
```

---

## ⚠️ Known Issues & Fixes

### Issue #1: Drizzle Kit Hanging
**Problem:** `npm run db:push` hangs when pulling large schema  
**Solution:** Created tables via direct SQL using `execute_sql_tool`  
**Impact:** None - tables created successfully, schema.ts remains source of truth

### Issue #2: Missing unit_type in Unique Index
**Problem:** Original unique index prevented separate pricing for input/output tokens  
**Root Cause:** Schema.ts line 121 missing `table.unitType`  
**Fix Applied:** 
1. Dropped old index
2. Created new index with `unit_type` included
3. Updated schema.ts to match
**Status:** ✅ FIXED

---

## 🚀 Next Steps (Phase 2)

1. **Create CreditUsageService** (`packages/services/credit-usage/index.ts`)
   - Core method: `trackUsageAndDeductCredits()`
   - Atomic balance updates with row locking (`SELECT FOR UPDATE`)
   - Automatic margin application (70%)
   - Complete audit trail creation

2. **Testing**
   - Unit tests for credit calculations
   - Concurrency tests (100 parallel deductions)
   - Negative balance prevention validation

3. **Integration**
   - Wire up to AssistME orchestrator
   - Wire up to AssistBuild orchestrator

---

## 📝 Notes for Team

- **Provider costs are configurable** - Update `credit_pricing_rules` table, no code changes needed
- **Margin is applied at runtime** - Not stored in database, calculated by service layer
- **Multi-tenant safe** - All queries filtered by `tenant_id` + `environment`
- **Audit trail complete** - Every credit movement linked to transaction + usage event
- **Extensible by design** - Add new providers by inserting pricing rules only

---

**Phase 1 Status:** ✅ COMPLETE - Ready for Phase 2 (CreditUsageService implementation)
