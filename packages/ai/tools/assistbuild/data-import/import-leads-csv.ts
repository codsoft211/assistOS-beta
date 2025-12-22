import { db } from "../../../../../apps/api/db";
import { angariacaoLeads } from "@shared/schema";
import type { ToolExecutionContext, ToolDefinition } from "../../kernel/types";
import { z } from "zod";
import xlsx from "xlsx";
import { promises as fs } from "fs";

const inputSchema = z.object({
  filePath: z.string().describe("Caminho completo do ficheiro Excel/CSV a importar (ex: /home/runner/workspace/attached_assets/file.csv)"),
  columnMapping: z.object({
    descricao: z.string().optional().describe("Nome da coluna com descrição do lead"),
    nome: z.string().optional().describe("Nome da coluna com nome do contacto"),
    contacto: z.string().optional().describe("Nome da coluna com email/telefone"),
    numero_proposta: z.string().optional().describe("Nome da coluna com número da proposta"),
    estado: z.string().optional().describe("Nome da coluna com estado/status"),
    owner: z.string().optional().describe("Nome da coluna com responsável"),
    lead_source: z.string().optional().describe("Nome da coluna com origem do lead"),
    tipo_evento: z.string().optional().describe("Nome da coluna com tipo de evento"),
    localizacao: z.string().optional().describe("Nome da coluna com localização"),
    data_evento: z.string().optional().describe("Nome da coluna com data do evento"),
    ano: z.string().optional().describe("Nome da coluna com ano"),
    num_pax: z.string().optional().describe("Nome da coluna com número de pessoas"),
    valor_pax: z.string().optional().describe("Nome da coluna com valor por pessoa"),
    budget_total: z.string().optional().describe("Nome da coluna com budget total"),
    comentarios: z.string().optional().describe("Nome da coluna com comentários"),
  }).optional().describe("Mapeamento de colunas do CSV para os campos do sistema. Se não fornecido, tenta deteção automática."),
});

// Helper to clean currency values (handles European "€ 1.234,56" and US "1234.56" formats)
function parseCurrency(value: any): number | null {
  if (!value || value === '') return null;
  const str = String(value).replace(/[€\s]/g, ''); // Remove currency symbols and spaces
  
  // Detect format: if comma exists, assume European format (1.234,56)
  // Otherwise, assume US format (1234.56)
  if (str.includes(',')) {
    // European format: dots are thousand separators, comma is decimal
    const cleaned = str.replace(/\./g, '').replace(',', '.');
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  } else {
    // US format: dots are decimal separators (no thousand separators expected)
    const num = parseFloat(str);
    return isNaN(num) ? null : num;
  }
}

// Helper to normalize column names for auto-detection
function normalizeColumnName(name: string): string {
  return name.toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[^a-z0-9]/g, '');
}

// Auto-detect column mapping with enhanced fallback heuristics
function autoDetectMapping(headers: string[]): any {
  const mapping: any = {};
  
  headers.forEach(header => {
    const norm = normalizeColumnName(header);
    
    if (['descricao', 'description', 'desc', 'descr'].includes(norm)) mapping.descricao = header;
    if (['nome', 'name', 'nomecliente', 'cliente', 'client'].includes(norm)) mapping.nome = header;
    if (['contacto', 'contact', 'email', 'telefone', 'phone', 'telemovel'].includes(norm)) mapping.contacto = header;
    // Enhanced proposta detection with ordinal indicators (nº, n., no)
    if (['numproposta', 'nproposta', 'proposta', 'numeroproposta', 'noproposta', 'propno', 'proposalnum', 'proposalnumber'].includes(norm)) mapping.numero_proposta = header;
    if (['estado', 'status', 'state', 'situacao'].includes(norm)) mapping.estado = header;
    if (['owner', 'onwer', 'responsavel', 'dono', 'resp', 'vendedor'].includes(norm)) mapping.owner = header;
    if (['lead', 'leadsource', 'origem', 'source', 'proveniencia'].includes(norm)) mapping.lead_source = header;
    if (['tipoevento', 'tipo', 'eventtype', 'tipodeevento'].includes(norm)) mapping.tipo_evento = header;
    if (['localizacao', 'localidade', 'location', 'local', 'lugar'].includes(norm)) mapping.localizacao = header;
    if (['data', 'dataevento', 'date', 'eventdate', 'datadoevento'].includes(norm)) mapping.data_evento = header;
    if (['ano', 'year', 'anual'].includes(norm)) mapping.ano = header;
    if (['numpax', 'pax', 'npessoas', 'pessoas', 'numerodepessoas', 'qtdpessoas'].includes(norm)) mapping.num_pax = header;
    if (['valorpax', 'precopax', 'pricepax', 'valorpessoa', 'precopessoa'].includes(norm)) mapping.valor_pax = header;
    if (['budgettotal', 'budget', 'total', 'orcamento', 'valortotal', 'orcamentototal'].includes(norm)) mapping.budget_total = header;
    if (['comentarios', 'comments', 'observacoes', 'notas', 'obs', 'remarks'].includes(norm)) mapping.comentarios = header;
  });
  
  return mapping;
}

export const importLeadsCSV: ToolDefinition = {
  name: "import_leads_csv",
  description: "Importa leads de um ficheiro Excel (.xlsx, .xls) ou CSV (.csv) específico para campanhas de marketing/vendas. Suporta mapeamento automático ou manual de colunas. Ideal para importar propostas comerciais, leads de eventos, ou qualquer lista de potenciais clientes. Retorna sumário detalhado com total de leads importados, sucessos e erros.",
  category: "data-import",
  inputSchema,
  
  async execute(input, context: ToolExecutionContext) {
    try {
      const { filePath, columnMapping } = input;

      // Validate file exists
      try {
        await fs.access(filePath);
      } catch {
        return {
          success: false,
          error: {
            code: 'FILE_NOT_FOUND',
            message: `Ficheiro não encontrado: ${filePath}. Certifique-se de que o caminho está correto.`,
            recoverable: true
          },
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
          error: {
            code: 'EMPTY_FILE',
            message: "Ficheiro vazio ou sem dados válidos",
            recoverable: true
          },
        };
      }

      // Get headers and detect mapping
      const firstRow: any = data[0];
      const headers = Object.keys(firstRow);
      const mapping = columnMapping && Object.keys(columnMapping).length > 0 
        ? columnMapping 
        : autoDetectMapping(headers);

      console.log(`[AssistBuild] Import leads - Detected mapping:`, mapping);
      console.log(`[AssistBuild] Import leads - Available headers:`, headers);

      // VALIDATION: Ensure numero_proposta is mapped (critical field)
      if (!mapping.numero_proposta) {
        return {
          success: false,
          error: {
            code: 'MAPPING_FAILED',
            message: `Não foi possível detectar a coluna "Número de Proposta" no ficheiro. Headers disponíveis: ${headers.join(', ')}. Por favor, especifique o mapeamento manualmente usando o parâmetro columnMapping.`,
            details: { availableHeaders: headers, detectedMapping: mapping },
            recoverable: true
          },
        };
      }

      const results = { 
        total: data.length, 
        success: 0, 
        errors: 0, 
        errorDetails: [] as any[],
        sampleLeads: [] as any[]
      };

      // Process in batches for performance
      const batchSize = 50;
      const batches: any[] = [];
      
      for (let i = 0; i < data.length; i += batchSize) {
        batches.push(data.slice(i, i + batchSize));
      }

      for (const batch of batches) {
        const leadsToInsert: any[] = [];

        for (const row of batch as any[]) {
          try {
            // Build custom fields object
            const customFields: any = {
              numero_proposta: mapping.numero_proposta ? row[mapping.numero_proposta] : null,
              tipo_evento: mapping.tipo_evento ? row[mapping.tipo_evento] : null,
              localizacao: mapping.localizacao ? row[mapping.localizacao] : null,
              data_evento: mapping.data_evento ? row[mapping.data_evento] : null,
              ano: mapping.ano ? row[mapping.ano] : null,
              num_pax: mapping.num_pax ? String(row[mapping.num_pax] || '') : null,
              valor_pax: mapping.valor_pax ? parseCurrency(row[mapping.valor_pax]) : null,
              budget_total: mapping.budget_total ? parseCurrency(row[mapping.budget_total]) || String(row[mapping.budget_total] || '') : null,
              comentarios: mapping.comentarios ? row[mapping.comentarios] : null,
              owner: mapping.owner ? row[mapping.owner] : null,
            };

            // Clean up null/empty values
            Object.keys(customFields).forEach(key => {
              if (!customFields[key] || customFields[key] === '') {
                delete customFields[key];
              }
            });

            // Skip if no proposal number (key identifier)
            if (!customFields.numero_proposta) {
              results.errors++;
              continue;
            }

            const description = mapping.descricao ? row[mapping.descricao] : `Lead ${customFields.numero_proposta}`;
            const name = mapping.nome ? row[mapping.nome] : description;
            const contact = mapping.contacto ? row[mapping.contacto] : null;
            const status = mapping.estado ? row[mapping.estado] : 'Novo';
            const leadSource = mapping.lead_source ? row[mapping.lead_source] : 'import';

            const leadData = {
              tenantId: context.tenantId,
              environment: context.environment,
              email: contact && String(contact).includes('@') ? contact : null,
              firstName: name ? String(name).split(' ')[0] : 'Lead',
              lastName: name ? String(name).split(' ').slice(1).join(' ') : null,
              phone: contact && !String(contact).includes('@') ? String(contact) : null,
              company: null,
              nif: null,
              leadSource: leadSource,
              status: status,
              score: status === 'WIN' ? 100 : status?.includes('Enviada') ? 50 : 0,
              customFields: customFields,
              assignedToUserId: context.userId,
              campaign: null,
            };

            leadsToInsert.push(leadData);

            // Add to sample (first 3)
            if (results.sampleLeads.length < 3) {
              results.sampleLeads.push({
                numero_proposta: customFields.numero_proposta,
                descricao: description,
                status: status,
              });
            }
          } catch (error: any) {
            results.errors++;
            results.errorDetails.push({
              row: row,
              error: error.message,
            });
          }
        }

        // Insert batch
        if (leadsToInsert.length > 0) {
          try {
            await db.insert(angariacaoLeads).values(leadsToInsert);
            results.success += leadsToInsert.length;
          } catch (error: any) {
            console.error('[AssistBuild] Error inserting batch:', error);
            results.errors += leadsToInsert.length;
            results.errorDetails.push({
              batch: 'batch_insert',
              error: error.message,
            });
          }
        }
      }

      // VALIDATION: Ensure at least one lead was imported
      if (results.success === 0) {
        return {
          success: false,
          error: {
            code: 'NO_LEADS_IMPORTED',
            message: `Nenhum lead foi importado com sucesso. Total de linhas processadas: ${results.total}, Erros: ${results.errors}. Verifique se o ficheiro contém dados válidos e se o mapeamento de colunas está correto.`,
            details: {
              total: results.total,
              errors: results.errors,
              errorSamples: results.errorDetails.slice(0, 5), // First 5 errors for debugging
              mapping: mapping
            },
            recoverable: true
          },
        };
      }

      return {
        success: true,
        data: {
          message: `✅ Import concluído com sucesso!\n\n📊 Resumo:\n- Total de linhas: ${results.total}\n- Leads importados: ${results.success}\n- Erros: ${results.errors}\n\n📝 Exemplos de leads importados:\n${results.sampleLeads.map(l => `- ${l.numero_proposta}: ${l.descricao} (${l.status})`).join('\n')}`,
          total: results.total,
          success: results.success,
          errors: results.errors,
          errorCount: results.errorDetails.length,
          sampleLeads: results.sampleLeads,
        },
      };
    } catch (error: any) {
      console.error("[AssistBuild] Error importing leads from CSV:", error);
      return {
        success: false,
        error: {
          code: 'IMPORT_ERROR',
          message: `Erro ao importar leads: ${error.message}`,
          details: error,
          recoverable: false
        },
      };
    }
  },
};
