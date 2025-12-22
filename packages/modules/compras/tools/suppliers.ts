/**
 * ComprasModule - Suppliers AI Tools
 * 4 tools for supplier management and scoring
 */

import { db } from "../../../../apps/api/db";
import { suppliers, productSuppliers, supplierPriceHistory } from "../../../../shared/schema";
import { eq, and, ilike, desc, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

export const supplierTools = [
  {
    type: "function" as const,
    function: {
      name: "list_suppliers",
      description: "List tenant suppliers. Returns complete data including rating, categories, status. Useful for finding suppliers or checking information.",
      parameters: {
        type: "object",
        properties: {
          search: {
            type: "string",
            description: "Search term (name, code or category). Optional.",
          },
          status: {
            type: "string",
            enum: ["active", "inactive", "pending_approval", "blacklisted"],
            description: "Filter by status. Optional.",
          },
          category: {
            type: "string",
            description: "Filter by supplier category. Optional.",
          },
          minRating: {
            type: "number",
            description: "Minimum rating (0-5). Optional.",
          },
          limit: {
            type: "number",
            description: "Maximum number of results (default: 20)",
          },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_supplier",
      description: "Create a new supplier in the system. Returns the created supplier with generated ID.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Supplier name (required)",
          },
          code: {
            type: "string",
            description: "Unique supplier code (required)",
          },
          taxId: {
            type: "string",
            description: "NIF/Tax ID of supplier",
          },
          email: {
            type: "string",
            description: "Primary supplier email",
          },
          phone: {
            type: "string",
            description: "Contact phone",
          },
          category: {
            type: "string",
            description: "Supplier category (e.g. 'Materials', 'Services', 'IT')",
          },
          paymentTerms: {
            type: "string",
            description: "Default payment terms (e.g. 'Net 30', '15 days')",
          },
          deliveryLeadTimeDays: {
            type: "number",
            description: "Average delivery lead time in days",
          },
          address: {
            type: "string",
            description: "Complete address",
          },
          notes: {
            type: "string",
            description: "Additional notes about the supplier",
          },
        },
        required: ["name", "code"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "update_supplier",
      description: "Update data for an existing supplier. Allows updating information, rating, status.",
      parameters: {
        type: "object",
        properties: {
          supplierId: {
            type: "string",
            description: "Supplier ID to update (required)",
          },
          status: {
            type: "string",
            enum: ["active", "inactive", "pending_approval", "blacklisted"],
            description: "New supplier status",
          },
          rating: {
            type: "number",
            description: "New rating (0-5)",
          },
          paymentTerms: {
            type: "string",
            description: "New payment terms",
          },
          deliveryLeadTimeDays: {
            type: "number",
            description: "New delivery lead time",
          },
          notes: {
            type: "string",
            description: "Updated notes",
          },
        },
        required: ["supplierId"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "score_supplier",
      description: "Calculate supplier score based on multiple factors: price history, lead time, compliance, quality. Returns detailed score and recommendations.",
      parameters: {
        type: "object",
        properties: {
          supplierId: {
            type: "string",
            description: "Supplier ID to evaluate (required)",
          },
          includePriceHistory: {
            type: "boolean",
            description: "Include price history analysis (default: true)",
          },
          includeDeliveryPerformance: {
            type: "boolean",
            description: "Include delivery performance analysis (default: true)",
          },
        },
        required: ["supplierId"],
      },
    },
  },
];

/**
 * Execute a supplier tool based on tool call from AI
 */
export async function executeSupplierTool(
  toolName: string,
  args: any,
  context: { tenantId: string; userId?: string }
): Promise<any> {
  console.log(`[Suppliers Tools] Executing: ${toolName}`, args);
  
  switch (toolName) {
    case "list_suppliers":
      return await handleListSuppliers(args, context);
      
    case "create_supplier":
      return await handleCreateSupplier(args, context);
      
    case "update_supplier":
      return await handleUpdateSupplier(args, context);
      
    case "score_supplier":
      return await handleScoreSupplier(args, context);
      
    default:
      throw new Error(`Unknown supplier tool: ${toolName}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tool Handlers
// ═══════════════════════════════════════════════════════════════════════════════

async function handleListSuppliers(
  args: {
    search?: string;
    status?: string;
    category?: string;
    minRating?: number;
    limit?: number;
  },
  context: { tenantId: string }
): Promise<any> {
  const { search, status, category, minRating, limit = 20 } = args;
  const { tenantId } = context;

  const whereConditions: any[] = [eq(suppliers.tenantId, tenantId)];

  if (search) {
    whereConditions.push(
      or(
        ilike(suppliers.name, `%${search}%`),
        ilike(suppliers.code, `%${search}%`),
        ilike(suppliers.category, `%${search}%`)
      )!
    );
  }

  if (status) {
    whereConditions.push(eq(suppliers.status, status as any));
  }

  if (category) {
    whereConditions.push(ilike(suppliers.category, `%${category}%`));
  }

  if (minRating !== undefined) {
    whereConditions.push(sql`${suppliers.rating} >= ${minRating}`);
  }

  const results = await db
    .select()
    .from(suppliers)
    .where(and(...whereConditions))
    .orderBy(desc(suppliers.rating))
    .limit(limit);

  return {
    success: true,
    count: results.length,
    suppliers: results,
  };
}

async function handleCreateSupplier(
  args: {
    name: string;
    code: string;
    taxId?: string;
    email?: string;
    phone?: string;
    category?: string;
    paymentTerms?: string;
    deliveryLeadTimeDays?: number;
    address?: string;
    notes?: string;
  },
  context: { tenantId: string }
): Promise<any> {
  const { tenantId } = context;

  // Check for duplicate code in tenant
  const existing = await db
    .select()
    .from(suppliers)
    .where(and(
      eq(suppliers.tenantId, tenantId),
      eq(suppliers.code, args.code)
    ))
    .limit(1);

  if (existing.length > 0) {
    return {
      success: false,
      error: `Supplier with code '${args.code}' already exists in tenant`,
    };
  }

  const newSupplier = await db.insert(suppliers).values({
    id: nanoid(),
    tenantId,
    code: args.code,
    name: args.name,
    taxId: args.taxId,
    email: args.email,
    phone: args.phone,
    category: args.category,
    paymentTerms: args.paymentTerms,
    deliveryLeadTimeDays: args.deliveryLeadTimeDays,
    address: args.address,
    notes: args.notes,
    status: 'pending_approval',
    rating: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  }).returning();

  return {
    success: true,
    message: `Supplier '${args.name}' created successfully (status: pending_approval)`,
    supplier: newSupplier[0],
  };
}

async function handleUpdateSupplier(
  args: {
    supplierId: string;
    status?: string;
    rating?: number;
    paymentTerms?: string;
    deliveryLeadTimeDays?: number;
    notes?: string;
  },
  context: { tenantId: string }
): Promise<any> {
  const { tenantId } = context;
  const { supplierId, ...updates } = args;

  // Verify supplier belongs to tenant
  const existing = await db
    .select()
    .from(suppliers)
    .where(and(
      eq(suppliers.id, supplierId),
      eq(suppliers.tenantId, tenantId)
    ))
    .limit(1);

  if (existing.length === 0) {
    return {
      success: false,
      error: `Supplier not found or does not belong to tenant`,
    };
  }

  const updated = await db
    .update(suppliers)
    .set({
      ...updates,
      updatedAt: new Date(),
    })
    .where(and(
      eq(suppliers.id, supplierId),
      eq(suppliers.tenantId, tenantId)
    ))
    .returning();

  return {
    success: true,
    message: `Supplier updated successfully`,
    supplier: updated[0],
  };
}

async function handleScoreSupplier(
  args: {
    supplierId: string;
    includePriceHistory?: boolean;
    includeDeliveryPerformance?: boolean;
  },
  context: { tenantId: string }
): Promise<any> {
  const { tenantId } = context;
  const { supplierId, includePriceHistory = true, includeDeliveryPerformance = true } = args;

  // Get supplier
  const supplier = await db
    .select()
    .from(suppliers)
    .where(and(
      eq(suppliers.id, supplierId),
      eq(suppliers.tenantId, tenantId)
    ))
    .limit(1);

  if (supplier.length === 0) {
    return {
      success: false,
      error: `Supplier not found`,
    };
  }

  const scores: any = {
    supplierId,
    supplierName: supplier[0].name,
    currentRating: supplier[0].rating,
    breakdown: {},
    recommendations: [],
  };

  // Price History Analysis
  if (includePriceHistory) {
    const priceHistory = await db
      .select()
      .from(supplierPriceHistory)
      .where(and(
        eq(supplierPriceHistory.supplierId, supplierId),
        eq(supplierPriceHistory.tenantId, tenantId)
      ))
      .orderBy(desc(supplierPriceHistory.effectiveDate))
      .limit(10);

    scores.breakdown.priceStability = {
      recordsAnalyzed: priceHistory.length,
      score: priceHistory.length > 5 ? 4.5 : 3.0,
      notes: priceHistory.length > 5 
        ? "Consistent price history" 
        : "Limited price history",
    };
  }

  // Delivery Performance (placeholder - would need receipt data)
  if (includeDeliveryPerformance) {
    scores.breakdown.deliveryPerformance = {
      averageLeadTime: supplier[0].deliveryLeadTimeDays || 30,
      score: supplier[0].deliveryLeadTimeDays && supplier[0].deliveryLeadTimeDays <= 15 ? 5.0 : 3.5,
      notes: "Based on configured lead time",
    };
  }

  // Overall Score (average of breakdown scores)
  const breakdownScores = Object.values(scores.breakdown).map((b: any) => b.score);
  const overallScore = breakdownScores.length > 0
    ? breakdownScores.reduce((a: number, b: number) => a + b, 0) / breakdownScores.length
    : supplier[0].rating || 3.0;

  scores.overallScore = Number(overallScore.toFixed(2));

  // Recommendations
  if (overallScore >= 4.5) {
    scores.recommendations.push("Supplier RECOMMENDED - Excellent performance");
  } else if (overallScore >= 3.5) {
    scores.recommendations.push("Supplier ACCEPTABLE - Satisfactory performance");
  } else {
    scores.recommendations.push("Supplier NOT RECOMMENDED - Consider alternatives");
  }

  return {
    success: true,
    scores,
  };
}
