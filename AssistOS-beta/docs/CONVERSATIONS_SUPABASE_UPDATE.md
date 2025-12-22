# Conversations Route Updated for Supabase Storage

## ✅ Implementation Complete

The conversations route has been updated to use **Supabase Storage** instead of the local `attached_assets/` folder for chat message attachments.

---

## 🔄 What Changed

### File: `apps/api/routes/conversations.ts`

#### 1. **Updated Imports**
```typescript
// Added
import crypto from "crypto";
import { SupabaseStorageProvider } from "../../../packages/document-management/providers/SupabaseStorageProvider";
```

#### 2. **Updated Multer Configuration**
```typescript
// Before
const messageUpload = multer({
  dest: path.join(process.cwd(), "uploads", "temp"),  // ❌ Disk storage
  limits: { fileSize: 50 * 1024 * 1024 },
});

// After
const messageUpload = multer({
  storage: multer.memoryStorage(),  // ✅ Memory storage for Supabase
  limits: { fileSize: 50 * 1024 * 1024 },
});
```

#### 3. **Replaced File Upload Logic**

**Before** (Lines 930-993):
- ❌ Stored files in `attached_assets/documents/{tenantId}/`
- ❌ Used filesystem operations (`fs.mkdir`, `fs.writeFile`)
- ❌ Created local directory structure
- ❌ Stored local paths in database

**After**:
- ✅ Uploads to **Supabase Storage**
- ✅ Hierarchical path: `{tenantId}/{year}/{month}/{uuid}_{filename}`
- ✅ No local filesystem operations
- ✅ Stores Supabase paths in database
- ✅ Sets `sourceSystem: 'supabase'` for proper routing

---

## 📊 File Storage Flow

### Chat Message with Attachment:

```
1. User uploads file in chat
   ↓
2. Frontend sends to POST /api/conversations/:id/messages
   ↓
3. Multer receives file in memory (buffer)
   ↓
4. Calculate SHA-256 checksum
   ↓
5. Generate Supabase path: tenant/2025/12/uuid_filename.pdf
   ↓
6. Upload to Supabase Storage
   ↓
7. Save metadata to file_attachments table
   ↓
8. Link attachment ID to message.attachment_ids[]
   ↓
9. AI processes message (can read file from Supabase via FileStorageService)
```

---

## 🗄️ Database Storage

### `file_attachments` Table

Files uploaded via chat are stored with:

```typescript
{
  id: "uuid",
  tenantId: "tenant-123",
  filename: "uuid_document.pdf",
  originalName: "document.pdf",
  path: "tenant-123/2025/12/uuid_document.pdf",  // Supabase path
  mimeType: "application/pdf",
  size: 4395329,
  checksum: "sha256-hash",
  sourceSystem: "supabase",  // ✅ Indicates Supabase storage
  entityType: "message",
  uploadedBy: "user-id",
}
```

### `messages` Table

Messages reference attachments via ID array:

```typescript
{
  id: "message-uuid",
  conversationId: "conv-123",
  content: "Analyze this document",
  attachmentIds: ["attachment-uuid-1", "attachment-uuid-2"],  // ✅ Just IDs
  role: "user",
  // ...
}
```

**✅ No schema changes needed** - The array just stores IDs, not paths!

---

## 🎯 Benefits

### Before (Local Storage):
- ❌ Files stored in `attached_assets/` folder
- ❌ Disk space limitations
- ❌ No built-in CDN
- ❌ Manual backup required
- ❌ Difficult to scale

### After (Supabase Storage):
- ✅ Cloud storage (unlimited scalability)
- ✅ Built-in CDN for fast delivery
- ✅ Automatic backups
- ✅ Multi-region availability
- ✅ Signed URLs for secure access

---

## 🔐 Security

### File Isolation:
- Files organized by tenant: `{tenantId}/{year}/{month}/`
- Prevents cross-tenant access
- Easy to apply retention policies

### Access Control:
- Supabase Row-Level Security (RLS) policies
- Signed URLs with expiration
- Server-side validation

---

## 🧪 Testing

### Test Chat Message Upload:

1. **Start server**:
   ```bash
   pnpm dev
   ```

2. **Send message with file in chat UI**:
   - Attach a PDF or image
   - Send message
   - Check console logs

3. **Verify in Supabase Dashboard**:
   - Go to Storage → assistos-attachments
   - Should see file in: `{tenant}/{year}/{month}/{uuid}_{filename}`

4. **Test AI analysis**:
   - Ask: "Analyze this document"
   - AI should be able to read the file from Supabase
   - Uses `FileStorageService.getFileBuffer()` automatically

---

## ⚠️ Migration Notes

### Existing Chat Attachments:
- Old messages with local files will still work
- `FileStorageService` handles both local and Supabase files
- No migration required for old attachments

### New Attachments:
- Automatically go to Supabase Storage
- `sourceSystem: 'supabase'` set automatically
- Files organized hierarchically

---

## 🚨 Environment Variables Required

Make sure these are set in `.env`:

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
SUPABASE_BUCKET_NAME=assistos-attachments
```

**Without these**, file uploads will fail with:
```
Error: SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables are required
```

---

## 📋 Summary

### Changes Made:
1. ✅ Added crypto and SupabaseStorageProvider imports
2. ✅ Changed multer to memory storage
3. ✅ Replaced local filesystem logic with Supabase upload
4. ✅ Updated database values (path, sourceSystem, filename)
5. ✅ Improved error handling

### Database Tables:
- ✅ **NO CHANGES NEEDED**
- ✅ `file_attachments.path` - Stores Supabase paths
- ✅ `file_attachments.sourceSystem` - Set to 'supabase'
- ✅ `messages.attachment_ids` - Stores IDs (unchanged)

### Status:
- ✅ Code updated
- ✅ No schema changes
- ✅ Backward compatible
- ✅ Ready for testing

---

**Implementation Date**: December 2, 2025  
**Route**: POST /api/conversations/:id/messages  
**Status**: ✅ COMPLETE

