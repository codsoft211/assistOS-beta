// Migrated from AssistOS legacy - Phase 2
import { Storage, File } from "@google-cloud/storage";
import { Response } from "express";
import { randomUUID } from "crypto";
import {
  ObjectAclPolicy,
  ObjectPermission,
  canAccessObject,
  getObjectAclPolicy,
  setObjectAclPolicy,
} from "./object-acl.service";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

// The object storage client is used to interact with the object storage service.
export const objectStorageClient = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: {
        type: "json",
        subject_token_field_name: "access_token",
      },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

// Document types for hierarchical organization
export type DocumentType = 'invoice' | 'contract' | 'receipt' | 'general' | 'purchase_order' | 'quote';

// Parameters for generating hierarchical paths
export interface HierarchicalPathOptions {
  tenantId: string;
  documentType?: DocumentType;
  date?: Date;
  fileHash: string;
  filename: string;
}

/**
 * Generates a hierarchical path for document storage with fiscal organization
 * Format: /documents/{tenantId}/{documentType}/{year}/{month}/{hash}_{filename}
 * Example: /documents/tenant-123/invoices/2025/01/abc123_fatura-janeiro.pdf
 * 
 * Benefits:
 * - Easy to find documents by type and period
 * - Supports fiscal year retention policies (10 years for invoices in Portugal)
 * - Better performance with large document volumes
 * - Enables lifecycle management (move old docs to cold storage)
 */
export function generateHierarchicalPath(options: HierarchicalPathOptions): string {
  const { tenantId, documentType = 'general', date = new Date(), fileHash, filename } = options;
  
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  
  // Slugify filename (remove special chars, lowercase, replace spaces with dashes)
  const sluggedFilename = filename
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[^a-z0-9.]/g, '-')     // Replace special chars with dashes
    .replace(/-+/g, '-')              // Replace multiple dashes with single
    .replace(/^-|-$/g, '');           // Remove leading/trailing dashes
  
  return `/documents/${tenantId}/${documentType}/${year}/${month}/${fileHash}_${sluggedFilename}`;
}

/**
 * Calculates fiscal period from date
 * Returns: "2025-Q1", "2025-Q2", etc.
 */
export function calculateFiscalPeriod(date: Date): string {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const quarter = Math.ceil(month / 3);
  return `${year}-Q${quarter}`;
}

/**
 * Calculates retention date for document compliance
 * Default: 10 years for invoices (Portuguese tax law)
 */
export function calculateRetentionDate(documentType: DocumentType, uploadDate: Date = new Date()): Date {
  const retentionDate = new Date(uploadDate);
  
  switch (documentType) {
    case 'invoice':
    case 'receipt':
      // Portuguese law requires 10 years retention
      retentionDate.setFullYear(retentionDate.getFullYear() + 10);
      break;
    case 'contract':
      // Contracts typically 7 years
      retentionDate.setFullYear(retentionDate.getFullYear() + 7);
      break;
    default:
      // General documents: 5 years
      retentionDate.setFullYear(retentionDate.getFullYear() + 5);
  }
  
  return retentionDate;
}

// The object storage service is used to interact with the object storage service.
export class ObjectStorageService {
  constructor() {}

  // Gets the public object search paths.
  getPublicObjectSearchPaths(): Array<string> {
    const pathsStr = process.env.PUBLIC_OBJECT_SEARCH_PATHS || "";
    const paths = Array.from(
      new Set(
        pathsStr
          .split(",")
          .map((path) => path.trim())
          .filter((path) => path.length > 0)
      )
    );
    if (paths.length === 0) {
      throw new Error(
        "PUBLIC_OBJECT_SEARCH_PATHS not set. Create a bucket in 'Object Storage' " +
          "tool and set PUBLIC_OBJECT_SEARCH_PATHS env var (comma-separated paths)."
      );
    }
    return paths;
  }

  // Gets the private object directory.
  getPrivateObjectDir(): string {
    const dir = process.env.PRIVATE_OBJECT_DIR || "";
    if (!dir) {
      throw new Error(
        "PRIVATE_OBJECT_DIR not set. Create a bucket in 'Object Storage' " +
          "tool and set PRIVATE_OBJECT_DIR env var."
      );
    }
    return dir;
  }

  // Search for a public object from the search paths.
  async searchPublicObject(filePath: string): Promise<File | null> {
    for (const searchPath of this.getPublicObjectSearchPaths()) {
      const fullPath = `${searchPath}/${filePath}`;

      // Full path format: /<bucket_name>/<object_name>
      const { bucketName, objectName } = parseObjectPath(fullPath);
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);

      // Check if file exists
      const [exists] = await file.exists();
      if (exists) {
        return file;
      }
    }

    return null;
  }

  // Downloads an object to the response.
  async downloadObject(file: File, res: Response, cacheTtlSec: number = 3600) {
    try {
      // Get file metadata
      const [metadata] = await file.getMetadata();
      // Get the ACL policy for the object.
      const aclPolicy = await getObjectAclPolicy(file);
      const isPublic = aclPolicy?.visibility === "public";
      // Set appropriate headers
      res.set({
        "Content-Type": metadata.contentType || "application/octet-stream",
        "Content-Length": metadata.size,
        "Cache-Control": `${
          isPublic ? "public" : "private"
        }, max-age=${cacheTtlSec}`,
      });

      // Stream the file to the response
      const stream = file.createReadStream();

      stream.on("error", (err) => {
        console.error("Stream error:", err);
        if (!res.headersSent) {
          res.status(500).json({ error: "Error streaming file" });
        }
      });

      stream.pipe(res);
    } catch (error) {
      console.error("Error downloading file:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Error downloading file" });
      }
    }
  }

  // Gets the upload URL for an object entity with tenant isolation.
  async getObjectEntityUploadURL(
    tenantId: string,
    fileHash: string,
    originalName: string,
    documentType?: DocumentType,
    documentDate?: Date
  ): Promise<string> {
    const privateObjectDir = this.getPrivateObjectDir();
    if (!privateObjectDir) {
      throw new Error(
        "PRIVATE_OBJECT_DIR not set. Create a bucket in 'Object Storage' " +
          "tool and set PRIVATE_OBJECT_DIR env var."
      );
    }

    // Generate hierarchical path: /documents/{tenant}/{type}/{year}/{month}/{hash}_{filename}
    const hierarchicalPath = generateHierarchicalPath({
      tenantId,
      documentType: documentType || 'general',
      date: documentDate || new Date(),
      fileHash,
      filename: originalName,
    });

    const fullPath = `${privateObjectDir}${hierarchicalPath}`;

    const { bucketName, objectName } = parseObjectPath(fullPath);

    // Sign URL for PUT method with TTL
    return signObjectURL({
      bucketName,
      objectName,
      method: "PUT",
      ttlSec: 900, // 15 minutes
    });
  }

  // Gets the object entity file from the object path.
  async getObjectEntityFile(objectPath: string): Promise<File> {
    if (!objectPath.startsWith("/objects/")) {
      throw new ObjectNotFoundError();
    }

    const parts = objectPath.slice(1).split("/");
    if (parts.length < 2) {
      throw new ObjectNotFoundError();
    }

    const entityId = parts.slice(1).join("/");
    let entityDir = this.getPrivateObjectDir();
    if (!entityDir.endsWith("/")) {
      entityDir = `${entityDir}/`;
    }
    const objectEntityPath = `${entityDir}${entityId}`;
    const { bucketName, objectName } = parseObjectPath(objectEntityPath);
    const bucket = objectStorageClient.bucket(bucketName);
    const objectFile = bucket.file(objectName);
    const [exists] = await objectFile.exists();
    if (!exists) {
      throw new ObjectNotFoundError();
    }
    return objectFile;
  }

  // Get File object from GCS path for document analyzer
  async getFileFromGcsPath(gcsPath: string): Promise<File> {
    const { bucketName, objectName } = parseObjectPath(gcsPath);
    const bucket = objectStorageClient.bucket(bucketName);
    const file = bucket.file(objectName);
    const [exists] = await file.exists();
    if (!exists) {
      throw new ObjectNotFoundError();
    }
    return file;
  }

  normalizeObjectEntityPath(rawPath: string): string {
    if (!rawPath.startsWith("https://storage.googleapis.com/")) {
      return rawPath;
    }

    // Extract the path from the URL by removing query parameters and domain
    const url = new URL(rawPath);
    const rawObjectPath = url.pathname;

    let objectEntityDir = this.getPrivateObjectDir();
    if (!objectEntityDir.endsWith("/")) {
      objectEntityDir = `${objectEntityDir}/`;
    }

    if (!rawObjectPath.startsWith(objectEntityDir)) {
      return rawObjectPath;
    }

    // Extract the entity ID from the path
    const entityId = rawObjectPath.slice(objectEntityDir.length);
    return `/objects/${entityId}`;
  }

  // Tries to set the ACL policy for the object entity and return the normalized path.
  async trySetObjectEntityAclPolicy(
    rawPath: string,
    aclPolicy: ObjectAclPolicy
  ): Promise<string> {
    const normalizedPath = this.normalizeObjectEntityPath(rawPath);
    if (!normalizedPath.startsWith("/")) {
      return normalizedPath;
    }

    const objectFile = await this.getObjectEntityFile(normalizedPath);
    await setObjectAclPolicy(objectFile, aclPolicy);
    return normalizedPath;
  }

  // Checks if the user can access the object entity.
  async canAccessObjectEntity({
    userId,
    objectFile,
    requestedPermission,
  }: {
    userId?: string;
    objectFile: File;
    requestedPermission?: ObjectPermission;
  }): Promise<boolean> {
    return canAccessObject({
      userId,
      objectFile,
      requestedPermission: requestedPermission ?? ObjectPermission.READ,
    });
  }

  /**
   * Upload contract buffer to object storage with tenant isolation
   * Returns internal object path (not signed URL)
   */
  async uploadContractBuffer(params: {
    buffer: Buffer;
    filename: string;
    mimetype: string;
    fileHash: string;
    tenantId: string;
    userId: string;
    documentType?: DocumentType;
    documentDate?: Date;
  }): Promise<string> {
    const { buffer, filename, mimetype, fileHash, tenantId, userId, documentType, documentDate } = params;

    let privateDir = this.getPrivateObjectDir();
    
    if (!privateDir.endsWith('/')) {
      privateDir = `${privateDir}/`;
    }

    let hierarchicalPath = generateHierarchicalPath({
      tenantId,
      documentType: documentType || 'contract',
      date: documentDate || new Date(),
      fileHash,
      filename,
    });

    if (hierarchicalPath.startsWith('/')) {
      hierarchicalPath = hierarchicalPath.slice(1);
    }

    const fullPath = `${privateDir}${hierarchicalPath}`;

    if (!fullPath.startsWith(privateDir)) {
      throw new Error('Internal error: fullPath does not start with privateDir');
    }

    const { bucketName, objectName } = parseObjectPath(fullPath);

    const bucket = objectStorageClient.bucket(bucketName);
    const file = bucket.file(objectName);

    await file.save(buffer, {
      metadata: {
        contentType: mimetype,
        metadata: {
          uploadedAt: new Date().toISOString(),
          tenantId,
          uploadedBy: userId,
          documentType: documentType || 'contract',
          fileHash,
        },
      },
    });

    const internalPath = `/objects/${fullPath.slice(privateDir.length)}`;

    return internalPath;
  }

  /**
   * Download file buffer from internal object path
   */
  async downloadFromInternalPath(internalPath: string): Promise<Buffer> {
    const file = await this.getObjectEntityFile(internalPath);
    const [buffer] = await file.download();
    return buffer;
  }
}

function parseObjectPath(path: string): {
  bucketName: string;
  objectName: string;
} {
  if (!path.startsWith("/")) {
    path = `/${path}`;
  }
  const pathParts = path.split("/");
  if (pathParts.length < 3) {
    throw new Error("Invalid path: must contain at least a bucket name");
  }

  const bucketName = pathParts[1];
  const objectName = pathParts.slice(2).join("/");

  return {
    bucketName,
    objectName,
  };
}

async function signObjectURL({
  bucketName,
  objectName,
  method,
  ttlSec,
}: {
  bucketName: string;
  objectName: string;
  method: "GET" | "PUT" | "DELETE" | "HEAD";
  ttlSec: number;
}): Promise<string> {
  const request = {
    bucket_name: bucketName,
    object_name: objectName,
    method,
    expires_at: new Date(Date.now() + ttlSec * 1000).toISOString(),
  };
  const response = await fetch(
    `${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    }
  );
  if (!response.ok) {
    throw new Error(
      `Failed to sign object URL, errorcode: ${response.status}, ` +
        `make sure you're running on Replit`
    );
  }

  const { signed_url: signedURL } = await response.json();
  return signedURL;
}

export const objectStorageService = new ObjectStorageService();
