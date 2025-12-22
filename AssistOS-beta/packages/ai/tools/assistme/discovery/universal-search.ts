/**
 * Universal Search Tool (AssistME)
 * 
 * Allows AssistME to search across all modules and data sources in the platform.
 * Uses intelligent search (combines textual + semantic) for best results.
 * 
 * AssistME uses this to answer questions like:
 * - "Onde está a fatura do fornecedor ABC?"
 * - "Mostra-me todos os documentos sobre o projeto X"
 * - "Quem é o cliente João?"
 * - "Encontra invoices de janeiro"
 */

import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { universalSearchService } from '../../../../platform/services/universal-search';

export class UniversalSearchTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'universal_search',
    category: 'discovery' as const,
    scope: 'tenant' as const,
    description: 'Busca unificada em toda a plataforma (documentos, invoices, clientes, fornecedores, projetos, etc.). Use quando o utilizador pedir para "buscar", "encontrar", "mostrar", "onde está", "quem é", etc. Combina busca textual e semântica para melhores resultados.',
    parameters: [
      {
        name: 'query',
        type: 'string',
        description: 'Texto de busca. Pode ser natural language (ex: "fatura do fornecedor ABC em janeiro") ou palavras-chave (ex: "João Silva").',
        required: true,
      },
      {
        name: 'modules',
        type: 'array',
        description: 'Opcional: Filtrar busca para módulos específicos (ex: ["financeiro", "comercial"]). Se não especificado, busca em todos os módulos ativos.',
        required: false,
        items: {
          type: 'string',
        },
      },
      {
        name: 'entities',
        type: 'array',
        description: 'Opcional: Filtrar busca para entidades específicas (ex: ["invoice", "client"]). Se não especificado, busca em todas as entidades.',
        required: false,
        items: {
          type: 'string',
        },
      },
      {
        name: 'limit',
        type: 'number',
        description: 'Número máximo de resultados (default: 10, max: 20).',
        required: false,
        default: 10,
      },
    ],
    outputSchema: z.object({
      count: z.number(),
      results: z.array(z.object({
        module: z.string(),
        entity: z.string(),
        id: z.string(),
        title: z.string(),
        description: z.string().optional(),
        score: z.number(),
        metadata: z.record(z.any()).optional(),
      })),
    }),
    requiresAuth: true,
    progressSupport: false,
  };
  
  async executeInternal(
    input: {
      query: string;
      modules?: string[];
      entities?: string[];
      limit?: number;
    },
    context: ToolExecutionContext
  ) {
    console.log(`[universal_search] Searching for: "${input.query}" in tenant ${context.tenantId}`);
    
    // Use intelligent search (combines textual + semantic)
    const results = await universalSearchService.intelligentSearch(
      input.query,
      context.tenantId,
      {
        modules: input.modules,
        entities: input.entities,
        limit: Math.min(input.limit || 10, 20), // Cap at 20
      }
    );
    
    // Format results for AssistME
    const formattedResults = results.map(result => ({
      module: result.module,
      entity: result.entity,
      id: result.id,
      title: result.title,
      description: result.description,
      score: result.score,
      metadata: result.metadata,
    }));
    
    console.log(`[universal_search] Found ${formattedResults.length} results`);
    
    return {
      count: formattedResults.length,
      results: formattedResults,
    };
  }
}

