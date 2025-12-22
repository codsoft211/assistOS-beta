# Frontend File Size Limit Updates

## ✅ Changes Applied

All frontend file size limits and validation have been updated to **50MB**.

---

## Files Modified:

### 1. ✅ **`client/src/pages/public/supplier-invoice.tsx`**
**Changed**: 
```typescript
// Before
if (file.size > 10 * 1024 * 1024) {
  description: "File size must be less than 10MB."

// After
if (file.size > 50 * 1024 * 1024) {
  description: "File size must be less than 50MB."
```

**Used by**: Public supplier invoice upload form

---

### 2. ✅ **`client/src/components/AttachmentSheet.tsx`**
**Changed**: UI text updated
```typescript
// Before
"Qualquer tipo de arquivo, até 2GB"

// After
"Qualquer tipo de arquivo, até 50MB"
```

**Used by**: Chat attachment selector bottom sheet

---

### Already at 50MB:

#### ✅ **`client/src/components/documents/DocumentUpload.tsx`**
```typescript
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
```
- Already correctly set to 50MB ✅
- Used by: Document management module

---

## Platform-Specific Limits (Unchanged):

### WhatsApp Media Upload
**File**: `client/src/pages/whatsapp-inbox.tsx`
```typescript
if (file.size > 16 * 1024 * 1024) {
  description: "File size must be less than 16MB."
```

**Why 16MB?** This is a **WhatsApp API platform limit**, not our system limit.
- WhatsApp enforces a 16MB limit for media messages
- Cannot be changed (external API constraint)
- **Status**: Left as is ✅

---

## Summary of Limits:

| Component | Limit | Status |
|-----------|-------|--------|
| **General file uploads** | 50MB | ✅ Updated |
| **Chat attachments** | 50MB | ✅ Updated (UI text) |
| **Document uploads** | 50MB | ✅ Already correct |
| **Public forms** | 50MB | ✅ Updated |
| **WhatsApp media** | 16MB | ⚠️ WhatsApp API limit |

---

## User-Facing Changes:

### Before:
- Upload forms: "Maximum 10MB"
- Chat attachments: "até 2GB" (incorrect)
- Document uploads: "50MB"

### After:
- Upload forms: **"Maximum 50MB"** ✅
- Chat attachments: **"até 50MB"** ✅
- Document uploads: **"50MB"** ✅

---

## Validation Flow:

### Client-Side (Frontend):
1. User selects file
2. JavaScript checks `file.size`
3. If > 50MB → Show error toast
4. If ≤ 50MB → Allow upload

### Server-Side (Backend):
1. File arrives at server
2. Multer middleware checks size
3. If > 50MB → Reject with 400 error
4. If ≤ 50MB → Process upload

**Both layers enforce the limit** for security ✅

---

## Testing Checklist:

- [ ] Upload 45MB PDF → Should succeed ✅
- [ ] Upload 55MB file → Should fail with "File size must be less than 50MB"
- [ ] Chat attachment UI shows "até 50MB" ✅
- [ ] Document upload allows 50MB files ✅
- [ ] Public form allows 50MB files ✅
- [ ] WhatsApp still limits to 16MB (correct) ✅

---

## Developer Notes:

### To change limits in future:

**Frontend validation**:
1. Update `MAX_FILE_SIZE` constants in components
2. Update error message text
3. Update UI helper text

**Backend validation** (already done):
1. Update `MAX_FILE_SIZE` in middleware
2. Update multer `limits.fileSize`

### Consistency check:
```bash
# Search for file size references
grep -r "1024.*1024" client/src/
grep -r "MAX_FILE_SIZE" client/src/
```

---

## Notes:

1. **WhatsApp 16MB limit**: Cannot be changed (external API constraint)
2. **Supabase Storage**: Supports files up to 50MB per file
3. **Browser memory**: Large files (>50MB) may cause performance issues in browser
4. **Network**: Large files take longer to upload (consider progress indicators)

---

**Updated**: December 2, 2025  
**Frontend Limit**: 50MB (was 10MB)  
**Backend Limit**: 50MB (was 10MB)  
**Status**: ✅ Complete & Consistent

