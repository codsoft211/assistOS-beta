# OPENAI_API_KEY Rotation Workflow

**Document Version:** 1.0.0  
**Last Updated:** November 10, 2025  
**Owner:** Backend Team  
**Classification:** CONFIDENTIAL - Internal Use Only

---

## Overview

**Secret:** `OPENAI_API_KEY`  
**Risk Tier:** HIGH (90-day rotation)  
**Blast Radius:** AssistME orchestrator (GPT-5), embeddings service, OpenAI Vision fallback  
**RTO Target:** <5 minutes  
**Downtime:** Zero (dual-key approach with canary validation)

**Rotation Frequency:** Every 90 days (AI provider best practice)  
**Lead Time:** 7 days (coordinate with Backend team)  
**Notification:** Slack #backend-team, PagerDuty (7 days before, 24 hours before, rotation start)

---

## Prerequisites

### Access Requirements
- [ ] OpenAI API admin access (organization + billing)
- [ ] Replit Secrets write access (production environment)
- [ ] SSH access to API + Worker services (or Replit workspace access)
- [ ] Sentry admin access (for alert mute window)

### Pre-Rotation Checklist
- [ ] **System Health:** Verify `/api/health/readyz` returns 200 OK
- [ ] **Rate Limits:** Document current API usage (requests/min, tokens/min)
- [ ] **Active Jobs:** Confirm no high-priority AI jobs in queue
- [ ] **Sentry Baseline:** Record current error rate (target: <2x during rotation)
- [ ] **Budget Check:** Confirm OpenAI billing balance >$100 (avoid rate limit during rotation)
- [ ] **Stakeholder Notification:** Backend Team notified 24h prior
- [ ] **Rollback Window:** Identify 2-hour maintenance window (low AI usage period)

### Tools Required
```bash
# Install OpenAI CLI (optional, for manual verification)
pip install openai

# Verify API access
python -c "
from openai import OpenAI
client = OpenAI(api_key='$OPENAI_API_KEY')
print(client.models.list())
"
```

---

## Rotation Steps

### Phase 1: Staged Credential Issuance (Dual-Key Period)

**Goal:** Generate new API key while keeping old key active (simultaneous usage).

**Duration:** 5 minutes  
**Impact:** None (both keys active)

#### 1.1 Create New API Key
```bash
# Via OpenAI Dashboard:
# 1. Navigate to https://platform.openai.com/api-keys
# 2. Click "Create new secret key"
# 3. Name: "assistos-prod-rotation-$(date +%Y%m%d)"
# 4. Permissions: "All" (full access)
# 5. Copy new API key (starts with sk-proj-...)

NEW_OPENAI_API_KEY="sk-proj-NEW_KEY_HERE"
```

**Verification:**
```bash
# Test new key with simple API call
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $NEW_OPENAI_API_KEY" \
  | jq '.data[0].id'

# Expected: Model ID returned (e.g., "gpt-4o-2024-11-20")
```

#### 1.2 Verify Rate Limits (New Key)
```bash
# Test rate limits with new key
python3 <<EOF
from openai import OpenAI
import time

client = OpenAI(api_key="$NEW_OPENAI_API_KEY")

# Test embeddings endpoint (low-cost)
start = time.time()
response = client.embeddings.create(
    model="text-embedding-3-small",
    input="OPENAI_API_KEY rotation test"
)
duration = time.time() - start

print(f"Embeddings test: {len(response.data[0].embedding)} dimensions")
print(f"Latency: {duration:.2f}s")
print(f"Rate limit headers: {response.headers if hasattr(response, 'headers') else 'N/A'}")
EOF

# Expected: Embeddings generated successfully, latency <2s
```

#### 1.3 Store New Credential in Staging
```bash
# Update staging secret (test environment)
# Via Replit Secrets UI:
# 1. Navigate to Secrets tab
# 2. Add new secret: OPENAI_API_KEY_NEW = <new_api_key>
# 3. Keep existing OPENAI_API_KEY unchanged
```

**Audit Trail:**
```bash
# Log rotation start
echo "$(date -Iseconds) - OPENAI_API_KEY rotation started - dual-key period active" >> docs/rotation-logs/$(date +%Y%m%d)-openai-api-key.md
```

---

### Phase 2: Canary Validation (Isolated AssistME Test)

**Goal:** Test new API key with canary AssistME orchestrator call in isolation.

**Duration:** 5 minutes  
**Impact:** None (canary isolated from production)

#### 2.1 Test Embeddings Generation (Canary)
```bash
# Temporarily update OPENAI_API_KEY in .env (local test)
export OPENAI_API_KEY="$NEW_OPENAI_API_KEY"

# Run embeddings service test
node -e "
const { openai } = require('./packages/ai/providers/openai');
const embedding = require('./packages/platform/services/embedding.service');

async function canaryTest() {
  try {
    const result = await embedding.generateEmbedding('OPENAI_API_KEY rotation canary test');
    console.log('Canary SUCCESS: Embeddings generated -', result.length, 'dimensions');
    process.exit(0);
  } catch (err) {
    console.error('Canary FAILED:', err.message);
    process.exit(1);
  }
}

canaryTest();
"

# Expected: "Canary SUCCESS: Embeddings generated - 1536 dimensions"
```

#### 2.2 Test AssistME Orchestrator (Canary Completion)
```bash
# Test AssistME orchestrator with new key (simple completion)
export OPENAI_API_KEY="$NEW_OPENAI_API_KEY"

node -e "
const { openai } = require('./packages/ai/providers/openai');

async function canaryCompletion() {
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-2024-11-20',
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Say CANARY_SUCCESS if you can read this.' }
      ],
      max_tokens: 10
    });
    
    const response = completion.choices[0].message.content;
    console.log('AssistME canary response:', response);
    
    if (response.includes('CANARY_SUCCESS')) {
      console.log('Canary PASSED: AssistME orchestrator working');
      process.exit(0);
    } else {
      console.error('Canary FAILED: Unexpected response');
      process.exit(1);
    }
  } catch (err) {
    console.error('Canary FAILED:', err.message);
    process.exit(1);
  }
}

canaryCompletion();
"

# Expected: "Canary PASSED: AssistME orchestrator working"
```

#### 2.3 Test Streaming Response (Canary)
```bash
# Test streaming with new key (critical for AssistME UX)
export OPENAI_API_KEY="$NEW_OPENAI_API_KEY"

node -e "
const { openai } = require('./packages/ai/providers/openai');

async function canaryStreaming() {
  try {
    const stream = await openai.chat.completions.create({
      model: 'gpt-4o-2024-11-20',
      messages: [{ role: 'user', content: 'Count to 3.' }],
      stream: true,
      max_tokens: 20
    });
    
    let chunks = 0;
    for await (const chunk of stream) {
      chunks++;
      process.stdout.write(chunk.choices[0]?.delta?.content || '');
    }
    
    console.log('\nCanary PASSED: Streaming working -', chunks, 'chunks received');
    process.exit(0);
  } catch (err) {
    console.error('Canary FAILED:', err.message);
    process.exit(1);
  }
}

canaryStreaming();
"

# Expected: "Canary PASSED: Streaming working - X chunks received"
```

**Canary Success Criteria:**
- [ ] Embeddings generation succeeds
- [ ] AssistME completion returns valid response
- [ ] Streaming responses work (chunks received)
- [ ] Latency <3s for simple completion
- [ ] No rate limit errors
- [ ] No authentication errors in Sentry

**Canary Failure → Rollback:**
If canary fails, skip to **Phase 6: Rollback Procedure**.

---

### Phase 3: Production Rollout (Update Secret + Restart Services)

**Goal:** Update OPENAI_API_KEY secret in production, restart services sequentially (API → Worker).

**Duration:** 10 minutes  
**Impact:** Brief AI service interruption (<30s during restart)

#### 3.1 Mute Sentry Alerts
```bash
# Mute OpenAI API errors for 30 minutes
# Via Sentry UI:
# 1. Navigate to Alerts > Alert Rules
# 2. Mute rule: "OpenAI API Errors"
# 3. Mute rule: "AssistME Orchestrator Failures"
# 4. Duration: 30 minutes
```

#### 3.2 Update Replit Secret (Production)
```bash
# Via Replit Secrets UI:
# 1. Navigate to Secrets tab (production workspace)
# 2. Edit secret: OPENAI_API_KEY
# 3. Replace value with NEW_OPENAI_API_KEY
# 4. Save changes

# Verification: Secret updated timestamp should reflect current time
```

#### 3.3 Restart API Service
```bash
# Graceful restart via Replit (API service picks up new OPENAI_API_KEY)
# Via Replit UI:
# 1. Navigate to Deployments > API Service
# 2. Click "Restart"
# 3. Wait for status: "Running"

# Verify new key active (test embeddings endpoint)
curl -X POST http://localhost:5000/api/assistme/test-embeddings \
  -H "Content-Type: application/json" \
  -d '{"text":"Rotation test"}'

# Expected: {"dimensions":1536,"success":true}
```

**API Service Verification:**
- [ ] Health endpoint returns 200 OK
- [ ] Embeddings endpoint works
- [ ] No OpenAI authentication errors in Sentry
- [ ] Response time <2s

#### 3.4 Restart Worker Service
```bash
# Graceful restart via Replit (Worker service picks up new OPENAI_API_KEY)
# Via Replit UI:
# 1. Navigate to Deployments > Worker Service
# 2. Click "Restart"
# 3. Wait for status: "Running"

# Verify AI jobs processing
curl -f http://localhost:5000/api/health/readyz | jq '.queues[] | select(.name=="ai-tasks")'

# Expected: ai-tasks queue active, jobs processing
```

**Worker Service Verification:**
- [ ] AI tasks queue active
- [ ] Jobs processing successfully
- [ ] No OpenAI rate limit errors
- [ ] Job success rate >95%

---

### Phase 4: Monitoring & Verification (30-Minute Observation Window)

**Goal:** Confirm zero degradation across all AI services and workflows.

**Duration:** 30 minutes (HIGH tier requirement)  
**Impact:** None (monitoring only)

#### 4.1 AssistME Orchestrator Monitoring
```bash
# Monitor AssistME job success rate (30 minutes)
# Via Sentry UI:
# 1. Navigate to Performance > Transactions
# 2. Filter: transaction:"assistme.orchestrate", last 30 minutes
# 3. Monitor success rate, latency (p95)

# Expected: Success rate >95%, latency <5s (p95)
```

#### 4.2 Embeddings Service Monitoring
```bash
# Poll embeddings endpoint every 2 minutes for 30 minutes
for i in {1..15}; do
  echo "Poll $i/15 - $(date -Iseconds)"
  
  RESULT=$(curl -s -X POST http://localhost:5000/api/assistme/test-embeddings \
    -H "Content-Type: application/json" \
    -d '{"text":"Monitoring test"}' | jq -r '.success')
  
  echo "Embeddings success: $RESULT"
  sleep 120
done

# Expected: All 15 polls return "success": true
```

#### 4.3 Rate Limit Monitoring
```bash
# Via OpenAI Dashboard:
# 1. Navigate to https://platform.openai.com/usage
# 2. Monitor API usage (requests/min, tokens/min)
# 3. Compare with pre-rotation baseline

# Expected: Usage stable (±20% variance)
# Alert if rate limit errors appear
```

#### 4.4 Sentry Error Rate Analysis
```bash
# Via Sentry UI:
# 1. Navigate to Issues > Search
# 2. Filter: last 30 minutes, tag:openai_api_error
# 3. Compare error rate vs 24h baseline

# Threshold: <2x baseline error rate
# Alert if error rate >2x → trigger rollback
```

**Monitoring Success Criteria:**
- [ ] AssistME success rate >95%
- [ ] Embeddings endpoint: 15/15 polls successful
- [ ] Rate limits: stable usage (±20%)
- [ ] Sentry error rate: <2x baseline
- [ ] No user-reported AI failures
- [ ] Job queue depth: stable

**Monitoring Failure → Rollback:**
If any failure threshold exceeded, proceed to **Phase 6: Rollback Procedure**.

---

### Phase 5: Post-Rotation Cleanup

**Goal:** Revoke old API key, unmute Sentry alerts, document rotation completion.

**Duration:** 5 minutes  
**Impact:** None (old key already unused)

#### 5.1 Revoke Old API Key
```bash
# Via OpenAI Dashboard:
# 1. Navigate to https://platform.openai.com/api-keys
# 2. Select old key (created before rotation)
# 3. Click "Revoke"
# 4. Confirm deletion

# Verify old key revoked (should fail)
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OLD_OPENAI_API_KEY"

# Expected: {"error":{"message":"Invalid API key"}}
```

#### 5.2 Unmute Sentry Alerts
```bash
# Via Sentry UI:
# 1. Navigate to Alerts > Muted Alerts
# 2. Unmute: "OpenAI API Errors"
# 3. Unmute: "AssistME Orchestrator Failures"
```

#### 5.3 Cleanup Staging Secret
```bash
# Remove staging canary secret
# Via Replit Secrets UI (staging):
# 1. Delete: OPENAI_API_KEY_NEW
```

#### 5.4 Audit Trail Completion
```bash
# Log rotation completion
cat >> docs/rotation-logs/$(date +%Y%m%d)-openai-api-key.md <<EOF
## Rotation Summary

**Status:** SUCCESS  
**Duration:** $(( ($(date +%s) - ROTATION_START_TIME) / 60 )) minutes  
**AssistME Success Rate:** >95%  
**Embeddings Tests:** 15/15 passed  
**Rate Limits:** Stable  
**Error Rate:** <2x baseline

**Approvals:**
- Backend Lead: [Signature]

**Next Rotation:** $(date -d '+90 days' +%Y-%m-%d)
EOF
```

---

## Phase 6: Rollback Procedure

**Trigger Conditions:**
- [ ] AssistME success rate <95%
- [ ] Embeddings endpoint fails 2+ consecutive polls
- [ ] Rate limit errors (429 status)
- [ ] Canary error rate >5%
- [ ] Sentry error rate >2x baseline
- [ ] Manual escalation (Backend Lead decision)

**RTO:** <5 minutes  
**Impact:** Brief AI service interruption (service restarts)

### 6.1 Immediate Actions
```bash
# Alert stakeholders
echo "ROLLBACK INITIATED - OPENAI_API_KEY rotation failed" | mail -s "URGENT: OPENAI_API_KEY Rollback" backend-team@assistos.com
```

### 6.2 Revert Replit Secret
```bash
# Via Replit Secrets UI (production):
# 1. Edit secret: OPENAI_API_KEY
# 2. Replace with OLD_OPENAI_API_KEY (stored in pre-rotation backup)
# 3. Save changes immediately

# Backup stored at: docs/rotation-logs/$(date +%Y%m%d)-openai-api-key-backup.txt
OLD_OPENAI_API_KEY=$(cat docs/rotation-logs/$(date +%Y%m%d)-openai-api-key-backup.txt)
```

### 6.3 Restart Services
```bash
# Restart API service
# Via Replit UI:
# 1. Deployments > API Service > Restart
# 2. Wait for status: "Running"

# Restart Worker service
# Via Replit UI:
# 1. Deployments > Worker Service > Restart
# 2. Wait for status: "Running"
```

### 6.4 Verify Rollback Success
```bash
# Test embeddings with old key
curl -X POST http://localhost:5000/api/assistme/test-embeddings \
  -H "Content-Type: application/json" \
  -d '{"text":"Rollback test"}'

# Expected: {"dimensions":1536,"success":true}
```

### 6.5 Revoke New API Key (Failed Credential)
```bash
# Via OpenAI Dashboard:
# 1. Navigate to https://platform.openai.com/api-keys
# 2. Select new key (created during rotation)
# 3. Click "Revoke"
# 4. Confirm deletion
```

### 6.6 Post-Rollback Analysis
```bash
# Document root cause
cat >> docs/rotation-logs/$(date +%Y%m%d)-openai-api-key.md <<EOF
## Rollback Analysis

**Rollback Reason:** [Describe trigger condition]  
**Error Details:** [Paste Sentry stack traces]  
**Root Cause:** [Analysis]  
**Remediation Plan:** [Next steps]  
**Next Attempt:** [Date after fixes]

**Approvals:**
- Backend Lead: [Signature]
EOF
```

---

## Dual-Control Approvals

**Pre-Rotation Sign-Off:**
- [ ] Backend Team Lead: _________________________ Date: _______

**Post-Rotation Sign-Off:**
- [ ] Backend Team Lead: _________________________ Date: _______

---

## Related Documentation

- **Secrets Inventory:** `docs/secrets-inventory.md` Section 4 (OPENAI_API_KEY detailed profile)
- **Rotation Policy:** `docs/secrets-rotation-policy.md` Section 3.5 (OPENAI_API_KEY rotation schedule)
- **AssistME Orchestrator:** `packages/ai/agents/assistme-orchestrator.ts` (GPT-5 integration)
- **Embeddings Service:** `packages/platform/services/embedding.service.ts` (OpenAI embeddings)

---

## Emergency Contacts

- **Backend Team Lead:** [Contact Info]  
- **OpenAI Support:** help.openai.com  
- **PagerDuty:** On-call rotation (24/7)
