# Environment Query Helpers

## Overview

The Environment Query Helpers provide standardized utilities for creating environment-scoped database queries. These helpers ensure proper environment isolation across all services and prevent cross-environment data leakage.

**Location:** `apps/api/utils/environment-query.utils.ts`

## Available Functions

### 1. `environmentFilter`

Creates an environment filter condition for queries.

**Signature:**
```typescript
function environmentFilter<T extends { environment: any }>(
  table: T,
  environment: Environment
): SQL
```

**Usage:**
```typescript
import { environmentFilter } from '@api/utils/environment-query.utils';
import { ENVIRONMENTS } from '@shared/types/environment';

// Filter by production environment
const clients = await db
  .select()
  .from(clientsTable)
  .where(environmentFilter(clientsTable, ENVIRONMENTS.PRODUCTION));
```

---

### 2. `scopedFilter`

Creates a combined tenant + environment filter. This is the most commonly used filter for multi-tenant environment-scoped queries.

**Signature:**
```typescript
function scopedFilter<T extends { tenantId: any; environment: any }>(
  table: T,
  tenantId: string,
  environment: Environment
): SQL
```

**Usage:**
```typescript
import { scopedFilter } from '@api/utils/environment-query.utils';

// Old approach (no environment isolation)
const invoices = await db
  .select()
  .from(invoicesTable)
  .where(eq(invoicesTable.tenantId, tenantId));

// New approach (with environment isolation)
const invoices = await db
  .select()
  .from(invoicesTable)
  .where(scopedFilter(invoicesTable, tenantId, environment));
```

---

### 3. `validateForeignKeyEnvironment`

Validates that a foreign key reference exists in the same environment before creating a record.

**Signature:**
```typescript
async function validateForeignKeyEnvironment<T extends { id: any; tenantId: any; environment: any }>(
  db: any,
  table: T,
  id: string,
  tenantId: string,
  environment: Environment
): Promise<boolean>
```

**Usage:**
```typescript
import { validateForeignKeyEnvironment } from '@api/utils/environment-query.utils';

// Before creating invoice, validate supplier exists in same environment
const supplierExists = await validateForeignKeyEnvironment(
  db,
  suppliersTable,
  supplierId,
  tenantId,
  environment
);

if (!supplierExists) {
  throw new Error('Supplier not found in current environment');
}

// Safe to proceed with invoice creation
await db.insert(invoicesTable).values({
  supplierId,
  tenantId,
  environment,
  // ... other fields
});
```

---

### 4. `withEnvironment`

Adds environment field to insert data, ensuring environment is set correctly on new records.

**Signature:**
```typescript
function withEnvironment<T extends Record<string, any>>(
  data: T,
  environment: Environment
): T & { environment: Environment }
```

**Usage:**
```typescript
import { withEnvironment } from '@api/utils/environment-query.utils';
import { ENVIRONMENTS } from '@shared/types/environment';

// Create new record with environment
const newClient = withEnvironment({
  name: 'ACME Corp',
  tenantId: 'tenant-123',
  email: 'contact@acme.com'
}, ENVIRONMENTS.PRODUCTION);

await db.insert(clientsTable).values(newClient);
```

---

## Common Patterns

### Pattern 1: List Records (GET)

```typescript
// Service method
async getInvoices(tenantId: string, environment: Environment) {
  return await db
    .select()
    .from(invoicesTable)
    .where(scopedFilter(invoicesTable, tenantId, environment));
}
```

### Pattern 2: Get Single Record (GET by ID)

```typescript
// Service method
async getInvoice(id: string, tenantId: string, environment: Environment) {
  const results = await db
    .select()
    .from(invoicesTable)
    .where(and(
      eq(invoicesTable.id, id),
      scopedFilter(invoicesTable, tenantId, environment)
    ));
  
  return results[0] ?? null;
}
```

### Pattern 3: Create Record (POST)

```typescript
// Service method
async createInvoice(data: InsertInvoice, tenantId: string, environment: Environment) {
  // Validate foreign key exists in same environment
  if (data.clientId) {
    const clientExists = await validateForeignKeyEnvironment(
      db,
      clientsTable,
      data.clientId,
      tenantId,
      environment
    );
    
    if (!clientExists) {
      throw new Error('Client not found in current environment');
    }
  }
  
  // Create record with environment
  const newInvoice = withEnvironment({
    ...data,
    tenantId
  }, environment);
  
  const [created] = await db.insert(invoicesTable).values(newInvoice).returning();
  return created;
}
```

### Pattern 4: Update Record (PATCH)

```typescript
// Service method
async updateInvoice(
  id: string,
  data: Partial<InsertInvoice>,
  tenantId: string,
  environment: Environment
) {
  // Validate foreign keys if being updated
  if (data.clientId) {
    const clientExists = await validateForeignKeyEnvironment(
      db,
      clientsTable,
      data.clientId,
      tenantId,
      environment
    );
    
    if (!clientExists) {
      throw new Error('Client not found in current environment');
    }
  }
  
  const [updated] = await db
    .update(invoicesTable)
    .set(data)
    .where(and(
      eq(invoicesTable.id, id),
      scopedFilter(invoicesTable, tenantId, environment)
    ))
    .returning();
  
  return updated;
}
```

### Pattern 5: Delete Record (DELETE)

```typescript
// Service method
async deleteInvoice(id: string, tenantId: string, environment: Environment) {
  const [deleted] = await db
    .delete(invoicesTable)
    .where(and(
      eq(invoicesTable.id, id),
      scopedFilter(invoicesTable, tenantId, environment)
    ))
    .returning();
  
  return deleted;
}
```

---

## Migration Examples

### Before (No Environment Isolation)

```typescript
// ❌ Old service method - no environment isolation
async getSuppliers(tenantId: string) {
  return await db
    .select()
    .from(suppliersTable)
    .where(eq(suppliersTable.tenantId, tenantId));
}

async createSupplier(data: InsertSupplier, tenantId: string) {
  const [created] = await db
    .insert(suppliersTable)
    .values({ ...data, tenantId })
    .returning();
  return created;
}
```

### After (With Environment Isolation)

```typescript
// ✅ New service method - with environment isolation
import { scopedFilter, withEnvironment } from '@api/utils/environment-query.utils';
import type { Environment } from '@shared/types/environment';

async getSuppliers(tenantId: string, environment: Environment) {
  return await db
    .select()
    .from(suppliersTable)
    .where(scopedFilter(suppliersTable, tenantId, environment));
}

async createSupplier(data: InsertSupplier, tenantId: string, environment: Environment) {
  const newSupplier = withEnvironment(
    { ...data, tenantId },
    environment
  );
  
  const [created] = await db
    .insert(suppliersTable)
    .values(newSupplier)
    .returning();
  return created;
}
```

---

## Best Practices

### 1. Always Use scopedFilter for Multi-Tenant Queries

```typescript
// ✅ Good
const clients = await db
  .select()
  .from(clientsTable)
  .where(scopedFilter(clientsTable, tenantId, environment));

// ❌ Bad - missing environment filter
const clients = await db
  .select()
  .from(clientsTable)
  .where(eq(clientsTable.tenantId, tenantId));
```

### 2. Validate Foreign Keys Before Creating Records

```typescript
// ✅ Good - validates FK exists in same environment
const clientExists = await validateForeignKeyEnvironment(
  db, clientsTable, clientId, tenantId, environment
);
if (!clientExists) {
  throw new Error('Client not found in current environment');
}

// ❌ Bad - no validation, could create cross-environment FK
await db.insert(invoicesTable).values({ clientId, ... });
```

### 3. Use withEnvironment for Inserts

```typescript
// ✅ Good - ensures environment is set
const newRecord = withEnvironment({ ...data, tenantId }, environment);
await db.insert(table).values(newRecord);

// ❌ Bad - manually setting environment (error-prone)
await db.insert(table).values({ ...data, tenantId, environment });
```

### 4. Add Environment Parameter to All Service Methods

```typescript
// ✅ Good - environment is explicit parameter
async getInvoices(tenantId: string, environment: Environment) { ... }

// ❌ Bad - environment is implicit or missing
async getInvoices(tenantId: string) { ... }
```

---

## Service Refactor Checklist

When refactoring a service to support environment isolation:

- [ ] Add `environment: Environment` parameter to all methods
- [ ] Replace `eq(table.tenantId, tenantId)` with `scopedFilter(table, tenantId, environment)`
- [ ] Replace manual `{ ...data, tenantId }` with `withEnvironment({ ...data, tenantId }, environment)`
- [ ] Add `validateForeignKeyEnvironment` checks before creating records with FKs
- [ ] Update route handlers to pass `req.environment` to service methods
- [ ] Update tests to include environment parameter
- [ ] Document environment behavior in API comments

---

## Integration with Routes

Environment should be extracted from the request in middleware and passed to service methods:

```typescript
// Route handler
router.get('/api/invoices', async (req, res) => {
  const tenantId = req.user!.tenantId;
  const environment = req.environment; // Set by middleware
  
  const invoices = await invoiceService.getInvoices(tenantId, environment);
  res.json(invoices);
});

router.post('/api/invoices', async (req, res) => {
  const tenantId = req.user!.tenantId;
  const environment = req.environment;
  
  const invoice = await invoiceService.createInvoice(
    req.body,
    tenantId,
    environment
  );
  res.json(invoice);
});
```

---

## Testing

Unit tests should verify environment isolation:

```typescript
import { describe, it, expect } from 'vitest';
import { scopedFilter } from '@api/utils/environment-query.utils';
import { ENVIRONMENTS } from '@shared/types/environment';

describe('InvoiceService', () => {
  it('only returns invoices from specified environment', async () => {
    // Create invoices in both environments
    await createInvoice({ ... }, tenantId, ENVIRONMENTS.PRODUCTION);
    await createInvoice({ ... }, tenantId, ENVIRONMENTS.SANDBOX);
    
    // Query production - should only return production invoice
    const prodInvoices = await getInvoices(tenantId, ENVIRONMENTS.PRODUCTION);
    expect(prodInvoices).toHaveLength(1);
    expect(prodInvoices[0].environment).toBe(ENVIRONMENTS.PRODUCTION);
    
    // Query sandbox - should only return sandbox invoice
    const sandboxInvoices = await getInvoices(tenantId, ENVIRONMENTS.SANDBOX);
    expect(sandboxInvoices).toHaveLength(1);
    expect(sandboxInvoices[0].environment).toBe(ENVIRONMENTS.SANDBOX);
  });
});
```

---

## Troubleshooting

### Error: "Invalid environment"

**Cause:** Attempting to use an invalid environment value.

**Solution:** Ensure you're using `ENVIRONMENTS.PRODUCTION` or `ENVIRONMENTS.SANDBOX` constants.

### Error: "Cross-environment foreign key violation"

**Cause:** Attempting to create a record that references a record in a different environment.

**Solution:** Use `validateForeignKeyEnvironment` before creating records with foreign keys.

### Records Not Appearing

**Cause:** Querying with wrong environment.

**Solution:** Verify the `environment` parameter matches the environment where records were created.

---

## Support

For questions or issues with environment query helpers:
- Review this documentation
- Check the unit tests in `apps/api/utils/__tests__/environment-query.utils.test.ts`
- Refer to `shared/types/environment.ts` for environment taxonomy

---

**Version:** 1.0.0  
**Last Updated:** Phase 4.1 - Task 2.2.7.3  
**Status:** Production Ready ✅
