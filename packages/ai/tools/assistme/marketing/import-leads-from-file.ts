import { db } from "../../../../../apps/api/db";
import { and, eq } from "drizzle-orm";
import { angariacaoLeads, adCampaigns, insertAngariacaoLeadSchema } from "@shared/schema";
import type { ToolExecutionContext, ToolDefinition } from "../../kernel/types";
import { z } from "zod";
import xlsx from "xlsx";
import { promises as fs } from "fs";

const inputSchema = z.object({
  filePath: z.string().describe("Caminho do ficheiro Excel/CSV a importar"),
});

export const importLeadsFromFile: ToolDefinition = {
  name: "import_leads_from_file",
  description: "Importa leads de um ficheiro Excel (.xlsx, .xls) ou CSV (.csv) com mapeamento automático de colunas. Cria os leads no sistema e atribui automaticamente a campanhas se tiver utm_campaign. Retorna sumário com total de leads importados, sucessos e erros.",
  category: "marketing",
  inputSchema,
  
  async execute(input, context: ToolExecutionContext) {
    try {
      const { filePath } = input;

      // Validate file exists
      try {
        await fs.access(filePath);
      } catch {
        return {
          success: false,
          error: `Ficheiro não encontrado: ${filePath}`,
        };
      }

      // Parse Excel/CSV
      const workbook = xlsx.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const data = xlsx.utils.sheet_to_json(worksheet);

      if (data.length === 0) {
        return {
          success: false,
          error: "Ficheiro vazio ou sem dados",
        };
      }

      // Auto-detect column mapping (flexible)
      const normalizeHeader = (h: string) => h.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
      const firstRow: any = data[0];
      const headers = Object.keys(firstRow);
      
      const mapping: any = {};
      headers.forEach(h => {
        const norm = normalizeHeader(h);
        if (['nome', 'name', 'fullname'].includes(norm)) mapping.fullName = h;
        if (['email', 'mail', 'emailaddress'].includes(norm)) mapping.email = h;
        if (['telefone', 'phone', 'tel', 'telemovel', 'mobile'].includes(norm)) mapping.phone = h;
        if (['empresa', 'company', 'organizacao', 'organization'].includes(norm)) mapping.company = h;
        if (['cargo', 'position', 'job', 'title'].includes(norm)) mapping.jobTitle = h;
        if (['origem', 'source', 'leadSource'].includes(norm)) mapping.leadSource = h;
        if (['utmsource'].includes(norm)) mapping.utmSource = h;
        if (['utmmedium'].includes(norm)) mapping.utmMedium = h;
        if (['utmcampaign', 'campaign'].includes(norm)) mapping.utmCampaign = h;
        if (['utmterm'].includes(norm)) mapping.utmTerm = h;
        if (['utmcontent'].includes(norm)) mapping.utmContent = h;
      });

      const results = { total: data.length, success: 0, errors: 0, errorDetails: [] as any[] };

      for (const row of data as any[]) {
        try {
          const leadData: any = {
            tenantId: context.tenantId,
            environment: context.environment,
            createdBy: context.userId,
            fullName: mapping.fullName ? row[mapping.fullName] : null,
            email: mapping.email ? row[mapping.email] : null,
            phone: mapping.phone ? row[mapping.phone] : null,
            company: mapping.company ? row[mapping.company] : null,
            jobTitle: mapping.jobTitle ? row[mapping.jobTitle] : null,
            leadSource: mapping.leadSource ? row[mapping.leadSource] : 'import',
            utmSource: mapping.utmSource ? row[mapping.utmSource] : null,
            utmMedium: mapping.utmMedium ? row[mapping.utmMedium] : null,
            utmCampaign: mapping.utmCampaign ? row[mapping.utmCampaign] : null,
            utmTerm: mapping.utmTerm ? row[mapping.utmTerm] : null,
            utmContent: mapping.utmContent ? row[mapping.utmContent] : null,
          };

          // Atribuir a campanha se utm_campaign existir
          if (leadData.utmCampaign) {
            const campaign = await db.select().from(adCampaigns)
              .where(and(
                eq(adCampaigns.tenantId, context.tenantId),
                eq(adCampaigns.environment, context.environment),
                eq(adCampaigns.campaignName, leadData.utmCampaign)
              ))
              .limit(1);
            
            if (campaign.length > 0) {
              leadData.campaignId = campaign[0].id;
            }
          }

          // Validate with Zod
          const validated = insertAngariacaoLeadSchema.omit({ id: true, createdAt: true }).parse(leadData);
          
          await db.insert(angariacaoLeads).values(validated);
          results.success++;
        } catch (error: any) {
          results.errors++;
          const rowData: any = row;
          results.errorDetails.push({
            row: rowData.fullName || rowData.email || 'N/A',
            error: error.message
          });
        }
      }

      return {
        success: true,
        message: `Import concluído: ${results.success} leads importados com sucesso de ${results.total} total`,
        data: results,
      };
    } catch (error: any) {
      console.error("[AI Tool] Error importing leads from file:", error);
      return {
        success: false,
        error: error.message || "Erro ao importar leads",
      };
    }
  },
};
