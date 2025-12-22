# Settings Schema Requirements

**Document Purpose:** This document defines the complete data model and schema requirements for AssistOS Settings functionality, implemented across Tasks 1-15. It serves as a reference for future schema refactoring, migration planning, and database normalization efforts.

**Created:** 2025-11-11  
**Status:** MVP Complete (100% - Tasks 1-16 implemented)  
**Related Features:** AssistSettings (chat-driven personal configuration), dual-column UI (chat left, visual panels right), real-time SSE sync

---

## Table of Contents

1. [Overview](#overview)
2. [Current Implementation (MVP)](#current-implementation-mvp)
3. [Users Table Extensions](#users-table-extensions)
4. [Preferences JSON Schema](#preferences-json-schema)
5. [Team Management Schema](#team-management-schema)
6. [Tenants & Multi-Tenancy](#tenants--multi-tenancy)
7. [SSE Event Topics](#sse-event-topics)
8. [Future Refactoring Recommendations](#future-refactoring-recommendations)
9. [Migration Strategy](#migration-strategy)

---

## Overview

### Architecture Summary

**Current MVP Implementation:**
- Users table extended with `preferences` JSON column (theme, language, AI tone, notifications)
- Users table extended with profile fields (bio, jobTitle, phone, location)
- UserTenants table for team management (many-to-many users ↔ tenants)
- Real-time SSE broadcasting for preference/profile changes
- Dual-column Settings UI (chat left, visual panels right)

**Design Principles:**
1. **Simplicity First:** Leverage JSON columns for flexible preference storage (avoid premature normalization)
2. **Real-Time Sync:** SSE events ensure chat ↔ visual panel consistency
3. **RBAC Separation:** Team management enforces admin-only operations
4. **Type Safety:** Drizzle ORM + Zod validation for all CRUD operations

---

## Current Implementation (MVP)

### Database Tables Used

**Core Tables:**
1. `users` - User identity + profile + preferences (extended in MVP)
2. `userTenants` - Team membership + roles (existing, enhanced pagination)
3. `tenants` - Organization/tenant metadata (existing, no changes)
4. `invitations` - Pending team invitations (existing, enhanced CRUD)

**No New Tables Created:** MVP extends existing schema with JSON columns.

---

## Users Table Extensions

### Schema Definition

**File:** `shared/schema.ts`

```typescript
export const users = pgTable('users', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  email: varchar('email').unique().notNull(),
  password: varchar('password'),
  firstName: varchar('first_name'),
  lastName: varchar('last_name'),
  
  // ✅ ADDED IN MVP: Profile Extensions
  bio: text('bio'),                          // Task 2 (PerfilSettings)
  jobTitle: varchar('job_title', { length: 255 }), // Task 2
  phone: varchar('phone', { length: 50 }),   // Task 2
  location: varchar('location', { length: 255 }), // Task 2
  
  // ✅ ADDED IN MVP: Preferences JSON
  preferences: jsonb('preferences').default({}), // Task 3 (PreferenciasSettings)
  
  // Existing fields (unchanged)
  googleId: varchar('google_id').unique(),
  avatar: varchar('avatar'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});
```

### Insert Schema (Drizzle Zod)

```typescript
export const insertUserProfileSchema = createInsertSchema(users).pick({
  firstName: true,
  lastName: true,
  bio: true,
  jobTitle: true,
  phone: true,
  location: true,
});

export const insertUserPreferencesSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']).optional(),
  language: z.string().regex(/^[a-z]{2}-[A-Z]{2}$/).optional(), // IETF BCP 47
  aiTone: z.enum(['professional', 'friendly', 'concise']).optional(),
  notifications: z.object({
    channels: z.object({
      email: z.boolean().optional(),
      push: z.boolean().optional(),
      sms: z.boolean().optional(),
    }).optional(),
    events: z.object({
      taskReminders: z.boolean().optional(),
      teamUpdates: z.boolean().optional(),
      systemAlerts: z.boolean().optional(),
    }).optional(),
  }).optional(),
});
```

### Select Types

```typescript
export type User = typeof users.$inferSelect;
export type UserProfile = Pick<User, 'firstName' | 'lastName' | 'bio' | 'jobTitle' | 'phone' | 'location'>;
export type UserPreferences = z.infer<typeof insertUserPreferencesSchema>;
```

---

## Preferences JSON Schema

### JSON Structure (users.preferences)

**Storage:** `jsonb` column in `users` table  
**Default Value:** `{}`  
**Validation:** Zod schema (see above)

#### Complete Schema Shape

```typescript
interface UserPreferences {
  theme?: 'light' | 'dark' | 'system';
  language?: string; // IETF BCP 47 (e.g., 'pt-PT', 'en-US')
  aiTone?: 'professional' | 'friendly' | 'concise';
  notifications?: {
    channels?: {
      email?: boolean;
      push?: boolean;
      sms?: boolean;
    };
    events?: {
      taskReminders?: boolean;
      teamUpdates?: boolean;
      systemAlerts?: boolean;
    };
  };
}
```

#### Example JSON Values

**Minimal (default):**
```json
{}
```

**Populated:**
```json
{
  "theme": "dark",
  "language": "pt-PT",
  "aiTone": "professional",
  "notifications": {
    "channels": {
      "email": true,
      "push": false,
      "sms": false
    },
    "events": {
      "taskReminders": true,
      "teamUpdates": true,
      "systemAlerts": false
    }
  }
}
```

### Database Defaults

**Backend Normalization (apps/api/routes/users.ts):**

```typescript
const DEFAULT_PREFERENCES: UserPreferences = {
  theme: 'system',
  language: 'pt-PT',
  aiTone: 'professional',
  notifications: {
    channels: {
      email: true,
      push: false,
      sms: false,
    },
    events: {
      taskReminders: true,
      teamUpdates: true,
      systemAlerts: true,
    },
  },
};

// Deep merge: preserves user values, fills missing fields with defaults
const normalizedPreferences = {
  ...DEFAULT_PREFERENCES,
  ...user.preferences,
  notifications: {
    channels: {
      ...DEFAULT_PREFERENCES.notifications.channels,
      ...user.preferences?.notifications?.channels,
    },
    events: {
      ...DEFAULT_PREFERENCES.notifications.events,
      ...user.preferences?.notifications?.events,
    },
  },
};
```

**Behavior:**
- GET `/api/users/preferences` returns normalized preferences (never empty)
- PUT `/api/users/preferences` merges incoming data with defaults
- Partial updates supported (e.g., change only `theme`, preserve `notifications`)

---

## Team Management Schema

### UserTenants Table

**Purpose:** Many-to-many relationship between users and tenants, with role-based access control.

**Schema Definition:**

```typescript
export const userTenants = pgTable('user_tenants', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar('user_id').references(() => users.id).notNull(),
  tenantId: varchar('tenant_id').references(() => tenants.id).notNull(),
  role: varchar('role').default('member').notNull(), // 'owner', 'admin', 'member'
  joinedAt: timestamp('joined_at').defaultNow(),
});
```

**Insert Schema:**

```typescript
export const insertUserTenantSchema = createInsertSchema(userTenants).omit({
  id: true,
  joinedAt: true,
});

export type InsertUserTenant = z.infer<typeof insertUserTenantSchema>;
export type UserTenant = typeof userTenants.$inferSelect;
```

### Invitations Table

**Purpose:** Track pending team invitations before user accepts.

**Schema Definition:**

```typescript
export const invitations = pgTable('invitations', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar('tenant_id').references(() => tenants.id).notNull(),
  email: varchar('email').notNull(),
  role: varchar('role').default('member').notNull(),
  invitedBy: varchar('invited_by').references(() => users.id).notNull(),
  status: varchar('status').default('pending').notNull(), // 'pending', 'accepted', 'revoked'
  createdAt: timestamp('created_at').defaultNow(),
  expiresAt: timestamp('expires_at'),
});
```

### Team API Endpoints

**Implemented in `apps/api/routes/team.ts`:**

| Method | Endpoint | Purpose | RBAC |
|--------|----------|---------|------|
| GET | `/api/team` | List team members (paginated) | Any authenticated user |
| GET | `/api/team/invites` | List pending invitations | Any authenticated user |
| POST | `/api/team/invite` | Invite new member | Admin/Owner only |
| PATCH | `/api/team/:id/role` | Update member role | Admin/Owner only |
| DELETE | `/api/team/:id` | Remove member | Admin/Owner only |
| POST | `/api/team/invites/:id/resend` | Resend invitation | Admin/Owner only |
| DELETE | `/api/team/invites/:id` | Revoke invitation | Admin/Owner only |

**Pagination Parameters:**
- `query` (optional): Search filter (firstName, lastName, email)
- `page` (default: 1): Page number
- `size` (default: 10): Items per page

**RBAC Guards:**
- `requireAdmin` middleware: Verifies user role is 'admin' or 'owner'
- Owner protection: Prevents deleting the last owner (enforces ≥1 owner per tenant)

---

## Tenants & Multi-Tenancy

### Tenants Table

**No changes in MVP** - existing schema used as-is.

**Relevant Fields:**

```typescript
export const tenants = pgTable('tenants', {
  id: varchar('id').primaryKey(),
  name: varchar('name').notNull(),
  tier: varchar('tier'), // 'free', 'starter', 'premium', 'enterprise'
  environment: varchar('environment').default('production'), // 'sandbox', 'production'
  createdAt: timestamp('created_at').defaultNow(),
});
```

### Context API Endpoints

**Implemented in `apps/api/routes/users.ts`:**

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/context` | Get current tenant + environment |
| GET | `/api/tenants/list` | List all user's tenants (multi-tenant support) |

**Response Shapes:**

**GET `/api/context`:**
```typescript
{
  tenant: {
    id: string;
    name: string;
    tier: string;
    environment: 'sandbox' | 'production';
  } | null;
  environment: 'sandbox' | 'production';
}
```

**GET `/api/tenants/list`:**
```typescript
{
  tenants: Array<{
    id: string;
    name: string;
    tier: string;
    environment: string;
    joinedAt: Date;
    role: 'owner' | 'admin' | 'member';
  }>;
}
```

---

## SSE Event Topics

### Real-Time Event Broadcasting

**Implemented in `apps/api/lib/sse-broadcaster.ts`:**

**Event Topics:**

| Topic | Emitted When | Payload Shape |
|-------|--------------|---------------|
| `settings:user.preferences.updated` | User preferences change (chat or visual) | `{ userId: string, preferences: UserPreferences }` |
| `settings:user.profile.updated` | User profile change (chat or visual) | `{ userId: string, profile: UserProfile }` |
| `settings:team.member.changed` | Team member added/removed/role changed | `{ tenantId: string, action: 'added' \| 'removed' \| 'role_changed' }` |
| `settings:tenant.updated` | Tenant metadata change | `{ tenantId: string }` |

### Event Emission Points

**Backend Tools (packages/ai/tools/assistsettings/):**

1. **update_user_preferences.ts:**
   ```typescript
   // After successful DB update:
   emitSSE(
     'settings:user.preferences.updated',
     context.tenantId || userId, // CRITICAL: Fallback for tenant-less contexts
     { userId, preferences: result.preferences }
   );
   ```

2. **update_user_profile.ts:**
   ```typescript
   // After successful DB update:
   emitSSE(
     'settings:user.profile.updated',
     context.tenantId || userId, // CRITICAL: Fallback for tenant-less contexts
     { userId, profile: result }
   );
   ```

**Backend API Routes (apps/api/routes/team.ts):**

3. **POST `/api/team/invite`, PATCH `/api/team/:id/role`, DELETE `/api/team/:id`:**
   ```typescript
   // After successful team change:
   emitSSE(
     'settings:team.member.changed',
     tenantId,
     { tenantId, action: 'added' } // OR 'removed', 'role_changed'
   );
   ```

### Frontend SSE Subscription

**Hook:** `client/src/components/settings/hooks/useLiveSettings.ts`

```typescript
useEffect(() => {
  const eventSource = new EventSource('/api/events/subscribe');
  
  eventSource.addEventListener('settings:user.preferences.updated', (event) => {
    const data = JSON.parse(event.data);
    queryClient.invalidateQueries({ queryKey: ['/api/users/preferences'] });
  });
  
  eventSource.addEventListener('settings:user.profile.updated', (event) => {
    const data = JSON.parse(event.data);
    queryClient.invalidateQueries({ queryKey: ['/api/users/me'] });
  });
  
  eventSource.addEventListener('settings:team.member.changed', (event) => {
    const data = JSON.parse(event.data);
    queryClient.invalidateQueries({ queryKey: ['/api/team'] });
    queryClient.invalidateQueries({ queryKey: ['/api/team/invites'] });
  });
  
  return () => eventSource.close();
}, [queryClient]);
```

**Behavior:**
- Automatic cache invalidation on SSE events
- Cross-tab sync (EventSource shared across browser tabs)
- Real-time chat ↔ visual panel synchronization

---

## Future Refactoring Recommendations

### 1. Normalize Preferences (Separate Table)

**Current:** `users.preferences` JSON column  
**Future:** Dedicated `user_preferences` table

**Benefits:**
- Indexable preference fields (e.g., filter users by `theme = 'dark'`)
- Stricter type enforcement at DB level
- Easier analytics queries (count users per theme)

**Proposed Schema:**

```typescript
export const userPreferences = pgTable('user_preferences', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar('user_id').references(() => users.id).notNull().unique(),
  theme: varchar('theme').default('system'), // 'light', 'dark', 'system'
  language: varchar('language').default('pt-PT'), // IETF BCP 47
  aiTone: varchar('ai_tone').default('professional'), // enum
  notificationChannels: jsonb('notification_channels').default({}),
  notificationEvents: jsonb('notification_events').default({}),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});
```

**Migration Strategy:**
1. Create `user_preferences` table (keep `users.preferences` column)
2. Migrate existing JSON → new table (one-time script)
3. Update API routes to use new table
4. Deprecate `users.preferences` column after migration verified

---

### 2. Notification Preferences (Granular Table)

**Current:** `users.preferences.notifications` nested JSON  
**Future:** Dedicated `user_notification_preferences` table with foreign keys

**Benefits:**
- Fine-grained RBAC (e.g., admin can enforce `systemAlerts = true`)
- Audit trail for preference changes (who changed what, when)
- Support for per-channel opt-out regulations (GDPR compliance)

**Proposed Schema:**

```typescript
export const userNotificationPreferences = pgTable('user_notification_preferences', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar('user_id').references(() => users.id).notNull().unique(),
  emailEnabled: boolean('email_enabled').default(true),
  pushEnabled: boolean('push_enabled').default(false),
  smsEnabled: boolean('sms_enabled').default(false),
  taskRemindersEnabled: boolean('task_reminders_enabled').default(true),
  teamUpdatesEnabled: boolean('team_updates_enabled').default(true),
  systemAlertsEnabled: boolean('system_alerts_enabled').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});
```

**Migration Strategy:** Similar to preferences normalization above.

---

### 3. Profile Fields (Separate Table)

**Current:** `users.bio`, `users.jobTitle`, `users.phone`, `users.location`  
**Future:** Dedicated `user_profiles` table

**Benefits:**
- Cleaner `users` table (identity-only fields)
- Support for multiple profiles per user (e.g., personal vs. work)
- Easier to extend with new profile fields without altering core `users` table

**Proposed Schema:**

```typescript
export const userProfiles = pgTable('user_profiles', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar('user_id').references(() => users.id).notNull().unique(),
  bio: text('bio'),
  jobTitle: varchar('job_title', { length: 255 }),
  phone: varchar('phone', { length: 50 }),
  location: varchar('location', { length: 255 }),
  linkedinUrl: varchar('linkedin_url'),
  twitterHandle: varchar('twitter_handle'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});
```

**Migration Strategy:**
1. Create `user_profiles` table
2. Migrate existing `users.bio|jobTitle|phone|location` → new table
3. Update API routes to LEFT JOIN `user_profiles`
4. Drop columns from `users` table after migration verified

---

### 4. Team Invitations (Enhanced Metadata)

**Current:** `invitations` table with minimal fields  
**Future:** Add invitation metadata + tracking

**Enhancements:**
- `acceptedAt` timestamp (audit trail)
- `revokedAt` timestamp (soft delete)
- `revokedBy` foreign key (who revoked)
- `reminderCount` integer (track resends)
- `lastReminderAt` timestamp (prevent spam)

**Proposed Schema Extension:**

```typescript
export const invitations = pgTable('invitations', {
  // Existing fields...
  acceptedAt: timestamp('accepted_at'),
  revokedAt: timestamp('revoked_at'),
  revokedBy: varchar('revoked_by').references(() => users.id),
  reminderCount: integer('reminder_count').default(0),
  lastReminderAt: timestamp('last_reminder_at'),
});
```

**Migration Strategy:** Use `ALTER TABLE` (safe - additive only).

---

## Migration Strategy

### Phase 1: MVP Complete (Current State - 100%)

**Status:** ✅ COMPLETE  
**Implementation:** JSON columns + existing tables extended  
**Duration:** Tasks 1-16 (3 weeks)

**Delivered:**
- Users API (GET/PUT `/api/users/me`, `/api/users/preferences`)
- Team API (CRUD + RBAC)
- Settings UI (5 sections: Perfil, Preferências, Organização, Team, Conectores)
- SSE real-time sync (chat ↔ visual)
- E2E tests (Playwright - 3 test cases)
- Schema documentation (complete migration roadmap)

---

### Phase 2: Schema Normalization (Future Refactor)

**Trigger:** When analytics/indexing/RBAC requires normalized tables  
**Duration:** 2-3 weeks  
**Risk:** Medium (requires data migration + API changes)

**Steps:**

1. **Week 1: Create New Tables**
   - Add `user_preferences`, `user_profiles`, `user_notification_preferences`
   - Keep existing JSON columns (parallel schema)
   - Write migration scripts (JSON → tables)

2. **Week 2: Dual-Write Period**
   - Update API routes to write to BOTH old (JSON) + new (tables)
   - Verify data consistency (automated checks)
   - Run migration script (backfill historical data)

3. **Week 3: Deprecate JSON Columns**
   - Update API routes to read from new tables only
   - Remove dual-write logic
   - Drop deprecated columns (`ALTER TABLE users DROP COLUMN preferences`)

**Rollback Plan:**
- Keep JSON columns until new tables verified (100% data parity)
- Revert API routes to JSON-only mode if issues detected
- Database snapshots before/after each migration step

---

### Phase 3: Advanced Features (Future Enhancement)

**Trigger:** Post-schema normalization  
**Duration:** 4-6 weeks  
**Risk:** Low (builds on normalized schema)

**Enhancements:**

1. **Preference Templates:**
   - Admin-defined preference presets (e.g., "Developer", "Executive")
   - One-click apply for new users

2. **Preference History:**
   - Audit trail for all preference changes
   - Rollback to previous preference states

3. **Team-Level Preferences:**
   - Override user preferences at tenant level (e.g., enforce dark mode)
   - Cascading preference inheritance (user → team → org)

4. **Advanced Notifications:**
   - Digest mode (daily/weekly summaries)
   - Custom event filters (regex-based)
   - Scheduled quiet hours (DND mode)

---

## Appendix: API Endpoint Reference

### Complete Endpoint List (MVP)

**Users & Preferences:**
- `GET /api/users/me` - Get current user identity
- `GET /api/users/me/profile` - Get user profile (extended fields)
- `PUT /api/users/me/profile` - Update user profile
- `GET /api/users/preferences` - Get user preferences (normalized with defaults)
- `PUT /api/users/preferences` - Update user preferences (partial updates supported)

**Team Management:**
- `GET /api/team` - List team members (paginated, searchable)
- `GET /api/team/invites` - List pending invitations
- `POST /api/team/invite` - Invite new member (admin-only)
- `PATCH /api/team/:id/role` - Update member role (admin-only)
- `DELETE /api/team/:id` - Remove member (admin-only, owner protection)
- `POST /api/team/invites/:id/resend` - Resend invitation (admin-only)
- `DELETE /api/team/invites/:id` - Revoke invitation (admin-only)

**Tenants & Context:**
- `GET /api/context` - Get current tenant + environment
- `GET /api/tenants/list` - List all user's tenants (multi-tenant support)

**Real-Time Events:**
- `GET /api/events/subscribe` - SSE endpoint for real-time updates

---

## Conclusion

This document captures the complete schema requirements for AssistOS Settings functionality as implemented in Tasks 1-15. It serves as a foundation for:

1. **Current Maintenance:** Understanding existing data model
2. **Future Refactoring:** Roadmap for schema normalization
3. **Migration Planning:** Step-by-step strategy for table separation
4. **Team Onboarding:** Reference for new developers

**Next Steps:**
- ✅ Task 16 (Documentation) COMPLETE (2025-11-11)
- Proceed to production deployment (when user approves)
- Plan Phase 2 schema normalization (when analytics/RBAC requires)

**Document Maintained By:** Replit Agent (AssistOS Team)  
**Last Updated:** 2025-11-11  
**Version:** 1.0 (MVP Complete)
