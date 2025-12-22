# Secrets Rotation Policy & Schedule

**Document Version:** 1.0  
**Last Updated:** 2025-11-10  
**Owner:** Platform Team + Security Team  
**Compliance:** GDPR Articles 25/32, NIST 800-53 IA-5/AC-2/SC-13

---

## 1. Overview

### 1.1 Purpose
This document defines the rotation schedule, approval workflows, notification channels, and operational procedures for all production secrets and credentials in AssistOS. It aligns with the compliance requirements documented in `docs/secrets-inventory.md` and ensures zero-downtime credential rotation to minimize security exposure.

### 1.2 Scope
This policy covers all 31 production secrets and configuration items documented in the secrets inventory, organized into the following families:
- **Database Credentials** (DATABASE_URL)
- **Cache & Queue Credentials** (REDIS_URL)
- **Session Security** (SESSION_SECRET, SESSION_COOKIE_DOMAIN)
- **AI API Keys** (OPENAI_API_KEY, ANTHROPIC_API_KEY)
- **GCP Service Accounts** (GOOGLE_APPLICATION_CREDENTIALS)
- **GCP Configuration** (GCS_BUCKET_NAME, GCS_PROJECT_ID, GOOGLE_DOCUMENT_AI_PROCESSOR_ID, GOOGLE_DOCUMENT_AI_LOCATION, GOOGLE_CLOUD_PROJECT_ID)
- **WhatsApp Cloud API** (WHATSAPP_ACCESS_TOKEN, WHATSAPP_APP_SECRET, WHATSAPP_VERIFY_TOKEN, WHATSAPP_BUSINESS_ACCOUNT_ID, WHATSAPP_PHONE_NUMBER_ID)
- **OAuth Credentials** (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI)
- **SMTP Configuration** (SMTP_USER, SMTP_PASSWORD, SMTP_HOST, SMTP_PORT)
- **Monitoring & Observability** (SENTRY_DSN)
- **Environment Configuration** (NODE_ENV, PORT, ENABLE_CRON_JOBS)
- **Environment Metadata** (COMMIT_SHA, SERVICE_NAME, APP_VERSION)

### 1.3 Compliance Alignment
This rotation policy implements the security controls required by:
- **GDPR Article 25:** Data protection by design and default (encrypted credentials, minimal exposure)
- **GDPR Article 32:** Security of processing (regular rotation, access controls)
- **NIST 800-53 IA-5:** Authenticator management (rotation schedules, dual-control)
- **NIST 800-53 SC-13:** Cryptographic protection (secure key generation, storage)
- **NIST 800-53 AC-2:** Account management (lifecycle tracking, audit trails)

### 1.4 Rotation Objectives
- **Minimize credential exposure:** Regular rotation limits the window of opportunity for compromised credentials
- **Zero-downtime deployment:** Staged credential issuance prevents service interruptions
- **Audit trail compliance:** All rotations logged to Sentry with dual-control approvals
- **Emergency response capability:** Documented emergency rotation procedures for security incidents

---

## 2. Rotation Schedule Matrix

### 2.1 Rotation Frequency by Risk Tier

| Risk Tier | Rotation Frequency | Lead Time | Dual-Control Required | Secret Families |
|-----------|-------------------|-----------|----------------------|-----------------|
| **CRITICAL** | 60 days | 7 days | Yes (Platform + Security) | Database, Cache/Queue, Session |
| **HIGH** | 90 days | 10 days | Yes (Backend + Security) | AI API Keys, GCP Service Account |
| **MEDIUM** | 180 days | 14 days | Yes (Backend + Backend) | WhatsApp API, OAuth |
| **LOW** | 365 days | 30 days | No (Backend Team) | SMTP, Monitoring |
| **STATIC** | Never (manual only) | N/A | Yes (Platform Lead) | GCP Config, Environment Config |

### 2.2 Complete Secret Rotation Schedule

| Secret/Config Item | Risk Tier | Rotation Frequency | Next Rotation Due | Owner | Dual-Control |
|-------------------|-----------|-------------------|------------------|-------|--------------|
| **DATABASE_URL** | CRITICAL | 60 days | 2026-01-10 | Platform Team | Platform + Security |
| **REDIS_URL** | CRITICAL | 60 days | 2026-01-10 | Platform Team | Platform + Security |
| **SESSION_SECRET** | CRITICAL | 90 days | 2026-02-10 | Platform Team | Platform + Security |
| **OPENAI_API_KEY** | HIGH | 90 days | 2026-02-10 | Backend Team | Backend + Security |
| **ANTHROPIC_API_KEY** | HIGH | 90 days | 2026-02-10 | Backend Team | Backend + Security |
| **GOOGLE_APPLICATION_CREDENTIALS** | HIGH | 90 days | 2026-02-10 | Backend Team | Backend + Security |
| **WHATSAPP_ACCESS_TOKEN** | MEDIUM | 90 days (Meta recommended) | 2026-02-10 | Backend Team | Backend + Backend |
| **WHATSAPP_APP_SECRET** | MEDIUM | 90 days (Meta recommended) | 2026-02-10 | Backend Team | Backend + Backend |
| **WHATSAPP_VERIFY_TOKEN** | MEDIUM | 90 days | 2026-02-10 | Backend Team | Backend + Backend |
| **GOOGLE_CLIENT_ID** | MEDIUM | 180 days | 2026-05-10 | Backend Team | Backend + Backend |
| **GOOGLE_CLIENT_SECRET** | MEDIUM | 180 days | 2026-05-10 | Backend Team | Backend + Backend |
| **GOOGLE_REDIRECT_URI** | LOW | Manual (no rotation) | N/A | Backend Team | Backend Lead |
| **SMTP_USER** | LOW | 90 days | 2026-02-10 | Backend Team | Backend Lead |
| **SMTP_PASSWORD** | LOW | 90 days | 2026-02-10 | Backend Team | Backend Lead |
| **SENTRY_DSN** | LOW | 365 days | 2026-11-10 | Platform Team | Platform Lead |
| **GCS_BUCKET_NAME** | STATIC | Manual only | N/A | Platform Team | Platform Lead |
| **GCS_PROJECT_ID** | STATIC | Manual only | N/A | Platform Team | Platform Lead |
| **GOOGLE_DOCUMENT_AI_PROCESSOR_ID** | STATIC | Manual only | N/A | Backend Team | Backend Lead |
| **GOOGLE_DOCUMENT_AI_LOCATION** | STATIC | Manual only | N/A | Backend Team | Backend Lead |
| **GOOGLE_CLOUD_PROJECT_ID** | STATIC | Manual only | N/A | Platform Team | Platform Lead |
| **WHATSAPP_BUSINESS_ACCOUNT_ID** | STATIC | Manual only | N/A | Backend Team | Backend Lead |
| **WHATSAPP_PHONE_NUMBER_ID** | STATIC | Manual only | N/A | Backend Team | Backend Lead |
| **SESSION_COOKIE_DOMAIN** | STATIC | Manual only | N/A | Platform Team | Platform Lead |
| **SMTP_HOST** | STATIC | Manual only | N/A | Backend Team | Backend Lead |
| **SMTP_PORT** | STATIC | Manual only | N/A | Backend Team | Backend Lead |
| **NODE_ENV** | STATIC | Manual only | N/A | Platform Team | Platform Lead |
| **PORT** | STATIC | Manual only | N/A | Platform Team | Platform Lead |
| **ENABLE_CRON_JOBS** | STATIC | Manual only | N/A | Platform Team | Platform Lead |
| **COMMIT_SHA** | METADATA | Auto-generated | N/A | CI/CD Pipeline | N/A |
| **SERVICE_NAME** | METADATA | Auto-generated | N/A | CI/CD Pipeline | N/A |
| **APP_VERSION** | METADATA | Auto-generated | N/A | CI/CD Pipeline | N/A |

**Notes:**
- **WhatsApp API Tokens (ACCESS_TOKEN, APP_SECRET, VERIFY_TOKEN):** Classified as MEDIUM risk but rotated every 90 days per Meta's recommended security best practices (deviation from standard MEDIUM=180 days). This aligns with WhatsApp Business API security guidelines and minimizes exposure for multi-tenant messaging infrastructure.
- **SMTP Credentials (SMTP_USER, SMTP_PASSWORD):** Classified as LOW risk but rotated every 90 days to align with industry standards for email authentication (deviation from standard LOW=365 days). This frequency balances security with operational overhead for email delivery systems.
- **SESSION_SECRET:** Classified as CRITICAL but rotated every 90 days (instead of 60 days) to reduce user impact (session invalidation). Longer interval mitigates frequent user logouts while maintaining strong security posture. See `docs/secrets-inventory.md` Section 3 for detailed compliance mapping and blast radius analysis.

---

## 3. Secret Families & Rotation Procedures

### 3.1 Database Credentials (DATABASE_URL)

**Risk Tier:** CRITICAL  
**Rotation Frequency:** 60 days  
**Lead Time:** 7 days  
**Dual-Control:** Platform Team + Security Team

#### Rotation Procedure
1. **Day -7:** Platform Lead creates rotation ticket in project management system
2. **Day -7:** Notification sent to Platform Team + Security Team via Slack (#alerts-security)
3. **Day -5:** Security Team reviews and approves rotation (dual-control checkpoint #1)
4. **Day -3:** Platform Team generates new Neon database credentials via Neon Console
5. **Day -1:** Staging deployment with new credentials (canary validation)
6. **Day 0 (Rotation Day):**
   - 09:00 UTC: Deploy new DATABASE_URL to production API + Worker (Replit Secrets)
   - 09:05 UTC: Monitor health endpoints (`/api/health/readyz`) for database connectivity
   - 09:10 UTC: Verify database connection pool metrics via Sentry
   - 09:15 UTC: Platform Lead confirms successful rotation (dual-control checkpoint #2)
   - 09:30 UTC: Revoke old database credentials in Neon Console
7. **Day +1:** Post-rotation verification (query performance, connection pool health)
8. **Day +7:** Rotation audit log review (Sentry + project management system)

#### Rollback Procedure
- **Trigger:** Database connectivity failures detected by `/api/health/readyz`
- **RTO:** < 5 minutes
- **Steps:**
  1. Immediately revert DATABASE_URL to previous credentials (Replit Secrets)
  2. Restart API + Worker services (`kubectl rollout restart` or equivalent)
  3. Verify health endpoint status
  4. Notify Platform Team + Security Team via Slack
  5. Investigate root cause before reattempting rotation

#### Notification Channels
- **Primary:** Slack #alerts-security (automated via Sentry integration)
- **Secondary:** Email to platform-team@company.com + security-team@company.com
- **Escalation:** PagerDuty alert if rotation fails (critical severity)

---

### 3.2 Cache & Queue Credentials (REDIS_URL)

**Risk Tier:** CRITICAL  
**Rotation Frequency:** 60 days  
**Lead Time:** 7 days  
**Dual-Control:** Platform Team + Security Team

#### Rotation Procedure
1. **Day -7:** Platform Lead creates rotation ticket
2. **Day -7:** Notification sent to Platform Team + Security Team via Slack (#alerts-security)
3. **Day -5:** Security Team reviews and approves rotation (dual-control checkpoint #1)
4. **Day -3:** Platform Team generates new Redis credentials via Redis provider (Upstash/Redis Cloud)
5. **Day -1:** Staging deployment with new credentials (canary validation - verify BullMQ queue connectivity)
6. **Day 0 (Rotation Day):**
   - 09:00 UTC: Deploy new REDIS_URL to production API + Worker (Replit Secrets)
   - 09:02 UTC: Monitor Redis health probe (`/api/health/readyz`) for latency (p75/p95 <50ms)
   - 09:05 UTC: Verify BullMQ queue connectivity (7 queues: migration, connector-sync, code-generation, schema-migration, pattern-learning, whatsapp-send, gmail-sync)
   - 09:10 UTC: Check queue depth metrics via `/api/health/detailed` (no backlog spikes)
   - 09:15 UTC: Platform Lead confirms successful rotation (dual-control checkpoint #2)
   - 09:30 UTC: Revoke old Redis credentials
7. **Day +1:** Post-rotation verification (queue throughput, cache hit rates)
8. **Day +7:** Rotation audit log review

#### Rollback Procedure
- **Trigger:** Redis connectivity failures or p95 latency ≥200ms
- **RTO:** < 5 minutes
- **Steps:**
  1. Immediately revert REDIS_URL to previous credentials (Replit Secrets)
  2. Restart API + Worker services
  3. Verify queue connectivity (7 queues + DLQ)
  4. Monitor queue depth metrics (should stabilize within 10 minutes)
  5. Notify Platform Team + Security Team

#### Notification Channels
- **Primary:** Slack #alerts-security
- **Secondary:** Email to platform-team@company.com + security-team@company.com
- **Escalation:** PagerDuty alert if rotation fails

---

### 3.3 Session Security (SESSION_SECRET)

**Risk Tier:** CRITICAL  
**Rotation Frequency:** 90 days  
**Lead Time:** 7 days  
**Dual-Control:** Platform Team + Security Team

#### Rotation Procedure
1. **Day -7:** Platform Lead creates rotation ticket
2. **Day -7:** Notification sent to Platform Team + Security Team via Slack (#alerts-security)
3. **Day -5:** Security Team reviews and approves rotation (dual-control checkpoint #1)
4. **Day -3:** Platform Team generates new 256-bit session secret using cryptographically secure random generator
   ```bash
   openssl rand -hex 32
   ```
5. **Day -1:** Staging deployment with new SESSION_SECRET (verify session creation + validation)
6. **Day 0 (Rotation Day):**
   - **IMPORTANT:** Session rotation INVALIDATES all existing user sessions
   - 09:00 UTC: Notify all users 30 minutes in advance (in-app banner + email)
   - 09:30 UTC: Deploy new SESSION_SECRET to production API (Replit Secrets)
   - 09:32 UTC: Monitor authentication endpoint (`/api/auth/login`) for login spikes
   - 09:35 UTC: Verify session creation (check express-session middleware logs)
   - 09:40 UTC: Platform Lead confirms successful rotation (dual-control checkpoint #2)
   - 09:45 UTC: Monitor Sentry for authentication errors (expected spike, should normalize within 1 hour)
7. **Day +1:** Post-rotation verification (session persistence, no abnormal logout rates)
8. **Day +7:** Rotation audit log review

#### Rollback Procedure
- **Trigger:** Authentication failures >10% of login attempts
- **RTO:** < 10 minutes
- **Steps:**
  1. Immediately revert SESSION_SECRET to previous value (Replit Secrets)
  2. Restart API service
  3. Verify authentication endpoint health
  4. Notify users of temporary login issues (in-app banner)
  5. Notify Platform Team + Security Team

#### User Impact Notice
- **Impact:** All users will be logged out and required to re-authenticate
- **Communication:** 30-minute advance notice via in-app banner + email
- **Timing:** Schedule during low-traffic hours (09:00-10:00 UTC recommended)

#### Notification Channels
- **Primary:** Slack #alerts-security
- **Secondary:** Email to platform-team@company.com + security-team@company.com
- **User Notification:** In-app banner + email to all active users (30-minute lead time)
- **Escalation:** PagerDuty alert if rotation fails

---

### 3.4 AI API Keys (OPENAI_API_KEY)

**Risk Tier:** HIGH  
**Rotation Frequency:** 90 days  
**Lead Time:** 10 days  
**Dual-Control:** Backend Team + Security Team

#### Rotation Procedure
1. **Day -10:** Backend Lead creates rotation ticket
2. **Day -10:** Notification sent to Backend Team + Security Team via Slack (#ai-infrastructure)
3. **Day -7:** Security Team reviews and approves rotation (dual-control checkpoint #1)
4. **Day -5:** Backend Team creates new OpenAI API key via OpenAI Platform Console
5. **Day -3:** Staging deployment with new OPENAI_API_KEY (test AssistME orchestrator functionality)
6. **Day -1:** Canary validation (run sample AI workflows: chat completion, embedding generation)
7. **Day 0 (Rotation Day):**
   - 10:00 UTC: Deploy new OPENAI_API_KEY to production API + Worker (Replit Secrets)
   - 10:05 UTC: Monitor AssistME orchestrator health (verify chat completions succeed)
   - 10:10 UTC: Verify embedding service connectivity (apps/api/services/embedding.service.ts)
   - 10:15 UTC: Check Sentry for OpenAI API errors (should be zero)
   - 10:20 UTC: Backend Lead confirms successful rotation (dual-control checkpoint #2)
   - 10:30 UTC: Revoke old OpenAI API key via OpenAI Platform Console
8. **Day +1:** Post-rotation verification (API quota usage, latency metrics)
9. **Day +7:** Rotation audit log review

#### Rollback Procedure
- **Trigger:** OpenAI API errors >5% of requests
- **RTO:** < 10 minutes
- **Steps:**
  1. Immediately revert OPENAI_API_KEY to previous value (Replit Secrets)
  2. Restart API + Worker services
  3. Verify AssistME orchestrator health
  4. Monitor embedding service connectivity
  5. Notify Backend Team + Security Team

#### Dependencies
- **AssistME Orchestrator:** packages/ai/agents/assistme/orchestrator.ts
- **Embedding Service:** apps/api/services/embedding.service.ts
- **Affected Features:** AI chat, semantic search, document analysis

#### Notification Channels
- **Primary:** Slack #ai-infrastructure
- **Secondary:** Email to backend-team@company.com + security-team@company.com
- **Escalation:** PagerDuty alert if rotation fails (high severity)

---

### 3.5 AI API Keys (ANTHROPIC_API_KEY)

**Risk Tier:** HIGH  
**Rotation Frequency:** 90 days  
**Lead Time:** 10 days  
**Dual-Control:** Backend Team + Security Team

#### Rotation Procedure
1. **Day -10:** Backend Lead creates rotation ticket
2. **Day -10:** Notification sent to Backend Team + Security Team via Slack (#ai-infrastructure)
3. **Day -7:** Security Team reviews and approves rotation (dual-control checkpoint #1)
4. **Day -5:** Backend Team creates new Anthropic API key via Anthropic Console
5. **Day -3:** Staging deployment with new ANTHROPIC_API_KEY (test AssistBuild orchestrator functionality)
6. **Day -1:** Canary validation (run sample workflows: code generation, schema evolution)
7. **Day 0 (Rotation Day):**
   - 10:00 UTC: Deploy new ANTHROPIC_API_KEY to production API + Worker (Replit Secrets)
   - 10:05 UTC: Monitor AssistBuild orchestrator health (verify Claude API connectivity)
   - 10:10 UTC: Test code generation service (create sample tenant configuration)
   - 10:15 UTC: Check Sentry for Anthropic API errors (should be zero)
   - 10:20 UTC: Backend Lead confirms successful rotation (dual-control checkpoint #2)
   - 10:30 UTC: Revoke old Anthropic API key via Anthropic Console
8. **Day +1:** Post-rotation verification (API quota usage, code generation metrics)
9. **Day +7:** Rotation audit log review

#### Rollback Procedure
- **Trigger:** Anthropic API errors >5% of requests or code generation failures
- **RTO:** < 10 minutes
- **Steps:**
  1. Immediately revert ANTHROPIC_API_KEY to previous value (Replit Secrets)
  2. Restart API + Worker services
  3. Verify AssistBuild orchestrator health
  4. Test code generation service
  5. Notify Backend Team + Security Team

#### Dependencies
- **AssistBuild Orchestrator:** packages/ai/agents/assistbuild/orchestrator.ts
- **Code Generation Service:** apps/api/services/code-generation.service.ts
- **Schema Evolution Service:** apps/api/services/schema-evolution.service.ts
- **Affected Features:** Conversational platform configuration, code generation, schema migrations

#### Notification Channels
- **Primary:** Slack #ai-infrastructure
- **Secondary:** Email to backend-team@company.com + security-team@company.com
- **Escalation:** PagerDuty alert if rotation fails (high severity)

---

### 3.6 GCP Service Account Keys (GOOGLE_APPLICATION_CREDENTIALS)

**Risk Tier:** HIGH  
**Rotation Frequency:** 90 days  
**Lead Time:** 10 days  
**Dual-Control:** Backend Team + Security Team

#### Rotation Procedure
1. **Day -10:** Backend Lead creates rotation ticket
2. **Day -10:** Notification sent to Backend Team + Security Team via Slack (#gcp-infrastructure)
3. **Day -7:** Security Team reviews and approves rotation (dual-control checkpoint #1)
4. **Day -5:** Backend Team creates new GCP service account key via Google Cloud Console
   - Project: GOOGLE_CLOUD_PROJECT_ID
   - Service Account: assistos-production@{project-id}.iam.gserviceaccount.com
   - Key Type: JSON
5. **Day -3:** Upload new keyfile to Replit Secrets as `/etc/secrets/gcp-service-account-new.json`
6. **Day -1:** Staging deployment with new GOOGLE_APPLICATION_CREDENTIALS path (test Document AI + Cloud Storage)
7. **Day 0 (Rotation Day):**
   - 11:00 UTC: Deploy new GOOGLE_APPLICATION_CREDENTIALS path to production API + Worker (Replit Secrets)
   - 11:05 UTC: Monitor Document AI service health (test invoice OCR processing)
   - 11:10 UTC: Verify Cloud Storage connectivity (test file upload/download)
   - 11:15 UTC: Check Sentry for GCP API errors (should be zero)
   - 11:20 UTC: Backend Lead confirms successful rotation (dual-control checkpoint #2)
   - 11:30 UTC: Delete old service account key via Google Cloud Console
8. **Day +1:** Post-rotation verification (Document AI usage, Cloud Storage metrics)
9. **Day +7:** Rotation audit log review

#### Rollback Procedure
- **Trigger:** GCP API errors >5% of requests or Document AI processing failures
- **RTO:** < 15 minutes
- **Steps:**
  1. Immediately revert GOOGLE_APPLICATION_CREDENTIALS to previous keyfile path (Replit Secrets)
  2. Restart API + Worker services
  3. Verify Document AI service health
  4. Test Cloud Storage connectivity
  5. Notify Backend Team + Security Team

#### Dependencies
- **Document AI Service:** packages/connectors/google-document-ai/index.ts
- **Cloud Storage Service:** apps/api/services/storage.service.ts
- **Document AI Processor:** apps/worker/processors/google-document-ai-invoice.ts
- **Affected Features:** Invoice OCR, document classification, file storage

#### Notification Channels
- **Primary:** Slack #gcp-infrastructure
- **Secondary:** Email to backend-team@company.com + security-team@company.com
- **Escalation:** PagerDuty alert if rotation fails

---

### 3.7 WhatsApp Cloud API Tokens (WHATSAPP_ACCESS_TOKEN)

**Risk Tier:** MEDIUM  
**Rotation Frequency:** 90 days (Meta recommended)  
**Lead Time:** 14 days  
**Dual-Control:** Backend Team + Backend Team (peer review)

#### Rotation Procedure
1. **Day -14:** Backend Lead creates rotation ticket
2. **Day -14:** Notification sent to Backend Team via Slack (#integrations-whatsapp)
3. **Day -10:** Backend peer reviewer approves rotation (dual-control checkpoint #1)
4. **Day -7:** Backend Team generates new WhatsApp access token via Meta Developer Portal
5. **Day -3:** Staging deployment with new WHATSAPP_ACCESS_TOKEN (test webhook + message sending)
6. **Day -1:** Canary validation (send test messages to sandbox numbers)
7. **Day 0 (Rotation Day):**
   - 12:00 UTC: Deploy new WHATSAPP_ACCESS_TOKEN to production API + Worker (Replit Secrets)
   - 12:05 UTC: Monitor WhatsApp service health (verify webhook receiving events)
   - 12:10 UTC: Test message sending (send test message to internal number)
   - 12:15 UTC: Check Sentry for WhatsApp API errors (should be zero)
   - 12:20 UTC: Backend Lead confirms successful rotation (dual-control checkpoint #2)
   - 12:30 UTC: Revoke old WhatsApp access token via Meta Developer Portal
8. **Day +1:** Post-rotation verification (webhook delivery rate, message sending success rate)
9. **Day +7:** Rotation audit log review

#### Rollback Procedure
- **Trigger:** WhatsApp API errors >10% of requests or webhook delivery failures
- **RTO:** < 15 minutes
- **Steps:**
  1. Immediately revert WHATSAPP_ACCESS_TOKEN to previous value (Replit Secrets)
  2. Restart API + Worker services
  3. Verify webhook connectivity
  4. Test message sending
  5. Notify Backend Team

#### Dependencies
- **WhatsApp Service:** apps/api/services/whatsapp-api.service.ts
- **WhatsApp Routes:** apps/api/routes/whatsapp.ts
- **WhatsApp Worker:** apps/worker/processors/whatsapp-send.ts
- **Affected Features:** WhatsApp messaging, webhook events, multi-tenant communication

#### Notification Channels
- **Primary:** Slack #integrations-whatsapp
- **Secondary:** Email to backend-team@company.com
- **Escalation:** Slack mention @backend-lead if rotation fails

---

### 3.8 SMTP Credentials (SMTP_USER, SMTP_PASSWORD)

**Risk Tier:** LOW  
**Rotation Frequency:** 90 days  
**Lead Time:** 30 days  
**Dual-Control:** Backend Lead approval only

#### Rotation Procedure
1. **Day -30:** Backend Team creates rotation ticket
2. **Day -30:** Notification sent to Backend Team via Slack (#platform-notifications)
3. **Day -20:** Backend Lead reviews and approves rotation
4. **Day -14:** Backend Team generates new SMTP app password via SMTP provider (Gmail/SendGrid)
5. **Day -7:** Staging deployment with new SMTP credentials (test email sending)
6. **Day -3:** Canary validation (send test emails to internal addresses)
7. **Day 0 (Rotation Day):**
   - 13:00 UTC: Deploy new SMTP_USER and SMTP_PASSWORD to production API (Replit Secrets)
   - 13:05 UTC: Monitor email service health (send test email)
   - 13:10 UTC: Verify email deliverability (check spam folder + inbox)
   - 13:15 UTC: Backend Lead confirms successful rotation
   - 13:30 UTC: Revoke old SMTP app password
8. **Day +1:** Post-rotation verification (email delivery rate, bounce rate)
9. **Day +7:** Rotation audit log review

#### Rollback Procedure
- **Trigger:** Email delivery failures >20% of attempts
- **RTO:** < 20 minutes
- **Steps:**
  1. Revert SMTP_USER and SMTP_PASSWORD to previous values (Replit Secrets)
  2. Restart API service
  3. Test email sending
  4. Verify deliverability
  5. Notify Backend Team

#### Dependencies
- **Email Service:** packages/platform/services/EmailService.ts
- **Notification Center:** apps/api/services/notification-center.service.ts
- **Affected Features:** Password reset emails, alert notifications, user communication

#### Notification Channels
- **Primary:** Slack #platform-notifications
- **Secondary:** Email to backend-team@company.com

---

### 3.9 OAuth Credentials (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI)

**Risk Tier:** MEDIUM  
**Rotation Frequency:** 180 days (CLIENT_ID, CLIENT_SECRET), Manual (REDIRECT_URI)  
**Lead Time:** 14 days  
**Dual-Control:** Backend Team + Backend Team (peer review)

#### Rotation Procedure
1. **Day -14:** Backend Lead creates rotation ticket
2. **Day -14:** Notification sent to Backend Team via Slack (#integrations-google)
3. **Day -10:** Backend peer reviewer approves rotation (dual-control checkpoint #1)
4. **Day -7:** Backend Team creates new OAuth credentials via Google Cloud Console
   - Update OAuth consent screen if needed
   - Create new OAuth 2.0 Client ID
   - Update redirect URIs (if GOOGLE_REDIRECT_URI changes)
5. **Day -3:** Staging deployment with new GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (test OAuth flow)
6. **Day -1:** Canary validation (test Google OAuth login with test accounts)
7. **Day 0 (Rotation Day):**
   - 14:00 UTC: Deploy new GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to production API (Replit Secrets)
   - 14:05 UTC: Monitor OAuth service health (test login with internal accounts)
   - 14:10 UTC: Verify Gmail OAuth integration (check token refresh, sync functionality)
   - 14:15 UTC: Check Sentry for OAuth errors (should be zero)
   - 14:20 UTC: Backend Lead confirms successful rotation (dual-control checkpoint #2)
   - 14:30 UTC: Revoke old OAuth credentials via Google Cloud Console
8. **Day +1:** Post-rotation verification (OAuth login success rate, Gmail sync health)
9. **Day +7:** Rotation audit log review

#### Rollback Procedure
- **Trigger:** OAuth authentication failures >10% of attempts or Gmail sync failures
- **RTO:** < 15 minutes
- **Steps:**
  1. Immediately revert GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to previous values (Replit Secrets)
  2. Restart API service
  3. Verify OAuth login functionality
  4. Test Gmail sync connectivity
  5. Notify Backend Team

#### Dependencies
- **OAuth Service:** apps/api/routes/auth.ts (Passport.js Google OAuth strategy)
- **Gmail Integration:** apps/api/services/gmail-threads.service.ts, apps/api/services/gmail-settings.service.ts
- **Gmail Cron:** apps/api/services/cron/gmail-sync.cron.ts
- **Affected Features:** Google OAuth login, Gmail inbox sync, multi-user Gmail access

#### Notification Channels
- **Primary:** Slack #integrations-google
- **Secondary:** Email to backend-team@company.com
- **Escalation:** Slack mention @backend-lead if rotation fails

**Note on GOOGLE_REDIRECT_URI:**
- **No rotation required** (static configuration, only update if deploying to new domain)
- **Manual update procedure:**
  1. Update GOOGLE_REDIRECT_URI in environment variables
  2. Update redirect URI in Google Cloud Console OAuth consent screen
  3. Verify OAuth flow with test accounts
  4. Deploy to production
  5. No dual-control required (Backend Lead approval only)

---

### 3.10 GCP Configuration Identifiers (GCS_BUCKET_NAME, GCS_PROJECT_ID, GOOGLE_DOCUMENT_AI_PROCESSOR_ID, GOOGLE_DOCUMENT_AI_LOCATION, GOOGLE_CLOUD_PROJECT_ID)

**Risk Tier:** STATIC  
**Rotation Frequency:** Manual only (no scheduled rotation)  
**Lead Time:** N/A  
**Dual-Control:** Platform Lead approval required

#### Manual Update Procedure
These are static GCP resource identifiers that should only be updated during infrastructure migrations or configuration changes.

**When to Update:**
- Migrating to new GCS bucket (GCS_BUCKET_NAME, GCS_PROJECT_ID)
- Switching GCP project (GOOGLE_CLOUD_PROJECT_ID)
- Changing Document AI processor (GOOGLE_DOCUMENT_AI_PROCESSOR_ID)
- Changing Document AI region (GOOGLE_DOCUMENT_AI_LOCATION - requires GDPR compliance review)

**Update Procedure:**
1. **Pre-Migration Planning:**
   - Platform Lead creates migration ticket with detailed migration plan
   - Security Team reviews GDPR compliance (especially for GOOGLE_DOCUMENT_AI_LOCATION changes)
   - Backend Team reviews service dependencies and downtime requirements
2. **Configuration Update:**
   - Update environment variables in Replit Secrets
   - Verify GOOGLE_APPLICATION_CREDENTIALS points to correct project
   - Update GCP IAM permissions if needed
3. **Staging Validation:**
   - Deploy updated configuration to staging environment
   - Test Cloud Storage connectivity (file upload/download)
   - Test Document AI processing (invoice OCR)
   - Verify all GCP services accessible
4. **Production Deployment:**
   - Deploy updated configuration to production API + Worker
   - Monitor health endpoints (`/api/health/readyz`)
   - Verify Cloud Storage and Document AI connectivity
   - Platform Lead confirms successful migration
5. **Post-Migration Verification:**
   - Verify all files accessible in new GCS bucket (if migrating)
   - Check Document AI processing metrics
   - Review Sentry for GCP API errors (should be zero)

#### Rollback Procedure
- **Trigger:** GCP service connectivity failures or Document AI processing errors
- **RTO:** < 10 minutes (configuration rollback only, < 4 hours if bucket migration)
- **Steps:**
  1. Revert environment variables to previous values (Replit Secrets)
  2. Restart API + Worker services
  3. Verify Cloud Storage and Document AI connectivity
  4. If bucket migration: Restore previous GCS_BUCKET_NAME
  5. Notify Platform Team + Backend Team

#### Dependencies
- **Cloud Storage:** apps/api/services/storage.service.ts
- **Document AI:** packages/connectors/google-document-ai/index.ts
- **Document AI Worker:** apps/worker/processors/google-document-ai-invoice.ts
- **Affected Features:** File uploads, document storage, invoice OCR, document classification

#### GDPR Compliance Note
- **GOOGLE_DOCUMENT_AI_LOCATION must remain `eu`** for GDPR compliance
- Changing to non-EU region requires Data Protection Impact Assessment (DPIA)
- Security Team + Legal approval required for region changes

---

### 3.11 Monitoring & Observability (SENTRY_DSN)

**Risk Tier:** LOW  
**Rotation Frequency:** 365 days (annual rotation)  
**Lead Time:** 30 days  
**Dual-Control:** Platform Lead approval only

#### Rotation Procedure
1. **Day -30:** Platform Team creates rotation ticket
2. **Day -30:** Notification sent to Platform Team via Slack (#platform-monitoring)
3. **Day -20:** Platform Lead reviews and approves rotation
4. **Day -14:** Platform Team creates new Sentry DSN via Sentry.io (new client key)
5. **Day -7:** Staging deployment with new SENTRY_DSN (verify error reporting)
6. **Day -3:** Canary validation (trigger test errors, verify Sentry capture)
7. **Day 0 (Rotation Day):**
   - 15:00 UTC: Deploy new SENTRY_DSN to production API + Worker (Replit Secrets)
   - 15:05 UTC: Monitor Sentry dashboard (verify events arriving)
   - 15:10 UTC: Trigger test error (verify capture and alerting)
   - 15:15 UTC: Platform Lead confirms successful rotation
   - 15:30 UTC: Disable old Sentry DSN via Sentry.io
8. **Day +1:** Post-rotation verification (error capture rate, alert delivery)
9. **Day +7:** Rotation audit log review

#### Rollback Procedure
- **Trigger:** Sentry event capture failures (no events in >10 minutes)
- **RTO:** < 20 minutes
- **Steps:**
  1. Revert SENTRY_DSN to previous value (Replit Secrets)
  2. Restart API + Worker services
  3. Verify Sentry event capture (trigger test error)
  4. Check Sentry dashboard for event delivery
  5. Notify Platform Team

#### Dependencies
- **Sentry Integration:** apps/api/index.ts, apps/worker/index.ts
- **Logger Service:** apps/api/services/logger.service.ts
- **Health Service:** apps/api/services/health.service.ts
- **Affected Features:** Error monitoring, performance tracking, alert notifications, audit logging

#### Notification Channels
- **Primary:** Slack #platform-monitoring
- **Secondary:** Email to platform-team@company.com

**Note:**
- **Low rotation priority** (annual cadence sufficient for monitoring credentials)
- **No service downtime expected** (error capture continues with new DSN)
- **Verify alert routing** post-rotation (Slack integrations, email notifications)

---

### 3.12 Environment Configuration (SESSION_COOKIE_DOMAIN, NODE_ENV, PORT, ENABLE_CRON_JOBS)

**Risk Tier:** STATIC  
**Rotation Frequency:** Manual only (no scheduled rotation)  
**Lead Time:** N/A  
**Dual-Control:** Platform Lead approval required

#### Manual Update Procedure
These are static platform configuration variables that should only be updated during environment changes or deployment configuration updates.

**When to Update:**
- Migrating to new domain (SESSION_COOKIE_DOMAIN)
- Changing environment type (NODE_ENV: production/staging/development)
- Changing API server port (PORT)
- Enabling/disabling cron jobs (ENABLE_CRON_JOBS)

**Update Procedure:**
1. **Configuration Review:**
   - Platform Lead creates configuration change ticket
   - Security Team reviews impact (especially SESSION_COOKIE_DOMAIN changes)
   - Document expected behavior changes
2. **Staging Validation:**
   - Update environment variables in staging environment
   - Verify application startup
   - Test affected features (session management, cron jobs, health checks)
3. **Production Deployment:**
   - Update environment variables in Replit Secrets
   - Restart API + Worker services
   - Monitor health endpoints (`/api/health/readyz`)
   - Platform Lead confirms successful configuration update
4. **Post-Deployment Verification:**
   - **SESSION_COOKIE_DOMAIN:** Verify session persistence across domain
   - **NODE_ENV:** Check logging verbosity, error handling behavior
   - **PORT:** Verify API accessibility, load balancer configuration
   - **ENABLE_CRON_JOBS:** Check cron job execution (queue monitoring, Gmail sync, backup monitoring)

#### Rollback Procedure
- **Trigger:** Application startup failures or configuration errors
- **RTO:** < 10 minutes
- **Steps:**
  1. Revert environment variables to previous values (Replit Secrets)
  2. Restart API + Worker services
  3. Verify application health
  4. Test affected features
  5. Notify Platform Team

#### Dependencies
- **SESSION_COOKIE_DOMAIN:** apps/api/index.ts (express-session configuration)
- **NODE_ENV:** All services (logger verbosity, error handling, environment detection)
- **PORT:** apps/api/index.ts (Express server binding)
- **ENABLE_CRON_JOBS:** apps/worker/scheduler.ts (cron job execution control)
- **Affected Features:** Session management, logging, API server, cron jobs (queue monitoring, Gmail sync, backup monitoring)

#### Configuration Safety Notes
- **NODE_ENV must be 'production' in production environment** (never 'development' or 'staging')
- **PORT must not conflict with other services** (default: 5000 for frontend binding)
- **ENABLE_CRON_JOBS should be 'true' for single-instance deployments only** (prevents duplicate cron execution)
- **SESSION_COOKIE_DOMAIN changes invalidate all existing sessions** (user impact notice required)

---

## 4. Notification & Approval Workflow

### 4.1 Rotation Notification Timeline

| Rotation Phase | Timing | Notification Channel | Audience | Action Required |
|----------------|--------|---------------------|----------|-----------------|
| **Planning** | Day -14 to -7 | Slack (#alerts-security, #ai-infrastructure, #gcp-infrastructure, #integrations-whatsapp, #platform-notifications) | Owning Team | Create rotation ticket |
| **Approval** | Day -10 to -5 | Email + Slack mention | Approving Team (Security/Backend Lead) | Review and approve rotation |
| **Preparation** | Day -5 to -3 | Slack status update | Owning Team | Generate new credentials, stage deployment |
| **Canary** | Day -3 to -1 | Slack status update | Owning Team | Validate new credentials in staging |
| **Execution** | Day 0 | Slack alert (pre-rotation notice) | All Teams | Acknowledge rotation in progress |
| **Monitoring** | Day 0 (during rotation) | Sentry alerts + Slack | On-call Engineer | Monitor health endpoints, verify success |
| **Confirmation** | Day 0 (post-rotation) | Slack status update | Approving Team | Confirm successful rotation (dual-control) |
| **Audit** | Day +7 | Email summary | Security Team + Platform Lead | Review rotation audit log |

### 4.2 Dual-Control Approval Requirements

#### CRITICAL Secrets (DATABASE_URL, REDIS_URL, SESSION_SECRET)
- **Approver 1:** Platform Team member (rotation executor)
- **Approver 2:** Security Team member (independent reviewer)
- **Approval Method:** Dual sign-off in rotation ticket (project management system)
- **Timeline:** Approval required at Day -5 (planning) and Day 0 (execution confirmation)

#### HIGH Secrets (AI API Keys, GCP Service Account)
- **Approver 1:** Backend Team member (rotation executor)
- **Approver 2:** Security Team member (independent reviewer)
- **Approval Method:** Dual sign-off in rotation ticket
- **Timeline:** Approval required at Day -7 (planning) and Day 0 (execution confirmation)

#### MEDIUM Secrets (WhatsApp API, OAuth)
- **Approver 1:** Backend Team member (rotation executor)
- **Approver 2:** Backend peer reviewer (same team, different individual)
- **Approval Method:** Peer review in rotation ticket
- **Timeline:** Approval required at Day -10 (planning) and Day 0 (execution confirmation)

#### LOW Secrets (SMTP, Monitoring)
- **Approver:** Backend Lead only
- **Approval Method:** Single sign-off in rotation ticket
- **Timeline:** Approval required at Day -20 (planning)

### 4.3 Emergency Rotation Triggers

Immediate rotation (bypassing standard lead time) required when:
1. **Credential Compromise Suspected:** Unauthorized access detected in audit logs
2. **Security Incident:** Breach notification from third-party provider (OpenAI, Anthropic, Meta, etc.)
3. **Insider Threat:** Employee termination with access to production secrets
4. **Compliance Audit Finding:** Expired credentials identified during audit
5. **Leaked Credentials:** Accidental commit to public repository or exposure in logs

**Emergency Rotation Procedure:**
- **Approval:** Security Team Lead + Platform Lead (verbal + Slack confirmation)
- **Timeline:** < 4 hours from trigger to completion
- **Notification:** Immediate Slack alert (#alerts-security) + PagerDuty page
- **Audit:** Post-incident review within 24 hours

---

## 5. Calendar Cadence

### 5.1 Quarterly Rotation Calendar (2026)

#### Q1 2026 (January - March)
| Rotation Date | Secrets | Risk Tier | Owning Team | Dual-Control |
|--------------|---------|-----------|-------------|--------------|
| **2026-01-10** | DATABASE_URL, REDIS_URL | CRITICAL | Platform Team | Platform + Security |
| **2026-02-10** | SESSION_SECRET, OPENAI_API_KEY, ANTHROPIC_API_KEY, GOOGLE_APPLICATION_CREDENTIALS | CRITICAL/HIGH | Platform + Backend | Teams + Security |
| **2026-02-10** | WHATSAPP_ACCESS_TOKEN, WHATSAPP_APP_SECRET, WHATSAPP_VERIFY_TOKEN, SMTP_USER, SMTP_PASSWORD | MEDIUM/LOW | Backend Team | Backend + Backend |

#### Q2 2026 (April - June)
| Rotation Date | Secrets | Risk Tier | Owning Team | Dual-Control |
|--------------|---------|-----------|-------------|--------------|
| **2026-04-10** | DATABASE_URL, REDIS_URL | CRITICAL | Platform Team | Platform + Security |
| **2026-05-10** | SESSION_SECRET, OPENAI_API_KEY, ANTHROPIC_API_KEY, GOOGLE_APPLICATION_CREDENTIALS | CRITICAL/HIGH | Platform + Backend | Teams + Security |
| **2026-05-10** | WHATSAPP_ACCESS_TOKEN, WHATSAPP_APP_SECRET, WHATSAPP_VERIFY_TOKEN, SMTP_USER, SMTP_PASSWORD | MEDIUM/LOW | Backend Team | Backend + Backend |
| **2026-05-10** | GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET | MEDIUM | Backend Team | Backend + Backend |

#### Q3 2026 (July - September)
| Rotation Date | Secrets | Risk Tier | Owning Team | Dual-Control |
|--------------|---------|-----------|-------------|--------------|
| **2026-07-10** | DATABASE_URL, REDIS_URL | CRITICAL | Platform Team | Platform + Security |
| **2026-08-10** | SESSION_SECRET, OPENAI_API_KEY, ANTHROPIC_API_KEY, GOOGLE_APPLICATION_CREDENTIALS | CRITICAL/HIGH | Platform + Backend | Teams + Security |
| **2026-08-10** | WHATSAPP_ACCESS_TOKEN, WHATSAPP_APP_SECRET, WHATSAPP_VERIFY_TOKEN, SMTP_USER, SMTP_PASSWORD | MEDIUM/LOW | Backend Team | Backend + Backend |

#### Q4 2026 (October - December)
| Rotation Date | Secrets | Risk Tier | Owning Team | Dual-Control |
|--------------|---------|-----------|-------------|--------------|
| **2026-10-10** | DATABASE_URL, REDIS_URL | CRITICAL | Platform Team | Platform + Security |
| **2026-11-10** | SESSION_SECRET, OPENAI_API_KEY, ANTHROPIC_API_KEY, GOOGLE_APPLICATION_CREDENTIALS | CRITICAL/HIGH | Platform + Backend | Teams + Security |
| **2026-11-10** | WHATSAPP_ACCESS_TOKEN, WHATSAPP_APP_SECRET, WHATSAPP_VERIFY_TOKEN, SMTP_USER, SMTP_PASSWORD, SENTRY_DSN | MEDIUM/LOW | Backend Team | Backend + Backend |
| **2026-11-10** | GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET | MEDIUM | Backend Team | Backend + Backend |

### 5.2 Annual Rotation Events

| Event | Date | Description | Owning Team |
|-------|------|-------------|-------------|
| **Annual Security Audit** | 2026-01-31 | Review all rotation logs, verify compliance with GDPR/NIST requirements | Security Team + Platform Team |
| **Quarterly Rotation Drill** | Q1, Q2, Q3, Q4 (last week of quarter) | Tabletop exercise simulating emergency rotation for CRITICAL secrets | Platform Team + Security Team |
| **SENTRY_DSN Rotation** | 2026-11-10 | Annual rotation of Sentry monitoring credentials | Platform Team |
| **Compliance Review** | 2026-12-15 | Platform Lead + Security Team review rotation policy for updates | Platform Lead |

---

## 6. Rollback & Emergency Procedures

### 6.1 General Rollback Principles
- **RTO Targets:** < 5 minutes (CRITICAL), < 10 minutes (HIGH), < 15 minutes (MEDIUM), < 20 minutes (LOW)
- **Rollback Trigger:** Health endpoint failures, API error rate >5%, service degradation
- **Approval:** On-call engineer can execute rollback without dual-control (post-incident review required)
- **Audit Trail:** All rollbacks logged to Sentry with incident ID

### 6.2 Emergency Rotation Procedures

#### Scenario 1: Credential Compromise Detected
**Trigger:** Unauthorized access detected in Sentry audit logs or third-party notification

**Immediate Actions (< 1 hour):**
1. **00:00 - Alert:** On-call engineer paged via PagerDuty
2. **00:05 - Escalation:** Notify Security Team Lead + Platform Lead via Slack
3. **00:10 - Investigation:** Review Sentry audit logs, identify compromised credential
4. **00:15 - Approval:** Security Team Lead + Platform Lead verbal approval (Slack confirmation)
5. **00:20 - Rotation:** Generate new credential, deploy to production (Replit Secrets)
6. **00:25 - Verification:** Monitor health endpoints, verify service connectivity
7. **00:30 - Revocation:** Revoke compromised credential via provider console
8. **00:45 - Notification:** Slack broadcast (#alerts-security) with incident summary
9. **01:00 - Monitoring:** Continuous monitoring for 4 hours (verify no further compromise)

**Post-Incident Actions (< 24 hours):**
1. **+4 hours:** Post-incident review meeting (Security + Platform + Backend teams)
2. **+8 hours:** Root cause analysis (RCA) documentation
3. **+24 hours:** RCA report submitted to Platform Lead + Security Team
4. **+7 days:** Implement preventative measures (e.g., enhanced monitoring, access controls)

#### Scenario 2: Insider Threat (Employee Termination)
**Trigger:** HR notification of employee termination with production access

**Immediate Actions (< 2 hours):**
1. **00:00 - Notification:** HR notifies Security Team + Platform Lead
2. **00:15 - Access Review:** Security Team reviews employee's access scope (which secrets accessed)
3. **00:30 - Prioritization:** Identify CRITICAL/HIGH secrets accessed by employee
4. **00:45 - Rotation:** Emergency rotation of all accessed CRITICAL/HIGH secrets
5. **01:00 - Verification:** Monitor health endpoints, verify service connectivity
6. **01:15 - Revocation:** Revoke all old credentials
7. **01:30 - Audit:** Review access logs for unauthorized activity
8. **02:00 - Documentation:** Incident report submitted to Security Team

**Post-Incident Actions (< 7 days):**
1. **+1 day:** Complete rotation of all accessed MEDIUM/LOW secrets
2. **+3 days:** Access review for remaining team members
3. **+7 days:** Update access control policies (principle of least privilege)

#### Scenario 3: Leaked Credentials (Accidental Public Exposure)
**Trigger:** Automated scan detects credentials in public GitHub commit or logs

**Immediate Actions (< 30 minutes):**
1. **00:00 - Alert:** Automated alert triggers PagerDuty page
2. **00:05 - Verification:** On-call engineer confirms credential exposure
3. **00:10 - Approval:** Security Team Lead verbal approval (Slack confirmation)
4. **00:15 - Rotation:** Generate new credential, deploy to production
5. **00:20 - Revocation:** Revoke leaked credential immediately
6. **00:25 - Remediation:** Remove leaked credential from public repository (GitHub support ticket)
7. **00:30 - Monitoring:** Monitor for unauthorized access attempts

**Post-Incident Actions (< 48 hours):**
1. **+1 hour:** Scan all other repositories for similar leaks
2. **+4 hours:** Review logging configuration (prevent credential logging)
3. **+24 hours:** Implement pre-commit hooks (prevent future leaks)
4. **+48 hours:** Security awareness training for development team

### 6.3 Rollback Decision Matrix

| Service Health Status | Action | Approval Required | RTO Target |
|----------------------|--------|-------------------|-----------|
| **All health checks passing** | No rollback, continue monitoring | N/A | N/A |
| **Single degraded service (<5% error rate)** | Continue monitoring, prepare rollback | N/A | N/A |
| **Multiple degraded services (5-10% error rate)** | Execute rollback | On-call engineer | < 10 minutes |
| **Critical service failure (>10% error rate)** | Immediate rollback | On-call engineer | < 5 minutes |
| **Complete outage (all services down)** | Immediate rollback + escalation | Platform Lead | < 3 minutes |

---

## 7. Audit Trail & Compliance Tracking

### 7.1 Rotation Audit Logging
All credential rotations must be logged to Sentry with the following metadata:
- **Rotation ID:** Unique identifier (UUID)
- **Secret Name:** Credential being rotated
- **Rotation Date:** Timestamp (UTC)
- **Executor:** Engineer performing rotation
- **Approver:** Dual-control approver (if applicable)
- **Rotation Type:** Scheduled / Emergency
- **Outcome:** Success / Rollback / Failed
- **RTO Actual:** Time to complete rotation (minutes)
- **Health Check Results:** Pre-rotation and post-rotation health status

**Sentry Event Example:**
```json
{
  "event_id": "rotation-2026-01-10-database-url",
  "timestamp": "2026-01-10T09:00:00Z",
  "level": "info",
  "message": "Credential rotation completed successfully",
  "tags": {
    "secret_name": "DATABASE_URL",
    "risk_tier": "CRITICAL",
    "rotation_type": "scheduled",
    "executor": "platform-engineer@company.com",
    "approver": "security-lead@company.com"
  },
  "extra": {
    "rotation_id": "550e8400-e29b-41d4-a716-446655440000",
    "rto_actual_minutes": 4,
    "health_check_pre": "healthy",
    "health_check_post": "healthy",
    "dual_control_approved": true
  }
}
```

### 7.2 Compliance Reporting
**Quarterly Compliance Report** (submitted to Security Team + Platform Lead):
- Total rotations performed (by risk tier)
- Average RTO per risk tier
- Rollback incidents (count, root cause)
- Dual-control approval compliance (% of rotations with dual sign-off)
- Emergency rotations (count, triggers)
- Audit trail completeness (% of rotations logged to Sentry)

**Annual Compliance Audit** (submitted to Legal + Compliance teams):
- GDPR Article 32 compliance (security of processing)
- NIST 800-53 IA-5 compliance (authenticator management)
- Rotation schedule adherence (% of rotations completed on time)
- Dual-control effectiveness (% of unauthorized rotation attempts blocked)
- Security incident response (average time to emergency rotation)

---

## 8. Policy Maintenance & Review

### 8.1 Policy Review Schedule
- **Quarterly Review:** Platform Team + Security Team review rotation schedule compliance
- **Annual Review:** Platform Lead + Security Team update policy based on:
  - New secret families (e.g., new third-party integrations)
  - Compliance requirement changes (GDPR/NIST updates)
  - Security incident lessons learned
  - Technology changes (e.g., new secret management tools)

### 8.2 Policy Version History

| Version | Date | Changes | Approved By |
|---------|------|---------|-------------|
| 1.0 | 2025-11-10 | Initial policy creation | Platform Team + Security Team |

### 8.3 Document Ownership
- **Primary Owner:** Platform Team
- **Approvers:** Security Team, Backend Team Lead
- **Reviewers:** All engineers with production access
- **Location:** `docs/secrets-rotation-policy.md` (version-controlled)

---

## 9. Related Documentation
- **Secrets Inventory:** `docs/secrets-inventory.md` (31 secrets enumerated with GDPR/NIST compliance mapping)
- **Database Backup Strategy:** `docs/database-backup-strategy.md` (Neon PITR configuration, RTO/RPO targets)
- **Database Restore Runbook:** `docs/database-restore-runbook.md` (4 disaster recovery scenarios)
- **Sentry Alert Catalog:** `docs/sentry-alert-catalog.md` (12 alert types, SLO thresholds)
- **Health Check Endpoints:** `/api/health/readyz` (Kubernetes readiness probe with DB/Redis/backup status)

---

**Last Updated:** 2025-11-10  
**Next Review:** 2026-02-10 (Quarterly)  
**Approved By:** Platform Team + Security Team (pending)