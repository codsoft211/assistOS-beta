# WhatsApp Web Connector - Technical Documentation

## Table of Contents
1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Configuration](#configuration)
4. [Session Management](#session-management)
5. [Message Processing](#message-processing)
6. [Sync Feature](#sync-feature)
7. [Scalability](#scalability)
8. [Storage & Media](#storage--media)
9. [API Endpoints](#api-endpoints)
10. [Deployment](#deployment)

---

## Overview

The WhatsApp Web Connector is a production-ready integration that enables AssistOS to send and receive WhatsApp messages through the WhatsApp Web protocol using `whatsapp-web.js`. This connector provides full WhatsApp functionality including:

- **Real-time messaging** (send/receive text, media, voice, location)
- **Session persistence** across worker restarts
- **Multi-tenant support** (single worker handles all tenants)
- **Chat history sync** for existing conversations
- **Rich message types** (polls, reactions, replies, forwards)
- **Contact & group management**
- **Media storage** with organized file structure

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                       AssistOS Platform                       │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐         ┌──────────────┐                  │
│  │   API Server │◄───────►│ Worker Process│                  │
│  │  (Express)   │  HTTP   │  (WhatsApp)   │                  │
│  └──────┬───────┘         └───────┬───────┘                  │
│         │                          │                          │
│         │                          ├──────────────────┐       │
│         │                          │                  │       │
│         ▼                          ▼                  ▼       │
│  ┌──────────────┐         ┌──────────────┐  ┌──────────────┐│
│  │  PostgreSQL  │         │Session Manager│  │Message       ││
│  │   Database   │         │  (LocalAuth)  │  │Listener      ││
│  └──────────────┘         └──────┬────────┘  └──────────────┘│
│                                  │                            │
│                                  ▼                            │
│                          ┌──────────────┐                    │
│                          │ WhatsApp Web │                    │
│                          │   (Puppeteer)│                    │
│                          └──────────────┘                    │
│                                                               │
└───────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
                        ┌────────────────┐
                        │  WhatsApp      │
                        │  Servers       │
                        └────────────────┘
```

### Component Breakdown

#### 1. **Worker Process** (`apps/worker/index.ts`)
- Runs separately from API server
- Hosts WhatsApp Web sessions
- Handles message processing
- Manages session lifecycle
- Location: `apps/worker/`

#### 2. **Session Manager** (`apps/worker/whatsapp-web/session-manager.ts`)
- Manages WhatsApp Web.js client instances
- Handles QR code generation & authentication
- Maintains session persistence using LocalAuth
- Implements session recovery on restart
- EventEmitter for real-time events

**Key Features:**
- LocalAuth storage (filesystem-based session data)
- Automatic session recovery
- Phone number extraction from authenticated sessions
- Contact name resolution (multiple fallback methods)
- Duplicate account detection & merging

#### 3. **Message Listener** (`apps/worker/whatsapp-web/message-listener.ts`)
- Processes incoming WhatsApp messages
- Handles all message types (text, media, location, polls, reactions)
- Saves messages to database
- Downloads & stores media files
- Updates conversation & contact records
- Triggers automation analyzer for inbound messages

#### 4. **API Routes** (`apps/api/routes/whatsapp-web.ts`)
- Proxies requests from frontend to worker
- Handles authentication & tenant validation
- Provides REST endpoints for WhatsApp operations
- Server-Sent Events (SSE) for QR code streaming

#### 5. **Database Schema**
Tables:
- `whatsapp_accounts` - Account information
- `whatsapp_web_sessions` - Session state & QR codes
- `whatsapp_contacts` - Contact information
- `whatsapp_conversations` - Conversation metadata
- `whatsapp_messages` - Message history

---

## Configuration

### Environment Variables

#### **Worker Configuration**
```bash
# Worker server port (default: 3001)
WORKER_PORT=3001

# Worker URL for API to communicate with worker
WORKER_URL=http://localhost:3001

# WhatsApp cache directory (CRITICAL for production)
WHATSAPP_CACHE_PATH=/persistent/storage/whatsapp-cache

# PostgreSQL connection
DATABASE_URL=postgresql://user:password@host:5432/database
```

#### **Cache Storage Priority**
1. **Production**: Use `WHATSAPP_CACHE_PATH` for persistent storage (survives reboots)
2. **Development**: Falls back to `~/.assistos/whatsapp-cache` (home directory)
3. **Fallback**: Temporary directory (NOT RECOMMENDED - loses sessions on reboot)

⚠️ **CRITICAL**: In production, always set `WHATSAPP_CACHE_PATH` to a persistent volume:
```bash
# Example for Docker/Kubernetes
WHATSAPP_CACHE_PATH=/mnt/persistent-storage/whatsapp-cache

# Ensure directory is writable
chmod 777 /mnt/persistent-storage/whatsapp-cache
```

### Session Storage Architecture

**LocalAuth** stores session data in:
```
{CACHE_PATH}/
├── session-{accountId}/
│   ├── Default/                    # Chromium profile
│   │   ├── IndexedDB/             # WhatsApp encryption keys
│   │   ├── Local Storage/         # Session tokens
│   │   └── Service Worker/        # WhatsApp PWA cache
│   └── puppeteer_data/            # Chromium browser data
```

---

## Session Management

### Connection Flow

```
┌─────────────┐
│ 1. User     │
│ clicks      │
│ "Connect"   │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────┐
│ 2. API creates account record   │
│    phoneNumber: "pending-{uuid}" │
└──────┬──────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│ 3. API calls Worker             │
│    POST /whatsapp-web/session   │
└──────┬──────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│ 4. Worker creates session       │
│    - Initializes Puppeteer      │
│    - Waits for QR code          │
└──────┬──────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│ 5. Frontend polls QR via SSE    │
│    GET /qr-stream/:accountId    │
└──────┬──────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│ 6. User scans QR code           │
│    WhatsApp authenticates       │
└──────┬──────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│ 7. Session becomes "ready"      │
│    - Extract phone number       │
│    - Check for existing account │
│    - Merge if duplicate         │
│    - Start message listener     │
└──────┬──────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│ 8. Connected & receiving msgs   │
└─────────────────────────────────┘
```

### Session Recovery

On worker restart:
1. Worker calls `sessionManager.recoverSessions()`
2. Queries all `whatsapp_web_sessions` with status = 'ready'
3. For each session:
   - Creates new WhatsApp client with LocalAuth
   - Loads cached session from filesystem
   - Reconnects to WhatsApp Web
   - Updates session status

**Recovery Success Rate**: ~90-95% (depends on WhatsApp session TTL)

### Duplicate Account Handling

When a user connects the same WhatsApp number twice:

```typescript
// Session Manager automatically detects duplicates
const existingAccount = await findAccountByPhoneNumber(phoneNumber);

if (existingAccount && existingAccount.id !== currentAccountId) {
  console.log('🔄 Duplicate account detected - merging...');
  
  // 1. Migrate all data to existing account
  await migrateContacts(currentAccountId → existingAccountId);
  await migrateConversations(currentAccountId → existingAccountId);
  await migrateMessages(currentAccountId → existingAccountId);
  
  // 2. Update session to point to existing account
  await updateSession(existingAccountId);
  
  // 3. Delete duplicate account
  await deleteAccount(currentAccountId);
  
  // 4. Update in-memory session map
  sessions.delete(currentAccountId);
  sessions.set(existingAccountId, sessionInfo);
}
```

---

## Message Processing

### Inbound Message Flow

```
WhatsApp Message
       │
       ▼
┌─────────────────────────────────┐
│ 1. message event fired          │
│    (whatsapp-web.js)            │
└──────┬──────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│ 2. sessionManager.emit()        │
│    'message' event              │
└──────┬──────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│ 3. message-listener.ts          │
│    processMessage()             │
└──────┬──────────────────────────┘
       │
       ├──► Filter status updates
       │
       ├──► Get/create contact
       │
       ├──► Get/create conversation
       │
       ├──► Download media (if hasMedia)
       │
       ├──► Extract message data
       │    - text, caption, location
       │    - reactions, polls, replies
       │    - quoted messages
       │
       ├──► Save to database
       │
       └──► Trigger automation (if inbound)
```

### Message Types Supported

| Type | Description | Fields |
|------|-------------|--------|
| `chat` | Text message | text |
| `image` | Image with optional caption | mediaUrl, caption |
| `video` | Video with optional caption | mediaUrl, caption |
| `audio` | Audio file | mediaUrl |
| `ptt` | Voice note (push-to-talk) | mediaUrl |
| `document` | File attachment | mediaUrl, filename |
| `location` | GPS location | latitude, longitude, locationName |
| `vcard` | Contact card | interactivePayload |
| `poll_creation` | Poll with options | interactivePayload |
| `reaction` | Emoji reaction | interactivePayload (emoji, targetMessageId) |
| `sticker` | Sticker image | mediaUrl |

### Contact Name Resolution

Multi-method fallback system to get accurate contact names:

```typescript
// Priority order:
1. Store.Contact.name           // Saved in user's phone
2. Store.Contact.shortName      // Nickname
3. Store.Contact.formattedName  // WhatsApp display name
4. client.getContactById()      // Direct API call
5. chat.contact.name            // From chat object
6. phoneNumber                  // Fallback to number
```

**Validation Rules:**
- Reject if name equals phone number
- Reject if name equals account owner's number (prevents showing own name for self-messages)
- Reject if >60% digits (likely formatted phone number)

---

## Sync Feature

### Overview
The sync feature allows importing historical WhatsApp messages into AssistOS for existing conversations.

### Sync Modes

#### 1. **Specific Contact Sync** (Recommended)
Sync messages for selected phone numbers:

```typescript
// API Call
POST /api/whatsapp-web/sync/:accountId
{
  "phoneNumbers": [
    "351234567890",
    "351987654321"
  ],
  "messagesPerChat": 50  // Optional, default: 50
}
```

#### 2. **Full History Sync** (Deprecated)
Syncs all recent chats - resource intensive.

### Sync Implementation

**Location**: `apps/worker/whatsapp-web/session-manager.ts`

```typescript
async syncSpecificContacts(accountId: string, options: {
  phoneNumbers: string[];
  messagesPerChat?: number;
}) {
  const session = this.getSession(accountId);
  const client = session.client;
  
  for (const phoneNumber of phoneNumbers) {
    // 1. Get WhatsApp chat
    const chatId = `${phoneNumber}@c.us`;
    const chat = await client.getChatById(chatId);
    
    // 2. Fetch message history
    const messages = await chat.fetchMessages({
      limit: messagesPerChat || 50
    });
    
    // 3. Process each message
    for (const message of messages.reverse()) {
      // Save contact, conversation, message
      await this.processHistoricalMessage(accountId, message);
    }
  }
}
```

### Sync Performance

| Messages | Time | Database Writes |
|----------|------|-----------------|
| 50       | ~5s  | 150-200         |
| 100      | ~10s | 300-400         |
| 500      | ~50s | 1500-2000       |

**Rate Limiting**: WhatsApp Web.js has internal rate limiting to prevent bans.

### Sync Best Practices

✅ **DO:**
- Sync only important conversations
- Use `messagesPerChat: 50` for initial sync
- Run sync during off-peak hours
- Monitor worker memory usage

❌ **DON'T:**
- Sync all chats at once
- Set messagesPerChat > 200 (slow & risky)
- Sync frequently (causes duplicate detection overhead)

---

## Scalability

### Current Architecture

The current implementation uses a **single worker process** that handles all tenants:

- **Single Worker Process** at `apps/worker/index.ts`
- Runs on port 3001 (configurable via `WORKER_PORT`)
- All tenants share the same worker
- Sessions isolated in memory using `Map<accountId, SessionInfo>`
- Each session has isolated Chromium profile in separate cache directory
- API server proxies requests to worker via `WORKER_URL` environment variable

**Architecture:**

```
┌─────────────────────────────────────────────────────┐
│                   API Server                         │
│              (apps/api/index.ts)                     │
└──────────────────────┬──────────────────────────────┘
                       │ HTTP (WORKER_URL)
                       │ Default: http://localhost:3001
                       ▼
┌─────────────────────────────────────────────────────┐
│               Single Worker Process                  │
│              (apps/worker/index.ts)                  │
│                                                      │
│  ┌────────────────────────────────────────────┐   │
│  │      Session Manager (in-memory Map)       │   │
│  │                                            │   │
│  │  accountId-1 → SessionInfo (Tenant A)     │   │
│  │  accountId-2 → SessionInfo (Tenant A)     │   │
│  │  accountId-3 → SessionInfo (Tenant B)     │   │
│  │  accountId-4 → SessionInfo (Tenant C)     │   │
│  │  ...                                       │   │
│  └────────────────────────────────────────────┘   │
│                                                      │
│  Each session = Chromium instance + WhatsApp Web    │
└─────────────────────────────────────────────────────┘
                       │
                       ▼
               ┌──────────────┐
               │  PostgreSQL  │
               └──────────────┘
```

### Resource Requirements

**Per Session:**
- Memory: ~150-300 MB (Chromium + WhatsApp Web)
- CPU: ~5-10% (idle), ~20-30% (active messaging)
- Disk: ~50-100 MB (cache + session data)

**Single Worker Capacity:**
- Recommended: Up to 50 concurrent sessions
- Maximum: ~100 sessions (depends on hardware)
- Beyond this, consider vertical scaling (more powerful server)

**Example Worker Sizing:**

| Sessions | Memory | CPU Cores | Disk |
|----------|--------|-----------|------|
| 10       | 3 GB   | 2         | 1 GB |
| 50       | 15 GB  | 4         | 5 GB |
| 100      | 30 GB  | 8         | 10 GB|

### Session Isolation

Each WhatsApp session is isolated:

1. **Memory Isolation**: Separate entry in `sessions` Map
2. **Process Isolation**: Separate Chromium instance (Puppeteer)
3. **Filesystem Isolation**: Separate cache directory per account
   ```
   {CACHE_PATH}/session-{accountId}/
   ```
4. **Database Isolation**: Tenant-scoped queries

### High Availability

**Session Recovery on Worker Restart:**

The worker automatically recovers all active sessions on startup:

```typescript
// In apps/worker/index.ts
async function initializeWhatsAppWeb() {
  startWhatsAppWebServer();
  startMessageListener();
  await sessionManager.recoverSessions(); // ← Recovers all sessions
}
```

Recovery process:
1. Query all sessions with status = 'ready' from database
2. For each session, create WhatsApp client with LocalAuth
3. LocalAuth loads cached session from filesystem
4. Reconnects to WhatsApp Web automatically
5. Updates session status in database

**Success Rate**: ~90-95% (depends on WhatsApp session validity)

**Backup Strategy:**

Since sessions persist in filesystem cache:

```bash
# Backup WhatsApp cache directory
tar -czf whatsapp-backup-$(date +%Y%m%d).tar.gz $WHATSAPP_CACHE_PATH

# Automated daily backup (cron)
0 2 * * * /scripts/backup-whatsapp-cache.sh
```

### Limitations

**Current Single-Worker Limitations:**

1. **Single Point of Failure**: If worker crashes, all sessions disconnected (auto-recover on restart)
2. **Resource Contention**: All sessions share same server resources
3. **No Load Distribution**: Can't distribute sessions across multiple servers
4. **Vertical Scaling Only**: Must upgrade server hardware to handle more sessions

**Workarounds:**

- Monitor worker health and auto-restart on failure
- Set resource limits to prevent memory exhaustion
- Use process managers (PM2, systemd) for auto-recovery
- Regular restarts during off-peak hours to free memory

---

## Storage & Media

### Media Storage Architecture

**Location**: `./storage/{tenantId}/whatsapp/{year}/{month}/{filename}`

**Example:**
```
./storage/
├── 889425c6-377b-49ce-b71a-2808c20ce9ec/  # tenantId
│   ├── documents/
│   └── whatsapp/                           # WhatsApp media
│       ├── 2024/
│       │   ├── 10/
│       │   │   ├── msgid-uuid.jpg
│       │   │   ├── msgid-uuid.mp4
│       │   │   └── msgid-uuid.pdf
│       │   └── 11/
│       └── 2025/
```

### Media Processing Flow

```typescript
// 1. Download media from WhatsApp
const media = await message.downloadMedia();

// 2. Generate organized path
const year = new Date().getFullYear();
const month = String(new Date().getMonth() + 1).padStart(2, '0');
const filename = `${messageId}-${uuid()}.${ext}`;
const relativePath = `${tenantId}/whatsapp/${year}/${month}/${filename}`;

// 3. Save to filesystem
const fullPath = `./storage/${relativePath}`;
await fs.mkdir(path.dirname(fullPath), { recursive: true });
await fs.writeFile(fullPath, Buffer.from(media.data, 'base64'));

// 4. Save path to database
await db.insert(whatsappMessages).values({
  mediaUrl: `/storage/${relativePath}`,
  mediaMimeType: media.mimetype,
  mediaId: filename,
});
```

### Media Retrieval

**API Endpoint**: `GET /api/whatsapp/media/:messageId/url`

**Flow:**
1. Verify tenant access
2. Check if mediaUrl is local (`/storage/...`)
3. If local → return relative path (static middleware serves it)
4. If GCS → generate signed URL
5. If no media → download from WhatsApp API & cache

### Storage Considerations

**Retention Policy:**
- Media files stored indefinitely (unless explicitly deleted)
- Implement periodic cleanup:
  ```sql
  -- Delete media for deleted messages
  DELETE FROM whatsapp_messages
  WHERE deleted_at < NOW() - INTERVAL '90 days';
  ```

**Migration to Cloud Storage:**
```typescript
// Optional: Migrate to GCS/S3
async function migrateToCloud() {
  const messages = await db.query.whatsappMessages.findMany({
    where: and(
      isNotNull(whatsappMessages.mediaUrl),
      like(whatsappMessages.mediaUrl, '/storage/%')
    ),
  });
  
  for (const message of messages) {
    // Upload to GCS
    const gcsPath = await uploadToGCS(message.mediaUrl);
    
    // Update database
    await db.update(whatsappMessages)
      .set({ mediaUrl: gcsPath })
      .where(eq(whatsappMessages.id, message.id));
  }
}
```

---

## API Endpoints

### Main API Server (`apps/api/routes/whatsapp-web.ts`)

#### Connection Management

**POST /api/whatsapp-web/connect**
```typescript
Request: {
  displayName: string;
}
Response: {
  success: boolean;
  accountId: string;
  message: string;
}
```

**GET /api/whatsapp-web/qr-stream/:accountId**
- Server-Sent Events (SSE)
- Streams QR codes in real-time
- Events: `connected`, `qr`, `authenticated`, `error`

**POST /api/whatsapp-web/disconnect/:accountId**
```typescript
Response: {
  success: boolean;
  message: string;
}
```

**POST /api/whatsapp-web/reconnect/:accountId**
- Used when session becomes disconnected
- Generates new QR code

**GET /api/whatsapp-web/status/:accountId**
```typescript
Response: {
  accountId: string;
  status: 'connecting' | 'ready' | 'disconnected' | 'error';
  phoneNumber?: string;
  connectedAt?: Date;
  errorMessage?: string;
}
```

#### Sync

**POST /api/whatsapp-web/sync/:accountId**
```typescript
Request: {
  phoneNumbers: string[];     // ["351912345678", ...]
  messagesPerChat?: number;   // Default: 50
}
Response: {
  success: boolean;
  syncedContacts: number;
  totalMessages: number;
  syncedAt: Date;
}
```

#### Messaging

**POST /api/whatsapp-web/reply**
```typescript
Request: {
  accountId: string;
  chatId: string;
  text: string;
  quotedMessageId?: string;
}
```

### Worker API (`apps/worker/whatsapp-web/api.ts`)

**POST /whatsapp-web/send-text**
```typescript
Request: {
  accountId: string;
  to: string;          // phone number or chatId
  text: string;
}
```

**POST /whatsapp-web/send-media**
```typescript
Request: {
  accountId: string;
  to: string;
  mediaUrl: string;
  caption?: string;
  filename?: string;
}
```

**POST /whatsapp-web/send-location**
```typescript
Request: {
  accountId: string;
  to: string;
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
}
```

**POST /whatsapp-web/send-poll**
```typescript
Request: {
  accountId: string;
  chatId: string;
  question: string;
  options: string[];
  allowMultipleAnswers?: boolean;
}
```

---

## Deployment

### Production Checklist

- [ ] Set `WHATSAPP_CACHE_PATH` to persistent volume
- [ ] Configure PostgreSQL connection pooling
- [ ] Set up worker health monitoring
- [ ] Implement backup strategy for cache directory
- [ ] Configure log aggregation (e.g., ELK, Datadog)
- [ ] Set resource limits (memory, CPU)
- [ ] Enable HTTPS for worker-API communication
- [ ] Set up alerts for session disconnections
- [ ] Test session recovery after worker restart
- [ ] Configure process manager (PM2, systemd) for auto-restart

### Scalability Recommendation

**For Production at Scale:**

The current single-worker architecture works well for small to medium deployments (up to ~100 concurrent sessions). However, for larger deployments with hundreds of tenants, consider implementing a **dedicated worker per tenant** architecture.

**Benefits of Worker-Per-Tenant:**
- **Better isolation**: Each tenant's WhatsApp sessions run in a dedicated worker process
- **Improved fault tolerance**: One tenant's worker failure doesn't affect other tenants
- **Resource control**: Allocate specific resources (CPU, memory) per tenant
- **Independent scaling**: Scale individual tenants based on their usage patterns
- **Easier debugging**: Tenant-specific logs and metrics in isolated processes

**Implementation Approach:**
1. Deploy multiple worker instances (one per tenant or per group of tenants)
2. Maintain a tenant-to-worker mapping in database
3. Route API requests to the appropriate worker based on tenant ID
4. Implement worker health monitoring and automatic failover

This architecture provides better isolation and scalability for production environments with many active tenants.

### Monitoring

**Health Check Endpoint:**
```typescript
app.get('/health', (req, res) => {
  const sessions = sessionManager.getAllSessions();
  const activeCount = sessions.filter(s => s.status === 'ready').length;
  
  res.json({
    status: 'ok',
    activeSessions: activeCount,
    totalSessions: sessions.length,
    memory: process.memoryUsage(),
    uptime: process.uptime(),
  });
});
```

**Metrics Endpoint:**
```typescript
app.get('/whatsapp-web/metrics', (req, res) => {
  const sessions = sessionManager.getAllSessions();
  const memoryUsage = process.memoryUsage();
  
  res.json({
    sessions: {
      total: sessions.length,
      active: sessions.filter(s => s.status === 'ready').length,
      connecting: sessions.filter(s => s.status === 'connecting').length,
      error: sessions.filter(s => s.status === 'error').length,
    },
    memory: {
      heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024) + ' MB',
      heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024) + ' MB',
      rss: Math.round(memoryUsage.rss / 1024 / 1024) + ' MB',
    },
    uptime: Math.round(process.uptime()) + ' seconds',
  });
});
```

---

## Troubleshooting

### Common Issues

#### 1. Session Won't Connect
**Symptom:** QR code not appearing or stuck on "connecting"

**Solutions:**
- Check Chromium installation: `which chromium`
- Verify cache directory permissions: `ls -la $WHATSAPP_CACHE_PATH`
- Check worker logs for Puppeteer errors
- Ensure port 3001 is accessible
- Try force-recover: `POST /whatsapp-web/force-recover/:accountId`

#### 2. Session Lost After Restart
**Symptom:** Need to scan QR again after worker restart

**Causes:**
- `WHATSAPP_CACHE_PATH` not set → cache lost
- Cache directory on temp filesystem
- LocalAuth directory deleted

**Solutions:**
- Set `WHATSAPP_CACHE_PATH` to persistent volume
- Verify cache directory exists and is writable
- Check disk space on cache volume

#### 3. High Memory Usage
**Symptom:** Worker consuming >10GB RAM with few sessions

**Solutions:**
- Limit concurrent sessions per worker (max 50)
- Implement session cleanup for disconnected sessions
- Restart worker periodically (e.g., daily during off-peak)
- Use `--max-old-space-size` Node.js flag: `node --max-old-space-size=4096`

#### 4. Messages Not Syncing
**Symptom:** New messages not appearing in database

**Causes:**
- Message listener not started
- Database connection lost
- Worker not receiving events from WhatsApp

**Debug:**
```typescript
// Check session status
const status = await sessionManager.getSessionStatus(accountId);
console.log('Session status:', status);

// Check event listeners
console.log('Message listeners:', sessionManager.listenerCount('message'));

// Test database connection
await db.query.whatsappMessages.findFirst();
```

---

## Security Considerations

1. **Session Security**
   - LocalAuth stores encrypted WhatsApp session tokens
   - Never expose `WHATSAPP_CACHE_PATH` via HTTP
   - Restrict filesystem access to worker process only

2. **API Security**
   - All endpoints require authentication (`requireAuth` middleware)
   - Tenant isolation enforced in database queries
   - Rate limiting on messaging endpoints

3. **Media Security**
   - Tenant-scoped storage paths
   - Static file serving restricted to authenticated users
   - Consider signed URLs for sensitive media

4. **Network Security**
   - Use HTTPS for API ↔ Worker communication in production
   - Firewall rules to restrict worker access
   - WhatsApp Web.js uses WhatsApp's E2E encryption

---

## Future Enhancements

- [ ] Worker-per-tenant architecture (see [Scalability Recommendation](#scalability-recommendation))
- [ ] Distributed session manager with Redis
- [ ] Webhook support for real-time notifications
- [ ] Message retry queue for failed sends
- [ ] WhatsApp Business API support (alongside Web)
- [ ] Automatic session health checks
- [ ] Analytics dashboard for message metrics
- [ ] WhatsApp Channels support (broadcast lists)
- [ ] Message templates for bulk sending

---

## References

- **whatsapp-web.js**: https://github.com/pedroslopez/whatsapp-web.js
- **Puppeteer**: https://pptr.dev/
- **LocalAuth Strategy**: https://wwebjs.dev/guide/authentication.html
- **WhatsApp Web Protocol**: Unofficial, reverse-engineered

---

**Document Version**: 1.0  
**Last Updated**: December 8, 2024  
**Maintainer**: AssistOS Engineering Team
