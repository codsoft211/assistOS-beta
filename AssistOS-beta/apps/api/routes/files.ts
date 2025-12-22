// Migrated from AssistOS legacy - Phase 4.2
// Source: /tmp/assistos-legacy/server/routes/files.ts
// Now using Supabase Storage for file uploads, downloads, and deletion

import { Router, Request, Response } from "express";
import { db } from "../db";
import { fileAttachments } from "../../../shared/schema";
import { eq, and } from "drizzle-orm";
import { upload } from "../middleware/upload";
import { SupabaseStorageProvider } from "../../../packages/document-management/providers/SupabaseStorageProvider";
import crypto from "crypto";

const router = Router();

// Initialize Supabase Storage Provider
function getSupabaseProvider() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  const bucketName = process.env.SUPABASE_BUCKET_NAME || 'assistos-attachments';

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      'SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables are required. ' +
      'Please set them in your .env file.'
    );
  }

  return new SupabaseStorageProvider({
    type: 'supabase',
    bucketName,
    credentials: {
      url: supabaseUrl,
      key: supabaseKey,
    },
  });
}

router.post("/upload", upload.array('files'), async (req: Request, res: Response) => {
  try {
    // @ts-ignore - multer types not available until middleware is migrated
    console.log('[UPLOAD] Request received', {
      hasFiles: !!(req as any).files,
      filesCount: (req as any).files ? ((req as any).files as any[]).length : 0,
      body: req.body,
    });

    // @ts-ignore - multer types not available until middleware is migrated
    const files = (req as any).files as any[];
    
    if (!files || files.length === 0) {
      console.log('[UPLOAD] No files found in request');
      return res.status(400).json({ error: "Nenhum arquivo enviado" });
    }

    // @ts-ignore - multer types not available until middleware is migrated
    console.log('[UPLOAD] Files received:', files.map((f: any) => ({
      name: f.originalname,
      size: f.size,
      mime: f.mimetype,
    })));

    const tenantId = (req as any).tenantId;
    const userId = (req.user as any)?.id;
    
    if (!tenantId) {
      console.log('[UPLOAD] No tenant ID found');
      return res.status(400).json({ error: "Tenant não identificado" });
    }

    const { entityType, entityId } = req.body;

    // Initialize Supabase provider
    const supabaseProvider = getSupabaseProvider();

    // @ts-ignore - multer types not available until middleware is migrated
    const fileRecords = await Promise.all(
      files.map(async (file: any) => {
        try {
          // Generate unique file path: tenantId/year/month/uuid_filename
          const now = new Date();
          const year = now.getFullYear();
          const month = String(now.getMonth() + 1).padStart(2, '0');
          const uniqueId = crypto.randomUUID();
          const storagePath = `${tenantId}/${year}/${month}/${uniqueId}_${file.originalname}`;

          // Calculate checksum
          const checksum = crypto.createHash('sha256').update(file.buffer).digest('hex');

          // Upload to Supabase Storage
          console.log(`[UPLOAD] Uploading ${file.originalname} to Supabase: ${storagePath}`);
          const uploadResult = await supabaseProvider.upload(
            file.buffer,
            storagePath,
            {
              contentType: file.mimetype,
              metadata: {
                originalName: file.originalname,
                tenantId,
                uploadedBy: userId || 'unknown',
                entityType: entityType || 'general',
                entityId: entityId || '',
              },
              checksum,
            }
          );

          // Save metadata to database
          const [fileRecord] = await db.insert(fileAttachments).values({
            tenantId,
            filename: uploadResult.name,
            originalName: file.originalname,
            mimeType: file.mimetype,
            size: file.size,
            path: storagePath, // Supabase storage path
            checksum,
            sourceSystem: 'supabase',
            entityType: entityType || null,
            entityId: entityId || null,
            uploadedBy: userId || null,
          }).returning();
          
          console.log(`[UPLOAD] Successfully uploaded ${file.originalname} with ID ${fileRecord.id}`);

          return {
            ...fileRecord,
            originalname: fileRecord.originalName, // Add lowercase version for frontend compatibility
          };
        } catch (uploadError) {
          console.error(`[UPLOAD] Failed to upload ${file.originalname}:`, uploadError);
          throw uploadError;
        }
      })
    );

    console.log('[UPLOAD] Success! Returning:', { filesCount: fileRecords.length });
    res.json({ files: fileRecords });
  } catch (error) {
    console.error("[UPLOAD] Error:", error);
    res.status(500).json({ 
      error: "Falha ao fazer upload do arquivo",
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// View file inline (for PDFs in iframe - no forced download)
router.get("/:id/view", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const tenantId = (req as any).tenantId;

    const [file] = await db
      .select()
      .from(fileAttachments)
      .where(and(
        eq(fileAttachments.id, id),
        eq(fileAttachments.tenantId, tenantId)
      ));

    if (!file) {
      return res.status(404).json({ error: "Arquivo não encontrado" });
    }

    // Get Supabase provider and download file
    const supabaseProvider = getSupabaseProvider();
    const buffer = await supabaseProvider.download(file.path);
    
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${file.originalName}"`); // inline = view, não download
    res.setHeader('Content-Length', buffer.length.toString());
    res.send(buffer);
  } catch (error) {
    console.error("Erro ao visualizar arquivo:", error);
    res.status(500).json({ 
      error: "Falha ao visualizar arquivo",
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Download file (forces download)
router.get("/:id/download", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const tenantId = (req as any).tenantId;

    const [file] = await db
      .select()
      .from(fileAttachments)
      .where(and(
        eq(fileAttachments.id, id),
        eq(fileAttachments.tenantId, tenantId)
      ));

    if (!file) {
      return res.status(404).json({ error: "Arquivo não encontrado" });
    }

    // Get Supabase provider and download file
    const supabaseProvider = getSupabaseProvider();
    const buffer = await supabaseProvider.download(file.path);
    
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.originalName}"`); // attachment = força download
    res.setHeader('Content-Length', buffer.length.toString());
    res.send(buffer);
  } catch (error) {
    console.error("Erro ao baixar arquivo:", error);
    res.status(500).json({ 
      error: "Falha ao baixar arquivo",
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get signed URL for direct download (useful for frontend preview)
router.get("/:id/signed-url", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const tenantId = (req as any).tenantId;
    const expiresIn = parseInt(req.query.expiresIn as string) || 3600; // Default 1 hour

    const [file] = await db
      .select()
      .from(fileAttachments)
      .where(and(
        eq(fileAttachments.id, id),
        eq(fileAttachments.tenantId, tenantId)
      ));

    if (!file) {
      return res.status(404).json({ error: "Arquivo não encontrado" });
    }

    // Get Supabase provider and generate signed URL
    const supabaseProvider = getSupabaseProvider();
    const signedUrl = await supabaseProvider.getSignedUrl(file.path, {
      expiresIn,
      action: 'read',
    });
    
    res.json({ 
      signedUrl,
      expiresIn,
      fileName: file.originalName,
      mimeType: file.mimeType,
      size: file.size,
    });
  } catch (error) {
    console.error("Erro ao gerar URL assinada:", error);
    res.status(500).json({ 
      error: "Falha ao gerar URL assinada",
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const tenantId = (req as any).tenantId;

    const [file] = await db
      .select()
      .from(fileAttachments)
      .where(and(
        eq(fileAttachments.id, id),
        eq(fileAttachments.tenantId, tenantId)
      ));

    if (!file) {
      return res.status(404).json({ error: "Arquivo não encontrado" });
    }

    // Delete from Supabase Storage
    try {
      const supabaseProvider = getSupabaseProvider();
      await supabaseProvider.delete(file.path);
      console.log(`[DELETE] Successfully deleted file from Supabase: ${file.path}`);
    } catch (storageError) {
      console.error("Erro ao deletar arquivo do Supabase:", storageError);
      // Continue to delete from database even if storage deletion fails
    }

    // Delete from database
    await db
      .delete(fileAttachments)
      .where(eq(fileAttachments.id, id));

    console.log(`[DELETE] Successfully deleted file record from database: ${id}`);
    res.json({ success: true });
  } catch (error) {
    console.error("Erro ao deletar arquivo:", error);
    res.status(500).json({ 
      error: "Falha ao deletar arquivo",
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

router.get("/", async (req: Request, res: Response) => {
  try {
    const { entityType, entityId } = req.query;
    const tenantId = (req as any).tenantId;

    let query = db
      .select()
      .from(fileAttachments)
      .where(eq(fileAttachments.tenantId, tenantId));

    if (entityType && entityId) {
      const files = await db
        .select()
        .from(fileAttachments)
        .where(and(
          eq(fileAttachments.tenantId, tenantId),
          eq(fileAttachments.entityType, entityType as string),
          eq(fileAttachments.entityId, entityId as string)
        ));
      return res.json({ files });
    }

    const files = await query;
    res.json({ files });
  } catch (error) {
    console.error("Erro ao listar arquivos:", error);
    res.status(500).json({ 
      error: "Falha ao listar arquivos",
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
