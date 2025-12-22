CREATE TABLE "agent_budgets" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"agent_key" text,
	"budget_type" text NOT NULL,
	"max_runs" integer,
	"max_cost_eur" numeric(10, 4),
	"max_tokens" integer,
	"current_runs" integer DEFAULT 0 NOT NULL,
	"current_cost_eur" numeric(10, 4) DEFAULT '0' NOT NULL,
	"current_tokens" integer DEFAULT 0 NOT NULL,
	"period_started_at" timestamp DEFAULT now() NOT NULL,
	"action_on_exceed" text DEFAULT 'alert' NOT NULL,
	"alert_emails" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_executions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"agent_key" text NOT NULL,
	"agent_version" text NOT NULL,
	"status" text DEFAULT 'running',
	"input" jsonb,
	"output" jsonb,
	"error" text,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"duration" integer,
	"tokens_used" integer,
	"cost" numeric(10, 4),
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "agent_feedback" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" varchar NOT NULL,
	"conversation_id" varchar,
	"agent_action" varchar NOT NULL,
	"original_params" jsonb,
	"user_correction" text NOT NULL,
	"correction_type" varchar NOT NULL,
	"context" text,
	"learned_pattern" text,
	"applied" boolean DEFAULT false NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_handoffs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar,
	"conversation_id" varchar NOT NULL,
	"from_agent_id" varchar NOT NULL,
	"to_agent_id" varchar NOT NULL,
	"reason" text NOT NULL,
	"context" jsonb NOT NULL,
	"handoff_message" text,
	"status" text DEFAULT 'initiated' NOT NULL,
	"user_approval" boolean,
	"completion_notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "agent_interactions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar,
	"from_agent_id" varchar NOT NULL,
	"to_agent_id" varchar NOT NULL,
	"conversation_id" varchar,
	"interaction_type" text NOT NULL,
	"content" text NOT NULL,
	"context" jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"response" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"resolved_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "agent_learnings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar,
	"agent_id" varchar NOT NULL,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"source_type" text NOT NULL,
	"source_id" varchar,
	"confidence" integer DEFAULT 50 NOT NULL,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"success_rate" numeric(5, 2),
	"tags" jsonb,
	"related_learnings" jsonb,
	"metadata" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_used_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "agent_role_assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"agent_key" varchar,
	"role" varchar NOT NULL,
	"granted_by" varchar NOT NULL,
	"granted_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_schedules" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"agent_type" text NOT NULL,
	"agent_name" text NOT NULL,
	"cron_schedule" text NOT NULL,
	"timezone" text DEFAULT 'Europe/Lisbon' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_run_at" timestamp,
	"last_run_status" text,
	"last_run_error" text,
	"next_run_at" timestamp,
	"config" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_secrets" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" varchar NOT NULL,
	"key" varchar(255) NOT NULL,
	"encrypted_value" text NOT NULL,
	"description" text,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_rotated_at" timestamp,
	"last_rotated_by" varchar,
	"expires_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_state" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"agent_key" text NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_tags" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" varchar NOT NULL,
	"tag" text NOT NULL,
	"type" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_versions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar,
	"key" text NOT NULL,
	"version" text NOT NULL,
	"status" text DEFAULT 'draft',
	"definition" jsonb NOT NULL,
	"changelog" text,
	"deployed_by" varchar,
	"deployed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_workflows" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"trigger_type" text NOT NULL,
	"trigger_config" jsonb,
	"steps" jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"execution_count" integer DEFAULT 0 NOT NULL,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agents_library" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"base_system_prompt" text NOT NULL,
	"default_model" text DEFAULT 'gpt-4o' NOT NULL,
	"category" text,
	"created_by" varchar,
	"is_public" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_integrations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"integration_key" varchar NOT NULL,
	"integration_name" text NOT NULL,
	"base_url" text NOT NULL,
	"auth_type" varchar NOT NULL,
	"auth_config" jsonb,
	"endpoints" jsonb NOT NULL,
	"secret_keys" jsonb,
	"is_active" boolean DEFAULT true,
	"environment" varchar NOT NULL,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"actor_user_id" varchar NOT NULL,
	"target_user_id" varchar,
	"action" text NOT NULL,
	"metadata" jsonb,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_accounts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"bank_name" text NOT NULL,
	"account_name" text NOT NULL,
	"account_number" text NOT NULL,
	"iban" varchar(34) NOT NULL,
	"swift" varchar(11),
	"currency" text DEFAULT 'EUR' NOT NULL,
	"account_type" text DEFAULT 'checking' NOT NULL,
	"account_code" text,
	"current_balance" numeric(12, 2) DEFAULT '0',
	"is_active" boolean DEFAULT true NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"notes" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_reconciliations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"bank_name" text NOT NULL,
	"account_number" text NOT NULL,
	"statement_date" timestamp NOT NULL,
	"opening_balance" numeric(12, 2) NOT NULL,
	"closing_balance" numeric(12, 2) NOT NULL,
	"reconciled_transactions" jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "bank_statement_transactions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"bank_reconciliation_id" varchar NOT NULL,
	"transaction_date" timestamp NOT NULL,
	"value_date" timestamp,
	"description" text NOT NULL,
	"reference" text,
	"debit_amount" numeric(12, 2),
	"credit_amount" numeric(12, 2),
	"balance" numeric(12, 2),
	"matched_payment_id" varchar,
	"match_confidence" integer,
	"matched_manually" boolean DEFAULT false,
	"source_format" text NOT NULL,
	"raw_data" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blueprint_health" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"blueprint_version_id" varchar NOT NULL,
	"deployments_count" integer DEFAULT 0,
	"successful_deployments" integer DEFAULT 0,
	"avg_error_rate_last_7d" numeric(5, 2),
	"avg_latency_ms" integer,
	"last_deployment_at" timestamp,
	"human_override_allowed" boolean DEFAULT true,
	"recommended_for_auto_deploy" boolean DEFAULT false,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blueprint_improvements" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"blueprint_id" varchar NOT NULL,
	"source_tenant_id" varchar,
	"improvement_type" text,
	"description" text NOT NULL,
	"code_diff" text,
	"impact_score" integer,
	"status" text DEFAULT 'proposed',
	"implemented_in_version_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blueprint_signatures" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"blueprint_id" varchar NOT NULL,
	"capability_tags" jsonb NOT NULL,
	"required_entities" jsonb NOT NULL,
	"optional_entities" jsonb,
	"requires_external_channel" boolean DEFAULT false,
	"risk_level_default" text DEFAULT 'medium' NOT NULL,
	"ideal_execution_tier" text,
	"test_strategy" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blueprint_templates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category" text,
	"template_code" jsonb,
	"parameters" jsonb,
	"is_public" boolean DEFAULT false,
	"created_by_tenant_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blueprint_usage_stats" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"blueprint_version_id" varchar NOT NULL,
	"tenant_id" varchar NOT NULL,
	"deployment_count" integer DEFAULT 0,
	"success_rate" numeric(5, 2),
	"avg_user_satisfaction" integer,
	"first_deployed_at" timestamp,
	"last_used_at" timestamp,
	"total_executions" integer DEFAULT 0,
	"total_errors" integer DEFAULT 0,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blueprint_versions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"blueprint_id" varchar NOT NULL,
	"version_number" integer NOT NULL,
	"version_tag" text,
	"changes_summary" text,
	"improved_from_version_id" varchar,
	"is_stable" boolean DEFAULT false,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blueprints" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"industry" text,
	"business_size" text,
	"tags" jsonb,
	"blueprint_data" jsonb NOT NULL,
	"use_count" integer DEFAULT 0 NOT NULL,
	"success_score" integer DEFAULT 0 NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"is_template" boolean DEFAULT false NOT NULL,
	"source_tenant_id" varchar,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budget_alerts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"budget_id" varchar NOT NULL,
	"tenant_id" varchar NOT NULL,
	"alert_type" text NOT NULL,
	"triggered_at" timestamp DEFAULT now() NOT NULL,
	"resolved" boolean DEFAULT false NOT NULL,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "budget_menu_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"cost_per_pax" numeric(10, 2) NOT NULL,
	"category" text NOT NULL,
	"is_optional" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"display_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budget_package_items" (
	"package_id" varchar NOT NULL,
	"menu_item_id" varchar NOT NULL,
	"is_included_by_default" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budget_packages" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"margin_percentage" numeric(5, 2) DEFAULT '30.00' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"display_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budget_quote_items" (
	"quote_id" varchar NOT NULL,
	"menu_item_id" varchar NOT NULL,
	"is_included" boolean DEFAULT true NOT NULL,
	"quantity_multiplier" numeric(5, 2) DEFAULT '1.00',
	"custom_cost_per_pax" numeric(10, 2),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budget_quote_versions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"quote_id" varchar NOT NULL,
	"version_number" integer NOT NULL,
	"base_version" integer,
	"snapshot" jsonb NOT NULL,
	"change_reason" text,
	"changes_summary" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_by_user_id" varchar NOT NULL,
	"approved_by" varchar,
	"approved_at" timestamp,
	"rejected_by" varchar,
	"rejected_at" timestamp,
	"rejection_reason" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budget_quotes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"lead_id" varchar NOT NULL,
	"package_id" varchar NOT NULL,
	"quote_number" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"num_pax" integer NOT NULL,
	"event_location" text,
	"distance_km" numeric(10, 2),
	"custom_margin_percentage" numeric(5, 2),
	"calculated_staff" jsonb,
	"calculated_transport" numeric(10, 2),
	"calculated_menu_cost" numeric(10, 2),
	"subtotal" numeric(15, 2),
	"margin_amount" numeric(15, 2),
	"total_without_vat" numeric(15, 2),
	"total_with_vat" numeric(15, 2),
	"notes" text,
	"internal_notes" text,
	"sent_at" timestamp,
	"approved_at" timestamp,
	"converted_to_project_id" varchar,
	"created_by_user_id" varchar NOT NULL,
	"parent_id" varchar,
	"root_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budget_staff_roles" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"package_id" varchar NOT NULL,
	"role_name" text NOT NULL,
	"cost_per_hour" numeric(10, 2) NOT NULL,
	"default_hours" integer DEFAULT 20,
	"is_fixed_quantity" boolean DEFAULT false NOT NULL,
	"fixed_quantity" integer,
	"pax_per_staff" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budget_transport_rules" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"package_id" varchar NOT NULL,
	"cost_per_km" numeric(10, 2) DEFAULT '0.40' NOT NULL,
	"staff_per_vehicle" integer DEFAULT 5,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_blueprints" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"conversational_source" varchar,
	"approved_by" varchar,
	"status" text DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"previous_version_id" varchar,
	"implementation_status" text,
	"related_blueprints" jsonb,
	"visual_diagram" text,
	"stakeholder_notes" jsonb,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"approved_at" timestamp,
	"implemented_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "catering_kitchen_workflows" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"work_order_id" varchar NOT NULL,
	"operation_id" varchar,
	"station_name" text,
	"chef_assigned" varchar,
	"temperature" numeric(5, 2),
	"temperature_unit" text,
	"cooking_method" text,
	"equipment_used" jsonb,
	"allergens" jsonb,
	"haccp_points" jsonb,
	"prep_notes" text,
	"plating_instructions" text,
	"holding_temperature" numeric(5, 2),
	"service_time" timestamp,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catering_logistics" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"prep_list_id" varchar NOT NULL,
	"work_order_id" varchar,
	"transport_type" text NOT NULL,
	"vehicle_assigned" text,
	"driver_assigned" varchar,
	"loading_time" timestamp,
	"departure_time" timestamp,
	"estimated_arrival" timestamp,
	"actual_arrival" timestamp,
	"unloading_time" timestamp,
	"return_time" timestamp,
	"equipment_transported" jsonb,
	"temperature_log" jsonb,
	"delivery_photos" jsonb,
	"delivery_signature" text,
	"delivery_notes" text,
	"fuel_cost" numeric(10, 2),
	"tolls_cost" numeric(10, 2),
	"status" text DEFAULT 'scheduled' NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catering_prep_lists" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"work_order_id" varchar NOT NULL,
	"event_id" varchar,
	"event_date" timestamp NOT NULL,
	"number_of_pax" integer NOT NULL,
	"service_type" text,
	"menu_type" text,
	"dietary_restrictions" jsonb,
	"setup_time" timestamp,
	"service_start_time" timestamp,
	"service_end_time" timestamp,
	"venue" text,
	"venue_address" text,
	"venue_contact_person" text,
	"venue_contact_phone" text,
	"special_instructions" text,
	"kitchen_notes" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chart_of_accounts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"account_type" text NOT NULL,
	"parent_code" text,
	"level" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"normal_balance" text NOT NULL,
	"description" text,
	"taxonomy_reference" text,
	"grouping_code" text,
	"grouping_category" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar,
	"environment" text DEFAULT 'production' NOT NULL,
	"name" text,
	"email" text,
	"phone" text,
	"company" text,
	"nif" text,
	"address" text,
	"city" text,
	"postal_code" text,
	"country" text,
	"district" text,
	"website" text,
	"other_info" jsonb,
	"status" text DEFAULT 'Ativo' NOT NULL,
	"toconline_customer_id" text,
	"toconline_synced_at" timestamp,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "code_generation_audit" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"execution_plan_id" varchar,
	"user_id" varchar NOT NULL,
	"action" text NOT NULL,
	"file_path" text,
	"code_snapshot" text,
	"blueprint_id" varchar,
	"risk_level" text,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "code_validation_results" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"execution_plan_id" varchar NOT NULL,
	"file_path" text NOT NULL,
	"severity" text NOT NULL,
	"rule_id" text,
	"message" text NOT NULL,
	"line_number" integer,
	"fix_applied" boolean DEFAULT false,
	"fix_description" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commercial_activities" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"lead_id" varchar,
	"activity_type" text NOT NULL,
	"subject" text,
	"description" text,
	"outcome" text,
	"duration" integer,
	"scheduled_at" timestamp,
	"completed_at" timestamp,
	"created_by" varchar NOT NULL,
	"assigned_to" varchar,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commercial_agent_configs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar,
	"agent_key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category" text NOT NULL,
	"system_prompt" text,
	"capabilities" jsonb,
	"trigger_conditions" jsonb,
	"action_config" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_global" boolean DEFAULT false NOT NULL,
	"execution_count" integer DEFAULT 0 NOT NULL,
	"success_count" integer DEFAULT 0 NOT NULL,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"average_execution_time" integer,
	"last_executed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commercial_agent_executions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"agent_config_id" varchar NOT NULL,
	"lead_id" varchar,
	"trigger_type" text NOT NULL,
	"input_data" jsonb,
	"output_data" jsonb,
	"status" text NOT NULL,
	"execution_time_ms" integer,
	"error_message" text,
	"error_stack" text,
	"tokens_used" integer,
	"cost" numeric(10, 6),
	"metadata" jsonb,
	"executed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commercial_ai_suggestions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"lead_id" varchar,
	"email_event_id" varchar,
	"suggested_text" text NOT NULL,
	"suggested_subject" text,
	"suggestion_type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"approved_by" varchar,
	"approved_at" timestamp,
	"sent_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commercial_automation_rules" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category" text NOT NULL,
	"trigger_type" text NOT NULL,
	"trigger_conditions" jsonb NOT NULL,
	"actions" jsonb NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"execution_count" integer DEFAULT 0 NOT NULL,
	"success_rate" numeric(5, 2),
	"last_executed_at" timestamp,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commercial_budget_alerts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"quote_id" varchar,
	"alert_type" text NOT NULL,
	"severity" text NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"threshold" numeric(10, 2),
	"actual_value" numeric(10, 2),
	"is_resolved" boolean DEFAULT false NOT NULL,
	"resolved_at" timestamp,
	"resolved_by" varchar,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commercial_conversion_metrics" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"pipeline_stage_id" varchar,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"leads_entered" integer DEFAULT 0 NOT NULL,
	"leads_converted" integer DEFAULT 0 NOT NULL,
	"leads_lost" integer DEFAULT 0 NOT NULL,
	"conversion_rate" numeric(5, 2),
	"average_time_in_stage" integer,
	"average_deal_value" numeric(15, 2),
	"total_revenue" numeric(15, 2),
	"calculated_at" timestamp DEFAULT now() NOT NULL,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "commercial_email_events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"lead_id" varchar,
	"message_id" text,
	"type" text NOT NULL,
	"action" text,
	"metadata" jsonb,
	"email_body" text,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commercial_email_sequences" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"trigger_type" text NOT NULL,
	"trigger_conditions" jsonb,
	"steps" jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"total_sent" integer DEFAULT 0 NOT NULL,
	"total_opened" integer DEFAULT 0 NOT NULL,
	"total_clicked" integer DEFAULT 0 NOT NULL,
	"total_replied" integer DEFAULT 0 NOT NULL,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commercial_email_templates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category" text,
	"subject" text NOT NULL,
	"body_html" text NOT NULL,
	"body_text" text,
	"variables" jsonb,
	"is_shared" boolean DEFAULT false NOT NULL,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commercial_forecasts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"forecast_period" text NOT NULL,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"total_pipeline_value" numeric(15, 2),
	"weighted_pipeline_value" numeric(15, 2),
	"expected_revenue" numeric(15, 2),
	"actual_revenue" numeric(15, 2),
	"leads_in_pipeline" integer,
	"expected_wins" integer,
	"actual_wins" integer,
	"forecast_accuracy" numeric(5, 2),
	"breakdown" jsonb,
	"generated_by" text,
	"generated_at" timestamp DEFAULT now() NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commercial_lead_scoring" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"lead_id" varchar NOT NULL,
	"score" integer NOT NULL,
	"score_breakdown" jsonb,
	"engagement_score" integer,
	"value_score" integer,
	"urgency_score" integer,
	"quality_score" integer,
	"ai_model_version" text,
	"scored_at" timestamp DEFAULT now() NOT NULL,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "commercial_lead_sources" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"source_name" text NOT NULL,
	"source_category" text,
	"description" text,
	"total_leads" integer DEFAULT 0 NOT NULL,
	"qualified_leads" integer DEFAULT 0 NOT NULL,
	"converted_leads" integer DEFAULT 0 NOT NULL,
	"total_revenue" numeric(15, 2) DEFAULT '0',
	"average_deal_value" numeric(15, 2),
	"conversion_rate" numeric(5, 2),
	"cost_per_lead" numeric(10, 2),
	"total_cost" numeric(15, 2),
	"roi" numeric(10, 2),
	"is_active" boolean DEFAULT true NOT NULL,
	"last_calculated_at" timestamp,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commercial_leads" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"proposal_number" text,
	"description" text,
	"original_request" text,
	"contact_name" text,
	"contact_phone" text,
	"contact_email" text,
	"status" text DEFAULT 'Proposta Enviada' NOT NULL,
	"owner_id" varchar,
	"lead_source" text,
	"event_type" text,
	"location" text,
	"event_date" timestamp,
	"event_year" integer,
	"num_pax" integer,
	"value_per_pax" numeric(10, 2),
	"budget_total" numeric(15, 2),
	"comments" text,
	"responded_at" timestamp,
	"project_id" varchar,
	"parent_id" varchar,
	"root_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commercial_pipeline" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"stage_order" integer NOT NULL,
	"color" text,
	"icon" text,
	"win_probability" integer DEFAULT 0 NOT NULL,
	"is_win_stage" boolean DEFAULT false NOT NULL,
	"is_lost_stage" boolean DEFAULT false NOT NULL,
	"automations" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commercial_quote_versions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"lead_id" varchar NOT NULL,
	"version_no" integer NOT NULL,
	"version_label" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"source_email_id" text,
	"payload" jsonb,
	"file_url" text,
	"sent_at" timestamp,
	"sent_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commercial_tasks" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"lead_id" varchar,
	"title" text NOT NULL,
	"description" text,
	"task_type" text NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"due_date" timestamp,
	"completed_at" timestamp,
	"assigned_to" varchar,
	"created_by" varchar NOT NULL,
	"is_automated" boolean DEFAULT false NOT NULL,
	"automation_rule_id" varchar,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_info" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"name" text,
	"brand_name" text,
	"legal_name" text,
	"nif" text,
	"address" text,
	"city" text,
	"postal_code" text,
	"country" text DEFAULT 'Portugal',
	"phone" text,
	"email" text,
	"website" text,
	"logo" text,
	"sector" text,
	"business_description" text,
	"business_type" text,
	"additional_info" jsonb,
	"brand_files" jsonb,
	"onboarding_context" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "config_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" varchar NOT NULL,
	"requested_by" varchar NOT NULL,
	"request_type" varchar NOT NULL,
	"description" text NOT NULL,
	"priority" varchar DEFAULT 'medium',
	"status" varchar DEFAULT 'pending',
	"assigned_to" varchar,
	"created_at" timestamp DEFAULT now(),
	"resolved_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "configuration_checkpoints" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"environment" text NOT NULL,
	"version" integer NOT NULL,
	"change_type" text NOT NULL,
	"entity_type" text,
	"entity_id" varchar,
	"change_summary" text NOT NULL,
	"before_snapshot" jsonb,
	"after_snapshot" jsonb NOT NULL,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "configuration_patterns" (
	"id" serial PRIMARY KEY NOT NULL,
	"business_type" varchar(100),
	"entity_key" varchar(100),
	"entity_name" varchar(200),
	"fields" jsonb,
	"usage_count" integer DEFAULT 1,
	"last_used" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "conversation_insights" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar,
	"tenant_id" varchar NOT NULL,
	"agent_type" varchar(50) NOT NULL,
	"insight" text NOT NULL,
	"category" varchar(50),
	"confidence" real DEFAULT 1,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar,
	"environment" text DEFAULT 'production' NOT NULL,
	"title" text NOT NULL,
	"agent_type" text NOT NULL,
	"scope" text DEFAULT 'module' NOT NULL,
	"module_slug" text,
	"module" text,
	"type" text,
	"tags" jsonb,
	"is_read" boolean DEFAULT false NOT NULL,
	"read_at" timestamp,
	"priority" text DEFAULT 'normal' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"current_agent_id" varchar,
	"current_phase" integer DEFAULT 1,
	"phase_data" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversion_agents" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"document_type" text NOT NULL,
	"supplier_filter" text,
	"template_id" varchar,
	"priority" integer DEFAULT 50 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"learning_enabled" boolean DEFAULT true NOT NULL,
	"auto_actions" jsonb,
	"accuracy" numeric(5, 2),
	"execution_count" integer DEFAULT 0 NOT NULL,
	"success_count" integer DEFAULT 0 NOT NULL,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "custom_agents" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"name" text NOT NULL,
	"agent_type" text NOT NULL,
	"description" text NOT NULL,
	"database_slug" text NOT NULL,
	"system_prompt" text,
	"capabilities" jsonb NOT NULL,
	"max_tokens" integer DEFAULT 16384 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "custom_agents_agent_type_unique" UNIQUE("agent_type")
);
--> statement-breakpoint
CREATE TABLE "custom_entities" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"environment" text DEFAULT 'production' NOT NULL,
	"entity_key" text NOT NULL,
	"display_name" text NOT NULL,
	"display_name_plural" text NOT NULL,
	"description" text,
	"icon" text,
	"color" text,
	"category" text,
	"enable_workflow" boolean DEFAULT true NOT NULL,
	"enable_comments" boolean DEFAULT true NOT NULL,
	"enable_attachments" boolean DEFAULT true NOT NULL,
	"enable_history" boolean DEFAULT true NOT NULL,
	"is_system_entity" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"metadata" jsonb,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "custom_entity_records" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"entity_id" varchar NOT NULL,
	"data" jsonb NOT NULL,
	"status" text,
	"created_by" varchar NOT NULL,
	"updated_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "custom_fields" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"environment" text DEFAULT 'production' NOT NULL,
	"entity_id" varchar NOT NULL,
	"field_key" text NOT NULL,
	"display_name" text NOT NULL,
	"description" text,
	"field_type" text NOT NULL,
	"field_options" jsonb,
	"validation_rules" jsonb,
	"default_value" jsonb,
	"field_order" integer DEFAULT 0 NOT NULL,
	"is_required" boolean DEFAULT false NOT NULL,
	"is_unique" boolean DEFAULT false NOT NULL,
	"is_searchable" boolean DEFAULT false NOT NULL,
	"is_visible" boolean DEFAULT true NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "detected_gaps" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"detected_by" varchar NOT NULL,
	"conversation_id" varchar,
	"gap_type" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"impact" text NOT NULL,
	"suggested_solution" text,
	"estimated_effort" text,
	"status" text DEFAULT 'detected' NOT NULL,
	"resolution" text,
	"resolved_by" varchar,
	"user_feedback" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"resolved_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "development_requests" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"request_title" text NOT NULL,
	"request_description" text NOT NULL,
	"request_type" varchar NOT NULL,
	"priority" varchar DEFAULT 'medium' NOT NULL,
	"status" varchar DEFAULT 'pending' NOT NULL,
	"agent_context" jsonb,
	"user_message" text,
	"business_impact" text,
	"reviewed_by" varchar,
	"reviewed_at" timestamp,
	"review_notes" text,
	"completed_at" timestamp,
	"rejection_reason" text,
	"estimated_hours" integer,
	"actual_hours" integer,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "document_analyses" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"file_id" varchar NOT NULL,
	"analysis_type" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"summary" text,
	"extracted_data" jsonb,
	"insights" jsonb,
	"confidence" real,
	"processing_time_ms" integer,
	"error_message" text,
	"template_id" varchar,
	"root_id" varchar,
	"analyzed_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_insights" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"analysis_id" varchar NOT NULL,
	"insight_type" text NOT NULL,
	"severity" text NOT NULL,
	"message" text NOT NULL,
	"actionable" boolean DEFAULT false NOT NULL,
	"suggested_actions" jsonb,
	"metadata" jsonb,
	"acknowledged_by" varchar,
	"acknowledged_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_integrations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"name" text NOT NULL,
	"integration_type" text NOT NULL,
	"endpoint" text,
	"credentials" text,
	"config" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_sync" timestamp,
	"sync_logs" jsonb,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_quality_checks" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"analysis_id" varchar NOT NULL,
	"check_type" text NOT NULL,
	"status" text NOT NULL,
	"severity" text NOT NULL,
	"details" jsonb,
	"resolved_by" varchar,
	"resolved_at" timestamp,
	"resolution_notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_templates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"document_type" text NOT NULL,
	"extraction_rules" jsonb,
	"quality_checks" jsonb,
	"automations" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_built_in" boolean DEFAULT false NOT NULL,
	"metadata" jsonb,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_versions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"original_file_id" varchar NOT NULL,
	"version_number" integer NOT NULL,
	"file_id" varchar NOT NULL,
	"changes_summary" text,
	"comparison_data" jsonb,
	"uploaded_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_alerts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"email_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"alert_type" text NOT NULL,
	"chat_message_id" varchar,
	"ai_suggestion" jsonb,
	"user_response" text,
	"action_taken" boolean DEFAULT false,
	"notified_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_inbox" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"gmail_message_id" text,
	"thread_id" text,
	"from_address" text NOT NULL,
	"from_name" text,
	"to_address" text,
	"cc_addresses" jsonb,
	"bcc_addresses" jsonb,
	"subject" text,
	"snippet" text,
	"body_text" text,
	"body_html" text,
	"labels" jsonb,
	"attachments" jsonb,
	"is_read" boolean DEFAULT false,
	"is_starred" boolean DEFAULT false,
	"received_at" timestamp NOT NULL,
	"category" text,
	"extracted_data" jsonb,
	"processing_status" text DEFAULT 'pending' NOT NULL,
	"linked_record_type" text,
	"linked_record_id" varchar,
	"agent_analysis" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "email_inbox_gmail_message_id_unique" UNIQUE("gmail_message_id")
);
--> statement-breakpoint
CREATE TABLE "email_response_learnings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"email_alert_id" varchar,
	"email_type" text NOT NULL,
	"original_suggestion" text NOT NULL,
	"user_correction" text NOT NULL,
	"email_context" jsonb,
	"quality" integer DEFAULT 5,
	"use_count" integer DEFAULT 0,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_expenses" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"code" varchar NOT NULL,
	"expense_date" date NOT NULL,
	"employee_id" varchar NOT NULL,
	"department_id" varchar,
	"category" varchar(50) DEFAULT 'other' NOT NULL,
	"subcategory" varchar,
	"description" text,
	"merchant_name" varchar,
	"merchant_address" text,
	"amount" numeric(15, 2) NOT NULL,
	"currency" varchar(3) DEFAULT 'EUR',
	"tax_amount" numeric(15, 2),
	"tax_rate" numeric(5, 2),
	"receipt_attached" boolean DEFAULT false,
	"receipt_url" text,
	"receipt_ocr_data" jsonb,
	"project_id" varchar,
	"allocated_to_project" boolean DEFAULT false,
	"allocation_date" date,
	"allocation_percentage" numeric(5, 2),
	"allocated_to_person" boolean DEFAULT false,
	"person_id" varchar,
	"billing_code" varchar,
	"payment_method" varchar(50) DEFAULT 'personal_reimbursement' NOT NULL,
	"company_card_id" varchar,
	"personal_reimbursement" boolean DEFAULT true,
	"status" varchar(50) DEFAULT 'draft' NOT NULL,
	"submitted_at" timestamp,
	"approved_by" varchar,
	"approval_date" timestamp,
	"rejection_reason" text,
	"reimbursed_at" timestamp,
	"reimbursement_payment_id" varchar,
	"reimbursement_amount" numeric(15, 2),
	"mileage_km" numeric(10, 2),
	"mileage_rate" numeric(5, 2),
	"mileage_reimbursement" numeric(15, 2),
	"mileage_from" varchar,
	"mileage_to" varchar,
	"advance_amount" numeric(15, 2),
	"advance_date" date,
	"advance_reconciled" boolean DEFAULT false,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "employee_expenses_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "entity_menu_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"environment" text DEFAULT 'production' NOT NULL,
	"entity_id" varchar NOT NULL,
	"module_slug" text,
	"menu_key" text NOT NULL,
	"display_name" text NOT NULL,
	"icon" text,
	"description" text,
	"route" text NOT NULL,
	"menu_order" integer DEFAULT 0 NOT NULL,
	"is_visible" boolean DEFAULT true NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"required_permission" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entity_views" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"environment" text DEFAULT 'production' NOT NULL,
	"entity_id" varchar NOT NULL,
	"view_key" text NOT NULL,
	"display_name" text NOT NULL,
	"view_type" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"view_config" jsonb NOT NULL,
	"view_order" integer DEFAULT 0 NOT NULL,
	"is_visible" boolean DEFAULT true NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entity_workflow_states" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"environment" text DEFAULT 'production' NOT NULL,
	"entity_id" varchar NOT NULL,
	"state_key" text NOT NULL,
	"display_name" text NOT NULL,
	"description" text,
	"color" text,
	"state_order" integer DEFAULT 0 NOT NULL,
	"is_initial" boolean DEFAULT false NOT NULL,
	"is_final" boolean DEFAULT false NOT NULL,
	"allowed_transitions" jsonb,
	"automations" jsonb,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "equipment_allocations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"project_id" varchar NOT NULL,
	"warehouse_id" varchar NOT NULL,
	"product_id" varchar NOT NULL,
	"qty_allocated" numeric(12, 3) NOT NULL,
	"from_date" timestamp NOT NULL,
	"to_date" timestamp NOT NULL,
	"status" text DEFAULT 'reserved' NOT NULL,
	"checked_out_by" varchar,
	"checked_out_at" timestamp,
	"checked_in_by" varchar,
	"checked_in_at" timestamp,
	"notes" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "equipment_conditions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"allocation_id" varchar,
	"product_id" varchar NOT NULL,
	"condition_type" text NOT NULL,
	"condition_status" text NOT NULL,
	"severity" text DEFAULT 'low' NOT NULL,
	"description" text,
	"reported_by" varchar NOT NULL,
	"reported_at" timestamp DEFAULT now() NOT NULL,
	"resolved_by" varchar,
	"resolved_at" timestamp,
	"repair_cost" numeric(12, 2),
	"photos" jsonb,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "erp_field_mappings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"erp_connection_id" varchar NOT NULL,
	"entity_type" text NOT NULL,
	"our_field" text NOT NULL,
	"erp_field" text NOT NULL,
	"source" text NOT NULL,
	"data_type" text,
	"is_required" boolean DEFAULT false NOT NULL,
	"transformation" text,
	"is_validated" boolean DEFAULT false NOT NULL,
	"validated_at" timestamp,
	"validation_result" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "execution_plans" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"requested_by_user_id" varchar NOT NULL,
	"status" text DEFAULT 'drafted' NOT NULL,
	"summary" text NOT NULL,
	"diff_summary" jsonb,
	"risk_level" text DEFAULT 'medium' NOT NULL,
	"requires_human_approval" boolean DEFAULT true NOT NULL,
	"blueprint_id" varchar,
	"failure_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "execution_tier_policies" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_type" text NOT NULL,
	"cpu_cost_estimate" integer,
	"needs_gpu" boolean DEFAULT false,
	"allow_external_network" boolean DEFAULT false,
	"preferred_tier" text DEFAULT 'vm2' NOT NULL,
	"timeout_seconds" integer DEFAULT 30,
	"memory_limit_mb" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "execution_tier_policies_task_type_unique" UNIQUE("task_type")
);
--> statement-breakpoint
CREATE TABLE "execution_traces" (
	"id" serial PRIMARY KEY NOT NULL,
	"execution_id" varchar NOT NULL,
	"span_id" varchar NOT NULL,
	"parent_span_id" varchar,
	"span_type" varchar NOT NULL,
	"name" varchar NOT NULL,
	"start_time" timestamp NOT NULL,
	"end_time" timestamp,
	"duration_ms" integer,
	"status" varchar NOT NULL,
	"metadata" jsonb,
	"tenant_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "execution_traces_span_id_unique" UNIQUE("span_id")
);
--> statement-breakpoint
CREATE TABLE "field_mappings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"data_source_id" varchar NOT NULL,
	"internal_field" text NOT NULL,
	"internal_type" text NOT NULL,
	"external_field" text,
	"external_type" text,
	"direction" text DEFAULT 'bidirectional' NOT NULL,
	"is_required" boolean DEFAULT false NOT NULL,
	"default_value" text,
	"transform_function" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "field_patterns" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"field_name" text NOT NULL,
	"pattern_type" text NOT NULL,
	"pattern" text NOT NULL,
	"context" text,
	"context_value" text,
	"success_count" integer DEFAULT 0 NOT NULL,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"accuracy" numeric,
	"last_used" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "file_attachments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"filename" text NOT NULL,
	"original_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size" integer NOT NULL,
	"path" text NOT NULL,
	"document_type" text,
	"fiscal_year" integer,
	"fiscal_month" integer,
	"fiscal_period" text,
	"checksum" text,
	"retention_until" timestamp,
	"source_system" text,
	"type_metadata" jsonb,
	"entity_type" text,
	"entity_id" varchar,
	"uploaded_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financial_calculations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"model_id" varchar NOT NULL,
	"scenario_id" varchar,
	"model_version" varchar(20) NOT NULL,
	"run_id" varchar NOT NULL,
	"inputs_hash" varchar(64) NOT NULL,
	"inputs" jsonb NOT NULL,
	"outputs" jsonb NOT NULL,
	"predicted_outcome" jsonb,
	"actual_outcome" jsonb,
	"deviation" jsonb,
	"units" jsonb,
	"lineage" jsonb,
	"status" varchar(20) DEFAULT 'completed' NOT NULL,
	"executed_at" timestamp DEFAULT now() NOT NULL,
	"execution_time_ms" integer,
	"executed_by" varchar,
	CONSTRAINT "financial_calculations_run_id_unique" UNIQUE("run_id")
);
--> statement-breakpoint
CREATE TABLE "financial_models" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"type" varchar(50) NOT NULL,
	"version" varchar(20) DEFAULT '1.0.0' NOT NULL,
	"description" text,
	"formula" jsonb NOT NULL,
	"metadata" jsonb,
	"is_built_in" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financial_patterns" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar,
	"pattern_type" varchar(50) NOT NULL,
	"condition" jsonb NOT NULL,
	"adjustment" jsonb NOT NULL,
	"confidence" integer NOT NULL,
	"sample_size" integer NOT NULL,
	"success_rate" numeric,
	"metadata" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_updated" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financial_scenarios" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"model_id" varchar NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"base_scenario_id" varchar,
	"inputs" jsonb NOT NULL,
	"overrides" jsonb,
	"results" jsonb,
	"executed_at" timestamp,
	"execution_time_ms" integer,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fiscal_periods" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"fiscal_year" integer NOT NULL,
	"period_type" text NOT NULL,
	"period_code" text NOT NULL,
	"start_date" timestamp NOT NULL,
	"end_date" timestamp NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"closed_by" varchar,
	"closed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "format_adjustments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"calculation_id" varchar NOT NULL,
	"original_format" jsonb NOT NULL,
	"adjusted_format" jsonb NOT NULL,
	"iterations" integer DEFAULT 1 NOT NULL,
	"final_accepted" boolean DEFAULT false NOT NULL,
	"adjustment_type" varchar(50),
	"user_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gold_labels" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"conversion_id" varchar NOT NULL,
	"field_name" text NOT NULL,
	"ocr_value" text,
	"corrected_value" text NOT NULL,
	"context" text,
	"context_value" text,
	"corrected_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "governance_policies" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"policy_name" text NOT NULL,
	"policy_value" jsonb NOT NULL,
	"last_updated_by_user_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_batches" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"batch_number" text NOT NULL,
	"product_id" varchar NOT NULL,
	"warehouse_id" varchar NOT NULL,
	"qty_batch_on_hand" numeric(12, 3) DEFAULT '0' NOT NULL,
	"expiry_date" timestamp,
	"quality_status" text DEFAULT 'ok' NOT NULL,
	"origin_document" text,
	"root_id" varchar,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_counts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"warehouse_id" varchar NOT NULL,
	"product_id" varchar NOT NULL,
	"counted_qty" numeric(12, 3) NOT NULL,
	"system_qty" numeric(12, 3) NOT NULL,
	"delta" numeric(12, 3) NOT NULL,
	"justification" text,
	"counted_by" varchar NOT NULL,
	"adjustment_transaction_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_levels" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"warehouse_id" varchar NOT NULL,
	"product_id" varchar NOT NULL,
	"qty_on_hand" numeric(12, 3) DEFAULT '0' NOT NULL,
	"qty_reserved" numeric(12, 3) DEFAULT '0' NOT NULL,
	"min_threshold" numeric(12, 3),
	"reorder_point" numeric(12, 3),
	"last_counted_at" timestamp,
	"reserved_for_project_id" varchar,
	"reserved_from_date" timestamp,
	"reserved_to_date" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_transactions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"type" text NOT NULL,
	"product_id" varchar NOT NULL,
	"batch_id" varchar,
	"warehouse_from_id" varchar,
	"warehouse_to_id" varchar,
	"qty" numeric(12, 3) NOT NULL,
	"unit_cost" numeric(12, 2),
	"reason" text,
	"linked_document_id" varchar,
	"root_id" varchar,
	"performed_by" varchar NOT NULL,
	"notes" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" varchar NOT NULL,
	"description" text NOT NULL,
	"quantity" numeric(10, 2) NOT NULL,
	"unit_price" numeric(12, 2) NOT NULL,
	"tax_rate" numeric(5, 2) DEFAULT '23' NOT NULL,
	"total_amount" numeric(12, 2) NOT NULL,
	"product_id" varchar,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "invoice_lines" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"invoice_id" varchar NOT NULL,
	"line_number" integer NOT NULL,
	"product_id" varchar,
	"product_code" text,
	"description" text NOT NULL,
	"quantity" numeric(10, 3) NOT NULL,
	"unit" text DEFAULT 'un' NOT NULL,
	"unit_price" numeric(12, 4) NOT NULL,
	"discount_rate" numeric(5, 2) DEFAULT '0',
	"discount_amount" numeric(12, 2) DEFAULT '0',
	"net_amount" numeric(12, 2) NOT NULL,
	"tax_rate" numeric(5, 2) NOT NULL,
	"tax_amount" numeric(12, 2) NOT NULL,
	"total_amount" numeric(12, 2) NOT NULL,
	"tax_exemption_reason" text,
	"tax_exemption_code" text,
	"account_code" text,
	"tax_type" text DEFAULT 'IVA',
	"tax_country_region" text DEFAULT 'PT',
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_taxes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"invoice_id" varchar NOT NULL,
	"tax_type" text DEFAULT 'IVA' NOT NULL,
	"tax_rate" numeric(5, 2) NOT NULL,
	"tax_country_region" text DEFAULT 'PT' NOT NULL,
	"taxable_amount" numeric(12, 2) NOT NULL,
	"tax_amount" numeric(12, 2) NOT NULL,
	"tax_code" text,
	"exemption_reason" text,
	"account_code" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_validations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"payable_id" varchar,
	"purchase_order_id" varchar,
	"match_score" integer,
	"discrepancies" jsonb,
	"validation_status" text DEFAULT 'pending' NOT NULL,
	"reviewed_by" varchar,
	"reviewed_at" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"invoice_type" text DEFAULT 'receivable' NOT NULL,
	"invoice_number" text NOT NULL,
	"client_id" varchar,
	"client_name" text,
	"client_nif" text,
	"client_address" text,
	"supplier_id" varchar,
	"supplier_name" text,
	"supplier_nif" varchar(9),
	"supplier_iban" varchar(34),
	"issue_date" timestamp NOT NULL,
	"due_date" timestamp,
	"status" text DEFAULT 'draft' NOT NULL,
	"payment_status" text DEFAULT 'pending' NOT NULL,
	"payment_method" text,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"exchange_rate" numeric(10, 6) DEFAULT '1.0',
	"base_currency" text DEFAULT 'EUR' NOT NULL,
	"base_currency_amount" numeric(12, 2),
	"net_amount" numeric(12, 2),
	"discount_amount" numeric(12, 2) DEFAULT '0',
	"subtotal" numeric(12, 2) DEFAULT '0' NOT NULL,
	"tax_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"paid_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"withholding_tax_rate" numeric(5, 2),
	"withholding_tax_amount" numeric(12, 2),
	"document_type" text,
	"series" text,
	"fiscal_year" integer,
	"atcud" text,
	"hash" text,
	"hash_control" text,
	"source_document_id" varchar,
	"pdf_url" text,
	"png_url" text,
	"xml_url" text,
	"category" text,
	"cost_center" text,
	"project_id" varchar,
	"purchase_order_id" varchar,
	"email_inbox_id" varchar,
	"journal_entry_id" varchar,
	"ar_account_code" text,
	"ap_account_code" text,
	"revenue_account_code" text,
	"expense_account_code" text,
	"vat_deductible_account" text,
	"vat_payable_account" text,
	"validation_status" text,
	"validation_errors" jsonb,
	"notes" text,
	"metadata" jsonb,
	"parent_id" varchar,
	"root_id" varchar,
	"toconline_document_id" text,
	"toconline_at_communication_status" text,
	"toconline_at_communicated_at" timestamp,
	"toconline_at_code" text,
	"toconline_synced_at" timestamp,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "journal_entries" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"entry_number" text NOT NULL,
	"entry_date" timestamp NOT NULL,
	"system_entry_date" timestamp DEFAULT now() NOT NULL,
	"fiscal_period" text NOT NULL,
	"description" text NOT NULL,
	"reference" text,
	"source_type" text NOT NULL,
	"source_id" varchar,
	"status" text DEFAULT 'draft' NOT NULL,
	"base_currency" text DEFAULT 'EUR' NOT NULL,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"exchange_rate" numeric(15, 6) DEFAULT '1.0' NOT NULL,
	"total_debit" numeric(12, 2) NOT NULL,
	"total_credit" numeric(12, 2) NOT NULL,
	"base_currency_total_debit" numeric(12, 2),
	"base_currency_total_credit" numeric(12, 2),
	"doc_archival_number" text,
	"hash_control" text,
	"transaction_id" text,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "journal_entry_lines" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" varchar NOT NULL,
	"account_code" text NOT NULL,
	"description" text NOT NULL,
	"debit" numeric(12, 2) DEFAULT '0' NOT NULL,
	"credit" numeric(12, 2) DEFAULT '0' NOT NULL,
	"cost_center" text,
	"project_id" varchar,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "learned_preferences" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"category" varchar(50) NOT NULL,
	"preference_key" varchar(100) NOT NULL,
	"preference_value" text NOT NULL,
	"confidence" real DEFAULT 1 NOT NULL,
	"source" varchar(50) NOT NULL,
	"extracted_from" integer,
	"times_reinforced" integer DEFAULT 1 NOT NULL,
	"last_reinforced_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "maintenance_schedule" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"product_id" varchar NOT NULL,
	"warehouse_id" varchar,
	"maintenance_type" text NOT NULL,
	"frequency" text NOT NULL,
	"last_maintenance_date" timestamp,
	"next_maintenance_date" timestamp NOT NULL,
	"assigned_to" varchar,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"completed_at" timestamp,
	"completed_by" varchar,
	"notes" text,
	"checklist_items" jsonb,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar,
	"environment" text DEFAULT 'production' NOT NULL,
	"conversation_id" varchar NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"metadata" jsonb,
	"is_read" boolean DEFAULT false NOT NULL,
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "model_adjustments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"model_id" varchar NOT NULL,
	"version" varchar(20) NOT NULL,
	"original_formula" jsonb NOT NULL,
	"learned_adjustments" jsonb NOT NULL,
	"performance_score" numeric,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_updated" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "module_agents" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"module_id" varchar NOT NULL,
	"agent_library_id" varchar NOT NULL,
	"custom_name" text,
	"custom_prompt" text,
	"model" text DEFAULT 'gpt-4o' NOT NULL,
	"enabled_tools" jsonb,
	"custom_config" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "module_custom_fields" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"module_id" varchar NOT NULL,
	"name" text NOT NULL,
	"label" text NOT NULL,
	"type" text NOT NULL,
	"options" jsonb,
	"required" boolean DEFAULT false NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "module_features" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_module_id" varchar NOT NULL,
	"feature_key" text NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"config" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "module_interface_config" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"module_slug" text NOT NULL,
	"menu_id" text NOT NULL,
	"is_visible" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "module_templates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"icon" text,
	"category" text NOT NULL,
	"features" jsonb NOT NULL,
	"agent_types" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "module_templates_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "modules" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"template_id" varchar,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"custom_settings" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"installed_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"link" text,
	"link_text" text,
	"metadata" jsonb,
	"read" boolean DEFAULT false NOT NULL,
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "onboarding_cache" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" text,
	"user_id" varchar,
	"company_info" jsonb,
	"web_search_results" jsonb,
	"preferences" jsonb,
	"converted_to_tenant_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp DEFAULT NOW() + INTERVAL '7 days' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "open_banking_accounts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" varchar NOT NULL,
	"tenant_id" varchar NOT NULL,
	"external_account_id" text NOT NULL,
	"iban" text,
	"account_name" text NOT NULL,
	"account_type" text,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"current_balance" numeric(15, 2),
	"available_balance" numeric(15, 2),
	"balance_updated_at" timestamp,
	"linked_bank_account_id" varchar,
	"owner_name" text,
	"bic" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "open_banking_connections" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"bank_name" text NOT NULL,
	"country" text NOT NULL,
	"institution_id" text NOT NULL,
	"requisition_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"token_expires_at" timestamp,
	"last_sync_at" timestamp,
	"last_sync_status" text,
	"last_sync_error" text,
	"consent_expires_at" timestamp,
	"consent_id" text,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "open_banking_connections_requisition_id_unique" UNIQUE("requisition_id")
);
--> statement-breakpoint
CREATE TABLE "open_banking_transactions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" varchar NOT NULL,
	"tenant_id" varchar NOT NULL,
	"external_transaction_id" text NOT NULL,
	"transaction_date" timestamp NOT NULL,
	"value_date" timestamp,
	"booking_date" timestamp,
	"amount" numeric(15, 2) NOT NULL,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"description" text,
	"remittance_info" text,
	"creditor_name" text,
	"creditor_account" text,
	"debtor_name" text,
	"debtor_account" text,
	"transaction_code" text,
	"proprietary_code" text,
	"bank_reconciliation_id" varchar,
	"is_reconciled" boolean DEFAULT false NOT NULL,
	"matched_payment_id" varchar,
	"suggested_category" text,
	"suggested_account_code" text,
	"ai_confidence" numeric(5, 2),
	"raw_data" jsonb,
	"imported_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payables" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"supplier_invoice_id" varchar,
	"supplier_name" text NOT NULL,
	"nif" varchar(9),
	"iban" varchar(34),
	"amount" numeric(12, 2) NOT NULL,
	"due_date" timestamp NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"payment_date" timestamp,
	"payment_method" text,
	"payment_batch_id" varchar,
	"receipt_file_url" text,
	"purchase_order_id" varchar,
	"validation_status" text,
	"attachment_url" text,
	"description" text,
	"notes" text,
	"validation_errors" jsonb,
	"metadata" jsonb,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_allocations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"payment_id" varchar NOT NULL,
	"invoice_id" varchar NOT NULL,
	"allocated_amount" numeric(12, 2) NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_reminders" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"invoice_id" varchar NOT NULL,
	"client_id" varchar,
	"reminder_type" text NOT NULL,
	"reminder_sequence" integer DEFAULT 1 NOT NULL,
	"sent_at" timestamp DEFAULT now() NOT NULL,
	"sent_by" text DEFAULT 'ar_agent' NOT NULL,
	"recipient_email" text NOT NULL,
	"email_subject" text NOT NULL,
	"email_body" text NOT NULL,
	"email_opened" boolean DEFAULT false,
	"email_opened_at" timestamp,
	"customer_responded" boolean DEFAULT false,
	"customer_response" text,
	"responded_at" timestamp,
	"payment_received" boolean DEFAULT false,
	"payment_received_at" timestamp,
	"next_reminder_scheduled" timestamp,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"invoice_id" varchar,
	"bank_account_id" varchar,
	"type" text NOT NULL,
	"payment_method" text NOT NULL,
	"payment_date" timestamp NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"base_currency" text DEFAULT 'EUR' NOT NULL,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"exchange_rate" numeric(15, 6) DEFAULT '1.0' NOT NULL,
	"base_currency_amount" numeric(12, 2),
	"total_allocated" numeric(12, 2) DEFAULT '0',
	"unallocated_amount" numeric(12, 2) DEFAULT '0',
	"reference" text,
	"status" text DEFAULT 'completed' NOT NULL,
	"notes" text,
	"bank_reconciliation_id" varchar,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "picking_batches" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"batch_number" text NOT NULL,
	"warehouse_id" varchar NOT NULL,
	"batch_type" text DEFAULT 'single' NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"assigned_to" varchar,
	"picking_ids" jsonb NOT NULL,
	"scheduled_date" timestamp,
	"started_at" timestamp,
	"completed_at" timestamp,
	"notes" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "picking_batches_batch_number_unique" UNIQUE("batch_number")
);
--> statement-breakpoint
CREATE TABLE "presentation_patterns" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar,
	"pattern_type" varchar(50) NOT NULL,
	"context" jsonb NOT NULL,
	"format_preference" jsonb NOT NULL,
	"adoption_rate" numeric NOT NULL,
	"sample_size" integer NOT NULL,
	"tenant_specific" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_updated" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pricing_addons" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" text DEFAULT 'tenant' NOT NULL,
	"tenant_id" varchar,
	"name" text NOT NULL,
	"description" text,
	"addon_type" text NOT NULL,
	"config" jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"display_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pricing_catalog_categories" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar,
	"name" text NOT NULL,
	"description" text,
	"icon" text,
	"is_system_default" boolean DEFAULT false NOT NULL,
	"display_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pricing_catalogs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" text DEFAULT 'tenant' NOT NULL,
	"tenant_id" varchar,
	"project_id" varchar,
	"category_id" varchar,
	"code" text,
	"name" text NOT NULL,
	"description" text,
	"cost_basis" text NOT NULL,
	"base_cost" numeric(15, 2) NOT NULL,
	"unit_of_measure" text,
	"metadata" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"display_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pricing_discounts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" text DEFAULT 'tenant' NOT NULL,
	"tenant_id" varchar,
	"name" text NOT NULL,
	"description" text,
	"discount_type" text NOT NULL,
	"config" jsonb NOT NULL,
	"priority" integer DEFAULT 100,
	"is_cumulative" boolean DEFAULT false NOT NULL,
	"valid_from" timestamp,
	"valid_until" timestamp,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pricing_input_schemas" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"parameter_name" text NOT NULL,
	"display_label" text NOT NULL,
	"data_type" text NOT NULL,
	"validation_rules" jsonb,
	"default_value" text,
	"placeholder" text,
	"help_text" text,
	"display_order" integer DEFAULT 0,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pricing_line_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" varchar NOT NULL,
	"module_id" varchar,
	"catalog_item_id" varchar,
	"description" text NOT NULL,
	"display_group" text,
	"quantity" numeric(15, 4) NOT NULL,
	"unit_price" numeric(15, 2) NOT NULL,
	"total" numeric(15, 2) NOT NULL,
	"is_visible_to_client" boolean DEFAULT true NOT NULL,
	"display_order" integer DEFAULT 0,
	"calculation_trace" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pricing_project_modules" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" varchar NOT NULL,
	"module_type" text NOT NULL,
	"module_name" text NOT NULL,
	"config" jsonb,
	"calculated_result" jsonb,
	"display_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pricing_projects" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"lead_id" varchar,
	"project_id" varchar,
	"project_number" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"start_date" timestamp,
	"end_date" timestamp,
	"event_date" timestamp,
	"rule_set_id" varchar NOT NULL,
	"rule_set_version" integer NOT NULL,
	"frozen_rules" jsonb,
	"input_values" jsonb NOT NULL,
	"calculated_breakdown" jsonb,
	"presentation_config" jsonb,
	"status" text DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"sent_at" timestamp,
	"approved_at" timestamp,
	"parent_id" varchar,
	"root_id" varchar,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pricing_rule_entries" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rule_set_id" varchar NOT NULL,
	"catalog_item_id" varchar,
	"rule_type" text NOT NULL,
	"config" jsonb NOT NULL,
	"execution_order" integer DEFAULT 100,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pricing_rule_sets" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" text DEFAULT 'tenant' NOT NULL,
	"tenant_id" varchar,
	"project_id" varchar,
	"name" text NOT NULL,
	"description" text,
	"industry" text,
	"version" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"priority" integer DEFAULT 100,
	"active_from" timestamp,
	"active_until" timestamp,
	"approved_by" varchar,
	"approved_at" timestamp,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pricing_taxes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inheritance_scope" text DEFAULT 'tenant' NOT NULL,
	"tenant_id" varchar,
	"name" text NOT NULL,
	"tax_rate" numeric(5, 2) NOT NULL,
	"apply_after_discounts" boolean DEFAULT true NOT NULL,
	"application_scope" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"display_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "process_optimizations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"suggested_by" varchar NOT NULL,
	"process_category" text NOT NULL,
	"current_process" text NOT NULL,
	"suggested_improvement" text NOT NULL,
	"expected_benefit" text,
	"estimated_impact" jsonb,
	"complexity" text NOT NULL,
	"status" text DEFAULT 'suggested' NOT NULL,
	"implementation_plan" text,
	"user_response" text,
	"actual_results" jsonb,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"implemented_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "product_specifications" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"product_id" varchar,
	"name" text NOT NULL,
	"version" text DEFAULT '1.0' NOT NULL,
	"spec_type" text NOT NULL,
	"yield_per_batch" numeric(15, 4),
	"unit" text NOT NULL,
	"materials" jsonb NOT NULL,
	"operations" jsonb NOT NULL,
	"loss_factor" numeric(5, 2),
	"energy_cost_factor" numeric(10, 4),
	"labor_minutes" integer,
	"output_variants" jsonb,
	"quality_checks" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_suppliers" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"product_id" varchar NOT NULL,
	"supplier_id" varchar NOT NULL,
	"supplier_product_code" varchar(100),
	"supplier_product_name" varchar(255),
	"current_price" numeric(15, 2) NOT NULL,
	"currency" varchar(3) DEFAULT 'EUR',
	"price_valid_from" date,
	"price_valid_to" date,
	"minimum_order_quantity" numeric(15, 3),
	"quantity_multiple" numeric(15, 3),
	"lead_time_days" integer NOT NULL,
	"lead_time_variance" integer,
	"is_preferred" boolean DEFAULT false,
	"priority" integer DEFAULT 0,
	"order_count" integer DEFAULT 0,
	"last_order_date" date,
	"average_delivery_days" numeric(5, 1),
	"on_time_rate" numeric(5, 2),
	"is_active" boolean DEFAULT true,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "production_batches" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"work_order_id" varchar NOT NULL,
	"batch_number" text NOT NULL,
	"batch_type" text,
	"product_name" text NOT NULL,
	"quantity" numeric(15, 4) NOT NULL,
	"unit" text NOT NULL,
	"expiry_date" timestamp,
	"destination" text,
	"destination_location" text,
	"status" text DEFAULT 'in_production' NOT NULL,
	"is_quality_approved" boolean DEFAULT false NOT NULL,
	"produced_by" varchar,
	"produced_at" timestamp,
	"approved_by" varchar,
	"approved_at" timestamp,
	"traceability" jsonb,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "production_execution_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"module_name" text NOT NULL,
	"execution_tier" text,
	"success" boolean NOT NULL,
	"error_message" text,
	"latency_ms" integer,
	"executed_at" timestamp DEFAULT now() NOT NULL,
	"blueprint_version_id" varchar
);
--> statement-breakpoint
CREATE TABLE "production_integrations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"integration_type" text NOT NULL,
	"integration_name" text NOT NULL,
	"description" text,
	"endpoint" text,
	"auth_method" text,
	"credentials" jsonb,
	"mapping" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_sync_at" timestamp,
	"last_sync_status" text,
	"sync_logs" jsonb,
	"metadata" jsonb,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "production_operations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"work_order_id" varchar NOT NULL,
	"operation_number" integer NOT NULL,
	"operation_name" text NOT NULL,
	"operation_type" text,
	"description" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"sequence_type" text DEFAULT 'sequential' NOT NULL,
	"depends_on" jsonb,
	"planned_duration_minutes" integer,
	"actual_duration_minutes" integer,
	"assigned_resource" text,
	"assigned_machine" text,
	"assigned_team" text,
	"started_at" timestamp,
	"completed_at" timestamp,
	"started_by" varchar,
	"completed_by" varchar,
	"notes" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "production_quality_checks" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"work_order_id" varchar,
	"operation_id" varchar,
	"batch_id" varchar,
	"check_type" text NOT NULL,
	"check_name" text NOT NULL,
	"check_category" text,
	"required_value" text,
	"actual_value" text,
	"unit" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"is_passed" boolean,
	"is_quality_hold" boolean DEFAULT false NOT NULL,
	"measurements" jsonb,
	"photos" jsonb,
	"certifications" jsonb,
	"performed_by" varchar,
	"performed_at" timestamp,
	"validated_by" varchar,
	"validated_at" timestamp,
	"notes" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "production_work_order_materials" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"work_order_id" varchar NOT NULL,
	"material_type" text NOT NULL,
	"material_id" varchar,
	"material_name" text NOT NULL,
	"planned_quantity" numeric(15, 4) NOT NULL,
	"actual_quantity" numeric(15, 4),
	"unit" text NOT NULL,
	"planned_cost" numeric(15, 2),
	"actual_cost" numeric(15, 2),
	"issued_from" text,
	"issued_at" timestamp,
	"issued_by" varchar,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "production_work_orders" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"root_id" varchar,
	"wo_number" text NOT NULL,
	"wo_type" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"specification_id" varchar,
	"quote_id" varchar,
	"project_id" varchar,
	"sales_order_id" varchar,
	"output_product" text,
	"target_quantity" numeric(15, 4),
	"target_unit" text,
	"actual_quantity" numeric(15, 4),
	"scrap_quantity" numeric(15, 4),
	"planned_start_date" timestamp,
	"planned_end_date" timestamp,
	"actual_start_date" timestamp,
	"actual_end_date" timestamp,
	"assigned_team" text,
	"assigned_line" text,
	"assigned_resources" jsonb,
	"planned_cost" numeric(15, 2),
	"actual_cost" numeric(15, 2),
	"notes" text,
	"metadata" jsonb,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar,
	"environment" text DEFAULT 'production' NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"price" numeric(10, 2) DEFAULT '0' NOT NULL,
	"cost" numeric(10, 2),
	"stock" integer DEFAULT 0 NOT NULL,
	"category" text,
	"unid_faturacao" text,
	"conservacao" text,
	"stock_status" text,
	"unid_venda" text,
	"embalagem" text,
	"barcode" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"toconline_product_id" text,
	"toconline_synced_at" timestamp,
	"track_by_lot" boolean DEFAULT false NOT NULL,
	"track_by_serial" boolean DEFAULT false NOT NULL,
	"shelf_life_days" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "products_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "project_activity_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"project_id" varchar,
	"user_id" varchar,
	"entity_type" text NOT NULL,
	"entity_id" varchar,
	"action" text NOT NULL,
	"changes" jsonb,
	"description" text,
	"ip_address" text,
	"user_agent" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_approvals" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"project_id" varchar NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" varchar NOT NULL,
	"approval_type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"required_approvers" jsonb NOT NULL,
	"approvals" jsonb,
	"requested_by" varchar NOT NULL,
	"requested_at" timestamp DEFAULT now() NOT NULL,
	"due_date" timestamp,
	"completed_at" timestamp,
	"final_decision" text,
	"final_decision_by" varchar,
	"comments" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_change_requests" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"project_id" varchar NOT NULL,
	"request_number" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"requested_by" varchar,
	"requested_at" timestamp DEFAULT now() NOT NULL,
	"category" text NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"scope_impact" text,
	"schedule_impact" integer,
	"budget_impact" numeric(15, 2),
	"quality_impact" text,
	"justification" text,
	"alternatives_considered" text,
	"reviewed_by" varchar,
	"reviewed_at" timestamp,
	"review_comments" text,
	"approved_by" varchar,
	"approved_at" timestamp,
	"implemented_at" timestamp,
	"implemented_by" varchar,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_contracts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"project_id" varchar NOT NULL,
	"contract_number" text NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"contractor_id" varchar,
	"contractor_name" text NOT NULL,
	"contract_value" numeric(10, 2) NOT NULL,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"payment_terms" text,
	"start_date" timestamp NOT NULL,
	"end_date" timestamp NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"signed_by" varchar,
	"signed_at" timestamp,
	"document_url" text,
	"milestones" jsonb,
	"deliverables" jsonb,
	"renewal_terms" text,
	"termination_clause" text,
	"sla" jsonb,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_decisions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"project_id" varchar NOT NULL,
	"decision_number" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"decision_type" text NOT NULL,
	"context" text,
	"options" jsonb,
	"decision" text,
	"rationale" text,
	"made_by" varchar,
	"made_at" timestamp DEFAULT now() NOT NULL,
	"approved_by" varchar,
	"approved_at" timestamp,
	"stakeholders" jsonb,
	"impacted_entities" jsonb,
	"status" text DEFAULT 'proposed' NOT NULL,
	"superseded_by" varchar,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_deliverables" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"project_id" varchar NOT NULL,
	"phase_id" varchar,
	"milestone_id" varchar,
	"name" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"due_date" timestamp,
	"delivered_at" timestamp,
	"approved_by" varchar,
	"approved_at" timestamp,
	"document_url" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_documents" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"project_id" varchar NOT NULL,
	"phase_id" varchar,
	"task_id" varchar,
	"deliverable_id" varchar,
	"title" text NOT NULL,
	"document_name" text,
	"document_type" text,
	"document_date" date,
	"description" text,
	"category" text NOT NULL,
	"file_url" text NOT NULL,
	"file_name" text NOT NULL,
	"file_size" integer NOT NULL,
	"mime_type" text NOT NULL,
	"version" text DEFAULT '1.0' NOT NULL,
	"version_number" integer DEFAULT 1 NOT NULL,
	"is_latest_version" boolean DEFAULT true NOT NULL,
	"previous_version_id" varchar,
	"status" text DEFAULT 'draft' NOT NULL,
	"uploaded_by" varchar NOT NULL,
	"uploaded_at" timestamp DEFAULT now() NOT NULL,
	"reviewed_by" varchar,
	"reviewed_at" timestamp,
	"approved_by" varchar,
	"approved_at" timestamp,
	"tags" jsonb,
	"notes" text,
	"shared_with_client" boolean DEFAULT false NOT NULL,
	"share_expires_at" timestamp,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_expenses" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"project_id" varchar NOT NULL,
	"task_id" varchar,
	"user_id" varchar NOT NULL,
	"expense_date" timestamp NOT NULL,
	"amount" numeric(15, 2) NOT NULL,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"category" text NOT NULL,
	"description" text,
	"receipt_url" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"approved_by" varchar,
	"approved_at" timestamp,
	"paid_at" timestamp,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_external_mappings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"project_id" varchar,
	"phase_id" varchar,
	"task_id" varchar,
	"deliverable_id" varchar,
	"entity_type" text NOT NULL,
	"entity_id" varchar NOT NULL,
	"external_system" text NOT NULL,
	"external_id" text NOT NULL,
	"external_url" text,
	"external_data" jsonb,
	"sync_direction" text DEFAULT 'bidirectional' NOT NULL,
	"last_synced_at" timestamp,
	"sync_status" text DEFAULT 'synced' NOT NULL,
	"sync_errors" jsonb,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_issues" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"project_id" varchar NOT NULL,
	"phase_id" varchar,
	"task_id" varchar,
	"issue_number" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"issue_type" text NOT NULL,
	"severity" text NOT NULL,
	"status" text NOT NULL,
	"reported_by" varchar,
	"reported_at" timestamp DEFAULT now() NOT NULL,
	"assigned_to" varchar,
	"due_date" timestamp,
	"resolved_at" timestamp,
	"resolved_by" varchar,
	"resolution" text,
	"worklog" jsonb,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_milestones" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"project_id" varchar NOT NULL,
	"phase_id" varchar,
	"name" text NOT NULL,
	"description" text,
	"due_date" timestamp NOT NULL,
	"completed_at" timestamp,
	"status" text DEFAULT 'pending' NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_phases" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"project_id" varchar NOT NULL,
	"name" text NOT NULL,
	"phase_name" text,
	"description" text,
	"phase_order" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"start_date" timestamp,
	"end_date" timestamp,
	"planned_budget" numeric(15, 2),
	"budget" numeric,
	"actual_cost" numeric(15, 2) DEFAULT '0',
	"percent_complete" numeric,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_purchases" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"project_id" varchar NOT NULL,
	"phase_id" varchar,
	"task_id" varchar,
	"purchase_number" text NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"requested_by" varchar,
	"requested_at" timestamp DEFAULT now() NOT NULL,
	"approved_by" varchar,
	"approved_at" timestamp,
	"supplier_id" varchar,
	"description" text,
	"category" text NOT NULL,
	"quantity" numeric(10, 2) NOT NULL,
	"unit_price" numeric(10, 2) NOT NULL,
	"total_amount" numeric(10, 2) NOT NULL,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"delivery_date" timestamp,
	"received_date" timestamp,
	"received_by" varchar,
	"invoice_number" text,
	"invoice_url" text,
	"notes" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_resource_allocations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"project_id" varchar NOT NULL,
	"phase_id" varchar,
	"task_id" varchar,
	"resource_type" text NOT NULL,
	"user_id" varchar,
	"resource_name" text,
	"allocated_hours" numeric(10, 2) NOT NULL,
	"start_date" timestamp NOT NULL,
	"end_date" timestamp NOT NULL,
	"utilization_percentage" numeric(5, 2),
	"cost" numeric(15, 2),
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_resources" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"project_id" varchar NOT NULL,
	"resource_type" text NOT NULL,
	"resource_name" text NOT NULL,
	"quantity" numeric,
	"unit" text,
	"cost_per_unit" numeric,
	"total_cost" numeric,
	"allocation_date" date,
	"release_date" date,
	"status" text DEFAULT 'Allocated' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_risks" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"project_id" varchar NOT NULL,
	"phase_id" varchar,
	"title" text NOT NULL,
	"description" text,
	"category" text NOT NULL,
	"probability" integer NOT NULL,
	"impact" integer NOT NULL,
	"risk_score" integer NOT NULL,
	"status" text NOT NULL,
	"mitigation_plan" text,
	"contingency_plan" text,
	"owner" varchar,
	"identified_by" varchar,
	"identified_at" timestamp DEFAULT now() NOT NULL,
	"last_reviewed_at" timestamp,
	"next_review_date" timestamp,
	"mitigated_at" timestamp,
	"actual_impact" integer,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_states" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"state_key" text NOT NULL,
	"display_name" text NOT NULL,
	"description" text,
	"color" text,
	"icon" text,
	"state_order" integer DEFAULT 0 NOT NULL,
	"category" text NOT NULL,
	"allowed_transitions" jsonb,
	"auto_actions" jsonb,
	"guards" jsonb,
	"is_system_state" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_tasks" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"project_id" varchar NOT NULL,
	"phase_id" varchar,
	"name" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'todo' NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"task_order" integer DEFAULT 0 NOT NULL,
	"assigned_to" varchar,
	"start_date" timestamp,
	"due_date" timestamp,
	"completed_at" timestamp,
	"estimated_hours" numeric(10, 2),
	"actual_hours" numeric(10, 2),
	"dependencies" jsonb,
	"is_critical_path" boolean DEFAULT false NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_team_members" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"project_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"role" text NOT NULL,
	"raci_role" jsonb,
	"hourly_rate" numeric(10, 2),
	"can_approve_time_entries" boolean DEFAULT false NOT NULL,
	"can_approve_expenses" boolean DEFAULT false NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	"left_at" timestamp,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_templates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"industry" text NOT NULL,
	"icon" text,
	"tags" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_global" boolean DEFAULT false NOT NULL,
	"wbs_structure" jsonb,
	"default_budget" numeric(10, 2),
	"estimated_duration" integer,
	"complexity" text,
	"required_roles" jsonb,
	"custom_fields" jsonb,
	"checklist_templates" jsonb,
	"risk_templates" jsonb,
	"created_by" varchar,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_time_entries" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"project_id" varchar NOT NULL,
	"task_id" varchar,
	"user_id" varchar NOT NULL,
	"date" timestamp NOT NULL,
	"hours" numeric(10, 2) NOT NULL,
	"description" text,
	"billable" boolean DEFAULT true NOT NULL,
	"hourly_rate" numeric(10, 2),
	"status" text DEFAULT 'draft' NOT NULL,
	"approved_by" varchar,
	"approved_at" timestamp,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'planning' NOT NULL,
	"client_id" varchar,
	"client_name" text,
	"lead_id" varchar,
	"budget_quote_id" varchar,
	"project_code" text NOT NULL,
	"start_date" timestamp,
	"end_date" timestamp,
	"event_date" timestamp,
	"planned_budget" numeric(15, 2),
	"estimated_budget" numeric,
	"actual_cost" numeric(15, 2) DEFAULT '0',
	"priority" text DEFAULT 'Medium' NOT NULL,
	"project_type" text,
	"tags" text,
	"notes" text,
	"catering_phase" text DEFAULT 'planeamento',
	"baseline_data" jsonb,
	"metadata" jsonb,
	"project_manager_id" varchar,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "public_forms" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"entity_key" varchar NOT NULL,
	"form_key" varchar NOT NULL,
	"form_title" text NOT NULL,
	"description" text,
	"fields" jsonb NOT NULL,
	"settings" jsonb,
	"is_active" boolean DEFAULT true,
	"environment" varchar NOT NULL,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"metadata" jsonb,
	CONSTRAINT "public_forms_form_key_unique" UNIQUE("form_key")
);
--> statement-breakpoint
CREATE TABLE "purchase_order_lines" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"po_id" varchar NOT NULL,
	"requisition_line_id" varchar,
	"rfq_quote_line_id" varchar,
	"product_id" varchar,
	"description" text,
	"quantity" numeric(15, 3) NOT NULL,
	"uom" varchar(20),
	"unit_price" numeric(15, 2),
	"line_total" numeric(15, 2),
	"received_quantity" numeric(15, 3) DEFAULT '0',
	"remaining_quantity" numeric(15, 3),
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"code" varchar(50) NOT NULL,
	"order_date" date NOT NULL,
	"expected_delivery_date" date,
	"supplier_id" varchar NOT NULL,
	"supplier_contact_name" varchar(255),
	"supplier_contact_email" varchar(255),
	"requisition_id" varchar,
	"rfq_id" varchar,
	"rfq_quote_id" varchar,
	"source" varchar(50) DEFAULT 'manual' NOT NULL,
	"created_by_agent_id" varchar(100),
	"status" varchar(50) DEFAULT 'draft' NOT NULL,
	"approved_by" varchar,
	"approval_date" timestamp,
	"rejection_reason" text,
	"supplier_acknowledged_at" timestamp,
	"supplier_expected_delivery" date,
	"supplier_comments" text,
	"subtotal" numeric(15, 2),
	"tax_total" numeric(15, 2),
	"shipping_cost" numeric(15, 2),
	"total_amount" numeric(15, 2),
	"currency" varchar(3) DEFAULT 'EUR',
	"delivery_address" text,
	"delivery_city" varchar(100),
	"delivery_postal_code" varchar(20),
	"delivery_country" varchar(2) DEFAULT 'PT',
	"payment_terms" text,
	"delivery_terms" text,
	"budget_id" varchar,
	"project_id" varchar,
	"email_sent_at" timestamp,
	"email_sent_to" varchar(255),
	"invoice_form_url" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" varchar,
	"updated_by" varchar,
	CONSTRAINT "purchase_orders_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "purchase_requisition_lines" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requisition_id" varchar NOT NULL,
	"product_id" varchar NOT NULL,
	"description" text,
	"quantity" numeric(15, 3) NOT NULL,
	"uom" varchar(20),
	"estimated_price" numeric(15, 2),
	"estimated_total" numeric(15, 2),
	"suggested_supplier_id" varchar,
	"suggestion_reason" text,
	"suggestion_confidence" numeric(3, 2),
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "purchase_requisitions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"code" varchar(50) NOT NULL,
	"request_date" date NOT NULL,
	"requested_by" varchar NOT NULL,
	"department_id" varchar,
	"project_id" varchar,
	"source" varchar(50) NOT NULL,
	"source_agent_id" varchar(100),
	"priority" varchar(20) DEFAULT 'normal' NOT NULL,
	"needed_by_date" date,
	"justification" text,
	"status" varchar(50) DEFAULT 'draft' NOT NULL,
	"approved_by" varchar,
	"approval_date" timestamp,
	"rejection_reason" text,
	"estimated_total" numeric(15, 2),
	"budget_id" varchar,
	"converted_to_po_id" varchar,
	"conversion_date" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_requisitions_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "purchasing_invoice_lines" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" varchar NOT NULL,
	"po_line_id" varchar,
	"receipt_line_id" varchar,
	"product_id" varchar,
	"description" text,
	"quantity" numeric(15, 3) NOT NULL,
	"uom" varchar(20),
	"unit_price" numeric(15, 2) NOT NULL,
	"line_total" numeric(15, 2) NOT NULL,
	"tax_rate" numeric(5, 2) NOT NULL,
	"tax_amount" numeric(15, 2) NOT NULL,
	"quantity_discrepancy" numeric(15, 3),
	"price_discrepancy" numeric(15, 2),
	"discrepancy_reason" text,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "purchasing_invoices" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"code" varchar(50) NOT NULL,
	"invoice_number" varchar,
	"invoice_date" date NOT NULL,
	"supplier_id" varchar NOT NULL,
	"po_id" varchar,
	"receipt_id" varchar,
	"submission_source" varchar(50) DEFAULT 'manual' NOT NULL,
	"ocr_extracted" boolean DEFAULT false NOT NULL,
	"ocr_data" jsonb,
	"ocr_confidence" numeric(3, 2),
	"ocr_validated_by" varchar,
	"ocr_validated_at" timestamp,
	"subtotal" numeric(15, 2) NOT NULL,
	"tax_total" numeric(15, 2) NOT NULL,
	"shipping_cost" numeric(15, 2) DEFAULT '0',
	"other_charges" numeric(15, 2) DEFAULT '0',
	"total_amount" numeric(15, 2) NOT NULL,
	"currency" varchar(3) DEFAULT 'EUR',
	"payment_terms" text,
	"due_date" date,
	"three_way_match_status" varchar(50) DEFAULT 'pending' NOT NULL,
	"matched_by_agent_id" varchar,
	"matched_at" timestamp,
	"po_discrepancy" boolean DEFAULT false NOT NULL,
	"po_discrepancy_amount" numeric(15, 2),
	"receipt_discrepancy" boolean DEFAULT false NOT NULL,
	"receipt_discrepancy_details" jsonb,
	"price_discrepancy" boolean DEFAULT false NOT NULL,
	"price_discrepancy_amount" numeric(15, 2),
	"override_reason" text,
	"override_approved_by" varchar,
	"override_approved_at" timestamp,
	"status" varchar(50) DEFAULT 'draft' NOT NULL,
	"approved_by" varchar,
	"approval_date" date,
	"rejection_reason" text,
	"paid_amount" numeric(15, 2) DEFAULT '0' NOT NULL,
	"remaining_amount" numeric(15, 2),
	"notes" text,
	"attachments" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" varchar,
	CONSTRAINT "purchasing_invoices_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "purchasing_payment_allocations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"payment_id" varchar NOT NULL,
	"invoice_id" varchar NOT NULL,
	"allocated_amount" numeric(15, 2) NOT NULL,
	"allocation_date" date NOT NULL,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchasing_payments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"code" varchar(50) NOT NULL,
	"payment_date" date NOT NULL,
	"supplier_id" varchar NOT NULL,
	"amount" numeric(15, 2) NOT NULL,
	"currency" varchar(3) DEFAULT 'EUR',
	"payment_method" varchar(50) DEFAULT 'bank_transfer' NOT NULL,
	"bank_account_id" varchar,
	"reference_number" varchar,
	"check_number" varchar,
	"status" varchar(50) DEFAULT 'draft' NOT NULL,
	"processed_at" timestamp,
	"processed_by" varchar,
	"reconciled_at" timestamp,
	"reconciliation_reference" varchar,
	"allocated_amount" numeric(15, 2) DEFAULT '0' NOT NULL,
	"unapplied_amount" numeric(15, 2),
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" varchar,
	CONSTRAINT "purchasing_payments_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "receipt_lines" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"receipt_id" varchar NOT NULL,
	"po_line_id" varchar,
	"product_id" varchar,
	"ordered_quantity" numeric(15, 3) NOT NULL,
	"received_quantity" numeric(15, 3) NOT NULL,
	"accepted_quantity" numeric(15, 3) NOT NULL,
	"rejected_quantity" numeric(15, 3) DEFAULT '0' NOT NULL,
	"uom" varchar(20),
	"discrepancy_reason" text,
	"quality_issue" text,
	"batch_number" varchar(100),
	"expiry_date" date,
	"location_id" varchar,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "receipts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"code" varchar(50) NOT NULL,
	"receipt_date" date NOT NULL,
	"po_id" varchar NOT NULL,
	"warehouse_id" varchar,
	"location_id" varchar,
	"received_by" varchar NOT NULL,
	"received_at" timestamp DEFAULT now() NOT NULL,
	"inspection_status" varchar(50) DEFAULT 'pending' NOT NULL,
	"inspection_notes" text,
	"quality_issues" jsonb,
	"rejected_quantity" numeric(15, 3),
	"accepted_quantity" numeric(15, 3),
	"status" varchar(50) DEFAULT 'draft' NOT NULL,
	"discrepancy_reported" boolean DEFAULT false NOT NULL,
	"discrepancy_reason" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "receipts_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "reordering_rules" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"product_id" varchar NOT NULL,
	"warehouse_id" varchar NOT NULL,
	"min_qty" numeric(12, 3) NOT NULL,
	"max_qty" numeric(12, 3) NOT NULL,
	"qty_multiple" numeric(12, 3) DEFAULT '1' NOT NULL,
	"lead_time_days" integer DEFAULT 1 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_triggered_at" timestamp,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rfq_lines" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rfq_id" varchar NOT NULL,
	"product_id" varchar NOT NULL,
	"description" text,
	"quantity" numeric(15, 3) NOT NULL,
	"uom" varchar(20),
	"specifications" text,
	"needed_by_date" date
);
--> statement-breakpoint
CREATE TABLE "rfq_quote_lines" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quote_id" varchar NOT NULL,
	"rfq_line_id" varchar NOT NULL,
	"unit_price" numeric(15, 2),
	"quantity" numeric(15, 3),
	"line_total" numeric(15, 2),
	"lead_time_days" integer,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "rfq_quotes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rfq_id" varchar NOT NULL,
	"supplier_id" varchar NOT NULL,
	"quote_date" date,
	"valid_until" date,
	"total_amount" numeric(15, 2),
	"currency" varchar(3) DEFAULT 'EUR',
	"delivery_lead_time" integer,
	"payment_terms" text,
	"delivery_terms" text,
	"price_score" numeric(3, 1),
	"lead_time_score" numeric(3, 1),
	"supplier_score" numeric(3, 1),
	"overall_score" numeric(3, 1),
	"recommendation" varchar(50),
	"notes" text,
	"attachments" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rfqs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"code" varchar(50) NOT NULL,
	"rfq_date" date NOT NULL,
	"requisition_id" varchar,
	"supplier_ids" jsonb,
	"response_deadline" date,
	"status" varchar(50) DEFAULT 'draft' NOT NULL,
	"created_by" varchar(20) DEFAULT 'user' NOT NULL,
	"created_by_agent_id" varchar(100),
	"selected_quote_id" varchar,
	"selection_reason" text,
	"converted_to_po_id" varchar,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "rfqs_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "sales_orders" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"client_name" text NOT NULL,
	"client_email" text,
	"client_nif" text,
	"client_phone" text,
	"client_id" varchar,
	"order_number" text,
	"items" jsonb NOT NULL,
	"subtotal" numeric(12, 2) DEFAULT '0' NOT NULL,
	"tax_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"source" text DEFAULT 'email' NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"shipping_address" text,
	"notes" text,
	"attachment_url" text,
	"email_inbox_id" varchar,
	"metadata" jsonb,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sandbox_executions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"execution_plan_id" varchar,
	"tenant_id" varchar NOT NULL,
	"module_name" text NOT NULL,
	"execution_tier" text,
	"input_data" jsonb,
	"output_data" jsonb,
	"success" boolean NOT NULL,
	"error_message" text,
	"cpu_ms" integer,
	"memory_mb" integer,
	"latency_ms" integer,
	"executed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schema_versions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"version" integer NOT NULL,
	"promoted_from" varchar,
	"schema_snapshot" jsonb NOT NULL,
	"changes_summary" text,
	"impact_analysis" jsonb,
	"status" text DEFAULT 'active' NOT NULL,
	"promoted_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "specialized_agents" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"layer" text NOT NULL,
	"specialization" text NOT NULL,
	"system_prompt" text NOT NULL,
	"capabilities" jsonb NOT NULL,
	"tools" jsonb NOT NULL,
	"collaborators" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_alerts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"type" text NOT NULL,
	"severity" text DEFAULT 'warning' NOT NULL,
	"product_id" varchar,
	"warehouse_id" varchar,
	"batch_id" varchar,
	"message" text NOT NULL,
	"is_acknowledged" boolean DEFAULT false NOT NULL,
	"acknowledged_by" varchar,
	"acknowledged_at" timestamp,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_moves" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"product_id" varchar NOT NULL,
	"from_location_id" varchar,
	"to_location_id" varchar,
	"qty" numeric(12, 3) NOT NULL,
	"uom" text,
	"state" text DEFAULT 'draft' NOT NULL,
	"picking_id" varchar,
	"batch_id" varchar,
	"linked_document_type" text,
	"linked_document_id" varchar,
	"scheduled_date" timestamp,
	"completed_date" timestamp,
	"performed_by" varchar,
	"notes" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "studio_audit_log" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"user_id" varchar,
	"action" text NOT NULL,
	"resource" text NOT NULL,
	"details" jsonb,
	"status" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_invoices" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"supplier_id" varchar,
	"file_id" varchar,
	"supplier_name" text NOT NULL,
	"nif" varchar(9),
	"invoice_number" text,
	"invoice_date" timestamp,
	"due_date" timestamp,
	"total_amount" numeric(12, 2) NOT NULL,
	"tax_amount" numeric(12, 2),
	"net_amount" numeric(12, 2),
	"currency" text DEFAULT 'EUR' NOT NULL,
	"description" text,
	"line_items" jsonb,
	"pdf_url" text,
	"png_url" text,
	"category" text,
	"cost_center" text,
	"project_id" varchar,
	"purchase_order_id" varchar,
	"email_inbox_id" varchar,
	"status" text DEFAULT 'received' NOT NULL,
	"validation_status" text,
	"validation_errors" jsonb,
	"notes" text,
	"metadata" jsonb,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_price_history" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"product_supplier_id" varchar NOT NULL,
	"price" numeric(15, 2) NOT NULL,
	"currency" varchar(3) DEFAULT 'EUR',
	"valid_from" date NOT NULL,
	"valid_to" date,
	"change_reason" varchar(50),
	"change_percentage" numeric(5, 2),
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_return_lines" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"return_id" varchar NOT NULL,
	"receipt_line_id" varchar,
	"po_line_id" varchar,
	"product_id" varchar,
	"quantity" numeric(15, 3) NOT NULL,
	"uom" varchar(20),
	"return_reason" text,
	"quality_issue" text,
	"unit_price" numeric(15, 2),
	"line_total" numeric(15, 2),
	"batch_number" varchar(100),
	"expiry_date" date,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "supplier_returns" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"code" varchar(50) NOT NULL,
	"return_date" date NOT NULL,
	"supplier_id" varchar NOT NULL,
	"po_id" varchar,
	"receipt_id" varchar,
	"return_reason" varchar(50) DEFAULT 'defective' NOT NULL,
	"return_reason_details" text,
	"total_return_value" numeric(15, 2),
	"currency" varchar(3) DEFAULT 'EUR',
	"status" varchar(50) DEFAULT 'draft' NOT NULL,
	"supplier_approved_at" timestamp,
	"credit_note_number" varchar(100),
	"credit_note_date" date,
	"credit_note_amount" numeric(15, 2),
	"shipping_method" varchar(100),
	"tracking_number" varchar(100),
	"shipped_at" timestamp,
	"received_by_supplier_at" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" varchar,
	CONSTRAINT "supplier_returns_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"code" varchar(50) NOT NULL,
	"name" varchar(255) NOT NULL,
	"legal_name" varchar(255),
	"tax_id" varchar(50),
	"address" text,
	"city" varchar(100),
	"postal_code" varchar(20),
	"country" varchar(2) DEFAULT 'PT',
	"email" varchar(255),
	"phone" varchar(50),
	"website" varchar(255),
	"primary_contact_name" varchar(255),
	"primary_contact_email" varchar(255),
	"primary_contact_phone" varchar(50),
	"category" varchar(50),
	"type" varchar(50) DEFAULT 'approved',
	"payment_terms" text,
	"delivery_terms" text,
	"currency" varchar(3) DEFAULT 'EUR',
	"minimum_order_value" numeric(15, 2),
	"average_lead_time_days" integer,
	"on_time_delivery_rate" numeric(5, 2),
	"quality_score" numeric(3, 1),
	"price_competitiveness" numeric(3, 1),
	"communication_score" numeric(3, 1),
	"overall_score" numeric(3, 1),
	"total_orders_count" integer DEFAULT 0,
	"total_orders_value" numeric(15, 2) DEFAULT '0',
	"average_order_value" numeric(15, 2),
	"last_order_date" date,
	"defect_rate" numeric(5, 2) DEFAULT '0',
	"return_rate" numeric(5, 2) DEFAULT '0',
	"complaint_count" integer DEFAULT 0,
	"bank_name" varchar(255),
	"iban" varchar(50),
	"swift_bic" varchar(11),
	"is_active" boolean DEFAULT true,
	"blocked_reason" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" varchar,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by" varchar,
	CONSTRAINT "suppliers_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar,
	"environment" text DEFAULT 'production' NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'todo' NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"due_date" timestamp,
	"tags" jsonb,
	"client_id" varchar,
	"conversation_id" varchar,
	"assigned_to" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tax_categories" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"name" text NOT NULL,
	"tax_type" text NOT NULL,
	"default_tax_rate_id" varchar,
	"country" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tax_jurisdictions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"country" text NOT NULL,
	"jurisdiction_type" text NOT NULL,
	"name" text NOT NULL,
	"tax_authority" text,
	"vat_registration_required" boolean DEFAULT false,
	"vat_rates" jsonb,
	"tax_rules" jsonb,
	"filing_frequency" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tax_obligations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"country" text NOT NULL,
	"obligation_type" text NOT NULL,
	"description" text,
	"due_date" timestamp NOT NULL,
	"frequency" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"filed_at" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tax_rates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"country" text NOT NULL,
	"jurisdiction_id" varchar,
	"tax_type" text NOT NULL,
	"rate_name" text NOT NULL,
	"rate_percentage" numeric(5, 2) NOT NULL,
	"effective_from" timestamp NOT NULL,
	"effective_to" timestamp,
	"applicable_to" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_blueprints" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"business_type" text,
	"sector" text,
	"processes" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_blueprints_tenant_id_unique" UNIQUE("tenant_id")
);
--> statement-breakpoint
CREATE TABLE "tenant_code_artifacts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"environment" text NOT NULL,
	"artifact_path" text NOT NULL,
	"artifact_hash" text NOT NULL,
	"size_bytes" integer,
	"build_metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_code_files" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"environment" text NOT NULL,
	"file_path" text NOT NULL,
	"code" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"language" text DEFAULT 'typescript' NOT NULL,
	"metadata" jsonb,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_code_modules" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"module_name" text NOT NULL,
	"module_type" text,
	"entry_file_id" varchar,
	"dependencies" jsonb,
	"exports" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_code_releases" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"environment" text NOT NULL,
	"artifact_id" varchar,
	"version_tag" text,
	"release_notes" text,
	"deployed_by" varchar,
	"deployed_at" timestamp DEFAULT now() NOT NULL,
	"blueprint_version_id" varchar,
	"approver_user_id" varchar,
	"artifact_hash" text NOT NULL,
	"risk_level_at_deploy" text,
	"governance_snapshot" jsonb
);
--> statement-breakpoint
CREATE TABLE "tenant_code_tests" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"module_id" varchar,
	"test_name" text NOT NULL,
	"test_code" text NOT NULL,
	"test_type" text,
	"last_run_status" text,
	"last_run_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_context" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" varchar NOT NULL,
	"business_attributes" jsonb,
	"active_modules" jsonb DEFAULT '[]'::jsonb,
	"configuration_state" jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_context_tenant_id_unique" UNIQUE("tenant_id")
);
--> statement-breakpoint
CREATE TABLE "tenant_invitations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"email" text NOT NULL,
	"role" text DEFAULT 'user' NOT NULL,
	"token" text NOT NULL,
	"created_by" varchar NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_invitations_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "tenant_memory_facts" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"company_name" varchar(255),
	"business_sector" varchar(100),
	"main_goals" text,
	"key_requirements" text,
	"technical_constraints" text,
	"user_preferences" text,
	"extracted_at" timestamp DEFAULT now() NOT NULL,
	"last_updated" timestamp DEFAULT now() NOT NULL,
	"confidence" integer DEFAULT 0,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_modules" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"module_id" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"installed_at" timestamp DEFAULT now() NOT NULL,
	"installed_by" varchar,
	"config" jsonb,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_secrets" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"environment" text NOT NULL,
	"key_name" text NOT NULL,
	"encrypted_value" text NOT NULL,
	"encryption_key_id" text,
	"rotation_policy" jsonb,
	"last_rotated_at" timestamp,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"industry" text,
	"logo" text,
	"settings" jsonb,
	"status" text DEFAULT 'active' NOT NULL,
	"enable_advanced_tools" boolean DEFAULT false NOT NULL,
	"country" text DEFAULT 'PT' NOT NULL,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"timezone" text DEFAULT 'Europe/Lisbon' NOT NULL,
	"fiscal_year_start" text DEFAULT '01-01' NOT NULL,
	"accounting_standard" text DEFAULT 'SNC' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "user_agent_interactions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"conversation_id" varchar,
	"message_id" varchar,
	"agent_name" text NOT NULL,
	"user_message" text NOT NULL,
	"system_context" text,
	"tool_context" jsonb,
	"agent_response" text NOT NULL,
	"action_taken" jsonb,
	"success_flag" boolean DEFAULT true,
	"error_message" text,
	"was_rolled_back" boolean DEFAULT false,
	"user_feedback" text,
	"feedback_comment" text,
	"tokens_used" integer,
	"response_time_ms" integer,
	"model_used" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_oauth_tokens" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"tenant_id" varchar NOT NULL,
	"connector_slug" text NOT NULL,
	"provider" text NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text,
	"token_type" text DEFAULT 'Bearer',
	"expires_at" timestamp,
	"scope" text,
	"provider_user_id" text,
	"provider_email" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"tenant_id" varchar NOT NULL,
	"role" varchar(50),
	"department" varchar(50),
	"seniority" varchar(30),
	"preferences" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_tenants" (
	"user_id" varchar NOT NULL,
	"tenant_id" varchar NOT NULL,
	"role" text DEFAULT 'user' NOT NULL,
	"permissions" jsonb,
	"scopes" jsonb,
	"active_environment" text DEFAULT 'production' NOT NULL,
	"studio_mode" text DEFAULT 'build' NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	"invited_by" varchar
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"password" text,
	"google_id" text,
	"avatar" text,
	"preferences" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_platform_admin" boolean DEFAULT false NOT NULL,
	"last_login" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_google_id_unique" UNIQUE("google_id")
);
--> statement-breakpoint
CREATE TABLE "vat_returns" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"country" text NOT NULL,
	"filing_status" text DEFAULT 'draft' NOT NULL,
	"total_sales" numeric(15, 2),
	"total_purchases" numeric(15, 2),
	"vat_collected" numeric(15, 2),
	"vat_paid" numeric(15, 2),
	"vat_due" numeric(15, 2),
	"currency" text DEFAULT 'EUR' NOT NULL,
	"export_data" jsonb,
	"filed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warehouse_locations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"warehouse_id" varchar NOT NULL,
	"name" text NOT NULL,
	"code" text,
	"parent_location_id" varchar,
	"location_type" text DEFAULT 'internal' NOT NULL,
	"barcode" text,
	"capacity" numeric(12, 2),
	"is_active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warehouses" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"name" text NOT NULL,
	"type" text DEFAULT 'central' NOT NULL,
	"address" text,
	"city" text,
	"postal_code" text,
	"is_virtual" boolean DEFAULT false NOT NULL,
	"capacity" numeric(12, 2),
	"responsible_user" varchar,
	"is_active" boolean DEFAULT true NOT NULL,
	"linked_project_id" varchar,
	"available_for_projects" boolean DEFAULT false NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhooks" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"webhook_key" varchar NOT NULL,
	"webhook_name" text NOT NULL,
	"target_entity_key" varchar NOT NULL,
	"field_mapping" jsonb NOT NULL,
	"auth_method" varchar,
	"auth_config" jsonb,
	"is_active" boolean DEFAULT true,
	"environment" varchar NOT NULL,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"metadata" jsonb,
	CONSTRAINT "webhooks_webhook_key_unique" UNIQUE("webhook_key")
);
--> statement-breakpoint
ALTER TABLE "agent_budgets" ADD CONSTRAINT "agent_budgets_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_executions" ADD CONSTRAINT "agent_executions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_feedback" ADD CONSTRAINT "agent_feedback_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_feedback" ADD CONSTRAINT "agent_feedback_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_handoffs" ADD CONSTRAINT "agent_handoffs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_handoffs" ADD CONSTRAINT "agent_handoffs_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_handoffs" ADD CONSTRAINT "agent_handoffs_from_agent_id_specialized_agents_id_fk" FOREIGN KEY ("from_agent_id") REFERENCES "public"."specialized_agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_handoffs" ADD CONSTRAINT "agent_handoffs_to_agent_id_specialized_agents_id_fk" FOREIGN KEY ("to_agent_id") REFERENCES "public"."specialized_agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_interactions" ADD CONSTRAINT "agent_interactions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_interactions" ADD CONSTRAINT "agent_interactions_from_agent_id_specialized_agents_id_fk" FOREIGN KEY ("from_agent_id") REFERENCES "public"."specialized_agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_interactions" ADD CONSTRAINT "agent_interactions_to_agent_id_specialized_agents_id_fk" FOREIGN KEY ("to_agent_id") REFERENCES "public"."specialized_agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_interactions" ADD CONSTRAINT "agent_interactions_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_learnings" ADD CONSTRAINT "agent_learnings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_learnings" ADD CONSTRAINT "agent_learnings_agent_id_specialized_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."specialized_agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_role_assignments" ADD CONSTRAINT "agent_role_assignments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_role_assignments" ADD CONSTRAINT "agent_role_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_role_assignments" ADD CONSTRAINT "agent_role_assignments_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_schedules" ADD CONSTRAINT "agent_schedules_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_secrets" ADD CONSTRAINT "agent_secrets_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_secrets" ADD CONSTRAINT "agent_secrets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_secrets" ADD CONSTRAINT "agent_secrets_last_rotated_by_users_id_fk" FOREIGN KEY ("last_rotated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_state" ADD CONSTRAINT "agent_state_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_tags" ADD CONSTRAINT "agent_tags_agent_id_agents_library_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents_library"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_versions" ADD CONSTRAINT "agent_versions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_versions" ADD CONSTRAINT "agent_versions_deployed_by_users_id_fk" FOREIGN KEY ("deployed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_workflows" ADD CONSTRAINT "agent_workflows_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_workflows" ADD CONSTRAINT "agent_workflows_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents_library" ADD CONSTRAINT "agents_library_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_integrations" ADD CONSTRAINT "api_integrations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_reconciliations" ADD CONSTRAINT "bank_reconciliations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_statement_transactions" ADD CONSTRAINT "bank_statement_transactions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_statement_transactions" ADD CONSTRAINT "bank_statement_transactions_bank_reconciliation_id_bank_reconciliations_id_fk" FOREIGN KEY ("bank_reconciliation_id") REFERENCES "public"."bank_reconciliations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_statement_transactions" ADD CONSTRAINT "bank_statement_transactions_matched_payment_id_payments_id_fk" FOREIGN KEY ("matched_payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blueprint_health" ADD CONSTRAINT "blueprint_health_blueprint_version_id_blueprint_versions_id_fk" FOREIGN KEY ("blueprint_version_id") REFERENCES "public"."blueprint_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blueprint_improvements" ADD CONSTRAINT "blueprint_improvements_blueprint_id_blueprint_templates_id_fk" FOREIGN KEY ("blueprint_id") REFERENCES "public"."blueprint_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blueprint_improvements" ADD CONSTRAINT "blueprint_improvements_source_tenant_id_tenants_id_fk" FOREIGN KEY ("source_tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blueprint_improvements" ADD CONSTRAINT "blueprint_improvements_implemented_in_version_id_blueprint_versions_id_fk" FOREIGN KEY ("implemented_in_version_id") REFERENCES "public"."blueprint_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blueprint_signatures" ADD CONSTRAINT "blueprint_signatures_blueprint_id_blueprint_templates_id_fk" FOREIGN KEY ("blueprint_id") REFERENCES "public"."blueprint_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blueprint_templates" ADD CONSTRAINT "blueprint_templates_created_by_tenant_id_tenants_id_fk" FOREIGN KEY ("created_by_tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blueprint_usage_stats" ADD CONSTRAINT "blueprint_usage_stats_blueprint_version_id_blueprint_versions_id_fk" FOREIGN KEY ("blueprint_version_id") REFERENCES "public"."blueprint_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blueprint_usage_stats" ADD CONSTRAINT "blueprint_usage_stats_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blueprint_versions" ADD CONSTRAINT "blueprint_versions_blueprint_id_blueprint_templates_id_fk" FOREIGN KEY ("blueprint_id") REFERENCES "public"."blueprint_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blueprints" ADD CONSTRAINT "blueprints_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_alerts" ADD CONSTRAINT "budget_alerts_budget_id_agent_budgets_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."agent_budgets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_alerts" ADD CONSTRAINT "budget_alerts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_menu_items" ADD CONSTRAINT "budget_menu_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_package_items" ADD CONSTRAINT "budget_package_items_package_id_budget_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."budget_packages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_package_items" ADD CONSTRAINT "budget_package_items_menu_item_id_budget_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."budget_menu_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_packages" ADD CONSTRAINT "budget_packages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_quote_items" ADD CONSTRAINT "budget_quote_items_quote_id_budget_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."budget_quotes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_quote_items" ADD CONSTRAINT "budget_quote_items_menu_item_id_budget_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."budget_menu_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_quote_versions" ADD CONSTRAINT "budget_quote_versions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_quote_versions" ADD CONSTRAINT "budget_quote_versions_quote_id_budget_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."budget_quotes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_quote_versions" ADD CONSTRAINT "budget_quote_versions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_quote_versions" ADD CONSTRAINT "budget_quote_versions_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_quote_versions" ADD CONSTRAINT "budget_quote_versions_rejected_by_users_id_fk" FOREIGN KEY ("rejected_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_quotes" ADD CONSTRAINT "budget_quotes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_quotes" ADD CONSTRAINT "budget_quotes_lead_id_commercial_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."commercial_leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_quotes" ADD CONSTRAINT "budget_quotes_package_id_budget_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."budget_packages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_quotes" ADD CONSTRAINT "budget_quotes_converted_to_project_id_projects_id_fk" FOREIGN KEY ("converted_to_project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_quotes" ADD CONSTRAINT "budget_quotes_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_staff_roles" ADD CONSTRAINT "budget_staff_roles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_staff_roles" ADD CONSTRAINT "budget_staff_roles_package_id_budget_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."budget_packages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_transport_rules" ADD CONSTRAINT "budget_transport_rules_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_transport_rules" ADD CONSTRAINT "budget_transport_rules_package_id_budget_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."budget_packages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_blueprints" ADD CONSTRAINT "business_blueprints_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_blueprints" ADD CONSTRAINT "business_blueprints_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catering_kitchen_workflows" ADD CONSTRAINT "catering_kitchen_workflows_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catering_kitchen_workflows" ADD CONSTRAINT "catering_kitchen_workflows_work_order_id_production_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."production_work_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catering_kitchen_workflows" ADD CONSTRAINT "catering_kitchen_workflows_operation_id_production_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."production_operations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catering_kitchen_workflows" ADD CONSTRAINT "catering_kitchen_workflows_chef_assigned_users_id_fk" FOREIGN KEY ("chef_assigned") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catering_logistics" ADD CONSTRAINT "catering_logistics_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catering_logistics" ADD CONSTRAINT "catering_logistics_prep_list_id_catering_prep_lists_id_fk" FOREIGN KEY ("prep_list_id") REFERENCES "public"."catering_prep_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catering_logistics" ADD CONSTRAINT "catering_logistics_work_order_id_production_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."production_work_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catering_logistics" ADD CONSTRAINT "catering_logistics_driver_assigned_users_id_fk" FOREIGN KEY ("driver_assigned") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catering_prep_lists" ADD CONSTRAINT "catering_prep_lists_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catering_prep_lists" ADD CONSTRAINT "catering_prep_lists_work_order_id_production_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."production_work_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catering_prep_lists" ADD CONSTRAINT "catering_prep_lists_event_id_projects_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chart_of_accounts" ADD CONSTRAINT "chart_of_accounts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_generation_audit" ADD CONSTRAINT "code_generation_audit_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_generation_audit" ADD CONSTRAINT "code_generation_audit_execution_plan_id_execution_plans_id_fk" FOREIGN KEY ("execution_plan_id") REFERENCES "public"."execution_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_generation_audit" ADD CONSTRAINT "code_generation_audit_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_generation_audit" ADD CONSTRAINT "code_generation_audit_blueprint_id_blueprint_templates_id_fk" FOREIGN KEY ("blueprint_id") REFERENCES "public"."blueprint_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_validation_results" ADD CONSTRAINT "code_validation_results_execution_plan_id_execution_plans_id_fk" FOREIGN KEY ("execution_plan_id") REFERENCES "public"."execution_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_activities" ADD CONSTRAINT "commercial_activities_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_activities" ADD CONSTRAINT "commercial_activities_lead_id_commercial_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."commercial_leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_activities" ADD CONSTRAINT "commercial_activities_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_activities" ADD CONSTRAINT "commercial_activities_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_agent_configs" ADD CONSTRAINT "commercial_agent_configs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_agent_executions" ADD CONSTRAINT "commercial_agent_executions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_agent_executions" ADD CONSTRAINT "commercial_agent_executions_agent_config_id_commercial_agent_configs_id_fk" FOREIGN KEY ("agent_config_id") REFERENCES "public"."commercial_agent_configs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_agent_executions" ADD CONSTRAINT "commercial_agent_executions_lead_id_commercial_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."commercial_leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_ai_suggestions" ADD CONSTRAINT "commercial_ai_suggestions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_ai_suggestions" ADD CONSTRAINT "commercial_ai_suggestions_lead_id_commercial_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."commercial_leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_ai_suggestions" ADD CONSTRAINT "commercial_ai_suggestions_email_event_id_commercial_email_events_id_fk" FOREIGN KEY ("email_event_id") REFERENCES "public"."commercial_email_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_ai_suggestions" ADD CONSTRAINT "commercial_ai_suggestions_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_automation_rules" ADD CONSTRAINT "commercial_automation_rules_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_automation_rules" ADD CONSTRAINT "commercial_automation_rules_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_budget_alerts" ADD CONSTRAINT "commercial_budget_alerts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_budget_alerts" ADD CONSTRAINT "commercial_budget_alerts_quote_id_budget_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."budget_quotes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_budget_alerts" ADD CONSTRAINT "commercial_budget_alerts_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_conversion_metrics" ADD CONSTRAINT "commercial_conversion_metrics_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_conversion_metrics" ADD CONSTRAINT "commercial_conversion_metrics_pipeline_stage_id_commercial_pipeline_id_fk" FOREIGN KEY ("pipeline_stage_id") REFERENCES "public"."commercial_pipeline"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_email_events" ADD CONSTRAINT "commercial_email_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_email_events" ADD CONSTRAINT "commercial_email_events_lead_id_commercial_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."commercial_leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_email_events" ADD CONSTRAINT "commercial_email_events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_email_sequences" ADD CONSTRAINT "commercial_email_sequences_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_email_sequences" ADD CONSTRAINT "commercial_email_sequences_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_email_templates" ADD CONSTRAINT "commercial_email_templates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_email_templates" ADD CONSTRAINT "commercial_email_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_forecasts" ADD CONSTRAINT "commercial_forecasts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_lead_scoring" ADD CONSTRAINT "commercial_lead_scoring_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_lead_scoring" ADD CONSTRAINT "commercial_lead_scoring_lead_id_commercial_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."commercial_leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_lead_sources" ADD CONSTRAINT "commercial_lead_sources_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_leads" ADD CONSTRAINT "commercial_leads_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_leads" ADD CONSTRAINT "commercial_leads_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_leads" ADD CONSTRAINT "commercial_leads_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_pipeline" ADD CONSTRAINT "commercial_pipeline_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_quote_versions" ADD CONSTRAINT "commercial_quote_versions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_quote_versions" ADD CONSTRAINT "commercial_quote_versions_lead_id_commercial_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."commercial_leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_quote_versions" ADD CONSTRAINT "commercial_quote_versions_sent_by_users_id_fk" FOREIGN KEY ("sent_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_tasks" ADD CONSTRAINT "commercial_tasks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_tasks" ADD CONSTRAINT "commercial_tasks_lead_id_commercial_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."commercial_leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_tasks" ADD CONSTRAINT "commercial_tasks_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_tasks" ADD CONSTRAINT "commercial_tasks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_info" ADD CONSTRAINT "company_info_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "config_requests" ADD CONSTRAINT "config_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "config_requests" ADD CONSTRAINT "config_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "config_requests" ADD CONSTRAINT "config_requests_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "configuration_checkpoints" ADD CONSTRAINT "configuration_checkpoints_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "configuration_checkpoints" ADD CONSTRAINT "configuration_checkpoints_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_insights" ADD CONSTRAINT "conversation_insights_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_insights" ADD CONSTRAINT "conversation_insights_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversion_agents" ADD CONSTRAINT "conversion_agents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversion_agents" ADD CONSTRAINT "conversion_agents_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_agents" ADD CONSTRAINT "custom_agents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_entities" ADD CONSTRAINT "custom_entities_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_entities" ADD CONSTRAINT "custom_entities_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_entity_records" ADD CONSTRAINT "custom_entity_records_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_entity_records" ADD CONSTRAINT "custom_entity_records_entity_id_custom_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."custom_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_entity_records" ADD CONSTRAINT "custom_entity_records_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_entity_records" ADD CONSTRAINT "custom_entity_records_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_fields" ADD CONSTRAINT "custom_fields_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_fields" ADD CONSTRAINT "custom_fields_entity_id_custom_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."custom_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "detected_gaps" ADD CONSTRAINT "detected_gaps_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "detected_gaps" ADD CONSTRAINT "detected_gaps_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "detected_gaps" ADD CONSTRAINT "detected_gaps_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "development_requests" ADD CONSTRAINT "development_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "development_requests" ADD CONSTRAINT "development_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "development_requests" ADD CONSTRAINT "development_requests_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_analyses" ADD CONSTRAINT "document_analyses_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_analyses" ADD CONSTRAINT "document_analyses_file_id_file_attachments_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."file_attachments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_analyses" ADD CONSTRAINT "document_analyses_template_id_document_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."document_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_analyses" ADD CONSTRAINT "document_analyses_analyzed_by_users_id_fk" FOREIGN KEY ("analyzed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_insights" ADD CONSTRAINT "document_insights_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_insights" ADD CONSTRAINT "document_insights_analysis_id_document_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."document_analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_insights" ADD CONSTRAINT "document_insights_acknowledged_by_users_id_fk" FOREIGN KEY ("acknowledged_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_integrations" ADD CONSTRAINT "document_integrations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_integrations" ADD CONSTRAINT "document_integrations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_quality_checks" ADD CONSTRAINT "document_quality_checks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_quality_checks" ADD CONSTRAINT "document_quality_checks_analysis_id_document_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."document_analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_quality_checks" ADD CONSTRAINT "document_quality_checks_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_templates" ADD CONSTRAINT "document_templates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_templates" ADD CONSTRAINT "document_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_original_file_id_file_attachments_id_fk" FOREIGN KEY ("original_file_id") REFERENCES "public"."file_attachments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_file_id_file_attachments_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."file_attachments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_alerts" ADD CONSTRAINT "email_alerts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_alerts" ADD CONSTRAINT "email_alerts_email_id_email_inbox_id_fk" FOREIGN KEY ("email_id") REFERENCES "public"."email_inbox"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_alerts" ADD CONSTRAINT "email_alerts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_inbox" ADD CONSTRAINT "email_inbox_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_response_learnings" ADD CONSTRAINT "email_response_learnings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_response_learnings" ADD CONSTRAINT "email_response_learnings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_expenses" ADD CONSTRAINT "employee_expenses_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_expenses" ADD CONSTRAINT "employee_expenses_employee_id_users_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_expenses" ADD CONSTRAINT "employee_expenses_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_expenses" ADD CONSTRAINT "employee_expenses_person_id_users_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_expenses" ADD CONSTRAINT "employee_expenses_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_expenses" ADD CONSTRAINT "employee_expenses_reimbursement_payment_id_purchasing_payments_id_fk" FOREIGN KEY ("reimbursement_payment_id") REFERENCES "public"."purchasing_payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_menu_items" ADD CONSTRAINT "entity_menu_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_menu_items" ADD CONSTRAINT "entity_menu_items_entity_id_custom_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."custom_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_views" ADD CONSTRAINT "entity_views_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_views" ADD CONSTRAINT "entity_views_entity_id_custom_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."custom_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_workflow_states" ADD CONSTRAINT "entity_workflow_states_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_workflow_states" ADD CONSTRAINT "entity_workflow_states_entity_id_custom_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."custom_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_allocations" ADD CONSTRAINT "equipment_allocations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_allocations" ADD CONSTRAINT "equipment_allocations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_allocations" ADD CONSTRAINT "equipment_allocations_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_allocations" ADD CONSTRAINT "equipment_allocations_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_allocations" ADD CONSTRAINT "equipment_allocations_checked_out_by_users_id_fk" FOREIGN KEY ("checked_out_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_allocations" ADD CONSTRAINT "equipment_allocations_checked_in_by_users_id_fk" FOREIGN KEY ("checked_in_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_conditions" ADD CONSTRAINT "equipment_conditions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_conditions" ADD CONSTRAINT "equipment_conditions_allocation_id_equipment_allocations_id_fk" FOREIGN KEY ("allocation_id") REFERENCES "public"."equipment_allocations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_conditions" ADD CONSTRAINT "equipment_conditions_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_conditions" ADD CONSTRAINT "equipment_conditions_reported_by_users_id_fk" FOREIGN KEY ("reported_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_conditions" ADD CONSTRAINT "equipment_conditions_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_plans" ADD CONSTRAINT "execution_plans_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_plans" ADD CONSTRAINT "execution_plans_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_traces" ADD CONSTRAINT "execution_traces_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "field_patterns" ADD CONSTRAINT "field_patterns_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_attachments" ADD CONSTRAINT "file_attachments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_attachments" ADD CONSTRAINT "file_attachments_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_calculations" ADD CONSTRAINT "financial_calculations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_calculations" ADD CONSTRAINT "financial_calculations_model_id_financial_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."financial_models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_calculations" ADD CONSTRAINT "financial_calculations_scenario_id_financial_scenarios_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."financial_scenarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_calculations" ADD CONSTRAINT "financial_calculations_executed_by_users_id_fk" FOREIGN KEY ("executed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_models" ADD CONSTRAINT "financial_models_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_patterns" ADD CONSTRAINT "financial_patterns_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_scenarios" ADD CONSTRAINT "financial_scenarios_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_scenarios" ADD CONSTRAINT "financial_scenarios_model_id_financial_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."financial_models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_scenarios" ADD CONSTRAINT "financial_scenarios_base_scenario_id_financial_scenarios_id_fk" FOREIGN KEY ("base_scenario_id") REFERENCES "public"."financial_scenarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_scenarios" ADD CONSTRAINT "financial_scenarios_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiscal_periods" ADD CONSTRAINT "fiscal_periods_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiscal_periods" ADD CONSTRAINT "fiscal_periods_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "format_adjustments" ADD CONSTRAINT "format_adjustments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "format_adjustments" ADD CONSTRAINT "format_adjustments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gold_labels" ADD CONSTRAINT "gold_labels_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gold_labels" ADD CONSTRAINT "gold_labels_corrected_by_users_id_fk" FOREIGN KEY ("corrected_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_policies" ADD CONSTRAINT "governance_policies_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_policies" ADD CONSTRAINT "governance_policies_last_updated_by_user_id_users_id_fk" FOREIGN KEY ("last_updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_batches" ADD CONSTRAINT "inventory_batches_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_batches" ADD CONSTRAINT "inventory_batches_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_batches" ADD CONSTRAINT "inventory_batches_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_counts" ADD CONSTRAINT "inventory_counts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_counts" ADD CONSTRAINT "inventory_counts_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_counts" ADD CONSTRAINT "inventory_counts_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_counts" ADD CONSTRAINT "inventory_counts_counted_by_users_id_fk" FOREIGN KEY ("counted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_counts" ADD CONSTRAINT "inventory_counts_adjustment_transaction_id_inventory_transactions_id_fk" FOREIGN KEY ("adjustment_transaction_id") REFERENCES "public"."inventory_transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_levels" ADD CONSTRAINT "inventory_levels_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_levels" ADD CONSTRAINT "inventory_levels_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_levels" ADD CONSTRAINT "inventory_levels_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_levels" ADD CONSTRAINT "inventory_levels_reserved_for_project_id_projects_id_fk" FOREIGN KEY ("reserved_for_project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_batch_id_inventory_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."inventory_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_warehouse_from_id_warehouses_id_fk" FOREIGN KEY ("warehouse_from_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_warehouse_to_id_warehouses_id_fk" FOREIGN KEY ("warehouse_to_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_performed_by_users_id_fk" FOREIGN KEY ("performed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_taxes" ADD CONSTRAINT "invoice_taxes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_taxes" ADD CONSTRAINT "invoice_taxes_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_validations" ADD CONSTRAINT "invoice_validations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_validations" ADD CONSTRAINT "invoice_validations_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_validations" ADD CONSTRAINT "invoice_validations_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_email_inbox_id_email_inbox_id_fk" FOREIGN KEY ("email_inbox_id") REFERENCES "public"."email_inbox"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_entry_id_journal_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learned_preferences" ADD CONSTRAINT "learned_preferences_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learned_preferences" ADD CONSTRAINT "learned_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_schedule" ADD CONSTRAINT "maintenance_schedule_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_schedule" ADD CONSTRAINT "maintenance_schedule_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_schedule" ADD CONSTRAINT "maintenance_schedule_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_schedule" ADD CONSTRAINT "maintenance_schedule_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_schedule" ADD CONSTRAINT "maintenance_schedule_completed_by_users_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_adjustments" ADD CONSTRAINT "model_adjustments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "module_agents" ADD CONSTRAINT "module_agents_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "module_agents" ADD CONSTRAINT "module_agents_agent_library_id_agents_library_id_fk" FOREIGN KEY ("agent_library_id") REFERENCES "public"."agents_library"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "module_custom_fields" ADD CONSTRAINT "module_custom_fields_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "module_features" ADD CONSTRAINT "module_features_tenant_module_id_tenant_modules_id_fk" FOREIGN KEY ("tenant_module_id") REFERENCES "public"."tenant_modules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "module_interface_config" ADD CONSTRAINT "module_interface_config_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modules" ADD CONSTRAINT "modules_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_cache" ADD CONSTRAINT "onboarding_cache_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_cache" ADD CONSTRAINT "onboarding_cache_converted_to_tenant_id_tenants_id_fk" FOREIGN KEY ("converted_to_tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "open_banking_accounts" ADD CONSTRAINT "open_banking_accounts_connection_id_open_banking_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."open_banking_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "open_banking_accounts" ADD CONSTRAINT "open_banking_accounts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "open_banking_accounts" ADD CONSTRAINT "open_banking_accounts_linked_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("linked_bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "open_banking_connections" ADD CONSTRAINT "open_banking_connections_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "open_banking_connections" ADD CONSTRAINT "open_banking_connections_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "open_banking_transactions" ADD CONSTRAINT "open_banking_transactions_account_id_open_banking_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."open_banking_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "open_banking_transactions" ADD CONSTRAINT "open_banking_transactions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "open_banking_transactions" ADD CONSTRAINT "open_banking_transactions_bank_reconciliation_id_bank_reconciliations_id_fk" FOREIGN KEY ("bank_reconciliation_id") REFERENCES "public"."bank_reconciliations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "open_banking_transactions" ADD CONSTRAINT "open_banking_transactions_matched_payment_id_payments_id_fk" FOREIGN KEY ("matched_payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payables" ADD CONSTRAINT "payables_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payables" ADD CONSTRAINT "payables_supplier_invoice_id_supplier_invoices_id_fk" FOREIGN KEY ("supplier_invoice_id") REFERENCES "public"."supplier_invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payables" ADD CONSTRAINT "payables_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payables" ADD CONSTRAINT "payables_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_reminders" ADD CONSTRAINT "payment_reminders_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_reminders" ADD CONSTRAINT "payment_reminders_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_reminders" ADD CONSTRAINT "payment_reminders_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "picking_batches" ADD CONSTRAINT "picking_batches_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "picking_batches" ADD CONSTRAINT "picking_batches_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "picking_batches" ADD CONSTRAINT "picking_batches_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presentation_patterns" ADD CONSTRAINT "presentation_patterns_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing_addons" ADD CONSTRAINT "pricing_addons_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing_catalog_categories" ADD CONSTRAINT "pricing_catalog_categories_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing_catalogs" ADD CONSTRAINT "pricing_catalogs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing_catalogs" ADD CONSTRAINT "pricing_catalogs_category_id_pricing_catalog_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."pricing_catalog_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing_discounts" ADD CONSTRAINT "pricing_discounts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing_input_schemas" ADD CONSTRAINT "pricing_input_schemas_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing_line_items" ADD CONSTRAINT "pricing_line_items_project_id_pricing_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."pricing_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing_line_items" ADD CONSTRAINT "pricing_line_items_module_id_pricing_project_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."pricing_project_modules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing_line_items" ADD CONSTRAINT "pricing_line_items_catalog_item_id_pricing_catalogs_id_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."pricing_catalogs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing_project_modules" ADD CONSTRAINT "pricing_project_modules_project_id_pricing_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."pricing_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing_projects" ADD CONSTRAINT "pricing_projects_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing_projects" ADD CONSTRAINT "pricing_projects_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing_projects" ADD CONSTRAINT "pricing_projects_rule_set_id_pricing_rule_sets_id_fk" FOREIGN KEY ("rule_set_id") REFERENCES "public"."pricing_rule_sets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing_projects" ADD CONSTRAINT "pricing_projects_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing_rule_entries" ADD CONSTRAINT "pricing_rule_entries_rule_set_id_pricing_rule_sets_id_fk" FOREIGN KEY ("rule_set_id") REFERENCES "public"."pricing_rule_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing_rule_entries" ADD CONSTRAINT "pricing_rule_entries_catalog_item_id_pricing_catalogs_id_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."pricing_catalogs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing_rule_sets" ADD CONSTRAINT "pricing_rule_sets_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing_rule_sets" ADD CONSTRAINT "pricing_rule_sets_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing_rule_sets" ADD CONSTRAINT "pricing_rule_sets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing_taxes" ADD CONSTRAINT "pricing_taxes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "process_optimizations" ADD CONSTRAINT "process_optimizations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_specifications" ADD CONSTRAINT "product_specifications_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_specifications" ADD CONSTRAINT "product_specifications_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_suppliers" ADD CONSTRAINT "product_suppliers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_suppliers" ADD CONSTRAINT "product_suppliers_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_suppliers" ADD CONSTRAINT "product_suppliers_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_batches" ADD CONSTRAINT "production_batches_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_batches" ADD CONSTRAINT "production_batches_work_order_id_production_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."production_work_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_batches" ADD CONSTRAINT "production_batches_produced_by_users_id_fk" FOREIGN KEY ("produced_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_batches" ADD CONSTRAINT "production_batches_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_execution_logs" ADD CONSTRAINT "production_execution_logs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_execution_logs" ADD CONSTRAINT "production_execution_logs_blueprint_version_id_blueprint_versions_id_fk" FOREIGN KEY ("blueprint_version_id") REFERENCES "public"."blueprint_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_integrations" ADD CONSTRAINT "production_integrations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_integrations" ADD CONSTRAINT "production_integrations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_operations" ADD CONSTRAINT "production_operations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_operations" ADD CONSTRAINT "production_operations_work_order_id_production_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."production_work_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_operations" ADD CONSTRAINT "production_operations_started_by_users_id_fk" FOREIGN KEY ("started_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_operations" ADD CONSTRAINT "production_operations_completed_by_users_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_quality_checks" ADD CONSTRAINT "production_quality_checks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_quality_checks" ADD CONSTRAINT "production_quality_checks_work_order_id_production_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."production_work_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_quality_checks" ADD CONSTRAINT "production_quality_checks_operation_id_production_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."production_operations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_quality_checks" ADD CONSTRAINT "production_quality_checks_batch_id_production_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."production_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_quality_checks" ADD CONSTRAINT "production_quality_checks_performed_by_users_id_fk" FOREIGN KEY ("performed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_quality_checks" ADD CONSTRAINT "production_quality_checks_validated_by_users_id_fk" FOREIGN KEY ("validated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_work_order_materials" ADD CONSTRAINT "production_work_order_materials_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_work_order_materials" ADD CONSTRAINT "production_work_order_materials_work_order_id_production_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."production_work_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_work_order_materials" ADD CONSTRAINT "production_work_order_materials_issued_by_users_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_work_orders" ADD CONSTRAINT "production_work_orders_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_work_orders" ADD CONSTRAINT "production_work_orders_specification_id_product_specifications_id_fk" FOREIGN KEY ("specification_id") REFERENCES "public"."product_specifications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_work_orders" ADD CONSTRAINT "production_work_orders_quote_id_budget_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."budget_quotes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_work_orders" ADD CONSTRAINT "production_work_orders_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_work_orders" ADD CONSTRAINT "production_work_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_activity_logs" ADD CONSTRAINT "project_activity_logs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_activity_logs" ADD CONSTRAINT "project_activity_logs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_activity_logs" ADD CONSTRAINT "project_activity_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_approvals" ADD CONSTRAINT "project_approvals_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_approvals" ADD CONSTRAINT "project_approvals_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_approvals" ADD CONSTRAINT "project_approvals_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_approvals" ADD CONSTRAINT "project_approvals_final_decision_by_users_id_fk" FOREIGN KEY ("final_decision_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_change_requests" ADD CONSTRAINT "project_change_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_change_requests" ADD CONSTRAINT "project_change_requests_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_change_requests" ADD CONSTRAINT "project_change_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_change_requests" ADD CONSTRAINT "project_change_requests_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_change_requests" ADD CONSTRAINT "project_change_requests_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_change_requests" ADD CONSTRAINT "project_change_requests_implemented_by_users_id_fk" FOREIGN KEY ("implemented_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_contracts" ADD CONSTRAINT "project_contracts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_contracts" ADD CONSTRAINT "project_contracts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_contracts" ADD CONSTRAINT "project_contracts_contractor_id_clients_id_fk" FOREIGN KEY ("contractor_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_contracts" ADD CONSTRAINT "project_contracts_signed_by_users_id_fk" FOREIGN KEY ("signed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_decisions" ADD CONSTRAINT "project_decisions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_decisions" ADD CONSTRAINT "project_decisions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_decisions" ADD CONSTRAINT "project_decisions_made_by_users_id_fk" FOREIGN KEY ("made_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_decisions" ADD CONSTRAINT "project_decisions_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_deliverables" ADD CONSTRAINT "project_deliverables_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_deliverables" ADD CONSTRAINT "project_deliverables_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_deliverables" ADD CONSTRAINT "project_deliverables_phase_id_project_phases_id_fk" FOREIGN KEY ("phase_id") REFERENCES "public"."project_phases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_deliverables" ADD CONSTRAINT "project_deliverables_milestone_id_project_milestones_id_fk" FOREIGN KEY ("milestone_id") REFERENCES "public"."project_milestones"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_deliverables" ADD CONSTRAINT "project_deliverables_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_documents" ADD CONSTRAINT "project_documents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_documents" ADD CONSTRAINT "project_documents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_documents" ADD CONSTRAINT "project_documents_phase_id_project_phases_id_fk" FOREIGN KEY ("phase_id") REFERENCES "public"."project_phases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_documents" ADD CONSTRAINT "project_documents_task_id_project_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."project_tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_documents" ADD CONSTRAINT "project_documents_deliverable_id_project_deliverables_id_fk" FOREIGN KEY ("deliverable_id") REFERENCES "public"."project_deliverables"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_documents" ADD CONSTRAINT "project_documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_documents" ADD CONSTRAINT "project_documents_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_documents" ADD CONSTRAINT "project_documents_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_expenses" ADD CONSTRAINT "project_expenses_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_expenses" ADD CONSTRAINT "project_expenses_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_expenses" ADD CONSTRAINT "project_expenses_task_id_project_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."project_tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_expenses" ADD CONSTRAINT "project_expenses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_expenses" ADD CONSTRAINT "project_expenses_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_external_mappings" ADD CONSTRAINT "project_external_mappings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_external_mappings" ADD CONSTRAINT "project_external_mappings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_external_mappings" ADD CONSTRAINT "project_external_mappings_phase_id_project_phases_id_fk" FOREIGN KEY ("phase_id") REFERENCES "public"."project_phases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_external_mappings" ADD CONSTRAINT "project_external_mappings_task_id_project_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."project_tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_external_mappings" ADD CONSTRAINT "project_external_mappings_deliverable_id_project_deliverables_id_fk" FOREIGN KEY ("deliverable_id") REFERENCES "public"."project_deliverables"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_issues" ADD CONSTRAINT "project_issues_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_issues" ADD CONSTRAINT "project_issues_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_issues" ADD CONSTRAINT "project_issues_phase_id_project_phases_id_fk" FOREIGN KEY ("phase_id") REFERENCES "public"."project_phases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_issues" ADD CONSTRAINT "project_issues_task_id_project_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."project_tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_issues" ADD CONSTRAINT "project_issues_reported_by_users_id_fk" FOREIGN KEY ("reported_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_issues" ADD CONSTRAINT "project_issues_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_issues" ADD CONSTRAINT "project_issues_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_milestones" ADD CONSTRAINT "project_milestones_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_milestones" ADD CONSTRAINT "project_milestones_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_milestones" ADD CONSTRAINT "project_milestones_phase_id_project_phases_id_fk" FOREIGN KEY ("phase_id") REFERENCES "public"."project_phases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_phases" ADD CONSTRAINT "project_phases_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_phases" ADD CONSTRAINT "project_phases_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_purchases" ADD CONSTRAINT "project_purchases_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_purchases" ADD CONSTRAINT "project_purchases_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_purchases" ADD CONSTRAINT "project_purchases_phase_id_project_phases_id_fk" FOREIGN KEY ("phase_id") REFERENCES "public"."project_phases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_purchases" ADD CONSTRAINT "project_purchases_task_id_project_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."project_tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_purchases" ADD CONSTRAINT "project_purchases_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_purchases" ADD CONSTRAINT "project_purchases_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_purchases" ADD CONSTRAINT "project_purchases_supplier_id_clients_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_purchases" ADD CONSTRAINT "project_purchases_received_by_users_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_resource_allocations" ADD CONSTRAINT "project_resource_allocations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_resource_allocations" ADD CONSTRAINT "project_resource_allocations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_resource_allocations" ADD CONSTRAINT "project_resource_allocations_phase_id_project_phases_id_fk" FOREIGN KEY ("phase_id") REFERENCES "public"."project_phases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_resource_allocations" ADD CONSTRAINT "project_resource_allocations_task_id_project_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."project_tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_resource_allocations" ADD CONSTRAINT "project_resource_allocations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_resources" ADD CONSTRAINT "project_resources_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_resources" ADD CONSTRAINT "project_resources_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_risks" ADD CONSTRAINT "project_risks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_risks" ADD CONSTRAINT "project_risks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_risks" ADD CONSTRAINT "project_risks_phase_id_project_phases_id_fk" FOREIGN KEY ("phase_id") REFERENCES "public"."project_phases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_risks" ADD CONSTRAINT "project_risks_owner_users_id_fk" FOREIGN KEY ("owner") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_risks" ADD CONSTRAINT "project_risks_identified_by_users_id_fk" FOREIGN KEY ("identified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_states" ADD CONSTRAINT "project_states_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_phase_id_project_phases_id_fk" FOREIGN KEY ("phase_id") REFERENCES "public"."project_phases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_team_members" ADD CONSTRAINT "project_team_members_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_team_members" ADD CONSTRAINT "project_team_members_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_team_members" ADD CONSTRAINT "project_team_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_templates" ADD CONSTRAINT "project_templates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_templates" ADD CONSTRAINT "project_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_time_entries" ADD CONSTRAINT "project_time_entries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_time_entries" ADD CONSTRAINT "project_time_entries_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_time_entries" ADD CONSTRAINT "project_time_entries_task_id_project_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."project_tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_time_entries" ADD CONSTRAINT "project_time_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_time_entries" ADD CONSTRAINT "project_time_entries_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_lead_id_commercial_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."commercial_leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_project_manager_id_users_id_fk" FOREIGN KEY ("project_manager_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_forms" ADD CONSTRAINT "public_forms_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_po_id_purchase_orders_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."purchase_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_requisition_line_id_purchase_requisition_lines_id_fk" FOREIGN KEY ("requisition_line_id") REFERENCES "public"."purchase_requisition_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_rfq_quote_line_id_rfq_quote_lines_id_fk" FOREIGN KEY ("rfq_quote_line_id") REFERENCES "public"."rfq_quote_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_requisition_id_purchase_requisitions_id_fk" FOREIGN KEY ("requisition_id") REFERENCES "public"."purchase_requisitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_rfq_id_rfqs_id_fk" FOREIGN KEY ("rfq_id") REFERENCES "public"."rfqs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_rfq_quote_id_rfq_quotes_id_fk" FOREIGN KEY ("rfq_quote_id") REFERENCES "public"."rfq_quotes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_requisition_lines" ADD CONSTRAINT "purchase_requisition_lines_requisition_id_purchase_requisitions_id_fk" FOREIGN KEY ("requisition_id") REFERENCES "public"."purchase_requisitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_requisition_lines" ADD CONSTRAINT "purchase_requisition_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_requisition_lines" ADD CONSTRAINT "purchase_requisition_lines_suggested_supplier_id_suppliers_id_fk" FOREIGN KEY ("suggested_supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_requisitions" ADD CONSTRAINT "purchase_requisitions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_requisitions" ADD CONSTRAINT "purchase_requisitions_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_requisitions" ADD CONSTRAINT "purchase_requisitions_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_invoice_lines" ADD CONSTRAINT "purchasing_invoice_lines_invoice_id_purchasing_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."purchasing_invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_invoice_lines" ADD CONSTRAINT "purchasing_invoice_lines_po_line_id_purchase_order_lines_id_fk" FOREIGN KEY ("po_line_id") REFERENCES "public"."purchase_order_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_invoice_lines" ADD CONSTRAINT "purchasing_invoice_lines_receipt_line_id_receipt_lines_id_fk" FOREIGN KEY ("receipt_line_id") REFERENCES "public"."receipt_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_invoice_lines" ADD CONSTRAINT "purchasing_invoice_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_invoices" ADD CONSTRAINT "purchasing_invoices_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_invoices" ADD CONSTRAINT "purchasing_invoices_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_invoices" ADD CONSTRAINT "purchasing_invoices_po_id_purchase_orders_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_invoices" ADD CONSTRAINT "purchasing_invoices_receipt_id_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."receipts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_invoices" ADD CONSTRAINT "purchasing_invoices_ocr_validated_by_users_id_fk" FOREIGN KEY ("ocr_validated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_invoices" ADD CONSTRAINT "purchasing_invoices_override_approved_by_users_id_fk" FOREIGN KEY ("override_approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_invoices" ADD CONSTRAINT "purchasing_invoices_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_invoices" ADD CONSTRAINT "purchasing_invoices_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_payment_allocations" ADD CONSTRAINT "purchasing_payment_allocations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_payment_allocations" ADD CONSTRAINT "purchasing_payment_allocations_payment_id_purchasing_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."purchasing_payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_payment_allocations" ADD CONSTRAINT "purchasing_payment_allocations_invoice_id_purchasing_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."purchasing_invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_payment_allocations" ADD CONSTRAINT "purchasing_payment_allocations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_payments" ADD CONSTRAINT "purchasing_payments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_payments" ADD CONSTRAINT "purchasing_payments_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_payments" ADD CONSTRAINT "purchasing_payments_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_payments" ADD CONSTRAINT "purchasing_payments_processed_by_users_id_fk" FOREIGN KEY ("processed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_payments" ADD CONSTRAINT "purchasing_payments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_lines" ADD CONSTRAINT "receipt_lines_receipt_id_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."receipts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_lines" ADD CONSTRAINT "receipt_lines_po_line_id_purchase_order_lines_id_fk" FOREIGN KEY ("po_line_id") REFERENCES "public"."purchase_order_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_lines" ADD CONSTRAINT "receipt_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_lines" ADD CONSTRAINT "receipt_lines_location_id_warehouse_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."warehouse_locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_po_id_purchase_orders_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_location_id_warehouse_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."warehouse_locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_received_by_users_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reordering_rules" ADD CONSTRAINT "reordering_rules_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reordering_rules" ADD CONSTRAINT "reordering_rules_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reordering_rules" ADD CONSTRAINT "reordering_rules_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfq_lines" ADD CONSTRAINT "rfq_lines_rfq_id_rfqs_id_fk" FOREIGN KEY ("rfq_id") REFERENCES "public"."rfqs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfq_lines" ADD CONSTRAINT "rfq_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfq_quote_lines" ADD CONSTRAINT "rfq_quote_lines_quote_id_rfq_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."rfq_quotes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfq_quote_lines" ADD CONSTRAINT "rfq_quote_lines_rfq_line_id_rfq_lines_id_fk" FOREIGN KEY ("rfq_line_id") REFERENCES "public"."rfq_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfq_quotes" ADD CONSTRAINT "rfq_quotes_rfq_id_rfqs_id_fk" FOREIGN KEY ("rfq_id") REFERENCES "public"."rfqs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfq_quotes" ADD CONSTRAINT "rfq_quotes_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfqs" ADD CONSTRAINT "rfqs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfqs" ADD CONSTRAINT "rfqs_requisition_id_purchase_requisitions_id_fk" FOREIGN KEY ("requisition_id") REFERENCES "public"."purchase_requisitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sandbox_executions" ADD CONSTRAINT "sandbox_executions_execution_plan_id_execution_plans_id_fk" FOREIGN KEY ("execution_plan_id") REFERENCES "public"."execution_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sandbox_executions" ADD CONSTRAINT "sandbox_executions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schema_versions" ADD CONSTRAINT "schema_versions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schema_versions" ADD CONSTRAINT "schema_versions_promoted_by_users_id_fk" FOREIGN KEY ("promoted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "specialized_agents" ADD CONSTRAINT "specialized_agents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_alerts" ADD CONSTRAINT "stock_alerts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_alerts" ADD CONSTRAINT "stock_alerts_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_alerts" ADD CONSTRAINT "stock_alerts_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_alerts" ADD CONSTRAINT "stock_alerts_batch_id_inventory_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."inventory_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_alerts" ADD CONSTRAINT "stock_alerts_acknowledged_by_users_id_fk" FOREIGN KEY ("acknowledged_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_moves" ADD CONSTRAINT "stock_moves_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_moves" ADD CONSTRAINT "stock_moves_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_moves" ADD CONSTRAINT "stock_moves_from_location_id_warehouse_locations_id_fk" FOREIGN KEY ("from_location_id") REFERENCES "public"."warehouse_locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_moves" ADD CONSTRAINT "stock_moves_to_location_id_warehouse_locations_id_fk" FOREIGN KEY ("to_location_id") REFERENCES "public"."warehouse_locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_moves" ADD CONSTRAINT "stock_moves_batch_id_inventory_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."inventory_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_moves" ADD CONSTRAINT "stock_moves_performed_by_users_id_fk" FOREIGN KEY ("performed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_audit_log" ADD CONSTRAINT "studio_audit_log_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_audit_log" ADD CONSTRAINT "studio_audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_file_id_file_attachments_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."file_attachments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_email_inbox_id_email_inbox_id_fk" FOREIGN KEY ("email_inbox_id") REFERENCES "public"."email_inbox"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_price_history" ADD CONSTRAINT "supplier_price_history_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_price_history" ADD CONSTRAINT "supplier_price_history_product_supplier_id_product_suppliers_id_fk" FOREIGN KEY ("product_supplier_id") REFERENCES "public"."product_suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_return_lines" ADD CONSTRAINT "supplier_return_lines_return_id_supplier_returns_id_fk" FOREIGN KEY ("return_id") REFERENCES "public"."supplier_returns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_return_lines" ADD CONSTRAINT "supplier_return_lines_receipt_line_id_receipt_lines_id_fk" FOREIGN KEY ("receipt_line_id") REFERENCES "public"."receipt_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_return_lines" ADD CONSTRAINT "supplier_return_lines_po_line_id_purchase_order_lines_id_fk" FOREIGN KEY ("po_line_id") REFERENCES "public"."purchase_order_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_return_lines" ADD CONSTRAINT "supplier_return_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_returns" ADD CONSTRAINT "supplier_returns_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_returns" ADD CONSTRAINT "supplier_returns_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_returns" ADD CONSTRAINT "supplier_returns_po_id_purchase_orders_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_returns" ADD CONSTRAINT "supplier_returns_receipt_id_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."receipts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_returns" ADD CONSTRAINT "supplier_returns_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_categories" ADD CONSTRAINT "tax_categories_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_categories" ADD CONSTRAINT "tax_categories_default_tax_rate_id_tax_rates_id_fk" FOREIGN KEY ("default_tax_rate_id") REFERENCES "public"."tax_rates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_obligations" ADD CONSTRAINT "tax_obligations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_rates" ADD CONSTRAINT "tax_rates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_rates" ADD CONSTRAINT "tax_rates_jurisdiction_id_tax_jurisdictions_id_fk" FOREIGN KEY ("jurisdiction_id") REFERENCES "public"."tax_jurisdictions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_blueprints" ADD CONSTRAINT "tenant_blueprints_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_code_artifacts" ADD CONSTRAINT "tenant_code_artifacts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_code_files" ADD CONSTRAINT "tenant_code_files_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_code_files" ADD CONSTRAINT "tenant_code_files_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_code_modules" ADD CONSTRAINT "tenant_code_modules_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_code_modules" ADD CONSTRAINT "tenant_code_modules_entry_file_id_tenant_code_files_id_fk" FOREIGN KEY ("entry_file_id") REFERENCES "public"."tenant_code_files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_code_releases" ADD CONSTRAINT "tenant_code_releases_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_code_releases" ADD CONSTRAINT "tenant_code_releases_artifact_id_tenant_code_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."tenant_code_artifacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_code_releases" ADD CONSTRAINT "tenant_code_releases_deployed_by_users_id_fk" FOREIGN KEY ("deployed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_code_releases" ADD CONSTRAINT "tenant_code_releases_approver_user_id_users_id_fk" FOREIGN KEY ("approver_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_code_tests" ADD CONSTRAINT "tenant_code_tests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_code_tests" ADD CONSTRAINT "tenant_code_tests_module_id_tenant_code_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."tenant_code_modules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_context" ADD CONSTRAINT "tenant_context_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_invitations" ADD CONSTRAINT "tenant_invitations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_invitations" ADD CONSTRAINT "tenant_invitations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_memory_facts" ADD CONSTRAINT "tenant_memory_facts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_memory_facts" ADD CONSTRAINT "tenant_memory_facts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_modules" ADD CONSTRAINT "tenant_modules_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_modules" ADD CONSTRAINT "tenant_modules_installed_by_users_id_fk" FOREIGN KEY ("installed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_secrets" ADD CONSTRAINT "tenant_secrets_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_secrets" ADD CONSTRAINT "tenant_secrets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_agent_interactions" ADD CONSTRAINT "user_agent_interactions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_agent_interactions" ADD CONSTRAINT "user_agent_interactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_agent_interactions" ADD CONSTRAINT "user_agent_interactions_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_agent_interactions" ADD CONSTRAINT "user_agent_interactions_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_oauth_tokens" ADD CONSTRAINT "user_oauth_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_oauth_tokens" ADD CONSTRAINT "user_oauth_tokens_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_tenants" ADD CONSTRAINT "user_tenants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_tenants" ADD CONSTRAINT "user_tenants_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_tenants" ADD CONSTRAINT "user_tenants_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vat_returns" ADD CONSTRAINT "vat_returns_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_locations" ADD CONSTRAINT "warehouse_locations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_locations" ADD CONSTRAINT "warehouse_locations_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_responsible_user_users_id_fk" FOREIGN KEY ("responsible_user") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_linked_project_id_projects_id_fk" FOREIGN KEY ("linked_project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_budgets_tenant_agent_idx" ON "agent_budgets" USING btree ("tenant_id","agent_key");--> statement-breakpoint
CREATE INDEX "agent_feedback_tenant_idx" ON "agent_feedback" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "agent_feedback_action_idx" ON "agent_feedback" USING btree ("agent_action");--> statement-breakpoint
CREATE INDEX "agent_role_assignments_user_tenant_agent_idx" ON "agent_role_assignments" USING btree ("user_id","tenant_id","agent_key");--> statement-breakpoint
CREATE INDEX "agent_schedules_tenant_idx" ON "agent_schedules" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "agent_schedules_agent_type_idx" ON "agent_schedules" USING btree ("agent_type");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_schedules_tenant_agent_unique" ON "agent_schedules" USING btree ("tenant_id","agent_type");--> statement-breakpoint
CREATE INDEX "agent_secrets_tenant_key_idx" ON "agent_secrets" USING btree ("tenant_id","key");--> statement-breakpoint
CREATE INDEX "bank_accounts_tenant_idx" ON "bank_accounts" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "bank_accounts_iban_idx" ON "bank_accounts" USING btree ("iban");--> statement-breakpoint
CREATE INDEX "bank_statement_transactions_reconciliation_idx" ON "bank_statement_transactions" USING btree ("bank_reconciliation_id");--> statement-breakpoint
CREATE INDEX "bank_statement_transactions_date_idx" ON "bank_statement_transactions" USING btree ("transaction_date");--> statement-breakpoint
CREATE INDEX "bank_statement_transactions_matched_payment_idx" ON "bank_statement_transactions" USING btree ("matched_payment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "blueprint_health_version_idx" ON "blueprint_health" USING btree ("blueprint_version_id");--> statement-breakpoint
CREATE INDEX "blueprint_health_recommended_idx" ON "blueprint_health" USING btree ("recommended_for_auto_deploy");--> statement-breakpoint
CREATE INDEX "blueprint_improvements_blueprint_idx" ON "blueprint_improvements" USING btree ("blueprint_id");--> statement-breakpoint
CREATE INDEX "blueprint_improvements_status_idx" ON "blueprint_improvements" USING btree ("status");--> statement-breakpoint
CREATE INDEX "blueprint_signatures_blueprint_idx" ON "blueprint_signatures" USING btree ("blueprint_id");--> statement-breakpoint
CREATE INDEX "blueprint_templates_category_idx" ON "blueprint_templates" USING btree ("category");--> statement-breakpoint
CREATE INDEX "blueprint_templates_public_idx" ON "blueprint_templates" USING btree ("is_public");--> statement-breakpoint
CREATE UNIQUE INDEX "blueprint_usage_stats_version_tenant_idx" ON "blueprint_usage_stats" USING btree ("blueprint_version_id","tenant_id");--> statement-breakpoint
CREATE INDEX "blueprint_usage_stats_tenant_idx" ON "blueprint_usage_stats" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "blueprint_versions_blueprint_version_idx" ON "blueprint_versions" USING btree ("blueprint_id","version_number");--> statement-breakpoint
CREATE INDEX "blueprint_versions_stable_idx" ON "blueprint_versions" USING btree ("is_stable");--> statement-breakpoint
CREATE INDEX "budget_alerts_budget_idx" ON "budget_alerts" USING btree ("budget_id");--> statement-breakpoint
CREATE INDEX "budget_alerts_tenant_resolved_idx" ON "budget_alerts" USING btree ("tenant_id","resolved");--> statement-breakpoint
CREATE INDEX "budget_quote_items_quote_idx" ON "budget_quote_items" USING btree ("quote_id");--> statement-breakpoint
CREATE INDEX "budget_quote_versions_quote_idx" ON "budget_quote_versions" USING btree ("quote_id");--> statement-breakpoint
CREATE INDEX "budget_quote_versions_version_idx" ON "budget_quote_versions" USING btree ("quote_id","version_number");--> statement-breakpoint
CREATE INDEX "budget_quote_versions_status_idx" ON "budget_quote_versions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "budget_quotes_lead_idx" ON "budget_quotes" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "budget_quotes_status_idx" ON "budget_quotes" USING btree ("status");--> statement-breakpoint
CREATE INDEX "budget_quotes_number_idx" ON "budget_quotes" USING btree ("quote_number");--> statement-breakpoint
CREATE INDEX "catering_kitchen_workflows_wo_idx" ON "catering_kitchen_workflows" USING btree ("work_order_id");--> statement-breakpoint
CREATE INDEX "catering_kitchen_workflows_chef_idx" ON "catering_kitchen_workflows" USING btree ("chef_assigned");--> statement-breakpoint
CREATE INDEX "catering_logistics_prep_list_idx" ON "catering_logistics" USING btree ("prep_list_id");--> statement-breakpoint
CREATE INDEX "catering_logistics_status_idx" ON "catering_logistics" USING btree ("status");--> statement-breakpoint
CREATE INDEX "catering_logistics_driver_idx" ON "catering_logistics" USING btree ("driver_assigned");--> statement-breakpoint
CREATE INDEX "catering_prep_lists_wo_idx" ON "catering_prep_lists" USING btree ("work_order_id");--> statement-breakpoint
CREATE INDEX "catering_prep_lists_event_idx" ON "catering_prep_lists" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "catering_prep_lists_event_date_idx" ON "catering_prep_lists" USING btree ("event_date");--> statement-breakpoint
CREATE INDEX "chart_of_accounts_tenant_idx" ON "chart_of_accounts" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "chart_of_accounts_code_idx" ON "chart_of_accounts" USING btree ("code");--> statement-breakpoint
CREATE INDEX "chart_of_accounts_account_type_idx" ON "chart_of_accounts" USING btree ("account_type");--> statement-breakpoint
CREATE INDEX "code_generation_audit_tenant_action_idx" ON "code_generation_audit" USING btree ("tenant_id","action");--> statement-breakpoint
CREATE INDEX "code_generation_audit_created_at_idx" ON "code_generation_audit" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "code_generation_audit_plan_idx" ON "code_generation_audit" USING btree ("execution_plan_id");--> statement-breakpoint
CREATE INDEX "code_validation_results_plan_idx" ON "code_validation_results" USING btree ("execution_plan_id");--> statement-breakpoint
CREATE INDEX "code_validation_results_severity_idx" ON "code_validation_results" USING btree ("severity");--> statement-breakpoint
CREATE INDEX "commercial_activities_lead_id_idx" ON "commercial_activities" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "commercial_activities_type_idx" ON "commercial_activities" USING btree ("activity_type");--> statement-breakpoint
CREATE INDEX "commercial_agent_configs_key_idx" ON "commercial_agent_configs" USING btree ("agent_key");--> statement-breakpoint
CREATE INDEX "commercial_agent_executions_agent_idx" ON "commercial_agent_executions" USING btree ("agent_config_id");--> statement-breakpoint
CREATE INDEX "commercial_agent_executions_lead_idx" ON "commercial_agent_executions" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "commercial_agent_executions_status_idx" ON "commercial_agent_executions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "commercial_ai_suggestions_lead_id_idx" ON "commercial_ai_suggestions" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "commercial_ai_suggestions_status_idx" ON "commercial_ai_suggestions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "commercial_automation_rules_category_idx" ON "commercial_automation_rules" USING btree ("category");--> statement-breakpoint
CREATE INDEX "commercial_automation_rules_trigger_idx" ON "commercial_automation_rules" USING btree ("trigger_type");--> statement-breakpoint
CREATE INDEX "commercial_budget_alerts_quote_idx" ON "commercial_budget_alerts" USING btree ("quote_id");--> statement-breakpoint
CREATE INDEX "commercial_budget_alerts_type_idx" ON "commercial_budget_alerts" USING btree ("alert_type");--> statement-breakpoint
CREATE INDEX "commercial_conversion_metrics_stage_idx" ON "commercial_conversion_metrics" USING btree ("pipeline_stage_id");--> statement-breakpoint
CREATE INDEX "commercial_conversion_metrics_period_idx" ON "commercial_conversion_metrics" USING btree ("period_start","period_end");--> statement-breakpoint
CREATE INDEX "commercial_email_events_lead_id_idx" ON "commercial_email_events" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "commercial_email_events_message_id_idx" ON "commercial_email_events" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "commercial_forecasts_period_idx" ON "commercial_forecasts" USING btree ("forecast_period");--> statement-breakpoint
CREATE INDEX "commercial_lead_scoring_lead_id_idx" ON "commercial_lead_scoring" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "commercial_lead_scoring_score_idx" ON "commercial_lead_scoring" USING btree ("score");--> statement-breakpoint
CREATE INDEX "commercial_lead_sources_source_idx" ON "commercial_lead_sources" USING btree ("source_name");--> statement-breakpoint
CREATE INDEX "commercial_quote_versions_lead_id_idx" ON "commercial_quote_versions" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "commercial_tasks_lead_id_idx" ON "commercial_tasks" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "commercial_tasks_status_idx" ON "commercial_tasks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "commercial_tasks_assigned_idx" ON "commercial_tasks" USING btree ("assigned_to");--> statement-breakpoint
CREATE INDEX "conversation_insights_tenant_created_idx" ON "conversation_insights" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "document_analyses_tenant_idx" ON "document_analyses" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "document_analyses_file_idx" ON "document_analyses" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "document_analyses_status_idx" ON "document_analyses" USING btree ("status");--> statement-breakpoint
CREATE INDEX "document_analyses_root_idx" ON "document_analyses" USING btree ("root_id");--> statement-breakpoint
CREATE INDEX "document_insights_analysis_idx" ON "document_insights" USING btree ("analysis_id");--> statement-breakpoint
CREATE INDEX "document_insights_severity_idx" ON "document_insights" USING btree ("severity");--> statement-breakpoint
CREATE INDEX "document_insights_type_idx" ON "document_insights" USING btree ("insight_type");--> statement-breakpoint
CREATE INDEX "document_integrations_tenant_type_idx" ON "document_integrations" USING btree ("tenant_id","integration_type");--> statement-breakpoint
CREATE INDEX "document_quality_checks_analysis_idx" ON "document_quality_checks" USING btree ("analysis_id");--> statement-breakpoint
CREATE INDEX "document_quality_checks_status_idx" ON "document_quality_checks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "document_templates_tenant_type_idx" ON "document_templates" USING btree ("tenant_id","document_type");--> statement-breakpoint
CREATE INDEX "document_versions_original_file_idx" ON "document_versions" USING btree ("original_file_id");--> statement-breakpoint
CREATE INDEX "document_versions_version_idx" ON "document_versions" USING btree ("original_file_id","version_number");--> statement-breakpoint
CREATE INDEX "employee_expenses_tenant_idx" ON "employee_expenses" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "employee_expenses_employee_idx" ON "employee_expenses" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "employee_expenses_status_idx" ON "employee_expenses" USING btree ("status");--> statement-breakpoint
CREATE INDEX "employee_expenses_expense_date_idx" ON "employee_expenses" USING btree ("expense_date");--> statement-breakpoint
CREATE INDEX "employee_expenses_project_idx" ON "employee_expenses" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "employee_expenses_person_idx" ON "employee_expenses" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "execution_plans_tenant_status_idx" ON "execution_plans" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "execution_plans_created_at_idx" ON "execution_plans" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "execution_traces_execution_idx" ON "execution_traces" USING btree ("execution_id","start_time");--> statement-breakpoint
CREATE INDEX "execution_traces_tenant_idx" ON "execution_traces" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "execution_traces_span_idx" ON "execution_traces" USING btree ("span_id");--> statement-breakpoint
CREATE INDEX "file_attachments_tenant_idx" ON "file_attachments" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "file_attachments_entity_idx" ON "file_attachments" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "file_attachments_document_type_idx" ON "file_attachments" USING btree ("document_type");--> statement-breakpoint
CREATE INDEX "file_attachments_fiscal_year_idx" ON "file_attachments" USING btree ("fiscal_year");--> statement-breakpoint
CREATE INDEX "file_attachments_retention_idx" ON "file_attachments" USING btree ("retention_until");--> statement-breakpoint
CREATE INDEX "financial_calculations_tenant_model_idx" ON "financial_calculations" USING btree ("tenant_id","model_id");--> statement-breakpoint
CREATE INDEX "financial_calculations_run_id_idx" ON "financial_calculations" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "financial_calculations_inputs_hash_idx" ON "financial_calculations" USING btree ("inputs_hash");--> statement-breakpoint
CREATE INDEX "financial_models_tenant_slug_idx" ON "financial_models" USING btree ("tenant_id","slug");--> statement-breakpoint
CREATE INDEX "financial_models_type_version_idx" ON "financial_models" USING btree ("type","version");--> statement-breakpoint
CREATE INDEX "financial_scenarios_tenant_model_idx" ON "financial_scenarios" USING btree ("tenant_id","model_id");--> statement-breakpoint
CREATE INDEX "fiscal_periods_tenant_idx" ON "fiscal_periods" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "fiscal_periods_fiscal_year_idx" ON "fiscal_periods" USING btree ("fiscal_year");--> statement-breakpoint
CREATE INDEX "fiscal_periods_period_code_idx" ON "fiscal_periods" USING btree ("period_code");--> statement-breakpoint
CREATE INDEX "fiscal_periods_status_idx" ON "fiscal_periods" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "governance_policies_tenant_policy_idx" ON "governance_policies" USING btree ("tenant_id","policy_name");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_warehouse_product" ON "inventory_levels" USING btree ("warehouse_id","product_id");--> statement-breakpoint
CREATE INDEX "invoice_lines_invoice_idx" ON "invoice_lines" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "invoice_lines_tenant_idx" ON "invoice_lines" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "invoice_taxes_invoice_idx" ON "invoice_taxes" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "invoice_taxes_tenant_idx" ON "invoice_taxes" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "invoices_tenant_idx" ON "invoices" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "invoices_type_idx" ON "invoices" USING btree ("invoice_type");--> statement-breakpoint
CREATE INDEX "invoices_status_idx" ON "invoices" USING btree ("status");--> statement-breakpoint
CREATE INDEX "invoices_supplier_idx" ON "invoices" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "invoices_client_idx" ON "invoices" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "invoices_fiscal_year_idx" ON "invoices" USING btree ("fiscal_year");--> statement-breakpoint
CREATE INDEX "invoices_journal_entry_idx" ON "invoices" USING btree ("journal_entry_id");--> statement-breakpoint
CREATE INDEX "journal_entries_tenant_idx" ON "journal_entries" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "journal_entries_fiscal_period_idx" ON "journal_entries" USING btree ("fiscal_period");--> statement-breakpoint
CREATE INDEX "journal_entries_source_type_idx" ON "journal_entries" USING btree ("source_type");--> statement-breakpoint
CREATE INDEX "journal_entries_status_idx" ON "journal_entries" USING btree ("status");--> statement-breakpoint
CREATE INDEX "journal_entries_entry_number_idx" ON "journal_entries" USING btree ("entry_number");--> statement-breakpoint
CREATE INDEX "journal_entry_lines_entry_id_idx" ON "journal_entry_lines" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "journal_entry_lines_account_code_idx" ON "journal_entry_lines" USING btree ("account_code");--> statement-breakpoint
CREATE INDEX "notifications_user_unread_idx" ON "notifications" USING btree ("user_id","read","created_at");--> statement-breakpoint
CREATE INDEX "notifications_tenant_created_idx" ON "notifications" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_expires_at_idx" ON "notifications" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "open_banking_accounts_tenant_idx" ON "open_banking_accounts" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "open_banking_accounts_connection_idx" ON "open_banking_accounts" USING btree ("connection_id");--> statement-breakpoint
CREATE INDEX "open_banking_accounts_iban_idx" ON "open_banking_accounts" USING btree ("iban");--> statement-breakpoint
CREATE UNIQUE INDEX "open_banking_accounts_unique_external_id" ON "open_banking_accounts" USING btree ("connection_id","external_account_id");--> statement-breakpoint
CREATE INDEX "open_banking_connections_tenant_idx" ON "open_banking_connections" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "open_banking_connections_status_idx" ON "open_banking_connections" USING btree ("status");--> statement-breakpoint
CREATE INDEX "open_banking_connections_institution_idx" ON "open_banking_connections" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX "open_banking_transactions_tenant_idx" ON "open_banking_transactions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "open_banking_transactions_account_idx" ON "open_banking_transactions" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "open_banking_transactions_date_idx" ON "open_banking_transactions" USING btree ("transaction_date");--> statement-breakpoint
CREATE INDEX "open_banking_transactions_reconciled_idx" ON "open_banking_transactions" USING btree ("is_reconciled");--> statement-breakpoint
CREATE INDEX "open_banking_transactions_external_id_idx" ON "open_banking_transactions" USING btree ("external_transaction_id");--> statement-breakpoint
CREATE UNIQUE INDEX "open_banking_transactions_unique_external_id" ON "open_banking_transactions" USING btree ("account_id","external_transaction_id");--> statement-breakpoint
CREATE INDEX "payables_tenant_idx" ON "payables" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "payables_status_idx" ON "payables" USING btree ("status");--> statement-breakpoint
CREATE INDEX "payables_due_date_idx" ON "payables" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "payables_supplier_invoice_idx" ON "payables" USING btree ("supplier_invoice_id");--> statement-breakpoint
CREATE INDEX "payment_allocations_payment_idx" ON "payment_allocations" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "payment_allocations_invoice_idx" ON "payment_allocations" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "payment_reminders_tenant_idx" ON "payment_reminders" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "payment_reminders_invoice_idx" ON "payment_reminders" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "payment_reminders_sent_at_idx" ON "payment_reminders" USING btree ("sent_at");--> statement-breakpoint
CREATE INDEX "pricing_catalogs_scope_idx" ON "pricing_catalogs" USING btree ("scope");--> statement-breakpoint
CREATE INDEX "pricing_catalogs_tenant_idx" ON "pricing_catalogs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "pricing_catalogs_category_idx" ON "pricing_catalogs" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "pricing_catalogs_code_idx" ON "pricing_catalogs" USING btree ("scope","tenant_id","code");--> statement-breakpoint
CREATE INDEX "pricing_input_schemas_tenant_idx" ON "pricing_input_schemas" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "pricing_input_schemas_param_idx" ON "pricing_input_schemas" USING btree ("tenant_id","parameter_name");--> statement-breakpoint
CREATE INDEX "pricing_line_items_project_idx" ON "pricing_line_items" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "pricing_line_items_module_idx" ON "pricing_line_items" USING btree ("module_id");--> statement-breakpoint
CREATE INDEX "pricing_project_modules_project_idx" ON "pricing_project_modules" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "pricing_projects_tenant_idx" ON "pricing_projects" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "pricing_projects_lead_idx" ON "pricing_projects" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "pricing_projects_status_idx" ON "pricing_projects" USING btree ("status");--> statement-breakpoint
CREATE INDEX "pricing_projects_number_idx" ON "pricing_projects" USING btree ("project_number");--> statement-breakpoint
CREATE INDEX "pricing_rule_entries_rule_set_idx" ON "pricing_rule_entries" USING btree ("rule_set_id");--> statement-breakpoint
CREATE INDEX "pricing_rule_entries_catalog_idx" ON "pricing_rule_entries" USING btree ("catalog_item_id");--> statement-breakpoint
CREATE INDEX "pricing_rule_sets_tenant_idx" ON "pricing_rule_sets" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "pricing_rule_sets_project_idx" ON "pricing_rule_sets" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "pricing_rule_sets_status_idx" ON "pricing_rule_sets" USING btree ("status");--> statement-breakpoint
CREATE INDEX "pricing_rule_sets_scope_idx" ON "pricing_rule_sets" USING btree ("scope");--> statement-breakpoint
CREATE INDEX "product_specifications_tenant_idx" ON "product_specifications" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "product_specifications_type_idx" ON "product_specifications" USING btree ("spec_type");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_product_supplier" ON "product_suppliers" USING btree ("tenant_id","product_id","supplier_id");--> statement-breakpoint
CREATE INDEX "product_suppliers_product_idx" ON "product_suppliers" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "product_suppliers_supplier_idx" ON "product_suppliers" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "product_suppliers_preferred_idx" ON "product_suppliers" USING btree ("is_preferred");--> statement-breakpoint
CREATE INDEX "production_batches_wo_idx" ON "production_batches" USING btree ("work_order_id");--> statement-breakpoint
CREATE INDEX "production_batches_batch_num_idx" ON "production_batches" USING btree ("batch_number");--> statement-breakpoint
CREATE INDEX "production_batches_status_idx" ON "production_batches" USING btree ("status");--> statement-breakpoint
CREATE INDEX "production_execution_logs_tenant_idx" ON "production_execution_logs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "production_execution_logs_executed_at_idx" ON "production_execution_logs" USING btree ("executed_at");--> statement-breakpoint
CREATE INDEX "production_execution_logs_blueprint_idx" ON "production_execution_logs" USING btree ("blueprint_version_id");--> statement-breakpoint
CREATE INDEX "production_integrations_tenant_idx" ON "production_integrations" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "production_integrations_type_idx" ON "production_integrations" USING btree ("integration_type");--> statement-breakpoint
CREATE INDEX "production_operations_wo_idx" ON "production_operations" USING btree ("work_order_id");--> statement-breakpoint
CREATE INDEX "production_operations_status_idx" ON "production_operations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "production_quality_checks_wo_idx" ON "production_quality_checks" USING btree ("work_order_id");--> statement-breakpoint
CREATE INDEX "production_quality_checks_status_idx" ON "production_quality_checks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "production_quality_checks_hold_idx" ON "production_quality_checks" USING btree ("is_quality_hold");--> statement-breakpoint
CREATE INDEX "production_wo_materials_wo_idx" ON "production_work_order_materials" USING btree ("work_order_id");--> statement-breakpoint
CREATE INDEX "production_work_orders_tenant_idx" ON "production_work_orders" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "production_work_orders_status_idx" ON "production_work_orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "production_work_orders_project_idx" ON "production_work_orders" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_documents_tenant_idx" ON "project_documents" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "project_documents_project_idx" ON "project_documents" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_documents_category_idx" ON "project_documents" USING btree ("category");--> statement-breakpoint
CREATE INDEX "project_documents_type_idx" ON "project_documents" USING btree ("document_type");--> statement-breakpoint
CREATE INDEX "project_phases_tenant_idx" ON "project_phases" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "project_phases_project_idx" ON "project_phases" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_phases_status_idx" ON "project_phases" USING btree ("status");--> statement-breakpoint
CREATE INDEX "project_resources_tenant_idx" ON "project_resources" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "project_resources_project_idx" ON "project_resources" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_resources_status_idx" ON "project_resources" USING btree ("status");--> statement-breakpoint
CREATE INDEX "project_resources_type_idx" ON "project_resources" USING btree ("resource_type");--> statement-breakpoint
CREATE INDEX "projects_tenant_idx" ON "projects" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "projects_status_idx" ON "projects" USING btree ("status");--> statement-breakpoint
CREATE INDEX "projects_code_idx" ON "projects" USING btree ("project_code");--> statement-breakpoint
CREATE INDEX "projects_priority_idx" ON "projects" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "purchase_order_lines_po_idx" ON "purchase_order_lines" USING btree ("po_id");--> statement-breakpoint
CREATE INDEX "purchase_orders_tenant_idx" ON "purchase_orders" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "purchase_orders_status_idx" ON "purchase_orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "purchase_orders_supplier_idx" ON "purchase_orders" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "purchase_orders_order_date_idx" ON "purchase_orders" USING btree ("order_date");--> statement-breakpoint
CREATE INDEX "requisition_lines_requisition_idx" ON "purchase_requisition_lines" USING btree ("requisition_id");--> statement-breakpoint
CREATE INDEX "requisitions_tenant_idx" ON "purchase_requisitions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "requisitions_status_idx" ON "purchase_requisitions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "requisitions_request_date_idx" ON "purchase_requisitions" USING btree ("request_date");--> statement-breakpoint
CREATE INDEX "purchasing_invoice_lines_invoice_idx" ON "purchasing_invoice_lines" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "purchasing_invoices_tenant_idx" ON "purchasing_invoices" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "purchasing_invoices_supplier_idx" ON "purchasing_invoices" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "purchasing_invoices_status_idx" ON "purchasing_invoices" USING btree ("status");--> statement-breakpoint
CREATE INDEX "purchasing_invoices_invoice_date_idx" ON "purchasing_invoices" USING btree ("invoice_date");--> statement-breakpoint
CREATE INDEX "purchasing_invoices_three_way_match_idx" ON "purchasing_invoices" USING btree ("three_way_match_status");--> statement-breakpoint
CREATE INDEX "purchasing_payment_allocations_payment_idx" ON "purchasing_payment_allocations" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "purchasing_payment_allocations_invoice_idx" ON "purchasing_payment_allocations" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "purchasing_payments_tenant_idx" ON "purchasing_payments" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "purchasing_payments_supplier_idx" ON "purchasing_payments" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "purchasing_payments_payment_date_idx" ON "purchasing_payments" USING btree ("payment_date");--> statement-breakpoint
CREATE INDEX "purchasing_payments_status_idx" ON "purchasing_payments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "receipt_lines_receipt_idx" ON "receipt_lines" USING btree ("receipt_id");--> statement-breakpoint
CREATE INDEX "receipts_tenant_idx" ON "receipts" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "receipts_po_idx" ON "receipts" USING btree ("po_id");--> statement-breakpoint
CREATE INDEX "receipts_receipt_date_idx" ON "receipts" USING btree ("receipt_date");--> statement-breakpoint
CREATE INDEX "receipts_status_idx" ON "receipts" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_reordering_product_warehouse" ON "reordering_rules" USING btree ("product_id","warehouse_id");--> statement-breakpoint
CREATE INDEX "rfq_lines_rfq_idx" ON "rfq_lines" USING btree ("rfq_id");--> statement-breakpoint
CREATE INDEX "rfq_quote_lines_quote_idx" ON "rfq_quote_lines" USING btree ("quote_id");--> statement-breakpoint
CREATE INDEX "rfq_quote_lines_rfq_line_idx" ON "rfq_quote_lines" USING btree ("rfq_line_id");--> statement-breakpoint
CREATE INDEX "rfq_quotes_rfq_idx" ON "rfq_quotes" USING btree ("rfq_id");--> statement-breakpoint
CREATE INDEX "rfq_quotes_supplier_idx" ON "rfq_quotes" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "rfqs_tenant_idx" ON "rfqs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "rfqs_status_idx" ON "rfqs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "rfqs_rfq_date_idx" ON "rfqs" USING btree ("rfq_date");--> statement-breakpoint
CREATE INDEX "sandbox_executions_tenant_idx" ON "sandbox_executions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "sandbox_executions_plan_idx" ON "sandbox_executions" USING btree ("execution_plan_id");--> statement-breakpoint
CREATE INDEX "sandbox_executions_executed_at_idx" ON "sandbox_executions" USING btree ("executed_at");--> statement-breakpoint
CREATE INDEX "studio_audit_log_tenant_idx" ON "studio_audit_log" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "studio_audit_log_action_idx" ON "studio_audit_log" USING btree ("action");--> statement-breakpoint
CREATE INDEX "studio_audit_log_status_idx" ON "studio_audit_log" USING btree ("status");--> statement-breakpoint
CREATE INDEX "studio_audit_log_rate_limit_idx" ON "studio_audit_log" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "supplier_invoices_tenant_idx" ON "supplier_invoices" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "supplier_invoices_supplier_idx" ON "supplier_invoices" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "supplier_invoices_status_idx" ON "supplier_invoices" USING btree ("status");--> statement-breakpoint
CREATE INDEX "supplier_invoices_due_date_idx" ON "supplier_invoices" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "supplier_invoices_file_idx" ON "supplier_invoices" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "price_history_product_supplier_idx" ON "supplier_price_history" USING btree ("product_supplier_id");--> statement-breakpoint
CREATE INDEX "price_history_valid_from_idx" ON "supplier_price_history" USING btree ("valid_from");--> statement-breakpoint
CREATE INDEX "supplier_return_lines_return_idx" ON "supplier_return_lines" USING btree ("return_id");--> statement-breakpoint
CREATE INDEX "supplier_returns_tenant_idx" ON "supplier_returns" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "supplier_returns_supplier_idx" ON "supplier_returns" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "supplier_returns_status_idx" ON "supplier_returns" USING btree ("status");--> statement-breakpoint
CREATE INDEX "supplier_returns_return_date_idx" ON "supplier_returns" USING btree ("return_date");--> statement-breakpoint
CREATE INDEX "suppliers_tenant_idx" ON "suppliers" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "suppliers_type_idx" ON "suppliers" USING btree ("type");--> statement-breakpoint
CREATE INDEX "suppliers_score_idx" ON "suppliers" USING btree ("overall_score" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "tax_categories_tenant_idx" ON "tax_categories" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "tax_jurisdictions_country_idx" ON "tax_jurisdictions" USING btree ("country");--> statement-breakpoint
CREATE INDEX "tax_obligations_tenant_idx" ON "tax_obligations" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "tax_obligations_due_date_idx" ON "tax_obligations" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "tax_obligations_status_idx" ON "tax_obligations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "tax_rates_tenant_idx" ON "tax_rates" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "tax_rates_country_idx" ON "tax_rates" USING btree ("country");--> statement-breakpoint
CREATE INDEX "tenant_code_artifacts_tenant_env_idx" ON "tenant_code_artifacts" USING btree ("tenant_id","environment");--> statement-breakpoint
CREATE INDEX "tenant_code_artifacts_hash_idx" ON "tenant_code_artifacts" USING btree ("artifact_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_code_files_tenant_env_file_version_idx" ON "tenant_code_files" USING btree ("tenant_id","environment","file_path","version");--> statement-breakpoint
CREATE INDEX "tenant_code_files_tenant_idx" ON "tenant_code_files" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "tenant_code_files_env_idx" ON "tenant_code_files" USING btree ("environment");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_code_modules_tenant_module_idx" ON "tenant_code_modules" USING btree ("tenant_id","module_name");--> statement-breakpoint
CREATE INDEX "tenant_code_releases_tenant_env_idx" ON "tenant_code_releases" USING btree ("tenant_id","environment");--> statement-breakpoint
CREATE INDEX "tenant_code_releases_deployed_at_idx" ON "tenant_code_releases" USING btree ("deployed_at");--> statement-breakpoint
CREATE INDEX "tenant_code_tests_module_idx" ON "tenant_code_tests" USING btree ("module_id");--> statement-breakpoint
CREATE INDEX "tenant_code_tests_status_idx" ON "tenant_code_tests" USING btree ("last_run_status");--> statement-breakpoint
CREATE INDEX "tenant_context_tenant_idx" ON "tenant_context" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_tenant_module" ON "tenant_modules" USING btree ("tenant_id","module_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_secrets_tenant_env_key_idx" ON "tenant_secrets" USING btree ("tenant_id","environment","key_name");--> statement-breakpoint
CREATE INDEX "user_agent_interactions_tenant_agent_idx" ON "user_agent_interactions" USING btree ("tenant_id","agent_name");--> statement-breakpoint
CREATE INDEX "user_agent_interactions_success_feedback_idx" ON "user_agent_interactions" USING btree ("success_flag","user_feedback");--> statement-breakpoint
CREATE INDEX "user_agent_interactions_created_at_idx" ON "user_agent_interactions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "user_agent_interactions_conversation_idx" ON "user_agent_interactions" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "user_profiles_user_tenant_idx" ON "user_profiles" USING btree ("user_id","tenant_id");--> statement-breakpoint
CREATE INDEX "vat_returns_tenant_idx" ON "vat_returns" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "vat_returns_period_idx" ON "vat_returns" USING btree ("period_start","period_end");--> statement-breakpoint
CREATE INDEX "vat_returns_status_idx" ON "vat_returns" USING btree ("filing_status");