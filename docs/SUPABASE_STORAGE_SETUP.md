# Supabase Storage Setup Guide

This guide explains how to configure and use Supabase Storage for file attachments in AssistOS.

## Overview

AssistOS now uses **Supabase Storage** as the primary file storage backend, replacing local filesystem storage. This provides:

-   ✅ **Scalable cloud storage** - No more local disk space issues
-   ✅ **Built-in CDN** - Fast file delivery worldwide
-   ✅ **Signed URLs** - Secure temporary access to files
-   ✅ **Multi-tenant isolation** - Files organized by tenant
-   ✅ **Automatic backups** - Supabase handles data durability

---

## Prerequisites

1.  **Supabase Account** - Sign up at [supabase.com](https://supabase.com)
2.  **Supabase Project** - Create a new project or use existing one
3.  **Storage Bucket** - Create a bucket for file attachments

---

## Step 1: Create Supabase Storage Bucket

### 1.1 Access Storage Dashboard

1.  Log in to your [Supabase Dashboard](https://app.supabase.com)
2.  Select your project
3.  Navigate to **Storage** in the left sidebar
4.  Click **"New bucket"**

### 1.2 Configure Bucket

Create a bucket with these settings:

-   **Name**: `assistos-attachments` (or your preferred name)
-   **Public**: **No** (keep files private)
-   **File size limit**: `10 MB` (adjustable)
-   **Allowed MIME types**: Leave empty or specify allowed types

### 1.3 Set Storage Policies (RLS)

Go to **Storage > Policies** and create these policies:

#### Policy 1: Allow Authenticated Uploads

```sql
CREATE POLICY "Allow authenticated uploads"ON storage.objectsFOR INSERTTO authenticatedWITH CHECK (  bucket_id = 'assistos-attachments');
```

#### Policy 2: Allow Authenticated Downloads

```sql
CREATE POLICY "Allow authenticated downloads"ON storage.objectsFOR SELECTTO authenticatedUSING (  bucket_id = 'assistos-attachments');
```

#### Policy 3: Allow Authenticated Deletes

```sql
CREATE POLICY "Allow authenticated deletes"ON storage.objectsFOR DELETETO authenticatedUSING (  bucket_id = 'assistos-attachments');
```

> **Note**: These are basic policies. For production, you should add tenant-based access control.

---

## Step 2: Get Supabase Credentials

### 2.1 Find Your Project URL

1.  Go to **Project Settings > API**
2.  Copy the **Project URL** (e.g., `https://xxxxx.supabase.co`)

### 2.2 Get Service Role Key

1.  In the same page (**Project Settings > API**)
2.  Find the **`service_role` key** under "Project API keys"
3.  **⚠️ IMPORTANT**: This is a secret key - never expose it in frontend code!

---

## Step 3: Configure Environment Variables

Add these variables to your `.env` file:

```bash
# Supabase Storage ConfigurationSUPABASE_URL=https://your-project.supabase.coSUPABASE_SERVICE_KEY=your-service-role-key-hereSUPABASE_BUCKET_NAME=assistos-attachments# Optional: Separate buckets for different environments# SUPABASE_BUCKET_PUBLIC=assistos-public# SUPABASE_BUCKET_PRIVATE=assistos-private
```

### Environment Variables Explained

Variable

Required

Description

Example

`SUPABASE_URL`

✅ Yes

Your Supabase project URL

`https://abc123.supabase.co`

`SUPABASE_SERVICE_KEY`

✅ Yes

Service role key (secret!)

`eyJhbGc...`

`SUPABASE_BUCKET_NAME`

Optional

Bucket name (default: `assistos-attachments`)

`my-files`

---

## Step 4: Verify Setup

### 4.1 Test File Upload

After configuring environment variables, restart your server and test a file upload:

```bash
# Via APIcurl -X POST http://localhost:3000/api/files/upload   -H "Authorization: Bearer YOUR_TOKEN"   -F "files=@test.pdf"
```

### 4.2 Check Supabase Dashboard

1.  Go to **Storage > assistos-attachments** in Supabase Dashboard
2.  You should see uploaded files organized by:
    -   `{tenantId}/{year}/{month}/{uuid}_{filename}`

Example structure:

```
assistos-attachments/├── tenant-123/│   ├── 2025/│   │   ├── 01/│   │   │   ├── uuid1_invoice.pdf│   │   │   └── uuid2_contract.pdf│   │   └── 02/│   │       └── uuid3_receipt.jpg└── tenant-456/    └── 2025/        └── 01/            └── uuid4_document.docx
```

---

## File Organization Structure

Files are automatically organized using this hierarchy:

```
{bucket}/  {tenantId}/    {year}/      {month}/        {uuid}_{original-filename}
```

### Benefits:

-   **Tenant isolation** - Each tenant's files in separate folder
-   **Time-based organization** - Easy to find files by date
-   **Unique identifiers** - Prevents filename conflicts
-   **Retention policies** - Easy to implement data lifecycle rules

---

## API Endpoints

### Upload Files

```http
POST /api/files/uploadContent-Type: multipart/form-datafiles: File[]entityType?: stringentityId?: string
```

### Download File

```http
GET /api/files/:id/download
```

### View File (Inline)

```http
GET /api/files/:id/view
```

### Get Signed URL

```http
GET /api/files/:id/signed-url?expiresIn=3600
```

Response:

```json
{  "signedUrl": "https://xxxxx.supabase.co/storage/v1/object/sign/...",  "expiresIn": 3600,  "fileName": "document.pdf",  "mimeType": "application/pdf",  "size": 123456}
```

### Delete File

```http
DELETE /api/files/:id
```

### List Files

```http
GET /api/files?entityType=invoice&entityId=123
```

---

## Migration from Local Storage

If you have existing files in `uploads/` or `attached_assets/` folders, you need to migrate them to Supabase:

### Migration Script

Create a migration script (`scripts/migrate-to-supabase.ts`):

```typescript
import { db } from '../apps/api/db';import { fileAttachments } from '../shared/schema';import { SupabaseStorageProvider } from '../packages/document-management/providers/SupabaseStorageProvider';import { promises as fs } from 'fs';import path from 'path';async function migrateFiles() {  // Initialize Supabase provider  const supabase = new SupabaseStorageProvider({    type: 'supabase',    bucketName: process.env.SUPABASE_BUCKET_NAME!,    credentials: {      url: process.env.SUPABASE_URL!,      key: process.env.SUPABASE_SERVICE_KEY!,    },  });  // Get all files from database  const files = await db.select().from(fileAttachments);  console.log(`Found ${files.length} files to migrate`);  for (const file of files) {    try {      // Check if file exists locally      const localPath = file.path;      const fullPath = path.join(process.cwd(), localPath);      // Read file buffer      const buffer = await fs.readFile(fullPath);      // Generate new Supabase path      const now = new Date();      const year = now.getFullYear();      const month = String(now.getMonth() + 1).padStart(2, '0');      const supabasePath = `${file.tenantId}/${year}/${month}/${file.filename}`;      // Upload to Supabase      await supabase.upload(buffer, supabasePath, {        contentType: file.mimeType,      });      // Update database record      await db.update(fileAttachments)        .set({           path: supabasePath,          sourceSystem: 'supabase',        })        .where(eq(fileAttachments.id, file.id));      console.log(`✅ Migrated: ${file.originalName}`);    } catch (error) {      console.error(`❌ Failed to migrate ${file.originalName}:`, error);    }  }  console.log('Migration complete!');}migrateFiles();
```

Run migration:

```bash
pnpm tsx scripts/migrate-to-supabase.ts
```

---

## Security Best Practices

### 1. Never Expose Service Key

-   ✅ Use `SUPABASE_SERVICE_KEY` only in backend
-   ❌ Never send service key to frontend
-   ✅ Use signed URLs for frontend file access

### 2. Implement Row-Level Security (RLS)

```sql
-- Tenant-based access controlCREATE POLICY "Users can only access their tenant files"ON storage.objectsFOR SELECTTO authenticatedUSING (  bucket_id = 'assistos-attachments'  AND (storage.foldername(name))[1] = auth.jwt() ->> 'tenant_id');
```

### 3. File Size Limits

```typescript
// In middleware/upload.tsconst MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MBexport const upload = multer({  storage: multer.memoryStorage(),  limits: {    fileSize: MAX_FILE_SIZE,  },});
```

### 4. Allowed MIME Types

```typescript
const allowedMimeTypes = [  'application/pdf',  'image/jpeg',  'image/png',  'application/msword',  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',];
```

---

## Troubleshooting

### Error: "SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables are required"

**Solution**: Add environment variables to `.env` file and restart server.

### Error: "Failed to upload file: Bucket not found"

**Solution**:

1.  Check bucket name in Supabase Dashboard
2.  Verify `SUPABASE_BUCKET_NAME` matches exactly
3.  Ensure bucket is created in correct project

### Error: "new row violates row-level security policy"

**Solution**:

1.  Check Storage Policies in Supabase Dashboard
2.  Ensure policies allow authenticated users to upload
3.  Verify JWT token is valid

### Files not appearing in Supabase Dashboard

**Solution**:

1.  Check server logs for upload errors
2.  Verify network connectivity to Supabase
3.  Ensure file path is correct (no leading/trailing slashes)

---

## Performance Optimization

### 1. Use Signed URLs for Frontend

Instead of proxying files through your server, generate signed URLs:

```typescript
// Backend: Generate signed URLconst signedUrl = await supabaseProvider.getSignedUrl(filePath, {  expiresIn: 3600,  action: 'read',});// Frontend: Use signed URL directly<img src={signedUrl} alt="Document" />
```

### 2. Enable CDN Caching

Supabase Storage automatically uses a CDN. For optimal caching:

```typescript
await supabaseProvider.upload(buffer, path, {  cacheControl: '3600', // 1 hour cache});
```

### 3. Batch Operations

When uploading multiple files, use Promise.all():

```typescript
const uploadPromises = files.map(file =>   supabaseProvider.upload(file.buffer, file.path));const results = await Promise.all(uploadPromises);
```

---

## Monitoring & Costs

### Storage Usage

Monitor usage in **Supabase Dashboard > Settings > Usage**

### Free Tier Limits (as of 2025)

-   **Storage**: 1 GB
-   **Bandwidth**: 2 GB/month
-   **API requests**: Unlimited

### Paid Plans

-   **Pro Plan**: $25/month
    -   100 GB storage
    -   200 GB bandwidth
-   **Team Plan**: Custom pricing

---

## Additional Resources

-   [Supabase Storage Documentation](https://supabase.com/docs/guides/storage)
-   [Supabase Storage API Reference](https://supabase.com/docs/reference/javascript/storage)
-   [Row Level Security Guide](https://supabase.com/docs/guides/auth/row-level-security)

---

## Support

If you encounter issues:

1.  Check server logs for detailed error messages
2.  Verify environment variables are set correctly
3.  Test Supabase connection using the Supabase Dashboard
4.  Check [Supabase Status Page](https://status.supabase.com)

For AssistOS-specific issues, contact the development team.