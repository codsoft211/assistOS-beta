# Secrets Inventory & Compliance Matrix

**Document Version:** 1.0.0  
**Last Updated:** November 10, 2025  
**Owner:** Platform Team  
**Classification:** CONFIDENTIAL - Internal Use Only

---

## Executive Summary

This document provides a comprehensive inventory of all production secrets used in the AssistOS platform, including compliance mappings to GDPR and NIST 800-53 controls, rotation requirements, blast radius analysis, and operational dependencies.

**Production Timeline:** Alpha go-live in 7 days (10 tenants)  
**Compliance Requirements:** GDPR (EU data residency), NIST 800-53 baseline  
**Availability Target:** 24/7 with <5 minutes RTO

---

## Secret Families

### Summary Table

| Secret Family | Owner | Storage | Rotation Frequency | Compliance | Blast Radius | Dependencies |
|---------------|-------|---------|-------------------|------------|--------------|--------------|
| DATABASE_URL | Platform Team | Replit Secrets | 60 days (manual) | GDPR Art. 32, NIST AC-2, NIST IA-5 | **CRITICAL** | All services, BullMQ persistence |
| REDIS_URL | Platform Team | Replit Secrets | 60 days (manual) | GDPR Art. 32, NIST AC-2, NIST IA-5 | **CRITICAL** | BullMQ queues, sessions, multi-tenancy isolation |
| SESSION_SECRET | Platform Team | Replit Secrets | 90 days* (manual) | GDPR Art. 32, NIST IA-5 | **CRITICAL** | Session signing, Passport.js authentication |
| OPENAI_API_KEY | Backend Team | Replit Secrets | 90 days (manual) | GDPR Art. 25 | **HIGH** | AssistME orchestrator, embeddings |
| ANTHROPIC_API_KEY | Backend Team | Replit Secrets | 90 days (manual) | GDPR Art. 25 | **HIGH** | AssistBuild orchestrator (Claude 3.5 Sonnet) |
| GOOGLE_APPLICATION_CREDENTIALS | Backend Team | Replit Secrets | 90 days (manual) | GDPR Art. 25 | **HIGH** | Document AI, Cloud Storage |
| WHATSAPP_ACCESS_TOKEN | Backend Team | Replit Secrets | 60 days (auto-rotation) | GDPR Art. 25 | Medium | WhatsApp Cloud API connector |
| WHATSAPP_APP_SECRET | Backend Team | Replit Secrets | 90 days (manual) | GDPR Art. 25 | Medium | WhatsApp webhook verification |
| WHATSAPP_VERIFY_TOKEN | Backend Team | Replit Secrets | 90 days (manual) | GDPR Art. 25 | Medium | WhatsApp webhook validation |
| WHATSAPP_BUSINESS_ACCOUNT_ID | Backend Team | Replit Secrets | N/A (identifier) | GDPR Art. 25 | Medium | Multi-tenant WhatsApp routing |
| WHATSAPP_PHONE_NUMBER_ID | Backend Team | Replit Secrets | N/A (identifier) | GDPR Art. 25 | Medium | WhatsApp phone number identification |
| GOOGLE_CLIENT_ID | Backend Team | Replit Secrets | 180 days | GDPR Art. 32 | Medium | Gmail OAuth, Google Auth |
| GOOGLE_CLIENT_SECRET | Backend Team | Replit Secrets | 180 days | GDPR Art. 32 | Medium | Gmail OAuth, Google Auth |
| GOOGLE_REDIRECT_URI | Backend Team | Replit Secrets | N/A (config) | GDPR Art. 32 | Low | OAuth callback URL configuration |
| GOOGLE_CLOUD_PROJECT_ID | Backend Team | Replit Secrets | N/A (identifier) | GDPR Art. 25 | Medium | GCP project identification (general) |
| GCS_BUCKET_NAME | Backend Team | Replit Secrets | N/A (identifier) | GDPR Art. 25 | Medium | Cloud Storage bucket identification |
| GCS_PROJECT_ID | Backend Team | Replit Secrets | N/A (identifier) | GDPR Art. 25 | Medium | GCP project identification |
| GOOGLE_DOCUMENT_AI_PROCESSOR_ID | Backend Team | Replit Secrets | N/A (identifier) | GDPR Art. 25 | Medium | Document AI processor identification |
| GOOGLE_DOCUMENT_AI_LOCATION | Backend Team | Environment | N/A (config) | GDPR Art. 25 | Low | Document AI region (EU compliance) |
| SMTP_USER | Backend Team | Replit Secrets | 90 days (manual) | NIST IA-5 | Low | Email notifications (Nodemailer) |
| SMTP_PASSWORD | Backend Team | Replit Secrets | 90 days (manual) | NIST IA-5 | Low | Email notifications (Nodemailer) |
| SMTP_HOST | Backend Team | Environment | N/A (config) | NIST IA-5 | Low | SMTP server configuration |
| SMTP_PORT | Backend Team | Environment | N/A (config) | NIST IA-5 | Low | SMTP port configuration |
| SENTRY_DSN | Platform Team | Replit Secrets | 365 days | NIST AU-2 | Low | Error tracking, monitoring |
| SESSION_COOKIE_DOMAIN | Platform Team | Environment | N/A (config) | GDPR Art. 32 | Low | Session cookie domain configuration |
| NODE_ENV | Platform Team | Environment | N/A (config) | NIST CM-3 | N/A | Environment identifier (development/production) |
| PORT | Platform Team | Environment | N/A (config) | NIST CM-3 | N/A | Application port configuration |
| ENABLE_CRON_JOBS | Platform Team | Environment | N/A (config) | NIST CM-3 | N/A | Cron job enablement flag |
| COMMIT_SHA | Platform Team | Environment (auto) | N/A | NIST CM-3 | N/A | Sentry release tracking, deployment metadata |
| SERVICE_NAME | Platform Team | Environment | N/A | NIST CM-3 | N/A | Sentry release tagging, service identification |
| APP_VERSION | Platform Team | Environment | N/A | NIST CM-3 | N/A | Sentry release versioning |

**Note:** \* SESSION_SECRET rotated every 90 days (instead of 60-day CRITICAL tier standard) to reduce user impact - session rotation invalidates all existing user sessions. Longer interval mitigates frequent user logouts while maintaining strong security posture. See `docs/secrets-rotation-policy.md` Section 2.2 for detailed justification.

---

## Detailed Secret Profiles

### 1. DATABASE_URL (Neon PostgreSQL)

**Owner:** Platform Team  
**Storage:** Replit Secrets (production), `.env` (development)  
**Format:** `postgresql://user:password@ep-xxx.eu-central-1.aws.neon.tech/assistos_prod?sslmode=require`

**Rotation Requirement:**
- **Frequency:** 60 days (infrastructure credential best practice)
- **Compliance:** GDPR Article 32 (security measures), NIST 800-53 AC-2 (account management), NIST 800-53 IA-5 (authenticator rotation)
- **Automation:** Neon supports password rotation via API/CLI

**Blast Radius:** **CRITICAL**
- **Impact if compromised:**
  - Complete data breach (all tenant data, user PII, financial records)
  - Regulatory violations (GDPR Article 33 breach notification required within 72 hours)
  - Business continuity failure (zero database access)
- **Affected Services:**
  - API service (all endpoints)
  - Worker service (all BullMQ jobs)
  - Cron jobs (backup monitoring, queue monitoring)

**Dependencies:**
- Drizzle ORM connection pool (apps/api, apps/worker)
- BullMQ persistence (job metadata, queue state)
- Health endpoints (/api/health/*)
- All CRUD operations

**Rotation Procedure:** See `docs/secrets-rotation-policy.md` (Section 3.1: Database Credentials)

**Rollback Plan:**
- Neon maintains connection pool for 5 minutes after password change
- Zero-downtime rotation via dual-credential pattern
- Rollback: Revert to previous password via Neon Console

---

### 2. REDIS_URL (Upstash Redis)

**Owner:** Platform Team  
**Storage:** Replit Secrets (production), `.env` (development)  
**Format:** `rediss://:password@host:port`

**Rotation Requirement:**
- **Frequency:** 60 days (infrastructure credential best practice)
- **Compliance:** GDPR Article 32 (security measures), NIST 800-53 AC-2 (account management), NIST 800-53 IA-5 (authenticator rotation)
- **Automation:** Upstash supports password rotation via API

**Blast Radius:** **CRITICAL**
- **Impact if compromised:**
  - Multi-tenancy isolation breach (cross-tenant data leakage)
  - Session hijacking (all user sessions)
  - Job queue manipulation (malicious job injection)
  - Cache poisoning (data integrity compromise)
- **Affected Services:**
  - BullMQ workers (all 7 queues + DLQ)
  - Session management (Passport.js sessions)
  - Multi-tenancy isolation (tenant-aware Redis keys)
  - In-memory caching layer

**Dependencies:**
- BullMQ connection (apps/worker/queues/*)
- Session store (apps/api/config/session.ts)
- Tenant isolation (apps/api/middleware/tenant.middleware.ts)
- Health endpoints (Redis latency monitoring)

**Rotation Procedure:** See `docs/secrets-rotation-policy.md` (Section 3.2: Redis Credentials)

**Rollback Plan:**
- Upstash supports dual-password mode during rotation
- Zero-downtime rotation via connection pool failover
- Rollback: Revert to previous password via Upstash Console

---

### 3. SESSION_SECRET (Session Signing Key)

**Owner:** Platform Team  
**Storage:** Replit Secrets (production), `.env` (development)  
**Format:** Random base64 string (32+ bytes), generated via `openssl rand -base64 32`

**Rotation Requirement:**
- **Frequency:** 90 days (manual rotation recommended)
- **Compliance:** GDPR Article 32 (security measures), NIST 800-53 IA-5 (authenticator management)
- **Automation:** Manual generation + deployment (requires service restart)

**Blast Radius:** **CRITICAL**
- **Impact if compromised:**
  - Session hijacking (all active user sessions)
  - Authentication bypass (session forgery attacks)
  - Multi-tenant data access (cross-tenant session attacks)
  - GDPR breach (unauthorized access to PII via forged sessions)
  - Regulatory violations (GDPR Article 33 breach notification required within 72 hours)
- **Affected Services:**
  - API service (Passport.js authentication)
  - Session management (all authenticated endpoints)
  - Multi-tenancy isolation (tenant-scoped sessions)
  - OAuth flows (Google OAuth, Gmail integration)

**Dependencies:**
- apps/api/config/session.ts (express-session configuration)
- Passport.js authentication strategies (local, Google OAuth)
- Multi-tenant session middleware
- All authenticated API endpoints
- OAuth callback handlers

**Rotation Procedure:** See `docs/secrets-rotation-policy.md` (Section 3.3: Session Credentials)

**Rollback Plan:**
- **WARNING:** Session secret rotation invalidates ALL active sessions
- Users must re-authenticate after rotation
- Manual rollback (update environment variable to previous secret)
- Requires API service restart (all services using sessions)
- RTO: <5 minutes (critical system restart)
- Communication: Notify users of planned maintenance window

---

### 4. SENTRY_DSN (Error Tracking)

**Owner:** Platform Team  
**Storage:** Replit Secrets (production), `.env` (development)  
**Format:** `https://public_key@sentry_host/project_id`

**Rotation Requirement:**
- **Frequency:** 365 days (low-risk rotation)
- **Compliance:** NIST 800-53 AU-2 (auditable events), AU-6 (audit review)
- **Automation:** Sentry supports DSN regeneration via API

**Blast Radius:** Low
- **Impact if compromised:**
  - Error data leakage (stack traces, breadcrumbs may contain PII)
  - False alerts injection (DoS on monitoring system)
  - No direct access to production systems
- **Affected Services:**
  - Error tracking and monitoring
  - Alert routing (Slack, PagerDuty integrations)
  - Performance monitoring (tracing, profiling)

**Dependencies:**
- apps/api/sentry.ts (API service initialization)
- apps/worker/sentry.ts (Worker service initialization)
- Error handlers across all services
- Health check failure reporting

**Rotation Procedure:** See `docs/secrets-rotation-policy.md` (Section 3.3: Monitoring Credentials)

**Rollback Plan:**
- Sentry maintains old DSN for 24 hours after regeneration
- Zero-downtime rotation (old DSN continues working)
- Rollback: Use previous DSN from backup configuration

---

### 4. OPENAI_API_KEY (AI Orchestrators)

**Owner:** Backend Team  
**Storage:** Replit Secrets (production), `.env` (development)  
**Format:** `sk-proj-...` (project-scoped key)

**Rotation Requirement:**
- **Frequency:** 90 days (manual rotation recommended)
- **Compliance:** GDPR Article 25 (data protection by design), NIST 800-53 SC-13 (cryptographic protection)
- **Automation:** OpenAI supports API key rotation via Dashboard

**Blast Radius:** **HIGH**
- **Impact if compromised:**
  - Unauthorized API usage (cost impact $$$)
  - Data exfiltration (prompt injection attacks)
  - Rate limit exhaustion (service degradation)
  - Model access abuse (reputation damage)
- **Affected Services:**
  - AssistME Orchestrator (GPT-5 operational tasks)
  - Embeddings service (OpenAI embeddings for RAG)
  - Conversation title generation

**Dependencies:**
- packages/ai/agents/assistme/orchestrator.ts
- apps/api/services/embedding.service.ts
- packages/platform/services/conversation-title-generator.ts
- AI tool execution framework

**Rotation Procedure:** See `docs/secrets-rotation-policy.md` (Section 3.4: AI Service Credentials - OpenAI)

**Rollback Plan:**
- OpenAI maintains old keys for 24 hours after rotation
- Zero-downtime rotation (create new key before revoking old)
- Rollback: Use previous key from backup configuration

---

### 5. ANTHROPIC_API_KEY (AssistBuild Orchestrator)

**Owner:** Backend Team  
**Storage:** Replit Secrets (production), `.env` (development)  
**Format:** `sk-ant-...` (Anthropic API key)

**Rotation Requirement:**
- **Frequency:** 90 days (manual rotation recommended)
- **Compliance:** GDPR Article 25 (data protection by design), NIST 800-53 SC-13 (cryptographic protection)
- **Automation:** Anthropic supports API key rotation via Console

**Blast Radius:** **HIGH**
- **Impact if compromised:**
  - Unauthorized API usage (cost impact $$$)
  - Data exfiltration (prompt injection attacks via AssistBuild)
  - Code generation abuse (malicious code injection)
  - Rate limit exhaustion (AssistBuild service degradation)
  - Platform configuration manipulation (schema evolution, module creation)
- **Affected Services:**
  - AssistBuild Orchestrator (Claude 3.5 Sonnet for platform configuration)
  - Code generation system
  - Schema evolution system
  - Module configuration system
  - AI-powered feature creation

**Dependencies:**
- packages/ai/agents/assistbuild/orchestrator.ts
- apps/api/services/code-generation.service.ts
- apps/api/services/schema-evolution.service.ts
- apps/api/services/module.service.ts
- AI tool execution framework (AssistBuild-specific tools)

**Rotation Procedure:** See `docs/secrets-rotation-policy.md` (Section 3.4: AI Service Credentials - Anthropic)

**Rollback Plan:**
- Anthropic maintains old keys for 24 hours after rotation
- Zero-downtime rotation (create new key before revoking old)
- Rollback: Use previous key from backup configuration

---

### 6. GOOGLE_APPLICATION_CREDENTIALS (Service Account)

**Owner:** Backend Team  
**Storage:** Replit Secrets (production - JSON file path), `.env` (development)  
**Format:** Path to JSON keyfile (`/path/to/service-account-key.json`)

**Rotation Requirement:**
- **Frequency:** 90 days (manual rotation recommended)
- **Compliance:** GDPR Article 25 (data protection by design), NIST 800-53 IA-5 (authenticator management)
- **Automation:** Google Cloud supports service account key rotation via API

**Blast Radius:** **HIGH**
- **Impact if compromised:**
  - Unauthorized GCP resource access (Document AI, Cloud Storage)
  - Data exfiltration (Cloud Storage buckets)
  - Service account impersonation (privilege escalation)
  - API quota exhaustion (service degradation)
- **Affected Services:**
  - Google Document AI (invoice OCR, document analysis)
  - Google Cloud Storage (file uploads, document storage)
  - Gmail OAuth integration (if using GCP)

**Dependencies:**
- packages/connectors/google-document-ai/index.ts
- apps/api/services/storage.service.ts

**Rotation Procedure:** See `docs/secrets-rotation-policy.md` (Section 3.5: GCP Service Account Keys)

**Rollback Plan:**
- GCP allows multiple active keys per service account (max 10)
- Zero-downtime rotation (create new key before deleting old)
- Rollback: Use previous key from backup keyfile

---

### 6a. GCP Configuration Identifiers (GCS Bucket, Project ID, Document AI)

**Owner:** Backend Team  
**Storage:** Replit Secrets (production), `.env` (development)  
**Format:** GCP resource identifiers and configuration values

**Secrets Included:**
1. **GCS_BUCKET_NAME:** Cloud Storage bucket name (e.g., `assistos-prod-eu-storage`)
2. **GCS_PROJECT_ID:** GCP project identifier (e.g., `assistos-prod-12345`)
3. **GOOGLE_DOCUMENT_AI_PROCESSOR_ID:** Document AI processor identifier
4. **GOOGLE_DOCUMENT_AI_LOCATION:** Document AI region (e.g., `eu` for GDPR compliance)

**Rotation Requirement:**
- **Frequency:** N/A (static configuration identifiers, do not rotate)
- **Compliance:** GDPR Article 25 (data protection by design - EU region requirement)
- **Automation:** N/A (manual configuration updates only)

**Blast Radius:** Medium
- **Impact if compromised:**
  - **GCS_BUCKET_NAME:** Unauthorized bucket access attempts (mitigated by IAM)
  - **GCS_PROJECT_ID:** Project reconnaissance (no direct access without service account key)
  - **DOCUMENT_AI_PROCESSOR_ID:** Processor identification for targeted attacks (mitigated by IAM)
  - **DOCUMENT_AI_LOCATION:** Regional configuration exposure (low impact)
  - No direct data access without GOOGLE_APPLICATION_CREDENTIALS
- **Affected Services:**
  - Google Cloud Storage (file uploads, document storage)
  - Google Document AI (invoice OCR, document analysis)
  - GCP resource identification

**Dependencies:**
- apps/api/services/storage.service.ts (GCS_BUCKET_NAME, GCS_PROJECT_ID)
- packages/connectors/google-document-ai/index.ts (GOOGLE_DOCUMENT_AI_PROCESSOR_ID, GOOGLE_DOCUMENT_AI_LOCATION)

**Rotation Procedure:** 
- **No rotation required** (static identifiers)
- **Configuration updates:**
  - GCS_BUCKET_NAME: Update if migrating to new bucket
  - GCS_PROJECT_ID: Update if migrating to new GCP project
  - DOCUMENT_AI_PROCESSOR_ID: Update if switching processor
  - DOCUMENT_AI_LOCATION: Update if changing region (requires processor migration)

**Rollback Plan:**
- **Configuration correction:**
  - Update environment variables to correct values
  - Restart API/Worker services to reload configuration
  - RTO: <10 minutes
  - No data migration required for identifier correction
- **Bucket/project migration rollback:**
  - Restore previous GCS_BUCKET_NAME/GCS_PROJECT_ID
  - Verify GOOGLE_APPLICATION_CREDENTIALS points to correct project
  - Test Cloud Storage and Document AI connectivity

**GDPR Compliance Note:**
- **GOOGLE_DOCUMENT_AI_LOCATION must be set to `eu`** for GDPR compliance
- Document processing must occur in EU region (Frankfurt, eu-central-1)
- Changing to non-EU region requires Data Protection Impact Assessment (DPIA)

---

### 7. WHATSAPP_ACCESS_TOKEN (Cloud API)

**Owner:** Backend Team  
**Storage:** Replit Secrets (production), `.env` (development)  
**Format:** Bearer token from Meta Developer Portal

**Rotation Requirement:**
- **Frequency:** 60 days (auto-rotation supported via Meta API)
- **Compliance:** GDPR Article 25 (data protection by design), NIST 800-53 IA-5 (authenticator management)
- **Automation:** Meta supports access token refresh via OAuth flow

**Blast Radius:** Medium
- **Impact if compromised:**
  - Unauthorized WhatsApp message sending (compliance violations)
  - User impersonation (reputational damage)
  - Rate limit exhaustion (service degradation)
  - Phone number verification bypass
- **Affected Services:**
  - WhatsApp Cloud API connector
  - Multi-tenant WhatsApp integration
  - Notification routing service

**Dependencies:**
- apps/api/services/whatsapp-api.service.ts
- apps/api/routes/whatsapp.ts
- packages/platform/notification-center/index.ts (WhatsApp channel)

**Rotation Procedure:** See `docs/secrets-rotation-policy.md` (Section 3.6: WhatsApp Credentials)

**Rollback Plan:**
- Meta maintains old token for 24 hours after refresh
- Zero-downtime rotation (OAuth refresh flow)
- Rollback: Use previous token from backup configuration

---

### 7. WHATSAPP_APP_SECRET (Webhook Verification)

**Owner:** Backend Team  
**Storage:** Replit Secrets (production), `.env` (development)  
**Format:** String from Meta Developer Portal

**Rotation Requirement:**
- **Frequency:** 90 days (manual rotation recommended)
- **Compliance:** GDPR Article 25 (data protection by design), NIST 800-53 IA-5 (authenticator management)
- **Automation:** Manual rotation via Meta Developer Portal

**Blast Radius:** Medium
- **Impact if compromised:**
  - Webhook verification bypass (malicious webhook injection)
  - Message tampering (data integrity compromise)
  - Service impersonation (reputation damage)
- **Affected Services:**
  - WhatsApp webhook verification
  - WhatsApp message receipt validation

**Dependencies:**
- apps/api/routes/whatsapp.ts
- Webhook signature validation middleware

**Rotation Procedure:** See `docs/secrets-rotation-policy.md` (Section 3.6: WhatsApp Credentials)

**Rollback Plan:**
- Manual rollback via Meta Developer Portal
- Update environment variables to previous secret
- Restart API service to reload configuration

---

### 8. WhatsApp Identifiers (VERIFY_TOKEN, BUSINESS_ACCOUNT_ID, PHONE_NUMBER_ID)

**Owner:** Backend Team  
**Storage:** Replit Secrets (production), `.env` (development)  
**Format:** Identifiers and tokens from Meta Developer Portal

**Secrets Included:**
1. **WHATSAPP_VERIFY_TOKEN:** Webhook verification token (custom string)
2. **WHATSAPP_BUSINESS_ACCOUNT_ID:** WhatsApp Business Account identifier
3. **WHATSAPP_PHONE_NUMBER_ID:** Phone number identifier for multi-tenant routing

**Rotation Requirement:**
- **VERIFY_TOKEN Frequency:** 90 days (manual rotation recommended)
- **BUSINESS_ACCOUNT_ID/PHONE_NUMBER_ID:** N/A (static identifiers, do not rotate)
- **Compliance:** GDPR Article 25 (data protection by design), NIST 800-53 IA-5 (authenticator management)
- **Automation:** VERIFY_TOKEN manual rotation via Meta Developer Portal

**Blast Radius:** Medium
- **Impact if compromised:**
  - **VERIFY_TOKEN:** Webhook verification bypass (malicious webhook injection)
  - **BUSINESS_ACCOUNT_ID:** Multi-tenant routing confusion (message misrouting)
  - **PHONE_NUMBER_ID:** Phone number impersonation (message sender spoofing)
  - Service impersonation (reputation damage)
  - Data integrity compromise (tampered messages)
- **Affected Services:**
  - WhatsApp webhook validation
  - Multi-tenant WhatsApp message routing
  - Phone number identification system
  - WhatsApp Cloud API connector

**Dependencies:**
- apps/api/routes/whatsapp.ts
- apps/api/services/whatsapp-api.service.ts
- apps/api/services/whatsapp-message-classifier.service.ts
- Webhook signature validation middleware
- Multi-tenant routing logic

**Rotation Procedure:** 
- **VERIFY_TOKEN:** See `docs/secrets-rotation-policy.md` (Section 3.6: WhatsApp Credentials)
- **BUSINESS_ACCOUNT_ID/PHONE_NUMBER_ID:** No rotation (static identifiers)

**Rollback Plan:**
- **VERIFY_TOKEN:**
  - Manual rollback via Meta Developer Portal
  - Update environment variable to previous token
  - Restart API service to reload configuration
  - RTO: <15 minutes
- **BUSINESS_ACCOUNT_ID/PHONE_NUMBER_ID:**
  - No rollback (static identifiers)
  - Update environment variables if correcting misconfiguration
  - Restart API service to reload configuration

---

### 9. GOOGLE_CLIENT_ID, CLIENT_SECRET & REDIRECT_URI (Gmail OAuth)

**Owner:** Backend Team  
**Storage:** Replit Secrets (production), `.env` (development)  
**Format:** Client ID (public), Client Secret (confidential), Redirect URI (callback URL)

**Rotation Requirement:**
- **Frequency:** 180 days (OAuth best practice)
- **Compliance:** GDPR Article 32 (security measures), NIST 800-53 IA-5 (authenticator management)
- **Automation:** Manual rotation via Google Cloud Console

**Secrets Included:**
1. **GOOGLE_CLIENT_ID:** OAuth 2.0 client identifier (public)
2. **GOOGLE_CLIENT_SECRET:** OAuth 2.0 client secret (confidential)
3. **GOOGLE_REDIRECT_URI:** OAuth callback URL (e.g., `http://localhost:5000/api/auth/google/callback`)

**Blast Radius:** Medium
- **Impact if compromised:**
  - OAuth flow hijacking (user account access)
  - Gmail inbox access (PII breach)
  - Service impersonation (phishing attacks)
  - Rate limit exhaustion (service degradation)
- **Affected Services:**
  - Gmail OAuth integration (multi-tenant, multi-user)
  - Google authentication flow
  - Email sync connectors
  - Google login authentication

**Dependencies:**
- apps/api/config/passport.ts (Google OAuth strategy)
- apps/api/routes/auth.ts (OAuth callback handlers)
- apps/api/services/gmail-threads.service.ts
- apps/api/services/gmail-settings.service.ts
- apps/api/services/cron/gmail-sync.service.ts

**Rotation Procedure:** See `docs/secrets-rotation-policy.md` (Section 3.7: OAuth Credentials)

**Rollback Plan:**
- Google allows multiple OAuth client credentials per project
- Zero-downtime rotation (create new credentials before revoking old)
- Rollback: Use previous client ID/secret from backup configuration

---

### 9. SMTP Configuration (Email Notifications)

**Owner:** Backend Team  
**Storage:** Replit Secrets (production - credentials), Environment (production - config), `.env` (development)  
**Format:** SMTP credentials + server configuration

**Secrets Included:**
1. **SMTP_USER:** Email account username (e.g., `noreply@assistos.com`)
2. **SMTP_PASSWORD:** App password or SMTP authentication password
3. **SMTP_HOST:** SMTP server hostname (e.g., `smtp.gmail.com`)
4. **SMTP_PORT:** SMTP server port (e.g., `587` for STARTTLS)

**Rotation Requirement:**
- **SMTP_USER/SMTP_PASSWORD Frequency:** 90 days (manual rotation recommended)
- **SMTP_HOST/SMTP_PORT:** N/A (static configuration, do not rotate)
- **Compliance:** NIST 800-53 IA-5 (authenticator management)
- **Automation:** Manual rotation via SMTP provider (credentials only)

**Blast Radius:** Low
- **Impact if compromised:**
  - **SMTP_USER/SMTP_PASSWORD:** Spam/phishing email sending (reputation damage)
  - **SMTP_HOST/SMTP_PORT:** Server reconnaissance (low impact, public configuration)
  - Rate limit exhaustion (service degradation)
  - No direct access to production systems
- **Affected Services:**
  - Email notification system (Nodemailer)
  - Password reset emails
  - Alert notifications
  - Notification center (email channel)

**Dependencies:**
- packages/platform/services/EmailService.ts
- packages/platform/notification-center/index.ts (email channel)
- Nodemailer transport configuration

**Rotation Procedure:** 
- **SMTP_USER/SMTP_PASSWORD:** See `docs/secrets-rotation-policy.md` (Section 3.8: SMTP Credentials)
- **SMTP_HOST/SMTP_PORT:** No rotation (static configuration)
  - Update only if migrating to new SMTP provider
  - Verify SPF/DKIM records after SMTP server change

**Rollback Plan:**
- **SMTP_USER/SMTP_PASSWORD:**
  - Manual rollback via SMTP provider
  - Update environment variables to previous credentials
  - Restart API service to reload configuration
  - RTO: <15 minutes
- **SMTP_HOST/SMTP_PORT:**
  - Update environment variables to previous server configuration
  - Restart API service to reload configuration
  - Verify email sending functionality via health check

**Configuration Note:**
- **SMTP_PORT 587 recommended** (STARTTLS for secure connection)
- **Alternative ports:** 465 (SSL/TLS), 25 (unencrypted, not recommended)
- **SPF/DKIM records required** for email deliverability

---

### 10. Environment Configuration (Platform Settings)

**Owner:** Platform Team  
**Storage:** Environment variables (manual configuration)  
**Rotation:** N/A (static configuration)

**Configuration Variables:**
1. **SESSION_COOKIE_DOMAIN:** Cookie domain for session management (e.g., `.assistos.com`)
2. **NODE_ENV:** Environment identifier (`development`, `staging`, `production`)
3. **PORT:** Application HTTP port (default: `5000`)
4. **ENABLE_CRON_JOBS:** Cron job enablement flag (`true`/`false`)

**Purpose:** Platform runtime configuration, session management, cron job control

**Compliance:** GDPR Article 32 (security measures - SESSION_COOKIE_DOMAIN), NIST 800-53 CM-3 (configuration management)

**Blast Radius:** Low
- **Impact if misconfigured:**
  - **SESSION_COOKIE_DOMAIN:** Session cookie isolation issues (cross-domain session leakage)
  - **NODE_ENV:** Incorrect error handling, debug mode exposure in production
  - **PORT:** Application binding conflicts, service unavailability
  - **ENABLE_CRON_JOBS:** Duplicate cron job execution (if enabled on multiple instances)
  - No direct security compromise from exposure

**Dependencies:**
- apps/api/index.ts (express-session configuration, port binding)
- apps/worker/scheduler.ts (cron job control)
- Session management middleware
- Health check endpoints

**Configuration Note:**
- **SESSION_COOKIE_DOMAIN:** Set to `.assistos.com` for production multi-subdomain support
- **NODE_ENV:** Must be set to `production` in production environments
- **PORT:** Default `5000`, must match frontend proxy configuration
- **ENABLE_CRON_JOBS:** Should only be `true` on ONE instance to prevent duplicate execution

---

### 11. Environment Metadata (Non-Secret)

**Owner:** Platform Team  
**Storage:** Environment variables (auto-populated by deployment)  
**Rotation:** N/A (deployment-managed)

**Metadata Variables:**
- `COMMIT_SHA`: Git commit hash for deployment tracking
- `SERVICE_NAME`: Service identifier (api, worker)
- `APP_VERSION`: Semantic version or 'dev'

**Purpose:** Sentry release tracking, deployment metadata, service identification

**Compliance:** NIST 800-53 CM-3 (configuration change control)

**Blast Radius:** N/A (public metadata, no security impact)

---

## Compliance Mapping

### GDPR Requirements

| Article | Requirement | Affected Secrets | Controls |
|---------|------------|------------------|----------|
| **Article 25** | Data protection by design | OPENAI_API_KEY, GOOGLE_APPLICATION_CREDENTIALS, WHATSAPP_* | Encryption at rest, API key rotation, service account least privilege |
| **Article 32** | Security of processing | DATABASE_URL, REDIS_URL, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET | Strong authentication, credential rotation, access logging |
| **Article 33** | Breach notification | All secrets | 72-hour breach notification if secret compromised |

### NIST 800-53 Controls

| Control | Family | Requirement | Affected Secrets | Implementation |
|---------|--------|------------|------------------|----------------|
| **AC-2** | Access Control | Account management | DATABASE_URL, REDIS_URL | Role-based access, credential rotation, audit logging |
| **AU-2** | Audit and Accountability | Auditable events | SENTRY_DSN | Error tracking, alert routing, compliance logging |
| **AU-6** | Audit and Accountability | Audit review | SENTRY_DSN | Weekly audit review, anomaly detection |
| **CM-3** | Configuration Management | Configuration change control | COMMIT_SHA, SERVICE_NAME, APP_VERSION | Deployment tracking, release versioning |
| **IA-5** | Identification and Authentication | Authenticator management | All secrets | Credential rotation, dual-control approvals, secure storage |
| **SC-13** | System and Communications Protection | Cryptographic protection | OPENAI_API_KEY, GOOGLE_APPLICATION_CREDENTIALS | TLS in transit, encryption at rest, key rotation |

---

## Risk Assessment

### Critical-Risk Secrets (Immediate Impact)
1. **DATABASE_URL** - Complete data breach, regulatory violations
2. **REDIS_URL** - Multi-tenancy isolation breach, session hijacking

**Mitigation:**
- 90-day mandatory rotation
- Dual-control approval required
- Real-time monitoring (health endpoints)
- Sentry alerts for unauthorized access

### High-Risk Secrets (Significant Impact)
1. **OPENAI_API_KEY** - Unauthorized API usage, cost impact
2. **GOOGLE_APPLICATION_CREDENTIALS** - GCP resource access, data exfiltration

**Mitigation:**
- 90-day mandatory rotation
- API usage monitoring (cost alerts)
- Service account least privilege
- Sentry alerts for quota exhaustion

### Medium-Risk Secrets (Moderate Impact)
1. **WHATSAPP_ACCESS_TOKEN** - Message sending abuse
2. **WHATSAPP_APP_SECRET** - Webhook verification bypass
3. **GOOGLE_CLIENT_ID/SECRET** - OAuth flow hijacking

**Mitigation:**
- 60-180 day rotation schedule
- Rate limiting enforcement
- Webhook signature validation
- OAuth consent screen verification

### Low-Risk Secrets (Limited Impact)
1. **SENTRY_DSN** - Error data leakage
2. **SMTP_USER/PASSWORD** - Spam/phishing email sending

**Mitigation:**
- 90-365 day rotation schedule
- Access logging
- Rate limiting
- SPF/DKIM email authentication

---

## Operational Dependencies

### Service Dependency Matrix

| Service | Critical Secrets | High-Risk Secrets | Startup Failure if Missing |
|---------|------------------|-------------------|---------------------------|
| **API Service** | DATABASE_URL, REDIS_URL | OPENAI_API_KEY, GOOGLE_APPLICATION_CREDENTIALS | ✅ Yes |
| **Worker Service** | DATABASE_URL, REDIS_URL | OPENAI_API_KEY, GOOGLE_APPLICATION_CREDENTIALS | ✅ Yes |
| **Cron Jobs** | DATABASE_URL, REDIS_URL | SENTRY_DSN | ✅ Yes |
| **Health Endpoints** | DATABASE_URL, REDIS_URL | SENTRY_DSN | ✅ Yes |
| **WhatsApp Connector** | DATABASE_URL, REDIS_URL | WHATSAPP_ACCESS_TOKEN, WHATSAPP_APP_SECRET | ⚠️ Partial |
| **Gmail Connector** | DATABASE_URL, REDIS_URL | GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET | ⚠️ Partial |
| **Email Service** | DATABASE_URL | SMTP_USER, SMTP_PASSWORD | ⚠️ Partial |

### Rotation Coordination Requirements

**Zero-Downtime Rotation:**
- **DATABASE_URL, REDIS_URL:** Requires dual-credential pattern (5-minute overlap)
- **OPENAI_API_KEY, GOOGLE_APPLICATION_CREDENTIALS:** Requires pre-provisioning (create new before revoking old)
- **WHATSAPP_ACCESS_TOKEN:** Supports OAuth refresh flow (24-hour overlap)
- **Other secrets:** Manual rotation with service restart coordination

**Rollback Time Objectives:**
- **Critical secrets (DB, Redis):** <5 minutes RTO
- **High-risk secrets (AI, GCP):** <15 minutes RTO
- **Medium/low-risk secrets:** <30 minutes RTO

---

## Next Steps

1. **Platform Lead Review:** Schedule secrets inventory review with Platform Team lead
2. **Security Sign-Off:** Submit compliance matrix to Security Team for approval
3. **Rotation Policy:** Create `docs/secrets-rotation-policy.md` with detailed procedures (day6-8-2)
4. **Automation Scripts:** Design zero-downtime rotation workflows (day6-8-3)
5. **Tabletop Drill:** Schedule rotation drill with Platform/Backend teams (day6-8-4)

---

## Document Control

**Review Schedule:** Quarterly (January, April, July, October)  
**Approvers:** Platform Team Lead, Security Team Lead, Backend Team Lead  
**Change Log:**
- 2025-11-10: Initial inventory and compliance mapping (v1.0.0)
