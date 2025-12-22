# AssistOS - Intelligent Enterprise ERP Replacement

## Overview

AssistOS is an intelligent, event-driven enterprise platform designed to replace traditional ERP systems with an AI-first architecture. It centers around three pillars: AssistME (operational assistant), AssistBuild (conversational feature creator), and a Self-Evolving Platform (modular base that learns cross-tenant patterns). The project aims to provide an AI-powered ERP replacement that addresses critical gaps in core protection, code generation, schema evolution, pattern recognition, sandbox validation, resource quotas, and a robust rollback system, targeting significant market potential by offering a flexible, AI-driven alternative to rigid legacy ERP systems.

## User Preferences

- **Language**: Portuguese (documentation and UI)
- **Delivery**: Complete vision with HYBRID approach (confirmed)
- **Timeline**: 12 weeks total = Week 3-5 MVP Core (3 weeks) + Week 6-12 Expansion (6 weeks)
- **Migration approach**: Preserve ~1.5MB legacy code, adapt imports only
- **Critical requirement**: All 7 gaps must be closed
- **UI Design**: Collaborative screen-by-screen rebuild preserving original "feeling" (navy dark theme, conversational focus)
- **Development Velocity**: Replit Agent achieving 2-3x speedup vs. traditional teams (2.5 tools/day observed)
- **Task Management**: Prefers direct implementation over verbose task lists

## System Architecture

The project uses a monorepo structure with `apps/api` (Express-based Node.js 20 server) and `apps/worker` (BullMQ-based background job processor). It features three isolated chat systems: AssistME (operational), AssistBuild (configuration studio), and AssistSettings (user settings manager).

**UI/UX Decisions:**
The frontend uses React 18, TypeScript, Wouter, TanStack Query, Radix UI, and Tailwind CSS, featuring a navy dark theme (`#0A1628`) with a blue accent (`#3B82F6`), a full-screen hero with chat, futuristic effects, and a conversational focus. It includes an authenticated app with a Shadcn Sidebar, real-time SSE streaming, mobile responsiveness, and PWA capabilities. Internationalization (i18n) supports Portuguese (PT) and English (EN).

**Technical Implementations:**

- **Database:** Drizzle ORM with PostgreSQL.
- **AI Architecture:** Unified OpenAI System (AssistME and AssistBuild both using GPT-5) utilizing 75+ AI tools with OpenAI Function Calling format.
- **Streaming:** Production-ready SSE with TokenStreamOptimizer and ProgressTracker.
- **Modularity:** `IModule` interface managed by `ModuleConfigurationManager`.
- **Authentication:** Passport.js (Local + Google OAuth) with session management and multi-tenancy.
- **Memory & Storage:** `pgvector` for RAG, in-memory caching, Google Cloud Storage, OpenAI for embeddings.
- **Security:** AES-256-GCM encryption, strict tenant isolation (`hardTenantGuard`, `softTenantContext`).
- **Document Analysis:** Google Document AI (primary) and OpenAI Vision (fallback) for Portuguese fiscal documents.
- **WhatsApp Integration:** Multi-tenant, multi-user communication via WhatsApp Business API.
- **Conversation Management:** Tag-based organization, AI-powered title generation, and full CRUD endpoints.
- **API Restructure:** Modular hub-and-spoke architecture for Finance and other modules.
- **CRM Contract Submissions:** Complete OCR upload flow with Google Document AI, human-in-the-loop validation, and tenant-isolated storage.
- **Projects Module:** Universal cross-module linking system with `LinkResolverService` and `customFieldLinks` table, integrated with AssistBuild for conversational configuration.
- **Logistics Module:** End-to-end inventory management with specialized AssistBuild tools for configuration and AssistME tools for operations.
- **Angariação (Lead Generation) Module:** Complete campaign management system with UTM tracking, ad campaign CRUD, frontend dashboard with ROI analytics, Excel/CSV import system (UI + AI tool), and 4 AssistME AI tools.

**Feature Specifications (Key Gaps):**

- **Core Protection System:** Anti-regression for platform assets.
- **Code Generation & Validation:** AI-powered code generation with multi-stage validation, automatic rollback, rate limiting, and tier-aware resource quotas.
- **Schema Evolution:** Versioned migrations via BullMQ, audit trails, SQL hash tracking, environment isolation, and rollback.
- **Pattern Recognition:** Cross-tenant learning with privacy guarantees and anonymization (Sandbox MVP).
- **Resource Quotas:** Tier-based enforcement for 6 resource types.
- **Rollback System:** System-wide recovery with comprehensive snapshot creation and environment-scoped execution (Synchronous MVP).
- **Sandbox Isolation:** Environment isolation for testing with schema reconciliation, snapshot-based promotion, and strict table allowlisting (Synchronous MVP).
- **Configurable Modules:** Conversational configuration and dynamic entity creation.
- **AI-First Procurement (ComprasModule):** AI-driven quick purchase flows and invoice OCR.
- **Document Management (Gestão Documental):** Centralized system with AI/OCR classification and granular RBAC.
- **Gmail OAuth:** Multi-tenant, multi-user integration.
- **Connector Management UI:** UI for 6 external integrations.
- **Dynamic Forms Service:** Customizable form builder with AI-powered field mapping.
- **Notification Center:** Multi-channel routing with user preferences.
- **Module Lifecycle Hooks:** Automatic page creation on module activation.

## External Dependencies

- **Database:** PostgreSQL (Supabase)
- **AI Models:** OpenAI GPT-5, OpenAI (embeddings)
- **Job Queue:** BullMQ + ioredis
- **Cloud Storage:** Google Cloud Storage
- **Authentication:** Google OAuth
- **Email Service:** Nodemailer (SMTP)
- **OCR:** pdf-parse
- **Templates:** Handlebars
- **External Integrations (Connectors):**
  1.  Google Document AI
  2.  TOC Online (OAuth 2.0 - Portuguese accounting platform)
  3.  Moloni
  4.  SAP Business One
  5.  Primavera ERP
  6.  SIBS Open Banking

## TOC Online Integration (Phase 4.5)

- **Authentication:** OAuth 2.0 Authorization Code Grant
- **Endpoints:**
  - `/api/oauth/toc-online/authorize` - Initiates OAuth flow (requires auth)
  - `/api/oauth/toc-online/callback/` - Handles OAuth callback (public, state-based CSRF protection)
  - `/api/oauth/toc-online/refresh` - Refreshes access token
  - `/api/oauth/toc-online/status` - Gets connection status
- **Connector:** `packages/connectors/toc-online/index.ts` - Full OAuth 2.0 implementation
- **Routes:** `apps/api/routes/oauth-toc-online.ts`
- **Security:** State parameter for CSRF protection, tenant-isolated token storage, 10-minute state TTL
- **Capabilities:** Invoicing (send, list), Customers (list, get), Products (list, get), Tax (list), Payments (list)
- **Configuration:** Stored in `tenant_connector_configs` table with encrypted credentials

## Recent Changes (December 2025)

### Database Configuration Fix

- **SUPABASE_DATABASE_URL**: Added priority variable to avoid Replit's automatic DATABASE_URL injection
- **Environment Variable Priority**: `SUPABASE_DATABASE_URL || DATABASE_URL` in all db.ts files
- **Production Deployment**: Fixed deployment timeout issue by using correct Supabase connection

### Invoice Direction Detection (AR vs AP)

- **Automatic Detection**: `analyze_document` tool now automatically determines if an invoice is:
  - **Issued (AR)**: Company is the issuer → Accounts Receivable
  - **Received (AP)**: Company is the recipient → Accounts Payable
- **NIF Matching**: Compares extracted issuerNIF/recipientNIF with company NIF from `company_info` table
- **Name Fallback**: Uses fuzzy name matching when NIFs don't match
- **Suggested Action**: Provides clear guidance in Portuguese on how to register the invoice

### Invoice Environment Fix

- **Environment Field**: `create_invoice` tool now includes `environment` field (sandbox/production)
- **Visibility Fix**: Invoices created via chat now appear correctly in tenant views
