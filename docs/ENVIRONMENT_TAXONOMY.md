# Environment Taxonomy for AssistOS

**Version:** 1.0  
**Last Updated:** November 8, 2025  
**Status:** ✅ Implemented

## Table of Contents

1. [Overview](#overview)
2. [Environment Values](#environment-values)
3. [Default Behavior](#default-behavior)
4. [Guard-Rails](#guard-rails)
5. [Promotion Workflow](#promotion-workflow)
6. [Query Patterns](#query-patterns)
7. [Implementation Guide](#implementation-guide)
8. [Migration Guide](#migration-guide)
9. [API Reference](#api-reference)
10. [Best Practices](#best-practices)

---

## Overview

The AssistOS environment taxonomy provides a simple, robust system for isolating production and sandbox data within a multi-tenant architecture. This enables users to safely test configurations, experiment with AI agents, and validate workflows without affecting real business data.

### Design Philosophy

- **Simplicity:** Only 2 environments (production + sandbox) to minimize complexity
- **Safety:** Guard-rails prevent accidental cross-environment contamination
- **Immutability:** Environment cannot change after record creation
- **Explicit Promotion:** Controlled workflow for moving sandbox → production

### Key Benefits

- ✅ Safe experimentation without production impact
- ✅ Test AI configurations before going live
- ✅ Validate workflows with realistic data
- ✅ No risk of accidental data mixing
- ✅ Clear audit trail for promotions

---

## Environment Values

The system supports exactly **two environments**:

### Production

- **Value:** `'production'`
- **Purpose:** Real business data used in daily operations
- **Visibility:** Always visible when in production mode
- **Default:** Yes - all new records default to production
- **Characteristics:**
  - Contains actual clients, invoices, orders, etc.
  - Used by end users for real work
  - Affects business operations
  - Cannot be demoted to sandbox

### Sandbox

- **Value:** `'sandbox'`
- **Purpose:** Isolated testing and experimentation
- **Visibility:** Only visible when explicitly in sandbox mode
- **Default:** No - must be explicitly set
- **Characteristics:**
  - Safe environment for testing
  - Can experiment with AI agents
  - Test workflow configurations
  - Validate integrations
  - Can be promoted to production (with validation)

### Why Not More Environments?

**No 'staging':** Staging is a deployment concept, not a data concept. The sandbox serves this purpose for data testing.

**No 'development':** Development is a code environment concept. Developers work with the codebase, not a separate data environment.

**No 'test':** Sandbox IS the test environment. Adding more names creates confusion without adding value.

---

## Default Behavior

### New Records

- **Default Environment:** `production`
- **Rationale:** Most user operations are production work
- **Override:** Can explicitly set `environment: 'sandbox'` when creating records

```typescript
// Default behavior - creates in production
const client = await db.insert(clients).values({
  name: "ACME Corp",
  tenantId: "...",
  // environment defaults to 'production'
});

// Explicit sandbox creation
const sandboxClient = await db.insert(clients).values({
  name: "Test Client",
  tenantId: "...",
  environment: ENVIRONMENTS.SANDBOX, // Explicit override
});
```

### Existing Data

- All existing records without an environment column are treated as `production`
- Migration scripts will backfill `environment = 'production'` for all existing data
- No data loss or disruption during migration

### User Context

Users have an `activeEnvironment` setting in their `userTenants` record:

```typescript
interface UserTenants {
  userId: string;
  tenantId: string;
  activeEnvironment: 'production' | 'sandbox'; // Defaults to 'production'
  // ... other fields
}
```

- Users can toggle between production/sandbox mode in the UI
- All queries automatically filter by the user's active environment
- Context is maintained per-tenant (user can be in production for Tenant A, sandbox for Tenant B)

---

## Guard-Rails

The system enforces several critical guard-rails to prevent data corruption and ensure safety:

### 1. Environment Immutability

**Rule:** Once a record is created, its environment **CANNOT** be changed.

**Rationale:**
- Prevents accidental data mixing
- Ensures referential integrity
- Forces explicit promotion workflow

**Implementation:**
```typescript
// ❌ This should be prevented at the application level
UPDATE clients SET environment = 'production' WHERE id = '123';

// ✅ Use promotion workflow instead
await promoteToProduction(clientId, {
  validateReferences: true,
  createAuditTrail: true,
});
```

**Enforcement:**
- Application-level validation in API routes
- Database triggers (future enhancement)
- Audit logging for all environment-related operations

### 2. No Cross-Environment Foreign Keys

**Rule:** A record can only reference other records in the **same environment**.

**Rationale:**
- Maintains environment isolation
- Prevents orphaned references when promoting
- Ensures data integrity

**Example Violation:**
```typescript
// ❌ INVALID: Production order referencing sandbox client
const order = {
  clientId: "sandbox-client-123",
  environment: "production", // Different environment!
};
```

**Valid Pattern:**
```typescript
// ✅ VALID: Both in same environment
const sandboxOrder = {
  clientId: "sandbox-client-123",
  environment: "sandbox", // Same environment ✓
};
```

**Enforcement:**
```typescript
import { validateForeignKeyEnvironment } from '@/shared/types/environment';

// Before creating order
const client = await db.query.clients.findFirst({
  where: eq(clients.id, data.clientId),
});

validateForeignKeyEnvironment(
  data.environment,
  client.environment
);
// Throws error if environments don't match
```

### 3. Promotion Direction

**Rule:** Only sandbox → production promotion is allowed (never reverse).

**Rationale:**
- Production data is authoritative
- Prevents accidental production data loss
- Maintains clear data flow direction

**Allowed:**
```typescript
// ✅ Sandbox → Production
await promoteToProduction(sandboxRecordId);
```

**Prohibited:**
```typescript
// ❌ Production → Sandbox (not allowed)
await demoteToSandbox(productionRecordId); // This function should not exist
```

**Implementation:**
```typescript
import { validatePromotion } from '@/shared/types/environment';

validatePromotion(
  sourceRecord.environment,
  ENVIRONMENTS.PRODUCTION
);
// Throws if not sandbox → production
```

### 4. Query Enforcement

**Rule:** ALL queries MUST filter by environment.

**Rationale:**
- Prevents accidental cross-environment data leaks
- Ensures users only see relevant data
- Maintains clean separation

**Implementation:**

```typescript
// Middleware sets environment context
app.use(async (req, res, next) => {
  const userTenant = await getUserTenant(req.user.id, req.tenant.id);
  req.environment = userTenant.activeEnvironment;
  next();
});

// All queries filter by environment
const clients = await db.query.clients.findMany({
  where: and(
    eq(clients.tenantId, req.tenant.id),
    eq(clients.environment, req.environment), // Required filter
  ),
});
```

---

## Promotion Workflow

Promotion is the controlled process of moving validated sandbox records to production.

### Promotion Process

```
┌──────────┐
│ Sandbox  │
│  Record  │
└────┬─────┘
     │
     ▼
┌──────────────────┐
│ 1. Validation    │ ← Check references, duplicates, data quality
└────┬─────────────┘
     │
     ▼
┌──────────────────┐
│ 2. Deduplication │ ← Check for existing production equivalents
└────┬─────────────┘
     │
     ▼
┌──────────────────┐
│ 3. Copy Creation │ ← Create new production record(s)
└────┬─────────────┘
     │
     ▼
┌──────────────────┐
│ 4. Audit Trail   │ ← Log promotion for compliance
└────┬─────────────┘
     │
     ▼
┌──────────┐
│Production│
│  Record  │
└──────────┘
```

### Validation Steps

1. **Reference Validation:**
   - Check all foreign keys
   - Ensure referenced records exist or will be promoted
   - Validate referential integrity

2. **Deduplication:**
   - Search for existing production equivalents
   - Compare by business key (e.g., NIF, email)
   - Prompt user if duplicates found

3. **Data Quality:**
   - Validate required fields
   - Check data constraints
   - Ensure business rules compliance

4. **User Confirmation:**
   - Show promotion summary
   - List all records to be created
   - Require explicit approval

### Implementation Example

```typescript
async function promoteToProduction(
  sandboxRecordId: string,
  options: {
    validateReferences?: boolean;
    checkDuplicates?: boolean;
    createAuditTrail?: boolean;
  } = {}
) {
  // 1. Load sandbox record
  const sandboxRecord = await db.query.clients.findFirst({
    where: and(
      eq(clients.id, sandboxRecordId),
      eq(clients.environment, ENVIRONMENTS.SANDBOX)
    ),
  });

  if (!sandboxRecord) {
    throw new Error('Sandbox record not found');
  }

  // 2. Validate promotion is allowed
  validatePromotion(sandboxRecord.environment, ENVIRONMENTS.PRODUCTION);

  // 3. Check for duplicates (if enabled)
  if (options.checkDuplicates) {
    const duplicate = await db.query.clients.findFirst({
      where: and(
        eq(clients.nif, sandboxRecord.nif),
        eq(clients.environment, ENVIRONMENTS.PRODUCTION)
      ),
    });

    if (duplicate) {
      throw new Error(`Duplicate found: ${duplicate.name} (${duplicate.id})`);
    }
  }

  // 4. Create production copy
  const [productionRecord] = await db.insert(clients).values({
    ...sandboxRecord,
    id: undefined, // Generate new ID
    environment: ENVIRONMENTS.PRODUCTION,
    createdAt: new Date(),
    updatedAt: new Date(),
  }).returning();

  // 5. Create audit trail (if enabled)
  if (options.createAuditTrail) {
    await db.insert(promotionAuditLog).values({
      sandboxId: sandboxRecordId,
      productionId: productionRecord.id,
      entityType: 'client',
      promotedBy: getCurrentUserId(),
      promotedAt: new Date(),
    });
  }

  return productionRecord;
}
```

### Batch Promotion

For promoting related records (e.g., client + contacts + orders):

```typescript
async function batchPromote(recordIds: string[], entityType: string) {
  // 1. Load all records
  // 2. Build dependency graph
  // 3. Validate all references
  // 4. Promote in dependency order
  // 5. Update cross-references
  // 6. Create audit trail
}
```

---

## Query Patterns

### Basic Query with Environment Filter

```typescript
import { eq, and } from 'drizzle-orm';
import { ENVIRONMENTS } from '@/shared/types/environment';

// Get all production clients
const clients = await db.query.clients.findMany({
  where: and(
    eq(clients.tenantId, tenantId),
    eq(clients.environment, ENVIRONMENTS.PRODUCTION)
  ),
});
```

### Using Environment Filter Helper

```typescript
import { environmentFilter } from '@/shared/types/environment';

const clients = await db.query.clients.findMany({
  where: and(
    eq(clients.tenantId, tenantId),
    ...Object.entries(environmentFilter(currentEnvironment)).map(
      ([key, value]) => eq(clients[key], value)
    )
  ),
});
```

### Joining Tables (Same Environment)

```typescript
// Both tables must be in same environment
const ordersWithClients = await db
  .select()
  .from(orders)
  .leftJoin(clients, eq(orders.clientId, clients.id))
  .where(
    and(
      eq(orders.tenantId, tenantId),
      eq(orders.environment, currentEnvironment),
      eq(clients.environment, currentEnvironment) // Explicit filter on joined table
    )
  );
```

### Environment-Aware Middleware

```typescript
// Middleware to automatically inject environment filter
app.use(async (req, res, next) => {
  const userTenant = await db.query.userTenants.findFirst({
    where: and(
      eq(userTenants.userId, req.user.id),
      eq(userTenants.tenantId, req.tenant.id)
    ),
  });

  req.environment = userTenant?.activeEnvironment || ENVIRONMENTS.PRODUCTION;
  next();
});
```

### Switching Environments

```typescript
// Update user's active environment
await db
  .update(userTenants)
  .set({ activeEnvironment: ENVIRONMENTS.SANDBOX })
  .where(
    and(
      eq(userTenants.userId, userId),
      eq(userTenants.tenantId, tenantId)
    )
  );
```

---

## Implementation Guide

### Adding Environment to a New Table

1. **Add environment column using helper:**

```typescript
import { environmentColumn } from '@/shared/schema';

export const myNewTable = pgTable("my_new_table", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id),
  environment: environmentColumn(), // ← Add this
  name: text("name").notNull(),
  // ... other columns
});
```

2. **Add environment filter to all queries:**

```typescript
const records = await db.query.myNewTable.findMany({
  where: and(
    eq(myNewTable.tenantId, tenantId),
    eq(myNewTable.environment, currentEnvironment) // ← Add this
  ),
});
```

3. **Validate foreign keys:**

```typescript
import { validateForeignKeyEnvironment } from '@/shared/types/environment';

// Before creating record with FK
const parent = await db.query.parentTable.findFirst({
  where: eq(parentTable.id, data.parentId),
});

validateForeignKeyEnvironment(data.environment, parent.environment);
```

### Adding Environment to Existing Table

1. **Create migration:**

```sql
-- Add environment column with default
ALTER TABLE existing_table 
  ADD COLUMN environment TEXT NOT NULL DEFAULT 'production';

-- Add index for common queries
CREATE INDEX existing_table_tenant_environment_idx 
  ON existing_table(tenant_id, environment);
```

2. **Update schema definition:**

```typescript
export const existingTable = pgTable("existing_table", {
  // ... existing columns
  environment: environmentColumn(), // Add this
});
```

3. **Update all queries:**

```typescript
// Before
const records = await db.query.existingTable.findMany({
  where: eq(existingTable.tenantId, tenantId),
});

// After
const records = await db.query.existingTable.findMany({
  where: and(
    eq(existingTable.tenantId, tenantId),
    eq(existingTable.environment, currentEnvironment) // Add this
  ),
});
```

---

## Migration Guide

### Phase 1: Schema Updates

1. Add environment column to all relevant tables
2. Backfill with 'production' default
3. Add indexes for performance

```sql
-- Template for each table
ALTER TABLE table_name 
  ADD COLUMN environment TEXT NOT NULL DEFAULT 'production';

CREATE INDEX table_name_tenant_environment_idx 
  ON table_name(tenant_id, environment);
```

### Phase 2: Code Updates

1. Import environment utilities
2. Add environment filters to queries
3. Add FK validation
4. Update insert operations

### Phase 3: User Migration

1. Add `activeEnvironment` to `userTenants`
2. Default all users to 'production'
3. Add UI toggle for environment switching

### Phase 4: Testing

1. Verify production data isolation
2. Test sandbox creation
3. Validate promotion workflow
4. Check cross-environment FK prevention

---

## API Reference

See `shared/types/environment.ts` for complete API documentation.

### Type Definitions

```typescript
type Environment = 'production' | 'sandbox';
```

### Constants

- `ENVIRONMENTS.PRODUCTION` - Production environment constant
- `ENVIRONMENTS.SANDBOX` - Sandbox environment constant
- `DEFAULT_ENVIRONMENT` - Default for new records ('production')
- `ENVIRONMENT_GUARD_RAILS` - Configuration object for guard-rails

### Validation Functions

- `isValidEnvironment(value)` - Type guard
- `validateEnvironment(value)` - Validates and throws on error
- `coerceEnvironment(value, fallback?)` - Safe coercion with fallback
- `canPromote(from, to)` - Check if promotion is allowed
- `validatePromotion(from, to)` - Validate and throw on invalid promotion
- `validateSameEnvironment(records, expected)` - Validate all records in same env
- `validateForeignKeyEnvironment(new, existing)` - Validate FK environment match

### Utility Functions

- `getOppositeEnvironment(env)` - Get opposite environment
- `isProduction(env)` - Check if production
- `isSandbox(env)` - Check if sandbox
- `getEnvironmentLabel(env)` - Get human-readable label
- `getEnvironmentBadgeColor(env)` - Get UI badge color

---

## Best Practices

### DO ✅

- **Always filter queries by environment**
  ```typescript
  where: and(
    eq(table.tenantId, tenantId),
    eq(table.environment, currentEnvironment)
  )
  ```

- **Use the environmentColumn() helper**
  ```typescript
  environment: environmentColumn()
  ```

- **Validate FK environments**
  ```typescript
  validateForeignKeyEnvironment(child.environment, parent.environment);
  ```

- **Use promotion workflow**
  ```typescript
  await promoteToProduction(sandboxId, { createAuditTrail: true });
  ```

- **Provide user feedback about current environment**
  ```typescript
  <Badge color={getEnvironmentBadgeColor(currentEnvironment)}>
    {getEnvironmentLabel(currentEnvironment)}
  </Badge>
  ```

### DON'T ❌

- **Don't allow direct environment updates**
  ```typescript
  // ❌ Bad - violates immutability
  UPDATE table SET environment = 'production';
  ```

- **Don't create cross-environment references**
  ```typescript
  // ❌ Bad - violates FK guard-rail
  const order = {
    clientId: sandboxClient.id,
    environment: ENVIRONMENTS.PRODUCTION
  };
  ```

- **Don't skip environment filters**
  ```typescript
  // ❌ Bad - mixes environments
  const allClients = await db.query.clients.findMany({
    where: eq(clients.tenantId, tenantId)
    // Missing: eq(clients.environment, currentEnvironment)
  });
  ```

- **Don't hardcode environment strings**
  ```typescript
  // ❌ Bad
  if (record.environment === 'production')
  
  // ✅ Good
  if (record.environment === ENVIRONMENTS.PRODUCTION)
  ```

### Error Handling

Always handle environment validation errors gracefully:

```typescript
try {
  validatePromotion(source.environment, target.environment);
  await promoteToProduction(id);
} catch (error) {
  if (error.message.includes('Invalid promotion')) {
    return res.status(400).json({
      error: 'Cannot promote production records to sandbox',
    });
  }
  throw error;
}
```

---

## Conclusion

The AssistOS environment taxonomy provides a simple, safe, and effective way to isolate production and sandbox data. By following these guidelines and enforcing the guard-rails, you can confidently enable users to experiment and test without risk to production systems.

### Key Takeaways

1. **Two environments only:** production (default) + sandbox
2. **Immutable:** Environment cannot change after creation
3. **Isolated:** No cross-environment references allowed
4. **Controlled promotion:** Only sandbox → production with validation
5. **Always filter:** Every query must filter by environment

### Next Steps

1. Review existing tables that need environment columns
2. Create migration scripts for schema updates
3. Update API routes to enforce environment filters
4. Add UI controls for environment switching
5. Implement promotion workflow
6. Add comprehensive testing

---

**Document Version:** 1.0  
**Author:** AssistOS Development Team  
**Last Review:** November 8, 2025
