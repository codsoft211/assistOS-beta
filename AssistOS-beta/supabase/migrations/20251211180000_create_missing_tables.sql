-- Migration: Create missing tables
-- Tables: client_contacts, entities, global_custom_fields, import_items, import_runs, 
--         job_sites, lead_activities, project_menu_items, recipe_lines, recipes,
--         service_line_components, service_lines, uoms, venues

-- ============================================================================
-- client_contacts
-- ============================================================================
CREATE TABLE IF NOT EXISTS "client_contacts" (
  "id" VARCHAR NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" VARCHAR NOT NULL,
  "client_id" VARCHAR NOT NULL,
  "environment" TEXT NOT NULL DEFAULT 'production',
  "first_name" VARCHAR(100),
  "last_name" VARCHAR(100),
  "full_name" VARCHAR(255),
  "email" TEXT,
  "phone" TEXT,
  "mobile" TEXT,
  "role" TEXT,
  "department" TEXT,
  "job_title" TEXT,
  "is_primary" BOOLEAN NOT NULL DEFAULT false,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "preferred_channel" TEXT DEFAULT 'email',
  "notes" TEXT,
  "created_by" VARCHAR,
  "created_at" TIMESTAMP NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "client_contacts_tenant_idx" ON "client_contacts" ("tenant_id");
CREATE INDEX IF NOT EXISTS "client_contacts_client_idx" ON "client_contacts" ("client_id");

-- ============================================================================
-- entities
-- ============================================================================
CREATE TABLE IF NOT EXISTS "entities" (
  "id" VARCHAR NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" VARCHAR NOT NULL,
  "environment" TEXT NOT NULL DEFAULT 'production',
  "type" TEXT NOT NULL,
  "first_name" VARCHAR(100),
  "last_name" VARCHAR(100),
  "full_name" VARCHAR(255),
  "company_name" VARCHAR(255),
  "nif" VARCHAR(50),
  "email" VARCHAR(255),
  "phone" VARCHAR(50),
  "alternative_phone" VARCHAR(50),
  "website" VARCHAR(255),
  "address" TEXT,
  "city" VARCHAR(100),
  "postal_code" VARCHAR(20),
  "country" VARCHAR(2) DEFAULT 'PT',
  "lifecycle_stage" VARCHAR(50) NOT NULL DEFAULT 'lead',
  "status" VARCHAR(50) NOT NULL DEFAULT 'active',
  "tags" JSONB DEFAULT '[]'::jsonb,
  "notes" TEXT,
  "metadata" JSONB,
  "created_by" VARCHAR,
  "updated_by" VARCHAR,
  "created_at" TIMESTAMP NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "entities_tenant_idx" ON "entities" ("tenant_id");
CREATE INDEX IF NOT EXISTS "entities_type_idx" ON "entities" ("type");
CREATE INDEX IF NOT EXISTS "entities_lifecycle_stage_idx" ON "entities" ("lifecycle_stage");

-- ============================================================================
-- global_custom_fields
-- ============================================================================
CREATE TABLE IF NOT EXISTS "global_custom_fields" (
  "id" VARCHAR NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" VARCHAR NOT NULL,
  "environment" TEXT NOT NULL DEFAULT 'production',
  "field_key" TEXT NOT NULL,
  "display_name" TEXT NOT NULL,
  "description" TEXT,
  "field_type" TEXT NOT NULL,
  "config" JSONB,
  "is_required" BOOLEAN NOT NULL DEFAULT false,
  "is_unique" BOOLEAN NOT NULL DEFAULT false,
  "is_searchable" BOOLEAN NOT NULL DEFAULT false,
  "is_visible" BOOLEAN NOT NULL DEFAULT true,
  "field_order" INTEGER NOT NULL DEFAULT 0,
  "category" TEXT,
  "available_in_modules" JSONB DEFAULT '[]'::jsonb,
  "is_deleted" BOOLEAN NOT NULL DEFAULT false,
  "created_by" VARCHAR NOT NULL,
  "updated_by" VARCHAR,
  "created_at" TIMESTAMP NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "global_custom_fields_tenant_idx" ON "global_custom_fields" ("tenant_id");
CREATE UNIQUE INDEX IF NOT EXISTS "global_custom_fields_tenant_key_idx" ON "global_custom_fields" ("tenant_id", "field_key", "environment");

-- ============================================================================
-- import_runs
-- ============================================================================
CREATE TABLE IF NOT EXISTS "import_runs" (
  "id" VARCHAR NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" VARCHAR NOT NULL,
  "environment" TEXT NOT NULL DEFAULT 'production',
  "connector_config_id" INTEGER,
  "connector_type" VARCHAR(50) NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
  "entity_types" JSONB NOT NULL,
  "total_items" INTEGER NOT NULL DEFAULT 0,
  "processed_items" INTEGER NOT NULL DEFAULT 0,
  "success_items" INTEGER NOT NULL DEFAULT 0,
  "failed_items" INTEGER NOT NULL DEFAULT 0,
  "skipped_items" INTEGER NOT NULL DEFAULT 0,
  "progress_message" TEXT,
  "progress_percent" INTEGER NOT NULL DEFAULT 0,
  "error_log" JSONB,
  "preferences" JSONB,
  "started_at" TIMESTAMP,
  "completed_at" TIMESTAMP,
  "started_by" VARCHAR,
  "created_at" TIMESTAMP NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "import_runs_tenant_idx" ON "import_runs" ("tenant_id");
CREATE INDEX IF NOT EXISTS "import_runs_status_idx" ON "import_runs" ("status");

-- ============================================================================
-- import_items
-- ============================================================================
CREATE TABLE IF NOT EXISTS "import_items" (
  "id" VARCHAR NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" VARCHAR NOT NULL,
  "environment" TEXT NOT NULL DEFAULT 'production',
  "import_run_id" VARCHAR NOT NULL,
  "entity_type" VARCHAR(50) NOT NULL,
  "external_id" VARCHAR(255) NOT NULL,
  "external_source" VARCHAR(50) NOT NULL,
  "local_entity_type" VARCHAR(50),
  "local_entity_id" VARCHAR(255),
  "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
  "external_data" JSONB,
  "mapped_data" JSONB,
  "error_message" TEXT,
  "imported_at" TIMESTAMP,
  "last_sync_at" TIMESTAMP,
  "created_at" TIMESTAMP NOT NULL DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "import_items_tenant_idx" ON "import_items" ("tenant_id");
CREATE INDEX IF NOT EXISTS "import_items_run_idx" ON "import_items" ("import_run_id");
CREATE INDEX IF NOT EXISTS "import_items_status_idx" ON "import_items" ("status");

-- ============================================================================
-- job_sites
-- ============================================================================
CREATE TABLE IF NOT EXISTS "job_sites" (
  "id" VARCHAR NOT NULL DEFAULT (gen_random_uuid())::text,
  "tenant_id" VARCHAR NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT,
  "site_type" TEXT NOT NULL DEFAULT 'venue',
  "address" TEXT,
  "locality" TEXT,
  "city" TEXT,
  "postal_code" TEXT,
  "country" TEXT DEFAULT 'Portugal',
  "latitude" NUMERIC(10, 7),
  "longitude" NUMERIC(10, 7),
  "contact_name" TEXT,
  "contact_phone" TEXT,
  "contact_email" TEXT,
  "max_capacity" INTEGER,
  "has_kitchen" BOOLEAN DEFAULT false,
  "has_parking" BOOLEAN DEFAULT false,
  "warehouse_id" VARCHAR,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "is_favorite" BOOLEAN NOT NULL DEFAULT false,
  "notes" TEXT,
  "metadata" JSONB,
  "environment" TEXT NOT NULL DEFAULT 'production',
  "created_at" TIMESTAMPTZ DEFAULT now(),
  "updated_at" TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "job_sites_tenant_idx" ON "job_sites" ("tenant_id");

-- ============================================================================
-- lead_activities
-- ============================================================================
CREATE TABLE IF NOT EXISTS "lead_activities" (
  "id" VARCHAR NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" VARCHAR NOT NULL,
  "lead_id" VARCHAR NOT NULL,
  "activity_type" VARCHAR(50) NOT NULL,
  "description" TEXT NOT NULL,
  "metadata" JSONB DEFAULT '{}'::jsonb,
  "user_id" VARCHAR,
  "created_at" TIMESTAMP DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "lead_activities_tenant_idx" ON "lead_activities" ("tenant_id");
CREATE INDEX IF NOT EXISTS "lead_activities_lead_idx" ON "lead_activities" ("lead_id");

-- ============================================================================
-- project_menu_items
-- ============================================================================
CREATE TABLE IF NOT EXISTS "project_menu_items" (
  "id" VARCHAR NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" VARCHAR NOT NULL,
  "environment" VARCHAR NOT NULL DEFAULT 'production',
  "project_id" VARCHAR NOT NULL,
  "product_id" VARCHAR NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'main',
  "quantity" NUMERIC(10, 2) NOT NULL DEFAULT 1,
  "unit_price" NUMERIC(10, 2),
  "notes" TEXT,
  "display_order" INTEGER DEFAULT 0,
  "created_at" TIMESTAMP NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "project_menu_items_tenant_idx" ON "project_menu_items" ("tenant_id");
CREATE INDEX IF NOT EXISTS "project_menu_items_project_idx" ON "project_menu_items" ("project_id");

-- ============================================================================
-- uoms (Units of Measure)
-- ============================================================================
CREATE TABLE IF NOT EXISTS "uoms" (
  "id" VARCHAR NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" VARCHAR,
  "name" TEXT NOT NULL,
  "symbol" TEXT NOT NULL,
  "uom_type" TEXT NOT NULL,
  "ratio_to_base" NUMERIC(15, 6) NOT NULL DEFAULT 1,
  "is_base" BOOLEAN NOT NULL DEFAULT false,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "environment" TEXT NOT NULL DEFAULT 'production',
  "created_at" TIMESTAMP NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "uoms_tenant_idx" ON "uoms" ("tenant_id");
CREATE INDEX IF NOT EXISTS "uoms_type_idx" ON "uoms" ("uom_type");

-- ============================================================================
-- recipes
-- ============================================================================
CREATE TABLE IF NOT EXISTS "recipes" (
  "id" VARCHAR NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" VARCHAR NOT NULL,
  "product_id" VARCHAR NOT NULL,
  "name" TEXT NOT NULL,
  "version" TEXT NOT NULL DEFAULT '1.0',
  "yield_qty" NUMERIC(15, 4) NOT NULL DEFAULT 1,
  "yield_uom_id" VARCHAR,
  "total_cost" NUMERIC(15, 4),
  "cost_per_unit" NUMERIC(15, 4),
  "prep_time_minutes" INTEGER,
  "cook_time_minutes" INTEGER,
  "total_time_minutes" INTEGER,
  "labor_minutes" INTEGER,
  "loss_factor" NUMERIC(5, 2) DEFAULT 0,
  "energy_cost_factor" NUMERIC(10, 4),
  "instructions" TEXT,
  "notes" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "is_default" BOOLEAN NOT NULL DEFAULT false,
  "metadata" JSONB,
  "created_by" VARCHAR,
  "environment" TEXT NOT NULL DEFAULT 'production',
  "created_at" TIMESTAMP NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "recipes_tenant_idx" ON "recipes" ("tenant_id");
CREATE INDEX IF NOT EXISTS "recipes_product_idx" ON "recipes" ("product_id");

-- ============================================================================
-- recipe_lines
-- ============================================================================
CREATE TABLE IF NOT EXISTS "recipe_lines" (
  "id" VARCHAR NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" VARCHAR NOT NULL,
  "recipe_id" VARCHAR NOT NULL,
  "component_id" VARCHAR NOT NULL,
  "qty" NUMERIC(15, 4) NOT NULL,
  "uom_id" VARCHAR,
  "unit_cost" NUMERIC(15, 4),
  "line_cost" NUMERIC(15, 4),
  "loss_percent" NUMERIC(5, 2) DEFAULT 0,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "notes" TEXT,
  "environment" TEXT NOT NULL DEFAULT 'production',
  "created_at" TIMESTAMP NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "recipe_lines_tenant_idx" ON "recipe_lines" ("tenant_id");
CREATE INDEX IF NOT EXISTS "recipe_lines_recipe_idx" ON "recipe_lines" ("recipe_id");

-- ============================================================================
-- service_lines
-- ============================================================================
CREATE TABLE IF NOT EXISTS "service_lines" (
  "id" VARCHAR(255) NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" VARCHAR(255) NOT NULL,
  "environment" TEXT NOT NULL DEFAULT 'production',
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "category" TEXT,
  "tier" TEXT,
  "pricing_type" TEXT NOT NULL DEFAULT 'per_person',
  "base_price" NUMERIC(10, 2) NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'EUR',
  "min_items" INTEGER,
  "max_items" INTEGER,
  "is_configurable" BOOLEAN NOT NULL DEFAULT false,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "image_url" TEXT,
  "notes" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "service_lines_tenant_idx" ON "service_lines" ("tenant_id");
CREATE UNIQUE INDEX IF NOT EXISTS "service_lines_tenant_code_idx" ON "service_lines" ("tenant_id", "code", "environment");

-- ============================================================================
-- service_line_components
-- ============================================================================
CREATE TABLE IF NOT EXISTS "service_line_components" (
  "id" VARCHAR(255) NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" VARCHAR(255) NOT NULL,
  "service_line_id" VARCHAR(255) NOT NULL,
  "product_id" VARCHAR(255) NOT NULL,
  "is_default" BOOLEAN NOT NULL DEFAULT false,
  "is_optional" BOOLEAN NOT NULL DEFAULT true,
  "qty_per_unit" NUMERIC(10, 3) NOT NULL DEFAULT 1,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "notes" TEXT,
  "environment" TEXT NOT NULL DEFAULT 'production',
  "created_at" TIMESTAMP NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "service_line_components_tenant_idx" ON "service_line_components" ("tenant_id");
CREATE INDEX IF NOT EXISTS "service_line_components_service_line_idx" ON "service_line_components" ("service_line_id");

-- ============================================================================
-- venues
-- ============================================================================
CREATE TABLE IF NOT EXISTS "venues" (
  "id" VARCHAR NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" VARCHAR NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT,
  "venue_type" TEXT NOT NULL DEFAULT 'venue',
  "address" TEXT,
  "locality" TEXT,
  "city" TEXT,
  "postal_code" TEXT,
  "country" TEXT DEFAULT 'Portugal',
  "latitude" NUMERIC(10, 7),
  "longitude" NUMERIC(10, 7),
  "contact_name" TEXT,
  "contact_phone" TEXT,
  "contact_email" TEXT,
  "max_capacity" INTEGER,
  "has_kitchen" BOOLEAN DEFAULT false,
  "has_parking" BOOLEAN DEFAULT false,
  "warehouse_id" VARCHAR,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "is_favorite" BOOLEAN NOT NULL DEFAULT false,
  "notes" TEXT,
  "metadata" JSONB,
  "environment" TEXT NOT NULL DEFAULT 'sandbox',
  "created_at" TIMESTAMP NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "venues_tenant_idx" ON "venues" ("tenant_id");

