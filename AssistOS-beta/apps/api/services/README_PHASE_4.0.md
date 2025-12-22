# Phase 4.0 - Services Migration Status

## Migrated Files (Phase 4.0)

### ✅ Core Services (REQUIRED - Migrated)

1. **event-emitter.ts** - Real-time event bus for SSE
   - Source: `/tmp/assistos-legacy/server/event-emitter.ts` (52 lines)
   - Exports: `realtimeEvents` (EventEmitter instance)
   - Status: ✅ Migrated

2. **openai.service.ts** - OpenAI chat completions & streaming (LARGE FILE)
   - Source: `/tmp/assistos-legacy/server/openai.ts` (1584 lines → 1622 lines with header)
   - Exports: `openai`, `chatWithAgent`, `streamChatWithAgent`, `AgentType`, helpers
   - Dependencies: 
     - ✅ aiTools from `packages/ai/tools/index.ts`
     - 🔶 TODO: onboarding-storage (stubbed for now)
     - 🔶 TODO: configuration agent prompt (stubbed)
     - 🔶 TODO: assist-me tools (stubbed)
   - Status: ✅ Migrated with TODOs for unmigrated deps

3. **smart-tool-filter.ts** - AI tool selection system
   - Source: `/tmp/assistos-legacy/server/agents/smart-tool-filter.ts` (173 lines)
   - Exports: `filterRelevantTools`, `canAccessFinancialData`, `getFallbackTools`
   - Dependencies: tool-registry.ts (migrated)
   - Status: ✅ Migrated

4. **tool-registry.ts** - Tool categorization & permissions
   - Source: `/tmp/assistos-legacy/server/agents/tool-registry.ts` (398 lines)
   - Exports: Tool metadata, category detection, permission filtering
   - Status: ✅ Migrated

## Migrated Utilities

### ✅ Storage Helper (apps/api/utils/)

1. **storage-helper.ts** - Tenant-scoped storage abstraction
   - Source: Pattern from `/tmp/assistos-legacy/server/routes/conversations.ts`
   - Exports: `getStorage(req)`, `getTenantStorage(tenantId)`, `getTenantIdFromRequest`
   - Purpose: Provides tenant-scoped database access for routes
   - Status: ✅ Created

## Migration Notes

**Critical Dependencies Migrated:**
- ✅ Event emitter for real-time SSE
- ✅ OpenAI service with streaming (all 1584 lines preserved)
- ✅ Smart tool filtering system
- ✅ Tool registry with permissions
- ✅ Storage helper for route-level DB access

**TODOs in openai.service.ts:**
```typescript
// TODO: Phase 4.x - Migrate these dependencies when needed
// - getTenantStorage (from onboarding-storage)
// - getConfigurationPrompt (from agents/configuration)
// - getAssistMePrompt (from agents/erp-chat-agent)
// - ASSIST_ME_TOOLS + executeAssistMeTool
```

These are stubbed with fallbacks for now - routes will work but some agent features limited until migrated.

**Compilation Status:**
- All services compile with adapted imports
- Temporary stubs prevent compilation errors
- Ready for Phase 4.1 route migration
