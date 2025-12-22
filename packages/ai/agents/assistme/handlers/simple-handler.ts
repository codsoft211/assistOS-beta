/**
 * Simple Handler - Single-tool execution with minimal LLM
 * 
 * Target: 15% of queries, 1-2s latency
 * 
 * Approach:
 * 1. Extract intent + parameters via regex
 * 2. Map to single tool from registry
 * 3. Execute tool
 * 4. Format response with simple template (NO LLM for formatting)
 * 
 * MINIMAL LLM usage = Low cost, fast response
 */

import type { HybridResponse, HandlerOptions } from '../types';
import { HybridMode } from '../types';
import { toolRegistry } from '../../../tools/kernel';
import { cacheService } from '../../common/cache';

interface SimpleIntent {
  tool: string;
  parameters: Record<string, any>;
  confidence: number;
}

export class SimpleHandler {
  /**
   * Handle simple query with single tool execution
   */
  async handle(
    query: string,
    options: HandlerOptions
  ): Promise<HybridResponse> {
    const startTime = Date.now();
    const { context, onProgress } = options;

    onProgress?.('🔧 Modo Simple - Executando ferramenta\n');

    // STEP 1: Extract intent and parameters
    const intent = this.extractIntent(query);

    if (!intent) {
      return this.fallbackResponse(Date.now() - startTime, 'no_intent_detected');
    }

    onProgress?.(`🎯 Detetado: ${intent.tool}\n`);

    // STEP 2: Execute tool
    try {
      const toolResult = await toolRegistry.execute(
        intent.tool,
        intent.parameters,
        {
          tenantId: context.tenantId,
          userId: context.userId,
          ...(context.conversationId && { conversationId: context.conversationId }),
          environment: context.environment || 'production'
        },
        (progress, msg) => {
          onProgress?.(`  ▸ ${msg}\n`);
        }
      );

      const duration = Date.now() - startTime;

      if (!toolResult.success) {
        console.error(`[SimpleHandler] Tool execution failed:`, toolResult.error);
        return this.fallbackResponse(duration, toolResult.error?.message || 'tool_execution_failed');
      }

      // STEP 3: Format response with template
      const formattedResponse = this.formatResponse(intent.tool, toolResult.data, query);

      onProgress?.(`✅ Concluído!\n`);

      // Cache the response
      const cacheKey = cacheService.generateKey(context.tenantId, context.userId, query);
      await cacheService.set(cacheKey, formattedResponse, {
        mode: HybridMode.SIMPLE,
        ttl: 300, // 5 minutes (shorter TTL for data queries)
        tenantId: context.tenantId
      });

      return {
        content: formattedResponse,
        mode: HybridMode.SIMPLE,
        duration_ms: duration,
        tools_used: [intent.tool],
        cost_usd: 0, // No LLM usage
        metadata: {
          classification_confidence: intent.confidence
        }
      };

    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.error(`[SimpleHandler] Error:`, error);
      return this.fallbackResponse(duration, error.message);
    }
  }

  /**
   * Extract intent from query using pattern matching
   */
  private extractIntent(query: string): SimpleIntent | null {
    const lower = query.toLowerCase().trim();

    // LIST INVOICES
    if (/^(mostrar?|listar?|ver|show|list)\s+(minhas?|my|as)?\s*(fatura|invoice)/i.test(query)) {
      const status = this.extractStatus(query);
      const limit = this.extractLimit(query) || 10;

      return {
        tool: 'list_invoices',
        parameters: { status, limit },
        confidence: 0.9
      };
    }

    // GET INVOICE by ID/number
    if (/fatura\s+(INV-\d+|[A-Z0-9\-]+)|invoice\s+([A-Z0-9\-]+)/i.test(query)) {
      const match = query.match(/(?:fatura|invoice)\s+([A-Z0-9\-]+)/i);
      if (match) {
        return {
          tool: 'get_invoice',
          parameters: { invoice_id: match[1] },
          confidence: 0.95
        };
      }
    }

    // LIST CLIENTS
    if (/^(mostrar?|listar?|ver|show|list)\s+(meus|my|os)?\s*(cliente|customer|client)/i.test(query)) {
      const limit = this.extractLimit(query) || 10;

      return {
        tool: 'list_clients',
        parameters: { limit },
        confidence: 0.9
      };
    }

    // LIST TASKS
    if (/^(mostrar?|listar?|ver|show|list)\s+(minhas?|my|as)?\s*(tarefa|task)/i.test(query)) {
      const status = this.extractTaskStatus(query);
      const limit = this.extractLimit(query) || 10;

      return {
        tool: 'list_tasks',
        parameters: { status, limit },
        confidence: 0.9
      };
    }

    // CREATE TASK
    if (/^(criar|create|adicionar|add|nova?|new)\s+tarefa|task/i.test(query)) {
      const title = this.extractTaskTitle(query);

      if (title) {
        return {
          tool: 'create_task',
          parameters: { title },
          confidence: 0.85
        };
      }
    }

    // COUNT queries
    if (/^(quantas?|how many|count)\s+(fatura|invoice|cliente|customer|tarefa|task)/i.test(query)) {
      let entityType = 'records';
      if (/fatura|invoice/i.test(query)) entityType = 'invoices';
      if (/cliente|customer|client/i.test(query)) entityType = 'clients';
      if (/tarefa|task/i.test(query)) entityType = 'tasks';

      return {
        tool: `count_${entityType}`,
        parameters: {},
        confidence: 0.85
      };
    }

    // No intent detected
    return null;
  }

  /**
   * Extract status filter from query
   */
  private extractStatus(query: string): string | undefined {
    if (/pendente|pending|em aberto|open/i.test(query)) return 'pending';
    if (/pag[ao]|paid/i.test(query)) return 'paid';
    if (/atrasad[ao]|overdue|vencid[ao]/i.test(query)) return 'overdue';
    if (/cancelad[ao]|cancelled|canceled/i.test(query)) return 'cancelled';
    return undefined;
  }

  /**
   * Extract task status from query
   */
  private extractTaskStatus(query: string): string | undefined {
    if (/pendente|pending|todo|fazer/i.test(query)) return 'pending';
    if (/em progress|in progress|andamento/i.test(query)) return 'in_progress';
    if (/conclu[íi]d|completed|done|feita/i.test(query)) return 'completed';
    return undefined;
  }

  /**
   * Extract limit/count from query
   */
  private extractLimit(query: string): number | undefined {
    const match = query.match(/(\d+)\s*(últimas?|last|primeiras?|first)/i);
    if (match) {
      return parseInt(match[1], 10);
    }
    return undefined;
  }

  /**
   * Extract task title from query
   */
  private extractTaskTitle(query: string): string | null {
    // Extract text after "tarefa" or "task"
    const match = query.match(/(?:tarefa|task)\s+["']?(.+?)["']?$/i);
    if (match) {
      return match[1].trim();
    }

    // Extract text in quotes
    const quotesMatch = query.match(/["'](.+?)["']/);
    if (quotesMatch) {
      return quotesMatch[1].trim();
    }

    return null;
  }

  /**
   * Format tool response into human-readable text
   */
  private formatResponse(tool: string, data: any, originalQuery: string): string {
    // LIST responses
    if (tool === 'list_invoices' && Array.isArray(data)) {
      if (data.length === 0) {
        return `Não encontrei faturas com esses critérios. 📭`;
      }

      let response = `**Encontrei ${data.length} fatura(s):**\n\n`;

      data.forEach((invoice: any, idx: number) => {
        response += `${idx + 1}. **${invoice.invoice_number || invoice.id}**\n`;
        response += `   - Cliente: ${invoice.client_name || 'N/A'}\n`;
        response += `   - Valor: €${invoice.total || invoice.amount || 0}\n`;
        response += `   - Estado: ${this.translateStatus(invoice.status)}\n\n`;
      });

      return response;
    }

    if (tool === 'list_clients' && Array.isArray(data)) {
      if (data.length === 0) {
        return `Não encontrei clientes. 📭`;
      }

      let response = `**Encontrei ${data.length} cliente(s):**\n\n`;

      data.forEach((client: any, idx: number) => {
        response += `${idx + 1}. **${client.name}**\n`;
        response += `   - Email: ${client.email || 'N/A'}\n`;
        response += `   - Telefone: ${client.phone || 'N/A'}\n\n`;
      });

      return response;
    }

    if (tool === 'list_tasks' && Array.isArray(data)) {
      if (data.length === 0) {
        return `Não há tarefas pendentes! 🎉`;
      }

      let response = `**Tens ${data.length} tarefa(s):**\n\n`;

      data.forEach((task: any, idx: number) => {
        response += `${idx + 1}. ${task.title}\n`;
        response += `   - Estado: ${this.translateTaskStatus(task.status)}\n`;
        if (task.due_date) {
          response += `   - Prazo: ${task.due_date}\n`;
        }
        response += `\n`;
      });

      return response;
    }

    // GET responses
    if (tool === 'get_invoice' && data) {
      return `**Fatura ${data.invoice_number}**\n\n` +
             `Cliente: ${data.client_name}\n` +
             `Valor: €${data.total}\n` +
             `Estado: ${this.translateStatus(data.status)}\n` +
             `Data: ${data.issue_date}`;
    }

    // CREATE responses
    if (tool === 'create_task' && data) {
      return `✅ Tarefa criada com sucesso!\n\n` +
             `**${data.title}**\n` +
             `ID: ${data.id}`;
    }

    // COUNT responses
    if (tool.startsWith('count_')) {
      const count = typeof data === 'number' ? data : data?.count || 0;
      return `📊 Total: **${count}**`;
    }

    // Generic fallback
    return JSON.stringify(data, null, 2);
  }

  /**
   * Translate status to Portuguese
   */
  private translateStatus(status: string): string {
    const translations: Record<string, string> = {
      'pending': '⏳ Pendente',
      'paid': '✅ Paga',
      'overdue': '⚠️ Atrasada',
      'cancelled': '❌ Cancelada',
      'draft': '📝 Rascunho'
    };

    return translations[status] || status;
  }

  /**
   * Translate task status to Portuguese
   */
  private translateTaskStatus(status: string): string {
    const translations: Record<string, string> = {
      'pending': '📋 Pendente',
      'in_progress': '🔄 Em progresso',
      'completed': '✅ Concluída',
      'cancelled': '❌ Cancelada'
    };

    return translations[status] || status;
  }

  /**
   * Fallback response when simple handler can't process
   */
  private fallbackResponse(duration: number, error: string): HybridResponse {
    return {
      content: `Não consegui processar automaticamente. Vou usar o assistente completo...`,
      mode: HybridMode.SIMPLE,
      duration_ms: duration,
      cost_usd: 0,
      metadata: {
        classification_confidence: 0,
        error
      }
    };
  }
}

export const simpleHandler = new SimpleHandler();
