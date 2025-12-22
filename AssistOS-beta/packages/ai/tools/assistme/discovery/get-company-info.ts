import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { tenants, companyInfo, users, userTenants } from 'shared/schema';
import { eq, and, count } from 'drizzle-orm';

export class GetCompanyInfoTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'get_company_info',
    category: 'discovery' as const,
    scope: 'tenant' as const,
    description: 'Obtem informacao completa da empresa/tenant: nome, NIF, morada, contactos, setor, configuracoes. Use quando user perguntar "qual e a minha empresa?", "dados da empresa", "informacoes do tenant", "NIF da empresa", etc.',
    parameters: [],
    outputSchema: z.object({
      tenant: z.object({
        id: z.string(),
        name: z.string(),
        slug: z.string(),
        industry: z.string().nullable(),
        status: z.string(),
        tier: z.string(),
        country: z.string(),
        currency: z.string(),
        timezone: z.string(),
        fiscalYearStart: z.string(),
        accountingStandard: z.string()
      }).nullable(),
      company: z.object({
        name: z.string().nullable(),
        brandName: z.string().nullable(),
        legalName: z.string().nullable(),
        nif: z.string().nullable(),
        address: z.string().nullable(),
        city: z.string().nullable(),
        postalCode: z.string().nullable(),
        country: z.string().nullable(),
        phone: z.string().nullable(),
        email: z.string().nullable(),
        website: z.string().nullable(),
        sector: z.string().nullable(),
        businessDescription: z.string().nullable(),
        businessType: z.string().nullable()
      }).nullable(),
      stats: z.object({
        totalUsers: z.number(),
        payingUsers: z.number()
      }),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: {},
    context: ToolExecutionContext
  ) {
    const [tenant] = await db
      .select({
        id: tenants.id,
        name: tenants.name,
        slug: tenants.slug,
        industry: tenants.industry,
        status: tenants.status,
        tier: tenants.tier,
        country: tenants.country,
        currency: tenants.currency,
        timezone: tenants.timezone,
        fiscalYearStart: tenants.fiscalYearStart,
        accountingStandard: tenants.accountingStandard
      })
      .from(tenants)
      .where(eq(tenants.id, context.tenantId));

    const [company] = await db
      .select({
        name: companyInfo.name,
        brandName: companyInfo.brandName,
        legalName: companyInfo.legalName,
        nif: companyInfo.nif,
        address: companyInfo.address,
        city: companyInfo.city,
        postalCode: companyInfo.postalCode,
        country: companyInfo.country,
        phone: companyInfo.phone,
        email: companyInfo.email,
        website: companyInfo.website,
        sector: companyInfo.sector,
        businessDescription: companyInfo.businessDescription,
        businessType: companyInfo.businessType
      })
      .from(companyInfo)
      .where(eq(companyInfo.tenantId, context.tenantId));

    const [userStats] = await db
      .select({
        totalUsers: count(userTenants.userId),
      })
      .from(userTenants)
      .where(eq(userTenants.tenantId, context.tenantId));

    const [payingStats] = await db
      .select({
        payingUsers: count(userTenants.userId),
      })
      .from(userTenants)
      .where(and(
        eq(userTenants.tenantId, context.tenantId),
        eq(userTenants.isPaying, true)
      ));

    const companyName = company?.name || company?.brandName || tenant?.name || 'Empresa';
    
    return {
      tenant: tenant || null,
      company: company || null,
      stats: {
        totalUsers: userStats?.totalUsers || 0,
        payingUsers: payingStats?.payingUsers || 0
      },
      message: `Informacao da empresa "${companyName}" obtida com sucesso`
    };
  }
}
