import { Router } from "express";
import { hardTenantGuard } from "../middleware/hard-tenant-guard";
import { db } from "../db";
import { emailAutoResponders, emailTemplates, insertEmailAutoResponderSchema } from "../../../shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod";

const router = Router();

// ============================================================================
// MULTI-TENANT SECURITY - Apply hardTenantGuard to ALL routes
// Auto-responders contain automation rules - protection required
// ============================================================================
router.use(hardTenantGuard);

// GET /api/gmail/auto-responders
// List all auto-responders for tenant
router.get("/", async (req: any, res) => {
  if (!req.user || !req.user.activeTenantId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const responders = await db.query.emailAutoResponders.findMany({
      where: eq(emailAutoResponders.tenantId, req.user.activeTenantId),
      orderBy: [desc(emailAutoResponders.priority), desc(emailAutoResponders.createdAt)],
      with: {
        template: true,
      },
    });

    res.json({ responders });
  } catch (error) {
    console.error("[Gmail Auto-Responders] List error:", error);
    res.status(500).json({ error: "Failed to list auto-responders" });
  }
});

// GET /api/gmail/auto-responders/:id
// Get single auto-responder
router.get("/:id", async (req: any, res) => {
  if (!req.user || !req.user.activeTenantId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const responder = await db.query.emailAutoResponders.findFirst({
      where: and(
        eq(emailAutoResponders.id, req.params.id),
        eq(emailAutoResponders.tenantId, req.user.activeTenantId)
      ),
      with: {
        template: true,
      },
    });

    if (!responder) {
      return res.status(404).json({ error: "Auto-responder not found" });
    }

    res.json(responder);
  } catch (error) {
    console.error("[Gmail Auto-Responders] Get error:", error);
    res.status(500).json({ error: "Failed to get auto-responder" });
  }
});

// POST /api/gmail/auto-responders
// Create new auto-responder
router.post("/", async (req: any, res) => {
  if (!req.user || !req.user.activeTenantId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const validated = insertEmailAutoResponderSchema.parse({
      ...req.body,
      tenantId: req.user.activeTenantId,
      createdBy: req.user.id,
    });

    const [responder] = await db.insert(emailAutoResponders).values(validated).returning();

    res.status(201).json(responder);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid auto-responder data", details: error.errors });
    }
    console.error("[Gmail Auto-Responders] Create error:", error);
    res.status(500).json({ error: "Failed to create auto-responder" });
  }
});

// PATCH /api/gmail/auto-responders/:id
// Update auto-responder
router.patch("/:id", async (req: any, res) => {
  if (!req.user || !req.user.activeTenantId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const existing = await db.query.emailAutoResponders.findFirst({
      where: and(
        eq(emailAutoResponders.id, req.params.id),
        eq(emailAutoResponders.tenantId, req.user.activeTenantId)
      ),
    });

    if (!existing) {
      return res.status(404).json({ error: "Auto-responder not found" });
    }

    const updateData: any = { ...req.body };
    delete updateData.id;
    delete updateData.tenantId;
    delete updateData.createdBy;
    delete updateData.createdAt;
    delete updateData.triggerCount;
    delete updateData.lastTriggeredAt;
    updateData.updatedAt = new Date();

    const [updated] = await db
      .update(emailAutoResponders)
      .set(updateData)
      .where(eq(emailAutoResponders.id, req.params.id))
      .returning();

    res.json(updated);
  } catch (error) {
    console.error("[Gmail Auto-Responders] Update error:", error);
    res.status(500).json({ error: "Failed to update auto-responder" });
  }
});

// DELETE /api/gmail/auto-responders/:id
// Delete auto-responder
router.delete("/:id", async (req: any, res) => {
  if (!req.user || !req.user.activeTenantId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const existing = await db.query.emailAutoResponders.findFirst({
      where: and(
        eq(emailAutoResponders.id, req.params.id),
        eq(emailAutoResponders.tenantId, req.user.activeTenantId)
      ),
    });

    if (!existing) {
      return res.status(404).json({ error: "Auto-responder not found" });
    }

    await db.delete(emailAutoResponders).where(eq(emailAutoResponders.id, req.params.id));

    res.json({ success: true });
  } catch (error) {
    console.error("[Gmail Auto-Responders] Delete error:", error);
    res.status(500).json({ error: "Failed to delete auto-responder" });
  }
});

// POST /api/gmail/auto-responders/:id/test
// Test auto-responder with sample email
router.post("/:id/test", async (req: any, res) => {
  if (!req.user || !req.user.activeTenantId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const responder = await db.query.emailAutoResponders.findFirst({
      where: and(
        eq(emailAutoResponders.id, req.params.id),
        eq(emailAutoResponders.tenantId, req.user.activeTenantId)
      ),
      with: {
        template: true,
      },
    });

    if (!responder) {
      return res.status(404).json({ error: "Auto-responder not found" });
    }

    const sampleEmail = req.body;
    const { fromAddress, subject, bodyText } = sampleEmail;

    // Test if rule would trigger
    let wouldTrigger = false;
    let testValue = '';

    switch (responder.triggerType) {
      case 'sender':
        testValue = fromAddress || '';
        break;
      case 'subject':
        testValue = subject || '';
        break;
      case 'keyword':
        testValue = bodyText || '';
        break;
      default:
        return res.status(400).json({ error: "Invalid trigger type" });
    }

    const triggerValue = responder.triggerValue.toLowerCase();
    const testValueLower = testValue.toLowerCase();

    switch (responder.triggerOperator) {
      case 'contains':
        wouldTrigger = testValueLower.includes(triggerValue);
        break;
      case 'equals':
        wouldTrigger = testValueLower === triggerValue;
        break;
      case 'startsWith':
        wouldTrigger = testValueLower.startsWith(triggerValue);
        break;
    }

    let response = {
      subject: '',
      body: '',
    };

    if (responder.templateId && responder.template) {
      response.subject = responder.template.subject;
      response.body = responder.template.bodyHtml;
    } else {
      response.subject = responder.responseSubject || '';
      response.body = responder.responseBody || '';
    }

    res.json({
      wouldTrigger,
      triggerType: responder.triggerType,
      triggerValue: responder.triggerValue,
      triggerOperator: responder.triggerOperator,
      testedValue: testValue,
      response: wouldTrigger ? response : null,
    });
  } catch (error) {
    console.error("[Gmail Auto-Responders] Test error:", error);
    res.status(500).json({ error: "Failed to test auto-responder" });
  }
});

export default router;
