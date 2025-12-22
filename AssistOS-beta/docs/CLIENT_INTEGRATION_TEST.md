# Client Integration Test Guide

**Date:** 2025-11-27  
**Purpose:** Test client-side integration with tenant schema changes

---

## Changes Made

### Backend Changes
1. ✅ Schema naming: `tenant_{id}` instead of `tenant_{slug}`
2. ✅ `user_tenants` table migrated to tenant schemas
3. ✅ Services updated to use `TenantQueryBuilder` and cross-tenant helpers
4. ✅ API routes updated:
   - `/api/auth/me` - Uses `tenantService.getUserTenants()` ✅
   - `/api/context/tenants/list` - Uses `tenantService.getUserTenants()` ✅
   - `/api/auth/switch-tenant` - Uses `tenantService.getUserRoleInTenant()` ✅

### Client-Side Impact
The client should work seamlessly because:
- API endpoints maintain the same response format
- Client doesn't need to know about schema names
- All tenant queries go through service layer

---

## Test Checklist

### 1. Authentication & Tenant Loading

**Test:** User login and tenant list loading

**Steps:**
1. Login as a user
2. Check browser console for errors
3. Verify `/api/auth/me` returns user and tenants
4. Verify `/api/context/tenants/list` returns tenant list

**Expected:**
- ✅ No errors in console
- ✅ User data loads correctly
- ✅ Tenant list displays correctly
- ✅ Active tenant is set correctly

**API Calls:**
- `GET /api/auth/me`
- `GET /api/context/tenants/list`

---

### 2. Tenant Switching

**Test:** Switch between tenants

**Steps:**
1. User has access to multiple tenants
2. Click tenant switcher in sidebar/bottom nav
3. Select a different tenant
4. Verify page reloads and new tenant is active

**Expected:**
- ✅ Tenant switch succeeds
- ✅ Session updates correctly
- ✅ Page reloads with new tenant context
- ✅ No errors in console

**API Calls:**
- `POST /api/auth/switch-tenant` with `{ tenantId: "..." }`

---

### 3. Settings Page - Organization Section

**Test:** Organization settings page loads tenant list

**Steps:**
1. Navigate to Settings → Organization
2. Verify tenant list displays
3. Check for any errors

**Expected:**
- ✅ Tenant list loads
- ✅ Current tenant is highlighted
- ✅ All linked tenants are visible
- ✅ No errors

**API Calls:**
- `GET /api/context/tenants/list`

---

### 4. New Tenant Creation

**Test:** Create a new tenant (if user has permission)

**Steps:**
1. Create a new tenant via registration or admin
2. Verify tenant schema is created with correct naming
3. Verify user can access the new tenant

**Expected:**
- ✅ Tenant created successfully
- ✅ Schema name is `tenant_{tenantId}` format
- ✅ User can switch to new tenant
- ✅ No errors

**API Calls:**
- `POST /api/auth/register` or tenant creation endpoint

---

### 5. Studio Page (AssistBuild)

**Test:** AssistBuild studio loads correctly

**Steps:**
1. Navigate to `/studio` as owner/configurator
2. Verify AssistBuild chat loads
3. Test creating tables from templates

**Expected:**
- ✅ Studio page loads
- ✅ AssistBuild chat works
- ✅ Can preview module tables
- ✅ Can activate modules with default tables
- ✅ Tables created in tenant schema

**API Calls:**
- `GET /api/auth/me` (for role check)
- AssistBuild conversation endpoints

---

## Manual Testing Steps

### Quick Test Script

```bash
# 1. Start the server
npm run dev

# 2. In browser console, test API calls:
# Test /api/auth/me
fetch('/api/auth/me')
  .then(r => r.json())
  .then(console.log);

# Test /api/context/tenants/list
fetch('/api/context/tenants/list')
  .then(r => r.json())
  .then(console.log);

# Test tenant switch
fetch('/api/auth/switch-tenant', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ tenantId: 'YOUR_TENANT_ID' })
})
  .then(r => r.json())
  .then(console.log);
```

---

## Common Issues & Solutions

### Issue: "No tenants found" after login

**Possible Causes:**
- `user_tenants` table not migrated to tenant schema
- Cross-tenant query helper not working

**Solution:**
1. Check if tenant schema exists: `SELECT * FROM tenant_schemas WHERE tenant_id = '...'`
2. Check if `user_tenants` exists in tenant schema
3. Verify cross-tenant query helper is working

### Issue: Tenant switch fails

**Possible Causes:**
- `getUserRoleInTenant` not finding user in tenant schema
- Environment parameter missing

**Solution:**
1. Verify `getUserRoleInTenant` is called with environment parameter
2. Check tenant schema has `user_tenants` table
3. Verify user exists in tenant's `user_tenants` table

### Issue: Schema name mismatch

**Possible Causes:**
- Old schema name still in use
- Schema name update script not run

**Solution:**
1. Run schema name update: `npm run update:schema-names`
2. Verify schema names in `tenant_schemas` table

---

## Verification Queries

### Check Tenant Schema
```sql
SELECT tenant_id, schema_name 
FROM tenant_schemas 
WHERE tenant_id = 'YOUR_TENANT_ID';
```

Expected: `schema_name` should be `tenant_{tenantId}` format

### Check User Tenants in Schema
```sql
SELECT * 
FROM "tenant_{tenantId}"."user_tenants" 
WHERE user_id = 'YOUR_USER_ID';
```

### Check Tables in Tenant Schema
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'tenant_{tenantId}'
ORDER BY table_name;
```

---

## Success Criteria

- [ ] User can login successfully
- [ ] Tenant list loads correctly
- [ ] Tenant switching works
- [ ] Settings page loads tenant list
- [ ] New tenant creation works
- [ ] AssistBuild studio works
- [ ] No console errors
- [ ] All API endpoints return expected data

---

## Related Documentation

- `docs/SCHEMA_NAMING_UPDATE.md` - Schema naming changes
- `docs/SERVICE_UPDATE_STATUS.md` - Service update status
- `apps/api/utils/cross-tenant-query.helper.ts` - Cross-tenant query helpers

