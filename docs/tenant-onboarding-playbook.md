# 📋 Tenant Onboarding Playbook - AssistOS Alpha Go-Live

**Version:** 1.0  
**Last Updated:** November 10, 2025  
**Owner:** Platform Team  
**Purpose:** Master reference for provisioning new tenants during canary launch (10 tenants in 7 days)

---

## 🎯 Executive Summary

AssistOS is a multi-tenant AI-first ERP system launching alpha with **10 tenants within 7 days**. This playbook provides step-by-step procedures, validation checklists, and troubleshooting guides to ensure smooth tenant provisioning.

**Key Stats:**
- **Target:** 10 tenants in 7 days
- **Provisioning Time:** ~90 minutes per tenant (15 min automated + 30 min validation + 45 min onboarding)
- **Default Environment:** Sandbox (production promotion after validation)
- **Tech Stack:** PostgreSQL + Drizzle ORM, Passport.js auth, multi-tenant isolation

---

## 1. 🔧 Tenant Provisioning Workflow

### Step 1: Create Tenant Record

Create a new tenant in the `tenants` table with proper configuration:

```typescript
// Database: tenants table
const [tenant] = await db.insert(tenants).values({
  name: "Acme Corp",
  slug: "acme-corp", // Must be unique, lowercase, alphanumeric + hyphens
  industry: "Technology", // Optional: Technology, Manufacturing, Retail, etc.
  tier: "starter", // 'default' | 'premium' | 'enterprise'
  status: "active", // 'active' | 'trial' | 'suspended'
  enableAdvancedTools: false, // Set true for premium/enterprise
  country: "PT", // ISO country code
  currency: "EUR", // ISO currency code
  timezone: "Europe/Lisbon",
  fiscalYearStart: "01-01", // MM-DD format
  accountingStandard: "SNC", // or "IFRS", "GAAP"
}).returning();
```

**Critical Fields:**
- **`slug`**: Must be unique, generated via `generateUniqueSlug(baseName)` utility
- **`tier`**: Determines feature access and resource quotas
- **`status`**: Must be `active` for tenant to function
- **`country/currency/timezone`**: Localization settings (default: Portugal)

**Validation:**
```sql
-- Verify tenant created
SELECT id, name, slug, tier, status FROM tenants WHERE slug = 'acme-corp';
```

---

### Step 2: Create Admin User

Create the tenant admin user and establish the user-tenant relationship:

```typescript
// Step 2a: Create user account
const [user] = await db.insert(users).values({
  email: "admin@acme.com",
  firstName: "John",
  lastName: "Doe",
  password: await bcrypt.hash("temporaryPassword123", 10), // Hash password
  // OR for Google OAuth: googleId: "google-oauth-id", password: null
  isActive: true,
  isPlatformAdmin: false, // Only first user gets true
}).returning();

// Step 2b: Link user to tenant with 'owner' role
await db.insert(userTenants).values({
  userId: user.id,
  tenantId: tenant.id,
  role: "owner", // Full permissions within tenant
  scopes: getDefaultScopes("owner"), // Imports from permissions.ts
  activeEnvironment: "sandbox", // New tenants start in sandbox
});
```

**User Roles:**
- **`owner`**: Full control (tenant admin)
- **`admin`**: Management permissions
- **`config`**: Configuration Studio access
- **`user`**: Standard user

**Validation:**
```sql
-- Verify user-tenant relationship
SELECT ut.role, u.email, t.name 
FROM user_tenants ut
JOIN users u ON ut.user_id = u.id
JOIN tenants t ON ut.tenant_id = t.id
WHERE t.slug = 'acme-corp';
```

---

### Step 3: Initialize Tenant Environment

Set up the tenant's default environment (sandbox):

```typescript
// Environment isolation is handled automatically via userTenants.activeEnvironment
// No separate tenant_environments table - environment is per-user setting

// Verify environment setup
const [userTenant] = await db
  .select()
  .from(userTenants)
  .where(
    and(
      eq(userTenants.userId, user.id),
      eq(userTenants.tenantId, tenant.id)
    )
  );

console.log(`Environment: ${userTenant.activeEnvironment}`); // Should be 'sandbox'
```

**Environment Isolation:**
- **Sandbox**: Safe testing environment (default for new tenants)
- **Production**: Live customer-facing environment (requires promotion)
- Isolation enforced via `environment` column in all tenant-scoped tables
- Middleware (`hardTenantGuard`, `softTenantContext`) injects `req.environment`

**Validation:**
```sql
-- Verify environment setting
SELECT active_environment FROM user_tenants 
WHERE tenant_id = '<tenant-id>' AND user_id = '<user-id>';
-- Expected: 'sandbox'
```

---

### Step 4: Configure Modules & Features

Install modules based on tenant tier:

```typescript
// Module installation based on tier
const modulesByTier = {
  default: ['chat', 'documents'],
  starter: ['chat', 'documents', 'compras', 'financeiro'],
  premium: ['chat', 'documents', 'compras', 'financeiro', 'comercial', 'logistica'],
  enterprise: ['chat', 'documents', 'compras', 'financeiro', 'comercial', 'logistica', 'projetos'],
};

const modulesToInstall = modulesByTier[tenant.tier];

for (const moduleId of modulesToInstall) {
  await db.insert(tenantModules).values({
    tenantId: tenant.id,
    moduleId: moduleId,
    isActive: true,
    installedBy: user.id,
    environment: 'sandbox', // Install in sandbox first
    config: {}, // Module-specific configuration
  });
}

// For enterprise tier, enable advanced tools
if (tenant.tier === 'enterprise') {
  await db.update(tenants)
    .set({ enableAdvancedTools: true })
    .where(eq(tenants.id, tenant.id));
}
```

**Feature Access Matrix:**

| Feature | Default | Starter | Premium | Enterprise | Description |
|---------|---------|---------|---------|------------|-------------|
| AssistME Chat | ✅ | ✅ | ✅ | ✅ | AI chat assistant |
| Document Management | ✅ | ✅ | ✅ | ✅ | Document upload & storage |
| Compras (Procurement) | ❌ | ✅ | ✅ | ✅ | Supplier management, RFQs |
| Financeiro (Finance) | ❌ | ✅ | ✅ | ✅ | Invoicing, payments, reconciliation |
| Gmail Integration | ❌ | ✅ | ✅ | ✅ | Gmail OAuth sync |
| Comercial (Sales/CRM) | ❌ | ❌ | ✅ | ✅ | Leads, opportunities, quotes |
| Logística (Logistics) | ❌ | ❌ | ✅ | ✅ | Warehouses, inventory |
| Projetos (Projects) | ❌ | ❌ | ✅ | ✅ | Project management |
| AssistBuild | ❌ | ❌ | ❌ | ✅ | Conversational feature builder |
| Pattern Recognition | ❌ | ❌ | ✅ | ✅ | Cross-tenant pattern learning |
| Sandbox Promotion | ❌ | ❌ | ✅ | ✅ | Environment switching |
| WhatsApp Integration | ❌ | ❌ | ❌ | ✅ | WhatsApp Business API |
| SAP Connector | ❌ | ❌ | ❌ | ✅ | SAP Business One integration |
| Custom Modules | ❌ | ❌ | ❌ | ✅ | Build custom modules via Studio |

**Validation:**
```sql
-- Verify installed modules
SELECT module_id, is_active, environment 
FROM tenant_modules 
WHERE tenant_id = '<tenant-id>' AND environment = 'sandbox';
```

---

### Step 5: Seed Initial Data

Initialize tenant with default configuration and data:

```typescript
// Step 5a: Create company info
await db.insert(companyInfo).values({
  tenantId: tenant.id,
  name: tenant.name,
  legalName: tenant.name, // Update with legal entity name
  nif: null, // Tax ID (set during onboarding)
  country: tenant.country,
  currency: tenant.currency,
  environment: 'sandbox',
});

// Step 5b: Create default storage provider
await db.insert(tenantStorageProviders).values({
  tenantId: tenant.id,
  providerType: 'local', // 'local' | 'shared_gcs' | 's3' | 'azure'
  providerName: 'Local Storage (Development)',
  isDefault: true,
  isActive: true,
  priority: 0,
  config: { rootPath: './storage' },
  createdBy: user.id,
});

// Step 5c: Initialize sequence counters (for auto-generated codes)
const sequences = [
  { entityType: 'supplier', prefix: 'SUP' },
  { entityType: 'client', prefix: 'CLI' },
  { entityType: 'invoice', prefix: 'INV' },
  { entityType: 'quote', prefix: 'QUO' },
  { entityType: 'order', prefix: 'ORD' },
];

for (const seq of sequences) {
  await db.insert(sequenceCounters).values({
    tenantId: tenant.id,
    entityType: seq.entityType,
    prefix: seq.prefix,
    currentValue: 0,
    paddingLength: 4, // Generates: SUP-0001, SUP-0002, etc.
    environment: 'sandbox',
  });
}

// Step 5d: Create default notification preferences (optional)
await db.insert(notificationPreferences).values({
  tenantId: tenant.id,
  userId: user.id,
  enableEmail: true,
  enableInApp: true,
  enablePush: false,
  enableWhatsApp: false, // Only for enterprise
});
```

**Validation:**
```sql
-- Verify seed data
SELECT * FROM company_info WHERE tenant_id = '<tenant-id>';
SELECT * FROM tenant_storage_providers WHERE tenant_id = '<tenant-id>';
SELECT * FROM sequence_counters WHERE tenant_id = '<tenant-id>';
```

---

### Step 6: Validation & Health Check

Run comprehensive validation before handing over to customer:

```bash
# Run validation script
npm run validate-tenant --tenant-slug=acme-corp
```

**Validation Checklist:**

- ✅ **Tenant Record**: Tenant exists with correct tier, status, and slug
- ✅ **Admin User**: User can login with credentials (test login flow)
- ✅ **Tenant Isolation**: User cannot access other tenants' data (run cross-tenant test)
- ✅ **Module Access**: Installed modules visible in sidebar
- ✅ **Feature Gates**: Advanced features blocked/allowed per tier
- ✅ **Environment Active**: User starts in 'sandbox' environment
- ✅ **Seed Data**: Company info, storage provider, sequences initialized
- ✅ **Welcome Email**: Admin received welcome email with login link (if email enabled)

**Manual Validation Steps:**

```typescript
// Test 1: Login Flow
// Visit: https://app.assistos.com/login
// Enter: admin@acme.com / temporaryPassword123
// Expected: Successful login, redirect to dashboard

// Test 2: Tenant Isolation
// Try accessing: /api/modules/sidebar with different X-Tenant-Slug header
// Expected: 403 Forbidden (user not member of other tenant)

// Test 3: Module Access
// Navigate to: /dashboard
// Expected: Sidebar shows only installed modules (e.g., Chat, Documents, Compras)

// Test 4: Environment
// Check: Header shows "Sandbox" environment badge
// Expected: User is in sandbox environment
```

**Automated Validation Query:**
```sql
-- Comprehensive tenant validation
SELECT 
  t.slug,
  t.tier,
  t.status,
  u.email AS admin_email,
  ut.role AS admin_role,
  ut.active_environment,
  COUNT(DISTINCT tm.module_id) AS installed_modules,
  ci.name AS company_name
FROM tenants t
LEFT JOIN user_tenants ut ON t.id = ut.tenant_id
LEFT JOIN users u ON ut.user_id = u.id
LEFT JOIN tenant_modules tm ON t.id = tm.tenant_id AND tm.is_active = true
LEFT JOIN company_info ci ON t.id = ci.tenant_id
WHERE t.slug = 'acme-corp' AND ut.role = 'owner'
GROUP BY t.id, t.slug, t.tier, t.status, u.email, ut.role, ut.active_environment, ci.name;
```

---

## 2. 📦 Seed Data Templates

### Template 1: Startup SaaS Company (Tier: Starter)

**Profile:**
- Small tech startup (5-20 employees)
- Focus: B2B SaaS product
- Needs: Basic invoicing, supplier management, Gmail integration

**Configuration:**
```yaml
tenant_name: "Acme Corp"
tenant_slug: "acme-corp"
tier: "starter"
industry: "Technology"
country: "PT"
currency: "EUR"
timezone: "Europe/Lisbon"

admin:
  email: "admin@acme.com"
  first_name: "John"
  last_name: "Doe"
  role: "owner"

modules:
  - chat # AssistME AI assistant
  - documents # Document management
  - compras # Procurement module
  - financeiro # Finance module

features:
  enableAdvancedTools: false
  gmail_sync: true
  invoice_ocr: true
  pattern_recognition: false

seed_data:
  conversation_tags:
    - "customer-support"
    - "sales"
    - "engineering"
    - "billing"
  
  sequence_prefixes:
    supplier: "SUP"
    client: "CLI"
    invoice: "INV"
    quote: "QUO"
  
  notification_preferences:
    email: true
    in_app: true
    push: false
    whatsapp: false

storage:
  provider: "local" # Use shared_gcs for production
  path: "./storage/acme-corp"
```

**Provisioning Script:**
```bash
npm run provision-tenant -- \
  --name="Acme Corp" \
  --slug="acme-corp" \
  --tier="starter" \
  --admin-email="admin@acme.com" \
  --admin-password="TempPass123!" \
  --template="startup-saas"
```

---

### Template 2: Enterprise Manufacturing (Tier: Enterprise)

**Profile:**
- Large manufacturing company (500+ employees)
- Focus: Industrial production, complex supply chain
- Needs: Full ERP suite, SAP integration, multi-department workflows

**Configuration:**
```yaml
tenant_name: "Global Manufacturing Inc"
tenant_slug: "global-mfg"
tier: "enterprise"
industry: "Manufacturing"
country: "PT"
currency: "EUR"
timezone: "Europe/Lisbon"

admin:
  email: "it-admin@globalmfg.com"
  first_name: "Maria"
  last_name: "Silva"
  role: "owner"

modules:
  - chat # AssistME AI assistant
  - documents # Document management
  - compras # Procurement module
  - financeiro # Finance module
  - comercial # Sales/CRM module
  - logistica # Logistics module
  - projetos # Project management

features:
  enableAdvancedTools: true
  gmail_sync: true
  whatsapp_sync: true
  invoice_ocr: true
  pattern_recognition: true
  sandbox_promotion: true
  assistbuild: true
  sap_connector: true

integrations:
  - name: "SAP Business One"
    type: "erp"
    enabled: true
  - name: "Primavera"
    type: "accounting"
    enabled: false

seed_data:
  conversation_tags:
    - "procurement"
    - "production"
    - "quality-control"
    - "hr"
    - "finance"
    - "operations"
    - "maintenance"
  
  sequence_prefixes:
    supplier: "FOR"
    client: "CLI"
    invoice: "FAT"
    quote: "ORC"
    order: "ENC"
    project: "PRJ"
  
  notification_preferences:
    email: true
    in_app: true
    push: true
    whatsapp: true

  departments:
    - name: "Procurement"
      manager_email: "procurement@globalmfg.com"
    - name: "Finance"
      manager_email: "finance@globalmfg.com"
    - name: "Operations"
      manager_email: "ops@globalmfg.com"

storage:
  provider: "shared_gcs" # Google Cloud Storage
  bucket: "global-mfg-documents"

resource_quotas:
  max_users: 1000
  max_workflows: 500
  max_storage_gb: 1000
  code_generation_per_day: 100
```

**Provisioning Script:**
```bash
npm run provision-tenant -- \
  --name="Global Manufacturing Inc" \
  --slug="global-mfg" \
  --tier="enterprise" \
  --admin-email="it-admin@globalmfg.com" \
  --admin-password="SecureP@ss2025" \
  --template="enterprise-manufacturing" \
  --enable-sap
```

---

### Template 3: Solo Entrepreneur (Tier: Default/Free)

**Profile:**
- Freelancer or solo consultant
- Focus: Personal productivity, client management
- Needs: Basic chat, document storage, simple invoicing

**Configuration:**
```yaml
tenant_name: "Jane Doe Consulting"
tenant_slug: "jane-doe"
tier: "default"
industry: "Consulting"
country: "PT"
currency: "EUR"
timezone: "Europe/Lisbon"

admin:
  email: "jane@janedoe.com"
  first_name: "Jane"
  last_name: "Doe"
  role: "owner"

modules:
  - chat # AssistME AI assistant
  - documents # Document management

features:
  enableAdvancedTools: false
  gmail_sync: false
  invoice_ocr: false
  pattern_recognition: false

seed_data:
  conversation_tags:
    - "clients"
    - "invoices"
    - "projects"
    - "todos"
  
  sequence_prefixes:
    client: "CLI"
    invoice: "INV"
  
  notification_preferences:
    email: true
    in_app: true
    push: false
    whatsapp: false

storage:
  provider: "local"
  path: "./storage/jane-doe"

resource_quotas:
  max_users: 1
  max_storage_gb: 5
```

**Provisioning Script:**
```bash
npm run provision-tenant -- \
  --name="Jane Doe Consulting" \
  --slug="jane-doe" \
  --tier="default" \
  --admin-email="jane@janedoe.com" \
  --admin-password="MyPass123!" \
  --template="solo-entrepreneur"
```

---

## 3. 🚩 Module & Feature Configuration

### Current System Architecture

AssistOS uses a **modular architecture** where features are controlled via:

1. **Tenant Modules** (`tenant_modules` table): Installed modules per tenant
2. **Module Features** (`module_features` table): Granular feature toggles within modules
3. **Tier-Based Access** (`tenants.tier`): Global tier determines available modules
4. **Advanced Tools Flag** (`tenants.enableAdvancedTools`): Enterprise features like AssistBuild

### Module Registry

Modules are registered in the `ModuleRegistryService` and installed per-tenant:

```typescript
// Available modules
const MODULES = {
  chat: {
    id: 'chat',
    name: 'AssistME Chat',
    description: 'AI-powered chat assistant',
    icon: 'MessageSquare',
    category: 'core',
    minTier: 'default',
  },
  documents: {
    id: 'documents',
    name: 'Document Management',
    description: 'Upload, organize, and search documents',
    icon: 'FileText',
    category: 'core',
    minTier: 'default',
  },
  compras: {
    id: 'compras',
    name: 'Compras (Procurement)',
    description: 'Supplier management, RFQs, purchase orders',
    icon: 'ShoppingCart',
    category: 'operations',
    minTier: 'starter',
  },
  financeiro: {
    id: 'financeiro',
    name: 'Financeiro (Finance)',
    description: 'Invoicing, payments, bank reconciliation',
    icon: 'DollarSign',
    category: 'finance',
    minTier: 'starter',
  },
  comercial: {
    id: 'comercial',
    name: 'Comercial (Sales/CRM)',
    description: 'Leads, opportunities, quotes, clients',
    icon: 'Users',
    category: 'sales',
    minTier: 'premium',
  },
  logistica: {
    id: 'logistica',
    name: 'Logística (Logistics)',
    description: 'Warehouses, inventory, stock management',
    icon: 'Package',
    category: 'operations',
    minTier: 'premium',
  },
  projetos: {
    id: 'projetos',
    name: 'Projetos (Projects)',
    description: 'Project management, tasks, budgets',
    icon: 'Briefcase',
    category: 'operations',
    minTier: 'premium',
  },
};
```

### Feature Gates

Features within modules can be toggled individually:

```typescript
// Example: Enable specific features within Financeiro module
await db.insert(moduleFeatures).values({
  tenantModuleId: '<tenant-module-id>',
  featureKey: 'bank_reconciliation',
  isEnabled: true,
  environment: 'sandbox',
  config: {
    auto_reconciliation: false, // Disable AI auto-reconciliation
    manual_only: true,
  },
});
```

**Common Feature Keys:**
- **compras**: `supplier_management`, `rfq_workflow`, `purchase_orders`, `invoice_ocr`
- **financeiro**: `invoicing`, `payments`, `bank_reconciliation`, `cash_flow_forecast`
- **comercial**: `leads`, `opportunities`, `quotes`, `client_portal`
- **logistica**: `warehouses`, `inventory`, `stock_alerts`, `equipment_tracking`

### Tier-Based Feature Matrix

| Tier | Modules Available | Advanced Tools | Resource Quotas |
|------|-------------------|----------------|-----------------|
| **Default (Free)** | chat, documents | ❌ | 1 user, 5GB storage |
| **Starter** | + compras, financeiro | ❌ | 5 users, 50GB storage |
| **Premium** | + comercial, logistica, projetos | ✅ (Pattern Recognition, Sandbox Promotion) | 50 users, 500GB storage |
| **Enterprise** | All modules + custom | ✅ (AssistBuild, Custom Modules, SAP/Primavera connectors) | Unlimited |

### Enabling Advanced Features

For premium/enterprise tiers:

```typescript
// Enable advanced tools (AssistBuild, Pattern Recognition, etc.)
await db.update(tenants)
  .set({ enableAdvancedTools: true })
  .where(eq(tenants.id, tenant.id));

// Set custom resource quotas (enterprise only)
await db.insert(tenantResourceQuotas).values([
  {
    tenantId: tenant.id,
    resourceType: 'code_generation',
    metric: 'max_per_day',
    limit: 100,
    window: 'day',
    reason: 'Enterprise contract - unlimited AssistBuild usage',
  },
  {
    tenantId: tenant.id,
    resourceType: 'workflows',
    metric: 'max_count',
    limit: 500,
    reason: 'Enterprise contract - high workflow limit',
  },
]);
```

---

## 4. 🔄 Environment Management

### Environment Taxonomy

AssistOS uses a **per-user environment model**:

- **Sandbox**: Safe testing environment (default for new tenants)
- **Production**: Live customer-facing environment (requires promotion approval)

Environments are isolated via:
1. `environment` column on all tenant-scoped tables
2. `userTenants.activeEnvironment` sets user's active environment
3. Middleware (`hardTenantGuard`) injects `req.environment` based on user preference

### Environment Lifecycle

```
┌─────────────┐
│ New Tenant  │
│  Created    │
└─────┬───────┘
      │
      ▼
┌─────────────┐
│  Sandbox    │◄─── Default environment for configuration & testing
│   Active    │     - Safe to experiment
└─────┬───────┘     - No real customer data
      │             - Modules installed here first
      │
      │ (Validation Complete)
      ▼
┌─────────────┐
│ Production  │◄─── User switches to production after validation
│   Active    │     - Live customer-facing data
└─────────────┘     - Environment switching via UI toggle
                    - Both environments coexist (user can switch back)
```

### Environment Switching

Users switch environments via UI toggle (requires `owner` or `config` role):

```typescript
// API: PATCH /api/tenants/:tenantId/environment
// Body: { environment: 'production' }

await db.update(userTenants)
  .set({ activeEnvironment: 'production' })
  .where(
    and(
      eq(userTenants.userId, userId),
      eq(userTenants.tenantId, tenantId)
    )
  );

// Audit log environment change
await db.insert(auditLog).values({
  tenantId: tenantId,
  actorUserId: userId,
  action: 'environment_change',
  metadata: {
    fromEnvironment: 'sandbox',
    toEnvironment: 'production',
  },
});
```

### Sandbox → Production Promotion

**When to Promote:**
1. ✅ Tenant admin validated all modules in sandbox
2. ✅ Core workflows tested successfully
3. ✅ Integrations (Gmail, SAP, etc.) configured and tested
4. ✅ Team members trained and onboarded
5. ✅ Platform team completed security audit

**Promotion Process:**

```typescript
// Option 1: User self-service (premium/enterprise tiers)
// User clicks "Switch to Production" in UI → API updates activeEnvironment

// Option 2: Platform admin approval (starter tier)
// 1. User requests production access via support ticket
// 2. Platform admin reviews sandbox usage
// 3. Admin approves and manually updates environment

// No data migration needed - both environments coexist independently
// User can switch back to sandbox anytime for testing new features
```

### Environment Validation Script

```bash
# Verify environment setup for a tenant
npm run validate-environment --tenant-slug=acme-corp --environment=sandbox

# Output:
# ✅ Modules installed in sandbox: 4 (chat, documents, compras, financeiro)
# ✅ Sequence counters initialized in sandbox
# ✅ User activeEnvironment: sandbox
# ✅ Environment isolation working (cross-environment query test passed)
```

---

## 5. 🛠️ Provisioning Scripts

### Manual Provisioning Script (TypeScript)

Create `scripts/provision-tenant.ts`:

```typescript
import { db } from '../apps/api/db';
import { 
  tenants, 
  users, 
  userTenants, 
  tenantModules, 
  companyInfo,
  sequenceCounters,
  tenantStorageProviders 
} from '../shared/schema';
import { getDefaultScopes } from '../apps/api/permissions';
import { generateUniqueSlug } from '../apps/api/utils/slug';
import bcrypt from 'bcrypt';

interface ProvisionConfig {
  tenantName: string;
  tenantSlug?: string; // Optional: auto-generated if not provided
  tier: 'default' | 'starter' | 'premium' | 'enterprise';
  adminEmail: string;
  adminFirstName: string;
  adminLastName: string;
  adminPassword: string;
  industry?: string;
  country?: string;
  currency?: string;
  timezone?: string;
}

async function provisionTenant(config: ProvisionConfig) {
  console.log(`\n🚀 Provisioning tenant: ${config.tenantName}\n`);

  // Step 1: Create tenant
  console.log('📋 Step 1: Creating tenant record...');
  const slug = config.tenantSlug || await generateUniqueSlug(
    config.tenantName.toLowerCase().replace(/[^a-z0-9]/g, '-')
  );

  const [tenant] = await db.insert(tenants).values({
    name: config.tenantName,
    slug: slug,
    tier: config.tier,
    status: 'active',
    industry: config.industry || null,
    country: config.country || 'PT',
    currency: config.currency || 'EUR',
    timezone: config.timezone || 'Europe/Lisbon',
    enableAdvancedTools: config.tier === 'enterprise' || config.tier === 'premium',
  }).returning();

  console.log(`   ✅ Tenant created: ${tenant.id} (${tenant.slug})`);

  // Step 2: Create admin user
  console.log('👤 Step 2: Creating admin user...');
  const hashedPassword = await bcrypt.hash(config.adminPassword, 10);

  const [user] = await db.insert(users).values({
    email: config.adminEmail,
    firstName: config.adminFirstName,
    lastName: config.adminLastName,
    password: hashedPassword,
    isActive: true,
    isPlatformAdmin: false,
  }).returning();

  console.log(`   ✅ User created: ${user.id} (${user.email})`);

  // Step 3: Link user to tenant as owner
  console.log('🔗 Step 3: Linking user to tenant...');
  await db.insert(userTenants).values({
    userId: user.id,
    tenantId: tenant.id,
    role: 'owner',
    scopes: getDefaultScopes('owner'),
    activeEnvironment: 'sandbox',
  });

  console.log(`   ✅ User linked as owner (environment: sandbox)`);

  // Step 4: Install modules based on tier
  console.log('📦 Step 4: Installing modules...');
  const modulesByTier = {
    default: ['chat', 'documents'],
    starter: ['chat', 'documents', 'compras', 'financeiro'],
    premium: ['chat', 'documents', 'compras', 'financeiro', 'comercial', 'logistica'],
    enterprise: ['chat', 'documents', 'compras', 'financeiro', 'comercial', 'logistica', 'projetos'],
  };

  const modulesToInstall = modulesByTier[config.tier];
  for (const moduleId of modulesToInstall) {
    await db.insert(tenantModules).values({
      tenantId: tenant.id,
      moduleId: moduleId,
      isActive: true,
      installedBy: user.id,
      environment: 'sandbox',
      config: {},
    });
    console.log(`   ✅ Module installed: ${moduleId}`);
  }

  // Step 5: Seed initial data
  console.log('🌱 Step 5: Seeding initial data...');

  // Company info
  await db.insert(companyInfo).values({
    tenantId: tenant.id,
    name: tenant.name,
    country: tenant.country,
    environment: 'sandbox',
  });
  console.log(`   ✅ Company info created`);

  // Storage provider
  await db.insert(tenantStorageProviders).values({
    tenantId: tenant.id,
    providerType: 'local',
    providerName: 'Local Storage (Development)',
    isDefault: true,
    isActive: true,
    priority: 0,
    config: { rootPath: './storage' },
    createdBy: user.id,
  });
  console.log(`   ✅ Storage provider configured (local)`);

  // Sequence counters
  const sequences = [
    { entityType: 'supplier', prefix: 'SUP' },
    { entityType: 'client', prefix: 'CLI' },
    { entityType: 'invoice', prefix: 'INV' },
    { entityType: 'quote', prefix: 'QUO' },
    { entityType: 'order', prefix: 'ORD' },
  ];

  for (const seq of sequences) {
    await db.insert(sequenceCounters).values({
      tenantId: tenant.id,
      entityType: seq.entityType,
      prefix: seq.prefix,
      currentValue: 0,
      paddingLength: 4,
      environment: 'sandbox',
    });
  }
  console.log(`   ✅ Sequence counters initialized (${sequences.length} types)`);

  // Step 6: Summary
  console.log('\n✅ PROVISIONING COMPLETE\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Tenant: ${tenant.name} (${tenant.slug})`);
  console.log(`Tier: ${tenant.tier}`);
  console.log(`Admin: ${user.email}`);
  console.log(`Modules: ${modulesToInstall.join(', ')}`);
  console.log(`Environment: sandbox`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('🔐 Admin Login Credentials:');
  console.log(`   Email: ${user.email}`);
  console.log(`   Password: ${config.adminPassword}`);
  console.log(`   Login URL: https://app.assistos.com/login`);
  console.log('\n⚠️  Next Steps:');
  console.log('   1. Send welcome email to admin');
  console.log('   2. Schedule onboarding call');
  console.log('   3. Run validation: npm run validate-tenant --tenant-slug=' + tenant.slug);
  console.log('\n');

  return { tenant, user };
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const config: ProvisionConfig = {
    tenantName: args[0] || 'Test Company',
    tier: (args[1] as any) || 'starter',
    adminEmail: args[2] || 'admin@test.com',
    adminFirstName: args[3] || 'Admin',
    adminLastName: args[4] || 'User',
    adminPassword: args[5] || 'TempPass123!',
  };

  await provisionTenant(config);
  process.exit(0);
}

if (require.main === module) {
  main().catch((error) => {
    console.error('❌ Provisioning failed:', error);
    process.exit(1);
  });
}

export { provisionTenant };
```

**Usage:**
```bash
# Run provisioning script
tsx scripts/provision-tenant.ts \
  "Acme Corp" \
  "starter" \
  "admin@acme.com" \
  "John" \
  "Doe" \
  "SecurePass123!"

# Or use npm script
npm run provision-tenant -- --name="Acme Corp" --tier="starter" --email="admin@acme.com"
```

---

### Validation Script

Create `scripts/validate-tenant.ts`:

```typescript
import { db } from '../apps/api/db';
import { tenants, users, userTenants, tenantModules, companyInfo, sequenceCounters } from '../shared/schema';
import { eq, and } from 'drizzle-orm';

async function validateTenant(tenantSlug: string) {
  console.log(`\n🔍 Validating tenant: ${tenantSlug}\n`);

  let passed = 0;
  let failed = 0;

  // Test 1: Tenant exists
  const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, tenantSlug)).limit(1);
  if (tenant && tenant.status === 'active') {
    console.log('✅ Tenant record: EXISTS (status: active)');
    passed++;
  } else {
    console.log('❌ Tenant record: NOT FOUND or inactive');
    failed++;
    return;
  }

  // Test 2: Admin user exists
  const [userTenant] = await db.select({
    userId: userTenants.userId,
    role: userTenants.role,
    email: users.email,
  })
    .from(userTenants)
    .innerJoin(users, eq(userTenants.userId, users.id))
    .where(and(
      eq(userTenants.tenantId, tenant.id),
      eq(userTenants.role, 'owner')
    ))
    .limit(1);

  if (userTenant) {
    console.log(`✅ Admin user: ${userTenant.email} (role: owner)`);
    passed++;
  } else {
    console.log('❌ Admin user: NOT FOUND');
    failed++;
  }

  // Test 3: Modules installed
  const modules = await db.select().from(tenantModules)
    .where(and(
      eq(tenantModules.tenantId, tenant.id),
      eq(tenantModules.environment, 'sandbox'),
      eq(tenantModules.isActive, true)
    ));

  if (modules.length > 0) {
    console.log(`✅ Modules installed: ${modules.length} (${modules.map(m => m.moduleId).join(', ')})`);
    passed++;
  } else {
    console.log('❌ Modules installed: NONE');
    failed++;
  }

  // Test 4: Company info
  const [company] = await db.select().from(companyInfo)
    .where(and(
      eq(companyInfo.tenantId, tenant.id),
      eq(companyInfo.environment, 'sandbox')
    ))
    .limit(1);

  if (company) {
    console.log(`✅ Company info: ${company.name}`);
    passed++;
  } else {
    console.log('❌ Company info: NOT FOUND');
    failed++;
  }

  // Test 5: Sequence counters
  const sequences = await db.select().from(sequenceCounters)
    .where(and(
      eq(sequenceCounters.tenantId, tenant.id),
      eq(sequenceCounters.environment, 'sandbox')
    ));

  if (sequences.length > 0) {
    console.log(`✅ Sequence counters: ${sequences.length} initialized`);
    passed++;
  } else {
    console.log('⚠️  Sequence counters: NONE (optional)');
  }

  // Summary
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`VALIDATION SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  return failed === 0;
}

// CLI
async function main() {
  const tenantSlug = process.argv[2];
  if (!tenantSlug) {
    console.error('Usage: tsx scripts/validate-tenant.ts <tenant-slug>');
    process.exit(1);
  }

  const success = await validateTenant(tenantSlug);
  process.exit(success ? 0 : 1);
}

if (require.main === module) {
  main();
}

export { validateTenant };
```

**Usage:**
```bash
tsx scripts/validate-tenant.ts acme-corp
```

---

## 6. ✅ Validation Checklist

Use this checklist after provisioning each tenant:

### Database Validation

- [ ] **Tenant record created**
  ```sql
  SELECT id, name, slug, tier, status FROM tenants WHERE slug = '<tenant-slug>';
  -- Expected: 1 row, status='active'
  ```

- [ ] **Admin user created**
  ```sql
  SELECT u.email, ut.role FROM users u
  JOIN user_tenants ut ON u.id = ut.user_id
  JOIN tenants t ON ut.tenant_id = t.id
  WHERE t.slug = '<tenant-slug>' AND ut.role = 'owner';
  -- Expected: 1 row with admin email
  ```

- [ ] **User-tenant relationship established**
  ```sql
  SELECT role, active_environment FROM user_tenants
  WHERE tenant_id = '<tenant-id>' AND user_id = '<user-id>';
  -- Expected: role='owner', active_environment='sandbox'
  ```

- [ ] **Modules installed**
  ```sql
  SELECT module_id, is_active, environment FROM tenant_modules
  WHERE tenant_id = '<tenant-id>' AND environment = 'sandbox';
  -- Expected: Modules matching tier (2-7 rows)
  ```

- [ ] **Company info initialized**
  ```sql
  SELECT name, country, currency FROM company_info
  WHERE tenant_id = '<tenant-id>' AND environment = 'sandbox';
  -- Expected: 1 row
  ```

- [ ] **Storage provider configured**
  ```sql
  SELECT provider_type, is_default FROM tenant_storage_providers
  WHERE tenant_id = '<tenant-id>';
  -- Expected: 1 row, provider_type='local', is_default=true
  ```

- [ ] **Sequence counters initialized**
  ```sql
  SELECT entity_type, prefix FROM sequence_counters
  WHERE tenant_id = '<tenant-id>' AND environment = 'sandbox';
  -- Expected: 5+ rows (SUP, CLI, INV, QUO, ORD)
  ```

### Functional Validation

- [ ] **Login flow works**
  - Navigate to: `https://app.assistos.com/login`
  - Enter admin credentials
  - Expected: Successful login, redirect to dashboard

- [ ] **Tenant isolation verified**
  - Try accessing another tenant's data via API
  - Expected: 403 Forbidden (hardTenantGuard blocks cross-tenant access)

- [ ] **Modules visible in sidebar**
  - Check sidebar after login
  - Expected: Only installed modules visible (based on tier)

- [ ] **Environment badge shows "Sandbox"**
  - Check header/nav bar
  - Expected: Environment indicator shows "Sandbox"

- [ ] **Document upload works**
  - Upload a test file via UI
  - Expected: File saved to storage provider (check `./storage/<tenant-id>/`)

- [ ] **AI chat functional (if enabled)**
  - Send test message in AssistME chat
  - Expected: AI responds successfully

- [ ] **Feature gates respected**
  - Try accessing premium feature (e.g., AssistBuild) on starter tier
  - Expected: Feature blocked or hidden

### Post-Provisioning Tasks

- [ ] **Welcome email sent** (manual or automated)
- [ ] **Onboarding call scheduled** (45-60 min)
- [ ] **Customer success ticket created** (track onboarding progress)
- [ ] **Monitoring alert configured** (track tenant activity in first 7 days)

---

## 7. 🚨 Troubleshooting

### Issue 1: Admin cannot login

**Symptoms:**
- User enters correct email/password
- Login returns "Invalid credentials" error

**Root Causes:**
- Password hash mismatch
- User record not created
- User-tenant relationship missing

**Diagnosis:**
```sql
-- Check if user exists
SELECT id, email FROM users WHERE email = 'admin@acme.com';

-- Check if user is linked to tenant
SELECT ut.role FROM user_tenants ut
JOIN users u ON ut.user_id = u.id
JOIN tenants t ON ut.tenant_id = t.id
WHERE u.email = 'admin@acme.com' AND t.slug = 'acme-corp';
```

**Solution:**
```typescript
// Re-hash password and update
import bcrypt from 'bcrypt';
const newPassword = 'NewTempPass123!';
const hashedPassword = await bcrypt.hash(newPassword, 10);

await db.update(users)
  .set({ password: hashedPassword })
  .where(eq(users.email, 'admin@acme.com'));

console.log(`Password reset for admin@acme.com: ${newPassword}`);
```

---

### Issue 2: Feature flags not working

**Symptoms:**
- Premium feature visible on starter tier
- Module installed but not accessible

**Root Causes:**
- Incorrect tier assignment
- Module not activated in `tenant_modules`
- `enableAdvancedTools` flag incorrect

**Diagnosis:**
```sql
-- Check tenant tier
SELECT tier, enable_advanced_tools FROM tenants WHERE slug = 'acme-corp';

-- Check installed modules
SELECT module_id, is_active FROM tenant_modules
WHERE tenant_id = '<tenant-id>' AND environment = 'sandbox';
```

**Solution:**
```typescript
// Fix tier assignment
await db.update(tenants)
  .set({ tier: 'starter' }) // Correct tier
  .where(eq(tenants.slug, 'acme-corp'));

// Activate module
await db.update(tenantModules)
  .set({ isActive: true })
  .where(and(
    eq(tenantModules.tenantId, tenant.id),
    eq(tenantModules.moduleId, 'compras')
  ));
```

---

### Issue 3: Tenant can see other tenants' data (Cross-Tenant Leak)

**Symptoms:**
- User sees data from another tenant
- API returns data not owned by tenant

**Root Causes:**
- Missing `hardTenantGuard` middleware on route
- Query missing `WHERE tenant_id = ?` clause
- Session corruption (wrong `activeTenantId`)

**Diagnosis:**
```sql
-- Check user's tenant memberships
SELECT t.slug, ut.role FROM user_tenants ut
JOIN tenants t ON ut.tenant_id = t.id
WHERE ut.user_id = '<user-id>';

-- Check session data
SELECT sess FROM sessions WHERE sid = '<session-id>';
-- Look for: activeTenantId in session JSON
```

**Solution:**
1. **Code fix**: Add `hardTenantGuard` middleware to vulnerable route
   ```typescript
   router.get('/api/sensitive-data', 
     hardTenantGuard, // ← Add this
     async (req, res) => {
       const data = await db.select()
         .from(myTable)
         .where(eq(myTable.tenantId, req.tenantId)); // ← Use req.tenantId
       res.json(data);
     }
   );
   ```

2. **Immediate mitigation**: Clear user session and force re-login
   ```sql
   DELETE FROM sessions WHERE sess::text LIKE '%<user-id>%';
   ```

---

### Issue 4: Environment toggle fails

**Symptoms:**
- User clicks "Switch to Production" but stays in Sandbox
- API returns "Insufficient permissions" error

**Root Causes:**
- User role is not `owner` or `config`
- `activeEnvironment` not updating in database

**Diagnosis:**
```sql
-- Check user role and environment
SELECT role, active_environment FROM user_tenants
WHERE user_id = '<user-id>' AND tenant_id = '<tenant-id>';
-- Expected: role='owner', active_environment='sandbox'
```

**Solution:**
```typescript
// Grant config permissions
await db.update(userTenants)
  .set({ role: 'owner' }) // Or 'config'
  .where(and(
    eq(userTenants.userId, userId),
    eq(userTenants.tenantId, tenantId)
  ));

// Manually switch environment
await db.update(userTenants)
  .set({ activeEnvironment: 'production' })
  .where(and(
    eq(userTenants.userId, userId),
    eq(userTenants.tenantId, tenantId)
  ));
```

---

### Issue 5: Seed data missing

**Symptoms:**
- No sequence counters when creating new supplier
- Company info empty in settings
- Storage provider not configured (document upload fails)

**Root Causes:**
- Provisioning script incomplete
- Seed data step skipped
- Environment mismatch (data in wrong environment)

**Diagnosis:**
```sql
-- Check company info
SELECT * FROM company_info WHERE tenant_id = '<tenant-id>';

-- Check sequence counters
SELECT * FROM sequence_counters WHERE tenant_id = '<tenant-id>';

-- Check storage providers
SELECT * FROM tenant_storage_providers WHERE tenant_id = '<tenant-id>';
```

**Solution:**
```typescript
// Re-run seed data steps from provisioning script
// Step 1: Company info
await db.insert(companyInfo).values({
  tenantId: tenant.id,
  name: tenant.name,
  environment: 'sandbox',
});

// Step 2: Sequence counters
const sequences = [
  { entityType: 'supplier', prefix: 'SUP' },
  { entityType: 'client', prefix: 'CLI' },
  { entityType: 'invoice', prefix: 'INV' },
];

for (const seq of sequences) {
  await db.insert(sequenceCounters).values({
    tenantId: tenant.id,
    entityType: seq.entityType,
    prefix: seq.prefix,
    currentValue: 0,
    paddingLength: 4,
    environment: 'sandbox',
  });
}

// Step 3: Storage provider
await db.insert(tenantStorageProviders).values({
  tenantId: tenant.id,
  providerType: 'local',
  providerName: 'Local Storage',
  isDefault: true,
  isActive: true,
  priority: 0,
  config: { rootPath: './storage' },
  createdBy: user.id,
});
```

---

## 8. 📅 Canary Launch Timeline (7-Day Rollout)

### Overview

**Goal:** Provision 10 tenants in 7 days with staggered rollout to minimize risk.

**Strategy:**
- **Day 1-2**: Beta testers (2 tenants) - users familiar with system
- **Day 3-4**: Early adopters (3 tenants) - high engagement expected
- **Day 5-6**: Diverse use cases (3 tenants) - validate features across industries
- **Day 7**: Reserved capacity (2 tenants) - risk mitigation

**Per-Tenant Time Budget:**
- **Provisioning**: 15 min (automated script)
- **Validation**: 30 min (manual checks)
- **Admin onboarding**: 45 min (walkthrough, Q&A)
- **Total**: ~90 minutes per tenant

---

### Day-by-Day Plan

#### **Day 1 (Monday) - Beta Testers (2 tenants)**

**Tenants:**
1. **Internal Test Company** (Tier: Enterprise) - Platform team's test tenant
2. **Beta Partner #1** (Tier: Starter) - Friendly customer, tech-savvy

**Tasks:**
- [ ] 9:00 AM - Provision Internal Test Company
- [ ] 10:00 AM - Run validation suite
- [ ] 11:00 AM - Provision Beta Partner #1
- [ ] 12:00 PM - Onboarding call with Beta Partner #1
- [ ] 2:00 PM - Monitor logs for first-day issues
- [ ] 4:00 PM - Daily standup: review blockers

**Success Metrics:**
- Both tenants can login successfully
- No critical errors in logs
- Beta Partner #1 completes onboarding call

---

#### **Day 2 (Tuesday) - Beta Tester Follow-up**

**Tenants:** (No new tenants)

**Tasks:**
- [ ] 9:00 AM - Check Beta Partner #1 activity (login count, module usage)
- [ ] 10:00 AM - Fix any bugs reported by Beta Partner #1
- [ ] 12:00 PM - Prepare for Day 3 early adopters
- [ ] 2:00 PM - Update provisioning script if needed
- [ ] 4:00 PM - Daily standup: confirm readiness for Day 3

**Success Metrics:**
- Beta Partner #1 actively using system (10+ chat messages, 5+ documents uploaded)
- No critical bugs blocking usage

---

#### **Day 3 (Wednesday) - Early Adopters Wave 1 (2 tenants)**

**Tenants:**
3. **Early Adopter #1** (Tier: Premium) - Mid-size company, procurement focus
4. **Early Adopter #2** (Tier: Starter) - Small business, finance focus

**Tasks:**
- [ ] 9:00 AM - Provision Early Adopter #1
- [ ] 10:00 AM - Onboarding call with Early Adopter #1
- [ ] 12:00 PM - Provision Early Adopter #2
- [ ] 1:00 PM - Onboarding call with Early Adopter #2
- [ ] 3:00 PM - Monitor logs for new issues
- [ ] 4:00 PM - Daily standup: review feedback

**Success Metrics:**
- Both tenants onboarded successfully
- Procurement module working (Early Adopter #1)
- Finance module working (Early Adopter #2)

---

#### **Day 4 (Thursday) - Early Adopters Wave 2 (1 tenant)**

**Tenants:**
5. **Early Adopter #3** (Tier: Default) - Solo entrepreneur, minimal features

**Tasks:**
- [ ] 9:00 AM - Provision Early Adopter #3
- [ ] 10:00 AM - Onboarding call with Early Adopter #3
- [ ] 12:00 PM - Check activity on Day 3 tenants
- [ ] 2:00 PM - Address support tickets from early adopters
- [ ] 4:00 PM - Daily standup: assess if ready for Day 5

**Success Metrics:**
- Early Adopter #3 onboarded (free tier validation)
- Previous tenants showing healthy activity
- No blocker bugs

---

#### **Day 5 (Friday) - Diverse Use Cases Wave 1 (2 tenants)**

**Tenants:**
6. **Manufacturing Company** (Tier: Enterprise) - Complex workflows, SAP integration
7. **Consulting Firm** (Tier: Starter) - Project-based work

**Tasks:**
- [ ] 9:00 AM - Provision Manufacturing Company
- [ ] 10:00 AM - Configure SAP connector (if needed)
- [ ] 11:00 AM - Onboarding call with Manufacturing Company
- [ ] 1:00 PM - Provision Consulting Firm
- [ ] 2:00 PM - Onboarding call with Consulting Firm
- [ ] 4:00 PM - Weekly review: assess rollout health

**Success Metrics:**
- Manufacturing Company: SAP connector working
- Consulting Firm: Project module accessible
- All 7 tenants showing activity

---

#### **Day 6 (Saturday) - Diverse Use Cases Wave 2 (1 tenant)**

**Tenants:**
8. **Retail Business** (Tier: Premium) - Inventory-heavy, logistics focus

**Tasks:**
- [ ] 10:00 AM - Provision Retail Business
- [ ] 11:00 AM - Onboarding call with Retail Business
- [ ] 1:00 PM - Monitor weekend activity on all tenants
- [ ] 3:00 PM - Prepare for final 2 tenants (Day 7)

**Success Metrics:**
- Retail Business: Logistics module working
- Weekend activity indicates engagement

---

#### **Day 7 (Sunday) - Reserved Capacity (2 tenants)**

**Tenants:**
9. **Reserve Slot #1** (Tier: TBD) - Contingency tenant or waitlist promotion
10. **Reserve Slot #2** (Tier: TBD) - Contingency tenant or waitlist promotion

**Tasks:**
- [ ] 10:00 AM - Provision Reserve Slot #1 (if needed)
- [ ] 12:00 PM - Provision Reserve Slot #2 (if needed)
- [ ] 2:00 PM - Final health check on all 10 tenants
- [ ] 4:00 PM - Post-mortem meeting: review launch success

**Success Metrics:**
- All 10 tenants provisioned and active
- No critical bugs blocking core workflows
- Customer satisfaction feedback collected

---

### Rollout Monitoring Dashboard

Track these metrics daily:

| Metric | Target | Day 1 | Day 3 | Day 5 | Day 7 |
|--------|--------|-------|-------|-------|-------|
| Tenants Provisioned | 10 | 2 | 4 | 7 | 10 |
| Active Users (logged in last 24h) | 80% | - | 3/4 | 6/7 | 8/10 |
| Critical Bugs | 0 | - | - | - | 0 |
| Support Tickets | <10 | - | - | - | <10 |
| Avg Onboarding Time | 90 min | - | - | - | 90 min |

---

### Escalation Plan

**If critical bug discovered:**
1. **Pause new provisioning** immediately
2. **Notify affected tenants** via email/phone
3. **Deploy hotfix** within 4 hours
4. **Validate fix** on internal test tenant
5. **Resume provisioning** after validation

**If onboarding delayed:**
- Communicate delay to customer within 1 hour
- Reschedule within 24 hours
- Offer bonus features/credits as apology

---

## 📞 Support Contacts

**Platform Team:**
- **On-Call Engineer**: [Add contact]
- **Customer Success**: [Add contact]
- **Security Lead**: [Add contact]

**Escalation Path:**
1. First responder: Platform engineer (15 min response)
2. Team lead: Engineering manager (1 hour response)
3. Executive: CTO (4 hour response)

---

## ✅ Post-Launch Checklist

After 10 tenants provisioned:

- [ ] All tenants active and using system
- [ ] Zero critical bugs in production
- [ ] Customer satisfaction survey sent (target: 80% satisfaction)
- [ ] Post-mortem document completed
- [ ] Provisioning script documented and version-controlled
- [ ] Monitoring alerts configured for all tenants
- [ ] Success metrics reported to leadership

---

**End of Playbook**

*Last Updated: November 10, 2025*  
*Version: 1.0*  
*Next Review: After alpha launch (Day 8)*
