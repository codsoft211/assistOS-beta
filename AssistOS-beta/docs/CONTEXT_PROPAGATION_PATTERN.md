# Context Propagation Pattern

**Version:** 1.0  
**Last Updated:** November 2025  
**Phase:** 2.2.7 - Environment Taxonomy Implementation

## Overview

This document describes how request context (specifically `tenantId` and `environment`) flows through the AssistOS system, from API requests through services to worker jobs.

## Core Principles

1. **Environment is Type-Safe**: All context objects use the `Environment` type from `shared/types/environment.ts`
2. **Environment is Immutable**: Once set on a request/job, the environment cannot change
3. **Environment is Always Present**: All queries must respect the current environment
4. **No Cross-Environment References**: Foreign keys cannot span environments

## Type Definitions

### Request Context (API Layer)

```typescript
import type { Environment } from '@shared/types/environment';

// Defined in apps/api/services/context.service.ts
export interface RequestContext {
  tenantId: string;
  environment: Environment;  // 'production' | 'sandbox'
  userId?: string;
}
```

This context is available on the Express `Request` object via middleware:

```typescript
// apps/api/types/express.d.ts extends Express.Request
interface Request {
  tenantId?: string;
  environment?: Environment;
  userId?: string;
  // ... other properties
}
```

### Worker Job Context

```typescript
// Defined in apps/api/services/context.service.ts
export interface WorkerJobContext {
  tenantId: string;
  environment: Environment;
  userId?: string;
  jobId?: string;
}

// Base payload for all worker jobs
export interface BaseJobPayload {
  tenantId: string;
  environment: Environment;
  userId?: string;
}
```

## Middleware: Environment Injection

The `tenantMiddleware` (located in `apps/api/middleware/tenant-middleware.ts`) is responsible for injecting both `tenantId` and `environment` into every request.

### How It Works

1. **Tenant Resolution**: Middleware first resolves the tenant from either:
   - Session tenant ID (for authenticated sessions)
   - Tenant slug (from header or query parameter)

2. **User Authentication Check**: If a user is authenticated (`req.user` exists):
   - Fetches the `userTenants` relationship
   - Extracts `activeEnvironment` from the relationship
   - Validates and injects it into `req.environment`

3. **Environment Defaults**: If no user or userTenant is found:
   - Defaults to `ENVIRONMENTS.PRODUCTION`
   - Logs the default behavior for debugging

### Implementation Details

```typescript
import { DEFAULT_ENVIRONMENT, coerceEnvironment } from '@shared/types/environment';

// Inside tenantMiddleware
if (req.user && req.user.id) {
  const [userTenant] = await db
    .select()
    .from(userTenants)
    .where(and(
      eq(userTenants.userId, userId),
      eq(userTenants.tenantId, tenant.id)
    ))
    .limit(1);

  if (userTenant) {
    // Inject environment from userTenants.activeEnvironment
    req.environment = coerceEnvironment(
      userTenant.activeEnvironment, 
      DEFAULT_ENVIRONMENT
    );
  } else {
    // Default for authenticated user without tenant access
    req.environment = DEFAULT_ENVIRONMENT;
  }
} else {
  // Default for unauthenticated requests
  req.environment = DEFAULT_ENVIRONMENT;
}
```

### Key Features

- **Safe Coercion**: Uses `coerceEnvironment()` to validate values and fallback safely
- **No Extra Queries**: Reuses existing `userTenants` query (no performance impact)
- **Debug Logging**: Logs environment injection for troubleshooting
- **Backward Compatible**: Existing routes work without modification

### Scenarios Handled

| Scenario | Environment Source | Result |
|----------|-------------------|--------|
| Authenticated user with valid `activeEnvironment` | `userTenants.activeEnvironment` | User's selected environment |
| Authenticated user with invalid `activeEnvironment` | Validation fallback | `PRODUCTION` (default) |
| Authenticated user without `userTenants` record | Default | `PRODUCTION` |
| Unauthenticated request | Default | `PRODUCTION` |
| API key request | Default | `PRODUCTION` |

## Usage Patterns

### 1. In API Routes

Access context directly from the request object:

```typescript
import { Router } from 'express';
import type { Request, Response } from 'express';

const router = Router();

router.get('/clients', async (req: Request, res: Response) => {
  // Context injected by middleware
  const { tenantId, environment, userId } = req;

  if (!tenantId || !environment) {
    return res.status(400).json({ error: 'Missing tenant context' });
  }

  // Pass to service
  const clients = await clientService.list(tenantId, environment);
  res.json(clients);
});
```

### 2. In Services

Services receive `tenantId` and `environment` as explicit parameters:

```typescript
import type { Environment } from '@shared/types/environment';
import { db } from '../db';
import { clients } from '@shared/schema';
import { eq, and } from 'drizzle-orm';

export class ClientService {
  async list(tenantId: string, environment: Environment) {
    return await db.select()
      .from(clients)
      .where(and(
        eq(clients.tenantId, tenantId),
        eq(clients.environment, environment)
      ));
  }

  async create(
    tenantId: string,
    environment: Environment,
    data: InsertClient
  ) {
    return await db.insert(clients).values({
      ...data,
      tenantId,
      environment,  // Always set from context
    }).returning();
  }
}
```

**Important Service Patterns:**

- ✅ Always accept `environment` as a parameter
- ✅ Always include `environment` in WHERE clauses
- ✅ Always set `environment` when creating records
- ❌ Never hardcode `environment = 'production'`
- ❌ Never allow cross-environment queries

### 3. Queueing Worker Jobs

When dispatching jobs, include full context:

```typescript
import { assistbuildQueue } from '../queues/assistbuild';
import type { BaseJobPayload } from '../services/context.service';

interface MyJobPayload extends BaseJobPayload {
  customData: string;
}

async function enqueueJob(req: Request) {
  const { tenantId, environment, userId } = req;

  const payload: MyJobPayload = {
    // Context
    tenantId,
    environment,
    userId,
    // Job-specific data
    customData: 'example',
  };

  await assistbuildQueue.add('my-job-type', payload);
}
```

### 4. Processing Worker Jobs

Access context from job data:

```typescript
import { Job } from 'bullmq';
import type { BaseJobPayload } from '@api/services/context.service';

interface MyJobPayload extends BaseJobPayload {
  customData: string;
}

async function processMyJob(job: Job<MyJobPayload>) {
  const { tenantId, environment, userId, customData } = job.data;

  // Use context in service calls
  await someService.doWork(tenantId, environment, customData);
}
```

## Environment Guard-Rails

### Validation Helpers

Use validation functions from `shared/types/environment.ts`:

```typescript
import { 
  validateEnvironment,
  coerceEnvironment,
  ENVIRONMENTS,
  DEFAULT_ENVIRONMENT
} from '@shared/types/environment';

// Validate user input
const env = validateEnvironment(req.body.environment);
// Throws error if invalid

// Safely coerce with fallback
const env = coerceEnvironment(userInput);
// Returns DEFAULT_ENVIRONMENT if invalid
```

### Foreign Key Validation

Prevent cross-environment references:

```typescript
import { validateForeignKeyEnvironment } from '@shared/types/environment';

async function createOrder(
  tenantId: string,
  environment: Environment,
  data: { clientId: string }
) {
  // Fetch the client
  const client = await db.query.clients.findFirst({
    where: and(
      eq(clients.id, data.clientId),
      eq(clients.tenantId, tenantId)
    ),
  });

  if (!client) {
    throw new Error('Client not found');
  }

  // Validate same environment
  validateForeignKeyEnvironment(environment, client.environment);
  // Throws if environments don't match

  // Create order
  return await db.insert(orders).values({
    ...data,
    tenantId,
    environment,  // Guaranteed same as client
  }).returning();
}
```

## Migration Guide

### Updating Existing Routes

**Before:**
```typescript
router.get('/data', async (req, res) => {
  const { tenantId } = req;
  const data = await service.getData(tenantId);
  res.json(data);
});
```

**After:**
```typescript
router.get('/data', async (req, res) => {
  const { tenantId, environment } = req;
  const data = await service.getData(tenantId, environment);
  res.json(data);
});
```

### Updating Existing Services

**Before:**
```typescript
class MyService {
  async getData(tenantId: string) {
    return await db.select()
      .from(myTable)
      .where(eq(myTable.tenantId, tenantId));
  }
}
```

**After:**
```typescript
import type { Environment } from '@shared/types/environment';

class MyService {
  async getData(tenantId: string, environment: Environment) {
    return await db.select()
      .from(myTable)
      .where(and(
        eq(myTable.tenantId, tenantId),
        eq(myTable.environment, environment)
      ));
  }
}
```

### Updating Worker Jobs

**Before:**
```typescript
interface JobPayload {
  tenantId: string;
  userId: string;
  customData: string;
}
```

**After:**
```typescript
import type { BaseJobPayload } from '@api/services/context.service';

interface JobPayload extends BaseJobPayload {
  customData: string;
}

// Now includes: tenantId, environment, userId (from BaseJobPayload)
```

## Testing Patterns

### Testing with Different Environments

```typescript
import { ENVIRONMENTS } from '@shared/types/environment';

describe('Client Service', () => {
  it('should list production clients only', async () => {
    const clients = await service.list(
      'tenant-123',
      ENVIRONMENTS.PRODUCTION
    );
    
    // All clients should be in production
    expect(clients.every(c => c.environment === 'production')).toBe(true);
  });

  it('should list sandbox clients only', async () => {
    const clients = await service.list(
      'tenant-123',
      ENVIRONMENTS.SANDBOX
    );
    
    // All clients should be in sandbox
    expect(clients.every(c => c.environment === 'sandbox')).toBe(true);
  });

  it('should prevent cross-environment FK', async () => {
    await expect(
      service.createOrder('tenant-123', ENVIRONMENTS.SANDBOX, {
        clientId: 'production-client-id'
      })
    ).rejects.toThrow('Cross-environment foreign key violation');
  });
});
```

## Common Pitfalls

### ❌ DON'T: Hardcode Environment

```typescript
// BAD - Environment should come from context
const clients = await db.select()
  .from(clients)
  .where(and(
    eq(clients.tenantId, tenantId),
    eq(clients.environment, 'production')  // ❌ NEVER hardcode
  ));
```

### ❌ DON'T: Ignore Environment in Queries

```typescript
// BAD - Missing environment filter
const clients = await db.select()
  .from(clients)
  .where(eq(clients.tenantId, tenantId));  // ❌ Missing environment
```

### ❌ DON'T: Allow Cross-Environment References

```typescript
// BAD - Not validating environment match
const order = await db.insert(orders).values({
  clientId: req.body.clientId,  // ❌ Could be different environment!
  tenantId,
  environment,
});
```

### ✅ DO: Always Pass Environment Through Chain

```typescript
// GOOD - Environment flows through entire chain
router.post('/orders', async (req, res) => {
  const { tenantId, environment } = req;
  const order = await orderService.create(tenantId, environment, req.body);
  res.json(order);
});

class OrderService {
  async create(tenantId: string, environment: Environment, data: any) {
    // Validate client is in same environment
    const client = await this.clientService.get(
      tenantId,
      environment,
      data.clientId
    );
    
    return await db.insert(orders).values({
      ...data,
      tenantId,
      environment,  // ✅ From context
    });
  }
}
```

## Next Steps

1. **Phase 2.2.8**: Implement environment middleware to inject `environment` into requests
2. **Phase 2.2.9**: Update all existing services to accept `environment` parameter
3. **Phase 2.2.10**: Add environment validation to all foreign key relationships

## References

- [Environment Taxonomy](../shared/types/environment.ts) - Core type definitions and validation
- [Request Context](../apps/api/services/context.service.ts) - Context interfaces
- [Express Types](../apps/api/types/express.d.ts) - Request type extensions
- [Worker Job Base](../apps/worker/jobs/assistbuild/base.ts) - Worker context

## Support

For questions or issues with context propagation:
1. Check this documentation first
2. Review the type definitions in `shared/types/environment.ts`
3. Look at existing implementations in services
4. Ensure middleware is properly configured
