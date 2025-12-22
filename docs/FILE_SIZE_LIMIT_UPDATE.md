# File Size Limit Updated to 50MB

## Changes Made

All file upload size limits have been updated from 10MB to **50MB**.

### Files Updated:

1. ✅ **`apps/api/middleware/upload.ts`**
   - Changed: `MAX_FILE_SIZE = 10 * 1024 * 1024` → `50 * 1024 * 1024`
   - Used by: General file uploads (`/api/files/upload`)

2. ✅ **`apps/api/routes/conversations.ts`**
   - Changed: `limits: { fileSize: 10 * 1024 * 1024 }` → `50 * 1024 * 1024`
   - Used by: Chat message attachments

3. ✅ **`apps/api/routes/supplier-invoice.ts`**
   - Changed: `limits: { fileSize: 10 * 1024 * 1024 }` → `50 * 1024 * 1024`
   - Used by: Supplier invoice uploads

4. ✅ **`apps/api/routes/compras.ts`**
   - Changed: `limits: { fileSize: 10 * 1024 * 1024 }` → `50 * 1024 * 1024`
   - Used by: Purchase module uploads

5. ✅ **`apps/api/routes/public-forms.ts`**
   - Changed: `MAX_FILE_SIZE = 5 * 1024 * 1024` → `50 * 1024 * 1024`
   - Used by: Public form submissions

6. ✅ **`packages/modules/compras/services/invoice-ocr.service.ts`**
   - Changed: `MAX_FILE_SIZE = 10 * 1024 * 1024` → `50 * 1024 * 1024`
   - Used by: Legacy OCR service

### Already at 50MB:
- ✅ **`client/src/components/documents/DocumentUpload.tsx`** - Already set to 50MB
- ✅ **`packages/document-management/routes/documents.ts`** - Already set to 50MB

---

## Impact

### What This Means:
- Users can now upload files up to **50MB** across all endpoints
- Applies to: PDFs, images, documents, Excel files, etc.
- Works with: Supabase Storage, Local Storage, and GCS

### Security Note:
- File size validation happens at middleware level
- Invalid file types are still rejected
- Storage backends (Supabase) have their own limits that may apply

---

## Testing

To verify the change works:

```bash
# Test with a large file (e.g., 30MB PDF)
curl -X POST http://localhost:3000/api/files/upload \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "files=@large-file.pdf"

# Should succeed if file is < 50MB
# Should fail with error if file is > 50MB
```

---

## Configuration

If you need to adjust limits in the future, update these constants:

**Backend (Node.js/Express)**:
- `apps/api/middleware/upload.ts` → `MAX_FILE_SIZE`
- Individual route files with multer config

**Frontend (React)**:
- `client/src/components/documents/DocumentUpload.tsx` → `MAX_FILE_SIZE`

---

**Updated**: December 2, 2025  
**New Limit**: 50MB (was 10MB)  
**Status**: ✅ Applied Globally

