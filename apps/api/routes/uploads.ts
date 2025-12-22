// Migrated from AssistOS legacy - Phase 4.2
// Source: /tmp/assistos-legacy/server/routes/uploads.ts
// Handles presigned URL generation and file upload confirmation with Object Storage

import { Router, Request } from "express";
import { ObjectStorageService, ObjectNotFoundError, DocumentType, calculateFiscalPeriod, calculateRetentionDate } from "../services/storage.service";
import { ObjectPermission, ObjectAccessGroupType } from "../services/object-acl.service";
import { db } from "../db";
import { fileAttachments } from "../../../shared/schema";
import { eq } from "drizzle-orm";

const router = Router();

// Valid document types
const VALID_DOCUMENT_TYPES: DocumentType[] = ['invoice', 'contract', 'receipt', 'general', 'purchase_order', 'quote'];

// Validate document type - STRICT validation (throws on invalid)
function validateDocumentType(type: any): DocumentType {
  // Allow missing documentType, default to 'general'
  if (!type) {
    return 'general';
  }
  
  if (typeof type !== 'string') {
    throw new Error(`Invalid documentType: must be string, got ${typeof type}`);
  }
  
  const normalized = type.toLowerCase().trim() as DocumentType;
  
  if (!VALID_DOCUMENT_TYPES.includes(normalized)) {
    throw new Error(
      `Invalid documentType: "${type}". Must be one of: ${VALID_DOCUMENT_TYPES.join(', ')}`
    );
  }
  
  return normalized;
}

// Validate document date - STRICT validation (throws on invalid)
function validateDocumentDate(date: any): Date {
  // Allow missing date, default to current date
  if (!date) {
    return new Date();
  }
  
  const parsed = new Date(date);
  
  // Check if date is valid
  if (isNaN(parsed.getTime())) {
    throw new Error(`Invalid documentDate: "${date}" is not a valid date`);
  }
  
  // Check if date is not too far in future (max 1 year ahead)
  const oneYearFromNow = new Date();
  oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
  if (parsed > oneYearFromNow) {
    throw new Error(
      `Invalid documentDate: "${date}" is too far in the future (max 1 year ahead)`
    );
  }
  
  // Check if date is not too old (max 50 years back for historical documents)
  const fiftyYearsAgo = new Date();
  fiftyYearsAgo.setFullYear(fiftyYearsAgo.getFullYear() - 50);
  if (parsed < fiftyYearsAgo) {
    throw new Error(
      `Invalid documentDate: "${date}" is too old (max 50 years back for historical documents)`
    );
  }
  
  return parsed;
}

// Get presigned URL for uploading a file to Object Storage
router.post("/presigned-url", async (req: Request, res) => {
  try {
    const { filename, fileHash, documentType, documentDate } = req.body;

    if (!filename || !fileHash) {
      return res.status(400).json({ error: "filename and fileHash are required" });
    }

    // Get tenant and user from session
    const tenantId = (req as any).tenantId || (req as any).session?.activeTenantId;
    const userId = (req as any).session?.userId;

    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    // Validate inputs (throws on invalid)
    const validatedType = validateDocumentType(documentType);
    const validatedDate = validateDocumentDate(documentDate);

    const objectStorageService = new ObjectStorageService();
    const uploadURL = await objectStorageService.getObjectEntityUploadURL(
      tenantId,
      fileHash,
      filename,
      validatedType,
      validatedDate
    );

    console.log(`[Upload] Generated presigned URL for ${filename} (type: ${validatedType}, date: ${validatedDate.toISOString().split('T')[0]}, tenant: ${tenantId})`);

    res.json({
      uploadURL,
      method: "PUT" as const,
    });
  } catch (error) {
    // Validation errors return 400
    if (error instanceof Error && error.message.startsWith('Invalid document')) {
      return res.status(400).json({ error: error.message });
    }
    console.error("[Upload] Error generating presigned URL:", error);
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

// Confirm upload and set ACL policy
router.post("/confirm", async (req: Request, res) => {
  try {
    const { uploadURL, filename, originalName, size, mimeType, fileHash, documentType, documentDate, typeMetadata } = req.body;

    if (!uploadURL || !filename || !originalName || !size || !mimeType || !fileHash) {
      return res.status(400).json({ 
        error: "uploadURL, filename, originalName, size, mimeType, and fileHash are required" 
      });
    }

    // Get tenant and user from session
    const tenantId = (req as any).tenantId || (req as any).session?.activeTenantId;
    const userId = (req as any).session?.userId;

    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const objectStorageService = new ObjectStorageService();

    // Normalize the upload URL to get the object path
    const normalizedPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

    // Set ACL policy for the uploaded file
    const objectPath = await objectStorageService.trySetObjectEntityAclPolicy(
      uploadURL,
      {
        owner: userId.toString(),
        visibility: "private", // Documents are private by default
        aclRules: [
          {
            // All tenant members can read documents
            group: {
              type: ObjectAccessGroupType.TENANT_MEMBER,
              id: tenantId.toString(),
            },
            permission: ObjectPermission.READ,
          },
        ],
      }
    );

    // Validate and calculate fiscal metadata
    const validatedDocType = validateDocumentType(documentType);
    const validatedUploadDate = validateDocumentDate(documentDate);
    
    const fiscalYear = validatedUploadDate.getFullYear();
    const fiscalMonth = validatedUploadDate.getMonth() + 1;
    const fiscalPeriod = calculateFiscalPeriod(validatedUploadDate);
    const retentionUntil = calculateRetentionDate(validatedDocType, validatedUploadDate);

    // Save to database with enhanced metadata
    const [attachment] = await db.insert(fileAttachments).values({
      tenantId,
      filename,
      originalName,
      path: objectPath,
      mimeType,
      size,
      
      // New hierarchical organization fields
      documentType: validatedDocType,
      fiscalYear,
      fiscalMonth,
      fiscalPeriod,
      
      // File integrity and compliance
      checksum: fileHash,
      retentionUntil,
      sourceSystem: 'assist_me',
      
      // Type-specific metadata (from GPT analysis or user input)
      typeMetadata: typeMetadata || null,
      
      entityType: 'general',
      entityId: null,
      uploadedBy: userId,
    }).returning();

    console.log(`[Upload] ✅ File confirmed and saved:`, {
      id: attachment.id,
      originalName,
      documentType: validatedDocType,
      fiscalPeriod,
      objectPath,
      retentionUntil: retentionUntil.toISOString().split('T')[0],
      sha256: fileHash.substring(0, 16) + '...',
      size: (size / 1024).toFixed(2) + ' KB',
    });

    res.json({
      id: attachment.id,
      filename,
      originalName,
      path: objectPath, // Internal path in Object Storage
      size,
      mimeType,
      documentType: validatedDocType,
      fiscalYear,
      fiscalMonth,
      fiscalPeriod,
      retentionUntil,
      url: `/api/uploads/objects/${attachment.id}`, // Download URL by ID
    });
  } catch (error) {
    // Validation errors return 400
    if (error instanceof Error && error.message.startsWith('Invalid document')) {
      return res.status(400).json({ error: error.message });
    }
    console.error("[Upload] Error confirming upload:", error);
    res.status(500).json({ error: "Failed to confirm upload" });
  }
});

// Serve protected files from Object Storage by file ID
router.get("/objects/:fileId", async (req: Request, res) => {
  try {
    const { fileId } = req.params;

    // Get authenticated user
    const userId = (req as any).session?.userId;
    const sessionTenantId = (req as any).tenantId || (req as any).session?.activeTenantId;

    if (!userId || !sessionTenantId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    // Load file metadata from database
    const [fileRecord] = await db
      .select()
      .from(fileAttachments)
      .where(eq(fileAttachments.id, fileId))
      .limit(1);

    if (!fileRecord) {
      return res.status(404).json({ error: "File not found" });
    }

    // Verify tenant access
    if (fileRecord.tenantId !== sessionTenantId) {
      return res.status(403).json({ error: "Access denied" });
    }

    const objectStorageService = new ObjectStorageService();
    const objectFile = await objectStorageService.getObjectEntityFile(fileRecord.path);
    
    // Check ACL permissions
    const canAccess = await objectStorageService.canAccessObjectEntity({
      objectFile,
      userId: userId.toString(),
      requestedPermission: ObjectPermission.READ,
    });

    if (!canAccess) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Stream file from Object Storage
    await objectStorageService.downloadObject(objectFile, res);
  } catch (error) {
    console.error("[Upload] Error serving file:", error);
    if (error instanceof ObjectNotFoundError) {
      return res.status(404).json({ error: "File not found" });
    }
    res.status(500).json({ error: "Failed to serve file" });
  }
});

export default router;
