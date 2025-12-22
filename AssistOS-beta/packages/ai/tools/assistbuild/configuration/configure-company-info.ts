import { ToolBase, type ToolManifest } from "../../kernel";
import { db } from "../../../../../apps/api/db";
import { companyInfo } from "../../../../../shared/schema";
import { eq, sql } from "drizzle-orm";
import {
  selectOneFromTenantTable,
  updateTenantTable,
} from "../../../../../apps/api/utils/tenant-db-helper";
import { realtimeEvents } from "../../../../../apps/api/services/event-emitter";
import { REALTIME_CHANNELS } from "../../../../../shared/realtime";

interface CompanyInfoInput {
  brandName?: string;
  legalName?: string;
  nif?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  phone?: string;
  email?: string;
  website?: string;
  sector?: string;
  businessDescription?: string;
  country?: string;
  businessType?: string;
  brandFiles?: any[];
  additionalInfo?: any[];
}

export class ConfigureCompanyInfoTool extends ToolBase<CompanyInfoInput, any> {
  manifest: ToolManifest = {
    name: "configure_company_info",
    category: "configuration",
    description:
      "Updates company information (name, tax ID, address, country, postal code, phone, email, website, sector, business type, brand files, additional info)",
    parameters: [
      {
        name: "name",
        type: "string",
        description: "Company name",
        required: false,
      },
      {
        name: "brandName",
        type: "string",
        description: "Company brand name",
        required: false,
      },
      {
        name: "country",
        type: "string",
        description: "Country",
        required: false,
      },
      {
        name: "postalCode",
        type: "string",
        description: "Postal code",
        required: false,
      },
      {
        name: "legalName",
        type: "string",
        description: "Legal/fiscal name",
        required: false,
      },
      {
        name: "nif",
        type: "string",
        description: "Company tax ID",
        required: false,
      },
      {
        name: "address",
        type: "string",
        description: "Address",
        required: false,
      },
      { name: "city", type: "string", description: "City", required: false },
      {
        name: "postalCode",
        type: "string",
        description: "Postal code",
        required: false,
      },
      { name: "phone", type: "string", description: "Phone", required: false },
      { name: "email", type: "string", description: "Email", required: false },
      {
        name: "website",
        type: "string",
        description: "Website",
        required: false,
      },
      {
        name: "sector",
        type: "string",
        description: "Business sector",
        required: false,
        enum: [
          "technology",
          "finance/fintech",
          "healthcare",
          "retail/e-commerce",
          "manufacturing",
          "consulting",
          "education",
          "real-estate",
          "transportation/logistics",
          "media/entertainment",
          "energy/utilities",
          "nonprofit",
          "government",
        ],
      },
      {
        name: "businessDescription",
        type: "string",
        description: "Business description",
        required: false,
      },
      {
        name: "country",
        type: "string",
        description: "Country",
        required: false,
      },
      {
        name: "businessType",
        type: "string",
        description: "Business type",
        required: false,
        enum: [
          "b2b",
          "b2c",
          "b2b2c",
          "saas",
          "marketplace",
          "consulting",
          "subscription",
          "agency/professional-services",
          "mobile-app",
          "platform",
          "other",
        ],
      },
      {
        name: "brandFiles",
        type: "array",
        description:
          "Brand files (for logo, assets, etc) - each with Supabase Storage reference",
        required: false,
        items: {
          type: "object",
          description: "File uploaded to Supabase storage",
          properties: {
            url: { type: "string", description: "Public URL to the file" },
            bucket: {
              type: "string",
              description: "Supabase storage bucket name",
            },
            path: {
              type: "string",
              description: "Storage path (key) in the bucket",
            },
            name: { type: "string", description: "Original filename" },
            mimeType: { type: "string", description: "MIME type" },
            size: { type: "number", description: "File size in bytes" },
            uploadedAt: { type: "string", description: "Upload date ISO8601" },
          },
          required: ["url", "bucket", "path", "name", "mimeType"],
        },
      },
      {
        name: "additionalInfo",
        type: "array",
        description: "Additional information",
        required: false,
        items: {
          type: "object",
          description: "Additional information",
          properties: {
            key: { type: "string", description: "Key" },
            value: { type: "string", description: "Value" },
          },
        },
      },
    ],
    scope: "tenant", // 🔒 SECURITY: Tenant-wide company info - NOT for AssistSettings
    requiresAuth: true,
    progressSupport: false,
  };

  protected async executeInternal(
    input: CompanyInfoInput,
    context: any
  ): Promise<any> {
    const tenantId = context.tenantId;

    // Check if company exists in tenant schema
    const existing = await selectOneFromTenantTable(
      tenantId,
      "company_info",
      sql`tenant_id = ${tenantId}`
    );

    if (!existing) {
      return {
        success: false,
        message: "Company not initialized. Use bootstrap_tenant first.",
      };
    }

    // Convert camelCase input to snake_case for database
    const updateData: Record<string, any> = {};
    if (input.brandName !== undefined) updateData.brand_name = input.brandName;
    if (input.legalName !== undefined) updateData.legal_name = input.legalName;
    if (input.postalCode !== undefined)
      updateData.postal_code = input.postalCode;
    if (input.businessDescription !== undefined)
      updateData.business_description = input.businessDescription;
    if (input.nif !== undefined) updateData.nif = input.nif;
    if (input.address !== undefined) updateData.address = input.address;
    if (input.city !== undefined) updateData.city = input.city;
    if (input.phone !== undefined) updateData.phone = input.phone;
    if (input.email !== undefined) updateData.email = input.email;
    if (input.website !== undefined) updateData.website = input.website;
    if (input.sector !== undefined) updateData.sector = input.sector;
    if (input.country !== undefined) updateData.country = input.country;
    if (input.businessType !== undefined) updateData.business_type = input.businessType;
    if (input.brandFiles !== undefined) updateData.brand_files = input.brandFiles;
    if (input.additionalInfo !== undefined) updateData.additional_info = input.additionalInfo;
    // Note: updated_at is automatically set by updateTenantTable function

    // Update company info in tenant schema
    const updated = await updateTenantTable(
      tenantId,
      "company_info",
      updateData,
      sql`tenant_id = ${tenantId}`
    );

    // Emit real-time event for UI to refresh
    realtimeEvents.emitForTenant(
      REALTIME_CHANNELS.COMPANY_UPDATED,
      tenantId,
      { companyId: updated.id, tenantId }
    );

    return {
      success: true,
      company: updated,
      message: "Company information updated",
    };
  }
}
