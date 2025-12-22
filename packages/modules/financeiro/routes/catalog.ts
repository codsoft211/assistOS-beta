/**
 * Catalog Routes - Products, Recipes, UOMs
 * Unified catalog with technical specifications (fichas técnicas)
 */

import { Router, Request, Response, NextFunction } from 'express';
import { db } from '../../../../apps/api/db';
import { 
  products, 
  recipes, 
  recipeLines, 
  uoms,
  insertProductSchema,
  insertRecipeSchema,
  insertRecipeLineSchema,
  insertUomSchema
} from '../../../../shared/schema';
import { eq, and, desc, asc, sql, ilike, or } from 'drizzle-orm';

// Middleware to extract tenant and environment from request
const getTenantContext = (req: Request) => {
  const tenantId = (req as any).tenantId || req.headers['x-tenant-id'] as string;
  const environment = (req.query.environment as string) || 'production';
  return { tenantId, environment };
};

export function createCatalogRouter(): Router {
  const router = Router();

  // ==================== UOMS ====================

  router.get('/uoms', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { tenantId, environment } = getTenantContext(req);
      
      const results = await db.select()
        .from(uoms)
        .where(
          and(
            or(
              eq(uoms.tenantId, tenantId),
              sql`${uoms.tenantId} IS NULL`
            ),
            eq(uoms.environment, environment),
            eq(uoms.isActive, true)
          )
        )
        .orderBy(asc(uoms.uomType), asc(uoms.name));
      
      res.json(results);
    } catch (error) {
      next(error);
    }
  });

  router.post('/uoms', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { tenantId, environment } = getTenantContext(req);
      
      const validated = insertUomSchema.parse({
        ...req.body,
        tenantId,
        environment,
      });
      
      const [result] = await db.insert(uoms).values(validated).returning();
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  });

  // ==================== PRODUCTS (CATALOG ITEMS) ====================

  router.get('/products', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { tenantId, environment } = getTenantContext(req);
      const { 
        itemType, 
        isSellable, 
        isPurchasable, 
        category, 
        search, 
        isActive,
        limit = '50',
        offset = '0'
      } = req.query;
      
      const conditions: any[] = [
        eq(products.tenantId, tenantId),
        eq(products.environment, environment),
      ];
      
      if (itemType) {
        conditions.push(eq(products.itemType, itemType as string));
      }
      
      if (isSellable !== undefined) {
        conditions.push(eq(products.isSellable, isSellable === 'true'));
      }
      
      if (isPurchasable !== undefined) {
        conditions.push(eq(products.isPurchasable, isPurchasable === 'true'));
      }
      
      if (category) {
        conditions.push(eq(products.category, category as string));
      }
      
      if (isActive !== undefined) {
        conditions.push(eq(products.isActive, isActive !== 'false'));
      } else {
        conditions.push(eq(products.isActive, true));
      }
      
      if (search) {
        conditions.push(
          or(
            ilike(products.name, `%${search}%`),
            ilike(products.code, `%${search}%`),
            ilike(products.description, `%${search}%`)
          )!
        );
      }
      
      const results = await db.select()
        .from(products)
        .where(and(...conditions))
        .orderBy(desc(products.updatedAt))
        .limit(parseInt(limit as string))
        .offset(parseInt(offset as string));
      
      // Get total count for pagination
      const [countResult] = await db.select({ count: sql<number>`count(*)` })
        .from(products)
        .where(and(...conditions));
      
      res.json({
        items: results,
        total: countResult?.count || 0,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/products/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { tenantId, environment } = getTenantContext(req);
      const { id } = req.params;
      
      // Get product with its default recipe
      const [product] = await db.select()
        .from(products)
        .where(
          and(
            eq(products.id, id),
            eq(products.tenantId, tenantId),
            eq(products.environment, environment)
          )
        );
      
      if (!product) {
        return res.status(404).json({ error: 'Product not found' });
      }
      
      // Get recipes for this product
      const productRecipes = await db.select()
        .from(recipes)
        .where(
          and(
            eq(recipes.productId, id),
            eq(recipes.tenantId, tenantId),
            eq(recipes.environment, environment)
          )
        )
        .orderBy(desc(recipes.isDefault), desc(recipes.updatedAt));
      
      // Get default UOM
      let defaultUom = null;
      if (product.defaultUomId) {
        const [uom] = await db.select()
          .from(uoms)
          .where(eq(uoms.id, product.defaultUomId));
        defaultUom = uom || null;
      }
      
      res.json({
        ...product,
        defaultUom,
        recipes: productRecipes,
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/products', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { tenantId, environment } = getTenantContext(req);
      
      const validated = insertProductSchema.parse({
        ...req.body,
        tenantId,
        environment,
      });
      
      const [result] = await db.insert(products).values(validated).returning();
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  });

  router.patch('/products/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { tenantId, environment } = getTenantContext(req);
      const { id } = req.params;
      
      // Verify product exists and belongs to tenant
      const [existing] = await db.select()
        .from(products)
        .where(
          and(
            eq(products.id, id),
            eq(products.tenantId, tenantId),
            eq(products.environment, environment)
          )
        );
      
      if (!existing) {
        return res.status(404).json({ error: 'Product not found' });
      }
      
      const [result] = await db.update(products)
        .set({
          ...req.body,
          updatedAt: new Date(),
        })
        .where(eq(products.id, id))
        .returning();
      
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  router.delete('/products/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { tenantId, environment } = getTenantContext(req);
      const { id } = req.params;
      
      // Soft delete - mark as inactive
      const [result] = await db.update(products)
        .set({ isActive: false, updatedAt: new Date() })
        .where(
          and(
            eq(products.id, id),
            eq(products.tenantId, tenantId),
            eq(products.environment, environment)
          )
        )
        .returning();
      
      if (!result) {
        return res.status(404).json({ error: 'Product not found' });
      }
      
      res.json({ success: true, message: 'Product deactivated' });
    } catch (error) {
      next(error);
    }
  });

  // ==================== RECIPES (TECHNICAL SPECIFICATIONS) ====================

  router.get('/recipes', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { tenantId, environment } = getTenantContext(req);
      const { productId, isActive } = req.query;
      
      const conditions: any[] = [
        eq(recipes.tenantId, tenantId),
        eq(recipes.environment, environment),
      ];
      
      if (productId) {
        conditions.push(eq(recipes.productId, productId as string));
      }
      
      if (isActive !== undefined) {
        conditions.push(eq(recipes.isActive, isActive !== 'false'));
      }
      
      const results = await db.select()
        .from(recipes)
        .where(and(...conditions))
        .orderBy(desc(recipes.isDefault), desc(recipes.updatedAt));
      
      res.json(results);
    } catch (error) {
      next(error);
    }
  });

  router.get('/recipes/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { tenantId, environment } = getTenantContext(req);
      const { id } = req.params;
      
      // Get recipe
      const [recipe] = await db.select()
        .from(recipes)
        .where(
          and(
            eq(recipes.id, id),
            eq(recipes.tenantId, tenantId),
            eq(recipes.environment, environment)
          )
        );
      
      if (!recipe) {
        return res.status(404).json({ error: 'Recipe not found' });
      }
      
      // Get recipe lines with component details
      const lines = await db.select({
        line: recipeLines,
        component: products,
        uom: uoms,
      })
        .from(recipeLines)
        .leftJoin(products, eq(recipeLines.componentId, products.id))
        .leftJoin(uoms, eq(recipeLines.uomId, uoms.id))
        .where(eq(recipeLines.recipeId, id))
        .orderBy(asc(recipeLines.sortOrder));
      
      // Get yield UOM
      let yieldUom = null;
      if (recipe.yieldUomId) {
        const [uom] = await db.select()
          .from(uoms)
          .where(eq(uoms.id, recipe.yieldUomId));
        yieldUom = uom || null;
      }
      
      res.json({
        ...recipe,
        yieldUom,
        lines: lines.map((l: { line: any; component: any; uom: any }) => ({
          ...l.line,
          component: l.component,
          uom: l.uom,
        })),
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/recipes', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { tenantId, environment } = getTenantContext(req);
      const userId = (req as any).user?.id || (req as any).session?.userId;
      
      const validated = insertRecipeSchema.parse({
        ...req.body,
        tenantId,
        environment,
        createdBy: userId,
      });
      
      const [result] = await db.insert(recipes).values(validated).returning();
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  });

  router.patch('/recipes/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { tenantId, environment } = getTenantContext(req);
      const { id } = req.params;
      
      const [existing] = await db.select()
        .from(recipes)
        .where(
          and(
            eq(recipes.id, id),
            eq(recipes.tenantId, tenantId),
            eq(recipes.environment, environment)
          )
        );
      
      if (!existing) {
        return res.status(404).json({ error: 'Recipe not found' });
      }
      
      const [result] = await db.update(recipes)
        .set({
          ...req.body,
          updatedAt: new Date(),
        })
        .where(eq(recipes.id, id))
        .returning();
      
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  router.delete('/recipes/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { tenantId, environment } = getTenantContext(req);
      const { id } = req.params;
      
      // Check if recipe exists
      const [existing] = await db.select()
        .from(recipes)
        .where(
          and(
            eq(recipes.id, id),
            eq(recipes.tenantId, tenantId),
            eq(recipes.environment, environment)
          )
        );
      
      if (!existing) {
        return res.status(404).json({ error: 'Recipe not found' });
      }
      
      // Delete recipe (lines will cascade)
      await db.delete(recipes).where(eq(recipes.id, id));
      
      res.json({ success: true, message: 'Recipe deleted' });
    } catch (error) {
      next(error);
    }
  });

  // ==================== RECIPE LINES ====================

  router.get('/recipes/:recipeId/lines', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { recipeId } = req.params;
      
      const lines = await db.select({
        line: recipeLines,
        component: products,
        uom: uoms,
      })
        .from(recipeLines)
        .leftJoin(products, eq(recipeLines.componentId, products.id))
        .leftJoin(uoms, eq(recipeLines.uomId, uoms.id))
        .where(eq(recipeLines.recipeId, recipeId))
        .orderBy(asc(recipeLines.sortOrder));
      
      res.json(lines.map((l: { line: any; component: any; uom: any }) => ({
        ...l.line,
        component: l.component,
        uom: l.uom,
      })));
    } catch (error) {
      next(error);
    }
  });

  router.post('/recipes/:recipeId/lines', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { tenantId, environment } = getTenantContext(req);
      const { recipeId } = req.params;
      
      // Get component cost if not provided
      let unitCost = req.body.unitCost;
      if (!unitCost && req.body.componentId) {
        const [component] = await db.select()
          .from(products)
          .where(eq(products.id, req.body.componentId));
        unitCost = component?.cost || 0;
      }
      
      const qty = parseFloat(req.body.qty) || 0;
      const lineCost = qty * (parseFloat(unitCost) || 0);
      
      const validated = insertRecipeLineSchema.parse({
        ...req.body,
        tenantId,
        environment,
        recipeId,
        unitCost,
        lineCost,
      });
      
      const [result] = await db.insert(recipeLines).values(validated).returning();
      
      // Recalculate recipe total cost
      await recalculateRecipeCost(recipeId);
      
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  });

  router.patch('/recipes/:recipeId/lines/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { recipeId, id } = req.params;
      
      // Calculate line cost if qty changed
      const updates: any = { ...req.body, updatedAt: new Date() };
      if (req.body.qty !== undefined || req.body.unitCost !== undefined) {
        const [existing] = await db.select().from(recipeLines).where(eq(recipeLines.id, id));
        const qty = parseFloat(req.body.qty ?? existing?.qty) || 0;
        const unitCost = parseFloat(req.body.unitCost ?? existing?.unitCost) || 0;
        updates.lineCost = qty * unitCost;
      }
      
      const [result] = await db.update(recipeLines)
        .set(updates)
        .where(
          and(
            eq(recipeLines.id, id),
            eq(recipeLines.recipeId, recipeId)
          )
        )
        .returning();
      
      if (!result) {
        return res.status(404).json({ error: 'Recipe line not found' });
      }
      
      // Recalculate recipe total cost
      await recalculateRecipeCost(recipeId);
      
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  router.delete('/recipes/:recipeId/lines/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { recipeId, id } = req.params;
      
      await db.delete(recipeLines)
        .where(
          and(
            eq(recipeLines.id, id),
            eq(recipeLines.recipeId, recipeId)
          )
        );
      
      // Recalculate recipe total cost
      await recalculateRecipeCost(recipeId);
      
      res.json({ success: true, message: 'Recipe line deleted' });
    } catch (error) {
      next(error);
    }
  });

  // ==================== COST CALCULATION ====================

  async function recalculateRecipeCost(recipeId: string) {
    // Get all lines and sum costs
    const lines = await db.select()
      .from(recipeLines)
      .where(eq(recipeLines.recipeId, recipeId));
    
    let totalCost = 0;
    for (const line of lines) {
      const lossMultiplier = 1 + (parseFloat(line.lossPercent?.toString() || '0') / 100);
      totalCost += (parseFloat(line.lineCost?.toString() || '0')) * lossMultiplier;
    }
    
    // Get recipe yield
    const [recipe] = await db.select()
      .from(recipes)
      .where(eq(recipes.id, recipeId));
    
    const yieldQty = parseFloat(recipe?.yieldQty?.toString() || '1');
    const lossFactor = 1 + (parseFloat(recipe?.lossFactor?.toString() || '0') / 100);
    
    // Apply recipe-level loss factor
    totalCost = totalCost * lossFactor;
    const costPerUnit = yieldQty > 0 ? totalCost / yieldQty : 0;
    
    // Update recipe
    await db.update(recipes)
      .set({
        totalCost: totalCost.toFixed(4),
        costPerUnit: costPerUnit.toFixed(4),
        updatedAt: new Date(),
      })
      .where(eq(recipes.id, recipeId));
    
    // Update product calculated cost if this is the default recipe
    if (recipe?.isDefault && recipe.productId) {
      await db.update(products)
        .set({
          calculatedCost: costPerUnit.toFixed(2),
          updatedAt: new Date(),
        })
        .where(eq(products.id, recipe.productId));
    }
  }

  // Endpoint to manually trigger cost recalculation
  router.post('/recipes/:id/recalculate', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      
      await recalculateRecipeCost(id);
      
      const [recipe] = await db.select()
        .from(recipes)
        .where(eq(recipes.id, id));
      
      res.json({
        success: true,
        totalCost: recipe?.totalCost,
        costPerUnit: recipe?.costPerUnit,
      });
    } catch (error) {
      next(error);
    }
  });

  // ==================== CATEGORIES ====================

  router.get('/categories', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { tenantId, environment } = getTenantContext(req);
      const { itemType } = req.query;
      
      const conditions: any[] = [
        eq(products.tenantId, tenantId),
        eq(products.environment, environment),
        eq(products.isActive, true),
      ];
      
      if (itemType) {
        conditions.push(eq(products.itemType, itemType as string));
      }
      
      const result = await db.selectDistinct({ category: products.category })
        .from(products)
        .where(and(...conditions))
        .orderBy(asc(products.category));
      
      res.json(result.filter((r: { category: string | null }) => r.category).map((r: { category: string | null }) => r.category));
    } catch (error) {
      next(error);
    }
  });

  return router;
}

export default createCatalogRouter;
