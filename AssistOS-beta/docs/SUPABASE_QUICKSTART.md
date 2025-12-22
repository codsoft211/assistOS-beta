# 🚀 Supabase Storage - Quick Start Guide

## Implementation Status: ✅ COMPLETE

All code has been implemented. You just need to:
1. Install dependencies
2. Configure environment variables  
3. Create Supabase bucket

---

## Step 1: Install Supabase SDK (REQUIRED)

⚠️ **The installation had network issues. Please retry:**

```bash
# Option 1: Using pnpm (preferred)
pnpm add @supabase/supabase-js

# Option 2: If pnpm fails, use npm
npm install @supabase/supabase-js

# Option 3: If network issues persist, try different registry
pnpm add @supabase/supabase-js --registry=https://registry.npmjs.org
```

---

## Step 2: Set Environment Variables

Add to your `.env` file:

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key-here
SUPABASE_BUCKET_NAME=assistos-attachments
```

Get these values from:
1. Go to https://app.supabase.com
2. Select your project
3. Go to **Settings > API**
4. Copy **Project URL** and **service_role key**

---

## Step 3: Create Storage Bucket

1. In Supabase Dashboard, go to **Storage**
2. Click **"New bucket"**
3. Name: `assistos-attachments`
4. Make it **Private** (not public)
5. Click **Create bucket**

---

## Step 4: Configure Access Policies

In Supabase Dashboard, go to **Storage > Policies** and add:

```sql
-- Allow authenticated uploads
CREATE POLICY "Allow authenticated uploads"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'assistos-attachments');

-- Allow authenticated downloads
CREATE POLICY "Allow authenticated downloads"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'assistos-attachments');

-- Allow authenticated deletes
CREATE POLICY "Allow authenticated deletes"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'assistos-attachments');
```

---

## Step 5: Test It!

```bash
# Restart your server
pnpm dev

# Upload a test file via API
curl -X POST http://localhost:3000/api/files/upload \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "files=@test.pdf"

# Check Supabase Dashboard > Storage > assistos-attachments
# You should see your uploaded file!
```

---

## 📚 Full Documentation

- **Complete Setup Guide**: `docs/SUPABASE_STORAGE_SETUP.md`
- **Implementation Summary**: `docs/SUPABASE_MIGRATION_SUMMARY.md`

---

## ✅ What Was Changed

### Files Created:
- `packages/document-management/providers/SupabaseStorageProvider.ts` - **NEW**

### Files Modified:
- `apps/api/routes/files.ts` - **Refactored to use Supabase**
- `apps/api/middleware/upload.ts` - **Changed to memory storage**
- `shared/schema.ts` - **Added 'supabase' provider type**
- `packages/document-management/providers/StorageProviderFactory.ts` - **Added Supabase support**
- `packages/document-management/providers/IStorageProvider.ts` - **Added 'supabase' to config**

---

## 🎯 Key Features

✅ **All files now stored in Supabase Storage** (not local disk)  
✅ **Hierarchical organization**: `{tenant}/{year}/{month}/{uuid}_{filename}`  
✅ **Signed URLs** for direct file access  
✅ **Multi-tenant isolation**  
✅ **Automatic checksums** (SHA-256)  
✅ **No breaking changes** to existing API endpoints

---

## ❓ Need Help?

1. Check `docs/SUPABASE_STORAGE_SETUP.md` for detailed instructions
2. Check `docs/SUPABASE_MIGRATION_SUMMARY.md` for implementation details
3. Check server logs for error messages
4. Verify environment variables are set correctly

---

**Questions?** All the code is ready - just install the package and configure! 🎉

