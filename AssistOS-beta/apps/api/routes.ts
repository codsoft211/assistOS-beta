// Migrated from AssistOS legacy - Phase 4.2
// Main routes aggregator for monorepo

import type { Express } from "express";
import healthRoutes from "./routes/health";
import authRoutes from "./routes/auth";
import tenantsRoutes from "./routes/tenants";
import usersRoutes from "./routes/users";
import permissionsRoutes from "./routes/permissions";
import contextRoutes from "./routes/context";
import oauthRoutes from "./routes/oauth";
import configRoutes from "./routes/config";

// Phase 4.2: Platform Foundations Routes
import uploadsRoutes from "./routes/uploads";
import filesRoutes from "./routes/files";
import secretsRoutes from "./routes/secrets";
import environmentRoutes from "./routes/environment";
import notificationsRoutes from "./routes/notifications";

// Phase 4.3: Conversational & AI Core Routes
import conversationsRoutes from "./routes/conversations";
import onboardingRoutes from "./routes/onboarding";
import studioV2Routes from "./routes/studio-v2";
import studioMinimalRoutes from "./routes/studio-minimal";
import realtimeRoutes from "./routes/realtime";
import aiStatusRoutes from "./routes/ai-status";
import proactiveRoutes from "./routes/proactive";

// Phase 4.4: Business Operations Routes
import dashboardRoutes from "./routes/dashboard";
import analyticsRoutes from "./routes/analytics";
import tasksRoutes from "./routes/tasks";
import crmRoutes from "./routes/crm";
import contractSubmissionsRoutes from "./routes/contract-submissions";
import inventoryRoutes from "./routes/inventory";
import jobSitesRoutes from "./routes/job-sites";
import clientContactsRoutes from "./routes/client-contacts";
import comercialRoutes from "./routes/comercial";
import companyRoutes from "./routes/company";
import comprasRoutes from "./routes/compras";
import financeiroRoutes from "./routes/financeiro/index";
import angariacaoRoutes from "./routes/angariacao";

// Phase 4.5: Integrations Routes
import connectorsRoutes from "./routes/connectors";
import adminConnectorsRoutes from "./routes/admin-connectors";
import userConnectorsRoutes from "./routes/user-connectors";
import connectorImportsRoutes from "./routes/connector-imports";
import integrationsRoutes from "./routes/integrations";
import communicationsRoutes from "./routes/communications";
import formsRoutes from "./routes/forms";
import publicFormsRoutes from "./routes/public-forms";
import supplierInvoiceRoutes from "./routes/supplier-invoice";
import gmailOAuthRoutes from "./routes/gmail-oauth";
import oauthTocOnlineRoutes, { callbackRouter as oauthTocOnlineCallbackRoutes } from "./routes/oauth-toc-online";
import gmailAccountsRoutes from "./routes/gmail-accounts";
import gmailMessagesRoutes from "./routes/gmail-messages";
import gmailSettingsRoutes from "./routes/gmail-settings";
import gmailTemplatesRoutes from "./routes/gmail-templates";
import gmailAutoRespondersRoutes from "./routes/gmail-auto-responders";
import whatsappRoutes from "./routes/whatsapp";
import whatsappConversationsRoutes from "./routes/whatsapp-conversations";
import whatsappMediaRoutes from "./routes/whatsapp-media";
import whatsappTemplatesRoutes from "./routes/whatsapp-templates";
import whatsappAccountsRoutes from "./routes/whatsapp-accounts";
import whatsappWebRoutes from "./routes/whatsapp-web";
import whatsappAutomationRoutes from "./routes/whatsapp-automation";
import cacheMetricsRoutes from "./routes/cache-metrics";

// Phase 4.6: Advanced Features Routes
import entitiesRoutes from "./routes/entities";
import customTablesRoutes from "./routes/custom-tables";
import hubRoutes from "./routes/hub";
import moduleInterfaceRoutes from "./routes/module-interface";
import budgetQuotesRoutes from "./routes/budget-quotes";
import documentAnalysisRoutes from "./routes/document-analysis";
import documentManagementRoutes from "../../packages/document-management/routes";
import adminRoutes from "./routes/admin";
import teamRoutes from "./routes/team";
import orgStructureRoutes from "./routes/org-structure";
import invitationsRoutes from "./routes/invitations";
import importRoutes from "./routes/import";
import quickInvoiceProcessRoutes from "./routes/quick-invoice-process";

// FASE 2: Module Management Routes
import modulesRoutes from "./routes/modules";
import modulePagesRoutes from "./routes/module-pages";

// Gap #5: Resource Quotas
import quotasRoutes from "./routes/quotas";

// Credit System: Usage Analytics & Billing
import creditsRoutes from "./routes/credits";

// Platform Settings: System-wide configuration management
import platformSettingsRoutes from "./routes/platform-settings";

// Billing System: Subscriptions, Seats, Credit Packages
import subscriptionRoutes from "./routes/billing/subscription";
import seatsRoutes from "./routes/billing/seats";
import packagesRoutes from "./routes/billing/packages";
import paymentMethodsRoutes from "./routes/billing/payment-methods";
import stripeWebhookRoutes from "./routes/billing/stripe-webhook";

// Phase 5: AssistBuild & Background Jobs
import assistbuildJobsRoutes from "./routes/assistbuild-jobs";
import assistbuildRoutes from "./routes/assistbuild";
import assistbuildConversationsRoutes from "./routes/assistbuild-conversations";
import assistbuildWorkflowsRoutes from "./routes/assistbuild-workflows";
import scheduledWorkflowsRoutes from "./routes/scheduled-workflows";
import assistsettingsConversationsRoutes from "./routes/assistsettings-conversations";

// Phase 8: Execution Engine Monitoring
import executionsRoutes from "./routes/executions";

// Phase 9.1: Action Tracking System
import actionsRoutes from "./routes/actions";

// Phase 9.3: Pattern Suggestions API
import patternsRoutes from "./routes/patterns";

// Gap #3: Schema Evolution System
import schemaRoutes from "./routes/schema";

// Platform Services: Financial Grid & Universal Search
import financialGridRoutes from "./routes/financial-grid";
import universalSearchRoutes from "./routes/universal-search";

// Gap #6: Rollback System
import rollbackRoutes from "./routes/rollback";

// Projects Module (Cross-module linking, templates, configuration)
import projetosRoutes from "./routes/projetos";

// Activity Feed (Real-time cross-module activity aggregation)
import activityFeedRoutes from "./routes/activity-feed";

// Middleware
import { requireAuth } from "./middleware/auth.middleware";
import { uploadRateLimiter, uxRateLimiter, chatRateLimiter } from "./middleware/rate-limit";
import { tenantMiddleware } from "./middleware/tenant-middleware";

/**
 * Register all API routes
 * Called from apps/api/index.ts during server initialization
 */
export function registerRoutes(app: Express) {
  // ==================== HEALTH CHECKS ====================
  // CRITICAL: Register health routes FIRST - no auth, no tenant middleware
  // Used by load balancers, monitoring systems, and K8s probes
  app.use("/api/health", healthRoutes);
  
  // ==================== PUBLIC CONFIGURATION ====================
  // Public config (no auth required) - must be before auth middleware
  app.use("/api/config", configRoutes);
  
  // ==================== AUTHENTICATION ====================
  // Auth routes include: register, login, logout, me, switch-tenant, Google OAuth
  app.use("/api/auth", authRoutes);
  
  // ==================== TENANTS ====================
  // Tenant management: list, create, switch
  app.use("/api/tenants", tenantsRoutes);
  
  // ==================== USERS ====================
  // User management: CRUD, invitations, preferences
  app.use("/api/users", usersRoutes);
  
  // ==================== PERMISSIONS ====================
  // Permission management: role assignment, permission checking
  app.use("/api/permissions", permissionsRoutes);
  
  // ==================== CONTEXT ====================
  // Tenant context: session, profile, business info
  app.use("/api/context", contextRoutes);
  
  // ==================== TOC ONLINE OAUTH (Phase 4.5) ====================
  // TOC Online OAuth 2.0 flow (Portuguese accounting platform)
  // CRITICAL: Must be registered BEFORE generic /api/oauth to prevent catch-all
  // SECURITY: Callback is public (state-based security), all other routes require auth
  app.use("/api/oauth/toc-online/callback", oauthTocOnlineCallbackRoutes);
  app.use("/api/oauth/toc-online", requireAuth, tenantMiddleware, oauthTocOnlineRoutes);

  // ==================== OAUTH (QUARANTINED) ====================
  // OAuth routes temporarily disabled - awaiting tenant-storage migration
  // NOTE: This catch-all must come AFTER specific OAuth routes (toc-online, gmail)
  app.use("/api/oauth", oauthRoutes);
  
  // ==================== UPLOADS & FILES (Phase 4.2) ====================
  // File upload with presigned URLs and Object Storage
  app.use("/api/uploads", requireAuth, tenantMiddleware, uploadRateLimiter, uploadsRoutes);
  
  // Multer-based file operations (TODO: multer middleware not yet migrated)
  app.use("/api/files", requireAuth, tenantMiddleware, uploadRateLimiter, filesRoutes);
  
  // ==================== SECRETS (Phase 4.2) ====================
  // Secret management for integrations (TODO: agent-sdk not yet migrated)
  app.use("/api/secrets", requireAuth, tenantMiddleware, secretsRoutes);
  
  // ==================== ENVIRONMENT (Phase 4.2) ====================
  // Sandbox ↔ Production environment switching
  app.use("/api/environment", requireAuth, environmentRoutes);
  
  // ==================== QUOTAS (Gap #5) ====================
  // Resource quotas monitoring and enforcement
  app.use("/api/quotas", quotasRoutes);
  
  // ==================== CREDITS (Usage Analytics & Billing) ====================
  // Credit balance, analytics, usage breakdown, transaction history
  app.use("/api/credits", requireAuth, tenantMiddleware, uxRateLimiter, creditsRoutes);
  
  // ==================== PLATFORM SETTINGS ====================
  // Platform-wide configuration management (admin only)
  // Configurable margins, prices, and system parameters
  app.use("/api/platform-settings", requireAuth, uxRateLimiter, platformSettingsRoutes);
  
  // ==================== BILLING (Subscriptions, Seats, Packages) ====================
  // NOTE: Stripe webhook is registered in server/index.ts BEFORE body parser
  // Subscription management: plans, upgrade, downgrade
  app.use("/api/billing/subscription", requireAuth, tenantMiddleware, uxRateLimiter, subscriptionRoutes);
  
  // Payment methods: list, add, set default
  app.use("/api/billing/payment-methods", requireAuth, tenantMiddleware, uxRateLimiter, paymentMethodsRoutes);
  
  // Seat management: list users, mark/unmark paying seats
  app.use("/api/billing/seats", requireAuth, tenantMiddleware, uxRateLimiter, seatsRoutes);
  
  // Credit packages: list packages, purchase packages
  app.use("/api/billing/packages", requireAuth, tenantMiddleware, uxRateLimiter, packagesRoutes);
  
  // ==================== NOTIFICATIONS (Phase 4.2) ====================
  // Notification CRUD, mark as read, preferences
  app.use("/api/notifications", requireAuth, tenantMiddleware, uxRateLimiter, notificationsRoutes);
  
  // ==================== AI STATUS (Phase 4.3) ====================
  // AI availability check - no auth required for status check
  app.use("/api/ai", aiStatusRoutes);
  
  // ==================== CONVERSATIONS (Phase 4.3) ====================
  // Main chat routes - Assist Me, Assist Settings
  // Includes SSE streaming, file uploads, smart tool filtering
  app.use("/api/conversations", requireAuth, tenantMiddleware, chatRateLimiter, conversationsRoutes);
  
  // ==================== PROACTIVE INTELLIGENCE (Phase 8) ====================
  // Proactive insights - deadline alerts, overdue detection, anomalies
  app.use("/api/proactive", requireAuth, tenantMiddleware, uxRateLimiter, proactiveRoutes);
  
  // ==================== ONBOARDING (Phase 4.3) ====================
  // Onboarding conversation (Assist Start)
  // SPECIAL: Works WITHOUT authentication (session-based only)
  app.use("/api/onboarding", chatRateLimiter, onboardingRoutes);
  
  // ==================== REALTIME (Phase 4.3) ====================
  // SSE (Server-Sent Events) for real-time updates
  // Includes SSE stream + delta API fallback
  app.use("/api/realtime", requireAuth, tenantMiddleware, realtimeRoutes);
  
  // ==================== CONFIGURATION STUDIO V2 (Phase 4.3) ====================
  // AI-powered code generation - Blueprint intelligence, RuntimeOrchestrator
  // TODO: Many services still need migration (see studio-v2.ts TODO comments)
  app.use("/api/studio/v2", requireAuth, tenantMiddleware, chatRateLimiter, studioV2Routes);
  
  // ==================== CONFIGURATION STUDIO MINIMAL (Phase 4.3) ====================
  // Non-AI entity/module management operations
  // TODO: ConfigurationStudioAgent class not yet migrated (see studio-minimal.ts TODO comments)
  app.use("/api/studio", requireAuth, tenantMiddleware, studioMinimalRoutes);

  // ==================== DASHBOARD (Phase 4.4) ====================
  // Dashboard metrics, KPIs, and recent activity
  app.use("/api/dashboard", requireAuth, tenantMiddleware, uxRateLimiter, dashboardRoutes);

  // ==================== ACTIVITY FEED ====================
  // Real-time activity feed aggregating events from all modules
  app.use("/api/activity-feed", requireAuth, tenantMiddleware, uxRateLimiter, activityFeedRoutes);

  // ==================== ANALYTICS (Phase 4.4) ====================
  // Business analytics and reporting (financial, sales, operational)
  app.use("/api/analytics", requireAuth, tenantMiddleware, uxRateLimiter, analyticsRoutes);

  // ==================== TASKS (Phase 4.4) ====================
  // Task management CRUD operations
  app.use("/api/tasks", requireAuth, tenantMiddleware, uxRateLimiter, tasksRoutes);

  // ==================== CRM (Phase 4.4) ====================
  // CRM: clients, opportunities, quotes, and orders
  app.use("/api/crm", requireAuth, tenantMiddleware, uxRateLimiter, crmRoutes);
  
  // CRM: Contract submissions with OCR
  app.use("/api/crm/contract-submissions", requireAuth, tenantMiddleware, uxRateLimiter, contractSubmissionsRoutes);

  // ==================== INVENTORY (Phase 4.4) ====================
  // Inventory management (products, stock, movements, warehouses)
  app.use("/api/inventory", requireAuth, tenantMiddleware, uxRateLimiter, inventoryRoutes);

  // ==================== JOB SITES (Service Locations) ====================
  // Job site management (service locations with optional warehouse link)
  app.use("/api/job-sites", requireAuth, tenantMiddleware, uxRateLimiter, jobSitesRoutes);

  // ==================== CLIENT CONTACTS (Master Data) ====================
  // Client contacts management (people within client companies)
  app.use("/api/clients", requireAuth, tenantMiddleware, uxRateLimiter, clientContactsRoutes);

  // ==================== COMERCIAL (Service Lines for Quotes) ====================
  // Commercial bundles and service lines for event proposals
  app.use("/api/comercial", requireAuth, tenantMiddleware, uxRateLimiter, comercialRoutes);

  // ==================== COMPRAS (Phase 4.4) ====================
  // Procurement module (suppliers, purchase orders, receipts, invoices, payments)
  app.use("/api/compras", requireAuth, tenantMiddleware, uxRateLimiter, comprasRoutes);

  // ==================== FINANCEIRO (Phase 4.4) ====================
  // Financial module (invoices, payments, bank reconciliation)
  app.use("/api/financeiro", requireAuth, tenantMiddleware, uxRateLimiter, financeiroRoutes);

  // ==================== ANGARIAÇÃO / LEAD GENERATION (Phase 4.4) ====================
  // Lead generation module (leads, sources, scoring, funnel)
  // Mount on both paths for backward compatibility
  app.use("/api/angariacao", requireAuth, tenantMiddleware, uxRateLimiter, angariacaoRoutes);
  app.use("/api/lead-generation", requireAuth, tenantMiddleware, uxRateLimiter, angariacaoRoutes);

  // ==================== COMPANY (Phase 4.4) ====================
  // Company profile management
  app.use("/api/company", requireAuth, tenantMiddleware, uxRateLimiter, companyRoutes);

  // ==================== CONNECTORS (Phase 4.5) ====================
  // Connector management (OAuth, API integrations)
  // LEGACY: Backward compatibility shim
  app.use("/api/connectors", requireAuth, tenantMiddleware, uxRateLimiter, connectorsRoutes);
  
  // NEW: Tenant-level connector configuration (Admin/AssistBuild only)
  app.use("/api/admin/connectors", requireAuth, tenantMiddleware, uxRateLimiter, adminConnectorsRoutes);
  
  // NEW: User-level connector credentials (self-service Settings)
  app.use("/api/user/connectors", requireAuth, tenantMiddleware, uxRateLimiter, userConnectorsRoutes);
  
  // NEW: Connector data imports (OAuth post-connection import)
  app.use("/api/connector-imports", requireAuth, tenantMiddleware, uxRateLimiter, connectorImportsRoutes);

  // ==================== INTEGRATIONS (Phase 4.5) ====================
  // Integration configuration and management
  app.use("/api/integrations", requireAuth, tenantMiddleware, uxRateLimiter, integrationsRoutes);

  // ==================== COMMUNICATIONS (Phase 4.5) ====================
  // Communication channels (Email, SMS, notifications)
  app.use("/api/communications", requireAuth, tenantMiddleware, uxRateLimiter, communicationsRoutes);

  // ==================== GMAIL OAUTH & ACCOUNTS (Phase 4.5) ====================
  // Gmail OAuth flow and account management
  // Note: Auth middleware applied per-route (callback must be public, authorize requires auth)
  app.use("/api/gmail/oauth", gmailOAuthRoutes);
  app.use("/api/gmail/accounts", requireAuth, tenantMiddleware, uxRateLimiter, gmailAccountsRoutes);
  app.use("/api/gmail/messages", requireAuth, tenantMiddleware, uxRateLimiter, gmailMessagesRoutes);
  
  // ==================== GMAIL SETTINGS (FASE 3) ====================
  // Gmail sync configuration (autoSync, interval, filter period)
  // Permission: owner/admin only for POST/RESET, all authenticated users for GET
  app.use("/api/gmail/settings", requireAuth, tenantMiddleware, uxRateLimiter, gmailSettingsRoutes);

  // ==================== GMAIL ADVANCED FEATURES ====================
  // Email Templates and Auto-Responders
  app.use("/api/gmail/templates", requireAuth, tenantMiddleware, uxRateLimiter, gmailTemplatesRoutes);
  app.use("/api/gmail/auto-responders", requireAuth, tenantMiddleware, uxRateLimiter, gmailAutoRespondersRoutes);

  // ==================== WHATSAPP INTEGRATION ====================
  // WhatsApp webhook (no auth - called by Meta)
  // Note: Auth middleware NOT applied to webhook endpoints for Meta callbacks
  app.use("/api/whatsapp", whatsappRoutes);
  
  // WhatsApp account management (authenticated)
  app.use("/api/whatsapp/accounts", requireAuth, tenantMiddleware, uxRateLimiter, whatsappAccountsRoutes);
  
  // WhatsApp conversations and message management (authenticated)
  app.use("/api/whatsapp", requireAuth, tenantMiddleware, uxRateLimiter, whatsappConversationsRoutes);
  
  // WhatsApp media download/upload with GCS integration (authenticated)
  app.use("/api/whatsapp", requireAuth, tenantMiddleware, uxRateLimiter, whatsappMediaRoutes);
  
  // WhatsApp template management and synchronization (authenticated)
  app.use("/api/whatsapp/templates", requireAuth, tenantMiddleware, uxRateLimiter, whatsappTemplatesRoutes);
  
  // WhatsApp Web connector (user-level, web-connector type)
  app.use("/api/user/whatsapp-web", requireAuth, tenantMiddleware, uxRateLimiter, whatsappWebRoutes);
  
  // WhatsApp automation configuration (authenticated)
  app.use("/api/whatsapp/automation", requireAuth, tenantMiddleware, uxRateLimiter, whatsappAutomationRoutes);

  // ==================== DYNAMIC FORMS - AUTHENTICATED (Phase 4.5) ====================
  // Form management - CRUD, fields, publishing, invitations
  // Full form lifecycle: draft → publish → archive
  app.use("/api/forms", requireAuth, tenantMiddleware, uxRateLimiter, formsRoutes);

  // ==================== DYNAMIC FORMS - PUBLIC (Phase 4.5) ====================
  // Public form submission (NO AUTH REQUIRED - token-based security)
  // Supports form retrieval, submission, tracking, and file uploads
  app.use("/api/public/forms", publicFormsRoutes);

  // ==================== PUBLIC SUPPLIER INVOICE (Phase 4.5) ====================
  // Public supplier invoice submission (NO AUTH REQUIRED - token-based security)
  app.use("/api/public/supplier-invoice", supplierInvoiceRoutes);

  // ==================== ENTITIES (Phase 4.6) ====================
  // Generic entity CRUD system for dynamic modules
  app.use("/api/entities", requireAuth, tenantMiddleware, uxRateLimiter, entitiesRoutes);

  // ==================== CUSTOM TABLES ====================
  // Tenant-scoped custom tables management (dashboard)
  app.use("/api/custom-tables", requireAuth, tenantMiddleware, uxRateLimiter, customTablesRoutes);

  // ==================== HUB (Phase 4.6) ====================
  // Module marketplace and management
  app.use("/api/hub", hubRoutes); // Note: Some endpoints require auth, others don't

  // ==================== MODULE INTERFACE (Phase 4.6) ====================
  // Module interface configuration (sidebar visibility, menu ordering)
  app.use("/api/module-interface", requireAuth, tenantMiddleware, uxRateLimiter, moduleInterfaceRoutes);

  // ==================== MODULES (FASE 2) ====================
  // Module management: catalog, tenant modules, sidebar, preferences
  // Auth and tenant middleware applied inside router for granular control
  app.use("/api/modules", uxRateLimiter, modulesRoutes);
  
  // Module pages: hierarchical page structure for modules
  // Auth and tenant middleware applied inside router
  app.use("/api/module-pages", uxRateLimiter, modulePagesRoutes);

  // ==================== BUDGET/QUOTES (Phase 4.6) ====================
  // Budget and quote management
  app.use("/api/budget-quotes", requireAuth, tenantMiddleware, uxRateLimiter, budgetQuotesRoutes);

  // ==================== DOCUMENT ANALYSIS (Phase 4.6) ====================
  // Document processing with AI (OCR, classification, extraction)
  app.use("/api/document-analysis", requireAuth, tenantMiddleware, uploadRateLimiter, documentAnalysisRoutes);

  // ==================== QUICK INVOICE PROCESS (Temporary Dev Tool) ====================
  // Quick invoice processing endpoint for development/testing
  app.use("/api/quick-invoice-process", requireAuth, tenantMiddleware, uploadRateLimiter, quickInvoiceProcessRoutes);

  // ==================== DOCUMENT MANAGEMENT (Phase 5.1) ====================
  // Document storage, versioning, and provider management
  // Mounts: /api/documents, /api/storage-providers
  // Note: requireAuth and tenantMiddleware already applied in router
  app.use("/api", documentManagementRoutes);

  // ==================== ADMIN (Phase 4.6) ====================
  // Admin functions (requires admin role)
  app.use("/api/admin", requireAuth, adminRoutes); // Note: requireAdmin middleware applied in route file

  // ==================== TEAM (Phase 4.6) ====================
  // Team management (members, roles, activity)
  app.use("/api/team", requireAuth, tenantMiddleware, uxRateLimiter, teamRoutes);
  
  // ==================== ORGANIZATION STRUCTURE ====================
  // Departments and teams hierarchy management
  app.use("/api/org-structure", requireAuth, tenantMiddleware, uxRateLimiter, orgStructureRoutes);
  
  // Invitation management: accept, decline, revoke (public + authenticated)
  app.use("/api/invitations", uxRateLimiter, invitationsRoutes);

  // ==================== IMPORT (Phase 4.6) ====================
  // Data import functionality (CSV/Excel)
  app.use("/api/import", requireAuth, tenantMiddleware, uploadRateLimiter, importRoutes);

  // ==================== ASSISTBUILD CONVERSATIONS (Configuration Studio) ====================
  // Large prominent chat panel for AssistBuild configuration studio
  // Routes: GET/POST/PATCH/DELETE /conversations, POST /conversations/:id/messages
  // Access control: Owner/Configurator only via requireConfigurator middleware
  // IMPORTANT: Must be FIRST to avoid conflicts with other /api/assistbuild routes
  app.use("/api/assistbuild", requireAuth, tenantMiddleware, assistbuildConversationsRoutes);

  // ==================== ASSISTBUILD WORKFLOWS (Phase 1: Visual Workflow Builder) ====================
  // Workflow automation system with visual builder (MVP: 2 nodes)
  // Routes: CRUD /workflows, POST /workflows/:id/execute, GET /executions
  app.use("/api/assistbuild", requireAuth, tenantMiddleware, assistbuildWorkflowsRoutes);

  // ==================== SCHEDULED WORKFLOWS (Invoice Email Demo) ====================
  // Scheduled workflow management for demo: Schedule → Fetch Invoice → Send Email
  // Routes: CRUD /scheduled-workflows, /pause, /resume, /run-now
  app.use("/api/scheduled-workflows", requireAuth, tenantMiddleware, scheduledWorkflowsRoutes);

  // ==================== ASSISTBUILD JOBS (Phase 5) ====================
  // Background job management for AssistBuild operations
  app.use("/api/assistbuild", requireAuth, tenantMiddleware, assistbuildJobsRoutes);
  
  // ==================== ASSISTBUILD APPROVAL WORKFLOW (FASE 4) ====================
  // Code generation approval, rejection, and deployment workflow
  // Routes: POST /code/:id/approve, /code/:id/reject, /code/:id/deploy, GET /code/pending
  app.use("/api/assistbuild", requireAuth, tenantMiddleware, assistbuildRoutes);

  // ==================== ASSISTSETTINGS CONVERSATIONS (User Settings Manager) ====================
  // Large prominent chat panel for user settings management
  // Routes: GET/POST/PATCH/DELETE /conversations, POST /conversations/:id/messages
  // Scope: USER-SCOPED ONLY (profile, preferences, notifications, account)
  app.use("/api/assistsettings", chatRateLimiter, assistsettingsConversationsRoutes);
  
  // ==================== SCHEMA EVOLUTION (Gap #3) ====================
  // Schema evolution operations: snapshot, diff, migrate, rollback
  // Routes: POST /snapshot, /diff, /migrations, /migrations/:id/apply, /rollback
  // GET /migrations, /migrations/:id
  app.use("/api/schema", requireAuth, tenantMiddleware, schemaRoutes);
  
  // ==================== PLATFORM SERVICES ====================
  // Financial Grid: Centralized budgeting, forecasting, and financial planning
  app.use("/api/financial-grid", financialGridRoutes);
  
  // Universal Search: Cross-module semantic and textual search
  app.use("/api/universal-search", universalSearchRoutes);
  
  // ==================== ROLLBACK SYSTEM (GAP #6) ====================
  // Rollback point management and execution
  // Routes: GET /history, /points/:id, /executions/:id
  //         POST /create-snapshot, /execute
  //         DELETE /points/:id
  app.use("/api/rollback", rollbackRoutes);
  
  // ==================== EXECUTIONS (Phase 8) ====================
  // Execution Engine monitoring - automations, workflows, agents
  app.use("/api/executions", requireAuth, tenantMiddleware, uxRateLimiter, executionsRoutes);
  
  // ==================== ACTIONS (Phase 9.1) ====================
  // User action tracking for pattern detection and AI learning
  app.use("/api/actions", requireAuth, tenantMiddleware, uxRateLimiter, actionsRoutes);
  
  // ==================== PATTERNS (Phase 9.3) ====================
  // Pattern suggestions and workflow automation
  app.use("/api/patterns", requireAuth, tenantMiddleware, uxRateLimiter, patternsRoutes);
  
  // ==================== PROJECTS MODULE ====================
  // Cross-module linking, project templates, and configuration
  // Routes: GET/POST /entities, /linkable-entities, /records, /templates
  app.use("/api/modules/projects", requireAuth, tenantMiddleware, uxRateLimiter, projetosRoutes);
  
  // ==================== CACHE METRICS ====================
  // Cache performance monitoring for platform resources (NO AUTH for internal monitoring)
  app.use("/api/cache", cacheMetricsRoutes);
  
  console.log('[Routes] ✅ All routes registered - Phases 4.1 to 9.3 COMPLETE');
  console.log('[Routes] ✅ Phase 4.1: Auth, tenants, users, permissions, context');
  console.log('[Routes] ✅ Phase 4.2: Uploads, files, secrets, environment, notifications');
  console.log('[Routes] ✅ Phase 4.3: Conversations, onboarding, realtime, studio (v2 + minimal)');
  console.log('[Routes] ✅ Phase 4.4: Dashboard, analytics, tasks, commercial, inventory, company');
  console.log('[Routes] ✅ Phase 4.5: Connectors, integrations, communications, public-forms');
  console.log('[Routes] ✅ Phase 4.6: Entities, hub, module-interface, budget-quotes, document-analysis, admin, team, import');
  console.log('[Routes] ✅ Phase 5.0: AssistBuild background jobs (create, status, cancel, stream)');
  console.log('[Routes] ✅ FASE 4.0: AssistBuild approval workflow (approve, reject, deploy, pending)');
  console.log('[Routes] ✅ Phase 8.0: Execution Engine monitoring (automations, workflows, agents, stats)');
  console.log('[Routes] ✅ Phase 9.1: Action tracking system (user action logging, pattern detection)');
  console.log('[Routes] ✅ Phase 9.3: Pattern suggestions API (detect, dismiss, create workflow)');
  console.log('[Routes] ✅ Gap #3: Schema Evolution System (snapshot, diff, migrate, apply, rollback)');
  console.log('[Routes] ⚠️  OAuth routes quarantined - awaiting tenant-storage migration');
  console.log('[Routes] ⚠️  Many routes have stub implementations - services need migration in future phases');
}
// Sync test - Mon Nov 17 12:08:43 AM UTC 2025
