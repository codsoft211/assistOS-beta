# Advanced Custom Fields Implementation

## Overview
Extended AssistOS custom fields system to support 4 advanced field types for the Angariação (Lead Generation) module, enabling conversational configuration through AssistBuild.

---

## Implemented Advanced Field Types

### 1. **Auto-Number** (`auto_number`)
- **Purpose**: Auto-generate unique sequential codes with custom patterns
- **Backend**: Integrates with existing `SequenceService` for thread-safe generation
- **Frontend**: Read-only preview showing pattern template
- **Config Structure**:
  ```json
  {
    "pattern": "PROP-{YYYY}-{SEQ4}",
    "entityType": "lead",
    "paddingLength": 4
  }
  ```
- **Example Output**: `PROP-2025-0001`, `PROP-2025-0002`

### 2. **Currency** (`currency`)
- **Purpose**: Store monetary values with currency code
- **Backend**: Stores as decimal, validates precision
- **Frontend**: Input with currency symbol (€ or $), step="0.01"
- **Config Structure**:
  ```json
  {
    "currencyCode": "EUR",
    "decimalPlaces": 2
  }
  ```
- **Example**: `{ value: 1500.50, currency: "EUR" }`

### 3. **Text Multiline** (`text_multiline`)
- **Purpose**: Multi-line text input (e.g., descriptions, notes)
- **Backend**: Stored as plain text
- **Frontend**: Textarea component (3 rows, auto-resize)
- **Config Structure**: None required
- **Example**: Long-form lead notes

### 4. **Computed/Formula** (`computed`)
- **Purpose**: Auto-calculate values from other fields
- **Backend**: Safe arithmetic evaluation (whitelisted operations only)
- **Frontend**: Read-only display with formula preview
- **Config Structure**:
  ```json
  {
    "formula": "field1 + field2 * 1.23",
    "dependencies": ["field1", "field2"],
    "allowOverride": false
  }
  ```
- **Security**: Only allows `+`, `-`, `*`, `/`, `()`, numbers, and whitelisted variables

---

## Architecture Changes

### Schema (shared/schema.ts)
```typescript
export const moduleCustomFields = pgTable("module_custom_fields", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  moduleId: varchar("module_id").notNull().references(() => modules.id),
  name: text("name").notNull(),
  label: text("label").notNull(),
  type: text("type").notNull(),
  options: jsonb("options"),
  config: jsonb("config"), // ← NEW COLUMN
  required: boolean("required").notNull().default(false),
  order: integer("order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
```

### AssistBuild Tool (packages/modules/angariacao/tools/index.ts)
**Enhanced**: `configure_lead_generation_fields`
- Added validation for advanced field types
- Persists type-specific config (pattern, formula, currencyCode, etc.)
- Integrated into AssistBuild's 26 configuration-only tools

### Backend Processor (packages/modules/angariacao/services/custom-fields-processor.ts)
**NEW SERVICE**: `CustomFieldsProcessor`
- `processFields()`: Main entry point for field processing
- `generateAutoNumber()`: Calls SequenceService with tenant isolation
- `processCurrency()`: Parses and formats monetary values
- `evaluateFormula()`: Safe arithmetic evaluation (no `eval()`)
- `safeEvaluate()`: Whitelist-based expression parser

### Routes Integration (apps/api/routes/angariacao.ts)
**Modified**: POST `/api/angariacao/leads`, PATCH `/api/angariacao/leads/:id`
- Looks up module ID by slug (`angariacao`) before querying custom fields
- Calls `CustomFieldsProcessor.processFields()` before saving
- Merges processed values into `customFields` JSONB column

### Frontend Widgets (client/src/components/angariacao/CaptureLeadDialog.tsx)
**Extended**: Dynamic field renderer
- **Auto-Number**: Disabled input + "Generated automatically" helper text
- **Currency**: Number input with € or $ prefix (absolute positioned)
- **Text Multiline**: Full-width textarea (md:col-span-2)
- **Computed**: Disabled input + formula preview in helper text

---

## Usage Flow (End-to-End)

### 1. Configuration via AssistBuild
User talks to AssistBuild in Studio:
```
User: "Adiciona um campo auto-numérico para número de proposta no formato PROP-2025-XXXX"

AssistBuild: [Calls configure_lead_generation_fields tool]
{
  "fieldName": "numeroPropo sta",
  "label": "Número de Proposta",
  "type": "auto_number",
  "config": {
    "pattern": "PROP-{YYYY}-{SEQ4}",
    "entityType": "lead"
  }
}

✅ Field configured and persisted to module_custom_fields table
```

### 2. Lead Creation (Frontend → Backend)
**Frontend** (CaptureLeadDialog):
- User fills form, auto-number field shows preview pattern
- On submit: `POST /api/angariacao/leads`
  ```json
  {
    "email": "lead@example.com",
    "firstName": "João",
    "customFields": {}  // Empty - auto-number generated server-side
  }
  ```

**Backend** (angariacao.ts routes):
1. Look up Angariação module ID by slug
2. Fetch custom fields configuration
3. **Call CustomFieldsProcessor**:
   - Generates auto-number: `PROP-2025-0001`
   - Validates currency values
   - Evaluates computed formulas
4. Insert lead with processed `customFields`:
   ```json
   {
     "numeroProposta": "PROP-2025-0001",
     "valorEstimado": { "value": 5000.00, "currency": "EUR" }
   }
   ```

### 3. Display (Frontend)
When viewing lead details, custom fields render with proper formatting:
- Auto-number: `PROP-2025-0001` (read-only)
- Currency: `€ 5,000.00`
- Computed: `€ 6,150.00` (with formula tooltip)

---

## Security Considerations

### Formula Evaluation Safety
```typescript
// ✅ SAFE - Whitelisted operations only
safeEvaluate("field1 + field2 * 1.23", { field1: 100, field2: 50 })
// → 161.5

// ❌ BLOCKED - Invalid characters
safeEvaluate("alert('XSS')", {})
// → Throws: "Formula contains invalid characters"

// ❌ BLOCKED - Non-numeric result
safeEvaluate("'hello' + 'world'", {})
// → Throws: "Formula did not evaluate to a number"
```

### Tenant Isolation
- Auto-number generation passes `tenantId` to SequenceService
- Each tenant has isolated sequence counters
- Prevents cross-tenant leakage

### Input Validation
- Currency values rounded to specified decimal places
- Computed fields validate all dependencies present before evaluation
- Auto-number patterns validated against allowed placeholders

---

## Known Limitations

### 1. Database Migration Blocked
**Issue**: `npm run db:push` times out when adding `config` column
**Status**: Migration SQL ready but requires manual application
**SQL to Run**:
```sql
ALTER TABLE module_custom_fields ADD COLUMN IF NOT EXISTS config jsonb;
```

### 2. Global Field Scope
**Current**: `moduleCustomFields` table is scoped by `moduleId` only (no `tenantId`)
**Implication**: All tenants share the same field definitions for a module
**Impact**: Low - most tenants want similar fields; can be addressed later if needed

### 3. Auto-Number Preview
**Current**: Frontend shows pattern template (`PROP-{YYYY}-{SEQ4}`)
**Future Enhancement**: Could show next actual value via preview API

### 4. Currency Storage Format
**Current**: Stores as `{ value: number, currency: string }`
**Note**: Drizzle ORM returns decimals as strings for precision - use `Number()` in arithmetic

---

## Testing Checklist

**Once migration is applied**, test the following:

### AssistBuild Configuration
- [ ] Create auto-number field via conversation
- [ ] Create currency field with EUR and USD
- [ ] Create computed field with formula
- [ ] Create text_multiline field
- [ ] Verify fields persist to `module_custom_fields` table
- [ ] Verify `config` column stores type-specific settings

### Lead Creation (POST)
- [ ] Auto-number generates sequential codes (PROP-2025-0001, PROP-2025-0002)
- [ ] Currency stores with correct precision
- [ ] Computed field evaluates formula correctly
- [ ] Text multiline accepts multi-line input
- [ ] Missing dependencies prevent computed field calculation

### Lead Update (PATCH)
- [ ] Updating other fields preserves auto-number
- [ ] Currency updates validate precision
- [ ] Computed field recalculates on dependency change
- [ ] Text multiline updates correctly

### Frontend Rendering
- [ ] Auto-number shows as read-only with helper text
- [ ] Currency input shows € or $ prefix
- [ ] Text multiline spans full width (md:col-span-2)
- [ ] Computed field shows formula in helper text
- [ ] All test IDs present (`data-testid="input-custom-{name}"`)

---

## Next Steps

### Immediate (User Action Required)
1. **Apply migration in Supabase dashboard**:
   ```sql
   ALTER TABLE module_custom_fields ADD COLUMN IF NOT EXISTS config jsonb;
   ```
2. **Restart application** to pick up code changes
3. **Test end-to-end flow** using checklist above

### Future Enhancements
1. **Tenant-Specific Fields**: Add `tenantId` column to `moduleCustomFields`
2. **Auto-Number Preview API**: Endpoint to fetch next sequential value
3. **Formula Builder UI**: Visual formula editor in AssistBuild
4. **Currency Formatter**: Client-side formatting (€ 1.234,56 vs $ 1,234.56)
5. **Computed Field Dependencies Graph**: Prevent circular dependencies
6. **Field History Audit**: Track changes to custom field configurations

---

## Files Modified

### Backend
- `shared/schema.ts` - Added `config: jsonb` column
- `packages/modules/angariacao/tools/index.ts` - Enhanced `configure_lead_generation_fields` tool
- `packages/modules/angariacao/services/custom-fields-processor.ts` - NEW service
- `apps/api/routes/angariacao.ts` - Integrated processor into POST/PATCH routes

### Frontend
- `client/src/components/angariacao/CaptureLeadDialog.tsx` - Added widget renderers for 4 advanced types

### Documentation
- `ADVANCED_CUSTOM_FIELDS_IMPLEMENTATION.md` - This file

---

## Support

For questions or issues, reference:
- Architecture: `replit.md`
- Testing Guide: `TESTING_CUSTOM_FIELDS.md` (if exists)
- Configuration Guide: `TENANT_CONFIGURATION_GUIDE.md` (if exists)

**Migration Status**: ⚠️ PENDING USER ACTION - Manual SQL required
**Code Status**: ✅ COMPLETE - All 4 types implemented and reviewed
**Testing Status**: ⏳ BLOCKED - Awaiting database migration
