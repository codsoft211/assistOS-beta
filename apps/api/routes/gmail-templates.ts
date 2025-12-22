import { Router } from "express";
import { hardTenantGuard } from "../middleware/hard-tenant-guard";
import { db } from "../db";
import { emailTemplates, insertEmailTemplateSchema } from "../../../shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod";

const router = Router();

// ============================================================================
// MULTI-TENANT SECURITY - Apply hardTenantGuard to ALL routes
// Email templates may contain sensitive business data - protection required
// ============================================================================
router.use(hardTenantGuard);

// GET /api/gmail/templates
// List all templates for tenant
router.get("/", async (req: any, res) => {
  if (!req.user || !req.user.activeTenantId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const category = req.query.category as string | undefined;
    
    const conditions = [eq(emailTemplates.tenantId, req.user.activeTenantId)];
    if (category) {
      conditions.push(eq(emailTemplates.category, category));
    }

    const templates = await db.query.emailTemplates.findMany({
      where: and(...conditions),
      orderBy: [desc(emailTemplates.createdAt)],
    });

    res.json({ templates });
  } catch (error) {
    console.error("[Gmail Templates] List error:", error);
    res.status(500).json({ error: "Failed to list templates" });
  }
});

// GET /api/gmail/templates/:id
// Get single template
router.get("/:id", async (req: any, res) => {
  if (!req.user || !req.user.activeTenantId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const template = await db.query.emailTemplates.findFirst({
      where: and(
        eq(emailTemplates.id, req.params.id),
        eq(emailTemplates.tenantId, req.user.activeTenantId)
      ),
    });

    if (!template) {
      return res.status(404).json({ error: "Template not found" });
    }

    res.json(template);
  } catch (error) {
    console.error("[Gmail Templates] Get error:", error);
    res.status(500).json({ error: "Failed to get template" });
  }
});

// POST /api/gmail/templates
// Create new template
router.post("/", async (req: any, res) => {
  if (!req.user || !req.user.activeTenantId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const validated = insertEmailTemplateSchema.parse({
      ...req.body,
      tenantId: req.user.activeTenantId,
      createdBy: req.user.id,
    });

    const [template] = await db.insert(emailTemplates).values(validated).returning();

    res.status(201).json(template);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid template data", details: error.errors });
    }
    console.error("[Gmail Templates] Create error:", error);
    res.status(500).json({ error: "Failed to create template" });
  }
});

// PATCH /api/gmail/templates/:id
// Update template
router.patch("/:id", async (req: any, res) => {
  if (!req.user || !req.user.activeTenantId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    // Check if template exists and belongs to tenant
    const existing = await db.query.emailTemplates.findFirst({
      where: and(
        eq(emailTemplates.id, req.params.id),
        eq(emailTemplates.tenantId, req.user.activeTenantId)
      ),
    });

    if (!existing) {
      return res.status(404).json({ error: "Template not found" });
    }

    const updateData: any = { ...req.body };
    delete updateData.id;
    delete updateData.tenantId;
    delete updateData.createdBy;
    delete updateData.createdAt;
    delete updateData.usageCount;
    delete updateData.lastUsedAt;
    updateData.updatedAt = new Date();

    const [updated] = await db
      .update(emailTemplates)
      .set(updateData)
      .where(eq(emailTemplates.id, req.params.id))
      .returning();

    res.json(updated);
  } catch (error) {
    console.error("[Gmail Templates] Update error:", error);
    res.status(500).json({ error: "Failed to update template" });
  }
});

// DELETE /api/gmail/templates/:id
// Delete template
router.delete("/:id", async (req: any, res) => {
  if (!req.user || !req.user.activeTenantId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const existing = await db.query.emailTemplates.findFirst({
      where: and(
        eq(emailTemplates.id, req.params.id),
        eq(emailTemplates.tenantId, req.user.activeTenantId)
      ),
    });

    if (!existing) {
      return res.status(404).json({ error: "Template not found" });
    }

    await db.delete(emailTemplates).where(eq(emailTemplates.id, req.params.id));

    res.json({ success: true });
  } catch (error) {
    console.error("[Gmail Templates] Delete error:", error);
    res.status(500).json({ error: "Failed to delete template" });
  }
});

// POST /api/gmail/templates/:id/preview
// Preview template with variables replaced
router.post("/:id/preview", async (req: any, res) => {
  if (!req.user || !req.user.activeTenantId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const template = await db.query.emailTemplates.findFirst({
      where: and(
        eq(emailTemplates.id, req.params.id),
        eq(emailTemplates.tenantId, req.user.activeTenantId)
      ),
    });

    if (!template) {
      return res.status(404).json({ error: "Template not found" });
    }

    const variables = req.body.variables || {};
    
    // Replace variables in subject and body
    let previewSubject = template.subject;
    let previewBodyHtml = template.bodyHtml;
    let previewBodyText = template.bodyText || '';

    Object.keys(variables).forEach(key => {
      const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
      previewSubject = previewSubject.replace(regex, variables[key]);
      previewBodyHtml = previewBodyHtml.replace(regex, variables[key]);
      previewBodyText = previewBodyText.replace(regex, variables[key]);
    });

    res.json({
      subject: previewSubject,
      bodyHtml: previewBodyHtml,
      bodyText: previewBodyText,
    });
  } catch (error) {
    console.error("[Gmail Templates] Preview error:", error);
    res.status(500).json({ error: "Failed to preview template" });
  }
});

export default router;
