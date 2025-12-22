# Universal CSV-Driven Module Configuration

**Feature Specification: Analyze, Configure & Import**  
**Version:** 1.0  
**Date:** November 21, 2025  
**Status:** Proposed

---

## 🎯 Executive Summary

Enable AssistBuild to accept CSV/Excel uploads and automatically configure modules by analyzing file structure, creating custom fields, and importing historical data - all in one conversational flow.

**Target Modules:** Lead Generation, CRM (Clients, Opportunities, Orders), Projects, and all future modules using the universal entities system.

---

## 📋 Problem Statement

### Current State

Users must manually configure custom fields one-by-one in AssistBuild before importing data:

1. **Manual Configuration Phase** (5-10 minutes)
   - Open AssistBuild Studio
   - Create each custom field individually
   - Define field types, labels, options
   - Remember Excel column names from memory

2. **Separate Import Phase**
   - Switch to AssistME chat
   - Upload CSV/Excel file
   - Hope field names match what was configured
   - Fix mismatches if they occur

### Pain Points

- ⏱️ **Time-consuming:** Manual field configuration takes 5-10 minutes per module
- ❌ **Error-prone:** Typing field names, choosing types, remembering Excel column names
- 🔀 **Poor UX:** Breaking conversational flow by switching between two AI agents
- 🤔 **Lost opportunity:** We already have the user's Excel structure - why not use it?
- 📊 **Data silos:** Historical data remains in spreadsheets instead of being imported

### Business Impact

- Slower onboarding for new tenants
- Higher risk of configuration errors
- Reduced adoption of data import features
- Poor first-impression experience

---

## ✅ Proposed Solution

### Vision: Template-Driven Auto-Configuration

Create a **universal tool** that accepts CSV/Excel uploads and automatically:

1. 📊 **Analyze** the file structure (columns, data types, sample values)
2. ⚙️ **Configure** matching custom fields using existing tools
3. 📥 **Import** historical data in one atomic operation
4. ✅ **Report** complete summary of configuration and import results

### Conversational Experience

```
User: "I want to configure the leads module"

AssistBuild: 
  "Great! Do you have an Excel or CSV file with leads 
   you're currently using? If so, attach it and I'll 
   automatically adapt the system to match your format."

User: [attaches clients_database.xlsx]

AssistBuild: 
  "📊 Analyzing your file...
   
   Found 8 columns with 247 lead records.
   
   🔍 Detected structure:
   • Client Name ✅ (matched to name)
   • Budget ⚙️ (new number field)
   • Event Type ⚙️ (new dropdown: Wedding, Corporate, Birthday...)
   • Event Date ⚙️ (new date field)
   • Guest Count ⚙️ (new number field)
   • Location ⚙️ (new text field)
   • Notes ⚙️ (new text field)
   • Contact ✅ (matched to phone)
   
   Creating 6 custom fields and importing 247 leads...
   
   ✅ Complete! 
   • 6 custom fields created
   • 247 leads imported successfully
   • 0 errors
   
   Your lead generation system is ready to use! 🎉"
```

---

## 🔧 Technical Specification

### Tool Definition

**Name:** `analyze_configure_and_import_entities`

**Category:** `assistbuild`

**Description:** Universal CSV/Excel analysis and import tool for any module. Analyzes file structure, auto-creates custom fields, and imports historical records.

### Input Schema

```typescript
{
  moduleId: string,              // "lead-generation" | "crm" | "projects" | ...
  entityType: string,            // "lead" | "client" | "project" | "opportunity" | ...
  filePath: string,              // Path to uploaded Excel/CSV
  dryRun?: boolean,              // Preview only, don't commit (default: false)
  autoCreateFields?: boolean,    // Auto-create missing fields (default: true)
  importData?: boolean           // Import records after config (default: true)
}
```

### Process Flow

#### 1. Parse & Analyze

```typescript
// Parse Excel/CSV using xlsx library
const workbook = xlsx.readFile(filePath);
const worksheet = workbook.Sheets[workbook.SheetNames[0]];
const data = xlsx.utils.sheet_to_json(worksheet);

// Analyze structure
const columns = Object.keys(data[0]);
const rowCount = data.length;

// For each column, analyze:
// - Column name
// - Data type (infer from sample values)
// - Unique values (for dropdown detection)
// - Null count (for required field detection)
```

#### 2. Smart Mapping

```typescript
const COMMON_MAPPINGS = {
  // Name variations
  ["nome", "name", "client", "cliente", "lead"]: "name",
  
  // Contact variations
  ["email", "mail", "e-mail", "emailaddress"]: "email",
  ["telefone", "phone", "tel", "contact", "mobile"]: "phone",
  
  // Business variations
  ["empresa", "company", "organization", "org"]: "company",
  ["industry", "setor", "sector", "industria"]: "industry",
  
  // Financial variations
  ["budget", "orcamento", "value", "valor"]: "budget",
  ["revenue", "receita", "faturacao", "turnover"]: "revenue",
  
  // Date variations
  ["date", "data", "when", "deadline", "duedate"]: "date",
  
  // Location variations
  ["location", "localizacao", "address", "endereco"]: "location",
  
  // Status variations
  ["status", "estado", "state", "stage"]: "status"
};

function mapColumn(columnName: string): string | null {
  const normalized = columnName.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
  
  for (const [variations, standardName] of Object.entries(COMMON_MAPPINGS)) {
    if (variations.includes(normalized)) {
      return standardName;
    }
  }
  
  return null; // Unmapped - needs new custom field
}
```

#### 3. Intelligent Type Detection

```typescript
function inferFieldType(columnName: string, values: any[]): FieldType {
  const nonNullValues = values.filter(v => v != null && v !== '');
  const uniqueValues = new Set(nonNullValues);
  
  // Date detection (by name or format)
  if (isDateColumn(columnName, nonNullValues)) {
    return { type: "date", format: detectDateFormat(nonNullValues) };
  }
  
  // Number detection
  if (nonNullValues.every(v => !isNaN(Number(v)) && v !== '')) {
    return { type: "number", decimals: hasDecimals(nonNullValues) };
  }
  
  // Boolean detection (yes/no, true/false, 0/1)
  if (uniqueValues.size <= 2 && isBooleanLike(uniqueValues)) {
    return { type: "boolean", trueValue: detectTrueValue(uniqueValues) };
  }
  
  // Dropdown detection (limited unique values)
  if (uniqueValues.size > 0 && uniqueValues.size <= 15) {
    return { 
      type: "select", 
      options: Array.from(uniqueValues).sort(),
      multiSelect: false
    };
  }
  
  // Long text detection (avg length > 100 chars)
  const avgLength = nonNullValues.reduce((sum, v) => sum + String(v).length, 0) / nonNullValues.length;
  if (avgLength > 100) {
    return { type: "textarea" };
  }
  
  // Default to text
  return { type: "text" };
}
```

#### 4. Auto-Configure Fields

```typescript
async function configureFields(
  unmappedColumns: Column[], 
  context: ToolExecutionContext
): Promise<CustomField[]> {
  const fieldsCreated: CustomField[] = [];
  
  for (const column of unmappedColumns) {
    const fieldType = inferFieldType(column.name, column.values);
    
    // Call existing configure_custom_field tool
    const result = await context.callTool('configure_custom_field', {
      moduleId: context.moduleId,
      entityType: context.entityType,
      fieldKey: generateFieldKey(column.name),
      fieldLabel: column.name,
      fieldType: fieldType.type,
      options: fieldType.options || [],
      required: column.nullCount === 0,
      description: `Auto-generated from CSV column: ${column.name}`
    });
    
    fieldsCreated.push(result);
  }
  
  return fieldsCreated;
}
```

#### 5. Validate & Import

```typescript
async function importRecords(
  data: any[], 
  fieldMapping: Map<string, string>,
  context: ToolExecutionContext
): Promise<ImportResult> {
  const results = {
    total: data.length,
    success: 0,
    failed: 0,
    errors: []
  };
  
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    
    try {
      // Transform row using field mapping
      const entity = transformRow(row, fieldMapping);
      
      // Validate against schema
      const validated = insertEntitySchema.parse(entity);
      
      // Insert into entities table
      const [newEntity] = await db.insert(entities).values({
        tenantId: context.tenantId,
        environment: context.environment,
        moduleId: context.moduleId,
        entityType: context.entityType,
        name: entity.name,
        ...validated
      }).returning();
      
      // Insert custom field values
      await insertCustomFieldValues(newEntity.id, row, fieldMapping);
      
      results.success++;
    } catch (error) {
      results.failed++;
      results.errors.push({
        row: i + 1,
        data: row,
        error: error.message
      });
    }
  }
  
  return results;
}
```

### Output Schema

```typescript
{
  success: boolean,
  summary: {
    moduleId: string,
    entityType: string,
    columnsAnalyzed: number,
    fieldsMapped: number,        // Existing fields matched
    fieldsCreated: number,       // New custom fields created
    recordsImported: number,
    recordsFailed: number
  },
  fieldsCreated: Array<{
    key: string,
    label: string,
    type: "text" | "number" | "date" | "select" | "boolean" | "textarea",
    options?: string[],
    required: boolean
  }>,
  importResults: {
    total: number,
    success: number,
    failed: number
  },
  errors: Array<{
    row: number,
    field?: string,
    error: string,
    data: any
  }>
}
```

---

## 📊 Module-Specific Applications

### Lead Generation Module

**Use Case:** Catering company with Excel database of event leads

**Input File:** `leads.xlsx`
```
Client Name | Contact | Event Type | Date | Guests | Budget | Location | Notes
----------|---------|------------|------|--------|--------|----------|-------
Maria Santos | maria@example.com | Wedding | 2025-06-14 | 120 | 5400 | Lisboa | Vegan options
João Costa | +351912345678 | Corporate | 2025-03-01 | 80 | 3040 | Porto | Coffee break
```

**Auto-Configuration:**
- Maps: Client Name → name, Contact → email/phone
- Creates: Event Type (dropdown), Date (date), Guests (number), Budget (number), Location (text), Notes (textarea)
- Imports: 247 lead records

### CRM Clients Module

**Use Case:** B2B company with existing customer database

**Input File:** `clients.csv`
```
Company Name | Industry | Annual Revenue | Contract Start | Account Manager | Status
------------|----------|----------------|----------------|-----------------|--------
Tech Corp | Technology | 250000 | 2024-01-15 | João Silva | Active
Finance Ltd | Financial Services | 180000 | 2023-11-20 | Ana Costa | Active
```

**Auto-Configuration:**
- Maps: Company Name → name
- Creates: Industry (dropdown), Annual Revenue (number), Contract Start (date), Account Manager (text), Status (dropdown)
- Imports: 156 client records

### Projects Module

**Use Case:** Construction company with project portfolio

**Input File:** `projects.xlsx`
```
Project Name | Client | Start Date | Budget | Status | Project Manager | Location
------------|--------|-----------|--------|---------|-----------------|----------
Building A | Tech Corp | 2025-02-01 | 500000 | In Progress | João Silva | Lisboa
Office Renovation | Finance Ltd | 2025-03-15 | 180000 | Planning | Ana Costa | Porto
```

**Auto-Configuration:**
- Maps: Project Name → name, Client → client
- Creates: Start Date (date), Budget (number), Status (dropdown), Project Manager (text), Location (text)
- Imports: 89 project records

---

## 🏗️ Architecture Advantages

### 1. Single Universal Tool

- One codebase handles all entity types
- Reusable parsing, validation, and import logic
- Consistent error handling across modules
- Easier to maintain and test

### 2. Leverages Universal Entities System

- All data flows to central `entities` table
- Custom fields via `customFieldValues` linkage
- Module-agnostic storage architecture
- Future-proof for new modules

### 3. Intelligent Automation

- Smart column name mapping (multilingual support)
- Automatic type inference from data samples
- Dropdown auto-population from unique values
- Date format detection and normalization

### 4. Graceful Degradation

- Falls back to manual configuration if needed
- Preview mode (dry run) before committing
- Detailed error reporting for validation failures
- Option to disable auto-field creation

---

## 📈 Success Metrics

### User Experience Metrics

- **Time to first import:** Reduce from ~15min to <1min
- **Configuration errors:** Reduce field mismatch errors by 90%
- **User satisfaction:** Seamless "upload and go" experience
- **Adoption rate:** Increase % of tenants who import historical data from 30% to 80%

### Technical Metrics

- **Field creation accuracy:** >95% correct type inference
- **Import success rate:** >98% of valid records imported
- **Error clarity:** 100% of errors include actionable feedback
- **Performance:** Handle files up to 10,000 rows in <30 seconds

### Business Metrics

- **Onboarding completion:** Increase from 60% to 90%
- **Time to value:** Reduce from days to minutes
- **Support tickets:** Reduce configuration-related tickets by 70%
- **Feature usage:** Increase custom field usage by 50%

---

## 🎯 Implementation Roadmap

### Phase 1: Core Tool Development (Week 1)

- [ ] Create `analyze_configure_and_import_entities` tool
- [ ] Implement Excel/CSV parsing logic
- [ ] Build column analysis and type inference
- [ ] Add smart column name mapping
- [ ] Implement dropdown detection (unique values)
- [ ] Create validation and error handling

### Phase 2: Integration (Week 1-2)

- [ ] Integrate with existing `configure_custom_field` tool
- [ ] Connect to universal entities system
- [ ] Add custom field values insertion
- [ ] Implement batch import with transaction support
- [ ] Add rollback on error mechanism

### Phase 3: Testing (Week 2)

- [ ] Test with Lead Generation module
- [ ] Test with CRM Clients module
- [ ] Test with Projects module
- [ ] Edge case testing (empty files, invalid data, large files)
- [ ] Performance testing (10K+ rows)

### Phase 4: UX Enhancement (Week 2-3)

- [ ] Add dry-run preview mode
- [ ] Improve error messages and suggestions
- [ ] Add progress reporting for large imports
- [ ] Implement partial success handling
- [ ] Create user-facing documentation

### Phase 5: Documentation & Launch (Week 3)

- [ ] Update AssistBuild system prompt
- [ ] Add to tool embeddings database
- [ ] Create user guide with examples
- [ ] Internal team training
- [ ] Staged rollout (beta → general availability)

---

## 🔒 Security & Data Integrity

### Validation Rules

1. **File Size Limits:** Max 10MB per file
2. **Row Limits:** Max 10,000 rows per import
3. **Tenant Isolation:** Strict tenant ID enforcement
4. **Environment Separation:** Sandbox vs. Production data segregation
5. **Schema Validation:** All records validated against Zod schemas
6. **Transaction Safety:** Atomic commits with rollback on error

### Error Handling

- Invalid file format → Clear error message with supported formats
- Missing required columns → List missing columns with examples
- Data type mismatch → Specify expected vs. actual type
- Duplicate records → Skip or merge based on user preference
- Partial failures → Import successful records, report failures

### Audit Trail

- Log all field creations with timestamp and user
- Track import operations (records added, user, timestamp)
- Store original filename and column mapping
- Enable rollback of entire import operation if needed

---

## 💡 Future Enhancements

### V2 Features

1. **Template Library:** Pre-built templates for common use cases
2. **Column Remapping UI:** Manual override of auto-detected mappings
3. **Data Transformation:** Apply formulas/transformations during import
4. **Incremental Imports:** Update existing records instead of duplicating
5. **Multi-Sheet Support:** Import from multiple Excel sheets at once
6. **Scheduled Imports:** Periodic auto-import from cloud storage

### V3 Features

1. **AI-Powered Mapping:** Use GPT-5 to suggest optimal field mappings
2. **Smart Deduplication:** Detect and merge duplicate records automatically
3. **Cross-Module Linking:** Auto-link clients → projects → invoices
4. **Data Quality Scoring:** Rate and improve imported data quality
5. **Export Templates:** Generate Excel templates for data collection

---

## 🎓 Example Scenarios

### Scenario 1: New Tenant Onboarding

**Context:** Catering company joining AssistOS with 5 years of lead data in Excel

**Current Flow (15 minutes):**
1. Manual configuration in AssistBuild (10 min)
2. Switch to AssistME for import (3 min)
3. Fix field mismatches (2 min)

**New Flow (1 minute):**
1. Upload Excel to AssistBuild
2. Review auto-configuration preview
3. Confirm import → Done

**Impact:** 93% time reduction, zero errors

### Scenario 2: Module Expansion

**Context:** Existing tenant wants to add Projects module

**Current Flow:**
1. Research what fields to configure
2. Manually create 10+ custom fields
3. Test with sample data
4. Import historical projects separately

**New Flow:**
1. Upload projects.xlsx
2. AssistBuild auto-configures everything
3. 89 historical projects imported instantly

**Impact:** Faster module adoption, higher feature usage

### Scenario 3: Data Migration

**Context:** Migrating from competitor ERP to AssistOS

**Current Flow:**
1. Export data from old system
2. Manually map fields (error-prone)
3. Configure AssistOS manually
4. Import data with fingers crossed
5. Fix errors and retry

**New Flow:**
1. Export data from old system
2. Upload to AssistBuild
3. Review auto-mapping
4. One-click import with validation

**Impact:** Smoother migrations, fewer failed migrations

---

## 📚 Technical Dependencies

### Existing Tools to Leverage

1. `configure_custom_field` (AssistBuild)
2. `import_leads_from_file` (AssistME) - parsing logic reuse
3. Universal entities system (database schema)
4. File upload handling (Multer middleware)

### New Dependencies

1. `xlsx` - Excel/CSV parsing (already installed)
2. `date-fns` - Date format detection and normalization (already installed)
3. Enhanced validation schemas (extend existing Zod schemas)

### Database Schema (No Changes Required)

Uses existing tables:
- `entities` - Main entity storage
- `customFields` - Field definitions
- `customFieldValues` - Field value linkage
- `moduleConfig` - Module configuration

---

## ✅ Acceptance Criteria

### Core Functionality

- [x] Parse Excel (.xlsx, .xls) and CSV files
- [x] Detect column names and data types accurately (>95%)
- [x] Auto-create custom fields with correct types
- [x] Import records into entities table
- [x] Link custom field values correctly
- [x] Handle validation errors gracefully
- [x] Return detailed success/error report

### User Experience

- [x] Conversational flow in AssistBuild
- [x] Clear progress reporting during import
- [x] Actionable error messages
- [x] Preview mode (dry run) available
- [x] Works across all target modules
- [x] Complete in <30 seconds for 1000 rows

### Quality & Reliability

- [x] 100% tenant isolation
- [x] Transaction safety (rollback on error)
- [x] Handle edge cases (empty files, invalid data)
- [x] Performance tested up to 10K rows
- [x] Full audit trail
- [x] Comprehensive error logging

---

## 🚀 Conclusion

The **Universal CSV-Driven Configuration** feature transforms AssistBuild from a manual configuration tool into an intelligent onboarding assistant that learns from users' existing data structures.

### Key Benefits

✅ **15x faster onboarding** (15min → 1min)  
✅ **90% fewer configuration errors**  
✅ **Unified conversational experience**  
✅ **Instant historical data preservation**  
✅ **Works across all modules**  
✅ **Future-proof architecture**

### Next Steps

1. Review and approve specification
2. Begin Phase 1 implementation
3. Iterative testing with real user data
4. Staged rollout to production

---

**Document Version:** 1.0  
**Last Updated:** November 21, 2025  
**Author:** AssistOS Product Team  
**Status:** Ready for Implementation
