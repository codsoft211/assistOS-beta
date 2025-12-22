import { Router } from "express";
import { db } from "../db";
import { z } from "zod";
import { serviceLines, serviceLineComponents, products } from "@shared/schema";
import { eq, and, ilike, or, count, desc, asc } from "drizzle-orm";

const router = Router();

const insertServiceLineSchema = z.object({
  code: z.string().min(1, "Code is required"),
  name: z.string().min(1, "Name is required"),
  description: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  tier: z.string().optional().nullable(),
  pricingType: z.string().default("per_person"),
  basePrice: z.string().default("0"),
  currency: z.string().default("EUR"),
  minItems: z.number().optional().nullable(),
  maxItems: z.number().optional().nullable(),
  isConfigurable: z.boolean().default(false),
  isActive: z.boolean().default(true),
  sortOrder: z.number().default(0),
  imageUrl: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

router.get("/service-lines", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;

    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { search, category, tier, isActive } = req.query;

    let conditions = [eq(serviceLines.tenantId, tenantId)];

    if (search && typeof search === 'string') {
      conditions.push(
        or(
          ilike(serviceLines.name, `%${search}%`),
          ilike(serviceLines.code, `%${search}%`)
        )!
      );
    }

    if (category && typeof category === 'string' && category !== 'all') {
      conditions.push(eq(serviceLines.category, category));
    }

    if (tier && typeof tier === 'string' && tier !== 'all') {
      conditions.push(eq(serviceLines.tier, tier));
    }

    if (isActive !== undefined) {
      conditions.push(eq(serviceLines.isActive, isActive === 'true'));
    }

    const results = await db
      .select()
      .from(serviceLines)
      .where(and(...conditions))
      .orderBy(asc(serviceLines.category), asc(serviceLines.sortOrder), asc(serviceLines.name));

    const total = await db
      .select({ count: count() })
      .from(serviceLines)
      .where(eq(serviceLines.tenantId, tenantId));

    res.json({
      serviceLines: results,
      total: total[0]?.count || 0,
    });
  } catch (error) {
    console.error("[Comercial] Error fetching service lines:", error);
    res.status(500).json({ error: "Failed to fetch service lines" });
  }
});

router.get("/service-lines/:id", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const { id } = req.params;

    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const [serviceLine] = await db
      .select()
      .from(serviceLines)
      .where(and(
        eq(serviceLines.id, id),
        eq(serviceLines.tenantId, tenantId)
      ));

    if (!serviceLine) {
      return res.status(404).json({ error: "Service line not found" });
    }

    const components = await db
      .select({
        id: serviceLineComponents.id,
        productId: serviceLineComponents.productId,
        isDefault: serviceLineComponents.isDefault,
        isOptional: serviceLineComponents.isOptional,
        qtyPerUnit: serviceLineComponents.qtyPerUnit,
        sortOrder: serviceLineComponents.sortOrder,
        notes: serviceLineComponents.notes,
        product: {
          id: products.id,
          code: products.code,
          name: products.name,
          category: products.category,
          cost: products.cost,
        },
      })
      .from(serviceLineComponents)
      .innerJoin(products, eq(serviceLineComponents.productId, products.id))
      .where(eq(serviceLineComponents.serviceLineId, id))
      .orderBy(asc(serviceLineComponents.sortOrder));

    res.json({
      ...serviceLine,
      components,
    });
  } catch (error) {
    console.error("[Comercial] Error fetching service line:", error);
    res.status(500).json({ error: "Failed to fetch service line" });
  }
});

router.post("/service-lines", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;

    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const parseResult = insertServiceLineSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ 
        error: "Validation failed", 
        details: parseResult.error.errors 
      });
    }

    const data = parseResult.data;

    const existingCode = await db
      .select({ id: serviceLines.id })
      .from(serviceLines)
      .where(and(
        eq(serviceLines.tenantId, tenantId),
        eq(serviceLines.code, data.code)
      ));

    if (existingCode.length > 0) {
      return res.status(400).json({ error: "Code already exists" });
    }

    const [newServiceLine] = await db
      .insert(serviceLines)
      .values({
        tenantId,
        ...data,
      })
      .returning();

    res.status(201).json(newServiceLine);
  } catch (error) {
    console.error("[Comercial] Error creating service line:", error);
    res.status(500).json({ error: "Failed to create service line" });
  }
});

router.patch("/service-lines/:id", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const { id } = req.params;

    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const [existing] = await db
      .select()
      .from(serviceLines)
      .where(and(
        eq(serviceLines.id, id),
        eq(serviceLines.tenantId, tenantId)
      ));

    if (!existing) {
      return res.status(404).json({ error: "Service line not found" });
    }

    const [updated] = await db
      .update(serviceLines)
      .set({
        ...req.body,
        updatedAt: new Date(),
      })
      .where(eq(serviceLines.id, id))
      .returning();

    res.json(updated);
  } catch (error) {
    console.error("[Comercial] Error updating service line:", error);
    res.status(500).json({ error: "Failed to update service line" });
  }
});

router.delete("/service-lines/:id", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const { id } = req.params;

    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const [existing] = await db
      .select()
      .from(serviceLines)
      .where(and(
        eq(serviceLines.id, id),
        eq(serviceLines.tenantId, tenantId)
      ));

    if (!existing) {
      return res.status(404).json({ error: "Service line not found" });
    }

    await db
      .delete(serviceLines)
      .where(eq(serviceLines.id, id));

    res.json({ success: true });
  } catch (error) {
    console.error("[Comercial] Error deleting service line:", error);
    res.status(500).json({ error: "Failed to delete service line" });
  }
});

router.post("/service-lines/:id/components", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const { id } = req.params;

    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const [existing] = await db
      .select()
      .from(serviceLines)
      .where(and(
        eq(serviceLines.id, id),
        eq(serviceLines.tenantId, tenantId)
      ));

    if (!existing) {
      return res.status(404).json({ error: "Service line not found" });
    }

    const { productId, isDefault, isOptional, qtyPerUnit, sortOrder, notes } = req.body;

    const [component] = await db
      .insert(serviceLineComponents)
      .values({
        tenantId,
        serviceLineId: id,
        productId,
        isDefault: isDefault ?? false,
        isOptional: isOptional ?? true,
        qtyPerUnit: qtyPerUnit ?? "1",
        sortOrder: sortOrder ?? 0,
        notes,
      })
      .returning();

    res.status(201).json(component);
  } catch (error) {
    console.error("[Comercial] Error adding component:", error);
    res.status(500).json({ error: "Failed to add component" });
  }
});

router.delete("/service-lines/:id/components/:componentId", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const { id, componentId } = req.params;

    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    await db
      .delete(serviceLineComponents)
      .where(and(
        eq(serviceLineComponents.id, componentId),
        eq(serviceLineComponents.serviceLineId, id),
        eq(serviceLineComponents.tenantId, tenantId)
      ));

    res.json({ success: true });
  } catch (error) {
    console.error("[Comercial] Error removing component:", error);
    res.status(500).json({ error: "Failed to remove component" });
  }
});

export default router;
