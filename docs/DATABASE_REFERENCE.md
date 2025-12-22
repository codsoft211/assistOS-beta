# AssistOS Database Tables Reference

**Last Updated:** November 27, 2025  
**Total Tables:** 315  
**Database:** PostgreSQL (Supabase)

---

## Table of Contents

1. [Overview](#overview)
2. [Legend](#legend)
3. [Core Platform Tables](#core-platform-tables)
4. [AI Assistant Tables](#ai-assistant-tables)
5. [CRM Module Tables](#crm-module-tables)
6. [Financial Module Tables](#financial-module-tables)
7. [Inventory Module Tables](#inventory-module-tables)
8. [Commercial/Sales Module Tables](#commercialsales-module-tables)
9. [Projects Module Tables](#projects-module-tables)
10. [Lead Generation (Angariacao) Module Tables](#lead-generation-angariacao-module-tables)
11. [Logistics Module Tables](#logistics-module-tables)
12. [Document Management Tables](#document-management-tables)
13. [Communication Tables](#communication-tables)
14. [Configuration & Schema Evolution Tables](#configuration--schema-evolution-tables)
15. [Integration & Connector Tables](#integration--connector-tables)
16. [Agent & Automation Tables](#agent--automation-tables)
17. [Billing & Credits Tables](#billing--credits-tables)
18. [Production Status Summary](#production-status-summary)

---

## Overview

AssistOS uses a multi-tenant architecture where most tables include:
- `tenant_id` - Tenant isolation (required for tenant-scoped data)
- `environment` - Environment isolation (production/sandbox), defaults to 'production'
- `user_id` - User attribution (optional, for user-specific data)

### System Roles

| System | Purpose | Tables Used |
|--------|---------|-------------|
| **AssistME** | Operational AI assistant for daily tasks | conversations, messages, tool_embeddings, usage_events |
| **AssistBuild** | Configuration studio for tenant customization | assistbuild_*, blueprints, custom_entities, workflow_templates |
| **AssistSettings** | User preferences and settings management | assistsettings_*, user_profiles, notification_preferences |
| **Core Platform** | Authentication, tenants, modules | users, tenants, modules, user_tenants |

---

## Legend

| Symbol | Meaning |
|--------|---------|
| **T** | Tenant-scoped (has tenant_id) |
| **E** | Environment-scoped (has environment column) |
| **U** | User-scoped (has user_id) |
| **G** | Global/Platform-wide (no tenant isolation) |
| **Core** | Required for platform operation |
| **MVP** | Essential for MVP functionality |
| **Empty OK** | Can be empty in production |
| **Required** | Must have data for system to work |

---

## Core Platform Tables

These tables are essential for the platform to function. They manage authentication, multi-tenancy, and core system configuration.

### 1.1 Authentication & Users

| Table | Scope | Rows | System Role | Production Status | Description |
|-------|-------|------|-------------|-------------------|-------------|
| `users` | G | 58 | Core Platform | **Required** | User accounts with email, password, OAuth |
| `user_tenants` | T+E | 58 | Core Platform | **Required** | User-tenant membership with roles/permissions |
| `user_sessions` | T | 20 | Core Platform | Empty OK | Session management (ephemeral) |
| `user_profiles` | T+E+U | 0 | AssistSettings | Empty OK | Extended user profile per tenant |
| `user_actions` | T+E+U | 669 | Core Platform | Empty OK | User action audit trail |
| `tenant_invitations` | T+E | 18 | Core Platform | Empty OK | Pending user invitations |
| `invite_billing_events` | T | 52 | Billing | Empty OK | Invitation billing event log |

### 1.2 Tenants & Organization

| Table | Scope | Rows | System Role | Production Status | Description |
|-------|-------|------|-------------|-------------------|-------------|
| `tenants` | G | 88 | Core Platform | **Required** | Tenant organizations |
| `company_info` | T+E | 5 | Core Platform | Empty OK | Company details per tenant |
| `departments` | T+E | 6 | Core Platform | Empty OK | Organizational departments |
| `teams` | T | 0 | Core Platform | Empty OK | Team groupings |
| `team_members` | T | 0 | Core Platform | Empty OK | Team membership |
| `tenant_context` | T+E | 0 | AssistBuild | Empty OK | Business context for AI |
| `tenant_blueprints` | T+E | 1 | AssistBuild | Empty OK | Business blueprint summary |

### 1.3 Modules & Features

| Table | Scope | Rows | System Role | Production Status | Description |
|-------|-------|------|-------------|-------------------|-------------|
| `modules` | T+E | 0 | Core Platform | Empty OK | Installed modules (legacy) |
| `tenant_modules` | T+E | 118 | Core Platform | **Required** | Active modules per tenant |
| `module_features` | T+E | 0 | Core Platform | Empty OK | Feature flags per module |
| `module_pages` | T+E | 1085 | Core Platform | **Required** | Navigation menu structure |
| `module_templates` | G | 17 | Core Platform | **Required** | Available module definitions |
| `module_interface_config` | T+E | 0 | Core Platform | Empty OK | UI customization per module |
| `user_module_preferences` | T+E+U | 0 | AssistSettings | Empty OK | Hidden/favorite modules per user |

### 1.4 Sequence Counters

| Table | Scope | Rows | System Role | Production Status | Description |
|-------|-------|------|-------------|-------------------|-------------|
| `sequence_counters` | T+E | 6 | Core Platform | Empty OK | Auto-increment codes (SUP-0001, etc.) |

---

## AI Assistant Tables

Tables that power the three AI chat systems.

### 2.1 AssistME (Operational Assistant)

| Table | Scope | Rows | System Role | Production Status | Description |
|-------|-------|------|-------------|-------------------|-------------|
| `conversations` | T+E | 248 | AssistME | Empty OK | Chat conversations |
| `messages` | T+E | 615 | AssistME | Empty OK | Chat messages |
| `tool_embeddings` | G | 146 | AssistME | **Required** | Semantic tool selection embeddings |
| `conversation_insights` | T+E+U | 0 | AssistME | Empty OK | Extracted conversation insights |

### 2.2 AssistBuild (Configuration Studio)

| Table | Scope | Rows | System Role | Production Status | Description |
|-------|-------|------|-------------|-------------------|-------------|
| `assistbuild_conversations` | T+E | 25 | AssistBuild | Empty OK | Configuration chat sessions |
| `assistbuild_messages` | T+E | 123 | AssistBuild | Empty OK | Configuration chat messages (via conversation FK) |
| `assistbuild_jobs` | T+E+U | 0 | AssistBuild | Empty OK | Background job queue |
| `generated_code` | T+E | 0 | AssistBuild | Empty OK | AI-generated code artifacts |
| `code_generation_validations` | T | 0 | AssistBuild | Empty OK | Code validation results |
| `code_validation_results` | T | 0 | AssistBuild | Empty OK | Detailed validation output |
| `code_generation_audit` | T+E+U | 0 | AssistBuild | Empty OK | Code generation audit trail |

### 2.3 AssistSettings (User Settings)

| Table | Scope | Rows | System Role | Production Status | Description |
|-------|-------|------|-------------|-------------------|-------------|
| `assistsettings_conversations` | U | 53 | AssistSettings | Empty OK | Settings chat sessions |
| `assistsettings_messages` | U | 159 | AssistSettings | Empty OK | Settings chat messages |

### 2.4 Learning & Patterns

| Table | Scope | Rows | System Role | Production Status | Description |
|-------|-------|------|-------------|-------------------|-------------|
| `learned_preferences` | T+E+U | 0 | AI Learning | Empty OK | User preference patterns |
| `field_patterns` | T+E | 0 | AI Learning | Empty OK | Data entry patterns |
| `presentation_patterns` | T+E | 0 | AI Learning | Empty OK | Display format patterns |
| `financial_patterns` | T+E | 0 | AI Learning | Empty OK | Financial calculation patterns |
| `email_response_learnings` | T+E+U | 0 | AI Learning | Empty OK | Email response patterns |
| `cross_tenant_patterns` | E | 0 | AI Learning | Empty OK | Anonymized cross-tenant patterns |
| `detected_patterns` | T+E+U | 0 | AI Learning | Empty OK | Detected user patterns |
| `detected_gaps` | T+E | 0 | AI Learning | Empty OK | Feature gap detection |
| `tenant_memory_facts` | T+E+U | 0 | AI Learning | Empty OK | Business context memory |

---

## CRM Module Tables

Customer relationship management and sales pipeline.

### 3.1 Core CRM

| Table | Scope | Rows | System Role | Production Status | Description |
|-------|-------|------|-------------|-------------------|-------------|
| `clients` | T+E | 67 | CRM | MVP | Customer/client records |
| `client_embeddings` | T+E | 0 | CRM + AI | Empty OK | Client semantic search |
| `entities` | T+E | 0 | CRM | Empty OK | Universal people/companies |
| `opportunities` | T+E | 0 | CRM | Empty OK | Sales opportunities |
| `opportunity_rules` | T+E | 0 | CRM | Empty OK | Opportunity automation rules |

### 3.2 CRM Activities & Contracts

| Table | Scope | Rows | System Role | Production Status | Description |
|-------|-------|------|-------------|-------------------|-------------|
| `crm_activities` | T+E | 0 | CRM | Empty OK | Activity log (calls, meetings) |
| `crm_contracts` | T+E | 0 | CRM | Empty OK | Customer contracts |
| `crm_renewals` | T+E | 0 | CRM | Empty OK | Contract renewals |
| `contract_submissions` | T+E | 0 | CRM | Empty OK | OCR contract uploads |

### 3.3 Activities (Global)

| Table | Scope | Rows | System Role | Production Status | Description |
|-------|-------|------|-------------|-------------------|-------------|
| `activities` | T+E | 5 | Core Platform | Empty OK | Cross-module activity feed |
| `activity_feed` | T+E | 0 | Core Platform | Empty OK | Activity timeline |

---

## Financial Module Tables

Accounts receivable, accounts payable, invoicing, and treasury.

### 4.1 Chart of Accounts & Journals

| Table | Scope | Rows | System Role | Production Status | Description |
|-------|-------|------|-------------|-------------------|-------------|
| `chart_of_accounts` | T+E | 6 | Finance | Empty OK | Accounting chart |
| `journal_entries` | T+E | 0 | Finance | Empty OK | Journal entries |
| `journal_entry_lines` | T+E | 0 | Finance | Empty OK | Journal line items |
| `fiscal_periods` | T+E | 0 | Finance | Empty OK | Fiscal period definitions |

### 4.2 Invoicing (AR)

| Table | Scope | Rows | System Role | Production Status | Description |
|-------|-------|------|-------------|-------------------|-------------|
| `invoices` | T+E | 0 | Finance | MVP | Customer invoices |
| `invoice_items` | T+E | 0 | Finance | MVP | Invoice line items |
| `invoice_lines` | T+E | 0 | Finance | Empty OK | Alternative invoice lines |
| `invoice_taxes` | T+E | 0 | Finance | Empty OK | Tax breakdowns |
| `invoice_validations` | T+E | 0 | Finance | Empty OK | Invoice validation checks |
| `invoice_embeddings` | T+E | 0 | Finance + AI | Empty OK | Invoice semantic search |

### 4.3 Payables (AP)

| Table | Scope | Rows | System Role | Production Status | Description |
|-------|-------|------|-------------|-------------------|-------------|
| `payables` | T+E | 0 | Finance | MVP | Accounts payable records |
| `payments` | T+E | 0 | Finance | MVP | Payment records |
| `payment_allocations` | T+E | 0 | Finance | Empty OK | Payment-to-invoice allocation |
| `payment_plans` | T+E | 0 | Finance | Empty OK | Payment plan schedules |
| `payment_reminders` | T+E | 0 | Finance | Empty OK | Payment reminder log |
| `dunning_runs` | T+E | 0 | Finance | Empty OK | Dunning process executions |

### 4.4 Banking & Treasury

| Table | Scope | Rows | System Role | Production Status | Description |
|-------|-------|------|-------------|-------------------|-------------|
| `bank_accounts` | T+E | 0 | Finance | MVP | Bank account records |
| `bank_reconciliations` | T+E | 0 | Finance | Empty OK | Reconciliation records |
| `bank_statement_transactions` | T+E | 0 | Finance | Empty OK | Imported bank transactions |
| `cashflow_snapshots` | T+E | 0 | Finance | Empty OK | Cashflow forecast snapshots |
| `employee_expenses` | T+E | 0 | Finance | Empty OK | Employee expense claims |

### 4.5 Taxation

| Table | Scope | Rows | System Role | Production Status | Description |
|-------|-------|------|-------------|-------------------|-------------|
| `tax_categories` | T+E | 0 | Finance | Empty OK | Tax category definitions |
| `tax_rates` | T+E | 0 | Finance | Empty OK | Tax rate percentages |
| `tax_jurisdictions` | T+E | 0 | Finance | Empty OK | Tax jurisdiction rules |
| `tax_obligations` | T+E | 0 | Finance | Empty OK | Tax filing obligations |
| `vat_returns` | T+E | 0 | Finance | Empty OK | VAT return records |

### 4.6 Open Banking

| Table | Scope | Rows | System Role | Production Status | Description |
|-------|-------|------|-------------|-------------------|-------------|
| `open_banking_connections` | T+E | 0 | Finance | Empty OK | Bank API connections |
| `open_banking_accounts` | T+E | 0 | Finance | Empty OK | Connected bank accounts |
| `open_banking_transactions` | T+E | 0 | Finance | Empty OK | Synced transactions |

### 4.7 Financial Models

| Table | Scope | Rows | System Role | Production Status | Description |
|-------|-------|------|-------------|-------------------|-------------|
| `financial_models` | T+E | 0 | Finance | Empty OK | Financial model definitions |
| `financial_calculations` | T+E | 0 | Finance | Empty OK | Calculation results |
| `financial_scenarios` | T+E | 0 | Finance | Empty OK | Scenario planning |

---

## Inventory Module Tables

Product management, recipes, and stock control.

### 5.1 Products & Categories

| Table | Scope | Rows | System Role | Production Status | Description |
|-------|-------|------|-------------|-------------------|-------------|
| `products` | T+E | 35 | Inventory | **Required** | Product catalog (RAW, SEMI, FINISHED, PACKAGING) |
| `product_specifications` | T+E | 0 | Inventory | Empty OK | Product specifications |
| `product_embeddings` | T+E | 0 | Inventory + AI | Empty OK | Product semantic search |
| `uoms` | T+E | 18 | Inventory | **Required** | Units of measure |

### 5.2 Recipes & BOM

| Table | Scope | Rows | System Role | Production Status | Description |
|-------|-------|------|-------------|-------------------|-------------|
| `recipes` | T+E | 0 | Inventory | Empty OK | Recipe/BOM headers |
| `recipe_lines` | T+E | 0 | Inventory | Empty OK | Recipe ingredients |

### 5.3 Stock Control

| Table | Scope | Rows | System Role | Production Status | Description |
|-------|-------|------|-------------|-------------------|-------------|
| `inventory_levels` | T+E | 0 | Inventory | Empty OK | Current stock levels |
| `inventory_transactions` | T+E | 0 | Inventory | Empty OK | Stock movement history |
| `inventory_batches` | T+E | 0 | Inventory | Empty OK | Batch/lot tracking |
| `inventory_counts` | T+E | 0 | Inventory | Empty OK | Stock count records |
| `stock_alerts` | T+E | 0 | Inventory | Empty OK | Low stock alerts |
| `warehouses` | T+E | 3 | Inventory | MVP | Warehouse locations |

### 5.4 Production

| Table | Scope | Rows | System Role | Production Status | Description |
|-------|-------|------|-------------|-------------------|-------------|
| `production_work_orders` | T+E | 0 | Inventory | Empty OK | Production work orders |
| `production_work_order_materials` | T+E | 0 | Inventory | Empty OK | WO material requirements |
| `production_batches` | T+E | 0 | Inventory | Empty OK | Production batch tracking |
| `production_execution_logs` | T+E | 0 | Inventory | Empty OK | Execution audit log |
| `production_quality_checks` | T+E | 0 | Inventory | Empty OK | QC inspection records |
| `production_operations` | T+E | 0 | Inventory | Empty OK | Production operations |
| `production_integrations` | T+E | 0 | Inventory | Empty OK | External system sync |

---

## Commercial/Sales Module Tables

Quotes, pricing, and service lines for sales operations.

### 6.1 Service Lines (Catering Bundles)

| Table | Scope | Rows | System Role | Production Status | Description |
|-------|-------|------|-------------|-------------------|-------------|
| `service_lines` | T+E | 23 | Commercial | **Required** | Commercial service bundles (e.g., "Cocktail Entradas Base") |
| `service_line_components` | T+E | 0 | Commercial | Empty OK | Bundle components (finished goods links) |

### 6.2 Quotes & Pricing

| Table | Scope | Rows | System Role | Production Status | Description |
|-------|-------|------|-------------|-------------------|-------------|
| `quotes` | T+E | 0 | Commercial | MVP | Sales quotes |
| `quote_lines` | T+E | 0 | Commercial | MVP | Quote line items |
| `quote_pricing_rules` | T+E | 0 | Commercial | Empty OK | Dynamic pricing rules |
| `proposals` | T+E | 0 | Commercial | Empty OK | Sales proposals |

### 6.3 Budget Quotes (Catering-Specific)

| Table | Scope | Rows | System Role | Production Status | Description |
|-------|-------|------|-------------|-------------------|-------------|
| `budget_quotes` | T+E | 0 | Commercial | Empty OK | Catering budget quotes |
| `budget_quote_versions` | T+E | 0 | Commercial | Empty OK | Quote version history |
| `budget_quote_items` | T+E | 0 | Commercial | Empty OK | Quote item details |
| `budget_packages` | T+E | 0 | Commercial | Empty OK | Package configurations |
| `budget_package_items` | T+E | 0 | Commercial | Empty OK | Package line items |
| `budget_menu_items` | T+E | 0 | Commercial | Empty OK | Menu item configurations |
| `budget_staff_roles` | T+E | 0 | Commercial | Empty OK | Staff role pricing |
| `budget_transport_rules` | T+E | 0 | Commercial | Empty OK | Transport cost rules |
| `budget_alerts` | T+E | 0 | Commercial | Empty OK | Budget threshold alerts |

### 6.4 Sales Orders

| Table | Scope | Rows | System Role | Production Status | Description |
|-------|-------|------|-------------|-------------------|-------------|
| `sales_orders` | T+E | 0 | Commercial | MVP | Confirmed sales orders |
| `sales_order_lines` | T+E | 0 | Commercial | MVP | Order line items |

### 6.5 Pricing Catalog

| Table | Scope | Rows | System Role | Production Status | Description |
|-------|-------|------|-------------|-------------------|-------------|
| `pricing_catalogs` | T+E | 0 | Commercial | Empty OK | Price list catalogs |
| `pricing_catalog_categories` | T+E | 0 | Commercial | Empty OK | Catalog categories |
| `pricing_line_items` | T+E | 0 | Commercial | Empty OK | Catalog line items |
| `pricing_discounts` | T+E | 0 | Commercial | Empty OK | Discount rules |
| `pricing_taxes` | T+E | 0 | Commercial | Empty OK | Tax configurations |
| `pricing_addons` | T+E | 0 | Commercial | Empty OK | Add-on products |
| `rate_cards` | T+E | 0 | Commercial | Empty OK | Service rate cards |

### 6.6 Cost Templates

| Table | Scope | Rows | System Role | Production Status | Description |
|-------|-------|------|-------------|-------------------|-------------|
| `cost_templates` | T+E | 0 | Commercial | Empty OK | Cost calculation templates |
| `cost_components` | T+E | 0 | Commercial | Empty OK | Cost breakdown components |

---

## Projects Module Tables

Full project management including phases, tasks, resources, and documentation.

### 7.1 Core Projects

| Table | Scope | Rows | System Role | Production Status | Description |
|-------|-------|------|-------------|-------------------|-------------|
| `projects` | T+E | 40 | Projects | MVP | Project records |
| `projects_config` | T+E | 0 | Projects | Empty OK | Project type configurations |
| `project_states` | T+E | 0 | Projects | Empty OK | Project state machine |
| `project_templates` | T+E | 0 | Projects | Empty OK | Project templates |
| `project_embeddings` | T+E | 0 | Projects + AI | Empty OK | Project semantic search |

### 7.2 Project Structure

| Table | Scope | Rows | System Role | Production Status | Description |
|-------|-------|------|-------------|-------------------|-------------|
| `project_phases` | T+E | 0 | Projects | Empty OK | Project phases/stages |
| `project_tasks` | T+E | 0 | Projects | Empty OK | Task management |
| `project_milestones` | T+E | 0 | Projects | Empty OK | Milestone tracking |
| `project_deliverables` | T+E | 0 | Projects | Empty OK | Deliverable definitions |

### 7.3 Project Resources & Team

| Table | Scope | Rows | System Role | Production Status | Description |
|-------|-------|------|-------------|-------------------|-------------|
| `project_team_members` | T+E | 0 | Projects | Empty OK | Team membership |
| `project_resource_allocations` | T+E | 0 | Projects | Empty OK | Resource scheduling |
| `project_time_entries` | T+E | 0 | Projects | Empty OK | Time tracking |
| `project_expenses` | T+E | 0 | Projects | Empty OK | Expense tracking |

### 7.4 Project Documents & Approvals

| Table | Scope | Rows | System Role | Production Status | Description |
|-------|-------|------|-------------|-------------------|-------------|
| `project_documents` | T+E | 0 | Projects | Empty OK | Document management |
| `project_approvals` | T+E | 0 | Projects | Empty OK | Approval workflows |
| `project_activity_logs` | T+E | 0 | Projects | Empty OK | Activity audit |

### 7.5 Project Governance

| Table | Scope | Rows | System Role | Production Status | Description |
|-------|-------|------|-------------|-------------------|-------------|
| `project_risks` | T+E | 0 | Projects | Empty OK | Risk register |
| `project_issues` | T+E | 0 | Projects | Empty OK | Issue tracking |
| `project_change_requests` | T+E | 0 | Projects | Empty OK | Change requests |
| `project_decisions` | T+E | 0 | Projects | Empty OK | Decision log |

### 7.6 Project Commercial

| Table | Scope | Rows | System Role | Production Status | Description |
|-------|-------|------|-------------|-------------------|-------------|
| `project_contracts` | T+E | 0 | Projects | Empty OK | Project contracts |
| `project_purchases` | T+E | 0 | Projects | Empty OK | Project purchases |
| `project_menu_items` | T+E | 0 | Projects | Empty OK | Catering event menus |

---

## Lead Generation (Angariacao) Module Tables

Campaign management and lead tracking.

### 8.1 Leads

| Table | Scope | Rows | System Role | Production Status | Description |
|-------|-------|------|-------------|-------------------|-------------|
| `commercial_leads` | T+E | 1193 | Lead Gen | MVP | Lead records |
| `commercial_leads_backup_20251125` | T+E | 962 | Backup | Empty OK | Data backup (temp) |
| `angariacao_leads` | T | 0 | Lead Gen | Empty OK | Alternative leads table |

### 8.2 Campaigns & Performance

| Table | Scope | Rows | System Role | Production Status | Description |
|-------|-------|------|-------------|-------------------|-------------|
| `ad_campaigns` | T+E | 0 | Lead Gen | Empty OK | Ad campaign definitions |
| `ad_campaign_performance` | T+E | 0 | Lead Gen | Empty OK | Campaign metrics |

### 8.3 Lead Scoring & Sources

| Table | Scope | Rows | System Role | Production Status | Description |
|-------|-------|------|-------------|-------------------|-------------|
| `commercial_lead_scoring` | T+E | 5 | Lead Gen | Empty OK | Lead scoring rules |
| `commercial_lead_sources` | T+E | 0 | Lead Gen | Empty OK | Lead source definitions |

### 8.4 Pipeline & Activities

| Table | Scope | Rows | System Role | Production Status | Description |
|-------|-------|------|-------------|-------------------|-------------|
| `commercial_pipeline` | T+E | 0 | Lead Gen | Empty OK | Sales pipeline stages |
| `commercial_activities` | T+E | 0 | Lead Gen | Empty OK | Commercial activities |
| `commercial_tasks` | T+E | 0 | Lead Gen | Empty OK | Commercial tasks |
| `commercial_forecasts` | T+E | 0 | Lead Gen | Empty OK | Sales forecasts |
| `commercial_conversion_metrics` | T+E | 0 | Lead Gen | Empty OK | Conversion tracking |

### 8.5 Commercial AI & Automation

| Table | Scope | Rows | System Role | Production Status | Description |
|-------|-------|------|-------------|-------------------|-------------|
| `commercial_ai_suggestions` | T+E | 0 | Lead Gen + AI | Empty OK | AI-generated suggestions |
| `commercial_automation_rules` | T+E | 0 | Lead Gen | Empty OK | Automation rules |
| `commercial_agent_configs` | T+E | 0 | Lead Gen | Empty OK | Commercial agent settings |
| `commercial_agent_executions` | T+E | 0 | Lead Gen | Empty OK | Agent execution log |

### 8.6 Email Sequences

| Table | Scope | Rows | System Role | Production Status | Description |
|-------|-------|------|-------------|-------------------|-------------|
| `commercial_email_templates` | T+E | 0 | Lead Gen | Empty OK | Email templates |
| `commercial_email_sequences` | T+E | 0 | Lead Gen | Empty OK | Drip campaigns |
| `commercial_email_events` | T+E | 0 | Lead Gen | Empty OK | Email event tracking |

---

## Logistics Module Tables

Catering-specific logistics and kitchen operations.

### 9.1 Catering Operations

| Table | Scope | Rows | System Role | Production Status | Description |
|-------|-------|------|-------------|-------------------|-------------|
| `catering_kitchen_workflows` | T+E | 0 | Logistics | Empty OK | Kitchen workflow definitions |
| `catering_logistics` | T+E | 0 | Logistics | Empty OK | Event logistics planning |
| `catering_prep_lists` | T+E | 0 | Logistics | Empty OK | Prep list generation |

---

## Document Management Tables

Centralized document storage and AI classification.

### 10.1 Documents

| Table | Scope | Rows | System Role | Production Status | Description |
|-------|-------|------|-------------|-------------------|-------------|
| `documents` | T+E | 1 | Documents | MVP | Document records |
| `document_versions` | T+E | 1 | Documents | Empty OK | Version history |
| `document_folders` | T+E | 7 | Documents | Empty OK | Folder structure |
| `document_folder_links` | T+E | 0 | Documents | Empty OK | Document-folder relations |
| `document_templates` | T+E | 0 | Documents | Empty OK | Document templates |

### 10.2 Document AI

| Table | Scope | Rows | System Role | Production Status | Description |
|-------|-------|------|-------------|-------------------|-------------|
| `document_analyses` | T+E | 0 | Documents + AI | Empty OK | OCR/AI analysis results |
| `document_classifications` | T+E | 0 | Documents + AI | Empty OK | Document type classification |
| `document_embeddings` | T+E | 0 | Documents + AI | Empty OK | Document semantic search |
| `document_insights` | T+E | 0 | Documents + AI | Empty OK | Extracted insights |
| `document_quality_checks` | T+E | 0 | Documents | Empty OK | Quality validation |

### 10.3 Document Relations

| Table | Scope | Rows | System Role | Production Status | Description |
|-------|-------|------|-------------|-------------------|-------------|
| `document_entity_links` | T+E | 0 | Documents | Empty OK | Document-entity relations |
| `document_email_links` | T+E | 0 | Documents | Empty OK | Document-email relations |
| `document_links` | T+E | 0 | Documents | Empty OK | Inter-document links |
| `document_permissions` | T+E+U | 0 | Documents | Empty OK | Access control |
| `document_integrations` | T+E | 1 | Documents | Empty OK | External system links |

### 10.4 File Attachments

| Table | Scope | Rows | System Role | Production Status | Description |
|-------|-------|------|-------------|-------------------|-------------|
| `file_attachments` | T+E | 113 | Core Platform | Empty OK | Generic file attachments |

---

## Communication Tables

Email, WhatsApp, and notification management.

### 11.1 Email

| Table | Scope | Rows | System Role | Production Status | Description |
|-------|-------|------|-------------|-------------------|-------------|
| `email_inbox` | T+E | 484 | Communication | Empty OK | Synced email inbox |
| `email_alerts` | T+E+U | 0 | Communication | Empty OK | Email alert configurations |
| `user_gmail_accounts` | T+E+U | 1 | Communication | Empty OK | Gmail OAuth connections |

### 11.2 WhatsApp

| Table | Scope | Rows | System Role | Production Status | Description |
|-------|-------|------|-------------|-------------------|-------------|
| `whatsapp_accounts` | T+E | 1 | Communication | Empty OK | WhatsApp Business accounts |
| `whatsapp_contacts` | T+E | 2 | Communication | Empty OK | WhatsApp contacts |
| `whatsapp_conversations` | T+E | 1 | Communication | Empty OK | WhatsApp conversations |
| `whatsapp_messages` | T+E | 10 | Communication | Empty OK | WhatsApp messages |
| `whatsapp_templates` | T+E | 0 | Communication | Empty OK | Message templates |
| `whatsapp_web_sessions` | T+E | 0 | Communication | Empty OK | WhatsApp Web sessions |

### 11.3 Notifications

| Table | Scope | Rows | System Role | Production Status | Description |
|-------|-------|------|-------------|-------------------|-------------|
| `notifications` | T+E+U | 0 | Core Platform | Empty OK | User notifications |
| `notification_rules` | T+E | 2 | Core Platform | Empty OK | Notification rules |

---

## Configuration & Schema Evolution Tables

Schema management, migrations, and rollback system.

### 12.1 Schema Evolution (GAP #3)

| Table | Scope | Rows | System Role | Production Status | Description |
|-------|-------|------|-------------|-------------------|-------------|
| `schema_versions` | T+E | 1 | AssistBuild | Empty OK | Schema version snapshots |
| `migrations` | T+E | 0 | AssistBuild | Empty OK | Migration definitions |
| `migration_executions` | T+E | 0 | AssistBuild | Empty OK | Migration run history |

### 12.2 Rollback System (GAP #6)

| Table | Scope | Rows | System Role | Production Status | Description |
|-------|-------|------|-------------|-------------------|-------------|
| `rollback_points` | T+E | 0 | AssistBuild | Empty OK | System snapshots |
| `rollback_executions` | T+E | 0 | AssistBuild | Empty OK | Rollback execution log |

### 12.3 Sandbox System (GAP #4)

| Table | Scope | Rows | System Role | Production Status | Description |
|-------|-------|------|-------------|-------------------|-------------|
| `sandbox_executions` | T+E | 0 | AssistBuild | Empty OK | Sandbox test runs |
| `configuration_checkpoints` | T+E | 0 | AssistBuild | Empty OK | Configuration snapshots |

### 12.4 Blueprints

| Table | Scope | Rows | System Role | Production Status | Description |
|-------|-------|------|-------------|-------------------|-------------|
| `blueprints` | T+E | 0 | AssistBuild | Empty OK | Configuration blueprints |
| `blueprint_templates` | G | 0 | AssistBuild | Empty OK | Blueprint templates |
| `blueprint_versions` | T+E | 0 | AssistBuild | Empty OK | Blueprint version history |
| `blueprint_signatures` | T+E | 0 | AssistBuild | Empty OK | Blueprint approval signatures |
| `blueprint_usage_stats` | T+E | 0 | AssistBuild | Empty OK | Usage tracking |
| `blueprint_health` | T+E | 0 | AssistBuild | Empty OK | Blueprint health metrics |
| `blueprint_improvements` | T+E | 0 | AssistBuild | Empty OK | Improvement suggestions |

### 12.5 Custom Entities (Dynamic Schema)

| Table | Scope | Rows | System Role | Production Status | Description |
|-------|-------|------|-------------|-------------------|-------------|
| `custom_entities` | T+E | 8 | AssistBuild | Empty OK | Dynamic entity definitions |
| `custom_entity_records` | T+E | 0 | AssistBuild | Empty OK | Dynamic entity data |
| `custom_fields` | T+E | 108 | AssistBuild | Empty OK | Entity field definitions |
| `global_custom_fields` | T+E | 0 | AssistBuild | Empty OK | Cross-module custom fields |
| `module_custom_fields` | T+E | 0 | AssistBuild | Empty OK | Module-specific fields |
| `entity_views` | T+E | 0 | AssistBuild | Empty OK | Saved entity views |
| `entity_menu_items` | T+E | 0 | AssistBuild | Empty OK | Entity navigation items |
| `entity_workflow_states` | T+E | 0 | AssistBuild | Empty OK | Entity state machine |

### 12.6 Workflows

| Table | Scope | Rows | System Role | Production Status | Description |
|-------|-------|------|-------------|-------------------|-------------|
| `workflow_templates` | G | 109 | Core Platform | **Required** | Workflow definitions |
| `workflow_executions` | T+E | 0 | Core Platform | Empty OK | Workflow run history |
| `tenant_workflows` | T+E | 2 | Core Platform | Empty OK | Tenant workflow instances |

---

## Integration & Connector Tables

External system integrations and OAuth management.

### 13.1 Connectors

| Table | Scope | Rows | System Role | Production Status | Description |
|-------|-------|------|-------------|-------------------|-------------|
| `connectors` | T+E | 0 | Integrations | Empty OK | External connector configs |
| `connector_sync_state` | T+E | 0 | Integrations | Empty OK | Sync state tracking |
| `connector_change_events` | T+E | 0 | Integrations | Empty OK | Change event log |
| `tenant_connector_configs` | T+E | 0 | Integrations | Empty OK | Tenant connector settings |

### 13.2 API & OAuth

| Table | Scope | Rows | System Role | Production Status | Description |
|-------|-------|------|-------------|-------------------|-------------|
| `api_integrations` | T+E | 3 | Integrations | Empty OK | API integration configs |
| `oauth_states` | T+E | 47 | Core Platform | Empty OK | OAuth state tokens |
| `user_oauth_tokens` | T+E+U | 0 | Integrations | Empty OK | User OAuth tokens |
| `user_connector_credentials` | T+E+U | 0 | Integrations | Empty OK | User connector auth |

### 13.3 Provider Sync

| Table | Scope | Rows | System Role | Production Status | Description |
|-------|-------|------|-------------|-------------------|-------------|
| `provider_credentials` | T+E | 0 | Integrations | Empty OK | Provider API credentials |
| `provider_sync_jobs` | T+E | 0 | Integrations | Empty OK | Sync job queue |

### 13.4 ERP Mappings

| Table | Scope | Rows | System Role | Production Status | Description |
|-------|-------|------|-------------|-------------------|-------------|
| `erp_field_mappings` | T+E | 0 | Integrations | Empty OK | External ERP field mapping |
| `field_mappings` | T+E | 0 | Integrations | Empty OK | Generic field mapping |

### 13.5 Storage Providers

| Table | Scope | Rows | System Role | Production Status | Description |
|-------|-------|------|-------------|-------------------|-------------|
| `tenant_storage_providers` | T+E | 42 | Core Platform | Empty OK | Cloud storage configs |

---

## Agent & Automation Tables

AI agents, automation rules, and execution tracking.

### 14.1 Agent Library

| Table | Scope | Rows | System Role | Production Status | Description |
|-------|-------|------|-------------|-------------------|-------------|
| `agents_library` | G | 0 | Core Platform | Empty OK | Available agent types |
| `custom_agents` | T+E | 0 | AssistBuild | Empty OK | Custom agent definitions |
| `specialized_agents` | T+E | 0 | AssistBuild | Empty OK | Specialized agent configs |
| `module_agents` | T+E | 0 | AssistBuild | Empty OK | Module-specific agents |
| `conversion_agents` | T+E | 0 | AssistBuild | Empty OK | Data conversion agents |

### 14.2 Agent Execution

| Table | Scope | Rows | System Role | Production Status | Description |
|-------|-------|------|-------------|-------------------|-------------|
| `agent_executions` | T+E | 0 | Core Platform | Empty OK | Agent execution log |
| `agent_runs` | T+E | 0 | Core Platform | Empty OK | Agent run tracking |
| `agent_state` | T+E | 0 | Core Platform | Empty OK | Agent state storage |
| `agent_workflows` | T+E | 0 | Core Platform | Empty OK | Agent workflow definitions |
| `agent_schedules` | T+E | 0 | Core Platform | Empty OK | Scheduled agent runs |

### 14.3 Agent Configuration

| Table | Scope | Rows | System Role | Production Status | Description |
|-------|-------|------|-------------|-------------------|-------------|
| `agent_budgets` | T+E | 0 | Core Platform | Empty OK | Agent budget limits |
| `agent_secrets` | T+E | 0 | Core Platform | Empty OK | Agent secrets storage |
| `agent_role_assignments` | T+E+U | 0 | Core Platform | Empty OK | Agent role assignments |
| `agent_versions` | T+E | 0 | Core Platform | Empty OK | Agent version history |
| `agent_tags` | T+E | 0 | Core Platform | Empty OK | Agent categorization |

### 14.4 Agent Learning

| Table | Scope | Rows | System Role | Production Status | Description |
|-------|-------|------|-------------|-------------------|-------------|
| `agent_feedback` | T+E | 0 | AI Learning | Empty OK | User feedback on agents |
| `agent_learnings` | T+E | 0 | AI Learning | Empty OK | Agent learning data |
| `agent_handoffs` | T+E | 0 | Core Platform | Empty OK | Agent handoff records |
| `agent_interactions` | T+E | 0 | Core Platform | Empty OK | Agent interaction log |
| `user_agent_interactions` | T+E+U | 0 | Core Platform | Empty OK | User-agent interactions |

### 14.5 Automation

| Table | Scope | Rows | System Role | Production Status | Description |
|-------|-------|------|-------------|-------------------|-------------|
| `tenant_automations` | T+E | 8 | Core Platform | Empty OK | Tenant automation rules |
| `automation_executions` | T+E | 0 | Core Platform | Empty OK | Automation run log |
| `approval_workflows` | T+E | 0 | Core Platform | Empty OK | Approval workflow configs |
| `execution_plans` | T+E | 0 | Core Platform | Empty OK | Execution plan definitions |
| `execution_traces` | T+E | 0 | Core Platform | Empty OK | Execution trace log |
| `execution_tier_policies` | T+E | 0 | Core Platform | Empty OK | Tier-based execution rules |

---

## Billing & Credits Tables

Subscription management, credits, and usage tracking.

### 15.1 Subscriptions

| Table | Scope | Rows | System Role | Production Status | Description |
|-------|-------|------|-------------|-------------------|-------------|
| `subscription_plans` | G | 4 | Billing | **Required** | Available subscription plans |
| `subscriptions` | T | 0 | Billing | Empty OK | Legacy subscriptions |
| `tenant_subscriptions` | T | 1 | Billing | **Required** | Active tenant subscriptions |

### 15.2 Credits System

| Table | Scope | Rows | System Role | Production Status | Description |
|-------|-------|------|-------------|-------------------|-------------|
| `tenant_credits` | T | 2 | Billing | **Required** | Tenant credit balances |
| `credit_packages` | T | 0 | Billing | Empty OK | Credit package definitions |
| `credit_package_purchases` | T | 0 | Billing | Empty OK | Credit purchase history |
| `credit_transactions` | T+E | 1 | Billing | Empty OK | Credit movement audit |
| `credit_pricing_rules` | T+E | 14 | Billing | **Required** | Resource pricing rules |

### 15.3 Usage Tracking

| Table | Scope | Rows | System Role | Production Status | Description |
|-------|-------|------|-------------|-------------------|-------------|
| `usage_events` | T+E | 1 | Billing | Empty OK | Billable usage events |

### 15.4 Resource Quotas (GAP #5)

| Table | Scope | Rows | System Role | Production Status | Description |
|-------|-------|------|-------------|-------------------|-------------|
| `tenant_resource_quotas` | T | 0 | Core Platform | Empty OK | Custom quota overrides |

---

## Purchasing Module Tables

Supplier management, purchase orders, and invoices.

### 16.1 Suppliers

| Table | Scope | Rows | System Role | Production Status | Description |
|-------|-------|------|-------------|-------------------|-------------|
| `suppliers` | T+E | 6 | Purchasing | MVP | Supplier records |
| `supplier_embeddings` | T+E | 0 | Purchasing + AI | Empty OK | Supplier semantic search |
| `product_suppliers` | T+E | 0 | Purchasing | Empty OK | Product-supplier links |
| `supplier_price_history` | T+E | 0 | Purchasing | Empty OK | Price history tracking |

### 16.2 RFQs & Quotes

| Table | Scope | Rows | System Role | Production Status | Description |
|-------|-------|------|-------------|-------------------|-------------|
| `rfqs` | T+E | 0 | Purchasing | Empty OK | Request for quotes |
| `rfq_lines` | T+E | 0 | Purchasing | Empty OK | RFQ line items |
| `rfq_quotes` | T+E | 0 | Purchasing | Empty OK | Supplier quotes |
| `rfq_quote_lines` | T+E | 0 | Purchasing | Empty OK | Quote line items |

### 16.3 Purchase Orders

| Table | Scope | Rows | System Role | Production Status | Description |
|-------|-------|------|-------------|-------------------|-------------|
| `purchase_orders` | T+E | 0 | Purchasing | MVP | Purchase orders |
| `purchase_order_lines` | T+E | 0 | Purchasing | MVP | PO line items |
| `purchase_requisitions` | T+E | 0 | Purchasing | Empty OK | Purchase requisitions |
| `purchase_requisition_lines` | T+E | 0 | Purchasing | Empty OK | Requisition lines |

### 16.4 Receipts & Returns

| Table | Scope | Rows | System Role | Production Status | Description |
|-------|-------|------|-------------|-------------------|-------------|
| `receipts` | T+E | 0 | Purchasing | Empty OK | Goods receipts |
| `receipt_lines` | T+E | 0 | Purchasing | Empty OK | Receipt line items |
| `supplier_returns` | T+E | 0 | Purchasing | Empty OK | Supplier returns |
| `supplier_return_lines` | T+E | 0 | Purchasing | Empty OK | Return line items |

### 16.5 Supplier Invoices

| Table | Scope | Rows | System Role | Production Status | Description |
|-------|-------|------|-------------|-------------------|-------------|
| `supplier_invoices` | T+E | 1 | Purchasing | Empty OK | Supplier invoices (AP) |
| `purchasing_invoices` | T+E | 12 | Purchasing | MVP | Purchasing invoices |
| `purchasing_invoice_lines` | T+E | 1 | Purchasing | MVP | Invoice line items |
| `purchasing_payments` | T+E | 0 | Purchasing | Empty OK | Payments to suppliers |
| `purchasing_payment_allocations` | T+E | 0 | Purchasing | Empty OK | Payment allocations |

---

## Core Protection Tables (GAP #1)

Tables for protecting platform core assets.

| Table | Scope | Rows | System Role | Production Status | Description |
|-------|-------|------|-------------|-------------------|-------------|
| `core_assets` | G | 19 | Core Platform | **Required** | Core asset registry |
| `core_asset_versions` | T+E | 0 | Core Platform | Empty OK | Asset version tracking |
| `governance_policies` | T+E | 0 | Core Platform | Empty OK | Governance rule definitions |
| `tenant_secrets` | T+E | 0 | Core Platform | Empty OK | Encrypted tenant secrets |
| `tenant_code_artifacts` | T+E | 0 | AssistBuild | Empty OK | Generated code artifacts |
| `tenant_code_files` | T+E | 0 | AssistBuild | Empty OK | Code file storage |
| `tenant_code_modules` | T+E | 0 | AssistBuild | Empty OK | Code module definitions |
| `tenant_code_releases` | T+E | 0 | AssistBuild | Empty OK | Code release history |
| `tenant_code_tests` | T+E | 0 | AssistBuild | Empty OK | Code test results |

---

## Miscellaneous Tables

### 17.1 Audit & Logging

| Table | Scope | Rows | System Role | Production Status | Description |
|-------|-------|------|-------------|-------------------|-------------|
| `audit_log` | T+E | 104 | Core Platform | Empty OK | General audit trail |
| `studio_audit_log` | T+E | 0 | AssistBuild | Empty OK | Configuration studio audit |

### 17.2 Development

| Table | Scope | Rows | System Role | Production Status | Description |
|-------|-------|------|-------------|-------------------|-------------|
| `development_requests` | T+E+U | 0 | AssistBuild | Empty OK | Feature development requests |
| `config_requests` | T+E | 0 | AssistBuild | Empty OK | Configuration requests |
| `tasks` | T+E | 0 | Core Platform | Empty OK | Generic task records |

### 17.3 Forms

| Table | Scope | Rows | System Role | Production Status | Description |
|-------|-------|------|-------------|-------------------|-------------|
| `public_forms` | T+E | 0 | Core Platform | Empty OK | Public form definitions |

### 17.4 Webhooks

| Table | Scope | Rows | System Role | Production Status | Description |
|-------|-------|------|-------------|-------------------|-------------|
| `webhooks` | T+E | 0 | Integrations | Empty OK | Webhook configurations |

### 17.5 Onboarding

| Table | Scope | Rows | System Role | Production Status | Description |
|-------|-------|------|-------------|-------------------|-------------|
| `onboarding_cache` | E+U | 0 | Core Platform | Empty OK | Onboarding session cache |

### 17.6 Patterns & Configuration

| Table | Scope | Rows | System Role | Production Status | Description |
|-------|-------|------|-------------|-------------------|-------------|
| `configuration_patterns` | G | 0 | AI Learning | Empty OK | Business pattern library |
| `business_blueprints` | T+E | 0 | AssistBuild | Empty OK | Business process blueprints |
| `gold_labels` | T+E | 0 | AI Learning | Empty OK | Labeled training data |
| `model_adjustments` | T+E | 0 | AI Learning | Empty OK | ML model adjustments |
| `format_adjustments` | T+E | 0 | AI Learning | Empty OK | Format preference learning |
| `process_optimizations` | T+E | 0 | AI Learning | Empty OK | Process improvement suggestions |
| `promotion_logs` | T+E | 0 | AssistBuild | Empty OK | Sandbox promotion history |
| `legacy_document_mappings` | T+E | 0 | Migration | Empty OK | Legacy system mappings |

---

## Production Status Summary

### Tables Required for Platform Operation (25 tables)

These tables MUST have data for the platform to function:

| Table | Min Rows | Purpose |
|-------|----------|---------|
| `users` | 1+ | At least one admin user |
| `tenants` | 1+ | At least one tenant |
| `user_tenants` | 1+ | User-tenant membership |
| `module_templates` | 17 | Available module definitions |
| `module_pages` | 1+ | Navigation structure |
| `tenant_modules` | 1+ | Active modules per tenant |
| `workflow_templates` | 1+ | Available workflows |
| `tool_embeddings` | 75+ | AI tool selection |
| `subscription_plans` | 4 | Pricing plans |
| `tenant_subscriptions` | 1+ | Active subscriptions |
| `tenant_credits` | 1+ | Credit balances |
| `credit_pricing_rules` | 14 | Resource pricing |
| `core_assets` | 19 | Platform protection |
| `products` | 1+ | Product catalog |
| `uoms` | 1+ | Units of measure |
| `service_lines` | 1+ | Commercial bundles |

### Tables Safe to Be Empty in Production (290 tables)

Most tables are operational data that accumulates over time:
- Chat histories (conversations, messages)
- AI learning tables (patterns, preferences)
- Transaction data (invoices, payments)
- Activity logs (audit, activities)
- Document storage (documents, attachments)

### Tables for Development/Testing Only

| Table | Purpose |
|-------|---------|
| `commercial_leads_backup_*` | Temporary backup tables |
| `sandbox_executions` | Sandbox testing |
| `configuration_checkpoints` | Development snapshots |

---

## Architecture Notes

### Multi-Tenancy Pattern

All tenant-scoped tables follow this pattern:
```sql
tenant_id VARCHAR NOT NULL REFERENCES tenants(id),
environment TEXT NOT NULL DEFAULT 'production',
```

### Environment Isolation

Tables with `environment` column support:
- `production` - Live tenant data
- `sandbox` - Testing environment (AssistBuild)

### Soft Delete Pattern

Some tables use `is_deleted` or `status = 'deleted'` for soft deletion:
- `custom_entities`
- `global_custom_fields`
- `documents`

### Audit Trail

Key tables maintain audit fields:
```sql
created_by VARCHAR REFERENCES users(id),
updated_by VARCHAR REFERENCES users(id),
created_at TIMESTAMP NOT NULL DEFAULT NOW(),
updated_at TIMESTAMP NOT NULL DEFAULT NOW()
```

---
