/**
 * Prompt Builder - Construção de prompts em camadas
 * 
 * Arquitetura:
 * Layer 1 (Core): ~150 tokens - Identidade AssistOS, princípios universais
 * Layer 2 (Role): ~250 tokens - AssistME vs AssistBuild específico
 * Layer 3 (Patterns): ~350 tokens - Conversation flows, decision trees
 * Layer 4 (Context): ~500 tokens - Context dinâmico just-in-time
 * 
 * TOTAL: 750 tokens (base) vs 2500 tokens (monolítico) = -70% overhead
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { platformCache, getCachedPlatformResources } from './platform-cache';

// Re-export cache utilities
export { platformCache, getCachedPlatformResources };

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROMPTS_DIR = __dirname;

// Cache de prompts para evitar leituras repetidas
const promptCache: Record<string, string> = {};

function readPrompt(filename: string): string {
  if (!promptCache[filename]) {
    try {
      const path = join(PROMPTS_DIR, filename);
      promptCache[filename] = readFileSync(path, 'utf-8');
    } catch (error) {
      console.error(`[PromptBuilder] Failed to read ${filename}:`, error);
      return '';
    }
  }
  return promptCache[filename];
}

export interface ConversationContext {
  // Flags para determinar se precisa Layer 4
  needsPlatformResources?: boolean;  // true se nova conversa sobre capacidades
  needsTenantState?: boolean;         // true se precisa estado operacional
  
  // Histórico recente
  messageCount?: number;              // Número de mensagens na conversa
  lastToolCalls?: string[];           // Últimas 3 tool calls executadas
  
  // Context específico (recomendado para cache)
  tenantId?: string;                  // ID do tenant (recomendado para cache)
  userId?: string;
}

export interface Layer4Context {
  platformResources?: any;    // Resultado de get_platform_resources
  tenantState?: any;           // Estado operacional do tenant
  recentActivity?: any;        // Atividade recente relevante
}

/**
 * Determina automaticamente se precisa injetar Layer 4
 * 
 * OTIMIZAÇÃO: Verifica cache primeiro para evitar tool calls desnecessários
 */
function needsContextLayer(ctx?: ConversationContext): boolean {
  if (!ctx) return false;
  
  // CACHE CHECK: Se tem cache válido, Layer 4 não precisa buscar novamente
  if (ctx.tenantId && platformCache.has(ctx.tenantId)) {
    console.log(`[PromptBuilder] Cache HIT - usando platform resources cached para tenant ${ctx.tenantId}`);
    return true; // Injeta Layer 4 com dados do cache (zero tool call!)
  }
  
  // Nova conversa (primeiras mensagens)
  if (ctx.messageCount !== undefined && ctx.messageCount <= 2) {
    return true;
  }
  
  // Flags explícitas
  if (ctx.needsPlatformResources || ctx.needsTenantState) {
    return true;
  }
  
  // Não usou get_platform_resources recentemente
  if (ctx.lastToolCalls && !ctx.lastToolCalls.includes('get_platform_resources')) {
    return true;
  }
  
  return false;
}

/**
 * Gera Layer 4 (Context) dinamicamente
 * 
 * OTIMIZAÇÃO: Tenta usar cache antes de usar dados passados
 * FIX: Sempre tenta cache, mesmo sem layer4 fornecida
 */
function generateContextLayer(layer4?: Layer4Context, tenantId?: string): string {
  const sections: string[] = ['\n\n---\n\n# Context Layer (Layer 4 - Dynamic)\n'];
  
  // Tentar usar cache se disponível (SEMPRE, mesmo sem layer4)
  let platformResources = layer4?.platformResources;
  if (!platformResources && tenantId) {
    platformResources = platformCache.get(tenantId);
    if (platformResources) {
      console.log(`[PromptBuilder] Using cached platform resources for Layer 4`);
    }
  }
  
  if (platformResources) {
    sections.push('## Platform Resources Available\n');
    sections.push('```json\n');
    sections.push(JSON.stringify(platformResources, null, 2));
    sections.push('\n```\n');
  }
  
  if (layer4?.tenantState) {
    sections.push('\n## Tenant State\n');
    sections.push('```json\n');
    sections.push(JSON.stringify(layer4.tenantState, null, 2));
    sections.push('\n```\n');
  }
  
  if (layer4?.recentActivity) {
    sections.push('\n## Recent Activity\n');
    sections.push(JSON.stringify(layer4.recentActivity, null, 2));
  }
  
  // Se não tem nenhum contexto, retorna vazio
  if (!platformResources && !layer4?.tenantState && !layer4?.recentActivity) {
    return '';
  }
  
  return sections.join('');
}

/**
 * Constrói prompt para AssistBuild
 * 
 * OTIMIZAÇÃO: Usa cache automaticamente se disponível
 */
export function buildAssistBuildPrompt(
  ctx?: ConversationContext,
  layer4?: Layer4Context
): string {
  const layers = [
    readPrompt('base-prompt.md'),           // Layer 1: Core (~150t)
    readPrompt('assistbuild-role.md'),      // Layer 2: Role (~250t)
    readPrompt('conversation-patterns.md'), // Layer 3: Patterns (~350t)
  ];
  
  // Layer 4: Context dinâmico (usa cache se disponível)
  if (needsContextLayer(ctx)) {
    layers.push(generateContextLayer(layer4, ctx?.tenantId));
  }
  
  return layers.join('\n\n---\n\n');
}

/**
 * Constrói prompt para AssistME
 * 
 * OTIMIZAÇÃO: Usa cache automaticamente se disponível
 */
export function buildAssistMePrompt(
  ctx?: ConversationContext,
  layer4?: Layer4Context
): string {
  const layers = [
    readPrompt('base-prompt.md'),           // Layer 1: Core (~150t)
    readPrompt('assistme-role.md'),         // Layer 2: Role (~250t)
    readPrompt('conversation-patterns.md'), // Layer 3: Patterns (~350t)
  ];
  
  // Layer 4: Context operacional (usa cache se disponível)
  if (needsContextLayer(ctx)) {
    layers.push(generateContextLayer(layer4, ctx?.tenantId));
  }
  
  return layers.join('\n\n---\n\n');
}

/**
 * Fallback quando get_platform_resources falha
 */
export function buildFallbackPrompt(agentType: 'assistbuild' | 'assistme'): string {
  const base = readPrompt('base-prompt.md');
  const role = agentType === 'assistbuild' 
    ? readPrompt('assistbuild-role.md')
    : readPrompt('assistme-role.md');
  
  const fallbackNote = `

⚠️ **AVISO**: Sistema de descoberta temporariamente indisponível.
- Não invente capacidades - seja honesto sobre não ter acesso completo
- Sugira verificar documentação ou contactar suporte para lista completa
- Foque em capacidades core que certamente existem
`;
  
  return [base, role, fallbackNote].join('\n\n---\n\n');
}

/**
 * Helper: Determina se a mensagem do utilizador é sobre capacidades
 */
export function isCapabilityQuery(message: string): boolean {
  const patterns = [
    /o que (podes|consegues) fazer/i,
    /quais (são )?as (tuas )?capacidades/i,
    /que funcionalidades/i,
    /integra(ção|r) com/i,
    /tens (integração|módulo)/i,
  ];
  
  return patterns.some(pattern => pattern.test(message));
}

/**
 * Helper: Determina contexto necessário baseado na mensagem
 */
export function determineContext(
  message: string,
  messageCount: number,
  lastToolCalls: string[]
): ConversationContext {
  return {
    needsPlatformResources: isCapabilityQuery(message) || messageCount <= 2,
    needsTenantState: messageCount > 5 && !lastToolCalls.includes('get_tenant_state'),
    messageCount,
    lastToolCalls,
  };
}
