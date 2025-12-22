// Migrated from AssistOS legacy - Phase 4.4
// Company profile management routes

import { Router } from "express";
import { db } from "../db";
import { companyInfo, tenants } from "../../../shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { z } from "zod";
import { selectOneFromTenantTable, insertIntoTenantTable, updateTenantTable } from "../utils/tenant-db-helper";

const router = Router();

const updateCompanySchema = z.object({
  name: z.string().min(1).optional(),
  brandName: z.string().optional(),
  legalName: z.string().optional(),
  nif: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().optional(),
  phone: z.string().optional(),
  email: z.union([z.string().email(), z.literal("")]).optional(),
  website: z.union([z.string().url(), z.literal("")]).optional(),
  logo: z.union([z.string().url(), z.literal("")]).optional(),
  sector: z.string().optional(),
  businessDescription: z.string().optional(),
  businessType: z.string().optional(),
  additionalInfo: z.array(z.object({
    key: z.string(),
    value: z.string(),
  })).optional(),
});

/**
 * GET /api/company
 * Get company profile information
 */
router.get("/", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId || (req.session as any)?.activeTenantId;

    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Get company info from tenant schema
    const company = await selectOneFromTenantTable(
      tenantId,
      'company_info',
      sql`tenant_id = ${tenantId}`
    );

    // Get tenant basic info
    const [tenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    if (!company && !tenant) {
      return res.status(404).json({ error: "Company not found" });
    }

    // Merge tenant and company info
    const profile = {
      id: tenant?.id || tenantId,
      slug: tenant?.slug,
      industry: tenant?.industry,
      status: tenant?.status,
      country: tenant?.country,
      currency: tenant?.currency,
      timezone: tenant?.timezone,
      fiscalYearStart: tenant?.fiscalYearStart,
      accountingStandard: tenant?.accountingStandard,
      // Company details (access with snake_case from raw SQL, return as camelCase)
      name: company?.name || tenant?.name,
      brandName: company?.brand_name,
      legalName: company?.legal_name,
      nif: company?.nif,
      address: company?.address,
      city: company?.city,
      postalCode: company?.postal_code,
      phone: company?.phone,
      email: company?.email,
      website: company?.website,
      logo: company?.logo || tenant?.logo,
      sector: company?.sector || tenant?.industry,
      businessDescription: company?.business_description,
      businessType: company?.business_type,
      additionalInfo: company?.additional_info,
      brandFiles: company?.brand_files,
      onboardingContext: company?.onboarding_context,
    };

    res.json(profile);
  } catch (error: any) {
    console.error("[Company API] Error fetching company:", error);
    res.status(500).json({ 
      error: "Failed to fetch company",
      details: error.message 
    });
  }
});

/**
 * PATCH /api/company
 * Update company profile information
 */
router.patch("/", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId || (req.session as any)?.activeTenantId;
    const userId = (req as any).user?.id || (req.session as any)?.userId;

    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // TODO: Check user has admin permissions to update company info

    const updates = updateCompanySchema.parse(req.body);

    // Check if company info record exists in tenant schema
    const existing = await selectOneFromTenantTable(
      tenantId,
      'company_info',
      sql`tenant_id = ${tenantId}`
    );

    let result;

    if (existing) {
      // Convert camelCase updates to snake_case for database
      const updateData: Record<string, any> = {};
      // Note: updated_at is automatically set by updateTenantTable function
      if (updates.name !== undefined) updateData.name = updates.name;
      if (updates.brandName !== undefined) updateData.brand_name = updates.brandName;
      if (updates.legalName !== undefined) updateData.legal_name = updates.legalName;
      if (updates.nif !== undefined) updateData.nif = updates.nif;
      if (updates.address !== undefined) updateData.address = updates.address;
      if (updates.city !== undefined) updateData.city = updates.city;
      if (updates.postalCode !== undefined) updateData.postal_code = updates.postalCode;
      if (updates.country !== undefined) updateData.country = updates.country;
      if (updates.phone !== undefined) updateData.phone = updates.phone;
      if (updates.email !== undefined) updateData.email = updates.email;
      if (updates.website !== undefined) updateData.website = updates.website;
      if (updates.logo !== undefined) updateData.logo = updates.logo;
      if (updates.sector !== undefined) updateData.sector = updates.sector;
      if (updates.businessDescription !== undefined) updateData.business_description = updates.businessDescription;
      if (updates.businessType !== undefined) updateData.business_type = updates.businessType;
      if (updates.additionalInfo !== undefined) {
        // updateTenantTable will automatically cast arrays/objects to JSONB
        updateData.additional_info = updates.additionalInfo;
      }

      // Update existing company info in tenant schema
      result = await updateTenantTable(
        tenantId,
        'company_info',
        updateData,
        sql`tenant_id = ${tenantId}`
      );
    } else {
      // Convert camelCase updates to snake_case for database
      const insertData: Record<string, any> = {
        tenant_id: tenantId,
        created_at: new Date(),
        updated_at: new Date(),
      };
      if (updates.name !== undefined) insertData.name = updates.name;
      if (updates.brandName !== undefined) insertData.brand_name = updates.brandName;
      if (updates.legalName !== undefined) insertData.legal_name = updates.legalName;
      if (updates.nif !== undefined) insertData.nif = updates.nif;
      if (updates.address !== undefined) insertData.address = updates.address;
      if (updates.city !== undefined) insertData.city = updates.city;
      if (updates.postalCode !== undefined) insertData.postal_code = updates.postalCode;
      if (updates.country !== undefined) insertData.country = updates.country;
      if (updates.phone !== undefined) insertData.phone = updates.phone;
      if (updates.email !== undefined) insertData.email = updates.email;
      if (updates.website !== undefined) insertData.website = updates.website;
      if (updates.logo !== undefined) insertData.logo = updates.logo;
      if (updates.sector !== undefined) insertData.sector = updates.sector;
      if (updates.businessDescription !== undefined) insertData.business_description = updates.businessDescription;
      if (updates.businessType !== undefined) insertData.business_type = updates.businessType;
      if (updates.additionalInfo !== undefined) insertData.additional_info = updates.additionalInfo;

      // Create new company info record in tenant schema
      result = await insertIntoTenantTable(
        tenantId,
        'company_info',
        insertData
      );
    }

    // Update tenant name/logo if provided
    if (updates.name || updates.logo) {
      await db
        .update(tenants)
        .set({
          ...(updates.name && { name: updates.name }),
          ...(updates.logo && { logo: updates.logo }),
          updatedAt: new Date(),
        })
        .where(eq(tenants.id, tenantId));
    }

    res.json({
      success: true,
      company: result,
    });
  } catch (error: any) {
    console.error("[Company API] Error updating company:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: "Validation error",
        details: error.errors 
      });
    }
    res.status(500).json({ 
      error: "Failed to update company",
      details: error.message 
    });
  }
});

/**
 * POST /api/company/brand-files
 * Upload brand files (logo variations, style guide, etc.)
 */
router.post("/brand-files", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId || (req.session as any)?.activeTenantId;
    const userId = (req as any).user?.id || (req.session as any)?.userId;

    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { files } = req.body; // Array of file metadata

    // TODO: Validate file upload permissions
    // TODO: Store file references in companyInfo.brandFiles
    // TODO: Use uploads system for actual file storage

    res.json({
      success: false,
      message: "Brand file upload not yet fully implemented - use /api/uploads for file storage"
    });
  } catch (error: any) {
    console.error("[Company API] Error uploading brand files:", error);
    res.status(500).json({ 
      error: "Failed to upload brand files",
      details: error.message 
    });
  }
});

/**
 * GET /api/company/onboarding-context
 * Get onboarding context (used during initial setup)
 */
router.get("/onboarding-context", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId || (req.session as any)?.activeTenantId;

    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const company = await selectOneFromTenantTable(
      tenantId,
      'company_info',
      sql`tenant_id = ${tenantId}`
    );

    res.json({
      context: company?.onboarding_context || null,
    });
  } catch (error: any) {
    console.error("[Company API] Error fetching onboarding context:", error);
    res.status(500).json({ 
      error: "Failed to fetch onboarding context",
      details: error.message 
    });
  }
});

export default router;
