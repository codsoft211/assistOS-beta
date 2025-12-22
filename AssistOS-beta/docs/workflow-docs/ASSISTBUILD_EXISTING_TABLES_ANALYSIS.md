# AssistBuild - Existing Tables Analysis

## 🔍 Existing Workflow-Related Tables

### ✅ Already in Schema (shared/schema.ts)

1. **`workflow_templates`** (line 487)
   - System-level workflow templates
   - Category-based (procurement, sales, finance, operations)
   - Has automations, steps, states
   - Purpose: Template library for creating workflows

2. **`tenant_workflows`** (line 10592)
   - Per-tenant workflow instances
   - Has steps array with branching support
   - Trigger types: manual, event, schedule
   - Status: isActive, executionCount
   - Purpose: Active workflows per tenant

3. **`workflow_executions`** (line 10732)
   - Tracks workflow execution runs
   - References tenant_workflows
   - Has status, currentStepId, completedSteps
   - Purpose: Execution history

4. **`automation_executions`** (line 10640)
   - Similar to workflow_executions but for automations
   - References tenantAutomations

5. **`agent_runs`** (line 10678)
   - Tracks agent executions
   - Part of execution engine

---

## 🎯 Strategy: Create NEW AssistBuild Tables

Since workflow tables already exist, we'll create **separate AssistBuild tables** with clear naming:

### New Table Names (No Conflicts)

1. **`assistbuild_workflows`** - AssistBuild workflow definitions (visual builder)
2. **`assistbuild_executions`** - AssistBuild execution runs
3. **`assistbuild_execution_logs`** - Node-level execution logs
4. **`assistbuild_node_registry`** - Available node types and configs (optional)

---

## 📊 Key Differences: Existing vs AssistBuild

| Feature | Existing (`tenant_workflows`) | AssistBuild (`assistbuild_workflows`) |
|---------|------------------------------|---------------------------------------|
| **Purpose** | Simple linear/branching workflows | Visual DAG-based workflow builder |
| **Editor** | Configuration-based | Drag-and-drop canvas (n8n-like) |
| **Nodes** | Generic steps with config | Specific node types (trigger, CRUD, AI, etc.) |
| **Structure** | Steps array with nextSteps | Nodes + Edges (graph structure) |
| **Versioning** | None | Draft → Published versions |
| **Sandbox** | No sandbox mode | Sandbox vs Production |
| **Execution** | Step-by-step | DAG traversal with node executors |
| **Node Logs** | Steps in stepsExecuted | Detailed node logs in separate table |

---

## ✅ Decision: Keep Both Systems

### Existing System (`tenant_workflows`)
- Continue using for current workflows
- Simple step-based flows
- Already in production

### AssistBuild System (`assistbuild_workflows`)
- New visual workflow builder
- Advanced features (DAG, versioning, sandbox)
- Phase 1: 2 nodes only
- Eventually can migrate old workflows to new system

---

## 🚀 Implementation Strategy

1. **Create separate AssistBuild tables** (no conflicts)
2. **Use different naming convention** (`assistbuild_*`)
3. **Keep existing workflows running** (backward compatible)
4. **Future:** Migration tool to convert `tenant_workflows` → `assistbuild_workflows`

---

## 📝 Next Steps

1. Create migration file: `supabase/migrations/20251216000000_assistbuild_foundation.sql`
2. Add Drizzle schema: Update `shared/schema.ts` with AssistBuild tables
3. Create separate API routes: `/api/assistbuild/*`
4. Use separate BullMQ queue: `assistbuild-executions`

This approach ensures **zero conflicts** and **clean separation** between existing and new systems.
