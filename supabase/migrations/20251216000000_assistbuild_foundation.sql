-- ============================================================================
-- AssistBuild Workflow System - Foundation (Phase 1)
-- ============================================================================
-- 
-- Purpose: Visual workflow builder with DAG-based execution
-- Phase 1: 2 nodes only (Manual Trigger + CRUD Record)
-- 
-- NOTE: This is SEPARATE from existing tenant_workflows system
-- New system uses: assistbuild_workflows, assistbuild_executions, assistbuild_execution_logs
-- 
-- Created: 2025-12-16
-- ============================================================================

-- ============================================================================
-- PART 1: AssistBuild Workflows (Visual Workflow Definitions)
-- ============================================================================

-- Main workflow definitions table
-- Stores the visual workflow (nodes, edges, configuration)
CREATE TABLE IF NOT EXISTS "assistbuild_workflows" (
  "id" VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Tenant & environment
  "tenant_id" VARCHAR NOT NULL,
  "environment" TEXT NOT NULL DEFAULT 'production',
  -- Environment: 'sandbox' | 'production'
  
  -- Basic info
  "name" VARCHAR(255) NOT NULL,
  "description" TEXT,
  
  -- Workflow definition (JSON structure)
  -- Contains: { nodes: [], edges: [], variables: {} }
  "definition" JSONB NOT NULL,
  
  -- Version control
  "version" INTEGER NOT NULL DEFAULT 1,
  "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
  -- Status: 'draft' | 'published' | 'archived'
  
  -- Trigger configuration (Phase 1: manual only)
  "trigger_type" VARCHAR(20) DEFAULT 'manual',
  -- Phase 1: 'manual' only
  -- Future: 'event', 'schedule'
  "trigger_config" JSONB,
  
  -- Metadata
  "created_by" VARCHAR NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "published_at" TIMESTAMPTZ,
  
  -- Constraints
  CONSTRAINT "check_assistbuild_workflow_status" 
    CHECK ("status" IN ('draft', 'published', 'archived')),
  CONSTRAINT "check_assistbuild_workflow_environment" 
    CHECK ("environment" IN ('sandbox', 'production'))
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS "idx_assistbuild_workflows_tenant" 
  ON "assistbuild_workflows"("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_assistbuild_workflows_status" 
  ON "assistbuild_workflows"("status");
CREATE INDEX IF NOT EXISTS "idx_assistbuild_workflows_environment" 
  ON "assistbuild_workflows"("environment");
CREATE INDEX IF NOT EXISTS "idx_assistbuild_workflows_created_by" 
  ON "assistbuild_workflows"("created_by");
CREATE INDEX IF NOT EXISTS "idx_assistbuild_workflows_created_at" 
  ON "assistbuild_workflows"("created_at" DESC);

-- Composite index for common queries (tenant + status)
CREATE INDEX IF NOT EXISTS "idx_assistbuild_workflows_tenant_status" 
  ON "assistbuild_workflows"("tenant_id", "status");

-- Full-text search on workflow names
CREATE INDEX IF NOT EXISTS "idx_assistbuild_workflows_name_search" 
  ON "assistbuild_workflows" USING gin(to_tsvector('english', "name"));

-- Auto-update timestamp trigger
CREATE OR REPLACE FUNCTION update_assistbuild_workflows_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "trigger_assistbuild_workflows_updated_at"
  BEFORE UPDATE ON "assistbuild_workflows"
  FOR EACH ROW
  EXECUTE FUNCTION update_assistbuild_workflows_updated_at();

-- Comments for documentation
COMMENT ON TABLE "assistbuild_workflows" IS 'AssistBuild visual workflow definitions (DAG-based)';
COMMENT ON COLUMN "assistbuild_workflows"."definition" IS 'JSONB: { nodes: [], edges: [], variables: {} }';
COMMENT ON COLUMN "assistbuild_workflows"."environment" IS 'Workflow execution environment (sandbox for testing, production for live)';
COMMENT ON COLUMN "assistbuild_workflows"."status" IS 'Workflow lifecycle: draft → published → archived';


-- ============================================================================
-- PART 2: AssistBuild Executions (Workflow Runs)
-- ============================================================================

-- Tracks individual workflow execution runs
CREATE TABLE IF NOT EXISTS "assistbuild_executions" (
  "id" VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  "workflow_id" VARCHAR NOT NULL REFERENCES "assistbuild_workflows"("id") ON DELETE CASCADE,
  "tenant_id" VARCHAR NOT NULL,
  
  -- Execution state
  "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
  -- Status flow: 'pending' → 'running' → 'completed' | 'failed' | 'cancelled'
  
  "environment" VARCHAR(20) NOT NULL,
  -- Must match workflow environment (or be sandbox for testing)
  
  -- Trigger information
  "triggered_by" VARCHAR(20) NOT NULL DEFAULT 'manual',
  -- Phase 1: always 'manual'
  "trigger_user_id" VARCHAR NOT NULL,
  "trigger_data" JSONB,
  -- Input data provided when workflow was triggered
  
  -- Execution progress
  "current_node_id" VARCHAR(255),
  -- Which node is currently executing
  "execution_context" JSONB DEFAULT '{}',
  -- Stores outputs from each node:
  -- {
  --   "nodeOutputs": {
  --     "node_1": { "output": {...} },
  --     "node_2": { "output": {...} }
  --   }
  -- }
  
  -- Timing metrics
  "started_at" TIMESTAMPTZ,
  "completed_at" TIMESTAMPTZ,
  "duration_ms" INTEGER,
  
  -- Error tracking
  "error_message" TEXT,
  "error_node_id" VARCHAR(255),
  -- Which node caused the failure
  "error_stack" TEXT,
  "retry_count" INTEGER NOT NULL DEFAULT 0,
  
  -- Metadata
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "metadata" JSONB,
  
  -- Constraints
  CONSTRAINT "check_assistbuild_execution_status" 
    CHECK ("status" IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  CONSTRAINT "check_assistbuild_execution_environment" 
    CHECK ("environment" IN ('sandbox', 'production'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS "idx_assistbuild_executions_workflow" 
  ON "assistbuild_executions"("workflow_id");
CREATE INDEX IF NOT EXISTS "idx_assistbuild_executions_tenant" 
  ON "assistbuild_executions"("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_assistbuild_executions_status" 
  ON "assistbuild_executions"("status");
CREATE INDEX IF NOT EXISTS "idx_assistbuild_executions_environment" 
  ON "assistbuild_executions"("environment");
CREATE INDEX IF NOT EXISTS "idx_assistbuild_executions_user" 
  ON "assistbuild_executions"("trigger_user_id");
CREATE INDEX IF NOT EXISTS "idx_assistbuild_executions_started_at" 
  ON "assistbuild_executions"("started_at" DESC);

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS "idx_assistbuild_executions_workflow_status" 
  ON "assistbuild_executions"("workflow_id", "status");
CREATE INDEX IF NOT EXISTS "idx_assistbuild_executions_tenant_status" 
  ON "assistbuild_executions"("tenant_id", "status");

-- Comments
COMMENT ON TABLE "assistbuild_executions" IS 'AssistBuild workflow execution runs (one per workflow run)';
COMMENT ON COLUMN "assistbuild_executions"."execution_context" IS 'Stores intermediate node outputs and runtime variables';
COMMENT ON COLUMN "assistbuild_executions"."current_node_id" IS 'Currently executing node (for progress tracking)';


-- ============================================================================
-- PART 3: AssistBuild Execution Logs (Node-Level Logs)
-- ============================================================================

-- Detailed logs for each node execution within a workflow run
CREATE TABLE IF NOT EXISTS "assistbuild_execution_logs" (
  "id" VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  "execution_id" VARCHAR NOT NULL REFERENCES "assistbuild_executions"("id") ON DELETE CASCADE,
  "tenant_id" VARCHAR NOT NULL,
  
  -- Node identification
  "node_id" VARCHAR(255) NOT NULL,
  -- Node ID from workflow definition
  "node_type" VARCHAR(50) NOT NULL,
  -- 'manual_trigger' | 'crud_record' (Phase 1)
  "node_name" VARCHAR(255),
  -- User-friendly node name from workflow
  
  -- Execution result
  "status" VARCHAR(20) NOT NULL,
  -- Status: 'running' | 'success' | 'failed' | 'skipped'
  
  -- Data flow (inputs and outputs)
  "input_data" JSONB,
  -- What data the node received
  "output_data" JSONB,
  -- What data the node produced
  
  -- Error tracking
  "error_message" TEXT,
  "error_stack" TEXT,
  
  -- Timing metrics
  "started_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "completed_at" TIMESTAMPTZ,
  "duration_ms" INTEGER,
  
  -- Metadata
  "metadata" JSONB,
  
  -- Constraints
  CONSTRAINT "check_assistbuild_log_status" 
    CHECK ("status" IN ('running', 'success', 'failed', 'skipped'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS "idx_assistbuild_logs_execution" 
  ON "assistbuild_execution_logs"("execution_id");
CREATE INDEX IF NOT EXISTS "idx_assistbuild_logs_tenant" 
  ON "assistbuild_execution_logs"("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_assistbuild_logs_node_id" 
  ON "assistbuild_execution_logs"("node_id");
CREATE INDEX IF NOT EXISTS "idx_assistbuild_logs_status" 
  ON "assistbuild_execution_logs"("status");
CREATE INDEX IF NOT EXISTS "idx_assistbuild_logs_started_at" 
  ON "assistbuild_execution_logs"("started_at" DESC);

-- Composite index for common queries (execution + node)
CREATE INDEX IF NOT EXISTS "idx_assistbuild_logs_execution_node" 
  ON "assistbuild_execution_logs"("execution_id", "node_id");

-- Comments
COMMENT ON TABLE "assistbuild_execution_logs" IS 'Detailed logs for each node execution within a workflow run';
COMMENT ON COLUMN "assistbuild_execution_logs"."input_data" IS 'Input data received by the node (after variable resolution)';
COMMENT ON COLUMN "assistbuild_execution_logs"."output_data" IS 'Output data produced by the node (stored in execution context)';


-- ============================================================================
-- PART 4: Views for Analytics and Monitoring
-- ============================================================================

-- View: Latest executions with workflow info
CREATE OR REPLACE VIEW "v_assistbuild_executions_latest" AS
SELECT 
  e."id" AS "execution_id",
  e."workflow_id",
  w."name" AS "workflow_name",
  w."environment" AS "workflow_environment",
  e."status" AS "execution_status",
  e."environment" AS "execution_environment",
  e."triggered_by",
  e."trigger_user_id",
  e."started_at",
  e."completed_at",
  e."duration_ms",
  e."error_message",
  e."error_node_id",
  e."tenant_id",
  -- Node statistics
  (
    SELECT COUNT(*) 
    FROM "assistbuild_execution_logs" l 
    WHERE l."execution_id" = e."id" AND l."status" = 'success'
  ) AS "successful_nodes",
  (
    SELECT COUNT(*) 
    FROM "assistbuild_execution_logs" l 
    WHERE l."execution_id" = e."id" AND l."status" = 'failed'
  ) AS "failed_nodes",
  (
    SELECT COUNT(*) 
    FROM "assistbuild_execution_logs" l 
    WHERE l."execution_id" = e."id"
  ) AS "total_nodes"
FROM "assistbuild_executions" e
JOIN "assistbuild_workflows" w ON w."id" = e."workflow_id"
ORDER BY e."started_at" DESC;

COMMENT ON VIEW "v_assistbuild_executions_latest" IS 'Latest workflow executions with workflow info and node statistics';


-- View: Workflow success rate (last 30 days)
CREATE OR REPLACE VIEW "v_assistbuild_workflow_stats" AS
SELECT 
  w."id" AS "workflow_id",
  w."name" AS "workflow_name",
  w."status" AS "workflow_status",
  w."environment",
  w."tenant_id",
  -- Execution counts
  COUNT(e."id") AS "total_executions",
  COUNT(CASE WHEN e."status" = 'completed' THEN 1 END) AS "successful_executions",
  COUNT(CASE WHEN e."status" = 'failed' THEN 1 END) AS "failed_executions",
  COUNT(CASE WHEN e."status" = 'running' THEN 1 END) AS "running_executions",
  -- Success rate
  ROUND(
    100.0 * COUNT(CASE WHEN e."status" = 'completed' THEN 1 END) / 
    NULLIF(COUNT(e."id"), 0),
    2
  ) AS "success_rate_percent",
  -- Timing
  AVG(e."duration_ms") AS "avg_duration_ms",
  MAX(e."started_at") AS "last_execution_at",
  -- Workflow metadata
  w."created_at" AS "workflow_created_at",
  w."created_by"
FROM "assistbuild_workflows" w
LEFT JOIN "assistbuild_executions" e 
  ON e."workflow_id" = w."id" 
  AND e."started_at" > NOW() - INTERVAL '30 days'
GROUP BY w."id", w."name", w."status", w."environment", w."tenant_id", w."created_at", w."created_by";

COMMENT ON VIEW "v_assistbuild_workflow_stats" IS 'Workflow statistics and success rates (last 30 days)';


-- View: Node performance analytics
CREATE OR REPLACE VIEW "v_assistbuild_node_performance" AS
SELECT 
  l."node_type",
  l."tenant_id",
  COUNT(*) AS "total_executions",
  COUNT(CASE WHEN l."status" = 'success' THEN 1 END) AS "successful_executions",
  COUNT(CASE WHEN l."status" = 'failed' THEN 1 END) AS "failed_executions",
  ROUND(
    100.0 * COUNT(CASE WHEN l."status" = 'success' THEN 1 END) / 
    NULLIF(COUNT(*), 0),
    2
  ) AS "success_rate_percent",
  AVG(l."duration_ms") AS "avg_duration_ms",
  MIN(l."duration_ms") AS "min_duration_ms",
  MAX(l."duration_ms") AS "max_duration_ms",
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY l."duration_ms") AS "median_duration_ms",
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY l."duration_ms") AS "p95_duration_ms"
FROM "assistbuild_execution_logs" l
WHERE l."started_at" > NOW() - INTERVAL '30 days'
GROUP BY l."node_type", l."tenant_id";

COMMENT ON VIEW "v_assistbuild_node_performance" IS 'Node type performance metrics (last 30 days)';


-- ============================================================================
-- PART 5: Helper Functions
-- ============================================================================

-- Function: Get workflow execution summary
CREATE OR REPLACE FUNCTION get_assistbuild_execution_summary(
  p_execution_id VARCHAR
)
RETURNS TABLE (
  execution_id VARCHAR,
  workflow_name TEXT,
  status VARCHAR,
  total_nodes BIGINT,
  successful_nodes BIGINT,
  failed_nodes BIGINT,
  duration_ms INTEGER,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    e."id" AS execution_id,
    w."name" AS workflow_name,
    e."status",
    COUNT(l."id") AS total_nodes,
    COUNT(CASE WHEN l."status" = 'success' THEN 1 END) AS successful_nodes,
    COUNT(CASE WHEN l."status" = 'failed' THEN 1 END) AS failed_nodes,
    e."duration_ms",
    e."started_at",
    e."completed_at"
  FROM "assistbuild_executions" e
  JOIN "assistbuild_workflows" w ON w."id" = e."workflow_id"
  LEFT JOIN "assistbuild_execution_logs" l ON l."execution_id" = e."id"
  WHERE e."id" = p_execution_id
  GROUP BY e."id", w."name", e."status", e."duration_ms", e."started_at", e."completed_at";
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_assistbuild_execution_summary IS 'Get summary of workflow execution with node statistics';


-- ============================================================================
-- PART 6: Sample Data (Optional - for testing)
-- ============================================================================

-- Example workflow: Simple customer lookup
-- Uncomment to insert sample data

/*
INSERT INTO "assistbuild_workflows" ("tenant_id", "name", "description", "definition", "environment", "status", "created_by")
VALUES (
  'sample_tenant_id', -- Replace with actual tenant ID
  'Customer Lookup Example',
  'Simple workflow to look up customer by email',
  '{
    "nodes": [
      {
        "id": "node_1",
        "type": "manual_trigger",
        "name": "Start",
        "position": { "x": 100, "y": 100 },
        "config": {}
      },
      {
        "id": "node_2",
        "type": "crud_record",
        "name": "Get Customer",
        "position": { "x": 300, "y": 100 },
        "config": {
          "operation": "read",
          "entity": "customers",
          "filters": {
            "email": "{{trigger.email}}"
          },
          "limit": 1
        }
      }
    ],
    "edges": [
      {
        "id": "edge_1",
        "source": "node_1",
        "target": "node_2"
      }
    ],
    "variables": {}
  }'::jsonb,
  'sandbox',
  'draft',
  'sample_user_id' -- Replace with actual user ID
);
*/


-- ============================================================================
-- PART 7: Security & Permissions
-- ============================================================================

-- Note: Row Level Security (RLS) should be configured based on your auth system
-- Example RLS policies (uncomment and adjust as needed):

/*
-- Enable RLS
ALTER TABLE "assistbuild_workflows" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "assistbuild_executions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "assistbuild_execution_logs" ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only access workflows in their tenant
CREATE POLICY "assistbuild_workflows_tenant_isolation"
  ON "assistbuild_workflows"
  FOR ALL
  USING ("tenant_id" = current_setting('app.current_tenant_id')::VARCHAR);

CREATE POLICY "assistbuild_executions_tenant_isolation"
  ON "assistbuild_executions"
  FOR ALL
  USING ("tenant_id" = current_setting('app.current_tenant_id')::VARCHAR);

CREATE POLICY "assistbuild_logs_tenant_isolation"
  ON "assistbuild_execution_logs"
  FOR ALL
  USING ("tenant_id" = current_setting('app.current_tenant_id')::VARCHAR);
*/


-- ============================================================================
-- PART 8: Cleanup/Rollback (if needed)
-- ============================================================================

-- To rollback this migration, run:
/*
DROP VIEW IF EXISTS "v_assistbuild_node_performance";
DROP VIEW IF EXISTS "v_assistbuild_workflow_stats";
DROP VIEW IF EXISTS "v_assistbuild_executions_latest";
DROP FUNCTION IF EXISTS get_assistbuild_execution_summary(VARCHAR);
DROP TABLE IF EXISTS "assistbuild_execution_logs" CASCADE;
DROP TABLE IF EXISTS "assistbuild_executions" CASCADE;
DROP TABLE IF EXISTS "assistbuild_workflows" CASCADE;
DROP FUNCTION IF EXISTS update_assistbuild_workflows_updated_at();
*/


-- ============================================================================
-- End of Migration
-- ============================================================================

-- Grant permissions (adjust based on your database roles)
-- GRANT ALL ON "assistbuild_workflows" TO your_app_role;
-- GRANT ALL ON "assistbuild_executions" TO your_app_role;
-- GRANT ALL ON "assistbuild_execution_logs" TO your_app_role;
