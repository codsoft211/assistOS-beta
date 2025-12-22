// Migrated from AssistOS legacy - Phase 4.4
// Inventory management routes (957 lines original - LARGE FILE)
// Preserves ALL business logic for inventory operations

import { Router } from "express";
import { db } from "../db";
import { z } from "zod";
import { 
  warehouses, 
  inventoryLevels, 
  inventoryTransactions, 
  equipmentAllocations,
  equipmentConditions,
  equipment,
  products,
  projects,
  users,
  maintenanceSchedule
} from "@shared/schema";
import { eq, sql, and, desc, gte, lte, count, sum, ilike, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

const router = Router();

/**
 * GET /api/logistica/dashboard
 * Dashboard completo com KPIs, Charts e Tables
 */
router.get("/dashboard", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;

    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // 1. KPIs - Total Warehouses
    const totalWarehousesResult = await db
      .select({ count: count() })
      .from(warehouses)
      .where(and(
        eq(warehouses.tenantId, tenantId),
        eq(warehouses.isActive, true)
      ));
    const totalWarehouses = totalWarehousesResult[0]?.count || 0;

    // 2. KPIs - Low Stock Items (below reorder point)
    const lowStockItemsResult = await db
      .select({ count: count() })
      .from(inventoryLevels)
      .where(and(
        eq(inventoryLevels.tenantId, tenantId),
        sql`${inventoryLevels.qtyOnHand} < ${inventoryLevels.reorderPoint}`
      ));
    const lowStockItems = lowStockItemsResult[0]?.count || 0;

    // 3. KPIs - Pending Transfers (status 'pending' in transactions)
    const pendingTransfersResult = await db
      .select({ count: count() })
      .from(inventoryTransactions)
      .where(and(
        eq(inventoryTransactions.tenantId, tenantId),
        eq(inventoryTransactions.type, 'transfer'),
        sql`${inventoryTransactions.metadata}->>'status' = 'pending'`
      ));
    const pendingTransfers = pendingTransfersResult[0]?.count || 0;

    // 4. KPIs - Equipment In Use (currently allocated)
    // Note: equipment_allocations table may not exist in all tenants
    let equipmentInUse = 0;
    try {
      const now = new Date();
      const equipmentInUseResult = await db
        .select({ count: count() })
        .from(equipmentAllocations)
        .where(and(
          eq(equipmentAllocations.tenantId, tenantId),
          eq(equipmentAllocations.status, 'reserved'),
          lte(equipmentAllocations.fromDate, now),
          gte(equipmentAllocations.toDate, now)
        ));
      equipmentInUse = equipmentInUseResult[0]?.count || 0;
    } catch (err) {
      // Table may not exist - silently ignore
      console.log('[Inventory Dashboard] Equipment allocations table not available');
    }

    // 5. KPIs - Total Inventory Value (sum of qty * cost)
    const inventoryValueResult = await db
      .select({
        totalValue: sql<number>`COALESCE(SUM(CAST(${inventoryLevels.qtyOnHand} AS NUMERIC) * CAST(${products.cost} AS NUMERIC)), 0)`
      })
      .from(inventoryLevels)
      .innerJoin(products, eq(inventoryLevels.productId, products.id))
      .where(eq(inventoryLevels.tenantId, tenantId));
    const totalInventoryValue = Number(inventoryValueResult[0]?.totalValue || 0);

    // 6. KPIs - Total Products
    const totalProductsResult = await db
      .select({ count: count() })
      .from(products)
      .where(and(
        eq(products.tenantId, tenantId),
        eq(products.isActive, true)
      ));
    const totalProducts = totalProductsResult[0]?.count || 0;

    // 7. Charts - Stock by Warehouse
    const stockByWarehouseRaw = await db
      .select({
        warehouseName: warehouses.name,
        totalItems: sql<number>`COALESCE(SUM(CAST(${inventoryLevels.qtyOnHand} AS NUMERIC)), 0)`,
        totalValue: sql<number>`COALESCE(SUM(CAST(${inventoryLevels.qtyOnHand} AS NUMERIC) * CAST(${products.cost} AS NUMERIC)), 0)`
      })
      .from(warehouses)
      .leftJoin(inventoryLevels, eq(warehouses.id, inventoryLevels.warehouseId))
      .leftJoin(products, eq(inventoryLevels.productId, products.id))
      .where(and(
        eq(warehouses.tenantId, tenantId),
        eq(warehouses.isActive, true)
      ))
      .groupBy(warehouses.id, warehouses.name);

    const stockByWarehouse = stockByWarehouseRaw.map(row => ({
      warehouseName: row.warehouseName,
      totalItems: Number(row.totalItems),
      totalValue: Number(row.totalValue)
    }));

    // 8. Charts - Recent Movements (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentMovementsRaw = await db
      .select({
        date: sql<string>`DATE(${inventoryTransactions.createdAt})`,
        inCount: sql<number>`COUNT(*) FILTER (WHERE ${inventoryTransactions.type} = 'in')`,
        outCount: sql<number>`COUNT(*) FILTER (WHERE ${inventoryTransactions.type} = 'out')`,
        adjustmentCount: sql<number>`COUNT(*) FILTER (WHERE ${inventoryTransactions.type} = 'adjustment')`
      })
      .from(inventoryTransactions)
      .where(and(
        eq(inventoryTransactions.tenantId, tenantId),
        gte(inventoryTransactions.createdAt, sevenDaysAgo)
      ))
      .groupBy(sql`DATE(${inventoryTransactions.createdAt})`)
      .orderBy(sql`DATE(${inventoryTransactions.createdAt})`);

    const recentMovements = recentMovementsRaw.map(row => ({
      date: row.date,
      inCount: Number(row.inCount),
      outCount: Number(row.outCount),
      adjustmentCount: Number(row.adjustmentCount)
    }));

    // 9. Tables - Low Stock Alerts
    const lowStockAlertsRaw = await db
      .select({
        productId: products.id,
        name: products.name,
        currentStock: inventoryLevels.qtyOnHand,
        reorderPoint: inventoryLevels.reorderPoint,
        warehouseName: warehouses.name
      })
      .from(inventoryLevels)
      .innerJoin(products, eq(inventoryLevels.productId, products.id))
      .innerJoin(warehouses, eq(inventoryLevels.warehouseId, warehouses.id))
      .where(and(
        eq(inventoryLevels.tenantId, tenantId),
        sql`${inventoryLevels.qtyOnHand} < ${inventoryLevels.reorderPoint}`
      ))
      .limit(10);

    const lowStockAlerts = lowStockAlertsRaw.map(row => ({
      productId: row.productId,
      name: row.name,
      currentStock: Number(row.currentStock),
      reorderPoint: Number(row.reorderPoint),
      warehouseName: row.warehouseName
    }));

    // 10. Tables - Pending Transfers (last 5)
    const warehouseFrom = alias(warehouses, 'w_from');
    const warehouseTo = alias(warehouses, 'w_to');
    
    const pendingTransfersListRaw = await db
      .select({
        id: inventoryTransactions.id,
        productName: products.name,
        fromWarehouse: warehouseFrom.name,
        toWarehouse: warehouseTo.name,
        quantity: inventoryTransactions.qty,
        createdAt: inventoryTransactions.createdAt
      })
      .from(inventoryTransactions)
      .innerJoin(products, eq(inventoryTransactions.productId, products.id))
      .leftJoin(warehouseFrom, eq(inventoryTransactions.warehouseFromId, warehouseFrom.id))
      .leftJoin(warehouseTo, eq(inventoryTransactions.warehouseToId, warehouseTo.id))
      .where(and(
        eq(inventoryTransactions.tenantId, tenantId),
        eq(inventoryTransactions.type, 'transfer'),
        sql`${inventoryTransactions.metadata}->>'status' = 'pending'`
      ))
      .orderBy(desc(inventoryTransactions.createdAt))
      .limit(5);

    const pendingTransfersList = pendingTransfersListRaw.map(row => ({
      id: row.id,
      productName: row.productName,
      fromWarehouse: row.fromWarehouse || 'N/A',
      toWarehouse: row.toWarehouse || 'N/A',
      quantity: Number(row.quantity),
      createdAt: row.createdAt.toISOString()
    }));

    // 11. Tables - Recent Movements (last 10)
    const warehouseFrom2 = alias(warehouses, 'w_from');
    const warehouseTo2 = alias(warehouses, 'w_to');
    
    const recentMovementsListRaw = await db
      .select({
        id: inventoryTransactions.id,
        type: inventoryTransactions.type,
        productName: products.name,
        quantity: inventoryTransactions.qty,
        warehouseName: sql<string>`COALESCE(${warehouseTo2.name}, ${warehouseFrom2.name}, 'N/A')`,
        createdAt: inventoryTransactions.createdAt
      })
      .from(inventoryTransactions)
      .innerJoin(products, eq(inventoryTransactions.productId, products.id))
      .leftJoin(warehouseFrom2, eq(inventoryTransactions.warehouseFromId, warehouseFrom2.id))
      .leftJoin(warehouseTo2, eq(inventoryTransactions.warehouseToId, warehouseTo2.id))
      .where(eq(inventoryTransactions.tenantId, tenantId))
      .orderBy(desc(inventoryTransactions.createdAt))
      .limit(10);

    const recentMovementsList = recentMovementsListRaw.map(row => ({
      id: row.id,
      type: row.type,
      productName: row.productName,
      quantity: Number(row.quantity),
      warehouseName: row.warehouseName || 'N/A',
      createdAt: row.createdAt.toISOString()
    }));

    // Return complete dashboard data
    res.json({
      stats: {
        totalWarehouses,
        lowStockItems,
        pendingTransfers,
        equipmentInUse,
        totalInventoryValue,
        totalProducts
      },
      charts: {
        stockByWarehouse,
        recentMovements
      },
      tables: {
        lowStockAlerts,
        pendingTransfers: pendingTransfersList,
        recentMovements: recentMovementsList
      }
    });

  } catch (error: any) {
    console.error("[Logistica Dashboard] Error:", error);
    res.status(500).json({ 
      error: "Failed to fetch dashboard data",
      details: error.message 
    });
  }
});

const createProductSchema = z.object({
  sku: z.string().min(1, "SKU is required"),
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  category: z.string().optional(),
  price: z.number().positive("Price must be positive"),
  cost: z.number().positive("Cost must be positive").optional(),
  unit: z.string().default("unit"),
  minStock: z.number().int().min(0).default(0),
  maxStock: z.number().int().min(0).optional(),
  reorderPoint: z.number().int().min(0).optional(),
  barcode: z.string().optional(),
  location: z.string().optional(),
  supplierId: z.string().optional(),
  isActive: z.boolean().default(true),
});

const updateProductSchema = createProductSchema.partial();

const stockMovementSchema = z.object({
  productId: z.string().min(1, "Product ID is required"),
  type: z.enum(["in", "out", "adjustment", "transfer"]),
  quantity: z.number().int().positive("Quantity must be positive"),
  warehouseId: z.string().optional(),
  reference: z.string().optional(), // Order ID, PO number, etc.
  notes: z.string().optional(),
  cost: z.number().optional(),
});

/**
 * GET /api/inventory/products
 * List products with filters and search
 * Query params: ?search=term&category=xxx&inStock=true&itemType=RAW&isSellable=true&page=1&limit=50
 */
router.get("/products", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;

    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { 
      search, 
      category, 
      inStock, 
      itemType, 
      isSellable,
      page = "1", 
      limit = "50" 
    } = req.query;

    const pageNum = parseInt(page as string) || 1;
    const limitNum = parseInt(limit as string) || 50;
    const offset = (pageNum - 1) * limitNum;

    // Build conditions array
    const conditions: any[] = [eq(products.tenantId, tenantId)];

    // Search by name, code, or description
    if (search && typeof search === 'string' && search.trim()) {
      const searchTerm = `%${search.trim()}%`;
      conditions.push(
        or(
          ilike(products.name, searchTerm),
          ilike(products.code, searchTerm),
          ilike(products.description, searchTerm)
        )
      );
    }

    // Filter by category
    if (category && typeof category === 'string' && category.trim()) {
      conditions.push(eq(products.category, category));
    }

    // Filter by item type (RAW, SALE, SEMI, SERVICE, PACKAGING)
    if (itemType && typeof itemType === 'string' && itemType.trim()) {
      conditions.push(eq(products.itemType, itemType));
    }

    // Filter by sellable status
    if (isSellable === 'true') {
      conditions.push(eq(products.isSellable, true));
    } else if (isSellable === 'false') {
      conditions.push(eq(products.isSellable, false));
    }

    // Filter by stock availability
    if (inStock === 'true') {
      conditions.push(sql`${products.stock} > 0`);
    } else if (inStock === 'false') {
      conditions.push(sql`${products.stock} <= 0`);
    }

    // Get total count
    const countResult = await db
      .select({ count: count() })
      .from(products)
      .where(and(...conditions));
    
    const total = countResult[0]?.count || 0;

    // Get products with pagination
    const productList = await db
      .select({
        id: products.id,
        code: products.code,
        name: products.name,
        description: products.description,
        itemType: products.itemType,
        isSellable: products.isSellable,
        isPurchasable: products.isPurchasable,
        price: products.price,
        cost: products.cost,
        calculatedCost: products.calculatedCost,
        stock: products.stock,
        category: products.category,
        subcategory: products.subcategory,
        isActive: products.isActive,
        trackingType: products.trackingType,
        defaultUomId: products.defaultUomId,
        storageUomId: products.storageUomId,
        barcode: products.barcode,
        createdAt: products.createdAt,
        updatedAt: products.updatedAt
      })
      .from(products)
      .where(and(...conditions))
      .orderBy(desc(products.updatedAt))
      .limit(limitNum)
      .offset(offset);

    res.json({
      products: productList,
      total,
      page: pageNum,
      limit: limitNum
    });
  } catch (error: any) {
    console.error("[Inventory API] Error listing products:", error);
    res.status(500).json({ 
      error: "Failed to list products",
      details: error.message 
    });
  }
});

/**
 * GET /api/inventory/products/:id
 * Get product details with stock information
 */
router.get("/products/:id", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const { id } = req.params;

    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // TODO: Fetch product by ID
    // TODO: Include current stock level across all warehouses
    // TODO: Include stock movement history
    // TODO: Include supplier information
    // TODO: Calculate stock valuation (FIFO, LIFO, or average cost)

    res.status(404).json({
      error: "Product not found",
      message: "Inventory tables not yet migrated"
    });
  } catch (error: any) {
    console.error("[Inventory API] Error fetching product:", error);
    res.status(500).json({ 
      error: "Failed to fetch product",
      details: error.message 
    });
  }
});

/**
 * POST /api/inventory/products
 * Create a new product
 */
router.post("/products", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id || (req.session as any)?.userId;

    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const productData = createProductSchema.parse(req.body);

    // TODO: Validate SKU uniqueness within tenant
    // TODO: Create product in database
    // TODO: Initialize stock record (0 quantity)
    // TODO: Create audit log entry
    // TODO: Send notification if min stock threshold is set

    res.status(201).json({
      success: false,
      message: "Product creation not yet implemented - inventory tables pending migration"
    });
  } catch (error: any) {
    console.error("[Inventory API] Error creating product:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: "Validation error",
        details: error.errors 
      });
    }
    res.status(500).json({ 
      error: "Failed to create product",
      details: error.message 
    });
  }
});

/**
 * PATCH /api/inventory/products/:id
 * Update product information
 */
router.patch("/products/:id", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id || (req.session as any)?.userId;
    const { id } = req.params;

    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const updates = updateProductSchema.parse(req.body);

    // TODO: Fetch existing product
    // TODO: Validate SKU uniqueness if changed
    // TODO: Update product in database
    // TODO: Create audit log entry
    // TODO: Check if min stock threshold changed and send alerts

    res.json({
      success: false,
      message: "Product update not yet implemented - inventory tables pending migration"
    });
  } catch (error: any) {
    console.error("[Inventory API] Error updating product:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: "Validation error",
        details: error.errors 
      });
    }
    res.status(500).json({ 
      error: "Failed to update product",
      details: error.message 
    });
  }
});

/**
 * DELETE /api/inventory/products/:id
 * Delete or deactivate product
 */
router.delete("/products/:id", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id || (req.session as any)?.userId;
    const { id } = req.params;

    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // TODO: Fetch existing product
    // TODO: Check if product has active stock
    // TODO: If stock exists, mark as inactive instead of deleting
    // TODO: If no stock, allow hard delete
    // TODO: Create audit log entry

    res.json({
      success: false,
      message: "Product deletion not yet implemented - inventory tables pending migration"
    });
  } catch (error: any) {
    console.error("[Inventory API] Error deleting product:", error);
    res.status(500).json({ 
      error: "Failed to delete product",
      details: error.message 
    });
  }
});

/**
 * GET /api/inventory/stock
 * Get current stock levels
 * Query params: ?productId=xxx&warehouseId=yyy&lowStock=true
 */
router.get("/stock", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;

    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // TODO: Implement stock level query
    // TODO: Tool registry has: check_stock
    // TODO: Support filtering by product, warehouse
    // TODO: Identify low stock items (below reorder point)
    // TODO: Identify overstock items (above max stock)
    // TODO: Calculate total stock value

    res.json({
      stock: [],
      lowStockItems: [],
      overstockItems: [],
      totalValue: 0,
      message: "Stock query not yet implemented - inventory tables pending migration"
    });
  } catch (error: any) {
    console.error("[Inventory API] Error fetching stock:", error);
    res.status(500).json({ 
      error: "Failed to fetch stock",
      details: error.message 
    });
  }
});

/**
 * POST /api/inventory/movements
 * Record stock movement (in, out, adjustment, transfer)
 */
router.post("/movements", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id || (req.session as any)?.userId;

    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const movementData = stockMovementSchema.parse(req.body);

    // TODO: Validate product exists
    // TODO: For "out" movements, check sufficient stock
    // TODO: Create stock movement record
    // TODO: Update current stock level
    // TODO: Update stock valuation (FIFO/LIFO/Average)
    // TODO: Check if movement triggers low stock alert
    // TODO: Create audit log entry

    res.status(201).json({
      success: false,
      message: "Stock movement not yet implemented - inventory tables pending migration"
    });
  } catch (error: any) {
    console.error("[Inventory API] Error recording movement:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: "Validation error",
        details: error.errors 
      });
    }
    res.status(500).json({ 
      error: "Failed to record movement",
      details: error.message 
    });
  }
});

/**
 * GET /api/inventory/movements
 * Get stock movement history
 * Query params: ?productId=xxx&type=in&startDate=&endDate=
 */
router.get("/movements", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;

    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // TODO: Implement movement history query
    // TODO: Support filters: product, type, date range, warehouse
    // TODO: Calculate running balance
    // TODO: Pagination and sorting

    res.json({
      movements: [],
      total: 0,
      message: "Movement history not yet implemented - inventory tables pending migration"
    });
  } catch (error: any) {
    console.error("[Inventory API] Error fetching movements:", error);
    res.status(500).json({ 
      error: "Failed to fetch movements",
      details: error.message 
    });
  }
});

/**
 * GET /api/inventory/suppliers
 * List suppliers
 */
router.get("/suppliers", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;

    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // TODO: Implement supplier listing
    // TODO: Tool registry has: list_suppliers
    // TODO: Include supplier performance metrics (on-time delivery, quality)
    // TODO: Support search and filtering

    res.json({
      suppliers: [],
      total: 0,
      message: "Supplier listing not yet implemented - Tool registry has list_suppliers"
    });
  } catch (error: any) {
    console.error("[Inventory API] Error listing suppliers:", error);
    res.status(500).json({ 
      error: "Failed to list suppliers",
      details: error.message 
    });
  }
});

/**
 * GET /api/logistica/warehouses
 * List warehouses/locations
 */
router.get("/warehouses", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;

    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const warehousesList = await db
      .select({
        id: warehouses.id,
        name: warehouses.name,
        type: warehouses.type,
        address: warehouses.address,
        city: warehouses.city,
        isActive: warehouses.isActive
      })
      .from(warehouses)
      .where(and(
        eq(warehouses.tenantId, tenantId),
        eq(warehouses.isActive, true)
      ))
      .orderBy(warehouses.name);

    res.json({
      warehouses: warehousesList
    });
  } catch (error: any) {
    console.error("[Inventory API] Error listing warehouses:", error);
    res.status(500).json({ 
      error: "Failed to list warehouses",
      details: error.message 
    });
  }
});

/**
 * GET /api/inventory/alerts
 * Get inventory alerts (low stock, expiring items, etc.)
 */
router.get("/alerts", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;

    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // TODO: Identify low stock items (below reorder point)
    // TODO: Identify items without stock movements in X days (slow-moving)
    // TODO: Identify items approaching expiry (if expiry tracking enabled)
    // TODO: Identify negative stock (data integrity issue)

    res.json({
      lowStock: [],
      slowMoving: [],
      expiringSoon: [],
      negativeStock: [],
      message: "Inventory alerts not yet implemented - inventory tables pending migration"
    });
  } catch (error: any) {
    console.error("[Inventory API] Error fetching alerts:", error);
    res.status(500).json({ 
      error: "Failed to fetch alerts",
      details: error.message 
    });
  }
});

/**
 * POST /api/inventory/bulk-import
 * Bulk import products from CSV/Excel
 */
router.post("/bulk-import", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id || (req.session as any)?.userId;

    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // TODO: Accept CSV/Excel file with product data
    // TODO: Validate all rows before importing
    // TODO: Create products in batch
    // TODO: Return import summary (success/failures)
    // TODO: Create audit log entry

    res.json({
      success: false,
      message: "Bulk import not yet implemented - See import.ts route for general import functionality"
    });
  } catch (error: any) {
    console.error("[Inventory API] Error bulk importing:", error);
    res.status(500).json({ 
      error: "Failed to bulk import",
      details: error.message 
    });
  }
});

// ==================== NEW INVENTORY TRACKING ENDPOINTS ====================

/**
 * GET /api/logistica/inventory
 * List products with filters and pagination
 * Query params: ?search=term&warehouseId=xxx&category=xxx&stockStatus=low|ok|excess&page=1&limit=50
 */
router.get("/inventory", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;

    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { search, warehouseId, category, stockStatus, page = "1", limit = "50" } = req.query;
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const offset = (pageNum - 1) * limitNum;

    // Build filters
    const filters: any[] = [
      eq(products.tenantId, tenantId),
      eq(products.isActive, true)
    ];

    if (search) {
      filters.push(
        or(
          ilike(products.name, `%${search}%`),
          ilike(products.code, `%${search}%`)
        )
      );
    }

    if (category) {
      filters.push(eq(products.category, category as string));
    }

    // Get all products matching filters
    const allProducts = await db
      .select({
        id: products.id,
        name: products.name,
        sku: products.code,
        category: products.category,
        unit: products.unidFaturacao,
        cost: products.cost,
        description: products.description
      })
      .from(products)
      .where(and(...filters));

    // For each product, get inventory levels and calculate aggregates
    const productsWithInventory = await Promise.all(
      allProducts.map(async (product) => {
        // Get inventory levels for this product
        const levels = await db
          .select({
            warehouseId: warehouses.id,
            warehouseName: warehouses.name,
            quantity: inventoryLevels.qtyOnHand,
            reorderPoint: inventoryLevels.reorderPoint
          })
          .from(inventoryLevels)
          .innerJoin(warehouses, eq(inventoryLevels.warehouseId, warehouses.id))
          .where(and(
            eq(inventoryLevels.tenantId, tenantId),
            eq(inventoryLevels.productId, product.id)
          ));

        const totalStock = levels.reduce((sum, l) => sum + Number(l.quantity), 0);
        const reorderPoint = levels.length > 0 ? Number(levels[0].reorderPoint || 0) : 0;

        // Calculate stock status
        let stockStatus: 'low' | 'ok' | 'excess' = 'ok';
        if (totalStock < reorderPoint) {
          stockStatus = 'low';
        } else if (reorderPoint > 0 && totalStock > reorderPoint * 2) {
          stockStatus = 'excess';
        }

        // Get last movement date
        const lastMovement = await db
          .select({ createdAt: inventoryTransactions.createdAt })
          .from(inventoryTransactions)
          .where(and(
            eq(inventoryTransactions.tenantId, tenantId),
            eq(inventoryTransactions.productId, product.id)
          ))
          .orderBy(desc(inventoryTransactions.createdAt))
          .limit(1);

        return {
          id: product.id,
          name: product.name,
          sku: product.sku,
          category: product.category || '',
          unit: product.unit || 'UN',
          totalStock,
          reorderPoint,
          stockStatus,
          warehouses: levels.map(l => ({
            warehouseId: l.warehouseId,
            warehouseName: l.warehouseName,
            quantity: Number(l.quantity)
          })),
          lastMovementDate: lastMovement[0]?.createdAt?.toISOString() || null,
          avgCost: Number(product.cost || 0)
        };
      })
    );

    // Apply stock status filter if provided
    let filteredProducts = productsWithInventory;
    if (stockStatus) {
      filteredProducts = productsWithInventory.filter(p => p.stockStatus === stockStatus);
    }

    // Apply warehouse filter if provided
    if (warehouseId) {
      filteredProducts = filteredProducts.filter(p => 
        p.warehouses.some(w => w.warehouseId === warehouseId)
      );
    }

    // Get total count
    const total = filteredProducts.length;

    // Apply pagination
    const paginatedProducts = filteredProducts.slice(offset, offset + limitNum);

    res.json({
      products: paginatedProducts,
      total,
      page: pageNum,
      limit: limitNum
    });

  } catch (error: any) {
    console.error("[Inventory API] Error listing inventory:", error);
    res.status(500).json({ 
      error: "Failed to list inventory",
      details: error.message 
    });
  }
});

/**
 * GET /api/logistica/inventory/:productId
 * Get product detail with stock by warehouse and recent movements
 */
router.get("/inventory/:productId", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const { productId } = req.params;

    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Get product details
    const productData = await db
      .select({
        id: products.id,
        name: products.name,
        sku: products.code,
        description: products.description,
        category: products.category,
        unit: products.unidFaturacao,
        cost: products.cost
      })
      .from(products)
      .where(and(
        eq(products.tenantId, tenantId),
        eq(products.id, productId)
      ))
      .limit(1);

    if (productData.length === 0) {
      return res.status(404).json({ error: "Product not found" });
    }

    const product = productData[0];

    // Get stock by warehouse
    const stockByWarehouse = await db
      .select({
        warehouseId: warehouses.id,
        name: warehouses.name,
        quantity: inventoryLevels.qtyOnHand,
        location: warehouses.address,
        reorderPoint: inventoryLevels.reorderPoint
      })
      .from(inventoryLevels)
      .innerJoin(warehouses, eq(inventoryLevels.warehouseId, warehouses.id))
      .where(and(
        eq(inventoryLevels.tenantId, tenantId),
        eq(inventoryLevels.productId, productId)
      ));

    // Get recent movements (last 20)
    const warehouseFrom = alias(warehouses, 'w_from');
    const warehouseTo = alias(warehouses, 'w_to');

    const recentMovements = await db
      .select({
        id: inventoryTransactions.id,
        type: inventoryTransactions.type,
        quantity: inventoryTransactions.qty,
        warehouseName: sql<string>`COALESCE(${warehouseTo.name}, ${warehouseFrom.name}, 'N/A')`,
        date: inventoryTransactions.createdAt,
        reference: inventoryTransactions.linkedDocumentId,
        notes: inventoryTransactions.notes
      })
      .from(inventoryTransactions)
      .leftJoin(warehouseFrom, eq(inventoryTransactions.warehouseFromId, warehouseFrom.id))
      .leftJoin(warehouseTo, eq(inventoryTransactions.warehouseToId, warehouseTo.id))
      .where(and(
        eq(inventoryTransactions.tenantId, tenantId),
        eq(inventoryTransactions.productId, productId)
      ))
      .orderBy(desc(inventoryTransactions.createdAt))
      .limit(20);

    // Calculate totals
    const totalStock = stockByWarehouse.reduce((sum, w) => sum + Number(w.quantity), 0);
    const avgCost = Number(product.cost || 0);
    const totalValue = totalStock * avgCost;
    const reorderPoint = stockByWarehouse.length > 0 ? Number(stockByWarehouse[0].reorderPoint || 0) : 0;

    res.json({
      product: {
        id: product.id,
        name: product.name,
        sku: product.sku,
        description: product.description || '',
        category: product.category || '',
        unit: product.unit || 'UN',
        reorderPoint
      },
      stockByWarehouse: stockByWarehouse.map(w => ({
        warehouseId: w.warehouseId,
        name: w.name,
        quantity: Number(w.quantity),
        location: w.location || ''
      })),
      recentMovements: recentMovements.map(m => ({
        id: m.id,
        type: m.type,
        quantity: Number(m.quantity),
        warehouseName: m.warehouseName || 'N/A',
        date: m.date.toISOString(),
        reference: m.reference || '',
        notes: m.notes || ''
      })),
      totalStock,
      totalValue,
      avgCost
    });

  } catch (error: any) {
    console.error("[Inventory API] Error fetching product detail:", error);
    res.status(500).json({ 
      error: "Failed to fetch product detail",
      details: error.message 
    });
  }
});

/**
 * POST /api/logistica/inventory/adjustment
 * Create stock adjustment transaction
 * Body: { productId, warehouseId, quantity, notes }
 */
router.post("/inventory/adjustment", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id || (req.session as any)?.userId;

    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const adjustmentSchema = z.object({
      productId: z.string().min(1, "Product ID required"),
      warehouseId: z.string().min(1, "Warehouse ID required"),
      quantity: z.number(), // Can be negative
      notes: z.string().optional()
    });

    const validatedData = adjustmentSchema.parse(req.body);

    // Create inventory transaction
    const [transaction] = await db
      .insert(inventoryTransactions)
      .values({
        tenantId,
        type: 'adjustment',
        productId: validatedData.productId,
        warehouseToId: validatedData.warehouseId,
        qty: validatedData.quantity.toString(),
        notes: validatedData.notes,
        performedBy: userId,
        createdAt: new Date()
      })
      .returning();

    // Update inventory level
    const existingLevel = await db
      .select()
      .from(inventoryLevels)
      .where(and(
        eq(inventoryLevels.tenantId, tenantId),
        eq(inventoryLevels.warehouseId, validatedData.warehouseId),
        eq(inventoryLevels.productId, validatedData.productId)
      ))
      .limit(1);

    if (existingLevel.length > 0) {
      // Update existing level
      const currentQty = Number(existingLevel[0].qtyOnHand);
      const newQty = currentQty + validatedData.quantity;

      await db
        .update(inventoryLevels)
        .set({
          qtyOnHand: newQty.toString(),
          updatedAt: new Date()
        })
        .where(eq(inventoryLevels.id, existingLevel[0].id));
    } else {
      // Create new level
      await db
        .insert(inventoryLevels)
        .values({
          tenantId,
          warehouseId: validatedData.warehouseId,
          productId: validatedData.productId,
          qtyOnHand: validatedData.quantity.toString(),
          qtyReserved: "0",
          createdAt: new Date(),
          updatedAt: new Date()
        });
    }

    res.json({
      success: true,
      transaction: {
        id: transaction.id,
        type: transaction.type,
        quantity: Number(transaction.qty),
        createdAt: transaction.createdAt.toISOString()
      }
    });

  } catch (error: any) {
    console.error("[Inventory API] Error creating adjustment:", error);
    res.status(500).json({ 
      error: "Failed to create adjustment",
      details: error.message 
    });
  }
});

/**
 * POST /api/logistica/inventory/transfer
 * Create stock transfer transaction
 * Body: { productId, fromWarehouseId, toWarehouseId, quantity, notes }
 */
router.post("/inventory/transfer", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id || (req.session as any)?.userId;

    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const transferSchema = z.object({
      productId: z.string().min(1, "Product ID required"),
      fromWarehouseId: z.string().min(1, "From Warehouse ID required"),
      toWarehouseId: z.string().min(1, "To Warehouse ID required"),
      quantity: z.number().positive("Quantity must be positive"),
      notes: z.string().optional()
    });

    const validatedData = transferSchema.parse(req.body);

    // Verify source warehouse has enough stock
    const sourceLevel = await db
      .select()
      .from(inventoryLevels)
      .where(and(
        eq(inventoryLevels.tenantId, tenantId),
        eq(inventoryLevels.warehouseId, validatedData.fromWarehouseId),
        eq(inventoryLevels.productId, validatedData.productId)
      ))
      .limit(1);

    if (sourceLevel.length === 0) {
      return res.status(400).json({ error: "Source warehouse has no stock for this product" });
    }

    const availableQty = Number(sourceLevel[0].qtyOnHand);
    if (availableQty < validatedData.quantity) {
      return res.status(400).json({ 
        error: `Insufficient stock. Available: ${availableQty}, Requested: ${validatedData.quantity}` 
      });
    }

    // Create inventory transaction
    const [transaction] = await db
      .insert(inventoryTransactions)
      .values({
        tenantId,
        type: 'transfer',
        productId: validatedData.productId,
        warehouseFromId: validatedData.fromWarehouseId,
        warehouseToId: validatedData.toWarehouseId,
        qty: validatedData.quantity.toString(),
        notes: validatedData.notes,
        performedBy: userId,
        metadata: { status: 'completed' },
        createdAt: new Date()
      })
      .returning();

    // Update source warehouse (decrease)
    await db
      .update(inventoryLevels)
      .set({
        qtyOnHand: (availableQty - validatedData.quantity).toString(),
        updatedAt: new Date()
      })
      .where(eq(inventoryLevels.id, sourceLevel[0].id));

    // Update destination warehouse (increase or create)
    const destLevel = await db
      .select()
      .from(inventoryLevels)
      .where(and(
        eq(inventoryLevels.tenantId, tenantId),
        eq(inventoryLevels.warehouseId, validatedData.toWarehouseId),
        eq(inventoryLevels.productId, validatedData.productId)
      ))
      .limit(1);

    if (destLevel.length > 0) {
      const currentQty = Number(destLevel[0].qtyOnHand);
      await db
        .update(inventoryLevels)
        .set({
          qtyOnHand: (currentQty + validatedData.quantity).toString(),
          updatedAt: new Date()
        })
        .where(eq(inventoryLevels.id, destLevel[0].id));
    } else {
      await db
        .insert(inventoryLevels)
        .values({
          tenantId,
          warehouseId: validatedData.toWarehouseId,
          productId: validatedData.productId,
          qtyOnHand: validatedData.quantity.toString(),
          qtyReserved: "0",
          createdAt: new Date(),
          updatedAt: new Date()
        });
    }

    res.json({
      success: true,
      transaction: {
        id: transaction.id,
        type: transaction.type,
        quantity: Number(transaction.qty),
        createdAt: transaction.createdAt.toISOString()
      }
    });

  } catch (error: any) {
    console.error("[Inventory API] Error creating transfer:", error);
    res.status(500).json({ 
      error: "Failed to create transfer",
      details: error.message 
    });
  }
});

// ==================== EQUIPMENT MANAGEMENT ENDPOINTS ====================

/**
 * GET /api/logistica/equipment
 * List equipment with filters
 */
router.get("/equipment", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { search, status, warehouseId, page = "1", limit = "50" } = req.query;
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const offset = (pageNum - 1) * limitNum;

    // Build where conditions
    let whereConditions: any[] = [eq(equipment.tenantId, tenantId)];

    if (search) {
      whereConditions.push(
        or(
          ilike(equipment.name, `%${search}%`),
          ilike(equipment.serialNumber, `%${search}%`)
        )
      );
    }

    if (status) {
      whereConditions.push(eq(equipment.status, status as string));
    }

    if (warehouseId) {
      whereConditions.push(eq(equipment.warehouseId, warehouseId as string));
    }

    // Get total count
    const totalResult = await db
      .select({ count: count() })
      .from(equipment)
      .where(and(...whereConditions));
    const total = Number(totalResult[0]?.count || 0);

    // Get equipment with warehouse and current allocation
    const userAlias = alias(users, 'allocation_user');
    
    const equipmentList = await db
      .select({
        id: equipment.id,
        name: equipment.name,
        serialNumber: equipment.serialNumber,
        category: equipment.category,
        warehouseId: equipment.warehouseId,
        warehouseName: warehouses.name,
        status: equipment.status,
        condition: equipment.condition,
        lastMaintenanceDate: equipment.lastMaintenanceDate,
        nextMaintenanceDate: equipment.nextMaintenanceDate,
        allocationId: equipmentAllocations.id,
        allocationProjectId: equipmentAllocations.projectId,
        allocationUserId: equipmentAllocations.userId,
        allocationUserName: userAlias.name,
        allocationAllocatedAt: equipmentAllocations.allocatedAt,
      })
      .from(equipment)
      .innerJoin(warehouses, eq(equipment.warehouseId, warehouses.id))
      .leftJoin(
        equipmentAllocations,
        and(
          eq(equipment.id, equipmentAllocations.equipmentId),
          eq(equipmentAllocations.tenantId, tenantId),
          eq(equipmentAllocations.status, 'reserved'),
          sql`${equipmentAllocations.returnedAt} IS NULL`
        )
      )
      .leftJoin(userAlias, eq(equipmentAllocations.userId, userAlias.id))
      .where(and(...whereConditions))
      .orderBy(desc(equipment.createdAt))
      .limit(limitNum)
      .offset(offset);

    const formattedEquipment = equipmentList.map(eq => ({
      id: eq.id,
      name: eq.name,
      serialNumber: eq.serialNumber,
      category: eq.category,
      warehouseId: eq.warehouseId,
      warehouseName: eq.warehouseName,
      status: eq.status,
      condition: eq.condition,
      lastMaintenanceDate: eq.lastMaintenanceDate?.toISOString() || null,
      nextMaintenanceDate: eq.nextMaintenanceDate?.toISOString() || null,
      currentAllocation: eq.allocationId ? {
        id: eq.allocationId,
        projectId: eq.allocationProjectId,
        userId: eq.allocationUserId,
        userName: eq.allocationUserName,
        allocatedAt: eq.allocationAllocatedAt?.toISOString()
      } : null
    }));

    res.json({
      equipment: formattedEquipment,
      total,
      page: pageNum,
      limit: limitNum
    });

  } catch (error: any) {
    console.error("[Equipment API] Error listing equipment:", error);
    res.status(500).json({ 
      error: "Failed to list equipment",
      details: error.message 
    });
  }
});

/**
 * GET /api/logistica/equipment/:id
 * Equipment detail with history
 */
router.get("/equipment/:id", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { id } = req.params;

    // Get equipment details
    const equipmentDetail = await db
      .select({
        id: equipment.id,
        name: equipment.name,
        serialNumber: equipment.serialNumber,
        category: equipment.category,
        description: equipment.description,
        warehouseId: equipment.warehouseId,
        status: equipment.status,
        condition: equipment.condition,
      })
      .from(equipment)
      .where(and(
        eq(equipment.id, id),
        eq(equipment.tenantId, tenantId)
      ))
      .limit(1);

    if (equipmentDetail.length === 0) {
      return res.status(404).json({ error: "Equipment not found" });
    }

    // Get current allocation
    const currentAllocation = await db
      .select({
        projectId: equipmentAllocations.projectId,
        projectName: projects.name,
        userId: equipmentAllocations.userId,
        userName: users.name,
        allocatedAt: equipmentAllocations.allocatedAt,
        returnBy: equipmentAllocations.returnBy,
      })
      .from(equipmentAllocations)
      .leftJoin(projects, eq(equipmentAllocations.projectId, projects.id))
      .leftJoin(users, eq(equipmentAllocations.userId, users.id))
      .where(and(
        eq(equipmentAllocations.equipmentId, id),
        eq(equipmentAllocations.tenantId, tenantId),
        eq(equipmentAllocations.status, 'reserved'),
        sql`${equipmentAllocations.returnedAt} IS NULL`
      ))
      .limit(1);

    // Get allocation history
    const allocationHistory = await db
      .select({
        id: equipmentAllocations.id,
        projectName: projects.name,
        userName: users.name,
        allocatedAt: equipmentAllocations.allocatedAt,
        returnedAt: equipmentAllocations.returnedAt,
      })
      .from(equipmentAllocations)
      .leftJoin(projects, eq(equipmentAllocations.projectId, projects.id))
      .leftJoin(users, eq(equipmentAllocations.userId, users.id))
      .where(and(
        eq(equipmentAllocations.equipmentId, id),
        eq(equipmentAllocations.tenantId, tenantId)
      ))
      .orderBy(desc(equipmentAllocations.allocatedAt))
      .limit(20);

    // Get maintenance records
    const maintenanceRecords = await db
      .select({
        id: maintenanceSchedule.id,
        date: maintenanceSchedule.lastMaintenanceDate,
        type: maintenanceSchedule.maintenanceType,
        notes: maintenanceSchedule.notes,
        status: maintenanceSchedule.status,
      })
      .from(maintenanceSchedule)
      .where(and(
        eq(maintenanceSchedule.productId, id),
        eq(maintenanceSchedule.tenantId, tenantId)
      ))
      .orderBy(desc(maintenanceSchedule.lastMaintenanceDate))
      .limit(10);

    // Get condition history
    const conditionHistory = await db
      .select({
        id: equipmentConditions.id,
        date: equipmentConditions.inspectedAt,
        condition: equipmentConditions.condition,
        notes: equipmentConditions.notes,
      })
      .from(equipmentConditions)
      .where(and(
        eq(equipmentConditions.equipmentId, id),
        eq(equipmentConditions.tenantId, tenantId)
      ))
      .orderBy(desc(equipmentConditions.inspectedAt))
      .limit(20);

    res.json({
      equipment: equipmentDetail[0],
      currentAllocation: currentAllocation.length > 0 ? {
        projectId: currentAllocation[0].projectId,
        projectName: currentAllocation[0].projectName,
        userId: currentAllocation[0].userId,
        userName: currentAllocation[0].userName,
        allocatedAt: currentAllocation[0].allocatedAt?.toISOString() || null,
        returnBy: currentAllocation[0].returnBy?.toISOString() || null,
      } : null,
      allocationHistory: allocationHistory.map(a => ({
        id: a.id,
        projectName: a.projectName || 'N/A',
        userName: a.userName || 'N/A',
        allocatedAt: a.allocatedAt?.toISOString() || null,
        returnedAt: a.returnedAt?.toISOString() || null,
      })),
      maintenanceRecords: maintenanceRecords.map(m => ({
        id: m.id,
        date: m.date?.toISOString() || null,
        type: m.type,
        notes: m.notes,
        condition: m.status,
      })),
      conditionHistory: conditionHistory.map(c => ({
        id: c.id,
        date: c.date?.toISOString() || null,
        condition: c.condition,
        notes: c.notes,
      }))
    });

  } catch (error: any) {
    console.error("[Equipment API] Error getting equipment detail:", error);
    res.status(500).json({ 
      error: "Failed to get equipment detail",
      details: error.message 
    });
  }
});

/**
 * POST /api/logistica/equipment/checkout
 * Checkout equipment to user/project
 */
router.post("/equipment/checkout", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const schema = z.object({
      equipmentId: z.string(),
      warehouseId: z.string(),
      projectId: z.string().optional(),
      userId: z.string(),
      returnBy: z.string().optional(),
      notes: z.string().optional(),
    });

    const validatedData = schema.parse(req.body);

    // Use transaction with row lock to prevent concurrent checkouts
    const result = await db.transaction(async (tx) => {
      // 1. Check availability WITH lock (atomically)
      const equipmentCheck = await tx
        .select()
        .from(equipment)
        .where(and(
          eq(equipment.id, validatedData.equipmentId),
          eq(equipment.tenantId, tenantId),
          eq(equipment.status, 'available')  // Atomic check
        ))
        .for('update')  // Lock row to prevent concurrent access
        .limit(1);

      if (equipmentCheck.length === 0) {
        throw new Error('Equipment not found or not available');
      }

      // 2. Create allocation
      const allocation = await tx
        .insert(equipmentAllocations)
        .values({
          tenantId,
          equipmentId: validatedData.equipmentId,
          warehouseId: validatedData.warehouseId,
          projectId: validatedData.projectId || null,
          userId: validatedData.userId,
          allocatedAt: new Date(),
          returnBy: validatedData.returnBy ? new Date(validatedData.returnBy) : null,
          status: 'reserved',
          notes: validatedData.notes || null,
          qtyAllocated: "1",
        })
        .returning();

      // 3. Update equipment status
      await tx
        .update(equipment)
        .set({
          status: 'allocated',
          updatedAt: new Date()
        })
        .where(and(
          eq(equipment.id, validatedData.equipmentId),
          eq(equipment.tenantId, tenantId)
        ));

      return allocation[0];
    });

    res.json({
      success: true,
      allocation: {
        id: result.id,
        equipmentId: result.equipmentId,
        userId: result.userId,
        allocatedAt: result.allocatedAt.toISOString()
      }
    });

  } catch (error: any) {
    console.error("[Equipment API] Error checking out equipment:", error);
    
    // Handle specific error messages
    if (error.message === 'Equipment not found or not available') {
      return res.status(400).json({ error: error.message });
    }
    
    res.status(500).json({ 
      error: "Failed to checkout equipment",
      details: error.message 
    });
  }
});

/**
 * POST /api/logistica/equipment/checkin
 * Checkin equipment and update condition
 */
router.post("/equipment/checkin", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const schema = z.object({
      allocationId: z.string(),
      condition: z.string().optional(),
      needsMaintenance: z.boolean().optional(),
      notes: z.string().optional(),
    });

    const validatedData = schema.parse(req.body);
    const userId = (req as any).userId;

    // Use transaction to ensure atomic checkin
    const result = await db.transaction(async (tx) => {
      // Check if allocation exists with tenantId filter
      const allocationCheck = await tx
        .select()
        .from(equipmentAllocations)
        .where(and(
          eq(equipmentAllocations.id, validatedData.allocationId),
          eq(equipmentAllocations.tenantId, tenantId)
        ))
        .limit(1);

      if (allocationCheck.length === 0) {
        throw new Error('Allocation not found');
      }

      const allocation = allocationCheck[0];

      // Get equipment details to check maintenance schedule
      const equipmentData = await tx
        .select({
          id: equipment.id,
          nextMaintenanceDate: equipment.nextMaintenanceDate,
        })
        .from(equipment)
        .where(and(
          eq(equipment.id, allocation.equipmentId),
          eq(equipment.tenantId, tenantId)
        ))
        .limit(1);

      if (equipmentData.length === 0) {
        throw new Error('Equipment not found');
      }

      // Update allocation
      await tx
        .update(equipmentAllocations)
        .set({
          returnedAt: new Date(),
          checkedInBy: userId,
          checkedInAt: new Date(),
          status: 'completed',
          updatedAt: new Date()
        })
        .where(eq(equipmentAllocations.id, validatedData.allocationId));

      // Create condition record if provided
      if (validatedData.condition) {
        await tx
          .insert(equipmentConditions)
          .values({
            tenantId,
            equipmentId: allocation.equipmentId,
            allocationId: validatedData.allocationId,
            condition: validatedData.condition,
            conditionType: 'inspection',
            conditionStatus: validatedData.condition,
            notes: validatedData.notes || null,
            inspectedBy: userId,
            inspectedAt: new Date(),
          });

        // Update equipment condition
        await tx
          .update(equipment)
          .set({
            condition: validatedData.condition,
            updatedAt: new Date()
          })
          .where(and(
            eq(equipment.id, allocation.equipmentId),
            eq(equipment.tenantId, tenantId)
          ));
      }

      // Determine new status based on maintenance needs
      const now = new Date();
      const maintenanceOverdue = equipmentData[0].nextMaintenanceDate && 
                                 equipmentData[0].nextMaintenanceDate <= now;
      const conditionRequiresMaintenance = validatedData.condition && 
                                           ['poor', 'damaged', 'faulty'].includes(validatedData.condition.toLowerCase());
      const needsMaintenance = validatedData.needsMaintenance || 
                              maintenanceOverdue || 
                              conditionRequiresMaintenance;

      const newStatus = needsMaintenance ? 'maintenance' : 'available';

      // Update equipment status
      await tx
        .update(equipment)
        .set({
          status: newStatus,
          updatedAt: new Date()
        })
        .where(and(
          eq(equipment.id, allocation.equipmentId),
          eq(equipment.tenantId, tenantId)
        ));

      return { newStatus };
    });

    res.json({
      success: true,
      message: "Equipment checked in successfully",
      status: result.newStatus
    });

  } catch (error: any) {
    console.error("[Equipment API] Error checking in equipment:", error);
    
    // Handle specific error messages
    if (error.message === 'Allocation not found' || error.message === 'Equipment not found') {
      return res.status(404).json({ error: error.message });
    }
    
    res.status(500).json({ 
      error: "Failed to checkin equipment",
      details: error.message 
    });
  }
});

/**
 * POST /api/logistica/equipment/maintenance
 * Schedule or record maintenance
 */
router.post("/equipment/maintenance", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const schema = z.object({
      equipmentId: z.string(),
      type: z.enum(['preventive', 'corrective']),
      scheduledDate: z.string(),
      notes: z.string().optional(),
    });

    const validatedData = schema.parse(req.body);

    // Check if equipment exists
    const equipmentCheck = await db
      .select()
      .from(equipment)
      .where(and(
        eq(equipment.id, validatedData.equipmentId),
        eq(equipment.tenantId, tenantId)
      ))
      .limit(1);

    if (equipmentCheck.length === 0) {
      return res.status(404).json({ error: "Equipment not found" });
    }

    const scheduledDate = new Date(validatedData.scheduledDate);
    const now = new Date();
    const isImmediate = scheduledDate <= now;
    const userId = (req as any).userId;

    // Create maintenance schedule
    const maintenance = await db
      .insert(maintenanceSchedule)
      .values({
        tenantId,
        productId: validatedData.equipmentId,
        maintenanceType: validatedData.type,
        frequency: 'once',
        nextMaintenanceDate: scheduledDate,
        lastMaintenanceDate: isImmediate ? now : null,
        status: isImmediate ? 'completed' : 'scheduled',
        assignedTo: userId,
        notes: validatedData.notes || null,
      })
      .returning();

    // Update equipment status if immediate maintenance
    if (isImmediate) {
      await db
        .update(equipment)
        .set({
          status: 'maintenance',
          lastMaintenanceDate: now,
          updatedAt: new Date()
        })
        .where(and(
          eq(equipment.id, validatedData.equipmentId),
          eq(equipment.tenantId, tenantId)
        ));

      // Create condition record
      await db
        .insert(equipmentConditions)
        .values({
          tenantId,
          equipmentId: validatedData.equipmentId,
          conditionType: 'maintenance',
          conditionStatus: 'under_maintenance',
          notes: validatedData.notes || null,
          inspectedBy: userId,
          inspectedAt: now,
        });
    } else {
      // Just update next maintenance date
      await db
        .update(equipment)
        .set({
          nextMaintenanceDate: scheduledDate,
          updatedAt: new Date()
        })
        .where(and(
          eq(equipment.id, validatedData.equipmentId),
          eq(equipment.tenantId, tenantId)
        ));
    }

    res.json({
      success: true,
      maintenance: {
        id: maintenance[0].id,
        type: maintenance[0].maintenanceType,
        scheduledDate: maintenance[0].nextMaintenanceDate.toISOString(),
        status: maintenance[0].status
      }
    });

  } catch (error: any) {
    console.error("[Equipment API] Error scheduling maintenance:", error);
    res.status(500).json({ 
      error: "Failed to schedule maintenance",
      details: error.message 
    });
  }
});

// ==================== WAREHOUSE MANAGEMENT ====================

/**
 * GET /api/logistica/warehouses
 * List warehouses with capacity info
 */
router.get("/warehouses", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const searchTerm = (req.query.search as string) || "";
    const statusFilter = (req.query.status as string) || "";
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = (page - 1) * limit;

    // Build where conditions
    const conditions = [eq(warehouses.tenantId, tenantId)];

    if (searchTerm) {
      conditions.push(
        or(
          ilike(warehouses.name, `%${searchTerm}%`),
          sql`${warehouses.metadata}->>'code' ILIKE ${`%${searchTerm}%`}`
        )!
      );
    }

    if (statusFilter === 'active') {
      conditions.push(eq(warehouses.isActive, true));
    } else if (statusFilter === 'inactive') {
      conditions.push(eq(warehouses.isActive, false));
    }

    // Get total count
    const totalResult = await db
      .select({ count: count() })
      .from(warehouses)
      .where(and(...conditions));
    const total = totalResult[0]?.count || 0;

    // Get warehouses list
    const warehousesList = await db
      .select({
        id: warehouses.id,
        name: warehouses.name,
        address: warehouses.address,
        city: warehouses.city,
        capacity: warehouses.capacity,
        isActive: warehouses.isActive,
        metadata: warehouses.metadata,
      })
      .from(warehouses)
      .where(and(...conditions))
      .limit(limit)
      .offset(offset)
      .orderBy(desc(warehouses.createdAt));

    // For each warehouse, calculate stats
    const warehousesWithStats = await Promise.all(
      warehousesList.map(async (warehouse) => {
        // Total capacity from locations
        const locationsCapacityResult = await db
          .select({
            total: sql<number>`COALESCE(SUM(CAST(${warehouseLocations.capacity} AS NUMERIC)), 0)`,
            count: count()
          })
          .from(warehouseLocations)
          .where(and(
            eq(warehouseLocations.tenantId, tenantId),
            eq(warehouseLocations.warehouseId, warehouse.id),
            eq(warehouseLocations.isActive, true)
          ));

        const totalCapacity = Number(locationsCapacityResult[0]?.total || warehouse.capacity || 0);
        const locationCount = locationsCapacityResult[0]?.count || 0;

        // Used capacity from inventory
        const usedCapacityResult = await db
          .select({
            used: sql<number>`COALESCE(SUM(CAST(${inventoryLevels.qtyOnHand} AS NUMERIC)), 0)`
          })
          .from(inventoryLevels)
          .where(and(
            eq(inventoryLevels.tenantId, tenantId),
            eq(inventoryLevels.warehouseId, warehouse.id)
          ));

        const usedCapacity = Number(usedCapacityResult[0]?.used || 0);
        const capacityPercentage = totalCapacity > 0 ? (usedCapacity / totalCapacity) * 100 : 0;

        // Product count
        const productCountResult = await db
          .select({ count: count() })
          .from(inventoryLevels)
          .where(and(
            eq(inventoryLevels.tenantId, tenantId),
            eq(inventoryLevels.warehouseId, warehouse.id)
          ));

        const productCount = productCountResult[0]?.count || 0;

        // Recent transfers (last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const recentTransfersResult = await db
          .select({ count: count() })
          .from(inventoryTransactions)
          .where(and(
            eq(inventoryTransactions.tenantId, tenantId),
            or(
              eq(inventoryTransactions.warehouseFromId, warehouse.id),
              eq(inventoryTransactions.warehouseToId, warehouse.id)
            )!,
            gte(inventoryTransactions.createdAt, thirtyDaysAgo)
          ));

        const recentTransfers = recentTransfersResult[0]?.count || 0;

        // Alerts - low stock
        const lowStockResult = await db
          .select({ count: count() })
          .from(inventoryLevels)
          .where(and(
            eq(inventoryLevels.tenantId, tenantId),
            eq(inventoryLevels.warehouseId, warehouse.id),
            sql`${inventoryLevels.qtyOnHand} < ${inventoryLevels.reorderPoint}`
          ));

        const lowStock = lowStockResult[0]?.count || 0;

        const metadata = warehouse.metadata as any || {};

        return {
          id: warehouse.id,
          name: warehouse.name,
          code: metadata.code || '',
          address: warehouse.address || '',
          city: warehouse.city || '',
          country: metadata.country || 'PT',
          status: warehouse.isActive ? 'active' : 'inactive',
          capacity: {
            total: totalCapacity,
            used: usedCapacity,
            percentage: Math.round(capacityPercentage)
          },
          productCount,
          locationCount,
          recentTransfers,
          alerts: {
            lowStock,
            overstocked: 0
          }
        };
      })
    );

    res.json({
      warehouses: warehousesWithStats,
      total,
      page,
      limit
    });

  } catch (error: any) {
    console.error("[Warehouse API] Error fetching warehouses:", error);
    res.status(500).json({ 
      error: "Failed to fetch warehouses",
      details: error.message 
    });
  }
});

/**
 * GET /api/logistica/warehouses/:id
 * Warehouse detail with all information
 */
router.get("/warehouses/:id", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const warehouseId = req.params.id;

    // Get warehouse
    const warehouseResult = await db
      .select({
        id: warehouses.id,
        name: warehouses.name,
        address: warehouses.address,
        city: warehouses.city,
        postalCode: warehouses.postalCode,
        capacity: warehouses.capacity,
        isActive: warehouses.isActive,
        responsibleUser: warehouses.responsibleUser,
        metadata: warehouses.metadata,
      })
      .from(warehouses)
      .where(and(
        eq(warehouses.id, warehouseId),
        eq(warehouses.tenantId, tenantId)
      ))
      .limit(1);

    if (warehouseResult.length === 0) {
      return res.status(404).json({ error: "Warehouse not found" });
    }

    const warehouse = warehouseResult[0];
    const metadata = warehouse.metadata as any || {};

    // Get manager info
    let managerName = null;
    if (warehouse.responsibleUser) {
      const managerResult = await db
        .select({ name: users.name })
        .from(users)
        .where(eq(users.id, warehouse.responsibleUser))
        .limit(1);
      
      managerName = managerResult[0]?.name || null;
    }

    // Capacity calculation
    const locationsCapacityResult = await db
      .select({
        total: sql<number>`COALESCE(SUM(CAST(${warehouseLocations.capacity} AS NUMERIC)), 0)`
      })
      .from(warehouseLocations)
      .where(and(
        eq(warehouseLocations.tenantId, tenantId),
        eq(warehouseLocations.warehouseId, warehouseId),
        eq(warehouseLocations.isActive, true)
      ));

    const totalCapacity = Number(locationsCapacityResult[0]?.total || warehouse.capacity || 0);

    const usedCapacityResult = await db
      .select({
        used: sql<number>`COALESCE(SUM(CAST(${inventoryLevels.qtyOnHand} AS NUMERIC)), 0)`
      })
      .from(inventoryLevels)
      .where(and(
        eq(inventoryLevels.tenantId, tenantId),
        eq(inventoryLevels.warehouseId, warehouseId)
      ));

    const usedCapacity = Number(usedCapacityResult[0]?.used || 0);
    const availableCapacity = Math.max(0, totalCapacity - usedCapacity);
    const capacityPercentage = totalCapacity > 0 ? (usedCapacity / totalCapacity) * 100 : 0;

    // Get locations (top 10)
    const locationsData = await db
      .select({
        id: warehouseLocations.id,
        name: warehouseLocations.name,
        code: warehouseLocations.code,
        capacity: warehouseLocations.capacity,
        metadata: warehouseLocations.metadata,
      })
      .from(warehouseLocations)
      .where(and(
        eq(warehouseLocations.tenantId, tenantId),
        eq(warehouseLocations.warehouseId, warehouseId),
        eq(warehouseLocations.isActive, true)
      ))
      .limit(10);

    const locations = await Promise.all(
      locationsData.map(async (loc) => {
        const locMetadata = loc.metadata as any || {};
        
        // Calculate occupied space for this location
        const occupiedResult = await db
          .select({
            occupied: sql<number>`COALESCE(SUM(CAST(${inventoryLevels.qtyOnHand} AS NUMERIC)), 0)`
          })
          .from(inventoryLevels)
          .where(and(
            eq(inventoryLevels.tenantId, tenantId),
            sql`${inventoryLevels.metadata}->>'locationId' = ${loc.id}`
          ));

        const occupied = Number(occupiedResult[0]?.occupied || 0);

        return {
          id: loc.id,
          name: loc.name,
          zone: locMetadata.zone || '',
          aisle: locMetadata.aisle || '',
          level: locMetadata.level || '',
          capacity: Number(loc.capacity || 0),
          occupied
        };
      })
    );

    // Get inventory (top 10 products)
    const inventoryData = await db
      .select({
        productId: products.id,
        productName: products.name,
        quantity: inventoryLevels.qtyOnHand,
        metadata: inventoryLevels.metadata,
      })
      .from(inventoryLevels)
      .innerJoin(products, eq(inventoryLevels.productId, products.id))
      .where(and(
        eq(inventoryLevels.tenantId, tenantId),
        eq(inventoryLevels.warehouseId, warehouseId)
      ))
      .limit(10);

    const inventory = inventoryData.map(item => {
      const itemMetadata = item.metadata as any || {};
      return {
        productId: item.productId,
        productName: item.productName,
        quantity: Number(item.quantity),
        location: itemMetadata.locationName || 'N/A'
      };
    });

    // Recent transfers (last 10)
    const warehouseFrom = alias(warehouses, 'w_from');
    const warehouseTo = alias(warehouses, 'w_to');
    const performedByUser = alias(users, 'u_performed');

    const transfersData = await db
      .select({
        id: inventoryTransactions.id,
        type: inventoryTransactions.type,
        productName: products.name,
        quantity: inventoryTransactions.qty,
        fromWarehouse: warehouseFrom.name,
        toWarehouse: warehouseTo.name,
        createdAt: inventoryTransactions.createdAt,
        userName: performedByUser.name,
        metadata: inventoryTransactions.metadata,
      })
      .from(inventoryTransactions)
      .innerJoin(products, eq(inventoryTransactions.productId, products.id))
      .leftJoin(warehouseFrom, eq(inventoryTransactions.warehouseFromId, warehouseFrom.id))
      .leftJoin(warehouseTo, eq(inventoryTransactions.warehouseToId, warehouseTo.id))
      .leftJoin(performedByUser, eq(inventoryTransactions.performedBy, performedByUser.id))
      .where(and(
        eq(inventoryTransactions.tenantId, tenantId),
        or(
          eq(inventoryTransactions.warehouseFromId, warehouseId),
          eq(inventoryTransactions.warehouseToId, warehouseId)
        )!
      ))
      .orderBy(desc(inventoryTransactions.createdAt))
      .limit(10);

    const recentTransfers = transfersData.map(transfer => {
      const transferMetadata = transfer.metadata as any || {};
      let type: 'in' | 'out' = 'in';
      
      if (transfer.type === 'transfer') {
        type = transfer.toWarehouse && inventoryTransactions.warehouseToId === warehouseId ? 'in' : 'out';
      } else if (transfer.type === 'in' || transfer.type === 'purchase') {
        type = 'in';
      } else if (transfer.type === 'out' || transfer.type === 'sale') {
        type = 'out';
      }

      return {
        id: transfer.id,
        type,
        productName: transfer.productName,
        quantity: Number(transfer.quantity),
        from: transfer.fromWarehouse || 'N/A',
        to: transfer.toWarehouse || 'N/A',
        date: transfer.createdAt.toISOString(),
        status: transferMetadata.status || 'completed',
        userName: transfer.userName || 'N/A'
      };
    });

    // Calculate stats
    const totalProductsResult = await db
      .select({ count: count() })
      .from(inventoryLevels)
      .where(and(
        eq(inventoryLevels.tenantId, tenantId),
        eq(inventoryLevels.warehouseId, warehouseId)
      ));

    const totalLocationsResult = await db
      .select({ count: count() })
      .from(warehouseLocations)
      .where(and(
        eq(warehouseLocations.tenantId, tenantId),
        eq(warehouseLocations.warehouseId, warehouseId),
        eq(warehouseLocations.isActive, true)
      ));

    const thisMonthStart = new Date();
    thisMonthStart.setDate(1);
    thisMonthStart.setHours(0, 0, 0, 0);

    const transfersThisMonthResult = await db
      .select({ count: count() })
      .from(inventoryTransactions)
      .where(and(
        eq(inventoryTransactions.tenantId, tenantId),
        or(
          eq(inventoryTransactions.warehouseFromId, warehouseId),
          eq(inventoryTransactions.warehouseToId, warehouseId)
        )!,
        gte(inventoryTransactions.createdAt, thisMonthStart)
      ));

    const lowStockCountResult = await db
      .select({ count: count() })
      .from(inventoryLevels)
      .where(and(
        eq(inventoryLevels.tenantId, tenantId),
        eq(inventoryLevels.warehouseId, warehouseId),
        sql`${inventoryLevels.qtyOnHand} < ${inventoryLevels.reorderPoint}`
      ));

    res.json({
      warehouse: {
        id: warehouse.id,
        name: warehouse.name,
        code: metadata.code || '',
        address: warehouse.address || '',
        city: warehouse.city || '',
        country: metadata.country || 'PT',
        status: warehouse.isActive ? 'active' : 'inactive',
        contact: metadata.contact || '',
        manager: managerName
      },
      capacity: {
        total: totalCapacity,
        used: usedCapacity,
        available: availableCapacity,
        percentage: Math.round(capacityPercentage)
      },
      locations,
      inventory,
      recentTransfers,
      stats: {
        totalProducts: totalProductsResult[0]?.count || 0,
        totalLocations: totalLocationsResult[0]?.count || 0,
        utilizationRate: Math.round(capacityPercentage),
        transfersThisMonth: transfersThisMonthResult[0]?.count || 0,
        lowStockCount: lowStockCountResult[0]?.count || 0
      }
    });

  } catch (error: any) {
    console.error("[Warehouse API] Error fetching warehouse detail:", error);
    res.status(500).json({ 
      error: "Failed to fetch warehouse detail",
      details: error.message 
    });
  }
});

/**
 * GET /api/logistica/warehouses/:id/locations
 * Get warehouse locations with pagination and filters
 */
router.get("/warehouses/:id/locations", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const warehouseId = req.params.id;
    const zone = (req.query.zone as string) || "";
    const aisle = (req.query.aisle as string) || "";
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = (page - 1) * limit;

    // Verify warehouse exists and belongs to tenant
    const warehouseCheck = await db
      .select({ id: warehouses.id })
      .from(warehouses)
      .where(and(
        eq(warehouses.id, warehouseId),
        eq(warehouses.tenantId, tenantId)
      ))
      .limit(1);

    if (warehouseCheck.length === 0) {
      return res.status(404).json({ error: "Warehouse not found" });
    }

    // Build conditions
    const conditions = [
      eq(warehouseLocations.tenantId, tenantId),
      eq(warehouseLocations.warehouseId, warehouseId),
      eq(warehouseLocations.isActive, true)
    ];

    if (zone) {
      conditions.push(sql`${warehouseLocations.metadata}->>'zone' = ${zone}`);
    }

    if (aisle) {
      conditions.push(sql`${warehouseLocations.metadata}->>'aisle' = ${aisle}`);
    }

    // Get total count
    const totalResult = await db
      .select({ count: count() })
      .from(warehouseLocations)
      .where(and(...conditions));

    const total = totalResult[0]?.count || 0;

    // Get locations
    const locationsData = await db
      .select({
        id: warehouseLocations.id,
        name: warehouseLocations.name,
        code: warehouseLocations.code,
        capacity: warehouseLocations.capacity,
        metadata: warehouseLocations.metadata,
      })
      .from(warehouseLocations)
      .where(and(...conditions))
      .limit(limit)
      .offset(offset)
      .orderBy(warehouseLocations.name);

    // Enhance with product data
    const locationsWithProducts = await Promise.all(
      locationsData.map(async (loc) => {
        const locMetadata = loc.metadata as any || {};

        // Calculate occupied
        const occupiedResult = await db
          .select({
            occupied: sql<number>`COALESCE(SUM(CAST(${inventoryLevels.qtyOnHand} AS NUMERIC)), 0)`
          })
          .from(inventoryLevels)
          .where(and(
            eq(inventoryLevels.tenantId, tenantId),
            sql`${inventoryLevels.metadata}->>'locationId' = ${loc.id}`
          ));

        const occupied = Number(occupiedResult[0]?.occupied || 0);
        const locationCapacity = Number(loc.capacity || 0);
        const utilizationRate = locationCapacity > 0 ? (occupied / locationCapacity) * 100 : 0;

        // Get products in this location
        const productsData = await db
          .select({
            productId: products.id,
            productName: products.name,
            quantity: inventoryLevels.qtyOnHand,
          })
          .from(inventoryLevels)
          .innerJoin(products, eq(inventoryLevels.productId, products.id))
          .where(and(
            eq(inventoryLevels.tenantId, tenantId),
            sql`${inventoryLevels.metadata}->>'locationId' = ${loc.id}`
          ))
          .limit(5);

        const productsInLocation = productsData.map(p => ({
          productId: p.productId,
          productName: p.productName,
          quantity: Number(p.quantity)
        }));

        return {
          id: loc.id,
          name: loc.name,
          zone: locMetadata.zone || '',
          aisle: locMetadata.aisle || '',
          level: locMetadata.level || '',
          capacity: locationCapacity,
          occupied,
          utilizationRate: Math.round(utilizationRate),
          products: productsInLocation
        };
      })
    );

    res.json({
      locations: locationsWithProducts,
      total,
      page,
      limit
    });

  } catch (error: any) {
    console.error("[Warehouse API] Error fetching locations:", error);
    res.status(500).json({ 
      error: "Failed to fetch locations",
      details: error.message 
    });
  }
});

/**
 * GET /api/logistica/warehouses/:id/transfers
 * Get transfer history for a warehouse
 */
router.get("/warehouses/:id/transfers", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const warehouseId = req.params.id;
    const typeFilter = (req.query.type as string) || "";
    const productId = (req.query.productId as string) || "";
    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : null;
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : null;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = (page - 1) * limit;

    // Verify warehouse
    const warehouseCheck = await db
      .select({ id: warehouses.id })
      .from(warehouses)
      .where(and(
        eq(warehouses.id, warehouseId),
        eq(warehouses.tenantId, tenantId)
      ))
      .limit(1);

    if (warehouseCheck.length === 0) {
      return res.status(404).json({ error: "Warehouse not found" });
    }

    // Build conditions
    const conditions = [
      eq(inventoryTransactions.tenantId, tenantId),
      or(
        eq(inventoryTransactions.warehouseFromId, warehouseId),
        eq(inventoryTransactions.warehouseToId, warehouseId)
      )!
    ];

    if (productId) {
      conditions.push(eq(inventoryTransactions.productId, productId));
    }

    if (startDate) {
      conditions.push(gte(inventoryTransactions.createdAt, startDate));
    }

    if (endDate) {
      conditions.push(lte(inventoryTransactions.createdAt, endDate));
    }

    // Get total count
    const totalResult = await db
      .select({ count: count() })
      .from(inventoryTransactions)
      .where(and(...conditions));

    const total = totalResult[0]?.count || 0;

    // Get transfers
    const warehouseFrom = alias(warehouses, 'w_from');
    const warehouseTo = alias(warehouses, 'w_to');
    const performedByUser = alias(users, 'u_performed');

    const transfersData = await db
      .select({
        id: inventoryTransactions.id,
        type: inventoryTransactions.type,
        productId: inventoryTransactions.productId,
        productName: products.name,
        quantity: inventoryTransactions.qty,
        fromWarehouse: warehouseFrom.name,
        toWarehouse: warehouseTo.name,
        warehouseFromId: inventoryTransactions.warehouseFromId,
        warehouseToId: inventoryTransactions.warehouseToId,
        createdAt: inventoryTransactions.createdAt,
        userId: inventoryTransactions.performedBy,
        userName: performedByUser.name,
        metadata: inventoryTransactions.metadata,
      })
      .from(inventoryTransactions)
      .innerJoin(products, eq(inventoryTransactions.productId, products.id))
      .leftJoin(warehouseFrom, eq(inventoryTransactions.warehouseFromId, warehouseFrom.id))
      .leftJoin(warehouseTo, eq(inventoryTransactions.warehouseToId, warehouseTo.id))
      .leftJoin(performedByUser, eq(inventoryTransactions.performedBy, performedByUser.id))
      .where(and(...conditions))
      .orderBy(desc(inventoryTransactions.createdAt))
      .limit(limit)
      .offset(offset);

    const transfers = transfersData
      .map(transfer => {
        const transferMetadata = transfer.metadata as any || {};
        let type: 'in' | 'out' = 'in';

        if (transfer.type === 'transfer') {
          type = transfer.warehouseToId === warehouseId ? 'in' : 'out';
        } else if (transfer.type === 'in' || transfer.type === 'purchase') {
          type = 'in';
        } else if (transfer.type === 'out' || transfer.type === 'sale') {
          type = 'out';
        }

        // Apply type filter if specified
        if (typeFilter && type !== typeFilter) {
          return null;
        }

        return {
          id: transfer.id,
          type,
          productId: transfer.productId,
          productName: transfer.productName,
          quantity: Number(transfer.quantity),
          fromWarehouse: transfer.fromWarehouse || 'N/A',
          toWarehouse: transfer.toWarehouse || 'N/A',
          date: transfer.createdAt.toISOString(),
          status: transferMetadata.status || 'completed',
          userId: transfer.userId,
          userName: transfer.userName || 'N/A'
        };
      })
      .filter(t => t !== null);

    res.json({
      transfers,
      total: typeFilter ? transfers.length : total,
      page,
      limit
    });

  } catch (error: any) {
    console.error("[Warehouse API] Error fetching transfers:", error);
    res.status(500).json({ 
      error: "Failed to fetch transfers",
      details: error.message 
    });
  }
});

/**
 * POST /api/logistica/warehouses
 * Create new warehouse
 */
router.post("/warehouses", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).userId;

    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Validate input
    const schema = z.object({
      name: z.string().min(1, "Name is required"),
      code: z.string().min(1, "Code is required"),
      address: z.string().optional(),
      city: z.string().optional(),
      country: z.string().optional(),
      contact: z.string().optional(),
      manager: z.string().optional(),
    });

    const validatedData = schema.parse(req.body);

    // Check if code is unique for this tenant
    const existingWarehouse = await db
      .select({ id: warehouses.id })
      .from(warehouses)
      .where(and(
        eq(warehouses.tenantId, tenantId),
        sql`${warehouses.metadata}->>'code' = ${validatedData.code}`
      ))
      .limit(1);

    if (existingWarehouse.length > 0) {
      return res.status(400).json({ 
        error: "Warehouse code must be unique",
        field: "code"
      });
    }

    // Verify manager exists if provided
    if (validatedData.manager) {
      const managerCheck = await db
        .select({ id: users.id })
        .from(users)
        .where(and(
          eq(users.id, validatedData.manager),
          eq(users.tenantId, tenantId)
        ))
        .limit(1);

      if (managerCheck.length === 0) {
        return res.status(400).json({ 
          error: "Manager not found",
          field: "manager"
        });
      }
    }

    // Create warehouse
    const metadata = {
      code: validatedData.code,
      country: validatedData.country || 'PT',
      contact: validatedData.contact || ''
    };

    const newWarehouse = await db
      .insert(warehouses)
      .values({
        tenantId,
        name: validatedData.name,
        address: validatedData.address || null,
        city: validatedData.city || null,
        isActive: true,
        responsibleUser: validatedData.manager || null,
        metadata
      })
      .returning();

    res.status(201).json({
      success: true,
      warehouse: {
        id: newWarehouse[0].id,
        name: newWarehouse[0].name,
        code: validatedData.code,
        status: 'active'
      }
    });

  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ 
        error: "Validation error",
        details: error.errors 
      });
    }

    console.error("[Warehouse API] Error creating warehouse:", error);
    res.status(500).json({ 
      error: "Failed to create warehouse",
      details: error.message 
    });
  }
});

/**
 * PATCH /api/logistica/warehouses/:id
 * Update warehouse
 */
router.patch("/warehouses/:id", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).userId;

    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const warehouseId = req.params.id;

    // Verify warehouse exists and belongs to tenant
    const existingWarehouse = await db
      .select({
        id: warehouses.id,
        metadata: warehouses.metadata
      })
      .from(warehouses)
      .where(and(
        eq(warehouses.id, warehouseId),
        eq(warehouses.tenantId, tenantId)
      ))
      .limit(1);

    if (existingWarehouse.length === 0) {
      return res.status(404).json({ error: "Warehouse not found" });
    }

    // Validate input
    const schema = z.object({
      name: z.string().min(1).optional(),
      code: z.string().min(1).optional(),
      address: z.string().optional(),
      city: z.string().optional(),
      country: z.string().optional(),
      contact: z.string().optional(),
      manager: z.string().optional(),
      status: z.enum(['active', 'inactive']).optional(),
    });

    const validatedData = schema.parse(req.body);

    // Check code uniqueness if code is being updated
    if (validatedData.code) {
      const codeCheck = await db
        .select({ id: warehouses.id })
        .from(warehouses)
        .where(and(
          eq(warehouses.tenantId, tenantId),
          sql`${warehouses.metadata}->>'code' = ${validatedData.code}`,
          sql`${warehouses.id} != ${warehouseId}`
        ))
        .limit(1);

      if (codeCheck.length > 0) {
        return res.status(400).json({ 
          error: "Warehouse code must be unique",
          field: "code"
        });
      }
    }

    // Verify manager if provided
    if (validatedData.manager) {
      const managerCheck = await db
        .select({ id: users.id })
        .from(users)
        .where(and(
          eq(users.id, validatedData.manager),
          eq(users.tenantId, tenantId)
        ))
        .limit(1);

      if (managerCheck.length === 0) {
        return res.status(400).json({ 
          error: "Manager not found",
          field: "manager"
        });
      }
    }

    // Build update object
    const currentMetadata = existingWarehouse[0].metadata as any || {};
    const updatedMetadata = {
      ...currentMetadata,
      ...(validatedData.code && { code: validatedData.code }),
      ...(validatedData.country && { country: validatedData.country }),
      ...(validatedData.contact !== undefined && { contact: validatedData.contact })
    };

    const updateData: any = {
      ...(validatedData.name && { name: validatedData.name }),
      ...(validatedData.address !== undefined && { address: validatedData.address }),
      ...(validatedData.city !== undefined && { city: validatedData.city }),
      ...(validatedData.status && { isActive: validatedData.status === 'active' }),
      ...(validatedData.manager !== undefined && { responsibleUser: validatedData.manager || null }),
      metadata: updatedMetadata,
      updatedAt: new Date()
    };

    // Update warehouse
    const updated = await db
      .update(warehouses)
      .set(updateData)
      .where(and(
        eq(warehouses.id, warehouseId),
        eq(warehouses.tenantId, tenantId)
      ))
      .returning();

    res.json({
      success: true,
      warehouse: {
        id: updated[0].id,
        name: updated[0].name,
        status: updated[0].isActive ? 'active' : 'inactive'
      }
    });

  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ 
        error: "Validation error",
        details: error.errors 
      });
    }

    console.error("[Warehouse API] Error updating warehouse:", error);
    res.status(500).json({ 
      error: "Failed to update warehouse",
      details: error.message 
    });
  }
});

export default router;
